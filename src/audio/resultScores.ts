/**
 * 结算音乐乐谱（纯数据，零 Web Audio 依赖，可在 node 单测里校验）。
 *
 * 三段原创谱：
 * - victory：C 大调号角开场（3 小节）→ 16 小节温暖凯旋循环（圆号/铜管轮流主奏，竖琴分解和弦）。
 * - defeat：A 小调挽歌开场（2 小节）→ 16 小节低沉循环（双簧管式独奏 + 弦乐铺底 + 远钟）。
 * - levelUp：升级号角短句（约 2.5 秒），叠在凯旋循环之上。
 *
 * 记谱：`'E5:2 G5:1 r:1'` = 音名:拍数，`r` 为休止，`|` 仅作小节分隔；`@0.6` 覆盖力度；
 * 拍数支持分数（`1/3` 三连音）。所有时值以拍为单位，播放层按 bpm 换算秒。
 */

export type ResultTheme = 'victory' | 'defeat';

export type Instrument =
  | 'brass' | 'horn' | 'strings' | 'harp' | 'bass'
  | 'timpani' | 'cymbal' | 'swell' | 'bell' | 'lead' | 'shimmer';

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

export interface Score {
  theme: ResultTheme;
  bpm: number;
  /** 整体输出增益（与 BackgroundMusic 的 mp3 播放增益对齐听感） */
  gain: number;
  intro: Phrase;
  loop: Phrase;
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

function sorted(events: NoteEvent[]): NoteEvent[] {
  return events.sort((a, b) => a.at - b.at || a.midi - b.midi);
}

// ---------------------------------------------------------------------------
// 胜利：C 大调，104 bpm
// ---------------------------------------------------------------------------

function victoryIntro(): Phrase {
  const events: NoteEvent[] = [
    // 定音鼓滚奏引入号角
    ...line('timpani', 'G2:1/4@0.2 G2:1/4@0.26 G2:1/4@0.33 G2:1/4@0.42', 0, 0.3),
    // 号角主句：三连音上行 → 高音 C 回响 → 下行过门 → 三连音冲顶落在主和弦
    ...line('brass', 'E5:1/3 G5:1/3 C6:1/3 | C6:3/2 B5:1/2 A5:1/2 B5:1/2 | G5:2 E5:1/2 F5:1/2 G5:1/3 A5:1/3 B5:1/3 | C6:4@0.85', 0, 0.72),
    // 低音铜管和声
    ...chord('brass', 'C4 E4 G4', 1, 2, 0.42),
    ...chord('brass', 'A3 C4 F4', 3, 1, 0.4),
    ...chord('brass', 'G3 B3 E4', 4, 2, 0.4),
    ...chord('brass', 'A3 C4 F4', 6, 1, 0.4),
    ...chord('brass', 'B3 D4 G4', 7, 1, 0.44),
    ...chord('brass', 'C4 E4 G4 C5', 8, 4, 0.5),
    // 弦乐铺底
    ...chord('strings', 'C3 G3 C4 E4', 1, 3, 0.55),
    ...chord('strings', 'G3 B3 E4', 4, 2, 0.5),
    ...chord('strings', 'F3 A3 C4', 6, 1, 0.5),
    ...chord('strings', 'G3 B3 D4', 7, 1, 0.52),
    ...chord('strings', 'C3 G3 C4 E4 G4', 8, 4, 0.6),
    ...line('bass', 'r:1 C2:2 A1:1 | E2:2 F2:1 G2:1 | C2:4', 0, 0.6),
    ...line('timpani', 'r:1 C2:3@0.8 | G2:3@0.45 G2:1/2@0.35 G2:1/2@0.45 | C2:4@0.9', 0, 0.5),
    { at: 1, dur: 2, inst: 'cymbal', midi: 60, vel: 0.42 },
    { at: 7, dur: 1, inst: 'swell', midi: 60, vel: 0.5 },
    { at: 8, dur: 3, inst: 'cymbal', midi: 60, vel: 0.62 },
    // 冲顶前的竖琴刮奏 + 落点星光
    ...arp('harp', 'C4 E4 G4 C5 E5 G5 C6 E6', 7, 1 / 8, 1.5, 0.36),
    ...arp('shimmer', 'C6 G6 C7', 8, 1 / 6, 2, 0.26),
  ];
  return { bpm: 104, beats: 12, events: sorted(events) };
}

const VICTORY_BARS = [
  // [弦乐和弦, 低音根音, 竖琴八分音符]
  ['G3 C4 E4', 'C2', 'C4 G4 C5 E5 G5 E5 C5 G4'],
  ['G3 B3 D4', 'B1', 'B3 G4 B4 D5 G5 D5 B4 G4'],
  ['A3 C4 E4', 'A1', 'A3 E4 A4 C5 E5 C5 A4 E4'],
  ['A3 C4 F4', 'F1', 'F3 C4 F4 A4 C5 A4 F4 C4'],
  ['G3 C4 E4', 'G1', 'G3 E4 G4 C5 E5 C5 G4 E4'],
  ['A3 C4 F4', 'F1', 'F3 C4 F4 A4 C5 F5 C5 A4'],
  ['G3 B3 D4', 'G1', 'G3 D4 G4 B4 D5 B4 G4 D4'],
  ['G3 C4 E4', 'C2', 'C4 G4 C5 E5 G5 C6 G5 E5'],
] as const;

function victoryLoop(): Phrase {
  const events: NoteEvent[] = [];
  for (let half = 0; half < 2; half++) {
    VICTORY_BARS.forEach(([pad, root, harp], i) => {
      const at = (half * 8 + i) * 4;
      if (i === 6) {
        // 属和弦前半挂四，后半解决
        events.push(...chord('strings', 'G3 C4 D4', at, 2, 0.46), ...chord('strings', pad, at + 2, 2, 0.46));
      } else {
        events.push(...chord('strings', pad, at, 4, 0.46));
      }
      events.push(
        ...line('bass', `${root}:2@0.55 ${root}:3/2@0.4`, at, 0.5),
        ...arp('harp', harp, at, 1 / 2, 1.2, 0.26),
      );
    });
  }
  // 前半：圆号主旋律
  events.push(...line('horn',
    'E5:2 G5:1 C6:1 | B5:2 A5:1 G5:1 | A5:3/2 G5:1/2 E5:1 C5:1 | F5:2 E5:1 F5:1 | '
    + 'G5:2 E5:1 G5:1 | A5:1 C6:1 A5:1 F5:1 | G5:3/2 F5:1/2 D5:1 B4:1 | C5:3 r:1', 0, 0.5));
  // 后半：铜管接过旋律并抬高
  events.push(...line('brass',
    'G5:2 E5:1 C6:1 | D6:2 B5:1 G5:1 | C6:3/2 B5:1/2 A5:1 E5:1 | F5:1 A5:1 C6:1 A5:1 | '
    + 'G5:2 C6:1 E6:1 | D6:1 C6:1 A5:1 F5:1 | G5:1 A5:1 B5:1 D6:1 | C6:3 r:1', 32, 0.4));
  events.push(
    ...chord('timpani', 'C2', 0, 2, 0.3),
    ...chord('timpani', 'G2', 16, 2, 0.24),
    ...chord('timpani', 'C2', 32, 2, 0.32),
    ...chord('timpani', 'G2', 48, 2, 0.24),
    { at: 31, dur: 1, inst: 'swell', midi: 60, vel: 0.26 },
    { at: 32, dur: 2, inst: 'cymbal', midi: 60, vel: 0.2 },
    ...arp('shimmer', 'C6 E6 G6 C7', 62, 1 / 4, 1.5, 0.18),
  );
  return { bpm: 104, beats: 64, events: sorted(events) };
}

// ---------------------------------------------------------------------------
// 战败：A 小调，66 bpm
// ---------------------------------------------------------------------------

function defeatIntro(): Phrase {
  const events: NoteEvent[] = [
    ...chord('timpani', 'A1', 0, 3, 0.62),
    ...chord('bell', 'A3', 0, 4, 0.5),
    ...chord('bell', 'E3', 4, 4, 0.3),
    ...chord('horn', 'A2 E3 A3 C4', 0, 4, 0.36),
    ...chord('horn', 'F2 C3 F3 A3', 4, 2, 0.32),
    ...chord('horn', 'E2 B2 E3 G#3', 6, 2, 0.32),
    ...chord('strings', 'A2 E3 A3 C4 E4', 0, 4, 0.5),
    ...chord('strings', 'F2 C3 A3 C4', 4, 2, 0.46),
    ...chord('strings', 'E2 B2 G#3 B3', 6, 2, 0.46),
    ...line('lead', 'r:1/2 E5:3/2 D5:1/2 C5:1 B4:1/2 | A4:3 G#4:1', 0, 0.55),
    ...line('bass', 'A1:4 F1:2 E1:2', 0, 0.5),
    { at: 3.5, dur: 0.5, inst: 'swell', midi: 60, vel: 0.14 },
  ];
  return { bpm: 66, beats: 8, events: sorted(events) };
}

const DEFEAT_BARS = [
  // [弦乐和弦, 低音, 拨弦四分音符]
  ['A3 C4 E4', 'A1', 'A3:1 E4:1 C5:1 E4:1'],
  ['A3 C4 F4', 'F1', 'F3:1 C4:1 A4:1 C4:1'],
  ['A3 D4 F4', 'D2', 'D3:1 A3:1 F4:1 A3:1'],
  ['G#3 B3 E4', 'E2', 'E3:1 B3:1 G#4:1 B3:1'],
  ['A3 C4 E4', 'A1', 'A3:1 E4:1 C5:1 E4:1'],
  ['A3 D4 F4', 'F1', 'F3:1 D4:1 A4:1 D4:1'],
  ['G#3 B3 E4', 'E2', 'E3:1 B3:1 E4:1 G#4:1'],
  ['A3 C4 E4', 'A1', 'A3:1 E4:1 A4:2'],
] as const;

function defeatLoop(): Phrase {
  const events: NoteEvent[] = [];
  for (let half = 0; half < 2; half++) {
    DEFEAT_BARS.forEach(([pad, root, pluck], i) => {
      const at = (half * 8 + i) * 4;
      if (i === 6) {
        events.push(...chord('strings', 'A3 B3 E4', at, 2, 0.42), ...chord('strings', pad, at + 2, 2, 0.42));
      } else {
        events.push(...chord('strings', pad, at, 4, 0.42));
      }
      events.push(
        ...chord('bass', root, at, 4, 0.44),
        ...line('harp', pluck, at, half === 0 ? 0.2 : 0.16),
      );
    });
  }
  // 前半：双簧管式独奏
  events.push(...line('lead',
    'E5:2 D5:1 C5:1 | C5:2 A4:2 | D5:3/2 E5:1/2 F5:1 D5:1 | E5:3 r:1 | '
    + 'C5:2 B4:1 A4:1 | A4:1 D5:1 F5:3/2 E5:1/2 | D5:1 C5:1 B4:1 G#4:1 | A4:3 r:1', 0, 0.5));
  // 后半：圆号低八度接续
  events.push(...line('horn',
    'A4:2 C5:1 E5:1 | F5:2 E5:1 C5:1 | D5:2 A4:1 F4:1 | E4:2 G#4:1 B4:1 | '
    + 'C5:2 E5:1 A5:1 | F5:3/2 E5:1/2 D5:1 C5:1 | B4:2 G#4:1 E4:1 | A4:3 r:1', 32, 0.4));
  events.push(
    ...chord('bell', 'A3', 0, 4, 0.2),
    ...chord('bell', 'A3', 32, 4, 0.18),
    ...chord('timpani', 'A1', 0, 2, 0.24),
    ...chord('timpani', 'A1', 16, 2, 0.2),
    ...chord('timpani', 'A1', 32, 2, 0.24),
    ...chord('timpani', 'A1', 48, 2, 0.2),
  );
  return { bpm: 66, beats: 64, events: sorted(events) };
}

// ---------------------------------------------------------------------------
// 升级号角（120 bpm，≈2.5s）
// ---------------------------------------------------------------------------

function levelUpSting(): Phrase {
  const events: NoteEvent[] = [
    ...line('horn', 'G4:1/4 C5:1/4 E5:1/4', 0, 0.55),
    ...chord('brass', 'G5', 0.75, 2.5, 0.72),
    ...chord('brass', 'C4 E4 G4 C5', 0.75, 2.5, 0.48),
    ...chord('strings', 'C3 G3 C4 E4', 0.75, 3, 0.55),
    ...chord('bass', 'C2', 0.75, 2.5, 0.55),
    ...chord('timpani', 'C2', 0.75, 2, 0.62),
    { at: 0.75, dur: 2, inst: 'cymbal', midi: 60, vel: 0.4 },
    ...arp('shimmer', 'C6 E6 G6 C7 E7', 0.75, 1 / 8, 1.6, 0.3),
    ...arp('harp', 'C5 E5 G5 C6', 0, 3 / 16, 1.2, 0.3),
  ];
  return { bpm: 120, beats: 3.5, events: sorted(events) };
}

export const RESULT_SCORES: Readonly<Record<ResultTheme, Score>> = {
  victory: { theme: 'victory', bpm: 104, gain: 0.9, intro: victoryIntro(), loop: victoryLoop() },
  defeat: { theme: 'defeat', bpm: 66, gain: 1.05, intro: defeatIntro(), loop: defeatLoop() },
};

export const LEVEL_UP_STING: Phrase = levelUpSting();

/** 段落时长（秒，不含余音） */
export function phraseSeconds(phrase: Phrase): number {
  return phrase.beats * 60 / phrase.bpm;
}
