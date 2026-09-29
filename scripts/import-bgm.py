"""Import approved BGM without altering source files. Requires ffmpeg/ffprobe on PATH."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

TRACKS = [
    ('\u4e3b\u754c\u97621.m4a', 'menu-01'), ('\u4e3b\u754c\u97622.m4a', 'menu-02'),
    ('\u5730\u56fe.mp3', 'map'), ('\u90e8\u961f\u51c6\u5907.mp3', 'preparation'),
    ('\u6d3b\u52a8.mp3', 'events'),
    ('\u666e\u901a\u6218\u65971.mp3', 'battle-01'), ('\u666e\u901a\u6218\u65972.mp3', 'battle-02'),
    ('\u7cbe\u82f1\u6218\u65971.mp3', 'elite-01'), ('\u7cbe\u82f1\u6218\u65972.mp3', 'elite-02'),
    ('\u9996\u9886\u62181.mp3', 'boss-01'), ('\u9996\u9886\u62182.mp3', 'boss-02'),
]
ROOT = Path(__file__).resolve().parents[1]
TARGET_LUFS = -17
TARGET_PEAK_DBTP = -3

def run(args):
    result = subprocess.run(args, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout, result.stderr

def duration(path):
    return float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(path)])[0])

def loudness(path, filters):
    _, log = run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-vn', '-af', filters, '-f', 'null', '-'])
    return json.loads(re.findall(r'\{\s*"input_i".*?\}', log, re.S)[-1])

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, default=Path.home() / 'Downloads')
    args = parser.parse_args()
    target = ROOT / 'game-assets/bundled/audio/bgm'
    target.mkdir(parents=True, exist_ok=True)
    records = []
    for filename, track_id in TRACKS:
        source = args.source / filename
        seconds = duration(source)
        _, silence = run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(source), '-vn', '-af', 'silencedetect=noise=-50dB:d=0.25', '-f', 'null', '-'])
        # Only trim actual boundary silence, never internal musical pauses.
        starts = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', silence)]
        ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', silence)]
        start = max(0, ends[0] - 0.08) if starts and ends and starts[0] < 0.05 else 0
        end = min(seconds, starts[-1] + 0.12) if starts and ends and ends[-1] >= seconds - 0.15 else seconds
        trim = f'atrim=start={start}:end={end},asetpts=PTS-STARTPTS'
        norm = f'loudnorm=I={TARGET_LUFS}:TP={TARGET_PEAK_DBTP}:LRA=11'
        measured = loudness(source, f'{trim},{norm}:print_format=json')
        measured_opts = ':'.join(f'{key}={measured[value]}' for key, value in [
            ('measured_I', 'input_i'), ('measured_TP', 'input_tp'), ('measured_LRA', 'input_lra'),
            ('measured_thresh', 'input_thresh'), ('offset', 'target_offset')])
        output = target / f'{track_id}.mp3'
        filters = f'{trim},{norm}:{measured_opts}:linear=true,afade=t=in:d=0.06,afade=t=out:st={max(0, end-start-0.08)}:d=0.08'
        run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', str(source), '-vn', '-map_metadata', '-1',
             '-af', filters, '-ar', '44100', '-ac', '2', '-codec:a', 'libmp3lame', '-b:a', '128k', str(output)])
        verified = loudness(output, norm + ':print_format=json')
        records.append({'id': track_id, 'source': filename, 'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
            'file': output.name, 'duration': duration(output), 'trimStart': start, 'trimEnd': seconds-end,
            'sourceLUFS': float(measured['input_i']), 'outputLUFS': float(verified['input_i']),
            'truePeakDBTP': float(verified['input_tp']), 'bytes': output.stat().st_size})
        print(json.dumps(records[-1], ensure_ascii=True), flush=True)
    (target / 'manifest.json').write_text(json.dumps({'targetLUFS': TARGET_LUFS, 'targetPeakDBTP': TARGET_PEAK_DBTP,
        'encoding': 'MP3 128kbps stereo 44.1kHz', 'tracks': records}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

if __name__ == '__main__':
    main()
