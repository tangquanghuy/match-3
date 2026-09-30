import { expect, test, type Page } from '@playwright/test';
import type { App } from '@render/App';
import type { BoardView } from '@render/BoardView';
import type { EventStreamPlayer } from '@render/EventStreamPlayer';
import type { GameEvent } from '@engine/events';
import type { CellPos, GemType } from '@engine/types';

interface FixtureWindow extends Window {
  __app: Pick<App, 'getEngine'> & { startupPlaying: boolean; board: BoardView; player: EventStreamPlayer;
    playEventsWithTail(events: GameEvent[]): Promise<void> };
  __matchDone?: boolean;
  __matchBonuses?: { bonus: number; x: number; y: number; expectedX: number; expectedY: number; path: string | null }[];
  __matchNotices?: string[];
}
async function open(page: Page) {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/index.html');
  await page.waitForFunction(() => {
    const app = (window as unknown as FixtureWindow).__app;
    return app && !app.startupPlaying && document.querySelectorAll('.gcard').length === 8;
  });
}
async function trigger(page: Page, skulls: boolean, size = 5) {
  return page.evaluate(async ({ skulls, size }) => {
    const w = window as unknown as FixtureWindow;
    const app = w.__app;
    const load = (path: string) => import(/* @vite-ignore */ path);
    const { BaseColor, PlayerSide, MatchState, colorGem, skullGem, specialGem } = await load('/src/engine/types.ts');
    const { attachPassives } = await load('/src/engine/traits.ts');
    const engine = app.getEngine();
    const state = engine.getState();
    state.activePlayer = PlayerSide.Left;
    state.state = MatchState.AwaitingInput;
    engine.skullChance = 0; engine.comboBias = 0;
    for (const team of Object.values(state.teams)) for (const c of team.characters) {
      Object.assign(c, { traitIds: [], statuses: [], hp: 9999, maxHp: 9999, armor: 0, attack: 1, defeated: false });
      attachPassives(c);
    }
    const palette = [BaseColor.Blue, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown];
    let id = 900000;
    const set = (row: number, col: number, type: GemType) => state.board.set({ row, col }, { id: id++, type });
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) set(row, col, colorGem(palette[(row + col) % 4]));
    let a: CellPos; let b: CellPos;
    if (skulls) {
      set(4, 2, specialGem('doomSkull')); set(4, 3, skullGem()); set(3, 4, specialGem('uberDoomSkull'));
      a = { row: 4, col: 4 }; b = { row: 3, col: 4 };
    } else {
      for (const col of [0, 1, 3, ...(size === 5 ? [4] : [])]) set(7, col, colorGem(BaseColor.Green));
      set(4, 2, colorGem(BaseColor.Green)); set(5, 2, colorGem(BaseColor.Red));
      set(7, 2, colorGem(BaseColor.Red)); set(6, 3, colorGem(BaseColor.Red));
      a = { row: 6, col: 2 }; b = { row: 6, col: 3 };
    }
    app.board.syncFromBoard(state.board);
    w.__matchBonuses = []; w.__matchNotices = []; w.__matchDone = false;
    const onBonus = app.player.onSkullMatchBonus;
    app.player.onSkullMatchBonus = (pos, bonus) => {
      onBonus?.(pos, bonus);
      const el = [...document.querySelectorAll<HTMLElement>('.skull-match-bonus')].at(-1)!;
      const point = app.board.toGlobal(app.board.cellCenter(pos));
      w.__matchBonuses!.push({ bonus, x: parseFloat(el.style.left), y: parseFloat(el.style.top),
        expectedX: point.x, expectedY: point.y, path: el.querySelector('path')!.getAttribute('d') });
    };
    const onNotice = app.player.onMatchExtraTurn;
    app.player.onMatchExtraTurn = side => { onNotice?.(side); w.__matchNotices!.push(document.querySelector('.extra-turn-notice')!.textContent!); };
    const events = engine.resolveSwap(a, b);
    void app.playEventsWithTail(events).then(() => { w.__matchDone = true; });
    return { active: state.activePlayer, clears: events.filter(e => e.type === 'elimination').map(e => ({ chain: e.chainCount, size: e.cells.length, grant: e.extraTurnPlayer })) };
  }, { skulls, size });
}
for (const width of [1440, 390]) {
  test(`特殊骷髅原位双剑加伤、结束后清理 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await open(page);
    await trigger(page, true);
    await expect(page.locator('.skull-match-bonus')).toHaveCount(2);
    await expect(page.locator('.skull-match-bonus[data-bonus="5"]')).toHaveText('+5');
    await expect(page.locator('.skull-match-bonus[data-bonus="10"]')).toHaveText('+10');
    await page.screenshot({ path: `artifacts/skull-match-bonus-${width}.png` });
    const result = await page.evaluate(() => ({ bonuses: (window as unknown as FixtureWindow).__matchBonuses!, path: document.querySelector('.stat-atk svg path')!.getAttribute('d') }));
    expect(result.bonuses.map(b => b.bonus)).toEqual([5, 10]);
    for (const b of result.bonuses) {
      expect(b.path).toBe(result.path);
      expect(b.x).toBeCloseTo(b.expectedX); expect(b.y).toBeCloseTo(b.expectedY);
    }
    await page.waitForFunction(() => (window as unknown as FixtureWindow).__matchDone);
    await expect(page.locator('.skull-match-bonus')).toHaveCount(0);
  });
}
for (const size of [4, 5]) {
  test(`首轮三连后下落 ${size} 连提示并保留我方回合`, async ({ page }) => {
    await open(page);
    const result = await trigger(page, false, size);
    expect(result.clears[0]).toMatchObject({ chain: 1, size: 3 });
    expect(result.clears.some(c => c.chain === 2 && c.size === size && c.grant === 'Left')).toBe(true);
    expect(result.active).toBe('Left');
    await page.waitForFunction(() => (window as unknown as FixtureWindow).__matchDone);
    expect(await page.evaluate(() => (window as unknown as FixtureWindow).__matchNotices)).toContain('我方额外回合');
  });
}
