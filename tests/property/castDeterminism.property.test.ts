import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { FixedColorChooser } from '@engine/skills/colorChooser';
import {
  dmg, dmgAll, heal, createGems, destroyColor, transform, inflict, extraTurn, CHOSEN,
} from '@engine/skills/builders';
import type { SkillPrototype, EffectSegment } from '@engine/skills/prototypes';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Character, Team, Gem, GemType } from '@engine/types';

let gid = 0;
function g(type: GemType): Gem {
  return { id: gid++, type };
}

function makeChar(id: number): Character {
  return {
    id, name: `C${id}`, maxHp: 50, hp: 50, attack: 5, armor: 0, magic: 5,
    colors: [BaseColor.Red], manaCost: 8, mana: 8, skillId: 'x', statuses: [], defeated: false,
  };
}

// 随机段（含选色段）
const segArb: fc.Arbitrary<EffectSegment> = fc.oneof(
  fc.integer({ min: 0, max: 10 }).map((b) => dmg('enemyRandom', b) as EffectSegment),
  fc.integer({ min: 0, max: 8 }).map((b) => dmgAll(b) as EffectSegment),
  fc.integer({ min: 0, max: 6 }).map((b) => heal('allySelf', b) as EffectSegment),
  fc.constant(createGems(CHOSEN, 5) as EffectSegment),
  fc.constant(destroyColor(CHOSEN) as EffectSegment),
  fc.constant(transform(CHOSEN, BaseColor.Blue) as EffectSegment),
  fc.constant(inflict('poison', 'enemyAll') as EffectSegment),
  fc.constant(extraTurn() as EffectSegment),
);

function runCast(proto: SkillPrototype, seed: number, chosen: BaseColor): string {
  gid = 0;
  const board = new BoardModel();
  const palette = [BaseColor.Red, BaseColor.Blue, BaseColor.Green, BaseColor.Yellow];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    board.set({ row: r, col: c }, g(colorGem(palette[(r * 2 + c) % palette.length])));
  }
  const left: Team = { player: PlayerSide.Left, characters: [makeChar(0)] };
  const right: Team = { player: PlayerSide.Right, characters: [makeChar(4), makeChar(5)] };
  const state = createGameState(board, left, right);
  const registry = new ExtensionRegistry();
  registry.prototypes.set('x', proto);
  let idg = 200000;
  const engine = new TurnEngine(state, new SeededRNG(seed), () => idg++, registry);
  engine.skullChance = 0;
  engine.setColorChooser(new FixedColorChooser(chosen));
  return JSON.stringify(engine.castSkill(0));
}

describe('技能释放确定性（需求 10.3）', () => {
  it('相同状态 + 种子 + 选色 → 相同事件流', () => {
    fc.assert(
      fc.property(
        fc.array(segArb, { minLength: 0, maxLength: 5 }),
        fc.integer({ min: 1, max: 100 }),
        fc.constantFrom(...[BaseColor.Red, BaseColor.Blue, BaseColor.Green]),
        (segments, seed, chosen) => {
          const proto: SkillPrototype = { segments };
          expect(runCast(proto, seed, chosen)).toBe(runCast(proto, seed, chosen));
        },
      ),
    );
  });

  it('事件流首为 skill-cast、game-over（若有）在末尾', () => {
    fc.assert(
      fc.property(
        fc.array(segArb, { minLength: 0, maxLength: 5 }),
        fc.integer({ min: 1, max: 100 }),
        (segments, seed) => {
          const raw = runCast({ segments }, seed, BaseColor.Red);
          const events = JSON.parse(raw) as { type: string }[];
          expect(events[0]?.type).toBe('skill-cast');
          const go = events.findIndex((e) => e.type === 'game-over');
          if (go >= 0) expect(go).toBe(events.length - 1);
        },
      ),
    );
  });
});
