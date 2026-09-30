import { afterEach, describe, expect, it, vi } from 'vitest';
import { NetworkActivity, networkActivity } from '../../src/meta/gateway/networkActivity';
import { HttpTransport } from '../../src/meta/gateway/transport';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

afterEach(() => { vi.useRealTimers(); });

describe('delayed network activity', () => {
  it('does not flash for fast requests', async () => {
    vi.useFakeTimers();
    const activity = new NetworkActivity();
    const listener = vi.fn();
    activity.subscribe(listener);
    await activity.track(async () => 42);
    await vi.advanceTimersByTimeAsync(5000);
    expect(listener.mock.calls).toEqual([[false]]);
  });

  it('stays visible throughout a six second request and then clears', async () => {
    vi.useFakeTimers();
    const activity = new NetworkActivity();
    const listener = vi.fn();
    activity.subscribe(listener);
    const request = deferred<number>();
    const result = activity.track(() => request.promise);
    await vi.advanceTimersByTimeAsync(449);
    expect(listener.mock.calls).toEqual([[false]]);
    await vi.advanceTimersByTimeAsync(5551);
    expect(listener.mock.calls).toEqual([[false], [true]]);
    request.resolve(42);
    expect(await result).toBe(42);
    expect(listener.mock.calls).toEqual([[false], [true], [false]]);
  });

  it('waits for the last concurrent request, including a rejection', async () => {
    vi.useFakeTimers();
    const activity = new NetworkActivity();
    const listener = vi.fn();
    activity.subscribe(listener);
    const one = deferred<number>();
    const two = deferred<number>();
    const first = activity.track(() => one.promise);
    const second = activity.track(() => two.promise).catch(() => null);
    await vi.advanceTimersByTimeAsync(450);
    one.resolve(1);
    await first;
    expect(listener.mock.calls).toEqual([[false], [true]]);
    two.reject(new Error('offline'));
    await second;
    expect(listener.mock.calls).toEqual([[false], [true], [false]]);
  });

  it('supports late subscription and cleanup', async () => {
    vi.useFakeTimers();
    const activity = new NetworkActivity();
    const request = deferred<number>();
    const result = activity.track(() => request.promise);
    await vi.advanceTimersByTimeAsync(450);
    const listener = vi.fn();
    const unsubscribe = activity.subscribe(listener);
    expect(listener.mock.calls).toEqual([[true]]);
    unsubscribe();
    request.resolve(1);
    await result;
    expect(listener.mock.calls).toEqual([[true]]);
  });

  it('cleans up synchronous errors and permits the next request', async () => {
    vi.useFakeTimers();
    const activity = new NetworkActivity();
    const listener = vi.fn();
    activity.subscribe(listener);
    await expect(activity.track(() => { throw new Error('broken'); })).rejects.toThrow('broken');
    await activity.track(async () => true);
    await vi.advanceTimersByTimeAsync(450);
    expect(listener.mock.calls).toEqual([[false]]);
  });
});

describe('HTTP activity includes response body consumption', () => {
  it('tracks JSON until decoding has completed', async () => {
    vi.useFakeTimers();
    const body = deferred<unknown>();
    const fetcher = vi.fn(async () => ({ ok: true, json: () => body.promise } as Response));
    const listener = vi.fn();
    const unsubscribe = networkActivity.subscribe(listener);
    const result = new HttpTransport('/api/meta', fetcher).load();
    await vi.advanceTimersByTimeAsync(6000);
    expect(listener.mock.calls).toEqual([[false], [true]]);
    body.resolve({ serverNow: 1 });
    await result;
    expect(listener.mock.calls).toEqual([[false], [true], [false]]);
    unsubscribe();
  });

  it.each(['network', 'http', 'json'])('clears activity after %s failure', async kind => {
    vi.useFakeTimers();
    const pending = deferred<Response>();
    const fetcher = vi.fn(() => pending.promise);
    const listener = vi.fn();
    const unsubscribe = networkActivity.subscribe(listener);
    const result = new HttpTransport('/api/meta', fetcher).send({ type: 'claimGift', args: { id: 'starter' } }).catch(() => null);
    await vi.advanceTimersByTimeAsync(450);
    if (kind === 'network') pending.reject(new Error('offline'));
    else pending.resolve(new Response(kind === 'http' ? 'error' : 'invalid JSON', { status: kind === 'http' ? 503 : 200 }));
    await result;
    expect(listener.mock.calls).toEqual([[false], [true], [false]]);
    unsubscribe();
  });
});
