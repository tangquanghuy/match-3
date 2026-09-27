// @ts-expect-error node types are not installed in this project
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
// @ts-expect-error audit tooling is deliberately a Node .mjs module, outside the game bundle
import { buildAuditRows, summarizeAudit, inspectKnownDiscrepancies, AUDIT_DIMENSIONS } from '../../scripts/lib/gow-skill-audit.mjs';
import { registerSkillLibrary, SKILL_OVERRIDES } from '@engine/skills/library';
import type { SkillPrototype } from '@engine/skills/prototypes';
import { TROOPS } from '../../src/data/troops';
import { COMMUNITY_TROOPS } from '../../src/data/communityTroops';
import weapons from '../../src/data/weapons.json';
import weaponMetadata from '../../src/data/weapon-skill-meta.json';
import { runSkillAuditProbes } from '../../scripts/lib/gow-skill-probes';

interface Row {
  key: string; kind: string; entityId: number; spellId: number; status: string;
  bindingKey: string; acceptance: { accepted: boolean }; dimensions: Record<string, string>;
  sourceClauses: { text: string; review: string; exclusion: unknown }[];
  compilerMetadata: { fidelity: string } | null;
  source: { englishDescription: string | null; native: unknown; liveOfficialVerification: string };
  bindingChecks: { numericAndEquippedAlias: boolean | null };
}
const read = (p: string) => JSON.parse(fs.readFileSync(p, 'utf8'));
const prototypes = new Map<string, SkillPrototype>(); registerSkillLibrary(prototypes);
const input = {
  troops: TROOPS, weapons, prototypes: Object.fromEntries(prototypes),
  communityIds: COMMUNITY_TROOPS.map(t => t.id), overrides: Object.keys(SKILL_OVERRIDES),
  originalTroops: read('data/raw/troops.gow.en.json').troops,
  originalWeapons: read('artifacts/gowhead-weapons/weapons.json').weapons,
  nativeSpells: read('data/raw/spells.gow.en.json').spells, weaponMetadata,
};
const rows: Row[] = buildAuditRows(input);

describe('audit methodology / inventory, NOT original-rule acceptance', () => {
  it('has one key per installed troop and weapon, retaining shared spell holders', () => {
    expect(rows).toHaveLength(TROOPS.length + weapons.length);
    expect(new Set(rows.map(r => r.key)).size).toBe(rows.length);
    for (const t of TROOPS) expect(rows.some(r => r.key === `troop:${t.id}` && r.spellId === t.spell.id)).toBe(true);
    for (const w of weapons) expect(rows.some(r => r.key === `weapon:${w.id}` && r.spellId === w.spell.id)).toBe(true);
  });
  it('uses the final troop override rather than only curated batches', () => {
    const built = buildAuditRows(input).find((r: Row) => r.kind === 'troop' && r.spellId === 7004);
    expect(built.runtime.prototype).toEqual(prototypes.get('7004'));
  });
  it('inspects the equipped weapon key and checks its numerical alias', () => {
    for (const r of rows.filter(r => r.kind === 'weapon')) {
      expect(r.bindingKey).toMatch(/^gw_/);
      expect(r.bindingChecks.numericAndEquippedAlias).toBe(true);
    }
  });
  it('excludes only explicitly identified community entities, not unrecognized source IDs', () => {
    expect(rows.filter(r => r.status === 'custom-excluded').map(r => r.entityId).sort()).toEqual(COMMUNITY_TROOPS.map(t=>t.id).sort());
    const missing: Row[] = buildAuditRows({ ...input, originalTroops: [] });
    expect(missing.filter(r => r.kind === 'troop' && !input.communityIds.includes(r.entityId)).every(r=>r.status==='source-missing')).toBe(true);
  });
  it('preserves pending dimensions and clause reviews, including full compiler entries', () => {
    for (const r of rows.filter(r=>r.status!=='custom-excluded')) {
      expect(Object.keys(r.dimensions)).toEqual(AUDIT_DIMENSIONS);
      expect(r.acceptance.accepted).toBe(false);
      for (const c of r.sourceClauses) { expect(c.review).toBe('pending'); expect(c.exclusion).toBeNull(); }
    }
    expect(rows.some(r => r.compilerMetadata?.fidelity === 'full')).toBe(true);
    expect(summarizeAudit(rows).accepted).toBe(0);
    expect(summarizeAudit(rows).complete).toBe(false);
  });
  it('does not silently treat snapshot availability as latest-official verification', () => {
    expect(rows.every(r=>r.source.liveOfficialVerification==='pending')).toBe(true);
  });
  it('does not call an empty inventory completed', () => {
    expect(summarizeAudit([]).complete).toBe(false);
  });
  it('rejects duplicate entity keys instead of dropping an entry', () => {
    expect(()=>buildAuditRows({...input,troops:[...TROOPS,TROOPS[0]]})).toThrow('Duplicate entity audit keys');
  });
});

describe('scoped discrepancy detectors on synthetic bad/fixed prototypes', () => {
  it('detects a missing 12-damage clause, not a fixed conditional prototype', () => {
    const src={stats:{spell:{desc:"Deal [Magic + 4] damage to an Enemy. If the Enemy's Attack is greater, deal 12 more damage."}}};
    const seg={kind:'damage',target:'enemyChosen',scaling:{base:4,mult:1}};
    expect(inspectKnownDiscrepancies('weapon',7192,src,{segments:[seg]},null)).toHaveLength(1);
    expect(inspectKnownDiscrepancies('weapon',7192,src,{segments:[{...seg,condBonus:{n:12}}]},null)).toHaveLength(0);
    // Absence of this one discrepancy does not grant full acceptance anywhere.
  });
  it('requires independent source evidence before calling a discrepancy confirmed', () => {
    expect(inspectKnownDiscrepancies('weapon',7192,null,{segments:[]},null)).toEqual([]);
    expect(inspectKnownDiscrepancies('weapon',7192,{stats:{spell:{desc:'Different version'}}},{segments:[{kind:'damage'}]},null)).toEqual([]);
  });
  it('detects the missing disease separately from a burning effect', () => {
    const src={stats:{spell:{desc:'Burn a random Enemy and Disease another.'}}};
    expect(inspectKnownDiscrepancies('weapon',7285,src,{segments:[{kind:'status',statusId:'burning'}]},null)).toHaveLength(1);
    expect(inspectKnownDiscrepancies('weapon',7285,src,{segments:[{kind:'status',statusId:'disease'}]},null)).toHaveLength(0);
  });
  it('keeps five native random shots as a difference unless all five waves are implemented', () => {
    const original = { stats: { spell: { desc: 'Deal [Magic + 2] damage to 5 random enemies.' } } };
    const native = { SpellSteps: [
      { Type: 'Damage', Target: 'RandomEnemy' },
      ...Array.from({ length: 4 }, () => ({ Type: 'Damage', Target: 'RandomPrefNotPrevEnemy' })),
    ] };
    const damage = { kind: 'damage', target: 'enemyRandomN', n: 5 };
    const mismatched = inspectKnownDiscrepancies('troop', 99901, original, { segments: [damage] }, native);
    expect(mismatched.some((issue: { id: string }) => issue.id === 'random-repeat-99901')).toBe(true);
    const repaired = inspectKnownDiscrepancies('troop', 99901, original,
      { segments: [{ ...damage, randomWaves: 5 }] }, native);
    expect(repaired.some((issue: { id: string }) => issue.id === 'random-repeat-99901')).toBe(false);
    const missing = inspectKnownDiscrepancies('troop', 99901, original, { segments: [] }, native);
    expect(missing.some((issue: { id: string }) => issue.id === 'random-repeat-99901')).toBe(true);
  });
  it('detects native SummoningType without a final summon segment across entity kinds', () => {
    const src={stats:{spell:{desc:'Then summon a Goblin Troop.'}}};
    const native={SpellSteps:[{Type:'ExplodeColor'},{Type:'SummoningType',Data:'goblin'}]};
    for(const kind of ['weapon','troop']) {
      const missing=inspectKnownDiscrepancies(kind,9033,src,{segments:[{kind:'gem'}]},native);
      expect(missing.some((issue:{id:string})=>issue.id==='native-summoning-type-9033')).toBe(true);
      const repaired=inspectKnownDiscrepancies(kind,9033,src,
        {segments:[{kind:'gem'},{kind:'summon'}]},native);
      expect(repaired.some((issue:{id:string})=>issue.id==='native-summoning-type-9033')).toBe(false);
    }
  });
  it.each([
    ['ExtraTurn','extraTurn'],['Cleanse','cleanse'],['CauseBarrier','status'],
  ])('reports a missing native %s clause without accepting unrelated segments', (nativeType,kind) => {
    const src={stats:{spell:{desc:'Complete source step.'}}};
    const native={SpellSteps:[{Type:nativeType}]};
    expect(inspectKnownDiscrepancies('weapon',99910,src,{segments:[{kind:'gem'}]},native)
      .some((issue:{id:string})=>issue.id===`native-${nativeType.toLowerCase()}-absent-99910`)).toBe(true);
    expect(inspectKnownDiscrepancies('weapon',99910,src,
      {segments:[{kind:'oneOf',options:[[{kind,statusId:kind==='status'?'barrier':undefined}]]}]},native)
      .some((issue:{id:string})=>issue.id===`native-${nativeType.toLowerCase()}-absent-99910`)).toBe(false);
  });
  it('preserves oneOf children when detecting existing effects', () => {
    const src={stats:{spell:{desc:'Then summon a random Storm.'}}};
    expect(inspectKnownDiscrepancies('weapon',7492,src,{segments:[{kind:'oneOf',options:[[{kind:'storm'}]]}]},null)).toHaveLength(0);
  });
});

describe('real cast probe integrity, NOT a claim that these skills conform', () => {
  it('casts through final registry keys and records both sides of conditional checks', () => {
    const probes=runSkillAuditProbes();
    expect(probes).toHaveLength(7);
    for(const p of probes) {
      expect(p.eventTypes).toContain('skill-cast');
      expect(p.criterionMatches).toBe(JSON.stringify(p.actual)===JSON.stringify(p.expected));
      expect(p.wholeSkillAccepted).toBe(false);
    }
    expect(probes.filter(p=>p.spellId===7192).map(p=>p.expected)).toEqual([15,27]);
    expect(probes.filter(p=>p.spellId===9985).map(p=>p.expected)).toEqual([1,12]);
  });
});


describe('new formula and random-branch discrepancy regression guards',()=>{
 it('keeps incorrect native stat gains visible and does not certify corrected gains',()=>{
  const src={stats:{spell:{desc:'Give [Magic + 1] Attack and Life to all Undead Allies. Then Bless them.'}}};
  const native={SpellSteps:[{Type:'IncreaseAttack',Target:'AllyType',Data:'undead',Amount:1,SpellPowerMultiplier:1},{Type:'IncreaseHealth',Target:'AllyType',Data:'undead',Amount:1,SpellPowerMultiplier:1},{Type:'CauseBlessed',Target:'AllyType',Data:'undead'}]};
  const bad={segments:[{kind:'buff',stat:'attack',target:'allyAll',targetRace:'Undead',scaling:{base:1,mult:0}},{kind:'buff',stat:'hp',lifeMode:'gain',target:'allyAll',targetRace:'Undead',scaling:{base:1,mult:0}},{kind:'status',statusId:'blessed',target:'allyAll',targetRace:'Undead'}]};
  expect(inspectKnownDiscrepancies('weapon',9837,src,bad,native).map((i:{id:string})=>i.id)).toEqual(['native-gain-formula-9837-attack','native-gain-formula-9837-hp']);
  expect(inspectKnownDiscrepancies('weapon',9837,src,prototypes.get('9837'),native)).toEqual([]);
  const missing={segments:bad.segments.filter(s=>s.kind!=='status')};
  expect(inspectKnownDiscrepancies('weapon',9837,src,missing,native).some((i:{id:string})=>i.id==='native-gain-bless-9837')).toBe(true);
 });
 it('detects leaked kingdom Bless separately from repaired M+1 formulas',()=>{
  const src={stats:{spell:{desc:'Give [Magic + 1] Attack and Life to all Blackhawk Allies. Then Bless them.'}}};
  const native={SpellSteps:[{Type:'IncreaseAttack',Target:'AllyKingdom',Amount:1,SpellPowerMultiplier:1},{Type:'IncreaseHealth',Target:'AllyKingdom',Amount:1,SpellPowerMultiplier:1},{Type:'CauseBlessed',Target:'AllyKingdom'}]};
  const real=prototypes.get('9911')!;const broken={...real,segments:real.segments.map(s=>s.kind==='status'?{...s,targetKingdom:undefined}:s)};
  expect(inspectKnownDiscrepancies('weapon',9911,src,broken,native).map((i:{id:string})=>i.id)).toEqual(['native-gain-kingdom-9911-blessed']);
  expect(inspectKnownDiscrepancies('weapon',9911,src,real,native)).toEqual([]);
 });
 it('detects the prior Mongo custom branches against native evidence, but leaves shared mechanics pending',()=>{
  const src={stats:{spell:{desc:'Something random happens.'}}};
  const native={Randomize:'A-B-C-D-E-F',SpellSteps:[{Type:'Consume'},{Type:'TransformType'},{Type:'RandomStatusEffect'},{Type:'ExplodeGems'},{Type:'IncreaseAllStats'},{Type:'SplashHeavyDamage'}]};
  const old={segments:[{kind:'oneOf',options:[[{kind:'damage',target:'enemyRandom',scaling:{base:8,mult:1}}],[{kind:'buff',stat:'hp',target:'allyRandom',scaling:{base:8,mult:1},lifeMode:'gain'}],[{kind:'buff',stat:'armor',target:'allyAll',scaling:{base:4,mult:0}}],[{kind:'buff',stat:'mana',target:'allyAll',scaling:{base:3,mult:0}}],[{kind:'gem',params:{op:'clear',mode:'explode',target:{kind:'randomGems',count:{base:3,mult:0},include:'all'}}}],[{kind:'randomStatus',target:'enemyAll'}]]}]};
  expect(inspectKnownDiscrepancies('troop',7493,src,old,native).filter((i:{id:string})=>i.id.startsWith('mongo-native-branch-'))).toHaveLength(6);
  expect(inspectKnownDiscrepancies('troop',7493,src,prototypes.get('7493'),native)).toEqual([]);
 });
 it('detects the old 8144 20:3 Gold boost, independently of native percentage interpretation',()=>{
  const src={stats:{spell:{desc:'Deal [Magic + 4] damage to an Enemy. Gain 3 to all Skills, boosted by my Gold. [5:1]'}}};
  const real=prototypes.get('8144')!;
  const old={...real,segments:real.segments.map(s=>s.kind==='buff'?{...s,modifier:{mod:{kind:'ratio',a:20,b:3},source:{kind:'battleGold'}}}:s)};
  expect(inspectKnownDiscrepancies('troop',8144,src,old,null).map((i:{id:string})=>i.id)).toEqual(['treasure-king-gold-boost-ratio']);
  expect(inspectKnownDiscrepancies('troop',8144,src,real,null)).toEqual([]);
 });
 it('retains newly discovered missing enemy-Gold clauses rather than treating own Gold as both sides',()=>{
  const gun={stats:{spell:{desc:"Deal [Magic + 3] damage to 2 random Enemies, boosted by my Gold and the Enemy's Gold. [2:1]"}}};
  expect(inspectKnownDiscrepancies('weapon',8073,gun,{segments:[{kind:'damage',modifier:{source:{kind:'battleGold'}}}]},{SpellSteps:[{Type:'CountEnemyGold'}]}).some((i:{id:string})=>i.id==='golden-gun-enemy-gold-boost-absent')).toBe(true);
  const thief={stats:{spell:{desc:'Then steal 5 Gold.'}}};
  expect(inspectKnownDiscrepancies('troop',9783,thief,{segments:[{kind:'gainEconomy',currency:'gold'}]},{SpellSteps:[{Type:'TakeEnemyGold'}]}).some((i:{id:string})=>i.id==='golden-thief-gold-theft-absent')).toBe(true);
 });
});


describe('Golden Thief formula detector',()=>{
 it('rejects prior fixed-1 damage while independently retaining unresolved Gold theft',()=>{
  const src={stats:{spell:{desc:'Deal [Magic + 2] damage to a random Enemy, boosted by my Gold. Then steal 5 Gold. [10:1]'}}};
  const native={SpellSteps:[{Type:'CountMyGold',Amount:10},{Type:'Damage',Target:'RandomEnemy',Amount:2,SpellPowerMultiplier:1},{Type:'TakeEnemyGold',Amount:5},{Type:'GiveGold',Amount:5}]};
  const real=prototypes.get('9783')!;
  const old={...real,segments:real.segments.map(s=>s.kind==='damage'?{...s,scaling:{base:1,mult:0}}:s.kind==='stealGold'?{kind:'gainEconomy',currency:'gold',scaling:s.scaling}:s)};
  expect(inspectKnownDiscrepancies('troop',9783,src,old,native).map((i:{id:string})=>i.id)).toEqual(['golden-thief-damage-formula','golden-thief-gold-theft-absent']);
  expect(inspectKnownDiscrepancies('troop',9783,src,real,native).map((i:{id:string})=>i.id)).toEqual([]);
 });
 it('detects old localized first-two weapons as genuine differences, despite full compiler fidelity',()=>{
  for(const [spellId,base,target] of [[7074,3,'enemyRandom'],[7089,5,'enemyFront']] as const){
   const original=input.originalWeapons.find((w:{SpellId:number})=>w.SpellId===spellId);
   const source={SpellSteps:[{Type:'Damage',Target:'FirstTwoEnemies',Amount:base,SpellPowerMultiplier:1}]};
   const old={segments:[{kind:'gem',params:{op:'clear',mode:'destroy',target:{kind:'color',color:'Red'}}},{kind:'damage',target,scaling:{base,mult:1}}]};
   expect(inspectKnownDiscrepancies('weapon',spellId,original,old,source).some((d:{id:string})=>d.id===`native-first-two-no-red-removal-${spellId}`)).toBe(true);
   expect(inspectKnownDiscrepancies('weapon',spellId,original,prototypes.get(String(spellId)),source).some((d:{id:string})=>d.id===`native-first-two-no-red-removal-${spellId}`)).toBe(false);
  }
 });

});
