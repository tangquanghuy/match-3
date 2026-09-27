/** Reviewed four-troop rows from the archived GoW Team Share workbook.
 * Source slots/order are preserved, including duplicate troops. Banner is a local
 * kingdom-banner adaptation, NOT a claim of reproducing all account-wide bonuses.
 * Full workbook, hero-dependent rows and provenance: data/reference/gow-community/.
 */
import type { DefenseTemplate } from './opponentTeams';

export interface CommunityDefenseTemplate extends DefenseTemplate {
  sourceRow: number;
  minLevel: number;
  requiredTraits: number;
  bannerKingdom: string;
}

export const COMMUNITY_DEFENSES: readonly CommunityDefenseTemplate[] = [
  { id: 'share-73', name: '圣堂斥候', sourceRow: 73, minLeague: 0, maxLeague: 3, minLevel: 1, requiredTraits: 0,
    troops: [6100,6016,6245,6353], roles: ['护甲供魔','穿透输出','前线打击','定点收割'], bannerKingdom: '潘神之谷',
    strategy: '圣堂骑士把红色转成绿色并为全队叠甲，保留原表四槽顺序；优先切断供魔，避免连续转换。' },
  { id: 'share-78', name: '三游侠集火', sourceRow: 78, minLeague: 0, maxLeague: 3, minLevel: 1, requiredTraits: 0,
    troops: [6115,6115,6005,6115], roles: ['前排输出','集火输出','黄色供魔','后排输出'], bannerKingdom: '白盔国',
    strategy: '炼金术士转黄给游侠充能，多名游侠轮流打击；原表的重复卡是队伍结构的一部分。' },
  { id: 'share-87', name: '岩虫连锁', sourceRow: 87, minLeague: 0, maxLeague: 3, minLevel: 1, requiredTraits: 0,
    troops: [6103,6103,6042,6103], roles: ['产棕输出','产棕输出','棕色供魔','产棕输出'], bannerKingdom: '卡其尔',
    strategy: '深钻工与三岩虫围绕棕色供魔，岩虫攻击末位并产棕；优先控供魔位，留意棕色连消。' },
  { id: 'share-63', name: '哥布林完整接力', sourceRow: 63, minLeague: 4, maxLeague: 9, minLevel: 20, requiredTraits: 3,
    troops: [6204,6391,6390,6076], roles: ['爆破供魔','团队群伤','爆破强化','产绿召唤'], bannerKingdom: '蛛尔卡里',
    strategy: '诺本兄弟与菲砰公主启动，抓锅女王群伤，哥布林国王产绿并补位；额外回合接力，冻结或沉默供魔位更关键。' },
  { id: 'share-64', name: '巨魔海妖冰封', sourceRow: 64, minLeague: 4, maxLeague: 9, minLevel: 20, requiredTraits: 3,
    troops: [6419,6317,6275,6191], roles: ['翻绿供魔','耗魔产蓝','后排输出','连消冻结'], bannerKingdom: '冰峰之巅',
    strategy: '森林巨魔翻绿供魔，妮克丝耗魔产蓝，海妖打后排；梅冰女王第三特质惩罚连消，全特质后才进入此档。' },
  { id: 'share-13', name: '织网绿循环', sourceRow: 13, minLeague: 6, maxLeague: 9, minLevel: 20, requiredTraits: 3,
    troops: [6068,6783,6790,6408], roles: ['产绿毒伤','沉默供魔','窃取控制','产绿缠绕'], bannerKingdom: '蛛尔卡里',
    strategy: '蛛网制造者与雅思敏选使产绿，弹琴手沉默并爆破供魔，血木大王补控制；应对重点是打断绿色供魔与骷髅爆发。' },
  { id: 'share-35', name: '圣光火焰净化', sourceRow: 35, minLeague: 6, maxLeague: 9, minLevel: 20, requiredTraits: 3,
    troops: [6479,6366,6554,6473], roles: ['半魔双转换','爆破溅射','窃命妖火','群体净化'], bannerKingdom: '圣唐',
    strategy: '圣伊斯巴拉第三特质为神族半魔启动，地狱火爆破溅射，苏娜窃命与妖火，奥菲斯之声负责净化；优先破坏启动转换。' },
  { id: 'share-37', name: '圣光末日骷髅', sourceRow: 37, minLeague: 7, maxLeague: 9, minLevel: 20, requiredTraits: 3,
    troops: [6565,6479,6366,6170], roles: ['减伤骷髅转换','半魔双转换','爆破溅射','爆破召唤'], bannerKingdom: '阿达纳',
    strategy: '冰龙前排减伤并转末日骷髅，圣伊斯巴拉双转换，地狱火与阿比西娅爆破衔接；危险来自完整供魔和骷髅连击，而非只堆等级。' },
  { id: 'share-43', name: '怒火魔王骷髅链', sourceRow: 43, minLeague: 7, maxLeague: 9, minLevel: 20, requiredTraits: 3,
    troops: [6604,6565,6701,6594], roles: ['狂怒骷髅前排','末日骷髅转换','真伤召唤','连消爆破'], bannerKingdom: '卓克祖',
    strategy: '怒火和冰龙串联转换，附魔之王第三特质连消爆破，原罪女王真伤并补位；优先控制转换位，避免交出可连消的转换盘面。' },
];
