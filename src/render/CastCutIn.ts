/**
 * 施法演出（skill-cast 演出的第一拍）。
 *
 * 由事件流里的 `skill-cast` 驱动：无论施法来自点卡、快速释放、自动战斗还是测试钩子，都走同一条演出。
 *
 * 我方：棋盘中部铺开一条斜切暗色横带（带施法者主法力色的淡光），立绘从横带左侧探出——上半身完整、
 * 只在底边与右缘羽化，不再贴舞台左下角、也不压两侧卡列；立绘右侧是名牌（施法者名 + 衬线暖金技能名
 * + 自左生长的细金线）。入场 260ms（横带自左展开、立绘自左滑入）→ 停留 → 退场 280ms。
 *
 * 敌方：没有立绘。棋盘右上方出一条小名牌（「敌方 · 名字」+ 技能名，红色调），让敌方施法有明确的
 * 「预告」而不是突然结算。
 *
 * 双方共用 App 侧统一的「蓄力 → 发射」：预留段内施法卡蓄力光 + 合成蓄力音 + 震颤渐强，
 * 预留段末尾（EventStreamPlayer.onCastRelease）一记冲击音 + 震屏，随即结算技能。
 *
 * 时间以 1× 编写（战斗倍速统一作用于 wrapper 内的有限 WAAPI 动画与时间线）。EventStreamPlayer 在
 * skill-cast 之后按阵营预留 reserveMs / enemyReserveMs，退场淡出与随后的技能演出重叠。
 * prefers-reduced-motion 时只做透明度变化。
 */

export const CAST_CUTIN_TIMING = {
  enterMs: 260,
  holdMs: 420,
  exitMs: 280,
  /** 时间线在我方 skill-cast 之后预留：入场 + 停留（退场与技能演出重叠） */
  reserveMs: 680,
  /** 敌方施法预告：名牌 + 蓄力闪光的总时长 */
  enemyTotalMs: 820,
  /** 时间线在敌方 skill-cast 之后预留（预告亮出后再结算技能） */
  enemyReserveMs: 450,
} as const;

/** 施法者是否我方（由 App 注册；EventStreamPlayer 构建时间线时据此决定预留时长） */
let sideResolver: ((characterId: number) => boolean) | null = null;

/** 注册「是否我方施法者」判定，返回注销函数（只注销自己注册的那一个） */
export function registerCastCutInSide(resolver: (characterId: number) => boolean): () => void {
  sideResolver = resolver;
  return () => {
    if (sideResolver === resolver) sideResolver = null;
  };
}

/** skill-cast 之后时间线应预留的秒数：我方 = 切入入场+停留，敌方 = 预告时长；未注册（单测）= 0 */
export function castCutInReserveSeconds(characterId: number): number {
  if (!sideResolver) return 0;
  return (sideResolver(characterId) ? CAST_CUTIN_TIMING.reserveMs : CAST_CUTIN_TIMING.enemyReserveMs) / 1000;
}

export interface CastCutInSpec {
  portrait: string;
  casterName: string;
  skillName: string;
  /** 施法者主法力色（CSS 颜色），用于横带淡光与轮廓光 */
  tint: string;
}

/** 棋盘在 wrapper 布局坐标里的位置（正方形） */
export interface BoardRect {
  left: number;
  top: number;
  size: number;
}

/** 我方切入几何（wrapper 布局像素）：横带横跨棋盘中部，立绘底边落在横带底边、上半身探出横带 */
export function castCutInGeometry(board: BoardRect): {
  bandLeft: number; bandTop: number; bandW: number; bandH: number;
  artLeft: number; artTop: number; artW: number; artH: number;
  plateLeft: number; plateTop: number; plateMaxW: number;
  casterFont: number; skillFont: number;
} {
  const s = board.size;
  const bandH = Math.round(s * 0.34);
  const bandTop = Math.round(board.top + s * 0.53 - bandH / 2);
  const artH = Math.round(s * 0.68);
  const artW = Math.round(artH * 2 / 3);
  const artLeft = Math.round(board.left + s * 0.03);
  const artTop = bandTop + bandH - artH;
  const plateLeft = artLeft + Math.round(artW * 0.92);
  return {
    bandLeft: Math.round(board.left - s * 0.02),
    bandTop,
    bandW: Math.round(s * 1.04),
    bandH,
    artLeft,
    artTop,
    artW,
    artH,
    plateLeft,
    plateTop: bandTop + Math.round(bandH * 0.5),
    plateMaxW: Math.max(120, Math.round(board.left + s * 0.97 - plateLeft)),
    casterFont: Math.max(11, Math.round(s * 0.026)),
    skillFont: Math.max(16, Math.round(s * 0.058)),
  };
}

/** 敌方预告名牌几何：棋盘右上方、右对齐 */
export function enemyCastPlateGeometry(board: BoardRect): { right: number; top: number; font: number; maxW: number } {
  const s = board.size;
  return {
    right: Math.round(board.left + s * 0.97),
    top: Math.round(board.top + s * 0.05),
    font: Math.max(13, Math.round(s * 0.036)),
    maxW: Math.round(s * 0.7),
  };
}

let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
  .cci{position:absolute;inset:0;z-index:1050;pointer-events:none;opacity:0;overflow:visible}
  /* 斜切横带：两端羽化，底色暗、叠一层施法者色淡光，上下各一道细金线 */
  .cci-band{position:absolute;overflow:hidden;transform-origin:0 50%;
    clip-path:polygon(0 8%,100% 0,100% 92%,0 100%);
    background:
      linear-gradient(90deg,transparent 0%,rgba(6,5,10,.9) 7%,rgba(6,5,10,.86) 70%,rgba(6,5,10,.62) 90%,transparent 100%)}
  .cci-band::before{content:"";position:absolute;inset:0;mix-blend-mode:screen;opacity:.34;
    background:radial-gradient(60% 120% at 22% 50%,var(--tint,#e6c979) 0%,transparent 70%)}
  .cci-band::after{content:"";position:absolute;inset:0;
    background:
      linear-gradient(90deg,transparent 4%,rgba(226,194,122,.75) 30%,rgba(226,194,122,.3) 85%,transparent 98%) 0 7%/100% 1px no-repeat,
      linear-gradient(90deg,transparent 4%,rgba(226,194,122,.75) 30%,rgba(226,194,122,.3) 85%,transparent 98%) 0 93%/100% 1px no-repeat}
  /* 立绘：取上半身，只羽化底边与右缘；轻微轮廓光 */
  .cci-art{position:absolute;overflow:hidden;transform-origin:30% 100%;will-change:transform;
    -webkit-mask-image:linear-gradient(to bottom,transparent 0%,#000 16%,#000 76%,transparent 100%),linear-gradient(to right,transparent 0%,#000 14%,#000 66%,transparent 100%);
    -webkit-mask-composite:source-in;
    mask-image:linear-gradient(to bottom,transparent 0%,#000 16%,#000 76%,transparent 100%),linear-gradient(to right,transparent 0%,#000 14%,#000 66%,transparent 100%);
    mask-composite:intersect}
  .cci-img{position:absolute;left:-18%;top:0;width:136%;height:136%;object-fit:cover;object-position:50% 4%;display:block;
    transition:opacity .2s ease}
  .cci.pending .cci-img{opacity:0}
  .cci-rim{position:absolute;inset:0;mix-blend-mode:screen;opacity:.2;
    background:radial-gradient(80% 60% at 80% 20%,var(--tint,#e6c979) 0%,transparent 60%)}
  .cci-plate{position:absolute;transform:translateY(-50%);display:flex;flex-direction:column;align-items:flex-start;gap:.3em;white-space:nowrap}
  .cci-caster{font-family:"Oswald","PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:.34em;color:#cdb785;
    text-shadow:0 1px 3px rgba(0,0,0,.95)}
  .cci-skill{font-family:"Palatino Linotype","STZhongsong","Songti SC",Georgia,serif;font-weight:700;
    letter-spacing:.08em;line-height:1.1;color:#f2dca4;max-width:100%;overflow:hidden;text-overflow:ellipsis;
    text-shadow:0 2px 6px rgba(0,0,0,.92),0 0 2px rgba(0,0,0,.9)}
  .cci-rule{display:block;height:1px;width:100%;min-width:100px;margin-top:.15em;transform-origin:left center;
    background:linear-gradient(90deg,#e2c27a 0%,rgba(226,194,122,.5) 60%,rgba(226,194,122,0) 100%)}

  /* 敌方预告名牌：棋盘右上方，右对齐，红色调 */
  .cce{position:absolute;z-index:1050;pointer-events:none;display:flex;flex-direction:column;align-items:flex-end;gap:.2em;
    padding:.45em 1em .5em 1.6em;white-space:nowrap;transform:translateX(-100%);opacity:0;
    clip-path:polygon(8% 0,100% 0,100% 100%,0 100%);
    background:linear-gradient(270deg,rgba(40,8,10,.92) 0%,rgba(24,6,8,.86) 70%,rgba(24,6,8,0) 100%);
    border-right:2px solid rgba(232,96,84,.9);box-shadow:0 6px 16px rgba(0,0,0,.5)}
  .cce-who{font:.62em "Oswald","PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:.3em;color:#e3a79c;text-shadow:0 1px 2px #000}
  .cce-skill{font:700 1em/1.1 "Palatino Linotype","STZhongsong","Songti SC",Georgia,serif;letter-spacing:.08em;color:#ffd9cf;
    overflow:hidden;text-overflow:ellipsis;text-shadow:0 2px 5px rgba(0,0,0,.9),0 0 10px rgba(232,96,84,.45)}
  `;
  const style = document.createElement('style');
  style.id = 'cci-styles';
  style.textContent = css;
  document.head.appendChild(style);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface Active { el: HTMLElement; animations: Animation[] }

export class CastCutIn {
  private active: Active | null = null;
  private enemy: Active | null = null;

  constructor(private parent: HTMLElement, private board: BoardRect) {
    ensureStyles();
  }

  /** 棋盘几何变化时更新（与详情窗同一口径） */
  setBoard(board: BoardRect): void {
    this.board = board;
  }

  /** 我方施法切入；上一段若还在屏上，快速淡出让位（每次我方施法各有一段） */
  play(spec: CastCutInSpec): void {
    this.retire(this.active);
    this.active = null;
    const g = castCutInGeometry(this.board);
    const { enterMs, holdMs, exitMs } = CAST_CUTIN_TIMING;
    const total = enterMs + holdMs + exitMs;
    const inEnd = enterMs / total;
    const outStart = (enterMs + holdMs) / total;

    const el = document.createElement('div');
    el.className = 'cci';
    el.dataset.testid = 'cast-cutin';
    el.setAttribute('aria-hidden', 'true');
    el.style.setProperty('--tint', spec.tint);
    el.innerHTML = `
      <div class="cci-band" style="left:${g.bandLeft}px;top:${g.bandTop}px;width:${g.bandW}px;height:${g.bandH}px"></div>
      <div class="cci-art" style="left:${g.artLeft}px;top:${g.artTop}px;width:${g.artW}px;height:${g.artH}px">
        <img class="cci-img" alt="" draggable="false">
        <div class="cci-rim"></div>
      </div>
      <div class="cci-plate" style="left:${g.plateLeft}px;top:${g.plateTop}px;max-width:${g.plateMaxW}px">
        <span class="cci-caster" style="font-size:${g.casterFont}px">${esc(spec.casterName)}</span>
        <strong class="cci-skill" style="font-size:${g.skillFont}px">${esc(spec.skillName)}</strong>
        <i class="cci-rule"></i>
      </div>`;
    const img = el.querySelector('.cci-img') as HTMLImageElement;
    el.classList.add('pending');
    // 立绘没加载好也照常出名牌；加载完成后在停留期内淡入
    if (spec.portrait) {
      img.addEventListener('load', () => el.classList.remove('pending'), { once: true });
      img.src = spec.portrait;
      if (img.complete && img.naturalWidth > 0) el.classList.remove('pending');
    }
    this.parent.appendChild(el);

    const timing: KeyframeAnimationOptions = { duration: total, fill: 'both' };
    const animations: Animation[] = [el.animate([
      { opacity: 0, offset: 0, easing: 'cubic-bezier(.2,.8,.25,1)' },
      { opacity: 1, offset: inEnd },
      { opacity: 1, offset: outStart, easing: 'cubic-bezier(.33,0,.67,1)' },
      { opacity: 0, offset: 1 },
    ], timing)];
    if (!reducedMotion()) {
      const band = el.querySelector('.cci-band') as HTMLElement;
      const art = el.querySelector('.cci-art') as HTMLElement;
      const plate = el.querySelector('.cci-plate') as HTMLElement;
      const rule = el.querySelector('.cci-rule') as HTMLElement;
      animations.push(band.animate([
        { transform: 'scaleX(.2)', offset: 0, easing: 'cubic-bezier(.2,.8,.25,1)' },
        { transform: 'scaleX(1)', offset: inEnd },
        { transform: 'scaleX(1)', offset: 1 },
      ], timing));
      animations.push(art.animate([
        { transform: 'translateX(-14%) scale(1)', offset: 0, easing: 'cubic-bezier(.2,.8,.25,1)' },
        { transform: 'translateX(0) scale(1.004)', offset: inEnd, easing: 'linear' },
        { transform: 'translateX(0) scale(1.02)', offset: outStart, easing: 'ease-in' },
        { transform: 'translateX(3%) scale(1.024)', offset: 1 },
      ], timing));
      const plateIn = Math.min(outStart, (enterMs + 120) / total);
      animations.push(plate.animate([
        { opacity: 0, transform: 'translate(-14px,-50%)', offset: 0 },
        { opacity: 0, transform: 'translate(-14px,-50%)', offset: Math.min(plateIn, 110 / total), easing: 'cubic-bezier(.2,.8,.25,1)' },
        { opacity: 1, transform: 'translate(0,-50%)', offset: plateIn },
        { opacity: 1, transform: 'translate(0,-50%)', offset: outStart, easing: 'ease-in' },
        { opacity: 0, transform: 'translate(8px,-50%)', offset: 1 },
      ], timing));
      const ruleEnd = Math.min(outStart, (enterMs + 260) / total);
      animations.push(rule.animate([
        { transform: 'scaleX(0)', offset: 0 },
        { transform: 'scaleX(0)', offset: Math.min(ruleEnd, 160 / total), easing: 'cubic-bezier(.3,.7,.2,1)' },
        { transform: 'scaleX(1)', offset: ruleEnd },
        { transform: 'scaleX(1)', offset: 1 },
      ], timing));
    }
    const entry: Active = { el, animations };
    this.active = entry;
    animations[0].onfinish = () => {
      el.remove();
      if (this.active === entry) this.active = null;
    };
  }

  /** 敌方施法预告：棋盘右上方的小名牌（无立绘） */
  playEnemy(spec: { casterName: string; skillName: string }): void {
    this.retire(this.enemy);
    this.enemy = null;
    const g = enemyCastPlateGeometry(this.board);
    const el = document.createElement('div');
    el.className = 'cce';
    el.dataset.testid = 'enemy-cast-plate';
    el.setAttribute('role', 'status');
    el.style.left = `${g.right}px`;
    el.style.top = `${g.top}px`;
    el.style.fontSize = `${g.font}px`;
    el.style.maxWidth = `${g.maxW}px`;
    el.innerHTML = `<span class="cce-who">敌方 · ${esc(spec.casterName)}</span><strong class="cce-skill">${esc(spec.skillName || '施放技能')}</strong>`;
    this.parent.appendChild(el);
    const total = CAST_CUTIN_TIMING.enemyTotalMs;
    const motion = !reducedMotion();
    const anim = el.animate([
      { opacity: 0, transform: `translateX(-100%)${motion ? ' translateX(18px)' : ''}`, offset: 0, easing: 'cubic-bezier(.2,.8,.25,1)' },
      { opacity: 1, transform: 'translateX(-100%)', offset: 0.22 },
      { opacity: 1, transform: 'translateX(-100%)', offset: 0.72, easing: 'ease-in' },
      { opacity: 0, transform: 'translateX(-100%)', offset: 1 },
    ], { duration: total, fill: 'both' });
    const entry: Active = { el, animations: [anim] };
    this.enemy = entry;
    anim.onfinish = () => {
      el.remove();
      if (this.enemy === entry) this.enemy = null;
    };
  }

  /** 立刻移除（战斗销毁/中断时） */
  cancel(): void {
    for (const entry of [this.active, this.enemy]) {
      if (!entry) continue;
      for (const animation of entry.animations) animation.cancel();
      entry.el.remove();
    }
    this.active = null;
    this.enemy = null;
  }

  /** 让位：以短淡出退场 */
  private retire(entry: Active | null): void {
    if (!entry) return;
    const opacity = Number(getComputedStyle(entry.el).opacity) || 0;
    for (const animation of entry.animations) animation.cancel();
    const fade = entry.el.animate([{ opacity }, { opacity: 0 }], { duration: 120, easing: 'ease-in', fill: 'forwards' });
    fade.onfinish = () => entry.el.remove();
  }
}
