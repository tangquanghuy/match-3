import { describe, expect, it } from 'vitest';
import {
  LEVEL_UP_STING,
  RESULT_SCORES,
  hzOf,
  midiOf,
  phraseSeconds,
  type Instrument,
  type Phrase,
} from '../../src/audio/resultScores';

const INSTRUMENTS: readonly Instrument[] = [
  'brass', 'horn', 'strings', 'harp', 'bass', 'timpani', 'cymbal', 'swell', 'bell', 'lead', 'shimmer',
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
    const pitchClasses = (phrase: Phrase) => new Set(phrase.events.filter(e => e.inst !== 'cymbal' && e.inst !== 'swell').map(e => e.midi % 12));
    // C 大调不含升 G；A 小调挽歌用和声小调的导音升 G
    expect(pitchClasses(victory.loop).has(8)).toBe(false);
    expect(pitchClasses(defeat.loop).has(8)).toBe(true);
    // 主音落点：胜利循环以 C 结束，战败循环以 A 结束
    const lastMelody = (phrase: Phrase, inst: Instrument) => phrase.events.filter(e => e.inst === inst).at(-1)!;
    expect(lastMelody(victory.loop, 'brass').midi % 12).toBe(0);
    expect(lastMelody(defeat.loop, 'horn').midi % 12).toBe(9);
  });

  it('循环段为整小节、时长适合结算停留；开场短于循环；升级号角约 2 秒', () => {
    for (const score of Object.values(RESULT_SCORES)) {
      expect(score.loop.beats % 4).toBe(0);
      expect(score.intro.beats % 4).toBe(0);
      expect(phraseSeconds(score.intro)).toBeLessThan(phraseSeconds(score.loop));
      expect(phraseSeconds(score.loop)).toBeGreaterThan(20);
      expect(phraseSeconds(score.loop)).toBeLessThan(90);
      expect(score.gain).toBeGreaterThan(0);
      expect(score.gain).toBeLessThanOrEqual(1.2);
    }
    expect(phraseSeconds(LEVEL_UP_STING)).toBeGreaterThan(1);
    expect(phraseSeconds(LEVEL_UP_STING)).toBeLessThan(3);
  });
});
