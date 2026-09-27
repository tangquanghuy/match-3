/**
 * Deterministic lane assignment for parallel GoW skill review.
 * Each unaccepted original entity goes to exactly one lane by the highest-risk native step it contains
 * (first matching rule wins). Within a lane, entities are ordered by native step shape so isomorphic
 * skills sit together and tests/fixtures can be reused. Lanes are a dispatch aid only; acceptance
 * still comes exclusively from the ledger.
 *
 *   node scripts/gow-review-lanes.mjs           # write tasks/active/gow-skill-shards/lanes.json
 *   node scripts/gow-review-lanes.mjs --check   # print sizes only, no write
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
const ledger = read('artifacts/gow-skill-audit/ledger.json');
const manifest = read('tasks/active/gow-skill-shards/manifest.json');
const shardOf = new Map(manifest.shards.flatMap(s => s.members.map(m => [m.key, s.id])));

// Order matters: an entity lands in the first lane whose rule matches any of its native steps.
export const LANES = [
  { id: 'L1', name: '身份／召唤／变形／吞噬／逃跑', test: t => /^(Summoning|Transform|Consume|RunAway|Charm|CauseLycanthropy|CauseMirror|SwapFirstLast)/.test(t) },
  { id: 'L2', name: '随机分支／随机状态', test: (t, r) => !!r.source.native?.Randomize || /^(Random.*StatusEffect|InflictEffectOnRandomTroops|StealRandomStat|IncreaseRandom|DecreaseRandom)/.test(t) },
  // Delay/DelayUntilEffectsComplete are sequencing steps; they are reviewed inside whichever lane owns the skill.
  { id: 'L3', name: '回合／法力', test: t => /^(ExtraTurn|Generate.*Mana|DecreaseMana|StealMana|ManaBurn|DisableMySpell|ResetTargets|CountDrainableMana|CountMana|CountEnemiesFullMana)/.test(t) },
  { id: 'L4a', name: '棋盘：爆破／摧毁／风暴／移除', test: t => /^(Explode|Destroy|RemoveColor|RemoveGems|Storm|RemoveStorm|JumbleBoard)/.test(t) },
  { id: 'L4b', name: '棋盘：创造／转换', test: t => /^(Create|Convert)/.test(t) },
  { id: 'L5', name: '状态施加／净化／驱散', test: t => /^(Cause|Cleanse|Dispel|CountSpecificStatusEffect|CountStatusEffects)/.test(t) },
  { id: 'L6', name: '属性／经济／站位／治疗', test: t => /^(Increase|Decrease|Steal(Attack|Armor|Magic)|Give|Take|TroopOrder|Heal)/.test(t) },
  { id: 'L7', name: '纯伤害（含计数加成／溅射／散射／即杀）', test: () => true },
];

const pending = ledger.rows.filter(r => r.status !== 'custom-excluded' && r.acceptance?.accepted !== true);
const lanes = LANES.map(l => ({ id: l.id, name: l.name, entities: [] }));
for (const row of pending) {
  const steps = (row.source.native?.SpellSteps ?? []).filter(s => s.Type !== 'None');
  const types = steps.map(s => s.Type);
  const i = LANES.findIndex(l => types.some(t => l.test(t, row)) || (l.id === 'L2' && l.test('', row)));
  lanes[i].entities.push({
    key: row.key, spellId: row.spellId, shard: shardOf.get(row.key) ?? null,
    shape: types.join(' → '), confirmedDifferences: row.confirmedDifferences.length,
    hasDraftReview: !!row.wholeSkillReview,
  });
}
for (const lane of lanes) {
  // Known differences and existing drafts first (cheapest to close / highest value), then by shape.
  lane.entities.sort((a, b) => (b.confirmedDifferences - a.confirmedDifferences) || (Number(b.hasDraftReview) - Number(a.hasDraftReview))
    || a.shape.localeCompare(b.shape) || a.key.localeCompare(b.key));
  lane.size = lane.entities.length;
  lane.shapes = new Set(lane.entities.map(e => e.shape)).size;
}
const out = { schemaVersion: 1, generatedAt: new Date().toISOString(), ledgerFingerprint: ledger.fingerprint,
  pending: pending.length, rule: 'first-matching-lane by native step type; ordered by differences, drafts, shape, key', lanes };
for (const l of lanes) console.log(`${l.id} ${l.name}: ${l.size} entities, ${l.shapes} shapes`);
if (!process.argv.includes('--check'))
  fs.writeFileSync(path.join(root, 'tasks/active/gow-skill-shards/lanes.json'), JSON.stringify(out, null, 2) + '\n');
