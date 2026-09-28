# sa-Q progress: requeue-r6 re-review (165 keys, branch gow/r6-requeue @ gow-review-base-9)

Method per batch (grouped by changedBy issue): `gow-signoff show` + `gow-golden show`, changelog entry read, English +
native SpellSteps vs final prototype, kingdom ids (curated numeric id == native step Data id), behaviour probe with
`castSpell`, then `gow-signoff accept --by sa-Q --note "re-review after <issue>"` with test = `gowFix<issue>.test.ts`
when it exists, else `gowCastGolden.test.ts`. `gow-golden diff` (all lanes) at start: 0 changed scenario lines.

- B01 P-E-faction-kingdom (55): native CountArmyKingdom / AllyKingdom Data id == prototype numeric kingdom for all 55;
  summon pools (SummoningKingdom) == troops of that kingdomId; probe: raw-id ally triggers, same-zh faction ally (3999)
  does not, zh-name-only ally matches parent. accept 55 (L1 31, L7 16, L5 5, L4b 2, L4a 1), issue 0.
