import type { RegionalPlanArgs } from '../systems/regionalPvp';
/**
 * 战斗启动器：meta 屏 → 出战票 → App 全屏接管 → 结算回接。
 *
 * 出战票（BattleTicket）由权威核心签发并登记为待结算；这里只负责开打，
 * 打完把 BattleResult 交回 `settleBattle`，结算上下文由核心按票据还原。
 * 每场战斗新建一个 App 实例；收到 onBattleDismissed 后结算，待结算页挂载再销毁战斗。
 */
import type { BattleResult } from '@session/index';
import { isFailure, type BattleTicket } from '../gateway';
import { EVENT_TYPES } from '../data/events';
import { exploreNodeLabel, exploreStageLabel } from '../data/kingdoms';
import type { EncounterSource } from '../systems/encounter';
import type { MetaFailure } from '../types';
import type { ShellCtx } from './screen';
import { toast } from './chrome';
import { BattleLoadingScreen } from './battleLoading';

export type { BattleMode } from '../gateway';

/** 加载页标题：战斗来源 + 地点 */
function loadingTitle(ticket: BattleTicket): { title: string; subtitle?: string } {
  if (ticket.mode === 'regional') return { title: ticket.kingdom, subtitle: '永生战域' };
  if (ticket.mode === 'arena') return { title: '竞技场', subtitle: '现开赛对决' };
  if (ticket.mode === 'invasion' && ticket.mirror) return { title: '入侵', subtitle: `对手 · ${ticket.mirror.name}` };
  const source = ticket.source;
  if (!source) return { title: '战斗' };
  if (source.kind === 'quest') {
    return source.tutorial ? { title: '新手试炼', subtitle: ticket.kingdom } : { title: ticket.kingdom, subtitle: `王国任务 · 第 ${source.node} 关` };
  }
  if (source.kind === 'explore') return { title: ticket.kingdom, subtitle: `${exploreNodeLabel(source.tier)} · ${exploreStageLabel(source.stage ?? 0)}` };
  const event = EVENT_TYPES.find((t) => t.id === source.typeId);
  return { title: event?.name ?? '每周活动', subtitle: ticket.kingdom };
}

function sourceLabelOf(source: EncounterSource): string {
  return source.kind === 'quest'
    ? `NORMAL ${source.node}`
    : source.kind === 'event'
      ? '每周活动'
      : `${exploreNodeLabel(source.tier)} · ${exploreStageLabel(source.stage ?? 0)}`;
}

/** Route back to the exact challenge subpage that launched the battle. */
export function encounterReturnHash(source: EncounterSource, kingdom: string): string | undefined {
  if (source.kind === 'explore') return `#explore/${encodeURIComponent(kingdom)}`;
  if (source.kind !== 'event') return undefined;
  return `#events/${source.typeId}${source.typeId === 'raidBoss' && source.choice?.startsWith('ingot:') ? '/forge' : ''}`;
}

export class BattleLauncher {
  private running = false;
  /** 在发出签票/难度保存请求前占位，慢网连点也只接受一次出战。 */
  private launching = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly ctx: ShellCtx,
  ) {}

  /** 任务关出战 */
  async launchQuest(kingdom: string, node: number): Promise<void> {
    await this.launch(() => this.ctx.gateway.planQuestBattle(kingdom, node));
  }

  /** Hard / Very Hard 出战；传入 tier 时先写入存档再开战 */
  async launchExplore(kingdom: string, tier?: number): Promise<void> {
    await this.launch(async () => {
      if (tier != null) {
        const { result } = await this.ctx.gateway.setKingdomExploreTier(kingdom, tier);
        if (isFailure(result)) return result;
      }
      return this.ctx.gateway.planExploreBattle(kingdom);
    });
  }

  /** 竞技场连战出战（对手按 draft seed 计划） */
  async launchArenaBattle(): Promise<void> {
    await this.launch(() => this.ctx.gateway.planArenaBattle());
  }

  /** 当前活动页出战（结算行含该活动积分/里程碑素材）。 */
  async launchEventBattle(choice?: string): Promise<void> {
    const hash = this.ctx.currentHash();
    const typeId = EVENT_TYPES.find((type) => hash === `#events/${type.id}` || hash.startsWith(`#events/${type.id}/`))?.id;
    if (!typeId) {
      toast('请先选择活动');
      return;
    }
    await this.launch(() => this.ctx.gateway.planEventBattle(typeId, choice));
  }

  /** 新手引导试炼战：按起始王国第 1 关结算，结算屏返回世界地图 */
  async launchTutorialBattle(): Promise<void> {
    await this.launch(() => this.ctx.gateway.planTutorialBattle());
  }

  /** 入侵出战（mirrorId = 候选对手） */
  async launchInvasionBattle(mirrorId: string, revenge = false): Promise<void> {
    await this.launch(() => revenge ? this.ctx.gateway.planInvasionRevenge(mirrorId) : this.ctx.gateway.planInvasionBattle(mirrorId));
  }

  async launchRegionalBattle(args: RegionalPlanArgs): Promise<void> {
    await this.launch(() => this.ctx.gateway.planRegionalBattle(args));
  }

  private async launch(request: () => Promise<BattleTicket | MetaFailure>): Promise<void> {
    // 先挡住重复操作，再创建网络请求。仅在 run() 挡住渲染为时已晚：
    // 多发的一次 plan 会在服务端作废正在屏幕上进行的战斗票。
    if (this.launching || this.running) return;
    this.launching = true;
    try {
      // 保留点击手势内请求全屏的时机，不等签票回包。
      enterTouchFullscreen();
      const ticket = await request();
      if (isFailure(ticket)) {
        toast(ticket.message);
        return;
      }
      await this.run(ticket);
    } catch (error: unknown) {
      this.running = false;
      toast('战斗启动失败：' + (error instanceof Error ? error.message : String(error)));
    } finally {
      this.launching = false;
    }
  }

  private async run(ticket: BattleTicket): Promise<void> {
    if (this.running) return;
    this.running = true;

    // 加载页：战斗层代码 + 本场全部资源下载并解码完才进战斗；失败时玩家可重试或返回
    const loading = new BattleLoadingScreen(ticket.request, loadingTitle(ticket));
    const modules = await loading.preload(async () => {
      const [{ App }, { buildMetaRegistry }] = await Promise.all([
        import('@render/App'),
        import('../systems/battleBridge'),
      ]);
      return { App, buildMetaRegistry };
    });
    if (!modules) {
      loading.dispose();
      this.running = false;
      return;
    }
    const { App, buildMetaRegistry } = modules;
    this.root.hidden = false;

    // 注册表是静态数据的纯函数：客户端按请求里的技能 id 自行重建，不走网络
    const registry = buildMetaRegistry(
      [...ticket.request.playerTeam, ...ticket.request.enemyTeam].map((s) => s.skillId as string),
    );
    const app = new App();
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      const result = app.exportResult();
      // Keep the final battle frame covering the old kingdom screen through
      // the network request AND result-screen mounting, not just the request.
      const waiting = typeof document === 'undefined' ? null : document.createElement('div');
      if (waiting) {
        waiting.setAttribute('role', 'status');
        waiting.className = 'battle-settlement-wait';
        waiting.innerHTML = '<style>.battle-settlement-wait{position:absolute;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;gap:12px;background:#080c14b3;color:#f0dfb8;font:16px "Microsoft YaHei",sans-serif}.battle-settlement-wait i{width:22px;height:22px;border:2px solid #f0dfb844;border-top-color:#f0dfb8;border-radius:50%;animation:settlement-spin .8s linear infinite}@keyframes settlement-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.battle-settlement-wait i{animation:none}}</style><i aria-hidden="true"></i><span>正在结算，等待网络中...</span>';
        this.root.appendChild(waiting);
      }
      void this.applyResult(ticket, result).catch((error: unknown) => {
        toast('战斗结算失败：' + (error instanceof Error ? error.message : String(error)));
      }).finally(() => {
        app.destroy();
        waiting?.remove();
        this.root.hidden = true;
        this.running = false;
      });
    };
    app.onBattleDismissed = finish;

    try {
      await app.init(this.root, ticket.request, registry);
      await loading.finish();
    } catch (error: unknown) {
      loading.dispose();
      settled = true;
      app.destroy();
      this.root.hidden = true;
      this.running = false;
      toast('战斗启动失败：' + (error instanceof Error ? error.message : String(error)));
    }
  }

  /** 结算：交回权威核心；按票据来源分派结算屏 */
  private async applyResult(ticket: BattleTicket, result: BattleResult | null): Promise<void> {
    if (!result) return;
    const { result: settlement } = await this.ctx.gateway.settleBattle(result);
    if (isFailure(settlement)) {
      toast(settlement.message);
      const back = ticket.mode === 'regional' ? `#regional/region/${ticket.request.region??'WintersReach'}` : ticket.mode === 'arena' ? '#arena' : ticket.mode === 'invasion' ? '#invasion' : null;
      if (back) this.ctx.navigate(back);
      this.ctx.refresh();
      return;
    }
    if (settlement.kind === 'regional') {
      await this.ctx.showResult(settlement.detail, { kingdom: ticket.kingdom, sourceLabel: settlement.label, returnHash: `#regional/region/${ticket.request.region??'WintersReach'}` });
      return;
    }
    if (settlement.kind === 'arena') {
      await this.ctx.showResult(
        { kind: 'arena', battle: result, settled: settlement.settled },
        { kingdom: '竞技场', sourceLabel: '竞技场', returnHash: '#arena' },
      );
      return;
    }
    if (settlement.kind === 'invasion') {
      await this.ctx.showResult(
        { kind: 'invasion', battle: result, settled: settlement.settled, frenzy: settlement.mirror.frenzy },
        { kingdom: '入侵战', sourceLabel: `入侵 · ${settlement.mirror.name}`, returnHash: '#invasion' },
      );
      return;
    }
    const source = settlement.source;
    await this.ctx.showResult(settlement.detail, {
      kingdom: settlement.kingdom,
      sourceLabel: sourceLabelOf(source),
      returnHash: encounterReturnHash(source, settlement.kingdom),
      shopHash: source.kind === 'event' ? `#shop/${source.typeId}` : undefined,
    });
  }
}

/** 触屏（粗指针）设备上请求整页全屏；已全屏、不支持或被拒绝时什么也不做 */
function enterTouchFullscreen(): void {
  if (typeof document === 'undefined' || document.fullscreenElement) return;
  if (!window.matchMedia?.('(pointer: coarse)').matches) return;
  const root = document.documentElement;
  if (typeof root.requestFullscreen !== 'function') return;
  root.requestFullscreen({ navigationUI: 'hide' }).catch(() => { /* 用户/浏览器拒绝：保持窗口模式 */ });
}
