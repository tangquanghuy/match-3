/** Common per-battle progression for modes with their own settlement (Arena/PvP). */
import type { BattleResult } from '../../session/contract';
import type { MetaSave } from '../state/schema';
import { CLASS_XP_PER_WIN, DEFEAT_CONSOLATION, HERO_XP_PER_WIN, VICTORY_BONUS, WIN_BONUS_XP } from '../data/economy';
import { addClassWin, addClassXp, addHeroXp } from './hero';
import { xpBonusPct } from './talents';
import { earn } from './wallet';

export const PARTICIPATION_XP = 20;
export interface BattleRewards {
  gold: number;
  souls: number;
  xpGained: number;
  heroLevelsGained: number;
  classXpGained: number;
  classLevelUp: { classId: string; newLevel: number } | null;
}

export function grantBattleRewards(save: MetaSave, result: BattleResult): BattleRewards {
  const victory = result.winner === 'player';
  const base = victory ? VICTORY_BONUS : DEFEAT_CONSOLATION;
  const applied = earn(save, base);
  const xpGained = Math.round((victory ? HERO_XP_PER_WIN + WIN_BONUS_XP : PARTICIPATION_XP)
    * (1 + xpBonusPct(save) / 100));
  const hero = addHeroXp(save, xpGained);
  let classLevelUp: BattleRewards['classLevelUp'] = null;
  let classXpGained = 0;
  if (victory && save.hero.classId && result.combatants?.some(c => c.side === 'player' && c.externalId.endsWith('-hero'))) {
    const progress = addClassXp(save, save.hero.classId, CLASS_XP_PER_WIN);
    if (progress) classXpGained = CLASS_XP_PER_WIN;
    if (progress && progress.levelsGained > 0) classLevelUp = { classId: save.hero.classId, newLevel: progress.newLevel };
    addClassWin(save, save.hero.classId);
  }
  const gold = applied.gold ?? 0;
  const souls = applied.souls ?? 0;
  save.stats.goldEarned += gold;
  save.stats.soulsEarned += souls;
  if (victory) save.stats.battlesWon++;
  else save.stats.battlesLost++;
  return { gold, souls, xpGained, heroLevelsGained: hero.levelsGained, classXpGained, classLevelUp };
}

