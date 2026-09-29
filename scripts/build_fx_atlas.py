"""序列帧 strip → 逐帧裁透明边的紧凑图集（无损）。

为什么：横向 strip 里每帧都是统一外框（frameW×frameH），爆点前几帧/末几帧大半透明，
解码后照样按整框占内存。逐帧裁到自身非透明包围盒再装箱，解码内存约省四成，像素不变。

输入：game-assets/source/fx-strips/<stem>.webp（scripts/build_fx_strip.ps1 的产物）
输出：game-assets/bundled/fx/atlas/<stem>.webp（WebP 无损）+ atlas.json
  atlas.json[stem] = { width, height, frameW, frameH, frames: [[x, y, w, h, ox, oy], ...] }
  x/y = 图集内位置，w/h = 裁后尺寸（全透明帧为 0），ox/oy = 在原帧外框里的偏移。

帧几何取自 src/render/AnimationConfig.ts（frameFX 与 slash），strip 名取自 App.ts 的 FRAME_FX_STRIP。
用法：python scripts/build_fx_atlas.py
"""
import json
import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'game-assets' / 'source' / 'fx-strips'
OUT = ROOT / 'game-assets' / 'bundled' / 'fx' / 'atlas'
CONFIG = ROOT / 'src' / 'render' / 'AnimationConfig.ts'
APP = ROOT / 'src' / 'render' / 'App.ts'

MAX_WIDTH = 4096
GUTTER = 2  # 帧间透明间隔：缩放采样时不串到相邻帧


def geometry():
    text = CONFIG.read_text(encoding='utf-8')
    geo = {m.group(1): (int(m.group(2)), int(m.group(3)), int(m.group(4)))
           for m in re.finditer(r"(\w+): \{ frames: (\d+), frameW: (\d+), frameH: (\d+)", text)}
    slash = re.search(r"slash: \{\s*frames: (\d+),\s*frameW: (\d+),[^\n]*\n\s*frameH: (\d+)", text)
    geo['slash'] = (int(slash.group(1)), int(slash.group(2)), int(slash.group(3)))
    return geo


def strips():
    text = APP.read_text(encoding='utf-8')
    block = text[text.index('FRAME_FX_STRIP'):]
    block = block[:block.index('};')]
    table = dict(re.findall(r"(\w+): '([\w-]+)'", block))
    table['slash'] = re.search(r"SLASH_STRIP = '([\w-]+)'", text).group(1)
    return table


def shelf(sizes, limit):
    """货架装箱：按高度降序排，逐行填到宽度上限。返回每帧位置与图集尺寸。"""
    order = sorted(range(len(sizes)), key=lambda i: -sizes[i][1])
    pos = [(0, 0)] * len(sizes)
    x = y = row_h = width = 0
    for i in order:
        w, h = sizes[i]
        if w == 0:
            continue
        if x and x + w > limit:
            y += row_h + GUTTER
            x = row_h = 0
        pos[i] = (x, y)
        x += w + GUTTER
        row_h = max(row_h, h)
        width = max(width, x - GUTTER)
    return pos, max(1, width), max(1, y + row_h)


def pack(sizes):
    """在一组宽度上限里挑面积最小的货架方案（面积 = 解码内存）。"""
    widths = [w for w, _ in sizes if w]
    lo, hi = max(widths), min(MAX_WIDTH, sum(w + GUTTER for w in widths))
    best = None
    for step in range(65):
        limit = lo + (hi - lo) * step // 64
        result = shelf(sizes, limit)
        if best is None or result[1] * result[2] < best[1] * best[2]:
            best = result
    return best


def build(stem, frames, fw, fh):
    img = Image.open(SRC / f'{stem}.webp').convert('RGBA')
    if img.width != frames * fw or img.height != fh:
        raise SystemExit(f'{stem}: 尺寸 {img.size} 与配置 {frames}×{fw}×{fh} 不符')
    cells, boxes = [], []
    for i in range(frames):
        cell = img.crop((i * fw, 0, (i + 1) * fw, fh))
        box = cell.getchannel('A').getbbox()
        boxes.append(box)
        cells.append(cell.crop(box) if box else None)
    sizes = [(c.width, c.height) if c else (0, 0) for c in cells]
    pos, aw, ah = pack(sizes)
    atlas = Image.new('RGBA', (aw, ah), (0, 0, 0, 0))
    meta = []
    for i, cell in enumerate(cells):
        if cell is None:
            meta.append([0, 0, 0, 0, 0, 0])
            continue
        atlas.paste(cell, pos[i])
        meta.append([pos[i][0], pos[i][1], cell.width, cell.height, boxes[i][0], boxes[i][1]])
    OUT.mkdir(parents=True, exist_ok=True)
    atlas.save(OUT / f'{stem}.webp', 'WEBP', lossless=True, quality=100, method=6, exact=True)
    # 自检：逐帧还原后与原图逐像素一致
    check = Image.open(OUT / f'{stem}.webp').convert('RGBA')
    for i, (x, y, w, h, ox, oy) in enumerate(meta):
        orig = img.crop((i * fw, 0, (i + 1) * fw, fh))
        rebuilt = Image.new('RGBA', (fw, fh), (0, 0, 0, 0))
        if w:
            rebuilt.paste(check.crop((x, y, x + w, y + h)), (ox, oy))
        # 全透明像素的 RGB 不参与显示：alpha 为 0 的像素统一清零后再逐字节比较
        def visible(im):
            mask = im.getchannel('A').point(lambda a: 255 if a else 0)
            return Image.composite(im, Image.new('RGBA', im.size, (0, 0, 0, 0)), mask).tobytes()
        if orig.tobytes() != rebuilt.tobytes() and visible(orig) != visible(rebuilt):
            raise SystemExit(f'{stem} 第 {i} 帧还原后可见像素不一致')
    return dict(width=aw, height=ah, frameW=fw, frameH=fh, frames=meta), frames * fw * fh, aw * ah


def main():
    geo = geometry()
    table = strips()
    by_stem = {}
    for name, stem in table.items():
        g = geo[name]
        if by_stem.setdefault(stem, g) != g:
            raise SystemExit(f'{stem} 被多个特效以不同几何引用：{by_stem[stem]} vs {g}')
    manifest, before, after = {}, 0, 0
    for stem, (frames, fw, fh) in sorted(by_stem.items()):
        manifest[stem], b, a = build(stem, frames, fw, fh)
        before += b
        after += a
        print(f'{stem:<32} {b * 4 / 2**20:6.1f} MB -> {a * 4 / 2**20:6.1f} MB')
    (OUT / 'atlas.json').write_text(json.dumps(manifest, separators=(',', ':')), encoding='utf-8')
    print(f'解码内存合计 {before * 4 / 2**20:.1f} MB -> {after * 4 / 2**20:.1f} MB')


if __name__ == '__main__':
    main()
