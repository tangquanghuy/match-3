import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';
import { AnimConfig } from './AnimationConfig';
import { scaledMs } from './battleSpeed';
import { battleCardDimensions, battleCardOverlayMetrics } from './battleCardLayout';
import { statusBadge, statusBadgeIcon } from './statusBadges';
import {
  STATUS_ACCENT_KEYS, isPositiveStatus, statusAccentKey, statusBadgeCorner, statusLiveLines,
} from './statusPresentation';
import { statusRecoveryChance } from '@engine/skills/effects/status';
import { traitCardGlyphs } from './traitBadges';
import frostBorderUrl from '../assets/fx/frost_border_overlay.png';
import frostVeinsUrl from '../assets/fx/frost_veins_overlay.png';
import silenceSealUrl from '../assets/fx/silence_seal_overlay.png';
import entangleVinesUrl from '../assets/fx/entangle_vines_overlay.png';

/**
 * 方向 G · 胶片机能（Cinematic-Mecha）角色卡 —— DOM 实现。
 *
 * 用真实 HTML/CSS 渲染卡片（与 .superdesign/design_iterations/card_7.html 一致），
 * 叠在 Pixi 棋盘画布之上。相比 Pixi Graphics 重绘，DOM 能保留 CSS 渐变 / 混合模式 /
 * 胶片颗粒 / Web 字体，且立绘用 background-image 加载，不受 WebGL 纹理跨域(CORS)限制。
 */

export let CARD_W = 142;
export let CARD_H = 164;
const CARD_GAP = 10;
let TEAM_SIZE = 4;
/** 棋盘可用高度（行数×格子尺寸），队伍卡竖向填满；由 App 按实际 cellSize 设置 */
let BOARD_PX = 512;

/** 设置队伍人数并按棋盘高度重算卡片尺寸（3→更高竖卡，4→略矮）。
 *  boardPx 可选：传入棋盘像素高度（行数×cellSize），卡片高度随之联动。 */
export function setTeamSize(n: number, boardPx?: number): void {
  TEAM_SIZE = n;
  if (boardPx !== undefined) BOARD_PX = boardPx;
  CARD_H = Math.floor((BOARD_PX - (n - 1) * CARD_GAP) / n);
  // 卡宽随棋盘尺寸等比缩放（参考棋盘 512px 时 3 人 142 / 4 人 132，
  // 提高卡片宽高比让全身立绘更舒展，不再显得瘦窄）
  const scale = BOARD_PX / 512;
  CARD_W = Math.round((n >= 4 ? 132 : 142) * scale);
}

/** 当前队伍人数 */
export function getTeamSize(): number {
  return TEAM_SIZE;
}

/**
 * 卡面覆盖层比例换算。
 *
 * 所有徽章/图标/数字的尺寸都是按 512px 棋盘下的 142×164 卡片调的。紧凑横屏基准把棋盘压到
 * 364px 后卡片只有 101×114（4v4 更小），覆盖层若仍用原始 px 就会明显过大——法力书签会占掉
 * 四成卡宽、水晶球角标占两成多卡高、攻血数字挤满底边。这里跟 `CARD_W` 用同一个比例，
 * 让卡内比例回到设计稿状态。
 */
function overlayScale(): number {
  return BOARD_PX / 512;
}

/** 覆盖层几何尺寸换算（宽高/内缩/间距），至少保留 1px 以免元素塌掉。 */
function os(base: number): number {
  return Math.max(1, Math.round(base * overlayScale()));
}

/** 覆盖层字号换算：同比缩放但不低于 9px，避免小屏上读不清。 */
function ofs(base: number): number {
  return Math.max(9, Math.round(base * overlayScale()));
}

/**
 * 法力宝石书签边长：按卡宽占比锚定，而不是用 44px 触控区尺寸反推。
 *
 * 设计稿 `.superdesign/design_iterations/gem_emerald.html`：小卡 116×164 配 30px 宝石
 * （占卡宽 25.9%），大卡 232×328 配 50px（21.6%）。游戏内 25.9% 压立绘太狠（用户反馈），
 * 先收到 21.6%；但空法力时宝石只填书签一半、黑底衬喧宾夺主，再收一档并让底衬贴住宝石。
 */
function gemSize(): number {
  return Math.round(CARD_W * 0.18);
}

/** 属性值转义（特质名/描述来自数据文件，进 data-* 前必须转义引号与尖括号） */
function escAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** 基础色 → card_7 暖旧电影皮肤类名 */
const SKIN_CLASS: Record<BaseColor, string> = {
  [BaseColor.Red]: 'skin-rust',
  [BaseColor.Green]: 'skin-teal',
  [BaseColor.Blue]: 'skin-steel',
  [BaseColor.Yellow]: 'skin-sand',
  [BaseColor.Purple]: 'skin-plum',
  [BaseColor.Brown]: 'skin-sepia',
};

/** 每张卡的构图镜像变体（按队内序号轮换） */
const VARIANTS = ['', 'v2', 'v3', 'v4'];

/** 六色宝石色值（与棋盘宝石呼应，鲜明可辨；详情窗属性绶带复用） */
export const COLOR_HEX: Record<BaseColor, string> = {
  [BaseColor.Red]: '#e8555e',
  [BaseColor.Green]: '#57c06b',
  [BaseColor.Blue]: '#4f9fe0',
  [BaseColor.Yellow]: '#e8c24a',
  [BaseColor.Purple]: '#a074d4',
  [BaseColor.Brown]: '#c0823f',
};

const COLOR_LABEL: Record<BaseColor, string> = {
  [BaseColor.Red]: '红色',
  [BaseColor.Green]: '绿色',
  [BaseColor.Blue]: '蓝色',
  [BaseColor.Yellow]: '黄色',
  [BaseColor.Purple]: '紫色',
  [BaseColor.Brown]: '棕色',
};

/** 每次页面加载只提示一次状态徽记可点击，避免多张卡同时抢视线。 */
let statusDiscoveryShown = false;

/** game-icons.net «emerald» 切割宝石轮廓（viewBox 512） */
const EMERALD_PATH = "M310.375 16.75L89.405 75.72l58.126 50.905L282.563 90.28l2.032-.53 25.78-73zm17.063 7.844l-27.157 76.812 91.69 91.875 95.624-8.78L327.438 24.594zm-41.813 12.062l-8.594 33.657c-.28-15.516-38.03-17.018-107.56-4.376l116.155-29.28zm51.063 14.625l123.5 123.407-58.844 7.563c16.2-21.37-32.277-91.112-64.656-130.97zM74.75 87.72L15.594 308.405l79-31.47 37.28-139.155L74.75 87.72zm207.438 22l-133.032 35.81-35.72 133.376 97.25 97.53 133.064-35.81 35.72-133.376-97.283-97.53zm-201.72 5.686l32.844 30.5-30.156 118.97-39.03 15.812c50.817-30.543 65.667-130.132 36.343-165.282zm195.876 14.78L359 213.377l-30.156 113.81-44.688 11.97c119.527-107.872-34.816-238.375-131.5-140.875l9.875-37.405 113.814-30.688zM490.564 203l-92.877 8.53-35.968 134.19 71.342 71.842L490.563 203zm-17.283 13.875L444.03 333.03c6.73-68.874-.03-90.85-30.655-111.5l59.906-4.655zm-371.155 77.188L20.22 326.688l161.75 161.468 17.31-96.72-97.155-97.373zm.094 20l78.124 82.437-7.438 61.375c-5.23-44.565-28.34-85.92-70.687-143.813zm246.124 44.687l-130.53 35.125-17.564 98.188 221.688-59.157-73.594-74.156zm18.625 42.5l24.28 24.844-115.22 32.72c61.28-26.446 83.34-37.418 90.94-57.564z";

/** 生成 emerald 内部多色放射扇形填充 path 串 */
function gemFillPaths(colors: BaseColor[]): string {
  const n = colors.length;
  if (n <= 1) {
    return `<rect x="0" y="0" width="512" height="512" fill="${COLOR_HEX[colors[0] ?? BaseColor.Brown]}"/>`;
  }
  const cx = 256;
  const cy = 256;
  const R = 420;
  const step = (Math.PI * 2) / n;
  let out = '';
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + i * step;
    const a1 = -Math.PI / 2 + (i + 1) * step;
    const x0 = cx + R * Math.cos(a0);
    const y0 = cy + R * Math.sin(a0);
    const x1 = cx + R * Math.cos(a1);
    const y1 = cy + R * Math.sin(a1);
    const large = step > Math.PI ? 1 : 0;
    out += `<path d="M${cx} ${cy} L${x0.toFixed(1)} ${y0.toFixed(1)} A${R} ${R} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z" fill="${COLOR_HEX[colors[i]]}"/>`;
  }
  return out;
}

/**
 * emerald 宝石 SVG：
 * - 暗底虚显的多色（表示颜色需求）
 * - 亮色充能层：fan 填充被一个裁切矩形(.rise)裁切，底部向上长表示进度
 */
let gemUid = 0;
function gemSvg(colors: BaseColor[]): string {
  const list = colors.length > 0 ? colors : [BaseColor.Brown];
  const clip = `gemclip${gemUid}`;
  const rise = `gemrise${gemUid}`;
  gemUid++;
  const fills = gemFillPaths(list);
  return `<svg viewBox="0 0 512 512">
    <defs>
      <clipPath id="${clip}"><path d="${EMERALD_PATH}"/></clipPath>
      <clipPath id="${rise}"><rect class="rise" x="0" y="512" width="512" height="0"/></clipPath>
    </defs>
    <path class="seat" d="${EMERALD_PATH}"/>
    <g clip-path="url(#${clip})">
      <g class="dim">${fills}</g>
      <g class="lit" clip-path="url(#${rise})">${fills}</g>
    </g>
    <path class="facets" d="${EMERALD_PATH}"/>
  </svg>`;
}

/**
 * 与卡面同款的 emerald 法力宝石（静态充能比例）：详情窗的卡面宝石与技能标记复用，
 * 保证战斗里同一个角色只有一种宝石长相。ratio ∈ [0,1]。
 */
export function manaGemSvg(colors: BaseColor[], ratio: number): string {
  const h = Math.round(Math.max(0, Math.min(1, ratio)) * 512);
  return gemSvg(colors).replace(
    '<rect class="rise" x="0" y="512" width="512" height="0"/>',
    `<rect class="rise" x="0" y="${512 - h}" width="512" height="${h}"/>`,
  );
}

/** 一次卡片点按的来源：键盘打开详情窗时才把焦点移进窗内 */
export type PressSource = 'pointer' | 'keyboard';

/** 卡面此刻显示的数值（详情窗与卡面同步用；法力为卡面显示值，不是引擎值） */
export interface CardShownStats {
  attack: number;
  armor: number;
  hp: number;
  maxHp: number;
  magic: number;
  mana: number;
  manaCost: number;
  defeated: boolean;
  statuses: { id: string; turns: number; magnitude?: number }[];
}

// 线性图标（暖金描边，与衬线数字气质统一，数字作主体）
// Stat icons inherit the matching troop-detail semantic color.
const SWORD_SVG = `<svg class="ic" viewBox="0 0 512 512" width="14" height="14"><path fill="currentColor" d="M19.75 14.438c59.538 112.29 142.51 202.35 232.28 292.718l3.626 3.75.063-.062c21.827 21.93 44.04 43.923 66.405 66.25-18.856 14.813-38.974 28.2-59.938 40.312l28.532 28.53 68.717-68.717c42.337 27.636 76.286 63.646 104.094 105.81l28.064-28.06c-42.47-27.493-79.74-60.206-106.03-103.876l68.936-68.938-28.53-28.53c-11.115 21.853-24.413 42.015-39.47 60.593-43.852-43.8-86.462-85.842-130.125-125.47-.224-.203-.432-.422-.656-.625C183.624 122.75 108.515 63.91 19.75 14.437zm471.875 0c-83.038 46.28-154.122 100.78-221.97 161.156l22.814 21.562 56.81-56.812 13.22 13.187-56.438 56.44 24.594 23.186c61.802-66.92 117.6-136.92 160.97-218.72zm-329.53 125.906 200.56 200.53a402.965 402.965 0 0 1-13.405 13.032L148.875 153.53l13.22-13.186zm-76.69 113.28-28.5 28.532 68.907 68.906c-26.29 43.673-63.53 76.414-106 103.907l28.063 28.06c27.807-42.164 61.758-78.174 104.094-105.81l68.718 68.717 28.53-28.53c-20.962-12.113-41.08-25.5-59.937-40.313 17.865-17.83 35.61-35.433 53.157-52.97l-24.843-25.655-55.47 55.467c-4.565-4.238-9.014-8.62-13.374-13.062l55.844-55.844-24.53-25.374c-18.28 17.856-36.602 36.06-55.158 54.594-15.068-18.587-28.38-38.758-39.5-60.625z"/></svg>`;
const HEART_SVG = `<svg class="ic" viewBox="3 4 18 17" width="13" height="13"><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M12 20C6.5 16 3.5 12.8 3.5 9.2 3.5 6.6 5.5 4.7 8 4.7c1.6 0 3.1.8 4 2.2.9-1.4 2.4-2.2 4-2.2 2.5 0 4.5 1.9 4.5 4.5 0 3.6-3 6.8-8.5 10.8z"/></svg>`;
const SHIELD_SVG = `<svg class="ic ic-armor" viewBox="0 0 24 24" width="11" height="11"><path fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M12 3 19 5.5v5.5c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V5.5z"/></svg>`;
// 魔力（法术强度）图标：水晶球（game-icons.net / lorc «crystal-ball», CC BY 3.0）。
// 用径向渐变填充做出"发光宝珠"的立体质感（中心亮、边缘深紫），而非扁平色块。
const MAGIC_SVG = `<svg class="ic-magic" viewBox="0 0 512 512" width="17" height="17"><defs><radialGradient id="mgOrb" cx="38%" cy="30%" r="78%"><stop offset="0%" stop-color="#f7f0ff"/><stop offset="42%" stop-color="#cdaef3"/><stop offset="100%" stop-color="#7c4dbe"/></radialGradient></defs><path fill="url(#mgOrb)" d="M254.563 20.75c-42.96 0-85.918 16.387-118.688 49.156-65.54 65.54-65.852 172.15-.313 237.688 65.54 65.54 172.15 65.226 237.688-.313 65.54-65.538 65.54-171.835 0-237.374-32.77-32.77-75.728-49.156-118.688-49.156zm-.157 18.47a149.284 149.284 0 0 1 74.313 19.968c-13.573-3.984-26.266-2.455-34.22 5.5-14.437 14.437-7.796 44.485 14.813 67.093 22.608 22.61 52.625 29.22 67.062 14.782 8.523-8.522 9.706-22.468 4.594-37.125 36.352 57.684 29.586 134.6-20.69 184.875-29.158 29.16-67.353 43.773-105.56 43.813 9.436-2.3 17.762-6.732 24.436-13.406 28.885-28.886 15.64-88.954-29.594-134.19-45.234-45.233-105.302-58.51-134.187-29.624-4.052 4.052-7.266 8.723-9.688 13.875 3.092-33.537 17.473-66.222 43.157-91.905 29.198-29.2 67.384-43.737 105.562-43.656zM386.97 319.28c-.205.206-.39.422-.595.626-72.78 72.78-191.252 73.155-264.03.375-.278-.275-.54-.565-.814-.842-11.987 9.483-18.81 20.384-18.81 32 0 36.523 67.315 66.125 151.343 66.125 84.027 0 152.093-29.6 152.093-66.125 0-11.68-6.97-22.637-19.187-32.157zm39.717 54.564c-22.225 32.29-91.192 55.906-172.625 55.906-81.172 0-149.954-23.46-172.406-55.594-12.638 11.3-19.72 24.052-19.72 37.563.002 46.928 85.546 85.03 192.064 85.03 106.518 0 192.97-38.1 192.97-85.03 0-13.637-7.313-26.498-20.283-37.876z"/></svg>`;

/** 卡面同款属性图标（详情窗复用，战斗里同一属性只有一种图标） */
export const CARD_STAT_ICONS = { sword: SWORD_SVG, heart: HEART_SVG, shield: SHIELD_SVG, magic: MAGIC_SVG } as const;

const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
  .gcol{position:absolute;display:flex;flex-direction:column;gap:${CARD_GAP}px;pointer-events:none}
  /* 阵亡留下的空位：只描一圈极淡的边，保住队列格局 */
  .gcol .gslot-empty{flex:none;box-sizing:border-box;border-radius:8px;
    border:1px solid rgba(216,194,144,.1);background:rgba(8,7,6,.22)}
  /* ?????????????????????????????? */
  .gcol .turn-frame{--turn-color:126,200,236;position:absolute;top:-7px;bottom:-7px;width:28px;
    pointer-events:none;opacity:0;transform:scaleY(.18);transform-origin:center;
    transition:opacity .22s ease,transform .36s cubic-bezier(.2,.85,.25,1)}
  .gcol .turn-frame::before{content:"";position:absolute;inset:0;
    filter:drop-shadow(0 0 4px rgba(var(--turn-color),.42));opacity:.9}
  .gcol .turn-frame::after{content:"";position:absolute;top:50%;width:7px;height:7px;
    margin-top:-4px;background:rgba(var(--turn-color),.95);border:1px solid rgba(244,250,255,.72);
    transform:rotate(45deg);box-shadow:0 0 7px rgba(var(--turn-color),.72)}
  .gcol.active-ally .turn-frame{--turn-color:126,200,236;left:-5px;opacity:1;transform:scaleY(1)}
  .gcol.active-ally .turn-frame::before{background:
    linear-gradient(rgba(var(--turn-color),.96),rgba(var(--turn-color),.96)) left 0 top 10px/2px calc(100% - 20px) no-repeat,
    linear-gradient(90deg,rgba(var(--turn-color),.96),rgba(var(--turn-color),.18)) left top/18px 2px no-repeat,
    linear-gradient(90deg,rgba(var(--turn-color),.96),rgba(var(--turn-color),.18)) left bottom/18px 2px no-repeat}
  .gcol.active-ally .turn-frame::after{left:-3px}
  .gcol.active-enemy .turn-frame{--turn-color:224,121,111;right:-5px;opacity:1;transform:scaleY(1)}
  .gcol.active-enemy .turn-frame::before{background:
    linear-gradient(rgba(var(--turn-color),.96),rgba(var(--turn-color),.96)) right 0 top 10px/2px calc(100% - 20px) no-repeat,
    linear-gradient(270deg,rgba(var(--turn-color),.96),rgba(var(--turn-color),.18)) right top/18px 2px no-repeat,
    linear-gradient(270deg,rgba(var(--turn-color),.96),rgba(var(--turn-color),.18)) right bottom/18px 2px no-repeat}
  .gcol.active-enemy .turn-frame::after{right:-3px}

  /* border-box：1px 边框不得撑大卡片，否则 CARD_W/CARD_H 与实际占位不一致，
     末位卡片会溢出 wrapper 底边并被视口裁掉（移动横屏 1px 截断）。 */
  .gcard{position:relative;box-sizing:border-box;width:${CARD_W}px;height:${CARD_H}px;isolation:isolate;
    border-radius:8px;background:#0b0a09;border:1px solid rgba(38,31,22,.96);
    box-shadow:0 0 0 1px rgba(8,7,6,.72);
    font-family:"Oswald","PingFang SC","Microsoft YaHei",sans-serif;transition:opacity .25s,filter .2s ease}
  .gcard .card-frame{position:absolute;inset:0;z-index:5;border-radius:8px;pointer-events:none;padding:1px;
    box-sizing:border-box;background:linear-gradient(135deg,rgba(244,226,174,.76) 0%,rgba(151,121,69,.46) 34%,rgba(224,197,132,.7) 68%,rgba(119,92,51,.5) 100%);
    -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
    -webkit-mask-composite:xor;mask-composite:exclude}
  .gcard .card-frame::before{content:"";position:absolute;inset:3px;border-radius:6px;opacity:.48;
    background:
      linear-gradient(90deg,rgba(239,217,158,.82),transparent) left top/20px 1px no-repeat,
      linear-gradient(180deg,rgba(239,217,158,.82),transparent) left top/1px 20px no-repeat,
      linear-gradient(270deg,rgba(239,217,158,.82),transparent) right top/20px 1px no-repeat,
      linear-gradient(180deg,rgba(239,217,158,.82),transparent) right top/1px 20px no-repeat,
      linear-gradient(90deg,rgba(239,217,158,.7),transparent) left bottom/18px 1px no-repeat,
      linear-gradient(0deg,rgba(239,217,158,.7),transparent) left bottom/1px 18px no-repeat,
      linear-gradient(270deg,rgba(239,217,158,.7),transparent) right bottom/18px 1px no-repeat,
      linear-gradient(0deg,rgba(239,217,158,.7),transparent) right bottom/1px 18px no-repeat}
  .gcard .frame-ornament{position:absolute;z-index:7;left:50%;bottom:-${os(7)}px;width:${os(48)}px;height:${os(18)}px;
    transform:translateX(-50%);pointer-events:none;filter:drop-shadow(0 2px 2px rgba(0,0,0,.8))}
  .gcard .frame-ornament svg{display:block;width:100%;height:100%;overflow:visible}
  .gcard .frame-ornament .orn-dark{fill:#17120c;stroke:rgba(75,57,31,.95);stroke-width:3;stroke-linejoin:round}
  .gcard .frame-ornament .orn-gold{fill:none;stroke:url(#ornGold);stroke-width:1.45;stroke-linecap:round;stroke-linejoin:round}
  .gcard .frame-ornament .orn-core{fill:#241b10;stroke:#d8bd7d;stroke-width:1.2}
  /* 目标可选：暖金柔和呼吸辉光（呼应卡片金边，不抢准星戏），十字光标 */
  .gcard.pickable{cursor:crosshair;transition:filter .2s,transform .16s cubic-bezier(.2,.9,.3,1)}
  .gcard.pickable::after{content:"";position:absolute;inset:-2px;z-index:9;border-radius:10px;pointer-events:none;
    border:1.5px solid rgba(230,201,121,.5);box-shadow:0 0 10px rgba(230,201,121,.3);
    animation:pickBreath 1.4s ease-in-out infinite}
  @keyframes pickBreath{0%,100%{opacity:.5}50%{opacity:1}}
  /* 悬停锁定（敌人）：赤红描边 + 抬起放大 */
  .gcard.aim-hover{transform:translateY(-3px) scale(1.05)}
  .gcard.aim-hover-hostile::after{border:2px solid rgba(255,90,77,.98);opacity:1;animation:none;
    box-shadow:0 0 16px rgba(255,80,70,.8),inset 0 0 12px rgba(255,80,70,.35)}
  /* 悬停锁定（盟友）：翠绿描边 */
  .gcard.aim-hover-friendly::after{border:2px solid rgba(87,212,122,.98);opacity:1;animation:none;
    box-shadow:0 0 16px rgba(87,212,122,.8),inset 0 0 12px rgba(87,212,122,.35)}
  /* 施法者施法态：金色浮起 */
  .gcard.casting-origin{transform:translateY(-4px) scale(1.03);z-index:30;
    transition:transform .18s cubic-bezier(.2,.9,.3,1)}
  .gcard.casting-origin::after{content:"";position:absolute;inset:-2px;z-index:9;border-radius:10px;pointer-events:none;
    border:2px solid rgba(240,210,130,.95);box-shadow:0 0 16px rgba(240,210,130,.75)}
  .gcard.castable .card-frame{filter:brightness(1.18)}
  .gcard.castable .frame-ornament{filter:brightness(1.15) drop-shadow(0 2px 2px rgba(0,0,0,.8))}
  /* 可释放：卡框暖金流光 + 宝石呼吸。满法力不再打感叹号——那个角标比宝石还抢眼。
     沉默且满法力仍在同一位置打紫灰叉，避免和可释放态混成同一种亮宝石。 */
  .gcard .cast-flag{position:absolute;z-index:8;top:${os(2)}px;left:${gemSize() + os(3)}px;
    display:none;align-items:center;justify-content:center;
    min-width:${os(14)}px;height:${os(14)}px;padding:0 ${os(3)}px;box-sizing:border-box;
    border-radius:${os(4)}px;pointer-events:none;
    font-family:"Oswald",sans-serif;font-weight:700;font-size:${ofs(11)}px;line-height:1;
    color:#e6dcf5;background:linear-gradient(180deg,#6b5885,#3b2f4d);
    border:1px solid rgba(150,120,190,.85);box-shadow:0 1px 3px rgba(0,0,0,.7)}
  .gcard.silenced.mana-full .cast-flag{display:inline-flex}
  /* 卡框流光：只在可释放且未沉默时跑，一眼能从视野边缘捕捉到 */
  .gcard .cast-sheen{position:absolute;inset:-1px;z-index:8;border-radius:9px;pointer-events:none;
    display:none;overflow:hidden}
  .gcard.castable:not(.silenced) .cast-sheen{display:block}
  .gcard .cast-sheen::before{content:"";position:absolute;inset:-40%;
    background:linear-gradient(115deg,transparent 42%,rgba(255,240,196,.42) 50%,transparent 58%);
    animation:castSheen 2.6s linear infinite}
  @keyframes castSheen{0%{transform:translateX(-60%)}100%{transform:translateX(60%)}}

  /* 长按进度环：只在「快速释放」开启且该我方角色此刻可施放时画——
     那时短按=施法、长按=打开详情窗，两种结果不同才需要看得见"再按下去就变成长按了"。
     其余情况短按/长按都是打开详情窗，不画环。 */
  .gcard .press-ring{position:absolute;z-index:10;inset:-2px;border-radius:10px;pointer-events:none;
    opacity:0;border:2px solid rgba(240,222,170,.9);
    box-shadow:0 0 10px rgba(240,222,170,.45),inset 0 0 8px rgba(240,222,170,.2)}
  .gcard.pressing .press-ring{animation:pressRing 475ms linear forwards}
  @keyframes pressRing{
    0%{opacity:0;clip-path:inset(0 100% 0 0)}
    8%{opacity:1}
    100%{opacity:1;clip-path:inset(0 0 0 0)}
  }
  @media (prefers-reduced-motion:reduce){
    .gcard .cast-sheen::before{animation:none;opacity:.25}
    .gcard.pressing .press-ring{animation:none;opacity:.8}
    .gcard .status-badge.status-discovery,.gcard .status-more.status-discovery{animation:none}
  }

  /* B-3（UX 阶段 B）：短按无效时的即时反馈浮窗（还差 N 点法力值 / 等待对手行动 / 沉默中）。
     阶段 A 这里是彻底的零反馈——玩家分不清"法力不够 / 不是我的回合 / 游戏卡住了"，
     于是反复点、越点越确信是 bug。这是整个战斗层最高频的一次交互失败。 */
  .gcard .cast-hint{position:absolute;z-index:14;left:50%;bottom:calc(100% + ${os(4)}px);
    transform:translateX(-50%);display:none;max-width:${Math.max(96, Math.round(CARD_W * 1.5))}px;
    padding:${os(4)}px ${os(7)}px;border-radius:${os(5)}px;pointer-events:none;text-align:center;
    background:rgba(10,8,6,.95);border:1px solid rgba(216,194,144,.55);
    box-shadow:0 3px 10px rgba(0,0,0,.65);
    font-family:"Oswald","Microsoft YaHei",sans-serif;font-size:${ofs(11)}px;line-height:1.45;
    color:#f4e6c4;white-space:normal}
  .gcard .cast-hint.show{display:block;animation:castHint .18s ease-out}
  .gcard .cast-hint.warn{border-color:rgba(226,132,120,.75);color:#ffd9d1}
  @keyframes castHint{from{opacity:0;transform:translateX(-50%) translateY(4px)}
    to{opacity:1;transform:translateX(-50%) translateY(0)}}
  @keyframes cardShake{
    0%,100%{transform:translateX(0)}
    18%{transform:translateX(-4px)}38%{transform:translateX(4px)}
    58%{transform:translateX(-3px)}78%{transform:translateX(2px)}
  }
  .gcard.shake{animation:cardShake .34s ease-in-out}
  .gcard:hover .frame-ornament{animation:ornamentGleam .42s ease-out}
  @keyframes ornamentGleam{0%{filter:brightness(1) drop-shadow(0 2px 2px rgba(0,0,0,.8))}45%{filter:brightness(1.55) drop-shadow(0 0 4px rgba(232,202,132,.45))}100%{filter:brightness(1) drop-shadow(0 2px 2px rgba(0,0,0,.8))}}
  .gcard.defeated{opacity:.32;filter:grayscale(.6)}

  /* 冰冻持续态（程序化冰封）：立绘保持原色，只在四周边缘凝结白霜+冰晶，
     中间罩极淡冷光。一眼看出"被冻住"但脸仍清楚。status-apply 挂、expire/cleanse 卸。 */
  .gcard .frost-layer{position:absolute;inset:-1px;z-index:5;border-radius:9px;overflow:hidden;pointer-events:none;
    opacity:0;transition:opacity .32s ease;isolation:isolate;
    background:
      url("${frostBorderUrl}") center/100% 100% no-repeat,
      radial-gradient(145% 118% at 50% 48%,transparent 58%,rgba(172,226,252,.18) 78%,rgba(220,247,255,.42) 100%);
    box-shadow:inset 0 0 0 1px rgba(226,249,255,.72),inset 0 0 13px rgba(150,215,246,.28);
    filter:drop-shadow(0 0 3px rgba(174,229,255,.58));will-change:opacity,filter}
  /* A finer secondary frost-vein texture breaks up the perimeter and stays legible at card scale. */
  .gcard .frost-layer::before{content:"";position:absolute;inset:0;border-radius:inherit;
    background:url("${frostVeinsUrl}") center/100% 100% no-repeat;
    opacity:.56;mix-blend-mode:screen;filter:saturate(.82) brightness(1.1);
    transform:scale(1.012);transform-origin:center;will-change:opacity,transform}
  /* Keep the center clear; only the outer rim receives a cold-white frozen sheen. */
  .gcard .frost-layer::after{content:"";position:absolute;inset:0;border-radius:inherit;
    background:
      linear-gradient(180deg,rgba(238,252,255,.42),transparent 12%,transparent 88%,rgba(218,246,255,.34)),
      linear-gradient(90deg,rgba(224,249,255,.32),transparent 11%,transparent 89%,rgba(224,249,255,.3)),
      radial-gradient(100% 72% at 24% 4%,rgba(255,255,255,.32),transparent 20%),
      radial-gradient(88% 62% at 86% 96%,rgba(210,244,255,.25),transparent 22%);
    box-shadow:inset 0 0 8px rgba(197,238,255,.18);mix-blend-mode:screen;opacity:.72}
  .gcard.frozen .frost-layer{opacity:1;animation:frostBreath 3.2s ease-in-out infinite}
  .gcard.frozen .frost-layer::before{animation:frostCrystalBreath 4.6s ease-in-out infinite alternate}
  @keyframes frostBreath{
    0%,100%{filter:drop-shadow(0 0 2px rgba(174,229,255,.46)) brightness(.96)}
    50%{filter:drop-shadow(0 0 5px rgba(189,237,255,.7)) brightness(1.1)}}
  @keyframes frostCrystalBreath{
    0%{opacity:.42;transform:scale(1.006)}
    100%{opacity:.68;transform:scale(1.022)}}
  @media (prefers-reduced-motion:reduce){
    .gcard.frozen .frost-layer,.gcard.frozen .frost-layer::before{animation:none}}

  /* ????????????????????????????????? */
  .gcard .silence-layer{position:absolute;inset:0;z-index:5;border-radius:8px;overflow:hidden;pointer-events:none;
    opacity:0;transition:opacity .2s ease;
    background:radial-gradient(circle at 50% 46%,rgba(35,4,43,.28) 0%,rgba(19,3,28,.12) 34%,transparent 62%)}
  .gcard .silence-seal{position:absolute;left:50%;top:46%;width:62%;max-width:112px;aspect-ratio:1;
    background:url("${silenceSealUrl}") center/contain no-repeat;
    transform:translate(-50%,-50%) scale(.48) rotate(-12deg);transform-origin:center;
    opacity:.45;filter:drop-shadow(0 0 2px rgba(255,45,150,.35));
    transition:transform .34s cubic-bezier(.18,.88,.28,1.22),opacity .2s ease,filter .25s ease}
  .gcard .silence-seal::after{content:"";position:absolute;inset:15%;border-radius:50%;
    border:1px solid rgba(255,90,186,.6);box-shadow:0 0 7px rgba(211,64,255,.48),inset 0 0 6px rgba(255,65,160,.3);
    opacity:0;transform:scale(.72);pointer-events:none}
  .gcard.silenced .silence-layer{opacity:1}
  .gcard.silenced .silence-seal{opacity:.96;transform:translate(-50%,-50%) scale(1) rotate(0);
    filter:drop-shadow(0 0 5px rgba(255,42,137,.72)) drop-shadow(0 0 10px rgba(151,56,255,.42));
    animation:silenceSealGlow 2.15s .34s ease-in-out infinite}
  .gcard.silenced .silence-seal::after{animation:silenceSealRipple 2.15s .4s ease-out infinite}
  @keyframes silenceSealGlow{
    0%,100%{opacity:.88;filter:drop-shadow(0 0 4px rgba(255,42,137,.62)) drop-shadow(0 0 8px rgba(151,56,255,.34))}
    50%{opacity:1;filter:drop-shadow(0 0 7px rgba(255,70,160,.88)) drop-shadow(0 0 13px rgba(173,76,255,.56))}}
  @keyframes silenceSealRipple{
    0%{opacity:.55;transform:scale(.72)}
    68%,100%{opacity:0;transform:scale(1.42)}}
  @media (prefers-reduced-motion:reduce){
    .gcard.silenced .silence-seal,.gcard.silenced .silence-seal::after{animation:none}}

  /* ????????????????????????????????? */
  .gcard .entangle-layer{position:absolute;inset:0;z-index:5;border-radius:8px;overflow:hidden;pointer-events:none;
    opacity:0;transition:opacity .24s ease;
    background:linear-gradient(0deg,rgba(8,25,10,.24),transparent 42%)}
  .gcard .entangle-vines{position:absolute;inset:0;
    background:url("${entangleVinesUrl}") center bottom/100% 100% no-repeat;
    opacity:.58;transform:translateY(17%) scale(.88,.62);transform-origin:50% 100%;
    filter:brightness(.82) saturate(.9) drop-shadow(0 2px 2px rgba(0,0,0,.7));
    transition:transform .46s cubic-bezier(.16,.84,.24,1.12),opacity .28s ease,filter .32s ease}
  .gcard .entangle-layer::after{content:"";position:absolute;left:8%;right:8%;bottom:-4%;height:29%;
    border-radius:50%;pointer-events:none;opacity:0;transform:scale(.72);
    background:radial-gradient(ellipse at center,rgba(78,255,111,.34) 0%,rgba(39,166,69,.14) 45%,transparent 73%);
    filter:blur(2px);mix-blend-mode:screen}
  .gcard.entangled .entangle-layer{opacity:1}
  .gcard.entangled .entangle-vines{opacity:.96;transform:translateY(0) scale(1);
    filter:brightness(.96) saturate(1.08) drop-shadow(0 2px 3px rgba(0,0,0,.8)) drop-shadow(0 0 4px rgba(57,213,89,.28));
    animation:entangleVineBreath 3s .46s ease-in-out infinite}
  .gcard.entangled .entangle-layer::after{animation:entangleRootPulse 2.6s .28s ease-in-out infinite}
  @keyframes entangleVineBreath{
    0%,100%{filter:brightness(.92) saturate(1.02) drop-shadow(0 2px 3px rgba(0,0,0,.8)) drop-shadow(0 0 3px rgba(57,213,89,.2))}
    50%{filter:brightness(1.05) saturate(1.18) drop-shadow(0 2px 3px rgba(0,0,0,.8)) drop-shadow(0 0 6px rgba(72,238,105,.4))}}
  @keyframes entangleRootPulse{
    0%,100%{opacity:.18;transform:scale(.84)}
    50%{opacity:.48;transform:scale(1.05)}}
  @media (prefers-reduced-motion:reduce){
    .gcard.entangled .entangle-vines,.gcard.entangled .entangle-layer::after{animation:none}}

  /* 状态持续层：缺少专属序列帧的状态用 CSS 纹理表达，不遮挡立绘。 */
  .gcard .status-accent-layer{position:absolute;inset:0;z-index:4;border-radius:8px;pointer-events:none;
    opacity:0;overflow:hidden;transition:opacity .24s ease;mix-blend-mode:screen}
  .gcard .status-accent-layer::before,.gcard .status-accent-layer::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none}
  .gcard.status-accent-death-mark .status-accent-layer{opacity:1;
    box-shadow:inset 0 0 0 1px rgba(255,74,76,.85),inset 0 0 18px rgba(173,21,36,.38);
    animation:statusDeathMarkPulse 1.8s ease-in-out infinite}
  .gcard.status-accent-death-mark .status-accent-layer::before{background:radial-gradient(circle at 50% 45%,transparent 42%,rgba(255,45,56,.16) 72%,rgba(120,10,24,.4) 100%)}
  .gcard.status-accent-curse .status-accent-layer{opacity:1;
    box-shadow:inset 0 0 0 1px rgba(170,107,255,.72),inset 0 0 15px rgba(94,36,148,.38)}
  .gcard.status-accent-curse .status-accent-layer::before{inset:14%;border:1px dashed rgba(206,155,255,.54);transform:rotate(12deg);animation:statusRuneSpin 5s linear infinite}
  .gcard.status-accent-curse .status-accent-layer::after{background:radial-gradient(circle at 50% 24%,rgba(191,125,255,.2),transparent 40%)}
  .gcard.status-accent-disease .status-accent-layer{opacity:1;
    box-shadow:inset 0 0 0 1px rgba(191,202,74,.66),inset 0 0 18px rgba(113,123,28,.3)}
  .gcard.status-accent-disease .status-accent-layer::before{background:radial-gradient(circle at 22% 26%,rgba(218,239,111,.3) 0 2%,transparent 3%),radial-gradient(circle at 74% 64%,rgba(185,208,65,.25) 0 1.5%,transparent 2.5%),radial-gradient(circle at 48% 82%,rgba(218,239,111,.22) 0 1%,transparent 2%);animation:statusDiseaseDrift 3.8s ease-in-out infinite}
  .gcard.status-accent-mana-burn .status-accent-layer{opacity:1;
    box-shadow:inset 0 0 0 1px rgba(104,126,255,.62),inset 0 0 18px rgba(40,49,151,.38)}
  .gcard.status-accent-mana-burn .status-accent-layer::before{background:linear-gradient(155deg,transparent 30%,rgba(91,113,255,.2) 48%,transparent 66%);animation:statusManaBurnSweep 1.7s ease-in-out infinite}
  .gcard.status-accent-charm .status-accent-layer{opacity:1;box-shadow:inset 0 0 0 1px rgba(255,133,214,.62),inset 0 0 18px rgba(168,53,131,.24)}
  .gcard.status-accent-charm .status-accent-layer::before{background:radial-gradient(ellipse at 50% 18%,rgba(255,166,226,.28),transparent 54%);animation:statusCharmPulse 2.4s ease-in-out infinite}
  .gcard.status-accent-rage .status-accent-layer{opacity:1;box-shadow:inset 0 0 0 1px rgba(255,142,83,.62),inset 0 0 18px rgba(169,51,28,.28)}
  .gcard.status-accent-rage .status-accent-layer::before{background:linear-gradient(180deg,rgba(255,98,46,.22),transparent 48%);animation:statusRagePulse 1.1s ease-in-out infinite}
  .gcard.status-accent-wolf .status-accent-layer{opacity:1;box-shadow:inset 0 0 0 1px rgba(187,216,255,.62),inset 0 0 18px rgba(101,132,181,.28)}
  .gcard.status-accent-wolf .status-accent-layer::before{background:linear-gradient(135deg,rgba(222,240,255,.2),transparent 42%,rgba(115,161,215,.18));animation:statusWolfSheen 2.8s ease-in-out infinite}
  /* 织网（UX 审查 P1#5）：蛛网主题——双角蛛网环纹 + 紫晕，事件 status-apply/expire 驱动 */
  .gcard.status-accent-web .status-accent-layer{opacity:1;
    box-shadow:inset 0 0 0 1px rgba(176,122,224,.72),inset 0 0 16px rgba(94,36,148,.36)}
  .gcard.status-accent-web .status-accent-layer::before{background:
    repeating-radial-gradient(circle at 16% 6%,transparent 0 8px,rgba(208,176,238,.34) 8px 9.5px,transparent 9.5px 18px),
    repeating-radial-gradient(circle at 88% 94%,transparent 0 8px,rgba(208,176,238,.26) 8px 9.5px,transparent 9.5px 18px);
    animation:statusWebShimmer 3.2s ease-in-out infinite}
  .gcard.status-accent-web .status-accent-layer::after{background:
    radial-gradient(circle at 18% 8%,rgba(191,125,255,.24),transparent 44%),
    radial-gradient(circle at 86% 92%,rgba(191,125,255,.18),transparent 40%)}
  /* 出血：暗红下渗（DoT 无专属 tick 帧动画，徽记之外给一条持续血渍层） */
  .gcard.status-accent-bleed .status-accent-layer{opacity:1;
    box-shadow:inset 0 0 0 1px rgba(224,67,90,.6),inset 0 0 14px rgba(122,10,26,.34)}
  .gcard.status-accent-bleed .status-accent-layer::before{background:linear-gradient(180deg,transparent 58%,rgba(224,67,90,.26) 80%,rgba(122,10,26,.52));animation:statusBleedSeep 2.8s ease-in-out infinite}
  .gcard.status-accent-bleed .status-accent-layer::after{background:radial-gradient(ellipse at 50% 104%,rgba(224,67,90,.24),transparent 56%)}
  /* 屏障：青盾斜光（吸收态无专属帧动画，给盾面光扫） */
  .gcard.status-accent-barrier .status-accent-layer{opacity:1;
    box-shadow:inset 0 0 0 1px rgba(102,217,232,.66),inset 0 0 16px rgba(20,94,110,.3)}
  .gcard.status-accent-barrier .status-accent-layer::before{background:linear-gradient(145deg,transparent 34%,rgba(140,236,247,.22) 50%,transparent 66%);animation:statusBarrierSweep 2.4s ease-in-out infinite}
  .gcard.status-accent-barrier .status-accent-layer::after{background:radial-gradient(ellipse at 50% 6%,rgba(140,236,247,.2),transparent 42%)}
  /* 下潮：水面线 + 波光（不可指定目标的持续语义可见化） */
  .gcard.status-accent-submerged .status-accent-layer{opacity:1;
    box-shadow:inset 0 0 0 1px rgba(74,168,216,.62),inset 0 0 18px rgba(16,70,96,.32)}
  .gcard.status-accent-submerged .status-accent-layer::before{background:linear-gradient(180deg,rgba(74,168,216,.3) 0%,rgba(74,168,216,.1) 18%,transparent 40%);animation:statusSubmergeSway 3.4s ease-in-out infinite}
  .gcard.status-accent-submerged .status-accent-layer::after{background:radial-gradient(ellipse at 50% 0%,rgba(159,216,239,.26),transparent 46%)}
  /* 猎人标记：红色准星晕（纯标记状态的在场提示） */
  .gcard.status-accent-marked .status-accent-layer{opacity:1;
    box-shadow:inset 0 0 0 1px rgba(255,107,74,.6),inset 0 0 14px rgba(140,32,12,.3)}
  .gcard.status-accent-marked .status-accent-layer::before{background:radial-gradient(circle at 50% 44%,transparent 30%,rgba(255,107,74,.14) 62%,rgba(120,22,8,.4) 100%);animation:statusMarkedPulse 2s ease-in-out infinite}
  .gcard.status-accent-marked .status-accent-layer::after{background:
    linear-gradient(180deg,transparent calc(44% - 1px),rgba(255,139,121,.4) 44%,transparent calc(44% + 1px)),
    linear-gradient(90deg,transparent calc(50% - 1px),rgba(255,139,121,.4) 50%,transparent calc(50% + 1px))}
  /* 精灵火：紫色焰晕（妖火=紫光，受法术伤害 +50% 的在场提示） */
  .gcard.status-accent-faerie-fire .status-accent-layer{opacity:1;
    box-shadow:inset 0 0 0 1px rgba(201,139,255,.66),inset 0 0 16px rgba(90,45,138,.36)}
  .gcard.status-accent-faerie-fire .status-accent-layer::before{background:radial-gradient(ellipse at 50% 88%,rgba(201,139,255,.3),rgba(122,60,190,.14) 48%,transparent 72%);animation:statusFaerieFlicker 1.9s ease-in-out infinite}
  .gcard.status-accent-faerie-fire .status-accent-layer::after{background:radial-gradient(circle at 50% 30%,rgba(227,198,255,.16),transparent 40%)}
  /* 恐怖：暗紫压迫晕（邪眼主题的持续层，位次交换事件另有演出） */
  .gcard.status-accent-terror .status-accent-layer{opacity:1;
    box-shadow:inset 0 0 0 1px rgba(176,122,224,.6),inset 0 0 18px rgba(42,20,64,.44)}
  .gcard.status-accent-terror .status-accent-layer::before{background:radial-gradient(ellipse at 50% 16%,rgba(176,122,224,.22),transparent 52%);animation:statusTerrorDread 2.6s ease-in-out infinite}
  .gcard.status-accent-terror .status-accent-layer::after{background:linear-gradient(180deg,transparent 60%,rgba(28,18,48,.5))}
  /* 中毒：底部绿色毒雾缓升 */
  .gcard.status-accent-poison .status-accent-layer{opacity:1;
    box-shadow:inset 0 0 0 1px rgba(120,233,95,.55),inset 0 0 14px rgba(40,110,30,.3)}
  .gcard.status-accent-poison .status-accent-layer::before{background:radial-gradient(ellipse at 30% 100%,rgba(120,233,95,.3),transparent 50%),radial-gradient(ellipse at 72% 104%,rgba(120,233,95,.24),transparent 46%);animation:statusPoisonRise 3s ease-in-out infinite}
  /* 燃烧：底部橙焰晕闪烁 */
  .gcard.status-accent-burning .status-accent-layer{opacity:1;
    box-shadow:inset 0 0 0 1px rgba(255,122,53,.62),inset 0 0 16px rgba(160,50,10,.34)}
  .gcard.status-accent-burning .status-accent-layer::before{background:linear-gradient(0deg,rgba(255,122,53,.34) 0%,rgba(255,180,80,.12) 22%,transparent 42%);animation:statusBurnFlicker .9s ease-in-out infinite}
  /* 附魔：紫色符光沿边流转 */
  .gcard.status-accent-enchanted .status-accent-layer{opacity:1;
    box-shadow:inset 0 0 0 1px rgba(224,140,255,.66),inset 0 0 14px rgba(120,40,170,.3)}
  .gcard.status-accent-enchanted .status-accent-layer::before{inset:10%;border:1px dotted rgba(236,190,255,.6);border-radius:50%;animation:statusRuneSpin 7s linear infinite}
  /* 赐福：顶部金色圣光 */
  .gcard.status-accent-blessed .status-accent-layer{opacity:1;
    box-shadow:inset 0 0 0 1px rgba(255,213,106,.72),inset 0 0 16px rgba(170,130,30,.3)}
  .gcard.status-accent-blessed .status-accent-layer::before{background:radial-gradient(ellipse at 50% -6%,rgba(255,236,160,.42),transparent 50%);animation:statusBlessGlow 2.4s ease-in-out infinite}
  /* 反射：镜面斜光快扫 */
  .gcard.status-accent-reflect .status-accent-layer{opacity:1;
    box-shadow:inset 0 0 0 1px rgba(158,207,255,.7),inset 0 0 12px rgba(60,110,170,.28)}
  .gcard.status-accent-reflect .status-accent-layer::before{background:linear-gradient(120deg,transparent 38%,rgba(230,244,255,.34) 48%,transparent 56%);animation:statusBarrierSweep 1.8s ease-in-out infinite}
  @keyframes statusPoisonRise{0%,100%{transform:translateY(4%);opacity:.5}50%{transform:translateY(-3%);opacity:1}}
  @keyframes statusBurnFlicker{0%,100%{opacity:.6}40%{opacity:1}70%{opacity:.75}}
  @keyframes statusBlessGlow{0%,100%{opacity:.55}50%{opacity:1}}
  @keyframes statusDeathMarkPulse{0%,100%{opacity:.68}50%{opacity:1}}
  @keyframes statusRuneSpin{to{transform:rotate(372deg)}}
  @keyframes statusDiseaseDrift{0%,100%{transform:translate(0,0)}50%{transform:translate(2%, -2%)}}
  @keyframes statusManaBurnSweep{0%,100%{transform:translateX(-18%);opacity:.45}50%{transform:translateX(18%);opacity:1}}
  @keyframes statusCharmPulse{0%,100%{opacity:.45;transform:scale(.94)}50%{opacity:1;transform:scale(1.04)}}
  @keyframes statusRagePulse{0%,100%{opacity:.45}50%{opacity:1}}
  @keyframes statusWolfSheen{0%,100%{transform:translateX(-12%);opacity:.45}50%{transform:translateX(12%);opacity:1}}
  @keyframes statusWebShimmer{0%,100%{opacity:.45}50%{opacity:1}}
  @keyframes statusBleedSeep{0%,100%{opacity:.55}50%{opacity:1}}
  @keyframes statusBarrierSweep{0%,100%{transform:translateX(-14%);opacity:.5}50%{transform:translateX(14%);opacity:1}}
  @keyframes statusSubmergeSway{0%,100%{transform:translateY(0);opacity:.6}50%{transform:translateY(3%);opacity:1}}
  @keyframes statusMarkedPulse{0%,100%{opacity:.6}50%{opacity:1}}
  @keyframes statusFaerieFlicker{0%,100%{opacity:.55}50%{opacity:1}}
  @keyframes statusTerrorDread{0%,100%{opacity:.5}50%{opacity:1}}
  @media (prefers-reduced-motion:reduce){
    .gcard.status-accent-death-mark .status-accent-layer,.gcard.status-accent-curse .status-accent-layer::before,
    .gcard.status-accent-disease .status-accent-layer::before,.gcard.status-accent-mana-burn .status-accent-layer::before,
    .gcard.status-accent-charm .status-accent-layer::before,.gcard.status-accent-rage .status-accent-layer::before,
    .gcard.status-accent-wolf .status-accent-layer::before,.gcard.status-accent-web .status-accent-layer::before,
    .gcard.status-accent-bleed .status-accent-layer::before,.gcard.status-accent-barrier .status-accent-layer::before,
    .gcard.status-accent-submerged .status-accent-layer::before,.gcard.status-accent-marked .status-accent-layer::before,
    .gcard.status-accent-faerie-fire .status-accent-layer::before,.gcard.status-accent-terror .status-accent-layer::before,
    .gcard.status-accent-poison .status-accent-layer::before,.gcard.status-accent-burning .status-accent-layer::before,
    .gcard.status-accent-enchanted .status-accent-layer::before,.gcard.status-accent-blessed .status-accent-layer::before,
    .gcard.status-accent-reflect .status-accent-layer::before{animation:none}}


  /* 立绘层裁切到圆角；卡本身不裁切，便于宝石出框悬挂 */
  .gcard .art{position:absolute;inset:0;z-index:0;border-radius:8px;overflow:hidden}
  .gcard .photo{position:absolute;inset:0;background-size:cover;background-position:50% 12%;background-repeat:no-repeat}
  .gcard.has-photo .base,.gcard.has-photo .mass,.gcard.has-photo .shard,.gcard.has-photo .focal{display:none}
  .gcard .base{position:absolute;inset:0}
  .gcard .mass{position:absolute;inset:-6% -10% -2% -4%;clip-path:polygon(16% 0,100% 0,100% 100%,38% 100%);mix-blend-mode:screen;opacity:.92}
  .gcard .shard{position:absolute;inset:0;clip-path:polygon(0 56%,52% 32%,72% 100%,0 100%);opacity:.5;mix-blend-mode:screen}
  .gcard .focal{position:absolute;left:44%;top:18%;width:38%;aspect-ratio:1;border-radius:50%}
  .gcard .vig{position:absolute;inset:0;background:
    radial-gradient(125% 92% at 50% 42%, transparent 52%, rgba(0,0,0,.42) 100%),
    linear-gradient(180deg, transparent 0%, transparent 58%, rgba(0,0,0,.46) 78%, rgba(0,0,0,.80) 100%)}
  .gcard .grain{position:absolute;inset:-50%;opacity:.06;mix-blend-mode:overlay;pointer-events:none;background-image:${GRAIN_URI}}

  .skin-rust .base{background:radial-gradient(120% 95% at 50% 14%,#6f4631 0%,#3c2a22 46%,#140f0c 100%)}
  .skin-rust .mass{background:linear-gradient(135deg,#9a6b4a,#5a3a28 60%,#241712)}
  .skin-rust .shard{background:linear-gradient(135deg,#b3835a,#3c2a22)}
  .skin-rust .focal{background:radial-gradient(42% 42% at 38% 34%,#caa06f,#5a3a2800 64%)}
  .skin-teal .base{background:radial-gradient(120% 95% at 50% 14%,#3c5b59 0%,#1f2e2d 46%,#0c1211 100%)}
  .skin-teal .mass{background:linear-gradient(135deg,#5c8480,#34504e 60%,#16201f)}
  .skin-teal .shard{background:linear-gradient(135deg,#79a39d,#1f2e2d)}
  .skin-teal .focal{background:radial-gradient(42% 42% at 38% 34%,#8fb8b2,#34504e00 64%)}
  .skin-steel .base{background:radial-gradient(120% 95% at 50% 14%,#3f566e 0%,#222f3e 46%,#0b1018 100%)}
  .skin-steel .mass{background:linear-gradient(135deg,#5f7ea0,#35495f 60%,#161f2a)}
  .skin-steel .shard{background:linear-gradient(135deg,#7c9bbd,#222f3e)}
  .skin-steel .focal{background:radial-gradient(42% 42% at 38% 34%,#9ab4d0,#35495f00 64%)}
  .skin-sand .base{background:radial-gradient(120% 95% at 50% 14%,#836b46 0%,#3a2f1e 46%,#14100a 100%)}
  .skin-sand .mass{background:linear-gradient(135deg,#b39a6e,#6e5a3a 60%,#2c2415)}
  .skin-sand .shard{background:linear-gradient(135deg,#cbb083,#3a2f1e)}
  .skin-sand .focal{background:radial-gradient(42% 42% at 38% 34%,#dcc290,#6e5a3a00 64%)}
  .skin-plum .base{background:radial-gradient(120% 95% at 50% 14%,#573a48 0%,#281a21 46%,#100b0e 100%)}
  .skin-plum .mass{background:linear-gradient(135deg,#84566a,#4c333f 60%,#1f151b)}
  .skin-plum .shard{background:linear-gradient(135deg,#a06e85,#281a21)}
  .skin-plum .focal{background:radial-gradient(42% 42% at 38% 34%,#bd8aa1,#4c333f00 64%)}
  .skin-sepia .base{background:radial-gradient(120% 95% at 50% 14%,#5a3f2c 0%,#2a1d12 46%,#120c08 100%)}
  .skin-sepia .mass{background:linear-gradient(135deg,#8a6440,#543d28 60%,#221810)}
  .skin-sepia .shard{background:linear-gradient(135deg,#a67e52,#2a1d12)}
  .skin-sepia .focal{background:radial-gradient(42% 42% at 38% 34%,#c79a66,#543d2800 64%)}

  .v2 .mass{clip-path:polygon(0 0,84% 0,62% 100%,0 100%)}
  .v2 .shard{clip-path:polygon(100% 52%,48% 30%,100% 100%)}
  .v2 .focal{left:30%}
  .v3 .mass{clip-path:polygon(10% 0,100% 0,100% 100%,30% 100%)}
  .v3 .focal{left:46%;top:22%}
  .v4 .mass{clip-path:polygon(0 0,90% 0,68% 100%,0 100%)}
  .v4 .shard{clip-path:polygon(58% 26%,100% 44%,100% 100%,42% 100%)}
  .v4 .focal{left:34%;top:20%}

  /* Defense faces the board; attack stays outside. Enemy overlays mirror allies. */
  .gcard .ov{position:absolute;z-index:6}
  .gcard .c-tl{top:${os(8)}px;left:${os(9)}px;right:${os(14)}px}
  .gcard .c-bl{left:var(--card-inset);bottom:var(--card-inset)}
  .gcard .c-br{right:var(--card-inset);bottom:var(--card-inset);text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:var(--stat-gap)}
  .gcard.enemy .c-bl{left:auto;right:var(--card-inset)}
  .gcard.enemy .c-br{left:var(--card-inset);right:auto;text-align:left;align-items:flex-start}
  .gcard.frozen .c-bl,.gcard.frozen .c-br{isolation:isolate}
  .gcard.frozen .c-bl::before,.gcard.frozen .c-br::before{content:"";position:absolute;z-index:-1;
    inset:-${os(7)}px -${os(9)}px -${os(6)}px;border-radius:${os(12)}px;pointer-events:none;
    background:radial-gradient(ellipse at 50% 68%,rgba(3,12,18,.82) 0%,rgba(4,14,21,.48) 50%,transparent 78%);
    filter:blur(1px)}

  .gcard .name{display:none}
  .gcard .name-rule{display:none}

  /* 法力宝石：贴着卡片左上角、嵌进边框的"书签式"角标（与立绘卡同源的边框语言）。
     外侧两角与卡片圆角对齐(左上=卡圆角)，仅内侧(右下)收大圆角，像长在边框上而非浮在画面里。 */
  /* 宝石只是卡面的一部分：点它与点卡面其它位置一样执行卡片动作（打开详情窗/快速释放），
     法力进度浮窗只在鼠标悬停时出现（statusTooltip）。 */
  .gcard .gem{position:absolute;top:0;left:0;z-index:6;
    width:${gemSize()}px;height:${gemSize()}px;padding:${Math.round(gemSize() * 0.12)}px;
    /* 底衬贴住宝石：留白过大会在空法力（暗态）时读成一大块黑板 */
    box-sizing:border-box;cursor:pointer;
    background:linear-gradient(135deg,rgba(20,18,15,.92),rgba(11,10,9,.82));
    border:1px solid rgba(216,194,144,.4);border-top-color:rgba(216,194,144,.5);
    border-left-color:rgba(216,194,144,.5);
    border-radius:${os(8)}px 0 ${os(12)}px 0;
    box-shadow:1px 1px 4px rgba(0,0,0,.5)}
  .gcard .gem svg{display:block;width:100%;height:100%;overflow:visible;
    filter:drop-shadow(0 1px 2px rgba(0,0,0,.85))}
  .gcard .gem::before{content:"";position:absolute;left:100%;top:-1px;width:${os(15)}px;height:1px;
    background:linear-gradient(90deg,rgba(225,202,145,.72),transparent);pointer-events:none}
  .gcard .gem::after{content:"";position:absolute;left:-1px;top:100%;width:1px;height:${os(15)}px;
    background:linear-gradient(180deg,rgba(225,202,145,.72),transparent);pointer-events:none}
  .gcard .mana-absorb-flash{position:absolute;inset:-${os(8)}px;z-index:-1;border-radius:50%;pointer-events:none;
    background:radial-gradient(circle,var(--absorb-color) 0%,color-mix(in srgb,var(--absorb-color) 62%,transparent) 34%,transparent 72%);
    mix-blend-mode:screen;filter:blur(1px)}
  .gcard .gem .seat{fill:rgba(11,10,9,.25)}             /* 极浅底，仅作轻微衬托 */
  .gcard .gem .dim{opacity:.72}                          /* 未充能：淡，但保留可辨识的颜色 */
  .gcard .gem .facets{fill:none;stroke:rgba(255,255,255,.22);stroke-width:5}
  .gcard .gem .lit{opacity:1} /* 充能层：满饱和原色，与淡色未充能拉开 */
  /* 满充：书签描边转暖金 + 内部宝石发光（书签本体不缩放，避免脱离边角） */
  .gcard.mana-full .gem{border-color:#c9a35c;border-top-color:#d8b86a;border-left-color:#d8b86a;
    box-shadow:1px 1px 4px rgba(0,0,0,.5),0 0 7px rgba(232,200,121,.45)}
  .gcard.mana-full .gem svg{filter:drop-shadow(0 0 4px rgba(232,200,121,.9));
    animation:gemBreath 1.4s ease-in-out infinite}
  /* 沉默：满法力也放不出技能——法力宝石呼吸暗下去、去暖金光，表达"能量被封" */
  .gcard.silenced.mana-full .gem{border-color:#5a4a6e;border-top-color:#6a577f;border-left-color:#6a577f;
    box-shadow:1px 1px 4px rgba(0,0,0,.55)}
  .gcard.silenced.mana-full .gem svg{filter:grayscale(.5) brightness(.6) drop-shadow(0 0 2px rgba(120,90,150,.5));
    animation:gemSilenced 2.4s ease-in-out infinite}
  @keyframes gemSilenced{0%,100%{opacity:.5}50%{opacity:.78}}
  @keyframes gemBreath{
    0%,100%{transform:scale(1)}
    50%{transform:scale(1.12)}
  }
  /* 宝石上的法力「当前/上限」（GoW 法力球同款读法 6/12）：不占新位置，压在宝石书签上；
     当前值是主体，/上限 缩小一档。放得下时在书签内居中，放不下（小屏 12/12）时从书签左缘
     向右延伸，不裁切。与攻击/生命/魔力同一套衬线数字，四向暗描边保证落在任何宝石颜色上都读得清。
     跟随卡面「显示法力」（法力流抵达才涨），不跟引擎值。空=压暗，充能中=暖白，满=暖金，沉默且满=灰紫。 */
  .gcard .gem .gem-mana{position:absolute;left:0;top:0;bottom:0;z-index:1;min-width:100%;width:max-content;
    display:flex;align-items:center;justify-content:center;white-space:nowrap;
    pointer-events:none;font-family:"Playfair Display",Georgia,serif;font-weight:800;line-height:1;
    font-size:${Math.max(10, Math.round(gemSize() * 0.4))}px;font-variant-numeric:tabular-nums;letter-spacing:-.03em;
    color:#f3ead6;
    text-shadow:1px 0 0 rgba(10,8,6,.92),-1px 0 0 rgba(10,8,6,.92),0 1px 0 rgba(10,8,6,.92),0 -1px 0 rgba(10,8,6,.92),
      0 1px 3px rgba(0,0,0,.9);transition:color .2s ease}
  .gcard .gem .gem-mana .max{font-size:${Math.max(8, Math.round(gemSize() * 0.29))}px;font-weight:700;opacity:.86;
    margin-left:.04em}
  .gcard .gem .gem-mana.is-zero{color:rgba(243,234,214,.62)}
  .gcard.mana-full .gem .gem-mana{color:#ffe6a8;
    text-shadow:1px 0 0 rgba(10,8,6,.92),-1px 0 0 rgba(10,8,6,.92),0 1px 0 rgba(10,8,6,.92),0 -1px 0 rgba(10,8,6,.92),
      0 0 6px rgba(232,200,121,.7)}
  .gcard.silenced.mana-full .gem .gem-mana{color:#b9aecb;
    text-shadow:1px 0 0 rgba(10,8,6,.92),-1px 0 0 rgba(10,8,6,.92),0 1px 0 rgba(10,8,6,.92),0 -1px 0 rgba(10,8,6,.92)}
  /* 整张卡是一个按钮：键盘聚焦时才画描边（鼠标/触控点击不出框） */
  .gcard:focus{outline:none}
  .gcard:focus-visible{outline:2px solid rgba(240,222,170,.9);outline-offset:2px}

  /* Match the troop detail card palette; icon and numeral keep distinct tones. */
  .gcard .stat{display:flex;align-items:center;gap:var(--stat-gap);white-space:nowrap}
  .gcard.ally .c-br .stat,.gcard.enemy .stat-atk{flex-direction:row-reverse}
  .gcard .stat .ic{flex:none;width:var(--stat-icon);height:var(--stat-icon);
    filter:drop-shadow(0 1px 2px rgba(0,0,0,.8))}
  .gcard .stat .v{font-family:"Playfair Display",Georgia,serif;font-weight:800;line-height:1.1;font-size:var(--stat-font);
    font-variant-numeric:tabular-nums;letter-spacing:-.01em;text-shadow:0 1px 2px rgba(0,0,0,.95),0 0 4px rgba(0,0,0,.55)}
  .gcard .stat-atk{color:#d6c397}
  .gcard .stat-atk .v{color:#fff1d4}
  .gcard .stat-armor{color:#c5c8ce}
  .gcard .stat-armor .v{color:#e4e6ea}
  .gcard .stat-hp{color:#c45454}
  .gcard .stat-hp .v{color:#e07070}
  .gcard .stat .ic{fill:currentColor}

  .gcard .magic{position:absolute;top:0;right:0;z-index:6;
    height:${os(21)}px;padding:0 ${os(6)}px 0 ${os(5)}px;box-sizing:border-box;
    display:flex;align-items:center;gap:${os(3)}px;pointer-events:none;
    background:linear-gradient(225deg,rgba(38,26,54,.94),rgba(16,11,22,.86));
    border:1px solid rgba(178,140,224,.42);border-top-color:rgba(200,166,240,.6);
    border-right-color:rgba(200,166,240,.6);
    border-radius:0 ${os(8)}px 0 ${os(12)}px;
    box-shadow:-1px 1px 4px rgba(0,0,0,.5),inset 0 0 6px rgba(140,90,200,.22)}
  .gcard .magic .ic-magic{flex:none;width:${os(14)}px;height:${os(14)}px;filter:drop-shadow(0 0 3px rgba(180,130,240,.7))}
  .gcard .magic .v{font-family:"Playfair Display",Georgia,serif;font-weight:800;line-height:1;font-size:${ofs(13)}px;
    letter-spacing:-.01em;color:#f1e9ff;text-shadow:0 1px 2px rgba(0,0,0,.95),0 0 5px rgba(150,100,210,.5)}

  /* 状态图标恢复到底部数值上方，避免与右上角魔力值冲突。 */
  .gcard .status-strip{position:absolute;z-index:6;left:var(--card-inset);bottom:var(--status-bottom);
    display:flex;flex-wrap:wrap-reverse;gap:${os(3)}px;max-width:${CARD_W - os(12)}px;pointer-events:none}
  .gcard.enemy .status-strip{left:auto;right:var(--card-inset);justify-content:flex-end}
  /* B-7（UX 阶段 B）：徽记尺寸设 24px 绝对下限。阶段 A 实测移动横屏（740×400）徽记
     缩到 17×17、相邻间距约 2px，而它是本页唯一"可点内容"——点偏就落到卡面上，
     卡面短按是**释放技能**，代价不对称且不可撤销。实际尺寸由 resize() 按实时卡宽
     写 --sbz（取 max(24, 等比值)）；CSS 只给缺省值，窗口缩放后不会留旧值。 */
  .gcard .status-badge{position:relative;display:inline-flex;align-items:center;justify-content:center;
    width:var(--sbz,${Math.max(24, os(20))}px);height:var(--sbz,${Math.max(24, os(20))}px);
    border-radius:${os(5)}px;
    background:rgba(11,10,9,.82);border:1px solid color-mix(in srgb,var(--sb) 55%,rgba(216,194,144,.4));
    box-shadow:0 1px 3px rgba(0,0,0,.6),0 0 5px color-mix(in srgb,var(--sb) 40%,transparent)}
  .gcard .status-badge img,.gcard .status-badge .status-icon-fallback{
    display:block;width:var(--sbiz,${Math.max(20, os(17))}px);height:var(--sbiz,${Math.max(20, os(17))}px);
    object-fit:contain;
    filter:drop-shadow(0 0 2px color-mix(in srgb,var(--sb) 70%,transparent))}
  .gcard .status-badge .status-icon-fallback{font:700 ${ofs(12)}px/1 "Oswald",sans-serif;
    text-align:center;color:#cfd2d6}
  /* B-8（UX 阶段 B）：徽记"可点"暗示。此前唯一线索是 cursor:pointer（触屏上完全不可见），
     而点击才是那份好说明（自绘浮层）的唯一入口。右上角一枚小三角 + hover 提亮描边。 */
  .gcard .status-badge::after{content:"";position:absolute;right:1px;top:1px;
    border-left:${Math.max(3, os(4))}px solid transparent;
    border-top:${Math.max(3, os(4))}px solid color-mix(in srgb,var(--sb) 78%,#ffffff);
    opacity:.7;pointer-events:none}
  .gcard .status-badge:hover{border-color:color-mix(in srgb,var(--sb) 92%,#ffffff);
    box-shadow:0 1px 3px rgba(0,0,0,.6),0 0 9px color-mix(in srgb,var(--sb) 62%,transparent)}
  .gcard .status-badge:hover::after{opacity:1}
  .gcard .status-badge.status-discovery,.gcard .status-more.status-discovery{animation:statusDiscovery 1.15s ease-out 2}
  @keyframes statusDiscovery{
    0%,100%{transform:scale(1);box-shadow:0 1px 3px rgba(0,0,0,.6)}
    45%{transform:scale(1.16);box-shadow:0 0 0 4px rgba(240,222,170,.24),0 0 12px var(--sb,#d8c290)}
  }
  /* B-7 折叠态入口：+N 一次点开全部状态（走详情面板的"当前状态"区） */
  .gcard .status-more{display:inline-flex;align-items:center;justify-content:center;
    width:var(--ssz,var(--sbz,${Math.max(24, os(20))}px));height:var(--ssz,var(--sbz,${Math.max(24, os(20))}px));
    padding:0;box-sizing:border-box;border-radius:${os(5)}px;cursor:pointer;pointer-events:auto;
    color:#f0e2bf;background:rgba(11,10,9,.88);border:1px solid rgba(216,194,144,.62);
    font-family:"Oswald",sans-serif;font-weight:700;font-size:${ofs(10)}px;line-height:1;white-space:nowrap}
  .gcard .status-more:hover{color:#fff3d2;border-color:#e0c98a}
  .gcard .status-badge .sb-turns{position:absolute;right:-3px;bottom:-3px;min-width:11px;height:11px;
    padding:0 1px;box-sizing:border-box;border-radius:6px;background:#0b0a09;border:1px solid var(--sb);
    font-family:"Oswald",sans-serif;font-size:8px;line-height:9px;text-align:center;color:#f0e2bf}
  /* 增益 / 减益形状区分（不只靠颜色）：增益=圆顶盾形 + 左上 ▲；减益=方形 + 右上 ◣（沿用既有三角） */
  .gcard .status-badge.sb-pos{border-radius:50% 50% ${os(5)}px ${os(5)}px / 42% 42% ${os(5)}px ${os(5)}px;
    background:linear-gradient(180deg,rgba(40,34,18,.9),rgba(11,10,9,.84))}
  .gcard .status-badge.sb-pos::after{right:auto;left:50%;top:-1px;transform:translateX(-50%);
    border-left:${Math.max(3, os(3))}px solid transparent;border-right:${Math.max(3, os(3))}px solid transparent;
    border-top:0;border-bottom:${Math.max(3, os(4))}px solid color-mix(in srgb,var(--sb) 78%,#ffffff)}
  .gcard .status-badge.sb-neg{border-style:solid;border-width:1px 1px 2px 1px}

  /* 状态「中招」徽印（announceStatus）：素材 src/assets/fx/status-emblems，位于立绘之上、飘字之下 */
  .gcard .status-emblem{position:absolute;left:50%;top:42%;width:62%;max-width:150px;aspect-ratio:1;object-fit:contain;
    z-index:11;pointer-events:none;opacity:0;will-change:transform,opacity;
    filter:drop-shadow(0 2px 4px rgba(0,0,0,.7)) drop-shadow(0 0 10px color-mix(in srgb,var(--em) 70%,transparent))}
  .gcard .status-emblem-flash{position:absolute;inset:0;border-radius:8px;z-index:10;pointer-events:none;opacity:0;
    background:radial-gradient(circle at 50% 42%,color-mix(in srgb,var(--em) 55%,#fff) 0%,color-mix(in srgb,var(--em) 42%,transparent) 26%,transparent 60%)}
  .gcard .status-emblem-ring{position:absolute;left:50%;top:42%;width:78%;aspect-ratio:1;border-radius:50%;z-index:10;pointer-events:none;opacity:0;
    border:2px solid color-mix(in srgb,var(--em) 80%,#fff);box-shadow:0 0 12px var(--em),inset 0 0 10px color-mix(in srgb,var(--em) 60%,transparent)}

  /* 状态演出提示层（statusCue / stunStars，代码绘制，有限动画） */
  .gcard .status-cue{position:absolute;inset:-3px;border-radius:11px;pointer-events:none;z-index:31}
  .gcard .status-cue-pulse{border:2px solid var(--cue);box-shadow:0 0 12px 1px var(--cue),inset 0 0 12px color-mix(in srgb,var(--cue) 45%,transparent)}
  .gcard .status-cue-burst{background:radial-gradient(circle at 50% 42%,color-mix(in srgb,var(--cue) 70%,#fff) 0%,color-mix(in srgb,var(--cue) 38%,transparent) 30%,transparent 62%)}
  .gcard .status-cue-shatter{border:2px dashed var(--cue);box-shadow:0 0 10px var(--cue)}
  .gcard .status-cue-shatter .cue-shard{position:absolute;left:50%;top:44%;width:7px;height:11px;
    background:linear-gradient(135deg,#fff,var(--cue));clip-path:polygon(50% 0,100% 60%,40% 100%,0 40%);
    box-shadow:0 0 6px var(--cue)}
  .gcard .status-cue-ripple{border:0}
  .gcard .status-cue-ripple span{position:absolute;left:50%;bottom:6%;width:78%;height:22%;border-radius:50%;
    border:2px solid var(--cue);box-shadow:0 0 8px var(--cue);transform-origin:50% 50%}
  .gcard .status-cue-stars{position:absolute;left:50%;top:10%;width:0;height:0;z-index:31;pointer-events:none}
  .gcard .status-cue-stars span{position:absolute;left:-6px;top:-8px;font-size:${ofs(13)}px;line-height:1;color:#ffe36a;
    text-shadow:0 0 5px rgba(255,210,70,.95),0 1px 2px rgba(0,0,0,.9)}

  /* 特质恢复为贴左边框的三枚竖排图标。 */
  .gcard .trait-row{position:absolute;z-index:6;left:var(--trait-inset);top:43%;transform:translateY(-50%);
    display:flex;flex-direction:column;align-items:center;gap:var(--trait-gap);pointer-events:none;
    padding:0}
  .gcard.portrait-compact.has-statuses .trait-row{top:var(--compact-trait-top);transform:none;flex-direction:row}
  .gcard .trait-row:empty{display:none}
  .gcard .trait-badge{display:inline-flex;flex:none;width:var(--trait-size);height:var(--trait-size);pointer-events:auto;cursor:pointer;
    filter:drop-shadow(0 1px 2px rgba(0,0,0,.95)) drop-shadow(0 0 4px rgba(0,0,0,.65))}
  .gcard .trait-badge:hover{filter:drop-shadow(0 1px 2px rgba(0,0,0,.95)) drop-shadow(0 0 6px rgba(240,222,170,.85))}
  .gcard .trait-badge svg{display:block;width:100%;height:100%}
  .gcard .trait-badge-off{opacity:.4}

  `;
  const style = document.createElement('style');
  style.id = 'gcard-styles';
  style.textContent = css;
  document.head.appendChild(style);
}

export class CharacterCard {
  readonly charId: number;
  readonly el: HTMLDivElement;

  private char: Character;
  private castable = false;
  private atkEl!: HTMLElement;
  private brEl!: HTMLElement; // 右下容器（护甲 + 血量）
  private gemEl!: HTMLElement;
  private riseEl!: SVGRectElement; // 充能液面矩形（上涨表示进度）
  private riseRaf: number | null = null;
  /** 冲撞动画重入保护：当前在飞的动画 + 代号（见 lunge） */
  private lungeAnim: Animation | null = null;
  private lungeGen = 0;
  private pressCleanup: (() => void) | null = null;
  private cancelPress: (() => void) | null = null;
  private inputEnabled = true;
  private gemManaEl!: HTMLElement; // 宝石内的当前法力数字
  /**
   * 卡面「正在显示」的数值快照：详情窗跟着卡面走，而不是抢先显示引擎里已结算的终值。
   * version 每次重绘自增，详情窗轮询据此判断要不要重绘。
   */
  private shown: CardShownStats | null = null;
  private shownVersion = 0;
  private castFlagEl!: HTMLElement; // 可释放 / 沉默 的显式标记（B-6）
  private hintEl!: HTMLElement;    // 短按无效提示浮窗（B-3）
  private hintTimer: number | null = null;
  /** 当前卡片 CSS 宽度与舞台缩放（B-7 的 24px 屏幕像素下限要两者一起算） */
  private cardWidth = CARD_W;
  private stageScale = 1;
  private statusBadgeSize = 24;
  private statusCollapsed = false;
  private magicEl!: HTMLElement;   // 魔力（法术强度）数值
  private statusStripEl!: HTMLElement; // 状态图标栏（中毒/燃烧…）
  private traitRowEl!: HTMLElement; // 特质图标列
  private gemColors: BaseColor[] = [];
  private displayedMana = 0;

  constructor(char: Character, side: PlayerSide, opts?: { portrait?: string; variant?: string }) {
    ensureStyles();
    this.charId = char.id;
    this.char = char;
    this.displayedMana = char.mana;

    const skin = char.colors[0] !== undefined ? SKIN_CLASS[char.colors[0]] : 'skin-steel';
    const variant = opts?.variant ?? '';
    const hasPhoto = !!opts?.portrait;
    // 敌方（右侧队伍）：法力宝石镜像反转并移到左上角，与我方左右呼应
    const sideClass = side === PlayerSide.Right ? 'enemy' : 'ally';
    // 单一法力条：宝石展示该角色的关联充能色（Character.colors）
    const gemColors = char.colors;

    const el = document.createElement('div');
    el.className = `gcard ${skin} ${variant} ${sideClass} ${hasPhoto ? 'has-photo' : ''}`.trim();
    el.dataset.testid = `card-${char.id}`; // 供端到端点选目标定位
    el.innerHTML = `
      <div class="art">
        <div class="base"></div>
        ${hasPhoto ? `<div class="photo" style="background-image:url('${opts!.portrait}')"></div>` : ''}
        <div class="mass"></div>
        <div class="shard"></div>
        <div class="focal"></div>
        <div class="vig"></div>
        <div class="grain"></div>
      </div>
      <div class="card-frame" aria-hidden="true"></div>
      <div class="frost-layer" aria-hidden="true"></div>
      <div class="silence-layer" aria-hidden="true"><span class="silence-seal"></span></div>
      <div class="entangle-layer" aria-hidden="true"><span class="entangle-vines"></span></div>
      <div class="status-accent-layer" aria-hidden="true"></div>
      <div class="frame-ornament" aria-hidden="true">
        <svg viewBox="0 0 72 24" role="presentation">
          <defs><linearGradient id="ornGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8f6c37"/><stop offset=".48" stop-color="#f0d99c"/><stop offset="1" stop-color="#9d763e"/></linearGradient></defs>
          <path class="orn-dark" d="M1 12h14l10-7 8 5 3-8 3 8 8-5 10 7h14-14l-9 5-9-2-3 7-3-7-9 2-9-5H1z"/>
          <path class="orn-gold" d="M1 12h14l10-7 8 5 3-8 3 8 8-5 10 7h14M10 14h14l9-3m29 3H48l-9-3"/>
          <path class="orn-core" d="M36 5l5 7-5 7-5-7z"/>
        </svg>
      </div>
      <div class="cast-sheen" aria-hidden="true"></div>
      <div class="press-ring" aria-hidden="true"></div>
      <div class="ov c-bl">
        <div class="stat stat-atk" aria-label="攻击 0">${SWORD_SVG}<span class="v atk">0</span></div>
      </div>
      <div class="ov c-br"></div>
      <div class="gem" role="img">${gemSvg(gemColors)}<span class="gem-mana is-zero" aria-hidden="true">0</span></div>
      <div class="cast-flag" aria-hidden="true">!</div>
      <div class="magic" title="魔力（法术强度）">${MAGIC_SVG}<span class="v magic-v">0</span></div>
      <div class="status-strip" aria-label="状态"></div>
      <div class="trait-row" aria-label="特质"></div>
      <div class="cast-hint" role="status" aria-live="polite"></div>
    `;
    this.el = el;
    this.atkEl = el.querySelector('.atk')!;
    this.brEl = el.querySelector('.c-br')!;
    this.gemEl = el.querySelector('.gem')!;
    this.riseEl = el.querySelector('.rise')!;
    this.castFlagEl = el.querySelector('.cast-flag')!;
    this.hintEl = el.querySelector('.cast-hint')!;
    this.magicEl = el.querySelector('.magic-v')!;
    this.statusStripEl = el.querySelector('.status-strip')!;
    this.traitRowEl = el.querySelector('.trait-row')!;
    this.gemManaEl = el.querySelector('.gem-mana')!;
    this.renderTraitRow();
    this.gemColors = gemColors;

    // 卡面任意位置（含法力宝石、状态/特质徽记）都执行同一个卡片动作，不再有吞点击的子区域。
    this.resize(CARD_W, CARD_H);

    this.refresh();
  }

  /** 卡面三枚特质：与养成页同一套 game-icons，未实现 code 也按名称出图。 */
  private renderTraitRow(): void {
    const codes = [...new Set(this.char.displayTraitIds ?? this.char.traitIds ?? [])].slice(0, 3);
    const glyphs = traitCardGlyphs(codes, this.char.traitNames, this.char.name, 1);
    this.traitRowEl.innerHTML = glyphs
      .map((glyph) => {
        const data = `data-trait-name="${escAttr(glyph.name)}" data-trait-desc="${escAttr(glyph.description)}"`;
        return `<span class="trait-badge" ${data} aria-label="特质 ${escAttr(glyph.name)}">${glyph.svg}</span>`;
      })
      .join('');
  }

  resize(width: number, height: number): void {
    this.el.style.width = `${width}px`;
    this.el.style.height = `${height}px`;
    const metrics = battleCardOverlayMetrics(width, height);
    this.el.classList.toggle('portrait-compact', height <= 110);
    this.el.style.setProperty('--compact-trait-top', `${Math.max(gemSize(), os(21)) + os(4)}px`);
    for (const [key, value] of Object.entries(metrics)) this.el.style.setProperty(`--${key}`, `${value}px`);
    // Reserve the right-hand stat stack, including three-digit values.
    this.statusStripEl.style.maxWidth = `${Math.max(0, width - metrics['card-inset'] * 2 - metrics['stat-font'] * 3.2)}px`;
    this.applyCompactMetrics(width);
  }

  /**
   * 按实时卡宽调整状态入口（CSS 里的 os() 是首次注入时烘死的，窗口缩放后会留旧值）：
   * - B-7：状态徽记 24px 绝对下限（等比值不足时抬到 24）；
   * - 紧凑卡统一收成单一状态入口，避免横向徽记覆盖立绘。
   * 基准 142px = 512px 棋盘下的 3 人卡宽（与 setTeamSize 同一基准）。
   */
  private applyCompactMetrics(width: number): void {
    this.cardWidth = width;
    const ratio = width > 0 ? width / 142 : 1;
    // 整个战斗层是一张被 wrapper transform 缩放的舞台：屏幕像素 = CSS 像素 × stageScale。
    // 阶段 A 实测的 17×17 就是"CSS 20px × 0.68 舞台缩放"的结果——只抬 CSS 尺寸不够，
    // 必须按舞台缩放反推，同时不许吃掉卡面（封顶卡宽 30%）。
    const stage = Math.max(0.2, this.stageScale);
    const wanted = Math.ceil(24 / stage);
    const cap = Math.max(20, Math.round(width * 0.3));
    const badge = Math.min(Math.max(Math.round(20 * ratio), wanted), cap);
    this.statusBadgeSize = badge;
    this.el.style.setProperty('--sbz', `${badge}px`);
    this.el.style.setProperty('--sbiz', `${Math.max(12, Math.round(badge * 0.84))}px`);
    // 折叠后的单一汇总入口不再受「单枚徽记最多占卡宽 30%」限制，确保仍有 24px 屏幕高度。
    this.el.style.setProperty('--ssz', `${wanted}px`);
    // 连 30% 封顶都达不到 24 屏幕 px 时，改"状态条折叠 → 一次点开全部状态"
    // （`15-battle.md` B-7 给的备选方案）：收成一个汇总入口，避免 1~3 个状态仍以小徽记残留。
    const collapsed = badge * stage < 23.5 || width * stage < 120;
    this.statusCollapsed = collapsed;
    this.el.classList.toggle('status-collapsed', collapsed);
    if (this.statusStripEl) this.renderStatuses();
  }

  /**
   * 舞台缩放（由 App.refreshLayout 推入）。徽记的 24px 下限是**屏幕**像素口径，
   * 必须知道舞台缩放才能算出该给多少 CSS 像素。
   */
  setStageScale(scale: number): void {
    if (!(scale > 0) || Math.abs(scale - this.stageScale) < 0.005) return;
    this.stageScale = scale;
    this.applyCompactMetrics(this.cardWidth);
  }

  /** 兵种转化后换脸：立绘、法力色、特质和数值都换成当前角色。 */
  reface(portrait: string): void {
    for (const skin of Object.values(SKIN_CLASS)) this.el.classList.remove(skin);
    const skin = this.char.colors[0] !== undefined ? SKIN_CLASS[this.char.colors[0]] : 'skin-steel';
    this.el.classList.add(skin);
    const art = this.el.querySelector('.art');
    if (art) {
      let photo = art.querySelector('.photo') as HTMLElement | null;
      if (!photo) {
        photo = document.createElement('div');
        photo.className = 'photo';
        const mass = art.querySelector('.mass');
        if (mass) art.insertBefore(photo, mass);
        else art.appendChild(photo);
      }
      photo.style.backgroundImage = `url('${portrait}')`;
      this.el.classList.add('has-photo');
    }
    this.gemColors = [...this.char.colors];
    this.gemEl.innerHTML = gemSvg(this.gemColors);
    this.gemEl.appendChild(this.gemManaEl);
    const rise = this.gemEl.querySelector('.rise');
    if (rise) this.riseEl = rise as SVGRectElement;
    this.renderTraitRow();
    this.refresh();
  }

  refresh(): void {
    const c = this.char;

    this.atkEl.textContent = String(c.attack);
    this.atkEl.parentElement?.setAttribute('aria-label', `攻击 ${c.attack}`);
    this.magicEl.textContent = String(c.magic);

    const armorBlock = c.armor > 0
      ? `<div class="stat stat-armor armor" aria-label="护甲 ${c.armor}">${SHIELD_SVG}<span class="v">${c.armor}</span></div>`
      : '';
    this.brEl.innerHTML = `${armorBlock}<div class="stat stat-hp" aria-label="生命 ${Math.max(0, c.hp)}">${HEART_SVG}<span class="v hp">${Math.max(0, c.hp)}</span></div>`;

    // Normal refresh synchronizes to engine state; absorbMana() advances intermediate visual states.
    this.displayedMana = Math.min(c.mana, c.manaCost);
    this.renderMana(this.displayedMana);

    this.renderStatuses();

    this.el.classList.toggle('defeated', c.defeated);
    this.recordShown();
  }

  /** 记下卡面此刻显示的数值（详情窗据此渲染，保证与卡面同步而不剧透结算终值） */
  private recordShown(): void {
    const c = this.char;
    this.shown = {
      attack: c.attack,
      armor: Math.max(0, c.armor),
      hp: Math.max(0, c.hp),
      maxHp: c.maxHp,
      magic: c.magic,
      mana: Math.min(this.displayedMana, c.manaCost),
      manaCost: c.manaCost,
      defeated: c.defeated,
      statuses: (c.statuses ?? []).map((s) => ({
        id: s.id,
        turns: s.turns,
        ...(s.magnitude !== undefined ? { magnitude: s.magnitude } : {}),
      })),
    };
    this.shownVersion++;
    this.el.setAttribute('aria-label', `${c.name}，生命 ${this.shown.hp}，法力 ${this.shown.mana}/${c.manaCost}`);
  }

  /** 卡面当前显示的数值（详情窗用）；version 在每次重绘后自增 */
  shownStats(): { version: number; stats: CardShownStats } {
    if (!this.shown) this.recordShown();
    return { version: this.shownVersion, stats: this.shown! };
  }

  /** 施放瞬间清空法力：显示 0、撤掉可释放态；之后的法力获得照常播放，回合尾 refresh 再与引擎对齐 */
  drainMana(): void {
    this.displayedMana = 0;
    this.renderMana(0);
    this.setCastable(false);
    this.recordShown();
  }

  /** 渲染状态图标栏：按角色当前 statuses 显示可区分图标（需求 6.1） */
  private renderStatuses(): void {
    const all = this.char.statuses ?? [];
    this.el.classList.toggle('has-statuses', all.length > 0);
    const stage = Math.max(0.2, this.stageScale);
    const availableScreenWidth = Math.max(0, Math.min(this.cardWidth - 12, parseFloat(this.statusStripEl.style.maxWidth) || this.cardWidth) * stage);
    const gapScreen = os(3) * stage;
    const badgesScreenWidth = all.length * this.statusBadgeSize * stage
      + Math.max(0, all.length - 1) * gapScreen;
    const visuallyDense = badgesScreenWidth > availableScreenWidth || (all.length >= 3 && badgesScreenWidth > availableScreenWidth * 0.72);
    // B-7 折叠态必须是一个真正的汇总控件。此前只有 >3 个状态才出现 +N，1~3 个状态
    // 仍保留被压小的徽记，恰好绕开了触控下限。小卡上即使单枚已到 24px，若整行会
    // 遮住大半立绘也同样汇总，保持角色识别优先。
    // 折叠态「+N」与徽记一样只是卡面的一部分：点它就是点卡片（打开详情窗，全部状态在窗内）。
    if ((this.statusCollapsed || visuallyDense) && all.length > 0) {
      this.statusStripEl.innerHTML = `<span class="status-more" role="img" aria-label="${all.length} 个状态">+${all.length}</span>`;
    } else {
      const recovery = statusRecoveryChance(this.char);
      this.statusStripEl.innerHTML = all
      .map((s) => {
        const b = statusBadge(s.id);
        // 角标只给有意义的数：出血层数 / 仍倒计时的辅助状态回合。官方无时限状态不显示
        //（它们的 turns 从不递减，显示出来是个永远不动的误导数字）。
        const corner = statusBadgeCorner(s);
        const cornerHtml = corner ? `<span class="sb-turns">${corner}</span>` : '';
        const positive = isPositiveStatus(s.id);
        // 说明浮层读 data-live（实例实际数值行，单一口径见 statusPresentation.statusLiveLines）
        const live = statusLiveLines(s, recovery).join(' · ');
        // B-8：去掉原生 title。名字走 data-status-label，statusTooltip 从它取标题——单一事实源。
        // 徽记不再是独立按钮（点它=点卡片）；说明浮层只在鼠标悬停时出现。
        // 增益/减益不只靠颜色区分：增益为圆顶盾形 + 左上 ▲ 标，减益为方形 + 右上 ◣ 标（无障碍名同样注明）。
        const aria = `${positive ? '增益' : '减益'}：${b.label}${live ? ' · ' + live : ''}`;
        return `<span class="status-badge ${positive ? 'sb-pos' : 'sb-neg'}" data-status-id="${escAttr(s.id)}" data-status-label="${escAttr(b.label)}" data-live="${escAttr(live)}" role="img" aria-label="${escAttr(aria)}" style="--sb:${b.color}">${statusBadgeIcon(s.id)}${cornerHtml}</span>`;
      })
      .join('');
    }
    if (!statusDiscoveryShown && all.length > 0) {
      const first = this.statusStripEl.querySelector('.status-badge,.status-more');
      if (first) {
        statusDiscoveryShown = true;
        first.classList.add('status-discovery');
        first.addEventListener('animationend', () => first.classList.remove('status-discovery'), { once: true });
      }
    }
    this.recordShown();
  }

  /**
   * 状态图标出现动效（供 status-apply 事件驱动，需求 6.2）。
   * 新挂：该徽记弹入；刷新/叠层：只给**该**徽记一次脉冲（此前总是动最后一枚，可能是别的状态）。
   * 折叠态（+N）下动汇总块。
   */
  applyStatusBadge(statusId?: string, refreshed = false): void {
    this.renderStatuses();
    const target = (statusId
      ? Array.from(this.statusStripEl.querySelectorAll<HTMLElement>('.status-badge'))
        .find((el) => el.dataset.statusId === statusId)
      : undefined) ?? (this.statusStripEl.lastElementChild as HTMLElement | null);
    if (!target) return;
    if (refreshed) {
      target.animate(
        [
          { transform: 'scale(1)', filter: 'brightness(1)' },
          { transform: 'scale(1.3)', filter: 'brightness(1.8)', offset: 0.35 },
          { transform: 'scale(1)', filter: 'brightness(1)' },
        ],
        { duration: 360, easing: 'ease-out' },
      );
      return;
    }
    target.animate(
      [
        { transform: 'scale(0.2)', opacity: 0 },
        { transform: 'scale(1.25)', opacity: 1, offset: 0.6 },
        { transform: 'scale(1)', opacity: 1 },
      ],
      { duration: 300, easing: 'cubic-bezier(.2,.8,.25,1)' },
    );
  }

  /** 状态图标移除动效（供 status-expire 事件驱动，需求 6.4） */
  removeStatusBadge(): void {
    // 状态已从引擎移除，重渲染即消失；给整栏一个轻微淡出提示
    this.statusStripEl.animate(
      [{ opacity: 0.4 }, { opacity: 1 }],
      { duration: 220, easing: 'ease-out' },
    );
    this.renderStatuses();
  }

  /** Advance the displayed mana only when the colored stream reaches this card. */
  absorbMana(color: BaseColor, amount: number): boolean {
    const before = this.displayedMana;
    const wasFull = this.char.manaCost > 0 && before >= this.char.manaCost;
    this.displayedMana = Math.min(this.char.manaCost, before + Math.max(0, amount));

    const flash = document.createElement('span');
    flash.className = 'mana-absorb-flash';
    flash.style.setProperty('--absorb-color', COLOR_HEX[color]);
    this.gemEl.appendChild(flash);
    flash.animate(
      [
        { opacity: 0, transform: 'scale(.45)' },
        { opacity: 1, transform: 'scale(1.18)', offset: 0.35 },
        { opacity: 0, transform: 'scale(.72)' },
      ],
      { duration: 340, easing: 'cubic-bezier(.2,.8,.25,1)' },
    ).onfinish = () => flash.remove();

    this.gemEl.animate(
      [
        { filter: 'brightness(1) saturate(1)' },
        { filter: `brightness(1.75) saturate(1.35) drop-shadow(0 0 5px ${COLOR_HEX[color]})`, offset: 0.35 },
        { filter: 'brightness(1.12) saturate(1.08)' },
      ],
      { duration: 360, easing: 'ease-out' },
    );
    this.renderMana(this.displayedMana);
    return !wasFull && this.char.manaCost > 0 && this.displayedMana >= this.char.manaCost;
  }

  getManaElement(): HTMLElement {
    return this.gemEl;
  }

  private renderMana(value: number): void {
    const curSum = Math.min(value, this.char.manaCost);
    const reqSum = this.char.manaCost;
    const ratio = reqSum > 0 ? Math.min(1, curSum / reqSum) : 0;
    const newH = Math.round(ratio * 512);
    const prevH = Number(this.riseEl.getAttribute('height') ?? '0');
    if (newH !== prevH) this.animateRise(prevH, newH);
    const full = reqSum > 0 && curSum >= reqSum;
    this.el.classList.toggle('mana-full', full);

    // 宝石上写「当前/上限」（GoW 法力球读法）；数字只来自引擎整数，直接拼 HTML 安全。
    const cur = Math.max(0, curSum);
    const manaHtml = `<span class="cur">${cur}</span><span class="max">/${reqSum}</span>`;
    if (this.gemManaEl.innerHTML !== manaHtml) this.gemManaEl.innerHTML = manaHtml;
    this.gemManaEl.classList.toggle('is-zero', cur <= 0);
    this.castFlagEl.textContent = '×';
    this.gemEl.setAttribute('aria-label', `法力值 ${cur}/${reqSum}（${this.gemColors.map((color) => COLOR_LABEL[color]).join(' / ')}）`);
    this.recordShown();
  }

  /** 当前显示的法力值（跟随法力流，非引擎值） */
  displayedManaValue(): number {
    return Math.min(this.displayedMana, this.char.manaCost);
  }

  /** 当前显示值下还差多少法力（供 App 组装「还差 N 点」提示） */
  manaShortfall(): number {
    return Math.max(0, this.char.manaCost - Math.min(this.displayedMana, this.char.manaCost));
  }

  /** 当前是否满法力（B-6 口径：与 castable 合并判断时用） */
  isManaFull(): boolean {
    return this.char.manaCost > 0 && this.displayedMana >= this.char.manaCost;
  }

  /**
   * 卡边提示浮窗（B-3 / B-5）：短按无效的原因、手势引导都走这里。
   * @param text 提示文案
   * @param opts warn=红框（阻断类原因）；ms=显示时长；shake=同时摇一下卡片
   */
  showHint(text: string, opts: { warn?: boolean; ms?: number; shake?: boolean } = {}): void {
    if (this.hintTimer !== null) {
      window.clearTimeout(this.hintTimer);
      this.hintTimer = null;
    }
    this.hintEl.textContent = text;
    this.hintEl.classList.toggle('warn', !!opts.warn);
    this.hintEl.classList.remove('show');
    // 强制回流重置动画，否则连续两次同样的提示不会再播入场
    void this.hintEl.offsetWidth;
    this.hintEl.classList.add('show');
    if (opts.shake) {
      this.el.classList.remove('shake');
      void this.el.offsetWidth;
      this.el.classList.add('shake');
      window.setTimeout(() => this.el.classList.remove('shake'), 360);
    }
    this.hintTimer = window.setTimeout(() => {
      this.hintEl.classList.remove('show');
      this.hintTimer = null;
    }, opts.ms ?? 1600);
  }

  /** 保留旧调用契约；角色名只在长按详情中展示，不再覆盖卡面。 */
  flashName(): void {}

  /** 用 requestAnimationFrame 平滑插值充能矩形的 y/height（SVG 几何属性，直接设 attr 最可靠） */
  private animateRise(fromH: number, toH: number): void {
    if (this.riseRaf !== null) cancelAnimationFrame(this.riseRaf);
    const dur = 420;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 2); // easeOutQuad
      const h = fromH + (toH - fromH) * e;
      this.riseEl.setAttribute('y', String(512 - h));
      this.riseEl.setAttribute('height', String(Math.max(0, h)));
      if (t < 1) {
        this.riseRaf = requestAnimationFrame(step);
      } else {
        this.riseRaf = null;
      }
    };
    this.riseRaf = requestAnimationFrame(step);
  }

  setCastable(on: boolean): void {
    if (on === this.castable) return;
    this.castable = on;
    this.el.classList.toggle('castable', on);
  }

  /** 目标可选高亮（玩家手动选目标时，候选卡呼吸描边） */
  setPickable(on: boolean): void {
    this.el.classList.toggle('pickable', on);
  }

  /** 冰冻持续态：整卡程序化冰封蒙层（贴合卡片、静态、不挡脸）。由 status-apply/expire 驱动。 */
  setFrozen(on: boolean): void {
    this.el.classList.toggle('frozen', on);
  }

  /** 沉默持续态：满法力时法力宝石呼吸暗下去（能量满却放不出）。由 status-apply/expire 驱动。 */
  setSilenced(on: boolean): void {
    this.el.classList.toggle('silenced', on);
    // 法力浮窗的状态行与 B-6 标记文字随之改写（法力已满 / 沉默中 / 还差 N 点）
    this.renderMana(this.displayedMana);
  }

  /** ???????????????????? status-apply/expire/cleanse ??? */
  setEntangled(on: boolean): void {
    this.el.classList.toggle('entangled', on);
  }

  /**
   * 为没有专属序列帧的状态挂载程序化持续层。
   * 状态 id 统一转成 CSS class，未知状态安全忽略，不影响状态栏本身。
   */
  setStatusAccent(statusId: string, on: boolean): void {
    // 别名收敛（enraged→rage、cursed→curse、charmed→charm…）与支持表同源 statusPresentation
    const key = statusAccentKey(statusId);
    if (!key) return;
    // 关闭时若别名实例仍在身上（rage 与 enraged 同时存在），保留光晕
    if (!on && this.char.statuses.some((s) => statusAccentKey(s.id) === key)) return;
    this.el.classList.toggle(`status-accent-${key}`, on);
  }

  clearStatusAccents(): void {
    for (const key of STATUS_ACCENT_KEYS) this.el.classList.remove(`status-accent-${key}`);
  }

  /**
   * 按角色当前 statuses 重建全部持续光晕与控制态卡面（变身清空状态、驱散/净化后校正用）。
   * 冰冻/沉默/缠绕是卡面 class；击晕的序列帧持续层由 App 管理，不在此处。
   */
  syncStatusVisuals(): void {
    this.clearStatusAccents();
    const ids = this.char.statuses.map((s) => s.id);
    for (const id of ids) this.setStatusAccent(id, true);
    this.setFrozen(ids.includes('frozen'));
    this.setSilenced(ids.includes('silence'));
    this.setEntangled(ids.includes('entangle'));
    this.renderStatuses();
  }

  /**
   * 状态演出提示：卡面光圈（代码绘制，四种形态）+ 飘字。
   *   pulse   细光环收放（免疫 / 赐福抵挡）
   *   shatter 光环 + 六枚碎片外飞（驱散 / 屏障被打碎 / 冰冻吞回合）
   *   ripple  底部两圈水纹外扩（潜水闪避 / 恐惧后退）
   *   burst   中心径向辉光一闪（挣脱 / 净化 / 死亡标记）
   * 全部有限 WAAPI；减少动态效果时退化为静态淡入淡出。
   */
  statusCue(cue: { text: string; color: string; ring: 'pulse' | 'shatter' | 'ripple' | 'burst' }): void {
    const reduced = CharacterCard.reducedMotion();
    const layer = document.createElement('div');
    layer.setAttribute('aria-hidden', 'true');
    layer.className = `status-cue status-cue-${cue.ring}`;
    layer.style.setProperty('--cue', cue.color);
    this.el.appendChild(layer);
    const done = () => layer.remove();
    const fade = (el: HTMLElement, frames: Keyframe[], duration: number, delay = 0) =>
      el.animate(reduced ? [{ opacity: 0 }, { opacity: 0.9, offset: 0.3 }, { opacity: 0 }] : frames,
        { duration, delay, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' });
    if (cue.ring === 'pulse') {
      fade(layer, [
        { opacity: 0, transform: 'scale(1.08)' },
        { opacity: 1, transform: 'scale(.98)', offset: 0.35 },
        { opacity: 0, transform: 'scale(1.04)' },
      ], 460).onfinish = done;
    } else if (cue.ring === 'burst') {
      fade(layer, [
        { opacity: 0, transform: 'scale(.4)' },
        { opacity: 1, transform: 'scale(1)', offset: 0.3 },
        { opacity: 0, transform: 'scale(1.25)' },
      ], 520).onfinish = done;
    } else if (cue.ring === 'ripple') {
      const rings = [0, 1].map(() => {
        const r = document.createElement('span');
        layer.appendChild(r);
        return r;
      });
      rings.forEach((r, i) => fade(r, [
        { opacity: 0.9, transform: 'translateX(-50%) scale(.3,.3)' },
        { opacity: 0, transform: 'translateX(-50%) scale(1.3,1)' },
      ], 560, i * 140));
      window.setTimeout(done, 560 + 140 + 40);
    } else {
      fade(layer, [
        { opacity: 0, transform: 'scale(.96)' },
        { opacity: 1, transform: 'scale(1)', offset: 0.15 },
        { opacity: 0, transform: 'scale(1.05)' },
      ], 480);
      for (let i = 0; i < 6; i++) {
        const shard = document.createElement('span');
        shard.className = 'cue-shard';
        const angle = (Math.PI * 2 * i) / 6 + 0.4;
        const dx = Math.cos(angle) * 34;
        const dy = Math.sin(angle) * 40;
        layer.appendChild(shard);
        fade(shard, [
          { opacity: 1, transform: `translate(-50%,-50%) rotate(${i * 60}deg) scale(1)` },
          { opacity: 0, transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) rotate(${i * 60 + 90}deg) scale(.4)` },
        ], 480);
      }
      window.setTimeout(done, 520);
    }
    if (cue.text) this.floatText(cue.text, cue.color, 900);
  }

  /**
   * 状态「中招」演出：徽印在卡面中央弹出（主题色闪光 + 冲击环），停一拍后缩小飞入徽记栏，
   * 到位时对应徽记才弹出。时长按 1× 编写（卡内 WAAPI，随战斗倍速统一加速）。
   *   0–220ms 弹入 · 220–380ms 停驻 · 380–640ms 飞入徽记（order 每级再延后 110ms）
   * 减少动态效果：中央淡入淡出，徽记直接出现。
   * @param emblemUrl 徽印图（null=没有可用图，退化为只弹徽记）
   * @param order 同一张卡本批第几个新状态（错开播放，避免几枚徽印叠在一起）
   */
  announceStatus(statusId: string, emblemUrl: string | null, color: string, order = 0): void {
    this.renderStatuses();
    const badge = Array.from(this.statusStripEl.querySelectorAll<HTMLElement>('.status-badge'))
      .find((el) => el.dataset.statusId === statusId)
      ?? this.statusStripEl.querySelector<HTMLElement>('.status-more');
    if (!emblemUrl) {
      this.applyStatusBadge(statusId);
      return;
    }
    const reduced = CharacterCard.reducedMotion();
    const delay = order * 110;

    // 主题色径向闪光 + 冲击环（在徽印之下）
    const flash = document.createElement('div');
    flash.className = 'status-emblem-flash';
    flash.setAttribute('aria-hidden', 'true');
    flash.style.setProperty('--em', color);
    const ring = document.createElement('div');
    ring.className = 'status-emblem-ring';
    ring.setAttribute('aria-hidden', 'true');
    ring.style.setProperty('--em', color);
    const img = document.createElement('img');
    img.className = 'status-emblem';
    img.src = emblemUrl;
    img.alt = '';
    img.draggable = false;
    img.setAttribute('aria-hidden', 'true');
    img.style.setProperty('--em', color);
    this.el.append(flash, ring, img);

    // 徽记先藏起来，徽印到位再弹（否则角落里先冒出一枚，徽印飞过去就没意义了）
    if (badge && !reduced) badge.style.opacity = '0';
    const revealBadge = () => {
      if (!badge?.isConnected) return;
      badge.style.opacity = '';
      badge.animate(
        [
          { transform: 'scale(1.6)', filter: 'brightness(2.2)' },
          { transform: 'scale(.9)', filter: 'brightness(1.3)', offset: 0.55 },
          { transform: 'scale(1)', filter: 'brightness(1)' },
        ],
        { duration: 260, easing: 'cubic-bezier(.2,.8,.25,1)' },
      );
    };

    if (reduced) {
      const a = img.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }],
        { duration: 520, delay, fill: 'both' });
      flash.animate([{ opacity: 0 }, { opacity: 0.7, offset: 0.25 }, { opacity: 0 }], { duration: 520, delay, fill: 'both' })
        .onfinish = () => flash.remove();
      ring.remove();
      a.onfinish = () => img.remove();
      return;
    }

    // 飞行终点：徽记中心相对徽印中心的位移（屏幕像素 → 卡片本地坐标，扣掉舞台缩放）
    const cardRect = this.el.getBoundingClientRect();
    const local = cardRect.width > 0 ? this.el.offsetWidth / cardRect.width : 1;
    const imgRect = img.getBoundingClientRect();
    let dx = 0; let dy = 0; let endScale = 0.3;
    if (badge) {
      const b = badge.getBoundingClientRect();
      dx = (b.left + b.width / 2 - (imgRect.left + imgRect.width / 2)) * local;
      dy = (b.top + b.height / 2 - (imgRect.top + imgRect.height / 2)) * local;
      endScale = imgRect.width > 0 ? Math.max(0.12, (b.width / imgRect.width) * 1.1) : 0.3;
    }
    const total = 640;
    const at = (ms: number) => ms / total;
    img.animate(
      [
        { opacity: 0, transform: 'translate(-50%,-50%) scale(.3) rotate(-10deg)' },
        { opacity: 1, transform: 'translate(-50%,-50%) scale(1.12) rotate(2deg)', offset: at(150) },
        { opacity: 1, transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', offset: at(220) },
        { opacity: 1, transform: 'translate(-50%,-50%) scale(1.04) rotate(0deg)', offset: at(380), easing: 'cubic-bezier(.5,0,.75,.4)' },
        { opacity: 0.9, transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) scale(${endScale}) rotate(0deg)` },
      ],
      { duration: total, delay, fill: 'both' },
    ).onfinish = () => { img.remove(); revealBadge(); };
    flash.animate(
      [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)', offset: 0.3 }, { opacity: 0, transform: 'scale(1.15)' }],
      { duration: 420, delay, easing: 'ease-out', fill: 'both' },
    ).onfinish = () => flash.remove();
    ring.animate(
      [{ opacity: 0.95, transform: 'translate(-50%,-50%) scale(.35)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.45)' }],
      { duration: 460, delay: delay + 60, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' },
    ).onfinish = () => ring.remove();
  }

  /** 击晕施加：头顶一圈金星转一周后散开（无专属帧素材，代码绘制）。 */
  stunStars(): void {
    const reduced = CharacterCard.reducedMotion();
    const layer = document.createElement('div');
    layer.setAttribute('aria-hidden', 'true');
    layer.className = 'status-cue-stars';
    this.el.appendChild(layer);
    for (let i = 0; i < 5; i++) {
      const star = document.createElement('span');
      star.textContent = '★';
      layer.appendChild(star);
      const a0 = (360 / 5) * i;
      star.animate(reduced
        ? [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }]
        : [
          { opacity: 0, transform: `rotate(${a0}deg) translateX(8px) rotate(${-a0}deg) scale(.4)` },
          { opacity: 1, transform: `rotate(${a0 + 180}deg) translateX(26px) rotate(${-a0 - 180}deg) scale(1)`, offset: 0.55 },
          { opacity: 0, transform: `rotate(${a0 + 300}deg) translateX(34px) rotate(${-a0 - 300}deg) scale(.7)` },
        ], { duration: 620, easing: 'ease-out', fill: 'both' });
    }
    window.setTimeout(() => layer.remove(), 680);
  }

  /**
   * 绑定短按/长按：单次只跟踪一个 pointer。移动超过 10px、离开卡面、
   * pointercancel 或丢失 capture 都只取消，不得在抬起时误触短按。
   *
   * 长按只在 `longArmed()` 为真时存在（按下那一刻判定）：此时才计时、画进度环，
   * 满 475ms 触发 onLong；否则按多久抬起都算一次短按（短按/长按结果相同，不必让玩家等环）。
   * 键盘：卡片可聚焦，Enter 等价于一次短按（via='keyboard'，调用方据此决定是否移交焦点）。
   */
  bindPress(onShort?: (via: PressSource) => void, onLong?: () => void, longArmed?: () => boolean): void {
    this.pressCleanup?.();

    const LONG_MS = 475;
    const MOVE_TOLERANCE = 10;
    let timer: number | null = null;
    let activePointerId: number | null = null;
    let downX = 0;
    let downY = 0;
    let movedOrCancelled = false;
    let longFired = false;

    const clearTimer = () => {
      if (timer === null) return;
      window.clearTimeout(timer);
      timer = null;
    };
    const releaseCapture = (pointerId: number) => {
      try {
        if (this.el.hasPointerCapture(pointerId)) this.el.releasePointerCapture(pointerId);
      } catch {
        // Synthetic events and browsers without an active native pointer may reject capture release.
      }
    };
    const reset = (cancelled: boolean) => {
      if (activePointerId === null) return;
      const pointerId = activePointerId;
      activePointerId = null;
      movedOrCancelled ||= cancelled;
      clearTimer();
      this.el.classList.remove('pressing'); // B-5：撤掉按压进度环
      releaseCapture(pointerId);
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!this.inputEnabled || activePointerId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      activePointerId = e.pointerId;
      downX = e.clientX;
      downY = e.clientY;
      movedOrCancelled = false;
      longFired = false;
      try {
        this.el.setPointerCapture(e.pointerId);
      } catch {
        // Pointer capture is an enhancement; document-level pointer routing remains the fallback.
      }
      if (onLong && (longArmed?.() ?? true)) {
        // 按压期画一圈 475ms 铺开的进度环：只在短按与长按结果不同时出现，
        // 让玩家看得见"再按下去就变成长按（看详情）了"。
        this.el.classList.remove('pressing');
        void this.el.offsetWidth;
        this.el.classList.add('pressing');
        timer = window.setTimeout(() => {
          timer = null;
          this.el.classList.remove('pressing');
          if (activePointerId !== e.pointerId || movedOrCancelled) return;
          longFired = true;
          onLong();
        }, LONG_MS);
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId || movedOrCancelled) return;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > MOVE_TOLERANCE) {
        movedOrCancelled = true;
        clearTimer();
        this.el.classList.remove('pressing');
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId) return;
      const rect = this.el.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right
        && e.clientY >= rect.top && e.clientY <= rect.bottom;
      const shouldShort = !longFired && !movedOrCancelled && inside;
      reset(!inside);
      if (shouldShort) onShort?.('pointer');
    };
    const onPointerCancel = (e: PointerEvent) => {
      if (e.pointerId === activePointerId) reset(true);
    };
    // 只认 Enter：空格是战斗全局的「按住快进」键，卡片点过后仍保有焦点，不能让快进顺带触发卡片动作
    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.inputEnabled || e.target !== this.el || e.key !== 'Enter') return;
      e.preventDefault();
      if (!e.repeat) onShort?.('keyboard');
    };

    this.el.addEventListener('pointerdown', onPointerDown);
    this.el.addEventListener('pointermove', onPointerMove);
    this.el.addEventListener('pointerup', onPointerUp);
    this.el.addEventListener('pointercancel', onPointerCancel);
    this.el.addEventListener('lostpointercapture', onPointerCancel);
    this.el.addEventListener('keydown', onKeyDown);
    this.el.tabIndex = this.inputEnabled ? 0 : -1;
    this.el.setAttribute('role', 'button');
    this.cancelPress = () => reset(true);

    this.pressCleanup = () => {
      reset(true);
      this.el.removeEventListener('pointerdown', onPointerDown);
      this.el.removeEventListener('pointermove', onPointerMove);
      this.el.removeEventListener('pointerup', onPointerUp);
      this.el.removeEventListener('pointercancel', onPointerCancel);
      this.el.removeEventListener('lostpointercapture', onPointerCancel);
      this.el.removeEventListener('keydown', onKeyDown);
      this.el.removeAttribute('tabindex');
      this.el.removeAttribute('role');
      this.cancelPress = null;
      this.pressCleanup = null;
    };
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    this.el.style.pointerEvents = enabled ? 'auto' : 'none';
    if (this.pressCleanup) this.el.tabIndex = enabled ? 0 : -1;
    if (!enabled) this.cancelPress?.();
  }

  destroy(): void {
    this.pressCleanup?.();
    if (this.hintTimer !== null) {
      window.clearTimeout(this.hintTimer);
      this.hintTimer = null;
    }
    if (this.riseRaf !== null) {
      cancelAnimationFrame(this.riseRaf);
      this.riseRaf = null;
    }
  }

  pulseManaReady(): void {
    this.el.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }],
      { duration: 280, easing: 'ease-in-out' },
    );
  }

  /**
   * 卡面飘字（伤害/治疗/增益/状态结算用，需求 3.1/5.1/6.3）。
   * @param text 文本（如 "-12"、"+6"）
   * @param color 文字颜色
   */
  floatText(text: string, color: string, durationMs = 780): void {
    const el = document.createElement('div');
    el.textContent = text;
    // 字号随最长行收缩，宽度铺满卡面：此前固定 22px 且盒宽只有半张卡，
    // 「赐福抵挡」这类短词也会被折成两行并溢出卡外（伤害数字不受影响，仍是 22px）。
    const longest = Math.max(...text.split('\n').map(line => line.length));
    const fontSize = longest >= 10 ? 12 : longest >= 7 ? 14 : longest >= 4 ? 17 : 22;
    el.style.cssText =
      `position:absolute;left:50%;top:34%;width:100%;z-index:12;pointer-events:none;transform:translateX(-50%);` +
      `font-family:"Playfair Display",Georgia,serif;font-weight:800;font-size:${ofs(fontSize)}px;white-space:pre-line;line-height:1.15;text-align:center;` +
      `color:${color};text-shadow:0 1px 3px rgba(0,0,0,.95),0 0 6px ${color}`;
    this.el.appendChild(el);
    el.animate(
      [
        { opacity: 0, transform: 'translateX(-50%) translateY(6px) scale(.8)' },
        { opacity: 1, transform: 'translateX(-50%) translateY(-14px) scale(1.1)', offset: 0.4 },
        { opacity: 0, transform: 'translateX(-50%) translateY(-40px) scale(1)' },
      ],
      { duration: durationMs, easing: 'cubic-bezier(.2,.8,.25,1)' },
    ).onfinish = () => el.remove();
  }

  /**
   * 施法蓄力（双方）：施法者色外发光在 chargeMs 内由弱渐强、卡面微微收紧，
   * 蓄满瞬间向前一顶（发射）再回落，让玩家看清「谁在放技能」。
   * 有限 WAAPI 动画，按 1× 编写、随战斗倍速统一加速。
   */
  castCharge(color: string, chargeMs = 600): void {
    const glow = (a: number) => `drop-shadow(0 0 ${Math.round(4 + 14 * a)}px ${color}) brightness(${(1 + 0.35 * a).toFixed(2)})`;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = (s: string) => (reduced ? 'none' : s);
    const total = chargeMs + 260;
    const at = (ms: number) => Math.min(1, ms / total);
    this.el.animate(
      [
        { filter: glow(0), transform: 'none' },
        { filter: glow(0.35), transform: t('scale(0.99)'), offset: at(chargeMs * 0.5) },
        { filter: glow(0.85), transform: t('scale(0.97)'), offset: at(chargeMs) },
        { filter: glow(1), transform: t('scale(1.06)'), offset: at(chargeMs + 70) },
        { filter: glow(0), transform: 'none' },
      ],
      { duration: total, easing: 'linear' },
    );
  }

  /** 命中一击：卡面短促红闪 + 轻微抖动（技能伤害反馈） */
  hitFlash(): void {
    this.el.animate(
      [
        { filter: 'brightness(1)' },
        { filter: 'brightness(1.8) drop-shadow(0 0 6px rgba(255,80,80,.8))', offset: 0.3 },
        { filter: 'brightness(1)' },
      ],
      { duration: 260, easing: 'ease-out' },
    );
  }

  private static reducedMotion(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * 屏障格挡：卡面外沿亮起一圈冰蓝护盾（外扩淡出）+ 卡面冷色闪一下，微微被顶一下但不后仰。
   * @param dir 来袭方向（+1 从左往右打 / -1 从右往左打），决定被顶的方向
   */
  blockFlash(dir = 1): void {
    const ring = document.createElement('div');
    ring.setAttribute('aria-hidden', 'true');
    ring.style.cssText = [
      'position:absolute', 'inset:-4px', 'border-radius:11px', 'pointer-events:none', 'z-index:30',
      'border:2px solid rgba(170,226,255,.95)',
      'box-shadow:0 0 14px 2px rgba(120,200,255,.75),inset 0 0 18px rgba(140,210,255,.55)',
      'background:radial-gradient(ellipse at center,rgba(170,226,255,.18),rgba(170,226,255,0) 70%)',
    ].join(';');
    this.el.appendChild(ring);
    const reduced = CharacterCard.reducedMotion();
    ring.animate(
      [
        { opacity: 0, transform: 'scale(.94)' },
        { opacity: 1, transform: 'scale(1.02)', offset: 0.18 },
        { opacity: 0, transform: reduced ? 'scale(1.02)' : 'scale(1.1)' },
      ],
      { duration: 420, easing: 'ease-out' },
    ).onfinish = () => ring.remove();
    this.el.animate(
      [
        { filter: 'brightness(1)', transform: 'translateX(0)' },
        { filter: 'brightness(1.45) saturate(.7) drop-shadow(0 0 8px rgba(140,210,255,.8))',
          transform: reduced ? 'translateX(0)' : `translateX(${dir * 5}px)`, offset: 0.22 },
        { filter: 'brightness(1)', transform: 'translateX(0)' },
      ],
      { duration: 300, easing: 'ease-out' },
    );
  }

  /** 闪避：卡片向后一闪让开再回位，半透明一下 */
  dodgeStep(dir = 1): void {
    if (CharacterCard.reducedMotion()) {
      this.el.animate([{ opacity: 1 }, { opacity: 0.55, offset: 0.3 }, { opacity: 1 }], { duration: 320 });
      return;
    }
    this.el.animate(
      [
        { transform: 'translateX(0)', opacity: 1 },
        { transform: `translateX(${dir * 22}px) translateY(-6px)`, opacity: 0.55, offset: 0.3 },
        { transform: 'translateX(0)', opacity: 1 },
      ],
      { duration: 360, easing: 'cubic-bezier(.2,.8,.3,1)' },
    );
  }

  /**
   * 兵种转化：卡面沿竖轴「翻」到侧面（同时提亮），翻到最窄时换脸，再翻回正面略微回弹；
   * 外沿一圈流光外扩。纯 WAAPI，随战斗倍速加速；减少动态效果时只做亮度闪。
   * @param onMid 翻到侧面那一刻调用（在此换立绘）
   */
  transformFlip(onMid: () => void): void {
    const reduced = CharacterCard.reducedMotion();
    const ring = document.createElement('div');
    ring.setAttribute('aria-hidden', 'true');
    ring.style.cssText = [
      'position:absolute', 'inset:-3px', 'border-radius:10px', 'pointer-events:none', 'z-index:30',
      'border:2px solid rgba(240,217,164,.9)',
      'box-shadow:0 0 16px 2px rgba(214,170,255,.6),inset 0 0 14px rgba(240,217,164,.4)',
    ].join(';');
    if (reduced) {
      onMid();
      this.el.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.8)', offset: 0.3 }, { filter: 'brightness(1)' }], { duration: 360 });
      return;
    }
    const half = 170;
    const out = this.el.animate(
      [
        { transform: 'perspective(600px) rotateY(0deg)', filter: 'brightness(1)' },
        { transform: 'perspective(600px) rotateY(88deg) scale(.96)', filter: 'brightness(2.1) saturate(.4)' },
      ],
      { duration: half, easing: 'cubic-bezier(.5,0,.9,.4)', fill: 'forwards' },
    );
    out.onfinish = () => {
      onMid();
      this.el.appendChild(ring);
      ring.animate(
        [{ opacity: 0.9, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.12)' }],
        { duration: 420, easing: 'ease-out' },
      ).onfinish = () => ring.remove();
      const back = this.el.animate(
        [
          { transform: 'perspective(600px) rotateY(-88deg) scale(.96)', filter: 'brightness(2.1) saturate(.4)' },
          { transform: 'perspective(600px) rotateY(8deg) scale(1.03)', filter: 'brightness(1.25)', offset: 0.7 },
          { transform: 'perspective(600px) rotateY(0deg) scale(1)', filter: 'brightness(1)' },
        ],
        { duration: half + 90, easing: 'cubic-bezier(.2,.7,.3,1)' },
      );
      back.onfinish = () => out.cancel();
      back.oncancel = () => out.cancel();
    };
  }

  /**
   * 攻击冲撞：直接猛冲→命中卡顿(hit-stop)→平滑归位（无蓄力、回程不过冲）。
   * @param dx 冲撞水平位移（像素，含正负方向）
   * @param onHit 命中瞬间回调（用于播放撞击音效/震屏）
   */
  lunge(dx: number, onHit?: () => void): void {
    const el = this.el;
    const cfg = AnimConfig.attack;
    const prevZ = el.style.zIndex;
    // 重入保护：同一次连锁里第二次骷髅命中会再次触发冲撞。旧冲撞若还在飞，
    // 先整只取消（cancel 清除 fill:forwards 的残留效果），否则新旧动画叠加会
    // 出现瞬移/复位错乱，旧动画的 onfinish 还会把新冲撞的 transform 清掉。
    this.lungeAnim?.cancel();
    const gen = ++this.lungeGen;
    el.style.zIndex = '20';

    // 阶段 1：直接匀速冲过去（干脆利落，无缓动）
    const dash = el.animate(
      [
        { transform: 'translateX(0) scale(1)' },
        { transform: `translateX(${dx}px) scale(${cfg.lungeScale})` },
      ],
      { duration: cfg.dashDuration, easing: 'linear', fill: 'forwards' },
    );
    this.lungeAnim = dash;
    dash.onfinish = () => {
      if (gen !== this.lungeGen) return;
      // 命中瞬间：定格强调——瞬时再放大一点并锁住，制造“顿”的卡肉
      el.style.transform = `translateX(${dx}px) scale(${cfg.hitPunchScale})`;
      // 触发音效/震屏/受击
      onHit?.();
      window.setTimeout(() => {
        if (gen !== this.lungeGen) return;
        // 阶段 2：平滑归位（缓出，不向后拉、不过冲）
        const back = el.animate(
          [
            { transform: `translateX(${dx}px) scale(${cfg.hitPunchScale})` },
            { transform: 'translateX(0) scale(1)' },
          ],
          { duration: cfg.returnDuration, easing: 'ease-out', fill: 'forwards' },
        );
        this.lungeAnim = back;
        back.onfinish = () => {
          if (gen !== this.lungeGen) return;
          el.style.transform = '';
          el.style.zIndex = prevZ;
        };
      }, scaledMs(cfg.hitStop)); // hit-stop 卡肉停顿（与冲撞动画同随演出倍速）
    };
  }

  /**
   * 受击后仰（吸收参考的“顶飞”手感）：沿受击方向被顶退 + 上抬 + 挤压微转，
   * 再用弹性曲线带过冲地弹回原位。
   * @param dx 受击水平方向位移（像素，含正负；幅度由 AnimConfig.recoil 控制）
   */
  recoil(dx: number): void {
    const cfg = AnimConfig.recoil;
    const dir = Math.sign(dx) || 1;
    const kb = dir * cfg.knockback;
    const rot = dir * cfg.tilt;
    this.el.animate(
      [
        // 受击：被向后上方顶起、挤压、微转（定格那一下）
        { transform: 'translate(0,0) scale(1) rotate(0deg)', offset: 0 },
        {
          transform: `translate(${kb}px, ${-cfg.lift}px) scale(${cfg.squash}) rotate(${rot}deg)`,
          offset: 0.18,
          easing: 'cubic-bezier(.2,.8,.3,1)',
        },
        // 掉回并越过原位一点（过冲），制造重量回落感
        {
          transform: `translate(${kb * -0.18}px, 0) scale(1.02) rotate(${rot * -0.4}deg)`,
          offset: 0.55,
          easing: 'cubic-bezier(.3,1.4,.5,1)',
        },
        // 弹性收敛归位
        { transform: 'translate(0,0) scale(1) rotate(0deg)', offset: 1 },
      ],
      { duration: cfg.duration, easing: 'ease-out' },
    );
  }
}

/** 一支队伍的视图：竖向排布角色卡（DOM 列容器） */
export class TeamView {
  readonly el: HTMLDivElement;
  private cards = new Map<number, CharacterCard>();
  private side: PlayerSide;
  private shortPress?: (charId: number, via: PressSource) => void;
  private longPress?: (charId: number) => void;
  private longPressArmed?: (charId: number) => boolean;
  private leftAnchor = 0;
  private rightAnchor = 0;
  private mounted = false;
  private inputEnabled = true;
  private turnActive = false;

  constructor(
    team: Team,
    side: PlayerSide,
    opts?: {
      portraits?: Record<number, string>;
      /** @deprecated Use onShortPress. */
      onCardClick?: (charId: number) => void;
      /** 点按卡面任意位置（含宝石/徽记），或卡片聚焦时按 Enter */
      onShortPress?: (charId: number, via: PressSource) => void;
      onLongPress?: (charId: number) => void;
      /**
       * 按下时判定这次是否存在「长按」（计时 + 进度环）。缺省＝有 onLongPress 就总是存在；
       * 返回 false 时按多久都算短按。
       */
      longPressArmed?: (charId: number) => boolean;
    },
  ) {
    ensureStyles();
    this.side = side;
    this.shortPress = opts?.onShortPress ?? opts?.onCardClick;
    this.longPress = opts?.onLongPress;
    this.longPressArmed = opts?.longPressArmed;
    this.el = document.createElement('div');
    this.el.className = 'gcol';
    const frame = document.createElement('div');
    frame.className = 'turn-frame';
    this.el.appendChild(frame);

    team.characters.forEach((char, index) => {
      const card = new CharacterCard(char, side, {
        portrait: opts?.portraits?.[char.id],
        variant: VARIANTS[index % VARIANTS.length],
      });
      this.bindCard(card, char.id);
      this.el.appendChild(card.el);
      this.cards.set(char.id, card);
    });
    this.applyLayout();
  }

  private bindCard(card: CharacterCard, charId: number): void {
    if (!this.shortPress && !this.longPress) return;
    card.el.style.pointerEvents = 'auto';
    card.el.style.cursor = 'pointer';
    const armed = this.longPressArmed;
    card.bindPress(
      this.shortPress ? (via) => this.shortPress!(charId, via) : undefined,
      this.longPress ? () => this.longPress!(charId) : undefined,
      armed ? () => armed(charId) : undefined,
    );
    card.setInputEnabled(this.inputEnabled);
  }

  /**
   * 阵亡/逃跑后补在队尾的空位（与卡同尺寸的占位块）。空位计入槽数，所以减员后卡片
   * 不会放大成三人卡；只有召唤入场时才回收空位（见 addCharacterCard）。
   */
  private emptySlots(): HTMLElement[] {
    return [...(this.el?.children ?? [])].filter((el): el is HTMLElement =>
      el instanceof HTMLElement && el.classList.contains('gslot-empty'));
  }

  private layoutMetrics(): { slots: 3 | 4; width: number; height: number } {
    const slots: 3 | 4 = this.cards.size + this.emptySlots().length >= 4 ? 4 : 3;
    return { slots, ...battleCardDimensions(slots, BOARD_PX, CARD_GAP) };
  }

  /** Switch between the three-card and four-card layouts without rebuilding the column. */
  private applyLayout(): void {
    const metrics = this.layoutMetrics();
    this.el.style.width = `${metrics.width}px`;
    for (const card of this.cards.values()) card.resize(metrics.width, metrics.height);
    for (const slot of this.emptySlots()) {
      slot.style.width = `${metrics.width}px`;
      slot.style.height = `${metrics.height}px`;
    }
    if (!this.mounted) return;
    const left = this.side === PlayerSide.Left
      ? this.rightAnchor - metrics.width
      : this.leftAnchor;
    this.el.style.left = `${left}px`;
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    for (const card of this.cards.values()) card.setInputEnabled(enabled);
  }

  setTurnActive(active: boolean): void {
    this.turnActive = active;
    this.el.classList.toggle('active-ally', active && this.side === PlayerSide.Left);
    this.el.classList.toggle('active-enemy', active && this.side === PlayerSide.Right);
  }

  /** 画面上是否正显示为这一方的回合（演出层口径，可能滞后于引擎的 activePlayer） */
  isTurnActive(): boolean {
    return this.turnActive;
  }

  mount(parent: HTMLElement, left: number, top: number): void {
    this.leftAnchor = left;
    // App allocates CARD_W for the side column; anchor the narrower portrait at the board edge.
    this.rightAnchor = left + CARD_W;
    this.mounted = true;
    this.el.style.top = `${top}px`;
    parent.appendChild(this.el);
    this.applyLayout();
  }

  getCard(charId: number): CharacterCard | undefined {
    return this.cards.get(charId);
  }

  addCharacterCard(char: Character, opts?: { portrait?: string }): CharacterCard {
    const existing = this.cards.get(char.id);
    if (existing) return existing;
    const card = new CharacterCard(char, this.side, {
      portrait: opts?.portrait,
      variant: VARIANTS[this.cards.size % VARIANTS.length],
    });
    this.bindCard(card, char.id);
    // 召唤入场回收一个空位：引擎把召唤物排在存活部队末尾，画面同样插到最后一张存活卡之后，
    // 队首/顺序与引擎一致；有空位被回收时其余卡片滑动补位。
    const empty = this.emptySlots();
    if (empty.length > 0) {
      this.slideReorder(() => {
        empty[empty.length - 1]!.remove();
        const living = this.cardEls();
        const last = living[living.length - 1];
        if (last) last.after(card.el);
        else this.el.insertBefore(card.el, this.emptySlots()[0] ?? null);
      });
    } else {
      this.el.appendChild(card.el);
    }
    this.cards.set(char.id, card);
    this.applyLayout();
    card.el.animate(
      [
        { opacity: 0, transform: 'scale(.6)' },
        { opacity: 1, transform: 'scale(1.06)', offset: 0.7 },
        { opacity: 1, transform: 'scale(1)' },
      ],
      { duration: 360, easing: 'cubic-bezier(.2,.8,.25,1)' },
    );
    return card;
  }

  /** 阵亡/逃跑退场：后排递进补位，队尾留同尺寸空位（召唤入场时回收空位）。 */
  removeCharacterCard(charId: number): boolean {
    return this.removeCharacterCards([charId]) > 0;
  }

  /** Snapshot all departure positions, close ranks with empty slots appended at the tail, then lay out once. */
  removeCharacterCards(charIds: readonly number[]): number {
    const departing = [...new Set(charIds)].flatMap(id => {
      const card = this.cards.get(id);
      return card ? [{ id, card, top: card.el.offsetTop, left: card.el.offsetLeft,
        width: card.el.offsetWidth, height: card.el.offsetHeight }] : [];
    });
    const mutate = (): void => {
      for (const { id, card, top, left, width, height } of departing) {
        this.cards.delete(id);
        card.destroy();
        // 后排递进顶到前面（与引擎出编队一致）；空位补在队尾，槽数不变，卡片不放大
        const parent = card.el.parentNode;
        if (parent) {
          const slot = document.createElement('div');
          slot.className = 'gslot-empty';
          slot.setAttribute('aria-hidden', 'true');
          slot.style.width = `${width}px`;
          slot.style.height = `${height}px`;
          parent.appendChild(slot);
        }
        // 退场卡脱离文档流，在原位淡出
        card.el.style.position = 'absolute';
        card.el.style.left = `${left}px`;
        card.el.style.top = `${top}px`;
        card.el.style.width = `${width}px`;
        card.el.style.height = `${height}px`;
        card.el.style.zIndex = '24';
        card.el.style.pointerEvents = 'none';
      }
      if (departing.length) this.applyLayout();
    };
    // 幸存者滑动补位（FLIP），不是瞬移
    if (departing.length && this.el) this.slideReorder(mutate);
    else mutate();
    for (const { card } of departing) {
      const departure = card.el.animate(
        [
          { opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' },
          { opacity: 0, transform: 'scale(.72)', filter: 'brightness(.45) grayscale(.7)' },
        ],
        { duration: AnimConfig.defeat.cardExitDuration, easing: 'cubic-bezier(.4,0,.8,.3)', fill: 'forwards' },
      );
      departure.onfinish = () => card.el.remove();
    }
    return departing.length;
  }

  /** 把一张卡滑到编队下标。已经在那个位置就不动。 */
  placeCard(charId: number, index: number): void {
    const card = this.cards.get(charId);
    if (!card) return;
    const cards = this.cardEls();
    const from = cards.indexOf(card.el);
    if (from < 0) return;
    const to = Math.max(0, Math.min(cards.length - 1, index));
    if (from === to) return;
    this.slideReorder(() => {
      const next = this.cardEls();
      if (from < to) {
        const after = next[to + 1];
        if (after) this.el.insertBefore(card.el, after);
        else this.el.appendChild(card.el);
      } else {
        const ref = next[to];
        if (ref) this.el.insertBefore(card.el, ref);
        else this.el.appendChild(card.el);
      }
    });
  }

  /** 整列滑到给定顺序（打乱队伍）。id 按从上到下。 */
  orderCards(ids: number[]): void {
    const current = this.cardEls().map((el) => Number(el.dataset.testid?.replace('card-', '')));
    if (ids.length === current.length && ids.every((id, i) => id === current[i])) return;
    this.slideReorder(() => {
      for (const id of ids) {
        const card = this.cards.get(id);
        if (card) this.el.appendChild(card.el);
      }
    });
  }

  private cardEls(): HTMLElement[] {
    return [...this.el.children].filter((el): el is HTMLElement =>
      el instanceof HTMLElement && el.classList.contains('gcard'));
  }

  private slideAnims = new Map<HTMLElement, Animation>();

  /** 先改 DOM 顺序，再用位移把卡从旧位置滑到新位置。 */
  private slideReorder(mutate: () => void): void {
    const before = new Map(this.cardEls().map((el) => [el, el.getBoundingClientRect().top]));
    mutate();
    for (const el of this.cardEls()) {
      const prev = before.get(el);
      if (prev === undefined) continue;
      const dy = prev - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 0.5) continue;
      this.slideAnims.get(el)?.cancel();
      el.style.zIndex = '8';
      const anim = el.animate(
        [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0px)' }],
        { duration: 320, easing: 'cubic-bezier(.22,.8,.28,1)' },
      );
      this.slideAnims.set(el, anim);
      const clear = (): void => {
        if (this.slideAnims.get(el) === anim) this.slideAnims.delete(el);
        el.style.zIndex = '';
      };
      anim.onfinish = clear;
      anim.oncancel = clear;
    }
  }

  refreshAll(): void {
    for (const card of this.cards.values()) card.refresh();
  }

  /** 推入舞台缩放（B-7：徽记 24px 下限是屏幕像素口径，见 CharacterCard.setStageScale） */
  setStageScale(scale: number): void {
    for (const card of this.cards.values()) card.setStageScale(scale);
  }

  static totalHeight(): number {
    return TEAM_SIZE * CARD_H + (TEAM_SIZE - 1) * CARD_GAP;
  }
}
