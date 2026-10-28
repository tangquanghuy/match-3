import {describe,it,expect} from 'vitest';
import {PORTRAITS,findPortraits,colorKey,savePortrait,restorePortrait} from '../../src/sillytavern/portraits';
import {coverageRows,mechanismExclusions,buildEnemyInventory} from '../../src/sillytavern/enemyInventory';

describe('ST portrait selection',()=>{
 it('matches the complete color set and deduplicates artwork after filtering',()=>{
   const sample=PORTRAITS.find(p=>p.manaColors.length===2)!;
   const q={manaColors:[...sample.manaColors].reverse(),rank:sample.rank,form:sample.form,role:sample.role};
   const matches=findPortraits(q);expect(matches.length).toBeGreaterThan(0);
   expect(matches.every(p=>colorKey(p.manaColors)===colorKey(sample.manaColors))).toBe(true);
   expect(new Set(matches.map(p=>p.contentHash)).size).toBe(matches.length);
   expect(findPortraits({...q,manaColors:[sample.manaColors[0]!]}).some(p=>p.assetId===sample.assetId)).toBe(false);
 });
 it('saves a concrete image and never rerolls it during restore',()=>{
   const p=PORTRAITS[0]!;const query={manaColors:p.manaColors,rank:p.rank,form:p.form,role:p.role};
   const s=savePortrait(query,p);expect(restorePortrait(JSON.parse(JSON.stringify(s))).entry.assetId).toBe(p.assetId);
   expect(()=>restorePortrait({...s,contentHash:'changed'})).toThrow('变更');
   expect(()=>restorePortrait({...s,version:99})).toThrow('版本');
   expect(()=>savePortrait({...query,role:undefined},p)).toThrow('阶级、形态和职责');
   expect(()=>restorePortrait({...s,query:{...query,rank:'invalid'}})).toThrow();
 });
 it('saves new artwork queries without mana and preserves legacy color queries',()=>{
   const p=PORTRAITS[0]!;const query={rank:p.rank,form:p.form,role:p.role};
   const selection=savePortrait(query,p);expect(selection.query).not.toHaveProperty('manaColors');
   expect(restorePortrait(JSON.parse(JSON.stringify(selection))).selection).toEqual(selection);
   const legacy=savePortrait({...query,manaColors:[...p.manaColors].reverse()},p);
   expect(restorePortrait(JSON.parse(JSON.stringify(legacy))).selection).toEqual(legacy);
 });
 it('validates invalid colors and preserves empty query semantics',()=>{
   expect(()=>colorKey(['Blue','Blue'])).toThrow();expect(()=>colorKey(['not-a-color'])).toThrow();
   expect(findPortraits({}).length).toBe(1794);
 });
});
describe('ST enemy inventory denominator',()=>{
 it('counts enemies per original rarity and keeps native registration separate from acceptance',()=>{
   const data=buildEnemyInventory();
   expect(data.enemies).toHaveLength(1821);expect(data.enemies.filter(e=>e.origin==='imported')).toHaveLength(1800);expect(data.enemies.filter(e=>e.origin==='community')).toHaveLength(21);
   expect(data.enemies.filter(e=>e.origin==='community').flatMap(e=>e.exclusions).every(e=>e.source.startsWith('src/data/communityTroops.ts#'))).toBe(true);
   expect(data.enemies.filter(e=>e.compilation.state==='compiled')).toHaveLength(1800);expect(data.enemies.filter(e=>e.compilation.state==='blocked').every(e=>e.compilation.issues.length>0)).toBe(true);expect(data.skills.every(s=>s.prototype&&s.sourceDescriptions.length>0)).toBe(true);
   expect(data.rarities.reduce((sum,r)=>sum+r.total,0)).toBe(data.enemies.length);
   expect(data.rarities.map(r=>r.name)).toEqual(['Common','Uncommon','Rare','UltraRare','Epic','Legendary']);
   for(const row of data.rarities){expect(row.required).toBe(Math.ceil(row.applicable*.9));expect(row.passed).toBe(0);}
   const ordinary=data.enemies.find(e=>e.dependencies.some(d=>d.kind==='summon'))!;expect(ordinary.applicable).toBe(true);
   const scoped=data.enemies.find(e=>e.exclusions.some(x=>x.scope==='trait'))!;expect(scoped.applicable).toBe(true);
   const changed=data.enemies.map(e=>({...e,assemblerVerified:e.id===ordinary.id}));
   expect(coverageRows(changed,'rank').reduce((sum,r)=>sum+r.passed,0)).toBe(1);
 });
 it('only flags evidenced scoped mechanisms without treating ordinary bosses as special',()=>{
   expect(mechanismExclusions('skill','1','对首领造成伤害并召唤同伴','fixture')).toEqual([]);
   expect(mechanismExclusions('trait','a','在淘宝模式中获得 9 点生命值。','fixture')[0]?.mechanism).toBe('delve');
   expect(mechanismExclusions('skill','2','因晋升稀有度对魔头增伤。','fixture')).toHaveLength(2);
 });
});
