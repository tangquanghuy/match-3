import { expect, test, type Page } from '@playwright/test';
import type { AudioManager } from '../../src/render/AudioManager';
import type { App } from '../../src/render/App';

type AudioRuntime = Omit<AudioManager, 'ctx' | 'narration'> & { ctx: AudioContext; narration: { source: AudioBufferSourceNode | null } };
declare global {
  interface Window { __captionAudio: AudioManager; __captionClipId: string; __victoryApp: App; __captionContext: AudioContext }
}
const caption = (page: Page) => page.locator('.narration-subtitles');

// External font availability must not block navigation or battle startup in E2E.
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
});

async function start(page: Page): Promise<void> {
  await page.goto('/index.html');
  await page.waitForFunction(() => {
    const app = (window as unknown as { __app: Omit<App, 'startupPlaying'> & { startupPlaying: boolean } }).__app;
    return !!app && !app.startupPlaying && document.querySelectorAll('.gcard').length === 8;
  });
  await page.mouse.click(5, 5);
  await page.evaluate(() => {
    window.__captionAudio = (window as unknown as { __app: { audio: AudioManager } }).__app.audio;
  });
  await page.waitForFunction(() => (window.__captionAudio as unknown as AudioRuntime).ctx?.state === 'running');
}

async function play(page: Page, pool: string, take = 0): Promise<string> {
  return page.evaluate(async ({ pool, take }) => {
    const path = '/src/render/NarrationCatalog.ts';
    const { NARRATION_CLIPS } = await import(/* @vite-ignore */ path) as typeof import('../../src/render/NarrationCatalog');
    const clip = NARRATION_CLIPS.filter(c => c.pool === pool)[take];
    window.__captionClipId = clip.id;
    if (!window.__captionAudio.playNarration(clip, true)) throw new Error('Narration not accepted');
    return clip.subtitleZh!;
  }, { pool, take });
}

test('new encouragement has Chinese captions only while real audio is speaking', async ({ page }) => {
  await start(page);
  await expect(caption(page)).toHaveCount(0);
  const text = await play(page, 'encourage.ally');
  await expect(caption(page)).toHaveText(text);
  await expect(caption(page)).toHaveText('继续猛攻！将他们，赶尽杀绝！');
  expect(await caption(page).evaluate(el => getComputedStyle(el).pointerEvents)).toBe('none');
  await page.screenshot({ path: 'artifacts/narrator/subtitles-battle-desktop.png' });
  await expect(caption(page)).toHaveCount(0, { timeout: 12_000 });
  expect(await page.evaluate(() => window.__captionAudio.isNarrationBusy())).toBe(false);
});

test('interruption replaces the line; muting narration clears it without waiting for duration', async ({ page }) => {
  await start(page);
  await play(page, 'encourage.ally');
  await expect(caption(page)).toBeVisible();
  const second = await play(page, 'encourage.ally', 1);
  await expect(caption(page)).toHaveCount(1);
  await expect(caption(page)).toHaveText(second);
  await page.evaluate(async () => {
    const path = '/src/preferences/playerPreferences.ts';
    const { setPlayerPreferences } = await import(/* @vite-ignore */ path);
    setPlayerPreferences({ narrationEnabled: false });
  });
  await expect(caption(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__captionAudio.isNarrationBusy())).toBe(false);
});

test('a failed audio request never creates a phantom subtitle', async ({ page }) => {
  await start(page);
  await page.route('**/encourage_ally_202609282006_03.mp3*', route => route.abort());
  await play(page, 'encourage.ally', 2);
  await expect.poll(() => page.evaluate(() => window.__captionAudio.isNarrationBusy())).toBe(false);
  await expect(caption(page)).toHaveCount(0);
});

test('victory voice and caption survive actual App destruction until natural audio completion', async ({ page }) => {
  test.setTimeout(35_000);
  await start(page);
  await page.evaluate(() => {
    window.__victoryApp = (window as unknown as { __app: App }).__app;
    window.__captionContext = (window.__captionAudio as unknown as AudioRuntime).ctx;
    void window.__victoryApp.debugEndBattle(true);
  });
  await expect(caption(page)).toHaveAttribute('data-clip-id', /^victory_/, { timeout: 15_000 });
  const text = await caption(page).textContent();
  const survived = await page.evaluate(() => {
    const audio = window.__captionAudio as unknown as AudioRuntime;
    const source = audio.narration.source;
    window.__victoryApp.destroy();
    document.querySelector('#app')!.innerHTML = '<main class="result-screen" style="color:white">战斗结算</main>';
    return source === audio.narration.source && audio.ctx.state === 'running';
  });
  expect(survived).toBe(true);
  await expect(caption(page)).toHaveText(text!);
  await expect(caption(page)).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => window.__captionContext.state)).toBe('closed');
});

test('subtitle ownership, fullscreen hosting and mobile wrapping survive view replacement', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/game.html#result');
  await expect(page.locator('.result-screen')).toBeVisible();
  await page.evaluate(async () => {
    const path = '/src/render/NarrationSubtitles.ts';
    const { narrationSubtitles: captions } = await import(/* @vite-ignore */ path);
    const first = {}, second = {};
    const clip = { id: 'old', subtitleZh: '旧字幕' };
    captions.show(first, clip);
    captions.show(second, { id: 'new', subtitleZh: '代价惨重的撤退。你们保住了剩下的。记住那些未能保住的。' });
    captions.hide(first);
    document.querySelector('#stage')!.setAttribute('data-replaced', 'true');
  });
  await expect(caption(page)).toHaveAttribute('data-clip-id', 'new');
  const box = await caption(page).boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(12);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390 - 12);
  expect(box!.height).toBeLessThan(120);
  const nav = await page.locator('.bottom-bar').boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y);
  await page.screenshot({ path: 'artifacts/narrator/subtitles-result-mobile.png' });
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'subtitle-fullscreen-host';
    const button = document.createElement('button');
    button.textContent = 'Fullscreen caption test';
    button.onclick = () => { void host.requestFullscreen(); };
    host.appendChild(button); document.body.appendChild(host);
    button.style.cssText = 'position:fixed;top:0;left:0;z-index:9999';
  });
  await page.getByRole('button', { name: 'Fullscreen caption test' }).click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('subtitle-fullscreen-host');
  await expect(page.locator('#subtitle-fullscreen-host > .narration-subtitles')).toHaveCount(1);
  await page.evaluate(() => document.exitFullscreen());
  await expect(page.locator('body > .narration-subtitles')).toHaveCount(1);

});
