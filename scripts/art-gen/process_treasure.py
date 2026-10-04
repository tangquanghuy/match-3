"""Extract V10 coins/containers and the V12 final-reward vault into 256px transparent WebP.

Usage: python scripts/art-gen/process_treasure.py [approved-sheet.png | --vault-only]
The matte is specific to the approved sheet's cool navy background. Art is
cropped, not regenerated. Requires Pillow and numpy. Preview stays in artifacts.
"""
from collections import deque
from pathlib import Path
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1] != '--vault-only' else ROOT / 'output/imagegen/treasure-v10/containers-sheet.png'
OUT = ROOT / 'game-assets/bundled/gems/loot'
COINS = ROOT / 'output/imagegen/treasure-v10/coins-source.png'
VAULT = ROOT / 'output/imagegen/treasure-v12/vault-generated.png'
PREVIEW = ROOT / 'artifacts/art-gen/treasure-v12'
# Coordinates in the approved 1254 x 1254 sheet, with generous object margins.
ITEMS = [
    ('copperCoin', (25, 160, 323, 540)),
    ('silverCoin', (333, 160, 629, 540)),
    ('goldCoin', (635, 160, 933, 540)),
    ('moneyBag', (925, 180, 1244, 585)),
    ('brownChest', (15, 560, 328, 985)),
    ('greenChest', (330, 560, 631, 985)),
    ('redChest', (635, 550, 937, 985)),
    ('vault', (935, 550, 1254, 1010)),
]


def flood(mask, seeds):
    seen = np.zeros(mask.shape, dtype=bool)
    queue = deque()
    h, w = mask.shape
    for y, x in seeds:
        if mask[y, x] and not seen[y, x]:
            seen[y, x] = True
            queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not seen[yy, xx]:
                seen[yy, xx] = True
                queue.append((yy, xx))
    return seen


def cutout(crop):
    rgb = np.asarray(crop).astype(np.int16)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    # The navy backdrop is dark and blue; metal/leather are warmer, while
    # even the cool silver coin is substantially brighter than the backdrop.
    mask = ((r - b > 3) & (r > 18)) | ((g - b > 4) & (g > 18)) | ((r > 33) & (g > 36)) | (r > 60)
    remaining, biggest = mask.copy(), np.zeros(mask.shape, dtype=bool)
    while remaining.any():
        y, x = np.argwhere(remaining)[0]
        component = flood(remaining, [(y, x)])
        if component.sum() > biggest.sum():
            biggest = component
        remaining[component] = False
    # Preserve dark interior material rather than punching holes through it.
    h, w = mask.shape
    edge = [(0, x) for x in range(w)] + [(h - 1, x) for x in range(w)]
    edge += [(y, 0) for y in range(h)] + [(y, w - 1) for y in range(h)]
    solid = ~flood(~biggest, edge)
    alpha = Image.fromarray((solid * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.45))
    rgba = crop.convert('RGBA')
    rgba.putalpha(alpha)
    rgba = rgba.crop(alpha.getbbox())
    rgba.thumbnail((232, 232), Image.Resampling.LANCZOS)
    tile = Image.new('RGBA', (256, 256))
    tile.alpha_composite(rgba, ((256 - rgba.width) // 2, (256 - rgba.height) // 2))
    return tile



def separate_silver_midtones(tile):
    """Spread silver away from gold in grayscale without reviving bright rims."""
    rgba = np.asarray(tile).copy()
    luma = np.asarray(tile.convert('L')).astype(np.float32)
    targets = np.interp(luma, [0, 60, 100, 140, 160, 190, 220, 255],
                        [0, 80, 130, 176, 195, 210, 224, 230])
    scale = (targets / np.maximum(luma, 1))[:, :, None]
    rgba[:, :, :3] = np.clip(rgba[:, :, :3].astype(np.float32) * scale, 0, 245).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')


def main():
    vault_only = '--vault-only' in sys.argv[1:]
    sheet = Image.open(SOURCE).convert('RGB')
    if sheet.size != (1254, 1254):
        raise ValueError('Expected the approved 1254x1254 V10 container sheet; review crops for a different source.')
    OUT.mkdir(parents=True, exist_ok=True)
    PREVIEW.mkdir(parents=True, exist_ok=True)
    # The selected V12 vault always replaces the V10 vault on default rebuilds.
    coins = Image.open(COINS).convert('RGB') if len(sys.argv) == 1 else None
    tiles = []
    for i, (name, bounds) in enumerate(ITEMS):
        if vault_only and name != 'vault':
            tiles.append(Image.open(OUT / f'{name}.webp').convert('RGBA'))
            continue
        if name == 'vault':
            tile = cutout(Image.open(VAULT).convert('RGB'))
        elif coins is not None and i < 3:
            w, h = coins.size
            tile = cutout(coins.crop((round(i*w/3), 0, round((i+1)*w/3), h)))
        else:
            tile = cutout(sheet.crop(bounds))
        if name == 'silverCoin':
            tile = separate_silver_midtones(tile)
        target = OUT / f'{name}.webp'
        tile.save(target, 'WEBP', quality=84, method=6, exact=True)
        tiles.append(Image.open(target).convert('RGBA'))
        print(f'{name}: 256x256, {target.stat().st_size:,} bytes')
    contact = Image.new('RGB', (1024, 512), '#191b28')
    for i, tile in enumerate(tiles):
        contact.paste(tile, ((i % 4) * 256, (i // 4) * 256), tile)
    contact.save(PREVIEW / 'contact.png')
    board = Image.new('RGB', (1024, 1024), '#12131e')
    draw = ImageDraw.Draw(board)
    rows = [
        [1,0,0,1,1,2,3,3], [1,0,2,1,3,3,0,4],
        [2,2,1,3,3,0,0,3], [3,0,4,0,1,2,0,4],
        [4,0,4,1,3,0,4,2], [2,2,5,2,4,0,4,1],
        [2,0,4,1,0,2,5,1], [0,0,5,1,6,1,7,3],
    ]
    for y, row in enumerate(rows):
        for x, tier in enumerate(row):
            draw.rounded_rectangle((x*128+6,y*128+6,x*128+122,y*128+122),radius=18,fill='#191b28')
            tile = tiles[tier].resize((112,112), Image.Resampling.LANCZOS)
            board.paste(tile, (x*128+8,y*128+8), tile)
    board.save(PREVIEW / 'board-preview.png')
    print(f'Previews: {PREVIEW}')


if __name__ == '__main__':
    main()
