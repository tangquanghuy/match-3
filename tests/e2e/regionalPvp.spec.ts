import { expect, test, type Page } from '@playwright/test';
async function setup(page:Page,region='WintersReach'){
 await page.clock.setFixedTime(new Date('2026-10-01T12:00:00Z'));
 await page.goto(`/game.html#regional/region/${region}`);await expect(page.locator('.regional-screen')).toBeVisible({timeout:20000});
 await page.evaluate(async region=>{
  const load=(p:string)=>import(/* @vite-ignore */ p);
  const {metaGateway}=await load('/src/meta/gateway/index.ts');const {TROOPS}=await load('/src/data/troops.ts');
  const {regionLegal}=await load('/src/meta/systems/regionalPvp.ts');const {weekStartOf}=await load('/src/meta/gateway/clock.ts');
  const gw=metaGateway(),s=JSON.parse(gw.exportSaveJson()),week=weekStartOf(gw.now());
  const ids=TROOPS.filter((t:{id:number;troopTypes:string[];rarityIdx:number})=>regionLegal({templateId:String(t.id),troopTypes:t.troopTypes},week,region)&&!t.troopTypes.includes('Immortal')&&t.rarityIdx>=3).slice(0,4).map((t:{id:number})=>t.id);
  s.hero.level=100;s.hero.xp=0;s.hero.masteryOffers=[];
  s.teams=[{name:'寒冬远征',members:ids.map((troopId:number)=>({kind:'troop',troopId})),bannerKingdomId:null}];s.activeTeamIndex=0;
  for(const id of ids)s.collection[id]={level:20,ascension:3,copies:0,traits:[true,true,true],locked:false};
  delete s.regional;await gw.dev.importSaveJson(JSON.stringify(s));
 },region);await page.reload();await expect(page.locator('.rg-world')).toBeVisible();
 await expect.poll(()=>page.evaluate(region=>JSON.parse(localStorage.getItem('gems.meta.save')!).regional?.regions?.[region]?.opponents?.length,region)).toBe(3);
}
async function noOverflow(page:Page){expect(await page.locator('.rg-content').evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);const box=await page.locator('#stage').boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);}
for(const viewport of [{width:1600,height:900},{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
 test(`region map, opponent preview and dedicated unit page ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);await setup(page);await noOverflow(page);
  const asset=await page.locator('.rg-world').evaluate(e=>getComputedStyle(e).backgroundImage);expect(asset).toContain('winter-map');
  await page.locator('a[href="#regional/region/WintersReach/opponents"]').click();await expect(page.locator('.rg-opponent')).toHaveCount(3);await noOverflow(page);
  await page.locator('.rg-opponent .rg-primary').first().click();await expect(page.locator('.rg-troop')).toHaveCount(8);await expect(page.locator('[data-fight]')).toBeEnabled();await noOverflow(page);
  await expect(page.locator('.rg-troop [data-stat]')).toHaveCount(40);
  expect(await page.locator('.rg-team').first().evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)).toBe(viewport.width<=800?2:4);
  const readable=await page.locator('.rg-troop').evaluateAll(nodes=>nodes.map(node=>{
   const art=node.querySelector('.rg-troop-art')!.getBoundingClientRect();
   const img=node.querySelector('img')!.getBoundingClientRect();
   const name=node.querySelector('h3')!.getBoundingClientRect();
   const stats=Array.from(node.querySelectorAll('[data-stat]')).map(stat=>stat.getBoundingClientRect());
   const inside=stats.every(stat=>stat.left>=art.left-1&&stat.right<=art.right+1&&stat.top>=art.top-1&&stat.bottom<=art.bottom+1);
   const overlap=stats.some((a,i)=>stats.slice(i+1).some(b=>Math.min(a.right,b.right)>Math.max(a.left,b.left)+1&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1));
   return inside&&!overlap&&Math.abs(img.width-art.width)<1&&Math.abs(img.height-art.height)<1&&name.height>10;
  }));
  expect(readable).toEqual(Array(8).fill(true));
  const correctStats=await page.evaluate(async()=>{
   const load=(p:string)=>import(/* @vite-ignore */p);
   const {metaGateway}=await load('/src/meta/gateway/index.ts');
   const {previewRegionalBattle}=await load('/src/meta/systems/regionalPvp.ts');
   const gw=metaGateway(),id=location.hash.split('/').at(-1);
   const plan=previewRegionalBattle(gw.current(),{region:'WintersReach',kind:'duel',opponentId:id},gw.now());
   if(!plan.ok)return false;
   return ['enemy','player'].every(side=>Array.from(document.querySelectorAll(`[data-preview-side="${side}"] .rg-troop`)).every((card,i)=>{
    const snapshot=(side==='enemy'?plan.request.enemyTeam:plan.request.playerTeam)[i];
    return ['mana','attack','armor','hp','magic'].every(key=>Number(card.querySelector(`[data-stat="${key}"] b`)!.textContent)===(key==='mana'?snapshot.manaCost:snapshot.stats[key]));
   }));
  });
  expect(correctStats).toBe(true);
  await page.screenshot({path:`artifacts/regional-${viewport.width}-prepare.png`,animations:'disabled'});
  await page.locator('.rg-troop').first().click();await expect(page.locator('.rg-detail')).toBeVisible();await expect(page.locator('.rg-detail .rg-attributes svg')).toHaveCount(4);await expect(page.locator('.rg-spell')).not.toBeEmpty();await noOverflow(page);
  await page.screenshot({path:`artifacts/regional-${viewport.width}-detail.png`,fullPage:true});
  await page.locator('.rg-heading .rg-button').click();await expect(page.locator('[data-fight]')).toBeEnabled();
  await page.locator('a[href^="#team/regional/"]').click();await expect(page.locator('.regional-team-context')).toBeVisible();
  expect(await page.locator('#roster [data-id="hero"]').count()).toBe(0);
  const illegal=await page.locator('#roster [data-id]').evaluateAll(async elements=>{const load=(p:string)=>import(/* @vite-ignore */p);const {getTroopById}=await load('/src/data/troops.ts');const {regionLegal}=await load('/src/meta/systems/regionalPvp.ts');const s=JSON.parse(localStorage.getItem('gems.meta.save')!);return elements.some(e=>{const id=(e as HTMLElement).dataset.id;return !regionLegal({templateId:id,troopTypes:getTroopById(Number(id))?.troopTypes},s.regional.week);});});expect(illegal).toBe(false);
  await page.screenshot({path:`artifacts/regional-${viewport.width}-team.png`,fullPage:true});
  await page.locator('.regional-team-context a').click();await expect(page.locator('[data-fight]')).toBeEnabled();

  await page.locator('.rg-back').click();await page.locator('a[href="#regional/region/WintersReach/monolith/vigor"]').click();await expect(page.locator('.rg-steps li')).toHaveCount(5);await noOverflow(page);
  await page.locator('.rg-sanctum .rg-primary').click();await expect(page.locator('[data-fight="monolith"]')).toBeEnabled();
  await page.locator('.rg-back').click();await page.locator('a[href="#regional/region/WintersReach/citadel"]').click();await expect(page.locator('.rg-steps li')).toHaveCount(5);await noOverflow(page);
 });
}
test('region reward claims persist, fuel visible in bag, mobile map artwork loads',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page);await page.screenshot({path:'artifacts/regional-mobile-map.png'});
 await page.evaluate(async()=>{const path='/src/meta/gateway/index.ts';const {metaGateway}=await import(/* @vite-ignore */ path);const gw=metaGateway(),s=JSON.parse(gw.exportSaveJson());s.regional.vp=150;await gw.dev.importSaveJson(JSON.stringify(s));});
 await page.locator('a[href="#regional/rewards"]').click();await page.locator('[data-claim="0"]').click();await expect(page.locator('[data-claim="0"]')).toHaveText('已领取');await expect(page.locator('.rg-balance')).toContainText('5');
 await page.goto('/game.html#bag/supplies');await expect(page.locator('[data-bag-item="burningSouls"]')).toBeVisible();
 await page.locator('[data-bag-item="burningSouls"]').click();await expect(page.locator('[data-bag-detail="burningSouls"]')).toContainText('永生战域');
});

test('citadel battle launches and surrender settles once without refunding a sigil',async({page})=>{
 test.setTimeout(90000);
 await page.route('**/fonts.googleapis.com/**',route=>route.abort());
 await page.route('**/fonts.gstatic.com/**',route=>route.abort());
 await setup(page);
 await page.locator('a[href="#regional/region/WintersReach/citadel"]').click();
 await page.locator('a[href^="#regional/region/WintersReach/prepare/citadel/"]').first().click();
 await page.locator('[data-fight="citadel"]').click();
 await expect(page.locator('#battle-root .battle-settings-button')).toBeVisible({timeout:45000});
 await page.getByRole('button',{name:'战斗设置',exact:true}).click();
 await page.getByRole('button',{name:'放弃本局',exact:true}).click();
 await page.getByRole('button',{name:'确认放弃',exact:true}).click();
 await expect(page.locator('.result-screen')).toBeVisible({timeout:20000});
 await expect(page.locator('#battle-root')).toBeHidden();
 const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('gems.meta.save')!));
 await expect.poll(async()=>(await read()).pendingBattle).toBeNull();
 const save=await read();expect(save.regional.sigils).toBe(5);expect(save.regional.history).toHaveLength(1);expect(save.regional.history[0].victory).toBe(false);expect(save.regional.regions.WintersReach.citadel.stage).toBe(0);
 await page.locator('#again').click();await expect(page.locator('.regional-screen')).toBeVisible();
 await page.reload();await expect(page.locator('.regional-screen')).toBeVisible();
 const loaded=await read();expect(loaded.regional.sigils).toBe(5);expect(loaded.regional.history).toHaveLength(1);
});

for(const width of [1600,390,320]) test(`world map entry opens the independent region ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page);await page.goto('/game.html#map');
 const entry=page.locator('.regional-entry');await expect(entry).toBeVisible();
 if(width<700){
  const facets=await page.locator('.rail .facet:visible').evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right};}).sort((a,b)=>a.left-b.left));
  expect(facets).toHaveLength(6);
  for(let i=1;i<facets.length;i++) expect(facets[i].left).toBeGreaterThanOrEqual(facets[i-1].right);
  const labels=await page.locator('.rail .rail-copy b:visible').evaluateAll(nodes=>nodes.map(node=>({width:node.clientWidth,content:node.scrollWidth})));
  for(const label of labels) expect(label.content).toBeLessThanOrEqual(label.width+1);
 }
 await page.screenshot({path:`artifacts/regional-${width}-world-entry.png`});
 const box=await entry.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.y+box!.height).toBeLessThanOrEqual(900);
 await entry.click();await expect(page.locator('.rg-atlas')).toBeVisible();await expect(page.locator('[data-region-card]')).toHaveCount(10);await expect(page.locator('.rg-active-regions [data-region-card]')).toHaveCount(3);await noOverflow(page);await page.screenshot({path:`artifacts/regional-${width}-atlas.png`,fullPage:true});
});


test('atlas keeps all ten regions visible, loads their artwork and explains closed regions',async({page})=>{
 await page.setViewportSize({width:390,height:844});await setup(page);await page.goto('/game.html#regional');
 await expect(page.locator('[data-region-card]')).toHaveCount(10);
 await expect(page.locator('.rg-resting')).toHaveCount(7);
 const assets=await page.locator('[data-region-card]').evaluateAll(async nodes=>Promise.all(nodes.map(async node=>{
  const style=getComputedStyle(node).backgroundImage,match=style.match(/url\(["']?(.*?)["']?\)/);
  if(!match)return false;const img=new Image();img.src=match[1]!;try{await img.decode();return img.naturalWidth>0;}catch{return false;}
 })));
 expect(assets.every(Boolean)).toBe(true);
 await page.locator('[data-region-card="BayOfStars"]').click();await expect(page.locator('.rg-region-intro')).toContainText('星星湾');
 await expect(page.locator('.rg-region-intro')).toContainText('主场不朽');await expect(page.locator('[data-fight]')).toHaveCount(0);await noOverflow(page);
 await page.screenshot({path:'artifacts/regional-390-resting.png'});
 await page.locator('.rg-region-intro a').click();await expect(page.locator('.rg-atlas')).toBeVisible();
});
for(const region of ['CentralSpire','Aidania'])test(`${region} has a dedicated team route and settles back to its own region`,async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width:390,height:844});
 await page.route('**/fonts.googleapis.com/**',route=>route.abort());await page.route('**/fonts.gstatic.com/**',route=>route.abort());
 await setup(page,region);await page.locator(`a[href="#regional/region/${region}/opponents"]`).click();
 await page.locator('.rg-opponent .rg-primary').first().click();await expect(page.locator('.rg-troop')).toHaveCount(8);
 await page.locator('a[href^="#team/regional/"]').click();await expect(page.locator('.regional-team-context')).toBeVisible();
 await expect(page.locator('.regional-team-context a')).toHaveAttribute('href',new RegExp(`#regional/region/${region}/prepare/`));
 await page.locator('.regional-team-context a').click();await expect(page.locator('[data-fight]')).toBeEnabled();
 await page.locator('.rg-troop').first().click();await expect(page.locator('.rg-detail')).toBeVisible();await noOverflow(page);
 await page.locator('.rg-heading .rg-button').click();await page.locator('.rg-back').click();
 await page.locator(`a[href="#regional/region/${region}/citadel"]`).click();await page.locator(`a[href^="#regional/region/${region}/prepare/citadel/"]`).first().click();
 await page.locator('[data-fight="citadel"]').click();await expect(page.locator('#battle-root .battle-settings-button')).toBeVisible({timeout:45000});
 await page.getByRole('button',{name:'战斗设置',exact:true}).click();await page.getByRole('button',{name:'放弃本局',exact:true}).click();await page.getByRole('button',{name:'确认放弃',exact:true}).click();
 await expect(page.locator('.result-screen')).toBeVisible({timeout:20000});
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('gems.meta.save')!).pendingBattle)).toBeNull();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('gems.meta.save')!));expect(saved.regional.history[0].region).toBe(region);expect(saved.regional.sigils).toBe(5);
 await page.locator('#again').click();await expect(page.locator('.regional-screen')).toHaveAttribute('data-region',region);await expect(page.locator('.rg-world')).toBeVisible();
 await page.locator('.rg-back').click();await expect(page.locator('.rg-atlas')).toBeVisible();
});


for (const width of [1600, 390]) for (const level of [49, 50]) {
 test(`world map regional level gate ${width} level ${level}`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/game.html#map', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.regional-entry')).toBeVisible();
  await page.evaluate(async level => {
   const path = '/src/meta/gateway/index.ts';
   const { metaGateway } = await import(/* @vite-ignore */ path);
   const gw = metaGateway(), s = JSON.parse(gw.exportSaveJson());
   s.hero.level = level; s.hero.xp = 0;
   await gw.dev.importSaveJson(JSON.stringify(s));
  }, level);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const entry = page.locator('.regional-entry');
  await expect(entry).toBeVisible();
  if (level < 50) {
   await expect(entry).toBeDisabled();
   await expect(entry).toHaveAttribute('aria-disabled', 'true');
   await expect(entry).not.toHaveAttribute('href');
   await expect(entry).toContainText('主角 50 级开放');
   await expect(entry.locator('[data-icon="lock"]')).toBeVisible();
   await entry.click({ force: true });
   await expect(page).toHaveURL(/#map$/);
   await entry.evaluate((element: HTMLElement) => element.click());
   await expect(page).toHaveURL(/#map$/);
   await entry.evaluate((element: HTMLElement) => element.focus());
   await expect(entry).not.toBeFocused();
   await page.screenshot({ path: `artifacts/regional-locked-${width}.png` });
  } else {
   await expect(entry).toBeEnabled();
   await expect(entry).toHaveAttribute('href', '#regional');
   await entry.click();
   await expect(page.locator('.rg-atlas')).toBeVisible();
  }
 });
}
