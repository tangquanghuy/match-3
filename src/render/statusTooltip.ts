/**
 * 状态徽记点击说明（用户需求：点击徽记，向下浮现该状态的具体效果文本）。
 *
 * 零侵入设计：不触碰 statusBadges/TeamView（设计窗口在途重构中），以 document 级
 * 点击委托工作——任何 `.status-badge` 命中即在其下方弹出说明面板，再点同一枚或
 * 点击面板外关闭。面板挂 body、fixed 定位（避免被卡片圆角裁剪），按视口夹取。
 *
 * 效果文案按 BADGES 中文名对齐（标签唯一），语义与引擎实现一致：
 * 官方查证见 `.kiro/specs/combat-mechanics/GOW-STATUS-RESEARCH.md` 与 GEMS-SEMANTICS-2.md。
 */

/** 状态效果说明（键 = BADGES 中文名）。数值为引擎默认口径（spell-rules §6 / GEMS-SEMANTICS-2），
 *  技能文本明示时以技能为准；浮层会在下方追加该实例的实际数值行。 */
export const STATUS_DESCRIPTIONS: Record<string, string> = {
  中毒: '每回合受到 3 点毒素伤害（跳过护甲），默认 3 回合，可叠加；具体数值以施加技能为准。',
  燃烧: '每回合受到 3 点火焰伤害，默认 3 回合；具体数值以施加技能为准。',
  沉默: '无法施放技能，默认 3 回合。',
  冰冻: '无法攻击、无法施法，且无法充能。',
  击晕: '跳过行动，且禁用全部特质。',
  缠绕: '无法攻击（仍可施法与充能）。',
  织网: '魔法值视为 0，技能数值只剩基础项；每回合 10% 概率挣脱（失败则 +10%，上限 100%）。',
  屏障: '完全吸收下一次受到的伤害，吸收后消失。',
  出血: '每层每回合受到 1 点伤害，层数可叠加。',
  疾病: '获得的法力减半；每回合 10% 概率自愈。',
  猎人标记: '受到的骷髅伤害会被施术方的屠戮类特质放大。',
  下潮: '不可被技能指定为目标。',
  诅咒: '施加时移除目标全部正面状态；其它状态的自愈概率减半（5% 起步累计）；可穿透普通免疫（无敌不可穿透）。',
  死亡标记: '每回合 10% 概率立即死亡；同时每回合 10% 概率自行解除。',
  狼化: '每回合 15% 概率变成随机野兽（变形机制待实装）。',
  狂怒: '骷髅伤害 ×1.5 且无视对方特质；攻击一次后消失。',
  激怒: '骷髅伤害 ×1.5 且无视对方特质；攻击一次后消失。',
  法力燃烧: '法力被清空。',
  魅惑: '攻击改打己方下一名存活单位。',
  精灵火: '受到的法术伤害 +50%；每回合 10% 概率自愈。',
  恐怖: '每回合 10% 概率与编队后一位交换位次（更晚吃到骷髅伤害）。',
  状态: '效果未知。',
};

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
.gcard .photo,.gcard .art .vig{pointer-events:none}
.status-tooltip{position:fixed;z-index:60;max-width:210px;padding:7px 9px;border-radius:7px;
  background:rgba(14,11,6,.96);border:1px solid var(--stc,#d8c290);
  box-shadow:0 4px 14px rgba(0,0,0,.55);font-family:"Oswald","Microsoft YaHei",sans-serif;
  font-size:11px;line-height:1.55;color:#efe2c0;pointer-events:auto;user-select:text}
.status-tooltip .st-title{font-weight:700;letter-spacing:.06em;color:var(--stc,#d8c290);margin-bottom:2px}
.status-tooltip::before{content:"";position:absolute;top:-5px;left:var(--caret,50%);width:8px;height:8px;
  background:inherit;border-left:1px solid var(--stc,#d8c290);border-top:1px solid var(--stc,#d8c290);
  transform:translateX(-50%) rotate(45deg)}
@media (prefers-reduced-motion:reduce){.status-tooltip{transition:none}}
`;
  document.head.appendChild(style);
}

function closeTip(): void {
  openTip?.remove();
  openTip = null;
  openTipBadge = null;
}

function openTipFor(badge: HTMLElement): void {
  const title = (badge.getAttribute('title') ?? '').split(' · ')[0].trim();
  const desc = STATUS_DESCRIPTIONS[title] ?? '效果未知。';
  const color = badge.style.getPropertyValue('--sb') || '#d8c290';

  if (openTip && openTipBadge === badge) {
    closeTip();
    return;
  }
  closeTip();

  // 实例实际数值行（TeamView renderStatuses 注入的 data-*）：
  // 带 magnitude 的（DoT 类）显示每回合伤害，其余显示剩余回合
  const turns = badge.dataset.turns ?? '';
  const magnitude = badge.dataset.magnitude;
  const live: string[] = [];
  if (magnitude !== undefined) live.push(`每回合 ${magnitude} 点`);
  if (turns && turns !== '0') live.push(`剩余 ${turns} 回合`);
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
    el.textContent = `当前：${live.join(' · ')}`;
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

  const badgeHit = (e: Event): HTMLElement | null => {
    const target = e.target as HTMLElement | null;
    return target?.closest?.('.status-badge') as HTMLElement | null;
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

  window.addEventListener('blur', closeTip);
}
