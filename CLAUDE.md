# CLAUDE.md

- **Give every subtask its own worktree.** A subagent takes `isolation: "worktree"`; a session enters one with
  `EnterWorktree`. Two agents in one checkout collide — they edit the same file at the same time, and a `git add --all`
  from either commits the other's half-finished work. Note that a new worktree branches from `origin/master` unless
  `worktree.baseRef` is `head`, so it will not contain unpushed commits.
- **Commit staged changes.** Staged work is finished work. Stage the paths you touched rather than the whole tree, so a
  commit carries your change and nothing else.
- **`html-validate`'s `prefer-native-element` does not know about ARIA widgets.** It reads `role="listbox"` and asks for
  a `<select>`, which is the one element a combobox's popup cannot be — a `<select>` owns its own popup and its options
  are not focusable rows an `aria-activedescendant` can point at. The rule is right about a `role="button"` on a `<div>`
  and wrong here, so take the exception at the element rather than switching the rule off in `.htmlvalidate.mjs`:
  `<!-- [html-validate-disable-next prefer-native-element -- reason] -->` on the line above keeps the reason where the
  next reader will be standing. Watch its width, since that comment is a comment and
  [nothing reflows one](#checking-the-pages-in-a-browser).

## Types

Everything here is TypeScript, and the line between the two halves is **does this file emit**. `src/` is checked by
`tsc` and bundled by esbuild into `dist/src/`, which Pages deploys, so every specifier in it names the `.js` file a
browser could have fetched rather than the `.ts` file on disk; `scripts/` never emits at all — Node runs it by stripping
types in place — so Node resolves its specifiers literally and a value import from `src/` has to name the `.ts` file.
Both halves are `erasableSyntaxOnly`, so neither gets an `enum`, a `namespace` or a parameter property. A data change
still lands on `master` directly — adding a species to `src/filters/shiny.ts` is one line — but it is no longer served
as written: `pages.yml` runs `pnpm build` and deploys what comes out, so what a browser fetches is a bundle of its
page's whole graph, and `pnpm lint:types` is that same build rather than a separate check over it.

- **`src/recurring-types.ts` is in neither half, and `tsconfig.shared.json` is what holds that.** `src/events.ts`
  imports it and so does `scripts/build-ics`, so it must assume neither DOM nor Node. A third project with no `DOM` in
  its `lib` and an empty `types` is what says so, and both of the other two reference it — so a `Document` or a
  `process` creeping in is an error in that project rather than something only one consumer happens to notice.
  `src/countries.ts`, `src/generated.ts` and `src/types.d.ts` are in it for the same reason.
- **A `.ts` file ignores a JSDoc annotation entirely, so a rename is not a conversion.** Renaming `events.js` before
  converting its tags produced about 90 errors — `TS7006`, `TS7005`, `TS7034`, `TS7053`, `TS7022` and `TS7031`, with a
  tail of `TS2345` and `TS2339` against `never` — because the JSDoc that was authoritative under `checkJs` becomes inert
  comment the moment the extension changes. There is no half-way state to land in: the tags and the extension move
  together, per file.
- **`tsc` erases a `type` or an `interface` together with its docblock, which is the largest thing the conversion cost
  the emitted output.** A `@typedef`'s prose was a comment in a file the browser fetched; the same prose above a type
  alias is deleted by the compiler. That is most of the 995 lines the conversion took out of `dist/`, and it is not a
  regression, since the prose is still in `src/` where a reader is. Two smaller effects travel with it, both of which
  look like behaviour changing until they are read: deleting a comment between two statements can join them into one
  emitted line, and a docblock on a class field _survives_ where a `@type` comment did not, so `Reader#handles` gained
  six lines of prose in the output rather than losing them.
- **`useDefineForClassFields` hoists state out of a constructor, and the way to show that is inert is the bytes.** Under
  `target: ES2023` a `constructor() { this.out = []; … }` emits as field declarations, so `src/java-serialization.ts`
  reads very differently in `dist/` from the file it replaced. It is safe because none of `Box`, `Reader` or `Writer`
  extends anything — but that is an argument, not a measurement. The measurement is driving the baseline emit and the
  new one over the 14-root corpus and getting `IDENTICAL` back, whole-corpus sha256 `17ee3e5e`. A file whose contract is
  the bytes it writes has a cheap proof available; use it rather than reasoning about field order.
- **A directive stops being needed when the syntax becomes real, and ESLint says so.** `class Box` held only a
  constructor in the JSDoc idiom, so `no-extraneous-class` fired and carried an `eslint-disable-next-line`; with
  `code: BoxCode` and `value: BoxValue` declared it is a genuine class, the rule goes quiet, and the directive itself
  becomes an `Unused eslint-disable directive` warning. Read that warning as the rule reporting that its own reason has
  expired.
- **A `files` glob matching nothing is silent, and the tools disagree about which way that fails.** Prettier covers
  `.ts` by default, so files converted ahead of the tooling were being checked all along and simply failing; whereas
  `eslint.config.mjs`'s browser-globals block named `src/**/*.js` and therefore matched not one of them, which reads
  exactly like a clean lint. Move such a glob in the same commit as the rename — and note that
  `.github/workflows/calendar.yml`'s `paths` filter is the same hazard with no linter over it at all, where a stale path
  stops the trigger firing and reports nothing whatever.
- **A table's type follows how it is indexed, not what it holds.** `src/countries.ts` is `Record<string, Country>` and
  `SPELLINGS` in `src/pokemon/names.ts` is `Record<string, string>`, not unions of the countries and constants they
  hold, because both are indexed by a value that only exists at run time: a `<pgr:country>` read out of a GPX file, a
  constant handed to `nameOf`. A union of the keys would make every such lookup an error. It would cost as well, since a
  data change [lands on `master` on its own](#landing-a-change) and enumerating the keys makes every such edit a type
  edit too — and buy nothing, because the key sets that matter are already held better than a type could hold them:
  `validate-gpx.mts` reads `COUNTRIES` against the GPX files in both directions, and `nameOf`'s `??` says outright that
  a constant absent from `SPELLINGS` is the ordinary case. The index signature is what the consumers wanted in any case.
  `COUNTRIES[country]?.code` was a `TS7053` implicit `any` in both `app.ts` and `backup.ts` before it and is a checked
  `Country | undefined` after, which is what those `?.`s were written for.
- **Which is why `POKEMON` is left unannotated.** It is indexed by a literal written in source — `POKEMON.PANPOUR` in a
  filter — so the object literal _is_ the enumeration, and inference names all 1,025 keys for free. That is the check
  the constants exist for, and it works: `POKEMON.PANPOURR` is a `TS2551` against a type reading
  `'{ BULBASAUR: Pokemon; … 1017 more …; PECHARUNT: Pokemon; }'` and suggesting `PANPOUR`. A `Record<string, Pokemon>`
  here would throw that away for nothing, since adding a species adds the key and its type in the same line.
- **`satisfies` is the third answer, for a table read both ways.** `CONTROL_RESETS` in `src/pgsharp/controls.ts` is
  indexed at run time _and_ by a literal: `backup.ts` walks it with `Object.entries` and also names
  `CONTROL_RESETS.resetFeeds.hlfeeds` in source. An index signature serves the first and throws the second away, because
  `noUncheckedIndexedAccess` reaches dotted access as well. Measured six runs: the same shape under a plain annotation
  costs two errors at that one line — a `TS18048` and a `TS2345` — and catches nothing the shape check does not, where
  `satisfies` costs nothing and hands back the inferred keys. What either form buys is the value that is neither a Java
  Float nor a filter string: a stray `iconX: true` is
  `TS2322: Type 'boolean' is not assignable to type 'string | number'` on the entry itself, and silent unannotated,
  since the codec's writer `switch` catches it no earlier than run time. So read the two bullets above as a question
  about indexing and this one as the way out when the answer is "both".
- **A mapped type is what a table indexing a class by a string id wants.** `pokedex/entries.ts` files a species under a
  category by reading `pokemon[id]`, and the honest type for that `id` is not `keyof Pokemon`: the class carries a
  builder beside almost every flag — `isRegional` and `region` either side of `regional` — and a method is truthy for
  every species, so a category naming one would file the whole dex under it. `keyof Pokemon` accepts both of those
  **silently**, where `{[K in keyof Pokemon]: Pokemon[K] extends boolean ? K : never}[keyof Pokemon]` answers
  `TS2820: Type '"region"' is not assignable to type 'Flag'. Did you mean '"regional"'?` for each. It rejects `'dex'`
  and `'variants'` as `TS2322` and admits `'released'`, `'spawns'` and `'shinyEligible'`, so the union is the eight
  boolean getters rather than the five categories the page shows — which is the right answer rather than a loose one,
  since nothing in `Pokemon` says which of them a page calls a category, and a type that did would be the page's own
  list wearing the class's name.
- **Leave a constant to inference.** `export const GPX_PATHS = 'gpx-paths.json'` already has the literal type
  `'gpx-paths.json'` and annotating it `string` would only widen it; `src/pgsharp/scan-config.ts` is the same, every
  field a literal and its one consumer stringifying the object whole. An annotation earns its place by saying something
  inference cannot — an index signature, a `readonly`, a parameter — not by restating what it has already got right.
- **An annotation reporting nothing today still earns its place if it can be shown to reject something.** The four
  `src/filters/*.ts` hunt lists are `ReadonlySet<Pokemon>` and added not one error when annotated, because the lists are
  correct; the case for them is what they catch, measured by putting a stray `42` in each. All four answer
  `TS2322: Type 'Set<number | Pokemon>' is not assignable to type 'ReadonlySet<Pokemon>'`, where the same stray in the
  unannotated file was silent and the project stayed at 421. That silence cost something, and asymmetrically:
  `pgsharp/filters.ts` catches it at run time, because `species()` runs `instanceof Pokemon` over every member and
  throws `species #495 is not a POKEMON constant`, while `pokedex/entries.ts` has no guard at all and only asks
  `members.has(pokemon)` — so the stray is a member nothing can equal and the hunt quietly stops wanting what was meant.
  A Set holds by identity, so `25` never matches `POKEMON.PIKACHU` however much it looks like it should. The `readonly`
  is the other half inference cannot say: both consumers only read, and `.add` and `.clear` are `TS2339` now.
- **Where rejecting is not in question, localising still is.** `readonly Group[]` on `GROUPS` reports nothing when added
  and nothing is wrong with a table that has no type, so the case for it is the two-sided measurement above — and half
  of it comes back caught either way. A term with no `label` is a
  `TS2741: Property 'label' is missing … but required in type 'Term'` on the term itself with the annotation, and
  without it the same mistake surfaces forty lines down as a `TS2345` at a consumer, against a 400-character union of
  all fifteen groups' inferred shapes. Same defect, unreadable message, wrong file. So measure four runs rather than
  two: the stray alone, and the stray with the annotation removed — each against its own baseline, since removing an
  annotation moves the count in its own right. Dropping the `State` return type from `emptyState` _cleared_ four errors
  in `search/builder.ts`, because those four are the `state.ranges.get(id) ?? {}` looseness that only exists once
  `Bounds` is real. An accumulator is the cheapest instance of the same thing and has a number on it: a stray pushed
  onto `dedupeByName`'s `const out: T[] = []` is one
  `TS2345: Argument of type 'string' is not assignable to parameter of type 'T'` at the push, and **five** errors
  without the annotation, the first of them about `byName`'s signature — because an un-annotated `const out = []` is an
  evolving array type that widens to `(T | string)[]` from the pushes, so the defect is reported at every consumer
  instead of at the line that is wrong.
- **A reversion has to be posed so that what it measures is the annotation.** Removing `<T extends {name: string}>` from
  `dedupeByName` while `out` was still declared `T[]` answered `+1 TS2304: Cannot find name 'T'`, which measures an
  unresolved name and says nothing about the generic. The honest reversion is the alternative the annotation was chosen
  over — a structural `readonly {name: string}[]` parameter with `out` to match — and that costs **+3 `TS2345`**,
  because the caller sorts and timezones what it hands back and a parameter naming only the field the function reads
  answers with only that field. Treat a `TS2304` or a `TS2552` out of a reversion as a sign the reversion is wrong
  rather than as the measurement.
- **Name a type from another module with `import type`, never a value import.** It is erased before anything runs, so it
  costs nothing in the output — which is why the request-counting that used to decide this no longer applies: a JSDoc
  `@import` was a comment and an `import type` is syntax that leaves no trace behind, and the two cost the same. What
  the real import buys is a check. An unused `@import` was invisible to `tsc` **and** to ESLint, where an unused
  `import type` is reported by `@typescript-eslint/no-unused-vars`; `tsc` still says nothing, `noUnusedLocals` being
  deliberately unset so that the two tools have separate jobs rather than overlapping ones. `pokedex/page.ts` lost a
  `Flag` it had been importing unused that way, which nothing in the old idiom could have told us.
- **An annotated default export has to be bound to a name first.** `export default` takes an expression, so there is
  nowhere for an annotation to sit, and `countries.ts`, `recurring-types.ts` and all four `filters/*.ts` therefore
  declare a `const` and export it on the next line. `readonly` is the same constraint one step along: on an expression
  it could only be asserted with an `as`, where on a declaration it is checked. A `// prettier-ignore` is no longer in
  competition for that node, since it guards the `const` the annotation is part of — but the way that was established is
  worth keeping, because Prettier reporting a hand-spaced list as clean says nothing until you have watched it complain
  with the ignore removed.
- **A type declared inside a function is function-scoped, so `src/java-serialization.ts` exports none of its own.** Its
  whole body is an IIFE assigned to `export const JavaSer`, and that is as true of a `type` or an `interface` as it was
  of a `@typedef`. There is nothing to import, so a consumer either writes the structural type out or leaves the value
  opaque — which is why `downloadBytes` takes a `Uint8Array<ArrayBuffer>` rather than a named alias and the click
  handler's `const root = new Map()` stays a `Map<any, any>` rather than claiming `JavaMap`. What no longer follows is
  the arithmetic that used to keep a tiny _value_ duplicated: `said` was written out in both `src/app.ts` and
  `src/pgsharp/backup.ts` because the two pages load separate graphs and, while `tsc` emitted one file per module, an
  `errors.ts` between them would have cost each page a real request — 6 for `map.html` rather than 5 and 16 for
  `pgsharp.html` rather than 15, measured. Bundling inlines it into both for nothing, so `src/errors.ts` exists and the
  exception is gone. Read it as the shape of the argument rather than as a standing licence to duplicate: what decided
  it was a request, and nothing about the two _pages_ changed.
- **The obvious annotation is sometimes weaker than inference, and `Uint8Array` is the trap.** It has taken a type
  parameter since TypeScript 5.7 — `interface Uint8Array<TArrayBuffer extends ArrayBufferLike = ArrayBufferLike>` — and
  the default is the _wide_ one. So `bytes: Uint8Array` widens what the caller had: `JavaSer.dumps` returns
  `Uint8Array.from(…)`, already a `Uint8Array<ArrayBuffer>`, and a `BlobPart` accepts only an `ArrayBuffer`-backed view
  because a `SharedArrayBuffer` cannot be transferred into a Blob. The annotation therefore _created_ the one error it
  was added to prevent, `TS2322: Type 'Uint8Array<ArrayBufferLike>' is not assignable to type 'BlobPart'`. Naming the
  buffer is the fix. Read a new error appearing directly beneath an annotation as a question about the annotation, since
  a generic with a permissive default is the general case and the typed arrays are only where it bites first.
- **A `this` type is sound on a return and unsound on a field.** `Pokemon`'s `#declared` and `#target` are seeded from
  `this` in the constructor, so inference made them polymorphic — and every value they hold after that is something
  `#variant` built with a bare `new Pokemon`, which is why eight
  `TS2322: Type 'Pokemon' is not assignable to type 'this'` sat in that file before a single annotation was added to it.
  Naming `Pokemon` on the two fields cleared all eight. The builders' own `return this` stays inferred, because there it
  is true: they hand back the receiver, which is what keeps a chain typed as whatever it started as.
- **Annotate from the inside out, because a return type is a claim nothing checks while the body answers `any`.**
  Measured in two steps: with the parameters annotated but `#forms` still a bare `new Map()`, `form()`'s its `Pokemon`
  return type was satisfied by the `any` a `Map<any, any>` hands back from `get`. Typing the field is what made the
  return mean anything — and it then wanted `form` restructured, because a `has` and then a `get` are two lookups the
  checker cannot join. Nothing at the type level says the two calls asked about the same key, so `get` still answers
  `Pokemon | undefined` however the `has` above it went; read the result instead and the narrowing is real, which is the
  check the throw was already making.
- **`noUncheckedIndexedAccess` makes that a rule rather than a Map's quirk, and dotted access is not exempt.** A
  `Record<string, T>` answers `T | undefined` to `r.value` as much as to `r['value']`, and a `Uint8Array` answers
  `number | undefined` to `bytes[0]` — all three probed, all three a `TS2322` against an annotation of `null`. So every
  bounds test in `src/java-serialization.ts` was the shape `form()` had been, a length test and then an index with
  nothing joining them. Reading the slot instead _is_ the bounds check, because a slot past the end and a slot below the
  start both answer `undefined`, and it is one lookup rather than two: `Reader#u1`, `decodeMutf8`'s two length tests
  collapsed into a single `byte()` accessor, `refHandle`'s table lookup and `object()`'s `BOX_BY_CLASS` all went that
  way. Each is load-bearing rather than tidier, measured by reverting them one at a time — `TS18048` on `u1`'s callers
  and inside `decodeMutf8`, `TS2339: Property 'value' does not exist on type 'Handle'` where the union goes unnarrowed,
  and `TS2345: Argument of type 'FieldValue | undefined' is not assignable to parameter of type 'BoxValue'` on the box.
  `Array#pop` is the same answer from a different cause: it is declared `T | undefined` whatever the flags say, so
  `parts.pop()` is a `TS2345` against a `string` parameter even where `String#split` guarantees an element. `?? ''` is
  the inert fix and says as much. `Promise.allSettled` is the same shape one level up and the costliest instance of it:
  `files[i]` read beside `results[i]` answers `string | undefined` however long either array is, because that positional
  correspondence lives in the specification rather than in the type — and `res.reason` is `any`, so the `e.message`
  taken off it was never checked at all. Settling each file's outcome inside its own callback makes the pairing
  structural, and attaches the rejection handler as that fetch starts rather than once every earlier file has settled. A
  tuple is the one exemption worth knowing: `a[0]` and `a[1]` on a `[number, number]` are `number`, not
  `number | undefined`, which is half of why `coordsOf` in `src/app.ts` hands back the pair as a tuple.
- **Hold the node you made rather than asking the document for it again.** `search/builder.ts` appended a chip's glyph
  span itself and then read it back with `node.querySelector('.state')`, which answers `Element | null` — the file
  asking the DOM a question it already knew the answer to and paying `TS18047: 'glyph' is possibly 'null'` for it.
  Carrying the span in the `Chip` beside the button removes the question rather than answering it, and
  `from.closest('.range')` is the same shape one step along: the row `buildRanges` had just built, asked for the long
  way round, at `TS2531: Object is possibly 'null'`. Both measured by reverting them one at a time. It is the bullet
  above with the lookup in the document rather than in an array — a query is not the way to reach something you are
  already holding — and `els.suggestions.children[active]` is the third instance, where reading the slot replaced an
  `active < 0` test and the unjoined index after it.
- **Naming an element interface rejects only a tag that is missing something, and the relation is asymmetric.**
  `Chip.glyph` is an `HTMLSpanElement` and `glyph: el('div')` type-checks clean: `HTMLSpanElement` adds nothing at all
  over `HTMLElement` while `HTMLDivElement` adds a deprecated `align`, so a div structurally _is_ a span. The other
  direction is caught, `RangeRow.row` being an `HTMLDivElement` and a span in its place
  `TS2741: Property 'align' is missing in type 'HTMLSpanElement' but required in type 'HTMLDivElement'`. So such a
  typedef is worth having for what it tells a reader and for the members it does carry — `Chip.node` as an
  `HTMLButtonElement` rejects a div over `command`, `disabled`, `form` and 17 more — but do not expect it to police
  which tag was passed, and probe the direction you care about rather than assuming it cuts both ways.
- **A deletion is proved by the two measurements a mutation cannot make.** `buildPresets` held a loop over
  `preset.ranges`, which no preset carries: `Preset` declares `text`, `include` and `exclude`, and the `PRESETS`
  docblock enumerates the same three, so it was walking `Object.entries(undefined ?? {})`. Nothing is left to break once
  it is gone, so say instead that it was dead and that it cannot come back unnoticed — put the loop back with a `throw`
  in it and watch the corpus click the preset, over a range it has already set, without tripping it; then add `ranges:`
  to a preset and watch
  `TS2353: Object literal may only specify known properties, and 'ranges' does not exist in type 'Preset'`, silent
  without the `readonly Preset[]` on `PRESETS`. The annotation is what makes the deletion safe rather than merely tidy.
- **Where a type cannot pair two fields, the guard belongs where they are finally used together.** `Box` carries a
  `code: BoxCode` and a `value: BoxValue`, so `b.code === 'I'` cannot narrow `b.value` to a number — a class holds no
  discriminated pairing across two fields, and `JavaSer.box('J', 5)` type-checks clean as a result. The writer's
  `switch` is therefore the type: it asks `typeof b.value` per code and throws, which is worth having rather than merely
  tidy, since `box('I', 'x')` wrote four zero bytes for `'x' >>> 24` and 163 bytes of valid-looking stream before it.
  Two shapes were weighed and rejected as more machinery for less: a type parameter with a conditional type still cannot
  infer `C` from `b.code === 'I'`, and overloads on the public `box` constrain the caller while leaving the writer —
  where the bug was — unchecked. What the type _can_ say, say: `classDesc`'s `superName, superUid` became one optional
  `superclass` object, because nothing said the second was present whenever the first was, and passing
  `{ name: NUMBER.name }` alone is a `TS2345` now.
- **Where the type _does_ pair the fields, narrow on the object and test against `null` rather than for truth.**
  `Pokemon#variants` is the discriminated union `Box` above is not —
  `{region: string, form: null, pokemon: Pokemon} | {region: null, form: string, pokemon: Pokemon}` — and two things
  still went wrong with it in `pokedex/entries.ts`. Truthiness does not discriminate a `string | null`, because `''` is
  a falsy `string`: `variant.region ? … : formNameOf(variant.form)` is
  `TS2345: Argument of type 'string | null' is not assignable to parameter of type 'string'`, the falsy branch being
  unable to rule out the member whose region is empty, where `variant.region !== null` has no such hole and clears it.
  And destructuring throws the pairing away, since the correlation lives in the union of objects rather than in either
  field: narrowing a `const { region }` says nothing whatever about a separately-bound `form`. So keep hold of such a
  union by the object, and reserve truthiness for a type with no falsy inhabitant to fall through.
- **A loop variable takes its type from its initializer.** `for (let d = desc; d !== null; d = d.super)` infers `d` as
  `ClassDesc`, because `desc` is already narrowed non-null, so the walk up to the `null` above `java.lang.Object` cannot
  assign to it — `TS2322: Type 'ClassDesc | null' is not assignable to type 'ClassDesc'`. Seeding from `desc.super` with
  `desc` pushed ahead of the loop needs no annotation at all.
- **A module-scope `let` assigned only from inside a function is `any`, and both of its readers go unchecked.**
  Inference takes such a binding's type from what is written to it _at module scope_, so `let toastTimer;` in
  `src/app.ts` — written in `toast()` and nowhere else — was a `TS7034` on the declaration and a `TS7005` on the use,
  and the `clearTimeout` and `setTimeout` either side of it were checked against nothing. Declaring it
  `number | undefined` is what says it, and `undefined` rather than `null` because that is already what `clearTimeout`
  takes for "no timer". This is the one case where an annotation on a variable is not restating what inference got
  right: there is nothing for inference to read. Which cuts the other way inside a function, and the two look alike
  enough to be worth naming together: `let tz = null;` in `applyTimezones`, written and read in the same body, gets
  control-flow inference rather than `any`, so a stray `tz = 42` is the same
  `TS2322: Type 'number' is not assignable to type 'string'` with a `string | null` annotation on it and without. That
  annotation was written and then removed on the measurement — it restates what inference already has. The distinction
  is the scope and where the writes are, not the `let` or the `null`, so measure rather than pattern-match on the
  declaration.
- **`filter(Boolean)` does not narrow, and two other array idioms lose the type the same way.** TypeScript infers a type
  predicate from `filter((span) => span !== null)` and nothing at all from `filter(Boolean)`, so the latter hands a
  `(Span | null)[]` to something wanting `Span[]` — one such call was every `'possibly null'` error in
  `search/optimise.ts`. `flatMap` is that shape one step along: a callback answering `Span[] | null` matches
  `U | ReadonlyArray<U>` twice over, so `U` widens to `Span | null`, where `?? []` in the callback leaves
  `Span[] | never[]` and `U` is `Span`. And a pair of pairs is not a list of pairs —
  `for (const [key, set] of [['i', a], ['x', b]])` types both bindings `string | Set<string> | undefined`, where
  `Object.entries({ i: a, x: b })` is a `[string, Set<string>][]` and destructures as one. All three are the same
  lesson: say what the array holds wherever the idiom cannot. `pokedex/page.ts` carries both of the ways that last one
  bites: `[[$.flags, FLAGS], [$.hunts, HUNT_FLAGS]]` is the union above, at a `TS2488`, a `TS18048` and a `TS2339`,
  while the two search links' pairs of a label and a term hold a union of two strings that costs nothing and are _still_
  `string | undefined` per element under `noUncheckedIndexedAccess`, which `encodeURIComponent` rejects. An object per
  row rather than a pair answers both, and reads better at the loop head than a destructured pair did.
- **A contextual type on an array reaches the literals written beneath it and stops at a `map`.** `readonly Toggle[]` on
  `FLAGS` in `pokedex/page.ts` types the three objects spelled out in the literal, so their `(entry) => entry.shiny`
  callbacks are checked against `Toggle` with no annotation of their own — and it reaches neither the objects a spread
  `...CATEGORIES.map(…)` contributes nor `HUNT_FLAGS`, built by a `map` of its own, whose callback parameters stayed
  `TS7006` implicit `any` until each `map` said what it answers with a `Toggle` return type of its own. So read such an
  annotation as covering what is typed out below it rather than everything that ends up in the array.
- **A hoisted `function` does not see a module-scope narrowing; an arrow does.** `const DEX = RANGES.find(…)` above a
  `throw` on `undefined` leaves `DEX.max` clean inside an IIFE and `TS18048: 'DEX' is possibly 'undefined'` inside an
  `export function`, because a declaration could be called before the narrowing ever ran. So a guard over a table lookup
  belongs inside the function that needs it rather than at module scope: `search/optimise.ts` throws on a `terms.ts`
  carrying no `dex` range when it is asked to shorten a query, which is the reading `dom.ts` takes of markup a script
  cannot find its element in.
- **Three `tsconfig.json` files, on purpose.** The libs are disjoint — DOM for `src/`, Node for `scripts/`, neither for
  the files both of them read — so the checker can still say that a browser module reached for something a browser does
  not have. `"types": ["leaflet"]` in the root config is the other half: an empty list would leave `L` undeclared, and
  an unrestricted one lets any installed `@types` package hand Node's globals to a browser module.
  `tsconfig.shared.json` takes the empty list instead, because nothing ambient belongs in a file `scripts/` also reads.
- **One `tsc -b`, and `pnpm lint:types` is the build itself rather than a check beside it.** The script runs
  `pnpm build`, so the tree the lint compiled is the tree that gets deployed and there is no second compilation to
  disagree with the first. Build mode takes the project paths directly — no solution-style config to keep in step —
  reports every project rather than stopping at the first that fails, and follows `references` into the shared one on
  its own. It requires `composite: true` in each, which forces declarations nothing serves, and both those and the
  per-project `tsconfig.tsbuildinfo` are named into `.types/` so that one `rm -rf` clears everything the compiler wrote.
  Naming them was not cosmetic while there was an `outDir`: the default for each is derived from it, which put the build
  cache at `dist/tsconfig.tsbuildinfo` and deployed it to the live site, and the allowlist cannot catch that since it
  governs what is copied in and these are written before it runs. `emitDeclarationOnly` retires the hazard rather than
  the setting — there is no `outDir` left to derive from.
- **`tsc` checks and esbuild emits, which is `emitDeclarationOnly` in both browser projects.** The bundler does no type
  analysis whatever and the compiler writes nothing a browser reads, so the two own disjoint halves of `pnpm build` and
  `dist/src/` has one file per page rather than one per module. That is the point of it: a page used to fetch its graph
  a request at a time, 16 of them for `pgsharp.html`, each a round trip before the next import was even known about — 46
  across the five pages against 5 now, for the same bytes per page. On disk the total grows about 20%, from 368,749 to
  441,989, because a module imported by two pages is inlined into both; code splitting would remove that at the cost of
  a shared chunk being a second request again, which is the thing being bought out.
- **esbuild resolves `'./dom.js'` onto `dom.ts` as well, so the specifier convention is untouched.** That is worth
  knowing precisely because it looks like the sort of thing a bundler would need telling: nothing in `src/` was
  rewritten and no `<script src>` moved. The paths hold for the same reason — `outbase: 'src'` with `outdir: 'dist/src'`
  reproduces the source tree's shape, so `src/pgsharp/backup.ts` lands exactly where `pgsharp.html` was already
  pointing. `scripts/bundle.mts` therefore reads its entry points **out of those tags** rather than listing them, since
  the markup is the authority on which modules are entry points and a list beside it could only drift; a regex matching
  none of them would bundle nothing and exit 0, so it throws on an empty list instead.
- **`charset: 'utf8'`, or every non-ASCII character in a string literal is written as a `\u` escape.** These modules
  carry 184 of them across the five bundles — `✓`, `✨`, `♀`, the type glyphs, the em-dashes in the status strings — and
  escaping all of them is valid, identical JavaScript that simply reads as noise in the output. The two `\u` escapes
  that remain are the ones `src/pgsharp/backup.ts` wrote itself for the MUTF-8 range bounds, which is how you tell the
  setting took: `src/app.ts`'s `·` came back through as a literal `·`.
- **No cycles in the graph is what makes bundling semantically inert here, and it is one query.** Concatenating modules
  into one scope in topological order evaluates them in exactly the order the ESM loader would have, so nothing that ran
  at module scope can move — but only because there is nothing to order ambiguously: 50 value edges over 17 modules and
  not one cycle, with the 6 type-only edges erased before they could contribute. Ask the graph before reaching for a
  browser, since a cycle is the one thing a flattening changes and the five-page suite would report it as a page that
  simply failed to load.
- **Counting that error total needs `--force` and `--pretty false`, and both traps read as a pass.** Build mode says
  nothing whatever about a project it thinks is up to date, so a second `pnpm lint:types` over an unchanged tree prints
  an empty report that looks exactly like a clean one; and the colour codes sit between the two words, so
  `grep -c 'error TS'` answered `0` against the same run that printed `Found 330 errors`. Count from
  `pnpm exec tsc -b --force --pretty false tsconfig.json scripts/tsconfig.json`, and account for the whole delta rather
  than the files you opened — typing `search/terms.ts` cleared three errors in two modules the slice never touched and
  created four in a third, which was a real latent looseness the tables had been hiding. Expect the count to _rise_
  partway through a slice, because typing a leaf is what makes its consumers checkable: `gpx.ts` went 8 to 0 and took
  `app.ts` from 81 up to **83** in the same run, since `eachTrack` yielding a real `Element` made the `<trkpt>`
  `parseFloat` pair an error exactly like the `<wpt>` pair twenty lines below it already was. Read that as the
  measurement it is rather than as a regression — two blocks erroring for one reason are one block duplicated, and it is
  what said to collapse them into `coordsOf`. So annotate leaf-first and judge the slice on the total, not on the
  intermediate.
- **A `scripts/` _value_ import from `src/` has to name the `.ts` file, and this is the trap the whole repository was
  blind to.** TypeScript's `.js`-onto-`.ts` resolution is a fiction for a project that emits: it is how the browser half
  writes `'./dom.js'` and means `dom.ts`. `scripts/` never emits, so Node runs the file by stripping types in place and
  resolves the specifier _literally_ — and `tsc` resolved `'../src/generated.js'` onto its `.ts` sibling and said
  nothing. `pnpm lint` was clean, all six checks, over a `pnpm build:ics` that died of `ERR_MODULE_NOT_FOUND`: `tsc`
  resolved it, ESLint does not resolve imports at all, and `pnpm build` only builds the other half. Only _running_ the
  script could catch it, which is the argument for `build:ics` and `lint:xml` being `package.json` scripts rather than
  documentation. `allowImportingTsExtensions` is what permits the `.ts`, legal precisely because nothing here emits and
  so no specifier has to survive into an output file. A **type** import is exempt and stays `'../src/types.js'`: it is
  erased before Node sees it, and `src/types.d.ts` could not be named any other way, since `'../src/types.d.ts'` is
  rejected outright.
- **Build mode wants every file a project reads listed by the project that reads it, and a `references` entry is the way
  to say it.** `scripts/tsconfig.json` used to name the four shared `src/` files in its own `include`, checking them a
  second time under the Node lib set; now it references `tsconfig.shared.json` and reads that project's declarations
  instead. The files stay environment-agnostic because a project says so rather than because two lib sets happened to
  agree about them.
- **Run a script through pnpm, never as a bare `node`.** `devEngines.runtime` pins the Node floor that guarantees type
  stripping, and it governs only what pnpm invokes — so `pnpm build:ics` is safe where `node scripts/build-ics.mts` will
  fail outright on a Node older than 22.18. Every entry point therefore has a `package.json` script, and `calendar.yml`
  calls that rather than the file.
- **Do not hand-declare `L`.** It arrives from a CDN `<script>` in `map.html`, and `@types/leaflet` declares it with
  `export as namespace L` — a UMD global, invisible from inside a module, which is what `allowUmdGlobalAccess` is for.
  Declaring `const L` in a `declare global` instead looks tidier and does not work: it shadows that namespace, so you
  get `TS2451: Cannot redeclare block-scoped variable 'L'` plus four `Cannot find namespace 'L'` errors from inside
  `@types/leaflet` itself, reported against a file you did not write. `src/globals.d.ts` is where a CDN global _does_
  get declared — `tzlookup`, which no package ships a type for — and it leaves `L` out for exactly this reason. The same
  `allowUmdGlobalAccess` is what lets a type reference reach through: `L.Polyline`, `L.CircleMarker`,
  `L.PolylineOptions` and `L.CircleMarkerOptions` all resolve in a type alias or a parameter annotation with no import
  and no `TS2503`, confirmed by the errors naming `Polyline<LineString | MultiLineString, any>` and `CircleMarker<any>`
  back. What it will not do is guess a tuple: `LatLngExpression` accepts `[number, number]` and an unannotated
  `[lat, lon]` infers `number[]`, which `L.polyline` rejects — so a coordinate pair travelling through this file is
  declared as a tuple at every hop, which is also what buys the indexed-access exemption above.
- **`@ts-expect-error` takes a reason, in the same form as the `html-validate` exceptions above:**
  `// @ts-expect-error -- reason`, at least ten characters. `@typescript-eslint/ban-ts-comment` enforces both the reason
  and the choice of directive — `@ts-ignore` is rejected outright, because it does nothing once the line below it stops
  erroring where `@ts-expect-error` tells you it is no longer needed.
- **`any` is enforced now, where it used to be convention only.** `no-explicit-any` reads TypeScript syntax, so a JSDoc
  `/** @type {any} */` was a comment the rule never saw and the ban could only be asked for. A real `: any` is
  `error @typescript-eslint/no-explicit-any` at the line that wrote it — probed at `src/dom.ts:60`, where `tsc` stayed
  at exit 0 and said nothing about it, which is the division of labour the two tools are set up for. Reach for `unknown`
  and narrow. What the rule still cannot see is an `any` nobody wrote: the `Map<any, any>` in
  `src/java-serialization.ts` is inferred, so it is silent there, and the reason that value is opaque is that a type
  declared inside an IIFE cannot be imported.
- **TypeScript is pinned to 6.x on purpose.** `typescript-eslint` throws on import against TypeScript 7 and takes
  `pnpm lint:js` down with it
  ([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)). TypeScript 6.0.3
  accepts the same configuration and reports the same errors; the whole project checks in about a second either way, so
  the Go compiler buys nothing here worth a broken linter.
- **pnpm 11 gates install scripts in `pnpm-workspace.yaml`, and a `pnpm.ignoredBuiltDependencies` in `package.json` is
  silently ineffective.** Adding esbuild left `ERR_PNPM_IGNORED_BUILDS` and pnpm then refused _every_ command,
  `pnpm exec` included, until the question was answered — and answered in the right file, since the setting moved and
  the block in `package.json` is accepted without complaint and does nothing. Answer it measurably rather than by
  guessing at the privilege: `allowBuilds: {esbuild: false}` is right here because the native binary arrives from the
  `@esbuild/linux-x64` optional dependency and the postinstall only verifies it, which
  `./node_modules/.bin/esbuild --version` answering `0.28.2` with the script ignored is the whole of the proof.
- **Every page reaches the DOM through `src/dom.ts`.** `byId` throws where the markup and the script disagree, so a
  stale id is a broken page at load rather than a `null` travelling until something further along trips over it. Name a
  class only where the code depends on one — `byId('q', HTMLInputElement)` because a `.value` is read off it, a plain
  `byId('grid')` for a container whose tag the script has no opinion about — since the argument states a dependency
  rather than describing the markup. Note that this is the half `tsc` cannot check: typing a `<div>` as an
  `HTMLInputElement` is what you asked for, and only the run-time `instanceof` says otherwise.
- **Two overloads, not one type parameter defaulting to `HTMLElement`.** A type parameter appearing only in the return
  position is inferred from the caller's own annotation, so `<T extends HTMLElement = HTMLElement>` leaves
  `byId('grid')` answering `HTMLInputElement` to anyone who asks for one — the default never applies and the check is
  worth nothing. Verified by probing both forms: the overloads reject it, the default accepts it silently.

## Landing a change

Which route a change takes turns on whether it changes what the code _does_ or only what it is _told_.

- **A data change lands on `master` directly.** A species added to or removed from a filter (`src/filters/*.ts`), a
  `.gpx` file and the index regenerated beside it, an event in `data/events.json`, a country in `src/countries.ts`, a
  `released` or `shinyEligible` flag in `src/pokemon/pokedex.ts` — the lists this repository exists to hold. Single
  maintainer and linear history, so these need no branch and no review: the entry is the whole of the change, and
  `pnpm lint` already says whether it is well-formed and whether the generated files still agree with it. The push is
  still the whole of the publishing too, even though the pages are built now — `pages.yml` fires on `master` and deploys
  what `pnpm build` produces, so a data change needs no local build and nothing is committed from one.
- **A feature or a logic change needs a pull request.** Anything that changes behaviour rather than content: a new page
  or control, a rendering, filtering or sorting rule, the shape of a file the pages read, a script, a workflow, a
  refactor. Branch, push, and open it against `master`.
- **Open the pull request ready for review, not as a draft.** A draft says the work is not finished, and there is
  nothing here that wants parking half-done — a PR exists to be read and merged. Open it when it is ready, and if it is
  not ready yet, leave it unopened.
- **A change that is both is a logic change.** Adding a species to a filter is data; changing how that filter decides
  what to include, even in the same commit as an entry, is not. Where the two are genuinely mixed, the pull request
  covers both rather than the data half going round it.

## Checking the pages in a browser

There is no test suite, and `npm run lint` says nothing about whether a page looks right or a class reaches the element
it was written for. Run `pnpm build` and serve **`dist/`** with `python3 -m http.server`, then drive headless Chrome
over the DevTools Protocol from Python `websockets` — no Playwright or Puppeteer package is installed, though
Playwright's browser binaries are cached. Screenshot for layout, and `Runtime.evaluate` for anything assertable: a
computed colour, a `getBoundingClientRect().left` on two elements that should share an edge, a class present after one
render and absent after the next.

Serving the repository root instead is now a mistake that announces itself, which is worth knowing in both directions:
no page can load at all, because `src/app.js` is not in the checkout. That makes the root the cheapest available
**control** — a suite that cannot be shown failing says nothing, and running it against the root is what shows both that
it can fail and that the artifact is what makes the pages work. Rebuild before every run, since a stale `dist/` is the
edit-not-served trap one level up from the browser cache and disabling the cache does nothing about it.

- **The five-page suite says a module loaded, never that it is right.** Making `Pokemon#region` answer the species
  instead of throwing on a miss left all five pages reporting clean — 74 `.route` rows under `#list` on `map.html`, 82
  `.chip`s on `search.html`, 1,025 `.card`s on `pokedex.html`, `6 of 6` in `#optTally` on `pgsharp.html` and a card per
  event on `events.html` — while the differential over the dex reported 8,183 differences against the same build. Name
  the page and the selector beside each figure, because the numbers do not identify themselves: 82 reads as the
  Pokédex's chip count and the Pokédex has 12, which cost two runs to work out. What the pages do catch is a throw,
  because `filters/shiny.ts` makes 79 `form`, `forms` and `region` calls at module scope and one of them failing takes
  the page down at load. So run both and do not let a 5/5 stand in for the differential; the deliberate break is what
  tells you which of the two a given change needs.
- **`events.html`'s figure is not a baseline.** `src/events.ts` fetches the live upstream ScrapedDuck feed and merges
  `data/events.json` into it, so `#typeFilters` holds one button per distinct `heading` across both and tracks upstream
  rather than the checkout: 17 one morning and 16 that afternoon, with nothing here changed and `events.ts` importing
  nothing from `pokemon/` either way. Derive the number from the two feeds rather than comparing it against a previous
  run — the merged feed had exactly 16 distinct headings — and treat anything else a page fetches over the network the
  same way.
- **Most of `src/` needs no browser: every module but the five entry points imports under `node` outright.** That is the
  strongest check available for anything whose output is a value rather than a rendering — import the old copy of a
  module and the new one side by side and compare them over a corpus. Only the entry points fail, each at module scope
  rather than in its logic: `app.ts` on Leaflet's `L`, and `events.ts`, `pgsharp/backup.ts`, `pokedex/page.ts` and
  `search/builder.ts` on an `HTMLElement` or a sibling of one. Settle which is which by importing rather than by
  grepping for `document` — `dom.ts` names `HTMLElement` and imports fine, because that is a default argument evaluated
  per call, and `gpx.ts` calls `fetch`, which Node has.
- **An entry point cannot be differentialled under Node, so serve both trees and drive one corpus over each.** The page
  is the only interface it has. `git archive <base>` the old tree beside the worktree and `diff -rq` the two, so the
  file under test is the only one that differs and every disagreement is attributable to it; serve each from its own
  `http.server` on its own port, so neither can serve the other's cache; then drive the same interaction corpus over
  both and compare a full snapshot of the page after every step, naming controls by index rather than by id so the same
  step reaches the same control on both sides. 22 scenarios and 111 snapshots read identically for `search/builder.ts`,
  and eleven deliberate breaks were all caught — two of them by a single snapshot each, which is the figure that says
  the corpus is sensitive per step rather than only in aggregate. Two scenarios that look redundant often are not:
  arrowing eleven times down a four-row list wraps `active` back to 0, so `offered[0]` and `offered[active]` agree there
  and only the shorter walk catches Enter taking the wrong row.
- **Where the change alters the markup, the snapshot has to name observables rather than markup.** Typing
  `pokedex/page.ts` deletes `data-dex` from all 1,025 cards and `data-flag` from every chip, holding both in a `Map`
  keyed by the same values instead, so a diff over `innerHTML` would report all 82 snapshots as changed and say nothing
  whatever about behaviour. Name the things the page is _for_ — the visible count, each chip's `aria-pressed`, the
  marks' titles, the dialog's facts and variant rows, `location.hash`, `document.activeElement` — and the two trees are
  comparable again. It follows that no step may reach a control through either attribute either: cards are found by the
  `#0025` they print and chips by index, which is the same control on both sides. `activeElement` is the one worth
  naming twice, because it is what proves a focus handler rather than assuming one — and reading it is also what
  explains a ceiling. Six of the seven closes report the card, `BUTTON.card:#0025Pikachu✨shiny available` after a walk
  through the arrows; the seventh reports `BODY`, because that scenario typed `pika` first and **a hidden element cannot
  take focus**, so `cards.get(133).card.focus()` really runs and lands nowhere. Breaking the handler therefore moves 6
  snapshots rather than 7, which is the DOM's answer rather than a weak corpus — and the reason the `dex !== null` guard
  beside it has to be measured against the checker instead, since removing the call and inverting the guard move the
  very same 6.
- **`SimpleHTTPRequestHandler.directory` cannot be set as a class attribute.** `__init__` assigns it from its own
  keyword argument, defaulting to `os.getcwd()`, so a
  `type('Handler', (SimpleHTTPRequestHandler,), {'directory': str(root)})` is overwritten on every request and both
  ports serve the harness's own working directory. It surfaces as a bare
  `urllib.error.HTTPError: HTTP Error 404: File not found` against the page under test rather than as a server pointed
  at the wrong tree. Subclass properly and pass `directory=` through to `super().__init__`.
- **Two clicks in the same tick say nothing about the timer between them.** Copy sets a 1400ms timer and clears the
  previous one, so clicking twice back to back and reading the label 1.7 seconds later reports `Copy` whether the
  `clearTimeout` is there or not — both timers land inside the wait and both write the same word. Stagger the pair
  across the interval instead: click, wait 1200ms, click, wait 350ms, so an uncleared first timer fires _between_ the
  second click and the read. That step is the only one of the 111 that caught dropping the call — the five snapshots of
  the unstaggered scenario beside it were every one of them blind — and it exists because that was noticed rather than
  because any run had failed. Copying the recipe to another timer is how that goes wrong, because the numbers are not
  the lesson. `toast` holds 1800ms, and click, wait 1600ms, click, wait 350ms caught nothing whatever — 0 of 56 — since
  the driver itself sleeps 0.9s after every action, which put the second click at t=3.4 where the first timer had
  already fired at 2.7. So the call had nothing left to clear and all five snapshots read alike. Draw the timeline with
  that settle counted in and pick the gap off it: 0.7s rather than 1.6 leaves the second click at 2.5 with the timer
  still pending, and the two reads at 3.4 and 3.75, both past where it would have fired and both short of the second.
  Two of the five steps see the call then, where none of them did before.
- **This machine's `curl` wrapper rejects bundled short flags.** `curl -sf` and `curl -s -f` both answer
  `option -sf: is badly used here`, so a readiness check over the two ports is cheaper written as
  `urllib.request.urlopen` in Python than argued with. Watch the obvious repair, too: rewriting `'curl -sf '` to
  `'curl -s -f'` drops the trailing space and produces `curl -s -fhttp://…`, which is the same failure one step along.
- **`src/java-serialization.ts` is the clearest case of that**, because the bytes `dumps` writes are its whole contract:
  `loads` has no consumer, since `pgsharp/backup.ts` calls it only to re-parse its own output as a self-check and throws
  the result away, so the reader's shape is private to the module and only the writer's output is observable. Drive the
  page too for the real data — wrap `URL.createObjectURL` before the module loads, click **Build backup**, hash the Blob
  — but it is the corpus that reaches the branches a synthesized backup never will: `TC_LONGSTRING`, U+0000, a nested
  map, block data spliced into a classAnnotation. And move something the bytes depend on before believing a digest that
  matches: `loadFactor` 0.75 → 0.5 shifted it while the length stayed 117,471, which is what says the digest is derived
  from the codec rather than from the GPX files behind it.
- **Reach one of the reader's guards by patching a valid stream, not by writing bytes by hand.** A truncation is a
  `subarray`, a bad handle is nine bytes, and everything else is cheaper as a patch: renaming the boxed `value` field is
  one byte and leaves a class in `BOX_BY_CLASS` declaring no `value` at all, which is the only way to reach that throw.
  Derive each offset by searching for it and assert it matched once, because the obvious guesses are wrong — the four
  bytes of a boxed `7` are not the last four, since the HashMap's own `TC_ENDBLOCKDATA` follows them. One trap beyond
  that: an `L` field carries its type name as a `TC_STRING` the reader consumes, so retyping a field is a splice rather
  than a poke, and a stream with no back-reference in it is what makes the handle that string claims free to insert. Run
  the messages rather than reading them off the diff. Slice 8's were preserved verbatim by construction except one,
  where the condition genuinely broadened and `declares no value field` became `declares no primitive value field` — and
  the same patched stream is what showed why, since a descriptor naming `value` as an object reference used to read back
  as an `I`-coded box holding the string `'v'` and now throws.
- **A change to the build wants a byte digest, not a page that still renders.** Bundling rewrites every line of the
  output, so a diff over the emitted JavaScript says nothing and the five-page figures only say the modules still run.
  What discriminates is the one contract expressed in bytes: wrap `URL.createObjectURL` from a pre-script, click
  **Generate & download** on `pgsharp.html`, hash what the Blob was handed — and drive the _deployed_ site as the
  baseline, since production is serving the previous build until the merge. 117,459 bytes at sha256 `237886a2` from
  both, which is `src/java-serialization.ts` untouched through a whole change of toolchain. Assert the Blob count as
  well, because an empty `window.__blobs` hashes to nothing and the digest line would simply be absent: 1 against
  `dist/` and 0 against the root control, where the click lands on a button no handler is attached to.
- **Two `chrome-headless-shell` instances fight over the default profile, and the loser answers `/json/list` first.**
  Restarting Chrome between runs is right — a pre-script is registered per browser session and two copies chain rather
  than replace — but without `--user-data-dir` the new instance takes the profile lock the old one has not released, and
  what happens is not a startup error: the port answers, `Page.enable`, `Runtime.enable` and `Network.enable` all
  succeed, and the socket then dies during the first navigation with `no close frame received`. Pass a fresh
  `--user-data-dir` per run, and read a mid-run close as contention rather than as the page.
- **`websockets` closes the connection under you if the probe sleeps.** An `asyncio.sleep` between calls blocks the recv
  loop, so a keepalive ping goes unanswered and the library hangs up with `1011 keepalive ping timeout` — 25 seconds
  waiting for a backup to build is enough. Connect with `ping_interval=None`; these probes drive one page at a time and
  have nothing to gain from a liveness check they are structurally unable to answer.
- **Run `chrome-headless-shell`, not `chrome`.**
  `~/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell` serves the
  protocol fine. The full browser beside it, `chromium-1208/chrome-linux64/chrome`, prints
  `DevTools listening on ws://…` and then dies of a trace/breakpoint trap with `--headless=new`, so the port is gone by
  the time you connect.
- **`/json/version` answers the _browser_ target, which carries neither a `Runtime` nor a `Page` domain.** Its
  `webSocketDebuggerUrl` accepts the connection and then answers every single call
  `-32601 'Runtime.evaluate' wasn't found`, which reads like a protocol version mismatch rather than like the wrong
  target. Take the page target from `/json/list` filtered on `type == 'page'`. And assert `'error' not in msg` on every
  call, because a rejected call read past does not surface where it happened: it surfaced as a `KeyError: 'result'`
  several steps later, in code that looked unrelated to the connection.
- **Send `Network.setCacheDisabled` before navigating.** Chrome serves the CSS and JS it already has, so a re-run after
  an edit reports the _old_ file. This looked exactly like every change having failed — a `::before` with no background,
  a count of zero, `box-shadow: none` — when all of them were in fact fine.
- **`Network.setCacheDisabled` does nothing until `Network.enable` has been sent.** The command is accepted either way
  and answers with an empty result, so the run looks right and quietly serves the stylesheet it already had. A nav.css
  edit read back as not applied — `overflow-x` still `visible`, the same measurements to the pixel — which looks exactly
  like a rule that does not match rather than a file that was never fetched. Enable the domain first, and treat
  measurements identical to the previous run as the symptom.
- **Navigate via `about:blank` before a URL that differs only by fragment.** `map.html#event=…` from `map.html` is a
  same-document navigation: the page does not reload, so the previous run's JavaScript stays live and nothing you have
  edited since is even loaded. Testing fragment handling that way reported it doing nothing at all, because the build
  under test was the one from before the handler existed. Disabling the cache does not help — there is no request to
  make.
- **Screenshot the viewport, not the page.** `captureBeyondViewport` on a long page returns something like 1400×5983,
  which scales down to an unreadable few hundred pixels wide. Pass an explicit height instead.
- **A clip measured from one section's rect covers a column, not a row, and goes stale the moment the probe clicks.**
  The search page lays its groups out as `grid-template-columns: 411px 411px`, so a clip taken from one section's
  `getBoundingClientRect()` and stretched down to a later section's `bottom` captures one column and silently leaves out
  the section beside it — the **Rarity** group was absent from an image of a page that had demonstrably rendered it,
  which looks exactly like a group the table failed to emit. Span every section you mean to see, by the `min` of their
  lefts and the `max` of their rights. Then measure after whatever the probe clicks rather than before: selecting a chip
  grows the output block above the groups, so a clip computed first lands that much high and captures the wrong rows.
- **Match the class names, not the rendered text.** `text-transform: uppercase` does not touch `textContent`, so a
  sidebar row reading `JAPAN` is `Japan` to `includes('JAPAN')`.
- **An accessible name is the rendered text, which is that rule the other way round.** `text-transform` reaches the name
  where it never reaches `textContent`, so `Accessibility.getPartialAXTree` answered `" FAVOURITES"` for a heading whose
  `textContent` is `"⭐ Favourites"` — uppercased, and with the space before the word left behind because only the
  `aria-hidden` span was dropped. Assert what the check is about, which is that the icon is absent from the name, rather
  than that the string matches character for character.
- **A selector that matches nothing reads as a pass.** `document.querySelector('.banner')?.textContent ?? 'NO BANNER'`
  reported no error banner on a page whose manifest fetch had been blocked outright — the markup is `id="banner"`, so
  the query was null either way and the check could not have failed however broken the page was. Assert the node exists
  before asserting anything about it, and confirm a probe can fail: block the request with `Network.setBlockedURLs` and
  watch the banner appear before trusting its absence. A node that _does_ exist is the same trap one step along, because
  every container on these pages ships empty in the HTML and is filled by the module: `#optTally` is an empty `<span>`
  in `pgsharp.html`, so a smoke test reading its child count was satisfied by the zero a page whose module had thrown
  would also report. Assert what the script writes rather than what the markup already carries — `'6 of 6'` in that
  span, 74 `.route` rows under `#list` — and keep a control that breaks one lookup on purpose.
- **`Network.setBlockedURLs` matches the URL as requested, which is percent-encoded.** `backup.ts` fetches through
  `encodeURI`, so the pattern `*Melbourne Zoo, Melbourne, Victoria.gpx*` matched nothing — and a scenario meant to reach
  the third `catch` site instead reported a _successful_ build carrying the same digest as the unblocked one, in the
  same green as the eleven real steps beside it. `*Melbourne*` blocks it. The general form of this is worth more than
  the flag: a probe whose whole purpose is to break something has to be shown breaking it, so assert the failure it is
  there to cause rather than only diffing the two sides.
- **An exemption that covers the field under test is worse than no check.** The differential asserts every step found
  `typeof tzlookup === 'function'`, since a step silently missing the script would compare equal on both sides and read
  as agreement — and the one scenario that takes the script away was therefore exempted by name. That exemption covered
  exactly the observable the scenario existed to move, so when the patch turned out not to work the run reported
  `tz=function`, the unblemished all-six digest and a clean pass. Pair every such exemption with a positive assertion
  that the thing really did happen: `tz` is `function` in the scenario's own first snapshot and `undefined` after its
  patch step, and the status line carries `44 waypoint(s) without a timezone`.
- **`el.hidden` answers the attribute, not the layout.** It reads `true` however visible the element is, so a probe
  asserting it cannot see the one way hiding actually fails: the UA stylesheet's `[hidden] {display: none}` loses to any
  author `display` on the same element. `.newly {display: flex}` is one, so five suites in a row reported
  `#newly hidden=True` while **Mark all as seen** sat on screen at 100×18 and answered `elementFromPoint` with its own
  id — including on every page load, since the markup ships hidden with an empty count. Every element the JavaScript
  toggles `hidden` needs a paired `[hidden] {display: none}` beside whatever `display` it was given, and the probe has
  to read `getComputedStyle().display`, the element's own `getBoundingClientRect()` and what is painted at its centre.
- **A layering bug needs the pixels; `elementFromPoint` will not find it.** Hit-testing does not follow the paint
  promotion `opacity` causes, so the calendar's dimmed neighbouring-month cell — which really did paint over the bars
  crossing into it — was hit-tested as the bar every time, both with the fix and with it reverted. The probe answered 0
  either way and so said nothing. `Page.captureScreenshot` and a small PNG decoder read what was actually painted: the
  bar over the dimmed columns came back rgb(220 136 230) against rgb(192 38 211) for the same bar a column later, and 0
  channels apart once fixed. Its other trap is that `elementFromPoint` answers null for a coordinate outside the
  viewport, and these grids are taller than the window — 21 of 43 bars were below the fold and counted as failures.
- **A warm pixel is not an emoji, because subpixel antialiasing fringes grey text.** Checking that the Favourites star
  had really painted rather than arriving as tofu, a count of pixels above `r 190` and below `b 130` inside its box
  found 547 of rgb(253 216 53), which is the glyph — and then 46 in the iconless heading beside it, whose warmest was
  rgb(254 114 128). LCD text rendering colours the edges of a muted grey glyph, so threshold on the emoji's own body
  rather than on warmth, and keep the control clip: it is what showed the fringe instead of quietly passing both. Note
  also that `Page.captureScreenshot` answers PNG colour type 2 where nothing is transparent, so a decoder hard-coded to
  RGBA throws on the very capture it was written for.
- **Blur before you screenshot, or you will file your own focus ring as a bug.** A probe that calls `focus()` to check
  the keyboard leaves the UA ring painted in every capture after it, and a black `auto 1px` outline rounded to 8px
  across the foot of the controls bar looked exactly like a stray empty text input. One `blur()` took it away. The ring
  was worth looking at all the same, which is the other half of the lesson: the filter disclosure is `flex: 1 0 100%` so
  that it claims a row of its own, which also makes it 941px wide, and an outline on a box that shape reads as a field
  rather than as a focused control however it is coloured. `getBoundingClientRect` answered `941x15` either way and said
  nothing about it.
- **A check on a net figure cancels; assert the per-step deltas.** Reset has to clear three reveals, a type filter and
  the dismissals, so the probe disturbed all five and compared the card count before and after. It read 73 both times
  and the check that the disturbance had happened at all reported a failure — with nothing wrong: the two bucket reveals
  add one event each, hiding Community Day removes two, and a dismissal removes none while `showHidden` is on. 73, 74,
  75, 73, 73 — net zero by arithmetic. Had the code been broken the same check would have said the same thing, which is
  the real cost. Step the disturbance one control at a time and assert each delta, and where a count is all you have,
  prefer one only the control under test can move.
- **A set taken over every row carries the absence as a value of its own.** The suffix telling a family row from the
  species row above it was read as `new Set(rows.map((li) => li.querySelector('.family')?.textContent ?? ''))`, which
  over a list where half the rows are marked is `['', ' (family)']` — so the assertion that the mark reads ` (family)`
  failed on a list that was entirely correct, and would have passed on one where every row was marked. Map over the rows
  that have the thing rather than over all of them. Keep the tally of them separate and assert it as a ratio, since
  `4 of 8` and `6 of 6` are what tell a paired list from a family-only one where either count alone tells you nothing.
- **Measure widths in characters, not bytes, before believing a line is too long.** `awk 'length > 120'` counts bytes,
  so every comment carrying an em-dash reads three columns over per dash and a compliant line is reported as a
  violation. Four of these comments looked too long and only two were. Use `len()` on text decoded as UTF-8, and check
  what the diff actually adds rather than the whole file: thirteen lines already sit at 121. Measuring is not optional,
  because nothing else does it — `prettier.config.mjs` sets `printWidth: 120` and Prettier reflows code and Markdown
  prose to it, but never a `/* */` or `//` comment, so `pnpm lint` is silent on an over-long one. That is how those
  thirteen got in, and how sixteen more nearly went in with the new-event marker. One trap in reading that diff: this
  machine sets `diff.noprefix`, so the header reads `+++ search.html` and not `+++ b/search.html`. A parser anchored on
  that `b/` files every added line under no path at all. It still measures them, so the run looks right and simply
  cannot say which file to fix. Print every line over the limit rather than the widest one per file: reflowing a 121
  uncovers the next paragraph behind it, which reads as a fresh violation appearing out of a change that only shortened
  something. Four of these turned up one at a time before the script was asked for the whole list. That `proseWrap` does
  not follow prose out of the checkout: Prettier resolves its configuration from the file's own directory, so
  `prettier --write` on a commit message or a pull request body drafted under `$CLAUDE_JOB_DIR/tmp` finds no config,
  falls back to the default `proseWrap: 'preserve'` and reports the file unchanged with four lines still at 121. It
  looks exactly like a body that was already well-formed. Refill a scratch Markdown file with `textwrap` and measure it,
  or draft it somewhere the config reaches. Padding that file's tables is the same script's other half and carries a
  trap of its own, since a cell quoting a union type holds an escaped `\|`: splitting a row on every `|` gives it more
  cells than the header has, and the `zip` that pads them then drops the surplus without a word. Four `TS2345` messages
  lost everything after `'string \` that way and the table still came out aligned to the character. Split on `(?<!\\)\|`
  and assert each row has the header's cell count. The check earns its place twice over, because it is the only
  automated reader a block comment has at all: two lines of slice 11 came back at 121 carrying a literal `\u2014` — six
  characters spelling out an em-dash in prose, which `tsc` reads as comment, Prettier never reflows and ESLint never
  sees. Both were one keystroke of habit from the `·` this file legitimately escapes _inside a string literal_. Treat an
  unexpected overrun as a question about the line rather than only about its width.
- **A probe step that carries on from the previous step's state may have nothing left to prove.** Step 11 accepted a
  suggestion, leaving `eevee` in the name box; step 12 then typed `ch` to open the list before blurring, but `eeveech`
  names no species, so the list was already shut and the assertion that a blur shuts it could not have failed. It read
  as a pass in the same green as the ten real ones around it. Establish each step's precondition from a fresh page, and
  print the state you are about to disturb — `open: block 802x252 ['Charmander', …]` is the half that catches this,
  where `open: none` was the bug.
- **A control's effect and what it reports about itself are two assertions, and the second is the one that gets left
  out.** A type chip on the Events page was probed by clicking it and counting the cards that went away, which passed
  against a deliberately broken `typeChips` pairing every chip with the wrong heading: the click handler closes over its
  own `heading`, so the filtering is right whatever the row is holding, and the mispairing surfaces only in the
  `aria-pressed` that a later render writes from that pairing. A chip that filters perfectly and shows itself as on is a
  legend for a set nobody is reading, and no card count can see it. Assert the state of the control you touched, and
  that no other control's moved.
- **Serve the probe its own data where the repository's cannot discriminate.** `data/events.json` is 39 events of one
  heading, so "the chips come out sorted" was a one-element list and "the chip hides its own heading" hid all 31 cards —
  both green, neither able to fail, and the second indistinguishable from a chip wired to any heading at all. A
  `Page.addScriptToEvaluateOnNewDocument` replacing `window.fetch` for the one remote URL answers a crafted feed before
  the module runs, which buys several headings in a deliberately unsorted order, a bucket per `Status` kind, and a
  partial delta instead of a total one. Rejecting from the same patch is how the both-feeds-failed banner gets tested
  without touching the network.
- **`about:blank` owns no storage, so `localStorage.clear()` there throws `SecurityError`.** Navigating via it is
  necessary — anything else risks a same-document navigation — but it has an opaque origin, so the clear has to go
  through the browser rather than the page: `Storage.clearDataForOrigin` with `storageTypes: 'local_storage'` works
  whatever document is loaded. This matters for the Events page in particular, where a first visit marks every event
  seen and writes that, so the second run of a probe is not a first visit and nothing is new.
- **Reach a module-scoped object by wrapping the library, not by hunting for it on `window`.** `src/app.ts` holds the
  Leaflet map in a `const`, so `Runtime.evaluate` finds only the `<div id="map">` and answers
  `map.getZoom is not a function`. Send a `Page.addScriptToEvaluateOnNewDocument` that defines a setter for `window.L`
  and wraps the prototype methods in question: it runs before the deferred module, so it sees every call, and stashing
  `this` on the first one leaves the instance reachable from every later probe. Recording arguments that way is what
  found the deep-link zoom bug — `_resetView` was reached with zoom 12 and the map still finished at 2.147, which ruled
  out the call never happening and pointed at what undid it afterwards.
- **Wrap `value.Map.prototype` inside that setter, and never install a second trap on the `Map` key.** Leaflet 1.9.4
  assigns `window.L` **already fully populated** — the setter logged `set L: object keys=79 Map=function`, so it is not
  the rollup shape where an empty `exports` is assigned and filled afterwards, and `value.Map` is simply there to patch.
  Defending against the other shape is worse than unnecessary, because `Object.defineProperty(value, 'Map', {get: …})`
  over a key that already holds a value _replaces_ that value: with `Map` an uninitialised `let` the accessor never
  fired, `typeof window.L.Map` read `"undefined"` and `L.Map.prototype.setView` was gone for the rest of the page's
  life. The page still drew all 74 paths, because `L.map()` closes over the module's internal binding rather than over
  `exports.Map` — so the probe silently broke the API it was there to read while every figure it _could_ report looked
  right. What gave it away was the wrapper's own output reading `NO MAP` on all 18 scenarios; treat that sentinel as a
  bug in the probe rather than in the page. Two DOM-side observables corroborate the view without `L` at all, which is
  worth having as a control: `.leaflet-proxy`'s `style.transform` carries the centre and zoom as
  `translate3d(593.741px, 532.344px, 0px) scale(2.21527)`, and every polyline and circle marker is an SVG `path` under
  `.leaflet-overlay-pane` whose `stroke`, `stroke-width`, `stroke-opacity`, `fill` and `d` encode style, stacking order
  and screen geometry.
- **A pre-script outlives the run that installed it, and two copies chain rather than replace.**
  `Page.addScriptToEvaluateOnNewDocument` is registered for the browser session, not the connection, so every earlier
  run against the same `chrome-headless-shell` is still firing. They run in the order they were added and each captures
  the previous one's wrapper as its "real" function, so with two copies installed one `URL.createObjectURL` pushes the
  same Blob onto `window.__blobs` twice and a `fetch` wrapper that appends a path to the manifest appends it twice.
  Nothing reports it, because the counts still look like counts. Restart Chrome between runs — `fuser -k 9222/tcp` — or
  hold the identifier the call answers with and send `Page.removeScriptToEvaluateOnNewDocument`; a
  `if (window.__wrapped) return;` guard at the top is worth having as well, since it makes the first copy win
  deterministically.
- **A global a classic script declares with `function` cannot be shadowed ahead of it; overwrite it afterwards.** Taking
  tz-lookup away by installing `Object.defineProperty(window, 'tzlookup', {configurable: true, get: () => undefined})`
  from a pre-script does nothing: the pre-script reported `notz: true, defined: "ok"` and the page still answered
  `typeof tzlookup === 'function'`. CreateGlobalFunctionBinding — unlike `var`'s CreateGlobalVarBinding, which leaves an
  existing property alone — _redefines_ the property whenever what is there is `configurable`, so a configurable
  accessor is exactly what it will replace. What it leaves behind is a non-configurable, writable data property:
  `delete` answers `false` and the descriptor reads `["value","writable","enumerable","configurable"]` with
  `configurable: false`. Writable is the way in, so assign over it as a step _after_ the page has loaded. Two
  assignments reach two different branches and both are worth driving — `undefined` for the `typeof` guard and a
  throwing stub for the `catch` beside it — and since both end at the same counter the two backups must hash alike,
  which is a cross-check neither makes alone. Probe the descriptor before designing around a global; `typeof` after the
  fact is what tells you the patch did not take.
- **A probe script needs `if __name__ == '__main__':` before anything can import from it.** Reusing one corpus's `PRE`
  script from a smaller harness ran the whole 18-scenario corpus as a side effect of the import — three minutes of GPX
  fetches against both ports — and then died on the importing script's own `sys.argv[1]`. And background a probe with
  `python3 -u`: Python buffers stdout to a pipe, so the output file stays empty until the process exits and a run that
  is working reads exactly like one that has hung.
- **A harness that edits the tree in place has to restore on a signal, not only in a `finally`.** Python's default
  SIGTERM handler terminates without unwinding, so stopping the mutation pass mid-run left `const a = entry.latlngs[1],`
  in the worktree where the file says `latlngs[0]` — one character, in a file already 386 lines into a change, and
  indistinguishable from work in progress. Nothing reported it; it turned up by diffing against the pristine copy the
  harness had written beside itself, which is why that copy is the point. Install the restore on SIGTERM, SIGINT and
  SIGHUP as well as in the `finally`, print that it ran, and check the tree is back before believing any figure the run
  produced.
- **A break that survives may be unreachable with the data rather than missed by the corpus, and the two want different
  answers.** Dropping the accent fold from `sortKey` — the `.replace(/\p{M}/gu, '')` after the `NFKD` — moved 0 of 53
  snapshots. Not a weak corpus: exactly one of the 74 favourite names carries a combining mark after decomposition,
  `São Paulo`, and the only other `sa…` names are `San Francisco, CA` and `Santa Monica Pier`. `n` sorts below both `o`
  and the U+0303 the fold would have removed, so São Paulo is last of the three either way, and the fold can only change
  an order where some name's third character falls in `p`–`z`. Derive that condition and state it rather than adding
  data to reach it, since the fold is pre-existing and adding a favourite to exercise a sort is its own change. What the
  pass must not do is let the 0 stand unexplained, because a mutation nothing catches and a mutation nothing _can_ catch
  read identically in the log. The complementary case is in the same run: `dedupeByName` not deduplicating moved 2 of
  53, both inside the one scenario that synthesizes a repeat by appending a path to the manifest — which is how a
  scenario earns its place.
- **A snapshot field no step ever fills compares equal on both trees forever, which reads exactly like agreement.** That
  is [a selector that matches nothing](#checking-the-pages-in-a-browser) one level up, and the mutation pass is the only
  thing that finds it: two breaks in `variantTable` — never appending the header row, never appending a body row — each
  moved 0 of 74 snapshots, and the recorded run says why rather than leaving it to be guessed at. `variantTitle`,
  `variantHead` and `variantRows` were empty in all 74 on both trees, because not one of the eight species the corpus
  opened carries a variant — Bulbasaur, Eevee, Ivysaur, Mew, Phione, Pikachu, Vaporeon and Venusaur, where 125 of the
  1,025 do. The scenario was even named `dialog-variants`. So the differential's 0 differences was honest and said
  nothing whatever about the `head`/`body` rewrite the slice had just made. Extending the corpus is half the fix —
  Tauros `#0128` for a region with forms beneath it and Darmanitan `#0555` for rows that are not released, which takes
  the run to 80 snapshots and 17 variant rows — and asserting that coverage is the other half, since a corpus can
  quietly lose it again. Put the assertion outside the function the mutation pass shares with the differential, so a
  tree broken on purpose still reports how many snapshots moved instead of throwing on the coverage check and being
  counted as caught for the wrong reason. The same hole came back one run later in a subtler shape, which is what says
  to expect it rather than to treat it as one mistake: negating `huntsOf`'s quantifier — `wanted.every(watched)` for
  `wanted.some(watched)` — moved 0 of 80 with every field of every snapshot filled. The field was populated and never
  with a value that could discriminate, because `huntsOf` is called once per variant with a single-element list, where
  the two quantifiers are the same function, and once per entry over the species and all its variants. Ask the data
  before touching the corpus: importing `entries.ts` under Node finds 45 (entry, hunt) pairs wanting two or more members
  and exactly 3 where some but not all are watched — Braviary, Sliggoo and Goodra, each on the shiny hunt with 2 wanted
  and 1 watched. Reachable and missed, so it wants a scenario, where the accent fold's 0 of 53 above wanted a
  derivation. Opening Braviary `#0628` takes the run to 82 snapshots, and that coverage assertion has to name the three
  species rather than an observable, because `variantTable` renders a hunt's label and not its watched state — so
  nothing in a snapshot says a row was answered by two members rather than by one.
- **A harness that turns its own failure into a figure reports its strongest result for its worst run.** The mutation
  pass counted a corpus that threw as having moved every snapshot, reasoning that a break taking the page down at load
  is caught. That is true of `variant.region === null`, where `formNameOf(null)` reaches `titleise(null)` and
  `null.toLowerCase()` throws while `ENTRIES` is still being built at module scope, so the page serves 0 cards and the
  run fails at its _first_ snapshot. It is not true of a browser hiccup at the eighteenth scenario, which was banked as
  `80 of 80` for the one break in the pass that moves nothing at all — `22 of 22 breaks caught`, and it read perfectly.
  A figure and a failure are different kinds of thing, so print the failure as one rather than as a number, retry once,
  since a real module-scope break fails every time and a flake does not, and count the load failures apart from the
  snapshot movements.
- **A view that lands can still be taken away.** Leaflet animates a zoom of fewer than `zoomAnimationThreshold` levels
  as a CSS transition and applies the move at its end, from the centre and zoom captured when it began; `setView` stops
  a pan but not that. So a second view change issued in the same tick wins and then loses, several hundred milliseconds
  later. Probe the map after the transitions have settled rather than straight after the call, or the broken case reads
  as fixed.
- **Kill both by port, never by a pattern you have just typed.** Both processes are named by one — `fuser -k 8931/tcp`
  for the server, `fuser -k 9222/tcp` for Chrome — which matches on the listening socket, so it cannot match the shell
  running it. `pkill -f 'debugging-port=9222'` can and does: it kills that shell, surfacing as a bare exit 144 with no
  output and nothing actually stopped. Moving the patterns into a `teardown.sh` does not save you either, because the
  heredoc writing the file puts them in the same shell's `argv`, so the `pgrep` inside the script matches its own
  parent, which skipping `$$` alone will not catch.

## Cross-checking `src/pokemon/pokedex.ts` against the web

Three sources cover a variant's `released` and `shinyEligible` state. Each has a demonstrated failure mode, so take a
change only where two of the three agree. Checked September 2026.

- **pokemondb.** [`/go/pokedex`](https://pokemondb.net/go/pokedex) and
  [`/go/unavailable`](https://pokemondb.net/go/unavailable) partition the game master between them — the first lists
  what is released, the second what is in the code but not out yet — so a variant on neither is not in Pokémon GO's data
  at all. That is why `isNotReleased()` is right for Hisuian Sliggoo, Hisuian Goodra and Basculegion, which
  `/go/unavailable` structurally cannot show. Best source for `released` and for which forms exist.
  [`/go/shiny`](https://pokemondb.net/go/shiny) marks a released shiny with `*`, but that star list is maintained apart
  from the release data and lags it: it missed shiny Diancie, the Pikipek line, Dhelmise, Nickit, Thievul, Indeedee,
  Duraludon, Orthworm and Flamigo, all of which the other two list.
- **Serebii.** [`/pokemongo/shiny.shtml`](https://www.serebii.net/pokemongo/shiny.shtml) lists only released shinies,
  per form (`Rotom (Wash Rotom)`, `Tauros (Paldean Form - Combat Breed)`), so presence is the signal. It has gaps of its
  own — Centiskorch is absent though its shiny is out, seemingly filed under Gigantamax instead.
- **GO Hub.** `https://db.pokemongohub.net/pokemon/${DEX}` says either `Shiny X is available! ✨` or
  `Shiny X is not yet available`, the cleanest per-species shiny signal going. It says nothing usable about `released`:
  the surrounding prose is boilerplate, word for word the same for Maschiff as for Koraidon.

Reading them:

- **Fetch the raw HTML with `curl` and parse it.** `WebFetch` answers a prompt through a small model, which drops rows
  from the 1,195 that `/go/pokedex` carries.
- **Diff the whole table rather than spot-checking.** Copy `src/pokemon/pokemon.ts`, add a getter over its private
  fields and import the copy of `pokedex.ts`: `as()` has run by then, so every variant reports a name like
  `Hisuian ZORUA`.
- **Compare at dex level, with form names only as a fallback.** `/go/shiny` collapses Unown and Spinda to one card each
  yet lists Vivillon per pattern, so per-card matching reports 28 Unown forms as missing when they are not. The labels
  are the sites' own rather than ours — `Poké Ball Pattern` for `POKE_BALL`.

## Cross-checking `src/search/terms.ts` against the game

Three sources cover what the search box actually accepts, and each has a demonstrated failure mode, so take a term only
where two of the three agree — the same rule as [`pokedex.ts`](#cross-checking-srcpokemonpokedexts-against-the-web).
That rule has already paid for itself twice: `mega4` appeared in one source alone and does not exist, the Mega levels
stopping at `mega3`, and a `remote` the table had carried since it was written turned out to be attested nowhere.

- **PokeMiners' `English.txt`** is the game's own string table and the strongest of the three. The keywords are the 58
  resources whose ID begins `filter_key_`, each on a `RESOURCE ID:` line with its keyword on the `TEXT:` line below —
  which is why a regex anchored to the start of a line finds nothing. It settles a spelling outright:
  `filter_key_raid_remote` is `remoteraid`, and the only `remote` in the whole file is prose about Remote Raid Passes.
  Its failure mode is silence: `galar`, `favorite`, `#`, `evolve`, `cp`, the four sizes and the buddy levels are all
  absent from it and all work, so **presence is strong evidence and absence is none**. It also gives the bare token
  rather than the usable form — `filter_key_special_move` is `special`, where what a reader types is `@special`.
- **The [Pokémon GO Wiki](https://pokemongo.fandom.com/wiki/Search)** carries 185 table rows, each with the client
  version the keyword shipped in, and is the only source that gives the _semantics_: `alola` returns every Pokémon from
  the Alola region rather than the Alolan forms, and `@move` matches the Pokémon that have **not** learned a second
  charged attack. It also shows which keywords take a span — `buddy2–5`, `mega2-3`, `maxguard1-3` — which is what
  decides whether a family belongs in `GROUPS` or in `RANGES`. It has gaps: none of `remoteraid`, `exraid`, `megaraid`
  or `primalraid` appears anywhere on it.
- **The [GO Hub cheat sheet](https://pokemongohub.net/post/guide/pokemon-go-search-bar-cheat-sheet/)** is organised by
  what a player wants rather than by what the client holds, so it is the best source for a chip's label. It is the least
  complete: it drops Kalos from its own list of regions, and never mentions `rocket`, `background`, `fusion`,
  `evolvequest`, `candyxl` or `adventureeffect`. Its content is in 292 `<li>` items and one table with **no `<code>` or
  `<pre>` anywhere**, so a parse looking for code fragments reports zero on a page that fetched fine.

Read the two HTML sources with `curl` and parse them, for the reason the Pokédex section gives. Convert tags to newlines
and print every non-empty line rather than filtering by length, or a two-character keyword is dropped by the filter that
was meant to remove noise.

## What the search data does not settle

Three things anything reasoning about a search string runs into, none of which the term table answers.

- **A partial name has two readings and the sources disagree on which the game uses.** The wiki's table says `T`
  "Returns all Pokémon that begins with T (including nicknames)", where this repository's own help text on `search.html`
  has a partial name matching anywhere in it — `char` finding Charizard as well as Charmander. Only one source speaks to
  it, so the cross-checking rule above cannot resolve it and a reduction is sound only where both readings give the same
  answer: `char` reaches Charmander either way, where `saur` reaches Bulbasaur under one reading and nothing under the
  other. `src/search/optimise.ts` tests that by counting — everything beginning with a fragment also contains it, so the
  begins-set sits inside the contains-set and equal sizes are equal sets — and refuses the fragment where they differ,
  which is what costs `saur` and `mime` their reductions. It is also why the candidates are leading fragments rather
  than fragments from anywhere: `rman` reaches Charmander under one reading and nothing under the other.
- **Nothing here knows which species share an evolution family.** `grep -ric evol src/pokemon/` answers 0 for both
  files: `pokedex.ts` carries forms, regions, rarity, `released` and `shinyEligible` and no evolution links, and the
  families in `src/filters/xxs.ts` are a line break for a human reading the list rather than data, which is what the
  `// prettier-ignore` above it exists to hold. So a `+` prefix cannot be reasoned about — `+charmander` is not
  rewritable as `4,5,6`, nor shortenable to `+charm` by reaching the family through another of its members. It gets the
  name shortening alone, which is sound because the same species reached a shorter way are the same families.
- **The generation group joins with `,`, not `&`.** Nothing is two generations, so `terms.ts` gives it the default OR
  and several generations compose to a single clause — `1-151,152-251`, not two clauses AND'd. Anything folding dex
  spans together therefore unions the generations first and intersects that union with the other sources. Merging them
  can take the ambiguity warning with it as well as the characters: `shiny&1-151,152-251` mixes `,` with `&` and earns
  the caveat, where `shiny&1-251` says the same thing and does not.
