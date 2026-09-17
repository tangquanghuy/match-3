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

/** 中文状态名 → 引擎状态 id。缠绕（攻击归零）与织网（魔力归零）是两个状态，按官方拆分。 */
const STATUS_MAP = [
  [/中毒/, 'poison'],
  [/燃烧|妖火/, 'burning'],
  [/冻结|冰冻/, 'frozen'],
  [/沉默/, 'silence'],
  [/缠绕|纠缠/, 'entangle'],
  [/织网/, 'web'],
  [/击晕|眩晕/, 'stun'],
];

/**
 * 特质可救批（T1 免疫 + T3 骷髅命中）扩展状态映射：这些状态本体在引擎里已落地
 * （skills/effects/status.ts：death-mark/marked/curse/disease/bleed/terror 均有结算），
 * 只是 STATUS_MAP 当年没收。并入免疫、骷髅命中/受击附状态与屠戮条件三类规则
 * （屠戮条件经 DAMAGE_CONDITION_MAP 消费扩展表——cursehunter/virulence/doom 等
 * 「对陷入X状态的敌人造成双倍骷髅头伤害」）；大连光环仍走自己的 AURA_STATUS_MAP，
 * 不并此表（两表范围不同：光环按「施加」，屠戮按「条件命中」）。
 */
const RESCUE_STATUS_MAP = [
  [/死亡标记/, 'death-mark'],
  [/猎人标记/, 'marked'],
  [/受诅|诅咒/, 'curse'],
  [/疾病/, 'disease'],
  [/出血/, 'bleed'],
  [/恐怖/, 'terror'],
];

/** 免疫 / 骷髅命中附状态规则的完整查找表：基础表在前（保持既有命中次序），扩展表在后 */
const RESCUE_FULL_STATUS_MAP = [...STATUS_MAP, ...RESCUE_STATUS_MAP];

/**
 * 双状态诅咒族的机器翻译错字定点修正（仅双状态拆段分支生效，不做全局映射）：
 * diseasedcurse 官方名「疾病诅咒」（Diseased Curse = Curse + Disease），dump 描述把
 * Disease 误译作「击败」；按特质名与官方机制逐字核对后映射 disease，其余状态不在此列。
 */
const DUAL_STATUS_ALIAS = { 击败: 'disease' };

/** DoT 状态施加时带 magnitude:1（bleed 与 poison/burning 同为每回合跳伤的攻击性 DoT） */
const isDotStatus = (id) => id === 'poison' || id === 'burning' || id === 'bleed';
/** 引擎尚未实现的状态/机制关键词，用于报告 */
const UNSUPPORTED_STATUS = /疾病|狼化|死亡标记|吞噬|法力燃烧|法力耗尽|法力窃取|恐怖|出血|猎人标记|受诅|转化|屏障|下潮|狂怒|法印|风暴/;

const COLOR_MAP = [
  [/蓝色/, 'Blue'], [/绿色/, 'Green'], [/红色/, 'Red'],
  [/黄色/, 'Yellow'], [/紫色/, 'Purple'], [/棕色/, 'Brown'],
];

const STAT_MAP = [
  [/生命值/, 'hp'], [/护甲值/, 'armor'], [/攻击力/, 'attack'], [/魔法值/, 'magic'], [/技能值/, 'magic'],
  // 「提供 4 点护甲」（celestialbarrier）不带「值」：放最后兜底，避免抢走「护甲值」的匹配
  [/护甲/, 'armor'],
];

/**
 * 条件光环可施加的状态 = 引擎已落地的状态本体全集（**不**并入全局 STATUS_MAP——
 * 免疫/命中附状态等其它规则的接线属于状态批，不在本批范围）。
 * bleed 等攻击性 DoT 施加时带 magnitude:1（与命中附状态口径一致）。
 */
const AURA_STATUS_MAP = [
  [/冻结|冰冻/, 'frozen'],
  [/出血/, 'bleed'],
  [/中毒/, 'poison'],
  [/燃烧|妖火/, 'burning'],
  [/屏障/, 'barrier'],
  [/狂怒/, 'rage'],
  [/下潜|下潮/, 'submerged'],
  [/反射/, 'reflect'],
  [/赐福|祝福/, 'blessed'],
  [/诅咒/, 'curse'],
  [/魅惑/, 'charm'],
  [/疾病/, 'disease'],
  [/死亡标记/, 'death-mark'],
  [/缠绕|纠缠/, 'entangle'],
  [/织网/, 'web'],
  [/击晕|眩晕/, 'stun'],
  [/沉默/, 'silence'],
  // T5 批补收：恐怖本体在 T1/T3 批已落地（status.ts TERROR_STATUS_ID），当时条件光环
  // 映射表没收是历史时序问题；terrorqueen/gapingwounds/icyterror 三条靠它入大连施加。
  [/恐怖/, 'terror'],
  // T5 配色状态批补收：猎人标记本体同在 T1/T3 批落地（status.ts MARK_STATUS_ID，
  // RESCUE_STATUS_MAP 早有映射），huntersmoon「配对红色→随机猎人标记」是首条施加句。
  [/猎人标记/, 'marked'],
];
/** 引擎尚无对应状态本体：含这些词的条件光环句子整体不收（不做缺状态的半解析） */
const AURA_UNKNOWN_STATUS = /法印|狼化|风暴|石化|催眠|惑乱|迷惑|变羊|吞噬|受诅|嘲讽/;
/** 「随机的正面增益状态效果」（dragonsblessing）的候选池 */
const POSITIVE_STATUS_POOL = [
  { id: 'barrier' }, { id: 'rage' }, { id: 'reflect' }, { id: 'blessed' }, { id: 'enchanted' },
];

/**
 * 「一个随机的状态效果」（experiment「使随机一名敌人陷入一个随机的状态效果」）的候选池：
 * 与引擎 skills/effects/status.ts 的 RANDOM_NEGATIVE_STATUS_POOL 同源（12 项施加管线
 * 已落地的负面状态）。DoT（中毒/燃烧/出血）与全局口径一致带 magnitude:1。
 */
const NEGATIVE_STATUS_POOL = [
  'poison', 'burning', 'bleed', 'silence', 'frozen', 'stun', 'entangle', 'web', 'disease', 'curse', 'death-mark', 'charm',
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
  厄什卡: 'Urska', 罗格: 'Rogue',
  怪兽: 'Monster', // 「怪兽盟友」与「怪物」同义（psychicpulse）
};

const num = (s) => Number(s);

/**
 * 中文特殊宝石名 → 引擎 SpecialGemKind（子串匹配，尾缀「宝石/符」可有可无）。
 * 顺序敏感：超级末日骷髅头先于末日骷髅头、x3 先于 x2。逐条与官方 EN dump
 * （data/raw/troops.gow.en.json）交叉核对：狂怒/愤怒/激怒宝石同为 Enrage Gem、
 * 妖仙宝石=Faerie Fire Gem（faeriesoul 机翻）、蛛网/网络宝石=Web Gem、
 * 死亡印记宝石=Death Mark Gem。不在表内的（狼化/石像鬼/龙族/元素星/法力药剂/
 * 天使/灵魂/恶魔门户/腐烂/魔法/灵力宝石等）= 引擎未实现，命中句式也整体不收。
 */
const SPECIAL_GEM_MAP = [
  [/x3\s*通配/, { kind: 'wildcard', tier: 3 }],
  [/x2\s*通配/, { kind: 'wildcard', tier: 2 }],
  [/超级末日骷髅头/, { kind: 'uberDoomSkull' }],
  [/末日骷髅头/, { kind: 'doomSkull' }],
  [/织网|蛛网|网络/, { kind: 'web' }],
  [/燃烧/, { kind: 'burningGem' }],
  [/冻结/, { kind: 'freezeGem' }],
  [/诅咒/, { kind: 'curseGem' }],
  [/毒/, { kind: 'poisonGem' }],
  [/流血/, { kind: 'bleedGem' }],
  [/恐怖/, { kind: 'terrorGem' }],
  [/死亡标记|死亡印记/, { kind: 'deathMarkGem' }],
  [/纠缠|缠绕/, { kind: 'entangleGem' }],
  [/激怒|愤怒|狂怒/, { kind: 'enrageGem' }],
  [/许愿|愿望/, { kind: 'wish' }],
  [/赃物/, { kind: 'bootyGem' }],
  [/妖火|妖仙/, { kind: 'faerieFireGem' }],
  [/鬼魂/, { kind: 'ghost' }],
  [/屏障/, { kind: 'barrierGem' }],
  [/击晕|眩晕/, { kind: 'stunGem' }],
  [/沉没/, { kind: 'submergeGem' }],
  [/沙漏/, { kind: 'hourglass' }],
  [/炸弹/, { kind: 'bomb' }],
];
const pickSpecialGem = (desc) => SPECIAL_GEM_MAP.find(([re]) => re.test(desc))?.[1];

/** 「N 颗/个/名」计数捕获 → 数字（「一」按 1；无捕获缺省 1；「2 颗」取整数前缀） */
const countOf = (raw) => {
  if (raw === undefined) return 1;
  const s = String(raw).trim();
  if (s[0] === '一') return 1;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 1;
};

/**
 * 回合开始/轮次开始的触发头（T4 创造批共用）：
 * 在/当、我的/我、每一个、回合/轮次开始、的时候/时 全部可选；「轮到我行动时」独立分支
 * （chaoticdesire/silkenweave 的官方译法）。
 */
const TURN_START_HEAD = String.raw`(?:(?:当|在)?(?:我的|我)?(?:每一个|每一)?(?:回合|轮次)开始(?:的时候|时)?|轮到我行动时)`;

/**
 * 屠戮条件的可用状态全集（O 桶高频批）：基础表 + 特质可救批扩展表 + 下潜。
 * 下潜（submerged）本体在 status.ts 已落地（UNTARGETABLE_STATUS_IDS），命中附状态
 * 映射表没收它是因为没有「命中施加下潜」的官方句式；屠戮条件有（depthcharge
 * 「对已下潜的敌人造成双倍骷髅头伤害」），在此补上。含未落地状态词（法印/吞噬…）
 * 的句子整体不收，不做缺状态半解析。
 */
const DAMAGE_CONDITION_MAP = [...RESCUE_FULL_STATUS_MAP, [/下潜|下潮/, 'submerged']];

/**
 * 解析屠戮类特质的「条件」描述：陷入某状态的敌人 / 被击晕的敌人 / 受伤的敌人。
 * 只认引擎已有的状态；`受伤` 是「当前生命低于上限」的状况，不是状态。
 */
function parseDamageCondition(text) {
  if (/受伤/.test(text)) return { wounded: true };
  const hit = DAMAGE_CONDITION_MAP.find(([re]) => re.test(text));
  return hit ? { status: hit[1] } : null;
}
const pickColor = (desc) => COLOR_MAP.find(([re]) => re.test(desc))?.[1];
const pickStat = (desc) => STAT_MAP.find(([re]) => re.test(desc))?.[1];

/** 触发类特质的属性词 → 引擎 stat（含随机技能值→magic、法力值→mana 的既有约定） */
const pickTriggerStat = (word) => (word === '随机技能值' ? 'magic' : word === '法力值' ? 'mana' : pickStat(word));

/**
 * 解析共享数值的属性列表（条件光环族）：「攻击力、护甲值和生命值」「生命值和魔法值」
 * 「全部技能值」（四项各 N）「随机技能值」（→ magic）。解析不了返回 null。
 */
function parseGainsList(text, value) {
  const gains = {};
  for (const part of text.split(/[、和，]/).map((s) => s.trim()).filter(Boolean)) {
    if (/^全部技能/.test(part)) {
      gains.hp ??= value; gains.armor ??= value; gains.attack ??= value; gains.magic ??= value;
      continue;
    }
    const stat = pickTriggerStat(part);
    if (!stat) return null;
    gains[stat] ??= value;
  }
  return Object.keys(gains).length > 0 ? gains : null;
}

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
  // 法力操作免疫（manashield「对法力灼烧、法力耗尽和法力窃取免疫」，O 桶判读批）：
  // 三个动词都是**效果操作**不是状态——引擎唯一的法力削减入口是 skills/effects/debuff.ts
  // 的 reduceEffect（stat='mana' 同时覆盖耗蓝/耗尽/减半/窃取），落 manaOpsImmunity 在执行
  // 入口对带此被动的目标整体跳过。「灼烧」另对应引擎已识别的 mana-burn 状态 id
  // （status.ts MANA_BURN_STATUS_IDS，自动消退集合成员），一并挂 statusImmunities：
  // 现在就挡技能施加端，将来有 DoT 式法力燃烧结算也自动免疫。
  if (/^对法力灼烧、法力耗尽和法力窃取免疫。?$/.test(desc)) {
    return { effects: { manaOpsImmunity: true, statusImmunities: ['mana-burn'] } };
  }
  // 免疫：对 X、Y 免疫（T1 批：warded/cunning/brave/immune——「对疾病和狼化免疫」的
  // 狼化引擎未实现，按映射表只收疾病，不做缺状态半解析）
  if (/免疫/.test(desc)) {
    if (/所有状态效果/.test(desc)) return { effects: { statusImmunities: ['*'] } };
    const ids = RESCUE_FULL_STATUS_MAP.filter(([re]) => re.test(desc)).map(([, id]) => id);
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
  // 受击下潜（aquatic「在自身受到伤害时使自身下潜」，O 桶判读批）：与 onDamagedGain
  // 同一触发点（骷髅受击结算处），落新字段 onDamagedStatus。下潜本体已落地
  // （status.ts UNTARGETABLE_STATUS_IDS）；回合数与特质批大连施加的下潜（tsunami 族
  // onBigMatchStatus turns:3）同口径取 3。
  if (/^在自身受到伤害时使自身下潜。?$/.test(desc)) {
    return { effects: { onDamagedStatus: { statusId: 'submerged', turns: 3 } } };
  }
  // 命中附带：在造成骷髅头伤害时 …状态
  if (/在造成骷髅头伤害时/.test(desc)) {
    if ((m = /获得\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)/.exec(desc))) {
      return { effects: { onSkullHitGain: { stat: pickStat(m[2]) ?? 'hp', amount: num(m[1]) } } };
    }
    // 忽略护甲（savagestrike「…有 100% 的几率忽略护甲值」）：与 armorpiercing/trueshot 的
    // 「略过护甲值」同一引擎机制，按语义映射到 armorPierceChance（T3 批逐条核对）。
    if ((m = /有\s*(\d+)%\s*的?几率忽略护甲值/.exec(desc))) {
      return { effects: { armorPierceChance: num(m[1]) / 100 } };
    }
    const hit = RESCUE_FULL_STATUS_MAP.find(([re]) => re.test(desc));
    if (hit) {
      // magnitude 语义按状态而异：DoT 是每回合伤害；web 是挣脱几率（缺省 10%，由引擎管理）。
      // 因此只给 DoT 带 magnitude，其余状态不带。
      const isDot = isDotStatus(hit[1]);
      return {
        effects: {
          inflictOnSkullHit: isDot
            ? { id: hit[1], turns: 3, magnitude: 1 }
            : { id: hit[1], turns: 3 },
        },
      };
    }
    return null;
  }
  // 承受骷髅伤害附状态（毒孢子族）：被打时反手给攻击者上状态。
  // 句式有「使敌人中毒」「使敌人陷入X状态」两种；DoT 带 magnitude:1，其余不带
  if (/^在承受骷髅头伤害时[，,]?使敌人/.test(desc)) {
    const hit = RESCUE_FULL_STATUS_MAP.find(([re]) => re.test(desc));
    if (!hit) return null;
    const isDot = isDotStatus(hit[1]);
    return {
      effects: {
        inflictOnSkullDamaged: isDot
          ? { id: hit[1], turns: 3, magnitude: 1 }
          : { id: hit[1], turns: 3 },
      },
    };
  }
  // 骷髅受击附状态·变体句式（T3 批逐条核对官方描述）：毒孢子句式之外的三种译法——
  //   revenge/magmahide「在自身受到骷髅头伤害时，使对方陷入X状态」
  //   serenity/scalding「在敌方/敌人对自身造成骷髅头伤害时，使对方陷入X状态」
  //   frozensoul「当承受骷髅头伤害时冻结敌人」（动词句，无「陷入…状态」）
  // 与毒孢子同一字段（inflictOnSkullDamaged）。
  // 双状态诅咒族（T2 批：frozencurse 等「使其陷入诅咒和X状态」）要一次施加两条状态，
  // 落到新字段 inflictOnSkullDamagedList：按「和」拆段逐个映射，**全部命中才收**（不做
  // 半解析）；条目顺序与描述一致，DoT 段带 magnitude:1，与单状态口径相同。
  if (/^(?:在自身受到|在敌[方人]对自身造成|当承受)骷髅头伤害时/.test(desc)) {
    const captured = /使(?:对方|其)陷入(.+?)状态/.exec(desc) ?? /当承受骷髅头伤害时(.+?)敌人/.exec(desc);
    const text = captured?.[1];
    if (!text) return null;
    if (/和/.test(text)) {
      const ids = text
        .split('和')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((part) => RESCUE_FULL_STATUS_MAP.find(([re]) => re.test(part))?.[1] ?? DUAL_STATUS_ALIAS[part]);
      if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return null;
      return {
        effects: {
          inflictOnSkullDamagedList: ids.map((id) => (isDotStatus(id)
            ? { id, turns: 3, magnitude: 1 }
            : { id, turns: 3 })),
        },
      };
    }
    const hit = RESCUE_FULL_STATUS_MAP.find(([re]) => re.test(text));
    if (!hit) return null;
    const isDot = isDotStatus(hit[1]);
    return {
      effects: {
        inflictOnSkullDamaged: isDot
          ? { id: hit[1], turns: 3, magnitude: 1 }
          : { id: hit[1], turns: 3 },
      },
    };
  }
  // 骷髅匹配附状态（feartouch「在配对骷髅头使使敌人陷入恐怖状态」——dump 的「使使」
  // 为机翻叠字，按「配对骷髅头时使敌人陷入X状态」理解；匹配骷髅即造成骷髅伤害，
  // 与 T3 骷髅命中族同一字段 inflictOnSkullHit 同一口径）。DoT 带 magnitude:1，其余不带；
  // 状态词查不到整体不收，不做半解析。
  if ((m = /^(?:在)?配对骷髅头(?:宝石)?时?[，,]?使+敌人陷入(.+?)状态。?$/.exec(desc))) {
    const hit = RESCUE_FULL_STATUS_MAP.find(([re]) => re.test(m[1]));
    if (!hit) return null;
    const isDot = isDotStatus(hit[1]);
    return {
      effects: {
        inflictOnSkullHit: isDot
          ? { id: hit[1], turns: 3, magnitude: 1 }
          : { id: hit[1], turns: 3 },
      },
    };
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
  // —— 回合开始创造特殊宝石（T4 创造批）——必须先于下面的纯色规则：
  // 纯色规则对「命中句式但颜色不识别」会提前 return null，会吞掉特殊宝石句。
  // A. 创造型（spidersilk 25%织网 / haunted 鬼魂 / eyeofdestruction 末日骷髅…）：
  //    概率、数量皆可选（无数量句 = 1 颗）。宝石名不在 SPECIAL_GEM_MAP 的
  //    （风暴/元素星/狼化/石像鬼…）不拦截，落回后续规则留在未实现桶。
  if ((m = new RegExp(`^${TURN_START_HEAD}[，,]?\\s*(?:有\\s*(\\d+)\\s*%\\s*的?几[率会]\\s*)?(?:创[建造成]|生成)出?\\s*(?:(一|\\d+)\\s*[颗个])?\\s*(.+?)。?$`).exec(desc))) {
    const gem = pickSpecialGem(m[3]);
    if (gem) {
      return {
        effects: {
          turnStartCreateSpecialGem: {
            gem: gem.kind,
            ...(gem.tier !== undefined ? { tier: gem.tier } : {}),
            count: countOf(m[2]),
            ...(m[1] !== undefined ? { chance: num(m[1]) / 100 } : {}),
          },
        },
      };
    }
  }
  // B. 转化型（redrage 红2→燃烧 / embers / daemonsmark 骷髅2→末日骷髅 / temporal 黄→沙漏…）：
  //    来源只认六色或骷髅头（末日族不算普通骷髅），目标必须是 SPECIAL_GEM_MAP 内的特殊宝石；
  //    未命中（bonepile 的「转换成骷髅头」/ 狼化宝石等）不拦截，落回后续规则。
  if ((m = new RegExp(`^${TURN_START_HEAD}[，,]?\\s*(?:有\\s*(\\d+)\\s*%\\s*的?几[率会]\\s*)?将\\s*(?:(一|\\d+)\\s*[颗个名])?\\s*(.+?)宝石?转[换化][为成]\\s*(.+?)(?:宝石)?。?$`).exec(desc))) {
    const gem = pickSpecialGem(m[4]);
    const src = m[3] === '骷髅头' ? 'skull' : pickColor(m[3]);
    if (gem && src) {
      return {
        effects: {
          turnStartColorToSpecial: {
            color: src,
            gem: gem.kind,
            ...(gem.tier !== undefined ? { tier: gem.tier } : {}),
            count: countOf(m[2]),
            ...(m[1] !== undefined ? { chance: num(m[1]) / 100 } : {}),
          },
        },
      };
    }
  }
  // 回合开始造某色宝石：「在我的回合开始的时候，创建一颗红色宝石。」
  // T4 扩展：前缀放宽到 当/我/轮次开始、数量可选（intothevoid「创造 2 颗紫色宝石」、
  // lightningaura「创造 2 颗黄色闪电宝石」按官方文本收 count）。
  if ((m = /^(?:当|在)?(?:我的|我)?回合开始(?:的时候|时)?[，,]?创[建造]\s*(一[颗个]|\d+\s*[颗个])?(.+?)宝石。?$/.exec(desc))) {
    const color = pickColor(m[2]);
    if (!color) return null; // 特殊宝石类型不在映射表，整体不收
    return { effects: { turnStartCreateGem: { color, ...(m[1] ? { count: countOf(m[1]) } : {}) } } };
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
  // 敌人身亡时自身获得状态（bloodlust「在敌人身亡时获得狂怒效果」）：rage 本体已落地
  // （RAGE_STATUS_IDS），施加回合数与大连施加的狂怒（provocation）同口径取 3。
  // 只收引擎已落地的四个正面状态，其余词不命中即整体不收。
  if ((m = /^(?:当|在)(?:一名)?敌人身亡时[，,]?获得(狂怒|屏障|反射|赐福)效果。?$/.exec(desc))) {
    const id = { 狂怒: 'rage', 屏障: 'barrier', 反射: 'reflect', 赐福: 'blessed' }[m[1]];
    return { effects: { onEnemyDeathStatus: { id, turns: 3 } } };
  }
  // 种族限定的敌人身亡光环（lordofdeath「所有不死族在一名敌人身亡时获得 5 点生命值和
  // 魔法值」）：受益者为持有者一方该种族的存活盟友（含持有者）。种族查表失败按未实现
  // 归类，不硬猜。
  if ((m = /^所有(.+?)在一名敌人身亡时[，,]?获得\s*(\d+)\s*点(.+?)。?$/.exec(desc))) {
    const troopType = TROOP_TYPE_MAP[m[1]] ?? TROOP_TYPE_MAP[`${m[1]}族`];
    const gains = parseGainsList(m[3], num(m[2]));
    if (!troopType || !gains) return null;
    return { effects: { onEnemyDeathTypeAura: { troopType, gains } } };
  }
  // 敌人身亡时使另一名敌人陷入状态（sharedfate「在一名敌人身亡时，使另一名敌人陷入死亡
  // 标记状态」）：目标取死者一方队伍序首个存活（引擎侧确定性结算）；状态本体查不到不收。
  if ((m = /^在一名敌人身亡时[，,]?使另一名敌人陷入(.+?)状态。?$/.exec(desc))) {
    const hit = RESCUE_FULL_STATUS_MAP.find(([re]) => re.test(m[1]));
    if (!hit) return null;
    return { effects: { onEnemyDeathEnemyStatus: { id: hit[1], turns: 3 } } };
  }
  // 身亡经济（valuable「在自身身亡时获得 25 黄金」，O 桶判读批）：死者本人持有的
  // 战场经济入账，复用条件经济批的 creditEconomy 口径（economy[currency] += amount
  // 并发 economy-gain 事件）；持有者币种超出黄金/灵魂句式的（宝石）不硬猜，不收。
  if ((m = /^在自身身亡时获得\s*(\d+)\s*(黄金|灵魂)。?$/.exec(desc))) {
    return { effects: { onDeathEconomy: { currency: m[2] === '黄金' ? 'gold' : 'souls', amount: num(m[1]) } } };
  }
  // 身亡创造特殊宝石（T4 批 unstablecore「在我身亡时创造 3 颗炸弹宝石」）：身亡/死亡/
  // 死后三种译法都收；宝石名不在映射表的（carcass 腐烂的宝石）不拦截，留在未实现桶。
  if ((m = /^在?我(?:身亡时|死亡时|死[后亡])时?[，,]?创[建造成]出?\s*(一|\d+)\s*[颗个]\s*(.+?)(?:宝石)?。?$/.exec(desc))) {
    const gem = pickSpecialGem(m[2]);
    if (gem) {
      return {
        effects: {
          onDeathCreateGem: {
            gem: gem.kind,
            ...(gem.tier !== undefined ? { tier: gem.tier } : {}),
            count: countOf(m[1]),
          },
        },
      };
    }
  }
  // sacrifice「当一名敌人身亡时，所有技能增加 3 点」：技能值按既有约定映射 magic
  // （STAT_MAP「技能值→magic」/ pickTriggerStat「随机技能值→magic」同源的 randomStat 口径）。
  if ((m = /^(?:当|在)(?:一名)?敌人身亡时[，,]?所有技能增加\s*(\d+)\s*点。?$/.exec(desc))) {
    return { effects: { onEnemyDeathGain: { stat: 'magic', amount: num(m[1]) } } };
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
  // 条件经济光环·大连版（条件经济批）：「在配对 4 或 5 颗宝石时，获得额外 N 黄金/灵魂」
  // → onBigMatchEconomy。黄金=gold、灵魂=souls；minSize 缺省 4（官方「4 或 5 颗」口径
  // = 任意大连，与 onBigMatchStatus 的 minSize 缺省同款）。
  if ((m = /^在配对\s*4\s*或\s*5\s*颗宝石时[，,]?获得额外\s*(\d+)\s*(黄金|灵魂)。?$/.exec(desc))) {
    return { effects: { onBigMatchEconomy: { currency: m[2] === '黄金' ? 'gold' : 'souls', amount: num(m[1]) } } };
  }
  // 条件经济光环·骷髅版：「在配对骷髅头时，获得 N 个灵魂/黄金」（darkensouls）
  // → onSkullMatchEconomy，骷髅匹配触发点结算（与 diamondaura/rancor 的 'skull' 键同一结算口径）。
  if ((m = /^在配对骷髅头(?:宝石)?时[，,]?获得\s*(\d+)\s*[个点](黄金|灵魂)。?$/.exec(desc))) {
    return { effects: { onSkullMatchEconomy: { currency: m[2] === '黄金' ? 'gold' : 'souls', amount: num(m[1]) } } };
  }
  // 4/5 连给予盟友（firstwargare/overclock/celestialsage…）：种族限定或全队，
  // 支持「N 点 X 和 Y」双属性共享数值（两个属性各得 N）。种族查表失败按未实现归类，不硬猜。
  if ((m = /^[当在]?配对\s*4\s*颗?\s*或\s*(?:更?多|5)\s*颗?宝石的?时?候?[，,]?\s*给予(.+?)盟友\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)(?:和(?:\s*(\d+)\s*点)?(生命值|护甲值|攻击力|魔法值))?[，,]?。?$/.exec(desc))) {
    const scopeName = m[1];
    // 「所有」= 全队；「所有机械」= 先剥掉「所有」再查种族映射
    const lookupName = scopeName === '所有' ? null : scopeName.replace(/^所有/, '');
    const troopType = lookupName === null
      ? 'all'
      : (TROOP_TYPE_MAP[lookupName] ?? TROOP_TYPE_MAP[`${lookupName}族`] ?? TROOP_TYPE_MAP[lookupName.replace(/族$/, '')]);
    const stat1 = pickStat(m[3]);
    if (!troopType || !stat1) return null;
    const gains = { [stat1]: num(m[2]) };
    if (m[5]) {
      const stat2 = pickStat(m[5]);
      if (!stat2) return null;
      gains[stat2] = num(m[4] ?? m[2]);
    }
    return { effects: { onBigMatchTypeAura: { troopType, gains } } };
  }
  // —— 条件光环批（窗口 E）新句式，接在上面的 4/5 连规则之后 ——

  // 4+ 连自身增益·长尾：「在配对 4 颗或更多宝石时，获得 4 点攻击力」（huntress，句尾无句号）
  // 「在配对 4 或更多宝石时， 获得 3 点法力值」（crystallizedmana，法力值→mana）。
  // 「在配对 5 或 5 颗宝石时」（insanegrowth，官方文本如此）→ 两个数字相同 = 只认 5 连，走 minSize 限定字段。
  if ((m = /^在?配对\s*(\d+)\s*颗?\s*或\s*(?:(\d+)\s*颗?|更?多)\s*[颗个]?宝石的?时?候?[，,]?\s*获得\s*(\d+)\s*点?(随机技能值|生命值|护甲值|攻击力|魔法值|法力值)\s*。?$/.exec(desc))) {
    const stat = pickTriggerStat(m[4]);
    if (!stat) return null;
    const n1 = num(m[1]);
    const n2 = m[2] !== undefined ? num(m[2]) : null; // null =「或更多」
    if (n2 !== null && n1 === n2) {
      return { effects: { onBigMatchSizedGain: { minSize: n1, stat, amount: num(m[3]) } } };
    }
    return { effects: { onBigMatchGain: { stat, amount: num(m[3]) } } };
  }
  // 4+ 连团队增益·长尾（条件光环主体，16 code）：两种动词都收——
  //   「所有哥布林盟友获得 5 点生命值」（获得）/「给所有牛头族盟友 1 点攻击力、护甲值和生命值」（给/给予）
  //   「所有野兽军队获得 …」（军队后缀）/「当配对4个或更多宝石时，所有罗格盟友获得2点魔法值」（个、无空格）
  //   「在配对 4 或更多宝石是，给予怪兽盟友 2 点随机技能值」（官方文本「是」为「时」之误）
  // 属性表支持共享数值多属性与「全部技能值」（giftof* 族 = 四项各 N）。
  if ((m = /^[当在]?配对\s*4\s*[颗个]?\s*或\s*(?:更?多|5)\s*[颗个]?宝石的?[时是]候?[，,]?\s*(.+)$/.exec(desc))) {
    const bm = /^(?:给予?|使)?\s*所有(.+?)(?:盟友|军队)?获得\s*(\d+)\s*点(.+?)[，,]?。?$/.exec(m[1])
      ?? /^(?:给予?)\s*(?:所有)?(.+?)(?:盟友|军队)?\s*(\d+)\s*点(.+?)[，,]?。?$/.exec(m[1]);
    if (bm) {
      const scopeName = bm[1];
      const troopType = scopeName === ''
        ? 'all'
        : (TROOP_TYPE_MAP[scopeName] ?? TROOP_TYPE_MAP[`${scopeName}族`] ?? TROOP_TYPE_MAP[scopeName.replace(/族$/, '')]);
      const gains = parseGainsList(bm[3], num(bm[2]));
      if (troopType && gains) {
        return { effects: { onBigMatchTypeAura: { troopType, gains } } };
      }
    }
  }
  // 条件光环·净化：「净化所有盟友」= 移除全部负面状态（正面清单与 status.ts 诅咒剥正面一致）。
  //   4+ 连版（royalhoney）/ 配色版（adagio「在配对黄色宝石时净化所有盟友」）。
  if (/净化所有盟友/.test(desc)) {
    if (/^在?配对\s*4\s*[颗个]?\s*或\s*(?:更?多|5)\s*[颗个]?宝石的?时?候?[，,]?净化所有盟友。?$/.test(desc)) {
      return { effects: { onBigMatchCleanse: { minSize: 4 } } };
    }
    if ((m = /^在?配对(.+?)宝石时[，,]?净化所有盟友。?$/.exec(desc))) {
      const color = pickColor(m[1]);
      if (color) return { effects: { onColorMatchCleanse: { color } } };
    }
  }
  // 4/5 连技能伤害（T5 大连伤害批 3 code）：「对一名随机敌人造成 N 点伤害」→ randomEnemy
  // （随机目标走引擎种子化 rng，与大连施加状态的随机分支同口径）、「对所有敌人造成 N 点伤害」
  // → enemyAll。伤害走既有 skill-damage 管线（damageOne）。配色版的同句式
  // （lumpofcoal/dawnslayer/sleetstorm「在配对X色宝石时对…」）属另一触发点，不在此收。
  if ((m = /^在配对\s*4\s*或\s*5\s*颗宝石时[，,]?对一名随机敌人造成\s*(\d+)\s*点伤害。?$/.exec(desc))) {
    return { effects: { onBigMatchDamage: { amount: num(m[1]), scope: 'randomEnemy' } } };
  }
  if ((m = /^在配对\s*4\s*或\s*5\s*颗宝石时[，,]?对所有敌人造成\s*(\d+)\s*点伤害。?$/.exec(desc))) {
    return { effects: { onBigMatchDamage: { amount: num(m[1]), scope: 'enemyAll' } } };
  }
  // 4+ 连敌减（T5 大连敌减批 5 code）：损失/耗掉按纯削减收（本批裁定：只减敌方、不给持有者
  // 进账）。「敌人损失 N 点技能值」（suppression/aspectofplague，无序词=首位存活；技能值→magic
  // 同 STAT_MAP 约定）/「一名随机敌人损失 N 点魔法值」（technomancy）/「耗掉一名随机敌人
  // N 点法力值」（creepinggloom，动词前置；法力值→mana 耗蓝口径）。「4 或 5 颗」与
  // 「4 或更多（颗）」同为任意大连，minSize 缺省 4。「所有敌人损失」（darkness）已被
  // 前面的 teamAura 规则按战斗开始光环收走，落不到这里。
  if ((m = /^在?配对\s*4\s*(?:或\s*5|或更?多)\s*颗?宝石的?时[，,]?(.+)$/.exec(desc))) {
    const dm = /^(?:一名随机敌人|第一名敌人|首位敌人|敌人)?(?:损失|耗掉)(?:一名随机敌人|第一名敌人|首位敌人|敌人)?\s*(\d+)\s*点(魔法值|技能值|攻击力|护甲值|法力值)。?$/.exec(m[1]);
    if (dm) {
      const stat = pickTriggerStat(dm[2]);
      if (stat) {
        return {
          effects: {
            onBigMatchEnemyDrain: {
              stat,
              amount: num(dm[1]),
              scope: /一名随机敌人/.test(m[1]) ? 'randomEnemy' : 'front',
            },
          },
        };
      }
    }
    // 窃取动词只收攻击力句（chillingaura「窃取第一名敌人 2 点攻击力」，按批裁定落纯削减）：
    // 窃取魔法/生命的 4+ 句（darkinfusion「窃取首位敌人 2 点魔法值」等）官方语义是
    // 「敌方削减 + 自身进账」，与本机制的纯 reduce 不合，不硬套、留未实现桶。
    const sm = /^窃取(?:第一名|第一位|首位)敌人\s*(\d+)\s*点攻击力。?$/.exec(m[1]);
    if (sm) {
      return { effects: { onBigMatchEnemyDrain: { stat: 'attack', amount: num(sm[1]), scope: 'front' } } };
    }
  }
  // 大连创造宝石（T4 大连创造批 4 code）：「在配对 4 或更多宝石时（有 N% 几率）创建
  // x2/x3 通配宝石 / 2 颗燃烧宝石」（wildtribe/wildmagic/spectromancy/twinfires）。
  // 「匹配 4 颗或更多宝石时」同义前缀一并收；宝石名不在映射表的（恶/善石像鬼宝石、
  // 暗影星、绿龙宝石）与创造风暴的（deadlywaters 骸骨风暴）不拦截，留在未实现桶。
  if ((m = /^(?:在?配对|匹配)\s*4\s*颗?\s*或\s*更?多\s*颗?\s*宝石的?时[，,]?\s*(?:有\s*(\d+)\s*%\s*的?几[率会]\s*)?(?:创[建造成]|生成)出?\s*(?:(一|\d+)\s*[颗个])?\s*(.+?)(?:宝石|符)?。?$/.exec(desc))) {
    const gem = pickSpecialGem(m[3]);
    if (gem) {
      return {
        effects: {
          onBigMatchCreateGem: {
            gem: gem.kind,
            ...(gem.tier !== undefined ? { tier: gem.tier } : {}),
            count: countOf(m[2]),
            ...(m[1] !== undefined ? { chance: num(m[1]) / 100 } : {}),
          },
        },
      };
    }
  }
  // 配对转换（T5 杂项批 trascend「在配对 4 或 5 颗宝石时，将 N 点生命值替换成 N 点魔法值」）：
  // from 侧减 to 侧加（1:1 交换，持有者自身，不掷随机数）。只收 生命值→魔法值 同额句式，
  // 其余属性/不同额的不硬猜（引擎只落地了这一对）。
  if ((m = /^在配对\s*4\s*或\s*5\s*颗宝石时[，,]?将\s*(\d+)\s*点生命值替换成\s*(\d+)\s*点魔法值。?$/.exec(desc))) {
    if (num(m[1]) === num(m[2])) {
      return { effects: { onBigMatchConvert: { from: 'hp', to: 'magic', amount: num(m[1]) } } };
    }
  }
  // 配对召唤（T5 杂项批 genieslamp/stormflock「在配对 4 或更多（颗）宝石时，有 N% 的几率
  // 召唤一名X」）：复用死亡召唤基建（兵种名经 TROOP_BY_NAME 解析成 troopId/referenceName，
  // TurnEngine 注入召唤口走同一条模板装配+入队管线）。召唤名解析失败不拦截，留在未实现桶。
  if ((m = /^(?:在?配对|匹配)\s*4\s*颗?\s*或\s*(?:更?多|5)\s*颗?宝石的?时[，,]?\s*(?:有\s*(\d+)\s*%\s*的?几[率会]\s*)?召唤一?[名只个头]?(.+?)。?$/.exec(desc))) {
    const troop = resolveSummonedTroop(desc);
    if (troop && !troop.storm) {
      return {
        effects: {
          onBigMatchSummon: {
            chance: m[1] !== undefined ? num(m[1]) / 100 : 1,
            troopId: troop.troopId,
            referenceName: troop.referenceName,
            displayName: m[2].trim(),
          },
        },
      };
    }
  }
  // 配对风暴（T5 杂项批 deadlywaters「在配对 4 或 5 颗宝石时，创造骸骨风暴」）：风暴名查
  // STORM_MAP（骸骨风暴 dropKind 'skull' 同源），TurnEngine 注入风暴设置口（与技能造风暴
  // 同一份全局唯一顶替裁定）。不在映射表的风暴（元素风暴/临界风暴——引擎掉落契约无对应
  // 语义，映射拿不准）不拦截，留在未实现桶。
  if ((m = /^在?配对\s*4\s*颗?\s*或\s*(?:更?多|5)\s*颗?宝石的?时[，,]?(?:创[建造成]|召唤)出?(.+?)。?$/.exec(desc))) {
    const storm = STORM_MAP[m[1]];
    if (storm) {
      return {
        effects: {
          onBigMatchStorm: {
            color: storm.color,
            turns: STORM_TURNS,
            troopId: storm.troopId,
            referenceName: storm.referenceName,
            displayName: m[1],
            ...(storm.dropKind ? { dropKind: storm.dropKind } : {}),
          },
        },
      };
    }
  }
  // 配对即杀（T5 杂项批 deathbelow「在配对 4 或 5 颗宝石时，有 N% 的几率猎杀最后一名敌人」）：
  // 即死概率原语（death-mark 的回合开始 10% 即死先例同族），最后一名=敌方队伍序末位存活
  //（确定性），处决走 defeat 出编队管线。只收「猎杀最后一名敌人」句式。
  if ((m = /^在配对\s*4\s*或\s*5\s*颗宝石时[，,]?有\s*(\d+)\s*%\s*的?几率猎杀最后一名敌人。?$/.exec(desc))) {
    return { effects: { onBigMatchKill: { chance: num(m[1]) / 100, scope: 'lastEnemy' } } };
  }
  // 条件光环·施加状态（屏障/狂怒/下潜/反射/赐福/冻结+出血…）：状态本体均已落地。
  //   DoT（出血/中毒/燃烧）带 magnitude:1；概率句（lotusblessing 50%）收进 chance。
  //   范围按描述词判定：「获得屏障效果」=self / 所有敌人=allEnemies / 一名随机敌人=randomEnemy /
  //   自己=self / 所有盟友=allAllies / 其余（「一名（随机）盟友」）=randomAlly。
  //   含引擎没有的状态本体（恐怖/法印…）的句子整体不收，不做缺状态的半解析；
  //   「创造 N 颗X宝石」是特殊宝石域不在此收（twinfires）；「第一名敌人」收 firstEnemy（dragonvines）；
  //   未命中任何已知状态的（如「获得额外 N 黄金」）同样落回后续规则留在未实现桶。
  if (/^在?配对\s*4/.test(desc) && !AURA_UNKNOWN_STATUS.test(desc) && !/创造|创建/.test(desc)) {
    const chanceM = /有\s*(\d+)%\s*的?几率/.exec(desc);
    const enemyTargeted = /敌人/.test(desc) && !/所有敌人/.test(desc);
    // 敌人指定：随机 → randomEnemy；指定序号（「第一名敌人」dragonvines）→ firstEnemy
    //（引擎按队伍序首个存活确定性结算，不掷随机数）；其余序词不硬猜
    const scope = /获得屏障效果/.test(desc) ? 'self'
      : /所有敌人/.test(desc) ? 'allEnemies'
        : (enemyTargeted && /随机|任意/.test(desc)) ? 'randomEnemy'
          : (enemyTargeted && /第一名敌人|第一位敌人|首位敌人/.test(desc)) ? 'firstEnemy'
            : enemyTargeted ? null
              : /自己/.test(desc) ? 'self'
                : /所有盟友/.test(desc) ? 'allAllies'
                  : 'randomAlly';
    let statuses = null;
    let randomPositive = false;
    let randomNegative = false;
    if (/一个随机的状态效果/.test(desc)) {
      // 随机负面池（experiment「使随机一名敌人陷入一个随机的状态效果」）：池与引擎
      // RANDOM_NEGATIVE_STATUS_POOL 同源，DoT 带 magnitude:1；引擎侧 rng 掷一条
      statuses = NEGATIVE_STATUS_POOL.map((id) => (isDotStatus(id) ? { id, magnitude: 1 } : { id }));
      randomNegative = true;
    }
    else if (/屏障效果/.test(desc)) statuses = [{ id: 'barrier' }];
    else if (/反射效果/.test(desc)) statuses = [{ id: 'reflect' }];
    else if (/下潜/.test(desc)) statuses = [{ id: 'submerged' }];
    else if (/正面增益状态效果/.test(desc)) { statuses = POSITIVE_STATUS_POOL; randomPositive = true; }
    else if (/赐福/.test(desc)) statuses = [{ id: 'blessed' }];
    else if (/狂怒/.test(desc)) statuses = [{ id: 'rage' }];
    else {
      // 复合状态（bloodcoldrage「陷入冻结和出血状态」/ bloodmark「所有敌人陷入出血」）：按映射表收全部命中
      const found = AURA_STATUS_MAP.filter(([re]) => re.test(desc)).map(([, id]) => id);
      if (found.length > 0) {
        statuses = [...new Set(found)].map((id) => (id === 'poison' || id === 'burning' || id === 'bleed' ? { id, magnitude: 1 } : { id }));
      }
    }
    if (scope !== null && statuses) {
      return {
        effects: {
          onBigMatchStatus: {
            scope,
            statuses,
            turns: 3,
            ...(chanceM ? { chance: num(chanceM[1]) / 100 } : {}),
            ...(randomPositive ? { randomPositive: true } : {}),
            ...(randomNegative ? { randomNegative: true } : {}),
          },
        },
      };
    }
  }
  // 敌方配色触发（rancor）：「在敌人配对骷髅头时，获得 3 点攻击力」→ 敌方配对骷髅时自己获得
  if ((m = /^在敌人配对骷髅头(?:宝石)?时[，,]?获得\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)。?$/.exec(desc))) {
    const stat = pickStat(m[2]);
    if (!stat) return null;
    return { effects: { onEnemyColorMatchGain: { color: 'skull', stat, amount: num(m[1]) } } };
  }
  // 配色团队光环（celestial*/powerof*/*aura 族，28 code）：「在配对红色宝石时，给予所有红色盟友 4 点攻击力」。
  // 受益范围：同色盟友（查 colors）/ 种族（查 troopTypes）/「所有盟友」= 全队；
  // 骷髅头匹配以 'skull' 为色键（diamondaura/powerofstars）。动词 给予/为…提供/赋予 都收。
  if ((m = /^在?配对(骷髅头(?:宝石)?|.+?宝石)的?时[，,]?\s*(?:给予|为|赋予)?所有(盟友|.+?盟友)(?:给予|提供|赋予)?\s*(\d+)\s*点?\s*(生命值|护甲值?|攻击力|魔法值|所有技能组)[，,]?。?$/.exec(desc))) {
    let gemColor;
    if (m[1].startsWith('骷髅头')) gemColor = 'skull';
    else {
      gemColor = pickColor(m[1]);
      if (!gemColor) return null;
    }
    // 「所有盟友」= 全队；「所有棕色盟友」= 先剥「盟友」再查颜色/种族映射
    const scopeRaw = m[2];
    const scopeName = scopeRaw === '盟友' ? '' : scopeRaw.replace(/盟友$/, '');
    const scope = scopeName === '' ? 'all' : (pickColor(scopeName) ?? TROOP_TYPE_MAP[scopeName] ?? TROOP_TYPE_MAP[`${scopeName}族`]);
    const gains = m[4] === '所有技能组'
      ? { hp: num(m[3]), armor: num(m[3]), attack: num(m[3]), magic: num(m[3]) }
      : (() => { const stat = pickStat(m[4]); return stat ? { [stat]: num(m[3]) } : null; })();
    if (!scope || !gains) return null;
    return { effects: { onColorMatchTypeAura: { color: gemColor, scope, gains } } };
  }
  // 配色触发·共享数值多属性（ragingbull）：「在配对红色宝石时获得 2 点攻击力、护甲值和生命值」
  if ((m = /^在?配对(.+?)宝石时[，,]?获得\s*(\d+)\s*点((?:生命值|护甲值?|攻击力|魔法值)(?:[、和](?:\d+\s*点)?(?:生命值|护甲值?|攻击力|魔法值))+)[，,]?。?$/.exec(desc))) {
    const color = pickColor(m[1]);
    const gains = parseGainsList(m[3], num(m[2]));
    if (!color || !gains) return null;
    const stats = Object.keys(gains);
    return { effects: { onColorMatchGain: { color, stat: stats[0], amount: num(m[2]), alsoStats: stats.slice(1) } } };
  }
  // 配色触发：在配对<色>宝石时获得 N 点 X（boo/firewall 族带逗号；royalfire「点 攻击力」带空格）
  if ((m = /^在?配对(.+?)宝石时[，,]?\s*获得\s*(\d+)\s*点\s*(生命值|护甲值|攻击力|魔法值)。?$/.exec(desc))) {
    const color = pickColor(m[1]);
    const stat = pickStat(m[3]);
    if (!color || !stat) return null;
    return { effects: { onColorMatchGain: { color, stat, amount: num(m[2]) } } };
  }
  // 骷髅匹配全技能增益（T5 批，manifestation「在配对骷髅头时，所有技能值增加 5 点」/
  // hunger「在配对骷髅头宝石时全部技能值将增加 2 点」）：TurnEngine 骷髅结算处以 'skull'
  // 色键调 applyColorMatchTriggers（与 diamondaura/powerofstars 光环同一触发点），故落
  // onColorMatchGain 的 'skull' 键、持有者自身获益。「全部/所有技能值」沿用 giftof* 族
  // 的四项各 N 口径展开（hp/armor/attack/magic，共享同一 amount 走 alsoStats）。
  if ((m = /^在?配对骷髅头(?:宝石)?时[，,]?(?:全部|所有)技能值?(?:将)?增加\s*(\d+)\s*点。?$/.exec(desc))) {
    return {
      effects: {
        onColorMatchGain: { color: 'skull', stat: 'hp', amount: num(m[1]), alsoStats: ['armor', 'attack', 'magic'] },
      },
    };
  }
  // 配色伤害（T5 杂项批 lumpofcoal/dawnslayer/sleetstorm「在配对X色宝石时，对一名随机敌人
  // 造成 N 点伤害」）：与配色施加状态/窃取生命同一触发点（applyColorMatchTriggers），伤害经
  // TurnEngine 注入的 damage（damageOne 管线，同技能伤害口径），随机目标走种子化 rng。
  // sleetstorm 官方文本无逗号，[，,]? 一并收。
  if ((m = /^在?配对(.+?)宝石的?时[，,]?对一名随机敌人造成\s*(\d+)\s*点伤害。?$/.exec(desc))) {
    const color = pickColor(m[1]);
    if (color) return { effects: { onColorMatchDamage: { color, amount: num(m[2]) } } };
  }
  // 配色施加状态（T5 配色状态批 16 code）：「在配对<色>宝石时…随机敌人施加状态」句式族。
  //   动词句 molten「随机燃烧一名敌人」/ wildvines「随机缠绕一名敌人」/ magicvines「缠绕一名
  //   随机敌人」/ lionsroar·petrification「击晕一名随机敌人」（petrification 官方文本无句尾句号）；
  //   陷入句 sunfire「随机使一名敌人陷入妖火状态」/ sourcandy「使一名随机敌人陷入妖火状态」/
  //   deepwounds/rainofspines/grimcurse/curseofmadness/huntersmoon/webbedbranches（单状态）与
  //   enchantedvines「陷入缠绕和妖火状态」/ ancientchill「陷入冻结和妖火状态」（双状态按「和」
  //   拆段，全部命中才收，条目序与描述一致）；foxfire 带概率「有 50% 的几率」收进 chance。
  // 状态词查 AURA_STATUS_MAP（与大连施加同表），DoT（燃烧/出血/中毒）带 magnitude:1；
  // 回合数 3（与 onBigMatchStatus 同口径）。范围只认「随机…敌人」：指定序号（「第一名敌人」）
  // 、窃取/伤害类动词句、无「随机」的句子不在此收；形状不合落回后续规则，不短路。
  if ((m = /^在?配对(.+?)宝石的?时[，,]?(.+)$/.exec(desc))) {
    const color = pickColor(m[1]);
    const tail = m[2];
    if (color && /随机/.test(tail) && /敌人/.test(tail) && !/所有敌人/.test(tail)) {
      const chanceM = /有\s*(\d+)%\s*的?几率/.exec(tail);
      let statuses = null;
      const trapped = /陷入(.+?)状态/.exec(tail);
      if (trapped) {
        const ids = trapped[1]
          .split('和')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((part) => AURA_STATUS_MAP.find(([re]) => re.test(part))?.[1]);
        if (!ids.some((id) => !id) && new Set(ids).size === ids.length) {
          statuses = [...new Set(ids)].map((id) => (isDotStatus(id) ? { id, magnitude: 1 } : { id }));
        }
      } else {
        const hit = AURA_STATUS_MAP.find(([re]) => re.test(tail));
        if (hit) statuses = [isDotStatus(hit[1]) ? { id: hit[1], magnitude: 1 } : { id: hit[1] }];
      }
      if (statuses) {
        return {
          effects: {
            onColorMatchStatus: {
              color,
              scope: 'randomEnemy',
              statuses,
              turns: 3,
              ...(chanceM ? { chance: num(chanceM[1]) / 100 } : {}),
            },
          },
        };
      }
    }
  }
  // 配色窃取生命（T5 窃取批 5 code）：「在配对<色>宝石时窃取第一/第一位/首位敌人 N 点生命值」
  // 族（corruption/poisontide/justabite/darkesthunger/ladyofdesire）。结算与技能 drain
  // （settleDrain）同口径：对首位存活敌人造成 amount 伤害（damageOne 管线），持有者按
  // 实际伤害额等量治疗。与配色施加状态同一触发点（applyColorMatchTriggers）。
  if ((m = /^在?配对(.+?)宝石的?时[，,]?窃取(?:第一名|第一位|首位)敌人\s*(\d+)\s*点生命值。?$/.exec(desc))) {
    const color = pickColor(m[1]);
    if (color) return { effects: { onColorMatchDrain: { color, amount: num(m[2]) } } };
  }
  // 反弹 N% 的骷髅（头）伤害——"反弹/反射"、"骷髅头/骷髅"两种译法都收
  if ((m = /^(?:反弹|反射)\s*(\d+)%\s*的骷髅(?:头)?伤害。?$/.exec(desc))) {
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
  // 隐匿（stealthy）：无法被法术指定为目标。引擎 untargetable 已支持
  // （targeting.ts 的 targetableFrom，全员不可指定时退化为可指定）。
  if (/^无法成为法术指定攻击目标（除非场上已无任何其他目标）。?$/.test(desc)) {
    return { effects: { untargetable: true } };
  }
  // 战后经济加成（窗口 E 经济批，DECISIONS 四项拍板①）：merchant/necromancy/necromaster/moneybags 族。
  // 「从战斗中获得 N% 额外灵魂/黄金」「在战斗中获得 N% 黄金加成」→ battleEconomyGain，
  // 战斗结束时对战场经济池对应币种按 (1 + ratio) 放大（traits.ts 编译 / TurnEngine 结算）。
  if ((m = /从战斗中获得\s*(\d+)%\s*额外(灵魂|黄金)/.exec(desc))) {
    return { effects: { battleEconomyGain: { currency: m[2] === '黄金' ? 'gold' : 'souls', ratio: num(m[1]) / 100 } } };
  }
  if ((m = /^在战斗中获得\s*(\d+)%\s*黄金加成。?$/.exec(desc))) {
    return { effects: { battleEconomyGain: { currency: 'gold', ratio: num(m[1]) / 100 } } };
  }
  // 开局召唤风暴（songofnature/songofstone/songofdoom…「在战斗开始的时候召唤叶风暴」）：
  // 与 BATTLE_START_STORMS 同一 battleStartStorm 字段，风暴名复用死亡召唤的 STORM_MAP
  // （9 种风暴 + 骷髅系 dropKind 同源）。已入 BATTLE_START_STORMS 的 5 个 code 由显式
  // 映射兜底（生成器里 startupStorm 后展开覆盖，输出不变）。捕获名不在 STORM_MAP 的
  // （开局召唤兵种，如 parliamentarycall）不在此收——开局召兵需入队钩子，属新机制。
  if ((m = /^在战斗开始的时候召唤(.+?)。?$/.exec(desc))) {
    const storm = STORM_MAP[m[1]];
    if (!storm) return null;
    return {
      effects: {
        battleStartStorm: {
          color: storm.color,
          turns: STORM_TURNS,
          troopId: storm.troopId,
          referenceName: storm.referenceName,
          displayName: m[1],
          ...(storm.dropKind ? { dropKind: storm.dropKind } : {}),
        },
      },
    };
  }
  // 开局爆破（omenof* 族「在战斗开始的时候爆破一颗X宝石/骷髅头」，O 桶判读批）：
  // 定义直读字段 battleStartDestroy（与 battleStartStorm 同族，TurnEngine 构造期读
  // getTrait），命中格经既有 resolveBoardChange 清除管线结算（法力/骷髅伤害/重力/连锁
  // 照常，直接结算归持有者一方）。「爆破」目标必须是基础色宝石或骷髅头，其余不收。
  if ((m = /^在战斗开始的时候爆破一颗(.+?)。?$/.exec(desc))) {
    if (m[1] === '骷髅头') return { effects: { battleStartDestroy: { kind: 'skull' } } };
    const color = pickColor(m[1]);
    if (!color) return null;
    return { effects: { battleStartDestroy: { kind: 'color', color } } };
  }
  // 死亡召唤三族（daemonicpact/terrorpact/fromdark/darkdeath…）。
  // 触发主体：自己身亡 / 盟友身亡 / 敌人身亡；概率可省略（=100%，如 loyalmount/desertmount）。
  // 召唤物两段式解析：先查兵种数据，未命中查风暴映射表（骸骨风暴/末日风暴等 9 种，
  // 产出 storm 变体 spec，不产出兵种）；两者都查不到留在未实现桶。
  if (/身亡时|死亡时/.test(desc) && /召唤/.test(desc)) {
    if (/当?一?名?敌人(?:死亡|身亡)时/.test(desc)) {
      const hit = parseDeathSummon(desc, 'summonOnEnemyDeath', true);
      if (hit) return hit;
      return null; // 敌人身亡但召唤名解析失败，不再尝试其它字段
    }
    if (/当一名盟友身亡时/.test(desc)) {
      const hit = parseDeathSummon(desc, 'summonOnAllyDeath', false);
      if (hit) return hit;
      return null;
    }
    const hit = parseDeathSummon(desc, 'summonOnDeath', true);
    if (hit) return hit;
    return null;
  }
  return null;
}

const raw = JSON.parse(fs.readFileSync(IN, 'utf8'));
// 兵种中文名 → 精简 troops.json 的 { troopId, referenceName }，供死亡召唤特质解析召唤物。
// 精简表（src/data/troops.json）由 build_troops.mjs 产出，与官方 dump 同源，中文名可直接对上。
const troopsSlim = JSON.parse(fs.readFileSync('src/data/troops.json', 'utf8'));
const TROOP_BY_NAME = new Map(
  (Array.isArray(troopsSlim) ? troopsSlim : troopsSlim.raw_data ?? []).map((t) => [t.name, { troopId: t.id, referenceName: t.referenceName }]),
);

/**
 * 风暴映射表（阶段 1.1 查证收尾，来源与假设详见 DECISIONS.md「风暴（Storm）全局掉落修正」）。
 *
 * 官方语义：风暴不是兵种，是挂在战斗上的全局掉落修正器。六色风暴提升对应色宝石掉率；
 * **骸骨风暴提升骷髅掉率、末日/超级末日风暴提升（至尊）末日骷髅掉率**——而引擎的风暴契约
 * （Team.storm.color: BaseColor，阶段 1.2 已定）只支持按 BaseColor 加权颜色掉落。
 * 骷髅族风暴已回填官方语义：storm.dropKind 指向骷髅系掉落（skull/doomSkull/uberDoomSkull），
 * color 降级为表现层主色（近似色系，供指示器/法力配色使用）：
 *   - 骸骨风暴 Bonestorm → dropKind 'skull'，主色 Brown（骷髅头的棕色系）
 *   - 末日风暴 Doomstorm / 超级末日风暴 Uber Doomstorm → dropKind 'doomSkull'/'uberDoomSkull'，主色 Purple
 * troopId 用虚拟号段 9001~9009（真实兵种 id 不会撞上，表现层可据此区分风暴与兵种）。
 */
const STORM_TURNS = 8; // 官方 3.0 补丁说明："a board affect that lasts 8 Turns (4 for each side)"
const STORM_MAP = {
  暗风暴: { color: 'Purple', troopId: 9001, referenceName: 'Darkstorm' },
  火风暴: { color: 'Red', troopId: 9002, referenceName: 'Firestorm' },
  冰风暴: { color: 'Blue', troopId: 9003, referenceName: 'Icestorm' },
  光风暴: { color: 'Yellow', troopId: 9004, referenceName: 'Lightstorm' },
  叶风暴: { color: 'Green', troopId: 9005, referenceName: 'Leafstorm' },
  尘风暴: { color: 'Brown', troopId: 9006, referenceName: 'Duststorm' },
  骸骨风暴: { color: 'Brown', troopId: 9007, referenceName: 'Bonestorm', dropKind: 'skull' },
  末日风暴: { color: 'Purple', troopId: 9008, referenceName: 'Doomstorm', dropKind: 'doomSkull' },
  超级末日风暴: { color: 'Purple', troopId: 9009, referenceName: 'UberDoomstorm', dropKind: 'uberDoomSkull' },
};

/**
 * 解析「召唤一只/名/个 X」里的 X，两段式：
 *   1. 查兵种数据（现状）→ { troopId, referenceName }；
 *   2. 未命中查风暴映射表 → 兵种召唤变体为风暴：附 storm: { color, turns }，
 *      troopId 为虚拟风暴号段（引擎据此不产出兵种、改设全局风暴）。
 * 都查不到返回 null（该特质继续留在未实现桶）。
 */
function resolveSummonedTroop(desc) {
  const name = (/(?:召唤|召唤出)一?[名只个头]?(.+?)[。.？?]?$/.exec(desc) ?? [])[1]?.trim();
  if (!name) return null;
  const troop = TROOP_BY_NAME.get(name);
  if (troop) return { troopId: troop.troopId, referenceName: troop.referenceName };
  const storm = STORM_MAP[name];
  if (storm) {
    return {
      troopId: storm.troopId,
      referenceName: storm.referenceName,
      storm: {
        color: storm.color,
        turns: STORM_TURNS,
        ...(storm.dropKind ? { dropKind: storm.dropKind } : {}),
      },
    };
  }
  return null;
}

/** 死亡召唤共同解析：触发主体 + 概率 + 召唤物。触发字段由调用方指定 */
function parseDeathSummon(desc, field, withChance) {
  const chance = withChance ? (/(?:有|时)\s*(\d+)%\s*的?几率/.exec(desc) ?? [])[1] : undefined;
  const troop = resolveSummonedTroop(desc);
  if (!troop) return null;
  return {
    effects: {
      [field]: {
        chance: chance !== undefined ? num(chance) / 100 : 1,
        troopId: troop.troopId,
        referenceName: troop.referenceName,
        displayName: (/(?:召唤|召唤出)一?[名只个头]?(.+?)[。.？?]?$/.exec(desc) ?? [])[1]?.trim(),
        ...(troop.storm ? { storm: troop.storm } : {}),
      },
    },
  };
}

const info = new Map();
for (const r of raw.troops) {
  for (const t of r.stats?.traits ?? []) {
    if (!info.has(t.code)) info.set(t.code, { name: t.name, description: t.description, troops: 0 });
    info.get(t.code).troops += 1;
  }
}

const out = [];
const skipped = [];
// 开局风暴的原始描述只有少量固定特质。按 code 显式映射，避免依赖多语言描述文本的正则匹配。
const BATTLE_START_STORMS = {
  songoflight: { color: 'Yellow', turns: STORM_TURNS, troopId: 9004, referenceName: 'Lightstorm', displayName: 'Lightstorm' },
  songofdarkness: { color: 'Purple', turns: STORM_TURNS, troopId: 9001, referenceName: 'Darkstorm', displayName: 'Darkstorm' },
  songofbones: { color: 'Brown', turns: STORM_TURNS, troopId: 9007, referenceName: 'Bonestorm', displayName: 'Bonestorm', dropKind: 'skull' },
  songoffire: { color: 'Red', turns: STORM_TURNS, troopId: 9002, referenceName: 'Firestorm', displayName: 'Firestorm' },
  songofice: { color: 'Blue', turns: STORM_TURNS, troopId: 9003, referenceName: 'Icestorm', displayName: 'Icestorm' },
};
for (const [code, v] of [...info].sort((a, b) => b[1].troops - a[1].troops)) {
  const parsed = parse(v.description);
  const startupStorm = BATTLE_START_STORMS[code];
  if (parsed || startupStorm) {
    out.push({
      code,
      name: v.name,
      description: v.description,
      troops: v.troops,
      ...(parsed?.effects ?? {}),
      ...(startupStorm ? { battleStartStorm: startupStorm } : {}),
    });
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
