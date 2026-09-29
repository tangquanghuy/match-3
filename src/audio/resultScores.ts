/**
 * 结算音乐乐谱（纯数据，零 Web Audio 依赖，可在 node 单测里校验）。
 *
 * 三段原创谱（按管弦乐队分声部记谱）：
 * - victory：C 大调。4 小节号角开场（定音鼓滚奏渐强 → 小号号角 + 圆号/长号和声 + 全弦乐颤弓，
 *   强拍镲击，竖琴刮奏落主和弦）→ 20 小节凯旋循环：
 *   A 段圆号主奏（长笛对位、弦乐分部内声部走动、低音拨弦行走）→ B 段小提琴接过旋律（圆号对位）
 *   → C 段全奏高潮（小提琴 + 小号 + 长笛齐奏，长号和声，定音鼓/镲/大鼓）→ D 段渐弱过渡，
 *   停在属和弦，回到循环开头的主和弦。
 * - defeat：A 小调挽歌开场（2 小节）→ 16 小节低沉循环（双簧管独奏 + 弦乐铺底 + 远钟）。
 * - levelUp：升级号角短句（约 2.5 秒，铜管 + 弦乐齐奏），叠在凯旋循环之上。
 *
 * 记谱：`'E5:2 G5:1 r:1'` = 音名:拍数，`r` 为休止，`|` 仅作小节分隔；`@0.6` 覆盖力度；
 * 拍数支持分数（`1/3` 三连音）。所有时值以拍为单位，播放层按 bpm 换算秒。
 */

export type ResultTheme = 'victory' | 'defeat';

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

/** 无音高打击（镲 / 吊镲滚奏 / 大鼓）。 */
function hit(inst: Instrument, at: number, dur: number, vel: number): NoteEvent {
  return { at, dur, inst, midi: 60, vel };
}

/** 记谱整体升八度（大提琴高八度重复低音提琴行走线）。 */
function octaveUp(text: string): string {
  return text.replace(/([A-G][#b]?)(-?\d)/g, (_m, name: string, octave: string) => `${name}${Number(octave) + 1}`);
}

function sorted(events: NoteEvent[]): NoteEvent[] {
  return events.sort((a, b) => a.at - b.at || a.midi - b.midi);
}

// ---------------------------------------------------------------------------
// 胜利：C 大调，104 bpm
// ---------------------------------------------------------------------------

/**
 * 开场 4 小节（16 拍）：
 *   1  属音 G 上定音鼓滚奏 + 吊镲滚奏渐强，低音弦乐颤弓；末拍小号三连音弱起
 *   2  强拍镲击 + 大鼓 + 定音鼓：小号号角（C 大调），圆号/长号和声，全弦乐颤弓
 *   3  IV → ii → V7，小号三连音级进冲顶；竖琴刮奏滑入
 *   4  主和弦落点：再次镲击，弦乐转长弓，钟琴点缀，留半拍呼吸进入循环
 */
function victoryIntro(): Phrase {
  const events: NoteEvent[] = [
    ...line('timpaniRoll', 'G2:4', 0, 0.62),
    hit('swell', 1, 3, 0.46),
    ...chord('tremolo', 'G2 D3 G3', 0, 4, 0.3),
    // 小号 I / II（三度）
    ...line('trumpet',
      'r:3 G4:1/3 C5:1/3 D5:1/3 | E5:3/2 C5:1/2 E5:1/2 G5:1/2 C6:1 | '
      + 'A5:3/2 G5:1/2 F5:1/3 G5:1/3 A5:1/3 B5:1 | C6:7/2@0.84', 0, 0.74),
    ...line('trumpet',
      'r:3 E4:1/3 E4:1/3 G4:1/3 | C5:3/2 G4:1/2 C5:1/2 E5:1/2 E5:1 | '
      + 'F5:3/2 E5:1/2 D5:1/3 E5:1/3 F5:1/3 D5:1 | E5:7/2@0.66', 0, 0.56),
    // 圆号和声
    ...chord('horn', 'G3 C4 E4', 4, 4, 0.52),
    ...chord('horn', 'A3 C4 F4', 8, 2, 0.52),
    ...chord('horn', 'A3 D4 F4', 10, 1, 0.52),
    ...chord('horn', 'G3 B3 F4', 11, 1, 0.56),
    ...chord('horn', 'G3 C4 E4', 12, 3.5, 0.58),
    // 长号
    ...chord('trombone', 'C3 G3', 4, 3, 0.5),
    ...chord('trombone', 'E3 G3', 7, 1, 0.5),
    ...chord('trombone', 'F3 A3', 8, 2, 0.5),
    ...chord('trombone', 'D3 A3', 10, 1, 0.5),
    ...chord('trombone', 'D3 B3', 11, 1, 0.54),
    ...chord('trombone', 'C3 G3', 12, 3.5, 0.56),
    // 全弦乐颤弓 → 落点转长弓
    ...chord('tremolo', 'C4 G4 C5 E5', 4, 4, 0.46),
    ...chord('tremolo', 'C4 F4 A4 C5 F5', 8, 2, 0.46),
    ...chord('tremolo', 'D4 F4 A4 D5 F5', 10, 1, 0.46),
    ...chord('tremolo', 'D4 G4 B4 D5 F5', 11, 1, 0.5),
    ...chord('violins', 'G5 C6', 12, 3.5, 0.5),
    ...chord('violins2', 'C5 E5', 12, 3.5, 0.48),
    ...chord('violas', 'E4 G4', 12, 3.5, 0.46),
    ...line('cellos', 'G2:4 | C3:3 E3:1 | F3:2 D3:1 G2:1 | C3:7/2', 0, 0.5),
    ...line('basses', 'G1:4 | C2:3 E2:1 | F1:2 D2:1 G1:1 | C2:7/2', 0, 0.52),
    // 打击
    ...line('timpani', 'r:4 C2:3@0.85 G2:1@0.45 | C2:3@0.5 G2:1/2@0.5 G2:1/2@0.6 | C2:4@0.9', 0, 0.6),
    hit('cymbal', 4, 3, 0.6),
    hit('bassDrum', 4, 2, 0.6),
    hit('swell', 10, 2, 0.4),
    hit('cymbal', 12, 3, 0.7),
    hit('bassDrum', 12, 2, 0.72),
    // 竖琴刮奏滑入主和弦，落点再扫一个琶音；钟琴与长笛点亮高音
    ...arp('harp', 'B3 C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5 A5 B5', 11, 1 / 15, 1.2, 0.34),
    ...arp('harp', 'C3 G3 C4 E4 G4 C5 E5 G5', 12, 1 / 24, 3, 0.38),
    ...arp('glock', 'C6 E6 G6 C7', 12, 1 / 6, 1.5, 0.3),
    ...line('flute', 'r:12 E6:7/2', 0, 0.4),
  ];
  return { bpm: 104, beats: 16, events: sorted(events) };
}

/**
 * 循环 20 小节（80 拍），和声：
 *   A  1 C | 2 Am | 3 F | 4 G | 5 C→C/B→Am→C/G | 6 F | 7 Dm7 G7 | 8 C
 *   B  9 Am | 10 Em | 11 F | 12 G7
 *   C  13 C | 14 F | 15 Dm7 G7 | 16 C
 *   D  17 Am | 18 F | 19 Dm7 | 20 Gsus4 G7（→ 回到 1 的 C）
 */
function victoryLoop(): Phrase {
  const events: NoteEvent[] = [];
  const add = (...evs: NoteEvent[]) => events.push(...evs);

  // ---- 旋律：圆号（A）→ 小提琴（B、C，C 段小号低八度、长笛同度加厚）→ 圆号（D） ----
  add(...line('horn',
    'E4:1 G4:1 C5:3/2 D5:1/2 | E5:2 D5:1 C5:1 | A4:3/2 C5:1/2 F5:1 E5:1 | D5:3 r:1 | '
    + 'E4:1 G4:1 C5:3/2 E5:1/2 | F5:2 E5:1 D5:1 | C5:1 D5:1 B4:3/2 D5:1/2 | C5:3', 0, 0.5));
  add(...line('violins',
    'G5:1/2 B5:1/2 | C6:3/2 B5:1/2 A5:1 E5:1 | G5:3/2 A5:1/2 B5:1 E6:1 | '
    + 'C6:3/2 A5:1/2 F5:1 A5:1 | D6:2 C6:1/2 B5:1/2 C6:1/2 D6:1/2', 31, 0.5));
  const climax = 'E6:3/2 D6:1/2 C6:1 G5:1 | A5:1 C6:1 F6:3/2 E6:1/2 | D6:1 C6:1 B5:3/2 D6:1/2 | C6:3';
  add(...line('violins', climax, 48, 0.7));
  add(...line('flute', climax, 48, 0.46));
  add(...line('trumpet',
    'E5:3/2 D5:1/2 C5:1 G4:1 | A4:1 C5:1 F5:3/2 E5:1/2 | D5:1 C5:1 B4:3/2 D5:1/2 | C5:3', 48, 0.56));
  add(...line('horn',
    'E4:1 A4:1 C5:3/2 B4:1/2 | A4:3/2 G4:1/2 F4:1 A4:1 | D5:2 C5:1 A4:1 | C5:2 B4:3/2', 64, 0.4));

  // ---- 对位：第一小提琴高音长线（A 前半）、长笛（A 后半、D）、圆号（B） ----
  add(...line('violins', 'G5:4 | A5:8 | B5:4 | C6:2', 0, 0.26));
  add(...line('flute',
    'r:2 G5:1/2 A5:1/2 B5:1/2 C6:1/2 | A5:3 G5:1/2 F5:1/2 | F5:3/2 E5:1/2 D5:1 F5:1 | E5:2', 16, 0.4));
  add(...line('horn', 'A4:2 G4:2 | G4:2 B4:2 | A4:2 C5:2 | B4:2 D5:2', 32, 0.36));
  add(...line('violins', 'E5:4 | F5:4 | F5:4 | D5:2 F5:2', 64, 0.24));
  add(...line('flute', 'r:4 | r:2 C6:1/2 A5:1/2 F5:1 | r:2 A5:1/2 F5:1/2 D5:1', 64, 0.34));

  // ---- 分部弦乐内声部：半音符错位走动，B 段第二小提琴四分音符分解 ----
  add(...line('violins2',
    'E5:4 | E5:3 D5:1 | C5:4 | B4:2 D5:2 | E5:2 C5:1 B4:1 | A4:2 C5:2 | A4:2 B4:2 | G4:4 | '
    + 'C5:1 E5:1 A4:1 C5:1 | B4:1 E5:1 G4:1 B4:1 | A4:1 C5:1 F4:1 A4:1 | B4:1 D5:1 G4:1 F4:1', 0, 0.26));
  add(...line('violins2', 'G5:2 E5:2 | A5:2 C6:2 | F5:2 D5:2 | E5:4', 48, 0.48));
  add(...line('violins2', 'C5:4 | A4:4 | A4:2 C5:2 | G4:2 B4:2', 64, 0.22));
  add(...line('violas',
    'E3:2 G3:2 | A3:2 C4:2 | C4:2 A3:2 | B3:2 G3:2 | G3:4 | F3:2 A3:2 | F3:4 | E3:4 | '
    + 'E4:4 | E4:2 D4:2 | C4:4 | D4:2 F4:2', 0, 0.26));
  add(...line('violas', 'E4:2 G4:2 | F4:2 A4:2 | A4:2 B4:2 | G4:4', 48, 0.46));
  add(...line('violas', 'A3:2 G3:2 | F3:2 A3:2 | F3:4 | G3:2 F3:2', 64, 0.22));

  // ---- 低音：A 段大提琴长弓 + 低音提琴拨奏行走；B/C 段大提琴与低音提琴拉奏四分音符行走；D 段二分音符 ----
  const walkA = 'C2 E2 G2 E2 | A1 C2 E2 A1 | F1 A1 C2 A1 | G1 B1 D2 G1 | C2 B1 A1 G1 | F1 A1 C2 A1 | D2 F2 G1 B1 | C2 E2 G2 G1';
  add(...line('pizz', walkA, 0, 0.5));
  add(...line('cellos', 'C3:4 | A2:4 | F2:4 | G2:4 | C3:2 A2:2 | F2:4 | D3:2 G2:2 | C3:4', 0, 0.3));
  const walkB = 'A1 C2 E2 C2 | E1 B1 G1 E1 | F1 A1 C2 D2 | G1 A1 B1 G1 | '
    + 'C2 B1 A1 G1 | F1 A1 C2 A1 | D2 F2 G1 B1 | C2:2 G1 E1';
  add(...line('basses', walkB, 32, 0.4));
  add(...line('cellos', octaveUp(walkB), 32, 0.38));
  add(...line('basses', 'A1:2 G1:2 | F1:2 A1:2 | D2:2 C2:2 | G1:4', 64, 0.3));
  add(...line('cellos', 'A2:2 G2:2 | F2:2 A2:2 | D3:2 C3:2 | G2:4', 64, 0.28));

  // ---- 高潮铜管和声 ----
  add(
    ...chord('trombone', 'C3 G3 E4', 48, 4, 0.44),
    ...chord('trombone', 'C3 F3 A3', 52, 4, 0.44),
    ...chord('trombone', 'D3 F3 A3', 56, 2, 0.44),
    ...chord('trombone', 'D3 G3 B3', 58, 2, 0.46),
    ...chord('trombone', 'C3 G3 C4', 60, 3, 0.46),
    ...chord('horn', 'C4 E4 G4', 48, 4, 0.44),
    ...chord('horn', 'C4 F4 A4', 52, 4, 0.44),
    ...chord('horn', 'D4 F4 A4', 56, 2, 0.44),
    ...chord('horn', 'B3 D4 G4', 58, 2, 0.46),
    ...chord('horn', 'C4 E4 G4', 60, 3, 0.46),
  );

  // ---- 竖琴：A/B 段八分音符分解，高潮前刮奏，D 段四分音符分解滑回开头 ----
  const harpBars = [
    'C4 G4 C5 E5 G5 E5 C5 G4', 'A3 E4 A4 C5 E5 C5 A4 E4', 'F3 C4 F4 A4 C5 A4 F4 C4', 'G3 D4 G4 B4 D5 B4 G4 D4',
  ];
  harpBars.forEach((notes, i) => add(...arp('harp', notes, i * 4, 1 / 2, 1.2, 0.22)));
  add(...arp('harp', 'C4 E4 G4 C5', 28, 1 / 8, 2, 0.22));
  ['A3 E4 A4 C5 E5 C5 A4 E4', 'E3 B3 E4 G4 B4 G4 E4 B3', 'F3 C4 F4 A4 C5 A4 F4 C4']
    .forEach((notes, i) => add(...arp('harp', notes, 32 + i * 4, 1 / 2, 1.2, 0.2)));
  add(
    ...arp('harp', 'G3 A3 B3 C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5 A5 B5', 47, 1 / 17, 1.2, 0.32),
    ...arp('harp', 'C3 G3 C4 E4 G4 C5 E5', 48, 1 / 20, 2.5, 0.34),
    ...arp('harp', 'F2 C3 F3 A3 C4 F4 A4', 52, 1 / 20, 2.5, 0.3),
    ...arp('harp', 'C3 G3 C4 E4 G4 C5', 60, 1 / 20, 2.5, 0.32),
    ...arp('harp', 'A3 C4 E4 A4', 64, 1, 2, 0.2),
    ...arp('harp', 'F3 A3 C4 F4', 68, 1, 2, 0.2),
    ...arp('harp', 'D4 F4 A4 C5', 72, 1, 2, 0.2),
    ...arp('harp', 'G3 B3 D4 F4 G4 B4 D5 F5', 76, 1 / 2, 1.2, 0.18),
  );

  // ---- 打击：乐句末轻点，高潮前滚奏渐强 + 镲击，D 段属音轻滚奏引回开头 ----
  add(
    ...chord('timpani', 'C2', 0, 2, 0.24),
    ...chord('timpani', 'G2', 12, 2, 0.26),
    ...chord('timpani', 'C2', 28, 2, 0.3),
    hit('cymbal', 28, 2, 0.16),
    ...line('timpaniRoll', 'G2:4', 44, 0.46),
    hit('swell', 45, 3, 0.4),
    ...chord('timpani', 'C2', 48, 2, 0.78),
    hit('cymbal', 48, 3, 0.52),
    hit('bassDrum', 48, 2, 0.52),
    ...chord('timpani', 'C2', 52, 2, 0.45),
    ...line('timpani', 'G2:1@0.5 G2:1@0.58', 58, 0.5),
    ...chord('timpani', 'C2', 60, 3, 0.78),
    hit('cymbal', 60, 3, 0.46),
    hit('bassDrum', 60, 2, 0.5),
    ...line('timpaniRoll', 'G2:4', 76, 0.22),
    ...arp('glock', 'C6 E6 G6 C7', 48, 1 / 4, 1.5, 0.22),
    ...arp('glock', 'E6 G6 C7', 60, 1 / 4, 1.5, 0.2),
  );
  return { bpm: 104, beats: 80, events: sorted(events) };
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
    ...line('basses', 'A1:4 F1:2 E1:2', 0, 0.5),
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
        ...chord('basses', root, at, 4, 0.44),
        ...line('harp', pluck, at, half === 0 ? 0.2 : 0.16),
      );
    });
  }
  // 前半：双簧管独奏
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

export const RESULT_SCORES: Readonly<Record<ResultTheme, Score>> = {
  victory: { theme: 'victory', bpm: 104, gain: 0.9, intro: victoryIntro(), loop: victoryLoop() },
  defeat: { theme: 'defeat', bpm: 66, gain: 1.05, intro: defeatIntro(), loop: defeatLoop() },
};

export const LEVEL_UP_STING: Phrase = levelUpSting();

/** 段落时长（秒，不含余音） */
export function phraseSeconds(phrase: Phrase): number {
  return phrase.beats * 60 / phrase.bpm;
}
