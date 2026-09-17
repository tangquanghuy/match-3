/**
 * 武器法术语义冒烟（窗口 K-B）。
 *
 * 抽 10 条代表性武器法术（直伤/真伤/增幅比/状态/宝石操作/增益/额外回合/经济/风暴/随机状态），
 * 经 TurnEngine.castSkill 全管线执行，断言事件形态与战场状态变化。
 * 代表集覆盖批次里的主要效果段家族；逐条断言值以种子化棋盘保持确定性。
 */
import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { ExtensionRegistry } from '@engine/registry';
import { SeededRNG } from '@engine/rng';
import { collectWeaponCurated } from '@engine/skills/curated';
import { BaseColor, PlayerSide, colorGem } from '@engine/types';
import type { Character, Team, GemType } from '@engine/types';
import { troopToSummonTemplate } from '../../src/data/troops';

const { byId: weaponById } = collectWeaponCurated();

let gid = 0;
function fillBoard(board: BoardModel): void {
  const palette: GemType[] = [
    colorGem(BaseColor.Red), colorGem(BaseColor.Blue), colorGem(BaseColor.Green),
    colorGem(BaseColor.Yellow), colorGem(BaseColor.Purple), colorGem(BaseColor.Brown),
  ];
  // 仅铺 6 行，留 2 行空位：宝石创造段需要空格
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 8; c++) {
      board.set({ row: r, col: c }, { id: gid++, type: palette[(r * 3 + c * 5) % 6] });
    }
  }
}

function makeChar(id: number, over: Partial<Character> = {}): Character {
  return {
    id, name: `C${id}`, maxHp: 60, hp: 45, attack: 8, armor: 4, magic: 7,
    colors: [BaseColor.Red, BaseColor.Blue], manaCost: 12, mana: 12,
    skillId: 'none', statuses: [], defeated: false,
    troopTypes: ['Human'], ...over,
  };
}

interface Harness {
  events: { type: string }[];
  state: ReturnType<typeof createGameState>;
}

/** 建局 + 注册武器技能 + castSkill(casterId)；rng 固定种子保证确定性 */
function castWeapon(spellId: number, opts: {
  seed?: number;
  allyTroopTypes?: string[];
  enemyTroopTypes?: string[];
} = {}): Harness {
  const proto = weaponById.get(spellId);
  if (!proto) throw new Error(`spell ${spellId} 未编译`);
  const board = new BoardModel();
  gid = 0;
  fillBoard(board);
  const left: Team = {
    player: PlayerSide.Left,
    characters: [
      makeChar(0, { skillId: String(spellId), troopTypes: opts.allyTroopTypes ?? ['Human'] }),
      makeChar(1, { troopTypes: opts.allyTroopTypes ?? ['Human'] }),
      makeChar(2, { troopTypes: opts.allyTroopTypes ?? ['Human'] }),
    ],
  };
  const right: Team = {
    player: PlayerSide.Right,
    characters: [makeChar(4), makeChar(5), makeChar(6)],
  };
  const state = createGameState(board, left, right);
  const registry = new ExtensionRegistry();
  registry.prototypes.set(String(spellId), proto);
  let idg = 200000;
  const engine = new TurnEngine(state, new SeededRNG(opts.seed ?? 20260917), () => idg++, registry);
  engine.skullChance = 0;
  engine.setSummonResolver((ref) => troopToSummonTemplate(ref));
  const events = engine.castSkill(0);
  return { events, state };
}

function typesOf(events: { type: string }[]): string[] {
  return events.map((e) => e.type);
}

describe('武器法术语义冒烟（TurnEngine 全管线）', () => {
  it('7066 骑士之剑：直伤族 → skill-damage，队首敌人掉血', () => {
    const { events, state } = castWeapon(7066);
    const damages = events.filter((e) => e.type === 'skill-damage');
    expect(damages.length).toBeGreaterThan(0);
    const front = state.teams[PlayerSide.Right].characters[0];
    expect(front.hp, '队首敌人应掉血').toBeLessThan(front.maxHp);
  });

  it('7077 复仇弯刀：真实伤害族 → trueDmg 段，伤害无视护甲', () => {
    const { events, state } = castWeapon(7077);
    expect(typesOf(events)).toContain('skill-damage');
    const target = state.teams[PlayerSide.Right].characters[0];
    // trueDmg enemyChosen：魔法 7 + 3 = 10 点直扣生命（起始 hp 45）；护甲 4 不动
    expect(target.hp).toBe(45 - 10);
    expect(target.armor).toBe(4);
  });

  it('7102 暗影使者：移除紫宝石 + [3:1] 增幅伤害（清除段先行）', () => {
    const { events, state } = castWeapon(7102);
    expect(typesOf(events)).toContain('gem-destroy');
    const damages = events.filter((e) => e.type === 'skill-damage');
    expect(damages.length).toBeGreaterThan(0);
    void state;
  });

  it('7119 奥菲斯之弦：伤害 + 使目标沉默（跨段回指 lastTarget）', () => {
    const { events, state } = castWeapon(7119);
    expect(typesOf(events)).toContain('status-apply');
    const silenced = state.teams[PlayerSide.Right].characters.some((c) =>
      c.statuses.some((s) => s.id === 'silence'));
    expect(silenced, '敌人应陷入沉默').toBe(true);
  });

  it('7120 雅思敏之弓：伤害 + 创造 6 颗绿色宝石', () => {
    const { events, state } = castWeapon(7120);
    const creates = events.filter((e) => e.type === 'gem-create');
    expect(creates.length).toBeGreaterThan(0);
    void state;
  });

  it('7122 碎山锤：随机爆破 [魔法] 颗棕色宝石 → gem-explode', () => {
    const { events } = castWeapon(7122);
    const explodes = events.filter((e) => e.type === 'gem-explode');
    expect(explodes.length).toBeGreaterThan(0);
  });

  it('7183 吼板：全队治疗 → buff 事件（hp）', () => {
    const { events, state } = castWeapon(7183, { seed: 7 });
    const buffs = events.filter((e) => e.type === 'buff');
    expect(buffs.length).toBeGreaterThan(0);
    void state;
  });

  it('7203 圣物匣：恢复全部生命 + 额外回合 + 灵魂经济（复合）', () => {
    const { events, state } = castWeapon(7203);
    expect(typesOf(events)).toContain('extra-turn');
    const soul = events.find((e) => e.type === 'economy-gain');
    expect(soul, '应获得灵魂').toBeTruthy();
    const caster = state.teams[PlayerSide.Left].characters[0];
    expect(caster.hp).toBe(caster.maxHp);
  });

  it('7578 冰霜法杖：冰风暴在场双倍 + 创造冰风暴 → storm-change', () => {
    const { events, state } = castWeapon(7578);
    const storm = events.find((e) => e.type === 'storm-change');
    expect(storm, '应有 storm-change').toBeTruthy();
    expect((storm as unknown as { color: BaseColor }).color).toBe(BaseColor.Blue);
    expect(typesOf(events)).toContain('skill-damage');
    void state;
  });

  it('9033 碎骨棒：爆破绿宝石 + 赋予哥布林盟友随机正面状态', () => {
    const { events, state } = castWeapon(9033, { allyTroopTypes: ['Goblin'] });
    expect(typesOf(events)).toContain('gem-explode');
    const applies = events.filter((e) => e.type === 'status-apply');
    expect(applies.length, '哥布林盟友应获得随机正面状态').toBeGreaterThan(0);
    const goblinStatused = state.teams[PlayerSide.Left].characters
      .filter((c) => (c.troopTypes ?? []).includes('Goblin'))
      .some((c) => c.statuses.length > 0);
    expect(goblinStatused).toBe(true);
  });
});
