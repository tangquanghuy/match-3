import {describe,expect,it} from 'vitest';
import {TROOPS} from '../../src/data/troops';
import {SKILL_LIBRARY} from '../../src/engine/skills/library';
import {conditionMet,resolveModifierCount} from '../../src/engine/skills/effects/secondary';
import type {Condition,ModifierSource} from '../../src/engine/skills/effects/secondary';
import type {EffectContext} from '../../src/engine/skills/effects/context';
import {transformTroopEffect,summonEffect} from '../../src/engine/skills/effects/summon';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {SeededRNG} from '../../src/engine/rng';
import {BaseColor,PlayerSide} from '../../src/engine/types';
import type {Character} from '../../src/engine/types';
import {snapshotToCharacter} from '../../src/session/combatantMapping';
import {adaptedPrototype,adaptedTrait,compileEnemyBlueprint,resolveAdaptedSummon} from '../../src/sillytavern/enemyBlueprint';
import {getTrait} from '../../src/engine/traits';
import {PORTRAITS,savePortrait} from '../../src/sillytavern/portraits';

function unit(id:number,name='叙事角色'):Character{return {id,name,maxHp:100,hp:100,attack:10,armor:0,magic:5,colors:[BaseColor.Blue],manaCost:10,mana:0,skillId:'fixture',statuses:[],defeated:false};}
function context(allies:Character[],enemies:Character[]=[]):EffectContext{return {state:createGameState(new BoardModel(),{player:PlayerSide.Left,characters:allies},{player:PlayerSide.Right,characters:enemies}),casterId:allies[0]!.id,rng:new SeededRNG(20261022),nextGemId:()=>1};}
function nodes(value:unknown):Record<string,unknown>[] {if(!value||typeof value!=='object')return [];const o=value as Record<string,unknown>;return [...(o.kind==='troopPresent'||o.kind==='alliesNamed'?[o]:[]),...Object.values(o).flatMap(nodes)];}
function compile(id:number){const p=PORTRAITS.find(p=>p.troopId===id)!;return compileEnemyBlueprint({portrait:savePortrait({manaColors:p.manaColors,rank:p.rank,form:p.form,role:p.role},p),externalId:`renamed-${id}`}).snapshot;}

describe('ST named-unit relationships survive narrative identities',()=>{
 it('runs every named condition and modifier in the actual catalog against the compiled identity',()=>{
   let checked=0;
   for(const id of new Set(TROOPS.map(t=>t.spell.id))){
     const original=nodes(SKILL_LIBRARY[id]);const adapted=nodes(adaptedPrototype(id));
     expect(adapted).toHaveLength(original.length);
     for(let i=0;i<original.length;i++){
       const source=original[i]!;const ported=adapted[i]!;
       const sourceNames=Array.isArray(source.name)?source.name:[source.name];
       for(const name of sourceNames){
         const matches=TROOPS.filter(t=>t.name===name);
         expect(matches.length,`known named dependency ${id}: ${String(name)}`).toBeGreaterThan(0);
         for(const troop of matches){
           const actor=PORTRAITS.some(p=>p.troopId===troop.id)?snapshotToCharacter(compile(troop.id),1):{...resolveAdaptedSummon(`unit:${troop.id}`)!,id:1,statuses:[],defeated:false};
           actor.name='叙事别名';const caster=unit(0);const ctx=context([caster,actor]);
           if(source.kind==='troopPresent'){
             if(source.side==='enemy'){ctx.state.teams.Right.characters=[actor];ctx.state.teams.Left.characters=[caster];}
             expect(conditionMet(ported as unknown as Condition,ctx),`condition ${id}/${troop.id}`).toBe(true);
             actor.defeated=true;expect(conditionMet(ported as unknown as Condition,ctx)).toBe(false);
           }else{
             expect(resolveModifierCount(ported as unknown as ModifierSource,ctx),`modifier ${id}/${troop.id}`).toBe(1);
             ctx.state.teams.Left.characters.push({...actor,id:2});
             expect(resolveModifierCount(ported as unknown as ModifierSource,ctx)).toBe(2);
             actor.defeated=true;expect(resolveModifierCount(ported as unknown as ModifierSource,ctx)).toBe(1);
           }
           checked++;
         }
       }
     }
   }
   expect(checked).toBeGreaterThanOrEqual(13);
 });
 it('limits identity rewriting to mechanical references and preserves trait combat terminology',()=>{
   let checked=0;
   for(const code of new Set(TROOPS.flatMap(t=>t.traits.map(tr=>tr.code)))){
     const trait=adaptedTrait(code);if(!trait)continue;
     expect(trait.name).toBe(getTrait(code)!.name);
     expect(trait.name).not.toMatch(/^unit:/);
     if(getTrait(code)!.description.includes('骷髅头'))expect(trait.description,code).toContain('骷髅头');
     checked++;
   }
   expect(checked).toBeGreaterThan(700);
   expect(adaptedTrait('stormflock')!.description).toContain('召唤体 6754');
   expect(adaptedTrait('stormflock')!.description).not.toContain('鸟妖族群');
 });
 it('keeps native name matching and prevents a renamed unrelated identity from impersonating the dependency',()=>{
   const target=unit(1,'原生对象');const ctx=context([unit(0),target]);
   const cond:Condition={kind:'troopPresent',name:'原生对象'};
   expect(conditionMet(cond,ctx)).toBe(true);
   target.mechanicalIdentity='unit:other';expect(conditionMet(cond,ctx)).toBe(false);
   target.name='unit:expected';expect(conditionMet({kind:'troopPresent',name:'unit:expected'},ctx)).toBe(false);
   target.mechanicalIdentity='unit:expected';expect(conditionMet({kind:'troopPresent',name:'unit:expected'},ctx)).toBe(true);
 });
 it('uses frozen identities for cast-start counts after the live form changes',()=>{
   const ally={...unit(1),mechanicalIdentity:'unit:original'};const ctx=context([unit(0),ally]);
   ctx.castTracking={destroyed:[],transformed:0,drainedMana:0,enemyDeaths:0,allyDeaths:0,unitsAtCastStart:{Left:ctx.state.teams.Left.characters.map(c=>({...c}))}};
   ally.mechanicalIdentity='unit:changed';
   expect(resolveModifierCount({kind:'alliesNamed',name:'unit:original',atCastStart:true},ctx)).toBe(1);
   expect(resolveModifierCount({kind:'alliesNamed',name:'unit:original'},ctx)).toBe(0);
   expect(resolveModifierCount({kind:'alliesNamed',name:'unit:changed'},ctx)).toBe(1);
 });
 it('preserves identity in real summons and replaces it when transformed to a different form',()=>{
   const source=TROOPS.find(t=>t.referenceName==='QueenYsabelle')!;
   const summoned=resolveAdaptedSummon(`unit:${source.id}`)!;const caster=unit(0);const ctx=context([caster]);
   const events=summonEffect({source:{ref:`unit:${source.id}`},resolveRef:resolveAdaptedSummon}).apply(ctx);
   expect(events.some(e=>e.type==='summon')).toBe(true);
   const actor=ctx.state.teams.Left.characters.find(c=>c.id!==0)!;
   expect(actor.mechanicalIdentity).toBe(summoned.mechanicalIdentity);
   const changed=resolveAdaptedSummon(`unit:${TROOPS.find(t=>t.name!==source.name)!.id}`)!;
   transformTroopEffect({targets:[actor],ref:'new-form',resolveRef:()=>changed}).apply(ctx);
   expect(actor.mechanicalIdentity).toBe(changed.mechanicalIdentity);
   transformTroopEffect({targets:[actor],ref:'native-form',resolveRef:()=>unit(99,'原生形态')}).apply(ctx);
   expect(actor.mechanicalIdentity).toBeUndefined();
   expect(actor.name).toBe('原生形态');
 });
});
