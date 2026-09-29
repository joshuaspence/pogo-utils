/**
 * The Pokédex page: a card per species, narrowed by the controls above them, and a dialog for the one picked.
 *
 * The cards are built once and shown or hidden as the filters change, rather than rebuilt: 1025 of them is enough that
 * rebuilding on every keystroke would drop their sprites and the reader's scroll position with them.
 *
 * What is chosen lives in the fragment, as on the search page, so a filtered view or an open species is a link.
 */

import { CATEGORIES, ENTRIES, GENERATION_NUMBERS, HUNTS, numbered, spriteOf } from './entries.js';
import { fold } from '../pokemon/names.js';
import { byId, el } from '../dom.js';

/** @import {Entry, Flag} from './entries.js' */

/**
 * @typedef {'' | 'in' | 'out'} Availability
 * @typedef {{id: string, label: string, test: (entry: Entry) => boolean}} Toggle
 * @typedef {{item: HTMLLIElement, card: HTMLButtonElement}} Card
 */

/**
 * What the controls are set to, and which species is open. Held as one object so a link, Reset and a control change are
 * the same kind of thing: replace or amend it and call `update`.
 *
 * @typedef {object} State
 * @property {string} q
 * @property {number | null} generation
 * @property {Availability} availability
 * @property {Set<string>} flags
 * @property {number | null} open
 */

const $ = {
  q: byId('q', HTMLInputElement),
  generation: byId('generation', HTMLSelectElement),
  availability: byId('availability', HTMLSelectElement),
  flags: byId('flags'),
  hunts: byId('hunts'),
  count: byId('count'),
  reset: byId('reset', HTMLButtonElement),
  grid: byId('grid'),
  empty: byId('empty'),
  detail: byId('detail', HTMLDialogElement),
  detailNum: byId('detailNum'),
  detailName: byId('detailName'),
  detailBody: byId('detailBody'),
  prev: byId('prev', HTMLButtonElement),
  next: byId('next', HTMLButtonElement),
  close: byId('close'),
};

/**
 * The toggles, each with the question it asks of an entry. Every one that is on has to hold, so two of them narrow to
 * what both are true of — Legendary with Shiny is the legendaries that have one.
 *
 * @type {readonly Toggle[]}
 */
const FLAGS = [
  { id: 'shiny', label: '✨ Has a shiny', test: (entry) => entry.shiny },
  { id: 'wild', label: '🌿 Spawns in the wild', test: (entry) => entry.spawns },
  { id: 'forms', label: 'Has forms', test: (entry) => entry.variants.length > 0 },
  // The `@type` above reaches the three literals written here and stops at the `map`, so the callback says what it
  // answers itself — as `HUNT_FLAGS` below has to for the same reason.
  ...CATEGORIES.map(
    /** @returns {Toggle} */
    ({ id, label }) => ({ id, label, test: (entry) => entry.categories.includes(id) }),
  ),
];

const HUNT_FLAGS = HUNTS.map(
  /** @returns {Toggle} */
  ({ id, label }) => ({
    id: `hunt-${id}`,
    label,
    test: (entry) => entry.hunts.some((hunt) => hunt.id === id),
  }),
);

const TOGGLES = new Map([...FLAGS, ...HUNT_FLAGS].map((flag) => [flag.id, flag]));

const HUNT_LABELS = new Map(HUNTS.map(({ id, label }) => [id, label]));
const CATEGORY_LABELS = new Map(CATEGORIES.map(({ id, label }) => [id, label]));

/**
 * Which of the three the availability control is set to. Both the fragment and the `<select>` are read through this:
 * the one is a reader's URL and the other is markup the script does not own, so neither can be taken at its word.
 *
 * @param {string | null} value
 * @returns {Availability}
 */
const availabilityOf = (value) => (value === 'in' || value === 'out' ? value : '');

/** @returns {State} */
function emptyState() {
  return { q: '', generation: null, availability: '', flags: new Set(), open: null };
}

/** @param {string} fragment */
function fromFragment(fragment) {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const state = emptyState();
  const generation = Number(params.get('g'));
  const open = Number(params.get('n'));

  state.q = params.get('q') ?? '';
  state.generation = GENERATION_NUMBERS.includes(generation) ? generation : null;
  state.availability = availabilityOf(params.get('a'));
  state.flags = new Set((params.get('f') ?? '').split('.').filter((id) => TOGGLES.has(id)));
  state.open = ENTRIES.some((entry) => entry.dex === open) ? open : null;

  return state;
}

/** @param {State} state */
function toFragment(state) {
  const params = new URLSearchParams();

  if (state.q.trim()) {
    params.set('q', state.q.trim());
  }

  if (state.generation) {
    params.set('g', String(state.generation));
  }

  if (state.availability) {
    params.set('a', state.availability);
  }

  if (state.flags.size > 0) {
    params.set('f', [...state.flags].join('.'));
  }

  if (state.open) {
    params.set('n', String(state.open));
  }

  return params.toString();
}

let state = fromFragment(location.hash);

/**
 * Whether an entry answers what was typed. A number is a dex number — `25`, `#25` and `#0025` all mean Pikachu, and
 * only Pikachu, since a reader typing a number has one species in mind rather than every number with a 25 in it. Any
 * other text is part of a name, folded the way the search page folds it so `flabebe` still finds Flabébé.
 *
 * @param {Entry} entry
 * @param {string} query
 */
function matchesQuery(entry, query) {
  const typed = query.trim();

  if (!typed) {
    return true;
  }

  const number = typed.match(/^#?0*(\d+)$/);

  if (number) {
    return entry.dex === Number(number[1]);
  }

  return entry.folded.includes(fold(typed));
}

/** @param {Entry} entry */
function matches(entry) {
  if (!matchesQuery(entry, state.q)) {
    return false;
  }

  if (state.generation && entry.generation !== state.generation) {
    return false;
  }

  if (state.availability === 'in' && !entry.released) {
    return false;
  }

  if (state.availability === 'out' && entry.released) {
    return false;
  }

  // Reading the slot rather than testing `has` first, since nothing at the type level joins the two lookups. An id no
  // toggle answers to is a bug rather than a case — `fromFragment` drops them and the chips only ever add their own —
  // and an empty grid says so where the `TypeError` this used to throw took the page down.
  return [...state.flags].every((id) => TOGGLES.get(id)?.test(entry));
}

/**
 * A sprite that says nothing when it fails. The name and number beside it are the card; a hotlinked picture that does
 * not arrive — offline, or blocked — should leave a blank tile rather than the browser's broken-image glyph.
 *
 * @param {number} dex
 * @param {boolean} shiny
 * @param {number} size
 */
function sprite(dex, shiny, size) {
  const img = el('img', 'sprite');
  img.src = spriteOf(dex, shiny);
  img.alt = '';
  img.width = size;
  img.height = size;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.addEventListener('error', () => img.classList.add('missing'));
  return img;
}

/**
 * A mark whose glyph is for the eye and whose words are for a screen reader.
 *
 * @param {string} className
 * @param {string} glyph
 * @param {string} words
 */
function mark(className, glyph, words) {
  const node = el('span', `mark ${className}`);
  const icon = el('span', null, glyph);
  icon.setAttribute('aria-hidden', 'true');
  node.title = words;
  node.append(icon, el('span', 'sr', words));
  return node;
}

/** @type {Map<number, Card>} */
const cards = new Map();

function buildGrid() {
  const fragment = document.createDocumentFragment();

  for (const entry of ENTRIES) {
    const item = el('li');
    const card = el('button', 'card');
    card.type = 'button';

    if (!entry.released) {
      card.classList.add('unreleased');
    }

    const marks = el('span', 'marks');

    if (entry.shiny) {
      marks.append(mark('shiny', '✨', 'shiny available'));
    }

    if (!entry.released) {
      marks.append(mark('out', '🔒', 'not in Pokémon GO yet'));
    }

    card.append(
      sprite(entry.dex, false, 96),
      el('span', 'num', numbered(entry.dex)),
      el('span', 'name', entry.name),
      marks,
    );

    card.addEventListener('click', () => open(entry.dex));
    item.append(card);
    fragment.append(item);
    cards.set(entry.dex, { item, card });
  }

  $.grid.append(fragment);
}

/**
 * The toggle chips by the id they stand for, so `update` writes their state without asking the document for them.
 *
 * @type {Map<string, HTMLButtonElement>}
 */
const chips = new Map();

function buildControls() {
  for (const number of GENERATION_NUMBERS) {
    const option = el('option', null, `Generation ${number}`);
    option.value = String(number);
    $.generation.append(option);
  }

  // Objects rather than pairs, since a pair of pairs is not a list of pairs: `[[$.flags, FLAGS], …]` types both
  // bindings as the union of an element and a toggle list.
  for (const { container, flags } of [
    { container: $.flags, flags: FLAGS },
    { container: $.hunts, flags: HUNT_FLAGS },
  ]) {
    for (const flag of flags) {
      const chip = el('button', 'chip', flag.label);
      chip.type = 'button';
      chips.set(flag.id, chip);
      chip.addEventListener('click', () => {
        if (state.flags.has(flag.id)) {
          state.flags.delete(flag.id);
        } else {
          state.flags.add(flag.id);
        }

        update();
      });
      container.append(chip);
    }
  }

  $.q.addEventListener('input', () => {
    state.q = $.q.value;
    update();
  });

  $.generation.addEventListener('change', () => {
    state.generation = Number($.generation.value) || null;
    update();
  });

  $.availability.addEventListener('change', () => {
    state.availability = availabilityOf($.availability.value);
    update();
  });

  $.reset.addEventListener('click', () => {
    state = { ...emptyState(), open: state.open };
    update();
  });
}

/**
 * The entries the filters leave, in dex order — what the grid shows and what the dialog's arrows step through.
 *
 * @type {Entry[]}
 */
let visible = [];

function update() {
  // Controls are written from the state rather than trusted to already agree with it, since a link or Reset changes the
  // state without anyone touching them.
  if ($.q.value !== state.q) {
    $.q.value = state.q;
  }

  $.generation.value = String(state.generation ?? '');
  $.availability.value = state.availability;

  for (const [id, chip] of chips) {
    chip.setAttribute('aria-pressed', String(state.flags.has(id)));
  }

  visible = ENTRIES.filter(matches);
  const shown = new Set(visible.map((entry) => entry.dex));

  for (const [dex, { item }] of cards) {
    item.hidden = !shown.has(dex);
  }

  const filtered = visible.length !== ENTRIES.length;
  $.count.textContent = filtered
    ? `${visible.length} of ${ENTRIES.length} species`
    : `${ENTRIES.length} species, ${ENTRIES.filter((entry) => entry.released).length} of them in Pokémon GO`;
  $.empty.hidden = visible.length > 0;
  $.reset.disabled = !filtered;

  const fragment = toFragment(state);
  history.replaceState(null, '', fragment ? `#${fragment}` : location.pathname);
}

/**
 * A yes or a no, a tick or a dash to the eye and said as words to a screen reader.
 *
 * @type {(value: boolean, yes: string, no: string) => HTMLSpanElement}
 */
const yesNo = (value, yes, no) => (value ? mark('yes', '✓', yes) : mark('no', '—', no));

/**
 * One fact about the species, as a term and what it is.
 *
 * @param {HTMLElement} list
 * @param {string} term
 * @param {string} value
 */
function fact(list, term, value) {
  list.append(el('dt', null, term), el('dd', null, value));
}

/** @param {Entry} entry */
function renderDetail(entry) {
  $.detailNum.textContent = numbered(entry.dex);
  $.detailName.textContent = entry.name;

  const body = el('div', 'grid2');
  const picture = el('figure', 'picture');
  const img = sprite(entry.dex, false, 192);
  img.loading = 'eager';
  picture.append(img);

  // The shiny sprite is offered only where there is a shiny to show: PokeAPI draws one for every species, and a
  // toggle that shows a shiny the game does not have would be the page contradicting itself.
  if (entry.shiny) {
    const toggle = el('button', 'chip', '✨ Shiny');
    toggle.type = 'button';
    toggle.setAttribute('aria-pressed', 'false');
    toggle.addEventListener('click', () => {
      const shiny = toggle.getAttribute('aria-pressed') !== 'true';
      toggle.setAttribute('aria-pressed', String(shiny));
      img.classList.remove('missing');
      img.src = spriteOf(entry.dex, shiny);
    });
    picture.append(toggle);
  }

  const facts = el('dl', 'facts');
  fact(facts, 'Generation', String(entry.generation ?? '?'));
  fact(facts, 'In Pokémon GO', entry.released ? 'Yes' : 'Not yet');
  fact(facts, 'Shiny', entry.shiny ? 'Available' : entry.released ? 'Not yet' : '—');
  fact(
    facts,
    'In the wild',
    entry.spawns ? 'Spawns' : entry.released ? 'Never — raids, eggs, research or trades' : '—',
  );

  if (entry.categories.length > 0) {
    fact(facts, 'Category', entry.categories.map((id) => CATEGORY_LABELS.get(id)).join(', '));
  }

  const hunts = el('dd');

  if (entry.hunts.length === 0) {
    hunts.textContent = 'None — every hunt has it';
  } else {
    const list = el('ul', 'hunts');

    for (const { id, watched } of entry.hunts) {
      const item = el('li', watched ? 'watched' : 'unwatched', HUNT_LABELS.get(id));

      if (!watched) {
        item.append(el('span', 'note', ' — the feed cannot alert on it'));
      }

      list.append(item);
    }

    hunts.append(list);
  }

  facts.append(el('dt', null, 'Hunts'), hunts);

  // A species not in the game cannot be in the storage a search string is typed into, so it gets no search to build.
  if (entry.released) {
    const links = el('p', 'links');
    const name = entry.name.toLowerCase();

    for (const { text, term } of [
      { text: 'Search for it', term: name },
      { text: 'Search its family', term: `+${name}` },
    ]) {
      const link = el('a', 'ghost', text);
      link.href = `search.html#t=${encodeURIComponent(term)}`;
      links.append(link);
    }

    body.append(picture, facts, links);
  } else {
    body.append(picture, facts);
  }

  $.detailBody.replaceChildren(body);

  if (entry.variants.length > 0) {
    $.detailBody.append(variantTable(entry));
  }

  const at = visible.findIndex((other) => other.dex === entry.dex);
  $.prev.disabled = at <= 0;
  $.next.disabled = at === -1 || at >= visible.length - 1;
}

/** @param {Entry} entry */
function variantTable(entry) {
  const section = el('section', 'variants');
  section.append(el('h3', null, `Forms and variants (${entry.variants.length})`));

  const table = el('table');
  const headers = el('tr');

  for (const title of ['Form', 'In GO', 'Shiny', 'Wild', 'Hunts']) {
    const th = el('th', null, title);
    th.scope = 'col';
    headers.append(th);
  }

  // Holding the two sections rather than asking the table for them back: `tHead` is nullable and `tBodies[0]` is an
  // index, so both want a guard for a node this function just appended.
  const head = el('thead');
  const body = el('tbody');
  head.append(headers);
  table.append(head, body);

  for (const { name, pokemon, hunts } of entry.variants) {
    const row = el('tr');

    if (!pokemon.released) {
      row.className = 'unreleased';
    }

    const th = el('th', null, name);
    th.scope = 'row';

    row.append(
      th,
      cell(yesNo(pokemon.released, 'released', 'not released')),
      cell(yesNo(pokemon.released && pokemon.shinyEligible, 'shiny available', 'no shiny')),
      cell(yesNo(pokemon.released && pokemon.spawns, 'spawns in the wild', 'does not spawn')),
      el('td', 'hunts', hunts.map(({ id }) => HUNT_LABELS.get(id)).join(', ') || '—'),
    );
    body.append(row);
  }

  const wrap = el('div', 'scroll');
  wrap.append(table);
  section.append(wrap);
  return section;
}

/** @param {Node} child */
function cell(child) {
  const td = el('td');
  td.append(child);
  return td;
}

/** @param {number} dex */
function open(dex) {
  const entry = ENTRIES.find((candidate) => candidate.dex === dex);

  if (!entry) {
    return;
  }

  state.open = dex;
  renderDetail(entry);

  if (!$.detail.open) {
    $.detail.showModal();
  }

  update();
}

/**
 * Step to the neighbouring species among those the filters leave, so the arrows walk the list the reader is looking at.
 *
 * @param {number} by
 */
function step(by) {
  const at = visible.findIndex((entry) => entry.dex === state.open);
  const target = visible[at + by];

  if (at !== -1 && target) {
    open(target.dex);
    cards.get(target.dex)?.item.scrollIntoView({ block: 'nearest' });
  }
}

$.prev.addEventListener('click', () => step(-1));
$.next.addEventListener('click', () => step(1));
$.close.addEventListener('click', () => $.detail.close());

$.detail.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowLeft') {
    step(-1);
  } else if (event.key === 'ArrowRight') {
    step(1);
  }
});

// A click on the backdrop lands on the dialog itself rather than on anything inside it, which is the one way to tell
// the two apart without a wrapper element.
$.detail.addEventListener('click', (event) => {
  if (event.target === $.detail) {
    $.detail.close();
  }
});

$.detail.addEventListener('close', () => {
  const dex = state.open;
  state.open = null;
  update();

  // showModal() hands focus back to whatever had it, which after stepping with the arrows is the arrow button inside a
  // dialog now closed. Send it to the card for the species last shown, which is where the reader is in the list. A
  // close with nothing open has nowhere to send it: the hashchange handler clears `open` before closing the dialog.
  if (dex !== null) {
    cards.get(dex)?.card.focus();
  }
});

addEventListener('hashchange', () => {
  state = fromFragment(location.hash);

  if (state.open) {
    open(state.open);
  } else {
    $.detail.close();
    update();
  }
});

buildControls();
buildGrid();
update();

if (state.open) {
  open(state.open);
}
