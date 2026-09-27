const T = 'tests/unit/gowLaneL4bB05.test.ts';
const STATUS = 'artifacts/gow-skill-audit/gold-primary-sources/official-status-effects.html';
const GEMS = 'artifacts/gow-skill-audit/gold-primary-sources/official-heroic-gems-freshdesk.html';
const R001 = 'tasks/active/gow-skill-shards/rulings/R001-native-step-order.md';
const en = id => `Entity ${id} SpellId/English text/ManaCost/ManaColors asserted verbatim in ${T}.`;
const nat = sp => `SpellId ${sp} Cost and every SpellSteps field (ordered, toEqual) asserted in ${T}.`;
const na = n => ['not-applicable', n];
const v = n => ['verified', n];
const MANA = v('Caster mana 0 after cast except cascade mana-gain events; no skill extra turn; one action-log entry; turn passes (or cascade 4+/5 extra turn only).');
const PIPE = v('Real TurnEngine.castSkill on both sides (Left/Right); low mana (cost-1) and Silence refuse without spending mana or touching board/statuses/turn.');
const TWO_RANDOM = 'RandomAlly + RandomPrefNotPrevAlly -> allyRandomN n 2: two distinct living allies (caster included); 30-seed sweep reaches every living ally and never the dead; with a lone caster both native picks land on it and the single-application runtime is state-equivalent (R001 equivalence case).';
export default {
  testFile: T,
  reviews: {
    'troop:6678': {
      en: en('troop:6678'), native: nat(8024),
      rule: [STATUS, 'official-status-effects.html: Blessed makes a troop temporarily immune to status effects (re-applying Blessed is state-idempotent).'],
      extra: [['r001', 'user-ruling', R001, 'R001: unobservable order/multiplicity differences need an equivalence test (lone-caster case).']],
      dims: {
        'identity-cost-colors': v('troop 6678 -> spell 8024; raw ManaCost 18 = native Cost 18; colours Red+Yellow; spell.id binding asserted.'),
        'target-count-range': v(TWO_RANDOM),
        'base-formula-rounding': na('No numeric formula.'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': v('Random ally picks seeded (seeds 1/42 and 1..30); no condition.'),
        'status-duration-immunity': v('blessed status-apply turns 3 on each picked ally.'),
        'gems-types-selection-resolution': v('16 Purple -> Red, then 16 Brown -> plain Skull (two ordered transforms).'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Native order conversions then the two Bless picks; dead ally never picked.'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将紫色宝石转换成红色，和棕色宝石转换成骷髅头。赐福 2 位随机盟友。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'Purple -> Red and Brown -> Skulls, all gems of each.', c2: 'Bless 2 distinct random living allies.' },
      steps: {
        0: 'ConvertGems Purple->Red Amount 100 -> transform Purple to Red.',
        1: 'ConvertGems Brown->Skull Amount 100 -> transform Brown to SKULL.',
        2: 'CauseBlessed RandomAlly -> first pick of allyRandomN n 2.',
        3: 'CauseBlessed RandomPrefNotPrevAlly -> second, different pick of allyRandomN n 2 (same ally only when alone: equivalent).',
      },
      branches: { main: 'Single branch; seeds, dead ally, lone caster covered.' },
    },
    'troop:6479': {
      en: en('troop:6479'), native: nat(7666),
      rule: [STATUS, 'official-status-effects.html: Enchanted grants extra mana each turn and lasts until the troop casts (R002); Blessed troops are immune to all status effects (Blessed ally resists Enchanted).'],
      extra: [['r001', 'user-ruling', R001, 'R001: lone-caster double pick equivalent to single application.']],
      dims: {
        'identity-cost-colors': v('troop 6479 -> spell 7666; raw ManaCost 18 = native Cost 18; colours Yellow+Purple; spell.id binding asserted.'),
        'target-count-range': v('RandomAlly + RandomPrefNotPrevAlly -> allyRandomN n 2: two distinct allies; Blessed ally can be picked but resists; lone caster enchanted once (state-equivalent).'),
        'base-formula-rounding': na('No numeric formula (CauseEnchanted Amount 1 = one application).'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': v('Seeded random ally picks (1/42); no condition.'),
        'status-duration-immunity': v('enchanted status-apply turns 3 (non-expiring per R002 engine rule); Blessed ally immune.'),
        'gems-types-selection-resolution': v('16 Red -> plain Skull, then 16 Green -> Yellow.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Conversions (native steps 0,1) precede Enchant picks (2,3).'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将所有红色宝石转换成骷髅头，和所有绿色宝石转换成黄色。赋予两名随机盟友法印效果。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'Red -> Skulls and Green -> Yellow, all gems.', c2: 'Enchant 2 distinct random allies.' },
      steps: {
        0: 'ConvertGems Red->Skull Amount 100 -> transform Red to SKULL.',
        1: 'ConvertGems Green->Yellow Amount 100 -> transform Green to Yellow.',
        2: 'CauseEnchanted RandomAlly Amount 1 -> first pick of allyRandomN n 2.',
        3: 'CauseEnchanted RandomPrefNotPrevAlly Amount 1 -> second distinct pick.',
      },
      branches: { main: 'Single branch; seeds, Blessed ally, lone caster.' },
    },
    'troop:7655': {
      en: en('troop:7655'), native: nat(9570),
      rule: [STATUS, 'official-status-effects.html: Enchanted status (extra mana per turn, removed on cast per R002).'],
      dims: {
        'identity-cost-colors': v('troop 7655 -> spell 9570; raw ManaCost 18 = native Cost 18; colours Yellow+Purple; spell.id binding asserted.'),
        'target-count-range': v('AllyColor Data 4 -> allyAll ifCond targetColor Purple (Data 4 = Purple: every AllyColor:4 spell in the snapshot says Purple): caster (Purple) and Purple / Purple+Red allies; Blue ally and enemies excluded.'),
        'base-formula-rounding': v('Life [Magic+1] (IncreaseHealth Amount 1 x1) gain for magic 0/10; Magic +4 fixed (IncreaseSpellPower Amount 4); Life evaluated with caster Magic before its own +4 (1011 with magic 10, then magic 14).'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': v('Colour filter Purple per target; no Purple ally -> no status/buff.'),
        'status-duration-immunity': v('enchanted status-apply turns 3 on each Purple ally.'),
        'gems-types-selection-resolution': v('16 Red -> Purple, then 16 Yellow -> plain Skull (Delay 400 timing only).'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Native order: conversions, Enchant, Life, Magic (event order status-apply, buff hp, buff magic).'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将所有红色宝石转换为紫色，将所有黄色宝石转换为骷髅。为所有紫色盟友附魔，并赋予他们 [魔法 + 1] 生命和 4 魔法。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'Red -> Purple and Yellow -> Skulls, all gems.', c2: 'All Purple allies Enchanted, +[Magic+1] Life, +4 Magic.' },
      steps: {
        0: 'ConvertGems Red->Purple Amount 100 -> transform Red to Purple.',
        1: 'ConvertGems Yellow->Skull Amount 100 Delay 400 -> transform Yellow to SKULL.',
        2: 'CauseEnchanted AllyColor 4 -> status enchanted allyAll targetColor Purple.',
        3: 'IncreaseHealth AllyColor 4 Amount 1 x Magic -> buff hp allyAll targetColor Purple gain.',
        4: 'IncreaseSpellPower AllyColor 4 Amount 4 -> buff magic 4 allyAll targetColor Purple.',
      },
      branches: { main: 'Single branch; Purple/non-Purple mix, order case, no Purple ally.' },
    },
    'troop:6604': {
      en: en('troop:6604'), native: nat(7813),
      rule: [STATUS, 'official-status-effects.html: Enraged; Burning deals 3 damage per turn; Blessed troops immune to status effects.'],
      dims: {
        'identity-cost-colors': v('troop 6604 -> spell 7813; raw ManaCost 18 = native Cost 18; colours Yellow+Brown; spell.id binding asserted.'),
        'target-count-range': v('AllAllies -> allyAll (caster + 2 allies, dead skipped); AllEnemies -> enemyAll (4 enemies, dead skipped, Blessed resists).'),
        'base-formula-rounding': na('No numeric formula; Burning tick amount is the shared status rule (fixed 3).'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': na('No condition/chance.'),
        'status-duration-immunity': v('rage turns 3 on every ally (isEnraged true); burning turns 3 on every enemy; Blessed enemy resists.'),
        'gems-types-selection-resolution': v('16 Blue -> Brown, then 16 Yellow -> plain Skull.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Native order: conversions, Enrage allies, Burn enemies (status-apply order asserted).'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将所有蓝色宝石转换成棕色，和所有黄色宝石转换成骷髅头。赋予所有盟友狂怒效果并使所有敌人陷入燃烧状态。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'Blue -> Brown and Yellow -> Skulls.', c2: 'Enrage all allies, Burn all enemies.' },
      steps: {
        0: 'ConvertGems Blue->Brown Amount 100 -> transform Blue to Brown.',
        1: 'ConvertGems Yellow->Skull Amount 100 -> transform Yellow to SKULL.',
        2: 'CauseEnraged AllAllies -> status rage allyAll.',
        3: 'CauseBurning AllEnemies -> status burning enemyAll.',
      },
      branches: { main: 'Single branch; both sides, Blessed/dead cases.' },
    },
    'troop:7453': {
      en: en('troop:7453'), native: nat(9163),
      rule: [GEMS, 'Heroic Gems (Infinity Plus 2 help centre): Terror Gem matches with Purple Gems, gives 1 mana, and on match inflicts Terror on a random enemy; created terrorGem joins Purple.'],
      dims: {
        'identity-cost-colors': v('troop 7453 -> spell 9163; raw ManaCost 13 = native Cost 13; colours Red+Yellow; spell.id binding asserted.'),
        'target-count-range': v('RandomEnemy -> enemyRandom: exactly one living enemy hit; dead enemies never (10 seeds).'),
        'base-formula-rounding': v('Damage Amount 2 x Magic: [Magic+2] (2 and 12) hits armor first (armor 1 -> 0, hp -= dmg-1).'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': v('Seeded random target; no condition.'),
        'status-duration-immunity': na('Cast applies no status (Terror only via later gem matches, shared gem rule).'),
        'gems-types-selection-resolution': v('ConvertGems Green -> Terror Amount 100: all 16 Green -> special terrorGem (Purple join key).'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Conversion precedes the damage event (native order); Barrier absorbs and is consumed.'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将所有绿色宝石转换成恐怖宝石。对一名随机敌人造成 [魔法 + 2] 点伤害。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'All Green -> Terror Gems (16).', c2: '[Magic+2] damage to one random living enemy.' },
      steps: {
        0: 'ConvertGems Green->Terror Amount 100 -> transform Green to terrorGem.',
        1: 'Damage RandomEnemy Amount 2 SpellPowerMultiplier 1 -> damage enemyRandom {2,1}.',
      },
      branches: { main: 'Single branch; magic 0/10 both sides, dead/Barrier cases.' },
    },
  },
};
