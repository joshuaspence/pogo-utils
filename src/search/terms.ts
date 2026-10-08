/**
 * Every term the builder can put in a search string, grouped the way the page lays them out. One table, so a term is
 * added, corrected or relabelled in a single place and the page, the query writer and the shareable link all follow.
 *
 * `term` is what goes in the string, verbatim and lowercased, because that is what the game reads, where `label` is
 * what the chip says: `4*` is a term no label would spell that way. `id` is what a link carries (`#i=shiny.evolve`),
 * so it is stable in a way a label is not, and defaults to the term where that is already a plain word.
 *
 * A group's `join` defaults to `,`, most of these groups describing one slot on a Pokémon — nothing is two generations
 * or two star ratings. `status` and `moves` are the exceptions, a Pokémon being any number of those at once. Which is
 * why a pair that is one slot gets a group of its own rather than a place among the statuses: grouped there,
 * `legendary&mythical` and `shadow&purified` would match nothing where a reader wanted the comma.
 *
 * `exclusive` and `exhaustive` are the two facts `optimise.js` shortens a clause by: at most one term is ever true, and
 * at least one always is. Neither follows from `join` or from the other — Type is exhaustive and not exclusive, where
 * Appraisal is both and Size only exclusive — and each buys a reduction of its own, which is why they are two fields.
 * Generation carries neither, though a species is in exactly one: its terms are dex spans, which `optimise.js` folds
 * into the one span covering them, and declaring the fact would only let the weaker reduction win.
 *
 * A term's `covers` names the terms it is the union of, which `background` is of the two backdrops. It costs that group
 * the exclusivity above, `background` overlapping both the terms it covers, so `background&!locationbackground` is the
 * Event backdrops and a search a reader would want.
 *
 * A group's `hue` tints its chips. Hues rather than the palette's tokens, these being categories of the page's own;
 * `theme.css` owns the colours that carry meaning across pages. Fifteen groups is as far as that carries — the widest
 * gap left on the wheel was 35°, so a sixteenth group wants a second cue rather than another hue.
 */

import { GENERATIONS } from '../pokemon/generations.js';

export interface Term {
  id: string;
  term: string;
  label: string;
  covers?: readonly string[];
}

export interface Group {
  id: string;
  label: string;
  hue: number;
  help: string;
  terms: readonly Term[];
  join?: string;
  exclusive?: boolean;
  exhaustive?: boolean;
}

export interface Range {
  id: string;
  prefix: string;
  label: string;
  max: number;
  min?: number;
}

export interface Preset {
  id: string;
  label: string;
  note: string;
  text?: string;
  include?: readonly string[];
  exclude?: readonly string[];
}

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

const capitalise = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

export const GROUPS: readonly Group[] = [
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
    exclusive: true,
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
    exclusive: true,
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
    exclusive: true,
    exhaustive: true,
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
    /*
     * Three of these the game does not answer the way the label reads, per the community phrase list. They keep their
     * chips — the game takes all three terms — but the help says so, this page's output being what a mass transfer is
     * run from, and says whose claim it is: none of the three was checked against the game, and `primalraid` is a bug
     * Niantic can fix out from under the sentence.
     */
    help:
      'Where it came from, which the game records on the Pokémon itself. Three come with a caveat the community ' +
      'phrase list reports: `EX raid` returns nothing now, the raids being long past the dates it looks at; `Primal ' +
      'raid` is not working; and `From Team GO Rocket` misses shadows that came from a raid or from research, which ' +
      '`Shadow` or `Purified` will find.',
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
    help: 'The backdrop the catch was recorded against. `Any` is `background`, the word the game has for either.',
    terms: [
      { id: 'locationbackground', term: 'locationbackground', label: 'Location' },
      { id: 'specialbackground', term: 'specialbackground', label: 'Event' },

      /**
       * `background` is the union of the two above, so as an inclusion it says nothing picking both does not. It earns
       * its chip on the other side: ruling it out is one clause where refusing both is two, and a search string has a
       * reader typing it on a phone. `covers` is that union said to `optimise.js`, which writes this in place of both
       * on whichever side they were picked — so the chip saves those characters for the reader who did click twice.
       */
      { id: 'background', term: 'background', label: 'Any', covers: ['locationbackground', 'specialbackground'] },
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
    exclusive: true,
    exhaustive: true,
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
    exclusive: true,
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
    exclusive: true,
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
    exhaustive: true,
    help: 'Picking several matches any of them.',
    terms: TYPES.map((type) => ({ id: type, term: type, label: capitalise(type) })),
  },
  {
    id: 'generation',
    label: 'Generation',
    hue: 240,
    help: 'A generation is searched as the dex numbers it spans — the game has no `gen1`.',
    /**
     * A generation is not a search term — there is no `gen1` — so each chip is the dex span it covers, which is why
     * these are terms rather than one of the numeric ranges below. `pokemon/generations.js` owns the boundaries; this
     * is the only place that renders them as the `1-151` the game reads.
     */
    terms: GENERATIONS.map(({ number, first, last }) => ({
      id: `gen${number}`,
      term: `${first}-${last}`,
      label: `Gen ${number}`,
    })),
  },
];

/**
 * The numeric ranges, each written as its prefix and a span: `cp100-2000`. A bound left empty falls back to the range's
 * own `min` or `max` rather than to an open end, so one box filled writes `cp3000-5000`; `rangeClause` says why.
 *
 * `max` bounds the input so a typo cannot write a range nothing can match, and is the ceiling the game itself has where
 * there is one — 1025 is the dex, and a CP above 5000 belongs to nothing.
 *
 * Buddy and Mega level belong here rather than among the terms above, even though the game documents them as the eleven
 * separate words `buddy0` to `buddy5` and `mega0` to `mega3`: they are levels, so a reader wants a span of them — `Good
 * Buddy or better` is `buddy2-5` — and eleven chips could not write that.
 */
export const RANGES: readonly Range[] = [
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
 * Only one of these earns its place. Safe to transfer is a long list of exclusions, every one of which matters, and
 * forgetting any single one of them is how a shiny ends up as candy. A start a reader could have clicked together out
 * of two chips saves them nothing and costs every reader a button to read past, so the chips carry those.
 */
export const PRESETS: readonly Preset[] = [
  {
    id: 'transfer',
    label: 'Safe to transfer',
    note: 'Everything worth keeping, excluded.',
    exclude: [
      'shiny',
      'lucky',
      'shadow',
      'purified',
      'mythical',
      'costume',
      'special',
      'background',
      'favorite',
      'buddy',
      'tagged',
      'defender',
      'star3',
      'star4',
      'xxs',
      'xxl',
    ],
  },
];

/**
 * Every term by id, for the link reader and the query writer — both are handed ids and need the term behind one.
 */
export const TERMS_BY_ID: ReadonlyMap<string, Term> = new Map(
  GROUPS.flatMap((group) => group.terms).map((term) => [term.id, term]),
);
