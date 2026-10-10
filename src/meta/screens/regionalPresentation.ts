import type { CombatantSnapshot } from '../../session/contract';
import { CARD_STAT_ICONS, manaGemSvg } from '../../render/TeamView';

/** Read the signed-plan preview snapshot, including frenzy and monolith modifiers. */
export function regionalPortraitStats(c: CombatantSnapshot): string {
  const fields = [
    ['magic', '魔力', CARD_STAT_ICONS.magic],
    ['attack', '攻击', CARD_STAT_ICONS.sword],
    ['armor', '护甲', CARD_STAT_ICONS.shield],
    ['hp', '生命', CARD_STAT_ICONS.heart],
  ] as const;
  return `<span class="rg-portrait-stats">
    <span class="rg-stat rg-stat-mana" data-stat="mana" aria-label="法力 0/${c.manaCost}" title="法力 0/${c.manaCost}">${manaGemSvg(c.manaColors, 0)}<span class="rg-gem-mana" aria-hidden="true"><b>0</b><small>/${c.manaCost}</small></span></span>
    ${fields.map(([key, label, glyph]) => `<span class="rg-stat rg-stat-${key}" data-stat="${key}" aria-label="${label} ${c.stats[key]}" title="${label} ${c.stats[key]}">${glyph}<b>${c.stats[key]}</b></span>`).join('')}
  </span>`;
}
