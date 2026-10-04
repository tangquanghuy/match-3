/** 锻材挑战：同一屏选档、看掉落、出战。 */
import { INGOT_NAMES } from '../../data/materials';
import { cssUrlVar, eventArt } from '../../shell/artAssets';
import { ingotArt, materialImg } from '../../shell/materialArt';
import { RAID_INGOT_MAX_TIER, RAID_INGOT_REWARDS, raidIngotLevel, type RaidState } from '../../systems/eventModes/raid';
import { fightButton, type ViewCtx } from './shared';

export function raidForgeViewHtml(v: ViewCtx, state: RaidState): string {
  const selected = state.ingotTier;
  const reward = RAID_INGOT_REWARDS[selected - 1] ?? RAID_INGOT_REWARDS[0]!;
  const bonus = reward.bonus.map(({ key, chance }) =>
    `<span class="rd-drop">${materialImg(ingotArt(key))}<b>${INGOT_NAMES[key]}</b><small>${Math.round(chance * 100)}%</small></span>`).join('');
  const featured = reward.bonus.at(-1)?.key ?? reward.guaranteed.key;

  return `<div class="evm evm-raid-forge">
    <section class="rd-forge" aria-label="锻材挑战" style='${cssUrlVar('rd-forge-bg', eventArt('bg-raid'))}'>
      <div class="rd-forge-main">
        <header class="rd-forge-hero">
          <div class="rd-forge-heading"><small>主要产出 · 钢锭</small><h2>锻材挑战</h2><p>挑战越深，稀有钢锭掉落越丰富</p></div>
          <div class="rd-forge-art" aria-hidden="true">${materialImg(ingotArt(featured))}<span>${INGOT_NAMES[featured]}</span></div>
        </header>
        <div class="rd-forge-picker" role="group" aria-label="选择挑战难度">
          <div class="rd-forge-stage">
            <button type="button" class="rd-forge-step" data-act="ingot-tier:${selected - 1}" aria-label="降低挑战难度" ${selected <= 1 ? 'disabled' : ''}><span aria-hidden="true">‹</span></button>
            <div class="rd-forge-feature" aria-live="polite"><small>难度</small><strong>${selected}<span> / ${RAID_INGOT_MAX_TIER}</span></strong><span>敌人 Lv.${raidIngotLevel(selected)}</span></div>
            <button type="button" class="rd-forge-step" data-act="ingot-tier:${selected + 1}" aria-label="提高挑战难度" ${selected >= RAID_INGOT_MAX_TIER ? 'disabled' : ''}><span aria-hidden="true">›</span></button>
          </div>
          <div class="rd-forge-scale" style="--rd-selected:${(selected - 1) / (RAID_INGOT_MAX_TIER - 1)}">
            <div class="rd-forge-track"><span></span></div>
            <input class="rd-forge-range" type="range" min="1" max="${RAID_INGOT_MAX_TIER}" step="1" value="${selected}" aria-label="钢锭挑战难度" aria-valuetext="第 ${selected} 档，敌人 ${raidIngotLevel(selected)} 级">
            <div class="rd-forge-labels" aria-hidden="true">${Array.from({ length: RAID_INGOT_MAX_TIER }, (_, i) => `<span class="${i + 1 === selected ? 'selected' : ''}">${i + 1}</span>`).join('')}</div>
          </div>
        </div>
      </div>
      <div class="rd-forge-bottom"><div class="rd-forge-rewards"><span class="rd-drop guaranteed">${materialImg(ingotArt(reward.guaranteed.key))}<b>保底 ${INGOT_NAMES[reward.guaranteed.key]} ×${reward.guaranteed.count}</b></span>${bonus ? `<div class="rd-bonus"><small>额外掉落</small>${bonus}</div>` : ''}</div>
      ${fightButton(v, 'ingot', '挑战')}</div>
    </section>
  </div>`;
}