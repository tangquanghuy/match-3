# Direct Life gain / healing review ? 2026-09-26

## Scope and evidence limits

219 installed original entities have direct hp-buff segments. This review separates
native `IncreaseHealth` / `IncreaseAllStats` (Life growth) from native `Heal`
(restoration), using the independent stored native spell snapshot. It does **not**
certify the entire skill, nor random-stat gains, theft, devour, traits or ongoing
healing-status interactions. Seven custom units are excluded from the mode table.

The distinction is corroborated by observations on the official-hosted community
forum. These are historical user reports, not an official latest-version rules API:

- `https://community.gemsofwar.com/t/emperina-healing-too-much/15223/3`
  (2016-11-12): the reported behavior distinguishes increased maximum Life from
  the subsequent full heal. Native spell 7161 likewise has both action types.
- `https://community.gemsofwar.com/t/lets-talk-wording/39284/11`
  (2018-10-14): describes equal growth of current and maximum Life followed by
  healing to the increased maximum. A user explanation, not staff certification.
- `https://community.gemsofwar.com/t/sands-of-time-weapon-not-work-not-a-bug/67278/2`
  (2020-11-23): reports that a Heal-only weapon restores missing Life rather than
  adding Life when already full. Native 7284 is Heal, not IncreaseHealth.
- `https://community.gemsofwar.com/t/huge-trait-causes-life-gain-to-be-applied-as-life-healing/60838/4`
  (2020-01-20): forum account Kafka acknowledges a report of healing instead of
  increasing Life. This supports treating the concepts separately; it is not a
  certification of every Life-related trait or current-version behavior.

Retrieved directly from forum JSON endpoints on 2026-09-26. Official search tools
returned no useful results during this run; direct endpoint retrieval succeeded.

## Implementation

- `gowLifeRules.json`: depth-first direct hp-buff modes, regenerated from installed
  prototypes and independent native steps by `build-gow-life-rules.mjs`.
- `gowLifeRules.ts`: source-scoped normalization shared by troop curated batches,
  legacy overrides and numeric/equipped weapon aliases. Changed segment counts
  require review rather than silent guessed mapping.
- `lifeMode: gain`: add the same finite positive amount to current and maximum Life;
  preserve the missing-Life gap, including at full Life. Do not treat growth as
  restoration for the project's existing healing modifiers.
- Life-growth buff events carry `maxHpGain`, so the event-only narrator projection
  tracks the increased maximum before subsequent damage; live cards already refresh
  from the mutated battle state.
- `lifeMode: heal`: keep maximum Life unchanged and restore only missing Life.
  Existing bleed/disease healing modifiers are **retained, not certified** here.
- The original full-heal implementation used Infinity, allowing Infinity times
  zero to corrupt Life to NaN under the retained bleed modifier. A finite missing-
  Life amount replaces the Infinity sentinel. Status semantics still need separate
  original-rule verification.
- Dryad / tree-spirit spell 7025: both native Life steps have `Target: FromTarget`.
  Correct the Heal from self to the same selected Ally. Barrier remains on that Ally.

## Tests and remaining work

`gowLifeSemanticsAudit.test.ts` includes isolated direct-Life behavior for all 219
mode-table entries. This checks the mode and current/max Life mechanics, **not**
original amounts, targets, boosts or complete branches for every entry.

Real `TurnEngine.castSkill` representative coverage: 7063, 7025, 7161, 8857,
7756 (equipped weapon alias), 7284 and 7203. The existing weapon suite also covers
7756 and 9386, now asserting Life growth rather than the old cap.

The acceptance ledger keeps all whole-skill decisions pending. Separate reviews
are still required for Heal/bleed/disease rules, random-stat Life, theft and devour,
Life-dependent boosts, all conditional branches and complete per-entity skill
acceptance dimensions.
