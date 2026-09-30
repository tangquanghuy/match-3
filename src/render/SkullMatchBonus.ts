import { CARD_STAT_ICONS } from './TeamView';
import type { FiniteVisuals } from './FiniteVisuals';
import { scaledMs } from './battleSpeed';

/** Match damage bonus, not a permanent troop attack buff. Reuse the card's crossed swords. */
export function showSkullMatchBonus(
  host: HTMLElement,
  visuals: FiniteVisuals,
  point: { x: number; y: number },
  bonus: number,
  cellSize: number,
): void {
  const el = host.ownerDocument.createElement('div');
  el.className = 'skull-match-bonus';
  el.dataset.bonus = String(bonus);
  el.setAttribute('aria-label', `骷髅匹配额外伤害 +${bonus}`);
  const fontSize = Math.max(16, Math.min(24, cellSize * .28));
  el.style.cssText = [
    'position:absolute', `left:${point.x}px`, `top:${point.y}px`,
    'display:flex', 'align-items:center', 'gap:4px', 'white-space:nowrap',
    'pointer-events:none', 'z-index:35', 'color:#ffe3a1',
    `font:700 ${fontSize}px/1 Georgia,serif`,
    'text-shadow:0 2px 3px #160b05,1px 0 2px #160b05,-1px 0 2px #160b05',
    'filter:drop-shadow(0 0 4px #261508)', 'transform:translate(-50%,-50%)',
  ].join(';');
  el.innerHTML = CARD_STAT_ICONS.sword;
  const icon = el.querySelector('svg')!;
  icon.setAttribute('width', String(fontSize));
  icon.setAttribute('height', String(fontSize));
  icon.setAttribute('aria-hidden', 'true');
  const label = host.ownerDocument.createElement('span');
  label.textContent = `+${bonus}`;
  el.appendChild(label);
  host.appendChild(el);

  let animation: Animation | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined = undefined;
  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    if (animation) {
      animation.onfinish = null;
      animation.oncancel = null;
      animation.cancel();
    }
    el.remove();
  };
  const token = visuals.begin(cleanup);
  const finish = () => { cleanup(); token.finish(); };
  const duration = scaledMs(900);
  const reduced = host.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (typeof el.animate === 'function') {
    const rest = 'translate(-50%,-70%)';
    animation = el.animate([
      { opacity: 0, transform: reduced ? rest : 'translate(-50%,-35%) scale(.88)' },
      { opacity: 1, transform: reduced ? rest : 'translate(-50%,-70%) scale(1)', offset: .18 },
      { opacity: 1, transform: `translate(-50%,${reduced ? '-70%' : '-120%'})`, offset: .65 },
      { opacity: 0, transform: `translate(-50%,${reduced ? '-70%' : '-180%'})` },
    ], { duration, easing: 'ease-out', fill: 'forwards' });
    animation.onfinish = finish;
    animation.oncancel = finish;
  }
  timer = setTimeout(finish, duration + 50);
}
