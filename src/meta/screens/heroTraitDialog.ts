import type { ShellCtx } from '../shell/screen';
import { heroTraitQuote } from '../systems/talents';
import { stoneName } from '../data/materials';
import { stoneMarkupForKey } from '../shell/materialArt';
import { escapeHtml as esc } from './troopCard';
import { isFailure } from '../gateway';
import { showAcquisitionDialog } from '../shell/acquisitionDialog';

export function heroTraitDialogBody(ctx: Pick<ShellCtx, 'save'>, classId: string, slot: number): string {
  const q = heroTraitQuote(ctx.save(), classId, slot);
  if (!q) return '<p>职业或特质不存在</p>';
  return `<header><div><small>${esc(q.def.name)} · 特质 ${slot}</small><h2 id="hero-trait-title">${esc(q.perk.nameZh)}</h2></div><button type="button" data-trait-close aria-label="关闭特质解锁">×</button></header>
    <p class="ht-effect">${esc(q.perk.descriptionZh)}</p>
    <h3>解锁所需</h3><div class="ht-materials">${q.rows.map(r => `<div class="ht-material${r.short ? ' ht-short' : ''}">
      ${stoneMarkupForKey(r.key)}<div><b>${esc(stoneName(r.key))}</b><span>需要 ${r.required} · 持有 ${r.owned.toLocaleString('zh-CN')}</span></div>
      <strong>${r.short ? `还差 ${r.short}` : '已备齐'}</strong></div>`).join('')}</div>
    <p class="ht-status" role="status" aria-live="polite">${esc(q.reason)}</p>
    <footer><button type="button" data-trait-close>返回</button><button type="button" data-trait-confirm ${q.canUnlock ? '' : 'disabled'}>${q.unlocked ? '已解锁' : '确认解锁'}</button></footer>`;
}

/** Native modal traps focus, escapes scaled/overflow-clipped screens and restores focus on close.
 * Opening, cancelling and reading the quote never submit a command. */
export function openHeroTraitDialog(ctx: ShellCtx, classId: string, slot: number, onUnlocked: () => void): () => void {
  const dialog = document.createElement('dialog');
  dialog.className = 'hero-trait-dialog';
  dialog.setAttribute('aria-labelledby', 'hero-trait-title');
  dialog.innerHTML = heroTraitDialogBody(ctx, classId, slot);
  const opener = document.activeElement as HTMLElement | null;
  let pending = false, disposed = false;
  function close() {
    if (disposed) return;
    disposed = true;
    dialog.close();
    dialog.remove();
    if (opener?.isConnected) opener.focus();
  }
  dialog.addEventListener('cancel', e => { e.preventDefault(); if (!pending) close(); });
  dialog.addEventListener('click', async e => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!target || pending) return;
    if (target.hasAttribute('data-trait-close')) { close(); return; }
    if (!target.hasAttribute('data-trait-confirm')) return;
    // Re-read authority immediately before sending; server validates again atomically.
    const q = heroTraitQuote(ctx.save(), classId, slot);
    if (!q?.canUnlock) { dialog.innerHTML = heroTraitDialogBody(ctx, classId, slot); return; }
    pending = true;
    dialog.querySelectorAll('button').forEach(b => b.disabled = true);
    dialog.querySelector('.ht-status')!.innerHTML = '<i class="ht-spinner" aria-hidden="true"></i>等待网络中…';
    try {
      const { result } = await ctx.gateway.unlockHeroTrait(slot, classId);
      if (disposed) return;
      ctx.refreshChrome();
      if (isFailure(result)) {
        dialog.innerHTML = heroTraitDialogBody(ctx, classId, slot);
        dialog.querySelector('.ht-status')!.textContent = result.message;
      } else {
        close();
        onUnlocked();
        showAcquisitionDialog('职业特质已解锁', [{ label: q.perk.nameZh, detail: q.def.name, icon: 'sparkles', status: '已解锁' }]);
      }
    } catch {
      if (!disposed) {
        dialog.innerHTML = heroTraitDialogBody(ctx, classId, slot);
        dialog.querySelector('.ht-status')!.textContent = '网络暂未响应，请稍后重试';
      }
    } finally { pending = false; }
  });
  document.body.append(dialog);
  dialog.showModal();
  dialog.querySelector<HTMLButtonElement>('[data-trait-close]')?.focus();
  return close;
}
