const T = 'tests/unit/gowLaneL4bB06.test.ts';
const STATUS = 'artifacts/gow-skill-audit/gold-primary-sources/official-status-effects.html';
const GEMS = 'artifacts/gow-skill-audit/gold-primary-sources/official-heroic-gems-freshdesk.html';
const R001 = 'tasks/active/gow-skill-shards/rulings/R001-native-step-order.md';
const en = id => `Entity ${id} SpellId/English text/ManaCost/ManaColors asserted verbatim in ${T}.`;
const wen = (id, ref, sp, cost, cols) => `Weapon ${id} (${ref}) spell id ${sp}, English text, ManaCost ${cost}, ManaColors ${cols} asserted from gowhead weapons.json in ${T}.`;
const nat = sp => `SpellId ${sp} Cost/Target and every SpellSteps field (ordered, toEqual) asserted in ${T}.`;
const na = n => ['not-applicable', n];
const v = n => ['verified', n];
const MANA = v('Caster mana 0 after cast except cascade mana-gain events; no skill extra turn; one action-log entry; turn passes (or cascade 4+/5 extra turn only).');
const PIPE = v('Real TurnEngine.castSkill on both sides (Left/Right); low mana (cost-1) and Silence refuse without spending mana or touching board/statuses/turn.');
const WPIPE = a => v(`Real TurnEngine.castSkill via both aliases (numeric, ${a}) on both sides and magic 0/10; low mana and Silence refuse without spending mana or touching board/statuses/turn.`);
const R001RULE = note => [['rule', 'official-shared-rule', R001, `R001 (coordination ruling): native SpellSteps order governs. ${note}`]];
const weapon = (id, ref, sp, cost, cols, gemNote, gemType, zh) => ({
  en: wen(id, ref, sp, cost, cols), native: nat(sp),
  rule: [GEMS, gemNote],
  dims: {
    'identity-cost-colors': v(`weapon ${id} -> spell ${sp}; gowhead ManaCost ${cost} = native Cost ${cost}; colours ${cols}; src weapons.json id/referenceName ${ref}/manaCost/manaColors/spell.id; numeric ${sp} and gw_${ref} aliases resolve to the same prototype.`),
    'target-count-range': v('FromTarget (spell Target Enemy) -> enemyChosen: only the chosen enemy is damaged; ally id refused before mana is spent (1546).'),
    'base-formula-rounding': v('Damage Amount 6 x Magic: [Magic+6] = 6 / 16; armor absorbed first (armor 2 case), integer.'),
    'boost-source-ratio-cap': na('No boost/ratio/cap.'),
    'conditions-probabilities-branches': na('No condition/chance.'),
    'status-duration-immunity': na('Cast applies no status; Barrier on the target absorbs the hit and is consumed (1547).'),
    'gems-types-selection-resolution': v(`ConvertGems Amount 100: all 16 source gems -> special ${gemType}.`),
    'summon-transform-pools': na('No summon or troop transform.'),
    'order-death-retargeting': v('Conversion (Delay 1 timing only) precedes the damage event; lethal hit defeats the chosen enemy.'),
    'mana-economy-extra-turn': MANA,
    'display-description': v(`Chinese '${zh}' matches English.`),
    'battle-pipeline': WPIPE(`gw_${ref}`),
  },
  clauses: { c1: `All source gems converted to ${gemType} (16).`, c2: '[Magic+6] damage to the chosen enemy.' },
  steps: {
    0: `ConvertGems Amount 100 Delay 1 -> transform to ${gemType}.`,
    1: 'Damage FromTarget Amount 6 x Magic -> damage enemyChosen {6,1}.',
  },
  branches: { main: 'Single branch; aliases x sides x magic, lethal/Barrier/illegal-target cases.' },
});
export default {
  testFile: T,
  reviews: {
    'weapon:1546': weapon(1546, 'SolarWinds', 9159, 14, 'Red+Yellow', 'Heroic Gems (Infinity Plus 2 help centre): Cursed Gems match with Brown Gems for Brown mana and curse a random enemy when matched; created curseGem joins Brown.', 'curseGem', '将所有红色宝石转换成诅咒宝石。再对一名敌人造成 [魔法 + 6] 点伤害。'),
    'weapon:1547': weapon(1547, 'LunarTide', 9160, 14, 'Green+Purple', 'Heroic Gems (Infinity Plus 2 help centre): Doomskull family (skull-joining explosive gems); created doomSkull.', 'doomSkull', '将所有紫色宝石转换成末日骷髅头。再对一名敌人造成 [魔法 + 6] 点伤害。'),
    'troop:6542': {
      en: en('troop:6542'), native: nat(7736),
      rule: R001RULE('Convert then GiveGold; gold goes to the caster side battle pool (economy-gain event).'),
      dims: {
        'identity-cost-colors': v('troop 6542 -> spell 7736; raw ManaCost 12 = native Cost 12; colours Red+Yellow; spell.id binding asserted.'),
        'target-count-range': v('GiveGold Target Self -> caster side gold pool only; opponent pool unchanged.'),
        'base-formula-rounding': v('GiveGold Amount 1 x Magic: [Magic+1] = 1 / 11 gold.'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': na('No condition/chance.'),
        'status-duration-immunity': na('No status.'),
        'gems-types-selection-resolution': v('ConvertGems Green -> Blue Amount 100: all 16 Green become Blue; none -> skipped (gold still granted).'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Native order convert then gold.'),
        'mana-economy-extra-turn': v('economy-gain gold [Magic+1] with side = caster side; caster mana 0 after cast except cascade mana; no extra turn; turn passes.'),
        'display-description': v("Chinese '将所有绿色宝石转换成蓝色。给予 [魔法 + 1] 黄金。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'All Green -> Blue.', c2: '[Magic+1] gold to the caster side.' },
      steps: { 0: 'ConvertGems Green->Blue Amount 100 -> transform Green to Blue.', 1: 'GiveGold Self Amount 1 x Magic -> gainEconomy gold {1,1}.' },
      branches: { main: 'Single branch; sides x magic and no-Green board.' },
    },
    'troop:7412': {
      en: en('troop:7412'), native: nat(9061),
      rule: R001RULE('Convert then IncreaseArmor on the chosen ally (spell Target Ally).'),
      dims: {
        'identity-cost-colors': v('troop 7412 -> spell 9061; raw ManaCost 13 = native Cost 13; colours Yellow+Purple; spell.id binding asserted.'),
        'target-count-range': v('FromTarget with spell Target Ally -> allyChosen: chosen ally only (self allowed); enemy id refused before mana is spent.'),
        'base-formula-rounding': v('IncreaseArmor Amount 1 x Magic: [Magic+1] = 1 / 11 armor.'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': na('No condition/chance.'),
        'status-duration-immunity': na('No status.'),
        'gems-types-selection-resolution': v('ConvertGems Brown -> Skull Amount 100: 16 Brown -> plain Skull.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Native order convert then armor.'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将所有棕色宝石转换成骷髅头。给予一名盟友 [魔法 + 1] 点护甲值。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'All Brown -> Skulls.', c2: '[Magic+1] Armor to the chosen ally.' },
      steps: { 0: 'ConvertGems Brown->Skull Amount 100 -> transform Brown to SKULL.', 1: 'IncreaseArmor FromTarget Amount 1 x Magic -> buff armor allyChosen {1,1}.' },
      branches: { main: 'Single branch; sides x magic, self target, illegal enemy target.' },
    },
    'troop:6687': {
      en: en('troop:6687'), native: nat(8033),
      rule: R001RULE('Convert then IncreaseHealth on the front ally.'),
      dims: {
        'identity-cost-colors': v('troop 6687 -> spell 8033; raw ManaCost 12 = native Cost 12; colours Red+Yellow; spell.id binding asserted.'),
        'target-count-range': v('FrontAlly -> allyFront: caster when front, ally in front otherwise, dead front skipped.'),
        'base-formula-rounding': v('IncreaseHealth Amount 1 x Magic: [Magic+1] Life gain (maxHp and hp).'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': na('No condition/chance.'),
        'status-duration-immunity': na('No status.'),
        'gems-types-selection-resolution': v('ConvertGems Green -> Skull Amount 100: 16 Green -> plain Skull.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Native order convert then Life; dead front retargets.'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将绿色宝石转换成骷髅头。给予第一位盟友 [魔法 + 1] 点生命值。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'All Green -> Skulls.', c2: '[Magic+1] Life to the first living ally.' },
      steps: { 0: 'ConvertGems Green->Skull Amount 100 -> transform Green to SKULL.', 1: 'IncreaseHealth FrontAlly Amount 1 x Magic -> buff hp allyFront {1,1} gain.' },
      branches: { main: 'Single branch; sides x magic, front ally, dead front.' },
    },
  },
};
