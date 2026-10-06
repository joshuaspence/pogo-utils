/**
 * Walks every Pokémon in storage on an Android phone over `adb` and writes what it finds to a CSV: species, form,
 * costume, shiny, lucky, size, CP, HP, level, IVs and moves. Pokémon GO has no export, so this reads the screen the way
 * a person would — open the first Pokémon, read it, swipe to the next — with Tesseract doing the reading.
 *
 * The screen does not say everything outright, and each field comes from wherever it can be got most reliably:
 *
 * - **CP, HP, name, weight, height and types** are read off the detail screen, and **moves** off the same screen
 *   scrolled down.
 * - **Level and the three IVs** are read off PGSharp's own overlay, which states them outright over the artwork. The
 *   scanner therefore needs PGSharp rather than the stock client; nothing else on the screen gives the IVs without
 *   walking the appraisal dialogue for every Pokémon.
 * - **Form** is worked out rather than read: HP is fixed by base stamina, the stamina IV and the level, so given the
 *   overlay's numbers only some forms make it come out. See `inventory/game-master.mts`.
 * - **Gender, whether it is a favourite and whether it is XXL or XXS** are read off the detail screen: the symbol
 *   beside the HP, the star at the top right, and the gold badge above the height.
 * - **Tags** are chips under the HP, read off the same screen; `--tags` names the ones to expect so that what is read
 *   can be matched to them.
 * - **Shiny, lucky and costume** say nothing on the detail screen at all, so each one is a search instead. A pass with
 *   the game's own `shiny` search reads just the matching Pokémon, and the full pass marks the ones it recognises from
 *   that list. Searches keep the sort order, and a Pokémon is recognised by its name, HP, weight, height and IVs
 *   together, which in practice nothing else in storage shares.
 *
 * Usage, from the repository root, with the phone plugged in, USB debugging on and Pokémon GO in English:
 *
 *   pnpm inventory scan [--out inventory.csv] [--limit N] [--skip N] [--flags shiny,lucky,…]
 *                       [--tags 'Trade to 0xNULL,…'] [--no-moves] [--keep-screens DIR] [--config FILE]
 *                       [--serial SERIAL]
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

import { Device, KEY } from '../src/tools/inventory/adb.mts';
import { iconsFor, signatureOf, type Signature } from '../src/tools/inventory/artwork.mts';
import { parseDetail, readLines, type Detail } from '../src/tools/inventory/detail.mts';
import { CACHE, closest, loadGameData, type Form, type GameData } from '../src/tools/inventory/game-master.mts';
import { identify, type Identity } from '../src/tools/inventory/identify.mts';
import { parseMoves, type Moves } from '../src/tools/inventory/moves.mts';
import { centre, findLine, fold, ocr, type Line } from '../src/tools/inventory/ocr.mts';
import { findOverlay, readOverlay, widen, type Overlay, type OverlayBox } from '../src/tools/inventory/overlay.mts';
import { decodePng, difference, encodePng, type Image } from '../src/tools/inventory/png.mts';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
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
    search: number;
  };
  /**
   * Where PGSharp's overlay sits, if it is known. Left out, the scanner finds it on the first Pokémon whose box it can
   * make out and uses that for the rest of the run, which is what lets one configuration suit any phone.
   */
  overlay?: OverlayBox;
}

const DEFAULTS: Config = {
  package: 'com.nianticlabs.pokemongo',
  taps: {
    mainMenu: [0.5, 0.91],
    pokemonButton: [0.25, 0.82],
    search: [0.5, 0.155],
    firstTile: [0.18, 0.27],
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
  waits: { launch: 30000, tap: 900, swipe: 1100, scroll: 800, menu: 800, search: 1500 },
};

/** The searches that answer the yes-or-no columns, by column. `size` is filled from the two size searches. */
const FLAGS = {
  shiny: 'shiny',
  lucky: 'lucky',
  costume: 'costume',
  shadow: 'shadow',
  purified: 'purified',
} as const;

type Flag = keyof typeof FLAGS;

/**
 * `xxl` and `xxs` are not among these any more: the detail screen wears a gold badge saying which, so the size is read
 * from the screen the scan is already looking at rather than bought with a search of its own. Checked against the
 * game's own `xxl` search, which marked the same Applin — 5/2/15 at 0.33m — that the badge does.
 */
const DEFAULT_FLAGS: Flag[] = ['shiny', 'lucky', 'costume'];

const COLUMNS = [
  'index',
  'species',
  'nickname',
  'dex',
  'form',
  'gender',
  'favourite',
  'tags',
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

/** How many times one detail screen is read before its reading is taken as final. */
const READ_ATTEMPTS = 3;

/**
 * The band a screen is watched for movement in, and how much of it may still differ for it to count as still. The
 * game's own panel, since the artwork above it holds an animated Pokémon that never stops and the status bar ticks
 * with the clock. Measured through one swipe: 31%, then 6.2%, then 0.54% and steady, so anything between settles it.
 */
const SETTLE_BAND = { from: 0.34, to: 0.95 };
const SETTLE_CHANGE = 0.02;
const SETTLE_ATTEMPTS = 4;

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'out': { type: 'string', default: 'inventory.csv' },
    'limit': { type: 'string' },
    'skip': { type: 'string' },
    'flags': { type: 'string' },
    'tags': { type: 'string' },
    'no-moves': { type: 'boolean', default: false },
    'keep-screens': { type: 'string' },
    'config': { type: 'string' },
    'serial': { type: 'string' },
    'refresh': { type: 'boolean', default: false },
  },
});

const [command = 'help', ...rest] = positionals;
const config = loadConfig(options.config);

/**
 * The artwork a screenshot shows, for the forms whose numbers are identical. PGSharp's overlay is drawn over the
 * artwork, so where its box was found that is the floor to start below — a fraction written down instead would be one
 * phone's.
 */
function artworkIn(image: Image, box: OverlayBox | null, icons: ReadonlyMap<Form, Signature>) {
  const signature = signatureOf(image, box ? box.y + box.height : undefined);

  return signature ? { signature, icons } : undefined;
}

/** Everything each reader makes of one screenshot, for tuning. */
async function report(image: Image, data: GameData, icons: ReadonlyMap<Form, Signature>) {
  const lines = await readLines(image);

  for (const l of lines) {
    console.log(`  ${`${l.left},${l.top} ${l.width}×${l.height}`.padEnd(22)} ${l.text}`);
  }

  const detail = await parseDetail(lines, data, image);
  const found = config.overlay
    ? { box: config.overlay, overlay: await readOverlay(image, config.overlay) }
    : await findOverlay(image);
  const box = found?.box ?? null;
  const overlay = found?.overlay ?? null;
  const id = identify(data, detail, overlay, artworkIn(image, box, icons));
  console.log('detail:', detail);
  console.log('moves:', await parseMoves(lines, data, id.form, image));
  console.log('overlay box:', box ?? 'not found; is PGSharp running, and is a Pokémon open?');
  console.log('overlay:', overlay ?? 'nothing read');
  // The form carries its whole move pool now, which prints as a column of `[Object]` and buries everything worth
  // reading; the names are what a person tuning this wants to see anyway.
  console.log('identity:', {
    ...id,
    form: id.form && { ...id.form, moves: id.form.moves.map((m) => m.name).join(', ') },
  });
}

async function scan() {
  const device = new Device(options.serial);
  await device.check();
  const data = await loadGameData(CACHE, options.refresh);
  const icons = await iconsFor(CACHE, data, options.refresh);
  const flags = options.flags === undefined ? DEFAULT_FLAGS : parseFlags(options.flags);
  // The chips under the HP say which tags a Pokémon carries, so this is a vocabulary rather than a list to search for:
  // the names are the user's own, and only something to match against can say that `Shiny SJ` is the `Shiny` chip with
  // its `✦` read as letters. Storage's own TAGS tab is where they come from.
  const tags = (options.tags ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  const limit = options.limit === undefined ? Infinity : Number(options.limit);
  const skip = options.skip === undefined ? 0 : Number(options.skip);
  const screens = options['keep-screens'];
  const shot = await device.screenshot();
  const at = (p: Point): Point => [p[0] * shot.width, p[1] * shot.height];
  let searchBox: Point | null = null;
  let overlayBox: OverlayBox | null = config.overlay ?? null;
  // A phone with PGSharp's overlay switched off would otherwise sweep for it on every Pokémon, for ever.
  let searchesLeft = 5;

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

      if (await isDetail(lines, data, image)) {
        await tap(at(config.taps.closeDetail));
        continue;
      }

      await tap(at(config.taps.mainMenu), config.waits.menu);
      await tap(at(config.taps.pokemonButton), config.waits.search);
    }

    // Opening it by hand is enough on its own now: storage showing means the game is in front, so the next run reads
    // that off the phone and neither relaunches it nor waits for a cold start it is not doing.
    throw new Error('could not find Pokémon storage; open it by hand and run again');
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

    // Clearing the box uncovers the Recent and Recommended suggestions, and Enter only takes the keyboard away; Back
    // closes them and leaves the unfiltered grid behind. An empty search matches everything, so a grid with nothing in
    // it is that panel and can be nothing else — which is a surer test than the panel's own headings, since PGSharp's
    // toolbar sits down the left edge over their first letters and `Recent` reads as `serccemt` behind it. Getting
    // this wrong is expensive rather than merely unhelpful: `openFirst` then falls back to its blind tap, which lands
    // on the first Recent chip and quietly scans whatever was searched for last.
    if (term === '' && !tileLabel(lines)) {
      await device.key(KEY.BACK);
      await sleep(config.waits.search);
      lines = await readLines(await device.screenshot());
    }

    return lines;
  };

  interface Reading {
    detail: Detail;
    overlay: Overlay | null;
    /** Worked out while reading, since a reading is only accepted once something fits it; the row writer reuses it. */
    id: Identity;
    key: string | null;
    image: Image;
  }

  /**
   * A screenshot of a screen that has stopped moving, which is what a fixed wait after a swipe can only guess at. The
   * cost is one extra screenshot where the screen was already still, and the gain is that a scan slowed down by
   * anything — a phone thinking, an animation that ran long — waits for it rather than reading through it.
   */
  const settled = async (): Promise<Image> => {
    let previous = await device.screenshot();

    for (let attempt = 1; attempt < SETTLE_ATTEMPTS; attempt++) {
      const image = await device.screenshot();

      if (difference(previous, image, SETTLE_BAND.from, SETTLE_BAND.to) < SETTLE_CHANGE) {
        return image;
      }

      previous = image;
    }

    return previous;
  };

  /**
   * PGSharp's overlay, with the box it sits in found on the way if it is not known yet. The box does not move between
   * Pokémon — only between phones — so it is worth finding once and keeping, which is the difference between a sweep
   * of the upper screen and one crop. Only a box that actually yielded a reading is kept: one that merely looked
   * right would go on being wrong for every Pokémon after it, where not keeping it costs another sweep.
   */
  const overlayOf = async (image: Image): Promise<Overlay | null> => {
    if (overlayBox) {
      const overlay = await readOverlay(image, overlayBox);

      if (overlay || searchesLeft <= 0) {
        return overlay;
      }

      // A box tightened on one Pokémon clips a longer line on another — a three digit percentage is a character wider,
      // and two of twenty-five captures missed for exactly that. So a miss earns one sweep, and the box is widened to
      // cover both rather than swapped, which converges instead of flipping between the two Pokémon that disagree.
      searchesLeft--;
      const wider = await findOverlay(image);

      if (wider) {
        overlayBox = widen(overlayBox, wider.box);
      }

      return wider?.overlay ?? null;
    }

    if (searchesLeft <= 0) {
      return null;
    }

    searchesLeft--;
    const found = await findOverlay(image);

    if (found) {
      overlayBox = found.box;
      console.error(`  found PGSharp's overlay at ${JSON.stringify(found.box)}`);
    }

    return found?.overlay ?? null;
  };

  /**
   * One detail screen: the game's own text, and PGSharp's overlay over it. A screen still settling reads as a Pokémon
   * with no HP at all, or as one whose overlay has not been drawn yet, so both are worth another look rather than one
   * — a single bad read costs a whole member of a flag pass, and a member missed there is a Pokémon the full pass will
   * never learn was in the search. An `xxl` pass over a search the game said held five marked four, and the one it
   * dropped was the only one of them the full pass went on to read.
   */
  const readDetail = async (): Promise<Reading> => {
    for (let attempt = 0; ; attempt++) {
      const image = await settled();
      const detail = await parseDetail(await readLines(image), data, image);
      // Only a detail screen is worth a sweep. The sweeps are rationed, and an empty search's grid or a tile still
      // opening would otherwise spend them all before the first Pokémon, leaving every row without IVs.
      const overlay = detail.hp === null ? null : await overlayOf(image);
      const key = keyOf(detail, overlay);
      const id = identify(data, detail, overlay, artworkIn(image, overlayBox, icons));
      // Where no overlay has been found at all there is nothing to wait for, and insisting would cost three reads of
      // every Pokémon on a phone that is not running PGSharp. A form that fits is the other half: the name, the types,
      // the HP and the IVs agreeing is what a half-read screen cannot fake, and is a surer test than any one of them.
      const whole = key !== null && (overlay !== null || overlayBox === null) && id.form !== null;

      if (whole || attempt === READ_ATTEMPTS - 1) {
        return { detail, overlay, id, key, image };
      }

      await sleep(config.waits.swipe);
    }
  };

  /**
   * The first Pokémon's CP label in a grid, which doubles as how a grid is told from the suggestions panel drawn over
   * it: the panel carries no CP anywhere.
   */
  const tileLabel = (lines: readonly Line[]) =>
    lines.find((l) => l.top > (searchBox?.[1] ?? 0) && /^cp\s?\d/.test(fold(l.text)));

  /**
   * Opens the first Pokémon the grid shows, answering false when there is none — a search that matched nothing.
   *
   * The row comes from the grid and the column from the configuration, which is not a compromise but the right split.
   * How far down the first row sits depends on whether a search is showing, so it has to be read; which column is
   * first does not, since the grid is three even columns and 0.18 of the width lands in the leftmost of them on both
   * phones tried. Taking the column from the label as well is what the code did, and it opened the *second* Pokémon
   * whenever the first one's CP failed to OCR — in an `xxl` grid of five, the top row's only legible label was the
   * middle tile's, so the walk began one along and marked four. One short is the hardest kind of wrong to notice.
   */
  const openFirst = async (grid: readonly Line[]) => {
    const label = tileLabel(grid);
    await tap(
      label ? [at(config.taps.firstTile)[0], label.top + label.height * 2.5] : at(config.taps.firstTile),
      config.waits.swipe,
    );

    // Through `readDetail` for its retry: the tile opens with an animation that outlasts one wait, and a screen read
    // while it is still running is indistinguishable from a grid with nothing in it.
    return (await readDetail()).key !== null;
  };

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

  // Launched only where it is not already in front, which is the phone's answer to give rather than the user's: a game
  // running and a game showing are different states, and only the second is one `toStorage` can start from. A game in
  // the background still needs the launch to bring it forward — skipping it there taps the launcher instead, three
  // times over, and reports that storage cannot be found. The wait goes with the launch, since thirty seconds is what a
  // cold start costs and a game already drawn is past it; measured, a resume takes the focus back in 676ms.
  if ((await device.focused()) === config.package) {
    console.error('Pokémon GO is already in front');
  } else {
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
      await walk(async ({ detail, overlay }) => marks.add(detail, overlay), Infinity);
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
    async ({ detail, overlay, id, image }, index) => {
      const name = String(index + 1).padStart(5, '0');
      const notes: string[] = [];
      let moves: Moves = { fast: null, charged: [] };
      const iv = overlay?.iv ?? null;
      keep(`${name}-detail`, image);

      if (detail.hp === null) {
        notes.push('detail screen not read');
      }

      if (overlay === null) {
        notes.push(overlayBox ? 'overlay not read' : 'no PGSharp overlay found; is its IV display switched on?');
      }

      let reading: Promise<Moves> | null = null;

      if (!options['no-moves']) {
        await swipe(config.swipes.scrollDown, config.waits.scroll);
        const scrolled = await device.screenshot();
        keep(`${name}-moves`, scrolled);
        // Read while the phone scrolls back, since nothing that follows depends on the moves. Awaited with the swipe, so
        // that a read failing before the phone is back is a rejection here rather than an unhandled one.
        reading = ocr(scrolled).then((lines) => parseMoves(lines, data, id.form, scrolled));
        await Promise.all([reading, swipe(config.swipes.scrollUp, config.waits.scroll)]);
      }

      if (reading) {
        moves = await reading;

        if (moves.fast === null || moves.charged.length === 0) {
          notes.push('moves not fully read');
        }
      }

      const flag = (f: Flag) => (flags.includes(f) ? (marked.get(f)?.take(detail, overlay) ? 'yes' : 'no') : '');
      // A chip that matches nothing named is kept as it read rather than dropped, since a misread is worth seeing.
      const carried = detail.tags.map((t) => (tags.length > 0 ? (closest(t, tags, (n) => n, 0.3) ?? t) : t));
      const total = iv ? iv.attack + iv.defense + iv.stamina : null;

      const row: Record<(typeof COLUMNS)[number], string | number | null> = {
        index: index + 1,
        species: id.form?.species ?? detail.name,
        nickname: id.nickname,
        dex: id.form?.dex ?? null,
        form: id.form?.form ?? null,
        gender: detail.gender,
        favourite: detail.favourite ? 'yes' : 'no',
        tags: carried.join('; '),
        costume: flag('costume'),
        shiny: flag('shiny'),
        lucky: flag('lucky'),
        size: detail.size,
        shadow: flag('shadow'),
        purified: flag('purified'),
        cp: id.cp ?? detail.cp,
        hp: detail.hp,
        level: id.levels.join(' / '),
        attack_iv: iv?.attack ?? null,
        defense_iv: iv?.defense ?? null,
        stamina_iv: iv?.stamina ?? null,
        iv_percent: total === null ? null : Math.round((total / 45) * 1000) / 10,
        fast_move: moves.fast,
        charged_move_1: moves.charged[0] ?? null,
        charged_move_2: moves.charged[1] ?? null,
        weight_kg: detail.weight,
        height_m: detail.height,
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

  add(detail: Detail, overlay: Overlay | null) {
    const key = keyOf(detail, overlay);

    if (key) {
      bump(this.#exact, key, 1);
      bump(this.#loose, looseKeyOf(detail, overlay), 1);
      this.size++;
    }
  }

  /** Whether this Pokémon was in the search, using up the match so a twin is not marked by the same entry. */
  take(detail: Detail, overlay: Overlay | null): boolean {
    const key = keyOf(detail, overlay);
    const loose = looseKeyOf(detail, overlay);

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

/**
 * What identifies one Pokémon across two passes. CP used to be half of this and is not any more: it is white over the
 * artwork and reads perhaps a quarter of the time, so requiring it made every screen unreadable and stopped a walk
 * after three. The overlay's IVs take its place and discriminate better — HP, weight, height and 15/15/15 together are
 * shared by almost nothing — and HP alone is what a key now needs to exist at all.
 */
function keyOf(detail: Detail, overlay: Overlay | null): string | null {
  if (detail.hp === null) {
    return null;
  }

  return `${fold(detail.name ?? '')}|${looseKeyOf(detail, overlay)}`;
}

/** The same without the name, so a nickname read differently in two passes still matches. */
function looseKeyOf(detail: Detail, overlay: Overlay | null): string {
  const iv = overlay ? `${overlay.iv.attack}/${overlay.iv.defense}/${overlay.iv.stamina}` : '';

  return [detail.hp, detail.weight, detail.height, iv].join('|');
}

function isStorage(lines: readonly Line[]): boolean {
  return findLine(lines, /\beggs?\b/) !== undefined || findLine(lines, /^search\b/) !== undefined;
}

/** Whether a screen is a detail screen, asked without reading the overlay, which costs a crop and a Tesseract run. */
async function isDetail(lines: readonly Line[], data: GameData, image: Image): Promise<boolean> {
  return (await parseDetail(lines, data, image)).hp !== null;
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
    overlay: (overrides.overlay as OverlayBox | undefined) ?? DEFAULTS.overlay,
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
  const data = await loadGameData(CACHE, options.refresh);
  await report(image, data, await iconsFor(CACHE, data, options.refresh));
} else if (command === 'parse' && rest.length > 0) {
  const data = await loadGameData(CACHE, options.refresh);
  const icons = await iconsFor(CACHE, data, options.refresh);

  for (const path of rest) {
    console.log(`\n=== ${basename(path)}`);
    await report(decodePng(readFileSync(path)), data, icons);
  }
} else {
  console.error(
    readFileSync(new URL(import.meta.url), 'utf8')
      .match(/Usage[^]*?\n \*\n[^]*?\n \*\n/)?.[0]
      .replace(/^ \* ?/gm, ''),
  );
  process.exit(command === 'help' ? 0 : 1);
}
