/** 图鉴和愿望单共享的查询语义。纯数据模块，不依赖屏层。 */
import type { TroopData } from '../../data/troops';
import { raceNames } from './races';
import { roleNameZh } from './roles';
const cache = new Map<number, string>();
const normalize = (value: string) => value.normalize('NFKC').trim().toLowerCase();
export function troopSearchText(t: TroopData): string {
  let value = cache.get(t.id);
  if (value === undefined) {
    value = normalize([String(t.id), t.name, t.referenceName, t.kingdom ?? '无王国', raceNames(t.troopTypes),
      t.troopTypes.join(' '), roleNameZh(t.role), t.spell.name, t.spell.description,
      ...t.traits.flatMap((tr) => [tr.name, tr.description])].filter(Boolean).join(' '));
    cache.set(t.id, value);
  }
  return value;
}
export interface TroopCatalogFilter {
  query?: string;
  rarity?: number | null;
  color?: string | null;
  type?: string | null;
  kingdom?: string | null;
  /** 官方定位码（Defender/Striker/...，见 data/roles.ts） */
  role?: string | null;
}
export function matchesTroopCatalog(t: TroopData, f: TroopCatalogFilter): boolean {
  if (f.rarity != null && t.rarityIdx !== f.rarity) return false;
  if (f.color && !t.manaColors.some((c) => c.toLowerCase() === f.color!.toLowerCase())) return false;
  if (f.type && !t.troopTypes.includes(f.type)) return false;
  if (f.kingdom && (t.kingdom ?? '无王国') !== f.kingdom) return false;
  if (f.role && t.role !== f.role) return false;
  return normalize(f.query ?? '').split(/\s+/).filter(Boolean).every((word) => troopSearchText(t).includes(word));
}
