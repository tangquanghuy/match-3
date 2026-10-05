import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page, turns = 8, fresh = false) {
  await page.goto('/game.html#hunt', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#huntBoard')).toHaveAttribute('data-ready', 'true', { timeout: 25000 });
  await page.evaluate(async ({ turns, fresh }) => {
    const path = '/src/meta/gateway/index.ts';
    const { metaGateway } = await import(/* @vite-ignore */ path);
    const gateway = metaGateway();
    const save = JSON.parse(gateway.exportSaveJson());
    save.materials.treasureMaps = 2;
    const cells = Array.from({ length: 64 }, (_, i) => (Math.floor(i / 8) + i % 8) % 2);
    cells[1] = 0;
    save.treasureHunt = fresh ? null : { cells, turns, moves: turns === 1 ? 14 : 0, rng: 2 };
    await gateway.dev.importSaveJson(JSON.stringify(save));
  }, { turns, fresh });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#huntBoard')).toHaveAttribute('data-ready', 'true', { timeout: 25000 });
}

async function snapshot(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!));
}
async function swap(page: Page, from: number, to: number, drag = true) {
  const box = (await page.getByTestId('hunt-canvas').boundingBox())!;
  const point = (i: number) => ({ x: box.x + (i % 8 + .5) * box.width / 8, y: box.y + (Math.floor(i / 8) + .5) * box.height / 8 });
  const a = point(from), b = point(to);
  if (drag) { await page.mouse.move(a.x,a.y); await page.mouse.down(); await page.mouse.move(b.x,b.y,{steps:8}); await page.mouse.up(); }
  else { await page.mouse.click(a.x,a.y); await page.mouse.click(b.x,b.y); }
}

for (const viewport of [{ width:1440,height:900 }, { width:390,height:844 }, { width:844,height:390 }]) {
  test(`shared battle canvas, merge, resume and layout ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await setup(page);
    await expect(page.locator('.gcard,.hunt-cell')).toHaveCount(0);
    await expect(page.locator('#huntGate')).toBeHidden();
    const box = (await page.getByTestId('hunt-canvas').boundingBox())!;
    expect(box.width).toBeGreaterThan(Math.min(viewport.width,viewport.height) * .79);
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    await page.screenshot({path:`artifacts/hunt-board-${viewport.width}.png`});
    await swap(page,1,9,viewport.width !== 390);
    await expect(page.locator('#huntMoves')).toHaveText('已走 1 步', {timeout:12000});
    await expect(page.locator('#huntTurns')).toHaveText('7');
    await expect(page.locator('#huntBoard')).toHaveAttribute('aria-busy','false');
    const saved = await snapshot(page);
    expect(saved.treasureHunt.moves).toBe(1); expect(saved.materials.treasureMaps).toBe(2);
    await page.screenshot({path:`artifacts/hunt-merged-${viewport.width}.png`});
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#huntBoard')).toHaveAttribute('data-ready','true', {timeout:25000});
    await expect(page.locator('#huntMoves')).toHaveText('已走 1 步');
    expect((await snapshot(page)).treasureHunt).toEqual(saved.treasureHunt);
    await page.locator('#huntHelp').click(); await expect(page.locator('#huntRules')).toBeVisible();
    await page.screenshot({path:`artifacts/hunt-rules-${viewport.width}.png`});
    await page.locator('#huntCloseRules').click();
    expect(errors).toEqual([]);
  });
}

test('rejected move costs nothing, then final merge settles rewards only once', async ({page}) => {
  await setup(page,1);
  const before = await snapshot(page);
  const invalid = await page.evaluate(async () => {
    const path = '/src/meta/systems/treasureHunt.ts'; const {applyMove} = await import(/* @vite-ignore */ path);
    const state = JSON.parse(localStorage.getItem('gems.meta.save')!).treasureHunt;
    for(let i=0;i<63;i++) if(i%8<7 && !applyMove(state,i,i+1).ok) return [i,i+1];
    throw new Error('No rejected pair');
  });
  await swap(page,invalid[0],invalid[1]);
  await expect(page.locator('#huntFeedback')).toContainText('换不成');
  await expect(page.locator('#huntBoard')).toHaveAttribute('aria-busy','false');
  expect((await snapshot(page)).treasureHunt).toEqual(before.treasureHunt);
  await swap(page,1,9);
  await expect(page.locator('.result-screen')).toBeVisible({timeout:12000});
  const after = await snapshot(page);
  expect(after.treasureHunt).toBeNull(); expect(after.currencies.gold).toBeGreaterThan(before.currencies.gold);
  await page.screenshot({path:'artifacts/hunt-result.png'});
  await expect(page.locator('#resultTitle')).toHaveText('寻宝收获');
  await expect(page.locator('#standardXp')).toHaveCount(0);
  await page.locator('#again').click();
  await expect(page).toHaveURL(/#hunt/);
  await expect(page.locator('#huntBegin')).toBeEnabled();
  expect((await snapshot(page)).materials.treasureMaps).toBe(after.materials.treasureMaps);
  await page.locator('#huntBegin').click();
  await expect(page.locator('#huntGate')).toBeHidden();
  expect((await snapshot(page)).materials.treasureMaps).toBe(1);
  expect((await snapshot(page)).currencies.gold).toBe(after.currencies.gold);
});

test('map artwork, fresh entry and leaving during playback', async ({page}) => {
  const errors: string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await setup(page,8,true);
  await expect(page.locator('.hunt-cover-art')).toHaveAttribute('src',/daily\/hunt/);
  await page.screenshot({path:'artifacts/hunt-entry.png'});
  await page.locator('#huntBegin').click();
  await expect(page.locator('#huntGate')).toBeHidden();
  expect((await snapshot(page)).materials.treasureMaps).toBe(1);
  await page.screenshot({path:'artifacts/hunt-random-board.png'});
  await setup(page);
  await swap(page,1,9);
  await page.locator('.hunt-toolbar .hunt-back').click();
  await expect(page).toHaveURL(/#map/);
  await page.waitForTimeout(700);
  await page.goto('/game.html#hunt', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#huntBoard')).toHaveAttribute('data-ready','true', {timeout:25000});
  await expect(page.locator('#huntMoves')).toHaveText('已走 1 步');
  expect(errors).toEqual([]);
});


test('vaults stay locked and input is locked throughout merging', async ({page}) => {
  await setup(page);
  await page.evaluate(async () => {
    const path = '/src/meta/gateway/index.ts';
    const {metaGateway} = await import(/* @vite-ignore */ path);
    const gateway = metaGateway(), save = JSON.parse(gateway.exportSaveJson());
    save.treasureHunt.cells[63] = 7;
    await gateway.dev.importSaveJson(JSON.stringify(save));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#huntBoard')).toHaveAttribute('data-ready','true', {timeout:25000});
  const before = await snapshot(page);
  await swap(page,63,62);
  await swap(page,62,63);
  await page.waitForTimeout(300);
  expect((await snapshot(page)).treasureHunt).toEqual(before.treasureHunt);
  await swap(page,1,9);
  await expect(page.locator('#huntBoard')).toHaveAttribute('aria-busy','true');
  await swap(page,20,21);
  await expect(page.locator('#huntBoard')).toHaveAttribute('aria-busy','false');
  expect((await snapshot(page)).treasureHunt.moves).toBe(1);
  await expect(page.locator('#huntMoves')).toHaveText('已走 1 步');
});

test('a presentation failure still shows the already committed final reward', async ({page}) => {
  await setup(page,1);
  await page.evaluate(async () => {
    const path = '/src/render/HuntBoardScene.ts';
    const {HuntBoardScene} = await import(/* @vite-ignore */ path);
    HuntBoardScene.prototype.play = async () => { throw new Error('test presentation failure'); };
  });
  await swap(page,1,9);
  await expect(page.locator('.result-screen')).toBeVisible();
  await expect(page.locator('#resultSub')).toContainText('已走 15 步');
  const after = await snapshot(page);
  expect(after.treasureHunt).toBeNull();
  await expect(page.locator('#resultTitle')).toHaveText('寻宝收获');
  await expect(page.locator('#standardXp')).toHaveCount(0);
  await page.locator('#again').click();
  await expect(page).toHaveURL(/#hunt/);
  await expect(page.locator('#huntBegin')).toBeEnabled();
  expect((await snapshot(page)).materials.treasureMaps).toBe(after.materials.treasureMaps);
  await page.locator('#huntBegin').click();
  await expect(page.locator('#huntGate')).toBeHidden();
  expect((await snapshot(page)).currencies.gold).toBe(after.currencies.gold);
});


test.describe('mobile touch gestures', () => {
  test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  for (const gesture of ['tap','drag'] as const) {
    test(gesture + ' uses the same battle input without scrolling the page', async ({page}) => {
      await setup(page);
      const box = (await page.getByTestId('hunt-canvas').boundingBox())!;
      const x=box.x+1.5*box.width/8, y=box.y+.5*box.height/8, dy=box.height/8;
      if(gesture==='tap') {
        await page.touchscreen.tap(x,y);await page.touchscreen.tap(x,y+dy);
      } else {
        const cdp=await page.context().newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
        for(let i=1;i<=8;i++) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy*i/8}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await cdp.detach();
      }
      await expect(page.locator('#huntMoves')).toHaveText('已走 1 步');
      expect(await page.evaluate(()=>window.scrollY)).toBe(0);
      expect((await snapshot(page)).materials.treasureMaps).toBe(2);
    });
  }
});


test('single soft-cap target and cooling progress survive a move and page reload', async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => {
    const path = '/src/meta/gateway/index.ts';
    const { metaGateway } = await import(/* @vite-ignore */ path);
    const gateway = metaGateway();
    const save = JSON.parse(gateway.exportSaveJson());
    save.treasureHunt.softCap = { target: 7, peak: 7, activeMoves: 2 };
    await gateway.dev.importSaveJson(JSON.stringify(save));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#huntBoard')).toHaveAttribute('data-ready', 'true', { timeout: 25000 });
  await swap(page, 1, 9);
  await expect(page.locator('#huntMoves')).toHaveText('已走 1 步', { timeout: 12000 });
  await expect(page.locator('#huntBoard')).toHaveAttribute('aria-busy', 'false');
  const played = await snapshot(page);
  expect(played.treasureHunt.softCap).toEqual({ target: 7, peak: 7, activeMoves: 3 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#huntBoard')).toHaveAttribute('data-ready', 'true', { timeout: 25000 });
  expect((await snapshot(page)).treasureHunt).toEqual(played.treasureHunt);
});

for (const width of [1440, 390, 320]) {
  test(`fixed high-tier currency rewards and sparse material rules ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await setup(page, 1);
    const expected = await page.evaluate(async () => {
      const path = '/src/meta/systems/treasureHunt.ts';
      const { commitMove } = await import(/* @vite-ignore */ path);
      const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
      save.treasureHunt.cells[54] = 4;
      save.treasureHunt.cells[55] = 5;
      save.treasureHunt.cells[56] = 6;
      save.treasureHunt.cells[63] = 7;
      save.treasureHunt.moves = 2999;
      let found: { chestCount: number; stones: Record<string, number> } | null = null;
      for (let seed = 1; seed <= 1000; seed++) {
        save.treasureHunt.rng = seed;
        const result = commitMove(structuredClone(save), 1, 9);
        if (result.ok && result.grant && Object.values(result.grant.traitstones).reduce((sum:number,n)=>sum+Number(n),0)>=3) { found = { chestCount: result.cells.filter((tier:number)=>tier>=4).length, stones: result.grant.traitstones }; break; }
      }
      if (!found) throw new Error('No material-reward seed found');
      localStorage.setItem('gems.meta.save', JSON.stringify(save));
      return found;
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#huntBoard')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('#huntTreasures')).toHaveText('红箱 1 · 金库 1');
    await expect(page.locator('#huntStones')).toHaveCount(0);
    const counter = (await page.locator('#huntTreasures').boundingBox())!;
    expect(counter.x).toBeGreaterThanOrEqual(0);
    expect(counter.x + counter.width).toBeLessThanOrEqual(width + 1);
    await page.locator('#huntHelp').click();
    const rules = page.locator('#huntRules');
    await expect(rules).toContainText('每件宝物同时获得下表全部货币');
    await expect(rules).toContainText('35,000 黄金 + 1,050 灵魂 + 210 荣耀 + 70 宝石');
    await expect(rules).toContainText('140,000 黄金 + 3,500 灵魂 + 700 荣耀 + 210 宝石');
    await expect(rules).toContainText('各自独立判定特质石掉落');
    await expect(rules).toContainText('一局可获得多颗');
    await expect(rules.locator('li').nth(4)).toContainText('初级石 20%、高级石 5%');
    await expect(rules.locator('li').nth(5)).toContainText('初级石 15%、高级石 10%');
    await expect(rules.locator('li').nth(6)).toContainText('高级石 10%、符文石 8%、秘法石 2%、圣辉石 0.5%');
    await expect(rules.locator('li').nth(7)).toContainText('高级石 10%、符文石 8%、秘法石 2%、圣辉石 0.5%');
    await expect(rules).not.toContainText('每完成 15 次交换');
    await expect(rules).not.toContainText('随机开出以下一项');
    await rules.locator('li').last().scrollIntoViewIfNeeded();
    const overflow = await rules.evaluate(el => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `artifacts/hunt-reward-rules-${width}.png` });
    await rules.evaluate(el => { el.scrollTop = 0; });
    await page.locator('#huntCloseRules').click();
    const before = await snapshot(page);
    await swap(page, 1, 9);
    await expect(page.locator('.result-screen')).toBeVisible({ timeout: 12000 });
    const after = await snapshot(page);
    expect(after.treasureHunt).toBeNull();
    for (const [key, minimum, name] of [
      ['gold', 175000, '黄金'], ['souls', 4550, '灵魂'], ['glory', 910, '荣耀'], ['gems', 280, '宝石'],
    ] as const) {
      const paid = after.currencies[key] - before.currencies[key];
      expect(paid).toBeGreaterThanOrEqual(minimum);
      const card = page.locator(`[data-battle-currency="${key}"]`);
      await expect(card).toContainText(name);
      await expect(card.locator('strong')).toHaveText(`+${paid.toLocaleString('en-US')}`);
    }
    const stoneCount = (save: typeof after) => Object.values(save.materials.traitstones as Record<string, number>).reduce((a, b) => a + b, 0);
    expect(stoneCount(after) - stoneCount(before)).toBeGreaterThanOrEqual(3);
    expect(stoneCount(after) - stoneCount(before)).toBeLessThanOrEqual(expected.chestCount);
    for (const [key, quantity] of Object.entries(expected.stones)) expect(after.materials.traitstones[key] - (before.materials.traitstones[key] ?? 0)).toBe(quantity);
    for (const [key, quantity] of Object.entries(after.materials.traitstones) as [string, number][]) {
      const added = quantity - (before.materials.traitstones[key] ?? 0);
      if (added <= 0) continue;
      const card = page.locator(`[data-battle-material="stone:${key}"]`);
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator('strong')).toHaveText(`+${added}`);
      await expect(card.locator('img').first()).toBeVisible();
    }
    await expect(page.locator('#standardXp')).toHaveCount(0);
    await expect(page.locator('#team')).toHaveText('返回地图');
    await expect(page.locator('#huntResult')).toHaveCount(0);
    expect(await page.locator('#standardRewards').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `artifacts/hunt-reward-result-${width}.png` });
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect((await snapshot(page)).currencies).toEqual(after.currencies);
    expect((await snapshot(page)).materials.traitstones).toEqual(after.materials.traitstones);
  });
}


for (const viewport of [{width:1440,height:900},{width:390,height:844},{width:320,height:568},{width:844,height:390}]) {
  test(`manual finish pays current board, cancel preserves it, layout ${viewport.width}`, async ({page}) => {
    await page.setViewportSize(viewport);
    await setup(page, 20);
    const expected = await page.evaluate(async () => {
      const path = '/src/meta/systems/treasureHunt.ts';
      const { finishHunt } = await import(/* @vite-ignore */ path);
      const save = JSON.parse(localStorage.getItem('gems.meta.save')!);
      save.treasureHunt.cells[54] = 4; save.treasureHunt.cells[55] = 5;
      save.treasureHunt.cells[56] = 6; save.treasureHunt.cells[63] = 7;
      const result = finishHunt(structuredClone(save));
      if (!result.ok) throw new Error(result.message);
      localStorage.setItem('gems.meta.save', JSON.stringify(save));
      return result.grant;
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await expect(page.locator('#huntBoard')).toHaveAttribute('data-ready','true');
    const before = await snapshot(page);
    const finish = page.locator('#huntFinish');
    await expect(finish).toBeVisible();
    const box = (await finish.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    const canvas = (await page.getByTestId('hunt-canvas').boundingBox())!;
    // Landscape places the action beside the board; portrait/desktop place it below.
    const disjoint = canvas.y + canvas.height <= box.y || box.y + box.height <= canvas.y
      || canvas.x + canvas.width <= box.x || box.x + box.width <= canvas.x;
    expect(disjoint).toBe(true);
    await page.screenshot({path:`artifacts/hunt-finish-board-${viewport.width}.png`});
    await finish.click();
    await expect(page.locator('#huntEndDialog')).toBeVisible();
    await expect(page.locator('#huntEndDialog')).toContainText('当前棋盘');
    await page.locator('#huntEndCancel').click();
    expect((await snapshot(page)).treasureHunt).toEqual(before.treasureHunt);
    expect((await snapshot(page)).currencies).toEqual(before.currencies);
    await finish.click();
    await page.screenshot({path:`artifacts/hunt-finish-dialog-${viewport.width}.png`});
    await page.locator('#huntEndConfirm').click();
    await expect(page.locator('.result-screen')).toBeVisible();
    const after = await snapshot(page);
    expect(after.treasureHunt).toBeNull();
    expect(after.materials.treasureMaps).toBe(before.materials.treasureMaps);
    for (const key of ['gold','souls','glory','gems'] as const) {
      expect(after.currencies[key] - before.currencies[key]).toBe(expected![key]);
      await expect(page.locator(`[data-battle-currency="${key}"] strong`)).toHaveText(`+${expected![key].toLocaleString('en-US')}`);
    }
    const stones = {...before.materials.traitstones};
    for (const [key, amount] of Object.entries(expected!.traitstones)) stones[key] = (stones[key] ?? 0) + amount;
    expect(after.materials.traitstones).toEqual(stones);
    await page.reload({waitUntil:'domcontentloaded'});
    expect((await snapshot(page)).currencies).toEqual(after.currencies);
    expect((await snapshot(page)).treasureHunt).toBeNull();
  });
}

test('manual finish network failure preserves board and permits retry', async ({page}) => {
  await setup(page, 20);
  const before = await snapshot(page);
  await page.evaluate(async () => {
    const path='/src/meta/gateway/index.ts';
    const gateway=(await import(/* @vite-ignore */ path)).metaGateway();
    const original=gateway.finishTreasureHunt.bind(gateway);
    let first=true;
    gateway.finishTreasureHunt=async () => {
      if(first) {first=false;throw new Error('simulated offline');}
      return original();
    };
  });
  await page.locator('#huntFinish').click();
  await page.locator('#huntEndConfirm').click();
  await expect(page.locator('#huntEndConfirm')).toBeEnabled();
  await expect(page.locator('#huntEndDialog')).toBeVisible();
  expect((await snapshot(page)).treasureHunt).toEqual(before.treasureHunt);
  expect((await snapshot(page)).currencies).toEqual(before.currencies);
  await page.locator('#huntEndConfirm').click();
  await expect(page.locator('.result-screen')).toBeVisible();
  expect((await snapshot(page)).treasureHunt).toBeNull();
});

test('manual finish lost receipt synchronizes paid state without keeping a stale board', async ({page}) => {
  await setup(page, 20);
  await page.evaluate(async () => {
    const path='/src/meta/gateway/index.ts';
    const gateway=(await import(/* @vite-ignore */ path)).metaGateway();
    const original=gateway.finishTreasureHunt.bind(gateway);
    gateway.finishTreasureHunt=async () => {await original();throw new Error('simulated lost receipt');};
  });
  const before = await snapshot(page);
  await page.locator('#huntFinish').click();
  await page.locator('#huntEndConfirm').click();
  await expect(page).toHaveURL(/#map$/);
  const paid = await snapshot(page);
  expect(paid.treasureHunt).toBeNull();
  expect(paid.currencies.gold).toBeGreaterThan(before.currencies.gold);
  await page.reload({waitUntil:'domcontentloaded'});
  expect((await snapshot(page)).currencies).toEqual(paid.currencies);
});

for (const width of [1280, 390]) {
  test(`reserve keeps its wording and updates today's remaining amounts without reloading ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await setup(page, 8, true);
    await expect(page.locator('.hunt-reserve > span:first-child')).toHaveText('宝藏储量：');
    await expect(page.locator('.hunt-reserve em')).toHaveText(['金币', '钻石', '荣耀']);
    await expect(page.locator('#huntReserveGold')).toHaveText('80万');
    await expect(page.locator('#huntReserveGems')).toHaveText('1,000');
    await expect(page.locator('#huntReserveGlory')).toHaveText('4,000');

    await page.evaluate(async () => {
      const gatewayPath = '/src/meta/gateway/index.ts';
      const { metaGateway, todayStartOf } = await import(/* @vite-ignore */ gatewayPath);
      const gateway = metaGateway();
      const save = JSON.parse(gateway.exportSaveJson());
      save.treasureHuntDaily = { dayStart: todayStartOf(gateway.now()), gold: 123456, gems: 321, glory: 2345 };
      await gateway.dev.importSaveJson(JSON.stringify(save));
    });
    await expect(page.locator('#huntReserveGold')).toHaveText('67.6544万');
    await expect(page.locator('#huntReserveGems')).toHaveText('679');
    await expect(page.locator('#huntReserveGlory')).toHaveText('1,655');
    await page.screenshot({ path: `artifacts/art-gen/treasure-v4/live-reserve-${width}.png` });
    for (const amount of await page.locator('.hunt-reserve-amount').all()) {
      const number = (await amount.locator('b').boundingBox())!;
      const unit = (await amount.locator('em').boundingBox())!;
      expect(unit.y).toBeLessThan(number.y + number.height);
      expect(unit.x + unit.width).toBeLessThanOrEqual(width);
    }

    await page.evaluate(async () => {
      const gatewayPath = '/src/meta/gateway/index.ts';
      const { metaGateway, todayStartOf } = await import(/* @vite-ignore */ gatewayPath);
      const gateway = metaGateway();
      const save = JSON.parse(gateway.exportSaveJson());
      save.treasureHuntDaily = { dayStart: todayStartOf(gateway.now()), gold: 799999, gems: 1000, glory: 4000 };
      await gateway.dev.importSaveJson(JSON.stringify(save));
    });
    await expect(page.locator('#huntReserveGold')).toHaveText('0.0001万');
    await expect(page.locator('#huntReserveGems')).toHaveText('0');
    await expect(page.locator('#huntReserveGlory')).toHaveText('0');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#huntReserveGold')).toHaveText('0.0001万');
    await expect(page.locator('#huntReserveGlory')).toHaveText('0');
  });
}

test('reserve refreshes across the calibrated game-day boundary while the gate stays open', async ({ page }) => {
  await setup(page, 8, true);
  await page.evaluate(async () => {
    const gatewayPath = '/src/meta/gateway/index.ts';
    const { metaGateway, todayStartOf, DAY_MS } = await import(/* @vite-ignore */ gatewayPath);
    const gateway = metaGateway();
    const dayStart = todayStartOf(gateway.now());
    const save = JSON.parse(gateway.exportSaveJson());
    save.treasureHuntDaily = { dayStart, gold: 800000, gems: 1000, glory: 4000 };
    await gateway.dev.importSaveJson(JSON.stringify(save));
    gateway.now = () => dayStart + DAY_MS - 1;
  });
  await expect(page.locator('#huntReserveGold')).toHaveText('0万');
  await expect(page.locator('#huntReserveGems')).toHaveText('0');
  await expect(page.locator('#huntReserveGlory')).toHaveText('0');
  const before = (await snapshot(page)).treasureHuntDaily;
  await page.evaluate(async () => {
    const gatewayPath = '/src/meta/gateway/index.ts';
    const { metaGateway } = await import(/* @vite-ignore */ gatewayPath);
    const gateway = metaGateway();
    const nextDay = gateway.now() + 1;
    gateway.now = () => nextDay;
  });
  await expect(page.locator('#huntReserveGold')).toHaveText('80万');
  await expect(page.locator('#huntReserveGems')).toHaveText('1,000');
  await expect(page.locator('#huntReserveGlory')).toHaveText('4,000');
  expect((await snapshot(page)).treasureHuntDaily).toEqual(before);
});

test('approved treasure WebP assets load in the rule list and on the shared board', async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => {
    const gatewayPath = '/src/meta/gateway/index.ts';
    const { metaGateway } = await import(/* @vite-ignore */ gatewayPath);
    const gateway = metaGateway();
    const save = JSON.parse(gateway.exportSaveJson());
    save.treasureHunt.cells = Array.from({ length: 64 }, (_, i) => (i + Math.floor(i / 8)) % 8);
    await gateway.dev.importSaveJson(JSON.stringify(save));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#huntBoard')).toHaveAttribute('data-ready', 'true', { timeout: 25000 });
  await page.screenshot({ path: 'artifacts/art-gen/treasure-v12/in-game-board.png' });
  // Coin-heavy arrangement catches visual noise that an all-tier board hides.
  await page.evaluate(async () => {
    const gatewayPath = '/src/meta/gateway/index.ts';
    const { metaGateway } = await import(/* @vite-ignore */ gatewayPath);
    const gateway = metaGateway();
    const save = JSON.parse(gateway.exportSaveJson());
    save.treasureHunt.cells = [
      1,0,0,1,1,2,3,3, 1,0,2,1,3,3,0,4,
      2,2,1,3,3,0,0,3, 3,0,4,0,1,2,0,4,
      4,0,4,1,3,0,4,2, 2,2,5,2,4,0,4,1,
      2,0,4,1,0,2,5,1, 0,0,5,1,6,1,7,3,
    ];
    await gateway.dev.importSaveJson(JSON.stringify(save));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#huntBoard')).toHaveAttribute('data-ready', 'true', { timeout: 25000 });
  await page.screenshot({ path: 'artifacts/art-gen/treasure-v12/in-game-coin-board.png' });

  await page.locator('#huntHelp').click();
  const icons = page.locator('#huntRules li > img');
  await expect(icons).toHaveCount(8);
  await expect.poll(() => icons.evaluateAll(images => images.every(image => {
    const img = image as HTMLImageElement;
    return img.complete && img.naturalWidth === 256 && img.currentSrc.includes('.webp');
  }))).toBe(true);
});

test('shared auto and speed controls play hunt, persist and stop when toggled off', async ({ page }) => {
  await setup(page);
  const speed = page.locator('#huntSpeed');
  const auto = page.locator('#huntAuto');
  await expect(speed).toHaveText('1×');
  await speed.click();
  await speed.click();
  await expect(speed).toHaveText('3×');
  expect(await page.evaluate(() => localStorage.getItem('battle.speed'))).toBe('3');
  expect(await page.evaluate(async () => {
    const path = '/src/render/battleSpeed.ts';
    const { getBattleSpeed } = await import(/* @vite-ignore */ path);
    return getBattleSpeed();
  })).toBe(3);
  await auto.click();
  await expect(auto).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#huntMoves')).not.toHaveText('已走 0 步', { timeout: 12000 });
  await auto.click();
  await expect(auto).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#huntBoard')).toHaveAttribute('aria-busy', 'false', { timeout: 12000 });
  const count = (await snapshot(page)).treasureHunt?.moves;
  await page.waitForTimeout(750);
  expect((await snapshot(page)).treasureHunt?.moves).toBe(count);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('#huntBoard')).toHaveAttribute('data-ready', 'true', { timeout: 25000 });
  await expect(speed).toHaveText('3×');
  await expect(auto).toHaveAttribute('aria-pressed', 'false');
  const move = await page.evaluate(async () => {
    const path = '/src/meta/systems/treasureHunt.ts';
    const { chooseHuntAutoMove } = await import(/* @vite-ignore */ path);
    const state = JSON.parse(localStorage.getItem('gems.meta.save')!).treasureHunt;
    return chooseHuntAutoMove(state.cells);
  });
  expect(move).not.toBeNull();
  await swap(page, move![0], move![1]);
  await expect(page.locator('#huntMoves')).not.toHaveText(`已走 ${count} 步`, { timeout: 12000 });
});
