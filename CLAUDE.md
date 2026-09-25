# CLAUDE.md

- **Give every subtask its own worktree.** A subagent takes `isolation: "worktree"`; a session enters one with
  `EnterWorktree`. Two agents in one checkout collide — they edit the same file at the same time, and a `git add --all`
  from either commits the other's half-finished work. Note that a new worktree branches from `origin/master` unless
  `worktree.baseRef` is `head`, so it will not contain unpushed commits.
- **Commit staged changes.** Staged work is finished work. Stage the paths you touched rather than the whole tree, so a
  commit carries your change and nothing else.

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
- **A selector that matches nothing reads as a pass.** `document.querySelector('.banner')?.textContent ?? 'NO BANNER'`
  reported no error banner on a page whose manifest fetch had been blocked outright — the markup is `id="banner"`, so
  the query was null either way and the check could not have failed however broken the page was. Assert the node exists
  before asserting anything about it, and confirm a probe can fail: block the request with `Network.setBlockedURLs` and
  watch the banner appear before trusting its absence.
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
- **Blur before you screenshot, or you will file your own focus ring as a bug.** A probe that calls `focus()` to check
  the keyboard leaves the UA ring painted in every capture after it, and a black `auto 1px` outline rounded to 8px
  across the foot of the controls bar looked exactly like a stray empty text input. One `blur()` took it away. The ring
  was worth looking at all the same, which is the other half of the lesson: the filter disclosure is `flex: 1 0 100%` so
  that it claims a row of its own, which also makes it 941px wide, and an outline on a box that shape reads as a field
  rather than as a focused control however it is coloured. `getBoundingClientRect` answered `941x15` either way and said
  nothing about it.
- **Measure widths in characters, not bytes, before believing a line is too long.** `awk 'length > 120'` counts bytes,
  so every comment carrying an em-dash reads three columns over per dash and a compliant line is reported as a
  violation. Four of these comments looked too long and only two were. Use `len()` on text decoded as UTF-8, and check
  what the diff actually adds rather than the whole file: thirteen lines already sit at 121. Measuring is not optional,
  because nothing else does it — `prettier.config.mjs` sets `printWidth: 120` and Prettier reflows code and Markdown
  prose to it, but never a `/* */` or `//` comment, so `pnpm lint` is silent on an over-long one. That is how those
  thirteen got in, and how sixteen more nearly went in with the new-event marker.
- **Reach a module-scoped object by wrapping the library, not by hunting for it on `window`.** `src/app.js` holds the
  Leaflet map in a `const`, so `Runtime.evaluate` finds only the `<div id="map">` and answers
  `map.getZoom is not a function`. Send a `Page.addScriptToEvaluateOnNewDocument` that defines a setter for `window.L`
  and wraps the prototype methods in question: it runs before the deferred module, so it sees every call, and stashing
  `this` on the first one leaves the instance reachable from every later probe. Recording arguments that way is what
  found the deep-link zoom bug — `_resetView` was reached with zoom 12 and the map still finished at 2.147, which ruled
  out the call never happening and pointed at what undid it afterwards.
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
