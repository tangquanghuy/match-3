import { test, expect, type Page } from '@playwright/test';

type MobileDebugWindow = Window & {
  __app: {
    app: { renderer: { resolution: number } };
    input: { enabled: boolean };
    root: { x: number; y: number };
    board: { cellSize: number };
    idleTweens: unknown[];
    hintTimer: number | null;
    hintTweens: unknown[];
    hintHomeY: Map<unknown, number>;
    pageHidden: boolean;
  };
  __setTestHidden?: (hidden: boolean) => void;
};

const LANDSCAPE_VIEWPORTS = [
  { width: 844, height: 390 },
  { width: 852, height: 393 },
  { width: 915, height: 412 },
  { width: 667, height: 375 },
] as const;

// External font availability must not block navigation or battle startup in E2E.
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
});

test.use({
  viewport: { width: 844, height: 390 },
  deviceScaleFactor: 3,
  hasTouch: true,
  isMobile: true,
});

async function waitForBattle(page: Page): Promise<void> {
  await expect(page.locator('#app')).toHaveAttribute('data-viewport-blocked', 'false');
  await expect(page.getByTestId('battle-wrapper')).toBeVisible();
  // wrapper 在 init 早期就挂进 DOM，input/root 要到 init 末尾才建好；
  // 不等这一步，紧随其后的 evaluate 会读到 undefined（与视口大小无关的竞态）。
  await page.waitForFunction(() => {
    const app = (window as unknown as MobileDebugWindow).__app;
    return Boolean(app?.input) && Boolean(app?.root);
  });
}

async function readLayout(page: Page) {
  return page.evaluate(() => {
    const mount = document.querySelector<HTMLElement>('#app');
    const wrapper = document.querySelector<HTMLElement>('[data-testid="battle-wrapper"]');
    const fullscreen = document.querySelector<HTMLElement>('[data-testid="fullscreen-button"]');
    const controls = [...document.querySelectorAll<HTMLElement>('.battle-control-button, .battle-settings-button')];
    const manaGem = document.querySelector<HTMLElement>('.gcol .gem');
    const hud = document.querySelector<HTMLElement>('.turn-hud');
    const allyCards = document.querySelectorAll<HTMLElement>('.gcard.ally');
    const enemyCards = document.querySelectorAll<HTMLElement>('.gcard.enemy');
    const lastAllyCard = allyCards[allyCards.length - 1];
    const lastEnemyCard = enemyCards[enemyCards.length - 1];
    if (!mount || !wrapper || !fullscreen || controls.length !== 3 || !manaGem || !hud || !lastAllyCard || !lastEnemyCard) {
      throw new Error('移动布局关键节点尚未就绪');
    }

    const mountRect = mount.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();
    const logicalWidth = Number.parseFloat(wrapper.style.width);
    const logicalHeight = Number.parseFloat(wrapper.style.height);
    const scale = wrapperRect.width / logicalWidth;
    const rect = (element: HTMLElement) => {
      const value = element.getBoundingClientRect();
      return { width: value.width, height: value.height };
    };
    // 重叠面积为 0 才说明底部控件没有压住最后一张角色卡（缩放后按 CSS 像素判定）。
    const overlapArea = (a: DOMRect, b: DOMRect) =>
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

    // 卡片必须整体落在 wrapper 内，否则末位卡片会被视口边缘裁掉。
    const cardsOutOfWrapper = [...allyCards, ...enemyCards].filter((card) => {
      const r = card.getBoundingClientRect();
      return r.left < wrapperRect.left - 0.5 || r.right > wrapperRect.right + 0.5
        || r.top < wrapperRect.top - 0.5 || r.bottom > wrapperRect.bottom + 0.5;
    }).length;

    const hudRect = hud.getBoundingClientRect();
    // root.y 是棋盘容器的逻辑纵坐标，换算到屏幕后即首行宝石顶边。
    const app = (window as unknown as MobileDebugWindow).__app;
    const firstRowTop = wrapperRect.top + app.root.y * scale;

    return {
      controlsCardOverlap: controls.reduce((sum, control) => sum + [...allyCards, ...enemyCards].reduce((n, card) => n + overlapArea(control.getBoundingClientRect(), card.getBoundingClientRect()), 0), 0),
      fullscreenCardOverlap: overlapArea(fullscreen.getBoundingClientRect(), lastEnemyCard.getBoundingClientRect()),
      hudGap: firstRowTop - hudRect.bottom,
      hudPointerEvents: getComputedStyle(hud).pointerEvents,
      cardsOutOfWrapper,
      mount: { width: mountRect.width, height: mountRect.height },
      wrapper: {
        left: wrapperRect.left,
        top: wrapperRect.top,
        right: wrapperRect.right,
        bottom: wrapperRect.bottom,
      },
      expectedScale: Math.min(1.75, mount.clientWidth / logicalWidth, mount.clientHeight / logicalHeight),
      scale,
      cellSize: app.board.cellSize * scale,
      fullscreen: rect(fullscreen),
      controls: controls.map(rect),
      manaGem: rect(manaGem),
      allyCard: rect(lastAllyCard),
    };
  });
}

test('battle HUD quietly shows live gold and souls against the balance caps', async ({ page }) => {
  await page.goto('/');
  await waitForBattle(page);
  const hud = page.getByTestId('battle-economy');
  await expect(hud).toBeVisible();
  await expect(hud).toContainText('0/500');
  await expect(hud).toContainText('0/300');
  await expect(hud).toHaveCSS('pointer-events', 'none');
  await page.evaluate(() => {
    const app = (window as unknown as { __app: {
      engine: { getState(): { economy: { gold: number; souls: number } } };
      refreshTeams(): void;
    } }).__app;
    Object.assign(app.engine.getState().economy, { gold: 470, souls: 128 });
    app.refreshTeams();
  });
  await expect(hud).toContainText('470/500');
  await expect(hud).toContainText('128/300');
  const rect = await hud.boundingBox();
  const board = await page.evaluate(() => {
    const app = (window as unknown as MobileDebugWindow).__app;
    const wrapperEl = document.querySelector<HTMLElement>('[data-testid="battle-wrapper"]')!;
    const wrapper = wrapperEl.getBoundingClientRect();
    const scale = wrapper.width / wrapperEl.offsetWidth;
    return { left: wrapper.left + app.root.x * scale,
      right: wrapper.left + (app.root.x + app.board.cellSize * 8) * scale };
  });
  expect(rect).not.toBeNull();
  expect(rect!.x).toBeGreaterThanOrEqual(board.left - 1);
  expect(rect!.x + rect!.width).toBeLessThanOrEqual(board.right + 1);
});

test('portrait starts in the portrait layout: enemy row, board, ally row fit the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await waitForBattle(page);
  await expect(page.locator('#orientation-gate')).toBeHidden();
  await expect(page.locator('canvas')).toHaveCount(1);

  const layout = await page.evaluate(() => {
    const app = (window as unknown as { __app: { isPortraitLayout(): boolean } }).__app;
    const rects = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].map((el) => el.getBoundingClientRect());
    const enemy = rects('.gcard.enemy');
    const ally = rects('.gcard.ally');
    const hud = document.querySelector<HTMLElement>('.turn-hud')!.getBoundingClientRect();
    const controls = rects('.battle-settings-button,.battle-control-button,[data-testid="fullscreen-button"]');
    return {
      portrait: app.isPortraitLayout(),
      enemyBottom: Math.max(...enemy.map((r) => r.bottom)),
      allyTop: Math.min(...ally.map((r) => r.top)),
      allyBottom: Math.max(...ally.map((r) => r.bottom)),
      hudTop: hud.top,
      hudBottom: hud.bottom,
      controlsBottom: Math.max(...controls.map((r) => r.bottom)),
      enemyTop: Math.min(...enemy.map((r) => r.top)),
      cardW: ally[0]!.width,
      cardH: ally[0]!.height,
      vh: window.innerHeight,
    };
  });
  expect(layout.portrait).toBe(true);
  // 顶栏在敌方行之上，横幅夹在敌方行与我方行之间，我方行不越出视口
  expect(layout.controlsBottom).toBeLessThanOrEqual(layout.enemyTop + 1);
  expect(layout.hudTop).toBeGreaterThanOrEqual(layout.enemyBottom - 1);
  expect(layout.hudBottom).toBeLessThan(layout.allyTop);
  expect(layout.allyBottom).toBeLessThanOrEqual(layout.vh);
  // 立绘统一纵向裁切：卡片不高于 1.4 倍卡宽
  expect(layout.cardH / layout.cardW).toBeLessThanOrEqual(1.41);
  await expect.poll(() => page.evaluate(() => {
    const app = (window as unknown as MobileDebugWindow).__app;
    return { input: app.input.enabled };
  })).toEqual({ input: true });
});

test('too-small viewports wait behind the gate, then restore', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
  await waitForBattle(page);
  await expect.poll(() => page.evaluate(() => {
    const app = (window as unknown as MobileDebugWindow).__app;
    return { input: app.input.enabled };
  })).toEqual({ input: true });

  await page.setViewportSize({ width: 600, height: 340 });
  await expect(page.locator('#app')).toHaveAttribute('data-viewport-blocked', 'true');
  await expect(page.locator('#orientation-gate')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const wrapper = document.querySelector<HTMLElement>('[data-testid="battle-wrapper"]');
    const app = (window as unknown as MobileDebugWindow).__app;
    return { input: app.input.enabled, inert: wrapper?.inert ?? false };
  })).toEqual({ input: false, inert: true });

  await page.setViewportSize({ width: 844, height: 390 });
  await waitForBattle(page);
  await expect(page.locator('canvas')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => {
    const wrapper = document.querySelector<HTMLElement>('[data-testid="battle-wrapper"]');
    const app = (window as unknown as MobileDebugWindow).__app;
    return { input: app.input.enabled, inert: wrapper?.inert ?? true };
  })).toEqual({ input: true, inert: false });
});

test('supported landscape sizes keep the board and controls usable without overflow', async ({ page }) => {
  await page.goto('/');
  await waitForBattle(page);

  for (const viewport of LANDSCAPE_VIEWPORTS) {
    await page.setViewportSize(viewport);
    await expect(page.locator('#app')).toHaveAttribute('data-viewport-blocked', 'false');
    await expect.poll(async () => {
      const metrics = await readLayout(page);
      return Math.abs(metrics.scale - metrics.expectedScale) < 0.01;
    }).toBe(true);

    const metrics = await readLayout(page);
    expect(metrics.wrapper.left).toBeGreaterThanOrEqual(-0.5);
    expect(metrics.wrapper.top).toBeGreaterThanOrEqual(-0.5);
    expect(metrics.wrapper.right).toBeLessThanOrEqual(metrics.mount.width + 0.5);
    expect(metrics.wrapper.bottom).toBeLessThanOrEqual(metrics.mount.height + 0.5);
    expect(metrics.cellSize).toBeGreaterThanOrEqual(40);
    // 舞台操作控件与全屏按钮均应避开角色卡，任何重叠都意味着回归。
    expect(metrics.controlsCardOverlap).toBe(0);
    expect(metrics.fullscreenCardOverlap).toBe(0);
    expect(metrics.cardsOutOfWrapper).toBe(0);
    // HUD 的羽化边缘有意伸入首行，但不覆盖宝石中心，也不拦截棋盘点击。
    expect(metrics.hudGap).toBeGreaterThan(-metrics.cellSize / 2);
    expect(metrics.hudPointerEvents).toBe('none');
    for (const target of [metrics.fullscreen, ...metrics.controls]) {
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    }
    // 法力角标现为卡片信息（点击等同点卡片），不再是独立浮窗入口。
    // 按当前 18% 卡宽（小屏信息放大后至 24%）检查比例与正方形，触控尺寸由整张卡承担。
    expect(metrics.manaGem.width / metrics.allyCard.width).toBeGreaterThanOrEqual(0.17);
    expect(metrics.manaGem.width / metrics.allyCard.width).toBeLessThanOrEqual(0.25);
    expect(Math.abs(metrics.manaGem.width - metrics.manaGem.height)).toBeLessThan(1);
  }
});

test('visibility lifecycle disables interaction and fully restores idle state', async ({ page }) => {
  await page.addInitScript(() => {
    let hidden = false;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden,
    });
    (window as unknown as MobileDebugWindow).__setTestHidden = (value: boolean) => {
      hidden = value;
      document.dispatchEvent(new Event('visibilitychange'));
    };
  });
  await page.goto('/');
  await waitForBattle(page);

  await expect.poll(() => page.evaluate(() => {
    const app = (window as unknown as MobileDebugWindow).__app;
    return { input: app.input.enabled, idle: app.idleTweens.length };
  })).toEqual({ input: true, idle: 64 });

  await page.evaluate(() => {
    (window as unknown as MobileDebugWindow).__setTestHidden?.(true);
  });
  await expect.poll(() => page.evaluate(() => {
    const app = (window as unknown as MobileDebugWindow).__app;
    const wrapper = document.querySelector<HTMLElement>('[data-testid="battle-wrapper"]');
    return {
      hidden: app.pageHidden,
      input: app.input.enabled,
      idle: app.idleTweens.length,
      hintTimer: app.hintTimer,
      hintTweens: app.hintTweens.length,
      hintedSprites: app.hintHomeY.size,
      inert: wrapper?.inert ?? false,
    };
  })).toEqual({
    hidden: true,
    input: false,
    idle: 0,
    hintTimer: null,
    hintTweens: 0,
    hintedSprites: 0,
    inert: true,
  });

  await page.evaluate(() => {
    (window as unknown as MobileDebugWindow).__setTestHidden?.(false);
  });
  await expect.poll(() => page.evaluate(() => {
    const app = (window as unknown as MobileDebugWindow).__app;
    const wrapper = document.querySelector<HTMLElement>('[data-testid="battle-wrapper"]');
    return {
      hidden: app.pageHidden,
      input: app.input.enabled,
      idle: app.idleTweens.length,
      inert: wrapper?.inert ?? true,
    };
  })).toEqual({ hidden: false, input: true, idle: 64, inert: false });
});
