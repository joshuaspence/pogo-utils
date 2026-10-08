/**
 * What the game itself knows about every species, form and move, from PokeMiners' decoded game master and the English
 * string table beside it.
 *
 * The screen says a Pokémon's form only by implication, but it follows from numbers that are shown: HP is a pure
 * function of the base stamina, the stamina IV and the level's CP multiplier, so given PGSharp's overlay a form is
 * whichever base stats reproduce the HP. That separates only forms differing in stamina, where CP would also catch a
 * difference in Attack or Defense — but CP is the one number that does not survive OCR, and read wrongly it rules out
 * the right form rather than merely failing to choose. Types carry most of the rest, and what is left is an
 * alternative to report rather than one to pick.
 *
 * Every download is cached for a week, the game master being 20 MB and a scan of a few thousand Pokémon not the moment
 * to discover the network is down.
 */

import { titleise } from '../../pokemon/names.ts';
import { fold } from './ocr.mts';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const GAME_MASTER = 'https://raw.githubusercontent.com/PokeMiners/game_masters/master/latest/latest.json';
const STRINGS =
  'https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/Texts/Latest%20APK/JSON/i18n_english.json';

/**
 * Where `pogo_assets` keeps the form icons. The 256×256 renders rather than the smaller ones beside them, because
 * `Images/Pokemon/Addressable Assets` stopped being filled — last commit 2025-10-05 against 2026-09-25 — and the 270
 * files it is missing include every form of Mimikyu, Cramorant and Squawkabilly. Nothing distinguishes a stale listing
 * from a current one, both answering `truncated: false`, so those forms simply went unnarrowed. A signature is a hue
 * histogram normalised by its own pixel count, so the larger render scores the same.
 */
const ICON_DIR = 'Images/Pokemon - 256x256/Addressable Assets';

/**
 * What `pogo_assets` holds under `ICON_DIR`, which is 3,792 names in 874 KB and the only thing that says whether a form
 * has artwork at all. The contents endpoint caps at 1,000 entries and would truncate silently, where this one answers
 * `truncated: false`.
 */
const ICON_INDEX =
  'https://api.github.com/repos/PokeMiners/pogo_assets/git/trees/master:' + encodeURIComponent(ICON_DIR);

/**
 * Where that listing is cached, derived from `ICON_DIR` rather than written down beside it. `cached` keys on the file
 * name and a week's grace alone, so a fixed name across a change of directory answers the new URL with the old
 * directory's listing until the week is out — the same staleness `ICON_DIR` was changed to fix, arriving through the
 * cache instead of upstream.
 *
 * Exported for `cli.test.mts`, which seeds a cache to keep itself off the network: a name transcribed there would seed
 * a file the reader no longer asks for, and the test would pass on a download it meant to have prevented.
 */
export const ICON_CACHE = `icons-${ICON_DIR.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}.json`;

/** Where each file the index names is fetched from. */
export const ICON_BASE = `https://raw.githubusercontent.com/PokeMiners/pogo_assets/master/${encodeURI(ICON_DIR)}/`;

const WEEK = 7 * 24 * 60 * 60 * 1000;

/** Where the downloads are kept between runs. */
export const CACHE = '.cache/inventory';

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
   * The file `pogo_assets` holds this form's artwork under, or null where it holds none — the only thing that
   * separates forms whose stats and types are identical.
   *
   * A null is a statement about the game rather than a gap in the data: the game master lists every form Niantic's
   * data knows where the directory holds the ones the game draws, so a form with no icon is one no artwork could ever
   * have narrowed.
   */
  icon: string | null;
  /**
   * Every move this form can hold: the ordinary pools, the elite ones a legacy Pokémon may carry, Rayquaza's
   * untradeable Dragon Ascent, and the Frustration and Return a shadow or purified one has. Reading a move against
   * this rather than all 328 is the difference between choosing among three and among hundreds.
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
      forms?: { form: string; isCostume?: boolean }[];
    };
    moveSettings?: object;
    playerLevel?: { cpMultiplier: number[] };
  };
}

/** What a form has to be called to be the species' ordinary one, which decides its display name and its icon alike. */
const ORDINARY = /(^|_)NORMAL$/;

/**
 * Which file holds a form's artwork, or null where the directory holds none.
 *
 * The name is the form's own rather than a number: `assetBundleValue` is not how these assets are named and is not even
 * unique, Zygarde's 50% and Complete 50% both carrying `1`. Two candidates for a named form, the species prefix being
 * kept for some and dropped for others with nothing in the game master saying which. Measured over 1,352 non-costume
 * forms, 262 resolve trimmed and 34 full, and **none resolve both ways**, so asking the index settles it.
 *
 * The bare `pm{dex}.icon.png` is a third candidate and **only** for the ordinary form, 14 families' worth: no
 * `fNORMAL` exists for Frillish, so its male would be the one member of its pair with no icon. Only the ordinary one,
 * because offered to `RAIKOU_S` it would hand two forms one signature — the indecision `assetBundleValue` caused. And
 * a fallback rather than a replacement, `GENESECT_NORMAL` having an `fNORMAL` and no bare name at all.
 */
function iconName(index: ReadonlySet<string>, dex: number, suffix: string, form: string | undefined): string | null {
  const named = form === undefined ? [] : [`pm${dex}.f${suffix}.icon.png`, `pm${dex}.f${form}.icon.png`];
  const ordinary = form === undefined || ORDINARY.test(suffix);
  const names = ordinary ? [...named, `pm${dex}.icon.png`] : named;

  return names.find((name) => index.has(name)) ?? null;
}

/**
 * The directory listing, which makes a form's artwork addressable without probing for it: fetching the 162 files that
 * exist beats probing all 237, and it is what lets a family short of one icon be reported once ahead of the download
 * rather than discovered as a 404 per form on every scan. An improvement rather than a prerequisite, so failing to
 * read one costs the artwork narrowing and not the scan.
 */
async function iconIndex(dir: string, refresh: boolean): Promise<ReadonlySet<string>> {
  try {
    // Refused rather than read: a truncated listing is the stale directory's failure by another route — every name it
    // carries resolves, and the forms whose icon it dropped go unnarrowed with nothing to say so. Thrown from the
    // decode so `cachedAs` drops the copy, which kept would answer for the week. There is room for now, 895 KB against
    // the tree endpoint's 7 MB, but headroom is not a guard.
    const listing = await cachedAs(dir, ICON_CACHE, ICON_INDEX, refresh, (bytes) => {
      const parsed = JSON.parse(String(bytes)) as { tree?: { path: string }[]; truncated?: boolean };

      if (parsed.truncated) {
        throw new Error('the listing is truncated, so it names only some of the artwork');
      }

      return parsed;
    });

    return new Set((listing.tree ?? []).map((entry) => entry.path));
  } catch (error) {
    console.error(`  ${error instanceof Error ? error.message : String(error)}; no form is narrowed by its artwork`);

    return new Set();
  }
}

export async function loadGameData(cacheDir: string, refresh = false): Promise<GameData> {
  const templates = (await cachedJson(cacheDir, 'game-master.json', GAME_MASTER, refresh)) as Template[];
  const index = await iconIndex(cacheDir, refresh);
  const flat = ((await cachedJson(cacheDir, 'english.json', STRINGS, refresh)) as { data: string[] }).data;
  const strings = new Map<string, string>();

  for (let i = 0; i + 1 < flat.length; i += 2) {
    strings.set(flat[i] ?? '', flat[i + 1] ?? '');
  }

  const typeName = (t: string) => {
    const key = t.replace(/^POKEMON_TYPE_/, '').toLowerCase();
    return strings.get(`pokemon_type_${key}`) ?? titleise(key);
  };

  const costumes = new Set<string>();

  for (const { data } of templates) {
    for (const f of data.formSettings?.forms ?? []) {
      if (f.isCostume) {
        costumes.add(f.form);
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
      form: ORDINARY.test(suffix) ? '' : titleise(suffix),
      costume: settings.form !== undefined && costumes.has(settings.form),
      icon: iconName(index, dex, suffix, settings.form),
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

/**
 * A download kept under `dir` for a week, or the copy from before where the network fails. Throws where there is
 * neither.
 */
export async function cached(dir: string, file: string, url: string, refresh: boolean): Promise<Buffer> {
  const path = join(dir, file);

  if (!refresh && existsSync(path) && Date.now() - statSync(path).mtimeMs < WEEK) {
    return readFileSync(path);
  }

  // Ungated, because the week's grace above already gates it: this line is reached only where the copy is missing or
  // out of date, so it prints on the cold or stale run and never on the warm one `--verbose` was added to quieten. That
  // is also the run that has minutes of silence to account for, and a flag cannot be added once the wait has started.
  console.error(`Downloading ${url}`);

  let bytes: Buffer;

  try {
    // `fetch` rejects rather than answering when there is no network at all, which is the case a stale copy is most
    // wanted for, so the fallback has to cover a throw as well as a status.
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    bytes = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    // Naming the URL rather than leaning on the line above it. `iconsFor` keeps 16 downloads in flight, so the
    // `Downloading` this reads as a continuation of is rarely the line printed before it, and a bare `fetch failed;
    // using the copy from before` cannot say which of the three files or which of ~162 icons went stale.
    if (existsSync(path)) {
      console.error(`  ${url}: ${reason}; using the copy from before`);
      return readFileSync(path);
    }

    throw new Error(`${url}: ${reason}`, { cause: error });
  }

  // Written beside the copy and renamed over it, because the week's grace above trusts any file it finds: one cut short
  // by a scan killed mid-write or a full disk would otherwise be read back, and fail to parse, until the week was out.
  const partial = `${path}.${process.pid}`;

  mkdirSync(dir, { recursive: true });
  writeFileSync(partial, bytes);
  renameSync(partial, path);

  return bytes;
}

/**
 * A download read into whatever it holds, with the URL named whichever step failed. `response.ok` passes a 200
 * carrying an error page in place of JSON or a PNG, so the bytes that will not decode are the ones already cached and
 * the download that fetched them is over.
 *
 * Named here rather than at the two callers, because they are the ones that cannot: each relays a failure as a
 * two-space continuation rather than a crash, and a message naming nothing says neither which of the three files nor
 * which of ~162 icons went unread.
 *
 * The copy is dropped rather than kept, this being the only place that knows it is no good — `cached` would read it
 * back for the rest of the week, past its own `Downloading` line. Dropped whether it was downloaded here or read off
 * disk, bytes that do not decode being no more use on a second reading than a first.
 */
export async function cachedAs<T>(
  dir: string,
  file: string,
  url: string,
  refresh: boolean,
  decode: (bytes: Buffer) => T,
): Promise<T> {
  const bytes = await cached(dir, file, url, refresh);

  try {
    return decode(bytes);
  } catch (error) {
    rmSync(join(dir, file), { force: true });

    throw new Error(`${url}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}

async function cachedJson(dir: string, file: string, url: string, refresh: boolean): Promise<unknown> {
  return cachedAs(dir, file, url, refresh, (bytes) => JSON.parse(String(bytes)));
}
