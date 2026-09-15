import { describe, it, expect } from 'vitest';
import {
  canonicalStatusSoundId,
  SAMPLE_STATUS_KEYS,
  STATUS_SYNTHS,
} from '../../src/render/StatusSynth';
import {
  BARRIER_STATUS_ID,
  CHARM_STATUS_IDS,
  CONTROL_STATUS_IDS,
  CURSE_STATUS_IDS,
  DEATH_MARK_STATUS_IDS,
  DOT_STATUS_IDS,
  MANA_BURN_STATUS_IDS,
  MARK_STATUS_ID,
  RAGE_STATUS_IDS,
  UNTARGETABLE_STATUS_IDS,
  WEB_STATUS_ID,
  WOLF_STATUS_IDS,
} from '../../src/engine/skills/effects/status';
import { AudioManager } from '../../src/render/AudioManager';

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
      return { buffer: null as unknown, connect, start: () => {}, stop: () => {} };
    },
    createBuffer: (_channels: number, length: number, _rate: number) => {
      count += 1;
      return { getChannelData: () => new Float32Array(Math.max(1, length)) };
    },
  };
  return { ctx, created: () => count, connects: () => links };
}

describe('状态施加音映射（status-apply 事件 → 音效）', () => {
  it('覆盖引擎已落地的全部状态 id（含别名形态）', () => {
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
      'stun',
      'disease',
    ];
    expect(landedIds.length).toBeGreaterThan(15);
    for (const id of landedIds) {
      expect(canonicalStatusSoundId(id), `状态 ${id} 缺施加音`).not.toBeNull();
    }
  });

  it('未知/未落地状态返回 null（静默）', () => {
    expect(canonicalStatusSoundId('nonexistent')).toBeNull();
    expect(canonicalStatusSoundId('fear')).toBeNull();
    expect(canonicalStatusSoundId('')).toBeNull();
  });

  it('别名收敛为规范键', () => {
    expect(canonicalStatusSoundId('death-mark')).toBe('death_mark');
    expect(canonicalStatusSoundId('Death_Mark')).toBe('death_mark');
    expect(canonicalStatusSoundId('cursed')).toBe('curse');
    expect(canonicalStatusSoundId('enraged')).toBe('rage');
    expect(canonicalStatusSoundId('charmed')).toBe('charm');
    expect(canonicalStatusSoundId('lycanthropy')).toBe('wolf');
    expect(canonicalStatusSoundId('wolf-form')).toBe('wolf');
    expect(canonicalStatusSoundId('mana-burn')).toBe('mana_burn');
  });

  it('poison/burning/frozen 走采样键，不与合成表重叠', () => {
    expect(SAMPLE_STATUS_KEYS).toEqual(['poison', 'burning', 'frozen']);
    for (const key of SAMPLE_STATUS_KEYS) {
      expect(key in STATUS_SYNTHS).toBe(false);
      expect(canonicalStatusSoundId(key)).toBe(key);
    }
  });

  it('合成表键集与规范键一一对应（无多余/缺失）', () => {
    expect(Object.keys(STATUS_SYNTHS).sort()).toEqual(
      [
        'barrier',
        'bleed',
        'charm',
        'curse',
        'death_mark',
        'disease',
        'entangle',
        'mana_burn',
        'marked',
        'rage',
        'silence',
        'stun',
        'submerged',
        'web',
        'wolf',
      ].sort(),
    );
  });
});

describe('状态施加音合成（mock AudioContext）', () => {
  it('全部合成音色可无异常播放且产生节点/连线', () => {
    for (const [key, synth] of Object.entries(STATUS_SYNTHS)) {
      const { ctx, created, connects } = makeCtx();
      expect(() => (synth as (c: unknown, b: unknown, t: number) => void)(ctx, {}, 0), `音色 ${key}`).not.toThrow();
      expect(created(), `音色 ${key} 节点数`).toBeGreaterThan(0);
      expect(connects(), `音色 ${key} 连线数`).toBeGreaterThan(0);
    }
  });

  it('包络全程为正（mock 对非正值抛错即视为失败）', () => {
    // 上一条用例已隐式覆盖：任何 setValueAtTime/exponentialRamp 喂非正值都会抛错。
    expect(Object.keys(STATUS_SYNTHS).length).toBe(15);
  });
});

describe('AudioManager.playStatusApply 接线', () => {
  function wiredManager(): { am: AudioManager; created: () => number } {
    const am = new AudioManager();
    const { ctx, created } = makeCtx();
    const slot = am as unknown as Record<string, unknown>;
    slot.ctx = ctx;
    slot.sfxBus = (ctx as { createGain: () => unknown }).createGain();
    const baseline = created();
    return { am, created: () => created() - baseline };
  }

  it('合成状态触发节点创建', () => {
    const { am, created } = wiredManager();
    am.playStatusApply('curse');
    expect(created()).toBeGreaterThan(0);
  });

  it('采样状态缺缓冲时回退合成/既有采样链，不抛错', () => {
    const { am, created } = wiredManager();
    expect(() => am.playStatusApply('poison')).not.toThrow();
    expect(() => am.playStatusApply('burning')).not.toThrow();
    expect(() => am.playStatusApply('frozen')).not.toThrow();
    expect(created()).toBeGreaterThan(0);
  });

  it('未知状态与静音状态零节点', () => {
    const { am, created } = wiredManager();
    am.playStatusApply('nonexistent');
    expect(created()).toBe(0);
    am.muted = true;
    am.playStatusApply('charm');
    expect(created()).toBe(0);
  });

  it('同键 0.18s 内节流（全队施加只响一次），异键不受影响', () => {
    const { am, created } = wiredManager();
    am.playStatusApply('curse');
    const afterFirst = created();
    am.playStatusApply('curse');
    expect(created()).toBe(afterFirst);
    am.playStatusApply('charm');
    expect(created()).toBeGreaterThan(afterFirst);
  });
});
