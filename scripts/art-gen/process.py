"""文生图原图 → 游戏素材：按 alpha 裁掉透明边（留少量余量）、等比缩到最长边、导出 WebP。

素材清单与输出路径单源 scripts/art-gen/assets.mjs（通过 node 读出 JSON）。
用法：python scripts/art-gen/process.py [id ...]
"""
import json
import subprocess
import sys
from pathlib import Path

from PIL import Image

RAW = Path('artifacts/art-gen/raw')
manifest = json.loads(subprocess.check_output(
    ['node', '-e', "import('./scripts/art-gen/assets.mjs').then(m => process.stdout.write(JSON.stringify(m.ASSETS)))"],
    shell=False,
))
ids = sys.argv[1:] or list(manifest)
for name in ids:
    spec = manifest[name]
    src = RAW / f'{name}.png'
    if not src.exists():
        print(f'{name}: missing raw, skipped')
        continue
    im = Image.open(src).convert('RGBA')
    pad = float(spec.get('pad', 0.01))
    if spec.get('background') != 'opaque':
        mask = im.getchannel('A').point(lambda a: 255 if a > 8 else 0)
        bbox = mask.getbbox()
        if bbox:
            x0, y0, x1, y1 = bbox
            px = int((x1 - x0) * pad)
            py = int((y1 - y0) * pad)
            im = im.crop((max(0, x0 - px), max(0, y0 - py), min(im.width, x1 + px), min(im.height, y1 + py)))
    longest = int(spec['longest'])
    scale = longest / max(im.size)
    if scale < 1:
        im = im.resize((round(im.width * scale), round(im.height * scale)), Image.LANCZOS)
    out = Path(spec['out'])
    out.parent.mkdir(parents=True, exist_ok=True)
    if spec.get('background') == 'opaque':
        im = im.convert('RGB')
    im.save(out, 'WEBP', quality=84, method=6)
    print(f'{name}: {im.width}x{im.height} {out.stat().st_size // 1024}KB -> {out}')
