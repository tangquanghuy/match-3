#!/usr/bin/env python3
"""Prepare every exact-version skill for chronological visual inspection.
Preparation and automatic metrics never mark a case visually reviewed or passed.
Only derived files are written. Original recording/checkpoint files are read-only.
"""
import argparse
import datetime as dt
import json
import math
import os
import shutil
import subprocess
import time
from collections import defaultdict
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

BASELINE = 'a32448972e1f00bb73b9b4b6cf77f8b791add31120664fddc7a608c7d9970428'
DEFAULT_OUT = 'artifacts/troop-audit/skill-visual-review-20260926'


def utc():
    return dt.datetime.now(dt.timezone.utc).isoformat()


def read_json(p, fallback=None):
    try:
        return json.loads(Path(p).read_text(encoding='utf-8'))
    except FileNotFoundError:
        return fallback


def atomic_json(p, value):
    p = Path(p)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(p.name + '.tmp-' + str(os.getpid()))
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    os.replace(tmp, p)


def identity(r):
    return '|'.join(str(r.get(k, '')) for k in ('key', 'sourceHash', 'startedAt'))


def clip_bounds(row, siblings):
    """Do not include another skill in a shared-page recording."""
    offset = row.get('measurementVideoOffsetMs')
    total = (row.get('profile') or {}).get('totalMs')
    duration = (row.get('videoEvidence') or {}).get('durationMs')
    if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (offset, total, duration)):
        raise ValueError('Missing finite action offset, whole-chain time or container duration')
    start = max(0, offset / 1000 - .4)
    end = min(duration / 1000, (offset + total) / 1000 + .6)
    later = [r['measurementVideoOffsetMs'] / 1000 for r in siblings
             if isinstance(r.get('measurementVideoOffsetMs'), (int, float))
             and r['measurementVideoOffsetMs'] > offset]
    if later:
        end = min(end, min(later) - .2)
    if end < (offset + total) / 1000 - .1 or end <= start:
        raise ValueError('Whole action range not available before container end/next skill')
    return start, end


def load_queue(workspace, source_hash, manifest_workspace=None):
    source = workspace / 'artifacts/troop-audit/final-20260925'
    roster = read_json((manifest_workspace or workspace) / 'artifacts/troop-audit/roster.json')['rows']
    records = {}
    for p in source.glob('troop-*.json'):
        r = read_json(p)
        if r.get('sourceHash') == source_hash:
            records[r['key']] = r
    rows = []
    for troop in sorted(roster, key=lambda x: x['troopId']):
        if not troop.get('skillBound'):
            continue
        key = 'troop-' + str(troop['troopId'])
        r = records.get(key)
        if not r:
            rows.append({'key': key, 'sourceHash': source_hash, 'troopName': troop['troopName'],
                         'preparationState': 'missing-recording', 'visualStatus': 'pending'})
            continue
        p = r.get('profile') or {}
        problems = list(r.get('pageErrors') or []) + list(p.get('errors') or [])
        if r.get('error'):
            problems.append(r['error'])
        rows.append({'key': key, 'sourceHash': r['sourceHash'], 'startedAt': r['startedAt'],
                     'troopName': r['troopName'], 'troopId': r['troopId'], 'description': r['description'],
                     'video': r.get('video'), 'videoEvidence': r.get('videoEvidence'),
                     'recordingEnvironment': r.get('recordingEnvironment'),
                     'metrics': {k: p.get(k) for k in ['totalMs', 'timelineMs', 'inputReadyMs',
                                'visualTailMs', 'stageMs', 'fxCounts', 'flags', 'eventCounts', 'segments']},
                     'renderErrors': (r.get('renderInspection') or {}).get('errors') or [],
                     'executionErrors': {'count': len(problems), 'first': problems[:3]},
                     'preparationState': 'pending', 'visualStatus': 'pending',
                     'confirmationCoverage': 'not-covered: original probe overrides confirmCast and target pickers',
                     'originalEvidence': str(source / (key + '.json'))})
    return source, records, rows


def make_sheets(folder, frames, start, offset_ms, fps):
    try:
        font = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 18)
    except OSError:
        font = ImageFont.load_default()
    pages = []
    cols, page_size, width = 4, 12, 480
    with Image.open(frames[0]) as first:
        height = round(first.height * width / first.width)
    cell_h = height + 27
    for page_index, first_index in enumerate(range(0, len(frames), page_size)):
        batch = frames[first_index:first_index + page_size]
        sheet = Image.new('RGB', (cols * width, math.ceil(len(batch) / cols) * cell_h), '#101621')
        draw = ImageDraw.Draw(sheet)
        for j, frame in enumerate(batch):
            i = first_index + j
            x, y = (j % cols) * width, (j // cols) * cell_h
            with Image.open(frame) as image:
                sheet.paste(image.resize((width, height)), (x, y + 27))
            absolute = start + i / fps
            relative = absolute - offset_ms / 1000
            draw.text((x + 6, y + 4), f'#{i+1:04d} video {absolute:.2f}s / offset~ {relative:+.2f}s', font=font, fill='#ffd38a')
        name = f'sheet-{page_index+1:03d}.jpg'
        sheet.save(folder / name, quality=90)
        pages.append(name)
    return pages


def status_summary(rows, reviews):
    latest = {identity(r): r for r in reviews.get('rows', [])}
    relevant = [latest.get(identity(r), {}) for r in rows]
    return {'expectedSkills': len(rows),
            'prepared': sum(r['preparationState'] == 'prepared' for r in rows),
            'evidenceBlocked': sum(r['preparationState'] in ['evidence-blocked', 'missing-recording', 'decode-error'] for r in rows),
            'visuallyObserved': sum(bool(r.get('reviewedAt')) for r in relevant),
            'needsOptimization': sum(r.get('status') == 'needs-optimization' for r in relevant),
            'reviewedPass': sum(r.get('status') == 'reviewed-pass' for r in relevant),
            'fullMotionReviewed': sum(r.get('fullMotionReviewed') is True for r in relevant),
            'pending': sum(not r.get('reviewedAt') for r in relevant)}


def write_queue(out, rows, state, current=None, cpu_cap=None):
    reviews = read_json(out / 'reviews.json', {'rows': []})
    summary = status_summary(rows, reviews)
    atomic_json(out / 'queue.json', {'generatedAt': utc(), 'sourceHash': BASELINE,
                'scope': 'every bound skill, one recorded seeded cast each; no trait/mode sign-off',
                'confirmationCoverage': 'Original acceptance fixture bypasses confirmation and target picking; separate interaction capture required',
                'rows': rows})
    atomic_json(out / 'progress.json', {'updatedAt': utc(), 'state': state, 'current': current,
                'preparationCpuCapPercent': cpu_cap, **summary,
                'note': 'prepared != visually inspected != full-motion/audio reviewed != visually passed'})


def prepare(args):
    workspace = Path(args.workspace).resolve()
    out = (workspace / args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    source, records, rows = load_queue(workspace, args.source_hash, Path(args.manifest_workspace))
    siblings = defaultdict(list)
    for r in records.values():
        siblings[r.get('video')].append(r)
    cap = os.environ.get('VISUAL_PREP_CPU_CAP_PERCENT')
    if args.all and (cap is None or not 1 <= int(cap) <= 10):
        raise RuntimeError('--all requires verified capped Windows Job (1..10%)')
    ffmpeg = Path(args.ffmpeg or shutil.which('ffmpeg') or str(Path(os.environ['LOCALAPPDATA']) / 'ms-playwright/ffmpeg-1011/ffmpeg-win64.exe'))
    if not ffmpeg.is_file():
        raise FileNotFoundError(ffmpeg)
    if args.tail_only:
        if cap is None or not 1 <= int(cap) <= 10:
            raise RuntimeError('Supplementary extraction requires a capped Windows Job')
        for key in filter(None, args.keys.split(',')):
            record = records[key]
            offset = record['measurementVideoOffsetMs']
            if any(r.get('measurementVideoOffsetMs', -1) > offset for r in siblings[record.get('video')]):
                raise ValueError('Tail extension needs manually verified boundaries when another fixture follows')
            start = max(0, (offset + record['profile']['totalMs']) / 1000 - .8)
            end = record['videoEvidence']['durationMs'] / 1000
            if end <= start or end-start > 15:
                raise ValueError('Supplementary range must be positive and at most 15 seconds')
            folder = out / key / 'tail'
            folder.mkdir(parents=True, exist_ok=True)
            command = [str(ffmpeg), '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
                       '-threads', '1', '-ss', f'{start:.6f}', '-i', str(source / record['video']),
                       '-t', f'{end-start:.6f}', '-an', '-filter_threads', '1',
                       '-vf', f'fps={args.fps},scale=960:-2', '-threads', '1', '-q:v', '3',
                       str(folder / 'frame-%05d.jpg')]
            subprocess.run(command, check=True, capture_output=True, timeout=180,
                           creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            frames = sorted(folder.glob('frame-*.jpg'))[:int(round((end-start)*args.fps))]
            if not frames:
                raise ValueError('No supplementary frames')
            sheets = make_sheets(folder, frames, start, offset, args.fps)
            atomic_json(folder / 'frames.json', {'identity': identity(record), 'preparedAt': utc(),
                        'clipStartSeconds': start, 'clipEndSeconds': end, 'fps': args.fps,
                        'sheets': sheets, 'decodedFrames': len(frames), 'cpuCapPercent': cap,
                        'originalVideo': str(source / record['video']),
                        'purpose': 'Last fixture post-roll; offsets approximate, not full-motion approval',
                        'fullMotionReviewed': False, 'audioReviewed': False})
            print(f'Supplementary tail {key}: {len(frames)} frames; NOT reviewed', flush=True)
        return
    order = list(args.keys.split(',')) if args.keys else []
    ordered = sorted(rows, key=lambda r: (order.index(r['key']) if r['key'] in order else len(order), r.get('troopId', 0)))
    selected = ordered if args.all else [r for r in ordered if not order or r['key'] in order][:args.limit]
    # Retain previously prepared evidence, keyed to exact recording identity and extraction settings.
    for row in rows:
        meta = read_json(out / row['key'] / 'frames.json')
        if meta and meta.get('identity') == identity(row) and meta.get('fps') == args.fps and all((out / row['key'] / name).is_file() for name in meta.get('sheets', [])):
            row.update({'preparationState': 'prepared', 'storyboard': meta})
        elif (row.get('videoEvidence') or {}).get('status') != 'passed':
            row['preparationState'] = 'evidence-blocked'
    write_queue(out, rows, 'preparing', cpu_cap=cap)
    for row in selected:
        if (out / 'STOP').exists():
            write_queue(out, rows, 'stopped-at-item-boundary', cpu_cap=cap)
            return
        if row['preparationState'] != 'pending':
            continue
        write_queue(out, rows, 'preparing', row['key'], cap)
        record = records[row['key']]
        folder = out / row['key']
        folder.mkdir(exist_ok=True)
        try:
            start, end = clip_bounds(record, siblings[record.get('video')])
            pattern = str(folder / 'frame-%05d.jpg')
            command = [str(ffmpeg), '-hide_banner', '-loglevel', 'error', '-nostdin', '-y',
                       '-threads', '1', '-ss', f'{start:.6f}', '-i', str(source / record['video']),
                       '-t', f'{end-start:.6f}', '-an', '-filter_threads', '1',
                       '-vf', f'fps={args.fps},scale=960:-2', '-threads', '1', '-q:v', '3', pattern]
            completed = subprocess.run(command, capture_output=True, text=True, errors='replace', timeout=180,
                                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            if completed.returncode:
                raise RuntimeError(completed.stderr[-1600:])
            frames = sorted(folder.glob('frame-*.jpg'))
            expected_frames = int(round((end-start) * args.fps))
            # Ignore stale excess output left by a changed recording/extraction range.
            frames = frames[:expected_frames]
            if len(frames) < max(1, expected_frames-1):
                raise RuntimeError(f'Short decode: {len(frames)} / about {expected_frames} frames')
            sheets = make_sheets(folder, frames, start, record['measurementVideoOffsetMs'], args.fps)
            meta = {'identity': identity(row), 'preparedAt': utc(), 'fps': args.fps,
                    'selection': 'uniform chronological frames, not a full-motion viewing attestation',
                    'clipStartSeconds': start, 'clipEndSeconds': end,
                    'actionOffsetMs': record['measurementVideoOffsetMs'],
                    'wholeChainMs': (record.get('profile') or {}).get('totalMs'),
                    'decodedFrames': len(frames), 'sheets': sheets,
                    'originalVideo': str(source / record['video']), 'cpuCapPercent': cap,
                    'fullMotionReviewed': False, 'audioReviewed': False}
            atomic_json(folder / 'frames.json', meta)
            row.update({'preparationState': 'prepared', 'storyboard': meta})
            print(f"Prepared {row['key']}: {len(frames)} chronological frames, {len(sheets)} sheets; NOT reviewed", flush=True)
        except Exception as error:
            row.update({'preparationState': 'decode-error', 'preparationError': str(error)})
            print(f"Blocked {row['key']}: {error}", flush=True)
        write_queue(out, rows, 'preparing', row['key'], cap)
        time.sleep(args.cooldown)
    write_queue(out, rows, 'preparation-finished', cpu_cap=cap)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', default=str(Path.cwd()))
    parser.add_argument('--out', default=DEFAULT_OUT)
    parser.add_argument('--source-hash', default=BASELINE)
    parser.add_argument('--manifest-workspace', default='D:/Code/match-3-acceptance-baseline-20260925')
    parser.add_argument('--ffmpeg')
    parser.add_argument('--keys', default='')
    parser.add_argument('--limit', type=int, default=12)
    parser.add_argument('--all', action='store_true')
    parser.add_argument('--tail-only', action='store_true')
    parser.add_argument('--fps', type=int, default=4)
    parser.add_argument('--cooldown', type=float, default=1)
    args = parser.parse_args()
    if not 1 <= args.fps <= 30 or not 1 <= args.limit <= 1805:
        parser.error('fps must be 1..30; limit must be 1..1805')
    prepare(args)


if __name__ == '__main__':
    main()
