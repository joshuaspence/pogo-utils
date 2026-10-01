/**
 * What the detail screen's readers make of real screens, over a corpus of eight captures committed beside this file.
 *
 * Every reader here is a pure function of a screenshot, so the only thing a test of them needs is the screenshot — no
 * phone, no network and no game master, since `parseDetail` reaches the data only through `typesOf` and that wants the
 * eighteen type names and nothing else. Downloading the real one is 23 MB for a list that fits on two lines.
 *
 * **Each fixture was selected by a search that pins every attribute at once, and the search is in the table.** That is
 * the point of it rather than a note: a capture chosen because a sprite looked small to me is only as good as my eye,
 * where `xxs&female&!lucky&!shiny&!costume&!background&!shadow&!purified` is the game stating all eight, falsifiably —
 * re-run it and the first match is in the set the row claims. So a row's `size` and `gender` are the game's answers and
 * the assertions are what the readers must agree with, not the other way round.
 *
 * `fixtures/xxl-status-bar.png` is the one exception and is here for a different job, which its own row says: it is the
 * only capture of the eight whose status bar OCRs as a measurement, so it is the only one that can fail if a
 * measurement's anchor stops requiring a decimal point. Its attributes were checked by eye against the rendered screen
 * rather than pinned by a search, which is weaker provenance and enough for a regression fixture.
 *
 * Three fields are deliberately not asserted, each for its own reason:
 *
 * - **`heightM`**, because the size badge corrupts it. The pill is drawn over the height and its tail sits on the
 *   second digit, so `fixtures/xxl-male.png` renders `1.1m` and reads `1.4m`. The fixture is committed, which is what
 *   makes that defect reproducible; asserting the wrong value would leave a trap, and asserting the right one a test
 *   that fails on arrival.
 * - **`name`**, because it is a nickname field rather than a species field. Six of the seven captures happen to hold
 *   the species, and `fixtures/lucky-shiny.png` is nicknamed `96%`, which no reading can turn into a Pokémon. Resolving
 *   the species is `identify`'s job and it needs the game master. The one row whose own search named a species asserts
 *   it, below.
 * - **`cp`**, which `Detail` says is usually nothing: it is white over the artwork, and `cpOf` derives it instead.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { closest, type GameData } from './game-master.mts';
import { decodePng } from './png.mts';
import { findOverlay, parseDetail, readLines, readOverlay, type Gender, type Size } from './screens.mts';

/**
 * The eighteen type names, which is the whole of what `parseDetail` asks the game master for — it matches the two
 * coloured labels under the weight against this list and touches nothing else. The rest of a `GameData` is what
 * `identify` needs, and nothing here calls it.
 */
const DATA: GameData = {
  types: [
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
  ],
  forms: [],
  moves: [],
  species: [],
  cpm: [],
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
  /** What PGSharp appends in brackets after the IVs, which is how a form is asserted with no game master. */
  form: string | null;
  /** Asserted only where the row's own search named the species, so the expectation is the game's and not a reading. */
  species?: string;
}

const FIXTURES: readonly Fixture[] = [
  {
    file: 'xxl-male.png',
    search: 'xxl&male&!lucky&!shiny&!costume&!background&!shadow&!purified',
    size: 'XXL',
    gender: 'male',
    favourite: false,
    tags: [],
    hp: 59,
    types: ['Psychic'],
    weightKg: 43.83,
    form: null,
  },
  {
    file: 'xl-female.png',
    search: 'xl&female&!lucky&!shiny&!costume&!background&!shadow&!purified',
    size: 'XL',
    gender: 'female',
    favourite: false,
    tags: [],
    hp: 69,
    types: ['Grass', 'Dragon'],
    weightKg: 0.95,
    form: null,
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
    form: 'L',
    species: 'Unown',
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
    form: null,
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
    form: null,
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
    form: null,
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
    form: null,
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
    form: null,
  },
];

for (const fixture of FIXTURES) {
  test(`${fixture.file} reads as ${fixture.search}`, async () => {
    const image = decodePng(readFileSync(new URL(`fixtures/${fixture.file}`, import.meta.url)));
    const detail = await parseDetail(await readLines(image), DATA, image);
    const box = await findOverlay(image);
    const overlay = box ? await readOverlay(image, box) : null;

    assert.deepStrictEqual(
      {
        size: detail.size,
        gender: detail.gender,
        favourite: detail.favourite,
        tags: detail.tags.map((read) => closest(read, TAGS, (name) => name, TAG_SLACK)),
        hp: detail.hp,
        types: detail.types,
        weightKg: detail.weightKg,
        form: overlay?.form ?? null,
        ...(fixture.species === undefined ? {} : { species: detail.name }),
      },
      {
        size: fixture.size,
        gender: fixture.gender,
        favourite: fixture.favourite,
        tags: fixture.tags,
        hp: fixture.hp,
        types: fixture.types,
        weightKg: fixture.weightKg,
        form: fixture.form,
        ...(fixture.species === undefined ? {} : { species: fixture.species }),
      },
    );
  });
}

/**
 * That `fixtures/xxl-status-bar.png` still carries the line its row is here for. This is the half of a regression
 * fixture that gets left out: the row above asserts what the readers answer, and would answer exactly the same on a
 * capture whose status bar held nothing to trip over — so the trap has to be asserted present rather than assumed. A
 * capture is a file and cannot change, but which lines Tesseract finds in it can, so what this really pins is that the
 * decoy is still being read.
 */
test('the status-bar fixture carries a line a loose measurement would take', async () => {
  const image = decodePng(readFileSync(new URL('fixtures/xxl-status-bar.png', import.meta.url)));
  const lines = await readLines(image);
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
});
