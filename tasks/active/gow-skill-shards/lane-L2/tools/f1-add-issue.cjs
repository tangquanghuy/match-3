// sa-F1: append one issue to lane-L2/issues.json (keeps 2-space JSON formatting).
const fs = require('fs');
const f = 'tasks/active/gow-skill-shards/lane-L2/issues.json';
const list = JSON.parse(fs.readFileSync(f, 'utf8'));
if (!list.some(i => i.id === 'F1-7057-block5x5-count')) list.push({
  id: 'F1-7057-block5x5-count',
  key: 'troop:7057',
  kind: 'source-dispute',
  summary: 'Native s0 CountGems Skull uses BoardTarget Block5x5 while s2 ExplodeGems is Block3x3; English says one Barrier per Skull destroyed. Runtime explodes the chosen 3x3 and barriers once per skull destroyed in it (perDestroyed skull). Unclear whether the 5x5 count is intended (explosion radius) or a data quirk; no 5x5-around-cell count source exists. Armor [(Magic x 1.5) + 4] and the explode match.',
  evidence: ['npx vite-node scripts/gow-golden.ts show --keys troop:7057'],
  at: '2026-09-28',
});
fs.writeFileSync(f, JSON.stringify(list, null, 2) + '\n');
console.log(list.length);
