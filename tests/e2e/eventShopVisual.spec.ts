import { test, expect, type Page } from '@playwright/test';

function currentWeekStart(): number {
  const date = new Date();
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

async function openCleanShop(page: Page): Promise<void> {
  await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
  await page.goto('/game.html');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.goto('/game.html#shop/invasion');
  await expect(page.locator('.event-shop-panel')).toBeVisible();
}

test('货架保留交易信息，用途和持有量进入物品详情', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openCleanShop(page);
  await expect(page.locator('.shop-tab')).toHaveCount(6);
  await expect(page.locator('.shop-goods')).toHaveCount(7);
  await expect(page.locator('.shop-goods-blurb')).toHaveCount(0);
  await expect(page.locator('.shop-grid .shop-reward-copy em')).toHaveCount(0);
  await expect(page.locator('.shop-token-bar')).toContainText('入侵印记');
  await expect(page.locator('.shop-buy.is-poor')).toHaveCount(7);
  await expect(page.locator('.market-switch a.active')).toContainText('活动商店');
  await expect(page.locator('[data-nav="商店"]')).toHaveClass(/active/);
  await page.locator('.shop-goods.featured .shop-goods-art').click();
  await expect(page.locator('#shopItemDialog')).toBeVisible();
  await expect(page.locator('#shopItemContent')).toContainText('入侵专精');
  await expect(page.locator('#shopItemContent .shop-reward.troop')).toContainText(/持有 \d+ → \d+/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#shopItemDialog')).not.toBeVisible();
  await expect(page.locator('.shop-goods.featured .shop-goods-art')).toBeFocused();
  await page.locator('.shop-goods-art').nth(1).click();
  const contrast = await page.locator('#shopItemDialog').evaluate(dialog => {
    const luminance = (rgb: string) => rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number)
      .map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
      .reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i]!, 0);
    const bg = luminance(getComputedStyle(dialog).backgroundColor);
    return [...dialog.querySelectorAll('.shop-reward-copy b, .shop-reward-copy small, .shop-reward-copy em')]
      .map(el => { const fg = luminance(getComputedStyle(el).color); return (Math.max(bg, fg) + .05) / (Math.min(bg, fg) + .05); });
  });
  expect(contrast.length).toBeGreaterThan(0);
  expect(Math.min(...contrast)).toBeGreaterThanOrEqual(4.5);

});

for (const viewport of [{width:1600,height:900},{width:1280,height:720},{width:768,height:1024},{width:390,height:844},{width:320,height:844}]) {
  test(`六家兑换货架留白、等宽卡片与完整操作 ${viewport.width}`, async ({page}) => {
    await page.setViewportSize(viewport);
    await openCleanShop(page);
    for(const [id, count] of Object.entries({invasion: 7, raidBoss: 8, towerOfDoom: 6, factionAssault: 7, worldEvent: 6, classTrials: 6})) {
      await page.goto(`/game.html#shop/${id}`);
      await expect(page.locator('.shop-goods')).toHaveCount(count);
      if (id === 'towerOfDoom') {
        const gold = page.locator('[data-goods-card="tod_gold"]');
        await expect(gold.locator('.shop-reward.gold')).toContainText(/3,?000/);
        await expect(gold.locator('.shop-price')).toContainText('10');
        await expect(gold.locator('.shop-stock')).toBeEmpty();
        await expect(page.locator('[data-goods-card="tod_rare"]')).toHaveCount(0);
        await expect(page.locator('.shop-reward.ingot')).toHaveCount(0);
      }
      await expect(page.locator('.shop-goods.featured')).toHaveCount(1);
      const layout=await page.locator('.event-shop-panel').evaluate(panel=>({
        overflow:panel.scrollWidth-panel.clientWidth,
        gridGap:parseFloat(getComputedStyle(panel.querySelector('.shop-grid')!).gap),
        cards:[...panel.querySelectorAll('.shop-goods')].map(card=>{
          const box=card.getBoundingClientRect();const button=card.querySelector('.shop-buy')!.getBoundingClientRect();
          const price=card.querySelector('.shop-price')!.getBoundingClientRect();
          return {width:box.width,height:box.height,buttonHeight:button.height,buttonWidth:button.width,
            clipped:button.right>box.right||button.bottom>box.bottom||button.left<box.left,
            separate:price.right+4<=button.left};
        })
      }));
      expect(layout.overflow,id).toBeLessThanOrEqual(1);
      expect(layout.gridGap).toBeGreaterThanOrEqual(10);
      for(const card of layout.cards) {
        expect(card.width).toBeCloseTo(layout.cards[0]!.width,0);
        expect(card.height).toBeLessThanOrEqual(220);
        expect(card.buttonHeight).toBeGreaterThanOrEqual(44);
        expect(card.buttonWidth).toBeLessThan(150);
        expect(card.clipped).toBe(false);expect(card.separate).toBe(true);
      }
      await expect(page.locator('.shop-goods .shop-buy').first()).toBeInViewport({ratio:1});
      await expect.poll(()=>page.locator('.shop-grid img').evaluateAll(images=>images.every(img=>(img as HTMLImageElement).complete&&(img as HTMLImageElement).naturalWidth>0))).toBe(true);
      await page.screenshot({path:`artifacts/shop-review-2026-09-25/shop-${id}-${viewport.width}.png`});
      const action=page.locator('.shop-goods .shop-buy').last();await action.scrollIntoViewIfNeeded();
      await expect(action).toBeInViewport({ratio:1});
      await page.screenshot({path:`artifacts/shop-review-2026-09-25/shop-${id}-${viewport.width}-bottom.png`});
    }
  });
}

test('活动商店兑换后同步余额、持有量和售罄状态', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await openCleanShop(page);
  const weekStart = currentWeekStart();
  await page.evaluate((start) => {
    const key = 'gems.meta.save';
    const save = JSON.parse(localStorage.getItem(key)!);
    save.eventWeeks.invasion = {
      weekStart: start,
      points: 0,
      claimed: [],
      wins: 8,
      tokens: 100,
      tokensEarned: 100,
      playRewards: 0,
      bought: {},
      eventData: {},
      runTeam: null,
    };
    localStorage.setItem(key, JSON.stringify(save));
  }, weekStart);
  await page.reload();

  const featured = page.locator('.shop-goods.featured');
  const name = await featured.locator('h3').innerText();
  await featured.locator('.shop-goods-art').click();
  const rewardBefore = await page.locator('#shopItemContent .shop-reward').innerText();
  await page.keyboard.press('Escape');
  const ownedBefore = Number(rewardBefore.match(/持有 (\d+)/)?.[1]);
  await expect(featured.locator('[data-buy="invasion_celestial"]')).toBeEnabled();
  await featured.locator('[data-buy="invasion_celestial"]').click();
  await expect(page.locator('.acquisition-dialog')).toContainText(name);
  await page.locator('.acquisition-dialog footer button').click();
  await expect(page.locator('.shop-token-bar > strong')).toHaveText('40');
  await expect(featured).toHaveClass(/sold-out/);
  await expect(featured.locator('.shop-buy')).toHaveText('待补货');
  await featured.locator('.shop-goods-art').click();
  await expect(page.locator('#shopItemContent .shop-reward')).toContainText(`持有 ${ownedBefore + 1}`);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'artifacts/shop-review-2026-09-25/shop-purchased-1600.png' });
  const afterPurchase = await page.evaluate(()=>localStorage.getItem('gems.meta.save'));
  await featured.locator('.shop-atlas-link').click();
  await expect(page.locator('#cardName')).toHaveText(name);
  await expect(page.locator('#back')).toHaveText('返回活动商店');
  await page.locator('#back').click();
  await expect(page.locator('.shop-goods.featured')).toHaveClass(/sold-out/);
  expect(await page.evaluate(()=>localStorage.getItem('gems.meta.save'))).toBe(afterPurchase);
});

test('手机使用活动选择器，说明弹层显示重置与印记上限', async ({page})=>{
  await page.setViewportSize({width:390,height:844});await openCleanShop(page);
  await expect(page.locator('.shop-tabs')).toBeHidden();
  await page.locator('#shopTypePicker').selectOption('raidBoss');
  await expect(page).toHaveURL(/#shop\/raidBoss$/);
  await page.locator('[data-shop-rules]').click();
  await expect(page.locator('#shopItemContent')).toContainText('/ 360');
  await expect(page.locator('#shopItemContent')).toContainText('活动进度与印记仍在周一 0:00 重置');
  await page.locator('#shopItemDialog footer button').click();
  await expect(page.locator('#shopItemDialog')).not.toBeVisible();
});

test('Weekly token cap survives material purchases; no surplus currency exchange', async ({ page }) => {
  await openCleanShop(page);
  await page.evaluate((weekStart) => {
    const key = 'gems.meta.save'; const save = JSON.parse(localStorage.getItem(key)!);
    save.eventWeeks.invasion = { weekStart, points: 3600, wins: 36, tokens: 10, tokensEarned: 360,
      playRewards: 4, bought: {}, claimed: [], runTeam: null, eventData: { revision: 2 } };
    localStorage.setItem(key, JSON.stringify(save));
  }, currentWeekStart());
  await page.reload();
  await page.locator('[data-shop-rules]').click();
  await expect(page.locator('#shopItemContent')).toContainText('360 / 360');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-action="battle"]')).toHaveCount(0);
  await expect(page.locator('.shop-surplus, [data-buy$="_surplus"]')).toHaveCount(0);
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).currencies.gold);
  await page.locator('[data-buy="invasion_minor"]').click();
  await expect(page.locator('.acquisition-dialog')).toContainText(/\u5df2\u5151\u6362/);
  await page.locator('.acquisition-dialog footer button').click();
  await expect(page.locator('.shop-token-bar > strong')).toHaveText('0');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('gems.meta.save')!).currencies.gold);
  expect(after).toBe(before);
  await page.locator('[data-shop-rules]').click();
  await expect(page.locator('#shopItemContent')).toContainText('360 / 360');
});

for (const width of [1600, 390]) {
  test(`兑换角色图鉴往返及商品筛选 ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: width > 700 ? 900 : 844 });
    await openCleanShop(page);
    for (const shop of ['invasion', 'raidBoss', 'factionAssault', 'worldEvent']) {
      await page.goto(`/game.html#shop/${shop}`);
      await page.locator('[data-shop-category="troop"]').click();
      await expect(page.locator('.shop-goods:visible')).toHaveCount(1);
      const card = page.locator('.shop-goods.featured');
      const name = await card.locator('h3').innerText();
      const link = card.locator('.shop-atlas-link');
      const href = await link.getAttribute('href');
      const before = await page.evaluate(() => localStorage.getItem('gems.meta.save'));
      if(width<700) {
        await page.locator('.event-shop-panel').evaluate(panel=>panel.scrollTop=100);
        const scrollable = await page.locator('.event-shop-panel').evaluate(panel => panel.scrollHeight > panel.clientHeight);
        if (scrollable) await expect.poll(()=>page.locator('.event-shop-panel').evaluate(panel=>panel.scrollTop)).toBeGreaterThan(0);
      }
      const scrollBefore=await page.locator('.event-shop-panel').evaluate(panel=>panel.scrollTop);
      await expect(link).toHaveText('查看图鉴 ↗');
      await link.click();
      await expect(page).toHaveURL(new RegExp(href!+'$'));
      await expect(page.locator('#detail')).toBeVisible();
      await expect(page.locator('#cardName')).toHaveText(name);
      await expect(page.locator('#spellName')).not.toHaveText('—');
      await expect(page.locator('#spellCopy')).not.toBeEmpty();
      await expect(page.locator('#traitList')).not.toBeEmpty();
      await expect(page.locator('#back')).toHaveText('返回活动商店');
      await expect.poll(() => page.locator('#portraitArt').evaluate((img: HTMLImageElement)=>img.complete && img.naturalWidth>0)).toBe(true);
      await page.screenshot({ path: `artifacts/shop-review-2026-09-25/atlas-${shop}-${width}.png` });
      if(width<700) {
        await page.locator('#spellName').scrollIntoViewIfNeeded();
        await page.screenshot({path:`artifacts/shop-review-2026-09-25/atlas-skills-${shop}-${width}.png`});
      }
      // In-session return preserves the selected shelf, scroll position and focus.
      await page.locator('#back').click();
      await expect(page.locator('[data-shop-category="troop"]')).toHaveAttribute('aria-pressed','true');
      await expect(page.locator('.shop-goods:visible')).toHaveCount(1);
      await expect(page.locator('.shop-goods.featured .shop-atlas-link')).toBeFocused();
      await expect.poll(()=>page.locator('.event-shop-panel').evaluate(panel=>panel.scrollTop)).toBeCloseTo(scrollBefore,0);
      await page.locator('.shop-goods.featured .shop-atlas-link').click();
      await page.reload();
      await expect(page.locator('#back')).toHaveText('返回活动商店');
      await page.locator('#back').click();
      await expect(page).toHaveURL(new RegExp(`#shop/${shop}$`));
      expect(await page.evaluate(() => localStorage.getItem('gems.meta.save'))).toBe(before);
      // The modal also offers the atlas link, not just reward quantity.
      await page.locator('.shop-goods.featured .shop-goods-art').click();
      await expect(page.locator('#shopItemDialog .shop-atlas-link')).toHaveAttribute('href', href!);
      await expect.poll(() => page.locator('#shopItemDialog .shop-detail-art img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
      const contained = await page.locator('#shopItemDialog').evaluate(dialog => [...dialog.querySelectorAll('img')].every(img => {
        const a=img.getBoundingClientRect(), b=img.parentElement!.getBoundingClientRect();
        return a.left>=b.left-1 && a.top>=b.top-1 && a.right<=b.right+1 && a.bottom<=b.bottom+1;
      }));
      expect(contained, '图鉴商品弹层图片保持在展示框内').toBe(true);
      await page.screenshot({path:`artifacts/shop-review-2026-09-25/item-${shop}-${width}.png`});
      await page.locator('#shopItemDialog .shop-atlas-link').click();
      await expect(page.locator('#cardName')).toHaveText(name);
      await page.locator('#back').click();
      await page.locator('[data-shop-category="forge"]').click();
      await expect(page.locator('.shop-goods:visible:not([data-category="forge"])')).toHaveCount(0);
      await expect(page.locator('.shop-goods:visible').first()).toBeVisible();
      await page.locator('[data-shop-category="all"]').click();
      await expect(page.locator('.shop-goods:visible')).toHaveCount(shop === 'raidBoss' ? 8 : shop === 'worldEvent' ? 6 : 7);
    }
  });
}

test('货架文字对比、交易区分层及可兑换状态', async ({page}) => {
  await page.setViewportSize({width:1600,height:900});
  await openCleanShop(page);
  await page.evaluate(weekStart => {
    const s=JSON.parse(localStorage.getItem('gems.meta.save')!);
    s.eventWeeks.invasion={weekStart,points:0,claimed:[],wins:10,tokens:100,tokensEarned:100,playRewards:0,bought:{},eventData:{},runTeam:null};
    localStorage.setItem('gems.meta.save',JSON.stringify(s));
  },currentWeekStart());
  await page.reload();
  await expect(page.locator('.shop-goods.ready')).toHaveCount(7);
  const result=await page.locator('.event-shop-panel').evaluate(panel=>{
    const lum=(rgb:string)=>rgb.match(/[\d.]+/g)!.slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i]!,0);
    const selectors='.shop-stock,.shop-reward-copy small,.shop-reward-copy b,.shop-price b,.shop-price small,.shop-troop-meta,.shop-atlas-link,.shop-goods-title h3 button';
    const ratios=[...panel.querySelectorAll<HTMLElement>(selectors)].filter(el=>el.offsetWidth>0).map(el=>{
      let parent:HTMLElement|null=el;
      while(parent && getComputedStyle(parent).backgroundColor==='rgba(0, 0, 0, 0)')parent=parent.parentElement;
      const a=lum(getComputedStyle(el).color),b=lum(getComputedStyle(parent!).backgroundColor);
      return {text:el.textContent,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};
    });
    return {ratios,foot:getComputedStyle(panel.querySelector('.shop-goods-foot')!).backgroundColor,body:getComputedStyle(panel.querySelector('.shop-goods')!).backgroundColor};
  });
  for(const item of result.ratios) expect(item.ratio,item.text!).toBeGreaterThanOrEqual(4.5);
  expect(result.foot).not.toBe(result.body);
  await expect.poll(()=>page.locator('.shop-goods-art img').first().evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  await page.screenshot({path:'artifacts/shop-review-2026-09-25/shop-funded-1600.png'});
});

for (const width of [1280,390]) {
  test(`两天到点自动补货，周进度与印记保留 ${width}`, async ({page}) => {
    await page.setViewportSize({width,height:width>700?720:844});
    await page.clock.install({time:new Date(2026,8,25,23,59,15)});
    await openCleanShop(page);
    await page.evaluate(()=>{
      const s=JSON.parse(localStorage.getItem('gems.meta.save')!);
      const d=new Date(); d.setDate(d.getDate()-((d.getDay()+6)%7)); d.setHours(0,0,0,0);
      s.eventWeeks.invasion={weekStart:d.getTime(),points:120,claimed:[0],wins:8,tokens:200,tokensEarned:360,playRewards:2,bought:{},eventData:{revision:2},runTeam:null};
      s.eventShops={};
      localStorage.setItem('gems.meta.save',JSON.stringify(s));
    });
    await page.reload();
    const oldName=await page.locator('.shop-goods.featured h3').innerText();
    await expect(page.locator('#shopRefreshLabel')).toHaveText('1分钟后刷新');
    await page.locator('[data-buy="invasion_celestial"]').click();
    await expect(page.locator('.acquisition-dialog')).toBeVisible();
    await page.locator('.acquisition-dialog footer button').click();
    await expect(page.locator('.shop-goods.featured .shop-buy')).toHaveText('待补货');
    await expect(page.locator('.shop-token-bar strong')).toHaveText('140');
    const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('gems.meta.save')!).eventWeeks.invasion);
    await page.clock.fastForward(46_000);
    await expect(page.locator('[data-buy="invasion_celestial"]')).toBeEnabled();
    await expect(page.locator('.shop-goods.featured h3')).not.toHaveText(oldName);
    await expect(page.locator('.shop-goods.featured .shop-stock')).toHaveText('本期剩 1');
    await expect(page.locator('#shopRefreshLabel')).toHaveText('48小时后刷新');
    await expect(page.locator('.shop-token-bar strong')).toHaveText('140');
    expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('gems.meta.save')!).eventWeeks.invasion)).toEqual(before);
    await expect.poll(()=>page.locator('.shop-goods.featured img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
    await page.screenshot({path:`artifacts/shop-two-day-refresh-2026-09-25/restocked-${width}.png`});
    await page.locator('[data-buy="invasion_celestial"]').click();
    await expect(page.locator('.acquisition-dialog')).toBeVisible();
    await page.locator('.acquisition-dialog footer button').click();
    await expect(page.locator('.shop-token-bar strong')).toHaveText('80');
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('gems.meta.save')!));
    expect(after.eventWeeks.invasion).toMatchObject({points:120,wins:8,tokensEarned:360,claimed:[0],playRewards:2});
    expect(after.eventShops.invasion.bought.invasion_celestial).toBe(1);
    await page.reload();
    await expect(page.locator('.shop-goods.featured .shop-buy')).toHaveText('待补货');
    await page.locator('[data-shop-rules]').click();
    await expect(page.locator('#shopItemContent')).toContainText('货品每两天刷新');
    await expect(page.locator('#shopItemContent')).toContainText('活动进度与印记仍在周一 0:00 重置');
    await page.screenshot({path:`artifacts/shop-two-day-refresh-2026-09-25/rules-${width}.png`});
  });
}

test('跨期旧按钮先更新货架，不扣款也不误兑新角色', async ({page}) => {
  await page.clock.install({time:new Date(2026,8,25,23,59,15)});
  await openCleanShop(page);
  await page.evaluate(()=>{
    const s=JSON.parse(localStorage.getItem('gems.meta.save')!);
    const d=new Date(); d.setDate(d.getDate()-((d.getDay()+6)%7)); d.setHours(0,0,0,0);
    s.eventWeeks.invasion={weekStart:d.getTime(),points:0,claimed:[],wins:8,tokens:200,tokensEarned:200,playRewards:0,bought:{},eventData:{revision:2},runTeam:null};
    s.eventShops={}; localStorage.setItem('gems.meta.save',JSON.stringify(s));
  });
  await page.reload();
  const before=await page.evaluate(()=>localStorage.getItem('gems.meta.save'));
  const oldName=await page.locator('.shop-goods.featured h3').innerText();
  await page.clock.setSystemTime(new Date(2026,8,26,0,0,1));
  await page.locator('[data-buy="invasion_celestial"]').evaluate((button:HTMLButtonElement)=>button.click());
  await expect(page.locator('.shop-goods.featured h3')).not.toHaveText(oldName);
  await expect(page.locator('.shop-token-bar strong')).toHaveText('200');
  expect(await page.evaluate(()=>localStorage.getItem('gems.meta.save'))).toBe(before);
});
