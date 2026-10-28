import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { PreparedDialogParty } from '../../src/sillytavern/partyDialog';
import type { HostSnapshot } from '../../src/sillytavern/hostAdapter';
import type { StHostService } from '../../src/sillytavern/hostService';
import type { BattleRequest, BattleResult } from '../../src/session/contract';

declare global {
  interface Window {
    partyFixture: {
      service: StHostService;
      open(mode?: 'story' | 'replay'): void;
      controller: AbortController;
      // Invalid host values are deliberately injected by the source validation cases.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      state: { stat_data: Record<string, any> };
      result: PreparedDialogParty | undefined | 'pending';
      lastSnapshot?: HostSnapshot;
      switchChat(): void;
      release?: () => void;
      calls: number;
      installDefaultHost(): Promise<import('../../src/sillytavern/hostEntry').StHostHandle>;
    };
  }
}

async function install(page: Page, options: { noSave?: boolean; weapon?: boolean; companions?: boolean } = {}) {
  await page.goto('/sillytavern.html');
  await page.evaluate(async options => {
    const load = (path: string) => import(/* @vite-ignore */path);
    const { StHostAdapter } = await load('/src/sillytavern/hostAdapter.ts') as typeof import('../../src/sillytavern/hostAdapter');
    const { StHostService } = await load('/src/sillytavern/hostService.ts') as typeof import('../../src/sillytavern/hostService');
    const { StSaveRepository } = await load('/src/sillytavern/saveRepository.ts') as typeof import('../../src/sillytavern/saveRepository');
    const { preparePartyDialog } = await load('/src/sillytavern/partyDialog.ts') as typeof import('../../src/sillytavern/partyDialog');
    const { partyAbilityChoices } = await load('/src/sillytavern/partyPreparation.ts') as typeof import('../../src/sillytavern/partyPreparation');
    const actor = () => ({ 名称: '主角', 等级: 20, 生命值上限: 200, 当前生命值: 100, 临时生命值: 0, AC: 14,
      属性: { 力量: 16, 敏捷: 12, 体质: 14, 智力: 18, 感知: 12, 魅力: 10 },
      战斗属性: { 武器面板: { 伤害骰: '2d6', 等级系数: 3, 固定伤害: 10 }, 物理减伤: 20, 魔法减伤: 0, 每回合动作资源: { 攻击次数: 2 } },
      装备列表: options.weapon ? { 长剑: { 名称: '<img src=x onerror=alert(1)>', 类型: '武器', 部位: '主手', 装备箱: false } } : {} });
    const companion = () => ({ ...actor(), 装备列表: {}, 同行誓约: true, 三消: { 颜色: ['Purple', 'Green'] } });
    const missing = companion() as Record<string, unknown>; delete missing['三消'];
    const bonds = options.companions === false ? {} : {
      同伴甲: missing, 同伴乙: companion(), 同伴丙: companion(), 同伴丁: companion(), 未同行: { ...companion(), 同行誓约: false },
    };
    const state = { stat_data: { 人物: actor(), 羁绊列表: bonds } };
    let chatId = 'original'; const vars: Record<string, Record<string, unknown>> = {};
    const helpers = {
      getContext: () => ({ characterId: 0, characters: [{ avatar: 'party.png' }], chat: [{ swipe_id: 0 }], getCurrentChatId: () => chatId }),
      getVariables: () => structuredClone(vars[chatId] ?? {}),
      updateVariablesWith: (fn: (v: Record<string, unknown>) => Record<string, unknown>) => vars[chatId] = fn(structuredClone(vars[chatId] ?? {})),
      Mvu: { getMvuData: () => structuredClone(state), replaceMvuData: async (next: typeof state) => { Object.assign(state, structuredClone(next)); } },
    };
    const repository = await StSaveRepository.open(window.indexedDB);
    const service = new StHostService(new StHostAdapter(helpers, window, 'party-tests'), repository);
    if (!options.noSave) {
      const save = await service.create();
      await repository.update(save.id, save.revision, draft => { draft.learnedAbilityIds = [partyAbilityChoices()[1]!.abilityId]; });
    }
    const controller = new AbortController();
    const fixture: Window['partyFixture'] = {
      service, controller, state, result: 'pending', calls: 0,
      switchChat: () => { chatId = 'other'; },
      installDefaultHost: async () => {
        const { installStHost } = await load('/src/sillytavern/hostEntry.ts') as typeof import('../../src/sillytavern/hostEntry');
        return installStHost({ hostWindow: window, helpers, hostId: 'party-tests', battleUrl: new URL('/sillytavern-battle.html', location.href).href });
      },
      open: (mode = 'story') => {
        fixture.result = 'pending';
        void preparePartyDialog({ hostWindow: window, service, mode, signal: controller.signal }).then(result => { fixture.result = result; });
      },
    };
    window.partyFixture = fixture;
    const focus = document.createElement('button'); focus.id = 'party-opener'; focus.textContent = '打开队伍'; document.body.append(focus); focus.focus();
    fixture.open();
  }, options);
  await expect(page.getByRole('dialog')).toBeVisible();
  // The native save hint is hidden while empty; wait for the read to finish by its DOM state.
  await expect(page.getByRole('dialog').locator('[role="status"]')).not.toContainText('正在读取或保存');
}
const memberRef = (name: string) => name === '主角' ? '/人物' : `/羁绊列表/${name.replace(/~/g, '~0').replace(/\//g, '~1')}`;
const card = (page: Page, name: string) => page.getByRole('dialog').locator(`.mini[data-member-ref="${memberRef(name)}"]`);
const configuration = (page: Page, name: string) => page.getByRole('dialog').locator(`.member-config[data-member-ref="${memberRef(name)}"]`);
const slot = (page: Page, name: string) => page.getByRole('dialog').locator(`.slot-wrap[data-member-ref="${memberRef(name)}"]`);
const inspect = (page: Page) => page.getByRole('dialog').locator('.inspect');
async function selectMember(page: Page, name: string) {
  await card(page, name).click();
  await expect(card(page, name)).toHaveClass(/\blook\b/);
  await expect(inspect(page).locator('.inspect-name > b')).toHaveText(name);
  if (name !== '主角') {
    await expect(configuration(page, name)).toBeVisible();
    await expect(page.getByRole('dialog').locator('.member-config')).toHaveCount(1);
  }
  return configuration(page, name);
}
async function addMember(page: Page, name: string) {
  await selectMember(page, name);
  await inspect(page).getByRole('button', { name: '加入队伍', exact: true }).click();
  await expect(slot(page, name)).toHaveCount(1);
}
const confirm = (page: Page) => page.getByRole('button', { name: /确认队伍进入/ });
async function chooseBase(page: Page, name: string, index = 1) {
  await (await selectMember(page, name)).getByRole('combobox', { name: '基础主动能力', exact: true }).selectOption({ index });
}
async function readResult(page: Page) {
  await expect.poll(() => page.evaluate(() => window.partyFixture.result === 'pending')).toBe(false);
  return page.evaluate(() => window.partyFixture.result);
}

test('default protagonist shows real stats and default weapon, persists configuration, and restores focus', async ({ page }) => {
  await install(page, { companions: false });
  await expect(inspect(page).locator('[title="生命"] b')).toHaveText('109/218');
  await expect(inspect(page).locator('.inspect-spell strong')).toHaveText('骑士之剑');
  await expect(inspect(page).locator('.inspect-mana i')).toHaveText('3');
  await expect(page.getByRole('dialog')).not.toContainText('uncalibrated');
  await page.evaluate(() => {
    const fixture = window.partyFixture; const current = fixture.service.current.bind(fixture.service);
    fixture.service.current = async () => {
      const state = await current(); fixture.lastSnapshot = state.snapshot; return state;
    };
  });
  await confirm(page).click();
  const result = await readResult(page);
  expect(result).toMatchObject({ party: [{ externalId: '/人物', manaColors: ['Blue'], manaCost: 3, skillId: 'gw_KnightsSword', initialHp: 109 }] });
  const source = await page.evaluate(() => {
    const fixture = window.partyFixture; const prepared = fixture.result;
    if (!prepared || prepared === 'pending') throw new Error('Missing prepared party');
    const separate = prepared.source !== fixture.lastSnapshot;
    const equal = JSON.stringify(prepared.source) === JSON.stringify(fixture.lastSnapshot);
    prepared.source.statData['test-mutation'] = true;
    return { separate, equal, hostUnchanged: !('test-mutation' in fixture.lastSnapshot!.statData) };
  });
  expect(source).toEqual({ separate: true, equal: true, hostUnchanged: true });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#party-opener')).toBeFocused();
  const save = await page.evaluate(async () => (await window.partyFixture.service.current()).save!);
  expect(save.partyPreparation).toEqual({ memberRefs: ['/人物'], baseAbilities: {}, weaponBindings: {} });
});

test('missing colors, manual base initialization, learned equipment and ordering survive reopening', async ({ page }) => {
  await install(page);
  const alpha = await selectMember(page, '同伴甲');
  await inspect(page).getByRole('button', { name: '加入队伍', exact: true }).click();
  await expect(confirm(page)).toBeDisabled();
  await chooseBase(page, '同伴甲');
  await alpha.getByRole('combobox', { name: '初始化同伴颜色' }).selectOption('Green+Blue');
  await alpha.getByRole('button', { name: '写入同伴颜色' }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('同伴颜色已写入当前聊天。');
  await expect(inspect(page).getByRole('img', { name: '绿、蓝色法力', exact: true })).toBeVisible();
  await alpha.getByRole('combobox', { name: '装配已学能力' }).selectOption({ index: 1 });
  await slot(page, '同伴甲').getByRole('button', { name: '上移', exact: true }).click();
  await confirm(page).click();
  expect(await readResult(page)).toMatchObject({ party: [{ externalId: '/羁绊列表/同伴甲', manaColors: ['Green', 'Blue'] }, { externalId: '/人物' }] });
  const stored = await page.evaluate(async () => ({ save: (await window.partyFixture.service.current()).save!, colors: window.partyFixture.state.stat_data.羁绊列表.同伴甲.三消.颜色 }));
  expect(stored.colors).toEqual(['Green', 'Blue']);
  expect(stored.save.partyPreparation!.memberRefs).toEqual(['/羁绊列表/同伴甲', '/人物']);
  expect(stored.save.equippedAbilities['/羁绊列表/同伴甲']).toBe(stored.save.learnedAbilityIds[0]);
  await page.evaluate(() => window.partyFixture.open());
  await expect(page.getByRole('dialog').locator('.slot-wrap').first()).toHaveAttribute('data-member-ref', memberRef('同伴甲'));
  await selectMember(page, '同伴甲');
  await alpha.getByRole('combobox', { name: '装配已学能力' }).selectOption('');
  await confirm(page).click(); await readResult(page);
  expect(await page.evaluate(async () => (await window.partyFixture.service.current()).save!.equippedAbilities)).toEqual({});
});

test('selection is limited to four including protagonist and blocks members who are not travelling', async ({ page }) => {
  await install(page);
  for (const name of ['同伴乙', '同伴丙', '同伴丁']) {
    await addMember(page, name);
    await chooseBase(page, name);
  }
  await selectMember(page, '同伴甲');
  await expect(inspect(page).getByRole('button', { name: '加入队伍', exact: true })).toBeDisabled();
  await selectMember(page, '未同行');
  await expect(inspect(page).getByRole('button', { name: '加入队伍', exact: true })).toBeDisabled();
  await selectMember(page, '主角');
  await expect(inspect(page).getByRole('button', { name: '移出队伍', exact: true })).toHaveCount(0);
  await expect(slot(page, '主角').getByRole('button', { name: '移出队伍', exact: true })).toHaveCount(0);
  await confirm(page).click();
  const result = await readResult(page);
  expect(result && typeof result !== 'string' ? result.party.length : 0).toBe(4);
});

test('native roster and slots inspect only the selected member and preserve draft controls', async ({ page }) => {
  await install(page);
  const dialog = page.getByRole('dialog');
  await expect(dialog.locator('.slot-wrap')).toHaveCount(4);
  await expect(dialog.locator('.slot-wrap[data-member-ref]')).toHaveCount(1);
  await expect(dialog.locator('.mini')).toHaveCount(6);
  const beta = await selectMember(page, '同伴乙');
  // A single roster click only inspects; membership requires an explicit action.
  await expect(slot(page, '同伴乙')).toHaveCount(0);
  await expect(card(page, '同伴乙')).not.toHaveClass(/\bin\b/);
  await beta.getByRole('combobox', { name: '基础主动能力', exact: true }).selectOption({ index: 1 });
  await beta.getByRole('combobox', { name: '装配已学能力', exact: true }).selectOption({ index: 1 });
  const base = await beta.getByRole('combobox', { name: '基础主动能力', exact: true }).inputValue();
  const learned = await beta.getByRole('combobox', { name: '装配已学能力', exact: true }).inputValue();
  await selectMember(page, '同伴丙');
  await expect(beta).toHaveCount(0);
  await slot(page, '主角').getByRole('button', { name: '1 号位，主角', exact: true }).click();
  await expect(inspect(page).locator('.inspect-name > b')).toHaveText('主角');
  await expect(dialog.locator('.member-config')).toHaveCount(0);
  await selectMember(page, '同伴乙');
  await expect(beta.getByRole('combobox', { name: '基础主动能力', exact: true })).toHaveValue(base);
  await expect(beta.getByRole('combobox', { name: '装配已学能力', exact: true })).toHaveValue(learned);
  await inspect(page).getByRole('button', { name: '加入队伍', exact: true }).click();
  await expect(card(page, '同伴乙')).toHaveClass(/\bin\b/);
  await expect(slot(page, '同伴乙')).toHaveCount(1);
  await confirm(page).click();
  expect(await readResult(page)).toMatchObject({ party: [{ externalId: '/人物' }, { externalId: memberRef('同伴乙') }] });
  const save = await page.evaluate(async () => (await window.partyFixture.service.current()).save!);
  expect(save.partyPreparation!.baseAbilities[memberRef('同伴乙')]).toBe(base);
  expect(save.equippedAbilities[memberRef('同伴乙')]).toBe(learned);
});

test('native drag assignment and swapping preserve the protagonist and removal leaves one member', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await install(page);
  const dialog = page.getByRole('dialog');
  const occupied = dialog.locator('.slot-wrap[data-member-ref]');
  await chooseBase(page, '同伴乙');
  await card(page, '同伴乙').dragTo(slot(page, '主角').locator('.slot'));
  await expect(occupied).toHaveCount(1);
  await expect(occupied.first()).toHaveAttribute('data-member-ref', memberRef('主角'));
  await card(page, '同伴乙').dragTo(dialog.locator('.slot-wrap').nth(1).locator('.slot'));
  await expect(occupied).toHaveCount(2);
  await slot(page, '同伴乙').locator('.slot').dragTo(slot(page, '主角').locator('.slot'));
  await expect(occupied.first()).toHaveAttribute('data-member-ref', memberRef('同伴乙'));
  await expect(occupied.nth(1)).toHaveAttribute('data-member-ref', memberRef('主角'));
  await slot(page, '同伴乙').getByRole('button', { name: '下移', exact: true }).click();
  await expect(occupied.first()).toHaveAttribute('data-member-ref', memberRef('主角'));
  await selectMember(page, '同伴乙');
  await inspect(page).getByRole('button', { name: '移出队伍', exact: true }).click();
  await expect(occupied).toHaveCount(1);
  await addMember(page, '同伴乙');
  await slot(page, '同伴乙').getByRole('button', { name: '移出队伍', exact: true }).click();
  await expect(occupied).toHaveCount(1);
  await expect(occupied.first()).toHaveAttribute('data-member-ref', memberRef('主角'));
  await expect(dialog.locator('.slot-wrap')).toHaveCount(4);
  await confirm(page).click();
  const result = await readResult(page);
  expect(result).toMatchObject({ party: [{ externalId: '/人物' }] });
  expect(result && typeof result !== 'string' ? result.party.length : 0).toBe(1);
});

test('shadow drag ghost keeps native styling and only accepts the next empty position', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await install(page);
  await chooseBase(page, '同伴乙');
  const dialog = page.getByRole('dialog');
  const empty = dialog.locator('.slot-wrap').nth(3).locator('.slot');
  await expect(empty).toBeDisabled();
  await card(page, '同伴乙').dragTo(empty);
  await expect(dialog.locator('.slot-wrap[data-member-ref]')).toHaveCount(1);
  const source = await card(page, '同伴乙').boundingBox();
  const target = await dialog.locator('.slot-wrap').nth(1).locator('.slot').boundingBox();
  expect(source).toBeTruthy(); expect(target).toBeTruthy();
  const x = target!.x + target!.width / 2, y = target!.y + target!.height / 2;
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down(); await page.mouse.move(x, y, { steps: 6 });
  const ghost = page.locator('.team-drag-ghost');
  await expect(ghost).toBeVisible();
  expect(await ghost.evaluate(el => {
    const css = getComputedStyle(el), r = el.getBoundingClientRect();
    return { shadow: el.getRootNode() instanceof ShadowRoot, position: css.position, pointerEvents: css.pointerEvents, width: r.width, height: r.height, x: r.x, y: r.y };
  })).toMatchObject({ shadow: true, position: 'fixed', pointerEvents: 'none', x: expect.any(Number), y: expect.any(Number) });
  const rect = await ghost.boundingBox();
  expect(rect!.width).toBeLessThan(180); expect(rect!.height).toBeLessThan(220);
  expect(Math.abs(rect!.x - x)).toBeLessThan(180); expect(Math.abs(rect!.y - y)).toBeLessThan(220);
  await page.mouse.up();
  await expect(ghost).toHaveCount(0);
  await expect(dialog.locator('.slot-wrap').nth(1)).toHaveAttribute('data-member-ref', memberRef('同伴乙'));
  // An existing member swaps occupied positions; an empty destination must not
  // advertise a drop that would compact to another position on persistence.
  const from = await slot(page, '主角').locator('.slot').boundingBox();
  const vacant = await dialog.locator('.slot-wrap').nth(2).locator('.slot').boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down(); await page.mouse.move(vacant!.x + vacant!.width / 2, vacant!.y + vacant!.height / 2, { steps: 6 });
  await expect(dialog.locator('.drop-hover')).toHaveCount(0);
  await page.mouse.up();
  await expect(dialog.locator('.slot-wrap').first()).toHaveAttribute('data-member-ref', memberRef('主角'));
});

test('current equipment requires an explicit real weapon binding and renders host text as text', async ({ page }) => {
  await install(page, { weapon: true, companions: false });
  await expect(confirm(page)).toBeDisabled();
  await expect(page.getByRole('dialog').locator('img[src="x"],img[onerror]')).toHaveCount(0);
  await expect(inspect(page).locator('img[src$="/static/hero/character-unknown.webp"]')).toHaveCount(1);
  await configuration(page, '主角').getByRole('combobox', { name: /登记主手武器/ }).selectOption('gw_KnightsSword');
  await confirm(page).click(); await readResult(page);
  const save = await page.evaluate(async () => (await window.partyFixture.service.current()).save!);
  expect(save.partyPreparation!.weaponBindings).toEqual({ '/人物/装备列表/长剑': 'gw_KnightsSword' });
});

test('rereads changed source before confirmation and only returns the updated party after reconfirmation', async ({ page }) => {
  await install(page, { companions: false });
  await page.evaluate(() => { window.partyFixture.state.stat_data.人物.当前生命值 = 50; });
  await confirm(page).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('宿主人物或变量已变化');
  expect(await page.evaluate(() => window.partyFixture.result)).toBe('pending');
  await expect(inspect(page).locator('[title="生命"] b')).toHaveText('55/218');
  await confirm(page).click();
  expect(await readResult(page)).toMatchObject({ party: [{ initialHp: 55 }] });
});

test('invalid selected stats block battle while invalid unselected candidates do not', async ({ page }) => {
  await install(page);
  await page.evaluate(() => { window.partyFixture.state.stat_data.羁绊列表.同伴乙.AC = '14'; });
  await page.getByRole('button', { name: '重新读取宿主' }).click();
  await expect(confirm(page)).toBeEnabled();
  await addMember(page, '同伴乙');
  await expect(confirm(page)).toBeDisabled();
  await expect(configuration(page, '同伴乙')).toContainText('有限');
});

test('cancel leaves draft settings uncommitted, retains acknowledged colors, and Escape restores focus', async ({ page }) => {
  await install(page);
  await (await selectMember(page, '同伴甲')).getByRole('combobox', { name: '初始化同伴颜色' }).selectOption('Red');
  await configuration(page, '同伴甲').getByRole('button', { name: '写入同伴颜色' }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toHaveText('同伴颜色已写入当前聊天。');
  await addMember(page, '同伴甲'); await chooseBase(page, '同伴甲');
  await page.keyboard.press('Escape');
  expect(await readResult(page)).toBeUndefined();
  const save = await page.evaluate(async () => (await window.partyFixture.service.current()).save!);
  expect(save.partyPreparation).toBeUndefined(); expect(save.companionColors.同伴甲).toEqual(['Red']);
  await expect(page.locator('#party-opener')).toBeFocused();
});

test('abort during a pending read removes the dialog and ignores late completion', async ({ page }) => {
  await install(page, { companions: false });
  await page.evaluate(() => {
    const fixture = window.partyFixture; const original = fixture.service.current.bind(fixture.service);
    fixture.service.current = async () => { await new Promise<void>(resolve => { fixture.release = resolve; }); return original(); };
  });
  await page.getByRole('button', { name: '重新读取宿主' }).click();
  await page.evaluate(() => { window.partyFixture.controller.abort(); window.partyFixture.release?.(); });
  expect(await readResult(page)).toBeUndefined();
  await expect(page.locator('[data-st-party-dialog]')).toHaveCount(0);
  await expect(page.locator('#party-opener')).toBeFocused();
});

test('explicitly creates current-chat save and replay uses independent full HP', async ({ page }) => {
  await install(page, { noSave: true, companions: false });
  await expect(confirm(page)).toBeDisabled();
  await page.getByRole('button', { name: '创建当前聊天存档', exact: true }).click();
  await expect(confirm(page)).toBeEnabled();
  await page.getByRole('button', { name: '取消', exact: true }).click(); await readResult(page);
  await page.evaluate(() => window.partyFixture.open('replay'));
  await expect(page.getByRole('dialog')).toHaveAttribute('aria-label', '往昔再现队伍准备');
  await confirm(page).click(); expect(await readResult(page)).toMatchObject({ party: [{ initialHp: 218 }] });
});

test('a switched chat is blocked before persistence', async ({ page }) => {
  await install(page, { companions: false });
  await page.evaluate(() => window.partyFixture.switchChat());
  await confirm(page).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('当前聊天已切换');
  expect(await page.evaluate(() => window.partyFixture.result)).toBe('pending');
  const saves = await page.evaluate(() => window.partyFixture.service.repository.list());
  expect(saves).toHaveLength(1); expect(saves[0]!.partyPreparation).toBeUndefined();
});

test('preserves concurrent unrelated save updates and reloads conflicting preparation settings', async ({ page }) => {
  await install(page, { companions: false });
  await page.evaluate(async () => {
    const service = window.partyFixture.service; const save = (await service.current()).save!;
    await service.repository.update(save.id, save.revision, draft => { draft.balances['currency:gems'] = 17; });
  });
  await confirm(page).click(); await readResult(page);
  expect(await page.evaluate(async () => (await window.partyFixture.service.current()).save!.balances['currency:gems'])).toBe(17);
  await page.evaluate(() => window.partyFixture.open());
  await expect(confirm(page)).toBeEnabled();
  await page.evaluate(async () => {
    const service = window.partyFixture.service; const save = (await service.current()).save!;
    await service.repository.update(save.id, save.revision, draft => { draft.partyPreparation = { memberRefs: ['/人物'], baseAbilities: {}, weaponBindings: { '/人物/装备列表/旧剑': 'gw_KnightsSword' } }; });
  });
  await confirm(page).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('已载入最新设置');
  expect(await page.evaluate(() => window.partyFixture.result)).toBe('pending');
  await confirm(page).click(); await readResult(page);
});

test('a source change during IndexedDB commit is caught by the final host reread', async ({ page }) => {
  await install(page, { companions: false });
  await page.evaluate(() => {
    const fixture = window.partyFixture; const original = fixture.service.repository.update.bind(fixture.service.repository);
    fixture.service.repository.update = async (...args) => {
      const saved = await original(...args);
      fixture.state.stat_data.人物.当前生命值 = 25;
      fixture.service.repository.update = original;
      return saved;
    };
  });
  await confirm(page).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('保存期间宿主人物或变量已变化');
  expect(await page.evaluate(() => window.partyFixture.result)).toBe('pending');
  await confirm(page).click(); expect(await readResult(page)).toMatchObject({ party: [{ initialHp: 27 }] });
});

for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`dialog stays inside viewport and controls remain reachable ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport); await install(page);
    const dialog = page.getByRole('dialog'); const bounds = (await dialog.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0); expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await confirm(page).click(); await readResult(page);
  });
}

test('saved missing members and their learned/base mappings require explicit removal', async ({ page }) => {
  await install(page);
  await page.getByRole('button', { name: '取消', exact: true }).click(); await readResult(page);
  await page.evaluate(async () => {
    const service = window.partyFixture.service; const save = (await service.current()).save!; const learned = save.learnedAbilityIds[0]!;
    await service.repository.update(save.id, save.revision, draft => {
      draft.partyPreparation = { memberRefs: ['/人物', '/羁绊列表/旧名字'], baseAbilities: { '/羁绊列表/旧名字': learned }, weaponBindings: {} };
      draft.equippedAbilities['/羁绊列表/旧名字'] = learned;
    });
    window.partyFixture.open();
  });
  await expect(confirm(page)).toBeDisabled();
  await page.getByRole('button', { name: '移除失效角色' }).click();
  await expect(confirm(page)).toBeDisabled();
  await page.getByRole('button', { name: '清除失效能力设置：旧名字', exact: true }).click();
  await confirm(page).click();
  expect(await readResult(page)).toMatchObject({ party: [{ externalId: '/人物' }] });
  const save = await page.evaluate(async () => (await window.partyFixture.service.current()).save!);
  expect(save.equippedAbilities).toEqual({}); expect(save.partyPreparation!.baseAbilities).toEqual({});
});

test('an already aborted request resolves cancel without mounting UI', async ({ page }) => {
  await install(page, { companions: false });
  await page.evaluate(() => window.partyFixture.controller.abort()); await readResult(page);
  await page.evaluate(() => window.partyFixture.open());
  expect(await readResult(page)).toBeUndefined();
  await expect(page.locator('[data-st-party-dialog]')).toHaveCount(0);
});

test('initialization on a switched chat writes no companion colors', async ({ page }) => {
  await install(page);
  const alpha = await selectMember(page, '同伴甲');
  await alpha.getByRole('combobox', { name: '初始化同伴颜色' }).selectOption('Red');
  await page.evaluate(() => window.partyFixture.switchChat());
  await alpha.getByRole('button', { name: '写入同伴颜色' }).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('当前聊天已切换');
  expect(await page.evaluate(() => window.partyFixture.state.stat_data.羁绊列表.同伴甲.三消)).toBeUndefined();
});

test('host entry without a prepareReplay callback starts directly and resumes the frozen full-health replay', async ({ page }) => {
  await install(page, { companions: false });
  await page.getByRole('button', { name: '取消', exact: true }).click(); await readResult(page);
  await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */path);
    const { recordEncounter, settleSave } = await load('/src/sillytavern/save.ts') as typeof import('../../src/sillytavern/save');
    const { prepareCurrentParty, partyAbilityChoices } = await load('/src/sillytavern/partyPreparation.ts') as typeof import('../../src/sillytavern/partyPreparation');
    const { BATTLE_SCHEMA_VERSION, RULESET_VERSION } = await load('/src/session/contract.ts') as typeof import('../../src/session/contract');
    const { snapshot, save } = await window.partyFixture.service.current();
    const party = prepareCurrentParty(snapshot, { mode: 'replay', save }).party;
    const enemy = { ...structuredClone(party[0]!), externalId: 'enemy', name: '登记敌人' };
    const request: BattleRequest = { schemaVersion: BATTLE_SCHEMA_VERSION, rulesetVersion: RULESET_VERSION, battleId: 'original-story', requestId: 'original-request', seed: 42, playerTeam: party, enemyTeam: [enemy] };
    const result: BattleResult = { schemaVersion: BATTLE_SCHEMA_VERSION, rulesetVersion: RULESET_VERSION, battleId: request.battleId, requestId: request.requestId, seed: 42,
      winner: 'player' as const, turns: 1, combatants: [
        { externalId: party[0]!.externalId, side: 'player' as const, hp: party[0]!.stats.hp, maxHp: party[0]!.stats.hp, armor: party[0]!.stats.armor, defeated: false, statuses: [] },
        { externalId: 'enemy', side: 'enemy' as const, hp: 0, maxHp: enemy.stats.hp, armor: 0, defeated: true, statuses: [] },
      ], defeatedExternalIds: ['enemy'], summonedCount: 0, actionLogDigest: 'fixture-story', eventSummary: [] };
    const ability = partyAbilityChoices()[0]!;
    const encounter = recordEncounter(request, [{ sourceId: 'source', abilityId: ability.abilityId, abilityName: ability.name, rank: 4, enemyExternalId: 'enemy' }], 'normal', 'entry-encounter');
    await window.partyFixture.service.repository.update(save!.id, save!.revision, draft => { settleSave(draft, { kind: 'story', encounter, request, result, events: [] }); });
    const handle = await window.partyFixture.installDefaultHost(); await handle.open();
  });
  const host = page.locator('#st-match3-host-root');
  const before = await page.evaluate(async () => (await window.partyFixture.service.current()).save!);
  expect(before.pendingReplay).toBeUndefined(); expect(before.partyPreparation).toBeUndefined();
  await host.getByRole('tab',{name:'往昔再现',exact:true}).click();
  await host.getByRole('button', { name: '重复挑战', exact: true }).click();
  const preparation = page.getByRole('dialog', { name: '往昔再现队伍准备', exact: true });
  await expect(page.frameLocator('#st-match3-replay-root iframe').locator('.gcard.ally')).toHaveCount(1);
  await expect(preparation).toHaveCount(0);
  const after = await page.evaluate(async () => (await window.partyFixture.service.current()).save!);
  expect(after.partyPreparation).toEqual(before.partyPreparation);
  expect(after.pendingReplay!.request.playerTeam[0]).toMatchObject({ externalId: '/人物', skillId: 'gw_KnightsSword', initialHp: 218 });
  expect(after.pendingReplay!.request.playerTeam[0]!.initialHp).toBe(after.pendingReplay!.request.playerTeam[0]!.stats.hp);
  expect(after.pendingReplay!.request.enemyTeam).toEqual(before.encounters[0]!.enemyTeam);
  expect(after.settlements).toEqual(before.settlements); expect(after.balances).toEqual(before.balances);
  await page.frameLocator('#st-match3-replay-root iframe').locator('body').evaluate(() => {
    const params = new URLSearchParams(location.search);
    parent.postMessage({ channel: 'match3:st-replay:v1', nonce: params.get('nonce'), type: 'cancel' }, location.origin);
  });
  await expect(page.locator('#st-match3-replay-root')).toHaveCount(0);
  expect(await page.evaluate(async () => (await window.partyFixture.service.current()).save!)).toEqual(after);
  await host.getByRole('tab',{name:'存档',exact:true}).click();
  await host.getByRole('button', { name: '重新开始本场', exact: true }).click();
  await expect(page.frameLocator('#st-match3-replay-root iframe').locator('.gcard.ally')).toHaveCount(1);
  await expect(preparation).toHaveCount(0);
  expect(await page.evaluate(async () => (await window.partyFixture.service.current()).save!)).toEqual(after);
});


test('native economic abilities can be equipped while preserving learned progress', async ({ page }) => {
  await install(page);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  const ability = await page.evaluate(async () => {
    const path = '/src/sillytavern/partyPreparation.ts';
    const { partyAbilityChoices, companionMemberRef } = await import(/* @vite-ignore */path) as typeof import('../../src/sillytavern/partyPreparation');
    const choice = partyAbilityChoices().find(row => row.skillId === 'st:7037')!;
    const { service } = window.partyFixture; const { save } = await service.current(); const ref = companionMemberRef('同伴乙');
    await service.repository.update(save!.id, save!.revision, draft => {
      draft.learnedAbilityIds.push(choice.abilityId); draft.equippedAbilities[ref] = choice.abilityId;
      draft.partyPreparation = { memberRefs: ['/人物', ref], baseAbilities: {}, weaponBindings: {} };
    });
    window.partyFixture.open(); return { id: choice.abilityId, ref };
  });
  const member = await selectMember(page, '同伴乙');
  const learnedSelect = member.getByRole('combobox', { name: '装配已学能力', exact: true });
  const selected = learnedSelect.locator('option:checked');
  await expect(learnedSelect).toHaveValue(ability.id);
  await expect(selected).toHaveJSProperty('disabled', false);
  await expect(member).not.toContainText('暂未开放出战');
  await expect(confirm(page)).toBeEnabled();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  const after = await page.evaluate(async () => (await window.partyFixture.service.current()).save!);
  expect(after.learnedAbilityIds).toContain(ability.id); expect(after.equippedAbilities[ability.ref]).toBe(ability.id);
});

test('native economic weapon binding is available', async ({ page }) => {
  await install(page, { weapon: true, companions: false });
  const dialog = page.getByRole('dialog');
  const option = dialog.locator('option[value="gw_SkeletonKey"]');
  await expect(option).toHaveJSProperty('disabled', false);
  await dialog.getByRole('combobox', { name: /登记主手武器/ }).selectOption('gw_SkeletonKey');
  await expect(confirm(page)).toBeEnabled();
});
