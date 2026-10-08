/**
 * The search-string builder page: a catalogue of pills on one side and the query you arrange them into on the other.
 *
 * The arrangement *is* the state: the canvas holds a tree and `query.js` composes whatever is in it, so a bracket is a
 * group and a group is a thing on screen you drop a pill into.
 *
 * A query can be typed in as well, and that is an import rather than a second composer: `parse.js` reads the brackets
 * into a tree, the canvas draws it, and the one composer takes it from there. Which is the whole difference between
 * the row at the top of the canvas and the text box that used to sit beside the chips composing clauses of its own.
 *
 * A pill reaches a group two ways, both ending in the same `commit`. Dragging is the one a pointer wants, tracked
 * through pointer capture so touch behaves like a mouse, with a few pixels of slop before a press counts as a drag.
 * Picking a pill up and putting it down is the one a keyboard wants, both halves being ordinary buttons.
 *
 * Nothing here knows how a clause is written. The page asks `compose` what the query says and draws what it answers.
 */

import { useEffect, useRef, useState } from 'preact/hooks';

import { compose, emptyState, fromFragment, names, presetTree, toFragment, type State } from '../search/query.js';
import { optimise } from '../search/optimise.js';
import { read } from '../search/parse.js';
import { replaceQuery } from '../router.js';
import { suggestions, written as speciesTerm, type Offer } from '../search/species.js';
import { bounded, GROUPS, PRESETS, RANGES, type Range } from '../search/terms.js';
import {
  append,
  chipState,
  cycle,
  group,
  isGroup,
  leafLabel,
  leafText,
  move,
  NESTING,
  nodeAt,
  update,
  type ChipState,
  type Junction,
  type Leaf,
  type Node,
  type Path,
} from '../search/tree.js';

/** How far a press has to travel before it is a drag rather than a tap on the pill it started on. */
const SLOP = 6;

/**
 * What a catalogue chip wears in each of its three states — the glyph, and the words a screen reader is given instead
 * of the colour. The state is the chip's standing in the group being filled, which for a query built in the root alone
 * is the whole query.
 */
const CHIP: Record<ChipState, { glyph: string; said: string }> = {
  off: { glyph: '+', said: 'not used' },
  in: { glyph: '✓', said: 'required' },
  out: { glyph: '!', said: 'ruled out' },
};

/** What a junction's button says, and what it means — the words rather than `&` and `,`, which the string already has. */
const JUNCTION: Record<Junction, { label: string; said: string }> = {
  all: { label: 'All of', said: 'every pill in this group has to match' },
  any: { label: 'Any of', said: 'one pill in this group matching is enough' },
};

/** A path as an attribute, and back. The root group is the empty string, which is still an attribute that is there. */
const pathAttribute = (path: Path) => path.join('.');
const pathOf = (attribute: string): Path => (attribute === '' ? [] : attribute.split('.').map(Number));

/** Whether two paths name the same node, which is how the canvas knows which group is the current one. */
const same = (one: Path, two: Path) => one.length === two.length && one.every((index, at) => two[at] === index);

/** The length of the string, said in words. A one-character query is what the shortening makes reachable. */
const characters = (length: number) => `${length} character${length === 1 ? '' : 's'}`;

/**
 * A sentence split on its backticks: prose at the even positions and the quoted characters at the odd ones, the string
 * having begun outside a pair.
 *
 * **An unpaired tick is prose rather than markup**, so the tail it opens is rejoined and left as text. One of the three
 * callers of `ticked` below is a refusal from `parse.js` that quotes a token the reader typed, and a reader can type a
 * tick — in a name, where the box splits on commas and leaves everything else alone. Pairing from the left and giving
 * up on the last one is what keeps that from setting the rest of the refusal in `<code>`: `terms.test.js` holds the
 * help table to pairs, and this holds the strings that arrive from outside any table.
 *
 * Exported for the test; `ticked` is the only caller.
 */
export function spans(message: string): string[] {
  const parts = message.split('`');

  return parts.length % 2 === 0 ? [...parts.slice(0, -2), parts.slice(-2).join('`')] : parts;
}

/**
 * A sentence's backticked parts set in `<code>`, so that prose written in this repository's convention reads on screen
 * the way the caveat beside it does rather than showing its own punctuation.
 *
 * Three callers: a refusal from `clauses.js`, a refusal from `parse.js`, and a category's own help in `terms.js` —
 * which was showing its ticks as ticks. `the game has no \`gen1\`` had been on the page since before the canvas.
 */
const ticked = (message: string) =>
  spans(message).map((part, index) => (index % 2 === 0 ? part : <code key={index}>{part}</code>));

/** A bound as the tree should hold it: a number inside the range's limits, or nothing where the box is empty. */
function readBound(value: string, range: Range) {
  if (value.trim() === '') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isNaN(parsed) ? null : bounded(parsed, range);
}

/**
 * The string the page is showing, which is the string the Copy button writes — one answer rather than two compositions
 * that could disagree about which of them the reader is looking at.
 *
 * The optimiser is offered the state and its answer taken only where it is genuinely shorter, so the toggle can never
 * cost characters. Empty does not count as shorter: every star rating at once really does reduce to no clause at all,
 * but a blank output box beside a canvas full of pills reads as a page that has broken rather than as a search for
 * everything.
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

/** A pill on its way somewhere: what is moving, where it came from, and where the pointer has it now. */
interface Drag {
  node: Node;
  from: Path | null;
  x: number;
  y: number;
  over: Path | null;
  moved: boolean;
}

export default function SearchPage({ query: fragment }: { query: string }) {
  const [state, setState] = useState<State>(() => fromFragment(fragment));

  /** The group a clicked pill goes into, and the one a picked-up pill is put down in. The root to begin with. */
  const [focus, setFocus] = useState<Path>([]);

  /** The pill a pointer is carrying, and the pill a keyboard has picked up. Only ever one of the two at a time. */
  const [drag, setDrag] = useState<Drag | null>(null);
  const [held, setHeld] = useState<{ node: Node; from: Path } | null>(null);

  const [typing, setTyping] = useState('');

  /** The query being typed into the import box, and why the last attempt at it went nowhere. */
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState<string | null>(null);
  const [offered, setOffered] = useState<readonly Offer[]>([]);
  const [active, setActive] = useState(-1);
  const [copyLabel, setCopyLabel] = useState('Copy');

  const textRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const queryRef = useRef<HTMLElement>(null);

  const { query, was, rewrites, lossy, error, mishandled } = current(state);

  /** The fragment this state would be linked as, which is both what goes in the address bar and when to put it there. */
  const mine = toFragment(state);

  /**
   * A link pasted into the address bar of a page already open changes the fragment without reloading, and the shell
   * hands the new query down as a prop. Reading it again here is what stops the canvas describing the previous visit.
   */
  useEffect(() => {
    setState(fromFragment(fragment));
    setFocus([]);
    setHeld(null);
    setTyping('');
    setTyped('');
    setTypedError(null);
    closeSuggestions();
  }, [fragment]);

  /**
   * Written whenever it changes, which is what keeps the link and the canvas from disagreeing about what has been
   * arranged. Keyed on the fragment rather than running after every render, which matters on the way *in*: a link
   * arriving sets the state from an effect, so the render it arrives on still holds the previous visit's.
   */
  useEffect(() => {
    replaceQuery('search', mine);
  }, [mine]);

  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function closeSuggestions() {
    setOffered([]);
    setActive(-1);
  }

  /** The tree with one edit made to it. Every change to the arrangement comes through here. */
  const edit = (change: (tree: Node) => Node) => setState((was) => ({ ...was, tree: change(was.tree) }));

  /**
   * A pill landing in a group, whichever way it got there. One function because a drop and a put-down are the same
   * act: a pill from the catalogue is added, and a pill already on the canvas is moved — which is the one case that
   * has to correct its destination for the hole it leaves behind, and `move` is where that is done.
   */
  function commit(node: Node, from: Path | null, to: Path) {
    edit((tree) => (from === null ? append(tree, to, node) : move(tree, from, to)));
    setFocus(to);
  }

  /** The group under a point, for a drag to light up and drop into. */
  function groupUnder(x: number, y: number): Path | null {
    const found = document.elementFromPoint(x, y)?.closest('[data-group]');
    const attribute = found?.getAttribute('data-group');

    return attribute == null ? null : pathOf(attribute);
  }

  /**
   * A press on something draggable. The pointer is captured so the move and the release arrive here however far the
   * pointer wanders, and the default is prevented so a drag does not select the label it started on — which is also
   * why the tap below is handled on release rather than left to a `click` that will not come.
   *
   * The element is read out of the event *now* rather than inside the two listeners below. A native event clears its
   * `currentTarget` the moment dispatch finishes, so a listener that reached for it later found null and every drag
   * ended as a press that did nothing.
   */
  function onPointerDown(event: PointerEvent, node: Node, from: Path | null, tap: () => void) {
    const pressed = event.currentTarget;

    if (event.button !== 0 || !(pressed instanceof HTMLElement)) {
      return;
    }

    event.preventDefault();
    pressed.setPointerCapture(event.pointerId);

    const started = { x: event.clientX, y: event.clientY };
    const past = (now: PointerEvent) =>
      Math.abs(now.clientX - started.x) > SLOP || Math.abs(now.clientY - started.y) > SLOP;

    const onMove = (moving: PointerEvent) => {
      if (past(moving)) {
        setDrag({
          node,
          from,
          x: moving.clientX,
          y: moving.clientY,
          over: groupUnder(moving.clientX, moving.clientY),
          moved: true,
        });
      }
    };

    const onUp = (up: PointerEvent) => {
      pressed.removeEventListener('pointermove', onMove);
      pressed.removeEventListener('pointerup', onUp);
      pressed.removeEventListener('pointercancel', onUp);

      const over = past(up) ? groupUnder(up.clientX, up.clientY) : null;

      setDrag(null);

      if (!past(up)) {
        tap();
      } else if (over !== null) {
        commit(node, from, over);
      }
    };

    pressed.addEventListener('pointermove', onMove);
    pressed.addEventListener('pointerup', onUp);
    pressed.addEventListener('pointercancel', onUp);
  }

  /** A term from the catalogue, as the pill it will become. */
  const termLeaf = (id: string): Leaf => ({ kind: 'term', id, negated: false });

  /** A numeric range from the catalogue, as the pill it will become: its own two boxes, neither filled in yet. */
  const rangeLeaf = (id: string): Leaf => ({ kind: 'range', id, from: null, to: null, negated: false });

  /**
   * One press of a catalogue chip: the three-state toggle the chips have always been, read against the group being
   * filled. Dragging is the other way in, and the one that can put a second copy of the same entry somewhere else.
   */
  const pressChip = (leaf: Leaf) => edit((tree) => cycle(tree, focus, leaf));

  function clear() {
    setState((was) => ({ ...emptyState(), optimise: was.optimise }));
    setFocus([]);
    setHeld(null);
    setTyping('');
    closeSuggestions();
  }

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

  useEffect(() => {
    if (copyLabel === 'Copy') {
      return;
    }

    const restore = setTimeout(() => setCopyLabel('Copy'), 1400);

    return () => clearTimeout(restore);
  }, [copyLabel]);

  /**
   * A typed query put on the canvas, replacing whatever was there. Replacing rather than merging, because a reader who
   * has pasted a whole search means that search — and the arrangement they are replacing is one press of the browser's
   * own back button away, the link having carried it.
   *
   * The box is emptied on success so that the canvas is the only place the query lives. A failure leaves both the text
   * and the arrangement alone, there being nothing to put and no reason to take anything away.
   */
  function importTyped() {
    const { tree, error } = read(typed);

    setTypedError(error);

    if (tree === null) {
      return;
    }

    setState((was) => ({ ...was, tree }));
    setFocus([]);
    setHeld(null);
    setTyped('');
  }

  /** One name finished with, which becomes a pill in the current group. A nickname works as well as a species. */
  function takeName(text: string) {
    // Through `cycle` rather than `append`, which is what it was: the same name twice is one pill's worth of search,
    // and `Enter` is easy to press twice without meaning anything by it. `append` is for a drop, where the reader has
    // said where the pill goes.
    for (const name of names(text)) {
      edit((tree) => cycle(tree, focus, { kind: 'name', text: name, negated: false }));
    }

    setTyping('');
    closeSuggestions();
  }

  function onNameKeyDown(event: KeyboardEvent) {
    const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;

    if (step !== 0) {
      event.preventDefault();

      if (offered.length === 0) {
        setOffered(suggestions(typing));
        setActive(-1);
        return;
      }

      // One slot more than there are rows, so arrowing off either end lands on what was typed rather than wrapping
      // straight past it: the reader can always get their own text back the way they came.
      setActive(((active + step + offered.length + 2) % (offered.length + 1)) - 1);
      return;
    }

    if (event.key === 'Enter') {
      const offer = offered[active];
      const name = offer ? speciesTerm(offer) : typing.trim();

      if (name) {
        event.preventDefault();
        takeName(name);
      }

      return;
    }

    if (event.key === 'Escape' && offered.length > 0) {
      event.preventDefault();
      closeSuggestions();
    }
  }

  /**
   * One pill. A term and a name say themselves; a range carries its two boxes, because a span is the only pill whose
   * content the reader goes on editing after placing it.
   *
   * Called rather than rendered as `<Pill />`, as is the group below it. A component declared inside this one is a new
   * component *type* on every render, so Preact unmounts and remounts the whole canvas each time — which destroyed the
   * element holding a pointer capture mid-drag, and a tap on a pill never saw its own `pointerup`. Called plainly, the
   * vnodes it returns are this component's own and the elements keep their identity.
   */
  function renderPill(leaf: Leaf, path: Path) {
    const range = leaf.kind === 'range' ? RANGES.find((entry) => entry.id === leaf.id) : undefined;
    const carried = held !== null && same(held.from, path);

    return (
      <span
        key={pathAttribute(path)}
        class={`pill ${leaf.negated ? 'out' : 'in'}${carried ? ' carried' : ''}`}
        data-kind={leaf.kind}
        title={leafText(leaf) ?? 'nothing yet'}
      >
        <button
          type="button"
          class="face"
          aria-label={`${leafLabel(leaf)} — ${leaf.negated ? 'ruled out' : 'required'}, press to turn it round`}
          onPointerDown={(event) =>
            onPointerDown(event, leaf, path, () =>
              edit((tree) => update(tree, path, (node) => ({ ...(node as Leaf), negated: !leaf.negated }))),
            )
          }
        >
          <span class="state" aria-hidden="true">
            {leaf.negated ? '!' : '✓'}
          </span>
          <span class="name">{leafLabel(leaf)}</span>
        </button>

        {range && leaf.kind === 'range' && (
          <span class="bounds">
            <input
              type="number"
              min={String(range.min ?? 0)}
              max={String(range.max)}
              placeholder={String(range.min ?? 0)}
              value={leaf.from ?? ''}
              aria-label={`${range.label}, lowest`}
              onPointerDown={(event) => event.stopPropagation()}
              onInput={(event) =>
                edit((tree) =>
                  update(tree, path, (node) => ({
                    ...(node as Leaf),
                    from: readBound(event.currentTarget.value, range),
                  })),
                )
              }
            />
            <span class="dash">–</span>
            <input
              type="number"
              min={String(range.min ?? 0)}
              max={String(range.max)}
              placeholder={String(range.max)}
              value={leaf.to ?? ''}
              aria-label={`${range.label}, highest`}
              onPointerDown={(event) => event.stopPropagation()}
              onInput={(event) =>
                edit((tree) =>
                  update(tree, path, (node) => ({
                    ...(node as Leaf),
                    to: readBound(event.currentTarget.value, range),
                  })),
                )
              }
            />
          </span>
        )}

        {/* Pick up and put down, which is the drag said in two presses so that a keyboard can make it too. */}
        <button
          type="button"
          class="lift"
          aria-label={carried ? `Put ${leafLabel(leaf)} down` : `Pick ${leafLabel(leaf)} up to move it`}
          aria-pressed={carried}
          onClick={() => setHeld(carried ? null : { node: leaf, from: path })}
        >
          ⇅
        </button>

        <button
          type="button"
          class="drop"
          aria-label={`Remove ${leafLabel(leaf)}`}
          onClick={() => edit((tree) => update(tree, path, () => null))}
        >
          ✕
        </button>
      </span>
    );
  }

  /** One group, and everything inside it. The canvas is this function applied to the root. */
  function renderGroup(path: Path) {
    const node = nodeAt(state.tree, path);

    if (node === null || !isGroup(node)) {
      return null;
    }

    const root = path.length === 0;
    const target = drag?.moved === true && drag.over !== null && same(drag.over, path);
    const classes = ['group-node', root ? 'root' : '', target ? 'target' : '', same(focus, path) ? 'current' : ''];

    return (
      <section
        key={`g${pathAttribute(path)}`}
        class={classes.filter(Boolean).join(' ')}
        data-group={pathAttribute(path)}
        aria-label={root ? 'The query' : `${JUNCTION[node.junction].label} group`}
        // A click anywhere in a group that is not on a pill makes it the one a catalogue chip goes into, and is also
        // where a picked-up pill is put down. One gesture for both, so there is nothing extra to learn or to draw.
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('[data-group]') !== event.currentTarget) {
            return;
          }

          if (held !== null) {
            commit(held.node, held.from, path);
            setHeld(null);
          } else {
            setFocus(path);
          }
        }}
      >
        <header class="group-head">
          <button
            type="button"
            class="junction"
            title={JUNCTION[node.junction].said}
            aria-label={`${JUNCTION[node.junction].label} — ${JUNCTION[node.junction].said}`}
            onClick={() =>
              edit((tree) =>
                update(tree, path, (held_) =>
                  isGroup(held_) ? { ...held_, junction: held_.junction === 'all' ? 'any' : 'all' } : held_,
                ),
              )
            }
          >
            {JUNCTION[node.junction].label}
          </button>

          {!root && (
            <button
              type="button"
              class="drop"
              aria-label="Remove this group and everything in it"
              onClick={() => edit((tree) => update(tree, path, () => null))}
            >
              ✕
            </button>
          )}
        </header>

        <div class="parts">
          {node.parts.map((part, index) =>
            isGroup(part) ? renderGroup([...path, index]) : renderPill(part, [...path, index]),
          )}

          {node.parts.length === 0 && <p class="empty">Nothing in here yet — drop a pill in, or click to fill it.</p>}
        </div>

        {path.length < NESTING && (
          <button
            type="button"
            class="add"
            onClick={() => {
              // A group a reader makes deliberately is nearly always *any of these*, the root already being the game's
              // own conjunction. One press on its own button says otherwise.
              edit((tree) => append(tree, path, group('any')));
              setFocus([...path, node.parts.length]);
            }}
          >
            + group
          </button>
        )}
      </section>
    );
  }

  return (
    <>
      <header class="page">
        <h1>Pokémon GO Search Strings</h1>
        <p class="sub">
          Build a string for the game's own search box. Press a chip once to require it, twice to rule it out, three
          times to drop it. Everything in the query has to match; make a group to say <em>any of these</em>.
        </p>
      </header>

      <main class="builder">
        <section class="output" aria-label="The search string">
          <div class="string">
            <code id="query" ref={queryRef} class={query ? undefined : 'empty'} aria-live="polite">
              {query || 'Nothing arranged yet'}
            </code>
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

          <p class="broken" hidden={error === null}>
            {ticked(error ?? '')}
          </p>

          <p class="caveat" hidden={mishandled.length === 0}>
            {mishandled.map(({ term, note }) => (
              <span key={term} class="mishandled">
                <code>{term}</code> — {note}.
              </span>
            ))}
          </p>

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

        {/* The query itself, which is the page. Sticky output above it, catalogue below. */}
        <section class="canvas" aria-labelledby="canvasLabel">
          <h2 class="label" id="canvasLabel">
            The query
          </h2>

          {/*
           * Typing a query in rather than arranging one. It fills the canvas instead of writing a string of its own,
           * so there is still one arrangement and one output — and the pills it leaves can be dragged about like any
           * others, which is the whole difference between this and a second box that composed beside the first.
           *
           * It commits on its button or on Enter rather than as it is typed: every half-written bracket is an error,
           * and a canvas that emptied itself at each keystroke would be unusable.
           */}
          <form
            class="import"
            onSubmit={(event) => {
              event.preventDefault();
              importTyped();
            }}
          >
            <input
              id="typed"
              type="text"
              value={typed}
              placeholder="(pikachu&shiny),(pumpkaboo&xxl)"
              autocomplete="off"
              spellcheck={false}
              aria-label="Type a query, brackets and all"
              aria-invalid={typedError !== null}
              aria-describedby="importHelp"
              onInput={(event) => {
                setTyped(event.currentTarget.value);
                setTypedError(null);
              }}
            />
            <button type="submit" class="ghost" disabled={typed.trim() === ''}>
              Use it
            </button>
          </form>

          <p class="broken" hidden={typedError === null}>
            {ticked(typedError ?? '')}
          </p>

          {renderGroup([])}

          <p class="help" id="importHelp">
            Paste a search with brackets in it and this lays it out as pills — <code>&amp;</code> and <code>|</code> are{' '}
            <em>and</em>, <code>,</code> <code>;</code> and <code>:</code> are <em>or</em>, and <code>!</code> rules out
            whatever follows. Or arrange it yourself: a group asks for <em>all</em> of its pills or <em>any</em> of
            them, and its button turns it round. Press a pill to swap <em>required</em> for <em>ruled out</em>,{' '}
            <kbd>⇅</kbd> to pick it up and then click a group to put it down, and <kbd>✕</kbd> to take it off. The game
            has no brackets, so whatever ends up here is written back out as clauses it does take — which is why an{' '}
            <em>any</em> can cost a good many characters.
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
                  setState((was) => ({ ...was, tree: presetTree(preset) }));
                  setFocus([]);
                  setHeld(null);
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

          <div class="combobox">
            <input
              ref={textRef}
              id="text"
              type="text"
              value={typing}
              placeholder="pikachu"
              autocomplete="off"
              spellcheck={false}
              role="combobox"
              aria-expanded={offered.length > 0}
              aria-controls="suggestions"
              aria-autocomplete="list"
              aria-activedescendant={offered[active] ? `suggestion-${active}` : undefined}
              aria-label="Name or species"
              onInput={(event) => {
                const parts = event.currentTarget.value.split(',');
                const left = parts.pop() ?? '';

                // A comma is what separates names, so typing or pasting one commits the name in front of it — which is
                // also how a pasted `pikachu, eevee, snorlax` arrives as three pills rather than one name.
                if (parts.length > 0) {
                  takeName(parts.join(','));
                }

                setTyping(left);
                setOffered(suggestions(left));
                setActive(-1);
              }}
              onKeyDown={onNameKeyDown}
              onBlur={closeSuggestions}
            />

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
                  key={speciesTerm(offer)}
                  id={`suggestion-${index}`}
                  role="option"
                  aria-selected={index === active}
                  // mousedown rather than click: a click arrives after the blur that closes the list, by which point
                  // there is no row left to have been clicked.
                  onMouseDown={(event) => {
                    event.preventDefault();
                    takeName(speciesTerm(offer));
                  }}
                >
                  {offer.name}
                  {offer.family && <span class="family"> (family)</span>}
                </li>
              ))}
            </ul>
          </div>

          <p class="help">
            Partial names match, so <code>char</code> finds Charmander and Charizard. Two letters bring up the species
            that match, and <kbd>↓</kbd> then <kbd>Enter</kbd> takes one into the group you are filling. Each species is
            followed by its family: taking <em>Charmander (family)</em> writes <code>+charmander</code>, the game's
            shorthand for a species and the rest of its evolutionary line.
          </p>
        </section>

        <div class="groups">
          {GROUPS.map((category) => (
            <section key={category.id} class="group" style={{ '--hue': String(category.hue) }}>
              <h2 class="label">{category.label}</h2>
              <div class="chips">
                {category.terms.map((term) => {
                  const chip = chipState(state.tree, focus, term.id);

                  return (
                    <button
                      key={term.id}
                      type="button"
                      class="chip"
                      data-state={chip}
                      title={`${term.term} — press to require, again to rule out, again to drop; or drag into a group`}
                      aria-label={`${term.label} — ${CHIP[chip].said} in the group you are filling`}
                      onPointerDown={(event) =>
                        onPointerDown(event, termLeaf(term.id), null, () => pressChip(termLeaf(term.id)))
                      }
                    >
                      <span class="state" aria-hidden="true">
                        {CHIP[chip].glyph}
                      </span>
                      <span class="name">{term.label}</span>
                    </button>
                  );
                })}
              </div>
              <p class="help">{ticked(category.help)}</p>
            </section>
          ))}
        </div>
        <section class="panel" aria-labelledby="rangesLabel">
          <h2 class="label" id="rangesLabel">
            Ranges
          </h2>
          <div class="chips">
            {RANGES.map((range) => {
              const chip = chipState(state.tree, focus, range.id);

              return (
                <button
                  key={range.id}
                  type="button"
                  class="chip"
                  data-state={chip}
                  title={`${range.prefix || 'a dex span'} — press to add a span, again to rule it out, again to drop`}
                  aria-label={`${range.label} — ${CHIP[chip].said} in the group you are filling`}
                  onPointerDown={(event) =>
                    onPointerDown(event, rangeLeaf(range.id), null, () => pressChip(rangeLeaf(range.id)))
                  }
                >
                  <span class="state" aria-hidden="true">
                    {CHIP[chip].glyph}
                  </span>
                  <span class="name">{range.label}</span>
                </button>
              );
            })}
          </div>
          <p class="help">
            A span pill carries its own two boxes, and a box left empty falls back to that range's limit. Two spans of
            the same range in one group is a search you reach by dragging the second one in, a press reading the one
            already there.
          </p>
        </section>
      </main>

      {/* The pill under the pointer, drawn outside the layout so it cannot push anything about as it moves. */}
      {drag?.moved === true && (
        <span class="dragging" style={{ left: `${drag.x}px`, top: `${drag.y}px` }} aria-hidden="true">
          {isGroup(drag.node) ? JUNCTION[drag.node.junction].label : leafLabel(drag.node)}
        </span>
      )}

      <footer>
        <p>
          The syntax is Pokémon GO's own, as typed into the search box on the Pokémon storage screen. Everything runs in
          your browser, and the link updates as you build so an arrangement can be shared or bookmarked.
        </p>
        <p>This site is unofficial.</p>
      </footer>
    </>
  );
}
