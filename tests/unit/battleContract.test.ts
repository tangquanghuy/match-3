import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { ActionLogEntry, Gem, GemType } from '@engine/types';
import {
  BATTLE_SCHEMA_VERSION,
  RULESET_VERSION,
  buildBattleResult,
  countCompletedTurns,
  digestString,
  encodeActionLog,
  internalIdFor,
  mapRequestToTeams,
  snapshotToCharacter,
  summarizeEvents,
  validateBattleRequest,
} from '@session/index';
import type { BattleRequest, CombatantSnapshot } from '@session/index';

const KNOWN_SKILLS = new Set(['none', 'lethal']);

function snapshot(over: Partial<CombatantSnapshot> = {}): CombatantSnapshot {
  return {
    externalId: 'hero-1',
    name: '测试角色',
    stats: { hp: 40, attack: 4, armor: 0, magic: 6 },
    manaColors: [BaseColor.Red],
    manaCost: 10,
    skillId: 'none',
    traitIds: [],
    ...over,
  };
}

function request(over: Partial<BattleRequest> = {}): BattleRequest {
  return {
    schemaVersion: BATTLE_SCHEMA_VERSION,
    battleId: 'battle-1',
    requestId: 'req-1',
    rulesetVersion: RULESET_VERSION,
    seed: 12345,
    playerTeam: [
      snapshot({ externalId: 'p1' }),
      snapshot({ externalId: 'p2', manaColors: [BaseColor.Blue, BaseColor.Green] }),
    ],
    enemyTeam: [snapshot({ externalId: 'e1' })],
    ...over,
  };
}

function validate(raw: unknown) {
  return validateBattleRequest(raw, { knownSkillIds: KNOWN_SKILLS });
}

/** 取指定字段的问题码，便于断言而不依赖文案。 */
function codesAt(raw: unknown, path: string): string[] {
  const result = validate(raw);
  if (result.ok) return [];
  return result.issues.filter((i) => i.path === path).map((i) => i.code);
}

describe('BattleRequest 校验（需求 2.4、2.6）', () => {
  describe.each(['playerBanner', 'enemyBanner'] as const)('%s aggregated boosts', (side) => {
    it.each([-1, 0, 1, 2, 3, 4])('accepts integer %s on every base color', (amount) => {
      for (const color of Object.values(BaseColor)) {
        expect(validate(request({ [side]: { boosts: { [color]: amount } } })).ok).toBe(true);
      }
    });

    it.each([-2, 5, 1.5, NaN, Infinity, -Infinity, '3', null, true])('rejects invalid amount %s', (amount) => {
      expect(codesAt(request({ [side]: { boosts: { Red: amount } } }), `${side}.boosts.Red`))
        .toEqual(['stat-range']);
    });

    it('rejects unknown colors and malformed boost containers', () => {
      expect(codesAt(request({ [side]: { boosts: { Pink: 3 } } }), `${side}.boosts.Pink`))
        .toEqual(['stat-range']);
      for (const value of [null, [], {}, { boosts: null }, { boosts: [] }]) {
        expect(codesAt(request({ [side]: value }), side)).toEqual(['bad-type']);
      }
    });
  });

  it('合法 request 通过校验', () => {
    const result = validate(request());
    expect(result.ok).toBe(true);
  });

  it('非对象 request 直接拒绝', () => {
    expect(validate(null).ok).toBe(false);
    expect(validate('x').ok).toBe(false);
    expect(validate([]).ok).toBe(false);
  });

  it('schemaVersion 与 rulesetVersion 不匹配时报错', () => {
    expect(codesAt(request({ schemaVersion: 2 as unknown as 1 }), 'schemaVersion'))
      .toEqual(['schema-version']);
    expect(codesAt(request({ rulesetVersion: '0.9.0' }), 'rulesetVersion'))
      .toEqual(['ruleset-version']);
  });

  it('battleId/requestId 必填，seed 必须是整数', () => {
    expect(codesAt(request({ battleId: '' }), 'battleId')).toEqual(['missing-field']);
    expect(codesAt(request({ requestId: '  ' }), 'requestId')).toEqual(['missing-field']);
    expect(codesAt(request({ seed: 1.5 }), 'seed')).toEqual(['bad-type']);
    expect(codesAt(request({ seed: Number.NaN }), 'seed')).toEqual(['bad-type']);
  });

  it('队伍人数超出 1～4 时报错', () => {
    expect(codesAt(request({ playerTeam: [] }), 'playerTeam')).toEqual(['team-size']);
    const five = Array.from({ length: 5 }, (_, i) => snapshot({ externalId: `p${i}` }));
    expect(codesAt(request({ playerTeam: five }), 'playerTeam')).toEqual(['team-size']);
  });

  it('externalId 在双方之间也必须唯一', () => {
    const dup = request({
      playerTeam: [snapshot({ externalId: 'same' })],
      enemyTeam: [snapshot({ externalId: 'same' })],
    });
    expect(codesAt(dup, 'enemyTeam[0].externalId')).toEqual(['duplicate-external-id']);
  });

  it('属性越界或非整数被拒绝', () => {
    const bad = request({
      playerTeam: [snapshot({ externalId: 'p1', stats: { hp: 0, attack: -1, armor: 1000, magic: 3.5 } })],
    });
    expect(codesAt(bad, 'playerTeam[0].stats.hp')).toEqual(['stat-range']);
    expect(codesAt(bad, 'playerTeam[0].stats.attack')).toEqual(['stat-range']);
    expect(codesAt(bad, 'playerTeam[0].stats.armor')).toEqual(['stat-range']);
    expect(codesAt(bad, 'playerTeam[0].stats.magic')).toEqual(['bad-type']);
    expect(codesAt(request({ playerTeam: [snapshot({ manaCost: 0 })] }), 'playerTeam[0].manaCost'))
      .toEqual(['stat-range']);
  });

  it('法力颜色必须非空、已知且不重复', () => {
    expect(codesAt(request({ playerTeam: [snapshot({ manaColors: [] })] }), 'playerTeam[0].manaColors'))
      .toEqual(['mana-colors']);
    const unknown = request({
      playerTeam: [snapshot({ manaColors: ['Pink' as unknown as BaseColor] })],
    });
    expect(codesAt(unknown, 'playerTeam[0].manaColors[0]')).toEqual(['mana-colors']);
    const dup = request({
      playerTeam: [snapshot({ manaColors: [BaseColor.Red, BaseColor.Red] })],
    });
    expect(codesAt(dup, 'playerTeam[0].manaColors[1]')).toEqual(['mana-colors']);
  });

  it('未注册技能在开战前报错，不进场', () => {
    const bad = request({ playerTeam: [snapshot({ skillId: 'not-registered' })] });
    expect(codesAt(bad, 'playerTeam[0].skillId')).toEqual(['unknown-skill']);
  });

  it('troopTypes 可省略；给了就必须是客户端认识的族名', () => {
    // 省略：合法（老宿主不传）
    expect(validate(request()).ok).toBe(true);

    const bad = request({ playerTeam: [snapshot({ troopTypes: ['NotARace'] })] });
    expect(codesAt(bad, 'playerTeam[0].troopTypes[0]')).toEqual(['unknown-troop-type']);

    const ok = validateBattleRequest(
      request({ playerTeam: [snapshot({ troopTypes: ['Knight'] })] }),
      { knownSkillIds: KNOWN_SKILLS, knownTroopTypes: new Set(['Knight']) },
    );
    expect(ok.ok).toBe(true);
  });

  it('未提供 knownTroopTypes 时任何族名都被拒，避免拼错后静默不吃光环', () => {
    const bad = request({ playerTeam: [snapshot({ troopTypes: ['Knight'] })] });
    expect(codesAt(bad, 'playerTeam[0].troopTypes[0]')).toEqual(['unknown-troop-type']);
  });

  it('troopTypes 不是数组时报类型错误', () => {
    const bad = request({
      playerTeam: [snapshot({ troopTypes: 'Knight' as unknown as string[] })],
    });
    expect(codesAt(bad, 'playerTeam[0].troopTypes')).toEqual(['bad-type']);
  });

  it('特质系统未上线时任何 traitIds 都被拒绝', () => {
    const bad = request({ playerTeam: [snapshot({ traitIds: ['beastbond'] })] });
    expect(codesAt(bad, 'playerTeam[0].traitIds[0]')).toEqual(['unknown-trait']);

    // 一旦注册即可通过
    const ok = validateBattleRequest(bad, {
      knownSkillIds: KNOWN_SKILLS,
      knownTraitIds: new Set(['beastbond']),
    });
    expect(ok.ok).toBe(true);
  });

  it('一次返回全部问题，而不是只报第一个', () => {
    const result = validate(request({ battleId: '', seed: 1.5, playerTeam: [] }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThanOrEqual(3);
  });
});

describe('快照 ↔ 引擎角色映射（需求 2.1、2.3）', () => {
  it('内部 id 按 player 0.. / enemy 4.. 分配', () => {
    expect(internalIdFor('player', 0)).toBe(0);
    expect(internalIdFor('player', 3)).toBe(3);
    expect(internalIdFor('enemy', 0)).toBe(4);
  });

  it('种族透传给引擎角色，省略时为空数组', () => {
    expect(snapshotToCharacter(snapshot({ troopTypes: ['Knight', 'Human'] }), 0).troopTypes)
      .toEqual(['Knight', 'Human']);
    expect(snapshotToCharacter(snapshot(), 0).troopTypes).toEqual([]);
  });

  it('快照转角色：满血、零法力、无状态', () => {
    const ch = snapshotToCharacter(snapshot({ stats: { hp: 33, attack: 7, armor: 2, magic: 9 } }), 5);
    expect(ch).toMatchObject({
      id: 5, maxHp: 33, hp: 33, attack: 7, armor: 2, magic: 9, mana: 0, defeated: false,
    });
    expect(ch.statuses).toEqual([]);
  });

  it('颜色数组是拷贝，改快照不影响已建角色', () => {
    const snap = snapshot({ manaColors: [BaseColor.Red] });
    const ch = snapshotToCharacter(snap, 0);
    snap.manaColors.push(BaseColor.Blue);
    expect(ch.colors).toEqual([BaseColor.Red]);
  });

  it('映射表双向可查并带所属方', () => {
    const { playerTeam, enemyTeam, idMap } = mapRequestToTeams(request());
    expect(playerTeam.player).toBe(PlayerSide.Left);
    expect(enemyTeam.player).toBe(PlayerSide.Right);
    expect(playerTeam.characters.map((c) => c.id)).toEqual([0, 1]);
    expect(enemyTeam.characters.map((c) => c.id)).toEqual([4]);

    expect(idMap.externalIdOf(1)).toBe('p2');
    expect(idMap.internalIdOf('e1')).toBe(4);
    expect(idMap.sideOf(4)).toBe('enemy');
    expect(idMap.externalIdOf(99)).toBeUndefined();
    expect(idMap.entries()).toHaveLength(3);
  });
});

describe('行动摘要与结果导出（需求 3.6）', () => {
  const entry = (over: Partial<ActionLogEntry> = {}): ActionLogEntry => ({
    index: 0,
    side: PlayerSide.Left,
    action: { type: 'swap', from: { row: 7, col: 2 }, to: { row: 6, col: 2 } },
    outcome: 'switched',
    ...over,
  });

  it('行动日志编码稳定且可读', () => {
    const encoded = encodeActionLog([
      entry(),
      entry({ index: 1, side: PlayerSide.Right, action: { type: 'cast', characterId: 4 }, skillId: 'lethal', outcome: 'game-over' }),
    ]);
    expect(encoded).toBe('0:player:swap:7,2>6,2:switched|1:enemy:cast:4:lethal:game-over');
  });

  it('digest 对同输入稳定、对任何差异敏感', () => {
    expect(digestString('abc')).toBe(digestString('abc'));
    expect(digestString('abc')).not.toBe(digestString('abd'));
    expect(digestString('')).toHaveLength(8);
    expect(digestString('abc')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('额外回合不另计回合数', () => {
    expect(countCompletedTurns([
      entry({ index: 0, outcome: 'extra-turn' }),
      entry({ index: 1, outcome: 'extra-turn' }),
      entry({ index: 2, outcome: 'switched' }),
      entry({ index: 3, outcome: 'game-over' }),
    ])).toBe(2);
  });

  it('事件摘要按类型计数', () => {
    expect(summarizeEvents([
      { type: 'turn-end', nextPlayer: PlayerSide.Right },
      { type: 'game-over', winner: PlayerSide.Left },
      { type: 'turn-end', nextPlayer: PlayerSide.Left },
    ])).toEqual([
      { type: 'turn-end', count: 2 },
      { type: 'game-over', count: 1 },
    ]);
  });

  it('战斗未结束时拒绝导出结果', () => {
    const req = request();
    const { playerTeam, enemyTeam, idMap } = mapRequestToTeams(req);
    const state = createGameState(new BoardModel(), playerTeam, enemyTeam);
    expect(() => buildBattleResult({ request: req, state, idMap, events: [] }))
      .toThrow(/尚未结束/);
  });
});

describe('端到端：request → 战斗 → result', () => {
  let gid = 0;
  const g = (type: GemType): Gem => ({ id: gid++, type });

  it('校验、映射、执行致胜技能并导出可回传结果', () => {
    const req = request({
      playerTeam: [snapshot({ externalId: 'p1', skillId: 'lethal' })],
      enemyTeam: [snapshot({ externalId: 'e1', stats: { hp: 10, attack: 4, armor: 0, magic: 1 } })],
    });
    const validated = validate(req);
    expect(validated.ok).toBe(true);
    if (!validated.ok) return;

    const { playerTeam, enemyTeam, idMap } = mapRequestToTeams(validated.request);

    // 不自发匹配的静态棋盘，保证结果只由技能决定
    const board = new BoardModel();
    const palette = [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        board.set({ row: r, col: c }, g(colorGem(palette[(r + c) % palette.length])));
      }
    }

    const registry = new ExtensionRegistry();
    registry.prototypes.set('lethal', {
      segments: [{ kind: 'damage', target: 'enemyFront', scaling: { base: 999, mult: 0 } }],
    });

    const state = createGameState(board, playerTeam, enemyTeam);
    let idg = 800000;
    const engine = new TurnEngine(state, new SeededRNG(validated.request.seed), () => idg++, registry);
    engine.skullChance = 0;

    // 攒满法力后释放
    state.teams[PlayerSide.Left].characters[0].mana = state.teams[PlayerSide.Left].characters[0].manaCost;
    const events = engine.castSkill(0);

    const result = buildBattleResult({ request: validated.request, state, idMap, events });

    expect(result).toMatchObject({
      schemaVersion: BATTLE_SCHEMA_VERSION,
      battleId: 'battle-1',
      requestId: 'req-1',
      rulesetVersion: RULESET_VERSION,
      seed: 12345,
      winner: 'player',
      turns: 1,
      defeatedExternalIds: ['e1'],
      summonedCount: 0,
    });
    expect(result.actionLogDigest).toMatch(/^[0-9a-f]{8}$/);
    // 结果只包含下发的两名角色，且外部 id 正确回映
    expect(result.combatants.map((c) => [c.externalId, c.side, c.defeated])).toEqual([
      ['p1', 'player', false],
      ['e1', 'enemy', true],
    ]);
    expect(result.eventSummary.find((s) => s.type === 'skill-cast')?.count).toBe(1);
    // 引擎内部字段不外泄
    expect(Object.keys(result)).not.toContain('board');
    expect(JSON.stringify(result)).not.toContain('gemId');
  });
});
