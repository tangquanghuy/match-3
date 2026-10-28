import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
let check=false,target=.9;
for(let i=0;i<args.length;i++){
 const arg=args[i];
 if(arg==='--check')check=true;
 else if(arg==='--threshold'||arg==='--target')target=Number(args[++i]);
 else if(arg.startsWith('--threshold=')||arg.startsWith('--target='))target=Number(arg.slice(arg.indexOf('=')+1));
 else if(arg==='--help'){
  console.log('node scripts/st-enemy-assembly-coverage.mjs [--check] [--threshold 0.9]\n自动写入 JSON 与 Markdown。--check 仅检查结构组装；阈值范围 0.9–1。');
  process.exit(0);
 }else throw new Error(`未知参数: ${arg}`);
}
if(!Number.isFinite(target)||target<.9||target>1)throw new Error('--threshold 必须在 0.9 至 1 之间');
const server=await createServer({root,server:{middlewareMode:true},appType:'custom'});
try {
 const [coverage,troops,portraits,blueprints,traits,rules]=await Promise.all([
  server.ssrLoadModule('/src/sillytavern/enemyAssemblyCoverage.ts'),
  server.ssrLoadModule('/src/data/troops.ts'),
  server.ssrLoadModule('/src/sillytavern/portraits.ts'),
  server.ssrLoadModule('/src/sillytavern/enemyBlueprint.ts'),
  server.ssrLoadModule('/src/engine/traits.ts'),
  server.ssrLoadModule('/src/sillytavern/enemyMechanismRules.ts'),
 ]);
 const report=coverage.buildEnemyAssemblyCoverage({
  troops:troops.TROOPS,sourceTroops:troops.SOURCE_TROOPS,portraits:portraits.PORTRAITS,
  getTrait:traits.getTrait,adaptedTrait:blueprints.adaptedTrait,adaptedPrototype:blueprints.adaptedPrototype,
  inspectEnemyMechanisms:rules.inspectEnemyMechanisms,
  compileEnemyBlueprint:blueprints.compileEnemyBlueprint,restoreEnemyBlueprint:blueprints.restoreEnemyBlueprint,
 },{target});
 const jsonPath=path.join(root,'data/st-enemy-assembly-coverage.json');
 const docPath=path.join(root,'docs/sillytavern-enemy-assembly-coverage.md');
 await Promise.all([fs.mkdir(path.dirname(jsonPath),{recursive:true}),fs.mkdir(path.dirname(docPath),{recursive:true})]);
 await Promise.all([
  fs.writeFile(jsonPath,JSON.stringify(report,null,2)+'\n','utf8'),
  fs.writeFile(docPath,coverage.renderEnemyAssemblyCoverageMarkdown(report),'utf8'),
 ]);
 console.log(`结构组装覆盖: ${report.summary.structurallyCovered}/${report.total}; mapped=${report.summary.mapped}; compiled=${report.summary.compiled}; unknown=${report.summary.unknownRules}`);
 for(const [group,rows]of [['rarity',report.rarities],['rank',report.ranks]])for(const row of rows){
  console.log(`${group} ${row.name}: total=${row.total} mapped=${row.mapped} compiled=${row.compiled} unknown=${row.unknownRules} structural=${row.structurallyCovered} required=${row.required} ${row.meetsTarget?'PASS':'GAP'}`);
 }
 console.log('已写入 data/st-enemy-assembly-coverage.json 与 docs/sillytavern-enemy-assembly-coverage.md；行为验收未执行。');
 if(check&&!report.check.passed){
  console.error(`结构组装阈值未达到 (${(target*100).toFixed(1)}%):\n${report.check.failures.join('\n')}`);
  process.exitCode=1;
 }
}finally{
 await server.close();
}
