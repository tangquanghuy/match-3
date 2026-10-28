import {describe,expect,it} from 'vitest';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest} from '../../src/session/contract';
import {mapRequestToTeams} from '../../src/session/combatantMapping';
import {BoardGenerator} from '../../src/engine/boardGen';
import {createGameState} from '../../src/engine/GameState';
import {SeededRNG} from '../../src/engine/rng';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {registerDynamicTraits} from '../../src/engine/traits';
import {PVP_DYNAMIC_DEFS} from '../../src/meta/data/talentDefs';
import {ALL_BASE_COLORS,BaseColor,colorGem} from '../../src/engine/types';
import type {GameEvent} from '../../src/engine/events';

function play(st:boolean,length:number,options:{automatic?:boolean;mode?:'pvp';pvpTrait?:boolean}={}){
 if(options.pvpTrait)registerDynamicTraits(PVP_DYNAMIC_DEFS.filter(trait=>trait.code==='bloodandglory'));
 const unit={name:'单位',stats:{hp:9999,attack:0,armor:0,magic:0},manaColors:[BaseColor.Blue],manaCost:99,skillId:'gw_KnightsSword',traitIds:options.pvpTrait?['bloodandglory']:[]};
 const input:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'match-economy',requestId:'match-economy-request',seed:20261022,playerTeam:[{...unit,externalId:'hero'}],enemyTeam:[{...unit,externalId:'enemy'}],...(options.mode?{mode:options.mode}:{})};
 const runtime=prepareStBattle(input);const teams=mapRequestToTeams(input);const rng=new SeededRNG(input.seed);let gid=1000;const id=()=>gid++;
 const board=new BoardGenerator(rng,id).generate();const state=createGameState(board,teams.playerTeam,teams.enemyTeam);
 const engine=new TurnEngine(state,rng,id,runtime.registry,st?runtime.configureEngine:undefined);
 engine.pvpMode=input.mode==='pvp';
 if(options.automatic!==undefined)engine.setAutomaticMatchEconomyEnabled(options.automatic);
 engine.takeInitialEvents();
 for(let row=0;row<8;row++)for(let col=0;col<8;col++)board.set({row,col},{id:id(),type:colorGem(ALL_BASE_COLORS[(row*2+col)%6]!)});
 for(let col=0;col<length;col++)board.set({row:0,col},{id:id(),type:colorGem(BaseColor.Blue)});
 // Stop the requested row at exactly four/five gems.
 board.set({row:0,col:length},{id:id(),type:colorGem(BaseColor.Red)});
 const events:GameEvent[]=[];engine.resolveBoardChange([],events);
 return {state,events};
}
describe('ST native automatic match economy and mode isolation',()=>{
 it.each([4,5])('matches native %i-match economy while isolating engine switches and PvP-only payouts',length=>{
   const native=play(false,length);
   const nativeGold=native.events.find(e=>e.type==='economy-gain'&&e.currency==='gold');
   expect(nativeGold?.type).toBe('economy-gain');
   if(nativeGold?.type!=='economy-gain')throw new Error('Expected the native match reward');
   expect(nativeGold.amount).toBe(length);
   expect(native.state.economy.gold).toBeGreaterThanOrEqual(length);

   // An explicit per-engine opt-out still works, without changing combat.
   const disabled=play(true,length,{automatic:false});
   expect(disabled.state.economy).toEqual({gold:0,souls:0,gems:0,maps:0});
   expect(disabled.events.some(e=>e.type==='economy-gain')).toBe(false);
   expect(disabled.events).toEqual(native.events.filter(e=>e.type!=='economy-gain'));
   expect(disabled.state.teams).toEqual(native.state.teams);

   // Fresh ST and native engines retain their defaults after that opt-out.
   const st=play(true,length);const nativeAfter=play(false,length);
   for(const actual of [st,nativeAfter]){
     expect(actual.state.economy).toEqual(native.state.economy);
     expect(actual.state.enemyGold).toBe(native.state.enemyGold);
     expect(actual.events).toEqual(native.events);
     expect(actual.state.teams).toEqual(native.state.teams);
   }

   // PvP permits ordinary in-battle match Gold; its end-payout trait remains gated.
   const pvpNative=play(false,length,{mode:'pvp'});const pvpSt=play(true,length,{mode:'pvp'});
   expect(pvpSt.state.economy).toEqual(native.state.economy);
   expect(pvpSt.state.economy).toEqual(pvpNative.state.economy);
   expect(pvpSt.events).toEqual(pvpNative.events);
   const inactivePvpTrait=play(true,length,{pvpTrait:true});
   expect(inactivePvpTrait.state.economy).toEqual(st.state.economy);
   expect(inactivePvpTrait.events).toEqual(st.events);
   expect(()=>play(true,length,{mode:'pvp',pvpTrait:true})).toThrow('竞技对战战后货币结算');
 });
});

