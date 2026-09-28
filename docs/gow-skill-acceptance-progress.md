# GoW skill signoff progress

Generated: 2026-09-28T16:17:01.687Z; source fingerprint: 88f4b966b6406dcdd09f393ca85479c6499c8b01a2a01338ee926cb2bce25b6f.
Baseline: stored English and native spell snapshots, not a live official API.

| Item | Count |
|---|---:|
| Original troops | 1800 |
| Original weapons | 718 |
| Custom excluded | 13 |
| Original entities | 2518 |
| Accepted whole skills | 1877 / 2518 |
| Review records | 1985 |
| Eligible reviews | 1877 |
| Confirmed difference entities | 3 |
| Remaining pending reviews | 638 |

Full regression: 14977 passed, 0 failed; TypeScript exit code 0.

## Evidence and limitations

- Per-entity reviews: `data/audit/gow-skill-reviews.json`; drafts are not accepted.
- Full acceptance requires matching source digest, independent English/native source, file hashes, all 12 dimensions, every native step and branch, real-cast tests and a passing same-fingerprint regression.
- Mode- and ascension-dependent exclusions must be scoped to actual source clauses.
- Partial battle probes and scoped checks never promote an entity to whole-skill accepted.

## Confirmed differences

| Entity | Spell | Expected from snapshot | Runtime |
|---|---:|---|---|
| troop 7468 | 9185 | English source describes Blue Gems for both extra-turn branches. | Both native CountGems steps specify Yellow; runtime currently follows native steps. |
| troop 7724 | 9716 | Direct Life modes in depth-first order: gain, gain. IncreaseHealth/IncreaseAllStats grows current and maximum Life; Heal restores current Life only. | Runtime modes: legacy-capped-heal, legacy-capped-heal. |
| weapon 1498 | 8869 | English source describes only other Allies. | Native CauseBarrier targets AllAllies; runtime currently follows description. |

## Files

- `artifacts/gow-skill-audit/review.html`: searchable entity listing.
- `artifacts/gow-skill-audit/checklist.csv`: sortable entity list.
- `artifacts/gow-skill-audit/ledger.json`: source, source clauses, runtime, review failures and fingerprint.
- `artifacts/gow-skill-audit/probes.json`: scoped cast probes.

```powershell
node scripts/verify-gow-snapshot.mjs
node scripts/audit-gow-skills.mjs
node scripts/audit-gow-skills.mjs --check
```
