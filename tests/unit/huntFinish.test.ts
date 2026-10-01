import { describe, expect, it } from 'vitest';
import { SeededRNG } from '../../src/engine/rng';
import { newSave } from '../../src/meta/state/schema';
import { finishHunt, rollRewards, HUNT_FIXED_REWARDS } from '../../src/meta/systems/treasureHunt';
import { CommandGateway, MockGateway } from '../../src/meta/gateway/commandGateway';
import { HttpTransport, LocalTransport, memoryStorage } from '../../src/meta/gateway/transport';
import { isCriticalCommand, type MetaCommand } from '../../src/meta/server/protocol';

function fixture() {
  const save = newSave({ now: 0 });
  save.materials.treasureMaps = 3;
  save.materials.traitstones = { 'minor:blue': 5 };
  save.treasureHunt = { cells: Array.from({ length: 64 }, (_, i) => i % 8), turns: 99, moves: 37, rng: 2 };
  return save;
}

describe('藏宝图主动结束', () => {
  it('按当前棋盘与随机流直接结算，不走一步、不合成、不扣额外藏宝图', () => {
    const save = fixture(), before = structuredClone(save);
    const expected = rollRewards(save.treasureHunt!.cells, 37, new SeededRNG(2));
    const result = finishHunt(save);
    expect(result).toMatchObject({ ok: true, over: true, moves: 37, turns: 0, grant: expected, events: [], cells: before.treasureHunt!.cells });
    expect(save.treasureHunt).toBeNull();
    expect(save.materials.treasureMaps).toBe(3);
    for (const key of ['gold','gems','souls','glory','goldKeys'] as const)
      expect(save.currencies[key] - before.currencies[key]).toBe(expected[key]);
    const stones = { ...before.materials.traitstones };
    for (const [key, amount] of Object.entries(expected.traitstones)) stones[key] = (stones[key] ?? 0) + amount;
    expect(save.materials.traitstones).toEqual(stones);
    const settled = structuredClone(save);
    expect(finishHunt(save).ok).toBe(false);
    expect(save).toEqual(settled);
  });

  it('未开始或无有效局时不付奖励', () => {
    for (const state of [null, { ...fixture().treasureHunt!, turns: 0 }]) {
      const save = fixture(); save.treasureHunt = state;
      const before = structuredClone(save);
      expect(finishHunt(save).ok).toBe(false);
      expect(save).toEqual(before);
    }
  });

  it('四货币逐项为原表70%向下取整', () => {
    const original = [
      [25,0,0,0], [75,0,0,0], [250,0,0,0], [500,50,0,0],
      [2000,150,30,0], [10000,500,100,20], [50000,1500,300,100], [200000,5000,1000,300],
    ];
    const keys = ['gold','souls','glory','gems'] as const;
    for (let tier=0;tier<original.length;tier++) keys.forEach((key,index) => {
      expect(HUNT_FIXED_REWARDS[tier]![key] ?? 0).toBe(Math.floor(original[tier]![index]! * 7 / 10));
    });
  });

  it('关键写立即落盘，重复请求只付一次，重载不恢复已结算棋盘', async () => {
    expect(isCriticalCommand('finishTreasureHunt')).toBe(true);
    const storage = memoryStorage();
    const gateway = new MockGateway(storage, { now: () => 1000, flushDelayMs: 60000, schedule: () => {} });
    await gateway.load();
    await gateway.dev!.importSaveJson(JSON.stringify(fixture()));
    const before = structuredClone(gateway.current());
    const [first, second] = await Promise.all([gateway.finishTreasureHunt(), gateway.finishTreasureHunt()]);
    expect(first.result.ok).toBe(true); expect(second.result.ok).toBe(false);
    if (!first.result.ok) throw new Error(first.result.message);
    const after = gateway.current();
    expect(after.currencies.gold - before.currencies.gold).toBe(first.result.grant!.gold);
    expect(after.treasureHunt).toBeNull();
    const loaded = await new MockGateway(storage, { now: () => 1000 }).load();
    expect(loaded.save.currencies).toEqual(after.currencies);
    expect(loaded.save.materials).toEqual(after.materials);
    expect(loaded.save.treasureHunt).toBeNull();
  });

  it('HTTP丢回执后同步能读到已到账状态，重试不重复发放', async () => {
    const authority = new LocalTransport(memoryStorage(), { now: () => 1000 });
    let loseReply = true;
    const gateway = new CommandGateway(new HttpTransport('/api/meta', async (_input, init) => {
      if (init?.method === 'GET') return Response.json(await authority.load({ preservePendingBattle: true }));
      const command = JSON.parse(String(init?.body)) as MetaCommand;
      const reply = await authority.send(command);
      if (command.type === 'finishTreasureHunt' && loseReply) { loseReply = false; throw new Error('lost reply'); }
      return Response.json(reply);
    }));
    await gateway.load();
    await authority.send({ type: 'dev.importSave', args: { json: JSON.stringify(fixture()) } });
    await gateway.sync();
    const before = structuredClone(gateway.current());
    await expect(gateway.finishTreasureHunt()).rejects.toThrow('lost reply');
    await gateway.sync();
    const after = structuredClone(gateway.current());
    expect(after.treasureHunt).toBeNull();
    expect(after.currencies.gold).toBeGreaterThan(before.currencies.gold);
    expect((await gateway.finishTreasureHunt()).result.ok).toBe(false);
    expect(gateway.current().currencies).toEqual(after.currencies);
  });
});
