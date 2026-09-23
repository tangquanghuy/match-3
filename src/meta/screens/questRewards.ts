import { getTroopById } from '../../data/troops';
import { BaseColor } from '../../engine/types';
import { EXPLORE_DROPS } from '../data/economy';
import {
  exploreTierForNode,
  kingdomBaseLevel,
  kingdomQuestRewardTroop,
  kingdomTroopPool,
  type KingdomStageMode,
} from '../data/kingdoms';
import { INGOT_KEYS, INGOT_NAMES, STONE_COLORS, stoneColorKeyOf, stoneName } from '../data/materials';
import { ingotArt, materialImg, stoneMarkup } from '../shell/materialArt';

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tile(kind: string, key: string, label: string, symbol: string, tier?: string): string {
  return `<span class="qloot-tile ${kind}" data-reward="${kind}:${escapeAttr(key)}"${tier ? ` data-tier="${tier}"` : ''} title="${escapeAttr(label)}" aria-label="${escapeAttr(label)}">${symbol}</span>`;
}

function currencyTile(kind: 'coin' | 'soul' | 'key'): string {
  const label = kind === 'coin' ? '黄金 · 战斗奖励' : kind === 'soul' ? '灵魂 · 战斗奖励' : '金钥匙 · 第 8 关首次通关奖励';
  return tile('currency', kind, label, `<span class="qloot-symbol ${kind}" data-icon="${kind}"></span>`);
}

function troopTile(kingdom: string, node: 4 | 8): string {
  const id = kingdomQuestRewardTroop(kingdom, node);
  const troop = id === null ? null : getTroopById(id);
  if (!troop) return '';
  const symbol = troop.portrait
    ? `<img class="qloot-portrait" src="/meta/assets/portraits/${escapeAttr(troop.portrait)}.webp" alt="" loading="lazy">`
    : '<span class="qloot-symbol" data-icon="helmet"></span>';
  return tile('troop', String(troop.id), `${troop.name} · 第 ${node} 关首次通关奖励`, symbol);
}

function ingotTile(kingdom: string): string {
  // Keep the same index mapping as settlement.ts, including its final fallback.
  const level = kingdomBaseLevel(kingdom);
  const index = EXPLORE_DROPS.ingotTierByKingdomLevel.findIndex((cap) => level <= cap);
  const key = INGOT_KEYS[index === -1 ? INGOT_KEYS.length - 2 : index]!;
  const label = `${INGOT_NAMES[key]} · 胜利时 ${Math.round(EXPLORE_DROPS.ingotChance * 100)}% 概率掉落`;
  return tile('ingot', key, label, `<span class="qloot-symbol ingot">${materialImg(ingotArt(key))}</span>`, key);
}

/** Actual lead candidates, matching encounter.ts's rarity-band fallback.
 * Preview enemies use a different seed, so their lead cannot promise one stone color.
 */
function possibleStoneColors(kingdom: string, mode: 'hard' | 'veryHard', node: number): string[] {
  const tier = exploreTierForNode(mode, node);
  let min = tier <= 2 ? 0 : 2;
  let max = tier <= 2 ? 2 : 4;
  let pool = kingdomTroopPool(kingdom, { min, max });
  while (pool.length === 0 && (min > 0 || max < 5)) {
    min = Math.max(0, min - 1);
    max = Math.min(5, max + 1);
    pool = kingdomTroopPool(kingdom, { min, max });
  }
  const possible = new Set(pool.map((troop) => stoneColorKeyOf(troop.manaColors[0] ?? BaseColor.Brown)));
  return STONE_COLORS.filter((color) => possible.has(color.key)).map((color) => color.key);
}

function stoneSymbol(color: string): string {
  return `<span class="qloot-symbol stone" data-tier="minor">${stoneMarkup('minor', color === 'neutral' ? 'blue' : color)}</span>`;
}

function stoneTile(color: string): string {
  const key = `minor:${color}`;
  const label = `${stoneName(key)} · 可能掉落；胜利时 ${Math.round(EXPLORE_DROPS.minorStoneChance * 100)}% 概率获得一颗初级特质石，颜色取决于实战队首`;
  return tile('stone', key, label, stoneSymbol(color), 'minor');
}

/** Reward candidates only; no quantities are implied by the number of tiles. */
export function questRewardsHtml(kingdom: string, mode: KingdomStageMode, node: number): string {
  if (mode === 'normal') {
    return currencyTile('coin') + currencyTile('soul')
      + (node === 4 || node === 8 ? troopTile(kingdom, node) : '')
      + (node === 8 ? currencyTile('key') : '');
  }
  return ingotTile(kingdom) + possibleStoneColors(kingdom, mode, node).map(stoneTile).join('');
}

/** Compact tab artwork, reusing the same material silhouettes as reward tiles. */
export function questModeLootHtml(kingdom: string, mode: KingdomStageMode): string {
  if (mode === 'normal') return troopTile(kingdom, 8) + currencyTile('key');
  if (mode === 'hard') {
    return ingotTile(kingdom) + tile('stone', 'minor', '初级特质石 · 可能掉落，颜色取决于实战队首', stoneSymbol('neutral'), 'minor');
  }
  const colors = possibleStoneColors(kingdom, mode, 1);
  const names = colors.map((color) => stoneName(`minor:${color}`)).join('、');
  return ingotTile(kingdom) + tile(
    'stone', 'minor', `${names || '初级特质石'} · 可能掉落，颜色取决于实战队首`,
    `<span class="qloot-cluster">${colors.map(stoneSymbol).join('')}</span>`, 'minor',
  );
}
