import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import {
  extraTurnEffect,
  summonEffect,
  MAX_TEAM_SIZE,
} from '@engine/skills/effects/summon';
import type { SummonTemplate } from '@engine/skills/effects/summon';
import type { EffectContext } from '@engine/skills/effects/context';
import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';
import type { GameState } from '@engine/GameState';

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 50,
    hp: 50,
    attack: 5,
    armor: 0,
    magic: 8,
    colors: [BaseColor.Red],
    manaCost: 20,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated: false,
    ...over,
  };
}

function makeState(leftChars: Character[]): GameState {
  const left: Team = { player: PlayerSide.Left, characters: leftChars };
  const right: Team = { player: PlayerSide.Right, characters: [makeChar(40)] };
  return createGameState(new BoardModel(), left, right);
}

function ctxFor(state: GameState, casterId: number, over: Partial<EffectContext> = {}): EffectContext {
  let gid = 1;
  return { state, casterId, rng: new SeededRNG(1), nextGemId: () => gid++, ...over };
}

const template: SummonTemplate = {
  name: '召唤兽',
  maxHp: 30,
  hp: 30,
  attack: 8,
  armor: 2,
  magic: 4,
  colors: [BaseColor.Green],
  manaCost: 12,
  mana: 0,
  skillId: 'none',
};

describe('extraTurnEffect（需求 10.2）', () => {
  it('发 extra-turn 事件并调用 grantExtraTurn', () => {
    const state = makeState([makeChar(0)]);
    let granted = false;
    const events = extraTurnEffect().apply(ctxFor(state, 0, { grantExtraTurn: () => (granted = true) }));
    expect(events[0]).toMatchObject({ type: 'extra-turn', player: PlayerSide.Left });
    expect(granted).toBe(true);
  });

  it('无 grantExtraTurn 注入也安全（仅发事件）', () => {
    const state = makeState([makeChar(0)]);
    const events = extraTurnEffect().apply(ctxFor(state, 0));
    expect(events[0].type).toBe('extra-turn');
  });
});

describe('summonEffect（需求 10.3, 10.4）', () => {
  it('队伍未满：追加到队尾空位', () => {
    const state = makeState([makeChar(0), makeChar(1)]);
    const events = summonEffect({ source: { template }, troopId: 6001 }).apply(ctxFor(state, 0));
    const team = state.teams[PlayerSide.Left];
    expect(team.characters.length).toBe(3);
    expect(team.characters[2].name).toBe('召唤兽');
    // 新角色 id 唯一（现有最大 id 40 + 1）
    expect(team.characters[2].id).toBe(41);
    expect(events[0]).toMatchObject({
      type: 'summon',
      player: PlayerSide.Left,
      slot: 2,
      troopId: 6001,
      characterId: 41,
    });
  });

  it('存在阵亡位：替换该位', () => {
    const state = makeState([makeChar(0), makeChar(1, { defeated: true }), makeChar(2)]);
    const events = summonEffect({ source: { template }, troopId: 6002 }).apply(ctxFor(state, 0));
    const team = state.teams[PlayerSide.Left];
    expect(team.characters.map((character) => character.name)).toEqual(['C0', 'C2', template.name]);
    expect(team.characters[2].defeated).toBe(false);
    expect(events[0]).toMatchObject({ type: 'summon', slot: 2, destination: 'field' });
  });

  it('队伍已满且无阵亡位：安全跳过（需求 10.3）', () => {
    const full = Array.from({ length: MAX_TEAM_SIZE }, (_, i) => makeChar(i));
    const state = makeState(full);
    const events = summonEffect({ source: { template }, troopId: 6003 }).apply(ctxFor(state, 0));
    expect(events[0]).toMatchObject({
      type: 'summon',
      destination: 'queue',
      slot: 0,
      troopId: 6003,
    });
    expect(state.teams[PlayerSide.Left].characters.length).toBe(MAX_TEAM_SIZE);
    expect(state.teams[PlayerSide.Left].summonQueue?.map((entry) => entry.character.name)).toEqual([template.name]);
  });

  it('nextCharId 注入时用其分配 id', () => {
    const state = makeState([makeChar(0)]);
    const events = summonEffect({ source: { template }, troopId: 6004 }).apply(
      ctxFor(state, 0, { nextCharId: () => 999 }),
    );
    expect(events[0]).toMatchObject({ type: 'summon', characterId: 999 });
    expect(state.teams[PlayerSide.Left].characters[1].id).toBe(999);
  });
});

describe('summonEffect 召唤物来源解析（需求 7.1, 7.3, 7.4）', () => {
  // 模拟 troops 解析：refName → 模板
  const resolveRef = (ref: string): SummonTemplate | null => {
    const db: Record<string, SummonTemplate> = {
      Skeleton: { ...template, name: '骸骨' },
      Goblin: { ...template, name: '哥布林' },
      Orc: { ...template, name: '兽人' },
    };
    return db[ref] ?? null;
  };

  it('ref 来源：按 referenceName 映射属性（需求 7.3）', () => {
    const state = makeState([makeChar(0)]);
    summonEffect({ source: { ref: 'Skeleton' }, resolveRef }).apply(ctxFor(state, 0));
    expect(state.teams[PlayerSide.Left].characters[1].name).toBe('骸骨');
  });

  it('ref 无法解析 → 安全跳过', () => {
    const state = makeState([makeChar(0)]);
    const events = summonEffect({ source: { ref: 'Unknown' }, resolveRef }).apply(ctxFor(state, 0));
    expect(events).toEqual([]);
    expect(state.teams[PlayerSide.Left].characters.length).toBe(1);
  });

  it('randomOf 来源：同种子确定性选取（需求 7.4）', () => {
    const pickNameWithSeed = (seed: number) => {
      const state = makeState([makeChar(0)]);
      summonEffect({ source: { randomOf: ['Skeleton', 'Goblin', 'Orc'] }, resolveRef }).apply(
        ctxFor(state, 0, { rng: new SeededRNG(seed) }),
      );
      return state.teams[PlayerSide.Left].characters[1].name;
    };
    // 同种子两次结果一致
    expect(pickNameWithSeed(7)).toBe(pickNameWithSeed(7));
    // 选中的一定在候选集内
    expect(['骸骨', '哥布林', '兽人']).toContain(pickNameWithSeed(7));
  });
});
