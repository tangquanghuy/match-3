// Signoff spec builder for race-x6 weapons (CountArmyType; Deal [Magic+7] boosted by <Type> Allies, mix of 6 A/B per ally).
import fs from 'node:fs';
const R003 = 'tasks/active/gow-skill-shards/rulings/R003-count-threshold-labels.md';
const RL01 = 'tasks/active/gow-skill-shards/rulings/RL4b-01-two-colour-overwrite.md';
const l = JSON.parse(fs.readFileSync('artifacts/gow-skill-audit/ledger.json', 'utf8'));
const rows = new Map(l.rows.map(r => [r.key, r]));
const W = JSON.parse(fs.readFileSync('src/data/weapons.json', 'utf8'));
const na = n => ['not-applicable', n];
const v = n => ['verified', n];
export default function build(nn, ids, drafts = {}) {
  const T = `tests/unit/gowLaneL4bB${nn}.test.ts`;
  const reviews = {};
  for (const id of ids) {
    const r = rows.get(`weapon:${id}`); const x = W.find(w => w.id === id);
    const st = r.source.native.SpellSteps; const sp = r.spellId; const ref = x.referenceName;
    const cols = x.manaColors.join('+'); const kid = st[0].Data;
    const kz = r.runtime.prototype.segments[0].modifier.source.race;
    const ke = r.source.englishDescription.match(/boosted by (.+?) Allies/)[1];
    const mix = `${st[2].Color1}/${st[2].Color2}`; const zh = x.spell.description;
    const draft = drafts[id];
    const clauseIds = r.sourceClauses.map(c => c.id);
    const clauseDmg = `[Magic+7] damage to the chosen enemy +6 per ${ke} ally.`;
    const clauseGem = `Mix of ${mix} gems, 6 per ${ke} ally (0 when none), distinct cells, both colours present.`;
    const ratio = '[x6] = +6 damage and 6 gems per ally of that type.';
    const clauses = clauseIds.length === 2 ? { c1: `${clauseDmg} Then ${clauseGem}`, c2: ratio } : { c1: clauseDmg, c2: clauseGem, c3: ratio };
    reviews[`weapon:${id}`] = {
      decision: draft ? 'draft' : 'accept',
      ...(draft ? { issues: [draft.issue] } : {}),
      en: `Weapon ${id} (${ref}) spell id ${sp}, English text, ManaCost ${x.manaCost}, ManaColors ${cols} asserted from gowhead weapons.json in ${T}.`,
      native: `SpellId ${sp} Cost/Target and every SpellSteps field (ordered, toEqual) asserted in ${T}.`,
      rule: [['rule', 'official-shared-rule', R003, `R003: CountArmyType Amount 600 = x6 per counted ally; Data ${kid} = troopType ${kz} (${ke}; asserted to exist on src troops).`]],
      extra: [['rl01', 'user-ruling', RL01, 'RL4b-01: 2-colour creation selects N distinct cells, each one of the two colours.']],
      dims: {
        'identity-cost-colors': v(`weapon ${id} -> spell ${sp}; gowhead ManaCost ${x.manaCost} = native Cost; colours ${cols}; src weapons.json id/referenceName ${ref}/manaCost/manaColors/spell.id; numeric ${sp} and gw_${ref} aliases resolve to the same prototype.`),
        'target-count-range': v('FromTarget (spell Target Enemy) -> enemyChosen 11 only; ally id refused before mana is spent.'),
        'base-formula-rounding': v(`[Magic+7] + 6 per living ${ke} ally (caster counted when of that type; dual-type ally counted): 7 / 29 for magic 0 / 10 with 0 / 2 allies; 23 with caster-of-type only.`),
        'boost-source-ratio-cap': v(`multiplier a=6 alliesOfRace ${kz} on damage and create (same counter as native step 0${st[0].UseCounterForAmount ? '; its UseCounterForAmount flag on the first counter has nothing to accumulate' : ''}); dead ally / enemy of that type not counted; no cap.`),
        'conditions-probabilities-branches': na('No condition; per-gem colour choice is seeded random (RL4b-01).'),
        'status-duration-immunity': na('No status; Barrier on the target absorbs the damage, gems still created.'),
        'gems-types-selection-resolution': v(`CreateGems2Colors ${mix} (no Amount): 6n gems on distinct cells, all of the two colours, both present when n > 0; prototype colour order is irrelevant (set equality asserted).`),
        'summon-transform-pools': na('No summon or troop transform.'),
        'order-death-retargeting': v('Count -> Damage -> Create (native order): skill-damage precedes the gem events.'),
        'mana-economy-extra-turn': v('Caster mana 0 after cast except cascade mana-gain events; no skill extra turn; one action-log entry; turn passes.'),
        'display-description': draft ? ['difference', draft.display] : v(`Chinese '${zh}' matches English (type ${kz}, [Magic + 7], mix ${mix}, [x6]).`),
        'battle-pipeline': v(`Real TurnEngine.castSkill via both aliases (${sp}, gw_${ref}) on both sides with magic 0/10; low mana and Silence refuse without spending mana or touching board/statuses/turn.`),
      },
      clauses,
      steps: {
        0: `CountArmyType AllAllies Data ${kid} Amount 600 -> alliesOfRace ${kz} x6.`,
        1: 'Damage FromTarget Amount 7 x Magic UseCounterForAmount -> damage enemyChosen {7,1} + modifier.',
        2: `CreateGems2Colors ${mix} UseCounterForAmount -> create mix base 0 + modifier.`,
      },
      branches: { main: 'Single branch; aliases x sides x (magic, allies), caster-of-type, dead ally, enemy of that type, Barrier, illegal target.' },
    };
  }
  return { testFile: T, reviews };
}
