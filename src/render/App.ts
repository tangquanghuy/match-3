import { Application, Container } from 'pixi.js';
import { gsap } from 'gsap';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { BoardGenerator } from '@engine/boardGen';
import { pickHintSwap } from '@engine/boardUtils';
import { chooseEnemySwap } from '@engine/ai';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { MatchState, PlayerSide, BaseColor } from '@engine/types';
import type { Character, Team } from '@engine/types';
import type { CellPos } from '@engine/types';
import type { GameEvent } from '@engine/events';
import { BoardView } from './BoardView';
import type { GemSprite } from './GemSprite';
import { FXLayer } from './FXLayer';
import { impactShake } from './FXLayer';
import { EventStreamPlayer } from './EventStreamPlayer';
import { InputController } from './InputController';
import { AudioManager } from './AudioManager';
import { AnimConfig } from './AnimationConfig';
import { TeamView, CARD_W, setTeamSize, getTeamSize } from './TeamView';
import type { CharacterCard } from './TeamView';
import { ManaDistributor } from '@engine/ManaDistributor';
import { loadGemTextures } from './gemTextures';
// 命中爆点序列帧（DNF 108stairs hit_dodge，已对齐拼成横向 strip）
import slashStripUrl from '../assets/fx/hit_108stairs_strip.png';

/** 立绘 URL 生成：封面目录下按角色名取 webp（中文路径需编码） */
function portraitUrl(name: string): string {
  return `https://rpg.bolt.qzz.io/${encodeURIComponent('封面')}/${encodeURIComponent(name)}.webp`;
}

/** 我方/敌方角色（用于预览展示真实立绘；第4名用于 4 人调试模式） */
const LEFT_NAMES = ['法露特', '奥契丝', '璐米欧儿', '星极'];
const RIGHT_NAMES = ['夜斗', '绯', '癌骑士', '亡月女神'];

/** 队伍人数调试开关：从 localStorage 读取，默认 3 */
function readTeamSize(): number {
  const v = Number(localStorage.getItem('debug.teamSize'));
  return v === 4 ? 4 : 3;
}

/** 每名角色的颜色需求配置（演示用：从单色到多色混合，每色 6 点法力） */
const MANA_PER_COLOR = 6;
const COLOR_SETS: BaseColor[][] = [
  [BaseColor.Red],
  [BaseColor.Blue, BaseColor.Purple],
  [BaseColor.Green, BaseColor.Yellow, BaseColor.Red],
  [BaseColor.Blue, BaseColor.Green, BaseColor.Yellow, BaseColor.Purple, BaseColor.Brown, BaseColor.Red],
];

/** 占位角色（战斗表现层未接入前，仅用于驱动引擎的法力/伤害结算） */
function makeTeam(side: PlayerSide, size: number): Team {
  const baseId = side === PlayerSide.Left ? 0 : 4;
  const names = side === PlayerSide.Left ? LEFT_NAMES : RIGHT_NAMES;
  const chars: Character[] = [];
  for (let i = 0; i < size; i++) {
    const cols = COLOR_SETS[i % COLOR_SETS.length];
    const manaRequirement: Partial<Record<BaseColor, number>> = {};
    for (const c of cols) manaRequirement[c] = MANA_PER_COLOR;
    chars.push({
      id: baseId + i,
      name: names[i],
      maxHp: 40,
      hp: 40,
      attack: 4,
      armor: 0,
      colors: [...cols],
      manaRequirement,
      manaPool: {},
      skillId: 'none',
      statuses: [],
      defeated: false,
    });
  }
  return { player: side, characters: chars };
}

export class App {
  /** slash steps 关键帧仅注入一次的标记 */
  private static slashKeyframesInjected = false;
  /** 命中 strip 预解码缓存（保持引用避免被 GC），首屏即触发加载 */
  private static slashStripImg: HTMLImageElement | null = null;
  private static preloadSlashStrip(): void {
    if (App.slashStripImg) return;
    const img = new Image();
    img.src = slashStripUrl;
    App.slashStripImg = img;
  }
  private app = new Application();
  private root = new Container();
  private board!: BoardView;
  private fx!: FXLayer;
  private player!: EventStreamPlayer;
  private input!: InputController;
  private audio = new AudioManager();
  private engine!: TurnEngine;
  private rng = new SeededRNG(Date.now() & 0xffffffff);
  private nextId = 100000;
  private idleTweens: gsap.core.Tween[] = [];
  /** 战斗表现层：左右队伍视图 */
  private leftTeamView!: TeamView;
  private rightTeamView!: TeamView;
  /** 角色卡 DOM 覆盖层 */
  private overlay!: HTMLDivElement;
  /** 游戏整体容器（canvas + 卡片覆盖层），全屏时整体缩放 */
  private wrapper!: HTMLDivElement;
  private mountEl!: HTMLElement;
  private baseW = 0;
  private baseH = 0;
  /** 提示相关 */
  private hintTimer: number | null = null;
  private hintTweens: gsap.core.Tween[] = [];
  /** 提示中被弹跳的精灵 -> 原始 y，用于复位 */
  private hintHomeY = new Map<GemSprite, number>();

  async init(mount: HTMLElement): Promise<void> {
    // 预加载命中序列帧 strip：避免首次攻击时贴图尚未解码导致特效几乎看不见
    void App.preloadSlashStrip();

    // 队伍人数调试开关（3/4），影响卡片尺寸，需在读取 CARD_W 前设置
    const teamSize = readTeamSize();

    // 棋盘格子尺寸：放大棋盘以提升立绘观感（卡片高/宽随棋盘联动）
    const cellSize = 76;
    const gridPx = cellSize * BoardModel.COLS;
    // 卡片尺寸按实际棋盘高度联动（卡竖向填满棋盘）
    setTeamSize(teamSize, gridPx);

    const margin = 48;
    // 队伍列紧贴棋盘：列宽=卡宽，列与棋盘间留一个小间隙
    const colGap = 12;
    // 最外侧留出"宝石出框区"：我方卡左侧 / 敌方卡右侧的页面空白
    const gemSpace = 30;
    const sideColW = CARD_W + colGap;
    const dimW = gemSpace * 2 + sideColW * 2 + gridPx;
    const dimH = gridPx + margin * 2;

    await this.app.init({
      width: dimW,
      height: dimH,
      background: 0x0e0e16,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    // 画布与 DOM 覆盖层包进同一个 wrapper：wrapper 在 #app 里居中，
    // 内部 canvas 与卡片覆盖层共用同一坐标系，保证对齐。
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.width = `${dimW}px`;
    wrapper.style.height = `${dimH}px`;
    wrapper.style.transformOrigin = 'center center';
    this.app.canvas.style.display = 'block';
    wrapper.appendChild(this.app.canvas);
    mount.appendChild(wrapper);
    this.wrapper = wrapper;
    this.mountEl = mount;
    this.baseW = dimW;
    this.baseH = dimH;

    const overlay = document.createElement('div');
    overlay.style.position = 'absolute';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.width = `${dimW}px`;
    overlay.style.height = `${dimH}px`;
    overlay.style.pointerEvents = 'none';
    wrapper.appendChild(overlay);
    this.overlay = overlay;

    this.createFullscreenButton(wrapper);
    this.createTeamSizeToggle(wrapper, teamSize);
    this.createTurnBanner(wrapper);

    // 预加载宝石贴图（需求 21.4）；失败则回退程序化绘制，不阻塞可玩性
    await loadGemTextures();

    // 棋盘容器：水平居中，左右让出 宝石区 + 队伍列
    this.root.x = gemSpace + sideColW;
    this.root.y = margin;
    this.app.stage.addChild(this.root);

    // 构建引擎
    const rng = this.rng;
    const idGen = () => this.nextId++;
    const genBoard = new BoardGenerator(rng, idGen, 0.16).generate();
    const state = createGameState(genBoard, makeTeam(PlayerSide.Left, teamSize), makeTeam(PlayerSide.Right, teamSize));
    this.engine = new TurnEngine(state, rng, idGen);
    this.engine.skullChance = 0.16; // 骷髅为棋盘常驻成分（Gems of War 风格）

    // 视图
    this.board = new BoardView(cellSize);
    this.root.addChild(this.board);
    this.fx = new FXLayer(cellSize);
    this.root.addChild(this.fx);

    // 战斗队伍视图（需求 19.6, 19.10）：左队居左、右队居右，竖向居中，紧贴棋盘
    const teamsH = TeamView.totalHeight();
    const teamY = margin + (gridPx - teamsH) / 2;
    const boardLeft = gemSpace + sideColW;
    const boardRight = boardLeft + gridPx;

    this.leftTeamView = new TeamView(state.teams[PlayerSide.Left], PlayerSide.Left, {
      portraits: Object.fromEntries(
        state.teams[PlayerSide.Left].characters.map((ch) => [ch.id, portraitUrl(ch.name)]),
      ),
    });
    this.leftTeamView.mount(this.overlay, boardLeft - colGap - CARD_W, teamY);

    this.rightTeamView = new TeamView(state.teams[PlayerSide.Right], PlayerSide.Right, {
      portraits: Object.fromEntries(
        state.teams[PlayerSide.Right].characters.map((ch) => [ch.id, portraitUrl(ch.name)]),
      ),
    });
    this.rightTeamView.mount(this.overlay, boardRight + colGap, teamY);

    this.board.syncFromBoard(genBoard);
    this.player = new EventStreamPlayer(this.board, this.fx, this.root, this.audio);
    this.player.onBattleEvent = (ev) => this.onBattleEvent(ev);

    // 输入
    this.input = new InputController(this.board);
    this.input.onSwapRequest = (a, b) => this.handleSwap(a, b);
    this.input.onInteractStart = () => this.stopIdle();
    this.input.onInteractEnd = () => this.startIdle();

    // 首次交互初始化音频（需求 26.5）
    const initAudio = () => {
      this.audio.init();
      window.removeEventListener('pointerdown', initAudio);
    };
    window.addEventListener('pointerdown', initAudio);

    // 快进：按住空格加速（需求 25.1）
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') this.player.setSpeed(3);
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this.player.setSpeed(1);
    });

    // 开局：我方行动
    this.setTurn(PlayerSide.Left);
    this.startIdle();

    // 初始适配视口：窗口模式下若画布超出可视区域则自动缩小
    this.applyScale();
  }
  private createFullscreenButton(wrapper: HTMLDivElement): void {
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', '全屏');
    btn.style.cssText = [
      'position:absolute', 'right:1px', 'bottom:1px', 'z-index:10',
      'width:22px', 'height:22px', 'padding:0',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(11,10,9,.62)', 'border:1px solid rgba(216,194,144,.34)',
      'border-radius:6px', 'cursor:pointer', 'color:#d8c290',
      'backdrop-filter:blur(2px)', 'transition:border-color .2s,background .2s',
    ].join(';');
    const icon = (expand: boolean) =>
      expand
        ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M16 21h3a2 2 0 0 0 2-2v-3M8 21H5a2 2 0 0 1-2-2v-3"/></svg>`
        : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5a2 2 0 0 1 2-2h3M20 8V5a2 2 0 0 0-2-2h-3M20 16v3a2 2 0 0 1-2 2h-3M4 16v3a2 2 0 0 0 2 2h3"/></svg>`;
    btn.innerHTML = icon(true);
    btn.onmouseenter = () => { btn.style.borderColor = '#c9a35c'; btn.style.background = 'rgba(11,10,9,.85)'; };
    btn.onmouseleave = () => { btn.style.borderColor = 'rgba(216,194,144,.34)'; btn.style.background = 'rgba(11,10,9,.62)'; };
    btn.onclick = () => {
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      } else {
        void this.mountEl.requestFullscreen?.();
      }
    };
    document.addEventListener('fullscreenchange', () => {
      const fs = !!document.fullscreenElement;
      btn.innerHTML = icon(!fs);
      this.applyScale();
    });
    window.addEventListener('resize', () => this.applyScale());
    wrapper.appendChild(btn);
  }

  /** 等比缩放 wrapper 适配视口：全屏时填满；窗口模式下若超出视口则缩小（最大不超过原始尺寸） */
  private applyScale(): void {
    const fit = Math.min(window.innerWidth / this.baseW, window.innerHeight / this.baseH);
    if (document.fullscreenElement) {
      this.wrapper.style.transform = `scale(${fit})`;
    } else {
      // 窗口模式：仅在画布超出视口时缩小，避免在大屏上被放大失真
      const scale = Math.min(1, fit);
      this.wrapper.style.transform = scale < 1 ? `scale(${scale})` : '';
    }
  }

  /** 调试开关：切换 3 / 4 人队伍（左上角），切换后重载页面应用 */
  private createTeamSizeToggle(wrapper: HTMLDivElement, current: number): void {
    const btn = document.createElement('button');
    btn.textContent = `${current}v${current}`;
    btn.title = '切换敌我队伍人数（3 / 4）';
    btn.style.cssText = [
      'position:absolute', 'left:1px', 'bottom:1px', 'z-index:10',
      'height:22px', 'padding:0 8px',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-family:Oswald,sans-serif', 'font-size:11px', 'font-weight:600', 'letter-spacing:.08em',
      'background:rgba(11,10,9,.62)', 'border:1px solid rgba(216,194,144,.34)',
      'border-radius:6px', 'cursor:pointer', 'color:#d8c290',
      'backdrop-filter:blur(2px)', 'transition:border-color .2s,background .2s',
    ].join(';');
    btn.onmouseenter = () => { btn.style.borderColor = '#c9a35c'; btn.style.background = 'rgba(11,10,9,.85)'; };
    btn.onmouseleave = () => { btn.style.borderColor = 'rgba(216,194,144,.34)'; btn.style.background = 'rgba(11,10,9,.62)'; };
    btn.onclick = () => {
      const next = getTeamSize() >= 4 ? 3 : 4;
      localStorage.setItem('debug.teamSize', String(next));
      location.reload();
    };
    wrapper.appendChild(btn);
  }

  /** 回合提示：仅靠行动方队伍外围描边高亮（无顶部条、无横幅） */
  private createTurnBanner(_wrapper: HTMLDivElement): void {
    // 顶部指示条已移除；回合提示完全交给队伍外框高亮
  }

  /** 设置当前行动方：行动方队伍整列外框高亮 */
  private setTurn(side: PlayerSide): void {
    const ally = side === PlayerSide.Left;
    this.leftTeamView.setTurnActive(ally);
    this.rightTeamView.setTurnActive(!ally);
  }

  /** 敌方 AI 自动行动：选一个合法交换并解析 */
  private async runEnemyTurn(): Promise<void> {
    // 切到敌方高亮，停顿后出手，节奏从容
    this.setTurn(PlayerSide.Right);
    await this.delay(800);

    const state = this.engine.getState();
    // 安全：必须轮到右方且等待输入
    if (state.activePlayer !== PlayerSide.Right || state.state !== MatchState.AwaitingInput) return;

    const swap = chooseEnemySwap(state.board, this.rng);
    if (!swap) return;

    await this.delay(250); // 出手前的短暂停顿
    const events = this.engine.resolveSwap(swap.a, swap.b);
    if (events.length === 0) return;
    await this.player.play(events);
    this.refreshTeams();
    await this.delay(400); // 解析后稍作停顿再进入下一轮
    this.afterResolve();
  }

  /** 一次解析结束后：根据 activePlayer 决定是否继续 AI 回合或交还玩家 */
  private afterResolve(): void {
    const state = this.engine.getState();
    if (state.state === MatchState.GameOver) {
      this.input.enabled = false;
      return;
    }
    if (state.activePlayer === PlayerSide.Right) {
      // 轮到敌方：禁用输入，启动 AI（停顿更长，切换更清晰）
      this.input.enabled = false;
      this.stopIdle();
      window.setTimeout(() => void this.runEnemyTurn(), 600);
    } else {
      // 轮到我方
      this.setTurn(PlayerSide.Left);
      this.input.enabled = true;
      this.startIdle();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((r) => window.setTimeout(r, ms));
  }

  private async handleSwap(a: CellPos, b: CellPos): Promise<void> {
    const state = this.engine.getState();
    if (state.state !== MatchState.AwaitingInput) return;
    // 仅我方回合可操作（敌方回合由 AI 接管）
    if (state.activePlayer !== PlayerSide.Left) return;

    const events = this.engine.resolveSwap(a, b);
    if (events.length === 0) return;

    this.input.enabled = false;
    this.stopIdle();
    await this.player.play(events);
    // 回合结束：刷新全部卡面数值与技能可释放高亮（需求 19.6, 19.10）
    this.refreshTeams();
    // 依据回合归属：可能轮到敌方 AI，或交还我方
    this.afterResolve();
  }

  /** 实时响应战斗事件：法力流入、受击、阵亡时即时更新对应卡片（需求 19.6, 19.7） */
  private onBattleEvent(ev: GameEvent): void {
    const state = this.engine.getState();
    switch (ev.type) {
      case 'mana-gain': {
        const card =
          this.viewOf(ev.player).getCard(ev.characterId);
        if (card) {
          card.refresh();
          const ch = this.findChar(ev.characterId);
          if (ch && ManaDistributor.isSkillCastable(ch.manaRequirement, ch.manaPool)) {
            card.pulseManaReady();
          }
        }
        break;
      }
      case 'skull-damage': {
        const card = this.cardOfChar(ev.targetId);
        if (card) card.refresh();
        // 攻击冲撞特效：攻击者立绘冲向目标，目标后退
        this.playAttackLunge(ev.attackerId, ev.targetId);
        break;
      }
      case 'defeat': {
        const card = this.cardOfChar(ev.characterId);
        if (card) card.refresh();
        break;
      }
      default:
        break;
    }
    void state;
  }

  private viewOf(side: PlayerSide): TeamView {
    return side === PlayerSide.Left ? this.leftTeamView : this.rightTeamView;
  }

  /** 攻击冲撞特效：攻击者立绘冲向对面队伍方向，目标立绘后退 */
  private playAttackLunge(attackerId: number, targetId: number): void {
    const attacker = this.cardOfChar(attackerId);
    const target = this.cardOfChar(targetId);
    if (!attacker) return;
    // 攻击者属于哪一方决定冲撞方向：左队向右(+)，右队向左(-)
    const attackerSide = this.sideOfChar(attackerId);
    const dir = attackerSide === PlayerSide.Right ? -1 : 1;
    // 冲撞距离：跨过棋盘到对面，取两卡水平间距的一部分（用屏幕实测距离更稳）
    let dist = 220;
    if (target) {
      const a = attacker.el.getBoundingClientRect();
      const t = target.el.getBoundingClientRect();
      const gap = Math.abs(t.left - a.left);
      // getBoundingClientRect 受 wrapper 缩放影响，除回缩放还原到布局坐标
      const scale = this.currentScale();
      dist = Math.min(Math.max((gap / scale) * 0.7, 120), 520);
    }
    attacker.lunge(dir * dist, () => {
      // 命中瞬间：撞击音效 + 整屏震动(棋盘+卡片一起晃) + 目标后仰 + 命中特效
      this.audio.play('impact');
      impactShake(this.wrapper, this.wrapper.style.transform);
      if (target) target.recoil(dir * 1);
      this.playImpactFX(target ?? attacker, dir);
    });
  }

  /**
   * 命中特效（DOM 覆盖层）：接触点播放 DNF 斩击序列帧 + 目标受击白闪。
   * @param target 被命中的卡（取其朝攻击者一侧的边缘为接触点）
   * @param dir 攻击方向（+1 左打右 / -1 右打左）
   */
  private playImpactFX(target: CharacterCard, dir: number): void {
    const oRect = this.overlay.getBoundingClientRect();
    const tRect = target.el.getBoundingClientRect();
    const scale = this.currentScale();
    // 接触点：目标朝攻击者一侧的边缘、竖向居中（换算到覆盖层布局坐标）
    const edgeScreenX = dir > 0 ? tRect.left : tRect.right;
    const px = (edgeScreenX - oRect.left) / scale;
    const py = (tRect.top + tRect.height / 2 - oRect.top) / scale;

    // 爆炸序列帧（DNF）：在接触点叠一团爆炸，作为命中主视觉
    this.playSlashFX(px, py);

    // 目标白闪（受击高光）：短促提亮，给打击一点反馈，不抢斩击
    target.el.animate(
      [
        { filter: 'brightness(2.2) contrast(1.1)' },
        { filter: 'brightness(1) contrast(1)' },
      ],
      { duration: 220, easing: 'ease-out' },
    );
  }

  /**
   * 命中爆炸序列帧（DNF boom，4 帧）：在接触点播放一团爆炸。
   * 用 CSS steps() 逐帧播放 background-position（spritesheet 横向 strip）。
   * @param px 接触点 X（覆盖层布局坐标）
   * @param py 接触点 Y（覆盖层布局坐标）
   */
  private playSlashFX(px: number, py: number): void {
    const cfg = AnimConfig.slash;
    const stripW = cfg.frameW * cfg.frames;
    // 确保 steps 关键帧只注入一次
    if (!App.slashKeyframesInjected) {
      App.slashKeyframesInjected = true;
      const style = document.createElement('style');
      style.textContent =
        `@keyframes fxSlashPlay{from{background-position-x:0}` +
        `to{background-position-x:-${stripW}px}}`;
      document.head.appendChild(style);
    }
    const dispW = (cfg.frameW / cfg.frameH) * cfg.displayH;
    const el = document.createElement('div');
    el.style.cssText = [
      'position:absolute', `left:${px}px`, `top:${py}px`,
      `width:${cfg.frameW}px`, `height:${cfg.frameH}px`,
      'pointer-events:none', 'z-index:32',
      `background-image:url('${slashStripUrl}')`,
      `background-size:${stripW}px ${cfg.frameH}px`,
      'background-repeat:no-repeat',
      // 命中爆点本身较亮且彩色：轻提亮+增艳即可，加中性白发光描边强调撞击点，避免过曝。
      'filter:brightness(1.25) saturate(1.2) drop-shadow(0 0 10px rgba(255,255,255,.85))',
      // 缩放到目标显示尺寸 + 以中心定位（爆炸为放射状，无需按方向镜像）
      `transform:translate(-50%,-50%) scale(${dispW / cfg.frameW})`,
      'transform-origin:center center',
      `animation:fxSlashPlay ${cfg.duration}ms steps(${cfg.frames}) forwards`,
    ].join(';');
    this.overlay.appendChild(el);
    window.setTimeout(() => el.remove(), cfg.duration + 30);
  }

  /** 当前 wrapper 的缩放系数（applyScale 设置的 transform） */
  private currentScale(): number {
    const m = /scale\(([\d.]+)\)/.exec(this.wrapper.style.transform);
    return m ? parseFloat(m[1]) : 1;
  }

  /** 角色属于哪一方 */
  private sideOfChar(charId: number): PlayerSide {
    const state = this.engine.getState();
    return state.teams[PlayerSide.Left].characters.some((c) => c.id === charId)
      ? PlayerSide.Left
      : PlayerSide.Right;
  }

  private findChar(charId: number) {
    const state = this.engine.getState();
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      const ch = state.teams[side].characters.find((c) => c.id === charId);
      if (ch) return ch;
    }
    return undefined;
  }

  private cardOfChar(charId: number) {
    return this.leftTeamView.getCard(charId) ?? this.rightTeamView.getCard(charId);
  }

  /** 回合结束刷新两队卡面 + 技能可释放高亮 */
  private refreshTeams(): void {
    const state = this.engine.getState();
    this.leftTeamView.refreshAll();
    this.rightTeamView.refreshAll();
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      const view = this.viewOf(side);
      for (const ch of state.teams[side].characters) {
        const card = view.getCard(ch.id);
        if (!card) continue;
        const castable =
          !ch.defeated && ManaDistributor.isSkillCastable(ch.manaRequirement, ch.manaPool);
        card.setCastable(castable);
      }
    }
  }

  /** 待机微动（需求 19.9）：相位错开的呼吸 */
  private startIdle(): void {
    this.stopIdle();
    const cfg = AnimConfig.idle;
    let i = 0;
    for (const child of this.board.layer.children) {
      const s = child as unknown as { scale: { x: number; y: number } };
      const tw = gsap.to(s.scale, {
        x: 1 + cfg.scaleAmp,
        y: 1 + cfg.scaleAmp,
        duration: cfg.duration,
        ease: cfg.ease,
        yoyo: true,
        repeat: -1,
        delay: (i % 8) * 0.12,
      });
      this.idleTweens.push(tw);
      i++;
    }
    // 进入空闲：安排提示
    this.scheduleHint();
  }

  private stopIdle(): void {
    for (const tw of this.idleTweens) tw.kill();
    this.idleTweens = [];
    // 复位缩放
    for (const child of this.board.layer.children) {
      const s = child as unknown as { scale: { set: (n: number) => void } };
      s.scale.set(1);
    }
    // 交互/解析开始：取消提示
    this.clearHint();
  }

  /** 空闲一段时间后，高亮一组可行交换（需求 19.9 延伸） */
  private scheduleHint(): void {
    this.cancelHintTimer();
    this.hintTimer = window.setTimeout(() => {
      this.showHint();
    }, AnimConfig.hint.idleDelay * 1000);
  }

  private cancelHintTimer(): void {
    if (this.hintTimer !== null) {
      window.clearTimeout(this.hintTimer);
      this.hintTimer = null;
    }
  }

  private showHint(): void {
    // 仅在等待输入时提示
    if (this.engine.getState().state !== MatchState.AwaitingInput) return;
    const hint = pickHintSwap(this.engine.getState().board, this.rng);
    if (!hint) return;

    // 活泼提示：让该组宝石上下弹跳 + 轻微左右摇摆（错峰，像在"招手"）
    let i = 0;
    for (const pos of hint.cells) {
      const sprite = this.board.spriteAtCell(pos);
      if (!sprite) continue;
      const homeY = sprite.y;
      const delay = (i % hint.cells.length) * 0.12;

      // 上下弹跳（idle 呼吸只动 scale，不动 y，二者不冲突）
      const bounce = gsap.to(sprite, {
        y: homeY - this.board.cellSize * 0.08,
        duration: 0.45,
        ease: 'sine.inOut',
        yoyo: true,
        repeat: -1,
        delay,
      });
      // 左右摇摆（rotation，独立于 idle 的 scale，避免补间打架）
      const wobble = gsap.fromTo(
        sprite,
        { rotation: -0.05 },
        {
          rotation: 0.05,
          duration: 0.45,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
          delay,
        },
      );
      this.hintTweens.push(bounce, wobble);
      this.hintHomeY.set(sprite, homeY);
      i++;
    }
  }

  /** 清除当前提示高亮：杀掉补间并把精灵复位 */
  private clearHint(): void {
    this.cancelHintTimer();
    for (const tw of this.hintTweens) tw.kill();
    this.hintTweens = [];
    // 复位被提示动画移动/旋转过的精灵
    for (const [sprite, homeY] of this.hintHomeY) {
      sprite.y = homeY;
      sprite.rotation = 0;
    }
    this.hintHomeY.clear();
  }
}
