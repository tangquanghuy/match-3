import { test,expect } from '@playwright/test';
for(const viewport of [{width:1600,height:1000},{width:390,height:844}]) {
 test(`愿望单全流程 ${viewport.width}`,async({page})=>{
  await page.setViewportSize(viewport);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/game.html#wishlist');await page.evaluate(()=>localStorage.clear());await page.reload();
  await expect(page.locator('.wishlist-screen')).toBeVisible();
  await page.locator('[data-action="filters"]').click();await page.locator('#wl-rarity').selectOption('5');await page.locator('#wl-owned').selectOption('unowned');await page.locator('#wl-filter-done').click();
  const first=page.locator('[data-toggle]').first();const id=await first.getAttribute('data-toggle');
  await page.locator('#wl-query').fill(id!);await expect(page.locator('.wl-card')).toHaveCount(1);
  await page.locator('.wl-card [data-toggle]').click();await expect(page.locator('.wl-status')).toHaveText('已保存');
  await page.locator('.wl-tabs a[href="#wishlist/selected"]').click();await expect(page.locator('.wl-pursuit')).toContainText('进度 0 / 200 抽');await page.locator(`[data-pursue="${id}"]`).click();await expect(page.locator('.wl-pursuit')).toContainText('最多再 200 抽');
  await page.locator(`.wl-pick [data-detail="${id}"]`).click();await expect(page.locator('#detail')).toBeVisible();await expect(page.locator('#back')).toHaveText('返回愿望单');
  await page.locator('#back').click();await expect(page.locator('#wl-query')).toHaveValue(id!);await expect(page.locator('.wl-card')).toHaveCount(1);
  await page.reload();await expect(page.locator('#wl-selected-panel h2').first()).toHaveText('已选角色 1');
  await page.locator('.wl-tabs a[href="#wishlist/selected"]').click();await page.locator('.wl-selection [data-action="recommend"]').click();await expect(page.locator('#wl-preview')).toBeVisible();await page.locator('[data-action="apply-preview"]').click();
  await expect(page.locator('#wl-selected-panel h2').first()).toHaveText('已选角色 27');
  await page.locator('.wl-tabs a[href="#wishlist"]').click();await page.locator('#wl-query').fill('不存在的角色abcdef');await expect(page.locator('.wl-empty').first()).toContainText('没有匹配');
  await page.locator('.wl-empty [data-action="reset"]').click();await expect(page.locator('.wl-card')).toHaveCount(12);
  await page.screenshot({path:`artifacts/wishlist-${viewport.width}.png`,fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);expect(overflow).toBe(false);
  await page.locator('.wl-tabs a[href="#wishlist/selected"]').click();await page.locator('[data-action="clear"]').click();await page.locator('[data-action="apply-preview"]').click();await expect(page.locator('#wl-selected-panel h2').first()).toHaveText('已选角色 0');
  await page.locator('[data-action="back"]').click();await expect(page).toHaveURL(/#chests\/gems$/);await expect(page.locator('#openWishlist')).toBeVisible();
  await page.locator('#openWishlist').click();await expect(page.locator('.wishlist-screen')).toBeVisible();
  expect(errors).toEqual([]);
 });
}
test('第200抽追寻在宝箱出卡、消耗、保存与记录一致',async({page})=>{
 await page.goto('/game.html#wishlist');await page.evaluate(()=>localStorage.clear());await page.reload();
 await page.locator('[data-action="filters"]').click();await page.locator('#wl-rarity').selectOption('5');await page.locator('#wl-owned').selectOption('unowned');await page.locator('#wl-filter-done').click();
 const id=Number(await page.locator('[data-toggle]').first().getAttribute('data-toggle'));await page.locator('[data-toggle]').first().click();await page.locator('.wl-tabs a[href="#wishlist/selected"]').click();await expect(page.locator('.wl-pursuit')).toContainText('进度 0 / 200 抽');await page.locator(`[data-pursue="${id}"]`).click();
 await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('gems.meta.save')!);s.gachaWishlist.pursuit.progress=199;s.currencies.gems=150;localStorage.setItem('gems.meta.save',JSON.stringify(s));});
 await page.goto('/game.html#chests/gems');await page.reload();await page.locator('[data-open="gem-1"]').click();await page.locator('#wishlistReminderContinue').click();
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('gems.meta.save')!).gachaWishlist.pursuit.completed)).toBe(1);
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('gems.meta.save')!));expect(state.currencies.gems).toBe(0);expect(state.gachaLog[0].troops).toEqual([id]);expect(state.gachaLog[0].audit.reasons).toEqual(['pursuit']);
 await expect(page.locator('.summon-card .card-label').first()).toContainText('追寻保底');
});

test('同一王国可选多名同品质角色，并按品质清空',async({page})=>{
 await page.goto('/game.html#wishlist');await page.evaluate(()=>localStorage.clear());await page.reload();
 const group=await page.evaluate(async()=>{
  const { TROOPS }=await import('../../src/data/troops');
  return [...new Map(TROOPS.filter(t=>t.rarityIdx===5).map(t=>[t.kingdom,TROOPS.filter(x=>x.rarityIdx===5&&x.kingdom===t.kingdom)])).values()].find(ts=>ts.length>=2)?.map(t=>({id:t.id}))??[];
 });
 expect(group.length).toBeGreaterThanOrEqual(2);
 for(const t of group.slice(0,2)){
  await page.locator('#wl-query').fill(String(t.id));
  await expect(page.locator('.wl-card')).toHaveCount(1);
  await page.locator('.wl-card [data-toggle]').click();
  await expect(page.locator('.wl-status')).toHaveText('已保存');
 }
 await page.locator('.wl-tabs a[href="#wishlist/selected"]').click();
 await expect(page.locator('.wl-group')).toHaveCount(1);
 await expect(page.locator('.wl-group h3')).toContainText('神话 2/9');
 await page.reload();await page.locator('.wl-tabs a[href="#wishlist/selected"]').click();
 await expect(page.locator('.wl-pick')).toHaveCount(2);
 await page.locator('[data-clear-rarity="5"]').click();
 await expect(page.locator('#wl-selected-panel h2').first()).toHaveText('已选角色 0');
});
