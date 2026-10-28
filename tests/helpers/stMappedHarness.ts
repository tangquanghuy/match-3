import {MAPPED_SOURCES} from '../fixtures/stEnemyMappedSources';
import {TROOPS} from '../../src/data/troops';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {SeededRNG} from '../../src/engine/rng';
import {BaseColor,PlayerSide,colorGem} from '../../src/engine/types';
import type {GemType,Character} from '../../src/engine/types';
import type {SkillPrototype} from '../../src/engine/skills/prototypes';
import {FixedTargetChooser} from '../../src/engine/skills/targetChooser';
import {FixedCellChooser} from '../../src/engine/skills/cellChooser';
import {FixedColorChooser} from '../../src/engine/skills/colorChooser';
import {BattleSession} from '../../src/session/BattleSession';
import {mapRequestToTeams} from '../../src/session/combatantMapping';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest,CombatantSnapshot} from '../../src/session/contract';
import {compileEnemyBlueprint,restoreEnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {PORTRAITS,savePortrait} from '../../src/sillytavern/portraits';

export type MappedRow=typeof MAPPED_SOURCES[number];
export const colors=[BaseColor.Blue,BaseColor.Green,BaseColor.Red,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
export const otherSide=(side:PlayerSide)=>side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
const affinities=[...new Set(TROOPS.flatMap(t=>t.troopTypes))].sort();
export const alias=(name:string)=>`affinity:${affinities.indexOf(name)+1}`;
export function mappedSource(id:number):MappedRow {const row=MAPPED_SOURCES.find(r=>r.enemyId===id);if(!row)throw new Error(`Missing mapped source ${id}`);return row;}
export function dummy(externalId:string,overrides:Partial<CombatantSnapshot>={}):CombatantSnapshot {
 return {externalId,name:externalId,stats:{hp:1000,armor:40,attack:12,magic:0},manaColors:[BaseColor.Purple],manaCost:12,skillId:'gw_KnightsSword',...overrides};
}
export function blueprint(row:MappedRow,level=20,difficulty=1){
 const p=PORTRAITS.find(p=>p.troopId===row.enemyId)!;
 return compileEnemyBlueprint({portrait:savePortrait({manaColors:p.manaColors,rank:p.rank,form:p.form,role:p.role},p),externalId:'subject',level,difficulty});
}
export function legalBoard(match:GemType=colorGem(BaseColor.Red)){
 const board=new BoardModel();
 for(let row=0;row<8;row++)for(let col=0;col<8;col++)board.set({row,col},{id:row*8+col,type:colorGem(colors[(row*3+col*5)%6]!)});
 const different=match.kind==='color'&&match.color===BaseColor.Blue?BaseColor.Green:BaseColor.Blue;
 for(const [row,col,type]of [[0,0,match],[0,1,colorGem(different)],[0,2,match],[1,1,match]]as const)board.set({row,col},{id:row*8+col,type});
 board.set({row:0,col:3},{id:3,type:colorGem(different)});return board;
}
export type Options={side?:PlayerSide;startSide?:PlayerSide;level?:number;difficulty?:number;seed?:number;restore?:boolean;allies?:CombatantSnapshot[];opponents?:CombatantSnapshot[];dead?:string[];match?:GemType;probe?:SkillPrototype};
export function battle(row:MappedRow,options:Options={}){
 const side=options.side??PlayerSide.Right,level=options.level??20,difficulty=options.difficulty??1;
 const compiled=blueprint(row,level,difficulty),bp=options.restore?restoreEnemyBlueprint(JSON.parse(JSON.stringify(compiled))):compiled;
 const source=row.sourceTroop;
 const matching=dummy('matching',{troopTypes:[alias(source.troopTypes[0]!)],manaColors:[source.manaColors[0]! as BaseColor]});
 const own=[bp.snapshot,...options.allies??[matching,dummy('plain',{troopTypes:[alias('Daemon')],manaColors:[colors.find(c=>!source.manaColors.includes(c as never))!]} )]];
 const opposing=options.opponents??[dummy('front'),dummy('chosen'),dummy('back')];
 const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:`mapped-${row.enemyId}`,requestId:`mapped-${row.enemyId}`,seed:options.seed??37,playerTeam:side===PlayerSide.Left?own:opposing,enemyTeam:side===PlayerSide.Right?own:opposing};
 const setup=prepareStBattle(request);
 if(options.probe)setup.registry.prototypes.set('gw_KnightsSword',options.probe);
 const teams=mapRequestToTeams(request),state=createGameState(legalBoard(options.match),teams.playerTeam,teams.enemyTeam,options.startSide??side);
 for(const name of options.dead??[]){const id=teams.idMap.internalIdOf(name),c=Object.values(state.teams).flatMap(t=>t.characters).find(c=>c.id===id)!;c.hp=0;c.defeated=true;}
 const rng=new SeededRNG(request.seed);let next=1000;
 const engine=new TurnEngine(state,rng,()=>next++,setup.registry,setup.configureEngine);engine.skullChance=0;
 const session=new BattleSession({request,engine,idMap:teams.idMap});
 const byName=(name:string)=>Object.values(state.teams).flatMap(t=>t.characters).find(c=>c.id===teams.idMap.internalIdOf(name))!;
 const caster=byName('subject'),foes=state.teams[otherSide(side)].characters;
 engine.setTargetChooser(new FixedTargetChooser(byName('chosen')?.id??foes[0]!.id));
 engine.setCellChooser(new FixedCellChooser({row:3,col:3}));engine.setColorChooser(new FixedColorChooser(BaseColor.Blue));
 return {row,side,level,difficulty,bp,request,setup,registry:setup.registry,state,rng,engine,session,caster,foes,byName,inputs:structuredClone({own,opposing})};
}
export type Run=ReturnType<typeof battle>;
export const stats=(c:Character)=>({hp:c.hp,maxHp:c.maxHp,armor:c.armor,attack:c.attack,magic:c.magic,mana:c.mana});
export const grid=(run:Run)=>Array.from({length:64},(_,i)=>run.state.board.get({row:Math.floor(i/8),col:i%8}));
export const frame=(run:Run)=>structuredClone({state:run.state,rng:run.rng.getState(),events:run.session.recordedEvents()});
export function go(run:Run,side=run.side){if(run.state.activePlayer!==side)run.session.passTurn();}
export function cast(run:Run,target=run.byName('chosen'),caster=run.caster){
 const side=Object.values(PlayerSide).find(side=>run.state.teams[side].characters.includes(caster))!;
 go(run,side);caster.mana=caster.manaCost;
 run.engine.setTargetChooser(new FixedTargetChooser(target?.id??run.foes[0]!.id));
 return run.session.resolve({type:'cast',characterId:caster.id});
}
export function swap(run:Run){return run.session.resolve({type:'swap',from:{row:0,col:1},to:{row:1,col:1}});}
// This oracle reads only frozen source declarations and independent request inputs.
export function openingExpected(run:Run){
 const inputs=run.inputs.own.map(c=>c.externalId==='subject'?{...c,stats:(run.row.stats as Record<string,CombatantSnapshot['stats']>)[`${run.level}@${run.difficulty}`]!}:c);
 const dead=(i:number)=>run.inputs.own[i]!.externalId!=='subject'&&run.byName(run.inputs.own[i]!.externalId)?.defeated;
 const expected=inputs.map((c,i)=>({hp:dead(i)?0:c.stats.hp,maxHp:c.stats.hp,armor:c.stats.armor,attack:c.stats.attack,magic:c.stats.magic,mana:0}));
 const add=(i:number,stat:string,n:number)=>{if(dead(i))return;const e=expected[i]!;e[stat as keyof typeof e]+=n;if(stat==='hp')e.maxHp+=n;};
 for(const tr of run.row.sourceTraits as readonly Record<string,unknown>[]){
  const aura=tr.typeAura as {troopType:string;stat:string;amount:number}|undefined;
  if(aura)inputs.forEach((c,i)=>{if(c.troopTypes?.includes(alias(aura.troopType)))add(i,aura.stat,aura.amount);});
  const per=tr.perAllyColor as {color:string;stat:string;amount:number}|undefined;
  if(per)add(0,per.stat,inputs.filter((c,i)=>!dead(i)&&c.manaColors.includes(per.color as BaseColor)).length*per.amount);
  if(typeof tr.battleStartManaRatio==='number')expected[0]!.mana=Math.floor(run.row.sourceTroop.manaCost*tr.battleStartManaRatio);
 }
 return expected;
}
