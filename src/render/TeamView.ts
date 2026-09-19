import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';
import { AnimConfig } from './AnimationConfig';
import { statusBadge, statusBadgeIcon } from './statusBadges';
import { traitBadgeSvg } from './traitBadges';
import { getTrait } from '@engine/traits';
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
let TEAM_SIZE = 3;
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

/** 六色宝石色值（与棋盘宝石呼应，鲜明可辨） */
const COLOR_HEX: Record<BaseColor, string> = {
  [BaseColor.Red]: '#e8555e',
  [BaseColor.Green]: '#57c06b',
  [BaseColor.Blue]: '#4f9fe0',
  [BaseColor.Yellow]: '#e8c24a',
  [BaseColor.Purple]: '#a074d4',
  [BaseColor.Brown]: '#c0823f',
};

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

// 线性图标（暖金描边，与衬线数字气质统一，数字作主体）
const ICO_GOLD = '#e6d6ad';
// crossed-swords（game-icons.net / lorc，CC BY 3.0）：填充型双剑图标
const SWORD_SVG = `<svg class="ic" viewBox="0 0 512 512" width="14" height="14"><path fill="${ICO_GOLD}" d="M19.75 14.438c59.538 112.29 142.51 202.35 232.28 292.718l3.626 3.75.063-.062c21.827 21.93 44.04 43.923 66.405 66.25-18.856 14.813-38.974 28.2-59.938 40.312l28.532 28.53 68.717-68.717c42.337 27.636 76.286 63.646 104.094 105.81l28.064-28.06c-42.47-27.493-79.74-60.206-106.03-103.876l68.936-68.938-28.53-28.53c-11.115 21.853-24.413 42.015-39.47 60.593-43.852-43.8-86.462-85.842-130.125-125.47-.224-.203-.432-.422-.656-.625C183.624 122.75 108.515 63.91 19.75 14.437zm471.875 0c-83.038 46.28-154.122 100.78-221.97 161.156l22.814 21.562 56.81-56.812 13.22 13.187-56.438 56.44 24.594 23.186c61.802-66.92 117.6-136.92 160.97-218.72zm-329.53 125.906 200.56 200.53a402.965 402.965 0 0 1-13.405 13.032L148.875 153.53l13.22-13.186zm-76.69 113.28-28.5 28.532 68.907 68.906c-26.29 43.673-63.53 76.414-106 103.907l28.063 28.06c27.807-42.164 61.758-78.174 104.094-105.81l68.718 68.717 28.53-28.53c-20.962-12.113-41.08-25.5-59.937-40.313 17.865-17.83 35.61-35.433 53.157-52.97l-24.843-25.655-55.47 55.467c-4.565-4.238-9.014-8.62-13.374-13.062l55.844-55.844-24.53-25.374c-18.28 17.856-36.602 36.06-55.158 54.594-15.068-18.587-28.38-38.758-39.5-60.625z"/></svg>`;
const HEART_SVG = `<svg class="ic" viewBox="3 4 18 17" width="13" height="13"><path fill="none" stroke="${ICO_GOLD}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M12 20C6.5 16 3.5 12.8 3.5 9.2 3.5 6.6 5.5 4.7 8 4.7c1.6 0 3.1.8 4 2.2.9-1.4 2.4-2.2 4-2.2 2.5 0 4.5 1.9 4.5 4.5 0 3.6-3 6.8-8.5 10.8z"/></svg>`;
const SHIELD_SVG = `<svg class="ic-armor" viewBox="0 0 24 24" width="11" height="11"><path fill="none" stroke="${ICO_GOLD}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" d="M12 3 19 5.5v5.5c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V5.5z"/></svg>`;
// 魔力（法术强度）图标：水晶球（game-icons.net / lorc «crystal-ball», CC BY 3.0）。
// 用径向渐变填充做出"发光宝珠"的立体质感（中心亮、边缘深紫），而非扁平色块。
const MAGIC_SVG = `<svg class="ic-magic" viewBox="0 0 512 512" width="17" height="17"><defs><radialGradient id="mgOrb" cx="38%" cy="30%" r="78%"><stop offset="0%" stop-color="#f7f0ff"/><stop offset="42%" stop-color="#cdaef3"/><stop offset="100%" stop-color="#7c4dbe"/></radialGradient></defs><path fill="url(#mgOrb)" d="M254.563 20.75c-42.96 0-85.918 16.387-118.688 49.156-65.54 65.54-65.852 172.15-.313 237.688 65.54 65.54 172.15 65.226 237.688-.313 65.54-65.538 65.54-171.835 0-237.374-32.77-32.77-75.728-49.156-118.688-49.156zm-.157 18.47a149.284 149.284 0 0 1 74.313 19.968c-13.573-3.984-26.266-2.455-34.22 5.5-14.437 14.437-7.796 44.485 14.813 67.093 22.608 22.61 52.625 29.22 67.062 14.782 8.523-8.522 9.706-22.468 4.594-37.125 36.352 57.684 29.586 134.6-20.69 184.875-29.158 29.16-67.353 43.773-105.56 43.813 9.436-2.3 17.762-6.732 24.436-13.406 28.885-28.886 15.64-88.954-29.594-134.19-45.234-45.233-105.302-58.51-134.187-29.624-4.052 4.052-7.266 8.723-9.688 13.875 3.092-33.537 17.473-66.222 43.157-91.905 29.198-29.2 67.384-43.737 105.562-43.656zM386.97 319.28c-.205.206-.39.422-.595.626-72.78 72.78-191.252 73.155-264.03.375-.278-.275-.54-.565-.814-.842-11.987 9.483-18.81 20.384-18.81 32 0 36.523 67.315 66.125 151.343 66.125 84.027 0 152.093-29.6 152.093-66.125 0-11.68-6.97-22.637-19.187-32.157zm39.717 54.564c-22.225 32.29-91.192 55.906-172.625 55.906-81.172 0-149.954-23.46-172.406-55.594-12.638 11.3-19.72 24.052-19.72 37.563.002 46.928 85.546 85.03 192.064 85.03 106.518 0 192.97-38.1 192.97-85.03 0-13.637-7.313-26.498-20.283-37.876z"/></svg>`;

const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  // B-1 名字条的几何：贴在攻/甲/血一行之上，徽记栏再叠在它之上（见 .status-strip）
  const NAME_BAND_BOTTOM = os(9) + ofs(18) + os(3);
  const NAME_BAND_H = ofs(13) + os(3) + os(2) + 2;
  const css = `
  .gcol{position:absolute;display:flex;flex-direction:column;gap:${CARD_GAP}px;pointer-events:none}
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
  .gcard.casting-origin{transform:translateY(-4px) scale(1.03);z-index:1210;
    transition:transform .18s cubic-bezier(.2,.9,.3,1)}
  .gcard.casting-origin::after{content:"";position:absolute;inset:-2px;z-index:9;border-radius:10px;pointer-events:none;
    border:2px solid rgba(240,210,130,.95);box-shadow:0 0 16px rgba(240,210,130,.75)}
  .gcard.castable .card-frame{filter:brightness(1.18)}
  .gcard.castable .frame-ornament{filter:brightness(1.15) drop-shadow(0 2px 2px rgba(0,0,0,.8))}
  /* B-6（UX 阶段 B）：可释放态此前只有卡框亮度 +18% + 宝石呼吸，无显式信号，
     而"沉默放不出"共用同一套视觉。这里给两件事各一个能读懂的标记：
     ① 可释放 → 卡框走一道暖金流光 + 法力宝石旁打感叹号；
     ② 沉默且满法力 → 同一位置改叉号并转紫灰（与 silenced 宝石的紫灰呼吸同族）。 */
  .gcard .cast-flag{position:absolute;z-index:8;top:${os(2)}px;left:${gemSize() + os(3)}px;
    display:none;align-items:center;justify-content:center;
    min-width:${os(14)}px;height:${os(14)}px;padding:0 ${os(3)}px;box-sizing:border-box;
    border-radius:${os(4)}px;pointer-events:none;
    font-family:"Oswald",sans-serif;font-weight:700;font-size:${ofs(11)}px;line-height:1;
    color:#1a1206;background:linear-gradient(180deg,#ffe9ad,#d9b264);
    border:1px solid rgba(120,92,40,.9);box-shadow:0 1px 3px rgba(0,0,0,.7)}
  .gcard.castable .cast-flag,.gcard.silenced.mana-full .cast-flag{display:inline-flex}
  .gcard.silenced.mana-full .cast-flag{color:#e6dcf5;
    background:linear-gradient(180deg,#6b5885,#3b2f4d);border-color:rgba(150,120,190,.85)}
  .gcard.castable:not(.silenced) .cast-flag{animation:castFlagBeat 1.4s ease-in-out infinite}
  @keyframes castFlagBeat{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}
  /* 卡框流光：只在可释放且未沉默时跑，一眼能从视野边缘捕捉到 */
  .gcard .cast-sheen{position:absolute;inset:-1px;z-index:8;border-radius:9px;pointer-events:none;
    display:none;overflow:hidden}
  .gcard.castable:not(.silenced) .cast-sheen{display:block}
  .gcard .cast-sheen::before{content:"";position:absolute;inset:-40%;
    background:linear-gradient(115deg,transparent 42%,rgba(255,240,196,.42) 50%,transparent 58%);
    animation:castSheen 2.6s linear infinite}
  @keyframes castSheen{0%{transform:translateX(-60%)}100%{transform:translateX(60%)}}

  /* B-5（UX 阶段 B）：长按前给按压进度反馈。短按=施法 / 长按=详情只差 475ms，
     且误触代价不对称（想看详情结果放了技能 = 法力全没），按压期画一圈铺开的进度环，
     让玩家看得见"再按下去就变成长按了"。 */
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
    .gcard.castable:not(.silenced) .cast-flag{animation:none}
    .gcard .cast-sheen::before{animation:none;opacity:.25}
    .gcard.pressing .press-ring{animation:none;opacity:.8}
  }

  /* B-3（UX 阶段 B）：短按无效时的即时反馈浮窗（还差 N 点法力 / 等待对手行动 / 沉默中）。
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
    .gcard.status-accent-faerie-fire .status-accent-layer::before,.gcard.status-accent-terror .status-accent-layer::before{animation:none}}


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

  /* ?????????????????????????????? */
  .gcard .ov{position:absolute;z-index:6}
  /* 旧名字槽 .c-tl 随 B-1 的名字条一起退役：名字改挂立绘底缘的 .name-band */
  .gcard .c-bl{left:${os(13)}px;bottom:${os(9)}px}
  .gcard .c-br{right:${os(13)}px;bottom:${os(9)}px;text-align:right}
  .gcard.frozen .c-bl,.gcard.frozen .c-br{isolation:isolate}
  .gcard.frozen .c-bl::before,.gcard.frozen .c-br::before{content:"";position:absolute;z-index:-1;
    inset:-${os(7)}px -${os(9)}px -${os(6)}px;border-radius:${os(12)}px;pointer-events:none;
    background:radial-gradient(ellipse at 50% 68%,rgba(3,12,18,.82) 0%,rgba(4,14,21,.48) 50%,transparent 78%);
    filter:blur(1px)}

  /* B-1 + B-2（UX 阶段 B）：名字条 + 常驻法力进度。
     阶段 A：name 元素被 display:none 硬关掉（元素与内容都在），八张卡一个名字都不显示；
     mana-num 的三处样式是死样式（模板里根本没有这个元素），法力数字只在 hover/点宝石
     的浮窗里，移动端无 hover 等于拿不到。两项都是"该不该现在放技能"的判据，补回卡面。
     位置：压在立绘底缘的暗带上，左名字（一行省略号）右 N/M，正好在攻/甲/血一行之上。 */
  .gcard .name-band{position:absolute;z-index:6;left:0;right:0;bottom:${NAME_BAND_BOTTOM}px;
    display:flex;align-items:baseline;justify-content:space-between;gap:${os(6)}px;
    padding:${os(3)}px ${os(9)}px ${os(2)}px;pointer-events:none;
    background:linear-gradient(180deg,rgba(6,5,4,0) 0%,rgba(6,5,4,.62) 38%,rgba(6,5,4,.86) 100%)}
  .gcard .name{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;
    font-family:"Oswald",sans-serif;font-weight:600;font-size:${ofs(13)}px;letter-spacing:.02em;
    color:#f3e7c9;text-shadow:0 1px 3px rgba(0,0,0,.95)}
  /* 移动横屏（卡 110×129）放不下名字：整条降级为只留法力数字，名字改
     "首回合浮现 0.8s + 长按详情"。法力数字优先保留——它比名字更高频。 */
  .gcard.name-compact .name{display:none}
  .gcard.name-compact .name-band{justify-content:flex-end}
  .gcard .name-flash{position:absolute;z-index:11;left:${os(6)}px;right:${os(6)}px;bottom:50%;
    padding:${os(2)}px ${os(5)}px;pointer-events:none;opacity:0;text-align:center;border-radius:${os(4)}px;
    background:rgba(8,7,5,.86);border:1px solid rgba(216,194,144,.45);
    font-family:"Oswald",sans-serif;font-weight:600;font-size:${ofs(12)}px;color:#f6ecd2;
    overflow:hidden;white-space:nowrap;text-overflow:ellipsis}

  /* 法力：常驻 N/M（死样式复用），暖金，满充提亮；沉默转紫见下方 silenced 段 */
  .gcard .mana-num{flex:none;font-family:"Oswald",sans-serif;font-weight:600;letter-spacing:.04em;
    font-size:${ofs(12)}px;color:#d8c290;font-variant-numeric:tabular-nums;
    text-shadow:0 1px 3px rgba(0,0,0,.9)}
  .gcard.mana-full .mana-num{color:#fff3d2;text-shadow:0 1px 3px rgba(0,0,0,.9),0 0 6px rgba(232,200,121,.6)}

  /* 法力宝石：贴着卡片左上角、嵌进边框的"书签式"角标（与立绘卡同源的边框语言）。
     外侧两角与卡片圆角对齐(左上=卡圆角)，仅内侧(右下)收大圆角，像长在边框上而非浮在画面里。 */
  /* 触控区随视觉一起同比缩小：这是二级信息入口（点开法力进度浮窗），
     不再计入 44×44 关键控件；全屏、队伍人数与角色卡本身仍保持 ≥44 CSS px。 */
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
  .gcard.silenced .mana-num{color:#9a86b0;text-shadow:0 1px 3px rgba(0,0,0,.9)}
  @keyframes gemSilenced{0%,100%{opacity:.5}50%{opacity:.78}}
  @keyframes gemBreath{
    0%,100%{transform:scale(1)}
    50%{transform:scale(1.12)}
  }

  /* 法力进度浮窗：跟随书签显示在其下方 */
  /* 浮窗贴在书签正下方：书签缩小后这里必须跟着上移，否则会悬空盖住立绘中段。 */
  .gcard .gem-tip{position:absolute;top:${gemSize() + os(4)}px;left:2px;
    z-index:9;display:none;white-space:nowrap;padding:3px 7px;border-radius:5px;
    background:rgba(11,10,9,.92);border:1px solid rgba(216,194,144,.45);
    font-family:"Oswald",sans-serif;font-size:10px;letter-spacing:.04em;color:#f0e2bf;
    box-shadow:0 2px 8px rgba(0,0,0,.7)}
  .gcard .gem-tip .gt{display:flex;align-items:center;gap:4px;line-height:1.5}
  .gcard .gem-tip .dot{width:7px;height:7px;transform:rotate(45deg);border-radius:1px}
  .gcard .gem.show-tip ~ .gem-tip,.gcard .gem:hover ~ .gem-tip{display:block}

  /* 攻防：填充图标 + 衬线数字（数字作主体，图标与数字底部对齐并略下沉） */
  .gcard .stat{display:flex;align-items:flex-end;gap:${os(5)}px;flex-direction:row-reverse}
  /* SVG 自带的 width/height 属性会被这里的 CSS 覆盖，图标才能跟数字一起缩。 */
  .gcard .stat .ic{flex:none;width:${os(14)}px;height:${os(14)}px;
    filter:drop-shadow(0 1px 2px rgba(0,0,0,.8));transform:translateY(1px)}
  .gcard .stat .v{font-family:"Playfair Display",Georgia,serif;font-weight:800;line-height:1;font-size:${ofs(18)}px;
    letter-spacing:-.01em;color:#f6efe0;text-shadow:0 1px 2px rgba(0,0,0,.95),0 0 4px rgba(0,0,0,.55)}

  /* 护甲：并入血量行，紧贴血量左侧，纯暖金数字 + 小盾 */
  .gcard .armor{display:inline-flex;align-items:center;gap:2px;margin-right:${os(5)}px}
  .gcard .armor .ic-armor{flex:none;width:${os(11)}px;height:${os(11)}px}
  .gcard .armor .v{font-family:"Oswald",sans-serif;font-weight:600;font-size:${ofs(11)}px;color:#d8c290;text-shadow:0 1px 3px rgba(0,0,0,.9)}

  /* 魔力（法术强度）：镜像左上法力宝石的"书签式"角标，嵌进右上角边框，与法力成对呼应。
     深色玻璃底 + 神秘紫边（呼应法力的暖金边），内含发光水晶球 + 高对比数字。 */
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

  /* 状态图标栏：卡片左下角横排，中毒/燃烧/沉默等各一枚可辨识图标 + 剩余回合 */
  /* 底部三层自下而上：攻/甲/血一行 → B-1 名字条 → 状态徽记栏。
     名字条占掉了原来 os(34) 这一档，徽记栏必须再抬一层名字条的高度，
     否则名字条的暗带会盖住徽记（改前/改后对照时发现的回归）。 */
  .gcard .status-strip{position:absolute;z-index:6;left:${os(6)}px;bottom:${NAME_BAND_BOTTOM + NAME_BAND_H}px;
    display:flex;flex-wrap:wrap-reverse;gap:${os(3)}px;max-width:${CARD_W - os(12)}px;pointer-events:none}
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
  /* B-7 折叠态入口：+N 一次点开全部状态（走详情面板的"当前状态"区） */
  .gcard .status-more{display:inline-flex;align-items:center;justify-content:center;
    min-width:var(--sbz,${Math.max(24, os(20))}px);height:var(--sbz,${Math.max(24, os(20))}px);
    padding:0 2px;box-sizing:border-box;border-radius:${os(5)}px;cursor:pointer;pointer-events:auto;
    color:#f0e2bf;background:rgba(11,10,9,.88);border:1px solid rgba(216,194,144,.62);
    font-family:"Oswald",sans-serif;font-weight:700;font-size:${ofs(11)}px;line-height:1}
  .gcard .status-more:hover{color:#fff3d2;border-color:#e0c98a}
  .gcard .status-badge .sb-turns{position:absolute;right:-3px;bottom:-3px;min-width:11px;height:11px;
    padding:0 1px;box-sizing:border-box;border-radius:6px;background:#0b0a09;border:1px solid var(--sb);
    font-family:"Oswald",sans-serif;font-size:8px;line-height:9px;text-align:center;color:#f0e2bf}

  /* 特质图标列：紧贴立绘左边框竖排（用户反馈：不要底衬、不要空隙、突出立绘）。
     图标靠自身描边 + 双层投影保证在浅色立绘上的可读性；无特质时整列隐藏 */
  .gcard .trait-row{position:absolute;z-index:6;left:0;top:50%;transform:translateY(-50%);
    display:flex;flex-direction:column;align-items:center;gap:${os(5)}px;pointer-events:none;
    padding:${os(3)}px 0}
  .gcard .trait-row:empty{display:none}
  .gcard .trait-badge{display:inline-flex;
    filter:drop-shadow(0 1px 2px rgba(0,0,0,.95)) drop-shadow(0 0 4px rgba(0,0,0,.65))}
  .gcard .trait-badge svg{display:block;width:100%;height:100%}
  .gcard .trait-badge-off{opacity:.4}
  /* B-8 覆盖面：特质图标接入同一套自绘浮层（此前只有一个原生 title、没有描述）。
     只让图标本身可命中，容器保持 none——否则容器内边距也会吞掉卡面按压。 */
  .gcard .trait-badge{pointer-events:auto;cursor:pointer}
  .gcard .trait-badge:hover{filter:drop-shadow(0 1px 2px rgba(0,0,0,.95)) drop-shadow(0 0 6px rgba(240,222,170,.85))}
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
  private nameEl!: HTMLElement;
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
  private readonly eventController = new AbortController();
  private tipEl!: HTMLElement;     // 法力进度浮窗
  private manaNumEl!: HTMLElement; // 常驻法力进度 N/M（B-2）
  private castFlagEl!: HTMLElement; // 可释放 / 沉默 的显式标记（B-6）
  private hintEl!: HTMLElement;    // 短按无效提示浮窗（B-3）
  private flashEl!: HTMLElement;   // 紧凑卡的名字一次性浮现（B-1 降级路径）
  private hintTimer: number | null = null;
  /** 当前卡片 CSS 宽度与舞台缩放（B-7 的 24px 屏幕像素下限要两者一起算） */
  private cardWidth = CARD_W;
  private stageScale = 1;
  private statusCollapsed = false;
  /** 折叠态点 +N 的回调（打开详情面板的"当前状态"区） */
  private onStatusList: (() => void) | null = null;
  private magicEl!: HTMLElement;   // 魔力（法术强度）数值
  private statusStripEl!: HTMLElement; // 状态图标栏（中毒/燃烧…）
  private traitRowEl!: HTMLElement; // 特质图标行（卡面底部）
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
        <div class="stat">${SWORD_SVG}<span class="v atk">0</span></div>
      </div>
      <div class="ov c-br"></div>
      <div class="gem" tabindex="0" role="button" aria-label="法力">${gemSvg(gemColors)}</div>
      <div class="gem-tip"></div>
      <div class="cast-flag" aria-hidden="true">!</div>
      <div class="magic" title="魔力（法术强度）">${MAGIC_SVG}<span class="v magic-v">0</span></div>
      <div class="status-strip" aria-label="状态"></div>
      <div class="trait-row" aria-label="特质"></div>
      <div class="name-band"><span class="name"></span><span class="mana-num">0/0</span></div>
      <div class="name-flash" aria-hidden="true"></div>
      <div class="cast-hint" role="status" aria-live="polite"></div>
    `;
    this.el = el;
    this.nameEl = el.querySelector('.name')!;
    this.atkEl = el.querySelector('.atk')!;
    this.brEl = el.querySelector('.c-br')!;
    this.gemEl = el.querySelector('.gem')!;
    this.riseEl = el.querySelector('.rise')!;
    this.tipEl = el.querySelector('.gem-tip')!;
    this.manaNumEl = el.querySelector('.mana-num')!;
    this.castFlagEl = el.querySelector('.cast-flag')!;
    this.hintEl = el.querySelector('.cast-hint')!;
    this.flashEl = el.querySelector('.name-flash')!;
    this.magicEl = el.querySelector('.magic-v')!;
    this.statusStripEl = el.querySelector('.status-strip')!;
    this.traitRowEl = el.querySelector('.trait-row')!;
    this.renderTraitRow();
    this.gemColors = gemColors;

    // 法力宝石在完整 pointer 生命周期中隔离冒泡，避免卡片先进入短按/长按状态。
    const stopGemPointer = (e: PointerEvent) => e.stopPropagation();
    this.gemEl.addEventListener('pointerdown', stopGemPointer, { signal: this.eventController.signal });
    this.gemEl.addEventListener('pointermove', stopGemPointer, { signal: this.eventController.signal });
    this.gemEl.addEventListener('pointerup', stopGemPointer, { signal: this.eventController.signal });
    this.gemEl.addEventListener('pointercancel', stopGemPointer, { signal: this.eventController.signal });
    // 点击/触摸切换法力进度浮窗（移动端友好），桌面端 hover 由 CSS 处理。
    this.gemEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.gemEl.classList.toggle('show-tip');
    }, { signal: this.eventController.signal });

    this.nameEl.textContent = char.name;
    this.flashEl.textContent = char.name;
    this.applyCompactMetrics(CARD_W);

    this.refresh();
  }

  /**
   * 特质图标列（立绘左侧竖排）：按效果族代码绘制，title=特质名。
   * traitIds 战斗中不变，构造时渲染一次即可；未实现 code 显示暗色占位六边形。
   */
  private renderTraitRow(): void {
    if (!this.traitRowEl) return;
    // 卡面只展示 3 条特质（用户裁定 2026-09-19）：主角= 职业专属特质（displayTraitIds），
    // 天赋只在详情面板出现；兵种= 3 特质原样。
    const codes = [...new Set(this.char.displayTraitIds ?? this.char.traitIds ?? [])].slice(0, 3);
    this.traitRowEl.innerHTML = codes
      .map((code) => {
        // B-8 覆盖面：特质图标接入同一套自绘浮层（此前只有原生 title，且没有描述）。
        // 名称/描述写进 data-*，由 statusTooltip 统一渲染；title 一并撤掉避免双轨。
        // 「未生效」是开发口径，改玩家口径「本场不生效」（同 B-10）。
        const size = `width:${os(16)}px;height:${os(16)}px`;
        const lib = getTrait(code);
        const name = lib?.name ?? this.char.traitNames?.[code] ?? code;
        const data = `data-trait-name="${escAttr(name)}" data-trait-desc="${escAttr(lib?.description ?? '')}"`;
        const svg = traitBadgeSvg(code);
        return svg
          ? `<span class="trait-badge" ${data} aria-label="特质 ${escAttr(name)}" style="${size}">${svg}</span>`
          : `<span class="trait-badge trait-badge-off" ${data} data-trait-off="1" aria-label="特质 ${escAttr(name)}（本场不生效）" style="${size}"><svg viewBox="0 0 24 24"><path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z" fill="rgba(0,0,0,.35)" stroke="#8a7c5c" stroke-width="1.4"/></svg></span>`;
      })
      .join('');
  }

  resize(width: number, height: number): void {
    this.el.style.width = `${width}px`;
    this.el.style.height = `${height}px`;
    this.statusStripEl.style.maxWidth = `${Math.max(0, width - 12)}px`;
    this.applyCompactMetrics(width);
  }

  /**
   * 按实时卡宽调两件事（CSS 里的 os() 是首次注入时烘死的，窗口缩放后会留旧值）：
   * - B-7：状态徽记 24px 绝对下限（等比值不足时抬到 24）；
   * - B-1 降级：卡宽放不下名字条时转紧凑态（只留法力数字，名字走一次性浮现 + 长按）。
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
    this.el.style.setProperty('--sbz', `${badge}px`);
    this.el.style.setProperty('--sbiz', `${Math.max(12, Math.round(badge * 0.84))}px`);
    // 连 30% 封顶都达不到 24 屏幕 px 时，改"状态条折叠 → 一次点开全部状态"
    // （`15-battle.md` B-7 给的备选方案）：只留 3 枚 + 一个 +N 入口。
    const collapsed = badge * stage < 23.5;
    if (collapsed !== this.statusCollapsed) {
      this.statusCollapsed = collapsed;
      this.el.classList.toggle('status-collapsed', collapsed);
      this.renderStatuses();
    }
    // 名字条同理按**屏幕**宽度判断：卡片 CSS 宽度不随视口变，变的是舞台缩放
    // （阶段 A 实测移动横屏卡片 110×129 就是缩放后的屏幕尺寸）。
    this.el.classList.toggle('name-compact', width * stage < 120);
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

  refresh(): void {
    const c = this.char;

    this.atkEl.textContent = String(c.attack);
    this.magicEl.textContent = String(c.magic);

    // 右下：护甲（可选，并入同一行，紧贴血量左侧）+ 血量
    const armorBlock =
      c.armor > 0
        ? `<span class="armor">${SHIELD_SVG}<span class="v">${c.armor}</span></span>`
        : '';
    this.brEl.innerHTML = `<div class="stat">${HEART_SVG}<span class="v hp">${Math.max(0, c.hp)}</span>${armorBlock}</div>`;

    // Normal refresh synchronizes to engine state; absorbMana() advances intermediate visual states.
    this.displayedMana = Math.min(c.mana, c.manaCost);
    this.renderMana(this.displayedMana);

    this.renderStatuses();

    this.el.classList.toggle('defeated', c.defeated);
  }

  /** 折叠态「+N」的点击回调（由 TeamView 注入，指向详情面板） */
  setStatusListHandler(fn: (() => void) | null): void {
    this.onStatusList = fn;
  }

  /** 渲染状态图标栏：按角色当前 statuses 显示可区分图标（需求 6.1） */
  private renderStatuses(): void {
    const all = this.char.statuses ?? [];
    // B-7 折叠态：徽记在当前舞台缩放下小于 24 屏幕 px 时只留 3 枚 + 一个 +N 入口，
    // 点它一次看全部状态（详情面板的"当前状态"区，B-10 已补齐）。
    const shown = this.statusCollapsed && all.length > 3 ? all.slice(0, 3) : all;
    const overflow = all.length - shown.length;
    const statuses = shown;
    this.statusStripEl.innerHTML = statuses
      .map((s) => {
        const b = statusBadge(s.id);
        const turns = s.turns > 0 ? `<span class="sb-turns">${s.turns}</span>` : '';
        // data-status-id / data-magnitude：状态点击说明浮层读取实例实际数值
        const mag = s.magnitude !== undefined ? ` data-magnitude="${s.magnitude}"` : '';
        // B-8：去掉原生 title。此前 title（名字+回合）与自绘浮层（机制+当前数值）
        // 双轨并存且内容不一致，桌面 hover 拿到的恰是差的那一份。名字改走
        // data-status-label，statusTooltip 从它取标题——单一事实源。
        return `<span class="status-badge" data-status-id="${s.id}" data-status-label="${escAttr(b.label)}" data-turns="${s.turns}"${mag} aria-label="${escAttr(b.label)}${s.turns ? ' · 剩余 ' + s.turns + ' 回合' : ''}" style="--sb:${b.color}">${statusBadgeIcon(s.id)}${turns}</span>`;
      })
      .join('')
      + (overflow > 0
        ? `<button type="button" class="status-more" aria-label="查看全部 ${all.length} 个状态">+${overflow}</button>`
        : '');
    const more = this.statusStripEl.querySelector('.status-more');
    if (more) {
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        this.onStatusList?.();
      });
      // 与徽记同样不得穿透到卡面短按（否则点它就是放技能）
      for (const type of ['pointerdown', 'pointerup'] as const) {
        more.addEventListener(type, (e) => { e.stopPropagation(); e.preventDefault(); });
      }
    }
  }

  /** 状态图标出现动效（供 status-apply 事件驱动，需求 6.2） */
  applyStatusBadge(): void {
    this.renderStatuses();
    const last = this.statusStripEl.lastElementChild as HTMLElement | null;
    last?.animate(
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

    const rows = this.gemColors
      .map(
        (col) =>
          `<div class="gt"><span class="dot" style="background:${COLOR_HEX[col]}"></span></div>`,
      )
      .join('');
    // B-2：常驻 N/M。宝石浮窗保留（它多给一份关联色），但不再是唯一入口。
    this.manaNumEl.textContent = `${curSum}/${reqSum}`;
    // B-6：满法力时标记区分"能放"与"沉默放不出"（样式在 CSS，文字在这里切）
    const silenced = this.el.classList.contains('silenced');
    this.castFlagEl.textContent = silenced ? '×' : '!';
    const stateLine = full
      ? silenced
        ? '<div class="gt" style="color:#b79ad6">沉默中 · 放不出技能</div>'
        : '<div class="gt" style="color:#ffe6a8">法力已满 · 短按释放</div>'
      : `<div class="gt" style="color:#a89974">还差 ${Math.max(0, reqSum - curSum)} 点</div>`;
    this.tipEl.innerHTML = `<div class="gt" style="color:#e8c879">法力 ${curSum}/${reqSum}</div>${stateLine}${rows}`;
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

  /**
   * 名字一次性浮现（B-1 移动横屏降级路径）：紧凑卡不常驻名字条，
   * 首回合浮现 0.8s 让玩家至少认一次脸，之后靠长按详情。
   * 非紧凑卡（名字常驻）本方法是空操作。
   */
  flashName(ms = 800): void {
    if (!this.el.classList.contains('name-compact')) return;
    this.flashEl.animate(
      [
        { opacity: 0, transform: 'translateY(4px)' },
        { opacity: 1, transform: 'translateY(0)', offset: 0.18 },
        { opacity: 1, transform: 'translateY(0)', offset: 0.82 },
        { opacity: 0, transform: 'translateY(-4px)' },
      ],
      { duration: ms, easing: 'ease-out' },
    );
  }

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
    const rawKey = statusId.toLowerCase().replace(/_/g, '-');
    const key = rawKey === 'wolf-form' || rawKey === 'lycanthropy' ? 'wolf' : rawKey;
    const supported = new Set([
      'death-mark', 'curse', 'disease', 'mana-burn', 'charm', 'rage', 'wolf',
      // UX 审查 P1#5 + 状态核对批：织网此前零演出；下列状态同样只有徽记无持续层
      'web', 'bleed', 'barrier', 'submerged', 'marked', 'faerie-fire', 'terror',
    ]);
    if (!supported.has(key)) return;
    this.el.classList.toggle(`status-accent-${key}`, on);
  }

  clearStatusAccents(): void {
    for (const key of [
      'death-mark', 'curse', 'disease', 'mana-burn', 'charm', 'rage', 'wolf',
      'web', 'bleed', 'barrier', 'submerged', 'marked', 'faerie-fire', 'terror',
    ]) {
      this.el.classList.remove(`status-accent-${key}`);
    }
  }

  /**
   * 绑定短按/长按：单次只跟踪一个 pointer。移动超过 10px、离开卡面、
   * pointercancel 或丢失 capture 都只取消，不得在抬起时误触短按。
   */
  bindPress(onShort?: () => void, onLong?: () => void): void {
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
      if (onLong) {
        // B-5：按压期画一圈 475ms 铺开的进度环——短按/长按只差 475ms，
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
      }
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== activePointerId) return;
      const rect = this.el.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right
        && e.clientY >= rect.top && e.clientY <= rect.bottom;
      const shouldShort = !longFired && !movedOrCancelled && inside;
      reset(!inside);
      if (shouldShort) onShort?.();
    };
    const onPointerCancel = (e: PointerEvent) => {
      if (e.pointerId === activePointerId) reset(true);
    };

    this.el.addEventListener('pointerdown', onPointerDown);
    this.el.addEventListener('pointermove', onPointerMove);
    this.el.addEventListener('pointerup', onPointerUp);
    this.el.addEventListener('pointercancel', onPointerCancel);
    this.el.addEventListener('lostpointercapture', onPointerCancel);
    this.cancelPress = () => reset(true);

    this.pressCleanup = () => {
      reset(true);
      this.el.removeEventListener('pointerdown', onPointerDown);
      this.el.removeEventListener('pointermove', onPointerMove);
      this.el.removeEventListener('pointerup', onPointerUp);
      this.el.removeEventListener('pointercancel', onPointerCancel);
      this.el.removeEventListener('lostpointercapture', onPointerCancel);
      this.cancelPress = null;
      this.pressCleanup = null;
    };
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    this.el.style.pointerEvents = enabled ? 'auto' : 'none';
    if (!enabled) this.cancelPress?.();
  }

  destroy(): void {
    this.pressCleanup?.();
    this.eventController.abort();
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
  floatText(text: string, color: string): void {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText =
      `position:absolute;left:50%;top:34%;z-index:12;pointer-events:none;transform:translateX(-50%);` +
      `font-family:"Playfair Display",Georgia,serif;font-weight:800;font-size:${ofs(22)}px;` +
      `color:${color};text-shadow:0 1px 3px rgba(0,0,0,.95),0 0 6px ${color}`;
    this.el.appendChild(el);
    el.animate(
      [
        { opacity: 0, transform: 'translateX(-50%) translateY(6px) scale(.8)' },
        { opacity: 1, transform: 'translateX(-50%) translateY(-14px) scale(1.1)', offset: 0.4 },
        { opacity: 0, transform: 'translateX(-50%) translateY(-40px) scale(1)' },
      ],
      { duration: 780, easing: 'cubic-bezier(.2,.8,.25,1)' },
    ).onfinish = () => el.remove();
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
      }, cfg.hitStop); // hit-stop 卡肉停顿
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
  private shortPress?: (charId: number) => void;
  private longPress?: (charId: number) => void;
  private statusList?: (charId: number) => void;
  private leftAnchor = 0;
  private rightAnchor = 0;
  private mounted = false;
  private inputEnabled = true;

  constructor(
    team: Team,
    side: PlayerSide,
    opts?: {
      portraits?: Record<number, string>;
      /** @deprecated Use onShortPress. */
      onCardClick?: (charId: number) => void;
      onShortPress?: (charId: number) => void;
      onLongPress?: (charId: number) => void;
      /** B-7 折叠态点 +N：一次看全部状态（缺省沿用 onLongPress，即详情面板） */
      onStatusList?: (charId: number) => void;
    },
  ) {
    ensureStyles();
    this.side = side;
    this.shortPress = opts?.onShortPress ?? opts?.onCardClick;
    this.longPress = opts?.onLongPress;
    this.statusList = opts?.onStatusList ?? opts?.onLongPress;
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
    // B-7 折叠态入口与按压手势独立：即使没有按压回调也要能点开状态列表
    card.setStatusListHandler(this.statusList ? () => this.statusList!(charId) : null);
    if (!this.shortPress && !this.longPress) return;
    card.el.style.pointerEvents = 'auto';
    card.el.style.cursor = 'pointer';
    card.bindPress(
      this.shortPress ? () => this.shortPress!(charId) : undefined,
      this.longPress ? () => this.longPress!(charId) : undefined,
    );
    card.setInputEnabled(this.inputEnabled);
  }

  private layoutMetrics(): { slots: 3 | 4; width: number; height: number } {
    const slots: 3 | 4 = this.cards.size >= 4 ? 4 : 3;
    const scale = BOARD_PX / 512;
    return {
      slots,
      width: Math.round((slots === 4 ? 132 : 142) * scale),
      height: Math.floor((BOARD_PX - (slots - 1) * CARD_GAP) / slots),
    };
  }

  /** Switch between the three-card and four-card layouts without rebuilding the column. */
  private applyLayout(): void {
    const metrics = this.layoutMetrics();
    this.el.style.width = `${metrics.width}px`;
    for (const card of this.cards.values()) card.resize(metrics.width, metrics.height);
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
    this.el.classList.toggle('active-ally', active && this.side === PlayerSide.Left);
    this.el.classList.toggle('active-enemy', active && this.side === PlayerSide.Right);
  }

  mount(parent: HTMLElement, left: number, top: number): void {
    const width = this.layoutMetrics().width;
    this.leftAnchor = left;
    this.rightAnchor = left + width;
    this.mounted = true;
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    parent.appendChild(this.el);
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
    this.el.appendChild(card.el);
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

  /** Remove a defeated card from flow so survivors reflow and queued replacements append last. */
  removeCharacterCard(charId: number): boolean {
    const card = this.cards.get(charId);
    if (!card) return false;
    const top = card.el.offsetTop;
    const left = card.el.offsetLeft;
    const width = card.el.offsetWidth;
    const height = card.el.offsetHeight;
    this.cards.delete(charId);
    card.destroy();

    card.el.style.position = 'absolute';
    card.el.style.left = `${left}px`;
    card.el.style.top = `${top}px`;
    card.el.style.width = `${width}px`;
    card.el.style.height = `${height}px`;
    card.el.style.zIndex = '24';
    card.el.style.pointerEvents = 'none';
    this.applyLayout();

    const departure = card.el.animate(
      [
        { opacity: 1, transform: 'scale(1)', filter: 'brightness(1)' },
        { opacity: 0, transform: 'scale(.72)', filter: 'brightness(.45) grayscale(.7)' },
      ],
      { duration: AnimConfig.defeat.cardExitDuration, easing: 'cubic-bezier(.4,0,.8,.3)', fill: 'forwards' },
    );
    departure.onfinish = () => card.el.remove();
    return true;
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
