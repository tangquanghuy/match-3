/** Repair unreadable notes from the split review and remove obvious bad-translation tickets. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../artifacts/gowhead-troop-audit/approval-921');
const rows=[1,2,3,4,5].map(n=>JSON.parse(fs.readFileSync(path.join(dir,`review-${n}.json`),'utf8')));
const corrections={
 7446:['source_zh_suspect','中文来源把 Umbral Stars 写成“临界星”，但英文及项目都写“暗影之星”；“元素星河”也不如“元素之星”明确。项目中文更贴近英文，不因来源中文字不同而改为“临界星”。'],
 7019:['equivalent','来源中文“使用对多的颜色”是“使用最多的颜色”笔误；项目把意思写清楚，技能效果相同。'],
 7138:['equivalent','来源中文“发力颜色”是“法力颜色”笔误，项目已修正；3 点魔法属性与项目“3 点魔力值”在此处指同一属性。'],
 7219:['equivalent','中文来源多了“轻微”二字；英文是 splash damage，项目按溅射伤害实现。单凭模糊形容词不足以要求改溅射系数。'],
 7339:['equivalent','来源把“x2 通配宝石”译成“x2 万能牌”，项目用更明确的宝石名称；数量均为 3 颗，效果相同。'],
 7340:['equivalent','两边都是命中 3 名随机敌人后，创造 3 至 6 颗 x3 通配宝石；“万能牌”只是同一宝石的另一种译法。'],
 7366:['equivalent','来源的“卡牌”与项目的“通配宝石”都是 x3 Wildcard；先创造一颗、再按每颗被摧毁棕色宝石增加两颗，效果相同。'],
 7569:['equivalent','中文来源“魔法值颜色”是“法力颜色”的术语误写；项目说清了按敌方最常用法力颜色的宝石增幅吞噬几率。'],
 7253:['source_zh_suspect','中文来源最后写“盔甲魔力值20”，语法残缺；英文与项目均指在 10 点魔法、20 点生命、20 点护甲三者中选择其一窃取。来源词语有误，不据此调整技能。'],
 7257:['uncertain','来源中文在第三种骷髅头处截断，漏了超级末日骷髅头及死亡标记增量；仅靠不完整的中文无法判断应如何更改，项目描述与英文一致。'],
 7724:['source_zh_suspect','中文来源末句把“如果敌人死亡，获得的属性增益变为三倍”误写成“获得伤害值增加三倍”；英文与项目说明都指放大属性增益。来源指代有误，不应改变伤害公式。'],
 7861:['source_zh_suspect','来源中文“引爆一排敌人”把棋盘行误写成了敌人队列；英文与项目均写爆破一行宝石。这里是翻译对象错误，不应修改技能结算。'],
};
const found=new Set();
const troopData=JSON.parse(fs.readFileSync(path.resolve(dir,'../../../src/data/troops.json'),'utf8'));
for(const part of rows)for(const row of part){
 if(!Object.hasOwn(corrections,row.id) || !/\?\?\?/.test(row.reason))continue;
 const [decision,reason]=corrections[row.id];row.decision=decision;row.reason=reason;
 const spellId=troopData.find(t=>t.id===row.id)?.spell?.id;
 row.evidence=`src/data/troops.json id=${row.id} spell.id=${spellId}；data/raw/gowhead-live-troops/troops.zh.json Id=${row.id}；data/raw/gowhead-live-troops/troops.en.json Id=${row.id}；原有审阅路径已清除乱码。`;
 found.add(row.id);
}
if(found.size!==12)throw Error(`expected 12 unreadable notes, found ${found.size}`);
for(let i=1;i<=5;i++)fs.writeFileSync(path.join(dir,`review-${i}.json`),JSON.stringify(rows[i-1],null,2)+'\n');
console.log('Repaired',found.size,'unreadable review notes');
