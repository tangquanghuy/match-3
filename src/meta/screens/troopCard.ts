/** 图鉴与愿望单共用卡面，点击行为交给所在页面。 */
import type { TroopData } from '../../data/troops';
import type { TroopRecord } from '../state/schema';
import { gemSvg, icon } from '../shell/chrome';
import { troopImg } from './teamScreen';
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function troopCardFace(t: TroopData, rec?: TroopRecord): string {
  return `<i class="rarity-edge" aria-hidden="true"></i>${troopImg(t,false,'alt=""').replace('loading="lazy"','loading="eager"')}
    <span class="collection-mana">${gemSvg(t.manaColors.map(c=>c.toLowerCase()))}</span>
    ${!rec ? `<span class="locked-mark" aria-hidden="true">${icon('lock')}</span>` : ''}
    <div class="collection-info"><h2>${escapeHtml(t.name)}</h2><span class="collection-level">${rec ? `Lv.${rec.level}` : '未获得'}</span></div>`;
}
