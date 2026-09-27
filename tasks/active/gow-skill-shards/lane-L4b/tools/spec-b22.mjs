const T = 'tests/unit/gowLaneL4bB22.test.ts';
const GEMS = 'artifacts/gow-skill-audit/gold-primary-sources/official-heroic-gems-freshdesk.html';
const R001 = 'tasks/active/gow-skill-shards/rulings/R001-native-step-order.md';
const R002 = 'tasks/active/gow-skill-shards/rulings/R002-barrier-enchant-cleanse.md';
const R003 = 'tasks/active/gow-skill-shards/rulings/R003-count-threshold-labels.md';
const en = id => `Entity ${id} SpellId/English text/ManaCost/ManaColors asserted verbatim in ${T}.`;
const nat = sp => `SpellId ${sp} Cost and every SpellSteps field (ordered, toEqual) asserted in ${T}.`;
const na = n => ['not-applicable', n];
const v = n => ['verified', n];
const MANA = v('Caster mana 0 after cast except cascade mana-gain events; no skill extra turn; one action-log entry; turn passes (or cascade 4+/5 extra turn only).');
const PIPE = v('Real TurnEngine.castSkill on both sides (Left/Right); low mana (cost-1) and Silence refuse without spending mana or touching board/statuses/turn.');
export default {
  testFile: T,
  reviews: {
    'troop:7499': {
      en: en('troop:7499'), native: nat(9244),
      rule: [GEMS, 'Heroic Gems (Infinity Plus 2 help centre): Dragon Gems exist in all 6 colours and match with their colour.'],
      extra: [['r003', 'user-ruling', R003, 'AllyColor Data 3 = Yellow (every AllyColor:3 spell in the snapshot says Yellow).']],
      dims: {
        'identity-cost-colors': v('troop 7499 -> spell 9244; raw ManaCost 15 = native Cost 15; colours Blue+Yellow; spell.id binding asserted.'),
        'target-count-range': v('AllyColor 3 -> allyAll targetColor Yellow: caster (Yellow) and Yellow/Red ally +1; Green ally, enemies, dead Yellow ally untouched.'),
        'base-formula-rounding': v('IncreaseSpellPower Amount 1: magic +1.'), 'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': v('Colour filter Yellow per ally.'), 'status-duration-immunity': na('No status.'),
        'gems-types-selection-resolution': v('All 16 Brown -> special dragonGem colour Yellow (round-2 fix L4b-7499-dragon).'),
        'summon-transform-pools': na('No summon or troop transform.'), 'order-death-retargeting': v('Convert then Magic (native order).'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将所有棕色宝石转换成黄龙宝石。给予所有黄色盟友 1 点魔力值。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'All Brown -> Yellow Dragon Gems.', c2: '1 Magic to every living Yellow ally.' },
      steps: { 0: 'ConvertGems Brown->DragonYellow Amount 100 -> transformToSpecial {dragonGem, Yellow}.', 1: 'IncreaseSpellPower AllyColor 3 Amount 1 -> buff magic allyAll targetColor Yellow.' },
      branches: { main: 'Single branch; both sides, non-Yellow caster, dead ally.' },
    },
    'troop:6841': {
      en: en('troop:6841'), native: nat(8246),
      rule: [['rule', 'official-shared-rule', R001, 'R001: native steps are executed as written: Damage RandomEnemy then Damage RandomPrefNotPrevEnemy (two hits; the second prefers another enemy, reuses a lone survivor). Prototype fixed in round 2 (L4b-6841-prefnotprev).']],
      dims: {
        'identity-cost-colors': v('troop 6841 -> spell 8246; raw ManaCost 18 = native Cost 18; colours Yellow+Brown; spell.id binding asserted.'),
        'target-count-range': v('Two hits: enemyRandom then enemyRandomPrefNotPrev -> two different enemies when >= 2 alive (seeds 1/42), both on the lone survivor otherwise; dead never hit; all living enemies reachable over 20 seeds.'),
        'base-formula-rounding': v('Each hit [Magic+2] = 12 (magic 10); lone survivor takes 24.'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'), 'conditions-probabilities-branches': v('Seeded random targets.'),
        'status-duration-immunity': na('No status.'),
        'gems-types-selection-resolution': v('16 Purple -> Yellow, then 16 Green -> plain Skull.'),
        'summon-transform-pools': na('No summon or troop transform.'), 'order-death-retargeting': v('Conversions then the two hits (native order).'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将紫色宝石转换成黄色，绿色宝石转换成骷髅头。对 2 名随机敌人造成 [魔法 + 2] 点伤害。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'Purple -> Yellow and Green -> Skulls.', c2: '[Magic+2] damage to 2 random enemies (two separate hits).' },
      steps: { 0: 'ConvertGems Purple->Yellow -> transform.', 1: 'ConvertGems Green->Skull -> transform to SKULL.', 2: 'Damage RandomEnemy Amount 2 x Magic -> damage enemyRandom {2,1}.', 3: 'Damage RandomPrefNotPrevEnemy Amount 2 x Magic -> damage enemyRandomPrefNotPrev {2,1}.' },
      branches: { main: 'Single branch; seeds, lone survivor, dead-enemy sweep.' },
    },
    'troop:7071': {
      en: en('troop:7071'), native: nat(8599),
      rule: [['rule', 'official-shared-rule', R003, 'R003: CountArmyColor Amount 200 = x2 per counted troop; two counters (allies, then enemies with UseCounterForAmount = accumulate); CreateGems Amount 2 UseCounterForAmount = 2 + counter (fixed round 2, L4b-7071-base).']],
      dims: {
        'identity-cost-colors': v('troop 7071 -> spell 8599; raw ManaCost 12 = native Cost 12; colours Red+Brown; spell.id binding asserted.'),
        'target-count-range': v('Counters over living Brown allies (caster included) and living Brown enemies (dual-colour included); dead excluded.'),
        'base-formula-rounding': v('2 + 2 x (Brown allies + Brown enemies): 10 for 2+2; 2 when none.'),
        'boost-source-ratio-cap': v('multiplier a=2 over alliesOfColor Brown + enemiesOfColor Brown; no cap.'),
        'conditions-probabilities-branches': na('No condition/chance.'), 'status-duration-immunity': na('No status.'),
        'gems-types-selection-resolution': v('Plain Skulls on distinct cells.'),
        'summon-transform-pools': na('No summon or troop transform.'), 'order-death-retargeting': v('Counts then create.'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '制造2个头骨，由棕色盟友和敌人激发。 [x2]' matches English (2 Skulls, boosted by Brown allies and enemies, x2)."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: '2 Skulls + 2 per Brown ally and enemy.', c2: '[x2] = +2 per Brown troop.' },
      steps: { 0: 'CountArmyColor AllAllies Data 5 Amount 200 -> source alliesOfColor Brown.', 1: 'CountArmyColor AllEnemies Data 5 Amount 200 UseCounterForAmount -> source enemiesOfColor Brown.', 2: 'CreateGems Skull Amount 2 UseCounterForAmount -> createSkulls base 2 + modifier x2.' },
      branches: { main: 'Single branch; 2+2 Brown troops, none.' },
    },
    'troop:6093': {
      en: en('troop:6093'), native: nat(7163),
      rule: [['rule', 'official-shared-rule', R001, 'R001: native order ConvertGems then GiveGold; spell Target ManaGemsOnly = the chosen colour is a mana colour (AI chooser picks the most common base colour).']],
      dims: {
        'identity-cost-colors': v('troop 6093 -> spell 7163; raw ManaCost 10 = native Cost 10; colours Green+Yellow; spell Target ManaGemsOnly; spell.id binding asserted.'),
        'target-count-range': v('GiveGold (no Target) -> caster side gold pool.'),
        'base-formula-rounding': v('GiveGold Amount 5 x Magic: [Magic+5] = 5 / 15 gold.'), 'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': na('No condition/chance.'), 'status-duration-immunity': na('No status.'),
        'gems-types-selection-resolution': v('All 4 Skulls -> chosen colour (Red via FixedColorChooser); AI chooser yields a mana colour; no Skull -> no conversion.'),
        'summon-transform-pools': na('No summon or troop transform.'), 'order-death-retargeting': v('Convert then gold.'),
        'mana-economy-extra-turn': v('economy-gain gold [Magic+5] to the caster side; caster mana 0 except cascade; no extra turn; turn passes.'),
        'display-description': v("Chinese '将所有骷髅头转换成选定的法力颜色。获得 [魔法 + 5] 黄金。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'All Skulls -> gems of the chosen colour.', c2: 'Gain [Magic+5] gold.' },
      steps: { 0: 'ConvertGems Skull->FromTarget Amount 100 -> transform SKULL to CHOSEN.', 1: 'GiveGold Amount 5 x Magic -> gainEconomy gold {5,1}.' },
      branches: { main: 'Single branch; sides x magic, AI chooser, no-Skull board.' },
    },
    'troop:7068': {
      decision: 'draft', issues: ['L4b-7068-zh'],
      en: en('troop:7068'), native: nat(8596),
      rule: [GEMS, 'Heroic Gems (Infinity Plus 2 help centre): Mana Potion Gems exist in all 6 colours; when matched or destroyed they create 7-11 gems of their colour.'],
      extra: [['r002', 'user-ruling', R002, 'R002: Cleanse removes negative statuses (Poison removed from the Fey ally).']],
      dims: {
        'identity-cost-colors': v('troop 7068 -> spell 8596; raw ManaCost 25 = native Cost 25; colours Blue+Red+Yellow; spell.id binding asserted.'),
        'target-count-range': v('AllyType fey -> cleanse allyAll targetRace Fey: only the Fey ally.'),
        'base-formula-rounding': v('ConvertGems Green Amount 5: exactly 5.'), 'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': na('No condition/chance.'), 'status-duration-immunity': v('Cleanse removes Poison from the Fey ally only.'),
        'gems-types-selection-resolution': v('5 Green -> manaPotionGem colour Purple (round-2 fix L4b-7068-potion-colour); 16 Brown -> Skull.'),
        'summon-transform-pools': na('No summon or troop transform.'), 'order-death-retargeting': v('Native order potions, skulls, cleanse.'),
        'mana-economy-extra-turn': MANA,
        'display-description': ['difference', "Chinese '将5有绿宝石都转化为紫色药水，并且所有棕色宝石都变为骷髅头。净化所有精灵同盟。' is garbled ('将5有…都' should read '将 5 颗绿色宝石转换成紫色法力药水'); see issues.json L4b-7068-zh."],
        'battle-pipeline': v('Real TurnEngine.castSkill on both sides.'),
      },
      clauses: { c1: '5 Green -> Purple Potions and all Brown -> Skulls.', c2: 'Cleanse all Fey allies.' },
      steps: { 0: 'ConvertGems Green->PurpleManaPotion Amount 5 -> transformToSpecial {manaPotionGem, Purple} count 5.', 1: 'ConvertGems Brown->Skull -> transform to SKULL.', 2: 'Cleanse AllyType fey -> cleanse allyAll targetRace Fey.' },
      branches: { main: 'Single branch; both sides.' },
    },
  },
};
