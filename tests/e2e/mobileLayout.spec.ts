import { test, expect, type Page } from '@playwright/test';

type MobileDebugWindow = Window & {
  __app: {
    app: { renderer: { resolution: number } };
    input: { enabled: boolean };
    root: { y: number };
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
    const teamToggle = document.querySelector<HTMLElement>('[data-testid="team-size-toggle"]');
    const manaGem = document.querySelector<HTMLElement>('.gcol .gem');
    const hud = document.querySelector<HTMLElement>('.turn-hud');
    const allyCards = document.querySelectorAll<HTMLElement>('.gcard.ally');
    const enemyCards = document.querySelectorAll<HTMLElement>('.gcard.enemy');
    const lastAllyCard = allyCards[allyCards.length - 1];
    const lastEnemyCard = enemyCards[enemyCards.length - 1];
    if (!mount || !wrapper || !fullscreen || !teamToggle || !manaGem || !hud || !lastAllyCard || !lastEnemyCard) {
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
      teamCardOverlap: overlapArea(teamToggle.getBoundingClientRect(), lastAllyCard.getBoundingClientRect()),
      fullscreenCardOverlap: overlapArea(fullscreen.getBoundingClientRect(), lastEnemyCard.getBoundingClientRect()),
      hudGap: firstRowTop - hudRect.bottom,
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
      cellSize: 40 * scale,
      fullscreen: rect(fullscreen),
      teamToggle: rect(teamToggle),
      manaGem: rect(manaGem),
    };
  });
}

test('portrait waits behind the gate, then landscape initializes once and restores after rotation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  await expect(page.locator('#app')).toHaveAttribute('data-viewport-blocked', 'true');
  await expect(page.locator('#orientation-gate')).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);

  await page.setViewportSize({ width: 844, height: 390 });
  await waitForBattle(page);
  await expect.poll(() => page.evaluate(() => {
    const app = (window as unknown as MobileDebugWindow).__app;
    return { input: app.input.enabled, resolution: app.app.renderer.resolution };
  })).toEqual({ input: true, resolution: 2 });

  await page.setViewportSize({ width: 390, height: 844 });
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
    // 底部两个控件挂在 wrapper 外侧，任何重叠都意味着又压回了角色卡。
    expect(metrics.teamCardOverlap).toBe(0);
    expect(metrics.fullscreenCardOverlap).toBe(0);
    expect(metrics.cardsOutOfWrapper).toBe(0);
    // HUD 底边不得越过首行宝石顶边（留 0.01px 容差吸收浮点误差）。
    expect(metrics.hudGap).toBeGreaterThanOrEqual(-0.01);
    for (const target of [metrics.fullscreen, metrics.teamToggle]) {
      expect(target.width).toBeGreaterThanOrEqual(44);
      expect(target.height).toBeGreaterThanOrEqual(44);
    }
    // 法力宝石是二级信息入口（点开法力进度浮窗），尺寸按 PC 设计稿的卡宽占比锚定
    // （26% ≈ 26 逻辑 px），不再计入 44×44 关键控件；这里只守住"仍然可点、没被缩没"。
    expect(metrics.manaGem.width).toBeGreaterThanOrEqual(24);
    expect(metrics.manaGem.height).toBeGreaterThanOrEqual(24);
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
