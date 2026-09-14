/**
 * 顶部风暴指示器（阶段 2 演出）· 合成事件单元测试。
 *
 * 引擎侧风暴机制仍在并行分支（d-storm-engine）开发、尚未发出 storm-change，
 * 端到端打通前在这里直接构造合成 StormChangeEvent 喂给表现层纯逻辑
 * （stormChangePlan 演出决策 / stormIndicatorSlot 通道槽位几何），
 * 锁死三类事件的演出行为；浏览器视觉走查由编排方在引擎合并后负责。
 * （vitest 为 node 环境，StormIndicator 的 DOM 外壳只测未挂载时的安全空转。）
 */
import { describe, expect, it } from 'vitest';
import { BaseColor, PlayerSide } from '@engine/types';
import type { StormChangeEvent } from '@engine/events';
import { AnimConfig } from '@render/AnimationConfig';
import {
  STORM_BURST_FX,
  STORM_BURST_HOLD_SECONDS,
  STORM_FADE_SECONDS,
  STORM_GEM_URL,
  STORM_GLOW_COLOR,
  StormIndicator,
  stormChangePlan,
  stormIndicatorSlot,
} from '@render/StormIndicator';

const ALL_COLORS = Object.values(BaseColor);

// —— 合成事件构造（与 src/engine/events.ts 的 StormChangeEvent 契约同形）——

function evSet(player: PlayerSide, color: BaseColor): StormChangeEvent {
  return { type: 'storm-change', player, color, reason: 'set' };
}

function evReplacedNew(player: PlayerSide, color: BaseColor, prevColor: BaseColor): StormChangeEvent {
  return { type: 'storm-change', player, color, reason: 'replaced', prevColor };
}

/** 被顶方收到的事件：color=null 的 replaced（全场唯一风暴被另一方顶掉） */
function evReplacedTopped(player: PlayerSide, prevColor: BaseColor): StormChangeEvent {
  return { type: 'storm-change', player, color: null, reason: 'replaced', prevColor };
}

function evExpired(player: PlayerSide, prevColor: BaseColor): StormChangeEvent {
  return { type: 'storm-change', player, color: null, reason: 'expired', prevColor };
}

describe('stormChangePlan · set（风暴首次生效）', () => {
  it('六种颜色均：弹入 + 对应色 group_hit 爆发 FX + 复用召唤音效', () => {
    for (const color of ALL_COLORS) {
      const plan = stormChangePlan(evSet(PlayerSide.Left, color));
      expect(plan.action).toBe('show');
      expect(plan.color).toBe(color);
      expect(plan.reason).toBe('set');
      expect(plan.summonSfx).toBe(true);
      expect(plan.burstFx).toBe(STORM_BURST_FX[color]);
      const fx = AnimConfig.frameFX[plan.burstFx ?? ''];
      expect(fx).toBeDefined();
      expect(fx.frames).toBeGreaterThan(0);
      // 时间线预留必须盖住爆发 FX 的完整时长，否则指示器弹入未完成就推进下一事件
      expect(plan.holdSeconds).toBeGreaterThanOrEqual(fx.duration / 1000);
    }
  });

  it('爆发预留取各色 group_hit 最长时长，且明显长于淡出', () => {
    expect(STORM_BURST_HOLD_SECONDS).toBeGreaterThan(0.4);
    expect(STORM_BURST_HOLD_SECONDS).toBeGreaterThan(STORM_FADE_SECONDS);
  });

  it('施放方 side 原样透传（左/右）', () => {
    expect(stormChangePlan(evSet(PlayerSide.Left, BaseColor.Purple)).player).toBe(PlayerSide.Left);
    expect(stormChangePlan(evSet(PlayerSide.Right, BaseColor.Red)).player).toBe(PlayerSide.Right);
  });
});

describe('stormChangePlan · replaced（风暴顶替）', () => {
  it('新风暴（color 非 null）→ 弹入 + 色系爆发，但不叠加召唤音效', () => {
    const plan = stormChangePlan(evReplacedNew(PlayerSide.Right, BaseColor.Blue, BaseColor.Purple));
    expect(plan.action).toBe('show');
    expect(plan.color).toBe(BaseColor.Blue);
    expect(plan.reason).toBe('replaced');
    expect(plan.summonSfx).toBe(false);
    expect(plan.burstFx).toBe('group_hit_blue');
    expect(plan.holdSeconds).toBeGreaterThanOrEqual(
      AnimConfig.frameFX.group_hit_blue.duration / 1000,
    );
  });

  it('被顶方（color=null）→ 指示器淡出，无爆发无音效', () => {
    const plan = stormChangePlan(evReplacedTopped(PlayerSide.Left, BaseColor.Purple));
    expect(plan.action).toBe('hide');
    expect(plan.color).toBeNull();
    expect(plan.summonSfx).toBe(false);
    expect(plan.burstFx).toBeNull();
    expect(plan.holdSeconds).toBe(STORM_FADE_SECONDS);
  });

  it('己方同色系替换（后召顶先召）→ 同侧弹入新色', () => {
    const plan = stormChangePlan(evReplacedNew(PlayerSide.Left, BaseColor.Green, BaseColor.Green));
    expect(plan).toMatchObject({ action: 'show', player: PlayerSide.Left, color: BaseColor.Green });
  });
});

describe('stormChangePlan · expired（计数器归零）', () => {
  it('→ 指示器淡出，无爆发无音效', () => {
    const plan = stormChangePlan(evExpired(PlayerSide.Right, BaseColor.Yellow));
    expect(plan.action).toBe('hide');
    expect(plan.color).toBeNull();
    expect(plan.reason).toBe('expired');
    expect(plan.summonSfx).toBe(false);
    expect(plan.burstFx).toBeNull();
    expect(plan.holdSeconds).toBe(STORM_FADE_SECONDS);
    expect(plan.holdSeconds).toBeGreaterThan(0);
  });
});

describe('stormChangePlan · 事件序列（全场唯一风暴语义）', () => {
  it('右方顶替左方：被顶方先淡出，施放方再弹入', () => {
    const plans = [
      evReplacedTopped(PlayerSide.Left, BaseColor.Purple),
      evReplacedNew(PlayerSide.Right, BaseColor.Green, BaseColor.Purple),
    ].map(stormChangePlan);
    expect(plans[0]).toMatchObject({ action: 'hide', player: PlayerSide.Left });
    expect(plans[1]).toMatchObject({
      action: 'show',
      player: PlayerSide.Right,
      color: BaseColor.Green,
    });
  });

  it('一次完整生命周期：set → expired 各自产生一次弹入/淡出', () => {
    const plans = [
      evSet(PlayerSide.Left, BaseColor.Brown),
      evExpired(PlayerSide.Left, BaseColor.Brown),
    ].map(stormChangePlan);
    expect(plans[0]).toMatchObject({ action: 'show', color: BaseColor.Brown, summonSfx: true });
    expect(plans[1]).toMatchObject({ action: 'hide', player: PlayerSide.Left });
  });
});

describe('stormIndicatorSlot · 顶部 44px HUD 通道槽位几何', () => {
  const layout = {
    leftColumnX: 8,
    rightColumnX: 482,
    columnWidth: 142,
    laneTop: 4,
    laneHeight: 44,
  };

  it('左队 → 通道左侧（贴左队伍列），右队 → 通道右侧（贴右队伍列）', () => {
    const left = stormIndicatorSlot(PlayerSide.Left, layout);
    const right = stormIndicatorSlot(PlayerSide.Right, layout);
    expect(left).toEqual({ left: 8, top: 4, width: 142, height: 44 });
    expect(right.left).toBe(482);
    expect(left.left).toBeLessThan(right.left);
  });

  it('双方槽位都与回合 HUD 同一水平带（棋盘上缘之上，不遮第一行宝石）', () => {
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      const slot = stormIndicatorSlot(side, layout);
      expect(slot.top).toBeGreaterThanOrEqual(0);
      // laneTop(4) + laneHeight(44) = 棋盘上缘（boardTop）
      expect(slot.top + slot.height).toBeLessThanOrEqual(layout.laneTop + layout.laneHeight);
      expect(slot.height).toBeLessThanOrEqual(44);
    }
  });
});

describe('调色板与素材映射', () => {
  it('光晕色、宝石贴图、爆发 FX 覆盖全部六种基础色', () => {
    for (const color of ALL_COLORS) {
      expect(STORM_GLOW_COLOR[color]).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(STORM_GEM_URL[color].length).toBeGreaterThan(0);
      expect(STORM_BURST_FX[color]).toMatch(/^group_hit_/);
      expect(AnimConfig.frameFX[STORM_BURST_FX[color]]).toBeDefined();
    }
  });
});

describe('StormIndicator · 未挂载 DOM（node 环境）时安全空转', () => {
  it('show/hide/hideAll/destroy 不抛错，活动状态保持为空', () => {
    const indicator = new StormIndicator();
    expect(() => {
      indicator.show(BaseColor.Blue, PlayerSide.Left);
      indicator.hide(PlayerSide.Left);
      indicator.hideAll();
      indicator.destroy();
    }).not.toThrow();
    expect(indicator.getActiveSide()).toBeNull();
    expect(indicator.getActiveColor()).toBeNull();
    expect(indicator.activeCenter()).toBeNull();
  });
});
