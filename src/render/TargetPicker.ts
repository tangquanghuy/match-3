/**
 * 目标瞄准器（技能编写与演出 · 玩家手动选目标）。
 *
 * 交互：从施法者卡拉出能量流光弧形光束指向鼠标；光束末端是锁定准星（SMIL 旋转外环 +
 * 四角括弧 + 中心点，绕自身中心旋转）。候选卡呼吸高亮，悬停时光束吸附、准星收拢并变金红。
 * 点击候选卡确认；点候选卡以外任意处 / Esc / 右键取消。纯表现层，不改引擎状态。
 */
import type { CharacterCard } from './TeamView';

const NS = 'http://www.w3.org/2000/svg';

let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
  /* 默认态：暖金瞄准光束（呼应卡片金边质感） */
  .aim-overlay{position:absolute;left:0;top:0;z-index:1200;pointer-events:none;overflow:visible}
  .aim-beam{fill:none;stroke:url(#aimBeamGrad);stroke-width:4;stroke-linecap:round;
    stroke-dasharray:3 14;filter:url(#aimGlow);animation:aimFlow .5s linear infinite}
  @keyframes aimFlow{to{stroke-dashoffset:-17}}
  .aim-beam-core{fill:none;stroke:rgba(255,248,232,.9);stroke-width:1.4;stroke-linecap:round;
    stroke-dasharray:1 16;animation:aimFlow .5s linear infinite}
  .aim-origin{fill:none;stroke:#e6c979;stroke-width:2;filter:url(#aimGlow);
    animation:aimOriginPulse 1.1s ease-out infinite}
  @keyframes aimOriginPulse{0%{r:6;opacity:.9}100%{r:18;opacity:0}}
  .aim-reticle{filter:url(#aimGlow)}
  .aim-reticle .ring{fill:none;stroke:#e6c979;stroke-width:2}
  .aim-reticle .bracket{fill:none;stroke:#f4e6bf;stroke-width:2.5;stroke-linecap:round;
    transition:transform .14s cubic-bezier(.2,.9,.3,1);transform-box:fill-box;transform-origin:center}
  .aim-reticle .dot{fill:#fff3d6}
  /* 锁定敌人：赤红危险色 */
  .aim-overlay.locked.hostile .aim-beam{stroke:url(#aimBeamGradHostile)}
  .aim-overlay.locked.hostile .aim-reticle .ring{stroke:#ff5a4d}
  .aim-overlay.locked.hostile .aim-reticle .bracket{stroke:#ff7a5a}
  .aim-overlay.locked.hostile .aim-reticle .dot{fill:#ffd0c0}
  /* 锁定盟友：翠绿治愈色 */
  .aim-overlay.locked.friendly .aim-beam{stroke:url(#aimBeamGradFriendly)}
  .aim-overlay.locked.friendly .aim-reticle .ring{stroke:#57d47a}
  .aim-overlay.locked.friendly .aim-reticle .bracket{stroke:#8fe6a3}
  .aim-overlay.locked.friendly .aim-reticle .dot{fill:#d6ffe0}
  `;
  const style = document.createElement('style');
  style.id = 'aim-picker-styles';
  style.textContent = css;
  document.head.appendChild(style);
}

export class TargetPicker {
  private cleanup: (() => void) | null = null;
  private pendingResolve: ((value: number | null) => void) | null = null;

  /**
   * @param origin 施法者卡（光束起点）
   * @param cards  候选目标卡（已按引擎候选过滤）
   * @param overlayParent 承载瞄准 SVG 的容器（建议 wrapper，覆盖全画面）
   * @param friendly 是否为友善目标（治疗/增益盟友）：true→锁定翠绿，false→锁定赤红
   */
  pick(
    origin: CharacterCard,
    cards: CharacterCard[],
    overlayParent: HTMLElement,
    friendly = false,
  ): Promise<number | null> {
    this.cancel();
    ensureStyles();
    if (cards.length === 0) return Promise.resolve(null);

    return new Promise<number | null>((resolve) => {
      this.pendingResolve = resolve;
      const handlers: (() => void)[] = [];
      const parentRect = () => overlayParent.getBoundingClientRect();

      origin.el.classList.add('casting-origin');

      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'aim-overlay');
      const pr0 = parentRect();
      svg.setAttribute('width', String(pr0.width));
      svg.setAttribute('height', String(pr0.height));
      // 准星：外环用 SMIL animateTransform 绕本地原点(0,0)旋转 —— 位置绝对居中，不受层叠影响
      svg.innerHTML = `
        <defs>
          <linearGradient id="aimBeamGrad" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#e6c979" stop-opacity="0.12"/>
            <stop offset="0.55" stop-color="#f0d99c" stop-opacity="0.95"/>
            <stop offset="1" stop-color="#fff3d6"/>
          </linearGradient>
          <linearGradient id="aimBeamGradHostile" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#ff5a4d" stop-opacity="0.12"/>
            <stop offset="0.55" stop-color="#ff6a55" stop-opacity="0.95"/>
            <stop offset="1" stop-color="#ffd0c0"/>
          </linearGradient>
          <linearGradient id="aimBeamGradFriendly" gradientUnits="userSpaceOnUse">
            <stop offset="0" stop-color="#57d47a" stop-opacity="0.12"/>
            <stop offset="0.55" stop-color="#7fe09a" stop-opacity="0.95"/>
            <stop offset="1" stop-color="#d6ffe0"/>
          </linearGradient>
          <filter id="aimGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="2.4" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>
        <circle class="aim-origin" cx="0" cy="0" r="6"/>
        <path class="aim-beam" d=""/>
        <path class="aim-beam-core" d=""/>
        <g class="aim-reticle">
          <g>
            <circle class="ring" r="20" stroke-dasharray="14 10"/>
            <animateTransform attributeName="transform" type="rotate"
              from="0 0 0" to="360 0 0" dur="4s" repeatCount="indefinite"/>
          </g>
          <circle class="ring" r="12" opacity="0.55"/>
          <path class="bracket" d="M -20 -12 L -20 -20 L -12 -20"/>
          <path class="bracket" d="M 20 -12 L 20 -20 L 12 -20"/>
          <path class="bracket" d="M 20 12 L 20 20 L 12 20"/>
          <path class="bracket" d="M -20 12 L -20 20 L -12 20"/>
          <circle class="dot" r="2.5"/>
        </g>
      `;
      overlayParent.appendChild(svg);

      const beam = svg.querySelector('.aim-beam') as SVGPathElement;
      const beamCore = svg.querySelector('.aim-beam-core') as SVGPathElement;
      const originDot = svg.querySelector('.aim-origin') as SVGCircleElement;
      const reticle = svg.querySelector('.aim-reticle') as SVGGElement;
      const grads = Array.from(svg.querySelectorAll('linearGradient')) as SVGLinearGradientElement[];
      const brackets = Array.from(svg.querySelectorAll('.bracket')) as SVGPathElement[];

      const centerOf = (el: HTMLElement) => {
        const r = el.getBoundingClientRect();
        const p = parentRect();
        return { x: r.left + r.width / 2 - p.left, y: r.top + r.height / 2 - p.top };
      };
      let start = centerOf(origin.el);
      let cursor = { ...start };
      let hovered: CharacterCard | null = null;

      const render = () => {
        start = centerOf(origin.el);
        const end = hovered ? centerOf(hovered.el) : cursor;
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const mx = (start.x + end.x) / 2;
        const my = (start.y + end.y) / 2 - Math.min(70, Math.hypot(dx, dy) * 0.2);
        const d = `M ${start.x} ${start.y} Q ${mx} ${my} ${end.x} ${end.y}`;
        beam.setAttribute('d', d);
        beamCore.setAttribute('d', d);
        for (const g of grads) {
          g.setAttribute('x1', String(start.x));
          g.setAttribute('y1', String(start.y));
          g.setAttribute('x2', String(end.x));
          g.setAttribute('y2', String(end.y));
        }
        originDot.setAttribute('cx', String(start.x));
        originDot.setAttribute('cy', String(start.y));
        reticle.setAttribute('transform', `translate(${end.x} ${end.y})`);
        const inset = hovered ? 0.9 : 1;
        for (const b of brackets) b.style.transform = `scale(${inset})`;
        svg.classList.toggle('locked', !!hovered);
        svg.classList.toggle('friendly', !!hovered && friendly);
        svg.classList.toggle('hostile', !!hovered && !friendly);
      };

      const onMove = (e: PointerEvent) => {
        const p = parentRect();
        cursor = { x: e.clientX - p.left, y: e.clientY - p.top };
        render();
      };
      const done = (id: number | null) => {
        const finish = this.pendingResolve;
        this.pendingResolve = null;
        this.dismiss();
        finish?.(id);
      };

      for (const card of cards) {
        card.setPickable(true);
        const prevPE = card.el.style.pointerEvents;
        card.el.style.pointerEvents = 'auto';
        card.el.style.cursor = 'crosshair';
        const hoverClass = friendly ? 'aim-hover-friendly' : 'aim-hover-hostile';
        const onEnter = () => { hovered = card; card.el.classList.add('aim-hover', hoverClass); render(); };
        const onLeave = () => { if (hovered === card) hovered = null; card.el.classList.remove('aim-hover', hoverClass); render(); };
        card.el.addEventListener('pointerenter', onEnter);
        card.el.addEventListener('pointerleave', onLeave);
        handlers.push(() => {
          card.setPickable(false);
          card.el.classList.remove('aim-hover', 'aim-hover-friendly', 'aim-hover-hostile');
          card.el.style.pointerEvents = prevPE;
          card.el.style.cursor = '';
          card.el.removeEventListener('pointerenter', onEnter);
          card.el.removeEventListener('pointerleave', onLeave);
        });
      }

      // 取消/确认统一用 document 捕获点击：命中候选卡→确认，其它→取消。
      // 不用全屏 blocker，避免层叠上下文导致盟友卡（左列）点不到。
      const onDocClick = (e: MouseEvent) => {
        const path = e.composedPath();
        const hit = cards.find((c) => path.includes(c.el));
        e.preventDefault();
        e.stopPropagation();
        done(hit ? hit.charId : null);
      };
      const onCtx = (e: Event) => { e.preventDefault(); done(null); };
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') done(null); };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('keydown', onKey);
      window.addEventListener('contextmenu', onCtx, { capture: true });
      // 延到下一帧再挂点击捕获，避免捕获到"发起释放的那次点击/短按抬起"
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

  /** 外部状态切换时取消选择，并确保等待中的 Promise 以 null 结束。 */
  cancel(): void {
    const finish = this.pendingResolve;
    this.pendingResolve = null;
    this.dismiss();
    finish?.(null);
  }
}
