let stylesInjected = false;
function ensureStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const css = `
  .gop-backdrop{position:absolute;inset:0;z-index:1200;display:none;
    background:rgba(6,5,4,.72);backdrop-filter:blur(3px);
    align-items:center;justify-content:center;
    font-family:"Oswald","PingFang SC","Microsoft YaHei",sans-serif}
  .gop-backdrop.open{display:flex;animation:gop-fade .45s ease-out}
  @keyframes gop-fade{from{opacity:0}to{opacity:1}}
  .gop{position:relative;width:min(360px,80vw);text-align:center;
    background:linear-gradient(160deg,#171208 0%,#0d0a06 100%);
    border:1px solid rgba(216,194,144,.4);border-radius:12px;
    box-shadow:0 16px 48px rgba(0,0,0,.8);color:#f0e2bf;padding:34px 28px 28px;
    animation:gop-pop .5s cubic-bezier(.22,1.4,.36,1)}
  @keyframes gop-pop{from{transform:scale(.82);opacity:0}to{transform:scale(1);opacity:1}}
  .gop-title{font-family:"Playfair Display",Georgia,serif;font-weight:800;
    font-size:44px;letter-spacing:.14em;margin:0 0 6px;text-indent:.14em}
  .gop.victory .gop-title{color:#f6e3a8;
    text-shadow:0 0 18px rgba(214,168,74,.55),0 2px 4px rgba(0,0,0,.6)}
  .gop.defeat .gop-title{color:#c96a5c;
    text-shadow:0 0 14px rgba(140,40,30,.5),0 2px 4px rgba(0,0,0,.6)}
  .gop-sub{font-size:13px;letter-spacing:.22em;color:#a89974;
    text-transform:uppercase;margin:0 0 26px;text-indent:.22em}
  .gop-continue{display:inline-flex;align-items:center;justify-content:center;
    min-width:150px;min-height:44px;height:44px;padding:0 22px;cursor:pointer;
    font-family:inherit;font-size:15px;font-weight:600;letter-spacing:.16em;text-indent:.16em;
    color:#1a1206;background:linear-gradient(180deg,#e8cf94 0%,#c9a35c 100%);
    border:1px solid #8a6b30;border-radius:8px;
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
 * 胜负结算面板：game-over 事件到达时弹出，展示胜利/战败。
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

  /** 弹出结算：playerWon 为 true 显示胜利，否则显示战败 */
  open(playerWon: boolean): void {
    this.panel.classList.remove('victory', 'defeat');
    this.panel.classList.add(playerWon ? 'victory' : 'defeat');
    this.panel.innerHTML = `
      <h1 class="gop-title">${playerWon ? '胜 利' : '战 败'}</h1>
      <p class="gop-sub">${playerWon ? 'VICTORY' : 'DEFEAT'}</p>
      <button class="gop-continue">继 续</button>
    `;
    this.panel.querySelector('.gop-continue')
      ?.addEventListener('click', () => this.onContinue(playerWon));
    this.backdrop.classList.add('open');
  }

  close(): void {
    this.backdrop.classList.remove('open');
  }
}
