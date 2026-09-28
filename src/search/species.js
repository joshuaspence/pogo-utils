/**
 * The species the name box offers, and the pure half of taking one of them. Kept out of the page for the reason
 * query.js is: what accepting a suggestion does to the text in the box is worth being able to check without a DOM
 * around it.
 *
 * The list is the Pokédex rather than a list of its own — `pokedex.js` already names all 1025 species, and a second
 * copy here would be one more thing to keep in step with it. Only the released ones are offered, since a species the
 * game has not put out cannot be in the storage this string is going to be typed into.
 *
 * Forms and regional variants are left out. The game searches the name it shows for a species, and that name is the
 * species' — `pokemon_name_0019` is `Rattata` for the Alolan one as much as for the Kantonian — so `Alolan Rattata` is
 * a name nothing answers to, and the Regional forms chips are how a reader asks for that one.
 */

import POKEMON from '../pokemon/pokedex.js';

/**
 * The species whose name its constant cannot be spelled back out of. A constant drops the punctuation the games write a
 * name with or turns it into an underscore, and that underscore stands for something different every time: a space in
 * `IRON_HANDS`, a hyphen in `HO_OH`, a full stop and a space in `MR_MIME`, a colon and one in `TYPE_NULL`, and in
 * `NIDORAN_F` a symbol no keyboard has. `FARFETCHD` and `FLABEBE` lost a character outright. Nothing can derive those
 * back, so these eighteen are written out and every other name is derived from its constant.
 *
 * Each is the name the game itself displays, from PokeMiners' string table — `pokemon_name_0250` is `Ho-Oh` — checked
 * against pokemondb's GO Pokédex, which agrees on all eighteen except for writing that one `Ho-oh` in one of the two
 * attributes it carries the name in.
 *
 * An entry whose constant `pokedex.js` has since renamed leaves that species named the way its constant reads, which is
 * a name looking odd rather than a page that fails — worth knowing when one here looks wrong.
 */
const SPELLINGS = {
  NIDORAN_F: 'Nidoran♀',
  NIDORAN_M: 'Nidoran♂',
  FARFETCHD: "Farfetch'd",
  MR_MIME: 'Mr. Mime',
  HO_OH: 'Ho-Oh',
  MIME_JR: 'Mime Jr.',
  PORYGON_Z: 'Porygon-Z',
  FLABEBE: 'Flabébé',
  TYPE_NULL: 'Type: Null',
  JANGMO_O: 'Jangmo-o',
  HAKAMO_O: 'Hakamo-o',
  KOMMO_O: 'Kommo-o',
  SIRFETCHD: "Sirfetch'd",
  MR_RIME: 'Mr. Rime',
  WO_CHIEN: 'Wo-Chien',
  CHIEN_PAO: 'Chien-Pao',
  TING_LU: 'Ting-Lu',
  CHI_YU: 'Chi-Yu',
};

/** A constant as its name reads, right for every species SPELLINGS does not speak for: `IRON_HANDS` is `Iron Hands`. */
const titleise = (constant) =>
  constant
    .toLowerCase()
    .split('_')
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');

/**
 * A name folded to what a reader will actually type: lower case, and with the accents taken off, so `flabebe` finds
 * Flabébé from a keyboard that cannot easily write it.
 */
const fold = (name) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

/**
 * Every species that can be in your boxes, in dex order — so the suggestions for `char` read as a family rather than
 * alphabetically, which would put Charizard ahead of Charmander. The folded form is kept beside the name because it is
 * what every keystroke is compared against.
 */
const SPECIES = Object.entries(POKEMON)
  .filter(([, species]) => species.released)
  .map(([constant]) => SPELLINGS[constant] ?? titleise(constant))
  .map((name) => ({ name, folded: fold(name) }));

/** How many are offered at once. The list is a shortcut past spelling a name, not a way to read the dex. */
const LIMIT = 8;

/** Shorter than this names too much of the dex for eight rows to say anything useful about it. */
const SHORTEST = 2;

/**
 * The span of the box the caret's own name occupies. Commas separate names here — `pikachu, eevee` asks for either — so
 * a suggestion completes the one being typed and leaves whatever is on the other side of a comma alone.
 */
function fragment(value, caret) {
  const start = value.slice(0, caret).lastIndexOf(',') + 1;
  const after = value.indexOf(',', caret);

  return { start, end: after === -1 ? value.length : after };
}

/**
 * The species matching what is being typed, prefixes first: `char` offers Charmander before Hitmonchan, since a reader
 * typing the start of a name almost always means the start of a name. Each of the two groups keeps its dex order.
 */
export function suggestions(value, caret) {
  const { start, end } = fragment(value, caret);
  const needle = fold(value.slice(start, end).trim());

  if (needle.length < SHORTEST) {
    return [];
  }

  const starting = [];
  const containing = [];

  for (const { name, folded } of SPECIES) {
    const at = folded.indexOf(needle);

    if (at === 0) {
      starting.push(name);
    } else if (at > 0) {
      containing.push(name);
    }
  }

  return [...starting, ...containing].slice(0, LIMIT);
}

/**
 * The box with one suggestion taken, and where the caret belongs afterwards. Only the name being typed is replaced, so
 * accepting one in the middle of `pikachu, chariz, eevee` leaves both neighbours as they were. The space after a comma
 * is the reader's and is kept — query.js trims it back out of the string.
 *
 * The name is written in lower case, matching the placeholder and every term the chips write. The game does not care,
 * and a string that is lower case throughout reads as one thing rather than as two pasted together.
 */
export function withName(value, caret, name) {
  const { start, end } = fragment(value, caret);
  const lead = value.slice(start, end).match(/^\s*/)[0];
  const head = value.slice(0, start) + lead + name.toLowerCase();

  return { value: head + value.slice(end), caret: head.length };
}
