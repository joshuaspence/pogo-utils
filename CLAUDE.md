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

There are two idioms here and the line between them is **does a browser fetch this file**. Pages serves `master` at `/`
in `legacy` mode and `map.html` loads `<script type="module" src="src/app.js">`, so the browser reads source verbatim
and there is no build step to put a compiler in. So `src/` is `.js` typed by JSDoc, checked by `tsc --noEmit` and never
emitted; `scripts/` is real TypeScript, run by Node's own type stripping with no compiler at all. A data change still
lands on `master` directly — adding a species to `src/filters/shiny.js` needs no build, and `pnpm lint` simply checks
one more thing about it.

- **`src/recurring-types.js` is in both worlds.** `src/events.js` imports it and so does `scripts/build-ics`, so it
  stays `.js` and must assume neither DOM nor Node. Both `tsconfig.json` files include it, which is what holds that.
- **A table's type follows how it is indexed, not what it holds.** `src/countries.js` is `Record<string, Country>` and
  `SPELLINGS` in `src/pokemon/names.js` is `Record<string, string>`, not unions of the countries and constants they
  hold, because both are indexed by a value that only exists at run time: a `<pgr:country>` read out of a GPX file, a
  constant handed to `nameOf`. A union of the keys would make every such lookup an error. It would cost as well, since a
  data change [lands on `master` on its own](#landing-a-change) and enumerating the keys makes every such edit a type
  edit too — and buy nothing, because the key sets that matter are already held better than a type could hold them:
  `validate-gpx.mts` reads `COUNTRIES` against the GPX files in both directions, and `nameOf`'s `??` says outright that
  a constant absent from `SPELLINGS` is the ordinary case. The index signature is what the consumers wanted in any case.
  `COUNTRIES[country]?.code` was a `TS7053` implicit `any` in both `app.js` and `backup.js` before it and is a checked
  `Country | undefined` after, which is what those `?.`s were written for.
- **Which is why `POKEMON` is left unannotated.** It is indexed by a literal written in source — `POKEMON.PANPOUR` in a
  filter — so the object literal _is_ the enumeration, and inference names all 1,025 keys for free. That is the check
  the constants exist for, and it works: `POKEMON.PANPOURR` is a `TS2551` against a type reading
  `'{ BULBASAUR: Pokemon; … 1017 more …; PECHARUNT: Pokemon; }'` and suggesting `PANPOUR`. A `Record<string, Pokemon>`
  here would throw that away for nothing, since adding a species adds the key and its type in the same line.
- **Leave a constant to inference.** `export const GPX_PATHS = 'gpx-paths.json'` already has the literal type
  `'gpx-paths.json'` and `@type {string}` would only widen it; `src/pgsharp/scan-config.js` is the same, every field a
  literal and its one consumer stringifying the object whole. An annotation earns its place by saying something
  inference cannot — an index signature, a `readonly`, a parameter — not by restating what it has already got right.
- **An annotation reporting nothing today still earns its place if it can be shown to reject something.** The four
  `src/filters/*.js` hunt lists are `ReadonlySet<Pokemon>` and added not one error when annotated, because the lists are
  correct; the case for them is what they catch, measured by putting a stray `42` in each. All four answer
  `TS2322: Type 'Set<number | Pokemon>' is not assignable to type 'ReadonlySet<Pokemon>'`, where the same stray in the
  unannotated file was silent and the project stayed at 421. That silence cost something, and asymmetrically:
  `pgsharp/filters.js` catches it at run time, because `species()` runs `instanceof Pokemon` over every member and
  throws `species #495 is not a POKEMON constant`, while `pokedex/entries.js` has no guard at all and only asks
  `members.has(pokemon)` — so the stray is a member nothing can equal and the hunt quietly stops wanting what was meant.
  A Set holds by identity, so `25` never matches `POKEMON.PIKACHU` however much it looks like it should. The `readonly`
  is the other half inference cannot say: both consumers only read, and `.add` and `.clear` are `TS2339` now.
- **Where rejecting is not in question, localising still is.** `@type {readonly Group[]}` on `GROUPS` reports nothing
  when added and nothing is wrong with a table that has no type, so the case for it is the two-sided measurement above —
  and half of it comes back caught either way. A term with no `label` is a
  `TS2741: Property 'label' is missing … but required in type 'Term'` on the term itself with the annotation, and
  without it the same mistake surfaces forty lines down as a `TS2345` at a consumer, against a 400-character union of
  all fifteen groups' inferred shapes. Same defect, unreadable message, wrong file. So measure four runs rather than
  two: the stray alone, and the stray with the annotation removed — each against its own baseline, since removing an
  annotation moves the count in its own right. Dropping `@returns {State}` from `emptyState` _cleared_ four errors in
  `search/builder.js`, because those four are the `state.ranges.get(id) ?? {}` looseness that only exists once `Bounds`
  is real.
- **Name a type from another module with `@import`, never a run-time import.**
  `/** @import Pokemon from '../pokemon/pokemon.js' */` is a comment, so a file the browser fetches verbatim pays
  nothing for it, where `import Pokemon from …` for a type alone would add a real request. Two things about where it
  goes: `@type` does attach to an `export default`, so an annotated default export needs no rewriting into a named
  `const`, and it sits directly above a `// prettier-ignore` without either comment losing its node — verified by
  control, since Prettier reporting a hand-spaced list as clean says nothing until you have watched it complain with the
  ignore removed.
- **A `this` type is sound on a return and unsound on a field.** `Pokemon`'s `#declared` and `#target` are seeded from
  `this` in the constructor, so inference made them polymorphic — and every value they hold after that is something
  `#variant` built with a bare `new Pokemon`, which is why eight
  `TS2322: Type 'Pokemon' is not assignable to type 'this'` sat in that file before a single annotation was added to it.
  Naming `Pokemon` on the two fields cleared all eight. The builders' own `return this` stays inferred, because there it
  is true: they hand back the receiver, which is what keeps a chain typed as whatever it started as.
- **Annotate from the inside out, because a return type is a claim nothing checks while the body answers `any`.**
  Measured in two steps: with the parameters annotated but `#forms` still a bare `new Map()`, `form()`'s
  `@returns {Pokemon}` was satisfied by the `any` a `Map<any, any>` hands back from `get`. Typing the field is what made
  the return mean anything — and it then wanted `form` restructured, because a `has` and then a `get` are two lookups
  the checker cannot join. Nothing at the type level says the two calls asked about the same key, so `get` still answers
  `Pokemon | undefined` however the `has` above it went; read the result instead and the narrowing is real, which is the
  check the throw was already making.
- **`noUncheckedIndexedAccess` makes that a rule rather than a Map's quirk, and dotted access is not exempt.** A
  `Record<string, T>` answers `T | undefined` to `r.value` as much as to `r['value']`, and a `Uint8Array` answers
  `number | undefined` to `bytes[0]` — all three probed, all three a `TS2322` against a `@type {null}`. So every bounds
  test in `src/java-serialization.js` was the shape `form()` had been, a length test and then an index with nothing
  joining them. Reading the slot instead _is_ the bounds check, because a slot past the end and a slot below the start
  both answer `undefined`, and it is one lookup rather than two: `Reader#u1`, `decodeMutf8`'s two length tests collapsed
  into a single `byte()` accessor, `refHandle`'s table lookup and `object()`'s `BOX_BY_CLASS` all went that way. Each is
  load-bearing rather than tidier, measured by reverting them one at a time — `TS18048` on `u1`'s callers and inside
  `decodeMutf8`, `TS2339: Property 'value' does not exist on type 'Handle'` where the union goes unnarrowed, and
  `TS2345: Argument of type 'FieldValue | undefined' is not assignable to parameter of type 'BoxValue'` on the box.
  `Array#pop` is the same answer from a different cause: it is declared `T | undefined` whatever the flags say, so
  `parts.pop()` is a `TS2345` against a `string` parameter even where `String#split` guarantees an element. `?? ''` is
  the inert fix and says as much. `Promise.allSettled` is the same shape one level up and the costliest instance of it:
  `files[i]` read beside `results[i]` answers `string | undefined` however long either array is, because that positional
  correspondence lives in the specification rather than in the type — and `res.reason` is `any`, so the `e.message`
  taken off it was never checked at all. Settling each file's outcome inside its own callback makes the pairing
  structural, and attaches the rejection handler as that fetch starts rather than once every earlier file has settled. A
  tuple is the one exemption worth knowing: `a[0]` and `a[1]` on a `[number, number]` are `number`, not
  `number | undefined`, which is half of why `coordsOf` in `src/app.js` hands back the pair as a tuple.
- **Hold the node you made rather than asking the document for it again.** `search/builder.js` appended a chip's glyph
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
  without the `@type {readonly Preset[]}`. The annotation is what makes the deletion safe rather than merely tidy.
- **Where a type cannot pair two fields, the guard belongs where they are finally used together.** `Box` carries a
  `code: BoxCode` and a `value: BoxValue`, so `b.code === 'I'` cannot narrow `b.value` to a number — a class holds no
  discriminated pairing across two fields, and `JavaSer.box('J', 5)` type-checks clean as a result. The writer's
  `switch` is therefore the type: it asks `typeof b.value` per code and throws, which is worth having rather than merely
  tidy, since `box('I', 'x')` wrote four zero bytes for `'x' >>> 24` and 163 bytes of valid-looking stream before it.
  Two shapes were weighed and rejected as more machinery for less: a `@template` with a conditional typedef still cannot
  infer `C` from `b.code === 'I'`, and `@overload`s on the public `box` constrain the caller while leaving the writer —
  where the bug was — unchecked. What the type _can_ say, say: `classDesc`'s `superName, superUid` became one optional
  `superclass` object, because nothing said the second was present whenever the first was, and passing
  `{ name: NUMBER.name }` alone is a `TS2345` now.
- **A loop variable takes its type from its initializer.** `for (let d = desc; d !== null; d = d.super)` infers `d` as
  `ClassDesc`, because `desc` is already narrowed non-null, so the walk up to the `null` above `java.lang.Object` cannot
  assign to it — `TS2322: Type 'ClassDesc | null' is not assignable to type 'ClassDesc'`. Seeding from `desc.super` with
  `desc` pushed ahead of the loop needs no annotation at all.
- **A module-scope `let` assigned only from inside a function is `any`, and both of its readers go unchecked.**
  Inference takes such a binding's type from what is written to it _at module scope_, so `let toastTimer;` in
  `src/app.js` — written in `toast()` and nowhere else — was a `TS7034` on the declaration and a `TS7005` on the use,
  and the `clearTimeout` and `setTimeout` either side of it were checked against nothing. `@type {number | undefined}`
  is what says it, and `undefined` rather than `null` because that is already what `clearTimeout` takes for "no timer".
  This is the one case where an annotation on a variable is not restating what inference got right: there is nothing for
  inference to read.
- **`filter(Boolean)` does not narrow, and two other array idioms lose the type the same way.** TypeScript infers a type
  predicate from `filter((span) => span !== null)` and nothing at all from `filter(Boolean)`, so the latter hands a
  `(Span | null)[]` to something wanting `Span[]` — one such call was every `'possibly null'` error in
  `search/optimise.js`. `flatMap` is that shape one step along: a callback answering `Span[] | null` matches
  `U | ReadonlyArray<U>` twice over, so `U` widens to `Span | null`, where `?? []` in the callback leaves
  `Span[] | never[]` and `U` is `Span`. And a pair of pairs is not a list of pairs —
  `for (const [key, set] of [['i', a], ['x', b]])` types both bindings `string | Set<string> | undefined`, where
  `Object.entries({ i: a, x: b })` is a `[string, Set<string>][]` and destructures as one. All three are the same
  lesson: say what the array holds wherever the idiom cannot.
- **A hoisted `function` does not see a module-scope narrowing; an arrow does.** `const DEX = RANGES.find(…)` above a
  `throw` on `undefined` leaves `DEX.max` clean inside an IIFE and `TS18048: 'DEX' is possibly 'undefined'` inside an
  `export function`, because a declaration could be called before the narrowing ever ran. So a guard over a table lookup
  belongs inside the function that needs it rather than at module scope: `search/optimise.js` throws on a `terms.js`
  carrying no `dex` range when it is asked to shorten a query, which is the reading `dom.js` takes of markup a script
  cannot find its element in.
- **Two `tsconfig.json` files, on purpose.** The libs are disjoint — DOM for `src/`, Node for `scripts/` — so the
  checker can still say that a browser module reached for something a browser does not have. `"types": ["leaflet"]` in
  the root config is the other half: an empty list would leave `L` undeclared, and an unrestricted one lets any
  installed `@types` package hand Node's globals to a browser module.
- **One `tsc -b` over both of them, so `pnpm lint:types` is a single check.** Build mode takes the two project paths
  directly — no solution-style config to keep in step — and reports both projects rather than stopping at the first that
  fails. It does require `composite: true` in each, which writes a `tsconfig.tsbuildinfo` beside each config even though
  both are `noEmit`; `.gitignore` covers it. The cost of one check is that `scripts/` cannot gate separately while
  `src/` is still being annotated, so a type error there rides along with the migration's error count until the flip.
- **Counting that error total needs `--force` and `--pretty false`, and both traps read as a pass.** Build mode says
  nothing whatever about a project it thinks is up to date, so a second `pnpm lint:types` over an unchanged tree prints
  an empty report that looks exactly like a clean one; and the colour codes sit between the two words, so
  `grep -c 'error TS'` answered `0` against the same run that printed `Found 330 errors`. Count from
  `pnpm exec tsc -b --force --pretty false tsconfig.json scripts/tsconfig.json`, and account for the whole delta rather
  than the files you opened — typing `search/terms.js` cleared three errors in two modules the slice never touched and
  created four in a third, which was a real latent looseness the tables had been hiding. Expect the count to _rise_
  partway through a slice, because typing a leaf is what makes its consumers checkable: `gpx.js` went 8 to 0 and took
  `app.js` from 81 up to **83** in the same run, since `eachTrack` yielding a real `Element` made the `<trkpt>`
  `parseFloat` pair an error exactly like the `<wpt>` pair twenty lines below it already was. Read that as the
  measurement it is rather than as a regression — two blocks erroring for one reason are one block duplicated, and it is
  what said to collapse them into `coordsOf`. So annotate leaf-first and judge the slice on the total, not on the
  intermediate.
- **A `scripts/` file reaches `src/types.d.ts` as `'../src/types.js'`.** TypeScript resolves a `.js` specifier onto its
  declaration sibling, where naming `'../src/types.d.ts'` is rejected outright without `allowImportingTsExtensions`.
  Build mode also wants every file a project reads listed by the project that reads it, and two `noEmit` projects have
  no declaration output to reach each other through — which is why `scripts/tsconfig.json` names the four `src/` files
  it imports in its own `include`.
- **Run a script through pnpm, never as a bare `node`.** `devEngines.runtime` pins the Node floor that guarantees type
  stripping, and it governs only what pnpm invokes — so `pnpm build:ics` is safe where `node scripts/build-ics.mts` will
  fail outright on a Node older than 22.18. Every entry point therefore has a `package.json` script, and `calendar.yml`
  calls that rather than the file.
- **Do not hand-declare `L`.** It arrives from a CDN `<script>` in `map.html`, and `@types/leaflet` declares it with
  `export as namespace L` — a UMD global, invisible from inside a module, which is what `allowUmdGlobalAccess` is for.
  Declaring `const L` in a `declare global` instead looks tidier and does not work: it shadows that namespace, so you
  get `TS2451: Cannot redeclare block-scoped variable 'L'` plus four `Cannot find namespace 'L'` errors from inside
  `@types/leaflet` itself, reported against a file you did not write. The same `allowUmdGlobalAccess` is what lets a
  JSDoc type name reach through it: `L.Polyline`, `L.CircleMarker`, `L.PolylineOptions` and `L.CircleMarkerOptions` all
  resolve in a `@typedef` or a `@param` with no `@import` and no `TS2503`, confirmed by the errors naming
  `Polyline<LineString | MultiLineString, any>` and `CircleMarker<any>` back. What it will not do is guess a tuple:
  `LatLngExpression` accepts `[number, number]` and an unannotated `[lat, lon]` infers `number[]`, which `L.polyline`
  rejects — so a coordinate pair travelling through this file is declared as a tuple at every hop, which is also what
  buys the indexed-access exemption above.
- **`@ts-expect-error` takes a reason, in the same form as the `html-validate` exceptions above:**
  `// @ts-expect-error -- reason`, at least ten characters. `@typescript-eslint/ban-ts-comment` enforces both the reason
  and the choice of directive — `@ts-ignore` is rejected outright, because it does nothing once the line below it stops
  erroring where `@ts-expect-error` tells you it is no longer needed.
- **`any` is banned by convention only, because nothing can enforce it.** `no-explicit-any` reads TypeScript syntax, and
  a JSDoc `/** @type {any} */` is a comment the rule never sees — verified by probing it, where the bare
  `@ts-expect-error` on the next line was caught and the `any` above it was not. Reach for `unknown` and narrow.
- **TypeScript is pinned to 6.x on purpose.** `typescript-eslint` throws on import against TypeScript 7 and takes
  `pnpm lint:js` down with it
  ([typescript-eslint#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)). TypeScript 6.0.3
  accepts the same configuration and reports the same errors; the whole project checks in about a second either way, so
  the Go compiler buys nothing here worth a broken linter.
- **Every page reaches the DOM through `src/dom.js`.** `byId` throws where the markup and the script disagree, so a
  stale id is a broken page at load rather than a `null` travelling until something further along trips over it. Name a
  class only where the code depends on one — `byId('q', HTMLInputElement)` because a `.value` is read off it, a plain
  `byId('grid')` for a container whose tag the script has no opinion about — since the argument states a dependency
  rather than describing the markup. Note that this is the half `tsc` cannot check: typing a `<div>` as an
  `HTMLInputElement` is what you asked for, and only the run-time `instanceof` says otherwise.
- **Two `@overload`s, not one `@template` defaulting to `HTMLElement`.** A type parameter appearing only in the return
  position is inferred from the caller's own annotation, so `@template {HTMLElement} [T=HTMLElement]` leaves
  `byId('grid')` answering `HTMLInputElement` to anyone who asks for one — the default never applies and the check is
  worth nothing. Verified by probing both forms: the overloads reject it, the default accepts it silently.

## Landing a change

Which route a change takes turns on whether it changes what the code _does_ or only what it is _told_.

- **A data change lands on `master` directly.** A species added to or removed from a filter (`src/filters/*.js`), a
  `.gpx` file and the index regenerated beside it, an event in `data/events.json`, a country in `src/countries.js`, a
  `released` or `shinyEligible` flag in `src/pokemon/pokedex.js` — the lists this repository exists to hold. Single
  maintainer and linear history, so these need no branch and no review: the entry is the whole of the change, and
  `pnpm lint` already says whether it is well-formed and whether the generated files still agree with it.
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
it was written for. Serve the repository with `python3 -m http.server` and drive headless Chrome over the DevTools
Protocol from Python `websockets` — no Playwright or Puppeteer package is installed, though Playwright's browser
binaries are cached. Screenshot for layout, and `Runtime.evaluate` for anything assertable: a computed colour, a
`getBoundingClientRect().left` on two elements that should share an edge, a class present after one render and absent
after the next.

- **The five-page suite says a module loaded, never that it is right.** Making `Pokemon#region` answer the species
  instead of throwing on a miss left all five pages reporting clean — 74 routes, 82 chips, 1025 cards, `6 of 6` — while
  the differential over the dex reported 8,183 differences against the same build. What the pages do catch is a throw,
  because `filters/shiny.js` makes 79 `form`, `forms` and `region` calls at module scope and one of them failing takes
  the page down at load. So run both and do not let a 5/5 stand in for the differential; the deliberate break is what
  tells you which of the two a given change needs.
- **`events.html`'s figure is not a baseline.** `src/events.js` fetches the live upstream ScrapedDuck feed and merges
  `data/events.json` into it, so `#typeFilters` holds one button per distinct `heading` across both and tracks upstream
  rather than the checkout: 17 one morning and 16 that afternoon, with nothing here changed and `events.js` importing
  nothing from `pokemon/` either way. Derive the number from the two feeds rather than comparing it against a previous
  run — the merged feed had exactly 16 distinct headings — and treat anything else a page fetches over the network the
  same way.
- **Most of `src/` needs no browser: every module but the five entry points imports under `node` outright.** That is the
  strongest check available for anything whose output is a value rather than a rendering — import the old copy of a
  module and the new one side by side and compare them over a corpus. Only the entry points fail, each at module scope
  rather than in its logic: `app.js` on Leaflet's `L`, and `events.js`, `pgsharp/backup.js`, `pokedex/page.js` and
  `search/builder.js` on an `HTMLElement` or a sibling of one. Settle which is which by importing rather than by
  grepping for `document` — `dom.js` names `HTMLElement` and imports fine, because that is a default argument evaluated
  per call, and `gpx.js` calls `fetch`, which Node has.
- **An entry point cannot be differentialled under Node, so serve both trees and drive one corpus over each.** The page
  is the only interface it has. `git archive <base>` the old tree beside the worktree and `diff -rq` the two, so the
  file under test is the only one that differs and every disagreement is attributable to it; serve each from its own
  `http.server` on its own port, so neither can serve the other's cache; then drive the same interaction corpus over
  both and compare a full snapshot of the page after every step, naming controls by index rather than by id so the same
  step reaches the same control on both sides. 22 scenarios and 111 snapshots read identically for `search/builder.js`,
  and eleven deliberate breaks were all caught — two of them by a single snapshot each, which is the figure that says
  the corpus is sensitive per step rather than only in aggregate. Two scenarios that look redundant often are not:
  arrowing eleven times down a four-row list wraps `active` back to 0, so `offered[0]` and `offered[active]` agree there
  and only the shorter walk catches Enter taking the wrong row.
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
- **`src/java-serialization.js` is the clearest case of that**, because the bytes `dumps` writes are its whole contract:
  `loads` has no consumer, since `pgsharp/backup.js` calls it only to re-parse its own output as a self-check and throws
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
- **Run `chrome-headless-shell`, not `chrome`.**
  `~/.cache/ms-playwright/chromium_headless_shell-1208/chrome-headless-shell-linux64/chrome-headless-shell` serves the
  protocol fine. The full browser beside it, `chromium-1208/chrome-linux64/chrome`, prints
  `DevTools listening on ws://…` and then dies of a trace/breakpoint trap with `--headless=new`, so the port is gone by
  the time you connect.
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
- **Reach a module-scoped object by wrapping the library, not by hunting for it on `window`.** `src/app.js` holds the
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

## Cross-checking `src/pokemon/pokedex.js` against the web

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
- **Diff the whole table rather than spot-checking.** Copy `src/pokemon/pokemon.js`, add a getter over its private
  fields and import the copy of `pokedex.js`: `as()` has run by then, so every variant reports a name like
  `Hisuian ZORUA`.
- **Compare at dex level, with form names only as a fallback.** `/go/shiny` collapses Unown and Spinda to one card each
  yet lists Vivillon per pattern, so per-card matching reports 28 Unown forms as missing when they are not. The labels
  are the sites' own rather than ours — `Poké Ball Pattern` for `POKE_BALL`.

## What the search data does not settle

Three things anything reasoning about a search string runs into, none of which the term table answers.

- **A partial name has two readings and the sources disagree on which the game uses.** The wiki's table says `T`
  "Returns all Pokémon that begins with T (including nicknames)", where this repository's own help text on `search.html`
  has a partial name matching anywhere in it — `char` finding Charizard as well as Charmander. Only one source speaks to
  it, so the cross-checking rule above cannot resolve it and a reduction is sound only where both readings give the same
  answer: `char` reaches Charmander either way, where `saur` reaches Bulbasaur under one reading and nothing under the
  other. `src/search/optimise.js` tests that by counting — everything beginning with a fragment also contains it, so the
  begins-set sits inside the contains-set and equal sizes are equal sets — and refuses the fragment where they differ,
  which is what costs `saur` and `mime` their reductions. It is also why the candidates are leading fragments rather
  than fragments from anywhere: `rman` reaches Charmander under one reading and nothing under the other.
- **Nothing here knows which species share an evolution family.** `grep -ric evol src/pokemon/` answers 0 for both
  files: `pokedex.js` carries forms, regions, rarity, `released` and `shinyEligible` and no evolution links, and the
  families in `src/filters/xxs.js` are a line break for a human reading the list rather than data, which is what the
  `// prettier-ignore` above it exists to hold. So a `+` prefix cannot be reasoned about — `+charmander` is not
  rewritable as `4,5,6`, nor shortenable to `+charm` by reaching the family through another of its members. It gets the
  name shortening alone, which is sound because the same species reached a shorter way are the same families.
- **The generation group joins with `,`, not `&`.** Nothing is two generations, so `terms.js` gives it the default OR
  and several generations compose to a single clause — `1-151,152-251`, not two clauses AND'd. Anything folding dex
  spans together therefore unions the generations first and intersects that union with the other sources. Merging them
  can take the ambiguity warning with it as well as the characters: `shiny&1-151,152-251` mixes `,` with `&` and earns
  the caveat, where `shiny&1-251` says the same thing and does not.
