import { expect, test } from '@playwright/test';

for (const width of [1600, 390]) {
  test(`编队属性加成收起与展开（${width}px）`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/game.html#team');
    const gauge = page.locator('#teamGauge');
    const details = gauge.locator('.kingdom-bonus-details');
    await expect(details.locator('summary')).toBeVisible({ timeout: 15_000 });
    await expect(details).not.toHaveAttribute('open');
    await expect(gauge.locator('.gauge-kbonus')).toHaveCount(0);
    const before = await gauge.boundingBox();
    await details.locator('summary').click();
    await expect(details).toHaveAttribute('open', '');
    await expect(details.locator('.kingdom-bonus-menu')).toBeVisible();
    await expect(details.locator('.kingdom-bonus-section')).toHaveCount(3);
    await expect(details.locator('.kingdom-bonus-section').first()).toContainText('王国满级');
    await expect(details.locator('.kingdom-bonus-section').nth(1)).toContainText('同王国编队');
    await expect(details.locator('.kingdom-bonus-menu')).not.toContainText('暂行值');
    await expect(details.locator('.kingdom-bonus-section.total')).toContainText('本队合计');
    const after = await gauge.boundingBox();
    expect(after!.height).toBe(before!.height);
    const menu = await details.locator('.kingdom-bonus-menu').boundingBox();
    expect(menu!.x).toBeGreaterThanOrEqual(0);
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(width + 1);
    await page.locator('#teamTabs .team-tab').first().click();
    await expect(details).toHaveAttribute('open', '');
    await details.locator('summary').click();
    await expect(details).not.toHaveAttribute('open');
  });
}

test('全王国满级后长数值只在展开面板中展示', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('/game.html#team');
  const summary = page.locator('#teamGauge .kingdom-bonus-details summary');
  await expect(summary).toBeVisible({ timeout: 15_000 });
  const bonus = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { defaultMetaGateway } = await load('/src/meta/gateway/index.ts');
    const { kingdomBonusOf } = await load('/src/meta/systems/kingdomOps.ts');
    const { KINGDOM_ORDER } = await load('/src/meta/data/kingdoms.ts');
    const gateway = defaultMetaGateway() as { load(): Promise<unknown>; exportSaveJson(): string; dev: { importSaveJson(text: string): Promise<unknown> } };
    await gateway.load();
    const save = JSON.parse(gateway.exportSaveJson()) as { kingdoms: Record<string, { level: number; questsDone: number; exploreTier: number; lastTributeAt: number }> };
    for (const kingdom of KINGDOM_ORDER) save.kingdoms[kingdom] = { ...(save.kingdoms[kingdom] ?? { questsDone: 0, exploreTier: 0, lastTributeAt: 0 }), level: 10 };
    const total = kingdomBonusOf(save);
    await gateway.dev.importSaveJson(JSON.stringify(save));
    return total;
  });
  await page.reload();
  await expect(summary).toHaveText(/属性加成/);
  expect(await summary.innerText()).not.toMatch(/生命\+|护甲\+|攻击\+|魔力\+/);
  await summary.click();
  const permanent = page.locator('#teamGauge .kingdom-bonus-section').first();
  for (const [key, label] of Object.entries({ health: '生命', armor: '护甲', attack: '攻击', magic: '魔法' })) {
    await expect(permanent).toContainText(`${label}+${bonus[key as keyof typeof bonus]}`);
  }
});

test('主角种族随职业、王国随装备武器改变，编队界面即时展示正确归属', async ({ page }) => {
  await page.goto('/game.html#team');
  await expect(page.locator('#teamGauge summary')).toBeVisible({ timeout: 15_000 });
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { defaultMetaGateway } = await load('/src/meta/gateway/index.ts');
    const gateway = defaultMetaGateway();
    await gateway.load();
    const save = JSON.parse(gateway.exportSaveJson());
    save.hero.classId = 'bard';
    save.hero.classLevels.bard = 1;
    if (!save.hero.unlockedClasses.includes('bard')) save.hero.unlockedClasses.push('bard');
    save.hero.equippedWeapon = 'gw_GiantsMace';
    // Team presets keep their own hero loadout; changing only the global hero
    // is overwritten by the active preset when the team screen opens.
    save.teams[save.activeTeamIndex].heroClassId = 'bard';
    save.teams[save.activeTeamIndex].heroWeaponId = 'gw_GiantsMace';
    save.teams[save.activeTeamIndex].members = [
      { kind: 'hero' }, { kind: 'troop', troopId: 6000 },
      { kind: 'troop', troopId: 6097 }, { kind: 'troop', troopId: 6457 },
    ];
    await gateway.dev?.importSaveJson(JSON.stringify(save));
  });
  await page.reload();
  const heroSlot = page.locator('#slots .slot.r-hero');
  await expect(heroSlot).toHaveAttribute('title', /野民 · 破碎尖塔/);
  await page.locator('#teamGauge summary').click();
  await expect(page.locator('#teamGauge .kingdom-bonus-section').nth(1)).toContainText('破碎尖塔（4/4）');

  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { defaultMetaGateway } = await load('/src/meta/gateway/index.ts');
    const gateway = defaultMetaGateway();
    await gateway.load();
    const save = JSON.parse(gateway.exportSaveJson());
    save.hero.equippedWeapon = null;
    save.teams[save.activeTeamIndex].heroWeaponId = null;
    await gateway.dev?.importSaveJson(JSON.stringify(save));
  });
  await page.reload();
  await expect(heroSlot).toHaveAttribute('title', /野民 · 无所属王国/);
  await page.locator('#teamGauge summary').click();
  await expect(page.locator('#teamGauge .kingdom-bonus-section').nth(1)).toContainText('破碎尖塔（3/4）');
});