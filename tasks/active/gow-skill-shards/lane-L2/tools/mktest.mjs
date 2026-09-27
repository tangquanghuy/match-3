// Lane L2 helper: assemble tests/unit/gowLaneL2B<NN>.test.ts = header + shared harness + batch body.
// Usage: node mktest.mjs <NN> "<header line>"   (body: tools/body-b<NN>.ts.txt)
import fs from 'node:fs';
const [nn, header] = process.argv.slice(2);
const dir = 'tasks/active/gow-skill-shards/lane-L2/tools/';
const harness = fs.readFileSync(dir + 'harness.ts.txt', 'utf8').replace(/^\uFEFF/, '');
const body = fs.readFileSync(dir + `body-b${nn}.ts.txt`, 'utf8').replace(/^\uFEFF/, '');
const out = `// Lane L2 batch B${nn} (sa-L2): ${header}\n${harness.trimEnd()}\n\n${body.trimEnd()}\n`;
fs.writeFileSync(`tests/unit/gowLaneL2B${nn}.test.ts`, out.replace(/\r\n/g, '\n'));
console.log('wrote', `tests/unit/gowLaneL2B${nn}.test.ts`);
