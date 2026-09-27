import { PlayerSide } from '@engine/types';
import { AnimConfig } from './AnimationConfig';
import type { FiniteVisuals } from './FiniteVisuals';

/** One small HUD notice per side/action; no sprites, particles, sound or queued holds. */
export class ExtraTurnNotice {
  private seen = new Set<PlayerSide>();
  private dismiss?: () => void;

  constructor(private visuals: FiniteVisuals) {}

  beginAction(): void {
    this.dismiss?.();
    this.seen.clear();
  }

  show(host: HTMLElement, side: PlayerSide): void {
    if (this.seen.has(side)) return;
    this.seen.add(side);
    this.dismiss?.();
    const el = host.ownerDocument.createElement('div');
    el.className = 'extra-turn-notice';
    el.dataset.side = side;
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent = side === PlayerSide.Left ? '我方额外回合' : '敌方额外回合';
    el.style.cssText = [
      'position:absolute', 'left:calc(50% + 62px)', 'top:calc(39% - 4px)',
      'transform:translate(0,0)', 'z-index:6', 'pointer-events:none',
      'max-width:calc(50% - 70px)', 'box-sizing:border-box', 'white-space:nowrap',
      'padding:1px 10px', 'border-radius:8px', 'background:rgba(18,20,31,.94)',
      `border:1px solid ${side === PlayerSide.Left ? '#bfa46c' : '#b98079'}`,
      `color:${side === PlayerSide.Left ? '#f2dfae' : '#f4b5ad'}`,
      'font:600 12px/18px system-ui,sans-serif', 'letter-spacing:.04em',
    ].join(';');
    host.appendChild(el);

    let animation: Animation | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      if (animation) {
        animation.onfinish = null;
        animation.oncancel = null;
        animation.cancel();
      }
      el.remove();
      token.finish();
      if (this.dismiss === finish) this.dismiss = undefined;
    };
    const token = this.visuals.begin(finish);
    this.dismiss = finish;
    const { durationMs, fadeInMs, fadeOutMs } = AnimConfig.extraTurnNotice;
    const reduced = host.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const rest = 'translate(0, 0)';
    if (typeof el.animate === 'function') {
      animation = el.animate([
        { opacity: 0, transform: reduced ? rest : 'translate(0, -3px)' },
        { opacity: 1, transform: rest, offset: fadeInMs / durationMs },
        { opacity: 1, transform: rest, offset: 1 - fadeOutMs / durationMs },
        { opacity: 0, transform: rest },
      ], { duration: durationMs, easing: 'linear', fill: 'forwards' });
      animation.onfinish = finish;
      animation.oncancel = finish;
    }
    // Also clean up when WAAPI completion is unavailable or throttled.
    timer = setTimeout(finish, durationMs + 50);
  }
}
