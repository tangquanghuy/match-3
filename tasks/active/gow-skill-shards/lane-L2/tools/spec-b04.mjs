const T = 'tests/unit/gowLaneL2B04.test.ts';
const GEMS = 'artifacts/gow-skill-audit/gold-primary-sources/official-heroic-gems-freshdesk.html';
const R001 = 'tasks/active/gow-skill-shards/rulings/R001-native-step-order.md';
const R003 = 'tasks/active/gow-skill-shards/rulings/R003-count-threshold-labels.md';
const en = id => `Entity ${id} SpellId/English text/ManaCost/ManaColors asserted verbatim in ${T}.`;
const nat = sp => `SpellId ${sp} Target/Cost/Randomize and every SpellSteps field (ordered, toEqual) asserted in ${T}.`;
const na = n => ['not-applicable', n];
const v = n => ['verified', n];
const d = n => ['difference', n];
const PIPE = v('Real TurnEngine.castSkill on both sides (Left/Right); low mana (cost-1) and Silence refuse without spending mana or touching board/turn.');
const PIPE_CHOOSE = v('Real TurnEngine.castSkill on both sides with FixedBranchChooser 0/1; low mana, Silence and a cancelled choice (null) refuse without spending mana or touching the board.');
const NOSTAT = na('No status.'), NOSUM = na('No summon or troop transform.'), NOBOOST = na('No boost/ratio/cap.');
export default {
  testFile: T,
  reviews: {
    'weapon:1504': {
      en: en('weapon:1504'), native: nat(8900),
      rule: [GEMS, 'Heroic Gems help centre: Spirit Gems take the colour of the converted gems.'],
      extra: [['r003', 'user-ruling', R003, 'R003: CountGems Spirit Amount 400 = x4 per Spirit Gem.']],
      dims: {
        'identity-cost-colors': v('weapon 1504 CourtScepter -> spell 8900 (numeric and gw_CourtScepter); ManaCost 14 = native Cost 14; colours Green+Red.'),
        'target-count-range': v('Target Enemy: branch 0 reads the chosen enemy colour; branch 1 damages only the chosen enemy.'),
        'base-formula-rounding': v('Branch 1 [Magic+2] = 2 / 12; armor absorbs.'),
        'boost-source-ratio-cap': v('+4 per Spirit Gem of any colour on board (3 -> +12, 0 -> +0, 2 mixed -> +8); no cap.'),
        'conditions-probabilities-branches': v('Player Choose ABC / DEF (0/1/null).'),
        'status-duration-immunity': NOSTAT,
        'gems-types-selection-resolution': v('Branch 0: all 16 gems of the chosen enemy colour (Purple) -> spiritGem.'),
        'summon-transform-pools': NOSUM,
        'order-death-retargeting': v('Branch 1: count then damage (native order).'),
        'mana-economy-extra-turn': v('Caster mana 0; no extra turn; turn passes.'),
        'display-description': v("Chinese '选择一项：将选定敌人一种法力颜色的所有宝石转化为灵魂宝石；或对一名敌人造成 [魔法 + 2] 点伤害，每颗灵魂宝石增加 4 点伤害。' matches English."),
        'battle-pipeline': PIPE_CHOOSE,
      },
      clauses: { c1: 'Branch 0: all gems of the chosen enemy colour -> Spirit Gems.', c2: 'Branch 1: [Magic+2] to the chosen enemy, boosted by Spirit Gems.', c3: '[x4] = +4 per Spirit Gem.' },
      steps: { 0: 'ConvertGems FromTarget 100 -> Spirit -> transform CHOSEN_TARGET spiritGem.', 3: 'CountGems Spirit 400 -> modifier multiplier 4 boardSpecial spiritGem.', 4: 'Damage FromTarget 2 x Magic UseCounterForAmount -> damage enemyChosen {2,1} + modifier.' },
      branches: { ABC: 'Branch 0 both sides x aliases.', DEF: 'Branch 1 both sides x magic, 0/3/mixed Spirit Gems.' },
    },
    'troop:7169': {
      en: en('troop:7169'), native: nat(8722),
      rule: [['rule', 'official-shared-rule', R001, 'R001: native ConvertGems BoardTarget SingleGem (spell Target Board) converts the chosen gem; A/C shared conversion hoisted before the random pick (identical in both branches, no RNG). Fixed this round (L2-singlegem-cell).']],
      dims: {
        'identity-cost-colors': v('troop 7169 -> spell 8722; raw ManaCost 10 = native Cost 10; colours Blue+Brown; spell Target Board.'),
        'target-count-range': v('The chosen cell (2,5) / (6,1) is the converted gem (same gem id).'),
        'base-formula-rounding': v('Convert 1; branch AB creates 3 more Bombs (4 total).'),
        'boost-source-ratio-cap': NOBOOST,
        'conditions-probabilities-branches': v('Randomize AB-CD -> oneOf 2: both reachable on both sides; 200 seeds 80..120.'),
        'status-duration-immunity': NOSTAT,
        'gems-types-selection-resolution': v('Chosen gem -> bomb; AB: +3 bombs; CD: explode all Bombs (the converted one explodes).'),
        'summon-transform-pools': NOSUM,
        'order-death-retargeting': v('Convert first, then the random follow-up (native order).'),
        'mana-economy-extra-turn': v('One action-log entry; cascades may refill mana; no skill extra turn.'),
        'display-description': v("Chinese '将一颗宝石转换成炸弹宝石。再创造 3 颗炸弹宝石或爆破所有炸弹宝石。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'Chosen gem -> Bomb, then either 3 more Bombs OR explode all Bombs.' },
      steps: { 0: 'ConvertGems FromTarget SingleGem -> Bomb -> transformToSpecial CELL bomb x1.', 1: 'CreateGems Bomb 3 -> option 0.', 2: 'ConvertGems SingleGem -> same hoisted conversion.', 3: 'ExplodeColor Bomb -> option 1 explode special bomb.' },
      branches: { AB: 'Option 0 seeds (4 bombs).', CD: 'Option 1 seeds (explosion).' },
    },
    'troop:7817': {
      decision: 'draft', issues: ['L2-decrease-random-pool'],
      en: en('troop:7817'), native: nat(9861),
      rule: [GEMS, 'Heroic Gems help centre: Poison Gems match with Green.'],
      dims: {
        'identity-cost-colors': v('troop 7817 -> spell 9861; raw ManaCost 12 = native Cost 12; colours Blue+Green; spell Target ManaGemsOnly.'),
        'target-count-range': v('RandomEnemy: exactly one living enemy; all living reachable over 20 seeds; dead never.'),
        'base-formula-rounding': v('[Magic+1] = 11.'), 'boost-source-ratio-cap': NOBOOST,
        'conditions-probabilities-branches': d('DecreaseRandom pool attack/armor/magic only (Life excluded) - disputed, see issues L2-decrease-random-pool.'),
        'status-duration-immunity': NOSTAT,
        'gems-types-selection-resolution': v('All 16 gems of the chosen colour (Purple) -> poisonGem.'),
        'summon-transform-pools': NOSUM, 'order-death-retargeting': v('Convert then reduce (native order).'),
        'mana-economy-extra-turn': v('Caster mana 0; no extra turn; turn passes.'),
        'display-description': v("Chinese '将指定颜色的所有宝石转化为毒宝石。然后随机减少一名敌人的[魔法 + 1]点随机技能点数。' matches English."),
        'battle-pipeline': v('Real TurnEngine.castSkill on both sides.'),
      },
      clauses: { c1: 'Chosen colour -> Poison Gems.', c2: ['difference', 'Random enemy loses [Magic+1] of a random Skill; pool excludes Life (disputed).'] },
      steps: { 0: 'ConvertGems FromTarget -> Poison -> transform CHOSEN poisonGem.', 1: ['difference', 'DecreaseRandom RandomEnemy -> reduce random enemyRandom (3-stat pool, disputed).'] },
      branches: { main: 'Single branch.' },
    },
    'troop:7214': {
      en: en('troop:7214'), native: nat(8801),
      rule: [['rule', 'official-shared-rule', R001, 'R001: native AB-CD = one roll for Good vs Evil (tiers [1,2] once per cast); ExplodeGems SingleGem = the chosen gem; the explosion is identical in both branches.']],
      dims: {
        'identity-cost-colors': v('troop 7214 -> spell 8801; raw ManaCost 10 = native Cost 10; colours Blue+Brown; spell Target Board.'),
        'target-count-range': v('Chosen cell (4,4) / (0,3) is the explosion centre.'),
        'base-formula-rounding': v('ConvertGems Amount 4: 4 of 5 Stone Blocks; fewer -> all; explode 3x3 = 9 (edge 6).'),
        'boost-source-ratio-cap': NOBOOST,
        'conditions-probabilities-branches': v('One tier per cast (all 4 same); Good (tier 1) / Evil (tier 2) both reachable; 200 seeds 80..120.'),
        'status-duration-immunity': NOSTAT,
        'gems-types-selection-resolution': v('stoneBlock -> gargoyleGem tier 1 (Good) or 2 (Evil); no block -> no transform, explosion still happens.'),
        'summon-transform-pools': NOSUM, 'order-death-retargeting': v('Convert then explode (native order).'),
        'mana-economy-extra-turn': v('One action-log entry; no skill extra turn.'),
        'display-description': v("Chinese '将 4 颗石块转换成善或恶石像鬼宝石。再爆破一颗宝石。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: '4 Stone Blocks -> Good OR Evil Gargoyle Gems (one roll).', c2: 'Then explode the chosen gem.' },
      steps: { 0: 'ConvertGems Block 4 -> GoodGargoyle -> tier 1.', 1: 'ExplodeGems SingleGem -> explode cell CELL.', 2: 'ConvertGems Block 4 -> BadGargoyle -> tier 2.', 3: 'ExplodeGems SingleGem -> same explode segment.' },
      branches: { AB: 'Tier 1 seeds.', CD: 'Tier 2 seeds.' },
    },
    'weapon:1500': {
      en: en('weapon:1500'), native: nat(8876),
      rule: [['rule', 'official-shared-rule', R001, 'R001: branch DEF native order ExplodeGems (chosen gem) then CreateGems Green 10.']],
      dims: {
        'identity-cost-colors': v('weapon 1500 Foxglove -> spell 8876 (numeric and gw_Foxglove); ManaCost 14 = native Cost 14; colours Blue+Purple; spell Target NotGreenOrSkullGems.'),
        'target-count-range': v('Chosen cell (3,3) / corner (0,0) is the explosion centre.'),
        'base-formula-rounding': v('Branch 0: every Green (16); branch 1: explode 9 (corner 4), create exactly 10 Green.'),
        'boost-source-ratio-cap': NOBOOST, 'conditions-probabilities-branches': v('Player Choose ABC / DEF (0/1/null); colour via FixedColorChooser (Red / Yellow).'),
        'status-duration-immunity': NOSTAT,
        'gems-types-selection-resolution': v('Branch 0: Green -> chosen colour; branch 1: 10 plain Green created after the explosion.'),
        'summon-transform-pools': NOSUM, 'order-death-retargeting': v('Explode before create (event order).'),
        'mana-economy-extra-turn': v('One action-log entry; no skill extra turn.'),
        'display-description': v("Chinese '选择一项：将所有绿色宝石转化为选定颜色；或爆破一颗选定宝石，再创造 10 颗绿色宝石。' matches English."),
        'battle-pipeline': PIPE_CHOOSE,
      },
      clauses: { c1: 'Branch 0: all Green -> chosen colour.', c2: 'Branch 1: explode a chosen gem, then create 10 Green.' },
      steps: { 0: 'ConvertGems Green -> FromTarget -> transform Green CHOSEN.', 3: 'ExplodeGems SingleGem -> explode cell CELL.', 4: 'CreateGems Green 10 -> create color Green x10.' },
      branches: { ABC: 'Branch 0 both sides x aliases x colours.', DEF: 'Branch 1 both sides + corner.' },
    },
  },
};
