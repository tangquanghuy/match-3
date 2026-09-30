import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';


type DebugCell = { row: number; col: number };
type DebugSprite = {
  x: number;
  y: number;
  alpha: number;
  visible: boolean;
};
type DebugAppWindow = Window & {
  __testPage: {
    app: {
      casting: boolean;
      startupPlaying: boolean;
      visualPlaying: boolean;
      player: { isPlaying(): boolean };
      input: { enabled: boolean };
      triggerCast: (charId: number) => Promise<void>;
      setDebugSkill: (charId: number, proto: {
        segments: Array<{
          kind: 'damage';
          target: 'allySelf';
          scaling: { base: number; mult: number };
        }>;
      }) => void;
      debugSetGems: (changes: Array<{
        pos: DebugCell;
        type: { kind: 'skull'; variant: 'normal' } | { kind: 'color'; color: 'Red' };
      }>) => Promise<boolean>;
      getBaseSize: () => { w: number; h: number };
      board: {
        sprites: Map<number, DebugSprite>;
        layer: { children: unknown[] };
        cellCenter: (pos: DebugCell) => { x: number; y: number };
      };
      engine: {
        getState: () => {
          activePlayer: string;
          state: string;
          board: {
            forEach: (fn: (gem: { id: number } | null, pos: DebugCell) => void) => void;
          };
          teams: Record<string, {
            summonQueue?: Array<{ character: { id: number } }>;
            characters: Array<{ id: number; mana: number }>;
          }>;
        };
      };
    };
  };
};

/**
 * 技能释放端到端验收（需求 9, 2C, 2A.3, 2B.3）。
 * 测试页是主游戏薄壳：拖技能标签到我方角色卡换技能 → 短按角色卡走主游戏真实释放流程。
 * 因此验证的是主游戏的 Cast_Flow 与演出。
 */

/** 短按角色卡（pointerdown→up，间隔 < 长按阈值 475ms） */
async function shortPressCard(page: Page, charId: number): Promise<void> {
  const card = page.getByTestId(`card-${charId}`);
  const box = await card.boundingBox();
  if (!box) throw new Error(`card-${charId} 无边界`);
  // Use the upper-right card body; the mana bookmark occupies the upper-left corner.
  const x = box.x + box.width * 0.75;
  const y = box.y + box.height * 0.3;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
}

async function waitForPlayerTurn(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const app = (window as unknown as DebugAppWindow).__testPage.app;
    const state = app.engine.getState();
    return state.activePlayer === 'Left' && state.state === 'AwaitingInput'
      && !app.casting && !app.startupPlaying && !app.player.isPlaying() && !app.visualPlaying;
  });
}

/**
 * 合成 HTML5 拖放：把技能标签换到目标角色卡。
 * 不用 Playwright 原生 dragTo——当标签在视口外（列表靠下的中毒/召唤/选敌等），
 * 原生拖放需把标签滚入视口，反而把顶部的落点角色卡挤出视口，drop 落空，
 * 角色 skillId 保持 none，释放只发 skill-cast（正是此前 3 个用例卡住的根因）。
 * 这里复用同一个 DataTransfer 依次派发 dragstart→dragover→drop→dragend，
 * 与页面真实的拖放处理器（读取 text/plain）完全一致，且与滚动无关。
 */
async function assignSkill(page: Page, skillId: string, casterId = 0): Promise<void> {
  await waitForPlayerTurn(page);
  const ok = await page.evaluate(
    ({ skillId, casterId }) => {
      const src = document.querySelector(`[data-testid="skill-${skillId}"]`);
      const tgt = document.querySelector(`[data-testid="card-${casterId}"]`);
      if (!src || !tgt) return false;
      const dt = new DataTransfer();
      src.dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true, cancelable: true }));
      tgt.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      tgt.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
      src.dispatchEvent(new DragEvent('dragend', { dataTransfer: dt, bubbles: true, cancelable: true }));
      return true;
    },
    { skillId, casterId },
  );
  if (!ok) throw new Error(`换技能失败：skill-${skillId} 或 card-${casterId} 不存在`);
}

/**
 * 记录此后挂到页面上的序列帧特效名（data-fx）。
 * 爆点类特效只存在约 0.3 秒，短于 toBeVisible 的轮询间隔，直接查 DOM 会随时序漏检。
 */
async function recordFrameFx(page: Page): Promise<() => Promise<string[]>> {
  await page.evaluate(() => {
    const w = window as unknown as { __mountedFx: string[] };
    w.__mountedFx = [];
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          const name = (node as HTMLElement).dataset?.fx;
          if (name) w.__mountedFx.push(name);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
  return () => page.evaluate(() => (window as unknown as { __mountedFx: string[] }).__mountedFx);
}

/** 把技能标签换到我方角色卡（id=0 施法者），并短按释放 */
async function assignAndCast(page: Page, skillId: string, casterId = 0): Promise<void> {
  await assignSkill(page, skillId, casterId);
  await page.waitForTimeout(150);
  await shortPressCard(page, casterId);
}

/** Wait for the cast flow, then verify every model gem has a sprite at its cell. */
async function expectBoardViewSettled(page: Page): Promise<void> {
  await waitForPlayerTurn(page);
  const mismatch = await page.evaluate(() => {
    const app = (window as unknown as DebugAppWindow).__testPage.app;
    const view = app.board;
    const model = app.engine.getState().board;
    let count = 0;
    model.forEach((gem: { id: number } | null, pos: { row: number; col: number }) => {
      if (!gem) return;
      const sprite = view.sprites.get(gem.id);
      const center = view.cellCenter(pos);
      if (
        !sprite ||
        !sprite.visible ||
        sprite.alpha < 0.99 ||
        Math.abs(sprite.x - center.x) > 1 ||
        Math.abs(sprite.y - center.y) > 1
      ) {
        count += 1;
      }
    });
    return { count, children: view.layer.children.length };
  });

  expect(mismatch).toEqual({ count: 0, children: 64 });
}


test.beforeEach(async ({ page }) => {
  // Keep battle initialization independent of external font request latency.
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  // Bulk skill semantics tests exercise the cast result, not the confirmation preference.
  // Keep that choice explicit so B-4's player-facing default confirmation cannot stall them.
  await page.addInitScript(() => window.localStorage.setItem('battle.skipCastConfirm', '1'));
  // The page intentionally defers a large frame/audio preload. Waiting for the browser `load`
  // event makes unrelated skill tests depend on every asset download, while `data-test-ready`
  // is the app's actual interaction boundary.
  await page.goto('/skills-test.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#app')).toHaveAttribute('data-test-ready', 'true', { timeout: 15_000 });
  await expect(page.getByTestId('skill-dmg-single')).toBeVisible({ timeout: 15_000 });
  await waitForPlayerTurn(page);
});

test('unit window replaces the cast confirmation: tap opens it, its native cast button starts targeting', async ({ page }) => {
  // 默认（快速释放关）：点满法力的我方卡只打开部队详情窗，不施放
  await page.evaluate(() => window.localStorage.setItem('battle.skipCastConfirm', '0'));
  await assignSkill(page, 'dmg-chosen');
  await page.getByTestId('fill-mana').click();
  const log = page.getByTestId('event-log');
  await log.evaluate((element) => { element.textContent = ''; });
  await shortPressCard(page, 0);

  const sheet = page.locator('.usw.open');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('role', 'dialog');
  await expect(sheet).toHaveAttribute('aria-modal', 'false');
  await expect(sheet.locator('.usw-target')).toContainText('释放后点选 1 名敌人');
  await expect(page.locator('.ccp-backdrop')).toHaveCount(0);
  await expect(log).not.toContainText('skill-cast');
  const cast = sheet.getByRole('button', { name: '释放技能' });
  await expect(cast).toBeEnabled();
  await expect(sheet.getByRole('checkbox', { name: /快速释放/ })).not.toBeChecked();

  // 再点同一张卡收起；点敌方卡切到敌方内容（没有施放按钮，只列法力）；Esc 收起
  await shortPressCard(page, 0);
  await expect(page.locator('.usw.open')).toHaveCount(0);
  await shortPressCard(page, 5);
  await expect(sheet).toHaveAttribute('data-side', 'enemy');
  await expect(sheet.locator('.usw-cast')).toHaveCount(0);
  await expect(sheet.locator('.usw-foe-mana')).toContainText('法力');
  await page.keyboard.press('Escape');
  await expect(page.locator('.usw.open')).toHaveCount(0);

  // 窗内按钮是原生 button：聚焦后 Enter 直接进入选目标（不再有第二次确认），窗随之收起
  await shortPressCard(page, 0);
  await expect(cast).toBeVisible();
  await cast.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.aim-overlay')).toBeVisible();
  await expect(page.locator('.usw.open')).toHaveCount(0);
  await page.getByTestId('card-6').click();
  await expect(log).toContainText('skill-damage → 角色6');
});

test('unit window quick-cast checkbox writes the shared preference', async ({ page }) => {
  await page.evaluate(() => window.localStorage.setItem('battle.skipCastConfirm', '0'));
  await shortPressCard(page, 1);
  const box = page.locator('.usw.open').getByRole('checkbox', { name: /快速释放/ });
  await box.check();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('battle.skipCastConfirm'))).toBe('1');
  await box.uncheck();
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem('battle.skipCastConfirm'))).toBe('0');
});







test('mana gem shows current/max without a tooltip, cancelled pointers never cast, and a gem tap is a card tap', async ({ page }) => {
  await assignSkill(page, 'dmg-single');
  await page.getByTestId('fill-mana').click();
  const log = page.getByTestId('event-log');
  await log.evaluate((element) => { element.textContent = ''; });

  const card = page.getByTestId('card-0');
  const manaGem = card.locator('.gem');
  // 宝石上直接写「当前/上限」；悬停不弹说明，也不触发任何卡片动作
  await expect(manaGem.locator('.gem-mana')).toHaveText(/^(\d+)\/\1$/);
  await manaGem.hover();
  await expect(page.locator('.status-tooltip')).toHaveCount(0);
  await expect(log).not.toContainText('skill-cast');

  const box = await card.boundingBox();
  if (!box) throw new Error('card-0 无边界');
  const startX = box.x + box.width * 0.75;
  const startY = box.y + box.height * 0.3;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 20, startY, { steps: 3 });
  await page.mouse.up();
  await expect(log).not.toContainText('skill-cast');

  await card.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const init = {
      bubbles: true,
      cancelable: true,
      pointerId: 77,
      pointerType: 'touch',
      clientX: rect.left + rect.width * 0.75,
      clientY: rect.top + rect.height * 0.3,
      button: 0,
    };
    element.dispatchEvent(new PointerEvent('pointerdown', init));
    element.dispatchEvent(new PointerEvent('pointercancel', init));
    element.dispatchEvent(new PointerEvent('pointerup', init));
  });
  await expect(log).not.toContainText('skill-cast');

  // 宝石是卡面的一部分：点它与点卡面其它位置相同（本组用例开着快速释放 → 直接施放）
  await manaGem.click();
  await expect(log).toContainText('skill-cast');
});

test('cast restores board input and does not show a released toast', async ({ page }) => {
  await assignSkill(page, 'dmg-single');
  await page.getByTestId('fill-mana').click();
  const card = page.getByTestId('card-0');
  await expect(card).toHaveClass(/castable/);
  await expect(card.locator('.cast-flag')).toBeHidden();

  await page.evaluate(() => { void (window as unknown as DebugAppWindow).__testPage.app.triggerCast(0); });
  await expect(page.getByTestId('event-log')).toContainText('skill-cast');
  await waitForPlayerTurn(page);
  await expect.poll(() => page.evaluate(() => (
    window as unknown as DebugAppWindow
  ).__testPage.app.input.enabled)).toBe(true);
  await expect(page.locator('.cast-summary')).toHaveCount(0);

  await page.getByTestId('fill-mana').click();
  await page.evaluate(() => { void (window as unknown as DebugAppWindow).__testPage.app.triggerCast(0); });
  await expect(page.getByTestId('event-log')).toContainText('skill-damage');
  await waitForPlayerTurn(page);
  await expect.poll(() => page.evaluate(() => (
    window as unknown as DebugAppWindow
  ).__testPage.app.input.enabled)).toBe(true);
});

test('healing, cleanse, and armor buffs use their finalized numbered frame FX', async ({ page }) => {
  await page.evaluate(() => {
    const state = (window as unknown as DebugAppWindow).__testPage.app.engine.getState() as unknown as {
      teams: { Left: { characters: Array<{ hp: number }> } };
    };
    state.teams.Left.characters[0].hp = Math.max(1, state.teams.Left.characters[0].hp - 10);
  });
  await assignSkill(page, 'heal');
  await page.getByTestId('fill-mana').click();
  await page.evaluate(() => { void (window as unknown as DebugAppWindow).__testPage.app.triggerCast(0); });
  await expect(page.locator('[data-fx="heal_cleanse"]')).toBeVisible();
  await expect(page.getByTestId('event-log')).toContainText('buff');
  await waitForPlayerTurn(page);

  await assignSkill(page, 'cleanse');
  await page.getByTestId('fill-mana').click();
  await page.evaluate(() => { void (window as unknown as DebugAppWindow).__testPage.app.triggerCast(0); });
  await expect(page.locator('[data-fx="heal_cleanse"]')).toBeVisible();
  await expect(page.getByTestId('event-log')).toContainText('净化 → 角色0 poison');
  await waitForPlayerTurn(page);

  await assignSkill(page, 'armor');
  await page.getByTestId('fill-mana').click();
  await page.evaluate(() => { void (window as unknown as DebugAppWindow).__testPage.app.triggerCast(0); });
  await expect(page.locator('[data-fx="armor_up"]').first()).toBeVisible();
  await expect(page.getByTestId('event-log')).toContainText('buff');
});

test('poison, frozen, burning, water single-target, and splash attacks route finalized frame FX', async ({ page }) => {
  test.setTimeout(90_000);
  // 序列帧在开战前已全部加载解码，可直接施放。
  await page.evaluate(() => {
    type FrameFxFn = (name: string, px: number, py: number, opts?: unknown) => void;
    type SplashSwordFn = (
      from: { x: number; y: number },
      to: { x: number; y: number },
      onArrive: () => void,
    ) => void;
    const app = (window as unknown as DebugAppWindow).__testPage.app as unknown as {
      playFrameFX: FrameFxFn;
      playSplashChainSword: SplashSwordFn;
    };
    const marker = window as unknown as { __frameFxCalls: string[] };
    marker.__frameFxCalls = [];
    const original = app.playFrameFX.bind(app);
    app.playFrameFX = (name, px, py, opts) => {
      marker.__frameFxCalls.push(name);
      original(name, px, py, opts);
    };
    const originalSword = app.playSplashChainSword.bind(app);
    app.playSplashChainSword = (from, to, onArrive) => {
      marker.__frameFxCalls.push('splash_chain_sword');
      originalSword(from, to, onArrive);
    };
  });
  const frameFxCalls = () => page.evaluate(() => (
    window as unknown as { __frameFxCalls: string[] }
  ).__frameFxCalls);
  await assignSkill(page, 'poison');
  await page.getByTestId('fill-mana').click();
  await page.evaluate(() => { void (window as unknown as DebugAppWindow).__testPage.app.triggerCast(0); });
  await expect.poll(frameFxCalls).toContain('poison_flash');
  await waitForPlayerTurn(page);

  await page.evaluate(() => {
    const app = (window as unknown as DebugAppWindow).__testPage.app as unknown as {
      audio: { playStatusApply: (statusId: string) => void };
    };
    const marker = window as unknown as { __statusAudioCalls: string[] };
    marker.__statusAudioCalls = [];
    const original = app.audio.playStatusApply.bind(app.audio);
    app.audio.playStatusApply = (statusId) => {
      marker.__statusAudioCalls.push(statusId);
      original(statusId);
    };
  });
  await assignSkill(page, 'frozen');
  await page.getByTestId('fill-mana').click();
  await page.evaluate(() => { void (window as unknown as DebugAppWindow).__testPage.app.triggerCast(0); });
  await expect.poll(frameFxCalls).toContain('frozen_flash');
  expect(await page.evaluate(() =>
    (window as unknown as { __statusAudioCalls: string[] }).__statusAudioCalls,
  )).toContain('frozen');
  await waitForPlayerTurn(page);

  await assignSkill(page, 'burning');
  await page.getByTestId('fill-mana').click();
  await page.evaluate(() => { void (window as unknown as DebugAppWindow).__testPage.app.triggerCast(0); });
  await expect.poll(frameFxCalls).toContain('burning_flash');
  expect(await page.evaluate(() =>
    (window as unknown as { __statusAudioCalls: string[] }).__statusAudioCalls,
  )).toContain('burning');
  await waitForPlayerTurn(page);

  await page.getByTestId('ally-mana-color').selectOption('Blue');
  await page.evaluate(() => {
    type ProjectileFn = (
      from: { x: number; y: number },
      to: { x: number; y: number },
      color: string,
      onArrive: () => void,
    ) => void;
    const app = (window as unknown as DebugAppWindow).__testPage.app as unknown as {
      playProjectile: ProjectileFn;
      audio: { play: (name: string) => void };
    };
    const marker = window as unknown as { __skillProjectileCalls: number; __skillAudioCalls: string[] };
    marker.__skillProjectileCalls = 0;
    marker.__skillAudioCalls = [];
    const originalAudioPlay = app.audio.play.bind(app.audio);
    app.audio.play = (name) => {
      marker.__skillAudioCalls.push(name);
      originalAudioPlay(name);
    };
    const original = app.playProjectile.bind(app);
    app.playProjectile = (...args) => {
      marker.__skillProjectileCalls += 1;
      original(...args);
    };
  });
  await assignSkill(page, 'dmg-single');
  await page.getByTestId('fill-mana').click();
  await page.evaluate(() => { void (window as unknown as DebugAppWindow).__testPage.app.triggerCast(0); });
  await expect.poll(frameFxCalls).toContain('water_single_hit');
  expect(await page.evaluate(() => (window as unknown as { __skillProjectileCalls: number }).__skillProjectileCalls)).toBe(1);
  expect(await page.evaluate(() =>
    (window as unknown as { __skillAudioCalls: string[] }).__skillAudioCalls.filter((name) => name === 'skill').length,
  )).toBe(1); // One projectile whoosh; impact uses the color-specific sample.
  await waitForPlayerTurn(page);

  await page.evaluate(() => {
    const marker = window as unknown as { __skillProjectileCalls: number; __skillAudioCalls: string[] };
    marker.__skillProjectileCalls = 0;
    marker.__skillAudioCalls = [];
  });
  await assignSkill(page, 'dmg-splash');
  await page.getByTestId('fill-mana').click();
  await page.evaluate(() => { void (window as unknown as DebugAppWindow).__testPage.app.triggerCast(0); });
  await page.waitForTimeout(80);
  await page.getByTestId('card-4').click();
  await expect.poll(frameFxCalls).toContain('splash_chain_cast');
  await expect.poll(frameFxCalls).toContain('splash_hit');
  await expect.poll(frameFxCalls).toContain('splash_chain_sword');
  expect(await page.evaluate(() => (window as unknown as { __skillProjectileCalls: number }).__skillProjectileCalls)).toBe(0);
  const splashAudio = await page.evaluate(() =>
    (window as unknown as { __skillAudioCalls: string[] }).__skillAudioCalls,
  );
  expect(splashAudio).not.toContain('skill'); // Splash has its own impact, not a projectile whoosh.
  expect(splashAudio).toContain('splashChainHit');
});

test('single-target hit FX and audio route by caster color', async ({ page }) => {
  test.setTimeout(90_000); // Five casts, each followed by a real AI turn and its animations.
  await assignSkill(page, 'dmg-single');
  await page.evaluate(() => {
    type FrameFxFn = (name: string, px: number, py: number, opts?: unknown) => void;
    const app = (window as unknown as DebugAppWindow).__testPage.app as unknown as {
      audio: { play: (name: string) => void };
      engine: { getState: () => unknown };
      playFrameFX: FrameFxFn;
    };
    const state = app.engine.getState() as {
      teams: { Right: { characters: Array<{ hp: number; maxHp: number; armor: number }> } };
    };
    state.teams.Right.characters[0].hp = 100;
    state.teams.Right.characters[0].maxHp = 100;
    state.teams.Right.characters[0].armor = 0;
    const marker = window as unknown as {
      __singleHitAudioCalls: string[];
      __singleHitAudioAt: Record<string, number>;
      __singleHitFxAt: Record<string, number>;
    };
    marker.__singleHitAudioCalls = [];
    marker.__singleHitAudioAt = {};
    marker.__singleHitFxAt = {};
    const originalAudio = app.audio.play.bind(app.audio);
    app.audio.play = (name) => {
      marker.__singleHitAudioCalls.push(name);
      marker.__singleHitAudioAt[name] = performance.now();
      originalAudio(name);
    };
    const originalFrameFx = app.playFrameFX.bind(app);
    app.playFrameFX = (...args) => {
      marker.__singleHitFxAt[args[0]] = performance.now();
      originalFrameFx(...args);
    };
  });

  const cases = [
    { color: 'Red', fx: 'hit_red', sfx: 'skillHitRedSingle' },
    { color: 'Purple', fx: 'hit_purple', sfx: 'skillHitPurpleSingle' },
    { color: 'Yellow', fx: 'yellow_single_hit', sfx: 'skillHitYellowSingle' },
    { color: 'Blue', fx: 'water_single_hit', sfx: 'skillHitWater' },
    { color: 'Green', fx: 'green_single_hit', sfx: 'skillHitGreenSingle' },
  ] as const;

  for (const item of cases) {
    await page.getByTestId('ally-mana-color').selectOption(item.color);
    await page.getByTestId('fill-mana').click();
    await page.evaluate(() => {
      const marker = window as unknown as {
        __singleHitAudioCalls: string[];
        __singleHitAudioAt: Record<string, number>;
        __singleHitFxAt: Record<string, number>;
      };
      marker.__singleHitAudioCalls = [];
      marker.__singleHitAudioAt = {};
      marker.__singleHitFxAt = {};
      void (window as unknown as DebugAppWindow).__testPage.app.triggerCast(0);
    });
    // Frame nodes live for only 360ms. Assert the stable routing probe rather than hoping
    // Playwright samples the transient DOM during that window under a loaded full-suite run.
    await expect.poll(() => page.evaluate((fx) =>
      (window as unknown as { __singleHitFxAt: Record<string, number> }).__singleHitFxAt[fx] ?? null,
    item.fx)).not.toBeNull();
    await expect.poll(() => page.evaluate((sfx) =>
      (window as unknown as { __singleHitAudioCalls: string[] }).__singleHitAudioCalls.includes(sfx),
    item.sfx)).toBe(true);
    if (item.color === 'Yellow' || item.color === 'Purple') {
      const lead = await page.evaluate(({ sfx, fx }) => {
        const marker = window as unknown as {
          __singleHitAudioAt: Record<string, number>;
          __singleHitFxAt: Record<string, number>;
        };
        return marker.__singleHitFxAt[fx] - marker.__singleHitAudioAt[sfx];
      }, { sfx: item.sfx, fx: item.fx });
      expect(lead).toBeGreaterThan(70);
    }
    await waitForPlayerTurn(page);
  }
});

test('defeat uses effect 0353 slightly above the card center before removal', async ({ page }) => {
  const target = page.getByTestId('card-4');
  const nextCard = page.getByTestId('card-5');
  const targetBox = await target.boundingBox();
  const nextBoxBefore = await nextCard.boundingBox();
  expect(targetBox).not.toBeNull();
  expect(nextBoxBefore).not.toBeNull();
  await page.evaluate(() => {
    const state = (window as unknown as DebugAppWindow).__testPage.app.engine.getState() as unknown as {
      teams: { Right: { characters: Array<{ hp: number; armor: number }> } };
    };
    state.teams.Right.characters[0].hp = 1;
    state.teams.Right.characters[0].armor = 0;
  });

  // Capture geometry when the short-lived frame node mounts; polling the DOM can
  // miss it entirely under load, but removal order and alignment still matter.
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      const fx = document.querySelector<HTMLElement>('[data-fx="death_drift"]');
      if (!fx) return;
      const card = document.querySelector<HTMLElement>('[data-testid="card-4"]');
      const next = document.querySelector<HTMLElement>('[data-testid="card-5"]');
      const r = fx.getBoundingClientRect();
      (window as unknown as { __deathSnapshot: unknown }).__deathSnapshot = {
        targetVisible: !!card && card.getBoundingClientRect().height > 0,
        defeated: card?.classList.contains('defeated'), nextY: next?.getBoundingClientRect().y,
        fx: { x: r.x, y: r.y, width: r.width, height: r.height },
      };
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  await assignSkill(page, 'dmg-single');
  await page.getByTestId('fill-mana').click();
  await page.evaluate(() => { void (window as unknown as DebugAppWindow).__testPage.app.triggerCast(0); });
  await expect.poll(() => page.evaluate(() => (window as unknown as {
    __deathSnapshot?: unknown;
  }).__deathSnapshot ?? null)).not.toBeNull();
  const snapshot = await page.evaluate(() => (window as unknown as {
    __deathSnapshot: { targetVisible: boolean; defeated: boolean; nextY: number; fx: { x: number; y: number; width: number; height: number } };
  }).__deathSnapshot);
  expect(snapshot.targetVisible).toBe(true);
  expect(snapshot.defeated).toBe(true);
  expect(Math.abs(snapshot.nextY - nextBoxBefore!.y)).toBeLessThan(2);
  const fxBox = snapshot.fx;
  expect(Math.abs(fxBox.x + fxBox.width / 2 - (targetBox!.x + targetBox!.width / 2))).toBeLessThan(8);
  expect(Math.abs(fxBox.y + fxBox.height / 2 - (targetBox!.y + targetBox!.height * 0.43))).toBeLessThan(8);
  await expect(page.getByTestId('event-log')).toContainText('defeat');
  await expect(target).toHaveCount(0);
  // 后排递进顶到前面（滑动补位），卡片尺寸不变，空位补在队尾
  await expect.poll(async () => (await nextCard.boundingBox())?.y ?? 0).toBeLessThan((nextBoxBefore?.y ?? 0) - 10);
  const nextBoxAfter = await nextCard.boundingBox();
  if (nextBoxBefore && nextBoxAfter) {
    expect(Math.abs(nextBoxAfter.height - nextBoxBefore.height)).toBeLessThan(2);
    if (targetBox) expect(Math.abs(nextBoxAfter.y - targetBox.y)).toBeLessThan(2);
  }
  const emptySlot = page.locator('.gslot-empty');
  await expect(emptySlot).toHaveCount(1);
  const slotBox = await emptySlot.boundingBox();
  if (nextBoxAfter && slotBox) expect(slotBox.y).toBeGreaterThan(nextBoxAfter.y);
});

test('final gem chain audio previews the full new set and individual levels', async ({ page }) => {
  await expect(page.getByTestId('gem-chain-audio-preview')).toBeVisible();
  await expect(page.getByTestId('gem-chain-mode-legacy')).toHaveCount(0);
  await expect(page.getByTestId('gem-chain-mode-holy')).toHaveCount(0);
  await expect(page.getByTestId('gem-chain-preview-set')).toHaveText('\u8bd5\u542c\u65b0\u7248\u6574\u5957');
  await page.getByTestId('gem-chain-preview-set').click();
  await expect(page.getByTestId('event-log')).toContainText('\u65b0\u7248\u6574\u5957');
  await page.getByTestId('gem-chain-sfx-1').click();
  await expect(page.getByTestId('event-log')).toContainText('1');
  await page.getByTestId('gem-chain-sfx-5').click();
  await expect(page.getByTestId('event-log')).toContainText('5');
  await expect(page.getByTestId('gem-chain-sfx-5')).toHaveAttribute('aria-pressed', 'true');
});

test('brown mana-crystal selector keeps cast flow working', async ({ page }) => {
  const selector = page.getByTestId('ally-mana-color');
  await selector.selectOption('Brown');
  await expect(selector).toHaveValue('Brown');
  await assignAndCast(page, 'dmg-single');
  const log = page.getByTestId('event-log');
  await expect(log).toContainText('skill-cast');
  await expect(log).toContainText('skill-damage');
});

test('拖单体伤害到施法者→短按释放→skill-damage', async ({ page }) => {
  await assignAndCast(page, 'dmg-single');
  const log = page.getByTestId('event-log');
  await expect(log).toContainText('角色0 技能');
  await expect(log).toContainText('skill-cast');
  await expect(log).toContainText('skill-damage');
  await expect(page.locator('[data-fx="hit_red"]')).toBeVisible();
});

test('群体伤害', async ({ page }) => {
  await assignAndCast(page, 'dmg-all');
  await expect(page.getByTestId('event-log')).toContainText('skill-damage');
});

test('中毒施加后按回合结算，超过旧倒计时也不会自然过期', async ({ page }) => {
  test.setTimeout(90_000);
  await assignAndCast(page, 'poison');
  const log = page.getByTestId('event-log');
  await expect(log).toContainText('status-apply → 角色4 poison');
  for (let i = 0; i < 4; i++) {
    await waitForPlayerTurn(page);
    await page.getByTestId('step-turn').click();
    await waitForPlayerTurn(page);
  }
  await expect(log).toContainText('status-tick → 角色4 poison');
  await expect(log).not.toContainText('status-expire → 角色4 poison');
  expect(await page.evaluate(() => {
    const state = (window as unknown as DebugAppWindow).__testPage.app.engine.getState() as unknown as {
      teams: { Right: { characters: Array<{ statuses: Array<{ id: string }> }> } };
    };
    return state.teams.Right.characters[0].statuses.some(s => s.id === 'poison');
  })).toBe(true);
});

test('创造宝石：gem-create 或（满盘）gem-transform', async ({ page }) => {
  await assignAndCast(page, 'gem-create');
  await expect(page.getByTestId('event-log')).toContainText(/gem-(create|transform)/);
});

test('随机摧毁6颗：无需选择，直接产出 gem-destroy', async ({ page }) => {
  await assignAndCast(page, 'gem-destroy-random');
  await expect(page.getByTestId('event-log')).toContainText('gem-destroy');
});

test('随机爆破2行：无需选择，直接产出 gem-explode', async ({ page }) => {
  const mountedFx = await recordFrameFx(page);
  await assignAndCast(page, 'gem-explode-rows');
  await expect.poll(mountedFx).toContain('energy_burst');
  await expect(page.getByTestId('event-log')).toContainText('gem-explode');
  await expectBoardViewSettled(page);
});

test('玩家选目标：拖★选敌伤害→短按释放→点敌方卡→命中该目标', async ({ page }) => {
  await assignAndCast(page, 'dmg-chosen');
  // 主游戏 TargetPicker 高亮候选敌方卡；点敌方丙(id=6)
  await page.getByTestId('card-6').click();
  await expect(page.getByTestId('event-log')).toContainText('skill-damage → 角色6');
});

test('玩家选宝石引爆：拖★选宝石→短按→点棋盘→gem-explode', async ({ page }) => {
  const mountedFx = await recordFrameFx(page);
  await assignAndCast(page, 'gem-boom');
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (box) {
    // 先移动让 CellPicker 的（延迟 60ms 挂载的）点击处理器就绪，再点选，避免竞态
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 6 });
    await page.waitForTimeout(150);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  await expect.poll(mountedFx).toContain('energy_burst');
  await expect(page.getByTestId('event-log')).toContainText('gem-explode');
});

test('玩家选一行摧毁：拖选行技能→短按→棋盘点一行→gem-destroy', async ({ page }) => {
  await assignAndCast(page, 'gem-destroy-row');
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.4, { steps: 6 });
    await page.waitForTimeout(150);
    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.4);
  }
  await expect(page.getByTestId('event-log')).toContainText('gem-destroy');
});

test('点选宝石定色摧毁：拖摧毁指定色→短按→点一颗宝石取其色→gem-destroy', async ({ page }) => {
  const changed = await page.evaluate(async () => {
    const app = (window as unknown as DebugAppWindow).__testPage.app;
    return app.debugSetGems([
      { pos: { row: 3, col: 3 }, type: { kind: 'skull', variant: 'normal' } },
      { pos: { row: 3, col: 4 }, type: { kind: 'color', color: 'Red' } },
    ]);
  });
  expect(changed).toBe(true);
  await assignAndCast(page, 'gem-destroy-color');
  const log = page.getByTestId('event-log');
  await expect(page.locator('.cellaim-overlay')).toBeVisible();
  // CellPicker intentionally delays the global click handler briefly so the cast-opening click cannot self-select.
  await page.waitForTimeout(100);
  const pointFor = (cell: DebugCell) => page.evaluate((target) => {
    const app = (window as unknown as DebugAppWindow).__testPage.app as unknown as {
      getBaseSize(): { w: number; h: number };
      cellAimCoords(): { cellToAim(pos: DebugCell): { x: number; y: number } };
    };
    const wrapper = document.querySelector('.battle-wrapper') as HTMLElement;
    const rect = wrapper.getBoundingClientRect();
    const base = app.getBaseSize();
    const aim = app.cellAimCoords().cellToAim(target);
    return { x: rect.left + aim.x * (rect.width / base.w), y: rect.top + aim.y * (rect.height / base.h) };
  }, cell);

  const skull = await pointFor({ row: 3, col: 3 });
  await page.mouse.move(skull.x, skull.y, { steps: 4 });
  await page.mouse.click(skull.x, skull.y);
  await expect(page.locator('.cellaim-overlay')).toBeVisible();
  await expect(page.locator('.cellaim-hint')).toContainText('这枚宝石不能决定颜色');
  expect(await log.textContent()).not.toContain('gem-destroy');

  const red = await pointFor({ row: 3, col: 4 });
  await page.mouse.move(red.x, red.y, { steps: 4 });
  await page.mouse.click(red.x, red.y);
  await expect(log).toContainText('gem-destroy');
});


test('多段组合器：载入"蓝单体+冰冻"预设→设为技能→释放选敌→伤害先于冰冻', async ({ page }) => {
  // 载入预设组合，组合器列表出现两段
  await page.getByTestId('combo-preset-blue-freeze').click();
  await expect(page.getByTestId('composer-item-0')).toContainText('伤害');
  await expect(page.getByTestId('composer-item-1')).toContainText('冰冻');
  // 组装并设为首个施法者技能，充满法力值后短按释放
  await page.getByTestId('composer-apply').click();
  await page.getByTestId('fill-mana').click();
  await page.waitForTimeout(150);
  await shortPressCard(page, 0);
  await page.waitForTimeout(300);
  // 选目标：点敌方队首(id=4)
  await page.getByTestId('card-4').click();
  const log = page.getByTestId('event-log');
  await expect(log).toContainText('skill-damage → 角色4');
  await expect(log).toContainText('status-apply → 角色4 frozen');
  // 效果段书写顺序：伤害段先于冰冻状态段
  const text = (await log.textContent()) ?? '';
  expect(text.indexOf('skill-damage → 角色4')).toBeLessThan(text.indexOf('frozen'));
});

test('多段组合器：加段/上移/删除后列表顺序正确', async ({ page }) => {
  await page.getByTestId('composer-clear').click();
  const addSeg = async (id: string) => {
    await page.selectOption('[data-testid="composer-seg-select"]', id);
    await page.getByTestId('composer-add').click();
    await page.waitForTimeout(50);
  };
  await addSeg('dmg-all');
  await addSeg('st-burning-all');
  await addSeg('extra-turn');
  await expect(page.getByTestId('composer-item-0')).toContainText('群体伤害');
  await expect(page.getByTestId('composer-item-2')).toContainText('额外回合');
  // 上移额外回合到第 2 位
  await page.getByTestId('composer-up-2').click();
  await expect(page.getByTestId('composer-item-1')).toContainText('额外回合');
  // 删除第 0 项（群体伤害）
  await page.getByTestId('composer-del-0').click();
  await expect(page.getByTestId('composer-item-0')).toContainText('额外回合');
});

test('多段组合器：释放选敌技能后点空白取消，不消耗法力', async ({ page }) => {
  await page.getByTestId('composer-clear').click();
  await page.selectOption('[data-testid="composer-seg-select"]', 'dmg-chosen');
  await page.getByTestId('composer-add').click();
  await page.getByTestId('composer-apply').click();
  await page.getByTestId('fill-mana').click();
  await page.waitForTimeout(150);
  const manaBefore = await page.evaluate(
    () => (window as unknown as DebugAppWindow).__testPage.app.engine.getState().teams.Left.characters[0].mana,
  );
  await shortPressCard(page, 0);
  await page.waitForTimeout(300);
  // 点空白角落取消选目标
  await page.mouse.click(5, 5);
  await page.waitForTimeout(400);
  const manaAfter = await page.evaluate(
    () => (window as unknown as DebugAppWindow).__testPage.app.engine.getState().teams.Left.characters[0].mana,
  );
  expect(manaAfter).toBe(manaBefore);
});
