/**
 * 施法效果摘要（UX 阶段 B · 窗口 P · B-4 三段式第③段）。
 *
 * 阶段 A 的观察：释放技能后整个战斗层的文字只有六组数字 + `TURN 01`——
 * `session.resolve()` 返回的事件流里什么都有（伤害/治疗/状态/召唤/宝石/经济），
 * 只是从没被翻译成人话（`15-battle.md` B-4）。
 *
 * 本模块是**纯函数**：事件流 → 中文摘要行，零 DOM 依赖，可在 node 环境单测。
 * 表现层（App）只负责把返回的行渲染成摘要条。
 */
import type { GameEvent } from '@engine/events';
import { BaseColor } from '@engine/types';
import { statusBadge } from './statusBadges';
import { statusCountsDown } from '@engine/skills/effects/status';

/** 属性中文名（与卡面/详情面板同口径） */
const STAT_CN: Record<string, string> = {
  attack: '攻击',
  armor: '护甲',
  hp: '生命',
  mana: '法力值',
  magic: '魔力值',
};

const CURRENCY_CN: Record<string, string> = {
  gold: '金币',
  souls: '灵魂',
  gems: '宝石',
  maps: '藏宝图',
};

const COLOR_CN: Record<BaseColor, string> = {
  [BaseColor.Red]: '红色',
  [BaseColor.Green]: '绿色',
  [BaseColor.Blue]: '蓝色',
  [BaseColor.Yellow]: '黄色',
  [BaseColor.Purple]: '紫色',
  [BaseColor.Brown]: '棕色',
};

export interface CastSummaryOptions {
  /** 角色 id → 显示名。取不到名字时用「目标」兜底，绝不泄露内部 id */
  nameOf: (charId: number) => string | undefined;
  /** 最多输出多少行（超出折成一行「…等 N 项」）。默认 6 */
  maxLines?: number;
}

/** 摘要中间态：按「归并键」聚合，保证同一目标的多段伤害只出一行 */
interface Bucket {
  key: string;
  text: string;
  order: number;
}

/**
 * 把一次施法产生的事件流翻译成摘要行。
 *
 * 归并规则（避免一次 AoE 刷出十几行）：
 * - 同一目标的多段 `skill-damage` 累加成一行；
 * - 同一目标同一属性的 `buff` 累加成一行；
 * - 宝石类事件按「创造/转化/清除」三类各自累计颗数；
 * - `status-tick`（回合结算掉血）与 `source:'trait'` 的被动 buff 不计入——
 *   它们不是本次施法的效果，混进来会误导玩家。
 */
export function summarizeCastEvents(events: readonly GameEvent[], opts: CastSummaryOptions): string[] {
  const nameOf = (id: number): string => opts.nameOf(id) ?? '目标';
  const maxLines = opts.maxLines ?? 6;

  const buckets: Bucket[] = [];
  const byKey = new Map<string, Bucket>();
  let order = 0;
  const put = (key: string, text: string): void => {
    const hit = byKey.get(key);
    if (hit) {
      hit.text = text;
      return;
    }
    const bucket: Bucket = { key, text, order: order++ };
    byKey.set(key, bucket);
    buckets.push(bucket);
  };

  const damage = new Map<number, number>();
  const buffs = new Map<string, { id: number; stat: string; amount: number }>();
  const gems = { create: 0, transform: 0, clear: 0 };

  for (const ev of events) {
    switch (ev.type) {
      case 'skill-damage': {
        const total = (damage.get(ev.targetId) ?? 0) + ev.damage;
        damage.set(ev.targetId, total);
        put(`dmg:${ev.targetId}`, `${nameOf(ev.targetId)} −${total} 生命`);
        break;
      }
      case 'buff': {
        // 特质/被动触发的 buff 不属于本次施法效果（事件带 source:'trait'）
        if (ev.source === 'trait') break;
        if (ev.amount === 0) break;
        const key = `buff:${ev.targetId}:${ev.stat}`;
        const prev = buffs.get(key);
        const amount = (prev?.amount ?? 0) + ev.amount;
        buffs.set(key, { id: ev.targetId, stat: ev.stat, amount });
        const sign = amount > 0 ? '+' : '−';
        put(key, `${nameOf(ev.targetId)} ${sign}${Math.abs(amount)} ${STAT_CN[ev.stat] ?? ev.stat}`);
        break;
      }
      case 'status-apply': {
        const label = statusBadge(ev.statusId).label;
        // 官方状态不倒计时，只有仍按回合结算的辅助状态才写回合数；出血写层数。
        const extra = ev.stacks !== undefined ? `（${ev.stacks} 层）`
          : statusCountsDown(ev.statusId) && ev.turns > 0 ? `（${ev.turns} 回合）` : '';
        put(`st:${ev.targetId}:${ev.statusId}`, `${nameOf(ev.targetId)} 获得 ${label}${extra}`);
        break;
      }
      case 'status-cleanse': {
        if (ev.statusIds.length === 0) break;
        const labels = [...new Set(ev.statusIds.map((id) => statusBadge(id).label))].join('、');
        const verb = ev.kind === 'dispel' ? '被驱散' : '解除';
        put(`cl:${ev.targetId}`, `${nameOf(ev.targetId)} ${verb} ${labels}`);
        break;
      }
      case 'status-blocked': {
        // 被免疫/赐福挡下的施加也要如实写进本次施法总结（否则玩家以为技能没生效）
        const label = statusBadge(ev.statusId).label;
        const why = ev.reason === 'blessed' ? '赐福抵挡' : ev.reason === 'immune' ? '免疫' : null;
        if (why) put(`bk:${ev.targetId}:${ev.statusId}`, `${nameOf(ev.targetId)} ${why} ${label}`);
        break;
      }
      case 'summon': {
        const where = ev.destination === 'queue' ? '（候补入列）' : '';
        put(`sm:${ev.characterId}`, `召唤 ${nameOf(ev.characterId)}${where}`);
        break;
      }
      case 'troop-transform': {
        put(`tf:${ev.targetId}`, `${nameOf(ev.targetId)} 转化为 ${ev.name}`);
        break;
      }
      case 'troop-reposition': {
        put(`rp:${ev.targetId}`, `${nameOf(ev.targetId)} 被移到${ev.to === 'front' ? '队首' : '队尾'}`);
        break;
      }
      case 'team-shuffle': {
        put('shuffle', '队伍站位被打乱');
        break;
      }
      case 'defeat': {
        put(`df:${ev.characterId}`, `${nameOf(ev.characterId)} 阵亡`);
        break;
      }
      case 'flee': {
        put(`fl:${ev.characterId}`, `${nameOf(ev.characterId)} 逃离战场`);
        break;
      }
      case 'gem-create': {
        gems.create += ev.spawns.length;
        put('gem:create', `创造 ${gems.create} 颗宝石`);
        break;
      }
      case 'gem-transform': {
        gems.transform += ev.changes.length;
        put('gem:transform', `转化 ${gems.transform} 颗宝石`);
        break;
      }
      case 'gem-destroy':
      case 'gem-explode': {
        gems.clear += ev.cells.length;
        put('gem:clear', `清除 ${gems.clear} 颗宝石`);
        break;
      }
      case 'economy-gain': {
        put(`eco:${ev.currency}`, `获得 ${ev.amount} ${CURRENCY_CN[ev.currency] ?? ev.currency}`);
        break;
      }
      case 'storm-change': {
        if (ev.reason === 'expired' || ev.color === null) break;
        put('storm', `${COLOR_CN[ev.color]}风暴生效`);
        break;
      }
      case 'extra-turn': {
        if (ev.source !== 'skill') break;
        put('extra', '获得额外回合');
        break;
      }
      case 'reshuffle': {
        put('reshuffle', '棋盘重排');
        break;
      }
      default:
        break;
    }
  }

  const lines = buckets.sort((a, b) => a.order - b.order).map((b) => b.text);
  if (lines.length <= maxLines) return lines;
  const rest = lines.length - (maxLines - 1);
  return [...lines.slice(0, maxLines - 1), `…等 ${rest} 项效果`];
}
