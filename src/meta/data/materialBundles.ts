/** 真实特质配方目录。商品身份只取决于材料，不依赖部队/玩家持有数量。 */
import { TROOPS } from '../../data/troops';
import { BaseColor } from '../../engine/types';
import { traitUnlockCost } from './economy';
import { STONE_COLORS, stoneColorKeyOf, type TraitstoneTier } from './materials';
import { rarityNameByIndex } from './rarity';

export interface MaterialBundle {
  readonly id: string;
  readonly familyId: string;
  readonly stages: readonly Readonly<Record<string, number>>[];
  readonly colors: readonly string[];
  readonly name: string;
  readonly artKeys: readonly string[];
}
export interface MaterialBundleFamily {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly bundles: readonly MaterialBundle[];
}
const TIERS: TraitstoneTier[] = ['minor', 'major', 'runic', 'arcane', 'celestial'];
const tierNames = ['初级', '高级', '符文', '秘法', '圣辉'];
const colorName = (key: string) => STONE_COLORS.find(c => c.key === key)?.name ?? key;
const canonical = (stones: Readonly<Record<string, number>>) => Object.fromEntries(Object.entries(stones).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
// Content-derived IDs stay stable across troop ordering/additions. Collision checked on construction.
function contentId(text: string): string {
  let a = 2166136261, b = 5381;
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
  return `${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`;
}
let catalog: readonly MaterialBundleFamily[] | undefined;
const byId = new Map<string, MaterialBundle>();
const byTroop = new Map<number, string>();
const discountTierByFamily = new Map<string, number>();

export function materialBundleCatalog(): readonly MaterialBundleFamily[] {
  if (catalog) return catalog;
  const families = new Map<string, { shape: string; bundles: MaterialBundle[]; rarities: Map<number, number> }>();
  const signatures = new Map<string, string>();
  for (const troop of TROOPS) {
    const primary = stoneColorKeyOf(troop.manaColors[0] ?? BaseColor.Brown);
    const stages = [1, 2, 3].map(slot => canonical(troop.traits[slot - 1] ? traitUnlockCost(slot, primary, troop.id).stones : {}));
    if (stages.every(s => !Object.keys(s).length)) continue;
    const signature = JSON.stringify(stages);
    const id = `b-${contentId(signature)}`;
    if (signatures.has(id) && signatures.get(id) !== signature) throw new Error('Material bundle ID collision');
    signatures.set(id, signature);
    const shape = JSON.stringify(stages.map(stage => TIERS.map(tier => Object.entries(stage).filter(([key]) => key.split(':')[0] === tier).map(([, n]) => n).sort((a, b) => a - b))));
    const familyId = `f-${contentId(shape)}`;
    const family = families.get(familyId) ?? { shape, bundles: [], rarities: new Map<number, number>() };
    if (family.shape !== shape) throw new Error('Material family ID collision');
    family.rarities.set(troop.rarityIdx, (family.rarities.get(troop.rarityIdx) ?? 0) + 1);
    families.set(familyId, family);
    byTroop.set(troop.id, id);
    if (byId.has(id)) continue;
    const keys = [...new Set(stages.flatMap(s => Object.keys(s)))];
    const colors = STONE_COLORS.filter(c => keys.some(k => k.split(':').slice(1).includes(c.key))).map(c => c.key);
    const arcane = keys.filter(k => k.startsWith('arcane:')).sort();
    const base = keys.find(k => k.startsWith('minor:'))?.split(':')[1] ?? primary;
    const suffix = arcane.length ? arcane.map(k => [...new Set(k.split(':').slice(1))].map(colorName).join('·')).join(' / ') : '圣辉';
    const bundle: MaterialBundle = Object.freeze({ id, familyId, stages: Object.freeze(stages.map(s => Object.freeze(s))), colors: Object.freeze(colors), name: `${colorName(base)}系 · ${suffix}`, artKeys: Object.freeze(arcane.length ? arcane : ['celestial']) });
    byId.set(id, bundle); family.bundles.push(bundle);
  }
  catalog = Object.freeze([...families.entries()].map(([id, f]) => {
    const rarity = [...f.rarities.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
    const totals = TIERS.map(tier => f.bundles[0]!.stages.reduce((sum, s) => sum + Object.entries(s).filter(([k]) => k.split(':')[0] === tier).reduce((n, [, v]) => n + v, 0), 0));
    const first = f.bundles[0]!;
    const kind = !totals[3] ? '圣辉组合' : first.artKeys.length > 1 ? '双秘法' : first.colors.length > 1 ? '双色' : '单色';
    const name = rarity === 0 && totals[3]! > 1 ? '特殊 · 高阶秘法' : `${rarityNameByIndex(rarity)} · ${kind}`;
    discountTierByFamily.set(id, rarity === 0 && totals[3]! > 1 ? 5 : rarity);
    return { id, name, summary: totals.map((n, i) => n ? `${tierNames[i]} ${n}` : '').filter(Boolean).join(' · '), bundles: Object.freeze(f.bundles.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))), rank: rarity * 1000 + totals[3]! };
  }).sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id)).map(({ rank: _rank, ...f }) => Object.freeze(f)));
  return catalog;
}
export function getMaterialBundle(id: string): MaterialBundle | undefined { materialBundleCatalog(); return byId.get(id); }
export function materialBundleDiscountTier(bundle: MaterialBundle): number { materialBundleCatalog(); return discountTierByFamily.get(bundle.familyId) ?? 0; }
/** 只用于特质页/旧链接定位商品，交易不以 troopId 为商品键。 */
export function materialBundleForTroop(troopId: number): MaterialBundle | undefined { materialBundleCatalog(); const id = byTroop.get(troopId); return id ? byId.get(id) : undefined; }
export function materialBundleContents(bundle: MaterialBundle, mask: number): Record<string, number> {
  const stones: Record<string, number> = {};
  bundle.stages.forEach((stage, i) => { if (mask & (1 << i)) for (const [key, amount] of Object.entries(stage)) stones[key] = (stones[key] ?? 0) + amount; });
  return canonical(stones);
}
