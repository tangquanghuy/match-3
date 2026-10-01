/**
 * 术语解释弹出面板（全站共享）。
 *
 * `bindTermTips(container)` 用事件委托接管 container 内所有 `.spell-term`
 * 点击（span[role=button]，支持 Enter/Space 键激活）：懒创建一个
 * `position: fixed` 的 `.term-tip` 面板，按视口坐标定位到被点术语下方
 * （放不下则翻转到上方）。
 *
 * 为什么用 fixed 而不是照抄 #spellTip 的容器内 absolute：调用方横跨图鉴/
 * 武器/竞技场/战斗 UnitSheet 七处，各容器 overflow、1600×900 舞台 scale
 * 各不相同；视口坐标一步到位，全部上下文都无需感知缩放。
 */
import { TERM_BY_ID, TERM_CATEGORY_LABEL, type TermCategory } from '../../data/termGlossary';

const TIP_GAP = 8;
const TIP_WIDTH = 264;
const VIEWPORT_MARGIN = 8;

/** 全站同时只开一个术语面板：新开时收掉旧的 */
let activeClose: (() => void) | null;

export function bindTermTips(container: HTMLElement): () => void {
  let tip: HTMLElement | null = null;
  let openButton: HTMLElement | null = null;

  const close = (): void => {
    tip?.remove();
    tip = null;
    if (openButton) {
      openButton.setAttribute('aria-expanded', 'false');
      openButton = null;
    }
    if (activeClose === close) activeClose = null;
  };

  const onClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest?.('.spell-term') as HTMLElement | null;
    if (!button || !container.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    if (openButton === button) {
      close();
      return;
    }
    activeClose?.();
    open(button);
  };

  const onDocPointerDown = (event: PointerEvent): void => {
    const target = event.target as HTMLElement | null;
    if (openButton && !tip?.contains(target) && !openButton.contains(target)) close();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && openButton) {
      close();
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target as HTMLElement | null;
    const button = target?.closest?.('.spell-term') as HTMLElement | null;
    if (!button || !container.contains(button)) return;
    event.preventDefault();
    if (openButton === button) close();
    else {
      activeClose?.();
      open(button);
    }
  };

  function open(button: HTMLElement): void {
    const entry = TERM_BY_ID.get(button.dataset.term ?? '');
    if (!entry) return;
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'term-tip';
      tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }
    const cat = TERM_CATEGORY_LABEL[entry.category as TermCategory] ?? '术语';
    tip.innerHTML =
      `<i class="term-tip-arrow" aria-hidden="true"></i>` +
      `<div class="term-tip-head"><i class="term-tip-cat term-tip-cat-${entry.category}">${cat}</i>` +
      `<strong>${entry.title}</strong></div>` +
      `<p>${entry.body}</p>`;
    tip.hidden = false;
    openButton?.setAttribute('aria-expanded', 'false');
    openButton = button;
    button.setAttribute('aria-expanded', 'true');
    position(button);
    if (activeClose && activeClose !== close) activeClose();
    activeClose = close;
  }

  function position(button: HTMLElement): void {
    if (!tip) return;
    const rect = button.getBoundingClientRect();
    tip.style.left = '0px';
    tip.style.top = '0px';
    const width = Math.min(TIP_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);
    const height = tip.offsetHeight;
    let top = rect.bottom + TIP_GAP;
    if (top + height > window.innerHeight - VIEWPORT_MARGIN) {
      top = rect.top - height - TIP_GAP;
    }
    top = Math.max(VIEWPORT_MARGIN, Math.min(top, window.innerHeight - height - VIEWPORT_MARGIN));
    let left = rect.left + rect.width / 2 - width / 2;
    left = Math.max(VIEWPORT_MARGIN, Math.min(left, window.innerWidth - width - VIEWPORT_MARGIN));
    tip.style.width = `${width}px`;
    tip.style.left = `${Math.round(left)}px`;
    tip.style.top = `${Math.round(top)}px`;
    const arrow = tip.querySelector('.term-tip-arrow') as HTMLElement | null;
    if (arrow) {
      const above = rect.bottom + TIP_GAP !== top;
      arrow.classList.toggle('above', above);
      arrow.style.left = `${Math.round(rect.left + rect.width / 2 - left)}px`;
    }
  }

  container.addEventListener('click', onClick);
  container.addEventListener('keydown', onKeyDown);
  document.addEventListener('pointerdown', onDocPointerDown, true);
  document.addEventListener('keydown', onKeyDown);
  if (activeClose) activeClose();

  return () => {
    close();
    container.removeEventListener('click', onClick);
    container.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    document.removeEventListener('keydown', onKeyDown);
  };
}
