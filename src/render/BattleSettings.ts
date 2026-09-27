import { audioControlsHtml, bindAudioControls } from '../preferences/audioControls';

/** Native modal provides keyboard focus trapping and makes the battlefield inert. */
export class BattleSettings {
  private button = document.createElement('button');
  private dialog = document.createElement('dialog');
  private lifecycle = new AbortController();
  private controls: AbortController | null = null;
  private confirming = false;
  private ended = false;
  private disposed = false;

  constructor(parent: HTMLElement, private onToggle: (open: boolean) => void,
    private onSurrender: () => void, private canSurrender: () => boolean) {
    if (!document.getElementById('battle-settings-styles')) {
      const style = document.createElement('style');
      style.id = 'battle-settings-styles';
      style.textContent = `
        .battle-settings-button{position:absolute;right:max(12px,env(safe-area-inset-right));top:max(12px,env(safe-area-inset-top));z-index:90;width:44px;height:44px;border:1px solid #a98b58;border-radius:8px;color:#eddbb2;background:#211d18ed;font-size:25px;cursor:pointer}
        .battle-settings{box-sizing:border-box;width:min(460px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;border:1px solid #a98b58;border-radius:12px;padding:24px;color:#eadfca;background:#211d18;font:15px/1.5 system-ui;box-shadow:0 16px 70px #0009}
        .battle-settings::backdrop{background:#000a}
        .battle-settings h2{margin:0 0 16px;color:#f2d697}
        .battle-settings input{accent-color:#caaa66}
        .battle-settings input[type=checkbox]{width:20px;height:20px}
        .battle-settings input[type=range]{min-height:32px}
        .battle-settings button{min-height:44px;padding:8px 18px;border:1px solid #a98b58;border-radius:6px;background:#383021;color:#f5e9d0;cursor:pointer;font:inherit}
        .battle-settings button:focus-visible,.battle-settings input:focus-visible{outline:2px solid #f5d17f;outline-offset:3px}
        .battle-settings footer{display:flex;justify-content:space-between;gap:12px;margin-top:20px;padding-top:16px;border-top:1px solid #685239}
        .battle-settings .danger{border-color:#b8695f;color:#ffc4b9;background:#432523}
        .battle-settings button:disabled{opacity:.5;cursor:default}
        @media(max-height:480px){.battle-settings{padding:16px}.battle-settings h2{font-size:20px;margin-bottom:8px}.battle-settings .audio-channel{padding:6px 0;gap:4px 12px}.battle-settings footer{margin-top:12px;padding-top:10px}}
      `;
      document.head.append(style);
    }
    this.button.className = 'battle-settings-button';
    this.button.type = 'button';
    this.button.setAttribute('aria-label', '战斗设置');
    this.button.title = '战斗设置';
    this.button.textContent = '⚙';
    this.dialog.className = 'battle-settings';
    this.dialog.setAttribute('aria-labelledby', 'battle-settings-title');
    parent.append(this.button, this.dialog);
    const options = { signal: this.lifecycle.signal };
    this.button.addEventListener('click', () => this.open(), options);
    this.dialog.addEventListener('cancel', e => {
      e.preventDefault();
      if (this.confirming) this.render(false); else this.close();
    }, options);
  }

  /** 右上角齿轮按钮：倍速/自动按钮与它成组排布（窄视口时整组挪到棋盘上沿，见 BattleControls.place） */
  get toggleButton(): HTMLButtonElement {
    return this.button;
  }

  open(): void {
    if (this.dialog.open || this.disposed) return;
    this.render(false);
    this.onToggle(true);
    this.dialog.showModal();
    this.dialog.querySelector<HTMLButtonElement>('[data-resume]')?.focus();
  }

  close(): void {
    if (!this.dialog.open) return;
    this.dialog.close();
    this.controls?.abort();
    this.onToggle(false);
    if (!this.disposed) this.button.focus();
  }

  /** 战斗结束（胜负/投降）时的通知：倍速/自动按钮组借此停下自动战斗 */
  onFinished?: () => void;

  finish(): void { this.ended = true; this.close(); this.onFinished?.(); }

  private render(confirm: boolean): void {
    this.confirming = confirm;
    this.controls?.abort();
    this.controls = new AbortController();
    this.dialog.innerHTML = confirm
      ? `<h2 id="battle-settings-title">放弃当前对局？</h2><p>本场将按战败结算，放弃本场收集的战利品。已消耗的入场次数或门票不返还。</p><p>确认后结束当前战斗。</p><footer><button data-resume autofocus>继续战斗</button><button class="danger" data-confirm>确认放弃</button></footer>`
      : `<h2 id="battle-settings-title">战斗设置</h2>${audioControlsHtml()}<footer><button class="danger" data-abandon ${this.ended || !this.canSurrender() ? 'disabled' : ''}>放弃本局</button><button data-resume autofocus>${this.ended ? '关闭设置' : '返回战斗'}</button></footer>`;
    const options = { signal: this.controls.signal };
    bindAudioControls(this.dialog, this.controls.signal);
    this.dialog.querySelector('[data-resume]')?.addEventListener('click', () => this.close(), options);
    this.dialog.querySelector('[data-abandon]')?.addEventListener('click', () => {
      if (this.canSurrender()) this.render(true);
    }, options);
    this.dialog.querySelector('[data-confirm]')?.addEventListener('click', () => {
      if (!this.canSurrender()) { this.finish(); return; }
      this.onSurrender();
    }, options);
    if (this.dialog.open) this.dialog.querySelector<HTMLButtonElement>('[data-resume]')?.focus();
  }

  dispose(): void {
    this.disposed = true;
    this.close();
    this.controls?.abort();
    this.lifecycle.abort();
    this.button.remove();
    this.dialog.remove();
  }
}
