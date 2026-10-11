/**
 * A matched spawn as a notification: what it is, why it matched, and what is needed to go and get it — the species
 * and form by name, the reason, IV, CP and level, where it is and how long it has left.
 */

import type { Notification } from './ntfy.mts';
import { XXL, XXS, type GameData, type Spawn } from './wire.mts';

export type Reason = 'Shiny' | '100%' | 'XXL' | 'XXS';

/** Why a matched spawn is worth a look, in the order a title names them. */
export function reasonsFor(spawn: Spawn, shiny: boolean): Reason[] {
  const reasons: Reason[] = [];

  if (shiny) {
    reasons.push('Shiny');
  }

  if (spawn.ivPercent !== null && spawn.ivPercent >= 100) {
    reasons.push('100%');
  }

  if (spawn.size === XXL) {
    reasons.push('XXL');
  } else if (spawn.size === XXS) {
    reasons.push('XXS');
  }

  return reasons;
}

/**
 * The species and form as Live PokeMap's own game data names them, which is how its map names them. The ordinary form
 * — the species' default, form 0, or one the data calls `Normal` — is left unsaid, as the game leaves it.
 */
export function namesOf(spawn: Spawn, data: GameData): { species: string; form: string | null } {
  const entry = data.pokemon?.[String(spawn.dexId)];
  const species = entry?.name ?? data.pokemon_names?.[String(spawn.dexId)] ?? (spawn.name || `Pokémon #${spawn.dexId}`);
  const form =
    spawn.form === 0 || spawn.form === entry?.default_form_id ? null : entry?.forms?.[String(spawn.form)]?.name;

  return { species, form: form && form !== 'Normal' ? form : null };
}

const TAGS: Record<Reason, string> = { 'Shiny': 'sparkles', '100%': '100', 'XXL': 'whale', 'XXS': 'mouse' };

/**
 * `now` and `timeZone` are parameters so a test can hold them still; the time a spawn leaves is printed in the
 * watcher's own zone, which is the phone's where it runs on the same person's machine, beside the minutes left, which
 * need no zone at all.
 */
export function notificationFor(
  spawn: Spawn,
  reasons: readonly Reason[],
  data: GameData,
  now: number,
  timeZone?: string,
): Notification {
  const { species, form } = namesOf(spawn, data);
  const lines: string[] = [];
  const stats: string[] = [];

  if (spawn.iv) {
    const percent = spawn.ivPercent ?? Math.round(((spawn.iv.attack + spawn.iv.defense + spawn.iv.stamina) / 45) * 100);

    stats.push(`IV ${spawn.iv.attack}/${spawn.iv.defense}/${spawn.iv.stamina} (${percent}%)`);
  } else if (spawn.ivPercent !== null) {
    stats.push(`IV ${spawn.ivPercent}%`);
  }

  if (spawn.cp !== null) {
    stats.push(`CP ${spawn.cp}`);
  }

  if (spawn.level !== null) {
    stats.push(`L${spawn.level}`);
  }

  if (stats.length > 0) {
    lines.push(stats.join(' · '));
  }

  if (spawn.despawnMs !== null) {
    const left = Math.max(0, Math.round((spawn.despawnMs - now) / 60_000));
    const at = new Date(spawn.despawnMs).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });

    lines.push(`Despawns ${at} (${left} min left)`);
  } else {
    lines.push('Despawn time unknown');
  }

  const where = `${spawn.lat.toFixed(6)},${spawn.lon.toFixed(6)}`;

  lines.push(where);

  return {
    title: `${reasons.join(' ')} ${species}${form ? ` (${form})` : ''}`.trim(),
    message: lines.join('\n'),
    tags: reasons.map((reason) => TAGS[reason]),
    click: `https://www.google.com/maps/search/?api=1&query=${where}`,
    priority: reasons.includes('Shiny') ? 5 : 4,
  };
}
