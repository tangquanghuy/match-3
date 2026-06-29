import { BaseColor, PlayerSide } from '@engine/types';
import type { Character, Team } from '@engine/types';
import { AnimConfig } from './AnimationConfig';

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

const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
  .gcol{position:absolute;display:flex;flex-direction:column;gap:${CARD_GAP}px;pointer-events:none}
  /* 回合高亮：仅在整列外围加一圈描边光边，行动方才显示；非行动方保持正常（不压暗，避免与阵亡混淆） */
  .gcol .turn-frame{position:absolute;inset:-7px;border-radius:14px;pointer-events:none;
    border:2px solid transparent;opacity:0;transition:opacity .35s ease}
  .gcol.active-ally .turn-frame{opacity:1;border-color:rgba(126,200,236,.9);
    box-shadow:0 0 9px rgba(126,200,236,.55),inset 0 0 8px rgba(126,200,236,.25);animation:frameBreath 1.8s ease-in-out infinite}
  .gcol.active-enemy .turn-frame{opacity:1;border-color:rgba(224,121,111,.9);
    box-shadow:0 0 9px rgba(224,121,111,.55),inset 0 0 8px rgba(224,121,111,.25);animation:frameBreath 1.8s ease-in-out infinite}
  @keyframes frameBreath{0%,100%{opacity:.7}50%{opacity:1}}
  .gcard{position:relative;width:${CARD_W}px;height:${CARD_H}px;isolation:isolate;
    border-radius:8px;background:#0b0a09;border:1px solid rgba(216,194,144,.34);
    font-family:"Oswald","PingFang SC","Microsoft YaHei",sans-serif;transition:opacity .25s}
  .gcard.castable{border-color:#c9a35c;box-shadow:0 0 0 1px rgba(201,163,92,.5)}
  .gcard.defeated{opacity:.32;filter:grayscale(.6)}

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

  .gcard .ov{position:absolute;z-index:4}
  .gcard .c-tl{top:8px;left:9px;right:14px}
  .gcard .c-bl{left:9px;bottom:8px}
  .gcard .c-br{right:9px;bottom:8px;text-align:right}

  .gcard .name{display:none}
  .gcard .name-rule{display:none}

  /* 法力：右上仅显示当前充能值（颜色需求交给底部宝石），暖金，满充提亮 */
  .gcard .mana{display:flex;flex-direction:column;align-items:flex-end}
  .gcard .mana-num{font-family:"Oswald",sans-serif;font-weight:600;letter-spacing:.04em;font-size:12px;
    color:#d8c290;font-variant-numeric:tabular-nums;text-shadow:0 1px 3px rgba(0,0,0,.9)}
  .gcard.mana-full .mana-num{color:#fff3d2;text-shadow:0 1px 3px rgba(0,0,0,.9),0 0 6px rgba(232,200,121,.6)}

  /* 法力宝石：贴着卡片左上角、嵌进边框的"书签式"角标（与立绘卡同源的边框语言）。
     外侧两角与卡片圆角对齐(左上=卡圆角)，仅内侧(右下)收大圆角，像长在边框上而非浮在画面里。 */
  .gcard .gem{position:absolute;top:0;left:0;z-index:6;
    width:30px;height:30px;padding:4px;box-sizing:border-box;cursor:pointer;
    background:linear-gradient(135deg,rgba(20,18,15,.92),rgba(11,10,9,.82));
    border:1px solid rgba(216,194,144,.4);border-top-color:rgba(216,194,144,.5);
    border-left-color:rgba(216,194,144,.5);
    border-radius:8px 0 12px 0;
    box-shadow:1px 1px 4px rgba(0,0,0,.5)}
  .gcard .gem svg{display:block;width:100%;height:100%;overflow:visible;
    filter:drop-shadow(0 1px 2px rgba(0,0,0,.85))}
  .gcard .gem .seat{fill:rgba(11,10,9,.25)}             /* 极浅底，仅作轻微衬托 */
  .gcard .gem .dim{opacity:.72}                          /* 未充能：淡，但保留可辨识的颜色 */
  .gcard .gem .facets{fill:none;stroke:rgba(255,255,255,.22);stroke-width:5}
  .gcard .gem .lit{opacity:1} /* 充能层：满饱和原色，与淡色未充能拉开 */
  /* 满充：书签描边转暖金 + 内部宝石发光（书签本体不缩放，避免脱离边角） */
  .gcard.mana-full .gem{border-color:#c9a35c;border-top-color:#d8b86a;border-left-color:#d8b86a;
    box-shadow:1px 1px 4px rgba(0,0,0,.5),0 0 7px rgba(232,200,121,.45)}
  .gcard.mana-full .gem svg{filter:drop-shadow(0 0 4px rgba(232,200,121,.9));
    animation:gemBreath 1.4s ease-in-out infinite}
  @keyframes gemBreath{
    0%,100%{transform:scale(1)}
    50%{transform:scale(1.12)}
  }

  /* 法力进度浮窗：跟随书签显示在其下方 */
  .gcard .gem-tip{position:absolute;top:34px;left:2px;
    z-index:9;display:none;white-space:nowrap;padding:3px 7px;border-radius:5px;
    background:rgba(11,10,9,.92);border:1px solid rgba(216,194,144,.45);
    font-family:"Oswald",sans-serif;font-size:10px;letter-spacing:.04em;color:#f0e2bf;
    box-shadow:0 2px 8px rgba(0,0,0,.7)}
  .gcard .gem-tip .gt{display:flex;align-items:center;gap:4px;line-height:1.5}
  .gcard .gem-tip .dot{width:7px;height:7px;transform:rotate(45deg);border-radius:1px}
  .gcard .gem.show-tip ~ .gem-tip,.gcard .gem:hover ~ .gem-tip{display:block}

  /* 攻防：填充图标 + 衬线数字（数字作主体，图标与数字底部对齐并略下沉） */
  .gcard .stat{display:flex;align-items:flex-end;gap:5px;flex-direction:row-reverse}
  .gcard .stat .ic{flex:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,.8));transform:translateY(2px)}
  .gcard .stat .v{font-family:"Playfair Display",Georgia,serif;font-weight:800;line-height:1;font-size:18px;
    letter-spacing:-.01em;color:#f6efe0;text-shadow:0 1px 2px rgba(0,0,0,.95),0 0 4px rgba(0,0,0,.55)}

  /* 护甲：并入血量行，紧贴血量左侧，纯暖金数字 + 小盾 */
  .gcard .armor{display:inline-flex;align-items:center;gap:2px;margin-right:5px}
  .gcard .armor .v{font-family:"Oswald",sans-serif;font-weight:600;font-size:11px;color:#d8c290;text-shadow:0 1px 3px rgba(0,0,0,.9)}
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
  private tipEl!: HTMLElement;     // 法力进度浮窗
  private gemColors: BaseColor[] = [];

  constructor(char: Character, side: PlayerSide, opts?: { portrait?: string; variant?: string }) {
    ensureStyles();
    this.charId = char.id;
    this.char = char;

    const skin = char.colors[0] !== undefined ? SKIN_CLASS[char.colors[0]] : 'skin-steel';
    const variant = opts?.variant ?? '';
    const hasPhoto = !!opts?.portrait;
    // 敌方（右侧队伍）：法力宝石镜像反转并移到左上角，与我方左右呼应
    const sideClass = side === PlayerSide.Right ? 'enemy' : 'ally';
    const reqColors = Object.keys(char.manaRequirement) as BaseColor[];
    const gemColors = reqColors.length > 0 ? reqColors : char.colors;

    const el = document.createElement('div');
    el.className = `gcard ${skin} ${variant} ${sideClass} ${hasPhoto ? 'has-photo' : ''}`.trim();
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
      <div class="ov c-tl">
        <div class="name"></div>
        <div class="name-rule"></div>
      </div>
      <div class="ov c-bl">
        <div class="stat">${SWORD_SVG}<span class="v atk">0</span></div>
      </div>
      <div class="ov c-br"></div>
      <div class="gem" tabindex="0" role="button" aria-label="法力">${gemSvg(gemColors)}</div>
      <div class="gem-tip"></div>
    `;
    this.el = el;
    this.nameEl = el.querySelector('.name')!;
    this.atkEl = el.querySelector('.atk')!;
    this.brEl = el.querySelector('.c-br')!;
    this.gemEl = el.querySelector('.gem')!;
    this.riseEl = el.querySelector('.rise')!;
    this.tipEl = el.querySelector('.gem-tip')!;
    this.gemColors = gemColors;

    // 点击/触摸切换法力进度浮窗（移动端友好），桌面端 hover 由 CSS 处理
    this.gemEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.gemEl.classList.toggle('show-tip');
    });

    this.nameEl.textContent = char.name;

    this.refresh();
  }

  refresh(): void {
    const c = this.char;

    this.atkEl.textContent = String(c.attack);

    // 右下：护甲（可选，并入同一行，紧贴血量左侧）+ 血量
    const armorBlock =
      c.armor > 0
        ? `<span class="armor">${SHIELD_SVG}<span class="v">${c.armor}</span></span>`
        : '';
    this.brEl.innerHTML = `<div class="stat">${HEART_SVG}<span class="v hp">${Math.max(0, c.hp)}</span>${armorBlock}</div>`;

    // 法力：底部上涨液面表进度 + 浮窗显示分色明细
    const reqColors = Object.keys(c.manaRequirement) as BaseColor[];
    let curSum = 0;
    let reqSum = 0;
    for (const col of reqColors) {
      reqSum += c.manaRequirement[col] ?? 0;
      curSum += Math.min(c.manaPool[col] ?? 0, c.manaRequirement[col] ?? 0);
    }
    const ratio = reqSum > 0 ? Math.min(1, curSum / reqSum) : 0;
    // rise 矩形从底部(512)向上长出 ratio*512；用 rAF 插值（SVG 几何属性 CSS transition 不可靠）
    const newH = Math.round(ratio * 512);
    const prevH = Number(this.riseEl.getAttribute('height') ?? '0');
    if (newH !== prevH) this.animateRise(prevH, newH);
    const full = reqSum > 0 && curSum >= reqSum;
    this.el.classList.toggle('mana-full', full);

    // 浮窗：总进度 + 每色当前/需求（按宝石分色配色）
    const rows = this.gemColors
      .map((col) => {
        const need = c.manaRequirement[col] ?? 0;
        const cur = Math.min(c.manaPool[col] ?? 0, need);
        return `<div class="gt"><span class="dot" style="background:${COLOR_HEX[col]}"></span>${cur}/${need}</div>`;
      })
      .join('');
    this.tipEl.innerHTML = `<div class="gt" style="color:#e8c879">法力 ${curSum}/${reqSum}</div>${rows}`;

    this.el.classList.toggle('defeated', c.defeated);
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

  pulseManaReady(): void {
    this.el.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }],
      { duration: 280, easing: 'ease-in-out' },
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
    el.style.zIndex = '20';

    // 阶段 1：直接匀速冲过去（干脆利落，无缓动）
    const dash = el.animate(
      [
        { transform: 'translateX(0) scale(1)' },
        { transform: `translateX(${dx}px) scale(${cfg.lungeScale})` },
      ],
      { duration: cfg.dashDuration, easing: 'linear', fill: 'forwards' },
    );
    dash.onfinish = () => {
      // 命中瞬间：定格强调——瞬时再放大一点并锁住，制造“顿”的卡肉
      el.style.transform = `translateX(${dx}px) scale(${cfg.hitPunchScale})`;
      // 触发音效/震屏/受击
      onHit?.();
      window.setTimeout(() => {
        // 阶段 2：平滑归位（缓出，不向后拉、不过冲）
        const back = el.animate(
          [
            { transform: `translateX(${dx}px) scale(${cfg.hitPunchScale})` },
            { transform: 'translateX(0) scale(1)' },
          ],
          { duration: cfg.returnDuration, easing: 'ease-out', fill: 'forwards' },
        );
        back.onfinish = () => {
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

  constructor(team: Team, side: PlayerSide, opts?: { portraits?: Record<number, string> }) {
    ensureStyles();
    this.side = side;
    this.el = document.createElement('div');
    this.el.className = 'gcol';
    const frame = document.createElement('div');
    frame.className = 'turn-frame';
    this.el.appendChild(frame);
    team.characters.forEach((ch, i) => {
      const card = new CharacterCard(ch, side, {
        portrait: opts?.portraits?.[ch.id],
        variant: VARIANTS[i % VARIANTS.length],
      });
      this.el.appendChild(card.el);
      this.cards.set(ch.id, card);
    });
  }

  /** 设置回合高亮：行动方整列外围描边光边；非行动方正常显示（不压暗） */
  setTurnActive(active: boolean): void {
    this.el.classList.toggle('active-ally', active && this.side === PlayerSide.Left);
    this.el.classList.toggle('active-enemy', active && this.side === PlayerSide.Right);
  }

  /** 挂到 DOM 覆盖层，并按画布坐标定位 */
  mount(parent: HTMLElement, left: number, top: number): void {
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
    parent.appendChild(this.el);
  }

  getCard(charId: number): CharacterCard | undefined {
    return this.cards.get(charId);
  }

  refreshAll(): void {
    for (const card of this.cards.values()) card.refresh();
  }

  static totalHeight(): number {
    return TEAM_SIZE * CARD_H + (TEAM_SIZE - 1) * CARD_GAP;
  }
}
