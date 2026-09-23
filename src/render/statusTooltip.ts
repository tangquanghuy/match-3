/**
 * 状态徽记点击说明（用户需求：点击徽记，向下浮现该状态的具体效果文本）。
 *
 * 零侵入设计：不触碰 statusBadges/TeamView（设计窗口在途重构中），以 document 级
 * 点击委托工作——任何 `.status-badge` 命中即在其下方弹出说明面板，再点同一枚或
 * 点击面板外关闭。状态、特质与法力书签共用这一层；面板挂 body、fixed 定位
 * （避免被卡片圆角裁剪），按视口夹取。
 *
 * 效果文案按 BADGES 中文名对齐（标签唯一），语义与引擎实现一致：
 * 官方查证见 `.kiro/specs/combat-mechanics/GOW-STATUS-RESEARCH.md` 与 GEMS-SEMANTICS-2.md。
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
.status-badge{cursor:pointer}
.gcard .status-strip{pointer-events:auto}
.gcard .status-badge{pointer-events:auto}
.gcard .trait-badge{pointer-events:auto;cursor:pointer}
.gcard .gem{pointer-events:auto;cursor:pointer}
.gcard .photo,.gcard .art .vig{pointer-events:none}
.status-tooltip{position:fixed;z-index:1260;max-width:min(210px,calc(100vw - 20px));padding:7px 9px;border-radius:7px;
  background:rgba(14,11,6,.96);border:1px solid var(--stc,#d8c290);
  box-shadow:0 4px 14px rgba(0,0,0,.55);font-family:"Oswald","Microsoft YaHei",sans-serif;
  font-size:11px;line-height:1.55;color:#efe2c0;pointer-events:auto;user-select:text}
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
  if (openTip && openTipBadge === badge) {
    closeTip();
    return;
  }
  closeTip();

  const isTrait = badge.classList.contains('trait-badge');
  const isMana = badge.classList.contains('gem');
  // B-8（UX 阶段 B）：标题来源改 data-*。此前从原生 title 里切字符串——
  // 而 title 与自绘浮层双轨并存、内容不一致；TeamView 已撤掉 title，这里从
  // data-status-label / data-trait-name 取，单一事实源（旧 title 留作兜底）。
  const title = isMana
    ? (badge.dataset.manaTitle ?? '法力')
    : isTrait
      ? (badge.dataset.traitName ?? '特质')
      : (badge.dataset.statusLabel ?? (badge.getAttribute('title') ?? '').split(' · ')[0].trim());
  const desc = isMana
    ? (badge.dataset.manaDesc ?? '积攒法力后可以释放技能。')
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

/**
 * 安装状态徽记点击说明（App.init 调用一次；重复调用幂等）。
 * document 级捕获委托：之后动态创建/销毁的徽记无需重新绑定。
 * 捕获阶段拦截徽记上的 pointerdown/click：①装饰渐晕层 .vig 盖在徽记上方会吞点击
 * （注入样式置为穿透兜底）；②阻止事件冒泡进卡面短按逻辑（否则点徽记会误放技能）。
 */
export function installStatusTooltips(): void {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  ensureStyle();

  // B-8 覆盖面：状态、特质和法力书签共用同一套浮层。
  const badgeHit = (e: Event): HTMLElement | null => {
    const target = e.target as HTMLElement | null;
    return target?.closest?.('.status-badge,.trait-badge,.gcard .gem') as HTMLElement | null;
  };

  // 捕获阶段阻断：徽记点击不进卡面短按/长按逻辑
  document.addEventListener('pointerdown', (e) => {
    if (badgeHit(e)) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);
  document.addEventListener('pointerup', (e) => {
    if (badgeHit(e)) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, true);

  document.addEventListener('click', (e) => {
    const badge = badgeHit(e);
    if (!badge) {
      closeTip();
      return;
    }
    e.stopPropagation();
    e.preventDefault();
    openTipFor(badge);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (!(e instanceof KeyboardEvent) || (e.key !== 'Enter' && e.key !== ' ')) return;
    const badge = badgeHit(e);
    if (!badge) return;
    e.stopPropagation();
    e.preventDefault();
    openTipFor(badge);
  }, true);

  window.addEventListener('blur', closeTip);
}
