/**
 * The nearby radar's own filter, saved under "hlscan". Like a feed filter it is stored as one JSON string, and
 * JSON.stringify re-emits it field by field in source order, so the order below is part of the value and must not be
 * rearranged. Unlike a feed filter it rides along with the radar button's position rather than ticking separately,
 * since the button is what carries it.
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
