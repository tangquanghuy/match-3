/** 当前工作树主动技能盘点：读取最终技能库，展开随机分支；不修改游戏数据。 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
  stdin: { contents: `import { TROOPS } from './src/data/troops'; import { SKILL_LIBRARY } from './src/engine/skills/library'; export default TROOPS.map(t => ({...t, prototype: SKILL_LIBRARY[t.spell.id]}));`, resolveDir: root, loader: 'ts' },
  bundle: true, platform: 'node', format: 'esm', write: false,
  loader: { '.png': 'empty', '.webp': 'empty' },
});
const { default: troops } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const flat = ss => ss.flatMap(s => [s, ...(s.options?.flatMap(flat) ?? [])]);
for (const t of troops) t.segments = flat(t.prototype?.segments ?? []);
const has = pred => t => t.segments.some(pred);
const kind = (...ks) => has(s => ks.includes(s.kind));
const pos = new Set(['barrier','blessed','enchanted','enraged','rage','reflect','submerged']);
const statusNames = {'barrier':'屏障','blessed':'赐福','enchanted':'附魔','enraged':'激怒','rage':'激怒','reflect':'反射','submerged':'下潜','bleed':'出血','burning':'燃烧','charm':'魅惑','curse':'诅咒','death-mark':'死亡标记','disease':'疾病','entangle':'缠绕','faerie-fire':'妖火','frozen':'冻结','lycanthropy':'狼化','marked':'猎人标记','poison':'中毒','silence':'沉默','stun':'眩晕','terror':'恐怖','web':'织网'};
const rarities = ['普通','精良','稀有','传说','史诗','神话'];
const details = [];
const add=(name,rule,pred)=>details.push({name,rule,pred});
add('单目标／逐目标普通法术伤害','damage；非全体、非溅射、非分摊、非即杀；可含多目标选择',has(s=>s.kind==='damage'&&!s.execute&&!s.split&&!s.splitRandom&&!s.trueDamage&&!s.range));
add('全体法术伤害','damage.range=all；排除显式分摊和即杀',has(s=>s.kind==='damage'&&s.range==='all'&&!s.execute&&!s.split&&!s.splitRandom));
add('溅射伤害','damage.range=splash',has(s=>s.kind==='damage'&&s.range==='splash'));
add('真实伤害','damage.trueDamage',has(s=>s.kind==='damage'&&s.trueDamage));
add('均分／随机分摊伤害','damage.split / splitRandom；按实现字段而非“散射”文案',has(s=>s.kind==='damage'&&(s.split||s.splitRandom)));
add('吸血','damage.drain',has(s=>s.kind==='damage'&&s.drain));
add('即杀／斩杀','damage.execute；不含吞噬、献祭',has(s=>s.kind==='damage'&&s.execute));
add('创造宝石','gem.create；包含普通色、骷髅和特殊宝石',has(s=>s.kind==='gem'&&s.params.op==='create'));
add('转换宝石','gem.transform；包含特殊宝石端点',has(s=>s.kind==='gem'&&s.params.op==='transform'));
add('摧毁／移除文案对应的清盘','gem.clear.destroy；当前未拆出零收益 remove 管线',has(s=>s.kind==='gem'&&s.params.op==='clear'&&s.params.mode==='destroy'));
add('爆破宝石','gem.clear.explode',has(s=>s.kind==='gem'&&s.params.op==='clear'&&s.params.mode==='explode'));
add('创造／转换骷髅','普通骷髅及末日骷髅端点，不含纯清除骷髅',has(s=>s.kind==='gem'&&((s.params.op==='create'&&/SKULL|"skull"|doomSkull|uberDoomSkull/.test(JSON.stringify(s.params.gem)))||(s.params.op==='transform'&&((!s.params.toSpecial&&s.params.to==='SKULL')||/doomSkull|uberDoomSkull/.test(JSON.stringify(s.params.toSpecial??'')))))));
add('风暴','storm；调整后续掉落',kind('storm'));
add('棋盘重排','shuffleBoard',kind('shuffleBoard'));
add('直接加蓝／回蓝','buff.mana',has(s=>s.kind==='buff'&&s.stat==='mana'));
add('耗蓝／偷蓝','reduce.mana；偷蓝由 gainStat 标记',has(s=>s.kind==='reduce'&&s.stat==='mana'));
add('额外回合','显式 extraTurn；不含匹配自然产生的额外回合',kind('extraTurn'));
for(const [stat,label] of [['attack','加攻击'],['armor','加护甲'],['hp','治疗／回血'],['magic','加魔力']]) add(label,`buff.${stat}`,has(s=>s.kind==='buff'&&s.stat===stat));
add('随机属性增益','randomStat',kind('randomStat'));
add('削减非蓝属性','reduce.attack/armor/magic/hp/random',has(s=>s.kind==='reduce'&&s.stat!=='mana'));
add('窃取属性／转化属性','reduce.gainStat；含偷蓝',has(s=>s.kind==='reduce'&&s.gainStat));
add('固定正面状态','status 中屏障、赐福、附魔、激怒、反射、下潜',has(s=>s.kind==='status'&&pos.has(s.statusId)));
add('固定负面状态','status 中其余明确状态；包含魅惑、狼化、死亡标记',has(s=>s.kind==='status'&&!pos.has(s.statusId)));
add('随机正／负面状态','randomStatus',kind('randomStatus'));
add('净化','cleanse',kind('cleanse'));
add('驱散','dispel',kind('dispel'));
for(const [k,label,rule]of [
 ['summon','召唤','固定兵种／随机种族／随机王国等召唤'],['summonCopy','复制召唤','以已有单位快照召唤副本'],['transformTroop','单位变形','替换单位模板；含复制目标形态'],['devour','吞噬','吞噬目标并成长'],['sacrifice','献祭／自毁','消灭己方目标或自己'],['selfRevive','施法自复活','本次施法的死亡拦截，不含被动复活'],['reposition','前移／击退','编队前后调位'],['swapPositions','两单位交换站位','交换指定两个位置'],['shuffleTeam','整队乱序','重排编队顺序'],['gainEconomy','获得战斗资源','金币／灵魂／藏宝图，按配置统计'],['stealGold','偷取金币','stealGold'],['spendEconomy','消耗金币','spendEconomy'],['escapeChance','撤离战场','flee 机制'],['oneOf','随机效果分支','oneOf；其子分支也参与所有分类'],
])add(label,rule,kind(k));
add('每战一次','prototype.oncePerBattle',t=>!!t.prototype?.oncePerBattle);
add('击杀后追加效果','ifTargetDied',has(s=>!!s.ifTargetDied));
add('条件触发／条件倍率','ifCond / condMult / condBonus / raceDouble',has(s=>!!(s.ifCond||s.condMult||s.condBonus||s.raceDouble)));
add('动态数值增强','modifier / modifiers / chanceBoost / params.modifier / params.countModifier',has(s=>!!(s.modifier||s.modifiers?.length||s.chanceBoost||s.params?.modifier||s.params?.countModifier)));
const groups=[
 ['法术输出', '普通、全体、溅射、真实、分摊、吸血、斩杀',kind('damage')],
 ['棋盘操控', '创造、转换、摧毁、爆破，包含骷髅和特殊宝石',kind('gem')],
 ['风暴／重排棋盘','控制掉落或打乱棋盘',kind('storm','shuffleBoard')],
 ['法力控制','直接回蓝、耗蓝、偷蓝；不含间接造石产蓝',has(s=>['buff','reduce'].includes(s.kind)&&s.stat==='mana')],
 ['额外回合','技能显式追加行动',kind('extraTurn')],
 ['属性／生存','非蓝属性增益、治疗、随机属性',has(s=>(s.kind==='buff'&&s.stat!=='mana')||s.kind==='randomStat')],
 ['属性削弱／窃取','减攻、破甲、减魔、扣血、随机削弱',has(s=>s.kind==='reduce'&&s.stat!=='mana')],
 ['状态施加','固定正负状态及随机状态',kind('status','randomStatus')],
 ['净化／驱散','清负面、清正面',kind('cleanse','dispel')],
 ['召唤／复制','召唤新单位或复制现有单位',kind('summon','summonCopy')],
 ['变形／吞噬／献祭／自复活','单位身份、退场与返场机制',kind('transformTroop','devour','sacrifice','selfRevive')],
 ['站位操控','击退、前移、交换、整队乱序',kind('reposition','swapPositions','shuffleTeam')],
 ['战斗资源','获得资源、偷金币、消耗金币',kind('gainEconomy','stealGold','spendEconomy')],
 ['概率撤离','施法后按概率离场',kind('escapeChance')],
 ['随机技能分支','执行一个随机分支',kind('oneOf')],
].map(([name,rule,pred])=>({name,rule,pred}));
const example=t=>`${t.name}【${t.spell.name}】（部队 ${t.id}／技能 ${t.spell.id}）`;
const summarize=({name,rule,pred})=>{const rows=troops.filter(pred);return{name,rule,count:rows.length,byRarity:rarities.map((_,r)=>rows.filter(t=>t.rarityIdx===r).length),examples:[3,4,5].map(r=>rows.find(t=>t.rarityIdx===r)).map(t=>t?{id:t.id,name:t.name,spellId:t.spell.id,spell:t.spell.name,description:t.spell.description}:null),troopIds:rows.map(t=>t.id)};};
const statuses=[...new Set(troops.flatMap(t=>t.segments.filter(s=>s.kind==='status').map(s=>statusNames[s.statusId]??s.statusId)))].map(name=>summarize({name,rule:'直接 status 段（rage/enraged 合并）；不含随机池和宝石间接触发',pred:has(s=>s.kind==='status'&&(statusNames[s.statusId]??s.statusId)===name)})).sort((a,b)=>b.count-a.count);
function specialKinds(s){if(s.kind!=='gem')return[];const p=s.params;let out=[];const push=x=>{if(typeof x==='string')out.push(x);else if(x?.kind)out.push(x.kind)};if(p.op==='create'){const g=p.gem;if(g.kind==='special')push(g.spec);if(g.kind==='mixSpecial')g.specs.forEach(push);if(g.kind==='mixAny')g.entries.filter(x=>typeof x==='object').forEach(push);}if(p.op==='transform'){if(p.toSpecial)push(p.toSpecial);}return out;}
const specials=[...new Set(troops.flatMap(t=>t.segments.flatMap(specialKinds)))].sort().map(name=>summarize({name,rule:'技能直接创造／转换产出；颜色和 tier 不再拆分',pred:has(s=>specialKinds(s).includes(name))}));
const primitives=[...new Set(troops.flatMap(t=>t.segments.map(s=>s.kind)))].map(name=>summarize({name,rule:'实际挂载的段类型，递归展开 oneOf',pred:kind(name)})).sort((a,b)=>b.count-a.count);
const report={date:'2026-09-25',total:troops.length,bound:troops.filter(t=>t.prototype?.segments.length).length,rarities:rarities.map((name,r)=>({name,count:troops.filter(t=>t.rarityIdx===r).length})),groups:groups.map(summarize),details:details.map(summarize),statuses,specials,primitives};
const cell=e=>e?`${e.name}【${e.spell}】`:'—';
const table=rows=>['| 分类 | 部队数 | 实现口径 | 传说示例 | 史诗示例 | 神话示例 |','|---|---:|---|---|---|---|',...rows.map(r=>`| ${r.name} | ${r.count} | ${r.rule} | ${r.examples.map(cell).join(' | ')} |`)].join('\n');
let md=`# 当前项目部队技能分类统计（${report.date}）\n\n## 统计口径\n\n- 来源：当前工作树的 TROOPS 与最终 SKILL_LIBRARY（包含 overrides、curated 和自定义部队），不使用外部游戏目录代替本项目。\n- 共 ${report.total} 个部队，${report.bound} 个挂载非空主动技能；这说明实现绑定覆盖，不代表每句文案都已逐条行为验收。\n- 稀有度按界面：传说=UltraRare（598）、史诗=Epic（254）、神话=Legendary（234）。\n- 统计单位为部队，同一部队在一个类别内只计一次；跨类别可重复，数字不得相加当作部队总数。随机 oneOf 分支全部展开，条件／概率效果计入“具备此机制”，不代表每次施法必定发生。\n- 低稀有度独有的稀少机制也纳入统计：施法自复活为稀有部队太阳鸟【浴火重生】；交换站位为普通部队巨蟹【蟹钳】、精良部队捣蛋鬼【恶作剧之击】。\n- 主表不混入被动特质、英雄武器、召唤物技能及特殊宝石触发后的间接效果；特殊宝石直接产出另列。\n- 示例中的“—”表示该稀有度没有匹配该实现字段的部队；不是引擎没有该机制。\n\n## 一、按效果大类\n\n${table(report.groups)}\n\n## 二、细分类（含低频机制）\n\n${table(report.details)}\n\n## 三、直接状态分类\n\n固定状态按同义 ID 合并为 ${statuses.length} 类。随机状态池及特殊宝石搬运状态不计入以下直接施加数量。\n\n${table(statuses)}\n\n## 四、技能直接产出的特殊宝石\n\n共 ${specials.length} 种 kind；龙宝石颜色、通配倍率、石像鬼善恶分档在这里不另计一种。仅“清除某种特殊宝石”的技能不算创造该宝石。\n\n${table(specials)}\n\n## 五、底层效果段覆盖\n\n共 ${primitives.length} 个实际使用的 EffectSegment.kind。\n\n${table(primitives)}\n\n## 六、与参考图／文案的重要差异\n\n1. 当前 clear 只有 destroy / explode，两者均经 resolveBoardChange → settleDestroyed 结算法力；未独立区分“移除宝石而零收益”。例如阿伯拉瑟的“移除所有宝石”实际是 allColors + destroy。\n2. 当前爆破后的普通色宝石按颗数入法力结算，没有参考图中的固定 70% 折算。\n3. “散射”文案常被装配成 range=all（例如蒸汽炮塔、贝尔、太阳鸟）；只有 split / splitRandom 才计入真正分摊。\n4. buff.hp 是恢复生命，受 maxHp 上限约束；不等于提升生命上限。\n5. 这里的施法自复活只统计 selfRevive；被动死亡复活另属于特质系统。太阳鸟是唯一主动 selfRevive 部队，稀有度为稀有。\n6. 法力燃烧文案不代表完整法力燃烧伤害机制：当前梅冰女王、丝卡蒂等条目装配的是 reduce.mana（耗尽法力），未附带按敌方法力计算的伤害段。本报告将它们计为耗蓝，而非单列“法力燃烧伤害已完整实现”。\n7. 特殊宝石的 37 种指直接可产出的 kind，并非 37 种完整独立特效：例如 enchantedGem 当前按紫色匹配，未附带附魔状态触发；stoneBlock 是惰性障碍。\n8. “全部挂有非空实现”与“完全还原外部游戏规则”是两件事，本报告仅描述当前本地实现。\n\n## 七、示例原文索引\n\n原文用于定位技能；涉及上述语义差异时，以实现口径为准。\n\n`;
const ids=new Set([...report.groups,...report.details,...statuses,...specials].flatMap(r=>r.examples.filter(Boolean).map(e=>e.id)));
for(const t of troops.filter(t=>ids.has(t.id)))md+=`- **${rarities[t.rarityIdx]} · ${example(t)}**：${t.spell.description.replaceAll('\n',' ')}\n`;
md+='\n## 源码入口与复跑\n\n- `src/data/troops.ts`：当前部队入口。\n- `src/meta/data/rarity.ts`：玩家显示稀有度。\n- `src/engine/skills/library.ts`：最终技能覆盖优先级与绑定。\n- `src/engine/skills/prototypes.ts`：效果段及执行分派。\n- `src/engine/skills/effects/`：伤害、状态、宝石、增益、召唤、经济等实现。\n- `src/engine/TurnEngine.ts`：棋盘与法力结算。\n- 复跑：`node scripts/audit-skill-types.mjs`。\n';
mkdirSync(path.join(root,'tmp'),{recursive:true});
writeFileSync(path.join(root,'tmp/skill-types-audit.json'),JSON.stringify(report,null,2));
writeFileSync(path.join(root,'docs/skill-types-inventory-2026-09-25.md'),md);
console.log(JSON.stringify({...report,details:report.details.map(({name,count,examples})=>({name,count,examples:examples.map(cell)})),groups:report.groups.map(({name,count,examples})=>({name,count,examples:examples.map(cell)})),statuses:statuses.map(({name,count})=>({name,count})),specials:specials.map(({name,count})=>({name,count})),primitives:primitives.map(({name,count})=>({name,count}))},null,2));
