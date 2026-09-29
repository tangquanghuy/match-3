/**
 * 存档记录化 + 玩家 Actor：只回写改动的记录、关键命令立即落盘、其余合并落盘、
 * 回执只带增量、客户端副本断档时整份重同步。
 */
import { describe, expect, it } from 'vitest';
import { buildDemoSave } from '../../src/meta/server/demo';
import { MetaHost, type RecordBatch, type SaveRepository } from '../../src/meta/server/host';
import { defaultEnv } from '../../src/meta/server/env';
import {
  COLLECTION_PREFIX,
  diffRecords,
  META_RECORD,
  recordsToSave,
  saveToRecords,
  type SaveRecords,
} from '../../src/meta/state/records';
import { CommandGateway, LocalTransport, memoryStorage, MockGateway } from '../../src/meta/gateway';
import type { MetaCommand } from '../../src/meta/server/protocol';

const NOW = 1_790_000_000_000;

/** 内存仓库：记录每一批写入，可模拟「进程崩溃」（丢掉 Actor，只留已落盘的记录） */
class MemRepo implements SaveRepository {
  records: SaveRecords | null = null;
  batches: RecordBatch[] = [];
  async load() {
    return { records: this.records ? new Map(this.records) : null, warning: null };
  }
  async write(batch: RecordBatch) {
    const next = new Map(this.records ?? []);
    for (const key of batch.del) next.delete(key);
    for (const [key, text] of batch.set) next.set(key, text);
    this.records = next;
    this.batches.push(batch);
  }
}

function manualScheduler() {
  const queue: (() => void)[] = [];
  return {
    schedule: (_ms: number, run: () => void) => void queue.push(run),
    runAll: () => { while (queue.length) queue.shift()!(); },
    get pending() { return queue.length; },
  };
}

let seed = 1;
const env = defaultEnv({ now: () => NOW, seed: () => seed++, allowDev: true });
const cmd = <T extends MetaCommand>(c: T) => c;
const firstTroop = (records: SaveRecords) => Number([...records.keys()].find((k) => k.startsWith(COLLECTION_PREFIX))!.slice(COLLECTION_PREFIX.length));

describe('存档记录化', () => {
  it('拆分往返无损；部队一条一行，其余顶层字段各一条', () => {
    const save = buildDemoSave(NOW);
    const records = saveToRecords(save);
    expect(recordsToSave(records, NOW)).toEqual(save);
    const troopRows = [...records.keys()].filter((k) => k.startsWith(COLLECTION_PREFIX));
    expect(troopRows).toHaveLength(Object.keys(save.collection).length);
    expect(records.has(META_RECORD)).toBe(true);
    expect(records.has('collection')).toBe(false);
  });

  it('diff 只报改动的记录', () => {
    const save = buildDemoSave(NOW);
    const before = saveToRecords(save);
    const id = firstTroop(before);
    const next = structuredClone(save);
    next.collection[String(id)]!.locked = true;
    next.currencies.gold += 1;
    delete next.collection[String(Object.keys(next.collection).at(-1))];
    next.revision += 1;
    const changes = diffRecords(before, saveToRecords(next));
    expect([...changes.set.keys()].sort()).toEqual([`${COLLECTION_PREFIX}${id}`, 'currencies', META_RECORD].sort());
    expect(changes.del).toHaveLength(1);
  });
});

describe('玩家 Actor', () => {
  it('非关键命令合并落盘，每批只写改动的记录', async () => {
    const repo = new MemRepo();
    const timer = manualScheduler();
    const host = new MetaHost(repo, env, { fresh: 'demo', flushDelayMs: 10_000, schedule: timer.schedule });
    const loaded = await host.load();
    expect(loaded.fresh).toBe(true);
    expect(repo.batches).toHaveLength(1); // 建档立即落盘
    const troops = Object.keys(loaded.save.collection).slice(0, 20).map(Number);

    for (const troopId of troops) await host.execute(cmd({ type: 'setTroopLocked', args: { troopId, locked: true } }));
    expect(repo.batches).toHaveLength(1); // 20 条命令，一次都没写
    expect(host.pendingRecords).toBe(21); // 20 张部队 + meta
    expect(timer.pending).toBe(1); // 只排了一次延迟落盘

    timer.runAll();
    await host.flush();
    expect(repo.batches).toHaveLength(2);
    const batch = repo.batches[1]!;
    expect(batch.set.size).toBe(21);
    expect(batch).toMatchObject({ fromRevision: 0, toRevision: 20 });
  });

  it('关键命令（开箱）提交即落盘，并把之前攒着的改动一起原子写入', async () => {
    const repo = new MemRepo();
    const timer = manualScheduler();
    const host = new MetaHost(repo, env, { fresh: 'demo', flushDelayMs: 10_000, schedule: timer.schedule });
    const { save } = await host.load();
    const troopId = Number(Object.keys(save.collection)[0]);
    await host.execute(cmd({ type: 'setTroopLocked', args: { troopId, locked: true } }));
    expect(repo.batches).toHaveLength(1);
    const chest = await host.execute(cmd({ type: 'openChest', args: { kind: 'gem', count: 1, buyMissingKeys: false } }));
    expect(chest.result.ok).toBe(true);
    expect(repo.batches).toHaveLength(2);
    expect(repo.batches[1]!.set.has(`${COLLECTION_PREFIX}${troopId}`)).toBe(true);
    expect(host.pendingRecords).toBe(0);
  });

  it('崩溃只丢未落盘的尾巴，磁盘上始终是某个完整 revision；开箱结果不会丢', async () => {
    const repo = new MemRepo();
    const timer = manualScheduler();
    const host = new MetaHost(repo, env, { fresh: 'demo', flushDelayMs: 10_000, schedule: timer.schedule });
    const { save } = await host.load();
    await host.execute(cmd({ type: 'openChest', args: { kind: 'gem', count: 1, buyMissingKeys: false } }));
    const afterChest = recordsToSave(repo.records!, NOW);
    const troopId = Number(Object.keys(save.collection)[0]);
    await host.execute(cmd({ type: 'setTroopLocked', args: { troopId, locked: true } }));
    // 进程崩溃：丢掉 Actor，不 flush
    const revived = new MetaHost(repo, env, { fresh: 'demo', flushDelayMs: 10_000, schedule: timer.schedule });
    const { save: recovered } = await revived.load();
    expect(recovered).toEqual(afterChest);
    expect(recovered.gachaLog).toHaveLength(1);
    expect(recovered.collection[String(troopId)]!.locked).toBe(false);
  });

  it('失败命令不产生增量、不写盘', async () => {
    const repo = new MemRepo();
    const host = new MetaHost(repo, env, { fresh: 'new' });
    await host.load();
    const reply = await host.execute(cmd({ type: 'levelUpTroop', args: { troopId: 999_999 } }));
    expect(reply.result).toMatchObject({ ok: false, code: 'NOT_OWNED' });
    expect(reply.patch).toBeNull();
    expect(repo.batches).toHaveLength(1);
  });

  it('回执只带增量：上锁一张卡，回执远小于整份存档', async () => {
    const repo = new MemRepo();
    const host = new MetaHost(repo, env, { fresh: 'demo' });
    const { save } = await host.load();
    const full = JSON.stringify(save).length;
    const troopId = Number(Object.keys(save.collection)[0]);
    const reply = await host.execute(cmd({ type: 'setTroopLocked', args: { troopId, locked: true } }));
    const size = JSON.stringify(reply).length;
    expect(Object.keys(reply.patch!.set).sort()).toEqual([`${COLLECTION_PREFIX}${troopId}`, META_RECORD].sort());
    expect(size).toBeLessThan(400);
    expect(size * 20).toBeLessThan(full);
  });
});

describe('客户端副本', () => {
  it('每条命令应用增量后与权威存档逐字段一致', async () => {
    const storage = memoryStorage();
    const gw = new MockGateway(storage, { now: () => NOW });
    await gw.load();
    const troopId = Number(Object.keys(gw.current().collection)[0]);
    await gw.setTroopLocked(troopId, true);
    await gw.openChest('gem', 10);
    await gw.decomposeTroop(Number(Object.keys(gw.current().collection).at(-1)));
    const authoritative = (await new MockGateway(storage, { now: () => NOW }).load()).save;
    expect(gw.current()).toEqual(authoritative);
  });

  it('副本版本断档（另一处写过）时整份重同步', async () => {
    const transport = new LocalTransport(memoryStorage(), { now: () => NOW });
    const a = new CommandGateway(transport);
    const b = new CommandGateway(transport); // 同一个 Actor 的第二个客户端
    await a.load();
    await b.load();
    const ids = Object.keys(a.current().collection).map(Number);
    await a.setTroopLocked(ids[0]!, true); // b 的副本落后一个 revision
    await b.setTroopLocked(ids[1]!, true);
    expect(b.current().collection[String(ids[0])]!.locked).toBe(true);
    expect(b.current().revision).toBe(a.current().revision + 1);
  });
});
