import { BoardModel } from './BoardModel';
import { GravitySystem } from './GravitySystem';
import { SeededRNG } from './rng';
import { specialGem, type CellPos, type Gem } from './types';
import type { GameEvent, GemMergeEvent } from './events';

export const huntPos = (index: number): CellPos => ({ row: Math.floor(index / BoardModel.COLS), col: index % BoardModel.COLS });
export const huntType = (tier: number) => specialGem('bootyGem', tier + 1);
export function createHuntBoard(cells: readonly number[]): BoardModel {
  const board = new BoardModel();
  cells.forEach((tier, i) => board.set(huntPos(i), tier < 0 ? null : { id: i + 1, type: huntType(tier) }));
  return board;
}

/** Authoritative presentation trace; no extra RNG draws and no state stored in the save. */
export class HuntBoardTrace {
  readonly board: BoardModel;
  readonly events: GameEvent[] = [];
  private nextId = 65;
  private gravity = new GravitySystem(new SeededRNG(1), () => this.nextId++);
  constructor(cells: readonly number[]) { this.board = createHuntBoard(cells); }

  swap(from: number, to: number): void {
    const a = huntPos(from), b = huntPos(to);
    this.events.push({ type: 'swap', a, b, gemIdA: this.board.get(a)!.id, gemIdB: this.board.get(b)!.id });
    this.board.swap(a, b);
  }

  merge(groups: { indices: number[]; keep: number; tier: number }[], chainCount: number): void {
    const event: GemMergeEvent = { type: 'gem-merge', chainCount, groups: [] };
    for (const { indices, keep, tier } of groups) {
      const pos = huntPos(keep), gem = this.board.get(pos)!;
      const consumed = indices.filter(i => i !== keep).map(i => ({ pos: huntPos(i), gemId: this.board.get(huntPos(i))!.id }));
      for (const piece of consumed) this.board.set(piece.pos, null);
      gem.type = huntType(tier);
      event.groups.push({ target: { pos, gemId: gem.id, gemType: gem.type }, consumed });
    }
    this.events.push(event);
  }

  refill(cells: readonly number[], chainCount: number): void {
    const moves = this.gravity.settle(this.board);
    const spawns: Extract<GameEvent, { type: 'refill' }>['spawns'] = [];
    cells.forEach((tier, index) => {
      const to = huntPos(index);
      if (this.board.get(to)) return;
      const gem = { id: this.nextId++, type: huntType(tier) };
      this.board.set(to, gem);
      spawns.push({ gemId: gem.id, gemType: gem.type, to });
    });
    this.events.push({ type: 'gravity', chainCount, moves }, { type: 'refill', chainCount, spawns });
  }

  reshuffle(cells: readonly number[]): void {
    const buckets = new Map<number, { gem: Gem; from: CellPos }[]>();
    this.board.forEach((gem, from) => {
      if (!gem || gem.type.kind !== 'special') return;
      const tier = (gem.type.spec.tier ?? 1) - 1;
      const bucket = buckets.get(tier) ?? [];
      bucket.push({ gem, from }); buckets.set(tier, bucket);
    });
    const moves: Extract<GameEvent, { type: 'reshuffle' }>['moves'] = [];
    cells.forEach((tier, i) => {
      const item = buckets.get(tier)!.shift()!, to = huntPos(i);
      this.board.set(to, item.gem);
      moves.push({ gemId: item.gem.id, from: item.from, to });
    });
    this.events.push({ type: 'reshuffle', moves });
  }
}
