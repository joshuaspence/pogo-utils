/**
 * The Pokédex page: a card per species, narrowed by the controls above them, and a dialog for the one picked.
 *
 * The cards are built once and shown or hidden as the filters change, rather than rebuilt: 1025 of them is enough that
 * rebuilding on every keystroke would drop their sprites and the reader's scroll position with them.
 *
 * What is chosen lives in the fragment, as on the search page, so a filtered view or an open species is a link.
 */

import { CATEGORIES, ENTRIES, GENERATION_NUMBERS, HUNTS, numbered, spriteOf, type Entry } from './entries.js';
import {
  availabilityOf,
  emptyState,
  FLAGS,
  fromFragment,
  HUNT_FLAGS,
  matches,
  toFragment,
} from './state.js';
import { byId, el } from '../dom.js';

type Card = { item: HTMLLIElement; card: HTMLButtonElement };

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

const HUNT_LABELS = new Map(HUNTS.map(({ id, label }) => [id, label]));
const CATEGORY_LABELS = new Map(CATEGORIES.map(({ id, label }) => [id, label]));

let state = fromFragment(location.hash);

/**
 * A sprite that says nothing when it fails. The name and number beside it are the card; a hotlinked picture that does
 * not arrive — offline, or blocked — should leave a blank tile rather than the browser's broken-image glyph.
 */
function sprite(dex: number, shiny: boolean, size: number) {
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
 */
function mark(className: string, glyph: string, words: string) {
  const node = el('span', `mark ${className}`);
  const icon = el('span', null, glyph);
  icon.setAttribute('aria-hidden', 'true');
  node.title = words;
  node.append(icon, el('span', 'sr', words));
  return node;
}

const cards = new Map<number, Card>();

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
 */
const chips = new Map<string, HTMLButtonElement>();

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
 */
let visible: Entry[] = [];

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

  visible = ENTRIES.filter((entry) => matches(entry, state));
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
 */
const yesNo = (value: boolean, yes: string, no: string) => (value ? mark('yes', '✓', yes) : mark('no', '—', no));

/**
 * One fact about the species, as a term and what it is.
 */
function fact(list: HTMLElement, term: string, value: string) {
  list.append(el('dt', null, term), el('dd', null, value));
}

function renderDetail(entry: Entry) {
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

function variantTable(entry: Entry) {
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

function cell(child: Node) {
  const td = el('td');
  td.append(child);
  return td;
}

function open(dex: number) {
  const entry = ENTRIES.find((candidate) => candidate.dex === dex);

  if (!entry) {
    return;
  }

  state.open = dex;

  // The filters are applied before the dialog is rendered, since `renderDetail` disables the arrows from `visible`. A
  // link that changes the query and the open species together — `#n=1` to `#q=pikachu&n=25` — would otherwise place the
  // entry in the list it is replacing and leave an arrow enabled over a neighbour that no longer exists.
  update();
  renderDetail(entry);

  if (!$.detail.open) {
    $.detail.showModal();
  }
}

/**
 * Step to the neighbouring species among those the filters leave, so the arrows walk the list the reader is looking at.
 */
function step(by: number) {
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
