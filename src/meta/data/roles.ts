/**
 * 部队定位（官方 TroopRole）中文词表与图标映射 —— 职责配队窗口新建的单源。
 *
 * 由来：troops.json 全量 1800 部队自带官方 role（构建自 gowhead `_TroopRole_parsed`），
 * 但仓库此前零消费。本文件给出统一译名与图标键：
 *  - 译名用社区攻略词（与 troopStrategy 的 输出/供魔 词汇、docs/GOW-TEAM-STRATEGY.md
 *    的 输出/供魔/保护/增益 口径对齐），统一两字便于筛选 chip 排版；
 *  - 官方 zh 本地化（击杀者/生成者/防御/支持）直译感重，弃用；weapons.json 里的
 *    roleName 官方名仅作旧数据回退；
 *  - 图标全部复用现有图标库（chrome.icon() 可解析 gameIcons/battleIcons），不引新资源。
 */

import type { TroopRole } from '../../data/troops';

/** 展示顺序：防守/输出核心在前，功能位居中，小众定位殿后 */
export const ROLE_ORDER: readonly TroopRole[] = [
  'Defender', 'Striker', 'Generator', 'Support',
  'Mage', 'Warlock', 'Assassin', 'Warrior', 'Warmaster',
];

/** 官方 role → 中文（社区攻略词，统一两字） */
export const ROLE_NAMES: Record<TroopRole, string> = {
  Defender: '坦克',
  Striker: '输出',
  Generator: '供魔',
  Support: '辅助',
  Mage: '法师',
  Warlock: '术士',
  Assassin: '刺客',
  Warrior: '战士',
  Warmaster: '统帅',
};

/** role → 图标键（经 shell/chrome.icon() 解析） */
export const ROLE_ICONS: Record<TroopRole, string> = {
  Defender: 'shield',
  Striker: 'swords',
  Generator: 'crystal',
  Support: 'heart',
  Mage: 'sparkles',
  Warlock: 'swirl',
  Assassin: 'skull',
  Warrior: 'barbute',
  Warmaster: 'crown',
};

/** 单个 role 的中文；空安全，未知词原样回退不造假 */
export function roleNameZh(role: string | null | undefined): string | null {
  if (!role) return null;
  return ROLE_NAMES[role as TroopRole] ?? role;
}
