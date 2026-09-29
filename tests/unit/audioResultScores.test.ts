import { describe, expect, it } from 'vitest';
import {
  LEVEL_UP_STING,
  RESULT_SCORES,
  hzOf,
  midiOf,
  phraseSeconds,
  type Instrument,
  type NoteEvent,
  type Phrase,
} from '../../src/audio/resultScores';

const INSTRUMENTS: readonly Instrument[] = [
  'violins', 'violins2', 'violas', 'cellos', 'basses', 'pizz', 'strings', 'tremolo',
  'horn', 'trumpet', 'trombone', 'flute', 'lead',
  'harp', 'glock', 'bell',
  'timpani', 'timpaniRoll', 'cymbal', 'swell', 'bassDrum',
];

const UNPITCHED: ReadonlySet<Instrument> = new Set(['cymbal', 'swell', 'bassDrum']);

function checkPhrase(name: string, phrase: Phrase): void {
  expect(phrase.events.length, name).toBeGreaterThan(0);
  for (let i = 0; i < phrase.events.length; i++) {
    const ev = phrase.events[i]!;
    expect(INSTRUMENTS, name).toContain(ev.inst);
    expect(ev.at, `${name} #${i} 起拍`).toBeGreaterThanOrEqual(0);
    expect(ev.at, `${name} #${i} 起拍须落在段内`).toBeLessThan(phrase.beats);
    expect(ev.dur, `${name} #${i} 时值`).toBeGreaterThan(0);
    expect(ev.vel, `${name} #${i} 力度`).toBeGreaterThan(0);
    expect(ev.vel, `${name} #${i} 力度`).toBeLessThanOrEqual(1);
    expect(ev.midi, `${name} #${i} 音域`).toBeGreaterThanOrEqual(midiOf('A0'));
    expect(ev.midi, `${name} #${i} 音域`).toBeLessThanOrEqual(midiOf('C8'));
    if (i > 0) expect(ev.at, `${name} 事件须按起拍排序（调度器依赖）`).toBeGreaterThanOrEqual(phrase.events[i - 1]!.at);
  }
}

// 外声部：旋律/和声乐器的最高音 vs 低音声部的最低音
const TOP: ReadonlySet<Instrument> = new Set(['violins', 'violins2', 'violas', 'horn', 'trumpet', 'trombone', 'flute', 'tremolo']);
const BOTTOM: ReadonlySet<Instrument> = new Set(['basses', 'pizz', 'cellos']);

function sounding(events: readonly NoteEvent[], set: ReadonlySet<Instrument>, t: number): number[] {
  return events.filter(e => set.has(e.inst) && e.at <= t + 1e-6 && t < e.at + e.dur - 1e-6).map(e => e.midi);
}

/** 找外声部同向进行的平行五度 / 八度（含循环尾 → 循环头的接缝）。 */
function outerParallels(phrase: Phrase, wrap: boolean): string[] {
  const times = [...new Set(phrase.events.filter(e => TOP.has(e.inst) || BOTTOM.has(e.inst)).map(e => e.at))].sort((a, b) => a - b);
  const samples: { t: number; top: number; bottom: number }[] = [];
  for (const t of times) {
    const top = sounding(phrase.events, TOP, t);
    const bottom = sounding(phrase.events, BOTTOM, t);
    if (top.length && bottom.length) samples.push({ t, top: Math.max(...top), bottom: Math.min(...bottom) });
  }
  if (wrap && samples.length) samples.push({ ...samples[0]!, t: phrase.beats });
  const out: string[] = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]!;
    const b = samples[i]!;
    const dt = b.top - a.top;
    const db = b.bottom - a.bottom;
    if (dt === 0 || db === 0 || Math.sign(dt) !== Math.sign(db)) continue;
    const ia = (a.top - a.bottom) % 12;
    const ib = (b.top - b.bottom) % 12;
    if (ia === ib && (ia === 0 || ia === 7)) out.push(`拍 ${a.t}→${b.t}：${ia === 0 ? '八度' : '五度'}`);
  }
  return out;
}

describe('结算音乐乐谱', () => {
  it('音名换算', () => {
    expect(midiOf('A4')).toBe(69);
    expect(midiOf('C4')).toBe(60);
    expect(midiOf('G#3')).toBe(56);
    expect(midiOf('Bb2')).toBe(46);
    expect(hzOf(69)).toBeCloseTo(440);
    expect(hzOf(81)).toBeCloseTo(880);
    expect(() => midiOf('H2')).toThrow();
  });

  it('胜利 / 战败 / 升级号角的每个音符都在段落内、有序、力度合法', () => {
    for (const score of Object.values(RESULT_SCORES)) {
      checkPhrase(`${score.theme}.intro`, score.intro);
      checkPhrase(`${score.theme}.loop`, score.loop);
    }
    checkPhrase('levelUp', LEVEL_UP_STING);
  });

  it('胜利是大调凯旋、战败是小调挽歌：速度与调性区分明确', () => {
    const { victory, defeat } = RESULT_SCORES;
    expect(victory.bpm).toBeGreaterThan(defeat.bpm);
    const pitchClasses = (phrase: Phrase) => new Set(phrase.events.filter(e => !UNPITCHED.has(e.inst)).map(e => e.midi % 12));
    // C 大调不含升 G；A 小调挽歌用和声小调的导音升 G
    expect(pitchClasses(victory.intro).has(8)).toBe(false);
    expect(pitchClasses(victory.loop).has(8)).toBe(false);
    expect(pitchClasses(defeat.loop).has(8)).toBe(true);
    const last = (phrase: Phrase, inst: Instrument) => phrase.events.filter(e => e.inst === inst).at(-1)!;
    // 胜利：号角开场与高潮终止都落在主音 C；战败循环以 A 结束
    expect(last(victory.intro, 'trumpet').midi % 12).toBe(0);
    expect(last(victory.loop, 'trumpet').midi % 12).toBe(0);
    expect(last(defeat.loop, 'horn').midi % 12).toBe(9);
  });

  it('胜利循环：尾部停在属音、开头回到主音，接缝即 V → I 解决', () => {
    const { loop } = RESULT_SCORES.victory;
    const bass = loop.events.filter(e => e.inst === 'basses' || e.inst === 'pizz');
    expect(bass.at(-1)!.midi % 12).toBe(7);
    expect(bass[0]!.midi % 12).toBe(0);
    expect(bass[0]!.at).toBe(0);
  });

  it('胜利曲按管弦乐队配器：各声部齐全，开场由定音鼓滚奏引入、号角强拍镲击', () => {
    const { intro, loop } = RESULT_SCORES.victory;
    const insts = new Set(loop.events.map(e => e.inst));
    for (const inst of ['violins', 'violins2', 'violas', 'cellos', 'basses', 'pizz', 'horn', 'trumpet', 'trombone', 'flute', 'harp', 'timpani', 'timpaniRoll', 'cymbal'] as const) {
      expect(insts, `循环缺少 ${inst}`).toContain(inst);
    }
    const roll = intro.events.find(e => e.inst === 'timpaniRoll')!;
    expect(roll.at).toBe(0);
    const fanfareDownbeat = intro.events.find(e => e.inst === 'trumpet' && e.at >= 4)!;
    expect(fanfareDownbeat.at).toBe(4);
    expect(intro.events.some(e => e.inst === 'cymbal' && e.at === 4)).toBe(true);
    // 竖琴刮奏收在主和弦落点之前
    const gliss = intro.events.filter(e => e.inst === 'harp' && e.at >= 11 && e.at < 12);
    expect(gliss.length).toBeGreaterThanOrEqual(8);
    // 旋律在圆号与小提琴之间传递
    const leadOf = (from: number, to: number) => {
      const top = loop.events.filter(e => (e.inst === 'horn' || e.inst === 'violins') && e.at >= from && e.at < to && e.vel >= 0.4);
      return new Set(top.map(e => e.inst));
    };
    expect(leadOf(0, 28)).toEqual(new Set(['horn']));
    expect(leadOf(32, 48)).toContain('violins');
  });

  it('胜利曲外声部没有平行五度 / 八度', () => {
    const { intro, loop } = RESULT_SCORES.victory;
    expect(outerParallels(intro, false)).toEqual([]);
    expect(outerParallels(loop, true)).toEqual([]);
  });

  it('复音密度可控：任一秒内新起音符数有上限', () => {
    for (const phrase of [RESULT_SCORES.victory.intro, RESULT_SCORES.victory.loop, LEVEL_UP_STING]) {
      const spb = 60 / phrase.bpm;
      const perSecond = new Map<number, number>();
      for (const e of phrase.events) {
        const s = Math.floor(e.at * spb);
        perSecond.set(s, (perSecond.get(s) ?? 0) + 1);
      }
      // 竖琴刮奏/钟琴单音很廉价；合奏落点瞬间允许到 64 个起音
      expect(Math.max(...perSecond.values())).toBeLessThanOrEqual(64);
    }
  });

  it('循环段为整小节、时长适合结算停留；开场短于循环；升级号角约 2~3 秒', () => {
    for (const score of Object.values(RESULT_SCORES)) {
      expect(score.loop.beats % 4).toBe(0);
      expect(score.intro.beats % 4).toBe(0);
      expect(phraseSeconds(score.intro)).toBeLessThan(phraseSeconds(score.loop));
      expect(phraseSeconds(score.loop)).toBeGreaterThan(20);
      expect(phraseSeconds(score.loop)).toBeLessThan(90);
      expect(score.gain).toBeGreaterThan(0);
      expect(score.gain).toBeLessThanOrEqual(1.2);
    }
    expect(RESULT_SCORES.victory.loop.beats / 4).toBeGreaterThanOrEqual(16);
    expect(phraseSeconds(LEVEL_UP_STING)).toBeGreaterThanOrEqual(2);
    expect(phraseSeconds(LEVEL_UP_STING)).toBeLessThanOrEqual(3);
  });
});
