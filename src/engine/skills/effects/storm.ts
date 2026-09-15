/**
 * 风暴效果原语（引擎原语批 · DECISIONS 翻案记录②，`scripts/spell-rules.md` §风暴）。
 *
 * 「召唤/创造/发起一场X风暴」= 技能效果段 `{ kind: 'storm' }`，经本模块落到 `Team.storm`。
 * 风暴是全场唯一的全局掉落修正（后召顶替先召，不分敌我）：**设置裁定只有一份**——
 * `applyStormToTeam` 即 TurnEngine.setStormFromSummon 的本体（死亡召唤/开局风暴/调试台/
 * 技能效果段四处共用），保证「技能造风暴」与既有路径的事件形态、顶替语义逐字节一致。
 *
 * 颜色风暴加权对应色掉率；骷髅系风暴（骸骨/末日/超级末日）带 dropKind，加权作用于骷髅系
 * 掉落（见 types.ts SkullStormDropKind 与 GravitySystem）。事件复用既有 `storm-change`。
 * 纯逻辑：无 pixi/gsap/dom 依赖；无随机消耗（风暴设置本身不掷签）。
 */
import type { GameEvent, StormChangeEvent } from '../../events';
import type { GameState } from '../../GameState';
import { PlayerSide, opponentOf, BaseColor } from '../../types';
import type { SkullStormDropKind } from '../../types';
import type { EffectContext, EffectPrimitive } from './context';
import { findSide } from './context';

/** 官方风暴持续回合（3.0 补丁说明：8 回合，双方各 4；DECISIONS「风暴」节查证结论） */
export const DEFAULT_STORM_TURNS = 8;

/** 一次风暴设置的完整载荷（写入 Team.storm 的形态） */
export interface StormPayload {
  color: BaseColor;
  turns: number;
  troopId: number;
  /** 骷髅系风暴（骸骨/末日/超级末日）：掉落加权目标；缺省 = 颜色风暴 */
  dropKind?: SkullStormDropKind;
}

/**
 * 把一场风暴设到 `side` 一方（全场唯一/后召顶替先召，TurnEngine 与技能效果段共用）：
 *   - 对方已有风暴 → 先给对方发 color:null 的 'replaced'（表现层撤指示器）；
 *   - 己方已有风暴 → 己方发 reason:'replaced'（prevColor=旧色）；
 *   - 全场无风暴 → reason:'set'。
 * 事件形态与 TurnEngine.setStormFromSummon 原实现逐字节一致（该函数现在是本函数的薄委托）。
 */
export function applyStormToTeam(
  state: GameState,
  side: PlayerSide,
  payload: StormPayload,
): StormChangeEvent[] {
  const own = state.teams[side];
  const other = state.teams[opponentOf(side)];
  const events: StormChangeEvent[] = [];

  const ownPrevColor = own.storm?.color;
  const otherPrevColor = other.storm?.color;
  // 全场唯一：先顶掉对方的风暴（若有），对方收 color=null 的 replaced
  if (other.storm) {
    const evicted: StormChangeEvent = {
      type: 'storm-change', player: opponentOf(side), color: null,
      reason: 'replaced', prevColor: otherPrevColor!,
    };
    events.push(evicted);
    other.storm = undefined;
  }
  const prevColor = ownPrevColor ?? otherPrevColor;
  own.storm = {
    color: payload.color, turns: payload.turns, troopId: payload.troopId,
    dropKind: payload.dropKind,
  };
  const ev: StormChangeEvent = {
    type: 'storm-change', player: side, color: payload.color,
    reason: prevColor === undefined ? 'set' : 'replaced',
  };
  if (prevColor !== undefined) ev.prevColor = prevColor;
  // 骷髅系风暴（骸骨/末日/超级末日）：事件带掉落目标，表现层据此换贴图/光晕色
  if (payload.dropKind) ev.dropKind = payload.dropKind;
  events.push(ev);
  return events;
}

/** 技能侧造风暴的虚拟 troopId 号段（与 TurnEngine.debugSetStorm 同口径，供表现层查表兜底） */
export function skillStormTroopId(color: BaseColor): number {
  return 9900 + Object.values(BaseColor).indexOf(color);
}

export interface StormEffectParams {
  color: BaseColor;
  /** 持续回合；缺省 8（官方口径） */
  turns?: number;
  dropKind?: SkullStormDropKind;
}

/**
 * 构建「创造风暴」效果原语：施法方获得一场风暴（全场唯一，顶替既有风暴）。
 * 不经目标选择、不消耗随机数；施法者不在场（找不到方）时安全跳过。
 */
export function stormEffect(params: StormEffectParams): EffectPrimitive {
  return {
    apply(ctx: EffectContext): GameEvent[] {
      const side = findSide(ctx.state, ctx.casterId);
      if (side === null) return [];
      const turns = Math.max(1, Math.floor(params.turns ?? DEFAULT_STORM_TURNS));
      return applyStormToTeam(ctx.state, side, {
        color: params.color,
        turns,
        troopId: skillStormTroopId(params.color),
        dropKind: params.dropKind,
      });
    },
  };
}
