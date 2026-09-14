import { Application, Container, Point as PixiPoint } from 'pixi.js';
import { gsap } from 'gsap';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { BoardGenerator } from '@engine/boardGen';
import { pickHintSwap } from '@engine/boardUtils';
import { chooseEnemySwap } from '@engine/ai';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { TRAIT_LIBRARY } from '@engine/traits';
import { MatchState, PlayerSide, BaseColor } from '@engine/types';
import type { Character, GemType } from '@engine/types';
import {
  BattleSession,
  assignBattleRequest,
  loadStandaloneRequest,
  mapRequestToTeams,
  resizeRequestTeams,
} from '@session/index';
import type { BattleRequest, BattleResult, CombatantIdMap } from '@session/index';
import type { CellPos } from '@engine/types';
import type { GameEvent } from '@engine/events';
import { BoardView } from './BoardView';
import type { GemSprite } from './GemSprite';
import { FXLayer } from './FXLayer';
import { impactShake } from './FXLayer';
import { EventStreamPlayer } from './EventStreamPlayer';
import { StormIndicator, stormChangePlan } from './StormIndicator';
import { InputController } from './InputController';
import { AudioManager, type SfxName } from './AudioManager';
import { AnimConfig } from './AnimationConfig';
import { TeamView, CARD_W, setTeamSize, getTeamSize } from './TeamView';
import type { CharacterCard } from './TeamView';
import { CharacterDetailPanel } from './CharacterDetailPanel';
import { GameOverPanel } from './GameOverPanel';
import { TargetPicker } from './TargetPicker';
import { CellPicker } from './CellPicker';
import type { CellAimCoords } from './CellPicker';

import { TROOPS, troopToSummonTemplate } from '../data/troops';
import { setSummonTemplateResolver } from '@engine/traits';
import { ManaDistributor } from '@engine/ManaDistributor';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import type { SkillPrototype } from '@engine/skills/prototypes';
import { AiColorChooser, FixedColorChooser, prototypeNeedsColor } from '@engine/skills/colorChooser';
import { AiTargetChooser, FixedTargetChooser, prototypeChosenTargetMode } from '@engine/skills/targetChooser';
import { candidatesFor } from '@engine/skills/targeting';
import { AiCellChooser, FixedCellChooser, prototypeNeedsCell } from '@engine/skills/cellChooser';
import { loadGemTextures } from './gemTextures';
import { hasTurnSwitch } from './turnHudLogic';
// 命中爆点序列帧（DNF 108stairs hit_dodge，已对齐拼成横向 strip）
import slashStripUrl from '../assets/fx/hit_108stairs_strip.png';
// 技能序列帧 strip（scripts/build_fx_strip.ps1 由「特效500个【png】」拼成）
import waterBoltStripUrl from '../assets/fx/water_bolt_strip.png';
import fireBurstStripUrl from '../assets/fx/fire_burst_strip.png';
import energyBurstStripUrl from '../assets/fx/energy_burst_strip.png';
import hitSparkStripUrl from '../assets/fx/hit_spark_strip.png';
// 按颜色分的命中爆点帧动画（红=hit_spark，蓝=water_bolt，绿复用能量爆着色，其余各一张）
import hitGoldStripUrl from '../assets/fx/hit_gold_strip.png';
import hitPurpleStripUrl from '../assets/fx/hit_purple_strip.png';
import hitBrownStripUrl from '../assets/fx/hit_brown_strip.png';
import summonRuneStripUrl from '../assets/fx/summon_rune_strip.png';
import healCleanseStripUrl from '../assets/fx/heal_cleanse_strip.png';
import armorUpStripUrl from '../assets/fx/armor_up_strip.png';
import poisonApplyStripUrl from '../assets/fx/poison_apply_strip.png';
import waterSingleHitStripUrl from '../assets/fx/water_single_hit_strip.png';
import yellowSingleHitStripUrl from '../assets/fx/yellow_single_hit_strip.png';
import greenSingleHitStripUrl from '../assets/fx/green_single_hit_strip.png';
import deathDriftStripUrl from '../assets/fx/death_drift_strip.png';
import splashHitStripUrl from '../assets/fx/splash_hit_strip.png';
import splashChainCastStripUrl from '../assets/fx/splash_chain_cast_strip.png';
import splashChainSwordStripUrl from '../assets/fx/splash_chain_sword_strip.png';
import frozenApplyStripUrl from '../assets/fx/frozen_apply_strip.png';
import burningApplyStripUrl from '../assets/fx/burning_apply_strip.png';
// 群体攻击（ANIMATION_HANDOFF §19 P0-1）：0241 群攻释放 + 各色群体受击
import groupCastStripUrl from '../assets/fx/group_cast_strip.png';
import groupHitPurpleStripUrl from '../assets/fx/group_hit_purple_strip.png';
import groupHitRedStripUrl from '../assets/fx/group_hit_red_strip.png';
import groupHitBlueStripUrl from '../assets/fx/group_hit_blue_strip.png';
import groupHitYellowStripUrl from '../assets/fx/group_hit_yellow_strip.png';
import groupHitBrownStripUrl from '../assets/fx/group_hit_brown_strip.png';
import groupHitGreenStripUrl from '../assets/fx/group_hit_green_strip.png';
// 额外回合（ANIMATION_HANDOFF §19 P0-2）：0082 棋盘中央祝福动画
import extraTurnStripUrl from '../assets/fx/extra_turn_strip.png';
// 状态施加短闪（施加瞬间命中确认）
import poisonFlashStripUrl from '../assets/fx/poison_flash_strip.png';
import burningFlashStripUrl from '../assets/fx/burning_flash_strip.png';
import frozenFlashStripUrl from '../assets/fx/frozen_flash_strip.png';
// 状态持续层（循环挂在角色卡上直到解除）；冰冻改用程序化冰封蒙层，不用序列帧
import stunPersistStripUrl from '../assets/fx/stun_persist_strip.png';
import turnHudUrl from '../assets/ui/turn-hud-starfall.png';

/**
 * 立绘 URL 兜底生成：封面目录下按角色名取 webp（中文路径需编码）。
 * 战斗快照里给了 `portraitUrl` 的角色优先用快照值；召唤物等不在快照里的才走这里。
 */
function portraitUrl(name: string): string {
  return `https://rpg.bolt.qzz.io/${encodeURIComponent('封面')}/${encodeURIComponent(name)}.webp`;
}

/** 队伍人数调试开关：从 localStorage 读取，默认 3；沙箱/隐私模式失败时安全回退。 */
export function readTeamSize(): number {
  try {
    const v = Number(localStorage.getItem('debug.teamSize'));
    return v === 4 ? 4 : 3;
  } catch {
    return 3;
  }
}

const MANA_FLOW_COLOR: Record<BaseColor, string> = {
  [BaseColor.Red]: '#ff5968',
  [BaseColor.Green]: '#63dc78',
  [BaseColor.Blue]: '#5eb5ff',
  [BaseColor.Yellow]: '#ffd45a',
  [BaseColor.Purple]: '#bd7aff',
  [BaseColor.Brown]: '#d49355',
};

/** 增益飘字颜色（按属性区分） */
const BUFF_COLOR: Record<string, string> = {
  hp: '#7bd88f',
  armor: '#7fd4e0',
  attack: '#ff9a5a',
  magic: '#c69bff',
  mana: '#8fb8ff',
};

const SINGLE_HIT_FX: Partial<Record<BaseColor, string>> = {
  [BaseColor.Blue]: 'water_single_hit',
  [BaseColor.Yellow]: 'yellow_single_hit',
  [BaseColor.Green]: 'green_single_hit',
};

/**
 * 状态持续层的锚点与不透明度（挂在角色卡上，低调不挡立绘）。
 * yRatio：0=卡顶、0.5=中心、1=卡底；opacity：半透明叠加。
 */
const STATUS_PERSIST_STYLE: Record<string, { yRatio: number; opacity: number }> = {
  frozen: { yRatio: 0.66, opacity: 0.55 },   // 冰壳罩下半身
  stun: { yRatio: 0.12, opacity: 0.85 },     // 星星绕头顶
  silence: { yRatio: 0.16, opacity: 0.7 },   // 青光环在头顶/口部
  entangle: { yRatio: 0.55, opacity: 0.6 },  // 绿藤缠身，略偏下
};

/** 群体受击序列帧（按施法者主颜色，ANIMATION_HANDOFF §19 P0-1） */
const GROUP_HIT_FX: Record<BaseColor, string> = {
  [BaseColor.Purple]: 'group_hit_purple',
  [BaseColor.Red]: 'group_hit_red',
  [BaseColor.Blue]: 'group_hit_blue',
  [BaseColor.Yellow]: 'group_hit_yellow',
  [BaseColor.Brown]: 'group_hit_brown',
  [BaseColor.Green]: 'group_hit_green',
};

const SINGLE_HIT_SFX: Partial<Record<BaseColor, SfxName>> = {
  [BaseColor.Red]: 'skillHitRedSingle',
  [BaseColor.Purple]: 'skillHitPurpleSingle',
  [BaseColor.Yellow]: 'skillHitYellowSingle',
  [BaseColor.Blue]: 'skillHitWater',
  [BaseColor.Green]: 'skillHitGreenSingle',
};



export class App {
  /** slash steps 关键帧仅注入一次的标记 */
  private static slashKeyframesInjected = false;
  /** 序列帧特效 name → strip URL（AnimConfig.frameFX 的键对应此表） */
  private static readonly FRAME_FX_URL: Record<string, string> = {
    water_bolt: waterBoltStripUrl,
    fire_burst: fireBurstStripUrl,
    energy_burst: energyBurstStripUrl,
    hit_spark: hitSparkStripUrl,
    // 命中爆点帧动画：红/蓝复用已有 strip，其余各自的 strip
    hit_red: hitSparkStripUrl,
    hit_blue: waterBoltStripUrl,
    // 绿：库里没有干净的绿色命中素材，复用单一色调的蓝剑气 strip（water_bolt≈203°），
    // 靠滤镜 hue-rotate 转到翠绿。不能用 energy_burst——它是钴蓝紫多色，hue-rotate 不可控。
    hit_green: waterBoltStripUrl,
    hit_gold: hitGoldStripUrl,
    hit_purple: hitPurpleStripUrl,
    hit_brown: hitBrownStripUrl,
    // Effect 0011: indigo summon sigil with purple smoke.
    summon_rune: summonRuneStripUrl,
    heal_cleanse: healCleanseStripUrl,
    armor_up: armorUpStripUrl,
    poison_apply: poisonApplyStripUrl,
    water_single_hit: waterSingleHitStripUrl,
    yellow_single_hit: yellowSingleHitStripUrl,
    green_single_hit: greenSingleHitStripUrl,
    death_drift: deathDriftStripUrl,
    splash_hit: splashHitStripUrl,
    splash_chain_cast: splashChainCastStripUrl,
    splash_chain_sword: splashChainSwordStripUrl,
    frozen_apply: frozenApplyStripUrl,
    burning_apply: burningApplyStripUrl,
    // 群体攻击：0241 群攻释放 + 各色群体受击（ANIMATION_HANDOFF §19 P0-1）
    group_cast: groupCastStripUrl,
    group_hit_purple: groupHitPurpleStripUrl,
    group_hit_red: groupHitRedStripUrl,
    group_hit_blue: groupHitBlueStripUrl,
    group_hit_yellow: groupHitYellowStripUrl,
    group_hit_brown: groupHitBrownStripUrl,
    group_hit_green: groupHitGreenStripUrl,
    // 额外回合 0082（ANIMATION_HANDOFF §19 P0-2）
    extra_turn: extraTurnStripUrl,
    // 状态施加短闪
    poison_flash: poisonFlashStripUrl,
    burning_flash: burningFlashStripUrl,
    frozen_flash: frozenFlashStripUrl,
    // 状态持续层（冰冻改用程序化冰封蒙层，见 CharacterCard.setFrozen）
    stun_persist: stunPersistStripUrl,
  };
  /** 序列帧特效名 → 默认滤镜（无 opts.filter 时用）：给复用中性 strip 的项着色 */
  private static readonly FRAME_FX_FILTER: Record<string, string> = {
    // 蓝剑气 water_bolt(203°) → hue-rotate(-73deg) 转到翠绿(≈130°)。
    // 务必负角：正角会转到红/品红（方向转反）。增艳 + 绿色辉光贴合命中爆点。
    hit_green: 'filter:hue-rotate(-73deg) saturate(1.45) brightness(1.12) drop-shadow(0 0 8px rgba(120,255,150,.55))',
  };
  /** 已注入 steps 关键帧的序列帧特效名（每条 strip 宽度不同，各注入一次） */
  private static frameFXKeyframes = new Set<string>();
  private static frameFXPreloads = new Map<string, HTMLImageElement>();
  private static frameFXPreloadPromises = new Map<string, Promise<boolean>>();
  private static frameFXReadyUrls = new Set<string>();

  /** Load and decode one strip before its CSS steps animation is allowed to start. */
  private static preloadFrameFX(name: string): Promise<boolean> {
    const url = App.FRAME_FX_URL[name];
    if (!url) return Promise.resolve(false);
    if (App.frameFXReadyUrls.has(url)) return Promise.resolve(true);
    const existing = App.frameFXPreloadPromises.get(url);
    if (existing) return existing;

    const img = new Image();
    App.frameFXPreloads.set(url, img);
    const promise = new Promise<boolean>((resolve) => {
      let settled = false;
      let timeoutId: number | null = null;
      const finish = (ready: boolean) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        if (ready) App.frameFXReadyUrls.add(url);
        resolve(ready);
      };
      const decode = () => {
        if (typeof img.decode === 'function') {
          void img.decode()
            .then(() => finish(img.naturalWidth > 0))
            .catch(() => finish(img.complete && img.naturalWidth > 0));
        } else {
          finish(img.naturalWidth > 0);
        }
      };
      img.addEventListener('load', decode, { once: true });
      img.addEventListener('error', () => finish(false), { once: true });
      timeoutId = window.setTimeout(() => finish(false), 12_000);
      img.src = url;
      if (img.complete) decode();
    });
    App.frameFXPreloadPromises.set(url, promise);
    return promise;
  }

  private static deferredFrameFXScheduled = false;

  /** 首屏可玩后空闲时低并发预取特效；按需播放仍会复用同一 Promise。 */
  private static scheduleDeferredFrameFX(): void {
    if (App.deferredFrameFXScheduled) return;
    App.deferredFrameFXScheduled = true;
    const uniqueByUrl = new Map<string, string>();
    for (const [name, url] of Object.entries(App.FRAME_FX_URL)) {
      if (!uniqueByUrl.has(url)) uniqueByUrl.set(url, name);
    }
    const queue = [...uniqueByUrl.values()];
    const preloadQueue = async () => {
      let cursor = 0;
      const worker = async () => {
        while (cursor < queue.length) {
          const name = queue[cursor++];
          await App.preloadFrameFX(name);
        }
      };
      await Promise.all([worker(), worker()]);
    };
    const start = () => { void preloadQueue(); };
    const requestIdle = (window as typeof window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (requestIdle) requestIdle(start, { timeout: 1_500 });
    else window.setTimeout(start, 250);
  }

  /** 命中 strip 按需预解码缓存（保持引用避免被 GC）。 */
  private static slashStripReady = false;
  private static slashStripPromise: Promise<boolean> | null = null;
  private static preloadSlashStrip(): Promise<boolean> {
    if (App.slashStripReady) return Promise.resolve(true);
    if (App.slashStripPromise) return App.slashStripPromise;
    const img = new Image();
    App.slashStripPromise = new Promise<boolean>((resolve) => {
      let settled = false;
      let timeoutId: number | null = null;
      const finish = (ready: boolean) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) window.clearTimeout(timeoutId);
        App.slashStripReady = ready;
        resolve(ready);
      };
      const decode = () => {
        if (typeof img.decode === 'function') {
          void img.decode()
            .then(() => finish(img.naturalWidth > 0))
            .catch(() => finish(img.complete && img.naturalWidth > 0));
        } else finish(img.naturalWidth > 0);
      };
      img.addEventListener('load', decode, { once: true });
      img.addEventListener('error', () => finish(false), { once: true });
      timeoutId = window.setTimeout(() => finish(false), 12_000);
      img.src = slashStripUrl;
      if (img.complete) decode();
    });
    return App.slashStripPromise;
  }
  private app = new Application();
  private root = new Container();
  private board!: BoardView;
  private fx!: FXLayer;
  private player!: EventStreamPlayer;
  private input!: InputController;
  private audio = new AudioManager();
  private engine!: TurnEngine;
  /**
   * 本场随机源。`init()` 会用战斗快照里的 `seed` 重新播种：
   * 结果要回传 seed 并声称「同 seed + 同行动序列可复现」，因此不能用启动时间当种子。
   */
  private rng = new SeededRNG(Date.now() & 0xffffffff);
  private nextId = 100000;
  /** 本场战斗的输入快照（宿主注入或独立模式配置），结果导出时需要回引 */
  private battleRequest!: BattleRequest;
  /** 内部 id ↔ externalId 映射，唯一翻译处 */
  private idMap!: CombatantIdMap;
  /** 本场会话：提交行动、累积事件、导出结果 */
  private session!: BattleSession;
  /** 配置里显式给的立绘；召唤物等未在快照中的角色回落到按名字取图 */
  private portraitById = new Map<number, string>();
  private idleTweens: gsap.core.Tween[] = [];
  /** 战斗表现层：左右队伍视图 */
  private leftTeamView!: TeamView;
  private rightTeamView!: TeamView;
  /** 角色卡 DOM 覆盖层 */
  private overlay!: HTMLDivElement;
  /**
   * 状态持续层（硬控/软控循环挂在角色卡上，直到状态解除）：
   * key = `${charId}:${statusId}` → 覆盖层 DOM 节点。status-apply 挂载、status-expire/cleanse 移除。
   */
  private statusPersistLayers = new Map<string, HTMLDivElement>();
  /** 持续层异步挂载期间的意图集合（解码未完成时若已解除则取消挂载） */
  private persistPending = new Set<string>();
  /** 角色/技能详情面板（点击角色卡打开，需求 4） */
  private detailPanel!: CharacterDetailPanel;
  /**
   * 顶部风暴指示器（阶段 2）：与回合 HUD 共用棋盘顶部 44px 通道的另一侧，
   * 按施放风暴的一方贴其队伍列上沿；storm-change 事件驱动弹入/淡出。
   */
  private stormIndicator = new StormIndicator();
  /** 胜负结算面板（game-over 事件弹出，需求 15.4） */
  private gameOverPanel!: GameOverPanel;
  /**
   * 战斗结束回调：胜负判定的当下触发一次（不等玩家点“继续”），交出可回传宿主的
   * `BattleResult`，胜负见 `result.winner`。HostBridge 由此发出 `battle:result`。
   */
  onBattleFinished?: (result: BattleResult) => void;
  /** 结算面板点“继续”后触发，供宿主接管后续流程（战利品统计/页面跳转）。 */
  onBattleDismissed?: () => void;
  /** 结果只交出一次 */
  private battleResultEmitted = false;
  /** 技能注册表（主游戏拥有全部技能原型） */
  private registry!: ExtensionRegistry;
  /**
   * 棋盘逻辑格基准像素（init 时生效，夹取 [40,96]）。默认 40 = 手机横屏紧凑基准；
   * 测试台等大屏嵌入方在 init 前调大，使画布原生放大而非靠 transform 拉伸变糊。
   */
  baseCellSize = 40;
  /** 玩家选择 UI（选目标/选宝石），技能释放时按需调用 */
  private targetPicker = new TargetPicker();
  private cellPicker!: CellPicker;
  /** 释放流程互斥，避免重复触发 */
  private casting = false;
  /** 游戏整体容器（canvas + 卡片覆盖层），全屏时整体缩放 */
  private wrapper!: HTMLDivElement;
  private mountEl!: HTMLElement;
  private baseW = 0;
  private baseH = 0;
  private orientationBlocked = false;
  private pageHidden = false;
  private lifecycleBound = false;
  private turnNumber = 1;
  private turnTextEl: HTMLSpanElement | null = null;
  private turnHudEl: HTMLDivElement | null = null;
  private turnHudGlowEl: HTMLImageElement | null = null;
  private turnHudCenterFlashEl: HTMLDivElement | null = null;
  private turnHudSweepLeftEl: HTMLDivElement | null = null;
  private turnHudSweepRightEl: HTMLDivElement | null = null;
  private turnHudNodeGlowEls: HTMLSpanElement[] = [];
  private turnHudStreakEls: HTMLSpanElement[] = [];
  private turnHudParticleEls: HTMLSpanElement[] = [];
  /** 横幅底缘相对棋盘顶的下沉量（棋盘局部 px）：refill 生成线据此让宝石从夜幕下方出现 */
  private turnBannerDipPx = 0;
  /** CS2 击杀风格彗星尾光的头部亮核（左右各一），跟随尾光头端飞出 */
  private turnHudCometHeadEls: HTMLSpanElement[] = [];
  private turnHudAnimations: Animation[] = [];
  private turnHudComboTimer: number | null = null;
  /** 提示相关 */
  private hintTimer: number | null = null;
  private hintTweens: gsap.core.Tween[] = [];
  /** 提示中被弹跳的精灵 -> 原始 y，用于复位 */
  private hintHomeY = new Map<GemSprite, number>();

  /**
   * 启动一场战斗。
   *
   * @param request 宿主注入的战斗快照（需求 2.1）。省略时读独立模式配置
   *   `src/session/fixtures/standalone-battle.json`，并应用 3v3/4v4 调试开关；
   *   由宿主注入时以 request 的人数为准，调试开关不参与。
   */
  async init(mount: HTMLElement, request?: BattleRequest): Promise<void> {
    // Critical 只包含首屏棋盘资源；帧特效/音频均在可玩后延迟或首次使用时加载。
    const gemTexturesPromise = loadGemTextures();
    void App.preloadSlashStrip();

    // 技能注册要先于队伍解析：配置/宿主下发的 skillId 必须校验为已注册（需求 2.6）。
    this.registry = new ExtensionRegistry();
    registerSkillLibrary(this.registry.prototypes); // 主游戏拥有全部技能内容（需求 2C）
    const knownSkillIds = new Set([
      ...this.registry.skills.keys(),
      ...this.registry.prototypes.keys(),
    ]);
    // 特质/种族白名单：校验器按客户端注册表放行（种族集合与 scripts/build_traits.mjs
    // 的 TROOP_TYPE_MAP 值集合同源——那是客户端认识的 GoW 种族规范表）
    const knownTraitIds = new Set(TRAIT_LIBRARY.map((t) => t.code));
    const knownTroopTypes = new Set([
      'Beast', 'Fey', 'Elemental', 'Dragon', 'Human', 'Daemon', 'Divine', 'Monster',
      'Knight', 'Construct', 'Wildfolk', 'Rogue', 'Elf', 'Wargare', 'Giant', 'Undead',
      'Centaur', 'Goblin', 'Raksha', 'Mystic', 'Stryx', 'Naga', 'Merfolk', 'Urska',
      'Dwarf', 'Tauros', 'Orc', 'Mech', 'Gnome', 'Immortal',
    ]);

    // 队伍来源：宿主注入优先，否则读独立模式配置并应用 3v3/4v4 调试开关。
    const battleRequest = request
      ?? resizeRequestTeams(loadStandaloneRequest({ knownSkillIds, knownTraitIds, knownTroopTypes }), readTeamSize());
    // AIRP 分拣：tier 提供而 skillId/traitIds 省略的快照，在此按阶级+种族自动编配。
    // 只填空缺，显式值不动；必须在映射成引擎队伍之前执行。
    assignBattleRequest(battleRequest);
    const { playerTeam, enemyTeam, idMap } = mapRequestToTeams(battleRequest);
    this.battleRequest = battleRequest;
    this.idMap = idMap;
    // 用快照的 seed 播种，棋盘生成、补充与 AI 决策才真的可复现（需求 2、3.6）
    this.rng = new SeededRNG(battleRequest.seed);
    this.portraitById = new Map(
      idMap.entries()
        .filter((e) => e.snapshot.portraitUrl !== undefined)
        .map((e) => [e.internalId, e.snapshot.portraitUrl as string]),
    );

    // 队伍人数影响卡片尺寸，需在读取 CARD_W 前设置
    const teamSize = Math.max(playerTeam.characters.length, enemyTeam.characters.length);

    // 手机横屏紧凑基准：逻辑格默认 40px，最低 667×375 安全内容盒中不再缩小。
    // Pixi 与 DOM 仍共享同一逻辑坐标系，视口变化仅调整 wrapper 等比缩放。
    // 嵌入方（测试台等大屏场景）可在 init 前调大 baseCellSize，让画布原生变大而非拉伸变糊。
    const cellSize = Math.max(40, Math.min(96, Math.round(this.baseCellSize)));
    // Reserve a compact 44px HUD lane so the turn frame never covers the first gem row.
    const boardTopInset = 44;
    const gridPx = cellSize * BoardModel.COLS;
    const teamColumnPx = boardTopInset + gridPx;
    setTeamSize(teamSize, teamColumnPx);

    const topMargin = 4;
    const bottomMargin = 4;
    const colGap = 6;
    const gemSpace = 8;
    const sideColW = CARD_W + colGap;
    const dimW = gemSpace * 2 + sideColW * 2 + gridPx;
    const dimH = teamColumnPx + topMargin + bottomMargin;

    const resolution = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    await this.app.init({
      width: dimW,
      height: dimH,
      background: 0x0e0e16,
      antialias: true,
      resolution,
      autoDensity: true,
    });
    // 画布与 DOM 覆盖层包进同一个 wrapper：wrapper 在 #app 里居中，
    // 内部 canvas 与卡片覆盖层共用同一坐标系，保证对齐。
    const wrapper = document.createElement('div');
    wrapper.className = 'battle-wrapper';
    wrapper.dataset.testid = 'battle-wrapper';
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
    this.createTurnBanner(
      wrapper,
      gemSpace + sideColW,
      gridPx,
      topMargin + boardTopInset,
    );
    // 风暴指示器：顶部 44px HUD 通道的另一侧——回合 HUD 居中占棋盘上沿，
    // 指示器按施放方贴其队伍列上沿（左队 → 左列、右队 → 右列）。
    this.stormIndicator.mount(wrapper, {
      leftColumnX: gemSpace,
      rightColumnX: gemSpace + sideColW + gridPx + colGap,
      columnWidth: sideColW - colGap,
      laneTop: topMargin,
      laneHeight: boardTopInset,
    });

    // Critical 宝石贴图与 Pixi renderer 并行加载；同步棋盘前等待，失败时自动使用程序化回退。
    await gemTexturesPromise;

    // 棋盘容器：水平居中，左右让出 宝石区 + 队伍列
    this.root.x = gemSpace + sideColW;
    this.root.y = topMargin + boardTopInset;
    this.app.stage.addChild(this.root);

    // 构建引擎
    const rng = this.rng;
    const idGen = () => this.nextId++;
    const genBoard = new BoardGenerator(rng, idGen, 0.16).generate();
    const state = createGameState(genBoard, playerTeam, enemyTeam);
    this.engine = new TurnEngine(state, rng, idGen, this.registry);
    this.engine.setSummonResolver((ref) => troopToSummonTemplate(ref));
    // 死亡召唤特质（summonOnDeath 族）的召唤物装配：按生成器预解析的 referenceName 查兵种数据
    setSummonTemplateResolver((spec) => troopToSummonTemplate(spec.referenceName));
    this.engine.skullChance = 0.16; // 骷髅为棋盘常驻成分（Gems of War 风格）
    // 表现层一律通过 session 提交行动，事件流才会被完整累积进结果摘要与 digest
    this.session = new BattleSession({ request: battleRequest, idMap, engine: this.engine });

    // 视图
    this.board = new BoardView(cellSize);
    this.root.addChild(this.board);
    this.fx = new FXLayer(cellSize);
    this.root.addChild(this.fx);

    // 战斗队伍视图（需求 19.6, 19.10）：左队居左、右队居右，竖向居中，紧贴棋盘
    const teamsH = TeamView.totalHeight();
    const teamY = topMargin + (teamColumnPx - teamsH) / 2;
    const boardLeft = gemSpace + sideColW;
    const boardRight = boardLeft + gridPx;

    // 详情面板（挂在整体容器上，点击角色卡打开；需求 4）
    this.detailPanel = new CharacterDetailPanel(this.wrapper);
    // 胜负结算面板：点"继续"后交给宿主接管后续流程（战利品统计/页面跳转）
    this.gameOverPanel = new GameOverPanel(this.wrapper, () => {
      this.gameOverPanel.close();
      // 兜底：正常路径已在 game-over 时提交过，这里只在漏发时补一次（幂等）
      this.emitBattleResult();
      this.onBattleDismissed?.();
    });
    // 选宝石/选色/选目标均为棋盘式瞄准（无弹窗）；选宝石器需初始化
    this.cellPicker = new CellPicker();

    this.leftTeamView = new TeamView(state.teams[PlayerSide.Left], PlayerSide.Left, {
      portraits: Object.fromEntries(
        state.teams[PlayerSide.Left].characters.map((ch) => [ch.id, this.portraitFor(ch)]),
      ),
      // 短按=释放技能、长按=详情（需求 2C.1/2C.2）
      onShortPress: (id) => void this.castPlayerSkill(id),
      onLongPress: (id) => this.openCharacterDetail(id),
    });
    this.leftTeamView.mount(this.overlay, boardLeft - colGap - CARD_W, teamY);

    this.rightTeamView = new TeamView(state.teams[PlayerSide.Right], PlayerSide.Right, {
      portraits: Object.fromEntries(
        state.teams[PlayerSide.Right].characters.map((ch) => [ch.id, this.portraitFor(ch)]),
      ),
      // 敌方卡：仅长按查看详情（短按不释放，敌方由 AI 驱动）
      onLongPress: (id) => this.openCharacterDetail(id),
    });
    this.rightTeamView.mount(this.overlay, boardRight + colGap, teamY);

    this.board.syncFromBoard(genBoard);
    this.player = new EventStreamPlayer(this.board, this.fx, this.root, this.audio);
    this.player.setRefillSpawnTopPx(this.turnBannerDipPx);
    this.player.onBattleEvent = (ev) => this.onBattleEvent(ev);
    this.player.onGroupAttack = (events) => this.playGroupAttack(events);
    this.player.onManaFlow = (ev, origins) => this.playManaFlow(ev, origins);
    this.player.onComboPulse = (level) => this.playTurnHudCombo(level);
    this.player.onStormChange = (ev) => this.onStormChangePresentation(ev);

    // 输入
    this.input = new InputController(this.board, this.app.canvas);
    this.input.onSwapRequest = (a, b) => this.handleSwap(a, b);
    this.input.onInteractStart = () => this.clearHint();
    this.input.onInteractEnd = () => this.scheduleHint();

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

    // 开局：我方行动；页面生命周期和方向门禁共同决定是否启用输入/待机。
    this.setTurn(PlayerSide.Left);
    this.bindPageLifecycle();
    this.pageHidden = document.hidden;
    this.syncInteractionGate();
    if (this.input.enabled) this.startIdle();

    // 初始适配由统一布局入口处理；后续由 ResizeObserver/visualViewport 驱动。
    this.refreshLayout();
    App.scheduleDeferredFrameFX();
  }
  private createFullscreenButton(wrapper: HTMLDivElement): void {
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', '全屏');
    btn.dataset.testid = 'fullscreen-button';
    btn.style.cssText = [
      'position:absolute', 'right:-44px', 'bottom:0', 'z-index:10',
      'width:44px', 'height:44px', 'padding:0',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(11,10,9,.62)', 'border:1px solid rgba(216,194,144,.34)',
      'border-radius:8px', 'cursor:pointer', 'color:#d8c290',
      'backdrop-filter:blur(2px)', 'transition:border-color .2s,background .2s',
    ].join(';');
    const icon = (expand: boolean) =>
      expand
        ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M16 21h3a2 2 0 0 0 2-2v-3M8 21H5a2 2 0 0 1-2-2v-3"/></svg>`
        : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5a2 2 0 0 1 2-2h3M20 8V5a2 2 0 0 0-2-2h-3M20 16v3a2 2 0 0 1-2 2h-3M4 16v3a2 2 0 0 0 2 2h3"/></svg>`;
    btn.innerHTML = icon(true);
    btn.onmouseenter = () => { btn.style.borderColor = '#c9a35c'; btn.style.background = 'rgba(11,10,9,.85)'; };
    btn.onmouseleave = () => { btn.style.borderColor = 'rgba(216,194,144,.34)'; btn.style.background = 'rgba(11,10,9,.62)'; };
    btn.onclick = async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (this.mountEl.requestFullscreen) await this.mountEl.requestFullscreen();
      } catch (error) {
        console.warn('全屏请求被浏览器拒绝:', error);
      }
    };
    if (!this.mountEl.requestFullscreen) {
      btn.disabled = true;
      btn.title = '当前浏览器不支持全屏';
    }
    document.addEventListener('fullscreenchange', () => {
      const fs = !!document.fullscreenElement;
      btn.innerHTML = icon(!fs);
      this.refreshLayout();
    });
    window.addEventListener('resize', () => this.refreshLayout());
    wrapper.appendChild(btn);
  }

  /** 取角色立绘：优先用战斗快照里显式配置的 URL，召唤物等回落到按名字取图。 */
  private portraitFor(ch: Character): string {
    return this.portraitById.get(ch.id) ?? portraitUrl(ch.name);
  }

  /** 本场战斗的输入快照（宿主注入或独立模式配置）。 */
  getBattleRequest(): BattleRequest {
    return this.battleRequest;
  }

  /** 内部 id ↔ externalId 映射，供结果导出与宿主桥使用。 */
  getCombatantIdMap(): CombatantIdMap {
    return this.idMap;
  }

  /**
   * 导出可回传宿主的战斗结果；未分出胜负时返回 null。
   * 同一场战斗多次调用得到同一份数据（session 内缓存）。
   */
  exportResult(): BattleResult | null {
    if (!this.session?.isFinished()) return null;
    return this.session.buildResult();
  }

  /** 交出战斗结果，最多一次。战斗未结束时什么也不做。 */
  private emitBattleResult(): void {
    if (this.battleResultEmitted) return;
    const result = this.exportResult();
    if (result === null) return;
    this.battleResultEmitted = true;
    this.onBattleFinished?.(result);
  }

  /** 由 ResizeObserver/visualViewport 或窗口事件触发的统一布局入口。 */
  refreshLayout(): void {
    if (!this.wrapper || !this.mountEl || this.baseW <= 0 || this.baseH <= 0) return;
    const style = getComputedStyle(this.mountEl);
    const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const availableW = Math.max(0, this.mountEl.clientWidth - horizontalPadding);
    const availableH = Math.max(0, this.mountEl.clientHeight - verticalPadding);
    const fit = Math.min(availableW / this.baseW, availableH / this.baseH);
    // 紧凑基准在支持范围内只会放大；桌面端封顶，避免画面无限膨胀。
    const scale = Math.max(0.1, Math.min(1.75, fit));
    this.wrapper.style.transform = `scale(${scale})`;
  }

  /** 竖屏/过小视口是独立门禁状态，任何异步回合收尾都不能绕过它重新开启输入。 */
  setOrientationBlocked(blocked: boolean): void {
    this.orientationBlocked = blocked;
    if (this.wrapper) {
      this.syncInteractionGate();
      if (!blocked && !this.pageHidden && this.input.enabled) this.startIdle();
    }
  }

  private syncInteractionGate(): void {
    const blocked = this.orientationBlocked || this.pageHidden;
    this.wrapper.inert = blocked;
    this.wrapper.setAttribute('aria-hidden', String(blocked));
    this.leftTeamView.setInputEnabled(!blocked);
    this.rightTeamView.setInputEnabled(!blocked);
    if (blocked) {
      this.input.enabled = false;
      this.stopIdle();
      this.targetPicker.cancel();
      this.cellPicker.cancel();
      this.detailPanel.close();
    } else {
      this.syncPlayerInput();
    }
  }

  private bindPageLifecycle(): void {
    if (this.lifecycleBound) return;
    this.lifecycleBound = true;
    document.addEventListener('visibilitychange', () => {
      this.pageHidden = document.hidden;
      this.syncInteractionGate();
      if (this.pageHidden) void this.audio.suspend();
      else {
        this.refreshLayout();
        void this.audio.resume();
        if (this.input.enabled) this.startIdle();
      }
    });
    window.addEventListener('pageshow', () => {
      this.pageHidden = document.hidden;
      this.syncInteractionGate();
      this.refreshLayout();
      if (!this.pageHidden) void this.audio.resume();
      if (this.input.enabled) this.startIdle();
    });
  }

  private syncPlayerInput(): void {
    const state = this.engine.getState();
    this.input.enabled = !this.orientationBlocked
      && !this.pageHidden
      && !this.casting
      && state.state === MatchState.AwaitingInput
      && state.activePlayer === PlayerSide.Left;
  }

  /** 调试开关：切换 3 / 4 人队伍（左上角），切换后重载页面应用 */
  private createTeamSizeToggle(wrapper: HTMLDivElement, current: number): void {
    const btn = document.createElement('button');
    btn.textContent = `${current}v${current}`;
    btn.dataset.testid = 'team-size-toggle';
    btn.title = '切换敌我队伍人数（3 / 4）';
    btn.style.cssText = [
      'position:absolute', 'left:-44px', 'bottom:0', 'z-index:10',
      'min-width:44px', 'height:44px', 'padding:0 10px',
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
      try {
        localStorage.setItem('debug.teamSize', String(next));
        location.reload();
      } catch (error) {
        console.warn('无法保存队伍人数设置:', error);
      }
    };
    wrapper.appendChild(btn);
  }

  /** 回合横幅：星落素材按自然纵横比渲染，波浪底缘沉入棋盘首行上方，宽度与棋盘精确对齐 */
  private createTurnBanner(
    wrapper: HTMLDivElement,
    boardLeft: number,
    gridPx: number,
    boardTop: number,
  ): void {
    // 素材 1425×310：顶部金冠 + 星空主体 + 底部波浪羽化。宽度与棋盘对齐（不再外溢边框）；
    // 高度取自然纵横比，受「棋盘上方空间 + 羽化沉入深度」约束，空间不足时整体等比压缩。
    // 金冠保持在棋盘上方的预留车道内；宝石自夜幕后方落下、经半透明波谷显现（本层 z-index 高于画布）。
    const hudWidth = gridPx;
    const dipIntoBoard = Math.round((gridPx / BoardModel.COLS) * 0.42);
    const naturalHeight = Math.round((gridPx * 310) / 1425);
    const hudHeight = Math.min(naturalHeight, boardTop + dipIntoBoard);
    const hudTop = Math.max(0, boardTop + dipIntoBoard - hudHeight);
    this.turnBannerDipPx = Math.max(0, hudTop + hudHeight - boardTop);
    const hud = document.createElement('div');
    hud.className = 'turn-hud';
    hud.style.cssText = [
      'position:absolute',
      `left:${boardLeft + (gridPx - hudWidth) / 2}px`,
      `top:${hudTop}px`,
      `width:${hudWidth}px`, `height:${hudHeight}px`,
      'z-index:12', 'pointer-events:none', 'overflow:visible',
      'filter:drop-shadow(0 3px 7px rgba(0,0,0,.58))',
    ].join(';');

    const frame = document.createElement('img');
    frame.src = turnHudUrl;
    frame.alt = '';
    frame.draggable = false;
    frame.style.cssText = [
      'position:absolute', 'inset:0', 'width:100%', 'height:100%',
      'object-fit:fill', 'pointer-events:none', 'opacity:.96',
    ].join(';');

    // A screen-blended duplicate provides activation headroom without changing the idle asset.
    const glowFrame = document.createElement('img');
    glowFrame.src = turnHudUrl;
    glowFrame.alt = '';
    glowFrame.draggable = false;
    glowFrame.style.cssText = [
      'position:absolute', 'inset:0', 'width:100%', 'height:100%', 'z-index:2',
      'object-fit:fill', 'pointer-events:none', 'opacity:0', 'mix-blend-mode:screen',
      'clip-path:inset(0 0 66% 0)',
      'filter:brightness(1.35) saturate(1.28) drop-shadow(0 0 5px rgba(142,105,255,.46))',
    ].join(';');

    const comboFx = document.createElement('div');
    comboFx.style.cssText = [
      'position:absolute', 'inset:0', 'z-index:3', 'overflow:hidden',
      // plus-lighter 做线性相加发光：相比 screen 更能保留各段色相，叠加处不会迅速逼近纯白，
      // 配合下方压低的白色占比，中心才能读出“金→品红→紫”的层次而非一团白。
      'pointer-events:none', 'mix-blend-mode:plus-lighter',
    ].join(';');

    const centerFlash = document.createElement('div');
    centerFlash.style.cssText = [
      'position:absolute', 'left:50%', 'top:22%', 'width:72px', 'height:34px',
      'transform:translate(-50%,-50%) scale(.35)', 'opacity:0',
      // 缩小、降不透明度：只当中心底晕，不与头端争亮（像素分析显示原来中心比头端还厚还亮，锥向被压反）。
      'background:radial-gradient(ellipse at center,rgba(224,200,255,.4) 0%,rgba(168,124,250,.3) 24%,rgba(104,80,226,.12) 52%,transparent 74%)',
      'filter:blur(1px)',
    ].join(';');

    // 彗星尾光主体：右端(向左飞)/左端(向右飞)锚定在 HUD 中心，靠 scaleX 拉长，长度随连击增加。
    // 辉光包边：内金 / 中品红 / 外蓝紫。
    const trailShadow =
      'drop-shadow(0 0 4px rgba(255,206,132,.7)) drop-shadow(0 0 9px rgba(240,120,186,.48)) drop-shadow(0 0 17px rgba(150,110,255,.34))';
    // 改用“长椭圆径向渐变”做尾迹，不再用 clip 多边形（之前反复把锥向切反、且切出细线）。
    // 椭圆长轴沿飞行方向：亮心(focus)锚在头端，向中心方向亮度自然衰减、上下缘自然羽化，
    // 天然形成“头浓高、尾淡窄”的一束体积光。颜色靠径向色标：白金→亮橙→亮品红→品紫→透明。
    const trailBg = (toRight: boolean): string => {
      const focus = toRight ? '92% 50%' : '8% 50%'; // 头端(远离中心那侧)
      return `radial-gradient(ellipse 78% 116% at ${focus},`
        + 'rgba(255,246,214,.98) 0%,'
        + 'rgba(255,210,150,.92) 12%,'
        + 'rgba(255,166,110,.82) 26%,'
        + 'rgba(246,132,182,.62) 44%,'
        + 'rgba(200,130,238,.4) 62%,'
        + 'rgba(150,120,238,.2) 80%,'
        + 'transparent 100%)';
    };
    const sweepLeft = document.createElement('div');
    sweepLeft.style.cssText = [
      'position:absolute', 'left:50%', 'top:22%', 'width:108px', 'height:22px', 'opacity:0',
      'transform:translate(-100%,-50%) scaleX(.08)', 'transform-origin:right center',
      `background:${trailBg(false)}`,
      `filter:blur(.8px) ${trailShadow}`,
    ].join(';');
    const sweepRight = document.createElement('div');
    sweepRight.style.cssText = [
      'position:absolute', 'left:50%', 'top:22%', 'width:108px', 'height:22px', 'opacity:0',
      'transform:translate(0,-50%) scaleX(.08)', 'transform-origin:left center',
      `background:${trailBg(true)}`,
      `filter:blur(.8px) ${trailShadow}`,
    ].join(';');

    // 彗星头端亮核：不再是对称正圆，而是有方向感的“水滴”——
    // 亮心偏向飞行前端（远离中心），并沿尾迹方向拉成椭圆，与尾迹平滑衔接，去掉“贴了个圆点”的生硬感。
    // 左右方向相反：cometHeads[0] 向左飞（亮心偏左），[1] 向右飞（亮心偏右）。
    const cometHeads: HTMLSpanElement[] = [];
    for (let i = 0; i < 2; i++) {
      const head = document.createElement('span');
      const toLeft = i === 0;
      // 径向渐变焦点偏向飞行前端，让亮心在“头”的最前方
      const focus = toLeft ? '34% 50%' : '66% 50%';
      head.style.cssText = [
        'position:absolute', 'left:50%', 'top:22%', 'width:24px', 'height:14px', 'opacity:0',
        // 沿 X 拉伸成椭圆水滴；scaleX 由动画驱动，这里给基础扁率。头核是整条最亮点，坐实“流星头”。
        'transform:translate(-50%,-50%) scale(.3)', 'border-radius:50%',
        `background:radial-gradient(ellipse 58% 100% at ${focus},rgba(255,255,252,1) 0%,rgba(255,240,206,1) 16%,rgba(255,190,128,.86) 40%,rgba(238,132,196,.5) 64%,transparent 80%)`,
        'filter:blur(.4px) drop-shadow(0 0 5px rgba(255,214,140,.95)) drop-shadow(0 0 11px rgba(238,120,190,.55)) drop-shadow(0 0 18px rgba(150,110,255,.34))',
      ].join(';');
      cometHeads.push(head);
    }

    const nodeGlows: HTMLSpanElement[] = [];
    [10.5, 89.5].forEach((position) => {
      const nodeGlow = document.createElement('span');
      nodeGlow.style.cssText = [
        'position:absolute', `left:${position}%`, 'top:22%', 'width:52px', 'height:52px',
        'transform:translate(-50%,-50%) scale(.35)', 'opacity:0',
        'border-radius:50%',
        'background:radial-gradient(circle,rgba(243,226,255,.82) 0%,rgba(157,111,255,.46) 24%,rgba(91,88,226,.18) 52%,transparent 74%)',
        'filter:blur(.35px)',
      ].join(';');
      nodeGlows.push(nodeGlow);
    });

    const streaks: HTMLSpanElement[] = [];
    const streakPositions = [8, 17, 27, 38, 47, 57, 67, 76, 86, 94];
    streakPositions.slice(0, AnimConfig.hudCombo.streakCount).forEach((position, index) => {
      const streak = document.createElement('span');
      const height = 42 + ((index * 11) % 31);
      streak.style.cssText = [
        'position:absolute', `left:${position}%`, `top:${26 + (index % 3) * 3}%`,
        'width:3px', `height:${height}px`, 'opacity:0', 'transform-origin:top center', 'border-radius:2px',
        // 暖白起步后迅速转品紫，降低纯白占比
        'background:linear-gradient(180deg,rgba(255,246,232,.9),rgba(198,150,255,.82) 22%,rgba(120,132,255,.4) 64%,transparent)',
        'box-shadow:0 0 7px rgba(168,116,246,.8),0 0 3px rgba(255,214,150,.6)',
      ].join(';');
      const head = document.createElement('i');
      head.style.cssText = [
        'position:absolute', 'left:50%', `top:${52 + (index % 4) * 9}%`,
        'width:5px', 'height:5px', 'transform:translate(-50%,-50%) rotate(45deg)',
        'background:rgba(255,238,206,.96)',
        'box-shadow:0 0 7px 2px rgba(226,120,190,.7),0 0 3px rgba(255,224,160,.9)',
      ].join(';');
      streak.appendChild(head);
      streaks.push(streak);
      comboFx.appendChild(streak);
    });

    const particles: HTMLSpanElement[] = [];
    for (let i = 0; i < AnimConfig.hudCombo.particleCount; i++) {
      const particle = document.createElement('span');
      particle.style.cssText = [
        'position:absolute', 'left:50%', 'top:25%', 'width:4px', 'height:4px',
        'opacity:0', 'background:rgba(255,226,158,.96)', 'transform:translate(-50%,-50%) rotate(45deg) scale(.2)',
        'box-shadow:0 0 6px rgba(226,124,188,.85)',
      ].join(';');
      particles.push(particle);
      comboFx.appendChild(particle);
    }

    comboFx.prepend(centerFlash, sweepLeft, sweepRight, ...cometHeads, ...nodeGlows);

    // Keep positioning on the outer slot so the inner span can animate without losing centering.
    const textSlot = document.createElement('div');
    textSlot.style.cssText = [
      'position:absolute', 'left:50%', `top:${Math.round(hudHeight * 0.39)}px`,
      'transform:translateX(-50%)', 'z-index:4',
      'display:flex', 'align-items:center', 'justify-content:center',
    ].join(';');

    const text = document.createElement('span');
    text.textContent = this.turnLabel();
    text.style.cssText = [
      'position:relative', 'transform:translateY(-1px)',
      'font-family:"Playfair Display",Georgia,serif', 'font-weight:700',
      'font-size:17px', 'letter-spacing:.12em', 'font-variant-numeric:tabular-nums',
      'color:#f2dfae',
      'text-shadow:0 1px 2px rgba(0,0,0,.96),0 0 8px rgba(152,112,235,.25),0 0 4px rgba(205,164,82,.22)',
      'white-space:nowrap',
    ].join(';');

    textSlot.appendChild(text);
    hud.append(frame, glowFrame, comboFx, textSlot);
    wrapper.appendChild(hud);
    this.turnTextEl = text;
    this.turnHudEl = hud;
    this.turnHudGlowEl = glowFrame;
    this.turnHudCenterFlashEl = centerFlash;
    this.turnHudSweepLeftEl = sweepLeft;
    this.turnHudSweepRightEl = sweepRight;
    this.turnHudNodeGlowEls = nodeGlows;
    this.turnHudStreakEls = streaks;
    this.turnHudParticleEls = particles;
    this.turnHudCometHeadEls = cometHeads;
  }

  private playTurnHudCombo(chain: number): void {
    if (chain < 2) return;
    const hud = this.turnHudEl;
    const glow = this.turnHudGlowEl;
    const flash = this.turnHudCenterFlashEl;
    const sweepLeft = this.turnHudSweepLeftEl;
    const sweepRight = this.turnHudSweepRightEl;
    const text = this.turnTextEl;
    if (!hud || !glow || !flash || !sweepLeft || !sweepRight || !text) return;

    this.turnHudAnimations.forEach((animation) => animation.cancel());
    this.turnHudAnimations = [];
    if (this.turnHudComboTimer !== null) window.clearTimeout(this.turnHudComboTimer);

    const speed = Math.max(0.25, AnimConfig.globalScale);
    const duration = AnimConfig.hudCombo.duration / speed;
    const intensity = Math.min(1, 0.58 + (chain - 2) * 0.16);
    // 彗星尾光长度随连击增长（CS2 击杀风格）：连击越高，尾光拉得越长。
    const trailScale = Math.min(
      AnimConfig.hudCombo.trailMaxScale,
      AnimConfig.hudCombo.trailBaseScale + (chain - 2) * AnimConfig.hudCombo.trailPerChain,
    );
    const SWEEP_W = 108; // 尾光元素基准宽度（px），与 createTurnBanner 中一致
    const headDist = SWEEP_W * trailScale; // 尾光头端离 HUD 中心的像素距离
    // 尾光在主时长拉出后再缓慢消散，余韵时长由 trailFade 控制。
    const trailDur = duration + AnimConfig.hudCombo.trailFade / speed;
    hud.dataset.comboActive = String(chain);

    const run = (
      element: Element,
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions,
    ): Animation => {
      const animation = element.animate(keyframes, { fill: 'none', ...options });
      this.turnHudAnimations.push(animation);
      return animation;
    };

    run(hud, [
      { transform: 'scale(1)', offset: 0 },
      { transform: `scale(${1 + 0.008 * intensity})`, offset: 0.12 },
      { transform: 'scale(1)', offset: 0.52 },
      { transform: 'scale(1)', offset: 1 },
    ], { duration, easing: 'cubic-bezier(.2,.8,.25,1)' });

    run(glow, [
      { opacity: 0, offset: 0 },
      { opacity: 0.08 * intensity, offset: 0.05 },
      { opacity: 0.2 * intensity, offset: 0.23 },
      { opacity: 0.07 * intensity, offset: 0.54 },
      { opacity: 0, offset: 1 },
    ], { duration, easing: 'ease-out' });

    run(flash, [
      { opacity: 0, transform: 'translate(-50%,-50%) scale(.35)', offset: 0 },
      { opacity: 0.68 * intensity, transform: 'translate(-50%,-50%) scale(.76)', offset: 0.07 },
      { opacity: 0.3 * intensity, transform: 'translate(-50%,-50%) scale(1.02)', offset: 0.17 },
      { opacity: 0, transform: 'translate(-50%,-50%) scale(1.34)', offset: 0.38 },
      { opacity: 0, transform: 'translate(-50%,-50%) scale(1.34)', offset: 1 },
    ], { duration, easing: 'ease-out' });

    // 彗星尾光：头端(right center 锚点)从中心快速冲出并把尾巴拉长到 trailScale，
    // 到位后头部保持、整条尾光缓慢渐隐，留下 CS2 那种拖尾余韵。连击越高尾巴越长。
    const peakTrail = Math.min(1, 0.95 * intensity + 0.05);
    run(sweepLeft, [
      { opacity: 0, transform: 'translate(-100%,-50%) scaleX(.08)', offset: 0 },
      { opacity: peakTrail, transform: 'translate(-100%,-50%) scaleX(.35)', offset: 0.08 },
      { opacity: peakTrail, transform: `translate(-100%,-50%) scaleX(${trailScale})`, offset: 0.34 },
      { opacity: 0.5 * intensity, transform: `translate(-100%,-50%) scaleX(${trailScale})`, offset: 0.62 },
      { opacity: 0, transform: `translate(-100%,-50%) scaleX(${trailScale * 0.96})`, offset: 1 },
    ], { duration: trailDur, easing: 'cubic-bezier(.1,.75,.2,1)' });
    run(sweepRight, [
      { opacity: 0, transform: 'translate(0,-50%) scaleX(.08)', offset: 0 },
      { opacity: peakTrail, transform: 'translate(0,-50%) scaleX(.35)', offset: 0.08 },
      { opacity: peakTrail, transform: `translate(0,-50%) scaleX(${trailScale})`, offset: 0.34 },
      { opacity: 0.5 * intensity, transform: `translate(0,-50%) scaleX(${trailScale})`, offset: 0.62 },
      { opacity: 0, transform: `translate(0,-50%) scaleX(${trailScale * 0.96})`, offset: 1 },
    ], { duration: trailDur, easing: 'cubic-bezier(.1,.75,.2,1)' });

    // 彗星头亮核：跟随尾光头端从中心冲到 headDist 处，命中后短暂爆亮再拖散。
    // 冲刺阶段沿飞行轴 X 拉长（运动模糊/速度感），到位瞬间回弹成饱满椭圆，再收缩消散。
    const headEase = 'cubic-bezier(.1,.75,.2,1)';
    this.turnHudCometHeadEls.forEach((head, index) => {
      const dir = index === 0 ? -1 : 1; // 0=向左，1=向右
      const tip = dir * headDist;
      run(head, [
        { opacity: 0, transform: 'translate(-50%,-50%) scale(.24,.5)', offset: 0 },
        { opacity: peakTrail, transform: 'translate(-50%,-50%) scale(1.5,.62)', offset: 0.11 },
        { opacity: Math.min(1, peakTrail + 0.1), transform: `translate(calc(-50% + ${tip}px),-50%) scale(1.2,1.05)`, offset: 0.34 },
        { opacity: 0.32 * intensity, transform: `translate(calc(-50% + ${tip}px),-50%) scale(.82,.72)`, offset: 0.62 },
        { opacity: 0, transform: `translate(calc(-50% + ${tip * 1.02}px),-50%) scale(.5,.42)`, offset: 1 },
      ], { duration: trailDur, easing: headEase });
    });

    this.turnHudNodeGlowEls.forEach((nodeGlow, index) => {
      run(nodeGlow, [
        { opacity: 0, transform: 'translate(-50%,-50%) scale(.35)', offset: 0 },
        { opacity: 0, transform: 'translate(-50%,-50%) scale(.35)', offset: 0.2 + index * 0.025 },
        { opacity: 0.78 * intensity, transform: 'translate(-50%,-50%) scale(.9)', offset: 0.38 + index * 0.025 },
        { opacity: 0.26 * intensity, transform: 'translate(-50%,-50%) scale(1.12)', offset: 0.62 },
        { opacity: 0, transform: 'translate(-50%,-50%) scale(1.24)', offset: 0.88 },
        { opacity: 0, transform: 'translate(-50%,-50%) scale(1.24)', offset: 1 },
      ], { duration, easing: 'ease-out' });
    });

    run(text, [
      { filter: 'brightness(1)', textShadow: '0 1px 2px rgba(0,0,0,.96),0 0 8px rgba(152,112,235,.25)', offset: 0 },
      { filter: `brightness(${1.25 + intensity * 0.45})`, textShadow: `0 0 4px rgba(255,247,218,${0.65 * intensity}),0 0 13px rgba(158,115,255,${0.9 * intensity})`, offset: 0.14 },
      { filter: 'brightness(1.08)', textShadow: '0 1px 2px rgba(0,0,0,.96),0 0 8px rgba(152,112,235,.3)', offset: 0.56 },
      { filter: 'brightness(1)', textShadow: '0 1px 2px rgba(0,0,0,.96),0 0 8px rgba(152,112,235,.25)', offset: 1 },
    ], { duration, easing: 'ease-out' });

    this.turnHudStreakEls.forEach((streak, index) => {
      const delay = (110 + Math.abs(index - 4.5) * 7) / speed;
      const streakDuration = (480 + (index % 4) * 30) / speed;
      run(streak, [
        { opacity: 0, transform: 'translateY(-3px) scaleY(.18)', offset: 0 },
        { opacity: Math.min(1, (0.9 + (index % 3) * 0.06) * intensity), transform: 'translateY(1px) scaleY(.92)', offset: 0.22 },
        { opacity: 0.52 * intensity, transform: 'translateY(18px) scaleY(1.15)', offset: 0.64 },
        { opacity: 0, transform: 'translateY(30px) scaleY(1.28)', offset: 1 },
      ], { duration: streakDuration, delay, easing: 'cubic-bezier(.2,.7,.2,1)' });
    });

    this.turnHudParticleEls.forEach((particle, index) => {
      const direction = index % 2 === 0 ? -1 : 1;
      const distance = 58 + Math.floor(index / 2) * 38;
      const dx = direction * distance;
      const dy = 7 + (index % 4) * 8;
      const delay = (150 + index * 13) / speed;
      run(particle, [
        { opacity: 0, transform: 'translate(-50%,-50%) rotate(45deg) scale(.2)', offset: 0 },
        { opacity: 0.9 * intensity, transform: `translate(calc(-50% + ${dx * 0.28}px),calc(-50% + ${dy * 0.2}px)) rotate(45deg) scale(1)`, offset: 0.24 },
        { opacity: 0.35 * intensity, transform: `translate(calc(-50% + ${dx * 0.72}px),calc(-50% + ${dy * 0.72}px)) rotate(45deg) scale(.72)`, offset: 0.64 },
        { opacity: 0, transform: `translate(calc(-50% + ${dx}px),calc(-50% + ${dy}px)) rotate(45deg) scale(.3)`, offset: 1 },
      ], { duration: 330 / speed, delay, easing: 'cubic-bezier(.18,.72,.25,1)' });
    });

    this.turnHudComboTimer = window.setTimeout(() => {
      delete hud.dataset.comboActive;
      this.turnHudAnimations = [];
      this.turnHudComboTimer = null;
    }, trailDur + 80 / speed);
  }

  private turnLabel(): string {
    return `TURN ${String(this.turnNumber).padStart(2, '0')}`;
  }

  private advanceTurnHud(events: GameEvent[]): void {
    if (!hasTurnSwitch(events)) return;
    this.turnNumber += 1;
    const text = this.turnTextEl;
    if (!text) return;
    const next = this.turnLabel();
    const out = text.animate(
      [
        { opacity: 1, transform: 'translateY(-1px)', filter: 'brightness(1)' },
        { opacity: 0, transform: 'translateY(-7px)', filter: 'brightness(1.5)' },
      ],
      { duration: 150, easing: 'ease-in', fill: 'forwards' },
    );
    out.onfinish = () => {
      text.textContent = next;
      text.animate(
        [
          { opacity: 0, transform: 'translateY(6px)', filter: 'brightness(1.65)' },
          { opacity: 1, transform: 'translateY(-1px)', filter: 'brightness(1)' },
        ],
        { duration: 260, easing: 'cubic-bezier(.2,.8,.25,1)', fill: 'forwards' },
      );
    };
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
    const events = this.session.resolve({ type: 'swap', from: swap.a, to: swap.b });
    this.onEventsProduced?.(events);
    if (events.length === 0) return;
    await this.player.play(events);
    this.advanceTurnHud(events);
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
      // 轮到我方；方向门禁仍由 syncPlayerInput 统一裁决。
      this.setTurn(PlayerSide.Left);
      this.syncPlayerInput();
      if (this.input.enabled) this.startIdle();
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

    const events = this.session.resolve({ type: 'swap', from: a, to: b });
    this.onEventsProduced?.(events);
    if (events.length === 0) return;

    this.input.enabled = false;
    this.stopIdle();
    await this.player.play(events);
    this.advanceTurnHud(events);
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
          const becameFull = card.absorbMana(ev.color, ev.amount);
          if (becameFull) card.pulseManaReady();
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
      case 'attack-struggle': {
        // 队首被控（冰冻/缠绕）攻击落空：原地小幅前冲被拉回，不造成伤害
        this.playStruggle(ev.attackerId);
        break;
      }
      case 'defeat': {
        const leftCard = this.leftTeamView.getCard(ev.characterId);
        const rightCard = this.rightTeamView.getCard(ev.characterId);
        const card = leftCard ?? rightCard;
        if (!card) break;
        // 阵亡：清掉该角色残留的状态持续层 + 冰封卡面态
        this.removeAllStatusPersist(ev.characterId);
        card.setFrozen(false);
        card.setSilenced(false);
        card.setEntangled(false);
        // Keep the defeated card in the team column and gray it before the particles start.
        card.refresh();
        const removeDefeatedCard = () => {
          if (leftCard) this.leftTeamView.removeCharacterCard(ev.characterId);
          else if (rightCard) this.rightTeamView.removeCharacterCard(ev.characterId);
        };
        // Effect 0353 is faint, so place it slightly above center over the portrait area.
        const deathPoint = this.cardPointInOverlay(card, 0.43);
        if (deathPoint) {
          this.playFrameFX('death_drift', deathPoint.x, deathPoint.y, {
            onComplete: removeDefeatedCard,
          });
        } else {
          removeDefeatedCard();
        }
        break;
      }
      case 'game-over': {
        // 结算：锁输入、停演出，稍候片刻让阵亡动画收尾后弹出结算面板（需求 15.4）
        this.input.enabled = false;
        this.stopIdle();
        this.clearHint();
        const playerWon = ev.winner === PlayerSide.Left;
        // 结果在判定结束的当下就交出，不等玩家点“继续”：宿主拿结果不能依赖用户操作，
        // 否则页面被关掉战果就丢了。
        this.emitBattleResult();
        window.setTimeout(() => this.gameOverPanel.open(playerWon), 900);
        break;
      }
      // Skill presentation events.
      case 'skill-cast': {
        const casterColor = this.casterColor(ev.characterId);
        this.audio.play(casterColor === BaseColor.Brown ? 'skillCastEarth' : 'skill');
        break;
      }
      case 'skill-damage': {
        const card = this.cardOfChar(ev.targetId);
        if (!card) break;
        if (ev.range === 'splash') {
          this.playSplashChainDamage(ev, card);
          break;
        }

        const to = this.cardCenterInOverlay(card);
        const casterCard = this.cardOfChar(ev.casterId);
        const from = casterCard ? this.cardCenterInOverlay(casterCard) : null;
        const damage = ev.damage;
        const casterColor = this.casterColor(ev.casterId);
        const color = this.skillFxColor(ev.casterId);
        const isSingle = ev.range === 'single';
        const hitFx = isSingle && casterColor
          ? (SINGLE_HIT_FX[casterColor] ?? this.skillHitFx(ev.casterId))
          : this.skillHitFx(ev.casterId);
        const hitSfx: SfxName = isSingle && casterColor
          ? (SINGLE_HIT_SFX[casterColor] ?? 'hit')
          : 'hit';
        const audioLeadMs = isSingle && casterColor === BaseColor.Yellow
          ? AnimConfig.singleHitAudioLeadMs.yellow
          : isSingle && casterColor === BaseColor.Purple
            ? AnimConfig.singleHitAudioLeadMs.purple
            : 0;
        let hitAudioPlayed = false;
        const playHitAudio = () => {
          if (hitAudioPlayed) return;
          hitAudioPlayed = true;
          this.audio.play(hitSfx);
        };
        const impact = () => {
          if (to) {
            this.playFrameFX(hitFx, to.x, to.y);
            this.playHitBurst(to.x, to.y, color);
          }
          playHitAudio();
          card.floatText(`-${damage}`, '#ff6b6b');
          card.hitFlash();
          card.refresh();
        };
        if (from && to && ev.casterId !== ev.targetId) {
          this.playProjectile(from, to, color, impact, audioLeadMs > 0 ? {
            onApproach: playHitAudio,
            approachLeadMs: audioLeadMs,
          } : undefined);
        } else {
          impact();
        }
        break;
      }
      case 'gem-explode': {
        // 爆破：每颗被炸宝石都放一团能量星爆，从中心向外错峰点燃，读成一整片连爆。
        // 每团缩到约一个格子大小，带随机旋转，避免"克隆感"。
        const positions = ev.cells.map((cell) => cell.pos);
        const center = this.cellsCenterInOverlay(positions);
        // energy_burst 原始显示高 240 → 缩到约 1.5 个格子，贴合宝石尺度
        const perCellScale = (this.board.cellSize * 1.8) / AnimConfig.frameFX.energy_burst.displayH;
        for (const pos of positions) {
          const p = this.cellsCenterInOverlay([pos]);
          if (!p) continue;
          // 离爆心越远，起爆越晚（放射式连锁），最多错峰 ~120ms
          const dist = center ? Math.hypot(p.x - center.x, p.y - center.y) : 0;
          const delay = Math.min(120, dist * 0.8);
          this.playFrameFX('energy_burst', p.x, p.y, {
            scale: perCellScale,
            rotateDeg: Math.floor(Math.random() * 360),
            delay,
            filter: 'filter:brightness(2.15) saturate(1.65) contrast(1.12) drop-shadow(0 0 10px rgba(150,190,255,.95))',
          });
        }
        break;
      }
      case 'buff': {
        const card = this.cardOfChar(ev.targetId);
        if (card) {
          const color = BUFF_COLOR[ev.stat] ?? '#e8c879';
          card.floatText(`+${ev.amount}`, color);
          card.refresh();
          const center = this.cardCenterInOverlay(card);
          if (ev.stat === 'hp') {
            this.audio.play('healing');
            if (center) this.playFrameFX('heal_cleanse', center.x, center.y);
          } else if (ev.stat === 'armor') {
            this.audio.play('armor');
            if (center) this.playFrameFX('armor_up', center.x, center.y);
          }
        }
        break;
      }
      case 'status-apply': {
        // 施加瞬间：统一短闪(~0.3s)+图标弹入（命中确认）。
        // DoT(中毒/燃烧) 的完整大动画留到每回合 tick 掉血时爆发；
        // 硬控/软控(冰冻/眩晕/缠绕/沉默) 施加后挂"持续层"循环动画，直到状态解除。
        const card = this.cardOfChar(ev.targetId);
        if (card) card.applyStatusBadge();
        const center = card ? this.cardCenterInOverlay(card) : null;
        switch (ev.statusId) {
          case 'poison':
            this.audio.play('poison');
            if (center) this.playFrameFX('poison_flash', center.x, center.y);
            break;
          case 'burning':
            this.audio.play('burning');
            if (center) this.playFrameFX('burning_flash', center.x, center.y);
            break;
          case 'frozen':
            this.audio.play('frozen');
            if (center) this.playFrameFX('frozen_flash', center.x, center.y);
            // 冰冻持续态用程序化冰封蒙层（贴卡、静态、不挡脸），不用序列帧
            card?.setFrozen(true);
            break;
          case 'stun':
            if (center) this.playFrameFX('frozen_flash', center.x, center.y);
            this.mountStatusPersist(ev.targetId, 'stun', 'stun_persist');
            break;
          case 'entangle':
            // ????????????????????????????????????
            card?.setEntangled(true);
            break;
          case 'silence':
            // 沉默：满法力时法力宝石呼吸暗下去（能量满却放不出），用卡面态而非序列帧
            card?.setSilenced(true);
            break;
          default:
            break;
        }
        break;
      }
      case 'status-cleanse': {
        const card = this.cardOfChar(ev.targetId);
        if (card) {
          card.removeStatusBadge();
          card.refresh();
          const center = this.cardCenterInOverlay(card);
          this.audio.play('healing');
          if (center) this.playFrameFX('heal_cleanse', center.x, center.y);
        }
        // 驱散：移除该角色的全部持续层 + 冰封卡面态
        this.removeAllStatusPersist(ev.targetId);
        card?.setFrozen(false);
        card?.setSilenced(false);
        card?.setEntangled(false);
        break;
      }
      case 'status-tick': {
        // DoT 每回合掉血：此刻才播放完整大动画（毒 0340 / 火 0450）+ 飘扣血字。
        const card = this.cardOfChar(ev.targetId);
        if (card) {
          const center = this.cardCenterInOverlay(card);
          if (ev.statusId === 'poison') {
            this.audio.play('poison');
            if (center) this.playFrameFX('poison_apply', center.x, center.y);
            if (ev.damage && ev.damage > 0) card.floatText(`-${ev.damage}`, '#7bd88f');
          } else if (ev.statusId === 'burning') {
            this.audio.play('burning');
            if (center) this.playFrameFX('burning_apply', center.x, center.y);
            if (ev.damage && ev.damage > 0) card.floatText(`-${ev.damage}`, '#ff9a5a');
          } else if (ev.damage && ev.damage > 0) {
            card.floatText(`-${ev.damage}`, '#7bd88f');
          }
          card.refresh();
        }
        break;
      }
      case 'status-expire': {
        const card = this.cardOfChar(ev.targetId);
        if (card) card.removeStatusBadge();
        // 状态到期：移除其持续层（序列帧）或冰封卡面态
        if (ev.statusId === 'frozen') card?.setFrozen(false);
        else if (ev.statusId === 'silence') card?.setSilenced(false);
        else if (ev.statusId === 'entangle') card?.setEntangled(false);
        else this.removeStatusPersist(ev.targetId, ev.statusId);
        break;
      }
      case 'summon': {
        // Queue-only summons stay off-field until a later defeat promotes them.
        if (ev.destination === 'queue') break;
        const ch = state.teams[ev.player].characters.find((c) => c.id === ev.characterId);
        if (ch) {
          this.audio.play('summon');
          const card = this.viewOf(ev.player).addCharacterCard(ch, {
            portrait: this.portraitFor(ch),
          });
          const center = this.cardCenterInOverlay(card);
          if (center) this.playFrameFX('summon_rune', center.x, center.y);
        }
        break;
      }
      case 'extra-turn': {
        // 额外回合（ANIMATION_HANDOFF §19 P0-2）：仅"技能主动给的"额外回合(source=skill)
        // 在棋盘中央播放 0082 祝福动画；常规三消(4/5连·L/T形)给的额外回合(source=match)
        // 只保留连击音+HUD 轻反馈，不放大动画。
        if (ev.source !== 'skill') break;
        const center = this.boardCenterInOverlay();
        if (center) this.playFrameFX('extra_turn', center.x, center.y);
        break;
      }
      default:
        break;
    }
    void state;
  }

  /**
   * 风暴演出（storm-change，阶段 2）：EventStreamPlayer 在时间线上到达该事件时调用。
   * - set / replaced 新风暴：指示器弹入 + 指示器中心播对应色 group_hit_* 一次性爆发 FX
   *   （召唤音效由 EventStreamPlayer 在同一时间点复用 'summon'，不经此处）
   * - replaced 被顶方（color=null）/ expired：该方指示器淡出
   */
  private onStormChangePresentation(ev: Extract<GameEvent, { type: 'storm-change' }>): void {
    const plan = stormChangePlan(ev);
    if (plan.action === 'show' && plan.color !== null) {
      this.stormIndicator.show(plan.color, ev.player);
      const center = this.stormIndicator.activeCenter();
      if (center && plan.burstFx) this.playFrameFX(plan.burstFx, center.x, center.y);
    } else {
      this.stormIndicator.hide(ev.player);
    }
  }

  private playManaFlow(
    ev: Extract<GameEvent, { type: 'mana-gain' }>,
    origins: { x: number; y: number }[],
  ): void {
    const card = this.viewOf(ev.player).getCard(ev.characterId);
    if (!card) return;

    const overlayRect = this.overlay.getBoundingClientRect();
    const targetRect = card.getManaElement().getBoundingClientRect();
    const scale = this.currentScale();
    const target = {
      x: (targetRect.left + targetRect.width / 2 - overlayRect.left) / scale,
      y: (targetRect.top + targetRect.height / 2 - overlayRect.top) / scale,
    };
    const color = MANA_FLOW_COLOR[ev.color];
    const sources = origins;

    sources.forEach((boardPoint, index) => {
      // Use Pixi's actual world transform rather than root + logical cell coordinates.
      // This remains correct while swap/gravity motion or chain screen shake is active.
      const globalPoint = this.board.toGlobal(boardPoint);
      const start = { x: globalPoint.x, y: globalPoint.y };
      const dx = target.x - start.x;
      const dy = target.y - start.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const normal = { x: -dy / distance, y: dx / distance };
      const curve = 28 + Math.min(48, distance * 0.075) + (index % 3) * 5;
      const tailLength = Math.max(68, Math.min(112, Math.abs(dx) * 0.24));
      // Every control point advances along the source-to-target vector. The perpendicular offset
      // only bends the route, so a stream can no longer launch away from its recipient first.
      const points = [
        { x: start.x, y: start.y },
        { x: start.x + dx * 0.18 + normal.x * curve * 0.38, y: start.y + dy * 0.18 + normal.y * curve * 0.38 },
        { x: start.x + dx * 0.52 + normal.x * curve, y: start.y + dy * 0.52 + normal.y * curve },
        { x: start.x + dx * 0.84 + normal.x * curve * 0.34, y: start.y + dy * 0.84 + normal.y * curve * 0.34 },
        { x: target.x, y: target.y },
      ];
      const rawAngleAt = (pointIndex: number): number => {
        const from = points[Math.max(0, pointIndex - 1)];
        const to = points[Math.min(points.length - 1, pointIndex + 1)];
        return Math.atan2(to.y - from.y, to.x - from.x) * (180 / Math.PI);
      };
      const angles = points.map((_, pointIndex) => rawAngleAt(pointIndex));
      for (let i = 1; i < angles.length; i++) {
        while (angles[i] - angles[i - 1] > 180) angles[i] -= 360;
        while (angles[i] - angles[i - 1] < -180) angles[i] += 360;
      }

      const mote = document.createElement('div');
      mote.className = 'mana-flow-mote';
      mote.setAttribute('aria-hidden', 'true');
      mote.style.cssText = [
        'position:absolute', 'left:0', 'top:0', 'width:1px', 'height:1px',
        'pointer-events:none', 'z-index:31', 'transform-origin:0 0',
        'opacity:0',
        `transform:translate(${points[0].x}px,${points[0].y}px) rotate(${angles[0]}deg) scale(.58)`,
        'will-change:transform,opacity',
      ].join(';');

      const outerTail = document.createElement('span');
      outerTail.style.cssText = [
        'position:absolute', `left:-${tailLength}px`, 'top:-6px',
        `width:${tailLength}px`, 'height:12px', 'border-radius:999px',
        `background:linear-gradient(90deg,transparent 0%,color-mix(in srgb,${color} 18%,transparent) 18%,color-mix(in srgb,${color} 72%,transparent) 72%,${color} 100%)`,
        'filter:blur(5px)', 'opacity:.78', 'transform-origin:right center',
        'mix-blend-mode:screen',
      ].join(';');

      const innerTail = document.createElement('span');
      innerTail.style.cssText = [
        'position:absolute', `left:-${tailLength * 0.82}px`, 'top:-2px',
        `width:${tailLength * 0.82}px`, 'height:4px', 'border-radius:999px',
        `background:linear-gradient(90deg,transparent 0%,color-mix(in srgb,${color} 45%,transparent) 22%,${color} 78%,#fff 100%)`,
        'filter:blur(.6px)', 'opacity:.96', 'transform-origin:right center',
        `box-shadow:0 0 7px ${color}`, 'mix-blend-mode:screen',
      ].join(';');

      const halo = document.createElement('span');
      halo.style.cssText = [
        'position:absolute', 'left:-14px', 'top:-14px', 'width:28px', 'height:28px',
        'border-radius:50%', `background:radial-gradient(circle,rgba(255,255,255,.85) 0%,${color} 24%,color-mix(in srgb,${color} 45%,transparent) 52%,transparent 72%)`,
        'filter:blur(2px)', 'mix-blend-mode:screen',
      ].join(';');

      const core = document.createElement('span');
      core.style.cssText = [
        'position:absolute', 'left:-7px', 'top:-7px', 'width:14px', 'height:14px',
        'border-radius:50%', `background:radial-gradient(circle at 38% 34%,#fff 0%,#fff 14%,${color} 43%,color-mix(in srgb,${color} 22%,#160d22) 100%)`,
        `box-shadow:0 0 6px #fff,0 0 14px ${color}`, 'mix-blend-mode:screen',
      ].join(';');

      mote.append(outerTail, innerTail, halo, core);
      this.overlay.appendChild(mote);

      outerTail.animate(
        [{ transform: 'scaleX(.08)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }],
        { duration: 150, easing: 'cubic-bezier(.15,.75,.2,1)', fill: 'forwards' },
      );
      innerTail.animate(
        [{ transform: 'scaleX(.05)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 1 }],
        { duration: 120, easing: 'cubic-bezier(.15,.75,.2,1)', fill: 'forwards' },
      );

      const playbackScale = Math.max(0.1, AnimConfig.globalScale);
      const duration = (AnimConfig.manaFlow.duration * 1000) / playbackScale;
      const delay = (index * AnimConfig.manaFlow.stagger * 1000) / playbackScale;
      const offsets = [0, 0.17, 0.52, 0.84, 1];
      const scales = [0.58, 1.08, 1, 0.86, 0.16];
      const opacities = [0, 1, 1, 0.96, 0];
      const keyframes: Keyframe[] = points.map((point, pointIndex) => ({
        transform: `translate(${point.x}px,${point.y}px) rotate(${angles[pointIndex]}deg) scale(${scales[pointIndex]})`,
        opacity: opacities[pointIndex],
        offset: offsets[pointIndex],
      }));
      const animation = mote.animate(keyframes, {
        duration,
        delay,
        easing: 'cubic-bezier(.3,.05,.2,1)',
        fill: 'both',
      });
      animation.onfinish = () => mote.remove();
      animation.oncancel = () => mote.remove();
    });
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
      this.audio.play('skullHit');
      impactShake(this.wrapper, this.wrapper.style.transform);
      if (target) target.recoil(dir * 1);
      this.playImpactFX(target ?? attacker, dir);
    });
  }

  /**
   * 攻击落空挣扎（队首被控：冰冻/缠绕无法攻击）：
   * 小幅向前冲一下又被"拉回"原位，配合轻微抖动，表达"想打但动不了"，不造成伤害。
   */
  private playStruggle(attackerId: number): void {
    const attacker = this.cardOfChar(attackerId);
    if (!attacker) return;
    const dir = this.sideOfChar(attackerId) === PlayerSide.Right ? -1 : 1;
    const el = attacker.el;
    const nudge = dir * 14; // 小幅前冲（远小于正常冲撞）
    el.animate(
      [
        { transform: 'translateX(0) rotate(0deg)' },
        { transform: `translateX(${nudge * 0.5}px) rotate(${dir * 1.5}deg)`, offset: 0.2 },
        { transform: `translateX(${nudge}px) rotate(${dir * 2}deg)`, offset: 0.38 },
        // 被"拉回"：反向过冲一点点再归位，像被束缚拽住
        { transform: `translateX(${-dir * 5}px) rotate(${-dir * 1}deg)`, offset: 0.62 },
        { transform: `translateX(${nudge * 0.4}px) rotate(${dir * 1}deg)`, offset: 0.8 },
        { transform: 'translateX(0) rotate(0deg)' },
      ],
      { duration: 400, easing: 'cubic-bezier(.34,1.4,.5,1)' },
    );
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
    if (!App.slashStripReady) {
      void App.preloadSlashStrip().then((ready) => {
        if (ready) this.playSlashFX(px, py);
      });
      return;
    }
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

  private playSplashChainDamage(
    ev: Extract<GameEvent, { type: 'skill-damage' }>,
    card: CharacterCard,
  ): void {
    const target = this.cardCenterInOverlay(card);
    const impact = () => {
      if (target) this.playFrameFX('splash_hit', target.x, target.y);
      this.audio.play('splashChainHit');
      card.floatText(`-${ev.damage}`, '#ff7f72');
      card.hitFlash();
      card.refresh();
    };

    const chainIndex = ev.chainIndex ?? 0;
    if (chainIndex === 0) {
      // 0083 释放层：与群攻 0241 同规格——朝「施法者 → 主目标」方向旋转，落在两者之间的中点，
      // 使释放方向与实际攻击方向一致，而非固定居中无朝向。
      const casterCard = this.cardOfChar(ev.casterId);
      const casterPt = casterCard ? this.cardCenterInOverlay(casterCard) : null;
      const enemyPt = target ?? this.boardCenterInOverlay();
      if (enemyPt) {
        let castPoint = enemyPt;
        let rotateDeg = 0;
        if (casterPt) {
          const r = AnimConfig.splashChain.castMidpointRatio;
          castPoint = {
            x: casterPt.x + (enemyPt.x - casterPt.x) * r,
            y: casterPt.y + (enemyPt.y - casterPt.y) * r,
          };
          const angle = Math.atan2(enemyPt.y - casterPt.y, enemyPt.x - casterPt.x) * (180 / Math.PI);
          rotateDeg = angle - AnimConfig.splashChain.castBaseAngleDeg;
        }
        this.playFrameFX('splash_chain_cast', castPoint.x, castPoint.y, {
          scale: AnimConfig.splashChain.castScale,
          rotateDeg,
        });
      }
      window.setTimeout(impact, AnimConfig.splashChain.firstImpactDelay);
      return;
    }

    const fromCard = ev.chainFromId !== undefined ? this.cardOfChar(ev.chainFromId) : null;
    const from = fromCard ? this.cardCenterInOverlay(fromCard) : null;
    if (from && target) this.playSplashChainSword(from, target, impact);
    else impact();
  }

  /**
   * 群体攻击演出（ANIMATION_HANDOFF §19 P0-1）：
   * 1) 棋盘中央播放 0241 群攻释放（只一次）；
   * 2) 命中帧到达后，所有存活目标同时播放按施法者主颜色的大范围受击动画；
   * 3) 颜色受击音效整批只播一次，避免多份采样叠加削波；
   * 4) 同时飘伤害数字并刷新卡片。
   */
  private playGroupAttack(
    events: Extract<GameEvent, { type: 'skill-damage' }>[],
  ): void {
    if (events.length === 0) return;
    const casterId = events[0].casterId;
    const casterColor = this.casterColor(casterId);
    const hitFx = casterColor ? (GROUP_HIT_FX[casterColor] ?? 'group_hit_red') : 'group_hit_red';
    const hitSfx: SfxName = casterColor
      ? (SINGLE_HIT_SFX[casterColor] ?? 'hit')
      : 'hit';

    // 目标卡中心集合（用于释放层的朝向与落点）
    const targetPoints = events
      .map((ev) => this.cardOfChar(ev.targetId))
      .filter((c): c is CharacterCard => !!c)
      .map((c) => this.cardCenterInOverlay(c))
      .filter((p): p is { x: number; y: number } => !!p);

    // 1) 群攻释放 0241：朝「施法者 → 敌群中心」方向旋转，落在两者之间的中点，
    //    使箭头/冲击方向与实际攻击方向一致，而非固定素材原始朝向。
    const casterCard = this.cardOfChar(casterId);
    const casterPt = casterCard ? this.cardCenterInOverlay(casterCard) : null;
    const enemyCenter = targetPoints.length > 0
      ? {
          x: targetPoints.reduce((s, p) => s + p.x, 0) / targetPoints.length,
          y: targetPoints.reduce((s, p) => s + p.y, 0) / targetPoints.length,
        }
      : this.boardCenterInOverlay();
    if (enemyCenter) {
      let castPoint = enemyCenter;
      let rotateDeg = 0;
      if (casterPt) {
        const r = AnimConfig.groupAttack.castMidpointRatio;
        castPoint = {
          x: casterPt.x + (enemyCenter.x - casterPt.x) * r,
          y: casterPt.y + (enemyCenter.y - casterPt.y) * r,
        };
        const angle = Math.atan2(enemyCenter.y - casterPt.y, enemyCenter.x - casterPt.x) * (180 / Math.PI);
        rotateDeg = angle - AnimConfig.groupAttack.castBaseAngleDeg;
      }
      this.playFrameFX('group_cast', castPoint.x, castPoint.y, { rotateDeg });
    }

    // 2) 命中延迟后，全体同时受击
    window.setTimeout(() => {
      let audioPlayed = false;
      for (const ev of events) {
        const card = this.cardOfChar(ev.targetId);
        if (!card) continue;
        const center = this.cardCenterInOverlay(card);
        // 受击范围大：群体受击 strip displayH 已放大，覆盖整卡而非头像中心一小块
        if (center) this.playFrameFX(hitFx, center.x, center.y);
        // 颜色受击音效整批只播一次
        if (!audioPlayed) {
          this.audio.play(hitSfx);
          audioPlayed = true;
        }
        card.floatText(`-${ev.damage}`, '#ff6b6b');
        card.hitFlash();
        card.refresh();
      }
    }, AnimConfig.groupAttack.hitDelay);
  }

  /**
   * Splash bounce projectile built from effect 0002 frames 00-01 only.
   * Later frames show the sword planted in the ground, so the runtime stops before
   * them and hands off to the original splash-hit animation at the destination.
   */
  private playSplashChainSword(
    from: { x: number; y: number },
    to: { x: number; y: number },
    onArrive: () => void,
  ): void {
    const name = 'splash_chain_sword';
    const cfg = AnimConfig.frameFX[name];
    const url = App.FRAME_FX_URL[name];
    if (!cfg || !url) {
      onArrive();
      return;
    }
    if (!App.frameFXReadyUrls.has(url)) {
      void App.preloadFrameFX(name).then((ready) => {
        if (ready) this.playSplashChainSword(from, to, onArrive);
        else onArrive();
      });
      return;
    }

    const stripW = cfg.frameW * cfg.frames;
    if (!App.frameFXKeyframes.has(name)) {
      App.frameFXKeyframes.add(name);
      const style = document.createElement('style');
      style.textContent =
        `@keyframes fxFramePlay_${name}{from{background-position-x:0}` +
        `to{background-position-x:-${stripW}px}}`;
      document.head.appendChild(style);
    }

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const desiredAngle = Math.atan2(dy, dx) * (180 / Math.PI);
    // Keep a slight diagonal lean from effect 0002 instead of flattening it into a
    // perfectly vertical beam when adjacent cards are stacked in one column.
    const pathAngle = desiredAngle - Math.sign(dy || 1) * AnimConfig.splashChain.swordAngleBias;
    const intrinsicAngle = Math.atan2(cfg.frameH, cfg.frameW) * (180 / Math.PI);
    const intrinsicTravel = Math.hypot(cfg.frameW, cfg.frameH);
    const scale = Math.min(
      AnimConfig.splashChain.swordMaxScale,
      Math.max(AnimConfig.splashChain.swordMinScale, distance / intrinsicTravel),
    );
    const rotation = pathAngle - intrinsicAngle;

    // The cropped 0002 strip travels from its top-left toward its bottom-right.
    // Pin that bottom-right endpoint to the victim and rotate the whole sequence so
    // the incoming sword follows the actual previous-target -> next-target vector.
    const anchor = document.createElement('div');
    anchor.style.cssText = [
      'position:absolute', `left:${to.x}px`, `top:${to.y}px`,
      'width:0', 'height:0', 'pointer-events:none', 'z-index:35',
    ].join(';');
    const sword = document.createElement('div');
    sword.dataset.fx = name;
    sword.style.cssText = [
      'position:absolute', `left:-${cfg.frameW}px`, `top:-${cfg.frameH}px`,
      `width:${cfg.frameW}px`, `height:${cfg.frameH}px`,
      `background-image:url('${url}')`,
      `background-size:${stripW}px ${cfg.frameH}px`,
      'background-repeat:no-repeat',
      `transform-origin:${cfg.frameW}px ${cfg.frameH}px`,
      `transform:rotate(${rotation}deg) scale(${scale})`,
      'mix-blend-mode:screen',
      'filter:brightness(1.12) saturate(1.16) drop-shadow(0 0 7px rgba(70,185,255,.9)) drop-shadow(0 0 15px rgba(35,95,255,.55))',
      `animation:fxFramePlay_${name} ${cfg.duration}ms steps(${cfg.frames}) forwards`,
    ].join(';');
    anchor.appendChild(sword);
    this.overlay.appendChild(anchor);

    sword.animate(
      [{ opacity: 0.68 }, { opacity: 1, offset: 0.42 }, { opacity: 1 }],
      { duration: cfg.duration, easing: 'ease-out', fill: 'forwards' },
    );
    window.setTimeout(() => {
      anchor.remove();
      onArrive();
    }, cfg.duration);
  }

  /**
   * 通用程序化弹道（所有发射类技能共用，仅颜色不同）：从 from 直线射向 to 的能量剑气，
   * 匀速直线、朝飞行方向拉成锋利梭形；到达后触发 onArrive（通常接命中迸溅）。
   * @param color 剑气主色（CSS 颜色，按技能元素/宝石色传入）
   */
  private playProjectile(
    from: { x: number; y: number },
    to: { x: number; y: number },
    color: string,
    onArrive: () => void,
    opts?: { onApproach?: () => void; approachLeadMs?: number },
  ): void {
    const cfg = AnimConfig.projectile;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const dur = Math.min(cfg.maxDuration, Math.max(cfg.minDuration, dist / cfg.speed));

    // 剑气本体：一条朝 +x 方向的锋利梭形（左钝头、右尖尾在运动方向前端），随 el 旋转到飞行角度
    const el = document.createElement('div');
    el.style.cssText = [
      'position:absolute', 'left:0', 'top:0', 'width:1px', 'height:1px',
      'pointer-events:none', 'z-index:33', 'transform-origin:center center',
      'will-change:transform',
    ].join(';');
    const blade = document.createElement('span');
    blade.style.cssText = [
      'position:absolute', `left:-${cfg.bladeLen}px`, `top:-${cfg.bladeThick / 2}px`,
      `width:${cfg.bladeLen}px`, `height:${cfg.bladeThick}px`,
      // 后端透明→前端亮：形成拖尾感；两端收窄成剑气
      `background:linear-gradient(90deg,transparent 0%,${color} 55%,#ffffff 100%)`,
      'border-radius:999px',
      `filter:blur(1px) drop-shadow(0 0 6px ${color})`,
      'transform-origin:right center', 'mix-blend-mode:screen',
    ].join(';');
    const tip = document.createElement('span');
    tip.style.cssText = [
      'position:absolute', `left:-${cfg.coreR}px`, `top:-${cfg.coreR}px`,
      `width:${cfg.coreR * 2}px`, `height:${cfg.coreR * 2}px`, 'border-radius:50%',
      `background:radial-gradient(circle,#ffffff 0%,${color} 60%,transparent 82%)`,
      `box-shadow:0 0 8px ${color},0 0 16px ${color}`,
    ].join(';');
    el.append(blade, tip);
    this.overlay.appendChild(el);

    const proxy = { t: 0 };
    const approachLeadMs = Math.max(0, opts?.approachLeadMs ?? 0);
    const approachAt = dur > 0 ? Math.max(0, (dur - approachLeadMs) / dur) : 0;
    let approachFired = false;
    const fireApproach = () => {
      if (approachFired || !opts?.onApproach) return;
      approachFired = true;
      opts.onApproach();
    };
    gsap.to(proxy, {
      t: 1,
      duration: dur / 1000,
      ease: 'none', // 匀速直线，干脆
      onUpdate: () => {
        const x = from.x + dx * proxy.t;
        const y = from.y + dy * proxy.t;
        el.style.transform = `translate(${x}px,${y}px) rotate(${angle}deg)`;
        if (proxy.t >= approachAt) fireApproach();
      },
      onComplete: () => {
        el.remove();
        fireApproach();
        onArrive();
      },
    });
  }

  /**
   * 程序化命中迸溅：在 (px,py) 闪一下亮核 + 数条放射尖线 + 一圈细速环。短促、可变色。
   * 替代"用命中序列帧当爆点"，与通用弹道搭配，颜色随技能传入。
   */
  private playHitBurst(px: number, py: number, color: string): void {
    const cfg = AnimConfig.hitBurst;
    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:absolute', `left:${px}px`, `top:${py}px`, 'width:1px', 'height:1px',
      'pointer-events:none', 'z-index:34', 'mix-blend-mode:screen',
    ].join(';');
    // 亮核
    const core = document.createElement('span');
    core.style.cssText = [
      'position:absolute', 'left:-11px', 'top:-11px', 'width:22px', 'height:22px', 'border-radius:50%',
      `background:radial-gradient(circle,#ffffff 0%,${color} 55%,transparent 80%)`,
      `box-shadow:0 0 14px ${color}`,
    ].join(';');
    wrap.appendChild(core);
    core.animate(
      [
        { transform: 'scale(.3)', opacity: 1 },
        { transform: 'scale(1.4)', opacity: 0 },
      ],
      { duration: cfg.duration * 0.6, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' },
    );
    // 放射尖线
    for (let i = 0; i < cfg.rays; i++) {
      const a = (360 / cfg.rays) * i + (Math.random() * 20 - 10);
      const len = cfg.rayLen * (0.6 + Math.random() * 0.5);
      const ray = document.createElement('span');
      ray.style.cssText = [
        'position:absolute', 'left:0', 'top:-1.5px', `width:${len}px`, 'height:3px',
        `background:linear-gradient(90deg,${color},transparent)`, 'border-radius:999px',
        'transform-origin:left center', `filter:drop-shadow(0 0 3px ${color})`,
      ].join(';');
      wrap.appendChild(ray);
      ray.animate(
        [
          { transform: `rotate(${a}deg) scaleX(.2)`, opacity: 1 },
          { transform: `rotate(${a}deg) scaleX(1)`, opacity: 0 },
        ],
        { duration: cfg.duration, easing: 'cubic-bezier(.15,.75,.2,1)', fill: 'forwards' },
      );
    }
    // 细速环
    const ring = document.createElement('span');
    ring.style.cssText = [
      'position:absolute', `left:-${cfg.ringR}px`, `top:-${cfg.ringR}px`,
      `width:${cfg.ringR * 2}px`, `height:${cfg.ringR * 2}px`, 'border-radius:50%',
      `border:2px solid ${color}`, 'opacity:.8',
    ].join(';');
    wrap.appendChild(ring);
    ring.animate(
      [
        { transform: 'scale(.2)', opacity: .8 },
        { transform: 'scale(1)', opacity: 0 },
      ],
      { duration: cfg.duration, easing: 'ease-out', fill: 'forwards' },
    );
    this.overlay.appendChild(wrap);
    window.setTimeout(() => wrap.remove(), cfg.duration + 40);
  }

  /**
   * 通用序列帧特效：在覆盖层 (px,py) 处叠加播放一条 strip（AnimConfig.frameFX[name]）。
   * strip 为横向逐帧，用 CSS steps() 逐帧推进 background-position。以中心定位。
   * @param name AnimConfig.frameFX 的键（对应 src/assets/fx/<name>_strip.png）
   * @param px 覆盖层布局坐标 X（中心）
   * @param py 覆盖层布局坐标 Y（中心）
   * @param opts.scale 额外缩放（默认 1）；opts.filter 覆盖默认滤镜
   */
  private playFrameFX(
    name: keyof typeof AnimConfig.frameFX | string,
    px: number,
    py: number,
    opts: { scale?: number; filter?: string; rotateDeg?: number; delay?: number; onComplete?: () => void } = {},
  ): void {
    const cfg = AnimConfig.frameFX[name];
    const url = App.FRAME_FX_URL[name];
    if (!cfg || !url) {
      opts.onComplete?.();
      return;
    }
    if (!App.frameFXReadyUrls.has(url)) {
      // Never let a CSS animation run against an undecoded background image.
      void App.preloadFrameFX(name).then((ready) => {
        if (ready) this.playFrameFX(name, px, py, opts);
        else opts.onComplete?.();
      });
      return;
    }
    const stripW = cfg.frameW * cfg.frames;
    // 每条 strip 宽度不同 → 各注入一次专属 steps 关键帧
    if (!App.frameFXKeyframes.has(name)) {
      App.frameFXKeyframes.add(name);
      const style = document.createElement('style');
      style.textContent =
        `@keyframes fxFramePlay_${name}{from{background-position-x:0}` +
        `to{background-position-x:-${stripW}px}}`;
      document.head.appendChild(style);
    }
    const baseScale = cfg.displayH / cfg.frameH;
    const scale = baseScale * (opts.scale ?? 1);
    const rot = opts.rotateDeg ? ` rotate(${opts.rotateDeg}deg)` : '';
    const delay = opts.delay ?? 0;
    const el = document.createElement('div');
    el.dataset.fx = name;
    el.style.cssText = [
      'position:absolute', `left:${px}px`, `top:${py}px`,
      `width:${cfg.frameW}px`, `height:${cfg.frameH}px`,
      'pointer-events:none', 'z-index:32',
      `background-image:url('${url}')`,
      `background-size:${stripW}px ${cfg.frameH}px`,
      'background-repeat:no-repeat',
      opts.filter ?? App.FRAME_FX_FILTER[name] ?? 'filter:brightness(1.12) saturate(1.12) drop-shadow(0 0 8px rgba(255,255,255,.5))',
      `transform:translate(-50%,-50%) scale(${scale})${rot}`,
      'transform-origin:center center',
      delay > 0 ? 'opacity:0' : '',
      `animation:fxFramePlay_${name} ${cfg.duration}ms steps(${cfg.frames}) ${delay}ms forwards`,
    ].join(';');
    // 错峰播放：延迟期间保持透明，起播时点亮
    if (delay > 0) window.setTimeout(() => { el.style.opacity = '1'; }, delay);
    this.overlay.appendChild(el);
    window.setTimeout(() => {
      el.remove();
      opts.onComplete?.();
    }, delay + cfg.duration + 40);
  }

  /**
   * 挂载状态持续层（硬控/软控循环动画，贴在角色卡上直到状态解除）。
   * 与 playFrameFX 不同：用 infinite 循环、不自动移除；同一 (charId,statusId) 只挂一层。
   * 持续层刻意低调：半透明 + screen 混合（暗部透出立绘），锚点按状态偏移，避免挡脸。
   * @param fxName AnimConfig.frameFX 里的持续层键（如 frozen_persist）
   */
  private mountStatusPersist(charId: number, statusId: string, fxName: string): void {
    const key = `${charId}:${statusId}`;
    if (this.statusPersistLayers.has(key)) return; // 已挂载，避免重复
    const cfg = AnimConfig.frameFX[fxName];
    const url = App.FRAME_FX_URL[fxName];
    if (!cfg || !url) return;
    const card = this.cardOfChar(charId);
    if (!card) return;
    // 持续层锚点/不透明度：冰壳挂下半身、眩晕/沉默挂头顶，缠绕居中。半透明以不挡立绘。
    const style = STATUS_PERSIST_STYLE[statusId] ?? { yRatio: 0.5, opacity: 0.6 };
    const anchor = this.cardPointInOverlay(card, style.yRatio);
    if (!anchor) return;

    const mount = () => {
      // 若期间状态已解除（key 被删）则不再挂
      if (!this.persistPending.has(key)) return;
      this.persistPending.delete(key);
      const stripW = cfg.frameW * cfg.frames;
      if (!App.frameFXKeyframes.has(fxName)) {
        App.frameFXKeyframes.add(fxName);
        const styleEl = document.createElement('style');
        styleEl.textContent =
          `@keyframes fxFramePlay_${fxName}{from{background-position-x:0}` +
          `to{background-position-x:-${stripW}px}}`;
        document.head.appendChild(styleEl);
      }
      const scale = cfg.displayH / cfg.frameH;
      const el = document.createElement('div');
      el.dataset.fxPersist = fxName;
      el.style.cssText = [
        'position:absolute', `left:${anchor.x}px`, `top:${anchor.y}px`,
        `width:${cfg.frameW}px`, `height:${cfg.frameH}px`,
        'pointer-events:none', 'z-index:31',
        `opacity:${style.opacity}`,
        'mix-blend-mode:screen', // 暗部透出立绘，只叠加亮部，避免糊成一坨
        `background-image:url('${url}')`,
        `background-size:${stripW}px ${cfg.frameH}px`,
        'background-repeat:no-repeat',
        'filter:saturate(1.1)',
        `transform:translate(-50%,-50%) scale(${scale})`,
        'transform-origin:center center',
        `animation:fxFramePlay_${fxName} ${cfg.duration}ms steps(${cfg.frames}) infinite`,
      ].join(';');
      this.overlay.appendChild(el);
      this.statusPersistLayers.set(key, el);
    };

    this.persistPending.add(key);
    if (App.frameFXReadyUrls.has(url)) mount();
    else void App.preloadFrameFX(fxName).then((ready) => { if (ready) mount(); else this.persistPending.delete(key); });
  }

  /** 移除某角色某状态的持续层（status-expire / cleanse / 阵亡时调用） */
  private removeStatusPersist(charId: number, statusId: string): void {
    const key = `${charId}:${statusId}`;
    this.persistPending.delete(key);
    const el = this.statusPersistLayers.get(key);
    if (el) {
      el.remove();
      this.statusPersistLayers.delete(key);
    }
  }

  /** 移除某角色的全部持续层（阵亡 / 全驱散时用） */
  private removeAllStatusPersist(charId: number): void {
    for (const key of [...this.statusPersistLayers.keys()]) {
      if (key.startsWith(`${charId}:`)) {
        this.statusPersistLayers.get(key)?.remove();
        this.statusPersistLayers.delete(key);
      }
    }
    for (const key of [...this.persistPending]) {
      if (key.startsWith(`${charId}:`)) this.persistPending.delete(key);
    }
  }

  /** 当前 wrapper 的缩放系数（applyScale 设置的 transform） */
  private currentScale(): number {
    const m = /scale\(([\d.]+)\)/.exec(this.wrapper.style.transform);
    return m ? parseFloat(m[1]) : 1;
  }

  /** 技能特效主色：取施法者代表色（多色取首个）映射到 CSS 颜色；缺省用中性青白 */
  /** 施法者代表色（多色取首个）；无则返回 null */
  private casterColor(casterId: number): BaseColor | null {
    const state = this.engine.getState();
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      const c = state.teams[side].characters.find((x) => x.id === casterId);
      if (c && c.colors.length > 0) return c.colors[0];
    }
    return null;
  }

  /** 弹道/迸溅的 CSS 主色（跟随施法者色）；缺省中性青白 */
  private skillFxColor(casterId: number): string {
    const col = this.casterColor(casterId);
    return col ? (MANA_FLOW_COLOR[col] ?? '#bfe6ff') : '#bfe6ff';
  }

  /** 命中爆点帧动画名（按施法者颜色映射到各自的成熟序列帧）；缺省用红 */
  private skillHitFx(casterId: number): string {
    const col = this.casterColor(casterId);
    const map: Record<BaseColor, string> = {
      [BaseColor.Red]: 'hit_red',
      [BaseColor.Blue]: 'hit_blue',
      [BaseColor.Green]: 'hit_green',
      [BaseColor.Yellow]: 'hit_gold',
      [BaseColor.Purple]: 'hit_purple',
      [BaseColor.Brown]: 'hit_brown',
    };
    return col ? (map[col] ?? 'hit_red') : 'hit_red';
  }

  /** Convert a vertical point inside a character card to overlay coordinates. */
  private cardPointInOverlay(card: CharacterCard, yRatio = 0.5): { x: number; y: number } | null {
    const oRect = this.overlay.getBoundingClientRect();
    const cRect = card.el.getBoundingClientRect();
    const scale = this.currentScale();
    return {
      x: (cRect.left + cRect.width / 2 - oRect.left) / scale,
      y: (cRect.top + cRect.height * yRatio - oRect.top) / scale,
    };
  }

  /** Character-card center in overlay coordinates. */
  private cardCenterInOverlay(card: CharacterCard): { x: number; y: number } | null {
    return this.cardPointInOverlay(card);
  }

  /**
   * 一组棋盘格的中心 → 覆盖层布局坐标。
   * 覆盖层与棋盘 root 共享舞台坐标系（见 playManaFlow：motes 直接用 board.toGlobal 落在 overlay 上）。
   */
  /** Board center in the same overlay coordinate space used by DOM frame FX. */
  private boardCenterInOverlay(): { x: number; y: number } | null {
    const center = this.board.toGlobal(new PixiPoint(
      this.board.gridPixels / 2,
      this.board.gridPixels / 2,
    ));
    return { x: center.x, y: center.y };
  }

  private cellsCenterInOverlay(cells: CellPos[]): { x: number; y: number } | null {
    if (cells.length === 0) return null;
    let sx = 0;
    let sy = 0;
    for (const pos of cells) {
      const p = this.board.cellCenter(pos);
      sx += p.x;
      sy += p.y;
    }
    const g = this.board.toGlobal(new PixiPoint(sx / cells.length, sy / cells.length));
    return { x: g.x, y: g.y };
  }

  /** 角色属于哪一方 */
  private sideOfChar(charId: number): PlayerSide {
    const state = this.engine.getState();
    return state.teams[PlayerSide.Left].characters.some((c) => c.id === charId)
      ? PlayerSide.Left
      : PlayerSide.Right;
  }

  private cardOfChar(charId: number) {
    return this.leftTeamView.getCard(charId) ?? this.rightTeamView.getCard(charId);
  }

  /**
   * 玩家技能释放流程（唯一实现，需求 2C）：短按己方满法力角色卡触发。
   * 校验 → 按需收集选色/选目标/选宝石（玩家 UI，取消则不释放）→ castSkill → 演出。
   * 释放不消耗回合（用户裁定，对齐 GoW）：行动方不变，可继续交换/再次施放。
   */
  private async castPlayerSkill(charId: number): Promise<void> {
    // casting 期间（含选目标/选宝石的点选）屏蔽任何新的短按释放，
    // 避免"点候选卡选目标"这次点击又触发该卡自身的技能。
    if (this.casting || this.orientationBlocked) return;
    const state = this.engine.getState();
    // 仅等待输入、我方回合可释放
    if (state.state !== MatchState.AwaitingInput || state.activePlayer !== PlayerSide.Left) return;
    const ch = state.teams[PlayerSide.Left].characters.find((c) => c.id === charId);
    if (!ch || ch.defeated) return;
    if (!ManaDistributor.isSkillCastable(ch.mana, ch.manaCost)) return; // 法力未满：短按无效（可留作提示）
    const proto = this.registry.prototypes.get(ch.skillId);

    this.casting = true;
    // 进入释放流程即禁用棋盘交换：选色/选目标/选宝石期间不允许拖动交换宝石（否则与选格点击冲突）
    this.stopIdle();
    this.input.enabled = false;
    let resolved = false; // 是否真正释放（走到 afterResolve）；取消则在 finally 交还输入
    try {
      // 按需收集玩家选择；任一取消 → 放弃释放（不消耗法力、不改状态，需求 2C.6）
      if (proto) {
        if (prototypeNeedsColor(proto)) {
          const originCard = this.cardOfChar(charId);
          if (!originCard) return;
          // 统一为"点选一枚宝石"：点哪颗就取哪颗的颜色（与选宝石引爆同一套选择器）
          const cell = await this.cellPicker.pick(originCard, this.wrapper, this.cellAimCoords());
          if (cell === null) return;
          const gem = this.engine.getState().board.get(cell);
          // 只有颜色宝石可定色；点到骷髅/空格 → 放弃释放（不消耗法力）
          if (!gem || gem.type.kind !== 'color') return;
          this.engine.setColorChooser(new FixedColorChooser(gem.type.color));
        }
        const tMode = prototypeChosenTargetMode(proto);
        if (tMode) {
          const view = tMode === 'allyChosen' ? this.leftTeamView : this.rightTeamView;
          const cards = candidatesFor(tMode, state, charId)
            .map((c) => view.getCard(c.id))
            .filter((c): c is NonNullable<typeof c> => !!c);
          const originCard = this.cardOfChar(charId);
          if (!originCard) return;
          const friendly = tMode === 'allyChosen';
          const pickedId = await this.targetPicker.pick(originCard, cards, this.wrapper, friendly);
          if (pickedId === null) return;
          this.engine.setTargetChooser(new FixedTargetChooser(pickedId));
        }
        // 点选一枚宝石：引爆某格 / 摧毁其所在行列共用同一选择器（需求 2B）
        if (prototypeNeedsCell(proto)) {
          const originCard = this.cardOfChar(charId);
          if (!originCard) return;
          const cell = await this.cellPicker.pick(originCard, this.wrapper, this.cellAimCoords());
          if (cell === null) return;
          this.engine.setCellChooser(new FixedCellChooser(cell));
        }
      }

      const events = this.session.resolve({ type: 'cast', characterId: charId });
      this.onEventsProduced?.(events);
      if (events.length === 0) return;
      resolved = true;
      await this.player.play(events);
      this.advanceTurnHud(events);
      this.refreshTeams();
      this.afterResolve();
    } finally {
      // 释放后恢复 AI 选择器，避免玩家的 Fixed 选择泄漏到 AI 回合
      this.engine.setColorChooser(new AiColorChooser());
      this.engine.setTargetChooser(new AiTargetChooser());
      this.engine.setCellChooser(new AiCellChooser());
      // 取消/未释放：把输入交还玩家并恢复待机（afterResolve 已按回合归属处理释放成功的情形）
      if (!resolved) {
        this.syncPlayerInput();
        if (this.input.enabled) this.startIdle();
      }
      // 延一帧再解除互斥：让"确认选目标/宝石的那次点击"引发的候选卡短按抬起
      // 落在 casting=true 窗口内被忽略，不会误触该卡自身技能。
      window.setTimeout(() => { this.casting = false; }, 0);
    }
  }

  // —— 测试页调试钩子（供 SkillTestPage 薄壳复用主游戏，不另起逻辑）——

  /** 取引擎（测试页读取状态/推进回合用） */
  getEngine(): TurnEngine {
    return this.engine;
  }

  /** 测试页布局用：基准内容尺寸（wrapper 未缩放的逻辑宽高） */
  getBaseSize(): { w: number; h: number } {
    return { w: this.baseW, h: this.baseH };
  }

  /** 把某角色的技能临时设为指定原型（测试页拖拽换技能用）：注册到调试键并指向它，不动法力 */
  setDebugSkill(charId: number, proto: SkillPrototype): void {
    const key = `__debug_${charId}`;
    this.registry.prototypes.set(key, proto);
    const state = this.engine.getState();
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      const ch = state.teams[side].characters.find((c) => c.id === charId);
      if (ch) ch.skillId = key;
    }
    this.refreshTeams();
  }

  /**
   * 测试辅助：把棋盘上若干格就地替换为指定宝石类型（特殊宝石测试入口用）。
   * 走 gem-transform 演出管线（贴图切换 + 高光脉冲），不改宝石 id；仅等待输入时受理。
   * @returns 是否实际生效（解析中/无可改格时为 false）
   */
  async debugSetGems(changes: { pos: CellPos; type: GemType }[]): Promise<boolean> {
    const state = this.engine.getState();
    if (state.state !== MatchState.AwaitingInput) return false;
    const transformed: Extract<GameEvent, { type: 'gem-transform' }>['changes'] = [];
    for (const c of changes) {
      const gem = state.board.get(c.pos);
      if (!gem) continue;
      const from = gem.type;
      gem.type = c.type;
      transformed.push({ pos: c.pos, gemId: gem.id, from, to: c.type });
    }
    if (transformed.length === 0) return false;
    const events: GameEvent[] = [{ type: 'gem-transform', changes: transformed }];
    this.onEventsProduced?.(events);
    await this.player.play(events);
    return true;
  }

  /**
   * 调试辅助：喂一条合成 storm-change 事件走完整演出管线（时间线预留 + 指示器 + 爆发 FX + 音效）。
   * 引擎侧风暴机制（d-storm-engine 分支）合并前的表现层走查入口；合并后可直接用死亡召唤特质端到端触发。
   */
  async debugStormChange(ev: Extract<GameEvent, { type: 'storm-change' }>): Promise<void> {
    const events: GameEvent[] = [ev];
    this.onEventsProduced?.(events);
    await this.player.play(events);
  }

  /** Temporary skill-test hook: preview the finalized elimination/chain set. */
  previewDebugGemChainSet(): void {
    this.audio.previewGemChainSet();
  }

  /** Temporary skill-test hook: preview the finalized elimination sound for a chain level. */
  previewDebugGemChainLevel(level: number): void {
    this.audio.previewGemChainLevel(level);
  }

  /** Set every allied character to one primary mana-crystal color for testing. */
  setAllyManaColor(color: BaseColor): void {
    const allies = this.engine.getState().teams[PlayerSide.Left].characters;
    for (const ch of allies) ch.colors = [color];
    this.refreshTeams();
  }

  /** 测试辅助：统一设置双方法力上限（便于快速攒满测试，如设为 3） */
  setAllManaCost(n: number): void {
    const cost = Math.max(1, Math.floor(n));
    const state = this.engine.getState();
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      for (const ch of state.teams[side].characters) {
        ch.manaCost = cost;
        if (ch.mana > cost) ch.mana = cost;
      }
    }
    this.refreshTeams();
  }

  /** 测试辅助：充满双方全体法力（立即可释放） */
  fillAllMana(): void {
    const state = this.engine.getState();
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      for (const ch of state.teams[side].characters) {
        if (!ch.defeated) ch.mana = ch.manaCost;
      }
    }
    this.refreshTeams();
  }

  /** 通过主游戏释放流程释放某角色技能（测试页触发用，等价于短按） */
  triggerCast(charId: number): Promise<void> {
    return this.castPlayerSkill(charId);
  }

  /** 事件观察钩子（测试页记录事件日志用）；主游戏播放前回调 */
  onEventsProduced: ((events: GameEvent[]) => void) | null = null;

  /** 取某角色卡的 DOM 元素（测试页做拖拽换技能的落点用） */
  getCardElement(charId: number): HTMLElement | undefined {
    return this.cardOfChar(charId)?.el;
  }

  /** 我方角色 id 列表（测试页遍历落点用） */
  getAllyIds(): number[] {
    return this.engine.getState().teams[PlayerSide.Left].characters.map((c) => c.id);
  }

  /** 某角色当前是否可释放（法力已满、未阵亡） */
  isCastable(charId: number): boolean {
    const state = this.engine.getState();
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      const c = state.teams[side].characters.find((x) => x.id === charId);
      if (c) return !c.defeated && c.mana >= c.manaCost;
    }
    return false;
  }

  /** 空过一回合并演出（测试页观察状态结算用）：走引擎真实回合流程 */
  async passTurn(): Promise<void> {
    if (this.casting) return;
    const events = this.session.passTurn();
    this.onEventsProduced?.(events);
    if (events.length > 0) await this.player.play(events);
    this.refreshTeams();
    this.afterResolve();
  }

  /**
   * 选宝石瞄准的坐标适配器：把 client/格/DOM 统一到"瞄准层像素"（wrapper 相对、已除缩放）。
   * 与 playManaFlow 同源——board.toGlobal 得到的即为该空间坐标；DOM 用 wrapper 矩形 + scale 换算。
   */
  private cellAimCoords(): CellAimCoords {
    const scale = this.currentScale();
    const wrapRect = this.wrapper.getBoundingClientRect();
    const clientToAim = (cx: number, cy: number) => ({
      x: (cx - wrapRect.left) / scale,
      y: (cy - wrapRect.top) / scale,
    });
    return {
      cellSize: this.board.cellSize,
      clientToAim,
      cellToAim: (cell) => {
        const g = this.board.toGlobal(this.board.cellCenter(cell));
        return { x: g.x, y: g.y };
      },
      elementToAim: (el) => {
        const r = el.getBoundingClientRect();
        return clientToAim(r.left + r.width / 2, r.top + r.height / 2);
      },
      aimToCell: (x, y) => {
        // 瞄准层像素 → 棋盘本地：board.toLocal 接收全局(=瞄准层)坐标
        const local = this.board.toLocal(new PixiPoint(x, y));
        return this.board.pixelToCell(local.x, local.y);
      },
    };
  }

  /** 打开角色详情面板（需求 4）：查角色 + 关联兵种数据（按名称尽力匹配），纯读不改引擎。 */
  private openCharacterDetail(charId: number): void {
    const state = this.engine.getState();
    let found: Character | undefined;
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      found = state.teams[side].characters.find((c) => c.id === charId);
      if (found) break;
    }
    if (!found) return;
    // 演示队伍用中文名，尝试按名称匹配兵种数据以展示技能/特质；匹配不到则仅展示属性
    const troop = TROOPS.find((t) => t.name === found!.name);
    this.detailPanel.open(found, troop);
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
          !ch.defeated && ManaDistributor.isSkillCastable(ch.mana, ch.manaCost);
        card.setCastable(castable);
      }
    }
  }

  /** 待机微动（需求 19.9）：相位错开的呼吸 */
  private startIdle(): void {
    this.stopIdle(false);
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

  private stopIdle(resetScale = false): void {
    for (const tw of this.idleTweens) tw.kill();
    this.idleTweens = [];
    // Preserve the current breathing phase during swaps; snapping every gem to 1 causes a visible freeze.
    if (resetScale) {
      for (const child of this.board.layer.children) {
        const sprite = child as unknown as { scale: { set: (n: number) => void } };
        sprite.scale.set(1);
      }
    }
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
