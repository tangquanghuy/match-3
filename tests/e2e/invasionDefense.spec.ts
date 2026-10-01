import { test, expect } from '@playwright/test';

for (const width of [1600, 390, 320]) {
  test(`${width}px 独立防守编队、保存刷新和移动布局`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/game.html#invasion');
    await expect(page.locator('.inv-rival')).toHaveCount(3);
    await expect.poll(() => page.evaluate(() => !!JSON.parse(localStorage.getItem('gems.meta.save')!).invasion.defenseTeam)).toBe(true);
    const original = await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
      const original = { members: save.teams[0].members, active: save.activeTeamIndex };
      save.teams.push({ ...structuredClone(save.teams[0]), name: '北境守军', members: [...save.teams[0].members].reverse() });
      save.teams.push({ name: '未完成队伍', members: [], bannerKingdomId: null });
      localStorage.setItem('gems.meta.save', JSON.stringify(save));
      return original;
    });
    await page.reload();
    await page.locator('.inv-hub-links a[href="#invasion/defense"]').click();
    await expect(page.getByRole('heading', { name: '领地防守' })).toBeVisible();
    await expect(page.locator('[data-defense-preview]:visible .inv-defense-lineup > li')).toHaveCount(4);
    await expect(page.locator('.inv-defense-history, .inv-defense-stats')).toHaveCount(0);
    await expect(page.locator('#invasionDefensePreset option[value="2"]')).toBeDisabled();
    await page.locator('#invasionDefensePreset').selectOption('1');
    await expect(page.locator('[data-defense-preview="1"]')).toBeVisible();
    await expect(page.locator('[data-defense-preview="0"]')).toBeHidden();
    await page.locator('[data-deploy-defense]').click();
    await expect(page.locator('[data-defense-name]')).toHaveText('北境守军');
    const deployed = await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!));
    expect(deployed.activeTeamIndex).toBe(original.active);
    expect(deployed.teams[0].members).toEqual(original.members);
    expect(deployed.invasion.defenseTeam.members).toEqual([...original.members].reverse());
    await page.reload();
    await expect(page.locator('[data-defense-name]')).toHaveText('北境守军');
    await expect(page.locator('[data-defense-preview]:visible')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `artifacts/invasion-defense-${width}.png`, fullPage: true });
    await page.locator('[data-defense-log-link]').click();
    await expect(page.getByRole('heading', { name: '防守记录' })).toBeVisible();
    await expect(page.locator('.inv-defense-history')).toContainText('暂无被入侵记录');
    await page.locator('[data-refresh-defense]').click();
    await expect(page.locator('[data-refresh-defense]')).toBeEnabled();
    await page.locator('.inv-subnav a').first().click();
    await expect(page.locator('[data-defense-name]')).toHaveText('北境守军');
    await page.locator('.inv-subnav a[href="#invasion"]').click();
    await expect(page.locator('.inv-rival')).toHaveCount(3);
    expect(errors).toEqual([]);
  });
}

test('防守战报胜负视角、转义、刷新失败保留旧记录', async ({ page }) => {
  await page.goto('/game.html#invasion');
  await expect(page.locator('.inv-rival')).toHaveCount(3);
  await page.evaluate(async () => {
    const path = '/src/meta/gateway/index.ts';
    const module = await import(/* @vite-ignore */ path);
    const gateway = module.metaGateway();
    await gateway.syncInvasionDefense();
    const s = structuredClone(gateway.current());
    s.invasion.defenseLog = { fetchedAt: Date.now(), weekStart: s.invasion.weekStart,
      total: 12, wins: 7, weeklyTotal: 3, weeklyWins: 2,
      entries: [
        { id: 'one', defender: 'd', attacker: 'a', name: '<img src=x onerror=alert(1)>', at: Date.now(), defenderWon: true, surrendered: true, frenzy: false },
        { id: 'two', defender: 'd', attacker: 'b', name: '入侵者乙', at: Date.now() - 1000, defenderWon: false, surrendered: false, frenzy: true },
      ] };
    await gateway.dev.importSaveJson(JSON.stringify(s));
    gateway.syncInvasionDefense = async () => { throw new Error('fixture storage outage'); };
  });
  await page.locator('.inv-hub-links a[href="#invasion/defense"]').click();
  await page.locator('[data-defense-log-link]').click();
  await expect(page.locator('.inv-defense-event')).toHaveCount(2);
  await expect(page.locator('.inv-defense-event').first()).toContainText('防守成功');
  await expect(page.locator('.inv-defense-event').first()).toContainText('对手认输／离场');
  await expect(page.locator('.inv-defense-event').last()).toContainText('防守失利');
  await expect(page.locator('.inv-defense-event').last()).toContainText('血怒镜像');
  await expect(page.locator('.inv-defense-event img')).toHaveCount(0);
  await expect(page.locator('.inv-defense-event').first()).toContainText('<img src=x onerror=alert(1)>');
  await page.locator('[data-refresh-defense]').click();
  await expect(page.locator('.inv-defense-event')).toHaveCount(2);
  await expect(page.locator('[data-refresh-defense]')).toBeEnabled();
});


for (const width of [1600, 390, 320]) {
  test(`${width}px 防守宝库领取、金币提示、战报筛选和真实复仇签票`, async ({ page }) => {
    test.setTimeout(60000);
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/game.html#invasion');
    await expect(page.locator('.inv-rival')).toHaveCount(3);
    const initial = await page.evaluate(async () => {
      const gatewayPath = '/src/meta/gateway/index.ts';
      const poolPath = '/src/meta/server/mirrorPool.ts';
      const defensePath = '/src/meta/systems/invasionDefense.ts';
      const { metaGateway } = await import(/* @vite-ignore */ gatewayPath);
      const { MemoryMirrorStore, mirrorOwnerKey } = await import(/* @vite-ignore */ poolPath);
      const { defenseRecord } = await import(/* @vite-ignore */ defensePath);
      const gateway = metaGateway();
      await gateway.syncInvasionSeason();
      await gateway.syncInvasionDefense();
      const store = new MemoryMirrorStore();
      // Only the shared storage is replaced: UI -> gateway -> host -> core remains real.
      gateway.transport.host.options.mirrorPool = store.forOwner('defender', '守卫者');
      const attack = store.forOwner('attacker', '北境来袭者');
      const now = gateway.now();
      const snapshot = defenseRecord(gateway.current(), now);
      const common = { defender: mirrorOwnerKey('defender'), at: now, surrendered: false, frenzy: false, attackerSnapshot: snapshot };
      await attack.recordDefense({ ...common, id: 'win', defenderWon: true });
      await attack.recordDefense({ ...common, id: 'loss', defenderWon: false });
      await gateway.syncInvasionDefense();
      return { gold: gateway.current().currencies.gold, souls: gateway.current().currencies.souls, glory: gateway.current().currencies.glory };
    });
    await page.locator('.inv-hub-links a[href="#invasion/defense"]').click();
    await expect(page.locator('[data-claim-defense]')).toBeEnabled();
    await expect(page.locator('.inv-defense-treasury .defense-floating-coin')).toHaveCount(3);
    await expect(page.locator('.inv-defense-resources b')).toHaveText(['100', '10', '2']);
    await expect(page.locator('.inv-defense-event, .inv-defense-stats')).toHaveCount(0);
    const layout = await page.locator('.inv-defense-treasury-copy').boundingBox();
    expect(layout!.width).toBeGreaterThan(width < 600 ? 130 : 300);
    expect(layout!.height).toBeLessThan(160);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `artifacts/invasion-defense-rewards-${width}.png`, fullPage: true });
    await page.locator('[data-defense-log-link]').click();
    await expect(page.locator('.inv-defense-event')).toHaveCount(2);
    await expect(page.locator('.inv-defense-event .inv-defense-vp')).toHaveText(['+2 VP', '-2 VP']);
    await page.screenshot({ path: `artifacts/invasion-defense-log-${width}.png`, fullPage: true });
    await page.locator('[data-defense-filter="revenge"]').click();
    await expect(page.locator('.inv-defense-event:visible')).toHaveCount(1);
    await expect(page.locator('[data-revenge]')).toBeVisible();
    await page.locator('[data-defense-filter="all"]').click();
    await page.evaluate(() => { location.hash = '#map'; });
    await expect(page.locator('#railInvasion')).toHaveClass(/has-defense-reward/);
    await expect(page.locator('#railInvasionCopy')).toHaveText('防守奖励可领取');
    await expect(page.locator('[data-defense-coin]')).toBeAttached();
    await page.locator('#railInvasion').click();
    await expect(page.locator('[data-claim-defense]')).toBeEnabled();
    await page.locator('[data-claim-defense]').click();
    await expect(page.locator('[data-claim-defense]')).toBeDisabled();
    await expect(page.locator('.inv-defense-resources b')).toHaveText(['0', '0', '0']);
    await expect(page.locator('.inv-defense-treasury .defense-floating-coin')).toHaveCount(0);
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).currencies);
    expect(after.gold).toBe(initial.gold + 100); expect(after.souls).toBe(initial.souls + 10); expect(after.glory).toBe(initial.glory + 2);
    await page.locator('[data-defense-log-link]').click();
    await page.locator('[data-revenge]').click();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).pendingBattle?.revengeKey)).toContain(':loss');
    expect(errors).toEqual([]);
  });
}

for (const [width, height] of [[1600, 900], [1366, 768], [390, 667], [320, 568], [844, 390]]) {
  test(`${width}×${height} 防守底部操作和末条记录可滚动到达且无遮挡`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/game.html#invasion/defense');
    const deploy = page.locator('[data-deploy-defense]');
    await expect(deploy).toBeVisible();
    await deploy.scrollIntoViewIfNeeded();
    const buttonVisible = await deploy.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return [rect.top + 2, rect.bottom - 2].every(y => el.contains(document.elementFromPoint(rect.x + rect.width / 2, y)));
    });
    expect(buttonVisible).toBe(true);
    const footer = await page.locator('.bottom-bar').boundingBox();
    const bounds = await deploy.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(footer!.y);
    await page.screenshot({ path: `artifacts/invasion-defense-bottom-${width}-${height}.png`, fullPage: true });
    await page.evaluate(async () => {
      const path = '/src/meta/gateway/index.ts';
      const { metaGateway } = await import(/* @vite-ignore */ path);
      const gateway = metaGateway();
      await gateway.syncInvasionDefense();
      const save = structuredClone(gateway.current());
      save.invasion.defenseLog = {
        fetchedAt: Date.now(), weekStart: save.invasion.weekStart, total: 50, wins: 50, weeklyTotal: 50, weeklyWins: 50,
        entries: Array.from({ length: 50 }, (_, i) => ({ id: `row${i}`, defender: 'd', attacker: `a${i}`, name: `来袭者 ${i + 1}`, at: Date.now() - i * 1000, defenderWon: true, surrendered: false, frenzy: false }))
      };
      await gateway.dev.importSaveJson(JSON.stringify(save));
      gateway.syncInvasionDefense = async () => { throw new Error('fixture storage outage'); };
    });
    await page.locator('[data-defense-log-link]').click();
    const last = page.locator('.inv-defense-event').last();
    await expect(last).toContainText('来袭者 50');
    await last.scrollIntoViewIfNeeded();
    expect(await last.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.bottom - 2));
    })).toBe(true);
    const row = await last.boundingBox();
    expect(row!.y + row!.height).toBeLessThanOrEqual(footer!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: `artifacts/invasion-defense-log-bottom-${width}-${height}.png`, fullPage: true });
    await page.locator('[data-defense-filter="revenge"]').click();
    await expect(page.locator('[data-defense-filter-empty]')).toBeVisible();
    await expect(page.locator('.inv-defense-event:visible')).toHaveCount(0);
  });
}
