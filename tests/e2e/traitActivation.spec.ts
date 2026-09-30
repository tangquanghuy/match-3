import { expect, test, type Page } from '@playwright/test';

async function openBattle(page: Page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/index.html');
  await page.waitForFunction(() => {
    const app = (window as any).__app;
    return app && !app.startupPlaying && document.querySelectorAll('.gcard').length === 8;
  });
}

async function triggerArmor(page: Page, reverse = false) {
  return page.evaluate(async (reverse) => {
    const app = (window as any).__app;
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { CombatResolver } = await load('/src/engine/CombatResolver.ts');
    const { attachPassives } = await load('/src/engine/traits.ts');
    const teams = app.getEngine().getState().teams;
    const attackTeam = reverse ? teams.Right : teams.Left;
    const defendTeam = reverse ? teams.Left : teams.Right;
    const target = defendTeam.characters[0];
    const attacker = attackTeam.characters[0];
    Object.assign(target, { traitIds: ['armored'], statuses: [], hp: 500, maxHp: 500, armor: 20 });
    Object.assign(attacker, { traitIds: [], statuses: [], attack: 20 });
    attachPassives(target); attachPassives(attacker);
    const events = new CombatResolver().resolveSkullDamage(attackTeam, defendTeam, 3).events;
    // Feed real engine output through the battle timeline, not synthetic DOM text.
    void app.player.play(events);
    return { targetId: target.id, attackerId: attacker.id, noPrematureLabel: !document.querySelector('.trait-activation') };
  }, reverse);
}

for (const [width, height] of [[1440, 900], [844, 390], [667, 375]]) {
  test(`trait appears on the impacted portrait ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await openBattle(page);
    const result = await triggerArmor(page, width === 844);
    expect(result.noPrematureLabel).toBe(true);
    const card = page.getByTestId(`card-${result.targetId}`);
    const label = card.locator('.trait-activation');
    await expect(label).toHaveText('全副武装');
    await expect(page.getByTestId(`card-${result.attackerId}`).locator('.trait-activation')).toHaveCount(0);
    // Freeze only this label at full visibility for deterministic inspection.
    await label.evaluate(el => el.getAnimations().forEach(a => { a.pause(); a.currentTime = 450; }));
    const geometry = await label.evaluate(el => {
      const r = el.getBoundingClientRect();
      const c = el.closest('.gcard')!.getBoundingClientRect();
      const ink = getComputedStyle(el, '::before');
      return { inside: r.left >= c.left && r.right <= c.right && r.top >= c.top && r.bottom <= c.bottom,
        pointerEvents: getComputedStyle(el).pointerEvents, weight: getComputedStyle(el).fontWeight,
        background: getComputedStyle(el).backgroundImage, border: getComputedStyle(el).borderTopWidth,
        inkTexture: ink.backgroundImage, inkTransform: ink.transform,
        inkTop: parseFloat(ink.top), inkBottom: parseFloat(ink.bottom),
        inkLeft: parseFloat(ink.left), inkRight: parseFloat(ink.right), inkOpacity: Number(ink.opacity) };
    });
    expect(geometry.inside).toBe(true);
    expect(geometry.pointerEvents).toBe('none');
    expect(geometry.weight).toBe('400');
    expect(geometry.background).toBe('none');
    expect(geometry.border).toBe('0px');
    expect(geometry.inkTexture).toContain('trait_ink_stroke.webp');
    // The texture must really decode, not merely have a valid-looking CSS URL.
    expect(await page.evaluate(async (mask) => {
      const image = new Image();
      image.src = mask.slice(5, -2);
      await image.decode();
      return image.naturalWidth > 0 && image.naturalHeight > 0;
    }, geometry.inkTexture)).toBe(true);
    expect(geometry.inkTransform).not.toBe('none');
    for (const edge of [geometry.inkTop, geometry.inkBottom, geometry.inkLeft, geometry.inkRight]) {
      expect(edge).toBeLessThan(0);
    }
    expect(geometry.inkOpacity).toBeGreaterThanOrEqual(.8);
    expect(geometry.inkOpacity).toBeLessThan(1);
    // Let the hit flash finish while retaining the label for visual review.
    await page.waitForTimeout(420);
    await page.screenshot({ path: `artifacts/trait-activation-ink-expanded-${width}.png` });
    await card.screenshot({ path: `artifacts/trait-activation-ink-expanded-card-${width}.png` });
    await label.evaluate(el => el.getAnimations().forEach(a => a.play()));
    await expect(label).toHaveCount(0, { timeout: 3500 });
  });
}

test('repeated trait feedback coalesces without hiding distinct names', async ({ page }) => {
  await openBattle(page);
  await page.evaluate(() => {
    const app = (window as any).__app;
    const char = app.getEngine().getState().teams.Left.characters[0];
    const card = app.cardOfChar(char.id);
    card.showTraitActivation('armored', '全副武装');
    card.showTraitActivation('armored', '全副武装');
    card.showTraitActivation('regeneration', '再生');
  });
  await expect(page.locator('.trait-activation')).toHaveCount(2);
  await expect(page.locator('.trait-activation')).toHaveCount(0, { timeout: 3500 });
});


test('trait labels remain readable without holding up the battle input tail', async ({ page }) => {
  await openBattle(page);
  await page.evaluate(async () => {
    const app = (window as any).__app;
    const path = '/src/engine/traits.ts';
    const { attachPassives, applyTurnStartPassives } = await import(/* @vite-ignore */ path);
    const char = app.getEngine().getState().teams.Left.characters[0];
    char.traitIds = ['regeneration']; char.hp = char.maxHp - 2; char.statuses = [];
    attachPassives(char);
    (window as any).__traitPlaybackDone = false;
    void app.playEventsWithTail(applyTurnStartPassives([char])).then(() => { (window as any).__traitPlaybackDone = true; });
  });
  const label = page.locator('.trait-activation');
  await expect(label).toHaveText('再生');
  await label.evaluate(el => el.getAnimations().forEach(a => a.pause()));
  // A paused cosmetic label would hang the old animation-drain loop indefinitely.
  await page.waitForFunction(() => (window as any).__traitPlaybackDone, undefined, { timeout: 4000 });
  await label.evaluate(el => el.getAnimations().forEach(a => a.play()));
});

test('reduced motion fades names without travel, and disposal clears active labels', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBattle(page);
  await page.evaluate(() => {
    const app = (window as any).__app;
    const char = app.getEngine().getState().teams.Left.characters[0];
    app.cardOfChar(char.id).showTraitActivation('armored', '全副武装');
  });
  const label = page.locator('.trait-activation');
  await expect(label).toHaveText('全副武装');
  expect(await label.evaluate(el => el.getAnimations().every(a =>
    (a.effect as KeyframeEffect).getKeyframes().every(frame => frame.transform === 'none')))).toBe(true);
  await page.evaluate(() => {
    const app = (window as any).__app;
    app.cardOfChar(app.getEngine().getState().teams.Left.characters[0].id).destroy();
  });
  await expect(label).toHaveCount(0);
});
