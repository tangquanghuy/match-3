import {describe,it,expect} from 'vitest';
import {beginStory} from '../../src/sillytavern/storySession';
import {BaseColor} from '../../src/engine/types';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {GameEvent} from '../../src/engine/events';
import type {BattleRequest,BattleResult,CombatantSnapshot} from '../../src/session/contract';
import {createSave,deleteSave,emptyRoot,settleSave,replayRequest,canReplay,canEquipAbility,sourceIsLearned,LEARNING_WINS,validateSave,recordEncounter,beginReplay,completeReplay} from '../../src/sillytavern/save';
import type {EncounterRecord,StSave} from '../../src/sillytavern/save';

function actor(id:string):CombatantSnapshot{return {externalId:id,name:id,stats:{hp:100,attack:10,armor:0,magic:7},initialHp:25,manaColors:[BaseColor.Blue],manaCost:3,skillId:'7004'};}
function fixture(rank=4){
 const root=emptyRoot();const save=createSave(root,{hostId:'host',characterId:'character',chatId:'one'},'save');
 const encounter:EncounterRecord={id:'encounter',storyBattleId:'b0',enemyTeam:[actor('e1'),actor('e2')],sources:[{sourceId:'source1',abilityId:'ability1',abilityName:'火球',rank,enemyExternalId:'e1'},{sourceId:'source1',abilityId:'ability1',abilityName:'火球',rank,enemyExternalId:'e2'}],difficulty:'normal',seed:42};
 return {save,encounter};
}
function battle(encounter:EncounterRecord,n:number,winner:'player'|'enemy'='player'):{request:BattleRequest;result:BattleResult;events:GameEvent[]}{
 const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:`b${n}`,requestId:`r${n}`,seed:encounter.seed,playerTeam:[actor('p')],enemyTeam:structuredClone(encounter.enemyTeam)};
 const result:BattleResult={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:request.battleId,requestId:request.requestId,seed:request.seed,winner,turns:5,combatants:[{externalId:'p',side:'player',hp:25,maxHp:100,armor:0,defeated:false,statuses:[]},...request.enemyTeam.map(e=>({externalId:e.externalId,side:'enemy' as const,hp:0,maxHp:100,armor:0,defeated:true,statuses:[]}))],defeatedExternalIds:request.enemyTeam.map(e=>e.externalId),summonedCount:0,actionLogDigest:`digest-${n}`,eventSummary:[]};
 return {request,result,events:[{type:'skill-damage',casterId:0,targetId:4,range:'single',damage:25,hpLoss:25,resultingHp:0,resultingArmor:0},{type:'defeat',characterId:4},{type:'skill-damage',casterId:0,targetId:5,range:'single',damage:25,hpLoss:25,resultingHp:0,resultingArmor:0},{type:'defeat',characterId:5}]};
}
function win(save:StSave,encounter:EncounterRecord,n:number,kind:'story'|'replay'='story'){return settleSave(save,{kind,encounter,...battle(encounter,n)});}

describe('ST save boundaries',()=>{
 it('binds one slot to one chat and requires manual deletion after three',()=>{
   const root=emptyRoot();const chat={hostId:'h',characterId:'c',chatId:'1'};
   const first=createSave(root,chat,'a');expect(createSave(root,chat,'unused')).toBe(first);
   createSave(root,{...chat,chatId:'2'},'b');createSave(root,{...chat,chatId:'3'},'c');
   expect(()=>createSave(root,{...chat,chatId:'4'},'d')).toThrow('手动删除');
   deleteSave(root,'b');createSave(root,{...chat,chatId:'4'},'d');expect(root.saves.map(s=>s.id)).toEqual(['a','c','d']);
   expect(first.chat.chatId).toBe('1');
 });
 it('rejects invalid balance data in imports',()=>{
   const {save}=fixture();expect(validateSave(save).id).toBe('save');
   expect(()=>validateSave({...save,balances:{'material:x':-1}})).toThrow('余额');
 });
});

describe('ST victory learning and full encounter replay',()=>{
 it.each([0,1,2,3,4])('learns rank %s at its exact threshold, counting story first victory',rank=>{
   const {save,encounter}=fixture(rank);const threshold=LEARNING_WINS[rank]!;
   win(save,encounter,0);expect(save.sources[0]!.wins).toBe(1);expect(save.encounters[0]!.enemyTeam).toEqual(encounter.enemyTeam);
   for(let i=1;i<threshold;i++){
     expect(sourceIsLearned(save,encounter.sources[0]!)).toBe(false);
     const r=win(save,save.encounters[0]!,i,'replay');expect(r.grants).toHaveLength(1);
   }
   expect(save.learnedAbilityIds).toEqual(['ability1']);expect(save.sources[0]!.wins).toBe(threshold);expect(canReplay(save,save.encounters[0]!)).toBe(false);
   expect(()=>replayRequest(save,encounter.id,[actor('p')],{battleId:'closed',requestId:'closed'},{schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION})).toThrow('全部学会');
 });
 it('freezes battlefield, enemy bonuses and rules while using current player bonuses',()=>{
   const {save,encounter}=fixture(0);const fight=battle(encounter,0);
   Object.assign(fight.request,{kingdom:'region:1',enemyBanner:{boosts:{Blue:2}},enemyManaMastery:{Blue:30},arenaRules:true,rules:{turnLimit:{turns:20,onExpire:'enemyWins'},turnStart:[{side:'player',mana:{amount:1,targets:['p']}}]}});
   const frozen=recordEncounter(fight.request,encounter.sources,'hard','frozen');
   settleSave(save,{kind:'story',encounter:frozen,...fight});
   const replay=replayRequest(save,frozen.id,[actor('p')],{battleId:'replay',requestId:'replay-r'},{schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION},{playerBanner:{boosts:{Blue:1}}});
   expect(replay.kingdom).toBe('region:1');expect(replay.enemyBanner).toEqual(fight.request.enemyBanner);expect(replay.enemyManaMastery).toEqual(fight.request.enemyManaMastery);expect(replay.arenaRules).toBe(true);expect(replay.rules).toEqual(fight.request.rules);expect(replay.playerBanner).toEqual({boosts:{Blue:1}});
   replay.enemyBanner!.boosts.Blue=4;expect(frozen.environment!.enemyBanner!.boosts.Blue).toBe(2);
   const changed=battle(frozen,1);Object.assign(changed.request,{...fight.request,battleId:'b1',requestId:'r1',enemyBanner:{boosts:{Blue:3}}});
   expect(()=>settleSave(save,{kind:'replay',encounter:frozen,...changed})).toThrow('战场环境');
   save.encounters[0]!.rulesetVersion='old';expect(()=>replayRequest(save,frozen.id,[actor('p')],{battleId:'r',requestId:'r'},{schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION})).toThrow('版本');
 });
 it('collects once per source using its first recorded enemy name across roster order, restore and replay',()=>{
   const {save,encounter}=fixture();encounter.enemyTeam[0]!.name='霜狼队长';encounter.enemyTeam[1]!.name='霜狼先锋';encounter.enemyTeam.reverse();
   const receipt=win(save,encounter,0);
   expect(save.companionColors).toEqual({});expect(save.equippedAbilities).toEqual({});
   expect(receipt.grants).toEqual([{kind:'fragment',id:'source1',name:'霜狼队长的灵魂碎片',quantity:1}]);
   expect(save.sources).toEqual([{sourceId:'source1',abilityId:'ability1',abilityName:'火球',rank:4,wins:1}]);
   const reopened=validateSave(JSON.parse(JSON.stringify(save)));const replay=win(reopened,reopened.encounters[0]!,1,'replay');
   expect(replay.grants).toEqual(receipt.grants);expect(reopened.sources[0]!.wins).toBe(2);
 });
 it('keeps separate enemy names and progress for distinct sources of the same mechanical ability',()=>{
   const {save,encounter}=fixture();encounter.enemyTeam[0]!.name='霜狼';encounter.enemyTeam[1]!.name='影巫';
   encounter.sources[1]!.sourceId='source2';encounter.sources[1]!.rank=0;
   for(const source of encounter.sources)source.abilityName='敌方前2名伤害〔08hzkdw〕';
   encounter.sources.reverse();const fight=battle(encounter,0);fight.result.combatants.reverse();
   const receipt=settleSave(save,{kind:'story',encounter,...fight});
   expect(receipt.grants).toEqual([
    {kind:'fragment',id:'source2',name:'影巫的灵魂碎片',quantity:1},
    {kind:'fragment',id:'source1',name:'霜狼的灵魂碎片',quantity:1},
   ]);
   expect(save.sources).toEqual(encounter.sources.map(({sourceId,abilityId,abilityName,rank})=>({sourceId,abilityId,abilityName,rank,wins:1})));
   expect(receipt.learnedAbilityIds).toEqual([]);expect(save.learnedAbilityIds).toEqual([]);expect(validateSave(save)).toEqual(save);
 });
 it.each([false,true])('credits only a defeated source while retaining its first enemy name (first enemy fled: %s)',fled=>{
   const {save,encounter}=fixture();encounter.enemyTeam[0]!.name='霜狼队长';encounter.enemyTeam[1]!.name='霜狼先锋';
   encounter.enemyTeam.push({...actor('e3'),name:'未击败的影巫'});
   encounter.sources.push({sourceId:'source2',abilityId:'ability2',abilityName:'冰矢',rank:4,enemyExternalId:'e3'});
   const fight=battle(encounter,0);
   for(const unit of fight.result.combatants.filter(c=>c.externalId==='e1'||c.externalId==='e3')){
    unit.hp=25;unit.defeated=false;unit.fled=unit.externalId==='e1'&&fled;
   }
   fight.result.defeatedExternalIds=['e2'];fight.result.fledExternalIds=fled?['e1']:[];
   const receipt=settleSave(save,{kind:'story',encounter,...fight,events:[]});
   expect(receipt.grants).toEqual([{kind:'fragment',id:'source1',name:'霜狼队长的灵魂碎片',quantity:1}]);
   expect(save.sources.map(s=>({sourceId:s.sourceId,wins:s.wins}))).toEqual([{sourceId:'source1',wins:1}]);
   expect(save.encounters[0]!.sources.map(s=>s.enemyExternalId)).toEqual(['e1','e2']);expect(validateSave(save)).toEqual(save);
 });
 it('does not unlock or collect from a loss, a fleeing enemy, or a forged origin',()=>{
   const {save,encounter}=fixture();settleSave(save,{kind:'story',encounter,...battle(encounter,0,'enemy')});expect(save.sources).toEqual([]);expect(save.encounters).toEqual([]);
   const fight=battle(encounter,1);for(const c of fight.result.combatants.filter(c=>c.side==='enemy')){c.fled=true;c.defeated=false;c.hp=25;}fight.result.defeatedExternalIds=[];fight.result.fledExternalIds=['e1','e2'];
   settleSave(save,{kind:'story',encounter:{...encounter,storyBattleId:fight.request.battleId},...fight});expect(save.sources).toEqual([]);expect(save.encounters[0]!.sources).toEqual([]);
   expect(()=>settleSave(save,{kind:'airp' as 'story',encounter,...battle(encounter,2)})).toThrow('来源');
 });
 it('stops fragments and progress for current and newly discovered sources of a learned ability',()=>{
   const {save,encounter}=fixture();win(save,encounter,0);save.learnedAbilityIds.push('ability1');const progress=structuredClone(save.sources);
   expect(win(save,save.encounters[0]!,1,'replay').grants).toEqual([]);
   const next={...encounter,id:'next',storyBattleId:'b2',sources:encounter.sources.map((s,i)=>({...s,sourceId:`new-source-${i}`}))};
   expect(win(save,next,2).grants).toEqual([]);expect(save.sources).toEqual(progress);
   expect(next.sources.every(source=>sourceIsLearned(save,source))).toBe(true);
   expect(save.encounters.every(item=>!canReplay(save,item))).toBe(true);expect(validateSave(save)).toEqual(save);
 });
 it('replays the whole frozen enemy formation with the current party at full HP',()=>{
   const {save,encounter}=fixture();win(save,encounter,0);const before=JSON.stringify(save);
   const request=replayRequest(save,encounter.id,[actor('p')],{battleId:'replay',requestId:'rr'},{schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION});
   expect(request.enemyTeam).toEqual(encounter.enemyTeam);expect(request.playerTeam[0]!.initialHp).toBe(100);expect(request.seed).toBe(42);
   request.enemyTeam[0]!.stats.hp=999;expect(save.encounters[0]!.enemyTeam[0]!.stats.hp).toBe(100);expect(JSON.stringify(save)).toBe(before);
   expect(()=>settleSave(save,{kind:'replay',encounter:{...encounter,difficulty:'tampered'},...battle(encounter,1)})).toThrow('原本');
 });
 it('displays only actual grants, commits once, and rejects conflicting results',()=>{
   const {save,encounter}=fixture();const input={kind:'story' as const,encounter,...battle(encounter,0),storyGrants:[{kind:'currency' as const,id:'gems',name:'宝石',quantity:5},{kind:'material' as const,id:'iron',name:'铁矿石',quantity:2}]};
   const receipt=settleSave(save,input);expect(receipt.grants.map(g=>[g.name,g.quantity])).toEqual([['e1的灵魂碎片',1],['宝石',5],['铁矿石',2]]);expect(save.balances).toEqual({'currency:gems':5,'material:iron':2});
   const before=JSON.stringify(save);expect(settleSave(save,input)).toEqual(receipt);expect(JSON.stringify(save)).toBe(before);
   expect(()=>settleSave(save,{...input,result:{...input.result,winner:'enemy'}})).toThrow('冲突');
   expect(()=>settleSave(save,{kind:'replay',encounter:save.encounters[0]!,...battle(encounter,1),storyGrants:input.storyGrants})).toThrow('只累计');
 });
 it('rolls back every grant when later grant validation fails',()=>{
   const {save,encounter}=fixture();const before=JSON.stringify(save);
   expect(()=>settleSave(save,{kind:'story',encounter,...battle(encounter,0),storyGrants:[{kind:'material',id:'x',name:'矿',quantity:-1}]})).toThrow();expect(JSON.stringify(save)).toBe(before);
 });
 it('rejects reused encounter identities, changed rules, conflicting duplicate sources and forged imports',()=>{
   const {save,encounter}=fixture();
   expect(()=>settleSave(save,{kind:'story',encounter:{...encounter,storyBattleId:'different'},...battle(encounter,0)})).toThrow('绑定');
   const conflict=structuredClone(encounter);conflict.sources[1]!.abilityId='other';
   expect(()=>settleSave(save,{kind:'story',encounter:conflict,...battle(encounter,0)})).toThrow('冲突');
   win(save,encounter,0);const before=JSON.stringify(save);
   expect(()=>settleSave(save,{kind:'story',encounter:{...encounter,storyBattleId:'b1'},...battle(encounter,1)})).toThrow('标识');
   expect(()=>settleSave(save,{kind:'replay',encounter:save.encounters[0]!,...battle(encounter,1),request:{...battle(encounter,1).request,seed:99},result:{...battle(encounter,1).result,seed:99}})).toThrow('种子');
   expect(JSON.stringify(save)).toBe(before);expect(validateSave(save)).toEqual(save);
   const editedEnemy=structuredClone(save);editedEnemy.encounters[0]!.enemyTeam[0]!.stats.hp++;expect(()=>validateSave(editedEnemy)).toThrow('原始战斗收据');
   const forged=structuredClone(save);forged.encounters[0]!.sources[0]!.enemyExternalId='absent';expect(()=>validateSave(forged)).toThrow('未出现');
   const invalid=structuredClone(save);invalid.sources[0]!.wins=999;expect(()=>validateSave(invalid)).toThrow('进度');
   const receipt=structuredClone(save);receipt.settlements.push(structuredClone(receipt.settlements[0]!));expect(()=>validateSave(receipt)).toThrow('重复');
   const noVictory=structuredClone(save);noVictory.settlements=[];expect(()=>validateSave(noVictory)).toThrow('胜利');
 });
 it('requires learned status only; mana colors are not bound to abilities',()=>{
   const {save}=fixture();expect(canEquipAbility(save,'ability1')).toBe(false);save.learnedAbilityIds.push('ability1');
   expect(canEquipAbility(save,'ability1')).toBe(true);
 });
});


describe('ST durable replay lifecycle',()=>{
 it('persists the authoritative full-health ticket and completes once without story loot',()=>{
   const {save,encounter}=fixture();win(save,encounter,0);
   const prepared=[actor('p')];const ticket=beginReplay(save,encounter.id,prepared,{battleId:'b1',requestId:'r1'});
   expect(prepared[0]!.initialHp).toBe(25);expect(ticket.request.playerTeam[0]!.initialHp).toBe(100);
   ticket.request.enemyTeam[0]!.name='edited response';expect(save.pendingReplay!.request.enemyTeam[0]!.name).toBe('e1');
   expect(()=>beginReplay(save,encounter.id,prepared,{battleId:'b2',requestId:'r2'})).toThrow('待完成');
   const restored=validateSave(JSON.parse(JSON.stringify(save)));
   const fight=battle(encounter,1);const result=structuredClone(fight.result);result.combatants[0]!.hp=100;
   const receipt=completeReplay(restored,result,fight.events);expect(receipt.grants.map(g=>g.kind)).toEqual(['fragment']);expect(restored.balances).toEqual({});
   expect(restored.pendingReplay).toBeUndefined();expect(restored.sources[0]!.wins).toBe(2);
   expect(completeReplay(restored,result,[])).toEqual(receipt);expect(restored.sources[0]!.wins).toBe(2);
   expect(()=>completeReplay(restored,{...result,turns:99},[])).toThrow('冲突');
   expect(validateSave(restored).settlements).toHaveLength(2);
 });
 it('rejects imported tickets with edited enemies, incomplete player HP or reused settlement IDs',()=>{
   const {save,encounter}=fixture();win(save,encounter,0);beginReplay(save,encounter.id,[actor('p')],{battleId:'b1',requestId:'r1'});
   for(const mutate of [(s:StSave)=>{s.pendingReplay!.request.enemyTeam[0]!.stats.attack++;},(s:StSave)=>{s.pendingReplay!.request.playerTeam[0]!.initialHp=25;},(s:StSave)=>{s.pendingReplay!.request.battleId='b0';},(s:StSave)=>{s.pendingReplay!.encounterId='missing';}]){
     const damaged=structuredClone(save);mutate(damaged);expect(()=>validateSave(damaged)).toThrow();
   }
   expect(()=>completeReplay(save,{...battle(encounter,2).result},[])).toThrow('对应');expect(save.sources[0]!.wins).toBe(1);
 });
 it('keeps the ticket intact after invalid results and allows retrying a defeat with zero grants',()=>{
   const {save,encounter}=fixture();win(save,encounter,0);beginReplay(save,encounter.id,[actor('p')],{battleId:'b1',requestId:'r1'});
   const result=battle(encounter,1,'enemy').result;result.combatants[0]={...result.combatants[0]!,hp:0,defeated:true};result.defeatedExternalIds.push('p');
   expect(()=>completeReplay(save,{...result,seed:77},[])).toThrow();expect(save.pendingReplay).toBeDefined();
   const receipt=completeReplay(save,result,[]);expect(receipt.grants).toEqual([]);expect(save.sources[0]!.wins).toBe(1);expect(save.pendingReplay).toBeUndefined();
 });
 it('retries an older receipt without clearing a newer pending challenge',()=>{
   const {save,encounter}=fixture();win(save,encounter,0);beginReplay(save,encounter.id,[actor('p')],{battleId:'b1',requestId:'r1'});
   const first=battle(encounter,1);completeReplay(save,first.result,first.events);beginReplay(save,encounter.id,[actor('p')],{battleId:'b2',requestId:'r2'});
   completeReplay(save,first.result,first.events);expect(save.pendingReplay!.request.battleId).toBe('b2');expect(save.sources[0]!.wins).toBe(2);expect(validateSave(save).pendingReplay).toBeDefined();
 });
 it('finishes with zero fragments if a story victory learns the ability while replay is pending',()=>{
   const {save,encounter}=fixture();win(save,encounter,0);for(let n=1;n<4;n++)win(save,save.encounters[0]!,n,'replay');
   beginReplay(save,encounter.id,[actor('p')],{battleId:'b4',requestId:'r4'});
   win(save,{...encounter,id:'another-story',storyBattleId:'b99'},99);expect(canReplay(save,save.encounters[0]!)).toBe(false);
   expect(validateSave(save).pendingReplay).toBeDefined();const fight=battle(encounter,4);const receipt=completeReplay(save,fight.result,fight.events);
   expect(receipt.grants).toEqual([]);expect(save.pendingReplay).toBeUndefined();expect(save.sources[0]!.wins).toBe(5);
 });

});


describe('ST native ability availability is checked before ticket persistence',()=>{
  it.each(['story','replay'] as const)('allows a native economic ability in a new %s party without altering collection progress',kind=>{
    const {save,encounter}=fixture();win(save,encounter,0);
    const before=structuredClone(save);const party=[{...actor('p'),skillId:'st:7037'}];
    if(kind==='story')beginStory(save,{...battle(encounter,1).request,playerTeam:party},encounter.sources,'normal','next-story');
    else beginReplay(save,encounter.id,party,{battleId:'b1',requestId:'r1'});
    const ticket=kind==='story'?save.pendingStory:save.pendingReplay;
    expect(ticket?.request.playerTeam[0]!.skillId).toBe('st:7037');
    expect(save.sources).toEqual(before.sources);expect(save.encounters).toEqual(before.encounters);
    expect(save.learnedAbilityIds).toEqual(before.learnedAbilityIds);
    expect(validateSave(JSON.parse(JSON.stringify(save)))).toEqual(save);
  });
  it('replays a historical economic enemy with its original full roster',()=>{
    const {save,encounter}=fixture();encounter.enemyTeam[0]!.skillId='st:7037';win(save,encounter,0);
    const before=structuredClone(save);beginReplay(save,encounter.id,[actor('p')],{battleId:'b1',requestId:'r1'});
    expect(save.pendingReplay!.request.enemyTeam).toEqual(encounter.enemyTeam);
    expect(save.encounters).toEqual(before.encounters);expect(save.sources).toEqual(before.sources);
    expect(validateSave(JSON.parse(JSON.stringify(save)))).toEqual(save);
  });
  it('retains the full random candidate ability and frozen enemy roster in a new replay',()=>{
    const {save,encounter}=fixture();win(save,encounter,0);const before=structuredClone(save);
    beginReplay(save,encounter.id,[{...actor('p'),skillId:'st:8553'}],{battleId:'b1',requestId:'r1'});
    expect(save.pendingReplay!.request.playerTeam[0]!.skillId).toBe('st:8553');
    expect(save.pendingReplay!.request.enemyTeam).toEqual(encounter.enemyTeam);
    expect(save.encounters).toEqual(before.encounters);expect(save.sources).toEqual(before.sources);
  });
  it.each(['story','replay'] as const)('rejects an actually missing skill before persisting a %s ticket',kind=>{
    const {save,encounter}=fixture();win(save,encounter,0);const before=structuredClone(save);
    const party=[{...actor('p'),skillId:'st:missing-skill'}];
    expect(()=>kind==='story'
      ?beginStory(save,{...battle(encounter,1).request,playerTeam:party},encounter.sources,'normal','next-story')
      :beginReplay(save,encounter.id,party,{battleId:'b1',requestId:'r1'})).toThrow();
    expect(save).toEqual(before);
  });
});
