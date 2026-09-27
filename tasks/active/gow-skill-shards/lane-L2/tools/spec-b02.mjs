const T = 'tests/unit/gowLaneL2B02.test.ts';
const GEMS = 'artifacts/gow-skill-audit/gold-primary-sources/official-heroic-gems-freshdesk.html';
const STATUS = 'artifacts/gow-skill-audit/gold-primary-sources/official-status-effects.html';
const R001 = 'tasks/active/gow-skill-shards/rulings/R001-native-step-order.md';
const R002 = 'tasks/active/gow-skill-shards/rulings/R002-barrier-enchant-cleanse.md';
const R004 = 'tasks/active/gow-skill-shards/rulings/R004-status-durations.md';
const en = id => `Entity ${id} SpellId/English text/ManaCost/ManaColors asserted verbatim in ${T}.`;
const nat = sp => `SpellId ${sp} Target/Cost/Randomize and every SpellSteps field (ordered, toEqual) asserted in ${T}.`;
const na = n => ['not-applicable', n];
const v = n => ['verified', n];
const PIPE = v('Real TurnEngine.castSkill on both sides (Left/Right); low mana (cost-1) and Silence refuse without spending mana or touching statuses/turn.');
const R4 = ['r004', 'user-ruling', R004, 'R004: negative statuses have no fixed duration (turn-start cumulative self-heal); tests assert status-apply events of the cast, not post-turn state. Cause* Amount ignored (R006 C2).'];
export default {
  testFile: T,
  reviews: {
    'troop:6876': {
      en: en('troop:6876'), native: nat(8292),
      rule: [STATUS, 'Official status list: Entangled.'],
      extra: [R4, ['r001', 'user-ruling', R001, 'R001: both native branches end with ExtraTurn Self Amount 100; hoisting one shared extraTurn after the random pick is unobservable.']],
      dims: {
        'identity-cost-colors': v('troop 6876 -> spell 8292; raw ManaCost 11 = native Cost 11; colours Blue+Green.'),
        'target-count-range': v('AB: FirstTwoEnemies -> enemyFirstN n2 (first 2 living; dead front skipped). CD: FirstTwoAllies -> allyFirstN n2 = caster + next ally; third ally untouched.'),
        'base-formula-rounding': v('GenerateHalfMana = floor(manaCost/2) per ally: 5 (caster, cost 11) and 8 (cost 16).'),
        'boost-source-ratio-cap': na('No boost.'),
        'conditions-probabilities-branches': v('Randomize AB-CD -> oneOf 2 options: both reachable on both sides; 200 seeds split 80..120 (even odds); the unpicked branch has no events.'),
        'status-duration-immunity': v('Entangle applied to exactly the first 2 living enemies (status-apply events); duration per R004.'),
        'gems-types-selection-resolution': na('No gems.'), 'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Branch effect then extra turn; dead front enemy skipped.'),
        'mana-economy-extra-turn': v('Extra turn in both branches (active side unchanged, one action-log entry).'),
        'display-description': v("Chinese '缠绕首 2 名敌人，或给予首 2 名盟友半数法力值。获得一个额外回合。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'One random branch: Entangle first 2 enemies OR half mana to first 2 allies.', c2: 'Extra turn after either branch.' },
      steps: { 0: 'CauseEntangle FirstTwoEnemies -> option 0 status entangle enemyFirstN n2.', 1: 'ExtraTurn Self 100 -> shared extraTurn.', 2: 'GenerateHalfMana FirstTwoAllies -> option 1 buff mana allyFirstN n2 halve.', 3: 'ExtraTurn Self 100 -> same shared extraTurn.' },
      branches: { AB: 'Seeds producing option 0 on both sides (+ dead-front case).', CD: 'Seeds producing option 1 on both sides.' },
    },
    'troop:6958': {
      en: en('troop:6958'), native: nat(8458),
      rule: [['rule', 'official-shared-rule', R001, 'R001: native CauseStun precedes Damage; Stun suppresses traits (spellblock) before the hit. Fixed this round (L2-6958-order).']],
      extra: [R4],
      dims: {
        'identity-cost-colors': v('troop 6958 -> spell 8458; raw ManaCost 13 = native Cost 13; colours Blue+Yellow.'),
        'target-count-range': v('FirstTwoEnemies -> first 2 living enemies (dead front skipped; lone survivor hit once).'),
        'base-formula-rounding': v('[Magic+2] = 2 / 12 at magic 0 / 10; armor absorbs first.'),
        'boost-source-ratio-cap': na('No boost.'),
        'conditions-probabilities-branches': v('Randomize AB+(C-D-E-F): A,B always; one of C/D/E/F = ExtraTurn, 12 Armor, ExtraTurn, 12 Armor -> oneOf(extraTurn, armor 12) equal odds (200 seeds 80..120); both tails on both sides.'),
        'status-duration-immunity': v('Stun applied to the first 2 living enemies before damage (status-apply events precede skill-damage); Barrier blocks the damage only.'),
        'gems-types-selection-resolution': na('No gems.'), 'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Stun -> Damage -> tail (native order, fixed); spellblock target takes full 12.'),
        'mana-economy-extra-turn': v('Tail CE: extra turn, armor unchanged; tail DF: +12 armor, turn passes.'),
        'display-description': v("Chinese '对前 2 位敌人造成 [魔法 + 2] 点伤害，再将他们击晕。再获得一个额外回合或获得 12 点护甲值。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: '[Magic+2] damage to first 2 enemies and Stun them.', c2: 'Then either an extra turn OR 12 Armor (even odds).' },
      steps: { 0: 'CauseStun FirstTwoEnemies -> status stun enemyFirstN n2 (first).', 1: 'Damage FirstTwoEnemies 2 x Magic -> damage enemyFirstN n2 {2,1}.', 2: 'ExtraTurn -> oneOf option 0.', 3: 'IncreaseArmor Self 12 -> oneOf option 1.', 4: 'ExtraTurn (duplicate option E) -> option 0 weight.', 5: 'IncreaseArmor 12 (duplicate option F) -> option 1 weight.' },
      branches: { 'AB+(C': 'A,B (stun + damage) always executed on both sides x magic; tail C = extra turn reached.', D: 'Tail D = +12 armor reached.', E: 'Tail E = extra turn (same effect as C, 2 of 4 options).', 'F)': 'Tail F = +12 armor (same effect as D, 2 of 4 options).' },
    },
    'troop:6383': {
      en: en('troop:6383'), native: nat(7538),
      rule: [R002, 'R002: Cleanse removes only negative statuses (Barrier kept).'],
      extra: [['brian', 'official-shared-rule', 'artifacts/gow-skill-audit/gold-primary-sources/official-brian-guide.html', "Official guide wording 'Increase a random Skill by X': one random Skill (Attack/Armor/Life/Magic) receives the whole amount."]],
      dims: {
        'identity-cost-colors': v('troop 6383 -> spell 7538; raw ManaCost 12 = native Cost 12; colours Purple+Brown.'),
        'target-count-range': v('Target Ally -> chosen ally only; other ally and caster unchanged.'),
        'base-formula-rounding': v('IncreaseRandom [Magic+1] (1 / 11) to exactly one Skill; IncreaseSpellPower +2.'),
        'boost-source-ratio-cap': na('No boost.'),
        'conditions-probabilities-branches': v('MultiplyForWildfolk x2 on both steps when the chosen ally is Wildfolk (22 + 4 at magic 10); Goblin ally not doubled. Random Skill pool attack/armor/hp/magic, all four reached over 40 seeds.'),
        'status-duration-immunity': v('Cleanse removes Poison, keeps Barrier.'),
        'gems-types-selection-resolution': na('No gems.'), 'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Cleanse -> random Skill -> Magic (native order; Delay step is presentation only).'),
        'mana-economy-extra-turn': v('Caster mana 0; no extra turn; turn passes.'),
        'display-description': v("Chinese '净化一名盟友。使其一项随机属性获得 [魔法 + 1] 点，并获得 2 点魔力值。如果盟友是蛮族，则效果两倍。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'Cleanse, [Magic+1] to one random Skill, +2 Magic.', c2: 'Wildfolk ally: both doubled.' },
      steps: { 0: 'Cleanse FromTarget -> cleanse allyChosen.', 1: 'IncreaseRandom 1 x Magic MultiplyForWildfolk 2 -> randomStat oneSkill raceDouble Wildfolk.', 2: 'Delay 1000 -> presentation pause, no effect (asserted in native toEqual).', 3: 'IncreaseSpellPower 2 MultiplyForWildfolk 2 -> buff magic 2 raceDouble Wildfolk.' },
      branches: { main: 'Single branch; both sides x magic, Wildfolk/non-Wildfolk.' },
    },
    'weapon:1620': {
      en: en('weapon:1620'), native: nat(9523),
      rule: [STATUS, 'Official status list: Bleed stacks.'],
      extra: [['r002', 'user-ruling', R002, 'R002: Cleanse removes only negative statuses.'], R4],
      dims: {
        'identity-cost-colors': v('weapon 1620 FloweringThorn -> spell 9523 (numeric and gw_FloweringThorn); ManaCost 16 = native Cost 16; colours Purple+Brown.'),
        'target-count-range': v('Each InflictEffectOnRandomTroops step = Amount distinct random living enemies (enemyRandomN); all 4 enemies reachable; fewer survivors -> each hit once per step; dead never.'),
        'base-formula-rounding': v('Steps 2,2,2,2,1 = 9 Bleed applications (4 living); lone enemy 5 applications.'),
        'boost-source-ratio-cap': v('Bleed stacks per application, capped at 4 per enemy.'),
        'conditions-probabilities-branches': v('Seeded random picks; no enemy twice within one step.'),
        'status-duration-immunity': v('Bleed via status-apply events; self Cleanse removes Poison, keeps Barrier; allies not cleansed.'),
        'gems-types-selection-resolution': na('No gems.'), 'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Cleanse then five Bleed steps (native order; fixed L2-1620-random-bleed).'),
        'mana-economy-extra-turn': v('Caster mana 0; no extra turn; turn passes.'),
        'display-description': v("Chinese '净化自身，然后随机对敌方队伍造成 9 层流血效果。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'Cleanse self, then 9 Bleed stacks spread randomly over the enemy team.' },
      steps: { 0: 'Cleanse Self -> cleanse allySelf.', 1: 'Bleed x2 random -> enemyRandomN n2.', 2: 'Bleed x2 random -> enemyRandomN n2.', 3: 'Bleed x2 random -> enemyRandomN n2.', 4: 'Bleed x2 random -> enemyRandomN n2.', 5: 'Bleed x1 random -> enemyRandomN n1.' },
      branches: { main: 'Single branch; both sides x both aliases, 2 living, lone enemy.' },
    },
    'troop:7698': {
      en: en('troop:7698'), native: nat(9657),
      rule: [GEMS, 'Heroic Gems help centre: Enchant Gem matches with Purple and enchants a random ally when matched.'],
      extra: [R4, ['r002', 'user-ruling', 'tasks/active/gow-skill-shards/rulings/R002-barrier-enchant-cleanse.md', 'R002 positive-status handling (Blessed persists until the holder acts, R004).']],
      dims: {
        'identity-cost-colors': v('troop 7698 -> spell 9657; raw ManaCost 16 = native Cost 16; colours Green+Purple; spell Target ManaGemsOnly.'),
        'target-count-range': v('FromManaColor -> living allies of the chosen colour (caster incl., dead excluded); FromManaColorEnemy -> enemies of the chosen colour (dual-colour incl.).'),
        'base-formula-rounding': v('ConvertGems Amount 10: exactly 10 of the chosen colour; fewer present -> all of them (4).'),
        'boost-source-ratio-cap': na('No boost.'),
        'conditions-probabilities-branches': v('Player Choose ABC / DEF (branch 0/1/null); the chosen colour (FixedColorChooser Green / Blue) drives both halves; one colour choice per cast (native has a single FromTarget).'),
        'status-duration-immunity': v('Blessed / Cursed via status-apply events on exactly the colour-matching units.'),
        'gems-types-selection-resolution': v('Branch 0 -> 10 enchantedGem, branch 1 -> 10 entangleGem, never the other kind.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Convert then status (native order).'),
        'mana-economy-extra-turn': v('One action-log entry; no skill extra turn.'),
        'display-description': v("Chinese '选择一项：选择一种法力颜色，将 10 颗该色宝石转化为附魔宝石，祝福所有该色盟友；或…纠缠宝石，诅咒所有该色敌人。' matches English."),
        'battle-pipeline': v('Real TurnEngine.castSkill on both sides with FixedBranchChooser 0/1 and FixedColorChooser; low mana, Silence and cancelled choice refuse without spending mana or touching the board.'),
      },
      clauses: { c1: 'Colour chosen via ColorChooser (ManaGemsOnly).', c2: 'Branch 0: 10 -> Enchant Gems, Bless allies of that colour.', c3: 'Same single colour choice for branch 1.', c4: 'Branch 1: 10 -> Entangle Gems, Curse enemies of that colour.' },
      steps: { 0: 'ConvertGems FromTarget 10 -> Enchant -> transformToSpecial CHOSEN enchantedGem x10.', 1: 'CauseBlessed FromManaColor -> blessed allyAll ifCond targetColor CHOSEN.', 3: 'ConvertGems FromTarget 10 -> Entangle -> transformToSpecial CHOSEN entangleGem x10.', 4: 'CauseCursed FromManaColorEnemy -> curse enemyAll ifCond targetColor CHOSEN.' },
      branches: { ABC: 'Branch 0 on both sides + Blue colour + dead ally.', DEF: 'Branch 1 on both sides + fewer-than-10 board.' },
    },
  },
};
