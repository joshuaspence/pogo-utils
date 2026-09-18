/**
 * The filters PGSharp saves for the nearby feed — which spawns it is looking for. Unlike a control's position,
 * which is a Java Float, each of these is stored as one JSON string; they are kept as objects here so every field
 * reads and diffs on its own, and JSON.stringify re-emits the compact string PGSharp wrote where they are put in the
 * backup.
 *
 * That re-emission goes field by field in source order, and spreading `baseFilter` pins each field where `baseFilter`
 * puts it — overriding one sets its value, not its position — so `baseFilter` decides the order every filter is
 * written in. Reordering it reorders all of them, which is why a field belongs there even where every filter but one
 * leaves it alone: `onlyShiny` is declared false there so the shiny feeds reading true keep its place rather than
 * appending it.
 */

import { HISUI } from '../pokemon/pokedex.js';
import Pokemon from '../pokemon/pokemon.js';
import PERFECT_IV_POKEMON from '../filters/perfect-ivs.js';
import SHINY_POKEMON from '../filters/shiny.js';
import XXL_POKEMON from '../filters/xxl.js';
import XXS_POKEMON from '../filters/xxs.js';

/**
 * A filter's species list, checked, narrowed and collapsed to one entry per species. A form or a region the species
 * does not have has already thrown by the time we are called, so what is left to catch is a name pokemon.js does not
 * define at all, which reads as undefined and would reach the backup as a null where a species should be. The value is
 * all we are handed — the constant's name is gone by then — so the error gives the position to look at. The species
 * arrive as a Set, taken here in the order they were written so the position and the first-survivor rule below mean
 * what they say.
 *
 * Every `keep` given has to hold for an entry to stay, which is how a filter drops what has no shiny to find or what
 * the wild never turns up. They run before the list collapses, so a species listed twice — once as a form that
 * survives them and once as one that does not — keeps the form that survives rather than whichever came first.
 *
 * A form is a Pokemon of its own carrying the dex number of the species it belongs to, since that number is all
 * PGSharp stores, so a list naming several forms of one species names that number several times. The names are worth
 * keeping — they say which forms the list is for — but the repeats are not, so the first of each number survives and
 * the rest go, leaving the list PGSharp itself would write.
 */
function species(entries, ...keep) {
  const list = [...entries];
  const at = list.findIndex((entry) => !(entry instanceof Pokemon));

  if (at !== -1) {
    throw new Error(`species #${at + 1} is not a POKEMON constant — check it against pokedex.js`);
  }

  const kept = list.filter((entry) => keep.every((predicate) => predicate(entry)));

  return [...new Map(kept.map((entry) => [Number(entry), entry])).values()];
}

// Reads as filter's predicate: `species([...], filterShinyEligible)` drops the ones with no shiny to find.
const filterRegional = (pokemon) => pokemon.regional;
const filterShinyEligible = (pokemon) => pokemon.shinyEligible;
const filterWildSpawns = (pokemon) => pokemon.spawns;
const filterReleased = (pokemon) => pokemon.released;

/**
 * A filter for one region's own — `filterRegion(PALDEA)` keeps the Paldean variants and drops the rest. Unlike
 * `filterRegional`, which asks whether a species is a region-locked spawn at all, this asks which region a variant
 * belongs to, so it reads the region the variant carries as data through `isFrom` rather than the adjective on its
 * name. It is a factory rather than a predicate: handed a region it returns the predicate `species` runs, so it sits
 * in a filter list beside the flag ones. A form of a regional variant inherits the region, so naming the region
 * catches its forms without naming each.
 */
const filterRegion = (region) => (pokemon) => pokemon.isFrom(region);

const baseFilter = {
  attrMode: 0,
  checkAll: false,
  distance: 80,
  form: 0,
  gender: 0,
  level: 1,
  lvmax: 36,
  maxatk: 15,
  maxdef: 15,
  maxIV: 100,
  maxsta: 15,
  minatk: 0,
  mindef: 0,
  minIV: 0,
  minsta: 0,
  notif: false,
  onlyShiny: false,
  priority: 1,
  size: 0,
};

// What any feed can ever show: the nearby feed reports wild spawns, so a species not in the game yet or one the wild
// never turns up is a line PGSharp would never alert on. Every filter below starts from these.
const NEARBY_FEED_FILTERS = [filterReleased, filterWildSpawns];

// The predicates every shiny-hunting feed shares; a region or `filterRegional` is added to these per feed. Shared as a
// list of predicates rather than a computed species list because `species` collapses to one entry per dex number: a
// feed built off another's collapsed list would filter what the dedupe already dropped, losing a regional form whose
// dex a plainer form had won. Each feed therefore filters `SHINY_POKEMON` afresh, collapsing last.
const SHINY_HUNTING_FILTERS = [...NEARBY_FEED_FILTERS, filterShinyEligible];

const baseShinyHuntingFilter = {
  ...baseFilter,
  onlyShiny: true,
};

export default [
  {
    ...baseShinyHuntingFilter,
    name: 'Shiny Hunting',
    pokemons: species(SHINY_POKEMON, ...SHINY_HUNTING_FILTERS),
  },
  {
    ...baseShinyHuntingFilter,
    name: 'Shiny Hunting (Hisuian)',
    form: 3,
    pokemons: species(SHINY_POKEMON, ...SHINY_HUNTING_FILTERS, filterRegion(HISUI)),
  },
  {
    ...baseShinyHuntingFilter,
    name: 'Regional Shiny Hunting',
    pokemons: species(SHINY_POKEMON, ...SHINY_HUNTING_FILTERS, filterRegional),
  },
  {
    ...baseFilter,
    name: '100%',
    distance: 10,
    maxIV: 100,
    minIV: 100,
    notif: true,
    priority: 0,
    pokemons: species(PERFECT_IV_POKEMON, ...NEARBY_FEED_FILTERS),
  },
  {
    ...baseFilter,
    name: 'XXL',
    size: 5,
    pokemons: species(XXL_POKEMON, ...NEARBY_FEED_FILTERS),
  },
  {
    ...baseFilter,
    name: 'XXS',
    size: 1,
    pokemons: species(XXS_POKEMON, ...NEARBY_FEED_FILTERS),
  },
];
