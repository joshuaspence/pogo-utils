/**
 * The search-string builder page. Renders the term catalogue as chips, keeps the state they describe, and writes the
 * string on every change — the page holds no string of its own, so what is shown is always what query.js composes from
 * the state rather than something edited alongside it and able to drift.
 *
 * The chips are rendered from terms.js rather than written into search.html, so adding a term is one line in the table
 * and nothing else. That is also what lets the link reader restore a state before the page has drawn anything: the
 * state is read first, and the chips are drawn already wearing it.
 */

/** @import { Range } from './terms.js' */
/** @import { Offer } from './species.js' */

import { GROUPS, PRESETS, RANGES, TERMS_BY_ID } from './terms.js';
import { compose, emptyState, fromFragment, names, toFragment } from './query.js';
import { optimise } from './optimise.js';
import { suggestions, written } from './species.js';
import { byId, el } from '../dom.js';

/**
 * Where a chip is. The three are a closed set rather than strings, so a `NEXT` that named a fourth or a `setChipState`
 * handed one would be caught here rather than painting a chip nothing styles.
 *
 * @typedef {'off' | 'in' | 'out'} ChipState
 */

/**
 * One chip: the button, the span wearing its glyph, and the words the label is built from. The glyph span is held
 * rather than found again, because `node.querySelector('.state')` asks the document about a child this file appended
 * itself and gets `Element | null` back for the trouble.
 *
 * @typedef {object} Chip
 * @property {HTMLButtonElement} node
 * @property {HTMLSpanElement} glyph
 * @property {string} label
 */

/**
 * One numeric range: its two boxes and the row they sit in, held for the same reason — `from.closest('.range')` is the
 * row this file just built, asked for the long way round.
 *
 * @typedef {object} RangeRow
 * @property {HTMLDivElement} row
 * @property {HTMLInputElement} from
 * @property {HTMLInputElement} to
 */

const els = {
  query: byId('query'),
  copy: byId('copy', HTMLButtonElement),
  clear: byId('clear'),
  count: byId('count'),
  caveat: byId('caveat'),
  optimise: byId('optimise', HTMLInputElement),
  rewritten: byId('rewritten'),
  presets: byId('presets'),
  field: byId('field'),
  text: byId('text', HTMLInputElement),
  suggestions: byId('suggestions'),
  groups: byId('groups'),
  ranges: byId('ranges'),
};

let state = fromFragment(location.hash);

// Every chip and range input by the id it answers to, so re-rendering after a preset or a link is a walk over the
// state rather than a rebuild of the DOM — the focus ring stays where the reader left it.
/** @type {Map<string, Chip>} */
const chips = new Map();

/** @type {Map<string, RangeRow>} */
const rangeInputs = new Map();

/** @type {number | undefined} */
let copied;

/**
 * Where a chip goes when it is clicked: unused, required, ruled out, and round again.
 *
 * @type {Record<ChipState, ChipState>}
 */
const NEXT = { off: 'in', in: 'out', out: 'off' };

/**
 * What a chip wears in each state — the glyph, and the words a screen reader is given instead of the colour.
 *
 * @type {Record<ChipState, { glyph: string, said: string }>}
 */
const STATE = {
  off: { glyph: '+', said: 'not used' },
  in: { glyph: '✓', said: 'required' },
  out: { glyph: '!', said: 'ruled out' },
};

/** @param {string} id */
const stateOf = (id) => (state.include.has(id) ? 'in' : state.exclude.has(id) ? 'out' : 'off');

/**
 * Nothing chosen, still written the way the reader asked for it. Clearing and loading a preset both start from empty,
 * and neither is a reason to stop shortening: the toggle says how a query is written rather than what is in one.
 */
const cleared = () => ({ ...emptyState(), optimise: state.optimise });

/**
 * @param {string} id
 * @param {ChipState} next
 */
function setChipState(id, next) {
  state.include.delete(id);
  state.exclude.delete(id);

  if (next === 'in') {
    state.include.add(id);
  } else if (next === 'out') {
    state.exclude.add(id);
  }
}

/**
 * @param {string} id
 * @param {Chip} chip
 */
function paintChip(id, { node, glyph, label }) {
  const current = stateOf(id);

  node.dataset.state = current;
  glyph.textContent = STATE[current].glyph;
  node.setAttribute('aria-label', `${label} — ${STATE[current].said}`);
}

/**
 * The string the page is showing, which is the string the Copy button writes — one answer rather than two compositions
 * that could disagree about which of them the reader is looking at.
 *
 * The optimiser is offered the state and its answer taken only where it is genuinely shorter, so the toggle can never
 * cost characters. Empty does not count as shorter: every generation at once really does reduce to no dex clause at
 * all, but a blank output box beside nine lit chips reads as a page that has broken rather than as a search for
 * everything.
 */
function current() {
  const plain = compose(state);

  if (!state.optimise) {
    return { ...plain, was: null, rewrites: [], lossy: false };
  }

  const { state: shortened, rewrites, lossy } = optimise(state);
  const short = compose(shortened);
  const worth = short.query.length > 0 && short.query.length < plain.query.length;

  return worth
    ? { ...short, was: plain.query.length, rewrites, lossy }
    : { ...plain, was: null, rewrites: [], lossy: false };
}

/** The length of the string, said in words. A one-character query is what the shortening makes reachable. */
/** @param {number} length */
const characters = (length) => `${length} character${length === 1 ? '' : 's'}`;

/**
 * The substitutions behind the string on screen, and nothing when it is the plain one. A reader handed `4` where they
 * typed `charmander` cannot otherwise check what they are about to paste over a storage box full of Pokémon.
 *
 * @param {readonly [string, string][]} rewrites
 * @param {boolean} lossy
 */
function paintRewrites(rewrites, lossy) {
  els.rewritten.textContent = '';
  els.rewritten.hidden = rewrites.length === 0;

  rewrites.forEach(([from, to], index) => {
    const pair = el('span', 'rewrite');
    pair.append(el('code', null, from), document.createTextNode(' → '), el('code', null, to));

    // The comma is part of the text rather than a gap in the layout, so a screen reader reads a list of substitutions
    // rather than running `26` into the word after it.
    if (index < rewrites.length - 1) {
      pair.append(document.createTextNode(', '));
    }

    els.rewritten.append(pair);
  });

  if (lossy) {
    const said = ' A dex number matches the species itself, where the name would also have matched a nickname.';
    els.rewritten.append(el('span', 'lossy', said));
  }
}

/**
 * The string, and everything said about it. Runs after any change at all, which is what keeps the output, the link and
 * the chips from ever disagreeing about what has been chosen.
 */
function render() {
  const { query, ambiguous, was, rewrites, lossy } = current();

  els.query.textContent = query || 'Nothing chosen yet';
  els.query.classList.toggle('empty', !query);
  els.copy.disabled = !query;
  els.count.textContent = query ? `${characters(query.length)}${was ? `, down from ${was}` : ''}` : '';
  els.caveat.hidden = !ambiguous;
  paintRewrites(rewrites, lossy);

  // replaceState rather than assigning location.hash: the builder is one page being adjusted, not a sequence of pages,
  // and a history entry per click would leave Back needing forty presses to leave.
  const fragment = toFragment(state);
  history.replaceState(null, '', fragment ? `#${fragment}` : location.pathname);
}

/** The whole page repainted from the state — after a preset, a clear, or a link arriving in the address bar. */
function paintAll() {
  els.optimise.checked = state.optimise;

  // The box has just been written for the reader rather than by them, so whatever they were part-way through typing is
  // no longer what it holds and the list under it would be describing text that has gone.
  closeSuggestions();

  for (const [id, chip] of chips) {
    paintChip(id, chip);
  }

  for (const [id, { row, from, to }] of rangeInputs) {
    const bounds = state.ranges.get(id);

    from.value = String(bounds?.from ?? '');
    to.value = String(bounds?.to ?? '');
    row.classList.toggle('set', bounds?.from != null || bounds?.to != null);
  }

  // Last, because this is what calls render. Every name that arrived this way was chosen somewhere else — in a preset,
  // or in whoever's box the link was copied from — so all of them are chips and nothing is left half-typed.
  setNames(names(state.text), '');
}

function buildPresets() {
  for (const preset of PRESETS) {
    const button = el('button', null);
    button.type = 'button';
    button.append(el('span', null, preset.label), el('span', 'note', preset.note));

    button.addEventListener('click', () => {
      state = cleared();
      state.text = preset.text ?? '';

      for (const id of preset.include ?? []) {
        state.include.add(id);
      }

      for (const id of preset.exclude ?? []) {
        state.exclude.add(id);
      }

      paintAll();
    });

    els.presets.append(button);
  }
}

function buildGroups() {
  for (const group of GROUPS) {
    const section = el('section', 'group');
    section.style.setProperty('--hue', String(group.hue));
    section.append(el('h2', 'label', group.label));

    const row = el('div', 'chips');

    for (const term of group.terms) {
      const node = el('button', 'chip');
      const glyph = el('span', 'state', '+');

      node.type = 'button';
      node.dataset.state = 'off';
      node.title = `${term.term} — click to require, again to rule out`;
      node.append(glyph, el('span', null, term.label));

      const chip = { node, glyph, label: term.label };

      node.addEventListener('click', () => {
        setChipState(term.id, NEXT[stateOf(term.id)]);
        paintChip(term.id, chip);
        render();
      });

      chips.set(term.id, chip);
      row.append(node);
    }

    section.append(row, el('p', 'help', group.help));
    els.groups.append(section);
  }
}

/**
 * A bound as the state should hold it: a number inside the range's limits, or nothing where the box is empty.
 *
 * @param {HTMLInputElement} input
 * @param {Range} range
 */
function readBound(input, range) {
  if (input.value.trim() === '') {
    return null;
  }

  const value = Number.parseInt(input.value, 10);
  return Number.isNaN(value) ? null : Math.min(Math.max(value, range.min ?? 0), range.max);
}

function buildRanges() {
  for (const range of RANGES) {
    const row = el('div', 'range');
    const name = el('label', 'name', range.label);
    const from = el('input');
    const to = el('input');

    for (const input of [from, to]) {
      input.type = 'number';
      input.min = String(range.min ?? 0);
      input.max = String(range.max);
      input.addEventListener('input', () => {
        state.ranges.set(range.id, { from: readBound(from, range), to: readBound(to, range) });
        row.classList.toggle('set', from.value.trim() !== '' || to.value.trim() !== '');
        render();
      });
    }

    // Each box is placeheld by the bound it would take if left empty, read back off the attribute just set rather than
    // composed a second time from the same number.
    from.placeholder = from.min;
    to.placeholder = to.max;

    // The label names the pair, so it is tied to the first box rather than wrapping both — a label cannot label two.
    from.id = `range-${range.id}-from`;
    name.htmlFor = from.id;
    to.setAttribute('aria-label', `${range.label}, highest`);
    from.setAttribute('aria-label', `${range.label}, lowest`);

    row.append(name, from, el('span', 'dash', '–'), to);
    rangeInputs.set(range.id, { row, from, to });
    els.ranges.append(row);
  }
}

/**
 * The name box. A combobox of its own rather than a `<datalist>`, which would have been a fraction of the code: the
 * browser matches a datalist against the entire value of the box, and this box holds any number of names, so past the
 * first one nothing would ever match again. Completing the name being typed is the whole of what this is for, and that
 * is the one thing the built-in cannot do.
 *
 * `taken` is the names already chosen, which are chips in the field; the input holds at most the one being typed. That
 * split is the whole of why a chosen name cannot be edited: a chip has no caret to put a letter into or take one out
 * of, so `pikachu` cannot become `pikach`. It goes in whole and comes out whole.
 *
 * `offered` is what the list is showing and `active` which row the keyboard has reached, -1 for none. The three
 * together are the state of the control, and every path out of here leaves them agreeing with what is on screen.
 */
/** @type {string[]} */
let taken = [];

/** @type {Offer[]} */
let offered = [];

let active = -1;

/** The placeholder the markup gives the input, read rather than repeated so it can be taken away and put back. */
const PLACEHOLDER = els.text.placeholder;

/** The names as chips, rebuilt. Each carries its own way out, since the keyboard can only reach the last of them. */
function paintNames() {
  // The chips are taken out and put back while the input is left where it is: removing a focused node from the document
  // blurs it, and the blur handler would then shut the list the reader is in the middle of using.
  for (const chip of els.field.querySelectorAll('.name')) {
    chip.remove();
  }

  els.field.prepend(
    ...taken.map((name, index) => {
      const chip = el('span', 'name', name);
      const drop = el('button', null, '✕');

      drop.type = 'button';
      drop.setAttribute('aria-label', `Remove ${name}`);

      // The focus is handed back because the button it was on has just been removed from the page, and focus falling to
      // the body would leave the reader's next keystroke going nowhere.
      drop.addEventListener('click', () => {
        setNames(
          taken.filter((_, at) => at !== index),
          els.text.value,
        );
        els.text.focus();
      });

      chip.append(drop);

      return chip;
    }),
  );

  // Beside the chips a placeholder is a name the reader has not chosen sitting among the ones they have.
  els.text.placeholder = taken.length === 0 ? PLACEHOLDER : '';
}

/**
 * The names the box holds now: `chosen` become chips, `typing` is left in the input. Every path that changes the box
 * comes through here, so the chips, the input and the string cannot come to disagree about what is being searched for.
 *
 * The name being typed counts towards the string, which is why committing one to a chip changes the picture without
 * changing the search: the reader is saying they have finished with that name, not adding it. It also means a name the
 * reader is part-way through is never silently dropped — Copy takes what is on screen, including the last three letters
 * they typed and did not press anything after.
 *
 * A name is not held twice, as a chip or as the one being typed: the same name twice is the same clause twice, which the
 * game reads as one and a reader reads as a mistake. `charmander` and `+charmander` are two different searches and both
 * can be here. The spaces around a name are dropped here rather than by each caller, so a pasted `pikachu, eevee` and a
 * row taken from the list arrive the same shape and can be compared with one another.
 *
 * @param {readonly string[]} chosen
 * @param {string} typing
 */
function setNames(chosen, typing) {
  /** @param {readonly string[]} all */
  const unique = (all) => all.filter((name, index) => name && all.indexOf(name) === index);

  taken = unique(chosen.map((name) => name.trim()));
  state.text = unique([...taken, typing.trim()]).join(', ');

  // Guarded, because assigning a value sends the caret to the end of it — which on a keystroke that changed nothing
  // here would drag the caret out of the middle of a name the reader was correcting.
  if (els.text.value !== typing) {
    els.text.value = typing;
  }

  paintNames();
  render();
}

function closeSuggestions() {
  offered = [];
  active = -1;
  els.suggestions.replaceChildren();
  els.suggestions.hidden = true;
  els.text.setAttribute('aria-expanded', 'false');
  els.text.removeAttribute('aria-activedescendant');
}

/**
 * Which row is the one Enter would take. Said in `aria-selected`, which the stylesheet then paints, rather than in a
 * class beside it: one attribute cannot fall out of step with itself, where a class and an attribute can.
 */
function paintActive() {
  const options = [...els.suggestions.children];

  for (const [index, option] of options.entries()) {
    option.setAttribute('aria-selected', String(index === active));
  }

  // Reading the row is the test for there being one: the `-1` meaning none and a row past the end both answer
  // `undefined`, where asking `active < 0` and then indexing are two questions nothing joins.
  const option = options[active];

  if (option === undefined) {
    els.text.removeAttribute('aria-activedescendant');
    return;
  }

  els.text.setAttribute('aria-activedescendant', option.id);
  option.scrollIntoView({ block: 'nearest' });
}

/** The list rebuilt for the name being typed, and taken away again when that names nothing in the dex. */
function openSuggestions() {
  offered = suggestions(els.text.value);

  if (offered.length === 0) {
    closeSuggestions();
    return;
  }

  els.suggestions.replaceChildren(
    ...offered.map((offer, index) => {
      const option = el('li', null, offer.name);

      option.id = `suggestion-${index}`;
      option.setAttribute('role', 'option');

      // Said in the word rather than in the `+` the row would write, because the row's text is also its accessible name
      // and "plus Charmander" read out loud names neither of the two searches on offer.
      if (offer.family) {
        option.append(el('span', 'family', ' (family)'));
      }

      // mousedown rather than click: a click arrives after the blur that closes the list, by which point there is no
      // row left to have been clicked. The default is prevented so the box keeps the focus it had.
      option.addEventListener('mousedown', (event) => {
        event.preventDefault();
        take(written(offer));
      });

      return option;
    }),
  );

  active = -1;
  els.suggestions.hidden = false;
  els.text.setAttribute('aria-expanded', 'true');
  paintActive();
}

/**
 * One name finished with: it becomes a chip and the input is left empty for the next. Taking a row and typing a name
 * out in full both come here, since the two are the same act said two ways.
 *
 * The list is closed rather than reopened, because the empty input the reader is left in names every species and so has
 * nothing to offer until two letters of the next one are typed.
 *
 * @param {string} name
 */
function take(name) {
  setNames([...taken, name], '');
  closeSuggestions();
}

/**
 * The arrow keys, as the step each one takes through the list. Indexed by whatever key was pressed, so a miss is the
 * ordinary case rather than a mistake — which is what the index signature says and a union of the two keys could not.
 *
 * @type {Record<string, number>}
 */
const STEPS = { ArrowDown: 1, ArrowUp: -1 };

// A comma is what separates names in the string, so typing or pasting one commits the name in front of it — which is
// also how a pasted `pikachu, eevee, snorlax` arrives as three chips rather than as one name with commas in it.
els.text.addEventListener('input', () => {
  const parts = els.text.value.split(',');
  const typing = parts.pop() ?? '';

  setNames([...taken, ...parts], typing);
  openSuggestions();
});

els.text.addEventListener('keydown', (event) => {
  const step = STEPS[event.key];

  if (step) {
    event.preventDefault();

    if (offered.length === 0) {
      openSuggestions();
      return;
    }

    // One slot more than there are rows, so arrowing off either end lands on what was typed rather than wrapping
    // straight past it: the reader can always get their own text back the way they came.
    active = ((active + step + offered.length + 2) % (offered.length + 1)) - 1;
    paintActive();
    return;
  }

  // Enter takes the row the keyboard has reached, or else the name as it was typed — a nickname is not in the dex and
  // has no row, so this is the only way one can be asked for.
  if (event.key === 'Enter') {
    const offer = offered[active];
    const name = offer ? written(offer) : els.text.value.trim();

    if (name) {
      event.preventDefault();
      take(name);
    }

    return;
  }

  // Backspace with nothing left to delete takes the last chip off whole. A chosen name has no caret of its own, so this
  // and its ✕ are the two ways out of one, and neither can leave `pikachu` reading `pikach`.
  if (event.key === 'Backspace' && els.text.value === '' && taken.length > 0) {
    event.preventDefault();
    setNames(taken.slice(0, -1), '');
    return;
  }

  // Escape empties a search input, which is not what a reader dismissing a list of species means by it.
  if (event.key === 'Escape' && !els.suggestions.hidden) {
    event.preventDefault();
    closeSuggestions();
  }
});

// The chips make the field much wider than the input inside it, so a click on the gap beside them has to reach the one
// place there is to type. Only the field itself: a click on a chip is the chip's own, and its ✕ is a button.
els.field.addEventListener('mousedown', (event) => {
  if (event.target === els.field) {
    event.preventDefault();
    els.text.focus();
  }
});

els.text.addEventListener('blur', closeSuggestions);

// Only what is composed changes, never the state the chips and the boxes describe, so switching this off puts the long
// string back rather than leaving the reader to undo a rewrite.
els.optimise.addEventListener('change', () => {
  state.optimise = els.optimise.checked;
  render();
});

els.clear.addEventListener('click', () => {
  state = cleared();
  paintAll();
  els.text.focus();
});

/**
 * Copying is the last step of every visit, so it says so where the button is rather than in a status line. The write
 * can be refused — an insecure origin, or a browser that withholds the clipboard — in which case selecting the string
 * is the fallback, which is why it is `user-select: all` rather than merely selectable.
 */
els.copy.addEventListener('click', async () => {
  const { query } = current();

  try {
    await navigator.clipboard.writeText(query);
    els.copy.textContent = 'Copied';
  } catch {
    getSelection()?.selectAllChildren(els.query);
    els.copy.textContent = 'Press ⌘C';
  }

  els.copy.classList.add('done');
  clearTimeout(copied);
  copied = setTimeout(() => {
    els.copy.textContent = 'Copy';
    els.copy.classList.remove('done');
  }, 1400);
});

// A link pasted into the address bar of a page already open changes the hash without reloading, so the state is read
// again rather than leaving the chips describing the previous visit's string.
addEventListener('hashchange', () => {
  state = fromFragment(location.hash);
  paintAll();
});

buildPresets();
buildGroups();
buildRanges();
paintAll();

// Named for the console: the catalogue is the thing a reader checking a term against the game wants in front of them.
export { GROUPS, TERMS_BY_ID };
