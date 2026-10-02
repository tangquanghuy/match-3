/**
 * 敌方职责配队模板池 —— 阵型骨架由「职责（duty）」描述，官方 role 只作风味偏好。
 *
 * 设计口径（与用户约定，2026-10-02 修正版）：
 *  - **官方卡不是单一职责**：定位标签只是主职能，Defender 里有纯墙也有护甲转输出的
 *    Rowanne 型，Generator 常带 AoE。因此槽位匹配以**卡实际会做什么**为准——
 *    由 troopStrategy 从技能文本解析的伤害/供魔/辅助标志 + 池内相对坦度判定；
 *    官方定位退居同职责候选内的偏好排序（筛空即回落，不构成约束）。
 *  - **一半概率**成阵：调用方先掷 `rng.next() < ROLE_COMP_CHANCE`，未成阵走原有档位随机。
 *  - **职责是偏好不是硬约束**：某槽位在本王国+稀有度带内没有合格者时退回原候选池
 *    （小王国池天然安全，最坏退化为改造前行为）。
 *  - **不搞死板**：模板间差异拉开——玻璃炮无前排、双前排堡垒、供魔手打头阵等；
 *    槽序即站位序（1 号位=前排）。
 *
 * 纯数据模块：禁 DOM、禁引擎依赖；随机掷点由调用方（encounter.ts / opponentTeams.ts）完成。
 */

import type { TroopRole } from '../../data/troops';

/** 槽位职责：卡的实际功能，来自技能文本解析与属性（encounter.ts 实现判定） */
export type CompDuty = 'front' | 'damage' | 'mana' | 'sustain' | 'any';

/** 槽位风味：单一定位、多选一（输出|刺客）或省略（不限定位） */
export type RoleSlot = TroopRole | readonly TroopRole[];

export interface CompSlot {
  duty: CompDuty;
  /** 官方定位偏好（软约束，仅在同职责合格者内排序用） */
  roles?: RoleSlot;
}

export interface RoleCompTemplate {
  /** 内部标识（调试/测试指认用，不进 UI） */
  id: string;
  /** 阵型思路（内部注释用） */
  name: string;
  /** 恰好 4 槽，下标即站位（0 = 前排） */
  slots: readonly CompSlot[];
}

/** 成阵概率：一半敌人按职责配队，其余保持纯随机 */
export const ROLE_COMP_CHANCE = 0.5;

export const ROLE_COMPS: readonly RoleCompTemplate[] = [
  { id: 'balanced-advance', name: '均衡进攻：前排吸收伤害，双输出清场，辅助兜底', slots: [
    { duty: 'front', roles: 'Defender' }, { duty: 'damage', roles: 'Striker' }, { duty: 'damage', roles: ['Striker', 'Assassin'] }, { duty: 'sustain', roles: 'Support' },
  ] },
  { id: 'twin-carry', name: '双核输出：前排开路，两个输出自由搭配，供魔续航', slots: [
    { duty: 'front', roles: 'Defender' }, { duty: 'damage' }, { duty: 'damage', roles: ['Striker', 'Assassin'] }, { duty: 'mana', roles: 'Generator' },
  ] },
  { id: 'spell-battery', name: '法术炮台：前排拖时间，双法系轰击，供魔供弹药', slots: [
    { duty: 'front', roles: 'Defender' }, { duty: 'damage', roles: 'Mage' }, { duty: 'damage', roles: ['Mage', 'Warlock'] }, { duty: 'mana', roles: 'Generator' },
  ] },
  { id: 'curse-grind', name: '诅咒消耗：战士顶前排，双术士磨血，辅助续命', slots: [
    { duty: 'front', roles: 'Warrior' }, { duty: 'damage', roles: 'Warlock' }, { duty: 'damage', roles: 'Warlock' }, { duty: 'sustain', roles: 'Support' },
  ] },
  { id: 'all-out', name: '全攻阵：无前排的三输出速攻，供魔在后排推节奏', slots: [
    { duty: 'damage' }, { duty: 'damage', roles: 'Striker' }, { duty: 'damage' }, { duty: 'mana', roles: 'Generator' },
  ] },
  { id: 'bulwark', name: '重装壁垒：双前排拖后期，术士消耗+辅助维持', slots: [
    { duty: 'front', roles: 'Defender' }, { duty: 'front', roles: 'Defender' }, { duty: 'damage', roles: 'Warlock' }, { duty: 'sustain', roles: 'Support' },
  ] },
  { id: 'headhunt', name: '斩首刺杀：战士压阵，双刺客点名收割，辅助补状态', slots: [
    { duty: 'front', roles: 'Warrior' }, { duty: 'damage', roles: 'Assassin' }, { duty: 'damage', roles: 'Assassin' }, { duty: 'sustain', roles: 'Support' },
  ] },
  { id: 'legion', name: '统帅军团：统帅吃团队加成，双输出线推进，辅助收尾', slots: [
    { duty: 'front', roles: 'Warmaster' }, { duty: 'damage', roles: 'Striker' }, { duty: 'damage', roles: 'Warrior' }, { duty: 'sustain', roles: 'Support' },
  ] },
  { id: 'mana-engine', name: '供魔引擎：供魔手打头阵喂法力，双核心自由开火', slots: [
    { duty: 'mana', roles: 'Generator' }, { duty: 'damage', roles: ['Striker', 'Mage'] }, { duty: 'damage', roles: ['Striker', 'Mage'] }, { duty: 'any' },
  ] },
  { id: 'brute-warband', name: '战士蛮冲：双战士平推，输出补刀，末位自由', slots: [
    { duty: 'front', roles: 'Warrior' }, { duty: 'damage', roles: 'Warrior' }, { duty: 'damage', roles: 'Striker' }, { duty: 'any' },
  ] },
];

/** 候选部队的官方 role 是否满足槽位风味（无风味/无 role 恒真，交由职责层把关） */
export function roleSlotAccepts(slot: RoleSlot | undefined, role: TroopRole | null): boolean {
  if (!slot) return true;
  if (!role) return false;
  return typeof slot === 'string' ? slot === role : slot.includes(role);
}
