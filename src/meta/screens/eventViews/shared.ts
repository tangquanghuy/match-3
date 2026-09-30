/**
 * 活动玩法视图的共享约定（2026-09-29 玩法重做）。
 *
 * 视图只产 HTML；交互统一走三种 data 属性，由 eventsScreen 在根节点委托处理：
 *   data-act="<动作>"     → gateway.eventAction（非战斗操作：选路、营地、掷骰…），完成后整屏重渲染
 *   data-fight="<动作>"   → ctx.launchEventBattle（进入战斗）
 *   data-select="<动作>"  → 只改本屏选中项（兵团/地块/节点/试炼），不写存档
 *   data-confirm="<文案>" → 与 data-act 同用：先弹确认框
 */
import type { EventTheme } from '../../data/events';
import type { EventWeekState, MetaSave } from '../../state/schema';
import { eventArt, gemArt, statusArt } from '../../shell/artAssets';
import { getTroopById } from '../../../data/troops';

export interface ViewCtx {
  save: MetaSave;
  week: EventWeekState;
  weekStart: number;
  theme: EventTheme;
  /** 当前选中的战斗/动作目标（屏内记忆，未选时为 undefined） */
  selected: string | undefined;
  /** 某动作的出战前置校验（null = 可出战） */
  ready(action?: string): string | null;
  fightLabel: string;
}

export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function artImg(name: string, cls = '', alt = ''): string {
  const url = eventArt(name);
  return url ? `<img class="${cls}" src="${url}" alt="${esc(alt)}" draggable="false" />` : `<span class="${cls} evm-art-missing" aria-hidden="true"></span>`;
}

/** 图标名 → URL：`gem:<路径>` 棋盘宝石、`status:<名>` 状态图标、`troop:<id>` 部队立绘，其余走活动素材 */
export function iconUrl(icon: string): string {
  if (icon.startsWith('gem:')) return gemArt(icon.slice(4));
  if (icon.startsWith('status:')) return statusArt(icon.slice(7));
  if (icon.startsWith('troop:')) {
    const troop = getTroopById(Number(icon.slice(6)));
    return troop ? troop.artUrl ?? `/static/portraits/${troop.portrait}.webp` : '';
  }
  return eventArt(icon);
}

export function iconImg(icon: string, cls = '', alt = ''): string {
  const url = iconUrl(icon);
  return url ? `<img class="${cls}" src="${url}" alt="${esc(alt)}" draggable="false" />` : `<span class="${cls} evm-art-missing" aria-hidden="true"></span>`;
}

/** 特质 code → 显示名 + 描述（活动/塔动态特质） */
export function traitChip(name: string, desc: string, icon?: string): string {
  return `<span class="evm-chip" title="${esc(desc)}">${icon ? iconImg(icon, 'evm-chip-ico') : ''}<b>${esc(name)}</b><small>${esc(desc)}</small></span>`;
}

export function fightButton(v: ViewCtx, action: string | undefined, label = v.fightLabel): string {
  const blocked = action === undefined ? '请先选择目标' : v.ready(action);
  return `<div class="evm-fight-wrap">
      <button class="ev-fight" type="button" ${action !== undefined ? `data-fight="${esc(action)}"` : ''}${blocked ? ' disabled' : ''}><span data-icon="swords"></span>${label.replace(/\s+/g, '')}</button>
      ${blocked ? `<p class="ev-warning" role="status"><span data-icon="lock"></span>${esc(blocked)}</p>` : ''}
    </div>`;
}

export function actButton(label: string, action: string, opts: { cls?: string; disabled?: boolean; confirm?: string; title?: string } = {}): string {
  return `<button type="button" class="evm-btn ${opts.cls ?? ''}" data-act="${esc(action)}"${opts.disabled ? ' disabled' : ''}${opts.confirm ? ` data-confirm="${esc(opts.confirm)}"` : ''}${opts.title ? ` title="${esc(opts.title)}"` : ''}>${label}</button>`;
}

/** 玩家快照 externalId（p0-6001 / p1-hero）→ 显示名 */
export function memberName(externalId: string): string {
  const key = externalId.match(/^p\d+-(.+)$/)?.[1] ?? externalId;
  if (key === 'hero') return '主角';
  return getTroopById(Number(key))?.name ?? key;
}

export const COLOR_CN: Record<string, string> = { Red: '红', Green: '绿', Blue: '蓝', Yellow: '黄', Purple: '紫', Brown: '棕' };
export const COLOR_HEX: Record<string, string> = { Red: '#e8555e', Green: '#57c06b', Blue: '#4f9fe0', Yellow: '#e8c24a', Purple: '#a074d4', Brown: '#c0823f' };

export const pct = (a: number, b: number): number => (b > 0 ? Math.max(0, Math.min(100, (a / b) * 100)) : 0);
