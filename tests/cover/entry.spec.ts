import { expect, test, type Page } from '@playwright/test';

async function fixture(page: Page, loggedIn = false): Promise<void> {
  await page.route(/fonts\.(?:googleapis|gstatic)\.com/, route => route.abort());
  await page.route('**/auth/me', route => route.fulfill({
    status: loggedIn ? 200 : 401,
    json: loggedIn ? { playerId: 'fixture', username: '黎明旅者', termsAccepted: true } : { error: 'login' },
  }));
  await page.route('**/api/meta/save', async route => {
    const save = await page.evaluate(async () => {
      const path = '/src/meta/server/demo.ts';
      const { buildDemoSave } = await import(/* @vite-ignore */ path);
      const save = buildDemoSave(Date.now());
      save.character = null;
      return save;
    });
    await route.fulfill({ json: { save, fresh: true, warning: null, serverNow: Date.now() } });
  });
}

async function readTerms(page: Page): Promise<void> {
  await page.locator('#termsBody').evaluate(body => { body.scrollTop = body.scrollHeight; });
  await expect(page.locator('#termsAgree')).toBeEnabled();
  await page.locator('#termsAgree').click();
  await expect(page.locator('#terms')).not.toBeVisible();
}

for (const size of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`agreement opens from checkbox, gates scroll and resets on reopen (${size.width})`, async ({ page }) => {
    await page.setViewportSize(size);
    await fixture(page);
    await page.goto('/cover.html', { waitUntil: 'domcontentloaded' });
    await page.locator('#agreeBox').click();
    await expect(page.locator('#terms')).toBeVisible();
    await expect(page.locator('#termsAgree')).toBeDisabled();
    await expect(page.locator('#agreeBox')).not.toBeChecked();
    await expect(page.locator('#loginBtn')).toHaveAttribute('aria-disabled', 'true');
    await page.locator('#termsBody').evaluate(body => { body.scrollTop = 100; });
    await expect(page.locator('#termsAgree')).toBeDisabled();
    await page.screenshot({ path: `artifacts/cover-terms-${size.width}.png` });
    await page.locator('#terms [value="close"]').click();
    await expect(page.locator('#agreeBox')).not.toBeChecked();
    await page.locator('[data-terms]').click();
    await readTerms(page);
    await expect(page.locator('#agreeBox')).toBeChecked();
    await expect(page.locator('#loginBtn')).toHaveAttribute('aria-disabled', 'false');
    await page.locator('#agreeBox').click();
    await expect(page.locator('#agreeBox')).not.toBeChecked();
    await page.locator('#agreeBox').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#terms')).toBeVisible();
    await expect(page.locator('#termsAgree')).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(page.locator('#agreeBox')).not.toBeChecked();
  });
}

test('preloads character code before authentication; login waits for both consent and assets', async ({ page }) => {
  await fixture(page);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/static/hero/character-male.webp', async route => { await held; await route.continue(); });
  const characterCode = page.waitForResponse(response => response.url().includes('/screens/characterScreen.ts'));
  await page.goto('/cover.html', { waitUntil: 'domcontentloaded' });
  await characterCode;
  await expect(page.locator('#skipPreload')).toHaveCount(0);
  await page.locator('#agreeBox').click();
  await readTerms(page);
  await expect(page.locator('#loginBtn')).toHaveAttribute('aria-disabled', 'true');
  release();
  await expect(page.locator('#loginBtn')).toHaveAttribute('aria-disabled', 'false');
});

test('failed assets keep entry disabled and retry unlocks the prepared same-document page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await fixture(page, true);
  let broken = true;
  await page.route('**/static/hero/character-male.webp', route => broken
    ? route.fulfill({ status: 503, body: 'retry' }) : route.continue());
  await page.goto('/cover.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#retryPreload')).toBeVisible();
  await expect(page.locator('#enterBtn')).toBeDisabled();
  await expect(page.locator('#skipPreload')).toHaveCount(0);
  broken = false;
  await page.locator('#retryPreload').click();
  await expect(page.locator('#enterBtn')).toBeEnabled();
  // A document reload, second identity/save read or JS download at entry must fail this test.
  const before = await page.evaluate(() => performance.timeOrigin);
  let identityReads = 0;
  let saveReads = 0;
  page.on('request', request => {
    if (request.url().endsWith('/auth/me')) identityReads++;
    if (request.url().endsWith('/api/meta/save')) saveReads++;
  });
  await page.route('**/*.ts', route => route.abort());
  await page.locator('#enterBtn').click();
  await expect(page.locator('#characterName')).toHaveValue('黎明旅者');
  await expect(page.locator('#createCharacter')).toBeEnabled();
  await expect(page.locator('#cover')).toHaveCount(0);
  await expect(page).toHaveURL(/\/game$/);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(before);
  expect(identityReads).toBe(0);
  expect(saveReads).toBe(0);
  await page.setViewportSize({ width: 1280, height: 800 });
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'artifacts/cover-prepared-character.png' });
  await page.unroute('**/*.ts');
  await page.reload();
  await expect(page.locator('#createCharacter')).toBeEnabled();
});

test('slow save keeps the cover visible until the first screen is prepared', async ({ page }) => {
  await fixture(page, true);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/meta/save', async route => { await held; await route.fallback(); });
  await page.goto('/cover.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#enterBtn')).toBeDisabled();
  await expect(page.locator('#cover')).toBeVisible();
  release();
  await expect(page.locator('#enterBtn')).toBeEnabled();
  await page.locator('#enterBtn').click();
  await expect(page.locator('#createCharacter')).toBeEnabled();
});

test('OAuth callback auto-enters only after successful preparation', async ({ page }) => {
  await fixture(page, true);
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/static/hero/character-male.webp', async route => { await held; await route.continue(); });
  await page.goto('/cover.html?login=1', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#cover')).toBeVisible();
  await expect(page.locator('#enterBtn')).toBeDisabled();
  release();
  await expect(page.locator('#createCharacter')).toBeEnabled();
  await expect(page).toHaveURL(/\/game$/);
});
