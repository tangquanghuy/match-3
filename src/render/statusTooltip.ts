/**
 * 卡面徽记悬停说明（状态 / 特质 / 法力书签）。
 *
 * 交互规则：战斗卡上任意位置的点按都执行卡片动作（打开详情窗 / 快速释放），
 * 徽记不再拦截点击——完整说明在详情窗里。这一层只给精细指针（鼠标）提供悬停浮层：
 * 以 document 级 pointerover/pointerout 委托工作，触控/手写笔不弹；任何按下即收起，
 * 免得浮层盖住随后打开的详情窗。面板挂 body、fixed 定位（避免被卡片圆角裁剪），按视口夹取。
 *
 * 效果文案按 BADGES 中文名对齐（标签唯一），语义与引擎实现一致。
 */
import { STATUS_DESCRIPTIONS } from '../data/statusDescriptions';

const STYLE_ID = 'status-tooltip-style';
let installed = false;
let openTip: HTMLElement | null = null;
let openTipBadge: HTMLElement | null = null;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
/* 徽记只作悬停命中区（事件照常冒泡到卡片） */
.gcard .status-strip{pointer-events:auto}
.gcard .status-badge{pointer-events:auto}
.gcard .trait-badge{pointer-events:auto}
.gcard .gem{pointer-events:auto}
.gcard .photo,.gcard .art .vig{pointer-events:none}
.status-tooltip{position:fixed;z-index:1260;max-width:min(210px,calc(100vw - 20px));padding:7px 9px;border-radius:7px;
  background:rgba(14,11,6,.96);border:1px solid var(--stc,#d8c290);
  box-shadow:0 4px 14px rgba(0,0,0,.55);font-family:"Oswald","Microsoft YaHei",sans-serif;
  font-size:11px;line-height:1.55;color:#efe2c0;pointer-events:none}
.status-tooltip .st-title{font-weight:700;letter-spacing:.06em;color:var(--stc,#d8c290);margin-bottom:2px}
.status-tooltip::before{content:"";position:absolute;top:-5px;left:var(--caret,50%);width:8px;height:8px;
  background:inherit;border-left:1px solid var(--stc,#d8c290);border-top:1px solid var(--stc,#d8c290);
  transform:translateX(-50%) rotate(45deg)}
@media (prefers-reduced-motion:reduce){.status-tooltip{transition:none}}
@media (max-width:760px){.status-tooltip{max-width:min(184px,calc(100vw - 16px));padding:6px 8px;font-size:10px}}
`;
  document.head.appendChild(style);
}

function closeTip(): void {
  openTip?.remove();
  openTip = null;
  openTipBadge = null;
}

function openTipFor(badge: HTMLElement): void {
  if (openTip && openTipBadge === badge) return;
  closeTip();

  const isTrait = badge.classList.contains('trait-badge');
  const isMana = badge.classList.contains('gem');
  // B-8（UX 阶段 B）：标题来源改 data-*。此前从原生 title 里切字符串——
  // 而 title 与自绘浮层双轨并存、内容不一致；TeamView 已撤掉 title，这里从
  // data-status-label / data-trait-name 取，单一事实源（旧 title 留作兜底）。
  const title = isMana
    ? (badge.dataset.manaTitle ?? '法力值')
    : isTrait
      ? (badge.dataset.traitName ?? '特质')
      : (badge.dataset.statusLabel ?? (badge.getAttribute('title') ?? '').split(' · ')[0].trim());
  const desc = isMana
    ? (badge.dataset.manaDesc ?? '积攒法力值后可以释放技能。')
    : isTrait
      ? (badge.dataset.traitDesc || '这条特质暂无描述。')
      : (STATUS_DESCRIPTIONS[title] ?? '效果未知。');
  const color = isMana
    ? '#8fb8ff'
    : isTrait
      ? (badge.dataset.traitOff === '1' ? '#8a7c5c' : '#e0c98a')
      : badge.style.getPropertyValue('--sb') || '#d8c290';

  // 实例实际数值行（TeamView renderStatuses 注入的 data-*）：
  // 带 magnitude 的（DoT 类）显示每回合伤害，其余显示剩余回合。
  // 特质用同一行位置说明「本场不生效」（未实现 code 的玩家口径）。
  const live: string[] = [];
  if (isMana) {
    if (badge.dataset.manaColors) live.push(`关联颜色：${badge.dataset.manaColors}`);
  } else if (isTrait) {
    if (badge.dataset.traitOff === '1') live.push('本场不生效');
  } else {
    const turns = badge.dataset.turns ?? '';
    const magnitude = badge.dataset.magnitude;
    if (magnitude !== undefined) live.push(`每回合 ${magnitude} 点`);
    if (turns && turns !== '0') live.push(`剩余 ${turns} 回合`);
  }
  const liveLine = live.length > 0 ? `<div class="st-live"></div>` : '';

  const tip = document.createElement('div');
  tip.className = 'status-tooltip';
  tip.style.setProperty('--stc', color);
  tip.innerHTML = `<div class="st-title"></div><div class="st-desc"></div>${liveLine}`;
  (tip.querySelector('.st-title') as HTMLElement).textContent = title || '状态';
  (tip.querySelector('.st-desc') as HTMLElement).textContent = desc;
  if (liveLine) {
    const el = tip.querySelector('.st-live') as HTMLElement;
    el.style.opacity = '.8';
    el.textContent = isTrait || isMana ? live.join(' · ') : `当前：${live.join(' · ')}`;
  }
  document.body.appendChild(tip);

  // 定位：徽记正下方居中，左右按视口夹取，底部放不下时翻转到上方
  const r = badge.getBoundingClientRect();
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  let left = r.left + r.width / 2 - tw / 2;
  left = Math.max(6, Math.min(left, window.innerWidth - tw - 6));
  let top = r.bottom + 7;
  if (top + th > window.innerHeight - 6) top = Math.max(6, r.top - th - 7);
  tip.style.left = `${Math.round(left)}px`;
  tip.style.top = `${Math.round(top)}px`;
  tip.style.setProperty('--caret', `${Math.round(r.left + r.width / 2 - left)}px`);
  openTip = tip;
  openTipBadge = badge;
}

/** 悬停浮层只服务精细指针：触控点按走卡片动作，说明在详情窗里。 */
export function tooltipPointerAllowed(pointerType: string, finePointer: boolean): boolean {
  return pointerType === 'mouse' && finePointer;
}

/**
 * 安装卡面徽记悬停说明（App.init 调用一次；重复调用幂等）。
 * document 级委托：之后动态创建/销毁的徽记无需重新绑定。只监听、不拦截——
 * 徽记上的按下/点击照常冒泡到卡片（卡面任意位置都执行卡片动作）。
 */
export function installStatusTooltips(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  ensureStyle();

  const fine = typeof window.matchMedia === 'function'
    ? window.matchMedia('(hover: hover) and (pointer: fine)')
    : null;
  // 状态、特质和法力书签共用同一套浮层。
  const badgeOf = (target: EventTarget | null): HTMLElement | null =>
    (target as HTMLElement | null)?.closest?.('.status-badge,.trait-badge,.gcard .gem') as HTMLElement | null;

  document.addEventListener('pointerover', (e) => {
    if (!tooltipPointerAllowed(e.pointerType, fine?.matches ?? true)) return;
    const badge = badgeOf(e.target);
    if (badge) openTipFor(badge);
  });
  document.addEventListener('pointerout', (e) => {
    if (!openTipBadge) return;
    const next = e.relatedTarget as Node | null;
    // 在同一枚徽记内部移动（子节点之间）不收起
    if (next && openTipBadge.contains(next)) return;
    if (badgeOf(e.target) === openTipBadge) closeTip();
  });
  // 任何按下都收起：点徽记=点卡片，随后打开的详情窗不能被残留浮层盖住
  document.addEventListener('pointerdown', closeTip, true);
  window.addEventListener('blur', closeTip);
  window.addEventListener('scroll', closeTip, true);
}
