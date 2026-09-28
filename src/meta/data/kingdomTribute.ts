/**
 * 各王国的进贡配比（1 级、非主城时一次命中的基数）。
 *
 * official = true 的 20 国取自 GoW 官方基数（社区整理的 1.0.8 进贡表，与官方帮助中心
 * 「破碎尖塔 200 金 8 魂、阿达纳 175 金 2 荣耀 4 魂」一致）。其余王国官方未公开或
 * 不在当时的表里，按王国题材设计（矮人/地精/帝国偏黄金，亡灵/恶魔偏灵魂，神圣/妖精偏荣耀），
 * 保证三种货币都有「专精王国」可选作主城。
 *
 * 实际产出 = 基数 × 等级倍率 × 主城倍率；灵魂另乘 TRIBUTE.soulScale（见 economy.ts）。
 */
import {
  TRIBUTE,
  tributeAmountScale,
  tributeGloryScale,
} from './economy';

export interface TributeProfile {
  gold: number;
  souls: number;
  glory: number;
  /** true = GoW 官方基数 */
  official: boolean;
}

const P = (gold: number, souls: number, glory: number, official = false): TributeProfile => ({ gold, souls, glory, official });

export const TRIBUTE_PROFILES: Readonly<Record<string, TributeProfile>> = {
  // —— GoW 官方基数（黄金 / 灵魂 / 荣耀） ——
  破碎尖塔: P(200, 8, 0, true),
  阿达纳: P(175, 4, 2, true),
  卡拉考斯: P(50, 24, 2, true),
  蛛尔卡里: P(0, 20, 5, true),
  卜筮之原: P(50, 8, 6, true),
  鳞雾沼泽: P(125, 20, 0, true),
  荆棘森林: P(75, 24, 1, true),
  白盔国: P(0, 0, 10, true),
  潘神之谷: P(25, 4, 8, true),
  盖塔尔: P(0, 40, 0, true),
  卡其尔: P(250, 0, 0, true),
  齐埃金: P(150, 4, 3, true),
  荣耀之地: P(100, 12, 4, true),
  加尔凡尼亚: P(50, 32, 0, true),
  剑锋崖: P(125, 0, 5, true),
  风暴峡湾: P(200, 0, 2, true),
  毛格瑞姆森林: P(150, 8, 2, true),
  葛洛什奈克: P(0, 32, 2, true),
  狂野平原: P(50, 0, 8, true),
  黑石: P(100, 16, 2, true),
  // —— 设计值（按题材） ——
  混沌: P(25, 24, 6),
  聚沙之地: P(150, 4, 3),
  荒芜之地: P(25, 32, 0),
  冰峰之巅: P(50, 12, 6),
  天启: P(0, 36, 4),
  狮心帝国: P(175, 4, 4),
  龙爪: P(200, 8, 2),
  守护者: P(0, 4, 10),
  黑鹰: P(200, 0, 3),
  玉银林地: P(50, 16, 6),
  日冕: P(100, 4, 8),
  厄什卡亚: P(125, 12, 2),
  藏宝库: P(225, 4, 0),
  梅兰堤斯: P(150, 8, 2),
  圣唐: P(100, 8, 5),
  皓彩森林: P(50, 20, 4),
  卓克祖: P(225, 4, 0),
  迈纳杰之罪: P(25, 40, 0),
  沃尔帕克: P(75, 12, 6),
  诺斯: P(50, 24, 2),
  地狱悬崖: P(50, 28, 2),
  午夜城市: P(125, 16, 0),
};

/** 表外王国（数据新增时）的兜底配比：均衡型 */
const FALLBACK = P(100, 12, 3);

export function tributeProfileOf(kingdom: string): TributeProfile {
  return TRIBUTE_PROFILES[kingdom] ?? FALLBACK;
}

export type TributeSpecialty = 'gold' | 'souls' | 'glory' | 'mixed';

/**
 * 王国的进贡专长（按「黄金 : 灵魂×5 : 荣耀×20」折算后占比 ≥ 60% 的那一项）。
 * 用于地图 / 弹层上的一眼标签，例如「灵魂之国」。
 */
export function tributeSpecialtyOf(kingdom: string): TributeSpecialty {
  const p = tributeProfileOf(kingdom);
  const weights = { gold: p.gold, souls: p.souls * 5, glory: p.glory * 20 };
  const total = weights.gold + weights.souls + weights.glory;
  if (total <= 0) return 'mixed';
  const [top, value] = (Object.entries(weights) as Array<[TributeSpecialty, number]>).sort((a, b) => b[1] - a[1])[0]!;
  return value / total >= 0.6 ? top : 'mixed';
}

export interface TributeYield {
  gold: number;
  souls: number;
  glory: number;
}

/** 某王国在 level 级、是否主城时一次命中的产出 */
export function tributeYield(kingdom: string, level: number, home = false): TributeYield {
  const p = tributeProfileOf(kingdom);
  const scale = tributeAmountScale(level);
  const glory = tributeGloryScale(level);
  const mult = home ? TRIBUTE.homeMultiplier : 1;
  return {
    gold: Math.round(p.gold * scale) * mult,
    souls: Math.round(p.souls * TRIBUTE.soulScale * scale) * mult,
    glory: Math.round(p.glory * glory) * mult,
  };
}
