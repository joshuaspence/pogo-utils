/**
 * The search-string builder page. Renders the term catalogue as chips, keeps the state they describe, and writes the
 * string on every change — the page holds no string of its own, so what is shown is always what query.js composes from
 * the state rather than something edited alongside it and able to drift.
 *
 * The chips are rendered from terms.js rather than written into search.html, so adding a term is one line in the table
 * and nothing else. That is also what lets the link reader restore a state before the page has drawn anything: the
 * state is read first, and the chips are drawn already wearing it.
 */

import { GROUPS, PRESETS, RANGES, TERMS_BY_ID } from './terms.js';
import { compose, emptyState, fromFragment, toFragment } from './query.js';

const els = {
  query: document.getElementById('query'),
  copy: document.getElementById('copy'),
  clear: document.getElementById('clear'),
  count: document.getElementById('count'),
  caveat: document.getElementById('caveat'),
  presets: document.getElementById('presets'),
  text: document.getElementById('text'),
  groups: document.getElementById('groups'),
  ranges: document.getElementById('ranges'),
};

let state = fromFragment(location.hash);

// Every chip and range input by the id it answers to, so re-rendering after a preset or a link is a walk over the
// state rather than a rebuild of the DOM — the focus ring stays where the reader left it.
const chips = new Map();
const rangeInputs = new Map();

let copied = null;

function el(tag, className, text) {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (text != null) {
    node.textContent = text;
  }

  return node;
}

/** Where a chip goes when it is clicked: unused, required, ruled out, and round again. */
const NEXT = { off: 'in', in: 'out', out: 'off' };

/** What a chip wears in each state — the glyph, and the words a screen reader is given instead of the colour. */
const STATE = {
  off: { glyph: '+', said: 'not used' },
  in: { glyph: '✓', said: 'required' },
  out: { glyph: '!', said: 'ruled out' },
};

const stateOf = (id) => (state.include.has(id) ? 'in' : state.exclude.has(id) ? 'out' : 'off');

function setChipState(id, next) {
  state.include.delete(id);
  state.exclude.delete(id);

  if (next === 'in') {
    state.include.add(id);
  } else if (next === 'out') {
    state.exclude.add(id);
  }
}

function paintChip(id) {
  const { node, label } = chips.get(id);
  const current = stateOf(id);

  node.dataset.state = current;
  node.querySelector('.state').textContent = STATE[current].glyph;
  node.setAttribute('aria-label', `${label} — ${STATE[current].said}`);
}

/**
 * The string, and everything said about it. Runs after any change at all, which is what keeps the output, the link and
 * the chips from ever disagreeing about what has been chosen.
 */
function render() {
  const { query, ambiguous } = compose(state);

  els.query.textContent = query || 'Nothing chosen yet';
  els.query.classList.toggle('empty', !query);
  els.copy.disabled = !query;
  els.count.textContent = query ? `${query.length} characters` : '';
  els.caveat.hidden = !ambiguous;

  // replaceState rather than assigning location.hash: the builder is one page being adjusted, not a sequence of pages,
  // and a history entry per click would leave Back needing forty presses to leave.
  const fragment = toFragment(state);
  history.replaceState(null, '', fragment ? `#${fragment}` : location.pathname);
}

/** The whole page repainted from the state — after a preset, a clear, or a link arriving in the address bar. */
function paintAll() {
  els.text.value = state.text;

  for (const id of chips.keys()) {
    paintChip(id);
  }

  for (const [id, { from, to }] of rangeInputs) {
    const bounds = state.ranges.get(id) ?? {};
    from.value = bounds.from ?? '';
    to.value = bounds.to ?? '';
    from.closest('.range').classList.toggle('set', bounds.from != null || bounds.to != null);
  }

  render();
}

function buildPresets() {
  for (const preset of PRESETS) {
    const button = el('button', null);
    button.type = 'button';
    button.append(el('span', null, preset.label), el('span', 'note', preset.note));

    button.addEventListener('click', () => {
      state = emptyState();
      state.text = preset.text ?? '';

      for (const id of preset.include ?? []) {
        state.include.add(id);
      }

      for (const id of preset.exclude ?? []) {
        state.exclude.add(id);
      }

      for (const [id, bounds] of Object.entries(preset.ranges ?? {})) {
        state.ranges.set(id, bounds);
      }

      paintAll();
    });

    els.presets.append(button);
  }
}

function buildGroups() {
  for (const group of GROUPS) {
    const section = el('section', 'group');
    section.style.setProperty('--hue', group.hue);
    section.append(el('h2', 'label', group.label));

    const row = el('div', 'chips');

    for (const term of group.terms) {
      const node = el('button', 'chip');
      node.type = 'button';
      node.dataset.state = 'off';
      node.title = `${term.term} — click to require, again to rule out`;
      node.append(el('span', 'state', '+'), el('span', null, term.label));

      node.addEventListener('click', () => {
        setChipState(term.id, NEXT[stateOf(term.id)]);
        paintChip(term.id);
        render();
      });

      chips.set(term.id, { node, label: term.label });
      row.append(node);
    }

    section.append(row, el('p', 'help', group.help));
    els.groups.append(section);
  }
}

/** A bound as the state should hold it: a number inside the range's limits, or nothing where the box is empty. */
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

    for (const [input, placeholder] of [
      [from, String(range.min ?? 0)],
      [to, String(range.max)],
    ]) {
      input.type = 'number';
      input.min = String(range.min ?? 0);
      input.max = String(range.max);
      input.placeholder = placeholder;
      input.addEventListener('input', () => {
        state.ranges.set(range.id, { from: readBound(from, range), to: readBound(to, range) });
        row.classList.toggle('set', from.value.trim() !== '' || to.value.trim() !== '');
        render();
      });
    }

    // The label names the pair, so it is tied to the first box rather than wrapping both — a label cannot label two.
    from.id = `range-${range.id}-from`;
    name.htmlFor = from.id;
    to.setAttribute('aria-label', `${range.label}, highest`);
    from.setAttribute('aria-label', `${range.label}, lowest`);

    row.append(name, from, el('span', 'dash', '–'), to);
    rangeInputs.set(range.id, { from, to });
    els.ranges.append(row);
  }
}

els.text.addEventListener('input', () => {
  state.text = els.text.value;
  render();
});

els.clear.addEventListener('click', () => {
  state = emptyState();
  paintAll();
  els.text.focus();
});

/**
 * Copying is the last step of every visit, so it says so where the button is rather than in a status line. The write
 * can be refused — an insecure origin, or a browser that withholds the clipboard — in which case selecting the string
 * is the fallback, which is why it is `user-select: all` rather than merely selectable.
 */
els.copy.addEventListener('click', async () => {
  const { query } = compose(state);

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
