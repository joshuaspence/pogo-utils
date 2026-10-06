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
 *                       [--tags 'Trade to 0xNULL,…'] [--no-moves] [--scroll] [--keep-screens DIR]
 *                       [--config FILE] [--serial SERIAL] [--refresh]
 *   pnpm inventory snap [--verbose] [--refresh] [--config FILE] [--serial SERIAL] [NAME]
 *                       save a screenshot of whatever is showing, and a stitch of the whole screen beside it, and print
 *                       what each reader makes of the screenshot; fails unless it is a detail screen carrying PGSharp's
 *                       overlay
 *   pnpm inventory parse [--verbose] [--refresh] [--config FILE] FILE.png…
 *                       the same for screenshots already saved, with no phone needed
 *   Each line lists the flags that command acts on, and a flag handed to a command whose line omits it is refused
 *   rather than ignored. Why a flag is on the lines it is on belongs with `HONOURED` below, not here.
 *
 * A scroll capture keeps dragging the screen up and taking a screenshot until it stops moving, then stitches the frames
 * into one tall image, which is how a screen longer than the phone is seen whole. `snap` always takes one, as
 * `NAME-scrolled.png`; a scan takes one where `--scroll` asks for it, reading the moves from it rather than from a
 * single screenshot taken part way down. The stitched image is **not** given to the other readers, and that is a limit
 * rather than an oversight — the star corner, the overlay sweep, the tag band and the artwork are each anchored on a
 * fraction of the image's height, so a frame three times taller moves every one of them. `parseMoves` is the one reader
 * that is not, being anchored on the `GYMS & RAIDS` line.
 *
 * `snap` and `parse` are the tools for fixing a misread: every tap position, swipe and delay the scan uses is in
 * `DEFAULTS` below and can be overridden from a JSON file passed as `--config`, with positions as fractions of the
 * screen so that one file suits any phone of the same shape. Both print what each reader made of the screen, and
 * `--verbose` adds the lines OCR found with their boxes — which is what separates a field left empty because no text
 * was read there from one left empty because a reader anchored on the wrong line.
 *
 * Automating input breaks Niantic's terms of service. This only reads, and moves at a person's pace, but the risk to
 * the account is the user's to weigh.
 */

import { Device, KEY } from '../src/tools/inventory/adb.mts';
import { iconsFor, signatureOf, type Signature } from '../src/tools/inventory/artwork.mts';
import { CP_LABEL, parseDetail, readLines, type Detail } from '../src/tools/inventory/detail.mts';
import { CACHE, closest, loadGameData, type Form, type GameData } from '../src/tools/inventory/game-master.mts';
import { identify, type Identity } from '../src/tools/inventory/identify.mts';
import { parseMoves, type Moves } from '../src/tools/inventory/moves.mts';
import { centre, findLine, fold, ocr, type Line } from '../src/tools/inventory/ocr.mts';
import { findOverlay, readOverlay, widen, type Overlay, type OverlayBox } from '../src/tools/inventory/overlay.mts';
import { decodePng, difference, encodePng, type Image } from '../src/tools/inventory/png.mts';
import { offsetBetween, stitch, SCREEN_BAND, SCROLL_STEP, type Band } from '../src/tools/inventory/stitch.mts';
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
  /**
   * The band of the screen that scrolls, which `--scroll` lines its frames up inside. Everything outside it is
   * furniture that stays put — the status bar, PGSharp's overlay, the game's floating buttons — and lining frames up
   * over those finds the shift that keeps *them* still, which is none. `SCREEN_BAND` says where it was measured.
   */
  scrollBand: Band;
}

/**
 * The band a screen is watched for movement in, and how much of it may still differ for it to count as still. The
 * game's own panel, since the artwork above it holds an animated Pokémon that never stops and the status bar ticks with
 * the clock. Measured through one swipe: 31%, then 6.2%, then 0.54% and steady, so anything between settles it.
 */
const SETTLE_BAND = { from: 0.34, to: 0.95 };
const SETTLE_CHANGE = 0.02;
const SETTLE_ATTEMPTS = 4;

/** How many frames one `--scroll` may take before it is a loop rather than a screen. */
const SCROLL_FRAMES = 12;

/**
 * How long one drag of a scroll capture takes, in milliseconds. Slow, so that the content follows the finger rather
 * than flinging on past where it stopped and out of `offsetBetween`'s reach; a guess rather than a measurement, there
 * being no phone here to time one on.
 */
const SCROLL_DRAG_MS = 1000;

/**
 * What a stitched capture is saved under, beside the screenshot it was stitched from. Named once because a scan and a
 * snap both write one and `snap` refuses a `NAME` ending in it, so three places would otherwise have to agree.
 */
const SCROLLED = '-scrolled';

/**
 * How far down the panel may be left after a snap has dragged it back, as a fraction of the screen's height, under
 * which another drag is not asked for. A finger travelling less than the system's touch slop — 8dp, around 24 pixels on
 * the phone `SCREEN_BAND` was measured on — arrives as a tap rather than a drag, and a tap on a detail screen opens
 * something. So this is where a drag stops being one, and what it leaves is under a line of the panel's own text.
 */
const SCROLL_BACK_FLOOR = 0.012;

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
  scrollBand: SCREEN_BAND,
};

/** The searches that answer the yes-or-no columns, each column named for the game's own search term. */
const FLAGS = ['shiny', 'lucky', 'costume', 'shadow', 'purified'] as const;

type Flag = (typeof FLAGS)[number];

/**
 * Size is not among these: the detail screen wears a gold badge saying `XXL` or `XXS`, so it is read off the screen the
 * scan is already looking at rather than bought with a search of its own. Checked against the game's own `xxl` search,
 * which marked the same Applin — 5/2/15 at 0.33m — that the badge does.
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

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'out': { type: 'string', default: 'inventory.csv' },
    'limit': { type: 'string' },
    'skip': { type: 'string' },
    'flags': { type: 'string' },
    'tags': { type: 'string' },
    'no-moves': { type: 'boolean', default: false },
    'scroll': { type: 'boolean', default: false },
    'keep-screens': { type: 'string' },
    'config': { type: 'string' },
    'serial': { type: 'string' },
    'refresh': { type: 'boolean', default: false },
    'verbose': { type: 'boolean', default: false },
  },
});

const [command = 'help', ...rest] = positionals;

/**
 * The synopsis out of this file's own header. Read once rather than where it is printed, because an argument error
 * wants it as much as `help` does: a complaint about a flag is most useful beside the list the flag was not on.
 */
const USAGE = readFileSync(new URL(import.meta.url), 'utf8')
  .match(/Usage[^]*?\n \*\n[^]*?\n \*\n/)?.[0]
  .replace(/^ \* ?/gm, '');

/**
 * Which flags each command acts on. `parseArgs` takes one flat set of options, so nothing else in the code says where a
 * flag belongs: `parse --out inventory.csv` wrote no CSV and said nothing about it, and the synopsis had no way to be
 * checked against anything. Stated once here, so the rejection below and the usage block above cannot drift apart
 * without a test noticing.
 *
 * `--config` is on all three, and splits two ways rather than three: `scan` and `snap` both drive the phone out of it,
 * reading `swipes`, `waits` and `scrollBand`, where `parse` reaches `overlay` alone and only through `report`. The
 * fields are named so the claim can be checked by grepping for them, this sentence having been wrong twice already.
 * `--serial` stops at `snap` because `parse` opens no device.
 *
 * `--scroll` is the scan's alone, where it decides what the moves are read off. A `snap` takes a scroll capture every
 * time, so the flag has nothing left to ask it for, and one that read as accepted would be remembered after the phone
 * had gone back to the map.
 */
const HONOURED: Record<string, readonly string[]> = {
  scan: ['out', 'limit', 'skip', 'flags', 'tags', 'no-moves', 'scroll', 'keep-screens', 'config', 'serial', 'refresh'],
  snap: ['verbose', 'refresh', 'config', 'serial'],
  parse: ['verbose', 'refresh', 'config'],
};

/**
 * The flags actually typed, which `options` cannot answer: `parseArgs` fills in every flag carrying a `default`, so
 * `out`, `no-moves`, `scroll`, `refresh` and `verbose` are in it whether or not anyone asked for them. `argv` is the
 * only place that still knows the difference, and taking the name up to the `=` is what makes `--out=x` read the same
 * as `--out x`.
 */
const passed = process.argv.slice(2).flatMap((arg) => /^--([a-z-]+)/.exec(arg)?.[1] ?? []);

// `hasOwn` rather than the lookup alone, because a plain object inherits from `Object.prototype`: `HONOURED.toString`
// answers a function, which is truthy, so `toString --verbose` reached `.includes` on it and threw where it should have
// fallen through to the usage. Only ever with a flag alongside, an empty list never invoking the filter.
const honoured = Object.hasOwn(HONOURED, command) ? HONOURED[command] : undefined;
const ignored = honoured ? passed.filter((flag) => !honoured.includes(flag)) : [];

// Only for a command that has a list: `help` and a typo fall through to the usage below, which says more than this can.
if (ignored.length > 0) {
  console.error(`${command} does not act on ${ignored.map((flag) => `--${flag}`).join(', ')}\n`);
  console.error(USAGE);
  process.exit(1);
}

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

  if (options.verbose) {
    for (const l of lines) {
      console.log(`  ${`${l.left},${l.top} ${l.width}×${l.height}`.padEnd(22)} ${l.text}`);
    }
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
  // The form carries its whole move pool, which prints as a column of `[Object]` and buries everything worth reading;
  // the names are what a person tuning this wants to see anyway.
  console.log('identity:', {
    ...id,
    form: id.form && { ...id.form, moves: id.form.moves.map((m) => m.name).join(', ') },
  });

  // Handed back rather than only printed, so that `snap` can refuse a screen on what was already read instead of
  // parsing it a second time; a Tesseract run is the slowest thing here.
  return { detail, box, overlay };
}

async function scan() {
  // Ahead of the phone, so a typo fails before anything is driven.
  const limit = count('limit', options.limit, Infinity);
  const skip = count('skip', options.skip, 0);
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

      if (isDetail(await parseDetail(lines, data, image))) {
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

      // A grid whose labels all misread is taken for the panel too, and Back closes storage itself from there.
      if (!isStorage(lines)) {
        lines = await toStorage();
      }
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
      const image = await settled(device);
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
    lines.find((l) => l.top > (searchBox?.[1] ?? 0) && fold(l.text).search(CP_LABEL) === 0);

  /**
   * Opens the first Pokémon the grid shows and reads it, answering a reading with no key when there is none — a search
   * that matched nothing — or when it would not read.
   *
   * The row comes from the grid and the column from the configuration, which is not a compromise but the right split.
   * How far down the first row sits depends on whether a search is showing, so it has to be read; which column is
   * first does not, since the grid is three even columns and 0.18 of the width lands in the leftmost of them on both
   * phones tried. Taking the column from the label as well would open the *second* Pokémon whenever the first one's CP
   * failed to OCR — in an `xxl` grid of five, the top row's only legible label was the middle tile's, so the walk began
   * one along and marked four. One short is the hardest kind of wrong to notice.
   */
  const openFirst = async (grid: readonly Line[]) => {
    const label = tileLabel(grid);
    await tap(
      label ? [at(config.taps.firstTile)[0], label.top + label.height * 2.5] : at(config.taps.firstTile),
      config.waits.swipe,
    );

    // Through `readDetail` for its retry: the tile opens with an animation that outlasts one wait, and a screen read
    // while it is still running is indistinguishable from a grid with nothing in it.
    return readDetail();
  };

  /** Each Pokémon from the one open, `first` being that one's reading where `openFirst` has already made it. */
  const walk = async (
    visit: (reading: Reading, index: number) => Promise<void>,
    max: number,
    from = 0,
    first?: Reading,
  ) => {
    for (let i = 0; i < from; i++) {
      await swipe(config.swipes.next, config.waits.swipe / 2);
    }

    let pending = from === 0 ? first : undefined;
    let previous: string | null = null;
    let misses = 0;

    for (let index = from; index < from + max; index++) {
      const reading = pending ?? (await readDetail());
      pending = undefined;

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
    const grid = await search(flag);
    const first = await openFirst(grid);

    if (first.key !== null) {
      await walk(async ({ detail, overlay }) => marks.add(detail, overlay), Infinity, 0, first);
    } else if (tileLabel(grid)) {
      // The grid showed a Pokémon and it would not read, which is not the answer a search matching nothing gives:
      // marking nothing would write `no` against every Pokémon the search holds. So the column is left blank instead.
      console.error(`${flag}: the first Pokémon would not read, so this column is left blank`);
      continue;
    }

    console.error(`${flag}: ${marks.size}`);
    marked.set(flag, marks);
  }

  const out = options.out;

  if (skip === 0 || !existsSync(out)) {
    writeFileSync(out, `${COLUMNS.join(',')}\n`);
  }

  const grid = await search('');
  const first = await openFirst(grid);

  if (first.key === null) {
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
        let scrolled: Image;
        let back: number;

        if (options.scroll) {
          const capture = await scrollFrames(device);
          scrolled = stitch(capture.frames, capture.offsets, config.scrollBand);
          back = capture.offsets.reduce((a, b) => a + b, 0);
          keep(`${name}${SCROLLED}`, scrolled);

          if (capture.lost) {
            notes.push(`the scroll lost its place after frame ${capture.frames.length}`);
          }
        } else {
          await swipe(config.swipes.scrollDown, config.waits.scroll);
          scrolled = await device.screenshot();
          keep(`${name}-moves`, scrolled);

          // Measured against the screen before the swipe, on the same footing as the `--scroll` branch above. What the
          // drag asked for is no bound on what it got: it asks for half the screen where a panel frequently has less
          // than that left to give, and the distance that matters is the shorter of the two.
          const moved = offsetBetween(image, scrolled, config.scrollBand);
          const [grab, drop] = config.swipes.scrollDown;
          back = moved ?? (grab[1] - drop[1]) * shot.height;

          if (moved === null) {
            // A shift past three-quarters of the band is more than `offsetBetween` looks for, which a panel longer than
            // the swipe gives it. Falling back to the drag can overshoot the top, so it is recorded rather than hidden.
            notes.push('the swipe to the moves could not be measured; the scroll back is what it dragged');
          }
        }

        // Read while the phone scrolls back, since nothing that follows depends on the moves. Awaited with the swipes,
        // so that a read failing before the phone is back is a rejection here rather than an unhandled one.
        reading = ocr(scrolled).then((lines) => parseMoves(lines, data, id.form, scrolled));
        await Promise.all([reading, scrollUp(device, shot, back)]);
      }

      if (reading) {
        moves = await reading;

        if (moves.fast === null || moves.charged.length === 0) {
          notes.push('moves not fully read');
        }
      }

      // Blank for a flag not asked for, or one whose pass would not read, rather than a `no` nothing checked.
      const flag = (f: Flag) => {
        const marks = marked.get(f);

        return marks ? (marks.take(detail, overlay) ? 'yes' : 'no') : '';
      };

      // A chip that matches nothing named is kept as it read rather than dropped, since a misread is worth seeing.
      const carried = detail.tags.map((t) => (tags.length > 0 ? (closest(t, tags, (n) => n, 0.3) ?? t) : t));
      const total = iv ? iv.attack + iv.defense + iv.stamina : null;

      const row: Record<(typeof COLUMNS)[number], string | number | null> = {
        index: index + 1,
        // A nickname says nothing of the species, so a Pokémon `identify` could not place is left blank rather than
        // filed under it.
        species: id.form?.species ?? (id.nickname === null ? detail.name : null),
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
    first,
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
 * What identifies one Pokémon across two passes. CP is not part of it: it is white over the artwork and the reading
 * OCR misses most, so requiring it would make screens unreadable and stop a walk after three. The overlay's IVs
 * discriminate better — HP, weight, height and 15/15/15 together are shared by almost nothing — and HP alone is what a
 * key needs to exist at all.
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

/**
 * Whether a screen is a detail screen, which is its HP having read: the one field every detail screen states and the
 * map, the storage grid and a Pokédex entry all lack. Asked of a `Detail` rather than of a screen so that a caller
 * holding one already does not pay a second Tesseract run, and so that `snap` refuses on the test `toStorage` navigates
 * by rather than on a second notion of the same thing.
 */
const isDetail = (detail: Detail) => detail.hp !== null;

function csv(value: string | number | null): string {
  const text = value === null ? '' : String(value);

  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseFlags(list: string): Flag[] {
  const names = list.split(',').filter(Boolean);
  const unknown = names.filter((n) => !(FLAGS as readonly string[]).includes(n));

  if (unknown.length > 0) {
    throw new Error(`unknown flag ${unknown.join(', ')}; the choices are ${FLAGS.join(', ')}`);
  }

  return names as Flag[];
}

/** A count option, checked here rather than left to turn into a `NaN` that quietly writes nothing after a long run. */
function count(option: string, value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const n = Number(value);

  if (!Number.isInteger(n) || n < 0) {
    throw new Error(`--${option} takes a whole number, not ${value}`);
  }

  return n;
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
    scrollBand: { ...DEFAULTS.scrollBand, ...(overrides.scrollBand as Partial<Band>) },
  };
}

/**
 * A screenshot of a screen that has stopped moving, which is what a fixed wait after a swipe can only guess at. The
 * cost is one extra screenshot where the screen was already still, and the gain is that a scan slowed down by anything
 * — a phone thinking, an animation that ran long — waits for it rather than reading through it.
 */
async function settled(device: Device): Promise<Image> {
  let previous = await device.screenshot();

  for (let attempt = 1; attempt < SETTLE_ATTEMPTS; attempt++) {
    const image = await device.screenshot();

    if (difference(previous, image, SETTLE_BAND.from, SETTLE_BAND.to) < SETTLE_CHANGE) {
      return image;
    }

    previous = image;
  }

  return previous;
}

/** What a scroll capture took, and what `stitch` and the way back up need from it. */
interface Capture {
  frames: Image[];
  /** The shift between each consecutive pair, as `stitch` takes them, and what they sum to is the way back up. */
  offsets: number[];
  /** Whether it stopped on two frames that would not line up, rather than on reaching the end. */
  lost: boolean;
}

/**
 * Every frame of the screen from here to its bottom, dragging half the scrolling band at a time — `SCROLL_STEP`, kept
 * within what `offsetBetween` looks for, where the scan's single swipe to the moves is not — and waiting for each frame
 * to settle. Stops on a frame that has not moved, which is what reaching the end looks like; on one that will not line
 * up with the one before, which is left out; or at `SCROLL_FRAMES`, so that a screen which never stops moving is a
 * short capture rather than a scan that does not come back. Every frame it answers is one `stitch` uses.
 *
 * It does not scroll back up: `scrollUp` does, by what the offsets sum to, when the caller is ready. The last drag is
 * always one that moved nothing — that being how the end of the screen announces itself — so what it dragged is no part
 * of the way back.
 */
async function scrollFrames(device: Device): Promise<Capture> {
  const band = config.scrollBand;
  const first = await settled(device);
  const x = first.width / 2;
  const y = (through: number) => first.height * (band.from + (band.to - band.from) * through);
  const frames = [first];
  const offsets: number[] = [];

  while (frames.length < SCROLL_FRAMES) {
    await device.swipe([x, y(0.5 + SCROLL_STEP / 2)], [x, y(0.5 - SCROLL_STEP / 2)], SCROLL_DRAG_MS);
    const next = await settled(device);
    const moved = offsetBetween(frames.at(-1) as Image, next, band);

    if (moved === null) {
      return { frames, offsets, lost: true };
    }

    if (moved === 0) {
      break;
    }

    frames.push(next);
    offsets.push(moved);
  }

  return { frames, offsets, lost: false };
}

/**
 * Back up the screen by `pixels`, which is the distance it was measured to have scrolled. `screen` is any screenshot,
 * for its size.
 *
 * **A drag longer than the screen has scrolled does not stop at the top.** Once the content is there the game reads the
 * rest of the finger's travel as a swipe to dismiss and closes the panel, so asking for more than was scrolled ends on
 * the map rather than on the Pokémon the scan opened — and the swipe to the next Pokémon then lands on nothing, three
 * unreadable screens stopping the pass. One drag of the configured swipe covers 0.55 of the height where a detail
 * screen scrolls 711 pixels of 2244, so a swipe per drag the capture made asked for roughly three times too much.
 *
 * Undershooting is the safe direction: the panel resets to its top when the game draws the next Pokémon, so a few rows
 * left unscrolled cost nothing where a few too many close the screen. That is the scan's invariant and not every
 * caller's — a caller with no next Pokémon to draw has to measure what is left and ask again, as `snap` does.
 */
async function scrollUp(device: Device, screen: Image, pixels: number) {
  if (pixels <= 0) {
    return;
  }

  const [from, to] = config.swipes.scrollUp.map(([x, y]): Point => [x * screen.width, y * screen.height]) as [
    Point,
    Point,
  ];
  const reach = to[1] - from[1];

  // As few drags as the configured swipe reaches in, each an equal share, one drag covering only what fits on screen.
  const drags = Math.ceil(pixels / reach);
  const part = pixels / drags / reach;
  const end: Point = [from[0] + (to[0] - from[0]) * part, from[1] + reach * part];

  for (let i = 0; i < drags; i++) {
    // At the capture's own drag speed, and for its reason: a quick drag flings on past where the finger stopped, which
    // on the way back means landing above what `pixels` asked for and spending the overshoot on the dismiss gesture.
    await device.swipe(from, end, SCROLL_DRAG_MS);
    await sleep(config.waits.scroll);
  }
}

/**
 * A screenshot of whatever the phone is showing, read out field by field and saved, which is the tool for working out
 * why a scan misread something.
 *
 * **It refuses a capture a scan could not have used** rather than printing a page of nulls and exiting 0. A snap is
 * taken to be looked at later or committed as a fixture, and one of the map, one of a Pokémon with PGSharp's overlay
 * switched off, and one the scroll lost its place part way through are none of them that. Nothing beyond those three is
 * checked: the exit status says the capture is worth keeping, not that every field came out.
 *
 * **What it says is what it saw.** A missing HP is reported as a missing HP and not as a screen that is not a detail
 * screen: the two cannot be told apart from here, and the case `snap` exists to serve is the detail screen whose fields
 * do not read. Guessing which it was would put a claim nothing checked in front of whoever is debugging.
 *
 * **It takes a scroll capture of every screen it can confirm is a detail screen**, saved as `NAME-scrolled.png` beside
 * the screen itself. The foot of a detail screen is below the phone, so the moves a misread was looking at are in no
 * plain screenshot of it, and a flag to ask for them is one remembered after the phone has gone back to the map. Both
 * files are kept because neither does the other's job: the stitch is the whole screen to look at, and the screen is the
 * one the readers above can be given and the one a fixture is.
 *
 * What it confirms a detail screen by is the overlay rather than the HP, which is why a refusal does not stop it. Three
 * small numbers separated by slashes are a thing only PGSharp's overlay puts on the screen, so a screen it read one on
 * is a detail screen whatever the HP made of itself — and the detail screen whose HP misreads is the case a snap is
 * taken for, so refusing it the stitch would withhold the capture from the run that needed it most. Where the overlay
 * did not read, the map and a detail screen cannot be told apart, and a scroll of the map drags the phone for nothing.
 *
 * **It puts the panel back where it found it**, which `--scroll` left to the scan. See `scrollUp`: its undershoot is
 * safe only for a caller the game will draw another Pokémon for, and nothing redraws the panel after a snap, so a panel
 * left part way down is what the next snap of that screen captures. The way back is measured and asked for again until
 * it is had, and said out loud rather than refused where it cannot be: both files are written by then, so the status
 * goes on answering for the capture rather than for where the phone was left.
 *
 * The screen is grabbed and written to disk first, then read, then checked. Writing first is what makes a snap of a
 * broken phone useful: the readers can throw rather than read nothing — `ocr` rejects outright where Tesseract is not
 * on the path — and a snap that saved nothing is no help on the one run that needed it. Reading before any drag is what
 * keeps a scroll capture of the wrong screen from driving the phone for nothing, and the game master is loaded after
 * the grab, `iconsFor` taking minutes on a cold cache: long enough for the phone to blank the screen set up for the
 * snap.
 */
async function snap() {
  const name = rest[0] ?? new Date().toISOString().replaceAll(':', '-');

  // Refused before the phone is opened, since nothing it answers could change it. `snap foo` writes `foo.png` and
  // `foo-scrolled.png`, so `snap foo-scrolled` would overwrite that stitch with a plain screenshot and put its own
  // stitch in `foo-scrolled-scrolled.png`, both `Saved …` lines reading exactly as they do on a snap that took nothing.
  if (name.endsWith(SCROLLED)) {
    console.error(`snap: NAME cannot end in \`${SCROLLED}\`, which is the suffix the stitch beside it is saved under`);
    process.exitCode = 1;

    return;
  }

  const device = new Device(options.serial);
  await device.check();

  const write = (suffix: string, image: Image) => {
    const path = join(CACHE, 'snaps', `${name}${suffix}.png`);

    mkdirSync(join(CACHE, 'snaps'), { recursive: true });
    writeFileSync(path, encodePng(image));
    console.log(`Saved ${path} (${image.width}×${image.height})`);
  };

  const refuse = (...whys: readonly string[]) => {
    for (const why of whys) {
      console.error(`snap: ${why}`);
    }

    process.exitCode = 1;
  };

  // Settled, so that what is read is the screen rather than the middle of an animation it was drawing.
  const image = await settled(device);
  write('', image);

  const data = await loadGameData(CACHE, options.refresh);
  const read = await report(image, data, await iconsFor(CACHE, data, options.refresh));

  // A configured `overlay` is taken on trust and so can never be missing, which would leave this check vacuous for
  // anyone who sets one — hence the second case, where the box is known and nothing read inside it.
  const refused = [
    !isDetail(read.detail) && 'its HP did not read, so a scan could not have used this screen',
    read.box === null && "PGSharp's overlay was not found on it",
    read.box !== null && read.overlay === null && "PGSharp's overlay was found but nothing read inside it",
  ].filter((why): why is string => why !== false);

  if (refused.length > 0) {
    refuse(...refused);
  }

  // The refusal above says the capture is not one a scan could have used; this says there is nothing to scroll. Only
  // the overlay separates the two, per the doc: a screen whose HP alone misread is scrolled, refusal and all.
  if (read.overlay === null) {
    return;
  }

  // The whole screen stitched out of as many frames as it takes. The report above ran on the unstitched screen, the
  // readers it calls being anchored on fractions of the image's height — so a stitched image is something to look at
  // rather than something to hand them, and it is written beside that screen rather than over it.
  const capture = await scrollFrames(device);
  const total = capture.offsets.reduce((a, b) => a + b, 0);
  const scrolled = `${capture.offsets.join(' + ') || 0} = ${total} pixels`;
  write(SCROLLED, stitch(capture.frames, capture.offsets, config.scrollBand));
  console.log(`Stitched ${capture.frames.length} frames, scrolling ${scrolled} past the first.`);
  await scrollUp(device, image, total);

  // The way back measured rather than assumed, against the screenshot already in hand, and asked for again by whatever
  // the last drag left: `scrollUp` undershoots on purpose and no next Pokémon is coming to reset the panel. It stops
  // within `SCROLL_BACK_FLOOR` of where it started, or where a pass no longer gains — the test `scrollFrames` ends on,
  // and what keeps this from dragging for ever at a panel that will not move.
  const floor = image.height * SCROLL_BACK_FLOOR;
  const scrolledPast = async () => offsetBetween(image, await settled(device), config.scrollBand);
  let left = await scrolledPast();

  while (left !== null && left > floor) {
    await scrollUp(device, image, left);
    const after = await scrolledPast();

    if (after === null || after >= left) {
      left = after;
      break;
    }

    left = after;
  }

  // Said rather than refused: both files are written and are what the snap was taken for, so the status goes on meaning
  // the capture is worth keeping. What a panel left down costs is the next snap of this screen, which nothing here can
  // fix and whoever takes it should hear about.
  if (left === null) {
    console.error('snap: the screen stopped lining up with the one captured, so the phone was left off the Pokémon');
  } else if (left > floor) {
    console.error(`snap: the panel is left ${left} pixels down, so another snap of this screen would be shifted`);
  }

  // A capture that lost its place is short by however much it had left to go, and a stitch of one frame is a copy of
  // the screenshot beside it. Either is a picture of something that was on the screen, so it is kept and refused rather
  // than thrown away — but it is not the whole screen a snap saves, and the status has to say so.
  if (capture.lost) {
    refuse(`the scroll lost its place after frame ${capture.frames.length}, so the stitch is short`);
  }
}

// Last, so that everything above — the `Marks` class in particular — is initialised before anything runs.
if (command === 'scan') {
  await scan();
} else if (command === 'snap') {
  await snap();
} else if (command === 'parse' && rest.length > 0) {
  const data = await loadGameData(CACHE, options.refresh);
  const icons = await iconsFor(CACHE, data, options.refresh);

  for (const path of rest) {
    console.log(`\n=== ${basename(path)}`);
    await report(decodePng(readFileSync(path)), data, icons);
  }
} else {
  console.error(USAGE);
  process.exit(command === 'help' ? 0 : 1);
}
