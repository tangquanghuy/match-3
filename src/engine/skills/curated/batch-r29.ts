/**
 * 迷雾之季不朽兵种补录（2026-09-21）：gowhead 现网 7932/7933。
 *
 * 9 月 18 日兵种 dump 止于 ImmortalByblios（7901）；Immortal Thalassa / Immortal Girthrok
 * 随 Season of Mists 上线，武器已进 W05，兵种卡此前缺失。本批按 Empyrion（9367）/
 * Broken Lands 真实散射族口径手写组装 9880 / 10064，中文名走既有「不朽的××」。
 */
import { skill, dmgSplash, trueDmg } from '../builders';
import type { CondMult } from '../effects/secondary';
import type { CuratedBatch } from './index';

const REGION2 = (region: string): CondMult => ({ times: 2, cond: { kind: 'regionPresent', region } });

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 9880,
    desc: '对 3 名随机敌人造成 [(魔法 x 0.67) + 2] 点真实溅射伤害，伤害值因沉没宝石数而增强。若在星星湾使用，则伤害翻倍。 [x2]',
    // TrueSplash + CountSubmerge ×2；MultiplyForRegion4007（星星湾）
    build: skill(
      dmgSplash('enemyRandomN', 2, 0.67, {
        n: 3,
        trueDamage: true,
        modifier: { mod: { kind: 'multiplier', a: 2 }, source: { kind: 'boardSpecial', gem: 'submergeGem' } },
        condMult: REGION2('BayOfStars'),
      }),
    ),
  },
  {
    id: 10064,
    desc: '对所有敌人造成 [(魔法 x 0.75) + 2] 点真实伤害，伤害值因自身生命值而增强。若在破碎之地使用，则伤害翻倍。 [10:1]',
    // TrueDamage all + CountLife 10:1；MultiplyForRegion4010（破碎之地）
    build: skill(
      trueDmg('enemyAll', 2, 0.75, {
        range: 'all',
        modifier: { mod: { kind: 'ratio', a: 10, b: 1 }, source: { kind: 'selfStat', stat: 'hp' } },
        condMult: REGION2('BrokenLands'),
      }),
    ),
  },
];

export const BATCH_R29: CuratedBatch = { batch: 'r29', spells: SPELLS, skipped: SKIPPED };
