import type { NarrationPlan } from './BattleNarrator';
import { Container } from 'pixi.js';
import { gsap } from 'gsap';
import type { GameEvent } from '@engine/events';
import { computeClearEventBatches, mergeClearBatch } from './clearEventBatches';
import { computeImpactWindows, computeSynchronizedSingles, isBoardPlaybackEvent, isCardPlaybackEvent } from './impactPlayback';
import { computeEliminationWaves, computeBuffPlaybackBatches, computeDefeatPlaybackBatches, computeSplashPlaybackSlots } from './presentationBatches';
import type { BuffPlaybackBatch, DefeatPlaybackBatch } from './presentationBatches';
import { computeStatusPlaybackBatches } from './statusPlayback';
import type { StatusPlaybackBatch } from './statusPlayback';
import type { ImpactPresentation } from './impactPlayback';
import type { ClearEvent } from './clearEventBatches';
import { computeManaPlaybackBatches, computeManaSources, manaFlowDuration } from './manaPlayback';
import type { ManaOriginRef, ManaPlaybackBatch } from './manaPlayback';
import { DOOMSKULL_BONUS_DAMAGE, UBER_DOOMSKULL_BONUS_DAMAGE } from '@engine/types';
import type { CellPos, PlayerSide } from '@engine/types';
import { BoardView } from './BoardView';
import { FXLayer, screenShake } from './FXLayer';
import { AnimConfig, fallDuration } from './AnimationConfig';
import { FramePlaybackClock } from './FramePlaybackClock';
import { colorOf } from './GemSprite';
import type { GemSprite } from './GemSprite';
import type { AudioManager } from './AudioManager';
import { buildReshufflePlan, gatherPointAt, gatherRotationAt, gatherScaleAt, scatterPoseAt } from './reshufflePlan';
import type { ReshufflePlanItem } from './reshufflePlan';
import {
  RESHUFFLE_SCATTER_WINDOW,
  RESHUFFLE_TIMING,
} from './reshufflePlan';
import { castCutInReserveSeconds } from './CastCutIn';

type BoardPoint = { x: number; y: number };

/**
 * 召唤演出的时间线占位（秒），按 summon 事件的 destination 查表。
 * field → 棋盘上播 0011 召唤法阵（summon_rune）；queue → 仅入队，无棋盘演出。
 * 新增召唤演出路径时在此加键，勿再硬编码单个特效的时长。
 * （frameFX 时长为毫秒，GSAP 用秒。）
 */
/** status-blocked 提示的时间线占位（光圈 + 飘字的可读窗口；按目标并行，不串行拖慢）。 */
const STATUS_BLOCKED_HOLD_SECONDS = 0.3;

const SUMMON_HOLD_SECONDS: Record<Extract<GameEvent, { type: 'summon' }>['destination'], number> = {
  field: AnimConfig.frameFX.summon_rune.duration / 1000,
  queue: 0.08,
};

/**
 * 事件流播放器（需求 18, 23, 25）。
 * 把引擎产出的事件流编排为 GSAP 时间线，按因果顺序逐段播放。
 * 集中控制动画速度与跳过（需求 25）。
 */

export class EventStreamPlayer {
  private timeline: gsap.core.Timeline | null = null;
  private finishPending: (() => void) | null = null;
  private paused = false;
  onTurnEnd?: () => void;
  onDetachedTween?: (tween: gsap.core.Animation) => void;
  private detachedTweens = new Set<gsap.core.Animation>();
  private frameClocks = new Set<FramePlaybackClock>();
  private trackDetached<T extends gsap.core.Animation>(tween: T): T {
    this.detachedTweens.add(tween);
    const complete = tween.eventCallback('onComplete');
    const interrupt = tween.eventCallback('onInterrupt');
    tween.eventCallback('onComplete', () => { this.detachedTweens.delete(tween); complete?.(); });
    tween.eventCallback('onInterrupt', () => { this.detachedTweens.delete(tween); interrupt?.(); });
    this.onDetachedTween?.(tween);
    return tween;
  }
  private detachedTo(...args: Parameters<typeof gsap.to>): gsap.core.Tween {
    return this.trackDetached(gsap.to(...args));
  }
  private detachedFromTo(targets: gsap.TweenTarget, fromVars: gsap.TweenVars, toVars: gsap.TweenVars): gsap.core.Tween {
    return this.trackDetached(gsap.fromTo(targets, fromVars, toVars));
  }

  isPlaying(): boolean { return this.timeline !== null; }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.timeline?.paused(paused);
  }

  /** Kill callbacks as well as animation; release any awaiting App continuation. */
  cancel(): void {
    this.timeline?.kill();
    for (const clock of this.frameClocks) clock.finish();
    this.frameClocks.clear();
    for (const tween of [...this.detachedTweens]) tween.kill();
    this.detachedTweens.clear();
    this.timeline = null;
    const finish = this.finishPending;
    this.finishPending = null;
    this.manaOriginCache.clear();
    finish?.();
  }

  /**
   * 同一波重力里幸存宝石的最大下落格数（appendGravity 记录，appendRefill 消费）：
   * 补充堆的下落距离必须 ≥ 它——新宝石从"整列刚体"的顶端跟着一起落（起点在棋盘
   * 上方、从横幅后面钻出来），否则生成线钳制会让补充堆压在还在下落的幸存宝石上。
   */
  private pendingFallMaxCells = 0;

  /** 战斗事件回调：在时间线推进到该事件时触发，供 App 更新卡面（需求 19.6, 19.7） */
  onBattleEvent: ((ev: GameEvent, presentation?: ImpactPresentation) => void) | null = null;
  onNarrationBatch: ((events: GameEvent[]) => NarrationPlan | null) | null = null;
  /**
   * 群体攻击批次回调（ANIMATION_HANDOFF §19 P0-1）：把连续 range='all' 的 skill-damage
   * 聚合成「一次 0241 释放 + 全体同时受击」。App 播放释放/群体受击/伤害飘字。
   */
  onGroupAttack: ((events: Extract<GameEvent, { type: 'skill-damage' }>[]) => void) | null = null;
  /** 施法蓄力结束、技能即将结算的瞬间（skill-cast 预留段末尾）：App 在此打出统一的「发射」音效与震屏 */
  onCastRelease: ((characterId: number) => void) | null = null;
  onManaFlow: ((ev: Extract<GameEvent, { type: 'mana-gain' }>, origins: BoardPoint[]) => void) | null = null;
  /** Fired for cascade levels 2+ and once more when an extra action is awarded. */
  onComboPulse: ((level: number) => void) | null = null;
  onMatchExtraTurn?: (side: PlayerSide) => void;
  onSkullMatchBonus?: (pos: CellPos, bonus: number) => void;
  /**
   * 风暴演出回调（storm-change，阶段 2）：App 负责顶部指示器的弹入/淡出与
   * 对应色一次性爆发 FX；召唤音效由本类按 stormChangePlan 在同一时间点播放。
   */
  onStormChange: ((ev: Extract<GameEvent, { type: 'storm-change' }>) => void) | null = null;
  private manaOriginCache = new Map<number, BoardPoint>();

  constructor(
    private board: BoardView,
    private fx: FXLayer,
    private shakeTarget: Container,
    private audio: AudioManager,
  ) {}

  /** 播放一整条事件流，返回在全部动画结束后 resolve 的 Promise */
  play(events: GameEvent[]): Promise<void> {
    this.cancel();
    const tl = gsap.timeline({ paused: this.paused });
    this.timeline = tl;
    this.manaOriginCache.clear();
    this.groupAttackConsumed.clear();
    // 战斗倍速由 gsap 全局时间线统一换算（battleSpeedRuntime），这里只叠本播放器的局部倍率（默认 1）
    tl.timeScale(this.timelineScale);

    // 预计算：每个连锁等级首次出现的消除事件下标，
    // 使屏幕震动/连击飘字每级只触发一次（而非每个消除组都触发）
    this.leadEliminationIndex = this.computeChainLeads(events);
    // 群体攻击批次：连续 range='all' 的 skill-damage 归为一批（首下标 → 整批事件）
    this.groupAttackBatches = this.computeGroupAttackBatches(events);
    for (const [leader, batch] of this.groupAttackBatches) {
      for (let k = 1; k < batch.length; k++) this.groupAttackConsumed.add(leader + k);
    }
    // 特殊宝石清除批次：连续的 gem-explode / gem-destroy 归为一批同时引爆
    // （末日骷髅环、至尊环、炸弹连环会产出多个清除事件，逐个播会"一颗颗慢慢爆"）
    const clearBatches = computeClearEventBatches(events);
    this.clearBatches = clearBatches.leaders;
    this.clearBatchMembers = clearBatches.members;
    const manaSources = computeManaSources(events, clearBatches);
    const manaBatches = computeManaPlaybackBatches(events, clearBatches);
    this.manaBatches = manaBatches.leaders;
    this.manaBatchMembers = manaBatches.members;
    this.manaSources = manaSources;
    this.clearStartTimes.clear();
    this.manaCommitEnd = 0;
    const statuses = computeStatusPlaybackBatches(events);
    this.statusBatches = statuses.leaders;
    this.statusBatchMembers = statuses.members;
    const buffs = computeBuffPlaybackBatches(events);
    this.buffBatches = buffs.leaders;
    this.buffBatchMembers = buffs.members;
    const defeats = computeDefeatPlaybackBatches(events);
    this.defeatBatches = defeats.leaders;
    this.defeatBatchMembers = defeats.members;
    const eliminationWaves = computeEliminationWaves(events);
    const eliminationStarts = new Map<number, number>();
    this.splashSlots = computeSplashPlaybackSlots(events);
    const splashStarts = new Map<number, number>();
    this.pendingFallLabel = null;
    this.pendingFallMaxCells = 0;

    const narration = this.onNarrationBatch?.(events);
    let narrationIndex = narration?.eventIndex;
    // A grouped hit presents all victims at its leader; never narrate a skipped member.
    for (const [leader, batch] of this.groupAttackBatches) {
      if (narrationIndex !== undefined && narrationIndex >= leader && narrationIndex < leader + batch.length)
        narrationIndex = leader;
    }
    const impactWindows = computeImpactWindows(events, clearBatches);
    this.synchronizedSingles = computeSynchronizedSingles(events);
    let currentWindow: number | undefined;
    let windowStart = 0;
    let boardEnd = 0;
    let fallStart: number | undefined;
    let clearStart: number | undefined;
    let feedbackStart: number | undefined;
    const targetEnds = new Map<string, number>();
    events.forEach((ev, i) => {
      const window = impactWindows.get(i);
      if (window !== currentWindow) {
        currentWindow = window;
        windowStart = tl.duration();
        targetEnds.clear();
        boardEnd = windowStart;
        fallStart = undefined;
        clearStart = undefined;
        feedbackStart = undefined;
      }
      // Target dependencies stay ordered; independent cards and board do not wait
      // for one another. A whole status batch occupies one envelope, not N holds.
      const batch = ev.type === 'skill-damage' ? this.groupAttackBatches.get(i) : undefined;
      const statusBatch = this.statusBatches.get(i);
      const buffBatch = this.buffBatches.get(i);
      const splashSlot = this.splashSlots.get(i);
      const skipped = this.clearBatchMembers.has(i) || this.manaBatchMembers.has(i)
        || this.statusBatchMembers.has(i) || this.buffBatchMembers.has(i)
        || this.defeatBatchMembers.has(i) || this.groupAttackConsumed.has(i);
      const targets = buffBatch?.targetIds ?? statusBatch?.targetIds ?? (ev.type === 'skill-damage'
        ? (batch ?? [ev]).map(hit => hit.targetId)
        : isCardPlaybackEvent(ev) && 'targetId' in ev ? [ev.targetId] : []);
      const lanes = skipped ? [] : targets.map(target => `target:${target}`);
      if (ev.type === 'skull-damage' && !ev.reflected) lanes.push(`attack:${ev.attackerId}`);
      if (ev.type === 'skill-damage' && ev.range === 'splash') {
        lanes.push(`splash:${ev.casterId}`);
        if (splashSlot?.leader === i) for (const target of splashSlot.targetIds) lanes.push(`target:${target}`);
      }
      this.segmentPosition = window === undefined ? undefined
        : Math.max(windowStart, ...lanes.map(lane => targetEnds.get(lane) ?? windowStart));
      if (window !== undefined && isBoardPlaybackEvent(ev)) {
        this.segmentPosition = ev.type === 'refill' && fallStart !== undefined ? fallStart : boardEnd;
      }
      if (ev.type === 'elimination') {
        const leader = eliminationWaves.get(i)!;
        if (leader === i) {
          const gap = ev.chainCount > 1 && this.leadEliminationIndex.has(i) ? AnimConfig.chainGap : 0;
          eliminationStarts.set(leader, this.segmentPosition! + gap);
        } else this.segmentPosition = eliminationStarts.get(leader);
      }
      if (ev.type === 'special-gem-trigger') this.segmentPosition = feedbackStart ?? boardEnd;
      if (splashSlot) {
        if (splashSlot.leader === i) splashStarts.set(i, this.segmentPosition!);
        else this.segmentPosition = splashStarts.get(splashSlot.leader)! + splashSlot.offset;
      }
      // Exploded-skull projectiles may only originate after their associated clear starts.
      // 骷髅普攻同理：连锁里第 N 轮才凑成的骷髅，冲撞必须等这轮骷髅开始消除，
      // 否则会与第一轮（如紫色）消除同时出手，看起来像「没配骷髅也打人」。
      if (window !== undefined && ev.type === 'skull-damage' && !ev.reflected) {
        this.segmentPosition = Math.max(this.segmentPosition!, clearStart ?? windowStart);
      }
      if (window !== undefined && ev.type === 'skill-damage' && (ev.skullBurst || ev.originCell)) {
        this.segmentPosition = Math.max(this.segmentPosition!, clearStart ?? windowStart);
      }
      if (!skipped && ev.type === 'gravity') fallStart = this.segmentPosition;
      else if (!skipped && isBoardPlaybackEvent(ev) && ev.type !== 'refill') fallStart = undefined;
      if (!this.clearBatchMembers.has(i) &&
          (ev.type === 'elimination' || ev.type === 'gem-explode' || ev.type === 'gem-destroy') && ev.cells.length) {
        // Cascade anticipation belongs before the clear, not before the concurrent mana flow.
        const gap = ev.type === 'elimination' && ev.chainCount > 1 && this.leadEliminationIndex.has(i)
          ? AnimConfig.chainGap : 0;
        this.clearStartTimes.set(i, (this.segmentPosition ?? tl.duration()) + gap);
        clearStart = this.clearStartTimes.get(i);
        feedbackStart = clearStart;
      }
      this.appendSegment(tl, ev, i, manaSources.get(i) ?? []);
      if (!skipped && isBoardPlaybackEvent(ev)) {
        boardEnd = Math.max(boardEnd, this.lastSegmentEnd);
        if (!['elimination', 'gem-explode', 'gem-destroy'].includes(ev.type)) feedbackStart = boardEnd;
      }
      if (ev.type === 'refill') fallStart = undefined;
      for (const lane of lanes) {
        targetEnds.set(lane, Math.max(targetEnds.get(lane) ?? 0, this.lastSegmentEnd));
      }
      // After the impact segment, without extending the timeline for the voice's duration.
      if (narration && i === narrationIndex) tl.call(narration.play);
    });

    this.segmentPosition = undefined;
    return new Promise((resolve) => {
      this.finishPending = resolve;
      tl.eventCallback('onComplete', () => {
        this.finishPending = null;
        this.timeline = null;
        this.manaOriginCache.clear();
        resolve();
      });
      // 空时间线立即完成
      if (tl.getChildren().length === 0) {
        this.finishPending = null;
        this.timeline = null;
        resolve();
      }
    });
  }

  private leadEliminationIndex = new Set<number>();

  /** gravity 段的时间线 label：紧随其后的 refill 挂到同一 label 上并行播放，消除断档 */
  private pendingFallLabel: string | null = null;

  /** 群体攻击批次：首事件下标 → 该批全部 skill-damage(range='all') 事件；非首下标 → null（跳过） */
  private groupAttackBatches = new Map<number, Extract<GameEvent, { type: 'skill-damage' }>[]>();
  private groupAttackConsumed = new Set<number>();
  /** 特殊宝石清除批次（见 clearEventBatches.ts）：批首下标 → 整批同类清除事件 */
  private clearBatches = new Map<number, ClearEvent[]>();
  /** 批内非首事件下标：播放时跳过（已随批首合并；批首不在其中，由它播放整批） */
  private clearBatchMembers = new Set<number>();
  private statusBatches = new Map<number, StatusPlaybackBatch>();
  private statusBatchMembers = new Set<number>();
  private manaBatches = new Map<number, ManaPlaybackBatch>();
  private manaBatchMembers = new Set<number>();
  private manaSources = new Map<number, ManaOriginRef[]>();
  private clearStartTimes = new Map<number, number>();

  /**
   * 把连续的 range='all' skill-damage 事件聚合成批（同一次群攻的所有目标同时命中）。
   * 只聚合"下标连续"的 all 段：中间一旦出现非 all 事件即断批。
   */
  private computeGroupAttackBatches(
    events: GameEvent[],
  ): Map<number, Extract<GameEvent, { type: 'skill-damage' }>[]> {
    const batches = new Map<number, Extract<GameEvent, { type: 'skill-damage' }>[]>();
    let i = 0;
    while (i < events.length) {
      const ev = events[i];
      if (ev.type === 'skill-damage' && (ev.range === 'all' || ev.range === 'scatter')) {
        const group: Extract<GameEvent, { type: 'skill-damage' }>[] = [];
        let j = i;
        while (j < events.length) {
          const e = events[j];
          if (e.type === 'skill-damage' && e.range === ev.range
              && e.casterId === ev.casterId && !group.some(hit => hit.targetId === e.targetId)) {
            group.push(e);
            j += 1;
          } else break;
        }
        batches.set(i, group);
        i = j;
      } else {
        i += 1;
      }
    }
    return batches;
  }

  /** 找出每个连锁等级第一个消除事件的下标 */
  private computeChainLeads(events: GameEvent[]): Set<number> {
    const seen = new Set<number>();
    const leads = new Set<number>();
    events.forEach((ev, i) => {
      if (ev.type === 'elimination' && !seen.has(ev.chainCount)) {
        seen.add(ev.chainCount);
        leads.add(i);
      }
    });
    return leads;
  }

  /** 立即跳到终态（需求 25.2）：加速结算剩余动画 */
  skip(): void {
    if (this.timeline) {
      this.timeline.progress(1);
    }
  }

  /** 本播放器时间线的局部倍率（默认 1；与全局战斗倍速相乘） */
  private timelineScale = 1;

  /**
   * 设置本播放器时间线的局部倍率（需求 25.1 的兼容入口，测试/调试用）。
   * 战斗演出倍速（倍速按钮 / 按住空格）走 battleSpeed + battleSpeedRuntime 全局换算，
   * 不经这里，也不再改 AnimConfig.globalScale——避免同一段动画被换算两次。
   */
  setSpeed(scale: number): void {
    this.timelineScale = scale > 0 ? scale : 1;
    if (this.timeline) this.timeline.timeScale(this.timelineScale);
  }

  private center(pos: CellPos): { x: number; y: number } {
    return this.board.cellCenter(pos);
  }

  private manaCommitEnd = 0;
  private buffBatches = new Map<number, BuffPlaybackBatch>();
  private buffBatchMembers = new Set<number>();
  private defeatBatches = new Map<number, DefeatPlaybackBatch>();
  private defeatBatchMembers = new Set<number>();
  private splashSlots = new Map<number, import('./presentationBatches').SplashPlaybackSlot>();
  private synchronizedSingles = new Set<number>();
  private segmentPosition: number | undefined;
  private lastSegmentEnd = 0;

  /** Move only newly authored children; existing flights and callbacks stay put.
   * This keeps the parent's duration and audit attribution equal to the actual
   * concurrent envelope rather than the sum of independent segment durations. */
  private appendSegment(
    tl: gsap.core.Timeline, ev: GameEvent, index: number, origins: ManaOriginRef[],
  ): void {
    const oldEnd = tl.duration();
    const existing = new Set(tl.getChildren(false, true, true));
    const oldLabels = new Set(Object.keys(tl.labels));
    const sharedFall = ev.type === 'refill' && this.pendingFallLabel !== null;
    this.appendSerialSegment(tl, ev, index, origins);
    const added = tl.getChildren(false, true, true).filter(child => !existing.has(child));
    // Mana already uses the saved clear timestamp and must not be shifted twice.
    if (this.segmentPosition !== undefined && ev.type !== 'mana-gain' && !sharedFall) {
      const shift = this.segmentPosition - oldEnd;
      for (const child of added) child.startTime(child.startTime() + shift);
      for (const label of Object.keys(tl.labels)) if (!oldLabels.has(label)) tl.labels[label] += shift;
    }
    this.lastSegmentEnd = Math.max(this.segmentPosition ?? oldEnd,
      ...added.map(child => child.endTime()));
  }

  private appendSerialSegment(
    tl: gsap.core.Timeline,
    ev: GameEvent,
    index: number,
    manaOrigins: ManaOriginRef[],
  ): void {
    // 只有紧跟在 gravity 后面的 refill 才与其并行；被其他事件隔开则各自独立
    if (ev.type !== 'refill' && !isCardPlaybackEvent(ev) && ev.type !== 'mana-gain' && ev.type !== 'special-gem-trigger') {
      this.pendingFallLabel = null; this.pendingFallMaxCells = 0;
    }
    // 特殊宝石清除批次：批内非首事件已随批首合并播放，直接跳过
    if (this.clearBatchMembers.has(index) || this.manaBatchMembers.has(index) || this.statusBatchMembers.has(index)
      || this.buffBatchMembers.has(index) || this.defeatBatchMembers.has(index)) return;
    switch (ev.type) {
      case 'swap':
        this.appendSwap(tl, ev.gemIdA, ev.gemIdB, ev.a, ev.b, false);
        break;
      case 'swap-rejected':
        this.appendSwap(tl, ev.gemIdA, ev.gemIdB, ev.a, ev.b, true);
        break;
      case 'elimination':
        this.appendElimination(tl, ev, this.leadEliminationIndex.has(index));
        break;
      case 'gravity':
        this.appendGravity(tl, ev);
        break;
      case 'refill':
        this.appendRefill(tl, ev);
        break;
      case 'reshuffle':
        this.appendReshuffle(tl, ev);
        break;
      case 'mana-gain': {
        const batch = this.manaBatches.get(index) ?? { events: [{ index, event: ev }] };
        const clearStart = batch.clearIndex === undefined ? undefined : this.clearStartTimes.get(batch.clearIndex);
        const start = clearStart === undefined ? (this.segmentPosition ?? tl.duration()) : clearStart + AnimConfig.manaFlow.overlapDelay;
        const flows = batch.events.map(item => ({
          event: item.event,
          origins: this.manaSources.get(item.index) ?? (item.index === index ? manaOrigins : []),
        }));
        const duration = Math.max(...flows.map(flow => manaFlowDuration(flow.origins.length, flow.event.surge)));
        tl.add(() => {
          for (const flow of flows) {
            const points = flow.origins.map(origin =>
              this.manaOriginCache.get(origin.gemId) ?? this.center(origin.pos));
            this.onManaFlow?.(flow.event, points);
          }
        }, start);
        tl.to({}, { duration }, start);
        // Flights from later clears may arrive first; preserve engine-order commits
        // without making the board or the flights wait for one another.
        const commitTime = Math.max(start + duration, this.manaCommitEnd);
        this.manaCommitEnd = commitTime;
        tl.add(() => {
          for (const flow of flows) this.onBattleEvent?.(flow.event);
        }, commitTime);
        break;
      }
      case 'defeat': {
        const batch = this.defeatBatches.get(index)!;
        // One drift envelope; App removes the entire batch before replacements appear.
        tl.add(() => {
          for (const event of batch.events) this.onBattleEvent?.(event, { defeatBatch: batch });
        });
        tl.to({}, {
          duration: (AnimConfig.frameFX.death_drift.duration + 40 + AnimConfig.defeat.cardExitDuration) / 1000,
        });
        break;
      }
      case 'flee':
        // 逃跑：轻量退场（removeCharacterCard 的收缩淡出），只预留退场时长
        tl.add(() => this.onBattleEvent?.(ev));
        tl.to({}, { duration: AnimConfig.defeat.cardExitDuration / 1000 });
        break;
      case 'skull-damage':
        // 音效与震屏改由 App 在冲撞命中瞬间触发（卡肉同步），此处只派发事件
        tl.add(() => {
          this.onBattleEvent?.(ev);
        });
        tl.to({}, { duration: ev.reflected ? AnimConfig.recoil.duration / 1000
          : (AnimConfig.attack.dashDuration + AnimConfig.attack.hitStop + AnimConfig.attack.returnDuration) / 1000 });
        break;
      case 'attack-struggle':
        // 屏障/闪避：App 照常播完整冲撞（命中时格挡/闪避），预留冲撞时长；
        // 队首被控攻击落空：App 播放挣扎动画（小幅前冲被拉回），预留其时长
        tl.add(() => this.onBattleEvent?.(ev));
        tl.to({}, { duration: (ev.reason === 'barrier' || ev.reason === 'dodge') && ev.targetId !== undefined
          ? (AnimConfig.attack.dashDuration + AnimConfig.attack.hitStop + AnimConfig.attack.returnDuration) / 1000
          : 0.42 });
        break;
      case 'skill-cast': {
        // Attribute-specific cast audio is selected by App at this event timestamp.
        tl.add(() => this.onBattleEvent?.(ev));
        // 我方施法：先留出立绘切入的入场+停留；退场淡出与随后的技能演出重叠。
        // 敌方施法：留出预告名牌的时长。
        const cutIn = castCutInReserveSeconds(ev.characterId);
        if (cutIn > 0) tl.to({}, { duration: cutIn });
        // 预留段 = 蓄力段；末尾即「发射」，紧接着技能效果开始结算
        tl.add(() => this.onCastRelease?.(ev.characterId));
        break;
      }
      case 'extra-turn':
        // Lightweight HUD notice only. Narration stays on the existing batch path.
        // No chain pulse, duplicate sound or serial hold; App accounts for its finite tail.
        tl.add(() => this.onBattleEvent?.(ev));
        break;
      case 'turn-end':
        tl.add(() => this.onTurnEnd?.());
        break;
      case 'game-over':
        tl.add(() => this.onBattleEvent?.(ev));
        break;
      // —— 技能效果事件（需求 3-7）——
      case 'skill-damage':
        // 群体攻击批次：首事件承接整批的一次释放 + 同时命中；批内其余事件跳过（避免逐个弹道）
        if ((ev.range === 'all' || ev.range === 'scatter')) {
          const batch = this.groupAttackBatches.get(index);
          if (batch) {
            this.appendGroupAttack(tl, batch);
          }
          // 非首下标的 all 事件已被首事件聚合，跳过
          break;
        }
        this.appendSkillDamage(tl, ev, index);
        break;
      case 'buff': {
        const batch = this.buffBatches.get(index)!;
        tl.add(() => {
          for (const row of batch.events) this.onBattleEvent?.(row.event, { buffFeedback: row.feedback });
        });
        tl.to({}, { duration: batch.duration });
        break;
      }
      case 'status-apply':
      case 'status-tick':
      case 'status-expire': {
        const batch = this.statusBatches.get(index)!;
        tl.add(() => {
          for (const row of batch.events) this.onBattleEvent?.(row.event,
            row.feedback ? { statusFeedback: row.feedback } : undefined);
        });
        // 法术被屏障吸收：App 照常打一发弹道再播格挡，留出飞行 + 格挡的时间
        const blocked = batch.events.some(row => row.event.type === 'status-expire' && row.event.absorbedFrom);
        tl.to({}, { duration: blocked
          ? Math.max(batch.duration, (AnimConfig.projectile.maxDuration + 320) / 1000)
          : batch.duration });
        break;
      }
      case 'status-cleanse':
        tl.add(() => this.onBattleEvent?.(ev));
        tl.to({}, { duration: AnimConfig.frameFX.heal_cleanse.duration / 1000 });
        break;
      case 'status-blocked':
        // 免疫/赐福抵挡/潜水闪避/冰冻吞额外回合：卡面光圈 + 飘字（App 代码绘制），短占位
        tl.add(() => this.onBattleEvent?.(ev));
        tl.to({}, { duration: STATUS_BLOCKED_HOLD_SECONDS });
        break;
      case 'special-gem-trigger':
        // Feedback overlaps the clear; every marker and its finite label tail remain visible.
        tl.add(() => this.onBattleEvent?.(ev));
        tl.to({}, { duration: 0.52 });
        break;
      case 'gem-create':
        this.appendGemCreate(tl, ev);
        break;
      case 'gem-merge':
        this.appendGemMerge(tl, ev);
        break;
      case 'gem-transform':
        this.appendGemTransform(tl, ev);
        break;
      case 'gem-destroy': {
        // 特殊宝石清除批次：首事件承接整批（连环/多环一次轰）；单事件走原路径
        const batch = this.clearBatches.get(index);
        if (batch) {
          this.appendGemDestroy(tl, mergeClearBatch(batch as Extract<GameEvent, { type: 'gem-destroy' }>[]));
        } else {
          this.appendGemDestroy(tl, ev);
        }
        break;
      }
      case 'gem-explode': {
        // 特殊宝石清除批次：首事件承接整批（末日环/至尊环/炸弹连环一次轰）；单事件走原路径
        const batch = this.clearBatches.get(index);
        if (batch) {
          this.appendGemExplode(tl, mergeClearBatch(batch as Extract<GameEvent, { type: 'gem-explode' }>[]));
        } else {
          this.appendGemExplode(tl, ev);
        }
        break;
      }
      case 'summon':
        tl.add(() => this.onBattleEvent?.(ev));
        // 占位时长按召唤事件的 destination 查表（SUMMON_HOLD_SECONDS）：
        // field 才有棋盘上的 0011 法阵演出，queue 仅入队不白等。
        tl.to({}, { duration: SUMMON_HOLD_SECONDS[ev.destination] });
        break;
      case 'troop-reposition':
      case 'team-shuffle':
        // 侧边卡列滑到新站位。留出滑动时间，下一拍伤害不要盖在半路上。
        tl.add(() => this.onBattleEvent?.(ev));
        tl.to({}, { duration: 0.34 });
        break;
      case 'troop-transform':
        // 翻卡换脸演出：翻出 170ms + 翻回 260ms
        tl.add(() => this.onBattleEvent?.(ev));
        tl.to({}, { duration: 0.44 });
        break;
      case 'economy-gain':
        tl.add(() => this.onBattleEvent?.(ev));
        tl.to({}, { duration: 0.2 });
        break;
      case 'storm-change': {
        // 风暴演出（阶段 2）：set/replaced 新风暴 → 召唤音效（仅 set）+ 指示器弹入
        // + 对应色一次性爆发 FX，时间线预留爆发时长；被顶方（color=null）/到期 →
        // 指示器淡出，预留淡出时长。指示器与爆发 FX 由 App 接管（onStormChange）。
        tl.add(() => this.onStormChange?.(ev));
        break;
      }
      default:
        break;
    }
  }

  /**
   * 群体攻击（ANIMATION_HANDOFF §19 P0-1）：一次 0241 棋盘中央释放，之后全体目标同时受击。
   * 不走通用弹道。App 负责播放释放/群体受击/伤害飘字（onGroupAttack）。
   * Timeline 预留：释放动画 + 受击错位后的最长受击时长。
   */
  private appendGroupAttack(
    tl: gsap.core.Timeline,
    batch: Extract<GameEvent, { type: 'skill-damage' }>[],
  ): void {
    tl.add(() => {
      this.audio.play('skill');
      this.onGroupAttack?.(batch);
    });
    // 0241 释放时长 + 命中延迟 + 群体受击最长时长（各色不同，取最长者以免时间线提前推进）
    const castMs = AnimConfig.frameFX.group_cast.duration;
    const hitDelayMs = AnimConfig.groupAttack.hitDelay;
    const hitDurations = [
      AnimConfig.frameFX.group_hit_purple.duration,
      AnimConfig.frameFX.group_hit_red.duration,
      AnimConfig.frameFX.group_hit_blue.duration,
      AnimConfig.frameFX.group_hit_yellow.duration,
      AnimConfig.frameFX.group_hit_brown.duration,
      AnimConfig.frameFX.group_hit_green.duration,
    ];
    const maxHit = Math.max(...hitDurations);
    const hold = Math.max(castMs, hitDelayMs + maxHit) / 1000;
    tl.to({}, { duration: hold });
  }

  /** 技能伤害：命中粒子 + 派发事件（App 飘伤害字/刷新卡面） */
  private appendSkillDamage(
    tl: gsap.core.Timeline,
    ev: Extract<GameEvent, { type: 'skill-damage' }>,
    index: number,
  ): void {
    const splashSlot = this.splashSlots.get(index);
    const presentation: ImpactPresentation | undefined = splashSlot
      ? { splashSwordDurationMs: AnimConfig.splashChain.shortSwordDuration }
      : this.synchronizedSingles.has(index)
        ? { projectileDurationMs: AnimConfig.projectile.maxDuration } : undefined;
    tl.add(() => {
      // Splash is an immediate area impact; do not play the generic projectile whoosh.
      // 骷髅爆炸（炸毁骷髅）命中时播 skullHit 专用音效，也不走技能弹道音。
      if (ev.range !== 'splash' && !ev.skullBurst) this.audio.play('skill');
      this.onBattleEvent?.(ev, presentation);
    });
    // 留出弹道飞行→命中的时间（App 侧 playProjectile 约 340ms + 命中演出），
    // 避免时间线在弹体到达前就推进到下一事件。
    // Splash has no projectile; other hits reserve worst-case flight plus impact frames.
    const hold = ev.skullBurst
      ? 0.34 // 骨白能量弹：飞行 ≤240ms + 飘字/卡面反馈一拍，不叠任何爆炸层
      : ev.range === 'splash'
      ? (ev.chainIndex ?? 0) === 0
        ? Math.max(AnimConfig.frameFX.splash_chain_cast.duration,
            AnimConfig.splashChain.firstImpactDelay + AnimConfig.splashChain.impactFeedbackDuration) / 1000
        : ((splashSlot ? AnimConfig.splashChain.shortSwordDuration : AnimConfig.frameFX.splash_chain_sword.duration)
            + AnimConfig.splashChain.impactFeedbackDuration) / 1000
      : (AnimConfig.projectile.maxDuration + Math.max(
          AnimConfig.frameFX.water_single_hit.duration,
          AnimConfig.frameFX.yellow_single_hit.duration,
          AnimConfig.frameFX.green_single_hit.duration,
          AnimConfig.frameFX.hit_spark.duration,
        )) / 1000;
    tl.to({}, { duration: hold });
  }

  /** 宝石创造：在落点添加精灵并缩放淡入 */
  private appendGemCreate(
    tl: gsap.core.Timeline,
    ev: Extract<GameEvent, { type: 'gem-create' }>,
  ): void {
    if (ev.spawns.length === 0) return;
    tl.add(() => {
      for (const sp of ev.spawns) {
        const sprite = this.board.addGem({ id: sp.gemId, type: sp.gemType }, sp.pos);
        const s = sprite as unknown as { scale: { set: (v: number) => void; x: number; y: number }; alpha: number };
        s.scale.set(0.2);
        s.alpha = 0;
        const { x, y } = this.center(sp.pos);
        this.fx.burst(x, y, colorOf(sp.gemType), 0.8);
        this.detachedTo(s.scale, { x: 1, y: 1, duration: 0.28, ease: 'back.out(2)' });
        this.detachedTo(s, { alpha: 1, duration: 0.2, ease: 'power1.out' });
      }
    });
    tl.to({}, { duration: 0.3 });
  }

  /** 宝石转化：变更精灵纹理并高光脉冲 */
  private appendGemMerge(tl: gsap.core.Timeline, ev: Extract<GameEvent, { type: 'gem-merge' }>): void {
    const cfg = AnimConfig.merge;
    const moving: { sprite: GemSprite; x: number; y: number; to: BoardPoint }[] = [];
    const progress = { value: 0 };
    tl.add(() => {
      this.audio.playChain(ev.chainCount);
      for (const group of ev.groups) {
        const to = this.center(group.target.pos);
        for (const piece of group.consumed) {
          const sprite = this.board.getSprite(piece.gemId);
          if (sprite) moving.push({ sprite, x: sprite.x, y: sprite.y, to });
        }
      }
    });
    tl.to(progress, { value: 1, duration: cfg.gather, ease: cfg.ease, onUpdate: () => {
      for (const { sprite, x, y, to } of moving) {
        sprite.position.set(x + (to.x - x) * progress.value, y + (to.y - y) * progress.value);
        sprite.scale.set(1 - .65 * progress.value);
        sprite.alpha = 1 - .6 * progress.value;
      }
    }});
    tl.add(() => {
      for (const group of ev.groups) {
        for (const piece of group.consumed) this.board.removeGem(piece.gemId);
        this.board.setGemType(group.target.gemId, group.target.gemType);
        const point = this.center(group.target.pos);
        this.fx.burst(point.x, point.y, 0xe9c77c, 1.1);
      }
      this.onBattleEvent?.(ev);
    });
    const reveal = { value: 0 };
    tl.to(reveal, { value: 1, duration: cfg.reveal, ease: 'power2.out', onUpdate: () => {
      for (const group of ev.groups) this.board.getSprite(group.target.gemId)?.scale.set(1 + .16 * Math.sin(reveal.value * Math.PI));
    }});
  }

  private appendGemTransform(
    tl: gsap.core.Timeline,
    ev: Extract<GameEvent, { type: 'gem-transform' }>,
  ): void {
    if (ev.changes.length === 0) return;
    tl.add(() => {
      for (const ch of ev.changes) {
        this.board.setGemType(ch.gemId, ch.to);
        const { x, y } = this.center(ch.pos);
        this.fx.burst(x, y, colorOf(ch.to), 0.9);
        const sprite = this.board.getSprite(ch.gemId);
        if (sprite) {
          const s = sprite as unknown as { scale: { x: number; y: number } };
          this.detachedFromTo(s.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.26, ease: 'back.out(2)' });
        }
      }
    });
    tl.to({}, { duration: 0.28 });
  }

  /**
   * 摧毁（destroy）：就地"碎裂"——向内收缩 + 旋转 + 淡出，细碎小粒子，冷、素、无冲击波。
   * 只清目标本身。其后 gravity/refill 自然接续。
   */
  private appendGemDestroy(
    tl: gsap.core.Timeline,
    ev: Extract<GameEvent, { type: 'gem-destroy' }>,
  ): void {
    if (ev.cells.length === 0) return;
    tl.add(() => {
      for (const cell of ev.cells) {
        const { x, y } = this.center(cell.pos);
        const sprite = this.board.getSprite(cell.gemId);
        // 缓存来源点，供随后的法力流从此处飞出
        this.manaOriginCache.set(cell.gemId, sprite ? { x: sprite.x, y: sprite.y } : { x, y });
        // 细碎小粒子（克制，不炸）
        this.fx.burst(x, y, colorOf(cell.gemType), 0.7);
        if (sprite) {
          const s = sprite as unknown as { scale: { x: number; y: number }; alpha: number; rotation: number };
          this.detachedTo(s, { rotation: (Math.random() - 0.5) * 1.4, duration: 0.24, ease: 'power2.in' });
          this.detachedTo(s.scale, { x: 0, y: 0, duration: 0.24, ease: 'power2.in' });
          this.detachedTo(s, { alpha: 0, duration: 0.2, ease: 'power1.in' });
        }
      }
    });
    tl.to({}, { duration: 0.26 });
    tl.add(() => {
      for (const cell of ev.cells) this.board.removeGem(cell.gemId);
    });
  }

  /**
   * 爆破（explode）：向外"炸"——白光闪 + 冲击环扩散 + 大量向外抛的火花，热、猛。
   * 目标 + 辐射一圈。其后 gravity/refill 自然接续。
   */
  private appendGemExplode(
    tl: gsap.core.Timeline,
    ev: Extract<GameEvent, { type: 'gem-explode' }>,
  ): void {
    if (ev.cells.length === 0) return;
    const clock = new FramePlaybackClock();
    this.frameClocks.add(clock);
    const progress = { value: 0 };
    const duration = AnimConfig.frameFX.energy_burst.duration / 1000;
    const shrinking: { sprite: GemSprite; x: number; y: number; alpha: number }[] = [];
    const shrinkEase = gsap.parseEase('power3.in');
    const fadeEase = gsap.parseEase('power1.in');
    tl.add(() => {
      this.audio.play('gemExplosion');
      // The strip and disappearing gems share the board timeline, including pause,
      // speed and skip. Finish the strip before ANY following board operation.
      this.onBattleEvent?.(ev, { explosionClock: clock });
      for (const cell of ev.cells) {
        const { x, y } = this.center(cell.pos);
        const sprite = this.board.getSprite(cell.gemId);
        this.manaOriginCache.set(cell.gemId, sprite ? { x: sprite.x, y: sprite.y } : { x, y });
        if (sprite) shrinking.push({ sprite, x: sprite.scale.x, y: sprite.scale.y, alpha: sprite.alpha });
      }
    });
    tl.to(progress, {
      value: 1, duration, ease: 'none',
      onUpdate: () => {
        const elapsed = progress.value * duration;
        const scale = 1 - shrinkEase(Math.min(1, elapsed / .24));
        const alpha = 1 - fadeEase(Math.min(1, elapsed / .22));
        for (const item of shrinking) {
          item.sprite.scale.x = item.x * scale;
          item.sprite.scale.y = item.y * scale;
          item.sprite.alpha = item.alpha * alpha;
        }
        clock.advance(progress.value);
      },
      onComplete: () => { clock.finish(); this.frameClocks.delete(clock); },
    });
    tl.to({}, { duration: AnimConfig.postExplodePause });
    tl.add(() => {
      for (const cell of ev.cells) this.board.removeGem(cell.gemId);
    });
  }

  private appendSwap(
    tl: gsap.core.Timeline,
    gemIdA: number,
    gemIdB: number,
    a: CellPos,
    b: CellPos,
    reject: boolean,
  ): void {
    const cfg = reject ? AnimConfig.swapReject : AnimConfig.swap;
    const pa = this.center(a);
    const pb = this.center(b);
    const sa = this.board.getSprite(gemIdA);
    const sb = this.board.getSprite(gemIdB);

    const label = `swap_${tl.getChildren().length}`;
    tl.addLabel(label);
    tl.add(() => this.audio.play('swap'), label);

    if (reject) {
      // 非法交换：宝石此刻可能停在玩家拖拽后的位置。
      // 若已被拖离原位（拖拽触发）→ 单程弹回原位，不做正向交换。
      // 若仍在原位（两步点选触发）→ 先轻推向对方再弹回，给出反馈。
      const draggedAway =
        sa !== undefined && (Math.abs(sa.x - pa.x) > 2 || Math.abs(sa.y - pa.y) > 2);
      if (draggedAway) {
        if (sa) tl.to(sa, { x: pa.x, y: pa.y, duration: cfg.duration, ease: cfg.ease }, label);
        if (sb) tl.to(sb, { x: pb.x, y: pb.y, duration: cfg.duration, ease: cfg.ease }, label);
      } else {
        // 轻推（到对方位置的一半）再弹回
        const midA = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
        const half = cfg.duration * 0.5;
        if (sa) tl.to(sa, { x: midA.x, y: midA.y, duration: half, ease: 'power2.out' }, label);
        if (sb) tl.to(sb, { x: midA.x, y: midA.y, duration: half, ease: 'power2.out' }, label);
        const back = `swapback_${tl.getChildren().length}`;
        tl.addLabel(back, '>');
        if (sa) tl.to(sa, { x: pa.x, y: pa.y, duration: half, ease: 'back.out(2)' }, back);
        if (sb) tl.to(sb, { x: pb.x, y: pb.y, duration: half, ease: 'back.out(2)' }, back);
      }
    } else {
      // 合法交换：从当前位置补完到交换后的最终位置（A→b, B→a）。
      // 不加额外停顿——交换到位立即接消除，避免"卡住"的静止感。
      if (sa) tl.to(sa, { x: pb.x, y: pb.y, duration: cfg.duration, ease: cfg.ease }, label);
      if (sb) tl.to(sb, { x: pa.x, y: pa.y, duration: cfg.duration, ease: cfg.ease }, label);
    }
  }

  private appendElimination(
    tl: gsap.core.Timeline,
    ev: Extract<GameEvent, { type: 'elimination' }>,
    isLead: boolean,
  ): void {
    const cfg = AnimConfig.eliminate;
    const intensity = ev.shape === 'line3' ? 1 : 1.8; // 4/5/L/T 强调（需求 19.11）
    const chain = ev.chainCount;

    // 连锁间隔（需求 23.3）：仅在每级第一个消除前插入间隔
    if (chain > 1 && isLead) tl.to({}, { duration: AnimConfig.chainGap });

    tl.add(() => {
      // Multiple match groups can share one cascade level; play one suite step only.
      if (isLead) this.audio.playChain(chain);
      if (ev.extraTurnPlayer !== undefined) this.onMatchExtraTurn?.(ev.extraTurnPlayer);
      // 每个连锁等级仅触发一次震动 + 飘字（需求 19.5），避免叠加糊成一团
      if (chain > 1 && isLead) {
        this.onComboPulse?.(chain);
        this.trackDetached(screenShake(this.shakeTarget, chain));
        const first = this.center(ev.cells[0].pos);
        this.fx.comboText(first.x, first.y, chain);
      }
      for (const cell of ev.cells) {
        const sprite = this.board.getSprite(cell.gemId);
        const { x, y } = this.center(cell.pos);
        this.manaOriginCache.set(cell.gemId, sprite ? { x: sprite.x, y: sprite.y } : { x, y });
        const col = colorOf(cell.gemType);
        if (cell.gemType.kind === 'special') {
          const kind = cell.gemType.spec.kind;
          if (kind === 'doomSkull' || kind === 'uberDoomSkull') {
            this.onSkullMatchBonus?.(cell.pos, kind === 'doomSkull'
              ? DOOMSKULL_BONUS_DAMAGE : UBER_DOOMSKULL_BONUS_DAMAGE);
          }
        }
        // 粒子/闪光在消除一开始就炸开，填满整个时长的视觉
        this.fx.burst(x, y, col, intensity);
        if (sprite) {
          // 干净利落地缩小消失，不做夸张过冲
          this.detachedTo(sprite.scale, {
            x: 0,
            y: 0,
            duration: cfg.duration,
            ease: 'power2.in',
          });
          this.detachedTo(sprite, {
            alpha: 0,
            duration: cfg.duration * 0.9,
            ease: 'power1.in',
          });
        }
      }
    });
    tl.to({}, { duration: cfg.duration + AnimConfig.postEliminatePause });
    // 在时间线推进到此处时统一回收精灵（而非依赖各自补间的 onComplete）。
    // 这样即便玩家 skip/快进、补间被中途打断，精灵也一定会被释放回池，
    // 不会出现"已消除但精灵残留"或"复用错乱"的空缺/重影。
    tl.add(() => {
      for (const cell of ev.cells) this.board.removeGem(cell.gemId);
    });
  }

  /**
   * 全盘重排（UX 审查 P0 修复）：旧实现把「聚拢」交给脱离时间线的 gsap 补间（0.3s 墙钟），
   * 而「瞬移到新位」是时间线回调（+0.32s）——20ms 边距不足一帧，同一帧内瞬移被未结束的
   * 聚拢补间 onUpdate 覆写回聚集点，宝石永久悬停棋盘中央（逻辑棋盘已结算、表现不可玩）。
   * 现在位移/缩放/旋转全部由主时间线上的 proxy tween 驱动（插值纯函数在 reshufflePlan.ts，
   * 端点精确），末尾再加「终态强制归位」回调兜底：skip/快进/中断后宝石必然落在逻辑位。
   */
  private appendReshuffle(
    tl: gsap.core.Timeline,
    ev: Extract<GameEvent, { type: 'reshuffle' }>,
  ): void {
    if (ev.moves.length === 0) return;

    // 段开始时快照全部活精灵并构建计划（变动与未变动的宝石都收，漏掉的会滞留原地）
    const items: ReshufflePlanItem[] = [];
    tl.add(() => {
      const snapshot = this.board.layer.children.map((child) => {
        const s = child as GemSprite;
        return { gemId: s.gemId, x: s.x, y: s.y };
      });
      items.push(
        ...buildReshufflePlan({
          moves: ev.moves,
          sprites: snapshot,
          centerOf: (pos) => this.center(pos),
          gridPixels: this.board.gridPixels,
        }),
      );
    });

    // 阶段一：朝棋盘中心聚拢（位移 + 缩小 + 旋转，全部时间线驱动；ease 在纯函数内）
    const spriteOf = (it: ReshufflePlanItem) => this.board.getSprite(it.gemId);
    const gather = { p: 0 };
    tl.to(gather, {
      p: 1,
      duration: RESHUFFLE_TIMING.gather,
      ease: 'none',
      onUpdate: () => {
        for (const it of items) {
          const s = spriteOf(it);
          if (!s) continue;
          const pt = gatherPointAt(it, gather.p);
          s.x = pt.x;
          s.y = pt.y;
          s.scale.set(gatherScaleAt(gather.p));
          s.rotation = gatherRotationAt(it, gather.p);
        }
      },
    });

    // 阶段二：瞬移到各自逻辑终点（已缩小，跳变不显眼）
    tl.add(() => {
      for (const it of items) {
        const s = spriteOf(it);
        if (!s) continue;
        s.x = it.finalX;
        s.y = it.finalY;
        s.scale.set(RESHUFFLE_TIMING.gatherScale);
        s.rotation = it.rotTarget;
      }
    });

    // 阶段三：错落散开、缩放弹回、旋转归位（窗口覆盖最大错峰延迟，尾颗不被截断）
    const scatter = { t: 0 };
    tl.to(scatter, {
      t: RESHUFFLE_SCATTER_WINDOW,
      duration: RESHUFFLE_SCATTER_WINDOW,
      ease: 'none',
      onUpdate: () => {
        for (const it of items) {
          const s = spriteOf(it);
          if (!s) continue;
          const pose = scatterPoseAt(it, scatter.t);
          s.scale.set(pose.scale);
          s.rotation = pose.rotation;
        }
      },
    });

    // 终态保底（审查建议「onComplete 强制归位」）：宝石精确落在逻辑位，无任何悬挂状态
    tl.add(() => {
      for (const it of items) {
        const s = spriteOf(it);
        if (!s) continue;
        s.x = it.finalX;
        s.y = it.finalY;
        s.scale.set(1);
        s.rotation = 0;
      }
    });
  }

  /**
   * 落地挤压回弹（squash & stretch）：纵向压扁、横向拉宽再弹回，
   * 幅度随下落距离增强。detached 补间：即使 skip 也会自然收敛到 scale=1。
   */
  private landSquash(sprite: { scale: { x: number; y: number } }, cells: number): void {
    const cfg = AnimConfig.gravity.land;
    const t = Math.min(1, cells / 4); // 掉 4 格以上取满幅
    this.detachedFromTo(
      sprite.scale,
      { x: 1 + (cfg.squashX - 1) * t, y: 1 + (cfg.squashY - 1) * t },
      { x: 1, y: 1, duration: cfg.duration, ease: cfg.ease, overwrite: 'auto' },
    );
  }

  private appendGravity(
    tl: gsap.core.Timeline,
    ev: Extract<GameEvent, { type: 'gravity' }>,
  ): void {
    if (ev.moves.length === 0) return;

    // Keep falling on the main timeline. The previous callback started detached
    // tweens while maxDur was still zero during timeline construction, so play()
    // could finish and allow the next action before the gems reached their cells.
    const label = `gravity_${tl.getChildren().length}`;
    tl.addLabel(label);
    let maxEnd = 0;
    let maxCells = 0;

    for (const mv of ev.moves) {
      const to = this.center(mv.to);
      const cells = Math.abs(mv.to.row - mv.from.row);
      maxCells = Math.max(maxCells, cells);
      const duration = fallDuration(cells);
      const delay = mv.to.col * AnimConfig.gravity.columnStagger;
      const progress = { value: 0 };
      let sprite: ReturnType<BoardView['getSprite']>;
      let fromX = to.x;
      let fromY = to.y;

      tl.to(
        progress,
        {
          value: 1,
          duration,
          ease: AnimConfig.gravity.ease,
          onStart: () => {
            sprite = this.board.getSprite(mv.gemId);
            if (!sprite) return;
            fromX = sprite.x;
            fromY = sprite.y;
          },
          onUpdate: () => {
            if (!sprite) return;
            sprite.x = fromX + (to.x - fromX) * progress.value;
            sprite.y = fromY + (to.y - fromY) * progress.value;
          },
          onComplete: () => {
            if (!sprite) return;
            sprite.x = to.x;
            sprite.y = to.y;
            this.landSquash(sprite, cells);
          },
        },
        `${label}+=${delay}`,
      );
      maxEnd = Math.max(maxEnd, delay + duration);
    }

    // Preserve the causal gap even if a sprite is defensively missing.
    tl.to({}, { duration: maxEnd + 0.05 }, label);
    // 紧随其后的 refill 挂到同一 label：新宝石与幸存宝石同时开始下落，无缝续上
    this.pendingFallLabel = label;
    this.pendingFallMaxCells = maxCells;
  }

  private appendRefill(
    tl: gsap.core.Timeline,
    ev: Extract<GameEvent, { type: 'refill' }>,
  ): void {
    if (ev.spawns.length === 0) return;

    // Spawn at segment start, but drive the fall through the main timeline so
    // timeScale, skip, and onComplete all include the full refill animation.
    // 若前一段是 gravity，则复用其 label 并行播放：新宝石是同一列"更上面"的宝石，
    // 与幸存宝石同时起落（匀加速下二者间距恒定，不会穿插）。
    const sameWave = this.pendingFallLabel !== null;
    const label = this.pendingFallLabel ?? `refill_${tl.getChildren().length}`;
    if (!sameWave) tl.addLabel(label);
    // travelCells 必须在清空 pendingFallLabel 之前读（同波标记与最大下落格数一起消费）
    const travelCells = Math.max(1, sameWave ? this.pendingFallMaxCells : 0);
    this.pendingFallLabel = null;
    let maxEnd = 0;

    // 每列补充数：整列新宝石从目标格正上方同一距离（travel）处刚性下落（间距恒 1 格）。
    // travel 必须覆盖**同波幸存宝石的最大下落格数**：补充堆是"整列刚体"的顶端，
    // 与幸存宝石同速同拍落下（√ 律下 moved_cells 只与时间有关、与距离无关），
    // 初相零重叠 → 全程零重叠。若按生成线把 travel 钳短，补充堆会压在还在下落的
    // 幸存宝石的出发格上（互相覆盖着下落，落地后才分开——即"下坠穿模"）。
    // 新宝石从棋盘上方入场、从横幅后面钻出（横幅 DOM 盖在画布之上）。
    for (const sp of ev.spawns) {
      const to = this.center(sp.to);
      const startY = to.y - this.board.cellSize * travelCells;
      const duration = fallDuration(travelCells);
      const delay = sp.to.col * AnimConfig.gravity.columnStagger;
      const progress = { value: 0 };
      let sprite: ReturnType<BoardView['getSprite']>;

      tl.to(
        progress,
        {
          value: 1,
          duration,
          ease: AnimConfig.refill.ease,
          onStart: () => {
            sprite = this.board.addGem({ id: sp.gemId, type: sp.gemType }, sp.to);
            sprite.x = to.x;
            sprite.y = startY;
          },
          onUpdate: () => {
            if (!sprite) return;
            sprite.y = startY + (to.y - startY) * progress.value;
          },
          onComplete: () => {
            if (!sprite) return;
            sprite.x = to.x;
            sprite.y = to.y;
            this.landSquash(sprite, travelCells);
          },
        },
        `${label}+=${delay}`,
      );
      maxEnd = Math.max(maxEnd, delay + duration);
    }

    tl.to({}, { duration: maxEnd + 0.05 }, label);
  }

}
