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

import { filterRegion, filterRegional, species, WILD_SPAWN_FILTERS, SHINY_HUNTING_FILTERS } from '../filters/narrow.js';
import PERFECT_IV_POKEMON from '../filters/perfect-ivs.js';
import SHINY_POKEMON from '../filters/shiny.js';
import XXL_POKEMON from '../filters/xxl.js';
import XXS_POKEMON from '../filters/xxs.js';
import { HISUI } from '../pokemon/pokedex.js';

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
    pokemons: species(PERFECT_IV_POKEMON, ...WILD_SPAWN_FILTERS),
  },
  {
    ...baseFilter,
    name: 'XXL',
    size: 5,
    pokemons: species(XXL_POKEMON, ...WILD_SPAWN_FILTERS),
  },
  {
    ...baseFilter,
    name: 'XXS',
    size: 1,
    pokemons: species(XXS_POKEMON, ...WILD_SPAWN_FILTERS),
  },
];
