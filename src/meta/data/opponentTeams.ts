/** Community-supported archetypes adapted to troop-only local PvP, NOT official opponent tables.
 * Sources, substitutions and difficulty policy: docs/GOW-TEAMS-ARENA-AUDIT.md.
 */
import { strategyPickScore, arrangeStrategyDefense, troopStrategy, strategyRole, manaLinkScore } from './troopStrategy';
import { TROOPS } from '../../data/troops';
import { COMMUNITY_KINGDOM } from '../../data/communityTroops';
import { SeededRNG } from '../../engine/rng';
import { enemyTraitCount } from './enemyDifficulty';
import { ROLE_COMP_CHANCE, ROLE_COMPS, roleSlotAccepts } from './roleComps';

export interface DefenseTemplate {
  id: string; name: string; minLeague: number; maxLeague: number;
  troops: readonly [number, number, number, number];
  roles: readonly [string, string, string, string];
  strategy: string;
}
export const DEFENSE_TEMPLATES: readonly DefenseTemplate[] = [
  { id: 'goblin-basics', name: '哥布林接力', minLeague: 0, maxLeague: 3,
    troops: [6137,6044,6128,6045], roles: ['爆破前排','低费输出','双目标输出','绿色供魔'], strategy: '萨满供绿，哥布林以额外回合接力；优先打断萨满。' },
  { id: 'armored-knights', name: '骑士护甲', minLeague: 0, maxLeague: 3,
    troops: [6059,6029,6504,6062], roles: ['前排输出','护甲输出','叠甲供魔','蓝色供魔'], strategy: '女武神给前排充能，斯芬克斯叠甲强化圣骑士；破甲可削弱输出。' },
  { id: 'gated-rangers', name: '屏障游侠', minLeague: 0, maxLeague: 2,
    troops: [6396,6115,6044,6005], roles: ['屏障前排','群体输出','低费补刀','黄色供魔'], strategy: '矮人大门给后排屏障与法力，炼金术士给游侠供黄；先拆前排。' },
  { id: 'worm-engine', name: '岩虫后袭', minLeague: 0, maxLeague: 2,
    troops: [6396,6103,6103,6044], roles: ['屏障供魔','棕色循环','后排追击','低费补刀'], strategy: '双岩虫产棕并追击尾位，绿色哥布林补刀；保住尾位并切断棕色。' },
  { id: 'rowanne-armor', name: '罗万护甲', minLeague: 2, maxLeague: 6,
    troops: [6100,6087,6504,6638], roles: ['护甲前排','护甲群伤','叠甲供魔','启动爆破'], strategy: '圣殿骑士与斯芬克斯叠甲，罗万将护甲转成群伤；破甲或集火罗万；20级以下矮妖需要手动充能。' },
  { id: 'goblin-control', name: '哥布林干扰', minLeague: 3, maxLeague: 6,
    troops: [6784,6128,6783,6045], roles: ['爆破前排','双目标输出','沉默供魔','绿色供魔'], strategy: '弹琴手沉默核心、萨满喂绿，以额外回合推进；冻结能限制接力。' },
  { id: 'dragon-engine', name: '龙魂爆破', minLeague: 4, maxLeague: 7,
    troops: [6241,6236,6110,6062], roles: ['控制前排','爆破群伤','紫色供魔','蓝色供魔'], strategy: '女武神喂蓝、蜘蛛转紫给龙魂充能；优先控制龙魂，别让供魔链启动。' },
  { id: 'beetrix-loop', name: '蜂后循环', minLeague: 5, maxLeague: 9,
    troops: [6419,6863,6751,6638], roles: ['绿色供魔前排','真实群伤','半魔启动','启动爆破'], strategy: '森林巨魔倍增绿色供蜂后，马拉吉女王让森林巨魔半魔启动（蜂后不是元素）；蜂后连消会净化，优先切断供魔。' },
  { id: 'rowanne-fast', name: '罗万快速启动', minLeague: 5, maxLeague: 9,
    troops: [6751,6087,6504,6638], roles: ['半魔前排','护甲群伤','叠甲供魔','启动爆破'], strategy: '马拉吉女王给元素半魔，矮妖爆破启动罗万；破甲或集火输出位。' },
  { id: 'gobtruffle-loop', name: '蘑菇王接力', minLeague: 6, maxLeague: 9,
    troops: [6784,6759,6783,6204], roles: ['爆破前排','产绿群伤','沉默供魔','爆破支援'], strategy: '蘑菇王产绿、弹琴手充能并沉默，哥布林接力；冻结比单纯堆护甲有效。' },
  { id: 'skull-converters', name: '末日骷髅转换', minLeague: 7, maxLeague: 9,
    troops: [6604,6565,6594,6566], roles: ['狂怒骷髅前排','双转换','连消爆破','末日骷髅转换'], strategy: '怒火、冰龙与血锤串联转换，魔王连消爆破；留意红蓝黄的转换盘面。' },
  { id: 'zuul-execution', name: '祖尔处决', minLeague: 9, maxLeague: 9,
    troops: [6075,6529,6146,6638], roles: ['减伤爆破前排','单体处决','低费供魔','启动爆破'], strategy: '戈尔戈萨承伤，奴隶与矮妖给祖尔供魔；沉默供魔位并切断法力来源；祖尔免疫沉默，别把控制浪费在它身上。' },
];

/** PvP gets coordinated decks, not PvE Lv100 walls. Local tuning, not an official level table. */
export const PVP_LEVEL_BASES = [8,10,12,15,18,20,22,25,28,32] as const;

/** Compatibility exports: the shared evaluator profiles every troop, not just curated teams. */
export const arenaPickScore = strategyPickScore;
export const arrangeDraftDefense = arrangeStrategyDefense;

/** Broad pool complements curated synergy cores; special types/custom troops stay out of the generalist pool. */
const MAX_ADAPTIVE_RARITY = [1, 2, 2, 3, 3, 4, 4, 4, 5, 5] as const;
const KNOWN_MIN_LEAGUE = new Map<number, number>();
for (const template of DEFENSE_TEMPLATES) for (const id of template.troops) {
  KNOWN_MIN_LEAGUE.set(id, Math.min(KNOWN_MIN_LEAGUE.get(id) ?? 9, template.minLeague));
}
export function adaptiveDefensePool(league: number) {
  league = Math.min(9, Math.max(0, Math.floor(league)));
  return TROOPS.filter(t => {
    const p = troopStrategy(t.id);
    return t.kingdom !== COMMUNITY_KINGDOM && t.manaColors.length > 0
      && !t.troopTypes.some(type => ['Boss', 'Doom', 'Castle', 'Immortal', 'Gnome'].includes(type))
      && t.rarityIdx <= MAX_ADAPTIVE_RARITY[league]!
      && league >= (KNOWN_MIN_LEAGUE.get(t.id) ?? 0)
      && !p.dependencies.includes('mode')
      && (league >= 7 || !/吞噬|击杀/.test(t.spell.description))
      && (league >= 3 || !(p.generator && p.extraTurn));
  });
}
/** The rarity roll precedes synergy scoring, so a larger rarity bucket or a
 * globally optimal support does not dominate every generated lineup. */
export interface AdaptiveDefensePolicy {
  rarityWeights: readonly number[];
  sampleSize: number;
  jitter: number;
  exploration: number;
  requireManaSupport: boolean;
}
const DEFAULT_ADAPTIVE_POLICY: AdaptiveDefensePolicy = {
  rarityWeights: [1, 1, 1, 1, 1, 1], sampleSize: 24, jitter: 8,
  exploration: .15, requireManaSupport: false,
};
export function buildAdaptiveDefense(seed: number, league: number, level: number, policy = DEFAULT_ADAPTIVE_POLICY, eligibleTroop?: (troop: typeof TROOPS[number]) => boolean) {
  const rng = new SeededRNG(seed >>> 0);
  const pool = adaptiveDefensePool(league).filter(t => !eligibleTroop || eligibleTroop(t));
  // 半数防线按阵型模板成型：槽 1-3 命中模板定位风味的候选在 jitter 前加分（软偏好，
  // 官方卡一卡多职，主筛选仍是 strategyPickScore 的技能职责评分）；槽 0 锚位（伤害/骷髅）
  // 不受模板约束，最终站位仍由 arrangeStrategyDefense 重排。
  const comp = rng.next() < ROLE_COMP_CHANCE ? ROLE_COMPS[rng.nextInt(ROLE_COMPS.length)]! : null;
  const rarityChoices = (candidates: typeof pool) => {
    const buckets = policy.rarityWeights.map((weight, rarity) => ({
      weight, troops: candidates.filter(t => t.rarityIdx === rarity),
    })).filter(b => b.troops.length && b.weight > 0);
    let roll = rng.next() * buckets.reduce((sum, b) => sum + b.weight, 0);
    for (const bucket of buckets) {
      roll -= bucket.weight;
      if (roll < 0) return bucket.troops;
    }
    return buckets[buckets.length - 1]!.troops;
  };
  const outputs = rarityChoices(pool.filter(t => troopStrategy(t.id).damage || troopStrategy(t.id).skulls));
  const anchor = outputs[rng.nextInt(outputs.length)]!;
  const picked = [anchor.id];
  const context = { level, traitCount: enemyTraitCount(level), arena: false };
  for (let slot = 1; slot < 4; slot++) {
    let eligible = pool.filter(t => !picked.includes(t.id));
    // Keep an actual feed into the output anchor, not just a "generator" label.
    if (slot === 1 && policy.requireManaSupport) {
      const feeders = eligible.filter(t => manaLinkScore(t.id, anchor.id) > 0);
      if (feeders.length) eligible = feeders;
    }
    const slotFlavor = comp?.slots[slot]?.roles;
    const candidates = rarityChoices(eligible);
    const sample: { id: number; score: number }[] = [];
    const sampleSize = Math.min(policy.sampleSize, candidates.length);
    for (let n = 0; n < sampleSize; n++) {
      const [t] = candidates.splice(rng.nextInt(candidates.length), 1);
      let score = strategyPickScore(picked, t!.id, context) + rng.next() * policy.jitter;
      if (!picked.some(id => troopStrategy(id).generator) && troopStrategy(t!.id).generator) score += 9;
      if (slotFlavor && roleSlotAccepts(slotFlavor, t!.role)) score += 6;
      sample.push({ id: t!.id, score });
    }
    // A bounded random pick gives independently usable and baseline-profile
    // troops a route into the roster instead of always selecting the same cores.
    const explore = rng.next() < policy.exploration;
    if (!explore) sample.sort((a, b) => b.score - a.score);
    picked.push(sample[0]!.id);
  }
  const troops = arrangeStrategyDefense(picked, context) as [number, number, number, number];
  return {
    id: `adaptive-${troops.join('-')}`, name: '', troops,
    roles: troops.map(strategyRole) as [string, string, string, string],
    strategy: '稀有度加权抽样，检查输出、供魔方向与法力遮挡；半数按官方定位模板倾斜；仅供内部调参。',
  };
}
