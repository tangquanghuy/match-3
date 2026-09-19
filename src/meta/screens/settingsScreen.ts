/**
 * 设置屏（存档导出/导入/重置 + 开发者选项）。
 *
 * UX 阶段 A 在这一屏记了 4 条 P0（`16-settings.md`），根因是「破坏性操作比只读操作更显眼、
 * 而唯一的风险警告被面板裁掉」。本轮重做的三条原则：
 *   1. **只读操作显眼，破坏性操作费力**（导出/复制是亮金次级按钮；导入与重置一律暗红危险态 + 二次确认）；
 *   2. **覆盖前先看清要覆盖成什么**（导入先校验 + 并排预览「已读取 / 将覆盖」，不合法的 JSON 直接拒绝）；
 *   3. **反馈留在页面上**（成功卡片，不用一闪而过又被整屏重建冲掉的 toast）。
 */
import { bottomNavHtml, mountIcons, toast, toastHtml, topbarHtml, $ } from '../shell/chrome';
import type { MetaSave } from '../state/schema';
import type { Screen, ShellCtx } from '../shell/screen';

/**
 * 本屏样式段（窗口 Q）。`shell/styles/**` 归 L 独占，故写在屏内。
 * L 交付后迁移：暗红危险态 → `.btn--danger` + `--ds-edge-danger`，面板 → `--ds-l1`，卡片 → `--ds-l2`。
 *
 * 其中 `.panel` 的高度模型覆盖是 **S-1 的本屏兜底**：全局 `.panel{height:100%;overflow:hidden}`
 * 假设「面板里只有 panel-inner」，而本屏把 `.panel-head` 放进 `.panel` → inner 溢出正好一个 head
 * 的高度（实测 63px）被裁掉，导入按钮只露 4px、唯一的风险警告 0% 可见。
 * 全局修法（`.panel` 改 flex 列）属 L 的组件基类工作，已在台账登记为需求。
 */
const SETTINGS_CSS = `
  .settings-screen { padding: 20px 40px 96px; overflow-y: auto; }
  .settings-screen .settings-layout { display: flex; flex-direction: column; gap: 14px; }
  /* S-1 兜底：面板改 flex 列，head 与 inner 共享高度，内容不再被裁 */
  .settings-screen .panel { height: auto; display: flex; flex-direction: column; overflow: visible; }
  .settings-screen .panel-inner { height: auto; flex: 1 1 auto; min-height: 0; overflow: visible; }
  .settings-screen .settings-body { display: flex; flex-direction: column; gap: 12px; padding-bottom: 6px; }
  .settings-screen .settings-note { font: 12px var(--body); line-height: 1.7; color: #c4b6a3; }
  .settings-screen .settings-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .settings-screen textarea#saveText {
    width: 100%; min-height: 120px;
    background: rgba(8, 8, 14, .82);
    border: 1px solid #67563e;
    border-radius: 4px;
    color: #c4b6a3;
    font: 12px ui-monospace, monospace;
    padding: 10px;
    resize: vertical;
  }

  /* S-4：危险区与危险按钮必须一眼可辨（改前两个「重置」与「导出」逐像素相同） */
  .panel.danger-zone { box-shadow: 0 0 0 1px rgba(122, 58, 52, .96), 0 0 0 2px rgba(196, 84, 84, .38), 0 18px 40px #0008; }
  .panel.danger-zone .panel-head small { color: #e7a79c; }
  .danger-btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 18px;
    background: linear-gradient(180deg, #2b1a1a, #1a1012);
    border: 1px solid #c45454;
    border-radius: 4px;
    color: #ffd9d2;
    font: 600 13px var(--body);
  }
  .danger-btn:hover:not(:disabled) { background: linear-gradient(180deg, #3a2020, #221416); border-color: #e07070; }
  .danger-btn [data-icon] { width: 16px; height: 16px; color: #e7a79c; }
  .danger-btn.armed { border-width: 2px; color: #fff; background: linear-gradient(180deg, #5a2422, #33161a); }
  .warn-line {
    display: flex; gap: 8px; align-items: flex-start;
    padding: 9px 12px;
    background: rgba(122, 58, 52, .18);
    border-left: 3px solid #c45454;
    border-radius: 3px;
    font: 12px var(--body); line-height: 1.6; color: #e7c3bc;
  }

  /* S-2/S-3：导入前预览 + 留在页面上的结果卡 */
  .import-preview, .settings-result {
    display: flex; flex-direction: column; gap: 8px;
    padding: 12px 14px;
    background: linear-gradient(#20202c, #16161f);
    border: 1px solid rgba(186, 164, 139, .18);
    border-radius: 6px;
    font: 12px var(--body); color: #c4b6a3;
  }
  .import-preview .cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .import-preview .cmp > div { display: flex; flex-direction: column; gap: 4px; }
  .import-preview .cmp small { letter-spacing: 2px; color: #91887a; font-size: 10px; }
  .import-preview .cmp b { font: 13px var(--body); color: #f2ead8; }
  .import-preview .acts { display: flex; gap: 10px; justify-content: flex-end; }
  .settings-result.ok { border-color: #4f7d5f; color: #bfe3cd; }
  .settings-result.bad { border-color: #c45454; color: #f0c9c2; }
  .settings-result b { color: #f2ead8; }

  .settings-screen .check-row { display: flex; align-items: center; gap: 10px; font: 13px var(--body); color: #c4b6a3; }
  /* 原生白色方块不属于暗金体系（S-6）：换成暗底金框自绘勾选 */
  .settings-screen .check-row input[type="checkbox"] {
    appearance: none;
    width: 18px; height: 18px;
    background: rgba(8, 8, 14, .82);
    border: 1px solid #67563e;
    border-radius: 3px;
    display: grid; place-items: center;
    cursor: pointer;
  }
  .settings-screen .check-row input[type="checkbox"]:checked { border-color: #e1c891; }
  .settings-screen .check-row input[type="checkbox"]:checked:after {
    content: "";
    width: 9px; height: 5px;
    border-left: 2px solid #f4e2b4;
    border-bottom: 2px solid #f4e2b4;
    transform: rotate(-45deg) translateY(-1px);
  }
  .settings-screen .check-row input[type="checkbox"]:focus-visible { outline: none; box-shadow: 0 0 0 2px #e8cc86; }
  .settings-screen .dev-tag {
    padding: 1px 7px 2px; border: 1px solid #67563e; border-radius: 999px;
    font: 10px var(--body); letter-spacing: 1px; color: #91887a;
  }
`;

/** 存档必需节：少任何一节都不是本游戏的存档（S-2 的判据） */
const REQUIRED_SECTIONS = ['currencies', 'hero', 'collection', 'kingdoms', 'teams'] as const;

interface SaveDigest {
  level: number;
  gold: number;
  gems: number;
  collection: number;
  kingdoms: number;
  version: number | null;
}

function digestOf(save: MetaSave): SaveDigest {
  return {
    level: save.hero?.level ?? 0,
    gold: save.currencies?.gold ?? 0,
    gems: save.currencies?.gems ?? 0,
    collection: Object.keys(save.collection ?? {}).length,
    kingdoms: Object.keys(save.kingdoms ?? {}).length,
    version: typeof save.version === 'number' ? save.version : null,
  };
}

const fmt = (n: number): string => n.toLocaleString('en-US');
const digestLine = (d: SaveDigest): string =>
  `Lv.${d.level} · 收藏 ${fmt(d.collection)} 张 · 黄金 ${fmt(d.gold)} · 宝石 ${fmt(d.gems)} · 王国 ${d.kingdoms} 个`;

export class SettingsScreen implements Screen {
  private ctx!: ShellCtx;
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
  /** 跨 refresh 存活的结果卡（S-3：成功反馈不能靠被整屏重建冲掉的 toast） */
  private notice: { kind: 'ok' | 'bad'; text: string } | null = null;
  /** 待导入的已校验文本 + 摘要（S-2：确认前先看清覆盖成什么） */
  private pending: { text: string; digest: SaveDigest } | null = null;
  /** 重置按钮的"再点一次确认"状态（S-5：破坏性操作要费力） */
  private armed: 'demo' | 'new' | null = null;

  html(ctx: ShellCtx): string {
    const cur = digestOf(ctx.save());
    const notice = this.notice
      ? `<div class="settings-result ${this.notice.kind}" id="settingsResult">${this.notice.text}</div>`
      : '';
    return `
      <style id="settingsScreenCss">${SETTINGS_CSS}</style>
      ${topbarHtml()}
      <main class="screen settings-screen">
        <div class="settings-layout">
          <section class="panel">
            <div class="panel-head"><div><small>SAVE DATA</small><h2>存档</h2></div></div>
            <div class="panel-inner settings-body">
              <p class="settings-note">
                你的进度保存在这台设备的浏览器里（当前进度：<b>${digestLine(cur)}</b>）。<br>
                清理浏览器数据会一并清掉存档；换设备或重装前，请先「导出存档文件」留一份。
              </p>
              ${notice}
              <div class="settings-row">
                <button class="secondary" id="downloadBtn" type="button"><span data-icon="chevrons"></span>导出存档文件（.json）</button>
                <button class="secondary" id="copyBtn" type="button"><span data-icon="book"></span>复制存档文本</button>
                <button class="secondary" id="exportBtn" type="button">显示在文本框</button>
              </div>
              <textarea id="saveText" spellcheck="false" placeholder="导出的存档 JSON 会出现在这里；也可以把别处的存档粘进来再点下面的「读取并校验」"></textarea>

              <div class="panel-head" style="margin:6px 0 0"><div><small>IMPORT</small><h2>导入存档</h2></div></div>
              <div class="warn-line"><span data-icon="lock"></span><span>导入会<b>覆盖现在的进度</b>且不可撤销。先「读取并校验」，确认预览无误再覆盖。</span></div>
              <div class="settings-row">
                <button class="secondary" id="pickFileBtn" type="button"><span data-icon="chest"></span>选择存档文件…</button>
                <button class="secondary" id="validateBtn" type="button">读取并校验文本框内容</button>
                <input type="file" id="saveFile" accept="application/json,.json" hidden>
              </div>
              <div id="importPreview"></div>
            </div>
          </section>

          <section class="panel">
            <div class="panel-head"><div><small>DEVELOPER</small><h2>开发者选项</h2></div></div>
            <div class="panel-inner settings-body">
              <label class="check-row">
                <input type="checkbox" id="battleDebug">
                <span>战斗调试钩子</span>
                <span class="dev-tag">开发者选项 · 对玩家无效果</span>
              </label>
              <p class="settings-note">只影响战斗层的调试输出，不改变任何玩法数值；普通游玩不需要打开。</p>
            </div>
          </section>

          <section class="panel danger-zone">
            <div class="panel-head"><div><small>⚠ DANGER ZONE</small><h2>危险操作</h2></div></div>
            <div class="panel-inner settings-body">
              <div class="warn-line">
                <span data-icon="lock"></span>
                <span>重置会<b>立刻删除当前全部进度并写盘</b>，不可撤销。<br>
                将被删除的是：<b>${digestLine(cur)}</b>。需要留档请先用上面的「导出存档文件」。</span>
              </div>
              <div class="settings-row">
                <button class="danger-btn" id="resetNew" type="button"><span data-icon="skull"></span><span id="resetNewLabel">重置为全新档</span></button>
                <button class="danger-btn" id="resetDemo" type="button"><span data-icon="skull"></span><span id="resetDemoLabel">重置为演示档（调试用）</span></button>
              </div>
              <p class="settings-note">按一次会变成「再点一次确认」，5 秒内不再点则自动取消。</p>
            </div>
          </section>

          <div class="settings-row">
            <button class="secondary" id="settingsBack" type="button"><span data-icon="arrow"></span>返回地图</button>
          </div>
        </div>
      </main>
      ${bottomNavHtml('', '进度保存在本机浏览器')}
      ${toastHtml()}`;
  }

  mount(ctx: ShellCtx): void {
    this.ctx = ctx;
    this.notice = null; // 结果卡只展示一轮（已渲染进 html）
    this.pending = null;
    this.armed = null;
    mountIcons(document);
    ($('#battleDebug') as HTMLInputElement).checked = ctx.save().settings.battleDebug;

    this.bind('#exportBtn', 'click', () => {
      ($('#saveText') as HTMLTextAreaElement).value = this.prettyJson();
      toast('存档已显示在文本框（缩进格式，便于核对）。');
    });
    this.bind('#downloadBtn', 'click', () => this.download());
    this.bind('#copyBtn', 'click', () => {
      const text = ctx.gateway.exportSaveJson();
      void navigator.clipboard
        ?.writeText(text)
        .then(() => toast('已复制到剪贴板。'))
        .catch(() => {
          ($('#saveText') as HTMLTextAreaElement).value = this.prettyJson();
          toast('剪贴板不可用，已把存档显示在文本框，请手动复制。');
        });
    });
    this.bind('#validateBtn', 'click', () => this.validate(($('#saveText') as HTMLTextAreaElement).value));
    this.bind('#pickFileBtn', 'click', () => ($('#saveFile') as HTMLInputElement).click());
    this.bind('#saveFile', 'change', (e) => void this.readFile(e));
    this.bind('#battleDebug', 'change', () => void this.toggleDebug());
    this.bind('#resetNew', 'click', () => void this.reset(false));
    this.bind('#resetDemo', 'click', () => void this.reset(true));
    this.bind('#settingsBack', 'click', () => ctx.navigate('#map'));
  }

  private prettyJson(): string {
    const raw = this.ctx.gateway.exportSaveJson();
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }

  /** S-9：导出成文件（改前 9,261 字符压成一行塞进 196px 文本框，既看不全也存不下来） */
  private download(): void {
    const text = this.prettyJson();
    const stamp = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    const name = `chronicles-save-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.json`;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    this.showResult('ok', `已导出存档文件 <b>${name}</b>。把它保存好，导入时选这个文件即可。`);
  }

  private async readFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    ($('#saveText') as HTMLTextAreaElement).value = text.length > 200_000 ? '（文件过大，已省略预览）' : text;
    this.validate(text);
    input.value = '';
  }

  /**
   * S-2：导入前校验 + 预览。
   *
   * 改前的行为：粘 `{"hello":"world"}` 点导入 → 整档被替换成全新档并立即写盘，
   * 无确认、无备份、无提示、无报错（根因是 `save.ts` 把"没有 version 字段"当成 -1
   * 从而绕过版本校验，随后 migrateSave 把每一节补成默认值 = 一份崭新存档）。
   * 这里在屏层先做必需节校验，把"合法 JSON 但不是存档"挡在覆盖之前。
   */
  private validate(raw: string): void {
    const text = raw.trim();
    const preview = $('#importPreview');
    this.pending = null;
    if (!text) {
      preview.innerHTML = '';
      toast('先选择存档文件，或把存档 JSON 粘进文本框。');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      preview.innerHTML = '';
      this.showResult('bad', '这不是合法的 JSON，没有任何改动发生。');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      preview.innerHTML = '';
      this.showResult('bad', '这不是一份存档（顶层不是对象），没有任何改动发生。');
      return;
    }
    const obj = parsed as Record<string, unknown>;
    const missing = REQUIRED_SECTIONS.filter((k) => !obj[k] || typeof obj[k] !== 'object');
    if (missing.length) {
      preview.innerHTML = '';
      this.showResult(
        'bad',
        `这是合法 JSON，但不是本游戏的存档：缺少 <b>${missing.join(' / ')}</b> 等必需内容。<b>当前进度未被改动。</b>`,
      );
      return;
    }
    const incoming = digestOf(obj as unknown as MetaSave);
    const current = digestOf(this.ctx.save());
    this.pending = { text, digest: incoming };
    preview.innerHTML = `
      <div class="import-preview">
        <div class="cmp">
          <div><small>已读取（将导入）</small><b>${digestLine(incoming)}</b><span>存档结构版本 ${incoming.version ?? '未标注'}</span></div>
          <div><small>将被覆盖（现在的进度）</small><b>${digestLine(current)}</b><span>覆盖后无法找回</span></div>
        </div>
        <div class="warn-line"><span data-icon="lock"></span><span>确认前建议先「导出存档文件」留一份当前进度。</span></div>
        <div class="acts">
          <button class="cancel" id="importCancel" type="button">取消</button>
          <button class="danger-btn" id="importConfirm" type="button"><span data-icon="chevrons"></span><span id="importConfirmLabel">确认覆盖当前进度</span></button>
        </div>
      </div>`;
    mountIcons(preview);
    this.bind('#importCancel', 'click', () => {
      this.pending = null;
      preview.innerHTML = '';
      toast('已取消导入，当前进度未改动。');
    });
    let armedImport = false;
    this.bind('#importConfirm', 'click', () => {
      if (!armedImport) {
        armedImport = true;
        $('#importConfirm').classList.add('armed');
        $('#importConfirmLabel').textContent = '再点一次以覆盖';
        setTimeout(() => {
          armedImport = false;
          const btn = $('#importConfirm');
          if (btn) {
            btn.classList.remove('armed');
            $('#importConfirmLabel').textContent = '确认覆盖当前进度';
          }
        }, 5000);
        return;
      }
      void this.doImport();
    });
  }

  private async doImport(): Promise<void> {
    if (!this.pending) return;
    const { text, digest } = this.pending;
    try {
      await this.ctx.gateway.importSaveJson(text);
      // S-3：反馈放在 refresh **之后**（改前 toast 被整屏重建冲掉，成功比失败更让人困惑）
      this.notice = { kind: 'ok', text: `<b>导入成功</b>：当前进度已是 ${digestLine(digest)}。` };
      this.pending = null;
      this.ctx.refresh();
    } catch (error: unknown) {
      this.showResult('bad', '导入失败：' + (error instanceof Error ? error.message : String(error)));
    }
  }

  private async toggleDebug(): Promise<void> {
    const on = ($('#battleDebug') as HTMLInputElement).checked;
    await this.ctx.gateway.setBattleDebug(on);
    toast(on ? '战斗调试已开启（开发者选项）。' : '战斗调试已关闭。');
  }

  /** S-5：页内两段式确认，取代跳出舞台的原生 confirm()（两条文案只差两字、默认焦点在"确定"） */
  private async reset(demo: boolean): Promise<void> {
    const which: 'demo' | 'new' = demo ? 'demo' : 'new';
    const label = demo ? '演示档' : '全新档';
    const btn = $(demo ? '#resetDemo' : '#resetNew');
    const labelEl = $(demo ? '#resetDemoLabel' : '#resetNewLabel');
    if (this.armed !== which) {
      this.armed = which;
      // 另一个按钮的待确认状态一并清掉，避免两个都亮着
      for (const [id, text] of [['#resetDemoLabel', '重置为演示档（调试用）'], ['#resetNewLabel', '重置为全新档']] as const) {
        const other = $(id);
        if (other && other !== labelEl) {
          other.textContent = text;
          other.parentElement?.classList.remove('armed');
        }
      }
      btn.classList.add('armed');
      labelEl.textContent = `再点一次：删除当前进度并重置为${label}`;
      setTimeout(() => {
        if (this.armed !== which) return;
        this.armed = null;
        const still = $(demo ? '#resetDemoLabel' : '#resetNewLabel');
        if (still) {
          still.textContent = demo ? '重置为演示档（调试用）' : '重置为全新档';
          still.parentElement?.classList.remove('armed');
        }
      }, 5000);
      return;
    }
    this.armed = null;
    const snapshot = demo ? await this.ctx.gateway.resetToDemo() : await this.ctx.gateway.resetToNewGame();
    toast(snapshot.warning ? `已重置：${snapshot.warning}` : `已重置为${label}。`);
    this.ctx.navigate('#map');
  }

  private showResult(kind: 'ok' | 'bad', html: string): void {
    const el = $('#settingsResult');
    if (el) {
      el.className = `settings-result ${kind}`;
      el.innerHTML = html;
      return;
    }
    // 结果卡还没渲染过 → 插到存档面板正文开头
    const body = $('.settings-screen .settings-body');
    if (!body) {
      toast(html.replace(/<[^>]+>/g, ''));
      return;
    }
    const div = document.createElement('div');
    div.id = 'settingsResult';
    div.className = `settings-result ${kind}`;
    div.innerHTML = html;
    body.insertBefore(div, body.children[1] ?? null);
  }

  private on(target: EventTarget, type: string, fn: EventListenerOrEventListenerObject): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  private bind(selector: string, type: string, fn: EventListenerOrEventListenerObject): void {
    const el = $(selector);
    if (el) this.on(el, type, fn);
  }

  dispose(): void {
    for (const [target, type, fn] of this.listeners.splice(0)) {
      target.removeEventListener(type, fn);
    }
  }
}
