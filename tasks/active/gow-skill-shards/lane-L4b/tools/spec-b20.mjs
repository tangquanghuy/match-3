const T1 = 'tests/unit/gowLaneL4bB01.test.ts';
const T2 = 'tests/unit/gowLaneL4bB02.test.ts';
const STATUS = 'artifacts/gow-skill-audit/gold-primary-sources/official-status-effects.html';
const GEMS = 'artifacts/gow-skill-audit/gold-primary-sources/official-heroic-gems-freshdesk.html';
const R001 = 'tasks/active/gow-skill-shards/rulings/R001-native-step-order.md';
const R003 = 'tasks/active/gow-skill-shards/rulings/R003-count-threshold-labels.md';
const RL01 = 'tasks/active/gow-skill-shards/rulings/RL4b-01-two-colour-overwrite.md';
const na = n => ['not-applicable', n];
const v = n => ['verified', n];
const en = (id, T) => `Entity ${id} SpellId/English text/ManaCost/ManaColors asserted verbatim in ${T}.`;
const nat = (sp, T) => `SpellId ${sp} Cost and every SpellSteps field (ordered, toEqual) asserted in ${T}.`;
const MANA = v('Caster mana 0 after cast except cascade mana-gain events; no skill extra turn; one action-log entry; turn passes (or cascade 4+/5 extra turn only).');
const PIPE = v('Real TurnEngine.castSkill on both sides (Left/Right); low mana (cost-1) and Silence refuse without spending mana or touching board/statuses/turn.');
export default {
  testFile: T1,
  reviews: {
    'troop:6751': {
      testFile: T1, en: en('troop:6751', T1), native: nat(8129, T1),
      rule: [['rule', 'official-shared-rule', GEMS, 'Heroic Gems (Infinity Plus 2 help centre): Doomskull family; Doomskulls explode surrounding gems when matched or exploded (match + ring-explosion triggers asserted).'],
        ['rule2', 'official-shared-rule', STATUS, 'official-status-effects.html: Cursed dispels positive statuses (Barrier removed case).']],
      dims: {
        'identity-cost-colors': v('troop 6751 -> spell 8129; raw ManaCost 15 = native Cost 15; colours Blue+Red; spell.id binding asserted.'),
        'target-count-range': v('CauseCursed AllEnemies -> curse enemyAll: all 4 enemies.'),
        'base-formula-rounding': na('No numeric formula.'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': na('No condition/chance.'),
        'status-duration-immunity': v('curse turns 3 on every enemy; Curse removes an enemy Barrier.'),
        'gems-types-selection-resolution': v('ConvertGems Green -> Doomskull Amount 100: exactly the 6 Green cells become doomSkull; Skulls/other colours untouched; matched (0,0..0,2) and ring-exploded (1,3) Doomskulls trigger, isolated ones stay.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Native order Curse then convert; no-Green board still curses.'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese now '诅咒所有敌人。将所有绿色宝石转换成末日骷髅头。' (round-2 fix L4b-6751-zh via gowSnapshotOverrides.json) matches English Doomskulls; asserted verbatim."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'All enemies Cursed (turns 3).', c2: 'All Green gems become Doomskulls; Doomskull match/explosion triggers asserted.' },
      steps: { 0: 'CauseCursed AllEnemies -> status curse enemyAll.', 1: 'ConvertGems Green->Doomskull Amount 100 -> transform Green to SKULL toSpecial doomSkull.' },
      branches: { main: 'Single branch; Green/no-Green boards, Skull untouched, Barrier strip.' },
    },
    'troop:7138': {
      testFile: T1, en: en('troop:7138', T1), native: nat(8687, T1),
      rule: [STATUS, 'official-status-effects.html: Enchanted (extra mana each turn, removed on cast per R002).'],
      dims: {
        'identity-cost-colors': v('troop 7138 -> spell 8687; raw ManaCost 12 = native Cost 12; colours Blue+Yellow; spell.id binding asserted.'),
        'target-count-range': v('FromTarget (spell Target Ally) -> allyChosen for all three steps (LAST_TARGET colour source); caster may target itself; enemy id refused before mana.'),
        'base-formula-rounding': v('IncreaseSpellPower Amount 3: chosen ally magic +3 (11 -> 14); CreateGems Amount 12 fixed.'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': v('Colour choice among the target\'s mana colours is seeded random, drawn ONCE per cast (round-2 fix L4b-7138-onecolour): seeds 1/7/42/99 each give 12 gems of a single Red or Purple colour.'),
        'status-duration-immunity': v('enchanted status-apply turns 3 on the chosen ally; self-target keeps Enchanted after the cast.'),
        'gems-types-selection-resolution': v('Single-colour ally -> 12 Green on non-Green cells; two-colour ally -> 12 gems all of one of Red/Purple, never converting a cell that already had that colour.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Enchant -> +3 Magic -> create (native order); colour read from the chosen ally after the buffs.'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese now '赐予一名盟友法印效果，并给予其 3 点魔力值。再创建 12 颗其法力颜色之一的宝石。' (round-2 fix L4b-7138-zh) asserted verbatim."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'Chosen ally Enchanted and +3 Magic.', c2: '12 gems of ONE of the chosen ally\'s mana colours.' },
      steps: { 0: 'CauseEnchanted FromTarget Amount 1 -> status enchanted allyChosen.', 1: 'IncreaseSpellPower FromTarget Amount 3 -> buff magic allyChosen {3,0}.', 2: 'CreateGems FromTarget Amount 12 -> create color LAST_TARGET count 12 (resolved once).' },
      branches: { main: 'Single branch; single/two-colour ally, self target, illegal enemy target.' },
    },
    'troop:7200': {
      testFile: T1, en: en('troop:7200', T1), native: nat(8787, T1),
      rule: [STATUS, 'official-status-effects.html: Enraged (skull damage boost, consumed on attack); stored as rage and recognised by every Enraged reader.'],
      extra: [['rl01', 'user-ruling', RL01, 'RL4b-01: 2-colour creation selects 22 distinct cells, each Skull or Yellow; same-colour overwrite allowed (closes L4b-7200-noop).']],
      dims: {
        'identity-cost-colors': v('troop 7200 -> spell 8787; raw ManaCost 22 = native Cost 22; colours Blue+Green+Yellow; spell.id binding asserted.'),
        'target-count-range': v('AllAllies -> allyAll (caster + 2 allies) for Enrage and Attack; enemies untouched.'),
        'base-formula-rounding': v('IncreaseAttack Amount 1 x Magic: [Magic+1] attack (17 -> 18 / 28) for magic 0/10.'),
        'boost-source-ratio-cap': na('No boost/ratio/cap in this spell; Enraged allies it creates are counted by allyStatusCount enraged readers (3) after round-2 fix L4b-7200-rage-alias.'),
        'conditions-probabilities-branches': v('Per-gem Skull/Yellow choice seeded random (RL4b-01); both types present.'),
        'status-duration-immunity': v('rage status-apply on caster and allies; isEnraged true; counted as enraged by status readers.'),
        'gems-types-selection-resolution': v('CreateGems2Colors Skull/Yellow 22: 22 distinct cells, all Skull or Yellow, both present; Yellow-bearing board: 22 distinct cells selected (RL4b-01).'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Enrage -> Attack -> create (native order).'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '使所有盟友获得狂怒效果，并给予他们 [魔法 + 1] 点攻击力。再创建 22 颗混合骷髅头和黄色宝石。' matches English; asserted verbatim."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'All allies Enraged and +[Magic+1] Attack.', c2: 'Mix of 22 Skulls and Yellow gems on distinct cells.' },
      steps: { 0: 'CauseEnraged AllAllies -> status rage allyAll.', 1: 'IncreaseAttack AllAllies Amount 1 x Magic -> buff attack allyAll {1,1}.', 2: 'CreateGems2Colors Skull/Yellow Amount 22 -> create mixAny [SKULL, Yellow] count 22.' },
      branches: { main: 'Single branch; magic 0/10 both sides, Yellow-bearing board, enraged counter.' },
    },
    'troop:6196': {
      testFile: T2, en: en('troop:6196', T2), native: nat(7337, T2),
      rule: [['rule', 'official-shared-rule', R003, 'R003 item 1: AddFor10<Color>Gems is a legacy name; the English snapshot (frozen evidence) and every same-family spell say 13 or more -> threshold 13.'],
        ['rule2', 'official-shared-rule', STATUS, "official-status-effects.html: Frozen and Hunter's Mark statuses; Barrier absorbs one instance of damage."]],
      dims: {
        'identity-cost-colors': v('troop 6196 -> spell 7337; raw ManaCost 12 = native Cost 12; colours Blue+Purple; spell.id binding asserted.'),
        'target-count-range': v('FrontEnemy for all steps -> enemyFront: first living enemy (11 when 10 dead); others untouched.'),
        'base-formula-rounding': v('Damage Amount 4 x Magic: [Magic+4] armor first (armor 3 case), 14 hp for magic 10 without armor.'),
        'boost-source-ratio-cap': v('StatusModifier AddFor10BlueGems StatusAmount 5 -> +5 Blue gems when the board has >= 13 Blue (R003): 12 -> none, 13 -> 5, 16 -> 5.'),
        'conditions-probabilities-branches': v('boardAtLeast Blue 13 condition: false at 12 (no gems, statuses + damage still resolve), true at 13/16.'),
        'status-duration-immunity': v('frozen and marked turns 3 on the front enemy; statuses kept when Barrier absorbs the hit.'),
        'gems-types-selection-resolution': v('Exactly 5 Blue created on non-Blue cells when the condition holds.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Freeze -> Mark -> Damage -> conditional create (native order); lethal hit still creates the Blue gems; dead front retargets.'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '冻结第一名敌人并使其陷入猎人标记状态。对其造成 [魔法 + 4] 点伤害。如果板面上有 13 颗或更多蓝色宝石，则再创造 5 颗蓝色宝石。' matches English (13 or more)."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: "Front enemy Frozen and Hunter's Marked.", c2: '[Magic+4] damage to the same enemy.', c3: '>= 13 Blue on board -> 5 more Blue (R003 threshold 13).' },
      steps: { 0: 'CauseFrozen FrontEnemy Amount 1 -> status frozen enemyFront.', 1: 'CauseHuntersMark FrontEnemy Amount 1 -> status marked enemyFront.', 2: 'Damage FrontEnemy Amount 4 x Magic -> damage enemyFront {4,1}.', 3: 'CreateGems Blue StatusModifier AddFor10BlueGems StatusAmount 5 -> create Blue 5 ifCond boardAtLeast Blue 13 (R003).' },
      branches: { main: 'Single branch; 12/13/16 Blue, dead front, lethal, Barrier.' },
    },
    'troop:6068': {
      testFile: T2, en: en('troop:6068', T2), native: nat(7138, T2),
      rule: [STATUS, 'official-status-effects.html: Poison deals damage at turn start.'],
      extra: [['r001', 'user-ruling', R001, 'R001: native CausePoison precedes Damage; prototype fixed in round 2 (L4b-6068-order) so a troop killed by the hit was Poisoned first.']],
      dims: {
        'identity-cost-colors': v('troop 6068 -> spell 7138; raw ManaCost 16 = native Cost 16; colours Blue+Green; spell.id binding asserted.'),
        'target-count-range': v('AllEnemies -> enemyAll for Poison and Damage (4 enemies).'),
        'base-formula-rounding': v('Damage [Magic] (SpellPowerMultiplier 1, no Amount): 10 per enemy (armor 4 -> 994), 0 for magic 0.'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': na('No condition/chance.'),
        'status-duration-immunity': v('poison turns 3 (magnitude 3, shared rule) on every enemy, applied before the hit.'),
        'gems-types-selection-resolution': v('CreateGems Green Amount 9: 9 Green on non-Green cells.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Native order Poison -> Damage -> create: status-apply precedes skill-damage; an enemy killed by the hit had been Poisoned (10,11,12,13 all receive status-apply).'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '对所有敌人造成 [魔法] 点伤害，并使他们陷入中毒状态。创造 9 颗绿色宝石。' matches English (clause order is English; execution follows native R001)."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: '[Magic] damage to all enemies and Poison them (Poison applied first per native order).', c2: '9 Green gems created.' },
      steps: { 0: 'CausePoison AllEnemies -> status poison enemyAll (first).', 1: 'Damage AllEnemies x Magic -> damage enemyAll {0,1} range all.', 2: 'CreateGems Green Amount 9 -> create Green 9.' },
      branches: { main: 'Single branch; magic 0/10 both sides, lethal hit, order case.' },
    },
  },
};
