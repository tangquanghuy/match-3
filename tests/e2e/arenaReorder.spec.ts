import { test, expect, type Page } from '@playwright/test';

async function openRun(page: Page): Promise<void> {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.goto('/game.html#arena');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('.arena-screen')).toBeVisible();
  await page.evaluate(async () => {
    const gatewayPath = '/src/meta/gateway/index.ts';
    const arenaPath = '/src/meta/systems/arena.ts';
    const { metaGateway } = await import(gatewayPath) as typeof import('../../src/meta/gateway');
    const { currentDraftChoices } = await import(arenaPath) as typeof import('../../src/meta/systems/arena');
    const gateway = metaGateway();
    await gateway.enterArena();
    for (let i = 0; i < 4; i++) await gateway.pickDraftCard(currentDraftChoices(gateway.current())!.options[0]!.troopId);
    await gateway.startDraftBattles();
  });
  await page.reload();
  await expect(page.locator('#battle')).toBeVisible();
}

const names = (page: Page) => page.locator('#draftTeam .slot-body > b').allTextContents();

test('fighting-stage lineup changes persist after reopening the arena', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openRun(page);
  const before = await names(page);
  await page.locator('[data-shift="down"][data-i="0"]').click();
  const expected = [before[1]!, before[0]!, ...before.slice(2)];
  await expect.poll(() => names(page)).toEqual(expected);
  await expect(page.locator('#fight')).toBeEnabled();
  await expect(page.locator('#toast')).not.toContainText('阶段错误');
  await page.reload();
  await expect.poll(() => names(page)).toEqual(expected);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).arena.activeDraft.stage)).toBe('fighting');
  expect(errors).toEqual([]);
});

test('slow reorder blocks repeat moves and battle start until acknowledged', async ({ page }) => {
  await openRun(page);
  const before = await names(page);
  await page.evaluate(async () => {
    const path = '/src/meta/gateway/index.ts';
    const { metaGateway } = await import(path) as typeof import('../../src/meta/gateway');
    const transport = (metaGateway() as unknown as { transport: import('../../src/meta/gateway').MetaTransport }).transport;
    const send = transport.send.bind(transport);
    transport.send = async command => {
      const reply = await send(command);
      if (command.type === 'arrangeDraftTeam') {
        document.documentElement.dataset.reorderCalls = String(Number(document.documentElement.dataset.reorderCalls ?? 0) + 1);
        await new Promise<void>(resolve => { (window as unknown as { releaseOrder: () => void }).releaseOrder = resolve; });
      }
      return reply;
    };
  });
  await page.locator('[data-shift="down"][data-i="0"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-reorder-calls', '1');
  await expect(page.locator('#fight')).toBeDisabled();
  await expect(page.locator('#clearDraft')).toBeDisabled();
  await expect(page.locator('#draftTeam button:enabled')).toHaveCount(0);
  // Even programmatically dispatched clicks must respect the in-flight guard.
  await page.locator('[data-shift="down"][data-i="0"]').dispatchEvent('click');
  await page.locator('#fight').dispatchEvent('click');
  await expect(page.locator('html')).toHaveAttribute('data-reorder-calls', '1');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).pendingBattle)).toBeNull();
  await page.evaluate(() => { (window as unknown as { releaseOrder: () => void }).releaseOrder(); });
  await expect(page.locator('#fight')).toBeEnabled();
  await expect.poll(() => names(page)).toEqual([before[1]!, before[0]!, ...before.slice(2)]);
});

for (const committed of [false, true]) {
  test(`transport error ${committed ? 'after' : 'before'} saving restores authoritative lineup`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await openRun(page);
    const before = await names(page);
    await page.evaluate(async committed => {
      const path = '/src/meta/gateway/index.ts';
      const { metaGateway } = await import(path) as typeof import('../../src/meta/gateway');
      const transport = (metaGateway() as unknown as { transport: import('../../src/meta/gateway').MetaTransport }).transport;
      const send = transport.send.bind(transport);
      transport.send = async command => {
        if (command.type === 'arrangeDraftTeam') {
          transport.send = send;
          if (committed) await send(command);
          throw new Error('simulated connection interruption');
        }
        return send(command);
      };
    }, committed);
    await page.locator('[data-shift="down"][data-i="0"]').click();
    await expect(page.locator('#toast')).toContainText('站位保存未确认');
    await expect(page.locator('#fight')).toBeEnabled();
    const expected = committed ? [before[1]!, before[0]!, ...before.slice(2)] : before;
    await expect.poll(() => names(page)).toEqual(expected);
    await page.reload();
    await expect.poll(() => names(page)).toEqual(expected);
    expect(errors).toEqual([]);
  });
}

test('a competing tab starting a battle rejects reorder and restores the saved order', async ({ page }) => {
  await openRun(page);
  const before = await names(page);
  const requestId = await page.evaluate(async () => {
    const path = '/src/meta/gateway/index.ts';
    const { metaGateway, CommandGateway } = await import(path) as typeof import('../../src/meta/gateway');
    const transport = (metaGateway() as unknown as { transport: import('../../src/meta/gateway').MetaTransport }).transport;
    const other = new CommandGateway(transport);
    await other.load();
    const ticket = await other.planArenaBattle();
    if (!ticket.ok) throw new Error(ticket.message);
    return ticket.request.requestId;
  });
  await page.locator('[data-shift="down"][data-i="0"]').click();
  await expect(page.locator('#toast')).toContainText('本场战斗尚未结算');
  await expect.poll(() => names(page)).toEqual(before);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).pendingBattle.requestId)).toBe(requestId);
});
