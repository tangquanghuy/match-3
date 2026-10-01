import type { RegionalPlanArgs } from '../systems/regionalPvp';
/**
 * 屏层共享上下文与类型。每个屏 = { html, mount }，由 gameMain 的路由挂载。
 */
import type { MetaGateway } from '../gateway';
import type { MetaSave } from '../state/schema';
import type { SettlementDetail } from '../systems/settlement';
import type { ArenaSettleResult } from '../systems/arena';
import type { InvasionSettleResult } from '../systems/invasion';
import type { HuntGrant } from '../systems/treasureHunt';
import type { BattleResult } from '@session/index';

export type PvpSettlementView =
  | {
      kind: 'arena';
      battle: BattleResult;
      settled: ArenaSettleResult;
    }
  | {
      kind: 'invasion';
      battle: BattleResult;
      settled: InvasionSettleResult;
      frenzy: boolean;
    };

/** 已由寻宝网关入账；结算屏只负责展示。 */
export interface HuntSettlementView {
  kind: 'hunt';
  grant: HuntGrant;
  moves: number;
}

export type SettlementView = SettlementDetail | PvpSettlementView | HuntSettlementView;

/** 所有屏名（hash 路由用） */
export type ScreenName =
  | 'character' | 'wishlist' | 'map' | 'team' | 'hero' | 'troop' | 'chests' | 'arena' | 'settings' | 'result'
  | 'materials' | 'events' | 'invasion' | 'shop' | 'weapons' | 'bag' | 'gems' | 'hunt' | 'gifts'
  /** 王国主线页 `#quest/<王国>`（M10） */
  | 'quest' | 'explore' | 'regional' | 'classes';

/** 屏层上下文：网关 + 导航 + 战斗启动。屏层禁止绕过它直接摸路由/战斗层 */
export interface ShellCtx {
  readonly gateway: MetaGateway;
  /** 本次登录的显示名；创建时服务端仍独立校验身份。 */
  readonly loginName?: string;
  /** 当前权威存档（每次变更后重新读，屏层不要长期缓存引用） */
  save(): MetaSave;
  /** hash 导航（'#map' / '#troop/6001' …） */
  navigate(hash: string): void;
  /** 当前 hash（屏内子状态恢复用） */
  currentHash(): string;
  /** 整屏重渲染（网关变更后调用） */
  refresh(): void;
  /**
   * 只刷新共享 chrome（顶栏钱包 / 主角等级与经验条 / 底部提示），不重建屏。
   *
   * UX 阶段 A M-3：屏内花钱或收钱后顶栏数字不动，玩家读成「没扣钱=没生效」
   * 于是连点造成真实多次扣费。凡屏内发生网关写操作，结束时必须调一次。
   */
  refreshChrome(): void;
  /** 启动一场任务关战斗（结算后自动进结算屏） */
  launchQuest(kingdom: string, node: number): Promise<void>;
  /** 启动一场 Hard / Very Hard 战斗 */
  launchExplore(kingdom: string, tier?: number): Promise<void>;
  /** 启动一场竞技场连战（结算走竞技场屏自身） */
  launchArenaBattle(): Promise<void>;
  /** 启动一场本周活动战斗（结算走结算屏，活动积分/里程碑在结算行里） */
  launchEventBattle(choice?: string): Promise<void>;
  /** 启动一场入侵对战（mirrorId = 候选对手 id；结算走入侵屏自身） */
  launchInvasionBattle(mirrorId: string, revenge?: boolean): Promise<void>;
  /** 启动新手引导试炼战（结算后回世界地图） */
  launchTutorialBattle(): Promise<void>;
  launchRegionalBattle?(args: RegionalPlanArgs): Promise<void>;
  /** 展示结算屏（普通战斗带逐行入账，PvP 带战果与加分构成） */
  showResult(
    detail: SettlementView,
    meta: { kingdom: string; sourceLabel: string; returnHash?: string; shopHash?: string },
  ): void | Promise<void>;
}

export interface Screen {
  /** 返回 #stage 的完整 innerHTML（含顶栏/底部导航/toast/弹层） */
  html(ctx: ShellCtx, param?: string): string;
  /** 绑定事件与数据。挂载后外壳会统一 bindChrome（图标/导航/钱包/缩放） */
  mount(ctx: ShellCtx, root: HTMLElement, param?: string): void;
  /** 可选清理（拖拽监听、动画计时器等）。路由切屏时由外壳调用 */
  dispose?(): void;
}
