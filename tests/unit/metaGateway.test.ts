/**
 * mock 网关单测：演示档确定性、持久化语义、各域写通道的直通行为。
 * 用内存 StorageLike，不碰浏览器 localStorage。
 */
import { describe, expect, it } from 'vitest';
import { MockGateway, memoryStorage } from '../../src/meta/gateway';
import { buildDemoSave } from '../../src/meta/server/demo';
import { HOUR_MS, todayStartOf, weekStartOf } from '../../src/meta/gateway/clock';
import { isFailure, type BattleTicket } from '../../src/meta/gateway';
import { allKingdoms } from '../../src/meta/data/kingdoms';
import { currentDraftChoices } from '../../src/meta/systems/arena';
import type { BattleResult } from '../../src/session/contract';
import type { MetaSave } from '../../src/meta/state/schema';

import { totalSoulCost, levelCapFor } from '../../src/meta/data/economy';
import { getTroopById } from '../../src/data/troops';

const DAY = 24 * HOUR_MS;

/** 组一个最小合法 BattleResult（结算只看 winner / defeatedExternalIds / economy） */
function fakeResult(over: Partial<BattleResult>): BattleResult {
  return {
    schemaVersion: 1,
    battleId: 'b-test',
    requestId: 'r-test',
    rulesetVersion: '1.0.0',
    seed: 42,
    winner: 'player',
    turns: 9,
    combatants: [],
    defeatedExternalIds: [],
    summonedCount: 0,
    actionLogDigest: 'digest',
    eventSummary: [],
    ...over,
  };
}

describe('buildDemoSave 演示档', () => {
  it('确定性：同 now 两次构建逐字段一致', () => {
    expect(JSON.stringify(buildDemoSave(1_700_000_000_000))).toBe(
      JSON.stringify(buildDemoSave(1_700_000_000_000)),
    );
  });

  it('铺出了可玩进度：货币/收藏/职业/预设队/王国进度', () => {
    const save = buildDemoSave(1_700_000_000_000);
    expect(save.currencies.gems).toBeGreaterThan(150);
    expect(Object.keys(save.collection).length).toBeGreaterThan(40);
    expect(save.hero.level).toBe(20);
    // 破碎尖塔 = 推进序第 1 王国，绑定官方职业「督军」（HeroClassCode warrior）
    expect(save.hero.unlockedClasses).toContain('warrior');
    expect(save.hero.classId).toBe('warrior');
    expect(save.hero.classWins['warrior']).toBe(34);
    expect(save.hero.unlockedClasses).toContain('mechanist');
    expect(save.teams).toHaveLength(1);
    expect(save.teams[0]!.members[0]).toEqual({ kind: 'hero' });
    expect(save.kingdoms['破碎尖塔']?.questsDone).toBe(8);
    expect(save.arena.activeDraft).toBeNull();
  });
});

describe('MockGateway', () => {
  it('load：首次铺演示档并落盘，二次读回同一份（含职业进度不回退）', async () => {
    const storage = memoryStorage();
    const gw = new MockGateway(storage);
    const first = await gw.load();
    expect(first.fresh).toBe(true);
    expect(first.save.hero.level).toBe(20);
    const snapshot = first.save; // save 引用
    const second = await new MockGateway(storage).load();
    expect(second.fresh).toBe(false);
    expect(second.save.hero.level).toBe(20);
    expect(second.save.createdAt).toBe(snapshot.createdAt);
    // 回归：hydrateSave 曾漏掉 classLevels/unlockedClasses，刷新后职业进度回退
    expect(second.save.hero.classLevels['warrior']).toBe(12);
    expect(second.save.hero.classWins['warrior']).toBe(34);
    expect(second.save.hero.unlockedClasses).toContain('warrior');
    expect(second.save.hero.unlockedClasses).toContain('mechanist');
  });

  it('养成：升级扣灵魂并持久化', async () => {
    const gw = new MockGateway(memoryStorage());
    await gw.load();
    const troopId = Number(Object.keys((await gw.load()).save.collection)[0]!);
    const soulsBefore = (await gw.load()).save.currencies.souls;
    const { result } = await gw.levelUpTroop(troopId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.to).toBe(10);
    expect(gwSave(gw).currencies.souls).toBeLessThan(soulsBefore);
  });

  it('批量升级：指定目标等级，一次扣除累计成本并持久化', async () => {
    const storage = memoryStorage();
    const gw = new MockGateway(storage);
    const { save } = await gw.load();
    const troopId = Number(Object.keys(save.collection)[0]);
    const rec = save.collection[String(troopId)]!;
    const from = rec.level;
    const target = from + 3;
    const cost = totalSoulCost(getTroopById(troopId)!.rarityIdx, from, target);
    const souls = save.currencies.souls;
    const { result } = await gw.levelUpTroop(troopId, target);
    expect(result).toEqual({ ok: true, from, to: target, soulsSpent: cost });
    const reloaded = (await new MockGateway(storage).load()).save;
    expect(reloaded.collection[String(troopId)]!.level).toBe(target);
    expect(reloaded.currencies.souls).toBe(souls - cost);
  });

  it('批量升级校验：非法等级、越上限、余额不足均不改变等级或灵魂', async () => {
    const gw = new MockGateway(memoryStorage());
    const { save } = await gw.load();
    const troopId = Number(Object.keys(save.collection)[0]);
    const rec = save.collection[String(troopId)]!;
    const cap = levelCapFor(getTroopById(troopId)!.rarityIdx, rec.ascension);
    for (const target of [rec.level, -1, 1.5, cap + 1, NaN, Infinity]) {
      const { result } = await gw.levelUpTroop(troopId, target);
      expect(result.ok).toBe(false);
      expect(gwSave(gw).collection[String(troopId)]!.level).toBe(rec.level);
      expect(gwSave(gw).currencies.souls).toBe(save.currencies.souls);
    }
    save.currencies.souls = 0;
    await gw.dev!.importSaveJson(JSON.stringify(save));
    const { result } = await gw.levelUpTroop(troopId, rec.level + 2);
    expect(result).toMatchObject({ ok: false, code: 'INSUFFICIENT' });
    expect(gwSave(gw).collection[String(troopId)]!.level).toBe(rec.level);
    expect(gwSave(gw).currencies.souls).toBe(0);
  });

  it('宝箱：十连产10项，批量材料正确入库；余额不足报 INSUFFICIENT', async () => {
    const gw = new MockGateway(memoryStorage());
    const { save } = await gw.load();
    const ownedBefore = Object.keys(save.collection).length;
    const materialsBefore = structuredClone(save.materials);
    const drawn = await gw.openChest('gem', 10);
    expect(drawn.result.ok).toBe(true);
    // 每抽一项，但材料项可包含多颗；数量应完整记入权威存档。
    if (drawn.result.ok && 'materials' in drawn.result) {
      expect(drawn.result.drops).toHaveLength(10);
      for (const [key, amount] of Object.entries(drawn.result.materials.traitstones ?? {})) {
        expect(gwSave(gw).materials.traitstones[key]).toBe((materialsBefore.traitstones[key] ?? 0) + amount!);
      }
      for (const [key, amount] of Object.entries(drawn.result.materials.ingots ?? {})) {
        const ingot = key as keyof typeof materialsBefore.ingots;
        expect(gwSave(gw).materials.ingots[ingot]).toBe((materialsBefore.ingots[ingot] ?? 0) + amount!);
      }
    }
    expect(Object.keys(gwSave(gw).collection).length).toBeGreaterThanOrEqual(ownedBefore);
    expect(gwSave(gw).gachaLog).toHaveLength(1);

    await gw.resetToNewGame(); // 新档宝石 150 < 十连 1500
    const poor = await gw.openChest('gem', 10);
    expect(poor.result.ok).toBe(false);
    if (!poor.result.ok) expect(poor.result.code).toBe('INSUFFICIENT');
  });

  it('王国：进贡按服务器时钟的离线小时结算且幂等（收取后归零）', async () => {
    let clock = 1_700_000_000_000;
    const gw = new MockGateway(memoryStorage(), { now: () => clock });
    const { save } = await gw.load();
    clock = save.kingdoms['破碎尖塔']!.lastTributeAt + 5 * HOUR_MS;
    const first = await gw.collectKingdomTribute('破碎尖塔');
    expect(first.result.hours).toBe(5);
    expect(first.result.hits).toBeGreaterThanOrEqual(0);
    const second = await gw.collectKingdomTribute('破碎尖塔');
    expect(second.result.hours).toBe(0);
    expect(second.result.gold).toBe(0);
  });

  it('竞技场整环：黄金报名 → 四轮选卡 → 编队 → 出敌计划 → 两败收官发奖', async () => {
    const now = 1_700_000_000_000;
    const gw = new MockGateway(memoryStorage(), { now: () => now });
    await gw.load();
    const entered = await gw.enterArena();
    expect(entered.result).toBe(false); // 正常黄金报名

    // 三轮三选一（选项从当前 draft 状态读，种子在网关内部）
    for (let round = 0; round < 4; round++) {
      const state = currentDraftChoices(gwSave(gw));
      expect(state).not.toBeNull();
      const first = state!.options[0]!;
      const picked = await gw.pickDraftCard(first.troopId);
      expect(isFailure(picked.result)).toBe(false);
    }
    const draftSave = gwSave(gw);
    expect(draftSave.arena.activeDraft!.stage).toBe('building');
    expect(draftSave.collection).toBeDefined();

    // 编队：原序站位即可
    const arranged = await gw.arrangeDraftTeam(draftSave.arena.activeDraft!.picked);
    expect(isFailure(arranged.result)).toBe(false);
    expect((await gw.startDraftBattles()).result).toBe(true);

    const plan = await gw.planArenaBattle();
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.request.playerTeam.length).toBeGreaterThan(0);

    const settled = await gw.settleBattle(fakeResult({ ...ticketIds(plan), winner: 'enemy' }));
    // 第一次失败仍可继续
    expect(settled.result).toMatchObject({ ok: true, kind: 'arena', settled: { victory: false, runOver: false } });
    // 同一张票不能结算两次
    expect((await gw.settleBattle(fakeResult({ ...ticketIds(plan), winner: 'enemy' }))).result.ok).toBe(false);
    const plan2 = await gw.planArenaBattle();
    if (!plan2.ok) throw new Error(plan2.message);
    const second = await gw.settleBattle(fakeResult({ ...ticketIds(plan2), winner: 'enemy' }));
    expect(second.result).toMatchObject({ ok: true, kind: 'arena', settled: { runOver: true, losses: 2 } });
    expect(gwSave(gw).arena.activeDraft).toBeNull();
  });

  it('防刷新重来：竞技场开打后刷新 = 判负；未结算就开下一场也判负', async () => {
    const storage = memoryStorage();
    const gw = new MockGateway(storage);
    await gw.load();
    await gw.dev!.importSaveJson(JSON.stringify({ ...gwSave(gw), currencies: { ...gwSave(gw).currencies, gold: 99_999 } }));
    await gw.enterArena();
    for (let round = 0; round < 4; round++) await gw.pickDraftCard(currentDraftChoices(gwSave(gw))!.options[0]!.troopId);
    await gw.arrangeDraftTeam(gwSave(gw).arena.activeDraft!.picked);
    await gw.startDraftBattles();

    // 开打 → 刷新页面
    const first = await gw.planArenaBattle();
    if (!first.ok) throw new Error(first.message);
    const reloaded = new MockGateway(storage);
    const { save } = await reloaded.load();
    expect(save.arena.activeDraft).toMatchObject({ wins: 0, losses: 1 });
    expect(save.pendingBattle).toBeNull();
    // 刷新前那一场的胜利结果交不上来
    expect((await reloaded.settleBattle(fakeResult({ ...ticketIds(first), winner: 'player' }))).result.ok).toBe(false);

    // 不交结果直接开下一场：上一场判负（第二败 → 本届收官）
    const second = await reloaded.planArenaBattle();
    if (!second.ok) throw new Error(second.message);
    const third = await reloaded.planArenaBattle();
    expect(third.ok).toBe(false);
    expect(reloaded.current().arena.activeDraft).toBeNull();
  });

  it('防刷新重来：入侵开打后刷新 = 败北（计场次、不给胜利 VP）', async () => {
    const storage = memoryStorage();
    const gw = new MockGateway(storage);
    await gw.load();
    await gw.dev!.importSaveJson(JSON.stringify({ ...gwSave(gw), hero: { ...gwSave(gw).hero, level: 30 } }));
    await gw.syncInvasionSeason();
    const mirror = (await import('../../src/meta/systems/invasion')).invasionCandidates(gwSave(gw), gw.now(), weekStartOf(gw.now()))[0]!;
    const ticket = await gw.planInvasionBattle(mirror.id);
    if (!ticket.ok) throw new Error(ticket.message);
    const battles = gwSave(gw).invasion.battles;
    const { save } = await new MockGateway(storage).load();
    expect(save.invasion.battles).toBe(battles + 1);
    expect(save.invasion.progressionVp).toBe(gwSave(gw).invasion.progressionVp);
    expect(save.pendingBattle).toBeNull();
  });

  it('游戏时区固定 UTC+8：日界/周界与运行环境时区无关', () => {
    // 2026-09-28（周一）00:00 北京时间 = 2026-09-27T16:00Z
    const mondayCst = Date.UTC(2026, 8, 27, 16);
    expect(todayStartOf(mondayCst + 5 * HOUR_MS)).toBe(mondayCst);
    expect(todayStartOf(mondayCst - 1)).toBe(mondayCst - DAY);
    expect(weekStartOf(mondayCst + 6 * DAY + 23 * HOUR_MS)).toBe(mondayCst);
    expect(weekStartOf(mondayCst - 1)).toBe(mondayCst - 7 * DAY);
  });

  it('开发者命令：本地后端可用；远端（allowDev=false）拒绝', async () => {
    const local = new MockGateway(memoryStorage());
    await local.load();
    expect(local.dev).not.toBeNull();
    const locked = new MockGateway(memoryStorage(), { allowDev: false });
    await locked.load();
    expect(locked.dev).toBeNull();
  });

  it('任务战斗闭环：出战票 → 结算，推进任务并发奖励', async () => {
    const storage = memoryStorage();
    const gw = new MockGateway(storage);
    await gw.load(); // 演示档：推进序第 3 个王国 questsDone=5 → 下一关 6
    const kingdom = allKingdoms()[2]!;
    expect(gwSave(gw).kingdoms[kingdom]?.questsDone).toBe(5);

    const plan = await gw.planQuestBattle(kingdom, 6);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.request.enemyTeam.length).toBeGreaterThan(0);

    expect(plan).toMatchObject({ mode: 'quest', kingdom, source: { kind: 'quest', node: 6 } });

    // 票不符（伪造 requestId）直接拒绝，不动存档
    const forged = await gw.settleBattle(fakeResult({ ...ticketIds(plan), requestId: 'forged' }));
    expect(forged.result.ok).toBe(false);
    expect(gwSave(gw).kingdoms[kingdom]?.questsDone).toBe(5);

    // 客户端只回传 BattleResult：击杀对账用的出敌表来自核心登记的票据
    const enemyIds = plan.request.enemyTeam.map((e) => e.externalId);
    const out = await gw.settleBattle(fakeResult({ ...ticketIds(plan), winner: 'player', defeatedExternalIds: enemyIds }));
    if (!out.result.ok || out.result.kind !== 'encounter') throw new Error('expected encounter settlement');
    const detail = out.result.detail;
    expect(detail.victory).toBe(true);
    expect(detail.questProgress).toEqual({ from: 5, to: 6 });
    expect(detail.lines.length).toBeGreaterThan(0);
    expect(gwSave(gw).kingdoms[kingdom]?.questsDone).toBe(6);
    expect(gwSave(gw).pendingBattle).toBeNull();

    // 战斗中刷新页面：任务票直接作废（不推进、不发保底），旧结果交不上来
    const again = await gw.planQuestBattle(kingdom, 7);
    if (!again.ok) throw new Error(again.message);
    const goldBefore = gwSave(gw).currencies.gold;
    const reloaded = new MockGateway(storage);
    const after = (await reloaded.load()).save;
    expect(after.pendingBattle).toBeNull();
    expect(after.kingdoms[kingdom]?.questsDone).toBe(6);
    expect(after.currencies.gold).toBe(goldBefore);
    const late = await reloaded.settleBattle(fakeResult({ ...ticketIds(again), winner: 'player' }));
    expect(late.result.ok).toBe(false);
  });

  it('设置：导入导出往返一致；至少保留一支预设队', async () => {
    const gw = new MockGateway(memoryStorage());
    await gw.load();
    const json = gw.exportSaveJson();
    const other = new MockGateway(memoryStorage());
    await other.load();
    const imported = await other.dev!.importSaveJson(json);
    expect(imported.save.hero.level).toBe(20);

    const removed = await gw.deleteTeam(0);
    expect(isFailure(removed.result)).toBe(true);
    if (isFailure(removed.result)) expect(removed.result.code).toBe('INVALID');
  });

  it('重置：resetToNewGame 回到起始档（无演示进度）', async () => {
    const gw = new MockGateway(memoryStorage());
    await gw.load();
    const fresh = await gw.resetToNewGame();
    expect(fresh.save.hero.level).toBe(1);
    // 起始职业（破碎尖塔／督军）默认解锁并装备，重置后仍在；演示进度（其它职业）清空
    expect(fresh.save.hero.classId).toBe('warrior');
    expect(fresh.save.hero.unlockedClasses).toEqual(['warrior']);
    expect(Object.keys(fresh.save.kingdoms)).toHaveLength(0);
  });

  it('材料提示：进入材料库清除红点并在重新加载后保持', async () => {
    const storage = memoryStorage();
    const gw = new MockGateway(storage);
    await gw.load();
    // 客户端副本改了不影响权威状态
    gwSave(gw).materialsUnread = true;
    expect((await new MockGateway(storage).load()).save.materialsUnread).toBe(false);
    // 红点只能由核心置位：用开发者导入造出「有新材料」的权威状态
    await gw.dev!.importSaveJson(JSON.stringify({ ...gwSave(gw), materialsUnread: true }));
    expect((await new MockGateway(storage).load()).save.materialsUnread).toBe(true);
    const cleared = await gw.markMaterialsSeen();
    expect(cleared.result).toBe(false);
    expect(gwSave(gw).materialsUnread).toBe(false);
    const reloaded = await new MockGateway(storage).load();
    expect(reloaded.save.materialsUnread).toBe(false);
  });
});

/** 网关当前存档（客户端副本；每条命令回执后刷新） */
function gwSave(gw: MockGateway): MetaSave {
  return gw.current();
}

/** 结算回传必须带上票据里的 requestId / 规则版本 */
function ticketIds(ticket: BattleTicket): Pick<BattleResult, 'requestId' | 'battleId' | 'rulesetVersion'> {
  return { requestId: ticket.request.requestId, battleId: ticket.request.battleId, rulesetVersion: ticket.request.rulesetVersion };
}
