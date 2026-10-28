import {describe,it,expect} from 'vitest';
import {TROOPS,getTroopById} from '../../src/data/troops';
import {compileEnemyDesign,restoreEnemyDesign,DEFAULT_ENEMY_DESIGN_INPUT} from '../../src/sillytavern/enemyDesign';
import {compileEnemyBlueprint,restoreEnemyBlueprint,adaptedPrototype,adaptedTrait,abilityIdentity} from '../../src/sillytavern/enemyBlueprint';
import {profileEnemyAssembly,enemyGenerationIssues,enemyTeamGenerationIssues} from '../../src/sillytavern/enemyAssemblyPolicy';
import {PORTRAITS,RANKS,ROLE_ORDER,colorKey,savePortrait} from '../../src/sillytavern/portraits';
import {BaseColor,PlayerSide,colorGem} from '../../src/engine/types';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {SeededRNG} from '../../src/engine/rng';
import {BattleSession} from '../../src/session/BattleSession';
import {mapRequestToTeams} from '../../src/session/combatantMapping';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest} from '../../src/session/contract';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import oldPolicy from '../fixtures/st-enemy-design-uncolored-policy-v1.json';
import coloredPolicy from '../fixtures/st-enemy-design-colored-portrait-v1.json';
import legacy from '../fixtures/st-enemy-design-legacy-v1.json';
const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
const options={seed:17,externalId:'enemy-1'};
const input=(extra:Record<string,unknown>)=>({...DEFAULT_ENEMY_DESIGN_INPUT,...extra});
const art=PORTRAITS.find(p=>p.troopId===6004)!;
const portrait=savePortrait({rank:art.rank,form:art.form,role:art.role},art);
const blueprint=(manaColors:string[])=>compileEnemyBlueprint({portrait,recipeTroopId:6004,assembly:{version:2,activeTroopId:6004,traitCodes:[],manaColors},externalId:'enemy-1'});
describe('classified assembly with independent casting colors',()=>{
 it.each([
  ['精锐','人形','Assassin',['Purple','Green']],
  ['传奇','人形','Warmaster',['Red','Yellow','Brown']],
  ['传奇','异形体','Warlock',['Blue','Purple','Brown']],
 ])('assembles the original missing %s / %s / %s combination without changing the request',(rank,form,role,manaColors)=>{
  const result=compileEnemyDesign(input({rank,form,role,manaColors}),options);
  expect(result.design).toMatchObject({rank,form,role,manaColors});
  expect(result.blueprint.snapshot.manaColors).toEqual(colorKey(manaColors).split(','));expect(result.blueprint.snapshot.role).toBe(role);
  expect(getTroopById(result.generation!.profile.sourceTroopId)?.role).toBe(role);
  const picture=PORTRAITS.find(p=>p.assetId===result.selection.portraitAssetId)!;
  expect(picture.rank).toBe(rank);expect(picture.form).toBe(form);
  expect(restoreEnemyDesign(clone(result))).toEqual(result);
 });
 it('covers all 45 rank and primary-role pools with runtime color counts and actual instance risk profiles',()=>{
  for(const rank of RANKS)for(const role of ROLE_ORDER){
   const manaColors=rank==='杂兵'?['Brown']:rank==='传奇'?['Red','Yellow','Brown']:['Purple','Green'];
   const result=compileEnemyDesign(input({rank,role,manaColors}),options),source=getTroopById(result.generation!.profile.sourceTroopId)!;
   expect(source.role,`${rank}/${role}`).toBe(role);expect(result.blueprint.snapshot.role).toBe(role);
   expect(result.blueprint.snapshot.manaColors).toEqual(colorKey(manaColors).split(','));expect(result.blueprint.snapshot.manaCost).toBe(source.manaCost);
   const traits=result.blueprint.assembly!.traitCodes.map(c=>adaptedTrait(c)!);
   expect(result.generation!.profile).toEqual(profileEnemyAssembly({...source,manaColors:colorKey(manaColors).split(',') as BaseColor[]},adaptedPrototype(source.spell.id),traits,result.signature.effects));
   expect(enemyGenerationIssues(result.generation!.profile,rank,'ordinary')).toEqual([]);
  }
 },60000);
 it('keeps fixed gem effects and costs while including casting colors in learning and recipe identity',()=>{
  const red=blueprint(['Red']),blue=blueprint(['Blue']);
  expect(red.snapshot.skillId).toBe(blue.snapshot.skillId);expect(red.snapshot.manaCost).toBe(6);expect(blue.snapshot.manaCost).toBe(6);
  expect(blue.snapshot.spellDescription).toBe(red.snapshot.spellDescription);expect(blue.snapshot.stats).toEqual(red.snapshot.stats);
  expect(blue.abilityId).not.toBe(red.abilityId);expect(blue.sourceId).not.toBe(red.sourceId);
  expect(blue.abilityId).toBe(abilityIdentity(adaptedPrototype(7004),['Blue'],6));
  expect(restoreEnemyBlueprint(clone(blue))).toEqual(blue);
  const changed=clone(blue);changed.assembly={...changed.assembly!,version:2,manaColors:['Green']};expect(()=>restoreEnemyBlueprint(changed)).toThrow();
 });
 it('canonicalizes instance palette order before identity, snapshot and risk profiling',()=>{
  const first=blueprint(['Red','Blue']),reversed=blueprint(['Blue','Red']);
  expect(reversed).toEqual(first);
  expect(reversed.assembly).toMatchObject({version:2,manaColors:['Red','Blue']});
  expect(restoreEnemyBlueprint(clone(reversed))).toEqual(first);
  const a=compileEnemyDesign(input({rank:'精锐',role:'Generator',manaColors:['Red','Blue']}),options);
  const b=compileEnemyDesign(input({rank:'精锐',role:'Generator',manaColors:['Blue','Red']}),options);
  expect(b.blueprint).toEqual(a.blueprint);expect(b.generation).toEqual(a.generation);
  expect(b.design.manaColors).toEqual(['Blue','Red']);expect(restoreEnemyDesign(clone(b))).toEqual(b);
 });
 it.each([null,false,0,'',[],['Blue','Blue'],{},['Violet']])('rejects invalid instance casting colors %j',manaColors=>{
  expect(()=>compileEnemyBlueprint({portrait,recipeTroopId:6004,assembly:{version:2,activeTroopId:6004,traitCodes:[],manaColors:manaColors as string[]},externalId:'enemy-1'})).toThrow();
 });
 it.each([oldPolicy,coloredPolicy,legacy])('restores a frozen previous selector save without migrating it',saved=>{
  expect(restoreEnemyDesign(clone(saved))).toEqual(saved);expect(restoreEnemyBlueprint(clone(saved.blueprint))).toEqual(saved.blueprint);
 });
 it('re-evaluates self-mana and lethal-loop admission for the actual casting colors',()=>{
  const source=TROOPS.find(t=>t.role==='Generator')!;
  const prototype={segments:[{kind:'gem' as const,params:{op:'create' as const,count:{base:5,mult:0},gem:{kind:'color' as const,color:BaseColor.Red}}},{kind:'devour' as const,target:'enemyChosen' as const,chance:1},{kind:'extraTurn' as const}]};
  const profile=(colors:BaseColor[])=>profileEnemyAssembly({...source,manaColors:colors},prototype,[],['gemCreate','devour','extraTurn']);
  const red=profile([BaseColor.Red]),blue=profile([BaseColor.Blue]);
  expect(red.selfMana).toBe(true);expect(blue.selfMana).toBe(false);expect(red.generatedColors).toEqual(['Red']);
  expect(enemyGenerationIssues(red,'传奇','special')).toContain('lethalManaLoop');expect(enemyGenerationIssues(blue,'传奇','special')).not.toContain('lethalManaLoop');
  expect(enemyTeamGenerationIssues([red])).toContain('teamLethalManaLoop');
 });
 it.each([BaseColor.Blue,BaseColor.Red])('uses rebound colors in the real match-to-mana path: %s',matchColor=>{
  const subject=blueprint(['Blue']);
  const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'bound-colors',requestId:'bound-colors-request',seed:6004,playerTeam:[subject.snapshot],enemyTeam:[{externalId:'hero',name:'hero',stats:{hp:1000,armor:20,attack:0,magic:0},manaColors:[BaseColor.Green],manaCost:12,skillId:'gw_KnightsSword'}]};
  const setup=prepareStBattle(request),teams=mapRequestToTeams(request),board=new BoardModel();
  const colors=[BaseColor.Blue,BaseColor.Green,BaseColor.Red,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
  for(let row=0;row<8;row++)for(let col=0;col<8;col++)board.set({row,col},{id:row*8+col,type:colorGem(colors[(row*3+col*5)%6]!)});
  const other=matchColor===BaseColor.Blue?BaseColor.Green:BaseColor.Blue;
  for(const [row,col,color]of [[0,0,matchColor],[0,1,other],[0,2,matchColor],[1,1,matchColor]] as const)board.set({row,col},{id:row*8+col,type:colorGem(color)});
  const state=createGameState(board,teams.playerTeam,teams.enemyTeam);let nextId=1000;
  const engine=new TurnEngine(state,new SeededRNG(6004),()=>nextId++,setup.registry,setup.configureEngine);
  const session=new BattleSession({request,engine,idMap:teams.idMap});
  const events=session.resolve({type:'swap',from:{row:0,col:1},to:{row:1,col:1}});
  const subjectMana=events.filter(e=>e.type==='mana-gain'&&e.characterId===state.teams[PlayerSide.Left].characters[0]!.id);
  if(matchColor===BaseColor.Blue){expect(subjectMana).toEqual(expect.arrayContaining([expect.objectContaining({color:BaseColor.Blue,amount:3})]));expect(state.teams.Left.characters[0]!.mana).toBeGreaterThanOrEqual(3);}
  else expect(subjectMana.some(e=>e.type==='mana-gain'&&e.color===BaseColor.Red)).toBe(false);
  expect(subject.snapshot.manaColors).toEqual(['Blue']);expect(colorKey(getTroopById(6004)!.manaColors)).toBe('Red');
 });
});
