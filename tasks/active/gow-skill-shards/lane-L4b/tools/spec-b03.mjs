const T = 'tests/unit/gowLaneL4bB03.test.ts';
const STATUS = 'artifacts/gow-skill-audit/gold-primary-sources/official-status-effects.html';
const GEMS = 'artifacts/gow-skill-audit/gold-primary-sources/official-heroic-gems-freshdesk.html';
const R001 = 'tasks/active/gow-skill-shards/rulings/R001-native-step-order.md';
const en = id => `Entity ${id} SpellId/English text/ManaCost/ManaColors asserted verbatim in ${T}.`;
const nat = sp => `SpellId ${sp} Cost and every SpellSteps field (ordered, toEqual) asserted in ${T}.`;
const na = n => ['not-applicable', n];
const v = n => ['verified', n];
const MANA = v('Caster mana 0 after cast except cascade mana-gain events; no skill extra turn; one action-log entry; turn passes (or cascade 4+/5 extra turn only).');
const PIPE = v('Real TurnEngine.castSkill on both sides (Left/Right); low mana (cost-1) and Silence refuse without spending mana or touching board/statuses/turn.');
export default {
  testFile: T,
  reviews: {
    'troop:6677': {
      en: en('troop:6677'), native: nat(8023),
      rule: [STATUS, 'official-status-effects.html: Blessed makes the troop temporarily immune to status effects; Blessed and Cursed cancel each other. Used for the Bless clause (front-ally target, no Life interaction).'],
      extra: [['r001', 'user-ruling', R001, 'R001: native SpellSteps order governs; native Bless (step 1) precedes Life (step 2) and the prototype follows native order.']],
      dims: {
        'identity-cost-colors': v('troop 6677 -> spell 8023; raw ManaCost 12 = native Cost 12; colours Green+Purple in raw and src; spell.id binding asserted.'),
        'target-count-range': v('Bless FrontAlly -> allyFront (first living ally incl. caster; ally in front of caster when present; dead front skipped); Life AllAlliesButNotSelf -> allyOthers (caster excluded, front ally included when not caster).'),
        'base-formula-rounding': v('IncreaseHealth Amount 1 SpellPowerMultiplier 1 -> [Magic+1] Life gain (maxHp and hp +magic+1) for magic 0 and 10; integer, no rounding.'),
        'boost-source-ratio-cap': na('No boost/ratio/cap in English or native steps.'),
        'conditions-probabilities-branches': na('No condition, chance or Randomize.'),
        'status-duration-immunity': v('Blessed status-apply turns 3 on the front ally only (project convention for status duration, shared); no enemy touched.'),
        'gems-types-selection-resolution': v('ConvertGems Blue -> Yellow Amount 100 = all Blue: exactly the 16 Blue cells become Yellow, other colours untouched; no-Blue board -> no conversion.'),
        'summon-transform-pools': na('No summon or troop transform step.'),
        'order-death-retargeting': v('Native order convert -> Bless -> Life asserted from events (R001; English lists Life before Bless); dead front ally skipped for Bless.'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将所有蓝色宝石转换成黄色。给予所有其他盟友 [魔法 + 1] 点生命值，再赐福第一位盟友。' matches English colours, target sets and [Magic + 1]."),
        'battle-pipeline': PIPE,
      },
      clauses: {
        c1: 'All Blue gems (16) converted to Yellow in one gem-transform; no Blue -> nothing converted.',
        c2: 'Every other living ally gains [Magic+1] Life (maxHp/hp), caster excluded, magic 0/10.',
        c3: 'First (front) living ally Blessed turns 3: caster when front, ally in front otherwise; dead front skipped.',
      },
      steps: {
        0: 'ConvertGems Blue->Yellow Amount 100 -> transform from Blue to Yellow (all).',
        1: 'CauseBlessed FrontAlly -> status blessed allyFront, executed before Life.',
        2: 'IncreaseHealth AllAlliesButNotSelf Amount 1 x Magic -> buff hp allyOthers scaling {1,1} lifeMode gain.',
      },
      branches: { main: 'Single main branch; covered with front caster, front ally, dead front, lone caster and no-Blue board.' },
    },
    'troop:7112': {
      en: en('troop:7112'), native: nat(8655),
      rule: [STATUS, 'official-status-effects.html: Cursed dispels positive statuses and cancels Blessed (both removed); Death Mark gives a 10% chance to die at turn start. Used for Barrier strip and Blessed-Dwarf cases.'],
      dims: {
        'identity-cost-colors': v('troop 7112 -> spell 8655; raw ManaCost 12 = native Cost 12; colours Blue+Purple; spell.id binding asserted.'),
        'target-count-range': v('EnemyType Data dwarf -> enemyAll + targetRace Dwarf: only living enemies whose troopTypes include Dwarf (incl. Dwarf+Giant dual type); Human/untyped enemies and allied Dwarves untouched; dead Dwarf skipped.'),
        'base-formula-rounding': na('No numeric formula (conversion is all-of-colour, statuses have no magnitude).'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': na('No condition/chance; Death Mark death roll is a status tick outside the cast (shared status rule).'),
        'status-duration-immunity': v('curse and death-mark turns 3 on Dwarves; Blessed Dwarf: Curse cancels Blessed (both removed, official rule) and Death Mark then lands; Curse strips Barrier.'),
        'gems-types-selection-resolution': v('ConvertGems Brown -> Skull (Amount 100): all 16 Brown become plain Skulls; pre-existing Skull not reconverted.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Native order convert (Delay 1 = presentation timing) -> Curse -> Death Mark: gem-transform precedes status events; status events Curse(all Dwarves) then Death Mark(all Dwarves).'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将所有棕色宝石转换成骷髅头。使所有矮人陷入诅咒和死亡标记状态。' matches English (Brown->Skulls, Curse + Death Mark all Dwarves)."),
        'battle-pipeline': PIPE,
      },
      clauses: {
        c1: 'All Brown gems (16) converted to Skulls; existing Skull unchanged.',
        c2: 'Then Curse and Death Mark every living enemy Dwarf only; none when no Dwarf enemy.',
      },
      steps: {
        0: 'ConvertGems Brown->Skull Amount 100 Delay 1 -> transform Brown to SKULL (Delay is timing only).',
        1: 'CauseCursed EnemyType dwarf -> status curse enemyAll targetRace Dwarf.',
        2: 'CauseDeathMark EnemyType dwarf -> status death-mark enemyAll targetRace Dwarf.',
      },
      branches: { main: 'Single branch; covered with mixed races, no Dwarf, Blessed/dead Dwarf and Barrier Dwarf.' },
    },
    'troop:6779': {
      en: en('troop:6779'), native: nat(8169),
      rule: [STATUS, "official-status-effects.html: Hunter's Mark status and Blessed immunity to status effects (Blessed front enemy resists)."],
      dims: {
        'identity-cost-colors': v('troop 6779 -> spell 8169; raw ManaCost 12 = native Cost 12; colours Blue+Yellow; spell.id binding asserted.'),
        'target-count-range': v("FrontEnemy -> enemyFront: first living enemy (10; 11 when 10 dead); others untouched."),
        'base-formula-rounding': na('No numeric formula.'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': na('No condition/chance.'),
        'status-duration-immunity': v("marked (Hunter's Mark) turns 3 on the front enemy; Blessed front enemy resists (no status-apply)."),
        'gems-types-selection-resolution': v('ConvertGems Purple -> Green Amount 100: all 16 Purple become Green; no Purple -> no conversion.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Native order convert (Delay 0) then Hunter\'s Mark: gem-transform precedes status-apply; dead front enemy retargets to next living.'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将紫色宝石转换成绿色。使第一名敌人陷入猎人标记状态。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'All Purple converted to Green (16 cells).', c2: "First living enemy Hunter's Marked (turns 3)." },
      steps: {
        0: 'ConvertGems Purple->Green Amount 100 Delay 0 -> transform Purple to Green.',
        1: "CauseHuntersMark FrontEnemy Amount 1 -> status marked enemyFront.",
      },
      branches: { main: 'Single branch; front/dead-front/Blessed/no-Purple covered.' },
    },
    'troop:7170': {
      en: en('troop:7170'), native: nat(8742),
      rule: [['rule', 'official-shared-rule', R001, 'R001 (coordination ruling): native SpellSteps order governs; the two ConvertGems steps run Red->Green first, then Yellow->Brown, each resolving the board.']],
      dims: {
        'identity-cost-colors': v('troop 7170 -> spell 8742; raw ManaCost 12 = native Cost 12; colours Blue+Green; spell.id binding asserted.'),
        'target-count-range': na('No troop target; board-wide conversions only.'),
        'base-formula-rounding': na('No numeric formula.'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': na('No condition/chance.'),
        'status-duration-immunity': na('No status.'),
        'gems-types-selection-resolution': v('Two all-of-colour conversions: 16 Red -> Green, then 16 Yellow -> Brown; Green created by step 1 untouched by step 2; absent colours skipped.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Two gem-transform events in native order (Red->Green first, Yellow->Brown second).'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将所有红色宝石转换成绿色宝石，和所有黄色宝石转换成棕色宝石。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'Red->Green and Yellow->Brown, all gems of each, in that order; missing colours skipped.' },
      steps: {
        0: 'ConvertGems Red->Green Amount 100 Delay 0 -> transform Red to Green.',
        1: 'ConvertGems Yellow->Brown Amount 100 -> transform Yellow to Brown.',
      },
      branches: { main: 'Single branch; both colours / only Yellow / neither covered.' },
    },
    'weapon:1434': {
      en: `Weapon 1434 (KrystasScythe) spell id 8647, English text, ManaCost 14, ManaColors Yellow+Brown asserted from gowhead weapons.json in ${T}.`,
      native: nat(8647),
      rule: [
        ['rule', 'official-shared-rule', GEMS, 'Heroic Gems (Infinity Plus 2 help centre): Elemental Star matches with Brown, Blue, Green or Red gems, gives 1 mana to all four, then destroys diagonal gems. Created Stars carry the star4 join key (connects with those four colours only).'],
        ['rule2', 'official-shared-rule', STATUS, 'official-status-effects.html: Stun status; Blessed troops immune to status effects.'],
      ],
      dims: {
        'identity-cost-colors': v('weapon 1434 -> spell 8647; gowhead ManaCost 14 = native Cost 14; colours Yellow+Brown; src weapons.json id/referenceName/manaCost/manaColors/spell.id; numeric 8647 and gw_KrystasScythe aliases resolve to the same prototype.'),
        'target-count-range': v('AllEnemies -> enemyAll: all 4 living enemies Stunned; dead skipped; Blessed immune.'),
        'base-formula-rounding': v('CreateGems Amount 3 fixed: exactly 3 Stars, no magic scaling.'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': na('No condition/chance.'),
        'status-duration-immunity': v('stun status-apply turns 3 on each living enemy (project convention; CauseStun Amount 1); Blessed resists.'),
        'gems-types-selection-resolution': v('Color1 ElementalStar -> special elementalStar: 3 distinct cells; empty cells filled first (gem-create), otherwise on-board conversion; created Star connects with Brown/Blue/Green/Red but not Yellow/Purple/Skull.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Native order Stun (Delay 1 = timing) then create: status-apply precedes gem events.'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '击晕所有敌人，再创造 3 颗元素星。' matches English."),
        'battle-pipeline': v('Real TurnEngine.castSkill via both aliases (8647, gw_KrystasScythe) on both sides; low mana and Silence refuse without spending mana or touching board/statuses/turn.'),
      },
      clauses: { c1: 'All enemies Stunned, then exactly 3 Elemental Stars created (empty cells first).' },
      steps: {
        0: 'CauseStun AllEnemies Amount 1 Delay 1 -> status stun enemyAll turns 3.',
        1: 'CreateGems ElementalStar Amount 3 -> create special elementalStar count 3.',
      },
      branches: { main: 'Single branch; both aliases, both sides, empty-cell and Blessed/dead cases.' },
    },
  },
};
