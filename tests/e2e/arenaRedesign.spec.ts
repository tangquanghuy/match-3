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
  await expect(page.locator('#arenaDetailPick')).toBeVisible();
  await page.locator('#arenaDetailPick').click();
  await expect(page).toHaveURL(/#arena$/);
}

for (const [width, height] of [[1600, 900], [1366, 768], [768, 1024], [390, 844], [320, 568], [844, 390]]) {
  test(`点击立绘查看三卡详情、独立确认、2×2 编队 ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await draft(page);
    await expect(page.locator('#draftCards [data-stat]')).toHaveCount(15);
    await expect(page.locator('.arena-candidate-detail, .arena-slot-detail')).toHaveCount(0);
    const before = await page.evaluate(() => localStorage.getItem('gems.meta.save'));
    await page.locator('.draft-card img').first().click();
    await expect(page).toHaveURL(/#arena\/detail\/\d+$/);
    await expect(page.locator('.usw-pane')).toHaveCount(3);
    expect(await page.evaluate(() => localStorage.getItem('gems.meta.save'))).toBe(before);
    const layout = await page.locator('.usw-pane').evaluateAll(nodes => nodes.map(node => ({
      pane: (node as HTMLElement).dataset.pane, x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y,
      width: node.getBoundingClientRect().width, transform: getComputedStyle(node).transform,
    })).sort((a, b) => a.x - b.x));
    expect(layout.every(card => card.transform === 'none' && Math.abs(card.y - layout[0]!.y) < 1)).toBe(true);
    expect(layout[1]!.x).toBeGreaterThanOrEqual(layout[0]!.x + layout[0]!.width);
    expect(layout.map(card => card.pane)).toEqual(['spell', 'portrait', 'traits']);
    await expect(page.locator('.arena-detail-peers, [role=tab], .usw-pane[role=button]')).toHaveCount(0);
    await expect.poll(() => page.locator('.usw-portrait').evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await page.screenshot({ animations: 'disabled', path: `artifacts/arena-redesign/detail-${width}.png` });
    await page.locator('#arenaDetailBack').click();
    await expect(page.locator('[data-candidate-troop]').first()).toBeFocused();
    await expect(page.locator('.draft-card.selected')).toHaveCount(1);
    await expect(page.locator('.draft-card.selected .arena-selection-mark')).toBeVisible();
    await expect(page.locator('#nextDraft')).toBeEnabled();
    await expect(page.locator('[data-pick-troop], input[type=checkbox], input[type=radio]')).toHaveCount(0);
    await expect(page.locator('#pickedLabel')).toHaveText('已锁定 0/4');
    await page.locator('.draft-card').first().focus();
    await page.keyboard.press('Enter');
    await page.locator('#arenaDetailPick').click();
    await expect(page.locator('#pickedLabel')).toHaveText('已锁定 1/4');
    await pick(page);
    await expect(page.locator('#pickedLabel')).toHaveText('已锁定 2/4');
    await page.locator('#pickedSlots .filled').first().click();
    await expect(page.locator('.usw-pane')).toHaveCount(3);
    await expect(page.locator('#arenaDetailPick')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.locator('#pickedSlots .filled').first()).toBeFocused();
    await page.screenshot({ animations: 'disabled', path: `artifacts/arena-redesign/draft-${width}.png` });
    await pick(page);
    await expect(page.locator('#pickedLabel')).toHaveText('已锁定 3/4');
    await pick(page);
    await expect(page.locator('#battle')).toBeVisible();
    await expect(page.locator('#draftTeam [data-stat]')).toHaveCount(20);
    await expect(page.locator('.match-preview [data-stat]')).toHaveCount(20);
    expect(await page.locator('#draftTeam').evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length)).toBe(2);
    const cards = await page.locator('.arena-lineup-art, .arena-enemy-art').evaluateAll(nodes => nodes.map(node => {
      const art = node.getBoundingClientRect();
      const stats = Array.from(node.querySelectorAll('[data-stat]')).map(stat => stat.getBoundingClientRect());
      return stats.every(stat => stat.left >= art.left - 1 && stat.right <= art.right + 1 && stat.top >= art.top - 1 && stat.bottom <= art.bottom + 1);
    }));
    expect(cards).toEqual(Array(8).fill(true));
    const namesAndControls = await page.locator('#draftTeam .run-slot').evaluateAll(nodes => nodes.map(node => {
      const name = node.querySelector('.slot-body b')!.getBoundingClientRect();
      const art = node.querySelector('.arena-lineup-art')!.getBoundingClientRect();
      const swap = node.querySelector('.arena-swap')!.getBoundingClientRect();
      return name.width > 20 && name.height > 10 && swap.top >= art.bottom && swap.width >= 40;
    }));
    expect(namesAndControls).toEqual([true, true, true, true]);
    const workspaceWidth = await page.locator('.battle-grid').evaluate(node => node.getBoundingClientRect().width);
    const panelWidth = await page.locator('#battle').evaluate(node => node.getBoundingClientRect().width);
    expect(workspaceWidth / panelWidth).toBeGreaterThan(.95);
    if (width! > 1100) {
      const columns = await page.locator('.lineup-col, .gauntlet-col').evaluateAll(nodes => nodes.map(node => {
        const rect = node.getBoundingClientRect();
        return { width: rect.width, top: rect.top, bottom: rect.bottom };
      }));
      expect(Math.abs(columns[0]!.width - columns[1]!.width)).toBeLessThan(1);
      expect(Math.abs(columns[0]!.top - columns[1]!.top)).toBeLessThan(1);
      expect(Math.abs(columns[0]!.bottom - columns[1]!.bottom)).toBeLessThan(1);
      const fight = await page.locator('#fight').boundingBox();
      const nav = await page.locator('.bottom-bar').boundingBox();
      expect(fight!.y + fight!.height).toBeLessThanOrEqual(nav!.y);
    }
    await page.locator('#draftTeam').scrollIntoViewIfNeeded();
    await page.screenshot({ animations: 'disabled', path: `artifacts/arena-redesign/lineup-${width}.png` });
    await page.locator('.match-preview').scrollIntoViewIfNeeded();
    await page.screenshot({ animations: 'disabled', path: `artifacts/arena-redesign/enemies-${width}.png` });
    await page.locator('[data-inspect-troop]').first().click();
    await expect(page.locator('.usw-pane')).toHaveCount(3);
    await page.locator('#arenaDetailBack').click();
    await expect(page.locator('[data-inspect-troop]').first()).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width! + 1);
    expect(errors).toEqual([]);
  });
}

for (const inDetail of [false, true]) {
  test(`选牌慢响应只提交一次 ${inDetail ? '详情' : '候选'}`, async ({ page }) => {
    await draft(page);
    await page.locator('.draft-card').first().click();
    if (!inDetail) await page.locator('#arenaDetailBack').click();
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
    const confirm = page.locator(inDetail ? '#arenaDetailPick' : '#nextDraft');
    await confirm.click();
    await expect(confirm).toBeDisabled();
    await confirm.dispatchEvent('click');
    if (inDetail) await page.keyboard.press('Escape');
    else await page.locator('.draft-card').nth(1).dispatchEvent('click');
    await expect(page.locator('html')).toHaveAttribute('data-pick-calls', '1');
    await page.evaluate(() => (window as unknown as { releasePick: () => void }).releasePick());
    await expect(page.locator('#pickedLabel')).toHaveText('已锁定 1/4');
    await expect(page.locator('#nextDraft')).toBeDisabled();
  });
}

test('切换候选只更新选中态，刷新后保留，本轮确认后清空', async ({ page }) => {
  await draft(page);
  await page.locator('.draft-card').first().click();
  await page.locator('#arenaDetailBack').click();
  const second = await page.locator('.draft-card').nth(1).getAttribute('data-candidate-troop');
  await page.locator('.draft-card').nth(1).click();
  await page.locator('#arenaDetailBack').click();
  await expect(page.locator('.draft-card.selected')).toHaveAttribute('data-candidate-troop', second!);
  await page.reload();
  await expect(page.locator('.draft-card.selected')).toHaveAttribute('data-candidate-troop', second!);
  await page.locator('#nextDraft').click();
  await expect(page.locator('#pickedLabel')).toHaveText('已锁定 1/4');
  await expect(page.locator('.draft-card.selected')).toHaveCount(0);
  await expect(page.locator('#nextDraft')).toBeDisabled();
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
  const term = page.locator('.usw-copy .spell-term').first();
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
  await expect(page.locator('.usw')).toHaveCount(0);
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
  const copy = page.locator('.usw-spell-body');
  expect(await copy.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
  await copy.evaluate(node => { node.scrollTop = node.scrollHeight; });
  expect(await copy.evaluate(node => node.scrollTop > 0)).toBe(true);
  await page.locator('.arena-detail-footer').scrollIntoViewIfNeeded();
  const rule = await page.locator('.arena-detail-footer').boundingBox();
  const nav = await page.locator('.bottom-bar').boundingBox();
  expect(rule!.y + rule!.height).toBeLessThanOrEqual(nav!.y);
  await page.locator('#arenaDetailBack').click();
  await expect(page.locator('#draft')).toBeVisible();
  await expect(page.locator('#nextDraft')).toBeEnabled();
});
