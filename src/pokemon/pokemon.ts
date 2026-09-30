/**
 * One species, or one of its forms — a dex number wearing a name. Naming a form or a region asks for one the species
 * actually has and hands back the Pokemon that form is, so a filter can say which form it means and still write the
 * one number PGSharp stores: `toJSON` sees to that, leaving `JSON.stringify` to emit the dex number and nothing else.
 *
 * A species is built up a link at a time, and two things travel down the chain. One is the cursor — what a marker
 * applies to. `isShinyEligible`, `isNotShinyEligible`, `doesSpawn`, `doesNotSpawn`, `isReleased`, `isNotReleased`,
 * `isLegendary`, `isMythical`, `isBaby`, `isUltraBeast`, `isRegional` and `isNotRegional` all land on whatever was
 * declared last — the species itself until a form or a region is named, and that form or region afterwards. These are
 * properties of the form rather than the species, since a species can have a shiny where its regional variant does
 * not. Undeclared reads as eligible, so a species says nothing until it has something to say. A Legendary, Mythical,
 * Baby or Ultra Beast is one the wild never turns up, so those four stop it spawning too — Meltan the lone Mythical
 * that does, saying `doesSpawn` after to put it back. A Regional is the odd one out: it still spawns, only somewhere
 * particular, so it leaves spawning alone; a form inherits it, `isNotRegional` handing one back to the wild at large.
 *
 * The other is the target — what a new form or region hangs off. `addForm`, `addForms`, `addRegion` and `addRegions`
 * declare peers at the current target and leave it where it is, so listing several is listing siblings. `withForm`
 * and `withRegion` declare one and descend into it, moving the target so what follows nests beneath — the Paldean
 * breeds under Paldean Tauros, the Galarian modes under Galarian Darmanitan.
 *
 * ```js
 * new Pokemon(128).withRegion(PALDEA).doesNotSpawn().addForms('COMBAT_BREED', 'BLAZE_BREED', 'AQUA_BREED');
 * ```
 */
export default class Pokemon {
  #dex: number;
  #name: string;

  /**
   * The region this variant belongs to — its adjective (`PALDEA`), or null for the base species and a plain form.
   */
  #region: string | null = null;

  #forms = new Map<string, Pokemon>();

  #regions = new Map<string, Pokemon>();

  #released = true;
  #shinyEligible = true;
  #spawns = true;

  #baby = false;
  #legendary = false;
  #mythical = false;
  #regional = false;
  #ultraBeast = false;

  // Set by `freeze()` once the dex is fully declared; a builder called afterwards throws rather than quietly changing a
  // shared, exported species. See freeze.
  #frozen = false;

  /**
   * The cursor a marker lands on: the species until a form or region is declared, then whatever was declared last.
   *
   * `Pokemon`, rather than the `this` type inference reaches for. The constructor seeds this from `this`, which is what
   * made it polymorphic, and every value after that is something `#variant` built with a bare `new Pokemon` — so a
   * subclass would find base instances in here and the `this` type would be saying otherwise. The builders' own
   * `return this` stays inferred, because there it is true: they hand back the receiver, which is what lets a chain
   * stay typed as whatever it started as.
   */
  #declared: Pokemon[];

  /**
   * The target a new form or region hangs off: the species, until `withForm`/`withRegion` descends into a variant.
   */
  #target: Pokemon;

  constructor(dex: number) {
    this.#dex = dex;
    this.#name = `#${dex}`;
    this.#declared = [this];
    this.#target = this;
  }

  /**
   * One form, as `addForms` with a single name.
   *
   * The callback is handed that form, so what is true of it is said where it is declared rather than by what came
   * last, and the target stays put:
   *
   * ```js
   * new Pokemon(999).addForm('SPEED', (form) => form.isShinyEligible());
   * ```
   */
  addForm(name: string, configure?: (form: Pokemon) => void) {
    const variant = this.#target.#createForm(name);
    this.#declared = [variant];

    if (configure) {
      configure(variant);
    }

    return this;
  }

  /**
   * The forms this species comes in as peers of one another, spelled as the games spell them.
   *
   * Each is a Pokemon of its own, hung off the current target — the species, or a region `withRegion` last descended
   * into. The target does not move, so a later `addForms` adds more siblings rather than nesting under the first.
   */
  addForms(...names: string[]) {
    this.#declared = names.map((name) => this.#target.#createForm(name));
    return this;
  }

  /**
   * One region, as `addRegions` with a single region.
   *
   * The callback is handed that variant, and the target stays put:
   *
   * ```js
   * new Pokemon(999).addRegion(ALOLA, (alolan) => alolan.isShinyEligible());
   * ```
   */
  addRegion(region: string, configure?: (variant: Pokemon) => void) {
    const variant = this.#target.#createRegion(region);
    this.#declared = [variant];

    if (configure) {
      configure(variant);
    }

    return this;
  }

  /**
   * The regions this species has a variant in, as peers of one another.
   *
   * Each is a Pokemon of its own, hung off the current target, which does not move — for a single region to descend
   * into, reach for `withRegion`.
   */
  addRegions(...regions: string[]) {
    this.#declared = regions.map((region) => this.#target.#createRegion(region));
    return this;
  }

  /**
   * One form to descend into: declared as a peer would be, then made the target, so what follows — its own forms, or
   * a trailing marker — lands on it rather than on the species. Reach for this when a form carries forms of its own.
   */
  withForm(name: string, configure?: (form: Pokemon) => void) {
    const variant = this.#target.#createForm(name);
    this.#declared = [variant];

    if (configure) {
      configure(variant);
    }

    this.#target = variant;
    return this;
  }

  /**
   * One region to descend into: its variant declared, then made the target, so the forms that follow hang beneath it
   * — the Paldean breeds under Paldean Tauros, the Galarian modes under Galarian Darmanitan.
   *
   * ```js
   * new Pokemon(128).withRegion(PALDEA).doesNotSpawn().addForms('COMBAT_BREED', 'BLAZE_BREED', 'AQUA_BREED');
   * ```
   */
  withRegion(region: string, configure?: (variant: Pokemon) => void) {
    const variant = this.#target.#createRegion(region);
    this.#declared = [variant];

    if (configure) {
      configure(variant);
    }

    this.#target = variant;
    return this;
  }

  /**
   * Marks what was declared last as out in Pokémon GO — in the game to be had at all.
   */
  isReleased() {
    this.#assertMutable();

    for (const variant of this.#declared) {
      variant.#released = true;
    }

    return this;
  }

  /**
   * Marks what was declared last as not in Pokémon GO yet, which keeps it out of a filter for what you can get.
   */
  isNotReleased() {
    this.#assertMutable();

    for (const variant of this.#declared) {
      variant.#released = false;
    }

    return this;
  }

  /**
   * Marks what was declared last as having a shiny in the game.
   */
  isShinyEligible() {
    this.#assertMutable();

    for (const variant of this.#declared) {
      variant.#shinyEligible = true;
    }

    return this;
  }

  /**
   * Marks what was declared last as having none, which keeps it out of a filter that hunts shinies.
   */
  isNotShinyEligible() {
    this.#assertMutable();

    for (const variant of this.#declared) {
      variant.#shinyEligible = false;
    }

    return this;
  }

  /**
   * Marks what was declared last as something the wild turns up, which is what the feed filters watch for.
   */
  doesSpawn() {
    this.#assertMutable();

    for (const variant of this.#declared) {
      variant.#spawns = true;
    }

    return this;
  }

  /**
   * Marks what was declared last as something the wild never turns up — a raid, a trade or an egg only.
   */
  doesNotSpawn() {
    this.#assertMutable();

    for (const variant of this.#declared) {
      variant.#spawns = false;
    }

    return this;
  }

  /**
   * Marks what was declared last as a Baby — hatched from an egg, never met in the wild, so it stops spawning too.
   */
  isBaby() {
    this.#assertMutable();

    for (const variant of this.#declared) {
      variant.#baby = true;
      variant.#spawns = false;
    }

    return this;
  }

  /**
   * Marks what was declared last as a Legendary; the wild never turns one up, so it stops spawning too.
   */
  isLegendary() {
    this.#assertMutable();

    for (const variant of this.#declared) {
      variant.#legendary = true;
      variant.#spawns = false;
    }

    return this;
  }

  /**
   * The same for a Mythical — Meltan the one that spawns anyway, saying `doesSpawn` after to put it back.
   */
  isMythical() {
    this.#assertMutable();

    for (const variant of this.#declared) {
      variant.#mythical = true;
      variant.#spawns = false;
    }

    return this;
  }

  /**
   * Marks what was declared last as a Regional — one the wild turns up only in its own part of the world. It still
   * spawns, so unlike the categories above this leaves `#spawns` alone; it only says where.
   */
  isRegional() {
    this.#assertMutable();

    for (const variant of this.#declared) {
      variant.#regional = true;
    }

    return this;
  }

  /**
   * Marks what was declared last as no Regional — for a form that turns up anywhere where the species it descends
   * from does not, so a species can be Regional and hand a form that inherited it back to the wild at large.
   */
  isNotRegional() {
    this.#assertMutable();

    for (const variant of this.#declared) {
      variant.#regional = false;
    }

    return this;
  }

  /**
   * Marks what was declared last as an Ultra Beast; the wild never turns one up, so it stops spawning too.
   */
  isUltraBeast() {
    this.#assertMutable();

    for (const variant of this.#declared) {
      variant.#ultraBeast = true;
      variant.#spawns = false;
    }

    return this;
  }

  /**
   * Names this species for the errors below, from the constant it is bound to, and renames its forms with it.
   */
  as(name: string) {
    this.#assertMutable();
    this.#name = name;

    for (const [form, variant] of this.#forms) {
      variant.as(`${name} (${form})`);
    }

    for (const [region, variant] of this.#regions) {
      variant.as(`${region} ${name}`);
    }

    return this;
  }

  /**
   * Seal this species and its forms and regions once the dex is declared. A builder called afterwards then throws
   * rather than quietly flipping state every consumer of POKEMON sees.
   *
   * Read-only lookups (`form`, `region`, the getters) are unaffected.
   */
  freeze() {
    this.#frozen = true;

    for (const variant of this.#forms.values()) {
      variant.freeze();
    }

    for (const variant of this.#regions.values()) {
      variant.freeze();
    }

    return this;
  }

  /**
   * One of this species' forms.
   *
   * A name it does not have stops here rather than reaching the backup as a null.
   *
   * One `get` and a check on what came back, rather than a `has` and then a `get`. The two calls are two lookups and
   * the checker cannot join them — nothing at the type level says they asked the same key, so `get` still answers
   * `Pokemon | undefined` however the `has` above it went. Reading the result is the check that narrows, and it is the
   * check the throw was already making.
   */
  form(name: string): Pokemon {
    const variant = this.#forms.get(name);

    if (variant === undefined) {
      throw new Error(`${this.#name} has no ${name} form — check it against pokedex.js`);
    }

    return variant;
  }

  /**
   * Several of this species' forms at once, in the order named — a list to spread into a filter's species list, where
   * naming each one by hand would say the species over and over.
   */
  forms(...names: string[]) {
    return names.map((name) => this.form(name));
  }

  /**
   * This species as one region sees it.
   *
   * A region it has no variant in stops here for the same reason, and reads what came back rather than asking twice,
   * as `form` above does.
   */
  region(region: string): Pokemon {
    const variant = this.#regions.get(region);

    if (variant === undefined) {
      throw new Error(`${this.#name} has no ${region} form — check it against pokedex.js`);
    }

    return variant;
  }

  /**
   * Whether this one is the given region's variant — Paldean Tauros answers to `PALDEA`, and its breeds inherit the
   * region so they answer too, while the base species and a plain form belong to none. The region is data the variant
   * carries, not the adjective spelled at the front of its name, so a filter for one region's own asks this rather than
   * reading that name. Distinct from `regional`, which asks whether a species is a region-locked spawn at all.
   */
  isFrom(region: string) {
    return this.#region === region;
  }

  /**
   * The national dex number, which every form and regional variant of a species shares.
   */
  get dex() {
    return this.#dex;
  }

  /**
   * The regional variants and forms hung directly off this one, regions first, each in the order declared — for reading
   * the dex rather than for naming a form in a filter, which is what `form` and `region` are for. A variant that
   * carries variants of its own answers for them in turn, so Paldean Tauros lists its three breeds and the species
   * lists only Paldean Tauros.
   */
  get variants() {
    return [
      ...[...this.#regions].map(([region, pokemon]) => ({ region, form: null, pokemon })),
      ...[...this.#forms].map(([form, pokemon]) => ({ region: null, form, pokemon })),
    ];
  }

  /**
   * Whether this one is a Baby.
   */
  get baby() {
    return this.#baby;
  }

  /**
   * Whether this one is a Legendary.
   */
  get legendary() {
    return this.#legendary;
  }

  /**
   * Whether this one is Mythical.
   */
  get mythical() {
    return this.#mythical;
  }

  /**
   * Whether the wild turns this one up only in its own part of the world.
   */
  get regional() {
    return this.#regional;
  }

  /**
   * Whether this one is in Pokémon GO yet.
   */
  get released() {
    return this.#released;
  }

  /**
   * Whether a shiny of this one exists to be hunted.
   */
  get shinyEligible() {
    return this.#shinyEligible;
  }

  /**
   * Whether the wild turns this one up at all.
   */
  get spawns() {
    return this.#spawns;
  }

  /**
   * Whether this one is an Ultra Beast.
   */
  get ultraBeast() {
    return this.#ultraBeast;
  }

  /** Refuse a mutation once frozen (see freeze), naming the species so a stray call is easy to trace. */
  #assertMutable() {
    if (this.#frozen) {
      throw new Error(`${this.#name} is frozen; set its state in pokedex.js, before the dex is frozen`);
    }
  }

  /**
   * Creates a form of this Pokemon and files it under the name the games give it.
   *
   * A name already filed here stops the declaration rather than replacing what is under it: a bare `set` would hand the
   * second `addForm('X')` a fresh variant carrying none of the first one's markers, leaving the first unreachable
   * through `form` and its `isNotReleased` silently undone. Every other disagreement in this model is loud — `form` and
   * `region` throw on a name the species does not have, `#assertMutable` throws after `freeze` — so this one is too.
   */
  #createForm(name: string) {
    this.#assertMutable();

    if (this.#forms.has(name)) {
      throw new Error(`${this.#name} already has a ${name} form — declare each one once in pokedex.js`);
    }

    const variant = this.#variant(`${this.#name} (${name})`);
    this.#forms.set(name, variant);
    return variant;
  }

  /** Creates this Pokemon as one region sees it and files it under that region, refusing a repeat as `#createForm`. */
  #createRegion(region: string) {
    this.#assertMutable();

    if (this.#regions.has(region)) {
      throw new Error(`${this.#name} already has a ${region} variant — declare each one once in pokedex.js`);
    }

    const variant = this.#variant(`${region} ${this.#name}`);
    variant.#region = region;
    this.#regions.set(region, variant);
    return variant;
  }

  /** A form of this species, starting from where the species stands. */
  #variant(name: string) {
    const variant = new Pokemon(this.#dex);
    variant.#name = name;
    variant.#region = this.#region;
    variant.#shinyEligible = this.#shinyEligible;
    variant.#spawns = this.#spawns;
    variant.#released = this.#released;
    variant.#legendary = this.#legendary;
    variant.#mythical = this.#mythical;
    variant.#baby = this.#baby;
    variant.#regional = this.#regional;
    variant.#ultraBeast = this.#ultraBeast;
    return variant;
  }

  toJSON() {
    return this.#dex;
  }

  /**
   * Its name, for reading in a message or a log — a string coercion, where valueOf below hands back the number.
   */
  toString() {
    return this.#name;
  }

  valueOf() {
    return this.#dex;
  }
}
