// Build a kingdom-x6 weapon lane test from B08 (header + generic body) and a rows file.
// Usage: node make-kw-test.mjs NN "id,id,..."   -> tests/unit/gowLaneL4bBNN.test.ts
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const [nn, ids] = process.argv.slice(2);
const src = fs.readFileSync('tests/unit/gowLaneL4bB08.test.ts', 'utf8');
const head = src.slice(0, src.indexOf('void cellsWhere;')).replace('Lane L4b batch B08', `Lane L4b batch B${nn}`);
const body = src.slice(src.indexOf('const ALL=['));
execFileSync('node', ['tasks/active/gow-skill-shards/lane-L4b/tools/kw-rows.mjs', ids, 'tasks/active/gow-skill-shards/lane-L4b/tools/kw-rows.txt']);
const rows = fs.readFileSync('tasks/active/gow-skill-shards/lane-L4b/tools/kw-rows.txt', 'utf8');
let gen = body
  .replace("const proto={segments:[{kind:'damage',target:'enemyChosen',scaling:{base:7,mult:1},modifier:mod},\n  {kind:'gem',params:{op:'create',gem:{kind:'mix',colors:[...w.mix]},count:{base:0,mult:0},modifier:mod},modifier:mod}]};",
    "// Prototype mix order may differ from native Color1/Color2 (per-gem uniform pick: order-insensitive, set asserted below).\n const proto={segments:[{kind:'damage',target:'enemyChosen',scaling:{base:7,mult:1},modifier:mod},\n  {kind:'gem',params:{op:'create',gem:{kind:'mix',colors:[...w.protoMix]},count:{base:0,mult:0},modifier:mod},modifier:mod}]};")
  .replace("expect(n.SpellSteps).toEqual([{Target:'AllAllies',Amount:600,Type:'CountArmyKingdom',Data:String(w.kid)},",
    "expect([...w.protoMix].sort()).toEqual([...w.mix].sort());\n  expect(n.SpellSteps).toEqual([{Target:'AllAllies',...(w.c0?{UseCounterForAmount:true}:{}),Amount:600,Type:'CountArmyKingdom',Data:String(w.kid)},");
if (!gen.includes('w.protoMix') || !gen.includes('w.c0')) throw new Error('template replace failed');
const out = `${head}void cellsWhere;void skullGem;void applied;void troopBinding;
/** Chinese kingdom name that src troops carry for a native KingdomId (majority over all raw troops of that id). */
function kingdomNameOf(kid:number){const m=new Map<string,number>();for(const r of original.filter((t:{KingdomId:number})=>t.KingdomId===kid)){const s=TROOPS.find(t=>t.id===r.id);if(s&&s.kingdom)m.set(s.kingdom,(m.get(s.kingdom)??0)+1);}
 return [...m.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0];}
interface KW{id:number;ref:string;spell:number;cost:number;colors:BaseColor[];kid:number;kingdom:string;enName:string;mix:[BaseColor,BaseColor];protoMix:BaseColor[];c0:boolean;desc:string;zh:string}
const KWS:KW[]=[
${rows}];
${gen}`;
fs.writeFileSync(`tests/unit/gowLaneL4bB${nn}.test.ts`, out, 'utf8');
console.log('wrote', `tests/unit/gowLaneL4bB${nn}.test.ts`);
