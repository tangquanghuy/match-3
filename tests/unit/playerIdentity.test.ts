import { describe, expect, it, vi } from 'vitest';
import { PlayerIdentity } from '../../worker/src/playerIdentity';

function fixture(initial?: string) {
  const storage = { read: vi.fn(async () => initial), write: vi.fn(async (_id: string) => {}) };
  return { storage, identity: new PlayerIdentity(storage) };
}
describe('durable player identity write suppression', () => {
  it('reads existing identity once and never rewrites it, including alarm-first cold starts', async () => {
    const { storage, identity } = fixture('player');
    await identity.bind();
    await Promise.all(Array.from({ length: 10 }, () => identity.bind('player')));
    expect(identity.value).toBe('player');
    expect(storage.read).toHaveBeenCalledTimes(1);
    expect(storage.write).not.toHaveBeenCalled();
  });
  it('serializes alarm/command/concurrent initial binds into one durable write', async () => {
    const { storage, identity } = fixture();
    await Promise.all([identity.bind(), identity.bind('player'), identity.bind('player')]);
    expect(identity.value).toBe('player');
    expect(storage.read).toHaveBeenCalledTimes(1);
    expect(storage.write).toHaveBeenCalledTimes(1);
    expect(storage.write).toHaveBeenCalledWith('player');
  });
  it('does not expose an identity before its write completes', async () => {
    const { storage, identity } = fixture();
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    storage.write.mockImplementationOnce(() => pending);
    const bound = identity.bind('player');
    await vi.waitFor(() => expect(storage.write).toHaveBeenCalledTimes(1));
    expect(identity.value).toBeNull();
    finish(); await bound;
    expect(identity.value).toBe('player');
  });
  it('retries a failed identity write rather than trusting an unpersisted value', async () => {
    const { storage, identity } = fixture();
    storage.write.mockRejectedValueOnce(new Error('disk offline'));
    await expect(identity.bind('player')).rejects.toThrow('disk offline');
    expect(identity.value).toBeNull();
    await identity.bind('player');
    expect(identity.value).toBe('player');
    expect(storage.write).toHaveBeenCalledTimes(2);
  });
  it('retries failed reads and rejects conflicting identities without overwriting storage', async () => {
    const { storage, identity } = fixture('player');
    storage.read.mockRejectedValueOnce(new Error('read offline'));
    await expect(identity.bind('player')).rejects.toThrow('read offline');
    await expect(identity.bind('other')).rejects.toThrow('identity mismatch');
    await identity.bind('player');
    expect(storage.read).toHaveBeenCalledTimes(2);
    expect(storage.write).not.toHaveBeenCalled();
    expect(identity.value).toBe('player');
  });
});
