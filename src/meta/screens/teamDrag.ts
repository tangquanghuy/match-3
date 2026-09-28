/**
 * 编队页的指针拖拽（鼠标 / 触屏 / 笔统一走 Pointer Events）。
 *
 *  - 鼠标、笔：按下后移动超过 6px 即开始拖拽；没移动就是普通点击（单击查看 / 双击编入照旧）；
 *  - 触屏：按住约 0.22 秒不动才进入拖拽，期间一挪动就当成滚动页面（手机上名册要能滑）；
 *  - 拖拽中用 fixed 定位的「幽灵卡」跟手，elementFromPoint 做命中（与舞台缩放无关）；
 *  - 放下后吞掉紧随的那次 click，避免「拖完又触发一次点选」。
 */
export interface DragSource {
  kind: 'roster' | 'slot';
  /** 名册键（'hero' 或 troopId 字符串） */
  key: string;
  /** 槽位来源的序号 */
  index?: number;
  el: HTMLElement;
}

export type DropTarget = { kind: 'slot'; index: number; el: HTMLElement } | { kind: 'out'; el: HTMLElement };

export interface DragOptions {
  source(target: HTMLElement): DragSource | null;
  resolve(x: number, y: number, src: DragSource): DropTarget | null;
  drop(src: DragSource, target: DropTarget): void;
  start?(src: DragSource): void;
  end?(): void;
}

const MOUSE_THRESHOLD = 6;
const TOUCH_HOLD_MS = 220;
const TOUCH_SLOP = 10;
/** 拖到滚动区上下边缘这么近时开始自动滚动（手机上槽位/名册常在屏幕外） */
const EDGE_PX = 64;
const EDGE_MAX_SPEED = 18;

/** 找到最近的可纵向滚动祖先；找不到就用文档本身 */
function scrollerOf(el: HTMLElement): HTMLElement {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

export class TeamDrag {
  private pending: { src: DragSource; x: number; y: number; id: number; touch: boolean; timer: number } | null = null;
  private active: { src: DragSource; id: number; ghost: HTMLElement; dx: number; dy: number; target: DropTarget | null } | null = null;
  private suppressClick = false;
  private readonly off: Array<() => void> = [];
  private scroller: HTMLElement | null = null;
  private last = { x: 0, y: 0 };
  private raf = 0;

  constructor(private readonly root: HTMLElement, private readonly opts: DragOptions) {}

  attach(): void {
    this.listen(this.root, 'pointerdown', (e) => this.onDown(e as PointerEvent));
    this.listen(window, 'pointermove', (e) => this.onMove(e as PointerEvent));
    this.listen(window, 'pointerup', (e) => this.onUp(e as PointerEvent));
    this.listen(window, 'pointercancel', () => this.cancel());
    this.listen(this.root, 'dragstart', (e) => e.preventDefault());
    // 拖拽中阻止触屏滚动（必须是非 passive 监听）
    this.listen(this.root, 'touchmove', (e) => {
      if (this.active) e.preventDefault();
    }, { passive: false });
    // 放下后吞掉紧随的 click（捕获阶段，先于卡片自己的点击处理）
    this.listen(this.root, 'click', (e) => {
      if (!this.suppressClick) return;
      this.suppressClick = false;
      e.stopPropagation();
      e.preventDefault();
    }, { capture: true });
    this.listen(this.root, 'contextmenu', (e) => {
      if (this.pending?.touch || this.active) e.preventDefault();
    });
  }

  get dragging(): boolean {
    return this.active !== null;
  }

  private listen(target: EventTarget, type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void {
    target.addEventListener(type, fn, opts);
    this.off.push(() => target.removeEventListener(type, fn, opts));
  }

  private onDown(e: PointerEvent): void {
    if (this.active || this.pending) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.target as HTMLElement;
    // 槽位上的小按钮（换位/卸下）不参与拖拽
    if (target.closest('.slot-op, input, select, textarea')) return;
    const src = this.opts.source(target);
    if (!src) return;
    const touch = e.pointerType === 'touch';
    const timer = touch ? window.setTimeout(() => this.activate(e.clientX, e.clientY), TOUCH_HOLD_MS) : 0;
    this.pending = { src, x: e.clientX, y: e.clientY, id: e.pointerId, touch, timer };
  }

  private onMove(e: PointerEvent): void {
    if (this.pending && e.pointerId === this.pending.id && !this.active) {
      const dist = Math.hypot(e.clientX - this.pending.x, e.clientY - this.pending.y);
      if (this.pending.touch) {
        if (dist > TOUCH_SLOP) this.clearPending(); // 在滚动，不是拖拽
        return;
      }
      if (dist > MOUSE_THRESHOLD) this.activate(e.clientX, e.clientY);
    }
    if (!this.active || e.pointerId !== this.active.id) return;
    e.preventDefault();
    this.last = { x: e.clientX, y: e.clientY };
    this.moveGhost(e.clientX, e.clientY);
    this.setTarget(this.opts.resolve(e.clientX, e.clientY, this.active.src));
    this.kickEdgeScroll();
  }

  /** 靠近滚动区上/下边缘时逐帧滚动，并按新位置重新命中 */
  private kickEdgeScroll(): void {
    if (this.raf || !this.active) return;
    const step = (): void => {
      this.raf = 0;
      if (!this.active || !this.scroller) return;
      const sc = this.scroller;
      const isDoc = sc === document.scrollingElement || sc === document.documentElement;
      const r = isDoc ? { top: 0, bottom: window.innerHeight } : sc.getBoundingClientRect();
      const top = Math.max(r.top, 0);
      const bottom = Math.min(r.bottom, window.innerHeight);
      const { x, y } = this.last;
      let v = 0;
      if (y < top + EDGE_PX) v = -Math.ceil(((top + EDGE_PX - y) / EDGE_PX) * EDGE_MAX_SPEED);
      else if (y > bottom - EDGE_PX) v = Math.ceil(((y - (bottom - EDGE_PX)) / EDGE_PX) * EDGE_MAX_SPEED);
      if (!v) return;
      const before = sc.scrollTop;
      sc.scrollTop = before + Math.max(-EDGE_MAX_SPEED, Math.min(EDGE_MAX_SPEED, v));
      if (sc.scrollTop === before) return; // 已到尽头
      this.setTarget(this.opts.resolve(x, y, this.active.src));
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  private onUp(e: PointerEvent): void {
    if (this.pending && !this.active) {
      this.clearPending();
      return;
    }
    if (!this.active || e.pointerId !== this.active.id) return;
    const { src } = this.active;
    const target = this.opts.resolve(e.clientX, e.clientY, src);
    this.teardown();
    this.suppressClick = true;
    window.setTimeout(() => (this.suppressClick = false), 0);
    if (target) this.opts.drop(src, target);
  }

  private activate(x: number, y: number): void {
    const p = this.pending;
    if (!p) return;
    clearTimeout(p.timer);
    this.pending = null;
    const rect = p.src.el.getBoundingClientRect();
    const w = Math.min(rect.width, 150);
    const h = Math.min(rect.height, 190);
    const ghost = document.createElement('div');
    ghost.className = 'team-drag-ghost';
    ghost.style.width = `${w}px`;
    ghost.style.height = `${h}px`;
    const img = p.src.el.querySelector('img');
    ghost.innerHTML = img ? `<img src="${img.getAttribute('src') ?? ''}" alt="">` : '';
    const label = p.src.el.querySelector('.slot-foot b, .mini-shade b')?.textContent ?? '';
    if (label) {
      const b = document.createElement('b');
      b.textContent = label;
      ghost.appendChild(b);
    }
    document.body.appendChild(ghost);
    // 长按/拖动过程中浏览器可能已经开始选中文字，这里清掉
    document.getSelection()?.removeAllRanges();
    const dx = w / 2;
    const dy = h * 0.4;
    this.active = { src: p.src, id: p.id, ghost, dx, dy, target: null };
    this.scroller = scrollerOf(p.src.el);
    this.last = { x, y };
    p.src.el.classList.add('drag-src');
    this.root.classList.add('drag-active', `drag-from-${p.src.kind}`);
    this.moveGhost(x, y);
    this.opts.start?.(p.src);
    if (navigator.vibrate && p.touch) navigator.vibrate(12);
  }

  private moveGhost(x: number, y: number): void {
    if (!this.active) return;
    this.active.ghost.style.transform = `translate(${x - this.active.dx}px, ${y - this.active.dy}px) rotate(-3deg)`;
  }

  private setTarget(target: DropTarget | null): void {
    if (!this.active) return;
    const prev = this.active.target;
    if (prev?.el === target?.el) return;
    prev?.el.classList.remove('drop-hover');
    target?.el.classList.add('drop-hover');
    this.active.target = target;
    this.active.ghost.classList.toggle('will-remove', target?.kind === 'out');
  }

  private clearPending(): void {
    if (this.pending) clearTimeout(this.pending.timer);
    this.pending = null;
  }

  private teardown(): void {
    if (!this.active) return;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.scroller = null;
    this.active.target?.el.classList.remove('drop-hover');
    this.active.src.el.classList.remove('drag-src');
    this.active.ghost.remove();
    this.root.classList.remove('drag-active', 'drag-from-roster', 'drag-from-slot');
    this.active = null;
    this.opts.end?.();
  }

  cancel(): void {
    this.clearPending();
    this.teardown();
  }

  detach(): void {
    this.cancel();
    for (const off of this.off.splice(0)) off();
  }
}
