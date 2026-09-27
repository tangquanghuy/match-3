const T = 'tests/unit/gowLaneL2B03.test.ts';
const GEMS = 'artifacts/gow-skill-audit/gold-primary-sources/official-heroic-gems-freshdesk.html';
const STATUS = 'artifacts/gow-skill-audit/gold-primary-sources/official-status-effects.html';
const MB = 'artifacts/gow-skill-audit/gold-primary-sources/official-mana-burn-2-0.html';
const MBC = 'artifacts/gow-skill-audit/gold-primary-sources/community-2023-03-27-mana-burn-magic-plus-mana.json';
const R001 = 'tasks/active/gow-skill-shards/rulings/R001-native-step-order.md';
const R002 = 'tasks/active/gow-skill-shards/rulings/R002-barrier-enchant-cleanse.md';
const R004 = 'tasks/active/gow-skill-shards/rulings/R004-status-durations.md';
const R006 = 'tasks/active/gow-skill-shards/rulings/R006-hidden-mechanics-conventions.md';
const en = id => `Entity ${id} SpellId/English text/ManaCost/ManaColors asserted verbatim in ${T}.`;
const nat = sp => `SpellId ${sp} Target/Cost/Randomize and every SpellSteps field (ordered, toEqual) asserted in ${T}.`;
const na = n => ['not-applicable', n];
const v = n => ['verified', n];
const PIPE = v('Real TurnEngine.castSkill on both sides (Left/Right); low mana (cost-1) and Silence refuse without spending mana or touching board/statuses/turn.');
const PIPE_CHOOSE = v('Real TurnEngine.castSkill on both sides with FixedBranchChooser 0/1; low mana, Silence and a cancelled choice (null) refuse without spending mana or touching the board.');
const R4 = ['r004', 'user-ruling', R004, 'R004: status durations; tests assert status-apply events of the cast, not post-turn state.'];
const NOSTAT = na('No status.'), NOGEM = na('No gems.'), NOSUM = na('No summon or troop transform.'), NOBOOST = na('No boost/ratio/cap.');
export default {
  testFile: T,
  reviews: {
    'troop:7760': {
      en: en('troop:7760'), native: nat(9745),
      rule: [MB, 'Official 2.0 patch notes: Mana Burn deals damage based on the enemy\'s current mana and does not drain it.'],
      extra: [['mbc', 'community-source', MBC, 'Two community statements agree: Mana Burn = caster Magic + enemy current Mana (runtime formula).'], ['status', 'official-shared-rule', STATUS, 'Official status list: Curse and Blessed cancel each other.'], R4],
      dims: {
        'identity-cost-colors': v('troop 7760 -> spell 9745; raw ManaCost 12 = native Cost 12; colours Blue+Purple.'),
        'target-count-range': v('Target Enemy: branch 0 reads the chosen enemy colour; branch 1 Curse + Mana Burn hit only the chosen enemy.'),
        'base-formula-rounding': v('Branch 0: ConvertGems Amount 9 -> exactly 9 gems. Branch 1: ManaBurn SpellPowerMultiplier 1 = Magic + target mana (0/10 + 9), mana not drained; armor absorbs.'),
        'boost-source-ratio-cap': NOBOOST,
        'conditions-probabilities-branches': v('Player Choose ABC / DEF (branch 0/1/null).'),
        'status-duration-immunity': v('Curse via status-apply on the chosen enemy; Blessed target: Curse and Blessed cancel, Mana Burn then lands.'),
        'gems-types-selection-resolution': v('9 gems of the chosen enemy colour (Yellow or Purple) -> spiritGem; nothing else.'),
        'summon-transform-pools': NOSUM,
        'order-death-retargeting': v('Branch 1: Curse then ManaBurn (native order).'),
        'mana-economy-extra-turn': v('Caster mana 0; no extra turn; target mana unchanged by Mana Burn.'),
        'display-description': v("Chinese '&& 将 9 颗选定敌人法力颜色的宝石转换为精神宝石。&& 对敌人施加诅咒和法力燃烧。' matches English."),
        'battle-pipeline': PIPE_CHOOSE,
      },
      clauses: { c1: 'Branch 0: 9 gems of the chosen enemy colour -> Spirit Gems.', c2: 'Branch 1: Curse + Mana Burn the chosen enemy.' },
      steps: { 0: 'ConvertGems FromTarget 9 -> Spirit -> transform LAST_TARGET colour spiritGem x9.', 3: 'CauseCursed FromTarget -> status curse enemyChosen.', 4: 'ManaBurn x1 -> damage lastTarget {0,1} manaBurn.' },
      branches: { ABC: 'Branch 0 both sides x 2 colours.', DEF: 'Branch 1 both sides x magic + 0-mana/armor/Blessed edges.' },
    },
    'troop:6416': {
      en: en('troop:6416'), native: nat(7574),
      rule: [['rule', 'official-shared-rule', R001, 'R001: native Randomize A+(B-C-D-E-F) is executed as written: A always, then one of B..F at equal odds (Cleanse, Enchant, Magic, Cleanse, Enchant). Fixed this round (L2-6416-branch-weights).']],
      extra: [['r002', 'user-ruling', R002, 'R002: Cleanse removes negatives only.'], ['r006', 'user-ruling', R006, 'R006 C1: SpellPowerMultiplier 0.5 rounded with Math.round.'], R4],
      dims: {
        'identity-cost-colors': v('troop 6416 -> spell 7574; raw ManaCost 13 = native Cost 13; colours Green+Brown; spell Target NotYellowOrSkullGems.'),
        'target-count-range': v('AllAllies: caster + living ally; dead ally untouched.'),
        'base-formula-rounding': v('Magic option [(Magic/2)+1]: 10 -> +6, 11 -> +7, 0 -> +1 (convention:R006-C1).'),
        'boost-source-ratio-cap': NOBOOST,
        'conditions-probabilities-branches': v('oneOf of the 5 native options: 500 seeds Cleanse 160..240, Enchant 160..240, Magic 65..135; exactly one follow-up per cast; all reachable on both sides.'),
        'status-duration-immunity': v('Enchant option: status-apply enchanted on caster + living ally; Cleanse option removes Poison.'),
        'gems-types-selection-resolution': v('All gems of the chosen colour (Blue 16 / Purple 16 via FixedColorChooser) -> Yellow.'),
        'summon-transform-pools': NOSUM,
        'order-death-retargeting': v('Convert then the random follow-up (native A then B..F).'),
        'mana-economy-extra-turn': v('Caster mana 0; no extra turn; turn passes.'),
        'display-description': v("Chinese '将一个指定颜色转换为黄色，并获得下列其一：赋予所有盟友法印效果，或给予所有盟友 [(魔法 / 2) + 1] 点魔力值，或净化所有盟友。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'Chosen colour -> Yellow, then exactly one of Enchant / Magic / Cleanse all allies (native weights 2/5, 1/5, 2/5).' },
      steps: { 0: 'ConvertGems FromTarget -> Yellow -> transform CHOSEN Yellow.', 1: 'Cleanse AllAllies -> option 0.', 2: 'CauseEnchanted AllAllies -> option 1.', 3: 'IncreaseSpellPower 0.5 x Magic + 1 -> option 2 buff magic {1,0.5}.', 4: 'Cleanse AllAllies -> option 3.', 5: 'CauseEnchanted AllAllies -> option 4.' },
      branches: { 'A+(B': 'A always (conversion asserted every cast); B = Cleanse reached.', C: 'Enchant reached.', D: 'Magic reached, values 6/7/1.', E: 'Cleanse (second weight).', 'F)': 'Enchant (second weight).' },
    },
    'troop:7297': {
      en: en('troop:7297'), native: nat(8898),
      rule: [GEMS, 'Heroic Gems help centre: Spirit Gems take the colour of the converted gems.'],
      dims: {
        'identity-cost-colors': v('troop 7297 -> spell 8898; raw ManaCost 13 = native Cost 13; colours Red+Purple.'),
        'target-count-range': na('No unit target.'),
        'base-formula-rounding': v('ConvertGems Amount 100: every Yellow gem (16).'),
        'boost-source-ratio-cap': NOBOOST, 'conditions-probabilities-branches': v('Player Choose ABC / DEF (0/1/null).'),
        'status-duration-immunity': NOSTAT,
        'gems-types-selection-resolution': v('Branch 0: 16 Yellow -> spiritGem; branch 1: 16 Yellow -> skull; no-Yellow board -> no transform.'),
        'summon-transform-pools': NOSUM, 'order-death-retargeting': v('Single step per branch.'),
        'mana-economy-extra-turn': v('Caster mana 0; no extra turn; turn passes.'),
        'display-description': v("Chinese '选择一项：将所有黄色宝石转化为灵魂宝石；或将所有黄色宝石转化为骷髅。' matches English."),
        'battle-pipeline': PIPE_CHOOSE,
      },
      clauses: { c1: 'Branch 0: all Yellow -> Spirit Gems.', c2: 'Branch 1: all Yellow -> Skulls.' },
      steps: { 0: 'ConvertGems Yellow -> Spirit -> transform Yellow spiritGem (source colour).', 3: 'ConvertGems Yellow -> Skull -> transform Yellow SKULL.' },
      branches: { ABC: 'Branch 0 both sides.', DEF: 'Branch 1 both sides + empty case.' },
    },
    'troop:7570': {
      en: en('troop:7570'), native: nat(9366),
      rule: [['rule', 'official-shared-rule', R001, 'R001: native order inside each branch (Blue->Green then Red->Skull; Brown->Green then Purple->Skull).']],
      dims: {
        'identity-cost-colors': v('troop 7570 -> spell 9366; raw ManaCost 18 = native Cost 18; colours Green+Yellow.'),
        'target-count-range': na('No unit target.'),
        'base-formula-rounding': v('Amount 100: every gem of the source colour (16 each).'),
        'boost-source-ratio-cap': NOBOOST, 'conditions-probabilities-branches': v('Player Choose ABC / DEF (0/1/null).'),
        'status-duration-immunity': NOSTAT,
        'gems-types-selection-resolution': v('Branch 0: 16 Blue->Green + 16 Red->Skull; branch 1: 16 Brown->Green + 16 Purple->Skull; other colours untouched.'),
        'summon-transform-pools': NOSUM, 'order-death-retargeting': v('Transform events follow native order within the branch.'),
        'mana-economy-extra-turn': v('Caster mana 0; no extra turn; turn passes.'),
        'display-description': v("Chinese '选择一项：将蓝色宝石转化为绿色宝石，红色宝石转化为骷髅；或将棕色宝石转化为绿色宝石，紫色宝石转化为骷髅。' matches English."),
        'battle-pipeline': PIPE_CHOOSE,
      },
      clauses: { c1: 'Branch 0: Blue -> Green, Red -> Skulls.', c2: 'Branch 1: Brown -> Green, Purple -> Skulls.' },
      steps: { 0: 'ConvertGems Blue->Green.', 1: 'ConvertGems Red->Skull.', 3: 'ConvertGems Brown->Green.', 4: 'ConvertGems Purple->Skull.' },
      branches: { ABC: 'Branch 0 both sides.', DEF: 'Branch 1 both sides.' },
    },
    'troop:7326': {
      en: en('troop:7326'), native: nat(8938),
      rule: [STATUS, 'Official status list: positive statuses Barrier, Blessed, Enchanted, Enrage, Reflect, Submerged (the RandomPositiveStatusEffect pool; fixed this round L2-random-status-pools).'],
      extra: [R4],
      dims: {
        'identity-cost-colors': v('troop 7326 -> spell 8938; raw ManaCost 16 = native Cost 16; colours Green+Brown.'),
        'target-count-range': v('AllAllies: each living ally (caster incl.) rolls its own status; dead ally and enemies none.'),
        'base-formula-rounding': v('Conversions: every Blue (16) -> Green, every Purple (16) -> Yellow.'),
        'boost-source-ratio-cap': NOBOOST,
        'conditions-probabilities-branches': v('Steps 100% / 50% / 25%: 1-3 applications; >=2 in 140..260 of 400 casts; 3 reached. Each of the 6 positives drawn 65..135 of 600 first draws (no rage alias).'),
        'status-duration-immunity': v('Only official positive ids applied (status-apply events); Blessed blocks later draws on the same ally (engine rule).'),
        'gems-types-selection-resolution': v('Blue->Green then Purple->Yellow.'),
        'summon-transform-pools': v('Status pool = 6 official positives, equal odds.'),
        'order-death-retargeting': v('Conversions then the three status steps (native order).'),
        'mana-economy-extra-turn': v('Caster mana 0; no extra turn; turn passes.'),
        'display-description': v("Chinese '将蓝色宝石转换成绿色，紫色宝石转换成黄色。给予所有盟友 1-3 个随机正面增益状态效果。' matches English (native RandomPositiveStatusEffect)."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'Blue -> Green and Purple -> Yellow.', c2: '1-3 random positive statuses to every ally (100/50/25%).' },
      steps: { 0: 'ConvertGems Blue->Green.', 1: 'ConvertGems Purple->Yellow.', 2: 'RandomPositiveStatusEffect AllAllies -> randomStatus pool positive.', 3: 'PercentageChance 50 -> chance 0.5.', 4: 'PercentageChance 25 -> chance 0.25.' },
      branches: { main: 'Single branch; both sides, seeds, lone caster, 3 allies.' },
    },
  },
};
