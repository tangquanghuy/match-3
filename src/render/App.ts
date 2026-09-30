import { BATTLE_SKULL_DROPS } from '../engine/skullDrops';
import type { ImpactPresentation } from './impactPlayback';
import { BattleSettings } from './BattleSettings';
import { BattleControls } from './BattleControls';
import { attachBattleSpeed } from './battleSpeedRuntime';
import { backgroundMusic } from '../audio/BackgroundMusic';
import { musicForBattle } from '../audio/MusicCatalog';
import { BattleNarrator } from './BattleNarrator';
import { Application, Container, Point as PixiPoint } from 'pixi.js';
import { gsap } from 'gsap';
import { BoardModel } from '@engine/BoardModel';
import { TurnEngine } from '@engine/TurnEngine';
import { BoardGenerator } from '@engine/boardGen';
import { pickHintSwap } from '@engine/boardUtils';
import { chooseAiAction } from '@engine/aiPolicy';
import { BATTLE_COMBO_BIAS, BATTLE_SETUP_BIAS, BATTLE_SKULL_CHANCE } from '@engine/comboBias';
import { createGameState } from '@engine/GameState';
import { SeededRNG } from '@engine/rng';
import { TRAIT_LIBRARY, dynamicTraitCodes } from '@engine/traits';
import { MatchState, PlayerSide, BaseColor } from '@engine/types';
import type { Character, GemType, SpecialGemKind, SkullStormDropKind } from '@engine/types';
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
import { chargeTremor, impactShake } from './FXLayer';
import { EventStreamPlayer } from './EventStreamPlayer';
import { StormIndicator, stormChangePlan } from './StormIndicator';
import { InputController } from './InputController';
import { AudioManager, type SfxName } from './AudioManager';
import { AnimConfig } from './AnimationConfig';
import { restoreBattleSpeed, scaledMs, setBattleSpeedBoost } from './battleSpeed';
import { FiniteVisuals } from './FiniteVisuals';
import { ExtraTurnNotice } from './ExtraTurnNotice';
import type { FramePlaybackClock } from './FramePlaybackClock';
import { planExplosionBursts } from './explosionPlayback';
import { statusFeedbackFX, statusFeedbackLabel } from './statusPlayback';
import { statusEmblemUrl } from './statusEmblems';
import {
  STATUS_CUE_REPEAT_MS, STATUS_EMBLEM_MAX_PER_CARD, dotTickBreakdown, dotTickColor, statusBlockedCue, statusExpireCue, statusTickCue,
} from './statusPresentation';
import { statusBadge } from './statusBadges';
import { manaMoteDelay } from './manaPlayback';
import { TeamView, CARD_W, setTeamSize, setTeamRowLayout, setCardOverlayBoost } from './TeamView';
import type { MotionAxis } from './TeamView';
import { solvePortraitLayout, PORTRAIT_CARD_GAP, PORTRAIT_PAD, PORTRAIT_BAR } from './portraitLayout';
import type { PortraitLayout } from './portraitLayout';
import { installStatusTooltips } from './statusTooltip';
import type { CharacterCard, CardShownStats, PressSource } from './TeamView';
import { traitSlotsOf } from './CharacterDetailPanel';
import { GameOverPanel, type GameOverStats } from './GameOverPanel';
import { UnitSheet, resolveCastAvailability } from './UnitSheet';
import type { CastAvailability, UnitSheetData } from './UnitSheet';
import { CastCutIn, castCutInReserveSeconds, registerCastCutInSide } from './CastCutIn';
import { RARITY_TIERS } from '../meta/data/rarity';
import { raceNames } from '../meta/data/races';
import { SkillBranchPicker } from './SkillBranchPicker';
import { AiBranchChooser, FixedBranchChooser, skillChoices, selectSkillBranch } from '../engine/skills/branchChooser';
import { setSkipCastConfirm, skipCastConfirm } from './battlePrefs';
import { TargetPicker } from './TargetPicker';
import { CellPicker } from './CellPicker';
import type { CellAimCoords } from './CellPicker';

import { TROOPS, troopToSummonTemplate } from '../data/troops';
import { resolveTroopPortrait } from '../data/troopPortrait';
import { setSummonTemplateResolver } from '@engine/traits';
import { ManaDistributor } from '@engine/ManaDistributor';
import { ExtensionRegistry } from '@engine/registry';
import { registerSkillLibrary } from '@engine/skills/library';
import type { SkillPrototype } from '@engine/skills/prototypes';
import { AiColorChooser, FixedColorChooser, prototypeNeedsColor } from '@engine/skills/colorChooser';
import { AiTargetChooser, FixedTargetChooser, prototypeChosenTargetMode } from '@engine/skills/targetChooser';
import { candidatesFor, selectTargets } from '@engine/skills/targeting';
import type { TargetMode } from '@engine/skills/targeting';
import { skillDisplayOf } from '@session/assigner';
import { applyRequestBoardPreset } from '@session/rules';
import { AiCellChooser, FixedCellChooser, prototypeNeedsCell } from '@engine/skills/cellChooser';
import { preloadBattleAssets } from './battleAssets';
import { fxAtlas, mountFxFrames, playFxFrames, type FxAtlas } from './fxAtlas';
import { hasTurnSwitch } from './turnHudLogic';
import turnHudUrl from '@assets/ui/turn-hud-starfall.png';

/** 所有独立战斗固定四人；旧 debug.teamSize 值不再生效。 */
export function readTeamSize(): number { return 4; }

/** 摘要条里的角色名来自数据文件，进 innerHTML 前转义 */
const MANA_FLOW_COLOR: Record<BaseColor, string> = {
  [BaseColor.Red]: '#ff5968',
  [BaseColor.Green]: '#63dc78',
  [BaseColor.Blue]: '#5eb5ff',
  [BaseColor.Yellow]: '#ffd45a',
  [BaseColor.Purple]: '#bd7aff',
  [BaseColor.Brown]: '#d49355',
};
const MANA_FLOW_HEX: Record<BaseColor, number> = {
  [BaseColor.Red]: 0xff5968,
  [BaseColor.Green]: 0x63dc78,
  [BaseColor.Blue]: 0x5eb5ff,
  [BaseColor.Yellow]: 0xffd45a,
  [BaseColor.Purple]: 0xbd7aff,
  [BaseColor.Brown]: 0xd49355,
};

/** 增益飘字颜色（按属性区分） */
const BUFF_COLOR: Record<string, string> = {
  hp: '#7bd88f',
  armor: '#7fd4e0',
  attack: '#ff9a5a',
  magic: '#c69bff',
  mana: '#8fb8ff',
};

/** 属性变化飘字的属性名（与 presentationBatches 合并飘字同口径） */
const STAT_LABEL: Record<string, string> = { attack: '攻击', armor: '护甲', hp: '生命', mana: '法力', magic: '魔力' };

const SPECIAL_GEM_FEEDBACK: Record<SpecialGemKind, { label: string; color: string }> = {
  doomSkull: { label: '末日骷髅', color: '#c58cff' },
  uberDoomSkull: { label: '至尊末日', color: '#e2a7ff' },
  bomb: { label: '爆破', color: '#ff9c5c' },
  web: { label: '织网', color: '#c58cff' },
  lightningRow: { label: '闪电·行', color: '#68c7ff' },
  lightningCol: { label: '闪电·列', color: '#ffe06b' },
  wildcard: { label: '通配宝石', color: '#ffffff' },
  wish: { label: '许愿', color: '#ffe06b' },
  hourglass: { label: '额外回合', color: '#ffd36b' },
  ghost: { label: '幽魂', color: '#b7e5ff' },
  // 状态搬运族（GEMS-SEMANTICS-2 波A）：触发环 + 飘字沿用既有反馈动画
  burningGem: { label: '燃烧', color: '#ff9c5c' },
  freezeGem: { label: '冻结', color: '#8fd0ff' },
  curseGem: { label: '诅咒', color: '#b46cff' },
  bleedGem: { label: '流血', color: '#ff6b8a' },
  poisonGem: { label: '中毒', color: '#7dffa8' },
  deathMarkGem: { label: '死亡标记', color: '#ff5c6e' },
  terrorGem: { label: '恐怖', color: '#e07bff' },
  entangleGem: { label: '缠绕', color: '#7de08f' },
  enrageGem: { label: '激怒', color: '#ff7a5c' },
  submergeGem: { label: '下潜', color: '#9adfff' },
  faerieFireGem: { label: '妖火', color: '#d6ff8a' },
  stunGem: { label: '打昏', color: '#ffd98a' },
  barrierGem: { label: '屏障', color: '#ffe06b' },
  // 赃物宝石（窗口 E 经济批）：摧毁时 +10 金币
  bootyGem: { label: '赃物 +10 金币', color: '#ffd24a' },
  // 波B 17 颗（GEMS-SEMANTICS-2 2026-09-17）：触发环 + 飘字沿用既有反馈动画（≤450ms）
  dragonGem: { label: '巨龙', color: '#f2f2ff' },
  giantGem: { label: '巨人', color: '#ffd36b' },
  spiritGem: { label: '摄魂', color: '#b7e5ff' },
  manaPotionGem: { label: '法力药水', color: '#ffe9a6' },
  candyGem: { label: '糖果 +1 法力值', color: '#ffb6d9' },
  elementalStar: { label: '元素星', color: '#f2f2ff' },
  umbralStar: { label: '暗影星', color: '#c77dff' },
  angelGem: { label: '祝福', color: '#ffe9a6' },
  daemonicPortalGem: { label: '恶魔传送门', color: '#ff8a5c' },
  gargoyleGem: { label: '石像鬼', color: '#a8adb8' },
  stoneBlock: { label: '石块', color: '#a8adb8' },
  lycanthropyGem: { label: '狼化', color: '#b46cff' },
  decayGem: { label: '腐朽', color: '#9c8462' },
  volcanoGem: { label: '火山', color: '#ff9c5c' },
  trapGem: { label: '陷阱', color: '#ff5c6e' },
  enchantedGem: { label: '附魔', color: '#d9b6ff' },
  mimicGem: { label: '宝箱怪', color: '#e6bd94' },
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

/** 棋盘上沿 HUD 通道高度与上下留白：deriveCellSize 与 init 共享同一布局公式，避免漂移。 */
const BOARD_TOP_INSET = 44;
const BOARD_MARGIN_Y = 4;
/** 竖屏小卡的角标放大系数（法力宝石 / 魔力 / 攻防血） */
const PORTRAIT_OVERLAY_BOOST = 1.3;

/** 命中爆点（DNF 108stairs hit_dodge）图集名；几何见 AnimConfig.slash */
const SLASH_STRIP = 'hit_108stairs_strip';

export class App {
  /** 序列帧特效 name → 图集名（game-assets/bundled/fx/atlas/<名>.webp，scripts/build_fx_atlas.py 生成） */
  private static readonly FRAME_FX_STRIP: Record<string, string> = {
    water_bolt: 'water_bolt_strip',
    fire_burst: 'fire_burst_strip',
    energy_burst: 'energy_burst_strip',
    hit_spark: 'hit_spark_strip',
    // 命中爆点帧动画：红/蓝复用已有 strip，其余各自的 strip
    hit_red: 'hit_spark_strip',
    hit_blue: 'water_bolt_strip',
    // 绿：库里没有干净的绿色命中素材，复用单一色调的蓝剑气 strip（water_bolt≈203°），
    // 靠滤镜 hue-rotate 转到翠绿。不能用 energy_burst——它是钴蓝紫多色，hue-rotate 不可控。
    hit_green: 'water_bolt_strip',
    hit_gold: 'hit_gold_strip',
    hit_purple: 'hit_purple_strip',
    hit_brown: 'hit_brown_strip',
    // Effect 0011: indigo summon sigil with purple smoke.
    summon_rune: 'summon_rune_strip',
    heal_cleanse: 'heal_cleanse_strip',
    armor_up: 'armor_up_strip',
    poison_apply: 'poison_apply_strip',
    water_single_hit: 'water_single_hit_strip',
    yellow_single_hit: 'yellow_single_hit_strip',
    green_single_hit: 'green_single_hit_strip',
    death_drift: 'death_drift_strip',
    splash_hit: 'splash_hit_strip',
    splash_chain_cast: 'splash_chain_cast_strip',
    splash_chain_sword: 'splash_chain_sword_strip',
    frozen_apply: 'frozen_apply_strip',
    burning_apply: 'burning_apply_strip',
    // 群体攻击：0241 群攻释放 + 各色群体受击（ANIMATION_HANDOFF §19 P0-1）
    group_cast: 'group_cast_strip',
    group_hit_purple: 'group_hit_purple_strip',
    group_hit_red: 'group_hit_red_strip',
    group_hit_blue: 'group_hit_blue_strip',
    group_hit_yellow: 'group_hit_yellow_strip',
    group_hit_brown: 'group_hit_brown_strip',
    group_hit_green: 'group_hit_green_strip',
    // 状态施加短闪
    poison_flash: 'poison_flash_strip',
    burning_flash: 'burning_flash_strip',
    frozen_flash: 'frozen_flash_strip',
    // 状态持续层（冰冻改用程序化冰封蒙层，见 CharacterCard.setFrozen）
    stun_persist: 'stun_persist_strip',
  };
  /** 序列帧特效名 → 默认滤镜（无 opts.filter 时用）：给复用中性 strip 的项着色 */
  private static readonly FRAME_FX_FILTER: Record<string, string> = {
    // 蓝剑气 water_bolt(203°) → hue-rotate(-73deg) 转到翠绿(≈130°)。
    // 务必负角：正角会转到红/品红（方向转反）。增艳 + 绿色辉光贴合命中爆点。
    hit_green: 'filter:hue-rotate(-73deg) saturate(1.45) brightness(1.12) drop-shadow(0 0 8px rgba(120,255,150,.55))',
  };
  private app = new Application();
  private root = new Container();
  private board!: BoardView;
  private fx!: FXLayer;
  private player!: EventStreamPlayer;
  private input!: InputController;
  private audio = new AudioManager();
  private narrator = new BattleNarrator(this.audio);
  private audioLifecycle = new AbortController();
  private battleSettings: BattleSettings | null = null;
  private settingsOpen = false;
  private surrendered = false;
  private musicEntered = false;
  private resultTimer: ReturnType<typeof setTimeout> | null = null;
  private aiTimer: ReturnType<typeof setTimeout> | null = null;

  private setSettingsOpen(open: boolean): void {
    this.settingsOpen = open;
    if (this.destroyed) return;
    this.player.setPaused(open);
    backgroundMusic.setDucking('settings', open);
    if (open) {
      this.stopIdle();
      this.clearHint();
      this.closeUnitSheet();
      this.branchPicker.cancel();
      this.targetPicker.cancel();
      this.cellPicker.cancel();
      this.audio.stopNarration();
    }
    this.syncPlayerInput();
    if (!open && this.input.enabled) this.startIdle();
  }

  private abandonBattle(): void {
    if (this.destroyed || this.session.isFinished()) return;
    const events = this.session.surrender();
    if (!events.length) return;
    this.surrendered = true;
    if (this.aiTimer !== null) clearTimeout(this.aiTimer);
    this.player.cancel();
    this.finiteVisuals.cancel();
    this.narrator.retreat();
    this.battleSettings?.finish();
    this.onEventsProduced?.(events);
    for (const event of events) this.onBattleEvent(event);
  }

  private async waitForBattleReady(): Promise<boolean> {
    while (!this.destroyed && !this.surrendered && (this.settingsOpen || this.pageHidden || this.orientationBlocked)) {
      await this.delay(100);
    }
    return !this.destroyed && !this.surrendered;
  }

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
  private lastManaSurgeAt = 0;
  /**
   * 状态持续层（硬控/软控循环挂在角色卡上，直到状态解除）：
   * key = `${charId}:${statusId}` → 覆盖层 DOM 节点。status-apply 挂载、status-expire/cleanse 移除。
   */
  private statusPersistLayers = new Map<string, HTMLDivElement>();

  /** `${charId}:${reason}` → 上次演出时刻，用于抑制同卡同因的重复提示（见 STATUS_CUE_REPEAT_MS）。 */
  private statusCueShownAt = new Map<string, number>();
  /** 持续层异步挂载期间的意图集合（解码未完成时若已解除则取消挂载） */
  private persistPending = new Set<string>();
  /** 部队详情窗（点任意战斗卡打开；盖棋盘、非模态，含「释放技能」与「快速释放」） */
  private unitSheet!: UnitSheet;
  /** 详情窗实时刷新：打开期间轮询卡面显示值与 App 状态，签名变化才重绘 */
  private unitSheetTimer: number | null = null;
  private unitSheetSig = '';
  /**
   * 施法流程正处在「收集玩家选择」阶段（选分支/选色/选目标/选宝石）：此时点卡由选择层处理。
   * 与 casting 区分——casting 还覆盖其后的整段演出，演出期间点卡照常打开详情窗。
   */
  private castPicking = false;
  /** 我方施法立绘切入（skill-cast 驱动） */
  private castCutIn!: CastCutIn;
  private unregisterCutInSide: (() => void) | null = null;
  /**
   * 顶部风暴指示器（阶段 2）：与回合 HUD 共用棋盘顶部 44px 通道的另一侧，
   * 按施放风暴的一方贴其队伍列上沿；storm-change 事件驱动弹入/淡出。
   */
  private stormIndicator = new StormIndicator();
  /** 胜负结算面板（game-over 事件弹出，需求 15.4） */
  private gameOverPanel!: GameOverPanel;
  private branchPicker = new SkillBranchPicker();
  /**
   * 战斗结束回调：胜负判定的当下触发一次（不等玩家点“继续”），交出可回传宿主的
   * `BattleResult`，胜负见 `result.winner`。HostBridge 由此发出 `battle:result`。
   */
  onBattleFinished?: (result: BattleResult) => void;
  /** 设置后，战斗结束暗场过渡完即触发（不弹结算面板），供宿主接管后续流程（战利品统计/页面跳转）。 */
  onBattleDismissed?: () => void;
  /** 结果只交出一次 */
  private battleResultEmitted = false;
  /** destroy() 已执行标记（幂等） */
  private destroyed = false;
  private visualPlaying = false;
  private finiteVisuals = new FiniteVisuals();
  private extraTurnNotice = new ExtraTurnNotice(this.finiteVisuals);
  /** 技能注册表（主游戏拥有全部技能原型） */
  private registry!: ExtensionRegistry;
  /**
   * 棋盘逻辑格基准像素（init 时生效，夹取 [40,96]）。null（默认）= 按挂载视口高度推导，
   * 让画布原生铺满窗口而非靠 transform 拉伸变糊；测试台等嵌入方仍可在 init 前显式指定。
   */
  baseCellSize: number | null = null;
  /**
   * 版式：auto = 按挂载容器朝向（高 > 宽 走竖屏）；也可在 init 前显式指定。
   * 显式 baseCellSize 的嵌入方（技能测试台等）在 auto 下保持横屏。
   */
  layoutMode: 'auto' | 'landscape' | 'portrait' = 'auto';
  /** 本场是否竖屏版式（init 时确定） */
  private portrait = false;
  private portraitLayout: PortraitLayout | null = null;
  /** 玩家选择 UI（选目标/选宝石），技能释放时按需调用 */
  private targetPicker = new TargetPicker();
  private cellPicker!: CellPicker;
  /** 释放流程互斥，避免重复触发 */
  private casting = false;
  /**
   * 自动战斗开关（两条工作线的共享约定）。
   * 自动战斗线负责开关按钮与回合接管；详情窗/手动施法入口在它为 true 时禁止手动施放。
   */
  autoBattleEnabled = false;
  private startupPlaying = false;
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
   *   `src/session/fixtures/standalone-battle.json`，保留完整四人队伍；
   *   由宿主注入时以 request 的人数为准，调试开关不参与。
   * @param registry 可选。meta 出战把 `buildMetaRegistry` 的结果传进来，
   *   未收录法术的兜底原型才进战斗；部队+武器法术本身由 registerSkillLibrary 覆盖。
   */
  async init(mount: HTMLElement, request?: BattleRequest, registry?: ExtensionRegistry): Promise<void> {
    // 技能注册要先于队伍解析：配置/宿主下发的 skillId 必须校验为已注册（需求 2.6）。
    this.registry = new ExtensionRegistry();
    registerSkillLibrary(this.registry.prototypes); // 部队法术 + 武器法术（数字 id 与 gw_*）
    if (registry) {
      for (const [id, proto] of registry.prototypes) this.registry.prototypes.set(id, proto);
      for (const [id, effect] of registry.skills) this.registry.skills.set(id, effect);
    }
    const knownSkillIds = new Set([
      ...this.registry.skills.keys(),
      ...this.registry.prototypes.keys(),
    ]);
    // 特质/种族白名单：校验器按客户端注册表放行（种族集合与 scripts/build_traits.mjs
    // 的 TROOP_TYPE_MAP 值集合同源——那是客户端认识的 GoW 种族规范表）
    const knownTraitIds = new Set([...TRAIT_LIBRARY.map((t) => t.code), ...dynamicTraitCodes()]);
    const knownTroopTypes = new Set([
      'Beast', 'Fey', 'Elemental', 'Dragon', 'Human', 'Daemon', 'Divine', 'Monster',
      'Knight', 'Construct', 'Wildfolk', 'Rogue', 'Elf', 'Wargare', 'Giant', 'Undead',
      'Centaur', 'Goblin', 'Raksha', 'Mystic', 'Stryx', 'Naga', 'Merfolk', 'Urska',
      'Dwarf', 'Tauros', 'Orc', 'Mech', 'Gnome', 'Immortal',
    ]);

    // 队伍来源：宿主注入优先，否则读独立模式配置保留完整四人队伍。
    const battleRequest = request
      ?? resizeRequestTeams(loadStandaloneRequest({ knownSkillIds, knownTraitIds, knownTroopTypes }), readTeamSize());
    // AIRP 分拣：tier 提供而 skillId/traitIds 省略的快照，在此按阶级+种族自动编配。
    // 只填空缺，显式值不动；必须在映射成引擎队伍之前执行。
    assignBattleRequest(battleRequest);
    const { playerTeam, enemyTeam, idMap } = mapRequestToTeams(battleRequest);
    this.battleRequest = battleRequest;
    this.idMap = idMap;
    // 全部战斗资源（贴图/特效/音效/解说/音乐）加载完才搭战场；meta 流程里加载页已预载，这里直接命中
    await preloadBattleAssets(battleRequest);
    if (this.destroyed) return;
    // 用快照的 seed 播种，棋盘生成、补充与 AI 决策才真的可复现（需求 2、3.6）
    this.rng = new SeededRNG(battleRequest.seed);
    this.portraitById = new Map(
      idMap.entries()
        .filter((e) => e.snapshot.portraitUrl !== undefined)
        .map((e) => [e.internalId, e.snapshot.portraitUrl as string]),
    );

    // 队伍人数影响卡片尺寸，需在读取 CARD_W 前设置
    const teamSize = Math.max(playerTeam.characters.length, enemyTeam.characters.length);

    // 手机横屏紧凑基准：逻辑格下限 40px，最低 667×375 安全内容盒中不再缩小。
    // Pixi 与 DOM 仍共享同一逻辑坐标系，视口变化仅调整 wrapper 等比缩放。
    // baseCellSize 未显式指定时按视口推导，画布原生放大而非靠 transform 拉伸变糊。
    // 版式按挂载容器的朝向在开战时确定（竖屏：敌方行 / 棋盘 / 我方行上下排布），
    // 战斗中旋转设备只做等比缩放，不重排。
    const box = this.mountContentBox(mount);
    const portrait = this.layoutMode === 'portrait'
      || (this.layoutMode === 'auto' && this.baseCellSize === null && box.height > box.width);
    this.portrait = portrait;
    const pl = portrait ? solvePortraitLayout(box.width, box.height, teamSize) : null;
    this.portraitLayout = pl;

    const cellSize = pl
      ? pl.cellSize
      : Math.max(40, Math.min(96, Math.round(this.baseCellSize ?? this.deriveCellSize(mount))));
    // Reserve a compact 44px HUD lane so the turn frame never covers the first gem row.
    const boardTopInset = BOARD_TOP_INSET;
    const gridPx = cellSize * BoardModel.COLS;
    const teamColumnPx = boardTopInset + gridPx;
    if (pl) {
      // 反解 boardPx 让 CARD_W 恰为横排卡宽：卡内烘焙比例与同宽横屏卡一致
      setTeamSize(teamSize, (pl.cardW * 512) / (teamSize >= 4 ? 132 : 142));
      setTeamRowLayout({ rowWidth: pl.rowWidth, cardH: pl.cardH, maxCardW: pl.cardW, gap: PORTRAIT_CARD_GAP });
      setCardOverlayBoost(PORTRAIT_OVERLAY_BOOST);
    } else {
      setTeamSize(teamSize, teamColumnPx);
      setTeamRowLayout(null);
      setCardOverlayBoost(1);
    }

    const topMargin = BOARD_MARGIN_Y;
    const bottomMargin = BOARD_MARGIN_Y;
    const colGap = 6;
    const gemSpace = 8;
    const sideColW = CARD_W + colGap;
    const dimW = pl ? pl.width : gemSpace * 2 + sideColW * 2 + gridPx;
    const dimH = pl ? pl.height : teamColumnPx + topMargin + bottomMargin;
    // 棋盘左上角（wrapper 布局坐标）
    const boardLeft = pl ? pl.boardLeft : gemSpace + sideColW;
    const boardTop = pl ? pl.boardTop : topMargin + boardTopInset;

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
    overlay.style.zIndex = '20';
    overlay.style.isolation = 'isolate';
    wrapper.appendChild(overlay);
    this.overlay = overlay;

    installStatusTooltips();
    this.createFullscreenButton(wrapper, pl ? { left: PORTRAIT_PAD, top: pl.barTop } : undefined);

    const banner = this.createTurnBanner(
      wrapper,
      boardLeft,
      gridPx,
      boardTop,
      // 竖屏横幅上方是敌方卡行：最高只能长到卡行下沿
      pl ? pl.bannerTopLimit : 0,
    );
    // 风暴指示器：天色铺满棋盘上沿，宝石压在星落横幅的冠饰星位（素材纵向 19% 处的紫钻石）。
    this.stormIndicator.mount(wrapper, {
      // Storm is a battlefield-wide effect: keep the gem centered over the board,
      // while the color wash covers the entire top banner.
      leftColumnX: boardLeft,
      rightColumnX: boardLeft,
      columnWidth: gridPx,
      laneTop: boardTop - boardTopInset,
      laneHeight: boardTopInset,
      gemCenterY: banner.top + Math.round(banner.height * 0.19),
    });

    // 棋盘容器：横屏水平居中、左右让出 宝石区 + 队伍列；竖屏在两排队伍之间
    this.root.x = boardLeft;
    this.root.y = boardTop;
    this.app.stage.addChild(this.root);

    // 构建引擎
    const rng = this.rng;
    const idGen = () => this.nextId++;
    const genBoard = new BoardGenerator(rng, idGen, battleRequest.rules?.board?.skullChance ?? BATTLE_SKULL_CHANCE, BATTLE_SETUP_BIAS, BATTLE_SKULL_DROPS).generate();
    // 战斗规则·开局预置特殊宝石（活动深化批）：先于首屏快照与开局特质落地
    applyRequestBoardPreset(genBoard, battleRequest, rng);
    // Retain the pre-trigger board: constructor traits can explode/convert/refill it.
    const initialPresentationBoard = genBoard.clone();
    // 战斗发生王国（BattleRequest.kingdom）：「战斗发生在X王国」类条件的唯一来源
    const state = createGameState(genBoard, playerTeam, enemyTeam, PlayerSide.Left,
      battleRequest.kingdom !== undefined ? { kingdom: battleRequest.kingdom } : undefined);
    this.narrator.start(state);
    this.engine = new TurnEngine(state, rng, idGen, this.registry);
    this.engine.setSummonResolver((ref) => troopToSummonTemplate(ref, battleRequest.arenaRules));
    this.engine.setSummonKingdomResolver(kingdom => TROOPS.filter(t => (typeof kingdom === 'number' ? t.kingdomId === kingdom : t.kingdom === kingdom)).map(t => t.referenceName));
    this.engine.setDaemonPool(TROOPS.filter(t => t.troopTypes.includes('Daemon')).map(t => t.referenceName));
    this.engine.setBeastPool(TROOPS.filter(t => t.troopTypes.includes('Beast')).map(t => t.referenceName));
    // 死亡召唤特质（summonOnDeath 族）的召唤物装配：按生成器预解析的 referenceName 查兵种数据
    setSummonTemplateResolver((spec) => troopToSummonTemplate(spec.referenceName, battleRequest.arenaRules));
    this.engine.skullChance = BATTLE_SKULL_CHANCE; // 骷髅为棋盘常驻成分（Gems of War 风格；节奏调参见 comboBias.ts）
    this.engine.skullDropMix = BATTLE_SKULL_DROPS;
    this.engine.comboBias = BATTLE_COMBO_BIAS; // 补充的连消倾向：4/5 连机会与连锁更常见（见 engine/comboBias.ts）
    // 玩家旗帜加成（meta M6）：请求带 playerBanner 时注入引擎，玩家方匹配加成色 ±N 法力
    const bannerBoosts = battleRequest.playerBanner?.boosts;
    if (bannerBoosts && Object.keys(bannerBoosts).length > 0) {
      this.engine.bannerBoosts = { ...bannerBoosts };
    }
    const playerMastery = battleRequest.playerManaMastery;
    if (playerMastery && Object.keys(playerMastery).length > 0) {
      this.engine.playerManaMastery = { ...playerMastery };
    }
    const enemyMastery = battleRequest.enemyManaMastery;
    if (enemyMastery && Object.keys(enemyMastery).length > 0) {
      this.engine.enemyManaMastery = { ...enemyMastery };
    }
    // PvP 模式旗（职业天赋 exemplar/bloodandglory 族；竞技场对战 = 本作 PvP 场景）：
    // 须在首次 takeInitialEvents 前注入（pvpBonus 开局加成在该口一次性结算）。
    if (battleRequest.mode === 'pvp') {
      this.engine.pvpMode = true;
    }
    // 表现层一律通过 session 提交行动，事件流才会被完整累积进结果摘要与 digest
    this.session = new BattleSession({ request: battleRequest, idMap, engine: this.engine });
    if (this.ruleHudHost) this.mountRuleHud(this.ruleHudHost.hud, this.ruleHudHost.hudHeight);

    // 视图
    this.board = new BoardView(cellSize);
    this.root.addChild(this.board);
    this.fx = new FXLayer(cellSize);
    this.fx.onFiniteAnimation = animation => this.trackVisualTween(animation);
    this.root.addChild(this.fx);

    // 战斗队伍视图（需求 19.6, 19.10）：左队居左、右队居右，竖向居中，紧贴棋盘
    const teamsH = TeamView.totalHeight();
    const teamY = topMargin + (teamColumnPx - teamsH) / 2;
    const boardRight = boardLeft + gridPx;

    // 部队详情窗：挂 wrapper 随舞台缩放，只盖棋盘（含上方 HUD 通道），两侧队伍列保持可点
    this.unitSheet = new UnitSheet(this.wrapper, {
      onCast: (id) => void this.castPlayerSkill(id),
      onQuickCast: (on) => { setSkipCastConfirm(on); this.refreshUnitSheet(); },
      onClose: () => this.closeUnitSheet(),
    });
    this.applyUnitSheetBounds(true);
    // 我方施法立绘切入：舞台左下角，skill-cast 事件驱动；时间线预留按施法者阵营判定
    this.castCutIn = new CastCutIn(this.wrapper, { left: this.root.x, top: this.root.y, size: this.board.cellSize * BoardModel.COLS });
    this.unregisterCutInSide = registerCastCutInSide((id) => this.isAllyCaster(id));
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
      // 点卡任意位置：打开/切换详情窗；「快速释放」开且此刻可施放 → 直接进施法流程。
      // 长按只在快速释放可施放时存在（=打开详情窗），其余情况与点按相同、不画进度环。
      onShortPress: (id, via) => this.onCardTap(id, via),
      onLongPress: (id) => this.openUnitSheet(id),
      longPressArmed: (id) => skipCastConfirm() && this.canCastNow(id),
    });
    if (pl) this.leftTeamView.mount(this.overlay, pl.rowLeft, pl.allyTop);
    else this.leftTeamView.mount(this.overlay, boardLeft - colGap - CARD_W, teamY);

    this.rightTeamView = new TeamView(state.teams[PlayerSide.Right], PlayerSide.Right, {
      portraits: Object.fromEntries(
        state.teams[PlayerSide.Right].characters.map((ch) => [ch.id, this.portraitFor(ch)]),
      ),
      // 敌方卡：点按（按多久都一样）打开/切换详情窗，任何时候都可以，包括对手回合与演出中
      onShortPress: (id, via) => this.onCardTap(id, via),
    });
    if (pl) this.rightTeamView.mount(this.overlay, pl.rowLeft, pl.enemyTop);
    else this.rightTeamView.mount(this.overlay, boardRight + colGap, teamY);

    this.board.syncFromBoard(initialPresentationBoard);
    this.player = new EventStreamPlayer(this.board, this.fx, this.root, this.audio);
    this.player.onDetachedTween = tween => this.trackVisualTween(tween);
    this.player.onBattleEvent = (ev, presentation) => this.onBattleEvent(ev, presentation);
    this.player.onNarrationBatch = (events) => this.narrator.prepare(events, this.engine.getState());
    this.player.onGroupAttack = (events) => this.playGroupAttack(events);
    this.player.onCastRelease = (charId) => this.playCastRelease(charId);
    this.player.onManaFlow = (ev, origins) => this.playManaFlow(ev, origins);
    this.player.onComboPulse = (level) => this.playTurnHudCombo(level);
    this.player.onStormChange = (ev) => this.onStormChangePresentation(ev);
    // 输入
    this.input = new InputController(this.board, this.app.canvas);
    this.input.onSwapRequest = (a, b) => this.handleSwap(a, b);
    this.input.onInteractStart = () => this.clearHint();
    this.input.onInteractEnd = () => this.scheduleHint();

    // 首次交互初始化音频（需求 26.5）
    // 采样已全部在库里：开战即建音频图。从 meta 点「开战」进来页面已有用户手势，直接出声；
    // 独立页首次打开还没有手势时 AudioContext 为 suspended，等第一次点击再 resume。
    this.audio.init();
    if (this.audio.isRunning()) this.narrator.announceEncounter();
    else {
      const resumeAudio = () => {
        window.removeEventListener('pointerdown', resumeAudio);
        void this.audio.resume().then(() => this.narrator.announceEncounter());
      };
      window.addEventListener('pointerdown', resumeAudio, { signal: this.audioLifecycle.signal });
    }

    // 快进：按住空格临时加速到 max(选定倍速, 3×)（需求 25.1）。焦点在按钮/输入框上时空格留给控件本身。
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !this.settingsOpen && !App.isKeyboardControl(e.target)) setBattleSpeedBoost(true);
    }, { signal: this.audioLifecycle.signal });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') setBattleSpeedBoost(false);
    }, { signal: this.audioLifecycle.signal });
    window.addEventListener('blur', () => setBattleSpeedBoost(false), { signal: this.audioLifecycle.signal });

    backgroundMusic.start();
    backgroundMusic.beginBattle(musicForBattle(this.battleRequest));
    this.musicEntered = true;
    this.battleSettings = new BattleSettings(this.mountEl,
      open => this.setSettingsOpen(open), () => this.abandonBattle(),
      () => !this.destroyed && !this.session.isFinished());
    this.mountBattleControls();

    // Lock board and cards until the complete startup event chain has played.
    this.startupPlaying = true;
    // 开局：我方行动；页面生命周期和方向门禁共同决定是否启用输入/待机。
    this.setTurn(PlayerSide.Left);
    this.bindPageLifecycle();
    this.pageHidden = document.hidden;
    this.syncInteractionGate();
    // 初始适配由统一布局入口处理；后续由 ResizeObserver/visualViewport 驱动。
    this.refreshLayout();
    try {
      const initialEvents = [...this.session.recordedEvents()];
      if (initialEvents.length) {
        await this.playEventsWithTail(initialEvents);
        if (this.destroyed || this.surrendered) return;
        this.refreshTeams();
      }
    } finally {
      this.startupPlaying = false;
      if (!this.destroyed) this.syncInteractionGate();
    }
    if (this.input.enabled) this.startIdle();
    // B-1 降级路径必须在布局完成后判断：refreshLayout() 才会按真实舞台缩放写入
    // name-compact。此前先 flash 再布局，移动横屏会因尚未进入紧凑态而直接跳过动画。
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      for (const ch of state.teams[side].characters) {
        this.viewOf(side).getCard(ch.id)?.flashName();
      }
    }
  }
  private createFullscreenButton(wrapper: HTMLDivElement, at?: { left: number; top: number }): void {
    const btn = document.createElement('button');
    btn.setAttribute('aria-label', '全屏');
    btn.dataset.testid = 'fullscreen-button';
    btn.style.cssText = [
      // 横屏挂在舞台右下外侧；竖屏放进顶栏左端（右端是齿轮/倍速/自动）
      'position:absolute', ...(at ? [`left:${at.left}px`, `top:${at.top}px`] : ['right:-44px', 'bottom:0']), 'z-index:10',
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
    // 局外出战可能已自动进了全屏（触屏设备），图标按当前状态初始化
    btn.innerHTML = icon(!document.fullscreenElement);
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
      // 不支持网页全屏（iPhone Safari 等）：不摆一个点不动的按钮
      btn.hidden = true;
      btn.style.display = 'none';
    }
    document.addEventListener('fullscreenchange', () => {
      const fs = !!document.fullscreenElement;
      btn.innerHTML = icon(!fs);
      this.refreshLayout();
    }, { signal: this.audioLifecycle.signal });
    window.addEventListener('resize', () => this.refreshLayout(), { signal: this.audioLifecycle.signal });
    wrapper.appendChild(btn);
  }

  /** 取角色立绘：优先用战斗快照里显式配置的 URL，召唤物按部队目录和技能标识取本地资源。 */
  private portraitFor(ch: Character): string {
    return this.portraitById.get(ch.id) ?? resolveTroopPortrait(ch.name, { skillId: ch.skillId });
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

  /**
   * 战斗收尾销毁（meta 外壳按场新建/销毁 App 时用）：停渲染循环、销毁舞台子树
   * 与渲染器、清掉挂起的定时器/补间，并移除 wrapper DOM。幂等；init 之前调用安全。
   * 共享贴图缓存（gemTextures）不销毁，下一场战斗直接复用。
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearPortraitSubtitleAnchor();
    this.audioLifecycle.abort();
    this.battleSettings?.dispose();
    this.player?.cancel();
    this.finiteVisuals.cancel();
    if (this.resultTimer !== null) clearTimeout(this.resultTimer);
    if (this.aiTimer !== null) clearTimeout(this.aiTimer);
    const preserveResultVoice = this.session?.isFinished() ?? false;
    if (this.musicEntered) backgroundMusic.endBattle(preserveResultVoice);
    this.narrator.dispose(preserveResultVoice);
    if (preserveResultVoice) this.audio.disposeAfterNarration();
    else this.audio.dispose();
    if (this.hintTimer !== null) clearTimeout(this.hintTimer);
    if (this.turnHudComboTimer !== null) clearTimeout(this.turnHudComboTimer);
    this.disposeUnitSheetAndCutIn();
    this.branchPicker.cancel();
    for (const tween of this.hintTweens) tween.kill();
    for (const animation of this.turnHudAnimations) animation.cancel();
    this.hintTweens = [];
    this.turnHudAnimations = [];
    if (this.app.renderer) {
      this.app.destroy({ removeView: true }, { children: true });
    }
    this.wrapper?.remove();
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
    // The fullscreen button lives inside the scaled stage, unlike the other controls.
    // Preserve a 44 CSS-pixel touch target when compact landscape layouts shrink it.
    const fullscreen = this.wrapper.querySelector<HTMLElement>('[data-testid="fullscreen-button"]');
    if (fullscreen) {
      const size = Math.ceil(44 / Math.min(1, scale));
      fullscreen.style.width = fullscreen.style.height = `${size}px`;
      if (!this.portraitLayout) fullscreen.style.right = `${-size}px`;
    }
    this.syncBackingStore(scale);
    this.syncPortraitSubtitleAnchor();
    // B-7：卡内覆盖层里有"屏幕像素"口径的尺寸下限（状态徽记 ≥24px），
    // 舞台缩放变了必须告诉卡片，否则移动横屏还是阶段 A 的 17×17。
    this.leftTeamView?.setStageScale(scale);
    this.rightTeamView?.setStageScale(scale);
  }

  /** 竖屏：旁白字幕（document 级 fixed）抬到我方卡行上方，避免遮住卡面数值 */
  private syncPortraitSubtitleAnchor(): void {
    const pl = this.portraitLayout;
    if (!pl || this.destroyed) return;
    const root = document.documentElement;
    root.dataset.battleLayout = 'portrait';
    const rect = this.wrapper.getBoundingClientRect();
    const scale = this.baseH > 0 ? rect.height / this.baseH : 1;
    const allyTopPx = rect.top + pl.allyTop * scale;
    root.style.setProperty('--battle-subtitle-bottom', `${Math.max(0, Math.round(window.innerHeight - allyTopPx + 10))}px`);
  }

  private clearPortraitSubtitleAnchor(): void {
    const root = document.documentElement;
    if (root.dataset.battleLayout === 'portrait') delete root.dataset.battleLayout;
    root.style.removeProperty('--battle-subtitle-bottom');
  }

  /** 挂载容器内容盒（扣除 padding / safe-area）；未布局时退回窗口尺寸 */
  private mountContentBox(mount: HTMLElement): { width: number; height: number } {
    const rect = mount.getBoundingClientRect();
    const style = getComputedStyle(mount);
    const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    return {
      width: Math.max(1, (rect.width > 0 ? rect.width : window.innerWidth) - padX),
      height: Math.max(1, (rect.height > 0 ? rect.height : window.innerHeight) - padY),
    };
  }

  /** 本场是否竖屏版式 */
  isPortraitLayout(): boolean {
    return this.portrait;
  }

  /** 攻击方向：横屏左打右 +1 / 右打左 -1；竖屏我方（下）向上 -1、敌方（上）向下 +1 */
  private attackDir(attackerId: number): 1 | -1 {
    const ally = this.sideOfChar(attackerId) === PlayerSide.Left;
    if (this.portrait) return ally ? -1 : 1;
    return ally ? 1 : -1;
  }

  /** 卡片冲撞/后仰/闪避的位移轴 */
  private get motionAxis(): MotionAxis {
    return this.portrait ? 'y' : 'x';
  }

  /** 未显式指定 baseCellSize 时按挂载视口高度反解逻辑格：画布原生高度≈视口，refreshLayout 只需微调而非放大。 */
  private deriveCellSize(mount: HTMLElement): number {
    const rect = mount.getBoundingClientRect();
    const style = getComputedStyle(mount);
    const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const availH = (rect.height > 0 ? rect.height : window.innerHeight) - padY;
    // dimH = cellSize×COLS + 顶部 HUD 通道 + 上下留白；令 dimH≈可用高度反解 cellSize。
    return Math.floor((availH - BOARD_TOP_INSET - BOARD_MARGIN_Y * 2) / BoardModel.COLS);
  }

  /** 已应用到 renderer 的 resolution（含 CSS 缩放补偿），用于跳过无意义的 resize。 */
  private appliedResolution = 0;

  /**
   * CSS transform 只是显示放大，背面缓冲若不跟着放大就会拉伸变糊。
   * 这里把 resolution 同步为 dpr×scale，让纹理 1:1 落到物理像素；上限 4 防 GPU 纹理失控。
   */
  private syncBackingStore(scale: number): void {
    if (!this.app.renderer) return;
    const dpr = window.devicePixelRatio || 1;
    const target = Math.min(4, Math.max(1, dpr * scale));
    if (Math.abs(target - this.appliedResolution) < 0.05) return;
    this.appliedResolution = target;
    this.app.renderer.resize(this.baseW, this.baseH, target);
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
    this.leftTeamView.setInputEnabled(!blocked && !this.startupPlaying);
    this.rightTeamView.setInputEnabled(!blocked && !this.startupPlaying);
    if (blocked) {
      this.input.enabled = false;
      this.stopIdle();
      this.branchPicker.cancel();
      this.targetPicker.cancel();
      this.cellPicker.cancel();
      this.closeUnitSheet();
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
    }, { signal: this.audioLifecycle.signal });
    window.addEventListener('pageshow', () => {
      this.pageHidden = document.hidden;
      this.syncInteractionGate();
      this.refreshLayout();
      if (!this.pageHidden) void this.audio.resume();
      if (this.input.enabled) this.startIdle();
    }, { signal: this.audioLifecycle.signal });
  }

  private syncPlayerInput(): void {
    const state = this.engine.getState();
    this.input.enabled = !this.destroyed && !this.surrendered && !this.settingsOpen && !this.orientationBlocked
      && !this.pageHidden
      && !this.casting
      && !this.startupPlaying
      && !this.autoBattleEnabled // 自动战斗接管期间棋盘不接受手动交换
      && !(this.player.isPlaying() || this.visualPlaying)
      && state.state === MatchState.AwaitingInput
      && state.activePlayer === PlayerSide.Left;
  }

  /**
   * 施法互斥结束：先放下 casting，再按当前回合把棋盘交还玩家。
   * afterResolve 会在 casting 仍为 true 时跑一遍 syncPlayerInput，那一拍输入必然是关的；
   * 若不在 casting=false 之后再同步一次，就会出现“技能放完点什么都没反应”。
   */
  private restoreAfterCast(): void {
    this.casting = false;
    const state = this.engine.getState();
    if (state.state === MatchState.GameOver) return;
    if (state.activePlayer === PlayerSide.Right) return;
    this.syncPlayerInput();
    // 手动施法期间打开了自动战斗：施法收尾后由自动战斗接手这个决策点
    if (this.autoBattleEnabled) this.scheduleAutoTurn();
    else if (this.input.enabled) this.startIdle();
  }



  /** 回合横幅：星落素材按自然纵横比渲染，波浪底缘沉入棋盘首行上方，宽度与棋盘精确对齐。
   *  返回横幅几何（top/height，wrapper 坐标），供风暴指示器对位冠饰星位。 */
  private createTurnBanner(
    wrapper: HTMLDivElement,
    boardLeft: number,
    gridPx: number,
    boardTop: number,
    topLimit = 0,
  ): { top: number; height: number } {
    // 素材 1425×310：顶部金冠 + 星空主体 + 底部波浪羽化。宽度与棋盘对齐（不再外溢边框）；
    // 高度取自然纵横比，受「棋盘上方空间 + 羽化沉入深度」约束，空间不足时整体等比压缩。
    // 金冠保持在棋盘上方的预留车道内；宝石自夜幕后方落下、经半透明波谷显现（本层 z-index 高于画布）。
    const hudWidth = gridPx;
    const dipIntoBoard = Math.round((gridPx / BoardModel.COLS) * 0.42);
    const naturalHeight = Math.round((gridPx * 310) / 1425);
    const hudHeight = Math.min(naturalHeight, boardTop + dipIntoBoard - topLimit);
    const hudTop = Math.max(topLimit, boardTop + dipIntoBoard - hudHeight);
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
    // 规则角标要读引擎规则：此时引擎尚未搭建，session 建好后再挂（见 init）
    this.ruleHudHost = { hud, hudHeight };
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
    return { top: hudTop, height: hudHeight };
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
    }, scaledMs(trailDur + 80 / speed)); // 清理计时与 HUD 动画同随演出倍速
  }

  private turnLabel(): string {
    return `TURN ${String(this.turnNumber).padStart(2, '0')}`;
  }

  /** 战斗规则角标（活动深化批）：左 = 击杀目标，右 = 回合上限进度；无规则不挂载 */
  private ruleHudHost: { hud: HTMLDivElement; hudHeight: number } | null = null;
  private ruleHudLeft: HTMLSpanElement | null = null;
  private ruleHudRight: HTMLSpanElement | null = null;

  private mountRuleHud(hud: HTMLDivElement, hudHeight: number): void {
    const rules = this.engine?.getRules();
    if (!rules || (!rules.turnLimit && !rules.killTargets?.length)) return;
    const pill = (side: 'left' | 'right'): HTMLSpanElement => {
      const el = document.createElement('span');
      el.className = `rule-hud rule-hud-${side}`;
      el.style.cssText = [
        'position:absolute', `${side}:5%`, `top:${Math.round(hudHeight * 0.39)}px`, 'z-index:5',
        'max-width:31%', 'overflow:hidden', 'text-overflow:ellipsis', 'white-space:nowrap',
        'padding:2px 8px', 'border-radius:999px', 'font:600 11px/1.3 system-ui,sans-serif',
        'color:#fbe9bd', 'background:rgba(24,14,40,.78)', 'border:1px solid rgba(214,172,96,.6)',
        'box-shadow:0 0 6px rgba(0,0,0,.5)',
      ].join(';');
      hud.appendChild(el);
      return el;
    };
    if (rules.killTargets?.length) {
      const all = [...this.engine.getState().teams[PlayerSide.Right].characters];
      const names = rules.killTargets.map((id) => all.find((c) => c.id === id)?.name).filter(Boolean);
      this.ruleHudLeft = pill('left');
      this.ruleHudLeft.textContent = `🎯 击杀 ${names.join('、') || '目标'}`;
      this.ruleHudLeft.title = '击杀目标即可获胜（目标逃跑则不算）';
    }
    if (rules.turnLimit) {
      this.ruleHudRight = pill('right');
      this.refreshRuleHud();
    }
  }

  private refreshRuleHud(): void {
    const el = this.ruleHudRight;
    const limit = this.engine?.getRules()?.turnLimit;
    if (!el || !limit) return;
    const done = this.engine.getState().turnCount?.[PlayerSide.Left] ?? 0;
    if (limit.onExpire === 'playerWins') {
      el.textContent = `🛡 坚守 ${Math.min(done, limit.turns)}/${limit.turns}`;
      el.title = `坚守 ${limit.turns} 个我方回合即获胜`;
    } else {
      const left = Math.max(0, limit.turns - done);
      el.textContent = `⏳ 剩余 ${left} 回合`;
      el.title = `须在 ${limit.turns} 个我方回合内获胜`;
      el.style.color = left <= 2 ? '#ff9d8a' : '#fbe9bd';
    }
  }

  private advanceTurnHud(events: GameEvent[]): void {
    if (!hasTurnSwitch(events)) return;
    this.turnNumber += 1;
    this.refreshRuleHud();
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

  /**
   * 敌方 AI 回合：与自动战斗同一套 aiPolicy（大消 → 施法 → 骷髅 → 缺口色 → 任意）。
   * 交接（afterResolve 定时）+ 思考 + 落子停顿合计约 500ms（1×，按倍速换算）；额外回合经
   * afterResolve 自然循环回来。
   */
  private async runEnemyTurn(): Promise<void> {
    if (!await this.waitForBattleReady() || this.session.isFinished()) return;
    // 切到敌方高亮，短暂思考后出手
    this.setTurn(PlayerSide.Right);
    await this.delay(App.AI_THINK_MS);
    if (!await this.waitForBattleReady() || this.session.isFinished()) return;

    const state = this.engine.getState();
    // 安全：必须轮到右方且等待输入
    if (state.activePlayer !== PlayerSide.Right || state.state !== MatchState.AwaitingInput) return;

    await this.delay(App.AI_COMMIT_MS); // 出手前的短暂停顿
    if (!await this.waitForBattleReady() || this.session.isFinished()) return;
    await this.runAiAction(PlayerSide.Right);
  }

  /** 一次解析结束后：根据 activePlayer 决定是否继续 AI 回合或交还玩家 */
  private afterResolve(): void {
    if (this.destroyed || this.surrendered) return;
    const state = this.engine.getState();
    if (state.state === MatchState.GameOver) {
      this.input.enabled = false;
      this.battleControls?.finish(); // 自动战斗在结算时停下
      return;
    }
    if (state.activePlayer === PlayerSide.Right) {
      // 轮到敌方：禁用输入，短暂交接后启动 AI
      this.input.enabled = false;
      this.stopIdle();
      if (this.aiTimer !== null) clearTimeout(this.aiTimer);
      this.aiTimer = setTimeout(() => { this.aiTimer = null; void this.runEnemyTurn(); }, scaledMs(App.AI_HANDOFF_MS));
    } else {
      // 轮到我方；方向门禁仍由 syncPlayerInput 统一裁决。自动战斗开着时由它接管。
      this.setTurn(PlayerSide.Left);
      this.syncPlayerInput();
      if (this.autoBattleEnabled) this.scheduleAutoTurn();
      else if (this.input.enabled) this.startIdle();
    }
  }

  /** 演出节奏停顿：按 1× 毫秒传入，实际等待按当前演出倍速换算 */
  private delay(ms: number): Promise<void> {
    return new Promise((r) => window.setTimeout(r, scaledMs(ms)));
  }

  // —— 倍速 / AI / 自动战斗（lane B）——

  /** AI 出手节奏（1× 毫秒，经 delay/scaledMs 按倍速换算）：交接 + 思考 + 落子 ≈ 500ms */
  private static readonly AI_HANDOFF_MS = 120;
  private static readonly AI_THINK_MS = 280;
  private static readonly AI_COMMIT_MS = 100;
  /** 倍速 / 自动战斗按钮（竖排在「战斗设置」按钮下方） */
  private battleControls: BattleControls | null = null;
  private autoTimer: ReturnType<typeof setTimeout> | null = null;
  /** 自动战斗的一次决策正在进行（停顿 → 解析 → 演出），防止重入 */
  private autoRunning = false;

  /** 焦点在可操作控件上时，空格属于控件本身（按钮切换 / 输入），不触发临时加速 */
  private static isKeyboardControl(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return target.isContentEditable || ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
  }

  /** 恢复上次的演出倍速、把战斗根节点接入全局倍速、挂载倍速/自动按钮；随 audioLifecycle 一起拆除 */
  private mountBattleControls(): void {
    restoreBattleSpeed();
    const detachSpeed = attachBattleSpeed(this.wrapper);
    const controls = new BattleControls(this.mountEl, {
      onAutoChange: (on) => this.setAutoBattle(on),
      settingsButton: this.battleSettings?.toggleButton,
    });
    this.battleControls = controls;
    // 胜负已分 / 投降：自动战斗弹起并置灰
    if (this.battleSettings) {
      this.battleSettings.onFinished = () => {
        this.autoBattleEnabled = false;
        controls.finish();
      };
    }
    // 视口/全屏变化后按战场实际占位重排按钮组（等本帧 refreshLayout 的缩放落定再量）
    let placeFrame: number | null = null;
    const schedulePlace = () => {
      if (placeFrame !== null) return;
      placeFrame = requestAnimationFrame(() => { placeFrame = null; this.placeBattleControls(); });
    };
    const resize = new ResizeObserver(schedulePlace);
    resize.observe(this.mountEl);
    const signal = this.audioLifecycle.signal;
    window.addEventListener('resize', schedulePlace, { signal });
    document.addEventListener('fullscreenchange', schedulePlace, { signal });
    schedulePlace();
    signal.addEventListener('abort', () => {
      if (this.autoTimer !== null) clearTimeout(this.autoTimer);
      this.autoTimer = null;
      this.autoBattleEnabled = false;
      if (placeFrame !== null) cancelAnimationFrame(placeFrame);
      resize.disconnect();
      controls.dispose();
      detachSpeed();
      if (this.battleControls === controls) this.battleControls = null;
    }, { once: true });
  }

  /** 按钮组避让：角色卡 + 棋盘格区（视口坐标） */
  private placeBattleControls(): void {
    if (!this.battleControls || this.destroyed) return;
    // 用逻辑格区几何换算（不读精灵包围盒：下落中的宝石会暂时越出格区）
    const wrapperRect = this.wrapper.getBoundingClientRect();
    const scale = this.baseW > 0 ? wrapperRect.width / this.baseW : 1;
    const gridPx = this.board.cellSize * BoardModel.COLS * scale;
    const grid = new DOMRect(wrapperRect.left + this.root.x * scale, wrapperRect.top + this.root.y * scale, gridPx, gridPx);
    const cards = [...this.overlay.querySelectorAll<HTMLElement>('.gcard')].map((card) => card.getBoundingClientRect());
    const pl = this.portraitLayout;
    if (pl) {
      // 竖屏：齿轮/倍速/自动排进顶栏右端（顶栏竖向居中），与左端全屏钮同一行
      const rowTop = wrapperRect.top + (pl.barTop + PORTRAIT_BAR / 2) * scale - 22;
      const barRight = wrapperRect.left + (pl.width - PORTRAIT_PAD) * scale;
      this.battleControls.place({ avoid: [grid, ...cards], boardTop: grid.top, boardRight: barRight + 4, rowTop });
      this.applyUnitSheetBounds(true);
      return;
    }
    this.battleControls.place({ avoid: [grid, ...cards], boardTop: grid.top, boardRight: grid.right });
    // 按钮组落进棋盘上方 HUD 通道（窄屏时排成一行）→ 详情窗让出这条通道，只盖棋盘，
    // 否则设置/倍速/自动按钮会压住详情窗的标题栏和关闭钮。
    const laneTop = wrapperRect.top + (this.root.y - BOARD_TOP_INSET) * scale;
    const lane = new DOMRect(grid.left, laneTop, grid.width, grid.top - laneTop);
    const controlsInLane = [...this.mountEl.querySelectorAll<HTMLElement>(
      '.battle-settings-button,[data-testid="battle-speed-button"],[data-testid="battle-auto-button"]',
    )].some((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.left < lane.right && lane.left < r.right && r.top < lane.bottom && lane.top < r.bottom;
    });
    this.applyUnitSheetBounds(!controlsInLane);
  }

  /**
   * 自动战斗开关（按钮回调），返回最终状态；战斗已结束时拒绝打开。
   * 打开：关掉手动交换，当前若是我方决策点则接管；关闭：下一个决策点起交还玩家
   * （正在进行的一次行动照常播完，afterResolve 时交还）。不跨战斗保存。
   */
  private setAutoBattle(on: boolean): boolean {
    if (on && (this.destroyed || this.surrendered || this.session.isFinished())) return false;
    this.autoBattleEnabled = on;
    this.battleControls?.setAutoPressed(on);
    this.syncPlayerInput();
    if (on) {
      this.stopIdle();
      this.clearHint();
      this.scheduleAutoTurn();
    } else {
      if (this.autoTimer !== null) clearTimeout(this.autoTimer);
      this.autoTimer = null;
      if (this.input.enabled) this.startIdle();
    }
    return on;
  }

  /** 短暂交接停顿后尝试接管我方的这个决策点（重复调用只保留最后一次） */
  private scheduleAutoTurn(delayMs = App.AI_HANDOFF_MS): void {
    if (!this.autoBattleEnabled || this.destroyed || this.surrendered) return;
    if (this.autoTimer !== null) clearTimeout(this.autoTimer);
    this.autoTimer = setTimeout(() => { this.autoTimer = null; void this.runAutoTurn(); }, scaledMs(delayMs));
  }

  /** 我方决策点：战斗进行中、轮到我方且等待输入、无演出、不在开场/手动施法流程里 */
  private isPlayerDecisionPoint(): boolean {
    const state = this.engine.getState();
    return !this.destroyed && !this.surrendered && !this.session.isFinished()
      && !this.startupPlaying && !this.casting
      && !(this.player.isPlaying() || this.visualPlaying)
      && state.state === MatchState.AwaitingInput && state.activePlayer === PlayerSide.Left;
  }

  /**
   * 自动战斗：在我方决策点跑一次与敌方完全相同的 AI（思考停顿 → 决策 → 解析 → 演出）。
   * 设置面板打开 / 页面隐藏 / 方向门禁期间停住，恢复后继续；afterResolve 续排下一次（额外回合同理）。
   */
  private async runAutoTurn(): Promise<void> {
    if (this.autoRunning) return;
    this.autoRunning = true;
    try {
      if (!await this.waitForBattleReady()) return;
      // 开场演出 / 手动施法（含选分支/选目标/选宝石）进行中：等它收尾再接管
      while (this.autoBattleEnabled && (this.casting || this.startupPlaying) && !this.destroyed && !this.surrendered) {
        await this.delay(100);
      }
      if (!this.autoBattleEnabled || !this.isPlayerDecisionPoint()) return;
      await this.delay(App.AI_THINK_MS);
      if (!this.autoBattleEnabled || !await this.waitForBattleReady() || !this.isPlayerDecisionPoint()) return;
      await this.delay(App.AI_COMMIT_MS);
      if (!this.autoBattleEnabled || !await this.waitForBattleReady() || !this.isPlayerDecisionPoint()) return;
      this.input.enabled = false;
      this.stopIdle();
      this.clearHint();
      await this.runAiAction(PlayerSide.Left);
    } finally {
      this.autoRunning = false;
    }
  }

  /**
   * 为某一方执行一次 aiPolicy 行动（敌方回合与自动战斗共用）。施法与手动同路：
   * session.resolve({ type: 'cast' }) → playEventsWithTail（skill-cast 事件驱动施法演出）→
   * refreshTeams → afterResolve。施法被引擎拒绝（零事件）时回退到最佳交换；
   * 连交换都没有（理论上引擎会先洗牌）时空过本回合，避免回合卡死。
   */
  private async runAiAction(side: PlayerSide): Promise<void> {
    const state = this.engine.getState();
    if (state.activePlayer !== side || state.state !== MatchState.AwaitingInput) return;
    let decision = chooseAiAction({ state, side, rng: this.rng, registry: this.registry });
    let events = decision ? this.session.resolve(decision.action) : [];
    if (decision?.action.type === 'cast' && events.length === 0) {
      decision = chooseAiAction({ state, side, rng: this.rng, registry: this.registry, allowCast: false });
      events = decision ? this.session.resolve(decision.action) : [];
    }
    if (events.length === 0) events = this.session.passTurn();
    this.onEventsProduced?.(events);
    if (events.length === 0) return;
    await this.playEventsWithTail(events);
    if (this.destroyed || this.surrendered) return;
    this.refreshTeams();
    this.afterResolve();
  }

  private async handleSwap(a: CellPos, b: CellPos): Promise<void> {
    if (this.destroyed || this.surrendered || this.settingsOpen || this.casting || this.startupPlaying || (this.player.isPlaying() || this.visualPlaying)) return;
    // 自动战斗接管期间不受理手动交换（输入本已关闭，这里兜底拖拽途中切换的情况）
    if (this.autoBattleEnabled) return;
    const state = this.engine.getState();
    if (state.state !== MatchState.AwaitingInput) return;
    // 仅我方回合可操作（敌方回合由 AI 接管）
    if (state.activePlayer !== PlayerSide.Left) return;

    const events = this.session.resolve({ type: 'swap', from: a, to: b });
    this.onEventsProduced?.(events);
    if (events.length === 0) return;

    this.input.enabled = false;
    this.stopIdle();
    await this.playEventsWithTail(events);
    if (this.destroyed || this.surrendered) return;
    // 回合结束：刷新全部卡面数值与技能可释放高亮（需求 19.6, 19.10）
    this.refreshTeams();
    // 依据回合归属：可能轮到敌方 AI，或交还我方
    this.afterResolve();
  }

  /** 实时响应战斗事件：法力流入、受击、阵亡时即时更新对应卡片（需求 19.6, 19.7） */
  private visualDelay(ms: number, callback: () => void): void {
    let timer: number | undefined = undefined;
    const token = this.finiteVisuals.begin(() => clearTimeout(timer));
    timer = window.setTimeout(() => {
      if (!token.active) return;
      try { callback(); } finally { token.finish(); }
    }, scaledMs(ms)); // 调用方按 1× 传入，随演出倍速缩短
  }

  private trackVisualTween(tween: gsap.core.Animation): void {
    const token = this.finiteVisuals.begin(() => tween.kill());
    const complete = tween.eventCallback('onComplete');
    const interrupt = tween.eventCallback('onInterrupt');
    tween.eventCallback('onComplete', () => { try { if (token.active) complete?.(); } finally { token.finish(); } });
    tween.eventCallback('onInterrupt', () => { try { interrupt?.(); } finally { token.finish(); } });
  }

  private async playEventsWithTail(events: GameEvent[]): Promise<void> {
    this.extraTurnNotice.beginAction();
    this.visualPlaying = true;
    this.syncPlayerInput();
    const generation = this.finiteVisuals.generation;
    let hudAdvanced = false;
    this.player.onTurnEnd = () => {
      if (!hudAdvanced) { hudAdvanced = true; this.advanceTurnHud(events); }
    };
    try {
      await this.player.play(events);
      // Finished CSS/WAAPI callbacks can start more finite work. Drain to a fixed
      // point, excluding infinite idle/status loops, rather than sleeping N ms.
      while (!this.destroyed && !this.surrendered && generation === this.finiteVisuals.generation) {
        await this.finiteVisuals.waitForIdle(generation);
        if (generation !== this.finiteVisuals.generation) break;
        const animations = this.wrapper.getAnimations({ subtree: true }).filter(animation => {
          const target = (animation.effect as KeyframeEffect | null)?.target;
          if (target instanceof Element && target.closest('.trait-activation-lane')) return false;
          const timing = animation.effect?.getComputedTiming();
          return timing && Number.isFinite(timing.endTime) &&
            (animation.playState === 'running' || animation.playState === 'paused' || animation.pending);
        });
        if (animations.length) {
          if (!await this.finiteVisuals.raceCancellation(Promise.allSettled(animations.map(a => a.finished)), generation)) break;
          continue;
        }
        // Fence queued animationend/onfinish handlers and DOM removals before input.
        if (!await this.finiteVisuals.raceCancellation(new Promise<void>(resolve => requestAnimationFrame(() => resolve())), generation)) break;
        const remaining = this.wrapper.getAnimations({ subtree: true }).some(a => {
          const target = (a.effect as KeyframeEffect | null)?.target;
          if (target instanceof Element && target.closest('.trait-activation-lane')) return false;
          const timing = a.effect?.getComputedTiming();
          return timing && Number.isFinite(timing.endTime) && (a.playState === 'running' || a.pending);
        });
        if (!this.finiteVisuals.size && !remaining) break;
      }
    } finally {
      this.player.onTurnEnd = undefined;
      this.visualPlaying = false;
      this.syncPlayerInput();
    }
  }

  private showTraitActivations(ev: GameEvent): void {
    for (const cue of ev.traitActivations ?? []) {
      this.cardOfChar(cue.characterId)?.showTraitActivation(cue.traitId, cue.name);
    }
  }

  private onBattleEvent(ev: GameEvent, presentation?: ImpactPresentation): void {
    const state = this.engine.getState();
    // Hit provenance fires inside the impact callback, not at projectile launch.
    if (ev.type !== 'skull-damage' && ev.type !== 'skill-damage' && ev.type !== 'attack-struggle') {
      this.showTraitActivations(ev);
    }
    switch (ev.type) {
      case 'mana-gain': {
        const card =
          this.viewOf(ev.player).getCard(ev.characterId);
        if (card) {
          const becameFull = card.absorbMana(ev.color, ev.amount);
          // 疾病减半：标注原因，否则「消了 4 颗只加 2 点」会被当成 bug
          if (ev.halved) card.floatText(`疾病 减半\n+${ev.amount}`, '#bdc957', 820);
          if (becameFull) {
            card.pulseManaReady();
            // B-6：刚攒满立刻点亮显式可释放标记（不等回合尾的 refreshTeams）
            card.setCastable(true);
          }
        }
        break;
      }
      case 'skull-damage': {
        const card = this.cardOfChar(ev.targetId);
        if (card) card.refresh();
        // 反弹伤害（受击方的荆棘/Reflect 把伤害弹回攻击者）：不是一次主动攻击，
        // 不播冲撞——否则攻击者与反弹方各冲一次，看起来像双方对撞。只给受弹方闪白。
        if (ev.reflected) {
          this.showTraitActivations(ev);
          const reflectee = this.cardOfChar(ev.attackerId);
          reflectee?.hitFlash();
          break;
        }
        // 攻击冲撞特效：攻击者短促前压，目标后退
        this.playAttackLunge(ev.attackerId, ev.targetId, () => this.showTraitActivations(ev));
        break;
      }
      case 'attack-struggle': {
        // 屏障/闪避：攻击确实打过去了——照常冲撞，命中瞬间播格挡或闪避；
        // 队首被控（冰冻/缠绕/击晕）：原地小幅前冲被拉回，不造成伤害
        if ((ev.reason === 'barrier' || ev.reason === 'dodge') && ev.targetId !== undefined) {
          this.playDeflectedLunge(ev.attackerId, ev.targetId, ev.reason, () => this.showTraitActivations(ev));
        } else {
          this.playStruggle(ev.attackerId);
        }
        break;
      }
      case 'defeat': {
        const leftCard = this.leftTeamView.getCard(ev.characterId);
        const rightCard = this.rightTeamView.getCard(ev.characterId);
        const card = leftCard ?? rightCard;
        const batch = presentation?.defeatBatch;
        const removeDefeatedCard = () => {
          if (batch) {
            batch.completed.add(ev.characterId);
            if (batch.completed.size === batch.characterIds.length) {
              this.leftTeamView.removeCharacterCards(batch.characterIds);
              this.rightTeamView.removeCharacterCards(batch.characterIds);
            }
          } else if (leftCard) this.leftTeamView.removeCharacterCard(ev.characterId);
          else if (rightCard) this.rightTeamView.removeCharacterCard(ev.characterId);
        };
        if (!card) { removeDefeatedCard(); break; }
        // 阵亡：清掉该角色残留的状态持续层 + 冰封卡面态
        this.removeAllStatusPersist(ev.characterId);
        card.setFrozen(false);
        card.setSilenced(false);
        card.setEntangled(false);
        card.clearStatusAccents();
        // Keep the defeated card in the team column and gray it before the particles start.
        card.refresh();
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
      case 'flee': {
        // 逃跑（DECISIONS 四项拍板③）：阵亡退场管线的轻量版——不播死亡粒子，
        // 只清状态层后复用 removeCharacterCard 的收缩淡出退场（后排递进补位，队尾留空位）。
        const leftCard = this.leftTeamView.getCard(ev.characterId);
        const rightCard = this.rightTeamView.getCard(ev.characterId);
        const card = leftCard ?? rightCard;
        if (!card) break;
        this.removeAllStatusPersist(ev.characterId);
        card.setFrozen(false);
        card.setSilenced(false);
        card.setEntangled(false);
        card.clearStatusAccents();
        card.refresh();
        if (leftCard) this.leftTeamView.removeCharacterCard(ev.characterId);
        else if (rightCard) this.rightTeamView.removeCharacterCard(ev.characterId);
        break;
      }
      case 'game-over': {
        if (this.destroyed) return;
        backgroundMusic.setDucking('result', true);
        this.battleSettings?.finish();
        if (this.aiTimer !== null) clearTimeout(this.aiTimer);
        // 结算：锁输入、停演出，稍候片刻让阵亡动画收尾后弹出结算面板（需求 15.4）
        this.input.enabled = false;
        this.stopIdle();
        this.clearHint();
        const playerWon = ev.winner === PlayerSide.Left;
        // 结果在判定结束的当下就交出，不等玩家点“继续”：宿主拿结果不能依赖用户操作，
        // 否则页面被关掉战果就丢了。
        this.emitBattleResult();
        if (this.destroyed) return;
        // B-9（UX 阶段 B）：900ms 棋盘定格暗场作过渡。
        // 有宿主接管（局外壳）时暗场后直接进结算页，不再多一步“继续”；
        // 独立页/iframe 没有后续页面可去，仍弹本场战果面板收尾。
        this.playGameOverTransition();
        if (this.resultTimer !== null) clearTimeout(this.resultTimer);
        this.resultTimer = setTimeout(() => {
          if (this.destroyed) return;
          if (this.onBattleDismissed) {
            this.onBattleDismissed();
            return;
          }
          this.gameOverPanel.open(playerWon, this.buildGameOverStats(), ev.reason === 'surrender');
        }, scaledMs(900));
        break;
      }
      // Skill presentation events.
      case 'skill-cast': {
        // 土系保留专属施法采样，叠在统一蓄力之上
        if (this.casterColor(ev.characterId) === BaseColor.Brown) this.audio.play('skillCastEarth');
        // 施放瞬间引擎已把法力清零：卡面宝石当场排空、撤掉可释放态（双方），
        // 之后的法力获得照常播放，回合尾 refreshTeams 再与引擎对齐。
        this.cardOfChar(ev.characterId)?.drainMana();
        // 所有技能统一「蓄力 → 发射」：此处起蓄力，预留段末尾由 onCastRelease 发射
        this.playCastCharge(ev.characterId);
        // 我方施法先出立绘切入；敌方施法出预告名牌
        //（时间线已按阵营预留，见 EventStreamPlayer 的 skill-cast）
        if (this.isAllyCaster(ev.characterId)) this.playCastCutIn(ev.characterId);
        else this.playEnemyCastCue(ev.characterId);
        break;
      }
      case 'skill-damage': {
        const card = this.cardOfChar(ev.targetId);
        if (!card) break;
        // 骷髅爆炸（炸毁骷髅）：从爆炸点发射骷髅弹体打向敌方队首卡，不走技能弹道
        if (ev.skullBurst) {
          this.playSkullExplosion(ev, card);
          break;
        }
        if (ev.range === 'splash') {
          this.playSplashChainDamage(ev, card, presentation?.splashSwordDurationMs);
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
          this.showTraitActivations(ev);
          if (to) {
            this.playFrameFX(hitFx, to.x, to.y);
            this.playHitBurst(to.x, to.y, color);
          }
          playHitAudio();
          // 反射弹回的法术伤害：标注「反射」并用反射主题色，避免被看成反射方主动放了个技能
          card.floatText(ev.reflected ? `反射 -${damage}` : `-${damage}`, ev.reflected ? '#9ecfff' : '#ff6b6b');
          card.hitFlash();
          card.refresh();
        };
        if (ev.reflected) {
          const reflectorCard = this.cardOfChar(ev.casterId);
          reflectorCard?.statusCue({ text: '', color: '#9ecfff', ring: 'pulse' });
          this.audio.playStatusCue('reflect');
        }
        if (from && to && ev.casterId !== ev.targetId) {
          this.playProjectile(from, to, color, impact, {
            onApproach: audioLeadMs > 0 ? playHitAudio : undefined,
            approachLeadMs: audioLeadMs,
            durationMs: presentation?.projectileDurationMs,
          });
        } else {
          impact();
        }
        break;
      }
      case 'gem-explode': {
        // Every cell still clears in the board player. Only expensive overlapping
        // full strips are clustered, with a fixed per-wave render budget.
        const bursts = planExplosionBursts(ev.cells.map(cell => cell.pos));
        const perCellScale = (this.board.cellSize * 1.8) / AnimConfig.frameFX.energy_burst.displayH;
        for (const burst of bursts) {
          const p = this.cellsCenterInOverlay([burst.pos]);
          if (!p) continue;
          this.playFrameFX('energy_burst', p.x, p.y, {
            frameClock: presentation?.explosionClock,
            scale: perCellScale * burst.scale,
            rotateDeg: (burst.pos.row * 71 + burst.pos.col * 47) % 360,
            // Dense waves start together; no hidden radial tail after the clear.
            filter: 'filter:brightness(1.75) saturate(1.35)',
          });
        }
        break;
      }
      case 'buff': {
        const card = this.cardOfChar(ev.targetId);
        const feedback = presentation?.buffFeedback;
        if (card) {
          const color = BUFF_COLOR[ev.stat] ?? '#e8c879';
          const amount = feedback?.amount ?? ev.amount;
          // 单项变化也带上属性名（「魔力 +4」），否则一个裸 +4 看不出涨的是哪项；停留更久一点
          const label = STAT_LABEL[ev.stat];
          const single = `${label ? `${label} ` : ''}${amount >= 0 ? '+' : ''}${amount}`;
          if (feedback?.show ?? true) card.floatText(feedback?.text ?? single, color, Math.max(feedback?.durationMs ?? 0, 1000));
          card.refresh(); // Every original attribute event still updates its projection.
          // 对应数值放大发光 + ▲/▼（法力走法力流演出，不在此处理）
          if (ev.stat !== 'mana' && ev.amount !== 0) card.pulseStat(ev.stat, ev.amount > 0 ? 1 : -1);
          const fx = feedback ? feedback.heavyFx
            : ev.source !== 'trait' && ev.amount > 0
              ? ev.stat === 'hp' ? 'heal_cleanse' : ev.stat === 'armor' ? 'armor_up' : undefined
              : undefined;
          if (fx) {
            if (feedback?.playAudio ?? true) this.audio.play(fx === 'heal_cleanse' ? 'healing' : 'armor');
            const center = this.cardCenterInOverlay(card);
            if (center) this.playFrameFX(fx, center.x, center.y, { durationMs: feedback?.durationMs });
          } else if (ev.stat !== 'mana' && ev.amount !== 0) {
            // 没有治疗/护甲重特效的属性变化（攻击、魔力、削减）：轻量提示音（AudioManager 内同类节流）
            this.audio.play(ev.amount > 0 ? 'statUp' : 'statDown');
          }
        }
        break;
      }
      case 'status-apply': {
        const card = this.cardOfChar(ev.targetId);
        const feedback = presentation?.statusFeedback;
        const show = feedback?.show ?? true;
        if (card) {
          if (ev.refreshed) {
            // 刷新/叠层：只脉冲对应徽记，不重复演「中招」
            card.applyStatusBadge(ev.statusId, true);
          } else {
            // 新挂：徽印在卡面中央弹出再飞入徽记栏。一张卡一批最多演 3 枚，其余直接弹徽记（防刷屏）
            const order = feedback?.order ?? 0;
            const url = order < STATUS_EMBLEM_MAX_PER_CARD ? statusEmblemUrl(ev.statusId) : null;
            card.announceStatus(ev.statusId, url, statusBadge(ev.statusId).color, order);
          }
          // Never suppress individual accents or persistent/mechanism state.
          card.setStatusAccent(ev.statusId, true);
        }
        const ids = feedback?.statusIds ?? [ev.statusId];
        const center = card ? this.cardCenterInOverlay(card) : null;
        if (feedback?.playAudio ?? true) this.audio.playStatusApply(ids[0] ?? ev.statusId);
        if (show) {
          const fx = statusFeedbackFX(ids);
          if (center && fx) this.playFrameFX(fx, center.x, center.y);
          if (ids.length > 1) card?.floatText(statusFeedbackLabel(ids, id => statusBadge(id).label), '#c7a5ef');
        }
        switch (ev.statusId) {
          case 'frozen': card?.setFrozen(true); break;
          case 'stun':
            this.mountStatusPersist(ev.targetId, 'stun', 'stun_persist');
            // 击晕专属反馈：头顶转圈金星（此前误用冰冻闪光帧）
            if (show) card?.stunStars();
            break;
          case 'entangle': card?.setEntangled(true); break;
          case 'silence': card?.setSilenced(true); break;
          default: break;
        }
        break;
      }
      case 'status-blocked': {
        // 免疫 / 赐福抵挡 / 潜水闪避 / 冰冻吞额外回合 / 沉默无法充能：
        // 光圈 + 飘字 + 轻提示音。同卡同原因短时间内只演一次（沉默会随每次同色匹配重复来）
        const card = this.cardOfChar(ev.targetId);
        if (!card) break;
        const key = `${ev.targetId}:${ev.reason}`;
        const now = performance.now();
        if (now - (this.statusCueShownAt.get(key) ?? -Infinity) < STATUS_CUE_REPEAT_MS) break;
        this.statusCueShownAt.set(key, now);
        const cue = statusBlockedCue(ev, id => statusBadge(id).label);
        card.statusCue(cue);
        if (cue.sfx) this.audio.playStatusCue(cue.sfx);
        break;
      }
      case 'status-cleanse': {
        // 净化（移除负面）与驱散（移除正面）走同一事件类型，靠 kind 区分：
        // 只撤 statusIds 里真正被移除的持续层——此前无差别清空，会把仍在身上的
        // 屏障/下潮光晕（净化）或冰封/沉默（驱散）一起抹掉。
        const card = this.cardOfChar(ev.targetId);
        const dispel = ev.kind === 'dispel';
        for (const id of ev.statusIds) {
          card?.setStatusAccent(id, false);
          if (id === 'frozen') card?.setFrozen(false);
          else if (id === 'silence') card?.setSilenced(false);
          else if (id === 'entangle') card?.setEntangled(false);
          else this.removeStatusPersist(ev.targetId, id);
        }
        if (card) {
          card.removeStatusBadge();
          // 按引擎当前 statuses 校正（别名/多实例的边界一次性对齐）
          card.syncStatusVisuals();
          card.refresh();
          const cue = statusExpireCue(dispel ? 'dispelled' : 'cleansed');
          card.statusCue(cue);
          if (cue.sfx) this.audio.playStatusCue(cue.sfx);
          const center = this.cardCenterInOverlay(card);
          // 净化=治疗系光效/音效；驱散不是治疗，只用碎裂光圈 + 驱散提示音
          if (!dispel) {
            this.audio.play('healing');
            if (center) this.playFrameFX('heal_cleanse', center.x, center.y);
          }
        }
        break;
      }
      case 'status-tick': {
        // Original ticks all dispatch; only transient feedback is folded per card.
        // DOT remains silent and uses short flashes, not repeated heavy strips.
        const card = this.cardOfChar(ev.targetId);
        const feedback = presentation?.statusFeedback;
        if (card) {
          const damage = feedback?.damage ?? ((ev.damage ?? 0) + (ev.armorDamage ?? 0));
          const ids = feedback?.statusIds ?? [ev.statusId];
          if ((feedback?.show ?? true) && damage > 0) {
            const center = this.cardCenterInOverlay(card);
            const fx = statusFeedbackFX(ids);
            if (center && fx) this.playFrameFX(fx, center.x, center.y);
            // DoT 扣血此前只有飘字、没有声音：卡面短促受击闪 + 轻量闷击音（同刻多目标只响一声）
            card.hitFlash();
            this.audio.play('dotTick');
            // 飘字按状态分色（出血红 / 燃烧橙 / 其余绿），多种 DoT 同回合结算时逐条列出
            const rows = feedback?.damageRows ?? [{ statusId: ev.statusId, damage }];
            card.floatText(dotTickBreakdown(rows, damage, id => statusBadge(id).label), dotTickColor(ids));
          }
          // 非伤害结算的专属演出：死亡标记秒杀、恐怖后退（此前 damage=0 完全无反馈）
          const cue = statusTickCue(ev.statusId);
          if (cue) {
            card.statusCue(cue);
            if (cue.sfx) this.audio.playStatusCue(cue.sfx);
          }
          card.refresh();
        }
        break;
      }
      case 'status-expire': {
        const card = this.cardOfChar(ev.targetId);
        const feedback = presentation?.statusFeedback;
        const expire = () => {
          if (card) {
            card.removeStatusBadge();
            card.setStatusAccent(ev.statusId, false);
          }
          // 状态到期：移除其持续层（序列帧）或冰封卡面态
          if (ev.statusId === 'frozen') card?.setFrozen(false);
          else if (ev.statusId === 'silence') card?.setSilenced(false);
          else if (ev.statusId === 'entangle') card?.setEntangled(false);
          else this.removeStatusPersist(ev.targetId, ev.statusId);
          // 移除原因专属演出（挣脱 / 增益被剥离 / 净化 / 驱散 / 屏障挡住 DoT）：
          // 每目标每种原因只演一次，由 statusPlayback 在批内标记
          if (card && feedback?.cue) {
            const cue = statusExpireCue(feedback.cue);
            card.statusCue(cue);
            if (cue.sfx) this.audio.playStatusCue(cue.sfx);
          }
        };
        // 法术被屏障整发吸收：照常打出弹道，命中时播格挡，屏障随之碎掉
        const blocked = ev.absorbedFrom;
        if (blocked && card) {
          const casterCard = this.cardOfChar(blocked.casterId);
          const from = casterCard ? this.cardCenterInOverlay(casterCard) : null;
          const to = this.cardCenterInOverlay(card);
          const dir = this.attackDir(blocked.casterId);
          const impact = () => { this.playBarrierBlock(card, dir); expire(); };
          if (from && to && blocked.casterId !== ev.targetId && blocked.range !== 'splash') {
            this.audio.play('skill');
            this.playProjectile(from, to, this.skillFxColor(blocked.casterId), impact);
          } else {
            impact();
          }
          break;
        }
        expire();
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
      case 'troop-reposition': {
        const view = this.leftTeamView.getCard(ev.targetId)
          ? this.leftTeamView
          : this.rightTeamView.getCard(ev.targetId)
            ? this.rightTeamView
            : null;
        view?.placeCard(ev.targetId, ev.index ?? (ev.to === 'front' ? 0 : 99));
        break;
      }
      case 'team-shuffle':
        this.viewOf(ev.player).orderCards(ev.order);
        break;
      case 'troop-transform': {
        const card = this.cardOfChar(ev.targetId);
        if (!card) break;
        const portrait = resolveTroopPortrait(ev.name, { troopId: ev.troopId });
        this.portraitById.set(ev.targetId, portrait);
        // 变身把 statuses 清空（技能路径不发 expire）：卡面持续层/控制态按新状态校正
        this.removeAllStatusPersist(ev.targetId);
        card.syncStatusVisuals();
        // 轻量转化演出：卡面翻到侧面换脸再翻回，外沿一圈流光 + 上行琶音
        this.audio.play('troopTransform');
        card.transformFlip(() => {
          card.reface(portrait);
          card.floatText(ev.name, '#f0d9a4');
        });
        break;
      }
      case 'economy-gain': {
        const ally = state.teams[ev.side].characters.find((c) => !c.defeated);
        const card = ally ? this.cardOfChar(ally.id) : undefined;
        const label = ev.currency === 'gold' ? '金币'
          : ev.currency === 'souls' ? '灵魂'
            : ev.currency === 'gems' ? '宝石'
              : '藏宝图';
        card?.floatText(`+${ev.amount} ${label}`, '#ffd24a');
        break;
      }
      case 'special-gem-trigger':
        this.showSpecialGemTrigger(ev);
        break;
      case 'extra-turn': {
        if (this.turnHudEl) this.extraTurnNotice.show(this.turnHudEl, ev.player);
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
      this.stormIndicator.show(plan.color, ev.player, plan.dropKind);
    } else {
      this.stormIndicator.hide(ev.player);
    }
  }

  /** 特殊宝石触发的程序化反馈：触发环、标签，以及闪电的整行/整列扫光。 */
  private showSpecialGemTrigger(
    ev: Extract<GameEvent, { type: 'special-gem-trigger' }>,
  ): void {
    const center = this.cellsCenterInOverlay([ev.pos]);
    if (!center) return;
    const feedback = SPECIAL_GEM_FEEDBACK[ev.kind];
    if (!feedback) return;

    const ring = document.createElement('div');
    ring.dataset.specialGemFeedback = ev.kind;
    ring.style.cssText = [
      'position:absolute', `left:${center.x}px`, `top:${center.y}px`,
      'width:52px', 'height:52px', 'z-index:36', 'pointer-events:none',
      'border:2px solid', `border-color:${feedback.color}`, 'border-radius:50%',
      'box-sizing:border-box', `box-shadow:0 0 8px ${feedback.color},0 0 22px ${feedback.color}`,
      'transform:translate(-50%,-50%) scale(.34)', 'opacity:0',
    ].join(';');
    this.overlay.appendChild(ring);
    const ringAnim = ring.animate(
      [
        { opacity: 0, transform: 'translate(-50%,-50%) scale(.34)' },
        { opacity: 1, transform: 'translate(-50%,-50%) scale(.82)', offset: .28 },
        { opacity: 0, transform: 'translate(-50%,-50%) scale(1.5)' },
      ],
      { duration: 440, easing: 'cubic-bezier(.16,.8,.24,1)' },
    );
    ringAnim.onfinish = () => ring.remove();

    const label = document.createElement('div');
    label.textContent = feedback.label;
    label.style.cssText = [
      'position:absolute', `left:${center.x}px`, `top:${center.y - 28}px`,
      'z-index:37', 'pointer-events:none', 'transform:translate(-50%,-50%)',
      'font-family:"Oswald","Microsoft YaHei",sans-serif', 'font-size:13px',
      'font-weight:700', 'letter-spacing:.08em', 'white-space:nowrap',
      `color:${feedback.color}`, `text-shadow:0 1px 3px rgba(0,0,0,.95),0 0 8px ${feedback.color}`,
    ].join(';');
    this.overlay.appendChild(label);
    const labelAnim = label.animate(
      [
        { opacity: 0, transform: 'translate(-50%, -35%) scale(.82)' },
        { opacity: 1, transform: 'translate(-50%, -50%) scale(1)', offset: .24 },
        { opacity: 0, transform: 'translate(-50%, -92%) scale(1.04)' },
      ],
      { duration: 520, easing: 'ease-out' },
    );
    labelAnim.onfinish = () => label.remove();

    if (ev.kind !== 'lightningRow' && ev.kind !== 'lightningCol') return;
    const boardOrigin = this.board.toGlobal(new PixiPoint(0, 0));
    const sweep = document.createElement('div');
    const horizontal = ev.kind === 'lightningRow';
    const line = ev.line ?? ev.pos.row;
    sweep.style.cssText = horizontal
      ? [
          'position:absolute', `left:${boardOrigin.x}px`,
          `top:${boardOrigin.y + (line + .5) * this.board.cellSize}px`,
          `width:${this.board.gridPixels}px`, 'height:3px', 'z-index:35', 'pointer-events:none',
          `background:linear-gradient(90deg,transparent,${feedback.color},#fff,${feedback.color},transparent)`,
          `box-shadow:0 0 8px ${feedback.color},0 0 18px ${feedback.color}`,
          'transform:translateX(-100%)',
        ].join(';')
      : [
          `left:${boardOrigin.x + (line + .5) * this.board.cellSize}px`,
          `top:${boardOrigin.y}px`, 'width:3px', `height:${this.board.gridPixels}px`,
          'position:absolute', 'z-index:35', 'pointer-events:none',
          `background:linear-gradient(180deg,transparent,${feedback.color},#fff,${feedback.color},transparent)`,
          `box-shadow:0 0 8px ${feedback.color},0 0 18px ${feedback.color}`,
          'transform:translateY(-100%)',
        ].join(';');
    this.overlay.appendChild(sweep);
    const sweepAnim = sweep.animate(
      horizontal
        ? [{ transform: 'translateX(-100%)' }, { transform: 'translateX(100%)' }]
        : [{ transform: 'translateY(-100%)' }, { transform: 'translateY(100%)' }],
      { duration: 360, easing: 'cubic-bezier(.2,.75,.3,1)' },
    );
    sweepAnim.onfinish = () => sweep.remove();
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
    const surged = Boolean(ev.surge);
    const sources = surged && origins.length > 0
      ? origins.flatMap((point) => [point, point])
      : origins;

    if (surged && origins.length > 0) {
      const now = performance.now();
      if (now - this.lastManaSurgeAt > 120) {
        this.lastManaSurgeAt = now;
        const origin = origins[0]!;
        this.fx.manaSurge(origin.x, origin.y, MANA_FLOW_HEX[ev.color]);
        this.audio.play('manaSurge');
      }
    }

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
      // 拖尾长度：横屏按水平跨度；竖屏法力主要竖向流动，按路径距离，否则恒取下限
      const tailBasis = this.portrait ? distance : Math.abs(dx);
      const tailLength = Math.max(surged ? 88 : 68, Math.min(surged ? 136 : 112, tailBasis * (surged ? 0.3 : 0.24)));
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
        `transform:translate(${points[0].x}px,${points[0].y}px) rotate(${angles[0]}deg) scale(${surged ? .72 : .58})`,
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
      const delay = (manaMoteDelay(index, sources.length) * 1000) / playbackScale;
      const offsets = [0, 0.17, 0.52, 0.84, 1];
      const scales = surged ? [0.72, 1.28, 1.16, 0.94, 0.2] : [0.58, 1.08, 1, 0.86, 0.16];
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

  /** 攻击冲撞特效：攻击者短促前压（不跨屏顶到对方卡上），目标受击后退 */
  private playAttackLunge(attackerId: number, targetId: number, onImpact?: () => void): void {
    const attacker = this.cardOfChar(attackerId);
    const target = this.cardOfChar(targetId);
    if (!attacker) return;
    // 攻击者属于哪一方决定冲撞方向：横屏左队向右(+)、右队向左(-)；竖屏我方向上(-)、敌方向下(+)
    const dir = this.attackDir(attackerId);
    const dist = this.lungeDistance(attacker, target);
    attacker.lunge(dir * dist, () => {
      onImpact?.();
      // 命中瞬间：撞击音效 + 整屏震动(棋盘+卡片一起晃) + 目标后仰 + 命中特效
      this.audio.play('skullHit');
      impactShake(this.wrapper, this.wrapper.style.transform);
      if (target) target.recoil(dir * 1, this.motionAxis);
      this.playImpactFX(target ?? attacker, dir);
    }, this.motionAxis);
  }

  /**
   * 冲撞距离：短促前压（原先按 0.7×卡距、上限 520px，会把攻击者整个顶到对方卡上，
   * 加上受击方大立绘溢出，观感像双方对撞）。压到 0.3×卡距、上限 170px，
   * 命中点交给命中特效与受击后仰表达。卡距沿冲撞轴量（竖屏为上下）。
   */
  private lungeDistance(attacker: CharacterCard, target: CharacterCard | undefined): number {
    if (!target) return 150;
    const a = attacker.el.getBoundingClientRect();
    const t = target.el.getBoundingClientRect();
    const gap = this.portrait ? Math.abs(t.top - a.top) : Math.abs(t.left - a.left);
    // getBoundingClientRect 受 wrapper 缩放影响，除回缩放还原到布局坐标
    return Math.min(Math.max((gap / this.currentScale()) * 0.3, 70), 170);
  }

  /**
   * 被屏障挡下 / 被闪避的骷髅攻击：冲撞照常（与 playAttackLunge 同距离），命中瞬间
   * 屏障 → 护盾格挡音 + 冰蓝护盾圈 + 轻震屏；闪避 → 破空声 + 目标侧身让开。都不播斩击与后仰。
   */
  private playDeflectedLunge(attackerId: number, targetId: number, reason: 'barrier' | 'dodge', onImpact?: () => void): void {
    const attacker = this.cardOfChar(attackerId);
    const target = this.cardOfChar(targetId);
    if (!attacker) return;
    const dir = this.attackDir(attackerId);
    const dist = this.lungeDistance(attacker, target);
    attacker.lunge(dir * dist, () => {
      onImpact?.();
      if (reason === 'barrier') {
        this.playBarrierBlock(target, dir);
      } else {
        this.audio.play('whoosh');
        target?.dodgeStep(dir, this.motionAxis);
        target?.floatText('闪避', '#d9d4c7');
      }
    }, this.motionAxis);
  }

  /** 屏障格挡反馈（骷髅普攻与法术共用）：格挡音 + 护盾圈 + 轻震屏 + 「格挡」字 */
  private playBarrierBlock(target: CharacterCard | undefined, dir: number): void {
    this.audio.play('barrierBlock');
    impactShake(this.wrapper, this.wrapper.style.transform, 0.35);
    target?.blockFlash(dir, this.motionAxis);
    target?.floatText('格挡', '#a9ddff');
  }

  /**
   * 攻击落空挣扎（队首被控：冰冻/缠绕无法攻击）：
   * 小幅向前冲一下又被"拉回"原位，配合轻微抖动，表达"想打但动不了"，不造成伤害。
   */
  private playStruggle(attackerId: number): void {
    const attacker = this.cardOfChar(attackerId);
    if (!attacker) return;
    const dir = this.attackDir(attackerId);
    const el = attacker.el;
    const nudge = dir * 14; // 小幅前冲（远小于正常冲撞）
    const t = this.portrait ? 'translateY' : 'translateX';
    el.animate(
      [
        { transform: `${t}(0px) rotate(0deg)` },
        { transform: `${t}(${nudge * 0.5}px) rotate(${dir * 1.5}deg)`, offset: 0.2 },
        { transform: `${t}(${nudge}px) rotate(${dir * 2}deg)`, offset: 0.38 },
        // 被"拉回"：反向过冲一点点再归位，像被束缚拽住
        { transform: `${t}(${-dir * 5}px) rotate(${-dir * 1}deg)`, offset: 0.62 },
        { transform: `${t}(${nudge * 0.4}px) rotate(${dir * 1}deg)`, offset: 0.8 },
        { transform: `${t}(0px) rotate(0deg)` },
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
    // 接触点：目标朝攻击者一侧的边缘（横屏左右沿竖向居中，竖屏上下沿水平居中），换算到覆盖层布局坐标
    let px: number;
    let py: number;
    if (this.portrait) {
      px = (tRect.left + tRect.width / 2 - oRect.left) / scale;
      py = ((dir > 0 ? tRect.top : tRect.bottom) - oRect.top) / scale;
    } else {
      px = ((dir > 0 ? tRect.left : tRect.right) - oRect.left) / scale;
      py = (tRect.top + tRect.height / 2 - oRect.top) / scale;
    }

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
   * 逐帧播放图集（fxAtlas）。
   * @param px 接触点 X（覆盖层布局坐标）
   * @param py 接触点 Y（覆盖层布局坐标）
   */
  private playSlashFX(px: number, py: number): void {
    if (this.destroyed || this.surrendered) return;
    const cfg = AnimConfig.slash;
    const atlas = App.frameAtlas(SLASH_STRIP, cfg);
    const dispW = (cfg.frameW / cfg.frameH) * cfg.displayH;
    const el = document.createElement('div');
    el.style.cssText = [
      'position:absolute', `left:${px}px`, `top:${py}px`,
      `width:${cfg.frameW}px`, `height:${cfg.frameH}px`,
      'pointer-events:none', 'z-index:32',
      // 命中爆点本身较亮且彩色：轻提亮+增艳即可，加中性白发光描边强调撞击点，避免过曝。
      'filter:brightness(1.25) saturate(1.2) drop-shadow(0 0 10px rgba(255,255,255,.85))',
      // 缩放到目标显示尺寸 + 以中心定位（爆炸为放射状，无需按方向镜像）
      `transform:translate(-50%,-50%) scale(${dispW / cfg.frameW})`,
      'transform-origin:center center',
    ].join(';');
    const { layer } = mountFxFrames(el, atlas);
    this.overlay.appendChild(el);
    const animation = playFxFrames(layer, atlas, { duration: cfg.duration });
    let timer: number | undefined = undefined;
    const token = this.finiteVisuals.begin(() => { clearTimeout(timer); el.remove(); });
    const finish = () => { if (!token.active) return; clearTimeout(timer); el.remove(); token.finish(); };
    void animation.finished.then(finish, () => {});
    timer = window.setTimeout(finish, scaledMs(cfg.duration) + 30);
  }

  /** 取序列帧图集并核对帧几何与 AnimConfig 一致 */
  private static frameAtlas(stem: string, cfg: { frames: number; frameW: number; frameH: number }): FxAtlas {
    const atlas = fxAtlas(stem);
    if (atlas.frames.length !== cfg.frames || atlas.frameW !== cfg.frameW || atlas.frameH !== cfg.frameH) {
      throw new Error(`序列帧图集 ${stem} 与 AnimConfig 几何不一致，请重跑 scripts/build_fx_atlas.py`);
    }
    return atlas;
  }

  /** 特效名对应的图集（AnimConfig.frameFX 的键） */
  private static frameFXAtlas(name: string): FxAtlas {
    const cfg = AnimConfig.frameFX[name];
    const stem = App.FRAME_FX_STRIP[name];
    if (!cfg || !stem) throw new Error(`未登记的序列帧特效：${name}`);
    return App.frameAtlas(stem, cfg);
  }

  /**
   * 骷髅爆炸演出（炸毁骷髅的官方规则，DECISIONS「骷髅爆炸」）：
   * 所有被炸骷髅**合并为一枚**骨白色能量弹，与单体技能共用同一条 playProjectile
   * 匀速直线弹道，从被炸骷髅的质心格射向敌方队首卡。到达即 skullHit 音效 +
   * 飘伤害数字 + 卡面受击刷新——不放任何额外爆炸/迸溅特效层，干脆利落。
   */
  private playSkullExplosion(
    ev: Extract<GameEvent, { type: 'skill-damage' }>,
    card: CharacterCard,
  ): void {
    const to = this.cardCenterInOverlay(card);
    if (!to) return;
    const from = this.cellsCenterInOverlay([ev.originCell ?? { row: 3, col: 3 }]) ?? to;
    this.playProjectile(from, to, '#e8e0cf', () => {
      this.showTraitActivations(ev);
      this.audio.play('skullHit');
      card.floatText(`-${ev.damage}`, '#ffb37a');
      card.hitFlash();
      card.refresh();
    });
  }

  private playSplashChainDamage(
    ev: Extract<GameEvent, { type: 'skill-damage' }>,
    card: CharacterCard,
    swordDurationMs?: number,
  ): void {
    const target = this.cardCenterInOverlay(card);
    const impact = () => {
      this.showTraitActivations(ev);
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
      this.visualDelay(AnimConfig.splashChain.firstImpactDelay, impact);
      return;
    }

    const fromCard = ev.chainFromId !== undefined ? this.cardOfChar(ev.chainFromId) : null;
    const from = fromCard ? this.cardCenterInOverlay(fromCard) : null;
    if (from && target) this.playSplashChainSword(from, target, impact, swordDurationMs);
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

    const hitCfg = AnimConfig.frameFX[hitFx];
    const groupHitRotate = this.portrait && hitCfg && hitCfg.frameW / hitCfg.frameH > 1.3 ? 90 : 0;
    // 2) 命中延迟后，全体同时受击
    this.visualDelay(AnimConfig.groupAttack.hitDelay, () => {
      let audioPlayed = false;
      for (const ev of events) {
        const card = this.cardOfChar(ev.targetId);
        if (!card) continue;
        this.showTraitActivations(ev);
        const center = this.cardCenterInOverlay(card);
        // 受击范围大：群体受击 strip displayH 已放大，覆盖整卡而非头像中心一小块。
        // 宽幅 strip 横屏时沿棋盘↔屏外方向铺开；竖屏卡片横排，转 90° 保持同样的铺开方向、不压左右队友。
        if (center) this.playFrameFX(hitFx, center.x, center.y, { rotateDeg: groupHitRotate });
        // 颜色受击音效整批只播一次
        if (!audioPlayed) {
          this.audio.play(hitSfx);
          audioPlayed = true;
        }
        card.floatText(`-${ev.damage}`, '#ff6b6b');
        card.hitFlash();
        card.refresh();
      }
    });
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
    durationMs = AnimConfig.frameFX.splash_chain_sword.duration,
  ): void {
    if (this.destroyed || this.surrendered) return;
    const name = 'splash_chain_sword';
    const atlas = App.frameFXAtlas(name);
    const cfg = AnimConfig.frameFX[name]!;

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
      `transform-origin:${cfg.frameW}px ${cfg.frameH}px`,
      `transform:rotate(${rotation}deg) scale(${scale})`,
      'mix-blend-mode:screen',
      'filter:brightness(1.12) saturate(1.16) drop-shadow(0 0 7px rgba(70,185,255,.9)) drop-shadow(0 0 15px rgba(35,95,255,.55))',
    ].join(';');
    const { layer } = mountFxFrames(sword, atlas);
    anchor.appendChild(sword);
    this.overlay.appendChild(anchor);
    playFxFrames(layer, atlas, { duration: durationMs });

    sword.animate(
      [{ opacity: 0.68 }, { opacity: 1, offset: 0.42 }, { opacity: 1 }],
      { duration: durationMs, easing: 'ease-out', fill: 'forwards' },
    );
    let timer: number | undefined = undefined;
    const token = this.finiteVisuals.begin(() => { clearTimeout(timer); anchor.remove(); });
    timer = window.setTimeout(() => {
      if (!token.active) return;
      anchor.remove();
      try { onArrive(); } finally { token.finish(); }
    }, scaledMs(durationMs)); // 剑光到达即命中：与随倍速加快的剑光动画同步
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
    opts?: { onApproach?: () => void; approachLeadMs?: number; durationMs?: number },
  ): void {
    if (this.destroyed || this.surrendered) return;
    const cfg = AnimConfig.projectile;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    const dur = opts?.durationMs ?? Math.min(cfg.maxDuration, Math.max(cfg.minDuration, dist / cfg.speed));

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
    let tween: gsap.core.Tween | undefined = undefined;
    const token = this.finiteVisuals.begin(() => { tween?.kill(); el.remove(); });
    tween = gsap.to(proxy, {
      t: 1,
      duration: dur / 1000,
      ease: 'none', // 匀速直线，干脆
      onUpdate: () => {
        const x = from.x + dx * proxy.t;
        const y = from.y + dy * proxy.t;
        el.style.transform = `translate(${x}px,${y}px) rotate(${angle}deg)`;
        if (proxy.t >= approachAt) fireApproach();
      },
      onInterrupt: () => { el.remove(); token.finish(); },
      onComplete: () => {
        el.remove();
        fireApproach();
        try { if (token.active) onArrive(); } finally { token.finish(); }
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
    let timer: number | undefined = undefined;
    const token = this.finiteVisuals.begin(() => { clearTimeout(timer); wrap.remove(); });
    timer = window.setTimeout(() => { wrap.remove(); token.finish(); }, scaledMs(cfg.duration) + 40);
  }

  /**
   * 通用序列帧特效：在覆盖层 (px,py) 处叠加播放一条 strip（AnimConfig.frameFX[name]）。
   * 外框保持原帧尺寸并以中心定位，内层按图集逐帧切换（fxAtlas）。
   * @param name AnimConfig.frameFX 的键（图集名见 FRAME_FX_STRIP）
   * @param px 覆盖层布局坐标 X（中心）
   * @param py 覆盖层布局坐标 Y（中心）
   * @param opts.scale 额外缩放（默认 1）；opts.filter 覆盖默认滤镜
   */
  private playFrameFX(
    name: keyof typeof AnimConfig.frameFX | string,
    px: number,
    py: number,
    opts: { scale?: number; filter?: string; rotateDeg?: number; delay?: number; durationMs?: number; frameClock?: FramePlaybackClock; onComplete?: () => void } = {},
  ): void {
    if (this.destroyed || this.surrendered) return;
    if (opts.frameClock?.done) { opts.onComplete?.(); return; }
    const atlas = App.frameFXAtlas(name);
    const cfg = AnimConfig.frameFX[name]!;
    const baseScale = cfg.displayH / cfg.frameH;
    const scale = baseScale * (opts.scale ?? 1);
    const rot = opts.rotateDeg ? ` rotate(${opts.rotateDeg}deg)` : '';
    const delay = opts.delay ?? 0;
    const durationMs = opts.durationMs ?? cfg.duration;
    const el = document.createElement('div');
    el.dataset.fx = name;
    el.dataset.fxDurationMs = String(durationMs);
    if (opts.frameClock) el.dataset.fxPlayback = 'timeline';
    el.style.cssText = [
      'position:absolute', `left:${px}px`, `top:${py}px`,
      `width:${cfg.frameW}px`, `height:${cfg.frameH}px`,
      'pointer-events:none', 'z-index:32',
      opts.filter ?? App.FRAME_FX_FILTER[name] ?? 'filter:brightness(1.12) saturate(1.12) drop-shadow(0 0 8px rgba(255,255,255,.5))',
      `transform:translate(-50%,-50%) scale(${scale})${rot}`,
      'transform-origin:center center',
      delay > 0 ? 'opacity:0' : '',
    ].join(';');
    const { layer, setFrame } = mountFxFrames(el, atlas);
    let delayTimer: number | undefined;
    let endTimer: number | undefined = undefined;
    let unsubscribe: (() => void) | undefined;
    const token = this.finiteVisuals.begin(() => {
      unsubscribe?.();
      if (delayTimer !== undefined) clearTimeout(delayTimer);
      if (endTimer !== undefined) clearTimeout(endTimer);
      el.remove();
    });
    const finish = () => {
      if (!token.active) return;
      unsubscribe?.();
      if (delayTimer !== undefined) clearTimeout(delayTimer);
      if (endTimer !== undefined) clearTimeout(endTimer);
      el.remove();
      try { opts.onComplete?.(); } finally { token.finish(); }
    };
    if (opts.frameClock) {
      this.overlay.appendChild(el);
      unsubscribe = opts.frameClock.subscribe(progress => {
        if (progress >= 1) { finish(); return; }
        setFrame(Math.min(cfg.frames - 1, Math.floor(progress * cfg.frames)));
      });
      return;
    }
    // 帧动画（含 delay 段）随演出倍速加快，显隐与超时计时也按同一倍速换算
    if (delay > 0) delayTimer = window.setTimeout(() => { if (token.active) el.style.opacity = '1'; }, scaledMs(delay));
    this.overlay.appendChild(el);
    void playFxFrames(layer, atlas, { duration: durationMs, delay }).finished.then(finish, () => {});
    endTimer = window.setTimeout(finish, scaledMs(delay + durationMs) + 40);
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
    if (!cfg) throw new Error(`未登记的序列帧特效：${fxName}`);
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
      const atlas = App.frameFXAtlas(fxName);
      const scale = cfg.displayH / cfg.frameH;
      const el = document.createElement('div');
      el.dataset.fxPersist = fxName;
      el.style.cssText = [
        'position:absolute', `left:${anchor.x}px`, `top:${anchor.y}px`,
        `width:${cfg.frameW}px`, `height:${cfg.frameH}px`,
        'pointer-events:none', 'z-index:31',
        `opacity:${style.opacity}`,
        'mix-blend-mode:screen', // 暗部透出立绘，只叠加亮部，避免糊成一坨
        'filter:saturate(1.1)',
        `transform:translate(-50%,-50%) scale(${scale})`,
        'transform-origin:center center',
      ].join(';');
      const { layer } = mountFxFrames(el, atlas);
      this.overlay.appendChild(el);
      playFxFrames(layer, atlas, { duration: cfg.duration, iterations: Infinity });
      this.statusPersistLayers.set(key, el);
    };

    this.persistPending.add(key);
    mount();
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
   * 玩家技能释放流程（唯一实现，需求 2C）：详情窗「释放技能」、快速释放点卡、triggerCast 共用。
   * 校验 → 按需收集选分支/选色/选目标/选宝石（玩家 UI，取消则不释放）→ castSkill → 演出。
   * 不再有二次确认：详情窗本身就是确认（技能全文 + 目标说明已在窗内）。
   */
  private async castPlayerSkill(charId: number): Promise<void> {
    // casting 期间（含选目标/选宝石的点选）屏蔽任何新的释放，
    // 避免"点候选卡选目标"这次点击又触发该卡自身的技能。
    if (this.destroyed || this.surrendered || this.casting) return;
    const state = this.engine.getState();
    const ch = state.teams[PlayerSide.Left].characters.find((c) => c.id === charId);
    if (!ch || ch.defeated) return;

    // 此刻放不出（演出中 / 对手回合 / 法力不足 / 沉默 / 自动战斗…）：不排队、不静默，
    // 打开（或刷新）该角色的详情窗，按钮上写明原因；轮到我方可放时按钮会自己亮起来。
    if (this.castAvailability(ch, ch.mana).kind !== 'ready') {
      if (!this.settingsOpen && !this.pageHidden && !this.orientationBlocked && !this.startupPlaying) {
        this.openUnitSheet(charId);
      }
      return;
    }

    const proto = this.registry.prototypes.get(ch.skillId);
    // 进入施法流程即收起详情窗：选目标要看棋盘，立绘切入与技能演出也不能被窗盖住
    this.closeUnitSheet();

    this.casting = true;
    // 进入释放流程即禁用棋盘交换：选色/选目标/选宝石期间不允许拖动交换宝石（否则与选格点击冲突）
    this.stopIdle();
    this.input.enabled = false;
    this.castPicking = true;
    try {
      // 按需收集玩家选择；任一取消 → 放弃释放（不消耗法力、不改状态，需求 2C.6）
      if (proto) {
        let inputProto = proto;
        const choice = skillChoices(proto);
        if (choice) {
          const branch = await this.branchPicker.pick(this.wrapper, choice.labels);
          if (branch === null || this.destroyed || this.surrendered || this.settingsOpen) return;
          const selected = selectSkillBranch(proto, branch);
          if (!selected) return;
          inputProto = selected;
          this.engine.setBranchChooser(new FixedBranchChooser(branch));
        }
        if (prototypeNeedsColor(inputProto)) {
          const originCard = this.cardOfChar(charId);
          if (!originCard) return;
          // 统一为"点选一枚宝石"：点哪颗就取哪颗的颜色（与选宝石引爆同一套选择器）
          // B-11：选择层带说明——不写清楚要点什么，玩家只会乱点或以为卡住了
          const cell = await this.cellPicker.pick(
            originCard,
            this.wrapper,
            this.cellAimCoords(),
            '选择一枚宝石以决定法术颜色',
            (candidate) => this.engine.getState().board.get(candidate)?.type.kind === 'color',
            '这枚宝石不能决定颜色，请选择红、黄、蓝、绿、紫或棕色宝石',
          );
          if (cell === null) return;
          const gem = this.engine.getState().board.get(cell);
          // CellPicker 已阻止无效格结束选择；这里保留状态变化时的防御校验。
          if (!gem || gem.type.kind !== 'color') return;
          this.engine.setColorChooser(new FixedColorChooser(gem.type.color));
        }
        const tMode = prototypeChosenTargetMode(inputProto);
        if (tMode) {
          const view = (tMode === 'allyChosen' || tMode === 'allyChosenOther') ? this.leftTeamView : this.rightTeamView;
          const cards = candidatesFor(tMode, state, charId)
            .map((c) => view.getCard(c.id))
            .filter((c): c is NonNullable<typeof c> => !!c);
          const originCard = this.cardOfChar(charId);
          if (!originCard) return;
          const friendly = (tMode === 'allyChosen' || tMode === 'allyChosenOther');
          // 只有一个合法目标：不必让玩家再点一次，直接对它施放
          const pickedId = cards.length === 1
            ? cards[0].charId
            : await this.targetPicker.pick(
              originCard,
              cards,
              this.wrapper,
              friendly,
              friendly ? '选择一名盟友作为技能目标' : '选择一名敌人作为技能目标',
            );
          if (pickedId === null) return;
          this.engine.setTargetChooser(new FixedTargetChooser(pickedId));
        }
        // 点选一枚宝石：引爆某格 / 摧毁其所在行列共用同一选择器（需求 2B）
        if (prototypeNeedsCell(inputProto)) {
          const originCard = this.cardOfChar(charId);
          if (!originCard) return;
          const cell = await this.cellPicker.pick(
            originCard,
            this.wrapper,
            this.cellAimCoords(),
            '选择一枚宝石作为技能目标',
          );
          if (cell === null) return;
          this.engine.setCellChooser(new FixedCellChooser(cell));
        }
      }

      if (this.destroyed || this.surrendered || this.settingsOpen) return;
      // 选择收集完毕：之后的演出期间点卡照常打开详情窗（按钮显示「结算中」）
      this.castPicking = false;
      const events = this.session.resolve({ type: 'cast', characterId: charId });
      this.onEventsProduced?.(events);
      if (events.length === 0) return;
      try {
        await this.playEventsWithTail(events);
        if (this.destroyed || this.surrendered) return;
      } catch (err) {
        console.warn('[battle] skill playback failed', err);
      }
        this.refreshTeams();
      this.afterResolve();
    } catch (err) {
      console.warn('[battle] skill cast failed', err);
    } finally {
      this.castPicking = false;
      // 释放后恢复 AI 选择器，避免玩家的 Fixed 选择泄漏到 AI 回合
      this.engine.setBranchChooser(new AiBranchChooser());
      this.engine.setColorChooser(new AiColorChooser());
      this.engine.setTargetChooser(new AiTargetChooser());
      this.engine.setCellChooser(new AiCellChooser());
      // 延一帧再解除互斥：让"确认选目标/宝石的那次点击"引发的候选卡短按抬起
      // 落在 casting=true 窗口内被忽略，不会误触该卡自身技能。
      // 必须在 casting=false 之后再 syncPlayerInput，否则棋盘会一直锁死。
      window.setTimeout(() => { if (!this.destroyed) this.restoreAfterCast(); }, 0);
    }
  }

  /**
   * B-9：结算面板的战果。回合数取 BattleResult（权威口径，额外回合不另计），
   * 存活按我方编队现存未阵亡者，收集取战场经济池。取不到结果时返回 undefined，
   * 面板退回旧的两行版式而不是显示 0。
   */
  private buildGameOverStats(): GameOverStats | undefined {
    const result = this.exportResult();
    const state = this.engine.getState();
    const mine = state.teams[PlayerSide.Left].characters;
    const survivors = mine.filter((c) => !c.defeated).length;
    // 出战人数：结果里我方角色数（含中途阵亡者）优先，否则退回请求里的编队规模
    const teamSize = result
      ? result.combatants.filter((c) => c.side === 'player').length
      : this.battleRequest.playerTeam.length;
    const economy = result?.economy ?? state.economy;
    const loot = economy
      ? { gold: economy.gold, souls: economy.souls, gems: economy.gems }
      : undefined;
    return {
      // GameState 不存回合数；BattleResult 取不到时退回 HUD 的 turnNumber
      turns: result?.turns ?? this.turnNumber,
      survivors,
      teamSize: Math.max(teamSize, survivors),
      ...(loot ? { loot } : {}),
    };
  }

  /** B-9：胜负面板弹出前的 900ms 过渡——棋盘轻微暗场定格，而不是静默黑屏 */
  private playGameOverTransition(): void {
    if (!this.wrapper) return;
    this.wrapper.animate(
      [{ filter: 'brightness(1) saturate(1)' }, { filter: 'brightness(.62) saturate(.72)' }],
      { duration: 880, easing: 'ease-in', fill: 'forwards' },
    );
  }

  /**
   * 技能显示文本（详情窗技能块与我方施法切入的名牌共用），与 `buildDetailViewModel` 同一取数来源，
   * 免得同一个技能在切入里叫「技能」、在详情窗叫「英灵再世」：
   * 快照/角色携带的文本 → 按名字匹配的兵种数据 → 分拣技能池（AIRP/独立模式角色）。
   */
  private skillDisplayTextOf(ch: Character): { name: string; description: string } {
    const snapshot = this.idMap.snapshotOf(ch.id);
    const name = ch.spellName ?? snapshot?.spellName;
    const description = ch.spellDescription ?? snapshot?.spellDescription;
    if (name) return { name, description: description ?? '' };
    const troop = TROOPS.find((t) => t.name === ch.name);
    if (troop) return { name: troop.spell.name, description: troop.spell.description };
    const pool = skillDisplayOf(ch.skillId ?? '');
    if (pool) return { name: pool.name, description: pool.description };
    return { name: '技能', description: '' };
  }

  private skillNameOf(ch: Character): string {
    return this.skillDisplayTextOf(ch).name;
  }

  private skillDescriptionOf(ch: Character): string {
    return this.skillDisplayTextOf(ch).description;
  }

  /**
   * 详情窗技能块的目标说明（原施法确认层的目标预览逻辑）。
   * 能在释放前确定目标就写出来（「目标：全体敌人」「目标：夜斗」）；需要玩家点选的写
   * 「释放后点选 1 名敌人」，让玩家知道按下按钮后还有一步。唯一合法目标时直接点名（不会弹选择层）。
   */
  private castTargetNote(ch: Character, proto: SkillPrototype | undefined, ally: boolean): string {
    if (!proto) return '';
    const needsColor = prototypeNeedsColor(proto);
    const needsCell = prototypeNeedsCell(proto);
    const tMode = prototypeChosenTargetMode(proto);
    const state = this.engine.getState();
    const notes: string[] = [];
    // 敌人/盟友按施法者口径（与技能原文一致）；敌方的选择由对手 AI 做，不写「释放后点选」
    const pickVerb = ally ? '释放后点选' : '由对手指定';
    if (tMode) {
      const candidates = candidatesFor(tMode, state, ch.id);
      const who = (tMode === 'allyChosen' || tMode === 'allyChosenOther') ? '盟友' : '敌人';
      const reach = tMode === 'enemyChosenAndBelow' ? '（连同其下方的敌人）'
        : tMode === 'enemyChosenAndAdjacent' ? '（命中其上下相邻的敌人）'
          : tMode === 'enemyChosenAndNextDown' ? '（连同其正下方一名敌人）'
            : '';
      if (candidates.length === 0) notes.push(`目标：暂无可选${who}`);
      else if (candidates.length === 1) notes.push(`目标：${candidates[0].name}${reach}`);
      else notes.push(`${pickVerb} 1 名${who}${reach}`);
    } else {
      let automaticMode: TargetMode | null = null;
      let automaticCount = 1;
      for (const segment of proto.segments) {
        if (!('target' in segment) || typeof segment.target !== 'string') continue;
        automaticMode = segment.target;
        const count = 'n' in segment ? segment.n : undefined;
        if (typeof count === 'number') automaticCount = count;
        break;
      }
      if (automaticMode) {
        const who = automaticMode.startsWith('ally') ? '盟友' : '敌人';
        const isDeferred = automaticMode.startsWith('last')
          || automaticMode.endsWith('Target')
          || automaticMode === 'enemyNextDown';
        if (automaticMode === 'enemyAll' || automaticMode === 'allyAll') notes.push(`目标：全体${who}`);
        else if (automaticMode === 'allyOthers') notes.push('目标：其他全体盟友');
        else if (automaticMode === 'allySelf') notes.push('目标：自身');
        else if (automaticMode.includes('Random')) {
          const n = automaticMode.endsWith('RandomN') ? automaticCount : 1;
          notes.push(`目标：随机 ${n} 名${who}`);
        } else if (!isDeferred) {
          const targets = selectTargets(automaticMode, state, ch.id, new SeededRNG(0), automaticCount);
          if (targets.length) notes.push(`目标：${targets.map((target) => target.name).join('、')}`);
        }
      }
    }
    if (needsColor) notes.push(`${pickVerb}一枚宝石决定法术颜色`);
    else if (needsCell) notes.push(`${pickVerb}一枚宝石作为目标`);
    return notes.join(' · ');
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
    await this.playEventsWithTail(events);
    if (this.destroyed || this.surrendered) return false;
    return true;
  }

  /**
   * 调试辅助：喂一条合成 storm-change 事件走完整演出管线（时间线预留 + 指示器 + 爆发 FX + 音效）。
   * 引擎侧风暴机制（d-storm-engine 分支）合并前的表现层走查入口；合并后可直接用死亡召唤特质端到端触发。
   */
  async debugStormChange(ev: Extract<GameEvent, { type: 'storm-change' }>): Promise<void> {
    const events: GameEvent[] = [ev];
    this.onEventsProduced?.(events);
    await this.playEventsWithTail(events);
    if (this.destroyed || this.surrendered) return;
  }

  /** Test-console helper: mutate storm state through TurnEngine and play its events. */
  async debugSetStorm(color: BaseColor, side: PlayerSide, turns = 8, dropKind?: SkullStormDropKind): Promise<void> {
    const events = this.engine.debugSetStorm(color, side, turns, dropKind);
    if (events.length === 0) return;
    this.onEventsProduced?.(events);
    await this.playEventsWithTail(events);
    if (this.destroyed || this.surrendered) return;
    this.refreshTeams();
  }

  /** Temporary skill-test hook: preview the finalized elimination/chain set. */
  previewDebugGemChainSet(): void {
    this.audio.previewGemChainSet();
  }

  /** Temporary skill-test hook: preview the finalized elimination sound for a chain level. */
  previewDebugGemChainLevel(level: number): void {
    this.audio.previewGemChainLevel(level);
  }

  /** Test-console hook: preview one status-apply sound by raw statusId. */
  previewDebugStatusApply(statusId: string): void {
    this.audio.playStatusApply(statusId);
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

  /**
   * 调试钩子：直接结束当前对局（走真实结算管线）。
   *
   * 为什么需要它：阶段 A 没能拍到带真实明细的结算屏——自动交换打不完一局
   * （345 次尝试 / 22 分钟只成交 22 步，`14-result.md` 页头说明），于是 B-9/R-* 的
   * 实机证据一直缺位。本钩子把败方整队标为阵亡后**提交一次合法交换**，让引擎在
   * 回合尾自己的 `checkVictory` 里发出 `game-over`——事件流、`BattleResult`（回合数/
   * 角色终态/经济池）、结算面板与宿主回调全部走正常路径，不是伪造的假结果。
   *
   * @param playerWins true=玩家胜（敌方全灭），false=玩家败
   * @returns 是否真的结束了（无合法交换或非等待输入态时返回 false）
   */
  async debugEndBattle(playerWins = true): Promise<boolean> {
    const state = this.engine.getState();
    if (state.state !== MatchState.AwaitingInput) return false;
    const hint = pickHintSwap(state.board, this.rng);
    if (!hint) return false;
    const losing = playerWins ? PlayerSide.Right : PlayerSide.Left;
    for (const ch of state.teams[losing].characters) {
      ch.armor = 0;
      ch.hp = 0;
      ch.defeated = true;
    }
    state.teams[losing].summonQueue = [];
    this.input.enabled = false;
    this.stopIdle();
    const events = this.session.resolve({ type: 'swap', from: hint.a, to: hint.b });
    this.onEventsProduced?.(events);
    if (events.length === 0) return false;
    await this.playEventsWithTail(events);
    if (this.destroyed || this.surrendered) return false;
    this.refreshTeams();
    this.afterResolve();
    return true;
  }

  /** 通过主游戏释放流程释放某角色技能（测试页触发用）：直接进施法流程，等价于详情窗「释放技能」 */
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
    if (events.length > 0) await this.playEventsWithTail(events);
    if (this.destroyed || this.surrendered) return;
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
    // 详情窗与卡面同步（轮询之外的即时刷新：演出结束、轮到我方时按钮立刻亮起）
    this.refreshUnitSheet();
  }

  // —— 详情窗 / 施法演出（lane A）——

  /**
   * 详情卡扇可略微伸入两侧部队立绘，保留紧凑叠放而不挤在棋盘内；
   * 窄屏下设置/倍速/自动按钮排进 HUD 通道时只盖棋盘，避免按钮压住标题栏与关闭钮。
   */
  private applyUnitSheetBounds(includeHudLane: boolean): void {
    if (!this.unitSheet) return;
    const gridPx = this.board.cellSize * BoardModel.COLS;
    const inset = includeHudLane ? BOARD_TOP_INSET : 0;
    const width = Math.min(this.baseW, gridPx * 1.25);
    this.unitSheet.setBounds({
      left: this.root.x - (width - gridPx) / 2, top: this.root.y - inset, width, height: gridPx + inset,
    });
  }

  /**
   * 战斗卡点按（卡面任意位置，含宝石与徽记；或聚焦时按 Enter）。
   * 「快速释放」开且该我方角色此刻就能施放 → 直接进施法流程；
   * 其余一律打开详情窗（已开着同一张则收起、另一张则切换）。快速释放从不排队隐藏动作。
   */
  private onCardTap(charId: number, via: PressSource): void {
    // 正在选目标/选宝石：点卡由选择层处理（点候选=选定，点别处=取消），这里不响应。
    // 施法演出期间（casting 但已不在选择阶段）照常打开详情窗。
    if (this.destroyed || this.surrendered || this.castPicking) return;
    if (skipCastConfirm() && this.canCastNow(charId)) {
      void this.castPlayerSkill(charId);
      return;
    }
    if (this.unitSheet.charId === charId) this.closeUnitSheet();
    else this.openUnitSheet(charId, via === 'keyboard');
  }

  /** 我方角色此刻能否直接施放（我方回合、可输入、满法力、未沉默、非自动战斗） */
  private canCastNow(charId: number): boolean {
    const ch = this.engine.getState().teams[PlayerSide.Left].characters.find((c) => c.id === charId);
    return !!ch && this.castAvailability(ch, ch.mana).kind === 'ready';
  }

  /**
   * 施放可用性：详情窗按钮（传卡面显示法力）、快速释放判定与 castPlayerSkill 闸门（传引擎法力）共用。
   * 只读 App 自身状态，不依赖 input.enabled（自动战斗线可能另行接管输入）。
   *
   * 「对手回合」按画面口径判：引擎在一次行动结算完就已换边，而演出还在播——
   * 我方行动的演出期间是「结算中」，敌方回合（含其演出与收尾停顿）才是「对手回合」。
   */
  private castAvailability(ch: Character, mana: number): CastAvailability {
    const state = this.engine.getState();
    const proto = this.registry.prototypes.get(ch.skillId);
    const busy = this.settingsOpen || this.pageHidden || this.orientationBlocked || this.startupPlaying
      || this.casting || this.player.isPlaying() || this.visualPlaying
      || state.state !== MatchState.AwaitingInput;
    const presentedEnemyTurn = this.rightTeamView?.isTurnActive() ?? false;
    return resolveCastAvailability({
      autoBattle: this.autoBattleEnabled,
      defeated: ch.defeated,
      over: state.state === MatchState.GameOver || this.session.isFinished(),
      enemyTurn: presentedEnemyTurn || (!busy && state.activePlayer !== PlayerSide.Left),
      busy,
      mana,
      manaCost: ch.manaCost,
      silenced: (ch.statuses ?? []).some((s) => s.id === 'silence' || s.id === 'silenced'),
      usedOnce: !!proto?.oncePerBattle && state.actionLog.some((entry) => entry.skillId === ch.skillId),
    });
  }

  private findCharacter(charId: number): { ch: Character; side: PlayerSide } | null {
    const state = this.engine.getState();
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      const ch = state.teams[side].characters.find((c) => c.id === charId);
      if (ch) return { ch, side };
    }
    return null;
  }

  /** 施法者是否我方（立绘切入与时间线预留共用）：卡在左列，或在左队名单里 */
  private isAllyCaster(charId: number): boolean {
    return !!this.leftTeamView?.getCard(charId)
      || this.engine.getState().teams[PlayerSide.Left].characters.some((c) => c.id === charId);
  }

  /** 组装详情窗数据：数值取卡面显示值（与卡面同步，不抢先显示结算终值） */
  private unitSheetData(charId: number): UnitSheetData | null {
    const found = this.findCharacter(charId);
    if (!found) return null;
    const { ch, side } = found;
    const ally = side === PlayerSide.Left;
    const card = this.cardOfChar(charId);
    const shown: CardShownStats = card?.shownStats().stats ?? {
      attack: ch.attack, armor: Math.max(0, ch.armor), hp: Math.max(0, ch.hp), maxHp: ch.maxHp,
      magic: ch.magic, mana: Math.min(ch.mana, ch.manaCost), manaCost: ch.manaCost, defeated: ch.defeated,
      statuses: (ch.statuses ?? []).map((s) => ({ id: s.id, turns: s.turns, ...(s.magnitude !== undefined ? { magnitude: s.magnitude } : {}) })),
    };
    // 演示/宿主角色多为原创名字，按名字匹配兵种数据取稀有度/种族/王国；匹配不到则按角色自带字段降级
    const troop = TROOPS.find((t) => t.name === ch.name);
    const snapshot = this.idMap.snapshotOf(charId);
    const display = snapshot
      ? { spellName: snapshot.spellName, spellDescription: snapshot.spellDescription, traitNames: snapshot.traitNames }
      : undefined;
    const rarityIdx = troop ? troop.rarityIdx : typeof ch.eventRarity === 'number' ? ch.eventRarity : null;
    const tier = rarityIdx !== null ? RARITY_TIERS[Math.max(0, Math.min(RARITY_TIERS.length - 1, Math.floor(rarityIdx)))] : null;
    const types = troop?.troopTypes ?? ch.troopTypes ?? [];
    const kingdom = troop?.kingdom ?? ch.kingdom ?? '';
    const typeLine = [types.length ? raceNames(types) : '', kingdom, tier?.label ?? ''].filter(Boolean).join(' · ');
    const proto = this.registry.prototypes.get(ch.skillId);
    return {
      charId,
      ally,
      name: ch.name,
      portrait: this.portraitFor(ch),
      colors: [...ch.colors],
      shown,
      typeLine,
      race: types.length ? raceNames(types) : '',
      kingdom,
      rarityLabel: tier?.label ?? '',
      rarity: tier ? RARITY_TIERS.indexOf(tier) : null,
      rarityColor: tier?.color ?? null,
      skillName: this.skillNameOf(ch),
      skillDescription: this.skillDescriptionOf(ch),
      skillTag: kingdom ? `${kingdom} · 部队法术` : '部队法术',
      targetNote: this.castTargetNote(ch, proto, ally),
      traitSlots: traitSlotsOf(ch, troop, display),
      traitNames: { ...(snapshot?.traitNames ?? {}), ...(ch.traitNames ?? {}) },
      cast: ally ? this.castAvailability(ch, shown.mana) : undefined,
      quickCast: skipCastConfirm(),
    };
  }

  /** 详情窗刷新签名：卡面重绘版本 + 影响按钮状态的 App 标志；不变则跳过重建数据 */
  private unitSheetSignature(charId: number): string {
    const state = this.engine.getState();
    const card = this.cardOfChar(charId);
    return [
      charId, card ? card.shownStats().version : -1, this.autoBattleEnabled, this.casting,
      this.player.isPlaying(), this.visualPlaying, this.startupPlaying, this.settingsOpen,
      this.rightTeamView.isTurnActive(), state.activePlayer, state.state, skipCastConfirm(),
    ].join('|');
  }

  /** 打开或切换详情窗；键盘打开时把焦点移进窗内（指针点按不抢焦点） */
  private openUnitSheet(charId: number, focus = false): void {
    if (this.destroyed || !this.unitSheet) return;
    const data = this.unitSheetData(charId);
    if (!data) return;
    this.unitSheet.open(data, { focus });
    this.unitSheetSig = this.unitSheetSignature(charId);
    // 开着就轮询（160ms，只比签名）：演出结束、轮到我方时按钮自己亮起来，数值实时跟卡面
    if (this.unitSheetTimer === null) {
      this.unitSheetTimer = window.setInterval(() => this.refreshUnitSheet(), 160);
    }
  }

  private closeUnitSheet(): void {
    if (this.unitSheetTimer !== null) {
      window.clearInterval(this.unitSheetTimer);
      this.unitSheetTimer = null;
    }
    this.unitSheet?.close();
  }

  private refreshUnitSheet(): void {
    const id = this.unitSheet?.charId;
    if (id === null || id === undefined || this.destroyed) return;
    const sig = this.unitSheetSignature(id);
    if (sig === this.unitSheetSig) return;
    this.unitSheetSig = sig;
    const data = this.unitSheetData(id);
    if (data) this.unitSheet.update(data);
    else this.closeUnitSheet();
  }

  /** 我方施法立绘切入（skill-cast 时由 onBattleEvent 调用；时间线预留见 EventStreamPlayer） */
  private playCastCutIn(charId: number): void {
    if (!this.castCutIn) return;
    const ch = this.findCharacter(charId)?.ch;
    this.castCutIn.play({
      portrait: ch ? this.portraitFor(ch) : (this.portraitById.get(charId) ?? ''),
      casterName: ch?.name ?? '',
      skillName: ch ? this.skillNameOf(ch) : '',
      tint: this.skillFxColor(charId),
    });
  }

  /** 敌方施法预告：棋盘右上方名牌（无立绘）；蓄力光/音/震颤走统一的 playCastCharge */
  private playEnemyCastCue(charId: number): void {
    const ch = this.findCharacter(charId)?.ch;
    this.castCutIn?.playEnemy({ casterName: ch?.name ?? '', skillName: ch ? this.skillNameOf(ch) : '' });
  }

  /**
   * 统一施法蓄力（双方所有技能）：施法卡主法力色蓄力光、合成蓄力音（音高上扬 + 颤音渐急）、
   * 整屏细密震颤渐强。时长 = 时间线预留段（我方立绘入场+停留 / 敌方预告），末尾接 playCastRelease。
   */
  private playCastCharge(charId: number): void {
    const ally = this.isAllyCaster(charId);
    const reserveMs = castCutInReserveSeconds(charId) * 1000;
    this.cardOfChar(charId)?.castCharge(this.skillFxColor(charId), reserveMs > 0 ? reserveMs : undefined);
    if (reserveMs <= 0) return;
    // 音频不受倍速影响，按实际时长合成；震颤是 wrapper 下的 WAAPI，按 1× 写由倍速统一加速
    this.audio.castCharge(scaledMs(reserveMs) / 1000, ally ? 'ally' : 'enemy');
    chargeTremor(this.wrapper, reserveMs, this.wrapper.style.transform, ally ? 2.2 : 1.8);
  }

  /** 统一施法发射：蓄力收束成一记冲击音 + 震屏，紧接着技能效果结算 */
  private playCastRelease(charId: number): void {
    if (this.destroyed) return;
    const ally = this.isAllyCaster(charId);
    this.audio.castRelease(ally ? 'ally' : 'enemy');
    impactShake(this.wrapper, this.wrapper.style.transform, ally ? 0.6 : 0.5);
  }

  private disposeUnitSheetAndCutIn(): void {
    this.closeUnitSheet();
    this.unitSheet?.destroy();
    this.castCutIn?.cancel();
    this.unregisterCutInSide?.();
    this.unregisterCutInSide = null;
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
