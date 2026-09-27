import { getPlayerPreferences, setPlayerPreferences, type PlayerPreferences } from './playerPreferences';

const channels = [
  ['master', '主音量'], ['music', '背景音乐'], ['soundEffects', '音效'], ['narration', '语音播报'],
] as const;
type Channel = typeof channels[number][0];

/** Shared IDs preserve the existing settings-page integration contract. */
export function audioControlsHtml(only?: Channel[]): string {
  const p = getPlayerPreferences();
  return `<style>
    .audio-channel{display:grid;grid-template-columns:112px minmax(60px,1fr) 42px;align-items:center;gap:8px 12px;padding:12px 0;border-bottom:1px solid #8b734b33}
    .audio-channel .audio-label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0!important;min-height:32px!important;border:0!important}
    .audio-channel .audio-label input[type=checkbox]{flex:0 0 32px!important;width:32px!important}
    .audio-channel input[type=range]{width:100%;min-width:0;min-height:28px}
    .audio-channel output{font-variant-numeric:tabular-nums;text-align:right}
    .audio-channel small{grid-column:1/-1;opacity:.7}
    .settings-screen .audio-channel .audio-label input[type=checkbox]:checked:after{transform:translateX(8px)}
    @media(max-width:380px){.audio-channel{grid-template-columns:104px minmax(40px,1fr) 36px;gap:6px}}
  </style>` + channels.filter(([key]) => !only || only.includes(key)).map(([key, label]) => {
    const enabled = p[`${key}Enabled`];
    const value = Math.round(p[`${key}Volume`] * 100);
    const volumeLabel = key === 'master' ? label : `${label}音量`;
    return `<div class="audio-channel">
      <label class="check-row audio-label"><span class="setting-copy"><b>${label}</b></span>
        <input type="checkbox" id="${key}Enabled" aria-label="启用${label}" ${enabled ? 'checked' : ''}>
      </label>
      <input id="${key}Volume" type="range" min="0" max="100" step="5" value="${value}" aria-label="${volumeLabel}" ${enabled ? '' : 'disabled'}>
      <output id="${key}VolumeValue" for="${key}Volume">${value}%</output>
      ${key === 'music' ? '<small>普通页面连续播放，曲库内随机轮播；进入战斗时切换，语音播报时自动压低。</small>' : ''}
    </div>`;
  }).join('');
}

export function bindAudioControls(root: ParentNode, signal?: AbortSignal, only?: Channel[]): void {
  for (const [key] of channels) {
    if (only && !only.includes(key)) continue;
    const toggle = root.querySelector<HTMLInputElement>(`#${key}Enabled`);
    const slider = root.querySelector<HTMLInputElement>(`#${key}Volume`);
    const output = root.querySelector<HTMLOutputElement>(`#${key}VolumeValue`);
    if (!toggle || !slider || !output) continue;
    toggle.addEventListener('change', () => {
      setPlayerPreferences({ [`${key}Enabled`]: toggle.checked } as Partial<PlayerPreferences>);
      slider.disabled = !toggle.checked;
    }, { signal });
    const update = () => {
      const p = setPlayerPreferences({ [`${key}Volume`]: Number(slider.value) / 100 } as Partial<PlayerPreferences>);
      output.textContent = `${Math.round(p[`${key}Volume`] * 100)}%`;
    };
    slider.addEventListener('input', update, { signal });
    slider.addEventListener('change', update, { signal });
  }
}
