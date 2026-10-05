import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { gsap } from 'gsap';
import { Container } from 'pixi.js';
import { attachBattleSpeed } from '@render/battleSpeedRuntime';
import { setBattleSpeed, setBattleSpeedBoost } from '@render/battleSpeed';
import { setBackgroundRunEnabled } from '@render/battlePrefs';

let detach: (() => void) | undefined;
beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  setBattleSpeedBoost(false);
  setBattleSpeed(1);
  detach = attachBattleSpeed({ getAnimations: () => [] } as unknown as Element);
});
afterEach(() => {
  gsap.globalTimeline.clear();
  detach?.();
  gsap.globalTimeline.clear();
  gsap.ticker.sleep();
  setBattleSpeed(1);
  vi.unstubAllGlobals();
});

describe('战斗倍速不复活已销毁的补间', () => {
  it('切换倍速不重新挂回已 kill 的待机/提示循环', () => {
    const tween = gsap.to({ x: 0 }, { x: 1, duration: 1, repeat: -1 });
    setBattleSpeed(2);
    expect(tween.timeScale()).toBe(.5);
    tween.kill();
    expect(tween.parent).toBeNull();
    setBattleSpeed(3);
    expect(tween.parent).toBeNull();
    expect(gsap.globalTimeline.getChildren()).not.toContain(tween);
  });

  it('离开战斗还原倍速时不复活旧循环', () => {
    const tween = gsap.to({ x: 0 }, { x: 1, duration: 1, repeat: -1 });
    setBattleSpeed(2);
    tween.kill();
    detach?.(); detach = undefined;
    expect(tween.parent).toBeNull();
  });

  it('已销毁 Pixi 精灵的提示补间不再写位置或中断动画帧', () => {
    const sprite = new Container();
    const tween = gsap.to(sprite, { y: 10, duration: 1, delay: 1, repeat: -1 });
    setBattleSpeed(2);
    tween.kill();
    sprite.destroy();
    expect(() => {
      setBattleSpeed(3);
      gsap.globalTimeline.render(tween.startTime() + .5, false, true);
    }).not.toThrow();
    expect(tween.parent).toBeNull();
  });

  it('存活的循环继续保持原速，普通演出仍跟随倍速', () => {
    const loop = gsap.to({ x: 0 }, { x: 1, duration: 1, repeat: -1 });
    const finite = gsap.to({ x: 0 }, { x: 1, duration: 1 });
    for (const speed of [2, 3, 1] as const) {
      setBattleSpeed(speed);
      expect(loop.timeScale() * gsap.globalTimeline.timeScale()).toBe(1);
      expect(finite.timeScale() * gsap.globalTimeline.timeScale()).toBe(speed);
    }
  });
});

describe('hidden-tab animations', () => {
  it('completes active finite visuals only when background running is enabled, even at 1x', () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
      },
      dispatchEvent: vi.fn(),
    });
    const visibility = { hidden: true };
    vi.stubGlobal('document', visibility);
    const animation = (endTime: number, state: 'running' | 'paused') => {
      const result = {
        playState: state as string,
        pending: false,
        playbackRate: 1,
        effect: { getComputedTiming: () => ({ endTime }) },
        finish: vi.fn(),
      };
      result.finish.mockImplementation(() => { result.playState = 'finished'; });
      return result;
    };
    const finite = animation(500, 'running');
    const paused = animation(500, 'paused');
    const infinite = animation(Infinity, 'running');
    const root = { getAnimations: () => [finite, paused, infinite] } as unknown as Element;
    const unmount = attachBattleSpeed(root);
    try {
      setBackgroundRunEnabled(false);
      gsap.ticker.tick();
      expect(finite.finish).not.toHaveBeenCalled();
      setBackgroundRunEnabled(true);
      visibility.hidden = false;
      gsap.ticker.tick();
      expect(finite.finish).not.toHaveBeenCalled();
      visibility.hidden = true;
      gsap.ticker.tick();
      expect(finite.finish).toHaveBeenCalledOnce();
      expect(paused.finish).not.toHaveBeenCalled();
      expect(infinite.finish).not.toHaveBeenCalled();
      gsap.ticker.tick();
      expect(finite.finish).toHaveBeenCalledOnce();
    } finally {
      unmount();
      setBackgroundRunEnabled(false);
    }
  });
});
