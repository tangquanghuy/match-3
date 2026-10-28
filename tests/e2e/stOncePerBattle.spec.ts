import {expect, test} from '@playwright/test';
import type {App} from '../../src/render/App';
import type {Character} from '../../src/engine/types';
import type {CastAvailability} from '../../src/render/UnitSheet';
import type {TeamView} from '../../src/render/TeamView';
import type {GameEvent} from '../../src/engine/events';

test('real App skill availability belongs to each individual, including the opposing team',async({page})=>{
 await page.route('https://fonts.googleapis.com/**',route=>route.abort());
 await page.route('https://fonts.gstatic.com/**',route=>route.abort());
 await page.goto('/index.html');
 await page.waitForFunction(()=>{
  const app=(window as unknown as {__app:Omit<App,'startupPlaying'> & {startupPlaying:boolean}}).__app;
  return !!app?.getEngine() && !app.startupPlaying && !!document.querySelector('.battle-settings-button');
 });
 const result=await page.evaluate(()=>{
  type Runtime=Omit<App,'castAvailability'|'refreshTeams'|'onBattleEvent'|'leftTeamView'> & {
   castAvailability(c:Character,mana:number):CastAvailability;refreshTeams():void;
   onBattleEvent(ev:GameEvent):void;leftTeamView:TeamView;
  };
  const app=(window as unknown as {__app:Runtime}).__app;
  const state=app.getEngine().getState(),[first,second]=state.teams.Left.characters;
  for(const c of [first!,second!]){c.skillId='7673';c.manaCost=16;c.mana=16;c.statuses=[];c.defeated=false;}
  state.activePlayer='Left' as typeof state.activePlayer;
  state.actionLog=[];
  app.refreshTeams();
  const highlights=()=>[first!,second!].map(c=>document.querySelector(`[data-testid="card-${c.id}"]`)!.classList.contains('castable'));
  const read=()=>{app.refreshTeams();return {availability:[first!,second!].map(c=>app.castAvailability(c,c.mana).kind),highlights:highlights()};};
  const initial=read();
  const foe=state.teams.Right.characters[0]!;
  state.actionLog.push({index:0,side:'Right' as typeof state.activePlayer,action:{type:'cast',characterId:foe.id},skillId:'7673',outcome:'switched'});
  const enemyUsed=read();
  state.actionLog.push({index:1,side:'Left' as typeof state.activePlayer,action:{type:'cast',characterId:first!.id},skillId:'7673',outcome:'switched'});
  const firstUsed=read();
  state.actionLog.push({index:2,side:'Left' as typeof state.activePlayer,action:{type:'cast',characterId:second!.id},skillId:'7673',outcome:'switched'});
  const bothUsed=read();
  const refill=(c:Character)=>{
   app.leftTeamView.getCard(c.id)!.drainMana();
   app.onBattleEvent({type:'mana-gain',color:'Red' as Character['colors'][number],amount:16,characterId:c.id,player:'Left' as typeof state.activePlayer});
   return highlights();
  };
  const usedRefill=refill(first!);
  state.actionLog=state.actionLog.filter(e=>e.side!=='Left'||e.action.type!=='cast'||e.action.characterId!==second!.id);
  const unusedRefill=refill(second!);
  return {initial,enemyUsed,firstUsed,bothUsed,usedRefill,unusedRefill};
 });
 expect(result).toEqual({
  initial:{availability:['ready','ready'],highlights:[true,true]},
  enemyUsed:{availability:['ready','ready'],highlights:[true,true]},
  firstUsed:{availability:['used','ready'],highlights:[false,true]},
  bothUsed:{availability:['used','used'],highlights:[false,false]},
  usedRefill:[false,false],unusedRefill:[false,true],
 });
});
