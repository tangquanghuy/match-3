import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

// Audit final executable prototypes; no description parsing and no per-troop recipes.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'data/audits/st-enemy-skill-distribution-20261025.json');
const reportPath = path.join(root, 'docs/sillytavern-enemy-skill-distribution-20261025.md');
const bundle = await build({ stdin: { contents: `
import {TROOPS,SOURCE_TROOPS} from './src/data/troops';
import {SKILL_LIBRARY} from './src/engine/skills/library';
import {PORTRAITS} from './src/sillytavern/portraits';
import {adaptedPrototype} from './src/sillytavern/enemyBlueprint';
export default TROOPS.map(t=>({...t,rank:PORTRAITS.find(p=>p.troopId===t.id)?.rank??null,
 sourceDescription:SOURCE_TROOPS.find(s=>s.id===t.id)?.spell.description,
 native:SKILL_LIBRARY[t.spell.id]??null,adapted:adaptedPrototype(t.spell.id)}));
`, resolveDir: root, loader: 'ts' }, bundle: true, platform: 'node', format: 'esm', write: false,
  loader: { '.png': 'empty', '.webp': 'empty' },
  define: { 'import.meta.env.BASE_URL': '"/"', 'import.meta.env.DEV': 'false' } });
const { default: rows } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
function assert(test, message) { if (!test) throw new Error(message); }
function nodes(value) {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object') return [];
  return [value, ...Object.values(value).flatMap(nodes)];
}
function segments(list) { return list.flatMap(s => [s, ...(s.options ?? []).flatMap(segments)]); }
// Branch wrappers do not count as effects. Mutually exclusive paths stay separate.
function paths(list) {
  return list.reduce((current, s) => {
    const wrapper = s.kind === 'oneOf' || s.kind === 'choose';
    let next = wrapper ? s.options.flatMap(paths) : [[s]];
    if (wrapper && !unconditional(s)) {
      next = [...next.map(p=>p.map(leaf=>({...leaf,auditAncestorGate:true}))), []];
    }
    return current.flatMap(a => next.map(b => [...a, ...b]));
  }, [[]]);
}
const positive = new Set(['barrier', 'blessed', 'enraged', 'enchant', 'enchanted', 'reflect', 'submerged', 'rage']);
const control = new Set(['silence', 'frozen', 'freeze', 'entangle', 'stun', 'web']);
const knownKinds = new Set(['damage','gem','status','buff','reduce','extraTurn','summon','dispel','oneOf','choose',
  'gainEconomy','reposition','devour','storm','randomStatus','cleanse','transformTroop','randomStat','sacrifice',
  'escapeChance','shuffleTeam','shuffleBoard','stealGold','summonCopy','spendEconomy','swapPositions']);
function family(s) {
  assert(knownKinds.has(s.kind), `Unknown segment ${s.kind}`);
  if (s.kind === 'damage') return 'damage'; // True damage and execute are profiles, not extra damage keys.
  if (s.kind === 'gem') return `gem:${s.params.op === 'clear' ? s.params.mode : s.params.op}`;
  if (s.kind === 'buff') return `buff:${s.stat === 'hp' ? (s.lifeMode === 'heal' ? 'heal' : 'life') : s.stat === 'mana' ? 'mana' : 'attribute'}`;
  if (s.kind === 'status') return positive.has(s.statusId) ? 'positiveStatus' : control.has(s.statusId) ? 'control' : 'otherStatus';
  if (['reposition','shuffleTeam','swapPositions'].includes(s.kind)) return 'position';
  if (['gainEconomy','spendEconomy','stealGold'].includes(s.kind)) return 'economy';
  if (s.kind === 'summonCopy') return 'summon';
  if (s.kind === 'randomStat') return 'buff:attribute';
  return s.kind;
}
function direct(s) { return s.kind === 'damage' && (s.target.startsWith('enemy') || s.target.startsWith('last')); }
const multiTargets = new Set(['enemyFirstN','enemyLastN','enemyRandomN','enemyWeakestN','enemyHealthiestN',
  'enemyChosenAndBelow','enemyChosenAndNextDown','enemyAboveTarget','enemyBelowTarget','enemyChosenAndAdjacent','enemyAllOther']);
function shape(s) {
  const range = s.range ?? (s.target==='enemyAll'||multiTargets.has(s.target) ? 'all' : 'single');
  if (range === 'scatter') return 'scatter';
  if (range === 'splash') return 'splash';
  if (s.split !== undefined) return 'split';
  if (s.target==='enemyRandomN'&&(s.randomWaves??1)>1) return 'randomWaves';
  if (range === 'all') {
    if (s.target === 'enemyAll') return 'all';
    if (multiTargets.has(s.target)||['lastTargets','lastDamaged'].includes(s.target)) return 'multi';
  }
  return 'single';
}
function unconditional(s) { return !s.auditAncestorGate && !s.ifCond && !s.ifTargetDied && !s.chanceBoost && (s.chance === undefined || s.chance >= 1); }
function quantile(values, p) { const v = [...values].sort((a,b)=>a-b); return v.length ? v[Math.floor((v.length-1)*p)] : null; }
function summary(values) { return { min: Math.min(...values), p25: quantile(values,.25), median: quantile(values,.5), p75: quantile(values,.75), p90: quantile(values,.9), max: Math.max(...values) }; }
function count(values) { return Object.fromEntries([...new Set(values)].sort().map(k => [k, values.filter(v=>v===k).length])); }
function rate(n, total) { return +(100*n/total).toFixed(2); }
const gemOperation = (s, op) => s.kind === 'gem' && (op === 'explode'
  ? s.params.op === 'clear' && s.params.mode === 'explode' : s.params.op === op);
// Same-path presence excludes mutually exclusive options; gates/targets can still prevent co-execution.
const resourceOperation = s => s.kind === 'gem' || (s.kind === 'buff' && s.stat === 'mana');
function metric(row, key) {
  const proto = row[key]; assert(proto && Array.isArray(proto.segments), `Missing ${key} ${row.id}`);
  const ss = segments(proto.segments).filter(s=>!['choose','oneOf'].includes(s.kind));
  const ps = paths(proto.segments);
  assert(ps.length>0 && ps.length<10000, `Invalid path count ${row.id}`);
  const ds = ss.filter(direct);
  return { id: row.id, spellId: row.spell.id, name:row.name, rarity:row.rarity, rarityIdx:row.rarityIdx, rank:row.rank, role:row.role, manaCost:row.manaCost,
    directDamage:ds.length>0,
    damageWithCreate:ps.some(p=>p.some(direct)&&p.some(s=>gemOperation(s,'create'))),
    damageWithConvert:ps.some(p=>p.some(direct)&&p.some(s=>gemOperation(s,'transform'))),
    damageWithExplode:ps.some(p=>p.some(direct)&&p.some(s=>gemOperation(s,'explode'))),
    damageWithResourceOperation:ps.some(p=>p.some(direct)&&p.some(resourceOperation)),
    damageInEveryBranch:ps.every(p=>p.some(direct)),
    unconditionalDamageInEveryBranch:ps.every(p=>p.some(s=>direct(s)&&unconditional(s))),
    damageShapes:[...new Set(ds.map(shape))], trueDamage:ds.some(s=>s.trueDamage), execute:ds.some(s=>s.execute),
    devour:ss.some(s=>s.kind==='devour'), enemyDevour:ss.some(s=>s.kind==='devour'&&(s.target.startsWith('enemy')||s.target==='lastTarget')), allyDevour:ss.some(s=>s.kind==='devour'&&s.target.startsWith('ally')), extraTurn:ss.some(s=>s.kind==='extraTurn'),
    unconditionalExtraTurn:ps.every(p=>p.some(s=>s.kind==='extraTurn'&&unconditional(s))),
    summon:ss.some(s=>['summon','summonCopy'].includes(s.kind)), transform:ss.some(s=>s.kind==='transformTroop'),
    branchCount:ps.length, conditionalSegments:ss.filter(s=>!unconditional(s)).length,
    maxPathSegments:Math.max(...ps.map(p=>p.length)), maxPathFamilies:Math.max(...ps.map(p=>new Set(p.map(family)).size)),
    familyUnion:[...new Set(ss.map(family))],
    scopedSource:/晋升|淘宝模式|魔头/.test(row.sourceDescription??''),
  };
}
function aggregate(ms) {
  const flags=['directDamage','damageWithCreate','damageWithConvert','damageWithExplode','damageWithResourceOperation','damageInEveryBranch','unconditionalDamageInEveryBranch','devour','enemyDevour','allyDevour','extraTurn','unconditionalExtraTurn','summon','transform','trueDamage','execute','scopedSource'];
  return { n:ms.length, ...Object.fromEntries(flags.map(k=>[k,{n:ms.filter(m=>m[k]).length,pct:rate(ms.filter(m=>m[k]).length,ms.length)}])),
    manaCost:summary(ms.map(m=>m.manaCost)), maxPathSegments:summary(ms.map(m=>m.maxPathSegments)),
    maxPathFamilies:summary(ms.map(m=>m.maxPathFamilies)),
    familyCountDistribution:count(ms.map(m=>String(m.maxPathFamilies))),
    damageShapes:Object.fromEntries(['single','all','splash','scatter','split','randomWaves','multi'].map(k=>[k,ms.filter(m=>m.damageShapes.includes(k)).length])),
    familyIncidence:Object.fromEntries([...new Set(ms.flatMap(m=>m.familyUnion))].sort().map(k=>[k,ms.filter(m=>m.familyUnion.includes(k)).length])),
  };
}
function group(ms, key) { return Object.fromEntries([...new Set(ms.map(m=>m[key]??'未映射'))].sort().map(k=>[k,aggregate(ms.filter(m=>(m[key]??'未映射')===k))])); }
const native = rows.map(r=>metric(r,'native')), adapted = rows.map(r=>metric(r,'adapted'));
const unique = [...new Map(native.map(r=>[r.spellId,r])).values()];
const costBand = c=>c<=10?'01-10':c<=14?'11-14':c<=18?'15-18':c<=24?'19-24':'25+';
function profiles(key) {
  const entries = rows.flatMap(r=>segments(r[key].segments).filter(s=>!['choose','oneOf'].includes(s.kind)).map(s=>({r,s})));
  const damage=entries.filter(({s})=>direct(s));
  const standardDamage=damage.filter(({s})=>!s.execute&&!s.rangeSpec);
  const rangeDamage=damage.filter(({s})=>!s.execute&&s.rangeSpec);
  const executeDamage=damage.filter(({s})=>s.execute);
  const dist=f=>count(damage.map(({r,s})=>String(f(r,s))));
  const gems=entries.filter(({s})=>s.kind==='gem');
  const explode=gems.filter(({s})=>s.params.op==='clear'&&s.params.mode==='explode');
  const create=gems.filter(({s})=>s.params.op==='create');
  const convert=gems.filter(({s})=>s.params.op==='transform');
  const summon=entries.filter(({s})=>s.kind==='summon');
  const modifiers=damage.flatMap(({r,s})=>[s.modifier,...(s.modifiers??[])].filter(Boolean).flatMap(m=>(m.sourceGroups?.flat() ?? m.sources ?? [m.source]).filter(Boolean).map(source=>({id:r.id,source,mod:m.mod}))));
  const formulaExample=(id)=>{const r=rows.find(r=>r.id===id);return {id,name:r.name,rarity:r.rarity,rank:r.rank,role:r.role,cost:r.manaCost,description:r.spell.description,segments:r[key].segments};};
  const formulaGroups = {};
  for (const [label,filter] of Object.entries({byRarity:r=>r.rarity,byRole:r=>r.role,byCost:r=>costBand(r.manaCost),byShape:(_r,s)=>shape(s)})) {
    formulaGroups[label]={};
    for(const {r,s} of standardDamage){const k=filter(r,s);(formulaGroups[label][k]??=[]).push(s);}
    for(const [k,ss]of Object.entries(formulaGroups[label]))formulaGroups[label][k]={segments:ss.length,base:summary(ss.map(s=>s.scaling.base)),magicMultiplier:summary(ss.map(s=>s.scaling.mult)),multiplierHistogram:count(ss.map(s=>String(s.scaling.mult))),hasSecondary:ss.filter(s=>s.modifier||s.modifiers?.length).length,hasRange:ss.filter(s=>s.rangeSpec).length};
  }
  const serial=x=>JSON.stringify(x);
  return { damage:{segments:damage.length,shapes:dist((_r,s)=>shape(s)),targets:dist((_r,s)=>s.target),scaling:count(standardDamage.map(({s})=>serial(s.scaling))),formulaGroups,formulaKinds:{standard:standardDamage.length,range:rangeDamage.length,execute:executeDamage.length},rangeFormulas:rangeDamage.map(({r,s})=>({id:r.id,cost:r.manaCost,min:s.rangeSpec.min,max:s.rangeSpec.max})),executeFormula:'target hp for true damage, hp+armor otherwise; ordinary scaling is a placeholder',
    secondarySources:count(modifiers.map(m=>`${m.source.kind}${m.source.stat?':'+m.source.stat:''}`)),secondaryModifiers:modifiers,
    modifiersOnDamageSegments:damage.filter(({s})=>s.modifier||s.modifiers?.length).length,
    splashRatios:count(damage.filter(({s})=>s.range==='splash').map(({s})=>String(s.splashRatio??'default'))),
    examples:[] },
    gems:{segments:gems.length,ops:count(gems.map(({s})=>s.params.op==='clear'?s.params.mode:s.params.op)),
      explode:{segments:explode.length,targetKinds:count(explode.map(({s})=>s.params.target.kind)),targets:count(explode.map(({s})=>serial(s.params.target)))},
      create:{segments:create.length,gemKinds:count(create.map(({s})=>serial(s.params.gem))),counts:count(create.map(({s})=>serial(s.params.count))),dynamic:create.filter(({s})=>s.params.modifier||s.modifier||s.params.count.mult!==0||s.params.countRange).length},
      convert:{segments:convert.length,directions:count(convert.map(({s})=>serial({from:s.params.from,to:s.params.to,toSpecial:s.params.toSpecial}))),limited:convert.filter(({s})=>s.params.count!==undefined).length},
    },
    directMana:{segments:entries.filter(({s})=>s.kind==='buff'&&s.stat==='mana').length,targets:count(entries.filter(({s})=>s.kind==='buff'&&s.stat==='mana').map(({s})=>s.target))},
    summons:{segments:summon.length,parameterKeys:count(summon.flatMap(({s})=>Object.keys(s.params).filter(k=>s.params[k]!==undefined))),mode:count(summon.map(({s})=>s.params.source.randomOf?'randomPool':s.params.source.ref?'fixedRef':s.params.source.template?'inlineTemplate':'other')),counts:count(summon.map(({s})=>serial(s.params.countRange??{min:1,max:1}))),positions:count(summon.map(({s})=>s.params.position??'back')),sourceKeys:count(summon.flatMap(({s})=>Object.keys(s.params.source).filter(k=>s.params.source[k]!==undefined))),examples:summon.slice(0,3).map(({r,s})=>({id:r.id,name:r.name,segment:s}))},
    examples:[6001,6003,6027,6047,6067,6231,6268,6471,7573,7845].filter(id=>rows.some(r=>r.id===id)).map(formulaExample),
    segmentKinds:count(entries.map(({s})=>s.kind)),
  };
}
const audit={date:'2026-10-25',denominator:{troops:rows.length,uniqueSpellIds:unique.length,missingRank:rows.filter(r=>r.rank===null).length},
  methodology:{roles:'original source role retained; capability presence does not assign primary role; same-path mixed capabilities may still be conditional and do not imply a shared target or guaranteed co-execution',unit:'one troop, final runtime skill prototype',families:'max distinct audit families along one mutually exclusive path; damage includes true/execute as subprofiles; a family is not a balance weight',branch:'presence may be conditional; unconditional means every mutually exclusive path has an eligible segment without segment or ancestor gates; frozen or invalid targets may still prevent actual extra turns or damage',duplicates:'uniqueSpellIds view uses one representative; role/rank tables use troops',specialMechanisms:'native and ST-adapted reported separately; exclude specific scoped bonuses, not all ordinary effects on those units',costBands:'descriptive bins, not new balancing thresholds'},
  native:{overall:aggregate(native),uniqueSpells:aggregate(unique),byRarity:group(native,'rarity'),byRank:group(native,'rank'),byRole:group(native,'role'),byCost:group(native.map(m=>({...m,costBand:costBand(m.manaCost)})),'costBand'),byRankRole:group(native.map(m=>({...m,rankRole:`${m.rank??'未映射'}/${m.role}`})),'rankRole'),profiles:profiles('native')},
  adapted:{overall:aggregate(adapted),byRank:group(adapted,'rank'),byRole:group(adapted,'role'),profiles:profiles('adapted')},
  troopMetrics:native.map((m,i)=>({...m,adapted:adapted[i]})),
};
assert(native.length===rows.length,'population mismatch');
assert(Object.values(audit.native.byRole).reduce((n,g)=>n+g.n,0)===rows.length,'role denominator mismatch');
assert(Object.values(audit.native.byRank).reduce((n,g)=>n+g.n,0)===rows.length,'rank denominator mismatch');
assert(unique.length===new Set(rows.map(r=>r.spell.id)).size,'unique denominator mismatch');
const q=x=>`${x.p25}/${x.median}/${x.p75}/${x.p90}`;
const pct=x=>`${x.n} (${x.pct}%)`;
const table=(headers,body)=>[headers,'|'+headers.split('|').slice(1,-1).map(()=>'---').join('|')+'|',...body].join('\n');
const groupTable=gs=>table('| 分组 | 数量 | 含直接敌方伤害 | 吞噬 | 主动额外回合 | 费用 P25/P50/P75/P90 | 每路径机制家族 P25/P50/P75/P90 |',Object.entries(gs).map(([k,g])=>`| ${k} | ${g.n} | ${pct(g.directDamage)} | ${pct(g.devour)} | ${pct(g.extraTurn)} | ${q(g.manaCost)} | ${q(g.maxPathFamilies)} |`));
const d=audit.native.profiles.damage;
const lines=[ '# 敌人技能真实分布审计（2026-10-25）','',
'由 `node scripts/audit-st-enemy-skill-design.mjs` 从当前执行原型生成。设计决策见 [敌人组装设计准则](sillytavern-enemy-design-guidelines.md)。这里记录事实，不把统计频率直接等同于平衡规则。','',
'## 统计口径','',
`- 全量 ${rows.length} 个单位，${unique.length} 个不同技能 ID；${audit.denominator.missingRank} 个单位没有五档立绘映射，单列“未映射”，保留在总分母内。`,
'- 原生稀有度（六级）与酒馆立绘档位（五档）分别统计；角色职责直接沿用原数据标签，不按伤害或魔力系数重新归类，也不代表当前组装器判定后的能力签名。',
'- 主职责与能力分别统计：供魔角色的伤害、转色等副能力仍计入供魔组。“某源职责中有多少技能含伤害”只描述该组内部构成，不证明角色归类正确，不用于推出职责占比或组装权重。',
'- 混合能力表要求两种效果存在于至少同一条非互斥路径；条件、概率、目标与运行环境仍可能阻止同次生效。宝石操作／直接法力列仅记录结构能力，不等于已经有效地给队友供魔。',
'- 使用最终 `SKILL_LIBRARY`，包含本项目群攻倍率调整；同时输出酒馆适配版本。带晋升／淘宝／魔头文案的单位保留在原始分布，适配版按现有适配器结果统计。',
'- “含伤害”指原型包含直接敌方伤害段，允许条件／概率／分支；不把骷髅生成、吞噬、削甲或持续状态直接计作伤害键。明确无段级条件的伤害另列。跨段 lastTarget 类目标按潜在敌方伤害统计，需具体目标上下文验证。',
'- 机制家族是审计分类，非 effects 词表长度，也非强度分数；同一伤害附带真实／处决标记不重复算伤害家族。互斥分支分别计算，取单路径最大值；同类连续段合并计算家族，段数单列。',
'- 家族分类细节以脚本 `family()` 为准；每个宝石操作种类、属性增益／治疗／生命提升／供魔、状态／控制、召唤等按运行结构归类。该粗分用于描述复杂度，尚不替代后续详细模板标签。',
'- 单位表按单位加权；去重技能只提供全局对照。形态覆盖可重叠；伤害公式表按伤害段加权，不能用其百分比替代单位出现率。费用分箱只用于描述。', '',
'## 全局','',
`原生直接伤害 ${pct(audit.native.overall.directDamage)}；各互斥路径均有无段级条件伤害 ${pct(audit.native.overall.unconditionalDamageInEveryBranch)}。去重技能含伤害 ${pct(audit.native.uniqueSpells.directDamage)}。`, '',
`原生每路径效果段 P25/P50/P75/P90 = ${q(audit.native.overall.maxPathSegments)}；机制家族 = ${q(audit.native.overall.maxPathFamilies)}。酒馆适配后直接伤害 ${pct(audit.adapted.overall.directDamage)}，机制家族 ${q(audit.adapted.overall.maxPathFamilies)}。`, '',
'## 按原生稀有度','',groupTable(audit.native.byRarity),'','## 按酒馆档位','',groupTable(audit.native.byRank),'','## 源职责与混合能力（保留原职责）','',
'下表均为单位数。伤害与转色等能力重叠不会把 Generator 改记为 Striker 或 Mage；后三种宝石操作和资源操作列要求与伤害在同一非互斥路径出现。原职责只是现有完整模板的分类种子，其边界仍需分类行为验证。','',
table('| 源职责 | 单位数 | 含直接伤害 | 伤害＋造石 | 伤害＋转色 | 伤害＋爆破 | 伤害＋宝石操作或直接法力 |',Object.entries(audit.native.byRole).map(([k,g])=>`| ${k} | ${g.n} | ${g.directDamage.n} | ${g.damageWithCreate.n} | ${g.damageWithConvert.n} | ${g.damageWithExplode.n} | ${g.damageWithResourceOperation.n} |`)),
'','### 各源职责内部的能力出现率','',
'以下是 P(能力存在 | 源职责)，不用于赋予主职责，也不是组装抽取概率。','',groupTable(audit.native.byRole),'','## 按费用','',groupTable(audit.native.byCost),'',
'## 伤害形态与公式','',
`直接敌方伤害段共 ${d.segments} 段。形态按 scatter → splash → split → 全体 → 多轮随机 → 多目标 → 单体的互斥优先级归类。随机多轮溅射首先归溅射，具体命中次数另保留在原型。`, '',
 table('| 形态 | 伤害段数 |',Object.entries(d.shapes).map(([k,n])=>`| ${k} | ${n} |`)), '',
 table('| 分组 | 伤害段数 | 基础值 P25/P50/P75/P90 | 魔力系数 P25/P50/P75/P90 | 含二次加成段 |',Object.entries(d.formulaGroups.byCost).map(([k,g])=>`| 费用 ${k} | ${g.segments} | ${q(g.base)} | ${q(g.magicMultiplier)} | ${g.hasSecondary} |`)), '',
 table('| 稀有度 | 伤害段数 | 基础值 P25/P50/P75/P90 | 魔力系数 P25/P50/P75/P90 | 含二次加成段 |',Object.entries(d.formulaGroups.byRarity).map(([k,g])=>`| ${k} | ${g.segments} | ${q(g.base)} | ${q(g.magicMultiplier)} | ${g.hasSecondary} |`)), '',
`含二次加成的伤害段 ${d.modifiersOnDamageSegments}；不止魔力：`, '',
 table('| 加成来源 | 修正器数（非单位数） |',Object.entries(d.secondarySources).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`| ${k} | ${n} |`)), '',
'基础求值是 `round(base + magic × mult)` 的非负值；二次加成、条件倍率、区间、吸取、真实伤害、目标分配及多次命中在执行器继续处理。分布分位数不是可以自由拼接的新公式。', '',
'## 宝石、直接供魔、召唤与变形','',
 table('| 项目 | 原生效果段数 |',Object.entries(audit.native.profiles.gems.ops).map(([k,n])=>`| 宝石 ${k} | ${n} |`).concat([`| 直接供魔 buff/mana | ${audit.native.profiles.directMana.segments} |`,`| summon | ${audit.native.profiles.summons.segments} |`,`| transformTroop | ${audit.native.profiles.segmentKinds.transformTroop??0} |`,`| summonCopy | ${audit.native.profiles.segmentKinds.summonCopy??0} |`])), '',
`造石中 ${audit.native.profiles.gems.create.dynamic} 段含动态数量／区间／加成；转色中 ${audit.native.profiles.gems.convert.limited} 段显式限制数量，其余需按执行器的全色／特殊种类／阶梯规则解析。爆破目标类型如下；这里的随机数量指爆心，不是最终清除格数：`, '',
 table('| 爆破目标类型 | 效果段数 |',Object.entries(audit.native.profiles.gems.explode.targetKinds).map(([k,n])=>`| ${k} | ${n} |`)), '',
'完整 JSON 同时保存造石种类／数量分布、转色方向、爆破目标规格、召唤参数键及引用方式、每单位指标、各档位×职责交叉统计、原生／适配对照。召唤与变形的目标闭包仍需由现有派生预检验证；计数成功不代表任意跨来源组合已经通过行为测试。', '',
'## 可复核数据','',
'- 脚本：`scripts/audit-st-enemy-skill-design.mjs`。',
'- 机器报告：`data/audits/st-enemy-skill-distribution-20261025.json`。',
'- 数据源：`src/data/troops.ts`、`src/engine/skills/library.ts`、`src/sillytavern/portraits.ts`、`src/sillytavern/enemyBlueprint.ts`。',
'- 分位数使用排序后的 nearest-rank 下标 `floor((n-1)×p)`，只做描述；记录不含战斗模拟或胜率标定。',''];
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(audit,null,2)+'\n');
fs.writeFileSync(reportPath,lines.join('\n'));
console.log(JSON.stringify({denominator:audit.denominator,native:audit.native.overall,adapted:audit.adapted.overall,report:path.relative(root,reportPath)},null,2));
