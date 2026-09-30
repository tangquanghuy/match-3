import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page, turns = 8, fresh = false) {
  await page.goto('/game.html#hunt');
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
  await page.reload();
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
    await page.reload();
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
  await expect(page.locator('#huntResult')).toBeVisible({timeout:12000});
  const after = await snapshot(page);
  expect(after.treasureHunt).toBeNull(); expect(after.currencies.gold).toBeGreaterThan(before.currencies.gold);
  await page.screenshot({path:'artifacts/hunt-result.png'});
  await page.locator('#huntAgain').click();
  await expect(page.locator('#huntResult')).toBeHidden();
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
  await page.goto('/game.html#hunt');
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
  await page.reload();
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
  await expect(page.locator('#huntResult')).toBeVisible();
  await expect(page.locator('#huntTurns')).toHaveText('0');
  const after = await snapshot(page);
  expect(after.treasureHunt).toBeNull();
  await page.locator('#huntAgain').click();
  await expect(page.locator('#huntResult')).toBeHidden();
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
