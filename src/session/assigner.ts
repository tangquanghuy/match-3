/**
 * 分拣引擎（AIRP 分类敌我 → 特质/技能自动编配）。
 *
 * 背景：AIRP 宿主是 AI 跑团，不会知道客户端内部的 233 个特质 code 或技能 id。
 * 它提供的是语义特征：种族（troopTypes）与阶级（tier：杂兵/精英/首领/领主/传奇）。
 * 本模块按「阶级 + 种族」从已实现池中确定性编配 skillId 与 traitIds：
 *   - 显式给出的 skillId / traitIds 永远优先，分拣只补空缺；
 *   - 同一个 externalId 永远分到同一套（FNV-1a 哈希取池内偏移），保证结果可复现；
 *   - 池只收录客户端已实现的特质/技能，分拣产物必过校验。
 *
 * 纯逻辑、无 DOM 依赖；规则表会随内容批次扩充（技能池由窗口 B 的编译管线扩容）。
 */
import type { CombatantSnapshot } from './contract';
import { digestString } from './battleResult';

/** 阶级规范键 */
export type TierKey = 'minion' | 'elite' | 'boss' | 'lord' | 'legendary';

/** 中文/英文别名 → 规范键；未知值返回 undefined（校验层报错，不静默） */
const TIER_ALIASES: Record<string, TierKey> = {
  杂兵: 'minion',
  minion: 'minion',
  精英: 'elite',
  elite: 'elite',
  首领: 'boss',
  boss: 'boss',
  领主: 'lord',
  lord: 'lord',
  传奇: 'legendary',
  legendary: 'legendary',
};

/** 归一化阶级：未提供返回 undefined；不认识的返回 null（校验层据此报错） */
export function normalizeTier(tier: string | undefined): TierKey | undefined | null {
  if (tier === undefined) return undefined;
  return TIER_ALIASES[tier.trim().toLowerCase()] ?? null;
}

/** 技能池展示信息：详情面板对没有 TroopData 的宿主角色也展示技能文本 */
export interface SkillPoolEntry {
  skillId: string;
  name: string;
  description: string;
}

/**
 * 阶级 → 技能池。键为规范阶级；数组按由弱到强排列，分拣时取 hash 偏移。
 * 池随窗口 B 的技能编译批次扩充（阶段目标：每阶级 ≥5 个可选）。
 */
export const TIER_SKILL_POOL: Record<TierKey, SkillPoolEntry[]> = {
  minion: [
    { skillId: '7004', name: '狙击', description: '对 1 名敌人造成 [魔法 + 2] 点伤害。' },
  ],
  elite: [
    { skillId: '7132', name: '杀戮节庆', description: '对 1 名敌人造成 [魔法 + 2] 点轻微溅射伤害。' },
    { skillId: '7004', name: '狙击', description: '对 1 名敌人造成 [魔法 + 2] 点伤害。' },
  ],
  boss: [
    { skillId: '7155', name: '箭雨', description: '对所有敌人造成 [魔法 + 2] 点伤害。' },
    { skillId: '7132', name: '杀戮节庆', description: '对 1 名敌人造成 [魔法 + 2] 点轻微溅射伤害。' },
  ],
  lord: [
    { skillId: '7062', name: '英灵再世', description: '将指定的法力颜色转换为蓝色。' },
    { skillId: '7155', name: '箭雨', description: '对所有敌人造成 [魔法 + 2] 点伤害。' },
  ],
  legendary: [
    { skillId: '7063', name: '剧毒蛇液', description: '使前 2 名敌人陷入中毒状态，并创造 9 颗红色宝石。获得 [魔法 + 1] 点生命值。' },
    { skillId: '7062', name: '英灵再世', description: '将指定的法力颜色转换为蓝色。' },
  ],
};

/**
 * 阶级 → 特质池（全部是已实现 code）。数量即编配数量：
 * 杂兵 1 个、精英 2 个、首领 2 个、领主 3 个、传奇 3 个。
 */
export const TIER_TRAIT_POOL: Record<TierKey, { count: number; codes: string[] }> = {
  minion: { count: 1, codes: ['thickhide', 'big', 'sturdy', 'regeneration'] },
  elite: {
    count: 2,
    codes: ['armored', 'toughscales', 'fast', 'venomous', 'spellarmor', 'regeneration', 'alert'],
  },
  boss: {
    count: 2,
    codes: ['stoneskin', 'spellarmor', 'fast', 'frenzy', 'poisonspores', 'armored', 'alert', 'insulated'],
  },
  lord: {
    count: 3,
    codes: ['stoneskin', 'spellarmor', 'stealthy', 'frenzy', 'poisonspores', 'empowered', 'toughscales', 'fireproof'],
  },
  legendary: {
    count: 3,
    codes: ['stoneskin', 'spellarmor', 'stealthy', 'empowered', 'invulnerable', 'fast', 'venomous', 'undying'],
  },
};

/** 种族标志性特质（族亲/之盾类，与种族强绑定）；没有的种族不加 */
export const RACE_SIGNATURE_TRAIT: Record<string, string> = {
  Knight: 'knightbond',
  Beast: 'beastbond',
  Daemon: 'infernalarmor',
  Urska: 'urskabond',
};

/** FNV-1a 32 位哈希（与 battleResult.digestString 同源，十六进制串转数值做确定性取偏移） */
function hashOf(text: string): number {
  return parseInt(digestString(text), 16);
}

/** 从池中取 count 个不重复 code：以 hash 为起点循环取，池小于 count 时允许回绕去重后截断 */
function pickFromPool(pool: string[], count: number, hash: number): string[] {
  if (pool.length === 0 || count <= 0) return [];
  const picked: string[] = [];
  const seen = new Set<number>();
  let i = hash % pool.length;
  while (picked.length < Math.min(count, pool.length)) {
    if (!seen.has(i)) {
      seen.add(i);
      picked.push(pool[i]);
    }
    i = (i + 1) % pool.length;
  }
  return picked;
}

/** 取技能池展示信息；非池内技能（显式指定的）返回 null */
export function skillDisplayOf(skillId: string): SkillPoolEntry | null {
  for (const pool of Object.values(TIER_SKILL_POOL)) {
    const hit = pool.find((s) => s.skillId === skillId);
    if (hit) return hit;
  }
  return null;
}

/**
 * 就地补齐单个快照的 skillId / traitIds。只填空缺，显式值不动。
 * tier 缺失或不可识别时不做任何事（校验层负责报错）。
 */
export function assignSnapshot(snapshot: CombatantSnapshot): void {
  const tier = normalizeTier(snapshot.tier);
  if (!tier) return; // undefined（未提供）或 null（不认识）都交由校验层处理

  const hash = hashOf(snapshot.externalId);

  if (!snapshot.skillId) {
    const pool = TIER_SKILL_POOL[tier];
    snapshot.skillId = pool[hash % pool.length].skillId;
  }

  const provided = snapshot.traitIds;
  if (provided === undefined) {
    // 仅在「省略」时自动编配；显式空数组 = 宿主明确不要特质，尊重之
    const { count, codes } = TIER_TRAIT_POOL[tier];
    const assigned = pickFromPool(codes, count, hash);
    // 种族标志性特质排在最前（族亲光环与种族强绑定，是身份识别的一部分）
    const raceTrait = snapshot.troopTypes
      ?.map((t) => RACE_SIGNATURE_TRAIT[t])
      .find((code) => code !== undefined);
    snapshot.traitIds = [...new Set([...(raceTrait ? [raceTrait] : []), ...assigned])];
  }
}

/** 对整份 request 的双方快照执行分拣（只填空缺）。 */
export function assignBattleRequest(request: {
  playerTeam: CombatantSnapshot[];
  enemyTeam: CombatantSnapshot[];
}): void {
  for (const snapshot of [...request.playerTeam, ...request.enemyTeam]) {
    assignSnapshot(snapshot);
  }
}
