import type { Screen, ShellCtx } from '../shell/screen';
import { DEFAULT_CHARACTER_PORTRAITS, LOCAL_CHARACTER_NAME, isCharacterPortrait, type CharacterGender } from '../state/character';
import { compressPortrait, loadPortraitImage } from '../shell/portraitUpload';

const genders = [['male', '男'], ['female', '女'], ['unknown', '未知']] as const;
export class CharacterScreen implements Screen {
  private life = 0;
  html(ctx: ShellCtx): string {
    return `<main class="character-screen" aria-labelledby="characterTitle">
      <header class="character-header"><a href="${ctx.gateway.backend === 'remote' ? '/' : '/cover.html'}" aria-label="返回封面">破晓之誓 <span>CHRONICLES OF DAWN</span></a><span>旅者档案 / 初次登入</span></header>
      <div class="character-layout">
        <section class="character-art" aria-label="角色立绘预览">
          <img id="characterPreview" src="${DEFAULT_CHARACTER_PORTRAITS.male}" alt="男默认立绘" referrerpolicy="no-referrer">
          <div class="character-art-copy"><span>THE JOURNEY BEGINS</span><h2>世界，等待你的到来。</h2><p>以你的模样，书写下一段传奇。</p></div>
          <span class="character-art-index">01 — ORIGIN</span>
        </section>
        <section class="character-panel">
          <p class="character-eyebrow">YOUR STORY · YOUR IDENTITY</p><h1 id="characterTitle">建立你的角色</h1>
          <p class="character-intro">启程之前，留下属于你的旅者档案。</p>
          <form id="characterForm" novalidate>
            <label class="character-label" for="characterName">角色 ID <span>DISCORD 同步 · 固定</span></label>
            <input id="characterName" readonly value="正在读取登录身份…">
            <fieldset class="character-genders"><legend>性别</legend>
              <div>${genders.map(([id, label]) => `<label><input type="radio" name="characterGender" value="${id}" ${id === 'male' ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>
            </fieldset>
            <fieldset class="character-portraits"><legend>角色立绘</legend>
              <div class="character-defaults">${genders.map(([id, label]) => `<button type="button" data-portrait="${id}" aria-label="${label}默认立绘" aria-pressed="${id === 'male'}"><img src="${DEFAULT_CHARACTER_PORTRAITS[id]}" alt="" referrerpolicy="no-referrer"><span>${label} · 默认</span></button>`).join('')}</div>
              <div class="character-upload-row"><label class="character-upload" for="characterFile">上传本地立绘<input id="characterFile" type="file" accept="image/jpeg,image/png,image/webp"></label><span>JPG / PNG / WebP · ≤ 10 MB<br>自动压缩，保留完整画幅</span></div>
              <label class="character-url-label" for="characterUrl">或使用网络图片链接</label>
              <div class="character-url-row"><input id="characterUrl" type="url" placeholder="https://… / portrait.webp" autocomplete="off" spellcheck="false"><button id="applyCharacterUrl" type="button">预览链接</button></div>
            </fieldset>
            <p id="characterStatus" role="status" aria-live="polite">已选择男默认立绘</p>
            <p id="characterError" role="alert" hidden></p>
            <button id="retryCharacterIdentity" type="button" hidden>重新读取登录身份</button>
            <button id="createCharacter" class="character-submit" type="submit" disabled>确认角色 · 开始旅程 <span aria-hidden="true">→</span></button>
            <p class="character-footnote">角色信息确认后保存，随后进入新手指引。</p>
          </form>
        </section>
      </div>
      <footer class="character-footer">每一段传奇，都始于一个名字。<span>PLAYER ARCHIVE · 001</span></footer>
    </main>`;
  }
  mount(ctx: ShellCtx, root: HTMLElement): void {
    const life = ++this.life;
    const get = <T extends HTMLElement>(id: string): T => root.querySelector<T>('#' + id)!;
    const submit = get<HTMLButtonElement>('createCharacter');
    const preview = get<HTMLImageElement>('characterPreview');
    const status = get('characterStatus');
    const error = get('characterError');
    const form = get<HTMLFormElement>('characterForm');
    let gender: CharacterGender = 'male';
    let portrait = 'default:male';
    let identityReady = false;
    let saving = false;
    let loading = false;
    let operation = 0;
    const alive = (): boolean => this.life === life;
    const update = (): void => { submit.disabled = !identityReady || saving || loading; };
    const report = (message = ''): void => { error.textContent = message; error.hidden = !message; };
    const select = (value: string, label: string): void => {
      portrait = value;
      preview.src = value.startsWith('default:') ? DEFAULT_CHARACTER_PORTRAITS[value.slice(8) as CharacterGender] : value;
      preview.alt = label;
      status.textContent = label;
      root.querySelectorAll<HTMLButtonElement>('[data-portrait]').forEach(b => b.setAttribute('aria-pressed', String(value === 'default:' + b.dataset.portrait)));
      report(); update();
    };
    const readIdentity = async (): Promise<void> => {
      get('retryCharacterIdentity').hidden = true;
      try {
        let name = ctx.loginName || LOCAL_CHARACTER_NAME;
        if (ctx.gateway.backend === 'remote' && !ctx.loginName) {
          const response = await fetch('/auth/me', { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(15_000) });
          if (response.status === 401) { location.replace('/'); return; }
          if (!response.ok) throw new Error('登录身份读取失败，请重试');
          const me = await response.json() as { username?: string };
          if (!me.username) throw new Error('登录身份已过期，请重新登录');
          name = me.username;
        }
        if (!alive()) return;
        get<HTMLInputElement>('characterName').value = name;
        identityReady = true; report(); update();
      } catch (e) {
        if (!alive()) return;
        report(e instanceof Error ? e.message : '登录身份读取失败，请重试');
        get('retryCharacterIdentity').hidden = false;
      }
    };
    get('retryCharacterIdentity').onclick = () => void readIdentity();
    void readIdentity();
    root.querySelectorAll<HTMLInputElement>('[name="characterGender"]').forEach(input => {
      input.onchange = () => {
        gender = input.value as CharacterGender;
        if (portrait.startsWith('default:')) {
          ++operation; loading = false;
          select('default:' + gender, `已选择${genders.find(([id]) => id === gender)![1]}默认立绘`);
        }
      };
    });
    root.querySelectorAll<HTMLButtonElement>('[data-portrait]').forEach(button => {
      button.onclick = () => { ++operation; loading = false; select('default:' + button.dataset.portrait, '已选择' + button.getAttribute('aria-label')); };
    });
    const process = async (task: () => Promise<string>, label: string): Promise<void> => {
      const token = ++operation;
      loading = true; update(); report(); status.textContent = '正在处理立绘…';
      try {
        const value = await task();
        if (!alive() || token !== operation) return;
        select(value, label);
      } catch (e) {
        if (!alive() || token !== operation) return;
        report(e instanceof Error ? e.message : '立绘处理失败，请重试');
        status.textContent = '仍保留当前预览的立绘';
      } finally {
        if (alive() && token === operation) { loading = false; update(); }
      }
    };
    get<HTMLInputElement>('characterFile').onchange = () => {
      const input = get<HTMLInputElement>('characterFile');
      const file = input.files?.[0];
      if (file) void process(() => compressPortrait(file), '已应用本地立绘 · 已自动压缩');
      input.value = '';
    };
    get('applyCharacterUrl').onclick = () => {
      const url = get<HTMLInputElement>('characterUrl').value.trim();
      void process(async () => {
        if (!url.startsWith('https://') || !isCharacterPortrait(url)) throw new Error('请输入有效的 HTTPS 图片直链');
        await loadPortraitImage(url);
        return url;
      }, '已应用网络立绘');
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      saving = true; update(); report();
      // Freeze choices while the authoritative command is in flight.
      const controls = [...form.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button')];
      controls.forEach(control => { control.disabled = true; });
      submit.textContent = '正在保存角色…';
      void ctx.gateway.createCharacter({ gender, portrait }).then(async ({ result }) => {
        if (!alive()) return;
        if (!result.ok) {
          if (result.code === 'ALREADY_UNLOCKED') { await ctx.gateway.sync(); ctx.navigate('#map'); return; }
          throw new Error(result.message);
        }
        ctx.navigate('#map');
      }).catch((e: unknown) => {
        if (alive()) report(e instanceof Error ? e.message : '保存失败，请重试');
      }).finally(() => {
        if (!alive()) return;
        saving = false; controls.forEach(control => { control.disabled = false; });
        submit.textContent = '确认角色 · 开始旅程 →'; update();
      });
    };
  }
  dispose(): void { ++this.life; }
}
