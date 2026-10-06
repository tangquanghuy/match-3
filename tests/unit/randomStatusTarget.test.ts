import { describe, expect, it } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { executePrototype } from '@engine/skills/prototypes';
import { inflict, inflictRandom, skill } from '@engine/skills/builders';
import { RANDOM_NEGATIVE_STATUS_POOL } from '@engine/skills/effects/status';
import { applyStatus } from '@engine/skills/effects/status';
import { canReceiveRandomStatus } from '@engine/randomStatusTarget';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character } from '@engine/types';

function unit(id: number): Character {
  return { id, name: String(id), maxHp: 50, hp: 50, attack: 1, armor: 0, magic: 1,
    colors: [BaseColor.Red], manaCost: 10, mana: 0, skillId: 'test', statuses: [], defeated: false };
}
function fight() {
  const caster = unit(1), ally = unit(2), foes = [unit(11), unit(12), unit(13)];
  const state = createGameState(new BoardModel(),
    { player: PlayerSide.Left, characters: [caster, ally] },
    { player: PlayerSide.Right, characters: foes });
  return { caster, ally, foes, ctx: { state, casterId: 1, rng: new SeededRNG(13), nextGemId: () => 100 } };
}

describe('random status recipient eligibility', () => {
  it('selects only foes without the status, then stops without refreshing when all have it', () => {
    const { foes, ctx } = fight();
    applyStatus(foes[0], { id: 'faerie-fire', turns: 3 });
    applyStatus(foes[1], { id: 'faerie-fire', turns: 3 });
    const spell = skill(inflict('faerie-fire', 'enemyRandom'));
    const first = executePrototype(spell, ctx);
    expect(first.filter(e => e.type === 'status-apply')).toMatchObject([{ targetId: 13 }]);
    const second = executePrototype(spell, ctx);
    expect(second.filter(e => e.type === 'status-apply')).toEqual([]);
  });

  it('uses only unprotected allies in a random ally status segment', () => {
    const { caster, ally, ctx } = fight();
    applyStatus(caster, { id: 'enchanted', turns: 3 });
    const hits = executePrototype(skill(inflict('enchanted', 'allyRandom')), ctx);
    expect(hits.filter(e => e.type === 'status-apply')).toMatchObject([{ targetId: ally.id }]);
  });

  it('handles multiple independent random recipients without picking a protected one', () => {
    const { foes, ctx } = fight();
    applyStatus(foes[0], { id: 'poison', turns: 3 });
    const hits = executePrototype(skill(inflict('poison', 'enemyRandomN', { n: 3 })), ctx);
    expect(hits.filter(e => e.type === 'status-apply').map(e => 'targetId' in e ? e.targetId : -1).sort()).toEqual([12, 13]);
  });

  it('routes random status types to an enemy with a missing effect', () => {
    const { foes, ctx } = fight();
    foes[0].statuses = RANDOM_NEGATIVE_STATUS_POOL.map(id => ({ id, turns: 3,
      ...(id === 'bleed' ? { magnitude: 4 } : {}) }));
    foes[2].defeated = true;
    const hits = executePrototype(skill(inflictRandom('enemyRandom')), ctx);
    expect(hits.filter(e => e.type === 'status-apply').map(e => 'targetId' in e ? e.targetId : -1)).toEqual([12]);
  });

  it('stacks bleed to four on a random recipient, then selects an unfilled target', () => {
    const { foes, ctx } = fight();
    applyStatus(foes[0], { id: 'bleed', turns: 3, magnitude: 3 });
    for (const foe of foes.slice(1)) applyStatus(foe, { id: 'bleed', turns: 3, magnitude: 4 });
    const hits = executePrototype(skill(inflict('bleed', 'enemyRandom')), ctx);
    expect(hits.filter(e => e.type === 'status-apply')).toMatchObject([{ targetId: 11, stacks: 4 }]);
    expect(canReceiveRandomStatus(foes[0], 'bleed')).toBe(false);
    expect(executePrototype(skill(inflict('bleed', 'enemyRandom')), ctx)
      .filter(e => e.type === 'status-apply')).toEqual([]);
  });
});
