// @ts-expect-error node types are not installed
import fs from 'node:fs';
import {describe,it,expect} from 'vitest';
import {registerSkillLibrary} from '@engine/skills/library';
import {ExtensionRegistry} from '@engine/registry';
import {TurnEngine} from '@engine/TurnEngine';
import {BaseColor,colorGem,skullGem} from '@engine/types';
import {damageFixture} from '../helpers/damageFixture';
import weapons from '../../src/data/weapons.json';
const native=JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells;
describe('selected-column native CountGems -> ExplodeGems -> CreateGems order',()=>{
 for(const id of [8805,8988]){
  it(`${id}: native source counts selected column BEFORE exploding it`,()=>{
   const source=JSON.parse(native.find((s:{Id:number;RawData?:string})=>s.Id===id&&s.RawData).RawData);
   expect(source.SpellSteps.slice(0,3).map((s:{Type:string})=>s.Type)).toEqual(['CountGems','CountGems','ExplodeGems']);
   expect(source.SpellSteps.slice(0,3).every((s:{BoardTarget:string})=>s.BoardTarget==='Column')).toBe(true);
  });
  for(const col of [0,3,7])for(const count of [0,1,4,8]){
   it(`${id}: column ${col}, ${count} pre-explosion matching gems, no adjacent-column inflation`,()=>{
    const f=damageFixture();const w=weapons.find(w=>w.spell.id===id)!;
    f.caster.skillId=`gw_${w.referenceName}`;f.caster.mana=f.caster.manaCost=w.manaCost;
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){
     // Nonchosen columns deliberately have matching colors and must not inflate the count.
     const relevant=id===8805?(r%2?colorGem(BaseColor.Red):colorGem(BaseColor.Brown)):(r%2?skullGem():colorGem(BaseColor.Purple));
     const irrelevant=colorGem(r%2?BaseColor.Blue:BaseColor.Green);
     f.board.set({row:r,col:c},{id:r*8+c+1,type:c!==col||r<count?relevant:irrelevant});
    }
    const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
    const engine=new TurnEngine(f.state,f.ctx.rng,f.ctx.nextGemId,registry);engine.skullChance=0;
    engine.setCellChooser({choose:()=>({row:3,col})});
    const events=engine.castSkill(f.caster.id);
    const blast=events.find(e=>e.type==='gem-explode');expect(blast).toBeDefined();
    if(blast?.type==='gem-explode')expect(blast.cells).toHaveLength(col===0||col===7?16:24);
    const gems=events.flatMap(e=>e.type==='gem-transform'?e.changes.map(c=>c.to):e.type==='gem-create'?e.spawns.map(s=>s.gemType):[]);
    const created=gems.filter(g=>g.kind==='special'&&g.spec.kind===(id===8805?'gargoyleGem':'deathMarkGem'));
    expect(created).toHaveLength(count);
   });
  }
 }
});
