import { expect, test, type Page } from '@playwright/test';

async function draft(page: Page) {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.goto('/game.html#arena');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('#enter').click();
  await expect(page.locator('#draft')).toBeVisible();
}
async function pick(page: Page) {
  await page.locator('.draft-card').first().click();
  await page.locator('#nextDraft').click();
}

for (const [width, height] of [[1600, 900], [1366, 768], [768, 1024], [390, 844], [320, 568], [844, 390]]) {
  test(`独立部队详情及返回保留选人 ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await draft(page);
    await expect(page.locator('#draftCards [data-stat]')).toHaveCount(12);
    await expect(page.locator('#arenaRosterDetail, #arenaInspectDialog')).toHaveCount(0);
    await expect(page.locator('#draftCards .draft-spell-copy')).toHaveCount(0);
    await pick(page);
    await expect(page.locator('#pickedLabel')).toHaveText('已锁定 1/4');
    await pick(page);
    await expect(page.locator('#pickedLabel')).toHaveText('已锁定 2/4');
    await page.locator('.draft-card').nth(1).click();
    const before = await page.evaluate(() => localStorage.getItem('gems.meta.save'));
    const teamName = await page.locator('#pickedSlots .filled').first().locator('b').textContent();
    await page.locator('#pickedSlots .filled').first().click();
    await expect(page).toHaveURL(/#arena\/detail\/\d+$/);
    await expect(page.locator('#draft')).toHaveCount(0);
    await expect(page.locator('.arena-detail-heading h3')).toHaveText(teamName!);
    await expect(page.locator('.arena-detail-copy [data-stat]')).toHaveCount(4);
    await expect(page.locator('.arena-detail-rule')).toHaveText('Lv.15 · 无特质 · 无外部加成');
    expect(await page.evaluate(() => localStorage.getItem('gems.meta.save'))).toBe(before);
    await expect(page.locator('#arenaDetailTitle')).toBeFocused();
    await page.reload();
    await expect(page.locator('.arena-detail-heading h3')).toHaveText(teamName!);
    expect(await page.locator('.draft-spell-copy').evaluate(node => {
      const style = getComputedStyle(node);
      return style.opacity === '1' && style.maxHeight === 'none' && node.scrollHeight <= node.clientHeight + 1;
    })).toBe(true);
    await expect.poll(() => page.locator('.arena-detail-page img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    await page.screenshot({ path: `artifacts/arena-redesign/detail-${width}.png` });
    await page.locator('#arenaDetailBack').click();
    await expect(page.locator('.draft-card').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#nextDraft')).toBeEnabled();
    await expect(page.locator('#pickedSlots .filled').first()).toBeFocused();
    await page.locator('[data-candidate-troop]').first().click();
    await expect(page.locator('.arena-detail-nav')).toContainText('本轮候选');
    await page.goBack();
    await expect(page.locator('.draft-card').nth(1)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-candidate-troop]').first()).toBeFocused();
    expect(await page.evaluate(() => localStorage.getItem('gems.meta.save'))).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => page.locator('#draft img').evaluateAll(images => images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    // Desktop must fit without hiding its primary action beneath the fixed navigation.
    if (width >= 1100) {
      const foot = await page.locator('#nextDraft').boundingBox();
      const roster = await page.locator('#pickedSlots').boundingBox();
      const nav = await page.locator('.bottom-bar').boundingBox();
      expect(foot!.y + foot!.height).toBeLessThanOrEqual(nav!.y);
      expect(roster!.y + roster!.height).toBeLessThanOrEqual(nav!.y);
    }
    await page.screenshot({ path: `artifacts/arena-redesign/roster-${width}.png` });
    await page.locator('#nextDraft').click();
    await expect(page.locator('#pickedLabel')).toHaveText('已锁定 3/4');
    await expect(page.locator('#nextDraft')).toBeDisabled();
    await page.reload();
    await expect(page.locator('#pickedSlots .filled')).toHaveCount(3);
    await pick(page);
    await expect(page.locator('#battle')).toBeVisible();
    await page.locator('[data-inspect-troop]').first().click();
    await expect(page.locator('.arena-detail-copy [data-stat]')).toHaveCount(4);
    await page.locator('.arena-detail-peers a').nth(1).click();
    await expect(page.locator('.arena-detail-nav')).toContainText('第 2 位');
    await page.locator('#arenaDetailBack').click();
    await expect(page.locator('#battle')).toBeVisible();
    await expect(page.locator('[data-inspect-troop]').first()).toBeFocused();
  });
}

test('选牌慢响应只提交一次，并阻止在途离开选人页', async ({ page }) => {
  await draft(page);
  await pick(page);
  await expect(page.locator('#pickedLabel')).toHaveText('已锁定 1/4');
  await page.evaluate(async () => {
    const path = '/src/meta/gateway/index.ts';
    const { metaGateway } = await import(path) as typeof import('../../src/meta/gateway');
    const transport = (metaGateway() as unknown as { transport: import('../../src/meta/gateway').MetaTransport }).transport;
    const send = transport.send.bind(transport);
    transport.send = async command => {
      if (command.type === 'pickDraftCard') {
        document.documentElement.dataset.pickCalls = String(Number(document.documentElement.dataset.pickCalls ?? 0) + 1);
        await new Promise<void>(resolve => { (window as unknown as { releasePick: () => void }).releasePick = resolve; });
      }
      return send(command);
    };
  });
  await page.locator('.draft-card').first().click();
  await page.locator('#nextDraft').click();
  await expect(page.locator('#nextDraft')).toBeDisabled();
  await expect(page.locator('#draftCards')).toHaveAttribute('aria-busy', 'true');
  await page.locator('#nextDraft').dispatchEvent('click');
  await page.locator('.draft-card').nth(1).click();
  await expect(page.locator('.draft-card').first()).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#pickedSlots .filled').click();
  await expect(page).toHaveURL(/#arena$/);
  await expect(page.locator('html')).toHaveAttribute('data-pick-calls', '1');
  await page.evaluate(() => (window as unknown as { releasePick: () => void }).releasePick());
  await expect(page.locator('#pickedLabel')).toHaveText('已锁定 2/4');
  await expect(page.locator('#draftCards')).not.toHaveAttribute('aria-busy');
});


test('次级页术语可查看，返回后清理浮层', async ({ page }) => {
  await draft(page);
  await page.evaluate(async () => {
    const gatewayPath = '/src/meta/gateway/index.ts';
    const arenaPath = '/src/meta/systems/arena.ts';
    const { metaGateway } = await import(gatewayPath) as typeof import('../../src/meta/gateway');
    const { currentDraftChoices } = await import(arenaPath) as typeof import('../../src/meta/systems/arena');
    const gateway = metaGateway();
    for (let i = 0; i < 4; i++) await gateway.pickDraftCard(currentDraftChoices(gateway.current())!.options[0]!.troopId);
  });
  await page.reload();
  await expect(page.locator('#battle')).toBeVisible();
  // Seed only the local fixture: this troop's skill always contains status terms.
  await page.evaluate(async () => {
    const path = '/src/data/troops.ts';
    const { TROOPS } = await import(path) as typeof import('../../src/data/troops');
    const troop = TROOPS.find(t => t.spell.description.includes('中毒'))!;
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.arena.activeDraft.picked[0] = troop.id;
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  });
  await page.reload();
  await page.locator('[data-inspect-troop]').first().click();
  const term = page.locator('.arena-detail-copy .spell-term').first();
  await term.click();
  const tip = page.locator('.term-tip');
  await expect(tip).toBeVisible();
  expect(await tip.evaluate(node => {
    const rect = node.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hit !== null && node.contains(hit);
  })).toBe(true);
  await page.locator('#arenaDetailBack').click();
  await expect(page.locator('.term-tip')).toHaveCount(0);
});


test('过期详情链接回到当前竞技场，不展示本届以外的部队', async ({ page }) => {
  await draft(page);
  await page.goto('/game.html#arena/detail/999999');
  await expect(page.locator('.arena-detail-expired')).toBeVisible();
  await expect(page.locator('.arena-detail-copy')).toHaveCount(0);
  await page.locator('#arenaDetailBack').click();
  await expect(page.locator('#draft')).toBeVisible();
});


test('长技能详情自然滚动到底，内容不裁切也不被底栏盖住', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await draft(page);
  const id = Number(await page.locator('[data-candidate-troop]').first().getAttribute('data-candidate-troop'));
  await page.evaluate(async troopId => {
    const path = '/src/data/troops.ts';
    const { getTroopById } = await import(path) as typeof import('../../src/data/troops');
    const troop = getTroopById(troopId)!;
    troop.spell.description = Array.from({ length: 30 }, () => '对敌人造成伤害，并获得一个额外回合。').join('');
  }, id);
  await page.locator('[data-candidate-troop]').first().click();
  const copy = page.locator('.draft-spell-copy');
  expect(await copy.evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true);
  await page.locator('.arena-detail-rule').scrollIntoViewIfNeeded();
  const rule = await page.locator('.arena-detail-rule').boundingBox();
  const nav = await page.locator('.bottom-bar').boundingBox();
  expect(rule!.y + rule!.height).toBeLessThanOrEqual(nav!.y);
  expect(await page.locator('.arena-detail-page').evaluate(node => node.scrollTop > 0)).toBe(true);
  await page.locator('#arenaDetailBack').click();
  await expect(page.locator('#draft')).toBeVisible();
  await expect(page.locator('#nextDraft')).toBeDisabled();
});
