/**
 * Walks every Pokémon in storage on an Android phone over `adb` and writes what it finds to a CSV: species, form,
 * costume, shiny, lucky, size, CP, HP, level, IVs and moves. Pokémon GO has no export, so this reads the screen the way
 * a person would — open the first Pokémon, read it, swipe to the next — with Tesseract doing the reading.
 *
 * The screen does not say everything outright, and each field comes from wherever it can be got most reliably:
 *
 * - **CP, HP, name, weight, height and types** are read off the detail screen, and **moves** off the same screen
 *   scrolled down.
 * - **IVs** are read off the appraisal bars, pixel by pixel.
 * - **Level and form** are worked out rather than read: CP and HP are fixed by base stats, IVs and level, so given the
 *   IVs exactly one level and one form (usually) make the numbers come out. See `inventory/game-master.mts`.
 * - **Shiny, lucky, costume, XXL and XXS** have no reliable text on the detail screen, so each one is a search instead.
 *   A pass with the game's own `shiny` search reads just the matching Pokémon, and the full pass marks the ones it
 *   recognises from that list. Searches keep the sort order, and a Pokémon is recognised by its name, CP, HP, weight
 *   and height together, which in practice nothing else in storage shares.
 *
 * Usage, from the repository root, with the phone plugged in, USB debugging on and Pokémon GO in English:
 *
 *   pnpm inventory scan [--out inventory.csv] [--limit N] [--skip N] [--no-launch] [--flags shiny,lucky,…]
 *                       [--no-moves] [--no-appraise] [--keep-screens DIR] [--config FILE] [--serial SERIAL]
 *   pnpm inventory snap [NAME]      save a screenshot of whatever is showing and print what each reader makes of it
 *   pnpm inventory parse FILE.png…  the same for screenshots already saved, with no phone needed
 *
 * `snap` and `parse` are the tools for fixing a misread: every tap position, swipe and delay the scan uses is in
 * `DEFAULTS` below and can be overridden from a JSON file passed as `--config`, with positions as fractions of the
 * screen so that one file suits any phone of the same shape.
 *
 * Automating input breaks Niantic's terms of service. This only reads, and moves at a person's pace, but the risk to
 * the account is the user's to weigh.
 */

import { Device, KEY, sleep } from './inventory/adb.mts';
import { loadGameData, type GameData, type IVs } from './inventory/game-master.mts';
import { centre, findLine, fold, ocr, type Line } from './inventory/ocr.mts';
import { decodePng, encodePng, type Image } from './inventory/png.mts';
import {
  DEFAULT_BAR_COLOURS,
  identify,
  isAppraisal,
  parseAppraisal,
  parseDetail,
  parseMoves,
  readLines,
  type BarColours,
  type Detail,
  type Moves,
} from './inventory/screens.mts';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { parseArgs } from 'node:util';

type Point = [number, number];

interface Config {
  package: string;
  /** Where to tap, as fractions of the screen's width and height. Used where OCR cannot find the control by name. */
  taps: {
    /** The Poké Ball on the map that opens the main menu. */
    mainMenu: Point;
    /**
     * The Pokémon button in that menu. Tapped blind rather than found by its label, because that label sits above the
     * icon rather than inside it and tapping it dismisses the menu.
     */
    pokemonButton: Point;
    /** The search box at the top of storage. */
    search: Point;
    /** The first Pokémon in the storage grid. */
    firstTile: Point;
    /** The menu button, bottom right of the detail screen, which holds Appraise. */
    detailMenu: Point;
    /** Somewhere harmless to tap to move the appraisal dialogue along and then close it. */
    advance: Point;
    /** The close button at the foot of the detail screen. */
    closeDetail: Point;
  };
  swipes: {
    /** From one Pokémon to the next. */
    next: [Point, Point];
    /** Down the detail screen to the moves, and back up. */
    scrollDown: [Point, Point];
    scrollUp: [Point, Point];
  };
  /** How long to let each animation settle before the next screenshot, in milliseconds. */
  waits: {
    launch: number;
    tap: number;
    swipe: number;
    scroll: number;
    menu: number;
    appraisal: number;
    search: number;
  };
  bars: BarColours;
}

const DEFAULTS: Config = {
  package: 'com.nianticlabs.pokemongo',
  taps: {
    mainMenu: [0.5, 0.91],
    pokemonButton: [0.25, 0.82],
    search: [0.5, 0.155],
    firstTile: [0.18, 0.27],
    detailMenu: [0.88, 0.92],
    advance: [0.5, 0.45],
    closeDetail: [0.5, 0.93],
  },
  swipes: {
    next: [
      [0.85, 0.3],
      [0.15, 0.3],
    ],
    scrollDown: [
      [0.5, 0.78],
      [0.5, 0.28],
    ],
    scrollUp: [
      [0.5, 0.35],
      [0.5, 0.9],
    ],
  },
  waits: { launch: 30000, tap: 900, swipe: 1100, scroll: 800, menu: 800, appraisal: 1500, search: 1500 },
  bars: DEFAULT_BAR_COLOURS,
};

/** The searches that answer the yes-or-no columns, by column. `size` is filled from the two size searches. */
const FLAGS = {
  shiny: 'shiny',
  lucky: 'lucky',
  costume: 'costume',
  xxl: 'xxl',
  xxs: 'xxs',
  shadow: 'shadow',
  purified: 'purified',
} as const;

type Flag = keyof typeof FLAGS;

const DEFAULT_FLAGS: Flag[] = ['shiny', 'lucky', 'costume', 'xxl', 'xxs'];

const COLUMNS = [
  'index',
  'species',
  'nickname',
  'dex',
  'form',
  'costume',
  'shiny',
  'lucky',
  'size',
  'shadow',
  'purified',
  'cp',
  'hp',
  'level',
  'attack_iv',
  'defense_iv',
  'stamina_iv',
  'iv_percent',
  'fast_move',
  'charged_move_1',
  'charged_move_2',
  'weight_kg',
  'height_m',
  'types',
  'notes',
] as const;

const CACHE = '.cache/inventory';

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'out': { type: 'string', default: 'inventory.csv' },
    'limit': { type: 'string' },
    'skip': { type: 'string' },
    'flags': { type: 'string' },
    'no-launch': { type: 'boolean', default: false },
    'no-moves': { type: 'boolean', default: false },
    'no-appraise': { type: 'boolean', default: false },
    'keep-screens': { type: 'string' },
    'config': { type: 'string' },
    'serial': { type: 'string' },
    'refresh': { type: 'boolean', default: false },
  },
});

const [command = 'help', ...rest] = positionals;
const config = loadConfig(options.config);

/** Everything each reader makes of one screenshot, for tuning. */
async function report(image: Image, data: GameData) {
  const lines = await readLines(image);

  for (const l of lines) {
    console.log(`  ${`${l.left},${l.top} ${l.width}×${l.height}`.padEnd(22)} ${l.text}`);
  }

  const detail = parseDetail(lines, data, image);
  const iv = isAppraisal(lines) ? parseAppraisal(lines, image, config.bars) : null;
  console.log('detail:', detail);
  console.log('moves:', parseMoves(lines, data));
  console.log('appraisal:', isAppraisal(lines) ? (iv ?? 'bars not found') : 'not an appraisal screen');
  console.log('identity:', identify(data, detail, iv));
}

async function scan() {
  const device = new Device(options.serial);
  await device.check();
  const data = await loadGameData(CACHE, options.refresh);
  const flags = options.flags === undefined ? DEFAULT_FLAGS : parseFlags(options.flags);
  const limit = options.limit === undefined ? Infinity : Number(options.limit);
  const skip = options.skip === undefined ? 0 : Number(options.skip);
  const screens = options['keep-screens'];
  const shot = await device.screenshot();
  const at = (p: Point): Point => [p[0] * shot.width, p[1] * shot.height];
  let searchBox: Point | null = null;
  let appraiseButton: Point | null = null;

  if (screens) {
    mkdirSync(screens, { recursive: true });
  }

  const keep = (name: string, image: Image) => {
    if (screens) {
      writeFileSync(join(screens, `${name}.png`), encodePng(image));
    }
  };

  const tap = async (p: Point, wait = config.waits.tap) => {
    await device.tap(p);
    await sleep(wait);
  };

  const swipe = async ([from, to]: [Point, Point], wait: number) => {
    await device.swipe(at(from), at(to));
    await sleep(wait);
  };

  /** Gets to the storage grid from wherever the game is: the map, a detail screen, or the grid already. */
  const toStorage = async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const image = await device.screenshot();
      const lines = await readLines(image);

      if (isStorage(lines)) {
        return lines;
      }

      if (isDetail(lines, data, image)) {
        await tap(at(config.taps.closeDetail));
        continue;
      }

      await tap(at(config.taps.mainMenu), config.waits.menu);
      await tap(at(config.taps.pokemonButton), config.waits.search);
    }

    throw new Error('could not find Pokémon storage; open it by hand and run again with --no-launch');
  };

  /** Types a search into storage's search box, replacing whatever was there, and answers the grid it leaves. */
  const search = async (term: string) => {
    let lines = await toStorage();
    searchBox ??= ((l) => (l ? centre(l) : null))(findLine(lines, /\bsearch\b/)) ?? at(config.taps.search);
    await tap(searchBox);
    await device.key(KEY.MOVE_END, ...Array<number>(40).fill(KEY.DEL));

    if (term) {
      await device.type(term);
    }

    await device.key(KEY.ENTER);
    await sleep(config.waits.search);
    lines = await readLines(await device.screenshot());

    // An empty box shows the Recent and Recommended suggestions over the grid, and Enter only takes the keyboard away;
    // Back closes them and leaves the unfiltered grid behind. Tapping a suggestion by accident searches for it, so the
    // panel has to go before anything else is tapped.
    if (findLine(lines, /^recommended$/)) {
      await device.key(KEY.BACK);
      await sleep(config.waits.search);
      lines = await readLines(await device.screenshot());
    }

    return lines;
  };

  interface Reading {
    detail: Detail;
    key: string | null;
    image: Image;
  }

  const readDetail = async (): Promise<Reading> => {
    for (let attempt = 0; ; attempt++) {
      const image = await device.screenshot();
      const detail = parseDetail(await readLines(image), data, image);
      const key = keyOf(detail);

      if (key || attempt === 1) {
        return { detail, key, image };
      }

      await sleep(config.waits.swipe);
    }
  };

  /** Opens the first Pokémon the grid shows, answering false when there is none — an empty search. */
  const openFirst = async (grid: readonly Line[]) => {
    const below = searchBox?.[1] ?? 0;
    const label = grid.find((l) => l.top > below && /^cp\s?\d/.test(fold(l.text)));
    await tap(
      label ? [centre(label)[0], label.top + label.height * 2.5] : at(config.taps.firstTile),
      config.waits.swipe,
    );

    // Through `readDetail` for its retry: the tile opens with an animation that outlasts one wait, and a screen read
    // while it is still running is indistinguishable from a grid with nothing in it.
    return (await readDetail()).key !== null;
  };

  const appraise = async (name: string): Promise<{ iv: IVs | null; note?: string }> => {
    await tap(at(config.taps.detailMenu), config.waits.menu);

    if (!appraiseButton) {
      const line = findLine(await ocr(await device.screenshot()), /apprais/);

      if (!line) {
        await device.key(KEY.BACK);
        await sleep(config.waits.menu);
        return { iv: null, note: 'no Appraise in the menu' };
      }

      appraiseButton = centre(line);
    }

    await tap(appraiseButton, config.waits.appraisal);
    let iv: IVs | null = null;
    let seen = false;

    // The team leader talks before the bars appear; each tap moves the dialogue along.
    for (let step = 0; step < 5 && !seen; step++) {
      const image = await device.screenshot();
      const lines = await ocr(image);

      if (isAppraisal(lines)) {
        seen = true;
        iv = parseAppraisal(lines, image, config.bars);
        keep(`${name}-appraisal`, image);
      } else {
        await tap(at(config.taps.advance), config.waits.appraisal);
      }
    }

    await tap(at(config.taps.advance), config.waits.appraisal);

    if (isAppraisal(await ocr(await device.screenshot()))) {
      await device.key(KEY.BACK);
      await sleep(config.waits.appraisal);
    }

    if (!seen) {
      // The button may have moved — a buddy's menu is longer than anyone else's — so find it again next time.
      appraiseButton = null;
      return { iv: null, note: 'appraisal did not open' };
    }

    return iv ? { iv } : { iv: null, note: 'appraisal bars not read' };
  };

  /**
   * Swipes through whatever the grid shows, from the first, calling `visit` for each until the swipe stops changing
   * anything. The last Pokémon is found by the swipe failing to move: the same one reads twice.
   */
  const walk = async (visit: (reading: Reading, index: number) => Promise<void>, max: number, from = 0) => {
    for (let i = 0; i < from; i++) {
      await swipe(config.swipes.next, config.waits.swipe / 2);
    }

    let previous: string | null = null;
    let misses = 0;

    for (let index = from; index < from + max; index++) {
      const reading = await readDetail();

      if (reading.key === null) {
        if (++misses >= 3) {
          console.error('  three unreadable screens in a row; stopping this pass');
          break;
        }
      } else if (reading.key === previous) {
        break;
      } else {
        misses = 0;
      }

      previous = reading.key ?? previous;
      await visit(reading, index);
      await swipe(config.swipes.next, config.waits.swipe);
    }

    await tap(at(config.taps.closeDetail));
  };

  if (!options['no-launch']) {
    console.error('Launching Pokémon GO');
    await device.launch(config.package);
    await sleep(config.waits.launch);
  }

  // The flag passes come first, so that the full pass can write each row complete as it goes.
  const marked = new Map<Flag, Marks>();

  for (const flag of flags) {
    const marks = new Marks();
    const grid = await search(FLAGS[flag]);

    if (await openFirst(grid)) {
      await walk(async ({ detail }) => marks.add(detail), Infinity);
    }

    console.error(`${flag}: ${marks.size}`);
    marked.set(flag, marks);
  }

  const out = options.out;

  if (skip === 0 || !existsSync(out)) {
    writeFileSync(out, `${COLUMNS.join(',')}\n`);
  }

  const grid = await search('');

  if (!(await openFirst(grid))) {
    throw new Error('storage looks empty, or the first Pokémon did not open; try `pnpm inventory snap` to see why');
  }

  let written = 0;
  const started = Date.now();

  await walk(
    async ({ detail, image }, index) => {
      const name = String(index + 1).padStart(5, '0');
      const notes: string[] = [];
      let moves: Moves = { fast: null, charged: [] };
      let iv: IVs | null = null;
      keep(`${name}-detail`, image);

      if (detail.cp === null || detail.hp === null) {
        notes.push('detail screen not read');
      }

      let reading: Promise<Moves> | null = null;

      if (!options['no-moves']) {
        await swipe(config.swipes.scrollDown, config.waits.scroll);
        const scrolled = await device.screenshot();
        keep(`${name}-moves`, scrolled);
        // Read while the phone scrolls back and appraises, since nothing that follows depends on the moves.
        reading = ocr(scrolled).then((lines) => parseMoves(lines, data));
        await swipe(config.swipes.scrollUp, config.waits.scroll);
      }

      if (!options['no-appraise']) {
        const result = await appraise(name);
        iv = result.iv;

        if (result.note) {
          notes.push(result.note);
        }
      }

      if (reading) {
        moves = await reading;

        if (moves.fast === null || moves.charged.length === 0) {
          notes.push('moves not fully read');
        }
      }

      const id = identify(data, detail, iv);
      const flag = (f: Flag) => (flags.includes(f) ? (marked.get(f)?.take(detail) ? 'yes' : 'no') : '');
      const size = flag('xxl') === 'yes' ? 'XXL' : flag('xxs') === 'yes' ? 'XXS' : '';
      const total = iv ? iv.attack + iv.defense + iv.stamina : null;

      const row: Record<(typeof COLUMNS)[number], string | number | null> = {
        index: index + 1,
        species: id.form?.species ?? detail.name,
        nickname: id.nickname,
        dex: id.form?.dex ?? null,
        form: id.form?.form ?? null,
        costume: flag('costume'),
        shiny: flag('shiny'),
        lucky: flag('lucky'),
        size,
        shadow: flag('shadow'),
        purified: flag('purified'),
        cp: detail.cp,
        hp: detail.hp,
        level: id.levels.join(' / '),
        attack_iv: iv?.attack ?? null,
        defense_iv: iv?.defense ?? null,
        stamina_iv: iv?.stamina ?? null,
        iv_percent: total === null ? null : Math.round((total / 45) * 1000) / 10,
        fast_move: moves.fast,
        charged_move_1: moves.charged[0] ?? null,
        charged_move_2: moves.charged[1] ?? null,
        weight_kg: detail.weightKg,
        height_m: detail.heightM,
        types: detail.types.join(' / '),
        notes: [...notes, ...id.notes].join('; '),
      };

      appendFileSync(out, `${COLUMNS.map((c) => csv(row[c])).join(',')}\n`);
      written++;

      const each = (Date.now() - started) / written / 1000;
      const ivText = iv ? `${iv.attack}/${iv.defense}/${iv.stamina}` : '?';
      console.error(
        `#${index + 1} ${row.species ?? '?'} CP ${detail.cp ?? '?'} ${ivText} L${row.level || '?'}` +
          ` (${each.toFixed(1)}s each)${row.notes ? ` — ${row.notes}` : ''}`,
      );
    },
    limit,
    skip,
  );

  console.error(`Wrote ${written} Pokémon to ${out}`);
}

/**
 * The Pokémon a flag search found, held as a multiset of keys so that each one marks exactly one row of the full pass.
 * A looser key without the name is kept beside it, since a name is the field OCR is likeliest to read two ways.
 */
class Marks {
  readonly #exact = new Map<string, number>();
  readonly #loose = new Map<string, number>();
  size = 0;

  add(detail: Detail) {
    const key = keyOf(detail);

    if (key) {
      bump(this.#exact, key, 1);
      bump(this.#loose, looseKeyOf(detail), 1);
      this.size++;
    }
  }

  /** Whether this Pokémon was in the search, using up the match so a twin is not marked by the same entry. */
  take(detail: Detail): boolean {
    const key = keyOf(detail);
    const loose = looseKeyOf(detail);

    if (key && (this.#exact.get(key) ?? 0) > 0) {
      bump(this.#exact, key, -1);
      bump(this.#loose, loose, -1);
      return true;
    }

    if (key && (this.#loose.get(loose) ?? 0) > 0) {
      bump(this.#loose, loose, -1);
      return true;
    }

    return false;
  }
}

function bump(map: Map<string, number>, key: string, by: number) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function keyOf(detail: Detail): string | null {
  if (detail.cp === null || detail.hp === null) {
    return null;
  }

  return `${fold(detail.name ?? '')}|${looseKeyOf(detail)}`;
}

function looseKeyOf(detail: Detail): string {
  return [detail.cp, detail.hp, detail.weightKg, detail.heightM].join('|');
}

function isStorage(lines: readonly Line[]): boolean {
  return findLine(lines, /\beggs?\b/) !== undefined || findLine(lines, /^search\b/) !== undefined;
}

function isDetail(lines: readonly Line[], data: GameData, image: Image): boolean {
  return keyOf(parseDetail(lines, data, image)) !== null;
}

function csv(value: string | number | null): string {
  const text = value === null ? '' : String(value);

  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseFlags(list: string): Flag[] {
  const names = list.split(',').filter(Boolean);
  const unknown = names.filter((n) => !(n in FLAGS));

  if (unknown.length > 0) {
    throw new Error(`unknown flag ${unknown.join(', ')}; the choices are ${Object.keys(FLAGS).join(', ')}`);
  }

  return names as Flag[];
}

/** `DEFAULTS` with a JSON file laid over it one level deep, so a file can change one tap and restate nothing else. */
function loadConfig(path: string | undefined): Config {
  if (path === undefined) {
    return DEFAULTS;
  }

  const overrides = JSON.parse(readFileSync(path, 'utf8')) as Partial<Record<keyof Config, object | string>>;

  return {
    package: typeof overrides.package === 'string' ? overrides.package : DEFAULTS.package,
    taps: { ...DEFAULTS.taps, ...(overrides.taps as Partial<Config['taps']>) },
    swipes: { ...DEFAULTS.swipes, ...(overrides.swipes as Partial<Config['swipes']>) },
    waits: { ...DEFAULTS.waits, ...(overrides.waits as Partial<Config['waits']>) },
    bars: { ...DEFAULTS.bars, ...(overrides.bars as Partial<BarColours>) },
  };
}

// Last, so that everything above — the `Marks` class in particular — is initialised before anything runs.
if (command === 'scan') {
  await scan();
} else if (command === 'snap') {
  const device = new Device(options.serial);
  await device.check();
  const image = await device.screenshot();
  const path = join(CACHE, 'snaps', `${rest[0] ?? new Date().toISOString().replaceAll(':', '-')}.png`);
  mkdirSync(join(CACHE, 'snaps'), { recursive: true });
  writeFileSync(path, encodePng(image));
  console.log(`Saved ${path} (${image.width}×${image.height})`);
  await report(image, await loadGameData(CACHE, options.refresh));
} else if (command === 'parse' && rest.length > 0) {
  const data = await loadGameData(CACHE, options.refresh);

  for (const path of rest) {
    console.log(`\n=== ${basename(path)}`);
    await report(decodePng(readFileSync(path)), data);
  }
} else {
  console.error(
    readFileSync(new URL(import.meta.url), 'utf8')
      .match(/Usage[^]*?\n \*\n[^]*?\n \*\n/)?.[0]
      .replace(/^ \* ?/gm, ''),
  );
  process.exit(command === 'help' ? 0 : 1);
}
