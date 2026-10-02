/** Actual spell-choice UI. No dependency on colors present on the board. */
export class SkillBranchPicker {
  private finish: ((index: number | null) => void) | null = null;
  cancel(): void { this.finish?.(null); }
  pick(parent: HTMLElement, labels: readonly string[]): Promise<number | null> {
    this.cancel();
    if (!labels.length) return Promise.resolve(null);
    return new Promise(resolve => {
      const previousFocus = document.activeElement;
      const backdrop = document.createElement('div');
      backdrop.className = 'skill-branch-backdrop';
      backdrop.style.cssText = 'position:absolute;inset:0;z-index:1200;background:#060504bb;display:flex;align-items:center;justify-content:center';
      const panel = document.createElement('div');
      panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
      panel.setAttribute('aria-label', '选择技能效果');
      panel.style.cssText = 'display:flex;flex-direction:column;gap:12px;padding:20px;max-width:420px;max-height:80%;overflow:auto;border:1px solid #c9a35c;border-radius:10px;background:#171208;color:#f0e2bf';
      const title = document.createElement('strong'); title.textContent = '选择一种技能效果'; panel.append(title);
      const buttons: HTMLButtonElement[] = [];
      let settled = false;
      const finish = (value: number | null) => {
        if (settled) return;
        settled = true;
        document.removeEventListener('keydown', keydown);
        backdrop.remove(); this.finish = null;
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
        resolve(value);
      };
      const keydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') { event.preventDefault(); finish(null); }
        if (event.key === 'Tab') {
          event.preventDefault();
          const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
          buttons[(current + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length].focus();
        }
      };
      const add = (label: string, value: number | null) => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
        button.style.cssText = 'min-height:44px;padding:12px;cursor:pointer;white-space:normal;text-align:left;color:inherit;background:#302715;border:1px solid #c9a35c;border-radius:6px;font:inherit';
        let pressed = false;
        button.addEventListener('pointerdown', () => { pressed = true; });
        button.addEventListener('pointercancel', () => { pressed = false; });
        button.addEventListener('click', event => {
          if (event.detail > 0 && !pressed) return;
          finish(value);
        });
        buttons.push(button); panel.append(button);
      };
      labels.forEach((label, index) => add(label, index)); add('取消施放', null);
      // A quick cast opens this layer during the card's pointerup. Its trailing
      // synthesized click can hit the new backdrop without a press on it.
      let backdropPress = false;
      backdrop.addEventListener('pointerdown', event => { backdropPress = event.target === backdrop; });
      backdrop.addEventListener('click', event => {
        if (event.target === backdrop && backdropPress) finish(null);
        backdropPress = false;
      });
      backdrop.append(panel); parent.append(backdrop);
      this.finish = finish; document.addEventListener('keydown', keydown); buttons[0].focus();
    });
  }
}
