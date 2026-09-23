/**
 * 武器获取途径（官方 dump 接线）。
 *
 * gowhead `data.MasteryRequirement` 是 718 把武器都有的解锁字段。玩家可见口径只留一行：
 *  - 2~50：经典精通线 → **对应色法力精通 N**；
 *  - 1002：38 把职业神话 → **{职业}专属 · 职业 250 胜解锁**；
 *  - 熔炉白名单：活动系与 Dawnbringer → **熔炉锻造**；
 *  - 1003 直购：无王国门槛 → **宝石商店 · N 宝石**；
 *  - 王国包 / 活动武器：通关所属王国后进入宝石商店，未通关不上架。
 *
 * 屏层只读 `acquireOf` / `acquireProgress`；写入走 `systems/hero.claimWeapon`。
 */
import type { MetaSave } from '../state/schema';
import type { WeaponDef } from './weapons';
import { classByKingdom } from './classes';
import { QUESTS_PER_KINGDOM } from './kingdoms';
import { findRecipe, SOULFORGE_RECIPES } from './soulforge';
import { forgeTierUnlockLevel } from '../systems/forge';
import {
  masteryAcquireLabel,
  masteryUnlockColors,
  meetsMasteryUnlock,
  MASTERY_NAME,
} from '../systems/manaMastery';
import type { ManaColor } from '../state/schema';

export type WeaponAcquireKind =
  | 'starter'
  | 'mastery'
  | 'class'
  | 'kingdom'
  | 'forge'
  | 'buy'
  | 'placeholder';

export interface WeaponAcquire {
  kind: WeaponAcquireKind;
  /** 详情唯一文案：条件写在这一行，不再另附「官方：」 */
  label: string;
  heroLevel?: number;
  masteryColors?: ManaColor[];
  masteryNeed?: number;
  classId?: string;
  className?: string;
  kingdom?: string;
  souls?: number;
  gold?: number;
  gems?: number;
}

export interface AcquireProgress {
  ready: boolean;
  /** toast / 领取拒绝用 */
  hint: string;
  /** 卡面角标 */
  short: string;
}

/** 职业神话武器的官方 MasteryRequirement */
export const CLASS_WEAPON_MASTERY = 1002;
/** 职业专属武器胜场门槛 */
export const CLASS_WEAPON_WINS = 250;
/** 熔炉 / 神话直购位 */
export const FORGE_WEAPON_MASTERY = 1003;
/** 活动 / 王国包（非精通） */
export const EVENT_WEAPON_MASTERY = 1000;
/** 熔炉 Tier 2 门槛（Dawnbringer 等配方仍走灵魂，不进宝石商店） */
export const SOUL_BUY_HERO_LEVEL = 40;

export const ACQUIRE_FILTERS: ReadonlyArray<[WeaponAcquireKind, string]> = [
  ['starter', '初始武器'],
  ['mastery', '法力精通'],
  ['class', '职业专属'],
  ['kingdom', '王国商店'],
  ['forge', '熔炉锻造'],
  ['buy', '宝石商店'],
  ['placeholder', '占位不可装备'],
];

/** 宝石商店标价（设计值；对照宝石箱单抽 150） */
export function gemBuyCost(rarity: string): number {
  if (rarity === 'Doomed') return 1_200;
  if (rarity === 'Mythic' || rarity === 'Legendary') return 800;
  if (rarity === 'Epic') return 400;
  return 250;
}

export function kingdomQuestCleared(save: MetaSave, kingdom: string): boolean {
  return (save.kingdoms[kingdom]?.questsDone ?? 0) >= QUESTS_PER_KINGDOM;
}

function forgeAcquire(w: WeaponDef): WeaponAcquire {
  const stock = SOULFORGE_RECIPES.find((row) => row.recipe.weaponId === w.id);
  const recipe = stock?.recipe ?? findRecipe(w.id);
  const level = recipe ? forgeTierUnlockLevel(recipe.tier) : SOUL_BUY_HERO_LEVEL;
  return {
    kind: 'forge',
    label: `熔炉锻造 · 主角 Lv.${level}`,
    heroLevel: level,
    souls: recipe?.souls,
    gold: recipe?.gold,
  };
}

function buyAcquire(w: WeaponDef, kingdom?: string): WeaponAcquire {
  const gems = gemBuyCost(w.rarity);
  const price = gems.toLocaleString('en-US');
  return {
    kind: 'buy',
    label: kingdom ? `宝石商店 · 通关${kingdom}后购买` : `宝石商店 · ${price} 宝石`,
    gems,
    kingdom,
  };
}

/** 一把武器的获取途径（纯数据，不读存档） */
export function acquireOf(w: WeaponDef): WeaponAcquire {
  if (w.starter) return { kind: 'starter', label: '初始武器 · 无需解锁' };
  if (!w.equippable) {
    return { kind: 'placeholder', label: '占位武器 · 不可装备' };
  }
  if (findRecipe(w.id)) return forgeAcquire(w);

  const req = w.masteryRequirement ?? 0;
  if (req === CLASS_WEAPON_MASTERY) {
    const cls = w.kingdom ? classByKingdom(w.kingdom) : undefined;
    if (cls) {
      return {
        kind: 'class',
        label: `${cls.name}专属 · 职业 250 胜解锁`,
        classId: cls.id,
        className: cls.name,
        kingdom: w.kingdom,
      };
    }
  }
  if (req > 0 && req <= 50) {
    const colors = masteryUnlockColors(w.manaColors);
    return {
      kind: 'mastery',
      label: masteryAcquireLabel(colors, req),
      masteryColors: colors,
      masteryNeed: req,
    };
  }
  if (req === FORGE_WEAPON_MASTERY) return buyAcquire(w);
  if (w.kingdom) return buyAcquire(w, w.kingdom);
  return buyAcquire(w);
}

/** 目录筛选：通关后进商店的武器归「王国商店」，无门槛直购归「宝石商店」 */
export function acquireFilterKind(acquire: WeaponAcquire): WeaponAcquireKind {
  if (acquire.kind === 'buy' && acquire.kingdom) return 'kingdom';
  return acquire.kind;
}

export function acquireFilterLabel(kind: WeaponAcquireKind): string {
  return ACQUIRE_FILTERS.find((row) => row[0] === kind)?.[1] ?? kind;
}

/** 宝石商店货架：直购 + 已通关王国的包/活动武器；未通关的不上架 */
export function listedInGemShop(save: MetaSave, weapon: WeaponDef): boolean {
  if (!weapon.equippable) return false;
  const acquire = acquireOf(weapon);
  if (acquire.kind !== 'buy') return false;
  if (acquire.kingdom && !kingdomQuestCleared(save, acquire.kingdom)) return false;
  return true;
}

/** 对照存档：现在能不能领 / 差什么 */
export function acquireProgress(save: MetaSave, acquire: WeaponAcquire): AcquireProgress {
  switch (acquire.kind) {
    case 'starter':
      return { ready: true, hint: '初始武器，开局即拥有。', short: '初始' };
    case 'placeholder':
      return { ready: false, hint: '占位武器没有战斗法术，无法领取或装备。', short: '不可装备' };
    case 'mastery': {
      const colors = acquire.masteryColors ?? [];
      const need = acquire.masteryNeed ?? 1;
      const ready = meetsMasteryUnlock(save, colors, need);
      const names = colors.length >= 6
        ? '全系精通'
        : colors.map((c) => MASTERY_NAME[c]).join(' · ');
      return {
        ready,
        hint: ready ? acquire.label : `需要${names} ${need}`,
        short: ready ? '可领取' : acquire.label,
      };
    }
    case 'class': {
      const unlocked = Boolean(acquire.classId && save.hero.unlockedClasses.includes(acquire.classId));
      const wins = acquire.classId ? (save.hero.classWins[acquire.classId] ?? 0) : 0;
      const ready = unlocked && wins >= CLASS_WEAPON_WINS;
      return {
        ready,
        hint: ready
          ? acquire.label
          : unlocked
            ? `当前职业 ${wins} / ${CLASS_WEAPON_WINS} 胜`
            : acquire.label,
        short: ready ? '可领取' : `${wins}/${CLASS_WEAPON_WINS} 胜`,
      };
    }
    case 'kingdom':
    case 'buy': {
      if (acquire.kingdom && !kingdomQuestCleared(save, acquire.kingdom)) {
        return {
          ready: false,
          hint: `通关${acquire.kingdom}后于宝石商店购买`,
          short: `通关${acquire.kingdom}`,
        };
      }
      const gems = acquire.gems ?? gemBuyCost('Epic');
      const ready = save.currencies.gems >= gems;
      const gap = Math.max(0, gems - save.currencies.gems);
      return {
        ready,
        hint: ready
          ? `花费 ${gems.toLocaleString('en-US')} 宝石购买`
          : `还差 ${gap.toLocaleString('en-US')} 宝石`,
        short: ready ? '可购买' : `还差 ${gap}`,
      };
    }
    case 'forge': {
      const need = acquire.heroLevel ?? 20;
      const levelReady = save.hero.level >= need;
      return {
        ready: levelReady,
        hint: levelReady
          ? '已达熔炉门槛，前往熔炉消耗灵魂与黄金锻造。'
          : `熔炉需要主角 Lv.${need}（当前 Lv.${save.hero.level}）`,
        short: levelReady ? '可锻造' : `主角 Lv.${need}`,
      };
    }
  }
}

/** 详情页获取途径的段标题图标 */
export function acquireIcon(kind: WeaponAcquireKind): string {
  if (kind === 'starter') return 'check';
  if (kind === 'mastery') return 'swirl';
  if (kind === 'class') return 'helmet';
  if (kind === 'kingdom') return 'flag';
  if (kind === 'forge') return 'soul';
  if (kind === 'buy') return 'crystal';
  return 'lock';
}
