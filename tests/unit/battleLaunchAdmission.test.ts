import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BattleLauncher } from '../../src/meta/shell/battleLauncher';
import { CommandGateway } from '../../src/meta/gateway/commandGateway';
import { LocalTransport, memoryStorage } from '../../src/meta/gateway/transport';
import { allKingdoms } from '../../src/meta/data/kingdoms';
import type { ShellCtx } from '../../src/meta/shell/screen';
import type { BattleRequest, BattleResult } from '@session/contract';

const rendered = vi.hoisted(() => ({ requests: [] as BattleRequest[], toast: vi.fn() }));
vi.mock('../../src/meta/shell/chrome', () => ({ toast: rendered.toast }));
// Only rendering is replaced; the launcher, gateway and authoritative ticket lifecycle are real.
vi.mock('../../src/meta/shell/battleLoading', () => ({ BattleLoadingScreen: class {
  async preload() {
    return { App: class {
      async init(_root: HTMLElement, request: BattleRequest) { rendered.requests.push(request); }
      destroy() {}
    }, buildMetaRegistry: () => ({}) };
  }
  async finish() {}
  dispose() {}
} }));

function latch() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
function victory(request: BattleRequest): BattleResult {
  return { schemaVersion: 1, battleId: request.battleId, requestId: request.requestId,
    rulesetVersion: request.rulesetVersion, seed: request.seed, winner: 'player',
    turns: 3, combatants: [], defeatedExternalIds: [], summonedCount: 0, actionLogDigest: '', eventSummary: [] };
}
async function fixture() {
  const transport = new LocalTransport(memoryStorage());
  const gateway = new CommandGateway(transport);
  await gateway.load();
  const ctx = { gateway, currentHash: () => '#quest', navigate: vi.fn(), refresh: vi.fn(), showResult: vi.fn() } as unknown as ShellCtx;
  const launcher = new BattleLauncher({ hidden: true } as HTMLElement, ctx);
  return { transport, gateway, launcher };
}
const kingdom = allKingdoms()[0]!;
beforeEach(() => { rendered.requests.length = 0; rendered.toast.mockClear(); });

describe('admit at most one battle before requesting an authoritative ticket', () => {
  it('double-click during a delayed plan response does not issue a replacement ticket', async () => {
    const { transport, gateway, launcher } = await fixture();
    const committed = latch(), release = latch();
    const original = transport.send.bind(transport);
    const calls = vi.spyOn(transport, 'send').mockImplementation(async command => {
      const reply = await original(command);
      if (command.type === 'planExploreBattle') { committed.resolve(); await release.promise; }
      return reply;
    });
    const first = launcher.launchExplore(kingdom);
    await committed.promise;
    const second = launcher.launchExplore(kingdom);
    release.resolve();
    await Promise.all([first, second]);
    expect(rendered.requests).toHaveLength(1);
    expect((await gateway.settleBattle(victory(rendered.requests[0]!))).result.ok).toBe(true);
    expect(calls.mock.calls.filter(([c]) => c.type === 'planExploreBattle')).toHaveLength(1);
  });

  it('another launch while combat is running preserves the on-screen battle ticket', async () => {
    const { gateway, launcher } = await fixture();
    await launcher.launchExplore(kingdom);
    const first = rendered.requests[0]!;
    await launcher.launchExplore(kingdom);
    expect(gateway.current().pendingBattle?.requestId).toBe(first.requestId);
    expect((await gateway.settleBattle(victory(first))).result.ok).toBe(true);
  });

  it('the admission lock also covers the difficulty-save request before planning', async () => {
    const { transport, gateway, launcher } = await fixture();
    const committed = latch(), release = latch();
    const original = transport.send.bind(transport);
    const calls = vi.spyOn(transport, 'send').mockImplementation(async command => {
      const reply = await original(command);
      if (command.type === 'setKingdomExploreTier') { committed.resolve(); await release.promise; }
      return reply;
    });
    const first = launcher.launchExplore(kingdom, 4);
    await committed.promise;
    const second = launcher.launchExplore(kingdom, 5);
    release.resolve();
    await Promise.all([first, second]);
    expect(calls.mock.calls.filter(([c]) => c.type === 'setKingdomExploreTier')).toHaveLength(1);
    expect(gateway.current().kingdoms[kingdom]!.exploreTier).toBe(4);
    expect(rendered.requests).toHaveLength(1);
  });

  it('a rejected plan releases admission so a later retry can start', async () => {
    const { transport, launcher } = await fixture();
    vi.spyOn(transport, 'send').mockRejectedValueOnce(new Error('network fixture failure'));
    await launcher.launchExplore(kingdom).catch(() => undefined);
    await launcher.launchExplore(kingdom);
    expect(rendered.requests).toHaveLength(1);
  });
});
