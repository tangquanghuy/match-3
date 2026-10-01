/**
 * Batch real-cast trace of every original skill + mechanical hints against the native SpellSteps.
 *   npx vite-node scripts/gow-trace.ts [--keys k1,k2] [--lane L4a]
 * Output:
 *   artifacts/gow-skill-audit/trace/trace.json            all entities, all scenarios, hints
 *   tasks/active/gow-skill-shards/trace/<lane>.md         pending entities per lane: English | native | observed | hints
 * Scenarios (tests/helpers/gowCast.ts defaults: 6-colour board, 3 allies, 4 enemies with distinct Life/Armor):
 *   L10 = left side Magic 10, R10 = right side Magic 10 (must mirror L10), L0 = left side Magic 0.
 * Hints are leads, not verdicts: conditional/random steps may legitimately not fire in the default scenario.
 */
import fs from 'node:fs';
import path from 'node:path';
import { castSpell, entitySkill, registry, summaryLine, SCENARIOS, type CastSummary } from '../tests/helpers/gowCast';

const root = process.cwd();
const args = process.argv.slice(2);
const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i < 0 ? null : args[i + 1]; };
const read = <T>(p: string): T => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8')) as T;
const ledger = read<{ fingerprint: string; rows: LedgerRow[] }>('artifacts/gow-skill-audit/ledger.json');
const lanes = read<{ lanes: { id: string; name: string; entities: { key: string }[] }[] }>('tasks/active/gow-skill-shards/lanes.json').lanes;
const laneOf = new Map(lanes.flatMap(l => l.entities.map(e => [e.key, l.id] as const)));

type Step = Record<string, unknown> & { Type: string };
interface LedgerRow {
  key: string;
  status: string;
  referenceName: string;
  spellId: string | number;
  acceptance?: { accepted?: boolean };
  source: { englishDescription?: string; native?: { SpellSteps?: Step[]; Randomize?: unknown } };
}
interface TraceRecord {
  key: string;
  name: string;
  spellId: string | number;
  lane: string | null;
  accepted: boolean;
  hints: string[];
  notes?: string[];
  skill?: ReturnType<typeof entitySkill>['skill'];
  lines?: Record<string, string>;
  error?: string;
}
const catOfStep = (t: string): string | null => {
  if (/^(Count|Delay|ResetTargets|DisableMySpell|None)/.test(t)) return null;
  if (/^Consume/.test(t)) return 'devour';
  if (/Damage|StealLife|ManaBurn|Lethal/.test(t)) return 'dmg';
  if (/^(Cause|InflictEffect|Random\w*StatusEffect|Charm)/.test(t)) return 'status';
  if (/^(Cleanse|Dispel)/.test(t)) return 'cleanse';
  if (/^(Create|Convert)/.test(t)) return 'gems';
  if (/^(Destroy|Explode|RemoveColor|RemoveGems|JumbleBoard)/.test(t)) return 'gemclear';
  if (/^(Storm|RemoveStorm)/.test(t)) return 'storm';
  if (/^Summon/.test(t)) return 'summon';
  if (/^Transform/.test(t)) return 'transform';
  if (/^(TroopOrder|SwapFirstLast)/.test(t)) return 'move';
  if (/^(Give|Take)(Gold|Souls|TreasureMaps|EnemyGold|MyGold)/.test(t)) return 'economy';
  if (/^ExtraTurn/.test(t)) return 'extra';
  if (/^RunAway/.test(t)) return 'flee';
  if (/^(Increase|Decrease|Steal|Heal|Generate)/.test(t)) return 'buff';
  return 'other';
};
const catOfObserved = (line: string): string | null => {
  const w = line.split(' ')[0];
  if (w === 'dmg') return line.includes('devoured') ? 'devour' : 'dmg';
  return ({ status: 'status', cleanse: 'cleanse', buff: 'buff', create: 'gems', convert: 'gems', destroy: 'gemclear', explode: 'gemclear', storm: 'storm',
    summon: 'summon', transform: 'transform', move: 'move', shuffle: 'move', 'extra-turn': line.endsWith('skill') ? 'extra' : null, flee: 'flee',
    jumble: 'gemclear', remove: 'cleanse',
    defeat: null, trigger: null, skulls: null, '~cascade~': null } as Record<string, string | null>)[w]
    ?? (/^(gold|souls|gems|maps)\+/.test(line) ? 'economy' : null);
};
const collapse = (xs: string[]) => xs.filter((x, i) => x !== xs[i - 1]);
const isSubsequence = (a: string[], b: string[]) => { let i = 0; for (const x of b) if (x === a[i]) i++; return i === a.length; };

const BASE_GEM = /^(Red|Blue|Green|Yellow|Purple|Brown|Skull|FromTarget|Random|Any)?$/i;
/** kill: fires only when the target dies (checked in scenario K); cond: other runtime condition/chance (not checked). */
function stepKind(x: Step): 'always' | 'kill' | 'cond' {
  const mod = String(x.StatusModifier ?? '');
  if (/Kill|Dies|Death/i.test(mod)) return 'kill';
  if (/Conditional$/.test(x.Type) || typeof x.PercentageChance === 'number' || typeof x.Chance === 'number') return 'cond';
  if (mod && !x.Amount) return 'cond'; // effect only from the status modifier (If X / For each Y)
  if (x.UseCounterForAmount && !x.Amount) return 'cond'; // "N for each X": zero when the counted thing is absent
  if (!BASE_GEM.test(String(x.Color1 ?? '')) && /Gems|Color/.test(x.Type)) return 'cond'; // special gem kind absent from default board
  if (x.Target && /Type$|Kingdom$|Troop$/.test(String(x.Target)) && x.Data) return 'cond'; // AllyType/AllyKingdom filter
  return 'always';
}
function hints(row: LedgerRow, s: Record<string, CastSummary>, sameProto: boolean | null): { hints: string[]; notes: string[] } {
  const h: string[] = [], notes: string[] = [];
  const steps = ((row.source.native?.SpellSteps ?? []) as Step[]).filter(x => x.Type !== 'None');
  const random = !!row.source.native?.Randomize;
  if (s.L10.refused) h.push('REFUSED with full mana');
  else if (!s.L10.order.length) h.push('no spell events');
  if (summaryLine(s.L10) !== summaryLine(s.R10)) h.push('left/right differ');
  if (sameProto === false) h.push('gw_ key and numeric spell id have different prototypes');
  const cats = (sum: CastSummary) => [...collapse(sum.order.map(catOfObserved).filter((c): c is string => !!c)), ...(Object.keys(sum.economy).length ? ['economy'] : [])];
  const got = cats(s.L10), gotK = cats(s.K);
  const cut = s.L10.order.indexOf('~cascade~');
  const gotSpell = collapse((cut < 0 ? s.L10.order : s.L10.order.slice(0, cut)).map(catOfObserved).filter((c): c is string => !!c));
  const always = [...new Set(steps.filter(x => stepKind(x) === 'always').map(x => catOfStep(x.Type)).filter((c): c is string => !!c))];
  const kill = [...new Set(steps.filter(x => stepKind(x) === 'kill').map(x => catOfStep(x.Type)).filter((c): c is string => !!c))];
  const cond = [...new Set(steps.filter(x => stepKind(x) === 'cond').map(x => catOfStep(x.Type)).filter((c): c is string => !!c))];
  const missing = always.filter(c => !got.includes(c) && !(c === 'buff' && got.includes('dmg')));
  if (missing.length) (random ? notes : h).push(`missing ${missing.join(',')}${random ? ' (random branch not taken)' : ''}`);
  const missingKill = kill.filter(c => !gotK.includes(c));
  if (missingKill.length) h.push(`on kill missing ${missingKill.join(',')}`);
  if (cond.length) notes.push(`conditional not exercised: ${cond.filter(c => !got.includes(c)).join(',') || '-'}`);
  const want = collapse(steps.map(x => catOfStep(x.Type)).filter((c): c is string => !!c));
  // Side effects that are rules, not extra steps: steal/devour gains, Curse/Blessed stripping statuses, special gems created by the spell triggering.
  const extra = [...new Set(gotSpell)].filter(c => !want.includes(c) && !(c === 'buff' && (want.includes('dmg') || want.includes('devour')))
    && !(c === 'cleanse' && want.includes('status')) && !(c === 'gemclear' && want.includes('gems')) && !(c === 'status' && want.includes('gems')));
  if (extra.length) h.push(`unexpected ${extra.join(',')}`);
  const wantAlways = collapse(steps.filter(x => stepKind(x) === 'always').map(x => catOfStep(x.Type)).filter((c): c is string => !!c));
  if (!missing.length && !random && wantAlways.length > 1 && !isSubsequence(wantAlways, got)) h.push(`order? native ${wantAlways.join('>')} vs ${got.join('>')}`);
  if (!s.L10.refused && s.L10.order.length && summaryLine(s.L10) === summaryLine(s.L0) && steps.some(x => x.SpellPowerMultiplier && stepKind(x) === 'always') && !random)
    h.push('Magic 0 = Magic 10 despite SpellPowerMultiplier');
  return { hints: h, notes };
}

const only = opt('keys')?.split(',');
const laneFilter = opt('lane');
const rows = ledger.rows.filter((r: LedgerRow) => r.status !== 'custom-excluded' && (!only || only.includes(r.key)) && (!laneFilter || laneOf.get(r.key) === laneFilter));
const out: Record<string, TraceRecord> = {};
let n = 0;
for (const row of rows) {
  const rec: TraceRecord = { hints: [], key: row.key, name: row.referenceName, spellId: row.spellId, lane: laneOf.get(row.key) ?? null, accepted: !!row.acceptance?.accepted };
  try {
    const ent = entitySkill(row.key);
    const sameProto = ent.kind === 'weapon' ? JSON.stringify(registry.prototypes.get(ent.skill)) === JSON.stringify(registry.prototypes.get(ent.numericSkill)) : null;
    const s = Object.fromEntries(Object.entries(SCENARIOS).map(([k, o]) => [k, castSpell({ key: row.key, ...o }).summary])) as Record<keyof typeof SCENARIOS, CastSummary>;
    rec.skill = ent.skill; rec.lines = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, summaryLine(v)])); Object.assign(rec, hints(row, s, sameProto));
  } catch (e) { rec.error = String((e as Error).message ?? e).slice(0, 200); rec.hints = [`ERROR ${rec.error}`]; }
  out[row.key] = rec; if (++n % 250 === 0) console.log(`${n}/${rows.length}`);
}
const dir = path.join(root, 'artifacts/gow-skill-audit/trace'); fs.mkdirSync(dir, { recursive: true });
const tracePath = path.join(dir, 'trace.json');
const merged = only || laneFilter ? { ...(fs.existsSync(tracePath) ? read<{ entities: Record<string, TraceRecord> }>('artifacts/gow-skill-audit/trace/trace.json').entities : {}), ...out } : out;
fs.writeFileSync(tracePath, JSON.stringify({ generatedAt: new Date().toISOString(), ledgerFingerprint: ledger.fingerprint, entities: merged }, null, 1) + '\n');

const esc = (s: unknown) => String(s ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const nativeLine = (row: LedgerRow) => ((row.source.native?.SpellSteps ?? []) as Step[]).map((x, i) => ({ i, x })).filter(({ x }) => x.Type !== 'None')
  .map(({ i, x }) => `${i}:${x.Type}${x.Target ? '@' + x.Target : ''}${x.Amount !== undefined ? ' ' + x.Amount : ''}${x.SpellPowerMultiplier ? ' +M×' + x.SpellPowerMultiplier : ''}${x.Color1 ? ' ' + x.Color1 : ''}${x.Color2 ? '>' + x.Color2 : ''}${x.StatusModifier ? ' [' + x.StatusModifier + ' ' + (x.StatusAmount ?? '') + ']' : ''}`).join(' ; ');
const tdir = path.join(root, 'tasks/active/gow-skill-shards/trace'); fs.mkdirSync(tdir, { recursive: true });
const byRow = new Map(ledger.rows.map((r: LedgerRow) => [r.key, r]));
const summaryCounts: Record<string, { pending: number; flagged: number }> = {};
for (const lane of lanes) {
  const recs = lane.entities.map(e => merged[e.key]).filter(r => r && !r.accepted);
  const flagged = recs.filter(r => r.hints.length).length; summaryCounts[lane.id] = { pending: recs.length, flagged };
  const md = [`# ${lane.id} ${lane.name}：实际施放对照（${recs.length} 项待签，${flagged} 项有提示）`, '',
    '场景（tests/helpers/gowCast.ts）：六色棋盘 + 5 颗骷髅、有一步合法交换；施法者 C 生命 900/1000、中毒、魔法 10；盟友 A1（500/700 护甲 4 蓝 中毒）、A2（650 护甲 8 红黄），队伍留一个空位；',
    '敌人 E10 600/护甲5 红 狂怒、E11 900/10 黄蓝、E12 300/12 紫、E13 800/3 绿棕 狂怒（生命/护甲，均有法力），双方各 100 金币。选中目标默认 E11（选盟友时 A1），选色 Blue，选格 3,3。',
    '`L10` 左方魔法 10；`K` 为击杀场景（所有敌人 1 血）；右方镜像 R10 与魔法 0 的 L0 在 trace.json 与 `gow-golden.ts show`。',
    '**提示只是线索**：没有提示不代表数值正确。“按盟友种族/颜色/王国增强”在默认场景里计数多为 0，需要手写用例验证加成。', '',
    '| key | 名称 | 英文 | 原生步骤 | 实际（L10） | 击杀场景 K | 提示 |', '|---|---|---|---|---|---|---|',
    ...recs.map(r => { const row = byRow.get(r.key)!; return `| ${r.key} | ${esc(r.name)} | ${esc(row.source.englishDescription)} | ${esc(nativeLine(row))}${row.source.native?.Randomize ? ' {Randomize ' + row.source.native.Randomize + '}' : ''} | ${esc(r.lines?.L10 ?? r.error)} | ${esc(r.lines?.K)} | ${esc([...r.hints.map((x: string) => '**' + x + '**'), ...(r.notes ?? [])].join('; '))} |`; }), ''];
  fs.writeFileSync(path.join(tdir, `${lane.id}.md`), md.join('\n'));
}
const allRecs = Object.values(merged);
const tally: Record<string, number> = {};
for (const r of allRecs.filter(r => !r.accepted)) for (const h of r.hints) { const k = h.replace(/ native .*/, '').replace(/ERROR .*/, 'ERROR').replace(/missing .*/, m => m.includes('(cond)') && !/missing [^,]*[a-z](,|$)(?<!\(cond\))/.test(m) ? 'missing (cond only)' : 'missing'); tally[k] = (tally[k] ?? 0) + 1; }
console.log(JSON.stringify({ traced: rows.length, lanes: summaryCounts, hintTally: tally }, null, 1));
