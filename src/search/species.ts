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

import { fold, nameOf } from '../pokemon/names.js';
import POKEMON from '../pokemon/pokedex.js';

/**
 * Every species that can be in your boxes, in dex order — so the suggestions for `char` read as a family rather than
 * alphabetically, which would put Charizard ahead of Charmander. The folded form is kept beside the name because it is
 * what every keystroke is compared against.
 */
const SPECIES = Object.entries(POKEMON)
  .filter(([, species]) => species.released)
  .map(([constant]) => nameOf(constant))
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

/** One row of the list: a species, and whether the row asks for its family rather than for the species alone. */
export interface Offer {
  name: string;
  family: boolean;
}

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
export function suggestions(value: string): Offer[] {
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
export const written = (offer: Offer) => (offer.family ? FAMILY : '') + offer.name.toLowerCase();
