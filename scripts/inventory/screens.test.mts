/**
 * What the detail screen's readers make of real screens, over a corpus of 64 captures committed beside this file.
 *
 * Every reader here is a pure function of a screenshot, so the only thing a test of them needs is the screenshot — no
 * phone and no network. The game master it needs is small and derived rather than downloaded: eighteen type names for
 * `parseDetail`, and for `identify` 122 forms over 41 species and the CP multiplier table, each read once out of a real
 * `loadGameData('.cache/inventory')` and recorded below with what it answered. Downloading it per run is 23 MB.
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
 * recording `cp` as whatever OCR made of it could check only the 20 OCR reads it on, four of those wrongly.
 *
 * It reaches the 40 rows where `identify` settles on exactly one level, and on 32 of those the derived CP is the CP the
 * screen prints. The other eight are the check doing its other job rather than failing to run: each derives a CP that
 * *disagrees* with the screen, which is the pipeline saying the form or the level is wrong, and is carried as
 * `defects.cp`. That is the whole of the evidence that `ho-oh.png` is a Ho-Oh answered as a Charizard — 2640 derived
 * against the `CP 2738` it prints. Of the remaining 21, `pikachu-witch-hat.png` settles on two levels and so derives
 * nothing, and 20 settle on none, every one of them an overlay a reader did not get to.
 *
 * `COVERAGE` below pins those counts, because a figure quoted in prose is a figure nothing checks: `39 of the 61` stood
 * in this paragraph until it was measured and turned out to be 32.
 *
 * **Provenance is not the same for all of them, and the difference is worth stating rather than glossing.** Seven
 * captures were selected by one of the game's own searches, recorded above `FIXTURES`: a search is falsifiable, and it
 * is the only thing that can state a negative, since nothing on the screen says a Pokémon is **not** lucky. The other
 * 57 arrived as a named file, so their provenance is the name plus what the screen renders — PGSharp appends a `✨` for
 * a shiny and a `🖼` for a background, the game draws `LUCKY POKÉMON` under the nickname in green, and a shadow or a
 * purified Pokémon wears its own treatment. That is weaker, and it is why `background`, `costume`, `lucky`, `purified`,
 * `shadow` and `shiny` default to absent: a row claims one only where the capture shows it.
 *
 * **Three captures are not detail screens at all and so cannot be rows.** They are the negative cases, in `NEGATIVE`
 * below, and they assert what the readers answer on a screen none of them was written for. `overworld.png` is the map:
 * no name, no HP, no types, no overlay. `no-pgsharp.png` and `pgsharp-no-overlay.png` are one Squirtle captured twice,
 * once with PGSharp not running and once with its toolbar up and no overlay drawn — which makes them a control on each
 * other, since the same screen reads `CP 330` on one and `CP 390` on the other.
 *
 * **Every reader that disagrees with a screen is pinned here rather than fixed here**, a fix being a change to what the
 * code does and so a pull request of its own. There are seven kinds across the corpus:
 *
 * - **`findOverlay` answers nothing on three screens that plainly carry an overlay** — `cherrim-overcast.png`,
 *   `deerling-autumn.png` and `meloetta-aria.png` — where on `basculin-blue.png`, `snorlax-purified.png` and
 *   `thundurus-shadow.png` it is right and PGSharp really drew none. A row says which by carrying `overlay: null` for
 *   the second kind and `defects.box: null` for the first, so the two absences cannot be confused.
 * - **`readOverlay` reads nothing out of a box `findOverlay` did find, on fourteen.** That is the costliest defect in
 *   the corpus: with no level and no IVs, `identify` stops at the species and the CP goes unchecked. The test below for
 *   `spinda-04.png` and the one for `xurkitree.png` each state what one such overlay was worth.
 * - **`typesOf` reads `[]` for both single-`Poison` Nidoran**, which are the only two captures in the corpus with no
 *   type read at all. `identify` then has nothing to narrow by, which is most of why `nidoran-male.png` is answered as
 *   a `Nidoran♀`.
 * - **`isFavourite` answers `true` for `spinda-04.png`, whose star is a white outline.** `FAVOURITE_GOLD` is 2% of the
 *   star corner and that capture's warm bokeh background puts **15.34%** there, against 18.18–26.49% for the nine real
 *   favourites — far enough above 2% that the constant is discriminating rather than the headroom `CLAUDE.md` calls it,
 *   and close enough to the real ones that no threshold separates the two by much. Three further captures land non-zero
 *   and below it and are correctly not favourites: `pikachu-willows-assistant.png` at 1.34%, `growlithe-nickname.png`
 *   at 0.48% and `castform-normal.png` at 0.36%. Those three are what make this corpus catch a mutation replacing the
 *   fraction with "any gold at all", which no capture of the original eight could.
 * - **`tagsOn` misses `snorlax-purified.png`'s one `Perfect` chip**, which is the only tagged capture besides
 *   `ho-oh.png` and reads `[]`.
 * - **The name reader walks past three nicknames** — `96%` on both `ho-oh.png` and `genesect-normal.png`, and
 *   `Nickname` is read correctly where the first two are not. A nickname carrying no run of three letters sends it on
 *   to the last line above the HP that does, which is PGSharp's own overlay: `aals15` and `ee JEN`.
 * - **PGSharp's two punctuation Unown suffixes are letters past Z, so neither can ever match its form.** At 4×
 *   magnification `unown-exclamation.png` draws `([)` and `unown-question.png` draws `(\)`, which is PGSharp indexing
 *   the alphabet from `A` for the game's 27th and 28th Unown: `'A'.charCodeAt(0) + 26` is `[` and `+ 27` is `\`, where
 *   the game master names those forms `Exclamation Point` and `Question Mark`. `identify` matches a suffix against a
 *   form name exactly, so the best either can do is be ignored — and `unown-question.png` does worse than that, its
 *   `\` reading as an `X`, which is a **real** Unown form, so the answer comes back confidently wrong.
 *
 * One reader is not asserted at all: **`parseMoves`**, because these are top-of-screen captures and the moves are below
 * the fold on every one. What would make even a negative control over it mean anything is the full 328-move list, which
 * is the one part of the game master that cannot be cut down.
 */

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
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
 * `form`, `costume`, `types` and the three base stats and never a pool — so transcribing the pools would be a thousand
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
 *
 * The real table interleaves them, `A, B, C, D, E, Exclamation Point, F, …, Q, Question Mark, R, …, Z`, and that
 * difference cannot matter: the fold keeps one of 28 identical forms and then sorts by the length of the form name, so
 * a one-character letter wins under either ordering, and the suffix filter PGSharp's bracket feeds is an exact match
 * rather than a search.
 */
const UNOWN: Form[] = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'Exclamation Point', 'Question Mark'].map((name) =>
  form(201, 'Unown', ['Psychic'], [136, 91, 134], name),
);

/**
 * Spinda's 20, which are Unown's situation exactly: every one `116/116/155` `Normal`, and named `00` to `19` in the
 * real table's own order, so the fold leaves `00` standing and only PGSharp's bracket can say which it is.
 */
const SPINDA: Form[] = Array.from({ length: 20 }, (_, n) =>
  form(327, 'Spinda', ['Normal'], [116, 116, 155], String(n).padStart(2, '0')),
);

/**
 * Every form the 61 detail screens can reach, in the dex order the real game master hands them over in — which is load
 * bearing twice over. `identify` reports the alternatives it did not choose and their order follows the table's, and
 * where several forms tie on the length of their name the table's order is what breaks the tie: `ho-oh.png`'s five-way
 * list comes back `Charizard, Moltres, Ho-Oh, Talonflame, Oricorio (Baile)` because four of the five are base forms
 * with a zero-length name.
 *
 * What makes a 122-form table legitimate where the real one holds 1,449 is that `identify` narrows before it chooses:
 * by species where the name matched one, and by type and HP where it did not, so a form outside the set those filters
 * admit cannot change an answer. This is the closure of exactly that — every form reachable from some capture — and it
 * is measured rather than reasoned about: this table and a real `loadGameData('.cache/inventory')` carrying 1,449 forms
 * over 1,024 species answer `identify` identically on all 64 captures, field for field — form, CP, levels, nickname,
 * alternatives and notes — including `genesect-normal.png`'s five alternatives and all three of its notes,
 * `ho-oh.png`'s wrong answer, and `overworld.png`, which both decline. `closest` agrees on the species too, over a list
 * of 41 names against 1,024: null for each of `ate`, `ee JEN`, `aals15` and `Nickname`, and `Nidoran♀` for `Nidorano`.
 *
 * Two entries are here for reasons nothing in the list shows. `Nidoran♂` is unreachable by the closure, because
 * `nidoran-male.png`'s name OCRs as `Nidorano` and `closest` matches that to `Nidoran♀` — so it is added by hand, or
 * the table could not be compared against the real one at all. And the three costume forms, two `Copy 2019` and
 * `Ho-Oh (S)`, fold away provably: `identify` sorts non-costumes first and keeps one form per `(dex, stats, types)`.
 * They are kept because the closure holds them and dropping them would be an unmeasured simplification.
 */
const FORMS: Form[] = [
  form(6, 'Charizard', ['Fire', 'Flying'], [223, 173, 186], 'Copy 2019'),
  form(6, 'Charizard', ['Fire', 'Flying'], [223, 173, 186]),
  form(7, 'Squirtle', ['Water'], [94, 121, 127]),
  form(25, 'Pikachu', ['Electric'], [112, 96, 111], 'Copy 2019'),
  form(25, 'Pikachu', ['Electric'], [112, 96, 111]),
  form(29, 'Nidoran♀', ['Poison'], [86, 89, 146]),
  form(32, 'Nidoran♂', ['Poison'], [105, 76, 130]),
  form(52, 'Meowth', ['Dark'], [99, 78, 120], 'Alola'),
  form(52, 'Meowth', ['Steel'], [115, 92, 137], 'Galarian'),
  form(52, 'Meowth', ['Normal'], [92, 78, 120]),
  form(58, 'Growlithe', ['Fire', 'Rock'], [142, 92, 155], 'Hisuian'),
  form(58, 'Growlithe', ['Fire'], [136, 93, 146]),
  form(113, 'Chansey', ['Normal'], [60, 128, 487]),
  form(133, 'Eevee', ['Normal'], [104, 114, 146]),
  form(143, 'Snorlax', ['Normal'], [190, 169, 330]),
  form(144, 'Articuno', ['Psychic', 'Flying'], [250, 197, 207], 'Galarian'),
  form(144, 'Articuno', ['Ice', 'Flying'], [192, 236, 207]),
  form(146, 'Moltres', ['Fire', 'Flying'], [251, 181, 207]),
  ...UNOWN,
  form(205, 'Forretress', ['Bug', 'Steel'], [161, 205, 181]),
  form(212, 'Scizor', ['Bug', 'Steel'], [236, 181, 172]),
  form(219, 'Magcargo', ['Fire', 'Rock'], [139, 191, 137]),
  form(250, 'Ho-Oh', ['Fire', 'Flying'], [239, 244, 214]),
  form(250, 'Ho-Oh', ['Fire', 'Flying'], [239, 244, 214], 'S'),
  form(325, 'Spoink', ['Psychic'], [125, 122, 155]),
  ...SPINDA,
  form(351, 'Castform', ['Normal'], [139, 139, 172]),
  form(351, 'Castform', ['Water'], [139, 139, 172], 'Rainy'),
  form(351, 'Castform', ['Ice'], [139, 139, 172], 'Snowy'),
  form(351, 'Castform', ['Fire'], [139, 139, 172], 'Sunny'),
  form(386, 'Deoxys', ['Psychic'], [414, 46, 137], 'Attack'),
  form(386, 'Deoxys', ['Psychic'], [144, 330, 137], 'Defense'),
  form(386, 'Deoxys', ['Psychic'], [345, 115, 137]),
  form(386, 'Deoxys', ['Psychic'], [230, 218, 137], 'Speed'),
  form(412, 'Burmy', ['Bug'], [53, 83, 120], 'Plant'),
  form(412, 'Burmy', ['Bug'], [53, 83, 120], 'Sandy'),
  form(412, 'Burmy', ['Bug'], [53, 83, 120], 'Trash'),
  form(413, 'Wormadam', ['Bug', 'Steel'], [127, 175, 155], 'Trash'),
  form(421, 'Cherrim', ['Grass'], [170, 153, 172], 'Overcast'),
  form(421, 'Cherrim', ['Grass'], [170, 153, 172], 'Sunny'),
  form(422, 'Shellos', ['Water'], [103, 105, 183], 'East Sea'),
  form(422, 'Shellos', ['Water'], [103, 105, 183], 'West Sea'),
  form(479, 'Rotom', ['Electric', 'Flying'], [204, 219, 137], 'Fan'),
  form(479, 'Rotom', ['Electric', 'Ice'], [204, 219, 137], 'Frost'),
  form(479, 'Rotom', ['Electric', 'Fire'], [204, 219, 137], 'Heat'),
  form(479, 'Rotom', ['Electric', 'Grass'], [204, 219, 137], 'Mow'),
  form(479, 'Rotom', ['Electric', 'Ghost'], [185, 159, 137]),
  form(479, 'Rotom', ['Electric', 'Water'], [204, 219, 137], 'Wash'),
  form(483, 'Dialga', ['Steel', 'Dragon'], [275, 211, 205]),
  form(483, 'Dialga', ['Steel', 'Dragon'], [270, 225, 205], 'Origin'),
  form(550, 'Basculin', ['Water'], [189, 129, 172], 'Blue Striped'),
  form(550, 'Basculin', ['Water'], [189, 129, 172], 'Red Striped'),
  form(550, 'Basculin', ['Water'], [189, 129, 172], 'White Striped'),
  form(585, 'Deerling', ['Normal', 'Grass'], [115, 100, 155], 'Autumn'),
  form(585, 'Deerling', ['Normal', 'Grass'], [115, 100, 155], 'Spring'),
  form(585, 'Deerling', ['Normal', 'Grass'], [115, 100, 155], 'Summer'),
  form(585, 'Deerling', ['Normal', 'Grass'], [115, 100, 155], 'Winter'),
  form(589, 'Escavalier', ['Bug', 'Steel'], [223, 187, 172]),
  form(632, 'Durant', ['Bug', 'Steel'], [217, 188, 151]),
  form(642, 'Thundurus', ['Electric', 'Flying'], [266, 164, 188], 'Incarnate'),
  form(642, 'Thundurus', ['Electric', 'Flying'], [295, 161, 188], 'Therian'),
  form(647, 'Keldeo', ['Water', 'Fighting'], [260, 192, 209], 'Ordinary'),
  form(647, 'Keldeo', ['Water', 'Fighting'], [260, 192, 209], 'Resolute'),
  form(648, 'Meloetta', ['Normal', 'Psychic'], [250, 225, 225], 'Aria'),
  form(648, 'Meloetta', ['Normal', 'Fighting'], [269, 188, 225], 'Pirouette'),
  form(649, 'Genesect', ['Bug', 'Steel'], [252, 199, 174], 'Burn'),
  form(649, 'Genesect', ['Bug', 'Steel'], [252, 199, 174], 'Chill'),
  form(649, 'Genesect', ['Bug', 'Steel'], [252, 199, 174], 'Douse'),
  form(649, 'Genesect', ['Bug', 'Steel'], [252, 199, 174]),
  form(649, 'Genesect', ['Bug', 'Steel'], [252, 199, 174], 'Shock'),
  form(663, 'Talonflame', ['Fire', 'Flying'], [176, 155, 186]),
  form(741, 'Oricorio', ['Fire', 'Flying'], [196, 145, 181], 'Baile'),
  form(796, 'Xurkitree', ['Electric'], [330, 144, 195]),
  form(838, 'Carkol', ['Rock', 'Fire'], [114, 157, 190]),
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
  height?: number;
  /** Null where `readOverlay` reads nothing out of a box `findOverlay` did find. */
  iv?: null;
  /** The name under the artwork, which is the nickname where one is set and so carries no species to fall back on. */
  name?: string;
  /** The bracketed form `readOverlay` reads, where it is not the one PGSharp drew. */
  suffix?: string | null;
  tags?: string[];
  types?: string[];
  /** The whole label `identify` answers, where it is not this Pokémon's own. */
  label?: string;
  nickname?: string;
  /** Every level `identify` still admits, where the row states the one the Pokémon is actually at. */
  levels?: number[];
  cp?: number;
  alternatives?: string[];
  /** The notes beyond the `could also be …` one, which is derived from `alternatives` rather than written out. */
  notes?: string[];
}

/**
 * One Pokémon, as the game and the capture state it. Nothing here is a reader's answer: the readers are what these are
 * asserted against, and where one disagrees that goes in `defects` rather than softening a field.
 *
 * Ten of the attributes are optional and default to absent — no background, no costume, not a favourite, not lucky, not
 * purified, not shadow, not shiny, no size pill, no chips, and a `name` that is the species. Absence is a claim and not
 * a gap: it says the screen shows none of those, which for the 54 rows with no search behind them is what looking at
 * the screen can state. The alternative is all 21 fields written out on every one of the 61 rows, which nobody reads.
 */
interface Fixture {
  /** The scene behind the artwork, or absent for the game's own plain sky. Described, the game showing no label. */
  background?: string;
  /** What the artwork wears, or absent for nothing. Described rather than named, the game showing no label either. */
  costume?: string;
  /** The CP above the artwork, which `cpOf` must derive and OCR reads on 20 of the 61. */
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
 * | `spoink.png`     | `xxl&male&!lucky&!shiny&!costume&!background&!shadow&!purified`                       |
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
    cp: 393,
    file: 'basculin-red.png',
    form: 'Red Striped',
    gender: 'male',
    height: 0.96,
    hp: 63,
    overlay: { iv: { attack: 15, defense: 9, stamina: 9 }, level: 7 },
    species: 'Basculin',
    types: ['Water'],
    weight: 17.01,
  },
  {
    cp: 1173,
    favourite: true,
    file: 'basculin-white.png',
    form: 'White Striped',
    gender: 'female',
    height: 0.78,
    hp: 111,
    overlay: { iv: { attack: 14, defense: 12, stamina: 14 }, level: 20 },
    species: 'Basculin',
    types: ['Water'],
    weight: 11.18,
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
    cp: 478,
    file: 'deerling-autumn.png',
    form: 'Autumn',
    gender: 'male',
    height: 0.65,
    hp: 86,
    overlay: { iv: { attack: 14, defense: 15, stamina: 12 }, level: 15 },
    species: 'Deerling',
    types: ['Normal', 'Grass'],
    weight: 20.65,
  },
  {
    cp: 373,
    file: 'deerling-spring.png',
    form: 'Spring',
    gender: 'female',
    height: 0.72,
    hp: 76,
    overlay: { iv: { attack: 5, defense: 13, stamina: 4 }, level: 13 },
    species: 'Deerling',
    types: ['Normal', 'Grass'],
    weight: 30.26,
  },
  {
    cp: 436,
    favourite: true,
    file: 'deerling-summer.png',
    form: 'Summer',
    gender: 'female',
    height: 0.65,
    hp: 89,
    overlay: { iv: { attack: 3, defense: 0, stamina: 13 }, level: 16 },
    species: 'Deerling',
    types: ['Normal', 'Grass'],
    weight: 24.18,
  },
  {
    cp: 586,
    file: 'deerling-winter.png',
    form: 'Winter',
    gender: 'female',
    height: 0.56,
    hp: 102,
    overlay: { iv: { attack: 1, defense: 9, stamina: 12 }, level: 21 },
    species: 'Deerling',
    types: ['Normal', 'Grass'],
    weight: 22.7,
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
    cp: 1891,
    favourite: true,
    file: 'genesect-burn.png',
    form: 'Burn',
    gender: null,
    height: 1.49,
    hp: 112,
    overlay: { iv: { attack: 14, defense: 11, stamina: 15 }, level: 20 },
    species: 'Genesect',
    types: ['Bug', 'Steel'],
    weight: 83.22,
  },
  {
    cp: 1889,
    file: 'genesect-chill.png',
    form: 'Chill',
    gender: null,
    height: 1.7,
    hp: 112,
    overlay: { iv: { attack: 12, defense: 15, stamina: 14 }, level: 20 },
    species: 'Genesect',
    types: ['Bug', 'Steel'],
    weight: 74.93,
  },
  {
    cp: 1872,
    file: 'genesect-douse.png',
    form: 'Douse',
    gender: null,
    height: 1.47,
    hp: 112,
    overlay: { iv: { attack: 12, defense: 11, stamina: 14 }, level: 20 },
    species: 'Genesect',
    types: ['Bug', 'Steel'],
    weight: 84.82,
  },
  {
    cp: 1904,
    file: 'genesect-normal.png',
    form: null,
    gender: null,
    height: 1.51,
    hp: 112,
    name: '96%',
    overlay: { iv: { attack: 14, defense: 15, stamina: 14 }, level: 20 },
    species: 'Genesect',
    types: ['Bug', 'Steel'],
    weight: 84.64,
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
    cp: 1540,
    favourite: true,
    file: 'keldeo-resolute.png',
    form: 'Resolute',
    gender: null,
    height: 1.57,
    hp: 114,
    overlay: { iv: { attack: 11, defense: 11, stamina: 13 }, level: 15 },
    species: 'Keldeo',
    types: ['Water', 'Fighting'],
    weight: 63.43,
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
    cp: 200,
    file: 'nidoran-female.png',
    form: null,
    gender: 'female',
    height: 0.4,
    hp: 63,
    overlay: { iv: { attack: 12, defense: 14, stamina: 13 }, level: 9 },
    species: 'Nidoran♀',
    types: ['Poison'],
    weight: 7.31,
  },
  {
    cp: 491,
    file: 'nidoran-male.png',
    form: null,
    gender: 'male',
    height: 0.5,
    hp: 86,
    overlay: { iv: { attack: 15, defense: 15, stamina: 15 }, level: 20 },
    species: 'Nidoran♂',
    types: ['Poison'],
    weight: 9.12,
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
    cp: 784,
    file: 'shellos-east.png',
    form: 'East Sea',
    gender: 'male',
    height: 0.27,
    hp: 140,
    overlay: { iv: { attack: 3, defense: 0, stamina: 12 }, level: 29 },
    species: 'Shellos',
    types: ['Water'],
    weight: 5.81,
  },
  {
    cp: 628,
    file: 'shellos-west.png',
    form: 'West Sea',
    gender: 'female',
    height: 0.33,
    hp: 117,
    overlay: { iv: { attack: 13, defense: 12, stamina: 14 }, level: 20 },
    species: 'Shellos',
    types: ['Water'],
    weight: 7.09,
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
    cp: 1876,
    file: 'thundurus-shadow.png',
    form: 'Incarnate',
    gender: 'male',
    height: 2.14,
    hp: 117,
    overlay: null,
    shadow: true,
    size: 'XL',
    species: 'Thundurus',
    types: ['Electric', 'Flying'],
    weight: 123.7,
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
 * Everything the readers answer about one capture. Each attribute is then asserted as a subtest of it, so a failure
 * names the reader that broke where one `deepStrictEqual` over the lot says only that the object differs.
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
  const box = await findOverlay(image);

  return { image, lines, detail, box, overlay: box ? await readOverlay(image, box) : null };
};

const readings = new Map<string, ReturnType<typeof read>>();

const readingOf = (file: string) => {
  const reading = readings.get(file) ?? read(file);
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

  // What the Pokémon is, and what `identify` answers about it, which are the same string on 35 of the 61.
  const truth = fixture.form ? `${fixture.species} (${fixture.form})` : fixture.species;
  const answered = defects.label ?? truth;

  // The name the screen prints, which defaults to the species — so a row states a nickname once and both the reader's
  // expectation and `identify`'s derive from it.
  const name = fixture.name ?? fixture.species;

  const { boxed, legible, levels } = overlayOf(fixture);
  const alternatives = defects.alternatives ?? [];
  const notes = [
    ...(alternatives.length > 0 ? [`could also be ${alternatives.join(', ')}`] : []),
    ...(defects.notes ?? []),
  ];

  test(`${fixture.file} reads as the ${truth} on the screen`, async (t) => {
    const { detail, box, overlay } = await readingOf(fixture.file);

    await t.test('size', () => assert.strictEqual(detail.size, fixture.size ?? null));
    await t.test('gender', () => assert.strictEqual(detail.gender, fixture.gender));
    await t.test('hp', () => assert.strictEqual(detail.hp, fixture.hp));
    await t.test('name', () => assert.strictEqual(detail.name, defects.name ?? name));
    await t.test('weight', () => assert.strictEqual(detail.weight, fixture.weight));
    await t.test('height', () => assert.strictEqual(detail.height, defects.height ?? fixture.height));
    await t.test('types', () => assert.deepStrictEqual(detail.types, defects.types ?? fixture.types));

    await t.test('favourite', () =>
      assert.strictEqual(detail.favourite, defects.favourite ?? fixture.favourite ?? false),
    );

    await t.test('tags', () =>
      assert.deepStrictEqual(
        detail.tags.map((chip) => closest(chip, TAGS, (tag) => tag, TAG_SLACK)),
        defects.tags ?? fixture.tags ?? [],
      ),
    );

    // Whether a box was found is asserted apart from what was read out of it, because the two are different defects and
    // a reader fixed at either stage has to fail here. Nine captures carry no overlay at all, and on three of those
    // nine PGSharp really drew one.
    await t.test('overlay found', () => assert.strictEqual(box !== null, boxed));
    await t.test('overlay ivs', () => assert.deepStrictEqual(overlay?.iv ?? null, legible?.iv ?? null));

    await t.test('overlay form', () =>
      assert.strictEqual(overlay?.form ?? null, ('suffix' in defects ? defects.suffix : legible?.suffix) ?? null),
    );

    // The end of the pipeline, run on every capture rather than on one, which is what catches `levelsOf` admitting any
    // HP at or above the one read: against a shortlist whose largest member is already the true level, as
    // `fixtures/unown.png`'s `[1, 6, 16]` is, that break cannot move an answer.
    const identity = identify(DATA, detail, overlay);

    await t.test('identify form', () => assert.strictEqual(identity.form && label(identity.form), answered));
    await t.test('identify levels', () => assert.deepStrictEqual(identity.levels, levels));
    await t.test('identify alternatives', () => assert.deepStrictEqual(identity.alternatives.map(label), alternatives));
    await t.test('identify notes', () => assert.deepStrictEqual(identity.notes, notes));

    // The cross-check the whole orientation of this table exists for, and the reason a settled level is derived rather
    // than stated: `cpOf` cannot answer without one, so a capture whose overlay goes unread and a capture whose HP two
    // half-levels both fit are both a null here, and neither needs a `defects` entry to say so.
    await t.test('identify cp', () =>
      assert.strictEqual(identity.cp, defects.cp ?? (levels.length === 1 ? fixture.cp : null)),
    );

    await t.test('identify nickname', () =>
      assert.strictEqual(identity.nickname, defects.nickname ?? (name === fixture.species ? null : name)),
    );
  });
}

/**
 * The three captures that are not detail screens, which is why they are not rows: there is no Pokémon on them to state.
 * They are asserted below instead, as what the readers answer on a screen none of them was written for.
 */
const NEGATIVE = ['no-pgsharp.png', 'overworld.png', 'pgsharp-no-overlay.png'];

/**
 * That every committed capture is accounted for, which is the one thing about this corpus no row can say. A PNG added
 * to `fixtures/` and left out of `FIXTURES` costs nothing and reports nothing — the suite goes on passing at whatever
 * size it was, and the capture sits in the tree looking exactly like a capture that is pinned. So the directory is the
 * authority and the table is checked against it, in both directions: a row naming a file that is gone fails here too,
 * where otherwise it would fail as an unreadable file in the middle of an unrelated reader's subtest.
 */
test('every committed capture is either a row or a negative case', () => {
  const committed = readdirSync(new URL('fixtures', import.meta.url))
    .filter((file) => file.endsWith('.png'))
    .sort();

  assert.deepStrictEqual(committed, [...FIXTURES.map((f) => f.file), ...NEGATIVE].sort());
});

/**
 * Every figure this file's own docblock quotes about the shape of the corpus, in one place that fails when one of them
 * stops being true. The case for it is not that a count is interesting: it is that the docblock claimed the CP
 * cross-check lands on **39** of the 61 for as long as nobody measured it, where it is 32, and nothing in a green suite
 * could have said so. Prose is the one part of a test file that no test reads.
 *
 * So each key is a sentence in the docblock above, and changing the corpus is meant to fail here and send you back to
 * that paragraph. Counted off `FIXTURES` and `overlayOf`, so this is free and cannot disagree with the loop.
 */
const COVERAGE = {
  rows: 61,
  answeredAsThemselves: 35,
  oneLevel: 40,
  crossCheckAgrees: 32,
  crossCheckDisagrees: 8,
  severalLevels: 1,
  noLevel: 20,
  noDefects: 15,
  noOverlayDrawn: 3,
  boxNotFound: 3,
  overlayNotRead: 14,
};

test('the corpus is the shape the docblock says it is', () => {
  const settled = FIXTURES.filter((f) => overlayOf(f).levels.length === 1);

  assert.deepStrictEqual(
    {
      rows: FIXTURES.length,
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
    COVERAGE,
    'the docblock above quotes these figures; update both or neither',
  );

  // The three ways a row can account for its level have to partition the corpus, or one of the counts above is reaching
  // rows another has already claimed and the three could all be right while summing to the wrong thing.
  assert.strictEqual(COVERAGE.oneLevel + COVERAGE.severalLevels + COVERAGE.noLevel, COVERAGE.rows);
  assert.strictEqual(COVERAGE.crossCheckAgrees + COVERAGE.crossCheckDisagrees, COVERAGE.oneLevel);
});

/**
 * Which captures the CP is read off, and what it is read as — the one thing the rows cannot say, since each of them
 * states the number the game printed and a `cpOn` answering null for everything would pass all 61. It is 20 of the 61
 * because the CP is white text over the artwork and the hardest thing on the screen to make out.
 *
 * Asserted as the whole map rather than as a count, so a reader losing one capture and gaining another cannot come out
 * even, and the four misreads are then **derived** from it rather than transcribed a second time: a row already states
 * what the screen shows, so the disagreement is a filter and not a list to keep in step. Three of the four are an order
 * of magnitude out, the leading digit having been lost to the artwork behind it, and `unown-b.png` loses two.
 */
test('the CP is read off 20 of the 61 captures, four of them wrongly', async () => {
  const states = new Map<string, number>();

  for (const fixture of FIXTURES) {
    const { detail } = await readingOf(fixture.file);

    if (detail.cp !== null) {
      states.set(fixture.file, detail.cp);
    }
  }

  assert.deepStrictEqual(
    Object.fromEntries(states),
    {
      'basculin-red.png': 393,
      'burmy-plant.png': 206,
      'burmy-sandy.png': 196,
      'castform-snowy.png': 46,
      'castform-sunny.png': 979,
      'charizard-gigantamax.png': 1605,
      'cherrim-sunshine.png': 1658,
      'deoxys-defense.png': 15,
      'dialga-altered.png': 2848,
      'genesect-douse.png': 1872,
      'genesect-normal.png': 1904,
      'meowth-alola.png': 446,
      'nidoran-female.png': 200,
      'pikachu-witch-hat.png': 625,
      'shellos-east.png': 84,
      'unown-b.png': 48,
      'unown-m-shiny.png': 839,
      'unown-question.png': 486,
      'unown.png': 499,
      'xurkitree.png': 2197,
    },
    'which captures state a CP, or what they state, has changed',
  );

  assert.deepStrictEqual(
    FIXTURES.filter((f) => states.has(f.file) && states.get(f.file) !== f.cp).map((f) => f.file),
    ['castform-snowy.png', 'deoxys-defense.png', 'shellos-east.png', 'unown-b.png'],
    'which captures misread the CP has changed',
  );
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
  assert.ok(fixture?.overlay, 'the capture whose overlay goes unread has left the corpus');

  const { overlay } = fixture;
  const { detail } = await readingOf(fixture.file);
  const identity = identify(DATA, detail, { levels: [overlay.level], iv: overlay.iv, form: null });

  assert.strictEqual(detail.cp, fixture.cp, 'the capture has lost the CP this is cross-checked against');
  assert.deepStrictEqual(identity.levels, [overlay.level], 'the HP no longer agrees with the level the overlay states');
  assert.strictEqual(identity.cp, detail.cp);
  assert.deepStrictEqual(identity.notes, [], 'the readers disagree with each other');
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

  assert.strictEqual(blind.form && label(blind.form), 'Spinda (00)');
  assert.deepStrictEqual(blind.alternatives, [], 'the fold no longer collapses the 20, so this test is obsolete');
  assert.strictEqual(named.form && label(named.form), `Spinda (${overlay.suffix})`);
  assert.strictEqual(named.cp, fixture.cp, 'the CP the bracket buys no longer agrees with the screen');
  assert.deepStrictEqual(named.notes, [], 'the readers disagree with each other');
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

  const offered = FIXTURES.filter((f) => f.overlay !== null && stated.get(f.file)?.length);
  assert.strictEqual(offered.length, 40, 'how many overlays are read has changed, so these two properties say less');
  assert.ok(
    offered.some((f) => stated.get(f.file)?.some((level) => level > (f.overlay?.level ?? 0))),
    'no shortlist offers a level above the true one, so nothing can catch an HP test that is not exact',
  );
  assert.ok(
    offered.some((f) => !stated.get(f.file)?.includes(f.overlay?.level ?? 0)),
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
 * `fixtures/overworld.png` is the map, and this is what the detail readers answer on it: nothing, in every field. That
 * is the half a corpus of valid screens cannot state — 61 rows all assert that a reader found the right thing and not
 * one of them asserts that a reader declines to find a thing that is not there, so a `hpOn` returning a constant would
 * pass every row it appears in. Written as one `deepStrictEqual` over the whole `Detail` rather than ten assertions,
 * because the claim is about the object and a field added to `Detail` should fail here until it is accounted for.
 *
 * `identify` declines it too, and for a reason worth knowing rather than by luck: with no name read there is no
 * species, so the first filter — `f.species === species` over a `species` of `null` — admits nothing, and the fallback
 * that searches every species is gated on an IV, an HP and a type the map has none of. So `fits` is never reached over
 * the whole table at all, and the answer is a property of the pipeline rather than of whichever form this table folds
 * first. Measured identical against a real `loadGameData('.cache/inventory')` of 1,449 forms, which is what says the
 * 122 here are not what makes it come out empty.
 */
test('overworld.png is the map, and every reader declines it', async () => {
  const { detail, box, overlay } = await readingOf('overworld.png');

  assert.strictEqual(box, null, 'a band of the map read as an overlay');
  assert.deepStrictEqual(
    { ...detail },
    {
      cp: null,
      favourite: false,
      gender: null,
      height: null,
      hp: null,
      name: null,
      size: null,
      tags: [],
      types: [],
      weight: null,
    },
  );

  const identity = identify(DATA, detail, overlay);

  assert.strictEqual(identity.form, null, 'a form was chosen for a screen with no Pokémon on it');
  assert.deepStrictEqual(identity.alternatives, []);
  assert.deepStrictEqual(identity.levels, []);
  assert.strictEqual(identity.cp, null);
  assert.strictEqual(identity.nickname, null);
  assert.deepStrictEqual(identity.notes, [], 'a screen with nothing on it is declined without comment');
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

  assert.deepStrictEqual({ ...bare.detail, cp: null }, { ...toolbar.detail, cp: null });
  assert.strictEqual(bare.detail.cp, 330, 'the capture PGSharp is absent from no longer misreads its CP');
  assert.strictEqual(
    toolbar.detail.cp,
    390,
    'the capture with the toolbar up no longer reads the CP the screen prints',
  );

  for (const reading of [bare, toolbar]) {
    const identity = identify(DATA, reading.detail, reading.overlay);

    assert.strictEqual(reading.box, null, 'a band of a screen with no overlay on it read as one');
    assert.strictEqual(identity.form && label(identity.form), 'Squirtle');
    assert.deepStrictEqual(identity.levels, [], 'a level was settled on a screen that states none');
    assert.strictEqual(identity.cp, null);
    assert.deepStrictEqual(identity.notes, [], 'an absent overlay is the ordinary case and not worth a note');
  }
});

/**
 * The distinct values a column of the table holds, as words. Written out rather than left to `Array#sort`, which
 * stringifies an `undefined` and so files it after every capital letter — `['XL', 'XS', 'XXL', 'XXS', undefined]`,
 * which is the right set in an order nobody would write down on purpose.
 */
const distinct = (rows: readonly Fixture[], of: (row: Fixture) => unknown): string[] =>
  [...new Set(rows.map((row) => String(of(row))))].sort();

/**
 * That the corpus still reaches every attribute, which no amount of the assertions above can say. A reading the whole
 * corpus agrees on compares equal for ever and reads exactly like agreement: 59 of these captures carry no chip, so a
 * `tagsOn` that answered `[]` unconditionally would pass every row but two. Each of these pairs is therefore what makes
 * the corresponding assertion able to fail at all.
 *
 * The negative half of a flag is the one thing here that is not read off a screen. For the seven captures a search
 * selected it is the search's own `!lucky`, which is where a negative exists at all; for the rest it is the capture
 * showing no sign of the thing, which is weaker and is what the module docblock says about provenance. Either way it is
 * asserted off the fields rather than off the readings, those flags having no reader to disagree with.
 *
 * The `defects` keys are asserted the same way and for the same reason. Each is pinned by some capture, several by one
 * alone, so dropping that capture would take the pin with it and leave a reader free to change its answer unremarked.
 */
test('the corpus reaches both sides of every attribute', () => {
  for (const flag of ['favourite', 'lucky', 'purified', 'shadow', 'shiny'] as const) {
    assert.ok(
      FIXTURES.some((f) => f[flag]) && FIXTURES.some((f) => !f[flag]),
      `every capture is ${flag} or none is, so nothing separates the two`,
    );
  }

  for (const described of ['background', 'costume'] as const) {
    assert.ok(
      FIXTURES.some((f) => f[described] !== undefined) && FIXTURES.some((f) => f[described] === undefined),
      `every capture wears a ${described} or none does, so nothing separates the two`,
    );
  }

  assert.deepStrictEqual(
    distinct(FIXTURES, (f) => f.size),
    ['XL', 'XS', 'XXL', 'XXS', 'undefined'],
    'four bands and none',
  );
  assert.deepStrictEqual(
    distinct(FIXTURES, (f) => f.gender),
    ['female', 'male', 'null'],
  );
  assert.ok(
    FIXTURES.some((f) => f.form === '') && FIXTURES.some((f) => f.form !== ''),
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
  // conflate: PGSharp drew none on three captures and `findOverlay` missed one on three others.
  assert.ok(
    FIXTURES.some((f) => f.overlay === null) && FIXTURES.some((f) => f.defects && 'box' in f.defects),
    'one of the two ways a capture has no overlay box is gone, so nothing says the readers separate them',
  );

  // And both kinds of bracketed form, which is what says `identify` matches a suffix against a form name exactly: four
  // captures carry a suffix that names a form of their species and two carry one that names no form at all, those
  // being PGSharp's `[` and `\` for Unown's two punctuation forms.
  assert.ok(
    FIXTURES.some((f) => f.overlay?.suffix !== undefined && f.overlay.suffix === f.form) &&
      FIXTURES.some((f) => f.overlay?.suffix !== undefined && f.overlay.suffix !== f.form),
    'nothing separates a bracketed form that names one from a bracketed form that names nothing',
  );

  // A label naming a different **species**, which is what justifies `defects.label` over a `defects.species` beside the
  // row's own form: `nidoran-male.png` comes back as a `Nidoran♀` and `ho-oh.png` as a Charizard.
  assert.ok(
    FIXTURES.some((f) => f.defects?.label !== undefined && !f.defects.label.startsWith(f.species)),
    'every wrong answer is at least the right species, so nothing says a label is more than a form name',
  );

  // Every `Defects` key is pinned by some capture. The keys rather than the values, because three of the defects are
  // `null` — a box never found, a triple never read, a suffix that reads as nothing — and a truth test would file those
  // as absent. A key nothing pins is a reader free to change its answer unremarked, which is the same hazard an
  // unasserted field is and reads exactly the same way.
  const pinned = new Set(FIXTURES.flatMap((f) => Object.keys(f.defects ?? {})));

  for (const key of [
    'box',
    'favourite',
    'heightM',
    'iv',
    'name',
    'suffix',
    'tags',
    'types',
    'label',
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
});
