import { describe, it, expect } from 'vitest';
import {
  canonicalStatusSoundId,
  normalizeStatusKey,
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
  FAERIE_FIRE_STATUS_ID,
  MANA_BURN_STATUS_IDS,
  MARK_STATUS_ID,
  RAGE_STATUS_IDS,
  TERROR_STATUS_ID,
  UNTARGETABLE_STATUS_IDS,
  WEB_STATUS_ID,
  WOLF_STATUS_IDS,
} from '../../src/engine/skills/effects/status';
import { AudioManager, STATUS_SAMPLE_URLS } from '../../src/render/AudioManager';

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
  /** 实际覆盖判定：占位合成表命中，或 status/ 目录 glob 采样命中（采样优先于合成）。 */
  const covered = (id: string): boolean =>
    canonicalStatusSoundId(id) !== null || normalizeStatusKey(id) in STATUS_SAMPLE_URLS;

  it('覆盖引擎已落地的全部状态 id（含别名形态与 E 新状态妖火/恐怖）', () => {
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
    for (const id of landedIds) {
      expect(covered(id), `状态 ${id} 缺施加音`).toBe(true);
    }
  });

  it('status/ 目录 17 个 AI 采样全部就位且键名规范', () => {
    expect(Object.keys(STATUS_SAMPLE_URLS).sort()).toEqual(
      [
        'barrier',
        'bleed',
        'charm',
        'curse',
        'death_mark',
        'disease',
        'entangle',
        'faerie_fire',
        'mana_burn',
        'marked',
        'rage',
        'silence',
        'stun',
        'submerged',
        'terror',
        'web',
        'wolf',
      ].sort(),
    );
  });

  it('未知/未落地状态返回 null（静默）', () => {
    expect(canonicalStatusSoundId('nonexistent')).toBeNull();
    expect(canonicalStatusSoundId('fear')).toBeNull();
    expect(canonicalStatusSoundId('')).toBeNull();
    expect('nonexistent' in STATUS_SAMPLE_URLS).toBe(false);
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
  function wiredManager(): { am: AudioManager; created: () => number; ctx: { currentTime: number } } {
    const am = new AudioManager();
    const { ctx, created } = makeCtx();
    const slot = am as unknown as Record<string, unknown>;
    slot.ctx = ctx;
    slot.sfxBus = (ctx as { createGain: () => unknown }).createGain();
    const baseline = created();
    return { am, created: () => created() - baseline, ctx: ctx as { currentTime: number } };
  }

  it('合成状态触发节点创建', () => {
    const { am, created } = wiredManager();
    am.playStatusApply('curse');
    expect(created()).toBeGreaterThan(0);
  });

  it('采样状态缺缓冲时回退合成/既有采样链，不抛错', () => {
    const { am, created, ctx } = wiredManager();
    expect(() => am.playStatusApply('poison')).not.toThrow();
    ctx.currentTime = 0.5;
    expect(() => am.playStatusApply('burning')).not.toThrow();
    ctx.currentTime = 1.0;
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
    // 间隔之外的新状态正常发声
    ctx.currentTime = 0.5;
    am.playStatusApply('charm');
    expect(created()).toBeGreaterThan(afterFirst);
  });
});
