import { isFailure } from '../gateway';
import { INGOT_NAMES, stoneName } from '../data/materials';
import type { MailItem } from '../state/schema';
import { bottomNavHtml, toast, toastHtml, topbarHtml } from '../shell/chrome';
import type { Screen, ShellCtx } from '../shell/screen';

const fmt = (value: number): string => value.toLocaleString('en-US');
const esc = (value: string): string => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

function attachmentRows(mail: MailItem): string {
  const names: Record<string, string> = { gold: '黄金', souls: '灵魂', gems: '宝石', goldKeys: '金钥匙', glory: '荣耀', gloryKeys: '荣耀钥匙', trophies: '奖杯' };
  const rows = Object.entries(mail.currencies).map(([key, value]) => [names[key] ?? key, value] as const);
  rows.push(...Object.entries(mail.materials.ingots ?? {}).map(([key, value]) => [INGOT_NAMES[key as keyof typeof INGOT_NAMES] ?? key, value] as const));
  rows.push(...Object.entries(mail.materials.traitstones ?? {}).map(([key, value]) => [stoneName(key), value] as const));
  if (mail.materials.forgeScrolls) rows.push(['熔铸符卷', mail.materials.forgeScrolls]);
  if (mail.materials.treasureMaps) rows.push(['藏宝图', mail.materials.treasureMaps]);
  if (mail.classXp) rows.push(['职业经验', mail.classXp]);
  return rows.filter(([, amount]) => amount).map(([name, amount]) => `<li><span>${esc(name)}</span><b>×${fmt(amount!)}</b></li>`).join('');
}

export class MailScreen implements Screen {
  private selected: string | null = null;
  private busy = false;

  html(ctx: ShellCtx): string {
    const items = [...ctx.save().mailbox.items].sort((a, b) => b.sentAt - a.sentAt || a.id.localeCompare(b.id));
    if (!items.some(item => item.id === this.selected)) this.selected = items.find(item => item.claimedAt === null)?.id ?? items[0]?.id ?? null;
    const selected = items.find(item => item.id === this.selected);
    const pending = items.filter(item => item.claimedAt === null).length;
    return `${topbarHtml()}<main class="screen mailbox-screen">
      <header class="mailbox-head"><div><small>收件箱</small><h1>邮件</h1></div><div class="mailbox-actions"><span>${pending ? `${pending} 封待领取` : `${items.length} 封邮件`}</span><button type="button" data-mail-all ${pending ? '' : 'disabled'}>领取全部附件</button></div></header>
      <div class="mailbox-layout"><nav class="mailbox-list" aria-label="邮件列表">${items.length ? items.map(item => `<button type="button" class="mailbox-row${item.id === this.selected ? ' active' : ''}${item.readAt === null ? ' unread' : ''}" data-mail-id="${esc(item.id)}" aria-current="${item.id === this.selected ? 'true' : 'false'}"><span class="mailbox-row-mark" aria-hidden="true"></span><span><b>${esc(item.title)}</b><small>${item.claimedAt === null ? '附件待领取' : '已领取'} · ${new Date(item.sentAt).toLocaleDateString('zh-CN')}</small></span></button>`).join('') : '<p class="mailbox-empty">暂无邮件</p>'}</nav>
      <section class="mailbox-detail" aria-label="邮件内容">${selected ? `<div class="mailbox-detail-top"><small>${new Date(selected.sentAt).toLocaleString('zh-CN')}</small><h2>${esc(selected.title)}</h2></div><p>${esc(selected.body)}</p><div class="mailbox-attachments"><h3>附件</h3><ul>${attachmentRows(selected)}</ul></div><button type="button" data-mail-claim="${esc(selected.id)}" ${selected.claimedAt === null ? '' : 'disabled'}>${selected.claimedAt === null ? '领取附件' : '已领取'}</button>` : '<p class="mailbox-empty">选择一封邮件查看内容</p>'}</section></div>
    </main>${bottomNavHtml('')}${toastHtml()}`;
  }

  mount(ctx: ShellCtx, root: HTMLElement): void {
    root.querySelectorAll<HTMLButtonElement>('[data-mail-id]').forEach(button => {
      button.onclick = async () => {
        this.selected = button.dataset.mailId!;
        const item = ctx.save().mailbox.items.find(mail => mail.id === this.selected);
        if (item?.readAt === null) {
          try { await ctx.gateway.readMail(this.selected); } catch { toast('邮件读取失败'); }
        }
        ctx.refresh();
      };
    });
    const claim = async (all: boolean): Promise<void> => {
      if (this.busy) return;
      this.busy = true;
      const buttons = [...root.querySelectorAll<HTMLButtonElement>('.mailbox-screen button')].map(button => [button, button.disabled] as const);
      buttons.forEach(([button]) => button.disabled = true);
      try {
        const { result } = all ? await ctx.gateway.claimAllMail() : await ctx.gateway.claimMail(this.selected!);
        if (isFailure(result)) toast(result.message);
        else { toast(all ? `已领取 ${result && 'count' in result ? result.count : 0} 封邮件附件` : '附件已领取'); ctx.refresh(); }
      } catch { toast('领取失败，请重试'); }
      finally { this.busy = false; buttons.forEach(([button, disabled]) => button.disabled = disabled); }
    };
    root.querySelector<HTMLButtonElement>('[data-mail-claim]')?.addEventListener('click', () => void claim(false));
    root.querySelector<HTMLButtonElement>('[data-mail-all]')?.addEventListener('click', () => void claim(true));
  }
}
