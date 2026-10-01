"""Build all 21 arcane colorways from the generated neutral crystal, preserving alpha.

Run after generate.mjs stone-arcane-master. Raw source stays in ignored artifacts/;
only the compressed WebP colorways are used by the game. No external dependencies
beyond Pillow, which the existing art processor already uses.
"""
from itertools import combinations_with_replacement
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'artifacts/art-gen/raw/stone-arcane-master.png'
OUT = ROOT / 'game-assets/bundled/materials'
PALETTE = {
    'blue': (43, 121, 233),
    'green': (45, 178, 100),
    'red': (217, 52, 70),
    'yellow': (233, 190, 47),
    'purple': (150, 79, 221),
    'brown': (169, 106, 56),
}


def smoothstep(value):
    t = max(0, min(1, value))
    return t * t * (3 - 2 * t)


def grade(luma, color):
    # Rich color in the middle values; near-white highlights retain refraction.
    brightness = (luma / 255) ** .86
    light = smoothstep((brightness - .56) / .44)
    return tuple(round(min(255, c * brightness * 1.45 * (1 - light) + 255 * light)) for c in color)


def main():
    source = Image.open(SOURCE).convert('RGBA')
    alpha = source.getchannel('A')
    if alpha.getextrema()[0] != 0:
        raise ValueError('Expected genuine transparent alpha in the generated master')
    bbox = alpha.point(lambda a: 255 if a > 8 else 0).getbbox()
    if not bbox:
        raise ValueError('Generated master is empty')
    source = source.crop(bbox)
    source.thumbnail((236, 236), Image.Resampling.LANCZOS)
    OUT.mkdir(parents=True, exist_ok=True)
    sheet = Image.new('RGB', (7 * 160, 3 * 184), '#142027')
    draw = ImageDraw.Draw(sheet)
    total = 0
    for index, (left, right) in enumerate(combinations_with_replacement(PALETTE, 2)):
        crystal = Image.new('RGBA', source.size)
        src, dst = source.load(), crystal.load()
        for y in range(source.height):
            for x in range(source.width):
                r, g, b, a = src[x, y]
                value = .2126 * r + .7152 * g + .0722 * b
                first, second = grade(value, PALETTE[left]), grade(value, PALETTE[right])
                # Follow the central facet: a narrow graded seam, not a flat color split.
                seam = .49 + .035 * (y / source.height - .5)
                mix = smoothstep((x / source.width - seam + .07) / .14)
                dst[x, y] = tuple(round(u * (1 - mix) + v * mix) for u, v in zip(first, second)) + (a,)
        icon = Image.new('RGBA', (256, 256))
        icon.alpha_composite(crystal, ((256 - crystal.width) // 2, (256 - crystal.height) // 2))
        file = OUT / f'stone-arcane-{left}-{right}.webp'
        icon.save(file, 'WEBP', quality=86, method=6, exact=True)
        size = file.stat().st_size
        total += size
        thumb = icon.resize((150, 150), Image.Resampling.LANCZOS)
        sx, sy = (index % 7) * 160, (index // 7) * 184
        sheet.paste(thumb, (sx + 5, sy), thumb)
        draw.text((sx + 6, sy + 155), f'{left}/{right}', fill='#d5dfde')
        print(f'{file.name}: {size} bytes')
    preview = ROOT / 'artifacts/art-gen/arcane-colorways-preview.jpg'
    sheet.save(preview, quality=94)
    print(f'21 icons: {total} bytes total; preview: {preview}')


if __name__ == '__main__':
    main()
