import { mountIcons } from './chrome';

export interface AcquisitionItem {
  label: string;
  amount?: number;
  detail?: string;
  icon?: string;
  art?: string;
  status?: string;
}

const esc = (value: string): string => value.replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]!);

/** Post-commit receipt. Call only after the authoritative command succeeds. */
export function showAcquisitionDialog(title: string, items: readonly AcquisitionItem[], note?: string): void {
  if (!items.length) return;
  document.querySelector<HTMLDialogElement>('.acquisition-dialog')?.close();
  document.querySelector('.acquisition-dialog')?.remove();
  const opener = document.activeElement as HTMLElement | null;
  const dialog = document.createElement('dialog');
  dialog.className = 'acquisition-dialog';
  dialog.setAttribute('aria-labelledby', 'acquisition-title');
  dialog.innerHTML = `<header><span class="acquisition-check" data-icon="check" aria-hidden="true"></span><div><small>操作完成</small><h2 id="acquisition-title">${esc(title)}</h2></div><button type="button" class="acquisition-close" data-acquisition-close aria-label="关闭"><span data-icon="close"></span></button></header>
    <ul>${items.map(item => `<li><span class="acquisition-art">${item.art ?? `<span data-icon="${esc(item.icon ?? 'chest')}"></span>`}</span><span class="acquisition-copy"><b>${esc(item.label)}</b>${item.detail ? `<small>${esc(item.detail)}</small>` : ''}</span>${item.amount ? `<strong>×${item.amount.toLocaleString('zh-CN')}</strong>` : `<span class="acquisition-unlocked">${esc(item.status ?? '已获得')}</span>`}</li>`).join('')}</ul>
    ${note ? `<p>${esc(note)}</p>` : ''}<footer><button type="button" data-acquisition-close>确定</button></footer>`;
  const close = () => {
    dialog.close();
    dialog.remove();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  };
  dialog.addEventListener('click', event => {
    if ((event.target as HTMLElement).closest('[data-acquisition-close]')) close();
    else if (event.target === dialog) close();
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  document.body.append(dialog);
  mountIcons(dialog);
  dialog.showModal();
  dialog.querySelector<HTMLButtonElement>('footer button')?.focus();
}
