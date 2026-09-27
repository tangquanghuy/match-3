// Rebuild the damage-kind ledger from preserved GoW English/native snapshots.
// The localized display text is not authoritative for light/normal/heavy splash
// or for scatter (older translations flatten the two or invent double-target hits).
// Native step spellings: SplashDamage=25%, SplashHighDamage=50%, SplashHeavyDamage=75%.
import fs from 'node:fs';
const en = JSON.parse(fs.readFileSync('data/raw/troops.gow.en.json', 'utf8')).troops;
const weapons = JSON.parse(fs.readFileSync('artifacts/gowhead-weapons/weapons.json', 'utf8')).weapons;
const nativeSpells = JSON.parse(fs.readFileSync('data/raw/spells.gow.en.json', 'utf8')).spells;
const sources = new Map(weapons.map(w => [w.SpellId, w.stats?.spell?.desc]));
for (const t of en) if (t.stats?.spell) sources.set(t.stats.spell.id, t.stats.spell.desc);
const native = new Map(nativeSpells.filter(s => s.data || s.RawData).map(s => [s.Id, JSON.parse(s.RawData || s.data)]));
const tiers = {SplashDamage:0.25, SplashHighDamage:0.5, SplashHeavyDamage:0.75,
  TrueSplashDamage:0.25, TrueSplashHighDamage:0.5, TrueSplashHeavyDamage:0.75};
const result = {};
const needsReview = [];
for (const [id, text] of [...sources].sort((a,b)=>a[0]-b[0])) {
  if (typeof text !== 'string') continue;
  const steps = native.get(id)?.SpellSteps ?? [];
  const splash = steps.filter(s => Object.hasOwn(tiers,s.Type)).map(s=>tiers[s.Type]);
  const scatter = steps.some(s => s.Type === 'ScatterDamage' || s.Type === 'TrueScatterDamage');
  if (splash.length && scatter) throw new Error(`Mixed scatter and splash steps require per-segment review: ${id}`);
  if (splash.length) { result[id] = { splash }; continue; }
  if (scatter) { result[id] = { scatter: true }; continue; }
  // Keep English-only records visible rather than accepting localized spellings.
  if (/\bsplash\b|\bscatter\b/i.test(text)) needsReview.push(id);
}
// 7563 has English 'splash' but the stored native data says two direct hits;
// preserve its historical text-ledger correction pending an entity-level review.
const previous = JSON.parse(fs.readFileSync('src/data/gowDamageRules.json','utf8'));
for (const id of needsReview) if (previous[id]) result[id] = previous[id];
fs.writeFileSync('src/data/gowDamageRules.json', JSON.stringify(result, null, 2)+'\n');
console.log(`Damage-kind ledger: ${Object.keys(result).length} spells; ${needsReview.length} source conflicts pending review (${needsReview.join(', ')})`);
