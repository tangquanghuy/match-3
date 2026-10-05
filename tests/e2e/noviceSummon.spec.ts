import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
});

async function summonFixture(page: Page, noviceSummonUsed: boolean, gems: number, tutorial = false) {
  // Prepare the save before the game mounts, so tutorial guards and pending
  // gateway writes cannot interfere with the fixture.
  await page.goto('/cover.html');
  await page.evaluate(async ({ noviceSummonUsed, gems, tutorial }) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { buildDemoSave } = await load('/src/meta/server/demo.ts');
    const save = buildDemoSave(Date.now());
    save.onboarding = { step: tutorial ? 'summon' : 'done', noviceSummonUsed };
    save.currencies.gems = gems;
    save.gachaWishlist.troopIds = [];
    save.gachaWishlist.pursuit.targetId = null;
    localStorage.clear();
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  }, { noviceSummonUsed, gems, tutorial });
  await page.goto('/game.html#chests/gems');
  await expect(page.locator('[data-open="gem-10"]')).toBeEnabled();
}

test('新手十连直接召唤，不弹愿望单提醒', async ({ page }) => {
  await summonFixture(page, false, 1000, true);
  const ten = page.locator('[data-open="gem-10"]');
  await expect(ten).toContainText('新手十连');
  await ten.click();

  // Wait for the actual summon before checking that the asynchronous reminder
  // stayed hidden; an immediate hidden assertion could otherwise pass too soon.
  await expect(page.locator('#summonModal')).toBeVisible();
  await expect(page.locator('#wishlistReminder')).toBeHidden();
  await expect(page.locator('#summonCards .summon-card')).toHaveCount(10);
  await expect(page.locator('.tut-layer')).toHaveCount(0);
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!));
  expect(save.currencies.gems).toBe(0);
  expect(save.onboarding).toEqual({ step: 'done', noviceSummonUsed: true });
  expect(save.gachaLog).toHaveLength(1);
});

for (const scenario of [
  { name: '新手十连仍可用时，单抽仍提示愿望单', noviceSummonUsed: false, button: 'gem-1' },
  { name: '新手十连已用后，普通十连仍提示愿望单', noviceSummonUsed: true, button: 'gem-10' },
]) {
  test(scenario.name, async ({ page }) => {
    await summonFixture(page, scenario.noviceSummonUsed, 1500);
    await page.locator(`[data-open="${scenario.button}"]`).click();

    await expect(page.locator('#wishlistReminder')).toBeVisible();
    await expect(page.locator('#summonModal')).toBeHidden();
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!));
    expect(save.currencies.gems).toBe(1500);
    expect(save.onboarding.noviceSummonUsed).toBe(scenario.noviceSummonUsed);
    expect(save.gachaLog).toHaveLength(0);
  });
}


test('revealed troop portrait opens the same three codex cards, without leaving the chest', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await summonFixture(page, false, 1000);
  await page.locator('[data-open="gem-10"]').click();
  await expect(page.locator('#summonCards .summon-card.is-dealt')).toHaveCount(10);
  await page.locator('#summonSkip').click();
  await expect(page.locator('#summonModal.is-complete')).toBeVisible();

  const troop = page.locator('#summonCards .summon-card.has-detail.is-revealed').last();
  await expect(troop).toBeVisible();
  const name = await troop.locator('.card-label b').innerText();
  await troop.locator('.card-face img').click();
  const detail = page.locator('#summonModal > .usw.open');
  await expect(detail).toBeVisible();
  await expect(detail.locator('.usw-pane')).toHaveCount(3);
  for (const pane of ['portrait', 'spell', 'traits']) {
    await expect(detail.locator(`.usw-pane[data-pane="${pane}"]`)).toBeAttached();
  }
  await expect(detail.locator('.usw-name h2')).toHaveText(name);
  await expect(detail.locator('.usw-actions')).toBeHidden();
  await detail.locator('.usw-close').click();
  await expect(detail).toBeHidden();
  await expect(troop).toHaveClass(/is-revealed/);

  const material = page.locator('#summonCards .summon-card:not(.has-detail).is-revealed').first();
  if (await material.count()) {
    await material.click();
    await expect(detail).toBeHidden();
  }
  await page.locator('#summonAction').click();
  await expect(page.locator('#summonModal')).toBeHidden();
});


test('small screens keep the reward codex and its close control reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await summonFixture(page, false, 1000);
  await page.locator('[data-open="gem-10"]').click();
  await expect(page.locator('#summonCards .summon-card.is-dealt')).toHaveCount(10);
  await page.locator('#summonSkip').click();
  await expect(page.locator('#summonModal.is-complete')).toBeVisible();
  await page.locator('#summonCards .summon-card.has-detail.is-revealed').last().click();
  const detail = page.locator('#summonModal > .usw.open');
  await expect(detail.locator('.usw-pane')).toHaveCount(3);
  await expect(detail.locator('.usw-close')).toBeInViewport();
  await detail.locator('.usw-close').click();
  await expect(detail).toBeHidden();
});
