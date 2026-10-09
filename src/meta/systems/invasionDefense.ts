/** Independent PvP defense configuration and server-settled incoming battles. */
import type { MetaSave, TeamPreset } from '../state/schema';
import { fnv1a32 } from '../data/hash';
import { INVASION_MATCHMAKING } from '../data/invasionMatchmaking';
import { validateTeam } from './teamRules';
import { buildPlayerSnapshots } from './battleBridge';
import { captureMirrorRecord, usableEntry, type MirrorRecord } from './invasionMirrors';

export interface DefenseReport {
  id: string;
  defender: string;
  at: number;
  defenderWon: boolean;
  surrendered: boolean;
  frenzy: boolean;
  revenge?: boolean;
  attackerSnapshot?: MirrorRecord;
}
export interface DefenseEntry extends DefenseReport {
  sequence?: number;
  attacker: string;
  name: string;
}
export interface DefenseLog {
  fetchedAt: number;
  weekStart: number;
  total: number;
  wins: number;
  weeklyTotal: number;
  weeklyWins: number;
  entries: DefenseEntry[];
  /** Ordered, unaccounted events; independent of the 50-row display window. */
  pending?: DefenseEntry[];
  hasMore?: boolean;
}
export const DEFENSE_HISTORY_LIMIT = 50;
export function emptyDefenseLog(now: number, weekStart: number): DefenseLog {
  return { fetchedAt: now, weekStart, total: 0, wins: 0, weeklyTotal: 0, weeklyWins: 0, entries: [] };
}

/** A copied preset, not an index: editing/deleting/activating attack presets never changes defense. */
export function defenseRecord(save: MetaSave, now: number): MirrorRecord | null {
  const team = save.invasion.defenseTeam;
  if (!team || !validateTeam(save, team).ok) return null;
  const view = { ...save, teams: [team], activeTeamIndex: 0 };
  const built = buildPlayerSnapshots(view);
  if (!built.ok) return null;
  return { ...captureMirrorRecord(save, team, built.playerTeam, team.bannerKingdomId, now), explicitDefense: true };
}

/** Include every published gameplay field, but not the observation timestamp. */
export function defensePublicationStamp(record: MirrorRecord): NonNullable<MetaSave['invasion']['lastDefensePublish']> {
  const { recordedAt, ...snapshot } = record;
  return { fingerprint: fnv1a32(JSON.stringify(snapshot)).toString(16).padStart(8, '0'), at: recordedAt };
}

/** Schedule only changed/expired snapshots. A pending delivery is never cancelled. */
export function queueDefensePublish(save: MetaSave, now: number): MirrorRecord | null {
  const record = defenseRecord(save, now);
  if (!record) return null;
  const last = save.invasion.lastDefensePublish;
  const next = defensePublicationStamp(record);
  if (!last || last.fingerprint !== next.fingerprint || now < last.at
    || now - last.at >= INVASION_MATCHMAKING.republishMs) {
    save.invasion.defensePublishPending = true;
  }
  return record;
}

export function hydrateDefenseTeam(value: unknown): TeamPreset | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<TeamPreset>;
  if (typeof v.name !== 'string' || !Array.isArray(v.members) || v.members.length !== 4) return null;
  if (!v.members.every(m => m && (m.kind === 'hero' || (m.kind === 'troop' && Number.isInteger(m.troopId))))) return null;
  return { name: v.name.slice(0, 40), members: structuredClone(v.members),
    bannerKingdomId: typeof v.bannerKingdomId === 'string' ? v.bannerKingdomId : null,
    ...(v.heroClassId === null || typeof v.heroClassId === 'string' ? { heroClassId: v.heroClassId } : {}),
    ...(v.heroWeaponId === null || typeof v.heroWeaponId === 'string' ? { heroWeaponId: v.heroWeaponId } : {}) };
}
export function hydrateDefenseReports(value: unknown): DefenseReport[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is DefenseReport => !!v && typeof v === 'object'
    && typeof v.id === 'string' && v.id.length > 0 && v.id.length <= 512
    && typeof v.defender === 'string' && v.defender.length > 0 && v.defender.length <= 64
    && Number.isSafeInteger(v.at) && v.at >= 0 && v.at <= 8.64e15 && typeof v.defenderWon === 'boolean'
    && typeof v.surrendered === 'boolean' && typeof v.frenzy === 'boolean')
    .map(v => ({ id: v.id, defender: v.defender, at: v.at, defenderWon: v.defenderWon, surrendered: v.surrendered, frenzy: v.frenzy, ...(v.revenge === true ? { revenge: true } : {}),
      ...(validSnapshot(v.attackerSnapshot, v.at) ? { attackerSnapshot: structuredClone(v.attackerSnapshot) } : {}) }));
}
export function hydrateDefenseLog(value: unknown): DefenseLog | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as DefenseLog;
  if (![v.fetchedAt, v.weekStart, v.total, v.wins, v.weeklyTotal, v.weeklyWins].every(n => Number.isSafeInteger(n) && n >= 0)
    || v.wins > v.total || v.weeklyTotal > v.total || v.weeklyWins > v.weeklyTotal || !Array.isArray(v.entries)) return null;
  const entries = v.entries.slice(0, DEFENSE_HISTORY_LIMIT).flatMap(e => {
    const report = hydrateDefenseReports([e])[0];
    return report && typeof e.attacker === 'string' && typeof e.name === 'string'
      ? [{ ...report, attacker: e.attacker.slice(0, 64), name: e.name.slice(0, 40), ...(Number.isSafeInteger(e.sequence) && e.sequence! > 0 ? { sequence: e.sequence } : {}) }] : [];
  });
  return { fetchedAt: v.fetchedAt, weekStart: v.weekStart, total: v.total, wins: v.wins,
    weeklyTotal: v.weeklyTotal, weeklyWins: v.weeklyWins, entries, ...(v.hasMore === true ? { hasMore: true } : {}) };
}

/** Project balance values; not claimed to be GOW's historical numerical formula. */
export const DEFENSE_REWARD = Object.freeze({ gold: 100, souls: 10, glory: 2 });
export const DEFENSE_VP = 2;
export const DEFENSE_INBOX_BATCH = 200;
export interface DefenseProgress {
  cursor: number;
  rewards: { gold: number; souls: number; glory: number };
  results: { key: string; vpDelta: number; revenge?: 'pending' | 'won' | 'lost' }[];
}
export function emptyDefenseProgress(): DefenseProgress {
  return { cursor: 0, rewards: { gold: 0, souls: 0, glory: 0 }, results: [] };
}
export function defenseEntryKey(entry: Pick<DefenseEntry, 'attacker' | 'id'>): string {
  return `${entry.attacker}:${entry.id}`;
}
export function validSnapshot(value: unknown, at: number): value is MirrorRecord {
  if (!value || typeof value !== 'object') return false;
  try { return usableEntry({ ...(value as MirrorRecord), ownerKey: 'validation', name: '' }, at)
    && Array.isArray((value as MirrorRecord).defense); } catch { return false; }
}
export function hydrateDefenseProgress(value: unknown): DefenseProgress {
  const out = emptyDefenseProgress();
  if (!value || typeof value !== 'object') return out;
  const v = value as DefenseProgress;
  if (Number.isSafeInteger(v.cursor) && v.cursor >= 0) out.cursor = v.cursor;
  for (const key of ['gold', 'souls', 'glory'] as const) {
    const n = v.rewards?.[key];
    if (Number.isSafeInteger(n) && n >= 0) out.rewards[key] = n;
  }
  if (Array.isArray(v.results)) out.results = v.results.filter(r => r && typeof r.key === 'string'
    && r.key.length <= 600 && Number.isInteger(r.vpDelta) && Math.abs(r.vpDelta) <= DEFENSE_VP)
    .slice(-DEFENSE_HISTORY_LIMIT - 1).map(r => ({ key: r.key, vpDelta: r.vpDelta,
      ...(['pending', 'won', 'lost'].includes(r.revenge ?? '') ? { revenge: r.revenge } : {}) }));
  return out;
}
/** Event cursor and reward pool are committed atomically in the defender's save. */
export function accountDefenseLog(save: MetaSave, log: DefenseLog, weekStart: number): void {
  const progress = save.invasion.defenseProgress;
  for (const entry of log.pending ?? []) {
    if (!entry.sequence || entry.sequence <= progress.cursor) continue;
    // A reset account keeps the shared history, but must never earn its old rewards again.
    if (entry.at >= save.createdAt) {
      let vpDelta = 0;
      if (entry.at >= weekStart) {
        vpDelta = entry.defenderWon ? DEFENSE_VP : -Math.min(DEFENSE_VP, save.invasion.vp);
        save.invasion.vp += vpDelta;
      }
      if (entry.defenderWon) for (const key of ['gold', 'souls', 'glory'] as const) {
        progress.rewards[key] += DEFENSE_REWARD[key];
      }
      const previous = progress.results.find(r => r.key === defenseEntryKey(entry));
      if (previous) previous.vpDelta = vpDelta;
      else progress.results.push({ key: defenseEntryKey(entry), vpDelta });
    }
    progress.cursor = entry.sequence;
  }
  const visible = new Set(log.entries.map(defenseEntryKey));
  const pendingKey = save.pendingBattle?.mode === 'invasion' ? save.pendingBattle.revengeKey : undefined;
  progress.results = progress.results.filter(r => visible.has(r.key) || r.key === pendingKey);
  // Pending rows can contain hundreds of snapshots; never put them in the client save/cache.
  const previous = save.invasion.defenseLog;
  // Use the same field ordering/optional-field defaults as a reloaded save.
  const snapshot = hydrateDefenseLog(log) ?? { ...log, pending: undefined };
  // fetchedAt is not gameplay state. Keep the prior snapshot when a read found
  // nothing new; UI refresh throttling already uses its own in-memory clock.
  const unchanged = previous && previous.weekStart === log.weekStart
    && previous.total === log.total && previous.wins === log.wins
    && previous.weeklyTotal === log.weeklyTotal && previous.weeklyWins === log.weeklyWins
    && Boolean(previous.hasMore) === Boolean(log.hasMore)
    && JSON.stringify(previous.entries) === JSON.stringify(snapshot.entries);
  if (!unchanged) save.invasion.defenseLog = snapshot;
}
export function defenseRewardsReady(save: MetaSave): boolean {
  return save.invasion.defenseProgress.rewards.gold > 0;
}
