import {describe,it,expect} from 'vitest';
import {stEnvironmentScaling} from '../../src/sillytavern/environmentScaling';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {adaptedSummonPool,resolveAdaptedSummon} from '../../src/sillytavern/enemyBlueprint';
import {BaseColor,PlayerSide,specialGem} from '../../src/engine/types';
import type {GameEvent} from '../../src/engine/events';
import {BoardGenerator} from '../../src/engine/boardGen';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {SeededRNG} from '../../src/engine/rng';
import {createGameState} from '../../src/engine/GameState';
import {mapRequestToTeams} from '../../src/session/combatantMapping';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest,CombatantSnapshot} from '../../src/session/contract';
const actor=(externalId:string,level:number,difficulty=1):CombatantSnapshot=>({externalId,name:externalId,battleScaling:{level,difficulty},stats:{hp:9999,attack:0,armor:0,magic:0},manaColors:[BaseColor.Blue],manaCost:3,skillId:'gw_KnightsSword'});
function fixture(reverse=false){
 const playerTeam=[actor('low',1),actor('high',95,2)];if(reverse)playerTeam.reverse();
 const input:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'environment',requestId:'environment-request',seed:43,playerTeam,enemyTeam:[actor('enemy',40,1.2)]};
 const setup=prepareStBattle(input);const teams=mapRequestToTeams(input);const rng=new SeededRNG(input.seed);let gid=1000;const id=()=>gid++;
 const state=createGameState(new BoardGenerator(rng,id).generate(),teams.playerTeam,teams.enemyTeam);
 const engine=new TurnEngine(state,rng,id,setup.registry,setup.configureEngine);
 const ref=adaptedSummonPool('Daemon')[0]!;engine.setDaemonPool([ref]);
 const trigger=(side=PlayerSide.Left)=>{
   state.activePlayer=side;
   const existing=new Set(state.teams[side].characters.map(c=>c.id));
   const pos={row:3,col:3};state.board.set(pos,null);const events:GameEvent[]=[];
   engine.resolveBoardChange([{gemType:specialGem('daemonicPortalGem'),pos}],events);
   expect(events.some(e=>e.type==='summon'&&e.player===side)).toBe(true);
   return state.teams[side].characters.find(c=>!existing.has(c.id))!;
 };
 return {input,state,engine,ref,trigger};
}
describe('ST frozen environment summon scaling',()=>{
 it('derives a stable rounded average from initial parties and legacy defaults',()=>{
   const units=[actor('a',1,1.1),actor('b',94,1.8),actor('c',20)];delete units[2]!.battleScaling;
   const request={playerTeam:units,enemyTeam:[]};
   const before=JSON.stringify(request);const scaling=stEnvironmentScaling(request);
   expect(scaling.player.level).toBe(39);expect(scaling.player.difficulty).toBeCloseTo(1.3);
   expect(scaling.enemy).toEqual({level:20,difficulty:1});
   expect(stEnvironmentScaling({...request,playerTeam:[...units].reverse()})).toEqual(scaling);
   expect(stEnvironmentScaling(JSON.parse(JSON.stringify(request)))).toEqual(scaling);
   expect(JSON.stringify(request)).toBe(before);
 });
 it('uses the same actual portal template when initial positions are swapped',()=>{
   const first=fixture();const second=fixture(true);const a=first.trigger();const b=second.trigger();
   const expected=resolveAdaptedSummon(first.ref,{level:48,difficulty:1.5})!;
   for(const child of [a,b]){
     expect(child.battleScaling).toEqual({level:48,difficulty:1.5});
     expect({hp:child.maxHp,attack:child.attack,armor:child.armor,magic:child.magic}).toEqual({hp:expected.maxHp,attack:expected.attack,armor:expected.armor,magic:expected.magic});
   }
 });
 it('does not change the baseline after initial front death, new forms or request mutation',()=>{
   const f=fixture();const original=f.state.teams.Left.characters[0]!;original.hp=0;original.defeated=true;
   // Simulate a later copied form and an external edit after preparation: neither is the initial roster.
   f.state.teams.Left.characters[1]!.battleScaling={level:99,difficulty:3};
   f.input.playerTeam[0]!.battleScaling={level:99,difficulty:3};
   const child=f.trigger();expect(child.battleScaling).toEqual({level:48,difficulty:1.5});
 });
 it('uses the explicit destruction side when it differs from the active turn',()=>{
   const f=fixture();f.state.activePlayer=PlayerSide.Left;
   const before=f.state.teams.Right.characters.length;
   const pos={row:3,col:3};f.state.board.set(pos,null);const events:GameEvent[]=[];
   f.engine.resolveBoardChange([{gemType:specialGem('daemonicPortalGem'),pos}],events,PlayerSide.Right);
   const summons=events.filter(e=>e.type==='summon');
   expect(summons.length).toBeGreaterThan(0);expect(summons.every(e=>e.player===PlayerSide.Right)).toBe(true);
   expect(f.state.teams.Right.characters.slice(before).every(c=>c.battleScaling?.level===40&&c.battleScaling?.difficulty===1.2)).toBe(true);
 });
 it('uses the independent initial enemy baseline when the enemy destroys a portal',()=>{
   const f=fixture();expect(f.trigger(PlayerSide.Right).battleScaling).toEqual({level:40,difficulty:1.2});
 });
});
