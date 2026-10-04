import { startBackgroundTicker } from './backgroundTicker';
import { Application, Container, Graphics } from 'pixi.js';
import { gsap } from 'gsap';
import { BoardView } from './BoardView';
import { InputController } from './InputController';
import { EventStreamPlayer } from './EventStreamPlayer';
import { AudioManager, BOARD_SFX_URLS } from './AudioManager';
import { FXLayer } from './FXLayer';
import { loadGemTextures } from './gemTextures';
import { loadDecodedAudio } from './audioBank';
import { createHuntBoard } from '../engine/HuntBoard';
import type { CellPos } from '../engine/types';
import type { GameEvent } from '../engine/events';
import { backgroundMusic } from '../audio/BackgroundMusic';

/** Board-only battle scene: same sprites, gesture controller, event player and sound bank. */
export class HuntBoardScene {
  readonly board = new BoardView(64);
  private app = new Application();
  private root = new Container();
  private fx = new FXLayer(64);
  private audio = new AudioManager();
  private player = new EventStreamPlayer(this.board, this.fx, this.root, this.audio);
  private input: InputController | null = null;
  private observer: ResizeObserver | null = null;
  private initialized = false;
  private disposed = false;
  private musicActive = false;
  private cells: readonly number[] = [];
  private effects = new Set<gsap.core.Animation>();
  onSwap: ((from: number, to: number) => void) | null = null;
  onMerge: ((event: Extract<GameEvent, { type: 'gem-merge' }>) => void) | null = null;

  constructor(private host: HTMLElement) {}

  async init(): Promise<void> {
    await Promise.all([loadGemTextures(), ...BOARD_SFX_URLS.map(loadDecodedAudio)]);
    if (this.disposed) return;
    await this.app.init({ width: 512, height: 512, backgroundAlpha: 0, antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1), autoDensity: true });
    this.initialized = true;
    if (this.disposed) { this.app.destroy(true, { children: true }); return; }
    const canvas = this.app.canvas;
    canvas.setAttribute('aria-label', '寻宝棋盘，拖动宝物或依次点选相邻两格进行交换');
    canvas.setAttribute('role', 'application');
    canvas.dataset.testid = 'hunt-canvas';
    this.host.appendChild(canvas);
    this.root.addChild(this.board, this.fx);
    const mask = new Graphics().rect(0, 0, 512, 512).fill(0xffffff);
    this.root.addChild(mask);
    this.board.mask = mask;
    this.app.stage.addChild(this.root);
    this.fx.onFiniteAnimation = animation => {
      this.effects.add(animation);
      // Completed animations are pruned between moves; callbacks remain untouched.
    };
    this.input = new InputController(this.board, canvas);
    this.input.enabled = false;
    this.input.canInteract = cell => this.cells[cell.row * 8 + cell.col] !== 7;
    this.input.onInteractStart = () => { this.audio.init(); void this.audio.resume(); };
    this.input.onSwapRequest = (a, b) => this.onSwap?.(a.row * 8 + a.col, b.row * 8 + b.col);
    this.player.onBattleEvent = event => { if (event.type === 'gem-merge') this.onMerge?.(event); };
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.host);
    this.resize();
  }

  private resize(): void {
    if (this.disposed || !this.initialized) return;
    const size = Math.max(1, Math.floor(Math.min(this.host.clientWidth, this.host.clientHeight)));
    this.app.renderer.resize(size, size);
    this.root.scale.set(size / 512);
  }

  sync(cells: readonly number[]): void {
    if (this.disposed) return;
    this.cells = cells.slice();
    this.board.syncFromBoard(createHuntBoard(cells));
  }

  set enabled(value: boolean) { if (this.input) this.input.enabled = value; }
  private stopBackgroundTick: (() => void) | null = null;

  setSuspended(value: boolean, hidden = value): void {
    if (this.disposed || !this.initialized) return;
    this.player.setPaused(value);
    if (hidden && !value) this.stopBackgroundTick ??= startBackgroundTicker();
    else { this.stopBackgroundTick?.(); this.stopBackgroundTick = null; }
    this.audio.setMuted(hidden);
    if (value) { this.app.stop(); void this.audio.suspend(); }
    else { this.app.start(); if (!hidden) void this.audio.resume(); }
  }

  startMusic(): void { this.musicActive = true; backgroundMusic.beginBattle('battle'); }
  async play(events: GameEvent[]): Promise<void> {
    if (this.disposed) return;
    for (const effect of this.effects) if (!effect.isActive()) this.effects.delete(effect);
    this.audio.init();
    void this.audio.resume();
    await this.player.play(events);
  }

  reject(from: number, to: number): Promise<void> {
    const pos = (i: number): CellPos => ({ row: Math.floor(i / 8), col: i % 8 });
    return this.play([{ type: 'swap-rejected', a: pos(from), b: pos(to), gemIdA: from + 1, gemIdB: to + 1 }]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopBackgroundTick?.();
    this.stopBackgroundTick = null;
    this.observer?.disconnect();
    this.input?.destroy();
    this.player.cancel();
    for (const effect of this.effects) effect.kill();
    this.effects.clear();
    for (const sprite of this.board.layer.children) { gsap.killTweensOf(sprite); gsap.killTweensOf(sprite.scale); }
    this.audio.dispose();
    if (this.musicActive) backgroundMusic.endBattle();
    if (this.initialized) this.app.destroy(true, { children: true });
    else { this.board.destroy({ children: true }); this.fx.destroy({ children: true }); }
  }
}
