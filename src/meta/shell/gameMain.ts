import networkWaitCss from './styles/network-wait.css?inline';
import { mountNetworkIndicator } from './networkIndicator';
import { backgroundMusic } from '../../audio/BackgroundMusic';
import { musicForScreen } from '../../audio/MusicCatalog';
/**
 * meta 外壳入口（game.html 唯一脚本）。
 *
 * 职责：初始化网关 → hash 路由挂屏 → 共享 chrome（顶栏/导航/钱包/缩放/图标）
 * → 战斗启动器接管层。屏层自身不 import 彼此，全部经 ctx 导航。
 */
import gameCss0 from './styles/style.css?inline';
import gameCss1 from './styles/screens.css?inline';
import gameCss2 from './styles/extras.css?inline';
import gameCss3 from './styles/tutorial.css?inline';
import gameCss4 from './styles/battle-loading.css?inline';
import gameCss5 from './styles/chest-items.css?inline';
import gameCss6 from './styles/term-tip.css?inline';
import acquisitionDialogCss from './styles/acquisition-dialog.css?inline';
import { characterName } from '../state/character';
import { setCharacterImage } from './characterImage';

import { initMetaGateway } from '../gateway';
import { heroXpToNext } from '../data/classes';
import { ALL_KINGDOMS_UNLOCK_LEVEL, kingdomsUnlockedAt } from '../data/kingdoms';
import { TutorialGuide } from './tutorial';
import { $, $$, fitStage, mountIcons, toast } from './chrome';
import { BattleLauncher } from './battleLauncher';
import { applyPageCss } from './pageCss';
import type { Screen, ScreenName, ShellCtx } from './screen';
import type { ResultScreen } from '../screens/resultScreen';
import { applyPlayerPreferences } from '../../preferences/playerPreferences';

const SCREEN_LOADERS: Record<string, () => Promise<Screen>> = {
  character: () => import('../screens/characterScreen').then(m => new m.CharacterScreen()),
  map: () => import('../screens/mapScreen').then((m) => new m.MapScreen()),
  team: () => import('../screens/teamScreen').then((m) => new m.TeamScreen()),
  troop: () => import('../screens/troopScreen').then((m) => new m.TroopScreen()),
  classes: () => import('../screens/classesScreen').then(m => new m.ClassesScreen()),
  hero: () => import('../screens/heroScreen').then((m) => new m.HeroScreen()),
  chests: () => import('../screens/chestsScreen').then((m) => new m.ChestsScreen()),
  wishlist: () => import('../screens/wishlistScreen').then((m) => new m.WishlistScreen()),
  arena: () => import('../screens/arenaScreen').then((m) => new m.ArenaScreen()),
  events: () => import('../screens/eventsScreen').then((m) => new m.EventsScreen()),
  regional: () => import('../screens/regionalScreen').then(m => m.regionalScreen),
  invasion: () => import('../screens/invasionScreen').then((m) => new m.InvasionScreen()),
  explore: () => import('../screens/exploreScreen').then((m) => new m.ExploreScreen()),
  quest: () => import('../screens/questScreen').then((m) => new m.QuestScreen()),
  settings: () => import('../screens/settingsScreen').then((m) => new m.SettingsScreen()),
  result: () => import('../screens/resultScreen').then((m) => new m.ResultScreen()),
  bag: () => import('../screens/bagScreen').then((m) => new m.BagScreen()),
  materials: () => import('../screens/materialShopScreen').then(m => new m.MaterialShopScreen()),
  shop: () => import('../screens/eventShopScreen').then((m) => new m.EventShopScreen()),
  gems: () => import('../screens/gemShopScreen').then((m) => new m.GemShopScreen()),
  weapons: () => import('../screens/weaponsScreen').then((m) => new m.WeaponsScreen()),
  hunt: () => import('../screens/huntScreen').then((m) => new m.HuntScreen()),
  gifts: () => import('../screens/giftsScreen').then((m) => new m.GiftsScreen()),
  mail: () => import('../screens/mailScreen').then((m) => new m.MailScreen()),
};

const screenCache = new Map<string, Promise<Screen>>();

function loadScreen(name: string): Promise<Screen> {
  const key = name in SCREEN_LOADERS ? name : 'map';
  let pending = screenCache.get(key);
  if (!pending) {
    pending = SCREEN_LOADERS[key]!();
    screenCache.set(key, pending);
    // 下载失败不缓存失败结果，下次进入该屏重新拉取
    pending.catch(() => screenCache.delete(key));
  }
  return pending;
}

/** 与 gemShopScreen.isGemShopParam 同口径（放在这里避免为判断路由提前下载宝石商店代码） */
function isGemShopParam(param?: string): boolean {
  return (param ?? '').split('/')[0] === 'gems';
}


/** 封面准备模块、存档及首屏；不挂载 DOM、不播放音乐。 */
export async function prepareGame(loginName?: string): Promise<() => Promise<void>> {
  const gateway = initMetaGateway();
  const snapshot = await gateway.load();
  const raw = (location.hash || '#map').slice(1).split('/');
  const initial = !gateway.current().character ? 'character'
    : raw[0] === 'character' ? 'map'
    : raw[0] === 'shop' && isGemShopParam(raw.slice(1).join('/')) ? 'gems' : raw[0]!;
  await loadScreen(initial);
  return () => mountGame(gateway, snapshot, loginName);
}

async function mountGame(gateway: ReturnType<typeof initMetaGateway>, snapshot: Awaited<ReturnType<typeof gateway.load>>, loginName?: string): Promise<void> {
  const style = document.createElement('style');
  style.id = 'meta-global-css';
  style.textContent = gameCss0 + gameCss1 + gameCss2 + gameCss3 + gameCss4 + gameCss5 + gameCss6 + networkWaitCss + acquisitionDialogCss + `
    html, body { min-height: 100dvh; }
    #battle-root { position: fixed; inset: 0; z-index: 50; background: #0e0e16; display: grid; place-items: center;
      box-sizing: border-box; padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }
    #battle-root[hidden] { display: none; }
  `;
  document.head.appendChild(style);
  mountNetworkIndicator();
  const stage = document.getElementById('stage')!;
  const battleRoot = document.getElementById('battle-root')!;

  const ctx: ShellCtx = {
    gateway,
    loginName,
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
      refreshMailIndicator();
    },
    launchQuest: (kingdom, node) => launcher.launchQuest(kingdom, node),
    launchExplore: (kingdom, tier) => launcher.launchExplore(kingdom, tier),
    launchArenaBattle: () => launcher.launchArenaBattle(),
    launchEventBattle: (choice) => launcher.launchEventBattle(choice),
    launchInvasionBattle: (mirrorId, revenge) => launcher.launchInvasionBattle(mirrorId, revenge),
    launchRegionalBattle: (args) => launcher.launchRegionalBattle(args),
    launchTutorialBattle: () => launcher.launchTutorialBattle(),
    showResult: async (detail, meta) => {
      try {
        const screen = await loadScreen('result');
        (screen as ResultScreen).setDetail(detail, meta);
        // Mount underneath the battle cover before the launcher releases it.
        // pushState avoids a second asynchronous hashchange render.
        if (location.hash !== '#result') history.pushState(null, '', '#result');
        await render();
      } catch (error: unknown) {
        toast('结算页加载失败：' + (error instanceof Error ? error.message : String(error)));
      }
    },
  };

  const launcher = new BattleLauncher(battleRoot, ctx);
  const guide = new TutorialGuide(ctx, battleRoot);

  /**
   * 屏层按路由拆包：首次进入某屏才下载它的代码，实例在会话内复用（屏层自身状态不丢）。
   * 封面页的预载清单包含全部拆出的包，进游戏后切屏直接命中缓存。
   */
  const PAGE_TITLES: Record<string, string> = {
    map: '世 界 地 图',
    team: '部 队 编 成',
    hero: '主 角',
    classes: '职 业 圣 殿',
    troop: '部 队 图 鉴',
    chests: '宝 箱',
    wishlist: '愿 望 单',
    arena: '竞 技 场',
    events: '每 周 活 动',
    invasion: '入 侵',
    quest: '王 国 主 线',
    explore: '王 国 探 索',
    settings: '设 置',
    result: '战 斗 结 算',
    bag: '材 料 库',
    materials: '材 料 商 店',
    shop: '活 动 商 店',
    gems: '宝 石 商 店',
    weapons: '武 器 中 心',
    hunt: '寻 宝',
    gifts: '馈 赠',
    mail: '邮 件',
  };

  /** 路由名 → 底部导航高亮项（result/settings 等无导航页不高亮） */
  const NAV_OF: Record<string, string> = {
    map: '地图', team: '队伍', hero: '英雄', troop: '图鉴', chests: '宝箱',
    // 王国主线页是地图的下一层，导航仍高亮「地图」（避免设置页那种"孤儿页"观感）
    wishlist: '宝箱',
    quest: '地图',
    explore: '地图',
    hunt: '地图',
    weapons: '英雄',
    classes: '英雄',
    gems: '商店',
    materials: '商店',
    shop: '商店',
  };

  let current: { name: string; screen: Screen; param?: string } | null = null;
  /** 快速连续切屏时只挂最后一次请求的屏（屏代码是异步下载的） */
  let renderTicket = 0;

  async function render(): Promise<void> {
    const ticket = ++renderTicket;
    const raw = (location.hash || '#map').replace(/^#/, '');
    const [rawName, ...parts] = raw.split('/') as [ScreenName | 'result', ...string[]];
    let name: string = rawName;
    const param = parts.length ? parts.join('/') : undefined;
    if (name === 'shop' && isGemShopParam(param)) name = 'gems';
    if (!ctx.save().character) name = 'character';
    else if (name === 'character') name = 'map';
    if (!(name in SCREEN_LOADERS)) name = 'map';
    let screen: Screen;
    try {
      screen = await loadScreen(name);
    } catch (error) {
      if (ticket === renderTicket) toast('页面加载失败，请检查网络后重试：' + (error instanceof Error ? error.message : String(error)));
      return;
    }
    if (ticket !== renderTicket) return;
    current?.screen.dispose?.();
    applyPageCss(name);
    stage.innerHTML = screen.html(ctx, param);
    screen.mount(ctx, stage, param);
    current = { name, screen, param };
    if (name === 'character') { fitStage(); return; }
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
    const mailBtn = $('#mailBtn');
    if (mailBtn) mailBtn.onclick = () => ctx.navigate('#mail');
    $('#matVeil')?.remove(); // 兼容旧会话：切屏时清掉已挂载的旧材料弹层
    refreshWallet();
    refreshPlayer();
    refreshMaterialsIndicator();
    refreshMailIndicator();
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
    if ($('#playerName')) $('#playerName').textContent = characterName(ctx.save().character);
    const image = document.querySelector<HTMLImageElement>('#playerPortrait');
    if (image) setCharacterImage(image, ctx.save().character);
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

  function refreshMailIndicator(): void {
    const alert = $('#mailAlert');
    if (alert) alert.hidden = !ctx.save().mailbox.items.some(item => item.claimedAt === null);
  }

  async function boot(): Promise<void> {
    applyPlayerPreferences();
    backgroundMusic.start();
    backgroundMusic.setScene('meta');
    window.addEventListener('hashchange', () => void render());
    window.addEventListener('resize', fitStage);
    window.visualViewport?.addEventListener('resize', fitStage);
    await render();
    if (snapshot.warning) toast(snapshot.warning);
    warmScreens();
  }

  /**
   * 首屏挂好后，空闲时逐个把其余屏的代码拉下并实例化（代码包已由封面页预热进缓存），
   * 首次切屏就不用再等下载与模块求值。只加载代码，不预取立绘等条目素材。
   */
  function warmScreens(): void {
    const queue = Object.keys(SCREEN_LOADERS);
    const idle = (cb: () => void): void => {
      const ric = (window as Window & { requestIdleCallback?: (fn: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
      if (ric) ric(cb, { timeout: 2000 });
      else window.setTimeout(cb, 200);
    };
    const next = (): void => {
      const name = queue.shift();
      if (!name) return;
      // 预热失败无妨：真正进入该屏时 loadScreen 会重新拉取并在失败时提示
      void loadScreen(name).catch(() => undefined).finally(() => idle(next));
    };
    idle(next);
  }

  await boot();
}
