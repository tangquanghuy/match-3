/**
 * 新手引导：试炼战 → 回到王国 → 领取馈赠 → 新手十连 → 自由行动。
 *
 * 页面引导：全屏压暗，只放行当前目标（聚光框）与对话框；其余点击、按键与越界路由一律拦下。
 * 战斗内与结算页不加任何遮挡（升级二选一必须能操作），回到地图后再继续引导。
 * 步骤状态存在 save.onboarding.step（核心在对应操作成功时推进），这里只负责展示与拦截。
 */
import type { OnboardingStep } from '../state/schema';
import type { ShellCtx } from './screen';
import { toast } from './chrome';
import { tutorialArt } from './artAssets';

interface GuideView {
  /** 聚光目标；null = 只压暗、对话框居中 */
  target: string | null;
  title: string;
  text: string;
  action?: { label: string; run: (ctx: ShellCtx) => void };
}

type ActiveStep = Exclude<OnboardingStep, 'done'>;

/** 各步骤允许停留的路由；越界即拉回 fallback */
const ROUTES: Record<ActiveStep, { allowed: string[]; fallback: string }> = {
  battle: { allowed: ['map', 'result'], fallback: '#map' },
  gift: { allowed: ['map', 'result', 'gifts'], fallback: '#map' },
  summon: { allowed: ['gifts', 'chests'], fallback: '#gifts' },
};

const STEP_INDEX: Record<OnboardingStep, number> = { battle: 0, gift: 1, summon: 2, done: 3 };

/** 当前页面的引导；null = 本页不遮挡（结算页） */
function viewOf(step: ActiveStep, route: string, param: string | undefined): GuideView | null | { redirect: string } {
  if (route === 'result') return null;
  switch (step) {
    case 'battle':
      return {
        target: null, title: '欢迎来到破晓之誓',
        text: '交换相邻宝石，连成三个同色，为部队积攒法力。法力满后，点击部队释放技能。',
        action: { label: '开始试炼', run: (ctx) => void ctx.launchTutorialBattle() },
      };
    case 'gift':
      if (route === 'gifts') return { target: '[data-gift-claim="starter"]', title: '领取见面礼', text: '点击「领取」，获得 1000 宝石。' };
      return { target: '#railGifts', title: '打得漂亮', text: '打开「馈赠」，领取你的见面礼。' };
    case 'summon':
      if (route === 'chests') {
        if (param !== 'gems') return { redirect: '#chests/gems' };
        return { target: '[data-open="gem-10"]', title: '新手十连', text: '点击「新手十连」，花费 1000 宝石，必得一名异界来客。' };
      }
      return {
        target: null, title: '召唤伙伴',
        text: '用刚领到的宝石，召唤你的新伙伴。',
        action: { label: '前往召唤', run: (ctx) => ctx.navigate('#chests/gems') },
      };
  }
}

function guideCardHtml(): string {
  const guide = tutorialArt('guide');
  return `${guide ? `<img class="tut-guide" src="${guide}" alt="" aria-hidden="true">` : ''}
    <div class="tut-card">
      <header class="tut-name"><b>艾琳</b><small>向导</small><ol class="tut-steps" aria-label="引导进度"><li></li><li></li><li></li></ol></header>
      <h2></h2>
      <p></p>
      <button class="tut-action" type="button" hidden></button>
    </div>`;
}

export class TutorialGuide {
  private layer: HTMLElement | null = null;
  private view: GuideView | null = null;
  private lastStep: OnboardingStep = 'done';
  private route: [string, string | undefined] = ['map', undefined];

  constructor(private readonly ctx: ShellCtx, private readonly battleRoot: HTMLElement) {
    for (const type of ['click', 'pointerdown', 'mousedown', 'touchstart', 'dblclick', 'contextmenu'] as const) {
      document.addEventListener(type, (event) => this.guard(event), true);
    }
    document.addEventListener('keydown', (event) => {
      if (!this.blocking() || event.key === 'Tab') return;
      if (!this.allowed(document.activeElement)) { event.preventDefault(); event.stopPropagation(); }
    }, true);
    window.addEventListener('resize', () => this.tick());
    window.setInterval(() => this.tick(), 150);
  }

  /** 每次路由渲染后调用；返回 true 表示发生了重定向（本次渲染作废） */
  sync(route: string, param: string | undefined): boolean {
    this.route = [route, param];
    const step = this.ctx.save().onboarding.step;
    if (step === 'done') {
      if (this.lastStep !== 'done') setTimeout(() => toast('准备就绪，出发探索王国吧！'), 1200);
      this.lastStep = step;
      this.view = null;
      this.removeLayer();
      return false;
    }
    this.lastStep = step;
    const rule = ROUTES[step];
    if (!rule.allowed.includes(route)) { this.ctx.navigate(rule.fallback); return true; }
    const view = viewOf(step, route, param);
    if (view && 'redirect' in view) { this.ctx.navigate(view.redirect); return true; }
    this.view = view;
    if (view) this.paint(view);
    else this.removeLayer();
    return false;
  }

  private blocking(): boolean {
    return !!this.view && !!this.layer && !this.layer.hidden;
  }

  private paint(view: GuideView): void {
    if (!this.layer) {
      this.layer = document.createElement('div');
      this.layer.className = 'tut-layer';
      this.layer.innerHTML = `<div class="tut-hole" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <section class="tut-bubble" role="dialog" aria-live="polite" aria-labelledby="tutTitle">${guideCardHtml()}</section>`;
      this.layer.querySelector('h2')!.id = 'tutTitle';
      document.body.appendChild(this.layer);
      this.layer.querySelector('.tut-action')!.addEventListener('click', () => this.view?.action?.run(this.ctx));
    }
    this.layer.classList.toggle('is-centered', !view.target);
    this.paintSteps(this.layer);
    this.layer.querySelector('h2')!.textContent = view.title;
    this.layer.querySelector('p')!.textContent = view.text;
    const button = this.layer.querySelector<HTMLButtonElement>('.tut-action')!;
    button.hidden = !view.action;
    button.textContent = view.action?.label ?? '';
    this.place();
    if (view.action) button.focus({ preventScroll: true });
  }

  private paintSteps(root: HTMLElement): void {
    const index = STEP_INDEX[this.lastStep];
    root.querySelectorAll('.tut-steps li').forEach((li, i) => {
      li.classList.toggle('done', i < index);
      li.classList.toggle('on', i === index);
    });
  }

  private tick(): void {
    // 步骤在屏内被推进（例如新手十连成交后）：立即按新步骤重排或撤掉遮罩
    if (this.lastStep !== 'done' && this.ctx.save().onboarding.step !== this.lastStep) { this.sync(...this.route); return; }
    this.place();
  }

  /** 聚光框跟随目标；战斗全屏接管时整层隐藏 */
  private place(): void {
    if (!this.layer || !this.view) return;
    const inBattle = !this.battleRoot.hidden;
    this.layer.hidden = inBattle;
    if (inBattle) return;
    const hole = this.layer.querySelector<HTMLElement>('.tut-hole')!;
    const bubble = this.layer.querySelector<HTMLElement>('.tut-bubble')!;
    const target = this.view.target ? document.querySelector<HTMLElement>(this.view.target) : null;
    if (target) {
      const bounds = target.getBoundingClientRect();
      let top = 12, bottom = window.innerHeight - 12;
      let left = 12, right = window.innerWidth - 12;
      // 馈赠等页面有独立滚动区；先把操作目标带入可见区域，再放置对话框。
      for (let parent = target.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        const clip = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
          top = Math.max(top, clip.top); bottom = Math.min(bottom, clip.bottom);
        }
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
          left = Math.max(left, clip.left); right = Math.min(right, clip.right);
        }
      }
      if (bounds.top < top || bounds.bottom > bottom || bounds.left < left || bounds.right > right) {
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      }
    }
    const box = target?.getBoundingClientRect();
    const rect = box && box.width > 0 && box.height > 0 ? box : null;
    this.layer.classList.toggle('has-hole', !!rect);
    positionBubble(bubble, rect, hole);
  }

  private allowed(node: EventTarget | Element | null): boolean {
    if (!(node instanceof Element)) return false;
    if (node.closest('.tut-layer .tut-bubble')) return true;
    return !!this.view?.target && !!node.closest(this.view.target);
  }

  private guard(event: Event): void {
    if (!this.blocking()) return;
    if (this.allowed(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  private removeLayer(): void {
    this.layer?.remove();
    this.layer = null;
  }
}

/** 对话框贴着目标放（下 → 上 → 侧），放不下时居中；聚光框包住目标 */
function positionBubble(bubble: HTMLElement, rect: DOMRect | null, hole: HTMLElement): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const bw = bubble.offsetWidth;
  const bh = bubble.offsetHeight;
  if (!rect) {
    bubble.style.left = `${Math.round((vw - bw) / 2)}px`;
    bubble.style.top = `${Math.round(Math.max(12, (vh - bh) / 2))}px`;
    return;
  }
  const pad = 8;
  Object.assign(hole.style, {
    left: `${rect.left - pad}px`, top: `${rect.top - pad}px`,
    width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px`,
  });
  const gap = 20;
  let top = rect.bottom + pad + gap;
  let left = rect.left + rect.width / 2 - bw / 2;
  if (top + bh > vh - 12) top = rect.top - pad - gap - bh;
  if (top < 12) {
    // 上下都放不下（侧栏 / 竖长目标）：放到侧面，垂直居中对齐目标
    top = Math.min(vh - bh - 12, Math.max(12, rect.top + rect.height / 2 - bh / 2));
    left = rect.right + pad + gap + bw < vw ? rect.right + pad + gap : rect.left - pad - gap - bw;
  }
  bubble.style.left = `${Math.round(Math.min(vw - bw - 12, Math.max(12, left)))}px`;
  bubble.style.top = `${Math.round(Math.max(12, Math.min(vh - bh - 12, top)))}px`;
}
