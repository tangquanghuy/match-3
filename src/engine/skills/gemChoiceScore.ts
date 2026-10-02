import { BoardModel } from '../BoardModel';
import { MatchResolver } from '../MatchResolver';
import { bigTierOf } from '../comboBias';
import { ALL_BASE_COLORS, PlayerSide, colorGem, skullGem, specialGem } from '../types';
import type { BaseColor, CellPos, Character, GemType } from '../types';
import type { GameState } from '../GameState';
import { canGainMana } from './effects/status';
import type { TransformGemParams } from './effects/gems';

const resolver = new MatchResolver();

export function casterSide(state: GameState, casterId: number): PlayerSide | null {
  if (state.teams[PlayerSide.Left].characters.some(ch => ch.id === casterId)) return PlayerSide.Left;
  if (state.teams[PlayerSide.Right].characters.some(ch => ch.id === casterId)) return PlayerSide.Right;
  return null;
}

export function manaNeeds(characters: readonly Character[]): ReadonlyMap<BaseColor, number> {
  const needs = new Map<BaseColor, number>();
  for (const ch of characters) {
    if (ch.defeated || !canGainMana(ch)) continue;
    const missing = Math.max(0, ch.manaCost - ch.mana);
    for (const color of new Set(ch.colors)) needs.set(color, (needs.get(color) ?? 0) + missing);
  }
  return needs;
}

export function teamColorCounts(characters: readonly Character[]): ReadonlyMap<BaseColor, number> {
  const counts = new Map<BaseColor, number>();
  for (const ch of characters) {
    if (ch.defeated) continue;
    for (const color of new Set(ch.colors)) counts.set(color, (counts.get(color) ?? 0) + 1);
  }
  return counts;
}

export function transformOutput(
  params: TransformGemParams, caster: Character | undefined, chosenColor?: BaseColor,
): GemType | null {
  if (params.toSpecial) {
    const spec = typeof params.toSpecial === 'string' ? { kind: params.toSpecial } : params.toSpecial;
    return specialGem(spec.kind, spec.tier, spec.color);
  }
  if (params.spiritColorFromSource) return null;
  if (params.to === 'SKULL') return skullGem();
  const color = params.to === 'CASTER' ? caster?.colors[0]
    : params.to === 'CHOSEN' ? chosenColor
      : ALL_BASE_COLORS.includes(params.to as BaseColor) ? params.to as BaseColor : undefined;
  return color ? colorGem(color) : null;
}

export function sameGemType(a: GemType, b: GemType): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'color' && b.kind === 'color') return a.color === b.color;
  if (a.kind === 'skull' && b.kind === 'skull') return a.variant === b.variant;
  return a.kind === 'special' && b.kind === 'special'
    && a.spec.kind === b.spec.kind && a.spec.tier === b.spec.tier && a.spec.color === b.spec.color;
}

/** Priority: useful 4/5 > any 4/5 > useful immediate 3 > other legal choices. */
export function transformedMatchScore(
  board: BoardModel, changes: readonly CellPos[], output: GemType, needs: ReadonlyMap<BaseColor, number>,
): readonly number[] {
  if (changes.length === 0) return [0, 0, 0, 0];
  const trial = board.clone();
  const changed = new Set(changes.map(pos => `${pos.row},${pos.col}`));
  for (const pos of changes) {
    const gem = trial.get(pos);
    if (gem) gem.type = output;
  }
  let usefulBig = 0, anyBig = 0, usefulSmall = 0, usefulMana = 0, cells = 0;
  for (const group of resolver.findMatches(trial)) {
    if (!group.cells.some(pos => changed.has(`${pos.row},${pos.col}`))) continue;
    const tier = bigTierOf(group);
    const need = group.settle.kind === 'color' ? needs.get(group.settle.color) ?? 0 : 0;
    anyBig = Math.max(anyBig, tier);
    if (need > 0) {
      usefulMana += need * group.cells.length;
      if (tier > 0) usefulBig = Math.max(usefulBig, tier);
      else usefulSmall += group.cells.length;
    }
    cells += group.cells.length;
  }
  const priority = usefulBig > 0 ? 3 : anyBig > 0 ? 2 : usefulSmall > 0 ? 1 : 0;
  return [priority, usefulBig || anyBig, usefulMana, cells];
}

export function compareChoiceScores(a: readonly number[], b: readonly number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const difference = (a[i] ?? 0) - (b[i] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
