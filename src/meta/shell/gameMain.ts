import { backgroundMusic } from '../../audio/BackgroundMusic';
import { musicForScreen } from '../../audio/MusicCatalog';
import { WishlistScreen } from '../screens/wishlistScreen';
/**
 * meta 外壳入口（game.html 唯一脚本）。
 *
 * 职责：初始化网关 → hash 路由挂屏 → 共享 chrome（顶栏/导航/钱包/缩放/图标）
 * → 战斗启动器接管层。屏层自身不 import 彼此，全部经 ctx 导航。
 */
import './styles/style.css';
import './styles/screens.css';
import './styles/extras.css';
import './styles/tutorial.css';
import './styles/battle-loading.css';
import './styles/chest-items.css';

import { initMetaGateway } from '../gateway';
import { heroXpToNext } from '../data/classes';
import { ALL_KINGDOMS_UNLOCK_LEVEL, kingdomsUnlockedAt } from '../data/kingdoms';
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
import { BagScreen } from '../screens/bagScreen';
import { EventShopScreen } from '../screens/eventShopScreen';
import { GemShopScreen, isGemShopParam } from '../screens/gemShopScreen';
import { HuntScreen } from '../screens/huntScreen';
import { WeaponsScreen } from '../screens/weaponsScreen';
import { GiftsScreen } from '../screens/giftsScreen';
import { TutorialGuide } from './tutorial';
import { $, $$, fitStage, mountIcons, toast } from './chrome';
import { BattleLauncher } from './battleLauncher';
import { applyPageCss } from './pageCss';
import type { Screen, ScreenName, ShellCtx } from './screen';
import { applyPlayerPreferences } from '../../preferences/playerPreferences';

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
    refreshMaterialsIndicator();
  },
  launchQuest: (kingdom, node) => launcher.launchQuest(kingdom, node),
  launchExplore: (kingdom, tier) => launcher.launchExplore(kingdom, tier),
  launchArenaBattle: () => launcher.launchArenaBattle(),
  launchEventBattle: (choice) => launcher.launchEventBattle(choice),
  launchInvasionBattle: (mirrorId) => launcher.launchInvasionBattle(mirrorId),
  launchTutorialBattle: () => launcher.launchTutorialBattle(),
  showResult: (detail, meta) => {
    resultScreen.setDetail(detail, meta);
    ctx.navigate('#result');
  },
};

const launcher = new BattleLauncher(battleRoot, ctx);
const resultScreen = new ResultScreen();
const guide = new TutorialGuide(ctx, battleRoot);

const SCREENS: Record<string, Screen> = {
  map: new MapScreen(),
  team: new TeamScreen(),
  troop: new TroopScreen(),
  hero: new HeroScreen(),
  chests: new ChestsScreen(),
  wishlist: new WishlistScreen(),
  arena: new ArenaScreen(),
  events: new EventsScreen(),
  invasion: new InvasionScreen(),
  quest: new QuestScreen(),
  settings: new SettingsScreen(),
  result: resultScreen,
  bag: new BagScreen(),
  shop: new EventShopScreen(),
  gems: new GemShopScreen(),
  weapons: new WeaponsScreen(),
  hunt: new HuntScreen(),
  gifts: new GiftsScreen(),
};

const PAGE_TITLES: Record<string, string> = {
  map: '世 界 地 图',
  team: '部 队 编 成',
  hero: '主 角',
  troop: '部 队 图 鉴',
  chests: '宝 箱',
  wishlist: '愿 望 单',
  arena: '竞 技 场',
  events: '每 周 活 动',
  invasion: '入 侵',
  quest: '王 国 主 线',
  settings: '设 置',
  result: '战 斗 结 算',
  bag: '材 料 库',
  shop: '活 动 商 店',
  gems: '宝 石 商 店',
  weapons: '武 器 中 心',
  hunt: '寻 宝',
  gifts: '馈 赠',
};

/** 路由名 → 底部导航高亮项（result/settings 等无导航页不高亮） */
const NAV_OF: Record<string, string> = {
  map: '地图', team: '队伍', hero: '英雄', troop: '图鉴', chests: '宝箱',
  // 王国主线页是地图的下一层，导航仍高亮「地图」（避免设置页那种"孤儿页"观感）
  wishlist: '宝箱',
  quest: '地图',
  hunt: '地图',
  weapons: '英雄',
  gems: '商店',
  shop: '商店',
};

let current: { name: string; screen: Screen; param?: string } | null = null;

async function render(): Promise<void> {
  const raw = (location.hash || '#map').replace(/^#/, '');
  const [rawName, ...parts] = raw.split('/') as [ScreenName | 'result', ...string[]];
  let name = rawName;
  const param = parts.length ? parts.join('/') : undefined;
  if (name === 'shop' && isGemShopParam(param)) name = 'gems';
  const screen = SCREENS[name] ?? SCREENS['map']!;
  current?.screen.dispose?.();
  applyPageCss(name);
  stage.innerHTML = screen.html(ctx, param);
  screen.mount(ctx, stage, param);
  current = { name, screen, param };
  bindChrome(name);
  if (guide.sync(name, param)) return;
  const musicScene = musicForScreen(name);
  if (musicScene) backgroundMusic.setAmbientScene(musicScene);
}

/** 共享 chrome：图标、缩放、顶栏钱包、玩家徽章、底部导航、设置入口 */
function bindChrome(name: string): void {
  mountIcons(document);
  fitStage();
  $('#pageTitle').textContent = PAGE_TITLES[name] ?? '';
  $$('[data-nav]').forEach((btn) => {
    const label = (btn as HTMLElement).dataset.nav!;
    btn.classList.toggle('active', NAV_OF[name] === label);
    btn.onclick = () => ctx.navigate('#' + ({ 地图: 'map', 队伍: 'team', 英雄: 'hero', 图鉴: 'troop', 宝箱: 'chests', 商店: 'shop' } as Record<string, string>)[label]);
  });
  const settings = $('#settings');
  if (settings) settings.onclick = () => ctx.navigate('#settings');
  const materialsBtn = $('#materialsBtn');
  if (materialsBtn) materialsBtn.onclick = () => ctx.navigate('#bag');
  $('#matVeil')?.remove(); // 兼容旧会话：切屏时清掉已挂载的旧材料弹层
  refreshWallet();
  refreshPlayer();
  refreshMaterialsIndicator();
  // 货币来源说明弹层是地图屏专属；其它屏给轻量 toast
  if (!$('#moneyVeil')) {
    $$('[data-currency]').forEach((btn) => {
      btn.onclick = () => {
        const kind = (btn as HTMLElement).dataset.currency;
        if (kind === 'gem') {
          ctx.navigate('#shop/gems');
          return;
        }
        toast(({ gold: '黄金', soul: '灵魂', gem: '宝石', key: '金钥匙', glory: '荣耀（入侵排位产出）' } as Record<string, string>)[kind ?? ''] + '：来源与去向见世界地图页的钱币说明。');
      };
    });
  }
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
  if ($('#navHint')) $('#navHint').textContent = `Lv.${hero.level} · 王国 ${kingdomsUnlockedAt(hero.level).length}/${ALL_KINGDOMS_UNLOCK_LEVEL}`;
}

function refreshMaterialsIndicator(): void {
  const button = $('#materialsBtn');
  const alert = $('#materialsAlert');
  if (!button || !alert) return;
  const unread = ctx.save().materialsUnread;
  button.classList.toggle('has-new', unread);
  alert.hidden = !unread;
}

async function boot(): Promise<void> {
  applyPlayerPreferences();
  backgroundMusic.start();
  backgroundMusic.setScene('meta');
  const snapshot = await gateway.load();
  window.addEventListener('hashchange', () => void render());
  window.addEventListener('resize', fitStage);
  window.visualViewport?.addEventListener('resize', fitStage);
  await render();
  if (snapshot.warning) toast(snapshot.warning);
}

void boot();
