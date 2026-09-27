/** Community team-building heuristics, not a combat simulator or exhaustive combo database.
 * Every troop has a baseline profile; conditional/opaque mechanics stay explicitly flagged.
 * Arena never reads trait benefits. Sources: docs/GOW-TEAM-STRATEGY.md.
 */
import { TROOPS, getTroopById, type TroopData } from '../../data/troops';
import { troopStatsAtLevel } from '../../data/leveling';
import { BaseColor } from '../../engine/types';

export interface StrategyContext { level: number; traitCount: number; arena: boolean }
export const ARENA_STRATEGY: StrategyContext = { level: 15, traitCount: 0, arena: true };
export interface TroopStrategy {
  troopId: number;
  damage: boolean;
  multiTarget: boolean;
  trueDamage: boolean;
  generator: boolean;
  generatedColors: readonly BaseColor[];
  broadMana: boolean;
  skulls: boolean;
  armorSupport: boolean;
  armorScaling: boolean;
  support: boolean;
  control: boolean;
  traitControl: boolean;
  extraTurn: boolean;
  dependencies: readonly string[];
  /** Baseline means only data role/stats are known; do not invent a special combo. */
  coverage: 'spell-heuristic' | 'baseline';
}
const COLOR_WORDS: readonly [string, BaseColor][] = [
  ['红', BaseColor.Red], ['绿', BaseColor.Green], ['蓝', BaseColor.Blue],
  ['黄', BaseColor.Yellow], ['紫', BaseColor.Purple], ['棕', BaseColor.Brown],
];
export function buildTroopStrategy(t: TroopData): TroopStrategy {
  const text = t.spell.description;
  const colors = new Set<BaseColor>();
  // Read conversion OUTPUTS, not input colors; explosion colors are not output restrictions.
  for (const clause of text.split(/[。；.!;]/)) {
    const output = /转换(?:为|成)(.*)/.exec(clause)?.[1]
      ?? /(?:创造|创建|生成)(.*)/.exec(clause)?.[1];
    if (output) for (const [word, color] of COLOR_WORDS) {
      if (new RegExp(word + '色(?:的)?(?:宝石)?').test(output)) colors.add(color);
    }
  }
  const broadMana = /爆破|爆炸|摧毁[^。；]*宝石/.test(text);
  const damage = /(?:对|向)[^。；]*敌[^。；]*(?:伤害|击杀)|(?:吞噬|击杀)[^。；]*敌/.test(text);
  const skulls = /(?:创造|创建|转换为|转换成)[^。；]*骷髅/.test(text);
  const armorSupport = /(?:给予|给|使)[^。；]*盟友[^。；]*护甲/.test(text);
  const armorScaling = /伤害[^。；]*自身的护甲/.test(text);
  const support = armorSupport || /(?:给予|给|治疗|净化|祝福)[^。；]*盟友|召唤/.test(text);
  const control = /沉默|冻结|缠绕|法力流失|减少[^。；]*法力/.test(text);
  const traitControl = /眩晕/.test(text);
  const generator = broadMana || colors.size > 0 || /(?:给予|给)[^。；]*盟友[^。；]*法力/.test(text);
  const dependencies: string[] = [];
  if (/增强[^。；]*黄金|黄金[^。；]*增强|金币/.test(text)) dependencies.push('gold');
  if (/增强[^。；]*灵魂|灵魂[^。；]*增强/.test(text)) dependencies.push('souls');
  if (/如果|若是|若有|几率|概率/.test(text)) dependencies.push('conditional');
  if (/猎人(?:印记|标记)|中毒[^。；]*双倍|燃烧[^。；]*双倍/.test(text)) dependencies.push('status');
  if (/高塔|攻城|首领/.test(text)) dependencies.push('mode');
  if (/盟友[^。；]*增强|增强[^。；]*盟友/.test(text)) dependencies.push('ally-composition');
  return {
    troopId: t.id, damage, generator, generatedColors: [...colors], broadMana, skulls,
    multiTarget: /所有敌人|全体敌人|散射|溅射|前两名|最后两名/.test(text),
    trueDamage: /真实.*伤害/.test(text), armorSupport, armorScaling, support, control, traitControl,
    extraTurn: /额外回合/.test(text), dependencies,
    coverage: damage || generator || skulls || support || control || traitControl ? 'spell-heuristic' : 'baseline',
  };
}
const PROFILES = new Map(TROOPS.map(t => [t.id, buildTroopStrategy(t)]));
export function troopStrategy(id: number): TroopStrategy {
  const found = PROFILES.get(id);
  if (!found) throw new Error(`Unknown troop strategy: ${id}`);
  return found;
}
export function strategyCoverage() {
  const profiles = [...PROFILES.values()];
  return {
    total: profiles.length,
    spellHeuristic: profiles.filter(p => p.coverage === 'spell-heuristic').length,
    baselineIds: profiles.filter(p => p.coverage === 'baseline').map(p => p.troopId),
    conditionalIds: profiles.filter(p => p.dependencies.length > 0).map(p => p.troopId),
  };
}
function activeTraits(t: TroopData, ctx: StrategyContext) {
  return ctx.arena ? [] : t.traits.slice(0, ctx.traitCount);
}
/** Only spell-produced colors are matched to the receiver's mana; no six-color bonus fetish. */
export function manaLinkScore(sourceId: number, receiverId: number): number {
  const source = troopStrategy(sourceId), receiver = getTroopById(receiverId)!;
  if (!source.generator) return 0;
  return source.broadMana ? 2 : source.generatedColors.filter(c => receiver.manaColors.includes(c)).length * 3;
}
export function strategyPickScore(picked: readonly number[], candidateId: number, ctx = ARENA_STRATEGY): number {
  const t = getTroopById(candidateId)!;
  const p = troopStrategy(candidateId), stats = troopStatsAtLevel(t, Math.min(ctx.level, 20));
  const covered = new Set(picked.flatMap(id => getTroopById(id)!.manaColors));
  const fresh = t.manaColors.filter(c => !covered.has(c)).length;
  const profiles = picked.map(troopStrategy);
  // Arena favors independently useful damage. Do not assume future picks or a trait-based opener.
  let score = (p.damage ? 9 : 0) + (p.multiTarget && p.damage ? 2 : 0) + (p.trueDamage ? 1 : 0)
    + (p.skulls ? 3 : 0) + (p.extraTurn ? 1.5 : 0) + (p.control || !ctx.arena && p.traitControl ? 1 : 0)
    + (stats.attack + stats.magic) * .12 - t.manaCost * .3;
  score += fresh * 2 - (fresh === 0 && picked.length > 0 ? 3 : 0);
  if (!profiles.some(q => q.damage) && p.damage) score += 4;
  if (!ctx.arena && !profiles.some(q => q.generator) && p.generator) score += 4;
  // Generating colors nobody uses does not earn a synergy bonus.
  for (const id of picked) {
    score += (manaLinkScore(candidateId, id) + manaLinkScore(id, candidateId)) * (ctx.arena ? .6 : 1);
    const q = troopStrategy(id);
    if (p.armorSupport && q.armorScaling || q.armorSupport && p.armorScaling) score += ctx.arena ? 2 : 5;
  }
  score -= p.dependencies.length * (ctx.arena ? 1.5 : 1);
  const traits = activeTraits(t, ctx);
  if (traits.some(trait => trait.code === 'empowered')) score += p.generator ? 4 : 1;
  // Exact known trait synergy; type is checked, not inferred from the portrait/name.
  if (!ctx.arena && ctx.traitCount >= 3) {
    if (candidateId === 6751) score += picked.filter(id => getTroopById(id)!.troopTypes.includes('Elemental')).length * 3;
    if (picked.includes(6751) && t.troopTypes.includes('Elemental')) score += 3;
  }
  return score;
}
/** Position score accounts for the UNION of all troops above a slot, not just the front card. */
export function defenseOrderScore(ids: readonly number[], ctx = ARENA_STRATEGY): number {
  let score = 0;
  const blockedColors = new Set<BaseColor>();
  ids.forEach((id, index) => {
    const t = getTroopById(id)!, stats = troopStatsAtLevel(t, Math.min(ctx.level, 20));
    const p = troopStrategy(id);
    const blocked = t.manaColors.filter(c => blockedColors.has(c)).length;
    if (index === 0) {
      score += (stats.health + stats.armor) * .2 + stats.attack * .5;
      if (activeTraits(t, ctx).some(trait => /降低来自骷髅头的伤害/.test(trait.description))) score += 5;
    }
    score -= blocked * 1.5;
    if (blocked === t.manaColors.length && index > 0) score -= p.damage || p.generator ? 5 : 2;
    for (const c of t.manaColors) blockedColors.add(c);
  });
  return score;
}
export function arrangeStrategyDefense(ids: readonly number[], ctx = ARENA_STRATEGY): number[] {
  if (ids.length < 2) return [...ids];
  let best = [...ids], bestScore = defenseOrderScore(ids, ctx);
  function visit(prefix: number[], remaining: number[]) {
    if (remaining.length === 0) {
      const score = defenseOrderScore(prefix, ctx);
      if (score > bestScore) { best = prefix; bestScore = score; }
      return;
    }
    remaining.forEach((id, i) => visit([...prefix, id], remaining.filter((_, j) => i !== j)));
  }
  visit([], [...ids]); // Four troops: at most 24 permutations. Never inspect the player's team.
  return best;
}
export function strategyRole(id: number): string {
  const p = troopStrategy(id);
  if (p.damage && p.generator) return '输出供魔';
  if (p.damage) return p.multiTarget ? '群体输出' : '单体输出';
  if (p.generator) return '法力支援';
  if (p.skulls) return '骷髅转换';
  if (p.control || p.traitControl) return '控制辅助';
  if (p.support) return '生存支援';
  return '基础战力';
}
