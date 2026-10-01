/**
 * What the detail screen's readers make of real screens, over a corpus of eight captures committed beside this file.
 *
 * Every reader here is a pure function of a screenshot, so the only thing a test of them needs is the screenshot — no
 * phone and no network. The game master it needs is small and derived rather than downloaded: eighteen type names for
 * `parseDetail`, and for `identify` 38 forms and the CP multiplier table, each read once out of a real
 * `loadGameData('.cache/inventory')` and recorded below with what it answered. Downloading it per run is 23 MB.
 *
 * **A row says what the Pokémon is, not what the readers answered.** Every field is the game's own statement of it: the
 * size band and the six flags are the answers of the searches that selected the capture, which are recorded in the
 * table above `FIXTURES`, and everything else is printed on the screen for anyone to read off the committed file — the
 * CP above the artwork, the name and the HP under it, PGSharp's level and IVs over the middle. So the assertions are
 * what the readers must agree with rather than a transcript of whatever they said first, and each attribute is asserted
 * on its own rather than as one object: a failure should name the reader that broke.
 *
 * **What that orientation buys is the CP cross-check, on seven captures rather than one.** `cpOf` derives a CP from the
 * form, the IVs and the level's multiplier, where a row's own `cp` is the number the game itself printed, so the two
 * meeting means the form, the IVs and the level are every one of them right — and nothing shorter than the whole
 * pipeline can say that. A table recording `cp` as whatever OCR made of it can only check the captures OCR read it on,
 * which is two of the eight; a table recording what the screen says checks all but the one whose overlay is unread.
 *
 * **Three captures carry a reader that disagrees with the screen, and a row's `defects` field is where that is pinned
 * rather than hidden.** A field quietly left out of an assertion is indistinguishable from one that passes, so the
 * answer the reader gives is written down beside the one the capture shows and the assertion compares against it.
 * Fixing a reader therefore fails here and has to say so, which is the point: every one of these was found by asserting
 * a field an earlier version of this file discarded.
 *
 * - **`fixtures/spoink.png` renders `1.1m` and reads `1.4m`**, because the size pill's tail points down into the second
 *   digit. It is the tail's position and not the badge's presence: `fixtures/xurkitree.png` wears the same gold `XXL`
 *   and reads its `5.78m` correctly, the tail landing in the gap above the `8`.
 * - **`fixtures/spoink.png` renders `L7 ɪᴠ71 14/4/14` and `levelsIn` offers `[1]`**, which does not contain 7. The IVs
 *   beside it are read exactly and the green `71` corroborates them, since 32/45 is 71.1%. The HP covers for it — level
 *   7 is the only level at which that Spoink shows 59 HP — so the cost is a note rather than a wrong answer, and it is
 *   the one capture of the eight where `identify` reports the two sources of the level disagreeing.
 * - **`fixtures/ho-oh.png` is nicknamed `96%` and reads as `aals15`**, which is PGSharp's own overlay. The nickname
 *   carries no run of three letters, so the name reader walks past it to the last line above the HP that does — and
 *   that is `aals/15 +`, the overlay read in the inverted top-fifth pass.
 * - **`fixtures/xurkitree.png` plainly carries `L20 ɪᴠ82 11/12/14` and `readOverlay` answers null.** This one an
 *   earlier suite could not have caught at all: it kept only `overlay?.form ?? null` from the overlay, which is null
 *   for a capture PGSharp appended no form to and null for one whose overlay was not read. The box is found, so the
 *   test asserts that too — the failure is in the reading and not in a capture without an overlay on it. What it costs
 *   is exactly one number, and a test below states it: that overlay derives the `CP 2197` the screen shows, to the
 *   digit.
 * - **`fixtures/ho-oh.png` is answered as a Charizard and is a Ho-Oh**, the one of the three that is a defect in
 *   `identify` rather than in a reader — and the only one the screen settles to the digit. Its nickname hides the
 *   species, so the candidates are every form the types and the HP admit, five after the fold, and `identify` takes the
 *   first and lists the rest. The overlay states `L25`, and of those five only Ho-Oh shows 152 HP there: `fits` asks
 *   whether *some* level reproduces the HP and checks the stated level afterwards, against a form it has already
 *   chosen, where asking both at once would settle it. The arithmetic then names the winner outright, which is what the
 *   old table could not do — a Ho-Oh at level 25 with 13/15/15 derives **2738**, the `CP 2738` the capture prints,
 *   where the Charizard answered at level 34.5 derives 2640 — and the 246.49kg and 4.6m agree with it too, a Ho-Oh's
 *   base 199kg and 3.8m against a Charizard's 90.5 and 1.7. Pinned here, not fixed: that is a change to what the code
 *   does rather than to what it is told.
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
 * ambiguity `fixtures/ho-oh.png` carries and both of its notes.
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
 * What a reader answers where it disagrees with the row it sits in. Its presence marks a defect pinned rather than a
 * reading confirmed, and the module docblock accounts for every entry across the corpus.
 *
 * The first three are a reader's own answer about the screen. The rest are `identify`'s, which is the end of the
 * pipeline and the only place the readers are asked to agree with each other rather than each being separately right —
 * so a row that needs none of them is a capture every reader read correctly *and* that `identify` then assembled
 * without complaint, which is what makes an empty `notes` worth asserting on five of the eight.
 *
 * `species` and `alternatives` are what `label` writes rather than `Form` objects, because that is what the CSV carries
 * and it says `Unown (L)` where a bare species would not.
 */
interface Defects {
  heightM?: number;
  /** The name under the artwork, which is the nickname where one is set and so carries no species to fall back on. */
  name?: string;
  /** Null where `readOverlay` reads nothing off a box `findOverlay` did find. */
  iv?: null;
  species?: string;
  nickname?: string;
  /** Every level `identify` still admits, where the row states the one the Pokémon is actually at. */
  levels?: number[];
  cp?: number | null;
  alternatives?: string[];
  notes?: string[];
}

/**
 * One Pokémon, as the game and the capture state it. Nothing here is a reader's answer: the readers are what these are
 * asserted against, and where one disagrees that goes in `defects` rather than softening a field.
 */
interface Fixture {
  background: string | null;
  /** What the artwork wears, or null for none. Described rather than named, the game showing no label for either. */
  costume: string | null;
  /** The CP above the artwork, which `cpOf` must derive and OCR reads on two of the eight. */
  cp: number;
  defects?: Defects;
  favourite: boolean;
  file: string;
  /** The form, which PGSharp appends in brackets after the IVs and is how a form is asserted with no species data. */
  form: string | null;
  gender: Gender | null;
  heightM: number;
  hp: number;
  /** PGSharp's statement of the IVs, which the green percentage beside them corroborates. */
  iv: IVs;
  /** The level PGSharp states and the HP reproduces — one number, where `levelsIn` offers a shortlist. */
  level: number;
  lucky: boolean;
  /** The name the screen prints under the artwork: the species, or the nickname where one is set. */
  name: string;
  purified: boolean;
  shadow: boolean;
  shiny: boolean;
  size: Size | null;
  /** The species, which is `identify`'s to answer and is not on the screen at all where a nickname is set. */
  species: string;
  /** The chips under the HP, as names once resolved against `TAGS`. */
  tags: string[];
  types: string[];
  weightKg: number;
}

/**
 * The game's own searches that selected the eight, which is where a row's `size` and its six flags come from. Recording
 * them is the point rather than a note: a capture chosen because its sprite looked small to me is only as good as my
 * eye, where `xxs&female&!lucky&!shiny&!costume&!background&!shadow&!purified` is the game stating all eight at once,
 * falsifiably — re-run it and the first match is in the set the row claims. Negation is the half only a search can
 * give, too, since nothing on the screen says a Pokémon is **not** lucky.
 *
 * `fixtures/xurkitree.png` is the exception, and is here for a job its own row states rather than for its attributes:
 * it is the only capture of the eight whose status bar OCRs as a measurement, so it is the only one that can fail if a
 * measurement's anchor stops requiring a decimal point. `alola` pins its region and nothing else, so its flags were
 * read off the rendered screen instead — PGSharp appends a `✨` for a shiny and a `🖼` for a background, the game draws
 * `LUCKY POKÉMON` under the nickname in green, and a shadow or a purified Pokémon wears its own treatment. That is
 * weaker provenance than a search and enough for a regression fixture.
 *
 * | file             | search                                                                               |
 * |------------------|--------------------------------------------------------------------------------------|
 * | `spoink.png`     | `xxl&male&!lucky&!shiny&!costume&!background&!shadow&!purified`                      |
 * | `applin.png`     | `xl&female&!lucky&!shiny&!costume&!background&!shadow&!purified`                     |
 * | `unown.png`      | `xs&unown&!male&!female&!lucky&!shiny&!costume&!background&!shadow&!purified`        |
 * | `smoliv-xxs.png` | `xxs&female&!lucky&!shiny&!costume&!background&!shadow&!purified`                    |
 * | `ho-oh.png`      | `lucky&shiny&!male&!female&!costume&!background&!shadow&!purified&!xxl&!xxs&!xs&!xl` |
 * | `pikachu.png`    | `costume&background&female&!lucky&!shiny&!shadow&!purified&!xxl&!xxs&!xs&!xl`        |
 * | `xurkitree.png`  | `alola`                                                                              |
 * | `smoliv.png`     | `male&!lucky&!shiny&!costume&!background&!shadow&!purified&!xxl&!xxs&!xs&!xl`        |
 */
const FIXTURES: readonly Fixture[] = [
  {
    background: null,
    costume: null,
    cp: 247,

    // The pill's tail reaches down into the second digit of the height, and `levelsIn` offers `1` alone for a band that
    // plainly reads `L7` — so the HP is the only thing left that settles the level, and `identify` says so in a note.
    defects: { heightM: 1.4, notes: ['the overlay reads as level 1, none of which this HP can be'] },

    favourite: false,
    file: 'spoink.png',
    form: null,
    gender: 'male',
    heightM: 1.1,
    hp: 59,
    iv: { attack: 14, defense: 4, stamina: 14 },
    level: 7,
    lucky: false,
    name: 'Spoink',
    purified: false,
    shadow: false,
    shiny: false,
    size: 'XXL',
    species: 'Spoink',
    tags: [],
    types: ['Psychic'],
    weightKg: 43.83,
  },
  {
    background: null,
    costume: null,
    cp: 286,
    favourite: false,
    file: 'applin.png',
    form: null,
    gender: 'female',
    heightM: 0.28,
    hp: 69,
    iv: { attack: 10, defense: 14, stamina: 14 },
    level: 15,
    lucky: false,
    name: 'Applin',
    purified: false,
    shadow: false,
    shiny: false,
    size: 'XL',
    species: 'Applin',
    tags: [],
    types: ['Grass', 'Dragon'],
    weightKg: 0.95,
  },
  {
    // The one capture where every link of the chain is independently attested, which is why it is also a test of its
    // own below: the name against the species list, 77 HP against 136/91/134 and 5/15/11 for level 16 alone out of 101,
    // the overlay's own shortlist containing that 16, and a derived `CP 499` meeting the `CP 499` on the screen.
    background: null,
    costume: null,
    cp: 499,
    favourite: false,
    file: 'unown.png',
    form: 'L',
    gender: null,
    heightM: 0.33,
    hp: 77,
    iv: { attack: 5, defense: 15, stamina: 11 },
    level: 16,
    lucky: false,
    name: 'Unown',
    purified: false,
    shadow: false,
    shiny: false,
    size: 'XS',
    species: 'Unown',
    tags: [],
    types: ['Psychic'],
    weightKg: 1.66,
  },
  {
    background: null,
    costume: null,
    cp: 340,
    favourite: false,
    file: 'smoliv-xxs.png',
    form: null,
    gender: 'female',
    heightM: 0.15,
    hp: 68,
    iv: { attack: 11, defense: 10, stamina: 12 },
    level: 15,
    lucky: false,
    name: 'Smoliv',
    purified: false,
    shadow: false,
    shiny: false,
    size: 'XXS',
    species: 'Smoliv',
    tags: [],
    types: ['Grass', 'Normal'],
    weightKg: 0.97,
  },
  {
    background: null,
    costume: null,
    cp: 2738,

    // The only ambiguous capture of the eight, and the wrong answer the module docblock accounts for: with the name
    // read as a nickname, 13/15/15 at 152 HP and `Fire`/`Flying` fit five distinct forms, and only Ho-Oh fits them at
    // the `L25` the overlay states. Pinned as it is rather than as it should be, so that fixing `fits` to ask both
    // questions at once fails here and has to say so — and the `cp` beside it is why there is no doubt which answer is
    // right, 2738 being on the screen.
    defects: {
      name: 'aals15',
      species: 'Charizard',
      nickname: 'aals15',
      levels: [34.5],
      cp: 2640,
      alternatives: ['Moltres', 'Ho-Oh', 'Talonflame', 'Oricorio (Baile)'],
      notes: [
        'could also be Moltres, Ho-Oh, Talonflame, Oricorio (Baile)',
        'the overlay reads as level 2 or 25 or 5 or 51 or 1, none of which this HP can be',
      ],
    },

    favourite: true,
    file: 'ho-oh.png',
    form: null,
    gender: null,
    heightM: 4.6,
    hp: 152,
    iv: { attack: 13, defense: 15, stamina: 15 },
    level: 25,
    lucky: true,
    name: '96%',
    purified: false,
    shadow: false,
    shiny: true,
    size: null,
    species: 'Ho-Oh',
    tags: ['Shiny', 'Lucky'],
    types: ['Fire', 'Flying'],
    weightKg: 246.49,
  },
  {
    // A costume says nothing at all: a costumed Pikachu is named `Pikachu` and shares its base form's stats and types,
    // so the fold answers the one Pikachu and no alternatives. Which is what makes this capture's two flags the game's
    // own to know and not a reading — and the only reason it is nonetheless certain that it carries them is that
    // PGSharp marks the background with a `🖼` after the IVs, where the shirt is simply there to be looked at.
    background: 'gold chevrons',
    costume: 'a zigzag-knit shirt',
    cp: 382,
    favourite: false,
    file: 'pikachu.png',
    form: null,
    gender: 'female',
    heightM: 0.35,
    hp: 63,
    iv: { attack: 12, defense: 13, stamina: 11 },
    level: 15,
    lucky: false,
    name: 'Pikachu',
    purified: false,
    shadow: false,
    shiny: false,
    size: null,
    species: 'Pikachu',
    tags: [],
    types: ['Electric'],
    weightKg: 3.04,
  },
  {
    // Found by `alola`, which pins the region and nothing else, because what this capture is for is above the panel
    // rather than on it: its status bar reads `0900 M © Os`, the `0900` being a 24-hour `09:00` and the `M` a
    // notification icon. A measurement anchor that does not require a decimal point takes that line, 1,137 pixels above
    // the real `5.78m`, and every reader hung off the height goes with it. The other seven captures were all taken at
    // 13:xx with no icon beside the clock, so not one of them can fail that way.
    background: null,
    costume: null,
    cp: 2197,

    // The species is answered from the name and the types alone, and then the pipeline stops: with no IVs read there is
    // no level and no CP, so the `CP 2197` the screen does show is checked against nothing. A test below measures what
    // that costs, and the answer is exactly one number.
    defects: { iv: null, levels: [], cp: null },

    favourite: false,
    file: 'xurkitree.png',
    form: null,
    gender: null,
    heightM: 5.78,
    hp: 124,
    iv: { attack: 11, defense: 12, stamina: 14 },
    level: 20,
    lucky: false,
    name: 'Xurkitree',
    purified: false,
    shadow: false,
    shiny: false,
    size: 'XXL',
    species: 'Xurkitree',
    tags: [],
    types: ['Electric'],
    weightKg: 162.2,
  },
  {
    background: null,
    costume: null,
    cp: 350,
    favourite: false,
    file: 'smoliv.png',
    form: null,
    gender: 'male',
    heightM: 0.24,
    hp: 68,
    iv: { attack: 14, defense: 11, stamina: 11 },
    level: 15,
    lucky: false,
    name: 'Smoliv',
    purified: false,
    shadow: false,
    shiny: false,
    size: null,
    species: 'Smoliv',
    tags: [],
    types: ['Grass', 'Normal'],
    weightKg: 4.57,
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
  const defects = fixture.defects ?? {};

  // The species `identify` is expected to answer, and the label it builds from it. Taken from `defects` where a reader
  // is known to disagree, which is how `fixtures/ho-oh.png` asserts the Charizard it answers while its row goes on
  // saying what the Pokémon is.
  const species = defects.species ?? fixture.species;
  const form = fixture.form ? `${species} (${fixture.form})` : species;

  test(`${fixture.file} reads as the ${form} on the screen`, async (t) => {
    const { detail, box, overlay } = await readingOf(fixture.file);

    await t.test('size', () => assert.strictEqual(detail.size, fixture.size));
    await t.test('gender', () => assert.strictEqual(detail.gender, fixture.gender));
    await t.test('favourite', () => assert.strictEqual(detail.favourite, fixture.favourite));
    await t.test('hp', () => assert.strictEqual(detail.hp, fixture.hp));
    await t.test('name', () => assert.strictEqual(detail.name, defects.name ?? fixture.name));
    await t.test('weight', () => assert.strictEqual(detail.weightKg, fixture.weightKg));
    await t.test('height', () => assert.strictEqual(detail.heightM, defects.heightM ?? fixture.heightM));
    await t.test('types', () => assert.deepStrictEqual(detail.types, fixture.types));

    // A null CP is the ordinary case rather than a defect: it is white text over the artwork and comes back on two of
    // the eight, which captures those are being a property of the OCR and pinned by a test of its own below. What a row
    // can say is that a CP which *is* read is the number the screen prints.
    await t.test('cp', () =>
      assert.ok(
        detail.cp === null || detail.cp === fixture.cp,
        `read CP ${detail.cp} where the screen shows ${fixture.cp}`,
      ),
    );

    await t.test('tags', () =>
      assert.deepStrictEqual(
        detail.tags.map((read) => closest(read, TAGS, (name) => name, TAG_SLACK)),
        fixture.tags,
      ),
    );

    // Asserted whether or not the overlay was read, because the box being found is what separates a capture PGSharp
    // never drew on from one whose overlay the reader could not make out. `fixtures/xurkitree.png` is the second of
    // those.
    await t.test('overlay found', () => assert.ok(box, 'no band of the screen yielded an overlay box'));
    await t.test('overlay form', () => assert.strictEqual(overlay?.form ?? null, fixture.form));

    // `in` rather than `??`, because the one defect here is a `null` — the overlay box `findOverlay` does find on
    // `fixtures/xurkitree.png` and `readOverlay` then reads nothing out of — and a `??` would read that as no defect at
    // all and assert the triple a person can plainly see, which is the one thing this reader does not answer.
    await t.test('overlay ivs', () =>
      assert.deepStrictEqual(overlay?.iv ?? null, 'iv' in defects ? defects.iv : fixture.iv),
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

    await t.test('identify form', () => assert.strictEqual(identity.form && label(identity.form), form));
    await t.test('identify levels', () => assert.deepStrictEqual(identity.levels, defects.levels ?? [fixture.level]));
    await t.test('identify cp', () => assert.strictEqual(identity.cp, 'cp' in defects ? defects.cp : fixture.cp));

    // A nickname is whatever the screen prints that is not the species, so the row states it by stating both and this
    // derives it rather than carrying a third copy. `fixtures/ho-oh.png` is nicknamed `96%`; the other seven print
    // their species and so have none.
    await t.test('identify nickname', () =>
      assert.strictEqual(
        identity.nickname,
        defects.nickname ?? (fixture.name === fixture.species ? null : fixture.name),
      ),
    );

    await t.test('identify alternatives', () =>
      assert.deepStrictEqual(identity.alternatives.map(label), defects.alternatives ?? []),
    );

    await t.test('identify notes', () => assert.deepStrictEqual(identity.notes, defects.notes ?? []));
  });
}

/**
 * Which captures the CP is read off, which is the one thing the rows above cannot say. Each of them now carries the
 * number printed over the artwork, read off the committed file by eye, so `identify cp` is the cross-check that costs
 * nothing and says the most: `cpOf` derives it from the form, the IVs and the level's multiplier, where the screen
 * states it outright, and the arithmetic cannot be wrong — so the two meeting means the form, the IVs and the level are
 * every one of them right. Seven of the eight make it, all but the capture whose overlay goes unread.
 *
 * What that leaves open is the reader, since a row asks only that a CP it *does* read is the right one and a `cpOn`
 * answering null for everything would therefore pass all eight. Hence the list, which is two rather than eight because
 * the CP is white text over the artwork and the hardest thing on the screen to make out. Asserted as a list rather than
 * a count, so a reader losing one capture and gaining another cannot come out even.
 */
test('the CP is read off two of the eight captures', async () => {
  const states: string[] = [];

  for (const fixture of FIXTURES) {
    const { detail } = await readingOf(fixture.file);

    if (detail.cp !== null) {
      states.push(fixture.file);
    }
  }

  assert.deepStrictEqual(states, ['unown.png', 'xurkitree.png'], 'which captures state a CP has changed');
});

/**
 * What the overlay `fixtures/xurkitree.png` loses is worth exactly one number, and this is it. The capture plainly
 * carries `L20 ɪᴠ82 11/12/14` and `readOverlay` answers null, so `identify` stops at the species and the `CP 2197` the
 * screen does show is checked against nothing. Handing it that row's own level and IVs — which are what a person reads
 * off the overlay, the row stating the Pokémon rather than the reader — closes the loop: level 20 and 11/12/14 against
 * Xurkitree's `330/144/195` derive **2197**, the CP on the screen to the digit, with no note raised.
 *
 * So this is not a second way of asserting the defect — the row's `iv: null` does that — but a statement of its cost,
 * and the two halves fail for different reasons. If `readOverlay` is fixed, the defect fails and this goes on passing;
 * if the arithmetic or the hermetic Xurkitree moves, this fails and the defect goes on passing.
 */
test('the overlay fixtures/xurkitree.png does not read would have cross-checked its CP', async () => {
  const fixture = FIXTURES.find((f) => f.file === 'xurkitree.png');
  assert.ok(fixture, 'the capture whose overlay goes unread has left the corpus');

  const { detail } = await readingOf(fixture.file);
  const identity = identify(DATA, detail, { levels: [fixture.level], iv: fixture.iv, form: fixture.form });

  assert.strictEqual(detail.cp, fixture.cp, 'the capture has lost the CP this is cross-checked against');
  assert.deepStrictEqual(identity.levels, [fixture.level], 'the HP no longer agrees with the level the overlay states');
  assert.strictEqual(identity.cp, detail.cp);
  assert.deepStrictEqual(identity.notes, [], 'the readers disagree with each other');
});

/**
 * The two properties of the shortlist PGSharp's level is read as that make the rest of the pipeline's level handling
 * able to fail at all. They were a column of the table until the table became a statement of what each Pokémon is, and
 * a shortlist is a reading rather than a fact about a Pokémon — so they are asserted here, off the captures themselves.
 *
 * The first is that some capture offers a level **above** its true one, which is what an HP test admitting any HP at or
 * above the one read needs in order to be caught: against `fixtures/unown.png`'s `[1, 6, 16]`, whose largest member is
 * already the answer, such a break cannot move anything. `fixtures/applin.png` offers `51` for a level 15. The second
 * is that some capture's shortlist does **not** contain its true level, which is what says the HP is the arbiter rather
 * than a tie-breaker: `fixtures/spoink.png` offers `1` alone for a Pokémon at level 7.
 */
test('the shortlists the overlay states both overshoot a true level and miss one', async () => {
  const stated = new Map<string, readonly number[]>();

  for (const fixture of FIXTURES) {
    const { overlay } = await readingOf(fixture.file);
    stated.set(fixture.file, overlay?.levels ?? []);
  }

  const offered = FIXTURES.filter((f) => stated.get(f.file)?.length);
  assert.strictEqual(offered.length, 7, 'how many overlays are read has changed, so these two properties say less');
  assert.ok(
    offered.some((f) => stated.get(f.file)?.some((level) => level > f.level)),
    'no shortlist offers a level above the true one, so nothing can catch an HP test that is not exact',
  );
  assert.ok(
    offered.some((f) => !stated.get(f.file)?.includes(f.level)),
    'every shortlist contains its own level, so nothing says the HP is what settles it',
  );
});

/**
 * What the bracketed form buys, measured by taking it away — and the answer is not an ambiguity but a **confident wrong
 * answer**, which is why it is worth a test of its own. `identify` folds forms that repeat a base form's stats and
 * types into one, since that is what collapses a costume into the Pokémon it is a costume of; Unown's 28 are all such
 * repeats of each other, so without the suffix the fold leaves one of them standing with no alternatives beside it and
 * nothing anywhere saying it was a choice of 28.
 */
test('without the form PGSharp appends, Unown is answered confidently and wrongly', async () => {
  const { detail, overlay } = await readingOf('unown.png');
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
 * The negative half of a flag comes from the searches above `FIXTURES` rather than from the readings, because that is
 * where it exists: nothing on the screen says a Pokémon is not lucky, so `!lucky` in six of those searches is the only
 * record that those six really are not. Here it is asserted off the fields the searches were transcribed into, which is
 * what a row states and what the loop below reads.
 *
 * The `defects` keys are asserted the same way and for the same reason. Each is pinned by one capture, often only one,
 * so dropping that capture would take the pin with it and leave a reader free to change its answer unremarked.
 */
test('the corpus reaches both sides of every attribute', () => {
  for (const flag of ['lucky', 'shiny'] as const) {
    assert.ok(
      FIXTURES.some((f) => f[flag]) && FIXTURES.some((f) => !f[flag]),
      `every capture is ${flag} or none is, so nothing separates the two`,
    );
  }

  for (const flag of ['costume', 'background'] as const) {
    assert.ok(
      FIXTURES.some((f) => f[flag] !== null) && FIXTURES.some((f) => f[flag] === null),
      `every capture wears a ${flag} or none does, so nothing separates the two`,
    );
  }

  // The one gap, asserted as the gap it is rather than left to be discovered: nothing in this corpus says either of
  // those two columns is ever filled in, so a `shadow` or `purified` capture is what the corpus is short of. Written so
  // that adding one fails here and is read, rather than arriving with no side asserting its opposite.
  assert.ok(
    FIXTURES.every((f) => !f.shadow && !f.purified),
    'a shadow or purified capture has arrived, so give it both sides of the pairs above',
  );

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

  // A name the species list answers against one it does not, which is what separates `identify`'s `species` from its
  // `nickname`: seven of these print their species and `fixtures/ho-oh.png` prints `96%`.
  assert.ok(
    FIXTURES.some((f) => f.name !== f.species) && FIXTURES.some((f) => f.name === f.species),
    'nothing separates a name that matched a species from one left as a nickname',
  );

  // Every `Defects` key is pinned by some capture. The keys rather than the values, because two of the defects are
  // `null` — the IVs `fixtures/xurkitree.png` yields none of, and the CP that follows them — and a truth test would
  // read those as absent. A key nothing pins is a reader free to change its answer unremarked, which is the same hazard
  // an unasserted field is and reads exactly the same way.
  const pinned = new Set(FIXTURES.flatMap((f) => Object.keys(f.defects ?? {})));

  for (const key of [
    'heightM',
    'name',
    'iv',
    'species',
    'nickname',
    'levels',
    'cp',
    'alternatives',
    'notes',
  ] as const) {
    assert.ok(pinned.has(key), `nothing pins a reader disagreeing with the screen about ${key} any more`);
  }

  // And the other side of it, which the keys above cannot give: that some capture carries no defect at all. Without it
  // a reader that was wrong everywhere would pass every row it had a `defects` entry in.
  assert.ok(
    FIXTURES.some((f) => f.defects === undefined),
    'every capture carries a defect, so nothing says a reader ever agrees with its screen outright',
  );
  assert.ok(
    FIXTURES.some((f) => f.defects?.levels?.length === 0),
    'nothing says a capture whose overlay goes unread still answers a form',
  );
});
