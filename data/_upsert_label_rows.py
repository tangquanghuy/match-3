import csv
from pathlib import Path

out = Path('data/spine_effect_labels_0168_0334.csv')
scan = Path('data/_scan_0168_0334.tsv')
pending = Path('data/_pending_label_rows.txt')
with out.open('r', encoding='utf-8-sig', newline='') as f:
    reader = csv.DictReader(f)
    fields = reader.fieldnames
    old = {row['编号']: row for row in reader}
assert fields and len(fields) == 15
sources = {}
for line in scan.read_text(encoding='utf-8').splitlines():
    n, status, names, count = line.split('\t')
    sources[n] = names
for line in pending.read_text(encoding='utf-8').splitlines():
    if not line.strip():
        continue
    parts = line.split('|')
    assert len(parts) == 14, (parts[0], len(parts))
    n, values = parts[0], parts[1:]
    assert n in sources and sources[n] != '-'
    assert all(values) and not any('?' in v for v in values), n
    old[n] = dict(zip(fields, [n, sources[n], *values]))
nums = sorted(old)
rows = [old[n] for n in nums]
with out.open('w', encoding='utf-8-sig', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)
print(f'Upserted {len(rows)} data rows.')
