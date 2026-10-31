import {describe,it,expect} from 'vitest';
import {BaseColor} from '../../src/engine/types';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest,CombatantSnapshot} from '../../src/session/contract';
import {beginStory,completeStory} from '../../src/sillytavern/storySession';
import {createSave,emptyRoot,validateSave} from '../../src/sillytavern/save';
import type {AbilitySource} from '../../src/sillytavern/save';
import {surrenderedStoryOutcome} from '../../src/sillytavern/storySurrender';
import {formatStoryReportMessage,sendTavernChatMessage,STORY_REPORT_HEADER} from '../../src/sillytavern/storyReportMessage';
import {compileEnemyBlueprint,learningAbilityIdForSkill} from '../../src/sillytavern/enemyBlueprint';
import {PORTRAITS,savePortrait} from '../../src/sillytavern/portraits';

function actor(externalId:string,name:string,initialHp=60):CombatantSnapshot {
 return {externalId,name,stats:{hp:100,attack:10,armor:0,magic:7},initialHp,manaColors:[BaseColor.Blue],manaCost:3,skillId:'gw_KnightsSword'};
}
function fixture() {
 const save=createSave(emptyRoot(),{hostId:'host',characterId:'character',chatId:'chat'},'save');
 const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'story-report',requestId:'story-report-request',seed:7,playerTeam:[actor('/人物','林')],enemyTeam:[actor('enemy-1','遗迹守卫',100)]};
 const sources:AbilitySource[]=[{sourceId:'source',abilityId:'ability',abilityName:'骑士剑技〔abc1234〕',rank:0,enemyExternalId:'enemy-1'}];
 beginStory(save,request,sources,'基础','encounter');
 return {save,request,sources};
}

describe('story report handoff to the runtime AI',()=>{
 it('abandons an unfinished story as a surrender defeat through normal settlement',()=>{
   const f=fixture();
   const {result,events}=surrenderedStoryOutcome(f.request);
   expect(result).toMatchObject({battleId:f.request.battleId,requestId:f.request.requestId,winner:'enemy',endReason:'surrender'});
   const receipt=completeStory(f.save,result,events);
   expect(receipt.grants).toEqual([]);expect(receipt.learnedAbilityIds).toEqual([]);
   expect(f.save.pendingStory).toBeUndefined();expect(f.save.encounters).toEqual([]);
   expect(validateSave(JSON.parse(JSON.stringify(f.save))).settlements).toHaveLength(1);
   // Same outcome on repeat: the frozen request and seed decide it.
   expect(surrenderedStoryOutcome(f.request).result).toEqual(result);
   const text=formatStoryReportMessage(receipt,f.sources);
   expect(text.startsWith(STORY_REPORT_HEADER)).toBe(true);
   expect(text).toContain('我方放弃战斗，按败北结算');expect(text).toContain('- 遗迹守卫：仍可战斗');
   expect(text).toContain('- 林：生命 60% → ');expect(text).not.toContain('三消养成所得');
 });
 it('lists real victory facts and actual grants without internal identifiers',()=>{
   const f=fixture();
   const result={schemaVersion:f.request.schemaVersion,rulesetVersion:f.request.rulesetVersion,battleId:f.request.battleId,requestId:f.request.requestId,seed:f.request.seed,winner:'player' as const,turns:4,
    combatants:[{externalId:'/人物',side:'player' as const,hp:30,maxHp:100,armor:0,defeated:false,statuses:[]},{externalId:'enemy-1',side:'enemy' as const,hp:0,maxHp:100,armor:0,defeated:true,statuses:[]}],
    defeatedExternalIds:['enemy-1'],summonedCount:0,actionLogDigest:'digest',eventSummary:[]};
   const receipt=completeStory(f.save,result,[]);
   const text=formatStoryReportMessage(receipt,f.sources);
   expect(text).toContain('战斗结果：我方胜利，共 4 回合。');
   expect(text).toContain('- 遗迹守卫：被击败');expect(text).toContain('- 林：生命 60% → 30%');
   // Fragments are granted (settlement page) but kept out of the AI report (2026-10-30).
   expect(receipt.grants.map(grant=>grant.kind)).toEqual(['fragment']);
   expect(text).not.toMatch(/三消养成所得|灵魂碎片|学会能力/);
   expect(text).not.toMatch(/battleId|requestId|enemy-1|\/人物|〔[a-z0-9]{7}〕|source/);
 });
 it('sends through the tavern chat box the same way as the status bar travel action',()=>{
   const area={value:'',dispatchEvent:(event:Event)=>{dispatched.push(event.type);return true;}};let clicked=0;const dispatched:string[]=[];
   const host={document:{getElementById:(id:string)=>id==='send_textarea'?area:id==='send_but'?{click:()=>{clicked++;}}:null}} as unknown as Window;
   expect(sendTavernChatMessage(host,'【三消战报】测试')).toBe(true);
   expect(area.value).toBe('【三消战报】测试');expect(dispatched).toEqual(['input']);expect(clicked).toBe(1);
   const missing={document:{getElementById:()=>null}} as unknown as Window;
   expect(sendTavernChatMessage(missing,'x')).toBe(false);
 });
 it('gives one learning identity to the same ability regardless of the instance mana colors',()=>{
   const art=PORTRAITS.find(p=>p.troopId===6004)!;const portrait=savePortrait({rank:art.rank,form:art.form,role:art.role},art);
   const compile=(manaColors:string[])=>compileEnemyBlueprint({portrait,recipeTroopId:6004,assembly:{version:2,activeTroopId:6004,traitCodes:[],manaColors},externalId:'enemy-1'});
   const red=compile(['Red']),blue=compile(['Blue']);
   expect(red.snapshot.manaColors).not.toEqual(blue.snapshot.manaColors);
   expect(learningAbilityIdForSkill(red.snapshot.skillId,red.snapshot.manaCost)).toBe(learningAbilityIdForSkill(blue.snapshot.skillId,blue.snapshot.manaCost));
   expect(learningAbilityIdForSkill(red.snapshot.skillId,red.snapshot.manaCost)).toMatch(/^active:v2:/);
   expect(learningAbilityIdForSkill('gw_KnightsSword',3)).toBeUndefined();
 });
});
