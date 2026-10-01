import { CHAMPION_TIERS, tierUnlocked, type ClassDef, type TalentDef } from '../data/classes';
import { TALENT_DYNAMIC_CODES } from '../data/talentDefs';
import { traitBadgeSvg } from '../../render/traitBadges';
import { classLevelOf } from '../systems/hero';
import { talentPicksOf } from '../systems/talents';
import type { MetaSave } from '../state/schema';

/** The existing 3-column talent tree used by both the hero modal and class previews. */
function effectUsable(t: TalentDef): 'yes' | 'no' | 'na' {
  if (t.effect.kind === 'pvp') return 'na';
  if (t.effect.kind === 'unimplemented') return TALENT_DYNAMIC_CODES.has(t.code) ? 'yes' : 'no';
  return 'yes';
}

export function talentTreeMarkup(save: MetaSave, cls: ClassDef, unlocked: boolean): string {
  const level = unlocked ? classLevelOf(save, cls.id) : 0;
  const picks = unlocked ? talentPicksOf(save, cls.id) : [];
    // 树头
    let html = '<div class="tree-corner"></div>';
    for (const tree of cls.trees) {
      html += `<div class="tree-head"><span>${tree.nameZh}</span><small>${tree.name}</small></div>`;
    }
    // 7 档行：左档位轨 + 三树的该档天赋
    for (let tier = 0; tier < 7; tier++) {
      const need = CHAMPION_TIERS[tier]!;
      const open = unlocked && tierUnlocked(level, tier);
      html += `<div class="tier-rail${open ? ' on' : ''}"><b>Lv.${need}</b><small>冠军</small></div>`;
      for (const tree of cls.trees) {
        const talent = tree.talents[tier]!;
        const pickedHere = picks[tier] === talent.code;
        const usable = effectUsable(talent);
        const state = pickedHere ? 'picked' : open && usable === 'yes' ? 'pickable' : 'locked';
        const badge = usable !== 'yes' ? '<em class="talent-flag na">暂未开放</em>' : '';
        const description = usable === 'yes' ? talent.descriptionZh : '该天赋尚未开放';
        const icon = traitBadgeSvg(talent.code);
        const iconHtml = icon
          ? `<i class="talent-cell-icon">${icon}</i>`
          : '<i class="talent-cell-icon"></i>';
        // 已选格：正文点击不再取消（防误触丢选取），显式 ✕ 才取消
        const cancel = pickedHere
          ? '<button class="talent-cancel" data-cancel="1" data-tier="' + tier + '" type="button" title="取消选取">✕</button>'
          : '';
        const small = !open ? `冠军 Lv.${need} 解锁` : pickedHere ? '已选' : usable === 'yes' ? '点击选取' : '暂未开放';
        html += `<div class="talent-cell ${state}${usable !== 'yes' ? ' dim' : ''}" data-tier="${tier}" data-code="${talent.code}" data-usable="${usable}"
          role="${open && usable === 'yes' ? 'button' : 'note'}" title="${description}"
          aria-disabled="${!open || usable !== 'yes'}">
          ${cancel}${iconHtml}<b>${talent.nameZh}</b>${badge}
          <small class="talent-desc">${description}</small>
          <small>${small}</small>
        </div>`;
      }
    }
    return html;
}
