import {expect, test, type Page} from '@playwright/test';
import type {App} from '../../src/render/App';
import type {GameEvent} from '../../src/engine/events';
import type {EventStreamPlayer} from '../../src/render/EventStreamPlayer';
type Runtime = Omit<App, 'castPlayerSkill' | 'startupPlaying' | 'casting' | 'player' | 'refreshTeams' | 'input'> & { castPlayerSkill(id: number): Promise<void>; startupPlaying: boolean; casting: boolean;
 player: EventStreamPlayer; refreshTeams(): void; input: {enabled:boolean}; branchEvents: GameEvent[]; branchDone: boolean };
declare global { interface Window { __choiceApp: Runtime } }
// External font availability must not block navigation or battle startup in E2E.
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.abort());
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
});

async function open(page: Page, spellId = '8300') {
 await page.addInitScript(()=>{localStorage.setItem('battle.skipCastConfirm','1');localStorage.setItem('battle.gestureHintShown','1');});
 await page.goto('/index.html');
 await page.waitForFunction(()=>{
  const app=(window as unknown as {__app:Runtime}).__app;
  if(!app || !app.getEngine() || !document.querySelector('.battle-settings-button') || app.startupPlaying) return false;
  window.__choiceApp=app;return true;
 });
 await page.evaluate((id)=>{
  const app=window.__choiceApp,state=app.getEngine().getState();
  const c=state.teams.Left.characters[0]; c.skillId=id;c.manaCost=10;c.mana=10;c.statuses=[];
  state.activePlayer='Left' as typeof state.activePlayer;
  // Test goes through real App pickers -> session -> TurnEngine, not prototype-only.
  // Skip only playback, retaining the authoritative produced event stream.
  app.player.play=async events=>{ app.branchEvents.push(...events); };
  app.branchEvents=[]; app.refreshTeams(); app.branchDone=false;
  void app.castPlayerSkill(c.id).finally(()=>{app.branchDone=true;});
 },spellId);
 await expect(page.getByRole('dialog',{name:'选择技能效果',exact:true})).toBeVisible();
}
for(const branch of [0,1]) test(`real player/session pipeline casts only option ${branch}`,async({page})=>{
 await open(page);
 const dialog=page.getByRole('dialog',{name:'选择技能效果',exact:true});
 await dialog.getByRole('button',{name:branch===0?'创造9颗绿色宝石':'摧毁9颗绿色宝石',exact:true}).click();
 await page.waitForFunction(()=>window.__choiceApp.branchDone);
 const result=await page.evaluate(()=>{
  const a=window.__choiceApp;return {events:a.branchEvents,log:a.getEngine().getState().actionLog};
 });
 expect(result.events.filter(e=>e.type==='skill-cast')).toHaveLength(1);
 const firstGem=result.events.find(e=>e.type==='gem-transform'||e.type==='gem-destroy');
 expect(firstGem?.type).toBe(branch===0?'gem-transform':'gem-destroy');
 if(branch===0)expect(result.events.filter(e=>e.type==='gem-destroy')).toHaveLength(0);
 else expect(result.events.filter(e=>e.type==='gem-transform')).toHaveLength(0);
 expect(result.log.filter(e=>e.skillId==='8300')).toHaveLength(1);
});
for(const method of ['button','escape','backdrop','settings','orientation']) test(`choice cancellation ${method} preserves mana and action log`,async({page})=>{
 await open(page);
 const before=await page.evaluate(()=>JSON.stringify(window.__choiceApp.getEngine().getState()));
 if(method==='button')await page.getByRole('button',{name:'取消施放',exact:true}).click();
 else if(method==='escape')await page.keyboard.press('Escape');
 else if(method==='backdrop')await page.locator('.skill-branch-backdrop').click({position:{x:5,y:5}});
 else if(method==='orientation')await page.evaluate(()=>window.__choiceApp.setOrientationBlocked(true));
 else await page.getByRole('button',{name:'战斗设置',exact:true}).click({force:true});
 await page.waitForFunction(()=>window.__choiceApp.branchDone);
 expect(await page.evaluate(()=>JSON.stringify(window.__choiceApp.getEngine().getState()))).toBe(before);
 expect(await page.evaluate(()=>window.__choiceApp.branchEvents)).toEqual([]);
 await expect(page.locator('.skill-branch-backdrop')).toHaveCount(0);
});
test('branch choices do not depend on board colors and keyboard focus stays in dialog',async({page})=>{
 // This real spell has no color-chooser requirement even though the branch names are colors.
 await open(page,'9204');
 const dialog=page.getByRole('dialog',{name:'选择技能效果',exact:true});
 await expect(dialog.getByRole('button')).toHaveCount(3);
 await expect(dialog.getByRole('button').nth(0)).toContainText('蓝色闪电');
 await expect(dialog.getByRole('button').nth(1)).toContainText('黄色闪电');
 await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button').last()).toBeFocused();
 await page.keyboard.press('Tab'); await expect(dialog.getByRole('button').first()).toBeFocused();
 await page.keyboard.press('Escape');
});
