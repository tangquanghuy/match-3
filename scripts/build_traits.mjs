/**
 * 从 GoW 原始 dump 生成结构化特质表。
 * 用法: node scripts/build_traits.mjs
 * 输入: data/raw/troops.gow.zh.json
 * 输出: src/data/traits.json（引擎 traits.ts 消费）
 *
 * 只输出「描述能被完整解析成引擎已支持机制」的特质。解析不了的会统计在报告里，
 * 明确列出缺哪种机制，避免默默漏掉或半实现。
 */
import fs from 'node:fs';
import path from 'node:path';

const IN = 'data/raw/troops.gow.zh.json';
const OUT = 'src/data/traits.json';

/** 中文状态名 → 引擎状态 id。引擎没有的（疾病/狼化/吞噬…）不映射。 */
const STATUS_MAP = [
  [/中毒/, 'poison'],
  [/燃烧|妖火/, 'burning'],
  [/冻结|冰冻/, 'frozen'],
  [/沉默/, 'silence'],
  [/缠绕|织网/, 'entangle'],
  [/击晕|眩晕/, 'stun'],
];
/** 引擎尚未实现的状态/机制关键词，用于报告 */
const UNSUPPORTED_STATUS = /疾病|狼化|死亡标记|吞噬|法力燃烧|法力耗尽|法力窃取|恐怖|出血|猎人标记|受诅|转化|屏障|下潮|狂怒|法印|风暴/;

const COLOR_MAP = [
  [/蓝色/, 'Blue'], [/绿色/, 'Green'], [/红色/, 'Red'],
  [/黄色/, 'Yellow'], [/紫色/, 'Purple'], [/棕色/, 'Brown'],
];

const STAT_MAP = [
  [/生命值/, 'hp'], [/护甲值/, 'armor'], [/攻击力/, 'attack'], [/魔法值/, 'magic'], [/技能值/, 'magic'],
];

/**
 * 中文族名 → 英文 TroopType。
 *
 * 不靠翻译猜：对每个「X盟友获得 N 点 Y」特质，统计实际持有它的兵种的 TroopType 分布，
 * 取占比最高者作为该族名的英文类型（61/64 条命中率 ≥0.8，见 artifacts/troop-types.txt）。
 * 机械/不死族之盾两条命中率偏低是因为兵种常带双类型，这里按语义直接指定。
 */
const TROOP_TYPE_MAP = {
  野兽: 'Beast', 妖仙: 'Fey', 元素: 'Elemental', 龙族: 'Dragon', 人类: 'Human',
  恶魔: 'Daemon', 神祇: 'Divine', 怪物: 'Monster', 骑士: 'Knight', 建造: 'Construct',
  蛮族: 'Wildfolk', 盗贼: 'Rogue', 精灵: 'Elf', 狼族: 'Wargare', 巨人: 'Giant',
  不死族: 'Undead', 人马: 'Centaur', 哥布林: 'Goblin', 猫族: 'Raksha', 秘士: 'Mystic',
  鸟族: 'Stryx', 纳迦: 'Naga', 海族: 'Merfolk', 厄仑卡: 'Urska', 矮人: 'Dwarf',
  牛头族: 'Tauros', 兽人: 'Orc', 机械: 'Mech', 石人: 'Construct', 侏儒: 'Gnome',
  半人马: 'Centaur', 罗刹: 'Raksha', 不朽: 'Immortal',
};

const num = (s) => Number(s);

/**
 * 解析屠戮类特质的「条件」描述：陷入某状态的敌人 / 被击晕的敌人 / 受伤的敌人。
 * 只认引擎已有的状态；`受伤` 是「当前生命低于上限」的状况，不是状态。
 */
function parseDamageCondition(text) {
  if (/受伤/.test(text)) return { wounded: true };
  const hit = STATUS_MAP.find(([re]) => re.test(text));
  return hit ? { status: hit[1] } : null;
}
const pickColor = (desc) => COLOR_MAP.find(([re]) => re.test(desc))?.[1];
const pickStat = (desc) => STAT_MAP.find(([re]) => re.test(desc))?.[1];

/** 把一条描述解析成引擎效果；无法完整表达返回 null 并给出原因。 */
function parse(desc) {
  let m;

  // 减伤：降低来自骷髅头的伤害 N%
  if ((m = /降低来自骷髅头的伤害\s*(\d+)%/.exec(desc))) {
    return { effects: { skullDamageReduction: num(m[1]) / 100 } };
  }
  // 消除 N% 的骷髅头伤害（等价减伤）
  if ((m = /消除\s*(\d+)%\s*的骷髅头伤害/.exec(desc))) {
    return { effects: { skullDamageReduction: num(m[1]) / 100 } };
  }
  // 减伤：降低来自法术的伤害 N%
  if ((m = /降低来自法术的伤害\s*(\d+)%/.exec(desc))) {
    return { effects: { spellDamageReduction: num(m[1]) / 100 } };
  }
  // 免疫：对 X、Y 免疫
  if (/免疫/.test(desc)) {
    if (/所有状态效果/.test(desc)) return { effects: { statusImmunities: ['*'] } };
    const ids = STATUS_MAP.filter(([re]) => re.test(desc)).map(([, id]) => id);
    if (ids.length > 0) return { effects: { statusImmunities: [...new Set(ids)] } };
    return null; // 全是引擎没有的状态
  }
  // 开局法力：战斗开始时获得 N% 法力 / 全满法力
  if (/战斗开始时/.test(desc) && /法力/.test(desc) && !/所有|全部/.test(desc)) {
    if (/全满/.test(desc)) return { effects: { battleStartManaRatio: 1 } };
    if ((m = /(\d+)%\s*法力/.exec(desc))) return { effects: { battleStartManaRatio: num(m[1]) / 100 } };
    return null;
  }
  // 每回合开始时恢复 N 点 X（仅自身，不含队伍范围）
  if ((m = /在?每回合开始时恢复\s*(\d+)\s*点(生命值|护甲值)/.exec(desc))) {
    return { effects: { regen: { stat: m[2] === '护甲值' ? 'armor' : 'hp', amount: num(m[1]) } } };
  }
  if ((m = /^在每回合开始时获得\s*(\d+)\s*点(攻击力|护甲值|生命值|魔法值)/.exec(desc))) {
    return { effects: { regen: { stat: pickStat(m[2]) ?? 'hp', amount: num(m[1]) } } };
  }
  // 受击触发：在自身受到伤害时获得 N 点 X / 在受到攻击时获得 N 点 X
  if ((m = /(?:在自身受到伤害时|在受到攻击时)获得\s*(\d+)\s*点(攻击力|护甲值|魔法值|生命值)/.exec(desc))) {
    return { effects: { onDamagedGain: { stat: pickStat(m[2]) ?? 'attack', amount: num(m[1]) } } };
  }
  // 命中附带：在造成骷髅头伤害时 …状态
  if (/在造成骷髅头伤害时/.test(desc)) {
    if ((m = /获得\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)/.exec(desc))) {
      return { effects: { onSkullHitGain: { stat: pickStat(m[2]) ?? 'hp', amount: num(m[1]) } } };
    }
    const hit = STATUS_MAP.find(([re]) => re.test(desc));
    if (hit) return { effects: { inflictOnSkullHit: { id: hit[1], turns: 3, magnitude: 1 } } };
    return null;
  }
  // 队伍光环·全体：所有盟友获得 N 点 X / 所有敌人损失 N 点 X
  if ((m = /所有(盟友|敌人)(获得|损失)\s*(\d+)\s*点?(随机技能值|生命值|护甲值|攻击力|魔法值)/.exec(desc))) {
    const stat = m[4] === '随机技能值' ? 'magic' : pickStat(m[4]);
    if (!stat) return null;
    return {
      effects: {
        teamAura: {
          scope: m[1] === '盟友' ? 'allies' : 'enemies',
          stat,
          amount: m[2] === '损失' ? -num(m[3]) : num(m[3]),
        },
      },
    };
  }
  // 回合开始造某色宝石：「在我的回合开始的时候，创建一颗红色宝石。」
  if ((m = /^(?:在)?我的回合开始(?:的时候|时)[，,]?创[建造]一?颗?(.+?)宝石。?$/.exec(desc))) {
    const color = pickColor(m[1]);
    if (!color) return null; // 特殊宝石类型（织网/幽魂/沙漏…）引擎未实现，不收
    return { effects: { turnStartCreateGem: { color } } };
  }
  // 回合开始按概率把某色转成骷髅头（引擎已有骷髅；转成其它特殊宝石的不收）
  if ((m = /^(?:在)?我的回合开始(?:的时候|时)[，,]?有\s*(\d+)%\s*的?几率将一颗(.+?)宝石转换成骷髅头。?$/.exec(desc))) {
    const color = pickColor(m[2]);
    if (!color) return null;
    return { effects: { turnStartColorToSkull: { color, chance: num(m[1]) / 100 } } };
  }
  // 骷髅伤害无视护甲：骷髅头伤害有 N% 的几率略过护甲值
  if ((m = /^骷髅头伤害有\s*(\d+)%\s*的?几率略过护甲值/.exec(desc))) {
    return { effects: { armorPierceChance: num(m[1]) / 100 } };
  }
  // 屠戮类：对<族/色>军队造成双倍/N 倍骷髅头伤害
  if ((m = /^对(.+?)(?:军队)?造成(双|三|\d+)倍骷髅头伤害/.exec(desc))) {
    const mult = m[2] === '双' ? 2 : m[2] === '三' ? 3 : num(m[2]);
    const target = m[1].replace(/军队$/, '');
    // 先看是不是颜色（红色军队…），再看种族，最后看状态/状况
    const color = pickColor(target);
    if (color) return { effects: { skullMultVsColor: { color, mult } } };
    const troopType = TROOP_TYPE_MAP[target] ?? TROOP_TYPE_MAP[`${target}族`];
    if (troopType) return { effects: { skullMultVsTroopType: { troopType, mult } } };
    const cond = parseDamageCondition(target);
    if (cond) return { effects: cond.status ? { skullMultVsStatus: { status: cond.status, mult } } : { skullMultVsWounded: mult } };
    return null;
  }
  // 「基于我已晋升的稀有度对<族>造成 3 到 5 倍伤害」：晋升度本作未建模，取区间下限
  if ((m = /^基于我已晋升的稀有度对(.+?)造成\s*(\d+)\s*到\s*(\d+)\s*倍伤害/.exec(desc))) {
    const troopType = TROOP_TYPE_MAP[m[1]] ?? TROOP_TYPE_MAP[`${m[1]}族`];
    if (!troopType) return null;
    return { effects: { skullMultVsTroopType: { troopType, mult: num(m[2]) } } };
  }
  // 施法响应：当一名盟友/敌人施放法术时获得 N 点 X（整条锚定，排除带种族范围的变体）
  if ((m = /^(?:当|在)一?名?(盟友|敌人)施(?:放|法)法?术?时[，,]?获得\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)。?$/.exec(desc))) {
    const stat = pickStat(m[3]);
    if (!stat) return null;
    const key = m[1] === '盟友' ? 'onAllyCastGain' : 'onEnemyCastGain';
    return { effects: { [key]: { stat, amount: num(m[2]) } } };
  }
  // 阵亡响应：当敌人/一名盟友身亡时获得 N 点 X
  if ((m = /^(?:当|在)(?:一名)?(敌人|盟友)身亡时[，,]?获得\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值|法力值)。?$/.exec(desc))) {
    const stat = m[3] === '法力值' ? 'mana' : pickStat(m[3]);
    if (!stat) return null;
    const key = m[1] === '敌人' ? 'onEnemyDeathGain' : 'onAllyDeathGain';
    return { effects: { [key]: { stat, amount: num(m[2]) } } };
  }
  // 4/5 连：在配对 4 或 5 颗宝石时，获得 N 点 X（只收「自身获得」这一类）
  if ((m = /^在配对\s*4\s*或\s*5\s*颗宝石时[，,]?获得\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)。?$/.exec(desc))) {
    const stat = pickStat(m[2]);
    if (!stat) return null;
    return { effects: { onBigMatchGain: { stat, amount: num(m[1]) } } };
  }
  // 4+ 连给全队：「在配对 4 或更多宝石的时候，给予所有盟友 N 颗/点 X」。
  // 引擎的 4/5 连触发本就作用于匹配方全队，因此与上一条同一实现。
  if ((m = /^在?配对\s*4\s*(?:或)?更?多?颗?宝石的?时?候?[，,]?给[予]?所有盟友\s*(\d+)\s*[颗点](生命值|护甲值|攻击力|魔法值)。?$/.exec(desc))) {
    const stat = pickStat(m[2]);
    if (!stat) return null;
    return { effects: { onBigMatchGain: { stat, amount: num(m[1]) } } };
  }
  // 配色触发：在配对<色>宝石时获得 N 点 X
  if ((m = /^在?配对(.+?)宝石时获得\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)。?$/.exec(desc))) {
    const color = pickColor(m[1]);
    const stat = pickStat(m[3]);
    if (!color || !stat) return null;
    return { effects: { onColorMatchGain: { color, stat, amount: num(m[2]) } } };
  }
  // 反弹 N% 的骷髅头伤害
  if ((m = /^反弹\s*(\d+)%\s*的骷髅头伤害/.exec(desc))) {
    return { effects: { reflectSkullRatio: num(m[1]) / 100 } };
  }
  // 有 N% 的几率闪避骷髅头伤害
  if ((m = /^有\s*(\d+)%\s*的?几率闪避骷髅头伤害/.exec(desc))) {
    return { effects: { dodgeChance: num(m[1]) / 100 } };
  }
  // 种族光环：<族>盟友获得 N 点 X。整条锚定，避免把「当…时，所有<族>…」这类条件光环误收
  // 注意分隔符只能写「盟友」：写成 (?:盟友|族盟友) 会让惰性组把「蛮族」的族字
  // 让给分隔符，m[1] 变成「蛮」而查不到映射。
  if ((m = /^(.+?)盟友获得\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)。?$/.exec(desc))) {
    const troopType = TROOP_TYPE_MAP[m[1]] ?? TROOP_TYPE_MAP[`${m[1]}族`];
    const stat = pickStat(m[3]);
    if (troopType && stat) {
      return { effects: { typeAura: { troopType, stat, amount: num(m[2]) } } };
    }
    return null;
  }
  // 光环·计数：每有一名<色>盟友则获得 N 点 X
  if ((m = /每有一名(.+?)盟友则获得\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)/.exec(desc))) {
    const color = pickColor(m[1]);
    const stat = pickStat(m[3]);
    if (!color || !stat) return null;
    return { effects: { perAllyColor: { color, stat, amount: num(m[2]) } } };
  }
  // 法力灵链：在配对<色>宝石时获得额外的<色>法力
  if (/获得额外的/.test(desc) && /法力/.test(desc)) {
    if (/所有宝石/.test(desc)) return { effects: { manaLink: { color: '*', amount: 1 } } };
    const color = pickColor(desc);
    if (!color) return null;
    return { effects: { manaLink: { color, amount: 1 } } };
  }
  return null;
}

const raw = JSON.parse(fs.readFileSync(IN, 'utf8'));
const info = new Map();
for (const r of raw.troops) {
  for (const t of r.stats?.traits ?? []) {
    if (!info.has(t.code)) info.set(t.code, { name: t.name, description: t.description, troops: 0 });
    info.get(t.code).troops += 1;
  }
}

const out = [];
const skipped = [];
for (const [code, v] of [...info].sort((a, b) => b[1].troops - a[1].troops)) {
  const parsed = parse(v.description);
  if (parsed) {
    out.push({ code, name: v.name, description: v.description, troops: v.troops, ...parsed.effects });
  } else {
    skipped.push({ code, ...v });
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8');

const coverage = out.reduce((s, x) => s + x.troops, 0);
const skippedCoverage = skipped.reduce((s, x) => s + x.troops, 0);
console.log(`已实现特质: ${out.length} 个 code，覆盖 ${coverage} 次兵种出场`);
console.log(`未实现特质: ${skipped.length} 个 code，覆盖 ${skippedCoverage} 次出场`);
const byMechanic = new Map();
for (const s of skipped) {
  const key = UNSUPPORTED_STATUS.test(s.description) ? '缺状态/机制'
    : /召唤/.test(s.description) ? '缺召唤钩子'
      : /宝石/.test(s.description) ? '缺棋盘钩子'
        : /盟友获得|盟友\s*\d/.test(s.description) ? '缺种族光环（需中文种族名映射）'
          : /施放法术时/.test(s.description) ? '缺施法响应钩子'
            : /配对\s*4\s*或\s*5/.test(s.description) ? '缺 4/5 连钩子'
              : /闪避/.test(s.description) ? '缺闪避钩子'
                : /反弹/.test(s.description) ? '缺反弹钩子'
                  : /身亡时/.test(s.description) ? '缺阵亡钩子'
                    : '其它';
  byMechanic.set(key, (byMechanic.get(key) ?? 0) + 1);
}
console.log('未实现原因分布:');
for (const [k, n] of [...byMechanic].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(28)}${n}`);
