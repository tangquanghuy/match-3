/**
 * 部队详情窗（战斗内，非模态）。
 *
 * 取代原「长按详情面板 + 施法确认层」：点任意战斗卡打开，版式对齐图鉴「部队详情」——
 * 左栏完整 2:3 立绘卡（稀有度边框 / 法力宝石 / 魔力 / 名字 / 种族行 / 攻击·护甲·生命），
 * 卡下「释放技能」按钮 +「快速释放」复选框（仅我方）；右栏技能全文（按当前魔力求值）、
 * 目标说明、当前状态、全部特质。
 *
 * 只盖棋盘（含上方 HUD 通道），两侧队伍列保持可见可点：点另一张卡切换内容、再点同一张关闭。
 * 挂在战斗 wrapper 内，随舞台一起缩放。不暂停战斗；数值跟随卡面显示值实时刷新（App 轮询）。
 * 图鉴的 meta 样式不在独立战斗页加载，这里用 `usw-` 前缀的战斗域样式复刻同一套观感。
 */
import type { BaseColor } from '@engine/types';
import { renderSpell } from '../meta/shell/spellText';
import { STATUS_DESCRIPTIONS } from '../data/statusDescriptions';
import { statusBadge, statusBadgeIcon } from './statusBadges';
import { traitCardGlyphs } from './traitBadges';
import { CARD_STAT_ICONS, manaGemSvg } from './TeamView';
import type { CardShownStats } from './TeamView';

/** 施放按钮的状态（优先级见 resolveCastAvailability） */
export type CastKind = 'ready' | 'short' | 'silenced' | 'enemyTurn' | 'resolving' | 'auto' | 'defeated' | 'used' | 'over';

export interface CastAvailability {
  kind: CastKind;
  /** kind='short' 时还差的法力 */
  short?: number;
}

export interface CastAvailabilityInput {
  /** 自动战斗接管中（lane B 的 App.autoBattleEnabled） */
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
  /** 种族 · 王国 · 稀有度；空串则不显示 */
  typeLine: string;
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
  traits: { code: string; name: string; description: string; implemented: boolean }[];
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

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** 状态实时数值行（每回合 N 点 · 剩余 N 回合） */
export function statusLiveLine(s: { turns: number; magnitude?: number }): string {
  const live: string[] = [];
  if (s.magnitude !== undefined) live.push(`每回合 ${s.magnitude} 点`);
  if (s.turns > 0) live.push(`剩余 ${s.turns} 回合`);
  return live.join(' · ');
}

let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const noise = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' seed='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 .42  0 0 0 0 .34  0 0 0 0 .22  0 0 0 .22 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";
  const css = `
  .usw{position:absolute;z-index:1100;box-sizing:border-box;display:none;flex-direction:column;overflow:hidden;
    --k:1;--pad:16px;--cw:300px;
    color:#e8dcc4;font-family:"Oswald","PingFang SC","Microsoft YaHei",sans-serif;
    background:
      radial-gradient(120% 70% at 30% 0%,rgba(163,139,86,.07),transparent 60%),
      linear-gradient(160deg,#18151f 0%,#0e0d14 100%);
    border:1px solid rgba(163,139,86,.62);border-radius:10px;
    box-shadow:0 0 0 1px rgba(8,7,6,.7),0 18px 46px rgba(0,0,0,.62),inset 0 1px 0 rgba(240,218,170,.08)}
  .usw.open{display:flex}
  .usw *{box-sizing:border-box}
  .usw-bar{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;
    height:max(28px,calc(36px * var(--k)));padding:0 calc(var(--pad) * .5) 0 var(--pad);
    border-bottom:1px solid rgba(163,139,86,.28);
    background:linear-gradient(90deg,rgba(163,139,86,.1),transparent 60%)}
  .usw-bar-title{font-size:max(11px,calc(13px * var(--k)));letter-spacing:.24em;color:#cdb785;white-space:nowrap}
  .usw-bar-title i{font-style:normal;color:#8f8474;letter-spacing:.12em;margin-left:.6em}
  .usw-close{flex:none;width:max(28px,calc(34px * var(--k)));height:max(28px,calc(34px * var(--k)));padding:0;
    display:inline-flex;align-items:center;justify-content:center;cursor:pointer;
    border:1px solid rgba(216,194,144,.34);border-radius:6px;background:rgba(20,18,15,.82);
    color:#d8c290;font:600 max(12px,calc(15px * var(--k)))/1 "Oswald",sans-serif}
  .usw-close:hover{color:#fff3d2;border-color:#c9a35c}
  .usw-close:focus-visible,.usw-cast:focus-visible,.usw-quick input:focus-visible,.usw-info:focus-visible{
    outline:2px solid rgba(240,222,170,.9);outline-offset:2px}
  .usw-body{flex:1;min-height:0;display:flex;gap:var(--pad);padding:var(--pad)}
  .usw-left{flex:none;width:var(--cw);display:flex;flex-direction:column;gap:calc(var(--pad) * .6)}
  .usw-info{flex:1;min-width:0;min-height:0;overflow-y:auto;overscroll-behavior:contain;
    display:flex;flex-direction:column;gap:calc(var(--pad) * .9);padding-right:4px;
    scrollbar-width:thin;scrollbar-color:#8a6f4288 transparent}

  /* —— 立绘卡（图鉴部队卡同款：稀有度边框 + 暗金内框 + 书签宝石 + 魔力角标 + 名字/种族 + 属性行）—— */
  .usw-card{position:relative;flex:none;width:var(--cw);height:calc(var(--cw) * 1.5);border-radius:11px;
    overflow:hidden;isolation:isolate;background:#101019;
    border:3px solid var(--rc,#ccb675);
    box-shadow:0 0 0 2px #111016,0 0 0 3px color-mix(in srgb,var(--rc,#ccb675) 70%,transparent),0 14px 30px rgba(0,0,0,.6)}
  .usw-portrait{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:50% 0;
    display:block;border-radius:8px}
  .usw-card.no-art .usw-portrait{visibility:hidden}
  .usw-card.no-art{background:radial-gradient(120% 90% at 50% 20%,#3a3140 0%,#17141d 60%,#0d0b12 100%)}
  .usw-shade{position:absolute;inset:0;border-radius:8px;pointer-events:none;
    background:linear-gradient(180deg,rgba(17,16,24,.08) 40%,rgba(11,11,19,.36) 58%,rgba(11,11,19,.9) 79%,#0b0b13 95%)}
  .usw-card::after{content:"";position:absolute;inset:calc(var(--cw) * .02);z-index:5;border-radius:7px;pointer-events:none;opacity:.55;
    background:
      linear-gradient(90deg,rgba(239,217,158,.82),transparent) left top/calc(var(--cw) * .08) 1px no-repeat,
      linear-gradient(180deg,rgba(239,217,158,.82),transparent) left top/1px calc(var(--cw) * .08) no-repeat,
      linear-gradient(270deg,rgba(239,217,158,.82),transparent) right top/calc(var(--cw) * .08) 1px no-repeat,
      linear-gradient(180deg,rgba(239,217,158,.82),transparent) right top/1px calc(var(--cw) * .08) no-repeat,
      linear-gradient(90deg,rgba(239,217,158,.7),transparent) left bottom/calc(var(--cw) * .07) 1px no-repeat,
      linear-gradient(0deg,rgba(239,217,158,.7),transparent) left bottom/1px calc(var(--cw) * .07) no-repeat,
      linear-gradient(270deg,rgba(239,217,158,.7),transparent) right bottom/calc(var(--cw) * .07) 1px no-repeat,
      linear-gradient(0deg,rgba(239,217,158,.7),transparent) right bottom/1px calc(var(--cw) * .07) no-repeat}
  .usw-gem{position:absolute;top:0;left:0;z-index:6;width:calc(var(--cw) * .18);height:calc(var(--cw) * .18);
    padding:calc(var(--cw) * .022);
    background:linear-gradient(135deg,rgba(20,18,15,.92),rgba(11,10,9,.82));
    border:1px solid rgba(216,194,144,.4);border-top-color:rgba(216,194,144,.5);border-left-color:rgba(216,194,144,.5);
    border-radius:8px 0 12px 0;box-shadow:1px 1px 4px rgba(0,0,0,.5)}
  .usw-gem svg{display:block;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 1px 2px rgba(0,0,0,.85))}
  .usw svg .seat{fill:rgba(11,10,9,.25)}
  .usw svg .dim{opacity:.72}
  .usw svg .facets{fill:none;stroke:rgba(255,255,255,.22);stroke-width:5}
  .usw-card.full .usw-gem{border-color:#c9a35c;box-shadow:1px 1px 4px rgba(0,0,0,.5),0 0 7px rgba(232,200,121,.45)}
  .usw-card.full .usw-gem svg{filter:drop-shadow(0 0 4px rgba(232,200,121,.9))}
  .usw-gem-count{position:absolute;left:calc(100% - calc(var(--cw) * .05));top:calc(100% - calc(var(--cw) * .055));
    z-index:2;display:inline-flex;align-items:baseline;gap:1px;white-space:nowrap;
    padding:max(1px,calc(var(--cw) * .006)) max(4px,calc(var(--cw) * .02));border-radius:999px;
    background:linear-gradient(#f3d98e,#a47b31);border:1px solid #f5dda0;box-shadow:0 2px 6px rgba(0,0,0,.6);
    color:#35251b;font:800 max(11px,calc(var(--cw) * .05))/1.15 "Playfair Display",Georgia,serif;
    font-variant-numeric:tabular-nums}
  .usw-gem-count i{font-style:normal;font-weight:700;font-size:.78em;opacity:.78}
  .usw-magic{position:absolute;top:0;right:0;z-index:6;display:flex;align-items:center;gap:calc(var(--cw) * .018);
    height:calc(var(--cw) * .1);padding:0 calc(var(--cw) * .034) 0 calc(var(--cw) * .028);
    background:linear-gradient(225deg,rgba(38,26,54,.94),rgba(16,11,22,.86));
    border:1px solid rgba(178,140,224,.42);border-top-color:rgba(200,166,240,.6);border-right-color:rgba(200,166,240,.6);
    border-radius:0 8px 0 12px;box-shadow:-1px 1px 4px rgba(0,0,0,.5),inset 0 0 6px rgba(140,90,200,.22)}
  .usw-magic svg{width:max(12px,calc(var(--cw) * .05));height:max(12px,calc(var(--cw) * .05));
    filter:drop-shadow(0 0 3px rgba(180,130,240,.7))}
  .usw-magic b{font:800 max(11px,calc(var(--cw) * .06))/1 "Playfair Display",Georgia,serif;color:#f1e9ff;
    text-shadow:0 1px 2px rgba(0,0,0,.95),0 0 5px rgba(150,100,210,.5)}
  .usw-name{position:absolute;left:0;right:0;bottom:calc(var(--cw) * .25);z-index:6;text-align:center;padding:0 6%}
  .usw-name h2{margin:0 0 calc(var(--cw) * .014);color:#fff4dc;
    font:600 max(13px,calc(var(--cw) * .092))/1.12 "Playfair Display","Noto Serif SC","Songti SC",Georgia,serif;
    text-shadow:0 3px 7px #000;overflow-wrap:anywhere}
  .usw-type{display:block;color:#ddd2c3;font-size:max(11px,calc(var(--cw) * .036));line-height:1.25;
    text-shadow:0 1px 3px #000}
  .usw-stats{position:absolute;left:6%;right:6%;bottom:calc(var(--cw) * .07);z-index:6;display:flex;justify-content:space-around;
    padding:calc(var(--cw) * .025) 0;border-top:1px solid rgba(181,156,98,.4);border-bottom:1px solid rgba(181,156,98,.2);
    background:linear-gradient(90deg,transparent,rgba(6,7,11,.47),transparent)}
  .usw-stats>div{display:flex;align-items:center;gap:calc(var(--cw) * .018)}
  .usw-stats svg{width:max(11px,calc(var(--cw) * .058));height:max(11px,calc(var(--cw) * .058));flex:none}
  .usw-stats b{font:800 max(11px,calc(var(--cw) * .07))/1 "Playfair Display",Georgia,serif;font-variant-numeric:tabular-nums}
  .usw-stats b i{font-style:normal;font-weight:700;font-size:.62em;opacity:.7;margin-left:1px}
  .usw-stats .st-atk{color:#d6c397}.usw-stats .st-atk b{color:#fff1d4}
  .usw-stats .st-armor{color:#c5c8ce}.usw-stats .st-armor b{color:#e4e6ea}
  .usw-stats .st-hp{color:#c45454}.usw-stats .st-hp b{color:#e07070}
  .usw-stats .ic{fill:currentColor}
  .usw-card.defeated .usw-portrait{filter:grayscale(.8) brightness(.5)}

  /* —— 卡下操作区 —— */
  .usw-cast{width:100%;min-height:max(32px,calc(42px * var(--k)));padding:0 8px;cursor:pointer;
    display:inline-flex;align-items:center;justify-content:center;
    font:600 max(13px,calc(16px * var(--k)))/1.1 "Oswald","PingFang SC","Microsoft YaHei",sans-serif;
    letter-spacing:.14em;text-indent:.14em;border-radius:7px;
    color:#1a1206;background:linear-gradient(180deg,#e8cf94 0%,#c9a35c 100%);
    border:1px solid #8a6b30;box-shadow:0 3px 9px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.32);
    transition:filter .12s,transform .12s}
  .usw-cast:hover:not(:disabled){filter:brightness(1.07)}
  .usw-cast:active:not(:disabled){transform:translateY(1px)}
  .usw-cast:disabled{cursor:default;color:#a39880;background:linear-gradient(180deg,#26222c,#1b1820);
    border-color:rgba(142,115,71,.45);box-shadow:inset 0 1px 0 rgba(240,218,183,.06);letter-spacing:.08em;text-indent:.08em}
  .usw-cast[data-kind="silenced"]:disabled{color:#c6b3dc;border-color:rgba(150,120,190,.55)}
  .usw-cast[data-kind="short"]:disabled{color:#b6c9ea}
  .usw-quick{display:flex;align-items:center;gap:6px;min-height:max(22px,calc(26px * var(--k)));cursor:pointer;user-select:none;
    font-size:max(11px,calc(13px * var(--k)));color:#cdbf9f}
  .usw-quick input{flex:none;width:max(14px,calc(16px * var(--k)));height:max(14px,calc(16px * var(--k)));margin:0;
    accent-color:#c9a35c;cursor:pointer}
  .usw-quick small{font-size:max(11px,calc(11px * var(--k)));color:#8a7f6c;margin-left:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .usw.compact .usw-quick small{display:none}
  .usw-foe-mana{display:flex;align-items:center;justify-content:center;gap:8px;min-height:max(32px,calc(42px * var(--k)));
    border:1px solid rgba(142,115,71,.4);border-radius:7px;background:rgba(20,18,26,.7);
    font-size:max(11px,calc(14px * var(--k)));color:#cdbf9f;letter-spacing:.08em}
  .usw-foe-mana svg{width:max(14px,calc(20px * var(--k)));height:max(14px,calc(20px * var(--k)))}
  .usw-foe-mana b{font:800 max(12px,calc(16px * var(--k)))/1 "Playfair Display",Georgia,serif;color:#f3ead6;font-variant-numeric:tabular-nums}
  .usw-foe-mana b i{font-style:normal;opacity:.6;font-size:.8em}

  /* —— 技能（图鉴法术块：暗色抬头 + 羊皮纸正文）—— */
  .usw-spell{flex:none;border:1px solid #87714b;background:#11101a;box-shadow:0 8px 20px rgba(0,0,0,.3)}
  .usw-spell-head{display:flex;align-items:center;gap:max(12px,calc(var(--pad) * .9));
    min-height:max(40px,calc(58px * var(--k)));padding:calc(var(--pad) * .4) var(--pad);
    background:linear-gradient(100deg,#24202c,#15131e 70%);border-bottom:1px solid #a38b56}
  .usw-spell-mark{position:relative;flex:none;width:max(28px,calc(44px * var(--k)));height:max(28px,calc(44px * var(--k)))}
  .usw-spell-mark::before{content:"";position:absolute;inset:0;border-radius:50%;
    background:radial-gradient(circle at 40% 30%,#fff3c1,#9e7438 54%,#3c2714);box-shadow:0 2px 5px rgba(0,0,0,.55)}
  .usw-spell-mark svg{position:absolute;inset:14%;width:72%;height:72%;filter:drop-shadow(0 2px 2px rgba(0,0,0,.55))}
  .usw-spell-mark b{position:absolute;right:-5px;bottom:-3px;z-index:2;min-width:max(16px,calc(20px * var(--k)));
    height:max(16px,calc(20px * var(--k)));padding:0 3px;display:grid;place-items:center;border-radius:999px;
    color:#f7e7c4;background:#1c2434;border:1px solid #dfc986;
    font:700 max(11px,calc(11px * var(--k)))/1 Georgia,serif;text-shadow:0 1px #000}
  .usw-spell-title{min-width:0}
  .usw-spell-title small{display:block;color:#9a8566;font-size:max(11px,calc(11px * var(--k)));letter-spacing:.2em}
  .usw-spell-title h3{margin:1px 0 0;color:#e9d39d;
    font:600 max(14px,calc(22px * var(--k)))/1.2 "Playfair Display","Noto Serif SC","Songti SC",Georgia,serif;overflow-wrap:anywhere}
  .usw-spell-body{padding:calc(var(--pad) * .75) var(--pad) calc(var(--pad) * .7);color:#3a2e20;
    background-color:#c8baa2;background-image:${noise};background-blend-mode:multiply;
    box-shadow:inset 0 0 0 1px rgba(74,56,28,.16),inset 0 1px 0 rgba(255,246,220,.22),inset 0 0 18px rgba(62,44,20,.08)}
  .usw-ink{display:flex;align-items:center;gap:9px;color:#6c5030;font-size:max(11px,calc(11px * var(--k)));letter-spacing:.16em}
  .usw-ink i{flex:1;height:1px;background:linear-gradient(90deg,transparent,#765b36)}
  .usw-ink i:last-child{transform:scaleX(-1)}
  .usw-copy{margin:calc(var(--pad) * .55) 0 0;color:#32281c;font-size:max(11px,calc(15px * var(--k)));line-height:1.65;overflow-wrap:anywhere}
  .usw-copy b{color:#6f1f2a;font-weight:700;font-variant-numeric:tabular-nums}
  .usw-copy.empty{color:#6c5a44;font-style:italic}
  .usw-target{display:flex;align-items:baseline;gap:8px;margin:calc(var(--pad) * .6) 0 0;padding-top:calc(var(--pad) * .5);
    border-top:1px solid rgba(128,102,67,.4);font-size:max(11px,calc(13px * var(--k)));line-height:1.45;color:#312a20}
  .usw-target span{flex:none;color:#78592f;letter-spacing:.12em}

  /* —— 当前状态 / 特质（图鉴特质列表）—— */
  .usw-heading{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:0 0 calc(var(--pad) * .5);
    color:#ecdbb7;font:600 max(13px,calc(19px * var(--k)))/1.2 "Playfair Display","Noto Serif SC","Songti SC",Georgia,serif}
  .usw-heading span{font:400 max(11px,calc(12px * var(--k)))/1.2 "Oswald","Microsoft YaHei",sans-serif;color:#bcb8b5}
  .usw-list{display:grid;gap:calc(var(--pad) * .45)}
  .usw-row{display:grid;grid-template-columns:max(22px,calc(36px * var(--k))) minmax(0,1fr);align-items:center;
    gap:calc(var(--pad) * .65);padding:calc(var(--pad) * .5) calc(var(--pad) * .7);
    border:1px solid #53524c;background:#1d1e25;box-shadow:inset 2px 0 rgba(121,116,89,.4)}
  .usw-row-ic{width:max(22px,calc(36px * var(--k)));height:max(22px,calc(36px * var(--k)));display:grid;place-items:center;
    filter:drop-shadow(0 1px 2px rgba(0,0,0,.95)) drop-shadow(0 0 4px rgba(0,0,0,.65))}
  .usw-row-ic svg,.usw-row-ic img{width:100%;height:100%;object-fit:contain;display:block}
  .usw-row-ic .status-icon-fallback{font:700 max(11px,calc(14px * var(--k)))/1 "Oswald",sans-serif;color:#cfd2d6}
  .usw-row h4{margin:0;color:#eee3d4;font:600 max(12px,calc(16px * var(--k)))/1.25 "Playfair Display","Noto Serif SC","Songti SC",Georgia,serif}
  .usw-row h4 em{font:400 max(11px,calc(12px * var(--k)))/1.2 "Oswald","Microsoft YaHei",sans-serif;font-style:normal;
    color:var(--sc,#d8c290);margin-left:8px;white-space:nowrap}
  .usw-row p{margin:3px 0 0;color:#c8c5c7;font-size:max(11px,calc(13px * var(--k)));line-height:1.45;overflow-wrap:anywhere}
  .usw-status{border-color:color-mix(in srgb,var(--sc,#d8c290) 45%,#3e3d39);
    box-shadow:inset 2px 0 color-mix(in srgb,var(--sc,#d8c290) 70%,transparent)}
  .usw-status .usw-row-ic{filter:drop-shadow(0 0 3px color-mix(in srgb,var(--sc,#d8c290) 60%,transparent))}
  .usw-trait.off{opacity:.55}
  .usw-trait.off h4{color:#b8ada0}
  .usw-trait-tag{display:inline-block;margin-left:6px;padding:0 5px;border:1px solid rgba(201,163,92,.5);border-radius:3px;
    font:400 max(11px,calc(11px * var(--k)))/1.5 "Oswald","Microsoft YaHei",sans-serif;color:#c9a35c;vertical-align:1px}
  .usw-empty{margin:0;color:#8a7c5c;font-size:max(11px,calc(12px * var(--k)));font-style:italic}
  @media (prefers-reduced-motion:reduce){.usw-cast{transition:none}}
  `;
  const style = document.createElement('style');
  style.id = 'usw-styles';
  style.textContent = css;
  document.head.appendChild(style);
}

/** 详情窗版式：按窗宽取比例系数与左栏卡宽，保证 2:3 立绘卡 + 按钮 + 复选框竖向放得下 */
export function unitSheetMetrics(width: number, height: number): {
  k: number; pad: number; cardW: number; compact: boolean;
} {
  const k = Math.max(0.3, Math.min(1.2, width / 768));
  const pad = Math.max(8, Math.round(16 * k));
  const bar = Math.max(28, 36 * k);
  const button = Math.max(32, 42 * k);
  const check = Math.max(22, 26 * k);
  const gap = pad * 0.6;
  const usableH = height - bar - pad * 2 - button - check - gap * 2;
  // 窄屏把宽度多留给右栏文字（右栏可滚动），宽屏让立绘卡更舒展
  const share = width < 520 ? 0.4 : 0.44;
  const cardW = Math.floor(Math.max(80, Math.min(width * share, (usableH / 1.5))));
  return { k: Math.round(k * 1000) / 1000, pad, cardW, compact: width < 520 };
}

/**
 * 部队详情窗 DOM 组件。一个实例常驻 wrapper，open() 切换内容、update() 就地刷新数值。
 * 非模态：不拦截窗外的任何输入。
 */
export class UnitSheet {
  private root: HTMLElement;
  private current: UnitSheetData | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  /** 结构签名：状态/特质/技能文本变化时整块重绘，数值只做就地更新 */
  private statusSig = '';
  private copySig = '';
  private headerSig = '';

  constructor(parent: HTMLElement, private handlers: UnitSheetHandlers) {
    ensureStyles();
    this.root = document.createElement('section');
    this.root.className = 'usw';
    this.root.dataset.testid = 'unit-sheet';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'false');
    parent.appendChild(this.root);
    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.usw-close')) {
        this.handlers.onClose();
      } else if (target.closest('.usw-cast')) {
        const button = target.closest('.usw-cast') as HTMLButtonElement;
        if (!button.disabled && this.current) this.handlers.onCast(this.current.charId);
      }
    });
    this.root.addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      if (input.classList.contains('usw-quick-box')) this.handlers.onQuickCast(input.checked);
    });
  }

  /** 覆盖区域（wrapper 布局坐标）：棋盘 + 上方 HUD 通道 */
  setBounds(b: UnitSheetBounds): void {
    const m = unitSheetMetrics(b.width, b.height);
    Object.assign(this.root.style, {
      left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px`,
    });
    this.root.style.setProperty('--k', String(m.k));
    this.root.style.setProperty('--pad', `${m.pad}px`);
    this.root.style.setProperty('--cw', `${m.cardW}px`);
    this.root.classList.toggle('compact', m.compact);
  }

  isOpen(): boolean {
    return this.root.classList.contains('open');
  }

  /** 当前展示的角色 id（未打开为 null） */
  get charId(): number | null {
    return this.isOpen() && this.current ? this.current.charId : null;
  }

  /** 打开或切换到某个角色（整窗重绘） */
  open(data: UnitSheetData, opts: { focus?: boolean } = {}): void {
    const wasOpen = this.isOpen();
    const switching = wasOpen && this.current?.charId !== data.charId;
    this.current = data;
    this.renderAll(data);
    if (!wasOpen) {
      this.root.classList.add('open');
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.root.animate(
          [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 160, easing: 'cubic-bezier(.2,.8,.25,1)' },
        );
      }
      this.keyHandler = (e: KeyboardEvent) => {
        if (e.key !== 'Escape' || !this.isOpen()) return;
        e.stopPropagation();
        this.handlers.onClose();
      };
      window.addEventListener('keydown', this.keyHandler);
    } else if (switching) {
      const body = this.root.querySelector('.usw-body');
      body?.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 140, easing: 'ease-out' });
    }
    if (opts.focus) {
      const target = this.root.querySelector<HTMLElement>('.usw-cast:not(:disabled)')
        ?? this.root.querySelector<HTMLElement>('.usw-close');
      target?.focus({ preventScroll: true });
    }
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
    const id = this.current?.charId;
    this.current = null;
    // 焦点在窗内时交还给对应的卡片（键盘用户不丢位置）
    if (hadFocus && id !== undefined) {
      document.querySelector<HTMLElement>(`[data-testid="card-${id}"]`)?.focus({ preventScroll: true });
    }
  }

  destroy(): void {
    this.close();
    this.root.remove();
  }

  // —— 渲染 ——

  private headerSigOf(d: UnitSheetData): string {
    return [d.charId, d.ally, d.name, d.portrait, d.typeLine, d.rarity, d.skillName, d.skillTag,
      d.colors.join(','), d.traits.map((t) => `${t.code}:${t.implemented}`).join(',')].join('|');
  }

  private renderAll(d: UnitSheetData): void {
    const nameId = `usw-name-${d.charId}`;
    this.root.setAttribute('aria-labelledby', nameId);
    this.root.dataset.side = d.ally ? 'ally' : 'enemy';
    this.root.dataset.charId = String(d.charId);
    const rarityStyle = d.rarityColor ? ` style="--rc:${d.rarityColor}"` : '';
    this.root.innerHTML = `
      <header class="usw-bar">
        <span class="usw-bar-title">部队详情<i>${d.ally ? '我方' : '敌方'}</i></span>
        <button class="usw-close" type="button" aria-label="关闭详情">✕</button>
      </header>
      <div class="usw-body">
        <div class="usw-left">
          <article class="usw-card"${rarityStyle}${d.rarity !== null ? ` data-rarity="${d.rarity}"` : ''}>
            <img class="usw-portrait" alt="" draggable="false">
            <div class="usw-shade" aria-hidden="true"></div>
            <div class="usw-gem" role="img"></div>
            <div class="usw-magic" role="img">${CARD_STAT_ICONS.magic}<b></b></div>
            <div class="usw-name"><h2 id="${nameId}">${esc(d.name)}</h2>${d.typeLine ? `<span class="usw-type">${esc(d.typeLine)}</span>` : ''}</div>
            <div class="usw-stats">
              <div class="st-atk" role="img">${CARD_STAT_ICONS.sword}<b></b></div>
              <div class="st-armor" role="img">${CARD_STAT_ICONS.shield}<b></b></div>
              <div class="st-hp" role="img">${CARD_STAT_ICONS.heart}<b></b></div>
            </div>
          </article>
          ${d.ally
            ? `<button class="usw-cast" type="button" data-testid="unit-sheet-cast">释放技能</button>
               <label class="usw-quick"><input type="checkbox" class="usw-quick-box" data-testid="unit-sheet-quick"><span>快速释放</span><small>点满法力角色直接施放</small></label>`
            : `<div class="usw-foe-mana" role="status"></div>`}
        </div>
        <div class="usw-info" tabindex="0" aria-label="技能与特质">
          <article class="usw-spell">
            <header class="usw-spell-head">
              <div class="usw-spell-mark" aria-hidden="true">${manaGemSvg(d.colors, 1)}<b>${d.shown.manaCost}</b></div>
              <div class="usw-spell-title"><small>技能 · 法力 ${d.shown.manaCost}</small><h3>${esc(d.skillName || '技能')}</h3></div>
            </header>
            <div class="usw-spell-body">
              <div class="usw-ink"><i></i><span>${esc(d.skillTag)}</span><i></i></div>
              <p class="usw-copy"></p>
              <p class="usw-target" hidden><span>目标</span><strong></strong></p>
            </div>
          </article>
          <section class="usw-statuses" hidden></section>
          <section class="usw-traits">${this.traitsHtml(d)}</section>
        </div>
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
    const full = s.manaCost > 0 && s.mana >= s.manaCost;
    card.classList.toggle('full', full);
    card.classList.toggle('defeated', s.defeated);
    const gem = card.querySelector('.usw-gem') as HTMLElement;
    const gemSig = `${s.mana}/${s.manaCost}`;
    if (gem.dataset.sig !== gemSig) {
      gem.dataset.sig = gemSig;
      gem.innerHTML = `${manaGemSvg(d.colors, s.manaCost > 0 ? s.mana / s.manaCost : 0)}<b class="usw-gem-count">${s.mana}<i>/${s.manaCost}</i></b>`;
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
    const foe = this.root.querySelector('.usw-foe-mana') as HTMLElement | null;
    if (foe) {
      const html = `${manaGemSvg(d.colors, s.manaCost > 0 ? s.mana / s.manaCost : 0)}<span>法力</span><b>${s.mana}<i> / ${s.manaCost}</i></b>`;
      if (foe.dataset.sig !== gemSig) {
        foe.dataset.sig = gemSig;
        foe.innerHTML = html;
        foe.setAttribute('aria-label', `法力 ${s.mana}/${s.manaCost}`);
      }
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

  private patchStatuses(d: UnitSheetData): void {
    const list = d.shown.statuses;
    const sig = list.map((s) => `${s.id}:${s.turns}:${s.magnitude ?? ''}`).join(',');
    if (sig === this.statusSig) return;
    this.statusSig = sig;
    const el = this.root.querySelector('.usw-statuses') as HTMLElement | null;
    if (!el) return;
    el.hidden = list.length === 0;
    if (!list.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = `<h3 class="usw-heading">当前状态<span>${list.length} 个</span></h3>
      <div class="usw-list">${list.map((s) => {
        const badge = statusBadge(s.id);
        const live = statusLiveLine(s);
        const desc = STATUS_DESCRIPTIONS[badge.label] ?? '效果未知。';
        return `<div class="usw-row usw-status" style="--sc:${badge.color}">
          <span class="usw-row-ic" aria-hidden="true">${statusBadgeIcon(s.id)}</span>
          <div><h4>${esc(badge.label)}${live ? `<em>${esc(live)}</em>` : ''}</h4><p>${esc(desc)}</p></div>
        </div>`;
      }).join('')}</div>`;
  }

  private traitsHtml(d: UnitSheetData): string {
    if (!d.traits.length) {
      return `<h3 class="usw-heading">特质</h3><p class="usw-empty">无特质</p>`;
    }
    const glyphs = traitCardGlyphs(d.traits.map((t) => t.code), d.traitNames, d.name, 2);
    const on = d.traits.filter((t) => t.implemented).length;
    return `<h3 class="usw-heading">特质<span>${on} / ${d.traits.length} 生效</span></h3>
      <div class="usw-list">${d.traits.map((t, i) => `<div class="usw-row usw-trait${t.implemented ? '' : ' off'}">
          <span class="usw-row-ic" aria-hidden="true">${glyphs[i]?.svg ?? ''}</span>
          <div><h4>${esc(t.name)}${t.implemented ? '' : '<span class="usw-trait-tag">本场不生效</span>'}</h4>
          <p>${esc(t.description || '暂无描述。')}</p></div>
        </div>`).join('')}</div>`;
  }
}
