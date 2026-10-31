/**
 * Player-facing skill names (user decision 2026-10-30): skills keep the original game's spell
 * name, with exactly one name per mechanics (learning identity) and one mechanics per name.
 * - Same mechanics under different original names share one name (the three unified groups).
 * - Original names used by several different mechanics keep the name for the troop that comes
 *   first in the catalogue; the others get a new name in the original game's style.
 * Hero weapons keep their own spell names and are outside this table.
 */
import type { TroopData } from '../data/troops';

/** Troop id -> skill name. Approved by the user on 2026-10-30. */
export const SKILL_NAME_OVERRIDES: Readonly<Record<number, string>> = Object.freeze({
  // Same mechanics, different original names: unified.
  6414: '远古之盾', 7553: '远古之盾', // 熊猫「佛掌」、坟冢领主「远古之盾」
  6591: '炎爆', 6768: '炎爆', // 炸·轰老翁「爆炸啦！」、塔玛里斯「龙族攻略」
  7460: '地裂', 7704: '地裂', // 约德林「粉碎高塔」、韩信「空中重击」
  // Same original name, different mechanics: renamed.
  7271: '饕餮', // 菲洛克恶魔「一网打尽」
  7426: '破空', // 角翅「俯冲攻击」
  7006: '连环重拳', // 夸特曼努斯「拳拳到肉」
  7508: '圣盾冲击', // 圣女「盾击」
  6415: '穿云枪', // 枪圣「凌空一击」
  6380: '蛇舞', // 耍蛇者「催眠」
  6807: '林野复苏', // 狐人恶汉「扫清道路」
  6705: '部族战鼓', // 大根酋长「战吼」
  6748: '裂甲钳', // 蟹人「蟹钳」
  7131: '冰封印记', // 藏宝库守卫「冰冷之触」
  6750: '怒涛', // 水元素「洪水」
  6945: '烈焰圣击', // 阿拉米尔爵士「圣火」
  7030: '炽光', // 维纳图斯「圣火」
  7533: '炎誓', // 火生圣骑士「圣火」
  7290: '绿野奇袭', // 托德.格林伍德「聪明一击」
  7119: '死神之镰', // 死刃「暗黑之刃」
  7372: '深海咒潮', // 海婆「浪涛诅咒」
  7196: '荒疫宣告', // 大荒传令官「受诅之刃」
  7430: '时砂凝滞', // 时间之女「冻结时间」
  7790: '夜幕散袭', // 约霍尔蒂塞特尔「夜爪」
  7567: '鬼王丧钟', // 鬼王酷角「末日之歌」
});

/**
 * Troop id -> skill name for every troop whose active is implemented (`abilityIdOf` returns
 * undefined otherwise). All troops sharing a learning identity get the same name: an override
 * on any of them wins, otherwise the first troop's original spell name.
 */
export function buildSkillNames(troops: readonly TroopData[], abilityIdOf: (troop: TroopData) => string | undefined): Map<number, string> {
  const groups = new Map<string, TroopData[]>();
  for (const troop of troops) {
    const id = abilityIdOf(troop); if (id === undefined) continue;
    const list = groups.get(id); if (list) list.push(troop); else groups.set(id, [troop]);
  }
  const names = new Map<number, string>();
  for (const members of groups.values()) {
    const override = members.map(t => SKILL_NAME_OVERRIDES[t.id]).find(Boolean);
    // A blank source name leaves the group unnamed; callers then fall back to the mechanics label.
    const name = override ?? members.map(t => t.spell.name.trim()).find(Boolean);
    if (name) for (const troop of members) names.set(troop.id, name);
  }
  return names;
}
