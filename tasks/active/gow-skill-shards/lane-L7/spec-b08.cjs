// sa-L76 B08 fill spec (accepts only; 6550 / 7755 / 7069 stay draft).
const T = 'tests/unit/gowLaneL7B08.test.ts';
const BRIAN = 'artifacts/gow-skill-audit/gold-primary-sources/official-brian-guide.html';
const NA = n => ['not-applicable', n];
module.exports = [
  {
    key: 'troop:6283',
    en: "troop 6283: stats.spell.id 7429, ManaCost 12, Green/Red, English 'Deal [Magic + 4] damage to an enemy. Deal double damage if they use Green Mana. Halve their Attack. [2:1]' asserted verbatim.",
    native: 'spell 7429 Target Enemy Cost 12; SpellSteps asserted: CountAttack FromTarget 50; Damage FromTarget 4 SPM 1 StatusModifier MultiplyForGreenTarget StatusAmount 2; DecreaseAttack FromTarget counter.',
    rule: { path: 'artifacts/gow-skill-audit/gold-primary-sources/official-weapon-list.html', note: "Official weapon list uses the same colour-conditional wording (Ice Arrow 'Deal double damage if they use Red Mana'); halving = CountAttack 50% floor then DecreaseAttack." },
    test: T, testNote: 'L7B08 troop:6283 describe: binding/prototype/zh; 4 real casts (non-Green target [Magic+4], Attack 17 -> 9); Green target double; Attack 1 / 40 halving; armor; low-mana/silence.',
    dims: {
      'identity-cost-colors': 'Entity 6283 -> spell 7429, cost 12, Green/Red; ledger binding checks true.',
      'target-count-range': 'FromTarget -> enemyChosen for damage and Attack reduction.',
      'base-formula-rounding': '[Magic+4] (x2 vs Green-mana target); Attack removed = floor(Attack x 50%) (17 -> 8 removed, 1 -> 0).',
      'boost-source-ratio-cap': 'CountAttack FromTarget 50 -> reduce halve (floor); [2:1] labels that 50%; no cap.',
      'conditions-probabilities-branches': 'MultiplyForGreenTarget StatusAmount 2 -> condMult x2 targetColor Green: Green target 14 at magic 3, non-Green 4 + magic.',
      'status-duration-immunity': NA('No status applied.'),
      'gems-types-selection-resolution': NA('No gem steps.'),
      'summon-transform-pools': NA('No summon/transform.'),
      'order-death-retargeting': 'Native count (pre-damage Attack) -> damage -> halve; damage does not change Attack, so order is unobservable here.',
      'mana-economy-extra-turn': 'Real cast spends 12 mana and ends the turn; low mana / silence block.',
      'display-description': 'zh contains [魔法 + 4], 绿色 (Green mana) double, 攻击力 halving and [2:1]; matches English.',
      'battle-pipeline': 'TurnEngine.castSkill both sides; armor absorbs normal damage.',
    },
    clauses: { c1: '[Magic + 4] damage to the chosen enemy.', c2: 'Double damage if the target uses Green mana.', c3: 'Target Attack halved (floor of the removed half).', c4: '[2:1] = 50% of target Attack removed.' },
    steps: { 0: 'CountAttack FromTarget 50 -> halve counter.', 1: 'Damage FromTarget 4 SPM 1 MultiplyForGreenTarget x2 -> damage enemyChosen condMult targetColor Green.', 2: 'DecreaseAttack FromTarget counter -> reduce attack halve.' },
    branches: { main: 'Single branch; the Green-target multiplier covered on both outcomes.' },
  },
  {
    key: 'troop:6874',
    en: "troop 6874: stats.spell.id 8298, ManaCost 15, Yellow/Purple, English 'Deal [Magic + 6] damage to an Enemy, boosted by their Attack. Gain 10 Souls. [1:1]' asserted verbatim.",
    native: 'spell 8298 Target Enemy Cost 15; SpellSteps asserted: CountAttack FromTarget 100; Damage FromTarget 6 SPM 1 counter; GiveSouls Self 10.',
    rule: { path: BRIAN, note: "Official Brian guide '(Boost Ratio N:1)' labels; [1:1] = +1 per point of the target's Attack (native CountAttack 100)." },
    test: T, testNote: 'L7B08 troop:6874 describe: binding/prototype/zh; 4 real casts ([Magic+6] + target Attack 23, other Attack ignored, +10 souls asserted on the Left side); Attack 0 + armor; low-mana/silence.',
    dims: {
      'identity-cost-colors': 'Entity 6874 -> spell 8298, cost 15, Yellow/Purple; ledger binding checks true.',
      'target-count-range': 'FromTarget -> enemyChosen; souls to own side.',
      'base-formula-rounding': '[Magic+6] + target Attack (100%).',
      'boost-source-ratio-cap': 'CountAttack FromTarget 100 -> targetStat attack of the same target (1:1); caster Attack 40 and other enemy 90 ignored; no cap.',
      'conditions-probabilities-branches': NA('No condition/chance.'),
      'status-duration-immunity': NA('No status applied.'),
      'gems-types-selection-resolution': NA('No gem steps.'),
      'summon-transform-pools': NA('No summon/transform.'),
      'order-death-retargeting': 'Count before damage; souls after.',
      'mana-economy-extra-turn': 'Real cast spends 15 mana and ends the turn; GiveSouls Self 10 -> economy souls +10 (asserted for the Left/player side).',
      'display-description': 'zh contains [魔法 + 6], 攻击力 boost, 10 souls and [1:1]; matches English.',
      'battle-pipeline': 'TurnEngine.castSkill both sides; armor absorbs normal damage.',
    },
    clauses: { c1: '[Magic + 6] damage to the chosen enemy boosted by its Attack.', c2: 'Gain 10 Souls.', c3: '[1:1] = +1 per Attack point.' },
    steps: { 0: 'CountAttack FromTarget 100 -> targetStat attack ratio 1:1.', 1: 'Damage FromTarget 6 SPM 1 counter -> damage enemyChosen + modifier.', 2: 'GiveSouls Self 10 -> gainEconomy souls 10.' },
    branches: { main: 'Single unconditional branch.' },
  },
];
