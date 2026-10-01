import { isFailure } from '../gateway';
import type { MetaFailure } from '../types';
import type { Screen, ShellCtx } from '../shell/screen';
import { CLASSES, classById, classUnlockText, type ClassDef } from '../data/classes';
import { CLASS_ICON } from '../data/classIcons';
import { classLevelOf, classWinsOf } from '../systems/hero';
import { talentPicksOf } from '../systems/talents';
import { TALENT_DYNAMIC_CODES } from '../data/talentDefs';
import { traitBadgeSvg } from '../../render/traitBadges';
import { topbarHtml, toastHtml, toast, icon } from '../shell/chrome';
import { escapeHtml as esc } from './troopCard';
import { openHeroTraitDialog } from './heroTraitDialog';
import { classDirectory, type ClassDirectoryState, type ClassFilter } from './classDirectory';
import { talentTreeMarkup } from './talentTreeView';

// One directory state across route transitions, including return from a class preview.
const directoryState: ClassDirectoryState = { query: '', filter: 'all', tree: '', page: 0 };

export function classDetailHtml(ctx: Pick<ShellCtx, 'save'>, c: ClassDef): string {
  const save = ctx.save();
  const unlocked = save.hero.unlockedClasses.includes(c.id);
  const equipped = save.hero.classId === c.id;
  const level = classLevelOf(save, c.id);
  const picks = talentPicksOf(save, c.id);
  const traits = save.hero.classTraits[c.id] ?? [false, false, false];
  return `<header class="hc-detail-head" data-class-detail="${esc(c.id)}">
      <div class="hc-detail-mark">${icon(CLASS_ICON[c.id] ?? 'helmet')}</div>
      <div class="hc-detail-title"><small>${esc(c.kingdom)} / ${esc(c.nameEn)}</small><h1>${esc(c.name)}</h1>
      <p>${unlocked ? `冠军 Lv.${level} · ${classWinsOf(save, c.id)} 胜` : esc(classUnlockText(c.id))}</p></div>
      <button type="button" class="hc-button hc-equip" data-equip="${esc(c.id)}" ${equipped || !unlocked ? 'disabled' : ''}>${equipped ? '\u5f53\u524d\u804c\u4e1a' : unlocked ? '\u88c5\u5907\u804c\u4e1a' : '\u5c1a\u672a\u89e3\u9501'}</button>
    </header>
    <div class="hc-detail-tabs" role="tablist" aria-label="\u804c\u4e1a\u8be6\u60c5">
      <button type="button" role="tab" data-tab="tree" aria-selected="true">\u5929\u8d4b\u6811 <span>${picks.filter(Boolean).length}/7</span></button>
      <button type="button" role="tab" data-tab="traits" aria-selected="false">\u804c\u4e1a\u7279\u8d28 <span>${traits.filter(Boolean).length}/3</span></button>
    </div>
    <section class="hc-tree-panel" role="tabpanel" aria-label="\u5929\u8d4b\u6811">
      <div class="vault-head"><div class="vault-mark"><span data-icon="swirl"></span></div><div class="vault-heading"><h2>${esc(c.name)} \u00b7 \u5929\u8d4b\u6811</h2><p>\u6bcf\u6863\u4e09\u6811\u9009\u4e00 \u00b7 \u968f\u65f6\u514d\u8d39\u6539\u914d</p></div><div class="vault-count">${picks.filter(Boolean).length} / 7 \u5df2\u9009</div></div>
      <div class="tree-swipe-tip" aria-hidden="true">← 左右滑动查看三系天赋 →</div>
      <div class="tree-body" role="region" tabindex="0" aria-label="天赋树，左右滑动查看三系天赋"><div class="talent-tree" id="talentTree">${talentTreeMarkup(save, c, unlocked)}</div></div>
    </section>
    <section class="hc-traits" role="tabpanel" aria-label="\u804c\u4e1a\u7279\u8d28" hidden>
      ${c.perks.map((p, i) => {
        const implemented = p.implemented || TALENT_DYNAMIC_CODES.has(p.code);
        return `<div class="hc-trait ${traits[i] ? 'is-unlocked' : ''}"><span class="hc-trait-badge">${traitBadgeSvg(p.code) || icon('sparkles')}</span><div><small>\u7279\u8d28 ${i + 1}</small><h2>${esc(p.nameZh)}</h2><p>${esc(p.descriptionZh)}</p></div><button class="hc-button" data-unlock="${i + 1}" ${!implemented || traits[i] || !unlocked ? 'disabled' : ''}>${!implemented ? '\u6682\u672a\u5f00\u653e' : traits[i] ? '\u5df2\u89e3\u9501' : unlocked ? '\u89e3\u9501' : '\u5c1a\u672a\u89e3\u9501'}</button></div>`;
      }).join('')}
    </section>`;
}

export class ClassesScreen implements Screen {
  private ctx!: ShellCtx;
  private root!: HTMLElement;
  private classId = '';
  private state = directoryState;
  private detailTab: 'tree' | 'traits' = 'tree';
  private abort?: AbortController;
  private closeDialog?: () => void;
  private pending = false;
  private generation = 0;

  html(ctx: ShellCtx, param?: string): string {
    this.classId = param ?? '';
    const c = this.classId ? classById(this.classId) : undefined;
    const body = c ? classDetailHtml(ctx, c) : this.classId
      ? '<div class="hc-empty">该职业不存在<a href="#classes">返回职业目录</a></div>'
      : this.directoryShell(ctx);
    return `${topbarHtml()}<main class="screen classes-screen"><div class="hc-scroll"><div class="hc-content"><nav class="hc-breadcrumb"><a href="${this.classId ? '#classes' : '#hero'}">${icon('arrow')}<span>${this.classId ? '职业目录' : '主角'}</span></a><span>职业圣殿</span></nav>${body}</div></div><div class="hc-message" role="status" aria-live="polite"></div></main>${toastHtml()}`;
  }

  private directoryShell(ctx: ShellCtx): string {
    const trees = [...new Map(CLASSES.flatMap(c => c.trees.map(t => [t.name, t.nameZh] as const))).entries()];
    return `<header class="hc-heading"><div><small>HERO CLASSES</small><h1>职业圣殿</h1></div><span>${ctx.save().hero.unlockedClasses.length} / ${CLASSES.length} 已解锁</span></header>
      <div class="hc-tools"><label class="hc-search">${icon('search')}<input id="class-search" type="search" value="${esc(this.state.query)}" placeholder="搜索职业、王国或天赋" aria-label="搜索职业、王国或天赋" maxlength="100"></label>
      <label class="hc-tree-filter"><span>天赋系</span><select id="class-tree-filter" aria-label="筛选天赋系"><option value="">全部天赋系</option>${trees.map(([name, zh]) => `<option value="${esc(name)}" ${this.state.tree === name ? 'selected' : ''}>${esc(zh)}</option>`).join('')}</select></label></div>
      <div class="hc-filter-row"><div class="hc-filters" role="group" aria-label="职业解锁状态">${([['all', '全部'], ['unlocked', '已解锁'], ['locked', '未解锁']] as const).map(([id, text]) => `<button type="button" data-filter="${id}" aria-pressed="${this.state.filter === id}">${text}</button>`).join('')}</div><span id="class-result-count" role="status"></span></div>
      <div id="class-directory" class="hc-directory"></div><nav class="hc-pagination" aria-label="职业分页"><button class="hc-button" data-page="-1">上一页</button><span id="class-page"></span><button class="hc-button" data-page="1">下一页</button></nav>`;
  }

  mount(ctx: ShellCtx, root: HTMLElement): void {
    this.ctx = ctx; this.root = root; this.pending = false;
    const generation = ++this.generation;
    this.abort?.abort(); this.abort = new AbortController();
    const options = { signal: this.abort.signal };
    if (!this.classId) this.renderDirectory();
    root.querySelector<HTMLInputElement>('#class-search')?.addEventListener('input', e => {
      this.state.query = (e.target as HTMLInputElement).value; this.state.page = 0; this.renderDirectory();
    }, options);
    root.querySelector<HTMLSelectElement>('#class-tree-filter')?.addEventListener('change', e => {
      this.state.tree = (e.target as HTMLSelectElement).value; this.state.page = 0; this.renderDirectory();
    }, options);
    root.addEventListener('click', e => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
      if (!b || b.disabled || this.pending) return;
      if (b.dataset.tab) { this.detailTab = b.dataset.tab as 'tree' | 'traits'; this.showTab(); }
      if (b.dataset.filter) { this.state.filter = b.dataset.filter as ClassFilter; this.state.page = 0; this.renderDirectory(); }
      if (b.dataset.page) { this.state.page += Number(b.dataset.page); this.renderDirectory(); root.querySelector('.hc-tools')?.scrollIntoView({ block: 'start' }); }
      if (b.dataset.unlock) {
        this.closeDialog?.();
        this.closeDialog = openHeroTraitDialog(ctx, this.classId, Number(b.dataset.unlock), () => {
          if (this.generation === generation) this.refreshDetail();
        });
      }
      if (b.dataset.equip) void this.action(() => ctx.gateway.equipHeroClass(b.dataset.equip!), '职业已装备');
    }, options);
    root.addEventListener('click', e => {
      if (!this.classId || this.pending) return;
      const cancel = (e.target as HTMLElement).closest<HTMLButtonElement>('#talentTree [data-cancel]');
      if (cancel) { e.stopPropagation(); void this.action(() => ctx.gateway.clearHeroTalent(this.classId, Number(cancel.dataset.tier)), '\u5df2\u53d6\u6d88\u8be5\u6863\u5929\u8d4b'); return; }
      const cell = (e.target as HTMLElement).closest<HTMLElement>('#talentTree .talent-cell');
      if (!cell || cell.classList.contains('picked')) return;
      if (!cell.classList.contains('pickable')) { toast('\u8be5\u6863\u5929\u8d4b\u5c1a\u672a\u89e3\u9501\u6216\u5c1a\u672a\u5f00\u653e'); return; }
      void this.action(() => ctx.gateway.pickHeroTalent(this.classId, Number(cell.dataset.tier), cell.dataset.code!), '\u5929\u8d4b\u5df2\u751f\u6548');
    }, options);
  }

  private showTab(): void {
    this.root.querySelector<HTMLElement>('.hc-tree-panel')?.toggleAttribute('hidden', this.detailTab !== 'tree');
    this.root.querySelector<HTMLElement>('.hc-traits')?.toggleAttribute('hidden', this.detailTab !== 'traits');
    this.root.querySelectorAll<HTMLElement>('[data-tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.tab === this.detailTab)));
  }

  private renderDirectory(): void {
    const result = classDirectory(this.ctx.save(), this.state);
    this.state.page = result.page;
    const save = this.ctx.save();
    this.root.querySelector('#class-directory')!.innerHTML = result.entries.length ? result.entries.map(c => {
      const unlocked = save.hero.unlockedClasses.includes(c.id), equipped = save.hero.classId === c.id;
      return `<a class="hc-class-row ${equipped ? 'is-equipped' : ''}" href="#classes/${esc(c.id)}"><span class="hc-row-icon">${icon(CLASS_ICON[c.id] ?? 'helmet')}</span><span class="hc-row-name">${esc(c.name)}<small>${esc(c.nameEn)}</small></span><span class="hc-row-kingdom">${esc(c.kingdom)}</span><span class="hc-row-status">${equipped ? '\u5f53\u524d' : unlocked ? `\u51a0\u519b Lv.${classLevelOf(save, c.id)}` : '\u672a\u89e3\u9501'}</span><span class="hc-row-arrow" aria-hidden="true">&#8250;</span></a>`;
    }).join('') : '<div class="hc-empty">未找到匹配职业，试试其他名称或筛选条件。</div>';
    this.root.querySelector('#class-result-count')!.textContent = `${result.total} 个职业`;
    this.root.querySelector('#class-page')!.textContent = `${result.page + 1} / ${result.pages}`;
    this.root.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.filter === this.state.filter)));
    this.root.querySelector<HTMLButtonElement>('[data-page="-1"]')!.disabled = result.page === 0;
    this.root.querySelector<HTMLButtonElement>('[data-page="1"]')!.disabled = result.page + 1 === result.pages;
  }

  private refreshDetail(scroll = this.root.querySelector('.hc-scroll')!.scrollTop): void {
    const c = classById(this.classId);
    if (!c) return;
    const content = this.root.querySelector('.hc-content')!;
    content.querySelectorAll(':scope > :not(.hc-breadcrumb)').forEach(e => e.remove());
    content.insertAdjacentHTML('beforeend', classDetailHtml(this.ctx, c));
    this.root.querySelector('.hc-scroll')!.scrollTop = scroll;
    this.showTab();
  }

  private async action(run: () => Promise<{ result: { ok: true } | string | MetaFailure }>, success: string): Promise<void> {
    if (this.pending) return;
    this.pending = true;
    const generation = this.generation;
    const buttons = [...this.root.querySelectorAll<HTMLButtonElement>('.classes-screen button')].map(b => [b, b.disabled] as const);
    buttons.forEach(([b]) => b.disabled = true);
    const message = this.root.querySelector<HTMLElement>('.hc-message')!;
    message.innerHTML = '<i class="ht-spinner" aria-hidden="true"></i>等待网络中…';
    const scroll = this.root.querySelector('.hc-scroll')!.scrollTop;
    try {
      const { result } = await run();
      if (generation !== this.generation) return;
      if (isFailure(result)) { toast(result.message); return; }
      this.ctx.refreshChrome();
      this.refreshDetail(scroll);
      toast(success);
    } catch { if (generation === this.generation) toast('网络暂未响应，请稍后重试'); }
    finally {
      if (generation === this.generation) { this.pending = false; message.textContent = ''; buttons.forEach(([b, disabled]) => { if (b.isConnected) b.disabled = disabled; }); }
    }
  }

  dispose(): void { this.generation++; this.abort?.abort(); this.closeDialog?.(); }
}
