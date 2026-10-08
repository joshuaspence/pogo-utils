/**
 * The nearby radar's own filter, saved under `hlscan`. Stored as one JSON string, so the field order below is part of
 * the value for the reason `filters.ts` gives. Unlike a feed filter it rides along with the radar button's position
 * rather than ticking separately, the button being what carries it.
 */
export default {
  shiny: true,
  minlv: 1,
  maxlv: 36,
  miniv: 0,
  maxiv: 100,
  checkAll: true,
  onlyShiny: true,
  name: 'Nearby Radar',
  birds: true,
  attrMode: 0,
  minatk: 0,
  maxatk: 15,
  mindef: 0,
  maxdef: 15,
  minsta: 0,
  maxsta: 15,
  showShinyOnly: true,
  loadShiny: true,
  notify: true,
  stop: true,
  pgp: true,
};
