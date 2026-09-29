/**
 * 升级号角乐谱（纯数据，零 Web Audio 依赖，可在 node 单测里校验）。
 *
 * levelUp：C 大调升级号角短句（约 2.5 秒，铜管 + 弦乐齐奏），叠在结算曲之上。
 * 胜利 / 战败结算曲已改为录制成品（见 ResultMusic.ts），不再在此记谱。
 *
 * 记谱：`'E5:2 G5:1 r:1'` = 音名:拍数，`r` 为休止，`|` 仅作小节分隔；`@0.6` 覆盖力度；
 * 拍数支持分数（`1/3` 三连音）。所有时值以拍为单位，播放层按 bpm 换算秒。
 */

export type Instrument =
  // 弦乐：第一/第二小提琴、中提琴、大提琴、低音提琴（拉奏）、拨奏；
  // strings / tremolo 为按音区自动分配声部的通用弦乐（长音 / 颤弓）
  | 'violins' | 'violins2' | 'violas' | 'cellos' | 'basses' | 'pizz' | 'strings' | 'tremolo'
  // 铜管与木管：圆号、小号、长号、长笛、双簧管（lead）
  | 'horn' | 'trumpet' | 'trombone' | 'flute' | 'lead'
  // 拨弦与键盘打击：竖琴、钟琴、远钟
  | 'harp' | 'glock' | 'bell'
  // 打击：定音鼓单击 / 滚奏（渐强到 vel）、镲击、吊镲滚奏（swell）、大鼓
  | 'timpani' | 'timpaniRoll' | 'cymbal' | 'swell' | 'bassDrum';

export interface NoteEvent {
  /** 起拍（相对段落起点） */
  at: number;
  /** 时值（拍） */
  dur: number;
  inst: Instrument;
  midi: number;
  /** 0~1 力度 */
  vel: number;
}

export interface Phrase {
  bpm: number;
  beats: number;
  events: NoteEvent[];
}

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'C4' → 60，'G#3' → 56，'Bb2' → 46 */
export function midiOf(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`无法解析音名：${name}`);
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return 12 * (Number(m[3]) + 1) + PITCH[m[1]!]! + accidental;
}

export function hzOf(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

function beatsOf(text: string): number {
  if (text.includes('/')) {
    const [a, b] = text.split('/');
    return Number(a) / Number(b);
  }
  return Number(text);
}

/** 单声部旋律：从 start 起顺序排布。 */
function line(inst: Instrument, text: string, start: number, vel: number): NoteEvent[] {
  const out: NoteEvent[] = [];
  let at = start;
  for (const token of text.trim().split(/\s+/)) {
    if (!token || token === '|') continue;
    const [body, velText] = token.split('@');
    const [name, len] = body!.split(':');
    const dur = beatsOf(len ?? '1');
    if (name !== 'r') out.push({ at, dur, inst, midi: midiOf(name!), vel: velText ? Number(velText) : vel });
    at += dur;
  }
  return out;
}

/** 柱式和弦：同一拍同时发声。 */
function chord(inst: Instrument, notes: string, at: number, dur: number, vel: number): NoteEvent[] {
  return notes.trim().split(/\s+/).map((name) => ({ at, dur, inst, midi: midiOf(name), vel }));
}

/** 等距分解和弦（竖琴/拨弦）：每个音相隔 step 拍，余音时值 ring 拍。 */
function arp(inst: Instrument, notes: string, at: number, step: number, ring: number, vel: number): NoteEvent[] {
  return notes.trim().split(/\s+/).map((name, i) => ({ at: at + i * step, dur: ring, inst, midi: midiOf(name), vel }));
}

/** 无音高打击（镲 / 吊镲滚奏 / 大鼓）。 */
function hit(inst: Instrument, at: number, dur: number, vel: number): NoteEvent {
  return { at, dur, inst, midi: 60, vel };
}

function sorted(events: NoteEvent[]): NoteEvent[] {
  return events.sort((a, b) => a.at - b.at || a.midi - b.midi);
}

// ---------------------------------------------------------------------------
// 升级号角（120 bpm，5 拍 = 2.5s）：竖琴刮奏 + 小号弱起 → 铜管/弦乐齐奏主和弦
// ---------------------------------------------------------------------------

function levelUpSting(): Phrase {
  const events: NoteEvent[] = [
    ...line('trumpet', 'G4:1/4 C5:1/4 E5:1/4 G5:3', 0, 0.72),
    ...line('trumpet', 'E4:1/4 G4:1/4 C5:1/4 E5:3', 0, 0.56),
    ...chord('horn', 'G3 C4 E4', 0.75, 3, 0.56),
    ...chord('trombone', 'C3 G3', 0.75, 3, 0.52),
    ...chord('tremolo', 'C4 G4 C5 E5 G5', 0.75, 3, 0.5),
    ...chord('cellos', 'C3', 0.75, 3, 0.52),
    ...chord('basses', 'C2', 0.75, 3, 0.54),
    ...chord('timpani', 'C2', 0.75, 2, 0.7),
    hit('cymbal', 0.75, 2, 0.44),
    hit('bassDrum', 0.75, 2, 0.46),
    ...arp('harp', 'C4 D4 E4 F4 G4 A4 B4', 0, 3 / 28, 1.2, 0.3),
    ...arp('harp', 'C4 E4 G4 C5 E5', 0.75, 1 / 16, 2, 0.3),
    ...arp('glock', 'C6 E6 G6 C7', 0.75, 1 / 8, 1.6, 0.28),
  ];
  return { bpm: 120, beats: 5, events: sorted(events) };
}

export const LEVEL_UP_STING: Phrase = levelUpSting();

/** 段落时长（秒，不含余音） */
export function phraseSeconds(phrase: Phrase): number {
  return phrase.beats * 60 / phrase.bpm;
}
