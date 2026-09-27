// Lane L1 helper: append/replace issues from a JSON array file into lane-L1/issues.json (by id).
// usage: node add-issues.cjs <file.json>
const fs=require('fs');const p='tasks/active/gow-skill-shards/lane-L1/issues.json';
const d=JSON.parse(fs.readFileSync(p,'utf8'));const add=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
for(const it of add){const i=d.issues.findIndex(x=>x.id===it.id);if(i>=0)d.issues[i]={...d.issues[i],...it};else d.issues.push(it);}
fs.writeFileSync(p,JSON.stringify(d,null,1)+'\n');console.log('issues',d.issues.length);
