import { afterEach, describe, it, expect } from 'vitest';
import { normalizeStatusKey, SAMPLE_STATUS_KEYS, STATUS_CUE_SYNTHS } from '../../src/render/StatusSynth';
import { registerAudioForTest, resetAudioBankForTest } from '../../src/render/audioBank';
import {
  BARRIER_STATUS_ID,
  CHARM_STATUS_IDS,
  CONTROL_STATUS_IDS,
  CURSE_STATUS_IDS,
  DEATH_MARK_STATUS_IDS,
  DOT_STATUS_IDS,
  FAERIE_FIRE_STATUS_ID,
  MANA_BURN_STATUS_IDS,
  MARK_STATUS_ID,
  RAGE_STATUS_IDS,
  TERROR_STATUS_ID,
  UNTARGETABLE_STATUS_IDS,
  WEB_STATUS_ID,
  WOLF_STATUS_IDS,
} from '../../src/engine/skills/effects/status';
import { AudioManager, BATTLE_SFX_URLS, STATUS_SAMPLE_URLS } from '../../src/render/AudioManager';

/** 最小 Web Audio mock：只实现合成路径用到的方法；指数包络喂非正值时抛错（锁包络合法性）。 */
class FakeParam {
  value = 0;
  private requirePositive(v: number, kind: string): void {
    if (!(v > 0)) throw new Error(`${kind} requires a positive value, got ${v}`);
  }
  setValueAtTime(v: number, _t: number): void {
    this.requirePositive(v, 'setValueAtTime');
  }
  exponentialRampToValueAtTime(v: number, _t: number): void {
    this.requirePositive(v, 'exponentialRampToValueAtTime');
  }
}

/** 记录节点创建数与连线次数的假 AudioContext（node 测试环境，无 DOM）。 */
function makeCtx(): {
  ctx: unknown;
  created: () => number;
  connects: () => number;
} {
  let count = 0;
  let links = 0;
  const connect = () => {
    links += 1;
  };
  const param = () => new FakeParam();
  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    destination: {},
    state: 'running',
    createGain: () => {
      count += 1;
      return { gain: param(), connect };
    },
    createOscillator: () => {
      count += 1;
      return { type: '', frequency: param(), connect, start: () => {}, stop: () => {} };
    },
    createBiquadFilter: () => {
      count += 1;
      return { type: '', frequency: param(), Q: param(), connect };
    },
    createBufferSource: () => {
      count += 1;
      return { buffer: null as unknown, connect, start: () => {}, stop: () => {}, addEventListener: () => {} };
    },
    createBuffer: (_channels: number, length: number, _rate: number) => {
      count += 1;
      return { getChannelData: () => new Float32Array(Math.max(1, length)) };
    },
  };
  return { ctx, created: () => count, connects: () => links };
}


/** 状态施加音 = status/ 目录采样，或 poison/burning/frozen 三个技能采样 */
const hasApplySound = (id: string): boolean => {
  const key = normalizeStatusKey(id);
  return key in STATUS_SAMPLE_URLS || SAMPLE_STATUS_KEYS.includes(key);
};

describe('状态施加音映射（status-apply 事件 → 采样）', () => {
  it('引擎已落地的全部状态 id（含别名形态）都有采样', () => {
    const landedIds = [
      ...DOT_STATUS_IDS,
      ...CONTROL_STATUS_IDS,
      ...CURSE_STATUS_IDS,
      ...DEATH_MARK_STATUS_IDS,
      ...RAGE_STATUS_IDS,
      ...CHARM_STATUS_IDS,
      ...WOLF_STATUS_IDS,
      ...MANA_BURN_STATUS_IDS,
      ...UNTARGETABLE_STATUS_IDS,
      WEB_STATUS_ID,
      BARRIER_STATUS_ID,
      MARK_STATUS_ID,
      FAERIE_FIRE_STATUS_ID,
      TERROR_STATUS_ID,
      'stun',
      'disease',
    ];
    expect(landedIds.length).toBeGreaterThan(15);
    for (const id of landedIds) expect(hasApplySound(id), `状态 ${id} 缺施加音`).toBe(true);
  });

  it('status/ 目录 17 个采样全部就位且键名规范', () => {
    expect(Object.keys(STATUS_SAMPLE_URLS).sort()).toEqual([
      'barrier', 'bleed', 'charm', 'curse', 'death_mark', 'disease', 'entangle', 'faerie_fire',
      'mana_burn', 'marked', 'rage', 'silence', 'stun', 'submerged', 'terror', 'web', 'wolf',
    ].sort());
  });

  it('别名收敛为规范键', () => {
    expect(normalizeStatusKey('death-mark')).toBe('death_mark');
    expect(normalizeStatusKey('Death_Mark')).toBe('death_mark');
    expect(normalizeStatusKey('cursed')).toBe('curse');
    expect(normalizeStatusKey('enraged')).toBe('rage');
    expect(normalizeStatusKey('charmed')).toBe('charm');
    expect(normalizeStatusKey('lycanthropy')).toBe('wolf');
    expect(normalizeStatusKey('wolf-form')).toBe('wolf');
    expect(normalizeStatusKey('mana-burn')).toBe('mana_burn');
  });

  it('全部状态采样都在战斗预载清单里', () => {
    for (const url of Object.values(STATUS_SAMPLE_URLS)) expect(BATTLE_SFX_URLS).toContain(url);
  });
});

describe('状态演出提示音合成（mock AudioContext）', () => {
  it('全部提示音可无异常播放且产生节点/连线（包络恒正）', () => {
    for (const [key, synth] of Object.entries(STATUS_CUE_SYNTHS)) {
      const { ctx, created, connects } = makeCtx();
      expect(() => (synth as (c: unknown, b: unknown, t: number) => void)(ctx, {}, 0), `提示音 ${key}`).not.toThrow();
      expect(created(), `提示音 ${key} 节点数`).toBeGreaterThan(0);
      expect(connects(), `提示音 ${key} 连线数`).toBeGreaterThan(0);
    }
  });
});

describe('AudioManager.playStatusApply 接线', () => {
  afterEach(() => resetAudioBankForTest());

  function wiredManager(preload = true): { am: AudioManager; created: () => number; ctx: { currentTime: number } } {
    if (preload) for (const url of BATTLE_SFX_URLS) registerAudioForTest(url, { duration: 1 } as AudioBuffer);
    const am = new AudioManager();
    const { ctx, created } = makeCtx();
    const slot = am as unknown as Record<string, unknown>;
    slot.ctx = ctx;
    slot.sfxBus = (ctx as { createGain: () => unknown }).createGain();
    const baseline = created();
    return { am, created: () => created() - baseline, ctx: ctx as { currentTime: number } };
  }

  it('状态采样与技能采样状态都发声', () => {
    const { am, created, ctx } = wiredManager();
    am.playStatusApply('curse');
    expect(created()).toBeGreaterThan(0);
    for (const [i, id] of ['poison', 'burning', 'frozen'].entries()) {
      ctx.currentTime = 0.5 * (i + 1);
      const before = created();
      am.playStatusApply(id);
      expect(created(), id).toBeGreaterThan(before);
    }
  });

  it('采样未预载时直接抛错，不回退合成音', () => {
    const { am } = wiredManager(false);
    expect(() => am.playStatusApply('curse')).toThrow(/音效未预载/);
  });

  it('未知状态与静音状态零节点', () => {
    const { am, created } = wiredManager();
    am.playStatusApply('nonexistent');
    expect(created()).toBe(0);
    am.muted = true;
    am.playStatusApply('charm');
    expect(created()).toBe(0);
  });

  it('同键 0.18s 节流：全队施加同一状态只响一次', () => {
    const { am, created } = wiredManager();
    am.playStatusApply('curse');
    const afterFirst = created();
    am.playStatusApply('curse');
    expect(created()).toBe(afterFirst);
  });

  it('全局 0.12s 间隔：AoE 批量施加多个不同状态也只响一声（防混响）', () => {
    const { am, created, ctx } = wiredManager();
    am.playStatusApply('curse');
    const afterFirst = created();
    am.playStatusApply('charm');
    am.playStatusApply('bleed');
    expect(created()).toBe(afterFirst);
    ctx.currentTime = 0.5;
    am.playStatusApply('charm');
    expect(created()).toBeGreaterThan(afterFirst);
  });
});
