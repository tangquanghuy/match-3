// Round-2: flip the round-1 it.fails repros in gowLaneL4bB01/B02 to assert the fixed / ruled behaviour.
import fs from 'node:fs';
const rep = (p, pairs) => {
  let c = fs.readFileSync(p, 'utf8');
  for (const [a, b] of pairs) {
    const n = c.split(a).length - 1;
    if (n !== 1) throw new Error(`${p}: ${n} matches for ${a.slice(0, 80)}`);
    c = c.replace(a, b);
  }
  fs.writeFileSync(p, c);
  console.log('ok', p);
};
rep('tests/unit/gowLaneL4bB01.test.ts', [
  [" // KNOWN DIFFERENCE (issues.json L4b-6751-zh): Chinese display says 骷髅头 (Skulls), source says Doomskulls.\n it.fails('display should say 末日骷髅 (Doomskulls) like the English/native source',()=>{\n  expect(TROOPS.find(t=>t.id===6751)!.spell.description).toMatch(/末日骷髅/);",
   " // FIXED round 2 (issues.json L4b-6751-zh): display override now says 末日骷髅头 (Doomskulls) like English/native.\n it('display says 末日骷髅头 (Doomskulls) like the English/native source',()=>{\n  expect(TROOPS.find(t=>t.id===6751)!.spell.description).toBe('诅咒所有敌人。将所有绿色宝石转换成末日骷髅头。');"],
  [" // KNOWN DIFFERENCE (issues.json L4b-7138-zh): Chinese display typo 「发力颜色」 for 法力颜色.\n it.fails('display should read 法力颜色 (mana colour)',()=>{\n  expect(TROOPS.find(t=>t.id===7138)!.spell.description).toMatch(/法力颜色/);",
   " // FIXED round 2 (issues.json L4b-7138-zh): display override reads 法力颜色.\n it('display reads 法力颜色 (mana colour)',()=>{\n  expect(TROOPS.find(t=>t.id===7138)!.spell.description).toBe('赐予一名盟友法印效果，并给予其 3 点魔力值。再创建 12 颗其法力颜色之一的宝石。');"],
  [" it.fails('two-colour ally seed=42: all 12 gems share ONE colour',()=>{\n  const f=setup({...base,target:2,seed:42});const made=creations(f.cast());\n  expect(new Set(made.map(m=>m.to.kind==='color'?m.to.color:'x')).size).toBe(1);\n });",
   " // FIXED round 2: the colour is resolved once per cast (gems.ts resolveCreateSpec); every seed yields one colour.\n for(const seed of [1,7,42,99])it(`two-colour ally seed=${seed}: all 12 gems share ONE of Red/Purple`,()=>{\n  const f=setup({...base,target:2,seed});const made=creations(f.cast());\n  expect(made).toHaveLength(12);const cs=new Set(made.map(m=>m.to.kind==='color'?m.to.color:'x'));\n  expect(cs.size).toBe(1);expect(['Red','Purple']).toContain([...cs][0]);\n  expect(made.every(m=>m.from===null||m.from.kind!=='color'||m.from.color!==[...cs][0])).toBe(true);\n });"],
  [" // KNOWN DIFFERENCE (issues.json L4b-7200-noop): on a Yellow-bearing full board the conversion pool is filtered\n",
   " // RULED round 2 (rulings/RL4b-01-two-colour-overwrite.md, L4b-7200-noop closed): 2-colour creation selects 22 distinct\n // cells and may land a gem on a cell that already had that colour; only N distinct cells / endpoint types are asserted.\n // (Historical note: on a Yellow-bearing full board the conversion pool is filtered\n"],
  [" it.fails('seed=7 Yellow-bearing board: none of the 22 changes is a same-type no-op',()=>{\n  const f=setup({...base,seed:7});const made=creations(f.cast());\n  expect(made).toHaveLength(22);\n  expect(made.filter(m=>JSON.stringify(m.from)===JSON.stringify(m.to))).toEqual([]);\n });",
   " it('seed=7 Yellow-bearing board: 22 distinct cells selected, all end Skull or Yellow (same-colour overwrite allowed, RL4b-01)',()=>{\n  const f=setup({...base,seed:7});const made=creations(f.cast());\n  expect(made).toHaveLength(22);expect(new Set(made.map(m=>m.pos)).size).toBe(22);\n  expect(made.every(m=>m.to.kind==='skull'||isColor(m.to,BaseColor.Yellow))).toBe(true);\n });"],
  [" // KNOWN DIFFERENCE (issues.json L4b-7200-rage-alias): Enrage is stored as 'rage'; exact-id counters used by\n",
   " // FIXED round 2 (issues.json L4b-7200-rage-alias): secondary.ts status readers treat rage/enraged as one status.\n // (Was: Enrage is stored as 'rage'; exact-id counters used by\n"],
  [" it.fails('Enraged allies from 8787 are counted by allyStatusCount enraged counters (expected 3)',async()=>{",
   " it('Enraged allies from 8787 are counted by allyStatusCount enraged counters (expected 3)',async()=>{"],
]);
rep('tests/unit/gowLaneL4bB02.test.ts', [
  ["  expect(registry.prototypes.get('7138')).toEqual({segments:[{kind:'damage',target:'enemyAll',scaling:{base:0,mult:1},range:'all'},\n   {kind:'status',target:'enemyAll',statusId:'poison',turns:3,magnitude:3},",
   "  // FIXED round 2 (L4b-6068-order, R001): prototype follows native order CausePoison -> Damage.\n  expect(registry.prototypes.get('7138')).toEqual({segments:[{kind:'status',target:'enemyAll',statusId:'poison',turns:3,magnitude:3},\n   {kind:'damage',target:'enemyAll',scaling:{base:0,mult:1},range:'all'},"],
  [" it('lethal damage: killed enemy is not poisoned, survivors are',()=>{\n  const f=setup({...base,enemies:[{hp:5},{},{},{}]});const ev=f.cast();\n  expect(f.enemies[0].defeated).toBe(true);expect(applied(ev).map(a=>a[0])).toEqual([11,12,13]);",
   " it('native order: every enemy is Poisoned before the hit, so an enemy killed by the damage was Poisoned first',()=>{\n  const f=setup({...base,enemies:[{hp:5},{},{},{}]});const ev=f.cast();\n  expect(f.enemies[0].defeated).toBe(true);expect(applied(ev).map(a=>a[0])).toEqual([10,11,12,13]);"],
  [" // KNOWN DIFFERENCE (issues.json L4b-6068-order): native executes CausePoison BEFORE Damage; runtime prototype\n",
   " // FIXED round 2 (issues.json L4b-6068-order): native executes CausePoison BEFORE Damage.\n // (Was: runtime prototype\n"],
  [" it.fails('native order: Poison status-apply precedes the damage events',()=>{",
   " it('native order: Poison status-apply precedes the damage events',()=>{"],
]);
