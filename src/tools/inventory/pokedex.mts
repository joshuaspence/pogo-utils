/**
 * The Pokédex entry screen, which is the way round the two things that hide a species from the detail screen: a
 * nickname printed where the name goes, and the `♀` or `♂` of a species' own name that OCR loses. That Pokémon's entry
 * is a few taps away and states the species in large flat text, so a walk that cannot trust the name can open it and
 * ask.
 *
 * **The dex number is what settles it, and the name beside it is not.** Measured over the three committed captures,
 * `0585`, `0032` and `0029` read exactly right off the ordinary whole-screen pass with no crop and no treatment. The
 * names come back `DEERLING`, `NIDORAN` and `NIDORAN ?` — the two Nidoran losing their glyph here exactly as they do on
 * the detail screen, and `fold` mapping both to the same `nidoran`, so a reader keying off the name would be back where
 * it started. Four digits on a flat background are not ambiguous in that way.
 *
 * **It answers the species and never the form.** Opening a Pokémon's Pokédex entry does not preselect that Pokémon's
 * form — the entry opens on whichever form it was last left on — so the selected tile says nothing about the Pokémon
 * the walk came from, however legible it is, and on `deerling-pokedex.png` it is very legible indeed at luminance 241
 * against 183. Legible and meaningless is the worst thing a reader can be offered, so nothing here reads it: this
 * reaches a row whose species is wrong and no row whose `defects.label` comes of `identify` folding two forms
 * together, 642 being Thundurus either way.
 *
 * **Nothing beats a wrong answer here**, which is what the cross-check below is for. The screen carries other
 * four-digit numbers — `SEEN 2763` and `CAUGHT 1499` on one of these captures alone — so a reader taking the first one
 * it finds would file a species off a counter. A number is accepted only where it resolves to a species and the name
 * printed beside it folds to that same species, and `null` is the answer to every other case.
 *
 * Seven mutations over this module and `identify`'s override, five caught and both survivors accounted for rather than
 * left as a bare zero. What catches things is the cross-check and nothing else: dropping the name half makes
 * `xurkitree.png` answer a dex, off the `0900 M © Os` status-bar clock that `CLAUDE.md` already records as a trap for
 * the measurements, and dropping the species half makes twelve captures answer one. So `TITLE`'s strictness survives
 * being loosened to `/(\d{3,4})\s*([a-z][a-z ]*)?/` — a `372` reaches Shelgon and the line beside it folds to nothing
 * like `shelgon`, so the check refuses it one step later — and the pattern is a description of the screen rather than
 * the thing keeping this honest. `found.size === 1` survives too, and that one is unreachable with this corpus rather
 * than untested: two entries would have to pass the check on one screen, which takes a capture caught mid-swipe
 * between them, and a `Set` collapses two readings of the same number.
 */

import { fold, type Line } from './ocr.mts';
import { type GameData } from './game-master.mts';

/**
 * A four-digit number followed by a name, which is the shape of the entry's title and of nothing else on the screen.
 *
 * Searched anywhere in the folded line rather than anchored, because the game draws a circular-arrows glyph ahead of
 * the number: it folds away to nothing on all three captures, reading as `©`, and an anchor would be betting that it
 * never reads as a letter. The name is matched loosely for the same reason and checked strictly below.
 */
const TITLE = /(\d{4})\s+([a-z][a-z ]*)/;

/**
 * Which species a Pokédex entry screen is showing, as its dex number, or null where the screen does not say so beyond
 * doubt.
 *
 * `data` is here for the cross-check rather than for the lookup: the number names a species, the line names one too,
 * and the two have to be the same species before either is believed. That is what makes a `SEEN` or `CAUGHT` counter
 * inert — 2763 is no species, and a count that did happen to land on a dex number carries no name beside it.
 *
 * The name is compared by exact folded equality rather than through `closest`, which is a deliberate departure from
 * every other name here. Slack exists to rescue a reading that is the only evidence there is; this reading is not
 * evidence at all but a check on a number that already answered, so slack would only widen what the check lets past.
 * Both Nidoran fold to `nidoran` and pass it, which is the point: the check says the line agrees, and the **number**
 * says which of the two.
 */
export function dexOn(lines: readonly Line[], data: GameData): number | null {
  const found = new Set<number>();

  for (const line of lines) {
    const match = TITLE.exec(fold(line.text));

    if (!match) {
      continue;
    }

    const [, digits = '', printed = ''] = match;
    const dex = Number(digits);
    const species = data.forms.find((f) => f.dex === dex)?.species;

    if (species !== undefined && fold(species) === printed.trim()) {
      found.add(dex);
    }
  }

  // One line agreeing with itself is the whole of what this can be sure of. Two that disagree are a screen mid-swipe
  // between entries, which the game really does draw and a capture really does catch, and picking either would be
  // guessing at which half the walk is standing on.
  const [only] = found;

  return found.size === 1 && only !== undefined ? only : null;
}
