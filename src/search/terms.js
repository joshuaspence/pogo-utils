/**
 * Every term the builder can put in a search string, grouped the way the page lays them out. One table, so a term is
 * added, corrected or relabelled in a single place and the page, the query writer and the shareable link all follow.
 *
 * `term` is what goes in the string, verbatim and lowercased, because that is what the game reads. `label` is what the
 * chip says. The two are kept apart rather than derived from each other: `4*` is a term no label would spell that way,
 * and "Can evolve" is a label no term would.
 *
 * `id` is what a link carries (`#i=shiny.evolve`), so it is stable in a way a label is not — renaming a chip leaves
 * every shared link working, while renaming an id breaks them. It defaults to the term where the term is already a
 * plain word, and is spelled out where the term has punctuation a fragment would have to escape.
 *
 * A group's `join` is what goes between the terms picked within it, and defaults to `,` because most of these groups
 * describe one slot on a Pokémon: nothing is two generations or two star ratings, so picking several can only mean
 * either. `status` and `moves` are the exceptions, since a Pokémon is any number of those at once and the combinations
 * are the point of searching for them — a lucky shiny, a shiny in a costume, an exclusive move on something the weather
 * is boosting.
 *
 * Which is why a pair that is one slot gets a group of its own rather than a place among the statuses. Rarity is one
 * slot and so is whatever Team GO Rocket did, so grouped with the statuses they would AND: `legendary&mythical` and
 * `shadow&purified` are searches nothing can match, where `legendary,mythical` and `shadow,purified` are two a reader
 * would actually want. A group is the whole of that decision, so the fix is where the term sits and not a new field.
 *
 * A group's `hue` tints its chips, so which group a selected chip came from reads at a glance once a dozen of them are
 * on. They are hues rather than the palette's tokens because these are categories of the page's own, unrelated to what
 * --track or --city mean elsewhere; theme.css owns the colours that carry meaning across pages.
 *
 * Fifteen groups is as far as that carries. The widest gap left on the wheel was 35°, and splitting it is what put Size
 * at 52° — 17° from Kept aside and 18° from Rarity, three yellows, with no better placement available. So a sixteenth
 * group wants a second cue rather than another hue.
 */

/**
 * The generations, as the dex-number ranges the game actually searches. A generation is not a search term — there is no
 * `gen1` — so each is the range it spans, which is why they sit here as terms rather than in the numeric ranges below.
 * The upper bound of the last one moves when a generation is added to the game.
 */
const GENERATIONS = [
  ['1', '1-151'],
  ['2', '152-251'],
  ['3', '252-386'],
  ['4', '387-493'],
  ['5', '494-649'],
  ['6', '650-721'],
  ['7', '722-809'],
  ['8', '810-905'],
  ['9', '906-1025'],
];

/**
 * The eighteen types. Listed in the games' own order rather than alphabetically, which is the order a player has seen
 * them in every type chart since 1999 — sorting them A-Z would put Bug before Fire and read as a list of words rather
 * than as the chart.
 */
const TYPES = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
];

const capitalise = (word) => word[0].toUpperCase() + word.slice(1);

export const GROUPS = [
  {
    id: 'status',
    label: 'Status',
    hue: 8,
    join: '&',
    help: 'What a Pokémon is, however it was caught. Picking several asks for all of them at once — a lucky shiny.',
    terms: [
      { id: 'shiny', term: 'shiny', label: 'Shiny' },
      { id: 'lucky', term: 'lucky', label: 'Lucky' },
      { id: 'costume', term: 'costume', label: 'Costume' },
    ],
  },
  {
    id: 'rarity',
    label: 'Rarity',
    hue: 70,
    help: 'A species is one of these at most, so picking several asks for anything rare.',
    terms: [
      { id: 'legendary', term: 'legendary', label: 'Legendary' },
      { id: 'mythical', term: 'mythical', label: 'Mythical' },
      { id: 'ultrabeast', term: 'ultrabeast', label: 'Ultra Beast' },
    ],
  },
  {
    id: 'rocket',
    label: 'Team GO Rocket',
    hue: 292,
    help: 'Purifying a Shadow Pokémon is what makes it Purified, so nothing is both — picking both asks for either.',
    terms: [
      { id: 'shadow', term: 'shadow', label: 'Shadow' },
      { id: 'purified', term: 'purified', label: 'Purified' },
    ],
  },
  {
    id: 'mega',
    label: 'Mega and Max',
    hue: 95,
    help: 'What the species can turn into, which is a property of the species rather than of the one you caught.',
    terms: [
      { id: 'megaevolve', term: 'megaevolve', label: 'Can Mega Evolve' },
      { id: 'dynamax', term: 'dynamax', label: 'Can Dynamax' },
      { id: 'gigantamax', term: 'gigantamax', label: 'Can Gigantamax' },
    ],
  },
  {
    id: 'appraisal',
    label: 'Appraisal',
    hue: 145,
    help: 'The star rating, as the appraisal gives it. Four stars is a hundred percent.',
    terms: [
      { id: 'star0', term: '0*', label: '0 ★' },
      { id: 'star1', term: '1*', label: '1 ★' },
      { id: 'star2', term: '2*', label: '2 ★' },
      { id: 'star3', term: '3*', label: '3 ★' },
      { id: 'star4', term: '4*', label: '4 ★' },
    ],
  },
  {
    id: 'evolution',
    label: 'Evolution',
    hue: 265,
    help: 'What can be evolved right now, what that evolution would be worth, and what an evolution is waiting on.',
    terms: [
      { id: 'evolve', term: 'evolve', label: 'Can evolve now' },
      { id: 'evolvenew', term: 'evolvenew', label: 'New to the dex' },
      { id: 'item', term: 'item', label: 'Needs an item' },
      { id: 'tradeevolve', term: 'tradeevolve', label: 'Evolves free after trade' },
      { id: 'evolvequest', term: 'evolvequest', label: 'Needs a buddy task' },
      { id: 'fusion', term: 'fusion', label: 'Can fuse' },
      { id: 'eggsonly', term: 'eggsonly', label: 'Baby' },
    ],
  },
  {
    id: 'moves',
    label: 'Moves',
    hue: 120,
    join: '&',
    help: 'A move the Pokémon knows, or the weather right now. Picking several asks for all of them at once.',
    terms: [
      { id: 'special', term: '@special', label: 'Exclusive move' },
      { id: 'adventureeffect', term: 'adventureeffect', label: 'Adventure Effect' },
      { id: 'weather', term: '@weather', label: 'Weather boosted' },
    ],
  },
  {
    id: 'origin',
    label: 'How you got it',
    hue: 200,
    help: 'Where it came from, which the game records on the Pokémon itself.',
    terms: [
      { id: 'traded', term: 'traded', label: 'Traded' },
      { id: 'hatched', term: 'hatched', label: 'Hatched' },
      { id: 'raid', term: 'raid', label: 'Raid' },
      { id: 'remote', term: 'remoteraid', label: 'Remote raid' },
      { id: 'exraid', term: 'exraid', label: 'EX raid' },
      { id: 'megaraid', term: 'megaraid', label: 'Mega raid' },
      { id: 'primalraid', term: 'primalraid', label: 'Primal raid' },
      { id: 'research', term: 'research', label: 'Research' },
      { id: 'rocket', term: 'rocket', label: 'From Team GO Rocket' },
      { id: 'gbl', term: 'gbl', label: 'GO Battle League' },
      { id: 'snapshot', term: 'snapshot', label: 'Photobomb' },
      { id: 'defender', term: 'defender', label: 'In a gym' },
    ],
  },
  {
    id: 'background',
    label: 'Background',
    hue: 220,
    help: 'The backdrop the catch was recorded against. Picking both is what the game spells `background`.',
    terms: [
      { id: 'locationbackground', term: 'locationbackground', label: 'Location' },
      { id: 'specialbackground', term: 'specialbackground', label: 'Event' },
    ],
  },
  {
    id: 'kept',
    label: 'Kept aside',
    hue: 35,
    help: 'The ones you have marked. Worth excluding from anything you mean to mass-transfer.',
    terms: [
      { id: 'favorite', term: 'favorite', label: 'Favourite' },
      { id: 'buddy', term: 'buddy', label: 'Buddy' },

      /**
       * A tag is searched by the name its owner gave it, so `#` — the game's "has any tag at all" — is the only tag
       * search a chip can offer without knowing what a reader called theirs. Ruling it out writes `!#`, the untagged
       * half, which is what makes one chip enough for both.
       */
      { id: 'tagged', term: '#', label: 'Tagged' },
    ],
  },
  {
    id: 'gender',
    label: 'Gender',
    hue: 344,
    help: 'Nothing is two of these, so picking several asks for any of them.',
    terms: [
      { id: 'male', term: 'male', label: 'Male' },
      { id: 'female', term: 'female', label: 'Female' },
      { id: 'genderunknown', term: 'genderunknown', label: 'Unknown' },
    ],
  },
  {
    id: 'size',
    label: 'Size',
    hue: 52,
    help: 'The four sizes the game records. Most Pokémon are none of them, so ruling one out barely narrows anything.',
    terms: [
      { id: 'xxs', term: 'xxs', label: 'XXS' },
      { id: 'xs', term: 'xs', label: 'XS' },
      { id: 'xl', term: 'xl', label: 'XL' },
      { id: 'xxl', term: 'xxl', label: 'XXL' },
    ],
  },
  {
    id: 'form',
    label: 'Regional forms',
    hue: 320,
    help: 'A regional variant answers to its region.',
    terms: [
      { id: 'alola', term: 'alola', label: 'Alolan' },
      { id: 'galar', term: 'galar', label: 'Galarian' },
      { id: 'hisui', term: 'hisui', label: 'Hisuian' },
      { id: 'paldea', term: 'paldea', label: 'Paldean' },
    ],
  },
  {
    id: 'type',
    label: 'Type',
    hue: 175,
    help: 'Picking several matches any of them.',
    terms: TYPES.map((type) => ({ id: type, term: type, label: capitalise(type) })),
  },
  {
    id: 'generation',
    label: 'Generation',
    hue: 240,
    help: 'A generation is searched as the dex numbers it spans — the game has no `gen1`.',
    terms: GENERATIONS.map(([number, range]) => ({ id: `gen${number}`, term: range, label: `Gen ${number}` })),
  },
];

/**
 * The numeric ranges, each written as its prefix and a span: `cp100-2000`. A bound left empty is left out, so one box
 * filled writes the open-ended range the game accepts (`cp3000-`) rather than inventing the other end.
 *
 * `max` bounds the input so a typo cannot write a range nothing can match, and is the ceiling the game itself has where
 * there is one — 1025 is the dex, and a CP above 5000 belongs to nothing.
 *
 * Buddy and Mega level belong here rather than among the terms above, even though the game documents them as the eleven
 * separate words `buddy0` to `buddy5` and `mega0` to `mega3`: they are levels, so a reader wants a span of them — `Good
 * Buddy or better` is `buddy2-5` — and eleven chips could not write that.
 */
export const RANGES = [
  { id: 'cp', prefix: 'cp', label: 'CP', max: 5000 },
  { id: 'hp', prefix: 'hp', label: 'HP', max: 500 },
  { id: 'dex', prefix: '', label: 'Dex number', min: 1, max: 1025 },
  { id: 'buddylevel', prefix: 'buddy', label: 'Buddy level', max: 5 },
  { id: 'megalevel', prefix: 'mega', label: 'Mega level', max: 3 },
  { id: 'age', prefix: 'age', label: 'Caught in the last … days', max: 3650 },
  { id: 'distance', prefix: 'distance', label: 'Kilometres from home', max: 40000 },
  { id: 'year', prefix: 'year', label: 'Year caught', min: 2016, max: 2030 },
];

/**
 * Starting points, each a plain state the builder loads and the reader then edits — the point is to land mid-way
 * through a query rather than to hand over a finished one. `text` fills the name box, the rest name term ids.
 *
 * The transfer preset is the one that earns its place: it is a dozen exclusions, every one of which matters, and
 * forgetting any single one of them is how a shiny ends up as candy.
 */
export const PRESETS = [
  {
    id: 'transfer',
    label: 'Safe to transfer',
    note: 'Everything worth keeping, excluded.',
    exclude: [
      'shiny',
      'lucky',
      'shadow',
      'purified',
      'legendary',
      'mythical',
      'costume',
      'favorite',
      'buddy',
      'tagged',
      'defender',
      'star4',
    ],
  },
  {
    id: 'evolve',
    label: 'Worth evolving',
    note: 'Evolutions the dex has not seen, minus the ones you are keeping.',
    include: ['evolvenew'],
    exclude: ['favorite', 'buddy'],
  },
  {
    id: 'lucky-trade',
    label: 'Shinies not yet lucky',
    note: 'Trade fodder for a lucky shiny.',
    include: ['shiny'],
    exclude: ['lucky', 'favorite'],
  },
  {
    id: 'great-league',
    label: 'Great League hopefuls',
    note: 'Just under the 1500 cap, shadows left out.',
    include: [],
    exclude: ['shadow'],
    ranges: { cp: { from: 1400, to: 1500 } },
  },
  {
    id: 'hundos',
    label: 'Hundos',
    note: 'Four stars, however they were caught.',
    include: ['star4'],
  },
];

/** Every term by id, for the link reader and the query writer — both are handed ids and need the term behind one. */
export const TERMS_BY_ID = new Map(GROUPS.flatMap((group) => group.terms).map((term) => [term.id, term]));
