import {describe,expect,it} from 'vitest';
// @ts-expect-error Acceptance tests read real portrait bytes; the app has no Node typings.
import {readFileSync} from 'node:fs';
// @ts-expect-error Acceptance-only content hashing.
import {createHash} from 'node:crypto';
import {TROOPS} from '../../src/data/troops';
import {troopStatsAtLevel} from '../../src/data/leveling';
import {getTrait} from '../../src/engine/traits';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {SeededRNG} from '../../src/engine/rng';
import {BaseColor,PlayerSide,colorGem} from '../../src/engine/types';
import {BattleSession} from '../../src/session/BattleSession';
import {mapRequestToTeams} from '../../src/session/combatantMapping';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest,CombatantSnapshot} from '../../src/session/contract';
import {compileEnemyBlueprint,restoreEnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {PORTRAITS,savePortrait} from '../../src/sillytavern/portraits';

// This suite proves assembly contracts for every source with an available portrait.
// Missing portraits stay in the product denominator; this suite grants no whole-enemy acceptance.
// Native source clauses,
// actual cast semantics, family boundaries and descriptions need their own exact
// evidence references; passing this suite alone never accepts a whole enemy.
const types=[...new Set(TROOPS.flatMap(t=>t.troopTypes))].sort();
const regions=[...new Set(TROOPS.map(t=>t.kingdom).filter((v):v is string=>!!v))].sort();
const regionIds=[...new Set(TROOPS.map(t=>t.kingdomId).filter((v):v is number=>v!=null))].sort((a,b)=>a-b);
const scoped=new Set(['onDelveGain','onDelveBounty','onDelveMiles','vsAscendedMultiplier']);
function blueprint(enemyId:number,level=20,difficulty=1) {
 const portrait=PORTRAITS.find(p=>p.troopId===enemyId);
 if(!portrait)throw new Error(`Missing portrait ${enemyId}`);
 return compileEnemyBlueprint({portrait:savePortrait({manaColors:portrait.manaColors,rank:portrait.rank,form:portrait.form,role:portrait.role},portrait),externalId:'source',level,difficulty});
}
function legalBoard(){
 const board=new BoardModel(),colors=[BaseColor.Blue,BaseColor.Green,BaseColor.Red,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
 for(let row=0;row<8;row++)for(let col=0;col<8;col++)board.set({row,col},{id:row*8+col,type:colorGem(colors[(row*3+col*5)%6]!)});
 for(const [row,col,color]of [[0,0,BaseColor.Red],[0,1,BaseColor.Blue],[0,2,BaseColor.Red],[1,1,BaseColor.Red]]as const)board.set({row,col},{id:row*8+col,type:colorGem(color)});
 return board;
}
function battle(enemyId:number,side:PlayerSide,restore=false){
 const original=blueprint(enemyId,7,1.3),bp=restore?restoreEnemyBlueprint(JSON.parse(JSON.stringify(original))):original;
 const control:CombatantSnapshot={externalId:'control',name:'control',stats:{hp:1000,armor:30,attack:0,magic:0},manaColors:[BaseColor.Blue],manaCost:12,skillId:'gw_KnightsSword'};
 const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:`assembly-${enemyId}`,requestId:`assembly-${enemyId}`,seed:37,
 playerTeam:side===PlayerSide.Left?[bp.snapshot]:[control],enemyTeam:side===PlayerSide.Right?[bp.snapshot]:[control]};
 const prepared=prepareStBattle(request),teams=mapRequestToTeams(request),state=createGameState(legalBoard(),teams.playerTeam,teams.enemyTeam),rng=new SeededRNG(request.seed);
 let next=1000;
 const engine=new TurnEngine(state,rng,()=>next++,prepared.registry,prepared.configureEngine),session=new BattleSession({request,engine,idMap:teams.idMap});
 return {request,state,rng,engine,session,caster:state.teams[side].characters[0]!};
}

const portraitSources=new Set(PORTRAITS.map(p=>p.troopId));
for(const source of TROOPS.filter(t=>portraitSources.has(t.id))){
 describe(`ST assembly contract ${source.id} ${source.referenceName}`,()=>{
  it('binds the actual portrait bytes, original rarity, mana and every ordinary trait',()=>{
   const bp=blueprint(source.id),p=PORTRAITS.find(p=>p.troopId===source.id)!;
   const sha=createHash('sha256').update(readFileSync(`game-assets/public/static/portraits/${p.assetId}.webp`)).digest('hex');
   expect(sha).toBe(p.contentHash);
   expect(bp.snapshot.portraitUrl).toContain(`/static/portraits/${p.assetId}.webp`);
   expect(bp.snapshot.rarityIdx).toBe(source.rarityIdx);expect(bp.snapshot.role).toBe(p.role);
   expect(bp.snapshot.manaColors).toEqual(source.manaColors);expect(bp.snapshot.manaCost).toBe(source.manaCost);
   expect(bp.snapshot.skillId).toBe(`st:${source.spell.id}`);
   const ordinary=source.traits.filter(tr=>{
    const native=getTrait(tr.code);expect(native).toBeDefined();
    return Object.keys(native!).filter(k=>!['code','name','description','troops'].includes(k)).some(k=>!scoped.has(k));
   });
   expect(bp.snapshot.traitIds).toEqual(ordinary.map(tr=>`st:${tr.code}`));
   expect(bp.traitDescriptionAudit.map(tr=>tr.code)).toEqual(ordinary.map(tr=>`st:${tr.code}`));
  });
  for(const [level,difficulty]of [[1,1],[7,1.3],[49,1.6]]as const)it(`preserves source identity, affinities, regions and native panels at ${level}@${difficulty}`,()=>{
   const bp=blueprint(source.id,level,difficulty),native=troopStatsAtLevel(source,level);
   expect(bp.snapshot.stats).toEqual({hp:Math.max(1,Math.round(native.health*difficulty)),armor:Math.round(native.armor*difficulty),attack:Math.round(native.attack*difficulty),magic:Math.round(native.magic*difficulty)});
   expect(bp.snapshot.battleScaling).toEqual({level,difficulty});
   const sameName=TROOPS.filter(t=>t.name===source.name).sort((a,b)=>a.id-b.id)[0]!;
   expect(bp.snapshot.mechanicalIdentity).toBe(`unit:${sameName.id}`);
   expect(bp.snapshot.troopTypes).toEqual(source.troopTypes.map(type=>`affinity:${types.indexOf(type)+1}`));
   if(source.kingdom)expect(bp.snapshot.kingdom).toBe(`region:${regions.indexOf(source.kingdom)+1}`);
   if(source.kingdomId!=null)expect(bp.snapshot.kingdomId).toBe(100000+regionIds.indexOf(source.kingdomId));
   expect(bp.context.affinities).toEqual(bp.snapshot.troopTypes);
  });
  it('reopens the entire JSON configuration and rejects changed mana, identity and scaling',()=>{
   const bp=blueprint(source.id,7,1.3);
   expect(restoreEnemyBlueprint(JSON.parse(JSON.stringify(bp)))).toEqual(bp);
   for(const mutate of [
    (value:typeof bp)=>{value.snapshot.manaCost++;},
    (value:typeof bp)=>{value.snapshot.mechanicalIdentity='unit:invalid';},
    (value:typeof bp)=>{value.snapshot.battleScaling!.level++;},
    (value:typeof bp)=>{value.snapshot.traitIds=[];},
   ]){const altered=structuredClone(bp);mutate(altered);expect(()=>restoreEnemyBlueprint(altered)).toThrow();}
  });
  for(const side of [PlayerSide.Left,PlayerSide.Right]){
   it(`preserves the actual prepared context and rejects low mana atomically on ${side}`,()=>{
    const run=battle(source.id,side);
    if(side===PlayerSide.Right)run.session.passTurn();
    expect(run.caster.colors).toEqual(source.manaColors);expect(run.caster.manaCost).toBe(source.manaCost);
    expect(run.caster.battleScaling).toEqual({level:7,difficulty:1.3});
    run.caster.mana=0;
    const snapshot=()=>structuredClone({state:run.state,rng:run.rng.getState(),events:run.session.recordedEvents()});
    const before=snapshot();
    expect(run.session.resolve({type:'cast',characterId:run.caster.id})).toEqual([]);
    expect(snapshot()).toEqual(before);
   });
   it(`reproduces actual opening and turn hooks after JSON reopen on ${side}`,()=>{
    const original=battle(source.id,side),reopened=battle(source.id,side,true);
    const frame=(run:typeof original)=>structuredClone({state:run.state,rng:run.rng.getState(),events:run.session.recordedEvents()});
    expect(frame(reopened)).toEqual(frame(original));
    for(let i=0;i<2;i++){original.session.passTurn();reopened.session.passTurn();expect(frame(reopened)).toEqual(frame(original));}
   });
  }
 });
}
