const T = 'tests/unit/gowLaneL4bB04.test.ts';
const STATUS = 'artifacts/gow-skill-audit/gold-primary-sources/official-status-effects.html';
const GEMS = 'artifacts/gow-skill-audit/gold-primary-sources/official-heroic-gems-freshdesk.html';
const R001 = 'tasks/active/gow-skill-shards/rulings/R001-native-step-order.md';
const en = id => `Entity ${id} SpellId/English text/ManaCost/ManaColors asserted verbatim in ${T}.`;
const nat = sp => `SpellId ${sp} Cost and every SpellSteps field (ordered, toEqual) asserted in ${T}.`;
const na = n => ['not-applicable', n];
const v = n => ['verified', n];
const MANA = v('Caster mana 0 after cast except cascade mana-gain events; no skill extra turn; one action-log entry; turn passes (or cascade 4+/5 extra turn only).');
const PIPE = v('Real TurnEngine.castSkill on both sides (Left/Right); low mana (cost-1) and Silence refuse without spending mana or touching board/statuses/turn.');
const WPIPE = alias => v(`Real TurnEngine.castSkill via both aliases (numeric, ${alias}) on both sides; low mana and Silence refuse without spending mana or touching board/statuses/turn.`);
export default {
  testFile: T,
  reviews: {
    'troop:6590': {
      en: en('troop:6590'), native: nat(7794),
      rule: [STATUS, 'official-status-effects.html: Enraged status (skull damage boost); stored as rage, recognised by isEnraged (RAGE_STATUS_IDS alias).'],
      dims: {
        'identity-cost-colors': v('troop 6590 -> spell 7794; raw ManaCost 12 = native Cost 12; colours Red+Yellow; spell.id binding asserted.'),
        'target-count-range': v('FrontAlly for both steps -> allyFront: caster when front, the ally in front of it otherwise; dead front skipped; other allies and enemies untouched.'),
        'base-formula-rounding': v('IncreaseHealth Amount 1 x Magic -> [Magic+1] Life gain (maxHp/hp) for magic 0 and 10.'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': na('No condition/chance.'),
        'status-duration-immunity': v('rage (Enraged) status-apply turns 3 on the front ally; isEnraged true.'),
        'gems-types-selection-resolution': v('ConvertGems Green -> Brown Amount 100: all 16 Green become Brown.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Event order gem-transform -> status-apply -> buff = native steps 0/1/2; dead front ally retargets.'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将所有绿色宝石转换成棕色。赋予第一名盟友狂怒效果，并给予其 [魔法 + 1] 点生命值。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'All Green converted to Brown (16).', c2: 'Front ally Enraged and gains [Magic+1] Life; same target for both.' },
      steps: {
        0: 'ConvertGems Green->Brown Amount 100 -> transform Green to Brown.',
        1: 'CauseEnraged FrontAlly -> status rage allyFront.',
        2: 'IncreaseHealth FrontAlly Amount 1 x Magic -> buff hp allyFront {1,1} gain.',
      },
      branches: { main: 'Single branch; front caster / front ally / dead front covered.' },
    },
    'troop:6535': {
      en: en('troop:6535'), native: nat(7729),
      rule: [STATUS, 'official-status-effects.html: Poison deals damage at turn start (tick observed on the poisoned enemy only); Blessed troops are immune to status effects.'],
      dims: {
        'identity-cost-colors': v('troop 6535 -> spell 7729; raw ManaCost 12 = native Cost 12; colours Blue+Green; spell.id binding asserted.'),
        'target-count-range': v('RandomEnemy -> enemyRandom: exactly one living enemy; dead enemy never chosen over 30 seeds; more than one distinct enemy across seeds.'),
        'base-formula-rounding': na('No skill damage/formula; native step 2 Damage has PercentageChance 0 (never fires) and no Target/Amount.'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': v('Native Damage step PercentageChance 0 is inert: prototype omits it and no skill-damage event occurs in any case.'),
        'status-duration-immunity': v('poison turns 3 (magnitude 3, shared status rule) on one enemy; Blessed lone enemy resists.'),
        'gems-types-selection-resolution': v('ConvertGems Brown -> Red Amount 100: all 16 Brown become Red.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('convert then Poison (native order); random target excludes the dead.'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将所有棕色宝石转换成红色。使一名随机敌人陷入中毒状态。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'All Brown converted to Red (16).', c2: 'Exactly one random living enemy Poisoned.' },
      steps: {
        0: 'ConvertGems Brown->Red Amount 100 -> transform Brown to Red.',
        1: 'CausePoison RandomEnemy Amount 1 -> status poison enemyRandom.',
        2: 'Damage PercentageChance 0 (no Target/Amount) -> never fires; verified no skill-damage events.',
      },
      branches: { main: 'Single branch; seeds 1/42 both sides, 30-seed dead-enemy sweep, Blessed.' },
    },
    'troop:6298': {
      en: en('troop:6298'), native: nat(7448),
      rule: [STATUS, 'official-status-effects.html: Barrier blocks the next instance of damage (no time limit per R002); applied only to allied Beasts.'],
      dims: {
        'identity-cost-colors': v('troop 6298 -> spell 7448; raw ManaCost 18 = native Cost 18; colours Green+Yellow; spell.id binding asserted.'),
        'target-count-range': v('AllyType Data beast -> allyAll + targetRace Beast: living allies with Beast in troopTypes (incl. dual type, incl. the caster); non-Beasts, dead Beasts and enemy Beasts untouched.'),
        'base-formula-rounding': na('No numeric formula.'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': na('No condition/chance.'),
        'status-duration-immunity': v('barrier status-apply turns 3 (event) on each Beast ally.'),
        'gems-types-selection-resolution': v('Two all-of-colour conversions: 16 Purple -> plain Skull, then 16 Brown -> Green.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Two gem-transform events in native order (Purple->Skull, Brown->Green) before the Barrier statuses.'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将紫色宝石转换为骷髅头，并将棕色宝石转换为绿色。赋予野兽盟友屏障效果。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'Purple -> Skulls then Brown -> Green, all gems of each.', c2: 'Barrier on living allied Beasts only.' },
      steps: {
        0: 'ConvertGems Purple->Skull Amount 100 -> transform Purple to SKULL.',
        1: 'ConvertGems Brown->Green Amount 100 -> transform Brown to Green.',
        2: 'CauseBarrier AllyType beast -> status barrier allyAll targetRace Beast.',
      },
      branches: { main: 'Single branch; mixed races, Beast caster, dead Beast, no Beast.' },
    },
    'troop:7347': {
      en: en('troop:7347'), native: nat(8975),
      rule: [GEMS, 'Heroic Gems (Infinity Plus 2 help centre): Death Mark Gems are colourless and inflict Death Mark on a random enemy when destroyed; Doomskull is the skull-family explosive gem. Created types: deathMarkGem (unmatchable, null join key), doomSkull (skull join key).'],
      extra: [['r001', 'user-ruling', R001, 'R001: native order; Delay 800 is presentation timing only.']],
      dims: {
        'identity-cost-colors': v('troop 7347 -> spell 8975; raw ManaCost 15 = native Cost 15; colours Blue+Purple; spell.id binding asserted.'),
        'target-count-range': na('No troop target; Death Mark is only inflicted later if a Death Mark Gem is destroyed (shared gem rule).'),
        'base-formula-rounding': v('ConvertGems Purple Amount 2: exactly 2 distinct Purple cells (14 Purple remain) for seeds 1/42; only 1 available -> 1.'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': na('No condition/chance; which 2 Purple cells is seeded random.'),
        'status-duration-immunity': na('No status applied by the cast itself (no status-apply events).'),
        'gems-types-selection-resolution': v('Step 0 -> special deathMarkGem (colourless/unmatchable); step 1 all 16 Yellow -> doomSkull (skull join key).'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Two gem-transform events in native order (Purple->Death Mark first, Yellow->Doomskull second).'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将 2 颗紫色宝石转换成死亡标记宝石。将所有黄色宝石转换成末日骷髅头。' matches English."),
        'battle-pipeline': PIPE,
      },
      clauses: { c1: 'Exactly 2 random Purple -> Death Mark Gems.', c2: 'All Yellow -> Doomskulls (skipped when none).' },
      steps: {
        0: 'ConvertGems Purple->DeathMark Amount 2 Delay 800 -> transform Purple to deathMarkGem count 2.',
        1: 'ConvertGems Yellow->Doomskull Amount 100 -> transform Yellow to doomSkull (all).',
      },
      branches: { main: 'Single branch; seeds 1/42 both sides, single Purple, no Yellow.' },
    },
    'weapon:1532': {
      en: `Weapon 1532 (Lodestar) spell id 9031, English text, ManaCost 14, ManaColors Purple+Brown asserted from gowhead weapons.json in ${T}.`,
      native: nat(9031),
      rule: [GEMS, 'Heroic Gems (Infinity Plus 2 help centre): Booty Gems cannot be matched, have no mana colour and give 10 Gold when destroyed; Doomskull skull-family explosive. Created bootyGem has null join key.'],
      dims: {
        'identity-cost-colors': v('weapon 1532 -> spell 9031; gowhead ManaCost 14 = native Cost 14; colours Purple+Brown; src weapons.json id/referenceName Lodestar/manaCost/manaColors/spell.id; numeric 9031 and gw_Lodestar aliases resolve to the same prototype.'),
        'target-count-range': na('No troop target.'),
        'base-formula-rounding': v('ConvertGems Green Amount 3: exactly 3 Booty from 16 Green; only 2 Green -> both converted.'),
        'boost-source-ratio-cap': na('No boost/ratio/cap.'),
        'conditions-probabilities-branches': na('No condition/chance.'),
        'status-duration-immunity': na('No status.'),
        'gems-types-selection-resolution': v('Step 0 -> special bootyGem (unmatchable); step 1 all 16 Yellow -> doomSkull.'),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Two gem-transform events in native order (Booty first, then Doomskulls; Delay 400 timing only).'),
        'mana-economy-extra-turn': MANA,
        'display-description': v("Chinese '将 3 颗绿色宝石转换成赃物宝石。再将所有黄色宝石转换成末日骷髅头。' matches English."),
        'battle-pipeline': WPIPE('gw_Lodestar'),
      },
      clauses: { c1: 'Exactly 3 Green -> Booty Gems (fewer if fewer Green).', c2: 'Then all Yellow -> Doomskulls.' },
      steps: {
        0: 'ConvertGems Green->Booty Amount 3 Delay 400 -> transform Green to bootyGem count 3.',
        1: 'ConvertGems Yellow->Doomskull Amount 100 -> transform Yellow to doomSkull.',
      },
      branches: { main: 'Single branch; both aliases/sides, fewer-than-3 Green.' },
    },
  },
};
