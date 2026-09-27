// Race x6 weapon family (CountArmyType Amount 600 + Damage [Magic+7] + CreateGems2Colors) lane test generator.
// Usage: node make-rw-test.mjs NN "id,id,..." -> tests/unit/gowLaneL4bBNN.test.ts
import fs from 'node:fs';
const [nn, idsArg] = process.argv.slice(2);
const l = JSON.parse(fs.readFileSync('artifacts/gow-skill-audit/ledger.json', 'utf8'));
const rows = new Map(l.rows.map(r => [r.key, r]));
const W = JSON.parse(fs.readFileSync('src/data/weapons.json', 'utf8'));
const src = fs.readFileSync('tests/unit/gowLaneL4bB08.test.ts', 'utf8');
const head = src.slice(0, src.indexOf('void cellsWhere;')).replace('Lane L4b batch B08', `Lane L4b batch B${nn}`);
const lines = [];
for (const id of idsArg.split(',').map(Number)) {
  const r = rows.get('weapon:' + id); const x = W.find(v => v.id === id); const st = r.source.native.SpellSteps; const en = r.source.englishDescription;
  const seg = r.runtime.prototype.segments;
  lines.push(` {id:${id},ref:${JSON.stringify(x.referenceName)},spell:${r.spellId},cost:${x.manaCost},colors:[${x.manaColors.map(c => 'BaseColor.' + c).join(',')}],data:${JSON.stringify(st[0].Data)},race:${JSON.stringify(seg[0].modifier.source.race)},enName:${JSON.stringify(en.match(/boosted by (.+?) Allies/)[1])},mix:[BaseColor.${st[2].Color1},BaseColor.${st[2].Color2}],protoMix:[${seg[1].params.gem.colors.map(c => 'BaseColor.' + c).join(',')}],\n  desc:${JSON.stringify(en)},\n  zh:${JSON.stringify(x.spell.description)}},`);
}
const body = `void cellsWhere;void skullGem;void applied;void troopBinding;
interface RW{id:number;ref:string;spell:number;cost:number;colors:BaseColor[];data:string;race:string;enName:string;mix:[BaseColor,BaseColor];protoMix:BaseColor[];desc:string;zh:string}
const RWS:RW[]=[
${lines.join('\n')}
];
const ALL=[BaseColor.Blue,BaseColor.Green,BaseColor.Red,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
for(const w of RWS)describe(\`L4b weapon:\${w.id}/spell:\${w.spell} [Magic+7] +6 per \${w.enName} ally to an enemy, then a mix of 6 \${w.mix.join('/')} per \${w.enName} ally\`,()=>{
 const src={kind:'alliesOfRace',race:w.race};
 // Prototype mix order may differ from native Color1/Color2 (per-gem uniform pick: order-insensitive, set asserted).
 const proto={segments:[{kind:'damage',target:'enemyChosen',scaling:{base:7,mult:1},modifier:{mod:{kind:'multiplier',a:6},source:src}},
  {kind:'gem',params:{op:'create',gem:{kind:'mix',colors:[...w.protoMix]},count:{base:0,mult:0},modifier:{mod:{kind:'multiplier',a:6},sources:[src]}},modifier:{mod:{kind:'multiplier',a:6},sources:[src]}}]};
 const others=ALL.filter(c=>!w.mix.includes(c));
 const board=pattern([others[0],others[1],others[2],others[3]]);
 it(\`gowhead English, native steps (CountArmyType \${w.data} = troopType \${w.race}), numeric + gw_\${w.ref} aliases, cost/colour, Chinese display\`,()=>{
  const o=rawWeapons.find((v:{id:number})=>v.id===w.id)!;
  expect(o.stats.spell).toMatchObject({id:w.spell,desc:w.desc});
  expect(o.ManaCost??o.manaCost).toBe(w.cost);expect(Object.keys(o._ManaColors_parsed).sort()).toEqual(w.colors.map(c=>\`Color\${c}\`).sort());
  const n=native.get(w.spell).raw;expect(n.Cost).toBe(w.cost);expect(n.Target).toBe('Enemy');
  expect(n.SpellSteps).toEqual([{Target:'AllAllies',Amount:600,Type:'CountArmyType',Data:w.data},
   {SpellPowerMultiplier:1,Target:'FromTarget',UseCounterForAmount:true,Amount:7,Primarypower:true,Type:'Damage'},
   {UseCounterForAmount:true,Color1:w.mix[0],Color2:w.mix[1],Type:'CreateGems2Colors'}]);
  expect([...w.protoMix].sort()).toEqual([...w.mix].sort());
  expect(w.race.toLowerCase()).toBe(w.data);expect(TROOPS.some(t=>t.troopTypes?.includes(w.race))).toBe(true);
  const x=weapons.find(v=>v.id===w.id)!;
  expect(x).toMatchObject({id:w.id,referenceName:w.ref,manaCost:w.cost,manaColors:[...w.colors],spell:{id:w.spell}});
  expect(x.spell.description).toBe(w.zh);
  expect(registry.prototypes.get(String(w.spell))).toEqual(proto);expect(registry.prototypes.get(\`gw_\${w.ref}\`)).toEqual(proto);
 });
 for(const side of sides)for(const alias of [String(w.spell),\`gw_\${w.ref}\`])for(const [magic,n] of [[0,0],[10,2]] as const)
 it(\`real cast side=\${side} alias=\${alias} magic=\${magic}, \${n} \${w.enName} allies: chosen enemy takes \${magic+7+6*n}, \${6*n} gems\`,()=>{
  const allies=[...Array(n)].map((_,i)=>({troopTypes:i?[w.race]:['Human',w.race]})).concat([{troopTypes:['Other']}]);
  const f=setup({skill:alias,cost:w.cost,colors:w.colors,side,magic,board,target:11,allies});const ev=f.cast();
  expect(f.enemies[1].hp).toBe(1000-(magic+7+6*n));expect(f.enemies.filter((_,i)=>i!==1).every(e=>e.hp===1000)).toBe(true);
  const made=changes(ev);expect(made).toHaveLength(6*n);expect(new Set(made.map(m=>m.pos)).size).toBe(6*n);
  expect(made.every(m=>isColor(m.to,w.mix[0])||isColor(m.to,w.mix[1]))).toBe(true);
  if(n>0){expect(made.some(m=>isColor(m.to,w.mix[0]))).toBe(true);expect(made.some(m=>isColor(m.to,w.mix[1]))).toBe(true);}
  const sp=skillPhase(ev);if(n>0)expect(sp.findIndex(e=>e.type==='skill-damage')).toBeLessThan(sp.findIndex(e=>e.type==='gem-transform'));
  assertTurnAndMana(f,ev);
 });
 it('caster of that type counts itself; dead ally and enemy of that type do not count',()=>{
  const f=setup({skill:String(w.spell),cost:w.cost,colors:w.colors,board,target:11,allies:[{troopTypes:[w.race],defeated:true,hp:0}],enemies:[{troopTypes:[w.race]},{}]});
  f.caster.troopTypes=[w.race];const ev=f.cast();expect(f.enemies[1].hp).toBe(1000-(10+7+6));expect(changes(ev)).toHaveLength(6);
 });
 it('ally is not a legal target; Barrier absorbs the damage but gems are still created',()=>{
  const a=setup({skill:String(w.spell),cost:w.cost,colors:w.colors,board,target:0});expect(a.cast()).toEqual([]);expect(a.caster.mana).toBe(w.cost);
  const b=setup({skill:String(w.spell),cost:w.cost,colors:w.colors,board,target:11,allies:[{troopTypes:[w.race]}],enemies:[{},{statuses:[{id:'barrier',turns:3}]}]});
  const ev=b.cast();expect(b.enemies[1].hp).toBe(1000);expect(changes(ev)).toHaveLength(6);
 });
 refusal({skill:String(w.spell),cost:w.cost,colors:w.colors,board,target:11});
});
`;
fs.writeFileSync(`tests/unit/gowLaneL4bB${nn}.test.ts`, head + body, 'utf8');
console.log('wrote', `tests/unit/gowLaneL4bB${nn}.test.ts`);
