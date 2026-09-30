import { describe, expect, it } from 'vitest';
import { CommandGateway } from '../../src/meta/gateway/commandGateway';
import { LocalTransport, memoryStorage } from '../../src/meta/gateway/transport';
import { arrangeArenaTeam, currentDraftChoices } from '../../src/meta/systems/arena';
import { newSave } from '../../src/meta/state/schema';
import type { BattleResult } from '../../src/session/contract';

async function drafted() {
  const storage = memoryStorage();
  const gateway = new CommandGateway(new LocalTransport(storage));
  await gateway.load();
  await gateway.enterArena();
  for (let i = 0; i < 4; i++) {
    await gateway.pickDraftCard(currentDraftChoices(gateway.current())!.options[0]!.troopId);
  }
  return { gateway, storage };
}

describe('arena reordering between matches', () => {
  it.each(['player', 'enemy'] as const)('persists order after a %s result and uses it in the next ticket', async winner => {
    const { gateway, storage } = await drafted();
    await gateway.startDraftBattles();
    const ticket = await gateway.planArenaBattle();
    if (!ticket.ok) throw new Error(ticket.message);
    const result: BattleResult = {
      schemaVersion: 1, battleId: ticket.request.battleId, requestId: ticket.request.requestId,
      rulesetVersion: ticket.request.rulesetVersion, seed: ticket.request.seed, winner, turns: 2,
      combatants: [], defeatedExternalIds: [], summonedCount: 0, actionLogDigest: '00000000', eventSummary: [],
    };
    expect((await gateway.settleBattle(result)).result.ok).toBe(true);
    const before = structuredClone(gateway.current());
    const order = [...before.arena.activeDraft!.picked].reverse();
    expect((await gateway.arrangeDraftTeam(order)).result).toEqual(order);
    expect(gateway.current().arena.activeDraft).toEqual({ ...before.arena.activeDraft, picked: order });
    expect(gateway.current().currencies).toEqual(before.currencies);
    const reloaded = new CommandGateway(new LocalTransport(storage));
    await reloaded.load();
    expect(reloaded.current().arena.activeDraft!.picked).toEqual(order);
    const next = await reloaded.planArenaBattle();
    if (!next.ok) throw new Error(next.message);
    expect(next.request.playerTeam.map(member => Number(member.externalId.split('-')[1]))).toEqual(order);
  });

  it('rejects changes while an arena ticket is pending without changing the ticket or save', async () => {
    const { gateway } = await drafted();
    await gateway.startDraftBattles();
    expect((await gateway.planArenaBattle()).ok).toBe(true);
    const before = structuredClone(gateway.current());
    expect((await gateway.arrangeDraftTeam([...before.arena.activeDraft!.picked].reverse())).result)
      .toMatchObject({ ok: false, message: '本场战斗尚未结算，请结算后调整站位' });
    expect(gateway.current()).toEqual(before);
  });

  it('still rejects duplicate, missing or foreign cards between matches', async () => {
    const { gateway } = await drafted();
    await gateway.startDraftBattles();
    const before = structuredClone(gateway.current());
    const ids = before.arena.activeDraft!.picked;
    for (const order of [ids.slice(1), [ids[0]!, ids[0]!, ...ids.slice(2)], [-1, ...ids.slice(1)]]) {
      expect((await gateway.arrangeDraftTeam(order)).result).toMatchObject({ ok: false });
      expect(gateway.current()).toEqual(before);
    }
  });

  it('returns a normal validation failure before drafting is complete', () => {
    const save = newSave({ now: 1 });
    expect(arrangeArenaTeam(save, [])).toMatchObject({ ok: false });
    save.arena.activeDraft = { seed: 1, picked: [6000], stage: 'picking', wins: 0, losses: 0, rulesVersion: 2 };
    const before = structuredClone(save);
    expect(arrangeArenaTeam(save, [6000])).toMatchObject({ ok: false });
    expect(save).toEqual(before);
  });
});
