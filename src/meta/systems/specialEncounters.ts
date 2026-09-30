/**
 * 特殊遭遇库（活动深化批 2026-09-30）：宝藏地精 / 地精乐队 / 地精群 / 宝箱怪。
 *
 * 任何活动都可以调用：plan 阶段 specialEncounterPlan 出敌 + 额外奖励声明；modify 阶段
 * applySpecialEncounter 按 externalId 下发战斗规则（击杀目标、回合补法力、开局预置）与动态特质。
 *
 * 限时逃跑靠兵种自带技能（「有 30% 的几率跑掉」，escape 原语已实现）：规则只给地精补法力，
 * 控制它大约第几回合开溜——跑掉了就拿不到它身上的奖励（只有零钱安慰）。
 *
 * 奖励（用户拍板）：钻石基础掉落 30（低概率惊喜，不计周活动宝石预算），藏宝图 1 张。
 */
import '../data/eventTraits';
import { BaseColor } from '../../engine/types';
import type { SeededRNG } from '../../engine/rng';
import { enemyLevel } from '../data/enemyDifficulty';
import type { BridgeOutcome } from './battleBridge';
import { pickEnemies, type EncounterEnemy } from './encounter';
import type { BattleBonusSpec } from './battleBonus';
import { addRules, enemyExternalId, injectTraitsOn } from './eventModes/common';

export type SpecialEncounterId = 'treasureGnome' | 'gnomeBand' | 'gnomeParty' | 'mimic';

/** 特殊遭遇调参（概率与数额集中在这里） */
export const SPECIAL_TUNING = {
  /** 钻石基础掉落（用户拍板 30） */
  gems: 30,
  gnome: { gold: 800, gemChance: 0.25, mapChance: 0.3, fleeGold: 150, manaPerTurn: 3 },
  band: { goldEach: 250, gemChance: 0.4, mapChance: 0.35, manaPerTurn: 2 },
  party: { manaPerTurn: 2, jewelGemChance: 0.2, souls: 300, glory: 20, scrollChance: 0.3 },
  mimic: { gold: 600, gemChance: 0.2, mapChance: 0.35 },
} as const;

export const SPECIAL_INFO: Record<SpecialEncounterId, { name: string; blurb: string }> = {
  treasureGnome: { name: '追击宝藏地精', blurb: '抱着钱袋的地精躲在护卫身后。它攒够法力就会施法开溜——在它跑掉之前击倒它！' },
  gnomeBand: { name: '地精乐队', blurb: '四只地精组成的庆典乐队，成员越多技能越强，每次演奏都可能溜走。击倒全员有丰厚赏钱。' },
  gnomeParty: { name: '地精群', blurb: '一群背着宝物的地精，每只掉落不同的宝物，它们也都会跑。' },
  mimic: { name: '宝箱怪', blurb: '宝箱张开了獠牙！每次受击都会掉出赃物宝石，打倒它能拿走整箱宝藏。' },
};

const TREASURE_GNOME = 6497;
const BAND = [7063, 7064, 7065, 7066] as const;
const PARTY = { jewel: 6673, soul: 6557, glory: 6596, mecha: 6799 } as const;
const MIMICS_LOW = [6277, 7847, 7417] as const;
const MIMIC_HIGH = 7157;

export interface SpecialPlan {
  enemies: EncounterEnemy[];
  bonus: BattleBonusSpec[];
}

const elite = (troopId: number, level: number): EncounterEnemy => ({ troopId, level: enemyLevel(level), tier: 'elite', traitCount: 3 });

/**
 * 出敌 + 额外奖励声明。kingdom 只用于挑护卫；tier 0/1 决定宝箱怪档位与护卫数。
 * 敌方 externalId 口径 e{序号}-{部队id}（battleBridge.enemyToSnapshot）。
 */
export function specialEncounterPlan(id: SpecialEncounterId, kingdom: string, level: number, rng: SeededRNG, tier = 0): SpecialPlan {
  const T = SPECIAL_TUNING;
  switch (id) {
    case 'treasureGnome': {
      const escorts = pickEnemies(kingdom, level, ['minion', 'minion'], rng);
      const enemies = [...escorts, elite(TREASURE_GNOME, level)];
      const target = enemyExternalId(2, TREASURE_GNOME);
      return {
        enemies,
        bonus: [
          { id: 'gnome-purse', label: '宝藏地精的钱袋', when: { kind: 'killed', targets: [target] }, deltas: { gold: T.gnome.gold } },
          { id: 'gnome-gems', label: '地精私藏的钻石', when: { kind: 'killed', targets: [target] }, chance: T.gnome.gemChance, deltas: { gems: T.gems } },
          { id: 'gnome-map', label: '地精的藏宝图', when: { kind: 'killed', targets: [target] }, chance: T.gnome.mapChance, mats: { treasureMaps: 1 } },
          { id: 'gnome-flee', label: '地精掉落的零钱', when: { kind: 'fledAny', targets: [target] }, deltas: { gold: T.gnome.fleeGold }, note: '地精溜走了' },
        ],
      };
    }
    case 'gnomeBand': {
      const enemies = BAND.map((t) => elite(t, level));
      const ids = BAND.map((t, i) => enemyExternalId(i, t));
      return {
        enemies,
        bonus: [
          ...ids.map((ext, i): BattleBonusSpec => ({ id: `band-${i}`, label: `乐手的赏钱 · ${i + 1}`, when: { kind: 'killed', targets: [ext] }, deltas: { gold: T.band.goldEach } })),
          { id: 'band-gems', label: '乐队的压箱钻石', when: { kind: 'killed', targets: ids }, chance: T.band.gemChance, deltas: { gems: T.gems } },
          { id: 'band-map', label: '巡演路线图（藏宝图）', when: { kind: 'killed', targets: ids }, chance: T.band.mapChance, mats: { treasureMaps: 1 } },
        ],
      };
    }
    case 'gnomeParty': {
      const pool = [PARTY.jewel, PARTY.soul, PARTY.glory, PARTY.mecha];
      for (let i = pool.length - 1; i > 0; i--) { const j = rng.nextInt(i + 1); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
      const picked = pool.slice(0, tier > 0 ? 3 : 2);
      const escort = pickEnemies(kingdom, level, ['minion'], rng);
      const enemies = [...escort, ...picked.map((t) => elite(t, level))];
      const bonus: BattleBonusSpec[] = picked.map((t, k): BattleBonusSpec => {
        const ext = enemyExternalId(k + 1, t);
        const when = { kind: 'killed' as const, targets: [ext] };
        if (t === PARTY.jewel) return { id: `party-${k}`, label: '珠宝地精的宝石袋', when, chance: T.party.jewelGemChance, deltas: { gems: T.gems } };
        if (t === PARTY.soul) return { id: `party-${k}`, label: '灵魂地精的魂瓶', when, deltas: { souls: T.party.souls } };
        if (t === PARTY.glory) return { id: `party-${k}`, label: '荣耀地精的勋章', when, deltas: { glory: T.party.glory } };
        return { id: `party-${k}`, label: '机械地精的图纸', when, chance: T.party.scrollChance, mats: { forgeScrolls: 1 } };
      });
      return { enemies, bonus };
    }
    case 'mimic': {
      const troop = tier > 0 ? MIMIC_HIGH : MIMICS_LOW[rng.nextInt(MIMICS_LOW.length)]!;
      const escorts = pickEnemies(kingdom, level, tier > 0 ? ['minion', 'minion'] : ['minion'], rng);
      const enemies = [{ ...elite(troop, level + (tier > 0 ? 2 : 0)), tier: 'boss' as const }, ...escorts];
      const target = enemyExternalId(0, troop);
      return {
        enemies,
        bonus: [
          { id: 'mimic-hoard', label: '宝箱怪吞下的金币', when: { kind: 'killed', targets: [target] }, deltas: { gold: T.mimic.gold } },
          { id: 'mimic-gems', label: '箱底的钻石', when: { kind: 'killed', targets: [target] }, chance: T.mimic.gemChance, deltas: { gems: T.gems } },
          { id: 'mimic-map', label: '夹层里的藏宝图', when: { kind: 'killed', targets: [target] }, chance: T.mimic.mapChance, mats: { treasureMaps: 1 } },
        ],
      };
    }
  }
}

const mergeRules = addRules;

/** modify 阶段：按遭遇种类下发规则与特质 */
export function applySpecialEncounter(id: SpecialEncounterId, outcome: BridgeOutcome): void {
  const enemies = outcome.request.enemyTeam;
  const T = SPECIAL_TUNING;
  const ext = (troopIds: readonly number[]): string[] => enemies.filter((s) => troopIds.includes(Number(s.templateId))).map((s) => s.externalId);
  switch (id) {
    case 'treasureGnome': {
      const gnome = ext([TREASURE_GNOME]);
      for (const s of enemies.filter((e) => gnome.includes(e.externalId))) injectTraitsOn(s, ['ev_loot_booty']);
      mergeRules(outcome, {
        objective: { killTargets: gnome },
        turnStart: [{ side: 'enemy', mana: { amount: T.gnome.manaPerTurn, targets: gnome } }],
        board: { preset: [{ gem: { kind: 'bootyGem' }, count: 2 }] },
      });
      break;
    }
    case 'gnomeBand': {
      for (const s of enemies) injectTraitsOn(s, ['ev_loot_booty']);
      mergeRules(outcome, {
        turnStart: [{ side: 'enemy', mana: { amount: T.band.manaPerTurn } }],
        board: { preset: [
          { gem: { kind: 'candyGem', color: BaseColor.Red }, count: 1 },
          { gem: { kind: 'candyGem', color: BaseColor.Blue }, count: 1 },
          { gem: { kind: 'candyGem', color: BaseColor.Green }, count: 1 },
          { gem: { kind: 'candyGem', color: BaseColor.Yellow }, count: 1 },
        ] },
      });
      break;
    }
    case 'gnomeParty': {
      const gnomes = ext(Object.values(PARTY));
      for (const s of enemies.filter((e) => gnomes.includes(e.externalId))) injectTraitsOn(s, ['ev_loot_skittish']);
      mergeRules(outcome, { turnStart: [{ side: 'enemy', mana: { amount: T.party.manaPerTurn, targets: gnomes } }] });
      break;
    }
    case 'mimic': {
      const mimic = ext([...MIMICS_LOW, MIMIC_HIGH]);
      for (const s of enemies.filter((e) => mimic.includes(e.externalId))) injectTraitsOn(s, ['ev_loot_hoard', 'ev_mimic_bite']);
      mergeRules(outcome, {
        objective: { killTargets: mimic },
        board: { preset: [{ gem: { kind: 'bootyGem' }, count: 3 }] },
      });
      break;
    }
  }
}
