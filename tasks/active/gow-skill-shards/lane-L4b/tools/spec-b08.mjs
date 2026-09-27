const T = 'tests/unit/gowLaneL4bB08.test.ts';
const R003 = 'tasks/active/gow-skill-shards/rulings/R003-count-threshold-labels.md';
const RL01 = 'tasks/active/gow-skill-shards/rulings/RL4b-01-two-colour-overwrite.md';
const na = n => ['not-applicable', n];
const v = n => ['verified', n];
const KW = {
  1105: ['BoneShield', 7241, 'Blue+Red', 3020, '盖塔尔', 'Khetar', 'Purple/Brown', '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因盖塔尔盟友数而增强。每有一名盖塔尔盟友，则创造 6 颗宝石，所创造的宝石混合紫色和棕色两种颜色。 [x6]'],
  1186: ['RadiantJewel', 7662, 'Red+Purple', 3003, '潘神之谷', "Pan's Vale", 'Green/Yellow', '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因潘神之谷友数而增强。每有一名潘神之谷盟友，则创造混合绿色和黄色的 6 颗宝石。 [x6]'],
  1188: ['GlacialCrystal', 7692, 'Green+Yellow', 3011, '冰峰之巅', 'Glacial Peak', 'Blue/Purple', '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因冰峰之巅盟友数而增强。每有一名冰峰之巅盟友，则创造 6 颗宝石，所创造的宝石混合蓝色和紫色两种颜色。 [x6]'],
  1191: ['TheEdgedBlade', 7707, 'Green+Brown', 3006, '剑锋崖', "Sword's Edge", 'Blue/Yellow', '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因剑锋崖盟友数而增强。每有一名剑锋崖盟友，则创造 6 颗宝石，所创造的宝石混合蓝色和黄色两种颜色。 [x6]'],
  1234: ['PrimalAxe', 7976, 'Yellow+Brown', 3027, '狂野平原', 'Wild Plains', 'Green/Red', '对一名敌人造成 [魔法 + 7] 点伤害，伤害值因狂野平原盟友的数量而增强。每有一名狂野平原盟友，则创造混合绿色和红色的 6 颗宝石。 [x6]'],
};
function rec(id) {
  const [ref, sp, cols, kid, kz, ke, mix, zh] = KW[id];
  const draft = id === 1186;
  const dmg = `[Magic+7] + 6 per living ${ke} ally (caster included when of that kingdom): 7 / 29 for magic 0 / 10 with 0 / 2 allies; dead ${ke} ally and ${ke} enemies not counted (17 + 6 = 23 case).`;
  const clauseDmg = `[Magic+7] damage to the chosen enemy +6 per ${ke} ally.`;
  const clauseGem = `Mix of ${mix} gems, 6 per ${ke} ally (0 when none), distinct cells, both colours present.`;
  const oneClause = id === 1191 || id === 1234;
  return {
    decision: draft ? 'draft' : 'accept',
    ...(draft ? { issues: ['L4b-1186-zh'] } : {}),
    en: `Weapon ${id} (${ref}) spell id ${sp}, English text, ManaCost 14, ManaColors ${cols} asserted from gowhead weapons.json in ${T}.`,
    native: `SpellId ${sp} Cost/Target and every SpellSteps field (ordered, toEqual) asserted in ${T}.`,
    rule: [['rule', 'official-shared-rule', R003, `R003: CountArmyKingdom Amount 600 = x6 per counted ally; Data ${kid} = ${kz} (${ke}): the majority src kingdom name of raw troops with KingdomId ${kid} is asserted.`]],
    extra: [['rl01', 'user-ruling', RL01, 'RL4b-01: 2-colour creation selects N distinct cells, each one of the two colours.']],
    dims: {
      'identity-cost-colors': v(`weapon ${id} -> spell ${sp}; gowhead ManaCost 14 = native Cost 14; colours ${cols}; src weapons.json id/referenceName ${ref}/manaCost/manaColors/spell.id; numeric ${sp} and gw_${ref} aliases resolve to the same prototype.`),
      'target-count-range': v('FromTarget (spell Target Enemy) -> enemyChosen 11 only; ally id refused before mana is spent.'),
      'base-formula-rounding': v(dmg),
      'boost-source-ratio-cap': v(`multiplier a=6 alliesOfKingdom ${kz} shared by the damage and the create segments (same counter as native step 0); no cap.`),
      'conditions-probabilities-branches': na('No condition; per-gem colour choice is seeded random (RL4b-01).'),
      'status-duration-immunity': na('No status; Barrier on the target absorbs the damage, gems still created.'),
      'gems-types-selection-resolution': v(`CreateGems2Colors ${mix} UseCounterForAmount, no Amount: 6n gems on distinct cells, all ${mix}, both colours present when n > 0.`),
      'summon-transform-pools': na('No summon or troop transform.'),
      'order-death-retargeting': v('Count -> Damage -> Create (native order): skill-damage precedes the gem events.'),
      'mana-economy-extra-turn': v('Caster mana 0 after cast except cascade mana-gain events; no skill extra turn; one action-log entry; turn passes.'),
      'display-description': draft
        ? ['difference', `Chinese '${zh}' has a typo: '潘神之谷友数' drops 盟 (should read 潘神之谷盟友数). See issues.json L4b-1186-zh.`]
        : v(`Chinese '${zh}' matches English (kingdom ${kz}, [Magic + 7], mix ${mix}, [x6]).`),
      'battle-pipeline': v(`Real TurnEngine.castSkill via both aliases (${sp}, gw_${ref}) on both sides with magic 0/10; low mana and Silence refuse without spending mana or touching board/statuses/turn.`),
    },
    clauses: oneClause ? { c1: `${clauseDmg} Then ${clauseGem}`, c2: '[x6] = +6 damage and 6 gems per kingdom ally.' }
      : { c1: clauseDmg, c2: clauseGem, c3: '[x6] = +6 damage and 6 gems per kingdom ally.' },
    steps: {
      0: `CountArmyKingdom AllAllies Data ${kid} Amount 600 -> alliesOfKingdom ${kz} x6.`,
      1: 'Damage FromTarget Amount 7 x Magic UseCounterForAmount -> damage enemyChosen {7,1} + modifier.',
      2: `CreateGems2Colors ${mix} UseCounterForAmount -> create mix base 0 + modifier.`,
    },
    branches: { main: 'Single branch; aliases x sides x (magic, allies), caster-of-kingdom, dead ally, enemy of kingdom, Barrier, illegal target.' },
  };
}
export default { testFile: T, reviews: Object.fromEntries(Object.keys(KW).map(id => [`weapon:${id}`, rec(Number(id))])) };
