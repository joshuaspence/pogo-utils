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
 * The span of the box the caret's own name occupies. Commas separate names here — `pikachu, eevee` asks for either — so
 * a suggestion completes the one being typed and leaves whatever is on the other side of a comma alone.
 */
function fragment(value, caret) {
  const start = value.slice(0, caret).lastIndexOf(',') + 1;
  const after = value.indexOf(',', caret);

  return { start, end: after === -1 ? value.length : after };
}

/**
 * The caret's own name taken apart: where it sits in the box, the space in front of it that is the reader's, whether it
 * asks for a family, and the name itself with the marker off. Everything below writes the name back out of these, so a
 * `+` cannot be honoured by one path and dropped by another.
 */
function parts(value, caret) {
  const { start, end } = fragment(value, caret);
  const typed = value.slice(start, end);
  const lead = typed.match(/^\s*/)[0];
  const family = typed.slice(lead.length).startsWith(FAMILY);

  return { start, end, lead, family, name: typed.slice(lead.length + (family ? FAMILY.length : 0)) };
}

/**
 * What the list offers for what is being typed, as the species each row names and whether that row is its family.
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
export function suggestions(value, caret) {
  const { family, name: typed } = parts(value, caret);
  const needle = fold(typed.trim());

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
 * The box with one offer taken, and where the caret belongs afterwards. Only the name being typed is replaced, so
 * taking one in the middle of `pikachu, chariz, eevee` leaves both neighbours as they were. The space after a comma is
 * the reader's and is kept — query.js trims it back out of the string.
 *
 * A name taken at the end of the box is followed by the comma and the space for the next one, so choosing several
 * species is typing and taking names rather than punctuating between them. One taken in the middle already has both.
 * query.js drops the empty name a trailing comma leaves, so the box is never in a state that writes a broken string.
 *
 * The offer alone says whether a family is written, including over a marker the reader typed — which is the whole of
 * why a family is a row: what a row writes is decided by taking it, and there is nothing else left to have changed it.
 *
 * The name is written in lower case, matching the placeholder and every term the chips write. The game does not care,
 * and a string that is lower case throughout reads as one thing rather than as two pasted together.
 */
export function withName(value, caret, offer) {
  const place = parts(value, caret);
  const written = (offer.family ? FAMILY : '') + offer.name.toLowerCase();
  const next = place.end === value.length ? ', ' : '';
  const head = value.slice(0, place.start) + place.lead + written + next;

  return { value: head + value.slice(place.end), caret: head.length };
}
