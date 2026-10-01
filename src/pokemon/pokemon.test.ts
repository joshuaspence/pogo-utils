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

/**
 * The builder's remaining surface, which the dex itself does not reach: the `configure` callback on all four variant
 * declarations, `withForm` for a form that carries forms of its own, and the two markers that assert a default rather
 * than flip it. A bare `new Pokemon` throughout, because every case is about a species the dex has not frozen — and the
 * dex not reaching these is exactly why they want a test rather than a reading of `pokedex.ts`.
 */

/** A dex number no species has, so nothing here can be confused for a real one. */
const SPARE = 9001;

test('a configure callback is handed the variant, so what is true of it is said where it is declared', () => {
  const species = new Pokemon(SPARE)
    .addForm('SPEED', (form) => form.isNotReleased())
    .addRegion('Hisuian', (variant) => variant.isNotShinyEligible());

  // The callback's argument rather than the cursor: both markers land on their own variant, and the species keeps the
  // defaults. A callback handed the receiver instead would take the species out of every released filter.
  expect(species.form('SPEED').released).toBe(false);
  expect(species.region('Hisuian').shinyEligible).toBe(false);
  expect(species.released).toBe(true);
  expect(species.shinyEligible).toBe(true);
});

/**
 * The target stays put, which is what tells `addForm` from `withForm`: a second form is the species', not the first's.
 */
test('a configure callback leaves the target where it was', () => {
  const species = new Pokemon(SPARE).addForm('FIRST', (form) => form.isNotReleased()).addForm('SECOND');

  expect(species.form('SECOND').released).toBe(true);
  expect(() => species.form('FIRST').form('SECOND')).toThrow(/has no SECOND form/);
});

/**
 * `withForm` descends, so forms declared after it hang off the form rather than the species — which is what lets one
 * name sit under both, as `withRegion` already lets it sit under a species and its regional variant.
 */
test('withForm moves the target, so a form can carry forms of its own', () => {
  const species = new Pokemon(SPARE).withForm('OUTER').addForm('INNER', (form) => form.isNotReleased());

  expect(species.form('OUTER').form('INNER').released).toBe(false);
  expect(() => species.form('INNER')).toThrow(/has no INNER form/);

  // The descent is also what the marker after it lands on: `isNotReleased` here is the inner form's, the cursor having
  // moved to what `addForm` declared last.
  expect(species.form('OUTER').released).toBe(true);
});

/**
 * The callback runs before the target moves, and a variant is created from where its parent stands — so a form declared
 * after the descent inherits what the callback just set. The ordering is the whole of what this says: a callback run
 * after the descent would leave the inner form with the species' state instead, and the two readings differ only for a
 * marker set in the callback rather than after it.
 *
 * The species keeps its own state either way, which is what says the marker did not reach the receiver.
 */
test('withForm hands its callback the form it is descending into, before anything hangs off it', () => {
  const species = new Pokemon(SPARE).withForm('OUTER', (form) => form.doesNotSpawn()).addForm('INNER');

  expect(species.form('OUTER').spawns).toBe(false);
  expect(species.form('OUTER').form('INNER').spawns).toBe(false);
  expect(species.spawns).toBe(true);
});

test('withRegion hands its callback the variant it is descending into, before anything hangs off it', () => {
  const species = new Pokemon(SPARE).withRegion('Hisuian', (variant) => variant.isNotReleased()).addForm('BREED');

  expect(species.region('Hisuian').released).toBe(false);
  expect(species.region('Hisuian').form('BREED').released).toBe(false);
  expect(species.released).toBe(true);
});

/**
 * A marker applied *after* the descent reaches only what was declared last, so a form already hanging off the variant
 * keeps what it inherited when it was made. This is the other half of the pair above, and it is what says the
 * inheritance is a copy taken at creation rather than a lookup through the parent.
 */
test('a variant inherits its parent’s state when it is made, not when it is read', () => {
  const species = new Pokemon(SPARE).withRegion('Hisuian').addForm('BREED');

  species.region('Hisuian').isNotReleased();

  expect(species.region('Hisuian').released).toBe(false);
  expect(species.region('Hisuian').form('BREED').released).toBe(true);
});

/**
 * A region declared twice is refused as a form declared twice is, and for the same reason: a bare `set` would hand the
 * second declaration a fresh variant carrying none of the first's markers, leaving the first unreachable through
 * `region` and its markers silently undone.
 */
test('a region declared twice under the same parent is refused', () => {
  const species = new Pokemon(SPARE).addRegion('Hisuian');

  expect(() => species.addRegion('Hisuian')).toThrow(/already has a Hisuian variant/);

  // Under a different parent it is a different slot, which is the whole of what the guard is scoped to.
  expect(() => new Pokemon(SPARE).withForm('OUTER').addRegion('Hisuian')).not.toThrow();
});

/**
 * `isReleased` and `isShinyEligible` assert what the constructor already set, so neither can be shown by the state it
 * leaves — a species that was never marked reads the same. What they can be shown by is putting one back after the
 * marker that took it away, which is the case a dex entry corrected in place would be.
 */
test('a marker asserting a default puts it back after the one that took it away', () => {
  const released = new Pokemon(SPARE).addForm('SPEED', (form) => form.isNotReleased().isReleased());
  const shiny = new Pokemon(SPARE).addForm('SPEED', (form) => form.isNotShinyEligible().isShinyEligible());

  expect(released.form('SPEED').released).toBe(true);
  expect(shiny.form('SPEED').shinyEligible).toBe(true);
});

/**
 * Every marker lands on all of what was declared last, which is what makes `addForms` one declaration and not several.
 */
test('a marker after addForms reaches every form it declared', () => {
  const species = new Pokemon(SPARE).addForms('ONE', 'TWO', 'THREE').isNotReleased().isShinyEligible();

  expect(species.forms('ONE', 'TWO', 'THREE').map((form) => form.released)).toEqual([false, false, false]);
  expect(species.forms('ONE', 'TWO', 'THREE').map((form) => form.shinyEligible)).toEqual([true, true, true]);
  expect(species.released).toBe(true);
});

/** Freezing seals the variants too, so a builder reached through `form` or `region` throws as the species' own does. */
test('freeze reaches a variant and the markers that assert a default', () => {
  const species = new Pokemon(SPARE).addForm('SPEED').addRegion('Hisuian').freeze();

  expect(() => species.isReleased()).toThrow(/is frozen/);
  expect(() => species.form('SPEED').isShinyEligible()).toThrow(/is frozen/);
  expect(() => species.region('Hisuian').addRegion('Paldean')).toThrow(/is frozen/);
});
