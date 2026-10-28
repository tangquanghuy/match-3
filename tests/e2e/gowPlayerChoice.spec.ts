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

test.describe('mobile quick cast choices', () => {
 test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
 test('Azaleus opens a tappable choice dialog from a quick cast', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('battle.skipCastConfirm', '1'); localStorage.setItem('battle.gestureHintShown', '1'); });
  await page.goto('/index.html');
  await page.waitForFunction(() => {
   const app = (window as unknown as { __app: Runtime }).__app;
   return !!app && !app.startupPlaying && !!document.querySelector('[data-testid="card-0"]');
  });
  await page.evaluate(() => {
   const app = (window as unknown as { __app: Runtime }).__app;
   const state = app.getEngine().getState();
   const caster = state.teams.Left.characters[0];
   caster.skillId = '9657'; caster.manaCost = 16; caster.mana = 16; caster.statuses = [];
   state.activePlayer = 'Left' as typeof state.activePlayer;
   app.refreshTeams();
  });
  await page.getByTestId('card-0').tap();
  const dialog = page.getByRole('dialog', { name: '选择技能效果' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button').first().tap();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.cellaim-overlay')).toBeVisible();
  await page.keyboard.press('Escape');
 });
});

for(const spellId of ['7406','7253'])test(`native restriction reaches real App picker ${spellId}`,async({page})=>{
 await page.addInitScript(()=>{localStorage.setItem('battle.skipCastConfirm','1');localStorage.setItem('battle.gestureHintShown','1');});
 await page.goto('/index.html');
 await page.waitForFunction(()=>{
  const app=(window as unknown as {__app:Runtime}).__app;
  return !!app?.getEngine() && !!document.querySelector('.battle-settings-button') && !app.startupPlaying;
 });
 const result=await page.evaluate(async id=>{
  const app=(window as unknown as {__app:Runtime}).__app;
  type Cell={row:number;col:number};
  const picker=(app as unknown as {cellPicker:{pick(...args:unknown[]):Promise<Cell|null>}}).cellPicker;
  const state=app.getEngine().getState(),c=state.teams.Left.characters[0];
  c.skillId=id;c.manaCost=10;c.mana=10;c.statuses=[];
  state.activePlayer='Left' as typeof state.activePlayer;
  const kinds=[{kind:'color',color:'Red'},{kind:'color',color:'Purple'},{kind:'skull',variant:'normal'}];
  kinds.forEach((type,col)=>state.board.set({row:0,col},{id:9900+col,type:type as NonNullable<Parameters<typeof state.board.set>[1]>['type']}));
  const checks:boolean[][]=[];
  picker.pick=async(...args)=>{
   const valid=args[4] as ((cell:Cell)=>boolean)|undefined;
   checks.push(kinds.map((_,col)=>valid?.({row:0,col})??true));
   return null;
  };
  app.refreshTeams();
  const before=JSON.stringify(state);
  await app.castPlayerSkill(c.id);
  return {checks,unchanged:JSON.stringify(state)===before};
 },spellId);
 expect(result.checks).toEqual([[false,true,false]]);
 expect(result.unchanged).toBe(true);
});

