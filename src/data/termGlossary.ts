/**
 * 游戏术语表（图鉴 / 战斗详情 / 竞技场等全站描述文案里的可点击术语）。
 *
 * - 每条 = 一个术语概念：title 为规范名，aliases 覆盖描述文案里的机器翻译变体
 *   （末日骷髅头/末日骷髅、法印→附魔、妖火→精灵火 等）。
 * - body 只写引擎实现口径，数值全部以引擎常量为准（engine/types.ts 特殊宝石常量、
 *   skills/effects/status.ts 状态常量、gowDamageRules 溅射比率），不写官方原文，
 *   不写策略评价。引擎实现与官方语义不一致时以引擎为准（如织网锁魔力不锁法力）。
 * - TERM_PATTERN 按别名长度降序合成，保证「超级末日骷髅头」优先于「末日骷髅头」命中。
 */

export type TermCategory = 'status' | 'gem' | 'combat';

export interface TermEntry {
  id: string;
  category: TermCategory;
  title: string;
  aliases: string[];
  body: string;
}

export const TERM_CATEGORY_LABEL: Record<TermCategory, string> = {
  status: '状态',
  gem: '宝石',
  combat: '战斗',
};

export const TERM_GLOSSARY: readonly TermEntry[] = [
  // ── 状态效果 ──
  {
    id: 'poison',
    category: 'status',
    title: '中毒',
    aliases: ['中毒'],
    body: '每回合 50% 概率失去 1 点生命，无视护甲。不参与累积自愈，仅被净化移除。',
  },
  {
    id: 'burning',
    category: 'status',
    title: '燃烧',
    aliases: ['燃烧'],
    body: '每回合失去 3 点生命，先扣护甲再扣生命。',
  },
  {
    id: 'bleed',
    category: 'status',
    title: '出血',
    aliases: ['出血', '流血'],
    body: '每回合按层数失去生命：1/2/3/4 层分别为 1/3/6/10 点，无视护甲。',
  },
  {
    id: 'disease',
    category: 'status',
    title: '疾病',
    aliases: ['疾病'],
    body: '从宝石匹配获得的法力减半；治疗不受影响。',
  },
  {
    id: 'deathmark',
    category: 'status',
    title: '死亡标记',
    aliases: ['死亡标记'],
    body: '首个己方回合不生效，此后每回合 10% 概率立即死亡。',
  },
  {
    id: 'frozen',
    category: 'status',
    title: '冻结',
    aliases: ['冻结', '冰冻'],
    body: '该单位颜色的宝石 4/5 连不产生额外回合；施法、攻击、充能照常。参与累积自愈。',
  },
  {
    id: 'entangle',
    category: 'status',
    title: '缠绕',
    aliases: ['缠绕', '纠缠'],
    body: '骷髅匹配不造成伤害；行动、施法、充能照常。',
  },
  {
    id: 'web',
    category: 'status',
    title: '织网',
    aliases: ['织网'],
    body: '施法时魔力按 0 计（[魔法+N] 缩放失效，只结算基础值），且无法获得魔力值增益；行动、施法、法力充能不受影响。按累积自愈概率挣脱（首回合 10%，之后每回合 +10%），无固定回合上限。',
  },
  {
    id: 'curse',
    category: 'status',
    title: '诅咒',
    aliases: ['诅咒'],
    body: '与赐福互相抵消；持有期间法力操作免疫（法力之盾）失效。参与累积自愈。',
  },
  {
    id: 'silence',
    category: 'status',
    title: '沉默',
    aliases: ['沉默'],
    body: '不可施法，不可获得法力。',
  },
  {
    id: 'stun',
    category: 'status',
    title: '击晕',
    aliases: ['击晕', '打昏'],
    body: '全部特质失效。',
  },
  {
    id: 'terror',
    category: 'status',
    title: '恐怖',
    aliases: ['恐怖', '恐惧'],
    body: '每回合 10% 概率移至队伍末位；已在末位则逃离战斗（视为阵亡）。',
  },
  {
    id: 'huntersmark',
    category: 'status',
    title: '猎人标记',
    aliases: ['猎人标记'],
    body: '使「对被标记敌人」类骷髅增伤特质（鹰眼、专注、复仇等）生效，本身无其他效果。',
  },
  {
    id: 'lycanthropy',
    category: 'status',
    title: '狼化',
    aliases: ['狼化'],
    body: '每回合 15% 概率变身为一只随机野兽。',
  },
  {
    id: 'barrier',
    category: 'status',
    title: '屏障',
    aliases: ['屏障'],
    body: '完全抵挡下一次受到的伤害，抵挡后消失。',
  },
  {
    id: 'enchanted',
    category: 'status',
    title: '附魔',
    aliases: ['附魔', '法印'],
    body: '每回合获得 2 点法力，施放法术后移除。',
  },
  {
    id: 'blessed',
    category: 'status',
    title: '赐福',
    aliases: ['赐福', '祝福'],
    body: '施加时净化全部负面，持有期间免疫新的负面；持有者行动一次后移除。',
  },
  {
    id: 'reflect',
    category: 'status',
    title: '反射',
    aliases: ['反射'],
    body: '受到骷髅伤害时反弹 50%（至少 1 点）给攻击方。',
  },
  {
    id: 'submerged',
    category: 'status',
    title: '下潜',
    aliases: ['下潜', '下潮'],
    body: '免疫覆盖整队的技能伤害；单体指定技能仍可命中。持有者行动结束后上浮。',
  },
  {
    id: 'rage',
    category: 'status',
    title: '狂怒',
    aliases: ['狂怒', '激怒'],
    body: '骷髅伤害 ×1.5，且无视目标的骷髅减伤特质；造成一次骷髅伤害后移除。',
  },
  {
    id: 'charm',
    category: 'status',
    title: '魅惑',
    aliases: ['魅惑'],
    body: '持有者的骷髅攻击改打己方下一名存活单位；按累积自愈概率消失。',
  },
  {
    id: 'manaburn',
    category: 'status',
    title: '法力灼烧',
    aliases: ['法力灼烧', '法力燃烧'],
    body: '伤害附加目标当前法力（伤害 = 基础值 + 目标法力）。受赐福或对法力灼烧免疫的单位不受此段；法力之盾不免除该伤害。',
  },
  {
    id: 'manadrain',
    category: 'status',
    title: '法力耗尽',
    aliases: ['法力耗尽'],
    body: '目标法力清空（或削减固定值，夹零），削减量不转移。法力之盾、赐福、无懈可击可免疫。',
  },
  {
    id: 'manasteal',
    category: 'status',
    title: '法力窃取',
    aliases: ['法力窃取'],
    body: '目标法力被削减（夹零），削减量转移给施法方。法力之盾、赐福、无懈可击可免疫。',
  },
  {
    id: 'faeriefire',
    category: 'status',
    title: '妖火',
    aliases: ['妖火', '精灵火', '精灵之火'],
    body: '受到的法术伤害 +50%（骷髅与持续伤害不吃）；每回合累计 10% 概率自行消退。',
  },
  {
    id: 'stealth',
    category: 'status',
    title: '隐匿',
    aliases: ['隐匿'],
    body: '特质效果：无法成为法术指定目标（除非场上无其他合法目标）；范围效果不受影响。',
  },

  // ── 特殊宝石 ──
  {
    id: 'doomskull',
    category: 'gem',
    title: '末日骷髅头',
    aliases: ['末日骷髅'],
    body: '匹配时每颗骷髅伤害 +5；被摧毁时造成 5 点伤害，不引爆相邻。',
  },
  {
    id: 'uberdoomskull',
    category: 'gem',
    title: '超级末日骷髅头',
    aliases: ['超级末日骷髅', '极度末日骷髅头', '极度末日骷髅', '至尊末日骷髅'],
    body: '匹配时每颗骷髅伤害 +10；匹配或被摧毁时引爆相邻一圈。可自然掉落。',
  },
  {
    id: 'bomb',
    category: 'gem',
    title: '炸弹宝石',
    aliases: ['炸弹宝石', '炸弹'],
    body: '不可匹配；被摧毁时摧毁相邻一圈。',
  },
  {
    id: 'webgem',
    category: 'gem',
    title: '织网宝石',
    aliases: ['织网宝石', '蛛网宝石', '网状宝石'],
    body: '紫色可匹配；被匹配时随机一名敌人获得织网。',
  },
  {
    id: 'lightning',
    category: 'gem',
    title: '闪电宝石',
    aliases: ['闪电宝石', '闪电'],
    body: '蓝色被匹配或摧毁时清空整行；黄色清空整列。',
  },
  {
    id: 'wildcard',
    category: 'gem',
    title: '通配宝石',
    aliases: ['通配宝石'],
    body: '可与任意颜色直线匹配；×2/×3/×4 为本次匹配的法力倍率，同次匹配多颗档位相加。',
  },
  {
    id: 'wishgem',
    category: 'gem',
    title: '许愿宝石',
    aliases: ['许愿宝石', '愿望宝石'],
    body: '不可匹配；被摧毁时五选一随机回蓝，其中 20% 为双方全员法力回满。',
  },
  {
    id: 'hourglass',
    category: 'gem',
    title: '沙漏宝石',
    aliases: ['沙漏宝石', '沙漏'],
    body: '黄色可匹配；被匹配或摧毁时获得一次额外回合。',
  },
  {
    id: 'bootygem',
    category: 'gem',
    title: '赃物宝石',
    aliases: ['赃物宝石', '赃物', '战利品宝石'],
    body: '不可匹配；被摧毁时 +10 金币。不自然掉落。',
  },
  {
    id: 'treasuremap',
    category: 'gem',
    title: '藏宝图',
    aliases: ['藏宝图'],
    body: '特定技能的计数标记，用于增强对应技能。',
  },
  {
    id: 'ghostgem',
    category: 'gem',
    title: '鬼魂宝石',
    aliases: ['鬼魂宝石', '灵魂宝石', '幽魂宝石', '幽灵宝石'],
    body: '当前版本被摧毁时按普通宝石移除，无额外效果。',
  },
  {
    id: 'dragongem',
    category: 'gem',
    title: '龙宝石',
    aliases: ['红色龙宝石', '蓝色龙宝石', '绿色龙宝石', '黄色龙宝石', '紫色龙宝石', '棕色龙宝石', '红龙宝石', '蓝龙宝石', '绿龙宝石', '黄龙宝石', '紫龙宝石', '棕龙宝石', '龙族宝石', '龙宝石'],
    body: '六色可匹配；被匹配或摧毁时摧毁其所在列下方全部宝石。',
  },
  {
    id: 'giantgem',
    category: 'gem',
    title: '巨型宝石',
    aliases: ['巨型宝石', '巨人宝石'],
    body: '六色可匹配；被匹配或摧毁时该色 +5 法力并引爆相邻一圈。',
  },
  {
    id: 'spiritgem',
    category: 'gem',
    title: '灵力宝石',
    aliases: ['灵力宝石', '精神宝石', '灵力'],
    body: '可匹配；被匹配或摧毁时敌方每个存活角色 -2 法力，不转移给己方。',
  },
  {
    id: 'manapotion',
    category: 'gem',
    title: '法力药水宝石',
    aliases: ['法力药水宝石', '法力药水', '法力药剂宝石'],
    body: '六色可匹配；被匹配或摧毁后，补盘完成时创造 7-11 颗该色普通宝石。',
  },
  {
    id: 'candygem',
    category: 'gem',
    title: '糖果宝石',
    aliases: ['糖果宝石'],
    body: '六色可匹配；被匹配时己方每个该色存活盟友 +1 法力。',
  },
  {
    id: 'elementalstar',
    category: 'gem',
    title: '元素星',
    aliases: ['元素之星', '元素星'],
    body: '与棕/蓝/绿/红四色互连；组结算时四色各 +1 法力，并摧毁匹配点对角线四格。',
  },
  {
    id: 'umbralstar',
    category: 'gem',
    title: '暗影星',
    aliases: ['暗影之星', '暗影星'],
    body: '与黄/紫两色互连；组结算时两色各 +1 法力，并摧毁整行与整列。',
  },
  {
    id: 'angelgem',
    category: 'gem',
    title: '天使宝石',
    aliases: ['天使宝石'],
    body: '无色不可匹配；被摧毁时随机一名己方获得赐福。',
  },
  {
    id: 'daemonicportal',
    category: 'gem',
    title: '恶魔传送门宝石',
    aliases: ['恶魔传送门宝石', '恶魔门户宝石', '恶魔传送门', '传送门宝石'],
    body: '无色不可匹配；被摧毁时引爆相邻一圈，并为摧毁方召唤一名随机恶魔。',
  },
  {
    id: 'gargoylegem',
    category: 'gem',
    title: '石像鬼宝石',
    aliases: ['善石像鬼宝石', '恶石像鬼宝石', '石像鬼宝石'],
    body: '无色不可匹配。善：摧毁时己方每个存活角色获得一条随机正面状态；恶：敌方全体获得一条随机负面状态。',
  },
  {
    id: 'stoneblock',
    category: 'gem',
    title: '石块',
    aliases: ['石块'],
    body: '无色不可匹配，无任何触发；被摧毁不计法力与骷髅。',
  },
  {
    id: 'lycanthropygem',
    category: 'gem',
    title: '狼化宝石',
    aliases: ['狼化宝石', '狼人宝石'],
    body: '紫色可匹配；被摧毁时随机一名敌人获得狼化。',
  },
  {
    id: 'decaygem',
    category: 'gem',
    title: '腐烂宝石',
    aliases: ['腐烂宝石', '腐朽宝石', '衰败宝石'],
    body: '棕色可匹配，无触发；每回合开始时兵力多的一方全员每颗 -1 护甲，数量相同则双方都扣。',
  },
  {
    id: 'volcanogem',
    category: 'gem',
    title: '火山宝石',
    aliases: ['火山宝石'],
    body: '红色可匹配；被摧毁时清除其所在列上方并向两侧对角方向清除。',
  },
  {
    id: 'trapgem',
    category: 'gem',
    title: '陷阱宝石',
    aliases: ['陷阱宝石'],
    body: '无色不可匹配；被摧毁时五选一：击晕（1 回合）/冻结/缠绕/妖火（各 3 回合）作用于玩家方全体，或创造 3 颗末日骷髅。',
  },
  {
    id: 'enchantedgem',
    category: 'gem',
    title: '附魔宝石',
    aliases: ['附魔宝石'],
    body: '紫色可匹配；被匹配时随机一名己方获得附魔，普通摧毁只结算基础法力。',
  },
  {
    id: 'statusgem',
    category: 'gem',
    title: '状态宝石',
    aliases: ['毒宝石', '燃烧宝石', '冻结宝石', '诅咒宝石', '死亡标记宝石', '恐怖宝石', '缠绕宝石', '激怒宝石', '沉没宝石', '妖火宝石', '屏障宝石'],
    body: '携带对应状态的宝石族（燃烧/冻结/毒/死亡标记/恐怖/缠绕/激怒/沉没/妖火/打昏/屏障）统称：被匹配或摧毁时按各自规则施加状态（激怒/沉没/屏障作用于己方，其余作用于敌方）。只由技能创造，不自然掉落。',
  },
  {
    id: 'mimicgem',
    category: 'gem',
    title: '宝箱怪宝石',
    aliases: ['宝箱怪宝石', '宝箱怪'],
    body: '当前版本被摧毁时按普通宝石移除，无额外效果。',
  },

  // ── 战斗机制 ──
  {
    id: 'devour',
    category: 'combat',
    title: '吞噬',
    aliases: ['吞噬'],
    body: '目标立即阵亡，吞噬者获得其当前的攻击、护甲与生命值；具有免疫吞噬（无法消化）特质的单位不会被吃。',
  },
  {
    id: 'extraturn',
    category: 'combat',
    title: '额外回合',
    aliases: ['额外回合'],
    body: '立即再行动一次。冻结色宝石的 4/5 连不产生额外回合。',
  },
  {
    id: 'splash',
    category: 'combat',
    title: '溅射',
    aliases: ['轻度溅射', '重度溅射', '溅射'],
    body: '主目标承受全额伤害，相邻位按比例受波及：轻度 25%、重度 75%、未标注 50%。',
  },
  {
    id: 'scatter',
    category: 'combat',
    title: '散射',
    aliases: ['散射'],
    body: '一个伤害总额随机分摊给多名敌人。',
  },
  {
    id: 'truedamage',
    category: 'combat',
    title: '真实伤害',
    aliases: ['真实伤害'],
    body: '无视护甲，直接扣除生命。',
  },
  {
    id: 'randomstat',
    category: 'combat',
    title: '随机技能值',
    aliases: ['随机技能值'],
    body: '从攻击、护甲、生命、魔力中随机一项削减（或获得）对应数值；多次施加各自独立掷签。',
  },
  {
    id: 'storm',
    category: 'combat',
    title: '风暴',
    aliases: ['火风暴', '暗风暴', '冰风暴', '末日风暴', '骸骨风暴', '光风暴', '叶风暴', '尘风暴', '风暴'],
    body: '持续 8 回合，加权对应颜色（骷髅系风暴加权骷髅）的掉落；全场唯一，后召顶替先召，不分敌我。',
  },
  {
    id: 'soul',
    category: 'combat',
    title: '灵魂',
    aliases: ['灵魂'],
    body: '战斗外货币：击败敌人获得，用于部队晋升。',
  },
  {
    id: 'position',
    category: 'combat',
    title: '首位 / 末位',
    aliases: ['首位', '末位', '推到后方', '击至末位', '拉至首位'],
    body: '骷髅与单体法术默认命中首位；部分技能可改变站位。',
  },
];

const escaped = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 别名 → 条目（构造期去重校验：同一别名只允许指向一个条目） */
export const TERM_BY_ALIAS: ReadonlyMap<string, TermEntry> = (() => {
  const map = new Map<string, TermEntry>();
  for (const entry of TERM_GLOSSARY) {
    for (const alias of [entry.title, ...entry.aliases]) {
      const prev = map.get(alias);
      if (prev && prev.id !== entry.id) {
        throw new Error(`术语别名冲突：${alias} 同时属于 ${prev.id} 与 ${entry.id}`);
      }
      map.set(alias, entry);
    }
  }
  return map;
})();

/** 长度降序的别名表（最长优先，保证「超级末日骷髅头」先于「末日骷髅头」） */
const ALIASES_LONGEST_FIRST = [...TERM_BY_ALIAS.keys()].sort((a, b) => b.length - a.length);

/** 全站共用的术语匹配正则（g 标志，逐次 exec 使用） */
export const TERM_PATTERN = new RegExp(ALIASES_LONGEST_FIRST.map(escaped).join('|'), 'g');

/** 按别名取条目；找不到返回 undefined */
export function termEntryOf(alias: string): TermEntry | undefined {
  return TERM_BY_ALIAS.get(alias);
}

/** 按 id 取条目（弹出面板用，data-term 值即条目 id） */
export const TERM_BY_ID: ReadonlyMap<string, TermEntry> = new Map(
  TERM_GLOSSARY.map((entry) => [entry.id, entry] as const),
);
