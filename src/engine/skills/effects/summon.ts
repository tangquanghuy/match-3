/**
 * 召唤与额外回合技能效果（战斗技能系统 · 需求 10.2, 10.3, 10.4）。
 *
 * - extraTurnEffect：使当前玩家保留回合（复用回合经济，需求 10.2），发 extra-turn 事件。
 * - summonEffect: fills up to four active slots; at four active troops the summon is a no-op.
 *
 * 纯逻辑：无 pixi/gsap/dom 依赖。
 */
import type { GameEvent, ExtraTurnEvent } from '../../events';
import type { Character } from '../../types';
import { PlayerSide } from '../../types';
import { MAX_ACTIVE_TEAM_SIZE, resolveDefeatEvents } from '../../teamRoster';
import type { EffectContext, EffectPrimitive } from './context';
import { attachPassives } from '../../traits';
import { findSide } from './context';
import { selectTargets } from '../targeting';
import { hasStatus } from './status';

/**
 * 额外回合效果（需求 10.2）。发 extra-turn 事件并（若引擎注入）保留当前玩家回合。
 */
export function extraTurnEffect(): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return [];
      const caster = ctx.state.teams[side].characters.find((c) => c.id === ctx.casterId);
      if (!caster || hasStatus(caster, 'frozen')) return [];
      ctx.grantExtraTurn?.();
      const ev: ExtraTurnEvent = { type: 'extra-turn', player: side, source: 'skill' };
      return [ev];
    },
  };
}


/** 兵种转化参数（「将一名随机敌人转化为怨灵」）：ref 经 resolveRef 映射模板，目标就地替换 */
export interface TransformTroopParams {
  targets: Character[];
  /** 目标兵种 referenceName（英文，同召唤引用）；与 randomOf 二选一 */
  ref?: string;
  /** 兵种族随机（「转化为一只随机龙族」）：候选集，rng 掷选后再映射 */
  randomOf?: string[];
  /**
   * 复制形态来源（R22 批，官方 TransformSelfFromTarget——8187「转化成一名敌人」）：给出时
   * 不走 ref/randomOf，模板 = 该目标模式解析出的**现存角色**快照（targets[0] 被就地改写成
   * 它的数值/技能/特质/法力色）。8187 = targets ['allySelf'(施法者)] + copyOf 'enemyChosen'。
   */
  copyOf?: Character[];
  /** 被转化成兵种 id（可选，供表现层取立绘） */
  troopId?: number;
  /** referenceName → 模板映射（由装配层注入；缺省用 ctx.resolveSummonRef） */
  resolveRef?: (referenceName: string) => SummonTemplate | null;
  fullMana?: boolean;
}

/** 从现存角色提取召唤模板（复制召唤 / TransformSelf 共用，R22 批）：
 *  剥离 id/defeated/statuses，生命回满、法力清零（官方复制体不继承阵亡/状态）。
 *  colors/traitIds/troopTypes 为**新建数组**——复制召唤的模板来自现存角色，
 *  浅拷贝会让复制体与本体共享可变数组（改一侧污染另一侧）。 */
function templateOf(char: Character): SummonTemplate {
  const { id: _id, defeated: _defeated, statuses: _statuses, ...rest } = char;
  void _id; void _defeated; void _statuses;
  return {
    ...rest,
    hp: char.maxHp,
    mana: 0,
    colors: [...char.colors],
    traitIds: [...(char.traitIds ?? [])],
    troopTypes: [...(char.troopTypes ?? [])],
  };
}

/**
 * 兵种转化：目标角色**就地替换**为模板兵种——保留 id 与编队位（不触发阵亡/召唤钩子，
 * 对齐官方「转化不是死亡」语义）；数值/技能/特质/法力色取模板，血量满、法力清零。
 * 无可解析模板或目标全灭时安全跳过。
 */
export function transformTroopEffect(params: TransformTroopParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const resolve = params.resolveRef ?? ctx.resolveSummonRef;
      // R22 批：copyOf 形态（TransformSelfFromTarget）模板来自现存角色，无需 ref 解析器
      const template: SummonTemplate | null = params.copyOf && params.copyOf.length > 0
        ? templateOf(params.copyOf[0])
        : (() => {
          if (!resolve) return null;
          // ref / randomOf 二选一：randomOf 先种子化掷选再映射（与 summon.randomOf 同语义）
          const refName = params.ref ?? (params.randomOf && params.randomOf.length > 0
            ? params.randomOf[ctx.rng.nextInt(params.randomOf.length)]
            : undefined);
          if (!refName) return null;
          return resolve(refName);
        })();
      if (!template) return [];
      const events: GameEvent[] = [];
      for (const target of params.targets) {
        if (target.defeated) continue;
        applyTransformTemplate(target, template);
        if (params.fullMana) target.mana = template.manaCost;
        const ev: GameEvent = { type: 'troop-transform', targetId: target.id, name: template.name,
          sourceSide: findSide(ctx.state, ctx.casterId) ?? undefined };
        if (params.troopId !== undefined) ev.troopId = params.troopId;
        events.push(ev);
      }
      return events;
    },
  };
}

/** Apply a troop template without changing its stable battle identity or slot. */
export function applyTransformTemplate(target: Character, template: SummonTemplate): void {
  target.name = template.name;
  target.maxHp = template.maxHp;
  target.hp = template.hp;
  target.attack = template.attack;
  target.armor = template.armor;
  target.magic = template.magic;
  target.colors = [...template.colors];
  target.manaCost = template.manaCost;
  target.mana = 0;
  target.skillId = template.skillId;
  target.traitIds = [...(template.traitIds ?? [])];
  target.troopTypes = [...(template.troopTypes ?? [])];
  target.kingdom = template.kingdom;
  target.statuses = [];
  attachPassives(target);
}

/** 队伍最大容量（与 4 人上限一致；队伍数组长度可小于此值时有空位） */
export const MAX_TEAM_SIZE = MAX_ACTIVE_TEAM_SIZE;

/** 召唤物属性模板（引擎所需数值属性；不含表现层字段） */
export type SummonTemplate = Omit<Character, 'id' | 'defeated' | 'statuses'>;

/**
 * 召唤物来源定义（需求 7.1）。每个召唤技能显式指定召唤谁：
 *   - template：直接给一份手写属性模板
 *   - ref：引用一个已有兵种 referenceName（由 resolveRef 映射为模板）
 *   - randomOf：候选 referenceName 集合，执行期用种子化 RNG 确定性选一个
 *   - randomOfKingdom：按王国随机（武器原语批 K-E，「召唤一名来自X王国的随机部队」）——
 *     执行期经 resolveKingdomSummonRefs 取该王国的兵种引用清单（troops.json kingdom 字段
 *     口径），再种子化掷选一条走 resolveRef 解析；清单为空/解析器缺省 → 安全跳过
 *     （官方语义 = 整个王国兵册均匀随机，运行时取册而非组装期快照清单）。
 */
export type SummonSource =
  | { template: SummonTemplate; troopId?: number }
  | { ref: string; troopId?: number }
  | { randomOf: string[]; troopId?: number }
  | { randomOfKingdom: string; troopId?: number };

export interface SummonParams {
  /** 召唤物来源 */
  source: SummonSource;
  /** 召唤数量区间（「召唤 1-3 名X」，rng 掷选；缺省 1；超过空位的部分失效） */
  countRange?: { min: number; max: number };
  /** 召唤成功后的站位；缺省 back（队尾），front 会在入场后推至队首。 */
  position?: 'front' | 'back';
  /**
   * referenceName → 召唤物模板的映射器（由装配层注入，来自 troops 数据）。
   * ref/randomOf 需要它；template 来源不需要。缺失或映射失败时安全跳过。
   */
  resolveRef?: (referenceName: string) => SummonTemplate | null;
  /** 被召唤兵种 id（troopId），供表现层取立绘/数据（可选） */
  troopId?: number;
}

/** 计算队伍中下一个新角色 id（现有最大 id + 1），保证确定性 */
function deriveCharId(ctx: EffectContext): number {
  if (ctx.nextCharId) return ctx.nextCharId();
  let max = 0;
  for (const side of ['Left', 'Right'] as const) {
    const team = ctx.state.teams[side];
    for (const c of team.characters) {
      if (c.id > max) max = c.id;
    }
    for (const queued of team.summonQueue ?? []) {
      if (queued.character.id > max) max = queued.character.id;
    }
  }
  return max + 1;
}

/**
 * 把召唤来源解析为具体属性模板（需求 7.1, 7.3, 7.4）。
 * template→直接用；ref→经 resolveRef 映射；randomOf→种子化选一个再映射；
 * randomOfKingdom→先经 resolveKingdomSummonRefs 取王国兵册再种子化选一个映射。
 * 无法解析返回 null（调用方安全跳过）。
 */
function resolveTemplate(params: SummonParams, ctx: EffectContext): SummonTemplate | null {
  const src = params.source;
  if ('template' in src) return src.template;
  if ('ref' in src) return params.resolveRef?.(src.ref) ?? null;
  // randomOfKingdom（K-E 批）：王国兵册清单 → 种子化掷选 → resolveRef 映射；
  // 映射器缺省 / 清单空（null 或 []）→ 安全跳过（rng 不消耗，与 ref 无解析器同口径）
  if ('randomOfKingdom' in src) {
    const refs = ctx.resolveKingdomSummonRefs?.(src.randomOfKingdom);
    if (!refs || refs.length === 0) return null;
    const pick = refs[ctx.rng.nextInt(refs.length)];
    return params.resolveRef?.(pick) ?? null;
  }
  // randomOf：确定性选取
  if (src.randomOf.length === 0) return null;
  const pick = src.randomOf[ctx.rng.nextInt(src.randomOf.length)];
  return params.resolveRef?.(pick) ?? null;
}

/** 把一只召唤物追加到编队末尾；满四人时召唤失效。
 *  position='front' 时先在末位入场，再发换位事件推至队首。
 *  summonEffect / summonCopyEffect（R22 批复制召唤）共用。 */
function appendSummon(
  team: import('../../types').Team,
  side: PlayerSide,
  template: SummonTemplate,
  troopId: number,
  ctx: EffectContext,
  events: GameEvent[],
  position: 'front' | 'back' = 'back',
): Character | null {
  if (team.characters.length >= MAX_ACTIVE_TEAM_SIZE) return null;
  const id = deriveCharId(ctx);
  const summoned: Character = {
    ...template, id, defeated: false, statuses: [],
    colors: [...template.colors], traitIds: [...(template.traitIds ?? [])],
    troopTypes: [...(template.troopTypes ?? [])],
  };
  attachPassives(summoned);
  team.characters.push(summoned);
  const slot = team.characters.length - 1;
  events.push({
    type: 'summon',
    player: side,
    slot,
    troopId,
    characterId: id,
    destination: 'field',
  });
  if (position === 'front' && slot > 0) {
    team.characters.pop();
    team.characters.unshift(summoned);
    events.push({ type: 'troop-reposition', targetId: id, to: 'front', index: 0 });
  }
  return summoned;
}

/**
 * Append a summon to the active bottom while below four characters.
 * A full active roster makes the summon portion a no-op.
 */
export function summonEffect(params: SummonParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const side = findSide(ctx.state, ctx.casterId) ?? ctx.casterSide ?? null; // P-F1-summon-after-caster-death: side captured at cast start
      if (side === null) return [];

      const template = resolveTemplate(params, ctx);
      if (template === null) return []; // 召唤物无法解析，安全跳过

      const team = ctx.state.teams[side];
      // Keep the active roster free of stale defeated entries. Normal engine flow removes
      // them at defeat time; this also preserves sane behavior for direct primitive tests.
      team.characters = team.characters.filter((character) => !character.defeated);

      const count = params.countRange
        ? params.countRange.min + ctx.rng.nextInt(Math.max(1, params.countRange.max - params.countRange.min + 1))
        : 1;
      const events: GameEvent[] = [];
      for (let i = 0; i < count; i++) {
        appendSummon(team, side, template, params.troopId ?? src_troopId(params.source), ctx, events, params.position);
      }
      return events;
    },
  };
}

/** 复制召唤参数（R22 批，官方 SummoningTarget(NoError)——8188「有 50% 的几率复制盟友」
 *  8190「复制那名敌人」8273「召唤首位敌人的卡牌」）：模板 = 目标模式解析出的现存角色
 *  快照（满血、零法力、无状态），走与普通召唤相同的编队/队列管线。 */
export interface SummonCopyParams {
  /** 被复制的目标（由 targeting 产出；取首个存活者） */
  targets: Character[];
}

export function summonCopyEffect(params: SummonCopyParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const side = findSide(ctx.state, ctx.casterId) ?? ctx.casterSide ?? null; // P-F1-summon-after-caster-death: side captured at cast start
      if (side === null) return [];
      const source = params.targets.find((c) => !c.defeated);
      if (!source) return [];
      const team = ctx.state.teams[side];
      team.characters = team.characters.filter((character) => !character.defeated);
      const events: GameEvent[] = [];
      appendSummon(team, side, templateOf(source), -1, ctx, events);
      return events;
    },
  };
}

// —— 自复活/凤凰涅槃（Sunbird「浴火重生」官方 "Die and rise from the Ashes"）——

/**
 * 自复活规格（被动 PassiveModifiers.selfRevive 与段级 selfRevive 段共用）：
 *   - chance：触发概率（0~1），缺省 1（官方「Die and rise from the Ashes」必发）；
 *   - healPct：复活回血到 maxHp 的百分比，缺省 0.5（向上取整，至少 1 点）；
 *   - full：满血复活（覆盖 healPct；官方 Sunbird 涅槃 = 满血归来）；
 *   - fullMana：复活同时法力回满（deepsoul「复活并恢复全部魔力」口径）。
 */
export interface SelfReviveSpec {
  chance?: number;
  healPct?: number;
  full?: boolean;
  fullMana?: boolean;
}

export interface SelfReviveParams extends SelfReviveSpec {
  /** 复活目标（通常为施法者本人；处死亡态 = defeated 或 hp≤0 才生效） */
  targets: Character[];
}

/** 把一名处于死亡态的角色原位复活：清 defeated、按规格回血（发 buff 事件；回血为
 *  「复活到指定值」语义，不经治疗管线——出血禁疗/疾病减半不拦截复活）。 */
function reviveOne(target: Character, spec: SelfReviveSpec): GameEvent[] {
  const events: GameEvent[] = [];
  const hpBefore = target.hp;
  const pct = Math.min(1, Math.max(0, spec.healPct ?? 0.5));
  const revivedHp = spec.full === true ? target.maxHp : Math.ceil(target.maxHp * pct);
  target.defeated = false;
  target.hp = Math.min(target.maxHp, Math.max(1, revivedHp));
  if (target.hp > hpBefore) {
    events.push({ type: 'buff', targetId: target.id, stat: 'hp', amount: target.hp - hpBefore });
  }
  if (spec.fullMana === true && target.mana < target.manaCost) {
    const gained = target.manaCost - target.mana;
    target.mana = target.manaCost;
    events.push({ type: 'buff', targetId: target.id, stat: 'mana', amount: gained });
  }
  return events;
}

/**
 * 自复活效果段（「凤凰涅槃浴火重生」）：把处死亡态（defeated 或 hp≤0）的目标原位复活。
 * 段级主消费路径是**施法内拦截**：executePrototype 扫到 selfRevive 段后，本次施法中施法者
 * 被击杀的 defeat 事件在出编队前即被撤销并复活（见 resolveDefeatAfterRevive 的 castRevive
 * 通道）；段本体执行时施法者通常已复活（无事发生、零事件、零随机消耗）。
 */
export function selfReviveEffect(params: SelfReviveParams): EffectPrimitive {
  return {
    apply(): GameEvent[] {
      const events: GameEvent[] = [];
      for (const target of params.targets) {
        if (!target.defeated && target.hp > 0) continue;
        events.push(...reviveOne(target, {
          chance: 1,
          healPct: params.healPct,
          full: params.full,
          fullMana: params.fullMana,
        }));
      }
      return events;
    },
  };
}

/** 在场角色查找（含 defeated——复活对象此刻仍带着阵亡标记待出编队） */
function findOnField(state: import('../../GameState').GameState, characterId: number): Character | null {
  for (const side of [PlayerSide.Left, PlayerSide.Right]) {
    const found = state.teams[side].characters.find((c) => c.id === characterId);
    if (found) return found;
  }
  return null;
}

/**
 * 出编队统一口（自复活拦截 + resolveDefeatEvents）：defeat 事件先过自复活判定——
 *   1) castRevive 通道：本次施法带 selfRevive 段时，施法者被击杀按段规格复活（官方
 *      「Die and rise from the Ashes」= 施法中死亡必复活，chance 缺省 1 不掷签）；
 *   2) 被动通道：阵亡者持有 selfRevive 被动（Phoenix 涅槃族）按其 chance 掷签（<1 时经
 *      同一条种子化 rng；无 selfRevive 角色零 rng 消耗）。
 * 掷中 → 不走 defeat 路径：defeat 事件从事件流剔除（死亡扫描/阵亡钩子不触发），原位
 * 回血复活并发 buff 事件；未掷中或无规格 → 原样走 resolveDefeatEvents（出编队 + 队列补位）。
 */
export function resolveDefeatAfterRevive(
  state: import('../../GameState').GameState,
  produced: readonly GameEvent[],
  rng: { next(): number } | null,
  castRevive?: { casterId: number } & SelfReviveSpec,
): GameEvent[] {
  if (!produced.some((e) => e.type === 'defeat')) return resolveDefeatEvents(state, produced);
  const revived = new Set<number>();
  const filtered: GameEvent[] = [];
  for (const ev of produced) {
    if (ev.type === 'defeat' && !revived.has(ev.characterId)) {
      const spec = reviveSpecFor(state, ev.characterId, castRevive, rng);
      if (spec) {
        const fallen = findOnField(state, ev.characterId);
        if (fallen) {
          revived.add(fallen.id);
          filtered.push(...reviveOne(fallen, spec));
          continue;
        }
      }
    }
    filtered.push(ev);
  }
  return resolveDefeatEvents(state, filtered);
}

/** defeat 事件的自复活规格裁定（castRevive 段级标记优先，其次被动；掷签失败返回 null） */
function reviveSpecFor(
  state: import('../../GameState').GameState,
  characterId: number,
  castRevive: ({ casterId: number } & SelfReviveSpec) | undefined,
  rng: { next(): number } | null,
): SelfReviveSpec | null {
  if (castRevive && castRevive.casterId === characterId) {
    const chance = castRevive.chance ?? 1;
    // 段级标记即「死亡被撤销」语义；chance ≥1 不掷签（零随机消耗），<1 经同一条 rng
    return chance >= 1 || (rng !== null && rng.next() < chance) ? castRevive : null;
  }
  const fallen = findOnField(state, characterId);
  if (!fallen) return null;
  const spec = fallen.passive?.selfRevive;
  if (!spec) return null;
  const chance = spec.chance ?? 1;
  return chance >= 1 || (rng !== null && rng.next() < chance) ? spec : null;
}

/** 从来源取可选 troopId（表现层用） */
function src_troopId(src: SummonSource): number {
  return src.troopId ?? -1;
}

/** 调位参数（「将一名敌人击回末位」「移至队伍首位」） */
export interface RepositionParams {
  targets: Character[];
  to: 'front' | 'back';
}

/**
 * 调位：改编队顺序（front=插到队首、back=移到队尾），影响 enemyFront/enemyFirstN 等
 * 目标序。多目标按倒序处理保持下标稳定。发 troop-reposition 事件供表现层调卡面顺序。
 */
export function repositionEffect(params: RepositionParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const events: GameEvent[] = [];
      for (const target of [...params.targets].reverse()) {
        if (target.defeated) continue;
        const side = findSide(ctx.state, target.id);
        if (side === null) continue;
        const team = ctx.state.teams[side];
        const idx = team.characters.indexOf(target);
        if (idx < 0) continue;
        team.characters.splice(idx, 1);
        if (params.to === 'front') team.characters.unshift(target);
        else team.characters.push(target);
        // 事件按实际搬动顺序发出。表现层逐条把卡滑到 index，顺序反了就会滑错。
        events.push({
          type: 'troop-reposition',
          targetId: target.id,
          to: params.to,
          index: team.characters.indexOf(target),
        });
      }
      return events;
    },
  };
}

/** 乱序参数（「打乱敌方队伍」）：整队 Fisher-Yates 重排（种子化确定性） */
export interface TeamShuffleParams {
  side: 'ally' | 'enemy';
}

export function shuffleTeamEffect(params: TeamShuffleParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const mySide = findSide(ctx.state, ctx.casterId);
      if (mySide === null) return [];
      const side = params.side === 'enemy'
        ? mySide === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left
        : mySide;
      const team = ctx.state.teams[side];
      if (team.characters.length < 2) return [];
      for (let i = team.characters.length - 1; i > 0; i--) {
        const j = ctx.rng.nextInt(i + 1);
        const tmp = team.characters[i];
        team.characters[i] = team.characters[j];
        team.characters[j] = tmp;
      }
      return [{ type: 'team-shuffle', player: side, order: team.characters.map((c) => c.id) }];
    },
  };
}

/** 交换编队位（R22 批，官方 Swap 句式——7555「再使他们交换位置」7992「使首位和末位敌人
 *  交换位置」）：两个目标模式各解析出一名存活者（须同队、不同人），交换其编队索引。
 *  任一侧解析失败/同队同目标 → 安全跳过。发既有 troop-reposition 事件（表现层调卡面序）。 */
export interface SwapPositionsParams {
  a: import('../targeting').TargetMode;
  b: import('../targeting').TargetMode;
}

export function swapPositionsEffect(params: SwapPositionsParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const pick = (mode: import('../targeting').TargetMode): Character | null => {
        const targets = selectTargets(mode, ctx.state, ctx.casterId, ctx.rng, 1, ctx.chosenTargetId, undefined, ctx.castTracking?.formationAtCastStart);
        return targets.length > 0 ? targets[0] : null;
      };
      const a = pick(params.a);
      const b = pick(params.b);
      if (!a || !b || a.id === b.id) return [];
      const sideA = findSide(ctx.state, a.id);
      const sideB = findSide(ctx.state, b.id);
      if (sideA === null || sideB === null || sideA !== sideB) return [];
      const team = ctx.state.teams[sideA];
      const ia = team.characters.indexOf(a);
      const ib = team.characters.indexOf(b);
      if (ia < 0 || ib < 0) return [];
      team.characters[ia] = b;
      team.characters[ib] = a;
      return [
        { type: 'troop-reposition', targetId: a.id, to: ib === team.characters.length - 1 ? 'back' : 'front', index: ib },
        { type: 'troop-reposition', targetId: b.id, to: ia === team.characters.length - 1 ? 'back' : 'front', index: ia },
      ];
    },
  };
}
