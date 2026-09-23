/**
 * 特质徽章（卡面特质图标行 + 详情面板共用）。
 *
 * 战斗卡与养成页同一套 game-icons 剪影（traitGlyph / traitGlyphsFor），
 * 按中文名+描述归族，未实现 code 只要有显示名也能出图。
 */
import { getTrait } from '@engine/traits';
import type { TraitDefinition } from '@engine/traits';
import { CLASSES } from '../meta/data/classes';
import { TROOPS } from '../data/troops';
import { traitGlyph, traitGlyphsFor } from '../meta/shell/traitIcon';

export interface TraitBadgeSpec {
  label: string;
  color: string;
  svg: string;
}

const SHIELD = (color: string) =>
  `<path d="M12 3l7 2.5v6c0 4-3 7.2-7 9.5-4-2.3-7-5.5-7-9.5v-6z" fill="rgba(0,0,0,.35)" stroke="${color}" stroke-width="1.5"/>`;

const HEART = (color: string) =>
  `<path d="M12 20S4 14.8 4 9.6C4 6.9 6 5 8.4 5c1.5 0 2.9.8 3.6 2 .7-1.2 2.1-2 3.6-2C18 5 20 6.9 20 9.6 20 14.8 12 20 12 20z" fill="rgba(0,0,0,.35)" stroke="${color}" stroke-width="1.4"/>`;

const SWORD = (color: string) =>
  `<path d="M13.5 3L21 10.5l-2 2-1.4-1.4L11 17.7 9.9 20l-2.6-1-1-2.6L8.5 15l6.6-6.6L13.7 7z" fill="rgba(0,0,0,.35)" stroke="${color}" stroke-width="1.3"/>`;

const STAR = (color: string) =>
  `<path d="M12 3l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4L7.5 16.8l.9-5L4.8 8.3l5-.7z" fill="rgba(0,0,0,.35)" stroke="${color}" stroke-width="1.2"/>`;

/**
 * 从特质定义推导图标规格。判定顺序即优先级：
 * 隐匿/免疫类 > 反弹/闪避 > 减伤 > 命中附状态 > 光环/灵链 > 属性触发 > 属性再生。
 */
function specOf(trait: TraitDefinition): TraitBadgeSpec {
  const label = trait.name;

  // 隐匿：睁一只眼
  if (trait.untargetable) {
    return {
      label,
      color: '#b0b6c0',
      svg: `<path d="M4 12c2.6-3.4 5.2-5 8-5s5.4 1.6 8 5c-2.6 3.4-5.2 5-8 5s-5.4-1.6-8-5z" fill="rgba(0,0,0,.35)" stroke="#b0b6c0" stroke-width="1.3"/><circle cx="12" cy="12" r="2.4" fill="#b0b6c0"/>`,
    };
  }
  // 全状态免疫：盾+叉
  if (trait.statusImmunities?.includes('*')) {
    return {
      label,
      color: '#e8d28a',
      svg: SHIELD('#e8d28a') + '<path d="M9 9.5l6 6M15 9.5l-6 6" stroke="#e8d28a" stroke-width="1.4" stroke-linecap="round"/>',
    };
  }
  // 部分状态免疫：盾+勾
  if (trait.statusImmunities?.length) {
    return {
      label,
      color: '#8fd0e8',
      svg: SHIELD('#8fd0e8') + '<path d="M9 12l2.2 2.2L15.5 10" fill="none" stroke="#8fd0e8" stroke-width="1.5" stroke-linecap="round"/>',
    };
  }
  // 反弹：回旋箭
  if (trait.reflectSkullRatio) {
    return {
      label,
      color: '#e89a6b',
      svg: '<path d="M7 16c-2-4 0-8 4.5-8 3 0 5 1.6 6.5 4" fill="none" stroke="#e89a6b" stroke-width="1.6" stroke-linecap="round"/><path d="M18.5 8.5L18 12.4l-3.8-1.2" fill="none" stroke="#e89a6b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
    };
  }
  // 闪避：风痕
  if (trait.dodgeChance) {
    return {
      label,
      color: '#9fd8ef',
      svg: '<path d="M3.5 9.5h9.5a2.2 2.2 0 1 0-2.1-2.9M3.5 13.5h13.5a2.2 2.2 0 1 1-2.1 2.9M3.5 17.5h7" fill="none" stroke="#9fd8ef" stroke-width="1.5" stroke-linecap="round"/>',
    };
  }
  // 减伤（骷髅/法术）：盾
  if (trait.skullDamageReduction !== undefined || trait.spellDamageReduction !== undefined) {
    return {
      label,
      color: '#c8ccd4',
      svg: SHIELD('#c8ccd4'),
    };
  }
  // 命中/受击附状态：骷髅头+滴
  if (trait.inflictOnSkullHit || trait.inflictOnSkullDamaged) {
    return {
      label,
      color: '#7ac4a0',
      svg: '<path d="M12 4a6 6 0 0 0-6 6c0 2.2 1 3.6 2 4.6V17h8v-2.4c1-1 2-2.4 2-4.6a6 6 0 0 0-6-6z" fill="rgba(0,0,0,.35)" stroke="#7ac4a0" stroke-width="1.3"/><circle cx="9.8" cy="10.4" r="1.3" fill="#7ac4a0"/><circle cx="14.2" cy="10.4" r="1.3" fill="#7ac4a0"/><path d="M12 18.6v2.2" stroke="#7ac4a0" stroke-width="1.3" stroke-linecap="round"/>',
    };
  }
  // 穿透护甲：剑
  if (trait.armorPierceChance) {
    return { label, color: '#e0b06b', svg: SWORD('#e0b06b') };
  }
  // 屠戮倍率：双骷髅/倍号 → 用剑+星
  if (trait.skullMultVsTroopType || trait.skullMultVsStatus || trait.skullMultVsColor || trait.skullMultVsWounded !== undefined) {
    return {
      label,
      color: '#ff8a7a',
      svg: SWORD('#ff8a7a') + '<path d="M18.4 4.2l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="#ff8a7a"/>',
    };
  }
  // 种族/全队光环：飘扬战旗（旗杆 + 波浪旗面）
  if (trait.typeAura || trait.onBigMatchTypeAura) {
    return {
      label,
      color: '#e6c979',
      svg: '<path d="M6.2 21.5V3" stroke="#e6c979" stroke-width="1.6" stroke-linecap="round"/>'
        + '<path d="M6.2 4.6c2.4-1.1 4.9-1.1 7 0 2 1.1 4.3 1.1 6.4 0l-1 7.2c-2.1 1-4.4 1-6.4 0-2.1-1.1-4.6-1.1-7 0z" fill="rgba(0,0,0,.35)" stroke="#e6c979" stroke-width="1.3" stroke-linejoin="round"/>'
        + '<circle cx="6.2" cy="3" r="1.1" fill="#e6c979"/>',
    };
  }
  // 法力灵链/开局法力：切面水晶（顶部台面 + 竖向棱面）
  if (trait.manaLink || trait.battleStartManaRatio !== undefined || trait.allyStartMana) {
    return {
      label,
      color: '#8fb8ff',
      svg: '<path d="M12 2.6l4.6 5-4.6 13.8-4.6-13.8z" fill="rgba(0,0,0,.35)" stroke="#8fb8ff" stroke-width="1.4" stroke-linejoin="round"/>'
        + '<path d="M7.4 7.6h9.2M12 2.6l-1.9 5L12 21.4l1.9-13.8z" fill="none" stroke="#8fb8ff" stroke-width="1"/>',
    };
  }
  // 攻击/魔法触发增益：剑/星
  if (trait.onDamagedGain?.stat === 'attack' || trait.onSkullHitGain?.stat === 'attack'
    || trait.onAllyCastGain?.stat === 'attack' || trait.onEnemyDeathGain?.stat === 'attack') {
    return { label, color: '#e8a06b', svg: SWORD('#e8a06b') };
  }
  if (trait.onDamagedGain?.stat === 'magic' || trait.onAllyCastGain?.stat === 'magic'
    || trait.onColorMatchGain) {
    return { label, color: '#c9a8ee', svg: STAR('#c9a8ee') };
  }
  // 每回合恢复：心+加号
  if (trait.regen) {
    return {
      label,
      color: '#7fd48a',
      svg: HEART('#7fd48a') + '<path d="M12 9.5v4M10 11.5h4" stroke="#7fd48a" stroke-width="1.2" stroke-linecap="round"/>',
    };
  }
  // 受击/命中数值增益兜底：上箭头
  if (trait.onDamagedGain || trait.onSkullHitGain || trait.onAllyCastGain || trait.onEnemyCastGain
    || trait.onEnemyDeathGain || trait.onAllyDeathGain || trait.onBigMatchGain) {
    return {
      label,
      color: '#e6c979',
      svg: '<path d="M12 4l6 6h-3.5v9h-5v-9H6z" fill="rgba(0,0,0,.35)" stroke="#e6c979" stroke-width="1.3"/>',
    };
  }
  // 回合开始棋盘写入：格子
  if (trait.turnStartCreateGem || trait.turnStartColorToSkull) {
    return {
      label,
      color: '#a8d8a0',
      svg: '<rect x="4.5" y="4.5" width="15" height="15" rx="2" fill="rgba(0,0,0,.35)" stroke="#a8d8a0" stroke-width="1.4"/><path d="M9.5 9.5h5v5h-5z" fill="#a8d8a0" opacity=".7"/>',
    };
  }
  // 骷髅即死/猎杀：骷髅+闪电
  if (trait.skullLethalChance !== undefined || trait.onSkullHitKill) {
    return {
      label,
      color: '#d8b86b',
      svg: '<path d="M12 4a6 6 0 0 0-6 6c0 2.2 1 3.6 2 4.6V17h8v-2.4c1-1 2-2.4 2-4.6a6 6 0 0 0-6-6z" fill="rgba(0,0,0,.35)" stroke="#d8b86b" stroke-width="1.3"/><path d="M13.2 8.2l-2.6 3.4h2l-1.4 3.6 3.4-4.2h-2z" fill="#d8b86b"/>',
    };
  }
  // 回合开始施加状态/开局施加状态：盾+星（屏障/控制类）
  if (trait.battleStartStatus || trait.turnStartStatus) {
    return {
      label,
      color: '#a8c8e8',
      svg: SHIELD('#a8c8e8') + '<path d="M12 8.4l1 2.1 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" fill="#a8c8e8"/>',
    };
  }
  // 回合开始风暴/开局风暴：云+闪电
  if (trait.turnStartStorm || trait.battleStartStorm) {
    return {
      label,
      color: '#9fb8e0',
      svg: '<path d="M6.5 14.5a3.5 3.5 0 0 1 .6-6.9 4.5 4.5 0 0 1 8.7-.8 3.2 3.2 0 0 1 1.2 6.2z" fill="rgba(0,0,0,.35)" stroke="#9fb8e0" stroke-width="1.3"/><path d="M12.5 13.5l-2.6 3.6h1.8l-1.2 3 3.4-4.4h-1.9z" fill="#9fb8e0"/>',
    };
  }
  // PvP 限定：双剑交叉
  if (trait.pvpBonus || trait.pvpEconomyGain) {
    return {
      label,
      color: '#e88a8a',
      svg: '<path d="M5 4l9.5 9.5M19 4L9.5 13.5" stroke="#e88a8a" stroke-width="1.6" stroke-linecap="round"/><path d="M6.5 15.5L4 18l2 2 2.5-2.5M17.5 15.5L20 18l-2 2-2.5-2.5" stroke="#e88a8a" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    };
  }
  // 敌方施法/死亡全体光环：战旗（与族亲光环同族）
  if (trait.onEnemyCastTypeAura || trait.onEnemyDeathEnemyAllStatus || trait.onSelfDeathEnemyAllStatus
    || trait.turnStartTypeAura || trait.positionAura) {
    return {
      label,
      color: '#e6c979',
      svg: '<path d="M6.2 21.5V3" stroke="#e6c979" stroke-width="1.6" stroke-linecap="round"/>'
        + '<path d="M6.2 4.6c2.4-1.1 4.9-1.1 7 0 2 1.1 4.3 1.1 6.4 0l-1 7.2c-2.1 1-4.4 1-6.4 0-2.1-1.1-4.6-1.1-7 0z" fill="rgba(0,0,0,.35)" stroke="#e6c979" stroke-width="1.3" stroke-linejoin="round"/>'
        + '<circle cx="6.2" cy="3" r="1.1" fill="#e6c979"/>',
    };
  }
  // 死亡召唤：骷髅+展开的双翼（身亡时留下后代/援军）
  if (trait.summonOnDeath || trait.summonOnAllyDeath || trait.summonOnEnemyDeath
    || trait.summonOnDamaged || trait.summonOnAllyCast || trait.turnStartSummon) {
    return {
      label,
      color: '#b8a0d8',
      svg: '<path d="M12 4a5.5 5.5 0 0 0-5.5 5.5c0 2 0.9 3.3 1.8 4.2V16h7.4v-2.3c0.9-0.9 1.8-2.2 1.8-4.2A5.5 5.5 0 0 0 12 4z" fill="rgba(0,0,0,.35)" stroke="#b8a0d8" stroke-width="1.3"/><circle cx="9.9" cy="10" r="1.2" fill="#b8a0d8"/><circle cx="14.1" cy="10" r="1.2" fill="#b8a0d8"/><path d="M4.5 14.5L8 17M19.5 14.5L16 17M6.5 18.5l2.5-1M17.5 18.5l-2.5-1" stroke="#b8a0d8" stroke-width="1.2" stroke-linecap="round"/>',
    };
  }
  // 兜底：六边形
  return {
    label,
    color: '#cfc19a',
    svg: '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" fill="rgba(0,0,0,.35)" stroke="#cfc19a" stroke-width="1.4"/>',
  };
}

// —— 静态天赋显示兜底（主角系统 v3）——
// classes.json 里 selfStat/alliesStat/武器条件/经验/PvP 族天赋不走引擎特质（行为在
// meta 快照期/结算期计算），引擎查不到定义；但主角卡需要与兵种特质同款的图标行。
// 这里按效果 kind 合成「显示用定义」（只进图标推导，永不编译进战斗）。
const STATIC_TALENT_DISPLAY: ReadonlyMap<string, TraitDefinition> = (() => {
  const map = new Map<string, TraitDefinition>();
  for (const cls of CLASSES) {
    for (const tree of cls.trees) {
      for (const t of tree.talents) {
        if (map.has(t.code)) continue;
        const e = t.effect;
        let display: TraitDefinition | undefined;
        void 0;
        switch (e.kind) {
          case 'selfStat': {
            const extra: Partial<TraitDefinition> =
              e.stat === 'attack' ? { onSkullHitGain: { stat: 'attack', amount: 0 } }
                : e.stat === 'magic' ? { onColorMatchGain: { color: 'Red', stat: 'magic', amount: 0 } }
                  : { onDamagedGain: { stat: 'hp', amount: 0 } };
            display = { code: t.code, name: t.nameZh, description: t.descriptionZh, ...extra };
            break;
          }
          case 'selfStatIfWeapon':
            display = { code: t.code, name: t.nameZh, description: t.descriptionZh,
              onSkullHitGain: { stat: 'attack', amount: 0 } };
            break;
          case 'selfStatIfPosition':
          case 'selfStatPerAlly':
            display = { code: t.code, name: t.nameZh, description: t.descriptionZh,
              onDamagedGain: { stat: 'hp', amount: 0 } };
            break;
          case 'alliesStat':
            display = { code: t.code, name: t.nameZh, description: t.descriptionZh,
              typeAura: { troopType: 'Human', stat: 'hp', amount: 0 } };
            break;
          case 'xpBonus':
            display = { code: t.code, name: t.nameZh, description: t.descriptionZh,
              turnStartEconomy: { currency: 'gold', amount: 0 } };
            break;
          default:
            break;
        }
        if (display) map.set(t.code, display);
      }
    }
  }
  return map;
})();

const CLASS_TEXT: ReadonlyMap<string, { name: string; description: string }> = (() => {
  const map = new Map<string, { name: string; description: string }>();
  for (const cls of CLASSES) {
    for (const tree of cls.trees) {
      for (const t of tree.talents) {
        if (!map.has(t.code)) map.set(t.code, { name: t.nameZh, description: t.descriptionZh });
      }
    }
    for (const perk of cls.perks) {
      if (!map.has(perk.code)) map.set(perk.code, { name: perk.nameZh, description: perk.descriptionZh });
    }
  }
  return map;
})();

/** 卡面/浮层用的中文名与描述：引擎库 → 职业天赋/专属 → 兵种图鉴 → 快照名。 */
export function traitDisplayCopy(
  code: string,
  fallbackName?: string,
  troopName?: string,
): { name: string; description: string } {
  const lib = getTrait(code) ?? STATIC_TALENT_DISPLAY.get(code);
  if (lib) return { name: lib.name, description: lib.description };
  const cls = CLASS_TEXT.get(code);
  if (cls) return cls;
  if (troopName) {
    const official = TROOPS.find((t) => t.name === troopName)?.traits.find((t) => t.code === code);
    if (official) return { name: official.name, description: official.description };
  }
  return { name: fallbackName || code, description: '' };
}

/** game-icons 内联 SVG；未知 code 且无显示名时返回 null。 */
export function traitBadgeSvg(code: string): string | null {
  const lib = getTrait(code) ?? STATIC_TALENT_DISPLAY.get(code);
  if (lib) return traitGlyph(code, lib.name, lib.description, 2);
  const cls = CLASS_TEXT.get(code);
  if (cls) return traitGlyph(code, cls.name, cls.description, 2);
  return null;
}

/** 一组卡面特质：同屏去重的 game-icons，未实现 code 也出图。 */
export function traitCardGlyphs(
  codes: string[],
  names?: Record<string, string>,
  troopName?: string,
  tier = 2,
): Array<{ code: string; name: string; description: string; svg: string }> {
  const copies = codes.map((code) => ({ code, ...traitDisplayCopy(code, names?.[code], troopName) }));
  const glyphs = traitGlyphsFor(copies, tier);
  return copies.map((copy, i) => ({ ...copy, svg: glyphs[i]! }));
}

/** 图标规格（含中文标签），供卡面 tooltip / 调试页使用。 */
export function traitBadge(code: string): TraitBadgeSpec | null {
  const trait = getTrait(code);
  if (!trait) return null;
  return specOf(trait);
}
