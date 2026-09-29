import { describe, expect, it } from 'vitest';
import {
  LEVEL_UP_STING,
  hzOf,
  midiOf,
  phraseSeconds,
  type Instrument,
  type Phrase,
} from '../../src/audio/resultScores';

const INSTRUMENTS: readonly Instrument[] = [
  'violins', 'violins2', 'violas', 'cellos', 'basses', 'pizz', 'strings', 'tremolo',
  'horn', 'trumpet', 'trombone', 'flute', 'lead',
  'harp', 'glock', 'bell',
  'timpani', 'timpaniRoll', 'cymbal', 'swell', 'bassDrum',
];

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

describe('升级号角乐谱', () => {
  it('音名换算', () => {
    expect(midiOf('A4')).toBe(69);
    expect(midiOf('C4')).toBe(60);
    expect(midiOf('G#3')).toBe(56);
    expect(midiOf('Bb2')).toBe(46);
    expect(hzOf(69)).toBeCloseTo(440);
    expect(hzOf(81)).toBeCloseTo(880);
    expect(() => midiOf('H2')).toThrow();
  });

  it('升级号角的每个音符都在段落内、有序、力度合法，时长约 2~3 秒', () => {
    checkPhrase('levelUp', LEVEL_UP_STING);
    expect(phraseSeconds(LEVEL_UP_STING)).toBeGreaterThanOrEqual(2);
    expect(phraseSeconds(LEVEL_UP_STING)).toBeLessThanOrEqual(3);
  });

  it('升级号角复音密度可控：任一秒内新起音符数有上限', () => {
    const spb = 60 / LEVEL_UP_STING.bpm;
    const perSecond = new Map<number, number>();
    for (const e of LEVEL_UP_STING.events) {
      const s = Math.floor(e.at * spb);
      perSecond.set(s, (perSecond.get(s) ?? 0) + 1);
    }
    expect(Math.max(...perSecond.values())).toBeLessThanOrEqual(64);
  });
});
