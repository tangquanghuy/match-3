import {describe,it,expect,vi} from 'vitest';
import * as leveling from '../../src/data/leveling';
import {TROOPS,getTroopById} from '../../src/data/troops';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {SeededRNG} from '../../src/engine/rng';
import {BaseColor,PlayerSide,colorGem} from '../../src/engine/types';
import type {Character,Team} from '../../src/engine/types';
import {ExtensionRegistry} from '../../src/engine/registry';
import {SKILL_LIBRARY} from '../../src/engine/skills/library';
import {executePrototype} from '../../src/engine/skills/prototypes';
import {getTrait,attachPassives} from '../../src/engine/traits';
import {snapshotToCharacter} from '../../src/session/combatantMapping';
import {PORTRAITS,savePortrait} from '../../src/sillytavern/portraits';
import {compileEnemyBlueprint,restoreEnemyBlueprint,abilityIdentity,adaptedPrototype,adaptedAbilityDescription,adaptedDescription,registerAdaptedCatalog,resolveAdaptedSummon,adaptedSummonPool,skillNameForTroop} from '../../src/sillytavern/enemyBlueprint';

function board():BoardModel{const b=new BoardModel();let id=0;const colors=Object.values(BaseColor);for(let row=0;row<8;row++)for(let col=0;col<8;col++)b.set({row,col},{id:id++,type:colorGem(colors[(row*3+col*5)%6]!)});return b;}
function unit(id:number):Character{return {id,name:'fixture',maxHp:60,hp:40,attack:12,armor:8,magic:7,colors:[BaseColor.Blue],manaCost:10,mana:10,skillId:'none',statuses:[],defeated:false};}

describe('ST versioned enemy blueprints',()=>{
 it('deduplicates equivalent abilities independently of enemy identity and distinguishes mechanical variants',()=>{
   const recipe=adaptedPrototype(7004);
   expect(abilityIdentity(recipe,['Blue','Red'],5)).toBe(abilityIdentity(structuredClone(recipe),['Red','Blue'],5));
   expect(abilityIdentity(recipe,['Blue'],5)).not.toBe(abilityIdentity(recipe,['Red'],5));
   expect(abilityIdentity(recipe,['Blue'],5)).not.toBe(abilityIdentity(recipe,['Blue'],6));
   const changed=structuredClone(recipe);changed.oncePerBattle=!changed.oncePerBattle;
   expect(abilityIdentity(recipe,['Blue'],5)).not.toBe(abilityIdentity(changed,['Blue'],5));
 });
 it('rejects an out-of-range panel before saving rather than silently clipping growth',()=>{
   const p=PORTRAITS.find(p=>{const t=getTroopById(p.troopId)!;return t.rarityIdx===5;})!;
   const growth=vi.spyOn(leveling,'troopStatsAtLevel').mockReturnValueOnce({health:10000,attack:100,armor:100,magic:100});
   expect(()=>compileEnemyBlueprint({portrait:savePortrait({manaColors:p.manaColors,rank:p.rank,form:p.form,role:p.role},p),externalId:'overflow',level:100,difficulty:10})).toThrow('超出当前规则范围');
   growth.mockRestore();
 });
 it('compiles all 1800 indexed enemies with portraits, costs, ordinary traits and abstract relationships',()=>{
   const registry=new ExtensionRegistry();const native=JSON.stringify(SKILL_LIBRARY);registerAdaptedCatalog(registry);
   for(const p of PORTRAITS){
     const t=getTroopById(p.troopId)!;const selection=savePortrait({manaColors:p.manaColors,rank:p.rank,form:p.form,role:p.role},p);
     const blueprint=compileEnemyBlueprint({portrait:selection,externalId:'enemy-1'});
     const described=adaptedAbilityDescription(t.spell.id);
     expect(blueprint.descriptionAudit,`description audit ${t.id}`).toEqual({support:described.support,diagnostics:described.diagnostics});
     // Name: original game name, one per mechanics (abilityNames.ts); description: adapted mechanics.
     expect(blueprint.snapshot.spellName).toBe(skillNameForTroop(t.id));expect(blueprint.snapshot.spellDescription).toBe(described.description);
     expect(blueprint.snapshot.manaColors,`colors ${t.id}`).toEqual(t.manaColors);expect(blueprint.snapshot.manaCost,`cost ${t.id}`).toBe(t.manaCost);
     expect(blueprint.snapshot.troopTypes?.every(v=>v.startsWith('affinity:'))).toBe(true);
     expect(blueprint.snapshot.portraitUrl).toContain(p.assetId);
     expect(registry.prototypes.has(blueprint.snapshot.skillId!)).toBe(true);
     expect(blueprint.snapshot.traitIds?.every(id=>!!getTrait(id))).toBe(true);
     const actor=snapshotToCharacter(blueprint.snapshot,0);attachPassives(actor);expect(actor.passive).toBeDefined();
   }
   expect(JSON.stringify(SKILL_LIBRARY)).toBe(native);
 },30000);
 it('restores a canonical full recipe and rejects edited or outdated saved blueprints',()=>{
   const p=PORTRAITS[0]!;const portrait=savePortrait({manaColors:p.manaColors,rank:p.rank,form:p.form,role:p.role},p);
   const blueprint=compileEnemyBlueprint({portrait,externalId:'enemy',level:31,difficulty:1.4});
   expect(restoreEnemyBlueprint(JSON.parse(JSON.stringify(blueprint)))).toEqual(blueprint);
   expect(()=>restoreEnemyBlueprint({...blueprint,rulesetVersion:'old'})).toThrow('版本');
   expect(()=>restoreEnemyBlueprint({...blueprint,recipeSignature:'stale'})).toThrow('变更');
   const edited=structuredClone(blueprint);edited.snapshot.stats.hp++;expect(()=>restoreEnemyBlueprint(edited)).toThrow('变更');
 });
 it('executes every ported active with real summon and kingdom resolvers',()=>{
   registerAdaptedCatalog(new ExtensionRegistry());
   const errors:string[]=[];
   for(const id of new Set(TROOPS.map(t=>t.spell.id))){
     let next=1000;const left:Team={player:PlayerSide.Left,characters:[unit(0),unit(1),unit(2)]};const right:Team={player:PlayerSide.Right,characters:[unit(4),unit(5),unit(6)]};
     const state=createGameState(board(),left,right);
     try{executePrototype(adaptedPrototype(id),{state,casterId:0,rng:new SeededRNG(20261021),nextGemId:()=>next++,resolveSummonRef:resolveAdaptedSummon,resolveKingdomSummonRefs:adaptedSummonPool});}
     catch(error){errors.push(`${id}: ${String(error)}`);}
   }
   expect(errors,errors.join('\n')).toEqual([]);
 },30000);
 it('preserves normal damage and barrier while omitting ascension/boss specialization',()=>{
   const t=getTroopById(6414)!;const p=adaptedPrototype(t.spell.id);
   expect(p.segments.map(s=>s.kind)).toEqual(['damage','status']);
   expect(JSON.stringify(p)).not.toContain('ascended');expect(JSON.stringify(p)).not.toContain('Boss');
   expect(adaptedDescription(t.spell.description)).toContain('屏障');expect(adaptedDescription(t.spell.description)).toContain('伤害');expect(adaptedDescription(t.spell.description)).not.toContain('魔头');
 });
 it('binds actual summon references and rejects a mechanical rank mismatch',()=>{
   const source=TROOPS.find(t=>t.referenceName==='QueenYsabelle')!;const summoned=resolveAdaptedSummon(`unit:${source.id}`)!;
   expect(summoned.skillId).toBe(`st:${source.spell.id}`);expect(summoned.colors).toEqual(source.manaColors);expect(summoned.troopTypes?.every(v=>v.startsWith('affinity:'))).toBe(true);
   const p=PORTRAITS[0]!;const selection=savePortrait({manaColors:p.manaColors,rank:p.rank,form:p.form,role:p.role},p);
   const mismatch=PORTRAITS.find(x=>x.rank!==p.rank)!;
   expect(()=>compileEnemyBlueprint({portrait:selection,recipeTroopId:mismatch.troopId,externalId:'enemy'})).toThrow('匹配');
 });
});
