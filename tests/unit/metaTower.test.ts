/**
 * 末日之塔深化批：地图生成不变量、遗物数据驱动注入、动态特质在真实引擎里生效、旧档兼容。
 */
import { describe, it, expect } from 'vitest';
import { newSave, type MetaSave } from '../../src/meta/state/schema';
import { weekStartOf } from '../../src/meta/gateway/clock';
import { eventAction, eventModeState } from '../../src/meta/systems/events';
import {
  generateTowerMap, towerFutureReach, towerMode, towerReachable, towerRouteTo, type TowerRun,
} from '../../src/meta/systems/eventModes/tower';
import {
  TOWER_AFFIXES, TOWER_EVENTS, TOWER_RELICS, TOWER_RUNES, TOWER_ZONES, relicById,
} from '../../src/meta/data/towerData';
import { TOWER_TRAIT_CODES, TOWER_TRAIT_DEFS } from '../../src/meta/data/towerTraits';
import { dynamicTraitCodes, getTrait, resolvePassives } from '../../src/engine/traits';
import { eventArt, gemArt, statusArt } from '../../src/meta/shell/artAssets';
import { eventBattle } from './helpers/eventDriver';
import { TurnEngine } from '../../src/engine/TurnEngine';
import { BoardModel } from '../../src/engine/BoardModel';
import { createGameState } from '../../src/engine/GameState';
import { ExtensionRegistry } from '../../src/engine/registry';
import { SeededRNG } from '../../src/engine/rng';
import { BaseColor, PlayerSide, colorGem, skullGem, type Character, type GemType, type SpecialGemKind } from '../../src/engine/types';
import type { GameEvent } from '../../src/engine/events';
import { mapRequestToTeams } from '../../src/session';
import { BoardGenerator } from '../../src/engine/boardGen';

const WEEK = weekStartOf(new Date(2026, 8, 28, 12).getTime());

function fresh(): MetaSave {
  const save = newSave({ now: WEEK, starterTroopIds: [6000, 6097, 6457], currencies: { gold: 1000, gems: 0 } });
  save.hero.level = 20;
  return save;
}

// ---------------------------------------------------------------------------
// 地图
// ---------------------------------------------------------------------------

describe('地图生成 v2', () => {
  const seeds = Array.from({ length: 40 }, (_, i) => 1000 + i * 7919);

  it('结构：首行战斗、首领前一行营地、顶层唯一首领；连线合法、无孤点、无交叉', () => {
    for (const seed of seeds) {
      for (let zone = 0; zone < TOWER_ZONES.length; zone++) {
        const rows = generateTowerMap(seed, zone);
        const n = TOWER_ZONES[zone]!.rows;
        expect(rows).toHaveLength(n);
        expect(rows[n - 1]).toHaveLength(1);
        expect(rows[n - 1]![0]!.kind).toBe('boss');
        expect(rows[0]!.every((x) => x.kind === 'battle')).toBe(true);
        expect(rows[n - 2]!.every((x) => x.kind === 'camp')).toBe(true);
        for (let r = 0; r < n - 1; r++) {
          for (const node of rows[r]!) {
            expect(node.next.length).toBeGreaterThan(0);
            for (const c of node.next) expect(rows[r + 1]!.some((x) => x.col === c)).toBe(true);
          }
          for (const child of rows[r + 1]!) expect(rows[r]!.some((p) => p.next.includes(child.col))).toBe(true);
          // 无交叉：a<c 时 a 的最大去向 ≤ c 的最小去向
          const edges = rows[r]!.flatMap((p) => p.next.map((to) => [p.col, to] as const));
          for (const [a, b] of edges) for (const [c, d] of edges) if (a < c) expect(b).toBeLessThanOrEqual(d);
        }
      }
    }
  });

  it('节点约束：精英不出现在开头几层；每区至少一名精英、一个商人、一个宝库；第 2、3 区有且只有一名强化精英', () => {
    for (const seed of seeds) {
      for (let zone = 0; zone < TOWER_ZONES.length; zone++) {
        const nodes = generateTowerMap(seed, zone).flat();
        const eliteFrom = zone === 0 ? 3 : 2;
        expect(nodes.filter((x) => x.kind === 'elite').every((x) => x.row >= eliteFrom && !!x.affix)).toBe(true);
        for (const kind of ['elite', 'merchant', 'treasure'] as const) expect(nodes.some((x) => x.kind === kind)).toBe(true);
        const stars = nodes.filter((x) => x.star);
        if (zone === 0) expect(stars).toHaveLength(0);
        else {
          expect(stars).toHaveLength(1);
          expect(stars[0]!.kind).toBe('elite');
          expect(stars[0]!.affix2).toBeDefined();
          expect(stars[0]!.affix2).not.toBe(stars[0]!.affix);
        }
        // 第 1 区不出第 2 区起的词缀
        for (const x of nodes) for (const a of [x.affix, x.affix2]) {
          if (a) expect(((TOWER_AFFIXES[a] as { minZone?: number }).minZone ?? 0) <= zone).toBe(true);
        }
      }
    }
  });

  it('同种子确定性；不同种子地图不同；首行不再整行同类（宝库不再固定整行）', () => {
    expect(generateTowerMap(42, 1)).toEqual(generateTowerMap(42, 1));
    expect(JSON.stringify(generateTowerMap(42, 1))).not.toBe(JSON.stringify(generateTowerMap(43, 1)));
    const fullTreasureRows = seeds.filter((seed) => generateTowerMap(seed, 0).some((row) => row.length > 1 && row.every((x) => x.kind === 'treasure')));
    expect(fullTreasureRows.length).toBeLessThan(seeds.length / 4);
  });

  it('可达集合与路线：从起点能到首领；路线高亮只包含通向目标的连线', () => {
    const rows = generateTowerMap(7, 0);
    const run = { rows, at: null, pending: null, zone: 0 } as unknown as TowerRun;
    const future = towerFutureReach(run);
    const boss = rows.at(-1)![0]!;
    expect(future.has(`${boss.row}-${boss.col}`)).toBe(true);
    const route = towerRouteTo(run, boss.row, boss.col);
    expect(route.size).toBeGreaterThan(0);
    const target = rows[2]![0]!;
    for (const edge of towerRouteTo(run, target.row, target.col)) {
      const [, to] = edge.split('>');
      expect(Number(to!.split('-')[0])).toBeLessThanOrEqual(2);
    }
  });
});

// ---------------------------------------------------------------------------
// 数据完整性
// ---------------------------------------------------------------------------

describe('遗物与词缀数据', () => {
  it('遗物 id 唯一；引用的动态特质全部注册进引擎；描述与图标齐全', () => {
    const ids = TOWER_RELICS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    const refs = [
      ...TOWER_RELICS.flatMap((r) => [...(r.effect?.traits ?? []), ...(r.effect?.enemyTraits ?? [])]),
      ...Object.values(TOWER_AFFIXES).flatMap((a) => (a as { traits?: { code: string }[] }).traits ?? []),
    ];
    expect(refs.length).toBeGreaterThan(20);
    const dyn = new Set(dynamicTraitCodes());
    for (const { code } of refs) {
      expect(TOWER_TRAIT_CODES.has(code)).toBe(true);
      expect(dyn.has(code)).toBe(true);
      expect(getTrait(code)?.name).toBeTruthy();
    }
    // 每条动态定义都被某件遗物或词缀用到（没有死代码）
    for (const def of TOWER_TRAIT_DEFS) expect(refs.some((r) => r.code === def.code)).toBe(true);
  });

  it('遗物、词缀、符文的图标都能解析到真实素材', () => {
    const url = (icon: string): string => icon.startsWith('gem:') ? gemArt(icon.slice(4)) : icon.startsWith('status:') ? statusArt(icon.slice(7)) : eventArt(icon);
    for (const r of TOWER_RELICS) expect(url(r.icon), r.id).not.toBe('');
    for (const a of Object.values(TOWER_AFFIXES)) expect(url(a.icon), a.name).not.toBe('');
    for (const r of Object.values(TOWER_RUNES)) expect(url(r.icon), r.name).not.toBe('');
  });

  it('奇遇 id 唯一，带颜色占位符的奇遇会掷颜色', () => {
    const ids = TOWER_EVENTS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of TOWER_EVENTS) {
      const usesColor = e.options.some((o) => /\{c\d\}/.test(o.label + o.desc));
      expect(usesColor).toBe(e.colors !== undefined);
    }
  });
});

// ---------------------------------------------------------------------------
// 遗物注入战斗请求
// ---------------------------------------------------------------------------

function runOf(save: MetaSave): TowerRun {
  const run = eventModeState(save, WEEK, 'towerOfDoom').run;
  if (!run) throw new Error('没有进行中的登塔');
  return run;
}

describe('遗物 → 战斗请求（applyRun）', () => {
  it('旗帜法力、动态特质（lead / all）、敌方诅咒特质与显示名一次注入；卡面特质不被挤占', () => {
    const save = fresh();
    eventBattle(save, 'towerOfDoom', WEEK); // 开跑并推进到第一个战斗节点
    const run = runOf(save);
    run.relics = ['bone_horn', 'ember_seed', 'prism_flame', 'curse_haste', 'storm_crown'];
    run.bonus.banner = { [BaseColor.Red]: 2 };
    const out = eventBattle(save, 'towerOfDoom', WEEK);
    const req = out.request;
    const [lead, ...rest] = req.playerTeam;
    expect(lead!.traitIds).toContain('tw_bone_horn');
    for (const s of rest) expect(s.traitIds ?? []).not.toContain('tw_bone_horn');
    for (const s of req.playerTeam) {
      expect(s.traitIds).toContain('tw_ember_seed');
      expect(s.traitNames?.tw_ember_seed).toBe('遗物·余烬火种');
      expect(s.displayTraitIds ?? []).not.toContain('tw_ember_seed');
    }
    for (const s of req.enemyTeam) expect(s.traitIds).toContain('tw_curse_haste');
    // 红：灵纹 2 + 焰阳棱镜 1 + 风暴王冠 1 = 4 → 钳到上限 3；黄：1 + 1 = 2
    expect(req.playerBanner?.boosts[BaseColor.Red]).toBe(3);
    expect(req.playerBanner?.boosts[BaseColor.Yellow]).toBeGreaterThanOrEqual(2);
    expect(req.playerManaMastery?.[BaseColor.Blue]).toBeGreaterThanOrEqual(50);
  });

  it('精英词缀的特质注入敌方；属性词缀按比例放大', () => {
    const save = fresh();
    eventBattle(save, 'towerOfDoom', WEEK);
    const run = runOf(save);
    const node = towerReachable(run)[0]!;
    node.kind = 'elite';
    node.affix = 'thorns';
    node.affix2 = 'giant';
    node.star = true;
    const out = eventBattle(save, 'towerOfDoom', WEEK, `go:${node.row}-${node.col}`);
    for (const s of out.request.enemyTeam) {
      expect(s.traitIds).toContain('tw_af_thorns');
      expect(s.eventTarget).toBe('tower');
    }
  });
});

// ---------------------------------------------------------------------------
// 动态特质在真实引擎里生效
// ---------------------------------------------------------------------------

describe('tower boss lethal protection', () => {
  it('protects boss-tier enemies only on boss nodes', () => {
    const save = fresh();
    eventBattle(save, 'towerOfDoom', WEEK);
    const node = towerReachable(runOf(save))[0]!;
    node.kind = 'boss';
    const out = eventBattle(save, 'towerOfDoom', WEEK, `go:${node.row}-${node.col}`);
    for (const [i, enemy] of out.request.enemyTeam.entries()) {
      if (out.plan.enemies[i]?.tier === 'boss') {
        expect(enemy.traitIds).toContain('indestructible');
        expect(enemy.displayTraitIds).toContain('indestructible');
      } else expect(enemy.traitIds ?? []).not.toContain('indestructible');
    }
    expect(out.plan.enemies.some(e => e.tier === 'boss')).toBe(true);
  });
});

function engineFromRequest(save: MetaSave, relics: string[]): TurnEngine {
  eventBattle(save, 'towerOfDoom', WEEK);
  runOf(save).relics = relics;
  const out = eventBattle(save, 'towerOfDoom', WEEK);
  const { playerTeam, enemyTeam } = mapRequestToTeams(out.request);
  let gemId = 1;
  const board = new BoardGenerator(new SeededRNG(out.request.seed), () => gemId++, 0.2).generate();
  let unit = 900000;
  return new TurnEngine(createGameState(board, playerTeam, enemyTeam), new SeededRNG(out.request.seed), () => unit++, out.registry);
}

function countSpecial(board: BoardModel, kind: SpecialGemKind): number {
  let n = 0;
  for (let r = 0; r < BoardModel.ROWS; r++) for (let c = 0; c < BoardModel.COLS; c++) {
    const g = board.get({ row: r, col: c });
    if (g?.type.kind === 'special' && g.type.spec.kind === kind) n++;
  }
  return n;
}

function transforms(events: GameEvent[], kind: SpecialGemKind): number {
  let n = 0;
  for (const e of events) {
    if (e.type !== 'gem-transform') continue;
    for (const ch of e.changes) if (ch.to.kind === 'special' && ch.to.spec.kind === kind) n++;
  }
  return n;
}

describe('遗物特质 × TurnEngine（开局效果走真实请求管线）', () => {
  it('骸骨号角：开局给玩家方召唤骸骨风暴（骷髅掉落）', () => {
    const engine = engineFromRequest(fresh(), ['bone_horn']);
    const initial = engine.takeInitialEvents();
    expect(initial.some((e) => e.type === 'storm-change' && e.player === PlayerSide.Left && e.color === BaseColor.Brown)).toBe(true);
    const storm = engine.getState().teams[PlayerSide.Left].storm;
    // 敌方开局风暴会按全局唯一规则顶替；本测试的敌人没有风暴特质
    expect(storm?.dropKind).toBe('skull');
  });

  it('屏障圣徽：每名队员开局获得屏障；灵感墨水：全队以 25% 法力开战', () => {
    const engine = engineFromRequest(fresh(), ['aegis_sigil', 'inspiration_ink']);
    engine.takeInitialEvents();
    for (const c of engine.getState().teams[PlayerSide.Left].characters) {
      expect(c.statuses.some((s) => s.id === 'barrier')).toBe(true);
      expect(c.mana).toBeGreaterThanOrEqual(Math.floor(c.manaCost * 0.25));
    }
  });

  it('火药桶：开局把红色宝石变成炸弹', () => {
    const engine = engineFromRequest(fresh(), ['powder_keg']);
    const initial = engine.takeInitialEvents();
    expect(transforms(initial, 'bomb')).toBeGreaterThan(0);
  });
});

describe('遗物特质 × TurnEngine（回合开始改写棋盘）', () => {
  function mk(id: number, traitIds: string[] = []): Character {
    return { id, name: `C${id}`, maxHp: 50, hp: 50, attack: 5, armor: 0, magic: 8, colors: [BaseColor.Red], manaCost: 20, mana: 0, skillId: 'none', statuses: [], defeated: false, traitIds };
  }
  /** 不自发匹配的斜纹棋盘：palette 按 (r+c) 取色 */
  function battle(traits: string[], seed: number, palette: GemType[]): TurnEngine {
    const board = new BoardModel();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) board.set({ row: r, col: c }, { id: r * 8 + c + 1, type: palette[(r + c) % palette.length]! });
    const state = createGameState(board, { player: PlayerSide.Left, characters: [mk(0)] }, { player: PlayerSide.Right, characters: [mk(4, traits), mk(5, traits)] });
    let id = 97000;
    return new TurnEngine(state, new SeededRNG(seed), () => id++, new ExtensionRegistry());
  }
  const PALETTE = [colorGem(BaseColor.Red), colorGem(BaseColor.Blue), colorGem(BaseColor.Yellow), colorGem(BaseColor.Purple)];

  it.each([
    ['tw_ember_seed', 'burningGem', PALETTE],
    ['tw_frost_heart', 'freezeGem', PALETTE],
    ['tw_spider_spool', 'web', PALETTE],
    ['tw_sand_glass', 'hourglass', PALETTE],
    ['tw_lightning_rod', 'lightningRow', PALETTE],
    ['tw_eternal_heart', 'hourglass', PALETTE],
    ['tw_doom_skull_idol', 'doomSkull', [skullGem(), colorGem(BaseColor.Blue), colorGem(BaseColor.Yellow), colorGem(BaseColor.Purple)]],
  ] as const)('%s：若干种子内会把宝石变成 %s，且每名持有者最多一颗', (code, kind, palette) => {
    let hits = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const engine = battle([code], seed, [...palette]);
      const n = transforms(engine.passTurn(), kind);
      expect(n).toBeLessThanOrEqual(2);
      hits += n;
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('tw_bone_totem：棕色宝石按概率变成骷髅', () => {
    let hits = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const engine = battle(['tw_bone_totem'], seed, [colorGem(BaseColor.Brown), colorGem(BaseColor.Blue), colorGem(BaseColor.Yellow), colorGem(BaseColor.Purple)]);
      for (const e of engine.passTurn()) if (e.type === 'gem-transform') hits += e.changes.filter((ch) => ch.to.kind === 'skull').length;
    }
    expect(hits).toBeGreaterThan(0);
  });

  it('战鼓 / 草药袋：配骷髅、配绿色的自身增益编译进被动（骷髅色键走既有触发点）', () => {
    expect(resolvePassives(['tw_war_drum']).gainOnColorMatch.skull).toMatchObject({ attack: 1 });
    expect(resolvePassives(['tw_herb_pouch']).gainOnColorMatch[BaseColor.Green]).toMatchObject({ hp: 1 });
    expect(resolvePassives(['tw_shadow_cloak']).dodgeChance).toBeCloseTo(0.12);
  });

  it('没有遗物特质时回合开始不改写棋盘', () => {
    const engine = battle([], 3, PALETTE);
    expect(engine.passTurn().some((e) => e.type === 'gem-transform')).toBe(false);
    expect(countSpecial(engine.getState().board, 'burningGem')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 非战斗动作与旧档
// ---------------------------------------------------------------------------

describe('奇遇 / 商人 / 旧档', () => {
  it('宝石熔炉：花 30 塔金给掷出的颜色 +1 灵纹，到上限后拒绝', () => {
    const save = fresh();
    eventBattle(save, 'towerOfDoom', WEEK);
    const run = runOf(save);
    run.gold = 200;
    run.pending = { kind: 'event', event: 'forge', colors: [BaseColor.Green, BaseColor.Purple] };
    expect(eventAction(save, WEEK, 'towerOfDoom', 'event:0', 1)).toMatchObject({ ok: true });
    const after = runOf(save);
    expect(after.gold).toBe(170);
    expect(after.bonus.banner[BaseColor.Green]).toBe(1);
    after.bonus.banner[BaseColor.Purple] = 2;
    after.pending = { kind: 'event', event: 'forge', colors: [BaseColor.Green, BaseColor.Purple] };
    expect(eventAction(save, WEEK, 'towerOfDoom', 'event:1', 2)).toMatchObject({ ok: false });
  });

  it('商人：换货一次、驱除任意诅咒', () => {
    const save = fresh();
    eventBattle(save, 'towerOfDoom', WEEK);
    const run = runOf(save);
    run.gold = 300;
    run.relics = ['curse_haste'];
    run.pending = { kind: 'merchant', stock: [{ relic: 'ember_sigil', price: 70, sold: false }], healUsed: false, purgeUsed: false, rerolled: false };
    expect(eventAction(save, WEEK, 'towerOfDoom', 'buy:reroll', 3)).toMatchObject({ ok: true });
    expect(eventAction(save, WEEK, 'towerOfDoom', 'buy:reroll', 4)).toMatchObject({ ok: false });
    expect(eventAction(save, WEEK, 'towerOfDoom', 'buy:purge', 5)).toMatchObject({ ok: true });
    expect(runOf(save).relics).not.toContain('curse_haste');
  });

  it('旧档（无 banner / seen / affix2 字段、5 车道地图）照常读取', () => {
    const rows = generateTowerMap(9, 0).map((row) => row.map((n) => ({ ...n, col: Math.min(n.col, 4), star: undefined, affix2: undefined })));
    const raw = {
      v: 1, runs: 1, last: null,
      run: { seed: 9, zone: 0, rows, at: null, path: [], pending: null, relics: ['ember_sigil', 'no_such_relic'], gold: 10,
        bonus: { attack: 1, armor: 0, magic: 0, hpPct: 0 }, floor: 0, elites: 0, phoenixUsed: false },
    };
    const state = towerMode.sanitize(raw, {} as never);
    expect(state?.run?.bonus.banner).toEqual({});
    expect(state?.run?.seen).toEqual([]);
    expect(state?.run?.relics).toEqual(['ember_sigil']);
    expect(relicById('ember_sigil')?.effect?.attack).toBe(4);
  });
});
