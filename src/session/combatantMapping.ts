/**
 * 宿主快照 ↔ 引擎角色的映射（需求 2.1、2.3；设计 §4）。
 *
 * 引擎内部只认本场分配的 numeric id，宿主只认 `externalId`。这一层是唯一的翻译处：
 * 别处不应再自行拼 id，否则结果回传会错位。
 */
import { PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';
import { MAX_ACTIVE_TEAM_SIZE } from '@engine/teamRoster';
import type { BattleRequest, BattleSideName, CombatantSnapshot } from './contract';

/** 宿主侧的 player/enemy 与引擎的 Left/Right 一一对应，且不允许反向假设。 */
export const SIDE_OF_NAME: Record<BattleSideName, PlayerSide> = {
  player: PlayerSide.Left,
  enemy: PlayerSide.Right,
};

export const NAME_OF_SIDE: Record<PlayerSide, BattleSideName> = {
  [PlayerSide.Left]: 'player',
  [PlayerSide.Right]: 'enemy',
};

/**
 * 内部 id 分配：player 占 0..3、enemy 占 4..7，与既有占位队伍一致。
 * 召唤物由引擎的 idGen 从更高号段继续发号，不会与这里冲突。
 */
export function internalIdFor(side: BattleSideName, index: number): number {
  return (side === 'player' ? 0 : MAX_ACTIVE_TEAM_SIZE) + index;
}

/** 本场的双向 id 映射。 */
export interface CombatantIdMap {
  externalIdOf(internalId: number): string | undefined;
  internalIdOf(externalId: string): number | undefined;
  sideOf(internalId: number): BattleSideName | undefined;
  snapshotOf(internalId: number): CombatantSnapshot | undefined;
  /** 按下发顺序列出 [内部 id, 快照, 所属方] */
  entries(): { internalId: number; snapshot: CombatantSnapshot; side: BattleSideName }[];
}

/** 把一个快照转成引擎角色。战斗开始时法力为 0、无状态、未阵亡。 */
export function snapshotToCharacter(snapshot: CombatantSnapshot, internalId: number): Character {
  return {
    id: internalId,
    name: snapshot.name,
    maxHp: snapshot.stats.hp,
    hp: snapshot.initialHp ?? snapshot.stats.hp,
    ...(snapshot.eventTarget ? { eventTarget: snapshot.eventTarget } : {}),
    ...(snapshot.eventRarity !== undefined ? { eventRarity: snapshot.eventRarity } : {}),
    attack: snapshot.stats.attack,
    armor: snapshot.stats.armor,
    magic: snapshot.stats.magic,
    colors: [...snapshot.manaColors],
    manaCost: snapshot.manaCost,
    mana: 0,
    // 分拣引擎已在 App.init 里对 tier 快照补齐 skillId/traitIds；'' 仅为类型兜底，
    // 带着空 skillId 进场会在校验层（missing-field / unknown-skill）被拦截。
    skillId: snapshot.skillId ?? '',
    statuses: [],
    defeated: false,
    // 特质透传；被动修正由 TurnEngine 在战斗开始时编译（见 engine/traits.ts）
    traitIds: [...(snapshot.traitIds ?? [])],
    // 种族透传；族亲光环按它筛选受益对象
    troopTypes: [...(snapshot.troopTypes ?? [])],
    // 王国透传（Wave4 批）；kingdomOf 条件与 alliesOf/enemiesOfKingdom 来源按它筛选。
    // 可选字段：快照未携带时不写键（该角色不属于任何王国）。
    ...(snapshot.kingdom !== undefined ? { kingdom: snapshot.kingdom } : {}),
    ...(snapshot.kingdomId !== undefined ? { kingdomId: snapshot.kingdomId } : {}),
    // 武器淬炼等级透传（素材批 2026-09-19）；tempering 来源 modifier 按它计数。缺省不写键。
    ...(snapshot.temperingLevel !== undefined ? { temperingLevel: snapshot.temperingLevel } : {}),
    // 技能/特质显示文本透传（素材批追补）：详情面板与卡面兜底。缺省不写键。
    ...(snapshot.spellName !== undefined ? { spellName: snapshot.spellName } : {}),
    ...(snapshot.spellDescription !== undefined ? { spellDescription: snapshot.spellDescription } : {}),
    ...(snapshot.traitNames !== undefined ? { traitNames: snapshot.traitNames } : {}),
    ...(snapshot.displayTraitIds !== undefined ? { displayTraitIds: snapshot.displayTraitIds } : {}),
  };
}

export interface MappedTeams {
  playerTeam: Team;
  enemyTeam: Team;
  idMap: CombatantIdMap;
}

/**
 * 把已校验的 request 转成引擎队伍 + id 映射。
 * 只接受校验通过的 request：这里不再重复做范围/注册检查。
 */
export function mapRequestToTeams(request: BattleRequest): MappedTeams {
  const records: { internalId: number; snapshot: CombatantSnapshot; side: BattleSideName }[] = [];
  const build = (side: BattleSideName, snapshots: readonly CombatantSnapshot[]): Team => {
    const characters = snapshots.map((snapshot, index) => {
      const internalId = internalIdFor(side, index);
      records.push({ internalId, snapshot, side });
      return snapshotToCharacter(snapshot, internalId);
    });
    return { player: SIDE_OF_NAME[side], characters };
  };

  const playerTeam = build('player', request.playerTeam);
  const enemyTeam = build('enemy', request.enemyTeam);

  const byInternal = new Map(records.map((r) => [r.internalId, r]));
  const byExternal = new Map(records.map((r) => [r.snapshot.externalId, r.internalId]));

  const idMap: CombatantIdMap = {
    externalIdOf: (internalId) => byInternal.get(internalId)?.snapshot.externalId,
    internalIdOf: (externalId) => byExternal.get(externalId),
    sideOf: (internalId) => byInternal.get(internalId)?.side,
    snapshotOf: (internalId) => byInternal.get(internalId)?.snapshot,
    entries: () => records.map((r) => ({ ...r })),
  };

  return { playerTeam, enemyTeam, idMap };
}
