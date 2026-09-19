/**
 * meta 外壳入口（game.html 唯一脚本）。
 *
 * 职责：初始化网关 → hash 路由挂屏 → 共享 chrome（顶栏/导航/钱包/缩放/图标）
 * → 战斗启动器接管层。屏层自身不 import 彼此，全部经 ctx 导航。
 */
import './styles/style.css';
import './styles/screens.css';
import './styles/extras.css';

import { initMetaGateway } from '../gateway';
import { heroXpToNext } from '../data/classes';
import { INGOT_KEYS, INGOT_NAMES, STONE_COLORS, type IngotKey } from '../data/materials';
import { MapScreen } from '../screens/mapScreen';
import { TeamScreen } from '../screens/teamScreen';
import { TroopScreen } from '../screens/troopScreen';
import { HeroScreen } from '../screens/heroScreen';
import { ChestsScreen } from '../screens/chestsScreen';
import { ArenaScreen } from '../screens/arenaScreen';
import { EventsScreen } from '../screens/eventsScreen';
import { QuestScreen } from '../screens/questScreen';
import { InvasionScreen } from '../screens/invasionScreen';
import { ResultScreen } from '../screens/resultScreen';
import { SettingsScreen } from '../screens/settingsScreen';
import { $, $$, fitStage, mountIcons, toast } from './chrome';
import { BattleLauncher } from './battleLauncher';
import { applyPageCss } from './pageCss';
import type { Screen, ScreenName, ShellCtx } from './screen';

const stage = document.getElementById('stage')!;
const battleRoot = document.getElementById('battle-root')!;

const gateway = initMetaGateway();

const ctx: ShellCtx = {
  gateway,
  save: () => gateway.current(),
  navigate: (hash: string) => {
    if (location.hash === hash) void render();
    else location.hash = hash;
  },
  currentHash: () => location.hash || '#map',
  refresh: () => void render(),
  // M-3：屏层在网关写操作后同步顶栏（不重建屏，避免弹层被关掉）
  refreshChrome: () => {
    refreshWallet();
    refreshPlayer();
  },
  launchQuest: (kingdom, node) => launcher.launchQuest(kingdom, node),
  launchExplore: (kingdom) => launcher.launchExplore(kingdom),
  launchArenaBattle: () => launcher.launchArenaBattle(),
  launchEventBattle: () => launcher.launchEventBattle(),
  launchInvasionBattle: (mirrorId) => launcher.launchInvasionBattle(mirrorId),
  showResult: (detail, meta) => {
    resultScreen.setDetail(detail, meta);
    ctx.navigate('#result');
  },
};

const launcher = new BattleLauncher(battleRoot, ctx);
const resultScreen = new ResultScreen();

const SCREENS: Record<string, Screen> = {
  map: new MapScreen(),
  team: new TeamScreen(),
  troop: new TroopScreen(),
  hero: new HeroScreen(),
  chests: new ChestsScreen(),
  arena: new ArenaScreen(),
  events: new EventsScreen(),
  invasion: new InvasionScreen(),
  quest: new QuestScreen(),
  settings: new SettingsScreen(),
  result: resultScreen,
};

const PAGE_TITLES: Record<string, string> = {
  map: '世 界 地 图',
  team: '部 队 编 成',
  hero: '主 角',
  troop: '部 队 图 鉴',
  chests: '宝 箱',
  arena: '竞 技 场',
  events: '每 周 活 动',
  invasion: '入 侵',
  quest: '王 国 主 线',
  settings: '设 置',
  result: '战 斗 结 算',
};

/** 路由名 → 底部导航高亮项（result/settings 等无导航页不高亮） */
const NAV_OF: Record<string, string> = {
  map: '地图', team: '队伍', hero: '英雄', troop: '图鉴', chests: '宝箱',
  // 王国主线页是地图的下一层，导航仍高亮「地图」（避免设置页那种"孤儿页"观感）
  quest: '地图',
};

let current: { name: string; screen: Screen; param?: string } | null = null;

async function render(): Promise<void> {
  const raw = (location.hash || '#map').replace(/^#/, '');
  const [name, param] = raw.split('/') as [ScreenName | 'result', string | undefined];
  const screen = SCREENS[name] ?? SCREENS['map']!;
  current?.screen.dispose?.();
  applyPageCss(name);
  stage.innerHTML = screen.html(ctx, param);
  screen.mount(ctx, stage, param);
  current = { name, screen, param };
  bindChrome(name);
}

/** 共享 chrome：图标、缩放、顶栏钱包、玩家徽章、底部导航、设置入口 */
function bindChrome(name: string): void {
  mountIcons(document);
  fitStage();
  $('#pageTitle').textContent = PAGE_TITLES[name] ?? '';
  $$('[data-nav]').forEach((btn) => {
    const label = (btn as HTMLElement).dataset.nav!;
    btn.classList.toggle('active', NAV_OF[name] === label);
    btn.onclick = () => ctx.navigate('#' + ({ 地图: 'map', 队伍: 'team', 英雄: 'hero', 图鉴: 'troop', 宝箱: 'chests' } as Record<string, string>)[label]);
  });
  const settings = $('#settings');
  if (settings) settings.onclick = () => ctx.navigate('#settings');
  const materialsBtn = $('#materialsBtn');
  if (materialsBtn) materialsBtn.onclick = () => openMaterialsVeil();
  $('#matVeil')?.remove(); // 切屏时清掉旧弹层（挂 body，不随 stage 重置）
  refreshWallet();
  refreshPlayer();
  // 货币来源说明弹层是地图屏专属；其它屏给轻量 toast
  if (!$('#moneyVeil')) {
    $$('[data-currency]').forEach((btn) => {
      btn.onclick = () => {
        const kind = (btn as HTMLElement).dataset.currency;
        toast(({ gold: '黄金', soul: '灵魂', gem: '宝石', key: '金钥匙', glory: '荣耀（入侵 PvP 产出）' } as Record<string, string>)[kind ?? ''] + '：来源与去向见世界地图页的钱币说明。');
      };
    });
  }
}


/** 材料库弹层（素材批 2026-09-19）：钢锭/符卷/特质石全库存一览，顶栏背包按钮打开 */
const STONE_COLOR_HEX: Record<string, string> = {
  blue: '#4f8fd0', green: '#4fb06d', red: '#d04f5f',
  yellow: '#e6c84c', purple: '#9a6fd0', brown: '#9e7c4b',
};

function openMaterialsVeil(): void {
  $('#matVeil')?.remove();
  const m = ctx.save().materials;
  const ingots = INGOT_KEYS.map(
    (k) => `<div class="mat-item"><b>${m.ingots[k] ?? 0}</b><small>${INGOT_NAMES[k as IngotKey]}</small></div>`,
  ).join('');
  const stoneRow = (tier: string): string =>
    STONE_COLORS.map(
      (c) => {
        const key = `${tier}:${c.key}`;
        const n = m.traitstones[key] ?? 0;
        return `<div class="mat-item${n === 0 ? ' empty' : ''}"><b>${n}</b><small><i style="background:${STONE_COLOR_HEX[c.key]}"></i>${c.name}${tier === 'minor' ? '初' : tier === 'major' ? '高' : '符'}</small></div>`;
      },
    ).join('');
  const celestial = m.traitstones.celestial ?? 0;
  const veil = document.createElement('div');
  veil.id = 'matVeil';
  veil.innerHTML = `
    <div class="mat-veil-backdrop" data-mat-close></div>
    <section class="mat-sheet" role="dialog" aria-modal="true" aria-label="材料库">
      <header class="mat-head">
        <div><small>MATERIALS</small><h2>材料库</h2></div>
        <button class="mat-close" type="button" aria-label="关闭" data-mat-close>×</button>
      </header>
      <div class="mat-body">
        <section class="mat-group">
          <h3><small>INGOTS · 淬炼武器</small>钢锭</h3>
          <div class="mat-grid wide">${ingots}</div>
          <p class="mat-hint">来源：每周活动（突袭首领/阵营突袭）、探索掉落、荣耀赛季奖励；去向：英雄页武器淬炼。</p>
        </section>
        <section class="mat-group">
          <h3><small>FORGE SCROLLS · Doomed 武器</small>熔铸符卷</h3>
          <div class="mat-grid"><div class="mat-item${m.forgeScrolls === 0 ? ' empty' : ''}"><b>${m.forgeScrolls}</b><small>熔铸符卷</small></div></div>
          <p class="mat-hint">来源：末日之塔/突袭首领周；Doomed 系武器淬炼每级消耗 1 卷。</p>
        </section>
        <section class="mat-group">
          <h3><small>TRAITSTONES · 解锁部队特质</small>特质石</h3>
          <div class="mat-tier"><small>初级</small><div class="mat-grid">${stoneRow('minor')}</div></div>
          <div class="mat-tier"><small>高级</small><div class="mat-grid">${stoneRow('major')}</div></div>
          <div class="mat-tier"><small>符文</small><div class="mat-grid">${stoneRow('runic')}</div></div>
          <div class="mat-tier"><small>万能</small><div class="mat-grid"><div class="mat-item${celestial === 0 ? ' empty' : ''}"><b>${celestial}</b><small>圣辉石（无色万能）</small></div></div></div>
          <p class="mat-hint">颜色 = 部队主色（水/自然/火/风/魔法/土）；来源：活动周/探索/荣耀箱；消耗：图鉴页特质解锁。</p>
        </section>
      </div>
    </section>`;
  document.body.appendChild(veil);
  veil.querySelectorAll('[data-mat-close]').forEach((el) =>
    el.addEventListener('click', () => veil.remove()),
  );
}

function refreshWallet(): void {
  const c = ctx.save().currencies;
  const fmt = (n: number): string => n.toLocaleString('en-US');
  if ($('#goldBalance')) $('#goldBalance').textContent = fmt(c.gold);
  if ($('#soulBalance')) $('#soulBalance').textContent = fmt(c.souls);
  if ($('#gemBalance')) $('#gemBalance').textContent = fmt(c.gems);
  if ($('#keyBalance')) $('#keyBalance').textContent = fmt(c.goldKeys);
  if ($('#gloryBalance')) $('#gloryBalance').textContent = fmt(c.glory);
}

function refreshPlayer(): void {
  const hero = ctx.save().hero;
  if ($('#playerLevel')) $('#playerLevel').textContent = `Lv.${hero.level}`;
  const next = heroXpToNext(hero.level);
  if ($('#playerXpFill')) $('#playerXpFill').style.width = `${Math.min(100, (hero.xp / next) * 100)}%`;
  if ($('#navHint')) $('#navHint').textContent = `Lv.${hero.level} · 42 王国`;
}

async function boot(): Promise<void> {
  const snapshot = await gateway.load();
  window.addEventListener('hashchange', () => void render());
  window.addEventListener('resize', fitStage);
  window.visualViewport?.addEventListener('resize', fitStage);
  await render();
  if (snapshot.warning) toast(snapshot.warning);
}

void boot();
