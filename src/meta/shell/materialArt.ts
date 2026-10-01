import { dailyArt } from './artAssets';
import { STONE_COLORS } from '../data/materials';

/** Material artwork is shared across inventory, rewards and map shortcuts. */
const ART = import.meta.glob('@assets/materials/*.{png,webp}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function fileUrl(name: string): string {
  const hit = Object.entries(ART).find(([path]) => path.endsWith(`/${name}`));
  return hit?.[1] ?? '';
}

export function ingotArt(key: string): string {
  return fileUrl(`ingot-${key}.png`);
}

/** Shared raster artwork; dual-color identity is canonical regardless of display order. */
export function stoneArt(tier: string, color = 'blue'): string {
  if (tier === 'arcane') {
    const order = STONE_COLORS.map(c => c.key);
    const parts = color.split(':');
    const [first, second = first] = parts;
    if (parts.length > 2 || !order.includes(first) || !order.includes(second)) return '';
    const pair = [first, second].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return fileUrl(`stone-arcane-${pair.join('-')}.webp`);
  }
  const name = tier === 'celestial' ? 'stone-celestial.png' : `stone-${tier}-${color}.png`;
  return fileUrl(name);
}

export function stoneMarkup(tier: string, color = 'blue'): string {
  return materialImg(stoneArt(tier, color));
}

export function stoneMarkupForKey(key: string): string {
  if (key === 'celestial') return stoneMarkup('celestial');
  const [tier, ...colors] = key.split(':');
  const color = colors.join(':');
  if (tier && color) return stoneMarkup(tier, color);
  return stoneMarkup('minor', 'blue');
}

export function treasureMapMarkup(): string {
  return `<img class="mat-art" src="${dailyArt('hunt')}" alt="藏宝图" draggable="false">`;
}

export function scrollArt(): string {
  return fileUrl('scroll-forge.png');
}

export function materialImg(src: string): string {
  return `<img class="mat-art" src="${src}" alt="" draggable="false">`;
}
