import { expect, test, type Page } from '@playwright/test';

const KEY = 'battle.skipCastConfirm';
const PLAYER_KEY = 'gems.player.preferences.v1';
const ARTIFACT_DIR = 'artifacts/ux-phase-b/settings-preferences';

async function freshSettings(page: Page): Promise<void> {
  await page.goto('/game.html#settings');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.settings-preferences-panel')).toBeVisible({ timeout: 15_000 });
}

test('设置页可全局开启并关闭快速释放', async ({ page }) => {
  await page.goto('/game.html#settings');
  await page.evaluate((key) => localStorage.removeItem(key), KEY);
  await page.reload();

  const toggle = page.locator('#skipCastConfirm');
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  await expect(toggle).not.toBeChecked();
  await expect(page.getByRole('checkbox', { name: '快速释放' })).toBeVisible();
  const row = page.locator('label[for="skipCastConfirm"], .check-row').filter({ has: toggle });
  await expect(row).toContainText('快速释放');
  await expect(row).toContainText('点击法力值已满的角色直接释放技能');

  await toggle.check();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), KEY)).toBe('1');
  await page.reload();
  await expect(page.locator('#skipCastConfirm')).toBeChecked();

  await page.locator('#skipCastConfirm').uncheck();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), KEY)).toBe('0');
  await page.reload();
  await expect(page.locator('#skipCastConfirm')).not.toBeChecked();
});

test('玩家音效与减弱动效偏好持久化，并被宝箱音效和翻牌演出消费', async ({ page }) => {
  await page.addInitScript(() => {
    const playedVolumes: number[] = [];
    Object.defineProperty(window, '__playedVolumes', { configurable: true, value: playedVolumes });
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value(this: HTMLMediaElement) {
        // The music channel is independent; this assertion observes chest SFX only.
        if (!this.src.includes('/assets/audio/bgm/')) playedVolumes.push(this.volume);
        return Promise.resolve();
      },
    });
  });
  await freshSettings(page);

  const soundToggle = page.locator('#soundEffectsEnabled');
  const volume = page.locator('#soundEffectsVolume');
  const motion = page.locator('#reducedMotion');
  await expect(soundToggle).toBeChecked();
  await expect(volume).toHaveValue('70');
  // 只做了简体中文，不再展示无意义的界面语言选择
  await expect(page.locator('.language-select')).toHaveCount(0);

  await soundToggle.uncheck();
  await motion.check();
  await expect(volume).toBeDisabled();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), PLAYER_KEY)).toMatchObject({
    soundEffectsEnabled: false,
    reducedMotion: true,
  });
  await expect(page.locator('html')).toHaveAttribute('data-motion', 'reduced');
  expect(await page.locator('#soundEffectsEnabled').evaluate((element) =>
    getComputedStyle(element).transitionDuration,
  )).toBe('0s');

  await page.goto('/game.html#chests/keys');
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.currencies.goldKeys = 5;
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  });
  await page.reload();
  await page.locator('[data-open="gold-1"]').click();
  await expect(page.locator('.summon-card.is-dealt')).toBeVisible({ timeout: 700 });
  expect(await page.evaluate(() => (window as unknown as { __playedVolumes: number[] }).__playedVolumes)).toEqual([]);

  await page.goto('/game.html#settings');
  await soundToggle.check();
  await volume.fill('35');
  await volume.dispatchEvent('change');
  await expect(page.locator('#soundEffectsVolumeValue')).toHaveText('35%');
  await page.reload();
  await expect(volume).toHaveValue('35');
  await expect(motion).toBeChecked();
  await page.locator('.settings-dev-options summary').click();
  await expect(page.locator('#battleDebug')).toBeVisible();

  await page.goto('/game.html#chests/keys');
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.currencies.goldKeys = 5;
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  });
  await page.reload();
  await page.locator('[data-open="gold-1"]').click();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { __playedVolumes: number[] }).__playedVolumes.at(-1),
  )).toBeCloseTo(0.8 * 0.35);
});

for (const viewport of [
  { width: 1600, height: 900, label: 'desktop' },
  { width: 768, height: 1024, label: 'tablet' },
  { width: 390, height: 844, label: 'mobile' },
]) {
  test(`设置页在 ${viewport.label} 下优先呈现玩家设置且无面板内滚动`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await freshSettings(page);
    const geometry = await page.evaluate(() => {
      const screen = document.querySelector<HTMLElement>('.settings-screen')!;
      const preferences = document.querySelector<HTMLElement>('.settings-preferences-panel')!;
      const box = preferences.getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        screenBottom: screen.getBoundingClientRect().bottom,
        preferencesTop: box.top,
        preferencesBottom: box.bottom,
        panelScrollers: [...document.querySelectorAll<HTMLElement>('.settings-screen .panel, .settings-screen .panel-inner')]
          .filter((element) => ['auto', 'scroll'].includes(getComputedStyle(element).overflowY)).length,
        screenScrollable: screen.scrollHeight > screen.clientHeight + 1,
      };
    });

    expect(geometry.documentWidth).toBeLessThanOrEqual(viewport.width + 1);
    expect(geometry.preferencesTop).toBeGreaterThanOrEqual(0);
    expect(geometry.preferencesBottom).toBeLessThanOrEqual(geometry.screenBottom + 1);
    expect(geometry.panelScrollers).toBe(0);
    // Four independent audio channels may extend the page; keep one page scroller,
    // and ensure lower save-management actions remain reachable.
    await page.locator('#resetNew').scrollIntoViewIfNeeded();
    await expect(page.locator('#resetNew')).toBeInViewport();
    await page.locator('.settings-screen').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: `${ARTIFACT_DIR}/settings-${viewport.label}.png`, fullPage: false });
  });
}
