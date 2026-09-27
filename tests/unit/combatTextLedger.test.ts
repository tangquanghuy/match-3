// @ts-expect-error node types are not installed in this project
import fs from 'node:fs';
import {it,expect} from 'vitest';
import {SOURCE_TROOPS,TROOPS} from '../../src/data/troops';
import {PROJECT_SPELL_TEXT,normalizeCombatText} from '../../src/data/combatText';
it('exports every changed displayed spell/trait description against its source',()=>{
 const rows=[];
 for(const troop of TROOPS){
  const source=SOURCE_TROOPS.find(x=>x.id===troop.id)!;
  if(source.spell.description!==troop.spell.description)rows.push({troopId:troop.id,name:troop.name,kind:'spell',id:String(troop.spell.id),
   category:PROJECT_SPELL_TEXT[troop.spell.id]?'explicit-project-rule':'wording-normalization',before:source.spell.description,after:troop.spell.description});
  for(const trait of troop.traits){const original=source.traits.find(x=>x.code===trait.code)!;
   if(original.description!==trait.description)rows.push({troopId:troop.id,name:troop.name,kind:'trait',id:trait.code,
    category:'wording-normalization',before:original.description,after:trait.description});
  }
  for(const text of [troop.spell.description,...troop.traits.map(t=>t.description)]){
   expect(normalizeCombatText(text)).toBe(text);
   expect(text).not.toMatch(/(?:严重|轻微)(?:的)?\s*溅射|溅射上海|溅射真实伤害/);
  }
 }
 fs.mkdirSync('artifacts/troop-audit',{recursive:true});
 fs.writeFileSync('artifacts/troop-audit/combat-text-changes.json',JSON.stringify({generatedAt:new Date().toISOString(),
  scope:'Displayed descriptions normalized at data boundary; imported source strings retained as provenance. This ledger is not a full semantic proofreading approval.',
  summary:{changedTroopDescriptions:rows.length,uniqueSpells:new Set(rows.filter(r=>r.kind==='spell').map(r=>r.id)).size,uniqueTraits:new Set(rows.filter(r=>r.kind==='trait').map(r=>r.id)).size},rows},null,2));
});
