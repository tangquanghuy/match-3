import { describe, expect, it, vi } from 'vitest';
import { CommandGateway } from '../../src/meta/gateway/commandGateway';
import { HttpTransport, LocalTransport, memoryStorage } from '../../src/meta/gateway/transport';
import { allKingdoms } from '../../src/meta/data/kingdoms';
import type { BattleResult } from '../../src/session/contract';
import type { BattleTicket } from '../../src/meta/gateway';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}

function victory(ticket: BattleTicket): BattleResult {
  return { schemaVersion: 1, battleId: ticket.request.battleId, requestId: ticket.request.requestId,
    rulesetVersion: ticket.request.rulesetVersion, seed: ticket.request.seed, winner: 'player',
    turns: 3, combatants: [], defeatedExternalIds: [], summonedCount: 0, actionLogDigest: '', eventSummary: [] };
}

describe('通关进度与存档版本重同步', () => {
  it.each(['normal', 'hard', 'veryHard'] as const)('%s: 出战时副本落后，重同步不应作废刚签发的战斗票', async mode => {
    const storage = memoryStorage();
    const transport = new LocalTransport(storage);
    const player = new CommandGateway(transport);
    const other = new CommandGateway(transport);
    await player.load();
    await other.load();
    const home = allKingdoms()[0]!;
    const kingdom = mode === 'normal' ? allKingdoms()[2]! : home;
    const before = player.current().kingdoms[kingdom]!.questsDone;
    // 另一个标签页/设备已经写入，当前客户端的 revision 落后一版。
    const changed = await other.setKingdomExploreTier(home, mode === 'veryHard' ? 2 : 1);
    expect(changed.result).toBe(mode === 'veryHard' ? 2 : 1);
    expect(player.current().revision).toBeLessThan(other.current().revision);
    const ticket = mode === 'normal' ? await player.planQuestBattle(kingdom, before + 1) : await player.planExploreBattle(kingdom);
    if (!ticket.ok) throw new Error(ticket.message);
    expect(player.current().pendingBattle?.requestId).toBe(ticket.request.requestId);
    const settled = await player.settleBattle(victory(ticket));
    expect(settled.result.ok).toBe(true);
    const afterWin = structuredClone(player.current());
    expect((await player.settleBattle(victory(ticket))).result.ok).toBe(false);
    expect(player.current()).toEqual(afterWin);
    const reload = new CommandGateway(new LocalTransport(storage));
    const { save } = await reload.load();
    if (mode === 'normal') expect(save.kingdoms[kingdom]!.questsDone).toBe(before + 1);
    else expect(save.kingdoms[kingdom]!.exploreRun).toMatchObject({ tier: mode === 'hard' ? 1 : 2, stage: 1 });
  });
});

describe('战斗重同步与乱序响应边界', () => {
  it('正常刷新仍放弃未结算战斗；只读同步不修改票据或存档版本', async () => {
    const transport = new LocalTransport(memoryStorage());
    const player = new CommandGateway(transport);
    await player.load();
    const ticket = await player.planExploreBattle(allKingdoms()[0]!);
    if (!ticket.ok) throw new Error(ticket.message);
    const before = structuredClone(player.current());
    expect((await transport.load({ preservePendingBattle: true })).save).toEqual(before);
    expect((await player.load()).save.pendingBattle).toBeNull();
    expect((await player.settleBattle(victory(ticket))).result.ok).toBe(false);
  });

  it('选择关卡的旧响应晚于出战响应，不取消新战斗或覆盖通关进度', async () => {
    const transport = new LocalTransport(memoryStorage());
    const player = new CommandGateway(transport);
    await player.load();
    const original = transport.send.bind(transport);
    const held = deferred();
    const sent = deferred();
    vi.spyOn(transport, 'send').mockImplementation(async command => {
      const reply = await original(command);
      if (command.type === 'setKingdomExploreTier') {
        sent.resolve();
        await held.promise;
      }
      return reply;
    });
    const select = player.setKingdomExploreTier(allKingdoms()[0]!, 2);
    await sent.promise;
    const ticket = await player.planExploreBattle(allKingdoms()[0]!);
    if (!ticket.ok) throw new Error(ticket.message);
    expect(player.current().pendingBattle?.requestId).toBe(ticket.request.requestId);
    expect((await player.settleBattle(victory(ticket))).result.ok).toBe(true);
    const after = structuredClone(player.current());
    held.resolve();
    await select;
    expect(player.current()).toEqual(after);
    expect(player.current().kingdoms[allKingdoms()[0]!]!.exploreRun).toMatchObject({ tier: 2, stage: 1 });
  });

  it('较旧快照晚到时，不回退已同步的新进度', async () => {
    const transport = new LocalTransport(memoryStorage());
    const player = new CommandGateway(transport);
    const other = new CommandGateway(transport);
    await player.load();
    await other.load();
    const home = allKingdoms()[0]!;
    await other.setKingdomExploreTier(home, 1);
    const original = transport.load.bind(transport);
    const held = deferred();
    const captured = deferred();
    let firstSync = true;
    vi.spyOn(transport, 'load').mockImplementation(async options => {
      const reply = await original(options);
      if (options?.preservePendingBattle && firstSync) {
        firstSync = false;
        captured.resolve();
        await held.promise;
      }
      return reply;
    });
    const first = player.setKingdomExploreTier(home, 2);
    await captured.promise;
    const ticket = await player.planExploreBattle(home);
    if (!ticket.ok) throw new Error(ticket.message);
    expect((await player.settleBattle(victory(ticket))).result.ok).toBe(true);
    const after = structuredClone(player.current());
    held.resolve();
    await first;
    expect(player.current()).toEqual(after);
    expect(player.current().kingdoms[home]!.exploreRun).toMatchObject({ tier: 2, stage: 1 });
  });

  it('HTTP 区分页面刷新和保留战斗票的内部同步', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response(JSON.stringify({ save: {}, serverNow: 0, fresh: false, warning: null })));
    const transport = new HttpTransport('/api/meta', fetcher);
    await transport.load();
    await transport.load({ preservePendingBattle: true });
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(['/api/meta/save', '/api/meta/save?sync=1']);
    expect(fetcher.mock.calls.every(([, options]) => options?.credentials === 'include')).toBe(true);
  });
});
