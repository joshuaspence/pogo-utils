/**
 * What the detail screen's readers make of real screens, over the corpus of captures committed beside this file.
 *
 * **This file is its own Vitest project, `corpus`, so that a run can leave it out.** Reading the 49 captures spawns
 * some thousands of Tesseract processes, which is 95% of the suite's wall clock against a few seconds for every other
 * test file put together — so `pnpm test:default` is the loop to work in, where `pnpm test` runs both projects and
 * `pnpm test:corpus` runs this one. CI takes each project as its own job. Nothing here asserts differently for being
 * selected separately, and nothing enforces the split either: a test slow enough to belong here can land in `default`,
 * and only a reader will notice.
 *
 * Every reader here is a pure function of a screenshot, so the only thing a test of them needs is the screenshot — no
 * phone and no network. The game master they are read against is vended beside them rather than downloaded, by
 * `pnpm vend:game-master`: the whole of what `loadGameData` answers, 0.85 MB of it, where the two files upstream are 23
 * MB and are cached for only a week — so even a committed cache would have the suite fetching again every eighth day.
 *
 * **A row says what the Pokémon is, not what the readers answered.** A `Fixture` is the screen: the CP above the
 * artwork, the name and the HP under it, the weight, the height and the types in the panel, the size pill where there
 * is one, PGSharp's level and IVs over the middle. A `Defects` beside it is where some reader answers something else,
 * written down rather than softened away. Everything after that is derived from the pair, so a consequence cannot drift
 * from its cause — the level `identify` settles on, the nickname, the `could also be …` note. `COVERAGE` below pins the
 * counts this docblock quotes, because a figure quoted in prose is one nothing checks.
 *
 * **What that orientation buys is the CP cross-check.** `cpOf` derives a CP from the form, the IVs and the level's
 * multiplier, where a row's own `cp` is the number the game itself printed, so the two meeting means the form, the IVs
 * and the level are every one of them right — and nothing shorter than the whole pipeline can say that. It reaches
 * **all 43** rows, `identify` settling on exactly one level for every one of them, and on 41 the derived CP is the CP
 * the screen prints.
 *
 * The two it is wrong on are what make it a check rather than a restatement, and both are pinned as `defects.cp`:
 * `charizard-gigantamax.png`'s triple reads `5/4/4` for the `12/12/12` PGSharp drew, so no form of Charizard fits its
 * HP and `identify` answers Ho-Oh at 16.5 and derives 1670; `dialga-origin.png`'s numbers are read correctly and the
 * artwork declines, so the base form is folded first and derives 2809 against the 2845 on the screen. The check's
 * *other* job is to report a form or a level that is wrong, and those two are the captures that exercise it.
 *
 * The cross-check also *narrows* rather than only reporting: `identify` keeps the candidates whose derived CP is one
 * the screen states, which is the only thing on it that separates forms differing in attack or defense alone, and that
 * settles five of the six Deoxys and Dialga rows.
 *
 * **Provenance is not the same for all of them, and the difference is worth stating rather than glossing.** Four
 * captures were selected by one of the game's own searches, recorded above `FIXTURES`: a search is falsifiable, and it
 * is the only thing that can state a negative, since nothing on the screen says a Pokémon is **not** lucky.
 *
 * Thirty-eight were taken by `pnpm inventory snap --search`, with the terms built out of the row they were to replace —
 * `+smoliv & cp340 & hp68 & xxs & !costume` for one. That is falsifiable in one direction only, and the direction
 * matters: the terms came *from* the row, so a match confirms nothing the row already claimed, but the game declining
 * to match is a row that no Pokémon in storage answers to any more. It is how the nine captures of a different Pokémon
 * were found, and how `smoliv.png`'s `XXS` is known to be `XXS` whatever `sizeOf` reads off it.
 *
 * The remaining five arrived as a named file, so their provenance is the name plus what the screen renders — PGSharp
 * appends a `✨` for a shiny and a `🖼` for a background, the game draws `LUCKY POKÉMON` under the nickname in green, and
 * a shadow or a purified Pokémon wears its own treatment. That is weaker, and it is why `background`, `costume`,
 * `lucky`, `purified`, `shadow` and `shiny` default to absent: a row claims one only where the capture shows it.
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
 * **Ten rows carry a `defects`, and six readers disagree with a screen somewhere.** A reader that disagrees is pinned
 * here rather than fixed here, a fix being a change to what the code does and so a pull request of its own, and the
 * corpus test asserts which keys are in use, so a disagreement arriving or leaving is reported.
 *
 * Two of the ten are what the screen cannot separate rather than a reader at fault. `basculin-blue.png` is a form the
 * screen cannot separate at all: Basculin's stripes share their stats, types and moves, no icon signature is recorded
 * for them, and the fold answers `Basculin (Red Striped)` with nothing beside it saying that was a choice.
 * `spoink.png`'s overlay offers level `1` alone for a Pokémon at 7, so the HP settles the level and `identify` notes
 * the disagreement — the note reporting the overlay's misreading rather than making one.
 *
 * The other eight are readers that answer something the screen does not say, and each is a capture away from being a
 * bug report: `wholeCp` loses the leading digit on three screens — `605` for 1605, `284` for 2845, `38` for 738 — where
 * the band rescue recovers it elsewhere; the artwork match declines all three Burmy cloaks, so `identify` folds `Burmy
 * (Plant)` for every one of them; `readOverlay` reads `5/4/4` for `charizard-gigantamax.png`'s `12/12/12`, which is the
 * one triple it gets wrong; `sizeOf` reads `XS` off `smoliv.png`'s `XXS` badge, which the game's own `xxs` search says
 * is the badge; and the name pass takes the green `LUCKY POKÉMON` under `ho-oh.png`'s nickname for the name itself.
 *
 * What still holds everywhere: `findOverlay` finds a box on every screen that carries one, `isFavourite` does not take
 * `spinda-04.png`'s warm background for a filled star, `tagsOn` reads `snorlax-purified.png`'s `Perfect` chip rather
 * than cutting it away as the type icons, a height is not taken from under the size pill that corrupts it, and a name
 * the pass misses outright is re-read off its own band rather than filed as a nickname.
 *
 * **Two of Vitest's assertion forms are used here, and the division is a type one rather than a preference.** `expect`
 * states what a reader answered, as every other suite in this repository does. `assert.ok` states a precondition — that
 * a capture is still in the corpus, that a line was found — because it is declared `asserts value` and so narrows,
 * where `expect(…).toBeTruthy()` does not: the guards below that go on to read a field off what they guarded are
 * `'possibly undefined'` under `expect`. `toStrictEqual` rather than `toEqual` throughout for a second measured reason
 * — `toEqual` reads a missing property and an `undefined` one as equal, which would quietly cost the whole-object
 * assertions the very thing they exist for.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, assert, beforeAll, describe, expect, test } from 'vitest';
import { closest, type Form, type GameData, type IVs } from './game-master.mts';
import { ambiguous, nearest, signatureOf, type Signature } from './artwork.mts';
import { decodePng } from './png.mts';
import { sizeOf, type Gender, type Size } from './badges.mts';
import { HEIGHT, parseDetail, readLines } from './detail.mts';
import { identify, label } from './identify.mts';
import { findOverlay } from './overlay.mts';
import { dexOn } from './pokedex.mts';
import { parseMoves, type Moves } from './moves.mts';
import { SCREEN_BAND } from './stitch.mts';

/**
 * The game master, vended beside the captures rather than downloaded: `pnpm vend:game-master` writes what a real
 * `loadGameData` answers into `fixtures/game-master.json`, so a test of a reader reaches no network. 1,449 forms over
 * 1,024 species, 328 moves, eighteen type names and all 101 CP multipliers.
 *
 * Vended whole rather than cut down to the forms these captures can reach, which is the decision worth stating because
 * the arithmetic invites the other one: a species narrows to a form by type and HP, so a closure of the reachable forms
 * would be sound — but each of its forms would transcribe three base stats from the authority it is checked against,
 * with nothing failing when the two disagree. A fixture is the same claim with the copy taken out of it.
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
 * The hue signature of the game's own icon for each form the numbers cannot separate, read once out of
 * `pm{dex}.f{form}.icon.png` and recorded here for the same reason the forms and the CP multipliers are: a test of a
 * reader must not reach the network. Four decimal places, where the margin that decides an answer is 0.3.
 *
 * Two families, and both of them land: Burmy's three icons are 1.85 apart at their closest and Cherrim's two 1.62,
 * against a margin of 0.3.
 */
const ARTWORK = new Map<string, Signature>([
  ['Burmy (Plant)', [0, 0.0527, 0.0288, 0.9173, 0.0012, 0, 0, 0, 0, 0, 0, 0]],
  ['Burmy (Sandy)', [0, 0.9677, 0.0245, 0, 0, 0, 0, 0.0078, 0, 0, 0, 0]],
  ['Burmy (Trash)', [0.6469, 0.0088, 0.0064, 0, 0, 0, 0.0064, 0, 0, 0, 0, 0.3315]],
  ['Cherrim (Overcast)', [0.0235, 0, 0, 0.0294, 0.1917, 0.0002, 0, 0, 0.2918, 0.2974, 0.0092, 0.1568]],
  ['Cherrim (Sunny)', [0.1492, 0.5625, 0.0217, 0.001, 0.0097, 0, 0, 0, 0, 0, 0, 0.2559]],
]);

/** Those signatures against the forms they belong to, which is the shape `identify` takes them in. */
const ICONS: ReadonlyMap<Form, Signature> = new Map(
  DATA.forms.flatMap((f): [Form, Signature][] => {
    const signature = ARTWORK.get(label(f));

    return signature ? [[f, signature]] : [];
  }),
);

/**
 * What a reader answers where it disagrees with the row it sits in. Its presence marks a defect pinned rather than a
 * reading confirmed, and the module docblock accounts for every kind across the corpus.
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
  /** What `sizeOf` makes of the badge, `null` where it finds none above a height that wears one. */
  size?: Size | null;
  tags?: string[];
  types?: string[];
  /** The whole label `identify` answers, where it is not this Pokémon's own. */
  label?: string;
  nickname?: string;
  /** Every level `identify` still admits, where the row states the one the Pokémon is actually at. */
  levels?: number[];
  cp?: number;
  alternatives?: string[];
  /**
   * Every note `identify` answers, in its order — including the `could also be …` one, which is derived from
   * `alternatives` where this is absent and has to be written out where it is present.
   *
   * The whole list rather than the rest of it, because `could also be …` is not always first: on
   * `charizard-gigantamax.png` a misread triple fits no form of Charizard at all, and the note saying so is answered
   * ahead of it. A row that could only append could not state that order, and the order is the half that says which
   * note came of which.
   */
  notes?: string[];
}

/**
 * One Pokémon, as the game and the capture state it. Nothing here is a reader's answer: the readers are what these are
 * asserted against, and where one disagrees that goes in `defects` rather than softening a field.
 *
 * Ten of the attributes are optional and default to absent — no background, no costume, not a favourite, not lucky, not
 * purified, not shadow, not shiny, no size pill, no chips and a `name` that is the species. Absence is a claim and not
 * a gap: it says the screen shows none of those, which for the rows with no search behind them is what looking at the
 * screen can state. The alternative is every field written out on every row, which nobody reads.
 */
interface Fixture {
  /** The scene behind the artwork, or absent for the game's own plain sky. Described, the game showing no label. */
  background?: string;
  /** What the artwork wears, or absent for nothing. Described rather than named, the game showing no label either. */
  costume?: string;
  /** The CP above the artwork, which OCR reads on only the captures the CP test below names. */
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
  /** The species as the game master names it, which a nicknamed screen does not print. */
  species: string;
  /** The chips under the HP, as names once resolved against `TAGS`. */
  tags?: string[];
  types: string[];
  weight: number;
}

/**
 * The game's own searches that selected four of the captures, which is where those four rows' `size` and flags come
 * from. Recording them is the point rather than a note: a capture chosen because its sprite looked small to me is only
 * as good as my eye, where `xxs&female&!lucky&!shiny&!costume&!background&!shadow&!purified` is the game stating all
 * eight at once, falsifiably — re-run it and the first match is in the set the row claims. Negation is the half only a
 * search can give, since nothing on the screen says a Pokémon is **not** lucky.
 *
 * The other 39 rows have no search behind them. They arrived named for what they are — a form, a treatment, a costume,
 * a missing overlay — and the name is a claim about the capture that the rendered screen then has to bear out, which is
 * how each was checked. Weaker provenance, and sufficient for what those rows are for: a form the game master
 * distinguishes, and a reader defect that needs a screen to stand on.
 *
 * `xurkitree.png` is here for a job its own test states rather than for its attributes: it is the only capture whose
 * status bar OCRs as a measurement, so it is the only one that can fail if a measurement's anchor stops requiring a
 * decimal point. `alola` pins its region and nothing else.
 *
 * | file             | search                                                                               |
 * |------------------|--------------------------------------------------------------------------------------|
 * | `applin.png`     | `xl&female&!lucky&!shiny&!costume&!background&!shadow&!purified`                      |
 * | `ho-oh.png`      | `lucky&shiny&!male&!female&!costume&!background&!shadow&!purified&!xxl&!xxs&!xs&!xl`  |
 * | `xurkitree.png`  | `alola`                                                                              |
 * | `smoliv.png`     | `xxs&female&!lucky&!shiny&!costume&!background&!shadow&!purified`                     |
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
    height: 1.62,
    hp: 130,
    overlay: { iv: { attack: 13, defense: 12, stamina: 12 }, level: 20 },
    species: 'Articuno',
    types: ['Ice', 'Flying'],
    weight: 48.28,
  },
  {
    cp: 253,
    file: 'basculin-blue.png',
    form: 'Blue Striped',
    gender: 'male',
    height: 1.02,
    hp: 51,
    defects: { label: 'Basculin (Red Striped)' },
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
    defects: { label: 'Burmy (Plant)' },
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
    defects: { label: 'Burmy (Plant)' },
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
    cp: 832,
    file: 'castform-rainy.png',
    form: 'Rainy',
    gender: 'male',
    height: 0.29,
    hp: 104,
    lucky: true,
    name: 'Rainy 93%',
    overlay: { iv: { attack: 15, defense: 15, stamina: 12 }, level: 18 },
    species: 'Castform',
    types: ['Water'],
    weight: 0.8,
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
    defects: {
      alternatives: ['Fletchinder', 'Oricorio (Baile)'],
      cp: 1670,
      iv: { attack: 5, defense: 4, stamina: 4 },
      label: 'Ho-Oh',
      levels: [16.5],
      nickname: 'Charizard',
      notes: [
        'the numbers do not fit any form of Charizard; searched every species',
        'could also be Fletchinder, Oricorio (Baile)',
        'the screen reads CP 605, where this form at this level is 1670',
      ],
    },
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
    defects: { alternatives: ['Deoxys (Speed)', 'Deoxys (Attack)', 'Deoxys (Defense)'] },
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
    defects: {
      alternatives: ['Dialga (Origin)'],
      cp: 2809,
      label: 'Dialga',
      notes: ['could also be Dialga (Origin)', 'the screen reads CP 284, where this form at this level is 2809'],
    },
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
    defects: { notes: ['the screen reads CP 38, where this form at this level is 738'] },
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
    defects: { name: 'LUCKY POKEMON', nickname: 'LUCKY POKEMON' },
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
    cp: 431,
    file: 'meowth-alola.png',
    form: 'Alola',
    gender: 'male',
    height: 0.38,
    hp: 78,
    overlay: { iv: { attack: 10, defense: 15, stamina: 12 }, level: 20 },
    species: 'Meowth',
    types: ['Dark'],
    weight: 4.34,
  },
  {
    cp: 571,
    file: 'meowth-galar.png',
    form: 'Galarian',
    gender: 'female',
    height: 0.4,
    hp: 89,
    overlay: { iv: { attack: 13, defense: 13, stamina: 12 }, level: 20 },
    species: 'Meowth',
    types: ['Steel'],
    weight: 7.45,
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
    defects: { size: 'XS' },
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
    overlay: { iv: { attack: 15, defense: 15, stamina: 15 }, level: 25 },
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
    defects: { notes: ['the overlay reads as level 1, none of which this HP can be'] },
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

  // The artwork's own signature, which is the only thing that separates forms identical in every number. Floored on the
  // overlay's box where one was found, PGSharp drawing over the artwork, so no fraction of one phone's screen is
  // written down here. Memoised with the reading because the segmentation walks the pixels and the assertions are meant
  // to be free.
  const box = found?.box ?? null;
  const signature = signatureOf(image, box ? box.y + box.height : undefined);

  const overlay = found?.overlay ?? null;
  const artwork = signature ? { signature, icons: ICONS } : undefined;

  return {
    image,
    lines,
    detail,
    box,
    overlay,
    artwork,
    // The end of the pipeline, memoised with the readings it is derived from. It is pure and cheap, but each of a
    // capture's eighteen attributes is a test of its own, and caching it says outright that the eighteen are asserting
    // one answer rather than eighteen separately-derived ones.
    identity: identify(DATA, detail, overlay, artwork),
  };
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
 * `levels` follows from the pair, so a consequence cannot drift from its cause: with no triple there is no level, and
 * with no level `identify` derives no CP. A function rather than three lines in the loop because `COVERAGE` counts the
 * same thing, and two copies of this would be free to disagree about what the corpus holds.
 */
const overlayOf = (fixture: Fixture) => {
  const defects = fixture.defects ?? {};
  const boxed = fixture.overlay !== null && !('box' in defects);
  const legible = boxed && !('iv' in defects) ? fixture.overlay : null;

  return { boxed, legible, levels: defects.levels ?? (legible ? [legible.level] : []) };
};

for (const fixture of FIXTURES) {
  const defects = fixture.defects ?? {};

  // What the Pokémon is, and what `identify` answers about it, which are the same string wherever no `defects.label`
  // says otherwise — `COVERAGE.answeredAsThemselves` is how many that is.
  const truth = fixture.form ? `${fixture.species} (${fixture.form})` : fixture.species;
  const answered = defects.label ?? truth;

  // The name the screen prints, which defaults to the species — so a row states a nickname once and both the reader's
  // expectation and `identify`'s derive from it.
  const name = fixture.name ?? fixture.species;

  const { boxed, legible, levels } = overlayOf(fixture);
  const alternatives = defects.alternatives ?? [];
  const notes = defects.notes ?? (alternatives.length > 0 ? [`could also be ${alternatives.join(', ')}`] : []);

  // A `describe` rather than one test with eighteen subtests inside it, because Vitest collects a file's tests
  // synchronously and so cannot be handed a test registered after an `await`. Each attribute therefore reads the
  // memoised capture for itself, which costs nothing — the first of the eighteen pays for the OCR and the rest get the
  // settled promise — and buys a failure that names the reader.
  describe(`${fixture.file} reads as the ${truth} on the screen`, () => {
    test('size', async () =>
      expect((await readingOf(fixture.file)).detail.size).toBe(
        ('size' in defects ? defects.size : fixture.size) ?? null,
      ));
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

    // Whether a box was found is asserted apart from what was read out of it, because the two are different defects
    // and a reader fixed at either stage has to fail here. The corpus reaches one side only: no row has no overlay
    // drawn on it and none needs `defects.box`, so `boxed` holds for all 43 and the false case of this test is
    // unreachable — pinned as a hole where the counts are asserted. One row carries `defects.iv`, a box found whose
    // triple was misread, which is what keeps the test below from being the same assertion twice. `findOverlay`
    // answering null is covered apart from the rows, on the two Squirtle captures PGSharp drew nothing on.
    test('overlay found', async () => expect((await readingOf(fixture.file)).box !== null).toBe(boxed));

    test('overlay ivs', async () =>
      expect((await readingOf(fixture.file)).overlay?.iv ?? null).toStrictEqual(
        ('iv' in defects ? defects.iv : legible?.iv) ?? null,
      ));

    test('overlay form', async () =>
      expect((await readingOf(fixture.file)).overlay?.form ?? null).toBe(
        ('suffix' in defects ? defects.suffix : legible?.suffix) ?? null,
      ));

    // The end of the pipeline, asserted on every capture rather than on one, which is what catches `levelsOf` admitting
    // any HP at or above the one read: against a shortlist whose largest member is already the true level, as
    // `fixtures/unown.png`'s `[1, 6, 16]` is, that break cannot move an answer.
    test('identify form', async () => {
      const { identity } = await readingOf(fixture.file);

      expect(identity.form && label(identity.form)).toBe(answered);
    });

    test('identify levels', async () => expect((await readingOf(fixture.file)).identity.levels).toStrictEqual(levels));

    test('identify alternatives', async () =>
      expect((await readingOf(fixture.file)).identity.alternatives.map(label)).toStrictEqual(alternatives));

    test('identify notes', async () => expect((await readingOf(fixture.file)).identity.notes).toStrictEqual(notes));

    // The cross-check the whole orientation of this table exists for, and the reason a settled level is derived rather
    // than stated: `cpOf` cannot answer without one, so a capture whose overlay goes unread and a capture whose HP two
    // half-levels both fit are both a null here, and neither needs a `defects` entry to say so.
    test('identify cp', async () =>
      expect((await readingOf(fixture.file)).identity.cp).toBe(
        defects.cp ?? (levels.length === 1 ? fixture.cp : null),
      ));

    test('identify nickname', async () =>
      expect((await readingOf(fixture.file)).identity.nickname).toBe(
        defects.nickname ?? (name === fixture.species ? null : name),
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
 * How many captures to have being read at once, ahead of the tests that assert them. Vitest takes a file's tests in
 * order, so without this a capture's first test paid for that capture's whole reading before the next capture was so
 * much as opened, and the suite was 49 readings end to end.
 *
 * A handful rather than all of them, and a multiplier on the machine rather than a count of processes: a single reading
 * is already as wide as the machine in places — `findOverlay` sweeps `availableParallelism()` bands at a time — so four
 * captures in flight is four Tesseract processes per core, 88 on the 22 cores every figure below was measured on and 16
 * on a four-core runner. Captures past the first few therefore buy contention rather than parallelism. On 22 cores this
 * file took 137s reading one capture at a time, 106s at four and 102s at eight, and 120s with all 49 in flight: past
 * four the curve is flat, and at the far end it is worse than reading them in order.
 *
 * Oversubscribing by four has the cost `readingOf` above names — the kernel occasionally kills one of the thousands of
 * Tesseract processes a suite spawns, and four per core makes that likelier — which is one reason not to raise it. The
 * other is that **this buys total time with per-test latency, and the exchange rate is roughly linear.** A test waits
 * on its own capture, and that capture is read alongside the others in flight, so a deeper pool makes every individual
 * wait longer while the file as a whole finishes sooner. Measured on four cores, the narrowest machine this runs on:
 *
 * | captures in flight | costliest capture's test | sum of every test's time |
 * |--------------------|--------------------------|--------------------------|
 * | none, read on demand | 8.4s                   | —                        |
 * | 1                  | 13.0s                    | 150.5s                   |
 * | 2                  | 19.4s                    | 115.5s                   |
 * | 4                  | 30.3s                    | 111.1s                   |
 *
 * The costliest capture is `overworld.png`, which carries no overlay at all, so `findOverlay` exhausts every treatment
 * over every band rather than stopping at a match.
 *
 * What the latency reaches is the clock whatever is waiting gets held to, which is why `vitest.config.mjs` gives the
 * `corpus` project its own `testTimeout` and `hookTimeout` rather than the 60s that left 30.3s only 30s of margin. That
 * is also what settles the depth: two captures in flight is within 4% of four on total time and ten seconds cheaper on
 * the worst wait, but with four times the margin on that wait the saving buys nothing, so four is kept for the column
 * that still matters. This table is the artefact to re-run if the setting is ever revisited, being the only thing here
 * that shows the trade rather than asserting a point on it.
 */
const READ_AHEAD = 4;

/** Every capture committed beside this file, which is the two tables and nothing else. */
const CORPUS = [...FIXTURES.map((f) => f.file), ...NEGATIVE];

/**
 * The corpus read through that ceiling, in declaration order so that the tests, which run in that order too, wait on
 * the readings most nearly finished. A copy of `CORPUS` because the pool below drains it destructively, and whatever
 * reads `CORPUS` wants all of it.
 *
 * The pool changes nothing any test asserts: `readingOf` memoises the promise rather than the reading, so this is the
 * same cache the tests read and not a second one, and a test reaching a capture the pool has not started yet simply
 * starts it — the memo is what keeps that from reading it twice.
 *
 * That last case is the one thing that exceeds `READ_AHEAD`, and it exceeds it by exactly one: Vitest runs a file's
 * tests one at a time, so there is never more than a single test able to add a read of its own. `READ_AHEAD` is
 * therefore a ceiling on this pool rather than on the file. It is not where the latency above comes from, though — that
 * is measurable at a pool of one, where no fifth read is possible — so what costs a test its wait is its capture being
 * read beside the others rather than being started late.
 *
 * It also takes the memo out of declaration order's hands, which is the coupling `WHOLE_CORPUS_TIMEOUT` below was left
 * documenting rather than relying on.
 *
 * The `catch` is for the clock rather than the failure. A read started here and not awaited until some later test is a
 * rejection with no handler on it for as long as that takes, which Node reports as unhandled and exits over — losing
 * the failure the suite was about to report properly. What it does not do is report that failure either: `readingOf`
 * forgets a reading that rejects, so a capture whose read-ahead was killed is read again by the test that asserts it,
 * and only a failure that reproduces on that second read is one the suite fails on.
 */
const queue = [...CORPUS];

/**
 * Set at teardown so that a pool worker between captures stops rather than taking another. A read cannot be aborted
 * once started, so this is what keeps the wait below to the ones already in flight.
 */
let abandoned = false;

/** One pool worker, taking the next capture until the corpus runs out or teardown tells it to stop. */
const drain = async () => {
  while (!abandoned) {
    const file = queue.shift();

    if (file === undefined) {
      return;
    }

    await readingOf(file).catch(() => {});
  }
};

const workers: Promise<void>[] = [];

/**
 * The pool, started from a hook rather than at import so that whatever starts it is also what stops it. Module
 * initialisation has no owner: `afterAll` bounds a file's tests, and Vitest runs no hooks at all for a file whose every
 * test its `-t` filter excluded — while still *evaluating* the module, so reads started at import had nothing that
 * would ever stop them. A run matching no test now starts no read.
 *
 * Starting here costs the read-ahead nothing. `beforeAll` runs before the first test, which is the first moment any of
 * this is wanted.
 */
beforeAll(() => {
  for (let worker = 0; worker < READ_AHEAD; worker++) {
    workers.push(drain());
  }
});

/**
 * The pool bounded by the tests that own it, so that Vitest does not tear the worker down over reads still in flight
 * and leave their Tesseract children orphaned on the pipes they inherited.
 *
 * Waiting is all that is on offer, nothing here being able to abort a read Tesseract already has, and `abandoned` is
 * what holds the wait to the reads in flight rather than the corpus behind them. The cost is not one read: it is up to
 * `READ_AHEAD` of them, finishing alongside each other so the wait is the slowest rather than the sum, and the run has
 * also already paid for every capture the pool got through while the tests it kept were running. A full run notices
 * none of it, the whole-corpus tests at the end having waited on everything already; a `-t` run against one cheap test
 * pays several captures for nothing.
 *
 * That wait is longer than the 10s Vitest allows a hook by default, which this failed outright. What it gets instead is
 * the `corpus` project's `hookTimeout` in `vitest.config.mjs`, that project being this file alone.
 */
afterAll(async () => {
  abandoned = true;

  await Promise.all(workers);
});

/**
 * What the tests that read the whole corpus in one body are given, where the `corpus` project's own `testTimeout`
 * covers everything else in this file — one capture rather than 49.
 *
 * They need it because a body that waits on all 49 captures waits on the whole corpus, which `READ_AHEAD` paces at
 * about 65s however the rest of the file is filtered: `-t 'which captures the CP is read off'` on its own has the pool
 * to warm it and still takes 64.8s, there being no earlier test to have paid for any of it. What the pool did take away
 * is the other reason this was here — that on a full run the `describe` blocks above happened to have filled the memo
 * first, which passed for warm and was a coupling rather than a guarantee.
 */
const WHOLE_CORPUS_TIMEOUT = 600_000;

/**
 * Every PNG committed beside this file, which is what the tests below check the corpus against. One list rather than
 * several, so a change to what counts as a capture cannot leave them covering different sets and each reporting that
 * the half it can see is accounted for.
 */
const COMMITTED = readdirSync(new URL('fixtures', import.meta.url))
  .filter((file) => file.endsWith('.png'))
  .sort();

/**
 * The suffix `snap` saves a stitch beside its screen under — `SCROLLED` in `scripts/inventory.mts`, which refuses a
 * NAME ending in it so that the two can never collide. Written again here rather than read off that script, which
 * cannot be imported: `parseArgs` and the command dispatch are both at its top level, so loading it runs it.
 */
const SCROLLED = '-scrolled.png';

/**
 * The corpus in its two halves. A screen is what every reader may be given and what a row is; a stitch is the same
 * screen scrolled whole, which only `parseMoves` can be handed — so the two are partitioned here once and the tests
 * below take whichever they are about, rather than each filtering for itself and drifting over which is which.
 */
const SCREENS = COMMITTED.filter((file) => !file.endsWith(SCROLLED));
const STITCHES = COMMITTED.filter((file) => file.endsWith(SCROLLED));

/**
 * That every committed capture is accounted for, which is the one thing about this corpus no row can say. A PNG added
 * to `fixtures/` and left out of `FIXTURES` costs nothing and reports nothing — the suite goes on passing at whatever
 * size it was, and the capture sits in the tree looking exactly like a capture that is pinned. So the directory is the
 * authority and the table is checked against it, in both directions: a row naming a file that is gone fails here too,
 * where otherwise it would fail as an unreadable file in the middle of an unrelated reader's own test.
 */
test('every committed capture is either a row or a negative case', () => {
  expect(SCREENS).toStrictEqual(CORPUS.toSorted());
});

/**
 * And that every stitch is a stitch *of* a screen the corpus holds. A companion whose screen is gone, or renamed, is a
 * capture of a Pokémon nothing here states — the stitch carries no row of its own, so there is nothing else to catch
 * it.
 *
 * Only one direction: a screen needs no companion. The three negatives have none, `snap` refusing to scroll a screen
 * PGSharp's overlay cannot vouch for, and three detail screens have none either, those being the captures still waiting
 * for the right Pokémon to be found — a companion of the Pokémon that was found instead would sit beside a screen of a
 * different one, which is worse than no companion at all.
 */
test('every stitch is a stitch of a screen the corpus holds', () => {
  const orphans = STITCHES.filter((file) => !SCREENS.includes(`${file.slice(0, -SCROLLED.length)}.png`));

  expect(orphans, 'a stitch has lost the screen it was taken with').toStrictEqual([]);
});

/**
 * How tall a capture may be against its own width before it is a stitch rather than a screen. Bounded on both sides and
 * thin on both, so this is measured rather than placed in the middle of the gap: the tallest aspect ratio a phone ships
 * in is 21:9, or 2.333, and the first reader answers wrong at 2.380, where `pikachu-santa-hat.png`'s star stops reading
 * as filled. `articuno-galar.png` follows at 2.496 and `ho-oh.png` at 2.546 — `isFavourite` crops that corner as a
 * fraction of the height while the star stays where the phone drew it, so a taller capture slides the band down off the
 * star and dilutes what gold is left against `FAVOURITE_GOLD`'s 1.2 points of margin.
 *
 * Which is why this is not the 2.5 that splits the difference up to a stitch's 2.97: two of the five favourites already
 * read wrong below it. A ceiling cannot reach every reader — `CP_SWEEP`'s band starts at 0.055, row 123.4 of 2244, flush
 * against the label lines at rows 123 and 127, so *any* capture taller than the phone drew pushes it off and no ceiling
 * a real phone passes would catch that. It reaches the star, which is the tightest one it can.
 */
const SCREEN_RATIO = 2.35;

/**
 * That every capture is one screen as the phone drew it rather than a stitch of several, which is the other thing about
 * this corpus no row can say. `snap --scroll` assembles a tall image out of a scroll, and it is the wrong artifact for
 * this file: the star corner, the overlay sweep, the tag band, the artwork and the CP sweep are each anchored on a
 * fraction of the image's height, so a capture three times taller moves every one of them off what it was measured
 * against. `parseMoves` is the one reader that survives, being anchored on the `GYMS & RAIDS` line.
 *
 * It is a test because prose was not enough. `scripts/inventory.mts` says it twice, once calling it a limit rather than
 * an oversight — and a stitch was still committed over all 43 detail captures, which reported as 76 failures: the five
 * readers above, and everything `identify` derives from what they answered. Not one of them said the fixtures were what
 * was wrong. The size is the cheapest thing on a capture to check and the only one that separates the two artifacts, so
 * it is checked here rather than left to surface as a reader disagreeing somewhere else.
 *
 * Over `SCREENS` rather than the whole directory, the stitches being committed on purpose and checked the other way
 * round below. That is the one thing this test asks of a name: the suffix decides which claim a capture is held to, so
 * a stitch saved under a plain name is still caught here — which is exactly how #123 failed.
 *
 * The failure names the size beside the file, because the name is the part that already looked right.
 */
test('every committed screen is one screen rather than a stitch', () => {
  const stitched = SCREENS.flatMap((file) => {
    // Off the PNG header rather than the pixels, which the spec puts at a fixed offset: an 8-byte signature, then an
    // IHDR chunk whose width and height are the 32-bit fields at 16 and 20. `decodePng` would inflate each capture to
    // 9 MB of pixels to compare two numbers — 3.4s and 606 MB across the 49, and `.map` before `.filter` holds every
    // one of them live at once, on top of the decoded corpus `read` is already keeping in the same worker.
    const bytes = readFileSync(new URL(`fixtures/${file}`, import.meta.url));
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);

    return height > width * SCREEN_RATIO ? [`${file} is ${width}x${height}`] : [];
  });

  expect(stitched).toStrictEqual([]);
});

/**
 * And the other way round: that every stitch really is taller than the phone drew, so a companion saved under the
 * suffix cannot quietly be a second copy of the screen. The ceiling is the same one, which is what makes the pair
 * exhaustive — every capture is on one side of `SCREEN_RATIO` or the other, and which side it is allowed to be on is
 * its name.
 *
 * One is not: `eevee-background-scrolled.png` is a stitch of a single frame, which `stitch` answers as a copy of that
 * frame. The scroll was refused rather than the capture mis-taken — `offsetBetween` scores every shift and takes none
 * where the best does not stand out, and against a photographic backdrop drifting between frames it stands out nowhere.
 * The screen beside it is a sound capture and its row passes; what is missing is only the tall view. Pinned as the one
 * rather than excused, because a second capture joining it says the refusal is not particular to that backdrop.
 */
test('every stitch is taller than the screen beside it, bar the one whose scroll was refused', () => {
  const copies = STITCHES.flatMap((file) => {
    const bytes = readFileSync(new URL(`fixtures/${file}`, import.meta.url));
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);

    return height > width * SCREEN_RATIO ? [] : [`${file} is ${width}x${height}`];
  });

  expect(copies, 'which stitches assembled nothing has changed').toStrictEqual([
    'eevee-background-scrolled.png is 1008x2244',
  ]);
});

/**
 * The `tEXt` keywords a capture carries, read off the chunk headers rather than through `decodePng` — which would
 * inflate a stitch to 25 MB of pixels to answer a question the bytes answer at a fixed offset, the same economy the
 * size check above makes. Keyword, a zero byte, then the value; a chunk with no separator is malformed and is named as
 * the empty string rather than skipped, so a damaged one cannot read here as a file carrying nothing.
 */
const keywordsIn = (file: string): string[] => {
  const bytes = readFileSync(new URL(`fixtures/${file}`, import.meta.url));
  const found: string[] = [];

  for (let at = 8; at + 12 <= bytes.length;) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString('latin1', at + 4, at + 8);

    if (type === 'tEXt') {
      const body = bytes.subarray(at + 8, at + 8 + length);
      const split = body.indexOf(0);

      found.push(split > 0 ? body.toString('latin1', 0, split) : '');
    }

    if (type === 'IEND') {
      break;
    }

    at += 12 + length;
  }

  return found;
};

/**
 * That every stitch carries the `Viewport` its writer records, and holds the screen beside it down to the scrolling
 * band's foot. This replaces the gap that stood here: the companions were captured before `snap` wrote the chunk, so
 * nothing in the repository could exercise a reader of it, and that was pinned as an empty list until a retake closed
 * it. The retake has happened, and this is the stronger claim it asked for.
 *
 * Both halves are one test because they are one property. `stitch` keeps every row above the band's foot from its first
 * frame verbatim, so a stitch whose first frame *is* the screen written beside it contains that screen — and a reader
 * handed the stitch can crop to the `Viewport` and see pixel for pixel what the screen reader sees. Measured across the
 * forty: every field of every reader agrees on the crop and on the screen.
 *
 * It did not hold before, and the reason is worth keeping: `snap` photographed the same screen twice, seconds apart,
 * and the two differed over about half their rows — the artwork animates, the clock ticks and PGSharp redraws its
 * overlay. One of forty held by luck. `scrollFrames` taking the screenshot already in hand is what made it forty.
 *
 * The screens are asserted to carry no `Viewport`, and for a reason that outlives the gap: `snap` writes the chunk on
 * the stitch alone, the screen's own `IHDR` height already being that number, so a `Viewport` on a screen is a writer
 * that has started saying something twice.
 */
test(
  'every stitch carries a `Viewport` and holds the screen beside it',
  () => {
    const faults: string[] = [];

    for (const file of STITCHES) {
      const screenFile = `${file.slice(0, -SCROLLED.length)}.png`;
      const screen = decodePng(readFileSync(new URL(`fixtures/${screenFile}`, import.meta.url)));
      const stitch = decodePng(readFileSync(new URL(`fixtures/${file}`, import.meta.url)));
      const wanted = `${screen.width}x${screen.height}`;

      if (stitch.text?.Viewport !== wanted) {
        faults.push(`${file} says Viewport ${JSON.stringify(stitch.text?.Viewport ?? null)}, not ${wanted}`);
        continue;
      }

      const stride = screen.width * 4;
      const foot = Math.round(screen.height * SCREEN_BAND.to);
      let differs = -1;

      for (let y = 0; y < foot && differs < 0; y++) {
        for (let x = 0; x < stride; x++) {
          if (screen.data[y * stride + x] !== stitch.data[y * stride + x]) {
            differs = y;
            break;
          }
        }
      }

      if (differs >= 0) {
        faults.push(`${file} differs from its screen at row ${differs} of ${foot}`);
      }
    }

    expect(faults).toStrictEqual([]);

    expect(
      SCREENS.filter((file) => keywordsIn(file).includes('Viewport')),
      'a screen carries a `Viewport`, which its own height already states',
    ).toStrictEqual([]);
  },
  WHOLE_CORPUS_TIMEOUT,
);

/**
 * Every figure this file's own docblock quotes about the shape of the corpus, in one place that fails when one of them
 * stops being true. The case for it is not that a count is interesting: it is that prose is the one part of a test file
 * no test reads, so a figure quoted there goes on being quoted after it stops being true.
 *
 * So each key is a sentence in the docblock above, and changing the corpus is meant to fail here and send you back to
 * that paragraph. Counted off `FIXTURES` and `overlayOf`, so this is free and cannot disagree with the loop.
 */
const COVERAGE = {
  rows: 43,
  negatives: 6,
  answeredAsThemselves: 38,
  oneLevel: 43,
  crossCheckAgrees: 41,
  crossCheckDisagrees: 2,
  severalLevels: 0,
  noLevel: 0,
  noDefects: 33,
  noOverlayDrawn: 0,
  boxNotFound: 0,
  overlayNotRead: 1,
};

test('the corpus is the shape the docblock says it is', () => {
  const settled = FIXTURES.filter((f) => overlayOf(f).levels.length === 1);

  expect(
    {
      rows: FIXTURES.length,
      negatives: NEGATIVE.length,
      answeredAsThemselves: FIXTURES.filter((f) => f.defects?.label === undefined).length,
      oneLevel: settled.length,
      crossCheckAgrees: settled.filter((f) => f.defects?.cp === undefined).length,
      crossCheckDisagrees: settled.filter((f) => f.defects?.cp !== undefined).length,
      severalLevels: FIXTURES.filter((f) => overlayOf(f).levels.length > 1).length,
      noLevel: FIXTURES.filter((f) => overlayOf(f).levels.length === 0).length,
      noDefects: FIXTURES.filter((f) => f.defects === undefined).length,
      noOverlayDrawn: FIXTURES.filter((f) => f.overlay === null).length,
      boxNotFound: FIXTURES.filter((f) => f.defects && 'box' in f.defects).length,
      overlayNotRead: FIXTURES.filter((f) => f.defects && 'iv' in f.defects).length,
    },
    'the docblock above quotes these figures; update both or neither',
  ).toStrictEqual(COVERAGE);

  // The three ways a row can account for its level have to partition the corpus, or one of the counts above is reaching
  // rows another has already claimed and the three could all be right while summing to the wrong thing.
  expect(COVERAGE.oneLevel + COVERAGE.severalLevels + COVERAGE.noLevel).toBe(COVERAGE.rows);
  expect(COVERAGE.crossCheckAgrees + COVERAGE.crossCheckDisagrees).toBe(COVERAGE.oneLevel);
});

/**
 * The vended game master's own shape, pinned for the reason the corpus's is: the `DATA` docblock quotes these five
 * figures and prose is the one part of a test file no test reads. Each is what `pnpm vend:game-master` printed as it
 * wrote the file, so this is also the only thing standing between a fixture truncated or swapped and a reader that has
 * merely stopped agreeing with a capture — the cast above it is unchecked, `JSON.parse` answering `any`.
 *
 * Expect it to move when upstream releases a species, and read that as the vend being reviewed rather than as the suite
 * breaking: a form arriving that shares a dex, its types and its stamina with one of the captures really does change
 * which forms an HP can tell apart, and the diff is where that is visible.
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
 * even, and the misreads are then **derived** from it rather than transcribed a second time: a row already states what
 * the screen shows, so the disagreement is a filter and not a list to keep in step. A misread here is a digit or two
 * lost off one end of the number to the artwork behind it.
 */
test(
  'which captures the CP is read off, and which three of them it reads wrongly',
  async () => {
    const states = new Map<string, number>();

    for (const fixture of FIXTURES) {
      const { detail } = await readingOf(fixture.file);

      if (detail.cp !== null) {
        states.set(fixture.file, detail.cp);
      }
    }

    expect(Object.fromEntries(states), 'which captures state a CP, or what they state, has changed').toStrictEqual({
      'articuno-galar.png': 1966,
      'basculin-blue.png': 253,
      'burmy-plant.png': 206,
      'burmy-sandy.png': 196,
      'castform-rainy.png': 832,
      'castform-snowy.png': 746,
      'charizard-gigantamax.png': 605,
      'deoxys-attack.png': 1441,
      'deoxys-defense.png': 1569,
      'deoxys-speed.png': 2009,
      'dialga-altered.png': 2848,
      'dialga-origin.png': 284,
      'growlithe-nickname.png': 38,
      'meowth-alola.png': 431,
      'pikachu-ash-hat.png': 489,
      'pikachu-willows-assistant.png': 385,
      'pikachu-witch-hat.png': 625,
      'pikachu.png': 325,
      'rotom-wash.png': 813,
      'unown-b.png': 487,
      'unown-m.png': 839,
      'unown-question.png': 486,
      'xurkitree.png': 2197,
    });

    // And which of them it reads *wrongly*, derived from the map rather than listed again — a row already states what
    // the screen shows, so a disagreement is a filter and not a second list to keep in step.
    //
    // Three, and all three the same shape: the leading digit is lost and the rest reads cleanly — 605 for 1605, 284 for
    // 2845, 38 for 738. The band rescue in `wholeCp` is what recovers such a line elsewhere, and on these it does not,
    // so each of the three carries a `defects.notes` entry reporting the `cps` candidate the arithmetic rejected. That
    // is the loss worth stating: the unanchored read is handed over as candidates precisely because it is unreliable,
    // and a leading digit is the digit that costs the most.
    expect(
      FIXTURES.filter((f) => states.has(f.file) && states.get(f.file) !== f.cp).map((f) => f.file),
      'which captures misread their CP has changed',
    ).toStrictEqual(['charizard-gigantamax.png', 'dialga-origin.png', 'growlithe-nickname.png']);
  },
  WHOLE_CORPUS_TIMEOUT,
);

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
  assert.ok(fixture?.overlay, 'the capture whose overlay goes unread has left the corpus');

  const { overlay } = fixture;
  const { detail } = await readingOf(fixture.file);
  const identity = identify(DATA, detail, { levels: [overlay.level], iv: overlay.iv, form: null });

  expect(detail.cp, 'the capture has lost the CP this is cross-checked against').toBe(fixture.cp);
  expect(identity.levels, 'the HP no longer agrees with the level the overlay states').toStrictEqual([overlay.level]);
  expect(identity.cp).toBe(detail.cp);
  expect(identity.notes, 'the readers disagree with each other').toStrictEqual([]);
});

/**
 * The same measurement for `fixtures/spinda-04.png`, and it costs more than a cross-check: Spinda's 20 forms are
 * identical in every field the screen shows, so the fold leaves `00` standing and the bracketed `(04)` PGSharp draws is
 * the **only** thing on the screen that can say which of the 20 it is. With the overlay unread the answer is not an
 * ambiguity but a confident wrong form, exactly as it is for Unown below.
 *
 * Which is also the case for keeping all 20 in `FORMS` where the costume fold would otherwise justify one, and the test
 * is posed so that it says so: the same detail, read once, handed to `identify` twice, with the suffix and without.
 */
test('the overlay fixtures/spinda-04.png does not read would have named one form of twenty', async () => {
  const fixture = FIXTURES.find((f) => f.file === 'spinda-04.png');
  assert.ok(fixture?.overlay, 'the capture carrying a bracketed Spinda form has left the corpus');

  const { overlay } = fixture;
  assert.ok(overlay.suffix, 'that capture has lost the bracketed form this is the measurement of');

  const { detail } = await readingOf(fixture.file);
  const stated = { levels: [overlay.level], iv: overlay.iv };
  const blind = identify(DATA, detail, { ...stated, form: null });
  const named = identify(DATA, detail, { ...stated, form: overlay.suffix });

  expect(blind.form && label(blind.form)).toBe('Spinda (00)');
  expect(blind.alternatives, 'the fold no longer collapses the 20, so this test is obsolete').toStrictEqual([]);
  expect(named.form && label(named.form)).toBe(`Spinda (${overlay.suffix})`);
  expect(named.cp, 'the CP the bracket buys no longer agrees with the screen').toBe(fixture.cp);
  expect(named.notes, 'the readers disagree with each other').toStrictEqual([]);
});

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
 * What the bracketed form buys, measured by taking it away — and the answer is not an ambiguity but a **confident wrong
 * answer**, which is why it is worth a test of its own. `identify` folds forms that repeat a base form's stats and
 * types into one, since that is what collapses a costume into the Pokémon it is a costume of; Unown's 28 are all such
 * repeats of each other, so without the suffix the fold leaves one of them standing with no alternatives beside it and
 * nothing anywhere saying it was a choice of 28.
 */
test('without the form PGSharp appends, Unown is answered confidently and wrongly', async () => {
  const { detail, overlay } = await readingOf('unown-b.png');
  assert.ok(overlay, 'the fixture has lost its overlay');

  const identity = identify(DATA, detail, { ...overlay, form: null });

  expect(identity.form?.species).toBe('Unown');
  expect(identity.form?.form).not.toBe('B');
  expect(identity.alternatives, 'the fold no longer collapses the 28, so this test is obsolete').toStrictEqual([]);
  expect(identity.levels, 'the numbers still settle the level; only the letter was ever in doubt').toStrictEqual([16]);
});

/**
 * A misread level must not switch the CP off. Deoxys' four forms share a stamina, so only the printed CP says which
 * `deoxys-attack.png` is; handed a shortlist of `1`, a level no Deoxys at this HP can be, `identify` has to check the
 * CP at every level the HP admits rather than at none.
 */
test('a level the overlay misreads leaves the CP to settle the form', async () => {
  const { detail, overlay, artwork } = await readingOf('deoxys-attack.png');
  assert.ok(overlay, 'the fixture has lost its overlay');

  const identity = identify(DATA, detail, { ...overlay, levels: [1] }, artwork);

  expect(identity.form && label(identity.form)).toBe('Deoxys (Attack)');
  expect(identity.notes).toStrictEqual(['the overlay reads as level 1, none of which this HP can be']);
});

/**
 * The printed CP settles the level as well as the form. `cherrim-sunshine.png`'s HP admits both 31 and 31.5, and the
 * overlay's `L31` is what settles it on the screen; without that, the `CP 1658` it prints is Cherrim at 31 and not at
 * 31.5, which is the same answer.
 */
test('without the level the overlay states, the CP still settles one', async () => {
  const { detail, overlay, artwork } = await readingOf('cherrim-sunshine.png');
  assert.ok(overlay, 'the fixture has lost its overlay');

  const fixture = FIXTURES.find((f) => f.file === 'cherrim-sunshine.png');
  assert.ok(fixture, 'the capture a printed CP settles a half-level on has left the corpus');

  // The row's CP rather than the one OCR reads, because this capture no longer states one it can read — the same
  // substitution `xurkitree.png`'s test makes below, and for the same reason: a row says what the screen prints where
  // `detail.cp` says what Tesseract got off it, and what is under test is the arithmetic settling a level from the
  // printed CP. A capture whose CP line will not read cannot reach that arithmetic at all, so without this the test
  // would report the OCR rather than the thing it exists for.
  const identity = identify(DATA, { ...detail, cp: fixture.cp }, { ...overlay, levels: [] }, artwork);

  expect(detail.cp, 'the capture reads its own CP again, so this can go back to the read one').toBe(null);
  expect(identity.levels).toStrictEqual([31]);
  expect(identity.cp).toBe(1658);
  expect(identity.notes, 'the readers disagree with each other').toStrictEqual([]);
});

/**
 * What the artwork may settle, measured with icons made up for the purpose since the corpus signs only Burmy and
 * Cherrim. A costume carries no icon and must not stop the forms that do from being compared — `pikachu.png` against a
 * clone given its own signature is the clone — but forms with different numbers are the numbers' to separate, so
 * Deoxys' four, with the printed CP taken away, are left as alternatives however their colours fall.
 */
test('the artwork chooses within one set of numbers, past the costumes and no further', async () => {
  const far = ARTWORK.get('Burmy (Trash)');
  assert.ok(far, 'the signature standing in for an unlike icon has left the table');

  const pikachu = await readingOf('pikachu.png');
  assert.ok(pikachu.artwork, 'the fixture has lost its artwork');

  const own = pikachu.artwork.signature;
  const clones = new Map(
    DATA.forms
      .filter((f) => f.species === 'Pikachu' && !f.costume)
      .map((f): [Form, Signature] => [f, f.form === 'Copy 2019' ? own : far]),
  );
  const clone = identify(DATA, pikachu.detail, pikachu.overlay, { signature: own, icons: clones });

  expect(clone.form && label(clone.form)).toBe('Pikachu (Copy 2019)');

  const deoxys = await readingOf('deoxys-attack.png');
  assert.ok(deoxys.artwork, 'the fixture has lost its artwork');

  const signature = deoxys.artwork.signature;
  const forms = new Map(
    DATA.forms
      .filter((f) => f.species === 'Deoxys')
      .map((f): [Form, Signature] => [f, f.form === 'Defense' ? signature : far]),
  );
  const blind = identify(DATA, { ...deoxys.detail, cp: null, cps: [] }, deoxys.overlay, { signature, icons: forms });

  expect(blind.alternatives, 'the artwork chose between forms the numbers separate').toHaveLength(3);
});

/**
 * A name that is another species' is still a nickname once the numbers have found the real one, and what is reported
 * afterwards is about the species searched rather than the one the name ruled in. `growlithe-nickname.png` renamed
 * `Eevee` matches Eevee, whose forms fit none of Fire/Rock at this HP, so every species is searched and Hisuian Growlithe
 * found; a bracketed form naming nothing is then no form of whatever fits, not of Eevee.
 */
test('a name that is another species is a nickname once the numbers say otherwise', async () => {
  const { detail, overlay, artwork } = await readingOf('growlithe-nickname.png');
  assert.ok(overlay, 'the fixture has lost its overlay');

  const identity = identify(DATA, { ...detail, name: 'Eevee' }, { ...overlay, form: 'Zz' }, artwork);

  expect(identity.form && label(identity.form)).toBe('Growlithe (Hisuian)');
  expect(identity.nickname).toBe('Eevee');
  // The third note is the capture's own and not this test's doing: `growlithe-nickname.png` reads `CP 38` for the 738
  // it prints, which its row pins as `defects.notes`. It is listed rather than filtered out so that a note arriving or
  // leaving is as loud here as anywhere else.
  expect(identity.notes).toStrictEqual([
    'the numbers do not fit any form of Eevee; searched every species',
    'the overlay says form "Zz", which is no form of any species that fits',
    'the screen reads CP 38, where this form at this level is 738',
  ]);
});

/**
 * And a nickname that hides the species with no types read has nothing to be searched by, so the note says so rather
 * than that the numbers fit nothing — they were never asked.
 */
test('a nickname with no types read is reported as unsearched, not as unfitted', async () => {
  const { detail, overlay, artwork } = await readingOf('growlithe-nickname.png');

  const identity = identify(DATA, { ...detail, types: [] }, overlay, artwork);

  expect(identity.form).toBe(null);
  expect(identity.nickname).toBe('Nickname');
  expect(identity.notes).toStrictEqual([
    'a nickname hides the species, and only the IVs, the HP and the types together can say what it is',
  ]);
});

/**
 * That some capture still carries a line a loose measurement would take. This is the half of a regression fixture that
 * gets left out: a row asserts what the readers answer, and would answer exactly the same on a capture whose status bar
 * held nothing to trip over — so the trap has to be asserted present rather than assumed. A capture is a file and
 * cannot change, but which lines Tesseract finds in it can, so what this pins is that the decoy is still being read.
 *
 * Swept over the whole corpus and pinned as the set, rather than read off the one capture that used to carry it. That
 * is the lesson of the re-snap: `xurkitree.png` was the one, its row saying so, and the capture that replaced it reads
 * nothing a measurement pattern takes — where `castform-snowy.png`'s status bar now reads `6372 026M,`. A test naming
 * a single file would have gone red on a corpus that had not lost the trap at all, and the obvious repair would have
 * been to point it at the next file and learn nothing.
 */
test(
  'some capture carries a line a loose measurement would take',
  async () => {
    const decoys: string[] = [];

    for (const file of CORPUS.toSorted()) {
      const { image, lines } = await readingOf(file);
      const height = lines.find((line) => /\d+[.,]\d+\s*m\b/i.test(line.text));
      const decoy = lines.find(
        (line) => /\d+\s*m\b/i.test(line.text) && line !== height && line.top < image.height * 0.1,
      );

      if (decoy) {
        decoys.push(file);
      }
    }

    expect(decoys, 'which captures read a loose measurement in the status bar has changed').toStrictEqual([
      'castform-snowy.png',
    ]);
  },
  WHOLE_CORPUS_TIMEOUT,
);

/**
 * One stray coloured pixel in the size badge's band, which no capture happens to carry and any could: the band is
 * cropped from the screen round the height, artwork and all. Placed at the band's far corner from the pill, where a
 * crop to every coloured pixel would take in the white panel between them, and the white text isolated out of that
 * comes back as nothing.
 */
test('a stray coloured pixel beside the size pill does not cost the badge', async () => {
  const { image, lines } = await readingOf('smoliv.png');
  const height = lines.find((l) => HEIGHT.test(l.text));
  assert.ok(height, 'smoliv.png has no height line to find the badge by');

  const stray = { ...image, data: Uint8Array.from(image.data) };
  const at = (Math.round(height.top - height.height * 1.9) * image.width + Math.round(height.left - height.height)) * 4;
  stray.data.set([255, 0, 0], at);

  // Against the same capture unaltered rather than against `XXS`, which is what the badge says and what `sizeOf` no
  // longer reads off it — `smoliv.png`'s row pins that disagreement as `defects.size`. The claim here is the stray
  // pixel costing nothing, and stating it as invariance keeps the two apart: this goes on passing when the misread is
  // fixed, where an `XXS` written out here would have to be remembered at the same time.
  expect(await sizeOf(stray, height)).toBe(await sizeOf(image, height));
  expect(await sizeOf(image, height), 'what `sizeOf` reads off this badge has changed').toBe('XS');
});

/**
 * What `identify` answers for a screen with no Pokémon on it, which it declines without comment. One definition, and a
 * whole object, so a field added to `Identity` fails each screen asserted against it until it is accounted for.
 */
const DECLINED = { form: null, cp: null, alternatives: [], levels: [], nickname: null, notes: [] };

/**
 * `fixtures/overworld.png` is the map, and this is what the detail readers answer on it: nothing, in every field. That
 * is the half a corpus of valid screens cannot state — every row asserts that a reader found the right thing and not
 * one of them asserts that a reader declines to find a thing that is not there, so a `hpOn` returning a constant would
 * pass every row it appears in. Written as one `toStrictEqual` over the whole `Detail` rather than ten assertions,
 * because the claim is about the object and a field added to `Detail` should fail here until it is accounted for.
 *
 * `identify` declines it too, and for a reason worth knowing rather than by luck: with no name read there is no
 * species, so the first filter — `f.species === species` over a `species` of `null` — admits nothing, and the fallback
 * that searches every species is gated on an IV, an HP and a type the map has none of. So `fits` is never reached over
 * the whole table at all, and the answer is a property of the pipeline rather than of whichever form the table folds
 * first — which the vended 1,449 forms say outright, where a cut-down table had to have the claim measured against a
 * real one before it could be believed at all.
 */
test('overworld.png is the map, and every reader declines it', async () => {
  const { detail, box, identity } = await readingOf('overworld.png');

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

  expect({ ...identity }, 'something was identified on the map').toStrictEqual(DECLINED);
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
 */
test('the two Squirtle captures agree on everything but the CP each reads', async () => {
  const bare = await readingOf('no-pgsharp.png');
  const toolbar = await readingOf('pgsharp-no-overlay.png');

  expect({ ...bare.detail, cp: null }).toStrictEqual({ ...toolbar.detail, cp: null });
  expect(bare.detail.cp, 'the capture PGSharp is absent from no longer misreads its CP').toBe(330);
  expect(toolbar.detail.cp, 'the capture with the toolbar up no longer reads the CP the screen prints').toBe(390);

  for (const { box, identity } of [bare, toolbar]) {
    expect(box, 'a band of a screen with no overlay on it read as one').toBe(null);
    expect(identity.form && label(identity.form)).toBe('Squirtle');
    expect(identity.levels, 'a level was settled on a screen that states none').toStrictEqual([]);
    expect(identity.cp).toBe(null);
    expect(identity.notes, 'an absent overlay is the ordinary case and not worth a note').toStrictEqual([]);
  }
});

/**
 * The three Pokédex entry screens and the species reader they are the input to. The detail screen hides a species in
 * two ways this corpus pins — a nickname printed where the name goes, and a `♀` or `♂` that OCR loses — and that
 * Pokémon's Pokédex entry is a few taps away and states the species in large flat text.
 *
 * **Both halves are asserted, and the second is the one that makes `dexOn` worth having.** It reads the three, and it
 * answers null on every other capture: every detail screen, the map, and the two PGSharp controls. A reader that
 * answered a dex off a detail screen would be worse than one that answered nothing, since the walk calls it exactly
 * when the name could not be trusted — so the rest are the assertion and the three are the easy half.
 *
 * **What makes the rest decline is the cross-check rather than the screen being bare.** A Pokédex entry carries other
 * four-digit numbers — `SEEN 2763` and `CAUGHT 1499` on `nidoran-male-pokedex.png` alone — so the number is believed
 * only where it resolves to a species and the name printed beside it folds to that same species. `0032` reaches
 * `Nidoran♂`, the line reads `NIDORAN`, and both fold to `nidoran`; `2763` reaches no species at all.
 *
 * **The name cannot do this job, which is why the number does it.** `NIDORAN` and `NIDORAN ?` fold to one string where
 * `0032` and `0029` do not, so the two Nidoran lose their glyph on this screen exactly as they do on the detail screen
 * and the number is the only thing that tells them apart.
 *
 * Until a walk calls it, `identify` declines all three as detail screens — the readers' own half of that is the Pokédex
 * test above — because a walk must not take a Pokédex entry for a Pokémon and file a species with every number missing.
 * With no name there is no species, and the search across every species needs an IV and an HP as well as a type.
 */
test(
  'the Pokédex entry names its species, and no other capture names one',
  async () => {
    const entries: Record<string, [number, string]> = {
      'deerling-pokedex.png': [585, 'Deerling'],
      'nidoran-female-pokedex.png': [29, 'Nidoran♀'],
      'nidoran-male-pokedex.png': [32, 'Nidoran♂'],
    };

    for (const [file, [dex, species]] of Object.entries(entries)) {
      const { lines, identity } = await readingOf(file);

      expect(dexOn(lines, DATA), `${file} no longer reads its own dex number`).toBe(dex);
      expect(
        DATA.forms.find((f) => f.dex === dex)?.species,
        `${file}'s number no longer reaches its species in the vended game master`,
      ).toBe(species);

      expect({ ...identity }, `something was identified on the Pokédex entry ${file}`).toStrictEqual(DECLINED);
    }

    const elsewhere: string[] = [];
    let asked = 0;

    for (const file of CORPUS) {
      if (file in entries) {
        continue;
      }

      const { lines } = await readingOf(file);
      asked++;

      if (dexOn(lines, DATA) !== null) {
        elsewhere.push(file);
      }
    }

    expect(elsewhere, 'a capture that is not a Pokédex entry answered a dex number').toStrictEqual([]);

    // The count, because an empty list of offenders is also what a loop that asked nothing produces — which is the
    // failure this whole test exists to rule out, one level up.
    expect(asked, 'the reader was not asked about every other capture').toBe(
      CORPUS.length - Object.keys(entries).length,
    );
  },
  WHOLE_CORPUS_TIMEOUT,
);

/**
 * That a species read off the Pokédex does not cost the nickname, which is the half of `identify` the override could
 * most easily have broken: the dex decides the species, and the name is still what says whether there is a nickname,
 * which is what keeps `ho-oh.png` a Ho-Oh called `96%`.
 *
 * It is also the case where the fallback changes nothing, and that is worth asserting rather than assuming: the CP
 * narrowing already settles this capture, so the dex has to agree with an answer that was right without it.
 */
test('a species read off the Pokédex leaves the nickname alone', async () => {
  const { detail, overlay, artwork, identity: without } = await readingOf('ho-oh.png');
  const dex = DATA.forms.find((f) => f.species === 'Ho-Oh')?.dex ?? null;
  const identity = identify(DATA, detail, overlay, artwork, dex);

  expect(identity.form && label(identity.form)).toBe('Ho-Oh');

  // Against what the same capture answers *without* the override rather than against `96%`, which is the nickname the
  // screen prints and the one the name pass no longer reads — `ho-oh.png`'s row pins that as `defects.nickname`, the
  // green `LUCKY POKÉMON` under the nickname being taken for the name. The claim here is the override leaving the
  // nickname untouched, so stating it as invariance keeps this passing once the misread is fixed, where a `96%` written
  // out would have to be remembered at the same moment.
  expect(identity.nickname, 'the dex override swallowed the nickname the screen prints').toBe(without.nickname);
  expect(without.nickname, 'what `ho-oh.png` reads as its nickname has changed').toBe('LUCKY POKEMON');
  expect(identity.notes, 'the Pokédex and the numbers agree, so there is nothing to report').toStrictEqual([]);
});

/**
 * The Nidoran this reader exists for, end to end: `dexOn` reads `nidoran-male-pokedex.png`'s number, and `identify`,
 * handed a detail screen whose name has lost its `♂`, answers Nidoran♂ without reporting the lost glyph as the Pokédex
 * disagreeing. `NIDORAN` reads as either Nidoran, and `closest` breaks that tie towards Nidoran♀.
 *
 * Then the title line with residue round it, varied on that capture's own lines: a glyph after the name read as a
 * letter still leads with the species, and one ahead of the number read as a digit makes five digits rather than a dex.
 */
test('a Nidoran read off its entry is that Nidoran, glyph or no glyph', async () => {
  const { lines, detail } = await readingOf('nidoran-male-pokedex.png');
  const identity = identify(DATA, { ...detail, name: 'NIDORAN' }, null, undefined, dexOn(lines, DATA));

  expect(identity.form && label(identity.form)).toBe('Nidoran♂');
  expect(identity.notes, 'the lost glyph was reported as the Pokédex disagreeing').toStrictEqual([]);

  const title = lines.findIndex((line) => /\b0032\b/.test(line.text));
  assert.ok(title >= 0, 'the capture has lost the title line this varies');

  const retitled = (text: string) => lines.map((line, i) => (i === title ? { ...line, text } : line));

  expect(dexOn(retitled('0032 NIDORAN d'), DATA), 'residue after the name').toBe(32);
  expect(dexOn(retitled('90032 NIDORAN'), DATA), 'a digit ahead of the number').toBe(null);
});

/**
 * What `parseMoves` reads off every committed capture, against what each screen shows, read by eye and asserted as the
 * whole map so a reader that gained one move and lost another cannot come out even. The captures were taken for the
 * top of the screen, but most reach the `GYMS & RAIDS` tab and the rows below it, so the moves are in reach of 43.
 *
 * A screen cut off short of a move asserts what it shows in full: `no-pgsharp.png` and `pgsharp-no-overlay.png` end
 * halfway through Water Pulse, and the two hatted Pikachu above their charged move. The screens with no tab assert no
 * moves at all, which is the half that keeps the reader honest: `charizard-gigantamax.png` is scrolled to its Mega
 * Evolution, `applin.png` to its evolutions, and the rest are not detail screens. `castform-rainy.png`,
 * `castform-sunny.png` and `cherrim-overcast.png` do the same for a caption: each has `WEATHER BONUS` under a move and
 * Weather Ball in its pool.
 */
test(
  'the moves read off every capture are the ones on its screen',
  async () => {
    const read: Record<string, Moves> = {};

    for (const file of CORPUS.toSorted()) {
      const { lines, image, identity } = await readingOf(file);
      read[file] = await parseMoves(lines, DATA, identity.form, image);
    }

    expect(read).toStrictEqual({
      'applin.png': { fast: null, charged: [] },
      'articuno-galar.png': { fast: 'Confusion', charged: ['Fly'] },
      'articuno-kanto.png': { fast: 'Powder Snow', charged: ['Ice Beam'] },
      'basculin-blue.png': { fast: 'Water Gun', charged: ['Muddy Water'] },
      'burmy-plant.png': { fast: 'Tackle', charged: ['Struggle'] },
      'burmy-sandy.png': { fast: 'Tackle', charged: ['Struggle'] },
      'burmy-trash.png': { fast: 'Bug Bite', charged: ['Struggle'] },
      'castform-normal.png': { fast: 'Tackle', charged: ['Weather Ball'] },
      'castform-rainy.png': { fast: 'Tackle', charged: ['Thunder'] },
      'castform-snowy.png': { fast: 'Powder Snow', charged: ['Blizzard'] },
      'castform-sunny.png': { fast: 'Tackle', charged: ['Fire Blast'] },
      'chansey-dynamax.png': { fast: 'Pound', charged: ['Psychic'] },
      'charizard-gigantamax.png': { fast: null, charged: [] },
      'cherrim-overcast.png': { fast: 'Bullet Seed', charged: ['Hyper Beam'] },
      'cherrim-sunshine.png': { fast: 'Razor Leaf', charged: ['Solar Beam'] },
      'deerling-pokedex.png': { fast: null, charged: [] },
      'deoxys-attack.png': { fast: 'Poison Jab', charged: ['Psycho Boost'] },
      'deoxys-defense.png': { fast: 'Counter', charged: ['Psycho Boost'] },
      'deoxys-normal.png': { fast: 'Zen Headbutt', charged: ['Hyper Beam'] },
      'deoxys-speed.png': { fast: 'Charge Beam', charged: ['Thunderbolt'] },
      'dialga-altered.png': { fast: 'Dragon Breath', charged: ['Thunder'] },
      'dialga-origin.png': { fast: 'Dragon Breath', charged: ['Iron Head'] },
      'eevee-background.png': { fast: 'Tackle', charged: ['Swift'] },
      'growlithe-nickname.png': { fast: 'Ember', charged: ['Flamethrower'] },
      'ho-oh.png': { fast: 'Extrasensory', charged: [] },
      'meloetta-aria.png': { fast: 'Quick Attack', charged: ['Thunderbolt'] },
      'meowth-alola.png': { fast: 'Scratch', charged: ['Foul Play'] },
      'meowth-galar.png': { fast: 'Metal Sound', charged: ['Trailblaze'] },
      'meowth-kanto.png': { fast: 'Bite', charged: ['Night Slash'] },
      'nidoran-female-pokedex.png': { fast: null, charged: [] },
      'nidoran-male-pokedex.png': { fast: null, charged: [] },
      'no-pgsharp.png': { fast: 'Bubble', charged: [] },
      'overworld.png': { fast: null, charged: [] },
      'pgsharp-no-overlay.png': { fast: 'Bubble', charged: [] },
      'pikachu-ash-hat.png': { fast: 'Thunder Shock', charged: ['Thunderbolt'] },
      'pikachu-santa-hat.png': { fast: 'Present', charged: [] },
      'pikachu-willows-assistant.png': { fast: 'Quick Attack', charged: ['Thunderbolt'] },
      'pikachu-witch-hat.png': { fast: 'Quick Attack', charged: ['Discharge'] },
      'pikachu.png': { fast: 'Thunder Shock', charged: ['Discharge'] },
      'rotom-wash.png': { fast: 'Thunder Shock', charged: ['Hydro Pump'] },
      'smoliv.png': { fast: 'Tackle', charged: ['Energy Ball'] },
      'snorlax-purified.png': { fast: 'Lick', charged: ['Return'] },
      'spinda-04.png': { fast: 'Sucker Punch', charged: ['Icy Wind'] },
      'spoink.png': { fast: 'Splash', charged: ['Psybeam'] },
      'unown-b.png': { fast: 'Hidden Power', charged: [] },
      'unown-exclamation.png': { fast: 'Hidden Power', charged: ['Struggle'] },
      'unown-m.png': { fast: 'Hidden Power', charged: ['Struggle'] },
      'unown-question.png': { fast: 'Hidden Power', charged: ['Struggle'] },
      'xurkitree.png': { fast: 'Thunder Shock', charged: ['Power Whip'] },
    });
  },
  WHOLE_CORPUS_TIMEOUT,
);

/**
 * The distinct values a column of the table holds, as words. Written out rather than left to `Array#sort`, which
 * stringifies an `undefined` and so files it after every capital letter — `['XL', 'XS', 'XXL', 'XXS', undefined]`,
 * which is the right set in an order nobody would write down on purpose.
 */
const distinct = (rows: readonly Fixture[], of: (row: Fixture) => unknown): string[] =>
  [...new Set(rows.map((row) => String(of(row))))].sort();

/**
 * What the artwork match answers, for the captures whose form shares its dex, types and all three base stats with
 * another, so that nothing `parseDetail` or the overlay reads can separate them. Asserted as the whole map, so a reader
 * that gained one answer and lost another cannot come out even, and one that answered wrong fails it as surely as one
 * that answered nothing.
 *
 * Two of the five are answered and three are declined, which is both halves rather than one: `MARGIN` mattering is now
 * something this would notice, where on the captures it was written against every one was answered and the margin could
 * have been 0 unremarked.
 *
 * The three that decline are the Burmy cloaks, and the decline is the match's own doing rather than stale data here —
 * `ARTWORK` holds signatures of the game's icons, which no capture can move, so what changed is the signature the
 * capture yields. Their rows carry `defects.label` saying what `identify` then answers: `Burmy (Plant)` for all three,
 * the fold's first cloak, with nothing beside it saying that was a choice.
 */
test(
  'the artwork settles two of five forms the numbers cannot, and declines three',
  async () => {
    const { drawn } = ambiguous(DATA);
    const answers = new Map<string, string>();

    for (const fixture of FIXTURES) {
      const truth = fixture.form ? `${fixture.species} (${fixture.form})` : fixture.species;

      // The forms this one is indistinguishable from, which is the only situation the artwork is consulted in.
      const family = drawn.find((members) => members.some((f) => label(f) === truth));

      if (!family?.every((f) => ARTWORK.has(label(f)))) {
        continue;
      }

      // Floored on the overlay's box where one was found, PGSharp drawing over the artwork, so no fraction of one
      // phone's screen is written down here.
      const { image, box } = await readingOf(fixture.file);
      const signature = signatureOf(image, box ? box.y + box.height : undefined);
      assert.ok(signature, `${fixture.file} yields no artwork signature at all`);

      const icons = new Map(
        family.flatMap((f): [string, Signature][] => {
          const icon = ARTWORK.get(label(f));

          return icon ? [[label(f), icon]] : [];
        }),
      );

      answers.set(fixture.file, nearest(signature, icons) ?? 'declined');
    }

    expect(Object.fromEntries(answers)).toStrictEqual({
      'burmy-plant.png': 'declined',
      'burmy-sandy.png': 'declined',
      'burmy-trash.png': 'declined',
      'cherrim-overcast.png': 'Cherrim (Overcast)',
      'cherrim-sunshine.png': 'Cherrim (Sunny)',
    });
  },
  WHOLE_CORPUS_TIMEOUT,
);

/**
 * The same over the stitched companions, which is the whole of what they are committed for. `parseMoves` is the one
 * reader a stitch can be handed — it anchors on the `GYMS & RAIDS` line where every other reader anchors on a fraction
 * of the image's height — and a stitch is the only artifact that holds the moves whole, an unscrolled capture reaching
 * them at its foot and stopping there.
 *
 * What it buys, measured: four of the 38 screens read no charged move at all, and the stitch beside each reads one.
 * `ho-oh.png` ends just under `Extrasensory` and its stitch answers `Brave Bird`; `unown-b.png` the same for
 * `Struggle`; `applin.png` and `charizard-gigantamax.png` are scrolled to evolutions and a Mega, so their screens read
 * **no move at all** where their stitches read both. The other 34 agree with the screen, which is the half that says
 * the stitch is of the same Pokémon rather than a tall image of something else.
 *
 * The form comes off the screen rather than the stitch, every reader that could answer one being anchored on a height
 * the stitch does not have. That is the pairing this rests on, and the test above it is what holds the pair together.
 */
test(
  'the moves read off every stitch are the whole of what its screen shows',
  async () => {
    const read: Record<string, Moves> = {};

    for (const file of STITCHES) {
      const screen = `${file.slice(0, -SCROLLED.length)}.png`;
      const { identity } = await readingOf(screen);
      const image = decodePng(readFileSync(new URL(`fixtures/${file}`, import.meta.url)));

      read[file] = await parseMoves(await readLines(image), DATA, identity.form, image);
    }

    expect(read).toStrictEqual({
      'applin-scrolled.png': { fast: 'Astonish', charged: ['Struggle'] },
      'articuno-galar-scrolled.png': { fast: 'Confusion', charged: ['Fly'] },
      'articuno-kanto-scrolled.png': { fast: 'Powder Snow', charged: ['Ice Beam'] },
      'basculin-blue-scrolled.png': { fast: 'Water Gun', charged: ['Muddy Water'] },
      'burmy-plant-scrolled.png': { fast: 'Tackle', charged: ['Struggle'] },
      'burmy-sandy-scrolled.png': { fast: 'Tackle', charged: ['Struggle'] },
      'burmy-trash-scrolled.png': { fast: 'Bug Bite', charged: ['Struggle'] },
      'castform-normal-scrolled.png': { fast: 'Tackle', charged: ['Weather Ball'] },
      'castform-rainy-scrolled.png': { fast: 'Tackle', charged: ['Thunder'] },
      'castform-snowy-scrolled.png': { fast: 'Powder Snow', charged: ['Blizzard'] },
      'castform-sunny-scrolled.png': { fast: 'Tackle', charged: ['Fire Blast'] },
      'chansey-dynamax-scrolled.png': { fast: 'Pound', charged: ['Psychic'] },
      'charizard-gigantamax-scrolled.png': { fast: 'Air Slash', charged: ['Air Cutter'] },
      'cherrim-overcast-scrolled.png': { fast: 'Bullet Seed', charged: ['Hyper Beam'] },
      'cherrim-sunshine-scrolled.png': { fast: 'Razor Leaf', charged: ['Solar Beam'] },
      'deoxys-attack-scrolled.png': { fast: 'Poison Jab', charged: ['Psycho Boost'] },
      'deoxys-defense-scrolled.png': { fast: 'Counter', charged: ['Psycho Boost'] },
      'deoxys-normal-scrolled.png': { fast: 'Zen Headbutt', charged: ['Hyper Beam'] },
      'deoxys-speed-scrolled.png': { fast: 'Charge Beam', charged: ['Thunderbolt'] },
      'dialga-altered-scrolled.png': { fast: 'Dragon Breath', charged: ['Thunder'] },
      'dialga-origin-scrolled.png': { fast: 'Dragon Breath', charged: ['Iron Head'] },
      'eevee-background-scrolled.png': { fast: 'Tackle', charged: ['Swift'] },
      'growlithe-nickname-scrolled.png': { fast: 'Ember', charged: ['Flamethrower'] },
      'ho-oh-scrolled.png': { fast: 'Extrasensory', charged: ['Brave Bird'] },
      'meloetta-aria-scrolled.png': { fast: 'Quick Attack', charged: ['Thunderbolt'] },
      'meowth-alola-scrolled.png': { fast: 'Scratch', charged: ['Foul Play'] },
      'meowth-galar-scrolled.png': { fast: 'Metal Sound', charged: ['Trailblaze'] },
      'meowth-kanto-scrolled.png': { fast: 'Bite', charged: ['Night Slash'] },
      'pikachu-ash-hat-scrolled.png': { fast: 'Thunder Shock', charged: ['Thunderbolt'] },
      'pikachu-witch-hat-scrolled.png': { fast: 'Quick Attack', charged: ['Discharge'] },
      'rotom-wash-scrolled.png': { fast: 'Thunder Shock', charged: ['Hydro Pump'] },
      'smoliv-scrolled.png': { fast: 'Tackle', charged: ['Energy Ball'] },
      'snorlax-purified-scrolled.png': { fast: 'Lick', charged: ['Return'] },
      'spinda-04-scrolled.png': { fast: 'Sucker Punch', charged: ['Icy Wind'] },
      'unown-b-scrolled.png': { fast: 'Hidden Power', charged: ['Struggle'] },
      'unown-exclamation-scrolled.png': { fast: 'Hidden Power', charged: ['Struggle'] },
      'unown-m-scrolled.png': { fast: 'Hidden Power', charged: ['Struggle'] },
      'xurkitree-scrolled.png': { fast: 'Thunder Shock', charged: ['Power Whip'] },
    });

    // And that no stitch reads *less* than its screen, which is the relation rather than the map: a companion that had
    // been stitched at the wrong offset could hold a plausible pair of moves and still have lost one the screen shows.
    for (const file of STITCHES) {
      const screen = `${file.slice(0, -SCROLLED.length)}.png`;
      const { lines, image, identity } = await readingOf(screen);
      const shown = await parseMoves(lines, DATA, identity.form, image);
      const whole = read[file];

      assert.ok(whole, `${file} read no moves at all`);
      expect(whole.charged.length, `${file} lost a charged move its screen shows`).toBeGreaterThanOrEqual(
        shown.charged.length,
      );

      if (shown.fast !== null) {
        expect(whole.fast, `${file} lost the fast move its screen shows`).toBe(shown.fast);
      }
    }
  },
  WHOLE_CORPUS_TIMEOUT,
);

/**
 * The property `assetBundleValue` quietly broke and the whole artwork narrowing rests on: within a family the numbers
 * cannot separate, no two forms may be handed the same icon. Zygarde's `FIFTY_PERCENT` and `COMPLETE_FIFTY_PERCENT`
 * both carried `1`, so one file was fetched twice and the two scored identically — a guaranteed abstention that read
 * as the artwork being indecisive rather than as the key being wrong. Asserted off the vended game master, so it needs
 * no network and moves only when a re-vend moves it.
 *
 * Both halves of the partition are asserted non-empty, since a resolver answering null for everything would leave
 * `drawn` empty and every family short, and one answering a name for everything would leave `short` empty — and each
 * of those passes a clash test that has nothing to compare.
 */
test('no family the artwork narrows has two forms sharing an icon', () => {
  const { drawn, short } = ambiguous(DATA);
  const clashes = drawn
    .filter((family) => new Set(family.map((f) => f.icon)).size !== family.length)
    .map((family) => family.map((f) => `${label(f)}=${f.icon}`).join(' '));

  expect(clashes, 'two forms a family is narrowed within are being compared against one icon').toStrictEqual([]);

  assert.ok(drawn.length > 0, 'no family has an icon for every form, so the clash check compares nothing');
  assert.ok(short.length > 0, 'every family has an icon for every form, so nothing exercises the gap it reports');
});

/**
 * Which families are short of an icon, named rather than counted, because `ICON_DIR` once pointed at a directory
 * `pogo_assets` had stopped filling and nothing could tell: its listing answered `truncated: false` over 3,522 valid
 * `pm{dex}.f{FORM}.icon.png` names, every form resolved against it as before, and Mimikyu, Cramorant and Squawkabilly
 * were short of every one of their icons for a year. A stale index fails open twice over — the assertions above pass on
 * any listing that is neither empty nor total, and `vend-game-master.mts` refuses only the one that resolves *nothing*.
 *
 * So the names are the assertion. Each is a family the game draws no full set of artwork for, and the reason differs
 * per entry: the three beasts carry an `_S` form the game never shows, `AR_PHOTO_FEATURE_FLAGS` excluding it beside
 * `VENUSAUR_COPY_2019`; Spinda has nine of twenty patterns released and nine icons; Scatterbug and Spewpa are drawn
 * without their pattern, only Vivillon showing it; Minior and Magearna have no art anywhere in `pogo_assets`.
 *
 * **A full set is what the artwork needs, not what it is given.** `drawn` means every member has a file, which is the
 * precondition `identify` checks before consulting the artwork at all — it is not a claim that the family can be told
 * apart. Running each of the 162 live icons against its own family through `nearest` at `MARGIN`, the best query a
 * capture could ever be, only **15 of the 44** families identify every member: Mimikyu answers 0 of 2 with its icons
 * 0.1139 apart, Cramorant 1 of 3 at 0.0912 and Squawkabilly 2 of 4 at 0.0578. Latias, Latios, Maushold, Poltchageist,
 * Rockruff, Sinistcha and the two Zygarde groups do worse still, holding two icons whose signatures are identical —
 * none of them a family this test names, which lists the ones with no full set rather than the ones the margin defeats.
 *
 * Expect it to move when upstream publishes art or the game master releases a form, and read either as the vend being
 * reviewed rather than as the suite breaking. A name **arriving** is the case worth stopping on: it says a family lost
 * an icon it had, which is what going stale looked like.
 */
test('the families short of an icon are the ones upstream draws no full set for', () => {
  const { short } = ambiguous(DATA);

  expect(
    short.map((family) => `${family[0]?.species} (${family.length})`),
    'a name arriving means a family lost an icon it had; re-vend and update both or neither',
  ).toStrictEqual([
    'Raikou (2)',
    'Entei (2)',
    'Suicune (2)',
    'Spinda (20)',
    'Scatterbug (20)',
    'Spewpa (20)',
    'Minior (7)',
    'Magearna (2)',
  ]);
});

test('the corpus reaches both sides of every attribute', () => {
  for (const flag of ['favourite', 'lucky', 'purified', 'shiny'] as const) {
    assert.ok(
      FIXTURES.some((f) => f[flag]) && FIXTURES.some((f) => !f[flag]),
      `every capture is ${flag} or none is, so nothing separates the two`,
    );
  }

  // `shadow` is the fifth of those and cannot be asserted that way: no capture is shadow, so the column is false on all
  // 43. Stated here as the gap it is rather than quietly dropping `shadow` from the list above and leaving a reader to
  // find the hole.
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

  // A name the species list answers against one it does not, which is what separates a species from a nickname. Three
  // captures print a nickname, and two of those print `96%`.
  assert.ok(
    FIXTURES.some((f) => f.name !== undefined) && FIXTURES.some((f) => f.name === undefined),
    'nothing separates a name that matched a species from one left as a nickname',
  );

  // Both kinds of absent overlay, which the loop asserts apart and so a corpus holding one kind alone would let it
  // conflate. The corpus now holds **neither**, and that is a hole rather than a measurement: `snorlax-purified.png`
  // was the one screen PGSharp had drawn no overlay on at all, and the capture that replaced it carries one. So nothing
  // here reaches the `boxed === false` half of `overlayOf` any more, and a capture with PGSharp switched off is what
  // would close it.
  //
  // Both are asserted as empty rather than dropped, because either coming back is news: the first says the gap has
  // closed, the second that `findOverlay` has started missing a box that is on the screen.
  expect(
    FIXTURES.filter((f) => f.overlay === null).map((f) => f.file),
    'a capture with no overlay drawn is back, so this gap has closed and `some` can assert it again',
  ).toStrictEqual([]);
  expect(
    FIXTURES.filter((f) => f.defects && 'box' in f.defects).map((f) => f.file),
    'a capture needs `defects.box` again, so `findOverlay` has started missing a box that is on the screen',
  ).toStrictEqual([]);

  // The same shape for the types, and the same reason: `typesOf` reads a type off every screen that states one, so no
  // capture needs `defects.types`, and one that does is a regression this reports.
  expect(
    FIXTURES.filter((f) => f.defects && 'types' in f.defects).map((f) => f.file),
    'a capture needs `defects.types` again, so `typesOf` has started reading no type off a screen that states one',
  ).toStrictEqual([]);

  // And both kinds of bracketed form: some captures carry a suffix that names a form of their species, and two carry
  // one that names no form at all, those being PGSharp's `[` and `\` for Unown's two punctuation forms.
  assert.ok(
    FIXTURES.some((f) => f.overlay?.suffix !== undefined && f.overlay.suffix === f.form) &&
      FIXTURES.some((f) => f.overlay?.suffix !== undefined && f.overlay.suffix !== f.form),
    'nothing separates a bracketed form that names one from a bracketed form that names nothing',
  );

  // Which `Defects` keys any capture pins, as the whole set rather than one `ok` per key, so that a key arriving is as
  // loud as a key leaving. The keys rather than the values, because some of the defects are `null` — a triple never
  // read, a suffix that reads as nothing — and a truth test would file those as absent. A key nothing pins is a reader
  // free to change its answer unremarked, which is the same hazard an unasserted field is and reads exactly the same
  // way.
  expect(
    [...new Set(FIXTURES.flatMap((f) => Object.keys(f.defects ?? {})))].sort(),
    'a reader has started or stopped disagreeing with the screen about something',
  ).toStrictEqual(['alternatives', 'cp', 'iv', 'label', 'levels', 'name', 'nickname', 'notes', 'size']);

  // And the other side of it, which the keys above cannot give: that some capture carries no defect at all. Without it
  // a reader that was wrong everywhere would pass every row it had a `defects` entry in.
  assert.ok(
    FIXTURES.some((f) => f.defects === undefined),
    'every capture carries a defect, so nothing says a reader ever agrees with its screen outright',
  );
});
