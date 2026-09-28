import { describe, it, expect, vi } from 'vitest';
import { registerSkillLibrary } from '@engine/skills/library';
import { ExtensionRegistry } from '@engine/registry';
import { BaseColor } from '@engine/types';
import { implementedTraitIds } from '@engine/traits';
import {
  BATTLE_SCHEMA_VERSION,
  HOST_MESSAGE_TYPES,
  PostMessageHostBridge,
  RULESET_VERSION,
  StandaloneHostBridge,
  parseInboundMessage,
} from '@session/index';
import type {
  BattleRequest,
  BattleResult,
  BattleStarted,
  IncomingEnvelope,
  MessagePortLike,
  OutboundMessage,
} from '@session/index';

const HOST_ORIGIN = 'https://host.example';
const OTHER_ORIGIN = 'https://evil.example';

function knownSkillIds(): Set<string> {
  const registry = new ExtensionRegistry();
  registerSkillLibrary(registry.prototypes);
  return new Set([...registry.skills.keys(), ...registry.prototypes.keys()]);
}

/** 假端口：记录出站消息，可手动灌入入站消息。 */
function fakePort() {
  const sent: { message: OutboundMessage; targetOrigin: string }[] = [];
  let handler: ((envelope: IncomingEnvelope) => void) | null = null;
  const port: MessagePortLike = {
    post(message, targetOrigin) {
      sent.push({ message, targetOrigin });
    },
    subscribe(fn) {
      handler = fn;
      return () => { handler = null; };
    },
  };
  return {
    port,
    sent,
    deliver(data: unknown, origin = HOST_ORIGIN) {
      handler?.({ data, origin });
    },
    typesOf: () => sent.map((s) => s.message.type),
    lastOf(type: string) {
      return [...sent].reverse().find((s) => s.message.type === type)?.message;
    },
    subscribed: () => handler !== null,
  };
}

function snapshot(externalId: string, skillId = '7004') {
  return {
    externalId,
    name: externalId,
    stats: { hp: 40, attack: 4, armor: 0, magic: 6 },
    manaColors: [BaseColor.Red],
    manaCost: 12,
    skillId,
    traitIds: [] as string[],
  };
}

function hostRequest(over: Partial<BattleRequest> = {}): BattleRequest {
  return {
    schemaVersion: BATTLE_SCHEMA_VERSION,
    battleId: 'b-1',
    requestId: 'r-1',
    rulesetVersion: RULESET_VERSION,
    seed: 7,
    playerTeam: [snapshot('p1')],
    enemyTeam: [snapshot('e1')],
    ...over,
  } as BattleRequest;
}

function startMessage(request: BattleRequest = hostRequest()) {
  return {
    schemaVersion: BATTLE_SCHEMA_VERSION,
    type: HOST_MESSAGE_TYPES.start,
    battleId: request.battleId,
    requestId: request.requestId,
    request,
  };
}

function makeResult(over: Partial<BattleResult> = {}): BattleResult {
  return {
    schemaVersion: BATTLE_SCHEMA_VERSION,
    battleId: 'b-1',
    requestId: 'r-1',
    rulesetVersion: RULESET_VERSION,
    seed: 7,
    winner: 'player',
    turns: 3,
    combatants: [],
    defeatedExternalIds: ['e1'],
    summonedCount: 0,
    actionLogDigest: 'deadbeef',
    eventSummary: [],
    ...over,
  };
}

function makeBridge(opts: { retryIntervalMs?: number; maxResultAttempts?: number } = {}) {
  const io = fakePort();
  const bridge = new PostMessageHostBridge({
    allowedOrigins: [HOST_ORIGIN],
    port: io.port,
    knownSkillIds: knownSkillIds(),
    retryIntervalMs: opts.retryIntervalMs ?? 5,
    maxResultAttempts: opts.maxResultAttempts ?? 3,
  });
  return { io, bridge };
}

const startedMeta: BattleStarted = {
  battleId: 'b-1',
  requestId: 'r-1',
  rulesetVersion: RULESET_VERSION,
  startedAt: '2026-08-30T00:00:00.000Z',
};

describe('消息信封校验（需求 3.4）', () => {
  it('拒绝非对象、错版本、未知类型与缺 id', () => {
    expect(parseInboundMessage(null).ok).toBe(false);
    expect(parseInboundMessage({ schemaVersion: 2, type: HOST_MESSAGE_TYPES.start }).ok).toBe(false);
    expect(parseInboundMessage({ schemaVersion: 1, type: 'battle:whatever' }).ok).toBe(false);
    expect(parseInboundMessage({ schemaVersion: 1, type: HOST_MESSAGE_TYPES.resultAck, battleId: '', requestId: 'r' }).ok)
      .toBe(false);
  });

  it('battle:start 必须带 request 对象', () => {
    const bad = parseInboundMessage({
      schemaVersion: 1, type: HOST_MESSAGE_TYPES.start, battleId: 'b', requestId: 'r',
    });
    expect(bad.ok).toBe(false);
  });

  it('合法 ack 与 start 能解析出类型', () => {
    const ack = parseInboundMessage({
      schemaVersion: 1, type: HOST_MESSAGE_TYPES.resultAck, battleId: 'b', requestId: 'r',
    });
    expect(ack.ok).toBe(true);
    expect(parseInboundMessage(startMessage()).ok).toBe(true);
  });
});

describe('PostMessageHostBridge 构造约束（需求 3.4）', () => {
  it('白名单不接受 * 或空', () => {
    const io = fakePort();
    const base = { port: io.port, knownSkillIds: knownSkillIds() };
    expect(() => new PostMessageHostBridge({ ...base, allowedOrigins: ['*'] })).toThrow(/\*/);
    expect(() => new PostMessageHostBridge({ ...base, allowedOrigins: [''] })).toThrow();
    expect(() => new PostMessageHostBridge({ ...base, allowedOrigins: [] })).toThrow(/不能为空/);
  });
});

describe('生命周期 ready → start → started → result → ack（需求 3.3）', () => {
  it('走完一整轮，消息顺序正确', async () => {
    const { io, bridge } = makeBridge();

    const waiting = bridge.waitForBattle();
    expect(io.typesOf()).toEqual([HOST_MESSAGE_TYPES.ready]);
    expect(io.sent[0].targetOrigin).toBe(HOST_ORIGIN);

    io.deliver(startMessage());
    const request = await waiting;
    expect(request.battleId).toBe('b-1');

    bridge.notifyStarted(startedMeta);
    const submitted = bridge.submitResult(makeResult());
    expect(io.typesOf()).toEqual([
      HOST_MESSAGE_TYPES.ready,
      HOST_MESSAGE_TYPES.started,
      HOST_MESSAGE_TYPES.result,
    ]);

    io.deliver({
      schemaVersion: BATTLE_SCHEMA_VERSION,
      type: HOST_MESSAGE_TYPES.resultAck,
      battleId: 'b-1',
      requestId: 'r-1',
    });
    await expect(submitted).resolves.toBeUndefined();
    bridge.dispose();
  });

  it('投递状态依次为 pending → acknowledged', async () => {
    const { io, bridge } = makeBridge();
    const states: string[] = [];
    bridge.onDeliveryStateChange((s) => states.push(s.phase));

    io.deliver(startMessage());
    await bridge.waitForBattle();
    const submitted = bridge.submitResult(makeResult());
    expect(bridge.hasUnacknowledgedResult()).toBe(true);

    io.deliver({
      schemaVersion: BATTLE_SCHEMA_VERSION, type: HOST_MESSAGE_TYPES.resultAck,
      battleId: 'b-1', requestId: 'r-1',
    });
    await submitted;

    expect(states).toEqual(['idle', 'pending', 'acknowledged']);
    expect(bridge.hasUnacknowledgedResult()).toBe(false);
    bridge.dispose();
  });
});

describe('origin 与内容校验', () => {
  it('非白名单 origin 的消息被丢弃且不回任何消息', async () => {
    const { io, bridge } = makeBridge();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    void bridge.waitForBattle();
    io.sent.length = 0;

    io.deliver(startMessage(), OTHER_ORIGIN);
    expect(io.sent).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    bridge.dispose();
  });

  it('request 内容不合法时回 invalid-request 并附问题列表', async () => {
    const { io, bridge } = makeBridge();
    void bridge.waitForBattle();
    io.sent.length = 0;

    io.deliver(startMessage(hostRequest({ playerTeam: [snapshot('p1', 'not-registered')] })));
    const err = io.lastOf(HOST_MESSAGE_TYPES.error);
    expect(err).toMatchObject({ error: { code: 'invalid-request' } });
    expect(Array.isArray((err as { error: { details: unknown } }).error.details)).toBe(true);
    bridge.dispose();
  });

  it('信封与 request 内的 id 不一致时拒绝', async () => {
    const { io, bridge } = makeBridge();
    void bridge.waitForBattle();
    io.sent.length = 0;

    io.deliver({ ...startMessage(), battleId: 'mismatch' });
    expect(io.lastOf(HOST_MESSAGE_TYPES.error)).toMatchObject({ error: { code: 'bad-message' } });
    bridge.dispose();
  });

  it('协议层错误回 bad-message', async () => {
    const { io, bridge } = makeBridge();
    void bridge.waitForBattle();
    io.sent.length = 0;

    io.deliver({ schemaVersion: 99, type: HOST_MESSAGE_TYPES.start });
    expect(io.lastOf(HOST_MESSAGE_TYPES.error)).toMatchObject({ error: { code: 'bad-message' } });
    bridge.dispose();
  });
});

describe('battleId 幂等（需求 3.5）', () => {
  it('同一 battleId 重复 start 只受理一次，并补发 started', async () => {
    const { io, bridge } = makeBridge();
    const waiting = bridge.waitForBattle();
    io.deliver(startMessage());
    await waiting;
    bridge.notifyStarted(startedMeta);
    io.sent.length = 0;

    io.deliver(startMessage());
    io.deliver(startMessage());
    // 只补发 started，不产生错误，也不再解析 request
    expect(io.typesOf()).toEqual([HOST_MESSAGE_TYPES.started, HOST_MESSAGE_TYPES.started]);
    bridge.dispose();
  });

  it('已有战斗时换 battleId 会被拒为 battle-busy', async () => {
    const { io, bridge } = makeBridge();
    const waiting = bridge.waitForBattle();
    io.deliver(startMessage());
    await waiting;
    io.sent.length = 0;

    io.deliver(startMessage(hostRequest({ battleId: 'b-2', requestId: 'r-2' })));
    expect(io.lastOf(HOST_MESSAGE_TYPES.error)).toMatchObject({ error: { code: 'battle-busy' } });
    bridge.dispose();
  });
});

describe('结果重试（需求 3.5）', () => {
  it('未收到 ack 会按间隔重投，attempt 递增', async () => {
    const { io, bridge } = makeBridge({ retryIntervalMs: 5, maxResultAttempts: 3 });
    io.deliver(startMessage());
    await bridge.waitForBattle();

    const submitted = bridge.submitResult(makeResult());
    await expect(submitted).rejects.toThrow(/battle:result-ack/);

    const attempts = io.sent
      .filter((s) => s.message.type === HOST_MESSAGE_TYPES.result)
      .map((s) => (s.message as { attempt: number }).attempt);
    expect(attempts).toEqual([1, 2, 3]);
    // 用尽次数后上报错误并进入 failed
    expect(io.lastOf(HOST_MESSAGE_TYPES.error)).toMatchObject({
      error: { code: 'result-unacknowledged' },
    });
    bridge.dispose();
  });

  it('中途收到 ack 就停止重投', async () => {
    const { io, bridge } = makeBridge({ retryIntervalMs: 20, maxResultAttempts: 5 });
    io.deliver(startMessage());
    await bridge.waitForBattle();

    const submitted = bridge.submitResult(makeResult());
    io.deliver({
      schemaVersion: BATTLE_SCHEMA_VERSION, type: HOST_MESSAGE_TYPES.resultAck,
      battleId: 'b-1', requestId: 'r-1',
    });
    await submitted;

    await new Promise((r) => setTimeout(r, 60));
    const resultCount = io.sent.filter((s) => s.message.type === HOST_MESSAGE_TYPES.result).length;
    expect(resultCount).toBe(1);
    bridge.dispose();
  });

  it('battleId 不匹配的 ack 不生效', async () => {
    const { io, bridge } = makeBridge({ retryIntervalMs: 5, maxResultAttempts: 2 });
    io.deliver(startMessage());
    await bridge.waitForBattle();

    const submitted = bridge.submitResult(makeResult());
    io.deliver({
      schemaVersion: BATTLE_SCHEMA_VERSION, type: HOST_MESSAGE_TYPES.resultAck,
      battleId: 'other', requestId: 'r-1',
    });
    await expect(submitted).rejects.toThrow();
    bridge.dispose();
  });

  it('同一份结果重复 submit 共享同一条重试链', async () => {
    const { io, bridge } = makeBridge({ retryIntervalMs: 30, maxResultAttempts: 5 });
    io.deliver(startMessage());
    await bridge.waitForBattle();

    const result = makeResult();
    const first = bridge.submitResult(result);
    const second = bridge.submitResult(result);
    io.deliver({
      schemaVersion: BATTLE_SCHEMA_VERSION, type: HOST_MESSAGE_TYPES.resultAck,
      battleId: 'b-1', requestId: 'r-1',
    });
    await Promise.all([first, second]);

    expect(io.sent.filter((s) => s.message.type === HOST_MESSAGE_TYPES.result)).toHaveLength(1);
    bridge.dispose();
  });

  it('dispose 后清理监听与重试定时器', async () => {
    const { io, bridge } = makeBridge({ retryIntervalMs: 5, maxResultAttempts: 5 });
    io.deliver(startMessage());
    await bridge.waitForBattle();
    void bridge.submitResult(makeResult()).catch(() => {});
    bridge.dispose();

    const before = io.sent.length;
    await new Promise((r) => setTimeout(r, 40));
    expect(io.sent.length).toBe(before);
    expect(io.subscribed()).toBe(false);
  });
});

describe('StandaloneHostBridge（需求 2.5、3.7）', () => {
  it('直接返回本地配置（固定 4v4）', async () => {
    const bridge = new StandaloneHostBridge({
      knownSkillIds: knownSkillIds(),
      knownTraitIds: new Set(implementedTraitIds()),
      knownTroopTypes: new Set(['Knight', 'Elf', 'Daemon']),
    });
    const request = await bridge.waitForBattle();
    expect(request.playerTeam).toHaveLength(4);
    bridge.dispose();
  });

  it('结果视为立即确认，并留存供本地查看', async () => {
    const bridge = new StandaloneHostBridge({ knownSkillIds: knownSkillIds() });
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const states: string[] = [];
    bridge.onDeliveryStateChange((s) => states.push(s.phase));

    const result = makeResult();
    await bridge.submitResult(result);
    expect(bridge.lastResult).toBe(result);
    expect(states).toEqual(['idle', 'acknowledged']);
    info.mockRestore();
    bridge.dispose();
  });

  it('错误只记录在本地', () => {
    const bridge = new StandaloneHostBridge({ knownSkillIds: knownSkillIds() });
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    bridge.reportError({ code: 'internal', message: 'boom' });
    expect(bridge.lastError).toMatchObject({ code: 'internal' });
    err.mockRestore();
    bridge.dispose();
  });
});
