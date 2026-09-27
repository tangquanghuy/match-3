// sa-L76 B03 fill spec (accept records only; drafts stay as scaffold + issues.json).
const T = 'tests/unit/gowLaneL7B03.test.ts';
const BRIAN = 'artifacts/gow-skill-audit/gold-primary-sources/official-brian-guide.html';
const WLIST = 'artifacts/gow-skill-audit/gold-primary-sources/official-weapon-list.html';
const R000 = { id: 'r000', role: 'user-ruling', path: 'tasks/active/gow-skill-shards/rulings/R000-waived-modes.md', note: 'R000: Boss / ascension-dependent clauses are waived (user-waived-mode); base damage still verified.' };
const NA = n => ['not-applicable', n];
module.exports = [
  {
    key: 'troop:7501',
    en: "troop 7501: stats.spell.id 9246, ManaCost 12, Blue/Red, English 'Deal [Magic + 4] damage to an Enemy, boosted by all Ally Armor. If they are a Boss, deal 3x - 5x damage, based on my Ascensions. [4:1]' asserted verbatim.",
    native: 'spell 9246 Target Enemy Cost 12; SpellSteps asserted with toEqual: CountArmor AllAllies 25; Damage FromTarget Amount 4 SPM 1 UseCounterForAmount Primarypower StatusModifier MultiplyForAscensionBoss StatusAmount 3.',
    rule: { path: BRIAN, note: "Official Brian guide writes armor/gem boosted spells as '(Boost Ratio N:1)', e.g. Resolve 'Give all allies [0+Magic] Armor ... (Boost Ratio 4:1)'; supports +1 per 4 armor counted." },
    test: T, testNote: 'L7B03 troop:7501 describe: binding/prototype/zh; 4 real castSkill cases both sides; ratio boundaries 3/4/8; dead ally and enemy armor excluded; armor absorption, barrier, low-mana/silence.',
    rulings: [R000],
    dims: {
      'identity-cost-colors': 'Entity 7501 -> spell 9246, cost 12, Blue/Red in raw and src troops; ledger binding checks true.',
      'target-count-range': 'FromTarget -> enemyChosen; only the chosen enemy (12) loses Life.',
      'base-formula-rounding': '[Magic+4] + floor(allyArmor/4): magic 0/10 with ally armor 13 -> +3.',
      'boost-source-ratio-cap': 'CountArmor AllAllies Amount 25 (= [4:1]) over living allies incl. caster: 3->+0, 4->+1, 8->+2; dead ally 40 and enemy armor excluded; no cap.',
      'conditions-probabilities-branches': 'Only condition is the Boss x ascension multiplier, waived per R000 (clause c2); no chance or Randomize.',
      'status-duration-immunity': NA('No status applied; barrier on target blocks the hit (battle-pipeline).'),
      'gems-types-selection-resolution': NA('No gem steps.'),
      'summon-transform-pools': NA('No summon/transform.'),
      'order-death-retargeting': 'Count step precedes damage (native order kept); defeated ally not counted.',
      'mana-economy-extra-turn': 'Real cast spends 12 mana and ends the turn; low mana and silence block.',
      'display-description': "zh '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因所有盟友护甲值数而增强。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [4:1]' matches English.",
      'battle-pipeline': 'TurnEngine.castSkill both sides; normal damage consumes target armor first (armor 2 -> 0, Life -3 of 5); barrier blocks.',
    },
    clauses: {
      c1: '[Magic + 4] to the chosen enemy boosted by all ally armor: exact Life loss both sides at magic 0/10; enemy armor not a source.',
      c2: ['excluded', 'boss', "Waived per R000: 'If they are a Boss, deal 3x - 5x damage, based on my Ascensions' (Boss target + ascension scaling not implemented in this project; existing condMult x3 placeholder untouched)."],
      c3: '[4:1]: +1 per 4 ally armor, floor: 13 -> +3, 4 -> +1, 3 -> +0.',
    },
    steps: {
      0: 'CountArmor AllAllies 25 -> allyStatSum armor ratio 4:1 over living allies incl. caster.',
      1: 'Damage FromTarget Amount 4 SPM 1 UseCounterForAmount -> damage enemyChosen base 4 mult 1 + counter; base part asserted both sides. Its StatusModifier MultiplyForAscensionBoss part is the waived Boss clause c2 (R000).',
    },
    branches: { main: 'Single unconditional branch; covered by all real cast cases.' },
  },
  {
    key: 'troop:6889',
    en: "troop 6889: stats.spell.id 8312, ManaCost 12, Blue/Green, English 'Deal [Magic + 4] damage to an Enemy, boosted by Blue Allies and Enemies. If they are a Boss, deal 3x - 5x damage, based on my Ascensions. [x3]' asserted verbatim.",
    native: "spell 8312 Target Enemy Cost 12; SpellSteps asserted: CountArmyColor AllAllies 300 Data '0'; CountArmyColor AllEnemies 300 Data '0' UseCounterForAmount; Damage FromTarget 4 SPM 1 UseCounterForAmount StatusModifier MultiplyForAscensionBoss StatusAmount 3.",
    rule: { path: BRIAN, note: "Official Brian guide documents count-boosted spells with '(Boost Ratio N:1)' labels; the [x3] multiplier (native Amount 300 = x3 per counted Blue troop) follows the English/native snapshot." },
    test: T, testNote: 'L7B03 troop:6889 describe: binding/prototype/zh; 4 real casts both sides (caster + 1 Blue ally + 2 Blue enemies = x4); non-Blue caster, dead Blue ally/enemy excluded; armor absorption; low-mana/silence.',
    rulings: [R000],
    dims: {
      'identity-cost-colors': 'Entity 6889 -> spell 8312, cost 12, Blue/Green; ledger binding checks true.',
      'target-count-range': 'FromTarget -> enemyChosen; only enemy 12 damaged.',
      'base-formula-rounding': '[Magic+4] + 3 x count: magic 0/10 with 4 Blue troops -> +12.',
      'boost-source-ratio-cap': "CountArmyColor Data '0' (Blue) Amount 300 on AllAllies + AllEnemies -> multiplier 3 over alliesOfColor + enemiesOfColor Blue; caster counted only when Blue; dead troops excluded; no cap.",
      'conditions-probabilities-branches': 'Only condition is the Boss x ascension multiplier, waived per R000 (c2).',
      'status-duration-immunity': NA('No status applied.'),
      'gems-types-selection-resolution': NA('No gem steps.'),
      'summon-transform-pools': NA('No summon/transform.'),
      'order-death-retargeting': 'Both count steps precede damage; defeated Blue ally/enemy not counted.',
      'mana-economy-extra-turn': 'Real cast spends 12 mana and ends turn; low mana / silence block.',
      'display-description': "zh '对一名敌人造成 [魔法 + 4] 伤害，伤害值因蓝色盟友和敌人数而增强。如果敌人是个魔头，则基于我已晋升的稀有度造成 3 到 5 倍伤害。 [x3]' matches English.",
      'battle-pipeline': 'TurnEngine.castSkill both sides; normal damage consumes armor first (armor 5 -> 0, Life -2 of 7).',
    },
    clauses: {
      c1: '[Magic + 4] boosted by Blue allies and enemies: exact loss on the chosen enemy both sides; counting includes caster only when Blue, living only.',
      c2: ['excluded', 'boss', "Waived per R000: 'If they are a Boss, deal 3x - 5x damage, based on my Ascensions' (Boss + ascension scaling not implemented; placeholder condMult untouched)."],
      c3: '[x3]: +3 per counted Blue troop (4 -> +12, 1 -> +3).',
    },
    steps: {
      0: "CountArmyColor AllAllies Data '0' Amount 300 -> alliesOfColor Blue x3 (caster included when Blue).",
      1: "CountArmyColor AllEnemies Data '0' Amount 300 UseCounterForAmount -> enemiesOfColor Blue added to the same counter.",
      2: 'Damage FromTarget 4 SPM 1 UseCounterForAmount -> enemyChosen base 4 mult 1 + counter; base part asserted. StatusModifier MultiplyForAscensionBoss is the waived Boss clause c2 (R000).',
    },
    branches: { main: 'Single unconditional branch; covered by all real cast cases.' },
  },
  {
    key: 'weapon:1075',
    en: "weapon 1075 GoldenCog: SpellId 7188, ManaCost 15, Red/Yellow, English 'Give Armor to an Ally equal to their current Armor. [1:1]' asserted (artifacts/gowhead-weapons/weapons.json).",
    native: 'spell 7188 Target Ally Cost 15; SpellSteps asserted: CountArmor FromTarget 100; IncreaseArmor FromTarget UseCounterForAmount.',
    rule: { path: WLIST, note: "Official weapon list: Golden Cog (Mana Cost 15 Red Yellow) 'Double an ally's Armor. (Boost Ratio 1:1)'." },
    test: T, testNote: 'L7B03 weapon:1075 describe: raw + src binding, numeric and gw_GoldenCog aliases, prototype, zh; 8 real casts (2 sides x 2 aliases x magic 0/10); self target, 0 armor, dead ally; low-mana/silence.',
    dims: {
      'identity-cost-colors': 'Weapon 1075 -> spell 7188, cost 15, Red/Yellow, ReferenceName GoldenCog; numeric and gw_GoldenCog prototypes identical.',
      'target-count-range': 'Target Ally / FromTarget -> allyChosen: only the chosen ally (20) changes; caster and other ally untouched; self can be chosen.',
      'base-formula-rounding': 'Counter = 100% of the ally armor, added once: 13 -> 26, 9 -> 18, 0 -> 0; magic-independent.',
      'boost-source-ratio-cap': 'CountArmor FromTarget Amount 100 = [1:1] of the target own armor; no cap.',
      'conditions-probabilities-branches': NA('No condition/chance.'),
      'status-duration-immunity': NA('No status.'),
      'gems-types-selection-resolution': NA('No gem steps.'),
      'summon-transform-pools': NA('No summon/transform.'),
      'order-death-retargeting': 'Count then increase on the same target; dead ally is not buffed (armor 30 kept).',
      'mana-economy-extra-turn': 'Real cast spends 15 mana and ends the turn; low mana / silence block.',
      'display-description': "zh '使 1 名盟友的护甲值翻倍。 [1:1]' matches English/official 'Double an ally's Armor'.",
      'battle-pipeline': 'TurnEngine.castSkill both sides with numeric and gw_ alias skill ids.',
    },
    clauses: {
      c1: 'Chosen ally gains Armor equal to its current Armor (doubling): 13 -> 26 both sides, both aliases.',
      c2: '[1:1]: 100% of the counted armor added (native Amount 100).',
    },
    steps: {
      0: 'CountArmor FromTarget 100 -> counter = chosen ally armor (double:true reads currentStat armor).',
      1: 'IncreaseArmor FromTarget UseCounterForAmount -> buff allyChosen armor by that counter; asserted exact values.',
    },
    branches: { main: 'Single unconditional branch; covered by all real casts.' },
  },
];
