import { expect, test } from '@playwright/test';

for (const mode of ['normal', 'hard', 'veryHard'] as const) {
  test(`${mode}: 存档序号落后时通关，页面与刷新后都保持已通关`, async ({ page }) => {
    await page.goto('/game.html#map');
    await expect(page.locator('.bottom-bar')).toBeVisible({ timeout: 20_000 });
    // 协议集成夹具：真实签票/结算/落盘；不模拟完整战斗操作。
    const stage = await page.evaluate(async selectedMode => {
      const gatewayPath = '/src/meta/gateway/index.ts';
      const kingdomPath = '/src/meta/data/kingdoms.ts';
      const { metaGateway, CommandGateway } = await import(gatewayPath) as typeof import('../../src/meta/gateway');
      const { allKingdoms } = await import(kingdomPath) as typeof import('../../src/meta/data/kingdoms');
      const player = metaGateway();
      if (selectedMode !== 'normal') {
        // Difficulty 4 is now locked until earned. Seed an eligible account, not a failed mutation.
        const fixture = JSON.parse(player.exportSaveJson());
        fixture.kingdoms[allKingdoms()[0]!].exploreUnlockedTier = 4;
        if (!player.dev) throw new Error('Expected local test gateway');
        await player.dev.importSaveJson(JSON.stringify(fixture));
      }
      const transport = (player as unknown as { transport: import('../../src/meta/gateway').MetaTransport }).transport;
      const other = new CommandGateway(transport);
      await other.load();
      const home = allKingdoms()[0]!;
      const kingdom = selectedMode === 'normal' ? allKingdoms()[2]! : home;
      const node = selectedMode === 'normal' ? player.current().kingdoms[kingdom]!.questsDone + 1 : 1;
      const changed = await other.setKingdomExploreTier(home, selectedMode === 'veryHard' ? 4 : 1);
      if (typeof changed.result !== 'number') throw new Error(changed.result.message);
      if (player.current().revision >= other.current().revision) throw new Error('夹具未制造存档序号差');
      const ticket = selectedMode === 'normal'
        ? await player.planQuestBattle(kingdom, node)
        : await player.planExploreBattle(kingdom);
      if (!ticket.ok) throw new Error(ticket.message);
      const result = await player.settleBattle({
        schemaVersion: 1, battleId: ticket.request.battleId, requestId: ticket.request.requestId,
        rulesetVersion: ticket.request.rulesetVersion, seed: ticket.request.seed, winner: 'player',
        turns: 3, combatants: [], defeatedExternalIds: [], summonedCount: 0,
        actionLogDigest: '', eventSummary: [],
      });
      if (!result.result.ok) throw new Error(result.result.message);
      const suffix = selectedMode === 'normal' ? '' : `/${selectedMode.toLowerCase()}`;
      location.hash = `#quest/${encodeURIComponent(kingdom)}${suffix}`;
      return { node, kingdom };
    }, mode);

    for (const reload of [false, true]) {
      if (reload) await page.reload();
      if (mode !== 'normal') {
        // Explore is now a six-battle run: one victory advances it, not a completed tier.
        await expect(page.locator('.explore-screen')).toBeVisible();
        await expect(page.locator('.ex-route li.done')).toHaveCount(1);
        await expect(page.locator('.ex-first-clear')).toHaveAttribute('data-first-clear', 'available');
        continue;
      }
      await expect(page.locator('.quest-map')).toHaveAttribute('data-mode', mode);
      const cleared = page.locator(`.qpin[data-node="${stage.node}"]`);
      await expect(cleared).toHaveClass(/\bdone\b/);
      await expect(cleared).toHaveAttribute('aria-label', /已通关/);
      await cleared.click();
      await expect(page.locator('#qdRewards .qfirst-clear')).toHaveText('首通已完成');
      await expect(page.locator(`.qpin[data-node="${stage.node + 1}"]`)).not.toHaveClass(/\bdone\b/);
    }
    if (mode !== 'normal') {
      await page.evaluate(async kingdom => {
        const path = '/src/meta/gateway/index.ts';
        const { metaGateway } = await import(path) as typeof import('../../src/meta/gateway');
        const player = metaGateway();
        for (let round = 1; round < 6; round++) {
          const ticket = await player.planExploreBattle(kingdom);
          if (!ticket.ok) throw new Error(ticket.message);
          const outcome = await player.settleBattle({
            schemaVersion: 1, battleId: ticket.request.battleId, requestId: ticket.request.requestId,
            rulesetVersion: ticket.request.rulesetVersion, seed: ticket.request.seed, winner: 'player',
            turns: 3, combatants: [], defeatedExternalIds: [], summonedCount: 0,
            actionLogDigest: '', eventSummary: [],
          });
          if (!outcome.result.ok) throw new Error(outcome.result.message);
        }
        location.hash = '#map';
      }, stage.kingdom);
      await expect(page.locator('.explore-screen')).toHaveCount(0);
      await page.evaluate(kingdom => { location.hash = `#explore/${encodeURIComponent(kingdom)}`; }, stage.kingdom);
      for (const reload of [false, true]) {
        if (reload) await page.reload();
        await expect(page.locator('.ex-first-clear')).toHaveAttribute('data-first-clear', 'completed');
        await expect(page.locator('.ex-first-clear')).toHaveText('首通已完成');
        await expect(page.locator('#exploreFight')).toHaveText(/开始探索/);
      }
    }
  });
}


test('slow planning and a double click create one ticket and the visible battle settles', async ({ page }) => {
  test.setTimeout(60_000);
  await page.route('**/fonts.googleapis.com/**', route => route.abort());
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/game.html#quest/${encodeURIComponent('破碎尖塔')}`);
  await expect(page.locator('.quest-map')).toBeVisible({ timeout: 20_000 });
  // The demo save starts with this kingdom cleared. Open a real, playable quest in this local fixture.
  await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
    save.kingdoms['破碎尖塔'].questsDone = 0;
    localStorage.setItem('gems.meta.save', JSON.stringify(save));
  });
  await page.reload();
  await expect(page.locator('#questFight')).toBeEnabled();
  await page.evaluate(async () => {
    const path = '/src/meta/gateway/index.ts';
    const { metaGateway } = await import(path) as typeof import('../../src/meta/gateway');
    const gateway = metaGateway();
    const transport = (gateway as unknown as { transport: import('../../src/meta/gateway').MetaTransport }).transport;
    const original = transport.send.bind(transport);
    // Delay after authoritative commit, as a slow HTTP response would. Keep the real host/renderer/settlement.
    transport.send = async command => {
      const reply = await original(command);
      if (command.type === 'planQuestBattle') {
        document.documentElement.dataset.planRequests = String(Number(document.documentElement.dataset.planRequests ?? 0) + 1);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return reply;
    };
    const fight = document.querySelector<HTMLButtonElement>('#questFight')!;
    fight.click();
    fight.click();
  });
  await expect(page.locator('#battle-root .battle-settings-button')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('html')).toHaveAttribute('data-plan-requests', '1');
  await page.getByRole('button', { name: '战斗设置', exact: true }).click();
  await page.getByRole('button', { name: '放弃本局', exact: true }).click();
  await page.getByRole('button', { name: '确认放弃', exact: true }).click();
  await expect(page.locator('.result-screen')).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).pendingBattle)).toBeNull();
  expect(errors).toEqual([]);
});
