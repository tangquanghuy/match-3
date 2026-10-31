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

async function install(page: Page, options: { noSave?: boolean; weapon?: boolean; companions?: boolean; gold?: number } = {}) {
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
    const hero = options.gold === undefined ? actor() : { ...actor(), 背包: { 通用币: options.gold, 道具: {} } };
    const state = { stat_data: { 人物: hero, 羁绊列表: bonds } };
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
async function readResult(page: Page) {
  await expect.poll(() => page.evaluate(() => window.partyFixture.result === 'pending')).toBe(false);
  return page.evaluate(() => window.partyFixture.result);
}

test('default protagonist shows real stats and default weapon, persists configuration, and restores focus', async ({ page }) => {
  await install(page, { companions: false });
  await expect(inspect(page).locator('[title="生命"] b')).toHaveText('12/23');
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
  expect(result).toMatchObject({ party: [{ externalId: '/人物', manaColors: ['Blue'], manaCost: 3, skillId: 'gw_KnightsSword', initialHp: 12 }] });
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

test('missing colors are fixed by name and rarity, learned equipment and ordering survive reopening', async ({ page }) => {
  await install(page);
  const alpha = await selectMember(page, '同伴甲');
  // No manual color or base-ability picks: the companion is ready with derived colors and a starter ability.
  await expect(alpha.getByRole('combobox', { name: '初始化同伴颜色' })).toHaveCount(0);
  await expect(alpha.getByRole('combobox', { name: '基础主动能力' })).toHaveCount(0);
  await inspect(page).getByRole('button', { name: '加入队伍', exact: true }).click();
  await expect(confirm(page)).toBeEnabled();
  const derived = await page.evaluate(async () => {
    const path = '/src/sillytavern/partyPreparation.ts';
    const { companionDefaultColors } = await import(/* @vite-ignore */path) as typeof import('../../src/sillytavern/partyPreparation');
    return companionDefaultColors('同伴甲', '普通');
  });
  expect(derived).toHaveLength(1);
  await alpha.getByRole('combobox', { name: '装配已学能力' }).selectOption({ index: 1 });
  await slot(page, '同伴甲').getByRole('button', { name: '上移', exact: true }).click();
  await confirm(page).click();
  expect(await readResult(page)).toMatchObject({ party: [{ externalId: '/羁绊列表/同伴甲', manaColors: derived }, { externalId: '/人物' }] });
  const stored = await page.evaluate(async () => ({ save: (await window.partyFixture.service.current()).save!, bridge: window.partyFixture.state.stat_data.羁绊列表.同伴甲.三消 }));
  // The dialog stays pure; the host persists derived colors when it opens the management page.
  expect(stored.bridge).toBeUndefined();
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
  for (const name of ['同伴乙', '同伴丙', '同伴丁']) await addMember(page, name);
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
  await beta.getByRole('combobox', { name: '装配已学能力', exact: true }).selectOption({ index: 1 });
  const learned = await beta.getByRole('combobox', { name: '装配已学能力', exact: true }).inputValue();
  await selectMember(page, '同伴丙');
  await expect(beta).toHaveCount(0);
  await slot(page, '主角').getByRole('button', { name: '1 号位，主角', exact: true }).click();
  await expect(inspect(page).locator('.inspect-name > b')).toHaveText('主角');
  await expect(dialog.locator('.member-config')).toHaveCount(0);
  await selectMember(page, '同伴乙');
  await expect(beta.getByRole('combobox', { name: '装配已学能力', exact: true })).toHaveValue(learned);
  await inspect(page).getByRole('button', { name: '加入队伍', exact: true }).click();
  await expect(card(page, '同伴乙')).toHaveClass(/\bin\b/);
  await expect(slot(page, '同伴乙')).toHaveCount(1);
  await confirm(page).click();
  expect(await readResult(page)).toMatchObject({ party: [{ externalId: '/人物' }, { externalId: memberRef('同伴乙') }] });
  const save = await page.evaluate(async () => (await window.partyFixture.service.current()).save!);
  expect(save.partyPreparation!.baseAbilities).toEqual({});
  expect(save.equippedAbilities[memberRef('同伴乙')]).toBe(learned);
});

test('native drag assignment and swapping preserve the protagonist and removal leaves one member', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1100 });
  await install(page);
  const dialog = page.getByRole('dialog');
  const occupied = dialog.locator('.slot-wrap[data-member-ref]');
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

test('an unbound main-hand weapon fights with the starter weapon, binding stays optional and host text renders as text', async ({ page }) => {
  await install(page, { weapon: true, companions: false });
  await expect(confirm(page)).toBeEnabled();
  await expect(page.getByRole('dialog').locator('img[src="x"],img[onerror]')).toHaveCount(0);
  await expect(inspect(page).locator('img[src$="/static/hero/character-unknown.webp"]')).toHaveCount(1);
  await expect(inspect(page).locator('.inspect-spell strong')).toHaveText('骑士之剑');
  const config = configuration(page, '主角');
  await expect(config.locator('.weapon-binding')).toContainText('骑士之剑（默认）');
  // The picker follows the original weapon center: card grid, search, detail with the spell.
  await config.getByRole('button', { name: '更换武器', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择主手武器', exact: true });
  await expect(picker).toBeVisible();
  await expect(picker.locator('[data-picker-weapon="gw_KnightsSword"] .weapon-status')).toHaveText('当前');
  await expect(picker.locator('.weapon-card').first().locator('img')).toHaveAttribute('src', /\/static\/weapons\/.+\.webp$/);
  await picker.getByRole('textbox', { name: '搜索武器或法术' }).fill('侦察兵之弓');
  await expect(picker.locator('.weapon-card')).toHaveCount(1);
  await picker.locator('[data-picker-weapon="gw_ScoutsBow"]').click();
  const detail = page.getByRole('dialog', { name: '侦察兵之弓武器详情', exact: true });
  await expect(detail.locator('.detail-copy')).not.toBeEmpty();
  await expect(detail.locator('.detail-copy')).not.toContainText('max(');
  // Tavern stats come from the AIRP character: no stat bonus, affix or acquisition sections.
  await expect(detail.locator('.detail-stats,.detail-affixes,.detail-acquire')).toHaveCount(0);
  await detail.getByRole('button', { name: '登记为主手武器', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(config.locator('.weapon-binding')).toContainText('侦察兵之弓');
  await expect(inspect(page).locator('.inspect-spell strong')).toHaveText('侦察兵之弓');
  await confirm(page).click(); await readResult(page);
  const save = await page.evaluate(async () => (await window.partyFixture.service.current()).save!);
  expect(save.partyPreparation!.weaponBindings).toEqual({ '/人物/装备列表/长剑': 'gw_ScoutsBow' });
});

test('the weapon picker lists weapons with a registered spell, and the default weapon clears the binding', async ({ page }) => {
  await install(page, { weapon: true, companions: false });
  const config = configuration(page, '主角');
  const counts = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */path);
    const { partyWeaponChoices } = await load('/src/sillytavern/partyPreparation.ts');
    const weapons = (await load('/src/data/weapons.json')).default as unknown[];
    return { registered: partyWeaponChoices().length, catalogue: weapons.length };
  });
  // Every listed weapon has a registered spell (currently the whole catalogue).
  expect(counts.registered).toBeGreaterThan(0); expect(counts.registered).toBeLessThanOrEqual(counts.catalogue);
  await config.getByRole('button', { name: '更换武器', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择主手武器', exact: true });
  await expect(picker.locator('.weapons-result-count')).toHaveText(`${counts.registered} / ${counts.registered} 把`);
  await picker.getByRole('textbox', { name: '搜索武器或法术' }).fill('侦察兵之弓');
  await picker.locator('[data-picker-weapon="gw_ScoutsBow"]').click();
  await page.getByRole('dialog', { name: '侦察兵之弓武器详情', exact: true }).getByRole('button', { name: '登记为主手武器', exact: true }).click();
  await config.getByRole('button', { name: '更换武器', exact: true }).click();
  await picker.getByRole('textbox', { name: '搜索武器或法术' }).fill('骑士之剑');
  await picker.locator('[data-picker-weapon="gw_KnightsSword"]').click();
  await page.getByRole('dialog', { name: '骑士之剑武器详情', exact: true }).getByRole('button', { name: '使用默认武器', exact: true }).click();
  await expect(config.locator('.weapon-binding')).toContainText('骑士之剑（默认）');
  // Escape closes the detail first, then the picker.
  await config.getByRole('button', { name: '更换武器', exact: true }).click();
  await picker.locator('.weapon-card').first().click();
  await page.keyboard.press('Escape');
  await expect(picker).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
});

test('rereads changed source before confirmation and only returns the updated party after reconfirmation', async ({ page }) => {
  await install(page, { companions: false });
  await page.evaluate(() => { window.partyFixture.state.stat_data.人物.当前生命值 = 50; });
  await confirm(page).click();
  await expect(page.getByRole('dialog').getByRole('status')).toContainText('宿主人物或变量已变化');
  expect(await page.evaluate(() => window.partyFixture.result)).toBe('pending');
  await expect(inspect(page).locator('[title="生命"] b')).toHaveText('6/23');
  await confirm(page).click();
  expect(await readResult(page)).toMatchObject({ party: [{ initialHp: 6 }] });
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

test('cancel leaves draft settings uncommitted and Escape restores focus', async ({ page }) => {
  await install(page);
  await addMember(page, '同伴甲');
  await configuration(page, '同伴甲').getByRole('combobox', { name: '装配已学能力' }).selectOption({ index: 1 });
  await page.keyboard.press('Escape');
  expect(await readResult(page)).toBeUndefined();
  const save = await page.evaluate(async () => (await window.partyFixture.service.current()).save!);
  expect(save.partyPreparation).toBeUndefined(); expect(save.equippedAbilities).toEqual({});
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
  await confirm(page).click(); expect(await readResult(page)).toMatchObject({ party: [{ initialHp: 23 }] });
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
  await confirm(page).click(); expect(await readResult(page)).toMatchObject({ party: [{ initialHp: 3 }] });
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

test('opening the management page persists fixed colors for travelling companions once', async ({ page }) => {
  await install(page);
  await page.getByRole('button', { name: '取消', exact: true }).click(); await readResult(page);
  const derived = await page.evaluate(async () => {
    const path = '/src/sillytavern/partyPreparation.ts';
    const { companionDefaultColors } = await import(/* @vite-ignore */path) as typeof import('../../src/sillytavern/partyPreparation');
    return companionDefaultColors('同伴甲', '普通');
  });
  const before = await page.evaluate(() => structuredClone(window.partyFixture.state.stat_data.羁绊列表));
  expect(before.同伴甲.三消).toBeUndefined();
  await page.evaluate(async () => { const handle = await window.partyFixture.installDefaultHost(); await handle.open(); });
  await expect.poll(() => page.evaluate(() => window.partyFixture.state.stat_data.羁绊列表.同伴甲.三消?.颜色)).toEqual(derived);
  const after = await page.evaluate(() => structuredClone(window.partyFixture.state.stat_data.羁绊列表));
  // Existing colors and companions who are not travelling stay untouched.
  expect(after.同伴乙.三消).toEqual(before.同伴乙.三消); expect(after.未同行.三消).toEqual(before.未同行.三消);
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
  expect(after.pendingReplay!.request.playerTeam[0]).toMatchObject({ externalId: '/人物', skillId: 'gw_KnightsSword', initialHp: 23 });
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

async function openSkeletonKey(page: Page) {
  await configuration(page, '主角').getByRole('button', { name: '更换武器', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择主手武器', exact: true });
  await picker.getByRole('textbox', { name: '搜索武器或法术' }).fill('骷髅钥匙');
  const card = picker.locator('[data-picker-weapon="gw_SkeletonKey"]');
  return { picker, card, detail: page.getByRole('dialog', { name: '骷髅钥匙武器详情', exact: true }) };
}
const gold = (page: Page) => page.evaluate(() => window.partyFixture.state.stat_data.人物.背包.通用币 as number);
const owned = (page: Page) => page.evaluate(() => window.partyFixture.state.stat_data['三消已购武器'] as string[] | undefined);

test('a paid weapon (神话 骷髅钥匙) is bought with 通用币, then registered and used in battle', async ({ page }) => {
  await install(page, { weapon: true, companions: false, gold: 2_500_000 });
  const { picker, card, detail } = await openSkeletonKey(page);
  await expect(picker.locator('.weapon-shop-balance')).toHaveText('通用币 2,500,000');
  await expect(card).toHaveClass(/is-locked/);
  await expect(card.locator('.weapon-status')).toHaveText('200万');
  await card.click();
  await expect(detail.locator('.weapon-shop-price')).toHaveText('售价 200万 通用币 · 当前持有 250万');
  await expect(detail.getByRole('button', { name: '登记为主手武器', exact: true })).toHaveCount(0);
  await detail.getByRole('button', { name: '购买（200万 通用币）', exact: true }).click();
  // One more confirmation before spending; cancelling spends nothing.
  await detail.getByRole('button', { name: '取消', exact: true }).click();
  expect(await gold(page)).toBe(2_500_000);
  await detail.getByRole('button', { name: '购买（200万 通用币）', exact: true }).click();
  await detail.getByRole('button', { name: '确认花费 200万 通用币', exact: true }).click();
  await expect(detail.getByRole('status')).toHaveText('购买成功，可以登记为主手武器。');
  expect(await gold(page)).toBe(500_000);
  expect(await owned(page)).toEqual(['gw_SkeletonKey']);
  await expect(picker.locator('.weapon-shop-balance')).toHaveText('通用币 500,000');
  await detail.getByRole('button', { name: '登记为主手武器', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(configuration(page, '主角').locator('.weapon-binding')).toContainText('骷髅钥匙');
  await confirm(page).click();
  expect(await readResult(page)).toMatchObject({ party: [{ externalId: '/人物', skillId: 'gw_SkeletonKey' }] });
});

test('weapon purchase: not enough 通用币, changed variables and an unbought binding', async ({ page }) => {
  await install(page, { weapon: true, companions: false, gold: 1_999_999 });
  let view = await openSkeletonKey(page);
  await view.card.click();
  await expect(view.detail.getByRole('button', { name: '通用币不足', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await expect(view.picker).toHaveCount(0);

  // The AI changed the floor after the panel read it: rejected without spending, then retried.
  await page.evaluate(() => { const s = window.partyFixture.state.stat_data; s.人物.背包.通用币 = 2_000_000; s.人物.当前生命值 = 60; });
  view = await openSkeletonKey(page);
  await view.card.click();
  await expect(view.detail.getByRole('button', { name: '通用币不足', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '重新读取宿主' }).click();
  view = await openSkeletonKey(page);
  await view.card.click();
  await page.evaluate(() => { window.partyFixture.state.stat_data.人物.当前生命值 = 70; });
  await view.detail.getByRole('button', { name: '购买（200万 通用币）', exact: true }).click();
  await view.detail.getByRole('button', { name: '确认花费 200万 通用币', exact: true }).click();
  await expect(view.detail.getByRole('status')).toContainText('已变化');
  expect(await gold(page)).toBe(2_000_000); expect(await owned(page)).toBeUndefined();
  await view.detail.getByRole('button', { name: '购买（200万 通用币）', exact: true }).click();
  await view.detail.getByRole('button', { name: '确认花费 200万 通用币', exact: true }).click();
  await expect(view.detail.getByRole('status')).toHaveText('购买成功，可以登记为主手武器。');
  expect(await gold(page)).toBe(0);

  // Rolling the floor back (regenerate) removes money and ownership together: the binding stays
  // in the save but fights as the starter weapon until bought again.
  await view.detail.getByRole('button', { name: '登记为主手武器', exact: true }).click();
  await page.evaluate(() => { const s = window.partyFixture.state.stat_data; delete s['三消已购武器']; s.人物.背包.通用币 = 2_000_000; });
  await page.getByRole('button', { name: '重新读取宿主' }).click();
  await expect(configuration(page, '主角').locator('.weapon-binding')).toContainText('骷髅钥匙（未购买，出战使用骑士之剑）');
  await confirm(page).click();
  expect(await readResult(page)).toMatchObject({ party: [{ externalId: '/人物', skillId: 'gw_KnightsSword' }] });
});

/** Chinese IME through Chrome DevTools: pinyin is composed key by key, then the characters are committed. */
async function typeWithIme(page: Page, input: import('@playwright/test').Locator, pinyin: string, text: string) {
  await input.click();
  const cdp = await page.context().newCDPSession(page);
  for (let i = 1; i <= pinyin.length; i++) {
    const part = pinyin.slice(0, i);
    await cdp.send('Input.imeSetComposition', { text: part, selectionStart: part.length, selectionEnd: part.length });
  }
  await cdp.send('Input.insertText', { text });
  await cdp.detach();
}

test('Chinese IME input works in the weapon picker and roster searches', async ({ page }) => {
  await install(page, { weapon: true });
  await configuration(page, '主角').getByRole('button', { name: '更换武器', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择主手武器', exact: true });
  const weaponSearch = picker.getByRole('textbox', { name: '搜索武器或法术' });
  await typeWithIme(page, weaponSearch, 'kulou', '骷髅');
  await expect(weaponSearch).toHaveValue('骷髅');
  await expect(picker.locator('[data-picker-weapon="gw_SkeletonKey"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(picker).toHaveCount(0);
  const roster = page.getByRole('dialog').locator('#searchInput');
  await typeWithIme(page, roster, 'tongban', '同伴');
  await expect(page.getByRole('dialog').locator('#searchInput')).toHaveValue('同伴');
  await expect(card(page, '同伴乙')).toBeVisible();
  await expect(card(page, '主角')).toHaveCount(0);
});

test('weapon picker filters owned and unowned weapons', async ({ page }) => {
  await install(page, { weapon: true, companions: false, gold: 0 });
  await configuration(page, '主角').getByRole('button', { name: '更换武器', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择主手武器', exact: true });
  const ownership = picker.getByRole('combobox', { name: '拥有状态', exact: true });
  // 普通/精良/稀有 are open: 51 owned, 667 for sale.
  await ownership.selectOption('owned');
  await expect(picker.locator('.weapons-result-count')).toHaveText('51 / 718 把');
  await expect(picker.locator('.weapon-card.is-locked')).toHaveCount(0);
  await ownership.selectOption('unowned');
  await expect(picker.locator('.weapons-result-count')).toHaveText('667 / 718 把');
  await expect(picker.locator('[data-picker-weapon="gw_KnightsSword"]')).toHaveCount(0);
  await picker.getByRole('button', { name: '清除全部', exact: true }).click();
  await expect(picker.locator('.weapons-result-count')).toHaveText('718 / 718 把');
});
