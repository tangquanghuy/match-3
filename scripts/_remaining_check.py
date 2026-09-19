#!/usr/bin/env python3
"""导出现存未组装技能（SKIPPED 中不在任何 assembled 批的）"""
import json, re, glob, os

troops = json.load(open('src/data/troops.json', encoding='utf-8'))
spell_by_id = {}
for t in troops:
    if t.get('spell'):
        spell_by_id[t['spell']['id']] = t['spell']['description']

assembled = set()
for f in glob.glob('src/engine/skills/curated/batch-*.ts'):
    src = open(f, encoding='utf-8').read()
    for m in re.finditer(r'\n    id: (\d+),', src):
        assembled.add(int(m.group(1)))
lib = open('src/engine/skills/library.ts', encoding='utf-8').read()
for m in re.finditer(r'(?:^|\n)\s{2}(\d{4}): skill\(', lib, re.M):
    assembled.add(int(m.group(1)))

entry_re = re.compile(r"\{\s*id:\s*(\d+)\s*,\s*reason:\s*'((?:[^'\\]|\\.)*)'\s*\},")
skipped_ids = set()
for f in glob.glob('src/engine/skills/curated/batch-*.ts'):
    src = open(f, encoding='utf-8').read()
    for m in entry_re.finditer(src):
        skipped_ids.add(int(m.group(1)))

remaining = sorted(skipped_ids - assembled)
print(f'SKIPPED 总 {len(skipped_ids)}，已组装 {len(assembled & skipped_ids)}，真正未组装 {len(remaining)}')
for s in remaining:
    d = spell_by_id.get(s, '')
    print(f'{s} | {d[:90]}')
