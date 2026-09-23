/**
 * Status-effect copy shared by battle badges, detail panels, and future Meta views.
 * Keys are the localized labels returned by render/statusBadges.
 *
 * Keep this module data-only: consumers may use it outside the battle renderer.
 */
export const STATUS_DESCRIPTIONS: Readonly<Record<string, string>> = {
  中毒: '每回合受到毒素伤害，无视护甲。可叠加。',
  燃烧: '每回合受到火焰伤害。',
  沉默: '无法施放技能。',
  冰冻: '无法攻击、施法或获得法力。',
  击晕: '跳过行动，并禁用所有特质。',
  缠绕: '无法攻击（仍可施法）。',
  织网: '魔法值归零，技能只按基础数值生效。每回合有概率挣脱。',
  屏障: '抵挡下一次受到的全部伤害，随后消失。',
  出血: '每回合受到出血伤害。可叠加。',
  疾病: '获得的法力减半。每回合有概率自愈。',
  猎人标记: '受到的骷髅伤害提高。',
  下潮: '无法被技能指定为目标。',
  诅咒: '驱散所有正面状态；其它状态自行解除的概率减半。可无视免疫。',
  死亡标记: '每回合有 10% 概率立即死亡。',
  狼化: '每回合有概率变成随机野兽。',
  狂怒: '骷髅伤害提高 50%，并无视目标的特质。攻击后消失。',
  激怒: '骷髅伤害提高 50%，并无视目标的特质。攻击后消失。',
  法力燃烧: '法力被清空。',
  魅惑: '攻击改打己方下一名存活单位。',
  精灵火: '受到的法术伤害提高 50%。每回合有概率自愈。',
  恐怖: '每回合有概率与后排单位交换站位。',
  状态: '效果未知。',
};
