import { CARD_STAT_ICONS } from '../../render/TeamView';
import type { UnitSheetData } from '../../render/UnitSheet';
import { troopArt } from './teamScreen';
import type { TroopData } from '../../data/troops';
import { troopStatsAtLevel } from '../../data/leveling';
import { isCoupletSpell, spellTitleText } from '../../data/spellPresentation';
import { ARENA, arenaDraftLevel } from '../data/economy';
import { roleNameZh } from '../data/roles';
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
  return `<div class="arena-detail-heading"><div><h3>${escapeHtml(troop.name)}</h3><small>${escapeHtml([roleNameZh(troop.role) ?? '', troop.kingdom ?? '无王国', ARENA.rarityLabels[troop.rarityIdx] ?? ''].filter(Boolean).join(' · '))}</small></div><span class="arena-detail-mana" aria-label="法力消耗 ${troop.manaCost}">${gemSvg(troop.manaColors.map(c => c.toLowerCase()))}<b>${troop.manaCost}</b></span></div>
    ${arenaStatsMarkup(troop)}${arenaSpellMarkup(troop)}
    <p class="arena-detail-rule">Lv.${arenaDraftLevel(troop.rarityIdx)} · 无特质 · 无外部加成</p>`;
}

/** Battle-style five-stat overlay; no collection bonuses or pretend charged mana. */
export function arenaPortraitStatsMarkup(troop: TroopData): string {
  const stats = troopStatsAtLevel(troop, arenaDraftLevel(troop.rarityIdx));
  const fields = [
    ['attack', '攻击', CARD_STAT_ICONS.sword], ['armor', '护甲', CARD_STAT_ICONS.shield],
    ['health', '生命', CARD_STAT_ICONS.heart], ['magic', '魔力', CARD_STAT_ICONS.magic],
  ] as const;
  return `<span class="arena-portrait-stats">
    <span class="arena-portrait-stat mana-cost" data-stat="mana" aria-label="法力消耗 ${troop.manaCost}" title="法力消耗 ${troop.manaCost}">${gemSvg(troop.manaColors.map(c => c.toLowerCase()))}<b>${troop.manaCost}</b></span>
    ${fields.map(([key, label, glyph]) => `<span class="arena-portrait-stat ${key}" data-stat="${key}" aria-label="${label} ${stats[key]}" title="${label} ${stats[key]}">${glyph}<b>${stats[key]}</b></span>`).join('')}
  </span>`;
}

/** Adapter for the actual battle codex; arena traits are shown, never activated. */
export function arenaUnitSheetData(troop: TroopData): UnitSheetData {
  const stats = troopStatsAtLevel(troop, arenaDraftLevel(troop.rarityIdx));
  return {
    charId: troop.id, ally: false, name: troop.name, portrait: troopArt(troop), colors: troop.manaColors,
    shown: { attack: stats.attack, armor: stats.armor, hp: stats.health, maxHp: stats.health,
      magic: stats.magic, mana: 0, manaCost: troop.manaCost, defeated: false, statuses: [] },
    typeLine: `Lv.15 · 无特质 · 无外部加成`, role: roleNameZh(troop.role) ?? '', race: '', kingdom: troop.kingdom ?? '',
    rarityLabel: ARENA.rarityLabels[troop.rarityIdx] ?? '', rarity: troop.rarityIdx, rarityColor: null,
    skillName: troop.spell.name, skillDescription: troop.spell.description,
    skillTag: '竞技场 · 部队法术', targetNote: '', quickCast: false,
    traitSlots: troop.traits.map(trait => ({ ...trait, description: `竞技场中不生效。${trait.description}`, implemented: false, unlocked: false })),
  };
}
