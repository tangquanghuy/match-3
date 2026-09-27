import { expect, test } from '@playwright/test';

// Vite may have an HMR timestamp on the live singleton: import that exact URL.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => performance.setResourceTimingBufferSize(5000));
});

test('ambient shuffle keeps playing through all menu routes and honors independent controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/game.html#map');
  await page.waitForSelector('#settings');
  const state = () => page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(name => name.includes('/src/audio/BackgroundMusic.ts')) ?? '/src/audio/BackgroundMusic.ts';
    const { backgroundMusic: music } = await import(path);
    const audio = music.current?.audio as HTMLAudioElement | undefined;
    return { scene: music.getScene(), voices: music.voices.length, src: audio?.src ?? '',
      time: audio?.currentTime ?? 0, paused: audio?.paused ?? true, volume: audio?.volume ?? 0,
      gain: music.current?.track.gain ?? 0, ready: audio?.readyState ?? 0 };
  });
  expect((await state()).voices).toBe(0);
  await page.mouse.click(5, 5);
  await expect.poll(async () => {
    const audio = await state();
    return !audio.paused && audio.time > 0.1 && audio.volume > 0 && audio.ready >= 2;
  }).toBe(true);
  const first = (await state()).src;
  // The next random track must differ, regardless of which of the five started first.
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(name => name.includes('/src/audio/BackgroundMusic.ts')) ?? '/src/audio/BackgroundMusic.ts';
    const { backgroundMusic: music } = await import(path);
    music.current.audio.currentTime = music.current.audio.duration - 3.2;
  });
  await expect.poll(async () => {
    const audio = await state();
    return audio.voices === 1 && audio.src !== first && !audio.paused && audio.volume > 0;
  }, { timeout: 10000 }).toBe(true);
  const playing = await state();
  for (const delay of [80, 850]) {
    for (const route of ['team', 'events', 'hero', 'shop', 'map']) {
      await page.evaluate(route => { location.hash = `#${route}`; }, route);
      await page.waitForTimeout(delay);
      const audio = await state();
      expect(audio.scene).toBe('meta');
      expect(audio.src).toBe(playing.src);
      expect(audio.time).toBeGreaterThanOrEqual(playing.time);
      expect(audio.voices).toBe(1);
      expect(audio.paused).toBe(false);
    }
  }
  await page.evaluate(() => { location.hash = '#settings'; });
  await page.waitForSelector('#musicVolume');
  await page.locator('#musicVolume').fill('25');
  await page.locator('#musicEnabled').uncheck();
  await expect.poll(async () => {
    const audio = await state(); return [audio.scene, audio.paused, audio.volume];
  }).toEqual(['meta', true, 0]);
  await page.locator('#musicEnabled').check();
  await expect.poll(async () => (await state()).volume).toBeCloseTo(0.8 * 0.25 * playing.gain, 3);
  expect((await state()).src).toBe(playing.src);
  expect(errors).toEqual([]);
});

test('all eleven finalized files can be decoded by the browser', async ({ page }) => {
  await page.goto('/game.html');
  const result = await page.evaluate(async () => {
    const path = '/src/audio/MusicCatalog.ts';
    const { MUSIC_TRACKS } = await import(path);
    const tracks = Object.values(MUSIC_TRACKS).flat() as { url: string }[];
    const context = new AudioContext();
    const results: number[] = [];
    try {
      // Serial decoding keeps memory bounded on CI and mobile-sized machines.
      for (const track of tracks) {
        const response = await fetch(track.url);
        if (!response.ok) throw new Error(`Missing audio: ${track.url}`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        results.push(buffer.duration);
      }
    } finally { await context.close(); }
    return results;
  });
  expect(result).toHaveLength(11);
  expect(result.every(duration => duration > 50 && duration < 210)).toBe(true);
});

test('live battle keeps its theme, ducks narration/settings/result and restores the ambient scene', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForFunction(() => {
    const app = (window as unknown as { __app?: { startupPlaying: boolean } }).__app;
    return app && !app.startupPlaying && document.querySelector('.battle-settings-button');
  });
  await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  await expect.poll(async () => page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(name => name.includes('/src/audio/BackgroundMusic.ts')) ?? '/src/audio/BackgroundMusic.ts';
    const { backgroundMusic: music } = await import(path);
    return music.ducks.has('settings') && music.current?.audio.currentTime > 0;
  })).toBe(true);
  const scene = await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(name => name.includes('/src/audio/BackgroundMusic.ts')) ?? '/src/audio/BackgroundMusic.ts';
    const { backgroundMusic: music } = await import(path);
    music.setAmbientScene('meta');
    return music.getScene();
  });
  expect(['battle', 'elite', 'boss']).toContain(scene);
  // Exercise the real NarrationAudio onSpeaking -> music duck callback.
  await page.evaluate(async () => {
    const catalogPath = '/src/render/NarrationCatalog.ts';
    const catalog = await import(catalogPath);
    const app = (window as unknown as { __app: { audio: { playNarration(clip: unknown, interrupt: boolean): boolean } } }).__app;
    const clips = Object.values(catalog.NARRATION_CLIPS ?? {});
    const clip = clips[0];
    if (!clip) throw new Error('Narration fixture missing');
    app.audio.playNarration(clip, true);
  });
  await expect.poll(async () => page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(name => name.includes('/src/audio/BackgroundMusic.ts')) ?? '/src/audio/BackgroundMusic.ts';
    const { backgroundMusic: music } = await import(path);
    return music.ducks.has('narration');
  }), { timeout: 10000 }).toBe(true);
  await page.getByRole('button', { name: '放弃本局' }).click();
  await page.getByRole('button', { name: '确认放弃' }).click();
  await expect(page.locator('.gop-title')).toHaveText('已放弃');
  expect(await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(name => name.includes('/src/audio/BackgroundMusic.ts')) ?? '/src/audio/BackgroundMusic.ts';
    const { backgroundMusic: music } = await import(path);
    return [music.getScene(), music.ducks.has('result')];
  })).toEqual([scene, true]);
  await page.evaluate(() => {
    (window as unknown as { __app: { destroy(): void } }).__app.destroy();
  });
  await expect.poll(async () => page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(name => name.includes('/src/audio/BackgroundMusic.ts')) ?? '/src/audio/BackgroundMusic.ts';
    const { backgroundMusic: music } = await import(path);
    return [music.getScene(), music.ducks.has('result'), music.current?.audio.paused];
  })).toEqual([scene, true, true]);
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(name => name.includes('/src/audio/BackgroundMusic.ts')) ?? '/src/audio/BackgroundMusic.ts';
    const { backgroundMusic: music } = await import(path);
    music.finishResult();
  });
  await expect.poll(async () => page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(name => name.includes('/src/audio/BackgroundMusic.ts')) ?? '/src/audio/BackgroundMusic.ts';
    const { backgroundMusic: music } = await import(path);
    return [music.getScene(), music.ducks.has('result')];
  })).toEqual(['meta', false]);
});

test('tab suspension, scene round trips and browser back all retain the current track position', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/game.html#map');
  await page.waitForSelector('#settings');
  await page.mouse.click(5, 5);
  const state = () => page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(name => name.includes('/src/audio/BackgroundMusic.ts')) ?? '/src/audio/BackgroundMusic.ts';
    const { backgroundMusic: music } = await import(path);
    const audio = music.current?.audio as HTMLAudioElement | undefined;
    return { scene: music.getScene(), time: audio?.currentTime ?? 0, paused: audio?.paused ?? true,
      src: audio?.src ?? '', ready: audio?.readyState ?? 0 };
  });
  await expect.poll(async () => (await state()).ready).toBeGreaterThanOrEqual(2);
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(name => name.includes('/src/audio/BackgroundMusic.ts')) ?? '/src/audio/BackgroundMusic.ts';
    const { backgroundMusic: music } = await import(path);
    music.current.audio.currentTime = 41;
  });
  await expect.poll(async () => (await state()).time).toBeGreaterThanOrEqual(41);
  const source = (await state()).src;

  // A browser can discard the media position while suspended. Explicitly simulate
  // that reset on a real HTMLAudioElement and exercise production lifecycle handlers.
  await page.evaluate(async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
    const path = performance.getEntriesByType('resource').map(entry => entry.name)
      .find(name => name.includes('/src/audio/BackgroundMusic.ts')) ?? '/src/audio/BackgroundMusic.ts';
    const { backgroundMusic: music } = await import(path);
    music.current.audio.currentTime = 0;
  });
  expect((await state()).paused).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await state()).time).toBeGreaterThanOrEqual(41);
  await expect.poll(async () => (await state()).paused).toBe(false);
  expect((await state()).src).toBe(source);

  await page.evaluate(() => { location.hash = '#team'; });
  await expect.poll(async () => (await state()).scene).toBe('meta');
  await page.evaluate(() => { location.hash = '#map'; });
  await expect.poll(async () => {
    const result = await state();
    return result.scene === 'meta' && result.src === source && result.time >= 41 && !result.paused;
  }).toBe(true);

  // Actual cross-document navigation/back: unlike a hash route this recreates JS.
  const beforeNavigation = (await state()).time;
  await page.route('**/bgm-test-away.html', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Other page</title><p>Other page</p>',
  }));
  await page.goto('/bgm-test-away.html');
  await page.goBack();
  await page.waitForSelector('#settings');
  await page.mouse.click(5, 5);
  await expect.poll(async () => {
    const result = await state();
    return result.src === source && result.time >= beforeNavigation - 0.25 && !result.paused;
  }, { timeout: 10000 }).toBe(true);
});
