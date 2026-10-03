import type { CuratedBatch } from './index';
import { BaseColor } from '../../types';
import { BAILU_YIXI_SPELL_ID, DOUGLAS_SPELL_ID, CIALLO_SPELL_ID, CHIKORITA_SPELL_ID, XINGAI_SPELL_ID, LIANKA_SPELL_ID, YELUO_SPELL_ID, RENOIR_SPELL_ID, SU_SPELL_ID, SHIRAKYUSU_ANNA_SPELL_ID, LINKONGLUO_SPELL_ID, YINSHILUO_SPELL_ID, WANGFENG_SPELL_ID, GUANLI_OBSERVER_SPELL_ID, HONGDIE_SPELL_ID, PING_SPELL_ID, ZHUWANG_SPELL_ID, EROCHIKA_SPELL_ID, HUIJIU_SPELL_ID, CUIXIANG_CHIXIGUA_SPELL_ID, COMMUNITY_RACE, COMMUNITY_TROOPS } from '../../../data/communityTroops';
import { POSITIVE_STATUS_IDS } from '../effects/status';
import { createSpecialGems2, trueDmg, steal, CHOSEN, destroyColor, extraTurn, createGems, transformTroop, dispelStatus, sacrifice, devour, attack, armor, cleanse, gainLife, createSpecialGems, createMix, createSkulls, dmg, dmgAll, explodeRandomGems, inflict, mana, reduce, shuffleTeam, skill, summonRef, transform } from '../builders';

export const BATCH_COMMUNITY: CuratedBatch = {
  batch: 'community',
  spells: [
    {
      id: BAILU_YIXI_SPELL_ID,
      desc: COMMUNITY_TROOPS[0]!.spell.description,
      build: skill(
        dmg('enemyChosen', 7),
        inflict('web', 'lastTarget', { turns: 3 }),
        inflict('barrier', 'allyWeakest', { turns: 3 }),
      ),
    },
    {
      id: DOUGLAS_SPELL_ID,
      desc: COMMUNITY_TROOPS[1]!.spell.description,
      build: skill(
        dmgAll(3),
        explodeRandomGems(3),
      ),
    },
    {
      id: CIALLO_SPELL_ID,
      desc: COMMUNITY_TROOPS[2]!.spell.description,
      build: skill(
        attack('allyFront', 2),
        createSkulls(6),
        inflict('web', 'enemyFront', { turns: 3 }),
      ),
    },
    {
      id: CHIKORITA_SPELL_ID,
      desc: COMMUNITY_TROOPS[3]!.spell.description,
      build: skill(
        attack('allyFront', 3),
        createMix([BaseColor.Green, 'SKULL'], 23),
      ),
    },
    {
      id: XINGAI_SPELL_ID,
      desc: COMMUNITY_TROOPS[4]!.spell.description,
      build: skill(
        reduce('enemyChosen', 'mana', 6, 0),
        mana('allyHighestManaOther', 4, 0),
        transform(BaseColor.Yellow, BaseColor.Blue),
      ),
    },
    {
      id: LIANKA_SPELL_ID,
      desc: COMMUNITY_TROOPS.find((troop) => troop.spell.id === LIANKA_SPELL_ID)!.spell.description,
      build: skill({
        ...dmgAll(4),
        modifier: {
          mod: { kind: 'ratio', a: 4, b: 1 },
          pooled: true, // 「每有 4 颗红色或黄色宝石」= 单一合并计数（非原生分步 Count）
          sources: [
            { kind: 'boardGems', color: BaseColor.Red },
            { kind: 'boardGems', color: BaseColor.Yellow },
          ],
        },
      }),
    },
    {
      id: YELUO_SPELL_ID,
      desc: COMMUNITY_TROOPS.find(t => t.spell.id === YELUO_SPELL_ID)!.spell.description,
      build: skill(
        dmg('enemyChosen', 4, 1, {
          range: 'splash',
          modifier: {
            mod: { kind: 'ratio', a: 2, b: 1 },
            pooled: true, // 「每有 2 颗红色或绿色宝石」= 单一合并计数
            sources: [
              { kind: 'boardGems', color: BaseColor.Red },
              { kind: 'boardGems', color: BaseColor.Green },
            ],
          },
        }),
        createMix([BaseColor.Red, BaseColor.Green], 10, 0, { ifCond: { kind: 'castEnemyDied' } }),
      ),
    },
    {
      id: RENOIR_SPELL_ID,
      desc: COMMUNITY_TROOPS.find(t => t.spell.id === RENOIR_SPELL_ID)!.spell.description,
      build: skill(
        attack('allyAll', 8, 0),
        inflict('reflect', 'allyFirstN', { n: 2 }),
      ),
    },
    {
      id: SU_SPELL_ID,
      desc: COMMUNITY_TROOPS.find(t => t.spell.id === SU_SPELL_ID)!.spell.description,
      build: skill(
        sacrifice('allyLastOther', { chance: 0.5 }),
        dmg('enemyChosen', 5, 1, { condMult: { times: 3, cond: { kind: 'castSacrificed' } } }),
        devour('enemyRandom', { chance: 1, ifTargetDied: true,
          ifCond: { kind: 'allOf', of: [{ kind: 'castSacrificed' }, { kind: 'castEnemyDied' }] },
        }),
      ),
    },
    {
      id: SHIRAKYUSU_ANNA_SPELL_ID,
      desc: COMMUNITY_TROOPS.find(t => t.spell.id === SHIRAKYUSU_ANNA_SPELL_ID)!.spell.description,
      build: skill(
        // Dispel only positive statuses; preserve existing debuffs and the chosen target.
        ...POSITIVE_STATUS_IDS.map((statusId, index) => dispelStatus(statusId, index === 0 ? 'enemyChosen' : 'lastTarget')),
        inflict('stun', 'lastTarget'),
        inflict('frozen', 'lastTarget'),
        transform(BaseColor.Red, BaseColor.Blue),
      ),
    },
    {
      id: LINKONGLUO_SPELL_ID,
      desc: COMMUNITY_TROOPS.find(t => t.spell.id === LINKONGLUO_SPELL_ID)!.spell.description,
      build: skill(
        dmg('enemyChosen', 6, 1, {
          condMult: { times: 2, cond: { kind: 'not', cond: { kind: 'targetHpDamaged' } } },
        }),
        createSpecialGems({ kind: 'dragonGem', color: BaseColor.Red }, 3),
      ),
    },
    {
      id: YINSHILUO_SPELL_ID,
      desc: COMMUNITY_TROOPS.find(t => t.spell.id === YINSHILUO_SPELL_ID)!.spell.description,
      build: skill(
        cleanse('allyChosen'),
        gainLife('lastTarget', 2),
        createSpecialGems({ kind: 'manaPotionGem', color: BaseColor.Green }, 1),
        createSpecialGems({ kind: 'manaPotionGem', color: BaseColor.Purple }, 1),
      ),
    },
    {
      id: WANGFENG_SPELL_ID,
      desc: COMMUNITY_TROOPS.find(t => t.spell.id === WANGFENG_SPELL_ID)!.spell.description,
      build: skill(
        transform(BaseColor.Red, BaseColor.Purple),
        transform(BaseColor.Yellow, BaseColor.Brown),
        summonRef('WallOfTentacles', 6648, { position: 'front' }),
      ),
    },
    {
      id: GUANLI_OBSERVER_SPELL_ID,
      desc: COMMUNITY_TROOPS.find(t => t.spell.id === GUANLI_OBSERVER_SPELL_ID)!.spell.description,
      build: skill(
        createSpecialGems({ kind: 'manaPotionGem', color: BaseColor.Blue }, 1),
        createSpecialGems({ kind: 'manaPotionGem', color: BaseColor.Purple }, 1),
        explodeRandomGems(4),
      ),
    },
    {
      id: HONGDIE_SPELL_ID,
      desc: COMMUNITY_TROOPS.find(t => t.spell.id === HONGDIE_SPELL_ID)!.spell.description,
      build: skill(
        dmg('enemyLastN', 3, 1, { n: 2 }),
        // Keep the original targets: deaths must not redirect silence/drain to earlier enemies.
        inflict('silence', 'lastTargets'),
        reduce('lastTargets', 'mana', 3, 0),
        shuffleTeam('enemy'),
      ),
    },
    {
      id: PING_SPELL_ID,
      desc: COMMUNITY_TROOPS.find(t => t.spell.id === PING_SPELL_ID)!.spell.description,
      build: skill(
        destroyColor(CHOSEN),
        dmg('enemyAll', 4, 1, { ifCond: { kind: 'targetColor', color: CHOSEN } }),
        reduce('lastTargets', 'mana', 4, 0),
        extraTurn({ ifCond: { kind: 'destroyedColorAtLeast', color: CHOSEN, n: 10 } }),
      ),
    },
    {
      id: ZHUWANG_SPELL_ID,
      desc: COMMUNITY_TROOPS.find(t => t.spell.id === ZHUWANG_SPELL_ID)!.spell.description,
      build: skill(
        createGems(BaseColor.Red, 6, 0),
        // Only transformation rolls 25%; the chosen ally always gains attack afterward.
        transformTroop('allyChosenOther', 'ArmoredBoarlet', { troopId: 6935, chance: 0.25 }),
        attack('allyChosenOther', 3, 1),
        transformTroop('enemyRandom', 'ArmoredBoarlet', {
          troopId: 6935,
          ifCond: { kind: 'castStartBoardAtLeast', color: BaseColor.Red, n: 13 },
          chanceBoost: { mod: { kind: 'ratio', a: 1, b: 1 }, source: { kind: 'selfStat', stat: 'attack' }, max: 50 },
        }),
      ),
    },
    {
      id: EROCHIKA_SPELL_ID,
      desc: COMMUNITY_TROOPS.find(t => t.spell.id === EROCHIKA_SPELL_ID)!.spell.description,
      build: skill(
        // Damage precedes theft; this cast does not benefit from the newly stolen magic.
        trueDmg('enemyChosen', 2, 1),
        // Retain the selected enemy; a lethal hit must never redirect the theft.
        steal('lastTarget', 'magic', 'magic', 2, 0),
        transform(BaseColor.Blue, BaseColor.Yellow),
      ),
    },
    {
      id: HUIJIU_SPELL_ID,
      desc: COMMUNITY_TROOPS.find(t => t.spell.id === HUIJIU_SPELL_ID)!.spell.description,
      build: skill(
        createSpecialGems2([{ kind: 'elementalStar' }, { kind: 'umbralStar' }], 3, 0, {
          minimumEach: 1,
          modifier: {
            mod: { kind: 'ratio', a: 3, b: 1 },
            sources: [{ kind: 'alliesOfRace', race: COMMUNITY_RACE }, { kind: 'boardGems', color: BaseColor.Blue }],
          },
        }),
      ),
    },
    {
      id: CUIXIANG_CHIXIGUA_SPELL_ID,
      desc: COMMUNITY_TROOPS.find(t => t.spell.id === CUIXIANG_CHIXIGUA_SPELL_ID)!.spell.description,
      build: skill(
        gainLife('allyLowestHpOtherN', 4, 1, { n: 2 }),
        armor('allyFront', 0),
        inflict('barrier', 'allyFront'),
      ),
    },
  ],
  skipped: [],
};
