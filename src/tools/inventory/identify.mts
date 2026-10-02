/**
 * The end of the pipeline, which reads no screen at all: which species and form a reading is, and at what level. The
 * name narrows the candidates when it is a species' name, the types narrow them further, PGSharp's bracketed suffix and
 * then the artwork separate what the numbers cannot, and a fold keeps one form per `(dex, stats, types)`.
 *
 * Here rather than in `detail.mts` because it consumes a reading instead of producing one — it is the only module that
 * asks the readers to agree with each other rather than each being separately right.
 */

import { closest, cpOf, levelsOf, multiplierOf, type Form, type GameData } from './game-master.mts';
import { fold } from './ocr.mts';
import { nearest, type Signature } from './artwork.mts';
import { type Detail } from './detail.mts';
import { type Overlay } from './overlay.mts';
/**
 * The two suffixes PGSharp draws that are not the form's name. It labels a form by its index from `A`, which works for
 * Unown's 26 letters and runs off the end of the alphabet for the other two: `'A'.charCodeAt(0) + 26` is `[` and `+ 27`
 * is `\\`, where the game master spells them out. Nothing else in the game is labelled this way, so this is a table of
 * two rather than arithmetic — and it has to be applied before the form is matched, since `identify` compares a suffix
 * against a form name exactly and `[` is no form of anything.
 */
const PGSHARP_FORMS = new Map([
  ['[', 'Exclamation Point'],
  ['\\', 'Question Mark'],
]);

/**
 * The artwork, for the forms whose numbers are identical — Deerling's four, Burmy's three, Genesect's five. `signature`
 * is the capture's own, from `signatureOf`, and `icons` is one per candidate form, from the game's own art.
 *
 * Handed in rather than fetched here so that `identify` stays a pure function of what it is given: the scan builds the
 * map by downloading icons, and the test records them, which is the same division the game master already has.
 */
export interface Artwork {
  signature: Signature;
  icons: ReadonlyMap<Form, Signature>;
}

export interface Identity {
  form: Form | null;
  /**
   * The CP this form at these IVs shows at this level, worked out rather than read. Null where the level is still
   * ambiguous, since two levels are two CPs and guessing between them would be worse than saying nothing.
   */
  cp: number | null;
  /** Other forms the numbers fit equally well, when they cannot be told apart. */
  alternatives: Form[];
  levels: number[];
  nickname: string | null;
  notes: string[];
}

/**
 * Which species and form this is, and at what level. The name narrows the candidates when it is a species' name, the
 * types narrow them further, and the overlay's IVs against the HP settle the rest — which is also what identifies a
 * Pokémon whose nickname has hidden its species. Costumes share their base form's stats, so they are folded into it
 * here and left to the `costume` search to report.
 *
 * The overlay's level is taken as a proposal rather than as a fact. It is the one field of the three that OCR gets
 * wrong with any regularity, because the `IV` label beside it reads as a `1` and runs into the digits, so it is kept
 * only where the HP agrees that the Pokémon can be that level and reported as a disagreement where it does not.
 *
 * The form PGSharp appends is the one thing here that the game's own screen cannot say, and it is needed for exactly
 * the species the numbers cannot separate: Unown's 28 letters are one set of base stats, one type and one move pool, so
 * HP, IVs and types narrow them to 28 and stop. Where the overlay carries no suffix the numbers were enough — an Alolan
 * Geodude's reads `L20 ɪᴠ91 13/13/15` with nothing appended, because its stats and types already say Alola.
 */
export function identify(data: GameData, detail: Detail, overlay: Overlay | null, artwork?: Artwork): Identity {
  const notes: string[] = [];
  const iv = overlay?.iv ?? null;
  const species = detail.name ? closest(detail.name, data.species, (s) => s) : null;
  const nickname = detail.name && !species ? detail.name : null;
  const fits = (f: Form) =>
    (detail.types.length === 0 || sameTypes(f.types, detail.types)) &&
    (iv === null || detail.hp === null || levelsOf(data, f, iv, detail.hp).length > 0);

  let candidates = data.forms.filter((f) => f.species === species && fits(f));

  if (candidates.length === 0 && iv !== null && detail.hp !== null && detail.types.length > 0) {
    if (species) {
      notes.push(`the numbers do not fit any form of ${species}; searched every species`);
    }

    candidates = data.forms.filter(fits);
  }

  // `fits` asks whether *some* level reproduces the HP, which is a weaker question than the screen can answer: the
  // overlay states a level too, and a form only really fits if one of the levels its HP admits is one of those. Applied
  // as a narrowing rather than inside `fits` because the stated shortlist is a reading and can be wrong — on
  // `pikachu-witch-hat.png` it names no level the HP can be — and a hard filter there would empty the list and send the
  // search off across every species. This is what settles `ho-oh.png`: five forms fit Fire/Flying at 152 HP, and only
  // Ho-Oh shows 152 at the `L25` the capture states.
  const stated = overlay?.levels ?? [];

  if (stated.length > 0 && iv !== null && detail.hp !== null) {
    const agreeing = candidates.filter((f) =>
      levelsOf(data, f, iv, detail.hp as number).some((level) => stated.includes(level)),
    );

    if (agreeing.length > 0) {
      candidates = agreeing;
    }
  }

  // PGSharp's own label, which is the only thing that can separate Unown's 28 letters: they share one set of base
  // stats, one type and one move pool, so nothing the game's own screen shows tells them apart. Applied ahead of the
  // fold below, which is otherwise what collapses them to one — and only where it matches something, since a suffix
  // read off the artwork must not empty a candidate list the numbers had narrowed correctly.
  const drawn = overlay?.form ?? null;
  const labelled = drawn === null ? null : (PGSHARP_FORMS.get(drawn) ?? drawn);
  const named = labelled === null ? [] : candidates.filter((f) => fold(f.form) === fold(labelled));

  if (named.length > 0) {
    candidates = named;
  } else if (labelled !== null) {
    notes.push(`the overlay says form "${labelled}", which is no form of ${species ?? 'any species that fits'}`);
  }

  // The artwork, which is all that is left where the numbers are identical: Deerling's four seasons share
  // `115/100/155 Normal+Grass` exactly, so nothing read off the panel can separate them and the fold below would keep
  // whichever has the shorter name. Ahead of that fold for the same reason PGSharp's label is.
  //
  // Every candidate has to carry a signature, not just two of them, or a form the game master gives no
  // `assetBundleValue` would be dropped for having no icon rather than for losing on its colours — which is `Basculin
  // (White Striped)`, and is why Basculin is never narrowed here.
  //
  // An abstention costs nothing and fixes nothing: the fold below removes the rivals rather than demoting them, so a
  // declined call still comes back as one form with no alternatives and no note — `shellos-west.png` is answered as
  // East Sea either way. That is the pre-existing gap rather than one this opens, and closing it means `identify`
  // reporting the fold it performed, which is a change to what every row of the CSV says.
  if (candidates.length > 1 && artwork) {
    const icons = new Map(candidates.map((f) => [f, artwork.icons.get(f)]));
    const known = [...icons].every(([, signature]) => signature !== undefined);
    const picked = known ? nearest(artwork.signature, icons as ReadonlyMap<Form, Signature>) : null;

    if (picked) {
      candidates = [picked];
    }
  }

  // Costumes repeat their base form's stats and types exactly, so they are the same answer twice.
  const distinct: Form[] = [];

  for (const f of [...candidates].sort(
    (a, b) => Number(a.costume) - Number(b.costume) || a.form.length - b.form.length,
  )) {
    if (!distinct.some((d) => d.dex === f.dex && sameStats(d, f) && sameTypes(d.types, f.types))) {
      distinct.push(f);
    }
  }

  const [form = null, ...alternatives] = distinct;
  const consistent = form && iv && detail.hp !== null ? levelsOf(data, form, iv, detail.hp) : [];
  const agreed = consistent.filter((l) => stated.includes(l));
  const levels = agreed.length > 0 ? agreed : consistent;

  if (nickname && iv === null) {
    notes.push('a nickname hides the species, and only the IVs can say what it is');
  } else if (distinct.length === 0 && (species || nickname)) {
    notes.push('no form fits the HP, IVs and types read');
  } else if (alternatives.length > 0) {
    notes.push(`could also be ${alternatives.map(label).join(', ')}`);
  }

  if (stated.length > 0 && consistent.length > 0 && agreed.length === 0) {
    notes.push(`the overlay reads as level ${stated.join(' or ')}, none of which this HP can be`);
  }

  if (levels.length > 1) {
    notes.push(`level ambiguous: ${levels.join(' or ')}`);
  }

  const settled = levels.length === 1 ? (levels[0] ?? null) : null;
  const multiplier = settled === null ? null : multiplierOf(data, settled);
  const cp = form && iv && multiplier !== null ? cpOf(form, iv, multiplier) : null;

  // Where OCR did read the CP it is worth saying so, since the two disagreeing means the level or the form is wrong
  // rather than that the arithmetic is: CP is a pure function of the three things above it.
  if (cp !== null && detail.cp !== null && cp !== detail.cp) {
    notes.push(`the screen reads CP ${detail.cp}, where this form at this level is ${cp}`);
  }

  return { form, cp, alternatives, levels, nickname, notes };
}

export function label(f: Form): string {
  return f.form ? `${f.species} (${f.form})` : f.species;
}

function sameTypes(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((t) => b.includes(t));
}

function sameStats(a: Form, b: Form): boolean {
  return a.attack === b.attack && a.defense === b.defense && a.stamina === b.stamina;
}
