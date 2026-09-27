// Lane L4b round-2 Chinese display fixes via src/data/gowSnapshotOverrides.json + curated desc + pool desc.
// Run only while holding the src lock; then `node scripts/build_troops.mjs`.
import fs from 'node:fs';
const fixes = [
  { troop: 6751, spell: 8129, from: '诅咒所有敌人。将所有绿色宝石转换成骷髅头。', to: '诅咒所有敌人。将所有绿色宝石转换成末日骷髅头。', batch: 'batch-36.ts',
    reason: 'L4b-6751-zh: English "Convert all Green Gems to Doomskulls" and native ConvertGems Color2 Doomskull; the stored Chinese snapshot drops 末日 (Doomskull). Display correction only.' },
  { troop: 7138, spell: 8687, from: '赐予一名盟友法印效果，并给予其 3 点魔力值。再创建 12 颗其发力颜色之一的宝石。', to: '赐予一名盟友法印效果，并给予其 3 点魔力值。再创建 12 颗其法力颜色之一的宝石。', batch: 'batch-r20.ts',
    reason: 'L4b-7138-zh: stored Chinese snapshot typo 发力颜色 for 法力颜色 ("one of their Mana Colors"). Display correction only.' },
  { troop: 6824, spell: 8234, from: '将选定颜色的宝石转换成棕色。使一名盟友下潜并赋予其屏障效果。', to: '将选定颜色的宝石转换成棕色。赋予一名随机盟友屏障效果并使其下潜。', batch: 'batch-14.ts',
    reason: 'L4b-6824-zh: English "Barrier and Submerge a random Ally" / native CauseBarrier RandomAlly then CauseSubmerged FromPrevious; stored Chinese says 一名盟友 (reads as a chosen ally) and reverses the order.' },
];
const ovPath = 'src/data/gowSnapshotOverrides.json';
const ov = JSON.parse(fs.readFileSync(ovPath, 'utf8'));
for (const f of fixes) {
  const cur = ov.troops[String(f.troop)];
  if (cur && cur.spellDescription && cur.spellDescription !== f.to) throw new Error(`override exists for ${f.troop}`);
  ov.troops[String(f.troop)] = { ...(cur ?? {}), spellId: f.spell, reason: f.reason, spellDescription: f.to };
  // curated desc
  const bp = `src/engine/skills/curated/${f.batch}`; let b = fs.readFileSync(bp, 'utf8');
  const q = `desc: '${f.from}',`; const n = b.split(q).length - 1;
  if (n !== 1) throw new Error(`${bp}: ${n} desc matches for ${f.spell}`);
  b = b.replace(q, `desc: '${f.to}',`); fs.writeFileSync(bp, b);
  // pool desc (if present)
  for (const pf of fs.readdirSync('scripts/curated-pools').filter(x => x.endsWith('.json'))) {
    const pp = `scripts/curated-pools/${pf}`; const t = fs.readFileSync(pp, 'utf8');
    const key = `"desc": ${JSON.stringify(f.from)}`;
    if (t.includes(key) && t.includes(`"spellId": ${f.spell},`)) { fs.writeFileSync(pp, t.split(key).join(`"desc": ${JSON.stringify(f.to)}`)); console.log(`pool ${pf} ${f.spell}`); }
  }
  console.log(`ok ${f.troop}/${f.spell}`);
}
fs.writeFileSync(ovPath, JSON.stringify(ov, null, 2) + '\n');
