/**
 * 王国旗帜的彩绘呈现（地图王国弹层、编队页、旗帜选择器共用）。
 *
 * 旗面底图按旗帜「主色」（最大正加成的颜色）取 6 色之一（文生图，src/assets/meta/kingdom/banner-*.webp），
 * 旗面中央叠该王国纹章；旗下挂加成色签。样式在 BANNER_ART_CSS，由使用方注入。
 */
import { BaseColor } from '../../engine/types';
import { BANNER_COLOR_LABELS, BANNERS } from '../data/banners';
import { kingdomViewOf } from '../screens/mapData';
import { gemSvg } from './chrome';
import { kingdomArt } from './artAssets';

const CLOTH: Record<string, string> = {
  [BaseColor.Red]: 'red',
  [BaseColor.Green]: 'green',
  [BaseColor.Blue]: 'blue',
  [BaseColor.Yellow]: 'yellow',
  [BaseColor.Purple]: 'purple',
  [BaseColor.Brown]: 'brown',
};

/** 旗帜主色：最大正加成（同值取旗帜表里的第一个） */
export function bannerPrimaryColor(kingdom: string): string | null {
  const boosts = Object.entries(BANNERS[kingdom]?.boosts ?? {}) as Array<[string, number | undefined]>;
  let best: [string, number] | null = null;
  for (const [color, value] of boosts) {
    const v = value ?? 0;
    if (v > 0 && (!best || v > best[1])) best = [color, v];
  }
  return best?.[0] ?? null;
}

/** 加成色签 HTML：「蓝 +2」「红 −1」 */
export function bannerBoostChips(kingdom: string): string {
  const def = BANNERS[kingdom];
  if (!def) return '';
  return Object.entries(def.boosts)
    .map(([color, mana]) => {
      const key = color as keyof typeof BANNER_COLOR_LABELS;
      const v = mana ?? 0;
      return `<span class="kb-boost${v < 0 ? ' neg' : ''}" title="匹配${BANNER_COLOR_LABELS[key]}色宝石时每次 ${v > 0 ? '+' : '−'}${Math.abs(v)} 法力值">${gemSvg([color.toLowerCase()])}<i>${v > 0 ? '+' : '−'}${Math.abs(v)}</i></span>`;
    })
    .join('');
}

/** 彩绘旗帜（旗面 + 纹章）。size = 旗帜高度（px），locked = 未解锁（去色） */
export function bannerArtHtml(kingdom: string | null, opts: { size?: number; locked?: boolean; cls?: string } = {}): string {
  const size = opts.size ?? 160;
  if (!kingdom || !BANNERS[kingdom]) {
    return `<span class="kbanner empty ${opts.cls ?? ''}" style="--kb-h:${size}px" aria-hidden="true"><span class="kb-empty">无旗帜</span></span>`;
  }
  const cloth = CLOTH[bannerPrimaryColor(kingdom) ?? ''] ?? 'brown';
  const crest = kingdomViewOf(kingdom).crest;
  return `<span class="kbanner c-${cloth}${opts.locked ? ' locked' : ''} ${opts.cls ?? ''}" style="--kb-h:${size}px" aria-hidden="true">
    <img class="kb-cloth" src="${kingdomArt(`banner-${cloth}`)}" alt="" draggable="false">
    ${crest ? `<img class="kb-crest" src="${crest}" alt="" draggable="false">` : ''}
  </span>`;
}

export const BANNER_ART_CSS = `
  .kbanner {
    position: relative;
    display: inline-block;
    flex: none;
    height: var(--kb-h, 160px);
    aspect-ratio: 290 / 520;
    filter: drop-shadow(0 8px 12px rgba(0, 0, 0, .55));
  }
  .kbanner .kb-cloth { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; user-select: none; }
  .kbanner .kb-crest {
    position: absolute;
    left: 50%; top: 43%;
    width: 46%;
    translate: -50% -50%;
    object-fit: contain;
    filter: drop-shadow(0 3px 4px rgba(0, 0, 0, .6));
    user-select: none;
  }
  .kbanner.locked { filter: grayscale(.9) brightness(.55) drop-shadow(0 8px 12px rgba(0, 0, 0, .55)); }
  .kbanner.empty {
    display: inline-grid; place-items: center;
    border: 1px dashed rgba(216, 194, 144, .4);
    border-radius: 4px;
    background: repeating-linear-gradient(135deg, rgba(255, 255, 255, .03) 0 8px, transparent 8px 16px);
    filter: none;
  }
  .kbanner .kb-empty { writing-mode: vertical-rl; color: #8f8498; font: 12px var(--body); letter-spacing: 4px; }
  .kb-boosts { display: inline-flex; flex-wrap: wrap; gap: 6px; }
  .kb-boost {
    display: inline-flex; align-items: center; gap: 3px;
    padding: 2px 7px 2px 4px;
    border: 1px solid rgba(216, 194, 144, .35);
    border-radius: 999px;
    background: rgba(8, 7, 12, .55);
    color: #f3e3b8;
    font: 700 12px Georgia, serif;
  }
  .kb-boost svg { width: 13px; height: 15px; }
  .kb-boost i { font-style: normal; }
  .kb-boost.neg { color: #f0a58f; border-color: rgba(200, 110, 90, .45); }
`;
