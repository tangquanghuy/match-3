import { dailyArt } from './artAssets';

/** Material artwork is shared across inventory, rewards and map shortcuts. */
const ART = import.meta.glob('@assets/materials/*.png', {
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

function svg(inner: string): string {
  return `<svg class="mat-art" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
}

/** 初级碎片、高级大碎片、符文石块、圣辉石板。颜色只改玻璃色。 */
export function stoneArt(tier: string, color = 'blue'): string {
  const name = tier === 'celestial' ? 'stone-celestial.png' : `stone-${tier}-${color}.png`;
  return fileUrl(name);
}

export function stoneMarkup(tier: string, color = 'blue'): string {
  if (tier === 'arcane') {
    const colors: Record<string, string> = { blue: '#6ab8f5', green: '#6fc279', red: '#e76b62', yellow: '#e9cb63', purple: '#b487df', brown: '#ba9168' };
    const [a, b = a] = color.split(':');
    return svg(`<path d="M32 5 55 22 45 53 19 53 9 22Z" fill="${colors[a] ?? colors.blue}" stroke="#e6d9ba" stroke-width="3"/><path d="M32 5 55 22 45 53 32 43Z" fill="${colors[b] ?? colors.blue}"/><path d="M23 24 32 17 41 24 37 38 27 38Z" fill="none" stroke="#fff" stroke-width="2"/>`);
  }
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
