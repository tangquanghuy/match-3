import classesCss from '../screens/classesScreen.css?raw';
import heroTraitDialogCss from '../screens/heroTraitDialog.css?raw';
import heroPortraitDialogCss from '../screens/heroPortraitDialog.css?raw';
import regionalEntryCss from './styles/regional-entry.css?raw';
import regionalCss from '../screens/regionalScreen.css?raw';
import materialShopCss from './styles/material-shop.css?raw';
import defenseRewardCss from './styles/defense-reward.css?raw';
import invasionDefenseCss from './styles/invasion-defense.css?raw';
import characterCss from './styles/character.css?raw';
import wishlistCss from './styles/wishlist.css?raw';
/**
 * 页面级 CSS 管理：小样各页的级联顺序各不相同（troop.css 要排在 style.css
 * 之前被压回；arena/result 要排在最后做覆盖），全局一次性 import 会互相打架。
 * 这里用 ?raw 把页面 CSS 按小样原本的位置注入/拔除：
 *   - position 'first'  → 插到 <head> 最前（先于全局样式，会被全局压回）
 *   - position 'last'   → 追加到 <head> 末尾（覆盖全局）
 * 路由切屏时由外壳调用 apply()/clear()。
 */
import troopCss from './styles/troop.css?raw';
import arenaCss from './styles/arena.css?raw';
import resultCss from './styles/result.css?raw';
import liveCss from './styles/live.css?raw';
import bagCss from './styles/bag.css?raw';
import eventShopCss from './styles/event-shop.css?raw';
import gemShopCss from './styles/gem-shop.css?raw';
import marketCss from './styles/market.css?raw';
import huntCss from './styles/hunt.css?raw';
import eventsLockCss from './styles/events-lock.css?raw';
import eventsCss from './styles/events.css?raw';
import eventsModesCss from './styles/events-modes.css?raw';
import eventsTowerCss from './styles/events-tower.css?raw';
import giftsCss from './styles/gifts.css?raw';
import mailCss from './styles/mail.css?raw';

interface PageCssSpec {
  css: string;
  position: 'first' | 'last';
}

const PAGE_CSS: Record<string, PageCssSpec> = {
  classes: { css: classesCss + '\n' + heroTraitDialogCss, position: 'last' },
  hero: { css: heroTraitDialogCss + '\n' + heroPortraitDialogCss, position: 'last' },
  regional: { css: regionalCss, position: 'last' },
  map: { css: defenseRewardCss + regionalEntryCss, position: 'last' },
  character: { css: characterCss, position: 'last' },
  wishlist: { css: wishlistCss, position: 'last' },
  troop: { css: troopCss, position: 'first' },
  arena: { css: arenaCss, position: 'last' },
  result: { css: resultCss, position: 'last' },
  events: { css: eventsCss + eventsModesCss + eventsTowerCss + eventsLockCss, position: 'last' },
  invasion: { css: liveCss + invasionDefenseCss + defenseRewardCss, position: 'last' },
  bag: { css: bagCss, position: 'last' },
  materials: { css: marketCss + materialShopCss, position: 'last' },
  shop: { css: eventShopCss + marketCss + eventsLockCss, position: 'last' },
  gems: { css: gemShopCss + marketCss, position: 'last' },
  hunt: { css: huntCss, position: 'last' },
  gifts: { css: giftsCss, position: 'last' },
  mail: { css: mailCss, position: 'last' },
};

const STYLE_ID = 'meta-page-css';

export function applyPageCss(page: string): void {
  clearPageCss();
  const spec = PAGE_CSS[page];
  if (!spec) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  // Raw fragments may carry a UTF-8 BOM. Inside a joined stylesheet it becomes
  // part of the next selector (e.g. \uFEFF.hero-trait-dialog), silently breaking it.
  style.textContent = spec.css.replace(/\uFEFF/g, '');
  if (spec.position === 'first') {
    document.head.insertBefore(style, document.head.firstChild);
  } else {
    document.head.appendChild(style);
  }
}

export function clearPageCss(): void {
  document.getElementById(STYLE_ID)?.remove();
}
