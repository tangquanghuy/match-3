/**
 * 棋盘选色器（技能编写与演出 · 需求 2 · GOW 标准：从棋盘自选一种颜色）。
 *
 * 交互与选宝石同源：从施法者卡拉出暖金光束指向鼠标；鼠标扫过棋盘时，**光标所在宝石的颜色**
 * 的所有同色宝石一起高亮 + 逐格描边；点击确认该颜色 → 转换/摧毁作用于它。
 * 点棋盘外 / Esc / 右键取消。固定颜色技能不走本流程（直接用固定色）。
 */
import { BoardModel } from '@engine/BoardModel';
import type { BaseColor, CellPos } from '@engine/types';
import type { GameState } from '@engine/GameState';
import type { CharacterCard } from './TeamView';
import type { CellAimCoords } from './CellPicker';

const NS = 'http://www.w3.org/2000/svg';

/** 六色描边色（与宝石呼应） */
const COLOR_STROKE: Record<string, string> = {
  Red: '#ff5a5a', Green: '#57d47a', Blue: '#5eb5ff',
  Yellow: '#ffd45a', Purple: '#c07aff', Brown: '#d49355',
};

let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
  .coloraim-overlay{position:absolute;left:0;top:0;z-index:1200;pointer-events:none;overflow:visible}
  .coloraim-overlay .beam{fill:none;stroke:url(#colorBeamGrad);stroke-width:4;stroke-linecap:round;
    stroke-dasharray:3 14;filter:url(#colorGlow);animation:colorFlow .5s linear infinite}
  @keyframes colorFlow{to{stroke-dashoffset:-17}}
  .coloraim-overlay .beam-core{fill:none;stroke:rgba(255,248,232,.9);stroke-width:1.4;stroke-linecap:round;
    stroke-dasharray:1 16;animation:colorFlow .5s linear infinite}
  .coloraim-overlay .origin{fill:none;stroke:#e6c979;stroke-width:2;filter:url(#colorGlow);
    animation:colorOriginPulse 1.1s ease-out infinite}
  @keyframes colorOriginPulse{0%{r:6;opacity:.9}100%{r:18;opacity:0}}
  .coloraim-overlay .swatch{fill:none;stroke-width:2.5;rx:6;filter:url(#colorGlow);
    animation:colorSwatchPulse 1s ease-in-out infinite}
  @keyframes colorSwatchPulse{0%,100%{opacity:.7}50%{opacity:1}}
  .coloraim-overlay .reticle .ring{fill:none;stroke:#e6c979;stroke-width:2}
  .coloraim-overlay .reticle .dot{fill:#fff3d6}
  `;
  const style = document.createElement('style');
  style.id = 'coloraim-styles';
  style.textContent = css;
  document.head.appendChild(style);
}

export class BoardColorPicker {
  private cleanup: (() => void) | null = null;

  /**
   * 进入选色瞄准态，返回玩家选定的颜色；点棋盘外 / 取消返回 null。
   * @param origin 施法者卡（光束起点）
   * @param overlayParent 承载 SVG 的容器（wrapper）
   * @param coords 坐标适配器（App 提供）
   * @param getState 读取当前对局（取棋盘各格颜色）
   */
  pick(
    origin: CharacterCard,
    overlayParent: HTMLElement,
    coords: CellAimCoords,
    getState: () => GameState,
  ): Promise<BaseColor | null> {
    this.dismiss();
    ensureStyles();

    return new Promise<BaseColor | null>((resolve) => {
      const handlers: (() => void)[] = [];
      const parentRect = () => overlayParent.getBoundingClientRect();

      origin.el.classList.add('casting-origin');

      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'coloraim-overlay');
      const pr0 = parentRect();
      svg.setAttribute('width', String(pr0.width));
      svg.setAttribute('height', String(pr0.height));
      svg.innerHTML = `
        <defs>
          <linearGradient id="colorBeamGrad" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#e6c979" stop-opacity="0.12"/>
            <stop offset="0.55" stop-color="#f0d99c" stop-opacity="0.95"/>
            <stop offset="1" stop-color="#fff3d6"/>
          </linearGradient>
          <filter id="colorGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.2" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <g class="swatches"></g>
        <circle class="origin" cx="0" cy="0" r="6"/>
        <path class="beam" d=""/>
        <path class="beam-core" d=""/>
        <g class="reticle">
          <g><circle class="ring" r="16" stroke-dasharray="12 8"/>
            <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="4s" repeatCount="indefinite"/>
          </g>
          <circle class="dot" r="2.5"/>
        </g>
      `;
      overlayParent.appendChild(svg);

      const beam = svg.querySelector('.beam') as SVGPathElement;
      const beamCore = svg.querySelector('.beam-core') as SVGPathElement;
      const originDot = svg.querySelector('.origin') as SVGCircleElement;
      const reticle = svg.querySelector('.reticle') as SVGGElement;
      const swatches = svg.querySelector('.swatches') as SVGGElement;
      const grad = svg.querySelector('#colorBeamGrad') as SVGLinearGradientElement;

      const start = () => coords.elementToAim(origin.el);
      let cursor = start();
      let hoverColor: BaseColor | null = null;

      /** 读取某格的颜色（骷髅/空 → null） */
      const colorAt = (cell: CellPos): BaseColor | null => {
        const gem = getState().board.get(cell);
        return gem && gem.type.kind === 'color' ? gem.type.color : null;
      };

      /** 收集棋盘上某色所有格 */
      const cellsOfColor = (color: BaseColor): CellPos[] => {
        const board = getState().board;
        const out: CellPos[] = [];
        board.forEach((gem, pos) => {
          if (gem && gem.type.kind === 'color' && gem.type.color === color) out.push(pos);
        });
        return out;
      };

      const renderSwatches = () => {
        swatches.innerHTML = '';
        if (!hoverColor) return;
        const stroke = COLOR_STROKE[hoverColor] ?? '#f0d99c';
        const size = coords.cellSize;
        for (const cell of cellsOfColor(hoverColor)) {
          const c = coords.cellToAim(cell);
          const r = document.createElementNS(NS, 'rect');
          r.setAttribute('class', 'swatch');
          r.setAttribute('x', String(c.x - size / 2 + 2));
          r.setAttribute('y', String(c.y - size / 2 + 2));
          r.setAttribute('width', String(size - 4));
          r.setAttribute('height', String(size - 4));
          r.setAttribute('rx', '6');
          r.setAttribute('stroke', stroke);
          swatches.appendChild(r);
        }
      };

      const render = () => {
        const s = start();
        const end = cursor;
        const dx = end.x - s.x, dy = end.y - s.y;
        const mx = (s.x + end.x) / 2;
        const my = (s.y + end.y) / 2 - Math.min(70, Math.hypot(dx, dy) * 0.2);
        const d = `M ${s.x} ${s.y} Q ${mx} ${my} ${end.x} ${end.y}`;
        beam.setAttribute('d', d);
        beamCore.setAttribute('d', d);
        grad.setAttribute('x1', String(s.x)); grad.setAttribute('y1', String(s.y));
        grad.setAttribute('x2', String(end.x)); grad.setAttribute('y2', String(end.y));
        originDot.setAttribute('cx', String(s.x)); originDot.setAttribute('cy', String(s.y));
        reticle.setAttribute('transform', `translate(${end.x} ${end.y})`);
        renderSwatches();
      };

      const onMove = (e: PointerEvent) => {
        cursor = coords.clientToAim(e.clientX, e.clientY);
        const cell = coords.aimToCell(cursor.x, cursor.y);
        hoverColor = cell && BoardModel.inBounds(cell) ? colorAt(cell) : null;
        render();
      };
      const done = (color: BaseColor | null) => { this.dismiss(); resolve(color); };

      const onDocClick = (e: MouseEvent) => {
        const aim = coords.clientToAim(e.clientX, e.clientY);
        const cell = coords.aimToCell(aim.x, aim.y);
        const color = cell && BoardModel.inBounds(cell) ? colorAt(cell) : null;
        e.preventDefault();
        e.stopPropagation();
        done(color); // 点到有色宝石→选定该色；点空白/骷髅→取消
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
      });

      render();
      this.cleanup = () => handlers.forEach((h) => h());
    });
  }

  dismiss(): void {
    this.cleanup?.();
    this.cleanup = null;
  }
}
