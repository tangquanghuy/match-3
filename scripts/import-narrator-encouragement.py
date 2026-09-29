"""Append the three user-approved encouragement recordings without modifying originals."""
from pathlib import Path
import hashlib, json, shutil, subprocess
ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path.home() / 'Downloads'
DEST = ROOT / 'game-assets/bundled/audio/narrator'
TAKES = [
 ('2026-09-28-20-04', 'Continue-the-onslaught!', 'encourage_ally_202609282004_01'),
 ('2026-09-28-20-05', 'Press-this-advantage,', 'encourage_ally_202609282005_02'),
 ('2026-09-28-20-06', 'Their-formation-is-broken', 'encourage_ally_202609282006_03'),
]
def main():
    path = DEST / 'manifest.json'
    manifest = json.loads(path.read_text(encoding='utf-8'))
    for timestamp, prefix, clip_id in TAKES:
        matches = list(SOURCE.glob(f'Wayne-June-(Darkest-Dungeon)-{timestamp}-{prefix}*.mp3'))
        if len(matches) != 1:
            raise SystemExit(f'Expected one approved take: {timestamp}, found {len(matches)}')
        source = matches[0]
        data = source.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        target = DEST / (clip_id + '.mp3')
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() != digest:
            raise SystemExit(f'Preserve edited asset: {target}')
        probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(source)], encoding='utf-8'))
        subprocess.run(['ffmpeg', '-v', 'error', '-i', str(source), '-f', 'null', '-'], check=True)
        stream = next(s for s in probe['streams'] if s['codec_type'] == 'audio')
        shutil.copy2(source, target)
        entry = dict(id=clip_id, pool='encourage.ally', enabled=True,
            file=target.relative_to(ROOT).as_posix(), sourceFilename=source.name,
            sha256=digest, bytes=len(data), duration=round(float(probe['format']['duration']), 3),
            sampleRate=int(stream['sample_rate']), channels=stream['channels'], importedDate='2026-09-28', notes=[])
        manifest = [m for m in manifest if m['id'] != clip_id] + [entry]
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{len(manifest)} total / {sum(m["enabled"] for m in manifest)} enabled; originals preserved')
if __name__ == '__main__':
    main()
