/**
 * 竖屏战斗布局解算（纯函数，node 可测）。
 *
 * 自上而下：顶栏（控制按钮）→ 敌方卡行 → 回合横幅通道 → 8×8 棋盘 → 我方卡行。
 * 棋盘吃满可用宽度；卡片在同一行均分宽度，高度按统一纵横比裁切（立绘纵向裁切，
 * 以布局为先），剩余高度先让回合横幅长到自然高度，再上下均分为外边距。
 */
import { BoardModel } from '@engine/BoardModel';

/** 与横屏共用的棋盘上方 HUD 通道高度（横幅金冠 + 风暴指示器所在） */
export const PORTRAIT_LANE = 44;
/** 顶栏高度（44px 触控按钮） */
export const PORTRAIT_BAR = 44;
/** 屏幕外沿留白：回合指示横线外挂 5px，需要这点空间 */
export const PORTRAIT_PAD = 6;
/** 卡行与相邻元素的竖向间距 */
export const PORTRAIT_ROW_GAP = 6;
/** 同行卡片间距 */
export const PORTRAIT_CARD_GAP = 6;
/** 卡片高/宽下限：横屏基准卡 142×164 的比例 */
export const PORTRAIT_MIN_RATIO = 164 / 142;
/** 卡片高/宽上限：超过就统一纵向裁切立绘，避免卡片细长 */
export const PORTRAIT_MAX_RATIO = 1.4;

export interface PortraitLayout {
  /** 舞台逻辑尺寸（= 挂载容器可用尺寸，缩放 ≈1） */
  width: number;
  height: number;
  teamSize: number;
  cellSize: number;
  gridPx: number;
  boardLeft: number;
  boardTop: number;
  barTop: number;
  enemyTop: number;
  allyTop: number;
  /** 卡行左沿与可用行宽（卡片在行内居中） */
  rowLeft: number;
  rowWidth: number;
  cardW: number;
  cardH: number;
  /** 回合横幅可占用的最高位置（敌方卡行下沿 + 间距） */
  bannerTopLimit: number;
}

/** 按挂载容器可用尺寸解算竖屏布局 */
export function solvePortraitLayout(availW: number, availH: number, teamSize: number): PortraitLayout {
  const W = Math.max(1, Math.floor(availW));
  const H = Math.max(1, Math.floor(availH));
  const n = Math.max(1, teamSize);
  const rowWidth = W - PORTRAIT_PAD * 2;
  const cardW = Math.max(40, Math.floor(Math.min(180, (rowWidth - PORTRAIT_CARD_GAP * (n - 1)) / n)));
  const fixed = PORTRAIT_PAD + PORTRAIT_BAR + PORTRAIT_ROW_GAP // 顶栏
    + PORTRAIT_ROW_GAP + PORTRAIT_LANE // 敌方卡行 → 横幅通道
    + PORTRAIT_ROW_GAP + PORTRAIT_PAD; // 棋盘 → 我方卡行 → 底边
  const minH = Math.round(cardW * PORTRAIT_MIN_RATIO);
  const maxH = Math.round(cardW * PORTRAIT_MAX_RATIO);

  let cell = Math.max(40, Math.min(96, Math.floor(rowWidth / BoardModel.COLS)));
  const cardSpace = (c: number) => Math.floor((H - fixed - c * BoardModel.COLS) / 2);
  // 卡片矮于横屏基准比例时先缩格子（下限 40，同横屏）
  while (cardSpace(cell) < minH && cell > 40) cell -= 1;
  const gridPx = cell * BoardModel.COLS;
  const cardH = Math.max(Math.min(minH, cardSpace(cell)), Math.min(maxH, cardSpace(cell)));

  // 剩余高度：先给回合横幅（长到素材自然高度），再上下均分
  let slack = Math.max(0, H - fixed - gridPx - cardH * 2);
  const dip = Math.round(cell * 0.42);
  const naturalBanner = Math.round((gridPx * 310) / 1425);
  const bannerRoom = PORTRAIT_ROW_GAP + PORTRAIT_LANE + dip;
  const bannerGrow = Math.min(slack, Math.max(0, naturalBanner - bannerRoom));
  slack -= bannerGrow;
  const margin = Math.floor(slack / 2);

  const barTop = margin + PORTRAIT_PAD;
  const enemyTop = barTop + PORTRAIT_BAR + PORTRAIT_ROW_GAP;
  const bannerTopLimit = enemyTop + cardH + PORTRAIT_ROW_GAP;
  const boardTop = bannerTopLimit + bannerGrow + PORTRAIT_LANE;
  const allyTop = boardTop + gridPx + PORTRAIT_ROW_GAP;
  return {
    width: W,
    height: H,
    teamSize: n,
    cellSize: cell,
    gridPx,
    boardLeft: Math.round((W - gridPx) / 2),
    boardTop,
    barTop,
    enemyTop,
    allyTop,
    rowLeft: PORTRAIT_PAD,
    rowWidth,
    cardW,
    cardH,
    bannerTopLimit,
  };
}

/** 行内卡宽：槽位数变化（召唤/阵亡空位）时按行宽均分，封顶解算出的卡宽 */
export function portraitRowCardWidth(rowWidth: number, slots: number, gap = PORTRAIT_CARD_GAP, maxW = Infinity): number {
  const s = Math.max(1, slots);
  return Math.max(40, Math.floor(Math.min(maxW, 180, (rowWidth - gap * (s - 1)) / s)));
}
