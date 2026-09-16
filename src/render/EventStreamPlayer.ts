import { Container } from 'pixi.js';
import { gsap } from 'gsap';
import type { GameEvent } from '@engine/events';
import { computeClearEventBatches, mergeClearBatch } from './clearEventBatches';
import type { ClearEvent } from './clearEventBatches';
import type { CellPos } from '@engine/types';
import { BoardView } from './BoardView';
import { FXLayer, screenShake } from './FXLayer';
import { AnimConfig, fallDuration } from './AnimationConfig';
import { colorOf } from './GemSprite';
import type { GemSprite } from './GemSprite';
import type { AudioManager } from './AudioManager';
import { extraActionComboLevel } from './turnHudLogic';
import { buildReshufflePlan, gatherPointAt, gatherRotationAt, gatherScaleAt, scatterPoseAt } from './reshufflePlan';
import type { ReshufflePlanItem } from './reshufflePlan';
import {
  RESHUFFLE_SCATTER_WINDOW,
  RESHUFFLE_TIMING,
} from './reshufflePlan';

type ManaOriginRef = { gemId: number; pos: CellPos };
type BoardPoint = { x: number; y: number };

/**
 * 召唤演出的时间线占位（秒），按 summon 事件的 destination 查表。
 * field → 棋盘上播 0011 召唤法阵（summon_rune）；queue → 仅入队，无棋盘演出。
 * 新增召唤演出路径时在此加键，勿再硬编码单个特效的时长。
 * （frameFX 时长为毫秒，GSAP 用秒。）
 */
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

  /**
   * 同一波重力里幸存宝石的最大下落格数（appendGravity 记录，appendRefill 消费）：
   * 补充堆的下落距离必须 ≥ 它——新宝石从"整列刚体"的顶端跟着一起落（起点在棋盘
   * 上方、从横幅后面钻出来），否则生成线钳制会让补充堆压在还在下落的幸存宝石上。
   */
  private pendingFallMaxCells = 0;

  /** 战斗事件回调：在时间线推进到该事件时触发，供 App 更新卡面（需求 19.6, 19.7） */
  onBattleEvent: ((ev: GameEvent) => void) | null = null;
  /**
   * 群体攻击批次回调（ANIMATION_HANDOFF §19 P0-1）：把连续 range='all' 的 skill-damage
   * 聚合成「一次 0241 释放 + 全体同时受击」。App 播放释放/群体受击/伤害飘字。
   */
  onGroupAttack: ((events: Extract<GameEvent, { type: 'skill-damage' }>[]) => void) | null = null;
  onManaFlow: ((ev: Extract<GameEvent, { type: 'mana-gain' }>, origins: BoardPoint[]) => void) | null = null;
  /** Fired for cascade levels 2+ and once more when an extra action is awarded. */
  onComboPulse: ((level: number) => void) | null = null;
  /**
   * 风暴演出回调（storm-change，阶段 2）：App 负责顶部指示器的弹入/淡出与
   * 对应色一次性爆发 FX；召唤音效由本类按 stormChangePlan 在同一时间点播放。
   */
  onStormChange: ((ev: Extract<GameEvent, { type: 'storm-change' }>) => void) | null = null;
  private extraTurnComboLevel = 2;
  private manaOriginCache = new Map<number, BoardPoint>();

  constructor(
    private board: BoardView,
    private fx: FXLayer,
    private shakeTarget: Container,
    private audio: AudioManager,
  ) {}

  /** 播放一整条事件流，返回在全部动画结束后 resolve 的 Promise */
  play(events: GameEvent[]): Promise<void> {
    const tl = gsap.timeline();
    this.timeline = tl;
    this.manaOriginCache.clear();
    this.groupAttackConsumed.clear();
    tl.timeScale(AnimConfig.globalScale);

    // 预计算：每个连锁等级首次出现的消除事件下标，
    // 使屏幕震动/连击飘字每级只触发一次（而非每个消除组都触发）
    this.leadEliminationIndex = this.computeChainLeads(events);
    this.extraTurnComboLevel = extraActionComboLevel(events);
    // 群体攻击批次：连续 range='all' 的 skill-damage 归为一批（首下标 → 整批事件）
    this.groupAttackBatches = this.computeGroupAttackBatches(events);
    // 特殊宝石清除批次：连续的 gem-explode / gem-destroy 归为一批同时引爆
    // （末日骷髅环、至尊环、炸弹连环会产出多个清除事件，逐个播会"一颗颗慢慢爆"）
    const clearBatches = computeClearEventBatches(events);
    this.clearBatches = clearBatches.leaders;
    this.clearBatchMembers = clearBatches.members;
    const manaSources = this.computeManaSources(events);

    events.forEach((ev, i) => this.appendSegment(tl, ev, i, manaSources.get(i) ?? []));

    return new Promise((resolve) => {
      tl.eventCallback('onComplete', () => {
        this.timeline = null;
        this.manaOriginCache.clear();
        resolve();
      });
      // 空时间线立即完成
      if (tl.getChildren().length === 0) {
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
      if (ev.type === 'skill-damage' && ev.range === 'all') {
        const group: Extract<GameEvent, { type: 'skill-damage' }>[] = [];
        let j = i;
        while (j < events.length) {
          const e = events[j];
          if (e.type === 'skill-damage' && e.range === 'all') {
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

  private computeManaSources(events: GameEvent[]): Map<number, ManaOriginRef[]> {
    const result = new Map<number, ManaOriginRef[]>();
    let available: ManaOriginRef[] = [];

    events.forEach((ev, index) => {
      // 消除、技能摧毁/爆破的颜色宝石都可作为法力流的来源点
      if (ev.type === 'elimination' || ev.type === 'gem-destroy' || ev.type === 'gem-explode') {
        available = ev.cells
          .filter((cell) => cell.gemType.kind === 'color')
          .map((cell) => ({ gemId: cell.gemId, pos: { ...cell.pos } }));
        return;
      }
      if (ev.type === 'mana-gain') {
        const take = Math.max(0, Math.min(ev.amount, available.length));
        result.set(index, available.splice(0, take));
        return;
      }
      if (ev.type === 'gravity' || ev.type === 'refill' || ev.type === 'swap') {
        available = [];
      }
    });

    return result;
  }

  /** 立即跳到终态（需求 25.2）：加速结算剩余动画 */
  skip(): void {
    if (this.timeline) {
      this.timeline.progress(1);
    }
  }

  /** 设置全局速度倍率（需求 25.1） */
  setSpeed(scale: number): void {
    AnimConfig_setGlobalScale(scale);
    if (this.timeline) this.timeline.timeScale(scale);
  }

  private center(pos: CellPos): { x: number; y: number } {
    return this.board.cellCenter(pos);
  }

  private appendSegment(
    tl: gsap.core.Timeline,
    ev: GameEvent,
    index: number,
    manaOrigins: ManaOriginRef[],
  ): void {
    // 只有紧跟在 gravity 后面的 refill 才与其并行；被其他事件隔开则各自独立
    if (ev.type !== 'refill') { this.pendingFallLabel = null; this.pendingFallMaxCells = 0; }
    // 特殊宝石清除批次：批内非首事件已随批首合并播放，直接跳过
    if (this.clearBatchMembers.has(index)) return;
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
        tl.add(() => {
          const points = manaOrigins.map((origin) =>
            this.manaOriginCache.get(origin.gemId) ?? this.center(origin.pos),
          );
          this.onManaFlow?.(ev, points);
        });
        const flowTime = AnimConfig.manaFlow.duration +
          Math.max(0, manaOrigins.length - 1) * AnimConfig.manaFlow.stagger;
        tl.to({}, { duration: flowTime });
        tl.add(() => this.onBattleEvent?.(ev));
        break;
      }
      case 'defeat':
        // App starts effect 0353 before removing the card; queued replacements wait for the drift.
        tl.add(() => this.onBattleEvent?.(ev));
        tl.to({}, {
          duration: (AnimConfig.frameFX.death_drift.duration + 40 + AnimConfig.defeat.cardExitDuration) / 1000,
        });
        break;
      case 'skull-damage':
        // 音效与震屏改由 App 在冲撞命中瞬间触发（卡肉同步），此处只派发事件
        tl.add(() => {
          this.onBattleEvent?.(ev);
        });
        break;
      case 'attack-struggle':
        // 队首被控攻击落空：App 播放挣扎动画（小幅前冲被拉回），预留其时长
        tl.add(() => this.onBattleEvent?.(ev));
        tl.to({}, { duration: 0.42 });
        break;
      case 'skill-cast':
        // Attribute-specific cast audio is selected by App at this event timestamp.
        tl.add(() => this.onBattleEvent?.(ev));
        break;
      case 'extra-turn':
        tl.add(() => {
          // Extra actions continue the same selected elimination/chain sound ladder.
          this.audio.playChain(this.extraTurnComboLevel);
          this.onComboPulse?.(this.extraTurnComboLevel);
          // App plays the 0082 board-centered blessing only for skill-granted extra turns.
          this.onBattleEvent?.(ev);
        });
        // 仅技能主动给的额外回合预留 0082 动画时长；常规三消给的额外回合只走轻反馈，不占长时间线。
        if (ev.source === 'skill') {
          tl.to({}, { duration: AnimConfig.frameFX.extra_turn.duration / 1000 });
        }
        break;
      case 'game-over':
        tl.add(() => this.onBattleEvent?.(ev));
        break;
      // —— 技能效果事件（需求 3-7）——
      case 'skill-damage':
        // 群体攻击批次：首事件承接整批的一次释放 + 同时命中；批内其余事件跳过（避免逐个弹道）
        if (ev.range === 'all') {
          const batch = this.groupAttackBatches.get(index);
          if (batch) {
            this.appendGroupAttack(tl, batch);
          }
          // 非首下标的 all 事件已被首事件聚合，跳过
          break;
        }
        this.appendSkillDamage(tl, ev);
        break;
      case 'buff':
        this.appendBuff(tl, ev);
        break;
      case 'status-apply':
        // 施加瞬间只播短闪(~0.32s)；DoT 大动画留给 tick，硬控/软控挂持续层（App 侧处理）。
        tl.add(() => this.onBattleEvent?.(ev));
        tl.to({}, {
          duration: (ev.statusId === 'poison' || ev.statusId === 'burning' || ev.statusId === 'frozen')
            ? AnimConfig.frameFX.poison_flash.duration / 1000
            : 0.12,
        });
        break;
      case 'status-tick':
        // DoT 掉血此刻爆发大动画：为毒/火完整序列帧预留时长。
        tl.add(() => this.onBattleEvent?.(ev));
        tl.to({}, {
          duration: ev.statusId === 'poison'
            ? AnimConfig.frameFX.poison_apply.duration / 1000
            : ev.statusId === 'burning'
              ? AnimConfig.frameFX.burning_apply.duration / 1000
              : 0.12,
        });
        break;
      case 'status-expire':
        tl.add(() => this.onBattleEvent?.(ev));
        tl.to({}, { duration: 0.12 });
        break;
      case 'status-cleanse':
        tl.add(() => this.onBattleEvent?.(ev));
        tl.to({}, { duration: AnimConfig.frameFX.heal_cleanse.duration / 1000 });
        break;
      case 'special-gem-trigger':
        // 触发本身没有独立序列帧：交给 App 播放 CSS 高亮/行列扫光，
        // 这里保留一个短时间段，确保后续 gem-destroy/gem-explode 不抢在反馈前发生。
        tl.add(() => this.onBattleEvent?.(ev));
        tl.to({}, { duration: 0.24 });
        break;
      case 'gem-create':
        this.appendGemCreate(tl, ev);
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
  ): void {
    tl.add(() => {
      // Splash is an immediate area impact; do not play the generic projectile whoosh.
      // 骷髅爆炸（炸毁骷髅）命中时播 skullHit 专用音效，也不走技能弹道音。
      if (ev.range !== 'splash' && !ev.skullBurst) this.audio.play('skill');
      this.onBattleEvent?.(ev);
    });
    // 留出弹道飞行→命中的时间（App 侧 playProjectile 约 340ms + 命中演出），
    // 避免时间线在弹体到达前就推进到下一事件。
    // Splash has no projectile; other hits reserve worst-case flight plus impact frames.
    const hold = ev.skullBurst
      ? 0.34 // 骨白能量弹：飞行 ≤240ms + 飘字/卡面反馈一拍，不叠任何爆炸层
      : ev.range === 'splash'
      ? (ev.chainIndex ?? 0) === 0
        ? AnimConfig.frameFX.splash_chain_cast.duration / 1000
        : AnimConfig.frameFX.splash_chain_sword.duration / 1000
      : (AnimConfig.projectile.maxDuration + Math.max(
          AnimConfig.frameFX.water_single_hit.duration,
          AnimConfig.frameFX.yellow_single_hit.duration,
          AnimConfig.frameFX.green_single_hit.duration,
          AnimConfig.frameFX.hit_spark.duration,
        )) / 1000;
    tl.to({}, { duration: hold });
  }

  /** 增益：派发事件（App 上浮增益数字 + 刷新属性） */
  private appendBuff(
    tl: gsap.core.Timeline,
    ev: Extract<GameEvent, { type: 'buff' }>,
  ): void {
    tl.add(() => this.onBattleEvent?.(ev));
    const hold = ev.stat === 'hp'
      ? AnimConfig.frameFX.heal_cleanse.duration / 1000
      : ev.stat === 'armor'
        ? AnimConfig.frameFX.armor_up.duration / 1000
        : 0.1;
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
        gsap.to(s.scale, { x: 1, y: 1, duration: 0.28, ease: 'back.out(2)' });
        gsap.to(s, { alpha: 1, duration: 0.2, ease: 'power1.out' });
      }
    });
    tl.to({}, { duration: 0.3 });
  }

  /** 宝石转化：变更精灵纹理并高光脉冲 */
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
          gsap.fromTo(s.scale, { x: 1.3, y: 1.3 }, { x: 1, y: 1, duration: 0.26, ease: 'back.out(2)' });
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
          gsap.to(s, { rotation: (Math.random() - 0.5) * 1.4, duration: 0.24, ease: 'power2.in' });
          gsap.to(s.scale, { x: 0, y: 0, duration: 0.24, ease: 'power2.in' });
          gsap.to(s, { alpha: 0, duration: 0.2, ease: 'power1.in' });
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
    tl.add(() => {
      this.audio.play('gemExplosion');
      // 派发给 App：在爆破范围中心叠加序列帧特效（唱主角，App 掌握覆盖层坐标）
      this.onBattleEvent?.(ev);
      for (const cell of ev.cells) {
        const { x, y } = this.center(cell.pos);
        const sprite = this.board.getSprite(cell.gemId);
        this.manaOriginCache.set(cell.gemId, sprite ? { x: sprite.x, y: sprite.y } : { x, y });
        // 不再每颗画程序化冲击环（那会与中心序列帧抢戏、显廉价）；
        // 只保留宝石本体被"炸没"的缩放淡出，外溅交给中心序列帧统一表达。
        if (sprite) {
          const s = sprite as unknown as { scale: { x: number; y: number }; alpha: number };
          gsap.to(s.scale, { x: 0, y: 0, duration: 0.24, ease: 'power3.in' });
          gsap.fromTo(s, { alpha: 1 }, { alpha: 0, duration: 0.22, ease: 'power1.in' });
        }
      }
    });
    tl.to({}, { duration: AnimConfig.frameFX.energy_burst.duration / 1000 + 0.12 });
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
      // 每个连锁等级仅触发一次震动 + 飘字（需求 19.5），避免叠加糊成一团
      if (chain > 1 && isLead) {
        this.onComboPulse?.(chain);
        screenShake(this.shakeTarget, chain);
        const first = this.center(ev.cells[0].pos);
        this.fx.comboText(first.x, first.y, chain);
      }
      for (const cell of ev.cells) {
        const sprite = this.board.getSprite(cell.gemId);
        const { x, y } = this.center(cell.pos);
        this.manaOriginCache.set(cell.gemId, sprite ? { x: sprite.x, y: sprite.y } : { x, y });
        const col = colorOf(cell.gemType);
        // 粒子/闪光在消除一开始就炸开，填满整个时长的视觉
        this.fx.burst(x, y, col, intensity);
        if (sprite) {
          // 干净利落地缩小消失，不做夸张过冲
          gsap.to(sprite.scale, {
            x: 0,
            y: 0,
            duration: cfg.duration,
            ease: 'power2.in',
          });
          gsap.to(sprite, {
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
    gsap.fromTo(
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

function AnimConfig_setGlobalScale(scale: number): void {
  (AnimConfig as unknown as { globalScale: number }).globalScale = scale;
}
