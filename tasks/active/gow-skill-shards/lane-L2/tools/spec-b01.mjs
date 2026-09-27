const T = 'tests/unit/gowLaneL2B01.test.ts';
const GEMS = 'artifacts/gow-skill-audit/gold-primary-sources/official-heroic-gems-freshdesk.html';
const STATUS = 'artifacts/gow-skill-audit/gold-primary-sources/official-status-effects.html';
const R001 = 'tasks/active/gow-skill-shards/rulings/R001-native-step-order.md';
const R002 = 'tasks/active/gow-skill-shards/rulings/R002-barrier-enchant-cleanse.md';
const R004 = 'tasks/active/gow-skill-shards/rulings/R004-status-durations.md';
const en = id => `Entity ${id} SpellId/English text/ManaCost/ManaColors asserted verbatim in ${T}.`;
const nat = sp => `SpellId ${sp} Target/Cost/Randomize and every SpellSteps field (ordered, toEqual) asserted in ${T}.`;
const na = n => ['not-applicable', n];
const v = n => ['verified', n];
const d = n => ['difference', n];
const PIPE = v('Real TurnEngine.castSkill on both sides (Left/Right); low mana (cost-1) and Silence refuse without spending mana or touching board/statuses/turn.');
const PIPE_CHOOSE = v('Real TurnEngine.castSkill on both sides with FixedBranchChooser 0/1; low mana, Silence and a cancelled choice (null) refuse without spending mana or touching board/turn.');
export default {
  testFile: T,
  reviews: {
    'troop:7468': {
      decision: 'draft', issues: ['L2-7468-source'],
      en: en('troop:7468'), native: nat(9185),
      rule: [GEMS, 'Heroic Gems help centre: Blue Lightning Gem destroys its Row when matched, Yellow Lightning Gem destroys its Column (lightningRow / lightningCol).'],
      dims: {
        'identity-cost-colors': v('troop 7468 -> spell 9185; raw ManaCost 6 = native Cost 6; colour Blue; spell.id binding asserted.'),
        'target-count-range': v('No unit target; extra turn goes to the caster side (Target Self).'),
        'base-formula-rounding': v('CreateGems Amount 1: exactly one special gem per branch.'),
        'boost-source-ratio-cap': d('Chance = 7% per counted gem (CountGems Amount 700 = x7). Runtime counts plain Yellow (native Color1 Yellow); English says Blue for both branches. Source conflict, audit keeps lightning-extra-turn-source-conflict; also runtime counts after creation whereas native counts before CreateGems (a Blue Lightning may replace a Yellow). See issues L2-7468-source.'),
        'conditions-probabilities-branches': d('Player Choose ABC/DEF works (branch 0/1/null tested); the per-gem colour of the chance is a source conflict (English Blue vs native Yellow).'),
        'status-duration-immunity': na('No status.'),
        'gems-types-selection-resolution': v('Branch 0 creates exactly one lightningRow (Blue Lightning), branch 1 exactly one lightningCol (Yellow Lightning), never the other kind.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': d('Native order CountGems -> CreateGems -> ExtraTurnConditional; runtime evaluates the count at the extraTurn segment (after creation).'),
        'mana-economy-extra-turn': v('16 Yellow -> 112% -> extra turn (active side unchanged); 0 Yellow -> turn passes.'),
        'display-description': v("Chinese mirrors the English (both branches say 蓝色宝石), consistent with the English source."),
        'battle-pipeline': PIPE_CHOOSE,
      },
      clauses: { c1: 'Branch 0 creates one Blue Lightning Gem.', c2: ['difference', 'Runtime counts Yellow (native) not Blue (English); disputed.'], c3: 'Branch 1 creates one Yellow Lightning Gem.', c4: ['difference', 'Same Blue/Yellow conflict as c2.'], c5: ['difference', '[x7] = 7% per counted gem; counted colour disputed.'] },
      steps: { 0: ['difference', 'CountGems Yellow Amount 700 -> chanceBoost multiplier 7 over boardGems Yellow (read after creation).'], 1: 'CreateGems LightningBlue 1 -> lightningRow x1.', 2: 'ExtraTurnConditional UseCounterForAmount -> extraTurn chance 0 + boost.', 3: ['difference', 'As step 0.'], 4: 'CreateGems LightningYellow 1 -> lightningCol x1.', 5: 'As step 2.' },
      branches: { ABC: 'Branch 0 (FixedBranchChooser 0) on both sides.', DEF: 'Branch 1 (FixedBranchChooser 1) on both sides.' },
    },
    'weapon:1498': {
      decision: 'draft', issues: ['L2-1498-source'],
      en: en('weapon:1498'), native: nat(8869),
      rule: [R002, 'R002: Barrier has no time limit and is removed after blocking one hit.'],
      dims: {
        'identity-cost-colors': v('weapon 1498 VulpineProtector -> spell 8869 (numeric and gw_VulpineProtector); ManaCost 14 = native Cost 14; colours Blue+Green.'),
        'target-count-range': d('Branch 1: English "all other Allies" vs native CauseBarrier AllAllies (caster included). Runtime follows the English (allyOthers); audit keeps barrier-target-source-conflict. See issues L2-1498-source.'),
        'base-formula-rounding': v('IncreaseArmor Amount 1 x Magic 1: +[Magic+1] = +11 at magic 10.'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': v('Player Choose ABC (armor) / DEF (barrier); branch 0/1/null tested.'),
        'status-duration-immunity': v('Barrier on other living allies only (runtime); enemies untouched.'),
        'gems-types-selection-resolution': na('No gems.'), 'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Dead ally gets no armor.'),
        'mana-economy-extra-turn': v('Caster mana 0 after cast; no extra turn; turn passes.'),
        'display-description': v("Chinese '&& 给予所有盟友 [魔法 + 1] 点护甲值 &&给予所有其他盟友屏障效果' matches the English."),
        'battle-pipeline': PIPE_CHOOSE,
      },
      clauses: { c1: '[Magic+1] armor to every living ally incl. caster.', c2: ['difference', 'Runtime: other allies only (English); native AllAllies. Disputed.'] },
      steps: { 0: 'IncreaseArmor AllAllies 1 x Magic -> buff armor allyAll {1,1}.', 3: ['difference', 'CauseBarrier AllAllies -> runtime allyOthers (follows English).'] },
      branches: { ABC: 'Branch 0: armor.', DEF: 'Branch 1: barrier (target disputed).' },
    },
    'troop:7475': {
      en: en('troop:7475'), native: nat(9192),
      rule: [GEMS, 'Heroic Gems help centre: Blue Lightning Gem destroys its Row, Yellow Lightning Gem destroys its Column when matched.'],
      extra: [['r002', 'user-ruling', R002, 'R002: Barrier has no time limit and is removed after blocking one hit.'], ['r001', 'user-ruling', R001, 'R001: both native branches start with CauseBarrier Self; hoisting the shared Barrier before the random pick is unobservable (Barrier consumes no RNG and is identical in both branches).']],
      dims: {
        'identity-cost-colors': v('troop 7475 -> spell 9192; raw ManaCost 12 = native Cost 12; colours Blue+Purple; spell.id binding asserted.'),
        'target-count-range': v('Barrier on the caster only (Target Self); enemies never receive Barrier.'),
        'base-formula-rounding': v('CreateGems Amount 11: exactly 11 special gems in the picked branch, magic-independent.'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': v('Randomize AB-CD -> oneOf 2 options, rng.nextInt(2): each seed runs exactly one branch (11 of one kind, 0 of the other); both reachable on both sides; 200 seeds split 80..120 (even odds).'),
        'status-duration-immunity': v('Barrier applied once to the caster in either branch; expiry per R002 (no time limit).'),
        'gems-types-selection-resolution': v('Branch AB -> 11 lightningRow (Blue), branch CD -> 11 lightningCol (Yellow).'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Barrier then create in both branches (native order; shared Barrier hoisted, R001-equivalent).'),
        'mana-economy-extra-turn': v('One action-log entry; caster mana may refill only from lightning cascades; no skill extra turn.'),
        'display-description': v("Chinese '获得屏障效果。创造 11 颗蓝色闪电宝石或 11 颗黄色闪电宝石。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'Caster gains Barrier (both branches).', c2: 'Branch AB: 11 Blue Lightning Gems.', c3: 'Branch CD: 11 Yellow Lightning Gems (OR = one random branch).' },
      steps: { 0: 'CauseBarrier Self -> status barrier allySelf (hoisted).', 1: 'CreateGems LightningBlue 11 -> option 0 lightningRow x11.', 2: 'CauseBarrier Self -> same hoisted Barrier (R001-equivalent).', 3: 'CreateGems LightningYellow 11 -> option 1 lightningCol x11.' },
      branches: { AB: 'Seeds producing option 0 on both sides; frequency 80..120 / 200.', CD: 'Seeds producing option 1 on both sides.' },
    },
    'troop:6775': {
      decision: 'draft', issues: ['L2-decrease-random-pool'],
      en: en('troop:6775'), native: nat(8165),
      rule: [STATUS, 'Official status list: Cursed.'],
      dims: {
        'identity-cost-colors': v('troop 6775 -> spell 8165; raw ManaCost 9 = native Cost 9; colours Red+Purple.'),
        'target-count-range': v('Chosen enemy (Target Enemy / FromTarget) only; others untouched.'),
        'base-formula-rounding': v('Two DecreaseRandom steps of [Magic+1] = 11 each (22 total at magic 10).'),
        'boost-source-ratio-cap': na('No boost.'),
        'conditions-probabilities-branches': d('Each DecreaseRandom rolls attack/armor/magic only (debuff.ts RANDOM_REDUCE_STATS); English "random Skills" and the increase pool (buff.ts attack/armor/hp/magic) include Life. Pool undocumented; see issues L2-decrease-random-pool.'),
        'status-duration-immunity': v('Curse applied to the chosen enemy.'),
        'gems-types-selection-resolution': na('No gems.'), 'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Curse then the two reductions (native order).'),
        'mana-economy-extra-turn': v('Caster mana 0; no extra turn; turn passes.'),
        'display-description': v("Chinese '诅咒一名敌人，并从其 2 个随机技能值消除 [魔法 + 1] 点。' matches English."),
        'battle-pipeline': v('Real TurnEngine.castSkill on both sides.'),
      },
      clauses: { c1: ['difference', 'Curse + 2 x [Magic+1] reductions work; random pool excludes Life (disputed).'] },
      steps: { 0: 'CauseCursed FromTarget -> status curse enemyChosen.', 1: ['difference', 'DecreaseRandom -> reduce random (3-stat pool, disputed).'], 2: ['difference', 'Second DecreaseRandom -> times 2.'] },
      branches: { main: 'Single branch.' },
    },
    'troop:7377': {
      en: en('troop:7377'), native: nat(9017),
      rule: [STATUS, 'Official status list: Death Mark (10% chance of death at turn start; not changed by R004).'],
      extra: [['r001', 'user-ruling', R001, 'R001: native order DeathMark -> DecreaseMana -> TrueDamage is kept (Death Mark and drain land even when a Barrier blocks the damage).'], ['r004', 'user-ruling', R004, 'R004: Death Mark keeps its own rule; Cause* Amount ignored (R006 C2).']],
      dims: {
        'identity-cost-colors': v('troop 7377 -> spell 9017; raw ManaCost 24 = native Cost 24; colours Blue+Yellow+Brown.'),
        'target-count-range': v('Branch 0: chosen enemy only. Branch 1: AboveTarget + BelowTarget = every other living enemy; top chosen -> only below; bottom chosen -> only above; dead skipped; chosen untouched.'),
        'base-formula-rounding': v('[(Magic x 2) + 4]: 4 / 24 at magic 0 / 10 for both branches.'),
        'boost-source-ratio-cap': na('No boost.'),
        'conditions-probabilities-branches': v('Player Choose ABC / DEF (branch 0/1/null tested).'),
        'status-duration-immunity': v('Branch 0 Death Marks the chosen enemy only; Barrier absorbs the damage, Death Mark still lands.'),
        'gems-types-selection-resolution': na('No gems.'), 'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Native order DeathMark -> drain -> true damage; branch 1 above then below.'),
        'mana-economy-extra-turn': v('Branch 0 drains the chosen enemy mana to 0 (DecreaseMana 100%); others keep mana; caster mana 0; no extra turn.'),
        'display-description': v("Chinese '选择一项：对选定敌人施加死亡标记、耗尽其法力，并造成 [魔法 × 2 + 4] 点真实伤害；或对选定目标之外的所有其他敌人各造成 [魔法 × 2 + 4] 点伤害。' matches English."),
        'battle-pipeline': PIPE_CHOOSE,
      },
      clauses: { c1: 'Branch 0: true damage 2M+4 ignoring armor, Death Mark, drain mana.', c2: 'Branch 1: 2M+4 normal damage to every other enemy (armor absorbs).' },
      steps: { 0: 'CauseDeathMark FromTarget -> status death-mark enemyChosen.', 1: 'DecreaseMana 100 -> reduce mana drainAll.', 2: 'TrueDamage 2xMagic+4 -> damage trueDamage enemyChosen {4,2}.', 3: 'Damage AboveTarget -> enemyAboveTarget range all.', 4: 'Damage BelowTarget -> enemyBelowTarget range all.' },
      branches: { ABC: 'Branch 0 on both sides x magic 0/10 + barrier edge.', DEF: 'Branch 1 on both sides x magic, top/bottom/dead/barrier edges.' },
    },
  },
};
