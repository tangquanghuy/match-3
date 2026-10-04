/** Recheck suspected gameplay bugs against both local runtime and source wording. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'artifacts/gowhead-troop-audit/approval-921');
const read = file => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
const parts = [1,2,3,4,5].map(n=>read(`review-${n}.json`));
const current = parts.flat().filter(x=>x.decision==='functional_fix');
const ids = `6080 6092 6104 6108 6117 6253 6307 6454 6482 6507 6599 6623 6639 6640 6734 6751 6759 6817 6824 6863 6882 6897 6900 6908 6914 6928 6991 6992 7000 7001 7068 7108 7113 7131 7136 7139 7150 7186 7229 7260 7278 7311 7318 7338 7526 7553 7561 7679 7737 7768 7774 7778 7796 7830 7832`.split(' ').map(Number);
if(current.length !== 55 || current.some(x=>!ids.includes(x.id)) || new Set(ids).size!==55) throw Error('functional review changed; inspect before sweeping');
// Chinese-source wording is contradicted by English and the actual implementation. These
// are not proven runtime regressions. Missing native steps (mostly early troops) are NOT
// evidence that the Chinese wording is wrong: each finding states only what can be known.
const text = {
 6080:'中文写两色各 10 颗；项目与英文均写各 9 颗。仅凭这处中文数量分歧，不应把造石数量改成 10。',
 6092:'中文省掉了“其他”二字；项目与英文均限定给其他盟友。施法者是否在范围内应另核对，暂不改目标。',
 6104:'中文写黄色转紫色；项目与英文均写蓝色转紫色。需核对中文宝石颜色，不能直接把技能改成黄色。',
 6108:'中文写击杀后增加 1 点；项目与英文均写 3 点。中文数值与现有技能不一致，暂不据此改数值。',
 6117:'中文写对野兽双倍；项目与英文均写三倍。先确认中文倍率来源，不能直接把现有倍率减到两倍。',
 6307:'中文写“没有一颗紫色宝石”却带 [x6]，与“每颗增加 6%”自相矛盾；英文和项目均写每颗紫色宝石增加 6%，代码也按紫宝石数量计算。此处是明显的中文漏译／误译，现有回蓝逻辑不能因此反转。',
 6454:'中文把“回复 2 点法力”放在句号前；英文的“for each Entangled enemy”可同时修饰回蓝与额外回合。项目按每名被缠绕敌人回复 2 点，中文语序不足以确认固定回复 2 点；尚无可靠原生步骤可据此改功能。',
 6482:'中文省略“真实”二字；英文明确为真实伤害，项目也实现真实伤害。不能因中文字简略就把无视护甲的伤害改为普通伤害。',
 6507:'中文写“冻结所有敌人”，但英文限制为“所有受到溅射波及的敌人”；项目也只冻结受波及者。中文漏了限定条件，不能据此扩大冻结范围。',
 6599:'中文“生命值和法力值满值”有合取歧义，英文明确为“满生命或满法力”；项目采用后者。未证实代码应改成必须两项都满。',
 6623:'中文写爆破一行；英文写爆破一列，项目实装一列。先核对行列的翻译，不能直接改爆破方向。',
 6639:'中文写 50% 触发“其一”；英文明确三项各自有 50% 几率，项目按独立判定实现。不能按中文一句话把三项改为互斥。',
 6640:'中文“此军队”既可能指施法者，也可能指受击目标；英文同样只写 the troop，项目按受击目标实现。目标归属缺少独立证据，不能断言项目目标错误。',
 6734:'中文省掉了“如果敌人身亡”；英文和已取得的原生技能步骤均有击杀条件，项目亦有这一条件。不能把击杀门槛从代码中删除。',
 6751:'中文写骷髅头；英文及原生技能步骤写末日骷髅头，项目也是末日骷髅头。中文漏译特殊宝石类型，不能把宝石改为普通骷髅头。',
 6817:'中文“另外两名盟友”看似要求不重复；英文及原生步骤是再随机重复两次，项目亦随机选取。不能据中文字断定应禁止重复选人。',
 6824:'中文未写“随机”，不等于明确要求玩家点选；英文及原生步骤是随机盟友，项目也按随机实现。此前断言“必须手选”缺乏依据。',
 6882:'中文写第 3 位，英文及原生步骤写倒数第 2 位，项目也攻击倒数第 2 位。四人队伍时两者相同；人数变化时应先核实来源，不能据中文改目标。',
 6897:'中文写“所有盟友”，英文及原生步骤限定“其他盟友”，项目亦排除施法者。中文省略了“其他”，不是已证实的技能漏施。',
 6900:'中文省略“真实”，英文及原生步骤都是“真实伤害”，项目也是真实伤害。不能把伤害类型改成普通伤害。',
 6908:'中文把状态效果对象写成敌人与盟友同时受影响；英文及原生步骤的分支是敌方或盟方，项目也互斥。中文“和”与该机制冲突。',
 6914:'中文写攻击力；英文及原生步骤写护甲值，项目实装护甲值。源中文属性名称有误，不应把护甲增益改成攻击力。',
 6928:'中文写每名敌人造 8 颗；英文及原生步骤写每名造 7 颗，项目也是 7 颗。源中文数值不符，不应贸然把技能改为 8。',
 6991:'中文写只爆破一颗；英文及原生步骤写爆破数量随魔法变化，项目也按魔法计算。中文遗漏缩放公式。',
 6992:'中文写属性各增加“一次”，明显缺失具体数值；英文及原生步骤均给出随魔法变化的数值，项目按公式实现。不能按错误译文固定为 1。',
 7000:'中文将“赋予自己法印”误写成“迷惑自己”；英文及原生步骤与项目均为法印。不能据该错译给自己添加另一种状态。',
 7001:'中文写获得“一次攻击”，漏掉具体数值；英文及原生步骤与项目都使用随魔法变化的攻击力增益。不能固定为 1 点。',
 7068:'中文把妖仙／Fey 写成精灵／Elf；英文、原生步骤和项目指向妖仙。应核对源中文种族译名，不应把技能目标改成精灵。',
 7108:'中文写紫色盟友；英文及原生步骤与项目均统计紫色敌人。来源中文字对象与机制不符，暂不改统计对象。',
 7113:'中文写伤害打随机盟友；英文、原生步骤与项目均打随机敌人。把攻击目标改成盟友会伤害己方，是明显的源中文对象错误。',
 7131:'中文写冻结“或”死亡标记；英文及原生步骤是同时施加两种状态，项目同样同时施加。不能改成二选一。',
 7136:'中文写摧毁一行；英文、原生步骤与项目都写一列。这是行列来源争议，不能只凭中文改方向。',
 7139:'中文写摧毁一行且只给一名秘士；英文、原生步骤与项目写摧毁一列并给符合条件的盟友。两处对象／方向均须先核对源中文。',
 7150:'中文把妖仙／Fey 译成精灵，英文、原生步骤及项目所用兵种均为妖仙。不能改错兵种判定。',
 7186:'中文写从盟友耗法力；英文、原生步骤及项目是从敌人耗法力。不能把攻击目标改成己方。',
 7229:'中文写没有蓝宝石时有 7% 几率，却附有 [x7]；英文、原生步骤及项目按每颗蓝宝石增加几率。与暗影之刃同类译文错误，不应反转触发条件。',
 7260:'中文写先诅咒并标记盟友，后攻击其下方敌人；英文、原生步骤及项目先标记敌人。来源中文把目标写错，不应攻击己方。',
 7278:'中文遗漏 2 张藏宝图；英文、原生步骤及项目均有藏宝图奖励。不能因为译文遗漏就删除奖励。',
 7311:'中文写所有盟友；英文、原生步骤及项目都明确为其他盟友。不能扩大范围到施法者。',
 7318:'中文叙述了与本部队英文、原生步骤完全不同的 5×5 石像鬼宝石技能，疑似串了别的部队条目；项目按本部队英文实现，不能照错位文案替换整项技能。',
 7338:'中文写摧毁一行或一列；英文、原生步骤及项目是同时摧毁一行与一列。“或／和”差异不能直接证明代码错误。',
 7526:'中文再次写没有蓝宝石却标了 [x7]，英文、原生步骤及项目按每颗蓝宝石增幅。这是与 7229 相同的来源中文翻译问题。',
 7553:'中文写目标是高塔；英文、原生步骤及项目写的是魔头／Boss。中文目标类型错位，不能改变伤害倍率触发条件。',
 7561:'中文强调随机摧毁一列，英文和项目只写摧毁一列；未找到确切依据证明项目选列方式与实际机制不同，不列为已证实功能差异。',
 7679:'中文写把 3 颗骷髅转换为“2 个万能牌”；英文、原生步骤和项目是转换成 x2 通配宝石。“2”是宝石倍数，不是目标颗数。',
 7737:'中文把“减少敌人 [魔法+2] 点攻击力／技能值”误写成“对 [魔法+2] 名敌人操作”；英文、原生步骤及项目按属性数值结算。不能把影响人数改成伤害数值。',
 7768:'中文把疾病／中毒敌人数说成增加伤害；英文、原生步骤和项目是增加造石数量。来源中文加成对象错位。',
 7774:'中文写两种宝石各 14 颗；英文、原生步骤及项目是合计 14 颗混合宝石。不能把总量翻倍。',
 7778:'中文写驱散“流血效果”；英文及原生步骤使用对流血目标的驱散动作，并未把驱散范围限定为仅流血。此处中文限定可能失真，不能直接改技能。',
 7796:'中文把“一半法力值”称为“一半魔法值”；英文、原生步骤与项目均是回复法力（Mana），不是增加魔法属性（Magic）。两者是术语差异，不是战斗漏洞。',
 7830:'中文写获得 1 点生命值；英文、原生步骤与项目都是 [魔法+1] 点。中文遗漏了缩放值。',
};
const equivalent={
 6253:'项目和 gowhead 中文都写“两名随机敌人”，并无中文差异；英文明确写“前两名敌人”，项目战斗代码也是前两名。中文“随机”疑似共同的译文错误，不应把已实装的前两名改成随机；文案目标应再核实。',
 7832:'“被纠缠的敌人可获得额外伤害”表达不顺，但仍是受纠缠的敌人越多，伤害越高；与项目所写“伤害因被纠缠的敌人数增强”相同，并未发现功能差异。'};
const retained={
 6759:'已修复：实际施法先伤害、后造混合宝石；异常人数通过施法开始时的状态快照计算，受伤阵亡的敌人仍计入。中文所写伤害加成与英文／原生造石加成仍有来源冲突，本次仅更正已确认的执行顺序。',
 6863:'已按用户指定的中文机制修复：基础 40% 额外回合几率，创造宝石后每颗棕色宝石再加 1 个百分点（1:1）；返还半数法力维持独立的 40% 判定。英文和现有原生步骤未体现该加成，按明确指定口径实装。',
};
const functionIds = new Set(Object.keys(retained).map(Number));
const allIds = new Set([...Object.keys(text),...Object.keys(equivalent),...Object.keys(retained)].map(Number));
if(allIds.size!==55||ids.some(id=>!allIds.has(id)))throw Error('manual verification missing an item');
const localTroops = JSON.parse(fs.readFileSync(path.join(root,'src/data/troops.json'),'utf8'));
const nativeRecords = JSON.parse(fs.readFileSync(path.join(root,'data/raw/gowhead-live-troops/spells.en.json'),'utf8')).spells;
const nativeIds = new Set(nativeRecords.filter(x=>x.Type==='spell').map(x=>x.Id));
const folder = path.join(root,'src/engine/skills/curated');
const code = fs.readdirSync(folder).filter(f=>f.endsWith('.ts')).map(f=>[f,fs.readFileSync(path.join(folder,f),'utf8')]);
for(const rows of parts)for(const x of rows){
 if(!allIds.has(x.id)||x.decision!=='functional_fix')continue;
 x.decision = functionIds.has(x.id) ? 'functional_fix' : x.id in equivalent ? 'equivalent' : 'source_zh_suspect';
 x.reason = retained[x.id]??equivalent[x.id]??text[x.id];
 const spellId=localTroops.find(t=>t.id===x.id)?.spell?.id;
 const files=code.filter(([,body])=>new RegExp(`\\bid:\\s*${spellId},`).test(body)).map(([f])=>`src/engine/skills/curated/${f}`);
 x.evidence=`data/raw/gowhead-live-troops/troops.zh.json Id=${x.id}；data/raw/gowhead-live-troops/troops.en.json Id=${x.id}；src/data/troops.json id=${x.id}；${files.join('、')||'技能定位见原审核'} id=${spellId}；${nativeIds.has(spellId)?'spells.en.json 原生步骤 Id='+spellId:'原生步骤未收录，不能据此证明中文错误'}。`;
}
for(let n=1;n<=5;n++)fs.writeFileSync(path.join(dir,`review-${n}.json`),JSON.stringify(parts[n-1],null,2)+'\n');
console.log('Reviewed all 55 initial gameplay candidates: 2 flagged (1 confirmed ordering defect + 1 user-defined Chinese rule), 51 Chinese-source disputes, 2 equivalent wordings.');
