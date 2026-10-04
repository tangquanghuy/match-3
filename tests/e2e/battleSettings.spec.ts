import { expect, test, type Page } from '@playwright/test';
import type { App } from '../../src/render/App';
import type { AudioManager } from '../../src/render/AudioManager';
import type { EventStreamPlayer } from '../../src/render/EventStreamPlayer';
import type { BattleSession } from '../../src/session/BattleSession';
import type { BattleNarrator } from '../../src/render/BattleNarrator';

type Runtime = Omit<App, 'audio' | 'player' | 'session' | 'narrator'> & {
  audio: AudioManager; player: EventStreamPlayer; session: BattleSession; narrator: BattleNarrator;
  input: { enabled: boolean }; startupPlaying: boolean; afterResolve(): void;
  autoBattleEnabled: boolean;
  pageHidden: boolean;
  resultCount: number; voicePools: string[];
};
declare global { interface Window { __settingsTestApp?: Runtime; __setHidden?: (value: boolean) => void } }

// External font availability must not block navigation or battle startup in E2E.
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
});

async function openBattle(page: Page): Promise<void> {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const app = (window as unknown as { __app: Runtime }).__app;
    if (!app || app.startupPlaying || !document.querySelector('.battle-settings-button')) return false;
    window.__settingsTestApp = app;
    return true;
  });
}

async function nextBattle(page: Page): Promise<void> {
  // 局外连续出战会在同一页面销毁旧 App 并创建新 App。
  await page.evaluate(async () => {
    const previous = window.__settingsTestApp!;
    const request = previous.getBattleRequest();
    const BattleApp = previous.constructor as new () => Runtime;
    previous.destroy();
    const next = new BattleApp();
    await next.init(document.getElementById('app')!, request);
    window.__settingsTestApp = next;
  });
}

test('配置页自动战斗开关决定每场状态，战斗按钮同步设置', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/game.html#settings', { waitUntil: 'domcontentloaded' });
  const setting = page.getByRole('switch', { name: '自动战斗', exact: true });
  await expect(setting).not.toBeChecked();
  await setting.check();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(setting).toBeChecked();
  await setting.uncheck();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(setting).not.toBeChecked();
  await setting.check();
  await page.screenshot({ path: 'artifacts/settings-auto-battle.png', animations: 'disabled' });
  await openBattle(page);
  const auto = page.getByTestId('battle-auto-button');
  await expect(auto).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  await page.getByRole('button', { name: '放弃本局' }).click();
  await page.getByRole('button', { name: '确认放弃' }).click();
  await expect(auto).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => localStorage.getItem('battle.autoBattle'))).toBe('1');
  await nextBattle(page);
  await expect(auto).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => window.__settingsTestApp!.autoBattleEnabled)).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__settingsTestApp!.getEngine().getState().actionLog.length)).toBeGreaterThan(0);
  await auto.click();
  await expect(auto).toHaveAttribute('aria-pressed', 'false');
  await nextBattle(page);
  await expect(auto).toHaveAttribute('aria-pressed', 'false');
  await page.evaluate(() => window.__settingsTestApp!.destroy());
  await page.goto('/game.html#settings', { waitUntil: 'domcontentloaded' });
  await expect(setting).not.toBeChecked();
});

test('battle audio controls persist independently; cancellation preserves the match; surrender settles once', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await openBattle(page);
  await page.evaluate(() => {
    const app = window.__settingsTestApp!;
    app.resultCount = 0; app.voicePools = [];
    app.onBattleFinished = () => { app.resultCount++; };
    const play = app.audio.playNarration.bind(app.audio);
    app.audio.playNarration = (clip, interrupt) => { app.voicePools.push(clip.pool); return play(clip, interrupt); };
    app.getEngine().getState().economy.gold = 100;
  });
  await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('#masterVolume').fill('50');
  await dialog.locator('#musicVolume').fill('30');
  await dialog.locator('#soundEffectsEnabled').uncheck();
  await dialog.locator('#narrationVolume').fill('85');
  await expect(dialog.locator('#soundEffectsVolume')).toBeDisabled();
  await expect(dialog.locator('#narrationVolume')).toBeEnabled();
  await expect.poll(() => page.evaluate(() => {
    const audio = window.__settingsTestApp!.audio as unknown as { master: GainNode; sfxBus: GainNode; narrationBus: GainNode };
    return [audio.master?.gain.value, audio.sfxBus?.gain.value, Number(audio.narrationBus?.gain.value.toFixed(2))];
  })).toEqual([0.5, 0, 0.85]);
  await dialog.getByRole('button', { name: '放弃本局' }).click();
  await expect(dialog.getByRole('button', { name: '继续战斗' })).toBeFocused();
  await dialog.getByRole('button', { name: '继续战斗' }).click();
  expect(await page.evaluate(() => window.__settingsTestApp!.exportResult())).toBeNull();
  expect(await page.evaluate(() => window.__settingsTestApp!.input.enabled)).toBe(true);
  await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  await dialog.getByRole('button', { name: '放弃本局' }).click();
  await dialog.getByRole('button', { name: '确认放弃' }).click();
  await expect(page.locator('.gop-title')).toHaveText('已放弃');
  const result = await page.evaluate(() => ({ result: window.__settingsTestApp!.exportResult(),
    count: window.__settingsTestApp!.resultCount, pools: window.__settingsTestApp!.voicePools,
    more: window.__settingsTestApp!.session.surrender() }));
  expect(result.result).toMatchObject({ winner: 'enemy', endReason: 'surrender', economy: { gold: 0, souls: 0, gems: 0 } });
  expect(result.result!.defeatedExternalIds).toEqual([]);
  expect(result.count).toBe(1);
  expect(result.more).toEqual([]);
  expect(result.pools.some(p => p.startsWith('retreat.'))).toBe(true);
  expect(result.pools.some(p => p.startsWith('defeat.'))).toBe(false);
  await page.goto('/game.html#settings');
  await expect(page.locator('#masterVolume')).toHaveValue('50');
  await expect(page.locator('#musicVolume')).toHaveValue('30');
  await expect(page.locator('#narrationVolume')).toHaveValue('85');
  await expect(page.locator('#soundEffectsEnabled')).not.toBeChecked();
  await page.reload();
  await expect(page.locator('#masterVolume')).toHaveValue('50');
  expect(errors).toEqual([]);
});

test('opening settings holds queued enemy actions and abandonment cancels the queue', async ({ page }) => {
  await openBattle(page);
  await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  const before = await page.evaluate(() => {
    const app = window.__settingsTestApp!;
    const state = app.getEngine().getState();
    state.activePlayer = 'Right' as typeof state.activePlayer;
    app.afterResolve();
    return state.actionLog.length;
  });
  await page.waitForTimeout(1900);
  expect(await page.evaluate(() => window.__settingsTestApp!.getEngine().getState().actionLog.length)).toBe(before);
  await page.getByRole('button', { name: '放弃本局' }).click();
  await page.getByRole('button', { name: '确认放弃' }).click();
  await expect(page.locator('.gop-title')).toHaveText('已放弃');
  await page.waitForTimeout(1300);
  expect(await page.evaluate(() => window.__settingsTestApp!.getEngine().getState().actionLog.length)).toBe(before);
  await page.evaluate(() => window.__settingsTestApp!.destroy());
  await expect(page.getByRole('button', { name: '战斗设置' })).toHaveCount(0);
  await expect(page.locator('dialog.battle-settings')).toHaveCount(0);
});

test('settings pauses a pending timeline, resumes without overlap, and cancel releases its promise', async ({ page }) => {
  await openBattle(page);
  await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  await page.evaluate(() => {
    const app = window.__settingsTestApp!;
    const state = app.getEngine().getState();
    const victim = state.teams.Right.characters[0];
    app.player.onNarrationBatch = null;
    void app.player.play([{ type: 'skill-damage', casterId: state.teams.Left.characters[0].id,
      targetId: victim.id, range: 'single', damage: 0, resultingHp: victim.hp, resultingArmor: victim.armor }]);
  });
  expect(await page.evaluate(() => window.__settingsTestApp!.player.isPlaying())).toBe(true);
  await page.getByRole('button', { name: '返回战斗' }).click();
  expect(await page.evaluate(() => window.__settingsTestApp!.input.enabled)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.__settingsTestApp!.player.isPlaying())).toBe(false);
  await page.evaluate(() => window.__settingsTestApp!.afterResolve());
  await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  await page.evaluate(() => {
    const app = window.__settingsTestApp!;
    // A paused non-empty timeline must release an awaiting caller on cancellation.
    const state = app.getEngine().getState();
    const pending = app.player.play([{ type: 'game-over', winner: state.activePlayer }]);
    app.player.cancel();
    return pending;
  });
  expect(await page.evaluate(() => window.__settingsTestApp!.exportResult())).toBeNull();
});

test('mobile landscape settings and confirmation stay within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await openBattle(page);
  await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'artifacts/settings/battle-settings-mobile.png' });
  await dialog.getByRole('button', { name: '放弃本局' }).click();
  await expect(dialog.getByRole('button', { name: '继续战斗' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('heading')).toHaveText('战斗设置');
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: '战斗设置', exact: true })).toBeFocused();
});

test('closing settings resumes queued AI; a natural result takes precedence over surrender', async ({ page }) => {
  await openBattle(page);
  await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  const before = await page.evaluate(() => {
    const app = window.__settingsTestApp!;
    const state = app.getEngine().getState();
    state.activePlayer = 'Right' as typeof state.activePlayer;
    app.afterResolve();
    return state.actionLog.length;
  });
  await page.getByRole('button', { name: '返回战斗' }).click();
  await expect.poll(() => page.evaluate(() => window.__settingsTestApp!.getEngine().getState().actionLog.length)).toBeGreaterThan(before);
  // Model the boundary after synchronous engine resolution but before the result animation.
  await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  await page.evaluate(() => {
    const state = window.__settingsTestApp!.getEngine().getState();
    state.winner = 'Left' as typeof state.winner;
    state.state = 'GameOver' as typeof state.state;
  });
  // Reopening refreshes button availability; confirmation also rechecks engine state.
  await page.getByRole('button', { name: '返回战斗' }).click();
  await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  await expect(page.getByRole('button', { name: '放弃本局' })).toBeDisabled();
  expect(await page.evaluate(() => window.__settingsTestApp!.session.surrender())).toEqual([]);
  expect(await page.evaluate(() => window.__settingsTestApp!.exportResult()?.winner)).toBe('player');
});

test('meta battle surrender returns through settlement without advancing quest progress', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const kingdom = '破碎尖塔';
  await page.goto(`/game.html#quest/${encodeURIComponent(kingdom)}`);
  await expect(page.locator('.quest-map')).toBeVisible();
  await page.evaluate(kingdom => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.kingdoms[kingdom].questsDone = 0;
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  }, kingdom);
  await page.reload();
  await page.locator('#questFight').click();
  await expect(page.locator('#battle-root .battle-settings-button')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  await page.getByRole('button', { name: '放弃本局' }).click();
  await page.getByRole('button', { name: '确认放弃' }).click();
  // 局外战斗不再弹“继续”面板，暗场过渡后直接进结算页
  await expect(page.locator('.result-screen')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#battle-root')).toBeHidden();
  await expect(page.locator('.gop-title')).toBeHidden();
  expect(await page.evaluate(kingdom => JSON.parse(localStorage.getItem('gems.meta.save')!).kingdoms[kingdom].questsDone, kingdom)).toBe(0);
  await expect(page.locator('.battle-settings-button')).toHaveCount(0);
  await page.waitForTimeout(1000);
  expect(errors).toEqual([]);
});


test('hidden tab stays paused by default, background setting lets auto battle advance', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    (window as unknown as { __setHidden: (value: boolean) => void }).__setHidden = value => {
      hidden = value;
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });
  await page.goto('/game.html#settings', { waitUntil: 'domcontentloaded' });
  const background = page.getByRole('switch', { name: '后台运行', exact: true });
  await expect(background).not.toBeChecked();
  await background.check();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(background).toBeChecked();
  await background.uncheck();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(background).not.toBeChecked();
  await openBattle(page);
  await page.evaluate(() => window.__setHidden?.(true));
  // AI handoff must wait until the page becomes visible in the default mode.
  const defaultWait = await page.evaluate(async () => {
    const app = window.__settingsTestApp! as Runtime & { waitForBattleReady(): Promise<boolean> };
    return Promise.race([app.waitForBattleReady().then(() => 'ready'), new Promise<string>(r => setTimeout(() => r('paused'), 400))]);
  });
  expect(defaultWait).toBe('paused');
  await page.evaluate(() => window.__setHidden?.(false));
  await page.goto('/game.html#settings', { waitUntil: 'domcontentloaded' });
  await background.check();
  await page.getByRole('switch', { name: '自动战斗', exact: true }).check();
  await openBattle(page);
  const before = await page.evaluate(() => window.__settingsTestApp!.getEngine().getState().actionLog.length);
  await page.evaluate(() => window.__setHidden?.(true));
  await expect.poll(() => page.evaluate(() => window.__settingsTestApp!.getEngine().getState().actionLog.length),
    { timeout: 25_000 }).toBeGreaterThan(before);
  await page.evaluate(() => window.__setHidden?.(false));
  await expect.poll(() => page.evaluate(() => window.__settingsTestApp!.pageHidden)).toBe(false);
});
