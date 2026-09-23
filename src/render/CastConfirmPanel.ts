/**
 * 施法确认层（UX 阶段 B · 窗口 P · B-4 三段式第②段）。
 *
 * 阶段 A 的观察：短按满法力卡 → **直接**进入选择层或当场结算，法力清零，
 * 玩家既没机会确认也没机会先读一遍技能（`15-battle.md` B-4）。
 *
 * 本层补上确认这一步，三条规则照重设计提案执行：
 * 1. 可关：面板内「不再确认」复选框写 `battle.skipCastConfirm`（`battlePrefs.ts`），但**默认开**；
 * 2. 数字必须是**求值后**的——复用 `meta/shell/spellText.ts` 的 `renderSpell(desc, magic)`，
 *    与英雄页/武器图鉴同一套渲染（避免战斗层与养成页两套算法）；
 * 3. 目标预览：调用方在战场上高亮候选卡，本层同步列出候选名字与作用范围。
 *
 * 关闭方式三条齐全：取消钮 / 点背景 / Esc（与 `CharacterDetailPanel` 同口径）。
 */
import { renderSpell } from '../meta/shell/spellText';
import { setSkipCastConfirm, skipCastConfirm } from './battlePrefs';

export interface CastConfirmInfo {
  /** 施法者显示名 */
  casterName: string;
  /** 技能名；无文本源时为空串 */
  skillName: string;
  /** 技能全文（含 `[魔法+N]` 占位，本层负责求值） */
  skillDescription: string;
  /** 施法者魔力（求值用） */
  magic: number;
  /** 当前法力 / 释放所需 */
  mana: number;
  manaCost: number;
  /**
   * 目标预览文案。
   * - 已确定目标（单体技能且目标唯一）→ 目标名；
   * - 需要玩家点选 → 「确认后点选…」的提示；
   * - 全体/无目标 → 技能文本自带，留空。
   */
  targetNote: string;
  /** 战场上的候选目标卡；确认层会在遮罩上方描出对应轮廓。 */
  targetElements?: readonly HTMLElement[];
}

let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
  .ccp-backdrop{position:absolute;inset:0;z-index:1150;display:none;
    background:rgba(6,5,4,.58);backdrop-filter:blur(2px);
    align-items:center;justify-content:center;
    font-family:"Oswald","PingFang SC","Microsoft YaHei",sans-serif}
  .ccp-backdrop.open{display:flex}
  .ccp-preview-layer{position:absolute;inset:0;z-index:1;pointer-events:none}
  .ccp-preview-target{position:absolute;border:2px solid #e6c979;border-radius:9px;
    box-sizing:border-box;box-shadow:0 0 0 2px rgba(6,5,4,.7),0 0 16px rgba(230,201,121,.78);
    animation:ccp-target-pulse 1.25s ease-in-out infinite}
  .ccp-preview-target.friendly{border-color:#65d58a;box-shadow:0 0 0 2px rgba(6,5,4,.7),0 0 16px rgba(87,212,122,.8)}
  .ccp-preview-target.hostile{border-color:#ee7b6f;box-shadow:0 0 0 2px rgba(6,5,4,.7),0 0 16px rgba(238,105,93,.8)}
  @keyframes ccp-target-pulse{0%,100%{opacity:.62}50%{opacity:1}}
  .ccp{position:relative;width:min(380px,84vw);max-height:80%;overflow-y:auto;
    z-index:2;
    background:linear-gradient(160deg,#171208 0%,#0d0a06 100%);
    border:1px solid rgba(216,194,144,.45);border-radius:10px;
    box-shadow:0 14px 42px rgba(0,0,0,.75);color:#f0e2bf;padding:16px 18px 14px;
    animation:ccp-pop .18s ease-out}
  @keyframes ccp-pop{from{transform:scale(.94);opacity:0}to{transform:scale(1);opacity:1}}
  .ccp-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;
    padding-bottom:8px;border-bottom:1px solid rgba(216,194,144,.2)}
  .ccp-skill{font-family:"Playfair Display",Georgia,serif;font-weight:700;font-size:18px;color:#f6efe0}
  .ccp-mana{font-size:12px;color:#8fb8ff;white-space:nowrap;font-variant-numeric:tabular-nums}
  .ccp-caster{font-size:11px;letter-spacing:.1em;color:#a89974;margin:6px 0 0}
  .ccp-desc{font-size:13px;line-height:1.65;color:#ded0ac;margin:8px 0 0}
  /* 求值后的数字：与英雄页/图鉴同款高亮（spellText 的 .spell-stat / <b>） */
  .ccp-desc b,.ccp-desc .spell-stat{color:#ffe6a8;font-weight:700;background:none;border:0;padding:0;
    font-family:inherit;font-size:inherit}
  .ccp-target{margin:10px 0 0;padding:6px 8px;font-size:12px;line-height:1.5;color:#e8d9ae;
    background:rgba(201,163,92,.1);border-left:2px solid rgba(201,163,92,.55);border-radius:3px}
  .ccp-empty{font-size:12px;color:#8a7c5c;font-style:italic;margin:8px 0 0}
  .ccp-actions{display:flex;gap:10px;margin-top:14px}
  .ccp-btn{flex:1;min-height:40px;display:inline-flex;align-items:center;justify-content:center;
    cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;letter-spacing:.14em;
    text-indent:.14em;border-radius:7px;transition:filter .12s,transform .12s}
  .ccp-cast{color:#1a1206;background:linear-gradient(180deg,#e8cf94 0%,#c9a35c 100%);
    border:1px solid #8a6b30;box-shadow:0 3px 9px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.32)}
  .ccp-cast:hover{filter:brightness(1.07)}
  .ccp-cast:active{transform:translateY(1px)}
  .ccp-cancel{color:#d8c290;background:rgba(20,18,15,.85);border:1px solid rgba(216,194,144,.4)}
  .ccp-cancel:hover{color:#fff3d2;border-color:#c9a35c}
  .ccp-skip{display:flex;align-items:center;gap:6px;margin-top:10px;font-size:11px;color:#8a7c5c;
    cursor:pointer;user-select:none}
  .ccp-skip input{width:14px;height:14px;accent-color:#c9a35c;cursor:pointer}
  @media (prefers-reduced-motion:reduce){.ccp{animation:none}.ccp-preview-target{animation:none}}
  `;
  const style = document.createElement('style');
  style.id = 'ccp-styles';
  style.textContent = css;
  document.head.appendChild(style);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export class CastConfirmPanel {
  private backdrop: HTMLDivElement;
  private previewLayer: HTMLDivElement;
  private panel: HTMLDivElement;
  private pending: ((ok: boolean) => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(parent: HTMLElement) {
    ensureStyles();
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'ccp-backdrop';
    this.backdrop.setAttribute('role', 'presentation');
    this.previewLayer = document.createElement('div');
    this.previewLayer.className = 'ccp-preview-layer';
    this.previewLayer.setAttribute('aria-hidden', 'true');
    this.panel = document.createElement('div');
    this.panel.className = 'ccp';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-modal', 'true');
    this.panel.setAttribute('aria-label', '确认释放技能');
    this.backdrop.append(this.previewLayer, this.panel);
    parent.appendChild(this.backdrop);
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) this.settle(false);
    });
  }

  isOpen(): boolean {
    return this.backdrop.classList.contains('open');
  }

  /**
   * 弹出确认层，返回玩家是否确认释放。
   * `skipCastConfirm()` 为真时不弹层、直接返回 true（老玩家路径）。
   */
  confirm(info: CastConfirmInfo): Promise<boolean> {
    if (skipCastConfirm()) return Promise.resolve(true);
    this.settle(false); // 幂等：残留的上一层先收掉

    const rendered = info.skillDescription
      ? renderSpell(info.skillDescription, info.magic, { interactive: false })
      : { html: '', formulas: [] };
    const descHtml = rendered.html
      ? `<p class="ccp-desc">${rendered.html}</p>`
      : '<p class="ccp-empty">这个技能暂无效果描述。</p>';
    const target = info.targetNote ? `<p class="ccp-target">${esc(info.targetNote)}</p>` : '';

    this.panel.innerHTML = `
      <div class="ccp-head">
        <span class="ccp-skill">${esc(info.skillName || '技能')}</span>
        <span class="ccp-mana">法力 ${info.mana}/${info.manaCost}</span>
      </div>
      <p class="ccp-caster">${esc(info.casterName)}</p>
      ${descHtml}
      ${target}
      <div class="ccp-actions">
        <button class="ccp-btn ccp-cancel" type="button">取 消</button>
        <button class="ccp-btn ccp-cast" type="button">释 放</button>
      </div>
      <label class="ccp-skip"><input type="checkbox" class="ccp-skip-box">之后跳过技能确认（可在设置中恢复）</label>
    `;
    const accept = () => {
      if ((this.panel.querySelector('.ccp-skip-box') as HTMLInputElement | null)?.checked) {
        setSkipCastConfirm(true);
      }
      this.settle(true);
    };
    this.panel.querySelector('.ccp-cast')?.addEventListener('click', accept);
    this.backdrop.classList.add('open');
    this.renderTargetPreviews(info.targetElements ?? []);
    this.panel.querySelector('.ccp-cancel')?.addEventListener('click', () => this.settle(false));
    (this.panel.querySelector('.ccp-cast') as HTMLElement | null)?.focus();

    return new Promise<boolean>((resolve) => {
      this.pending = resolve;
      this.keyHandler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          this.settle(false);
        }
      };
      window.addEventListener('keydown', this.keyHandler, true);
    });
  }

  /** 强制收起（战斗销毁/状态切换时调用），等待中的 Promise 以 false 结束 */
  cancel(): void {
    this.settle(false);
  }

  private settle(ok: boolean): void {
    this.backdrop.classList.remove('open');
    this.previewLayer.replaceChildren();
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler, true);
      this.keyHandler = null;
    }
    const resolve = this.pending;
    this.pending = null;
    resolve?.(ok);
  }

  private renderTargetPreviews(targets: readonly HTMLElement[]): void {
    this.previewLayer.replaceChildren();
    if (targets.length === 0) return;
    const host = this.backdrop.getBoundingClientRect();
    const scaleX = host.width > 0 && this.backdrop.offsetWidth > 0
      ? host.width / this.backdrop.offsetWidth
      : 1;
    const scaleY = host.height > 0 && this.backdrop.offsetHeight > 0
      ? host.height / this.backdrop.offsetHeight
      : scaleX;
    for (const target of targets) {
      const rect = target.getBoundingClientRect();
      const outline = document.createElement('span');
      outline.className = `ccp-preview-target ${target.classList.contains('ally') ? 'friendly' : 'hostile'}`;
      outline.style.left = `${(rect.left - host.left) / scaleX}px`;
      outline.style.top = `${(rect.top - host.top) / scaleY}px`;
      outline.style.width = `${rect.width / scaleX}px`;
      outline.style.height = `${rect.height / scaleY}px`;
      this.previewLayer.appendChild(outline);
    }
  }
}
