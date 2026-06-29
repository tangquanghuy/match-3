import { Container, Graphics } from 'pixi.js';
import { BoardModel } from '@engine/BoardModel';
import type { CellPos, Gem } from '@engine/types';
import { GemSprite } from './GemSprite';
import { GemSpritePool } from './GemSpritePool';

/**
 * 棋盘视图（需求 9）。
 * 负责网格背景、坐标↔像素换算、按 gemId 索引管理精灵。
 */
export class BoardView extends Container {
  readonly cellSize: number;
  readonly gridPixels: number;
  private gemLayer: Container;
  private pool: GemSpritePool;
  /** gemId -> sprite 映射，下落追踪依赖此 */
  private sprites = new Map<number, GemSprite>();

  constructor(cellSize: number) {
    super();
    this.cellSize = cellSize;
    this.gridPixels = cellSize * BoardModel.COLS;
    this.pool = new GemSpritePool(cellSize);

    // 背景棋盘格：弱化的"格位凹槽"风格。
    // 双色对比压到极低，让网格退成背景肌理；每格内嵌一个圆角暗槽，
    // 宝石像嵌在槽里，深色宝石靠"槽 vs 宝石"的微立体关系浮出来。
    const bg = new Graphics();
    // 统一暗底（略带蓝紫，呼应奇幻夜色）
    bg.rect(0, 0, this.gridPixels, this.gridPixels).fill(0x14141f);
    const inset = cellSize * 0.06;
    const socket = cellSize - inset * 2;
    const radius = cellSize * 0.16;
    for (let r = 0; r < BoardModel.ROWS; r++) {
      for (let c = 0; c < BoardModel.COLS; c++) {
        // 极低对比的交替（仅作肌理，不抢宝石）
        const dark = (r + c) % 2 === 0;
        bg.roundRect(
          c * cellSize + inset,
          r * cellSize + inset,
          socket,
          socket,
          radius,
        ).fill(dark ? 0x191926 : 0x1d1d2c);
        // 槽的内描边：上沿暗、整体一圈淡线，营造下沉凹陷感
        bg.roundRect(
          c * cellSize + inset,
          r * cellSize + inset,
          socket,
          socket,
          radius,
        ).stroke({ width: 1, color: 0x0c0c14, alpha: 0.9 });
      }
    }
    // 外框：低调暗描边，不再用亮蓝
    bg.rect(0, 0, this.gridPixels, this.gridPixels).stroke({ width: 2, color: 0x2a2a40 });
    this.addChild(bg);

    this.gemLayer = new Container();
    this.addChild(this.gemLayer);
  }

  /** 格子中心的像素坐标 */
  cellCenter(pos: CellPos): { x: number; y: number } {
    return {
      x: pos.col * this.cellSize + this.cellSize / 2,
      y: pos.row * this.cellSize + this.cellSize / 2,
    };
  }

  /** 像素坐标 → 格子坐标（用于输入命中），越界返回 null */
  pixelToCell(x: number, y: number): CellPos | null {
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    const pos = { row, col };
    return BoardModel.inBounds(pos) ? pos : null;
  }

  /** 从棋盘模型全量重建精灵（初始化用） */
  syncFromBoard(board: BoardModel): void {
    for (const s of this.sprites.values()) this.pool.release(s);
    this.sprites.clear();
    board.forEach((gem, pos) => {
      if (gem) this.addGem(gem, pos);
    });
  }

  addGem(gem: Gem, pos: CellPos): GemSprite {
    const sprite = this.pool.acquire(gem.id, gem.type);
    const { x, y } = this.cellCenter(pos);
    sprite.x = x;
    sprite.y = y;
    this.gemLayer.addChild(sprite);
    this.sprites.set(gem.id, sprite);
    return sprite;
  }

  getSprite(gemId: number): GemSprite | undefined {
    return this.sprites.get(gemId);
  }

  /** 取某格当前的精灵（按位置反查） */
  spriteAtCell(pos: CellPos): GemSprite | undefined {
    const { x, y } = this.cellCenter(pos);
    for (const child of this.gemLayer.children) {
      const s = child as GemSprite;
      if (Math.abs(s.x - x) < 1 && Math.abs(s.y - y) < 1) return s;
    }
    return undefined;
  }

  removeGem(gemId: number): void {
    const s = this.sprites.get(gemId);
    if (s) {
      this.pool.release(s);
      this.sprites.delete(gemId);
    }
  }

  get layer(): Container {
    return this.gemLayer;
  }
}
