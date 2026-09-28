/**
 * sa-F1: copy the curated weapon build + desc into gowWeaponReviewedOverrides.json (prototype + description)
 * and scripts/curated-pools/pool-w01.json (desc), so `_weapon_pools.mjs gen` / build_weapons.mjs keep the fix.
 *   npx vite-node tasks/active/gow-skill-shards/lane-L2/tools/f1-sync-weapon.ts 10003,10005
 */
import fs from 'node:fs';
import { collectWeaponBatches } from '../../../../../src/engine/skills/curated';

const ids = (process.argv[2] ?? '').split(',').map(Number).filter(Boolean);
const spells = new Map(collectWeaponBatches().flatMap(b => b.spells).map(s => [s.id, s]));
const ovFile = 'src/data/gowWeaponReviewedOverrides.json';
const ov = JSON.parse(fs.readFileSync(ovFile, 'utf8'));
const poolFile = 'scripts/curated-pools/pool-w01.json';
const pool = JSON.parse(fs.readFileSync(poolFile, 'utf8')) as { spellId: number; desc: string }[];
for (const id of ids) {
  const s = spells.get(id); if (!s) throw new Error(`no curated weapon spell ${id}`);
  const prev = ov.entries[String(id)] ?? {};
  ov.entries[String(id)] = { ...prev, description: s.desc, prototype: JSON.parse(JSON.stringify(s.build)) };
  const p = pool.find(x => x.spellId === id); if (p) p.desc = s.desc;
  console.log(`synced ${id}${p ? '' : ' (not in pool)'}`);
}
fs.writeFileSync(ovFile, JSON.stringify(ov, null, 2) + '\n');
fs.writeFileSync(poolFile, JSON.stringify(pool, null, 1) + '\n');
