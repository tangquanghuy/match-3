# GoW skill signoff progress

Generated: 2026-09-28T11:01:30.329Z; source fingerprint: 2e6bbe0b6328f941c355af0bc2dae26c359e242972a013ef0aa78810a828248c.
Baseline: stored English and native spell snapshots, not a live official API.

| Item | Count |
|---|---:|
| Original troops | 1800 |
| Original weapons | 718 |
| Custom excluded | 13 |
| Original entities | 2518 |
| Accepted whole skills | 1512 / 2518 |
| Review records | 1674 |
| Eligible reviews | 1512 |
| Confirmed difference entities | 3 |
| Remaining pending reviews | 1003 |

Full regression: 14327 passed, 0 failed; TypeScript exit code 0.

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
