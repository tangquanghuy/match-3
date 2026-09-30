import { cycleBattleSpeed, getSelectedBattleSpeed, onBattleSpeedChange } from './battleSpeed';
import type { BattleSpeed } from './battleSpeed';

export interface BattleControlsOptions {
  /** 玩家切换自动战斗；返回最终生效的开关状态 */
  onAutoChange: (on: boolean) => boolean;
  /** 同组排布的「战斗设置」齿轮按钮（位于本组最上方） */
  settingsButton?: HTMLElement;
}

/** 排布时要避开的战场区域（视口坐标）：角色卡与棋盘格区，以及棋盘格区的上沿/右沿 */
export interface BattleControlsGeometry {
  avoid: readonly DOMRect[];
  boardTop: number;
  boardRight: number;
  /** 竖屏顶栏：给定时一行排在该高度（视口坐标），不再从棋盘上沿反推 */
  rowTop?: number;
}

const BUTTON_SIZE = 44;
const BUTTON_GAP = 8;

function intersects(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/**
 * 战斗右上角的倍速 / 自动战斗按钮，竖排在「战斗设置」齿轮按钮下方，外观与它一致
 * （44×44、同色描边与底色）。原生 <button>：Tab 可达、Enter/Space 触发、focus-visible 描边。
 * - 倍速：循环 1× → 2× → 3× → 1×，显示选定倍速（按住空格的临时加速不改按钮），持久化在 battleSpeed；
 * - 自动：aria-pressed 开关，接管我方行动（App 负责接管逻辑）；战斗结束后置灰。
 */
export class BattleControls {
  readonly speedButton = document.createElement('button');
  readonly autoButton = document.createElement('button');
  private lifecycle = new AbortController();
  private unsubscribeSpeed: () => void;
  private ended = false;

  constructor(parent: HTMLElement, private options: BattleControlsOptions) {
    if (!document.getElementById('battle-controls-styles')) {
      const style = document.createElement('style');
      style.id = 'battle-controls-styles';
      // 与 .battle-settings-button 同一套尺寸/配色；依次排在它下方（44px 按钮 + 8px 间距）
      style.textContent = `
        .battle-control-button{position:absolute;right:max(12px,env(safe-area-inset-right));z-index:90;box-sizing:border-box;width:44px;height:44px;padding:0;display:flex;align-items:center;justify-content:center;border:1px solid #a98b58;border-radius:8px;color:#eddbb2;background:#211d18ed;font:600 15px/1 system-ui,sans-serif;letter-spacing:0;cursor:pointer;transition:border-color .15s,background .15s,box-shadow .15s}
        .battle-control-button:hover{border-color:#caaa66}
        .battle-control-button:focus-visible{outline:2px solid #f5d17f;outline-offset:3px}
        .battle-control-button:disabled{opacity:.5;cursor:default}
        .battle-speed-button{top:calc(max(12px,env(safe-area-inset-top)) + 52px)}
        .battle-speed-button[data-speed="2"],.battle-speed-button[data-speed="3"]{color:#ffe3a0;border-color:#caaa66}
        .battle-auto-button{top:calc(max(12px,env(safe-area-inset-top)) + 104px);font-size:14px}
        .battle-auto-button[aria-pressed="true"]{color:#fff3d0;background:#5a4526f2;border-color:#f5d17f;box-shadow:0 0 10px #f5d17f59,inset 0 0 6px #f5d17f4d}
      `;
      document.head.append(style);
    }
    this.speedButton.type = 'button';
    this.speedButton.className = 'battle-control-button battle-speed-button';
    this.speedButton.dataset.testid = 'battle-speed-button';
    this.speedButton.title = '演出速度';
    this.autoButton.type = 'button';
    this.autoButton.className = 'battle-control-button battle-auto-button';
    this.autoButton.dataset.testid = 'battle-auto-button';
    this.autoButton.textContent = '自动';
    this.autoButton.title = '自动战斗';
    this.autoButton.setAttribute('aria-label', '自动战斗');
    this.autoButton.setAttribute('aria-pressed', 'false');
    parent.append(this.speedButton, this.autoButton);

    const listen = { signal: this.lifecycle.signal };
    this.speedButton.addEventListener('click', () => { cycleBattleSpeed(); }, listen);
    this.autoButton.addEventListener('click', () => {
      if (this.ended) return;
      const want = this.autoButton.getAttribute('aria-pressed') !== 'true';
      this.setAutoPressed(this.options.onAutoChange(want));
    }, listen);
    this.renderSpeed(getSelectedBattleSpeed());
    this.unsubscribeSpeed = onBattleSpeedChange(() => this.renderSpeed(getSelectedBattleSpeed()));
  }

  /**
   * 按战场实际占位排布（视口尺寸/全屏变化后调用）：
   * - 默认：齿轮 → 倍速 → 自动 竖排在右上角（CSS 定位）；
   * - 竖排会压到角色卡或棋盘时（战场占满视口宽度，如 960×720）：三个按钮改为一行，
   *   右对齐到棋盘格区右沿、放在格区上方的横幅带里，不压卡也不压格子；
   * - 两种都放不下时保留竖排。
   */
  place(geometry: BattleControlsGeometry): void {
    const group = [this.options.settingsButton, this.speedButton, this.autoButton]
      .filter((el): el is HTMLElement => !!el && el.isConnected);
    for (const el of group) {
      el.style.top = '';
      el.style.right = '';
    }
    const clear = () => group.every((el) => !geometry.avoid.some((area) => intersects(el.getBoundingClientRect(), area)));
    // 竖屏顶栏（给了 rowTop）固定排成一行，不走右上竖排
    if (geometry.rowTop === undefined && clear()) {
      this.speedButton.dataset.layout = 'stack';
      return;
    }
    const parent = (this.speedButton.offsetParent ?? document.documentElement).getBoundingClientRect();
    const top = geometry.rowTop ?? Math.max(4, Math.min(12, geometry.boardTop - BUTTON_SIZE - 4));
    group.forEach((el, index) => {
      const right = geometry.boardRight - 4 - index * (BUTTON_SIZE + BUTTON_GAP);
      el.style.top = `${top - parent.top}px`;
      el.style.right = `${parent.right - right}px`;
    });
    if (geometry.rowTop !== undefined || clear()) {
      this.speedButton.dataset.layout = 'row';
      return;
    }
    for (const el of group) {
      el.style.top = '';
      el.style.right = '';
    }
    this.speedButton.dataset.layout = 'stack';
  }

  /** 同步自动战斗按钮的按下态 */
  setAutoPressed(on: boolean): void {
    this.autoButton.setAttribute('aria-pressed', String(on));
  }

  /** 战斗结束：自动战斗弹起并置灰；倍速仍可调（结算演出也吃倍速） */
  finish(): void {
    this.ended = true;
    this.setAutoPressed(false);
    this.autoButton.disabled = true;
  }

  dispose(): void {
    this.lifecycle.abort();
    this.unsubscribeSpeed();
    this.speedButton.remove();
    this.autoButton.remove();
    if (this.options.settingsButton) {
      this.options.settingsButton.style.top = '';
      this.options.settingsButton.style.right = '';
    }
  }

  private renderSpeed(speed: BattleSpeed): void {
    this.speedButton.textContent = `${speed}×`;
    this.speedButton.dataset.speed = String(speed);
    this.speedButton.setAttribute('aria-label', `演出速度 ${speed} 倍`);
  }
}
