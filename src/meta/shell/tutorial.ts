/**
 * 新手引导：试炼战（含一次释放技能的提示）→ 回到王国 → 领取馈赠 → 新手十连 → 自由行动。
 *
 * 页面引导：全屏压暗，只放行当前目标（聚光框）与对话框；其余点击、按键与越界路由一律拦下。
 * 结算页不加任何遮挡（升级二选一必须能操作），回到地图后再继续引导。
 * 战斗内提示：不压暗、不拦截，只在「第一次有部队攒满法力」时圈出该部队并提示点击释放。
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
        text: '先来一场试炼。交换相邻宝石，三个同色连成一线就能为部队充能；法力攒满后点击部队，释放技能。',
        action: { label: '开始试炼', run: (ctx) => void ctx.launchTutorialBattle() },
      };
    case 'gift':
      if (route === 'gifts') return { target: '[data-gift-claim="starter"]', title: '领取见面礼', text: '1000 宝石，正好够一次新手十连。' };
      return { target: '#railGifts', title: '打得漂亮', text: '成长路上的每一步都有馈赠。先去领取冒险者见面礼。' };
    case 'summon':
      if (route === 'chests') {
        if (param !== 'gems') return { redirect: '#chests/gems' };
        return { target: '[data-open="gem-10"]', title: '新手十连', text: '首次十连只需 1000 宝石，最后一张必定是一名异界来客。' };
      }
      return {
        target: null, title: '召唤伙伴',
        text: '宝石可以在宝箱页召唤部队。首次十连只需 1000 宝石。',
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
  private battleHint: HTMLElement | null = null;
  private view: GuideView | null = null;
  private lastStep: OnboardingStep = 'done';
  private route: [string, string | undefined] = ['map', undefined];
  /** 战斗内释放技能提示：已看到可释放部队 → 已释放（该部队不再可释放）即完成 */
  private castHint: 'waiting' | 'showing' | 'done' = 'waiting';

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
      if (this.lastStep !== 'done') setTimeout(() => toast('新手引导完成，所有功能已开放'), 1200);
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
    this.tickBattle();
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
    const box = this.view.target ? document.querySelector<HTMLElement>(this.view.target)?.getBoundingClientRect() : undefined;
    const rect = box && box.width > 0 && box.height > 0 ? box : null;
    this.layer.classList.toggle('has-hole', !!rect);
    positionBubble(bubble, rect, hole);
  }

  /** 战斗内：第一次有我方部队可释放技能时圈出它并提示点击 */
  private tickBattle(): void {
    const inBattle = !this.battleRoot.hidden;
    if (!inBattle || this.lastStep !== 'battle' || this.castHint === 'done') {
      this.battleHint?.remove();
      this.battleHint = null;
      if (!inBattle && this.castHint === 'showing') this.castHint = 'waiting';
      return;
    }
    const card = this.battleRoot.querySelector<HTMLElement>('.gcard.ally.castable:not(.silenced)');
    if (!card) {
      if (this.castHint === 'showing') this.castHint = 'done'; // 已释放（法力清空）
      this.battleHint?.remove();
      this.battleHint = null;
      return;
    }
    this.castHint = 'showing';
    if (!this.battleHint) {
      this.battleHint = document.createElement('div');
      this.battleHint.className = 'tut-layer tut-battle has-hole';
      this.battleHint.innerHTML = `<div class="tut-hole" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <section class="tut-bubble" aria-live="polite">${guideCardHtml()}</section>`;
      this.battleHint.querySelector('h2')!.textContent = '法力已满';
      this.battleHint.querySelector('p')!.textContent = '点击发光的部队，释放它的技能。';
      this.paintSteps(this.battleHint);
      document.body.appendChild(this.battleHint);
    }
    positionBubble(this.battleHint.querySelector<HTMLElement>('.tut-bubble')!, card.getBoundingClientRect(), this.battleHint.querySelector<HTMLElement>('.tut-hole')!);
  }

  private allowed(node: EventTarget | Element | null): boolean {
    if (!(node instanceof Element)) return false;
    if (node.closest('.tut-layer:not(.tut-battle) .tut-bubble')) return true;
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
    bubble.style.top = `${Math.round((vh - bh) / 2)}px`;
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
  bubble.style.top = `${Math.round(top)}px`;
}
