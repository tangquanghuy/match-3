/**
 * 种族（troopTypes）中文词表 —— UX 阶段 B 窗口 N 新建的单源。
 *
 * 由来：`10-events.md` E-4 ⑤ 实测世界事件页把本周加成种族原样输出为英文 `Daemon`，
 * 与 `04-troop.md` 的 `TYPE_CN` 缺条目是同一处缺口。原表在
 * `screens/teamScreen.ts`（窗口 O 名下）且缺 5 个条目，本文件把词表提成 data 层单源：
 *  - 补齐 troops.json 实际出现的全部 33 个 troopTypes（脚本对齐，零缺失）；
 *  - 区分**真种族**与**机制标记**（Boss/Castle/Doom 不是种族，是官方的战斗角色标记），
 *    让「按种族配队」的活动不会派一个 `Doom` 当加成种族。
 *
 * 台账：teamScreen.ts 的 TYPE_CN 待窗口 O 改为引用本文件（顺带修 Wargare 的误译
 * 「鱼人」→「狼族」；Merfolk 才是人鱼）。本窗口不改 O 的文件。
 */

/** 机制标记（官方把它们混在 troopTypes 里，但它们不是种族） */
export const NON_RACE_TYPES: readonly string[] = ['Boss', 'Castle', 'Doom'];

/** troopTypes → 中文（键为官方英文原词，覆盖 troops.json 全量 33 条） */
export const RACE_NAMES: Record<string, string> = {
  Beast: '野兽', Centaur: '半人马', Construct: '构装', Daemon: '恶魔', Divine: '神圣',
  Dragon: '龙', Dwarf: '矮人', Elemental: '元素', Elf: '精灵', Fey: '妖精',
  Giant: '巨人', Gnome: '侏儒', Goblin: '地精', Human: '人类', Immortal: '不朽',
  Knight: '骑士', Mech: '机械', Merfolk: '人鱼', Monster: '怪物', Mystic: '法师',
  Naga: '娜迦', Orc: '兽人', Raksha: '罗刹', Rogue: '盗贼', Stryx: '鸦人',
  OtherworldVisitor: '异界来客',
  Tauros: '牛族', Undead: '亡灵', Urska: '熊族', Wargare: '狼族', Wildfolk: '野民',
  // —— 机制标记（非种族，但会出现在 troopTypes 里，需要可显示） ——
  Boss: '首领', Castle: '城塞', Doom: '末日',
};

/** 单个 troopType 的中文（未知词原样回退，不造假） */
export function raceName(type: string): string {
  return RACE_NAMES[type] ?? type;
}

/** 多个 troopType 连写（部队卡的种族行） */
export function raceNames(types: readonly string[]): string {
  return types.map(raceName).join('/');
}

/** 是否真种族（活动加成种族候选、按种族筛选用） */
export function isRaceType(type: string): boolean {
  return !NON_RACE_TYPES.includes(type);
}
