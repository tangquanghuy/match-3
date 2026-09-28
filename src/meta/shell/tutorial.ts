/**
 * 新手引导遮罩：试炼战 → 回到王国 → 领取馈赠 → 新手十连 → 自由行动。
 *
 * 引导期间全屏压暗，只放行当前步骤的目标（聚光框）与提示气泡；其余点击、按键与越界路由一律拦下。
 * 步骤状态存在 save.onboarding.step（网关在对应操作成功时推进），这里只负责展示与拦截。
 */
import type { OnboardingStep } from '../state/schema';
import type { ShellCtx } from './screen';
import { toast } from './chrome';

interface GuideView {
  /** 聚光目标；null = 只压暗、气泡居中 */
  target: string | null;
  /** 放行点击的区域（默认 = target） */
  allow?: string[];
  /** 不压暗（页内有必须操作的内容，例如结算页的升级二选一） */
  noDim?: boolean;
  /** 气泡固定在屏幕顶部居中（不挡页内内容） */
  pinTop?: boolean;
  title: string;
  text: string;
  action?: { label: string; run: (ctx: ShellCtx) => void };
}

/** 各步骤允许停留的路由；越界即拉回 fallback */
const ROUTES: Record<Exclude<OnboardingStep, 'done'>, { allowed: string[]; fallback: string }> = {
  battle: { allowed: ['map', 'result'], fallback: '#map' },
  gift: { allowed: ['map', 'result', 'gifts'], fallback: '#map' },
  summon: { allowed: ['gifts', 'chests'], fallback: '#gifts' },
};

function viewOf(step: Exclude<OnboardingStep, 'done'>, route: string, param: string | undefined): GuideView | { redirect: string } {
  switch (step) {
    case 'battle':
      if (route === 'result') {
        return { target: '#again', allow: ['.result-screen'], noDim: true, pinTop: true, title: '差一点', text: '试炼没有通过，回到地图再来一次。' };
      }
      return {
        target: null, title: '欢迎来到破晓之誓',
        text: '先打一场试炼战：交换相邻宝石，连成三个同色积攒法力，连骷髅可以直接攻击敌人。',
        action: { label: '开始试炼', run: (ctx) => void ctx.launchTutorialBattle() },
      };
    case 'gift':
      if (route === 'result') return { target: '#again', allow: ['.result-screen'], noDim: true, pinTop: true, title: '试炼胜利', text: '回到王国，领取为新冒险者准备的馈赠。' };
      if (route === 'gifts') return { target: '[data-gift-claim="starter"]', title: '领取见面礼', text: '1000 宝石，刚好够一次新手十连。' };
      return { target: '#railGifts', title: '馈赠', text: '成长路上的每个里程碑都有宝石奖励，先去领取见面礼。' };
    case 'summon':
      if (route === 'chests') {
        if (param !== 'gems') return { redirect: '#chests/gems' };
        return { target: '[data-open="gem-10"]', title: '新手十连', text: '首次十连只要 1000 宝石，必定获得一名异界来客。' };
      }
      return {
        target: null, title: '去召唤',
        text: '宝石可以在宝箱页召唤部队。首次十连必定获得一名异界来客。',
        action: { label: '前往召唤', run: (ctx) => ctx.navigate('#chests/gems') },
      };
  }
}

export class TutorialGuide {
  private layer: HTMLElement | null = null;
  private timer: number | null = null;
  private view: GuideView | null = null;
  private lastStep: OnboardingStep;
  private route: [string, string | undefined] = ['map', undefined];

  constructor(private readonly ctx: ShellCtx, private readonly battleRoot: HTMLElement) {
    this.lastStep = 'done'; // 网关尚未加载；首次 sync 时读真实步骤
    for (const type of ['click', 'pointerdown', 'mousedown', 'touchstart', 'dblclick', 'contextmenu'] as const) {
      document.addEventListener(type, (event) => this.guard(event), true);
    }
    document.addEventListener('keydown', (event) => {
      if (!this.view || event.key === 'Tab') return;
      if (!this.allowed(document.activeElement)) { event.preventDefault(); event.stopPropagation(); }
    }, true);
    window.addEventListener('resize', () => this.place());
  }

  /** 每次路由渲染后调用；返回 true 表示发生了重定向（本次渲染作废） */
  sync(route: string, param: string | undefined): boolean {
    this.route = [route, param];
    const step = this.ctx.save().onboarding.step;
    if (step === 'done') {
      if (this.lastStep !== 'done') setTimeout(() => toast('新手引导完成，所有功能已开放'), 1200);
      this.lastStep = step;
      this.teardown();
      return false;
    }
    this.lastStep = step;
    const rule = ROUTES[step];
    if (!rule.allowed.includes(route)) { this.ctx.navigate(rule.fallback); return true; }
    const view = viewOf(step, route, param);
    if ('redirect' in view) { this.ctx.navigate(view.redirect); return true; }
    this.view = view;
    this.paint();
    return false;
  }

  private paint(): void {
    const view = this.view!;
    if (!this.layer) {
      this.layer = document.createElement('div');
      this.layer.className = 'tut-layer';
      this.layer.innerHTML = '<div class="tut-hole" aria-hidden="true"></div><section class="tut-bubble" role="dialog" aria-live="polite" aria-labelledby="tutTitle"><small>新手引导</small><h2 id="tutTitle"></h2><p></p><button class="tut-action" type="button" hidden></button></section>';
      document.body.appendChild(this.layer);
      this.layer.querySelector('.tut-action')!.addEventListener('click', () => this.view?.action?.run(this.ctx));
      this.timer = window.setInterval(() => this.place(), 150);
    }
    this.layer.classList.toggle('no-dim', !!view.noDim);
    this.layer.querySelector('h2')!.textContent = view.title;
    this.layer.querySelector('p')!.textContent = view.text;
    const button = this.layer.querySelector<HTMLButtonElement>('.tut-action')!;
    button.hidden = !view.action;
    button.textContent = view.action?.label ?? '';
    this.place();
    if (view.action) button.focus({ preventScroll: true });
  }

  /** 聚光框跟随目标；战斗全屏接管时整层隐藏 */
  private place(): void {
    if (!this.layer || !this.view) return;
    // 步骤在屏内被推进（例如新手十连成交后）：立即按新步骤重排或撤掉遮罩
    if (this.ctx.save().onboarding.step !== this.lastStep) { this.sync(...this.route); return; }
    const inBattle = !this.battleRoot.hidden;
    this.layer.hidden = inBattle;
    if (inBattle) return;
    const hole = this.layer.querySelector<HTMLElement>('.tut-hole')!;
    const bubble = this.layer.querySelector<HTMLElement>('.tut-bubble')!;
    const el = this.view.target ? document.querySelector<HTMLElement>(this.view.target) : null;
    const rect = el && el.offsetParent !== null ? el.getBoundingClientRect() : null;
    this.layer.classList.toggle('has-hole', !!rect);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const bw = bubble.offsetWidth;
    const bh = bubble.offsetHeight;
    if (!rect) {
      bubble.style.left = `${Math.round((vw - bw) / 2)}px`;
      bubble.style.top = `${Math.round((vh - bh) / 2)}px`;
      return;
    }
    const pad = 8;
    if (this.view.pinTop) {
      bubble.style.left = `${Math.round((vw - bw) / 2)}px`;
      bubble.style.top = '16px';
    }
    Object.assign(hole.style, {
      left: `${rect.left - pad}px`, top: `${rect.top - pad}px`,
      width: `${rect.width + pad * 2}px`, height: `${rect.height + pad * 2}px`,
    });
    if (this.view.pinTop) return;
    const gap = 18;
    let top = rect.bottom + pad + gap;
    if (top + bh > vh - 12) top = rect.top - pad - gap - bh;
    if (top < 12) top = Math.min(vh - bh - 12, Math.max(12, rect.top + rect.height / 2 - bh / 2));
    let left = rect.left + rect.width / 2 - bw / 2;
    // 目标在侧栏时（上下都放不下）改放到侧面
    if (top < rect.bottom && top + bh > rect.top) left = rect.right + pad + gap + bw < vw ? rect.right + pad + gap : rect.left - pad - gap - bw;
    bubble.style.left = `${Math.round(Math.min(vw - bw - 12, Math.max(12, left)))}px`;
    bubble.style.top = `${Math.round(top)}px`;
  }

  private allowed(node: EventTarget | Element | null): boolean {
    if (!(node instanceof Element)) return false;
    if (node.closest('.tut-bubble')) return true;
    const selectors = [...(this.view?.allow ?? []), ...(this.view?.target ? [this.view.target] : [])];
    return selectors.some((selector) => node.closest(selector));
  }

  private guard(event: Event): void {
    if (!this.view || !this.layer || this.layer.hidden) return;
    if (this.allowed(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  private teardown(): void {
    this.view = null;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.layer?.remove();
    this.layer = null;
  }
}
