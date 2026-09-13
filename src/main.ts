import { App, readTeamSize } from './render/App';
import { HostStatusBanner } from './render/hostStatusBanner';
import { skillLibraryIds } from '@engine/skills/library';
import { implementedTraitIds } from '@engine/traits';
import { knownTroopTypes as knownTroopTypesOf } from './data/troops';
import {
  PostMessageHostBridge,
  StandaloneHostBridge,
  windowMessagePort,
} from '@session/index';
import type { BattleRequest, HostBridge } from '@session/index';

const MIN_LANDSCAPE_WIDTH = 667;
const MIN_LANDSCAPE_HEIGHT = 375;

const mount = document.getElementById('app');
const gate = document.getElementById('orientation-gate');

/**
 * 宿主 origin 白名单，来自构建期环境变量 `VITE_HOST_ORIGINS`（逗号分隔）。
 * 未配置时不启用 postMessage 桥——宁可退回独立模式，也不接受任意来源的战斗数据。
 * 开发模式下允许回落到本页 origin，供 iframe 联调页使用。
 */
function hostOrigins(): string[] {
  const configured = (import.meta.env.VITE_HOST_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '' && s !== '*');
  if (configured.length > 0) return configured;
  if (import.meta.env.DEV) {
    console.warn('[host] 未配置 VITE_HOST_ORIGINS，开发模式下仅允许本页 origin');
    return [window.location.origin];
  }
  return [];
}

/** 选择宿主桥：嵌在 iframe 且有白名单时走 postMessage，否则独立模式读本地配置。 */
function createBridge(): { bridge: HostBridge; kind: 'postMessage' | 'standalone' } {
  const knownSkillIds = new Set(skillLibraryIds());
  // 特质系统已上线：宿主可以下发已实现的 trait code，未实现的仍会被校验拒绝
  const knownTraitIds = new Set(implementedTraitIds());
  // 种族用于族亲光环，取值域直接从兵种数据派生
  const knownTroopTypes = knownTroopTypesOf();
  const embedded = window.parent !== window;
  const origins = hostOrigins();
  if (embedded && origins.length > 0) {
    return {
      bridge: new PostMessageHostBridge({
        allowedOrigins: origins,
        port: windowMessagePort(),
        knownSkillIds,
        knownTraitIds,
        knownTroopTypes,
      }),
      kind: 'postMessage',
    };
  }
  return {
    bridge: new StandaloneHostBridge({ knownSkillIds, knownTraitIds, knownTroopTypes, teamSize: readTeamSize() }),
    kind: 'standalone',
  };
}

if (mount && gate) {
  const app = new App();
  (window as unknown as { __app: App }).__app = app; // TEMP: 验证与 E2E 调试入口
  const status = new HostStatusBanner();
  const { bridge, kind: bridgeKind } = createBridge();
  (window as unknown as { __hostBridge: HostBridge }).__hostBridge = bridge; // E2E 调试入口

  let initPromise: Promise<void> | null = null;
  let initialized = false;
  let frame = 0;

  // 结果投递状态 → 顶部提示。宿主未确认前必须让用户看得见，别让人以为已经交完了。
  bridge.onDeliveryStateChange((state) => {
    if (state.phase === 'pending') {
      status.show(`正在向宿主提交战斗结果…（第 ${state.attempt}/${state.maxAttempts} 次）`, 'pending');
    } else if (state.phase === 'failed') {
      status.show(`战斗结果未被宿主确认：${state.error.message}。请勿关闭页面。`, 'error');
    } else if (state.phase === 'acknowledged') {
      status.show('战斗结果已提交', 'info');
      window.setTimeout(() => status.hide(), 2400);
    }
  });

  // 结果未确认时拦一下关闭，避免战果丢失
  window.addEventListener('beforeunload', (event) => {
    if (bridge instanceof PostMessageHostBridge && bridge.hasUnacknowledgedResult()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  app.onBattleFinished = (result) => {
    void bridge.submitResult(result).catch((error: unknown) => {
      console.error('结果提交失败:', error);
    });
  };

  /**
   * 立刻向宿主宣告就绪并等待快照——不等旋转到横屏。
   * 竖屏只是本端不能开打，没理由让宿主一直等。
   */
  let requestPromise: Promise<BattleRequest> | null = null;
  const battleRequest = (): Promise<BattleRequest> => {
    requestPromise ??= bridge.waitForBattle();
    return requestPromise;
  };
  if (bridgeKind === 'postMessage') {
    status.show('等待宿主下发战斗数据…', 'info');
    void battleRequest().then(() => status.hide());
  }
  void battleRequest().catch((error: unknown) => {
    // 本地配置不合法属于开发期错误，直接摆在门禁上
    const message = error instanceof Error ? error.message : String(error);
    console.error('获取战斗数据失败:', error);
    bridge.reportError({ code: 'invalid-request', message });
    status.show(`获取战斗数据失败：${message}`, 'error');
  });

  const viewportSize = () => {
    const viewport = window.visualViewport;
    return {
      width: Math.round(viewport?.width ?? window.innerWidth),
      height: Math.round(viewport?.height ?? window.innerHeight),
    };
  };

  const updateViewport = () => {
    frame = 0;
    const { width, height } = viewportSize();
    const portrait = width <= height;
    const tooSmall = !portrait
      && (width < MIN_LANDSCAPE_WIDTH || height < MIN_LANDSCAPE_HEIGHT);
    const blocked = portrait || tooSmall;
    mount.dataset.viewportBlocked = String(blocked);

    const title = gate.querySelector('strong');
    const detail = gate.querySelector('span');
    if (title && detail) {
      title.textContent = portrait ? '请将设备旋转为横屏' : '当前屏幕空间不足';
      detail.textContent = portrait
        ? '战斗仅支持横屏显示，以保证棋盘和触控区域清晰可用。'
        : `最低需要 ${MIN_LANDSCAPE_WIDTH}×${MIN_LANDSCAPE_HEIGHT} 的横屏可视区域。`;
    }

    if (!blocked && !initPromise && !initialized) {
      initPromise = battleRequest()
        .then((request) => app.init(mount, request))
        .then(() => {
          initialized = true;
          app.setOrientationBlocked(false);
          app.refreshLayout();
          bridge.notifyStarted({
            battleId: app.getBattleRequest().battleId,
            requestId: app.getBattleRequest().requestId,
            rulesetVersion: app.getBattleRequest().rulesetVersion,
            startedAt: new Date().toISOString(),
          });
        })
        .catch((err: unknown) => {
          console.error('初始化失败:', err);
          gate.querySelector('strong')!.textContent = '初始化失败';
          gate.querySelector('span')!.textContent = '请刷新页面或查看控制台错误信息。';
          mount.dataset.viewportBlocked = 'true';
          bridge.reportError({
            code: 'internal',
            message: err instanceof Error ? err.message : String(err),
          });
        });
    } else if (initialized) {
      app.setOrientationBlocked(blocked);
      if (!blocked) app.refreshLayout();
    }
  };

  const scheduleViewportUpdate = () => {
    if (frame !== 0) return;
    frame = window.requestAnimationFrame(updateViewport);
  };

  window.addEventListener('resize', scheduleViewportUpdate);
  window.visualViewport?.addEventListener('resize', scheduleViewportUpdate);
  window.visualViewport?.addEventListener('scroll', scheduleViewportUpdate);
  screen.orientation?.addEventListener('change', scheduleViewportUpdate);
  new ResizeObserver(scheduleViewportUpdate).observe(mount);
  updateViewport();
}
