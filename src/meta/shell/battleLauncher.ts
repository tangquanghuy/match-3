/**
 * 战斗启动器：meta 屏 → 出敌计划 → App 全屏接管 → 结算回接。
 *
 * 每场战斗新建一个 App 实例，结算面板点「继续」（onBattleDismissed）后销毁并
 * 归还地图（M2 战斗闭环的屏层接线；战斗内的引擎/演出全部复用现有战斗层）。
 */
import { App } from '@render/App';
import type { BattleResult } from '@session/index';
import { isFailure, todayStartOf, weekStartOf } from '../gateway';
import { EVENT_TYPES } from '../data/events';
import { exploreNodeLabel } from '../data/kingdoms';
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

  /** Hard / Very Hard 出战；传入 tier 时先写入存档再开战 */
  async launchExplore(kingdom: string, tier?: number): Promise<void> {
    if (tier != null) {
      const { result } = await this.ctx.gateway.setKingdomExploreTier(kingdom, tier);
      if (isFailure(result)) {
        toast(result.message);
        return;
      }
    }
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

  /** 当前活动页出战（结算行含该活动积分/里程碑素材）。 */
  async launchEventBattle(choice?: string): Promise<void> {
    const now = Date.now();
    const typeId = EVENT_TYPES.find((type) => this.ctx.currentHash() === `#events/${type.id}`)?.id;
    if (!typeId) {
      toast('请先选择活动');
      return;
    }
    const plan = await this.ctx.gateway.planEventBattle(now, weekStartOf(now), typeId, choice);
    if (isFailure(plan)) {
      toast(plan.message);
      return;
    }
    await this.run(plan, 'event');
  }

  /** 新手引导试炼战：按起始王国第 1 关结算，结算屏返回世界地图 */
  async launchTutorialBattle(): Promise<void> {
    const plan = await this.ctx.gateway.planTutorialBattle();
    if (isFailure(plan)) {
      toast(plan.message);
      return;
    }
    await this.run(plan, 'quest');
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
      await app.init(this.root, plan.request, plan.registry);
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
        this.ctx.showResult(
          { kind: 'arena', battle: result, settled },
          { kingdom: '竞技场', sourceLabel: '竞技场', returnHash: '#arena' },
        );
      } else {
        toast(settled.message);
        this.ctx.navigate('#arena');
        this.ctx.refresh();
      }
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
        this.ctx.showResult(
          { kind: 'invasion', battle: result, settled, frenzy: plan.mirror.frenzy },
          {
            kingdom: '入侵战',
            sourceLabel: `入侵 · ${plan.mirror.name}`,
            returnHash: '#invasion',
          },
        );
      } else {
        toast(settled.message);
        this.ctx.navigate('#invasion');
        this.ctx.refresh();
      }
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
      ? `NORMAL ${source.node}`
      : source.kind === 'event'
        ? '每周活动'
        : exploreNodeLabel(source.tier);
    this.ctx.showResult(detail, {
      kingdom: plan.plan.kingdom,
      sourceLabel,
      returnHash: source.kind === 'event' ? `#events/${source.typeId}` : undefined,
      shopHash: source.kind === 'event' ? `#shop/${source.typeId}` : undefined,
    });
  }
}
