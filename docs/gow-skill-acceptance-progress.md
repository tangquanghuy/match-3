# GoW skill signoff progress

Generated: 2026-09-29T05:28:04.856Z; source fingerprint: aea819c5410acd13c7a73d941e0bbcc0417abca4a77a2e6f3a3eca7efcdd5781.
Baseline: stored English and native spell snapshots, not a live official API.

| Item | Count |
|---|---:|
| Original troops | 1800 |
| Original weapons | 718 |
| Custom excluded | 13 |
| Original entities | 2518 |
| Accepted whole skills | 2518 / 2518 |
| Review records | 2518 |
| Eligible reviews | 2518 |
| Confirmed difference entities | 0 |
| Remaining pending reviews | 0 |

Full regression: 16101 passed, 0 failed; TypeScript exit code 0.

## Evidence and limitations

- Per-entity reviews: `data/audit/gow-skill-reviews.json`; drafts are not accepted.
- Full acceptance requires matching source digest, independent English/native source, file hashes, all 12 dimensions, every native step and branch, real-cast tests and a passing same-fingerprint regression.
- Mode- and ascension-dependent exclusions must be scoped to actual source clauses.
- Partial battle probes and scoped checks never promote an entity to whole-skill accepted.

## Confirmed differences

| Entity | Spell | Expected from snapshot | Runtime |
|---|---:|---|---|

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
