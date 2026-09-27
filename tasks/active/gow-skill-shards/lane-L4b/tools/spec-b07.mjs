const T = 'tests/unit/gowLaneL4bB07.test.ts';
const STATUS = 'artifacts/gow-skill-audit/gold-primary-sources/official-status-effects.html';
const GEMS = 'artifacts/gow-skill-audit/gold-primary-sources/official-heroic-gems-freshdesk.html';
const R003 = 'tasks/active/gow-skill-shards/rulings/R003-count-threshold-labels.md';
const RL01 = 'tasks/active/gow-skill-shards/rulings/RL4b-01-two-colour-overwrite.md';
const en = id => `Entity ${id} SpellId/English text/ManaCost/ManaColors asserted verbatim in ${T}.`;
const nat = sp => `SpellId ${sp} Cost and every SpellSteps field (ordered, toEqual) asserted in ${T}.`;
const na = n => ['not-applicable', n];
const v = n => ['verified', n];
const MANA = v('Caster mana 0 after cast except cascade mana-gain events; no skill extra turn; one action-log entry; turn passes (or cascade 4+/5 extra turn only).');
const PIPE = v('Real TurnEngine.castSkill on both sides (Left/Right); low mana (cost-1) and Silence refuse without spending mana or touching board/statuses/turn.');
const R003RULE = note => [['rule', 'official-shared-rule', R003, `R003: Count* Amount is a percentage (Amount 100/200/300/400 = x1/x2/x3/x4 per counted troop). ${note}`]];
export default {
  testFile: T,
  reviews: {
    'troop:7795': {
      en: en('troop:7795'), native: nat(9815),
      rule: R003RULE('CountArmor Amount 50 = floor(armor x 50%) capped by CountMax 7; equals floor(min(armor,14)/2) for every armor 0..60 (asserted), so the runtime lastReduce ratio 2:1 is equivalent.'),
      extra: [['status', 'official-shared-rule', STATUS, 'official-status-effects.html: Barrier protects from damage; armor elimination is not damage (Barrier kept case shows armor still removed).']],
      dims: {
        'identity-cost-colors': v('troop 7795 -> spell 9815; raw ManaCost 13 = native Cost 13; colours Red+Brown; spell Target Enemy; spell.id binding asserted.'),
        'target-count-range': v('FromTarget -> enemyChosen (11): only the chosen enemy loses armor; ally id refused before mana is spent.'),
        'base-formula-rounding': v('DecreaseArmor Amount 14 (up to 14): armor 0/5/14/30 -> 0/0/0/16; count floor(eliminated/2) (odd 9 -> 4).'),
        'boost-source-ratio-cap': v('Counter = min(floor(armor*50/100),7) (R003 percent + CountMax 7) == runtime ratio 2:1 of lastReduce with reduce cap 14: 5/7/12/12 Purple for armor 0/5/14/30.'),
        'conditions-probabilities-branches': na('No condition/chance.'),
        'status-duration-immunity': v('No status applied; target Barrier does not block armor elimination (armor 6 -> 0, 8 gems).'),
        'gems-types-selection-resolution': v('CreateGems Purple: every created gem Purple from distinct non-Purple cells.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Native Count -> CountMax -> DecreaseArmor -> Create: runtime reduce -> create gives identical counts (counter derived from pre-reduction armor equals eliminated/2).'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '消除敌人最多14点护甲。生成5颗紫色宝石，宝石数量根据消除的护甲值提升。 [2:1]' matches English and ratio."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'Chosen enemy loses up to 14 armor.', c2: '5 Purple + boost from armor eliminated.', c3: '[2:1] = +1 Purple per 2 armor eliminated (max +7).' },
      steps: {
        0: 'CountArmor FromTarget Amount 50 -> counter = 50% of armor (R003), folded into lastReduce/2.',
        1: 'CountMax Amount 7 -> counter cap 7 == reduce cap 14 / 2 (equivalence asserted 0..60).',
        2: 'DecreaseArmor FromTarget Amount 14 Delay 200 -> reduce armor enemyChosen base 14.',
        3: 'CreateGems Purple Amount 5 UseCounterForAmount -> create Purple base 5 + modifier ratio 2:1 lastReduce.',
      },
      branches: { main: 'Single branch; armor 0/5/9/14/30 and Barrier, both sides.' },
    },
    'troop:7080': {
      en: en('troop:7080'), native: nat(8608),
      rule: R003RULE('CountArmyColor AllAllies Data 0 (Blue) Amount 400 = +4 per living Blue ally (caster included).'),
      dims: {
        'identity-cost-colors': v('troop 7080 -> spell 8608; raw ManaCost 12 = native Cost 12; colours Blue+Red; spell.id binding asserted.'),
        'target-count-range': v('Counter over living allies incl. caster whose colours include Blue; enemies and dead allies excluded.'),
        'base-formula-rounding': v('4 + 4n: 8 (caster only), 12 (+1 Blue ally), 20 (+3), non-Blue caster alone 4.'),
        'boost-source-ratio-cap': v('multiplier a=4 alliesOfColor Blue (Data 0 = Blue, confirmed across the snapshot); no cap.'),
        'conditions-probabilities-branches': na('No condition/chance.'),
        'status-duration-immunity': na('No status.'),
        'gems-types-selection-resolution': v('Plain Skulls on distinct cells converted from colour gems.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Count then create (native order); dead Blue ally not counted.'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '制造4个头骨，由蓝色盟友激发。 [x4]' matches English and x4."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: '4 Skulls + boost per Blue ally.', c2: '[x4] = +4 per Blue ally.' },
      steps: {
        0: 'CountArmyColor AllAllies Data 0 Amount 400 -> alliesOfColor Blue x4.',
        1: 'CreateGems Skull Amount 4 UseCounterForAmount -> create skull base 4 + modifier.',
      },
      branches: { main: 'Single branch; 0/1/3 Blue allies, dead Blue ally, Blue enemy, non-Blue caster.' },
    },
    'troop:6941': {
      en: en('troop:6941'), native: nat(8422),
      rule: R003RULE('CountArmyColor AllAllies Data 0 Amount 300 = +3 per living Blue ally.'),
      extra: [['status', 'official-shared-rule', STATUS, 'official-status-effects.html: Frozen status; Blessed troops immune to status effects.']],
      dims: {
        'identity-cost-colors': v('troop 6941 -> spell 8422; raw ManaCost 12 = native Cost 12; colours Blue+Green; spell.id binding asserted.'),
        'target-count-range': v('Counter over living Blue allies incl. caster; Freeze RandomEnemy -> enemyRandom: one living enemy (dead never over 12 seeds).'),
        'base-formula-rounding': v('4 + 3n Brown: 7 (caster only), 10 (+1 Blue ally).'),
        'boost-source-ratio-cap': v('multiplier a=3 alliesOfColor Blue; no cap.'),
        'conditions-probabilities-branches': v('Seeded random Freeze target; no condition.'),
        'status-duration-immunity': v('frozen status-apply turns 3; Blessed lone enemy resists.'),
        'gems-types-selection-resolution': v('Brown gems created on distinct non-Brown cells.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Count, create (Delay 0), then Freeze: gem event precedes status-apply.'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '创造 4 颗棕色宝石，数量因蓝色盟友数而增强。冻结一名随机敌人。 [x3]' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: '4 Brown + boost per Blue ally.', c2: 'Freeze one random living enemy.', c3: '[x3] = +3 per Blue ally.' },
      steps: {
        0: 'CountArmyColor AllAllies Data 0 Amount 300 -> alliesOfColor Blue x3.',
        1: 'CreateGems Brown Amount 4 UseCounterForAmount Delay 0 -> create Brown base 4 + modifier.',
        2: 'CauseFrozen RandomEnemy -> status frozen enemyRandom.',
      },
      branches: { main: 'Single branch; 0/1 Blue ally, dead enemy sweep, Blessed.' },
    },
    'troop:7197': {
      en: en('troop:7197'), native: nat(8784),
      rule: R003RULE('Two CountArmyColor Data 1 (Green) Amount 300 steps (allies, then enemies with UseCounterForAmount = accumulate) -> 3 per Green troop on either side; CreateGems2Colors has no Amount so the count is the counter alone.'),
      extra: [['rl01', 'user-ruling', RL01, 'RL4b-01: 2-colour creation selects N distinct cells, each Green or Red; assertions limited to N distinct cells, all Green/Red, both colours present.']],
      dims: {
        'identity-cost-colors': v('troop 7197 -> spell 8784; raw ManaCost 13 = native Cost 13; colours Green+Yellow; spell.id binding asserted.'),
        'target-count-range': v('Counter over living Green allies (caster included) and living Green enemies (dual-colour included); dead Green enemy excluded.'),
        'base-formula-rounding': v('3 x (Green allies + Green enemies): 12 for 2+2, 3 for lone Green caster, 0 when none.'),
        'boost-source-ratio-cap': v('multiplier a=3 over sources alliesOfColor Green + enemiesOfColor Green; base 0; no cap.'),
        'conditions-probabilities-branches': na('No condition; colour per gem is seeded random (RL4b-01).'),
        'status-duration-immunity': na('No status.'),
        'gems-types-selection-resolution': v('mix Green/Red: N distinct cells, all Green or Red, both colours present (RL4b-01).'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Counts then create (native order).'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '每有一名绿色盟友或敌人，则创建 3 颗混合绿色和红色的宝石。 [x3]' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: '3 Green/Red mix per Green ally and enemy.', c2: '[x3] = 3 per Green troop.' },
      steps: {
        0: 'CountArmyColor AllAllies Data 1 Amount 300 -> source alliesOfColor Green.',
        1: 'CountArmyColor AllEnemies Data 1 Amount 300 UseCounterForAmount -> source enemiesOfColor Green (accumulated).',
        2: 'CreateGems2Colors Green/Red UseCounterForAmount -> create mix Green/Red base 0 + modifier x3.',
      },
      branches: { main: 'Single branch; 2+2 Green troops, none, lone Green caster.' },
    },
    'troop:7370': {
      en: en('troop:7370'), native: nat(9010),
      rule: [GEMS, 'Heroic Gems (Infinity Plus 2 help centre): Good Gargoyle Gems cannot be matched and give all allies a random positive status when destroyed; created gargoyleGem tier 1 (good) with null join key.'],
      extra: [['r003', 'user-ruling', R003, 'R003: CountArmyColor AllAllies Data 5 (Brown) Amount 300 = +3 damage per living Brown ally (caster included).']],
      dims: {
        'identity-cost-colors': v('troop 7370 -> spell 9010; raw ManaCost 12 = native Cost 12; colours Red+Brown; spell.id binding asserted.'),
        'target-count-range': v('FromTarget (spell Target Enemy) -> enemyChosen 12 only; ally id refused.'),
        'base-formula-rounding': v('[Magic+3] + 3 x Brown allies (caster is Brown): magic 0 alone -> 6; magic 10 +1 -> 19; +3 -> 25.'),
        'boost-source-ratio-cap': v('multiplier a=3 alliesOfColor Brown on the damage segment; no cap.'),
        'conditions-probabilities-branches': na('No condition/chance.'),
        'status-duration-immunity': na('No status.'),
        'gems-types-selection-resolution': v('CreateGems GoodGargoyle Amount 3 -> 3 special gargoyleGem tier 1 (unmatchable).'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Count -> Damage (Delay 200) -> create: skill-damage precedes gem events; lethal hit still creates the Gargoyles.'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '对一名敌人造成 [魔法 + 3] 点伤害，伤害值因棕色盟友数而增强。再创造 3 颗善石像鬼宝石。 [x3]' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: '[Magic+3] damage to the chosen enemy boosted by Brown allies.', c2: '3 Good Gargoyle Gems created.', c3: '[x3] = +3 damage per Brown ally.' },
      steps: {
        0: 'CountArmyColor AllAllies Data 5 Amount 300 -> alliesOfColor Brown x3.',
        1: 'Damage FromTarget Amount 3 x Magic UseCounterForAmount -> damage enemyChosen {3,1} + modifier.',
        2: 'CreateGems GoodGargoyle Amount 3 -> create special gargoyleGem tier 1 count 3.',
      },
      branches: { main: 'Single branch; 0/1/3 extra Brown allies, lethal, illegal target.' },
    },
  },
};
