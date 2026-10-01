/**
 * Two things travel down a `Pokemon` chain — the cursor a marker lands on and the target a new variant hangs off — and
 * every test here is a defect that confuses them: a marker applied to the species rather than to the form just
 * declared, a form hung off the species rather than off the region descended into, a region read off the adjective in a
 * name rather than out of the variant.
 *
 * Most of these assert a state the defaults do not produce — not released, not spawning, a region — so a declaration
 * that lost its marker fails the test rather than passing it for nothing. That is why this file needs fewer explicit
 * preconditions than `search/optimise.test.ts`: there, a refusal and a broken gate both read as no reduction.
 *
 * `DARMANITAN` and `TAUROS` carry the whole of the cursor and the target between them, so the cases below are read off
 * the real dex wherever one of those two can say it, and a bare `new Pokemon` is used only where a test needs a species
 * the dex has not frozen.
 */

import { expect, test } from 'vitest';

import Pokemon from './pokemon.js';
import POKEMON, { GALAR, PALDEA } from './pokedex.js';

test('a marker lands on what was declared last rather than on the species', () => {
  const darmanitan = POKEMON.DARMANITAN;

  // `isNotReleased` sits after the second `addForm`, so Zen Mode is what it marks. A marker reaching the receiver
  // instead would take the species and its Standard Mode out of every filter for what can be had.
  expect(darmanitan.form('ZEN_MODE').released).toBe(false);
  expect(darmanitan.form('STANDARD_MODE').released).toBe(true);
  expect(darmanitan.released).toBe(true);
});

test('a form hangs off the target, so one name can sit under both a species and its regional variant', () => {
  // Declaring a form twice at the same target throws, so the dex importing at all is this working: `DARMANITAN` names
  // Standard Mode and Zen Mode once on the species and again under Galarian, which collide unless `withRegion` moved
  // the target that `addForm` reads.
  expect(Object.keys(POKEMON)).toHaveLength(1025);

  const galarian = POKEMON.DARMANITAN.region(GALAR);

  expect(galarian.form('ZEN_MODE').released).toBe(false);
  expect(galarian.form('STANDARD_MODE').released).toBe(true);
});

test("forms declared after a descent are the variant's, not the species'", () => {
  const tauros = POKEMON.TAUROS;

  // The three breeds are declared after `withRegion(PALDEA)`, so they are Paldean Tauros' forms. Reaching for one on
  // the species has to stop here rather than answer undefined, which is the reading `dom.js` takes of a stale id.
  expect(tauros.region(PALDEA).form('COMBAT_BREED').dex).toBe(128);
  expect(() => tauros.form('COMBAT_BREED')).toThrow(/has no COMBAT_BREED form/);
});

test('a variant carries the region it was declared under, where the species belongs to none', () => {
  const tauros = POKEMON.TAUROS;

  // A form inherits its parent's region, so a breed two levels down answers for Paldea where the species above it does
  // not. What this cannot show is the region being data the variant holds rather than the adjective at the front of its
  // name: `#createRegion` sets both from the same place, so reading the name instead passes every case here and the two
  // can only disagree for a species whose own constant begins with one of the four adjectives. The dex has none, so
  // that is a break unreachable with this data rather than one a wider corpus would catch.
  expect(tauros.region(PALDEA).isFrom(PALDEA)).toBe(true);
  expect(tauros.region(PALDEA).form('AQUA_BREED').isFrom(PALDEA)).toBe(true);
  expect(tauros.isFrom(PALDEA)).toBe(false);
  expect(POKEMON.DARMANITAN.form('ZEN_MODE').isFrom(GALAR)).toBe(false);
});

test('a Regional still spawns where the four rarity markers stop it', () => {
  // `isRegional` says where the wild turns one up, not whether it does, so it is the one marker here that leaves
  // spawning alone — and Paldean Tauros not spawning is its own `doesNotSpawn` rather than a consequence of the region.
  expect([POKEMON.TAUROS.regional, POKEMON.TAUROS.spawns]).toEqual([true, true]);
  expect(POKEMON.TAUROS.region(PALDEA).spawns).toBe(false);

  expect(new Pokemon(999).isLegendary().spawns).toBe(false);
  expect(new Pokemon(999).isMythical().spawns).toBe(false);
  expect(new Pokemon(999).isBaby().spawns).toBe(false);
  expect(new Pokemon(999).isUltraBeast().spawns).toBe(false);

  // Meltan is the Mythical the wild does turn up, which it says by putting spawning back afterwards.
  expect([POKEMON.MELTAN.mythical, POKEMON.MELTAN.spawns]).toEqual([true, true]);
});

test('a form starts from where the species stood when it was declared', () => {
  const species = new Pokemon(999).addForm('EARLY').isNotReleased().addForm('LATE');

  // `isNotReleased` landed on Early, so the species never stopped being released and Late inherits that. A form seeded
  // from the defaults instead would quietly re-release everything declared beneath something marked.
  expect(species.form('EARLY').released).toBe(false);
  expect(species.form('LATE').released).toBe(true);
  expect(species.released).toBe(true);

  expect(new Pokemon(999).isNotShinyEligible().addForm('AFTER').form('AFTER').shinyEligible).toBe(false);
});

test('a form or a region the species does not have stops here, naming the species', () => {
  expect(() => POKEMON.BULBASAUR.form('NOPE')).toThrow(/^BULBASAUR has no NOPE form/);
  expect(() => POKEMON.BULBASAUR.region(GALAR)).toThrow(/^BULBASAUR has no Galarian form/);
});

test('a form declared twice stops rather than replacing the first', () => {
  const species = new Pokemon(999).addForm('TWICE').isNotReleased();

  // A second declaration overwriting the first would leave it unreachable through `form` and its marker silently
  // undone, which is the one disagreement in this model that could have been quiet.
  expect(() => species.addForm('TWICE')).toThrow(/already has a TWICE form/);
  expect(species.form('TWICE').released).toBe(false);
});

test('a frozen species refuses a builder and goes on answering a read', () => {
  // The dex is frozen once declared, so a builder called from a filter or a page throws rather than flipping state
  // every consumer of the shared table sees.
  expect(() => POKEMON.BULBASAUR.isNotReleased()).toThrow(/^BULBASAUR is frozen/);
  expect(POKEMON.BULBASAUR.released).toBe(true);
  expect(POKEMON.BULBASAUR.dex).toBe(1);
});

test('the coercions split the name from the number, through every level of nesting', () => {
  const zen = POKEMON.DARMANITAN.region(GALAR).form('ZEN_MODE');

  // `as` renames a species' forms and regions with it and recurses, so a variant two levels down reads as its own path
  // rather than as the `#555` it was built with — which is what makes the throws above name something.
  expect(String(zen)).toBe('Galarian DARMANITAN (ZEN_MODE)');

  // Every form and variant shares the species' dex, and `toJSON` is what has a filter write that number and nothing
  // else: a name reaching the JSON would be a filter PGSharp cannot read.
  expect(Number(zen)).toBe(555);
  expect(JSON.stringify(zen)).toBe('555');
  expect(JSON.stringify([POKEMON.CHARMANDER, zen])).toBe('[4,555]');
});

test('variants list the regions before the forms, each answering for its own', () => {
  // `DARMANITAN` is the one of the two that can show the order at all, carrying a region and two forms at the same
  // level. Asked of a species holding only one kind the list reads the same either way round, which is a test named for
  // something its data cannot say.
  expect(POKEMON.DARMANITAN.variants.map((variant) => [variant.region, variant.form])).toEqual([
    [GALAR, null],
    [null, 'STANDARD_MODE'],
    [null, 'ZEN_MODE'],
  ]);

  // A variant that carries variants answers for them in turn, so the species lists Paldean Tauros alone and Paldean
  // Tauros lists the three breeds rather than the species listing every descendant.
  expect(POKEMON.TAUROS.variants).toEqual([{ region: PALDEA, form: null, pokemon: POKEMON.TAUROS.region(PALDEA) }]);

  expect(POKEMON.TAUROS.region(PALDEA).variants.map((variant) => variant.form)).toEqual([
    'COMBAT_BREED',
    'BLAZE_BREED',
    'AQUA_BREED',
  ]);
});
