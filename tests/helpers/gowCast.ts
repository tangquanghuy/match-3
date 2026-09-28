/**
 * Shared real-cast harness for GoW skill review (replaces the per-lane copies of setup()).
 *
 *   const r = castSpell({ key: 'troop:6472' });            // entity defaults: skill id, cost, colours
 *   const r = castSpell({ skill: '7470', cost: 15, colors: [BaseColor.Blue], side: PlayerSide.Right, magic: 0 });
 *   r.summary  -> compact observed behaviour (order of effects, per-unit deltas, gems, turn)
 *   r.f        -> fixture (state, engine, caster, allies, enemies) for extra assertions
 *
 * Pure TS, no vitest import: used by tests and by scripts/gow-trace.ts (vite-node).
 * Real TurnEngine.castSkill with the full skill library and summon resolvers, like App/battleSimulation.
 */
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import { TurnEngine } from '@engine/TurnEngine';
import { FixedTargetChooser, prototypeChosenTargetMode } from '@engine/skills/targetChooser';
import { FixedColorChooser } from '@engine/skills/colorChooser';
import { FixedCellChooser } from '@engine/skills/cellChooser';
import { setSummonTemplateResolver } from '@engine/traits';
import { BaseColor, PlayerSide, colorGem, skullGem, type Character, type GemType } from '@engine/types';
import type { GameEvent } from '@engine/events';
import type { SkillPrototype } from '@engine/skills/prototypes';
import { TROOPS, troopToSummonTemplate } from '../../src/data/troops';
import weaponData from '../../src/data/weapons.json';
import { goldForSide, setGoldForSide } from '@engine/battleGold';
import { damageCharacter } from './damageFixture';

export const registry = new ExtensionRegistry();
registerSkillLibrary(registry.prototypes);
setSummonTemplateResolver((spec: { referenceName: string }) => troopToSummonTemplate(spec.referenceName));

export type BoardFn = (r: number, c: number) => GemType | null;
const SIX = [BaseColor.Red, BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
/** All six colours, 10-11 each, no line of three anywhere: row r is SIX shifted by 2r. */
export const sixColourBoard: BoardFn = (r, c) => colorGem(SIX[(2 * r + c) % 6]);
/** Default review board: six colours plus 5 isolated Skulls, so skull removal/counting skills show an effect. */
const SKULL_CELLS = new Set(['0,0', '2,5', '4,2', '6,6', '7,3']);
/** Plus one legal move (row 1: G G P G, swap (1,2)<->(1,3)) so a kept turn does not trigger a deadlock reshuffle. */
export const reviewBoard: BoardFn = (r, c) => (SKULL_CELLS.has(`${r},${c}`) ? skullGem()
  : r === 1 && (c === 1 || c === 3) ? colorGem(BaseColor.Green) : sixColourBoard(r, c));
/** Board helper: base pattern with explicit overrides, e.g. withCells(sixColourBoard, { '3,3': skullGem() }). */
export const withCells = (base: BoardFn, over: Record<string, GemType | null>): BoardFn => (r, c) => (`${r},${c}` in over ? over[`${r},${c}`] : base(r, c));

/** Distinct Life/Armor so front/back, strongest/weakest and random picks are all distinguishable. */
/** Enemies have some mana (drain/burn visible) and armor on the default target E11 (armor removal visible). */
/** E10/E13 carry a harmless positive status (Enraged) so Dispel is visible; every colour is used by someone. */
const ench = [{ id: 'rage', turns: 99 }] as Character['statuses']; // Enraged: no turn-start side effect
export const DEFAULT_ENEMIES: Partial<Character>[] = [
  { hp: 600, maxHp: 600, armor: 5, mana: 6, colors: [BaseColor.Red], statuses: ench },
  { hp: 900, maxHp: 900, armor: 10, mana: 8, colors: [BaseColor.Yellow, BaseColor.Blue] },
  { hp: 300, maxHp: 300, armor: 12, mana: 4, colors: [BaseColor.Purple] },
  { hp: 800, maxHp: 800, armor: 3, mana: 10, colors: [BaseColor.Green, BaseColor.Brown], statuses: ench },
];
/** Two allies (team has a free slot for summons); A1 is damaged and Poisoned so heals/cleanses are visible. */
export const DEFAULT_ALLIES: Partial<Character>[] = [
  { hp: 500, maxHp: 700, armor: 4, colors: [BaseColor.Blue], statuses: [{ id: 'poison', turns: 99 }] as Character['statuses'] },
  { hp: 650, maxHp: 650, armor: 8, colors: [BaseColor.Red, BaseColor.Yellow] },
];
/** Both sides start with gold so steal/take-gold effects are visible. */
export const DEFAULT_GOLD = 100;

export interface EntitySkill { key: string; skill: string; numericSkill: string; cost: number; colors: BaseColor[]; kind: 'troop' | 'weapon'; troopTypes?: string[]; kingdom?: string }
type WeaponRow = { id: number; referenceName: string; manaCost: number; manaColors: string[]; spell: { id: number } };
const WEAPONS = weaponData as unknown as WeaponRow[];
/** Skill binding exactly as the game uses it: troops `String(spell.id)`, weapons `gw_<referenceName>`. */
export function entitySkill(key: string): EntitySkill {
  const [kind, raw] = key.split(':'); const id = Number(raw);
  if (kind === 'troop') {
    const t = TROOPS.find(x => x.id === id); if (!t) throw new Error(`unknown ${key}`);
    return { key, kind, skill: String(t.spell.id), numericSkill: String(t.spell.id), cost: t.manaCost, colors: [...t.manaColors] as BaseColor[],
      troopTypes: (t as { troopTypes?: string[] }).troopTypes, kingdom: (t as { kingdom?: string }).kingdom };
  }
  const w = WEAPONS.find(x => x.id === id); if (!w) throw new Error(`unknown ${key}`);
  return { key, kind: 'weapon', skill: `gw_${w.referenceName}`, numericSkill: String(w.spell.id), cost: w.manaCost, colors: w.manaColors as BaseColor[] };
}

export interface CastOpts {
  key?: string; skill?: string; cost?: number; colors?: BaseColor[];
  side?: PlayerSide; magic?: number; caster?: Partial<Character>;
  /** allies after the caster (ids 1..), allies before the caster (ids 5..) */
  allies?: Partial<Character>[]; before?: Partial<Character>[]; enemies?: Partial<Character>[];
  board?: BoardFn; seed?: number; skullChance?: number;
  /** chosen target id; default: 11 (2nd enemy) for enemy-chosen skills, 1 (1st ally) for ally-chosen */
  target?: number; color?: BaseColor; cell?: { row: number; col: number };
  ascension?: number;
}
export function setupCast(o: CastOpts) {
  const ent = o.key ? entitySkill(o.key) : null;
  const skill = o.skill ?? ent!.skill; const cost = o.cost ?? ent?.cost ?? 10; const colors = o.colors ?? ent?.colors ?? [BaseColor.Red];
  const side = o.side ?? PlayerSide.Left; const opponent = side === PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left;
  const board = new BoardModel(); const fn = o.board ?? reviewBoard; let id = 1;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const t = fn(r, c); board.set({ row: r, col: c }, t ? { id: id++, type: t } : null); }
  // Deep-copy every template: engine effects mutate statuses/colors in place, and shared default objects
  // would leak one cast's statuses into every later cast in the same process.
  const fresh = (p: Partial<Character>): Partial<Character> => structuredClone(p);
  const caster = damageCharacter(0, fresh({ skillId: skill, mana: cost, manaCost: cost, colors: [...colors], magic: o.magic ?? 10,
    hp: 900, maxHp: 1000, statuses: [{ id: 'poison', turns: 99 }] as Character['statuses'],
    troopTypes: ent?.troopTypes, kingdom: ent?.kingdom, ...o.caster } as Partial<Character>));
  const before = (o.before ?? []).map((a, i) => damageCharacter(5 + i, fresh({ mana: 0, ...a })));
  const allies = (o.allies ?? DEFAULT_ALLIES).map((a, i) => damageCharacter(1 + i, fresh({ mana: 0, ...a })));
  const enemies = (o.enemies ?? DEFAULT_ENEMIES).map((e, i) => damageCharacter(10 + i, fresh({ mana: 0, ...e })));
  const mine = { player: side, characters: [...before, caster, ...allies] }; const theirs = { player: opponent, characters: [...enemies] };
  const state = side === PlayerSide.Left ? createGameState(board, mine, theirs) : createGameState(board, theirs, mine, PlayerSide.Right);
  state.activePlayer = side;
  if (o.ascension !== undefined) (state as { ascension?: number }).ascension = o.ascension;
  let gid = 5000;
  const engine = new TurnEngine(state, new SeededRNG(o.seed ?? 42), () => gid++, registry);
  engine.skullChance = o.skullChance ?? 0;
  engine.setSummonResolver(ref => troopToSummonTemplate(ref));
  engine.setSummonKingdomResolver(k => TROOPS.filter(t => t.kingdom === k).map(t => t.referenceName));
  const proto = registry.prototypes.get(skill) as SkillPrototype | undefined;
  const mode = proto ? prototypeChosenTargetMode(proto) : null;
  const defaultTarget = mode && /ally/i.test(String(mode)) ? allies[0]?.id ?? 0 : enemies[1]?.id ?? enemies[0]?.id ?? 10;
  engine.setTargetChooser(new FixedTargetChooser(o.target ?? defaultTarget));
  engine.setColorChooser(new FixedColorChooser(o.color ?? BaseColor.Blue));
  setGoldForSide(state, side, DEFAULT_GOLD); setGoldForSide(state, opponent, DEFAULT_GOLD);
  engine.setCellChooser(new FixedCellChooser(o.cell ?? { row: 3, col: 3 }));
  const units = [...before, caster, ...allies, ...enemies];
  const snap = snapshot(units);
  const gold0 = { mine: goldForSide(state, side), theirs: goldForSide(state, opponent) };
  return { board, state, engine, caster, allies, before, enemies, units, side, opponent, skill, proto, snap, gold0,
    cast: () => engine.castSkill(caster.id) };
}
export type CastFixture = ReturnType<typeof setupCast>;

type UnitSnap = { hp: number; maxHp: number; armor: number; attack: number; magic: number; mana: number; statuses: string[]; defeated: boolean; name: string; skillId: string };
function snapshot(units: Character[]): Map<number, UnitSnap> {
  return new Map(units.map(u => [u.id, { hp: u.hp, maxHp: u.maxHp, armor: u.armor, attack: u.attack, magic: u.magic, mana: u.mana,
    statuses: u.statuses.map(s => s.id), defeated: u.defeated, name: u.name, skillId: u.skillId }]));
}
export const gemLabel = (t: GemType | null | undefined): string => !t ? 'empty'
  : t.kind === 'color' ? t.color : t.kind === 'special' ? `${t.spec.kind}${'color' in t.spec && t.spec.color ? '/' + t.spec.color : ''}` : t.kind;
/** Events up to the first match elimination = the spell itself (cascades excluded). */
export const skillPhase = (ev: GameEvent[]) => { const i = ev.findIndex(e => e.type === 'elimination'); return i < 0 ? ev : ev.slice(0, i); };

export interface CastSummary {
  refused: boolean;
  /** Ordered spell effects (skill phase only): "dmg E11 14", "status E11 +burning", "create Red x10", ... */
  order: string[];
  /** Per-unit changes over the whole cast (incl. cascades): only units that changed. */
  units: Record<string, string>;
  gems: { created: Record<string, number>; destroyed: number; exploded: number; cascade: boolean };
  extraTurn: string | null; turnKept: boolean; casterMana: number;
  economy: Record<string, number>; summons: string[];
}
const who = (f: CastFixture, id: number) => id === f.caster.id ? 'C' : f.enemies.some(e => e.id === id) ? `E${id}` : `A${id}`;
export function summarize(f: CastFixture, ev: GameEvent[]): CastSummary {
  const order: string[] = []; const created: Record<string, number> = {}; let destroyed = 0, exploded = 0;
  const bump = (k: string, n = 1) => { created[k] = (created[k] ?? 0) + n; };
  const group = (xs: GemType[]) => { const m: Record<string, number> = {}; for (const t of xs) m[gemLabel(t)] = (m[gemLabel(t)] ?? 0) + 1; return Object.entries(m).map(([k, n]) => `${k} x${n}`).join(', '); };
  // Whole cast, match-resolution noise dropped; '~cascade~' marks the first match so spell steps resolved after a
  // cascade stay visible (engine may settle the board mid-spell).
  let cascadeMarked = false;
  for (const e of ev) {
    if (e.type === 'turn-end') break; // opponent turn-start processing is not part of the spell
    if (e.type === 'elimination') { if (!cascadeMarked) { order.push('~cascade~'); cascadeMarked = true; } continue; }
    if (e.type === 'skill-damage' && e.skullBurst) order.push(`skulls ${who(f, e.targetId)} ${e.damage}`);
    else if (e.type === 'skill-damage') order.push(`dmg ${who(f, e.targetId)} ${e.damage}${e.range !== 'single' ? ` (${e.range})` : ''}${e.devoured ? ' devoured' : ''}`);
    else if (e.type === 'status-apply') order.push(`status ${who(f, e.targetId)} +${e.statusId}`);
    else if (e.type === 'status-cleanse') order.push(`cleanse ${who(f, e.targetId)} -${e.statusIds.join('/')}`);
    else if (e.type === 'buff') order.push(`buff ${who(f, e.targetId)} ${e.stat}${e.amount >= 0 ? '+' : ''}${e.amount}${e.maxHpGain ? ` max+${e.maxHpGain}` : ''}`);
    else if (e.type === 'gem-create') { if (!cascadeMarked) e.spawns.forEach(s => bump(gemLabel(s.gemType))); order.push(`create ${group(e.spawns.map(s => s.gemType))}`); }
    else if (e.type === 'gem-transform') { if (!cascadeMarked) e.changes.forEach(s => bump(gemLabel(s.to))); order.push(`convert ${group(e.changes.map(s => s.from))} -> ${group(e.changes.map(s => s.to))}`); }
    else if (e.type === 'gem-destroy') { if (!cascadeMarked) destroyed += e.cells.length; order.push(`destroy ${e.cells.length} (${group(e.cells.map(c => c.gemType))})`); }
    else if (e.type === 'gem-explode') { if (!cascadeMarked) exploded += e.cells.length; order.push(`explode ${e.cells.length}`); }
    else if (e.type === 'summon') order.push(`summon ${e.player === f.side ? 'mine' : 'theirs'} troop:${e.troopId}`);
    else if (e.type === 'troop-transform') order.push(`transform ${who(f, e.targetId)} -> ${e.name}`);
    else if (e.type === 'troop-reposition') order.push(`move ${who(f, e.targetId)} ${e.to}`);
    else if (e.type === 'team-shuffle') order.push(`shuffle ${e.player === f.side ? 'mine' : 'theirs'}`);
    else if (e.type === 'economy-gain') order.push(`${e.currency}+${e.amount}`);
    else if (e.type === 'storm-change') order.push(`storm ${e.color ?? e.dropKind ?? 'none'} ${e.reason}`);
    else if (e.type === 'flee') order.push(`flee ${who(f, e.characterId)}`);
    else if (e.type === 'defeat') order.push(`defeat ${who(f, e.characterId)}`);
    else if (e.type === 'special-gem-trigger') order.push(`trigger ${e.kind}`);
    else if (e.type === 'extra-turn') order.push(`extra-turn ${e.source}`);
    else if (e.type === 'reshuffle') order.push('jumble board');
    else if (e.type === 'status-expire' && !cascadeMarked) order.push(`remove ${who(f, e.targetId)} -${e.statusId}`);
  }
  // Unit deltas replayed from events up to turn-end (the state after castSkill already includes the opponent's
  // turn start: natural cleanses, DoT ticks, mana from Enchanted...).
  type Run = { hp: number; maxHp: number; armor: number; attack: number; magic: number; mana: number; add: string[]; rem: string[]; flags: string[] };
  const run = new Map<number, Run>(); const fresh = new Set<number>();
  const R = (id: number): Run => { let r = run.get(id); if (!r) { const s = f.snap.get(id); r = { hp: s?.hp ?? 0, maxHp: s?.maxHp ?? 0, armor: s?.armor ?? 0, attack: s?.attack ?? 0, magic: s?.magic ?? 0, mana: s?.mana ?? 0, add: [], rem: [], flags: [] }; run.set(id, r); } return r; };
  for (const e of ev) {
    if (e.type === 'turn-end') break;
    if (e.type === 'skill-damage') { const r = R(e.targetId); r.hp = e.resultingHp; r.armor = e.resultingArmor; }
    else if (e.type === 'skull-damage') { const r = R((e as { targetId: number }).targetId); const x = e as unknown as { resultingHp?: number; resultingArmor?: number }; if (x.resultingHp !== undefined) r.hp = x.resultingHp; if (x.resultingArmor !== undefined) r.armor = x.resultingArmor; }
    else if (e.type === 'buff') { const r = R(e.targetId); const k = e.stat === 'hp' ? 'hp' : e.stat; (r as unknown as Record<string, number>)[k] += e.amount; if (e.maxHpGain) r.maxHp += e.maxHpGain; }
    else if (e.type === 'mana-gain') { const x = e as unknown as { characterId: number; amount: number }; if (x.characterId !== f.caster.id) R(x.characterId).mana += x.amount; }
    else if (e.type === 'status-apply') { const r = R(e.targetId); r.rem = r.rem.filter(x => x !== e.statusId); if (!r.add.includes(e.statusId)) r.add.push(e.statusId); }
    else if (e.type === 'status-cleanse' || e.type === 'status-expire') { const r = R(e.targetId); for (const id of e.type === 'status-cleanse' ? e.statusIds : [e.statusId]) { if (r.add.includes(id)) r.add = r.add.filter(x => x !== id); else if (!r.rem.includes(id)) r.rem.push(id); } }
    else if (e.type === 'defeat') R(e.characterId).flags.push('DEAD');
    else if (e.type === 'flee') R(e.characterId).flags.push('FLED');
    else if (e.type === 'troop-transform') R(e.targetId).flags.push(`now ${e.name}`);
    else if (e.type === 'summon') fresh.add(e.characterId);
  }
  const units: Record<string, string> = {};
  const live = new Map([f.state.teams.Left, f.state.teams.Right].flatMap(t => t.characters).map(u => [u.id, u]));
  for (const id of fresh) { const u = live.get(id); if (u && !f.snap.has(id)) units[who(f, id)] = `new ${u.name} hp${u.hp} atk${u.attack} arm${u.armor} mag${u.magic}`; }
  for (const [id, r] of run) {
    const s = f.snap.get(id); if (!s) continue; const parts: string[] = [];
    const d = (a: number, b: number, label: string) => { if (a !== b) parts.push(`${label}${b - a >= 0 ? '+' : ''}${b - a}`); };
    d(s.hp, r.hp, 'hp'); d(s.maxHp, r.maxHp, 'max'); d(s.armor, r.armor, 'arm'); d(s.attack, r.attack, 'atk'); d(s.magic, r.magic, 'mag'); if (id !== f.caster.id) d(s.mana, r.mana, 'mana');
    if (r.add.length) parts.push(`+${r.add.join('+')}`); if (r.rem.length) parts.push(`-${r.rem.join('-')}`); parts.push(...r.flags);
    if (parts.length) units[who(f, id)] = parts.join(' ');
  }
  const economy: Record<string, number> = {};
  for (const e of ev) if (e.type === 'economy-gain') economy[e.currency] = (economy[e.currency] ?? 0) + e.amount;
  const gm = goldForSide(f.state, f.side) - f.gold0.mine, gt = goldForSide(f.state, f.opponent) - f.gold0.theirs;
  if (gm) economy.goldMine = gm; if (gt) economy.goldTheirs = gt;
  const extra = ev.find(e => e.type === 'extra-turn') as { source: string } | undefined;
  return { refused: ev.length === 0, order, units, gems: { created, destroyed, exploded, cascade: ev.some(e => e.type === 'elimination') },
    extraTurn: extra?.source ?? null, turnKept: f.state.activePlayer === f.side, casterMana: f.caster.mana, economy,
    summons: ev.filter(e => e.type === 'summon').map(e => `troop:${(e as { troopId: number }).troopId}`) };
}
/** Standard review scenarios (trace table and golden locks use exactly these). */
export const SCENARIOS: Record<'L10' | 'R10' | 'L0' | 'K', Omit<CastOpts, 'key'>> = {
  L10: {}, R10: { side: PlayerSide.Right }, L0: { magic: 0 },
  /** every enemy dies to any hit, so "if the enemy dies" steps fire */
  K: { enemies: [0, 1, 2, 3].map(() => ({ hp: 1, maxHp: 1, armor: 0, mana: 5 })) },
};
export function scenarioLines(key: string): Record<keyof typeof SCENARIOS, string> {
  return Object.fromEntries(Object.entries(SCENARIOS).map(([k, o]) => [k, summaryLine(castSpell({ key, ...o }).summary)])) as Record<keyof typeof SCENARIOS, string>;
}
export function castSpell(o: CastOpts) {
  const f = setupCast(o); const events = f.cast(); return { f, events, summary: summarize(f, events) };
}
/** Compact one-line form of a summary, for trace tables and golden files. */
export function summaryLine(s: CastSummary): string {
  if (s.refused) return 'REFUSED';
  const u = Object.entries(s.units).map(([k, v]) => `${k}:${v}`).join(' | ');
  return [s.order.join(' ; ') || '(no spell events)', u && `=> ${u}`, s.extraTurn && `extra:${s.extraTurn}`, s.gems.cascade && 'cascade',
    Object.keys(s.economy).length ? `eco:${JSON.stringify(s.economy)}` : ''].filter(Boolean).join('  ');
}
