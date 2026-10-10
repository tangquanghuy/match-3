import { expect, test } from '@playwright/test';

for (const width of [390, 430]) {
  test(`mobile team controls and portraits stay aligned at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto('/game.html#team', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#slots .slot')).toHaveCount(4, { timeout: 15_000 });

    const slots = await page.locator('#slots .slot-wrap').evaluateAll((cards) =>
      cards.map((card) => {
        const rect = card.getBoundingClientRect();
        const art = card.querySelector('.slot-art img')?.getBoundingClientRect();
        return { x: rect.x, width: rect.width, artWidth: art?.width, artHeight: art?.height };
      }));
    expect(slots).toHaveLength(4);
    expect(Math.abs(slots[0].width - slots[1].width)).toBeLessThanOrEqual(1);
    expect(Math.abs(slots[2].width - slots[3].width)).toBeLessThanOrEqual(1);
    expect(slots[0].artWidth).toBeCloseTo(slots[1].artWidth!, 0);
    expect(slots[0].artHeight).toBeCloseTo(slots[1].artHeight!, 0);
    expect(slots[1].x + slots[1].width).toBeLessThanOrEqual(width + 1);

    await page.screenshot({ path: `artifacts/ux-phase-b/shots/team-mobile-${width}x850.png`, fullPage: true });

    // Keep both disclosures open, as they can be on a touch screen.
    await page.locator('#teamGauge .kingdom-bonus-details summary').evaluate((summary: HTMLElement) => summary.click());
    await page.locator('.team-menu summary').click();
    await expect(page.locator('.team-menu')).toHaveAttribute('open', '');
    await page.screenshot({ path: `artifacts/ux-phase-b/shots/team-menu-open-${width}x850.png`, fullPage: true });
    for (const id of ['renameTeam', 'clearTeam', 'deleteTeam']) {
      const button = page.locator(`#${id}`);
      await expect(button).toBeVisible();
      expect(await button.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return target === el || el.contains(target);
      })).toBe(true);
    }
  });
}
