import { FederatedPointerEvent } from 'pixi.js';
import { gsap } from 'gsap';
import type { CellPos } from '@engine/types';
import { BoardModel } from '@engine/BoardModel';
import { BoardView } from './BoardView';
import { AnimConfig } from './AnimationConfig';
import type { GemSprite } from './GemSprite';

/**
 * 输入控制器（需求 22, 4.4, 4.5）。
 * 拖拽时宝石实时跟手，相邻宝石做预交换预览；
 * 释放按位移阈值判定交换或弹性归位。也支持两步点选。
 */
export class InputController {
  onSwapRequest: ((a: CellPos, b: CellPos) => void) | null = null;
  /** 拖拽/选中开始时触发，用于停止待机动画 */
  onInteractStart: (() => void) | null = null;
  /** 交互结束但未发起交换（归位）时触发，用于恢复待机动画 */
  onInteractEnd: (() => void) | null = null;
  enabled = true;

  private dragging = false;
  private startCell: CellPos | null = null;
  private startCenter = { x: 0, y: 0 };
  private grabOffset = { x: 0, y: 0 };
  private heldSprite: GemSprite | null = null;

  /**
   * 单轴跟随模型：宝石永远只在主轴上偏离中心。
   * heldOffset = 宝石当前沿主轴的有符号偏移；targetOffset = 手指（阻尼后）期望偏移。
   * 每帧 heldOffset 以速度上限朝 targetOffset 逼近，非主轴坐标恒等于中心。
   * 这样结构上不可能斜向，也不会有折返/闪烁。
   */
  private targetOffset = 0;
  private heldOffset = 0;
  private following = false;
  /** 当前拖拽主轴：'h' 横向 / 'v' 纵向 / null 未定 */
  private dragAxis: 'h' | 'v' | null = null;
  /** 待切换到的新主轴：先沿旧轴滑回中心，归零后再切换 */
  private pendingAxis: 'h' | 'v' | null = null;
  private followTick = (time: number, deltaMs: number) => this.onFollowTick(time, deltaMs);

  /** 当前预览中的相邻宝石及其原位 */
  private previewSprite: GemSprite | null = null;
  private previewHome = { x: 0, y: 0 };
  private previewCell: CellPos | null = null;

  private selected: CellPos | null = null;

  constructor(private board: BoardView) {
    board.eventMode = 'static';
    board.hitArea = { contains: () => true } as unknown as BoardView['hitArea'];
    board.on('pointerdown', this.onDown, this);
    board.on('pointermove', this.onMove, this);
    board.on('pointerup', this.onUp, this);
    board.on('pointerupoutside', this.onUp, this);
  }

  private localPos(e: FederatedPointerEvent): { x: number; y: number } {
    return this.board.toLocal(e.global);
  }

  private spriteAt(pos: CellPos): GemSprite | null {
    const { x, y } = this.board.cellCenter(pos);
    for (const child of this.board.layer.children) {
      const s = child as GemSprite;
      if (Math.abs(s.x - x) < 1 && Math.abs(s.y - y) < 1) return s;
    }
    return null;
  }

  private onDown(e: FederatedPointerEvent): void {
    if (!this.enabled) return;
    const p = this.localPos(e);
    const cell = this.board.pixelToCell(p.x, p.y);
    if (!cell) return;

    // 两步点选：已有选中且点选相邻 → 交换
    if (this.selected && this.isAdjacent(this.selected, cell)) {
      this.onSwapRequest?.(this.selected, cell);
      this.clearSelection();
      return;
    }

    const sprite = this.spriteAt(cell);
    if (!sprite) return;

    this.onInteractStart?.();
    this.dragging = true;
    this.startCell = cell;
    this.startCenter = this.board.cellCenter(cell);
    this.grabOffset = { x: p.x - sprite.x, y: p.y - sprite.y };
    this.heldSprite = sprite;
    this.dragAxis = null;
    this.pendingAxis = null;
    this.targetOffset = 0;
    this.heldOffset = 0;
    this.startFollow();
    // 提到顶层，避免被其它宝石遮挡
    this.board.layer.setChildIndex(sprite, this.board.layer.children.length - 1);
    this.setSelection(cell);
  }

  private onMove(e: FederatedPointerEvent): void {
    if (!this.enabled || !this.dragging || !this.startCell || !this.heldSprite) return;
    const p = this.localPos(e);

    // 相对起点中心的原始位移
    let rawX = p.x - this.grabOffset.x - this.startCenter.x;
    let rawY = p.y - this.grabOffset.y - this.startCenter.y;

    const cell = this.board.cellSize;
    // 主轴判定
    let dir: CellPos;
    let raw: number;
    let horizontal: boolean;
    if (Math.abs(rawX) > Math.abs(rawY)) {
      horizontal = true;
      raw = rawX;
      dir = { row: 0, col: rawX >= 0 ? 1 : -1 };
    } else {
      horizontal = false;
      raw = rawY;
      dir = { row: rawY >= 0 ? 1 : -1, col: 0 };
    }

    const axis: 'h' | 'v' = horizontal ? 'h' : 'v';

    // 首次确定主轴
    if (this.dragAxis === null) {
      this.dragAxis = axis;
    }

    // 阻尼映射：起步发涩（小位移被压缩），接近一格时趋近线性，最多一格。
    const damped = this.applyDamping(Math.abs(raw), cell) * Math.sign(raw);

    if (axis === this.dragAxis) {
      // 与当前主轴一致：正常设目标偏移，取消任何待切换
      this.pendingAxis = null;
      this.targetOffset = damped;
    } else {
      // 想换轴（如先右后下）：先让宝石沿旧轴滑回中心（targetOffset=0），
      // 归零后由 onFollowTick 完成切换。期间立即清掉旧预览，避免来回跳。
      this.pendingAxis = axis;
      this.targetOffset = 0;
      this.clearPreviewImmediate();
      return;
    }

    const target: CellPos = {
      row: this.startCell.row + dir.row,
      col: this.startCell.col + dir.col,
    };
    // 预览幅度跟随宝石实际偏移（而非目标），与阻尼后的视觉一致
    this.updatePreview(target, dir, Math.abs(this.heldOffset));
  }

  /** 启动逐帧跟随循环 */
  private startFollow(): void {
    if (this.following) return;
    this.following = true;
    gsap.ticker.add(this.followTick);
  }

  private stopFollow(): void {
    if (!this.following) return;
    this.following = false;
    gsap.ticker.remove(this.followTick);
  }

  /**
   * 每帧把宝石沿主轴朝目标偏移逼近：纯速度上限（匀速）。
   * 非主轴坐标恒等于中心（瞬时、不滞后），结构上不可能斜向。
   * 慢拖时一步到位即完全跟手；快甩时以 maxSpeed 匀速滞后追赶。
   * deltaMs 来自 GSAP ticker，保证不同帧率下速度一致（需求 24.5）。
   */
  private onFollowTick(_time: number, deltaMs: number): void {
    const sprite = this.heldSprite;
    if (!sprite || this.dragAxis === null) return;
    const cfg = AnimConfig.dragFollow;
    const cell = this.board.cellSize;

    // 沿主轴朝 targetOffset 匀速逼近，本帧最多走 maxSpeed 格/秒对应距离
    const delta = this.targetOffset - this.heldOffset;
    const maxStep = cfg.maxSpeed * cell * (deltaMs / 1000);
    if (Math.abs(delta) <= maxStep) {
      this.heldOffset = this.targetOffset;
    } else {
      this.heldOffset += Math.sign(delta) * maxStep;
    }

    // 待切换主轴：宝石沿旧轴滑回中心（heldOffset≈0）后，切到新轴
    if (this.pendingAxis !== null && Math.abs(this.heldOffset) < 0.5) {
      this.heldOffset = 0;
      this.dragAxis = this.pendingAxis;
      this.pendingAxis = null;
    }

    // 应用为单轴位置：非主轴恒为中心
    if (this.dragAxis === 'h') {
      sprite.x = this.startCenter.x + this.heldOffset;
      sprite.y = this.startCenter.y;
    } else {
      sprite.x = this.startCenter.x;
      sprite.y = this.startCenter.y + this.heldOffset;
    }

    this.syncPreview(cell);
  }

  /** 跟随推进时同步刷新预览幅度 */
  private syncPreview(cell: number): void {
    const sprite = this.heldSprite;
    if (!sprite || !this.previewSprite || !this.previewCell) return;
    const t = Math.min(1, Math.abs(this.heldOffset) / cell);
    this.previewSprite.x = this.previewHome.x + (this.startCenter.x - this.previewHome.x) * t;
    this.previewSprite.y = this.previewHome.y + (this.startCenter.y - this.previewHome.y) * t;
  }

  /**
   * 阻尼曲线：输入原始位移绝对值，输出 [0, cell] 的实际位移。
   * 起步明显发涩（要明确拖动才动），中段加速跟手，末端收敛到一格。
   */
  private applyDamping(rawAbs: number, cell: number): number {
    const t = Math.min(1, rawAbs / (cell * 1.35)); // 需要拖更多才到满格，整体更"重"
    // 三次 ease-in，起步段位移被大幅压缩
    const eased = t * t * t * (t * (t * 6 - 15) + 10); // smootherstep（更平滑、起步更涩）
    // 前 18% 几乎不动，制造明显的起步迟滞
    const gated = t < 0.18 ? eased * 0.25 : eased;
    return gated * cell;
  }

  /** 让相邻宝石朝被拖宝石原位反向滑动，做预交换预览 */
  private updatePreview(target: CellPos, _dir: CellPos, moveMag: number): void {
    if (!BoardModel.inBounds(target)) {
      this.restorePreview();
      return;
    }
    // 切换了预览目标 → 先把旧的复位
    if (this.previewCell && (this.previewCell.row !== target.row || this.previewCell.col !== target.col)) {
      this.restorePreview();
    }
    if (!this.previewSprite) {
      const s = this.spriteAt(target);
      if (!s) return;
      this.previewSprite = s;
      this.previewHome = { x: s.x, y: s.y };
      this.previewCell = target;
    }
    // 相邻宝石朝被拖宝石的原位移动，幅度跟随手指位移比例
    const t = Math.min(1, moveMag / this.board.cellSize);
    this.previewSprite.x = this.previewHome.x + (this.startCenter.x - this.previewHome.x) * t;
    this.previewSprite.y = this.previewHome.y + (this.startCenter.y - this.previewHome.y) * t;
  }

  private restorePreview(): void {
    if (this.previewSprite) {
      gsap.to(this.previewSprite, {
        x: this.previewHome.x,
        y: this.previewHome.y,
        duration: 0.12,
        ease: 'power2.out',
      });
    }
    this.previewSprite = null;
    this.previewCell = null;
  }

  /** 立即把预览宝石复位到原位（无补间），用于换轴瞬间，避免与跟随产生来回跳 */
  private clearPreviewImmediate(): void {
    if (this.previewSprite) {
      gsap.killTweensOf(this.previewSprite);
      this.previewSprite.x = this.previewHome.x;
      this.previewSprite.y = this.previewHome.y;
    }
    this.previewSprite = null;
    this.previewCell = null;
  }

  private onUp(e: FederatedPointerEvent): void {
    if (!this.dragging || !this.startCell || !this.heldSprite) {
      this.dragging = false;
      this.stopFollow();
      return;
    }
    this.stopFollow();
    const p = this.localPos(e);
    const rawX = p.x - this.grabOffset.x - this.startCenter.x;
    const rawY = p.y - this.grabOffset.y - this.startCenter.y;
    const cell = this.board.cellSize;
    const threshold = cell * AnimConfig.dragThreshold;

    // 用阻尼后的可视位移来判定，使触发与玩家看到的一致
    let dir: CellPos | null = null;
    if (Math.abs(rawX) > Math.abs(rawY)) {
      const damped = this.applyDamping(Math.abs(rawX), cell);
      if (damped > threshold) dir = { row: 0, col: rawX > 0 ? 1 : -1 };
    } else {
      const damped = this.applyDamping(Math.abs(rawY), cell);
      if (damped > threshold) dir = { row: rawY > 0 ? 1 : -1, col: 0 };
    }

    const held = this.heldSprite;
    const home = this.startCenter;
    const start = this.startCell;
    this.dragging = false;
    this.heldSprite = null;

    if (dir) {
      const target: CellPos = { row: start.row + dir.row, col: start.col + dir.col };
      if (BoardModel.inBounds(target)) {
        // 越过阈值：保持宝石在当前拖拽位置，不复位，交给事件流接管动画。
        // 合法 → 从当前位置补完交换；非法 → 从当前位置直接弹回原位（单程）。
        // 仅清除预览引用，不触发归位动画（避免与事件流动画打架）。
        this.previewSprite = null;
        this.previewCell = null;
        this.clearSelection();
        this.onSwapRequest?.(start, target);
        return;
      }
    }

    // 未过阈值：弹性归位（需求 22.3）
    gsap.to(held, { x: home.x, y: home.y, duration: 0.25, ease: 'back.out(2.5)' });
    this.restorePreview();
    this.onInteractEnd?.();
    // 保留选中态用于两步点选
  }

  private isAdjacent(a: CellPos, b: CellPos): boolean {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
  }

  private setSelection(cell: CellPos): void {
    this.selected = cell;
  }

  private clearSelection(): void {
    this.selected = null;
  }
}
