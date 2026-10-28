import {describe,expect,it} from 'vitest';
import weapons from '../../src/data/weapons.json';
import {TROOPS} from '../../src/data/troops';
import {registerSkillLibrary} from '../../src/engine/skills/library';
import {registerStSkillLibrary,resolveAdaptedSummon} from '../../src/sillytavern/enemyBlueprint';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {mapRequestToTeams} from '../../src/session/combatantMapping';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest} from '../../src/session/contract';
import type {SkillPrototype} from '../../src/engine/skills/prototypes';
import {BaseColor,PlayerSide} from '../../src/engine/types';
import {SeededRNG} from '../../src/engine/rng';
import {BoardGenerator} from '../../src/engine/boardGen';
import {createGameState} from '../../src/engine/GameState';
import {TurnEngine} from '../../src/engine/TurnEngine';

const native=new Map<string,SkillPrototype>();registerSkillLibrary(native);
const adapted=new Map<string,SkillPrototype>();registerStSkillLibrary(adapted);
const rows=weapons.filter(w=>native.has(`gw_${w.referenceName}`));
function candidate(mode:'ref'|'random'){
 const candidates=rows.filter(w=>native.get(`gw_${w.referenceName}`)!.segments.some(s=>s.kind==='summon'&&!s.ifCond&&!s.ifTargetDied&&(s.chance===undefined||s.chance===1)&&(mode==='ref'?'ref' in s.params.source:'randomOf' in s.params.source)));
 const row=candidates.find(row=>{
   try{prepareStBattle(weaponRequest(row));return true;}
   catch(error){if(!String(error).includes('尚未适配的战斗经济效果'))throw error;return false;}
 });
 if(!row)throw new Error(`No open real weapon ${mode} summon`);return row;
}
function weaponRequest(row:typeof rows[number]):BattleRequest{
 const unit={name:'主角',externalId:'hero',stats:{hp:9999,attack:1,armor:999,magic:1},battleScaling:{level:49,difficulty:1.2},manaColors:row.manaColors as BaseColor[],manaCost:row.manaCost,skillId:`gw_${row.referenceName}`};
 const input:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'weapon-adaptation',requestId:'weapon-adaptation-request',seed:612,playerTeam:[unit],enemyTeam:[{...unit,name:'敌人',externalId:'enemy',skillId:'gw_KnightsSword'}]};
 return input;
}
function cast(row:typeof rows[number]){
 const input=weaponRequest(row);
 const setup=prepareStBattle(JSON.parse(JSON.stringify(input)));const rng=new SeededRNG(input.seed);let gid=1000;const teams=mapRequestToTeams(input);
 const state=createGameState(new BoardGenerator(rng,()=>gid++).generate(),teams.playerTeam,teams.enemyTeam);const engine=new TurnEngine(state,rng,()=>gid++,setup.registry,setup.configureEngine);
 const hero=state.teams.Left.characters[0]!;hero.mana=hero.manaCost;const events=engine.castSkill(hero.id);
 return {events,state,hero};
}
describe('ST real weapon reference adaptation',()=>{
 it('accepts the original random summon weapon with its complete economic candidate pool',()=>{
   const row=rows.find(w=>native.get(`gw_${w.referenceName}`)!.segments.some(s=>s.kind==='summon'&&!s.ifCond&&!s.ifTargetDied&&(s.chance===undefined||s.chance===1)&&'randomOf' in s.params.source))!;
   expect(row).toBeDefined();expect(()=>prepareStBattle(weaponRequest(row))).not.toThrow();
 });

 it.each(['ref','random'] as const)('casts a real %s summon weapon using abstract references and hero scaling',mode=>{
   const row=candidate(mode);const id=`gw_${row.referenceName}`;const prototype=adapted.get(id)!;
   const segment=prototype.segments.find(s=>s.kind==='summon'&&(mode==='ref'?'ref' in s.params.source:'randomOf' in s.params.source));
   if(segment?.kind!=='summon')throw new Error('Missing adapted summon');
   const source=segment.params.source;
   if('ref' in source)expect(source.ref).toMatch(/^unit:\d+$/);
   if('randomOf' in source){expect(source.randomOf.length).toBeGreaterThan(1);expect(source.randomOf.every(ref=>/^unit:\d+$/.test(ref))).toBe(true);}
   const {events,state,hero}=cast(row);expect(events.some(e=>e.type==='summon'&&e.player===PlayerSide.Left),id).toBe(true);
   const child=state.teams.Left.characters.find(c=>c.id!==hero.id)!;expect(child.battleScaling,id).toEqual(hero.battleScaling);expect(child.portraitUrl).toMatch(/static\/(portraits|hero)\/.+\.webp$/);
   const expected=resolveAdaptedSummon(child.mechanicalIdentity!,hero.battleScaling)!;expect(child.maxHp).toBe(expected.maxHp);
   console.info('ST_WEAPON_SUMMON',JSON.stringify({mode,id,spellId:row.spell.id,child:child.mechanicalIdentity}));
 });
 it('adapts conditional named-unit references without mutating native weapon prototypes',()=>{
   const row=rows.find(w=>JSON.stringify(native.get(`gw_${w.referenceName}`)).includes('troopPresent'))!;expect(row).toBeDefined();
   const id=`gw_${row.referenceName}`;const before=JSON.stringify(native.get(id));const again=new Map<string,SkillPrototype>();registerStSkillLibrary(again);
   const after=JSON.stringify(again.get(id));expect(after).toMatch(/"name":"unit:\d+"/);expect(after).not.toBe(before);
   const fresh=new Map<string,SkillPrototype>();registerSkillLibrary(fresh);expect(JSON.stringify(fresh.get(id))).toBe(before);
   expect(TROOPS.some(t=>after.includes(`unit:${t.id}`))).toBe(true);
 });
 it('keeps the default weapon prototype behavior and real damage event',()=>{
   expect(adapted.get('gw_KnightsSword')).toEqual(native.get('gw_KnightsSword'));
   const row=rows.find(w=>w.referenceName==='KnightsSword')!;const result=cast(row);expect(result.events.some(e=>e.type==='skill-damage')).toBe(true);
 });
});
