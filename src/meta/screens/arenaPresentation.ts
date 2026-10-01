import type { TroopData } from '../../data/troops';
import { troopStatsAtLevel } from '../../data/leveling';
import { isCoupletSpell, spellTitleText } from '../../data/spellPresentation';
import { ARENA, arenaDraftLevel } from '../data/economy';
import { gemSvg, icon } from '../shell/chrome';
import { renderSpell } from '../shell/spellText';
import { escapeHtml } from './troopCard';

/** Arena presentation always uses tournament stats, never collection bonuses. */
export function arenaStatsMarkup(troop: TroopData): string {
  const stats = troopStatsAtLevel(troop, arenaDraftLevel(troop.rarityIdx));
  const fields = [
    ['attack', '攻击', 'swords'], ['armor', '护甲', 'shield'],
    ['health', '生命', 'heart'], ['magic', '魔力', 'orb'],
  ] as const;
  return `<div class="arena-attributes" aria-label="竞技场属性">${fields.map(([key, label, glyph]) =>
    `<span class="arena-attribute ${key}" data-stat="${key}" aria-label="${label} ${stats[key]}" title="${label}"><span aria-hidden="true">${icon(glyph)}</span><b>${stats[key]}</b></span>`,
  ).join('')}</div>`;
}

export function arenaSpellMarkup(troop: TroopData): string {
  const stats = troopStatsAtLevel(troop, arenaDraftLevel(troop.rarityIdx));
  return `<div class="draft-spell"><strong class="${isCoupletSpell(troop.spell.name) ? 'spell-couplet' : ''}">${escapeHtml(spellTitleText(troop.spell.name))}</strong><p class="draft-spell-copy">${renderSpell(troop.spell.description, stats.magic, { interactive: false }).html || '暂无技能描述'}</p></div>`;
}

export function arenaTroopDetailMarkup(troop: TroopData): string {
  return `<div class="arena-detail-heading"><div><h3>${escapeHtml(troop.name)}</h3><small>${escapeHtml(troop.kingdom ?? '无王国')} · ${ARENA.rarityLabels[troop.rarityIdx] ?? ''}</small></div><span class="arena-detail-mana" aria-label="法力消耗 ${troop.manaCost}">${gemSvg(troop.manaColors.map(c => c.toLowerCase()))}<b>${troop.manaCost}</b></span></div>
    ${arenaStatsMarkup(troop)}${arenaSpellMarkup(troop)}
    <p class="arena-detail-rule">Lv.${arenaDraftLevel(troop.rarityIdx)} · 无特质 · 无外部加成</p>`;
}
