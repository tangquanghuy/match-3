import {describe,expect,it} from 'vitest';
import {TROOPS} from '../../src/data/troops';
import {ExtensionRegistry} from '../../src/engine/registry';
import {applyBattleStartTraits} from '../../src/engine/traits';
import {BaseColor} from '../../src/engine/types';
import type {Character} from '../../src/engine/types';
import {registerAdaptedCatalog,resolveAdaptedSummon} from '../../src/sillytavern/enemyBlueprint';

function actor(id:number,traitIds:string[]):Character {
 return {id,name:'叙事别名',maxHp:100,hp:100,attack:10,armor:0,magic:5,mana:0,manaCost:10,skillId:'fixture',colors:[BaseColor.Blue],traitIds,statuses:[],defeated:false};
}
describe('ST trait family membership uses registered mechanics',()=>{
 it('counts native and abstract banding allies once each, excludes defeated allies and the opposing side',()=>{
   registerAdaptedCatalog(new ExtensionRegistry());
   const holder=actor(1,['st:bandinglife','st:bandingarmor']);
   const native=actor(2,['truebanding']);
   const dead=actor(3,['st:bandingmagic']);dead.defeated=true;
   const enemy=actor(4,['st:bandingattack']);
   const events=applyBattleStartTraits([holder,native,dead,actor(5,[])],[enemy]);
   expect(holder.hp).toBe(104);expect(holder.maxHp).toBe(104);expect(holder.armor).toBe(4);
   expect(native.hp).toBe(102);expect(native.attack).toBe(12);
   expect(enemy.attack).toBe(11);
   expect(events.some(e=>e.targetId===dead.id)).toBe(false);
 });
 it('preserves family mechanics on an actual catalog-derived form with abstract trait codes',()=>{
   registerAdaptedCatalog(new ExtensionRegistry());
   const source=TROOPS.find(t=>t.traits.some(tr=>tr.code==='bandinglife'))!;
   const template=resolveAdaptedSummon(`unit:${source.id}`,{level:49,difficulty:1.2})!;
   // Isolate this actual catalog trait from the source form's unrelated opening auras.
   const holder={...template,traitIds:template.traitIds!.filter(code=>code==='st:bandinglife'),id:1,statuses:[],defeated:false} as Character;
   const before=holder.hp;
   applyBattleStartTraits([holder,actor(2,['st:truebanding'])],[]);
   expect(holder.hp).toBe(before+4);expect(holder.maxHp).toBe(before+4);
 });
 it('does not infer family membership from a narrative or arbitrary code prefix',()=>{
   registerAdaptedCatalog(new ExtensionRegistry());
   const holder=actor(1,['st:bandinglife']);
   applyBattleStartTraits([holder,actor(2,['banding-impostor'])],[]);
   expect(holder.hp).toBe(102);
 });
});
