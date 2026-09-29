/**
 * 角色详情展示模型（战斗技能系统 · 需求 4）。
 *
 * 战斗里的角色详情由 `UnitSheet`（棋盘上的非模态部队详情窗）渲染；本文件只保留
 * 「数据 → 展示模型」的纯函数 buildDetailViewModel（可在 node 环境单测），
 * 纯读：只消费 Character 与该角色对应的 TroopData，不触碰引擎状态（需求 4.5）。
 */
import { BaseColor } from '@engine/types';
import type { Character } from '@engine/types';
import { getTrait } from '@engine/traits';
import { skillDisplayOf } from '@session/assigner';
import type { TroopData } from '../data/troops';
import { statusBadge } from './statusBadges';

/** 面板展示用的纯数据模型（与 DOM 无关，便于测试） */
export interface DetailViewModel {
  name: string;
  hp: number;
  maxHp: number;
  armor: number;
  attack: number;
  magic: number;
  /** 当前法力 */
  mana: number;
  /** 释放技能所需法力（= 技能法力值消耗） */
  manaCost: number;
  colors: BaseColor[];
  /** 当前状态（图标 + 中文名 + 剩余回合/每回合数值） */
  statuses: { id: string; label: string; color: string; turns: number; magnitude?: number }[];
  /** 技能信息；无任何文本源时为 null */
  skill: {
    name: string;
    description: string;
    /** 法力值消耗（等于角色 manaCost） */
    manaCost: number;
  } | null;
  /**
   * 特质列表。以 Character.traitIds 为权威来源（宿主注入的角色没有 TroopData 也可见），
   * TroopData.traits 只作官方描述补充。implemented=false 表示引擎尚未实现该特质，
   * 战斗中不生效——如实展示而不是藏掉。code 供图标推导（与卡面同一套 game-icons）。
   */
  traits: { code: string; name: string; description: string; implemented: boolean }[];
}

/** 快照携带的显示文本（宿主武器/兵种法术、库外特质中文名） */
export interface CharacterDisplay {
  spellName?: string;
  spellDescription?: string;
  /** 库外特质 code 的中文名兜底（职业天赋/专属特质） */
  traitNames?: Record<string, string>;
}

/**
 * 从 Character（+可选 TroopData）构建展示模型（需求 4.1–4.3）。纯函数、无副作用。
 * hp 夹在 [0, maxHp]、mana 夹在 [0, manaCost]，避免展示越界的中间态数值。
 */
export function buildDetailViewModel(
  char: Character,
  troop?: TroopData,
  display?: CharacterDisplay,
): DetailViewModel {
  // 技能：TroopData 优先（官方全文）；宿主角色没有兵种数据时，
  // 从分拣技能池取该 skillId 的名称/描述（分拣分配的技能都在池内）。
  const skill = troop
    ? {
        name: troop.spell.name,
        description: troop.spell.description,
        manaCost: char.manaCost,
      }
    : char.spellName || display?.spellName
      ? {
          name: char.spellName ?? display?.spellName ?? '',
          description: char.spellDescription ?? display?.spellDescription ?? '',
          manaCost: char.manaCost,
        }
      : (() => {
          const pool = skillDisplayOf(char.skillId ?? '');
          return pool
            ? { name: pool.name, description: pool.description, manaCost: char.manaCost }
            : null;
        })();

  // 特质合并：traitIds（引擎权威）→ 特质库取名称/描述；库里没有的（未实现 code）
  // 回落到 TroopData 的官方文本并标注未生效。TroopData 里多出的条目也列出。
  const traits: DetailViewModel['traits'] = [];
  const seen = new Set<string>();
  for (const code of char.traitIds ?? []) {
    if (seen.has(code)) continue;
    seen.add(code);
    const lib = getTrait(code);
    const official = troop?.traits.find((t) => t.code === code);
    traits.push({
      code,
      name: official?.name ?? lib?.name ?? display?.traitNames?.[code] ?? char.traitNames?.[code] ?? code,
      description: official?.description ?? lib?.description ?? '',
      implemented: !!lib,
    });
  }
  for (const t of troop?.traits ?? []) {
    if (seen.has(t.code)) continue;
    seen.add(t.code);
    traits.push({
      code: t.code,
      name: t.name,
      description: t.description,
      implemented: !!getTrait(t.code),
    });
  }

  return {
    name: char.name,
    hp: Math.max(0, Math.min(char.hp, char.maxHp)),
    maxHp: char.maxHp,
    armor: Math.max(0, char.armor),
    attack: char.attack,
    magic: char.magic,
    mana: Math.max(0, Math.min(char.mana, char.manaCost)),
    manaCost: char.manaCost,
    colors: [...char.colors],
    statuses: (char.statuses ?? []).map((s) => {
      const badge = statusBadge(s.id);
      return {
        id: s.id,
        label: badge.label,
        color: badge.color,
        turns: s.turns,
        ...(s.magnitude !== undefined ? { magnitude: s.magnitude } : {}),
      };
    }),
    skill,
    traits,
  };
}

/** 图鉴同款特质槽：固定 3 槽，已解锁 / 未解锁 / 未开槽 */
export interface TraitSlot {
  /** 特质 code；未开槽为空串 */
  code: string;
  name: string;
  description: string;
  /** 引擎是否实现（未实现的已解锁特质标「本场不生效」） */
  implemented: boolean;
  /** 本场是否已解锁（在 Character.traitIds 里） */
  unlocked: boolean;
}

const SLOT_ORDINAL = ['一', '二', '三', '四'];

/**
 * 与图鉴「天赋特质」同一口径的 3 个槽位（纯函数）：
 * - 有兵种数据：槽位 = TroopData.traits 顺序，在本场 traitIds 里的算已解锁，其余显示未解锁；
 * - 无兵种数据（原创/宿主角色）：槽位 = 卡面展示清单（displayTraitIds ?? traitIds），均为已解锁；
 * - 不足的槽补「未开槽」。
 */
export function traitSlotsOf(
  char: Character,
  troop?: TroopData,
  display?: CharacterDisplay,
  slots = 3,
): TraitSlot[] {
  const owned = new Set(char.traitIds ?? []);
  const fromTroop = !!troop && troop.traits.length > 0;
  const defs = fromTroop
    ? troop!.traits.slice(0, slots).map((t) => ({ code: t.code, name: t.name, description: t.description }))
    : [...new Set(char.displayTraitIds ?? char.traitIds ?? [])].slice(0, slots).map((code) => {
        const lib = getTrait(code);
        return {
          code,
          name: lib?.name ?? display?.traitNames?.[code] ?? char.traitNames?.[code] ?? code,
          description: lib?.description ?? '',
        };
      });
  const out: TraitSlot[] = defs.map((d) => ({
    ...d,
    implemented: !!getTrait(d.code),
    unlocked: fromTroop ? owned.has(d.code) : true,
  }));
  while (out.length < slots) {
    out.push({
      code: '',
      name: '未开槽',
      description: `该部队没有第${SLOT_ORDINAL[out.length] ?? out.length + 1}个特质。`,
      implemented: false,
      unlocked: false,
    });
  }
  return out;
}
