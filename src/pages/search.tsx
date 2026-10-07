/**
 * The search-string builder page. Renders the term catalogue as chips, keeps the state they describe, and writes the
 * string on every change — the page holds no string of its own, so what is shown is always what query.js composes from
 * the state rather than something edited alongside it and able to drift.
 *
 * The chips are rendered from terms.js rather than written into the markup, so adding a term is one line in the table and
 * nothing else. That is also what lets a link restore a state before the page has drawn anything: the state is read
 * first, and the chips are drawn already wearing it.
 *
 * The name half of the state is derived rather than stored. `taken` is the names already chosen and `typing` the one in
 * the box, and `state.text` is the two of them joined on every render — where the imperative page kept `text` as a third
 * copy and had one function whose job was to stop the three disagreeing.
 *
 * The expression box is held as itself, since there is nothing to derive it from: a chip is a choice off a table and an
 * expression is the reader's own writing. It reaches the string the same way everything else does, `compose` taking the
 * clauses `expression.js` makes of it, so there is still one answer on this page to what has been built.
 */

import { useEffect, useRef, useState } from 'preact/hooks';

import { compose, emptyState, fromFragment, names, toFragment, type Bounds, type State } from '../search/query.js';
import { optimise } from '../search/optimise.js';
import { replaceQuery } from '../router.js';
import { suggestions, written, type Offer } from '../search/species.js';
import { GROUPS, PRESETS, RANGES, type Range } from '../search/terms.js';

/**
 * Where a chip is. The three are a closed set rather than strings, so a `NEXT` that named a fourth or a chip painted one
 * would be caught here rather than drawing something nothing styles.
 */
type ChipState = 'off' | 'in' | 'out';

/** Where a chip goes when it is clicked: unused, required, ruled out, and round again. */
const NEXT: Record<ChipState, ChipState> = { off: 'in', in: 'out', out: 'off' };

/** What a chip wears in each state — the glyph, and the words a screen reader is given instead of the colour. */
const STATE: Record<ChipState, { glyph: string; said: string }> = {
  off: { glyph: '+', said: 'not used' },
  in: { glyph: '✓', said: 'required' },
  out: { glyph: '!', said: 'ruled out' },
};

/**
 * The arrow keys, as the step each one takes through the list. Indexed by whatever key was pressed, so a miss is the
 * ordinary case rather than a mistake — which is what the index signature says and a union of the two keys could not.
 */
const STEPS: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };

/** The placeholder the box wears while no name has been chosen; beside chips it would read as another one. */
const PLACEHOLDER = 'pikachu';

/** The length of the string, said in words. A one-character query is what the shortening makes reachable. */
const characters = (length: number) => `${length} character${length === 1 ? '' : 's'}`;

/** Names with the blanks and the repeats taken out: the same name twice is one clause to the game and a mistake to read. */
const unique = (all: readonly string[]) => all.filter((name, index) => name && all.indexOf(name) === index);

/**
 * A message's backticked parts set in `<code>`, so that a sentence written in this repository's prose convention reads
 * on screen the way the caveat beside it does rather than showing its own punctuation. Splitting on the tick leaves the
 * plain text at the even positions and the quoted characters at the odd ones, the string having begun outside a pair.
 */
const ticked = (message: string) =>
  message.split('`').map((part, index) => (index % 2 === 0 ? part : <code key={index}>{part}</code>));

/**
 * A bound as the state should hold it: a number inside the range's limits, or nothing where the box is empty.
 */
function readBound(value: string, range: Range) {
  if (value.trim() === '') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isNaN(parsed) ? null : Math.min(Math.max(parsed, range.min ?? 0), range.max);
}

/**
 * The string the page is showing, which is the string the Copy button writes — one answer rather than two compositions
 * that could disagree about which of them the reader is looking at.
 *
 * The optimiser is offered the state and its answer taken only where it is genuinely shorter, so the toggle can never
 * cost characters. Empty does not count as shorter: every generation at once really does reduce to no dex clause at all,
 * but a blank output box beside nine lit chips reads as a page that has broken rather than as a search for everything.
 */
function current(state: State) {
  const plain = compose(state);

  if (!state.optimise) {
    return { ...plain, was: null, rewrites: [] as readonly [string, string][], lossy: false };
  }

  const { state: shortened, rewrites, lossy } = optimise(state);
  const short = compose(shortened);
  const worth = short.query.length > 0 && short.query.length < plain.query.length;

  return worth
    ? { ...short, was: plain.query.length, rewrites, lossy }
    : { ...plain, was: null, rewrites: [] as readonly [string, string][], lossy: false };
}

export default function SearchPage({ query: fragment }: { query: string }) {
  /**
   * The state the chips, the boxes and the toggle describe — everything but the names, which are below. Replaced rather
   * than amended on every change, since the sets and the map inside it are what a re-render is decided by.
   */
  const [state, setState] = useState<State>(() => fromFragment(fragment));

  /**
   * `taken` is the names already chosen, which are chips in the field; `typing` is at most the one being typed. That
   * split is the whole of why a chosen name cannot be edited: a chip has no caret to put a letter into or take one out
   * of, so `pikachu` cannot become `pikach`. It goes in whole and comes out whole.
   */
  const [taken, setTaken] = useState<readonly string[]>(() => names(fromFragment(fragment).text));
  const [typing, setTyping] = useState('');

  /**
   * What the list is showing and which row the keyboard has reached, -1 for none. The pair is the state of the popup, and
   * every path out of here leaves them agreeing with what is on screen.
   */
  const [offered, setOffered] = useState<readonly Offer[]>([]);
  const [active, setActive] = useState(-1);

  const [copyLabel, setCopyLabel] = useState('Copy');

  const textRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const queryRef = useRef<HTMLElement>(null);

  /**
   * The name being typed counts towards the string, which is why committing one to a chip changes the picture without
   * changing the search: the reader is saying they have finished with that name, not adding it. It also means a name the
   * reader is part-way through is never silently dropped — Copy takes what is on screen, including the last three letters
   * they typed and did not press anything after.
   */
  const live: State = { ...state, text: unique([...taken, typing.trim()]).join(', ') };

  const { query, ambiguous, was, rewrites, lossy, error, mishandled } = current(live);

  /** The fragment this state would be linked as, which is both what goes in the address bar and when to put it there. */
  const mine = toFragment(live);

  /**
   * A link pasted into the address bar of a page already open changes the fragment without reloading, and the shell hands
   * the new query down as a prop. Reading it again here is what stops the chips describing the previous visit's string.
   */
  useEffect(() => {
    const arrived = fromFragment(fragment);

    setState(arrived);
    setTaken(names(arrived.text));
    setTyping('');
    closeSuggestions();
  }, [fragment]);

  /**
   * Written whenever it changes, which is what keeps the link and the chips from disagreeing about what has been chosen.
   *
   * Keyed on the fragment rather than running after every render, which matters on the way *in*: a link arriving sets the
   * state from an effect, so the render it arrives on still holds the previous visit's. Without the key this would write
   * that stale fragment straight over the one the reader had just pasted, and only the render after it would put the new
   * one back.
   */
  useEffect(() => {
    replaceQuery('search', mine);
  }, [mine]);

  /**
   * Which row the keyboard has reached, scrolled to. An effect rather than part of the keydown handler, because the row
   * has to exist to be scrolled to and it is this render that puts it there.
   */
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function closeSuggestions() {
    setOffered([]);
    setActive(-1);
  }

  /** The list for the name being typed, taken away again when that names nothing in the dex. */
  function openSuggestions(value: string) {
    setOffered(suggestions(value));
    setActive(-1);
  }

  /**
   * The names the box holds now: `chosen` become chips, `left` stays in the input. Every path that changes the box comes
   * through here, so the chips, the input and the string cannot come to disagree about what is being searched for. The
   * spaces around a name are dropped here rather than by each caller, so a pasted `pikachu, eevee` and a row taken from
   * the list arrive the same shape and can be compared with one another.
   */
  function setNames(chosen: readonly string[], left: string) {
    setTaken(unique(chosen.map((name) => name.trim())));
    setTyping(left);
  }

  /**
   * One name finished with: it becomes a chip and the input is left empty for the next. Taking a row and typing a name
   * out in full both come here, since the two are the same act said two ways.
   *
   * The list is closed rather than reopened, because the empty input the reader is left in names every species and so has
   * nothing to offer until two letters of the next one are typed.
   */
  function take(name: string) {
    setNames([...taken, name], '');
    closeSuggestions();
  }

  const stateOf = (id: string): ChipState => (state.include.has(id) ? 'in' : state.exclude.has(id) ? 'out' : 'off');

  function cycleChip(id: string) {
    const next = NEXT[stateOf(id)];

    setState((was) => {
      const include = new Set(was.include);
      const exclude = new Set(was.exclude);

      include.delete(id);
      exclude.delete(id);

      if (next === 'in') {
        include.add(id);
      } else if (next === 'out') {
        exclude.add(id);
      }

      return { ...was, include, exclude };
    });
  }

  /**
   * Nothing chosen, still written the way the reader asked for it. Clearing and loading a preset both start from empty,
   * and neither is a reason to stop shortening: the toggle says how a query is written rather than what is in one.
   */
  function clear() {
    setState((was) => ({ ...emptyState(), optimise: was.optimise }));
    setNames([], '');
    closeSuggestions();
    textRef.current?.focus();
  }

  /**
   * Copying is the last step of every visit, so it says so where the button is rather than in a status line. The write
   * can be refused — an insecure origin, or a browser that withholds the clipboard — in which case selecting the string
   * is the fallback, which is why it is `user-select: all` rather than merely selectable.
   */
  async function copy() {
    try {
      await navigator.clipboard.writeText(query);
      setCopyLabel('Copied');
    } catch {
      const shown = queryRef.current;

      if (shown !== null) {
        getSelection()?.selectAllChildren(shown);
      }

      setCopyLabel('Press ⌘C');
    }
  }

  // Put back a beat after it changed, rather than on a timer started beside the write: the effect is cancelled and
  // restarted by a second press, where a bare `setTimeout` would leave the first one to fire over the second.
  useEffect(() => {
    if (copyLabel === 'Copy') {
      return;
    }

    const restore = setTimeout(() => setCopyLabel('Copy'), 1400);

    return () => clearTimeout(restore);
  }, [copyLabel]);

  function onKeyDown(event: KeyboardEvent) {
    const step = STEPS[event.key];

    if (step) {
      event.preventDefault();

      if (offered.length === 0) {
        openSuggestions(typing);
        return;
      }

      // One slot more than there are rows, so arrowing off either end lands on what was typed rather than wrapping
      // straight past it: the reader can always get their own text back the way they came.
      setActive(((active + step + offered.length + 2) % (offered.length + 1)) - 1);
      return;
    }

    // Enter takes the row the keyboard has reached, or else the name as it was typed — a nickname is not in the dex and
    // has no row, so this is the only way one can be asked for.
    if (event.key === 'Enter') {
      const offer = offered[active];
      const name = offer ? written(offer) : typing.trim();

      if (name) {
        event.preventDefault();
        take(name);
      }

      return;
    }

    // Backspace with nothing left to delete takes the last chip off whole. A chosen name has no caret of its own, so this
    // and its ✕ are the two ways out of one, and neither can leave `pikachu` reading `pikach`.
    if (event.key === 'Backspace' && typing === '' && taken.length > 0) {
      event.preventDefault();
      setNames(taken.slice(0, -1), '');
      return;
    }

    // Escape empties a search input, which is not what a reader dismissing a list of species means by it.
    if (event.key === 'Escape' && offered.length > 0) {
      event.preventDefault();
      closeSuggestions();
    }
  }

  return (
    <>
      <header class="page">
        <h1>Pokémon GO Search Strings</h1>
        <p class="sub">
          Build a string for the game's own search box. Click a chip once to require it, twice to rule it out.
        </p>
      </header>

      <main class="builder">
        {/*
         * Sticky, because the string is what the page is for: it stays in view while you are twenty chips down the page
         * changing what it says. aria-live announces each rewrite to a screen reader, which would otherwise be told
         * nothing at all as the chips below it are clicked.
         */}
        <section class="output" aria-label="The search string">
          <div class="string">
            {/*
             * The id is the stylesheet's, not the script's: `search.css` selects `.output code#query` for the mono face,
             * the bordered box and the `user-select: all` the Copy button's fallback depends on. The ref beside it is the
             * script's handle for that fallback — the two are not a duplicate, and dropping the id for the ref left every
             * one of those rules matching nothing while the page still rendered.
             */}
            <code id="query" ref={queryRef} class={query ? undefined : 'empty'} aria-live="polite">
              {query || 'Nothing chosen yet'}
            </code>
            {/*
             * Refused while the expression is broken, the string on show then being everything *except* what the
             * reader is part-way through writing — a broader search than they asked for, which on this page is the
             * direction that costs a shiny its candy.
             */}
            <button
              type="button"
              class={copyLabel === 'Copy' ? 'copy' : 'copy done'}
              disabled={!query || error !== null}
              onClick={copy}
            >
              {copyLabel}
            </button>
          </div>

          <div class="meta">
            <span class="count">{query ? `${characters(query.length)}${was ? `, down from ${was}` : ''}` : ''}</span>
            <span class="actions">
              <label class="toggle" title="Say the same thing in fewer characters">
                {/*
                 * Only what is composed changes, never the state the chips and the boxes describe, so switching this off
                 * puts the long string back rather than leaving the reader to undo a rewrite.
                 */}
                <input
                  type="checkbox"
                  checked={state.optimise}
                  onChange={(event) => setState((was) => ({ ...was, optimise: event.currentTarget.checked }))}
                />
                Shorten
              </label>
              <button type="button" class="ghost" onClick={clear}>
                Clear
              </button>
            </span>
          </div>

          <p class="caveat" hidden={!ambiguous}>
            This mixes <code>,</code> and <code>&amp;</code>, and the game's search has no brackets to say which binds
            first. Check it matches what you meant before trusting it on a mass transfer.
          </p>

          {/*
           * Why Copy is refused, said beside the button rather than only under the box that caused it: a reader who
           * has scrolled the expression out of view is otherwise looking at a dead button and no reason for it.
           */}
          <p class="broken" hidden={error === null}>
            {ticked(error ?? '')}
          </p>

          {/*
           * Terms the string carries whose negation the game is on record as getting wrong. They are here rather than
           * under the expression box because the reader may never have typed one: `!(1hp,shiny)` is where `!1hp` comes
           * from, and what is worth warning about is what the string ended up saying.
           */}
          <p class="caveat" hidden={mishandled.length === 0}>
            {mishandled.map(({ term, note }) => (
              <span key={term} class="mishandled">
                <code>{term}</code> — {note}.
              </span>
            ))}
          </p>

          {/*
           * What the shortening did, since a reader handed `4` where they typed `charmander` has no way to check the
           * string against what they chose. The comma is part of the text rather than a gap in the layout, so a screen
           * reader reads a list of substitutions rather than running `26` into the word after it.
           */}
          <p class="help rewritten" hidden={rewrites.length === 0}>
            {rewrites.map(([from, to], index) => (
              <span key={from} class="rewrite">
                <code>{from}</code> → <code>{to}</code>
                {index < rewrites.length - 1 ? ', ' : ''}
              </span>
            ))}
            {lossy && (
              <span class="lossy">
                {' A dex number matches the species itself, where the name would also have matched a nickname.'}
              </span>
            )}
          </p>
        </section>

        <section class="panel" aria-labelledby="presetsLabel">
          <h2 class="label" id="presetsLabel">
            <span class="ico" aria-hidden="true">
              ⭐
            </span>{' '}
            Favourites
          </h2>
          <div class="presets">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setState((was) => ({
                    ...emptyState(),
                    optimise: was.optimise,
                    include: new Set(preset.include ?? []),
                    exclude: new Set(preset.exclude ?? []),
                  }));

                  // Every name a preset carries was chosen rather than typed, so all of them are chips and nothing is
                  // left half-written in the box.
                  setNames(names(preset.text ?? ''), '');
                  closeSuggestions();
                }}
              >
                <span>{preset.label}</span>
                <span class="note">{preset.note}</span>
              </button>
            ))}
          </div>
        </section>

        <section class="panel" aria-labelledby="nameLabel">
          <h2 class="label" id="nameLabel">
            Name or species
          </h2>

          {/*
           * A combobox of its own rather than a `<datalist>`, which would have been a fraction of the code: the browser
           * matches a datalist against the entire value of the box, and this box holds any number of names, so past the
           * first one nothing would ever match again. Completing the name being typed is the whole of what this is for,
           * and that is the one thing the built-in cannot do.
           *
           * The names already chosen are rendered into the field ahead of the input, so the box holds the whole of the
           * search's name half. The input is `text` rather than `search` because the clear button a search box draws for
           * itself would land in the middle of that row, offering to empty the names as well as the one being typed.
           */}
          <div class="combobox">
            <div
              class="field"
              // The chips make the field much wider than the input inside it, so a click on the gap beside them has to
              // reach the one place there is to type. Only the field itself: a click on a chip is the chip's own.
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  event.preventDefault();
                  textRef.current?.focus();
                }
              }}
            >
              {taken.map((name, index) => (
                <span key={name} class="name">
                  {name}
                  <button
                    type="button"
                    aria-label={`Remove ${name}`}
                    // The focus is handed back because the button it was on has just left the page, and focus falling to
                    // the body would leave the reader's next keystroke going nowhere.
                    onClick={() => {
                      setNames(
                        taken.filter((_, at) => at !== index),
                        typing,
                      );
                      textRef.current?.focus();
                    }}
                  >
                    ✕
                  </button>
                </span>
              ))}

              <input
                ref={textRef}
                id="text"
                type="text"
                value={typing}
                placeholder={taken.length === 0 ? PLACEHOLDER : ''}
                autocomplete="off"
                spellcheck={false}
                role="combobox"
                aria-expanded={offered.length > 0}
                aria-controls="suggestions"
                aria-autocomplete="list"
                aria-activedescendant={offered[active] ? `suggestion-${active}` : undefined}
                aria-label="Name or species"
                // A comma is what separates names in the string, so typing or pasting one commits the name in front of
                // it — which is also how a pasted `pikachu, eevee, snorlax` arrives as three chips rather than one name.
                onInput={(event) => {
                  const parts = event.currentTarget.value.split(',');
                  const left = parts.pop() ?? '';

                  setNames([...taken, ...parts], left);
                  openSuggestions(left);
                }}
                onKeyDown={onKeyDown}
                onBlur={closeSuggestions}
              />
            </div>

            {/* [html-validate-disable-next prefer-native-element -- a select cannot be a combobox's popup] */}
            <ul
              ref={listRef}
              class="suggestions"
              id="suggestions"
              role="listbox"
              aria-label="Matching species"
              hidden={offered.length === 0}
            >
              {offered.map((offer, index) => (
                <li
                  key={written(offer)}
                  id={`suggestion-${index}`}
                  role="option"
                  aria-selected={index === active}
                  // mousedown rather than click: a click arrives after the blur that closes the list, by which point
                  // there is no row left to have been clicked. The default is prevented so the box keeps its focus.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    take(written(offer));
                  }}
                >
                  {offer.name}
                  {/*
                   * Said in the word rather than in the `+` the row would write, because the row's text is also its
                   * accessible name and "plus Charmander" read out loud names neither of the two searches on offer.
                   */}
                  {offer.family && <span class="family"> (family)</span>}
                </li>
              ))}
            </ul>
          </div>

          <p class="help">
            Partial names match, so <code>char</code> finds Charmander and Charizard. Two letters bring up the species
            that match, and <kbd>↓</kbd> then <kbd>Enter</kbd> takes one. Each species is followed by its family: taking{' '}
            <em>Charmander (family)</em> writes <code>+charmander</code>, the game's shorthand for a species and the
            rest of its evolutionary line. A name you have typed yourself becomes one of these on a comma or{' '}
            <kbd>Enter</kbd> — a nickname works as well as a species. Chosen names come out whole rather than a letter
            at a time: <kbd>⌫</kbd> in the empty part of the box takes the last one off, and <kbd>✕</kbd> takes any of
            them.
          </p>
        </section>

        <div class="groups">
          {GROUPS.map((group) => (
            <section key={group.id} class="group" style={{ '--hue': String(group.hue) }}>
              <h2 class="label">{group.label}</h2>
              <div class="chips">
                {group.terms.map((term) => {
                  const chip = stateOf(term.id);

                  return (
                    <button
                      key={term.id}
                      type="button"
                      class="chip"
                      data-state={chip}
                      title={`${term.term} — click to require, again to rule out`}
                      aria-label={`${term.label} — ${STATE[chip].said}`}
                      onClick={() => cycleChip(term.id)}
                    >
                      <span class="state">{STATE[chip].glyph}</span>
                      <span>{term.label}</span>
                    </button>
                  );
                })}
              </div>
              <p class="help">{group.help}</p>
            </section>
          ))}
        </div>

        <section class="panel" aria-labelledby="rangesLabel">
          <h2 class="label" id="rangesLabel">
            Ranges
          </h2>
          <div class="ranges">
            {RANGES.map((range) => {
              const bounds = state.ranges.get(range.id);
              const low = String(range.min ?? 0);
              const high = String(range.max);

              /**
               * One end of one range, written back into the state the box it belongs to is read out of. The end is given
               * as the part of the bounds it replaces rather than as the name of a field, so the two boxes differ in what
               * they pass rather than in a key this has to index the pair by.
               */
              const edit = (end: Partial<Bounds>) =>
                setState((was) => {
                  const ranges = new Map(was.ranges);

                  ranges.set(range.id, { ...(ranges.get(range.id) ?? { from: null, to: null }), ...end });

                  return { ...was, ranges };
                });

              return (
                <div key={range.id} class={bounds?.from != null || bounds?.to != null ? 'range set' : 'range'}>
                  {/* The label names the pair, so it is tied to the first box rather than wrapping both — a label
                      cannot label two. Each box is placeheld by the bound it would take if left empty. */}
                  <label class="name" for={`range-${range.id}-from`}>
                    {range.label}
                  </label>
                  <input
                    id={`range-${range.id}-from`}
                    type="number"
                    min={low}
                    max={high}
                    placeholder={low}
                    value={bounds?.from ?? ''}
                    aria-label={`${range.label}, lowest`}
                    onInput={(event) => edit({ from: readBound(event.currentTarget.value, range) })}
                  />
                  <span class="dash">–</span>
                  <input
                    type="number"
                    min={low}
                    max={high}
                    placeholder={high}
                    value={bounds?.to ?? ''}
                    aria-label={`${range.label}, highest`}
                    onInput={(event) => edit({ to: readBound(event.currentTarget.value, range) })}
                  />
                </div>
              );
            })}
          </div>
          <p class="help">A box left empty falls back to that range's own limit, so one end is enough.</p>
        </section>

        {/*
         * Last on the page, because it is the door out of it: a reader reaches for brackets once the chips have turned
         * out not to be able to say the thing they want, and until then this is a box to read past.
         */}
        <section class="panel" aria-labelledby="expressionLabel">
          <h2 class="label" id="expressionLabel">
            Brackets
          </h2>

          <textarea
            id="expression"
            value={state.expression}
            rows={2}
            placeholder="(pikachu&shiny),(pumpkaboo&xxl)"
            autocomplete="off"
            spellcheck={false}
            aria-label="Expression with brackets"
            aria-invalid={error !== null}
            // Described by its help rather than announcing the error as it is typed: every unfinished bracket is an
            // error, so an `aria-live` here would read a failure out at every keystroke on the way to a good one.
            aria-describedby="expressionHelp"
            onInput={(event) => setState((was) => ({ ...was, expression: event.currentTarget.value }))}
          />

          <p class="help" id="expressionHelp">
            The game's search box takes no brackets, so what you write here is written back out as clauses it does take:{' '}
            <code>(pikachu&amp;shiny),(pumpkaboo&amp;xxl)</code> leaves as four of them, and the result is required
            alongside the chips above. <code>&amp;</code> is <em>and</em>, <code>,</code> <code>:</code> and{' '}
            <code>;</code> are all <em>or</em>, and <code>!</code> rules out whatever follows it — a whole bracket
            included, so <code>!(shiny,lucky)</code> is neither. Writing an <em>or</em> out multiplies rather than adds,
            so a few brackets can cost a great many characters. A comma is read as binding tighter than an ampersand,
            which is the reading the rest of this page takes and the one the note above says the game itself cannot
            confirm.
          </p>
        </section>
      </main>

      <footer>
        <p>
          The syntax is Pokémon GO's own, as typed into the search box on the Pokémon storage screen. Everything runs in
          your browser, and the link updates as you build so a string can be shared or bookmarked.
        </p>
        <p>This site is unofficial.</p>
      </footer>
    </>
  );
}
