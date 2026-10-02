import type { ShellCtx } from '../shell/screen';
import { characterPortrait, DEFAULT_CHARACTER_PORTRAITS, isCharacterPortrait, type CharacterGender } from '../state/character';
import { compressPortrait, loadPortraitImage } from '../shell/portraitUpload';
import { isFailure } from '../gateway';
import { mountIcons } from '../shell/chrome';

const defaults: readonly [CharacterGender, string][] = [['male', '男'], ['female', '女'], ['unknown', '未知']];

export function openHeroPortraitDialog(ctx: ShellCtx, onSaved: () => void): () => void {
  const profile = ctx.save().character;
  if (!profile) return () => undefined;
  const original = profile.portrait;
  const dialog = document.createElement('dialog');
  dialog.className = 'hero-portrait-dialog';
  dialog.setAttribute('aria-labelledby', 'heroPortraitTitle');
  dialog.innerHTML = `<header><div><small>旅者档案</small><h2 id="heroPortraitTitle">更改主角立绘</h2></div><button type="button" data-portrait-close aria-label="关闭"><span data-icon="close"></span></button></header>
    <div class="hero-portrait-body"><div class="hero-portrait-preview"><img alt="立绘预览" referrerpolicy="no-referrer"></div>
      <div class="hero-portrait-controls"><h3>默认形象</h3><div class="hero-portrait-defaults">${defaults.map(([id, label]) => `<button type="button" data-default="${id}" aria-label="${label}默认立绘" aria-pressed="false"><img src="${DEFAULT_CHARACTER_PORTRAITS[id]}" alt=""><span>${label}</span></button>`).join('')}</div>
        <label class="hero-portrait-upload">上传本地立绘<input type="file" accept="image/jpeg,image/png,image/webp"></label>
        <label class="hero-portrait-url-label" for="heroPortraitUrl">网络图片链接</label>
        <div class="hero-portrait-url"><input id="heroPortraitUrl" type="url" placeholder="https://…" autocomplete="off" spellcheck="false"><button type="button" data-portrait-url>预览</button></div>
        <p class="hero-portrait-status" role="status" aria-live="polite"></p>
      </div></div>
    <footer><button type="button" data-portrait-close>取消</button><button type="button" data-portrait-save>保存立绘</button></footer>`;

  const opener = document.activeElement as HTMLElement | null;
  const preview = dialog.querySelector<HTMLImageElement>('.hero-portrait-preview img')!;
  const status = dialog.querySelector<HTMLElement>('.hero-portrait-status')!;
  const save = dialog.querySelector<HTMLButtonElement>('[data-portrait-save]')!;
  let selected = original;
  let operation = 0;
  let busy = false;
  let saving = false;
  let disposed = false;

  const update = (message = ''): void => {
    preview.src = characterPortrait({ ...profile, portrait: selected });
    dialog.querySelectorAll<HTMLButtonElement>('[data-default]').forEach(button => {
      button.setAttribute('aria-pressed', String(selected === `default:${button.dataset.default}`));
    });
    status.textContent = message;
    status.classList.remove('is-error');
    save.disabled = busy || selected === original;
  };
  const error = (message: string): void => {
    status.textContent = message;
    status.classList.add('is-error');
  };
  const close = (): void => {
    if (disposed) return;
    disposed = true;
    operation++;
    dialog.close();
    dialog.remove();
    if (opener?.isConnected) opener.focus();
  };
  const process = async (task: () => Promise<string>, message: string): Promise<void> => {
    const token = ++operation;
    busy = true;
    save.disabled = true;
    status.textContent = '正在处理立绘…';
    status.classList.remove('is-error');
    try {
      const value = await task();
      if (disposed || token !== operation) return;
      selected = value;
      update(message);
    } catch (cause) {
      if (!disposed && token === operation) error(cause instanceof Error ? cause.message : '立绘处理失败，请重试');
    } finally {
      if (!disposed && token === operation) { busy = false; save.disabled = selected === original; }
    }
  };

  dialog.addEventListener('cancel', event => { event.preventDefault(); if (!busy) close(); });
  dialog.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button) return;
    if (button.hasAttribute('data-portrait-close')) { if (!busy) close(); return; }
    if (button.dataset.default) {
      if (saving) return;
      operation++;
      busy = false;
      selected = `default:${button.dataset.default}`;
      update();
      return;
    }
    if (button.hasAttribute('data-portrait-url')) {
      if (saving) return;
      const url = dialog.querySelector<HTMLInputElement>('#heroPortraitUrl')!.value.trim();
      void process(async () => {
        if (!url.startsWith('https://') || !isCharacterPortrait(url)) throw new Error('请输入有效的 HTTPS 图片直链');
        await loadPortraitImage(url);
        return url;
      }, '网络立绘已准备好');
      return;
    }
    if (button.hasAttribute('data-portrait-save') && !busy && selected !== original) {
      saving = true;
      busy = true;
      save.disabled = true;
      save.textContent = '保存中…';
      const controls = [...dialog.querySelectorAll<HTMLInputElement | HTMLButtonElement>('button, input')];
      controls.forEach(control => { control.disabled = true; });
      void ctx.gateway.setCharacterPortrait(selected).then(({ result }) => {
        if (disposed) return;
        if (isFailure(result)) { error(result.message); return; }
        onSaved();
        close();
      }).catch(() => { if (!disposed) error('保存失败，请重试'); }).finally(() => {
        if (!disposed) {
          saving = false;
          busy = false;
          controls.forEach(control => { control.disabled = false; });
          save.textContent = '保存立绘';
          save.disabled = selected === original;
        }
      });
    }
  });
  dialog.querySelector<HTMLInputElement>('input[type=file]')!.addEventListener('change', event => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file && !saving) void process(() => compressPortrait(file), '本地立绘已压缩');
    input.value = '';
  });
  document.body.append(dialog);
  mountIcons(dialog);
  update();
  dialog.showModal();
  dialog.querySelector<HTMLButtonElement>('[data-portrait-close]')?.focus();
  return close;
}
