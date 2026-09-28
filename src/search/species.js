/**
 * The species the name box offers, and what a row of them writes. Kept out of the page for the reason query.js is: what
 * a row means is worth being able to check without a DOM around it.
 *
 * The list is the Pokédex rather than a list of its own — `pokedex.js` already names all 1025 species, and a second
 * copy here would be one more thing to keep in step with it. Only the released ones are offered, since a species the
 * game has not put out cannot be in the storage this string is going to be typed into.
 *
 * Forms and regional variants are left out. The game searches the name it shows for a species, and that name is the
 * species' — `pokemon_name_0019` is `Rattata` for the Alolan one as much as for the Kantonian — so `Alolan Rattata` is
 * a name nothing answers to, and the Regional forms chips are how a reader asks for that one.
 *
 * A family is written rather than expanded. Both sources that document the marker agree on what it does — the wiki has
 * "Pokémon that belong to a particular family can be filtered by searching a species name and placing a plus sign ( + )
 * before it", GO Hub has "Using a “+” before a Pokémon species name will return the entire family of that species in
 * your storage", and both give `+bulbasaur` as the example — so `+charmander` is handed to the game as it stands. Which
 * three species that is cannot be worked out here: `pokedex.js` carries forms, regions and rarity but no evolution
 * links. The game knows, and the wiki has it answering from any member of a family and even from one you do not own.
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

/**
 * How many rows are offered at once. The list is a shortcut past spelling a name, not a way to read the dex. A family
 * takes a row of its own, so eight rows is four species — which is the cost of a family being a row rather than a mode.
 */
const LIMIT = 8;

/** Shorter than this names too much of the dex for eight rows to say anything useful about it. */
const SHORTEST = 2;

/** The game's mark for a species and the rest of its evolutionary line, written in front of the name. */
const FAMILY = '+';

/**
 * What the list offers for the name being typed, as the species each row names and whether that row is its family. The
 * box holds one name at a time — the ones already chosen are chips beside it and carry no caret — so there is nothing
 * to scope this to but the value.
 *
 * Prefixes first: `char` offers Charmander before Hitmonchan, since a reader typing the start of a name almost always
 * means the start of a name. Each of the two groups keeps its dex order.
 *
 * A family is a row of its own rather than a mode over the list, because a species and its family are two different
 * searches and which of them a row writes should be settled by taking that row and by nothing else. It sits directly
 * beside the species it came from, so one `↓` from a species reaches its family.
 *
 * Every match gets a family row, and three of them can be the same search: `+charmander`, `+charmeleon` and
 * `+charizard` all return those three Pokémon. Collapsing them would need to know which species share a family, and
 * nothing here does, so the redundancy is the honest answer rather than a guess at which row to keep.
 *
 * The marker is not part of the name, so `+charm` offers what `charm` offers — as families alone, since a reader who
 * has typed the marker has already said which of the two they mean. Without that they would be the one reader the list
 * refuses to help.
 */
export function suggestions(value) {
  const typed = value.trim();
  const family = typed.startsWith(FAMILY);
  const needle = fold(family ? typed.slice(FAMILY.length) : typed);

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

  const matched = [...starting, ...containing];

  const offers = family
    ? matched.map((name) => ({ name, family: true }))
    : matched.flatMap((name) => [
        { name, family: false },
        { name, family: true },
      ]);

  return offers.slice(0, LIMIT);
}

/**
 * A row as the search writes it. The offer is the whole of the answer — nothing about what was typed reaches this, not
 * even a marker the reader put there themselves, which is the whole of why a family is a row rather than a mode: what a
 * row writes is decided by taking it, and there is nothing else left to have changed it.
 *
 * Written in lower case, matching the placeholder and every term the chips write. The game does not care, and a string
 * that is lower case throughout reads as one thing rather than as two pasted together.
 */
export const written = (offer) => (offer.family ? FAMILY : '') + offer.name.toLowerCase();
