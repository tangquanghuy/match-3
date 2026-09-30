import { test, expect, type FrameLocator, type Page } from '@playwright/test';

/**
 * iframe 宿主协议端到端：用 tests/e2e/host-harness.html 扮演 AIRP 宿主，
 * 验证 ready → start → started → result → ack 全链路，以及队伍确实来自宿主而非本地配置。
 *
 * 注意：`page.evaluate` 的函数在浏览器里求值，不能引用本文件的运行时辅助函数；
 * 类型注解会被编译擦除，所以下面用「内联取 iframe window + 类型断言」的写法。
 */

const HARNESS = '/tests/e2e/host-harness.html';

test.use({ viewport: { width: 1024, height: 620 } });
// 全链路用例要打完一整场（多次施法 + AI 回合 + 演出），30s 默认上限不够
test.setTimeout(120_000);

type HarnessWindow = Window & {
  __harness: {
    messages: { type: string; [k: string]: unknown }[];
    lastResult: { battleId: string; winner: string; defeatedExternalIds: string[]; turns: number } | null;
    lastError: { code: string; message: string } | null;
    ackEnabled: boolean;
    startsSent: number;
    sendStart: (over?: unknown) => void;
    sendAck: (battleId: string, requestId: string) => void;
  };
};

/** iframe 内 App 的最小形状：只声明测试真正用到的成员。 */
interface FrameCharacter {
  id: number;
  hp: number;
  armor: number;
  mana: number;
  manaCost: number;
}
interface FrameState {
  winner: string | null;
  activePlayer: string;
  state: string;
  actionLog: unknown[];
  teams: Record<'Left' | 'Right', { characters: FrameCharacter[] }>;
}
interface FrameApp {
  engine: { getState(): FrameState };
  getBattleRequest(): { battleId: string; requestId: string; seed: number };
  castPlayerSkill(id: number): Promise<void>;
  startupPlaying: boolean;
  casting: boolean;
  player: { isPlaying(): boolean };
  input?: unknown;
  root?: unknown;
}
type FrameWindow = Window & { __app: FrameApp };

const messageTypes = (page: Page): Promise<string[]> =>
  page.evaluate(() => (window as unknown as HarnessWindow).__harness.messages.map((m) => m.type));

const startedCount = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as HarnessWindow).__harness.messages
    .filter((m) => m.type === 'battle:started').length);

const harnessError = (page: Page) =>
  page.evaluate(() => (window as unknown as HarnessWindow).__harness.lastError);

async function waitForBattleFrame(page: Page): Promise<FrameLocator> {
  const frame = page.frameLocator('[data-testid="battle-frame"]');
  await expect(frame.locator('#app')).toHaveAttribute('data-viewport-blocked', 'false');
  await expect(frame.getByTestId('battle-wrapper')).toBeVisible();
  await page.waitForFunction(() => {
    const win = document.querySelector<HTMLIFrameElement>('[data-testid="battle-frame"]')
      ?.contentWindow as FrameWindow | null | undefined;
    const app = win?.__app;
    return Boolean(app?.input) && Boolean(app?.root);
  });
  return frame;
}

/** 在 iframe 内驱动一场必胜战斗：敌方压到 1 血，反复用队首技能点掉。 */
async function finishBattleInFrame(page: Page): Promise<void> {
  // This harness tests the host protocol, not the optional cast-confirm UI.
  // Engine AwaitingInput precedes animation completion, so wait for the view too.
  await page.waitForFunction(() => {
    const win = document.querySelector<HTMLIFrameElement>('[data-testid="battle-frame"]')!
      .contentWindow as FrameWindow;
    return !win.__app.startupPlaying && !win.__app.player.isPlaying();
  });
  await page.evaluate(() => {
    const win = document.querySelector<HTMLIFrameElement>('[data-testid="battle-frame"]')!
      .contentWindow as FrameWindow;
    win.localStorage.setItem('battle.skipCastConfirm', '1');
    for (const c of win.__app.engine.getState().teams.Right.characters) {
      c.hp = 1;
      c.armor = 0;
    }
  });

  for (let i = 0; i < 12; i++) {
    const done = await page.evaluate(() => {
      const win = document.querySelector<HTMLIFrameElement>('[data-testid="battle-frame"]')!
        .contentWindow as FrameWindow;
      return win.__app.engine.getState().winner !== null;
    });
    if (done) return;

    await page.waitForFunction(() => {
      const win = document.querySelector<HTMLIFrameElement>('[data-testid="battle-frame"]')!
        .contentWindow as FrameWindow;
      const s = win.__app.engine.getState();
      return s.winner !== null || (s.activePlayer === 'Left' && s.state === 'AwaitingInput'
        && !win.__app.casting && !win.__app.startupPlaying && !win.__app.player.isPlaying());
    }, null, { timeout: 15_000 });

    await page.evaluate(() => {
      const win = document.querySelector<HTMLIFrameElement>('[data-testid="battle-frame"]')!
        .contentWindow as FrameWindow;
      const app = win.__app;
      if (app.engine.getState().winner !== null) return;
      const caster = app.engine.getState().teams.Left.characters[0];
      caster.mana = caster.manaCost;
      void app.castPlayerSkill(caster.id);
    });
    // The native spell now chooses its enemy. Do not await the cast promise before
    // providing input; a single remaining enemy is selected automatically.
    const frame = page.frameLocator('[data-testid="battle-frame"]');
    await page.waitForFunction(() => {
      const win = document.querySelector<HTMLIFrameElement>('[data-testid="battle-frame"]')!.contentWindow as FrameWindow;
      return !!win.document.querySelector('.aim-overlay') || !win.__app.casting;
    });
    if (await frame.locator('.aim-overlay').count()) {
      await frame.locator('.gcard.enemy:not(.defeated)').first().click();
    }
    // 条件等待而不是固定 sleep：等到本次行动的演出与 AI 回合都结束（或已分出胜负）
    await page.waitForFunction(() => {
      const win = document.querySelector<HTMLIFrameElement>('[data-testid="battle-frame"]')!
        .contentWindow as FrameWindow;
      const s = win.__app.engine.getState();
      return s.winner !== null || (s.activePlayer === 'Left' && s.state === 'AwaitingInput'
        && !win.__app.casting && !win.__app.startupPlaying && !win.__app.player.isPlaying());
    }, null, { timeout: 20_000 });
  }
}

test('宿主下发快照后走完 ready → start → started → result → ack', async ({ page }) => {
  await page.goto(HARNESS);
  const frame = await waitForBattleFrame(page);

  await expect.poll(() => messageTypes(page)).toEqual(
    expect.arrayContaining(['battle:ready', 'battle:started']),
  );
  const types = await messageTypes(page);
  expect(types.indexOf('battle:ready')).toBeLessThan(types.indexOf('battle:started'));

  // 队伍来自宿主 request（2v2），而不是本地 fixture（4v4）
  await expect(frame.locator('.gcard.ally')).toHaveCount(2);
  await expect(frame.locator('.gcard.enemy')).toHaveCount(2);
  const battleId = await page.evaluate(() => {
    const win = document.querySelector<HTMLIFrameElement>('[data-testid="battle-frame"]')!
      .contentWindow as FrameWindow;
    return win.__app.getBattleRequest().battleId;
  });
  expect(battleId).toBe('host-battle-1');

  await finishBattleInFrame(page);

  // 结果送达且被确认，胜负与阵亡名单按 externalId 回映
  await expect.poll(() => page.evaluate(
    () => (window as unknown as HarnessWindow).__harness.lastResult,
  )).toMatchObject({
    battleId: 'host-battle-1',
    winner: 'player',
    defeatedExternalIds: ['host-e1', 'host-e2'],
  });
  // 收到 ack 后不再重投
  const resultCount = (await messageTypes(page)).filter((t) => t === 'battle:result').length;
  expect(resultCount).toBe(1);
  await expect(frame.getByTestId('host-status')).toContainText('已提交');
  expect(await harnessError(page)).toBeNull();
});

test('同一 battleId 重复 start 只受理一次并补发 started', async ({ page }) => {
  await page.goto(HARNESS);
  await waitForBattleFrame(page);

  const before = {
    started: await startedCount(page),
    ...await page.evaluate(() => {
      const win = document.querySelector<HTMLIFrameElement>('[data-testid="battle-frame"]')!
        .contentWindow as FrameWindow;
      return {
        seed: win.__app.getBattleRequest().seed,
        actionLog: win.__app.engine.getState().actionLog.length,
      };
    }),
  };

  await page.evaluate(() => (window as unknown as HarnessWindow).__harness.sendStart());
  await page.waitForTimeout(600);

  const after = {
    started: await startedCount(page),
    ...await page.evaluate(() => {
      const win = document.querySelector<HTMLIFrameElement>('[data-testid="battle-frame"]')!
        .contentWindow as FrameWindow;
      return {
        seed: win.__app.getBattleRequest().seed,
        actionLog: win.__app.engine.getState().actionLog.length,
        canvasCount: win.document.querySelectorAll('canvas').length,
      };
    }),
  };

  // 补发了 started，但没有重开战斗
  expect(after.started).toBe(before.started + 1);
  expect(after.seed).toBe(before.seed);
  expect(after.actionLog).toBe(before.actionLog);
  expect(after.canvasCount).toBe(1);
  expect(await harnessError(page)).toBeNull();
});

test('已有战斗时换 battleId 被拒为 battle-busy', async ({ page }) => {
  await page.goto(HARNESS);
  await waitForBattleFrame(page);

  await page.evaluate(() => (window as unknown as HarnessWindow).__harness.sendStart({
    battleId: 'host-battle-2',
    requestId: 'host-req-2',
  }));
  await expect.poll(() => harnessError(page)).toMatchObject({ code: 'battle-busy' });
});
