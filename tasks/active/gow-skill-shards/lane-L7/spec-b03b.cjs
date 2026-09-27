// sa-L76 B03 second fill: troop:6211 after fix L7-6211.
const T = 'tests/unit/gowLaneL7B03.test.ts';
const BRIAN = 'artifacts/gow-skill-audit/gold-primary-sources/official-brian-guide.html';
const R001 = { id: 'r001', role: 'coordinator-ruling', path: 'tasks/active/gow-skill-shards/rulings/R001-native-step-order.md', note: 'R001: native step order governs; unobservable order differences need an equivalence test (pre-buff counter + Amount 1 + Magic == post-buff armor).' };
const NA = n => ['not-applicable', n];
module.exports = [
  {
    key: 'troop:6211',
    en: "troop 6211: stats.spell.id 7353, ManaCost 13, Green/Brown, English \"Give [Magic + 1] Armor to an Ally. Deal scatter damage equal to the Ally's Armor. [1:1]\" asserted verbatim.",
    native: 'spell 7353 Target Ally Cost 13; SpellSteps asserted: CountArmor FromTarget 100; IncreaseArmor FromTarget Amount 1 SPM 1 Primarypower; ScatterDamage AllEnemies Amount 1 SPM 1 UseCounterForAmount.',
    rule: { path: BRIAN, note: "Official Brian guide uses '(Boost Ratio N:1)' for stat-boosted amounts (1:1 = equal to the counted stat). No stored official page describes scatter allocation; scatter semantics follow the engine's existing scatter primitive (pool total asserted)." },
    test: T, testNote: 'L7B03 troop:6211 describe: binding/prototype(chosenStat)/zh; 4 real casts ally buff; 4 real casts scatter pool (ally armor 5 + [Magic+1]); R001 equivalence for ally armor 0/1/33; dead enemy skipped, caster/other-ally armor not the source; low-mana/silence.',
    rulings: [R001],
    dims: {
      'identity-cost-colors': 'Entity 6211 -> spell 7353, cost 13, Green/Brown; ledger binding checks true.',
      'target-count-range': 'IncreaseArmor FromTarget -> allyChosen (only ally 20 changes); ScatterDamage AllEnemies -> enemyAll range scatter over living enemies.',
      'base-formula-rounding': 'Buff = Magic + 1; scatter pool = counted ally armor + Amount 1 + Magic = post-buff ally armor (5 + magic + 1 at magic 0/10).',
      'boost-source-ratio-cap': 'CountArmor FromTarget 100 = [1:1] of the chosen ally armor (chosenStat after fix L7-6211); caster armor 40/90 and other ally 70/90 not counted; no cap.',
      'conditions-probabilities-branches': NA('No condition/chance; scatter allocation randomness only affects the split, pool total asserted.'),
      'status-duration-immunity': NA('No status.'),
      'gems-types-selection-resolution': NA('No gem steps.'),
      'summon-transform-pools': NA('No summon/transform.'),
      'order-death-retargeting': 'Native counts before the buff and adds Amount 1 + Magic; runtime reads post-buff armor: equivalence asserted for armor 0/1/33 (R001). Dead enemy receives no scatter.',
      'mana-economy-extra-turn': 'Real cast spends 13 mana and ends the turn; low mana / silence block.',
      'display-description': "zh '给予一名盟友 [魔法 + 1] 点护甲值。造成散射伤害，伤害值等同于盟友护甲值。 [1:1]' matches English.",
      'battle-pipeline': 'TurnEngine.castSkill both sides; scatter is normal damage (armor+Life removed totals the pool), events carry range scatter.',
    },
    clauses: {
      c1: 'Chosen ally gains [Magic + 1] Armor both sides (5 -> 6 / 16); other ally and caster unchanged.',
      c2: "Scatter pool equals the ally's armor after the buff; total armor+Life removed from enemies = 5 + magic + 1.",
      c3: '[1:1]: counter = 100% of the ally armor.',
    },
    steps: {
      0: 'CountArmor FromTarget 100 on the chosen ally (pre-buff) -> runtime chosenStat armor read after the buff; equivalent with the +Amount 1 + Magic of step 2 (R001 equivalence test).',
      1: 'IncreaseArmor FromTarget Amount 1 SPM 1 -> buff allyChosen armor base 1 mult 1.',
      2: 'ScatterDamage AllEnemies Amount 1 SPM 1 UseCounterForAmount -> damage enemyAll range scatter, pool = post-buff ally armor.',
    },
    branches: { main: 'Single unconditional branch; covered by real casts.' },
  },
];
