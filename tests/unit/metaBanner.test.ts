/**
 * 旗帜机制（M6）——数据表完整性 / 解锁与装备 / 契约注入 / 引擎法力加成。
 *
 * 官方口径（data/banners.ts 头注有完整来源）：
 *  - 加成 = 匹配对应色时该色法力 ±N（每次匹配事件平展；2=++ / 1=+ / -1=惩罚）；
 *  - 解锁 = 该王国任务链 8/8 全通；
 *  - 现开赛不吃旗帜（官方「无王国加成」口径，metaArena.test 锁）。
 */
import { describe, it, expect } from 'vitest';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { BaseColor, colorGem, PlayerSide, type Character, type Gem, type GemType, type Team } from '@engine/types';
import type { GameEvent } from '@engine/events';
import {
  BANNERS,
  bannerEquipIssue,
  bannerOf,
  bannerUnlocked,
  buildBattleRequest,
  equippedBannerOf,
  newSave,
  planExploreEncounter,
  setTeamPreset,
  unlockedBanners,
} from '../../src/meta';
// 直接取具体模块：QUESTS_PER_KINGDOM/allKingdoms 不经 meta barrel（该 barrel 可能含其他窗口在途文件）
import { QUESTS_PER_KINGDOM, allKingdoms } from '../../src/meta/data/kingdoms';

// ───────────────────────── 数据表 ─────────────────────────

describe('旗帜表完整性（官方 gowhead BannerColors）', () => {
  it('42 王国每面旗都有定义；加成值域 {-1,1,2}；至少一个正加成', () => {
    for (const kingdom of allKingdoms()) {
      const def = bannerOf(kingdom);
      expect(def, `${kingdom} 缺旗帜定义`).not.toBeNull();
      const entries = Object.entries(def!.boosts);
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries.some(([, mana]) => mana! > 0)).toBe(true);
      for (const [, mana] of entries) expect([-1, 1, 2]).toContain(mana);
    }
    expect(Object.keys(BANNERS)).toHaveLength(allKingdoms().length);
  });

  it('官方/设计值标注：仅混沌与藏宝库为设计值；天启与迈纳杰之罪共享 Sin of Maraj 官方旗', () => {
    const design = Object.entries(BANNERS).filter(([, d]) => !d.official).map(([k]) => k);
    expect(design.sort()).toEqual(['藏宝库', '混沌'].sort());
    expect(BANNERS['天启']!.boosts).toEqual(BANNERS['迈纳杰之罪']!.boosts);
    expect(BANNERS['天启']!.official).toBe(true);
  });

  it('官方数据抽查（gowhead kingdoms.en.json BannerColors 逐条锁定）', () => {
    expect(BANNERS['破碎尖塔']!.boosts).toEqual({ [BaseColor.Blue]: 1, [BaseColor.Brown]: 1 });
    expect(BANNERS['风暴峡湾']!.boosts).toEqual({ [BaseColor.Blue]: 2 });
    expect(BANNERS['卡其尔']!.boosts).toEqual({ [BaseColor.Brown]: 2 });
    expect(BANNERS['荆棘森林']!.boosts).toEqual({ [BaseColor.Green]: 2 });
    expect(BANNERS['白盔国']!.boosts).toEqual({ [BaseColor.Yellow]: 2 });
    expect(BANNERS['卡拉考斯']!.boosts).toEqual({ [BaseColor.Purple]: 2 });
    // 带惩罚色的旗帜（官方口径：负色 -1）
    expect(BANNERS['荒芜之地']!.boosts).toEqual({
      [BaseColor.Red]: 1,
      [BaseColor.Yellow]: -1,
      [BaseColor.Purple]: 2,
    });
    expect(BANNERS['守护者']!.boosts).toEqual({
      [BaseColor.Green]: -1,
      [BaseColor.Yellow]: 2,
      [BaseColor.Brown]: 1,
    });
    expect(BANNERS['黑鹰']!.boosts).toEqual({
      [BaseColor.Blue]: 1,
      [BaseColor.Purple]: -1,
      [BaseColor.Brown]: 2,
    });
  });
});

// ───────────────────────── 解锁与装备 ─────────────────────────

const saveWithProgress = () => {
  const s = newSave({ now: 0, starterTroopIds: [6000, 6097, 6457] });
  s.kingdoms['破碎尖塔'] = { level: 1, questsDone: QUESTS_PER_KINGDOM, exploreTier: 0, lastTributeAt: 0 };
  s.kingdoms['卡拉考斯'] = { level: 1, questsDone: 7, exploreTier: 0, lastTributeAt: 0 };
  return s;
};

describe('解锁（任务链 8/8 全通，派生自任务进度）', () => {
  it('8/8 解锁、7/8 未解锁、无进度未解锁', () => {
    const s = saveWithProgress();
    expect(bannerUnlocked(s, '破碎尖塔')).toBe(true);
    expect(bannerUnlocked(s, '卡拉考斯')).toBe(false);
    expect(bannerUnlocked(s, '冰峰之巅')).toBe(false);
    expect(unlockedBanners(s)).toEqual(['破碎尖塔']);
  });
});

describe('装备校验（setTeamPreset 统一拦截）', () => {
  it('已解锁可挂；未解锁/未知旗帜报 BAD_BANNER；null 恒合法', () => {
    const s = saveWithProgress();
    const members = [
      { kind: 'hero' as const },
      { kind: 'troop' as const, troopId: 6000 },
      { kind: 'troop' as const, troopId: 6097 },
      { kind: 'troop' as const, troopId: 6457 },
    ];
    expect(setTeamPreset(s, 0, { name: 'A', members, bannerKingdomId: '破碎尖塔' })).toEqual({ ok: true, index: 0 });
    expect(s.teams[0]!.bannerKingdomId).toBe('破碎尖塔');

    const locked = setTeamPreset(s, 0, { name: 'A', members, bannerKingdomId: '卡拉考斯' });
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.issues[0]!.code).toBe('BAD_BANNER');

    const unknown = setTeamPreset(s, 0, { name: 'A', members, bannerKingdomId: '亚特兰蒂斯' });
    expect(unknown.ok).toBe(false);

    expect(setTeamPreset(s, 0, { name: 'A', members, bannerKingdomId: null })).toEqual({ ok: true, index: 0 });
    expect(bannerEquipIssue(s, null)).toBeNull();
  });
});

// ───────────────────────── 契约注入 ─────────────────────────

describe('buildBattleRequest 携带 playerBanner', () => {
  it('出战队装备已解锁旗帜 → 请求带 boosts；未装备/未解锁 → 不带（防御降级）', () => {
    const s = saveWithProgress();
    s.teams = [
      { name: '先锋队', members: [6000, 6097, 6457].map((troopId) => ({ kind: 'troop' as const, troopId })), bannerKingdomId: '破碎尖塔' },
    ];
    const plan = planExploreEncounter('破碎尖塔', 1, 11);
    const outcome = buildBattleRequest(s, plan);
    if (!outcome.ok) throw new Error(outcome.message);
    expect(outcome.request.playerBanner).toEqual({
      boosts: { [BaseColor.Blue]: 1, [BaseColor.Brown]: 1 },
    });

    // 未装备
    s.teams[0]!.bannerKingdomId = null;
    const without = buildBattleRequest(s, plan);
    if (!without.ok) throw new Error(without.message);
    expect(without.request.playerBanner).toBeUndefined();

    // 存档被手改成未解锁旗帜 → 桥接静默降级，坏数据不进契约
    s.teams[0]!.bannerKingdomId = '卡拉考斯';
    expect(equippedBannerOf(s, s.teams[0]!)).toBeNull();
    const downgraded = buildBattleRequest(s, plan);
    if (!downgraded.ok) throw new Error(downgraded.message);
    expect(downgraded.request.playerBanner).toBeUndefined();
  });
});

// ───────────────────────── 引擎法力加成 ─────────────────────────

let gid = 0;
const g = (type: GemType): Gem => ({ id: gid++, type });

function makeIdGen(start: number): () => number {
  let id = start;
  return () => id++;
}

function makeChar(id: number): Character {
  return {
    id,
    name: `C${id}`,
    maxHp: 50,
    hp: 50,
    attack: 10,
    armor: 0,
    magic: 0,
    colors: [...Object.values(BaseColor)],
    manaCost: 100,
    mana: 0,
    skillId: 'none',
    statuses: [],
    defeated: false,
  };
}

function makeTeam(side: PlayerSide, count: number): Team {
  const base = side === PlayerSide.Left ? 0 : 10;
  return { player: side, characters: Array.from({ length: count }, (_, i) => makeChar(base + i)) };
}

const CHAR_MAP: Record<string, GemType> = {
  R: colorGem(BaseColor.Red),
  G: colorGem(BaseColor.Green),
  B: colorGem(BaseColor.Blue),
  Y: colorGem(BaseColor.Yellow),
  P: colorGem(BaseColor.Purple),
  W: colorGem(BaseColor.Brown),
};

/** 布局建板 + 确定性自填充（只填基色、保证盘面初始无匹配；同 gemSpecial.test 口径） */
function layoutBoard(layout: string[]): BoardModel {
  const board = new BoardModel();
  const explicit = new Set<string>();
  const keyAt = (r: number, c: number): string | null => {
    if (r < 0 || r >= BoardModel.ROWS || c < 0 || c >= BoardModel.COLS) return null;
    const gem = board.get({ row: r, col: c });
    if (!gem || gem.type.kind !== 'color') return null;
    return gem.type.color;
  };
  for (let r = 0; r < BoardModel.ROWS; r++) {
    for (let c = 0; c < BoardModel.COLS; c++) {
      const ch = layout[r]?.[c];
      if (ch === undefined || ch === '.') continue;
      explicit.add(`${r},${c}`);
      board.set({ row: r, col: c }, g(CHAR_MAP[ch]!));
    }
  }
  const palette = [BaseColor.Red, BaseColor.Green, BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
  for (let r = 0; r < BoardModel.ROWS; r++) {
    for (let c = 0; c < BoardModel.COLS; c++) {
      if (explicit.has(`${r},${c}`)) continue;
      const pairs: [string | null, string | null][] = [
        [keyAt(r, c - 1), keyAt(r, c - 2)],
        [keyAt(r, c - 1), keyAt(r, c + 1)],
        [keyAt(r, c + 1), keyAt(r, c + 2)],
        [keyAt(r - 1, c), keyAt(r - 2, c)],
        [keyAt(r - 1, c), keyAt(r + 1, c)],
        [keyAt(r + 1, c), keyAt(r + 2, c)],
      ];
      const forbidden = new Set<string>();
      for (const [a, b] of pairs) if (a !== null && a === b) forbidden.add(a);
      const candidates = palette.filter((col) => !forbidden.has(col));
      board.set({ row: r, col: c }, g(colorGem(candidates[(r * 3 + c * 5) % candidates.length])));
    }
  }
  return board;
}

function makeEngine(layout: string[], seed = 7) {
  const rng = new SeededRNG(seed);
  const state = createGameState(layoutBoard(layout), makeTeam(PlayerSide.Left, 2), makeTeam(PlayerSide.Right, 2));
  return new TurnEngine(state, rng, makeIdGen(50000));
}

function firstRedGain(events: GameEvent[]): number | null {
  for (const e of events) {
    if (e.type === 'mana-gain' && e.color === BaseColor.Red) return e.amount;
  }
  return null;
}

function firstBrownGain(events: GameEvent[]): number | null {
  for (const e of events) {
    if (e.type === 'mana-gain' && e.color === BaseColor.Brown) return e.amount;
  }
  return null;
}

/** 行 4：RR G R → 交换 (4,3)↔(4,4) 组成红三连（col1..3）；(3,3)/(5,3) 显式异色防竖向并连 */
const RED_LAYOUT = [
  '........',
  '........',
  '........',
  '...G....',
  '.RRGR...',
  '...B....',
  '........',
  '........',
];

/** 行 4：WW Y W → 交换 (4,3)↔(4,4) 组成棕三连；(3,3)/(5,3) 显式异色防竖向并连 */
const BROWN_LAYOUT = [
  '........',
  '........',
  '........',
  '...G....',
  '.WWYW...',
  '...B....',
  '........',
  '........',
];

/** 归一化两引擎各自的内部宝石 id（全局计数器跨实例递增），只比事件形状 */
function normalize(events: GameEvent[]): string[] {
  return events.map((e) => JSON.stringify(e).replace(/"(gemId|gemIdA|gemIdB)":\d+/g, '"$1":X'));
}

describe('TurnEngine.bannerBoosts（官方旗帜法力语义）', () => {
  it('红 +2：首个红匹配事件的法力 = 3 + 2（每次匹配平展，不逐宝石）', () => {
    const base = makeEngine(RED_LAYOUT);
    const boosted = makeEngine(RED_LAYOUT);
    boosted.bannerBoosts = { [BaseColor.Red]: 2 };
    expect(firstRedGain(base.resolveSwap({ row: 4, col: 3 }, { row: 4, col: 4 }))).toBe(3);
    expect(firstRedGain(boosted.resolveSwap({ row: 4, col: 3 }, { row: 4, col: 4 }))).toBe(5);
  });

  it('棕 −1：惩罚色匹配法力减 1（3 → 2）', () => {
    const base = makeEngine(BROWN_LAYOUT);
    const penalized = makeEngine(BROWN_LAYOUT);
    penalized.bannerBoosts = { [BaseColor.Brown]: -1 };
    expect(firstBrownGain(base.resolveSwap({ row: 4, col: 3 }, { row: 4, col: 4 }))).toBe(3);
    expect(firstBrownGain(penalized.resolveSwap({ row: 4, col: 3 }, { row: 4, col: 4 }))).toBe(2);
  });

  it('重惩罚向下保底 0：红 −5 时红匹配不产法力（无 mana-gain 事件）', () => {
    const engine = makeEngine(RED_LAYOUT);
    engine.bannerBoosts = { [BaseColor.Red]: -5 };
    expect(firstRedGain(engine.resolveSwap({ row: 4, col: 3 }, { row: 4, col: 4 }))).toBeNull();
  });

  it('只影响玩家方与加成色：敌方同色匹配不加成；非红事件流与无旗帜逐字节一致', () => {
    const base = makeEngine(RED_LAYOUT);
    const boosted = makeEngine(RED_LAYOUT);
    boosted.bannerBoosts = { [BaseColor.Red]: 2, [BaseColor.Brown]: 1 };
    const baseEvents = base.resolveSwap({ row: 4, col: 3 }, { row: 4, col: 4 });
    const boostedEvents = boosted.resolveSwap({ row: 4, col: 3 }, { row: 4, col: 4 });
    const strip = (events: GameEvent[]) =>
      normalize(events).filter(
        (s) => !s.includes('"type":"mana-gain"') || (!s.includes('"color":"Red"') && !s.includes('"color":"Brown"')),
      );
    expect(strip(boostedEvents)).toEqual(strip(baseEvents));
    // 敌方（Right）事件不受旗帜影响：Right 侧 mana-gain 数量一致
    const rightOf = (events: GameEvent[]) => events.filter((e) => e.type === 'mana-gain' && e.player === PlayerSide.Right);
    expect(rightOf(boostedEvents)).toHaveLength(rightOf(baseEvents).length);
  });
});


describe('enemy defense banner is independent of the player banner', () => {
  it('enemy receives its own +2, not the player -1; player receives no enemy bonus', () => {
    const enemy = makeEngine(RED_LAYOUT);
    enemy.getState().activePlayer = PlayerSide.Right;
    enemy.bannerBoosts = { [BaseColor.Red]: -1 };
    enemy.enemyBannerBoosts = { [BaseColor.Red]: 2 };
    expect(firstRedGain(enemy.resolveSwap({ row: 4, col: 3 }, { row: 4, col: 4 }))).toBe(5);
    const player = makeEngine(RED_LAYOUT);
    player.enemyBannerBoosts = { [BaseColor.Red]: 2 };
    expect(firstRedGain(player.resolveSwap({ row: 4, col: 3 }, { row: 4, col: 4 }))).toBe(3);
  });
  it('enemy penalty applies per match', () => {
    const engine = makeEngine(BROWN_LAYOUT);
    engine.getState().activePlayer = PlayerSide.Right;
    engine.enemyBannerBoosts = { [BaseColor.Brown]: -1 };
    expect(firstBrownGain(engine.resolveSwap({ row: 4, col: 3 }, { row: 4, col: 4 }))).toBe(2);
  });
});
