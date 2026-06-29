import { Container } from 'pixi.js';
import { gsap } from 'gsap';
import type { GameEvent } from '@engine/events';
import type { CellPos } from '@engine/types';
import { BoardView } from './BoardView';
import { FXLayer, screenShake } from './FXLayer';
import { AnimConfig, fallDuration } from './AnimationConfig';
import { colorOf } from './GemSprite';
import type { AudioManager } from './AudioManager';

/**
 * 事件流播放器（需求 18, 23, 25）。
 * 把引擎产出的事件流编排为 GSAP 时间线，按因果顺序逐段播放。
 * 集中控制动画速度与跳过（需求 25）。
 */
export class EventStreamPlayer {
  private timeline: gsap.core.Timeline | null = null;

  /** 战斗事件回调：在时间线推进到该事件时触发，供 App 更新卡面（需求 19.6, 19.7） */
  onBattleEvent: ((ev: GameEvent) => void) | null = null;

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
    tl.timeScale(AnimConfig.globalScale);

    // 预计算：每个连锁等级首次出现的消除事件下标，
    // 使屏幕震动/连击飘字每级只触发一次（而非每个消除组都触发）
    this.leadEliminationIndex = this.computeChainLeads(events);

    events.forEach((ev, i) => this.appendSegment(tl, ev, i));

    return new Promise((resolve) => {
      tl.eventCallback('onComplete', () => {
        this.timeline = null;
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

  /** 设置全局速度倍率（需求 25.1） */
  setSpeed(scale: number): void {
    AnimConfig_setGlobalScale(scale);
    if (this.timeline) this.timeline.timeScale(scale);
  }

  private center(pos: CellPos): { x: number; y: number } {
    return this.board.cellCenter(pos);
  }

  private appendSegment(tl: gsap.core.Timeline, ev: GameEvent, index: number): void {
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
      case 'mana-gain':
      case 'defeat':
        tl.add(() => this.onBattleEvent?.(ev));
        break;
      case 'skull-damage':
        // 音效与震屏改由 App 在冲撞命中瞬间触发（卡肉同步），此处只派发事件
        tl.add(() => {
          this.onBattleEvent?.(ev);
        });
        break;
      case 'skill-cast':
        tl.add(() => {
          this.audio.play('skill');
          this.onBattleEvent?.(ev);
        });
        break;
      case 'extra-turn':
        tl.add(() => {
          this.audio.play('extraTurn');
          this.onBattleEvent?.(ev);
        });
        break;
      case 'game-over':
        tl.add(() => this.onBattleEvent?.(ev));
        break;
      default:
        break;
    }
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
      this.audio.playChain(chain);
      // 每个连锁等级仅触发一次震动 + 飘字（需求 19.5），避免叠加糊成一团
      if (chain > 1 && isLead) {
        screenShake(this.shakeTarget, chain);
        const first = this.center(ev.cells[0].pos);
        this.fx.comboText(first.x, first.y, chain);
      }
      for (const cell of ev.cells) {
        const sprite = this.board.getSprite(cell.gemId);
        const { x, y } = this.center(cell.pos);
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

  private appendGravity(
    tl: gsap.core.Timeline,
    ev: Extract<GameEvent, { type: 'gravity' }>,
  ): void {
    if (ev.moves.length === 0) return;
    let maxDur = 0;
    tl.add(() => {
      for (const mv of ev.moves) {
        const sprite = this.board.getSprite(mv.gemId);
        if (!sprite) continue;
        const to = this.center(mv.to);
        const dist = Math.abs(mv.to.row - mv.from.row);
        const dur = fallDuration(dist);
        maxDur = Math.max(maxDur, dur);
        gsap.to(sprite, {
          x: to.x,
          y: to.y,
          duration: dur,
          ease: AnimConfig.gravity.ease,
          delay: mv.to.col * AnimConfig.gravity.columnStagger,
        });
      }
    });
    tl.to({}, { duration: maxDur + 0.05 });
  }

  private appendRefill(
    tl: gsap.core.Timeline,
    ev: Extract<GameEvent, { type: 'refill' }>,
  ): void {
    if (ev.spawns.length === 0) return;
    let maxDur = 0;
    tl.add(() => {
      for (const sp of ev.spawns) {
        const sprite = this.board.addGem(
          { id: sp.gemId, type: sp.gemType },
          sp.to,
        );
        const to = this.center(sp.to);
        // 从棋盘上方落入
        const startY = -this.board.cellSize * (BoardModelRows() - sp.to.row);
        sprite.y = startY;
        const dur = fallDuration(sp.to.row + 1);
        maxDur = Math.max(maxDur, dur);
        gsap.fromTo(
          sprite,
          { y: startY },
          {
            y: to.y,
            duration: dur,
            ease: AnimConfig.refill.ease,
            delay: sp.to.col * AnimConfig.gravity.columnStagger,
          },
        );
      }
    });
    tl.to({}, { duration: maxDur + 0.05 });
  }
}

// 避免在模块顶层 import 造成循环，封装小工具
function BoardModelRows(): number {
  return 8;
}

function AnimConfig_setGlobalScale(scale: number): void {
  (AnimConfig as unknown as { globalScale: number }).globalScale = scale;
}
