#!/usr/bin/env node
/** 批量审查索引：只建账/筛选，不自动签收法术或特质。运行：node scripts/audit-clan-gems.mjs */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const troops = JSON.parse(read('src/data/troops.json'));
const weapons = JSON.parse(read('src/data/weapons.json'));
const types = read('src/engine/types.ts');
const turn = read('src/engine/TurnEngine.ts');
const match = read('src/engine/MatchResolver.ts');
const textures = read('src/render/gemTextures.ts');
const testPage = read('src/render/SkillTestPage.ts');
const tests = ['gemSpecial', 'statusGems', 'specialGemsWaveB', 'gemEffect', 'gemClearBatch', 'stormDrop', 'stormEngine', 'skullStorm', 'gowCommonStatusRules']
  .map((name) => [name, read(`tests/unit/${name}.test.ts`)]);
const mythics = troops.filter((t) => t.rarityIdx === 5);
// 数据中的 rarityIdx=5 被存成 Legendary；本表使用项目档位而不按该英文字符串筛选。
const union = types.split('export type SpecialGemKind =')[1]?.split(';')[0] ?? '';
const declared = [...union.matchAll(/^\s*\| '([^']+)'/gm)].map((m) => m[1]);
if (declared.length !== 41 || new Set(declared).size !== 41) throw new Error(`SpecialGemKind 声明发生变化：${declared.length} 种，请重审分类`);

// 中文名字用于定位描述中“明确点名的特殊宝石”，不能推断只是写了“宝石”的法术会产哪一种。
// 模式：匹配 / 摧毁(含匹配) / 双入口(分别触发) / 盘上 / 被动 / 待核。
const definitions = [
  ['doomSkull','末日骷髅','匹配','末日骷髅'], ['uberDoomSkull','至尊末日骷髅','匹配','至尊末日骷髅'],
  ['bomb','炸弹','摧毁','炸弹宝石'], ['web','织网','双入口','织网宝石'],
  ['lightningRow','蓝闪电','匹配','蓝色闪电宝石'], ['lightningCol','黄闪电','匹配','黄色闪电宝石'],
  ['wildcard','通配','匹配','通配宝石'], ['wish','许愿','摧毁','许愿宝石'],
  ['hourglass','沙漏','匹配','沙漏宝石'], ['bootyGem','赃物','摧毁','赃物宝石'],
  ['ghost','幽魂','待核','幽魂宝石'],
  ['burningGem','燃烧','匹配','燃烧宝石'], ['freezeGem','冻结','匹配','冻结宝石'],
  ['curseGem','诅咒','匹配','诅咒宝石'], ['bleedGem','流血','摧毁','流血宝石'],
  ['poisonGem','毒','匹配','毒宝石'], ['deathMarkGem','死亡标记','摧毁','死亡标记宝石'],
  ['terrorGem','恐怖','匹配','恐怖宝石'], ['entangleGem','缠绕','摧毁','缠绕宝石'],
  ['enrageGem','激怒','摧毁','激怒宝石'], ['submergeGem','沉没','摧毁','沉没宝石'],
  ['faerieFireGem','精灵火','摧毁','精灵火宝石'], ['stunGem','打昏','摧毁','打昏宝石'],
  ['barrierGem','屏障','摧毁','屏障宝石'],
  ['dragonGem','龙','双入口','龙宝石'], ['giantGem','巨人','双入口','巨人宝石'],
  ['spiritGem','灵力','双入口','灵力宝石'], ['manaPotionGem','法力药水','双入口','法力药水宝石'],
  ['candyGem','糖果','匹配','糖果宝石'], ['elementalStar','元素星','匹配','元素星'],
  ['umbralStar','暗影星','匹配','暗影星'], ['angelGem','天使','摧毁','天使宝石'],
  ['daemonicPortalGem','恶魔传送门','摧毁','恶魔传送门宝石'],
  ['gargoyleGem','石像鬼','摧毁','石像鬼宝石'], ['stoneBlock','石块','被动','石块'],
  ['lycanthropyGem','狼化','摧毁','狼化宝石'], ['decayGem','腐朽','盘上','腐朽宝石'],
  ['volcanoGem','火山','摧毁','火山宝石'], ['trapGem','陷阱','摧毁','陷阱宝石'],
  ['enchantedGem','附魔','匹配','附魔宝石'], ['mimicGem','宝箱怪','待核','宝箱怪宝石'],
];
const names = definitions.map(([key]) => key);
if (names.length !== 41 || names.some((key) => !declared.includes(key))) throw new Error('机制清单与 SpecialGemKind 不一致');
const panel = testPage.split('const SPECIAL_TEST_GEMS:')[1]?.split('];')[0] ?? '';
const panelKinds = new Set([...panel.matchAll(/kind: '([^']+)'/g)].map((m) => m[1]));
const missingPanel = names.filter((key) => !panelKinds.has(key));
if (missingPanel.length) throw new Error(`测试台遗漏特殊宝石：${missingPanel.join(', ')}`);
const sixColorKinds = ['dragonGem', 'giantGem', 'spiritGem', 'manaPotionGem', 'candyGem'];
for (const key of sixColorKinds) {
  if (!new RegExp(`kind: '${key}', color: BaseColor\\.`).test(panel)) throw new Error(`测试台 ${key} 缺归属色，投放后不能按颜色匹配`);
}
const texEntries = new Set([...textures.split('const SPECIAL_URL:')[1].split('};')[0].matchAll(/^\s*(\w+):/gm)].map((m) => m[1]));
const visualKeys = new Set([...texEntries, ...sixColorKinds, 'wildcard', 'bootyGem', 'gargoyleGem']);
const missingTextures = names.filter((key) => !visualKeys.has(key));
if (missingTextures.length) throw new Error(`宝石贴图映射遗漏：${missingTextures.join(', ')}`);

const mechanisms = [
  ['群体/散射', /所有敌人|全体敌人|全体敌军|所有敌军|散射伤害/],
  ['溅射', /溅射伤害/], ['斩杀/击杀奖励', /杀掉|杀死|斩杀|若有.*身亡|如果.*死亡|击杀/],
  ['真实伤害/生命窃取', /真实伤害|窃取.*生命/], ['法力/额外回合', /法力|额外回合|回蓝/],
  ['造石/转色', /创造.*宝石|转换.*宝石|变为.*宝石|转化.*宝石|创造.*骷髅/],
  ['爆破/摧毁', /爆破|摧毁.*宝石|摧毁.*骷髅/], ['召唤', /召唤/],
  ['治疗/增益', /恢复.*生命|获得.*(?:生命|护甲|攻击)|赋予.*(?:屏障|祝福)/],
  ['异常状态', /燃烧|冻结|诅咒|流血|中毒|沉默|缠绕|织网|狼化|死亡标记|疾病|妖火|下潜|恐怖/],
  ['风暴', /风暴/],
];
const spell = (t) => t.spell?.description ?? '';
const traitText = (t) => (t.traits ?? []).map((v) => v.description ?? '').join(' ');
const safe = (s) => String(s).replaceAll('|', '\\|').replaceAll('\n', ' ');
const clanMap = new Map();
for (const troop of troops) for (const clan of new Set(troop.troopTypes ?? [])) {
  const row = clanMap.get(clan) ?? { all: [], mythic: [] };
  row.all.push(troop);
  if (troop.rarityIdx === 5) row.mythic.push(troop);
  clanMap.set(clan, row);
}
const multi = mythics.filter((t) => new Set(t.troopTypes ?? []).size > 1).length;
let out = `# 族系 × 机制 × 特殊宝石批量审查索引\n\n`;
out += `生成方式：\`node scripts/audit-clan-gems.mjs\`。数据：\`src/data/troops.json\`（${troops.length}）、\`src/data/weapons.json\`（${weapons.length}）。\n\n`;
out += `**档位说明：**本项目的 \`rarityIdx === 5\` 共 ${mythics.length} 名，JSON 的 rarity 字段写的是 \`Legendary\`；此档按 src/meta/data/rarity.ts 展示为“神话”（区别于武器的 Mythic 键）。${multi} 名属于多个族系，同一部队可出现在多行，各行不可求和。\n\n`;
out += `**验收界限：**脚本断言 41 种类型都有测试台投放与贴图映射（不代表已进行浏览器目视检验）；机制列只做中文描述关键词索引；“测试提及”只指测试文件出现对应 kind，既不是测试断言逐分支覆盖，更不是原版语义签收。机制核查不会自动增加逐项签收数。\n\n`;
out += `## 族系：${[...clanMap.values()].filter((v) => v.mythic.length).length} 种（按神话档数量排序）\n\n`;
out += '| 族系 | 全档人数 | 神话档人数 | 神话档法术机制（命中人数） | 神话档明确提及的特殊宝石 |\n|---|---:|---:|---|---|\n';
for (const [clan, { all, mythic }] of [...clanMap].filter(([, v]) => v.mythic.length).sort((a,b) => b[1].mythic.length - a[1].mythic.length || a[0].localeCompare(b[0]))) {
  const kinds = mechanisms.map(([label, re]) => [label, mythic.filter((t) => re.test(spell(t))).length]).filter(([, n]) => n);
  const gems = definitions.map(([, label,, alias]) => [label, mythic.filter((t) => spell(t).includes(alias) || traitText(t).includes(alias)).length]).filter(([, n]) => n);
  out += `| ${safe(clan)} | ${all.length} | ${mythic.length} | ${safe(kinds.map(([label,n]) => `${label} ${n}`).join('、') || '—')} | ${safe(gems.map(([label,n]) => `${label} ${n}`).join('、') || '—')} |\n`;
}
out += `\n## 特殊宝石：${names.length} 种（全量接口账）\n\n触发：“摧毁”含匹配并移除；“双入口”表示两种路径均接入口，不代表每种收益完全相同。具体语义以各宝石测试和规则文档为准。\n\n`;
out += '| 宝石 kind | 预期入口 | 代码位置 | 回归文件提及 | 测试台/贴图映射 | 神话档技能/特质明示 | 武器技能明示 | 原版证据状态 |\n|---|---|---|---|---:|---:|---|\n';
const caveats = new Map([
  ['ghost','灵魂经济未接战场收益'], ['enchantedGem','已核实：匹配时附魔随机己方'], ['mimicGem','触发句待官方核实'],
  ['faerieFireGem','宝石触发句待核'], ['stunGem','宝石触发句待核'], ['barrierGem','宝石触发句待核'],
  ['spiritGem','颜色集合待核'], ['volcanoGem','已核实：被摧毁（含匹配）向上清除'],
]);
for (const [key, label, mode, alias] of definitions) {
  const relevant = tests.filter(([, content]) => content.includes(`'${key}'`)).map(([name]) => name);
  const mythicCount = mythics.filter((t) => spell(t).includes(alias) || traitText(t).includes(alias)).length;
  const weaponCount = weapons.filter((w) => spell(w).includes(alias)).length;
  const runtime = mode === '待核' || mode === '被动' ? 'types/TurnEngine（无触发或特殊规则）'
    : mode === '盘上' ? 'TurnEngine.applyDecayGemAura' : 'types.matchJoinKey → TurnEngine.collectMatchTriggers / expandSpecialDestruction';
  out += `| \`${key}\`（${label}） | ${mode} | ${runtime} | ${relevant.join('、') || '未检出（需补）'} | 已登记/有贴图 | ${mythicCount} | ${weaponCount} | ${caveats.get(key) ?? '本地规则文档有原文/裁定；尚未逐条外部复核'} |\n`;
}
out += '\n### 复核优先级\n\n1. 优先核对原版证据缺口：幽魂/宝箱怪、精灵火/打昏/屏障的宝石触发句、灵力宝石颜色集合。\n2. 对神话档大族系按机制批量驱动实战回放：优先 Dragon/Divine/Daemon/Elemental；不要仅按族系合计验收。\n3. 对匹配、摧毁、爆破连锁、转色生成、回合起始、敌方行动分别建立断言；单测通过只证明所断言的场景。\n';
mkdirSync('.kiro/specs/combat-mechanics', { recursive: true });
const target = '.kiro/specs/combat-mechanics/CLAN-GEM-MECHANISM-MATRIX.md';
writeFileSync(target, out, 'utf8');
console.log(`生成 ${target}：${mythics.length} 名神话档，${[...clanMap.values()].filter((v) => v.mythic.length).length} 族系，${names.length} 种特殊宝石，${multi} 名跨族系`);



