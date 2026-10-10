import { expect, test, type Locator, type Page } from '@playwright/test';

type BattleWindow = Window & {
  __app: {
    getEngine(): {
      getState(): {
        teams: Record<'Left' | 'Right', {
          characters: Array<{
            manaCost: number;
            statuses: Array<{ id: string; turns: number; magnitude?: number }>;
          }>;
        }>;
      };
    };
    setAllManaCost(value: number): void;
  };
};

// External font availability must not block navigation or battle startup in E2E.
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
});

/** 独立战斗固定 4v4（3v3 已废除）。 */
async function openBattle(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto('/index.html');
  await page.waitForFunction(() => (
    !!(window as unknown as BattleWindow).__app
    && document.querySelectorAll('.gcard').length === 8
  ));
}

async function addStatuses(page: Page, count: number): Promise<void> {
  await page.evaluate((amount) => {
    const app = (window as unknown as BattleWindow).__app;
    const character = app.getEngine().getState().teams.Left.characters[0];
    const statuses = [
      { id: 'poison', turns: 3, magnitude: 2 },
      { id: 'web', turns: 4 },
      { id: 'bleed', turns: 2, magnitude: 1 },
    ];
    character.statuses.splice(0, character.statuses.length, ...statuses.slice(0, amount));
    app.setAllManaCost(character.manaCost);
  }, count);
}

async function cardGeometry(card: Locator) {
  return card.evaluate((element) => {
    const root = element as HTMLElement;
    const cardRect = root.getBoundingClientRect();
    const rectOf = (selector: string) => {
      const node = root.querySelector<HTMLElement>(selector);
      if (!node) throw new Error(`缺少卡面节点 ${selector}`);
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    };
    const isVisible = (node: HTMLElement) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };

    const attack = rectOf('.c-bl .stat');
    const vitals = rectOf('.c-br .stat');
    const manaGem = rectOf('.gem');
    const magic = rectOf('.magic');
    const traitRow = root.querySelector<HTMLElement>('.trait-row');
    const transientOrRejected = [...root.querySelectorAll<HTMLElement>(
      '.name-band,.name-flash,.mana-num,.vital-stack,[data-stat="armor"],[data-stat="health"]',
    )].filter(isVisible);
    const insideCard = (rect: { left: number; top: number; right: number; bottom: number }) => (
      rect.left >= cardRect.left - 0.5 && rect.right <= cardRect.right + 0.5
      && rect.top >= cardRect.top - 0.5 && rect.bottom <= cardRect.bottom + 0.5
    );

    return {
      attack,
      vitals,
      manaGem,
      magic,
      anchorsInside: [attack, vitals, manaGem, magic].every(insideCard),
      attackOnLeft: attack.right < cardRect.left + cardRect.width * 0.52,
      vitalsOnRight: vitals.left > cardRect.left + cardRect.width * 0.48,
      manaTopLeft: manaGem.left <= cardRect.left + 3 && manaGem.top <= cardRect.top + 3,
      magicTopRight: magic.right >= cardRect.right - 3 && magic.top <= cardRect.top + 3,
      magicValue: root.querySelector<HTMLElement>('.magic-v')?.textContent ?? '',
      traitCount: traitRow?.querySelectorAll('.trait-badge').length ?? 0,
      rejectedVisibleCount: transientOrRejected.length,
    };
  });
}

async function expectRestoredCard(card: Locator): Promise<void> {
  const layout = await cardGeometry(card);
  expect(layout.anchorsInside).toBe(true);
  expect(layout.attackOnLeft).toBe(true);
  expect(layout.vitalsOnRight).toBe(true);
  expect(layout.manaTopLeft).toBe(true);
  expect(layout.magicTopRight).toBe(true);
  expect(Number(layout.magicValue)).toBeGreaterThanOrEqual(0);
  expect(layout.traitCount).toBeGreaterThan(0);
  expect(layout.rejectedVisibleCount).toBe(0);
}

test('667x375 4v4 aggregates statuses without covering the character art', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 });
  await openBattle(page);

  const cards = page.locator('.gcard');
  await expect(cards).toHaveCount(8);
  await expectRestoredCard(cards.first());
  // 宝石上写「当前/上限」（GoW 法力球读法），不弹说明浮层
  await expect(cards.first().locator('.gem-mana')).toHaveText(/^\d+\/\d+$/);
  await cards.first().locator('.gem').hover();
  await expect(page.locator('.status-tooltip')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  await addStatuses(page, 3);
  const summary = cards.first().locator('.status-more');
  await expect(summary).toHaveText('+3');
  await expect(cards.first().locator('.status-badge')).toHaveCount(0);
  expect((await summary.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(23.5);
  await expectRestoredCard(cards.first());
  const traits = await cards.first().evaluate((el) => {
    const icons = [...el.querySelectorAll('.trait-badge')].map((node) => node.getBoundingClientRect());
    const more = el.querySelector('.status-more')!.getBoundingClientRect();
    return { icons: icons.map((r) => ({ x: r.x, y: r.y, right: r.right })), moreLeft: more.left };
  });
  expect(traits.icons.length).toBeGreaterThanOrEqual(2);
  expect(Math.abs(traits.icons[0].x - traits.icons[1].x)).toBeLessThan(2);
  expect(traits.icons[1].y).toBeGreaterThan(traits.icons[0].y);
  expect(Math.max(...traits.icons.map((icon) => icon.right))).toBeLessThanOrEqual(traits.moreLeft + 1);
  await page.mouse.move(660, 360);
  await page.screenshot({ path: 'artifacts/ux-phase-b/shots/battle-card-restored-4v4-667x375.png' });
});

test('portrait battle keeps compact status icons and no dotted enchanted ellipse', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBattle(page);
  await addStatuses(page, 3);
  const card = page.locator('.gcard.ally').first();
  const badges = card.locator('.status-badge');
  await expect.poll(() => badges.count()).toBeGreaterThanOrEqual(1);
  const count = await badges.count();
  expect(count).toBeLessThanOrEqual(2);
  await expect(card.locator('.status-more')).toHaveText(`+${3 - count}`);
  const sizes = await card.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const badge = el.querySelector('.status-badge')!.getBoundingClientRect();
    const more = el.querySelector('.status-more')!.getBoundingClientRect();
    return { cardRight: rect.right, badgeRight: badge.right, moreRight: more.right, badgeWidth: badge.width };
  });
  expect(sizes.badgeWidth).toBeLessThanOrEqual(17);
  expect(sizes.badgeRight).toBeLessThanOrEqual(sizes.cardRight + 1);
  expect(sizes.moreRight).toBeLessThanOrEqual(sizes.cardRight + 1);
  const layout = await card.evaluate((el) => {
    const badge = el.querySelector('.status-badge')!.getBoundingClientRect();
    const more = el.querySelector('.status-more')!.getBoundingClientRect();
    const traits = Array.from(el.querySelectorAll('.trait-badge')).map((node) => node.getBoundingClientRect());
    return { badgeTop: badge.top, moreTop: more.top, moreLeft: more.left, badgeRight: badge.right,
      traits: traits.map((r) => ({ x: r.x, y: r.y })) };
  });
  expect(Math.abs(layout.badgeTop - layout.moreTop)).toBeLessThan(2);
  expect(layout.moreLeft).toBeGreaterThanOrEqual(layout.badgeRight - 1);
  expect(layout.traits.length).toBeGreaterThanOrEqual(2);
  expect(Math.abs(layout.traits[0].x - layout.traits[1].x)).toBeLessThan(2);
  expect(layout.traits[1].y).toBeGreaterThan(layout.traits[0].y);
  await page.screenshot({ path: 'artifacts/ux-phase-b/shots/battle-card-portrait-390x844.png' });
  await page.evaluate(() => {
    const card = document.querySelector('.gcard.ally');
    card?.classList.add('status-accent-enchanted');
  });
  await expect(card.locator('.status-accent-layer')).toHaveCSS('opacity', '1');
  const style = await card.locator('.status-accent-layer').evaluate((el) => getComputedStyle(el, '::before').borderTopStyle);
  expect(style).toBe('solid');
  await card.evaluate((el) => {
    el.classList.remove('status-accent-enchanted');
    el.classList.add('status-accent-curse');
  });
  const curseStyle = await card.locator('.status-accent-layer').evaluate((el) => getComputedStyle(el, '::before').borderTopStyle);
  expect(curseStyle).toBe('solid');
});

test('portrait bleed badge leaves its icon visible while still showing stacked counts', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openBattle(page);
  const setBleed = (stacks: number) => page.evaluate((value) => {
    const app = (window as unknown as BattleWindow).__app;
    const character = app.getEngine().getState().teams.Left.characters[0];
    character.statuses.splice(0, character.statuses.length, { id: 'bleed', turns: 3, magnitude: value });
    app.setAllManaCost(character.manaCost);
  }, stacks);
  const card = page.locator('.gcard.ally').first();
  await setBleed(1);
  const badge = card.locator('.status-badge[data-status-id="bleed"]');
  await expect(badge).toBeVisible();
  await expect(badge.locator('img')).toBeVisible();
  await expect(badge).toHaveAttribute('aria-label', /1 ?/);
  await expect(badge.locator('.sb-turns')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/ux-phase-b/shots/bleed-single-390x844.png' });

  await setBleed(3);
  const count = badge.locator('.sb-turns');
  await expect(count).toHaveText('3');
  await expect(badge).toHaveAttribute('aria-label', /3 ?/);
  const sizes = await badge.evaluate((el) => {
    const icon = el.querySelector('img')!.getBoundingClientRect();
    const number = el.querySelector('.sb-turns')!.getBoundingClientRect();
    const frame = el.getBoundingClientRect();
    return { iconWidth: icon.width, countWidth: number.width, countHeight: number.height,
      countRight: number.right, frameRight: frame.right };
  });
  expect(sizes.countWidth).toBeLessThan(sizes.iconWidth * 0.7);
  expect(sizes.countHeight).toBeLessThan(sizes.iconWidth * 0.7);
  expect(sizes.countRight).toBeGreaterThan(sizes.frameRight - 1);
  await page.screenshot({ path: 'artifacts/ux-phase-b/shots/bleed-stacked-390x844.png' });
});

test('desktop battle cards keep magic and traits without the rejected name or mana rows', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openBattle(page);

  const cards = page.locator('.gcard');
  await expect(cards).toHaveCount(8);
  await expectRestoredCard(cards.first());
  await expect(cards.locator('.magic')).toHaveCount(8);
  await expect(cards.locator('.trait-row')).toHaveCount(8);
  await expect(cards.locator('.name-band,.name-flash,.mana-num')).toHaveCount(0);
  await page.screenshot({ path: 'artifacts/ux-phase-b/shots/battle-card-restored-desktop.png' });
});

// —— 部队详情窗 / 施法演出（lane A）——

type LaneWindow = Window & {
  __app: {
    getEngine(): { getState(): {
      activePlayer: string;
      state: string;
      teams: Record<'Left' | 'Right', { characters: Array<{ id: number; mana: number; manaCost: number; skillId: string }> }>;
    } };
    fillAllMana(): void;
    getAllyIds(): number[];
    triggerCast(id: number): Promise<void>;
    startupPlaying: boolean;
    casting: boolean;
    visualPlaying: boolean;
    player: { isPlaying(): boolean };
    onEventsProduced: ((events: Array<{ type: string; characterId?: number }>) => void) | null;
    playEventsWithTail(events: unknown[]): Promise<void>;
  };
  __casts: number[];
};

async function openStandalone(page: Page, quick: boolean, viewport = { width: 1440, height: 900 }): Promise<void> {
  await page.setViewportSize(viewport);
  await page.addInitScript((q) => {
    window.localStorage.setItem('battle.gestureHintShown', '1');
    window.localStorage.setItem('battle.skipCastConfirm', q ? '1' : '0');
  }, quick);
  await page.goto('/index.html');
  await page.waitForFunction(() => {
    const app = (window as unknown as LaneWindow).__app;
    return !!app && document.querySelectorAll('.gcard').length === 8 && !app.startupPlaying;
  }, undefined, { timeout: 30_000 });
  await page.evaluate(() => {
    const w = window as unknown as LaneWindow;
    w.__casts = [];
    // 只记我方施放：敌方 AI 现在也会放技能（满法力时），不属于这些用例要断言的玩家操作
    const allies = new Set(w.__app.getAllyIds());
    w.__app.onEventsProduced = (events) => {
      for (const e of events) {
        if (e.type === 'skill-cast' && e.characterId !== undefined && allies.has(e.characterId)) w.__casts.push(e.characterId);
      }
    };
  });
}

async function tap(page: Page, id: number, holdMs = 60): Promise<void> {
  const box = await page.getByTestId(`card-${id}`).boundingBox();
  if (!box) throw new Error(`card-${id} 无边界`);
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.waitForTimeout(holdMs);
  await page.mouse.up();
}

const castButton = (page: Page) => page.locator('.usw.open [data-testid="unit-sheet-cast"]');

test('unit window fans across the troop columns, keeps exposed cards tappable, and badges open details', async ({ page }) => {
  await openStandalone(page, false);
  // 点法力宝石（最显眼的位置）也是卡片动作
  await page.getByTestId('card-1').locator('.gem').click();
  const sheet = page.locator('.usw.open');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('data-char-id', '1');
  const geo = await page.evaluate(() => {
    const r = document.querySelector('.usw')!.getBoundingClientRect();
    const cols = [...document.querySelectorAll('.gcol')].map((c) => c.getBoundingClientRect());
    return { left: r.left, right: r.right, allyRight: cols[0].right, enemyLeft: cols[1].left };
  });
  expect(geo.left).toBeLessThan(geo.allyRight);
  expect(geo.right).toBeGreaterThan(geo.enemyLeft);
  // 未遮挡的敌方宝石仍可切换内容；同一张再点收起。
  await page.getByTestId('card-4').locator('.gem').click();
  await expect(sheet).toHaveAttribute('data-char-id', '4');
  await page.getByTestId('card-4').locator('.gem').click();
  await expect(page.locator('.usw.open')).toHaveCount(0);
  // 默认模式下长按与点按相同：不画进度环
  const box = await page.getByTestId('card-0').boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150);
  await expect(page.getByTestId('card-0')).not.toHaveClass(/pressing/);
  await page.waitForTimeout(450);
  await page.mouse.up();
  await expect(sheet).toHaveAttribute('data-char-id', '0');
  await page.getByRole('button', { name: '关闭详情' }).click();
  await expect(page.locator('.usw.open')).toHaveCount(0);
  // 点详情窗以外的任意位置（这里是页面左上角空白）也能关闭
  await tap(page, 2);
  await expect(sheet).toHaveAttribute('data-char-id', '2');
  await page.mouse.click(4, 4);
  await expect(page.locator('.usw.open')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as LaneWindow).__casts)).toEqual([]);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 844, height: 390 }, { width: 667, height: 375 }]) {
  test(`unit window keeps a compact fan with broad switch targets at ${viewport.width}`, async ({ page }) => {
    await openStandalone(page, false, viewport);
    await page.getByTestId('card-1').locator('.gem').click();
    const sheet = page.locator('.usw.open');
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(400);
    for (const pane of ['spell', 'traits']) {
      const geometry = await sheet.evaluate((root, name) => {
        const center = root.querySelector<HTMLElement>('[data-pos="center"]')!.getBoundingClientRect();
        const side = root.querySelector<HTMLElement>(`[data-pane="${name}"]`)!;
        const r = side.getBoundingClientRect();
        const left = side.dataset.pos === 'left';
        const exposed = left ? center.left - r.left : r.right - center.right;
        const x = left ? (r.left + center.left) / 2 : (center.right + r.right) / 2;
        const y = r.top + r.height / 2;
        return {
          exposed, ratio: exposed / r.width, x, y,
          hit: document.elementFromPoint(x, y)?.closest('.usw-pane') === side,
          inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight,
        };
      }, pane);
      // 有足够的触屏点击区，同时仍遮住约半张侧卡，防止回退成三卡并排。
      expect(geometry.exposed).toBeGreaterThan(44);
      expect(geometry.ratio).toBeGreaterThan(.4);
      expect(geometry.ratio).toBeLessThan(.6);
      expect(geometry.hit).toBe(true);
      expect(geometry.inside).toBe(true);
      await page.mouse.click(geometry.x, geometry.y);
      await expect(sheet.locator(`[data-pane="${pane}"]`)).toHaveAttribute('data-pos', 'center');
      await page.waitForTimeout(400);
    }
    const portrait = sheet.locator('[data-pane="portrait"]');
    await portrait.focus();
    await page.keyboard.press('Enter');
    await expect(portrait).toHaveAttribute('data-pos', 'center');
    await page.waitForTimeout(400);
    await page.screenshot({ path: `artifacts/battle-details-refined-${viewport.width}.png` });
    await page.getByTestId('unit-sheet-quick').check();
    await expect(page.getByTestId('unit-sheet-quick')).toBeChecked();
    await page.getByRole('button', { name: '关闭详情' }).click();
    await expect(page.locator('.usw.open')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as LaneWindow).__casts)).toEqual([]);
  });
}

test('tap during playback opens the window (结算中) and the cast button enables itself later', async ({ page }) => {
  test.setTimeout(90_000);
  await openStandalone(page, true);
  await page.evaluate(() => (window as unknown as LaneWindow).__app.fillAllMana());
  await page.evaluate(() => { void (window as unknown as LaneWindow).__app.triggerCast(3); });
  await page.waitForFunction(() => {
    const app = (window as unknown as LaneWindow).__app;
    return app.player.isPlaying() || app.visualPlaying;
  });
  // 快速释放开着，但演出中不能立刻施放 → 打开详情窗，不排队
  await tap(page, 0);
  await expect(castButton(page)).toHaveText('结算中');
  await expect(castButton(page)).toBeDisabled();
  await expect(castButton(page)).toHaveText('对手回合', { timeout: 20_000 });
  await expect(castButton(page)).toHaveText('释放技能', { timeout: 60_000 });
  await expect(castButton(page)).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as LaneWindow).__casts)).toEqual([3]);
});

test('quick cast: tap casts at once with the ally cut-in; long press opens the window with the ring', async ({ page }) => {
  await openStandalone(page, true);
  await page.evaluate(() => (window as unknown as LaneWindow).__app.fillAllMana());
  await tap(page, 3);
  await expect(page.getByTestId('cast-cutin')).toBeVisible();
  await expect(page.locator('.usw.open')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as LaneWindow).__casts)).toEqual([3]);
  // 施放瞬间卡面法力清零（宝石数字 0、撤掉可释放态），不等整段演出结束
  await expect(page.getByTestId('card-3').locator('.gem-mana')).toHaveText(/^0\/\d+$/);
  await expect(page.getByTestId('card-3')).not.toHaveClass(/castable/);
  await page.waitForFunction(() => {
    const app = (window as unknown as LaneWindow).__app;
    const s = app.getEngine().getState();
    return !app.casting && !app.visualPlaying && !app.player.isPlaying() && s.activePlayer === 'Left'
      && !(app as unknown as { rightTeamView: { isTurnActive(): boolean } }).rightTeamView.isTurnActive();
  }, undefined, { timeout: 60_000 });
  await page.evaluate(() => (window as unknown as LaneWindow).__app.fillAllMana());
  const box = await page.getByTestId('card-2').boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(120);
  await expect(page.getByTestId('card-2')).toHaveClass(/pressing/);
  await page.waitForTimeout(500);
  await page.mouse.up();
  await expect(page.locator('.usw.open')).toHaveAttribute('data-char-id', '2');
  expect(await page.evaluate(() => (window as unknown as LaneWindow).__casts)).toEqual([3]);
});

test('enemy skill-cast drains the gem without a portrait cut-in', async ({ page }) => {
  await openStandalone(page, false);
  await page.evaluate(() => (window as unknown as LaneWindow).__app.fillAllMana());
  await expect(page.getByTestId('card-4').locator('.gem-mana')).toHaveText(/^(\d+)\/\1$/);
  await page.evaluate(() => {
    const app = (window as unknown as LaneWindow).__app;
    void app.playEventsWithTail([{ type: 'skill-cast', characterId: 4, skillId: 'probe' }]);
  });
  await expect(page.getByTestId('card-4').locator('.gem-mana')).toHaveText(/^0\/\d+$/);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('cast-cutin')).toHaveCount(0);
});

test('target reticle lands on the hovered enemy card at 1440×900', async ({ page }) => {
  await openStandalone(page, false);
  await page.evaluate(() => (window as unknown as LaneWindow).__app.fillAllMana());
  // 0 号（法露特）是选敌技能
  await page.evaluate(() => { void (window as unknown as LaneWindow).__app.triggerCast(0); });
  await expect(page.locator('.aim-overlay')).toBeVisible();
  for (const id of [4, 5, 6, 7]) {
    const b = await page.getByTestId(`card-${id}`).boundingBox();
    await page.mouse.move(b!.x + b!.width / 2, b!.y + b!.height / 2, { steps: 3 });
    await page.waitForTimeout(260);
    const delta = await page.evaluate((cid) => {
      const dot = document.querySelector('.aim-reticle .dot')!.getBoundingClientRect();
      const card = document.querySelector(`[data-testid="card-${cid}"]`)!.getBoundingClientRect();
      return Math.hypot(dot.left + dot.width / 2 - (card.left + card.width / 2), dot.top + dot.height / 2 - (card.top + card.height / 2));
    }, id);
    expect(delta).toBeLessThan(4);
  }
  await page.keyboard.press('Escape');
  await expect(page.locator('.aim-overlay')).toHaveCount(0);
});
