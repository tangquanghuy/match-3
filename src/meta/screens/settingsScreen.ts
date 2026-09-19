/**
 * 设置屏（计划 §3.3 的存档导入导出/调试开关；小样里缺失的一屏，此处按同一
 * 视觉语言补齐）。数据面走网关：导出/导入/重置/战斗调试开关。
 */
import { bottomNavHtml, toast, toastHtml, topbarHtml, $ } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';

export class SettingsScreen implements Screen {
  private ctx!: ShellCtx;
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];

  html(): string {
    return `
      ${topbarHtml()}
      <main class="screen settings-screen">
        <div class="settings-layout">
          <section class="panel">
            <div class="panel-head"><div><small>SAVE DATA</small><h2>存档管理</h2></div></div>
            <div class="panel-inner settings-body">
              <p class="settings-note">当前后端：<b>mock（localStorage 双槽防损）</b>。存档结构 MetaSave v1，将来可整体切 Cloudflare D1（网关接口已按远端 RPC 形状设计），本屏逻辑不变。</p>
              <div class="settings-row">
                <button class="secondary" id="exportBtn" type="button"><span data-icon="bag"></span>导出存档 JSON</button>
                <button class="secondary" id="copyBtn" type="button">复制到剪贴板</button>
              </div>
              <textarea id="saveText" spellcheck="false" placeholder="导出的存档 JSON 会出现在这里；粘贴别的存档后点「导入」"></textarea>
              <div class="settings-row">
                <button class="primary" id="importBtn" type="button">导入（覆盖当前存档）</button>
              </div>
            </div>
          </section>
          <section class="panel">
            <div class="panel-head"><div><small>DEBUG</small><h2>战斗调试</h2></div></div>
            <div class="panel-inner settings-body">
              <label class="check-row"><input type="checkbox" id="battleDebug"> <span>战斗调试开关（对齐 App 独立模式的调试口径）</span></label>
              <p class="settings-note">开关写进存档 settings.battleDebug；战斗层接入读取后可开放调试钩子。</p>
            </div>
          </section>
          <section class="panel">
            <div class="panel-head"><div><small>DANGER ZONE</small><h2>重置</h2></div></div>
            <div class="panel-inner settings-body">
              <div class="settings-row">
                <button class="secondary" id="resetDemo" type="button">重置为演示档（铺满进度）</button>
                <button class="secondary" id="resetNew" type="button">重置为全新档（只有起始队）</button>
              </div>
              <p class="settings-note">重置立即写盘并覆盖旧档；需要留档请先导出。</p>
            </div>
          </section>
        </div>
      </main>
      ${bottomNavHtml('', '存档双槽防损')}
      ${toastHtml()}`;
  }

  mount(ctx: ShellCtx): void {
    this.ctx = ctx;
    ($('#battleDebug') as HTMLInputElement).checked = ctx.save().settings.battleDebug;
    this.bind('#exportBtn', 'click', () => {
      ($('#saveText') as HTMLTextAreaElement).value = ctx.gateway.exportSaveJson();
      toast('存档已导出到文本框。');
    });
    this.bind('#copyBtn', 'click', () => {
      const text = ctx.gateway.exportSaveJson();
      void navigator.clipboard
        ?.writeText(text)
        .then(() => toast('已复制到剪贴板。'))
        .catch(() => toast('剪贴板不可用，请手动从文本框复制。'));
    });
    this.bind('#importBtn', 'click', () => void this.import());
    this.bind('#battleDebug', 'change', () => void this.toggleDebug());
    this.bind('#resetDemo', 'click', () => void this.reset(true));
    this.bind('#resetNew', 'click', () => void this.reset(false));
  }

  private async import(): Promise<void> {
    const text = ($('#saveText') as HTMLTextAreaElement).value.trim();
    if (!text) {
      toast('先导出或粘贴一份存档 JSON。');
      return;
    }
    try {
      await this.ctx.gateway.importSaveJson(text);
      toast('导入成功，已覆盖当前存档。');
      this.ctx.refresh();
    } catch (error: unknown) {
      toast('导入失败：' + (error instanceof Error ? error.message : String(error)));
    }
  }

  private async toggleDebug(): Promise<void> {
    const on = ($('#battleDebug') as HTMLInputElement).checked;
    await this.ctx.gateway.setBattleDebug(on);
    toast(on ? '战斗调试已开启。' : '战斗调试已关闭。');
  }

  private async reset(demo: boolean): Promise<void> {
    const label = demo ? '演示档' : '全新档';
    if (!confirm(`确定重置为${label}吗？当前存档将被覆盖。`)) return;
    const snapshot = demo ? await this.ctx.gateway.resetToDemo() : await this.ctx.gateway.resetToNewGame();
    toast(snapshot.warning ? `已重置：${snapshot.warning}` : `已重置为${label}。`);
    this.ctx.navigate('#map');
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
