// Lane L3 spec helpers (lane-owned, not evidence).
export const RULE_STATUS = 'artifacts/gow-skill-audit/gold-primary-sources/official-status-effects.html';
export const RULE_FROZEN = 'artifacts/gow-skill-audit/gold-primary-sources/official-frozen-1-0-9.json';
export const R001 = { id: 'r001', role: 'user-ruling', path: 'tasks/active/gow-skill-shards/rulings/R001-native-step-order.md', note: 'Native SpellSteps order governs observable ordering.' };
export const R003 = { id: 'r003', role: 'user-ruling', path: 'tasks/active/gow-skill-shards/rulings/R003-count-threshold-labels.md', note: 'AddFor10<Color>Gems threshold is 13.' };
export const R004 = { id: 'r004', role: 'user-ruling', path: 'tasks/active/gow-skill-shards/rulings/R004-status-durations.md', note: 'Status durations: no hard cap, cumulative recovery; Cause* Amount ignored.' };
export const R006 = { id: 'r006', role: 'user-ruling', path: 'tasks/active/gow-skill-shards/rulings/R006-hidden-mechanics-conventions.md', note: 'Project conventions C1 (round) / C2 (Cause* Amount ignored).' };
export const R002 = { id: 'r002', role: 'user-ruling', path: 'tasks/active/gow-skill-shards/rulings/R002-barrier-enchant-cleanse.md', note: 'Barrier until damaged; Cleanse removes negatives only.' };
const NA = n => ['na', n];
/** Build the 12 dimensions: defaults are not-applicable with a reason; pass [status, note] overrides. */
export function dims(o) {
  const d = {
    'identity-cost-colors': o.id,
    'target-count-range': o.target,
    'base-formula-rounding': o.formula ?? NA('No numeric formula in this spell.'),
    'boost-source-ratio-cap': o.boost ?? NA('No boost / ratio / cap clause.'),
    'conditions-probabilities-branches': o.cond ?? NA('Unconditional single branch.'),
    'status-duration-immunity': o.status ?? NA('No status effect.'),
    'gems-types-selection-resolution': o.gems ?? NA('No gem creation / destruction.'),
    'summon-transform-pools': o.summon ?? NA('No summon / transform.'),
    'order-death-retargeting': o.order,
    'mana-economy-extra-turn': o.mana,
    'display-description': o.display,
    'battle-pipeline': o.pipeline ?? ['v', 'Real TurnEngine.castSkill both sides: skill-cast first, mana spent, one action-log entry, turn switch / extra-turn asserted; low-mana and Silence refusals leave board/log/turn untouched.'],
  };
  for (const [k, v] of Object.entries(d)) if (!v) throw new Error(`dim ${k} missing`);
  return d;
}
export const main = n => ({ main: ['v', n] });
