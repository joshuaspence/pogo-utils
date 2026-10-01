/**
 * What the game itself knows about every species, form and move, from PokeMiners' decoded game master and the English
 * string table beside it — the same two files `CLAUDE.md` cross-checks the search terms against.
 *
 * The screen says a Pokémon's form only by implication, but it follows from numbers that are shown. HP is a pure
 * function of the base stamina, the stamina IV and the level's CP multiplier, so once PGSharp's overlay has given the
 * IVs and the level, a form is whichever base stats reproduce the HP. That is a weaker test than the CP this once used
 * — it separates only forms that differ in stamina, where CP also caught a difference in Attack or Defense — but CP is
 * the one number on the detail screen that does not survive OCR, and a CP read wrongly rules out the form that is
 * right rather than merely failing to choose. Types carry most of the rest, and `identify` reports whatever is left
 * over as alternatives rather than picking between them.
 *
 * Both files are cached for a week under `.cache/inventory/`, since the game master is 20 MB and a scan of a few
 * thousand Pokémon is not the moment to discover the network is down.
 */

import { fold } from './ocr.mts';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const GAME_MASTER = 'https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json';
const STRINGS =
  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/JSON/i18n_english.json';
const WEEK = 7 * 24 * 60 * 60 * 1000;

/** Level 51 is a best buddy's; nothing is ever higher. */
const MAX_LEVEL = 51;

export interface Form {
  dex: number;
  species: string;
  /** `Alola`, `Paldea Aqua`, or empty for the ordinary form. */
  form: string;
  costume: boolean;
  types: string[];
  attack: number;
  defense: number;
  stamina: number;
  /**
   * The game master's own `assetBundleValue`, which is how its artwork is named — `pokemon_icon_585_13.png` is the
   * Autumn Deerling. Null where the form carries none, which happens: `BASCULIN_WHITE_STRIPED` has no value where Red
   * and Blue have 11 and 12. It is the only thing that separates the forms whose stats and types are identical, so
   * `artwork.mts` reads it and nothing else here does.
   */
  icon: number | null;
  /**
   * Every move this form can hold: the ordinary pools, the elite ones a legacy Pokémon may still carry, Rayquaza's
   * untradeable Dragon Ascent, and the Frustration and Return a shadow or purified one has. Reading a move against
   * this rather than against all 328 is the difference between choosing among three and choosing among hundreds.
   */
  moves: readonly Move[];
}

export interface Move {
  name: string;
  fast: boolean;
}

export interface GameData {
  forms: Form[];
  moves: Move[];
  species: string[];
  types: string[];
  /** Every level from 1 to 51 in half steps, against its CP multiplier. */
  cpm: [number, number][];
}

export interface IVs {
  attack: number;
  defense: number;
  stamina: number;
}

interface Template {
  templateId: string;
  data: {
    pokemonSettings?: {
      pokemonId: string;
      form?: string;
      type: string;
      type2?: string;
      stats: { baseAttack?: number; baseDefense?: number; baseStamina?: number };
      quickMoves?: string[];
      cinematicMoves?: string[];
      eliteQuickMove?: string[];
      eliteCinematicMove?: string[];
      nonTmCinematicMoves?: string[];
      shadow?: { shadowChargeMove?: string; purifiedChargeMove?: string };
    };
    formSettings?: {
      pokemon: string;
      forms?: { form: string; isCostume?: boolean; assetBundleValue?: number }[];
    };
    moveSettings?: object;
    playerLevel?: { cpMultiplier: number[] };
  };
}

export async function loadGameData(cacheDir: string, refresh = false): Promise<GameData> {
  const templates = JSON.parse(await cached(cacheDir, 'game-master.json', GAME_MASTER, refresh)) as Template[];
  const flat = (JSON.parse(await cached(cacheDir, 'english.json', STRINGS, refresh)) as { data: string[] }).data;
  const strings = new Map<string, string>();

  for (let i = 0; i + 1 < flat.length; i += 2) {
    strings.set(flat[i] ?? '', flat[i + 1] ?? '');
  }

  const typeName = (t: string) => {
    const key = t.replace(/^POKEMON_TYPE_/, '').toLowerCase();
    return strings.get(`pokemon_type_${key}`) ?? titleise(key);
  };

  const costumes = new Set<string>();
  const icons = new Map<string, number>();

  for (const { data } of templates) {
    for (const f of data.formSettings?.forms ?? []) {
      if (f.isCostume) {
        costumes.add(f.form);
      }

      if (f.assetBundleValue !== undefined) {
        icons.set(f.form, f.assetBundleValue);
      }
    }
  }

  const moves: Move[] = [];
  const byId = new Map<string, Move>();

  for (const { templateId, data } of templates) {
    // `movementId` is a name for most moves and a bare number for a few, so the template's own id is the one to read.
    const match = /^V(\d{4})_MOVE_(\w+)$/.exec(templateId);
    const id = match?.[2];

    if (!data.moveSettings || !match || id === undefined) {
      continue;
    }

    const fast = id.endsWith('_FAST');
    const move = { name: strings.get(`move_name_${match[1]}`) ?? titleise(id.replace(/_FAST$/, '')), fast };
    moves.push(move);
    byId.set(id, move);
  }

  const forms: Form[] = [];
  const bare = new Map<number, Form>();

  for (const { templateId, data } of templates) {
    const settings = data.pokemonSettings;
    const match = /^V(\d{4})_POKEMON_/.exec(templateId);

    if (!settings || !match) {
      continue;
    }

    const dex = Number(match[1]);
    const { baseAttack = 0, baseDefense = 0, baseStamina = 0 } = settings.stats;
    const prefix = `${settings.pokemonId}_`;
    const suffix = settings.form?.startsWith(prefix) ? settings.form.slice(prefix.length) : (settings.form ?? '');
    const form: Form = {
      dex,
      species: strings.get(`pokemon_name_${match[1]}`) ?? titleise(settings.pokemonId),
      // Nidoran's is `NIDORAN_NORMAL` under a `pokemonId` of `NIDORAN_FEMALE`, so the prefix test alone misses it.
      form: /(^|_)NORMAL$/.test(suffix) ? '' : titleise(suffix),
      costume: settings.form !== undefined && costumes.has(settings.form),
      icon: settings.form === undefined ? null : (icons.get(settings.form) ?? null),
      types: [settings.type, settings.type2].filter((t) => t !== undefined).map(typeName),
      attack: baseAttack,
      defense: baseDefense,
      stamina: baseStamina,
      // A handful of pool entries are bare numbers where every move template is named, so some do not resolve; the
      // reader falls back on the whole list when nothing in the pool fits, which is also what covers a move the game
      // has since dropped from the pool of a Pokémon still holding it.
      moves: [
        ...(settings.quickMoves ?? []),
        ...(settings.eliteQuickMove ?? []),
        ...(settings.cinematicMoves ?? []),
        ...(settings.eliteCinematicMove ?? []),
        ...(settings.nonTmCinematicMoves ?? []),
        ...[settings.shadow?.shadowChargeMove, settings.shadow?.purifiedChargeMove].filter((m) => m !== undefined),
      ]
        .map((id) => byId.get(id))
        .filter((m) => m !== undefined),
    };

    // A species with forms is listed once bare and once per form, the bare entry repeating the `_NORMAL` one. Keep it
    // only for species that have nothing else.
    if (settings.form === undefined) {
      bare.set(dex, form);
    } else {
      forms.push(form);
    }
  }

  for (const [dex, form] of bare) {
    if (!forms.some((f) => f.dex === dex)) {
      forms.push(form);
    }
  }

  const table = templates.find((t) => t.data.playerLevel)?.data.playerLevel?.cpMultiplier ?? [];
  const cpm: [number, number][] = [];

  for (let level = 1; level <= MAX_LEVEL; level++) {
    const here = table[level - 1];
    const next = table[level];

    if (here === undefined) {
      throw new Error(`the game master has no CP multiplier for level ${level}`);
    }

    cpm.push([level, here]);

    // A half level's multiplier is the root mean square of the two either side of it; the table only holds whole ones.
    if (level < MAX_LEVEL && next !== undefined) {
      cpm.push([level + 0.5, Math.sqrt((here * here + next * next) / 2)]);
    }
  }

  return {
    forms: forms.sort((a, b) => a.dex - b.dex),
    moves,
    species: [...new Set(forms.map((f) => f.species))],
    types: [...new Set(forms.flatMap((f) => f.types))],
    cpm,
  };
}

/**
 * The CP the game shows, which the scanner works out rather than reads: CP is white over the artwork and the one number
 * on the detail screen that does not survive OCR, coming back as `ce1385` on one species and as nothing at all on
 * another, where the overlay hands over the level and the IVs that determine it exactly. Derived it also agrees with
 * the screen where reading it did not — 635 for a level 31 Shroomish at 10/7/10, against a `CP 635` that read as null.
 */
export function cpOf(form: Form, iv: IVs, multiplier: number): number {
  const a = form.attack + iv.attack;
  const d = form.defense + iv.defense;
  const s = form.stamina + iv.stamina;

  return Math.max(10, Math.floor((a * Math.sqrt(d) * Math.sqrt(s) * multiplier * multiplier) / 10));
}

/** The CP multiplier for a level, or null where nothing is at that level — the half steps stop at 51. */
export function multiplierOf(data: GameData, level: number): number | null {
  return data.cpm.find(([l]) => l === level)?.[1] ?? null;
}

export function hpOf(form: Form, iv: IVs, multiplier: number): number {
  return Math.max(10, Math.floor((form.stamina + iv.stamina) * multiplier));
}

/**
 * Every level at which this form with these IVs shows exactly this maximum HP. Usually a handful of adjacent half
 * levels rather than one, since `hpOf` floors and neighbouring multipliers are close enough to land on the same
 * integer; the level the overlay states is what picks among them.
 */
export function levelsOf(data: GameData, form: Form, iv: IVs, hp: number): number[] {
  return data.cpm.filter(([, m]) => hpOf(form, iv, m) === hp).map(([level]) => level);
}

/** Levenshtein distance over folded text, so case, accents and OCR's stray punctuation cost nothing. */
export function distance(a: string, b: string): number {
  const s = fold(a).replaceAll(' ', '');
  const t = fold(b).replaceAll(' ', '');
  let previous = Array.from({ length: t.length + 1 }, (_, i) => i);

  for (let i = 1; i <= s.length; i++) {
    const current = [i];

    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      current.push(Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost));
    }

    previous = current;
  }

  return previous[t.length] ?? 0;
}

/**
 * The candidate nearest to what OCR read, if it is near enough to be a misreading rather than a different word: a
 * quarter of the length, so `Pikachv` is Pikachu and `Sparky` is not Sparkling anything.
 */
export function closest<T>(text: string, candidates: readonly T[], name: (c: T) => string, slack = 0.25): T | null {
  const length = fold(text).replaceAll(' ', '').length;

  if (length < 3) {
    return null;
  }

  let best: T | null = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    const d = distance(text, name(candidate));

    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }

  return bestDistance <= Math.max(1, Math.floor(length * slack)) ? best : null;
}

function titleise(constant: string): string {
  return constant
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((w) => (w[0] ?? '').toUpperCase() + w.slice(1))
    .join(' ');
}

async function cached(dir: string, file: string, url: string, refresh: boolean): Promise<string> {
  const path = join(dir, file);

  if (!refresh && existsSync(path) && Date.now() - statSync(path).mtimeMs < WEEK) {
    return readFileSync(path, 'utf8');
  }

  console.error(`Downloading ${url}`);
  let text: string;

  try {
    // `fetch` rejects rather than answering when there is no network at all, which is the case a stale copy is most
    // wanted for, so the fallback has to cover a throw as well as a status.
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    text = await response.text();
  } catch (error) {
    if (existsSync(path)) {
      console.error(`  ${error instanceof Error ? error.message : String(error)}; using the copy from before`);
      return readFileSync(path, 'utf8');
    }

    throw new Error(`${url}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }

  mkdirSync(dir, { recursive: true });
  writeFileSync(path, text);

  return text;
}
