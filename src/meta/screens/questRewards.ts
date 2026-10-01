import { getTroopById } from '../../data/troops';
import { EXPLORE_DROPS, KINGDOM_FIRST_CLEAR_GEMS } from '../data/economy';
import {
  kingdomBaseLevel,
  kingdomQuestRewardTroop,
  type KingdomStageMode,
} from '../data/kingdoms';
import { INGOT_KEYS, INGOT_NAMES, STONE_COLORS, stoneName } from '../data/materials';
import type { KingdomState } from '../state/schema';
import { kingdomStageCleared } from '../systems/kingdomFirstClear';
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
    ? `<img class="qloot-portrait" src="/static/portraits/${escapeAttr(troop.portrait)}.webp" alt="" loading="lazy">`
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

function stoneSymbol(color: string): string {
  return `<span class="qloot-symbol stone" data-tier="minor">${stoneMarkup('minor', color === 'neutral' ? 'blue' : color)}</span>`;
}

function stoneTile(color: string): string {
  const key = `minor:${color}`;
  const label = `${stoneName(key)} · 可能掉落；胜利时 ${Math.round(EXPLORE_DROPS.minorStoneChance * 100)}% 概率获得一颗初级特质石，六色等概率随机`;
  return tile('stone', key, label, stoneSymbol(color), 'minor');
}

/** 随机材料展示候选；首通宝石另列确定金额与完成状态。 */
export function questRewardsHtml(kingdom: string, mode: KingdomStageMode, node: number, entry?: KingdomState): string {
  const cleared = kingdomStageCleared(entry, mode, node);
  const amount = KINGDOM_FIRST_CLEAR_GEMS[mode];
  const gems = `<span class="qfirst-clear ${cleared ? 'claimed' : ''}" data-reward="currency:gems" data-first-clear="${cleared ? 'completed' : 'available'}" title="每个王国、每关独立首通奖励；重复挑战不再发放，可与每日首胜叠加"><span data-icon="crystal"></span><b>${cleared ? '首通已完成' : `首通 +${amount} 宝石`}</b></span>`;
  if (mode === 'normal') {
    return currencyTile('coin') + currencyTile('soul')
      + (node === 4 || node === 8 ? troopTile(kingdom, node) : '')
      + (node === 8 ? currencyTile('key') : '') + gems;
  }
  return ingotTile(kingdom) + STONE_COLORS.map(({ key }) => stoneTile(key)).join('') + gems;
}

/** Compact tab artwork, reusing the same material silhouettes as reward tiles. */
export function questModeLootHtml(kingdom: string, mode: KingdomStageMode): string {
  if (mode === 'normal') return troopTile(kingdom, 8) + currencyTile('key');
  return ingotTile(kingdom) + tile('stone', 'minor', '初级特质石 · 可能掉落，六色等概率随机', stoneSymbol('neutral'), 'minor');
}
