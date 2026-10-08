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
 *                       [--config FILE] [--serial SERIAL] [--refresh] [--verbose]
 *   pnpm inventory snap [--search TERM] [--verbose] [--refresh] [--config FILE] [--serial SERIAL] [NAME]
 *                       save a screenshot of whatever is showing, and a stitch of the whole screen beside it, and print
 *                       what each reader makes of the screenshot; fails unless it is a detail screen carrying PGSharp's
 *                       overlay. `--search` opens the first Pokémon storage's own search matches first, so that a
 *                       capture names the Pokémon it wants — `--search '+burmy & cp196'` rather than a screen set up by
 *                       hand
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
 * `--verbose` also un-silences the preamble every command narrates before it has an answer: the form icons it is about
 * to read, with the families no artwork settles. That is the same two lines on every run of a warm cache, and the
 * ambiguous families are a property of the game master rather than of the run — worth reading when a form comes out
 * wrong, and worth nothing in front of the answer the other nine runs in ten are after.
 *
 * A download says so either way, there being no warm run for it to be noise on: a file already in date is read without
 * a word, so `Downloading` prints on exactly the cold or stale run, the one with minutes of waiting to account for.
 * Neither is what went *wrong* ever held back — a stale copy read because the download failed, an icon index that could
 * not be had, an icon that 404s — those being what say why an answer came out degraded.
 *
 * Automating input breaks Niantic's terms of service. This only reads, and moves at a person's pace, but the risk to
 * the account is the user's to weigh.
 */

import { Device, KEY, typeable } from '../src/tools/inventory/adb.mts';
import { iconsFor, signatureOf, type Signature } from '../src/tools/inventory/artwork.mts';
import { bestOf } from '../src/tools/inventory/attempts.mts';
import { CP_LABEL, parseDetail, readLines, type Detail } from '../src/tools/inventory/detail.mts';
import { CACHE, closest, loadGameData, type Form, type GameData } from '../src/tools/inventory/game-master.mts';
import { identify, type Identity } from '../src/tools/inventory/identify.mts';
import { parseMoves, type Moves } from '../src/tools/inventory/moves.mts';
import { centre, findLine, fold, ocr, type Line } from '../src/tools/inventory/ocr.mts';
import { findOverlay, readOverlay, widen, type Overlay, type OverlayBox } from '../src/tools/inventory/overlay.mts';
import { decodePng, difference, encodePng, type Image } from '../src/tools/inventory/png.mts';
import { showProgress } from '../src/tools/inventory/progress.mts';
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

/**
 * How many backspaces clear the search box, and **the longest term `--search` will accept** — the two being one number
 * on purpose, because the box has no length of its own to measure against. Typing a patterned run into it, all 234
 * characters landed and the field showed no sign of a cap, so there is no capacity this could be set to. What bounds
 * the box is therefore what this script types into it, and the refusal beside `--search` is what makes that true.
 *
 * It was 40, which is shorter than the searches a re-snap sends: `+ho-oh & cp2738 & hp152 & shiny & lucky & !costume`
 * is 50 characters, so ten survived the clear and the next term was typed onto the end of them.
 *
 * The failure is silent, which is what makes a bound worth enforcing rather than hoping for. The field scrolls, so only
 * its last 32 characters are on screen and the cursor sits among them — a merged term therefore *looks* exactly like a
 * clean one, and the only symptom is a result count quietly wrong. Three searches welded together read back as
 * `+cas+cas+ho-oh & clucky`, which matched nothing where the search before it had matched one.
 *
 * Generous because generosity is free: `device.key` sends every code in one `input keyevent`, so this is one call
 * however large, and a backspace on an empty field does nothing. Being short costs a pass of the corpus — which is what
 * it cost. A term typed into the box by hand can still exceed it, and that is the one case left: clear it by hand too.
 */
const CLEAR_KEYS = 300;

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
    'search': { type: 'string' },
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
 *
 * `--verbose` is on all three for two different reasons, and reaches `scan` only for the second: it adds the OCR dump
 * that `report` prints, which `scan` never calls, and it un-silences the preamble `iconsFor` narrates, which all three
 * reach. That second reason is the narrow one — a quiet `scan` still names the app it launches and counts off each flag
 * it reads, those not being progress to be waited through — so what the flag buys here is the icon count and the
 * families no artwork settles, and not the difference between a silent scan and a talking one.
 */
const HONOURED: Record<string, readonly string[]> = {
  scan: [
    'out',
    'limit',
    'skip',
    'flags',
    'tags',
    'no-moves',
    'scroll',
    'keep-screens',
    'config',
    'serial',
    'refresh',
    'verbose',
  ],
  snap: ['search', 'verbose', 'refresh', 'config', 'serial'],
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

// Ahead of `iconsFor`, which is the only thing that reads it, and up here rather than beside each of its three calls
// because progress is narrated until this says otherwise: a call made late leaves the preamble in a run that asked for
// quiet. `cli.test.mts` is what notices, the quiet half of its `--verbose` test failing on exactly that.
showProgress(options.verbose);

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

/**
 * Getting about storage on the phone: to the grid, a search typed into it, and where the first tile of what it left is.
 *
 * Shared by `scan` and `snap --search` rather than written once each, because the two have to agree about what a grid
 * is and which tile is its first. A second copy would drift, and the way it would show is a capture pinned off the
 * *second* Pokémon the search matched — a screenshot of the wrong Pokémon looks just like one of the right Pokémon.
 *
 * Taps are sized against a screenshot rather than `Config`, every position in it being a fraction of the screen so that
 * one configuration suits any phone of the same shape.
 */
function storage(device: Device, config: Config, data: GameData, screen: Image) {
  let searchBox: Point | null = null;
  let fronted: Promise<void> | null = null;

  const at = (p: Point): Point => [p[0] * screen.width, p[1] * screen.height];

  const tap = async (p: Point, wait = config.waits.tap) => {
    await device.tap(p);
    await sleep(wait);
  };

  const swipe = async ([from, to]: [Point, Point], wait: number) => {
    await device.swipe(at(from), at(to));
    await sleep(wait);
  };

  /**
   * The first Pokémon's CP label in a grid, which doubles as how a grid is told from the suggestions panel drawn over
   * it: the panel carries no CP anywhere.
   */
  const tileLabel = (lines: readonly Line[]) =>
    lines.find((l) => l.top > (searchBox?.[1] ?? 0) && fold(l.text).search(CP_LABEL) === 0);

  /**
   * How many Pokémon a search matched, off the game's own counter beside the magnifier in the POKEMON tab — `(1)`, or
   * `(0)` where it found nothing — or null where the counter did not read.
   *
   * This is what separates the two halves `tileLabel` cannot. A grid whose first CP label misread and a search that
   * matched nothing both leave no label, and the counter says which: measured on a shiny Ho-Oh the search matched, the
   * tile read as `2738,` with its `CP` lost entirely while the counter beside it read `(1)`. The label is small grey
   * text over a pale tile where the counter is the header's own, which is why one reads and the other does not.
   *
   * Matched on the raw text rather than the folded, `fold` stripping the brackets that carry the meaning — `(1)` and
   * `6/12` both fold to a bare number. Above the search box for the same reason: a tile's `96%` has no brackets, but a
   * nickname could, where nothing above the box is a Pokémon at all.
   */
  const matches = (lines: readonly Line[]): number | null => {
    for (const line of lines) {
      const counted = /\((\d+)\)/.exec(line.text);

      if (counted && line.top < (searchBox?.[1] ?? Infinity)) {
        return Number(counted[1]);
      }
    }

    return null;
  };

  /**
   * Launched where it is not already in front, which is the phone's answer to give rather than the user's: a game
   * running and a game showing are different states, and only the second is one `toStorage` can start from. A game in
   * the background still needs the launch to bring it forward — skipping it there taps the launcher instead, three
   * times over, and reports that storage cannot be found. The wait goes with the launch, since thirty seconds is what a
   * cold start costs and a game already drawn is past it; measured, a resume takes the focus back in 676ms.
   *
   * It belongs to `toStorage` rather than to each caller because it is `toStorage`'s own precondition, and a caller is
   * free to forget it: every path that drives storage gets it from here whether its author thought of the backgrounded
   * phone or not. Asked once per run rather than before every search, which is the one `adb` call `scan` spent when it
   * owned this rather than one for each flag.
   */
  const foreground = async () => {
    if ((await device.focused()) === config.package) {
      console.error('Pokémon GO is already in front');
    } else {
      console.error('Launching Pokémon GO');
      await device.launch(config.package);
      await sleep(config.waits.launch);
    }
  };

  /** Gets to the storage grid from wherever the game is: the map, a detail screen, or the grid already. */
  const toStorage = async () => {
    await (fronted ??= foreground());

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
    await device.key(KEY.MOVE_END, ...Array<number>(CLEAR_KEYS).fill(KEY.DEL));

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
    // this wrong is expensive rather than merely unhelpful: `firstTile` then falls back to its blind tap, which lands
    // on the first Recent chip and quietly opens whatever was searched for last.
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

  /**
   * Where the first Pokémon in a grid is, to be tapped.
   *
   * The row comes from the grid and the column from the configuration, which is not a compromise but the right split.
   * How far down the first row sits depends on whether a search is showing, so it has to be read; which column is
   * first does not, since the grid is three even columns and 0.18 of the width lands in the leftmost of them on both
   * phones tried. Taking the column from the label as well would open the *second* Pokémon whenever the first one's CP
   * failed to OCR — in an `xxl` grid of five, the top row's only legible label was the middle tile's, so the walk began
   * one along and marked four. One short is the hardest kind of wrong to notice.
   */
  const firstTile = (grid: readonly Line[]): Point => {
    const label = tileLabel(grid);

    return label ? [at(config.taps.firstTile)[0], label.top + label.height * 2.5] : at(config.taps.firstTile);
  };

  return { at, tap, swipe, search, tileLabel, matches, firstTile };
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
  const { at, tap, swipe, search, tileLabel, firstTile } = storage(device, config, data, shot);
  let overlayBox: OverlayBox | null = config.overlay ?? null;
  // A phone with PGSharp's overlay switched off would otherwise sweep for it on every Pokémon, for ever.
  let searchesLeft = 5;

  if (screens) {
    mkdirSync(screens, { recursive: true });
  }

  // `carry` for the one artifact that needs it: a stitch, whose own height is not the height the phone drew.
  const keep = (name: string, image: Image, carry: Readonly<Record<string, string>> = {}) => {
    if (screens) {
      writeFileSync(join(screens, `${name}.png`), encodePng(image, carry));
    }
  };

  interface Reading {
    detail: Detail;
    overlay: Overlay | null;
    /** Worked out while reading, since a reading is only accepted once something fits it; the row writer reuses it. */
    id: Identity;
    key: string | null;
    image: Image;
    /**
     * How much of this reading is in doubt, as a count to be got to zero. Recorded with the reading rather than worked
     * out again when two are compared: `overlayBox` is found part way through a pass, and a score that moved with it
     * would rank an earlier attempt differently for what a later one went on to learn.
     */
    faults: number;
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
   *
   * A note `identify` raised is worth another look as well, and it is the only one of them that says the screen read
   * *whole* and wrongly: a CP the settled form and level do not derive, a level shortlist no HP can be, a form the
   * overlay names that no species has. What says a second read of the same Pokémon is worth taking is the corpus having
   * been retaken — which captures misread their CP changed with it, three before and two after, so a misread is a
   * property of the capture as much as of the reader. `screens.test.mts` pins which six of its 43 captures raise a
   * note, and that every one of the six is a row carrying a `defects`.
   *
   * Which is six of the eight defects that file pins, and not the other two: those are the readers that answer
   * confidently with nothing on the screen to contradict them — a fold that collapsed Basculin's two stripes, and an
   * artwork match that declined Cherrim's Overcast. Nothing here can be the check for those; only a second reader of
   * the same thing could be.
   *
   * `could also be …` is counted with the rest, so a form the screen cannot separate costs every attempt for nothing.
   * That is one capture of the 43, and it is a defect rather than an ambiguity: `castform-rainy.png` is
   * answered as **Inteleon**, deriving CP 1512 for the 832 on its screen — the one wrong label in the corpus that names
   * a different species, its nickname having sent the search across every species, and that note is the only one it
   * raises. Leaving the note out would leave that out with it.
   *
   * What the stricter test costs if the last attempt is the one taken is a row rather than a note, which is why the
   * reading kept is `bestOf`'s and not this loop's: a reading accepted before is now read again, a second look can come
   * back worse, and one whose HP goes unread has no key at all — three of those in a row stop the pass. That decision
   * sits there so `attempts.test.mts` can assert it, this being the one part of the walk no test could otherwise reach:
   * a scan needs a phone, and the one command `cli.test.mts` drives without one is `parse`, which reads a file once.
   */
  const readDetail = (): Promise<Reading> =>
    bestOf(
      READ_ATTEMPTS,
      ({ faults }) => faults,
      async (attempt) => {
        // Give the screen time to move on before looking again, which `settled` does not: it waits for the screen to
        // stop moving, and an overlay PGSharp has not drawn yet is a still screen.
        if (attempt > 0) {
          await sleep(config.waits.swipe);
        }

        const image = await settled(device);
        const detail = await parseDetail(await readLines(image), data, image);
        // Only a detail screen is worth a sweep. The sweeps are rationed, and an empty search's grid or a tile still
        // opening would otherwise spend them all before the first Pokémon, leaving every row without IVs.
        const overlay = detail.hp === null ? null : await overlayOf(image);
        const key = keyOf(detail, overlay);
        const id = identify(data, detail, overlay, artworkIn(image, overlayBox, icons));

        // The overlay's clause is the conditional one: where no box has been found at all there is nothing to wait for,
        // and insisting would cost three reads of every Pokémon on a phone that is not running PGSharp. A form that
        // fits is the surest of the four, the name, the types, the HP and the IVs agreeing being what a half-read
        // screen cannot fake.
        const faults =
          Number(key === null) +
          Number(overlay === null && overlayBox !== null) +
          Number(id.form === null) +
          id.notes.length;

        return { detail, overlay, id, key, image, faults };
      },
    );

  /**
   * Opens the first Pokémon the grid shows and reads it, answering a reading with no key when there is none — a search
   * that matched nothing — or when it would not read.
   */
  const openFirst = async (grid: readonly Line[]) => {
    await tap(firstTile(grid), config.waits.swipe);

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
          // The same two halves `snap` takes: the screenshot already in hand as the first frame, rather than a second
          // photograph of a screen that has moved on, and the height it was drawn at recorded beside the stitch.
          const capture = await scrollFrames(device, image);
          scrolled = stitch(capture.frames, capture.offsets, config.scrollBand);
          back = capture.offsets.reduce((a, b) => a + b, 0);
          keep(`${name}${SCROLLED}`, scrolled, { Viewport: `${image.width}x${image.height}` });

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
 * it takes itself to settle. Stops on a frame that has not moved, which is what reaching the end looks like; on one
 * that will not line up with the one before, which is left out; or at `SCROLL_FRAMES`, so that a screen which never
 * stops moving is a short capture rather than a scan that does not come back. Every frame it answers is one `stitch`
 * uses.
 *
 * It does not scroll back up: `scrollUp` does, by what the offsets sum to, when the caller is ready. The last drag is
 * always one that moved nothing — that being how the end of the screen announces itself — so what it dragged is no part
 * of the way back.
 *
 * `taken` stands in for the first frame, so that the stitch holds the screen the caller already has rather than a
 * second photograph of it: without it the same screen is shot twice, seconds apart, and the two differ over about half
 * their rows — the artwork animates, the clock ticks and PGSharp redraws its overlay. What it buys is one identity,
 * `crop(stitch, 0, 0, width, bandFoot)` being that screen row for row, `stitch` taking every row down to the band's
 * foot from frame 1 verbatim.
 *
 * **It is the one frame not waited for, so the caller owes it:** it has to still be what the phone is showing. `snap`
 * takes its screenshot before `report`, which can spend minutes in `iconsFor` on a cold cache — long enough for the
 * phone to blank the screen that was set up for it. A stale one does not corrupt the stitch quietly: `offsetBetween`
 * refuses the pair it cannot line up, so `lost` comes back true, the capture is one frame long and `stitch` answers a
 * copy of that frame. The caller reports the loss and exits non-zero, and the committed corpus holds such a copy to a
 * test of its own.
 */
async function scrollFrames(device: Device, taken?: Image): Promise<Capture> {
  const band = config.scrollBand;
  const first = taken ?? (await settled(device));
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
 * **`--search` drives the phone to the Pokémon** instead of taking whatever is showing, which is what makes a capture
 * reproducible: the term says which Pokémon was wanted, where a screen set up by hand records nothing about that at
 * all. Storage is somewhere only a game in front can be driven to, so the launch comes with it — see `toStorage`, which
 * owns that check on behalf of every caller. A grid it lands on with no Pokémon in it is refused before anything is
 * written, the one case that beats writing first: the capture would otherwise be of the storage grid, saved over
 * whatever this name already held. It also brings the game master's load forward, so a `--search` run on a cold cache
 * with no network fails having written nothing, where a plain snap cannot.
 *
 * The screen is grabbed and written to disk first, then read, then checked. Writing first is what makes a snap of a
 * broken phone useful: the readers can throw rather than read nothing — `ocr` rejects outright where Tesseract is not
 * on the path — and a snap that saved nothing is no help on the one run that needed it. Reading before any drag is what
 * keeps a scroll capture of the wrong screen from driving the phone for nothing, and the game master is loaded after
 * the grab wherever nothing above wanted it sooner, `iconsFor` taking minutes on a cold cache: long enough for the
 * phone to blank the screen set up for the snap.
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

  // Refused here for the same reason, and against `adb`'s own test rather than a second copy of it: a term `type` will
  // not send is one the phone would be driven to storage and into the search box for before anything said so.
  if (options.search !== undefined && !typeable(options.search)) {
    console.error(`snap: --search ${JSON.stringify(options.search)} has characters the phone cannot be sent`);
    process.exitCode = 1;

    return;
  }

  // A term longer than the box can be cleared of would be typed onto the end of whatever `CLEAR_KEYS` left behind, and
  // a merged term is the one failure the screen does not show: the field scrolls, so its visible tail reads correctly
  // either way. Refused rather than trusted to a count, which is how 40 backspaces cost a pass of the corpus.
  if (options.search !== undefined && options.search.length > CLEAR_KEYS) {
    console.error(
      `snap: --search is ${options.search.length} characters, more than the ${CLEAR_KEYS} the box can be cleared of`,
    );
    process.exitCode = 1;

    return;
  }

  // The one term `typeable` passes and `--search` cannot use: it is `*`-quantified, so both `''` and a run of spaces
  // satisfy it. An empty search matches everything, which would snap whatever the unfiltered grid happens to show first
  // and exit 0 — a capture under a name claiming it is something else, and the unreproducible snap `--search` is here
  // to replace. `--search "$TERM"` with `TERM` unset is how it arrives. A whitespace-only term is worse still: `search`
  // types the space, so the `term === ''` test that closes the suggestions panel is skipped, and `firstTile` falls back
  // to its blind tap onto the first Recent chip — opening whatever was searched for last.
  if (options.search?.trim() === '') {
    console.error('snap: --search needs a term; an empty one matches everything, so the capture would name nothing');
    process.exitCode = 1;

    return;
  }

  const device = new Device(options.serial);
  await device.check();

  const write = (suffix: string, image: Image, carry: Readonly<Record<string, string>> = {}) => {
    const path = join(CACHE, 'snaps', `${name}${suffix}.png`);

    mkdirSync(join(CACHE, 'snaps'), { recursive: true });
    writeFileSync(path, encodePng(image, carry));
    console.log(`Saved ${path} (${image.width}×${image.height})`);
  };

  const refuse = (...whys: readonly string[]) => {
    for (const why of whys) {
      console.error(`snap: ${why}`);
    }

    process.exitCode = 1;
  };

  // At most one load however many things below want it. `--search` wants it before the grab, `toStorage` reading the
  // screen to tell the storage grid from a detail screen; without one nothing wants it until after, and that order is
  // deliberate — the screen was set up by hand there, and a cold `loadGameData` fetches 23 MB before `iconsFor` spends
  // minutes on the icons, long enough for the phone to blank what was set up for the snap.
  let loaded: GameData | null = null;
  const gameData = async () => (loaded ??= await loadGameData(CACHE, options.refresh));

  // Driven to the Pokémon rather than taking what is showing, which is what makes a capture reproducible: the search
  // names what it wanted, where a screen set up by hand records nothing about which Pokémon that was.
  if (options.search !== undefined) {
    const { tap, search, tileLabel, matches, firstTile } = storage(
      device,
      config,
      await gameData(),
      await device.screenshot(),
    );
    const grid = await search(options.search);

    // Checked before the grab, which is the one place something beats writing first: a grid with no Pokémon in it is
    // one `firstTile` taps blind, so what would be written over `NAME.png` is a screenshot of the storage grid — and
    // the refusals below would then blame the HP and the overlay without ever saying the search was what failed. The
    // re-snap of a Pokémon since powered up or traded away is exactly when it happens, which is to say when the fixture
    // being overwritten is the one still wanted.
    //
    // Which of the two it was goes unsaid, for the reason the missing HP above does: a grid whose first label misread
    // and a search that matched nothing cannot be told apart from here, and neither is a screen to snap.
    // The game's own count first, which says which of the two it was where `tileLabel` alone could not. A grid whose
    // first label misread still carries the counter, so only a search that really matched nothing is refused here.
    const found = matches(grid);

    if (found === 0 || (found === null && !tileLabel(grid))) {
      refuse(
        found === 0
          ? `--search ${JSON.stringify(options.search)} matched nothing, which the grid's own counter says`
          : `--search ${JSON.stringify(options.search)} left a grid with neither a counter nor a CP label in it`,
        'nothing was written, so a snap already saved under this name is still the one that was there',
      );

      return;
    }

    await tap(firstTile(grid), config.waits.swipe);
  }

  // Settled, so that what is read is the screen rather than the middle of an animation it was drawing.
  const image = await settled(device);
  write('', image);

  const data = await gameData();
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
  const capture = await scrollFrames(device, image);
  const total = capture.offsets.reduce((a, b) => a + b, 0);
  const scrolled = `${capture.offsets.join(' + ') || 0} = ${total} pixels`;
  // `Viewport` is the one thing a stitch cannot say about itself: its own `IHDR` height is as many frames as the screen
  // took, so the height the phone drew is unrecoverable from the file, and the file is the only place that travels with
  // it. Written on the stitch alone, the screen's own height being that number already.
  //
  // What it is good for is narrower than it looks, and `stitch`'s layout is why: cropping to this height does not give
  // the screen back. Rows down to the band's foot are frame 1 verbatim, the rows after it are the next frame's revealed
  // content, and the screen's own floating buttons were appended at the far end. The crop that *is* the screen stops at
  // the foot — 1997 rows of 2244 here — and so is still the wrong height for every reader anchored on a fraction of it.
  // `stitch.test.mts` pins both halves of that.
  write(SCROLLED, stitch(capture.frames, capture.offsets, config.scrollBand), {
    Viewport: `${image.width}x${image.height}`,
  });
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
