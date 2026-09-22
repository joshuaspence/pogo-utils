# CLAUDE.md

- **Give every subtask its own worktree.** A subagent takes `isolation: "worktree"`; a session enters one with
  `EnterWorktree`. Two agents in one checkout collide — they edit the same file at the same time, and a `git add --all`
  from either commits the other's half-finished work. Note that a new worktree branches from `origin/master` unless
  `worktree.baseRef` is `head`, so it will not contain unpushed commits.
- **Commit staged changes.** Staged work is finished work. Stage the paths you touched rather than the whole tree, so a
  commit carries your change and nothing else.
- **Commit to `master`.** Single maintainer, linear history, so work lands on `master` directly. Create a branch only
  when asked for one.

## Checking the pages in a browser

There is no test suite, and `npm run lint` says nothing about whether a page looks right or a class reaches the element
it was written for. Serve the repository with `python3 -m http.server` and drive headless Chrome over the DevTools
Protocol from Python `websockets` — no Playwright or Puppeteer package is installed, though Playwright's browser
binaries are cached. Screenshot for layout, and `Runtime.evaluate` for anything assertable: a computed colour, a
`getBoundingClientRect().left` on two elements that should share an edge, a class present after one render and absent
after the next.

- **Send `Network.setCacheDisabled` before navigating.** Chrome serves the CSS and JS it already has, so a re-run after
  an edit reports the _old_ file. This looked exactly like every change having failed — a `::before` with no background,
  a count of zero, `box-shadow: none` — when all of them were in fact fine.
- **Screenshot the viewport, not the page.** `captureBeyondViewport` on a long page returns something like 1400×5983,
  which scales down to an unreadable few hundred pixels wide. Pass an explicit height instead.
- **Match the class names, not the rendered text.** `text-transform: uppercase` does not touch `textContent`, so a
  sidebar row reading `JAPAN` is `Japan` to `includes('JAPAN')`.
- **Never `pkill -f` a pattern you have just typed.** `pkill -f 'debugging-port=9222'` matches its own command line and
  kills the shell running it, which surfaces as a bare exit 144 with no output and nothing actually stopped. Collect the
  PIDs with `pgrep`, skip `$$` and `$PPID`, then `kill` them — or put the patterns in a script file.

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
