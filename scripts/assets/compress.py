"""
由 game-assets/source 重新生成需要压缩的产物（幂等；原图只读不改）。

  python scripts/assets/compress.py            # 只生成缺失或比原图旧的产物
  python scripts/assets/compress.py --force    # 全部重做

不在这里处理的：部队立绘 / 王国纹章 / 社区角色立绘（手工压缩后直接放进产物目录）。
规则按「源目录 → 产物目录 + 编码参数」列在 RULES，新增资源在这里加一行即可。
"""
from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass

from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
GA = os.path.join(ROOT, 'game-assets')


@dataclass
class Rule:
    src: str            # 相对 game-assets/source
    dst: str            # 相对 game-assets
    quality: int = 82
    max_w: int | None = None
    max_h: int | None = None


RULES = [
    # 线上静态图（URL /static/...）
    Rule('static/fx/gacha', 'public/static/fx/gacha', quality=88),
    Rule('static/chests', 'public/static/chests', max_w=1600),
    Rule('static/invasion-ranks', 'public/static/invasion-ranks', quality=85),
    Rule('static/troops', 'public/static/troops', max_h=1536),
    Rule('static/kingdoms', 'public/static/kingdoms'),
    Rule('static/map', 'public/static/map', quality=80),
    Rule('static/ui', 'public/static/ui', quality=85),
    Rule('static/hero', 'public/static/hero', quality=85, max_h=1200),
    # 打包资源（代码 import @assets/...）：战斗特效条
    Rule('bundled/fx', 'bundled/fx', quality=88),
]

# 单文件覆盖：入侵页 8%~11% 透明度的背景，不需要原尺寸
OVERRIDES = {'static/map/world-map-faint.webp': {'max_w': 1600, 'quality': 70}}

IMAGE_EXT = {'.png', '.webp', '.jpg', '.jpeg'}


def encode(src: str, dst: str, quality: int, max_w: int | None, max_h: int | None) -> tuple[int, int]:
    img = Image.open(src)
    img.load()
    has_alpha = img.mode in ('RGBA', 'LA', 'PA') or (img.mode == 'P' and 'transparency' in img.info)
    img = img.convert('RGBA' if has_alpha else 'RGB')
    w, h = img.size
    scale = min(1.0, (max_w or w) / w, (max_h or h) / h)
    if scale < 1.0:
        img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    # exact=True：保留全透明像素的颜色，避免特效条边缘发灰
    img.save(dst, 'WEBP', quality=quality, method=6, exact=has_alpha)
    return os.path.getsize(src), os.path.getsize(dst)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()
    before = after = count = 0
    for rule in RULES:
        src_dir = os.path.join(GA, 'source', rule.src)
        if not os.path.isdir(src_dir):
            continue
        for name in sorted(os.listdir(src_dir)):
            stem, ext = os.path.splitext(name)
            if ext.lower() not in IMAGE_EXT:
                continue
            src = os.path.join(src_dir, name)
            dst = os.path.join(GA, rule.dst, stem + '.webp')
            if not args.force and os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
                continue
            opts = {'quality': rule.quality, 'max_w': rule.max_w, 'max_h': rule.max_h}
            opts.update(OVERRIDES.get(f'{rule.src}/{name}', {}))
            a, b = encode(src, dst, **opts)
            before += a
            after += b
            count += 1
            print(f'{a / 1024:8.0f}KB -> {b / 1024:7.0f}KB  {rule.dst}/{stem}.webp')
    if count:
        print(f'{count} files: {before / 1048576:.1f}MB -> {after / 1048576:.1f}MB')
    else:
        print('nothing to do')
    return 0


if __name__ == '__main__':
    sys.exit(main())
