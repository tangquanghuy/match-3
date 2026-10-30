import {describe, expect, it} from 'vitest';
import {SKILL_LIBRARY, registerSkillLibrary} from '../../src/engine/skills/library';
import {GOW_CHOICE_RULES, applyGowChoiceRule, choiceRuleOf, copyGowChoiceRule, gemAllowed} from '../../src/engine/skills/gowChoiceRules';
import {selectSkillBranch} from '../../src/engine/skills/branchChooser';
import {chooseSkill, skill} from '../../src/engine/skills/builders';
import {BaseColor, colorGem, skullGem, specialGem} from '../../src/engine/types';
import {abilityIdentity, adaptedPrototype, registerStSkillLibrary} from '../../src/sillytavern/enemyBlueprint';
import {COMBAT_DESCRIPTION_TERMS, describeAdaptedAbility} from '../../src/sillytavern/abilityDescription';
import type {SkillPrototype} from '../../src/engine/skills/prototypes';

// Covers the original rule table and registered weapon aliases, not a second rule implementation.
describe('ST adapter preserves native input rules',()=>{
 for(const [id, rule] of Object.entries(GOW_CHOICE_RULES)) {
  if(!SKILL_LIBRARY[Number(id)]) continue;
  it(`${id}: uncached and cached copies retain the original restrictions`,()=>{
   expect(choiceRuleOf(SKILL_LIBRARY[Number(id)])).toEqual(rule);
   const first=adaptedPrototype(Number(id)),second=adaptedPrototype(Number(id));
   expect(first).not.toBe(second);
   expect(choiceRuleOf(first)).toEqual(rule);
   expect(choiceRuleOf(second)).toEqual(rule);
   expect(abilityIdentity(first,[BaseColor.Red],12)).toBe(abilityIdentity(second,[BaseColor.Red],12));
  });
 }
 it('preserves all restricted numeric and equipped weapon registry aliases',()=>{
  const native=new Map<string,SkillPrototype>(),adapted=new Map<string,SkillPrototype>();
  registerSkillLibrary(native);registerStSkillLibrary(adapted);
  const restricted=[...native].filter(([,p])=>choiceRuleOf(p));
  expect(restricted.length).toBeGreaterThan(70);
  expect(restricted.some(([key])=>key.startsWith('gw_'))).toBe(true);
  for(const [key,p] of restricted)expect(choiceRuleOf(adapted.get(key)),key).toEqual(choiceRuleOf(p));
 });
 it('identical JSON with different restrictions is a different learnable ability',()=>{
  const unrestricted=structuredClone(SKILL_LIBRARY[7406]);
  const restricted=applyGowChoiceRule(7406,structuredClone(unrestricted));
  expect(restricted).toEqual(unrestricted);
  expect(abilityIdentity(restricted,[BaseColor.Red],12)).not.toBe(abilityIdentity(unrestricted,[BaseColor.Red],12));
  const same=copyGowChoiceRule(restricted,structuredClone(restricted));
  expect(abilityIdentity(same,[BaseColor.Red],12)).toBe(abilityIdentity(restricted,[BaseColor.Red],12));
  copyGowChoiceRule(unrestricted,same);
  expect(choiceRuleOf(same)).toBeUndefined();
 });
 it('selecting a branch retains its native rule',()=>{
  const p=applyGowChoiceRule(7406,skill(chooseSkill(['a','b'],[],[])));
  expect(choiceRuleOf(selectSkillBranch(p,0)!)).toEqual(GOW_CHOICE_RULES[7406]);
 });
 for(const id of [7406,7253,7040])it(`${id}: the player description states the input restriction`,()=>{
  const p=adaptedPrototype(id),rule=GOW_CHOICE_RULES[id];
  const text=describeAdaptedAbility(p).description;
  if(rule.notColor)expect(text).toContain(`不能选择${COMBAT_DESCRIPTION_TERMS.colors[rule.notColor]}色宝石`);
  else if(rule.onlyColor)expect(text).toContain(`只能选择${COMBAT_DESCRIPTION_TERMS.colors[rule.onlyColor]}色宝石`);
  else expect(text).toContain('只能选择普通宝石');
 });
 it('the shared picker predicate excludes skulls, special gems and the forbidden color',()=>{
  const rule=GOW_CHOICE_RULES[7406];
  expect(gemAllowed(rule,colorGem(BaseColor.Red))).toBe(false);
  expect(gemAllowed(rule,colorGem(BaseColor.Blue))).toBe(true);
  expect(gemAllowed(rule,skullGem())).toBe(false);
  expect(gemAllowed(rule,specialGem('bomb'))).toBe(false);
  expect(gemAllowed(GOW_CHOICE_RULES[7253],colorGem(BaseColor.Blue))).toBe(false);
  expect(gemAllowed(GOW_CHOICE_RULES[7253],colorGem(BaseColor.Purple))).toBe(true);
  expect(gemAllowed(undefined,skullGem())).toBe(true);
 });
});
