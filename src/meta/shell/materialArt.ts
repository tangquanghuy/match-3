/** 材料图标。钢锭、符卷、特质石用图；藏宝图仍是简笔。 */
const ART = import.meta.glob('../../assets/materials/*.png', {
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
  return materialImg(stoneArt(tier, color));
}

export function stoneMarkupForKey(key: string): string {
  if (key === 'celestial') return stoneMarkup('celestial');
  const [tier, color] = key.split(':');
  if (tier && color) return stoneMarkup(tier, color);
  return stoneMarkup('minor', 'blue');
}

export function treasureMapMarkup(): string {
  return svg(
    `<rect x="12" y="14" width="40" height="36" rx="2" fill="#e7d3a6" stroke="#6b4423" stroke-width="3"/>`
    + `<path d="M22 26 L42 46 M42 26 L22 46" fill="none" stroke="#8a3030" stroke-width="4" stroke-linecap="square"/>`
    + `<circle cx="46" cy="18" r="5" fill="#c23b32" stroke="#f3d7a2" stroke-width="2"/>`,
  );
}

export function scrollArt(): string {
  return fileUrl('scroll-forge.png');
}

export function materialImg(src: string): string {
  return `<img class="mat-art" src="${src}" alt="" draggable="false">`;
}
