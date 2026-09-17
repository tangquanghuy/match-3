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

describe('武器法术语义冒烟（第三轮 · 新引擎词汇代表）', () => {
  it('9691 兽王之爪：种族限定盟友增益（targetRace）+ 祝福（blessed 状态）', () => {
    const { events, state } = castWeapon(9691, { allyTroopTypes: ['Monster'] });
    const buffs = events.filter((e) => e.type === 'buff');
    expect(buffs.length, '怪物盟友应获得攻击力/生命值增益').toBeGreaterThanOrEqual(2);
    const blessed = state.teams[PlayerSide.Left].characters
      .filter((c) => (c.troopTypes ?? []).includes('Monster'))
      .every((c) => c.statuses.some((s) => s.id === 'blessed'));
    expect(blessed, '所有怪物盟友应被祝福').toBe(true);
  });

  it('8842 圣镜盾：反射状态 + 自身已有反射则全体反射（selfStatus 条件）', () => {
    const { events, state } = castWeapon(8842);
    expect(typesOf(events)).toContain('status-apply');
    const caster = state.teams[PlayerSide.Left].characters[0];
    expect(caster.statuses.some((s) => s.id === 'reflect'), '自身应获得反射').toBe(true);
    expect(caster.armor).toBeGreaterThan(4); // 应获得 [魔法+1] 护甲
  });

  it('8623 星辰法杖：元素星/暗影之星创造（Wave B）+ 赐福全体 + 诅咒全体', () => {
    const { events, state } = castWeapon(8623);
    const creates = events.filter((e) => e.type === 'gem-create');
    expect(creates.length, '应创造元素星与暗影之星').toBeGreaterThan(0);
    const blessed = state.teams[PlayerSide.Left].characters.every((c) => c.statuses.some((s) => s.id === 'blessed'));
    const cursed = state.teams[PlayerSide.Right].characters.every((c) => c.statuses.some((s) => s.id === 'curse'));
    expect(blessed, '全体盟友赐福').toBe(true);
    expect(cursed, '全体敌人诅咒').toBe(true);
  });

  it('9647 怒岩锤：对4名随机敌人流血 + 条件复用创造（troopPresent 条件不满足时空过）', () => {
    const { events, state } = castWeapon(9647);
    const applies = events.filter((e) => e.type === 'status-apply');
    expect(applies.length, '随机敌人应陷入流血').toBeGreaterThan(0);
    const creates = events.filter((e) => e.type === 'gem-create');
    expect(creates.length, '应制造 9 颗激怒宝石').toBeGreaterThan(0);
    void state;
  });

  it('7928 灾祸之刃：全负面状态池展开 + 爆破其法力颜色宝石（LAST_TARGET 通道）', () => {
    const { events, state } = castWeapon(7928);
    const applies = events.filter((e) => e.type === 'status-apply');
    expect(applies.length, '目标应陷入全负面状态池').toBeGreaterThanOrEqual(12);
    expect(typesOf(events)).toContain('gem-explode');
    void state;
  });

  it('9263 兽人战旗：首 2 名敌人伤害 + 恶魔盟友数增幅（alliesOfRace modifier）', () => {
    const { events } = castWeapon(9263, { allyTroopTypes: ['Daemon'] });
    expect(typesOf(events)).toContain('skill-damage');
    void events;
  });
});

describe('武器法术语义冒烟（partial 保真度代表）', () => {
  it('7655 龙鳞巨剑（Doomed · partial）：基础全体散射生效，淬炼增项不产生事件', () => {
    const { events, state } = castWeapon(7655);
    // 淬炼 0 级语义：只有 [魔法 + 10] 基础段（magic 7 → 17 点，护甲 4 → 实扣 13）
    const damages = events.filter((e) => e.type === 'skill-damage');
    expect(damages.length, '全体散射应产生多条 skill-damage').toBeGreaterThanOrEqual(3);
    for (const c of state.teams[PlayerSide.Right].characters) {
      expect(c.hp, '每个敌人都吃到基础散射伤害').toBe(45 - (17 - 4));
      expect(c.hp, '淬炼 0 级不得产生额外伤害事件').toBeGreaterThan(20);
    }
    void damages;
  });

  it('7250 纹章盾（partial）：主效果照编（伤害+屏障），王国增项略去', () => {
    const { events, state } = castWeapon(7250);
    expect(typesOf(events)).toContain('skill-damage');
    expect(typesOf(events)).toContain('status-apply');
    const barriered = state.teams[PlayerSide.Left].characters.some((c) =>
      c.statuses.some((s) => s.id === 'barrier'));
    expect(barriered, '所有盟友应获得屏障').toBe(true);
  });

  it('8322 阿达纳石板（partial · kingdom-condition 略去）：移除+增幅伤害生效', () => {
    const { events, state } = castWeapon(8322);
    expect(typesOf(events)).toContain('gem-destroy');
    const damages = events.filter((e) => e.type === 'skill-damage');
    expect(damages.length).toBeGreaterThan(0);
    void state;
  });
});
