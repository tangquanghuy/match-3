import { isCoupletSpell, spellTitleText } from '../data/spellPresentation';
/**
 * 部队详情窗（战斗内，非模态）——三张图鉴样式的卡叠成一摞。
 *
 * 点任意战斗卡打开：三张同尺寸的卡扇形叠放，当前页居中突出，两侧多露出一些便于点击切换。
 * 点两侧卡片可换到最前（与原当前页交换位置），再点空白处 / Esc / ✕ 关闭。
 *   - 立绘卡（默认当前页）：图鉴部队卡同款，左上法力「当前/上限」、右上魔力、名字与种族 · 王国、
 *     攻击·护甲·生命一行，底部一排状态图标（悬停看说明）；
 *   - 技能卡：图鉴法术卷轴（暗色抬头 + 羊皮纸正文，按当前魔力求值、附目标说明）；
 *   - 特质卡：图鉴「天赋特质」3 个槽位，已解锁 / 未解锁 / 未开槽与图鉴一致。
 * 我方卡摞下是图鉴主按钮「释放技能」与「快速释放」复选框；敌方只列法力。
 *
 * 卡扇覆盖棋盘与部分队伍立绘，未遮挡的队伍卡仍可点击切换角色。挂在战斗 wrapper 内
 * 随舞台缩放；不暂停战斗，数值跟随卡面显示值实时刷新（App 轮询）。图鉴 meta 样式不在独立战斗页加载，
 * 这里用 `usw-` 前缀按图鉴规则复刻。
 */
import type { BaseColor } from '@engine/types';
import { renderSpell, applyTermMarkup } from '../meta/shell/spellText';
import { bindTermTips } from '../meta/shell/termTip';
import { STATUS_DESCRIPTIONS } from '../data/statusDescriptions';
import { statusBadge, statusBadgeIcon } from './statusBadges';
import { isPositiveStatus, statusBadgeCorner, statusLiveLines } from './statusPresentation';
import { statusRecoveryChance } from '@engine/skills/effects/status';
import type { StatusInstance } from '@engine/types';
import { traitCardGlyphs } from './traitBadges';
import { CARD_STAT_ICONS, manaGemSvg } from './TeamView';
import type { CardShownStats } from './TeamView';
import type { TraitSlot } from './CharacterDetailPanel';

/** 施放按钮的状态（优先级见 resolveCastAvailability） */
export type CastKind = 'ready' | 'short' | 'silenced' | 'enemyTurn' | 'resolving' | 'auto' | 'defeated' | 'used' | 'over';

export interface CastAvailability {
  kind: CastKind;
  /** kind='short' 时还差的法力 */
  short?: number;
}

export interface CastAvailabilityInput {
  /** 自动战斗接管中（App.autoBattleEnabled） */
  autoBattle: boolean;
  defeated: boolean;
  /** 对局已结束 */
  over: boolean;
  /** 当前行动方不是我方 */
  enemyTurn: boolean;
  /** 我方回合但正在演出/结算/施法流程中/开局演出/暂停 */
  busy: boolean;
  mana: number;
  manaCost: number;
  silenced: boolean;
  /** 本场限用一次且已用过 */
  usedOnce: boolean;
}

/**
 * 施放按钮状态裁决（纯函数）。优先级：自动战斗 > 阵亡 > 对局结束 > 对手回合 >
 * 法力不足 > 沉默 > 限用已用 > 结算中 > 可释放。法力不足排在「结算中」之前：
 * 演出期间法力随法力流上涨，玩家看到的是「还差 N 点」在减少，而不是一直「结算中」。
 */
export function resolveCastAvailability(input: CastAvailabilityInput): CastAvailability {
  if (input.autoBattle) return { kind: 'auto' };
  if (input.defeated) return { kind: 'defeated' };
  if (input.over) return { kind: 'over' };
  if (input.enemyTurn) return { kind: 'enemyTurn' };
  // 与引擎 ManaDistributor.isSkillCastable 同口径：mana >= manaCost
  const short = Math.max(0, input.manaCost - input.mana);
  if (short > 0) return { kind: 'short', short };
  if (input.silenced) return { kind: 'silenced' };
  if (input.usedOnce) return { kind: 'used' };
  if (input.busy) return { kind: 'resolving' };
  return { kind: 'ready' };
}

export function castButtonLabel(a: CastAvailability): string {
  switch (a.kind) {
    case 'ready': return '释放技能';
    case 'short': return `还差 ${Math.ceil(a.short ?? 1)} 点法力`;
    case 'silenced': return '沉默中';
    case 'enemyTurn': return '对手回合';
    case 'resolving': return '结算中';
    case 'auto': return '自动战斗中';
    case 'defeated': return '已阵亡';
    case 'used': return '本场已施放';
    case 'over': return '战斗已结束';
  }
}

/** 详情窗一次渲染所需的全部数据（由 App 组装；数值取自卡面显示值） */
export interface UnitSheetData {
  charId: number;
  ally: boolean;
  name: string;
  portrait: string;
  colors: BaseColor[];
  shown: CardShownStats;
  /** 定位（中文，如「坦克」）；空串不显示 */
  role?: string;
  /** 种族 · 王国 · 稀有度；空串则不显示 */
  typeLine: string;
  /** 种族（中文）；空串不显示 */
  race: string;
  /** 王国；空串不显示 */
  kingdom: string;
  /** 稀有度名；空串不显示 */
  rarityLabel: string;
  /** 稀有度档位 0..5；未知为 null（金色默认边框） */
  rarity: number | null;
  rarityColor: string | null;
  skillName: string;
  /** 技能全文（含 `[魔法+N]` 占位，按 shown.magic 求值） */
  skillDescription: string;
  /** 技能块的小标签（王国 · 部队法术 / 技能） */
  skillTag: string;
  /** 目标说明（「目标：全体敌人」「释放后点选 1 名敌人」）；空串不显示 */
  targetNote: string;
  /** 图鉴同款 3 个特质槽 */
  traitSlots: TraitSlot[];
  traitNames?: Record<string, string>;
  /** 我方：施放按钮状态 */
  cast?: CastAvailability;
  /** 我方：快速释放偏好（battle.skipCastConfirm） */
  quickCast: boolean;
}

export interface UnitSheetBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface UnitSheetHandlers {
  onCast(charId: number): void;
  onQuickCast(enabled: boolean): void;
  onClose(): void;
}

/** 卡摞里的三页 */
export type SheetPane = 'spell' | 'portrait' | 'traits';
/** 三个叠放位：中间 = 当前页（最上层），左右 = 露出一截 */
export type PanePos = 'left' | 'center' | 'right';

/** 初始排布：技能在左、立绘居中、特质在右 */
export const DEFAULT_PANE_POS: Readonly<Record<SheetPane, PanePos>> = { spell: 'left', portrait: 'center', traits: 'right' };

/**
 * 点露出的那张 → 它与当前页交换位置（纯函数）。点当前页本身不变。
 * 返回新排布（不修改入参）。
 */
export function bringPaneToFront(layout: Readonly<Record<SheetPane, PanePos>>, pane: SheetPane): Record<SheetPane, PanePos> {
  const next = { ...layout };
  const from = next[pane];
  if (from === 'center') return next;
  const current = (Object.keys(next) as SheetPane[]).find((p) => next[p] === 'center');
  next[pane] = 'center';
  if (current) next[current] = from;
  return next;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 状态实时数值行（出血层数与每回合伤害 / 仍倒计时的剩余回合 / 累积自愈几率）。
 * 口径与战斗卡徽记同源（statusPresentation），不再直接把 magnitude 当「每回合伤害」——
 * 出血的 magnitude 是层数，中毒/燃烧的 magnitude 是历史遗留数据，引擎并不使用。
 */
export function statusLiveLine(s: { id: string; turns: number; magnitude?: number }, recoveryChance: number | null = null): string {
  return statusLiveLines(s, recoveryChance).join(' · ');
}

/** 图鉴字体栈（troop.css 的 --display / --body） */
const DISPLAY = '"Palatino Linotype","STZhongsong","SimSun",serif';
const BODY = '"Segoe UI","Microsoft YaHei",sans-serif';
const NOISE = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' seed='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 .42  0 0 0 0 .34  0 0 0 0 .22  0 0 0 .22 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

/** 图鉴立绘卡底部的金色饰件（与战斗卡同一轮廓） */
const ORNAMENT_SVG = `<svg viewBox="0 0 72 24" aria-hidden="true"><defs><linearGradient id="uswOrn" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8f6c37"/><stop offset=".48" stop-color="#f0d99c"/><stop offset="1" stop-color="#9d763e"/></linearGradient></defs><path class="orn-dark" d="M1 12h14l10-7 8 5 3-8 3 8 8-5 10 7h14-14l-9 5-9-2-3 7-3-7-9 2-9-5H1z"/><path class="orn-gold" d="M1 12h14l10-7 8 5 3-8 3 8 8-5 10 7h14M10 14h14l9-3m29 3H48l-9-3"/><path class="orn-core" d="M36 5l5 7-5 7-5-7z"/></svg>`;

/** 图鉴特质行尾的锁 / 勾 */
const LOCK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>';
const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * 外层、卡摞（三张同尺寸的卡叠放：data-pos=center 在最上层居中，left/right 缩小、压暗、从两侧露出 --sp），
 * 立绘卡（图鉴 .character-card）与卡摞下的按钮。尺寸按图鉴 354px 宽的立绘卡等比换算到 --cw。
 */
const CSS_STACK = `
  .usw{position:absolute;z-index:1100;box-sizing:border-box;display:none;flex-direction:column;align-items:center;justify-content:center;
    --pad:16px;--gap:10px;--cw:294px;--ch:441px;--sp:120px;--bh:44px;--chk:26px;--close:32px;
    gap:var(--gap);padding:calc(var(--pad) + var(--close)) var(--pad) var(--pad);border-radius:10px;color:#f2ead8;font-family:${BODY};
    pointer-events:none;background:radial-gradient(ellipse 65% 70% at 50% 48%,rgba(14,14,24,.75),rgba(8,9,16,.18))}
  .usw-close,.usw-actions{pointer-events:auto}
  .usw.open{display:flex}
  .usw *{box-sizing:border-box}
  .usw [hidden]{display:none !important}
  .usw-close{position:absolute;top:calc(var(--pad) * .5);right:calc(var(--pad) * .5);z-index:9;width:var(--close);height:var(--close);
    padding:0;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;border-radius:50%;
    color:#d8c191;border:1px solid #8e7347;background:linear-gradient(#302838,#1b1823);box-shadow:inset 0 1px #f0dab71f,0 3px 8px #0006;
    font:max(12px,calc(var(--close) * .42))/1 ${BODY}}
  .usw-close:hover{filter:brightness(1.17)}
  .usw-close:focus-visible,.usw-cast:focus-visible,.usw-quick input:focus-visible,.usw-pane:focus-visible,.usw-pane-body:focus-visible{
    outline:2px solid #a6dff9;outline-offset:3px}

  .usw-stack{position:relative;flex:none;width:calc(var(--cw) + var(--sp) * 2);height:var(--fan-h);max-width:100%;pointer-events:none}
  .usw-pane{position:absolute;left:50%;top:calc(var(--cw) * .04);width:var(--cw);height:var(--ch);pointer-events:auto;margin-left:calc(var(--cw) * -.5);
    transform-origin:50% 50%;transition:transform .32s cubic-bezier(.2,.8,.25,1),filter .32s ease;will-change:transform}
  .usw-pane[data-pos="center"]{z-index:3;transform:none;filter:none}
  .usw-pane[data-pos="left"]{z-index:1;transform:translateX(calc(var(--sp) * -1)) translateY(calc(var(--cw) * .025)) scale(.94) rotate(-6deg);filter:brightness(.78);cursor:pointer}
  .usw-pane[data-pos="right"]{z-index:2;transform:translateX(var(--sp)) translateY(calc(var(--cw) * .025)) scale(.94) rotate(6deg);filter:brightness(.78);cursor:pointer}
  .usw-pane:not([data-pos="center"]):hover{filter:brightness(.94)}
  .usw-pane:not([data-pos="center"]) *{pointer-events:none}
  .usw-pane:not([data-pos="center"]) .usw-pane-body{overflow:hidden}

  /* —— 立绘卡（图鉴 .character-card）—— */
  .usw-card{position:absolute;inset:0;border-radius:11px;overflow:hidden;isolation:isolate;background:#101019;
    border:1px solid rgba(38,31,22,.96);box-shadow:0 0 0 1px rgba(8,7,6,.72),0 16px 38px #0009}
  .usw-card[data-rc]{box-shadow:0 0 0 1px rgba(8,7,6,.72),0 0 0 2px color-mix(in srgb,var(--rc) 40%,transparent),0 16px 38px #0009}
  .usw-portrait{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 18%;display:block;border-radius:10px}
  .usw-card.no-art .usw-portrait{visibility:hidden}
  .usw-card.no-art{background:radial-gradient(120% 90% at 50% 20%,#3a3140 0%,#17141d 60%,#0d0b12 100%)}
  .usw-shade{position:absolute;inset:0;border-radius:10px;pointer-events:none;
    background:linear-gradient(180deg,#11101815 40%,#0b0b1355 58%,#0b0b13e6 79%,#0b0b13 93%)}
  .usw-frame{position:absolute;inset:0;z-index:5;border-radius:11px;pointer-events:none;padding:1px;
    background:linear-gradient(135deg,rgba(244,226,174,.76) 0%,rgba(151,121,69,.46) 34%,rgba(224,197,132,.7) 68%,rgba(119,92,51,.5) 100%);
    -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
  .usw-card::after{content:"";position:absolute;inset:calc(var(--cw) * .02);z-index:5;border-radius:8px;pointer-events:none;opacity:.55;
    --cl:calc(var(--cw) * .08);
    background:
      linear-gradient(90deg,rgba(239,217,158,.82),transparent) left top/var(--cl) 1px no-repeat,
      linear-gradient(180deg,rgba(239,217,158,.82),transparent) left top/1px var(--cl) no-repeat,
      linear-gradient(270deg,rgba(239,217,158,.82),transparent) right top/var(--cl) 1px no-repeat,
      linear-gradient(180deg,rgba(239,217,158,.82),transparent) right top/1px var(--cl) no-repeat,
      linear-gradient(90deg,rgba(239,217,158,.7),transparent) left bottom/var(--cl) 1px no-repeat,
      linear-gradient(0deg,rgba(239,217,158,.7),transparent) left bottom/1px var(--cl) no-repeat,
      linear-gradient(270deg,rgba(239,217,158,.7),transparent) right bottom/var(--cl) 1px no-repeat,
      linear-gradient(0deg,rgba(239,217,158,.7),transparent) right bottom/1px var(--cl) no-repeat}
  .usw-card.defeated .usw-portrait{filter:grayscale(.85) brightness(.5)}

  .usw-gem{position:absolute;top:0;left:0;z-index:6;width:calc(var(--cw) * .18);height:calc(var(--cw) * .18);padding:calc(var(--cw) * .022);
    background:linear-gradient(135deg,rgba(20,18,15,.92),rgba(11,10,9,.82));border:1px solid rgba(216,194,144,.4);
    border-top-color:rgba(216,194,144,.5);border-left-color:rgba(216,194,144,.5);border-radius:11px 0 14px 0;box-shadow:1px 1px 4px rgba(0,0,0,.5)}
  .usw-gem::before{content:"";position:absolute;left:100%;top:-1px;width:calc(var(--cw) * .05);height:1px;
    background:linear-gradient(90deg,rgba(225,202,145,.72),transparent)}
  .usw-gem::after{content:"";position:absolute;left:-1px;top:100%;width:1px;height:calc(var(--cw) * .05);
    background:linear-gradient(180deg,rgba(225,202,145,.72),transparent)}
  .usw-gem svg{display:block;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 1px 2px rgba(0,0,0,.85))}
  .usw svg .seat{fill:rgba(11,10,9,.25)}
  .usw svg .dim{opacity:.72}
  .usw svg .facets{fill:none;stroke:rgba(255,255,255,.22);stroke-width:5}
  .usw-gem-mana{position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;white-space:nowrap;pointer-events:none;
    font:800 max(11px,calc(var(--cw) * .072))/1 "Playfair Display",Georgia,serif;font-variant-numeric:tabular-nums;letter-spacing:-.03em;color:#f3ead6;
    text-shadow:1px 0 0 rgba(10,8,6,.92),-1px 0 0 rgba(10,8,6,.92),0 1px 0 rgba(10,8,6,.92),0 -1px 0 rgba(10,8,6,.92),0 1px 3px rgba(0,0,0,.9)}
  .usw-gem-mana small{font-size:.72em;font-weight:700;opacity:.86;margin-left:.04em}
  .usw-card.full .usw-gem{border-color:#c9a35c;box-shadow:1px 1px 4px rgba(0,0,0,.5),0 0 7px rgba(232,200,121,.45)}
  .usw-card.full .usw-gem svg{filter:drop-shadow(0 0 4px rgba(232,200,121,.9))}
  .usw-card.full .usw-gem-mana{color:#ffe6a8}

  .usw-magic{position:absolute;top:0;right:0;z-index:6;display:flex;align-items:center;gap:calc(var(--cw) * .017);
    height:calc(var(--cw) * .1);padding:0 calc(var(--cw) * .034) 0 calc(var(--cw) * .028);
    background:linear-gradient(225deg,rgba(38,26,54,.94),rgba(16,11,22,.86));border:1px solid rgba(178,140,224,.42);
    border-top-color:rgba(200,166,240,.6);border-right-color:rgba(200,166,240,.6);border-radius:0 11px 0 14px;box-shadow:-1px 1px 4px rgba(0,0,0,.5)}
  .usw-magic svg{width:max(12px,calc(var(--cw) * .051));height:max(12px,calc(var(--cw) * .051));filter:drop-shadow(0 0 3px rgba(180,130,240,.7))}
  .usw-magic b{font:800 max(11px,calc(var(--cw) * .051))/1 Georgia,serif;color:#f1e9ff;text-shadow:0 1px 2px rgba(0,0,0,.95),0 0 5px rgba(150,100,210,.5)}

  .usw-name{position:absolute;z-index:6;left:0;right:0;bottom:calc(var(--ch) * .236);text-align:center;padding:0 6%}
  .usw-name h2{margin:calc(var(--cw) * .02) 0;color:#fff2d6;letter-spacing:.14em;text-indent:.14em;text-shadow:0 3px 7px #000;overflow-wrap:anywhere;
    font:max(15px,calc(var(--cw) * .1))/1.15 ${DISPLAY}}
  .usw-name span{display:block;color:#c1b9a9;font-size:max(11px,calc(var(--cw) * .031));letter-spacing:.3em;text-indent:.3em}
  .usw-stats{position:absolute;z-index:6;left:calc(var(--cw) * .068);right:calc(var(--cw) * .068);bottom:calc(var(--ch) * .109);
    display:flex;justify-content:space-around;padding:calc(var(--cw) * .031) 0;
    border-top:1px solid #b59c6266;border-bottom:1px solid #b59c6233;background:linear-gradient(90deg,transparent,#06070b77,transparent)}
  .usw-stats>div{display:flex;align-items:center;gap:calc(var(--cw) * .023)}
  .usw-stats svg{flex:none;width:max(12px,calc(var(--cw) * .062));height:max(12px,calc(var(--cw) * .068))}
  .usw-stats b{font:bold max(13px,calc(var(--cw) * .082))/1 Georgia,serif;font-variant-numeric:tabular-nums}
  .usw-stats b i{font-style:normal;font-weight:400;font-size:.5em;opacity:.7;margin-left:1px}
  .usw-stats .st-atk{color:#d6c397}.usw-stats .st-atk b{color:#fff1d4}
  .usw-stats .st-armor{color:#c5c8ce}.usw-stats .st-armor b{color:#e4e6ea}
  .usw-stats .st-hp{color:#c45454}.usw-stats .st-hp b{color:#e07070}

  /* 底部状态图标（原图鉴等级行的位置）：只放图标 + 剩余回合，悬停 title 看说明 */
  .usw-statusbar{position:absolute;z-index:6;left:calc(var(--cw) * .065);right:calc(var(--cw) * .065);bottom:calc(var(--ch) * .03);
    height:calc(var(--cw) * .1);display:flex;align-items:center;justify-content:center;gap:calc(var(--cw) * .025)}
  .usw-sb{position:relative;flex:none;width:calc(var(--cw) * .085);height:calc(var(--cw) * .085);min-width:18px;min-height:18px;
    display:grid;place-items:center;border-radius:50%;background:rgba(10,9,14,.78);
    border:1px solid color-mix(in srgb,var(--sc,#d8c290) 70%,transparent);box-shadow:0 0 5px color-mix(in srgb,var(--sc,#d8c290) 45%,transparent)}
  /* 增益/减益形状区分（不只靠颜色）：增益圆形留白更亮，减益切角方形 */
  .usw-sb-neg{border-radius:14%;clip-path:polygon(0 0,100% 0,100% 74%,74% 100%,0 100%)}
  .usw-sb-pos{border-width:2px}
  .usw-sb svg,.usw-sb img{width:74%;height:74%;object-fit:contain;display:block}
  .usw-sb .status-icon-fallback{font:700 max(10px,calc(var(--cw) * .036))/1 ${BODY};color:#e6e3dc}
  .usw-sb b{position:absolute;right:-4px;bottom:-4px;min-width:max(12px,calc(var(--cw) * .045));height:max(12px,calc(var(--cw) * .045));
    padding:0 2px;display:grid;place-items:center;border-radius:999px;background:#15121a;border:1px solid #8e7347;
    font:700 max(9px,calc(var(--cw) * .03))/1 Georgia,serif;color:#f2e4c9}
  .usw-ornament{position:absolute;z-index:8;left:50%;bottom:calc(var(--cw) * -.034);width:calc(var(--cw) * .305);height:calc(var(--cw) * .085);
    transform:translateX(-50%);pointer-events:none}
  .usw-ornament svg{display:block;width:100%;height:100%;overflow:visible}
  .usw-ornament .orn-dark{fill:#0b0b13}
  .usw-ornament .orn-gold{fill:none;stroke:url(#uswOrn);stroke-width:1.35;stroke-linecap:round;stroke-linejoin:round}
  .usw-ornament .orn-core{fill:#1a140c;stroke:url(#uswOrn);stroke-width:1.1}
`;

/**
 * 技能页 = 图鉴法术卷轴（.spell：暗色抬头 + 金边徽章 + 羊皮纸正文 + 底部公式线）；
 * 特质页 = 图鉴天赋特质（.trait-heading + 3 条 .trait，已解锁打勾、未解锁上锁并压暗）；
 * 卡摞下 = 图鉴主按钮（.primary）/ 禁用时次级按钮观感 / 复选框。
 */
const CSS_PANES = `
  .usw-page{position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden;border-radius:11px;
    border:1px solid #87714b;background:#11101a;box-shadow:0 0 0 1px rgba(8,7,6,.72),0 16px 38px #0009}
  .usw-pane-head{flex:none;display:flex;align-items:center;gap:calc(var(--cw) * .037);min-height:calc(var(--cw) * .2);
    padding:calc(var(--cw) * .025) calc(var(--cw) * .053);background:linear-gradient(100deg,#24202c,#15131e 70%);border-bottom:1px solid #a38b56}
  .usw-pane[data-pos="right"] .usw-pane-head{flex-direction:row-reverse;text-align:right}
  .usw-pane-body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#8a6f4288 transparent}

  .usw-spell-mark{position:relative;flex:none;width:max(28px,calc(var(--cw) * .144));height:max(28px,calc(var(--cw) * .144))}
  .usw-spell-mark::before{content:"";position:absolute;inset:0;border-radius:50%;
    background:radial-gradient(circle at 40% 30%,#fff3c1,#9e7438 54%,#3c2714);box-shadow:0 2px 5px #0008}
  .usw-spell-mark svg{position:absolute;inset:13%;width:74%;height:74%;filter:drop-shadow(0 2px 2px #0008)}
  .usw-spell-mark b{position:absolute;right:-4px;bottom:-2px;z-index:2;min-width:max(16px,calc(var(--cw) * .059));height:max(16px,calc(var(--cw) * .059));
    padding:0 2px;display:grid;place-items:center;border-radius:50%;color:#f7e7c4;background:#1c2434;border:1px solid #dfc986;
    font:700 max(11px,calc(var(--cw) * .032))/1 Georgia,serif;text-shadow:0 1px #000}
  .usw-head-title{min-width:0}
  .usw-head-title small{display:block;color:#9a8566;font:max(11px,calc(var(--cw) * .026)) Georgia,serif;letter-spacing:.3em}
  .usw-head-title h3{margin:calc(var(--cw) * .01) 0 0;color:#e9d39d;letter-spacing:.14em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    font:700 max(14px,calc(var(--cw) * .075))/1.2 ${DISPLAY}}
  .usw-spell-body{display:flex;flex-direction:column;padding:calc(var(--cw) * .048) calc(var(--cw) * .064) calc(var(--cw) * .04);
    color:#3a2e20;background-color:#e2d3b2;background-image:${NOISE};background-blend-mode:multiply;
    box-shadow:inset 0 0 0 1px rgba(74,56,28,.16),inset 0 1px 0 rgba(255,246,220,.22),inset 0 0 18px rgba(62,44,20,.08)}
  .usw-ink{display:flex;align-items:center;gap:9px;color:#6c5030;font:max(11px,calc(var(--cw) * .028)) Georgia,serif;letter-spacing:.2em}
  .usw-ink i{flex:1;height:1px;background:linear-gradient(90deg,transparent,#765b36)}
  .usw-ink i:last-child{transform:scaleX(-1)}
  .usw-copy{margin:calc(var(--cw) * .042) 0 0;color:#32281c;letter-spacing:.02em;overflow-wrap:anywhere;
    font:max(12px,calc(var(--cw) * .052))/1.85 "Microsoft YaHei",${DISPLAY}}
  .usw-copy b,.usw-copy .spell-stat{color:#6f1f2a;font-weight:700;font-variant-numeric:tabular-nums;background:none;border:0;padding:0}
  .usw-copy.empty{color:#6c5a44;font-style:italic}
  .usw-formula{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 12px;margin-top:auto;padding-top:calc(var(--cw) * .03);
    border-top:1px solid #80664366;color:#312a20;font-size:max(11px,calc(var(--cw) * .036))}
  .usw-formula span{color:#78592f;letter-spacing:.08em}
  .usw-formula strong{font-weight:600;color:#312a20;letter-spacing:0}
  .usw-formula .usw-spell-magic{margin-left:auto;color:#6e2530}
  .usw-formula .usw-spell-magic b{font-family:Georgia,serif}

  .usw-trait-head{justify-content:space-between}
  .usw-trait-head h3{margin:0;color:#dec99c;letter-spacing:.2em;white-space:nowrap;font:max(14px,calc(var(--cw) * .07))/1.2 ${DISPLAY}}
  .usw-trait-head span{flex:none;color:#8b8291;font-size:max(11px,calc(var(--cw) * .03));white-space:nowrap}
  .usw-trait-body{padding:calc(var(--cw) * .04);display:grid;align-content:start;gap:calc(var(--cw) * .032);background:linear-gradient(180deg,#15131c,#0f0e15)}
  .usw-trait{position:relative;display:flex;align-items:center;gap:calc(var(--cw) * .042);min-height:calc(var(--ch) * .2);
    padding:calc(var(--cw) * .035) calc(var(--cw) * .032) calc(var(--cw) * .035) calc(var(--cw) * .045);
    border:1px solid #67563e;background:linear-gradient(100deg,#2a2431,#1a1722 68%);box-shadow:inset 0 1px #d7bb7517,0 3px 8px #0003}
  .usw-trait::after{content:"";position:absolute;left:5px;right:5px;bottom:4px;height:1px;background:linear-gradient(90deg,transparent,#8e714355,transparent)}
  .usw-trait-glyph{flex:none;width:max(20px,calc(var(--cw) * .118));height:max(20px,calc(var(--cw) * .118));display:grid;place-items:center;
    filter:drop-shadow(0 1px 2px rgba(0,0,0,.95)) drop-shadow(0 0 4px rgba(0,0,0,.65))}
  .usw-trait-glyph svg,.usw-trait-glyph img{width:100%;height:100%;object-fit:contain;display:block}
  .usw-trait-glyph.empty::before{content:"";width:40%;height:40%;border:1px solid #655946;transform:rotate(45deg)}
  .usw-trait-copy{flex:1;min-width:0}
  .usw-trait h4{margin:0;color:#e4d3b6;letter-spacing:.1em;font:max(12px,calc(var(--cw) * .054))/1.25 ${DISPLAY}}
  .usw-trait p{margin:calc(var(--cw) * .012) 0 0;color:#aca1aa;font-size:max(11px,calc(var(--cw) * .037));line-height:1.4;overflow-wrap:anywhere}
  .usw-trait p b{color:#d6c7a9;font-weight:400}
  .usw-trait-mark{flex:none;align-self:flex-start;width:max(14px,calc(var(--cw) * .055));height:max(14px,calc(var(--cw) * .055));color:#9eba92}
  .usw-trait-mark svg{width:100%;height:100%;display:block}
  .usw-trait.locked{background:linear-gradient(100deg,#1b1921,#15131c);border-color:#413a34}
  .usw-trait.locked .usw-trait-glyph{opacity:.38}
  .usw-trait.locked h4{color:#a39891}
  .usw-trait.locked p{color:#7c7480}
  .usw-trait.locked .usw-trait-mark{color:#756e76}
  .usw-trait-tag{display:inline-block;margin-left:6px;padding:0 5px;border:1px solid #6e5a3c;vertical-align:1px;letter-spacing:0;
    font:max(11px,calc(var(--cw) * .028))/1.5 ${BODY};color:#9e885f}

  .usw-actions{flex:none;width:var(--cw);display:flex;flex-direction:column;align-items:stretch;gap:calc(var(--gap) * .6);background:rgba(13,12,21,.94);border-radius:0 0 6px 6px}
  .usw-cast{position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:var(--bh);padding:0 24px;cursor:pointer;
    color:#f2e5bc;font:max(14px,calc(var(--bh) * .37)) ${DISPLAY};letter-spacing:.14em;text-indent:.14em;
    background:linear-gradient(#477454,#294b38 49%,#213b2d 50%,#2f4e37);border:1px solid #baa674;border-radius:0;
    box-shadow:inset 0 0 0 3px #1d302944,inset 0 1px #d1eab94d,0 3px 7px #0004;transition:filter .15s}
  .usw-cast::before,.usw-cast::after{content:"";position:absolute;top:50%;width:6px;height:6px;margin-top:-4px;
    background:linear-gradient(140deg,#f6df9f,#94703b);border:1px solid #ddc080;transform:rotate(45deg)}
  .usw-cast::before{left:10px}
  .usw-cast::after{right:10px}
  .usw-cast:hover:not(:disabled){filter:brightness(1.17)}
  .usw-cast:active:not(:disabled){transform:translateY(1px)}
  .usw-cast:disabled{cursor:default;color:#a99d88;background:linear-gradient(#302838,#1b1823);border-color:#6e5a3c;
    box-shadow:inset 0 1px #f0dab71f;letter-spacing:.08em;text-indent:.08em}
  .usw-cast:disabled::before,.usw-cast:disabled::after{background:#4a4050;border-color:#6e5a3c}
  .usw-cast[data-kind="silenced"]:disabled{color:#bfb0d4}
  .usw-cast[data-kind="short"]:disabled{color:#b4c3dc}
  .usw-quick{display:flex;align-items:center;justify-content:center;gap:8px;min-height:var(--chk);cursor:pointer;user-select:none;
    color:#c5bba7;font:max(11px,calc(var(--chk) * .46)) ${BODY};letter-spacing:.06em}
  .usw-quick input{appearance:none;-webkit-appearance:none;flex:none;display:grid;place-items:center;margin:0;cursor:pointer;
    width:max(14px,calc(var(--chk) * .56));height:max(14px,calc(var(--chk) * .56));
    border:1px solid #8e7347;background:linear-gradient(#302838,#1b1823);box-shadow:inset 0 1px #f0dab71f}
  .usw-quick input:checked{border-color:#baa674;background:linear-gradient(#477454,#2f4e37)}
  .usw-quick input:checked::after{content:"";width:40%;height:40%;background:#f2e5bc;transform:rotate(45deg)}
  .usw-quick small{color:#847b87;font-size:max(11px,calc(var(--chk) * .4));white-space:nowrap}
  .usw-foe-mana{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;height:var(--bh);
    color:#d8c191;border:1px solid #8e7347;background:linear-gradient(#302838,#1b1823);box-shadow:inset 0 1px #f0dab71f;
    font:max(12px,calc(var(--bh) * .34)) ${DISPLAY};letter-spacing:.12em}
  .usw-foe-mana svg{width:max(14px,calc(var(--bh) * .44));height:max(14px,calc(var(--bh) * .44))}
  .usw-foe-mana b{font:bold max(13px,calc(var(--bh) * .4))/1 Georgia,serif;color:#f2e4c9;letter-spacing:0}
  .usw-foe-mana b i{font-style:normal;font-weight:400;color:#8b8291;font-size:.8em}

  /* 紧凑（手机横屏）：去次要信息、收字距 */
  .usw.compact .usw-quick small,.usw.compact .usw-head-title small,.usw.compact .usw-stats b i{display:none}
  .usw.compact .usw-head-title h3,.usw.compact .usw-trait-head h3{letter-spacing:.04em}
  .usw .usw-couplet-head{min-height:calc(var(--cw) * .28);padding:max(12px,calc(var(--cw) * .045)) calc(var(--cw) * .053);gap:calc(var(--cw) * .05)}
  .usw .usw-couplet-head .usw-spell-mark{width:max(28px,calc(var(--cw) * .125));height:max(28px,calc(var(--cw) * .125))}
  .usw .usw-couplet-head .usw-head-title small{display:none}
  .usw.compact .usw-couplet-head{flex-direction:column;gap:10px;text-align:center}
  .usw.compact .usw-couplet-head .usw-head-title{width:100%}
  .usw .usw-head-title h3.spell-couplet{margin:0;white-space:pre-line;overflow:visible;text-overflow:clip;font-size:max(14px,calc(var(--cw) * .05));line-height:1.75;letter-spacing:.06em}
  .usw.compact .usw-name span{letter-spacing:.1em;text-indent:.1em}
  .usw.compact .usw-trait{min-height:0}
  @media (prefers-reduced-motion:reduce){.usw-pane,.usw-cast{transition:none}}
`;

let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.id = 'usw-styles';
  style.textContent = CSS_STACK + CSS_PANES;
  document.head.appendChild(style);
}

/** 两侧卡略多露出点击区，仍有约一半叠在中间卡后，避免三张并排。 */
export const PANE_SPREAD = 0.5;
const FAN_ANGLE = 6 * Math.PI / 180;
const FAN_SIDE_WIDTH = 0.94 * (Math.cos(FAN_ANGLE) + 1.5 * Math.sin(FAN_ANGLE));
// 含旋转后的上下边缘、侧卡下沉与顶部留白。
const FAN_HEIGHT = 1.61;

/** 详情窗版式（wrapper 逻辑像素） */
export interface UnitSheetMetrics {
  pad: number;
  gap: number;
  compact: boolean;
  /** 三张卡同尺寸（2:3） */
  cardW: number;
  cardH: number;
  /** 两侧卡的水平偏移 */
  spread: number;
  fanH: number;
  buttonH: number;
  checkH: number;
  closeSize: number;
}

/**
 * 同时预留卡扇旋转后的边界与底部操作区；宽屏展开不以牺牲小屏文字大小为代价。
 */
export function unitSheetMetrics(width: number, height: number): UnitSheetMetrics {
  const k = Math.max(0.3, Math.min(1.2, width / 1100, height / 812));
  const compact = height < 520;
  const pad = Math.max(8, Math.round(16 * k));
  const gap = Math.max(5, Math.round(10 * k));
  const buttonH = Math.round(Math.max(30, 46 * k));
  const checkH = Math.round(Math.max(20, 26 * k));
  const closeSize = Math.round(Math.max(24, 32 * k));
  const usableH = height - pad * 2 - closeSize - buttonH - checkH - gap * 2;
  const innerW = width - pad * 2;
  const cardW = Math.max(80, Math.floor(Math.min((usableH - 2) / FAN_HEIGHT, (innerW - 2) / (FAN_SIDE_WIDTH + PANE_SPREAD * 2))));
  return {
    pad, gap, compact, cardW, cardH: Math.round(cardW * 1.5), spread: Math.round(cardW * PANE_SPREAD), fanH: Math.ceil(cardW * FAN_HEIGHT), buttonH, checkH, closeSize,
  };
}

const PANE_LABEL: Record<SheetPane, string> = { spell: '技能', portrait: '部队', traits: '天赋特质' };

/**
 * 部队详情窗 DOM 组件。一个实例常驻 wrapper，open() 切换内容、update() 就地刷新数值。
 * 非模态：只拦截卡扇与操作按钮的输入，未遮挡的队伍卡仍可点选。
 */
export class UnitSheet {
  private root: HTMLElement;
  private current: UnitSheetData | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private outsideHandler: ((e: PointerEvent) => void) | null = null;
  /** 当前卡摞排布（换角色时回到默认：立绘在最前） */
  private layout: Record<SheetPane, PanePos> = { ...DEFAULT_PANE_POS };
  /** 结构签名：状态/特质/技能文本变化时整块重绘，数值只做就地更新 */
  private statusSig = '';
  private copySig = '';
  private headerSig = '';
  private termTips?: () => void;

  constructor(parent: HTMLElement, private handlers: UnitSheetHandlers, private options: { layout?: 'fan' | 'columns' } = {}) {
    ensureStyles();
    this.root = document.createElement('section');
    this.root.className = `usw${options.layout === 'columns' ? ' usw-columns' : ''}`;
    this.root.dataset.testid = 'unit-sheet';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'false');
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const pane = target.closest<HTMLElement>('.usw-pane');
      if (target.closest('.usw-close') || target === this.root || target.classList.contains('usw-stack')) {
        // ✕ 或卡摞外的空白处（压暗的棋盘区）关闭
        this.handlers.onClose();
      } else if (pane && pane.dataset.pos !== 'center') {
        this.bringToFront(pane.dataset.pane as SheetPane);
      } else if (target.closest('.usw-cast')) {
        const button = target.closest('.usw-cast') as HTMLButtonElement;
        if (!button.disabled && this.current) this.handlers.onCast(this.current.charId);
      }
    });
    this.root.addEventListener('keydown', (e) => {
      const pane = (e.target as HTMLElement).closest<HTMLElement>('.usw-pane');
      if (!pane || pane !== e.target || pane.dataset.pos === 'center') return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      this.bringToFront(pane.dataset.pane as SheetPane);
    });
    this.root.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      if (input.classList.contains('usw-quick-box')) this.handlers.onQuickCast(input.checked);
    });
    // 术语解释委托绑定在根上一次即可：patchCopy/traitsHtml 重绘后 span 是新的，委托不受影响
    this.termTips = bindTermTips(this.root);
  }

  /** 覆盖区域（wrapper 布局坐标）：棋盘略向两侧扩展，按需让出 HUD 通道 */
  setBounds(b: UnitSheetBounds): void {
    const m = unitSheetMetrics(b.width, b.height);
    if (this.options.layout === 'columns') {
      m.cardW = Math.max(220, Math.min(320, Math.floor((b.width - 48) / 3)));
      m.cardH = Math.round(m.cardW * 1.5);
    }
    Object.assign(this.root.style, {
      left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px`,
    });
    const px: [string, number][] = [
      ['--pad', m.pad], ['--gap', m.gap], ['--cw', m.cardW], ['--ch', m.cardH], ['--sp', m.spread],
      ['--fan-h', m.fanH], ['--bh', m.buttonH], ['--chk', m.checkH], ['--close', m.closeSize],
    ];
    for (const [name, value] of px) this.root.style.setProperty(name, `${value}px`);
    this.root.classList.toggle('compact', m.compact);
  }

  isOpen(): boolean {
    return this.root.classList.contains('open');
  }

  /** 当前展示的角色 id（未打开为 null） */
  get charId(): number | null {
    return this.isOpen() && this.current ? this.current.charId : null;
  }

  /** 当前在最前的一页 */
  get frontPane(): SheetPane {
    return (Object.keys(this.layout) as SheetPane[]).find((p) => this.layout[p] === 'center') ?? 'portrait';
  }

  /** 把某一页换到最前（与原当前页交换位置） */
  bringToFront(pane: SheetPane): void {
    if (this.layout[pane] === 'center') return;
    this.layout = bringPaneToFront(this.layout, pane);
    this.applyLayout();
    this.root.querySelector<HTMLElement>(`.usw-pane[data-pane="${pane}"]`)?.focus({ preventScroll: true });
  }

  private applyLayout(): void {
    for (const el of this.root.querySelectorAll<HTMLElement>('.usw-pane')) {
      const pane = el.dataset.pane as SheetPane;
      const pos = this.options.layout === 'columns' ? 'center' : this.layout[pane];
      el.dataset.pos = pos;
      const front = pos === 'center';
      el.tabIndex = front ? -1 : 0;
      if (front) {
        el.removeAttribute('role');
        el.setAttribute('aria-label', PANE_LABEL[pane]);
      } else {
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', `查看${PANE_LABEL[pane]}`);
      }
    }
  }

  /** 打开或切换到某个角色（整窗重绘；换角色时卡摞回到立绘在最前） */
  open(data: UnitSheetData, opts: { focus?: boolean; dismissOnOutside?: boolean } = {}): void {
    const wasOpen = this.isOpen();
    const switching = wasOpen && this.current?.charId !== data.charId;
    if (!wasOpen || switching) this.layout = { ...DEFAULT_PANE_POS };
    this.current = data;
    this.renderAll(data);
    const motion = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!wasOpen) {
      this.root.classList.add('open');
      if (motion) this.playEnter();
      this.keyHandler = (e: KeyboardEvent) => {
        if (e.key !== 'Escape' || !this.isOpen()) return;
        e.stopPropagation();
        this.handlers.onClose();
      };
      window.addEventListener('keydown', this.keyHandler);
      // 卡扇和按钮以外的空白处透传点击，由这里统一关闭详情。
      // 战斗卡片除外：点卡由 App 的点卡逻辑负责「同一张收起 / 另一张切换」。
      this.outsideHandler = (e: PointerEvent) => {
        if (!this.isOpen()) return;
        const target = e.target as Element | null;
        if (!target || this.root.contains(target) || target.closest('.gcard')) return;
        this.handlers.onClose();
      };
      if (opts.dismissOnOutside !== false) document.addEventListener('pointerdown', this.outsideHandler, true);
    } else if (switching && motion) {
      this.root.querySelector('.usw-stack')?.animate([{ opacity: 0.3 }, { opacity: 1 }], { duration: 150, easing: 'ease-out' });
    }
    if (opts.focus) {
      const target = this.root.querySelector<HTMLElement>('.usw-cast:not(:disabled)')
        ?? this.root.querySelector<HTMLElement>('.usw-close');
      target?.focus({ preventScroll: true });
    }
  }

  /** 入场：压暗淡入，卡摞从收拢状态展开 */
  private playEnter(): void {
    this.root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
    this.root.querySelector('.usw-stack')?.animate(
      [{ opacity: 0, transform: 'translateY(10px) scale(.96)' }, { opacity: 1, transform: 'none' }],
      { duration: 220, easing: 'cubic-bezier(.2,.8,.25,1)' },
    );
  }

  /** 同一角色的实时刷新：只改变化的部分，不打断滚动与焦点 */
  update(data: UnitSheetData): void {
    if (!this.isOpen() || !this.current || this.current.charId !== data.charId) {
      this.open(data);
      return;
    }
    this.current = data;
    if (this.headerSigOf(data) !== this.headerSig) {
      this.renderAll(data);
      return;
    }
    this.patchCard(data);
    this.patchActions(data);
    this.patchCopy(data);
    this.patchStatuses(data);
  }

  close(): void {
    if (!this.isOpen()) return;
    const hadFocus = this.root.contains(document.activeElement);
    this.root.classList.remove('open');
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
    if (this.outsideHandler) document.removeEventListener('pointerdown', this.outsideHandler, true);
    this.outsideHandler = null;
    const id = this.current?.charId;
    this.current = null;
    // 焦点在窗内时交还给对应的卡片（键盘用户不丢位置）
    if (hadFocus && id !== undefined) {
      document.querySelector<HTMLElement>(`[data-testid="card-${id}"]`)?.focus({ preventScroll: true });
    }
  }

  destroy(): void {
    this.close();
    this.termTips?.();
    this.root.remove();
  }

  // —— 渲染 ——

  private headerSigOf(d: UnitSheetData): string {
    return [d.charId, d.ally, d.name, d.portrait, d.typeLine, d.race, d.kingdom, d.rarityLabel, d.role ?? '', d.rarity, d.rarityColor,
      d.skillName, d.skillTag, d.colors.join(','),
      d.traitSlots.map((t) => `${t.code}:${t.unlocked}:${t.implemented}`).join(',')].join('|');
  }

  private renderAll(d: UnitSheetData): void {
    const nameId = `usw-name-${d.charId}`;
    this.root.setAttribute('aria-labelledby', nameId);
    this.root.dataset.side = d.ally ? 'ally' : 'enemy';
    this.root.dataset.charId = String(d.charId);
    const nameSub = [d.role ?? '', d.race, d.kingdom, d.rarityLabel].filter(Boolean).join(' · ');
    const rarityAttr = d.rarityColor ? ` data-rc style="--rc:${esc(d.rarityColor)}"` : '';
    const unlocked = d.traitSlots.filter((t) => t.unlocked).length;
    this.root.innerHTML = `
      <button class="usw-close" type="button" aria-label="关闭详情">✕</button>
      <div class="usw-stack">
        <section class="usw-pane" data-pane="spell">
          <div class="usw-page">
            <header class="usw-pane-head${isCoupletSpell(d.skillName || '') ? ' usw-couplet-head' : ''}">
              <div class="usw-spell-mark" aria-hidden="true">${manaGemSvg(d.colors, 1)}<b>${d.shown.manaCost}</b></div>
              <div class="usw-head-title"><small>法力 ${d.shown.manaCost}</small><h3 class="${isCoupletSpell(d.skillName || '') ? 'spell-couplet' : ''}">${esc(spellTitleText(d.skillName || '技能'))}</h3></div>
            </header>
            <div class="usw-pane-body usw-spell-body" tabindex="0" aria-label="技能说明">
              <div class="usw-ink"><i></i><span>${esc(d.skillTag)}</span><i></i></div>
              <p class="usw-copy"></p>
              <div class="usw-formula">
                <span class="usw-target" hidden><span>目标</span> <strong></strong></span>
                <span class="usw-spell-magic">魔力 <b></b></span>
              </div>
            </div>
          </div>
        </section>
        <section class="usw-pane" data-pane="portrait">
          <article class="usw-card"${rarityAttr}${d.rarity !== null ? ` data-rarity="${d.rarity}"` : ''}>
            <img class="usw-portrait" alt="" draggable="false">
            <div class="usw-shade" aria-hidden="true"></div>
            <div class="usw-frame" aria-hidden="true"></div>
            <div class="usw-gem" role="img"></div>
            <div class="usw-magic" role="img">${CARD_STAT_ICONS.magic}<b></b></div>
            <div class="usw-name"><h2 id="${nameId}">${esc(d.name)}</h2>${nameSub ? `<span>${esc(nameSub)}</span>` : ''}</div>
            <div class="usw-stats">
              <div class="st-atk" role="img">${CARD_STAT_ICONS.sword}<b></b></div>
              <div class="st-armor" role="img">${CARD_STAT_ICONS.shield}<b></b></div>
              <div class="st-hp" role="img">${CARD_STAT_ICONS.heart}<b></b></div>
            </div>
            <div class="usw-statusbar" aria-label="当前状态"></div>
          </article>
          <div class="usw-ornament">${ORNAMENT_SVG}</div>
        </section>
        <section class="usw-pane" data-pane="traits">
          <div class="usw-page">
            <header class="usw-pane-head usw-trait-head"><h3>天赋特质</h3><span>${unlocked} / ${d.traitSlots.length} 已解锁</span></header>
            <div class="usw-pane-body usw-trait-body" tabindex="0" aria-label="天赋特质">${this.traitsHtml(d)}</div>
          </div>
        </section>
      </div>
      <div class="usw-actions">
        ${d.ally
          ? `<button class="usw-cast" type="button" data-testid="unit-sheet-cast">释放技能</button>
             <label class="usw-quick"><input type="checkbox" class="usw-quick-box" data-testid="unit-sheet-quick"><span>快速释放</span><small>点满法力角色直接施放</small></label>`
          : `<div class="usw-foe-mana" role="status"></div>`}
      </div>`;
    const card = this.root.querySelector('.usw-card') as HTMLElement;
    const img = this.root.querySelector('.usw-portrait') as HTMLImageElement;
    card.classList.add('no-art');
    if (d.portrait) {
      img.addEventListener('load', () => card.classList.remove('no-art'), { once: true });
      img.addEventListener('error', () => card.classList.add('no-art'), { once: true });
      img.src = d.portrait;
      if (img.complete && img.naturalWidth > 0) card.classList.remove('no-art');
    }
    this.applyLayout();
    this.headerSig = this.headerSigOf(d);
    this.copySig = '';
    this.statusSig = '';
    this.patchCard(d);
    this.patchActions(d);
    this.patchCopy(d);
    this.patchStatuses(d);
  }

  private patchCard(d: UnitSheetData): void {
    const s = d.shown;
    const card = this.root.querySelector('.usw-card') as HTMLElement | null;
    if (!card) return;
    card.classList.toggle('full', s.manaCost > 0 && s.mana >= s.manaCost);
    card.classList.toggle('defeated', s.defeated);
    const ratio = s.manaCost > 0 ? Math.min(1, s.mana / s.manaCost) : 0;
    const manaSig = `${s.mana}/${s.manaCost}`;
    const gem = card.querySelector('.usw-gem') as HTMLElement;
    if (gem.dataset.sig !== manaSig) {
      gem.dataset.sig = manaSig;
      gem.innerHTML = `${manaGemSvg(d.colors, ratio)}<span class="usw-gem-mana" aria-hidden="true">${s.mana}<small>/${s.manaCost}</small></span>`;
      gem.setAttribute('aria-label', `法力 ${s.mana}/${s.manaCost}`);
    }
    const setStat = (sel: string, html: string, label: string) => {
      const el = card.querySelector(sel) as HTMLElement;
      const b = el.querySelector('b') as HTMLElement;
      if (b.innerHTML !== html) b.innerHTML = html;
      el.setAttribute('aria-label', label);
    };
    setStat('.usw-magic', String(s.magic), `魔力 ${s.magic}`);
    setStat('.st-atk', String(s.attack), `攻击 ${s.attack}`);
    setStat('.st-armor', String(s.armor), `护甲 ${s.armor}`);
    setStat('.st-hp', `${s.hp}<i>/${s.maxHp}</i>`, `生命 ${s.hp}/${s.maxHp}`);
    const magic = this.root.querySelector('.usw-spell-magic b') as HTMLElement | null;
    if (magic && magic.textContent !== String(s.magic)) magic.textContent = String(s.magic);
    const foe = this.root.querySelector('.usw-foe-mana') as HTMLElement | null;
    if (foe && foe.dataset.sig !== manaSig) {
      foe.dataset.sig = manaSig;
      foe.innerHTML = `${manaGemSvg(d.colors, ratio)}<span>法力</span><b>${s.mana}<i> / ${s.manaCost}</i></b>`;
      foe.setAttribute('aria-label', `法力 ${s.mana}/${s.manaCost}`);
    }
  }

  private patchActions(d: UnitSheetData): void {
    const button = this.root.querySelector('.usw-cast') as HTMLButtonElement | null;
    if (button && d.cast) {
      const label = castButtonLabel(d.cast);
      if (button.textContent !== label) button.textContent = label;
      const disabled = d.cast.kind !== 'ready';
      if (button.disabled !== disabled) button.disabled = disabled;
      button.dataset.kind = d.cast.kind;
    }
    const box = this.root.querySelector('.usw-quick-box') as HTMLInputElement | null;
    if (box && box.checked !== d.quickCast) box.checked = d.quickCast;
  }

  private patchCopy(d: UnitSheetData): void {
    const sig = `${d.shown.magic}|${d.skillDescription}|${d.targetNote}`;
    if (sig === this.copySig) return;
    this.copySig = sig;
    const copy = this.root.querySelector('.usw-copy') as HTMLElement | null;
    if (copy) {
      const html = d.skillDescription
        ? renderSpell(esc(d.skillDescription), d.shown.magic, { interactive: false }).html
        : '';
      copy.classList.toggle('empty', !html);
      copy.innerHTML = html || '这个技能暂无效果描述。';
    }
    const target = this.root.querySelector('.usw-target') as HTMLElement | null;
    if (target) {
      target.hidden = !d.targetNote;
      (target.querySelector('strong') as HTMLElement).textContent = d.targetNote.replace(/^目标：/, '');
    }
  }

  /** 立绘卡底部的状态图标：图标 + 剩余回合角标，说明放在悬停 title 里，不展开大段文字 */
  private patchStatuses(d: UnitSheetData): void {
    const list = d.shown.statuses;
    const sig = list.map((s) => `${s.id}:${s.turns}:${s.magnitude ?? ''}`).join(',');
    if (sig === this.statusSig) return;
    this.statusSig = sig;
    const bar = this.root.querySelector('.usw-statusbar') as HTMLElement | null;
    if (!bar) return;
    const recovery = statusRecoveryChance({ statuses: list as StatusInstance[] });
    bar.innerHTML = list.map((s) => {
      const badge = statusBadge(s.id);
      const live = statusLiveLine(s, recovery);
      const desc = STATUS_DESCRIPTIONS[badge.label] ?? '';
      const positive = isPositiveStatus(s.id);
      const tip = [`${positive ? '增益' : '减益'}：${badge.label}`, live, desc].filter(Boolean).join('\n');
      const corner = statusBadgeCorner(s);
      return `<span class="usw-sb ${positive ? 'usw-sb-pos' : 'usw-sb-neg'}" style="--sc:${badge.color}" role="img" title="${esc(tip)}" aria-label="${esc([`${positive ? '增益' : '减益'}：${badge.label}`, live].filter(Boolean).join('，'))}">`
        + `${statusBadgeIcon(s.id)}${corner ? `<b>${corner}</b>` : ''}</span>`;
    }).join('');
  }

  /** 图鉴同款 3 个特质槽：已解锁打勾；未解锁 / 未开槽上锁并压暗 */
  private traitsHtml(d: UnitSheetData): string {
    const real = d.traitSlots.filter((t) => t.code);
    const glyphs = traitCardGlyphs(real.map((t) => t.code), d.traitNames, d.name, 2);
    let gi = 0;
    return d.traitSlots.map((t) => {
      const glyph = t.code ? glyphs[gi++]?.svg ?? '' : '';
      const off = t.unlocked && t.code && !t.implemented ? '<span class="usw-trait-tag">本场不生效</span>' : '';
      const text = applyTermMarkup(esc(t.description || '暂无描述。').replace(/(\d+(?:\.\d+)?%?)/g, '<b>$1</b>'));
      return `<article class="usw-trait${t.unlocked ? '' : ' locked'}">
        <span class="usw-trait-glyph${glyph ? '' : ' empty'}" aria-hidden="true">${glyph}</span>
        <div class="usw-trait-copy"><h4>${esc(t.name)}${off}</h4><p>${text}</p></div>
        <span class="usw-trait-mark" role="img" aria-label="${t.unlocked ? '已解锁' : '尚未解锁'}">${t.unlocked ? CHECK_SVG : LOCK_SVG}</span>
      </article>`;
    }).join('');
  }
}
