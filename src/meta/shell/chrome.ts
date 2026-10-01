/**
 * 外壳共享件：顶栏 / 底部导航 / 图标 / toast / 舞台缩放 / 通用小件。
 * 自视觉小样 v5 的 chrome.js + style.css 体系移植，数据全部来自网关存档。
 */
import { GAME_ICONS } from './gameIcons';
import { BATTLE_ICONS } from './battleIcons';

export const $ = (s: string, r: ParentNode = document): HTMLElement =>
  r.querySelector(s) as HTMLElement;
export const $$ = (s: string, r: ParentNode = document): HTMLElement[] =>
  [...r.querySelectorAll(s)] as HTMLElement[];

// ---------------------------------------------------------------------------
// 图标
// ---------------------------------------------------------------------------

const iconPaths: Record<string, string> = {
  arrow: '<path d="M14 5l-7 7 7 7M7 12h14"/>',
  coin: '<circle cx="12" cy="12" r="9.5" fill="currentColor" fill-opacity=".18"/><circle cx="12" cy="12" r="7"/><path d="M8 7l4 11 4-11M10 6h4"/>',
  mark: '<path d="M12 2l8 4v8c0 4-3 6.5-8 8-5-1.5-8-4-8-8V6z" fill="currentColor" fill-opacity=".16"/><path d="M12 5l3 6-3 6-3-6zm-5 6h10"/>',
  soul: '<path d="M14 2c2 7-8 6-5 13-5-2-2-6-2-6C-2 19 10 25 17 20c7-6 0-12 0-12s1 5-2 5c3-6-1-11-1-11z" fill="currentColor" fill-opacity=".45"/>',
  crystal: '<path d="M6 3h12l5 7-11 12L1 10z" fill="currentColor" fill-opacity=".22"/><path d="M1 10h22M6 3l3 7 3 12 3-12 3-7M9 10l3-7 3 7"/>',
  key: '<circle cx="16" cy="7" r="5"/><circle cx="16" cy="7" r="2" opacity=".4"/><path d="M12 11L3 20l2 2 3-3-2-2m3-3 2 2"/>',
  chevrons: '<path d="M5 12l7-7 7 7M5 19l7-7 7 7"/>',
  wing: '<path d="M20 3L4 9l-1 6 5-1-2 7 5-3 2-6 7-9z" fill="currentColor" fill-opacity=".16"/><path d="M5 11l11-5M7 13l6-3M9 16l2-4"/>',
  flag: '<path fill="currentColor" stroke="none" d="M4 2h14l-4 5 4 5H4v11H2V2h2z"/>',
  check: '<path d="M5 12l4 4L20 5"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 018 0v4m-4 4v3"/>',
  compass: '<circle cx="12" cy="12" r="8"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M8 16l2-6 6-2-2 6z" fill="currentColor" fill-opacity=".2"/>',
  map: '<path d="M2 5l7-3 6 3 7-3v17l-7 3-6-3-7 3zM9 2v17m6-14v17"/>',
  book: '<path d="M12 5C8 2 4 2 1 3v17c4-1 7-1 11 2 4-3 7-3 11-2V3c-4-1-7-1-11 2zm0 0v17"/>',
  chest: '<path d="M3 11V8a9 7 0 0118 0v3M2 11h20v11H2zM8 2v20M17 2v20"/><path d="M10 10h4v6h-4z" fill="#17131e"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3l1.2 2.6L16 5l.6 2.4L19 9l-1 2.3.8 2.2-2.4.6L16 16l-2.2.8L12 21l-1.8-2.4L8 16l-2.4-.6.8-2.2L5 9l2.4-1.6L8 5l2.8-.4z"/>',
  bag: '<path d="M8 8V6a4 4 0 018 0v2M5 8h14l-1 13H6zM9 12h6"/>',
  skull: '<path d="M8 20h8M9 17v3m6-3v3M7 10a5 5 0 0110 0c0 3-2 5-2 7H9c0-2-2-4-2-7zM9 11h.01M15 11h.01"/>',
  ticket: '<path d="M3 8h18v3a2 2 0 010 4v3H3v-3a2 2 0 010-4V8zm6-1v12"/>',
  search: '<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};

let iconUid = 0;

export function icon(name: string): string {
  if (GAME_ICONS[name]) return GAME_ICONS[name]!;
  if (BATTLE_ICONS[name]) return BATTLE_ICONS[name]!.replaceAll('mgOrb', 'mgOrb' + ++iconUid);
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (iconPaths[name] ?? '') +
    '</svg>'
  );
}

export function mountIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon!);
  });
}

// ---------------------------------------------------------------------------
// 舞台缩放（1600×900 设计尺，等比适配窗口）
// ---------------------------------------------------------------------------

export function fitStage(): void {
  const stage = $('#stage');
  if (!stage) return;
  const width = document.documentElement.clientWidth || window.innerWidth;
  const height = document.documentElement.clientHeight || window.innerHeight;
  const nativeSize = width < 1400;
  const responsiveScreens = [
    ['character-responsive', '.character-screen'],
    ['wishlist-responsive', '.wishlist-screen'],
    ['invasion-mobile', '.inv-screen'],
    ['events-responsive', '.ev-screen'],
    ['gifts-responsive', '.gift-screen'],
    ['event-shop-responsive', '.event-shop-screen'],
    ['gem-shop-responsive', '.gem-shop-screen'],
    ['material-shop-responsive', '.material-shop-screen'],
    ['weapons-responsive', '.weapons-screen'],
    ['arena-responsive', '.arena-screen'],
    ['map-responsive', '.map-shell'],
    ['hero-responsive', '.hero-screen'],
    ['result-responsive', '.result-screen'],
    ['quest-responsive', '.quest-screen, .explore-screen'],
    ['hunt-responsive', '.hunt-screen'],
  ] as const;
  let responsive = false;
  for (const [className, selector] of responsiveScreens) {
    const active = (nativeSize || className === 'hunt-responsive' || className === 'character-responsive') && !!stage.querySelector(selector);
    stage.classList.toggle(className, active);
    responsive ||= active;
  }
  if (responsive) {
    stage.style.transform = 'none';
    return;
  }
  stage.style.transform = 'scale(' + Math.min(width / 1600, height / 900) + ')';
}

// ---------------------------------------------------------------------------
// toast
// ---------------------------------------------------------------------------

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string): void {
  const el = $('#toast');
  if (!el) return;
  clearTimeout(toastTimer);
  el.textContent = message;
  el.classList.add('show');
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ---------------------------------------------------------------------------
// 法力宝石小件（卡面用）
// ---------------------------------------------------------------------------

export const COLOR_HEX: Record<string, string> = { red: '#e8555e', green: '#57c06b', blue: '#4f9fe0', yellow: '#e8c24a', purple: '#a074d4', brown: '#c0823f' };
export const COLOR_CN: Record<string, string> = { red: '红', green: '绿', blue: '蓝', yellow: '黄', purple: '紫', brown: '棕' };

const EMERALD_PATH =
  'M310.375 16.75L89.405 75.72l58.126 50.905L282.563 90.28l2.032-.53 25.78-73zm17.063 7.844l-27.157 76.812 91.69 91.875 95.624-8.78L327.438 24.594zm-41.813 12.062l-8.594 33.657c-.28-15.516-38.03-17.018-107.56-4.376l116.155-29.28zm51.063 14.625l123.5 123.407-58.844 7.563c16.2-21.37-32.277-91.112-64.656-130.97zM74.75 87.72L15.594 308.405l79-31.47 37.28-139.155L74.75 87.72zm207.438 22l-133.032 35.81-35.72 133.376 97.25 97.53 133.064-35.81 35.72-133.376-97.283-97.53zm-201.72 5.686l32.844 30.5-30.156 118.97-39.03 15.812c50.817-30.543 65.667-130.132 36.343-165.282zm195.876 14.78L359 213.377l-30.156 113.81-44.688 11.97c119.527-107.872-34.816-238.375-131.5-140.875l9.875-37.405 113.814-30.688zM490.564 203l-92.877 8.53-35.968 134.19 71.342 71.842L490.563 203zm-17.283 13.875L444.03 333.03c6.73-68.874-.03-90.85-30.655-111.5l59.906-4.655zm-371.155 77.188L20.22 326.688l161.75 161.468 17.31-96.72-97.155-97.373zm.094 20l78.124 82.437-7.438 61.375c-5.23-44.565-28.34-85.92-70.687-143.813zm246.124 44.687l-130.53 35.125-17.564 98.188 221.688-59.157-73.594-74.156zm18.625 42.5l24.28 24.844-115.22 32.72c61.28-26.446 83.34-37.418 90.94-57.564z';

let gemUid = 0;
function gemFillPaths(colors: string[]): string {
  const n = colors.length;
  if (n <= 1) return '<rect x="0" y="0" width="512" height="512" fill="' + (COLOR_HEX[colors[0] ?? 'brown'] ?? COLOR_HEX.brown) + '"/>';
  const cx = 256, cy = 256, R = 420, step = (Math.PI * 2) / n;
  let out = '';
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + i * step;
    const a1 = a0 + step;
    const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0);
    const x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
    out += `<path d="M${cx} ${cy} L${x0.toFixed(1)} ${y0.toFixed(1)} A${R} ${R} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z" fill="${COLOR_HEX[colors[i]!] ?? COLOR_HEX.brown}"/>`;
  }
  return out;
}

export function gemSvg(colors: readonly string[]): string {
  const list = [...new Set(colors.length ? colors : ['red'])];
  const clip = 'gemclip' + ++gemUid;
  return (
    `<svg class="board-gem" viewBox="0 0 512 512" role="img" aria-label="${list.map((c) => COLOR_CN[c] ?? c).join('、')}色法力">` +
    `<defs><clipPath id="${clip}"><path d="${EMERALD_PATH}"/></clipPath></defs>` +
    `<path class="seat" d="${EMERALD_PATH}"/>` +
    `<g clip-path="url(#${clip})"><g class="lit">${gemFillPaths(list)}</g></g>` +
    `<path class="facets" d="${EMERALD_PATH}"/>` +
    '</svg>'
  );
}

export function pips(colors: readonly string[]): string {
  return colors.map((c) => `<i class="pip ${c}" title="${COLOR_CN[c] ?? c}"></i>`).join('');
}

// ---------------------------------------------------------------------------
// 顶栏 / 底部导航（各屏共用骨架）
// ---------------------------------------------------------------------------

export interface ChromePage {
  /** 底部导航高亮项（地图/队伍/英雄/图鉴/宝箱） */
  nav: string;
  /** 顶栏中央标题 */
  title: string;
  /** 顶栏小字（英文副题） */
  subtitle?: string;
}

export function topbarHtml(): string {
  return `
    <header class="topbar">
      <div class="player" id="playerBadge">
        <img id="playerPortrait" src="/static/hero/seiji.webp" alt="玩家头像">
        <div>
          <strong id="playerName">影织者</strong>
          <span>破晓之誓 <i id="playerLevel">Lv.1</i></span>
          <div class="xp"><i id="playerXpFill"></i></div>
        </div>
      </div>
      <div class="top-title"><b id="pageTitle">世 界 地 图</b></div>
      <div class="wallet">
        <button class="money" data-currency="gold" type="button"><span data-icon="coin"></span><div><small>黄金</small><b id="goldBalance">0</b></div></button>
        <button class="money soul" data-currency="soul" type="button"><span data-icon="soul"></span><div><small>灵魂</small><b id="soulBalance">0</b></div></button>
        <button class="money crystal" data-currency="gem" type="button"><span data-icon="crystal"></span><div><small>宝石</small><b id="gemBalance">0</b></div></button>
        <button class="money key" data-currency="key" type="button"><span data-icon="key"></span><div><small>金钥匙</small><b id="keyBalance">0</b></div></button>
        <button class="money" data-currency="glory" type="button"><span data-icon="glory"></span><div><small>荣耀</small><b id="gloryBalance">0</b></div></button>
        <button class="orb" id="materialsBtn" type="button" aria-label="材料库"><span data-icon="bag"></span><i id="materialsAlert" class="materials-alert" aria-label="有新材料" hidden></i></button>
        <button class="orb" id="settings" type="button" aria-label="设置"><span data-icon="gear"></span></button>
      </div>
    </header>`;
}

export function bottomNavHtml(active: string, hint = '42 王国'): string {
  const items = [
    ['地图', 'map'],
    ['队伍', 'shield'],
    ['英雄', 'swords'],
    ['图鉴', 'book'],
    ['宝箱', 'chest'],
    ['商店', 'bag'],
  ] as const;
  return `
    <footer class="bottom-bar">
      <div class="world-mark"><span data-icon="compass"></span><span>破 晓 之 誓</span></div>
      <nav aria-label="主导航">
        ${items
          .map(
            ([label, ic]) =>
              `<button data-nav="${label}"${label === active ? ' class="active"' : ''}><span data-icon="${ic}"></span><span>${label}</span></button>`,
          )
          .join('')}
      </nav>
      <div class="bottom-hint"><span data-icon="lock"></span><span id="navHint">${hint}</span></div>
    </footer>`;
}

export function shopNavHtml(active: 'events' | 'gems' | 'materials'): string {
  return `<nav class="market-switch" aria-label="商店分类">
    <a href="#materials/gold"${active === 'materials' ? ' class="active" aria-current="page"' : ''}><span data-icon="bag"></span>材料商店</a>
    <a href="#shop"${active === 'events' ? ' class="active" aria-current="page"' : ''}><span data-icon="bag"></span>活动商店</a>
    <a href="#shop/gems"${active === 'gems' ? ' class="active" aria-current="page"' : ''}><span data-icon="crystal"></span>宝石商店</a>
  </nav>`;
}

export function toastHtml(): string {
  return '<div class="toast" id="toast" role="status"></div>';
}
