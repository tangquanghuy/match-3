/**
 * 特质图标（meta 屏统一入口）：100% 覆盖，任何特质都有图标。
 *
 * 图源 = game-icons.net 现成剪影（CC BY 3.0，scripts/build_meta_trait_icons.mjs
 * 从全库挑选内联，署名见 traitIconsGameIcons.ts）。
 *
 * 语义口径：**看效果，不看触发条件**。「配对宝石时获得攻击力」的语义是攻击
 * 而非宝石——所以效果词（获得生命/攻击/护甲/法力、治疗、造成伤害）优先于
 * 触发词（宝石/骷髅/战斗开始）。状态类（毒/燃烧/冻结）是对症语义，位置靠前。
 *
 * 同屏去重：traitGlyphsFor 保证同一支部队的多个特质不重图（21 个图形族足够
 * 轮转）；单特质取 traitGlyph。
 *
 * 纯字符串模板，无 DOM 依赖（node 单测锁定全量 785 code 无一落空）。
 */
import { TRAIT_FALLBACK_ICON, TRAIT_FAMILY_ICONS, type FamilyGameIcons } from './traitIconsGameIcons';

interface Family {
  label: string;
  test: RegExp;
  color: string;
}

/** 稀有度档（0~5）→ 图标质感档：普通/精良=朴素，稀有/传说=标准，史诗/神话=华丽 */
export function styleOfTier(tier: number): 'simple' | 'normal' | 'ornate' {
  if (tier <= 1) return 'simple';
  if (tier <= 3) return 'normal';
  return 'ornate';
}

/**
 * 顺序即优先级（效果优先于触发条件）：
 *  - 强语义（免疫/隐匿/反伤/闪避）最前；
 *  - 游戏状态词族（毒/燃烧/冻结/眩晕/缠绕/织网/屏障/…/风暴/爆破）次之；
 *  - 走向类（窃取/削弱/净化）与属性增益（回复/减伤/生命/攻击/护甲/法力/先攻）；
 *  - 经济（贪财）与泛状态；
 *  - 触发载体族（宝石/骷髅）与时机族（亡语/召唤）最后——「配对宝石时获得攻击力」
 *    归攻击、「对骷髅造成额外伤害」归攻击，只有纯宝石操作才落宝石族。
 */
const FAMILIES: Family[] = [
  { label: '免疫', test: /免疫|不会(受到|被)|无法被(施加|偷取)/, color: '#8fd0e8' },
  { label: '隐匿', test: /隐匿|无法被(选定|指定|作为目标)|不被指定/, color: '#b0b6c0' },
  { label: '反伤', test: /反弹|反伤|回敬|受到(攻击|普攻)(时|后)/, color: '#e8a24a' },
  { label: '闪避', test: /闪避|回避|躲避/, color: '#8fb8ff' },
  { label: '剧毒', test: /中毒|剧毒|毒(性|液|牙|浪|雾)?/, color: '#7fc06b' },
  { label: '流血', test: /流血|放血/, color: '#c23b3b' },
  { label: '燃烧', test: /燃烧|灼烧|灼热|火焰|着火|火系/, color: '#e8555e' },
  { label: '冻结', test: /冻结|冰冻|冰缓|寒冰|冰霜/, color: '#9bd8f2' },
  { label: '诅咒', test: /诅咒|腐化|腐蚀|衰弱/, color: '#a074d4' },
  { label: '恐惧', test: /恐惧|恐慌|畏惧/, color: '#c9a8ee' },
  { label: '魅惑', test: /魅惑|蛊惑|诱惑/, color: '#d48ab0' },
  { label: '眩晕', test: /击晕|眩晕|晕眩|打昏|震慑/, color: '#e8c24a' },
  { label: '缠绕', test: /缠绕|藤蔓/, color: '#7fc06b' },
  { label: '织网', test: /织网|蛛网/, color: '#b0b6c0' },
  { label: '屏障', test: /屏障/, color: '#8fb8ff' },
  { label: '沉默', test: /噤声|沉默/, color: '#b0b6c0' },
  { label: '下潜', test: /下潜|潜行/, color: '#4f9fe0' },
  { label: '妖火', test: /妖火/, color: '#e8a24a' },
  { label: '死亡标记', test: /死亡标记|猎杀|吞噬|处决/, color: '#e8555e' },
  { label: '狂怒', test: /狂怒/, color: '#e8555e' },
  { label: '法印', test: /法印/, color: '#e6c979' },
  { label: '风暴', test: /风暴|暴雨|狂风/, color: '#8fb8ff' },
  { label: '爆破', test: /爆破|爆炸|引爆/, color: '#e8a24a' },
  { label: '净化', test: /净化|驱散/, color: '#7fd48a' },
  { label: '窃取', test: /窃取|偷取/, color: '#a074d4' },
  { label: '削弱', test: /敌人(损失|失去)|减半|削弱/, color: '#b0b6c0' },
  { label: '回复', test: /治疗|回复|恢复/, color: '#7fd48a' },
  { label: '减伤', test: /受到的?(所有)?伤害|伤害减少|伤害减免|降低(来自|所受)|抵抗/, color: '#c8ccd4' },
  { label: '重生', test: /重生|免死|不死/, color: '#e6c979' },
  { label: '光环', test: /灵气|光环|全部状态值/, color: '#c9a8ee' },
  { label: '赐福', test: /赐福|祝福/, color: '#e6c979' },
  { label: '生命', test: /获得[^，。]*生命|生命值\s*[+加]|生命值提升|大体型|体型/, color: '#e8a0a0' },
  { label: '攻击', test: /获得[^，。]*攻击|攻击力\s*[+加]|造成[^，。]*伤害|额外伤害|伤害提升|重击/, color: '#e08888' },
  { label: '护甲', test: /获得[^，。]*护甲|护甲值?\s*[+加]|护甲提升/, color: '#c8ccd4' },
  { label: '法力燃烧', test: /耗掉|法力燃烧|烧掉/, color: '#a074d4' },
  { label: '法力', test: /获得[^，。]*法力|法力值?\s*[+加]|魔力值|法术伤害|施法/, color: '#8fb8ff' },
  { label: '先攻', test: /先攻|先手|额外回合|速度|快速|首(个|次)回合/, color: '#8fb8ff' },
  { label: '贪财', test: /黄金|金币|赏金|灵魂|钱包|钱/, color: '#e6c979' },
  { label: '状态', test: /陷入[^，。]*状态|正面增益|随机状态/, color: '#c9a8ee' },
  { label: '召唤', test: /召唤|复活|召回|援军/, color: '#c9a8ee' },
  { label: '盟约', test: /盟友|全队|所有[^，。]*族|军队位于|全部技能|技能值|技能增加|同盟|束带|玩家对战|给予/, color: '#e6c979' },
  { label: '转化', test: /转(换|化)(成|为)|转化/, color: '#4f9fe0' },
  { label: '宝石', test: /宝石|匹配|创(造|建)|制造|元素星/, color: '#a074d4' },
  { label: '骷髅', test: /骷髅/, color: '#e8e2d0' },
  { label: '亡语', test: /身亡时|死亡时|阵亡|亡语|被摧毁时|被消灭时/, color: '#b0b6c0' },
];

/** 该特质的候选图形族（按优先级，可能为空 → 兜底） */
export function traitFamilyRank(name: string, description: string): string[] {
  const text = `${name ?? ''} ${description ?? ''}`;
  return FAMILIES.filter((f) => f.test.test(text)).map((f) => f.label);
}

/** 单特质图标（无去重诉求时用）。tier = 所在卡的稀有度档（0~5），决定质感档 */
export function traitGlyph(_code: string | undefined, name: string, description: string, tier = 2): string {
  return traitGlyphsFor([{ name, description }], tier)[0]!;
}

/**
 * 一组特质的图标（同一屏去重）：优先取各自排名第一的未占用族；
 * 全部占用时按族表顺序取第一个未占用族——同一部队内不出现重复图标。
 * tier 决定质感档（simple/normal/ornate）。
 */
export function traitGlyphsFor(
  traits: Array<{ name?: string; description?: string } | undefined>,
  tier = 2,
): string[] {
  const used = new Set<string>();
  const style = styleOfTier(tier);
  return traits.map((trait) => {
    if (!trait) return wrap(TRAIT_FALLBACK_ICON, '#827768', '未开槽');
    const ranked = traitFamilyRank(trait.name ?? '', trait.description ?? '');
    if (ranked.length === 0) return wrap(TRAIT_FALLBACK_ICON, '#c9a8ee', '特质');
    let label = ranked.find((l) => !used.has(l));
    if (!label) label = FAMILIES.map((f) => f.label).find((l) => !used.has(l)) ?? ranked[0]!;
    used.add(label);
    const icons: FamilyGameIcons | undefined = TRAIT_FAMILY_ICONS[label];
    const icon = icons ? icons[style] : TRAIT_FALLBACK_ICON;
    const color = FAMILIES.find((f) => f.label === label)?.color ?? '#c9a8ee';
    return wrap(icon, color, label);
  });
}

function wrap(icon: { body: string }, color: string, label: string): string {
  return `<svg viewBox="0 0 512 512" fill="${color}" role="img" aria-label="${label}">${icon.body}</svg>`;
}
