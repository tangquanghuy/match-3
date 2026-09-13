import { Container } from 'pixi.js';
import { gsap } from 'gsap';
import type { GameEvent } from '@engine/events';
import type { CellPos } from '@engine/types';
import { BoardView } from './BoardView';
import { FXLayer, screenShake } from './FXLayer';
import { AnimConfig, fallDuration } from './AnimationConfig';
import { colorOf } from './GemSprite';
import type { AudioManager } from './AudioManager';
import { extraActionComboLevel } from './turnHudLogic';

type ManaOriginRef = { gemId: number; pos: CellPos };
type BoardPoint = { x: number; y: number };

/**
 * 事件流播放器（需求 18, 23, 25）。
 * 把引擎产出的事件流编排为 GSAP 时间线，按因果顺序逐段播放。
 * 集中控制动画速度与跳过（需求 25）。
 */
export class EventStreamPlayer {
  private timeline: gsap.core.Timeline | null = null;

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
    if (ev.type !== 'refill') this.pendingFallLabel = null;
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
      case 'gem-create':
        this.appendGemCreate(tl, ev);
        break;
      case 'gem-transform':
        this.appendGemTransform(tl, ev);
        break;
      case 'gem-destroy':
        this.appendGemDestroy(tl, ev);
        break;
      case 'gem-explode':
        this.appendGemExplode(tl, ev);
        break;
      case 'summon':
        tl.add(() => this.onBattleEvent?.(ev));
        if (ev.destination === 'field') {
          // App plays effect 0011; frameFX durations are ms while GSAP uses seconds.
          tl.to({}, { duration: AnimConfig.frameFX.summon_rune.duration / 1000 });
        } else {
          tl.to({}, { duration: 0.08 });
        }
        break;
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
      if (ev.range !== 'splash') this.audio.play('skill');
      this.onBattleEvent?.(ev);
    });
    // 留出弹道飞行→命中的时间（App 侧 playProjectile 约 340ms + 命中演出），
    // 避免时间线在弹体到达前就推进到下一事件。
    // Splash has no projectile; other hits reserve worst-case flight plus impact frames.
    const hold = ev.range === 'splash'
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

  private appendReshuffle(
    tl: gsap.core.Timeline,
    ev: Extract<GameEvent, { type: 'reshuffle' }>,
  ): void {
    if (ev.moves.length === 0) return;

    // 棋盘中心（聚拢点）
    const cx = (this.board.gridPixels) / 2;
    const cy = (this.board.gridPixels) / 2;

    // 位置变动的宝石 → 新格中心
    const newCenter = new Map<number, { x: number; y: number }>();
    for (const mv of ev.moves) newCenter.set(mv.gemId, this.center(mv.to));

    // 收集全部宝石精灵及其最终落位（变动的用新位，未变动的用当前位）
    const all: { sprite: ReturnType<BoardView['getSprite']>; finalX: number; finalY: number }[] = [];

    // 阶段一：全部宝石朝中心聚拢 + 缩小淡出 + 轻微旋转
    tl.add(() => {
      for (const child of this.board.layer.children) {
        const sprite = child as unknown as {
          gemId: number; x: number; y: number; rotation: number;
          scale: { x: number; y: number };
        };
        const fin = newCenter.get(sprite.gemId) ?? { x: sprite.x, y: sprite.y };
        all.push({ sprite: this.board.getSprite(sprite.gemId), finalX: fin.x, finalY: fin.y });

        // 朝中心收拢的中途点（带一点随机散布，更自然）
        const gx = cx + (sprite.x - cx) * 0.25 + (Math.random() - 0.5) * 30;
        const gy = cy + (sprite.y - cy) * 0.25 + (Math.random() - 0.5) * 30;
        gsap.to(sprite, { x: gx, y: gy, rotation: (Math.random() - 0.5) * 1.2, duration: 0.3, ease: 'power2.in' });
        gsap.to(sprite.scale, { x: 0.45, y: 0.45, duration: 0.3, ease: 'power2.in' });
      }
    });
    tl.to({}, { duration: 0.32 });

    // 阶段二：瞬移到各自最终位置（此时已缩小，不易察觉跳变）
    tl.add(() => {
      for (const item of all) {
        const s = item.sprite as unknown as { x: number; y: number } | undefined;
        if (s) {
          s.x = item.finalX;
          s.y = item.finalY;
        }
      }
    });

    // 阶段三：错落散开、缩放弹回、旋转归位
    tl.add(() => {
      let i = 0;
      for (const item of all) {
        const s = item.sprite as unknown as {
          rotation: number; scale: { x: number; y: number };
        } | undefined;
        if (!s) continue;
        const delay = (i % 12) * 0.012;
        gsap.to(s, { rotation: 0, duration: 0.4, delay, ease: 'power2.out' });
        gsap.to(s.scale, { x: 1, y: 1, duration: 0.45, delay, ease: 'back.out(2)' });
        i++;
      }
    });
    tl.to({}, { duration: 0.5 });
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

    for (const mv of ev.moves) {
      const to = this.center(mv.to);
      const cells = Math.abs(mv.to.row - mv.from.row);
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
    const label = this.pendingFallLabel ?? `refill_${tl.getChildren().length}`;
    if (this.pendingFallLabel === null) tl.addLabel(label);
    this.pendingFallLabel = null;
    let maxEnd = 0;

    // 每列补充数：整列新宝石按堆叠顺序紧贴棋盘顶上方，作为一个刚性堆整体下落
    const perCol = new Map<number, number>();
    for (const sp of ev.spawns) perCol.set(sp.to.col, (perCol.get(sp.to.col) ?? 0) + 1);

    for (const sp of ev.spawns) {
      const stack = perCol.get(sp.to.col) ?? 1;
      const to = this.center(sp.to);
      const startY = to.y - this.board.cellSize * stack;
      const duration = fallDuration(stack);
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
            this.landSquash(sprite, stack);
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
