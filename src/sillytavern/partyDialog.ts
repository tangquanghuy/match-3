import type { CombatantSnapshot } from '../session/contract';
import type { StHostService } from './hostService';
import type { HostSnapshot } from './hostAdapter';
import type { PartyPreparationSave, StSave } from './save';
import { chatKey } from './save';
import { stableJson } from './json';
import {
  prepareCurrentParty, findPartyAbility, HERO_MEMBER_REF, STARTER_WEAPON,
} from './partyPreparation';
import type { PartyAbilityChoice } from './partyPreparation';
import type { PartyCandidate, PartyPreparation } from './partyPreparation';
import weapons from '../data/weapons.json';
import { normalizeCombatText } from '../data/combatText';
import { icon, gemSvg, mountIcons } from '../meta/shell/chrome';
import shellStyles from '../meta/shell/styles/style.css?inline';
import screenStyles from '../meta/shell/styles/screens.css?inline';
import { teamWorkspaceHtml, teamInspectHtml } from '../meta/screens/teamWorkspace';
import { TeamDrag } from '../meta/screens/teamDrag';
import { escapeHtml } from '../meta/screens/troopCard';
import { renderSpell } from '../meta/shell/spellText';
import { bindTermTips } from '../meta/shell/termTip';
import { abilityDisplayText } from './abilityDisplay';
import teamStyles from '../meta/screens/teamScreen.css?inline';
import weaponsStyles from '../meta/screens/weaponsScreen.css?inline';
import { openWeaponPicker } from './weaponPicker';
import type { WeaponShopAccess } from './weaponPicker';
import { universalCurrency, weaponOwned } from './weaponShop';
import { currencyGuardActive, sealedCurrency } from './currencySeal';
import partyStyles from './partyDialog.css?inline';
import { localPortrait, presetPortraitResolver } from './actorPortraits';

// The shadow tree lives in the ST document; asset URLs must keep the game's origin.
const assetBase = new URL(import.meta.env.BASE_URL, import.meta.url);
const nativeStyles = `${shellStyles}\n${screenStyles}\n${teamStyles}\n${weaponsStyles}`.replace(/:root\b/g, ':host').replaceAll('#stage.team-responsive', ':host(#stage.team-responsive)')
  .replace(/url\(\s*(['"]?)([^'"\s)]+)\1\s*\)/g, (value, _quote: string, url: string) =>
    /^(?:data:|blob:|#)/i.test(url) ? value : `url("${new URL(url, assetBase).href}")`);

export interface PreparePartyDialogOptions {
  hostWindow: Window;
  service: Pick<StHostService, 'current' | 'create' | 'initializeCompanions' | 'repository' | 'purchaseWeapon'>;
  mode: 'story' | 'replay' | 'management';
  mount?: HTMLElement;
  signal?: AbortSignal;
  enemies?: readonly CombatantSnapshot[];
}
export interface PreparedDialogParty { party: CombatantSnapshot[]; source: HostSnapshot }

const COLOR_NAMES: Record<string, string> = {
  Red: '红', Blue: '蓝', Green: '绿', Yellow: '黄', Purple: '紫', Brown: '棕',
};
// Keep catalogue identities in control values; the generated mechanics fingerprint is not a player label.
const abilityName = (name: string): string => normalizeCombatText(name).replace(/\s*(?:〔[a-z0-9]{7}〕|\[[a-z0-9]{7}\])$/i, '');
const colorNames = (colors: readonly string[]): string => colors.map(c => COLOR_NAMES[c] ?? c).join(' / ');
const weaponNames = new Map(weapons.map(w => [`gw_${w.referenceName}`, `${w.name} · ${colorNames(w.manaColors)} · 法力 ${w.manaCost}`]));
const sourceStamp = (snapshot: HostSnapshot): string => stableJson({
  chat: snapshot.chat, saveId: snapshot.saveId, messageId: snapshot.messageId,
  swipeId: snapshot.swipeId, fingerprint: snapshot.fingerprint, statData: snapshot.statData,
});
const settingsStamp = (save: StSave): string => stableJson({
  partyPreparation: save.partyPreparation, equippedAbilities: save.equippedAbilities,
  learnedAbilityIds: save.learnedAbilityIds,
});

/** Open in the ST host document. Management saves settings and resolves undefined, as does cancel/abort; no battle is launched here. */
export function preparePartyDialog(options: PreparePartyDialogOptions): Promise<PreparedDialogParty | undefined> {
  const { hostWindow, service, mode, signal } = options;
  const management = mode === 'management';
  // Management uses full-health previews so current battle HP does not block editing.
  const preparationMode = management ? 'replay' : mode;
  const title = management ? '编队与能力装配管理' : mode === 'story' ? '剧情战斗队伍准备' : '往昔再现队伍准备';
  if (signal?.aborted) return Promise.resolve(undefined);
  const mount = management ? options.mount : undefined;
  const document = mount?.ownerDocument ?? hostWindow.document;
  const abilityOption = (a: PartyAbilityChoice) => ({ value: a.abilityId,
    label: `${abilityName(a.name)} · 法力 ${a.manaCost}${a.availabilityIssues?.length ? ` · 暂未开放：${a.availabilityIssues.join('、')}` : ''}`,
    disabled: !!a.availabilityIssues?.length });
  return new Promise(resolve => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const container = document.createElement('div');
    container.dataset.stPartyDialog = '';
    container.id = 'stage'; container.className = 'team-responsive';
    const shadow = container.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `${nativeStyles}\n${partyStyles}`;
    const modal = mount ? undefined : document.createElement('dialog');
    const dialog = modal ?? document.createElement('section');
    dialog.className = `party-dialog party-sheet team-screen${mount ? ' embedded' : ''}`;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', title);
    shadow.append(style, dialog);
    (mount ?? document.body ?? document.documentElement).append(container);
    let done = false;
    let busy = false;
    let snapshot: HostSnapshot | undefined;
    let save: StSave | undefined;
    let binding: string | undefined;
    let saveId: string | undefined;
    let savedSettings: string | undefined;
    let config: PartyPreparationSave = { memberRefs: [HERO_MEMBER_REF], baseAbilities: {}, weaponBindings: {} };
    let equipped: Record<string, string> = {};
    let message = '';
    let result: PartyPreparation | undefined;
    let selectedSlot = 0;
    let rosterPage = 0;
    let inspectedRef = HERO_MEMBER_REF;
    let search = '';
    let filter = 'all';
    let drag: TeamDrag | undefined;
    let termTips: (() => void) | undefined;

    function finish(value?: PreparedDialogParty): void {
      if (done) return;
      done = true;
      drag?.detach(); termTips?.();
      signal?.removeEventListener('abort', abort);
      hostWindow.removeEventListener('pagehide', abort);
      if (modal?.open) modal.close();
      container.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
      resolve(value);
    }
    function abort(): void { finish(); }
    signal?.addEventListener('abort', abort, { once: true });
    hostWindow.addEventListener('pagehide', abort, { once: true });
    modal?.addEventListener('cancel', event => { event.preventDefault(); finish(); });
    // Also handle programmatic close by the host.
    modal?.addEventListener('close', () => finish());

    function readableIssue(content: string): string {
      return content.replace(/\/(?:人物|羁绊列表|武器面板)(?:\/[^\s/，。；：、（）()[\]{}]+)*/g, pointer => {
        const parts = pointer.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
        const name = parts[0] === '人物' ? '主角' : parts[0] === '羁绊列表' ? parts[1] : '武器';
        const field = parts.length > (parts[0] === '羁绊列表' ? 2 : 1) ? parts.at(-1) : undefined;
        return field ? `${name}的${field}` : name ?? '角色';
      });
    }
    function text(tag: 'p' | 'h2' | 'h3' | 'li' | 'span', content: string, parent: HTMLElement, className?: string): HTMLElement {
      const element = document.createElement(tag);
      element.textContent = className === 'issue' || className === 'status' ? readableIssue(content) : content;
      if (className) element.className = className;
      parent.append(element);
      return element;
    }
    function button(parent: HTMLElement, name: string, action: () => void, disabled = false): HTMLButtonElement {
      const element = document.createElement('button');
      element.type = 'button'; element.className = 'secondary';
      const glyph = ({ '上移': 'chevrons', '下移': 'chevrons', '加入队伍': 'flag', '移出队伍': 'close',
        '取消': 'close' } as Record<string, string>)[name];
      if (glyph) {
        const decoration = document.createElement('span'); decoration.dataset.icon = glyph;
        decoration.setAttribute('aria-hidden', 'true'); decoration.innerHTML = icon(glyph);
        if (name === '下移') decoration.className = 'down';
        element.append(decoration);
      }
      element.append(document.createTextNode(name)); element.disabled = disabled || busy;
      element.addEventListener('click', action); parent.append(element); return element;
    }
    function select(parent: HTMLElement, label: string, key: string, choices: { value: string; label: string; disabled?: boolean }[], value: string, change: (value: string) => void): HTMLSelectElement {
      const wrapper = document.createElement('label'); text('span', label, wrapper);
      const element = document.createElement('select'); element.dataset.control = key;
      element.setAttribute('aria-label', label); element.disabled = busy;
      for (const choice of choices) {
        const option = document.createElement('option'); option.value = choice.value; option.textContent = choice.label; option.disabled = !!choice.disabled; element.append(option);
      }
      if (value && !choices.some(choice => choice.value === value)) {
        const unknown = document.createElement('option'); unknown.value = value; unknown.textContent = `待核对：${value}`; element.append(unknown);
      }
      element.value = value;
      element.addEventListener('change', () => change(element.value));
      wrapper.append(element); parent.append(wrapper); return element;
    }
    function assertContext(current: { snapshot: HostSnapshot; save?: StSave }): void {
      if (binding !== undefined && chatKey(current.snapshot.chat) !== binding) throw new Error('当前聊天已切换，请取消并在目标聊天重新准备。');
      if (saveId !== undefined && current.save?.id !== saveId) throw new Error('当前存档已切换或删除，请取消后重新准备。');
    }
    function adopt(current: { snapshot: HostSnapshot; save?: StSave }, loadSettings = false): void {
      assertContext(current);
      snapshot = current.snapshot; save = current.save;
      binding ??= chatKey(snapshot.chat);
      if (save) {
        saveId ??= save.id;
        if (loadSettings) {
          config = structuredClone(save.partyPreparation ?? { memberRefs: [HERO_MEMBER_REF], baseAbilities: {}, weaponBindings: {} });
          equipped = structuredClone(save.equippedAbilities);
        }
        savedSettings = settingsStamp(save);
      }
    }
    function prepare(): PartyPreparation | undefined {
      if (!snapshot) return undefined;
      // Use the effective draft, including explicit removals, without mutating the loaded save.
      const effectiveSave = save && { ...save, equippedAbilities: equipped };
      return prepareCurrentParty(snapshot, { ...config, mode: preparationMode, save: effectiveSave, equippedAbilities: equipped, presetPortrait: presetPortraitResolver(options.hostWindow) });
    }
    async function run(action: () => Promise<void>): Promise<void> {
      if (busy || done) return;
      busy = true; message = ''; render();
      try { await action(); }
      catch (error) { if (!done) message = error instanceof Error ? error.message : String(error); }
      finally { busy = false; if (!done) render(); }
    }
    async function refresh(loadSettings = false): Promise<void> {
      const current = await service.current();
      if (!done) {
        const changed = !!current.save && savedSettings !== undefined && settingsStamp(current.save) !== savedSettings;
        adopt(current, loadSettings || changed);
      }
    }
    // Weapon shop over the current floor's MVU variables; re-read after each purchase attempt so the
    // dialog's snapshot (and its later save check) follows the new variables.
    const shop: WeaponShopAccess = {
      owned: id => weaponOwned(snapshot?.statData ?? {}, id),
      // With the 通用币 guard running, a hand-edited balance is not spendable: show the sealed one.
      balance: () => !snapshot ? undefined : (currencyGuardActive(hostWindow) ? sealedCurrency(snapshot.statData) : undefined) ?? universalCurrency(snapshot.statData),
      blocked: () => save?.pendingStory ? '剧情战斗尚未结算，暂不能购买' : !save ? '请先创建当前聊天存档' : undefined,
      purchase: async id => {
        if (!snapshot || done) throw new Error('面板尚未读取到当前聊天');
        try { await service.purchaseWeapon(id, snapshot); }
        finally { if (!done) { await refresh(); render(); } }
      },
    };
    function move(ref: string, direction: number): void {
      const index = config.memberRefs.indexOf(ref); const target = index + direction;
      if (index < 0 || target < 0 || target >= config.memberRefs.length) return;
      [config.memberRefs[index], config.memberRefs[target]] = [config.memberRefs[target]!, config.memberRefs[index]!];
      render();
    }
    async function submit(): Promise<void> {
      if (!snapshot || !save || !result?.ready) return;
      const displayed = sourceStamp(snapshot);
      const current = await service.current();
      if (done) return;
      assertContext(current);
      if (!current.save) throw new Error('请先创建当前聊天存档。');
      if (settingsStamp(current.save) !== savedSettings) {
        adopt(current, true); message = '存档中的队伍或已学能力已变化，已载入最新设置，请重新核对。'; return;
      }
      adopt(current);
      if (sourceStamp(current.snapshot) !== displayed) {
        message = '宿主人物或变量已变化，面板已刷新，请核对后再次确认。'; return;
      }
      const checked = prepare();
      if (!checked?.ready) { message = '请处理选定角色的问题后继续。'; return; }
      const expectedConfig = stableJson(config);
      const expectedEquipped = stableJson(equipped);
      const persisted = await service.repository.update(current.save.id, current.save.revision, draft => {
        if (done || signal?.aborted) throw new Error('准备已取消。');
        draft.partyPreparation = structuredClone(config);
        draft.equippedAbilities = structuredClone(equipped);
      });
      if (done) return;
      // Re-read after the asynchronous save transaction as well: host variables can change while IndexedDB commits.
      const final = await service.current();
      if (done) return;
      assertContext(final);
      if (!final.save || stableJson(final.save.partyPreparation) !== expectedConfig || stableJson(final.save.equippedAbilities) !== expectedEquipped || settingsStamp(final.save) !== settingsStamp(persisted)) {
        adopt(final, true); message = '保存期间队伍设置已变化，请核对后再次确认。'; return;
      }
      adopt(final);
      if (sourceStamp(final.snapshot) !== displayed) {
        message = '保存期间宿主人物或变量已变化，面板已刷新，请再次确认。'; return;
      }
      const verified = prepare();
      if (!verified?.ready) { message = '当前队伍存在问题，请核对更新后的面板。'; return; }
      if (management) { finish(); return; }
      finish({ party: structuredClone(verified.party), source: structuredClone(final.snapshot) });
    }
    function artHtml(candidate: PartyCandidate): string {
      // A locally uploaded status-bar image is shown here only; the saved portrait is the web address.
      const url = localPortrait(options.hostWindow, candidate.kind, candidate.name) || candidate.snapshot?.portraitUrl || 'static/hero/character-unknown.webp';
      return `<img src="${escapeHtml(new URL(url, assetBase).href)}" alt="${escapeHtml(candidate.name)}" loading="lazy">`;
    }
    function manaHtml(candidate: PartyCandidate, cls: string): string {
      const unit = candidate.snapshot;
      const colors = unit?.manaColors ?? readCompanionColors(candidate) ?? [];
      return `<span class="${cls}">${gemSvg(colors.map(c => c.toLowerCase()))}${unit ? `<i>${unit.manaCost}</i>` : ''}</span>`;
    }
    function rarityClass(candidate: PartyCandidate): string {
      return candidate.kind === 'hero' ? 'r-hero' : `r-${candidate.snapshot?.rarityIdx ?? 0}`;
    }
    function assign(candidate: PartyCandidate): void {
      if (busy || !candidate.eligible) return;
      if (selectedSlot > config.memberRefs.length) return;
      const current = config.memberRefs.indexOf(candidate.memberRef);
      if (current >= 0) {
        if (selectedSlot < config.memberRefs.length) {
          [config.memberRefs[current], config.memberRefs[selectedSlot]] = [config.memberRefs[selectedSlot]!, candidate.memberRef];
        }
      } else if (selectedSlot === config.memberRefs.length && config.memberRefs.length < 4) config.memberRefs.push(candidate.memberRef);
      inspectedRef = candidate.memberRef; render();
    }
    function drop(index: number): void {
      if (busy || config.memberRefs[index] === HERO_MEMBER_REF) return;
      config.memberRefs.splice(index, 1); selectedSlot = Math.min(selectedSlot, Math.max(0, config.memberRefs.length - 1)); render();
    }
    function renderConfiguration(candidate: PartyCandidate, configuration: HTMLElement): void {
      if (candidate.kind === 'companion') {
        // Colors are fixed per companion; any learned ability can be equipped regardless of color.
        const learned = (save?.learnedAbilityIds ?? []).flatMap(id => { const ability = findPartyAbility(id); return ability ? [{ ...ability, abilityId: id }] : []; });
        select(configuration, '装配已学能力', `equipped:${candidate.memberRef}`, [{ value: '', label: '使用初始能力' }, ...learned.map(abilityOption)], equipped[candidate.memberRef] ?? '', value => {
          if (value) equipped[candidate.memberRef] = value; else delete equipped[candidate.memberRef]; render();
        });
        if (!learned.length) text('p', '击败敌人收集灵魂碎片学会能力后，可在这里装配。', configuration, 'muted');
      } else {
        const main = candidate.equipment.find(e => e.type === '武器' && e.slot === '主手');
        if (main) {
          // Optional: an unbound main hand fights with the starter weapon. The picker follows the
          // original weapon center: searchable card grid with the spell shown before choosing.
          const bound = config.weaponBindings[main.ref] ?? '';
          const row = document.createElement('div'); row.className = 'weapon-binding';
          const label = document.createElement('span');
          const weaponName = (id: string) => weaponNames.get(id)?.split(' · ')[0] ?? '骑士之剑';
          // A registered paid weapon not bought on this floor fights as the starter weapon.
          label.textContent = `主手武器（${main.name}）：${weaponName(bound || STARTER_WEAPON)}${!bound ? '（默认）'
            : shop.owned(bound) ? '' : `（未购买，出战使用${weaponName(STARTER_WEAPON)}）`}`;
          row.append(label); configuration.append(row);
          const change = button(row, '更换武器', () => {
            openWeaponPicker({ root: shadow, current: bound, magic: candidate.snapshot?.stats.magic ?? 0, assetBase, equipmentName: main.name, shop,
              onPick: value => { if (value) config.weaponBindings[main.ref] = value; else delete config.weaponBindings[main.ref]; render(); } });
          }, busy);
          change.dataset.control = `weapon:${main.ref}`;
        }
      }
    }
    function readCompanionColors(candidate: PartyCandidate): string[] | undefined {
      const bonds = snapshot?.statData['羁绊列表'] as Record<string, { 三消?: { 颜色?: unknown } }> | undefined;
      const colors = bonds?.[candidate.name]?.三消?.颜色;
      return Array.isArray(colors) && colors.every(c => typeof c === 'string') ? colors : undefined;
    }
    function render(): void {
      if (done) return;
      const focusedKey = (shadow.activeElement as HTMLElement | null)?.dataset.control;
      drag?.detach(); termTips?.();
      result = prepare();
      dialog.innerHTML = teamWorkspaceHtml();
      const node = <T extends HTMLElement = HTMLElement>(id: string): T => dialog.querySelector<T>(`#${id}`)!;
      node('bannerPost').remove(); node('teamHeroLoadout').remove(); node('activeBadge').remove();
      node('teamName').textContent = '出战队伍';
      node('teamGauge').textContent = `${config.memberRefs.length} / 4`;
      const status = node('saveHint'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
      status.textContent = busy ? '正在读取或保存…' : readableIssue(message);
      node('setActive').remove();
      node('lineupPanel').querySelector('.drag-hint')!.remove();
      const bar = dialog.querySelector<HTMLElement>('.lineup-bar')!;
      const refreshButton = button(bar, '重新读取宿主', () => { void run(async () => { await refresh(); message = '已重新读取，请核对队伍。'; }); });
      // Same size and style as its "取消" neighbour; a readable label instead of an ambiguous icon.
      refreshButton.title = '重新读取酒馆人物与装备'; refreshButton.setAttribute('aria-label', '重新读取宿主'); refreshButton.textContent = '重新读取';
      const cancel = button(bar, '取消', () => finish()); cancel.disabled = false;
      const confirm = button(bar, management ? '保存编队与能力装配' : mode === 'story' ? '确认队伍进入剧情战斗' : '确认队伍进入再现', () => { void run(submit); }, !save || !result?.ready);
      confirm.className = 'set-active confirm';
      if (snapshot && !save) button(bar, '创建当前聊天存档', () => { void run(async () => {
        const current = await service.current(); if (done) return; assertContext(current);
        if (!current.save) await service.create();
        if (!done) await refresh(true);
      }); });
      const checks = node('teamChecks');
      for (const issue of result?.issues ?? []) text('li', issue.message, checks, 'issue');
      const refs = new Set(result?.candidates.map(c => c.memberRef));
      for (const ref of config.memberRefs.filter(ref => !refs.has(ref))) {
        const item = text('li', '已选角色已离开当前来源', checks, 'issue');
        button(item, '移除失效角色', () => { config.memberRefs = config.memberRefs.filter(r => r !== ref); render(); });
      }
      const stale = [...new Set([...Object.keys(config.baseAbilities), ...Object.keys(equipped)].filter(ref => !refs.has(ref) || ref === HERO_MEMBER_REF))];
      for (const ref of stale) button(checks, `清除失效能力设置：${readableIssue(ref)}`, () => { delete config.baseAbilities[ref]; delete equipped[ref]; render(); });
      const slots = node('slots');
      for (let index = 0; index < 4; index++) {
        const candidate = result?.candidates.find(c => c.memberRef === config.memberRefs[index]);
        const wrapper = document.createElement('div'); wrapper.className = 'slot-wrap';
        if (candidate) wrapper.dataset.memberRef = candidate.memberRef;
        wrapper.innerHTML = `<button class="slot${candidate ? ` ${rarityClass(candidate)}${index === 0 ? ' leader' : ''}` : ' empty'}${selectedSlot === index ? ' on' : ''}${candidate?.memberRef === inspectedRef ? ' look' : ''}" data-slot="${index}" type="button" aria-label="${index + 1} 号位，${escapeHtml(candidate?.name ?? '空位')}">
          <span class="slot-tag${index === 0 ? ' skull' : ''}">${index + 1}${index === 0 ? '<span data-icon="skull"></span>' : ''}</span>
          <span class="slot-art">${candidate ? manaHtml(candidate, 'slot-mana') + artHtml(candidate) : '+'}</span>
          <span class="slot-foot"><b>${escapeHtml(candidate?.name ?? '空位')}</b>${candidate ? `<span class="slot-level">Lv.${candidate.source?.level ?? 1}</span>` : ''}</span>
        </button><span class="slot-ops"></span>`;
        const slotButton = wrapper.querySelector('button')!;
        slotButton.disabled = busy || index > config.memberRefs.length;
        if (index > config.memberRefs.length) slotButton.title = '请按顺序编入队伍';
        wrapper.querySelector('button')!.onclick = () => { selectedSlot = index; if (candidate) inspectedRef = candidate.memberRef; render(); };
        const ops = wrapper.querySelector<HTMLElement>('.slot-ops')!;
        const up = button(ops, '上移', () => move(candidate!.memberRef, -1), !candidate || index === 0); up.className = 'slot-op'; up.setAttribute('aria-label', '上移'); up.title = '上移'; up.textContent = '↑';
        const down = button(ops, '下移', () => move(candidate!.memberRef, 1), !candidate || index === config.memberRefs.length - 1); down.className = 'slot-op'; down.setAttribute('aria-label', '下移'); down.title = '下移'; down.textContent = '↓';
        if (!candidate) ops.replaceChildren();
        if (candidate?.kind === 'companion') { const remove = button(ops, '移出队伍', () => drop(index)); remove.className = 'slot-op drop'; remove.setAttribute('aria-label', '移出队伍'); remove.title = '移出队伍'; remove.textContent = '✕'; }
        slots.append(wrapper);
      }
      const candidates = result?.candidates ?? [];
      node('ownedCount').textContent = String(candidates.length);
      node('filters').querySelectorAll('select,.filter-sep').forEach(el => el.remove());
      const input = node<HTMLInputElement>('searchInput'); input.value = search;
      // render() rebuilds the dialog, including this input; during IME composition (Chinese
      // pinyin) that would break the composition, so search with the committed text instead.
      const applySearch = () => {
        search = input.value; rosterPage = 0; render();
        const next = node<HTMLInputElement>('searchInput'); next.focus(); next.setSelectionRange(search.length, search.length);
      };
      input.oninput = event => { if (!(event as InputEvent).isComposing) applySearch(); };
      input.addEventListener('compositionend', () => { if (input.value !== search) applySearch(); });
      node('filters').querySelectorAll<HTMLButtonElement>('[data-filter]').forEach(tab => {
        tab.classList.toggle('on', tab.dataset.filter === filter);
        tab.onclick = () => { filter = tab.dataset.filter!; rosterPage = 0; render(); };
      });
      dialog.querySelector('.filters-colors')!.remove();

      const roster = node('roster');
      const visible = candidates.filter(c => (filter !== 'hero' || c.kind === 'hero') && c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
      const pageCount = Math.max(1, Math.ceil(visible.length / 12));
      rosterPage = Math.min(rosterPage, pageCount - 1);
      const pager = dialog.querySelector<HTMLElement>('.pager')!;
      pager.style.display = pageCount > 1 ? '' : 'none';
      node('pageLabel').textContent = `${rosterPage + 1} / ${pageCount}`;
      const previous = node<HTMLButtonElement>('prevPage'), next = node<HTMLButtonElement>('nextPage');
      previous.disabled = rosterPage === 0; next.disabled = rosterPage === pageCount - 1;
      previous.onclick = () => { rosterPage--; render(); };
      next.onclick = () => { rosterPage++; render(); };
      for (const candidate of visible.slice(rosterPage * 12, rosterPage * 12 + 12)) {
        const card = document.createElement('button'); card.type = 'button'; card.dataset.memberRef = candidate.memberRef; card.dataset.id = candidate.memberRef;
        card.className = `mini ${rarityClass(candidate)}${config.memberRefs.includes(candidate.memberRef) ? ' in' : ''}${candidate.memberRef === inspectedRef ? ' look' : ''}`;
        card.innerHTML = `<i class="rarity-edge" aria-hidden="true"></i>${artHtml(candidate)}${manaHtml(candidate, 'mini-mana')}<span class="mini-lv">Lv.${candidate.source?.level ?? 1}</span><span class="mini-shade"><b>${escapeHtml(candidate.name)}</b></span>`;
        card.onclick = () => { inspectedRef = candidate.memberRef; render(); };
        card.ondblclick = () => {
          if (!config.memberRefs.includes(candidate.memberRef)) selectedSlot = config.memberRefs.length;
          assign(candidate);
        }; roster.append(card);
      }
      if (!visible.length) text('p', '暂无成员', roster, 'inspect-empty');
      const candidate = candidates.find(c => c.memberRef === inspectedRef) ?? candidates[0];
      const inspect = node('inspect');
      if (candidate) {
        inspectedRef = candidate.memberRef;
        const unit = candidate.snapshot;
        const stats = unit ? `<span class="stat-chips">${[
          ['swords', '攻击', unit.stats.attack, 'atk'], ['shield', '护甲', unit.stats.armor, 'armor'],
          ['heart', '生命', `${unit.initialHp ?? unit.stats.hp}/${unit.stats.hp}`, 'hp'], ['orb', '魔力', unit.stats.magic, 'mag'],
        ].map(([glyph, label, value, cls]) => `<span class="stat-${cls}" title="${label}"><span data-icon="${glyph}"></span><b>${value}</b></span>`).join('')}</span>` : '';
        inspect.innerHTML = teamInspectHtml({ art: artHtml(candidate), name: candidate.name,
          identity: [candidate.kind === 'hero' ? '主角' : '同伴', unit?.race, `Lv.${candidate.source?.level ?? 1}`].filter(Boolean).join(' · '),
          mana: manaHtml(candidate, 'inspect-mana'), spellName: candidate.weapon ? weaponNames.get(candidate.weapon.id)?.split(' · ')[0] ?? abilityName(unit?.spellName ?? '—') : abilityName(unit?.spellName ?? candidate.ability?.name ?? '—'),
          spellSource: candidate.kind === 'hero' ? '经武器施放' : '主动能力',
          description: renderSpell(escapeHtml(abilityDisplayText(unit?.spellDescription ?? '', unit?.stats.magic ?? 0)), unit?.stats.magic ?? 0, { interactive: false }).html,
          stats, actions: '',
        });
        const ops = inspect.querySelector<HTMLElement>('.inspect-ops')!;
        const index = config.memberRefs.indexOf(candidate.memberRef);
        // Native inspect actions use .inspect-act, which fits the 108px action column.
        if (index >= 0) {
          if (candidate.kind === 'companion') button(ops, '移出队伍', () => drop(index)).className = 'inspect-act';
        } else button(ops, '加入队伍', () => {
          if (config.memberRefs.length < 4) { config.memberRefs.push(candidate.memberRef); render(); }
        }, !candidate.eligible || config.memberRefs.length >= 4).className = 'inspect-act primary';
        const configuration = document.createElement('div'); configuration.className = 'team-hero-loadout member-config';
        configuration.dataset.memberRef = candidate.memberRef;
        renderConfiguration(candidate, configuration);
        for (const issue of candidate.issues) text('p', issue.message, configuration, 'issue');
        if (configuration.childElementCount) inspect.after(configuration);
        termTips = bindTermTips(inspect);
      } else inspect.innerHTML = '<p class="inspect-empty">未选中成员</p>';
      mountIcons(dialog);
      drag = new TeamDrag(dialog, {
        source(target) {
          if (busy) return null;
          const slot = target.closest<HTMLElement>('[data-slot]');
          if (slot) { const index = Number(slot.dataset.slot); const key = config.memberRefs[index]; return key ? {kind:'slot', key, index, el: slot} : null; }
          const card = target.closest<HTMLElement>('.mini[data-id]');
          return card ? {kind:'roster', key:card.dataset.id!, el:card} : null;
        },
        resolve(x, y, source) {
          const hit = shadow.elementFromPoint(x, y);
          const slot = hit?.closest<HTMLElement>('[data-slot]');
          if (slot) {
            const index = Number(slot.dataset.slot);
            const existing = config.memberRefs.includes(source.key);
            if ((slot as HTMLButtonElement).disabled || (existing ? index >= config.memberRefs.length : index !== config.memberRefs.length)) return null;
            return {kind:'slot', index, el:slot};
          }
          const roster = hit?.closest<HTMLElement>('.roster');
          return roster ? {kind:'out', el:roster} : null;
        },
        drop(source, target) {
          if (target.kind === 'out') { if (source.kind === 'slot') drop(source.index!); return; }
          selectedSlot = target.index;
          const candidate = result?.candidates.find(c => c.memberRef === source.key);
          if (candidate) assign(candidate);
        },
        start() { dialog.classList.add('drag-active'); },
        end() { dialog.classList.remove('drag-active'); },
      });
      drag.attach();
      if (focusedKey) [...dialog.querySelectorAll<HTMLElement>('[data-control]')].find(el => el.dataset.control === focusedKey)?.focus();
    }
    render(); modal?.showModal();
    void run(() => refresh(true));
  });
}
