/**
 * 我方施法立绘切入（skill-cast 演出的第一拍）。
 *
 * 由事件流里的 `skill-cast`（施法者在左方）驱动：无论施法来自点卡、快速释放、自动战斗
 * 还是测试钩子，都走同一条演出。敌方施法没有立绘，只有原来的施法音效。
 *
 * 画面：舞台左下角、底边锚定，压住我方列底部与棋盘左下；高 ≈62% 舞台、2:3。
 * 立绘向上、向右羽化（无硬边矩形），身后一团自左下角铺开的暗色晕影托住名字；
 * 施法者主法力色的低透明度轮廓光；停留期缓慢推近（1.00→1.02）。立绘右侧近底处是
 * 名牌：小号字距拉开的施法者名 + 衬线暖金技能名 + 自左生长的细金线。
 *
 * 时间（1× 编写，战斗速度由 lane B 统一作用于 wrapper 内所有有限 WAAPI 动画与时间线）：
 * 入场 260ms（自左滑入约 8% + 淡入）→ 停留 → 退场 280ms（淡出 + 轻微漂移）。
 * EventStreamPlayer 在 skill-cast 之后预留 CAST_CUTIN_TIMING.reserveMs，退场淡出与随后的技能
 * 演出开头重叠。prefers-reduced-motion 时只做透明度变化。
 */

export const CAST_CUTIN_TIMING = {
  enterMs: 260,
  holdMs: 400,
  exitMs: 280,
  /** 时间线在 skill-cast 之后为我方施法预留的时长：入场 + 停留（退场与技能演出重叠） */
  reserveMs: 680,
} as const;

/** 施法者是否我方（由 App 注册；EventStreamPlayer 构建时间线时据此决定是否预留切入时长） */
let sideResolver: ((characterId: number) => boolean) | null = null;

/** 注册「是否我方施法者」判定，返回注销函数（只注销自己注册的那一个） */
export function registerCastCutInSide(resolver: (characterId: number) => boolean): () => void {
  sideResolver = resolver;
  return () => {
    if (sideResolver === resolver) sideResolver = null;
  };
}

/** skill-cast 之后时间线应预留的秒数：我方施法者 = 切入入场+停留，其余 = 0 */
export function castCutInReserveSeconds(characterId: number): number {
  return sideResolver?.(characterId) ? CAST_CUTIN_TIMING.reserveMs / 1000 : 0;
}

export interface CastCutInSpec {
  portrait: string;
  casterName: string;
  skillName: string;
  /** 施法者主法力色（CSS 颜色），用于轮廓光 */
  tint: string;
}

/** 切入几何（舞台布局像素）：高约 62% 舞台、2:3，底边锚定在舞台左下 */
export function castCutInGeometry(stageW: number, stageH: number): {
  artW: number; artH: number; plateLeft: number; plateBottom: number; plateMaxW: number;
  casterFont: number; skillFont: number;
} {
  const artH = Math.round(stageH * 0.62);
  const artW = Math.round(artH * 2 / 3);
  return {
    artW,
    artH,
    plateLeft: Math.round(artW * 0.74),
    plateBottom: Math.round(artH * 0.13),
    plateMaxW: Math.max(160, Math.round(stageW - artW * 0.74 - stageW * 0.08)),
    casterFont: Math.max(11, Math.round(stageH * 0.016)),
    skillFont: Math.max(15, Math.round(stageH * 0.036)),
  };
}

let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
  .cci{position:absolute;left:0;bottom:0;z-index:40;pointer-events:none;opacity:0;overflow:visible}
  .cci-vignette{position:absolute;left:0;bottom:0;pointer-events:none;
    background:radial-gradient(ellipse 100% 100% at 0% 100%,rgba(5,4,9,.93) 0%,rgba(5,4,9,.82) 28%,rgba(5,4,9,.55) 48%,rgba(5,4,9,.24) 64%,transparent 80%)}
  /* 立绘原图是 2:3 全身像：放大取上半身（脸落在切入框约三成高度），
     顶边与右边羽化进暗晕，左边轻微羽化，底边贴舞台底 */
  .cci-art{position:absolute;left:0;bottom:0;overflow:hidden;transform-origin:22% 100%;will-change:transform;
    -webkit-mask-image:linear-gradient(to bottom,transparent 0%,rgba(0,0,0,.55) 14%,#000 30%),linear-gradient(to right,transparent 0,#000 5%,#000 50%,transparent 96%);
    -webkit-mask-composite:source-in;
    mask-image:linear-gradient(to bottom,transparent 0%,rgba(0,0,0,.55) 14%,#000 30%),linear-gradient(to right,transparent 0,#000 5%,#000 50%,transparent 96%);
    mask-composite:intersect}
  .cci-img{position:absolute;left:-30%;top:6%;width:150%;height:150%;object-fit:cover;object-position:50% 0;display:block;
    transition:opacity .2s ease}
  .cci.pending .cci-img{opacity:0}
  .cci-rim{position:absolute;inset:0;mix-blend-mode:screen;opacity:.26;
    background:radial-gradient(90% 70% at 88% 18%,var(--tint,#e6c979) 0%,transparent 58%),
      linear-gradient(to top right,transparent 55%,color-mix(in srgb,var(--tint,#e6c979) 60%,transparent) 100%)}
  .cci-plate{position:absolute;display:flex;flex-direction:column;align-items:flex-start;gap:.28em;white-space:nowrap}
  .cci-caster{font-family:"Oswald","PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:.34em;color:#cdb785;
    text-shadow:0 1px 3px rgba(0,0,0,.95),0 0 8px rgba(0,0,0,.7)}
  .cci-skill{font-family:"Playfair Display","Noto Serif SC","Songti SC","STSong",Georgia,serif;font-weight:700;
    letter-spacing:.06em;line-height:1.1;color:#f2dca4;max-width:100%;overflow:hidden;text-overflow:ellipsis;
    text-shadow:0 2px 6px rgba(0,0,0,.92),0 0 2px rgba(0,0,0,.9),0 0 14px rgba(0,0,0,.55)}
  .cci-rule{display:block;height:1px;width:100%;min-width:120px;margin-top:.2em;transform-origin:left center;
    background:linear-gradient(90deg,#e2c27a 0%,rgba(226,194,122,.55) 55%,rgba(226,194,122,0) 100%);
    box-shadow:0 0 6px rgba(226,194,122,.35)}
  `;
  const style = document.createElement('style');
  style.id = 'cci-styles';
  style.textContent = css;
  document.head.appendChild(style);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class CastCutIn {
  private active: { el: HTMLElement; animations: Animation[] } | null = null;

  constructor(private parent: HTMLElement, private stage: { width: number; height: number }) {
    ensureStyles();
  }

  /** 播放一次切入；上一段若还在屏上，快速淡出让位（每次我方施法各有一段） */
  play(spec: CastCutInSpec): void {
    this.retire();
    const g = castCutInGeometry(this.stage.width, this.stage.height);
    const { enterMs, holdMs, exitMs } = CAST_CUTIN_TIMING;
    const total = enterMs + holdMs + exitMs;
    const inEnd = enterMs / total;
    const outStart = (enterMs + holdMs) / total;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    const el = document.createElement('div');
    el.className = 'cci';
    el.dataset.testid = 'cast-cutin';
    el.setAttribute('aria-hidden', 'true');
    el.style.setProperty('--tint', spec.tint);
    el.style.width = `${Math.round(g.artW * 2.4)}px`;
    el.style.height = `${g.artH}px`;
    el.innerHTML = `
      <div class="cci-vignette" style="width:${Math.round(g.artW * 2.9)}px;height:${Math.round(g.artH * 1.15)}px"></div>
      <div class="cci-art" style="width:${g.artW}px;height:${g.artH}px">
        <img class="cci-img" alt="" draggable="false">
        <div class="cci-rim"></div>
      </div>
      <div class="cci-plate" style="left:${g.plateLeft}px;bottom:${g.plateBottom}px;max-width:${g.plateMaxW}px">
        <span class="cci-caster" style="font-size:${g.casterFont}px">${esc(spec.casterName)}</span>
        <strong class="cci-skill" style="font-size:${g.skillFont}px">${esc(spec.skillName)}</strong>
        <i class="cci-rule"></i>
      </div>`;
    const img = el.querySelector('.cci-img') as HTMLImageElement;
    // 立绘没加载好也照常出名牌；加载完成后在停留期内淡入
    if (spec.portrait) {
      el.classList.add('pending');
      img.addEventListener('load', () => el.classList.remove('pending'), { once: true });
      img.src = spec.portrait;
      if (img.complete && img.naturalWidth > 0) el.classList.remove('pending');
    } else {
      el.classList.add('pending');
    }
    this.parent.appendChild(el);

    const art = el.querySelector('.cci-art') as HTMLElement;
    const plate = el.querySelector('.cci-plate') as HTMLElement;
    const rule = el.querySelector('.cci-rule') as HTMLElement;
    const timing: KeyframeAnimationOptions = { duration: total, fill: 'both' };
    const animations: Animation[] = [];
    animations.push(el.animate([
      { opacity: 0, offset: 0, easing: 'cubic-bezier(.2,.8,.25,1)' },
      { opacity: 1, offset: inEnd },
      { opacity: 1, offset: outStart, easing: 'cubic-bezier(.33,0,.67,1)' },
      { opacity: 0, offset: 1 },
    ], timing));
    if (!reduced) {
      animations.push(art.animate([
        { transform: 'translateX(-8%) scale(1)', offset: 0, easing: 'cubic-bezier(.2,.8,.25,1)' },
        { transform: 'translateX(0) scale(1.003)', offset: inEnd, easing: 'linear' },
        { transform: 'translateX(0) scale(1.017)', offset: outStart, easing: 'ease-in' },
        { transform: 'translateX(-2.5%) scale(1.02)', offset: 1 },
      ], timing));
      const plateIn = Math.min(outStart, (enterMs + 120) / total);
      animations.push(plate.animate([
        { opacity: 0, transform: 'translateX(-12px)', offset: 0 },
        { opacity: 0, transform: 'translateX(-12px)', offset: Math.min(plateIn, 90 / total), easing: 'cubic-bezier(.2,.8,.25,1)' },
        { opacity: 1, transform: 'translateX(0)', offset: plateIn },
        { opacity: 1, transform: 'translateX(0)', offset: outStart, easing: 'ease-in' },
        { opacity: 0, transform: 'translateX(6px)', offset: 1 },
      ], timing));
      const ruleEnd = Math.min(outStart, (enterMs + 260) / total);
      animations.push(rule.animate([
        { transform: 'scaleX(0)', offset: 0 },
        { transform: 'scaleX(0)', offset: Math.min(ruleEnd, 150 / total), easing: 'cubic-bezier(.3,.7,.2,1)' },
        { transform: 'scaleX(1)', offset: ruleEnd },
        { transform: 'scaleX(1)', offset: 1 },
      ], timing));
    }
    const entry = { el, animations };
    this.active = entry;
    animations[0].onfinish = () => {
      el.remove();
      if (this.active === entry) this.active = null;
    };
  }

  /** 立刻移除（战斗销毁/中断时） */
  cancel(): void {
    const entry = this.active;
    this.active = null;
    if (!entry) return;
    for (const animation of entry.animations) animation.cancel();
    entry.el.remove();
  }

  /** 让位：当前切入以短淡出退场 */
  private retire(): void {
    const entry = this.active;
    this.active = null;
    if (!entry) return;
    const opacity = Number(getComputedStyle(entry.el).opacity) || 0;
    for (const animation of entry.animations) animation.cancel();
    const fade = entry.el.animate([{ opacity }, { opacity: 0 }], { duration: 120, easing: 'ease-in', fill: 'forwards' });
    fade.onfinish = () => entry.el.remove();
  }
}
