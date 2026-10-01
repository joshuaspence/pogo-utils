/**
 * What the detail screen's readers make of real screens, over a corpus of eight captures committed beside this file.
 *
 * Every reader here is a pure function of a screenshot, so the only thing a test of them needs is the screenshot — no
 * phone and no network. The game master it needs is small and derived rather than downloaded: eighteen type names for
 * `parseDetail`, and for `identify` 38 forms and the CP multiplier table, each read once out of a real
 * `loadGameData('.cache/inventory')` and recorded below with what it answered. Downloading it per run is 23 MB.
 *
 * **Each fixture was selected by a search that pins every attribute at once, and the search is in the table.** That is
 * the point of it rather than a note: a capture chosen because a sprite looked small to me is only as good as my eye,
 * where `xxs&female&!lucky&!shiny&!costume&!background&!shadow&!purified` is the game stating all eight, falsifiably —
 * re-run it and the first match is in the set the row claims. So a row's `size` and `gender` are the game's answers and
 * the assertions are what the readers must agree with, not the other way round. Where no search can speak — a weight, a
 * height, the IVs PGSharp draws — the row's figure was read off the rendered capture by eye instead, which is why each
 * attribute is asserted on its own rather than as one object: a failure should name the reader that broke.
 *
 * `fixtures/xxl-status-bar.png` is the one exception and is here for a different job, which its own row says: it is the
 * only capture of the eight whose status bar OCRs as a measurement, so it is the only one that can fail if a
 * measurement's anchor stops requiring a decimal point. Its attributes were checked by eye against the rendered screen
 * rather than pinned by a search, which is weaker provenance and enough for a regression fixture.
 *
 * **Five readings disagree with the screen, and a row's `renders` field is where that is pinned rather than hidden.** A
 * field quietly left out of an assertion is indistinguishable from one that passes, and every one of these was found by
 * asserting a field this file used to discard. Asserting the reader's own answer beside what the capture shows is what
 * makes a fix visible: the row needs editing, rather than an unasserted field silently changing.
 *
 * - **`fixtures/xxl-male.png` renders `1.1m` and reads `1.4m`**, because the size pill's tail points down into the
 *   second digit. It is the tail's position and not the badge's presence: `fixtures/xxl-status-bar.png` wears the same
 *   gold `XXL` and reads its `5.78m` correctly, the tail landing in the gap above the `8`.
 * - **`fixtures/xxl-male.png` renders `L7 ɪᴠ71 14/4/14` and `levelsIn` offers `[1]`**, which does not contain 7. The
 *   IVs beside it are read exactly and the green `71` corroborates them, since 32/45 is 71.1%. The HP covers for it —
 *   level 7 is the only level at which that Spoink shows 59 HP — so the cost is a note rather than a wrong answer, and
 *   it is the one capture of the eight where `identify` reports the two sources of the level disagreeing.
 * - **`fixtures/lucky-shiny.png` is nicknamed `96%` and reads as `aals15`**, which is PGSharp's own overlay. The
 *   nickname carries no run of three letters, so the name reader walks past it to the last line above the HP that does
 *   — and that is `aals/15 +`, the overlay read in the inverted top-fifth pass.
 * - **`fixtures/xxl-status-bar.png` plainly carries `L20 ɪᴠ82 11/12/14` and `readOverlay` answers null.** This one the
 *   old suite could not have caught at all: it kept only `overlay?.form ?? null` from the overlay, which is null for a
 *   capture PGSharp appended no form to and null for one whose overlay was not read. The box is found, so the test
 *   asserts that too — the failure is in the reading and not in a capture without an overlay on it. What it costs is
 *   exactly one number, and a test below states it: that overlay derives the `CP 2197` the screen shows, to the digit.
 * - **`fixtures/lucky-shiny.png` is answered as a Charizard and is a Ho-Oh**, which is the one of the five that is a
 *   defect in `identify` rather than in a reader. Its nickname hides the species, so the candidates are every form the
 *   types and the HP admit — five, after the fold — and `identify` takes the first and lists the rest. But the overlay
 *   states `L25`, and of those five only Ho-Oh shows 152 HP at level 25: `fits` asks whether *some* level reproduces
 *   the HP and checks the stated level afterwards, against a form already chosen, where asking both at once would
 *   settle it. The capture's own 246.49kg and 4.6m agree — a Ho-Oh's base 199kg and 3.8m against a Charizard's 90.5 and
 *   1.7 — so three independent things say Ho-Oh and the answer is Charizard with a note. Pinned here, not fixed: that
 *   is a change to what the code does rather than to what it is told.
 *
 * One thing is not asserted, deliberately: **`parseMoves`**, because these are top-of-screen captures and the moves are
 * below the fold on every one. What makes a negative control over them mean anything is the full 328-move list, which
 * is the part of the game master that cannot be cut down — a short list is not mistaken for anything and would pass
 * whatever the reader did.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { closest, type Form, type GameData, type IVs } from './game-master.mts';
import { decodePng } from './png.mts';
import {
  findOverlay,
  identify,
  label,
  parseDetail,
  readLines,
  readOverlay,
  type Gender,
  type Size,
} from './screens.mts';

/**
 * The eighteen type names, which is the whole of what `parseDetail` asks the game master for — it matches the two
 * coloured labels under the weight against this list and touches nothing else.
 */
const TYPES = [
  'Grass',
  'Poison',
  'Fire',
  'Flying',
  'Water',
  'Bug',
  'Normal',
  'Dark',
  'Electric',
  'Psychic',
  'Ice',
  'Steel',
  'Ground',
  'Fairy',
  'Fighting',
  'Rock',
  'Ghost',
  'Dragon',
];

/**
 * One form, as `identify` reads it. `moves` is empty on every form below because `identify` reads `dex`, `species`,
 * `form`, `costume`, `types` and the three base stats and never a pool — so transcribing the pools would be a hundred
 * lines nothing consults. That is a statement about today's `identify`: fill them in if it ever asks, because nothing
 * here would otherwise notice. Nothing in this file calls `parseMoves`, which is the only other reader that would.
 */
const form = (dex: number, species: string, types: string[], stats: [number, number, number], name = ''): Form => ({
  dex,
  species,
  form: name,
  costume: false,
  types,
  attack: stats[0],
  defense: stats[1],
  stamina: stats[2],
  moves: [],
});

/**
 * Unown's 28 forms, built from the letters rather than written out, because what matters about them is that they are
 * identical in every field the game's own screen shows: the real game master answers 28 forms with exactly one
 * `136/91/134` between them, one `Psychic`, and one pool of `Hidden Power` and `Struggle`. The two non-letters are
 * named rather than punctuated there, which is why they are spelled out here.
 */
const UNOWN: Form[] = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'Exclamation Point', 'Question Mark'].map((name) =>
  form(201, 'Unown', ['Psychic'], [136, 91, 134], name),
);

/**
 * Every form the eight captures can reach, in the dex order the real game master hands them over in — which is load
 * bearing, since `identify` reports the alternatives it did not choose and their order follows the table's.
 *
 * What makes a 38-form table legitimate where the real one holds 1,449 is that `identify` narrows before it chooses: by
 * species where the name matched one, and by type and HP where it did not, so a form outside the set those filters
 * admit cannot change an answer. That is measured rather than reasoned about — this table and a real
 * `loadGameData('.cache/inventory')` answer identically on all eight captures, field for field, including the five-way
 * ambiguity `fixtures/lucky-shiny.png` carries and both of its notes.
 *
 * The one-species-per-entry economy is the same argument: Pikachu has **69** forms in the real table and Unown 28, and
 * every Pikachu is `112/96/111` `Electric`, so the fold that collapses a costume into its base form collapses all 69 to
 * the one below. Unown's 28 are kept because the bracketed form PGSharp appends chooses between them *before* the fold.
 */
const FORMS: Form[] = [
  form(6, 'Charizard', ['Fire', 'Flying'], [223, 173, 186]),
  form(25, 'Pikachu', ['Electric'], [112, 96, 111]),
  form(146, 'Moltres', ['Fire', 'Flying'], [251, 181, 207]),
  ...UNOWN,
  form(250, 'Ho-Oh', ['Fire', 'Flying'], [239, 244, 214]),
  form(325, 'Spoink', ['Psychic'], [125, 122, 155]),
  form(663, 'Talonflame', ['Fire', 'Flying'], [176, 155, 186]),
  form(741, 'Oricorio', ['Fire', 'Flying'], [196, 145, 181], 'Baile'),
  form(796, 'Xurkitree', ['Electric'], [330, 144, 195]),
  form(840, 'Applin', ['Grass', 'Dragon'], [71, 116, 120]),
  form(928, 'Smoliv', ['Grass', 'Normal'], [100, 89, 121]),
];

/**
 * Every level from 1 to 51 in half steps against its CP multiplier, which is the game's own table and not derivable
 * from anything shorter — the half levels are interpolated values rather than a formula. All 101 entries are here
 * because the claim the `identify` test rests on needs them: that **16 is the only level** at which an Unown with 11
 * stamina IV shows 77 HP. Against three neighbouring entries that claim would still be true and would mean nothing.
 */
const CPM: [number, number][] = [
  [1, 0.094],
  [1.5, 0.13513743215803847],
  [2, 0.16639787],
  [2.5, 0.19265091454861796],
  [3, 0.21573247],
  [3.5, 0.23657265541932715],
  [4, 0.25572005],
  [4.5, 0.27353037931097973],
  [5, 0.29024988],
  [5.5, 0.30605738000722543],
  [6, 0.3210876],
  [6.5, 0.3354450348019347],
  [7, 0.34921268],
  [7.5, 0.36245775711118555],
  [8, 0.3752356],
  [8.5, 0.3875924191428145],
  [9, 0.39956728],
  [9.5, 0.4111935439951595],
  [10, 0.4225],
  [10.5, 0.4329264087965774],
  [11, 0.44310755],
  [11.5, 0.4530599628689135],
  [12, 0.4627984],
  [12.5, 0.4723360827308573],
  [13, 0.48168495],
  [13.5, 0.49085580932476297],
  [14, 0.49985844],
  [14.5, 0.5087017591555174],
  [15, 0.51739395],
  [15.5, 0.5259424956328841],
  [16, 0.5343543],
  [16.5, 0.5426357508963908],
  [17, 0.5507927],
  [17.5, 0.5588305922386229],
  [18, 0.5667545],
  [18.5, 0.574569134506658],
  [19, 0.5822789],
  [19.5, 0.5898879034974399],
  [20, 0.5974],
  [20.5, 0.6048236602280411],
  [21, 0.6121573],
  [21.5, 0.6194041050661919],
  [22, 0.6265671],
  [22.5, 0.6336491667895227],
  [23, 0.64065295],
  [23.5, 0.6475809587060136],
  [24, 0.65443563],
  [24.5, 0.6612192609753201],
  [25, 0.667934],
  [25.5, 0.6745818887829742],
  [26, 0.6811649],
  [26.5, 0.6876848943474521],
  [27, 0.69414365],
  [27.5, 0.7005428891384746],
  [28, 0.7068842],
  [28.5, 0.713169102419072],
  [29, 0.7193991],
  [29.5, 0.7255756180718899],
  [30, 0.7317],
  [30.5, 0.7347410173422504],
  [31, 0.7377695],
  [31.5, 0.7407855800803546],
  [32, 0.74378943],
  [32.5, 0.7467812039953893],
  [33, 0.74976104],
  [33.5, 0.7527290986842915],
  [34, 0.7556855],
  [34.5, 0.7586303636507689],
  [35, 0.76156384],
  [35.5, 0.7644860688461087],
  [36, 0.76739717],
  [36.5, 0.7702972738840048],
  [37, 0.7731865],
  [37.5, 0.7760649434180147],
  [38, 0.77893275],
  [38.5, 0.7817900775756758],
  [39, 0.784637],
  [39.5, 0.7874735905949481],
  [40, 0.7903],
  [40.5, 0.7928039417157309],
  [41, 0.7953],
  [41.5, 0.7978039170121942],
  [42, 0.8003],
  [42.5, 0.8028038926163724],
  [43, 0.8053],
  [43.5, 0.8078038685225517],
  [44, 0.8103],
  [44.5, 0.8128038447251588],
  [45, 0.8153],
  [45.5, 0.8178038212187566],
  [46, 0.8203],
  [46.5, 0.8228037979980404],
  [47, 0.8253],
  [47.5, 0.8278037750578334],
  [48, 0.8303],
  [48.5, 0.8328037523930834],
  [49, 0.8353],
  [49.5, 0.8378037299988584],
  [50, 0.8403],
  [50.5, 0.842803707870344],
  [51, 0.8453],
];

/**
 * The hermetic game master: the types `parseDetail` matches against, the forms `identify` chooses between, and the
 * multipliers `levelsOf` and `cpOf` work in. `moves` is empty because nothing here calls `parseMoves`.
 *
 * `species` is derived from `FORMS` rather than listed again, so a form added below is a species too and the two cannot
 * drift. It is the one place this table is weaker than the real one and worth saying so: eleven names is a short list
 * for `closest` to fail to match, where production offers it 1,024. What the nickname row below asserts is therefore
 * that `identify` files an unmatched name as a nickname — the wiring — and not that `aals15` resembles no real species.
 */
const DATA: GameData = {
  types: TYPES,
  forms: FORMS,
  species: [...new Set(FORMS.map((f) => f.species))],
  moves: [],
  cpm: CPM,
};

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
 * What `identify` makes of a capture once every reader has had its say. This is the end of the pipeline and the only
 * place the readers are asked to agree with each other rather than each being separately right, which is what makes
 * `notes` the strongest field of the eight rows: `identify` writes one for every way they can fail to.
 *
 * `form` and `alternatives` are what `label` writes rather than `Form` objects, because that is what the CSV carries
 * and it says `Unown (L)` where a bare species would not. `cp` is derived from the form, the IVs and the level's
 * multiplier and never read, so wherever the screen's own CP is legible too the two meeting is a cross-check nothing
 * shorter than the whole pipeline can make.
 */
interface Identity {
  form: string | null;
  levels: number[];
  cp: number | null;
  nickname: string | null;
  alternatives: string[];
  notes: string[];
}

interface Fixture {
  file: string;
  /** The game's own search that selected this capture. Every attribute the readers are judged on is pinned in it. */
  search: string;
  size: Size | null;
  gender: Gender | null;
  favourite: boolean;
  /** The chips under the HP, as names once resolved against `TAGS`. */
  tags: (string | null)[];
  hp: number;
  types: string[];
  weightKg: number;
  heightM: number;
  /** The nickname or the species, as read. Which of the two it is is `identify`'s to say, not this reader's. */
  name: string;
  /** What OCR made of the CP, which is white over the artwork and nothing at all on six of the eight. */
  cp: number | null;
  /** PGSharp's statement of the IVs, or null where `readOverlay` reads nothing off a box it did find. */
  iv: IVs | null;
  /**
   * Every level the digits ahead of the IVs could be saying, as a set sorted low to high. `levelsIn` is generous on
   * purpose — the `ɪᴠ` label reads as a `1` and runs into the level — and answers a shortlist for the HP to choose
   * from. Sorted rather than in the order it emits them, because `identify` only ever asks whether a level is in it.
   */
  levels: number[];
  /** What PGSharp appends in brackets after the IVs, which is how a form is asserted with no species data. */
  form: string | null;
  identity: Identity;
  /**
   * What the capture shows where a reader disagrees with it, read off the rendered image by eye. Its presence marks a
   * defect pinned rather than a reading confirmed; the module docblock accounts for every one. `overlay` is what the
   * band renders, which covers both ways that reading fails — one capture's is not read at all and another's level is
   * read as something the HP contradicts.
   */
  renders?: { heightM?: number; name?: string; overlay?: string };
}

const FIXTURES: readonly Fixture[] = [
  {
    file: 'spoink.png',
    size: 'XXL',
    gender: 'male',
    favourite: false,
    tags: [],
    hp: 59,
    types: ['Psychic'],
    weightKg: 43.83,
    heightM: 1.1,
    name: 'Spoink',
    cp: 247,
    iv: { attack: 14, defense: 4, stamina: 14 },
    level: 7,
    form: null,
    lucky: false,
    shiny: false,
    costume: null,
    background: null,
    shadow: false,
    purified: false,
  },
  {
    file: 'applin.png',
    size: 'XL',
    gender: 'female',
    favourite: false,
    tags: [],
    hp: 69,
    types: ['Grass', 'Dragon'],
    weightKg: 0.95,
    heightM: 0.28,
    name: 'Applin',
    cp: 286,
    iv: { attack: 10, defense: 14, stamina: 14 },
    level: 15,
    form: null,
    lucky: false,
    shiny: false,
    costume: null,
    background: null,
    shadow: false,
    purified: false,
  },
  {
    file: 'xs-unown.png',
    search: 'xs&unown&!male&!female&!lucky&!shiny&!costume&!background&!shadow&!purified',
    size: 'XS',
    gender: null,
    favourite: false,
    tags: [],
    hp: 77,
    types: ['Psychic'],
    weightKg: 1.66,
    heightM: 0.33,
    name: 'Unown',
    cp: 499,
    iv: { attack: 5, defense: 15, stamina: 11 },
    levels: [1, 6, 16],
    form: 'L',
    // The one row where every link of the chain is independently attested, which is why it is also a test of its own
    // below: the name against the species list, 77 HP against 136/91/134 and 5/15/11 for level 16 alone out of 101, the
    // overlay's own shortlist containing that 16, and `CP 499` derived meeting the `CP 499` the screen shows.
    identity: { form: 'Unown (L)', levels: [16], cp: 499, nickname: null, alternatives: [], notes: [] },
  },
  {
    file: 'xxs-female.png',
    search: 'xxs&female&!lucky&!shiny&!costume&!background&!shadow&!purified',
    size: 'XXS',
    gender: 'female',
    favourite: false,
    tags: [],
    hp: 68,
    types: ['Grass', 'Normal'],
    weightKg: 0.97,
    heightM: 0.15,
    name: 'Smoliv',
    cp: null,
    iv: { attack: 11, defense: 10, stamina: 12 },
    levels: [1, 5, 15, 51],
    form: null,
    identity: { form: 'Smoliv', levels: [15], cp: 340, nickname: null, alternatives: [], notes: [] },
  },
  {
    file: 'lucky-shiny.png',
    search: 'lucky&shiny&!male&!female&!costume&!background&!shadow&!purified&!xxl&!xxs&!xs&!xl',
    size: null,
    gender: null,
    favourite: true,
    tags: ['Shiny', 'Lucky'],
    hp: 152,
    types: ['Fire', 'Flying'],
    weightKg: 246.49,
    heightM: 4.6,
    name: 'aals15',
    cp: null,
    iv: { attack: 13, defense: 15, stamina: 15 },
    levels: [1, 2, 5, 25, 51],
    form: null,
    // The only ambiguous capture of the eight, and the wrong answer the module docblock accounts for: with the name a
    // nickname, 13/15/15 at 152 HP and `Fire`/`Flying` fit five distinct forms, and only Ho-Oh fits them at the `L25`
    // this capture's own overlay states. Asserted as it is rather than as it should be, so that fixing `fits` to ask
    // both questions at once fails here and has to say so.
    identity: {
      form: 'Charizard',
      levels: [34.5],
      cp: 2640,
      nickname: 'aals15',
      alternatives: ['Moltres', 'Ho-Oh', 'Talonflame', 'Oricorio (Baile)'],
      notes: [
        'could also be Moltres, Ho-Oh, Talonflame, Oricorio (Baile)',
        'the overlay reads as level 2 or 25 or 5 or 51 or 1, none of which this HP can be',
      ],
    },
    renders: { name: '96%' },
  },
  {
    file: 'costume-background.png',
    search: 'costume&background&female&!lucky&!shiny&!shadow&!purified&!xxl&!xxs&!xs&!xl',
    size: null,
    gender: 'female',
    favourite: false,
    tags: [],
    hp: 63,
    types: ['Electric'],
    weightKg: 3.04,
    heightM: 0.35,
    name: 'Pikachu',
    cp: null,
    iv: { attack: 12, defense: 13, stamina: 11 },
    levels: [1, 5, 15],
    form: null,
    // A costume says nothing at all: a costumed Pikachu is named `Pikachu` and shares its base form's stats and types,
    // so the fold answers the one Pikachu and no alternatives. The costume is the game's own search to know, not a
    // reading.
    identity: { form: 'Pikachu', levels: [15], cp: 382, nickname: null, alternatives: [], notes: [] },
  },
  {
    // Found by `alola`, which pins the region and nothing else, because what this capture is for is above the panel
    // rather than on it: its status bar reads `0900 M © Os`, the `0900` being a 24-hour `09:00` and the `M` a
    // notification icon. A measurement anchor that does not require a decimal point takes that line, 1,137 pixels above
    // the real `5.78m`, and every reader hung off the height goes with it. The other seven captures were all taken at
    // 13:xx with no icon beside the clock, so not one of them can fail that way.
    file: 'xxl-status-bar.png',
    search: 'alola',
    size: 'XXL',
    gender: null,
    favourite: false,
    tags: [],
    hp: 124,
    types: ['Electric'],
    weightKg: 162.2,
    heightM: 5.78,
    name: 'Xurkitree',
    cp: 2197,
    iv: null,
    levels: [],
    form: null,
    // The species is answered from the name and the types alone, and then the pipeline stops: with no IVs there is no
    // level and no CP, so the `CP 2197` the screen does show goes unchecked against anything. A test below measures
    // what that costs, and the answer is exact.
    identity: { form: 'Xurkitree', levels: [], cp: null, nickname: null, alternatives: [], notes: [] },
    renders: { overlay: 'L20 ɪᴠ82 11/12/14' },
  },
  {
    file: 'plain.png',
    search: 'male&!lucky&!shiny&!costume&!background&!shadow&!purified&!xxl&!xxs&!xs&!xl',
    size: null,
    gender: 'male',
    favourite: false,
    tags: [],
    hp: 68,
    types: ['Grass', 'Normal'],
    weightKg: 4.57,
    heightM: 0.24,
    name: 'Smoliv',
    cp: null,
    iv: { attack: 14, defense: 11, stamina: 11 },
    levels: [1, 5, 15, 51],
    form: null,
    identity: { form: 'Smoliv', levels: [15], cp: 350, nickname: null, alternatives: [], notes: [] },
  },
];

/**
 * Everything the readers answer about one capture. Each attribute is then asserted as a subtest of it, so a failure
 * names the reader that broke where one `deepStrictEqual` over the lot says only that the object differs.
 *
 * Memoised by file, which is what keeps that affordable: OCR is the whole cost of this suite at about four seconds a
 * capture, and four of the tests below read a capture another test has already read. Caching the promise rather than
 * the reading is what makes that hold whatever order the runner takes them in. Nothing mutates a reading, and a
 * screenshot is the same screenshot every time it is read, so there is nothing for a shared one to carry between tests.
 */
const read = async (file: string) => {
  const image = decodePng(readFileSync(new URL(`fixtures/${file}`, import.meta.url)));
  const lines = await readLines(image);
  const detail = await parseDetail(lines, DATA, image);
  const box = await findOverlay(image);

  return { image, lines, detail, box, overlay: box ? await readOverlay(image, box) : null };
};

const readings = new Map<string, ReturnType<typeof read>>();

const readingOf = (file: string) => {
  const reading = readings.get(file) ?? read(file);
  readings.set(file, reading);

  return reading;
};

for (const fixture of FIXTURES) {
  test(`${fixture.file} reads as ${fixture.search}`, async (t) => {
    const { detail, box, overlay } = await readingOf(fixture.file);

    await t.test('size', () => assert.strictEqual(detail.size, fixture.size));
    await t.test('gender', () => assert.strictEqual(detail.gender, fixture.gender));
    await t.test('favourite', () => assert.strictEqual(detail.favourite, fixture.favourite));
    await t.test('hp', () => assert.strictEqual(detail.hp, fixture.hp));
    await t.test('name', () => assert.strictEqual(detail.name, fixture.name));
    await t.test('cp', () => assert.strictEqual(detail.cp, fixture.cp));
    await t.test('weight', () => assert.strictEqual(detail.weightKg, fixture.weightKg));
    await t.test('height', () => assert.strictEqual(detail.heightM, fixture.heightM));
    await t.test('types', () => assert.deepStrictEqual(detail.types, fixture.types));

    await t.test('tags', () =>
      assert.deepStrictEqual(
        detail.tags.map((read) => closest(read, TAGS, (name) => name, TAG_SLACK)),
        fixture.tags,
      ),
    );

    // Asserted whether or not the overlay was read, because the box being found is what separates a capture PGSharp
    // never drew on from one whose overlay the reader could not make out. `xxl-status-bar.png` is the second of those.
    await t.test('overlay found', () => assert.ok(box, 'no band of the screen yielded an overlay box'));
    await t.test('overlay ivs', () => assert.deepStrictEqual(overlay?.iv ?? null, fixture.iv));
    await t.test('overlay form', () => assert.strictEqual(overlay?.form ?? null, fixture.form));

    await t.test('overlay levels', () =>
      assert.deepStrictEqual(
        [...(overlay?.levels ?? [])].sort((a, b) => a - b),
        fixture.levels,
      ),
    );

    // The end of the pipeline, run on every capture rather than on one, which is what catches `levelsOf` admitting any
    // HP at or above the one read: against a shortlist whose largest member is already the true level, as the Unown's
    // `[1, 6, 16]` is, that break cannot move an answer, and five of these captures fail on it.
    //
    // The ternary beside it, where the stated shortlist narrows the levels the HP admits, is a no-op on all eight and
    // is not pinned here. Every capture's HP picks out exactly one level, so `agreed` is either empty or that same
    // level however the line is written. Reaching it takes an HP that two adjacent half-levels both reproduce with the
    // overlay naming one of them, which is 1 of the 23 real captures on this machine and none of the eight: a Pikachu
    // whose 76 HP is level 22.5 or 23, read as 23 because its overlay says so.
    const identity = identify(DATA, detail, overlay);

    await t.test('identify form', () =>
      assert.strictEqual(identity.form && label(identity.form), fixture.identity.form),
    );

    await t.test('identify levels', () => assert.deepStrictEqual(identity.levels, fixture.identity.levels));
    await t.test('identify cp', () => assert.strictEqual(identity.cp, fixture.identity.cp));
    await t.test('identify nickname', () => assert.strictEqual(identity.nickname, fixture.identity.nickname));

    await t.test('identify alternatives', () =>
      assert.deepStrictEqual(identity.alternatives.map(label), fixture.identity.alternatives),
    );

    await t.test('identify notes', () => assert.deepStrictEqual(identity.notes, fixture.identity.notes));
  });
}

/**
 * The cross-check the rest of the file cannot make. Every figure in a row above is one the readers produced, so a row
 * agreeing with them says they have not changed and not that they are right. CP is the exception, because it reaches
 * the CSV by two routes that share nothing: `cpOf` derives it from the form, the IVs and the level's multiplier, where
 * OCR reads the number the game itself printed. The arithmetic cannot be wrong, so the two meeting means the form, the
 * IVs and the level are all right — and nothing shorter than the whole pipeline can say that.
 *
 * It is asserted over whichever captures offer both rather than over a named one, since which of the eight those are is
 * a property of the OCR: the CP is white text over the artwork and comes back on two of the eight. The count is
 * asserted too, because a loop over an empty list passes.
 */
test('where the screen states a CP as well, the derived one agrees with it', async () => {
  const checked: string[] = [];

  for (const fixture of FIXTURES) {
    const { detail, overlay } = await readingOf(fixture.file);
    const identity = identify(DATA, detail, overlay);

    if (detail.cp === null || identity.cp === null) {
      continue;
    }

    assert.strictEqual(identity.cp, detail.cp, `${fixture.file} derives a CP the screen contradicts`);
    checked.push(fixture.file);
  }

  assert.deepStrictEqual(checked, ['xs-unown.png'], 'which captures can be cross-checked has changed');
});

/**
 * What the overlay `fixtures/xxl-status-bar.png` loses is worth exactly one number, and this is it. The capture plainly
 * carries `L20 ɪᴠ82 11/12/14` and `readOverlay` answers null, so `identify` stops at the species and the `CP 2197` the
 * screen does show is checked against nothing. Feeding it the reading a person makes of that overlay by eye closes the
 * loop: level 20 and 11/12/14 against Xurkitree's `330/144/195` derive **2197**, the CP on the screen to the digit,
 * with no note raised.
 *
 * So this is not a second way of asserting the defect — the row above does that — but a statement of its cost, and the
 * two halves fail for different reasons. If `readOverlay` is fixed, the row's `iv: null` fails and this goes on
 * passing; if the arithmetic or the hermetic Xurkitree moves, this fails and the row goes on passing.
 */
test('the overlay xxl-status-bar.png does not read would have cross-checked its CP', async () => {
  const { detail } = await readingOf('xxl-status-bar.png');
  const overlay = { levels: [20], iv: { attack: 11, defense: 12, stamina: 14 }, form: null };
  const identity = identify(DATA, detail, overlay);

  assert.strictEqual(detail.cp, 2197, 'the capture has lost the CP this is cross-checked against');
  assert.deepStrictEqual(identity.levels, [20], 'the HP no longer agrees with the level the overlay states');
  assert.strictEqual(identity.cp, detail.cp);
  assert.deepStrictEqual(identity.notes, [], 'the readers disagree with each other');
});

/**
 * What the bracketed form buys, measured by taking it away — and the answer is not an ambiguity but a **confident wrong
 * answer**, which is why it is worth a test of its own. `identify` folds forms that repeat a base form's stats and
 * types into one, since that is what collapses a costume into the Pokémon it is a costume of; Unown's 28 are all such
 * repeats of each other, so without the suffix the fold leaves one of them standing with no alternatives beside it and
 * nothing anywhere saying it was a choice of 28.
 */
test('without the form PGSharp appends, Unown is answered confidently and wrongly', async () => {
  const { detail, overlay } = await readingOf('xs-unown.png');
  assert.ok(overlay, 'the fixture has lost its overlay');

  const identity = identify(DATA, detail, { ...overlay, form: null });

  assert.strictEqual(identity.form?.species, 'Unown');
  assert.notStrictEqual(identity.form?.form, 'L');
  assert.deepStrictEqual(identity.alternatives, [], 'the fold no longer collapses the 28, so this test is obsolete');
  assert.deepStrictEqual(
    identity.levels,
    [16],
    'the numbers still settle the level; only the letter was ever in doubt',
  );
});

/**
 * That `fixtures/xxl-status-bar.png` still carries the line its row is here for. This is the half of a regression
 * fixture that gets left out: the row above asserts what the readers answer, and would answer exactly the same on a
 * capture whose status bar held nothing to trip over — so the trap has to be asserted present rather than assumed. A
 * capture is a file and cannot change, but which lines Tesseract finds in it can, so what this really pins is that the
 * decoy is still being read.
 */
test('the status-bar fixture carries a line a loose measurement would take', async () => {
  const { image, lines } = await readingOf('xxl-status-bar.png');
  const decoy = lines.find((line) => /\d+\s*m\b/i.test(line.text));
  const height = lines.find((line) => /\d+[.,]\d+\s*m\b/i.test(line.text));

  assert.ok(decoy, 'nothing on the screen reads as a measurement at all');
  assert.ok(height, 'the capture has lost its height');
  assert.notStrictEqual(decoy, height, `nothing above ${JSON.stringify(height.text)} reads as a loose measurement`);
  assert.ok(decoy.top < image.height * 0.1, `the decoy ${JSON.stringify(decoy.text)} is not in the status bar`);
});

/**
 * The distinct values a column of the table holds, as words. Written out rather than left to `Array#sort`, which
 * stringifies a `null` and so files it after every capital letter — `['XL', 'XS', 'XXL', 'XXS', null]`, which is the
 * right set in an order nobody would write down on purpose.
 */
const distinct = (rows: readonly Fixture[], of: (row: Fixture) => unknown): string[] =>
  [...new Set(rows.map((row) => String(of(row))))].sort();

/**
 * That the corpus still reaches every attribute, which no amount of the assertions above can say. A reading the whole
 * corpus agrees on compares equal for ever and reads exactly like agreement: seven of these eight captures carry no
 * chip, so a `tagsOn` that answered `[]` unconditionally would pass every row but one, and a `sizeOf` that answered
 * null would pass three. Each of these pairs is therefore what makes the corresponding assertion able to fail at all.
 *
 * The negative half comes from the searches rather than the readings, because that is where it exists: nothing on the
 * screen says a Pokémon is not lucky, so `!lucky` in six searches is the only record that those six really are not.
 *
 * The three `renders` rows are asserted the same way and for the same reason. Each is the only capture that pins its
 * defect, so dropping it would take the pin with it and leave a reader free to change its answer unremarked.
 */
test('the corpus reaches both sides of every attribute', () => {
  const searches = FIXTURES.map((f) => f.search);
  const has = (term: string) => searches.some((s) => s.split('&').includes(term));

  for (const term of ['xxl', 'xxs', 'lucky', 'shiny', 'costume', 'background', 'male', 'female']) {
    assert.ok(has(term), `no fixture is ${term}`);
    assert.ok(has(`!${term}`), `no fixture is not ${term}`);
  }

  assert.deepStrictEqual(
    distinct(FIXTURES, (f) => f.size),
    ['XL', 'XS', 'XXL', 'XXS', 'null'],
    'four bands and none',
  );
  assert.deepStrictEqual(
    distinct(FIXTURES, (f) => f.gender),
    ['female', 'male', 'null'],
  );
  assert.deepStrictEqual(
    distinct(FIXTURES, (f) => f.favourite),
    ['false', 'true'],
  );
  assert.deepStrictEqual(
    distinct(FIXTURES, (f) => f.form),
    ['L', 'null'],
  );
  assert.ok(
    FIXTURES.some((f) => f.tags.length > 1),
    'no fixture carries two chips, so nothing says the columns separate them',
  );
  assert.ok(FIXTURES.some((f) => f.types.length === 2) && FIXTURES.some((f) => f.types.length === 1));
  assert.ok(
    FIXTURES.some((f) => f.cp !== null) && FIXTURES.some((f) => f.cp === null),
    'the CP is either read on every capture or on none, so nothing says it is usually not read',
  );

  for (const field of ['heightM', 'name', 'overlay'] as const) {
    assert.ok(
      FIXTURES.some((f) => f.renders?.[field] !== undefined),
      `nothing pins the ${field} defect any more`,
    );
  }

  // `identify`'s own columns, which need this more than the readers do rather than less: six of the eight come out
  // clean, so an `identify` that returned no note and no alternative whatever it was handed would pass six rows.
  assert.ok(
    FIXTURES.some((f) => f.identity.notes.length > 0) && FIXTURES.some((f) => f.identity.notes.length === 0),
    'either every capture disagrees with itself or none does, so nothing says a note is unusual',
  );
  assert.ok(
    FIXTURES.some((f) => f.identity.alternatives.length > 0),
    'no capture is ambiguous, so nothing says the alternatives are ever listed',
  );
  assert.ok(
    FIXTURES.some((f) => f.identity.nickname !== null) && FIXTURES.some((f) => f.identity.nickname === null),
    'nothing separates a name that matched a species from one left as a nickname',
  );
  assert.ok(
    FIXTURES.some((f) => f.identity.levels.length === 0) && FIXTURES.some((f) => f.identity.levels.length > 0),
    'nothing says a capture whose overlay went unread still answers a form',
  );

  // Two rows carry a level the overlay's own shortlist does not, which is what makes the shortlist load bearing: on the
  // other six the HP and the digits agree, and a level taken from either alone would read the same.
  assert.ok(
    FIXTURES.some((f) => f.identity.levels.some((l) => !f.levels.includes(l))),
    'every capture agrees with its shortlist, so nothing says the two are checked against each other',
  );
  assert.ok(
    FIXTURES.some((f) => f.identity.levels.some((l) => f.levels.some((stated) => stated > l))),
    'no shortlist offers a level above the true one, so nothing can catch an HP test that is not exact',
  );
});
