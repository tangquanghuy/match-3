import {describe,it,expect} from 'vitest';
// @ts-expect-error Node-only source evidence; browser app intentionally has no Node types.
import {readFileSync} from 'node:fs';
// @ts-expect-error Node-only portrait byte evidence.
import {createHash} from 'node:crypto';
import frozen from '../fixtures/stEnemyRandomTargetExpectations.json';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {SeededRNG} from '../../src/engine/rng';
import {BaseColor,PlayerSide,colorGem} from '../../src/engine/types';
import type {GameEvent} from '../../src/engine/events';
import {FixedTargetChooser} from '../../src/engine/skills/targetChooser';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest,CombatantSnapshot} from '../../src/session/contract';
import {BattleSession} from '../../src/session/BattleSession';
import {mapRequestToTeams} from '../../src/session/combatantMapping';
import {adaptedTraitDescription,compileEnemyBlueprint,restoreEnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {PORTRAITS,savePortrait} from '../../src/sillytavern/portraits';

type Row=typeof frozen.enemies[number];
const sides=[PlayerSide.Left,PlayerSide.Right];
const colors=Object.values(BaseColor);
const other=(side:PlayerSide)=>side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
const raw=JSON.parse(readFileSync('data/raw/troops.gow.en.json','utf8')).troops;
const spells=JSON.parse(readFileSync('data/raw/spells.gow.en.json','utf8')).spells;
const traits=JSON.parse(readFileSync('data/raw/gow-2026-09-18/traits.en.json','utf8')).traits.map((t:{RawData:string})=>JSON.parse(t.RawData));
const dummy=(externalId:string,overrides:Partial<CombatantSnapshot>={}):CombatantSnapshot=>({externalId,name:externalId,stats:{hp:1000,armor:7,attack:0,magic:0},manaColors:[BaseColor.Blue],manaCost:12,skillId:'gw_KnightsSword',...overrides});
function blueprint(row:Row,level=20,difficulty=1){
 const p=PORTRAITS.find(p=>p.troopId===row.enemyId)!;
 return compileEnemyBlueprint({portrait:savePortrait({manaColors:p.manaColors,rank:p.rank,form:p.form,role:p.role},p),externalId:'subject',level,difficulty});
}
function board(color=BaseColor.Blue){
 const b=new BoardModel();
 for(let row=0;row<8;row++)for(let col=0;col<8;col++)b.set({row,col},{id:row*8+col,type:colorGem(colors[(row*3+col*5)%6]!)});
 const different=color===BaseColor.Blue?BaseColor.Green:BaseColor.Blue;
 for(const [row,col,c]of [[0,0,color],[0,1,different],[0,2,color],[1,1,color],[0,3,different]]as const)b.set({row,col},{id:row*8+col,type:colorGem(c)});
 return b;
}
type Options={side?:PlayerSide;level?:number;difficulty?:number;seed?:number;restore?:boolean;allies?:CombatantSnapshot[];dead?:string[]};
function battle(row:Row,o:Options={}){
 const side=o.side??PlayerSide.Right,original=blueprint(row,o.level,o.difficulty),bp=o.restore?restoreEnemyBlueprint(JSON.parse(JSON.stringify(original))):original;
 const own=[bp.snapshot,...o.allies??[]],foes=[dummy('first'),dummy('middle'),dummy('last')];
 const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:`random-target-${row.enemyId}`,requestId:`random-target-${row.enemyId}`,seed:o.seed??37,playerTeam:side===PlayerSide.Left?own:foes,enemyTeam:side===PlayerSide.Right?own:foes};
 const prepared=prepareStBattle(request);
 // Test-only stimulus on dummy controls; the real subject keeps its full native active and traits.
 prepared.registry.prototypes.set('gw_KnightsSword',{segments:[{kind:'damage',target:'enemyChosen',scaling:{base:1,mult:0}}]});
 const teams=mapRequestToTeams(request),state=createGameState(board(),teams.playerTeam,teams.enemyTeam,side);
 for(const id of o.dead??[]){const c=Object.values(state.teams).flatMap(t=>t.characters).find(c=>c.id===teams.idMap.internalIdOf(id))!;c.hp=0;c.defeated=true;}
 const rng=new SeededRNG(request.seed);let next=1000;
 const engine=new TurnEngine(state,rng,()=>next++,prepared.registry,prepared.configureEngine);engine.skullChance=0;
 const session=new BattleSession({request,engine,idMap:teams.idMap});
 return {row,bp,request,state,rng,engine,session,side,caster:state.teams[side].characters[0]!,foes:state.teams[other(side)].characters};
}
type Run=ReturnType<typeof battle>;
function go(r:Run,side=r.side){if(r.state.activePlayer!==side)r.session.passTurn();}
function cast(r:Run){go(r);r.caster.mana=r.caster.manaCost;return r.session.resolve({type:'cast',characterId:r.caster.id});}
const hits=(ev:GameEvent[])=>ev.filter(e=>e.type==='skill-damage');
const frame=(r:Run)=>structuredClone({state:r.state,rng:r.rng.getState(),events:r.session.recordedEvents()});

for(const row of frozen.enemies)describe(`ST random target ${row.enemyId} ${row.referenceName}: complete source`,()=>{
 it('anchors complete native text, spell, three traits, growth and portrait bytes independently',()=>{
  const src=raw.find((t:{id:number})=>t.id===row.enemyId),sp=spells.find((s:{Id:number})=>s.Id===row.sourceTroop.spell.id);
  expect(JSON.parse(src.data??src.RawData)).toEqual(row.nativeTroop);
  expect(row.sourceTroop.rarity).toBe(row.nativeTroop.TroopRarity);
  expect(row.sourceTroop.manaCost).toBe(row.nativeSpell.Cost);
  expect(JSON.parse(readFileSync('src/data/troops.json','utf8')).find((t:{id:number})=>t.id===row.enemyId)).toEqual(row.sourceTroop);
  const liveTraits=JSON.parse(readFileSync('src/data/traits.json','utf8'));
  expect(row.sourceTraits.map(t=>liveTraits.find((r:{code:string})=>r.code===t.code))).toEqual(row.sourceTraits);
  expect(PORTRAITS.find(p=>p.troopId===row.enemyId)).toEqual(row.portrait);
  expect(src.stats.spell.desc).toBe(row.englishClause);expect(src.stats.traits).toEqual(row.englishTraits);
  expect(JSON.parse(sp.data??sp.RawData)).toEqual(row.nativeSpell);
  expect(row.sourceTraits.map(t=>traits.find((r:{Code:string})=>r.Code===t.code))).toEqual(row.nativeTraits);
  expect(JSON.parse(readFileSync('src/data/troop-progression.json','utf8'))[row.enemyId]).toEqual(row.progression);
  const sha=createHash('sha256').update(readFileSync(`game-assets/public/static/portraits/${row.portrait.assetId}.webp`)).digest('hex');
  expect(sha).toBe(row.portrait.contentHash);
  expect(row.englishClause).toBe(`Deal [Magic + ${row.baseDamage}] damage to a random Enemy.`);
  expect(row.nativeSpell.SpellSteps).toEqual([{Amount:row.baseDamage,Primarypower:true,SpellPowerMultiplier:1,Target:'RandomEnemy',Type:'Damage'}]);
 });
 it('binds source identity, rarity, role, aliases, full descriptions and every ordinary trait',()=>{
  const r=battle(row),s=row.sourceTroop;
  expect(r.bp.portrait).toMatchObject({troopId:row.enemyId,assetId:row.portrait.assetId,contentHash:row.portrait.contentHash,query:{manaColors:row.portrait.manaColors,rank:row.portrait.rank,form:row.portrait.form,role:row.portrait.role}});
  expect(r.bp.snapshot).toMatchObject({mechanicalIdentity:`unit:${row.enemyId}`,skillId:`st:${s.spell.id}`,rarityIdx:s.rarityIdx,role:row.portrait.role,manaColors:s.manaColors,manaCost:s.manaCost,traitIds:s.traits.map(t=>`st:${t.code}`),troopTypes:row.context.affinities,kingdom:row.context.region,kingdomId:row.context.regionId});
  expect(r.bp.context).toEqual(row.context);expect(r.bp.descriptionAudit).toEqual({support:'full',diagnostics:[]});
  if(row.enemyId===7159)expect(adaptedTraitDescription('stealthy')?.description).toContain('没有其他可选目标时仍可被选择');
  expect(r.bp.traitDescriptionAudit).toEqual(s.traits.map(t=>({code:`st:${t.code}`,support:'full',diagnostics:[]})));
  expect(r.bp.omittedMechanisms).toEqual([]);expect(r.bp.snapshot.spellDescription).toContain('随机');
  expect(r.caster).toMatchObject({troopTypes:row.context.affinities,kingdom:row.context.region,kingdomId:row.context.regionId,colors:s.manaColors,manaCost:s.manaCost});
 });
 for(const side of sides){
  for(const [level,difficulty]of [[1,1],[20,1],[20,1.5]]as const)it(`executes independent scaled normal damage and own-cast traits at ${level}@${difficulty} on ${side}`,()=>{
   const r=battle(row,{side,level,difficulty}),stats=(row.stats as Record<string,CombatantSnapshot['stats']>)[`${level}@${difficulty}`]!;
   expect(r.bp.snapshot.stats).toEqual(stats);
   const before=structuredClone(r.caster),ev=cast(r),h=hits(ev);
   expect(h).toHaveLength(1);expect(r.foes.map(c=>c.id)).toContain(h[0]!.targetId);
   const damage=stats.magic+row.baseDamage+(row.enemyId===7335?1:0);
   expect(h[0]).toMatchObject({damage,range:'single'});
   const target=r.foes.find(t=>t.id===h[0]!.targetId)!;
   expect(target).toMatchObject({hp:1000-Math.max(0,damage-7),armor:Math.max(0,7-damage)});
   expect(r.caster.mana).toBe(0);
   expect(r.caster.hp).toBe(before.hp+(row.enemyId===7159?1:0));
   expect(r.caster.maxHp).toBe(before.maxHp+(row.enemyId===7159?1:0));
   expect(ev.filter(e=>e.type==='skill-cast')).toHaveLength(1);
  });
  it(`applies each opening affinity and color trait only to living allies on ${side}`,()=>{
   const human='affinity:17';
   const r=battle(row,{side,allies:[dummy('matching',{troopTypes:[human],manaColors:[BaseColor.Green,BaseColor.Purple]}),dummy('plain',{troopTypes:['affinity:6'],manaColors:[BaseColor.Blue]}),dummy('dead',{troopTypes:[human],manaColors:[BaseColor.Green,BaseColor.Purple]})],dead:['dead']});
   const [self,matching,plain,dead]=r.state.teams[side].characters,base=row.stats['20@1'];
   expect(self).toMatchObject({hp:base.hp+2,maxHp:base.hp+2,magic:base.magic+(row.enemyId===7335?2:0),mana:0});
   expect(matching).toMatchObject({hp:row.enemyId===7335?1002:1000,magic:0});expect(plain).toMatchObject({hp:1000,magic:0});expect(dead).toMatchObject({hp:0,defeated:true});
   expect(r.foes.every(t=>t.hp===1000&&t.magic===0)).toBe(true);
  });
  for(const color of colors)it(`routes real ${color} matches through native colors and cost on ${side}`,()=>{
   const r=battle(row,{side});r.caster.mana=0;r.state.board=board(color);
   const ev=r.session.resolve({type:'swap',from:{row:0,col:1},to:{row:1,col:1}});
   expect(ev.some(e=>e.type==='elimination')).toBe(true);
   const gain=ev.filter(e=>e.type==='mana-gain'&&e.characterId===r.caster.id).reduce((n,e)=>n+(e.type==='mana-gain'?e.amount:0),0);
   expect(r.caster.mana).toBe(gain);expect(gain>0).toBe(row.sourceTroop.manaColors.includes(color));
   expect(r.caster.mana).toBeLessThanOrEqual(row.sourceTroop.manaCost);
  });
  it(`naturally fills the source cost, spends once and rejects empty recast on ${side}`,()=>{
   const r=battle(row,{side});r.caster.mana=0;
   const color=row.sourceTroop.manaColors[0] as BaseColor;
   for(let i=0;i<row.sourceTroop.manaCost&&r.caster.mana<r.caster.manaCost;i++){go(r);r.state.board=board(color);r.session.resolve({type:'swap',from:{row:0,col:1},to:{row:1,col:1}});}
   expect(r.caster.mana).toBe(row.sourceTroop.manaCost);go(r);
   expect(hits(r.session.resolve({type:'cast',characterId:r.caster.id}))).toHaveLength(1);expect(r.caster.mana).toBe(0);
   go(r);const before=frame(r);expect(r.session.resolve({type:'cast',characterId:r.caster.id})).toEqual([]);expect(frame(r)).toEqual(before);
  });
  it(`rejects low mana, dead caster and wrong side without any mutation on ${side}`,()=>{
   for(const mode of ['mana','dead','side','silence','unknown']){
    const r=battle(row,{side});r.caster.mana=mode==='mana'?row.sourceTroop.manaCost-1:row.sourceTroop.manaCost;
    if(mode==='dead'){r.caster.hp=0;r.caster.defeated=true;}if(mode==='side')r.session.passTurn();if(mode==='silence')r.caster.statuses.push({id:'silence',turns:3});
    const before=frame(r);expect(r.session.resolve({type:'cast',characterId:mode==='unknown'?999:r.caster.id})).toEqual([]);expect(frame(r)).toEqual(before);
   }
  });
  it(`selects only living opponents and needs no character chooser on ${side}`,()=>{
   const r=battle(row,{side,dead:['first','middle']});r.engine.setTargetChooser({choose:()=>{throw Error('random-target spell requested a chosen target');}});
   const h=hits(cast(r));expect(h).toHaveLength(1);expect(h[0]!.targetId).toBe(r.foes[2]!.id);
   expect(r.foes.slice(0,2).every(t=>t.defeated&&t.hp===0)).toBe(true);
  });
  it(`covers all random targets, preserves one damage pool and restores deterministic JSON on ${side}`,()=>{
   const targets=new Set<number>();
   for(let seed=1;seed<=32;seed++){
    const original=battle(row,{side,seed}),restored=battle(row,{side,seed,restore:true}),a=cast(original),b=cast(restored);
    expect(b).toEqual(a);expect(frame(restored)).toEqual(frame(original));
    const h=hits(a);expect(h).toHaveLength(1);targets.add(h[0]!.targetId);
   }
   expect(targets.size).toBe(3);
  });
 }
 it('rejects altered source mana, context, traits, scaling and skill during JSON reopen',()=>{
  for(const field of ['manaCost','kingdom','traitIds','skillId','battleScaling']){
   const b=JSON.parse(JSON.stringify(blueprint(row)));
   b.snapshot[field]=({manaCost:99,kingdom:'region:999',traitIds:[],skillId:'gw_KnightsSword',battleScaling:{level:99,difficulty:1}} as Record<string,unknown>)[field];
   expect(()=>restoreEnemyBlueprint(b)).toThrow();
  }
 });
 if(row.enemyId===7159){
  for(const side of sides)it(`keeps native Invigorated allied/self cast timing and suppression on ${side}`,()=>{
   const r=battle(row,{side,allies:[dummy('friend')]});const start=r.caster.hp;
   cast(r);expect(r.caster.hp).toBe(start+1);
   go(r);const friend=r.state.teams[side].characters[1]!;friend.mana=12;r.engine.setTargetChooser(new FixedTargetChooser(r.foes[0]!.id));
   r.session.resolve({type:'cast',characterId:friend.id});expect(r.caster.hp).toBe(start+2);
   go(r,other(side));r.foes[0]!.mana=12;r.engine.setTargetChooser(new FixedTargetChooser(friend.id));r.session.resolve({type:'cast',characterId:r.foes[0]!.id});expect(r.caster.hp).toBe(start+2);
   go(r);r.caster.statuses.push({id:'stun',turns:3});cast(r);expect(r.caster.hp).toBe(start+2);
  });
  for(const side of sides)for(const companion of [true,false])it(`keeps Stealthy chosen-target exclusion and last-target fallback on ${side}, companion=${companion}`,()=>{
   const r=battle(row,{side,allies:companion?[dummy('friend')]:[]});go(r,other(side));const enemy=r.foes[0]!;enemy.mana=12;r.engine.setTargetChooser(new FixedTargetChooser(r.caster.id));
   const before=frame(r),ev=r.session.resolve({type:'cast',characterId:enemy.id});
   if(companion){expect(ev).toEqual([]);expect(frame(r)).toEqual(before);}else expect(hits(ev).map(e=>e.targetId)).toEqual([r.caster.id]);
  });
 }else{
  for(const side of sides)it(`starts native Red storm for eight turns without changing the other team on ${side}`,()=>{
   const r=battle(row,{side});expect(r.state.teams[side].storm).toMatchObject({color:BaseColor.Red,turns:8});expect(r.state.teams[other(side)].storm).toBeUndefined();
   const reopened=battle(row,{side,restore:true});expect(frame(reopened)).toEqual(frame(r));
   for(let i=0;i<4;i++){r.session.passTurn();reopened.session.passTurn();expect(frame(reopened)).toEqual(frame(r));}
  });
 }
});
