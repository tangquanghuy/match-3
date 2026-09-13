/**
 * 宿主通信状态条（需求 3.3、4.8；设计 §5 的「页面关闭前未确认结果时显示等待/重试提示」）。
 *
 * 故意做得很轻：一个居中顶部的小条，只在需要用户知情时出现——等待宿主下发战斗、
 * 结果投递中、投递失败。不参与战斗布局，不进 `battle-wrapper`，避免被等比缩放影响可读性。
 */
export type HostStatusKind = 'info' | 'pending' | 'error';

const STYLE_BY_KIND: Record<HostStatusKind, string> = {
  info: 'border-color:rgba(216,194,144,.42);color:#e6d6ad',
  pending: 'border-color:rgba(142,105,255,.6);color:#dcccff',
  error: 'border-color:rgba(255,90,77,.72);color:#ffd0ca',
};

export class HostStatusBanner {
  private readonly el: HTMLDivElement;

  constructor(parent: HTMLElement = document.body) {
    const el = document.createElement('div');
    el.dataset.testid = 'host-status';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = [
      'position:fixed', 'left:50%', 'top:max(8px,env(safe-area-inset-top))',
      'transform:translateX(-50%)', 'z-index:20000', 'display:none',
      'max-width:min(92vw,520px)', 'padding:7px 14px', 'box-sizing:border-box',
      'border:1px solid rgba(216,194,144,.42)', 'border-radius:8px',
      'background:rgba(11,10,9,.92)', 'backdrop-filter:blur(3px)',
      'font-family:Oswald,"PingFang SC","Microsoft YaHei",sans-serif',
      'font-size:13px', 'line-height:1.5', 'letter-spacing:.03em',
      'text-align:center', 'color:#e6d6ad', 'pointer-events:none',
      'box-shadow:0 2px 10px rgba(0,0,0,.6)',
    ].join(';');
    parent.appendChild(el);
    this.el = el;
  }

  show(text: string, kind: HostStatusKind = 'info'): void {
    this.el.textContent = text;
    this.el.dataset.kind = kind;
    // 只改颜色相关属性，尺寸/定位保持初始声明
    const [border, color] = STYLE_BY_KIND[kind].split(';');
    this.el.style.borderColor = border.split(':').slice(1).join(':');
    this.el.style.color = color.split(':').slice(1).join(':');
    this.el.style.display = 'block';
  }

  hide(): void {
    this.el.style.display = 'none';
    delete this.el.dataset.kind;
  }
}
