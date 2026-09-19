/**
 * 战斗启动器：meta 屏 → 出敌计划 → App 全屏接管 → 结算回接。
 *
 * 每场战斗新建一个 App 实例，结算面板点「继续」（onBattleDismissed）后销毁并
 * 归还地图（M2 战斗闭环的屏层接线；战斗内的引擎/演出全部复用现有战斗层）。
 */
import { App } from '@render/App';
import type { BattleResult } from '@session/index';
import { isFailure, todayStartOf, weekStartOf } from '../gateway';
import type { BridgeOutcome } from '../systems/battleBridge';
import type { ArenaBridgeOutcome } from '../systems/arena';
import type { InvasionBridgeOutcome } from '../systems/invasion';
import type { ShellCtx } from './screen';
import { toast } from './chrome';

export type BattleMode = 'quest' | 'explore' | 'arena' | 'event' | 'invasion';

export class BattleLauncher {
  private running = false;

  constructor(
    private readonly root: HTMLElement,
    private readonly ctx: ShellCtx,
  ) {}

  /** 任务关出战 */
  async launchQuest(kingdom: string, node: number): Promise<void> {
    const plan = await this.ctx.gateway.planQuestBattle(kingdom, node);
    if (isFailure(plan)) {
      toast(plan.message);
      return;
    }
    await this.run(plan, 'quest');
  }

  /** 探索出战（档位取存档当前档） */
  async launchExplore(kingdom: string): Promise<void> {
    const plan = await this.ctx.gateway.planExploreBattle(kingdom);
    if (isFailure(plan)) {
      toast(plan.message);
      return;
    }
    await this.run(plan, 'explore');
  }

  /** 竞技场连战出战（对手按 draft seed 计划） */
  async launchArenaBattle(): Promise<void> {
    const plan = await this.ctx.gateway.planArenaBattle();
    if (isFailure(plan)) {
      toast(plan.message);
      return;
    }
    await this.run(plan, 'arena');
  }

  /** 本周活动出战（主题出敌；结算行含活动积分/里程碑素材） */
  async launchEventBattle(): Promise<void> {
    const now = Date.now();
    const plan = await this.ctx.gateway.planEventBattle(now, weekStartOf(now));
    if (isFailure(plan)) {
      toast(plan.message);
      return;
    }
    await this.run(plan, 'event');
  }

  /** 入侵出战（mirrorId = 候选对手） */
  async launchInvasionBattle(mirrorId: string): Promise<void> {
    const now = Date.now();
    const plan = await this.ctx.gateway.planInvasionBattle(mirrorId, now, weekStartOf(now));
    if (isFailure(plan)) {
      toast(plan.message);
      return;
    }
    await this.run(plan, 'invasion');
  }

  private async run(
    plan: BridgeOutcome | ArenaBridgeOutcome | InvasionBridgeOutcome,
    mode: BattleMode,
  ): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.root.hidden = false;

    const app = new App();
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      const result = app.exportResult();
      app.destroy();
      this.root.hidden = true;
      this.running = false;
      void this.applyResult(plan, mode, result);
    };
    app.onBattleDismissed = finish;

    try {
      await app.init(this.root, plan.request);
    } catch (error: unknown) {
      settled = true;
      app.destroy();
      this.root.hidden = true;
      this.running = false;
      toast('战斗启动失败：' + (error instanceof Error ? error.message : String(error)));
    }
  }

  /** 结算分派：任务/探索/活动走 meta 结算屏；竞技场/入侵走各自系统收官 */
  private async applyResult(
    plan: BridgeOutcome | ArenaBridgeOutcome | InvasionBridgeOutcome,
    mode: BattleMode,
    result: BattleResult | null,
  ): Promise<void> {
    if (!result) return;
    const gateway = this.ctx.gateway;
    if (mode === 'arena') {
      const { result: settled } = await gateway.settleArenaBattle(result);
      if (!isFailure(settled)) {
        toast(settled.runOver
          ? settled.victory
            ? `打满 ${settled.wins} 胜！奖励已入账：黄金 +${settled.rewards.gold}${settled.rewards.gems ? `，宝石 +${settled.rewards.gems}` : ''}${settled.rewards.goldKeys ? `，金钥匙 ×${settled.rewards.goldKeys}` : ''}`
            : '本届现开赛结束，按已得胜场发奖。'
          : settled.victory
            ? `胜场 ${settled.wins} / 3，继续连战！`
            : '败北。');
      } else {
        toast(settled.message);
      }
      this.ctx.navigate('#arena');
      this.ctx.refresh();
      return;
    }
    if (mode === 'invasion' && 'mirror' in plan) {
      const now = Date.now();
      const { result: settled } = await gateway.settleInvasionBattle(
        result,
        plan.mirror.id,
        now,
        weekStartOf(now),
        todayStartOf(now),
      );
      if (!isFailure(settled)) {
        const parts = [
          settled.victory ? `VP +${settled.vpDelta}` : `VP ${settled.vpDelta}`,
          `当前 ${settled.vp} 分 · 第 ${settled.placement} 名`,
        ];
        if (settled.glory > 0) parts.push(`荣耀 +${settled.glory}`);
        if (settled.gold > 0) parts.push(`黄金 +${settled.gold}`);
        if (settled.firstWinToday) parts.push('每日首胜！');
        toast(`${settled.victory ? '入侵胜利' : '入侵败北'} · ${parts.join(' · ')}`);
      } else {
        toast(settled.message);
      }
      this.ctx.navigate('#invasion');
      this.ctx.refresh();
      return;
    }
    if (!('plan' in plan)) return;
    const { result: detail } = await gateway.applyBattleSettlement(result, {
      plan: plan.plan,
      enemyByExternalId: plan.enemyByExternalId,
      todayStart: todayStartOf(Date.now()),
    });
    const source = plan.plan.source;
    const sourceLabel = source.kind === 'quest'
      ? `KINGDOM QUEST ${String(source.node).padStart(2, '0')}`
      : source.kind === 'event'
        ? `LIVE EVENT ${source.typeId.toUpperCase()}`
        : `EXPLORE TIER ${source.tier}`;
    this.ctx.showResult(detail, {
      kingdom: plan.plan.kingdom,
      sourceLabel,
      returnHash: source.kind === 'event' ? '#events' : undefined,
    });
  }
}
