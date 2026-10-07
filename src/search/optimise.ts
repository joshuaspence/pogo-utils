/**
 * Compressing a finished query. Every reduction here rewrites the *state* rather than the string and hands back another
 * state for query.js to compose, so the shortened string goes through the same clause writer, the same clause order and
 * the same ambiguity check as the plain one. Nothing takes apart a search string that was just written.
 *
 * Three kinds of redundancy are worth removing. The first two are the same thing: the reader has said which species
 * they mean at more length than the game needs.
 *
 * - **A name longer than it has to be.** `charmander` names one species, `charma` names the same one, and so does the
 *   dex number `4`. The game reads all three the same way, so the shortest of them is the one to write.
 * - **Dex numbers said twice.** The generation chips, the dex-number boxes and a name that has become a number all
 *   write spans of the same numbers, and the clauses they land in are AND'd, so they collapse into their intersection:
 *   Gen 1 with Gen 2 is `1-251`, and `charmander` inside Gen 1 is just `4`.
 * - **A group saying what its own terms already settle.** Nothing is both Shadow and Purified, so `shadow&!purified`
 *   is `shadow`; everything has a star rating, so all five of them at once is no clause at all, and four of them say
 *   the fifth — `0*,1*,2*,3*` is `!4*`. One term can also be the union of others, as `background` is of the two
 *   backdrops, and is then the shorter way to write the whole of what it covers. Which groups and terms those facts
 *   hold of is `terms.js`'s to declare, and its `exclusive`, `exhaustive` and `covers` are all that is known here.
 *
 * What is not here is the reduction the shorthand invites most. `+charmander` is the Charmander family, so writing it
 * `4,5,6` — or shortening it to `+charm`, the same family reached through two of its members — needs to know which
 * species share a family, and nothing in this repository holds that: `pokedex.js` carries forms, regions and rarity but
 * no evolution links, and the families in `filters/xxs.js` are a line break for a human reading the list rather than
 * data. So a `+` keeps its name and gets the name shortening alone, which is sound for the reason that the same species
 * reached a shorter way are the same families.
 */

import POKEMON from '../pokemon/pokedex.js';
import { GROUPS, RANGES, type Group, type Term } from './terms.js';
import { groupClause, names, rangeClause, type State } from './query.js';

/**
 * A run of dex numbers, inclusive at both ends, which is every shape of number the game reads: `4` is `[4, 4]`.
 */
type Span = [number, number];

/**
 * The three species whose English name the dex cannot spell. `pokedex.js` names a species by the constant it is bound
 * to, which is that name uppercased with its punctuation dropped or turned into an underscore. An underscore is honest
 * enough to match against — `MR_MIME` stands in for `Mr. Mime` one character for two, so `mime` reaches it and `mrmime`
 * reaches nothing either way, which is how the game behaves. A dropped apostrophe or accent leaves no such mark:
 * `FARFETCHD` reads as an ordinary word where the game's own name is `Farfetch'd`, and a search for `farfetchd` finds
 * nothing at all. So a fragment that could reach one of these is left alone rather than guessed at.
 *
 * Three entries is what `pokedex.js` not carrying display names costs. A fourth belongs there rather than here.
 */
const UNSPELLABLE = new Set(['FARFETCHD', 'SIRFETCHD', 'FLABEBE']);

/** Every species as the name a search sees and the dex number it answers to. */
const SPECIES = Object.values(POKEMON).map((species) => ({
  dex: Number(species),
  name: String(species).toLowerCase(),
  spellable: !UNSPELLABLE.has(String(species)),
}));

/** A dex number or a span of them, which is how the game reads a number and how a clause is read back into one. */
const SPAN = /^(\d+)(?:-(\d+))?$/;

/**
 * One span from the text of a clause, or null where that text is not a number at all.
 */
function spanOf(text: string): Span | null {
  const found = SPAN.exec(text);

  if (!found) {
    return null;
  }

  const from = Number(found[1]);
  const to = found[2] == null ? from : Number(found[2]);

  return [Math.min(from, to), Math.max(from, to)];
}

/**
 * Spans sorted and run together, so `4,5,6` is `4-6` and `1-151,152-251` is the single span it describes.
 */
function merged(spans: readonly Span[]): Span[] {
  const sorted = [...spans].sort((one, two) => one[0] - two[0] || one[1] - two[1]);

  const runs: Span[] = [];

  for (const [from, to] of sorted) {
    const last = runs.at(-1);

    // Touching counts as overlapping: there is no dex number between 151 and 152, so those two spans are one.
    if (last && from <= last[1] + 1) {
      last[1] = Math.max(last[1], to);
    } else {
      runs.push([from, to]);
    }
  }

  return runs;
}

/**
 * Two sets of spans AND'd, which is every pair's overlap, because the clauses they came from are AND'd.
 */
function intersected(one: readonly Span[], two: readonly Span[]): Span[] {
  const overlaps: Span[] = [];

  for (const [from, to] of one) {
    for (const [otherFrom, otherTo] of two) {
      const start = Math.max(from, otherFrom);
      const end = Math.min(to, otherTo);

      if (start <= end) {
        overlaps.push([start, end]);
      }
    }
  }

  return merged(overlaps);
}

/**
 * Spans as the game writes them: a bare number where the ends meet, `1-3` where they do not.
 */
const written = (spans: readonly Span[]) =>
  spans.map(([from, to]) => (from === to ? `${from}` : `${from}-${to}`)).join(',');

/**
 * The species a fragment of a name reaches, as dex numbers, or null where the answer cannot be trusted — the gate every
 * name reduction below has to pass.
 *
 * Two readings of a partial name are in play and the sources do not agree on which the game uses. The wiki's table says
 * `T` "Returns all Pokémon that begins with T (including nicknames)", where this page's own help has a partial name
 * matching anywhere in it. `char` reaches Charmander under both readings; `saur` reaches Bulbasaur under one and
 * nothing under the other. So a fragment whose two readings disagree is refused rather than guessed at. That costs
 * `saur` and `mime` their reductions and leaves every reduction that is taken true whichever reading is right.
 */
function dexOf(fragment: string): number[] | null {
  const contains = SPECIES.filter((species) => species.name.includes(fragment));
  const begins = SPECIES.filter((species) => species.name.startsWith(fragment));

  // Anything beginning with the fragment contains it, so one set is inside the other and equal sizes are equal sets.
  if (contains.length === 0 || contains.length !== begins.length) {
    return null;
  }

  return contains.every((species) => species.spellable) ? contains.map((species) => species.dex) : null;
}

/**
 * One name from the box, written as short as it goes. The name itself, the shortest leading fragment of it that still
 * reaches the same species, and those species as dex numbers are three spellings of one search.
 *
 * The candidates are leading fragments rather than fragments from anywhere, for the reason `dexOf` gives: `rman`
 * reaches Charmander under one reading of a partial name and nothing under the other, where `charma` reaches it under
 * both. It also keeps what is written recognisable as the name it came from.
 *
 * A name that resolves to nothing is passed through untouched — a nickname, a misspelling, or a fragment landing on a
 * species the dex cannot spell. There is nothing to prove about a word that names no species, and the reductions here
 * are only for what can be proved.
 *
 * `spans` is the dex numbers the text stands for, or null where it stands for a name the arithmetic below cannot join.
 */
function shortName(token: string): { text: string; spans: Span[] | null; numbered: boolean } {
  const span = spanOf(token);

  if (span) {
    return { text: token, spans: [span], numbered: false };
  }

  const family = token.startsWith('+');
  const name = family ? token.slice(1) : token;
  const dex = dexOf(name);

  if (!dex) {
    return { text: token, spans: null, numbered: false };
  }

  let shortest = name;

  for (let length = 1; length < name.length; length += 1) {
    const fragment = name.slice(0, length);

    if (dexOf(fragment)?.join() === dex.join()) {
      shortest = fragment;
      break;
    }
  }

  // A family is the union of the families of whatever the name reaches, so a shorter way to the same species is the
  // same search. Which species share a family is the thing not known here, so the numbers are not on offer and a `+`
  // keeps a name.
  if (family) {
    return { text: `+${shortest}`, spans: null, numbered: false };
  }

  const spans = merged(dex.map((number) => [number, number]));
  const numbers = written(spans);

  return numbers.length < shortest.length
    ? { text: numbers, spans, numbered: true }
    : { text: shortest, spans: null, numbered: false };
}

/**
 * Whether a set of spans is the whole dex, in which case it says nothing and has earned no clause.
 */
const everything = (spans: readonly Span[], whole: Span) =>
  spans.length === 1 && spans.every(([from, to]) => from <= whole[0] && to >= whole[1]);

/**
 * What the composer writes for a group with these terms on one side of its clause and nothing on the other, so the two
 * spellings weighed against each other below are measured by the writer that will produce one of them rather than by a
 * second copy of its join rules — the same reading the dex clause is put through further down.
 */
function clauseOf(group: Group, side: 'include' | 'exclude', ids: readonly string[]) {
  const sides = { include: new Set<string>(), exclude: new Set<string>() };
  sides[side] = new Set(ids);

  return groupClause(group, sides) ?? '';
}

/**
 * A union term written in place of the terms it covers, in one side of a group's clause.
 *
 * Which side that is never comes up, which is the whole of why there is one of these rather than two: the union says
 * what each of its terms says, and that cuts the same way whichever way round the clause has them.
 * `background,locationbackground` is `background` because either backdrop is a backdrop, and
 * `!background&!locationbackground` is `!background` because neither backdrop rules out both.
 *
 * What it does mean is that a term is read on the side it was picked on and nowhere else, so
 * `background&!locationbackground` — the Event backdrops — comes through here as it went in, as does the
 * `locationbackground&!background` that matches nothing. One of those a reader wants and the other they are owed the
 * sight of.
 *
 * Nothing here weighs the two spellings, because `terms.js` names a union more briefly than the terms it covers and a
 * test holds the table to it. A union term named at more length would still be correct to swap in and would no longer
 * be worth swapping, which wants a field of its own rather than a branch here.
 */
function shortUnion(group: Group, chosen: Set<string>) {
  for (const union of group.terms) {
    if (!union.covers) {
      continue;
    }

    const covered = union.covers.filter((id) => chosen.has(id));

    // Beside the union itself a term it covers adds nothing to that side, so it goes — however many of them are on it.
    if (chosen.has(union.id)) {
      for (const id of covered) {
        chosen.delete(id);
      }

      continue;
    }

    // Short of all of them the union says more than they do, and there is nothing here to swap it for.
    if (covered.length < union.covers.length) {
      continue;
    }

    for (const id of covered) {
      chosen.delete(id);
    }

    chosen.add(union.id);
  }
}

/**
 * One group's choices said as shortly as the group's own arithmetic allows, written back into the two sets they came
 * from. A group whose terms `terms.js` declares nothing about has no arithmetic, and is left as the chips left it.
 *
 * The two group facts buy different things, which is why they are two rather than one flag. At most one term being
 * true of a Pokémon makes a refusal beside a choice redundant, the choice having already ruled out everything it is
 * not. At least one always being true makes the whole group redundant, since asking for any of them asks for nothing.
 * Both at once make the terms left out say exactly what the terms chosen say, so the shorter of those two spellings is
 * the one to write.
 *
 * A union term comes first, and only ever makes a side shorter. The two reductions cannot reach for the same clause: a
 * group holding a union term overlaps itself and so cannot be exclusive, and Background — the one group holding one —
 * declares neither fact.
 */
function shortGroup(group: Group, include: Set<string>, exclude: Set<string>) {
  shortUnion(group, include);
  shortUnion(group, exclude);

  // The chips can write `shadow&!purified`, and in an exclusive group the choice has ruled the rest out already.
  if (group.exclusive && group.terms.some((term) => include.has(term.id))) {
    for (const term of group.terms) {
      exclude.delete(term.id);
    }
  }

  if (!group.exhaustive) {
    return;
  }

  const chosen = group.terms.filter((term) => include.has(term.id));

  // What a Pokémon is left free to be: the choices, narrowed by the refusals — or every term where nothing was chosen,
  // since choosing nothing in a group rules out only what that group refuses.
  const allowed = (chosen.length > 0 ? chosen : group.terms).filter((term) => !exclude.has(term.id));
  const refused = group.terms.filter((term) => !allowed.includes(term));

  // Every term in the group refused, which the chips can say between them. Nothing can match, and the empty clause an
  // allowed set of nothing would write matches everything instead — the same trap the empty intersection of two spans
  // is kept out of below.
  if (allowed.length === 0) {
    return;
  }

  // Several terms can be true of one Pokémon where the group is not also exclusive, so the ones left out do not say
  // what the ones chosen say: Gyarados is Flying, which is among the seventeen types that are not Water, and it is
  // still not `!water`. The whole set is the one case that reduces, and it reduces to nothing.
  if (!group.exclusive && refused.length > 0) {
    return;
  }

  const ids = (terms: readonly Term[]) => terms.map((term) => term.id);

  const [set, writing]: [Set<string>, readonly Term[]] =
    clauseOf(group, 'exclude', ids(refused)).length < clauseOf(group, 'include', ids(allowed)).length
      ? [exclude, refused]
      : [include, allowed];

  for (const term of group.terms) {
    include.delete(term.id);
    exclude.delete(term.id);
  }

  for (const term of writing) {
    set.add(term.id);
  }
}

/**
 * The state the same choices compose to in fewer characters, and what was done to get there.
 *
 * The state handed back is for composing and nothing else. The chips, the boxes and the link go on carrying what the
 * reader actually chose, so turning the optimiser off puts the original string back rather than having to undo a
 * rewrite, and a shared link still arrives as the choices that were made.
 *
 * `rewrites` is the pairs worth showing: a reader who cannot see why `charmander` became `4` has been handed a string
 * to trust on a mass transfer with no way to check it. `lossy` marks the one reduction that is not an equivalence — a
 * name matches nicknames as well as species, the wiki being explicit that `Tyranitar` returns "all Tyranitar (including
 * any Tyranitar nicknamed as other)", where a dex number matches the species alone.
 */
export function optimise(state: State) {
  const rewrites: [string, string][] = [];
  const short = {
    ...state,
    include: new Set(state.include),
    exclude: new Set(state.exclude),
    ranges: new Map([...state.ranges].map(([id, bounds]) => [id, { ...bounds }])),
  };

  // Each group's own arithmetic, settled inside the group and so neither reading nor disturbing the names and the dex
  // spans below. Generation is the one group whose terms those spans own, and it is also the one declaring neither
  // fact, so the two reductions never reach for the same clause.
  for (const group of GROUPS) {
    shortGroup(group, short.include, short.exclude);
  }

  const typed = [...new Set(names(state.text))];

  // A name that another name begins says nothing the shorter one has not: whatever `charmander` reaches, `char` reaches
  // too, under either reading of a partial name, and the two are OR'd. A `+` travels with the name it is on, so a
  // family and a species are never compared this way — `+char` does not cover `charmander`.
  const kept = typed.filter((name) => {
    const covers = typed.find((other) => other.length < name.length && name.startsWith(other));

    if (covers) {
      rewrites.push([name, covers]);
    }

    return !covers;
  });

  const named = [];

  for (const name of kept) {
    const shortened = shortName(name);

    if (shortened.text !== name) {
      rewrites.push([name, shortened.text]);
    }

    named.push(shortened);
  }

  short.text = named.map((name) => name.text).join(',');

  const lossy = named.some((name) => name.numbered);
  const dexRange = RANGES.find((range) => range.id === 'dex');
  const generation = GROUPS.find((group) => group.id === 'generation');

  // Every reduction below is about the dex, so neither of these is optional and a table missing one is a broken page
  // rather than a query to shorten — the same reading `dom.js` takes of markup a script cannot find its element in.
  if (!dexRange || !generation) {
    throw new Error('`terms.js` declares no `dex` range or no `generation` group');
  }

  const whole: Span = [dexRange.min ?? 0, dexRange.max];

  // Every generation term is a span, since that is what a generation is searched as, so nothing is dropped here — but
  // the span is read out of the table's own text and a table saying something else would sort as `undefined` before.
  const generations = generation.terms
    .filter((term) => state.include.has(term.id))
    .map((term) => spanOf(term.term))
    .filter((span) => span !== null);

  // Read back through the writer that produced it, so the two cannot drift over which bound an empty box falls back to.
  const box = spanOf(rangeClause(dexRange, state) ?? '');

  // The names join this arithmetic only once every one of them has become a number. They are OR'd with each other and
  // AND'd with everything else, so one name still spelled as a name leaves the clause unable to be folded in.
  const numbers =
    named.length > 0 && named.every((name) => name.spans) ? merged(named.flatMap((name) => name.spans ?? [])) : null;
  const sources = [numbers, generations.length > 0 ? merged(generations) : null, box && [box]].filter(
    (source) => source !== null,
  );
  const dex = sources.reduce(intersected, [whole]);
  const [only] = dex;

  // Nothing can match — a dex number asked to be inside two spans that do not overlap, which the chips and the boxes
  // can say between them. Writing their intersection would be writing an empty clause, turning a search that finds
  // nothing into one that finds everything, so the spans stay as separate clauses. The names keep the shortening they
  // have already had, which stands on its own: what one species is called is not a question the other clauses answer.
  //
  // Reading the first span is the emptiness test rather than a second question about it, and it is the span the dex
  // boxes are filled from at the end where there turns out to be only the one.
  if (sources.length === 0 || only === undefined) {
    return { state: short, rewrites, lossy };
  }

  // Several spans have nowhere to go but the name clause, a dex box holding one span and a comma in it reading as
  // either end of some other range. Beside a name they would be OR'd where they have to be AND'd, so that is the one
  // case left alone.
  if (numbers === null && dex.length > 1 && short.text !== '') {
    return { state: short, rewrites, lossy };
  }

  for (const term of generation.terms) {
    short.include.delete(term.id);
  }

  // A name still spelled as a name is a clause of its own, AND'd with whatever the spans compose to, so the text is
  // theirs to overwrite only where every name became a number: `numbers` being null is the text holding something this
  // arithmetic never saw, and `+charmander&1-151` written as `1-151` is a far broader search than was built.
  if (numbers !== null) {
    short.text = everything(dex, whole) ? '' : written(dex);
  } else if (dex.length > 1) {
    short.text = written(dex);
  }

  // Spans covering the whole dex say nothing and earn no clause either way. Anything narrower the text did not take
  // goes to the dex boxes, which hold the one span that is left.
  if (numbers !== null || dex.length > 1 || everything(dex, whole)) {
    short.ranges.delete('dex');
  } else {
    short.ranges.set('dex', { from: only[0], to: only[1] });
  }

  return { state: short, rewrites, lossy };
}
