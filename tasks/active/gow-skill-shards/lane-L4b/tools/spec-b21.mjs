const T = 'tests/unit/gowLaneL4bB21.test.ts';
const STATUS = 'artifacts/gow-skill-audit/gold-primary-sources/official-status-effects.html';
const GEMS = 'artifacts/gow-skill-audit/gold-primary-sources/official-heroic-gems-freshdesk.html';
const R001 = 'tasks/active/gow-skill-shards/rulings/R001-native-step-order.md';
const R002 = 'tasks/active/gow-skill-shards/rulings/R002-barrier-enchant-cleanse.md';
const en = id => `Entity ${id} SpellId/English text/ManaCost/ManaColors asserted verbatim in ${T}.`;
const nat = sp => `SpellId ${sp} Cost/Target and every SpellSteps field (ordered, toEqual) asserted in ${T}.`;
const na = n => ['not-applicable', n];
const v = n => ['verified', n];
const MANA = v('Caster mana 0 after cast except cascade mana-gain events; no skill extra turn; one action-log entry; turn passes (or cascade 4+/5 extra turn only).');
const PIPE = v('Real TurnEngine.castSkill on both sides (Left/Right); low mana (cost-1) and Silence refuse without spending mana or touching board/statuses/turn.');
const DRAGON = 'Heroic Gems (Infinity Plus 2 help centre): Dragon Gems match with their colour and, when matched or destroyed, explode the column below; exist in all 6 colours (spec.color carried).';
export default {
  testFile: T,
  reviews: {
    'troop:7030': {
      en: en('troop:7030'), native: nat(8557), rule: [GEMS, DRAGON],
      dims: {
        'identity-cost-colors': v('troop 7030 -> spell 8557; raw ManaCost 13 = native Cost 13; colours Blue+Green; spell.id binding asserted.'),
        'target-count-range': na('No troop target.'), 'base-formula-rounding': na('No numeric formula.'), 'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': na('No condition/chance.'), 'status-duration-immunity': na('No status.'),
        'gems-types-selection-resolution': v('ConvertGems Red -> DragonYellow Amount 100: all 16 Red become special dragonGem colour Yellow (round-2 fix L4b-7030-dragon); Yellow join key; no Red -> nothing.'),
        'summon-transform-pools': na('No summon or troop transform.'), 'order-death-retargeting': na('Single step.'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将所有红色宝石转换成黄龙宝石。' matches English Yellow Dragon Gems."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'All Red -> Yellow Dragon Gems.' },
      steps: { 0: 'ConvertGems Red->DragonYellow Amount 100 -> transformToSpecial Red -> {dragonGem, Yellow}.' },
      branches: { main: 'Single branch; Red / no-Red boards, both sides.' },
    },
    'troop:7276': {
      decision: 'draft', issues: ['L4b-chosen-colour-exclusion'],
      en: en('troop:7276'), native: nat(8901), rule: [GEMS, 'Heroic Gems (Infinity Plus 2 help centre): Uber Doomskull matches with Skulls/Doomskulls, deals 10 damage to the first enemy and explodes a large area when matched or exploded.'],
      dims: {
        'identity-cost-colors': v('troop 7276 -> spell 8901; raw ManaCost 12 = native Cost 12; colours Red+Brown; native Target ManaGemsOnly; spell.id binding asserted.'),
        'target-count-range': ['difference', 'Player-chosen cell (FixedCellChooser) is correct after round-2 fix L4b-7276-singlegem; but the AI cell chooser picks the centre-most gem of any type and does not honour native Target ManaGemsOnly (can pick a Skull/special): see issues.json L4b-chosen-colour-exclusion.'],
        'base-formula-rounding': v('Amount 1: exactly one gem converted.'), 'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': na('No condition/chance.'), 'status-duration-immunity': na('No status.'),
        'gems-types-selection-resolution': v('Chosen cell -> uberDoomSkull (skull join key); 15 other Blue untouched.'),
        'summon-transform-pools': na('No summon or troop transform.'), 'order-death-retargeting': na('Single step.'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将一个选定的法力颜色宝石转换成一颗超级末日骷髅头。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'Only the chosen cell becomes an Uber Doomskull.' },
      steps: { 0: "ConvertGems FromTarget BoardTarget SingleGem -> transformToSpecial('CELL', uberDoomSkull)." },
      branches: { main: 'Single branch; two chosen cells both sides.' },
    },
    'troop:7195': {
      en: en('troop:7195'), native: nat(8782),
      rule: [STATUS, "official-status-effects.html: Hunter's Mark status; Blessed troops immune."],
      extra: [['r001', 'user-ruling', R001, 'R001: native ConvertGems precedes CauseHuntersMark (English lists the Mark first); prototype fixed in round 2 (L4b-7195-order).']],
      dims: {
        'identity-cost-colors': v('troop 7195 -> spell 8782; raw ManaCost 12 = native Cost 12; colours Red+Yellow; spell.id binding asserted.'),
        'target-count-range': v('FrontEnemy -> enemyFront (dead front -> next living).'),
        'base-formula-rounding': na('No numeric formula.'), 'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': na('No condition/chance.'),
        'status-duration-immunity': v('marked turns 3; Blessed front resists.'),
        'gems-types-selection-resolution': v('All 16 Green -> plain Skull.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('gem-transform precedes status-apply (native order, R001).'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '使首位敌人陷入猎人标记状态。再将所有绿色宝石转换成骷髅头。' matches English text (execution follows native order per R001)."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: "Front enemy Hunter's Marked (after the conversion, native order).", c2: 'All Green -> Skulls.' },
      steps: { 0: 'ConvertGems Green->Skull Amount 100 -> transform Green to SKULL (first).', 1: 'CauseHuntersMark FrontEnemy -> status marked enemyFront.' },
      branches: { main: 'Single branch; both sides, dead front, Blessed.' },
    },
    'troop:6711': {
      en: en('troop:6711'), native: nat(8069),
      rule: [R002.replace(/^/, ''), 'R002: Cleanse removes negative statuses only (Poison removed, Barrier kept).'],
      extra: [['status', 'official-shared-rule', STATUS, 'official-status-effects.html: Blessed status.']],
      dims: {
        'identity-cost-colors': v('troop 6711 -> spell 8069; raw ManaCost 10 = native Cost 10; colours Red+Purple; spell Target Ally; spell.id binding asserted.'),
        'target-count-range': v('FromTarget -> allyChosen (Cleanse) then lastTarget (Bless, same ally) and LAST_TARGET colour; self allowed; enemy refused before mana.'),
        'base-formula-rounding': v('CreateGems Amount 10 fixed.'), 'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': v('Colour among the ally\'s mana colours drawn once per cast (round-2 fix L4b-7138-onecolour): seeds 1/7/42/99 give 10 gems of one of Blue/Yellow.'),
        'status-duration-immunity': v('Cleanse removes Poison, keeps Barrier (R002); blessed turns 3 on the same ally.'),
        'gems-types-selection-resolution': v('Single-colour ally -> 10 Green on non-Green cells; two-colour ally -> one colour only.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Cleanse -> Bless -> create (native order).'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '净化和赐福一名盟友。创造与其法力颜色相同的 10 颗宝石。' matches English (one colour of the ally)."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'Chosen ally cleansed (negatives only) and Blessed.', c2: '10 gems of one of that ally\'s mana colours.' },
      steps: { 0: 'Cleanse FromTarget Amount 1 -> cleanse allyChosen.', 1: 'CauseBlessed FromTarget -> status blessed lastTarget.', 2: 'CreateGems FromTarget Amount 10 -> create color LAST_TARGET 10 (resolved once).' },
      branches: { main: 'Single branch; single/two-colour ally, self, illegal target.' },
    },
    'troop:7270': {
      en: en('troop:7270'), native: nat(8889), rule: [GEMS, DRAGON],
      dims: {
        'identity-cost-colors': v('troop 7270 -> spell 8889; raw ManaCost 12 = native Cost 12; colours Purple+Brown; spell.id binding asserted.'),
        'target-count-range': na('No troop target.'), 'base-formula-rounding': v('CreateGems Amount 3 fixed: exactly 3 Dragon Gems.'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'), 'conditions-probabilities-branches': na('No condition/chance.'),
        'status-duration-immunity': na('No status.'),
        'gems-types-selection-resolution': v('16 Green -> Brown, then 3 special dragonGem colour Brown (round-2 fix L4b-7270-dragon; Brown join key); no-Green board -> only the 3 Dragon Gems.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Convert (Delay 600 timing) then create (native order).'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将所有绿色宝石转换成棕色。再创造 3 颗棕色龙宝石。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'All Green -> Brown.', c2: '3 Brown Dragon Gems created.' },
      steps: { 0: 'ConvertGems Green->Brown Amount 100 Delay 600 -> transform Green to Brown.', 1: 'CreateGems DragonBrown Amount 3 -> createSpecialGems {dragonGem, Brown} 3.' },
      branches: { main: 'Single branch; Green / no-Green boards, both sides.' },
    },
  },
};
