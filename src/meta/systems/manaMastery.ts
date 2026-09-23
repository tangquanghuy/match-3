/**
 * 六色法力精通：主角每升一级从随机两色中选一 +1；个人点数解锁武器，
 * 王国旗帜主色加成只提高战斗涌动概率。
 */
import { ALL_BASE_COLORS, BaseColor } from '../../engine/types';
import { manaSurgeChance } from '../../engine/manaSurge';
import { BANNERS } from '../data/banners';
import { fail, type MetaFailure } from '../types';
import type { HeroState, ManaColor, MetaSave } from '../state/schema';

export type { ManaColor };

export const MANA_COLORS: readonly ManaColor[] = ALL_BASE_COLORS;

export const MASTERY_NAME: Record<ManaColor, string> = {
  Red: '火之精通',
  Green: '自然精通',
  Blue: '水之精通',
  Yellow: '空气精通',
  Purple: '魔法精通',
  Brown: '地之精通',
};

export const MASTERY_SHORT: Record<ManaColor, string> = {
  Red: '火',
  Green: '自然',
  Blue: '水',
  Yellow: '空气',
  Purple: '魔法',
  Brown: '地',
};

export const MASTERY_HEX: Record<ManaColor, string> = {
  Red: '#ff5968',
  Green: '#63dc78',
  Blue: '#5eb5ff',
  Yellow: '#ffd45a',
  Purple: '#bd7aff',
  Brown: '#d49355',
};

/** 与棋盘宝石 / `gemSvg` 共用的小写色键 */
export const MASTERY_GEM: Record<ManaColor, string> = {
  Red: 'red',
  Green: 'green',
  Blue: 'blue',
  Yellow: 'yellow',
  Purple: 'purple',
  Brown: 'brown',
};

const COLOR_SET = new Set<string>(MANA_COLORS);

export function emptyManaMastery(): Record<ManaColor, number> {
  return { Red: 0, Green: 0, Blue: 0, Yellow: 0, Purple: 0, Brown: 0 };
}

export function isManaColor(value: string): value is ManaColor {
  return COLOR_SET.has(value);
}

export function personalManaMastery(save: MetaSave): Record<ManaColor, number> {
  const out = emptyManaMastery();
  for (const color of MANA_COLORS) {
    out[color] = Math.max(0, Math.floor(save.hero.manaMastery[color] ?? 0));
  }
  return out;
}

export function spentMasteryPoints(save: MetaSave): number {
  const tracks = personalManaMastery(save);
  return MANA_COLORS.reduce((sum, color) => sum + tracks[color], 0);
}

export function expectedMasteryPoints(level: number): number {
  return Math.max(0, Math.floor(level) - 1);
}

export function pendingMasteryCount(save: MetaSave): number {
  return save.hero.masteryOffers.length;
}

/** 王国等级给旗帜正加成色的涌动加成（上限 +10），不计入武器解锁。 */
export function kingdomMasteryBonus(save: MetaSave): Record<ManaColor, number> {
  const out = emptyManaMastery();
  for (const [kingdom, state] of Object.entries(save.kingdoms)) {
    const add = Math.min(Math.max(0, Math.floor(state.level)), 10);
    if (add <= 0) continue;
    const banner = BANNERS[kingdom];
    if (!banner) continue;
    for (const [color, boost] of Object.entries(banner.boosts)) {
      if (!isManaColor(color) || (boost ?? 0) <= 0) continue;
      out[color] += add;
    }
  }
  return out;
}

export function combatManaMastery(save: MetaSave): Record<ManaColor, number> {
  const personal = personalManaMastery(save);
  const bonus = kingdomMasteryBonus(save);
  const out = emptyManaMastery();
  for (const color of MANA_COLORS) out[color] = personal[color] + bonus[color];
  return out;
}

export function surgeChancePct(mastery: number): string {
  return `${(manaSurgeChance(mastery) * 100).toFixed(1)}%`;
}

export function masteryUnlockColors(manaColors: readonly string[]): ManaColor[] {
  const colors = manaColors.filter(isManaColor);
  if (colors.length >= 6) return [...MANA_COLORS];
  return colors;
}

export function masteryAcquireLabel(colors: readonly ManaColor[], need: number): string {
  if (colors.length >= 6) return `全系精通 ${need}`;
  if (colors.length === 1) return `${MASTERY_NAME[colors[0]!]} ${need}`;
  return `${colors.map((c) => MASTERY_SHORT[c]).join('·')}精通 ${need}`;
}

export function meetsMasteryUnlock(
  save: MetaSave,
  colors: readonly ManaColor[],
  need: number,
): boolean {
  if (colors.length === 0 || need <= 0) return false;
  const tracks = personalManaMastery(save);
  return colors.every((color) => tracks[color] >= need);
}

function offerPairAt(createdAt: number, grantIndex: number): [ManaColor, ManaColor] {
  let t = ((createdAt >>> 0) ^ Math.imul(grantIndex + 1, 0x9e3779b9)) >>> 0;
  const a = t % 6;
  t = Math.imul(t ^ (t >>> 16), 0x85ebca6b) >>> 0;
  let b = t % 6;
  if (b === a) b = (b + 1) % 6;
  return [MANA_COLORS[a]!, MANA_COLORS[b]!];
}

export function catchUpMasteryOffers(hero: HeroState, createdAt: number): void {
  const spent = MANA_COLORS.reduce((sum, color) => sum + Math.max(0, Math.floor(hero.manaMastery[color] ?? 0)), 0);
  const expected = expectedMasteryPoints(hero.level);
  while (hero.masteryOffers.length + spent < expected) {
    hero.masteryOffers.push(offerPairAt(createdAt, spent + hero.masteryOffers.length));
  }
  const overflow = hero.masteryOffers.length + spent - expected;
  if (overflow > 0) hero.masteryOffers.splice(hero.masteryOffers.length - overflow, overflow);
}

export function enqueueMasteryOffers(save: MetaSave, levelsGained: number): void {
  if (levelsGained <= 0) return;
  const before = save.hero.level - levelsGained;
  for (let i = 0; i < levelsGained; i++) {
    save.hero.masteryOffers.push(offerPairAt(save.createdAt, Math.max(0, before - 1) + i));
  }
}

export function pickManaMastery(
  save: MetaSave,
  color: string,
): { ok: true; color: ManaColor; value: number } | MetaFailure {
  if (!isManaColor(color)) return fail('INVALID', '未知的法力色');
  const offer = save.hero.masteryOffers[0];
  if (!offer) return fail('INVALID', '没有待分配的法力精通');
  if (offer[0] !== color && offer[1] !== color) {
    return fail('INVALID', `本次可分配：${MASTERY_NAME[offer[0]]} 或 ${MASTERY_NAME[offer[1]]}`);
  }
  save.hero.manaMastery[color] = Math.max(0, Math.floor(save.hero.manaMastery[color] ?? 0)) + 1;
  save.hero.masteryOffers.shift();
  return { ok: true, color, value: save.hero.manaMastery[color]! };
}

export function hydrateManaMastery(hero: HeroState, rawHero: unknown, createdAt: number): void {
  hero.manaMastery = emptyManaMastery();
  hero.masteryOffers = [];
  if (!rawHero || typeof rawHero !== 'object') {
    catchUpMasteryOffers(hero, createdAt);
    return;
  }
  const raw = rawHero as Record<string, unknown>;
  if (raw.manaMastery && typeof raw.manaMastery === 'object') {
    for (const [key, value] of Object.entries(raw.manaMastery as Record<string, unknown>)) {
      if (!isManaColor(key) || typeof value !== 'number' || !Number.isFinite(value)) continue;
      hero.manaMastery[key] = Math.max(0, Math.floor(value));
    }
  }
  if (Array.isArray(raw.masteryOffers)) {
    for (const entry of raw.masteryOffers) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const a = String(entry[0]);
      const b = String(entry[1]);
      if (!isManaColor(a) || !isManaColor(b) || a === b) continue;
      hero.masteryOffers.push([a, b]);
    }
  }
  catchUpMasteryOffers(hero, createdAt);
}

export function toEngineMastery(tracks: Record<ManaColor, number>): Partial<Record<BaseColor, number>> {
  const out: Partial<Record<BaseColor, number>> = {};
  for (const color of MANA_COLORS) {
    if (tracks[color] > 0) out[color as BaseColor] = tracks[color];
  }
  return out;
}
