import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const manifest = (urls: string[]) => new Response(JSON.stringify({ code: ['/game.js'], images: urls }), { headers: { 'content-type': 'application/json' } });

describe('cover priority artwork preload', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.useRealTimers(); });

  it('starts artwork before the manifest resolves and shares repeated calls', async () => {
    let resolveManifest!: (r: Response) => void;
    const pending = new Promise<Response>(resolve => { resolveManifest = resolve; });
    const fetcher = vi.fn((url: string) => url.includes('preload-manifest') ? pending : Promise.resolve(new Response('image')));
    vi.stubGlobal('fetch', fetcher);
    const { startPreload, onPreloadProgress } = await import('../../src/cover/preload');
    const updates: number[] = [];
    const unsubscribe = onPreloadProgress(p => updates.push(p.done));
    const task = startPreload();
    expect(startPreload()).toBe(task);
    const images = fetcher.mock.calls.map(([url]) => url).filter(url => !url.includes('preload-manifest'));
    expect(images).toHaveLength(6);
    expect(images.some(url => url.includes('frame.webp'))).toBe(true);
    expect(images.some(url => url.includes('guide.webp'))).toBe(true);
    expect(images.some(url => url.includes('battle-loading.webp'))).toBe(true);
    for (const gender of ['male', 'female', 'unknown']) expect(images).toContain(`/static/hero/character-${gender}.webp`);
    resolveManifest(manifest([...images, '/extra.webp', '/extra.webp']));
    expect(await task).toEqual({ done: 8, total: 8, failed: 0 });
    for (const image of images) expect(fetcher.mock.calls.filter(([url]) => url === image)).toHaveLength(1);
    expect(updates.at(-1)).toBe(8);
    unsubscribe();
  });

  it('still warms tutorial and character assets when no manifest exists', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(new Response('', { status: url.includes('preload-manifest') ? 404 : 200 }))));
    const { startPreload } = await import('../../src/cover/preload');
    expect(await startPreload()).toEqual({ done: 6, total: 6, failed: 0 });
  });

  it('reports failed artwork so entry stays blocked', async () => {
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('preload-manifest')) return Promise.resolve(new Response('', { status: 404 }));
      if (url.includes('guide.webp')) return Promise.reject(new Error('image failed'));
      return Promise.resolve(new Response('image'));
    }));
    const { startPreload } = await import('../../src/cover/preload');
    expect(await startPreload()).toEqual({ done: 6, total: 6, failed: 1 });
  });
  it('blocks production entry for a missing or invalid manifest', async () => {
    vi.stubEnv('DEV', false);
    vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(new Response('', { status: url.includes('preload-manifest') ? 404 : 200 }))));
    const { startPreload } = await import('../../src/cover/preload');
    expect((await startPreload()).failed).toBe(1);
  });

  it('retries a failed preload and keeps successful runs memoized', async () => {
    let broken = true;
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('preload-manifest')) return Promise.resolve(manifest([]));
      return Promise.resolve(new Response('asset', { status: broken && url.includes('character-male') ? 503 : 200 }));
    }));
    const { startPreload, retryPreload } = await import('../../src/cover/preload');
    expect((await startPreload()).failed).toBe(1);
    broken = false;
    const retry = retryPreload();
    expect(startPreload()).toBe(retry);
    expect(await retry).toEqual({ done: 7, total: 7, failed: 0 });
    expect(retryPreload()).toBe(retry);
  });

});

describe('cover bounded download concurrency', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('starts with 12 slots, grows to 18 on fast completions and counts complete response bodies', async () => {
    const urls = Array.from({ length: 40 }, (_, i) => `/asset-${i}.webp`);
    const releases: Array<() => void> = [];
    let active = 0;
    let peak = 0;
    const fetcher = vi.fn((url: string) => {
      if (url.includes('preload-manifest')) return Promise.resolve(manifest(urls));
      active++;
      peak = Math.max(peak, active);
      let released = false;
      const body = new Promise<ArrayBuffer>(resolve => releases.push(() => {
        if (released) return;
        released = true;
        active--;
        resolve(new ArrayBuffer(1));
      }));
      const response = new Response('asset');
      vi.spyOn(response, 'arrayBuffer').mockImplementation(() => body);
      return Promise.resolve(response);
    });
    vi.stubGlobal('fetch', fetcher);
    const { startPreload, retryPreload, onPreloadProgress } = await import('../../src/cover/preload');
    let done = 0;
    const unsubscribe = onPreloadProgress(progress => { done = progress.done; });
    const task = startPreload();
    let finished = false;
    void task.then(() => { finished = true; });
    try {
      await vi.waitFor(() => expect(releases).toHaveLength(12));
      expect(active).toBe(12);
      expect(done).toBe(0); // Headers alone do not count as a completed download.
      expect(startPreload()).toBe(task);
      expect(retryPreload()).toBe(task);
      // A non-priority download finishes first; its slot is immediately reused.
      releases[6]!();
      await vi.waitFor(() => expect(releases).toHaveLength(14));
      expect(done).toBe(1);
      expect(active).toBe(13);
      expect(finished).toBe(false);
      // Five more fast completions grow the bounded pool to its maximum.
      releases.slice(7, 12).forEach(release => release());
      await vi.waitFor(() => expect(releases).toHaveLength(24));
      expect(active).toBe(18);
      for (const count of [42, 47]) {
        releases.forEach(release => release());
        await vi.waitFor(() => expect(releases).toHaveLength(count));
      }
      expect(finished).toBe(false);
      releases.forEach(release => release());
      expect(await task).toEqual({ done: 47, total: 47, failed: 0 });
      expect(active).toBe(0);
      expect(peak).toBe(18);
      expect(new Set(fetcher.mock.calls.map(([url]) => url)).size).toBe(48);
    } finally {
      unsubscribe();
      // Release subsequent waves even when the concurrency assertion fails.
      for (let i = 0; i < 60; i++) {
        releases.forEach(release => release());
        await Promise.resolve();
      }
    }
  });

  it('a timed-out body releases its slot and every remaining resource is still checked', async () => {
    vi.useFakeTimers();
    const urls = Array.from({ length: 40 }, (_, i) => `/asset-${i}.webp`);
    let aborted = false;
    const fetcher = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes('preload-manifest')) return Promise.resolve(manifest(urls));
      if (url === '/asset-0.webp') {
        const response = new Response('asset');
        vi.spyOn(response, 'arrayBuffer').mockImplementation(() => new Promise<ArrayBuffer>((_, reject) => {
          init!.signal!.addEventListener('abort', () => {
            aborted = true;
            reject(new Error('download timed out'));
          }, { once: true });
        }));
        return Promise.resolve(response);
      }
      return Promise.resolve(new Response('asset', { status: url === '/asset-1.webp' ? 503 : 200 }));
    });
    vi.stubGlobal('fetch', fetcher);
    const { startPreload } = await import('../../src/cover/preload');
    const task = startPreload();
    await vi.advanceTimersByTimeAsync(40_002);
    expect(await task).toEqual({ done: 47, total: 47, failed: 2 });
    expect(aborted).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(50);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('backs off to six after a slow completion without aborting existing downloads or growing again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    const releases: Array<() => void> = [];
    let active = 0;
    let peak = 0;
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('preload-manifest')) return Promise.resolve(manifest(Array.from({ length: 20 }, (_, i) => `/asset-${i}.webp`)));
      active++;
      peak = Math.max(peak, active);
      let released = false;
      const body = new Promise<ArrayBuffer>(resolve => releases.push(() => {
        if (released) return;
        released = true;
        active--;
        resolve(new ArrayBuffer(1));
      }));
      const response = new Response('asset');
      vi.spyOn(response, 'arrayBuffer').mockImplementation(() => body);
      return Promise.resolve(response);
    }));
    const { startPreload } = await import('../../src/cover/preload');
    const task = startPreload();
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(releases).toHaveLength(12);
      await vi.advanceTimersByTimeAsync(8_001);
      releases[6]!();
      await vi.advanceTimersByTimeAsync(0);
      expect(active).toBe(11);
      expect(releases).toHaveLength(12);
      releases.slice(7, 12).forEach(release => release());
      await vi.advanceTimersByTimeAsync(0);
      expect(active).toBe(6);
      expect(releases).toHaveLength(12);
      releases[0]!();
      await vi.advanceTimersByTimeAsync(0);
      expect(active).toBe(6);
      expect(releases).toHaveLength(13);
      for (let i = 0; i < 10; i++) {
        releases.forEach(release => release());
        await vi.advanceTimersByTimeAsync(0);
        expect(active).toBeLessThanOrEqual(6);
      }
      expect(await task).toEqual({ done: 27, total: 27, failed: 0 });
      expect(peak).toBe(12);
    } finally {
      for (let i = 0; i < 10; i++) {
        releases.forEach(release => release());
        await vi.advanceTimersByTimeAsync(0);
      }
    }
  });

  it('retries transient failures including priority images once, without retrying successful or missing assets', async () => {
    const counts = new Map<string, number>();
    const transient = ['/static/hero/character-male.webp', '/network.webp', '/rate-limit.webp'];
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      counts.set(url, (counts.get(url) ?? 0) + 1);
      if (url.includes('preload-manifest')) return Promise.resolve(manifest(['/network.webp', '/rate-limit.webp', '/missing.webp', '/ok.webp']));
      if (transient.includes(url) && counts.get(url) === 1) {
        if (url === '/network.webp') return Promise.reject(new Error('connection reset'));
        return Promise.resolve(new Response('', { status: url === '/rate-limit.webp' ? 429 : 503 }));
      }
      return Promise.resolve(new Response('asset', { status: url === '/missing.webp' ? 404 : 200 }));
    }));
    const { startPreload, onPreloadProgress } = await import('../../src/cover/preload');
    const done: number[] = [];
    const unsubscribe = onPreloadProgress(progress => {
      expect(progress.done).toBeLessThanOrEqual(progress.total);
      done.push(progress.done);
    });
    try {
      expect(await startPreload()).toEqual({ done: 11, total: 11, failed: 1 });
      expect(done).toEqual([...done].sort((a, b) => a - b));
      for (const [url, count] of counts) expect(count, url).toBe(transient.includes(url) ? 2 : 1);
    } finally { unsubscribe(); }
  });

  it('runs the single automatic retry pass at no more than six concurrent downloads', async () => {
    const counts = new Map<string, number>();
    const releases: Array<() => void> = [];
    let active = 0;
    let peak = 0;
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      if (url.includes('preload-manifest')) return Promise.resolve(manifest(Array.from({ length: 10 }, (_, i) => `/asset-${i}.webp`)));
      counts.set(url, (counts.get(url) ?? 0) + 1);
      if (counts.get(url) === 1) return Promise.resolve(new Response('', { status: 503 }));
      active++;
      peak = Math.max(peak, active);
      let released = false;
      const body = new Promise<ArrayBuffer>(resolve => releases.push(() => {
        if (released) return;
        released = true;
        active--;
        resolve(new ArrayBuffer(1));
      }));
      const response = new Response('asset');
      vi.spyOn(response, 'arrayBuffer').mockImplementation(() => body);
      return Promise.resolve(response);
    }));
    const { startPreload } = await import('../../src/cover/preload');
    const task = startPreload();
    try {
      for (const count of [6, 12, 17]) {
        await vi.waitFor(() => expect(releases).toHaveLength(count));
        expect(active).toBeLessThanOrEqual(6);
        releases.forEach(release => release());
      }
      expect(await task).toEqual({ done: 17, total: 17, failed: 0 });
      expect(peak).toBe(6);
      expect([...counts.values()]).toEqual(Array(17).fill(2));
    } finally {
      for (let i = 0; i < 60; i++) {
        releases.forEach(release => release());
        await Promise.resolve();
      }
    }
  });

});
