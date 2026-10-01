import { DEFENSE_HISTORY_LIMIT, DEFENSE_INBOX_BATCH, emptyDefenseLog, type DefenseLog, type DefenseReport, type DefenseEntry } from '../systems/invasionDefense';
/**
 * 入侵真人镜像的共享池（跨玩家存储）。
 *
 * 权威核心是纯同步的，池 I/O 由宿主（MetaHost）在命令前后完成：
 *  - 命令前按 invasionPoolQuery 取样，作为 CommandIo.mirrorPool 传进核心；
 *  - 命令提交后把核心产出的 CommandEffects.publishMirror 写回池里。
 * 每个实例绑定一名玩家（owner）：取样自动排除自己，写入按 (owner, league) 覆盖。
 *
 * 远端实现见 worker/src/mirrorPool.ts（D1）；这里的内存实现给本地多账号调试与测试用。
 */
import { fnv1a32 } from '../data/hash';
import type {
  MirrorPoolEntry, MirrorPoolQuery, MirrorRecord, StandingEntry, StandingsQuery, VpReport,
} from '../systems/invasionMirrors';

export interface InvasionMirrorPool {
  recordDefense(report: DefenseReport): Promise<void>;
  defenseLog(now: number, weekStart: number, afterSequence?: number): Promise<DefenseLog>;
  sample(query: MirrorPoolQuery): Promise<MirrorPoolEntry[]>;
  publish(record: MirrorRecord): Promise<void>;
  /** 本周同联赛真人周榜（VP 降序，排除本人） */
  standings(query: StandingsQuery): Promise<StandingEntry[]>;
  /** 上报本人本周 VP（按 (玩家, 周) 覆盖写；联赛随之更新） */
  reportVp(report: VpReport): Promise<void>;
}

/** 对外展示的玩家句柄：不可逆、稳定（排除最近对手 / 同批去重用） */
export function mirrorOwnerKey(playerId: string): string {
  return `${fnv1a32(`mirror-owner:${playerId}`).toString(36)}${fnv1a32(`mirror-owner2:${playerId}`).toString(36)}`;
}

/** 多名玩家共享的内存池；`forOwner` 给每个宿主一个绑定了身份的视图 */
export class MemoryMirrorStore {
  private readonly rows = new Map<string, MirrorPoolEntry>();
  private sequence = 0;
  private readonly defenses = new Map<string, DefenseEntry>();

  forOwner(playerId: string, name: string = playerId): InvasionMirrorPool {
    const ownerKey = mirrorOwnerKey(playerId);
    return {
      recordDefense: async (report) => {
        if (report.defender === ownerKey) return;
        const key = `${ownerKey}:${report.id}`;
        if (!this.defenses.has(key)) this.defenses.set(key, { ...structuredClone(report), sequence: ++this.sequence, attacker: ownerKey, name });
      },
      defenseLog: async (now, weekStart, afterSequence = 0) => {
        const rows = [...this.defenses.values()].filter(r => r.defender === ownerKey).sort((a, b) => b.at - a.at || b.id.localeCompare(a.id));
        const pending = rows.filter(r => r.sequence! > afterSequence).sort((a, b) => a.sequence! - b.sequence!);
        const weekly = rows.filter(r => r.at >= weekStart);
        return { ...emptyDefenseLog(now, weekStart), total: rows.length, wins: rows.filter(r => r.defenderWon).length,
          weeklyTotal: weekly.length, weeklyWins: weekly.filter(r => r.defenderWon).length,
          pending: structuredClone(pending.slice(0, DEFENSE_INBOX_BATCH)), hasMore: pending.length > DEFENSE_INBOX_BATCH,
          entries: structuredClone(rows.slice(0, DEFENSE_HISTORY_LIMIT)) };
      },
      sample: async (q) => [...this.rows.values()]
        .filter(e => e.ownerKey !== ownerKey && e.ruleset === q.ruleset && e.recordedAt >= q.since
          && e.league >= q.leagueMin && e.league <= q.leagueMax && e.power >= q.powerMin && e.power <= q.powerMax)
        .sort((a, b) => b.recordedAt - a.recordedAt)
        .slice(0, q.limit)
        .map(e => structuredClone(e)),
      publish: async (record) => {
        if (record.explicitDefense) for (const [key, row] of this.rows) if (row.ownerKey === ownerKey) this.rows.delete(key);
        this.rows.set(`${ownerKey}:${record.league}`, { ...structuredClone(record), ownerKey, name });
      },
      standings: async (q) => [...this.weekly.values()]
        .filter(r => r.ownerKey !== ownerKey && r.weekStart === q.weekStart && r.league === q.league)
        .sort((a, b) => b.vp - a.vp || a.at - b.at)
        .slice(0, q.limit)
        .map(r => ({ ownerKey: r.ownerKey, name: r.name, vp: r.vp })),
      reportVp: async (report) => {
        this.weekly.set(`${ownerKey}:${report.weekStart}`, { ...report, ownerKey, name });
      },
    };
  }

  private readonly weekly = new Map<string, VpReport & { ownerKey: string; name: string }>();

  get size(): number {
    return this.rows.size;
  }
}
