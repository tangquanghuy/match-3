import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';

test.use({contextOptions:{reducedMotion:'reduce'}});

async function readSave(page:Page):Promise<any>{return page.evaluate(async()=>{const path='/src/sillytavern/saveRepository.ts';const {StSaveRepository}=await import(/* @vite-ignore */path);const repo=await StSaveRepository.open();try{return {saves:await repo.list(),queue:await repo.listReplayOutcomes(),host:JSON.parse(localStorage.getItem('match3.playtest.host.v1')!)};}finally{repo.close();}});}
async function beginStory(page:Page):Promise<void>{
 await page.getByRole('button',{name:'开始示例遭遇',exact:true}).click();
 await expect(page.frameLocator('iframe[title="剧情三消战场"]').locator('.gcard.ally')).toHaveCount(1,{timeout:30_000});
 await expect(page.getByRole('dialog',{name:'剧情战斗队伍准备'})).toHaveCount(0);
 expect((await readSave(page)).saves[0].pendingStory.request.playerTeam[0]).toMatchObject({externalId:'/人物',skillId:'gw_KnightsSword'});
}
async function winWithRealCasts(page:Page,kind:'story'|'replay'):Promise<void>{
 const rootId=kind==='story'?'st-match3-story-root':'st-match3-replay-root';
 const title=kind==='story'?'剧情三消战场':'往昔再现战场';const root=page.locator('#'+rootId);const frame=page.frameLocator(`iframe[title="${title}"]`);
 for(let i=0;i<10;i++){
   if(await root.locator('main.result-screen').isVisible())break;
   await page.waitForFunction(id=>{const app=(document.getElementById(id)!.shadowRoot!.querySelector('iframe')!.contentWindow as any).__stReplayApp;return app&&!app.startupPlaying&&!app.player.isPlaying()&&(app.engine.getState().activePlayer==='Left'||app.engine.getState().phase==='ended');},rootId,{timeout:30_000});
   if(await root.locator('main.result-screen').isVisible())break;
   await frame.locator('body').evaluate(()=>{const app=(window as any).__stReplayApp;const caster=app.engine.getState().teams.Left.characters.find((u:any)=>u.hp>0);caster.mana=caster.manaCost;void app.castPlayerSkill(caster.id);});
   await frame.locator('.aim-overlay').waitFor({state:'visible',timeout:1500}).catch(()=>{});
   if(await frame.locator('.aim-overlay').count())await frame.locator('.gcard.enemy').first().click();
   await expect.poll(async()=>await root.locator('main.result-screen').isVisible()||await frame.locator('body').evaluate(()=>{const app=(window as any).__stReplayApp;return !app.player.isPlaying()&&!app.casting;}),{timeout:30_000}).toBeTruthy();
 }
 await expect(root.locator('main.result-screen')).toBeVisible({timeout:30_000});
 await expect(root.getByRole('heading',{name:/战\s*斗\s*胜\s*利/,level:1})).toBeVisible();
 await expect(root.getByRole('region',{name:'本场实际获得'}).locator('.settlement-grant.rs-reward').first()).toContainText(/\+1\s*.+灵魂碎片/);
 await expect(root.locator('#again')).toBeVisible();
 await expect(root.getByRole('region',{name:'本场战果',exact:true})).toHaveCount(0);
 await expect(root.getByRole('region',{name:'战斗资源记录',exact:true})).toHaveCount(0);
}
test.beforeEach(async({page})=>{await page.addInitScript(()=>{localStorage.setItem('battle.skipCastConfirm','1');localStorage.setItem('battle.speed','4');});});

test('fresh playtest uses default preparation, real story victory, visible rewards and full-health replay',async({page})=>{
 test.setTimeout(120_000);await page.goto('/sillytavern-playtest.html');
 const host=page.locator('#st-match3-host-root');await host.getByRole('button',{name:'创建当前聊天存档'}).click();
 await beginStory(page);await winWithRealCasts(page,'story');
 await expect(page.locator('#st-match3-story-root .bar')).toBeHidden();
 await expect(page.locator('#st-match3-story-root').getByRole('status')).toBeHidden();
 await expect(page.locator('#st-match3-story-root').getByRole('button',{name:'继续',exact:true})).toHaveCount(1);
 const first=await readSave(page);const save=first.saves[0];expect(save.encounters).toHaveLength(1);expect(save.sources[0].wins).toBe(1);expect(save.settlements[0].storyOrigin).toBeTruthy();expect(first.queue).toHaveLength(0);
 const battleId=save.settlements[0].battleId;expect(first.host.states['示例聊天一'].stat_data.三消战果[battleId].result.winner).toBe('player');
 expect(first.host.variables['示例聊天一'].match3.storyResults[battleId].battleId).toBe(battleId);
 await page.locator('#st-match3-story-root').getByRole('button',{name:'继续',exact:true}).click();await expect(host.getByRole('button',{name:'重复挑战'})).toBeVisible();
 // A wounded host with temporary HP still starts an independent, full-health replay.
 await page.evaluate(()=>{const key='match3.playtest.host.v1';const f=JSON.parse(localStorage.getItem(key)!);Object.assign(f.states['示例聊天一'].stat_data.人物,{当前生命值:113,临时生命值:7});localStorage.setItem(key,JSON.stringify(f));});
 await page.reload();await host.getByRole('button',{name:'重复挑战'}).click();
 await expect(page.frameLocator('iframe[title="往昔再现战场"]').locator('.gcard.ally')).toHaveCount(1,{timeout:30_000});
 await expect(page.getByRole('dialog',{name:'往昔再现队伍准备'})).toHaveCount(0);
 const pending=(await readSave(page)).saves[0].pendingReplay;expect(pending.request.playerTeam[0].initialHp).toBe(pending.request.playerTeam[0].stats.hp);expect(pending.request.enemyTeam).toEqual(save.encounters[0].enemyTeam);
 await winWithRealCasts(page,'replay');await expect(page.locator('#st-match3-replay-root .bar')).toBeHidden();
 await expect(page.locator('#st-match3-replay-root').getByRole('status')).toBeHidden();
 await expect(page.locator('#st-match3-replay-root').getByRole('button',{name:'导出本场战果'})).toBeHidden();
 const after=await readSave(page);expect(after.saves[0].sources[0].wins).toBe(2);expect(after.saves[0].balances).toEqual({});expect(after.host.states['示例聊天一'].stat_data.人物.当前生命值).toBe(113);expect(after.host.states['示例聊天一'].stat_data.人物.临时生命值).toBe(7);expect(Object.keys(after.host.variables['示例聊天一'].match3.storyResults)).toEqual([battleId]);
});

test('committed story rewards remain visible while host sync fails and resume exactly once after reload',async({page})=>{
 test.setTimeout(120_000);await page.goto('/sillytavern-playtest.html');const host=page.locator('#st-match3-host-root');await host.getByRole('button',{name:'创建当前聊天存档'}).click();
 await page.evaluate(async()=>{
   // Vite can stamp static dependencies with ?t after edits. Patch the exact loaded
   // adapter module so the injected fault also exercises an already-running server.
   const url=performance.getEntriesByType('resource').map(entry=>entry.name).find(name=>new URL(name).pathname==='/src/sillytavern/hostAdapter.ts');
   if(!url)throw new Error('loaded host adapter module missing');
   const {StHostAdapter}=await import(/* @vite-ignore */url);
   (window as any).__storySyncFaultCalls=0;
   StHostAdapter.prototype.writeStoryResult=async()=>{(window as any).__storySyncFaultCalls++;throw new Error('模拟酒馆同步暂时失败');};
 });
 await beginStory(page);await winWithRealCasts(page,'story');const battle=page.locator('#st-match3-story-root');await expect(battle.getByRole('status')).toContainText('本场奖励已入账');await expect(battle.getByRole('status')).toContainText('模拟酒馆同步暂时失败');expect(await page.evaluate(()=>(window as any).__storySyncFaultCalls)).toBe(1);
 const before=await readSave(page);expect(before.queue).toHaveLength(1);expect(before.saves[0].sources[0].wins).toBe(1);expect(before.host.states['示例聊天一'].stat_data.三消战果).toBeUndefined();
 await page.reload();await expect(host.getByRole('button',{name:'重新开始剧情战斗'})).toHaveCount(0);await host.getByRole('button',{name:'保存本场战果'}).click();
 await expect(host.getByRole('region',{name:'刚保存的本场结算'}).getByRole('region',{name:'本场实际获得'})).toContainText('灵魂碎片');
 const after=await readSave(page);expect(after.queue).toHaveLength(0);expect(after.saves[0].sources[0].wins).toBe(1);expect(after.saves[0].settlements).toHaveLength(1);expect(Object.keys(after.host.states['示例聊天一'].stat_data.三消战果)).toHaveLength(1);
});
