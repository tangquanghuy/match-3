"""Knock out the white plate on generated chrome icons and write 128px RGBA PNGs."""
from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(r"C:\Users\Administrator\.cursor\projects\d-Code-match-3\assets")
DST = Path(r"d:\Code\match-3\src\assets\chrome")
MAP = {
    "chrome-gold.png": "gold.png",
    "chrome-soul.png": "soul.png",
    "chrome-gem.png": "gem.png",
    "chrome-key.png": "key.png",
    "chrome-glory.png": "glory.png",
    "chrome-bag.png": "bag.png",
    "chrome-gear.png": "gear.png",
}


def is_plate(r: np.ndarray, g: np.ndarray, b: np.ndarray) -> np.ndarray:
    mx = np.maximum(np.maximum(r, g), b)
    mn = np.minimum(np.minimum(r, g), b)
    sat = np.divide(mx - mn, mx, out=np.zeros_like(mx, dtype=np.float32), where=mx > 0)
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    return ((lum > 158) & (sat < 0.28)) | ((lum > 210) & (sat < 0.42))


def flood_mask(plate: np.ndarray) -> np.ndarray:
    h, w = plate.shape
    mask = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if plate[y, x]:
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if plate[y, x]:
                q.append((y, x))
    while q:
        y, x = q.popleft()
        if mask[y, x] or not plate[y, x]:
            continue
        mask[y, x] = True
        if y > 0:
            q.append((y - 1, x))
        if y + 1 < h:
            q.append((y + 1, x))
        if x > 0:
            q.append((y, x - 1))
        if x + 1 < w:
            q.append((y, x + 1))
    # enclosed holes that still look like the plate (wreath center, cog hole)
    unseen = plate & ~mask
    ys, xs = np.where(unseen)
    for y, x in zip(ys.tolist(), xs.tolist(), strict=False):
        if mask[y, x]:
            continue
        hole: deque[tuple[int, int]] = deque([(y, x)])
        component: list[tuple[int, int]] = []
        while hole:
            cy, cx = hole.popleft()
            if mask[cy, cx] or not plate[cy, cx]:
                continue
            mask[cy, cx] = True
            component.append((cy, cx))
            if cy > 0:
                hole.append((cy - 1, cx))
            if cy + 1 < h:
                hole.append((cy + 1, cx))
            if cx > 0:
                hole.append((cy, cx - 1))
            if cx + 1 < w:
                hole.append((cy, cx + 1))
    return mask


def process(src: Path, dst: Path) -> None:
    im = Image.open(src).convert("RGBA")
    arr = np.array(im, dtype=np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    plate = is_plate(r, g, b)
    mask = flood_mask(plate)
    alpha = np.where(mask, 0.0, 255.0)
    # 1px fringe: pixels next to knocked-out plate get reduced alpha
    padded = np.pad(mask, 1, constant_values=False)
    near = (
        padded[1:-1, :-2]
        | padded[1:-1, 2:]
        | padded[:-2, 1:-1]
        | padded[2:, 1:-1]
    ) & ~mask
    alpha = np.where(near, np.minimum(alpha, 170), alpha)
    arr[:, :, 3] = alpha
    keep = alpha > 8
    if not keep.any():
        raise SystemExit(f"knockout emptied {src.name}")
    ys, xs = np.where(keep)
    pad = int(max(im.size) * 0.06)
    y0, y1 = max(0, ys.min() - pad), min(im.size[1], ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(im.size[0], xs.max() + pad + 1)
    cropped = Image.fromarray(arr[y0:y1, x0:x1].astype(np.uint8), "RGBA")
    out = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    fitted = cropped.copy()
    fitted.thumbnail((120, 120), Image.Resampling.LANCZOS)
    ox = (128 - fitted.size[0]) // 2
    oy = (128 - fitted.size[1]) // 2
    out.paste(fitted, (ox, oy), fitted)
    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst, "PNG", optimize=True)
    check = np.array(out)
    trans = int((check[:, :, 3] == 0).sum())
    opaque = int((check[:, :, 3] >= 250).sum())
    print(f"{dst.name}: {out.size} trans={trans} opaque={opaque} bbox=({x0},{y0})-({x1},{y1})")


def main() -> None:
    for src_name, dst_name in MAP.items():
        process(SRC / src_name, DST / dst_name)


if __name__ == "__main__":
    main()
