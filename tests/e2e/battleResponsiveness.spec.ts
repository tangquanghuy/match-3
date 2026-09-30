import { expect, test, type Page } from '@playwright/test';
import type { App } from '@render/App';
import type { BoardView } from '@render/BoardView';
import type { EventStreamPlayer } from '@render/EventStreamPlayer';
import type { FiniteVisuals } from '@render/FiniteVisuals';
import type { InputController } from '@render/InputController';
import type { Application } from 'pixi.js';

type BattleFixture = Pick<App, 'getEngine' | 'destroy' | 'onEventsProduced'> & {
  app: Application;
  input: InputController;
  board: BoardView;
  player: EventStreamPlayer;
  finiteVisuals: FiniteVisuals;
  startupPlaying: boolean;
  visualPlaying: boolean;
  setAutoBattle(enabled: boolean): void;
  showHint(): void;
  clearHint(): void;
};
interface FixtureWindow extends Window {
  __app: BattleFixture;
  __slowFrames?: number;
  __swaps: number;
}

async function ready(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const app = (window as unknown as FixtureWindow).__app;
    return app?.input?.enabled && !app.startupPlaying && !app.visualPlaying
      && !app.player.isPlaying() && app.finiteVisuals.size === 0;
  }, undefined, { timeout: 30_000 });
  // Idle breathing may change size uniformly, but no gem may retain landing squash.
  await expect.poll(() => page.evaluate(() => {
    const app = (window as unknown as FixtureWindow).__app;
    return app.board.layer.children.filter(s => Math.abs(s.scale.x - s.scale.y) > .005
      || s.scale.x < .95 || s.scale.x > 1.1).length;
  })).toBe(0);
}

async function observeSwaps(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as FixtureWindow;
    w.__swaps = 0;
    w.__app.onEventsProduced = events => { w.__swaps += events.filter(e => e.type === 'swap').length; };
    for (const team of Object.values(w.__app.getEngine().getState().teams)) {
      for (const character of team.characters) {
        character.hp = character.maxHp = 99999;
        character.armor = 0;
      }
    }
  });
}

async function dragLegalSwap(page: Page): Promise<void> {
  const move = await page.evaluate(async () => {
    const w = window as unknown as FixtureWindow;
    const path = '/src/engine/boardUtils.ts';
    const { findLegalSwaps } = await import(/* @vite-ignore */ path) as typeof import('@engine/boardUtils');
    const app = w.__app;
    const swap = findLegalSwaps(app.getEngine().getState().board)[0];
    if (!swap) throw new Error('Expected a playable board');
    const rect = app.app.canvas.getBoundingClientRect();
    const point = (cell: typeof swap.a) => {
      const p = app.board.toGlobal(app.board.cellCenter(cell));
      return { x: rect.left + p.x * rect.width / app.app.screen.width,
        y: rect.top + p.y * rect.height / app.app.screen.height };
    };
    return { a: point(swap.a), b: point(swap.b), before: w.__swaps };
  });
  await page.mouse.move(move.a.x, move.a.y);
  await page.mouse.down();
  await page.mouse.move(move.b.x, move.b.y, { steps: 12 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as unknown as FixtureWindow).__swaps)).toBeGreaterThan(move.before);
  await ready(page);
}

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => route.abort());
  await page.addInitScript(() => localStorage.clear());
});

test('offline battle under CPU contention finishes animations and accepts manual dragging', async ({ page, context }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  await page.goto('/index.html');
  await ready(page);
  await observeSwaps(page);
  // Preload the helper before disconnecting; combat itself must keep working offline.
  await page.evaluate(async () => { const path = '/src/engine/boardUtils.ts'; await import(/* @vite-ignore */ path); });
  await context.setOffline(true);
  try {
    await page.evaluate(() => {
      const w = window as unknown as FixtureWindow;
      w.__slowFrames = window.setInterval(() => {
        const end = performance.now() + 160;
        while (performance.now() < end) { /* Deliberately block 80% of main-thread time. */ }
      }, 200);
      w.__app.setAutoBattle(true);
    });
    await page.waitForTimeout(25_000);
  } finally {
    await page.evaluate(() => {
      const w = window as unknown as FixtureWindow;
      clearInterval(w.__slowFrames);
      w.__app.setAutoBattle(false);
    });
  }
  expect(await page.evaluate(() => (window as unknown as FixtureWindow).__swaps)).toBeGreaterThan(0);
  await ready(page);
  await dragLegalSwap(page);
  expect(errors).toEqual([]);
});

test('leaving battle with delayed hints and status particles at 2x does not poison subsequent battles', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.stack ?? error.message));
  await page.goto('/index.html');
  await ready(page);
  for (let round = 0; round < 3; round++) {
    await page.evaluate(async round => {
      const speedPath = '/src/render/battleSpeed.ts';
      const appPath = '/src/render/App.ts';
      const { setBattleSpeed } = await import(/* @vite-ignore */ speedPath) as typeof import('@render/battleSpeed');
      const { App } = await import(/* @vite-ignore */ appPath) as typeof import('@render/App');
      const typesPath = '/src/engine/types.ts';
      const { specialGem } = await import(/* @vite-ignore */ typesPath) as typeof import('@engine/types');
      const w = window as unknown as FixtureWindow;
      // Round 0: delayed hints only; 1: active status particles; 2: pooled particles.
      if (round > 0) {
        const gem = w.__app.getEngine().getState().board.get({ row: 0, col: 0 })!;
        w.__app.board.setGemType(gem.id, specialGem(round === 1 ? 'burningGem' : 'poisonGem'));
        if (round === 2) w.__app.board.removeGem(gem.id);
      }
      w.__app.showHint();
      setBattleSpeed(2);
      w.__app.clearHint();
      w.__app.destroy();
      const next = new App();
      w.__app = next as unknown as BattleFixture;
      await next.init(document.getElementById('app')!);
    }, round);
    await ready(page);
    await observeSwaps(page);
    await dragLegalSwap(page);
    expect(errors).toEqual([]);
  }
});
