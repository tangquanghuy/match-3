import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const manifest = (urls: string[]) => new Response(JSON.stringify({ code: ['/game.js'], images: urls }), { headers: { 'content-type': 'application/json' } });

describe('cover priority artwork preload', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

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
