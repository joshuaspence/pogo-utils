# CLAUDE.md

Each entry is a rule and the smallest thing that checks it. The measurements behind them are in the commits that added
them, so reach for `git log` on this file when one looks arbitrary rather than expecting the prose to argue it.

- **Give every subtask its own worktree.** A subagent takes `isolation: "worktree"`; a session enters one with
  `EnterWorktree`. Two agents in one checkout edit the same file at once, and a `git add --all` from either commits the
  other's half-finished work. A new worktree branches from `origin/master` unless `worktree.baseRef` is `head`.
- **Commit staged changes.** Staged work is finished work. Stage the paths you touched rather than the whole tree.
- **`html-validate`'s `prefer-native-element` does not know about ARIA widgets.** It reads `role="listbox"` and asks for
  a `<select>`, which is the one element a combobox's popup cannot be. Take the exception at the element rather than
  switching it off in `.htmlvalidate.mjs`: `<!-- [html-validate-disable-next prefer-native-element -- reason] -->`.
  Watch its width, since that comment is a comment and [nothing reflows one](#checking-the-pages-in-a-browser).

## Types

The line between the two halves is **does this file emit**. `src/` is checked by `tsc` and bundled by esbuild into
`dist/src/`, which Pages deploys, so every specifier in it names the `.js` file a browser could have fetched; `scripts/`
never emits — Node runs it by stripping types in place — so Node resolves its specifiers literally and a value import
from `src/` has to name the `.ts` file. Both halves are `erasableSyntaxOnly`: no `enum`, `namespace` or parameter
property.

### Annotating

- **A table's type follows how it is indexed, not what it holds.** Indexed by a value that only exists at run time it
  wants an index signature, `src/countries.ts` being `Record<string, Country>`. Indexed by a literal written in source
  it wants nothing, since `POKEMON.PANPOUR` makes the object literal the enumeration and inference names all 1,025 keys,
  so `POKEMON.PANPOURR` is a `TS2551` suggesting `PANPOUR`. Read both ways it wants `satisfies`: `CONTROL_RESETS` is
  walked with `Object.entries` and also named in source, and `noUncheckedIndexedAccess` reaches dotted access, so an
  index signature costs two errors at that line where `satisfies` costs nothing.
- **A mapped type is what a table indexing a class by a string id wants.** `keyof Pokemon` admits the builders beside
  each flag and every method **silently**, where
  `{[K in keyof Pokemon]: Pokemon[K] extends boolean ? K : never}[keyof Pokemon]` answers
  `TS2820: Type '"region"' is not assignable to type 'Flag'. Did you mean '"regional"'?`.
- **Leave a constant to inference.** `export const GPX_PATHS = 'gpx-paths.json'` already has that literal type and
  `string` would only widen it. An annotation earns its place by saying what inference cannot.
- **Judge an annotation by what it rejects, and measure four runs rather than two.** The `src/filters/*.ts` hunt lists
  added not one error as `ReadonlySet<Pokemon>`, so the case for them is a stray `42` in each:
  `TS2322: Type 'Set<number | Pokemon>' is not assignable to type 'ReadonlySet<Pokemon>'`, silent unannotated. Removing
  an annotation moves the count in its own right, so measure the stray alone and the stray with the annotation gone,
  each against its own baseline.
- **Pose a reversion as the alternative the annotation was chosen over.** Dropping `<T extends {name: string}>` from
  `dedupeByName` while `out` stayed `T[]` answers `TS2304: Cannot find name 'T'`, which measures an unresolved name; the
  honest reversion is a structural parameter, and it costs **+3 `TS2345`**. Read a `TS2304` out of a reversion as a sign
  the reversion is wrong.
- **Annotate from the inside out, because a return type is a claim nothing checks while the body answers `any`.** With
  `#forms` a bare `new Map()`, `form()`'s `Pokemon` return type was satisfied by the `any` that `get` hands back.
- **Annotate leaf-first and judge a slice on the total.** Expect the count to _rise_ partway through: `gpx.ts` went 8 to
  0 and took `app.ts` from 81 up to **83**, because `eachTrack` yielding a real `Element` made a `parseFloat` pair an
  error like the pair twenty lines below it already was. Two blocks erroring for one reason are one block duplicated.
- **The obvious annotation is sometimes weaker than inference, and `Uint8Array` is the trap.** Its type parameter
  defaults to the _wide_ `ArrayBufferLike`, so `bytes: Uint8Array` widens what the caller had and _creates_ the
  `TS2322 … not assignable to type 'BlobPart'` it was added to prevent. Name the buffer, and read a new error directly
  beneath an annotation as a question about the annotation.
- **A `this` type is sound on a return and unsound on a field.** `Pokemon`'s `#declared` and `#target` seeded from
  `this` inferred as polymorphic, so the eight values `#variant` builds with a bare `new Pokemon` were
  `TS2322: Type 'Pokemon' is not assignable to type 'this'`. The builders' own `return this` stays inferred.
- **Name a type from another module with `import type`, never a value import.** An unused one is reported by
  `@typescript-eslint/no-unused-vars` where `tsc` says nothing, `noUnusedLocals` being deliberately unset so the two
  tools have separate jobs.
- **An annotated default export has to be bound to a name first.** `export default` takes an expression, so there is
  nowhere for an annotation or a `readonly` to sit; `countries.ts` and the four `filters/*.ts` declare a `const` first.
- **A type declared inside a function is function-scoped, so `src/java-serialization.ts` exports none of its own.** Its
  body is an IIFE assigned to `export const JavaSer`, so a consumer writes the structural type out — `downloadBytes`
  takes a `Uint8Array<ArrayBuffer>` — or leaves the value opaque.
- **`any` is enforced, `unknown` is the way out.** A real `: any` is `error @typescript-eslint/no-explicit-any` where
  `tsc` stays at exit 0. What the rule cannot see is an `any` nobody wrote, such as that IIFE's inferred
  `Map<any, any>`.
- **`@ts-expect-error` takes a reason**, `// @ts-expect-error -- reason`, at least ten characters.
  `@typescript-eslint/ban-ts-comment` also rejects `@ts-ignore`, which says nothing once the line below stops erroring.

### Narrowing

- **`noUncheckedIndexedAccess` reaches dotted access too, and reading the slot _is_ the bounds check.** A
  `Record<string, T>` answers `T | undefined` to `r.value` as much as `r['value']`. A `has` and then a `get` are two
  lookups nothing joins, so read the result and narrow on it, as `Reader#u1` and `BOX_BY_CLASS` do. `Array#pop` is
  `T | undefined` whatever the flags say, so `?? ''` is the inert fix. `Promise.allSettled` is the costliest instance:
  `files[i]` beside `results[i]` is `string | undefined` however long either array is, that pairing living in the
  specification rather than the type, so settle each file inside its own callback. A tuple is the one exemption.
- **Hold the node you made rather than asking the document for it again.** `search/builder.ts` appended a glyph span and
  read it back with `querySelector('.state')`, paying `TS18047: 'glyph' is possibly 'null'` for a question it knew the
  answer to. It is the bullet above with the lookup in the document rather than an array.
- **Where a type cannot pair two fields, the guard belongs where they are used together.** `Box` carries a
  `code: BoxCode` beside a `value: BoxValue`, so `b.code === 'I'` cannot narrow `b.value` and `JavaSer.box('J', 5)`
  type-checks clean. The writer's `switch` is therefore the type — worth having, since `box('I', 'x')` wrote 163 bytes
  of valid-looking stream before it. What the type _can_ say, say: `superName, superUid` became one optional
  `superclass`.
- **Where the type _does_ pair them, narrow on the object and test against `null` rather than for truth.**
  `Pokemon#variants` is a discriminated union and `''` is a falsy `string`, so `variant.region ? … : f(variant.form)` is
  a `TS2345` where `variant.region !== null` is clean. Destructuring throws the pairing away.
- **A loop variable takes its type from its initializer.** `for (let d = desc; d !== null; d = d.super)` infers
  `ClassDesc` from an already-narrowed `desc` and cannot then hold the `null` above `java.lang.Object`.
- **A module-scope `let` written only inside a function is `any`; the same `let` inside a function is not.** Inference
  reads such a binding at module scope only, so `let toastTimer;` was a `TS7034` with the `clearTimeout` either side
  checked against nothing. Inside a body it gets control-flow inference and an annotation restates it, so measure rather
  than pattern-match on the `let`.
- **`filter(Boolean)` does not narrow, and two other array idioms lose the type the same way.** TypeScript infers a
  predicate from `filter((s) => s !== null)` and nothing from `filter(Boolean)`; a `flatMap` callback answering
  `Span[] | null` matches `U | ReadonlyArray<U>` twice and widens `U`; and a pair of pairs is not a list of pairs, where
  `Object.entries` gives a `[string, Set<string>][]`. An object per row reads better at the loop head anyway.
- **A contextual type on an array reaches the literals written beneath it and stops at a `map`.** `readonly Toggle[]`
  types the objects spelled out in `FLAGS` and neither a spread `...CATEGORIES.map(…)` nor `HUNT_FLAGS`, whose callback
  parameters stayed `TS7006` until each `map` declared its own return type.
- **A hoisted `function` does not see a module-scope narrowing; an arrow does.** A `const DEX = RANGES.find(…)` above a
  `throw` is clean inside an IIFE and `TS18048` inside an `export function`, since a declaration could be called first.
- **Naming an element interface rejects only a tag that is missing something.** `HTMLSpanElement` adds nothing over
  `HTMLElement`, so a div structurally _is_ a span and `glyph: el('div')` is clean, where a span for an `HTMLDivElement`
  is `TS2741: Property 'align' is missing`. Worth having for the members it carries, not for policing which tag passed.
- **A deletion is proved by the two measurements a mutation cannot make.** `buildPresets` looped over `preset.ranges`,
  which no `Preset` declares. Put the loop back with a `throw` in it and watch the corpus not trip it; then add
  `ranges:` to a preset and watch `TS2353`, silent without the `readonly Preset[]`.

### Building

- **`tsc` checks and esbuild emits, which is `emitDeclarationOnly` in both browser projects.** The bundler does no type
  analysis and the compiler writes nothing a browser reads, so the two own disjoint halves of `pnpm build` and
  `dist/src/` has one file per page: 46 requests across the five pages against 5 now, for about 20% more bytes on disk
  because a module two pages import is inlined into both.
- **One `tsc -b`, and `pnpm lint:types` is the build itself rather than a check beside it**, so the tree the lint
  compiled is the tree that gets deployed. Build mode needs `composite: true`, and both the declarations and each
  `tsconfig.tsbuildinfo` are named into `.types/` so one `rm -rf` clears everything the compiler wrote.
- **Counting the error total needs `--force` and `--pretty false`, and both traps read as a pass.** Build mode says
  nothing about a project it thinks is up to date, and the colour codes sit between the two words, so
  `grep -c 'error TS'` answered `0` against a run printing `Found 330 errors`.
- **Three `tsconfig.json` files, on purpose.** The libs are disjoint — DOM for `src/`, Node for `scripts/`, neither for
  the files both read — so the checker can still say a browser module reached for something a browser lacks. `types` is
  `[]` in the browser project and the shared one and `["node"]` only in `scripts/`: nothing is ambient in a browser
  module now that both libraries are imported by name, and an unset `types` would pull in every installed `@types`
  package instead, which is how Node's globals would reach a browser module.
- **`src/recurring-types.ts` is in neither half, and `tsconfig.shared.json` is what holds that.** `src/events.ts`
  imports it and so does `scripts/build-ics`, so a third project with no `DOM` in its `lib` and an empty `types` is what
  makes a stray `Document` or `process` an error there rather than something one consumer happens to notice.
  `src/countries.ts`, `src/event-feed.ts`, `src/generated.ts` and `src/types.d.ts` are in it for the same reason. A rule
  the page and the feed both apply belongs there rather than in the entry point: the feed URL, `data/events.json`,
  `HAS_ZONE` and `routeSummary` were each spelled twice because the only thing importable from `events.ts` is the DOM.
- **Build mode wants every file a project reads listed by the project that reads it.** `scripts/tsconfig.json`
  references `tsconfig.shared.json` and reads its declarations rather than checking those files a second time under the
  Node lib set.
- **A `scripts/` _value_ import from `src/` has to name the `.ts` file, and this is the trap the repository was blind
  to.** `scripts/` never emits, so Node resolves the specifier _literally_ where `tsc` resolves `.js` onto `.ts`:
  `pnpm lint` was clean, all six checks, over a `pnpm build:ics` that died of `ERR_MODULE_NOT_FOUND`. Only _running_ the
  script catches it, which is the argument for `build:ics` and `lint:xml` being `package.json` scripts rather than
  documentation. A **type** import is exempt and stays `'../src/types.js'`.
- **esbuild resolves `'./dom.js'` onto `dom.ts` as well, so the specifier convention is untouched.** `outbase: 'src'`
  with `outdir: 'dist/src'` reproduces the source tree's shape, so no `<script src>` moved. `scripts/bundle.mts` reads
  its entry points **out of those tags** rather than listing them, and throws on an empty list, since a regex matching
  none would bundle nothing and exit 0.
- **A package's `main` is not the file the CDN `<script>` named.** `leaflet` resolves to the _unminified_
  `dist/leaflet-src.js`, 450,229 bytes where the tag it replaced fetched `dist/leaflet.js` at 147,552 — which is why
  `minify: true` is what keeps importing the two libraries by name from costing `map.html` bytes for the requests it
  saves. Measure the package rather than assuming it and the CDN are the same library — and gzip both sides locally
  rather than comparing two servers' negotiated encodings: the artifact is 471,248 bytes over 6 requests against the
  677,786 over 8 the live site serves for the same five pages, and 152,199 gzipped against 181,033.
- **`charset: 'utf8'`, or every non-ASCII character in a string literal is written as a `\u` escape** — 112 of them
  across the five bundles, worth 315 bytes. Minification is what leaves only string literals to escape, the unminified
  output carrying 192; the two that remain are the ones `pgsharp/backup.ts` wrote itself for the MUTF-8 bounds. Count
  them with a per-character histogram, since the `//` in a string literal defeats a comment-matching regex.
- **Two producers in one output directory want a guard, not a convention.** `scripts/bundle.mts` writes
  `dist/src/app.css` from the stylesheet `src/app.ts` imports and `assemble.mts` then copies `src/*.css` over it, so a
  repository file of that name would take Leaflet's rules off the map page and report a build that succeeded.
  `publish()` throws on an `existsSync`, proved firing by planting the file.
- **No cycles in the graph is what makes bundling semantically inert here, and it is one query.** Concatenating modules
  in topological order evaluates them in the order the loader would, but only because there is nothing to order
  ambiguously: 65 `import-statement` edges over 40 modules and not one cycle, the six `node_modules` inputs included.
  Re-measure it when a module is added — extracting the four pure cores out of the entry points moved both figures and
  neither the rule nor the answer. The only edges that are not imports are four `url-token`s out of `leaflet.css`, one
  of them `url(#default#VML)` — a fragment esbuild passes through rather than failing to resolve.
- **Run a script through pnpm, never as a bare `node`.** `devEngines.runtime` pins the Node floor that guarantees type
  stripping and governs only what pnpm invokes, so `pnpm build:ics` is safe where `node scripts/build-ics.mts` fails
  below Node 22.18. Every entry point has a `package.json` script, and `pages.yml` calls that.
- **A `files` glob matching nothing is silent.** `eslint.config.mjs`'s browser-globals block named `src/**/*.js` and
  matched not one file, which reads exactly like a clean lint, so move such a glob in the same commit as the rename.
- **A path a check cannot resolve wants both its directions asserted rather than an exemption — and the exemption is the
  thing to remove.** This is [the probe rule](#designing-a-probe) one level down in the build. `events.ics` was written
  into `dist/` by the deploy, after `pnpm build`, so `assemble.mts` could not resolve the relative `href` `events.html`
  gives it, and the skip on its own would have left that the one path no page is held to. The pair that answered it cost
  nothing — a page has to name it, and `dist/` has to not already hold it — but it only existed because the feed arrived
  late, and the generator's own `existsSync(DIST)` guard existed for the same reason. Both went when
  `data/events-feed.json` took the fetch out of the generator and let it move inside `pnpm build`: the `href` resolves
  like any other now. So assert both directions while the path is unresolvable, and keep asking what makes it
  unresolvable.
- **Tracking a generated file buys nothing but the check that it is in step, so let the build write it instead.** The
  two indexes were committed and `validate-gpx.mts` compared them byte-for-byte against what it had just derived, which
  is a check whose only finding is ever "the copy is stale" — three messages, two `readFileSync` calls and a
  `lint:xml:fix` script, 289 lines of generator down to 267 once `pnpm build` was the one that wrote them. What makes
  this safe is that the index was already derived rather than authored: `git ls-files` and the `<pgr:event>` fields are
  the source, and a regenerated file matched the tracked one byte-for-byte, which is the measurement to take before
  untracking anything.
- **Only one of `pnpm lint`'s six checks may write a given file, `--parallel` being what it runs them with.**
  `lint:types` is `pnpm build` and the build now writes `data/gpx-paths.json`, so `lint:xml` beside it has to be the
  checks alone — hence `--write` naming which caller wants the indexes rather than a mode the script is in. Two writers
  would race on identical bytes and a reader would see a `writeFileSync` mid-truncation, which is a zero-byte index
  published into `dist/` by a build that passed.
- **A path inside a directory the allowlist already publishes wants no entry of its own, and `publish` says so.** Moving
  the indexes under `data/` left them named twice in `PUBLISHED`, which answers
  `Error: data would overwrite dist/data, which the build already wrote` rather than copying either twice — the guard
  that exists for `bundle.mts` and `assemble.mts` clashing, reading the redundancy as the same kind of thing. Count the
  summary line too: 22 copied paths became 20.
- **pnpm 11 gates install scripts in `pnpm-workspace.yaml`, and `pnpm.ignoredBuiltDependencies` in `package.json` is
  silently ineffective.** Adding esbuild left `ERR_PNPM_IGNORED_BUILDS` and pnpm then refused every command.
  `allowBuilds: {esbuild: false}` is right because the binary arrives from an optional dependency and the postinstall
  only verifies it, which `./node_modules/.bin/esbuild --version` answering with the script ignored proves.
- **TypeScript is pinned to 6.x on purpose.** `typescript-eslint` throws on import against TypeScript 7 and takes
  `pnpm lint:js` down with it
  ([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)).

### The DOM

- **Prefer a published `@types` package to a hand-written `declare`.** `import * as L from 'leaflet'` leaves all
  thirteen `L.` references and the four `L.Polyline`-style annotations spelled as the UMD global left them, and takes
  `allowUmdGlobalAccess` and `src/globals.d.ts` with it. A `declare global` is the wrong way round the moment a package
  ships types: it shadows `@types/leaflet`'s own `export as namespace L` and answers
  `TS2451: Cannot redeclare block-scoped variable 'L'` plus four errors from inside a file you did not write. Note that
  `window.L` still exists either way, Leaflet's own build assigning it. What no declaration will guess is a tuple, so a
  coordinate pair is declared `[number, number]` at every hop.
- **A stylesheet import needs `declare module '*.css'`, and it belongs in the browser half.**
  `import 'leaflet/dist/leaflet.css'` is a `TS2307` without one, a `.css` file being nothing TypeScript can resolve as a
  module. `src/assets.d.ts` holds it and carries no top-level import or export, which is what keeps its declarations
  ambient; shared would reach `scripts/`, which has no business importing a stylesheet.
- **Every page reaches the DOM through `src/dom.ts`.** `byId` throws where the markup and the script disagree, so a
  stale id is a broken page at load rather than a `null` travelling. Name a class only where the code depends on one,
  since the argument states a dependency rather than describing the markup. This is the half `tsc` cannot check.
- **Two overloads, not one type parameter defaulting to `HTMLElement`.** A type parameter appearing only in the return
  position is inferred from the caller's annotation, so `<T extends HTMLElement = HTMLElement>` leaves `byId('grid')`
  answering `HTMLInputElement` to anyone who asks — the default never applies where the overloads reject it.

## Landing a change

Which route a change takes turns on whether it changes what the code _does_ or only what it is _told_.

- **A data change lands on `master` directly.** A species added to or removed from a filter (`src/filters/*.ts`), a
  `.gpx` file and the index regenerated beside it, an event in `data/events.json`, a country in `src/countries.ts`, a
  `released` or `shinyEligible` flag in `src/pokemon/pokedex.ts` — the lists this repository exists to hold. Single
  maintainer and linear history, so these need no branch and no review: the entry is the whole of the change, and
  `pnpm lint` already says whether it is well-formed and whether the generated files still agree with it. The push is
  the whole of the publishing too — `pages.yml` fires on `master` and deploys what `pnpm build` produces, so a data
  change needs no local build and nothing is committed from one.
- **A feature or a logic change needs a pull request.** Anything that changes behaviour rather than content: a new page
  or control, a rendering, filtering or sorting rule, the shape of a file the pages read, a script, a workflow, a
  refactor. Branch, push, and open it against `master`.
- **A dependency bump lands itself, and the gate is `master`'s protection rule rather than `automerge.yml`.** Auto-merge
  can only be enabled on a pull request that is _blocked_, so against an unprotected branch the step fails with the pull
  request already being in a clean status — the rule requiring `Complete` and `test` is what gives it something to wait
  on. `Complete` is one check on purpose: a matrix leg's check is named after the leg, so requiring those directly would
  copy `lint.yml`'s six names into the repository's settings and leave a seventh added later required by nothing. Admin
  bypass stays on, which is what keeps a data change pushable to `master` directly. Do not count on the merge deploying:
  a push a `GITHUB_TOKEN` made creates no workflow run, so the six-hourly schedule rather than `pages.yml`'s `push` is
  what is known to serve a bumped bundle. Watch which fired before concluding either way.
- **Open the pull request ready for review, not as a draft.** A draft says the work is not finished, and there is
  nothing here that wants parking half-done. If it is not ready, leave it unopened.
- **A change that is both is a logic change.** Adding a species to a filter is data; changing how that filter decides
  what to include, even in the same commit as an entry, is not.

## Testing

`pnpm test` runs Vitest over the modules whose output is a value, each test co-located beside what it tests as
`src/**/*.test.ts`. There is no `vitest.config.mts`: everything below is either a default worth knowing or a flag on the
`test` script, so the one place that says how tests run is the script that runs them.

- **Vitest resolves `./x.js` onto `x.ts` with no configuration, so a test sits on the specifier convention without a
  hook.** Check the transitive case rather than the first edge, which is not the one that breaks:
  `search/optimise.test.ts` reaches `pokedex.js` through `optimise.js` and gets all 1,025 entries, with
  `find src -name '*.js'` answering 0 — there is no `.js` file in the tree for any of it to have resolved to.
- **Vitest is blind to types, and `pnpm lint:types` is what checks a test — only because tests sit under `src/`.**
  esbuild strips an annotation without reading it, so `const wrong: number = optimise(state({})).lossy` is 13 tests
  passed and `TS2322: Type 'boolean' is not assignable to type 'number'` over the same line. `tsconfig.json`'s `include`
  is `src/**/*.ts`, so a co-located test is already in the browser project: a tests directory of its own would silently
  stop checking them and want a fourth project to put it back.
- **`types: []` does not block a named `vitest` import**, that setting governing automatic ambient `@types` inclusion
  alone — `import {expect, test} from 'vitest'` resolves through the package's own `exports` and makes nothing ambient.
  The control is `process.env`, still a `TS2591` in a test file carrying that import.
- **Collection is confined to `src/`, because `.claude/worktrees/` is inside the repository.** Vitest excludes
  `**/node_modules/**` and `**/.git/**` and nothing else, so a sibling worktree's tests join the run: 2 files and 14
  tests against the 1 and 12 this checkout holds, a suite reporting on a tree nobody is editing. `--dir src` is what
  bounds it, and a worktree per subtask being a rule here is what makes this systematic rather than an accident.
- **Zero test files exits 1 and prints the globs it tried, so never reach for `--passWithNoTests`.** That flag turns a
  glob matching nothing into a pass, which is this repository's worst failure mode — the same one
  [a `files` glob](#building) has already cost it once. It is also why a harness cannot land ahead of its first test.
- **A test over the real tables asserts the shape of the data its case needs.** `saur` reaching three species and
  beginning none is the whole of what its refusal is about, so a dex that had moved would leave the assertion passing
  for nothing — the [`dialog-variants`](#designing-a-probe) failure, two breaks each moving 0 of 74 snapshots. Pin
  `{contains: 3, begins: 0}` beside the behaviour, and hand-derive the expectation rather than reading it out of the
  same table the code reads, or the test agrees with a table that is wrong.
- **Count what a fragment reaches before writing down what it reduces to.** `char` reads as `4-6` and is refused:
  Charjabug and Charcadet begin with it as well, Chimchar and Pecharunt carry it in the middle, so the two sets are 5
  and 7 and disagree. One `grep -c` over `pokedex.ts` settles that where reasoning about the name does not.
- **An expectation that reads a zone wants `TZ=UTC pnpm test` beside it, because the runner's own zone is UTC and a zero
  offset is signed.** `event-feed.test.ts` passed here at UTC+10 and failed on CI with
  `AssertionError: expected +0 to be -0`: `getTimezoneOffset()` answers `0` there, so a negated `-0 * 60_000` is `-0`,
  which `toBe` tells apart from `+0` through `Object.is`. Subtract so the sign comes out of the data rather than out of
  a unary minus, and run the two zones rather than the one — this is the [`events.html` figure](#designing-a-probe)
  again with the machine standing in for the feed.
- **A `toEqual` against the object the value was built from compares a round trip of itself.**
  `expect(JSON.parse(CONTROL_RESETS.resetScan.hlscan)).toEqual(SCAN_CONFIG)` holds however `scan-config.ts` reads, so
  `onlyShiny: true → false` is a mutation it cannot see. It still earns its place — it is what says `hlscan` carries
  that table rather than a feed filter — but the values want literals beside it. The same applies to a key list taken
  off the object under test: spell the order out, since `Object.keys(x)` compared with itself is a tautology.
- **Ask whether a mutation could single an assertion out before writing it, since one that nothing can reach is worse
  than none.** A check for an empty `continent` in `countries.ts` is unreachable: `''` joins the set of continents like
  any other value and sorts to the front of it, so the set assertion above it already fails. Where the answer is "only a
  coordinated edit", say which — `GENERATIONS` is checked for an inverted span, and reaching it takes two rows moved
  together, because moving one `last` moves the `first` the next row is weighed against.
- **`pnpm test:coverage` names the files to count, because the default counts only the ones a test loaded.** Vitest 4
  resolves `coverage.include` against what the run imported, so a module with no test is _absent_ from the figure rather
  than 0% in it. Deleting a test therefore _raises_ the default headline, taking its module out of the denominator with
  it. Naming `src/**/*.ts` statically is the fix, and it reaches a module Node cannot import at all: `app.ts` dies at
  module scope on its stylesheet and v8 still reports `0%` for it from static analysis rather than failing the run. The
  0% rows are then the browser-probe list of [Differentials](#differentials) restated as a number, which is the one
  thing a coverage figure is good for here — the five entry points, `dom.ts`, and `generated.ts` and
  `recurring-types.ts`. The last two should stay there: each holds one list whose contract is that it is spelled once,
  which the consumers reading it already hold and a test could only restate.
- **A file missing from the coverage table means either nothing uncovered or nothing measured, and the two read alike.**
  The text reporter printed 6 rows where `coverage-final.json` held 20, the other 14 being at 100% on all four metrics;
  `--coverage.skipFull=false` does not bring them back, the flag being accepted and ignored. Ask the JSON reporter which
  files were measured, since it is the only output that lists them rather than selecting among them.
- **Most of what a page entry point does is not about the DOM, and extracting that half is the only way a test reaches
  it.** All five report 0% from v8's static analysis — they die at module scope under Node on their first `byId` — so
  1,597 of 1,710 uncovered statements sat inside them, and no assertion about a status bucket, a Gson escape or a
  haversine could be made without opening a page. Pulling each pure core into a sibling module took statements over
  `src/` from 30.83% to 45.10%, and `event-feed.ts`, `search/query.ts`, `pokedex/entries.ts` and
  `pgsharp/{filters, controls,scan-config}.ts` were already that move made six times. What is left is irreducibly a
  rendering.
- **Cut the seam at the narrowest browser dependency, which for a GPX reader is `DOMParser` and nothing else.**
  `gpxFavourites` and `gpxEntries` take a `Document` rather than the file's text, so everything but the parse runs under
  Node: `@xmldom/xmldom` answers `localName`, `children`, `textContent` and `getAttribute` exactly as a browser does,
  and `src/testing/xml.ts` is the one cast that buys it — xmldom types `localName` as nullable on every node, so its
  `Document` is not structurally a DOM one however alike the two behave. `parseGpxDocument` is what cannot come along:
  it tells a malformed file by `querySelector('parsererror')`, which **xmldom does not implement at all** and answers by
  throwing from `parseFromString` instead.
- **Stub a global as that global, never as a new parameter.** `localStorage` and `fetch` being globals is part of what
  `event-prefs.ts` and `loadManifest` are about, and a parameter would be a seam the page does not have — one a test
  could reach a state through that the page cannot. `src/testing/storage.ts` is the three members the readers call plus
  a `throws` flag, which is the one thing a `Map` cannot do and the case every `catch` in that file exists for. It
  carries nothing else: a stand-in answering more than its subject asks for is surface with no check behind it.
- **Measure a suite by breaking the module under it, and read a survivor as a question about reachability rather than
  about the corpus.** 79 of 81 deliberate breaks were caught, each by one or two tests — a break that fails every test
  is usually one reaching a shared fixture instead of the behaviour. Both survivors were findings: `childText`'s blank
  test cannot be singled out, every reader above it treating `''` and `null` alike; and `addDays` written as
  `t + 86_400_000 * n` is **provably identical** to the calendar form in a zone that never changes its clocks, so the
  test that walks a year catches it at `America/New_York` and not at AEST or at CI's UTC. Check a mutation is not a
  no-op before believing a miss — `new Set(readSet(k) ?? DEFAULT)` against `readSet(k) ?? new Set(DEFAULT)` is the same
  function.
- **Run the zone sweep, not just `TZ=UTC`.** Four zones — the machine's own, UTC, one with DST and `Asia/Kathmandu` for
  a 45-minute offset — because each catches something the others cannot, and the DST one is load-bearing rather than
  belt-and-braces. Build every date fixture from local parts rather than parsing a string, and assert a length, a
  boundary or an order rather than an instant.
- **Derive an expectation independently, and when it comes out wrong ask which of the two was.** Three did here and all
  three were the expectation, each worth writing down: `Math.round` breaks a tie towards positive infinity, so an event
  90 minutes off reads "in 2 hours" ahead of now and "1 hour ago" behind it; `1005 / 1000` is 1.0049999999999998934, so
  1005 m reads as "1.00 km" and 1006 m is the first to read as 1.01; and a great circle between two points on a parallel
  is _shorter_ than the parallel, by half a metre in 55.6 km at 60°N. A haversine's anchors are exact on paper —
  `R × π / 180` for a degree, `π × R` for half a circumference — so they are the ones to assert against.
- **Reach a reader's guard by patching a stream the writer made, and derive every offset rather than counting it.** Took
  `java-serialization.ts` from 89.11% to 99.41%, the two remaining lines being ones the tests name as unreachable from
  `dumps`. Handle numbers are the trap: handle 3 is `"Melbourne Zoo"` in a two-string stream and `java.lang.Integer`'s
  descriptor in a two-box one, which is the whole reason a `TC_REFERENCE` carries no kind and the reader has to ask.
  Splicing into a classAnnotation wants `TC_NULL` rather than a string, since a string claims a handle the writer did
  not and shifts every later one.
- **A test over a live data table pins a relationship, not a count.** Filter membership and a `released` flag are data
  changes that land on `master` alone, so `toBe(48)` for the shiny-and-legendary set would turn every such edit into a
  test edit; that the intersection is inside both and smaller than both is the whole of what ANDing means. Where a
  figure is fixed by something other than data — 151 for generation 1, a partition summing to `ENTRIES.length` — name
  it.
- **`coverage.exclude` merges with Vitest's own defaults rather than replacing them.** So `*.test.ts` wants no entry of
  its own, the defaults dropping it either way, and adding one is a flag that rejects nothing — judged the way
  [Annotating](#annotating) judges an annotation. What the defaults miss is `.d.ts`: `src/assets.d.ts` and
  `src/types.d.ts` join the denominator uninvited, where a declaration file emits nothing there is any covering of.

## Checking the pages in a browser

`pnpm test` covers what a module computes and `pnpm lint` says nothing about whether a page looks right, so neither
reaches a rendering. Run `pnpm build`, serve **`dist/`** with `python3 -m http.server`, and drive headless Chrome over
the DevTools Protocol from Python `websockets` — no Playwright or Puppeteer package is installed, though Playwright's
browser binaries are cached. Serving the repository root instead is a mistake that announces itself, which makes the
root the cheapest **control**: no page loads at all, because `src/app.js` is not in the checkout. Rebuild before every
run, since a stale `dist/` is the edit-not-served trap one level above the browser cache.

### Designing a probe

- **The five-page suite says a module loaded, never that it is right.** Making `Pokemon#region` answer the species
  instead of throwing left all five pages clean while the differential reported 8,183 differences against the same
  build. Name the page and the selector beside each figure, because the numbers do not identify themselves: 82 reads as
  the Pokédex's chip count and the Pokédex has 12.
- **A selector that matches nothing reads as a pass.** `querySelector('.banner')` reported no error banner on a page
  whose manifest fetch was blocked outright, the markup being `id="banner"`. A node that _does_ exist is the same trap
  one step along, every container shipping empty and filled by the module, so assert what the script writes — `6 of 6`
  in `#optTally` — and keep a control that breaks one lookup on purpose.
- **A snapshot field no step ever fills compares equal on both trees forever, which reads exactly like agreement.** Two
  breaks in `variantTable` each moved 0 of 74 snapshots, because not one of the eight species the corpus opened carries
  a variant — in a scenario named `dialog-variants`. Extend the corpus, assert that coverage, and put the assertion
  outside the function the mutation pass shares with the differential, or a tree broken on purpose throws on the check
  and is counted as caught for the wrong reason. Ask the data before touching the corpus: importing `entries.ts` under
  Node found exactly 3 species where some but not all members are watched.
- **A break that survives may be unreachable with the data rather than missed by the corpus.** Dropping the accent fold
  from `sortKey` moved 0 of 53 and that is not a weak corpus: only `São Paulo` carries a combining mark, and `n` sorts
  below both `o` and the U+0303, so the fold can only change an order where some name's third character falls in
  `p`–`z`. Derive that condition and state it rather than adding data to reach it — but never let the 0 stand
  unexplained, since a mutation nothing catches and one nothing _can_ catch read identically in the log.
- **An exemption that covers the field under test is worse than no check.** The `typeof tzlookup === 'function'`
  assertion was exempted by name in the one scenario that took the script away, so a patch that did not work reported a
  clean pass. Pair every such exemption with a positive assertion that the thing really did happen — here the status
  line naming the waypoints that got no zone, since `undefined` is also what a page whose module never ran reports.
- **A module running is not its stylesheet arriving.** An SVG `<path>` is appended whether or not `leaflet.css` loaded,
  so 74 of them says Leaflet ran and nothing more. `.leaflet-pane`'s computed `position` discriminates: `absolute`,
  `hidden` and 124 rules with the import, `static`, `visible` and 0 with the `<link>` disabled.
- **A harness that turns its own failure into a figure reports its strongest result for its worst run.** The mutation
  pass counted a corpus that threw as having moved every snapshot, which banked `80 of 80` for a browser hiccup at the
  eighteenth scenario. Print a failure as a failure, retry once, and count load failures apart from movements.
- **A control's effect and what it reports about itself are two assertions, and the second gets left out.** A broken
  `typeChips` pairing every chip with the wrong heading still filtered perfectly, the handler closing over its own
  `heading`, and the mispairing surfaces only in the `aria-pressed` a later render writes.
- **A check on a net figure cancels; assert the per-step deltas.** Two reveals add one event each, hiding Community Day
  removes two, a dismissal removes none — 73, 74, 75, 73, 73, net zero by arithmetic, and a broken build would have said
  the same. Prefer a count only the control under test can move.
- **A set taken over every row carries the absence as a value of its own.**
  `new Set(rows.map((li) => li.querySelector('.family')?.textContent ?? ''))` is `['', ' (family)']` over a half-marked
  list, so it failed on a correct list and would have passed on an all-marked one. Map over the rows that have the
  thing, and keep the tally as a ratio, since `4 of 8` and `6 of 6` tell a paired list from a family-only one.
- **Two clicks in the same tick say nothing about the timer between them, and the numbers are not the lesson.** Copy's
  1400ms timer wants click, wait 1200ms, click, wait 350ms, so an uncleared first timer fires _between_ the second click
  and the read. Copying that recipe to `toast`'s 1800ms caught 0 of 56, because the driver itself sleeps 0.9s after
  every action. Draw the timeline with that settle counted in and pick the gap off it.
- **Serve the probe its own data where the repository's cannot discriminate.** `data/events.json` is 39 events of one
  heading, so "the chips come out sorted" was a one-element list. A `Page.addScriptToEvaluateOnNewDocument` replacing
  `window.fetch` for the one feed URL — `data/events-feed.json`, same-origin since the vend — answers a crafted feed
  before the module runs, and rejecting from the same patch tests the failure banner without touching the network.
- **`events.html` still fetches off-site, and vending the feed did not change that.** Every card's `image` is the
  `cdn.leekduck.com` URL the feed itself carries, so a probe recording `Network.requestWillBeSent` saw thirteen of them
  beside the three same-origin JSON files. "A visit makes no request off this site" had been written into three comments
  before the probe was run and was false in all three. Assert what the change actually moved — that no _event data_
  comes from `raw.githubusercontent.com` — and list the URLs rather than counting them.
- **`events.html`'s figure was not a baseline, and `data/events-feed.json` is why it is one now.** `src/events.ts` had
  merged the live upstream ScrapedDuck feed with `data/events.json`, so `#typeFilters` tracked upstream rather than the
  checkout: 17 one morning and 16 that afternoon, nothing here changed. Both inputs are tracked files since the vend, so
  the count is fixed for a given commit and a probe may assert it. The rule outlives the fix: derive a figure from its
  inputs rather than pinning it, and treat anything still fetched over the network alike.
- **`Network.setBlockedURLs` matches the URL as requested, which is percent-encoded.** `backup.ts` fetches through
  `encodeURI`, so `*Melbourne Zoo, Melbourne, Victoria.gpx*` matched nothing and a scenario meant to reach a `catch`
  reported a _successful_ build. A probe whose purpose is to break something has to be shown breaking it.
- **A probe step that carries on from the previous step's state may have nothing left to prove.** Typing `ch` after an
  accepted `eevee` gives `eeveech`, which names no species, so the list was already shut. Establish each precondition
  from a fresh page and print the state you are about to disturb.

### Differentials

- **Most of `src/` needs no browser: every module but the five entry points imports outside one.** The strongest check
  available for anything whose output is a value rather than a rendering is therefore a test, and
  [Vitest resolves the `.js` specifiers itself](#testing). Bare Node resolves them literally, so reaching one from a
  script or a probe wants a ten-line `module.register` hook retrying `./x.js` as `./x.ts`; `register` takes a URL and a
  relative specifier resolves against the importing file, so reach for `pathToFileURL` on both. The entry points fail at
  module scope rather than in their logic — `app.ts` on `ERR_UNKNOWN_FILE_EXTENSION` for its stylesheet, the other four
  on an `HTMLElement` — so settle which is which by importing rather than by grepping for `document`.
- **An entry point cannot be differentialled under Node, so serve both trees and drive one corpus over each.**
  `git archive <base>` the old tree beside the worktree and `diff -rq` them, so the file under test is the only
  difference; serve each on its own port, so neither can serve the other's cache; snapshot after every step, naming
  controls by index rather than id. Eleven deliberate breaks over `search/builder.ts` were all caught, two by a single
  snapshot each, which is what says the corpus is sensitive per step rather than only in aggregate.
- **Where the change alters the markup, the snapshot has to name observables rather than markup.** Typing
  `pokedex/page.ts` deletes `data-dex` from all 1,025 cards, so a diff over `innerHTML` reports everything as changed.
  Name what the page is _for_ — the visible count, each chip's `aria-pressed`, `location.hash`, `document.activeElement`
  — and let no step reach a control through the attributes either. `activeElement` proves a focus handler rather than
  assuming one, and reads the DOM's own ceiling: one of seven closes reports `BODY` because **a hidden element cannot
  take focus**, so breaking the handler moves 6 rather than 7.
- **A change to the build wants a byte digest, not a page that still renders.** Bundling rewrites every line of output,
  so wrap `URL.createObjectURL` from a pre-script, click **Generate & download** and hash what the Blob was handed —
  driving the _deployed_ site as the baseline, since production serves the previous build until the merge. Assert the
  Blob count too, because an empty `window.__blobs` hashes to nothing and the digest line would simply be absent.
- **`src/java-serialization.ts` is the clearest case**, the bytes `dumps` writes being its whole contract. Drive the
  page for the real data, but it is the corpus that reaches what a synthesized backup never will — `TC_LONGSTRING`,
  U+0000, a nested map, block data spliced into a classAnnotation. Move something the bytes depend on before believing a
  digest that matches: `loadFactor` 0.75 → 0.5 shifted it while the length stayed 117,471.
- **Reach one of the reader's guards by patching a valid stream, not by writing bytes by hand.** Renaming the boxed
  `value` field is one byte and is the only way to reach that throw. Derive each offset by searching for it and assert
  it matched once, because the obvious guesses are wrong: the four bytes of a boxed `7` are not the last four, the
  HashMap's own `TC_ENDBLOCKDATA` following them.

### Reading the page

- **`el.hidden` answers the attribute, not the layout.** It reads `true` however visible the element is, the UA
  stylesheet's `[hidden] {display: none}` losing to any author `display` on the same element — `.newly {display: flex}`
  is one, so five suites reported `#newly hidden=True` while **Mark all as seen** sat on screen at 100×18. Pair every
  toggled `hidden` with a `[hidden] {display: none}`, and read `getComputedStyle().display` and the element's own rect.
- **A layering bug needs the pixels; `elementFromPoint` will not find it.** Hit-testing does not follow the paint
  promotion `opacity` causes, so a dimmed cell that really did paint over the bars beneath it was hit-tested as the bar
  either way. A small PNG decoder over `Page.captureScreenshot` read rgb(220 136 230) against rgb(192 38 211) for the
  same bar a column later. `elementFromPoint` also answers null outside the viewport, and these grids are taller.
- **A warm pixel is not an emoji, because subpixel antialiasing fringes grey text.** Counting pixels above `r 190` and
  below `b 130` found 547 of rgb(253 216 53) in the Favourites star and 46 in the iconless heading beside it. Threshold
  on the emoji's own body and keep the control clip. `Page.captureScreenshot` answers PNG colour type 2 where nothing is
  transparent, so an RGBA-only decoder throws on the very capture it was written for.
- **Blur before you screenshot, or you will file your own focus ring as a bug.** A UA ring on a `flex: 1 0 100%`
  disclosure is 941px wide and reads as a stray empty text input; `getBoundingClientRect` said nothing about it.
- **Match the class names, not the rendered text — and the accessible name is the other way round.**
  `text-transform: uppercase` never touches `textContent`, so a row reading `JAPAN` is `Japan` to `includes('JAPAN')`;
  it _does_ reach the name, so `Accessibility.getPartialAXTree` answered `" FAVOURITES"` for a `"⭐ Favourites"`
  heading. Assert what the check is about rather than a character-for-character match.
- **Screenshot the viewport, not the page.** `captureBeyondViewport` on a long page returns something like 1400×5983,
  which scales down to an unreadable few hundred pixels wide. Pass an explicit height.
- **A clip measured from one section's rect covers a column, not a row, and goes stale the moment the probe clicks.**
  The search page is `grid-template-columns: 411px 411px`, so a clip stretched to a later section's `bottom` silently
  drops the section beside it. Span every section by the `min` of their lefts and the `max` of their rights, and measure
  after whatever the probe clicks.
- **Reach a module-scoped object by wrapping the library, not by hunting for it on `window`.** `src/app.ts` holds the
  Leaflet map in a `const`. A pre-script defining a setter for `window.L` and wrapping the prototype methods runs before
  the deferred module, and stashing `this` on the first call leaves the instance reachable from every later probe —
  which is what found the deep-link zoom bug.
- **Wrap `value.Map.prototype` inside that setter, and never install a second trap on the `Map` key.** Leaflet 1.9.4
  assigns `window.L` already fully populated, so an `Object.defineProperty(value, 'Map', {get: …})` over a key that
  already holds a value _replaces_ it: `L.Map` read `"undefined"` and `setView` was gone for the rest of the page's
  life, while the page still drew all 74 paths because `L.map()` closes over the module's internal binding. Read a
  `NO MAP` sentinel as a bug in the probe, and keep `.leaflet-proxy`'s `style.transform` as a control, since it carries
  the centre and zoom without `L` at all.
- **A view that lands can still be taken away.** Leaflet animates a zoom of fewer than `zoomAnimationThreshold` levels
  as a CSS transition and applies the move at its end from the centre captured when it began, and `setView` stops a pan
  but not that. Probe after the transitions settle, or the broken case reads as fixed.
- **A global a classic script declares with `function` cannot be shadowed ahead of it; overwrite it afterwards.**
  CreateGlobalFunctionBinding _redefines_ a `configurable` property, so a pre-script accessor is exactly what it
  replaces and the page still answered `typeof tzlookup === 'function'`. What it leaves is non-configurable and
  **writable**, so assign over it as a step after load — `undefined` for the `typeof` guard and a throwing stub for the
  `catch`, both ending at the same counter, so the two backups must hash alike. Probe the descriptor first. Bundling
  tz-lookup took that lever away, so read this as the shape of the argument rather than as a step to repeat here.

### Driving Chrome

- **Run `chrome-headless-shell`, not `chrome`.**
  `~/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell` serves the
  protocol fine. The full browser beside it prints `DevTools listening on ws://…` and then dies of a trace/breakpoint
  trap with `--headless=new`, so the port is gone by the time you connect.
- **`/json/version` answers the _browser_ target, which carries neither a `Runtime` nor a `Page` domain.** It accepts
  the connection and then answers every call `-32601 'Runtime.evaluate' wasn't found`, which reads like a version
  mismatch. Take the page target from `/json/list` filtered on `type == 'page'`. And assert `'error' not in msg` on
  every call, because a rejected call read past surfaced as a `KeyError: 'result'` several steps later.
- **`Network.setCacheDisabled` does nothing until `Network.enable` has been sent, and must precede the navigation.** The
  command is accepted either way, so the run looks right and serves the stylesheet it already had — which looks exactly
  like a rule that does not match rather than a file never fetched. Treat measurements identical to the previous run as
  the symptom.
- **Navigate via `about:blank` before a URL that differs only by fragment.** `map.html#event=…` from `map.html` is a
  same-document navigation, so the previous run's JavaScript stays live and disabling the cache cannot help — there is
  no request to make. `about:blank` owns no storage, so `localStorage.clear()` there throws `SecurityError`: clear
  through the browser with `Storage.clearDataForOrigin`.
- **Pass a fresh `--user-data-dir` per run.** Two instances fight over the default profile and the failure is not a
  startup error: the port answers, `Page.enable` succeeds, and the socket dies during the first navigation with
  `no close frame received`. Read a mid-run close as contention rather than as the page.
- **Connect with `ping_interval=None`.** An `asyncio.sleep` between calls blocks the recv loop, so a keepalive goes
  unanswered and `websockets` hangs up with `1011 keepalive ping timeout`.
- **A pre-script outlives the run that installed it, and two copies chain rather than replace.**
  `Page.addScriptToEvaluateOnNewDocument` is registered per browser session, and each copy captures the previous one's
  wrapper as its "real" function, so one `URL.createObjectURL` pushes the same Blob twice. Restart Chrome between runs
  or send `Page.removeScriptToEvaluateOnNewDocument`; an `if (window.__wrapped) return;` guard makes the first copy win.
- **Kill by port, never by a pattern you have just typed.** `fuser -k 8931/tcp` and `fuser -k 9222/tcp` match on the
  listening socket, so they cannot match the shell running them. `pkill -f 'debugging-port=9222'` can and does,
  surfacing as a bare exit 144 with nothing stopped. A `teardown.sh` does not save you, the heredoc writing it putting
  the patterns in the same shell's `argv`.
- **`SimpleHTTPRequestHandler.directory` cannot be set as a class attribute.** `__init__` reassigns it from its own
  keyword, defaulting to `os.getcwd()`, so both ports serve the harness's working directory — surfacing as a bare
  `HTTP Error 404` against the page under test. Subclass properly and pass `directory=` through to `super().__init__`.
- **This machine's `curl` wrapper rejects bundled short flags.** `curl -sf` answers `option -sf: is badly used here`, so
  a readiness check is cheaper as `urllib.request.urlopen`. Watch the obvious repair too: rewriting `'curl -sf '` drops
  the trailing space and gives `curl -s -fhttp://…`.
- **A probe script needs `if __name__ == '__main__':` before anything can import from it**, or reusing its `PRE` script
  runs the whole corpus as a side effect of the import. And background it with `python3 -u`, since Python buffers stdout
  to a pipe and a working run reads exactly like one that has hung.
- **A harness that edits the tree in place has to restore on a signal, not only in a `finally`.** Python's default
  SIGTERM handler terminates without unwinding, so stopping mid-run left a one-character edit in the worktree,
  indistinguishable from work in progress. Install the restore on SIGTERM, SIGINT and SIGHUP, print that it ran, and
  check the tree is back by diffing against a pristine copy the harness writes beside itself.

### Comment and line widths

**Measure widths in characters, not bytes, before believing a line is too long.** `awk 'length > 120'` counts bytes, so
every comment carrying an em-dash reads three columns over per dash. Use `len()` on text decoded as UTF-8, and check
what the diff adds rather than the whole file. Measuring is not optional, because nothing else does it: Prettier reflows
code and Markdown prose to `printWidth: 120` but never a `/* */` or `//` comment, so `pnpm lint` is silent on an
over-long one. Four traps in doing it:

- **This machine sets `diff.noprefix`**, so the header reads `+++ search.html` and not `+++ b/search.html`. A parser
  anchored on that `b/` files every added line under no path at all — it still measures them, so the run looks right and
  simply cannot say which file to fix.
- **Print every line over the limit rather than the widest one per file**, since reflowing a 121 uncovers the next
  paragraph behind it and reads as a fresh violation out of a change that only shortened something.
- **`proseWrap` does not follow prose out of the checkout.** Prettier resolves configuration from the file's own
  directory, so `prettier --write` on a commit message drafted under `$CLAUDE_JOB_DIR/tmp` finds no config, falls back
  to `proseWrap: 'preserve'` and reports it unchanged with lines still at 121. Refill with `textwrap`, or draft it where
  the config reaches.
- **Split a Markdown table row on `(?<!\\)\|` and assert each row has the header's cell count.** A cell quoting a union
  type holds an escaped `\|`, which gives the row more cells than the header has, and the `zip` that pads them drops the
  surplus without a word.

Treat an unexpected overrun as a question about the line rather than only about its width: two lines came back at 121
carrying `—` written out as its six literal characters rather than as the em-dash meant, which `tsc` reads as comment,
Prettier never reflows and ESLint never sees.

## Cross-checking `src/pokemon/pokedex.ts` against the web

Three sources cover a variant's `released` and `shinyEligible` state. Each has a demonstrated failure mode, so take a
change only where two of the three agree. Checked September 2026.

- **pokemondb.** [`/go/pokedex`](https://pokemondb.net/go/pokedex) and
  [`/go/unavailable`](https://pokemondb.net/go/unavailable) partition the game master between them, so a variant on
  neither is not in Pokémon GO's data at all — which is why `isNotReleased()` is right for Hisuian Sliggoo, Hisuian
  Goodra and Basculegion. Best source for `released` and for which forms exist.
  [`/go/shiny`](https://pokemondb.net/go/shiny) marks a released shiny with `*`, but that star list is maintained apart
  from the release data and lags it, missing nine the other two carry — shiny Diancie and the Pikipek line among them.
- **Serebii.** [`/pokemongo/shiny.shtml`](https://www.serebii.net/pokemongo/shiny.shtml) lists only released shinies,
  per form (`Tauros (Paldean Form - Combat Breed)`), so presence is the signal. Centiskorch is absent though its shiny
  is out, seemingly filed under Gigantamax.
- **GO Hub.** `https://db.pokemongohub.net/pokemon/${DEX}` says either `Shiny X is available! ✨` or
  `Shiny X is not yet available`, the cleanest per-species shiny signal going. It says nothing usable about `released`,
  the surrounding prose being word-for-word the same for Maschiff as for Koraidon.

Fetch the raw HTML with `curl` and parse it, because `WebFetch` answers through a small model and drops rows from the
1,195 that `/go/pokedex` carries. Diff the whole table rather than spot-checking: copy `src/pokemon/pokemon.ts`, add a
getter over its private fields and import the copy of `pokedex.ts`, so every variant reports a name like
`Hisuian ZORUA`. Compare at dex level with form names only as a fallback, since `/go/shiny` collapses Unown and Spinda
to one card each yet lists Vivillon per pattern, which reports 28 Unown forms as missing when they are not.

## Cross-checking `src/search/terms.ts` against the game

Three sources cover what the search box accepts, each with a demonstrated failure mode, so take a term only where two of
the three agree — the same rule as [`pokedex.ts`](#cross-checking-srcpokemonpokedexts-against-the-web). It has paid for
itself twice: `mega4` appeared in one source alone and does not exist, and a `remote` the table had carried since it was
written turned out to be attested nowhere.

- **PokeMiners' `English.txt`** is the game's own string table and the strongest of the three. The keywords are the 58
  resources whose ID begins `filter_key_`, each on a `RESOURCE ID:` line with its keyword on the `TEXT:` line below,
  which is why a regex anchored to the start of a line finds nothing. It settles a spelling outright:
  `filter_key_raid_remote` is `remoteraid`. Its failure mode is silence — `galar`, `favorite`, `#`, `evolve` and `cp`
  are all absent and all work, so **presence is strong evidence and absence is none** — and it gives the bare token
  rather than the usable form, `filter_key_special_move` being `special` where a reader types `@special`.
- **The [Pokémon GO Wiki](https://pokemongo.fandom.com/wiki/Search)** carries 185 table rows with the client version
  each keyword shipped in, and is the only source giving the _semantics_: `alola` returns every Pokémon from the region
  rather than the Alolan forms, and `@move` matches those that have **not** learned a second charged attack. It shows
  which keywords take a span — `buddy2–5`, `mega2-3` — which is what decides `GROUPS` from `RANGES`. None of
  `remoteraid`, `exraid`, `megaraid` or `primalraid` appears on it.
- **The [GO Hub cheat sheet](https://pokemongohub.net/post/guide/pokemon-go-search-bar-cheat-sheet/)** is organised by
  what a player wants rather than what the client holds, so it is the best source for a chip's label, and the least
  complete: it drops Kalos from its own list of regions and never mentions `rocket`, `fusion` or `candyxl`. Its content
  is 292 `<li>` items and one table with **no `<code>` or `<pre>` anywhere**, so a parse looking for code fragments
  reports zero on a page that fetched fine.

Read the two HTML sources with `curl` and parse them, for the reason the Pokédex section gives. Convert tags to newlines
and print every non-empty line rather than filtering by length, or a two-character keyword is dropped by the filter
meant to remove noise.

## What the search data does not settle

- **A partial name has two readings and the sources disagree on which the game uses.** The wiki says `T` returns
  everything _beginning_ with T, where `search.html`'s own help text has a partial name matching _anywhere_ — `char`
  finding Charizard as well as Charmander. Only one source speaks to it, so a reduction is sound only where both
  readings agree. `src/search/optimise.ts` tests that by counting: everything beginning with a fragment also contains
  it, so the begins-set sits inside the contains-set and equal sizes are equal sets. That is what costs `saur` and
  `mime` their reductions, and why candidates are leading fragments rather than fragments from anywhere.
- **Nothing here knows which species share an evolution family.** `grep -ric evol src/pokemon/` answers 0 for both
  files, and the families in `src/filters/xxs.ts` are a line break for a human rather than data — which is what the
  `// prettier-ignore` above it exists to hold. So a `+` prefix cannot be reasoned about: `+charmander` is not
  rewritable as `4,5,6`, nor shortenable to `+charm` by reaching the family through another member. It gets the name
  shortening alone, which is sound because the same species reached a shorter way are the same families.
- **The generation group joins with `,`, not `&`.** Nothing is two generations, so `terms.ts` gives it the default OR
  and several generations compose to a single clause — `1-151,152-251`, not two clauses AND'd. Anything folding dex
  spans together unions the generations first and intersects that union with the other sources. Merging them can take
  the ambiguity warning with it as well as the characters: `shiny&1-151,152-251` mixes `,` with `&` and earns the
  caveat, where `shiny&1-251` does not.

## Driving Pokémon GO over `adb`

`scripts/inventory.mts` steers the game by screenshot and tap, so every step is a guess about a screen that has no
accessibility tree to ask. Three traps, each of which read as a different bug than it was.

- **Find a control by its text only where the text sits inside it.** Storage's search box and the Appraise row qualify;
  the main menu's Pokémon button does not. Its label OCRs as `131,1735 186×32` and the icon's centre is `224,1874`, a
  little over four label-heights below — so tapping `centre(line)` lands on the backdrop, which dismisses the menu and
  drops back to the map. Three rounds of that is `could not find Pokémon storage; open it by hand and run again`, which
  reads as the game being somewhere unexpected rather than as the tap being wrong. The configured `taps.pokemonButton`
  at `[0.25, 0.82]` is inside the icon and works, so that button is tapped blind.
- **Clearing the search box uncovers the Recent and Recommended suggestions, and Enter does not dismiss them.** With
  text in the box the filtered grid shows behind and Enter only takes the keyboard away; with the box empty the panel
  covers the grid outright, so `openFirst` finds no `CP` label and falls back to `taps.firstTile` — which lands on the
  first Recent chip and searches for whatever was there last. That is worse than failing: the corpus silently became one
  account's saved `0*,1*,2*&!costume&…` at 1,645 of 12,766, and the only sign was a query in a box nobody reads. One
  Back closes the panel and leaves the unfiltered grid. Detect the panel by its own `Recommended` heading rather than by
  the grid looking empty, since a search that genuinely matches nothing looks exactly the same and a Back there would
  walk all of storage under that flag.
- **A tile opens with an animation that outlasts one wait.** Read 1.1s after the tap, the detail screen has no CP or HP
  on it yet, and `keyOf` cannot tell that from a grid with nothing in it — so the tap is reported as
  `storage looks empty, or the first Pokémon did not open` on a screen that opened perfectly and finished a second
  later. `readDetail` already retries once for exactly this, so `openFirst` goes through it rather than judging a single
  screenshot.

### Reading PGSharp's overlay

The detail screen's CP does not survive OCR and the scanner no longer tries: white text over the artwork, it came back
`ce1385` on one species and was not detected as a line at all on another. PGSharp draws `L25 IV86 14/13/12` over the
same screen, which is the level and the three IVs stated outright, so that is where they are read from — and the
appraisal pass, seven taps and some nine seconds per Pokémon, went with it.

- **The overlay is drawn over Unity rather than by it, so it does not move between species — and does move between
  devices.** `ocr.mts` is right that the game's own layout must be found by its text rather than by coordinates, and
  this is the exception: measured at x 337-666, y 438-494 on two unrelated species, identical. So find the box once, on
  whichever Pokémon first yields one, and crop every later screen out of it. Do not write the fractions down as a
  default, because they are fractions of one phone's screen; finding it per run is what makes a new phone need no
  configuration at all.
- **Find it by sweeping isolated bands, not by looking through a whole-screen read.** Searching the lines `readLines`
  already produced is the cheap and obvious thing and it does not work: nine of twelve captures on one phone and none at
  all on the next, where the overlay straddled the boundary of the inverted top-fifth crop and was too low in contrast
  for the sparse pass either side of it. Isolating first is what makes the line legible, and a band a few percent of the
  screen tall is small enough that the rest of the screen cannot drown it. Keep only a box that actually yielded a
  reading, since one that merely looked right goes on being wrong for every Pokémon behind it.
- **Read each band as a line, not sparsely, and do not size the box from what comes back.** A band is one line by
  construction, and the mode matters more than anything else in the sweep: the band holding `L1 IV48 5/2/15` on a bright
  screen reads as `r '` under sparse mode and as `L1 1V48 5/2/15` as a line, because isolating turns the bright artwork
  either side into blocks that sparse mode files as pictures. The cost is that everything in the band comes back as one
  box, so a box measured from it spanned 626 pixels against a true 329 on one capture and sat 250 pixels right of the
  text on another. Use the band itself as the box and let a second sparse pass over that crop tighten it where it can —
  twelve of twelve on the first phone with the tightening, both captures on the second without it. The null it answers
  when it cannot tighten must not be read as a failure: the band it was handed already holds the text.
- **PGSharp centres its overlay, which is what makes sweeping the middle 70% safe** — 718 and 720 against a screen
  centre of 720 on one phone, 501 against 504 on another, and the widest of those boxes 38% of its screen. Sweeping the
  full width works too; sweeping the middle leaves out whatever sits along the edges, the movable PGSharp toolbar in
  particular, which is otherwise read as part of the same line.
- **Where a box is sized from a line, size it from character width, never from the height Tesseract reports.** The same
  overlay row came back 25, 28, 49 and 54 pixels tall across twelve captures, as Tesseract merged it with whatever
  fragment of artwork sat beside it — and padding a 54 by half of itself reaches far enough into the picture to undo the
  crop. Character width does not wander: 270/17, 264/17 and 130/8 on those same captures are all within a pixel. Anchor
  on the right edge and extend left, too, since the half that goes missing is always the left one — twice, only
  `10/11/14` was located, with the level and percentage still on screen ahead of it.
- **Upscale 2x and no further.** At 1x Tesseract read `14/18/12` for `14/13/12`; at 2x it read it correctly in every
  treatment tried; at 3x and 4x it began reading the level's `L` as a `1`. Nearest-neighbour is enough.
- **The IV percentage is colour-coded by quality and cannot be thresholded alongside the white text** — magenta at 93,
  cyan at 86, green at 75, so magenta's luminance of about 78 falls below any floor that keeps the dark box out.
  Isolating near-white (luminance >= 150, chroma <= 55) therefore deletes it — along with the `✨` PGSharp appends for a
  shiny, which is worth knowing is there, since it is a signal the flag passes currently buy with a whole search each.
  That deletion is the point rather than the cost: it is `floor((a + d + s) / 45 * 100)` and derivable from the three
  IVs beside it. Measured, that isolation reads **12 of 12** IV triples where the same screens read whole give 3.
- **The level is the one field of the three to distrust, and the way out is to read it as a shortlist.** The small-caps
  `L` comes back as `L` on one phone and `1` on another, and the `IV` label behind it as another `1`, so `151` is `L15`
  and a stray or a stray and `51` and the string cannot say which — `131` for `L31` is the same question on the other
  phone. Do not pick. Offer every one and two digit piece of every run of digits ahead of the IVs and let `levelsOf`
  intersect them with the levels that reproduce the HP: generous where it is cheap to be and exact where it matters. It
  resolves the HP's own ambiguity in the same step, which is the part worth remembering — HP alone answered `30.5 or 31`
  for the Shroomish and the digits alone `1, 13, 3 or 31`, and together they answer 31. Restricting this to the first
  run was tried and is wrong: a band wide enough to find the overlay is wide enough to read a stray `4` to the left of
  it, and that was then the only candidate, disagreeing with an HP that was perfectly clear. Measured, 12 of 12 levels
  across the older phone's captures and both of the newer phone's.
- **PGSharp's toolbar covers the first letter of whatever is behind it, so do not key off a heading.** Storage's
  suggestions panel has to be recognised before it can be dismissed, and its `Recent` heading OCRs as `serccemt` with
  the toolbar over the `R` while `Recommended` is not read at all. Recognise it by what it lacks instead: an empty
  search matches everything, so a grid with no `CP` anywhere in it is that panel and can be nothing else. The user can
  move that toolbar, which is the other reason not to depend on where it sits.
- **A key that needs the CP is a key that does not exist.** `keyOf` required CP and HP, so with CP unreadable every
  screen keyed null, `walk` counted three unreadable screens and stopped after three Pokémon — which reads as a broken
  walk rather than as a broken CP. HP, weight, height and the IVs together discriminate better than CP ever did.

### Making a reader more reliable

`--keep-screens` saves every screenshot a scan takes, which turns "the OCR is flaky" into something with numbers on it:
run the readers over a corpus of real screens, count each field, and fix the worst. Twenty-five Pokémon was enough to
rank them, and the ranking was not what watching the scan suggested.

- **Measure per field before changing anything.** The first count put types at **6 of 25** and everything else between
  22 and 25, which is not what the log looked like — the log was full of `moves not fully read`, because that is what a
  note is written for. Read the corpus, not the complaints.
- **The whole-screen sparse pass is the weak link, every time.** Each field that read badly read well once it was found
  by something else and then cropped, doubled and read as a single line with an alphabet: the types 6 to **25 of 25**,
  the overlay 3 to 25. It is the same fix each time, and the reason is the same each time — sparse mode is being asked
  to find small text among artwork, where a line read knows what it is looking at.
- **Fixing an input fixes its consumers.** Types are not just a column: `identify` narrows candidates by them, so
  missing types were also three species read as something the numbers then contradicted, and alternative lists running
  to thirty forms. Reading them properly took the corpus to **25 of 25 forms identified, every one unambiguous, and none
  disagreeing with its name** without touching `identify` at all.
- **Size a band from something that does not vary with the reading.** The type band is measured in the anchor line's own
  height, and the two candidate anchors do not report the same one — `0.44m` came back 45 pixels tall where the `5.42kg`
  beside it came back 58, and a band sized off the shorter ended six pixels into the labels. Anchor on either of a pair,
  and leave room for the smaller.
- **A box tightened on one screen will clip another, so widen it rather than trusting it.** Two of twenty-five overlays
  missed against a box cached from the first Pokémon, and both read perfectly against one swept for themselves — a three
  digit percentage is a character wider than a two. Growing the cached box to cover both converges; swapping it would
  flip between the two Pokémon that disagree.

### Telling two forms apart when the numbers cannot

Some forms are identical in every field the detail screen states. HP is a function of `stamina` alone, so two forms
sharing their types and all three base stats cannot be separated by anything `parseDetail` or the overlay reads — and
`identify`'s fold then keeps whichever has the shorter form name, answering it with **no alternatives and no notes**.
Measured against a real `loadGameData('.cache/inventory')`, 13 of the committed rows are in that position: Basculin's
three are all `189/129/172 Water`, Burmy's three `53/83/120 Bug`, Deerling's four `115/100/155 Normal+Grass`, Genesect's
five `252/199/174 Bug+Steel`, Cherrim's two `170/153/172 Grass`, Keldeo's two `260/192/209`, Shellos' two
`103/105/183 Water`.

The artwork is the only thing left, and the game draws each such form its own, named by **form** under
`Images/Pokemon/Addressable Assets/` — `pm585.fSPRING.icon.png` is Spring Deerling, `fSUMMER`, `fAUTUMN`, `fWINTER` the
rest. They fetch at 6 to 12 KB each, `Form.icon` carries the file name, and `scripts/inventory/artwork.mts` compares a
12-bin hue histogram of the capture's artwork against those icons. `identify` takes the answer as a narrowing ahead of
the fold, where PGSharp's bracketed suffix already goes. The figures below are measured over 17 captures from six
families.

- **The backdrop is the whole problem, not the colours.** A histogram over a fixed box scores **8 of 17**, because the
  game blurs an arbitrary scene behind the model and will put a photograph there: `deerling-spring.png` stands on an
  orange bokeh event background against which a pink Deerling is some 15% of the frame, and the naive match called it
  Winter. Worse than the misses are the confident misses — `shellos-west.png` came back East Sea with a 0.646 margin,
  which is a reader being wrong and saying nothing about it.
- **Bound the subject by the panel below it and by sharpness.** The game's own panel is flat rgb(224,224,224), so the
  first row that is mostly panel is where the artwork stops; the model is rendered crisp over a blurred scene, so a
  local-gradient mask grown by a few pixels covers it and not the backdrop. That takes the match to **12 of 17** and
  fixes all four Deerling, the hardest family.
- **Then keep only the largest connected component, because a backdrop is not always blurred.** `shellos-west.png` is a
  pink Shellos on flat teal with crisp bubbles drawn over it, so dilating from those edges floods the mask with the one
  colour that is also East Sea's. The Pokémon is one large component and the bubbles are small separate ones. This does
  not raise the hit rate — still 12 of 17 — and it is the change that matters anyway, because it takes that capture's
  margin from 0.407 down to 0.211 and so below any threshold worth using.
- **Judge it on the margin, not the hit rate.** At a runner-up margin of 0.30 it answers **8 of 17 and is right on all
  8**, abstaining on the other nine. That is the shape a reader here has to have: `defects` exists because a wrong
  answer nothing flags is the expensive kind. Of the 13 rows the numbers cannot reach it settles five —
  `deerling-summer`, `deerling-winter`, `burmy-sandy`, `burmy-trash` and `cherrim-overcast` — and the suite derives the
  figure that justifies the threshold rather than restating it: **five** of the eight it declines are captures whose
  nearest icon is the wrong one, so taking the nearest regardless would be confidently wrong five times.
- **An abstention costs nothing and fixes nothing, which is worth being clear about.** `identify`'s fold removes the
  rivals rather than demoting them, so a declined call still comes back as one form with no alternatives and no note —
  `shellos-west.png` is answered as East Sea whether the artwork is consulted or not. Closing that means `identify`
  reporting the fold it performed, which changes every row of the CSV.
- **Require a signature for every candidate, not for two of them.** Otherwise a form the game draws no icon for is
  dropped for having no artwork rather than for losing on its colours. That is why **Spinda** is never narrowed — nine
  of its twenty patterns are released and nine have an icon — and it is checked rather than assumed: `ambiguous`
  partitions the families and the suite's `ARTWORK` table deliberately holds no Spinda.
- **The test records the signatures and a scan downloads them.** The same division the game master already has, and for
  the same reason — a test of a reader must not reach the network. A scan fetches 125 icons once, about a megabyte, into
  the git-ignored `.cache/`. A missing one is an abstention and not a failure, and the scan reports it and carries on.
- **Genesect cannot be done this way and that is worth knowing before trying.** Its five forms are one robot with a
  differently-coloured drive cassette a few pixels across, so all five distances sit between 1.54 and 1.67 with margins
  of 0.015 to 0.020 — indecisive by construction rather than by a weak mask. Expect to abstain on it for ever, and read
  a tiny margin there as the measurement rather than as something to tune away.
- **`assetBundleValue` is the wrong key, and it reads as missing artwork rather than as wrong addressing.** It was what
  `Form.icon` carried, and it fails three ways at once. It is **absent** — `BASCULIN_WHITE_STRIPED` carries none where
  Red and Blue carry 11 and 12, which is why Basculin went unnarrowed and `basculin-white.png` was left out of the 17.
  It is **not unique** — Zygarde's `FIFTY_PERCENT` and `COMPLETE_FIFTY_PERCENT` both carry `1`, so one file was
  requested twice and both forms would have scored identically whatever it held. And it is **not the name**: not one
  `pokemon_icon_676_*.png` exists at any value, so all ten Furfrou trims 404'd. Address by form instead and
  `ambiguous()` goes from **13 families over 86 forms to 41 over 153** — gaining Vivillon's 20 patterns,
  Flabébé/Floette/Florges' five colours each, Basculin, Toxtricity, Sinistea, Polteageist, Morpeko, Maushold, Tatsugiri,
  Dudunsparce, Poltchageist, Sinistcha, Zygarde and the gender pairs below. Verify a re-keying by its answers and not by
  its coverage: the two schemes' signatures are 0.01 to 0.19 apart, well inside the 0.3 margin, and all **16** artwork
  answers over the committed captures are identical under both.
- **Ask the directory what it holds rather than probing for it, because a derivable name is not an existing file.** A
  form's asset name follows from the game master, so nothing local says whether the game draws that form — which is the
  check `assetBundleValue`'s absence was accidentally doing. Dropping it without a replacement would probe all 237 forms
  and 404 on **84**, worse noise than the 23 it set out to fix. One subtree call answers it instead:
  `git/trees/master:Images%2FPokemon%2FAddressable%20Assets` is 3,522 names in 146 KB with `truncated: false`, cached
  beside the game master under the same week. Zero 404s, zero wasted requests, and the 11 families short of an icon are
  named once ahead of the download instead of discovered per form per scan. Use the **subtree** endpoint: `contents`
  caps at 1,000 entries and truncates without saying so.
- **The ordinary form's icon is the bare `pm{dex}.icon.png`, and it is a fallback rather than a replacement.** No
  `fNORMAL` exists for 14 of these families, so without the bare name Frillish's male is the one member of its pair with
  no icon and the artwork declines a blue against a pink for want of a file that is there — 14 families and 28 forms,
  the gender pairs and the `Copy 2019` ones among them. `GENESECT_NORMAL` is why it is a fallback: it has an `fNORMAL`
  and **no** bare name, so taking the bare name for every ordinary form loses Genesect. And offer it to the ordinary
  form only, since `RAIKOU_S` given it as a fallback would hand two forms one icon and so one signature.
- **Assert that no two forms of a family share an icon, because that is the property the old key broke silently.**
  Zygarde's `FIFTY_PERCENT` and `COMPLETE_FIFTY_PERCENT` both carried `1`, so one file was fetched twice, the two scored
  identically and the abstention read as the artwork being indecisive rather than as the key being wrong. It is one test
  over the **vended** game master, so it needs no network: 41 families, 153 forms, 0 clashes. Assert both halves of the
  partition non-empty beside it — a resolver answering null for everything leaves `drawn` empty and one answering a name
  for everything leaves `short` empty, and each passes a clash check that has nothing to compare. All three mutations
  fail the test and the pristine fixture passes.
- **The game master lists what the data knows; the directory holds what the game draws.** That is why "no icon" is a
  sound gate rather than a gap to work around: Spinda's game master carries 20 patterns against 9 released and 9 icons,
  and Scatterbug and Spewpa have none at all, only Vivillon ever showing the pattern.
- **Re-recording a signature can move which declines are saves without moving a single answer.** Re-reading `ARTWORK`
  off the new icons left all 19 answers identical and still flipped two rows of the suite's `rescued` list —
  `keldeo-resolute.png`'s nearest became right and `genesect-chill.png`'s became wrong. Both sit in clusters whose
  margins are 0.02 and 0.146, so a 0.01 shift reorders them; it is the margin, not the ranking, that is load-bearing,
  and a test asserting the ranking has to expect it to move.
- **Basculin is reachable now and still declines, which is worth keeping as the second negative control.** Its three
  icons are 0.221 apart at their closest and sit almost entirely in one hue bin, so all three captures abstain — and the
  nearest icon is Blue Striped for every one of them, **wrong for two**. Taking the nearest regardless would be
  confidently wrong twice, which is the margin earning its place on a family that was previously unreachable.

### Pinning a reader with a committed capture

`pnpm test:inventory` runs `scripts/inventory/screens.test.mts` over 62 real screenshots in
`scripts/inventory/fixtures/`. Every reader on the detail screen is a pure function of one screenshot, so the screenshot
is the whole of what a test needs — no phone, no network, and a hermetic `GameData` of eighteen type names for
`parseDetail` plus, for `identify`, 122 forms over 41 species and the 101-entry CP multiplier table, each value read
once out of a real `loadGameData` and recorded in the file. 1,133 tests in about four minutes, OCR being all of it: each
attribute is a subtest under a parent per capture, so a failure names the reader that broke, and the reading is memoised
per capture, which is why the assertions are free and only the 62 OCR passes cost anything.

59 of the captures are a `Fixture` row, 30 species between them. The other three are not detail screens with a readable
Pokémon and so cannot be rows — `overworld.png` is the map, and `no-pgsharp.png` and `pgsharp-no-overlay.png` are one
Squirtle captured with PGSharp absent and with its toolbar up — so they are asserted as negative cases instead, which is
the half of a corpus that valid screens cannot state: no overlay found, no HP, nothing `identify` could narrow.

- **A row says what the Pokémon is, not what the readers answered.** Every field is the game's own statement of it: the
  CP above the artwork, the name and the HP under it, PGSharp's level and IVs over the middle, all readable off the
  committed file by anyone who opens it. So the assertions are what the readers must agree with rather than a transcript
  of whatever they said first. What the orientation buys is measurable rather than tidy, and it is the CP: `cpOf`
  derives one from the form, the IVs and the level's multiplier where the screen states it outright, and the arithmetic
  cannot be wrong, so the two meeting means the form, the IVs and the level are every one of them right. A table
  recording `cp` as whatever OCR made of it can only cross-check the captures OCR read a CP on, which is **20** of the
  59; a table recording what the screen shows reaches the **56** where `identify` settles on exactly one level, agreeing
  on 50. The other six are the check doing its other job rather than failing to run: each derives a CP that disagrees
  with the screen, which is the pipeline saying the form or the level is wrong. It is also what settled the Ho-Oh below
  to the digit, where a transcript could only have recorded the wrong answer.
- **Pin a figure the prose quotes in a test, because prose is the one part of a test file no test reads.** That docblock
  claimed the cross-check landed on **39** of the 61 for as long as nobody measured it, where it is 32, through a green
  1,169-test suite — a count is exactly the kind of claim that rots silently. `COVERAGE` in that file is now eleven such
  figures asserted in one `deepStrictEqual`, counted off `FIXTURES` rather than transcribed, with the partitions (40 +
  1 + 20 = 61, 32 + 8 = 40) asserted beside them so three counts cannot all be right and still sum wrong.
- **Select a fixture with a search that pins every attribute at once, and commit the search beside it.** A capture
  chosen because a sprite looked small is only as good as the eye that chose it, where
  `xxs&female&!lucky&!shiny&!costume&!background&!shadow&!purified` is the game stating all eight and is falsifiable:
  re-run it and the first match is in the set the row claims. That is where a row's `size` and its six flags come from.
  Negation is the half that only the search can give, too, since nothing on the screen says a Pokémon is **not** lucky —
  so the seven searches live in a table above `FIXTURES` rather than in the rows, the rows having become statements
  about the Pokémon and a search being neither that nor a reading. A capture is named for its species for the same
  reason, and the species is still a field, because two of the 61 are Smolivs and two print the nickname `96%` where
  their species should be: a file name is not a column. The other 54 rows have no search behind them, which is weaker
  provenance and worth saying so — they arrived named for a form, a treatment or a missing overlay, and the name is a
  claim the rendered screen then has to bear out.
- **Re-encode a capture as colour-type-2 RGB before committing it.** The phone hands over RGBA with a fully opaque alpha
  channel, so dropping it is lossless. Verify it by decoding the output back and comparing every non-alpha byte, since a
  re-encode that quietly changed a pixel would move the very readings the fixture exists to pin. The corpus comes to 53
  MB against a `.git` of 56 MB, which is the real cost of this and worth stating rather than discovering — and **57 of
  the 64 are still colour type 6**, every one of them with a uniformly opaque alpha channel. Re-encoding those 57 as RGB
  takes 50.3 MB to 35.6 MB, so **14.1 MB, 29%, is recoverable and lossless**, verified byte for byte on two of them.
- **`encodePng` cannot do that re-encode, and a filter-0 encode is the wrong way to measure it.** `png.mts` writes
  `[8, 6, 0, 0, 0]` into every IHDR, so it only ever emits colour type 6 — whatever produced the seven committed RGB
  captures was not this repository. Use adaptive row filtering when measuring, too: the phone's own files are adaptively
  filtered, and a filter-0 re-encode makes those seven **larger** by 0.6%, which would read as the saving not being
  there at all. No `optipng`, `pngcrush` or ImageMagick is installed on this machine, so the encoder is yours to write.
- **Assert every field, and put the disagreement in a `defects` field rather than leaving the field out.** A field
  quietly dropped from an assertion is indistinguishable from one that passes, which is what the earlier shape cost:
  `heightM` was left out because the badge corrupts it, `name` because one fixture is nicknamed `96%`, and `cp` because
  `cpOf` derives it — three readers free to change their answers unremarked. So the row states the truth and an optional
  `defects` beside it states what the reader answers instead, which is the inverse of recording the reading and
  softening the row: fixing a reader fails here and has to say so. **22 of the 59 carry one**, eleven of the fourteen
  `Defects` keys are in use, and the corpus test asserts the pinned set _exactly_ rather than one `ok` per key — so a
  key arriving is as loud as a key leaving, and `box`, `favourite` and `tags` being absent is the record of three
  readers fixed. It also asserts that some capture carries none, 37 doing so, since a reader wrong everywhere would
  otherwise pass every row it had an entry in. Read the keys rather than testing them for truth: some of them are
  `null`, and a truth test files those as absent.
- **Two absences are two defects and a row has to say which.** `findOverlay` finding no box is `defects.box: null` where
  PGSharp drawing no overlay at all is `overlay: null` on the row itself — so a row that conflated them could not say
  whether the reader was wrong or right. Only the second is left: `findOverlay` has stopped missing a box that is on the
  screen, so `defects.box` is asserted as an empty list rather than deleted, which is what makes a capture needing it
  again visible. `defects.iv` is the third stage and holds a triple as well as a `null`, since `readOverlay` can read
  one that is simply wrong — `basculin-blue.png` at `3/3/5` for an `8/3/5` is the only row left whose IVs are.
- **A reading the whole corpus agrees on compares equal for ever and reads exactly like agreement.** 59 of the 61 carry
  no chip, so a `tagsOn` returning `[]` unconditionally passes every row but two; 54 wear no badge, so a `sizeOf`
  returning null passes 54. So assert the corpus's own coverage in a test of its own — that both sides of each flag
  appear, that the size column holds all four bands and none, that some fixture carries two chips — and check that
  dropping a fixture makes **that** test fail, which it does.
- **Assert a gap in the corpus as the gap it is, rather than leaving it to be discovered — and then fill it.** `shadow`
  and `purified` were false on all eight of the original captures, so nothing said either column was ever filled in and
  the coverage test could not ask for both sides of them; asserting that they were all false is what made the hole
  legible. `snorlax-purified.png` and `thundurus-shadow.png` are what the assertion was for: each failed that line on
  arrival and got read into a row instead of silently joining a pair with one side, and the coverage test now asks for
  both sides of all five flags.
- **A regression fixture needs the trap asserted present, not just the reader asserted right.** The status-bar row's
  assertions would read identically on a capture whose status bar held nothing to trip over, so a separate test asserts
  that a line above the panel still OCRs as a loose measurement and that it is not the height. A capture is a file and
  cannot change; which lines Tesseract finds in it can.
- **Mutate every reader and account for each break that survives.** Nineteen breaks over these eight fixtures: sixteen
  caught, by between one and seven fixtures each, and three shown unreachable rather than left as a bare 0 — the
  zero-versus-non-zero fractions above, a `patchIn` bounding box one pixel narrow (the pill has white padding and the
  crop feeds OCR, so a pixel changes no reading), and `SIZE_FILL` at 0, which only ever skips the OCR early: with no
  saturated pixel `patchIn` answers a degenerate box, `crop` clamps it, and the badge still spells nothing. That last
  one says `SIZE_FILL` is a cost control and not a correctness check, which is worth knowing before tightening it.
- **Grep a mutation harness's own output at your peril.** One pass reported `pass=0 fail=1 caught=[]` for a break that
  was in fact caught — the figure came from a parse of the test runner's output, not from the runner. Print the failing
  test names the runner printed, and print a run that did not complete as a failure rather than as a number.
- **`node --test` prints `spec` and not TAP, even into a pipe, so there is no `not ok` to grep for at all.** That is the
  mechanism behind the bullet above, and it reads as a weak corpus rather than as a broken parse: every verdict comes
  from the exit code and every break is recorded as having been caught by nothing. A failure is a `✖` line, and the
  runner also prints its own `failing tests:` block — but that block lists leaves _without_ their parents, so where
  eight captures each own a subtest called `identify levels` it cannot say which capture failed. Parse the indented live
  log above it and rebuild the path from the `▶` lines. Then cross-check the parse against the exit code and print the
  disagreement as `INCOHERENT`, which is what stops a verdict being banked for a run the harness could not read.
- **A mutation pass over this suite need not edit the tree at all.** The test resolves its fixtures from
  `new URL('fixtures/…', import.meta.url)` and `screens.mts` imports only three siblings, so a copy of the four modules
  under `/tmp` beside a symlink to `fixtures/` runs the same suite — verified by a pristine control answering the same
  166 pass off-tree. That retires the signal-handler hazard rather than managing it, and it is not merely tidier:
  captures were being taken out of this checkout while a pass was running, so an in-place mutation would have handed a
  live scan a deliberately broken reader.
- **Run the whole pipeline on every capture, not on the one that looks hardest.** `identify` was asserted on the Unown
  alone, and a break making `levelsOf` admit any HP at or above the one read survived it: the Unown's own shortlist is
  `[1, 6, 16]`, whose largest member is already the true level, so nothing it could admit changes the answer. Asserting
  `identify`'s form, levels, CP, nickname, alternatives and notes on all eight takes that break to **five captures
  failing**, and costs no wall clock, the reading being memoised and the arithmetic free. Assert the two properties that
  make it catchable in a test of their own — that some capture's shortlist offers a level **above** its true one, and
  that some capture's does not contain its true level at all — since a corpus can quietly lose either. They belong in a
  test that reads them off the captures rather than in a column of the table, a shortlist being a reading and not a fact
  about a Pokémon, and that is also what keeps the second one honest: `fixtures/spoink.png` is offered `1` alone for a
  Pokémon at level 7, so its HP is the only thing that settles the level.
- **Account for a survivor over every capture on the machine, not only over the committed eight.** Three of twelve
  breaks in the second pass survived and the git-ignored snaps settle all three by derivation, which is cheaper than a
  fixture and does not commit an account's data. Dropping the name reader's second filter, the one that removes a
  CP-like line, moves **0 of 23** captures: `l !== cpLine` already takes the one CP each screen has, so the filter earns
  its place only where OCR reads a CP twice, and no real screen here does. Narrowing `OVERLAY_SUFFIX_CHARACTERS` from 5
  to 1 reads the bracketed form identically on every Unown here and reads one capture _better_, for the reason
  [the overlay section](#reading-pgsharps-overlay) now records — and a mutation that improves a reading is not a defect,
  so nothing can catch it. The ternary intersecting the overlay's shortlist with the levels the HP admits moves **1 of
  23**: it needs an HP that two adjacent half-levels both reproduce _and_ an overlay naming one of them, which
  `pikachu-santa-hat.png` has at 76 HP for level 22.5 or 23 and no fixture committed at the time had at all.
- **Re-run a survivor once the corpus grows, because "unreachable with this data" is a claim about the data.** That
  ternary is now caught: `pikachu-santa-hat.png` and `cherrim-sunshine.png` are both committed rows, and dropping the
  intersection moves exactly those two of the 64 — `[23]` to `[22.5, 23]` and `[31]` to `[31, 31.5]`. Measured off the
  recorded readings rather than by running the suite, which is seconds instead of three minutes: import the real
  `identify` and a copy of `screens.mts` with the one line changed, and diff their answers over every capture.
- **A cut-down game master is honest only once it is measured against the real one.** The 122 forms recorded in the file
  and a real `loadGameData('.cache/inventory')` carrying 1,449 over 1,024 species answer `identify` identically on **all
  64** captures, field for field — form, CP, levels, nickname, alternatives and notes — down to one capture's five
  alternatives and all three of its notes, and including the map, where both decline. It works because `identify`
  narrows before it chooses — by species where the name matched, by type and HP where it did not — and because the
  costume fold collapses Pikachu's 69 forms and Unown's 28 to one each. Unown's 28 and Spinda's 20 are all kept even so,
  since PGSharp's bracketed form chooses between them _before_ the fold. `closest` was measured on the same footing, 41
  species against 1,024: both answer null for each of `ate`, `ee JEN`, `aals15` and `Nickname`, and `Nidoran♀` for
  `Nidorano`.
- **Note that `loadGameData` is `async`, and type stripping will not catch you forgetting it.** Reading `.forms` off the
  un-awaited Promise answers `undefined` at run time rather than erroring, because Node's own type stripping erases the
  annotations without checking them — so a one-off probe run with `pnpm exec node` has none of the help
  `pnpm lint:types` would have given. It surfaces as `Cannot read properties of undefined`, several lines after the real
  mistake.
- **Asserting a field the suite used to discard is what finds a defect; pin it rather than fixing it in the same
  change.** Five findings across three of the eight captures, each pinned in that row's `defects` and stated with its
  evidence in the suite's own docblock. The one to know about is not a reader at all: `fixtures/ho-oh.png` is **answered
  as a Charizard and is a Ho-Oh**. Its nickname hides the species, five forms fit Fire/Flying at 152 HP after the fold,
  and `fits` asks whether _some_ level reproduces the HP and checks the level the overlay states only afterwards,
  against a form it has already chosen — where of those five only Ho-Oh shows 152 HP at the `L25` the capture states.
  The CP settles it outright and is the strongest evidence of the lot, which is the first bullet of this section paying
  for itself: a Ho-Oh at level 25 with 13/15/15 derives **2738**, the `CP 2738` the capture prints, where the Charizard
  answered at level 34.5 derives 2640. Its 246.49kg and 4.6m agree too, against a Ho-Oh's base 199kg and 3.8m and a
  Charizard's 90.5 and 1.7. That is a one-clause change to `fits` and a change to what the code does, so it is a pull
  request of its own and not part of writing the tests.
- **Replacing a capture under its own name is the one edit the corpus cannot see coming, so re-read it.** A commit
  swapped `thundurus-shadow.png`, `nidoran-male.png` and `nidoran-female.png` and added three more, touching no test: 11
  failures, and only the three _added_ ones were caught by anything structural — the census test, which compares
  `fixtures/` against `FIXTURES` and `NEGATIVE`. The three _replaced_ ones failed as eight scattered reader
  disagreements, which reads as the readers having regressed rather than as the rows describing a screen that is gone. A
  capture is a file and cannot change; which file wears a name can. So re-read a replaced capture off the image and
  rewrite its row, and treat a cluster of reader failures confined to one capture as a question about the capture.
- **The CP cross-check found a second mis-identification, which is what says the first was not a one-off.**
  `thundurus-shadow.png` is **answered as a Therian and is an Incarnate** — the two differ in attack and defense and
  share a stamina, so the HP cannot separate them and the fold keeps the shorter name. Incarnate at the `L20` and
  `7/7/10` PGSharp states derives exactly the `CP 1792` the screen prints, where Therian derives 1965. It is the
  [Ho-Oh](#pinning-a-reader-with-a-committed-capture) finding with a different cause, and the reason the CP _narrowing_
  does not simply fix it is worth knowing: no line carrying the CP label was recognised on that capture, so `detail.cp`
  is null, and the unanchored band read answers `192` for the 1792 — a number no Thundurus form reaches at any level,
  which is `cps` being handed over as candidates working exactly as intended and narrowing nothing.
- **A Pokédex entry is the negative case the map cannot be.** `overworld.png` declines because nothing on it reads at
  all, so it says only that the readers do not invent. The three Pokédex captures are a screen the readers partly _can_
  read — `typesOf` gets `Normal`, `Grass` off Deerling's icons and `Poison` off both Nidoran, and every other field is
  absent, the name included, though the game prints `0585 DEERLING` exactly where the detail screen's name sits. So they
  say that reading **something** is not enough, which is the case a walk actually meets: the Pokédex is one tap from
  storage. They are provenance as well — `nidoran-male-pokedex.png` prints the `♂` the detail screen loses to
  `Nidorano`, and `deerling-pokedex.png` names all four seasons under the artwork.
- **Read a ghosted downscale as a bug in the viewer, not as a capture taken mid-swipe.** Inspecting a committed capture
  by eye wants a downscale, `png.mts` has `scale` for whole multiples only, and a nearest-neighbour one at 2.5× needs
  `Math.floor` on **both** coordinates before the 4-byte pixel stride. Without it the byte offset lands mid-pixel, which
  rotates the channels and shears each row — and the result looks precisely like a screenshot caught during a horizontal
  page transition, which is a thing these screens really do.

### What the detail screen will and will not tell you

Worth settling once, since two of these look as though they ought to be readable and are not. Checked by opening one of
each and reading the whole screen down to `SWAP BUDDIES`.

- **The size is on the screen, in four bands and not two**: a pill saying `XXL`, `XL`, `XS` or `XXS`, drawn over the
  height. So it is read rather than searched for, and the four are no longer flags. Checked against the game's own `xxl`
  search, which marked the same Applin — 5/2/15 at 0.33m — that the badge does. `src/search/terms.js` already had all
  four, and modelling only the two extremes meant `XL` and `XS` read as nothing at all.
- **Try the longest badge first.** `XXL` contains `XL` and `XXS` contains `XS`, so a list searched shortest-first
  answers `XL` for every `XXL`. Two of the eight committed fixtures catch that on their own.
- **The pill's hue tracks the superlative rather than the size, so find it by saturation and never by colour.** It is
  gold where that measurement is also a personal record for the species and teal where it is not:
  `scripts/inventory/fixtures/unown.png` carries rgb(192,160,64) under a `SHORTEST` where `fixtures/smoliv-xxs.png`
  carries rgb(96,192,192) under a plain `HEIGHT`, its gold `LIGHTEST` being over on the weight instead. A gold test
  therefore answers only for a Pokémon that happens to be the tallest or shortest of its kind, which is why it read **0
  of 78** real captures. Any hue at all separates it from a panel that is neutral rgb(224,224,224), and finds all four
  bands.
- **Anchor that band on the height alone, not on the row the height shares with the weight.** The pill sits above the
  height, and a band taken as a fraction of the screen's width instead reaches past the right edge of the panel into the
  page behind it, which is saturated navy and swamps anything the pill contributes. It is also what kept the older gold
  test honest only by luck: the tall narrow patch of gold in one capture's artwork that passed it was in reach of the
  wide band and is not in reach of this one.
- **Crop to the pill before reading that badge.** The text is white and so is the panel around it, so isolating the
  white over a band containing both turns the panel black as well and hands Tesseract a black page with one white island
  in it — legible to a person, unreadable to anything else. The pill is the only thing that separates them: find it by
  saturation, crop to it, and the badge becomes the whole page, where the text really is dark on light. The saturation
  is a cheap pre-filter too, since most Pokémon have no badge — but not a sufficient one, so the text still has to spell
  one of the four.
- **The badge corrupts the height it is drawn over, which is a defect and not a quirk of one capture.** The pill's tail
  points down into the digits, so `fixtures/spoink.png` renders `1.1m` and reads `1.4m`. It is the tail's position
  relative to the digits that decides it rather than the badge's presence: `fixtures/xurkitree.png` wears the same gold
  `XXL` and reads its `5.78m` correctly, because there the tail lands in the gap above the `8`. So a height from a
  badged screen is suspect and a height from an unbadged one is not.
- **A costume says nothing at all.** A costumed Pikachu is named `Pikachu` like any other and differs only in the
  artwork, so costume can only come from the game's `costume` search, as a flag pass.
- **Lucky, unlike costume and shiny, _is_ on the screen: the game draws `LUCKY POKÉMON` in green under the nickname.**
  Visible on `scripts/inventory/fixtures/ho-oh.png`, and it is the game's own text rather than PGSharp's, so it scales
  with the screen and is generalisable the way the size badge turned out to be. Nothing reads it yet — `lucky` is still
  a flag pass, which is a walk of every lucky Pokémon in storage — so this is an opportunity rather than a trap. Do not
  confuse it with the `Lucky ☘` **chip** on the same capture, which is one of the account's own tags.
- **Tags are on the screen, as chips under the HP** — and finding that out took being told, because the check that said
  otherwise could not have found them. Eighty-seven captures showed nothing between the HP and the weight, and not one
  of those Pokémon was tagged: a band that is empty on every screen you own reads exactly like a band that is always
  empty. The one tagged Pokémon that had been opened was only ever captured _scrolled_, with its chip above the fold. So
  `--tags` names the tags to expect and nothing is searched for, which is a walk of 76 Pokémon saved.
- **A chip is white on a coloured pill, so the colour finds it and the columns separate them.** One pill per tag, side
  by side, so reading the row whole would run the names together; a run of coloured columns is one chip. Match what is
  read against the names rather than trusting it, since `Trade to 0xNULL` comes back as `Trade to OxNULL` and only
  agrees once folded.
- **A chip named `Shiny` or `Lucky` is still one of the account's own tags, not a reading of the Pokémon.** Confirmed by
  scrolling storage's own TAGS tab, which is where the vocabulary comes from: `Favorites` 1836, `Perfect` 406,
  `Shadow ●` 21, `Mega Ω` 33, `Background ⛶` 24, `Lucky ☘` 24, `Level 50` 19, `GBL` 7, `Dynamax ⌗` 5, `Purified ○` 1. So
  a chip reading `Shiny` is evidence about the player's filing and none at all about the Pokémon, which is why `shiny`
  is still a flag pass on an account that happens to tag its shinies. The emoji inside the pill reads as letters —
  `Shiny ✦` comes back `Shiny SJ` and `Lucky ☘` comes back `Lucky Me` — so the vocabulary is what turns a chip into a
  name.
- **Look in the top of that gap, not all of it.** The type icons sit at the foot of it and are coloured too, and a
  Pokémon whose types are colourful — a Woobat against a Normal-type Glameow — has them in the same columns as its chip.
  That makes one run of the two and drops its fill from 86% to 34%, which reads as no chip at all: three of six
  known-tagged Pokémon were lost that way, and all six read once the band stopped short of the icons.
- **Derive that band's floor from the gap rather than writing a fraction down, because the margin is a pixel wide.** At
  0.45 of the gap the band clipped `scripts/inventory/fixtures/ho-oh.png`'s two chips, which span rows 44–110 of the
  gap's 220, to a height of 55 against a floor of 2244 × 0.025 = 56.1 — so both chips of the only tagged capture in the
  corpus were discarded by **1.1 pixels**, with their fill at 0.86 and nothing reporting it. Taking the whole gap is no
  better, since that is the merge above. What makes it derivable is that the icons always reach the gap's bottom row and
  a chip row never does, so the floor is the top of the last run of coloured rows, read off the gap itself: 188–219 for
  the icons with 77 blank rows above them, against 44–110 for the chips.
- **A pass reads most of its set, not all of it.** Before the tags were read off the screen, a pass over
  `Trade to 0xNULL` marked 73 where the game says 76 have it, without the walk ever reporting that it gave up. Read a
  pass's count against the number beside the game's own search and treat a few per cent short as ordinary; on a large
  set — `shiny` is 733 here — that is tens of Pokémon whose flag will be blank rather than wrong.

### Reading a move against what the Pokémon can learn

The game master carries `quickMoves` and `cinematicMoves` per form, and `eliteQuickMove`, `eliteCinematicMove`,
`nonTmCinematicMoves` and the shadow pair beside them. Together that is a median of **seven** moves against the 328 a
row was being matched against, and matching against the seven is the single largest thing that can be done for the moves
— 45 of 50 fast moves and 45 charged before, 50 and 50 after.

- **A small candidate set affords slack a large one cannot.** `oO Tackle`, where the type icon has come through as two
  letters, is two edits from `Tackle` and was rejected outright at the slack the full list needs. Against a pool of two
  it is not close to anything else. Keep the full list as a fallback, since a Pokémon can still hold a move the game has
  since dropped from its pool, and `Smeargle` has no pool at all.
- **Bound the region below as well as above.** `GYMS & RAIDS` sits immediately above the moves and nothing else does,
  which makes it the anchor — found on all fifty screens — where the weight and height are most of a screen away. Below
  them, `CAUGHT IN THE WILD` and `São Paulo, Brazil` are ordinary prose, and reading down into them produced a `Rest`
  and a `Fly` that neither Pokémon could learn. A row that is all digits is the power, not a move.
- **A rescue read answers only to the pool.** Cropping a row and reading it again on its own recovers the ones the
  whole-screen pass half caught — `t Breath` for `Frost Breath`, icon and first letters gone — but it is the least
  trustworthy text on the screen, so offering it the whole list is how `Rest` and `Fly` got in. Restricting the rescue
  to the pool and the region to the tabs took the band reads from 20 per screen to 0.5 and the false matches to none.
- **`NEW ATTACK` cannot be used to tell whether a second charged move exists.** It is white on a green gradient and
  never reads: 0 of 75 screens, on screens where a crop shows it plainly. Count the move rows instead — 60 of 75 have
  exactly two, which is what one fast and one charged looks like.

### Two ways a reader fails without reporting anything

- **A crop that clips one end keeps what is at the other, and that reads as a success.** The overlay box is sized from
  the width of one character, estimated from whatever line was recognised — often the three IVs alone, which
  under-estimates it. A box tightened on one Pokémon then clipped the `L31` off the next while keeping its IVs, so the
  read succeeded, nothing widened the box, and only the level was gone. Widening on a failed read does not cover this;
  the answer is to reach further than the text can need — 19 characters reads 49 of 50 levels and 30 reads all of them.
- **That holds leftward and not rightward, because what sits to the right of the overlay is the shiny sparkle.**
  `OVERLAY_SUFFIX_CHARACTERS` reaches past the IVs for the bracketed form PGSharp appends, and measured over the 23
  captures on this machine, 5 characters buys nothing a single character does not — the form reads identically on every
  Unown — while costing one capture its whole overlay: `unown-m-shiny.png` yields no level and no IVs at reach 5 and
  yields both at reach 1, the `✨` falling inside the wider box and garbling the triple. So the two reaches are not one
  constant with two ends. Expect a mutation narrowing this one to **survive the fixtures**, and read that survival as
  the measurement rather than as a gap.
- **That survival outlived the reason first given for it, which is why a prediction needs re-measuring and not just
  repeating.** The explanation was that the corpus held a single Unown. It now holds five — `unown.png`, `unown-b.png`,
  `unown-exclamation.png`, `unown-m-shiny.png` and `unown-question.png`, with `unown-m-shiny.png` among them — and the
  mutation still survives, because **all five read byte-identically at reach 1 and reach 5**, levels, IVs and bracketed
  form alike. `unown-m-shiny.png` in particular yields `null` at _both_ reaches against the box `findOverlay` finds for
  it, so the committed capture does not reproduce the sparkle effect measured on the snaps; whatever rescued it there
  was the box and not the reach. Its row carries `defects.iv: null` for that reason. Same verdict, different mechanism,
  and only re-running it says so.
- **The unit is the part of a measurement that goes.** A Cyndaquil's `5.42kg` came back `5.42k` and was thrown away for
  want of a `g`. Match the number: every weight and height the game shows carries a decimal point, and the stray digits
  a crop picks out of the artwork do not. The decimal point is load-bearing and the screen furniture is where it bites:
  `scripts/inventory/fixtures/xurkitree.png` has `0900 M © Os` at y38 — a 24-hour `09:00` with a notification icon OCR'd
  as an `M` — which a `/(\d+)\s*m\b/` takes in preference to the real `5.78m` 1,137 pixels below it, and `sizeOf` and
  `typesOf` are both anchored on that line and go with it. PGSharp's overlay is the second source, reading
  `L16 1v53 m 0/7 (B` on one capture where the IVs garbled into a ` m`. Two of 78 captures reach it, so a corpus can
  easily hold none: of the eight committed fixtures only the status-bar one does, the other seven having been taken at
  13:xx with no icon beside the clock.
- **Measure each phone on its own.** Running both corpora through one harness shares a box that widens as it goes, so a
  box grown on one phone's screens rescues the other's and a real regression reads as a pass. Two phones measured
  together said 24 characters was worse than 19; measured apart, it was neither.

### Waiting for a screen rather than guessing at it

- **Watch the panel for movement, never the frame.** A fixed sleep after a swipe can only guess, and comparing whole
  screenshots never settles: the artwork holds an animated Pokémon that never stops and the status bar ticks with the
  clock. The game's own panel does settle, and quickly — measured through one swipe at 31%, then 6.2%, then 0.54% and
  steady — so watch `0.34` to `0.95` of the height and call anything under 2% still. Do not wait for zero; it does not
  come, and 0.5% is what a settled screen looks like.
- **Accept a reading only once something fits it.** A key that exists says the HP was read, not that the screen was
  finished. The name, the types, the HP and the IVs all agreeing on one form is what a half-drawn screen cannot fake, so
  `readDetail` asks `identify` and reads again if nothing fits. Over twenty-five Pokémon that took the IVs and the level
  from 23 to 25 of 25 and cleared every `searched every species`, for about 10% more time per Pokémon.
- **Count what is right, not what is filled in.** Gender came back 23 of 25 and looked like the next thing to fix; the
  two blanks were Xerneas and Articuno, which have no gender. A blank is only a miss where the screen had something to
  read, so check what the empties are before believing a ratio — and before spending a morning on one.

### Reading the moves, and opening the right Pokémon

- **Anchor the move floor on a line that names HP, not on a pair of numbers around a slash.** `parseMoves` drops
  everything level with or above the weight and height, and used any `d/d` to find that row. Two other things on the
  scrolled screen match it: PGSharp's overlay, which separates three IVs the same way, and `30/09/2026` in the catch
  details — and that date sits _below_ the moves, so the floor landed past them and every Pokémon of a live scan came
  back `moves not fully read` against a screenshot with `Astonish 7` and `Struggle 35` plainly on it.
- **A charged move's energy bar OCRs as a couple of short nonsense tokens beside the name.** `© Energy Ball ay Ay` is
  four characters past `closest`'s slack and matched nothing, which is why the only charged moves read at first were
  `Struggle`, the one move with no bar. Try the whole row first and drop short trailing tokens one at a time only while
  nothing has matched — longest-first is what stops `Aqua Jet` being shortened to `Aqua`, which matches nothing and
  would trade one silent loss for another.
- **Take the first tile's column from the configuration and only its row from the grid.** How far down the first row
  sits depends on whether a search is showing, so it has to be read; which column is first does not, since the grid is
  three even columns and 0.18 of the width lands in the leftmost on both phones. Taking the column from the label too
  means opening the _second_ Pokémon whenever the first one's CP fails to OCR — in an `xxl` grid of five the top row's
  only legible label was the middle tile's, so every walk began one along. It cost a member of every flag pass and the
  first Pokémon of storage in the full one, and it showed up only as a count one short of what the search reported.
  Check a flag pass against the number the game puts beside the search box, since nothing else notices — but let it
  settle before reading it. That count is transient: it is drawn while the grid is still filtering and reads the
  previous search's figure, or nothing at all, for a moment after the text goes in. A count read too early is worse than
  no count, because it is the one number a pass is judged against.
- **Read a detail screen more than twice before believing it.** A screen still settling has no HP on it and no overlay
  yet, and one bad read costs a whole member of a flag pass — which is a Pokémon the full pass then never learns was in
  the search, rather than a row with a gap in it.

### What the detail screen tells you without OCR

Three of the CSV's columns are pixels rather than text, and one that looks as though it should be is not.

- **CP is derived, never read.** It is a pure function of the base stats, the three IVs and the level's multiplier, all
  of which the overlay and the game master hand over exactly, so `cpOf` answers 635 for a level 31 Shroomish at 10/7/10
  where OCR answered null. Where OCR does read a CP, a disagreement is worth a note rather than a correction: the
  arithmetic cannot be wrong, so the two differing means the level or the form is.
- **A favourite's star is solid gold and an ordinary one a white outline**, which colour settles outright — 19.4% of
  that corner gold against 0.00%, over eighteen captures from two phones. The star is the game's own furniture rather
  than PGSharp's, so it scales with the screen and a fraction holds where one for the overlay did not: 0.900, 0.074 of
  one phone against 0.903, 0.080 of the other.
- **Gender is shape, not colour.** Both symbols are drawn in the same pale blue-grey, so only the outline separates
  them: a male's arrow leaves the circle up and to the right and a female's stem hangs below it, making the female's ink
  taller than wide and the male's square. 1.51 against 0.99 on one phone and 1.51 against 1.00 on the other, so one
  threshold serves both. Find it by where the HP is rather than by a fraction of the screen, and read no ink as no
  gender rather than as a failure — all seven Xerneas captures report none, which is right.
- **Derive what the ink is darker _than_ from the panel, because a level named outright is above it.** The panel is
  rgb(224,224,224) and the symbol's own body is 175, so an ink test of "below 235" silhouettes the **panel**: every
  pixel of the crop matches, the fraction is 1.0, and the ratio that was meant to measure a symbol's outline is
  measuring the crop's own aspect — which means the gender was being decided by how tall OCR thought the HP was. **32 of
  78** real captures named a gender for a Pokémon that has none. Read the modal luminance of the region and go 20 below
  it, and the same captures answer 1.00 male, 1.51 female and no ink at all for genderless, with the panel at 224 in
  91–100% of every region measured. A threshold above the background it is meant to exclude fails in the direction that
  looks like success, so measure the background rather than assuming it is white.
- **Two of these three fractions separate zero from non-zero, not small from large, so those two constants are headroom
  and not discriminators.** Measured over all 64 committed captures: the badge band is **exactly 0** saturated pixels on
  56 of the 63 with a readable height and 11.3–22.3% on the other seven; the gender region is exactly 0 ink pixels on 22
  of the same 63 and 2.4–7.4% on the other 41. Neither has a single capture non-zero but below its threshold, so for
  those two a mutation replacing the fraction by "any match at all" is **unreachable with this data** rather than missed
  by the corpus — the panel is flat and a screenshot is lossless, so the noise the thresholds exist for is not produced
  here. Expect it on a device that scales or compresses, and do not read a surviving mutation on one of them as a gap in
  the fixtures.
- **The star corner is the exception, and it was only ever an exception waiting for a capture to prove it.**
  `FAVOURITE_GOLD` is a real discriminator and is currently **mis-set**. Over the same 64: exactly 0 gold on 51, and of
  the thirteen that are not, three land non-zero and _below_ the 2% threshold — `pikachu-willows-assistant.png` at
  1.34%, `growlithe-nickname.png` at 0.48%, `castform-normal.png` at 0.36%, all three correctly not favourites. So "any
  gold at all" is reachable here and caught by three rows, where over the original eight captures it was not. Worse, the
  nine genuine favourites run 18.18–26.49% and **`spinda-04.png` reaches 15.34% on a warm bokeh background with a white
  outline star**, so `isFavourite` answers `true` for it: a false positive with only 2.84 points of margin to the lowest
  real one. The old bullet's "19.4% on the one favourite and 0.00% on every other" was true of eighteen captures and did
  not generalise — which is the lesson rather than the number. A threshold claimed to be headroom needs the whole
  distribution, not its two ends.
- **Do not take shiny from the `✨` PGSharp appends to its overlay, however much it looks like a free answer.** The box
  it sits in is translucent, so the artwork behind it shows through, and a Hisuian Lilligant's yellow flower gives
  **202** gold pixels inside that box against the sparkle's **121** — the false positive is the larger signal.
  Restricting the search to the rows the text occupies does not separate them either, since the flower reaches into
  them. Shiny comes from the game's own `shiny` search, as a flag pass, which is authoritative and costs a walk of every
  shiny in storage.
