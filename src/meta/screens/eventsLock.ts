/**
 * 每周活动未解锁时的独立拦截页（活动中心与活动商店共用）。
 * 解锁等级见 EVENT_UNLOCK_HERO_LEVEL；网关同样拒绝出战与兑换，这里只负责展示。
 */
import { EVENT_ROTATION, EVENT_UNLOCK_HERO_LEVEL } from '../data/events';
import { cssUrlVar, shopArt } from '../shell/artAssets';
import type { MetaSave } from '../state/schema';

export function eventsLockPanelHtml(save: MetaSave, heading: 'h1' | 'h2' = 'h1'): string {
  const level = Math.max(1, save.hero.level);
  const need = EVENT_UNLOCK_HERO_LEVEL;
  const pct = Math.min(100, Math.round((level / need) * 100));
  const tiles = EVENT_ROTATION.map((def) =>
    `<li style='--ev-accent:${def.accent};${cssUrlVar('tile-art', shopArt(`event-${def.id}`))}'><span>${def.name}</span></li>`,
  ).join('');
  return `<section class="evlock" aria-labelledby="evlockTitle">
      <ul class="evlock-art" aria-label="开放后可参加的活动">${tiles}</ul>
      <div class="evlock-body">
        <span class="evlock-seal" data-icon="lock" aria-hidden="true"></span>
        <${heading} id="evlockTitle">每周活动</${heading}>
        <p class="evlock-need">主角 <b>Lv.${need}</b> 解锁</p>
        <div class="evlock-meter" role="progressbar" aria-label="主角等级" aria-valuemin="1" aria-valuemax="${need}" aria-valuenow="${level}"><i style="width:${pct}%"></i></div>
        <p class="evlock-now">当前 Lv.${level}<span>还差 ${Math.max(0, need - level)} 级</span></p>
        <a class="evlock-cta" href="#map">去冒险升级</a>
      </div>
    </section>`;
}
