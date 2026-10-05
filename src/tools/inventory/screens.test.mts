/**
 * What the detail screen's readers make of real screens, over the corpus of captures committed beside this file.
 *
 * Every reader here is a pure function of a screenshot, so the only thing a test of them needs is the screenshot — no
 * phone and no network. The game master they are read against is vended beside them rather than downloaded, by
 * `pnpm vend:game-master`: the whole of what `loadGameData` answers, 0.85 MB of it, where the two files upstream are 23
 * MB and are cached for only a week — so even a committed cache would have the suite fetching again every eighth day.
 *
 * **A row says what the Pokémon is, not what the readers answered**, and the file is three layers because of that. A
 * `Fixture` is the screen: the CP above the artwork, the name and the HP under it, the weight, the height and the types
 * in the panel, the size pill where there is one, PGSharp's level and IVs over the middle. A `Defects` beside it is
 * where some reader answers something else, written down rather than softened away. Everything after that is derived
 * from the pair, so a consequence cannot drift from its cause — the level `identify` settles on, the nickname, the
 * `could also be …` note.
 *
 * **What that orientation buys is the CP cross-check.** `cpOf` derives a CP from the form, the IVs and the level's
 * multiplier, where a row's own `cp` is the number the game itself printed, so the two meeting means the form, the IVs
 * and the level are every one of them right — and nothing shorter than the whole pipeline can say that. A table
 * recording `cp` as whatever OCR made of it could check only the 25 OCR reads it on.
 *
 * It reaches the 40 rows where `identify` settles on exactly one level, and on **all 40** the derived CP is the CP the
 * screen prints. The one row left over, `snorlax-purified.png`, carries no overlay for PGSharp to have stated a level
 * on, so there is nothing to derive from. No capture settles on two levels any more — `pikachu-witch-hat.png` was the
 * last, its `L27` read as two runs of digits with nothing offering the pair.
 *
 * Forty agreements and no disagreements is weaker than it sounds, and worth saying so: the check's *other* job is to
 * report a form or a level that is wrong, and no capture exercises that any more. `nidoran-male.png` and
 * `thundurus-shadow.png` were the two that did and both have left the corpus, so `defects.cp` is unused and a `cpOf`
 * that quietly agreed with whatever it was handed would pass every row here.
 *
 * The cross-check also *narrows* rather than only reporting: `identify` keeps the candidates whose derived CP is one
 * the screen states, which is the only thing on it that separates forms differing in attack or defense alone. That
 * settles all six Deoxys and Dialga rows, and they are what is left holding it.
 *
 * `COVERAGE` below pins those counts, because a figure quoted in prose is a figure nothing checks: `39 of the 61` stood
 * in this paragraph until it was measured and turned out to be 32, through a green suite.
 *
 * **Provenance is not the same for all of them, and the difference is worth stating rather than glossing.** Seven
 * captures were selected by one of the game's own searches, recorded above `FIXTURES`: a search is falsifiable, and it
 * is the only thing that can state a negative, since nothing on the screen says a Pokémon is **not** lucky. The other
 * 44 arrived as a named file, so their provenance is the name plus what the screen renders — PGSharp appends a `✨` for
 * a shiny and a `🖼` for a background, the game draws `LUCKY POKÉMON` under the nickname in green, and a shadow or a
 * purified Pokémon wears its own treatment. That is weaker, and it is why `background`, `costume`, `lucky`, `purified`,
 * `shadow` and `shiny` default to absent: a row claims one only where the capture shows it.
 *
 * **Six captures are not detail screens at all and so cannot be rows.** They are the negative cases, in `NEGATIVE`
 * below, and they assert what the readers answer on a screen none of them was written for. `overworld.png` is the map:
 * no name, no HP, no types, no overlay, so it says only that the readers do not invent. `deerling-pokedex.png` and the
 * two Nidoran Pokédex entries are the stronger half of that, because a Pokédex entry is a screen the readers partly
 * *can* read — the type icons come back correctly and every other field is absent — so they say that reading something
 * is not enough to be a Pokémon. `no-pgsharp.png` and `pgsharp-no-overlay.png` are one Squirtle captured twice, once
 * with PGSharp not running and once with its toolbar up and no overlay drawn — which makes them a control on each
 * other, since the same screen reads `CP 330` on one and `CP 390` on the other.
 *
 * **No row carries a `defects` any more, and that is a statement about the corpus rather than about the readers.** The
 * mechanism is kept — a reader that disagrees with a screen is pinned here rather than fixed here, a fix being a
 * change to what the code does and so a pull request of its own — but all fourteen keys are now unused and every
 * assertion that depended on one is a gap stated below rather than a property held.
 *
 * Twelve rows carried one until their captures left, in four kinds, and what each was worth is the reason the gaps are
 * named rather than quietly dropped. Basculin, Deerling, Genesect, Keldeo and Shellos were **forms the screen cannot
 * separate at all** — one stamina across the family, so HP says nothing and `identify` folds them to whichever name is
 * shorter — and they carried the only evidence for `MARGIN`. `thundurus-shadow.png` was a fold the printed CP would
 * have settled had the CP been read, and `nidoran-male.png` was the only capture answered as the wrong **species**,
 * both of them the cross-check doing its reporting job. `spoink.png` was the only shortlist that did not contain its
 * own level, which is what said the HP arbitrates rather than tie-breaks.
 *
 * Several kinds have gone, and `COVERAGE` and the corpus test assert their absence rather than dropping the keys, so
 * one coming back is reported: `findOverlay` no longer misses a box that is on the screen, `isFavourite` no longer
 * calls `spinda-04.png` a favourite, `tagsOn` no longer cuts away `snorlax-purified.png`'s `Perfect` chip as though it
 * were the type icons, `typesOf` no longer loses a type name Tesseract split across a space, the CP is no longer
 * misread on any capture, a height is no longer taken from under the size pill that corrupts it, a name the pass misses
 * outright is re-read off its own band rather than filed as a nickname — `articuno-kanto.png` answered `ate`, a
 * fragment of the artwork 487 pixels above the HP, where no name line was detected at all — and `readOverlay` reads
 * every IV triple in the corpus correctly, `basculin-blue.png` among them, which reads `3/3/5` for its `8/3/5` without
 * the third brightness floor.
 *
 * One reader is not asserted at all: **`parseMoves`**, because these are top-of-screen captures and the moves are below
 * the fold on every one. What it wants is a capture of a scrolled screen and nothing from the game master: the vended
 * fixture already carries all 328 moves and the per-form pools a row is matched against.
 *
 * **Two of Vitest's assertion forms are used here, and the division is a type one rather than a preference.** `expect`
 * states what a reader answered, as every other suite in this repository does. `assert.ok` states a precondition — that
 * a capture is still in the corpus, that a line was found — because it is declared `asserts value` and so narrows,
 * where `expect(…).toBeTruthy()` does not: measured, and the nine guards below that go on to read a field off what they
 * guarded are `'possibly undefined'` under `expect`. `toStrictEqual` rather than `toEqual` throughout for a second
 * measured reason — `toEqual` reads a missing property and an `undefined` one as equal, which would quietly cost the
 * whole-object assertions the very thing they exist for.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { assert, describe, expect, test } from 'vitest';
import { closest, type GameData, type IVs } from './game-master.mts';
import { decodePng } from './png.mts';
import { sizeOf, type Gender, type Size } from './badges.mts';
import { HEIGHT, parseDetail, readLines } from './detail.mts';
import { findOverlay } from './overlay.mts';

/**
 * The game master, vended beside the captures rather than downloaded: `pnpm vend:game-master` writes what a real
 * `loadGameData` answers into `fixtures/game-master.json`, so a test of a reader reaches no network — the same division
 * the hue signatures below already have, where a scan fetches an icon and the test records what it read off one. 1,449
 * forms over 1,024 species, 328 moves, eighteen type names and all 101 CP multipliers, which is every field
 * `parseDetail`, `identify` and `parseMoves` ask the game master for.
 *
 * Vended whole rather than cut down to the forms these captures can reach, which is the decision worth stating because
 * the arithmetic invites the other one: `identify` narrows by species, then by type and HP, so a closure of the
 * reachable forms is sound and a hand-written one of 122 was measured answering every assertion here identically. What
 * it cost was that each of those forms transcribed three base stats from the authority it was being checked against,
 * with nothing failing when the two disagreed — and the prose carrying that measurement had already drifted. A fixture
 * is the same claim with the copy taken out of it.
 *
 * `JSON.parse` answers `any`, so the cast is unchecked and is the one claim this file makes about the file it reads.
 * What makes a truncated or swapped fixture loud rather than silent is the test below, since a form that has quietly
 * stopped existing would otherwise surface as a reader that has stopped agreeing with a capture.
 */
const DATA = JSON.parse(readFileSync(new URL('fixtures/game-master.json', import.meta.url), 'utf8')) as GameData;

/**
 * The tag names under storage's own TAGS tab, which is the vocabulary a `--tags` run passes and the only thing that can
 * turn a chip's reading into a name: the game draws an emoji inside the pill and Tesseract reads it as letters, so
 * `Shiny ✦` comes back `Shiny SJ` and `Lucky ☘` comes back `Lucky Me`. `tagsOn` answers what it read on purpose and
 * `scripts/inventory.mts` matches it the same way, at the same slack, so this asserts the contract the CLI depends on
 * rather than the exact letters Tesseract happened to produce.
 */
const TAGS = [
  'Background',
  'Dynamax',
  'Favorites',
  'GBL',
  'Level 50',
  'Lucky',
  'Mega',
  'Perfect',
  'Purified',
  'Shadow',
  'Shiny',
];
const TAG_SLACK = 0.3;

/**
 * What a reader answers where it disagrees with the row it sits in. Its presence marks a defect pinned rather than a
 * reading confirmed, and the module docblock accounts for every kind across the corpus.
 *
 * The first group is a reader's own answer about the screen. The rest are `identify`'s, which is the end of the
 * pipeline and the only place the readers are asked to agree with each other rather than each being separately right —
 * so a row that needs none of them is a capture every reader read correctly *and* that `identify` then assembled
 * without complaint.
 *
 * `label` and `alternatives` carry what `label` writes rather than `Form` objects, because that is what the CSV carries
 * and it says `Unown (L)` where a bare species would not. `label` and not `species`, because a wrong answer can be a
 * wrong *species*: `nidoran-male.png` comes back as a `Nidoran♀`.
 */
interface Defects {
  /** Null where `findOverlay` finds no box on a screen that plainly carries an overlay. */
  box?: null;
  /** True where `isFavourite` reads gold in the star corner of a Pokémon whose star is a white outline. */
  favourite?: boolean;
  /** What the height reads as where the size pill drawn over it corrupts the digits. */
  height?: number;
  /**
   * What `readOverlay` makes of the triple where it is not what PGSharp drew: `null` where it reads nothing out of a
   * box `findOverlay` did find, and the triple itself where it reads one that is wrong.
   */
  iv?: IVs | null;
  /** The name under the artwork, which is the nickname where one is set and so carries no species to fall back on. */
  name?: string;
  /** The bracketed form `readOverlay` reads, where it is not the one PGSharp drew. */
  suffix?: string | null;
  tags?: string[];
  types?: string[];
}

/**
 * One Pokémon, as the game and the capture state it. Nothing here is a reader's answer: the readers are what these are
 * asserted against, and where one disagrees that goes in `defects` rather than softening a field.
 *
 * Ten of the attributes are optional and default to absent — no background, no costume, not a favourite, not lucky, not
 * purified, not shadow, not shiny, no size pill, no chips, and a `name` that is the species. Absence is a claim and not
 * a gap: it says the screen shows none of those, which for the rows with no search behind them is what looking at the
 * screen can state. The alternative is every field written out on every row, which nobody reads.
 */
interface Fixture {
  /** The scene behind the artwork, or absent for the game's own plain sky. Described, the game showing no label. */
  background?: string;
  /** What the artwork wears, or absent for nothing. Described rather than named, the game showing no label either. */
  costume?: string;
  /** The CP above the artwork, which `cpOf` must derive and OCR reads on only the minority the test below names. */
  cp: number;
  defects?: Defects;
  /** Whether the game draws the Dynamax treatment behind the artwork. */
  dynamax?: boolean;
  favourite?: boolean;
  file: string;
  /** Whether the game draws the Gigantamax treatment behind the artwork. */
  gigantamax?: boolean;
  /** The game master's own name for the form, `null` for a base form. */
  form: string | null;
  gender: Gender | null;
  height: number;
  hp: number;
  lucky?: boolean;
  /** The name the screen prints under the artwork, which defaults to the species and is a nickname where it differs. */
  name?: string;
  /**
   * PGSharp's overlay as it is drawn on this screen, or null where PGSharp drew none at all. One object rather than a
   * nullable level beside a nullable triple, so "this capture has no knowable level or IVs" is structural. `suffix` is
   * the bracketed form, which PGSharp appends for Unown and Spinda and nothing else.
   */
  overlay: { iv: IVs; level: number; suffix?: string } | null;
  purified?: boolean;
  shadow?: boolean;
  shiny?: boolean;
  size?: Size;
  /** The species as the game master names it, which is `identify`'s to answer and is not on a nicknamed screen. */
  species: string;
  /** The chips under the HP, as names once resolved against `TAGS`. */
  tags?: string[];
  types: string[];
  weight: number;
}

/**
 * The game's own searches that selected seven of the captures, which is where those seven rows' `size` and flags come
 * from. Recording them is the point rather than a note: a capture chosen because its sprite looked small to me is only
 * as good as my eye, where `xxs&female&!lucky&!shiny&!costume&!background&!shadow&!purified` is the game stating all
 * eight at once, falsifiably — re-run it and the first match is in the set the row claims. Negation is the half only a
 * search can give, since nothing on the screen says a Pokémon is **not** lucky.
 *
 * The other 54 rows have no search behind them. They arrived named for what they are — a form, a treatment, a costume,
 * a missing overlay — and the name is a claim about the capture that the rendered screen then has to bear out, which is
 * how each was checked. Weaker provenance, and sufficient for what those rows are for: a form the game master
 * distinguishes and `identify` must too, and a reader defect that needs a screen to stand on.
 *
 * `xurkitree.png` is here for a job its own test states rather than for its attributes: it is the only capture whose
 * status bar OCRs as a measurement, so it is the only one that can fail if a measurement's anchor stops requiring a
 * decimal point. `alola` pins its region and nothing else.
 *
 * | file             | search                                                                               |
 * |------------------|--------------------------------------------------------------------------------------|
 * | `applin.png`     | `xl&female&!lucky&!shiny&!costume&!background&!shadow&!purified`                      |
 * | `unown.png`      | `xs&unown&!male&!female&!lucky&!shiny&!costume&!background&!shadow&!purified`         |
 * | `smoliv-xxs.png` | `xxs&female&!lucky&!shiny&!costume&!background&!shadow&!purified`                     |
 * | `ho-oh.png`      | `lucky&shiny&!male&!female&!costume&!background&!shadow&!purified&!xxl&!xxs&!xs&!xl`  |
 * | `xurkitree.png`  | `alola`                                                                              |
 * | `smoliv.png`     | `male&!lucky&!shiny&!costume&!background&!shadow&!purified&!xxl&!xxs&!xs&!xl`         |
 */
const FIXTURES: readonly Fixture[] = [
  {
    cp: 286,
    file: 'applin.png',
    form: null,
    gender: 'female',
    height: 0.28,
    hp: 69,
    overlay: { iv: { attack: 10, defense: 14, stamina: 14 }, level: 15 },
    size: 'XL',
    species: 'Applin',
    types: ['Grass', 'Dragon'],
    weight: 0.95,
  },
  {
    cp: 1966,
    favourite: true,
    file: 'articuno-galar.png',
    form: 'Galarian',
    gender: null,
    height: 1.58,
    hp: 131,
    overlay: { iv: { attack: 12, defense: 4, stamina: 13 }, level: 20 },
    species: 'Articuno',
    types: ['Psychic', 'Flying'],
    weight: 47.79,
  },
  {
    cp: 1705,
    file: 'articuno-kanto.png',
    form: null,
    gender: null,
    height: 1.7,
    hp: 130,
    overlay: { iv: { attack: 13, defense: 12, stamina: 12 }, level: 20 },
    species: 'Articuno',
    types: ['Ice', 'Flying'],
    weight: 63.01,
  },
  {
    cp: 253,
    file: 'basculin-blue.png',
    form: 'Blue Striped',
    gender: 'male',
    height: 1.02,
    hp: 51,
    overlay: { iv: { attack: 8, defense: 3, stamina: 5 }, level: 5 },
    species: 'Basculin',
    types: ['Water'],
    weight: 23.31,
  },
  {
    cp: 206,
    file: 'burmy-plant.png',
    form: 'Plant',
    gender: 'male',
    height: 0.23,
    hp: 69,
    overlay: { iv: { attack: 14, defense: 15, stamina: 15 }, level: 15 },
    species: 'Burmy',
    types: ['Bug'],
    weight: 4.62,
  },
  {
    cp: 196,
    file: 'burmy-sandy.png',
    form: 'Sandy',
    gender: 'female',
    height: 0.24,
    hp: 67,
    overlay: { iv: { attack: 12, defense: 14, stamina: 11 }, level: 15 },
    species: 'Burmy',
    types: ['Bug'],
    weight: 4.57,
  },
  {
    cp: 47,
    file: 'burmy-trash.png',
    form: 'Trash',
    gender: 'male',
    height: 0.18,
    hp: 36,
    overlay: { iv: { attack: 0, defense: 7, stamina: 6 }, level: 5 },
    species: 'Burmy',
    types: ['Bug'],
    weight: 2.4,
  },
  {
    cp: 764,
    file: 'castform-normal.png',
    form: null,
    gender: 'male',
    height: 0.24,
    hp: 102,
    overlay: { iv: { attack: 10, defense: 14, stamina: 15 }, level: 17 },
    species: 'Castform',
    types: ['Normal'],
    weight: 0.49,
  },
  {
    cp: 909,
    file: 'castform-rainy.png',
    form: 'Rainy',
    gender: 'male',
    height: 0.29,
    hp: 110,
    overlay: { iv: { attack: 6, defense: 6, stamina: 4 }, level: 22 },
    species: 'Castform',
    types: ['Water'],
    weight: 0.78,
  },
  {
    cp: 746,
    file: 'castform-snowy.png',
    form: 'Snowy',
    gender: 'female',
    height: 0.36,
    hp: 102,
    overlay: { iv: { attack: 5, defense: 5, stamina: 9 }, level: 18 },
    species: 'Castform',
    types: ['Ice'],
    weight: 1.01,
  },
  {
    cp: 979,
    file: 'castform-sunny.png',
    form: 'Sunny',
    gender: 'female',
    height: 0.36,
    hp: 114,
    overlay: { iv: { attack: 15, defense: 15, stamina: 15 }, level: 21 },
    species: 'Castform',
    types: ['Fire'],
    weight: 1.26,
  },
  {
    cp: 693,
    dynamax: true,
    file: 'chansey-dynamax.png',
    form: null,
    gender: 'female',
    height: 1.36,
    hp: 298,
    overlay: { iv: { attack: 13, defense: 14, stamina: 12 }, level: 20 },
    species: 'Chansey',
    types: ['Normal'],
    weight: 57.97,
  },
  {
    cp: 1605,
    file: 'charizard-gigantamax.png',
    form: null,
    gender: 'male',
    gigantamax: true,
    height: 1.77,
    hp: 118,
    overlay: { iv: { attack: 12, defense: 12, stamina: 12 }, level: 20 },
    species: 'Charizard',
    types: ['Fire', 'Flying'],
    weight: 106.37,
  },
  {
    cp: 1025,
    file: 'cherrim-overcast.png',
    form: 'Overcast',
    gender: 'male',
    height: 0.4,
    hp: 102,
    overlay: { iv: { attack: 13, defense: 15, stamina: 9 }, level: 18 },
    species: 'Cherrim',
    types: ['Grass'],
    weight: 3.87,
  },
  {
    cp: 1658,
    file: 'cherrim-sunshine.png',
    form: 'Sunny',
    gender: 'male',
    height: 0.61,
    hp: 132,
    overlay: { iv: { attack: 10, defense: 7, stamina: 7 }, level: 31 },
    shiny: true,
    species: 'Cherrim',
    types: ['Grass'],
    weight: 12.82,
  },
  {
    cp: 1441,
    file: 'deoxys-attack.png',
    form: 'Attack',
    gender: null,
    height: 1.95,
    hp: 90,
    overlay: { iv: { attack: 14, defense: 13, stamina: 14 }, level: 20 },
    species: 'Deoxys',
    types: ['Psychic'],
    weight: 81.38,
  },
  {
    cp: 1569,
    file: 'deoxys-defense.png',
    form: 'Defense',
    gender: null,
    height: 1.56,
    hp: 100,
    overlay: { iv: { attack: 11, defense: 11, stamina: 14 }, level: 25 },
    species: 'Deoxys',
    types: ['Psychic'],
    weight: 44.29,
  },
  {
    cp: 1772,
    file: 'deoxys-normal.png',
    form: '',
    gender: null,
    height: 1.94,
    hp: 90,
    overlay: { iv: { attack: 11, defense: 13, stamina: 15 }, level: 20 },
    species: 'Deoxys',
    types: ['Psychic'],
    weight: 77.83,
  },
  {
    cp: 2009,
    file: 'deoxys-speed.png',
    form: 'Speed',
    gender: null,
    height: 1.73,
    hp: 101,
    overlay: { iv: { attack: 12, defense: 10, stamina: 15 }, level: 25 },
    species: 'Deoxys',
    types: ['Psychic'],
    weight: 63.93,
  },
  {
    cp: 2848,
    file: 'dialga-altered.png',
    form: null,
    gender: null,
    height: 6.82,
    hp: 146,
    overlay: { iv: { attack: 12, defense: 15, stamina: 14 }, level: 25 },
    size: 'XL',
    species: 'Dialga',
    types: ['Steel', 'Dragon'],
    weight: 1077.24,
  },
  {
    cp: 2845,
    file: 'dialga-origin.png',
    form: 'Origin',
    gender: null,
    height: 6.6,
    hp: 145,
    overlay: { iv: { attack: 10, defense: 13, stamina: 13 }, level: 25 },
    species: 'Dialga',
    types: ['Steel', 'Dragon'],
    weight: 809.96,
  },
  {
    background: 'a city skyline across a river',
    costume: 'a pale cap',
    cp: 451,
    file: 'eevee-background.png',
    form: null,
    gender: 'male',
    height: 0.24,
    hp: 83,
    overlay: { iv: { attack: 13, defense: 15, stamina: 15 }, level: 15 },
    species: 'Eevee',
    types: ['Normal'],
    weight: 4.24,
  },
  {
    cp: 738,
    file: 'growlithe-nickname.png',
    form: 'Hisuian',
    gender: 'male',
    height: 0.91,
    hp: 100,
    name: 'Nickname',
    overlay: { iv: { attack: 14, defense: 12, stamina: 14 }, level: 20 },
    species: 'Growlithe',
    types: ['Fire', 'Rock'],
    weight: 25.31,
  },
  {
    cp: 2738,
    favourite: true,
    file: 'ho-oh.png',
    form: null,
    gender: null,
    height: 4.6,
    hp: 152,
    lucky: true,
    name: '96%',
    overlay: { iv: { attack: 13, defense: 15, stamina: 15 }, level: 25 },
    shiny: true,
    species: 'Ho-Oh',
    tags: ['Shiny', 'Lucky'],
    types: ['Fire', 'Flying'],
    weight: 246.49,
  },
  {
    cp: 1679,
    favourite: true,
    file: 'meloetta-aria.png',
    form: 'Aria',
    gender: null,
    height: 0.69,
    hp: 122,
    overlay: { iv: { attack: 13, defense: 15, stamina: 12 }, level: 15 },
    species: 'Meloetta',
    types: ['Normal', 'Psychic'],
    weight: 8.2,
  },
  {
    cp: 446,
    file: 'meowth-alola.png',
    form: 'Alola',
    gender: 'male',
    height: 0.38,
    hp: 74,
    overlay: { iv: { attack: 14, defense: 13, stamina: 2 }, level: 21 },
    species: 'Meowth',
    types: ['Dark'],
    weight: 4.7,
  },
  {
    cp: 571,
    file: 'meowth-galar.png',
    form: 'Galarian',
    gender: 'male',
    height: 0.3,
    hp: 88,
    overlay: { iv: { attack: 14, defense: 12, stamina: 11 }, level: 20 },
    species: 'Meowth',
    types: ['Steel'],
    weight: 4.22,
  },
  {
    cp: 423,
    file: 'meowth-kanto.png',
    form: null,
    gender: 'male',
    height: 0.36,
    hp: 80,
    overlay: { iv: { attack: 15, defense: 14, stamina: 14 }, level: 20 },
    species: 'Meowth',
    types: ['Normal'],
    weight: 3.88,
  },
  {
    cp: 325,
    file: 'pikachu.png',
    form: null,
    gender: 'male',
    height: 0.39,
    hp: 59,
    overlay: { iv: { attack: 4, defense: 9, stamina: 9 }, level: 14 },
    species: 'Pikachu',
    types: ['Electric'],
    weight: 5.72,
  },
  {
    costume: "Ash's red-and-white cap",
    cp: 489,
    file: 'pikachu-ash-hat.png',
    form: null,
    gender: 'female',
    height: 0.37,
    hp: 72,
    overlay: { iv: { attack: 9, defense: 2, stamina: 8 }, level: 21 },
    species: 'Pikachu',
    types: ['Electric'],
    weight: 4.54,
  },
  {
    costume: 'a Santa hat',
    cp: 577,
    favourite: true,
    file: 'pikachu-santa-hat.png',
    form: null,
    gender: 'male',
    height: 0.4,
    hp: 76,
    overlay: { iv: { attack: 14, defense: 8, stamina: 9 }, level: 23 },
    species: 'Pikachu',
    types: ['Electric'],
    weight: 7.32,
  },
  {
    costume: "Willow's lab coat and goggles",
    cp: 385,
    file: 'pikachu-willows-assistant.png',
    form: null,
    gender: 'male',
    height: 0.35,
    hp: 63,
    overlay: { iv: { attack: 13, defense: 13, stamina: 11 }, level: 15 },
    species: 'Pikachu',
    types: ['Electric'],
    weight: 3.41,
  },
  {
    costume: 'a purple witch hat',
    cp: 625,
    file: 'pikachu-witch-hat.png',
    form: null,
    gender: 'female',
    height: 0.38,
    hp: 83,
    overlay: { iv: { attack: 2, defense: 11, stamina: 10 }, level: 27 },
    species: 'Pikachu',
    types: ['Electric'],
    weight: 5.61,
  },
  {
    cp: 813,
    file: 'rotom-wash.png',
    form: 'Wash',
    gender: null,
    height: 0.31,
    hp: 63,
    overlay: { iv: { attack: 13, defense: 3, stamina: 1 }, level: 12 },
    species: 'Rotom',
    types: ['Electric', 'Water'],
    weight: 0.29,
  },
  {
    cp: 340,
    file: 'smoliv.png',
    form: null,
    gender: 'female',
    height: 0.15,
    hp: 68,
    overlay: { iv: { attack: 11, defense: 10, stamina: 12 }, level: 15 },
    size: 'XXS',
    species: 'Smoliv',
    types: ['Grass', 'Normal'],
    weight: 0.97,
  },
  {
    cp: 2304,
    favourite: true,
    file: 'snorlax-purified.png',
    form: null,
    gender: 'female',
    height: 2.05,
    hp: 230,
    overlay: null,
    purified: true,
    species: 'Snorlax',
    tags: ['Perfect'],
    types: ['Normal'],
    weight: 383.9,
  },
  {
    cp: 511,
    file: 'spinda-04.png',
    form: '04',
    gender: 'male',
    height: 1.16,
    hp: 87,
    overlay: { iv: { attack: 13, defense: 13, stamina: 15 }, level: 15, suffix: '04' },
    species: 'Spinda',
    types: ['Normal'],
    weight: 5.43,
  },
  {
    cp: 247,
    file: 'spoink.png',
    form: null,
    gender: 'male',
    height: 1.1,
    hp: 59,
    overlay: { iv: { attack: 14, defense: 4, stamina: 14 }, level: 7 },
    size: 'XXL',
    species: 'Spoink',
    types: ['Psychic'],
    weight: 43.83,
  },
  {
    cp: 487,
    file: 'unown-b.png',
    form: 'B',
    gender: null,
    height: 0.53,
    hp: 75,
    overlay: { iv: { attack: 7, defense: 10, stamina: 7 }, level: 16, suffix: 'B' },
    species: 'Unown',
    types: ['Psychic'],
    weight: 3.69,
  },
  {
    cp: 517,
    file: 'unown-exclamation.png',
    form: 'Exclamation Point',
    gender: null,
    height: 0.38,
    hp: 79,
    overlay: { iv: { attack: 10, defense: 13, stamina: 14 }, level: 16, suffix: '[' },
    species: 'Unown',
    types: ['Psychic'],
    weight: 3.86,
  },
  {
    cp: 839,
    file: 'unown-m.png',
    form: 'M',
    gender: null,
    height: 0.63,
    hp: 98,
    overlay: { iv: { attack: 8, defense: 7, stamina: 5 }, level: 28, suffix: 'M' },
    shiny: true,
    species: 'Unown',
    types: ['Psychic'],
    weight: 7.94,
  },
  {
    cp: 486,
    file: 'unown-question.png',
    form: 'Question Mark',
    gender: null,
    height: 0.45,
    hp: 76,
    overlay: { iv: { attack: 4, defense: 12, stamina: 10 }, level: 16, suffix: '\\' },
    species: 'Unown',
    types: ['Psychic'],
    weight: 3.86,
  },
  {
    cp: 2197,
    file: 'xurkitree.png',
    form: null,
    gender: null,
    height: 5.78,
    hp: 124,
    overlay: { iv: { attack: 11, defense: 12, stamina: 14 }, level: 20 },
    size: 'XXL',
    species: 'Xurkitree',
    types: ['Electric'],
    weight: 162.2,
  },
];

/**
 * Everything the readers answer about one capture. Each attribute is then a test of its own under that capture's
 * `describe`, so a failure names the reader that broke where one `toStrictEqual` over the lot says only that the
 * object differs.
 *
 * Memoised by file, which is what keeps that affordable: OCR is the whole cost of this suite at about four seconds a
 * capture, and six of the tests below read a capture the loop has already read. Caching the promise rather than the
 * reading is what makes that hold whatever order the runner takes them in. Nothing mutates a reading, and a screenshot
 * is the same screenshot every time it is read, so there is nothing for a shared one to carry between tests.
 */
const read = async (file: string) => {
  const image = decodePng(readFileSync(new URL(`fixtures/${file}`, import.meta.url)));
  const lines = await readLines(image);
  const detail = await parseDetail(lines, DATA, image);
  const found = await findOverlay(image);

  return { image, lines, detail, box: found?.box ?? null, overlay: found?.overlay ?? null };
};

const readings = new Map<string, ReturnType<typeof read>>();

const readingOf = (file: string) => {
  // Forgotten again if it rejects, because what rejects here is the machine rather than the capture: Tesseract runs
  // some thousands of times over a suite and the kernel occasionally kills one. Remembering the rejection made that one
  // flake fail every later test that touches the same capture, which reads as four unrelated failures rather than one
  // retry.
  const reading =
    readings.get(file) ??
    read(file).catch((error: unknown) => {
      readings.delete(file);

      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    });

  readings.set(file, reading);

  return reading;
};

/**
 * The overlay a row claims, in the two stages the readers fail at — a row that conflated them could not say which went
 * wrong. A box is found unless the row carries `defects.box`; the triple is read out of it unless the row carries
 * `defects.iv` as well. Both are `in` tests rather than `??`, the defect in each case being a `null` that a `??` would
 * read as no defect at all.
 *
 * A function rather than two lines in the loop because `COVERAGE` counts the same thing, and two copies of this would
 * be free to disagree about what the corpus holds.
 */
const overlayOf = (fixture: Fixture) => {
  const defects = fixture.defects ?? {};
  const boxed = fixture.overlay !== null && !('box' in defects);
  const legible = boxed && !('iv' in defects) ? fixture.overlay : null;

  return { boxed, legible };
};

for (const fixture of FIXTURES) {
  const defects = fixture.defects ?? {};

  // The name the screen prints, which defaults to the species — so a row states a nickname once and the reader's
  // expectation derives from it.
  const name = fixture.name ?? fixture.species;
  const { boxed, legible } = overlayOf(fixture);
  const truth = fixture.form ? `${fixture.species} (${fixture.form})` : fixture.species;

  describe(`${fixture.file} reads as the ${truth} on the screen`, () => {
    test('size', async () => expect((await readingOf(fixture.file)).detail.size).toBe(fixture.size ?? null));
    test('gender', async () => expect((await readingOf(fixture.file)).detail.gender).toBe(fixture.gender));
    test('hp', async () => expect((await readingOf(fixture.file)).detail.hp).toBe(fixture.hp));
    test('name', async () => expect((await readingOf(fixture.file)).detail.name).toBe(defects.name ?? name));
    test('weight', async () => expect((await readingOf(fixture.file)).detail.weight).toBe(fixture.weight));

    test('height', async () =>
      expect((await readingOf(fixture.file)).detail.height).toBe(defects.height ?? fixture.height));

    test('types', async () =>
      expect((await readingOf(fixture.file)).detail.types).toStrictEqual(defects.types ?? fixture.types));

    test('favourite', async () =>
      expect((await readingOf(fixture.file)).detail.favourite).toBe(defects.favourite ?? fixture.favourite ?? false));

    test('tags', async () => {
      const { detail } = await readingOf(fixture.file);

      expect(detail.tags.map((chip) => closest(chip, TAGS, (tag) => tag, TAG_SLACK))).toStrictEqual(
        defects.tags ?? fixture.tags ?? [],
      );
    });

    // Whether a box was found is asserted apart from what was read out of it, because the two are different defects and
    // a reader fixed at either stage has to fail here. Nine captures carry no overlay at all, and on three of those
    // nine PGSharp really drew one.
    test('overlay found', async () => expect((await readingOf(fixture.file)).box !== null).toBe(boxed));

    test('overlay ivs', async () =>
      expect((await readingOf(fixture.file)).overlay?.iv ?? null).toStrictEqual(
        ('iv' in defects ? defects.iv : legible?.iv) ?? null,
      ));

    test('overlay form', async () =>
      expect((await readingOf(fixture.file)).overlay?.form ?? null).toBe(
        ('suffix' in defects ? defects.suffix : legible?.suffix) ?? null,
      ));
  });
}

/**
 * The six captures that are not detail screens, which is why they are not rows: there is no Pokémon on them to state.
 * They are asserted below instead, as what the readers answer on a screen none of them was written for.
 */
const NEGATIVE = [
  'deerling-pokedex.png',
  'nidoran-female-pokedex.png',
  'nidoran-male-pokedex.png',
  'no-pgsharp.png',
  'overworld.png',
  'pgsharp-no-overlay.png',
];

/**
 * What the three tests that read the whole corpus in one body are given, where `--testTimeout` leaves everything else
 * the 60s a single capture needs fifteen times over.
 *
 * They need it because a test is only as warm as whatever ran before it. All three pass on the full suite without this,
 * since Vitest takes a file in declaration order and the `describe` blocks above have filled the memo by then — but
 * that is a coupling rather than a guarantee, and it is one `node --test` hid by having no default timeout at all.
 * Measured rather than reasoned about: `-t 'the CP is read off'` on its own fails at exactly 60s, because nothing has
 * warmed it and the corpus is about four seconds a capture.
 */
const WHOLE_CORPUS_TIMEOUT = 600_000;

/**
 * That every committed capture is accounted for, which is the one thing about this corpus no row can say. A PNG added
 * to `fixtures/` and left out of `FIXTURES` costs nothing and reports nothing — the suite goes on passing at whatever
 * size it was, and the capture sits in the tree looking exactly like a capture that is pinned. So the directory is the
 * authority and the table is checked against it, in both directions: a row naming a file that is gone fails here too,
 * where otherwise it would fail as an unreadable file in the middle of an unrelated reader's own test.
 */
test('every committed capture is either a row or a negative case', () => {
  const committed = readdirSync(new URL('fixtures', import.meta.url))
    .filter((file) => file.endsWith('.png'))
    .sort();

  expect(committed).toStrictEqual([...FIXTURES.map((f) => f.file), ...NEGATIVE].sort());
});

/**
 * Every figure this file's own docblock quotes about the shape of the corpus, in one place that fails when one of them
 * stops being true. The case for it is not that a count is interesting: it is that the docblock claimed the CP
 * cross-check lands on **39** of the 61 for as long as nobody measured it, where it was 32, and nothing in a green
 * suite could have said so. Prose is the one part of a test file that no test reads.
 *
 * So each key is a sentence in the docblock above, and changing the corpus is meant to fail here and send you back to
 * that paragraph. Counted off `FIXTURES` and `overlayOf`, so this is free and cannot disagree with the loop.
 */
const COVERAGE = {
  rows: 43,
  negatives: 6,
  noDefects: 43,
  noOverlayDrawn: 1,
  boxNotFound: 0,
  overlayNotRead: 0,
};

test('the corpus is the shape the docblock says it is', () => {
  expect(
    {
      rows: FIXTURES.length,
      negatives: NEGATIVE.length,
      noDefects: FIXTURES.filter((f) => f.defects === undefined).length,
      noOverlayDrawn: FIXTURES.filter((f) => f.overlay === null).length,
      boxNotFound: FIXTURES.filter((f) => f.defects && 'box' in f.defects).length,
      overlayNotRead: FIXTURES.filter((f) => f.defects && 'iv' in f.defects).length,
    },
    'the docblock above quotes these figures; update both or neither',
  ).toStrictEqual(COVERAGE);
});

/**
 * The vended game master's own shape, pinned for the reason the corpus's is: the `DATA` docblock quotes these five
 * figures and prose is the one part of a test file no test reads. Each is what `pnpm vend:game-master` printed as it
 * wrote the file, so this is also the only thing standing between a fixture truncated or swapped and a reader that has
 * merely stopped agreeing with a capture — the cast above it is unchecked, `JSON.parse` answering `any`.
 *
 * Expect it to move when upstream releases a species, and read that as the vend being reviewed rather than as the suite
 * breaking: a form arriving that shares a dex, its types and its stamina with one of the captures really does change
 * what `identify` answers about that Pokémon, and the diff is where that is visible.
 */
test('the vended game master is the shape the readers are asserted against', () => {
  expect(
    {
      forms: DATA.forms.length,
      species: DATA.species.length,
      moves: DATA.moves.length,
      types: DATA.types.length,
      cpm: DATA.cpm.length,
    },
    'the `DATA` docblock quotes these figures; re-vend and update both or neither',
  ).toStrictEqual({ forms: 1449, species: 1024, moves: 328, types: 18, cpm: 101 });
});

/**
 * Which captures the CP is read off, and what it is read as — the one thing the rows cannot say, since each of them
 * states the number the game printed and a `cpOn` answering null for everything would pass every row. It is a minority
 * of them because the CP is white text over the artwork and the hardest thing on the screen to make out.
 *
 * Asserted as the whole map rather than as a count, so a reader losing one capture and gaining another cannot come out
 * even, and the four misreads are then **derived** from it rather than transcribed a second time: a row already states
 * what the screen shows, so the disagreement is a filter and not a list to keep in step. Three of the four are an order
 * of magnitude out, the leading digit having been lost to the artwork behind it, and `unown-b.png` loses two.
 */
test(
  'the CP is read off 25 captures, and no longer wrongly on any',
  async () => {
    const states = new Map<string, number>();

    for (const fixture of FIXTURES) {
      const { detail } = await readingOf(fixture.file);

      if (detail.cp !== null) {
        states.set(fixture.file, detail.cp);
      }
    }

    expect(Object.fromEntries(states), 'which captures state a CP, or what they state, has changed').toStrictEqual({
      'articuno-kanto.png': 1705,
      'basculin-blue.png': 253,
      'burmy-plant.png': 206,
      'burmy-sandy.png': 196,
      'castform-rainy.png': 909,
      'castform-snowy.png': 746,
      'castform-sunny.png': 979,
      'charizard-gigantamax.png': 1605,
      'cherrim-sunshine.png': 1658,
      'deoxys-attack.png': 1441,
      'deoxys-defense.png': 1569,
      'dialga-altered.png': 2848,
      'growlithe-nickname.png': 738,
      'meowth-alola.png': 446,
      'pikachu-willows-assistant.png': 385,
      'pikachu-witch-hat.png': 625,
      'pikachu.png': 325,
      'rotom-wash.png': 813,
      'smoliv.png': 340,
      'unown-b.png': 487,
      'unown-m.png': 839,
      'unown-question.png': 486,
      'xurkitree.png': 2197,
    });

    // And which of them it reads *wrongly*, derived from the map rather than listed again — a row already states what
    // the screen shows, so a disagreement is a filter and not a second list to keep in step. It is empty, which is the
    // whole measurement: `castform-snowy.png` read 46 for 746, `shellos-east.png` 84 for 784, `unown-b.png` 48 for 487
    // and `deoxys-defense.png` 15 for 1569, and the band rescue reads all four. Asserted as empty rather than deleted,
    // since a misread coming back is exactly what this existed to catch.
    expect(
      FIXTURES.filter((f) => states.has(f.file) && states.get(f.file) !== f.cp).map((f) => f.file),
      'a capture has started misreading its CP again',
    ).toStrictEqual([]);
  },
  WHOLE_CORPUS_TIMEOUT,
);

/**
 * The two properties of the shortlist PGSharp's level is read as that make the rest of the pipeline's level handling
 * able to fail at all. They are asserted off the captures rather than written into the table, a shortlist being a
 * reading rather than a fact about a Pokémon.
 *
 * The first is that some capture offers a level **above** its true one, which is what an HP test admitting any HP at or
 * above the one read needs in order to be caught: against `articuno-kanto.png`'s `[2, 20, 8]`, whose largest member is
 * already the answer, such a break cannot move anything. `applin.png` offers `51` for a level 15, and 23 of the 42 do
 * the same.
 *
 * The second is that some capture's shortlist does **not** contain its true level, which is what says the HP is the
 * arbiter rather than a tie-breaker: `spoink.png` offers `1` alone for a Pokémon at level 7, the only capture that
 * does. Without it, a `levelsOf` that merely filtered the stated list would pass every assertion here.
 */
test(
  'the shortlists the overlay states both overshoot a true level and miss one',
  async () => {
    const stated = new Map<string, readonly number[]>();

    for (const fixture of FIXTURES) {
      const { overlay } = await readingOf(fixture.file);
      stated.set(fixture.file, overlay?.levels ?? []);
    }

    const offered = FIXTURES.filter((f) => f.overlay !== null && stated.get(f.file)?.length);
    expect(offered.length, 'how many overlays are read has changed, so these two properties say less').toBe(42);
    assert.ok(
      offered.some((f) => stated.get(f.file)?.some((level) => level > (f.overlay?.level ?? 0))),
      'no shortlist offers a level above the true one, so nothing can catch an HP test that is not exact',
    );
    assert.ok(
      offered.some((f) => !stated.get(f.file)?.includes(f.overlay?.level ?? 0)),
      'every shortlist contains its own level, so nothing says the HP is what settles it',
    );
  },
  WHOLE_CORPUS_TIMEOUT,
);

/**
 * That `fixtures/xurkitree.png` still carries the line its row is here for. This is the half of a regression
 * fixture that gets left out: the row above asserts what the readers answer, and would answer exactly the same on a
 * capture whose status bar held nothing to trip over — so the trap has to be asserted present rather than assumed. A
 * capture is a file and cannot change, but which lines Tesseract finds in it can, so what this really pins is that the
 * decoy is still being read.
 */
test('the status-bar fixture carries a line a loose measurement would take', async () => {
  const { image, lines } = await readingOf('xurkitree.png');
  const decoy = lines.find((line) => /\d+\s*m\b/i.test(line.text));
  const height = lines.find((line) => /\d+[.,]\d+\s*m\b/i.test(line.text));

  assert.ok(decoy, 'nothing on the screen reads as a measurement at all');
  assert.ok(height, 'the capture has lost its height');
  expect(decoy, `nothing above ${JSON.stringify(height.text)} reads as a loose measurement`).not.toBe(height);
  assert.ok(decoy.top < image.height * 0.1, `the decoy ${JSON.stringify(decoy.text)} is not in the status bar`);
});

/**
 * One stray coloured pixel in the size badge's band, which no capture happens to carry and any could: the band is
 * cropped from the screen round the height, artwork and all. Placed at the band's far corner from the pill, where a crop
 * to every coloured pixel would take in the white panel between them, and the white text isolated out of that comes
 * back as nothing.
 */
test('a stray coloured pixel beside the size pill does not cost the badge', async () => {
  const { image, lines } = await readingOf('smoliv.png');
  const height = lines.find((l) => HEIGHT.test(l.text));
  assert.ok(height, 'smoliv.png has no height line to find the badge by');

  const stray = { ...image, data: Uint8Array.from(image.data) };
  const at = (Math.round(height.top - height.height * 1.9) * image.width + Math.round(height.left - height.height)) * 4;
  stray.data.set([255, 0, 0], at);

  expect(await sizeOf(stray, height)).toBe('XXS');
});

/**
 * `fixtures/overworld.png` is the map, and this is what the detail readers answer on it: nothing, in every field. That
 * is the half a corpus of valid screens cannot state — every row asserts that a reader found the right thing and not
 * one of them asserts that a reader declines to find a thing that is not there, so a `hpOn` returning a constant would
 * pass every row it appears in. Written as one `toStrictEqual` over the whole `Detail` rather than ten assertions,
 * because the claim is about the object and a field added to `Detail` should fail here until it is accounted for.
 */
test('overworld.png is the map, and every reader declines it', async () => {
  const { detail, box } = await readingOf('overworld.png');

  expect(box, 'a band of the map read as an overlay').toBe(null);
  expect({ ...detail }).toStrictEqual({
    cp: null,
    cps: [],
    favourite: false,
    gender: null,
    height: null,
    hp: null,
    name: null,
    size: null,
    tags: [],
    types: [],
    weight: null,
  });
});

/**
 * That the overlay sweep declines every screen that is not a detail screen with an overlay on it. A box found on one
 * would be worse than none: the sweep runs over the middle 70% of every screen a walk opens, and a false box is read as
 * a level and three IVs.
 */
test(
  'no screen without an overlay on it reads as having one',
  async () => {
    const found: string[] = [];

    for (const file of NEGATIVE) {
      if ((await readingOf(file)).box !== null) {
        found.push(file);
      }
    }

    expect(found, 'a band of a screen with no overlay on it read as one').toStrictEqual([]);
  },
  WHOLE_CORPUS_TIMEOUT,
);

/**
 * The three Pokédex entries, which are the stronger half of the negative cases: a screen the readers partly *can* read.
 * The type icons come back correctly and every other field is absent, so they say that reading something is not
 * enough to be a Pokémon — no HP, no name and no CP is invented out of a page that has a species on it.
 */
test('a Pokédex entry reads as its types and nothing else', async () => {
  const absent = {
    cp: null,
    cps: [],
    favourite: false,
    gender: null,
    height: null,
    hp: null,
    name: null,
    size: null,
    tags: [],
    weight: null,
  };

  for (const [file, types] of [
    ['deerling-pokedex.png', ['Normal', 'Grass']],
    ['nidoran-female-pokedex.png', ['Poison']],
    ['nidoran-male-pokedex.png', ['Poison']],
  ] as const) {
    expect({ ...(await readingOf(file)).detail }, file).toStrictEqual({ ...absent, types });
  }
});

/**
 * One Squirtle captured twice, once with PGSharp not running at all and once with its toolbar up and no overlay drawn.
 * That makes the pair a control on each other rather than two similar captures: the same Pokémon on the same screen,
 * so every field of the two readings must agree, and whatever does differ is attributable to the toolbar alone.
 *
 * Exactly one thing does, and it is the CP — `330` where PGSharp is absent and the `390` the screen prints where it is
 * there. Which is a reading rather than a fact about the Pokémon, so it is asserted per capture rather than as a row's
 * `cp`: nothing about the toolbar should move it, and it is worth knowing that it does.
 *
 * `identify` is called here where it is not called on the map above, because the species, the types and the HP are all
 * read and so it is narrowed to one form by the same filters every row relies on. With no overlay there is no level and
 * so no CP, and the point is that it says so without a note — an absent overlay is the ordinary case and not a defect.
 */
test('the two Squirtle captures agree on everything but the CP each reads', async () => {
  const bare = await readingOf('no-pgsharp.png');
  const toolbar = await readingOf('pgsharp-no-overlay.png');

  expect({ ...bare.detail, cp: null }).toStrictEqual({ ...toolbar.detail, cp: null });
  expect(bare.detail.cp, 'the capture PGSharp is absent from no longer misreads its CP').toBe(330);
  expect(toolbar.detail.cp, 'the capture with the toolbar up no longer reads the CP the screen prints').toBe(390);
});

/**
 * The distinct values a column of the table holds, as words. Written out rather than left to `Array#sort`, which
 * stringifies an `undefined` and so files it after every capital letter — `['XL', 'XS', 'XXL', 'XXS', undefined]`,
 * which is the right set in an order nobody would write down on purpose.
 */
const distinct = (rows: readonly Fixture[], of: (row: Fixture) => unknown): string[] =>
  [...new Set(rows.map((row) => String(of(row))))].sort();

test('the corpus reaches both sides of every attribute', () => {
  for (const flag of ['favourite', 'lucky', 'purified', 'shiny'] as const) {
    assert.ok(
      FIXTURES.some((f) => f[flag]) && FIXTURES.some((f) => !f[flag]),
      `every capture is ${flag} or none is, so nothing separates the two`,
    );
  }

  // `shadow` is the fifth of those and cannot be asserted that way any more: `thundurus-shadow.png` was the only
  // capture carrying one and it has left the corpus, so the column is false on all 41. Stated here as the gap it is —
  // which is what this file did before that capture arrived, and what brought it in — rather than quietly dropping
  // `shadow` from the list above and leaving a reader to find the hole.
  expect(
    FIXTURES.filter((f) => f.shadow).map((f) => f.file),
    'a shadow capture is back, so `shadow` belongs in the loop above again',
  ).toStrictEqual([]);

  for (const described of ['background', 'costume'] as const) {
    assert.ok(
      FIXTURES.some((f) => f[described] !== undefined) && FIXTURES.some((f) => f[described] === undefined),
      `every capture wears a ${described} or none does, so nothing separates the two`,
    );
  }

  expect(
    distinct(FIXTURES, (f) => f.size),
    'three of the four bands and none; no capture wears an `XS`, which is a gap and not a licence to drop the band',
  ).toStrictEqual(['XL', 'XXL', 'XXS', 'undefined']);
  expect(distinct(FIXTURES, (f) => f.gender)).toStrictEqual(['female', 'male', 'null']);
  assert.ok(
    FIXTURES.some((f) => !f.form) && FIXTURES.some((f) => Boolean(f.form)),
    'every capture is a named form or none is, so nothing separates a form name from a base one',
  );
  assert.ok(
    FIXTURES.some((f) => (f.tags ?? []).length > 1) && FIXTURES.some((f) => (f.tags ?? []).length === 1),
    'no capture carries two chips beside one that carries a single chip, so nothing says the columns separate them',
  );
  assert.ok(FIXTURES.some((f) => f.types.length === 2) && FIXTURES.some((f) => f.types.length === 1));

  // A name the species list answers against one it does not, which is what separates `identify`'s `species` from its
  // `nickname`. Three captures print a nickname, and two of those print `96%`.
  assert.ok(
    FIXTURES.some((f) => f.name !== undefined) && FIXTURES.some((f) => f.name === undefined),
    'nothing separates a name that matched a species from one left as a nickname',
  );

  // Both kinds of absent overlay, which the loop asserts apart and so a corpus holding one kind alone would let it
  // conflate. Only one of the two is left in the corpus, and that is the measurement rather than a hole: `findOverlay`
  // has stopped missing a box that is on the screen, so no capture needs `defects.box` any more. Asserted as an empty
  // list rather than dropped, because a capture needing it again is a regression this reports and silence would absorb.
  assert.ok(
    FIXTURES.some((f) => f.overlay === null),
    'no capture is left where PGSharp drew no overlay at all, which is one of the two ways to have no box',
  );
  expect(
    FIXTURES.filter((f) => f.defects && 'box' in f.defects).map((f) => f.file),
    'a capture needs `defects.box` again, so `findOverlay` has started missing a box that is on the screen',
  ).toStrictEqual([]);

  // The same shape for the types, and the same reason. `typesOf` used to read `[]` for both Nidoran, whose type band
  // comes back `IT POISO N` — a name Tesseract split, which an exact word match takes neither half of. Those two were
  // the only captures with no type read at all, so this is the whole of what says the reader has not begun losing a
  // pair again, and it names the files rather than counting them because the two it covers are the only two it could.
  expect(
    FIXTURES.filter((f) => f.defects && 'types' in f.defects).map((f) => f.file),
    'a capture needs `defects.types` again, so `typesOf` has started reading no type off a screen that states one',
  ).toStrictEqual([]);

  // And both kinds of bracketed form, which is what says `identify` matches a suffix against a form name exactly: four
  // captures carry a suffix that names a form of their species and two carry one that names no form at all, those
  // being PGSharp's `[` and `\` for Unown's two punctuation forms.
  assert.ok(
    FIXTURES.some((f) => f.overlay?.suffix !== undefined && f.overlay.suffix === f.form) &&
      FIXTURES.some((f) => f.overlay?.suffix !== undefined && f.overlay.suffix !== f.form),
    'nothing separates a bracketed form that names one from a bracketed form that names nothing',
  );

  // No row carries a `defects` at all any more, so the two claims this used to make are both gaps now and are stated
  // as such. One was that a label can name a different **species** — `nidoran-male.png` came back as a `Nidoran♀` and
  // `ho-oh.png` as a Charizard — which is what justifies `defects.label` over a `defects.species` beside the row's own
  // form. The other was simply that some reader disagrees with some screen, which is what every `defects` key exists
  // for and what the key census below is counting.
  expect(
    FIXTURES.filter((f) => f.defects !== undefined).map((f) => f.file),
    'a row carries a `defects` again, so the claims the docblock records as gaps can be made once more',
  ).toStrictEqual([]);

  // Which `Defects` keys any capture pins, as the whole set rather than one `ok` per key, so that a key arriving is as
  // loud as a key leaving. The keys rather than the values, because some of the defects are `null` — a triple never
  // read, a suffix that reads as nothing — and a truth test would file those as absent. A key nothing pins is a reader
  // free to change its answer unremarked, which is the same hazard an unasserted field is and reads exactly the same
  // way.
  //
  // All fourteen are absent now, and the set is asserted rather than the test deleted so that one coming back is as
  // loud as it ever was. What it can no longer say is *why* each is absent, and the two reasons are not the same.
  // `box`, `favourite`, `height`, `nickname`, `suffix`, `tags` and `types` emptied because a reader was repaired:
  // `findOverlay` finds a box on every screen that carries one, `isFavourite` no longer calls `spinda-04.png` a
  // favourite, a badged height is re-read off its own line, no name the pass misses is filed as a nickname, and
  // `tagsOn` reads `snorlax-purified.png`'s chip. `alternatives`, `cp`, `iv`, `label`, `levels`, `name` and `notes`
  // emptied because the captures that pinned them left the corpus, which repairs nothing — `typesOf`'s pair of
  // Nidoran, `readOverlay`'s `basculin-blue.png` triple, and every row the fold or the CP cross-check reported on.
  expect(
    [...new Set(FIXTURES.flatMap((f) => Object.keys(f.defects ?? {})))].sort(),
    'a reader has started or stopped disagreeing with the screen about something',
  ).toStrictEqual([]);

  // And the other side of it, which the keys above cannot give: that some capture carries no defect at all. Without it
  // a reader that was wrong everywhere would pass every row it had a `defects` entry in.
  assert.ok(
    FIXTURES.some((f) => f.defects === undefined),
    'every capture carries a defect, so nothing says a reader ever agrees with its screen outright',
  );
});
