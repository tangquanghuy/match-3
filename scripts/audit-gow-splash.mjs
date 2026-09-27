/** Reproducible subtype audit. Run: node scripts/audit-gow-splash.mjs */
import fs from 'node:fs';
import { build } from 'esbuild';
const read = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const bundle = await build({ stdin: { contents: `import {SKILL_LIBRARY} from './src/engine/skills/library';import {TROOPS} from './src/data/troops';export default {lib:SKILL_LIBRARY,troops:TROOPS};`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false, loader: { '.png': 'empty', '.webp': 'empty' } });
const { default: runtime } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const original = read('data/raw/troops.gow.en.json');
const native = new Map(read('data/raw/spells.gow.en.json').spells.filter(s => s.RawData).map(s => [s.Id, JSON.parse(s.RawData)]));
const flat = ss => ss.flatMap(s => s.kind === 'oneOf' ? s.options.flatMap(flat) : [s]);
const nativeRatio = s => /Heavy/.test(s.Type) ? .75 : /High/.test(s.Type) ? .5 : .25;
const unique = xs => [...new Set(xs)].sort();
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const label = n => n === .25 ? '轻度 25%' : n === .75 ? '重度 75%' : '普通 50%';
const rows = [];
for (const t of original.troops) {
  const spellId = t.stats.spell.id, sourceEnglish = t.stats.spell.desc;
  const nativeSteps = (native.get(spellId)?.SpellSteps ?? []).filter(s => /Splash/.test(s.Type));
  if (!/splash/i.test(sourceEnglish) && !nativeSteps.length) continue;
  const troop = runtime.troops.find(x => x.id === t.id), prototype = runtime.lib[spellId];
  const englishRatios = [...sourceEnglish.matchAll(/(?:(light|heavy)\s+)?splash/gi)].map(m => /light/i.test(m[1] ?? '') ? .25 : /heavy/i.test(m[1] ?? '') ? .75 : .5);
  const expectedRatios = nativeSteps.length ? nativeSteps.map(nativeRatio) : englishRatios;
  const segments = prototype ? flat(prototype.segments).filter(s => s.kind === 'damage' && s.range === 'splash') : [];
  const actualRatios = segments.map(s => s.splashRatio ?? .5);
  const displayed = troop?.spell.description;
  const displayedRatios = [...(displayed ?? '').matchAll(/(?:(轻度|重度)(?:真实)?|真实(轻度|重度))?溅射/g)].map(m => (m[1] ?? m[2]) === '轻度' ? .25 : (m[1] ?? m[2]) === '重度' ? .75 : .5);
  const mechanicsMatch = same(unique(expectedRatios), unique(actualRatios)) && (unique(expectedRatios).length <= 1 || same(expectedRatios, actualRatios))
    && (!nativeSteps.length || segments.every(s => !!s.trueDamage === /^True/.test(nativeSteps[0].Type)));
  const textMatch = same(unique(expectedRatios), unique(displayedRatios)) && !/光轻度|轻量轻度|轻度轻度|重度重度/.test(displayed ?? '');
  rows.push({ troopId: t.id, name: troop?.name ?? t.name_localized, spellId, installed: !!troop, sourceEnglish, sourceNative: nativeSteps,
    expectedRatios, actualSegments: segments, displayed, sourceDisagreement: !same(unique(englishRatios), unique(expectedRatios)),
    result: !troop ? 'not-installed' : mechanicsMatch && textMatch ? 'pass' : 'fail' });
}
const installed = rows.filter(r => r.installed);
const summary = { sourceTroops: rows.length, installedTroops: installed.length, installedSpells: new Set(installed.map(r => r.spellId)).size,
  withNativeSteps: installed.filter(r => r.sourceNative.length).length, passed: installed.filter(r => r.result === 'pass').length,
  failed: installed.filter(r => r.result === 'fail').length,
  light: installed.filter(r => r.expectedRatios.includes(.25)).length,
  normal: installed.filter(r => r.expectedRatios.includes(.5)).length,
  heavy: installed.filter(r => r.expectedRatios.includes(.75)).length };
const mistralus = runtime.lib[8294].segments.find(s => s.kind === 'damage');
const nativeChances = native.get(8294).SpellSteps.filter(s => /Splash/.test(s.Type)).map(s => (s.PercentageChance ?? 100) / 100);
const differenceChecks = [
  { spellId: 8294, name: '迷特露斯', check: '原始步骤的独立溅射概率', passed: same(mistralus.splashChances, nativeChances) && !mistralus.nRange },
  { spellId: 7243, name: '哥布林火箭', check: '随机敌人和随机文案', passed: runtime.lib[7243].segments.find(s => s.kind === 'damage')?.target === 'enemyRandom' && runtime.troops.find(t => t.spell.id === 7243).spell.description.includes('随机敌人') },
  { spellId: 7132, name: '犀首兽', check: '选定敌人', passed: runtime.lib[7132].segments.find(s => s.kind === 'damage')?.target === 'enemyChosen' },
];
summary.knownDifferencesPassed = differenceChecks.filter(c => c.passed).length;
summary.knownDifferencesFailed = differenceChecks.filter(c => !c.passed).length;
const scope = '原版已实装部队的溅射档位、真实伤害标记和运行时图鉴文案，以及前轮列明的三个概率/选目标差异；不等同全体技能所有附加效果的全面验收。';
fs.mkdirSync('artifacts/troop-audit', { recursive: true });
fs.writeFileSync('artifacts/troop-audit/gow-splash-audit.json', JSON.stringify({ generatedAt: new Date().toISOString(), scope, summary, differenceChecks, rows }, null, 2) + '\n');
const md = [
  '# GoW 溅射档位恢复核对', '', `范围：${scope}`, '',
  '## 结论', '',
  `- 原始资料包含 ${rows.length} 个溅射单位；项目已实装 ${installed.length} 个，档位与文案检查 ${summary.passed} 个通过、${summary.failed} 个失败。`,
  `- 轻度 ${summary.light} 个，普通 ${summary.normal} 个，重度 ${summary.heavy} 个。黑曜魔头同时包含轻度和重度，因此分类合计比单位数多 1。`,
  '- 主目标均承受完整伤害；相邻目标分别按 25% / 50% / 75% 计算。这里的比例是减伤前的基础规则。',
  '- 叶落是自设普通溅射单位，不计入原版 64 个。Elemaris（10059）、Vulcanus（10016）尚未接入目录，不计入已实装数。武器不属于本报告范围。', '',
  '## 证据来源与优先级', '',
  '- 官方人员 Kafka 对重度溅射 75% 的说明：https://community.gemsofwar.com/t/fixed-in-4-3-5-obsidius-spell-info/54737/5 。本轮已直接读取论坛 JSON 核对，缓存位于 tmp/gow-forum-54737.json。',
  '- 单位明细使用仓库保存的 GoW 英文描述、原始 SpellSteps：data/raw/troops.gow.en.json、data/raw/spells.gow.en.json。其采集站是 gowhead.com；这是版本快照，不冒充官方实时 API。',
  `- 已实装单位中 ${summary.withNativeSteps} 个具有可对照的原始溅射步骤，其余 ${installed.length - summary.withNativeSteps} 个以英文描述确定档位。`,
  '- 原始步骤映射：SplashDamage=轻度，SplashHighDamage=普通，SplashHeavyDamage=重度；True 前缀表示真实伤害。',
  '- 唯一档位来源冲突：机械牛怪（8485）的英文描述省略 light，但原始步骤为 SplashDamage。本次优先依据技能步骤，修复成轻度 25%，文案同步；若后续原始数据更新，重新复核。', '',
  '## 本轮补漏', '',
  '- 哈喇子（8819）：补回「真实溅射伤害」。',
  '- 纳亚梅尔（8494）：替换丢失伤害类型的误译，明确「真实重度溅射伤害」，保留石块增强、爆破与创造效果。',
  '- 不朽的克维尔杜尔夫（9933）、永生神卡普里乔尔（9372）：清除「光轻度」「轻量轻度」错误拼接。',
  '- 冰尖塔萨满（8656）：把「随机盟友」误译修正为「随机敌人」。',
  '- 监视者等真实溅射文案统一词序，重复经过显示转换也不会再次变化。', '',
  '## 前轮发现的三个差异：已修复', '',
  '- 迷特露斯（8294）：取消均匀抽取 1–4 段，按原始步骤恢复为首段必定、额外三段分别独立判定 90% / 35% / 25%。某段未触发不阻止后续段。保留普通溅射、动态选择存活目标、打乱棋盘与额外回合。',
  '- 哥布林火箭（7243）：保留选宝石爆破，伤害中心改为随机敌人；不再要求选择敌人。图鉴同步注明随机，保留轻度溅射和额外回合。',
  '- 犀首兽（7132）：解除固定攻击首位，接回玩家/AI 选目标管线；按选中的敌人结算普通溅射。',
  `- 配置检查：${summary.knownDifferencesPassed}/3 通过；实际施法、概率组合、阈值、阵亡重选、最后一个敌人、洗牌与额外回合由 tests/unit/gowSplashDifferences.test.ts 回归验证。`,
  '- 上述三项已从待处理差异中移除；本报告仍不对所有部队的全部附带状态等效果出具一致性结论。', '',
  '## 全量核对表', '', '| 部队 | 技能 ID | 档位（相邻伤害） | 原始步骤依据 | 结果 |', '|---|---:|---|---|---|',
  ...rows.map(r => `| ${r.name} | ${r.spellId} | ${unique(r.expectedRatios).map(label).join('、')} | ${r.sourceNative.length ? '有' : '英文描述'}${r.sourceDisagreement ? '；英文有冲突' : ''} | ${r.result === 'pass' ? '通过' : r.result === 'not-installed' ? '未实装' : '待修复'} |`), '',
  '## 复跑', '', '```powershell', 'node scripts/build-damage-rules.mjs', 'node scripts/audit-gow-splash.mjs', 'npx vitest run tests/unit/gowSplashCatalogAudit.test.ts tests/unit/gowDamageRules.test.ts tests/unit/combatTextLedger.test.ts tests/unit/gowSplashDifferences.test.ts', '```', '',
  '完整英文、原始步骤、最终原型、显示文本：artifacts/troop-audit/gow-splash-audit.json。'
];
fs.writeFileSync('docs/gow-splash-troop-audit.md', md.join('\n') + '\n');
console.log(JSON.stringify(summary, null, 2));
if (summary.failed || summary.knownDifferencesFailed) process.exitCode = 1;
