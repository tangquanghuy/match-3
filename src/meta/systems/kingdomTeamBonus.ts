/**
 * 同王国编队：每个王国按 2/3/4 名不同成员只取最高一档；2+2 可同时生效。
 * 2016 年基础数值：https://community.gemsofwar.com/t/all-troop-type-kingdom-bonuses-2-0-updated/1032
 * 后续王国数据未收录于此表，暂用本项目王国属性定位生成明确的本地设计值。
 */
import { getTroopById } from '../../data/troops';
import type { MetaSave, TeamMember } from '../state/schema';
import { KINGDOM_ORDER, kingdomBonusStat } from '../data/kingdoms';
import { KINGDOM_TEAM_BASE } from '../data/kingdomTeamBase';
import { heroKingdomOf } from './hero';

export interface KingdomTeamStats { health: number; armor: number; attack: number; magic: number }
export interface KingdomTeamEntry { kingdom: string; count: number; stats: KingdomTeamStats; provisional: boolean }
const NONE = (): KingdomTeamStats => ({ health: 0, armor: 0, attack: 0, magic: 0 });
/** Project-specific profile for the 18 newer kingdoms missing from the historical roster. */
function projectProfile(kingdom: string): readonly [KingdomTeamStats, KingdomTeamStats, KingdomTeamStats] {
  const key = kingdomBonusStat(kingdom);
  if (key === 'attack') return [
    { ...NONE(), attack: 1 }, { ...NONE(), attack: 2 }, { ...NONE(), attack: 3 },
  ];
  const value = key === 'magic' ? 1 : 2;
  const at = (extra: number, attack: number): KingdomTeamStats => ({ ...NONE(), [key]: value + extra, attack });
  return [at(0, 0), at(2, 1), at(4, 2)];
}

export function kingdomTeamEntries(save: MetaSave, members: readonly TeamMember[]): KingdomTeamEntry[] {
  const groups = new Map<string, Set<string>>();
  const add = (kingdom: string | null | undefined, key: string): void => {
    if (!kingdom || !KINGDOM_ORDER.includes(kingdom)) return;
    if (!groups.has(kingdom)) groups.set(kingdom, new Set());
    groups.get(kingdom)!.add(key);
  };
  for (const member of members) {
    if (member.kind === 'hero') {
      add(heroKingdomOf(save), 'hero');
    }
    if (member.kind === 'troop') {
      const troop = getTroopById(member.troopId);
      add(troop?.kingdom, `troop:${member.troopId}`);
    }
  }
  return [...groups].flatMap(([kingdom, units]) => {
    const count = Math.min(4, units.size);
    if (count < 2) return [];
    const verified = KINGDOM_TEAM_BASE[kingdom];
    const profile = verified ?? projectProfile(kingdom);
    return [{ kingdom, count, stats: { ...profile[count - 2]! }, provisional: !verified }];
  });
}

export function kingdomTeamBonusOf(save: MetaSave, members: readonly TeamMember[]): KingdomTeamStats {
  const sum = NONE();
  for (const entry of kingdomTeamEntries(save, members)) {
    for (const key of ['health', 'armor', 'attack', 'magic'] as const) sum[key] += entry.stats[key];
  }
  return sum;
}
