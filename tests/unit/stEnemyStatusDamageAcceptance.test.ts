import {describe,expect,it} from 'vitest';
// @ts-expect-error Node-only acceptance evidence; the app intentionally has no Node types.
import {readFileSync} from 'node:fs';
// @ts-expect-error Node-only portrait byte verification.
import {createHash} from 'node:crypto';
import sourceTroops from '../../src/data/troops.json';
import sourceTraits from '../../src/data/traits.json';
import progression from '../../src/data/troop-progression.json';
import {BaseColor,colorGem,skullGem} from '../../src/engine/types';
import type {GameEvent} from '../../src/engine/events';
import {skill,dmg,inflict} from '../../src/engine/skills/builders';
import {AiTargetChooser,prototypeChosenTargetMode} from '../../src/engine/skills/targetChooser';
import {firstCastableCharacter,chooseAiAction} from '../../src/engine/aiPolicy';
import {adaptedTraitDescription,restoreEnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {PORTRAITS} from '../../src/sillytavern/portraits';
import {STATUS_SOURCES,sides,otherSide,legalBoard,blueprint,battle,dummy,stats,grid,frame,go,cast,swap,charge} from '../helpers/stStatusDamageHarness';
import type {Run,StatusSource} from '../helpers/stStatusDamageHarness';

const readJson=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const rawTroops=readJson('data/raw/troops.gow.en.json').troops;
const rawSpells=readJson('data/raw/spells.gow.en.json').spells;
const hits=(events:GameEvent[])=>events.filter(e=>e.type==='skill-damage');
const applications=(events:GameEvent[])=>events.filter(e=>e.type==='status-apply');
const own=(r:Run)=>r.state.teams[r.side].characters;
const baseline=(e:StatusSource)=>e.scales.find(s=>s.level===20&&s.difficulty===1)!;

// Only this source's frozen arithmetic supplies damage expectations. Native status rules are
// reused via the exact test references in .tmp/st-status-damage-records.json, not copied here.
function assertActive(e:StatusSource,r:Run,events:GameEvent[],damage:number,targets=r.foes.filter(c=>!c.defeated)){
 const ids=(e.id===6220?targets:[targets.find(c=>c.id===r.byName('chosen')?.id)??targets[0]!]).map(c=>c.id);
 expect(events.filter(e=>e.type==='skill-cast')).toEqual([expect.objectContaining({characterId:r.caster.id,skillId:`st:${e.sourceTroop.spell.id}`})]);
 expect(hits(events).map(h=>[h.targetId,h.damage])).toEqual(ids.map(id=>[id,damage]));
 expect(applications(events).map(s=>[s.targetId,s.statusId,s.turns])).toEqual(e.active.statuses.flatMap(s=>ids.map(id=>[id,s.id,s.turns])));
 const lastHit=Math.max(...events.map((e,i)=>e.type==='skill-damage'?i:-1));
 expect(events.findIndex(e=>e.type==='status-apply')).toBeGreaterThan(lastHit);
 expect(r.caster.mana).toBe(0);
 expect(r.session.recordedEvents()).toEqual(expect.arrayContaining(events));
}

for(const e of STATUS_SOURCES)describe(`ST status damage ${e.id} ${e.name}`,()=>{
 it('freezes independent English clauses, native ordered steps, all three source traits, progression and portrait bytes',()=>{
  expect(sourceTroops.find(t=>t.id===e.id)).toEqual(e.sourceTroop);
  expect((progression as Record<string,unknown>)[String(e.id)]).toEqual(e.progression);
  expect(e.sourceTraits).toHaveLength(3);
  for(const trait of e.sourceTraits)expect(sourceTraits.find(t=>t.code===trait.code)).toEqual(trait);
  const raw=rawTroops.find((t:{id:number})=>t.id===e.id);
  expect({referenceName:raw.ReferenceName,spellId:raw.SpellId,cost:raw.ManaCost,colors:raw._ManaColors_parsed,rarityIdx:raw.RarityIdx,kingdomId:raw.KingdomId,troopTypes:[raw.TroopType,raw.TroopType2].filter(Boolean),description:raw.stats.spell.desc,traits:raw.stats.traits.map((t:{code:string;name:string;description:string})=>({code:t.code,name:t.name,description:t.description}))}).toEqual(e.english);
  // Wrapper 7362 is mislabeled 'troop'; the actual RawData.Id/SpellSteps own the identity.
  const native=rawSpells.map((s:{RawData?:string;data?:string})=>JSON.parse(s.RawData??s.data??'{}')).find((s:{Id:number;SpellSteps?:unknown[]})=>s.Id===e.sourceTroop.spell.id&&s.SpellSteps);
  expect(native).toEqual(e.nativeSpell);
  expect(PORTRAITS.find(p=>p.troopId===e.id)).toEqual(e.portrait);
  expect(createHash('sha256').update(readFileSync(`game-assets/public/static/portraits/${e.portrait.assetId}.webp`)).digest('hex')).toBe(e.portraitSha256);
  expect(e.portrait.contentHash).toBe(e.portraitSha256);
 });
 it('binds portrait, complete ordinary traits, input metadata, descriptions, role and heterogeneous context through ST preparation',()=>{
  const r=battle(e),t=e.sourceTroop;
  expect(r.bp.sourceId).toBe(`enemy:${e.id}`);
  expect(r.bp.portrait).toMatchObject({troopId:e.id,assetId:e.portrait.assetId,contentHash:e.portraitSha256,query:{manaColors:t.manaColors,rank:e.portrait.rank,form:e.portrait.form,role:t.role}});
  expect(r.bp.snapshot).toMatchObject({mechanicalIdentity:`unit:${e.id}`,portraitUrl:e.portrait.portraitUrl,role:t.role,rarityIdx:t.rarityIdx,manaColors:t.manaColors,manaCost:t.manaCost,skillId:`st:${t.spell.id}`,traitIds:e.keptTraitCodes.map(c=>`st:${c}`),stats:baseline(e).stats});
  expect(r.bp.context).toEqual(e.context);
  expect(r.caster).toMatchObject({mechanicalIdentity:`unit:${e.id}`,role:t.role,colors:t.manaColors,manaCost:t.manaCost,troopTypes:e.context.affinities,kingdom:e.context.region,kingdomId:e.context.regionId,traitIds:e.keptTraitCodes.map(c=>`st:${c}`)});
  expect(r.bp.budget).toMatchObject({activeCount:1,traitCount:e.keptTraitCodes.length,effectSegments:1+e.active.statuses.length,manaCost:t.manaCost});
  expect(r.bp.omittedMechanisms).toEqual(e.omittedMechanisms);
  expect(r.bp.descriptionAudit).toEqual({support:'full',diagnostics:[]});
  expect(r.bp.traitDescriptionAudit).toEqual(e.keptTraitCodes.map(c=>({code:`st:${c}`,support:'full',diagnostics:[]})));
  for(const term of e.active.descriptionTerms)expect(r.bp.snapshot.spellDescription).toContain(term);
  for(const [code,terms] of Object.entries(e.traitDescriptionTerms)){const d=adaptedTraitDescription(code)!;expect(d.support).toBe('full');for(const term of terms!)expect(d.description).toContain(term);expect(d.diagnostics).toEqual([]);}
  const prototype=r.setup.registry.prototypes.get(r.caster.skillId)!;
  expect(prototypeChosenTargetMode(prototype)).toBe(e.id===6220?null:'enemyChosen');
  expect(prototype.segments).toHaveLength(1+e.active.statuses.length);
  expect(prototype.segments[0]).toMatchObject({kind:'damage',target:e.active.target,scaling:{base:e.active.base,mult:1}});
  e.active.statuses.forEach((s,i)=>expect(prototype.segments[i+1]).toMatchObject({kind:'status',target:e.active.target,statusId:s.id,turns:s.turns,...('magnitude'in s?{magnitude:s.magnitude}:{})}));
 });
 for(const side of sides){
  for(const scale of e.scales)it(`executes source damage then every status at level ${scale.level} difficulty ${scale.difficulty} on ${side}`,()=>{
   const r=battle(e,{side,level:scale.level,difficulty:scale.difficulty}),before=r.foes.map(stats),board=structuredClone(grid(r));
   expect(r.bp.snapshot.stats).toEqual(scale.stats);
   expect(stats(r.caster)).toEqual({...scale.stats,maxHp:scale.stats.hp,armor:scale.stats.armor+(e.id===7131?2:0),mana:e.openingMana});
   const events=cast(r);assertActive(e,r,events,scale.damage);
   expect(r.caster.magic).toBe(scale.stats.magic+(e.id===6788?1:0));
   expect(grid(r)).toEqual(board);expect(r.state.actionLog).toHaveLength(1);expect(r.state.activePlayer).toBe(otherSide(side));
   for(const [i,foe]of r.foes.entries()){
    const affected=e.id===6220||i===1;
    const ticks=events.filter(x=>x.type==='status-tick'&&x.targetId===foe.id);
    const lifeTick=ticks.reduce((n,x)=>n+(x.type==='status-tick'?(x.damage??0):0),0),armorTick=ticks.reduce((n,x)=>n+(x.type==='status-tick'?(x.armorDamage??0):0),0);
    expect(foe.armor).toBe(Math.max(0,before[i]!.armor-(affected?scale.damage:0))-armorTick);
    expect(foe.hp).toBe(before[i]!.hp-(affected?Math.max(0,scale.damage-before[i]!.armor):0)-lifeTick);
   }
  });
  for(const color of Object.values(BaseColor))it(`routes a real ${color} three-match only to associated source mana on ${side}`,()=>{
   const r=battle(e,{side,match:colorGem(color)}),events=swap(r),gain=e.sourceTroop.manaColors.includes(color)?3:0;
   expect(events.find(x=>x.type==='elimination')).toMatchObject({type:'elimination'});
   expect(r.caster.mana).toBe(e.openingMana+gain);
   const mana=events.filter(x=>x.type==='mana-gain'&&x.characterId===r.caster.id);
   expect(mana.reduce((sum,x)=>sum+(x.type==='mana-gain'?x.amount:0),0)).toBe(gain);
   expect(mana.every(x=>x.type==='mana-gain'&&x.player===side&&x.color===color)).toBe(true);
   expect(r.foes.every(c=>c.mana===0)).toBe(true);
  });
  it(`naturally reaches the exact cost, spends once and rejects an empty recast on ${side}`,()=>{
   const r=battle(e,{side}),cost=e.sourceTroop.manaCost,color=e.sourceTroop.manaColors[0] as BaseColor;
   let expected=e.openingMana;
   while(expected<cost){expect(charge(r,color).some(x=>x.type==='mana-gain')).toBe(true);expected=Math.min(cost,expected+3);expect(r.caster.mana).toBe(expected);}
   go(r);const events=r.session.resolve({type:'cast',characterId:r.caster.id});assertActive(e,r,events,baseline(e).damage);
   go(r);const before=frame(r);expect(r.session.resolve({type:'cast',characterId:r.caster.id})).toEqual([]);expect(frame(r)).toEqual(before);
  });
  it(`honors every selected live slot and excludes dead slots without reselecting status riders on ${side}`,()=>{
   for(const selected of [0,1,3]){
    const r=battle(e,{side,opponents:[dummy('slot-0'),dummy('slot-1'),dummy('dead-hole'),dummy('slot-3')],dead:['dead-hole']});
    const target=r.foes[selected]!,before=r.foes.map(stats),events=cast(r,target),ids=(e.id===6220?[r.foes[0]!,r.foes[1]!,r.foes[3]!]:[target]).map(c=>c.id);
    expect(hits(events).map(h=>[h.targetId,h.damage])).toEqual(ids.map(id=>[id,baseline(e).damage]));
    expect(applications(events).map(s=>[s.targetId,s.statusId])).toEqual(e.active.statuses.flatMap(s=>ids.map(id=>[id,s.id])));
    expect(stats(r.foes[2]!)).toEqual(before[2]);
    expect(events.some(x=>('targetId'in x&&x.targetId===r.foes[2]!.id))).toBe(false);
    expect(own(r).every(c=>c.statuses.length===0)).toBe(true);
   }
   const r=battle(e,{side}),target=r.foes[1]!,survivors=[r.foes[0]!.id,r.foes[2]!.id];target.hp=1;target.armor=0;
   const events=cast(r);
   expect(target.defeated).toBe(true);
   expect(applications(events).some(s=>s.targetId===target.id)).toBe(false);
   expect(applications(events).map(s=>s.targetId)).toEqual(e.id===6220?e.active.statuses.flatMap(()=>survivors):[]);
  });
  it(`rejects insufficient mana, silence, wrong-side, unknown and defeated casters atomically on ${side}`,()=>{
   for(const invalid of ['low-mana','silence','wrong-side','unknown','dead']){
    const r=battle(e,{side});r.caster.mana=e.sourceTroop.manaCost;
    if(invalid==='low-mana')r.caster.mana--;
    if(invalid==='silence')r.caster.statuses=[{id:'silence',turns:3}];
    if(invalid==='dead'){r.caster.hp=0;r.caster.defeated=true;}
    const id=invalid==='wrong-side'?r.foes[0]!.id:invalid==='unknown'?999:r.caster.id;
    r.foes[0]!.mana=12;const before=frame(r);
    expect(r.session.resolve({type:'cast',characterId:id})).toEqual([]);expect(frame(r)).toEqual(before);
   }
  });
  if(e.id!==6220)it(`rolls back cancellation, friendly, stale and dead choices including chooser RNG on ${side}`,()=>{
   for(const invalid of ['cancel','friendly','stale','dead']){
    const r=battle(e,{side});r.caster.mana=e.sourceTroop.manaCost;
    if(invalid==='dead'){r.foes[1]!.hp=0;r.foes[1]!.defeated=true;}
    let calls=0;r.engine.setTargetChooser({choose:(_mode,state,casterId,rng)=>{calls++;expect(state).toBe(r.state);expect(casterId).toBe(r.caster.id);rng.next();rng.nextInt(9);return invalid==='cancel'?null:invalid==='friendly'?r.caster.id:invalid==='stale'?999:r.foes[1]!.id;}});
    const before=frame(r);expect(r.session.resolve({type:'cast',characterId:r.caster.id})).toEqual([]);expect(calls).toBe(1);expect(frame(r)).toEqual(before);
   }
  });
  else it(`executes the complete all-enemy active without requesting a cancellable target on ${side}`,()=>{
   const r=battle(e,{side});r.caster.mana=e.sourceTroop.manaCost;r.engine.setTargetChooser({choose:()=>{throw new Error('AllEnemies must not request a target');}});
   assertActive(e,r,r.session.resolve({type:'cast',characterId:r.caster.id}),baseline(e).damage);
  });
  it(`AI recognizes the source role and full-mana active and executes its legal target on ${side}`,()=>{
   const r=battle(e,{side,opponents:[dummy('front'),dummy('chosen',{stats:{hp:800,armor:7,attack:8,magic:0}}),dummy('back')]});
   expect(firstCastableCharacter(r.state,side,r.setup.registry)).toBeNull();r.caster.mana=e.sourceTroop.manaCost;
   const before=frame(r);expect(firstCastableCharacter(r.state,side,r.setup.registry)).toBe(r.caster);
   const decision=chooseAiAction({state:r.state,side,rng:r.rng,registry:r.setup.registry});
   expect(decision).toEqual({reason:'cast',action:{type:'cast',characterId:r.caster.id}});expect(frame(r)).toEqual(before);
   r.engine.setTargetChooser(new AiTargetChooser());assertActive(e,r,r.session.resolve(decision!.action),baseline(e).damage);
  });
  it(`reopens the saved blueprint and request and deterministically replays charge, statuses, events and result on ${side}`,()=>{
   const play=(restore:boolean)=>{
    const r=battle(e,{side,restore});expect(charge(r,e.sourceTroop.manaColors[0] as BaseColor).some(x=>x.type==='elimination')).toBe(true);
    const events=cast(r);assertActive(e,r,events,baseline(e).damage);
    go(r);const second=cast(r);expect(hits(second).length).toBeGreaterThan(0);
    r.session.surrender();expect(r.session.isFinished()).toBe(true);const result=r.session.buildResult();expect(r.session.buildResult()).toBe(result);
    return {blueprint:r.bp,request:r.request,frame:frame(r),grid:grid(r),result};
   };
   expect(play(true)).toEqual(play(false));
  });
 }
 it('rejects tampered saved recipes and unavailable skill, trait and context dependencies before execution',()=>{
  for(const field of ['manaCost','traitIds','stats','portrait']){
   const saved=JSON.parse(JSON.stringify(blueprint(e)));
   if(field==='portrait')saved.portrait.contentHash='0'.repeat(64);
   else if(field==='stats')saved.snapshot.stats.magic++;
   else if(field==='traitIds')saved.snapshot.traitIds=[];
   else saved.snapshot.manaCost++;
   expect(()=>restoreEnemyBlueprint(saved)).toThrow();
  }
  const r=battle(e),before=frame(r);
  for(const field of ['skillId','traitIds','troopTypes']){
   const request=structuredClone(r.request),subject=[...request.playerTeam,...request.enemyTeam].find(c=>c.externalId==='subject')!;
   if(field==='skillId')subject.skillId='st:missing-status-source';
   else if(field==='traitIds')subject.traitIds=['st:missing-status-trait'];
   else subject.troopTypes=['affinity:99999'];
   expect(()=>prepareStBattle(request)).toThrow();expect(frame(r)).toEqual(before);
  }
 });
});

// Mechanism tests already exist; these stimuli verify that the real source keeps those hooks
// after compile -> prepare -> map -> TurnEngine -> BattleSession, including side/context boundaries.
for(const e of STATUS_SOURCES.filter(e=>e.id!==6788))describe(`ST status traits ${e.id} ${e.name}`,()=>{
 for(const side of sides){
  const immunities=e.id===6220?['burning','faerie-fire']:['poison','disease','lycanthropy','wolf','wolf-form','death-mark'];
  for(const status of immunities)it(`source immunity blocks hostile ${status} while an allied control accepts it on ${side}`,()=>{
   const r=battle(e,{side,allies:[dummy('control')],probe:skill(inflict(status,'enemyAll'))});
   const events=cast(r,r.caster,r.foes[0]!);
   expect(events).toContainEqual(expect.objectContaining({type:'status-blocked',targetId:r.caster.id,statusId:status,reason:'immune'}));
   expect(events).toContainEqual(expect.objectContaining({type:'status-apply',targetId:r.byName('control').id,statusId:status}));
   expect(r.caster.statuses.some(s=>s.id===status)).toBe(false);
   const blocked=events.find(x=>x.type==='status-blocked'&&x.targetId===r.caster.id)!;
   expect('traitActivations'in blocked&&blocked.traitActivations?.some(t=>t.traitId===`st:${e.id===6220?'fireproof':'undying'}`)).toBe(true);
  });
  it(`source immunity accepts unrelated negative status and stun suppresses its trait on ${side}`,()=>{
   const unrelated=e.id===6220?'poison':'burning';
   const open=battle(e,{side,probe:skill(inflict(unrelated,'enemyChosen'))});
   expect(cast(open,open.caster,open.foes[0]!)).toContainEqual(expect.objectContaining({type:'status-apply',targetId:open.caster.id,statusId:unrelated}));
   const r=battle(e,{side,probe:skill(inflict('stun','enemyChosen'),inflict(e.id===6220?'burning':'poison','enemyChosen'))});
   const events=cast(r,r.caster,r.foes[0]!);
   expect(applications(events).filter(s=>s.targetId===r.caster.id).map(s=>s.statusId)).toEqual(['stun',e.id===6220?'burning':'poison']);
  });
  it(`source skull reduction acts on real incoming hits and leaves spell damage unchanged on ${side}`,()=>{
   const r=battle(e,{side,startSide:otherSide(side),match:skullGem(),probe:skill(dmg('enemyChosen',8,0))});
   const before=stats(r.caster),damage=e.id===6220?4:6,events=swap(r);
   expect(events.filter(e=>e.type==='skull-damage').map(e=>[e.targetId,e.damage])).toEqual([[r.caster.id,damage]]);
   expect(r.caster.hp+r.caster.armor).toBe(before.hp+before.armor-damage);
   const beforeSpell=r.caster.hp+r.caster.armor;
   expect(hits(cast(r,r.caster,r.foes[0]!)).map(h=>[h.targetId,h.damage])).toEqual([[r.caster.id,8]]);
   expect(r.caster.hp+r.caster.armor).toBe(beforeSpell-8);
  });
 }
});

const lava=STATUS_SOURCES.find(e=>e.id===6220)!;
describe('ST status traits 6220 LavaElemental composition',()=>{
 for(const side of sides)it(`its real Burn rider enables pyromania only on burning targets and stun disables the bonus on ${side}`,()=>{
  for(const condition of ['plain','burning','stunned']){
   const r=battle(lava,{side});
   if(condition!=='plain'){
    const events=cast(r);expect(applications(events).map(s=>s.statusId)).toEqual(['burning','burning','burning']);
    // Keep the already applied rider across this owner-turn; only recovery odds are pinned.
    for(const foe of r.foes)for(const status of foe.statuses)status.recoveryChance=0;
    go(r);expect(r.foes[0]!.statuses.some(s=>s.id==='burning')).toBe(true);
   }
   if(condition==='stunned')r.caster.statuses=[{id:'stun',turns:3}];
   r.state.board=legalSkulls();const before=r.foes[0]!.hp+r.foes[0]!.armor,events=swap(r),damage=condition==='burning'?26:13;
   expect(events.filter(e=>e.type==='skull-damage').map(e=>[e.targetId,e.damage])).toEqual([[r.foes[0]!.id,damage]]);
   const tick=events.filter(e=>e.type==='status-tick'&&e.targetId===r.foes[0]!.id).reduce((n,e)=>n+(e.type==='status-tick'?(e.damage??0)+(e.armorDamage??0):0),0);
   expect(r.foes[0]!.hp+r.foes[0]!.armor).toBe(before-damage-tick);
  }
 });
});
// Reuse the established deterministic legal board; no injected combat result or synthetic subject.
function legalSkulls(){return legalBoard(skullGem());}

const guard=STATUS_SOURCES.find(e=>e.id===7131)!;
describe('ST status traits 7131 VaultGuard context',()=>{
 for(const side of sides)it(`Undead Shield grants armor exactly once only to living allied Undead aliases on ${side}`,()=>{
  const affinity=guard.context.affinities[0]!;
  const r=battle(guard,{side,allies:[dummy('kin',{troopTypes:[affinity]}),dummy('narrative-undead',{name:'Undead',troopTypes:['affinity:1']}),dummy('dead-kin',{troopTypes:[affinity]})],opponents:[dummy('front',{troopTypes:[affinity]}),dummy('chosen')],dead:['dead-kin']});
  expect(own(r).map(c=>[c.armor,c.mana])).toEqual([[11,0],[9,0],[7,0],[7,0]]);
  expect(r.foes[0]!.armor).toBe(7);go(r);cast(r);go(r);
  expect(own(r).map(c=>c.armor)).toEqual([11,9,7,7]);
 });
});

const amaru=STATUS_SOURCES.find(e=>e.id===6788)!;
describe('ST status traits 6788 Amaru composition',()=>{
 for(const side of sides){
  it(`Fast opens at five mana and Arcane responds to allied and own casts before damage but excludes hostile casts on ${side}`,()=>{
   const r=battle(amaru,{side,allies:[dummy('ally')],probe:skill(dmg('enemyChosen',0,0))});
   expect(own(r).map(c=>c.mana)).toEqual([5,0]);expect(r.caster.magic).toBe(10);
   expect(cast(r,r.foes[1]!,r.byName('ally'))).toContainEqual(expect.objectContaining({type:'buff',targetId:r.caster.id,stat:'magic',amount:1}));expect(r.caster.magic).toBe(11);
   const enemyEvents=cast(r,r.caster,r.foes[0]!);expect(enemyEvents.some(x=>x.type==='buff'&&x.targetId===r.caster.id&&x.stat==='magic')).toBe(false);expect(r.caster.magic).toBe(11);
   const events=cast(r);expect(hits(events).map(h=>[h.targetId,h.damage])).toEqual([[r.foes[1]!.id,16]]);expect(r.caster.magic).toBe(12);
   expect(events.findIndex(x=>x.type==='buff'&&x.targetId===r.caster.id&&x.stat==='magic')).toBeLessThan(events.findIndex(x=>x.type==='skill-damage'));
   const stunned=battle(amaru,{side});stunned.caster.statuses=[{id:'stun',turns:3}];expect(hits(cast(stunned)).map(h=>h.damage)).toEqual([14]);expect(stunned.caster.magic).toBe(10);
  });
  it(`Curse then Stun lets the real Poison rider pass ordinary immunity while preserving source target order on ${side}`,()=>{
   const r=battle(amaru,{side,opponents:[dummy('front'),dummy('chosen',{traitIds:['st:undying']}),dummy('back')]});
   const events=cast(r);assertActive(amaru,r,events,15);
   expect(events.some(x=>x.type==='status-blocked'&&x.targetId===r.foes[1]!.id)).toBe(false);
   expect(r.foes[1]!.statuses.some(s=>s.id==='poison')).toBe(true);
  });
 }
 it('explicitly accounts for the original mode-only Bountyhunter omission without inventing a battle reward',()=>{
  expect(amaru.sourceTraits[0]).toMatchObject({code:'bountyhunter',onDelveBounty:{min:2,max:6}});
  const r=battle(amaru);expect(r.bp.omittedMechanisms).toEqual(['赏金猎人']);expect(r.caster.traitIds).toEqual(['st:arcane','st:fast']);
  const before=structuredClone(r.state.economy);cast(r);expect(r.state.economy).toEqual(before);
  expect(r.session.recordedEvents().some(e=>e.type==='economy-gain')).toBe(false);
 });
});
