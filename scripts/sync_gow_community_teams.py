"""Download public community workbooks and export inspectable, source-addressed rows.
Run: python scripts/sync_gow_community_teams.py [--offline]
No macros/formulas are executed. Only cached cell values are read; original XLSX retained.
"""
import argparse
import csv
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data/reference/gow-community'
SOURCES = [
    ('team-share', '18sdL8LGFqWBzjYUtQOkz4QTaBXVj5r7BTJNlFPO6-GQ', 64722, ['Teams', 'Team Submissions']),
    ('delve-teams', '1qtzm4c7CXyVE4WBDqZO6Np5Yq0hfsU_hhxAztva1HP4', 51929, ['Delve Teams']),
]
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

def read_workbook(path):
    with zipfile.ZipFile(path) as z:
        strings = [''.join(e.itertext()) for e in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)] if 'xl/sharedStrings.xml' in z.namelist() else []
        rels = {e.get('Id'): e.get('Target') for e in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        result = {}
        for sheet in ET.fromstring(z.read('xl/workbook.xml')).findall('m:sheets/m:sheet', NS):
            target = rels[sheet.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id')]
            target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            rows = []
            for row in ET.fromstring(z.read(target)).findall('m:sheetData/m:row', NS):
                cells = {}
                for cell in row:
                    value = cell.find('m:v', NS)
                    text = value.text if value is not None else ''
                    if cell.get('t') == 's': text = strings[int(text)]
                    elif cell.get('t') == 'inlineStr': text = ''.join(cell.find('m:is', NS).itertext())
                    if text: cells[re.sub(r'\d+', '', cell.get('r'))] = text
                if cells: rows.append({'row': int(row.get('r')), 'cells': cells})
            result[sheet.get('name')] = rows
        return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--offline', action='store_true')
    offline = parser.parse_args().offline
    OUT.mkdir(parents=True, exist_ok=True)
    previous = json.loads((OUT / 'manifest.json').read_text(encoding='utf-8')) if (OUT / 'manifest.json').exists() else {}
    manifest = {'downloadedAt': previous.get('downloadedAt') if offline else dt.datetime.now(dt.timezone.utc).isoformat(), 'sources': []}
    records = []
    for key, sheet_id, topic, sheets in SOURCES:
        url = f'https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=xlsx'
        path = OUT / f'{key}.xlsx'
        forum = OUT / f'forum-{topic}.json'
        if not offline:
            for dest, source in [(path, url), (forum, f'https://community.gemsofwar.com/t/{topic}.json')]:
                data = urllib.request.urlopen(source, timeout=90).read()
                if dest.suffix == '.xlsx' and not data.startswith(b'PK'): raise ValueError('Expected XLSX')
                dest.write_bytes(data)
        posts = json.loads(forum.read_text(encoding='utf-8'))
        first = posts['post_stream']['posts'][0]
        workbook = read_workbook(path)
        counts = {}
        for sheet in sheets:
            raw_rows = workbook[sheet]
            slug = re.sub(r'[^a-z0-9]+', '-', sheet.lower()).strip('-')
            dump(OUT / f'{key}-{slug}.json', raw_rows)
            headers = raw_rows[0]['cells']
            with (OUT / f'{key}-{slug}.csv').open('w', encoding='utf-8-sig', newline='') as f:
                writer = csv.writer(f)
                writer.writerow(['source_row'] + list(headers.values()))
                for row in raw_rows[1:]: writer.writerow([row['row']] + [row['cells'].get(c, '') for c in headers])
            count = 0
            for raw in raw_rows[1:]:
                row, c = raw['row'], raw['cells']
                cols = ['Z', 'AG', 'AN', 'AU'] if key == 'team-share' else ['I', 'J', 'K', 'L']
                if not all(c.get(col) for col in cols): continue
                count += 1
                date = c.get('B') if key == 'delve-teams' else None
                if date:
                    try: date = (dt.datetime(1899, 12, 30) + dt.timedelta(days=float(date))).date().isoformat()
                    except ValueError: pass
                records.append({
                    'id': f'{key}:{sheet}:{row}', 'workbook': path.name, 'sheet': sheet, 'row': row,
                    'sourceUrl': f'https://docs.google.com/spreadsheets/d/{sheet_id}/edit',
                    'slots': [c[col] for col in cols],
                    'heroClass': c.get('AV' if key == 'team-share' else 'H', ''),
                    'banner': c.get('AW' if key == 'team-share' else 'F', ''),
                    'teamCode': c.get('AX', '') if key == 'team-share' else '',
                    'notes': c.get('R' if key == 'team-share' else 'N', ''),
                    'tags': c.get('S', '') if key == 'team-share' else c.get('D', ''),
                    'submittedBy': c.get('AY', '') if key == 'team-share' else c.get('A', ''),
                    'date': date, 'validation': 'reference-only; not automatically enabled as NPC',
                })
            counts[sheet] = count
        manifest['sources'].append({'id': key, 'file': path.name, 'bytes': path.stat().st_size,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'exportUrl': url,
            'forumUrl': f'https://community.gemsofwar.com/t/{topic}', 'forumAuthor': first['username'],
            'forumPublishedAt': first['created_at'], 'sheetTeamCounts': counts})
    dump(OUT / 'lineups.json', records)
    dump(OUT / 'manifest.json', manifest)
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    print('Reference rows (including submissions / possible duplicates):', len(records))

if __name__ == '__main__': main()
