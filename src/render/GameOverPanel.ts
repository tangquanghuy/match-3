let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
  .gop-backdrop{position:absolute;inset:0;z-index:4000;display:none;isolation:isolate;
    align-items:center;justify-content:center;pointer-events:auto;
    background:
      linear-gradient(180deg, rgba(8,6,10,.78) 0%, rgba(6,5,8,.86) 42%, rgba(4,3,6,.9) 100%),
      radial-gradient(ellipse at 50% 34%, rgba(86,62,28,.26) 0%, transparent 54%);
    font-family:"Oswald","PingFang SC","Microsoft YaHei",sans-serif}
  .gop-backdrop.open{display:flex;animation:gop-fade .45s ease-out}
  .gop-open .gcard{visibility:hidden}
  @keyframes gop-fade{from{opacity:0}to{opacity:1}}
  .gop{position:relative;width:min(420px,78%);text-align:center;color:#f0e2bf;
    padding:36px 32px 28px;border-radius:4px;
    background:
      linear-gradient(165deg, rgba(38,30,20,.94) 0%, rgba(16,13,14,.97) 46%, rgba(10,9,12,.98) 100%);
    box-shadow:0 28px 64px rgba(0,0,0,.72), inset 0 1px 0 rgba(244,226,174,.2);
    animation:gop-pop .5s cubic-bezier(.22,1.4,.36,1)}
  .gop:before{content:"";position:absolute;inset:0;pointer-events:none;padding:1px;border-radius:4px;
    background:linear-gradient(135deg, rgba(244,226,174,.78), rgba(151,121,69,.4) 38%, rgba(224,197,132,.7) 72%, rgba(119,92,51,.48));
    -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
    -webkit-mask-composite:xor;mask-composite:exclude}
  .gop:after{content:"";position:absolute;inset:10px;pointer-events:none;opacity:.55;border-radius:2px;
    background:
      linear-gradient(90deg, rgba(239,217,158,.82), transparent) left top / 28px 1px no-repeat,
      linear-gradient(180deg, rgba(239,217,158,.82), transparent) left top / 1px 28px no-repeat,
      linear-gradient(270deg, rgba(239,217,158,.82), transparent) right top / 28px 1px no-repeat,
      linear-gradient(180deg, rgba(239,217,158,.82), transparent) right top / 1px 28px no-repeat,
      linear-gradient(90deg, rgba(239,217,158,.7), transparent) left bottom / 24px 1px no-repeat,
      linear-gradient(0deg, rgba(239,217,158,.7), transparent) left bottom / 1px 24px no-repeat,
      linear-gradient(270deg, rgba(239,217,158,.7), transparent) right bottom / 24px 1px no-repeat,
      linear-gradient(0deg, rgba(239,217,158,.7), transparent) right bottom / 1px 24px no-repeat}
  @keyframes gop-pop{from{transform:scale(.88);opacity:0}to{transform:scale(1);opacity:1}}
  .gop-mark{display:flex;align-items:center;justify-content:center;gap:14px;margin:4px 0 2px}
  .gop-mark i{width:46px;height:1px;background:linear-gradient(90deg,transparent,#d4b36a)}
  .gop-mark i:last-child{transform:scaleX(-1)}
  .gop-title{font-family:"Playfair Display",Georgia,serif;font-weight:800;
    font-size:42px;letter-spacing:.18em;margin:0;text-indent:.18em}
  .gop.victory .gop-title{color:#f6e3a8;
    text-shadow:0 0 22px rgba(214,168,74,.55),0 2px 0 #4a3414}
  .gop.defeat .gop-title{color:#d4b8b0;
    text-shadow:0 0 14px rgba(140,40,30,.35),0 2px 4px rgba(0,0,0,.6)}
  .gop-stats{margin:18px 8px 22px;padding:12px 6px;display:flex;flex-direction:column;gap:8px;
    border-top:1px solid rgba(216,194,144,.22);border-bottom:1px solid rgba(216,194,144,.22)}
  .gop-stat{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-size:13px}
  .gop-stat .k{color:#a89974;letter-spacing:.08em}
  .gop-stat .v{color:#f6efe0;font-weight:600;font-variant-numeric:tabular-nums}
  .gop-loot{display:flex;justify-content:flex-end;gap:14px;font-size:13px;color:#f0dfae}
  .gop-loot span{white-space:nowrap}
  .gop-loot i{font-style:normal;color:#a89974;margin-right:4px}
  .gop-continue{display:inline-flex;align-items:center;justify-content:center;
    min-width:168px;min-height:46px;height:46px;padding:0 22px;cursor:pointer;
    font-family:inherit;font-size:16px;font-weight:600;letter-spacing:.16em;text-indent:.16em;
    color:#1a1206;background:linear-gradient(180deg,#e8cf94 0%,#c9a35c 100%);
    border:1px solid #8a6b30;border-radius:4px;
    box-shadow:0 3px 10px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.35);
    transition:filter .15s,transform .15s}
  .gop-continue:hover{filter:brightness(1.08)}
  .gop-continue:active{transform:translateY(1px)}
  `;
  const style = document.createElement('style');
  style.id = 'gop-styles';
  style.textContent = css;
  document.head.appendChild(style);
}

/**
 * 面板内展示的战果（B-9）。全部取自 `App.exportResult()`/引擎状态，
 * 本组件只做展示——**仍然不做任何页面导航**（组件边界不变，下游 meta 结算屏另有其事）。
 */
export interface GameOverStats {
  /** 完成回合数 */
  turns: number;
  /** 我方存活 / 出战人数 */
  survivors: number;
  teamSize: number;
  /** 战斗内收集（战场经济池）；三项都为 0 时显示诚实空态 */
  loot?: { gold: number; souls: number; gems: number };
}

/**
 * 胜负结算面板：game-over 事件到达时弹出，展示胜利/战败 + 本场战果。
 * 点击"继续"触发 onContinue 回调，由宿主接管后续流程
 * （战利品统计 / 跳转其他页面等，本组件不做任何页面导航）。
 */
export class GameOverPanel {
  private backdrop: HTMLDivElement;
  private panel: HTMLDivElement;

  constructor(parent: HTMLElement, private onContinue: (playerWon: boolean) => void) {
    ensureStyles();
    this.backdrop = document.createElement('div');
    this.backdrop.className = 'gop-backdrop';
    this.panel = document.createElement('div');
    this.panel.className = 'gop';
    this.backdrop.appendChild(this.panel);
    parent.appendChild(this.backdrop);
  }

  /**
   * 弹出结算：playerWon 为 true 显示胜利，否则显示战败。
   * @param stats 本场战果（B-9）。缺省时退回旧的两行版式，不报错。
   */
  open(playerWon: boolean, stats?: GameOverStats, surrendered = false): void {
    this.panel.classList.remove('victory', 'defeat');
    this.panel.classList.add(playerWon ? 'victory' : 'defeat');
    this.panel.innerHTML = `
      <div class="gop-mark">
        <i></i>
        <h1 class="gop-title">${surrendered ? '已放弃' : playerWon ? '胜 利' : '战 败'}</h1>
        <i></i>
      </div>
      ${stats ? renderStats(stats) : ''}
      <button class="gop-continue">继 续</button>
    `;
    this.panel.querySelector('.gop-continue')
      ?.addEventListener('click', () => this.onContinue(playerWon));
    this.backdrop.classList.add('open');
    this.backdrop.parentElement?.classList.add('gop-open');
  }

  close(): void {
    this.backdrop.classList.remove('open');
    this.backdrop.parentElement?.classList.remove('gop-open');
  }
}

/** 战果区 HTML（纯函数，便于与 App 的取数逻辑分开验证） */
export function renderStats(stats: GameOverStats): string {
  const loot = stats.loot;
  const lootParts = loot
    ? [
        loot.gold > 0 ? `<span><i>金币</i>${loot.gold}</span>` : '',
        loot.souls > 0 ? `<span><i>灵魂</i>${loot.souls}</span>` : '',
        loot.gems > 0 ? `<span><i>宝石</i>${loot.gems}</span>` : '',
      ].filter(Boolean)
    : [];
  const lootValue = lootParts.length
    ? `<span class="gop-loot">${lootParts.join('')}</span>`
    : '<span class="v">本场无额外收集</span>';
  return `<div class="gop-stats">
    <div class="gop-stat"><span class="k">回合</span><span class="v">${stats.turns}</span></div>
    <div class="gop-stat"><span class="k">我方存活</span><span class="v">${stats.survivors} / ${stats.teamSize}</span></div>
    <div class="gop-stat"><span class="k">战场收集</span>${lootValue}</div>
  </div>`;
}
