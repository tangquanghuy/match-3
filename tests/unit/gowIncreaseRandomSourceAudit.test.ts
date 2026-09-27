// Each registered native IncreaseRandom step awards its full amount to one random Skill per recipient.
// These are scoped mechanical checks, not per-entity whole-skill signoffs.
// @ts-expect-error Node fixture
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error Native fixture reader
import { indexNativeSpells } from '../../scripts/lib/gow-native-source.mjs';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
const native=indexNativeSpells(JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json','utf8')).spells);
const en=JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json','utf8')).troops as Array<{stats?:{spell?:{id:number;desc:string}}}>;
const registry=new ExtensionRegistry();registerSkillLibrary(registry.prototypes);
const nativeTargets={allySelf:'Self',allyOthers:'AllAlliesButNotSelf',allyRandom:'RandomAlly',allyChosen:'FromTarget',allyFront:'FrontAlly'} as const;
const cases=[
  [7009,'allySelf'],[7011,'allySelf'],[7162,'allyOthers'],[7213,'allySelf'],
  [7219,'allySelf'],[7261,'allyRandom'],[7289,'allySelf'],[7322,'allyRandom'],
  [7390,'allySelf'],[7407,'allyOthers'],[7414,'allyChosen'],[7538,'allyChosen'],
  [7545,'allyRandom'],[7954,'allySelf'],[7987,'allyFront'],
] as const;
function randomStatSegments(value:unknown):Array<{kind:string;target:string;oneSkill?:boolean}> {
  const found:Array<{kind:string;target:string;oneSkill?:boolean}>=[];
  function visit(item:unknown) {
    if(!item||typeof item!=='object')return;
    if(Array.isArray(item)){for(const el of item)visit(el);return;}
    const object=item as Record<string,unknown>;
    if(object.kind==='randomStat')found.push(object as {kind:string;target:string;oneSkill?:boolean});
    for(const value of Object.values(object))visit(value);
  }
  visit(value);return found;
}
describe('stored native IncreaseRandom / one Skill (scoped mechanic, NOT whole acceptance)',()=>{
  for(const [id,target] of cases)it(String(id)+' native and registered single-Skill mode',()=>{
    const spell=native.get(id)?.raw;
    expect(spell).toBeTruthy();
    const nativeSteps=spell.SpellSteps.filter((s:{Type:string})=>s.Type==='IncreaseRandom');
    expect(nativeSteps).toHaveLength(1);
    expect(nativeSteps[0].Target).toBe(nativeTargets[target]);
    const english=en.find(t=>t.stats?.spell?.id===id)?.stats?.spell?.desc;
    if(english) expect(english.toLowerCase()).toMatch(/random skill/);
    const prototype=registry.prototypes.get(String(id));expect(prototype).toBeTruthy();
    const compiled=randomStatSegments(prototype?.segments);
    expect(compiled.map(s=>s.target)).toEqual([target]);
    expect(compiled.map(s=>s.oneSkill)).toEqual([true]);
  });
});
