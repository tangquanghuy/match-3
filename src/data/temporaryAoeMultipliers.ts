/** 2026-10-09 temporary all-enemy magic scaling; see the temporary multiplier adjustment log in docs/. */
export const TEMPORARY_AOE_MANA_TIERS: Readonly<Record<number, 28 | 30 | 32 | 34>> = {
  6471: 28, 7245: 28, 7246: 28, 7247: 28, 7248: 28, 7249: 28, 7250: 28,
  7251: 30, 7440: 30, 7441: 30, 7442: 30, 7443: 30, 7444: 30, 7445: 30,
  7572: 30, 7573: 30, 7577: 30, 7689: 30, 7791: 30, 7933: 30,
  7446: 32, 7616: 32, 7617: 32, 7618: 32, 7619: 32, 7620: 32, 7621: 32,
  7839: 32, 7840: 32, 7841: 32, 7842: 32, 7843: 32, 7844: 32,
  7622: 34, 7845: 34,
};
export const TEMPORARY_AOE_MULTIPLIERS: Readonly<Record<28 | 30 | 32 | 34, number>> = {
  28: 1.6, 30: 1.7, 32: 1.8, 34: 2,
};

/** Exceptions retain their original damage, except Lucifer's fixed value. */
export const TEMPORARY_AOE_ORIGINAL_MULTIPLIERS: Readonly<Record<number, number>> = {
  6471: 1, 7572: 0.75, 7577: 0.75, 7689: 0.8, 7791: 0.75, 7933: 0.75,
};
export const TEMPORARY_AOE_FIXED_MULTIPLIERS: Readonly<Record<number, number>> = { 7573: 1.5 };

export function temporaryAoeMultiplier(troopId: number): number | undefined {
  const tier = TEMPORARY_AOE_MANA_TIERS[troopId];
  if (!tier) return undefined;
  return TEMPORARY_AOE_ORIGINAL_MULTIPLIERS[troopId] ??
    TEMPORARY_AOE_FIXED_MULTIPLIERS[troopId] ?? TEMPORARY_AOE_MULTIPLIERS[tier];
}

/** Rewrite only the first damage expression; 7577 also has a separate ally heal expression. */
export function temporaryAoeDescription(troopId: number, description: string): string {
  const tier = TEMPORARY_AOE_MANA_TIERS[troopId];
  if (!tier || troopId in TEMPORARY_AOE_ORIGINAL_MULTIPLIERS) return description;
  if (troopId === 7573) {
    // Replace the entire random interval with a single, deterministic damage expression.
    const interval = /3\s*-\s*(?=\[\s*\(?\s*\u9b54\u6cd5)/;
    if (!interval.test(description)) throw new Error(`Lucifer damage interval not found: ${troopId}`);
    description = description.replace(interval, '');
  }
  const formula = /\u9b54\u6cd5(?:\s*[x\u00d7]\s*[\d.]+)?\s*\)?\s*\+\s*\d+/;
  if (!formula.test(description)) throw new Error(`Temporary AoE damage expression not found: ${troopId}`);
  return description.replace(formula, expression =>
    expression.replace(/\u9b54\u6cd5(?:\s*[x\u00d7]\s*[\d.]+)?/, `\u9b54\u6cd5 x ${temporaryAoeMultiplier(troopId)}`));
}
