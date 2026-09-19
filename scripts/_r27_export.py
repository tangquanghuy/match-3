# 一次性：导出真正未组装的技能（在某个批次 skipped 里、且没有任何批次组装它）
import json, re, glob, os

troops = json.load(open('src/data/troops.json', encoding='utf-8'))
spell_by_id = {}
troop_by_spell = {}
for t in troops:
    if t.get('spell'):
        sid = t['spell']['id']
        spell_by_id[sid] = t['spell']['description']
        troop_by_spell[sid] = t.get('name', '?')

# 所有批次文件里组装过的 id（`id: NNNN,` 出现在 spells 数组里；粗略用 desc/build 行来判断）
assembled = set()
skipped = {}
entry_re = re.compile(r"\{\s*id:\s*(\d+)\s*,\s*reason:\s*'((?:[^'\\]|\\.)*)'\s*,?\s*\}")
for f in glob.glob('src/engine/skills/curated/batch-*.ts'):
    src = open(f, encoding='utf-8').read()
    # skipped 条目
    for m in entry_re.finditer(src):
        sid = int(m.group(1))
        skipped.setdefault(sid, (os.path.basename(f), m.group(2)))
    # 组装条目：形如 "  { id: 1234," 或 "    id: 1234,"（在 spells 数组内）
    for m in re.finditer(r'\{\s*id:\s*(\d+)\s*,\s*desc:', src):
        assembled.add(int(m.group(1)))

library = open('src/engine/skills/library.ts', encoding='utf-8').read()

remaining = sorted(set(skipped) - assembled)
print(f'SKIP 记录 {len(skipped)} 条，其中已组装 {len(set(skipped) & assembled)}，真正未组装 {len(remaining)}')

os.makedirs('tmp', exist_ok=True)
with open('tmp/remaining_r27.json', 'w', encoding='utf-8') as f:
    json.dump([
        {'id': s, 'desc': spell_by_id.get(s, '(desc缺失)'), 'troop': troop_by_spell.get(s, '?'),
         'skipBatch': skipped[s][0], 'skipReason': skipped[s][1]}
        for s in remaining
    ], f, ensure_ascii=False, indent=1)
