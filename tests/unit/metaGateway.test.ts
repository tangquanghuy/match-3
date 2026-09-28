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

  it('宝箱：十连产 10 张卡入册；余额不足报 INSUFFICIENT', async () => {
    const gw = new MockGateway(memoryStorage());
    const { save } = await gw.load();
    const ownedBefore = Object.keys(save.collection).length;
    const drawn = await gw.openChest('gem', 10);
    expect(drawn.result.ok).toBe(true);
    // 宝石箱 20% 出材料：部队卡 + 材料项 == 10（一抽一项）
    if (drawn.result.ok && 'materials' in drawn.result) {
      const m = drawn.result.materials;
      const items = Object.values({ ...m.ingots, ...m.traitstones }).reduce((a, n) => a + n!, 0);
      expect(drawn.result.cards.length + items).toBe(10);
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

    // 出战票随存档持久化：刷新页面后仍可结算
    const again = await gw.planQuestBattle(kingdom, 7);
    if (!again.ok) throw new Error(again.message);
    const reloaded = new MockGateway(storage);
    await reloaded.load();
    const late = await reloaded.settleBattle(fakeResult({ ...ticketIds(again), winner: 'player' }));
    expect(late.result.ok).toBe(true);
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
