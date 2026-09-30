import { expect, test, type Page } from '@playwright/test';

async function fixture(page: Page, pending = true, tutorial = false): Promise<void> {
  await page.route(/fonts\.(?:googleapis|gstatic)\.com/, route => route.abort());
  await page.goto('/cover.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async ({ pending, tutorial }) => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { buildDemoSave } = await load('/src/meta/server/demo.ts');
    const save = buildDemoSave(Date.now());
    if (pending) save.character = null;
    if (tutorial) save.onboarding = { step: 'battle', noviceSummonUsed: false };
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  }, { pending, tutorial });
  await page.goto('/game.html#hero', { waitUntil: 'domcontentloaded' });
}
const profile = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).character);

for (const gender of ['male', 'female', 'unknown']) {
  test(`creates ${gender}, persists on reload, and uses avatar/hero/team art`, async ({ page }) => {
    await fixture(page);
    await expect(page.locator('#characterName')).toHaveValue('本地旅者');
    await expect(page.locator('#characterName')).toHaveAttribute('readonly', '');
    await page.locator(`[name="characterGender"][value="${gender}"]`).check();
    await expect(page.locator('#characterPreview')).toHaveAttribute('src', `/static/hero/character-${gender}.webp`);
    await expect(page.locator('.tut-bubble')).toHaveCount(0);
    await page.locator('#createCharacter').click();
    await expect(page.locator('#playerName')).toHaveText('本地旅者');
    expect(await profile(page)).toEqual({ name: '本地旅者', gender, portrait: 'default:' + gender });
    await expect(page.locator('#playerPortrait')).toHaveAttribute('src', `/static/hero/character-${gender}.webp`);
    await page.goto('/game.html#hero');
    await expect(page.locator('.hero-art img')).toHaveAttribute('src', `/static/hero/character-${gender}.webp`);
    await page.goto('/game.html#team');
    await expect(page.locator('[data-slot="0"] .slot-art img')).toHaveAttribute('src', `/static/hero/character-${gender}.webp`);
    await page.reload();
    await expect(page.locator('.character-screen')).toHaveCount(0);
    await expect(page.locator('#playerName')).toHaveText('本地旅者');
  });
}

test('route guard precedes tutorial and releases it only after creation', async ({ page }) => {
  await fixture(page, true, true);
  await expect(page.locator('.character-screen')).toBeVisible();
  await page.evaluate(() => { location.hash = '#settings'; });
  await expect(page.locator('.character-screen')).toBeVisible();
  await expect(page.locator('.settings-screen')).toHaveCount(0);
  await expect(page.locator('.tut-bubble')).toHaveCount(0);
  await page.locator('#createCharacter').click();
  await expect(page.locator('.tut-bubble')).toBeVisible();
});

test('compresses local artwork and persists it across documents', async ({ page }) => {
  await fixture(page);
  await page.locator('#characterFile').setInputFiles('game-assets/public/static/hero/character-female.webp');
  await expect(page.locator('#characterStatus')).toContainText('已自动压缩');
  await expect(page.locator('#characterPreview')).toHaveAttribute('src', /^data:image\/webp;base64,/);
  const src = await page.locator('#characterPreview').getAttribute('src');
  expect(src!.length).toBeLessThanOrEqual(48_000);
  await page.locator('#createCharacter').click();
  await expect(page.locator('#playerName')).toHaveText('本地旅者');
  expect((await profile(page)).portrait).toBe(src);
  await page.goto('/game.html#hero');
  await expect(page.locator('.hero-art img')).toHaveAttribute('src', src!);
});

test('rejects invalid local files and invalid/failed URLs, then accepts a direct image URL', async ({ page }) => {
  await fixture(page);
  await page.locator('#characterFile').evaluate(input => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['<svg/>'], 'payload.svg', { type: 'image/svg+xml' }));
    (input as HTMLInputElement).files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('#characterError')).toContainText('JPG');
  await page.locator('#characterUrl').fill('http://images.example/portrait.webp');
  await page.locator('#applyCharacterUrl').click();
  await expect(page.locator('#characterError')).toContainText('HTTPS');
  await page.route('https://images.example/broken.webp', route => route.fulfill({ status: 404, body: '' }));
  await page.locator('#characterUrl').fill('https://images.example/broken.webp');
  await page.locator('#applyCharacterUrl').click();
  await expect(page.locator('#characterError')).toContainText('加载失败');
  await page.route('https://images.example/portrait.webp', route => route.fulfill({ path: 'game-assets/public/static/hero/character-male.webp', contentType: 'image/webp' }));
  await page.locator('#characterUrl').fill('https://images.example/portrait.webp');
  await page.locator('#applyCharacterUrl').click();
  await expect(page.locator('#characterStatus')).toHaveText('已应用网络立绘');
  await page.locator('#createCharacter').click();
  await expect(page.locator('#playerName')).toHaveText('本地旅者');
  expect((await profile(page)).portrait).toBe('https://images.example/portrait.webp');
});

test('a late URL result never replaces a newer default selection', async ({ page }) => {
  await fixture(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('https://images.example/slow.webp', async route => {
    await pending;
    await route.fulfill({ path: 'game-assets/public/static/hero/character-male.webp', contentType: 'image/webp' });
  });
  await page.locator('#characterUrl').fill('https://images.example/slow.webp');
  await page.locator('#applyCharacterUrl').click();
  await expect(page.locator('#createCharacter')).toBeDisabled();
  await page.locator('[data-portrait="female"]').click();
  release();
  await expect(page.locator('#characterPreview')).toHaveAttribute('src', '/static/hero/character-female.webp');
  await expect(page.locator('#createCharacter')).toBeEnabled();
  await page.locator('#createCharacter').click();
  await expect(page.locator('#playerName')).toHaveText('本地旅者');
  expect((await profile(page)).portrait).toBe('default:female');
});

test('old save remains playable; reset returns to cover and next entry requires creation', async ({ page }) => {
  await fixture(page, false);
  await expect(page.locator('.hero-screen')).toBeVisible();
  await page.goto('/game.html#settings');
  await page.locator('#resetNew').click();
  await page.locator('#resetNew').click();
  await expect(page).toHaveURL(/\/cover\.html$/);
  await expect(page.locator('#coverTitle')).toHaveText('破晓之誓');
  await expect(page.locator('#coverActions')).toBeVisible();
  expect(await profile(page)).toBeNull();
  await page.goto('/game.html#map');
  await expect(page.locator('.character-screen')).toBeVisible();
  await expect(page.locator('.tut-bubble')).toHaveCount(0);
});

for (const viewport of [{ width: 1600, height: 1000 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`character layout is unscaled and scrollable at ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await fixture(page);
    await expect(page.locator('#createCharacter')).toBeEnabled();
    expect(await page.locator('#stage').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await expect(page.locator('#stage')).toHaveCSS('transform', 'none');
    await expect(page.locator('#characterPreview')).toBeVisible();
    await page.locator('#createCharacter').scrollIntoViewIfNeeded();
    const box = (await page.locator('#createCharacter').boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    await page.locator('#stage').evaluate(el => { el.scrollTop = 0; });
    await page.screenshot({ path: `artifacts/character-layout-${viewport.width}.png` });
  });
}

test('uses Dawn branding, concise labels and male as the initial profile', async ({ page }) => {
  await fixture(page);
  await expect(page.locator('.character-header a')).toHaveText('破晓之誓 CHRONICLES OF DAWN');
  await expect(page.locator('[name="characterGender"][value="male"]')).toBeChecked();
  await expect(page.locator('[data-portrait="male"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#characterPreview')).toHaveAttribute('src', '/static/hero/character-male.webp');
  const text = await page.locator('.character-screen').innerText();
  for (const redundant of ['相同显示名的账号', '不影响战斗属性', '选择默认形象，或使用自己的立绘', '网络立绘依赖原站可用性']) expect(text).not.toContain(redundant);
  await page.locator('#createCharacter').click();
  await expect(page.locator('#playerName')).toHaveText('本地旅者');
  expect((await profile(page)).gender).toBe('male');
});
