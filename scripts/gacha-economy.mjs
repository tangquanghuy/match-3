import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try {
 const model=await server.ssrLoadModule('/src/meta/economy/gachaModel.ts');
 const arg=process.argv[2];
 const budget=arg?.endsWith('.json') ? JSON.parse(await readFile(arg,'utf8')) : model.BUDGET_SCENARIOS[arg??'standard'];
 if(!budget) throw new Error(`情景名: ${Object.keys(model.BUDGET_SCENARIOS).join(' / ')}，或预算 JSON 文件路径`);
 console.log(JSON.stringify(model.economyReport(budget),(_key,value)=>typeof value==='number'&&!Number.isFinite(value)?'Infinity':value,2));
} finally { await server.close(); }
