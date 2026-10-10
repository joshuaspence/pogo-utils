/**
 * The search-string builder page: a catalogue of pills on one side and the query you arrange them into on the other.
 *
 * The arrangement *is* the state: the canvas holds a tree and `query.js` composes whatever is in it, so a bracket is a
 * group and a group is a thing on screen you drop a pill into.
 *
 * A query can be typed in as well, and that is an import rather than a second composer: `parse.js` reads the brackets
 * into a tree, the canvas draws it, and the one composer takes it from there. Which is the whole difference between
 * the Advanced pane and the text box that used to sit beside the chips composing clauses of its own.
 *
 * **The two panes are two views of one state, which is why they are tabs and not pages.** Arranging and typing reach
 * the same tree, so the output card sits above both and stays put as they swap: the answer is the constant and the
 * pane is only how this reader is feeding it. Nothing about the pane is in the link, a link carrying the arrangement
 * and the arrangement drawing in either.
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
import { bounded, GROUPS, PRESETS, RANGES, RANGES_BY_ID, type Range } from '../search/terms.js';
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
  spanned,
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

/** Which way of writing the query is on show. Both feed the one arrangement; neither is a second state. */
type Pane = 'builder' | 'advanced';

/**
 * The two panes, and what each is for.
 *
 * *Advanced* names the pane for what a reader is doing in it — writing the search out themselves — rather than for any
 * one thing the box accepts. Brackets are the part of it the game cannot do at all, so they are what the help leads
 * with, but a query typed in there needs none: `shiny&lucky` is this pane as much as `(a&b),(c&d)` is, and a tab that
 * said *Brackets* turned one capability into the name of the mode.
 *
 * Not *raw* either, which would point the word at the wrong half: what goes in that box is the *richer* of the two
 * strings, and the raw one is the output above it.
 */
const PANES: readonly { id: Pane; label: string; said: string }[] = [
  { id: 'builder', label: 'Builder', said: 'Arrange pills from the catalogue' },
  { id: 'advanced', label: 'Advanced', said: 'Write the search out yourself, brackets and all' },
];

/**
 * The move slots the game numbers, and what each of them is. A bare `@` asks about every slot at once, which is the
 * common case and so where a fresh search starts.
 *
 * Slot 4 is the extra charged move a Mega can hold, and it is the one that takes a move *name* and nothing else: the
 * community phrase list has `@4{criteria}` not working with a type, with `special` or with `weather`, which is a
 * search a reader can write here and the game will not answer. Said in the help rather than by withholding the option,
 * the slot itself working perfectly well for the move names it is mostly wanted for.
 */
const SLOTS: readonly { value: string; label: string }[] = [
  { value: '', label: 'Any slot' },
  { value: '1', label: 'Fast move' },
  { value: '2', label: 'First charged' },
  { value: '3', label: 'Second charged' },
  { value: '4', label: 'Mega extra move' },
];

/**
 * The reader's own text with a mark they typed themselves taken off the front, so a phrase pasted out of the reference
 * is not marked a second time: `#keepers` into the tag box composed `##keepers` and `@3crunch` into the move box
 * `@@3crunch`, neither of which matches anything or says so anywhere.
 *
 * **Digits go with an `@` and stay with a `#`.** A slot is part of the `@` mark, so the dropdown beside the box is
 * what settles which slot the pill ends up in and a pasted `@3` is dropped with the rest of the mark — which is the
 * one rule here that can ignore something the reader typed, and it is the rule that never writes a string the game
 * cannot read: taking the paste instead would make *First charged* and a pasted `@3` into `@23crunch`. A tag, on the
 * other hand, has every right to be called `3things`, and stripping its digits would search a tag nobody has.
 *
 * Exported for the test, which walks both marks over text that carries one and text that does not.
 */
export const unmarked = (mark: string, text: string) => text.replace(mark.startsWith('@') ? /^@\d*/ : /^#/, '');

/**
 * The pills one of the marked boxes makes of what a reader typed: the text split the way the name box splits it, each
 * part behind the mark the game reads it by.
 *
 * These are `name` pills, which is what they are: the game matches a word it does not know against the names in
 * storage, and `@hydro pump` and `#keepers` are two more texts the catalogue cannot hold. So they need no kind of
 * their own — they compose, read back and shorten as any name does, the mark being what keeps the shortener off them.
 *
 * **Split on the comma**, through the same `names` the name box uses. A pill is one alternative within a clause and a
 * comma inside one is the game's own *or*, so `crunch,bite` left whole composed `@3crunch,bite` out of a single pill:
 * the game reads two alternatives there, `parse.js` reads it back as an `any` of two, and the canvas goes on showing
 * one pill that asks neither.
 *
 * **Split first, unmark second**, which is the order and not an arrangement of it. Unmarking the string instead took
 * the mark off its head alone, so a pasted `#keepers,#dupes` came out `#keepers` and `##dupes` — the same silent miss
 * the unmarking was added to stop, one comma along. The two halves were each right and wrong together, which is why
 * this is one exported function rather than two: a test of the pieces passed over it.
 *
 * The rest of the game's punctuation is left alone, and **what that costs is a silent split rather than a refusal.**
 * `parse.js` reads four of those characters as operators and says nothing: `&` and `|` come back as two pills in an
 * `all`, `;` and `:` as two in an `any`, and in each the mark is lost off everything after the first — so a tag
 * genuinely called `a&b` composes `#a&b` and reads back as a pill asking for the ordinary word `b`. Only `!`, `(` and
 * `)` are refused. It is left alone because the game has no quoting syntax either and no string searches that tag, and
 * because it is a limitation of all three boxes rather than of these two; `parse.test.js` pins it from the other side,
 * `a|b` composing and reading back as `a&b`.
 *
 * Exported whole for the test rather than in pieces, for the reason the ordering above gives.
 */
export const marked = (mark: string, text: string) => names(text).map((part) => `${mark}${unmarked(mark, part)}`);

/** What a term chip's tooltip says: the word the game reads, then what pressing it does. */
const chipTitle = (term: string) =>
  `${term} — press to require, again to rule out, again to drop; or drag into a group`;

/**
 * What a range chip's tooltip says: the shape a span of it is written in, then what pressing the chip does.
 *
 * The shape comes through `spanned`, the writer that owns which end of a span a phrase sits on, so `cp{N}` and
 * `{N}attack` are one answer rather than two spellings. The dex is the one range with no phrase at either end and so
 * nothing for that to show, which is what the words are for — and reaching them off an empty `prefix` is what gave
 * all three IVs the dex's tooltip, every one of them having an empty prefix too.
 *
 * Exported for the test, which holds every range in the table to naming its own phrase.
 */
export const rangeTitle = (range: Range) => {
  const shape = range.prefix === '' && range.suffix === undefined ? 'a dex span' : spanned(range, '{N}');

  return `${shape} — press to add a span, again to rule it out, again to drop`;
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
 * **An unpaired tick is prose rather than markup**, so the tail it opens is rejoined and left as text. One caller of
 * `ticked` below is a refusal from `parse.js` that quotes a token the reader typed, and a reader can type a tick — in
 * a name, where the box splits on commas and leaves everything else alone. Pairing from the left and giving
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
 * Four callers: the two refusals, from `clauses.js` and `parse.js`; a category's own help in `terms.js`, which was
 * showing its ticks as ticks — `the game has no \`gen1\`` had been on the page since before the canvas; and the
 * caveats beside a phrase the game mishandles, one of which quotes the span it reads a shortcut as instead.
 */
const ticked = (message: string) =>
  spans(message).map((part, index) => (index % 2 === 0 ? part : <code key={index}>{part}</code>));

/**
 * A bound as the tree should hold it: a number inside the range's limits, or nothing where the box is empty.
 *
 * Exported for the test, which walks a year in beside `boxText` below.
 */
export function readBound(value: string, range: Range) {
  if (value.trim() === '') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isNaN(parsed) ? null : bounded(parsed, range);
}

/** Which end of a span a box edits, which is the field it writes. */
type Edge = 'from' | 'to';

/** What each end of a span is called, which is the whole of what its box needs beyond the range's own two limits. */
const EDGES: Record<Edge, string> = { from: 'lowest', to: 'highest' };

/**
 * The levels an end of a named span offers: every level that leaves the span saying something, plus whichever one the
 * end is already set to.
 *
 * **A span covering the whole range says nothing, and three picks reached one.** A `from` on the floor with the other
 * end open writes `buddy0-`, which the phrase list reads as values at or above nought; a `to` on the ceiling with the
 * lowest open writes `buddy-5`, values at or below five; and the two of them picked the other way round — lowest five,
 * highest nought — is inverted, which `leafText` swaps into `buddy0-5`. All three are the whole of storage, and on a
 * *Safe to transfer* canvas the negated form of one excludes every Pokémon the reader owns from the string.
 *
 * So the floor goes from the lowest end, the ceiling from the highest, and each end is held to the other's side of the
 * span. Nothing is lost by any of it: a span that starts on the floor asks for the same set as one with that end left
 * open, and so does one that ends on the ceiling — `buddy0-3` and `buddy-3` are two spellings of levels nought to
 * three, `buddy2-5` and `buddy2-` two of levels two to five. `optimise.js` would have caught the no-op span, but its
 * `everything` is measured against the dex alone.
 *
 * **The bound comes in because a tree can hold what the control would not offer.** `buddy0` is the documented
 * spelling of *never a buddy*, so the Advanced pane and a shared link both arrive with a `from` of nought, and a
 * `select` whose value matches none of its options selects nothing at all — the end rendered blank over a query
 * matching the whole of storage, measured rather than reasoned about. Offering a bound where it is already set leaves
 * it unpickable while keeping the control honest about the state it is showing.
 *
 * Exported for the test, which sweeps the pairs the two ends can reach in either order of picking.
 */
export const pickable = (range: Range, edge: Edge, bound: number | null, other: number | null) =>
  (range.levels ?? [])
    .map((name, level) => ({ level, name }))
    .filter(({ level }) => {
      const within = edge === 'from' ? level > (range.min ?? 0) : level < range.max;
      const beside = other === null || (edge === 'from' ? level <= other : level >= other);

      return level === bound || (within && beside);
    });

/**
 * A span pill with one of its ends written. Anything else is handed back as it is: a box's path names its own pill,
 * which the narrowing says rather than a cast asserting it.
 */
function withBound(node: Node, edge: Edge, bound: number | null): Node {
  if (node.kind !== 'range') {
    return node;
  }

  return edge === 'from' ? { ...node, from: bound } : { ...node, to: bound };
}

/** The box a reader has their caret in, and the digits they have typed into it. */
interface Typed {
  path: Path;
  edge: Edge;
  text: string;
}

/**
 * What one of a span pill's boxes shows: the digits the reader is typing in *that* box, and the bound the tree holds
 * in every other one.
 *
 * **A box cannot show the clamp back to the reader typing in it.** Every part of a year short of the whole is below
 * the floor of 2016, so a box echoing its own clamp rewrites the text under the caret and the next digit lands on the
 * end of that instead — `year` had two reachable values. The tree still takes a bounded number from every keystroke,
 * a pill the boxes make being one a typed query or a link could have made, which is what `bounded` in `terms.js` is
 * for.
 *
 * Exported for the test, which walks a year in a digit at a time.
 */
export function boxText(typed: Typed | null, path: Path, edge: Edge, bound: number | null): string {
  if (typed !== null && typed.edge === edge && same(typed.path, path)) {
    return typed.text;
  }

  return bound === null ? '' : String(bound);
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

  /** The two operator searches being typed, and the slot the `@` one asks about. A slot sticks; the text does not. */
  const [marking, setMarking] = useState('');
  const [slot, setSlot] = useState('');
  const [tagging, setTagging] = useState('');

  /** The span pill's box being typed in, if any — `boxText` above says why that is worth a piece of state. */
  const [typedBound, setTypedBound] = useState<Typed | null>(null);

  /** The query being typed into the import box, and why the last attempt at it went nowhere. */
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState<string | null>(null);

  /**
   * The text the arrangement was last built from, which is what *Use it* is disabled over.
   *
   * Pressing it replaces the arrangement, and the text staying in the box means it can be pressed a second time with
   * the canvas since edited — which would rebuild the typed query over that work, silently, from a pane where the
   * canvas is not even on screen. Holding the text that was used closes it: the button says *this query is already
   * applied* until the reader changes the query, which is the press they kept the text for.
   */
  const [used, setUsed] = useState<string | null>(null);

  /**
   * Which pane is open. Not in the link and not stored: the arrangement is what a link carries, and it draws in either
   * pane, so the pane is how *this* reader is working rather than anything about the query. Builder to begin with,
   * being the one that needs no syntax known in advance.
   */
  const [pane, setPane] = useState<Pane>('builder');
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
    setMarking('');
    setTagging('');
    setTypedBound(null);
    setTyped('');
    setTypedError(null);
    setUsed(null);
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

    // A path names a pill only until something moves, and a box whose pill has gone would hand its digits to whatever
    // takes that path next. Pressing a pill's own face does not blur its boxes, the press preventing the default.
    setTypedBound(null);
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

  /**
   * Back to the blank page, which is every box on it rather than the canvas alone: a typed query left behind would sit
   * full above an output box saying nothing was arranged, and the three text boxes are emptied for the same reason.
   *
   * The move slot is not, and nor is the Shorten toggle above it. Both are settings for whatever the reader does next
   * rather than leftovers of what they did last, and both say on screen which way they are set — where a box holds
   * text that has already gone into a pill, and so says nothing true once the canvas is empty.
   */
  function clear() {
    setState((was) => ({ ...emptyState(), optimise: was.optimise }));
    setFocus([]);
    setHeld(null);
    setTyping('');
    setMarking('');
    setTagging('');
    setTypedBound(null);
    setTyped('');
    setTypedError(null);
    setUsed(null);
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
   * The arrow keys a tablist promises: left and right step between the tabs, wrapping, and the tab stepped onto is
   * both focused and opened. `Home` and `End` are left out — with two tabs they would be the arrows under other
   * names.
   *
   * **The step counts from the tab the key was pressed on, not from the open one.** Keeping both tabs in the tab
   * order is what lets focus sit on a tab that is not selected, and read off the selection the arrows there did the
   * wrong thing twice over: with two panes, `at + 1` and `at - 1` are the same index, so both keys selected the
   * focused tab and neither moved focus. A roving `tabindex` is what ordinarily keeps the two from diverging, so the
   * reading that gets away with the selection is the one this tablist is not.
   *
   * Focus is then moved by hand, since pressing an arrow has to land on the other button for the next press to come
   * back.
   */
  function onPaneKeyDown(event: KeyboardEvent, from: Pane) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;

    if (step === 0) {
      return;
    }

    event.preventDefault();

    const at = PANES.findIndex((one) => one.id === from);
    const next = PANES[(at + step + PANES.length) % PANES.length];

    if (next) {
      setPane(next.id);
      document.getElementById(`pane-${next.id}`)?.focus();
    }
  }

  /**
   * A typed query put on the canvas, replacing whatever was there. Replacing rather than merging, because a reader who
   * has written a whole search means that search — and it is destructive, which is what `used` above is for: the
   * arrangement it overwrites is gone, there being nothing to restore it from. `replaceQuery` is `replaceState`
   * (`router.js`), so the link in the address bar is the new arrangement and the browser's Back button leaves the page
   * rather than stepping back through arrangements.
   *
   * The text stays in the box afterwards, being what the reader typed: the query to correct a bracket in and press
   * again, and the only record of what was asked for once the canvas is showing the clauses it came to rather than the
   * brackets it was written with. Nothing but this function reads the box, so the two of them holding a query is no
   * state the page has to keep in step — the arrangement is still its only state.
   *
   * A failure leaves the text and the arrangement alone, and leaves `used` alone with them, there being nothing to put
   * and no reason to take anything away.
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
    setTypedBound(null);
    setUsed(typed);
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

  /**
   * One operator search finished with, as pills in the group being filled. Answers whether it committed anything, so
   * the caller empties its own box and only then.
   *
   * `marked` above is the whole of what the text becomes; this is the part that needs the canvas. Through `cycle` for
   * the reason `takeName` is: the same text twice is one pill's worth of search.
   */
  function takeMarked(mark: string, text: string) {
    const parts = marked(mark, text);

    for (const part of parts) {
      edit((tree) => cycle(tree, focus, { kind: 'name', text: part, negated: false }));
    }

    return parts.length > 0;
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
   * One end of a span pill, which is a dropdown of names where the range has them and a box to type a number into
   * where it does not. The box shows the reader's own text while their caret is in it, and the bound once it has
   * left, which `boxText` above gives the reason for; a dropdown has neither, and says why below.
   *
   * The box's greyed-out limit is its own `min` or `max` rather than a second spelling of one. It is a limit the
   * input enforces and no longer a bound an empty box composes to, so a placeholder transcribed separately would be
   * free to advertise one the input refuses and nothing would fail.
   */
  function renderBound(path: Path, range: Range, edge: Edge, bound: number | null, other: number | null) {
    const write = (value: string) =>
      edit((tree) => update(tree, path, (node) => withBound(node, edge, readBound(value, range))));

    /*
     * A range whose values the game names picks from them rather than taking digits: `buddy2` is a Good Buddy and a
     * reader cannot be expected to know that, where a CP of 1500 says what it is. A pill the reader has just dropped
     * has both ends on the blank option and so goes on asking nothing at all, which both ends picked by default would
     * have ended.
     *
     * That option names the absence rather than the end it sits on, as the Pokédex's own selects do with *All
     * generations*: a `select` has no placeholder, so `lowest` there read as a value that had been chosen and said the
     * opposite of what the pill was doing. `EDGES` still names the end, in the label a screen reader reaches it by.
     *
     * No `typedBound` here, that being for digits arriving one at a time: a pick is a whole value or none.
     */
    if (range.levels) {
      return (
        <select
          value={bound === null ? '' : String(bound)}
          aria-label={`${range.label}, ${EDGES[edge]}`}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) => write(event.currentTarget.value)}
        >
          <option value="">Any level</option>
          {pickable(range, edge, bound, other).map(({ level, name }) => (
            <option key={level} value={String(level)}>
              {`${level} ${name}`}
            </option>
          ))}
        </select>
      );
    }

    const floor = String(range.min ?? 0);
    const ceiling = String(range.max);

    return (
      <input
        type="number"
        min={floor}
        max={ceiling}
        placeholder={edge === 'from' ? floor : ceiling}
        value={boxText(typedBound, path, edge, bound)}
        aria-label={`${range.label}, ${EDGES[edge]}`}
        onPointerDown={(event) => event.stopPropagation()}
        onInput={(event) => {
          const { value } = event.currentTarget;

          setTypedBound({ path, edge, text: value });
          write(value);
        }}
        onBlur={() => setTypedBound(null)}
      />
    );
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
    const range = leaf.kind === 'range' ? RANGES_BY_ID.get(leaf.id) : undefined;
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
            {renderBound(path, range, 'from', leaf.from, leaf.to)}
            <span class="dash">–</span>
            {renderBound(path, range, 'to', leaf.to, leaf.from)}
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
          Build a string for the game's own search box, either way round: arrange it from the catalogue in{' '}
          <em>Builder</em>, where a chip once requires it, twice rules it out and three times drops it, or write it out
          yourself in <em>Advanced</em>, brackets and all. Both fill the one query, and the string for the game is
          always at the top.
        </p>
      </header>

      <main class="builder">
        <section class="output" aria-label="The search string">
          <div class="string">
            {/* Plain text, not a label: the live region reads the string out, so nothing reaches it by name. */}
            <span class="side">For the game</span>
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
                <code>{term}</code> — {ticked(note)}.
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

        {/*
         * The two ways to write the query. Ordinary buttons rather than links, the choice being a view of one state and
         * not a place: a link would put the pane in history beside the arrangements, so Back would step through panes.
         *
         * `role="tablist"` is announced as a tablist — *Builder, tab, selected, 1 of 2* — and that announcement is a
         * promise about the arrow keys whatever the `tabindex` says, which is why `onPaneKeyDown` is here. Selection
         * follows focus, the panes being a show-and-hide rather than anything to fetch.
         *
         * Both tabs keep their place in the tab order rather than taking a roving `tabindex`. With two of them it costs
         * a reader nothing to Tab past one, and it leaves the arrows as a second way across rather than the only one.
         */}
        <div class="panes" role="tablist" aria-label="How to write the query">
          {PANES.map(({ id, label, said }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`pane-${id}`}
              class="pane-tab"
              title={said}
              aria-selected={pane === id}
              aria-controls={`panel-${id}`}
              onClick={() => setPane(id)}
              onKeyDown={(event) => onPaneKeyDown(event, id)}
            >
              {label}
            </button>
          ))}
        </div>

        {/*
         * Hidden rather than unmounted, so the canvas a reader comes back to is the one they left — a pane switch is a
         * change of view and should cost them no scroll position and no half-filled span box.
         */}
        <div class="pane" role="tabpanel" id="panel-builder" aria-labelledby="pane-builder" hidden={pane !== 'builder'}>
          {/* The query itself, which is the pane's subject. Sticky output above it, catalogue below. */}
          <section class="canvas" aria-labelledby="canvasLabel">
            <h2 class="label" id="canvasLabel">
              The query
            </h2>

            {renderGroup([])}

            <p class="help">
              A group asks for <em>all</em> of its pills or <em>any</em> of them, and its button turns it round. Press a
              pill to swap <em>required</em> for <em>ruled out</em>, <kbd>⇅</kbd> to pick it up and then click a group
              to put it down, and <kbd>✕</kbd> to take it off. The game has no brackets, so whatever ends up here is
              written back out as clauses it does take — which is why an <em>any</em> can cost a good many characters.
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
                class="field"
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

                  // A comma is what separates names, so typing or pasting one commits the name in front of it —
                  // which is also how a pasted `pikachu, eevee, snorlax` arrives as three pills rather than one.
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
              that match, and <kbd>↓</kbd> then <kbd>Enter</kbd> takes one into the group you are filling. Each species
              is followed by its family: taking <em>Charmander (family)</em> writes <code>+charmander</code>, the game's
              shorthand for a species and the rest of its evolutionary line.
            </p>
          </section>

          {/*
           * The `@` search, which is one box because the game's own priority is what sorts out what goes in it: a type
           * is read before a move of the same name, and `special` and `weather` before either. So a reader types a
           * move, a type or one of those two words, picks the slot, and the game resolves which they meant — where a
           * box per kind would have been four boxes writing one string.
           *
           * The chips cover the slotless forms a catalogue can hold — the eighteen `@{type}` and the two keywords —
           * and this is for the move names it cannot and for every slot of all of them.
           */}
          <section class="panel" aria-labelledby="moveLabel">
            <h2 class="label" id="moveLabel">
              Move or move criteria
            </h2>

            <div class="marked">
              <select
                aria-label="Which move slot"
                value={slot}
                onChange={(event) => setSlot(event.currentTarget.value)}
              >
                {SLOTS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              <input
                class="field"
                type="text"
                value={marking}
                placeholder="hydro pump"
                autocomplete="off"
                spellcheck={false}
                aria-label="Move name, type, special or weather"
                onInput={(event) => setMarking(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && takeMarked(`@${slot}`, marking)) {
                    event.preventDefault();
                    setMarking('');
                  }
                }}
              />

              <button
                type="button"
                onClick={() => {
                  if (takeMarked(`@${slot}`, marking)) {
                    setMarking('');
                  }
                }}
              >
                Add
              </button>
            </div>

            <p class="help">
              A move name, a type, <code>special</code> or <code>weather</code>, in any slot or in one of them — so{' '}
              <em>Second charged</em> and <code>crunch</code> write <code>@3crunch</code>. The <code>@</code> and the
              slot are added for you, the dropdown being what settles the slot, so a phrase pasted here can keep its own
              and will take that one. Several at once go in comma-separated, a pill apiece. Move names complete as you
              go, in the game rather than here, so <code>@hydro</code> finds Hydro Pump and Hydro Cannon alike. Three
              catches: a type is read ahead of a move named the same, so <code>@psychi</code> is how to ask for the move
              Psychic; <em>Mega extra move</em> answers to a move name alone, not to a type or to those two words; and a
              move beginning <code>count</code>, <code>dynamax</code> or <code>gigantamax</code> is read as that
              shortcut phrase rather than as the move, which is a search the game has no spelling for.
            </p>
          </section>

          <section class="panel" aria-labelledby="tagLabel">
            <h2 class="label" id="tagLabel">
              Tag
            </h2>

            <div class="marked">
              <input
                class="field"
                type="text"
                value={tagging}
                placeholder="keepers"
                autocomplete="off"
                spellcheck={false}
                aria-label="Tag name"
                onInput={(event) => setTagging(event.currentTarget.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && takeMarked('#', tagging)) {
                    event.preventDefault();
                    setTagging('');
                  }
                }}
              />

              <button
                type="button"
                onClick={() => {
                  if (takeMarked('#', tagging)) {
                    setTagging('');
                  }
                }}
              >
                Add
              </button>
            </div>

            <p class="help">
              A tag by the name you gave it. Only you know what you called yours, so there is no chip for one — the{' '}
              <em>Tagged</em> chip is <code>#</code>, the game's word for having any tag at all. Tag names complete in
              the game here too. The <code>#</code> is added for you, and it earns its place: a tag searched without one
              is an ordinary word, which a tag named after a search phrase then loses to.
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
                        title={chipTitle(term.term)}
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
                    title={rangeTitle(range)}
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
              A span pill carries its own two ends — boxes to type a number into, or named dropdowns where the game
              names the values — and an end left empty, or on <em>Any level</em>, leaves that end of the span open. Two
              spans of the same range in one group is a search you reach by dragging the second one in, a press reading
              the one already there. Three of them are not the numbers they look like: an IV is the appraisal's own
              bucket, where <code>0</code> is an IV of 0, <code>1</code> is 1–5, <code>2</code> is 6–10,{' '}
              <code>3</code> is 11–14 and <code>4</code> is 15 — so <code>4</code> to <code>4</code> is the perfect
              one. The Max move levels and the counts of unlocked Max moves start at 1, a Max species having its attack
              from the first.
            </p>
          </section>
        </div>

        {/*
         * The other way in: the search written out, with the brackets the game has none of. It fills the canvas in the
         * pane next door rather than composing a string of its own, so there is still one arrangement and one output —
         * and the pills it leaves can be dragged about like any others, which is the whole difference between this and
         * a second box that composed beside the first.
         *
         * It commits on its button or on Enter rather than as it is typed: every half-written bracket is an error, and
         * a canvas that emptied itself at each keystroke would be unusable.
         *
         * The panel is the card, where the Builder's is a column of them, and it carries no heading of its own: the
         * field's label says what the box holds, and a tab panel is named by the tab that opened it.
         */}
        <div
          class="pane panel"
          role="tabpanel"
          id="panel-advanced"
          aria-labelledby="pane-advanced"
          hidden={pane !== 'advanced'}
        >
          <form
            class="import"
            onSubmit={(event) => {
              event.preventDefault();
              importTyped();
            }}
          >
            {/* Named for the string rather than for its brackets, which are one of the things it may hold. */}
            <label class="side" for="typed">
              Your query
            </label>
            <input
              id="typed"
              type="text"
              value={typed}
              placeholder="(pikachu&shiny),(pumpkaboo&xxl)"
              autocomplete="off"
              spellcheck={false}
              aria-invalid={typedError !== null}
              aria-describedby="importHelp"
              onInput={(event) => {
                setTyped(event.currentTarget.value);
                setTypedError(null);
              }}
            />
            {/*
             * Disabled over the text the arrangement was built from, which also closes the Enter that would submit the
             * form: a browser's implicit submission goes through the default button and does nothing where that button
             * is disabled, so the one guard covers both ways of pressing it.
             *
             * Compared trimmed, as the emptiness test beside it is. A space on either end is not a change to the
             * query — the tokeniser trims each term — so re-enabling over one would hand back the press that
             * overwrites the canvas while asking for nothing. Whitespace *inside* the query still counts as a change,
             * which is a deliberate edit of its characters rather than a stray keystroke.
             */}
            <button type="submit" class="use" disabled={typed.trim() === '' || typed.trim() === used?.trim()}>
              Use it
            </button>
          </form>

          <p class="broken" hidden={typedError === null}>
            {ticked(typedError ?? '')}
          </p>

          <p class="help" id="importHelp">
            <code>&amp;</code> and <code>|</code> are <em>and</em>, <code>,</code> <code>;</code> and <code>:</code> are{' '}
            <em>or</em>, and <code>!</code> rules out whatever follows — so{' '}
            <code>(pikachu&amp;shiny),(pumpkaboo&amp;xxl)</code> matches a shiny Pikachu <em>or</em> an XXL Pumpkaboo.
            The game takes no brackets, so <em>Use it</em> lays the query out as pills in the Builder and the box above
            writes it back as clauses the game does take.
          </p>
        </div>
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
