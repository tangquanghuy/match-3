import { ALL_CATALOG_WEAPONS } from './src/meta/data/weaponCatalog.ts';
import { acquireOf, acquireFilterKind } from './src/meta/data/weaponAcquire.ts';
import { SOULFORGE_RECIPES } from './src/meta/data/soulforge.ts';

const byFilter = new Map<string, number>();
const byKind = new Map<string, number>();
const byReq = new Map<number, number>();
const heroLevels = new Map<number, number>();
const buyRarity = new Map<string, number>();
const kingdomBuy = new Map<string, number>();
const ungatedBuy: Array<{ name: string; rarity: string; gems?: number; req: number }> = [];
const examples: Record<string, Array<{ name: string; rarity: string; req: number; label: string; kingdom: string }>> = {};

for (const w of ALL_CATALOG_WEAPONS) {
  const a = acquireOf(w);
  const fk = acquireFilterKind(a);
  byFilter.set(fk, (byFilter.get(fk) ?? 0) + 1);
  byKind.set(a.kind, (byKind.get(a.kind) ?? 0) + 1);
  const req = w.masteryRequirement ?? 0;
  byReq.set(req, (byReq.get(req) ?? 0) + 1);
  if (a.kind === 'hero') heroLevels.set(a.heroLevel ?? 0, (heroLevels.get(a.heroLevel ?? 0) ?? 0) + 1);
  if (a.kind === 'buy' && a.kingdom) kingdomBuy.set(a.kingdom, (kingdomBuy.get(a.kingdom) ?? 0) + 1);
  if (a.kind === 'buy' && !a.kingdom) {
    buyRarity.set(w.rarity, (buyRarity.get(w.rarity) ?? 0) + 1);
    if (ungatedBuy.length < 8) ungatedBuy.push({ name: w.name, rarity: w.rarity, gems: a.gems, req });
  }
  examples[fk] ??= [];
  if (examples[fk]!.length < 4) {
    examples[fk]!.push({ name: w.name, rarity: w.rarity, req, label: a.label, kingdom: w.kingdom || '' });
  }
}

const kingdomValues = [...kingdomBuy.values()];
process.stdout.write(`${JSON.stringify({
  total: ALL_CATALOG_WEAPONS.length,
  byFilter: Object.fromEntries(byFilter),
  byKind: Object.fromEntries(byKind),
  byReq: Object.fromEntries([...byReq.entries()].sort((a, b) => a[0] - b[0])),
  heroLevels: Object.fromEntries([...heroLevels.entries()].sort((a, b) => a[0] - b[0])),
  kingdomCount: kingdomBuy.size,
  kingdomTop: [...kingdomBuy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
  kingdomMinMax: kingdomValues.length ? [Math.min(...kingdomValues), Math.max(...kingdomValues)] : [],
  ungatedBuyRarity: Object.fromEntries(buyRarity),
  ungatedBuy,
  forge: SOULFORGE_RECIPES.map((r) => ({
    name: r.recipe.name,
    rarity: r.recipe.rarity,
    tier: r.recipe.tier,
    souls: r.recipe.souls,
    gold: r.recipe.gold,
    source: r.source,
  })),
  examples,
  starters: ALL_CATALOG_WEAPONS.filter((w) => acquireOf(w).kind === 'starter').map((w) => w.name),
  classes: ALL_CATALOG_WEAPONS.filter((w) => acquireOf(w).kind === 'class').map((w) => ({
    name: w.name,
    label: acquireOf(w).label,
    kingdom: w.kingdom,
  })),
  placeholders: ALL_CATALOG_WEAPONS.filter((w) => acquireOf(w).kind === 'placeholder').map((w) => ({
    name: w.name,
    req: w.masteryRequirement,
  })),
}, null, 2)}\n`);
