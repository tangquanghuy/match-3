import { describe, expect, it } from 'vitest';
import { CommandGateway } from '../../src/meta/gateway/commandGateway';
import { HttpTransport, LocalTransport, memoryStorage } from '../../src/meta/gateway/transport';
import { allKingdoms } from '../../src/meta/data/kingdoms';
import type { MetaCommand, CommandReply } from '../../src/meta/server/protocol';
import type { BattleTicket } from '../../src/meta/gateway';
import type { BattleResult } from '@session/contract';

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function victory(ticket: BattleTicket): BattleResult {
  return { schemaVersion: 1, battleId: ticket.request.battleId, requestId: ticket.request.requestId,
    rulesetVersion: ticket.request.rulesetVersion, seed: ticket.request.seed, winner: 'player',
    turns: 3, combatants: [], defeatedExternalIds: [], summonedCount: 0, actionLogDigest: '', eventSummary: [] };
}

/** Real HTTP transport/JSON and real authoritative core, with deterministic network scheduling.
 * Not a live Worker, authentication or Cloudflare latency test. One gateway, one account, one code build.
 */
function fixture(afterCommand?: (command: MetaCommand, reply: CommandReply) => Promise<void>) {
  const authority = new LocalTransport(memoryStorage());
  const trace: { path: string; type?: string; keys?: string[]; from?: number; to?: number }[] = [];
  const http = new HttpTransport('/api/meta', async (input, init) => {
    const url = new URL(String(input), 'https://fixture.test');
    if (init?.method === 'GET') {
      trace.push({ path: url.pathname + url.search });
      return Response.json(await authority.load({ preservePendingBattle: url.searchParams.get('sync') === '1' }));
    }
    const command = JSON.parse(String(init?.body)) as MetaCommand;
    const reply = await authority.send(command);
    trace.push({ path: url.pathname, type: command.type, keys: Object.keys(command).sort(),
      from: reply.patch?.from, to: reply.patch?.to });
    await afterCommand?.(command, reply);
    return Response.json(reply);
  });
  return { authority, trace, http, player: new CommandGateway(http) };
}
const kingdom = allKingdoms()[0]!;

describe('single-client HTTP save revisions are independent of application releases', () => {
  it('sequential successful commands increment data revision without sending a client version', async () => {
    const { player, trace } = fixture();
    await player.load();
    const initial = player.current().revision;
    await player.setKingdomExploreTier(kingdom, 4);
    const ticket = await player.planExploreBattle(kingdom);
    if (!ticket.ok) throw new Error(ticket.message);
    expect((await player.settleBattle(victory(ticket))).result.ok).toBe(true);
    expect(player.current().revision).toBe(initial + 3);
    expect(trace.filter(row => row.type).map(row => [row.from, row.to])).toEqual([
      [initial, initial + 1], [initial + 1, initial + 2], [initial + 2, initial + 3],
    ]);
    expect(trace.filter(row => row.type).every(row => row.keys?.join(',') === 'args,type')).toBe(true);
    expect(trace.filter(row => row.path.includes('/save'))).toHaveLength(1);
  });

  it('a delayed reply in the SAME client creates a revision gap; readonly sync preserves settlement', async () => {
    const committed = latch(), release = latch();
    const { player, authority, trace } = fixture(async command => {
      if (command.type === 'setKingdomExploreTier') { committed.resolve(); await release.promise; }
    });
    await player.load();
    const initial = player.current().revision;
    const selection = player.setKingdomExploreTier(kingdom, 4);
    await committed.promise;
    expect(player.current().revision).toBe(initial);
    expect((await authority.load({ preservePendingBattle: true })).save.revision).toBe(initial + 1);
    let ticket;
    try {
      ticket = await player.planExploreBattle(kingdom);
      if (!ticket.ok) throw new Error(ticket.message);
      expect(trace.at(-2)).toMatchObject({ type: 'planExploreBattle', from: initial + 1, to: initial + 2 });
      expect(trace.at(-1)?.path).toBe('/api/meta/save?sync=1');
      expect(player.current().pendingBattle?.requestId).toBe(ticket.request.requestId);
    } finally { release.resolve(); await selection; }
    if (!ticket?.ok) throw new Error('Missing battle ticket');
    expect(player.current().revision).toBe(initial + 2);
    expect((await player.settleBattle(victory(ticket))).result.ok).toBe(true);
    expect(player.current().kingdoms[kingdom]!.clearedExploreTiers).toContain(4);
  });

  it('a lost response can leave the server ahead despite identical builds and one client', async () => {
    const { player, authority, trace } = fixture(async command => {
      if (command.type === 'setKingdomExploreTier') throw new TypeError('Simulated response loss AFTER commit');
    });
    await player.load();
    const initial = player.current().revision;
    await expect(player.setKingdomExploreTier(kingdom, 4)).rejects.toThrow('AFTER commit');
    expect(player.current().revision).toBe(initial);
    expect((await authority.load({ preservePendingBattle: true })).save.revision).toBe(initial + 1);
    const ticket = await player.planExploreBattle(kingdom);
    if (!ticket.ok) throw new Error(ticket.message);
    expect(trace.at(-1)?.path).toBe('/api/meta/save?sync=1');
    expect((await player.settleBattle(victory(ticket))).result.ok).toBe(true);
  });

  it('explicit recovery sync after a lost command reply preserves the on-screen battle ticket', async () => {
    const { player, authority, trace } = fixture(async command => {
      if (command.type === 'setKingdomExploreTier') throw new TypeError('Simulated response loss AFTER commit');
    });
    await player.load();
    const ticket = await player.planExploreBattle(kingdom);
    if (!ticket.ok) throw new Error(ticket.message);
    await expect(player.setKingdomExploreTier(kingdom, 4)).rejects.toThrow('AFTER commit');
    const snapshot = await player.sync();
    expect(trace.at(-1)?.path).toBe('/api/meta/save?sync=1');
    expect(snapshot.save.revision).toBe((await authority.load({ preservePendingBattle: true })).save.revision);
    expect(snapshot.save.pendingBattle?.requestId).toBe(ticket.request.requestId);
    expect((await player.settleBattle(victory(ticket))).result.ok).toBe(true);
  });

  it('the OLD mismatch-to-normal-load sequence discards a new ticket even with the same ruleset', async () => {
    const { http } = fixture();
    const initial = await http.load();
    // Server commits selection; simulate the client not yet receiving/applying that reply.
    await http.send({ type: 'setKingdomExploreTier', args: { kingdom, tier: 4 } });
    const plan = await http.send({ type: 'planExploreBattle', args: { kingdom } });
    if (!plan.result.ok) throw new Error(plan.result.message);
    expect(plan.patch?.from).not.toBe(initial.save.revision);
    // The former gateway called default load() here instead of a readonly sync.
    expect((await http.load()).save.pendingBattle).toBeNull();
    const result = victory(plan.result);
    expect(result.rulesetVersion).toBe(plan.result.request.rulesetVersion);
    const settled = await http.send({ type: 'settleBattle', args: { result } });
    expect(settled.result).toMatchObject({ ok: false, code: 'INVALID', message: '没有待结算的战斗（已结算或已过期）' });
  });
});
