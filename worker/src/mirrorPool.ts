import type { D1Database } from '@cloudflare/workers-types';
import { DEFENSE_HISTORY_LIMIT, DEFENSE_INBOX_BATCH, hydrateDefenseReports, emptyDefenseLog, type DefenseLog, type DefenseReport } from '../../src/meta/systems/invasionDefense';
/**
 * 入侵真人镜像池的 D1 实现（表结构见 migrations/0003_invasion_mirrors.sql）。
 *
 * 取样：同规则版本、联赛窗口、强度粗筛、14 天内 → 先按新近取 200 条，再在其中随机取 limit 条，
 * 兼顾「新鲜」与「不总是同一批人」。展示名取 accounts 的最新用户名。
 * 写入：(player_id, league) 覆盖写；每 ~50 次写顺带清理一次过期行。
 */
import { mirrorOwnerKey, type InvasionMirrorPool } from '../../src/meta/server/mirrorPool';
import { INVASION_MATCHMAKING } from '../../src/meta/data/invasionMatchmaking';
import type {
  MirrorPoolEntry, MirrorPoolQuery, MirrorRecord, StandingEntry, StandingsQuery, VpReport,
} from '../../src/meta/systems/invasionMirrors';

/** 周榜行保留三周（周结名次只需要上一周） */
const WEEKLY_KEEP_MS = 21 * 24 * 60 * 60 * 1000;

interface Row {
  owner_key: string;
  league: number;
  week_start: number;
  ruleset: string;
  power: number;
  vp: number;
  snapshot: string;
  recorded_at: number;
  username: string | null;
}

type StoredSnapshot = Pick<MirrorRecord, 'team' | 'defense' | 'heroLevel' | 'bannerKingdom' | 'teamHash'>;

const RECENT_WINDOW = 200;
const PRUNE_EVERY = 50;

export class D1MirrorPool implements InvasionMirrorPool {
  constructor(private readonly db: D1Database, private readonly playerId: () => string | null) {}

  async recordDefense(report: DefenseReport): Promise<void> {
    const self = this.playerId();
    if (!self) throw new Error('Missing invasion actor identity');
    if (report.defender === mirrorOwnerKey(self)) return;
    // Identity comes from this actor, target/outcome from its persisted battle ticket.
    await this.db.prepare(`INSERT INTO invasion_defenses
      (attacker_id, battle_id, defender_key, attacker_key, at, defender_won, surrendered, frenzy, revenge, attacker_snapshot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (attacker_id, battle_id) DO NOTHING`)
      .bind(self, report.id, report.defender, mirrorOwnerKey(self), report.at,
        Number(report.defenderWon), Number(report.surrendered), Number(report.frenzy), Number(report.revenge === true), report.attackerSnapshot ? JSON.stringify(report.attackerSnapshot) : null).run();
  }

  async defenseLog(now: number, weekStart: number, afterSequence = 0): Promise<DefenseLog> {
    const self = this.playerId();
    if (!self) return emptyDefenseLog(now, weekStart);
    const key = mirrorOwnerKey(self);
    // Same transactional snapshot for counters and the recent page; covering index serves counts.
    const [counts, history, inbox] = await this.db.batch([
      this.db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(defender_won), 0) AS wins,
        COALESCE(SUM(CASE WHEN at >= ? THEN 1 ELSE 0 END), 0) AS weeklyTotal,
        COALESCE(SUM(CASE WHEN at >= ? THEN defender_won ELSE 0 END), 0) AS weeklyWins
        FROM invasion_defenses WHERE defender_key = ?`).bind(weekStart, weekStart, key),
      this.db.prepare(`SELECT d.*, a.username FROM invasion_defenses d
        LEFT JOIN accounts a ON a.player_id = d.attacker_id
        WHERE d.defender_key = ? ORDER BY d.at DESC, d.battle_id DESC LIMIT ?`).bind(key, DEFENSE_HISTORY_LIMIT),
      this.db.prepare(`SELECT d.*, a.username FROM invasion_defenses d
        LEFT JOIN accounts a ON a.player_id = d.attacker_id
        WHERE d.defender_key = ? AND d.sequence > ? ORDER BY d.sequence ASC LIMIT ?`)
        .bind(key, afterSequence, DEFENSE_INBOX_BATCH + 1),
    ]);
    const totals = counts!.results[0] as { total: number; wins: number; weeklyTotal: number; weeklyWins: number };
    const parse = (rows: Record<string, unknown>[]) => rows.map(r => {
      let attackerSnapshot: unknown;
      try { attackerSnapshot = JSON.parse(String(r.attacker_snapshot ?? 'null')); } catch { /* corrupt snapshot disables revenge, not history */ }
      const report = hydrateDefenseReports([{ id: r.battle_id, defender: r.defender_key, at: r.at,
        defenderWon: r.defender_won === 1, surrendered: r.surrendered === 1, frenzy: r.frenzy === 1,
        revenge: r.revenge === 1, attackerSnapshot }])[0]!;
      return { ...report, sequence: Number(r.sequence), attacker: String(r.attacker_key),
        name: String(r.username ?? '').trim().slice(0, 24) || '无名指挥官' };
    });
    return { fetchedAt: now, weekStart, ...totals, entries: parse(history!.results as Record<string, unknown>[]),
      pending: parse(inbox!.results.slice(0, DEFENSE_INBOX_BATCH) as Record<string, unknown>[]), hasMore: inbox!.results.length > DEFENSE_INBOX_BATCH };
  }

  async sample(q: MirrorPoolQuery): Promise<MirrorPoolEntry[]> {
    const self = this.playerId();
    if (!self) return [];
    const { results } = await this.db.prepare(
      `SELECT * FROM (
         SELECT m.owner_key, m.league, m.week_start, m.ruleset, m.power, m.vp, m.snapshot, m.recorded_at, a.username
         FROM invasion_mirrors m LEFT JOIN accounts a ON a.player_id = m.player_id
         WHERE m.ruleset = ? AND m.league BETWEEN ? AND ? AND m.recorded_at >= ?
           AND m.power BETWEEN ? AND ? AND m.player_id != ?
         ORDER BY m.recorded_at DESC LIMIT ?
       ) ORDER BY random() LIMIT ?`,
    ).bind(q.ruleset, q.leagueMin, q.leagueMax, q.since, q.powerMin, q.powerMax, self, RECENT_WINDOW, q.limit)
      .all<Row>();
    const entries: MirrorPoolEntry[] = [];
    for (const row of results ?? []) {
      try {
        const snap = JSON.parse(row.snapshot) as StoredSnapshot;
        entries.push({
          ownerKey: row.owner_key,
          name: row.username?.trim().slice(0, 24) || '无名指挥官',
          league: row.league,
          weekStart: row.week_start,
          ruleset: row.ruleset,
          power: row.power,
          vp: row.vp,
          recordedAt: row.recorded_at,
          team: snap.team,
          defense: snap.defense ?? [],
          heroLevel: snap.heroLevel ?? 0,
          bannerKingdom: snap.bannerKingdom ?? null,
          teamHash: snap.teamHash ?? '',
        });
      } catch {
        // 坏行跳过（核心 usableEntry 还会再把关一次）
      }
    }
    return entries;
  }

  async standings(q: StandingsQuery): Promise<StandingEntry[]> {
    const self = this.playerId();
    if (!self) return [];
    const { results } = await this.db.prepare(
      `SELECT w.owner_key, w.vp, a.username
       FROM invasion_weekly w LEFT JOIN accounts a ON a.player_id = w.player_id
       WHERE w.week_start = ? AND w.league = ? AND w.player_id != ?
       ORDER BY w.vp DESC, w.updated_at ASC LIMIT ?`,
    ).bind(q.weekStart, q.league, self, q.limit).all<{ owner_key: string; vp: number; username: string | null }>();
    return (results ?? []).map(r => ({
      ownerKey: r.owner_key,
      name: r.username?.trim().slice(0, 24) || '无名指挥官',
      vp: Math.max(0, Math.floor(r.vp)),
    }));
  }

  async reportVp(report: VpReport): Promise<void> {
    const self = this.playerId();
    if (!self) return;
    const upsert = this.db.prepare(
      `INSERT INTO invasion_weekly (player_id, owner_key, week_start, league, vp, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (player_id, week_start) DO UPDATE SET
         owner_key = excluded.owner_key, league = excluded.league, vp = excluded.vp, updated_at = excluded.updated_at`,
    ).bind(self, mirrorOwnerKey(self), report.weekStart, report.league, Math.round(report.vp), report.at);
    if (Math.random() * PRUNE_EVERY < 1) {
      await this.db.batch([upsert, this.db.prepare('DELETE FROM invasion_weekly WHERE week_start < ?').bind(report.weekStart - WEEKLY_KEEP_MS)]);
    } else {
      await upsert.run();
    }
  }

  async publish(record: MirrorRecord): Promise<void> {
    const self = this.playerId();
    if (!self) return;
    const snapshot: StoredSnapshot = {
      team: record.team, defense: record.defense, heroLevel: record.heroLevel,
      bannerKingdom: record.bannerKingdom, teamHash: record.teamHash,
    };
    const upsert = this.db.prepare(
      `INSERT INTO invasion_mirrors (player_id, owner_key, league, week_start, ruleset, power, vp, snapshot, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (player_id, league) DO UPDATE SET
         owner_key = excluded.owner_key, week_start = excluded.week_start, ruleset = excluded.ruleset,
         power = excluded.power, vp = excluded.vp, snapshot = excluded.snapshot, recorded_at = excluded.recorded_at`,
    ).bind(self, mirrorOwnerKey(self), record.league, record.weekStart, record.ruleset,
      Math.round(record.power), Math.round(record.vp), JSON.stringify(snapshot), record.recordedAt);
    if (record.explicitDefense) {
      await this.db.batch([upsert, this.db.prepare('DELETE FROM invasion_mirrors WHERE player_id = ? AND league != ?').bind(self, record.league)]);
    } else if (Math.random() * PRUNE_EVERY < 1) {
      const cutoff = record.recordedAt - INVASION_MATCHMAKING.maxAgeMs;
      await this.db.batch([upsert, this.db.prepare('DELETE FROM invasion_mirrors WHERE recorded_at < ?').bind(cutoff)]);
    } else {
      await upsert.run();
    }
  }
}
