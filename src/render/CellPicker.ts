/**
 * 选宝石格瞄准器（技能编写与演出 · 需求 2B.3）。
 *
 * 与 TargetPicker 同一套视觉语言：从施法者卡拉出暖金能量光束指向鼠标；光束末端是锁定准星。
 * 鼠标移到棋盘上时，准星吸附到所在格中心、该格高亮描边；点格确认，点棋盘外 / Esc / 右键取消。
 *
 * 复用 BoardView 的 cellCenter/pixelToCell 换算；准星/光束绘制在传入的 overlayParent（wrapper）。
 */
import { BoardModel } from '@engine/BoardModel';
import type { CellPos } from '@engine/types';
import type { CharacterCard } from './TeamView';

const NS = 'http://www.w3.org/2000/svg';

let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
  .cellaim-overlay{position:absolute;left:0;top:0;z-index:1200;pointer-events:none;overflow:visible}
  .cellaim-overlay .beam{fill:none;stroke:url(#cellBeamGrad);stroke-width:4;stroke-linecap:round;
    stroke-dasharray:3 14;filter:url(#cellGlow);animation:cellFlow .5s linear infinite}
  @keyframes cellFlow{to{stroke-dashoffset:-17}}
  .cellaim-overlay .beam-core{fill:none;stroke:rgba(255,248,232,.9);stroke-width:1.4;stroke-linecap:round;
    stroke-dasharray:1 16;animation:cellFlow .5s linear infinite}
  .cellaim-overlay .origin{fill:none;stroke:#e6c979;stroke-width:2;filter:url(#cellGlow);
    animation:cellOriginPulse 1.1s ease-out infinite}
  @keyframes cellOriginPulse{0%{r:6;opacity:.9}100%{r:18;opacity:0}}
  .cellaim-overlay .reticle .ring{fill:none;stroke:#e6c979;stroke-width:2}
  .cellaim-overlay .reticle .bracket{fill:none;stroke:#f4e6bf;stroke-width:2.5;stroke-linecap:round}
  .cellaim-overlay .reticle .dot{fill:#fff3d6}
  .cellaim-overlay.locked .beam{stroke:url(#cellBeamGradLock)}
  .cellaim-overlay.locked .reticle .ring{stroke:#ffd089}
  .cellaim-overlay.invalid .beam{stroke:#d66d62}
  .cellaim-overlay.invalid .reticle .ring,.cellaim-overlay.invalid .reticle .bracket{stroke:#f08a7d}
  /* B-11（UX 阶段 B）：选择层此前零文案——玩家突然进入一个"必须点棋盘"的状态，
     棋盘上没有一句话说明要点什么（选颜色？选要炸的格子？），也没人告诉他 Esc 能退。 */
  .cellaim-hint{position:absolute;left:50%;top:10px;z-index:1210;transform:translateX(-50%);
    max-width:86%;padding:7px 14px;border-radius:7px;pointer-events:none;text-align:center;
    background:rgba(10,8,6,.92);border:1px solid rgba(216,194,144,.5);
    box-shadow:0 4px 14px rgba(0,0,0,.6);
    font-family:"Oswald","Microsoft YaHei",sans-serif;font-size:13px;letter-spacing:.04em;
    line-height:1.5;color:#f4e6c4;animation:cellHintIn .2s ease-out}
  .cellaim-hint em{font-style:normal;color:#a89974;margin-left:8px;font-size:12px}
  .cellaim-hint.invalid{border-color:rgba(226,112,98,.78);color:#ffd7d1;animation:cellHintShake .24s ease-out}
  @keyframes cellHintIn{from{opacity:0;transform:translateX(-50%) translateY(-6px)}
    to{opacity:1;transform:translateX(-50%) translateY(0)}}
  @keyframes cellHintShake{0%,100%{transform:translateX(-50%)}35%{transform:translateX(calc(-50% - 5px))}70%{transform:translateX(calc(-50% + 5px))}}
  @media (prefers-reduced-motion:reduce){.cellaim-hint{animation:none}}
  `;
  const style = document.createElement('style');
  style.id = 'cellaim-styles';
  style.textContent = css;
  document.head.appendChild(style);
}

/**
 * 坐标适配器：把不同坐标系统一到"瞄准层像素"（overlay/wrapper 相对、已除以缩放）。
 * 由 App 提供（App 掌握 overlay 矩形与缩放），CellPicker 只负责绘制与命中。
 */
export interface CellAimCoords {
  /** 屏幕(client)坐标 → 瞄准层像素 */
  clientToAim(clientX: number, clientY: number): { x: number; y: number };
  /** 格中心 → 瞄准层像素 */
  cellToAim(cell: CellPos): { x: number; y: number };
  /** DOM 元素中心 → 瞄准层像素 */
  elementToAim(el: HTMLElement): { x: number; y: number };
  /** 瞄准层像素 → 命中格（越界 null） */
  aimToCell(x: number, y: number): CellPos | null;
  /** 格边长（瞄准层像素） */
  cellSize: number;
}

export class CellPicker {
  private cleanup: (() => void) | null = null;
  private pendingResolve: ((value: CellPos | null) => void) | null = null;

  /**
   * 进入选格瞄准态，返回玩家点选的格坐标；点棋盘外 / 取消返回 null。
   * @param origin 施法者卡（光束起点）
   * @param overlayParent 承载瞄准 SVG 的容器（wrapper）
   * @param coords 坐标适配器（由 App 提供，统一坐标换算）
   * @param hint 顶部提示文案（B-11）。缺省用"选择一枚宝石"的通用口径；
   *             `Esc 取消` 由本方法统一追加，调用方不必重复写。
   * @param isValid 可选的有效格判断。命中无效格时保留选择态并给出反馈，不会静默取消技能。
   */
  pick(
    origin: CharacterCard,
    overlayParent: HTMLElement,
    coords: CellAimCoords,
    hint = '选择一枚宝石',
    isValid?: (cell: CellPos) => boolean,
    invalidHint = '这枚宝石不是有效目标，请重新选择',
  ): Promise<CellPos | null> {
    this.cancel();
    ensureStyles();

    return new Promise<CellPos | null>((resolve) => {
      this.pendingResolve = resolve;
      const handlers: (() => void)[] = [];
      const parentRect = () => overlayParent.getBoundingClientRect();

      origin.el.classList.add('casting-origin');

      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'cellaim-overlay');
      const pr0 = parentRect();
      svg.setAttribute('width', String(pr0.width));
      svg.setAttribute('height', String(pr0.height));
      svg.innerHTML = `
        <defs>
          <linearGradient id="cellBeamGrad" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#e6c979" stop-opacity="0.12"/>
            <stop offset="0.55" stop-color="#f0d99c" stop-opacity="0.95"/>
            <stop offset="1" stop-color="#fff3d6"/>
          </linearGradient>
          <linearGradient id="cellBeamGradLock" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#ffb057" stop-opacity="0.12"/>
            <stop offset="0.55" stop-color="#ffcb7a" stop-opacity="0.95"/>
            <stop offset="1" stop-color="#ffe9c6"/>
          </linearGradient>
          <filter id="cellGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.4" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle class="origin" cx="0" cy="0" r="6"/>
        <path class="beam" d=""/>
        <path class="beam-core" d=""/>
        <g class="reticle">
          <g>
            <circle class="ring" r="18" stroke-dasharray="13 9"/>
            <animateTransform attributeName="transform" type="rotate"
              from="0 0 0" to="360 0 0" dur="4s" repeatCount="indefinite"/>
          </g>
          <path class="bracket" d="M -16 -9 L -16 -16 L -9 -16"/>
          <path class="bracket" d="M 16 -9 L 16 -16 L 9 -16"/>
          <path class="bracket" d="M 16 9 L 16 16 L 9 16"/>
          <path class="bracket" d="M -16 9 L -16 16 L -9 16"/>
          <circle class="dot" r="2.5"/>
        </g>
      `;
      overlayParent.appendChild(svg);

      // B-11：提示条（独立 div，不放进 SVG——SVG 里做多行文本排版不值当）
      const hintEl = document.createElement('div');
      hintEl.className = 'cellaim-hint';
      hintEl.setAttribute('role', 'status');
      const hintText = document.createElement('span');
      hintText.className = 'cellaim-hint-text';
      hintText.textContent = hint;
      hintEl.appendChild(hintText);
      const escNote = document.createElement('em');
      escNote.textContent = 'Esc 取消';
      hintEl.appendChild(escNote);
      overlayParent.appendChild(hintEl);

      const beam = svg.querySelector('.beam') as SVGPathElement;
      const beamCore = svg.querySelector('.beam-core') as SVGPathElement;
      const originDot = svg.querySelector('.origin') as SVGCircleElement;
      const reticle = svg.querySelector('.reticle') as SVGGElement;
      const grads = Array.from(svg.querySelectorAll('linearGradient')) as SVGLinearGradientElement[];

      const start = () => coords.elementToAim(origin.el);
      let cursor = start();
      let hoverCell: CellPos | null = null;
      let showingInvalid = false;

      const showInvalid = () => {
        showingInvalid = true;
        hintText.textContent = invalidHint;
        hintEl.classList.remove('invalid');
        void hintEl.offsetWidth;
        hintEl.classList.add('invalid');
      };

      const clearInvalid = () => {
        if (!showingInvalid) return;
        showingInvalid = false;
        hintText.textContent = hint;
        hintEl.classList.remove('invalid');
      };

      const render = () => {
        const s = start();
        const end = hoverCell ? coords.cellToAim(hoverCell) : cursor;
        const dx = end.x - s.x;
        const dy = end.y - s.y;
        const mx = (s.x + end.x) / 2;
        const my = (s.y + end.y) / 2 - Math.min(70, Math.hypot(dx, dy) * 0.2);
        const d = `M ${s.x} ${s.y} Q ${mx} ${my} ${end.x} ${end.y}`;
        beam.setAttribute('d', d);
        beamCore.setAttribute('d', d);
        for (const g of grads) {
          g.setAttribute('x1', String(s.x)); g.setAttribute('y1', String(s.y));
          g.setAttribute('x2', String(end.x)); g.setAttribute('y2', String(end.y));
        }
        originDot.setAttribute('cx', String(s.x));
        originDot.setAttribute('cy', String(s.y));
        reticle.setAttribute('transform', `translate(${end.x} ${end.y})`);
        // 只用准星指示位置（不再画格子高亮框），锁定态变色
        const valid = !!hoverCell && (!isValid || isValid(hoverCell));
        svg.classList.toggle('locked', valid);
        svg.classList.toggle('invalid', !!hoverCell && !valid);
      };

      const onMove = (e: PointerEvent) => {
        cursor = coords.clientToAim(e.clientX, e.clientY);
        hoverCell = coords.aimToCell(cursor.x, cursor.y);
        if (!hoverCell || !isValid || isValid(hoverCell)) clearInvalid();
        render();
      };
      const done = (cell: CellPos | null) => {
        const finish = this.pendingResolve;
        this.pendingResolve = null;
        this.dismiss();
        finish?.(cell);
      };

      const onDocClick = (e: MouseEvent) => {
        const aim = coords.clientToAim(e.clientX, e.clientY);
        const cell = coords.aimToCell(aim.x, aim.y);
        e.preventDefault();
        e.stopPropagation();
        if (!cell || !BoardModel.inBounds(cell)) {
          done(null);
          return;
        }
        if (isValid && !isValid(cell)) {
          hoverCell = cell;
          showInvalid();
          render();
          return;
        }
        done(cell);
      };
      const onCtx = (e: Event) => { e.preventDefault(); done(null); };
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') done(null); };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('keydown', onKey);
      window.addEventListener('contextmenu', onCtx, { capture: true });
      const clickTimer = window.setTimeout(() => {
        window.addEventListener('click', onDocClick, { capture: true });
      }, 60);

      handlers.push(() => {
        window.clearTimeout(clickTimer);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('keydown', onKey);
        window.removeEventListener('contextmenu', onCtx, { capture: true });
        window.removeEventListener('click', onDocClick, { capture: true });
        origin.el.classList.remove('casting-origin');
        svg.remove();
        hintEl.remove();
      });

      render();
      this.cleanup = () => handlers.forEach((h) => h());
    });
  }

  dismiss(): void {
    this.cleanup?.();
    this.cleanup = null;
  }

  /** 外部状态切换时取消选择，并确保等待中的 Promise 以 null 结束。 */
  cancel(): void {
    const finish = this.pendingResolve;
    this.pendingResolve = null;
    this.dismiss();
    finish?.(null);
  }
}
