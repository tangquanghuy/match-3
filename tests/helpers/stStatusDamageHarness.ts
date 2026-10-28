import expectations from '../fixtures/stEnemyStatusDamageExpectations.json';
import {legalBoard,otherSide} from './stMappedHarness';
import {createGameState} from '../../src/engine/GameState';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {SeededRNG} from '../../src/engine/rng';
import {BaseColor,PlayerSide,colorGem} from '../../src/engine/types';
import type {GemType,Character} from '../../src/engine/types';
import type {SkillPrototype} from '../../src/engine/skills/prototypes';
import {FixedTargetChooser} from '../../src/engine/skills/targetChooser';
import {BattleSession} from '../../src/session/BattleSession';
import {mapRequestToTeams} from '../../src/session/combatantMapping';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest,CombatantSnapshot} from '../../src/session/contract';
import {compileEnemyBlueprint,restoreEnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {PORTRAITS,savePortrait} from '../../src/sillytavern/portraits';

export const STATUS_SOURCES=expectations.enemies;
export type StatusSource=typeof STATUS_SOURCES[number];
export const sides=[PlayerSide.Left,PlayerSide.Right] as const;
export {otherSide,legalBoard};
export function dummy(externalId:string,overrides:Partial<CombatantSnapshot>={}):CombatantSnapshot {
 return {externalId,name:externalId,stats:{hp:1000,armor:7,attack:8,magic:0},manaColors:[BaseColor.Blue],manaCost:12,skillId:'gw_KnightsSword',...overrides};
}
export function blueprint(e:StatusSource,level=20,difficulty=1){
 const p=PORTRAITS.find(p=>p.troopId===e.id)!;
 return compileEnemyBlueprint({portrait:savePortrait({manaColors:e.sourceTroop.manaColors,rank:e.portrait.rank,form:e.portrait.form,role:e.portrait.role},p),externalId:'subject',level,difficulty});
}
export type Options={side?:PlayerSide;startSide?:PlayerSide;level?:number;difficulty?:number;seed?:number;restore?:boolean;allies?:CombatantSnapshot[];opponents?:CombatantSnapshot[];dead?:string[];match?:GemType;probe?:SkillPrototype};
export function battle(e:StatusSource,options:Options={}){
 const side=options.side??PlayerSide.Right;
 const compiled=blueprint(e,options.level,options.difficulty);
 const bp=options.restore?restoreEnemyBlueprint(JSON.parse(JSON.stringify(compiled))):compiled;
 const own=[bp.snapshot,...options.allies??[]];
 const foes=options.opponents??[dummy('front'),dummy('chosen'),dummy('back')];
 const builtRequest:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:`status-${e.id}`,requestId:`status-${e.id}-request`,seed:options.seed??37,playerTeam:side===PlayerSide.Left?own:foes,enemyTeam:side===PlayerSide.Right?own:foes};
 const request:BattleRequest=options.restore?JSON.parse(JSON.stringify(builtRequest)):builtRequest;
 const setup=prepareStBattle(request);
 // A local stimulus spell is assigned only to controls; the subject keeps its complete ST recipe.
 if(options.probe)setup.registry.prototypes.set('gw_KnightsSword',options.probe);
 const teams=mapRequestToTeams(request);
 const state=createGameState(legalBoard(options.match??colorGem(BaseColor.Red)),teams.playerTeam,teams.enemyTeam,options.startSide??side);
 const byName=(name:string):Character=>Object.values(state.teams).flatMap(t=>t.characters).find(c=>c.id===teams.idMap.internalIdOf(name))!;
 for(const name of options.dead??[]){const c=byName(name);c.hp=0;c.defeated=true;}
 const beforeOpening=structuredClone(state.teams),rng=new SeededRNG(request.seed);let nextGemId=1000;
 const engine=new TurnEngine(state,rng,()=>nextGemId++,setup.registry,setup.configureEngine);engine.skullChance=0;
 const session=new BattleSession({request,engine,idMap:teams.idMap});
 const caster=byName('subject'),opponents=state.teams[otherSide(side)].characters;
 engine.setTargetChooser(new FixedTargetChooser(byName('chosen')?.id??opponents[0]!.id));
 return {e,bp,side,request,setup,teams,state,rng,engine,session,caster,foes:opponents,byName,beforeOpening,nextGemId:()=>nextGemId};
}
export type Run=ReturnType<typeof battle>;
export const stats=(c:Character)=>({hp:c.hp,maxHp:c.maxHp,armor:c.armor,attack:c.attack,magic:c.magic,mana:c.mana});
export const grid=(r:Run)=>Array.from({length:64},(_,i)=>r.state.board.get({row:Math.floor(i/8),col:i%8}));
export const frame=(r:Run)=>structuredClone({state:r.state,rng:r.rng.getState(),nextGemId:r.nextGemId(),events:r.session.recordedEvents()});
export function go(r:Run,side=r.side){if(r.state.activePlayer!==side)r.session.passTurn();}
export function cast(r:Run,target=r.byName('chosen')??r.foes[0]!,caster=r.caster){
 const side=sides.find(side=>r.state.teams[side].characters.includes(caster))!;
 go(r,side);caster.mana=caster.manaCost;
 r.engine.setTargetChooser(new FixedTargetChooser(target.id));
 return r.session.resolve({type:'cast',characterId:caster.id});
}
export function swap(r:Run){return r.session.resolve({type:'swap',from:{row:0,col:1},to:{row:1,col:1}});}
export function charge(r:Run,color:BaseColor){
 go(r);r.state.board=legalBoard(colorGem(color));return swap(r);
}
