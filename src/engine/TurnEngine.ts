import type { SkullDropMix } from './skullDrops';
import { BoardModel } from './BoardModel';
import { creditGoldForSide } from './battleGold';
import { MatchResolver, grantsExtraTurn } from './MatchResolver';
import type { MatchGroup } from './MatchResolver';
import { GravitySystem, STORM_DROP_WEIGHT, STORM_DOOMSKULL_DROP, STORM_UBER_DOOMSKULL_DROP } from './GravitySystem';
import type { SkullDropBoost } from './GravitySystem';
import { ManaDistributor } from './ManaDistributor';
import { CombatResolver } from './CombatResolver';
import { matchManaWithSurge, surgeNeedsRoll } from './manaSurge';
import { ExtensionRegistry } from './registry';
import { SeededRNG } from './rng';
import { reshuffle, hasLegalSwap } from './boardUtils';
import { tickTeamStatuses, canCastSkill, applyStatus, canGainMana, WEB_STATUS_ID,
  RANDOM_POSITIVE_STATUS_POOL, RANDOM_NEGATIVE_STATUS_POOL,
  hasStatus, ENCHANTED_STATUS_ID, endActionStatuses, hasLethalImmunity, lethalResistanceEvent } from './skills/effects/status';
import { executePrototype } from './skills/prototypes';
import { armor, destroyRandomGems } from './skills/builders';
import { damageOne } from './skills/effects/damage';
import { devourEffect } from './skills/effects/devour';
import { gemEffect } from './skills/effects/gems';
import { applyBuffGain } from './skills/effects/buff';
import { applyStormToTeam } from './skills/effects/storm';
import type { EffectContext, DestroyedGem } from './skills/effects/context';
import type { SummonTemplate } from './skills/effects/summon';
import { AiColorChooser, prototypeNeedsColor } from './skills/colorChooser';
import type { ColorChooser } from './skills/colorChooser';
import { AiTargetChooser, prototypeChosenTargetMode } from './skills/targetChooser';
import type { TargetChooser } from './skills/targetChooser';
import { candidatesFor, sideOf } from './skills/targeting';
import { AiBranchChooser, skillChoices, selectSkillBranch } from './skills/branchChooser';
import type { BranchChooser } from './skills/branchChooser';
import { AiCellChooser, prototypeNeedsCell } from './skills/cellChooser';
import { choiceRuleOf } from './skills/gowChoiceRules';
import type { CellChooser } from './skills/cellChooser';
import { MatchState, PlayerSide, BaseColor, opponentOf, colorGem, specialGem, posKey, SPECIAL_MATCH_COLOR, WEB_GEM_TURNS,
  MATCH_STATUS_GEMS, DESTROY_STATUS_GEMS, STATUS_GEM_EFFECTS, isStatusGemKind, BOOTY_GEM_GOLD,
  MANA_BONUS_GIANT, SPIRIT_GEM_DRAIN, MANA_POTION_GEM_RANGE, CANDY_GEM_MANA, TRAP_GEM_OPTIONS,
  ANGEL_GEM_TURNS, LYCANTHROPY_GEM_TURNS, GARGOYLE_GEM_TURNS,
  GARGOYLE_POSITIVE_STATUS_POOL, GARGOYLE_NEGATIVE_STATUS_POOL } from './types';
import type { SkullStormDropKind, StatusGemKind, StatusInstance, SpecialGemKind, SpecialGemSpec,
  StormSummon, TraitEconomyGain } from './types';

/**
 * 被炸毁骷髅的法术伤害表（官方口径，区别于三消骷髅的攻击力结算）：
 * 普通骷髅 1 / 末日骷髅 5 / 至尊末日骷髅 10。
 * 查证来源：TrueTrophies 官方攻略（Heroic Gems 节）+ Steam 社区专家帖复核。
 */
const EXPLODED_SKULL_DAMAGE = { normal: 1, doom: 5, uber: 10 } as const;
import type { ActionLogEntry, BattleAction, CellPos, GemType, Character, Team } from './types';
import type { GameState } from './GameState';
import { resolveDefeatEvents, MAX_ACTIVE_TEAM_SIZE, allocateCharId, pruneDefeated } from './teamRoster';
import { resolveDefeatAfterRevive } from './skills/effects/summon';
import {
  applyBattleStartTraits,
  grantStat,
  collectBattleStartStorms,
  applyBigMatchTriggers,
  applyCastTriggers,
  applyCastRandomStatusTriggers,
  applyColorMatchTriggers,
  applyDeathSummons,
  applyDeathTriggers, applySelfDeathManaGift,
  applyEnemyDeathTriggers,
  applyPositionAuras,
  applyTurnStartPassives,
  attachPassives,
  getTrait,
  passivesOf,
  activeTraitIds,
} from './traits';
import type { DeathSummonSpec } from './traits';
import { turnStartDue } from './battleRules';
import type { EngineBattleRules, RuleEndReason } from './battleRules';
import type {
  GameEvent,
  EliminationEvent,
  GemTransformEvent,
  GemClearEvent,
  StormChangeEvent,
} from './events';

/**
 * 回合解析引擎（需求 7, 8, 9, 17, 18）。
 * 接收一个交换请求，同步完成全部连锁解析，产出完整事件流。
 * 纯逻辑：输入相同则输出相同（需求 17.3）。
 */
export class TurnEngine {
  private resolver = new MatchResolver();
  private gravity: GravitySystem;
  private mana = new ManaDistributor();
  private combat = new CombatResolver();

  /** 补充时生成骷髅的概率；战斗模式 > 0，纯三消模式 = 0 */
  skullChance = 0;

  /** Host-injected natural skull variants, shared by every gravity/refill path. */
  get skullDropMix(): SkullDropMix | undefined { return this.gravity.skullDropMix; }
  set skullDropMix(value: SkullDropMix | undefined) { this.gravity.skullDropMix = value; }

  /**
   * 补充的「连消倾向」强度（GravitySystem.apply 的 comboBias，机制见 comboBias.ts）：> 0 时
   * 补充更常留下 4/5 连机会与连锁，额外回合连段中自动收敛。默认 0 = 关闭（既有对局随机数
   * 序列逐字节不变）；与 skullChance 同款公开字段注入，App 实战设为 BATTLE_COMBO_BIAS。
   */
  comboBias = 0;

  /**
   * 玩家方旗帜加成（GoW 王国旗帜语义，meta M6 宿主注入；形如 `{ Red: 2, Brown: -1 }`）。
   * 玩家侧（Left）匹配对应色宝石时按**每次匹配事件**平展 ±N 法力、向下保底 0；
   * null = 无旗帜，`distributeGemMana` 走原路径（既有对局事件流逐字节不变）。
   * 与 skullChance 同款公开字段注入模式：构造函数签名不动，宿主构造后赋值。
   */
  bannerBoosts: Partial<Record<BaseColor, number>> | null = null;
  /** 法力涌动新增掷骰的独立随机流（见构造函数） */
  private readonly surgeRng: SeededRNG;
  enemyBannerBoosts: Partial<Record<BaseColor, number>> | null = null;

  /**
   * 双方法力精通（宿主注入；省略 = 0）。3 消按 chance = m/(m+100) 翻倍，4 消永不，
   * 5 消及以上必翻倍。精通为 0 时不掷随机，既有 3 消事件流逐字节不变。
   */
  playerManaMastery: Partial<Record<BaseColor, number>> | null = null;
  enemyManaMastery: Partial<Record<BaseColor, number>> | null = null;

  private nextGemId: () => number;
  /** 选色器（需求 2）：技能含 'CHOSEN' 时用它选色；默认 AI 策略 */
  private colorChooser: ColorChooser = new AiColorChooser();
  /** 目标选择器：技能含手动选目标段时用它选目标；默认 AI 策略 */
  private targetChooser: TargetChooser = new AiTargetChooser();
  /** 选格器：技能含"点选一枚宝石"的段（引爆某格 / 摧毁其所在行列）时用它；默认 AI 策略 */
  private cellChooser: CellChooser = new AiCellChooser();
  /** Active while a spell prototype executes: pure board rewrites defer their settle to the spell end. */
  private spellBoardSettle: { pending: boolean } | null = null;
  private branchChooser: BranchChooser = new AiBranchChooser();
  /** 召唤物 referenceName → 属性模板 解析器（需求 7）；默认无（ref/randomOf 来源将安全跳过） */
  private summonResolver: ((referenceName: string) => SummonTemplate | null) | null = null;
  private beastPool: readonly string[] = [];
  /** 行动开始时的「角色 id → 所属方」快照，供阵亡响应在角色离场后仍能判定归属 */
  private readonly rosterSideAtActionStart = new Map<number, PlayerSide>();
  /** 行动开始时的角色引用快照：阵亡者被移出编队后，死亡召唤仍需读它编译过的被动 */
  private readonly rosterCharAtActionStart = new Map<number, Character>();
  /** 构造阶段产生的开局事件，交给 BattleSession 记录并由表现层首屏消费。 */
  private readonly initialEvents: GameEvent[] = [];
  /**
   * 玩家侧（Left）战后经济加成比率合计（merchant/necromancy 族特质，DECISIONS 四项拍板①）。
   * 构造期从开局编队的编译被动汇总一次（阵亡移出编队后读不到，快照保住全场效力）；
   * GameOver 时对共用经济池 gold/souls 一次性乘 (1 + Σratio)。敌方（Right）比率不计入：
   * GoW 的战斗奖励归玩家，共用池只按玩家侧特质放大。
   */
  private readonly economyGainRatios: { gold: number; souls: number };
  /**
   * 宝石灵力抑制快照（战斗机制批 jinx「将敌人的宝石灵力减半」）：对某方生效的宝石法力
   * 倍率 = 其敌方队伍存活持有人中最强的 enemyMasteryMult（min）。官方 Activation=
   * start_battle 是对玩家 Gem Masteries 的一次性修正——开局生效、全场持续（持有者
   * 阵亡不解除），与 economyGainRatios 同款的构造期快照口径。
   */
  private readonly masterySuppress: Readonly<Record<PlayerSide, number>>;
  /** 位次光环已补授的角色 id（战斗机制批 leader 族，applyPositionAuras 防重复授出） */
  private readonly positionAuraGranted = new Set<number>();
  /**
   * PvP 模式旗（职业天赋 exemplar/bloodandglory 族）：由宿主（App 从 BattleRequest.mode）
   * 构造后、首次 takeInitialEvents 前注入。true 时一次性应用持有者的 pvpBonuses
   *（battle=自身；attack=左方进攻队，defense=右方防守队）。
   */
  pvpMode = false;
  private pvpApplied = false;
  /**
   * 战斗规则（活动深化批，见 battleRules.ts）：宿主构造后、首次 takeInitialEvents 前经
   * applyRules 注入。null = 无规则，所有规则分支零事件、零随机消耗。
   */
  private rules: EngineBattleRules | null = null;
  /** 规则击杀目标的角色引用（阵亡移出编队后仍可判定 defeated / fled） */
  private ruleTargets: Character[] = [];
  /** 开局（我方第 1 回合）的规则回合开始项已结算 */
  private ruleOpeningApplied = false;
  /**
   * 条件经济光环入账口（条件经济批，注入 traits 触发器 ctx/opts.gainEconomy）：
   * 黄金按阵营入账，灵魂/宝石保持既有奖励模型，发既有
   * economy-gain 事件（不新增事件类型）；side 记录获得发生时的行动方。
   */
  private readonly creditEconomy = (currency: keyof TraitEconomyGain, amount: number, side = this.state.activePlayer): GameEvent[] => {
    if (currency === 'gold') creditGoldForSide(this.state, side, amount);
    else this.state.economy[currency] += amount;
    return [{ type: 'economy-gain', currency, amount, side }];
  };

  /**
   * 特质技能伤害口（T5 大连伤害批 shock/tentacles/lightningbolt，注入 ctx.damage）：
   * damageOne 全管线（妖火/法术减伤/屏障/护甲/阵亡同技能伤害口径），defeat 事件统一经
   * resolveDefeatEvents 出编队（与骷髅命中同口径）。
   */
  private readonly traitDamage = (target: Character, caster: Character, amount: number): GameEvent[] =>
    this.resolveDefeatWithRevive(damageOne(target, caster.id, amount, false, 'single', undefined, caster,
      sideOf(this.state, target.id) !== sideOf(this.state, caster.id)));

  /** Trait Steal Life bypasses Armor and grows Life by the target's actual Life loss. */
  private readonly traitDrainLife = (target: Character, holder: Character, amount: number): GameEvent[] => {
    const before = target.hp;
    // Capture loss before revival can change HP; normal trait damage must still hit Armor.
    const hit = damageOne(target, holder.id, amount, true, 'single', undefined, holder,
      sideOf(this.state, target.id) !== sideOf(this.state, holder.id));
    const stolen = hit.some(e => e.type === 'skill-damage') ? Math.max(0, before - target.hp) : 0;
    const produced = this.resolveDefeatWithRevive(hit);
    if (stolen <= 0 || holder.defeated) return produced;
    const gained = applyBuffGain(holder, 'hp', stolen, 'gain');
    if (gained > 0) produced.push({ type: 'buff', source: 'trait', targetId: holder.id,
      stat: 'hp', amount: gained, maxHpGain: gained });
    return produced;
  };

  /**
   * 特质兵种召唤口（T5 杂项批 genieslamp/stormflock「配对 4+ 有 N% 的几率召唤一名X」，
   * 注入 traits 的 ctx.summon）：复用死亡召唤基建 applyDeathSummons 的模板装配与入队
   * （容量/FIFO）规则，召唤物归持有者一方（匹配方 = 当前行动方）。概率已在 traits 层
   * 判定过（恰好掷一次），这里置 chance=1 走确定性入队，避免二次掷签平方概率。
   */
  private readonly traitSummon = (spec: {
    chance: number; troopId: number; referenceName: string; displayName: string;
  }, side: PlayerSide = this.state.activePlayer): GameEvent[] =>
    applyDeathSummons([{ spec: { ...spec, chance: 1 }, side }], {
      nextCharId: () => this.nextCharId(),
      rng: this.rng,
      enqueue: (summoned, troopId, side) => this.enqueueSummon(summoned, troopId, side),
    });

  /**
   * 特质风暴设置口（T5 杂项批 deadlywaters「配对时创造骸骨风暴」，注入 traits 的
   * ctx.setStorm）：风暴归持有者一方（匹配方 = 当前行动方），走 setTraitStorm 的
   * 全局唯一顶替裁定（与技能造风暴同一 storm-change 事件形态）。
   */
  private readonly traitSetStorm = (storm: StormSummon, troopId: number): GameEvent[] =>
    this.setTraitStorm(storm, troopId, this.state.activePlayer);

  /**
   * 即杀口（T5 杂项批 deathbelow「猎杀最后一名敌人」，注入 traits 的 ctx.kill）：
   * hp 归零 + defeat 事件经 resolveDefeatEvents 出编队（召唤队列顶替照常），与骷髅击杀
   * 同口径；已阵亡目标幂等返回空。
   */
  private readonly traitKill = (target: Character): GameEvent[] => {
    if (target.defeated) return [];
    if (hasLethalImmunity(target)) return [lethalResistanceEvent(target)];
    target.hp = 0;
    target.defeated = true;
    return resolveDefeatEvents(this.state, [{ type: 'defeat', characterId: target.id }]);
  };

  /**
   * 特质吞噬口（R22 吞噬批 voracious/consumefuel/bloodyfeast）：复用技能吞噬原语
   * devourEffect（即杀走 damageOne 伤害管线 + 目标当前攻击、护甲与生命（不含魔法）；吞噬免疫在原语口
   * 整体跳过——不杀、不成长、不耗 rng；概率在原语内部经同一条种子化 rng 掷签），defeat
   * 事件统一经 resolveDefeatEvents 出编队（召唤队列顶替照常，与 traitDamage 同口径）。
   * 目标列表由调用方解析（命中侧=受击目标 / 受击侧=攻击者 / 敌亡侧=随机存活）；
   * 无新键特质不会被调到，零事件、零随机消耗护栏不破坏。
   */
  private readonly traitDevour = (caster: Character, targets: Character[], chance: number): GameEvent[] => {
    const produced = devourEffect({ targets, chance }).apply({
      state: this.state,
      casterId: caster.id,
      rng: this.rng,
      nextGemId: this.nextGemId,
    });
    return resolveDefeatEvents(this.state, produced);
  };

  /**
   * 出编队统一口（自复活/凤凰涅槃批）：先过自复活拦截再走 resolveDefeatEvents——阵亡者
   * 持有 selfRevive 被动（或本次施法带 selfRevive 段，经 prototypes 层同一函数处理）时，
   * 掷中即不走 defeat 路径（defeat 事件剔除、死亡扫描不触发、原位回血复活发 buff 事件）。
   * 无 selfRevive 角色时事件流与 resolveDefeatEvents 逐字节一致、零 rng 消耗（护栏不破坏）。
   */
  private resolveDefeatWithRevive(produced: GameEvent[]): GameEvent[] {
    return resolveDefeatAfterRevive(this.state, produced, this.rng);
  }

  /**
   * 骷髅命中/受击的吞噬触发（R22 吞噬批 voracious「在造成骷髅头伤害时有 5% 的几率吞噬
   * 敌人」+ consumefuel「头骨受到伤害时有 10% 的几率吞噬第一个敌人」）：从骷髅结算事件取
   * 首条 skull-damage（主结算事件——闪避/屏障/挣扎落空不产事件、天然不触发；后续的反弹
   * 事件不算「攻击命中」），命中侧=攻击者吞受击目标、受击侧=受击者吞攻击者（攻击者已亡、
   * 目标已亡或吞噬免疫由原语/存活检查跳过）。无新键特质不进此路径，零消耗。
   */
  private applySkullDevourTriggers(produced: GameEvent[]): GameEvent[] {
    const events: GameEvent[] = [];
    const hit = produced.find(
      (e): e is GameEvent & { type: 'skull-damage'; attackerId: number; targetId: number } =>
        e.type === 'skull-damage',
    );
    if (!hit) return events;
    const attacker = this.state.teams[PlayerSide.Left].characters.find((c) => c.id === hit.attackerId)
      ?? this.state.teams[PlayerSide.Right].characters.find((c) => c.id === hit.attackerId);
    const target = this.state.teams[PlayerSide.Left].characters.find((c) => c.id === hit.targetId)
      ?? this.state.teams[PlayerSide.Right].characters.find((c) => c.id === hit.targetId);
    if (!attacker || attacker.defeated || !target || target.defeated) return events;
    // 命中侧（voracious）：攻击者吞噬本次受击目标
    const hitSpec = passivesOf(attacker).onSkullHitDevour;
    if (hitSpec) events.push(...this.traitDevour(attacker, [target], hitSpec.chance));
    // 受击侧（consumefuel）：受击者吞噬攻击者——攻击者已被命中侧吞掉则不再触发
    if (!target.defeated && !attacker.defeated) {
      const damagedSpec = passivesOf(target).onSkullDamagedDevour;
      if (damagedSpec) events.push(...this.traitDevour(target, [attacker], damagedSpec.chance));
    }
    return events;
  }

  constructor(
    private state: GameState,
    private rng: SeededRNG,
    nextGemId: () => number,
    private registry: ExtensionRegistry = new ExtensionRegistry(),
  ) {
    this.nextGemId = nextGemId;
    // 法力涌动新规则（4 消保底 / 连锁加成）的掷骰走独立分支流：只读主流状态派生，不消耗主流，
    // 其余随机结果（技能目标、补充宝石、闪避…）与旧规则逐次一致。
    this.surgeRng = new SeededRNG((rng.getState() ^ 0x6a09e667) >>> 0);
    this.gravity = new GravitySystem(rng, nextGemId);
    // 特质在战斗开始时编译一次：之后骷髅/技能/状态结算只读 Character.passive，
    // 不必把注册表传进那些纯函数（见 src/engine/traits.ts 的设计说明）。
    const all = [
      ...state.teams[PlayerSide.Left].characters,
      ...state.teams[PlayerSide.Right].characters,
    ];
    for (const char of all) attachPassives(char);
    // 战后经济加成快照（玩家侧开局编队）：GameOver 时放大共用经济池。
    const gainRatios = { gold: 0, souls: 0 };
    for (const char of state.teams[PlayerSide.Left].characters) {
      const g = char.passive?.battleEconomyGain;
      if (g) {
        gainRatios.gold += g.gold;
        gainRatios.souls += g.souls;
      }
    }
    this.economyGainRatios = gainRatios;
    // 宝石灵力抑制快照（jinx）：对 Left 生效 = Right 队持有人的最强 enemyMasteryMult，反之亦然。
    const masteryMultOf = (side: PlayerSide): number => {
      let mult = 1;
      for (const foe of state.teams[side].characters) {
        const m = foe.passive?.enemyMasteryMult;
        if (m !== undefined && m < mult) mult = m;
      }
      return mult;
    };
    this.masterySuppress = {
      [PlayerSide.Left]: masteryMultOf(PlayerSide.Right),
      [PlayerSide.Right]: masteryMultOf(PlayerSide.Left),
    };
    // 战斗开始的一次性特质（全体光环、按颜色计数光环、开局法力）。
    // 事件流此时还没开始，交由表现层首次刷新卡面时读取。
    applyBattleStartTraits(
      state.teams[PlayerSide.Left].characters,
      state.teams[PlayerSide.Right].characters,
      undefined,
      this.rng,
    );
    // 位次条件光环（leader 族）：战斗开始时各队首位/末位补授（与开局光环同口径静默）。
    applyPositionAuras(
      [state.teams[PlayerSide.Left].characters, state.teams[PlayerSide.Right].characters],
      this.positionAuraGranted,
    );
    // 开局风暴与死亡召唤共享同一套全局唯一/后者顶替前者裁定。
    const startupStorms = [
      ...collectBattleStartStorms(state.teams[PlayerSide.Left].characters, PlayerSide.Left),
      ...collectBattleStartStorms(state.teams[PlayerSide.Right].characters, PlayerSide.Right),
    ];
    for (const { spec, side } of startupStorms) {
      this.initialEvents.push(...this.setStormFromSummon(spec, side));
    }
    // 开局爆破（omenof* 族「在战斗开始的时候爆破一颗X宝石/骷髅头」）：棋盘已生成、
    // 事件流未开始，事件交由 takeInitialEvents 供表现层首屏消费。
    this.initialEvents.push(...this.applyBattleStartDestroyTraits());
    // 开局施加状态（职业天赋族：vanguard 自身屏障 / roottrap 缠绕首敌 / snapfreeze 冻结
    // 随机敌 / swiftcurse 死亡标记随机敌 / serendipity 随机盟友随机正面状态）：棋盘已生成、
    // 事件流未开始，事件交由 takeInitialEvents。随机目标与 randomPositive 走构造期同一条
    // 种子化 rng；施加经 applyStatus（免疫在施加口拦截）。
    this.initialEvents.push(...this.applyBattleStartStatusTraits());
    // 开局按概率转换宝石（特质收尾批 wintercourtsboon/summercourtsboon 冬/夏之宫廷恩赐
    // 「战斗开始时 35% 把 3 颗蓝/绿宝石转换为冻结/妖火宝石」）：棋盘已生成、事件流未开始，
    // 定义直读（同 omenof* 口径），转换后立即连锁。
    this.initialEvents.push(...this.applyBattleStartConvertTraits());
  }

  /**
   * 注入战斗规则（活动深化批）。须在首次 takeInitialEvents 之前调用；开局棋盘预置
   * （preset）不在这里——它要在 createGameState 之前改写生成棋盘（applyBoardPreset）。
   */
  applyRules(rules: EngineBattleRules | null | undefined): void {
    if (!rules) return;
    this.rules = rules;
    if (rules.skullChance !== undefined) this.skullChance = rules.skullChance;
    if (rules.specialDrops && rules.specialDrops.chance > 0 && rules.specialDrops.pool.length > 0) {
      this.gravity.specialSpawnChance = rules.specialDrops.chance;
      this.gravity.specialPool = rules.specialDrops.pool;
    }
    const all = [...this.state.teams[PlayerSide.Left].characters, ...this.state.teams[PlayerSide.Right].characters];
    this.ruleTargets = (rules.killTargets ?? [])
      .map((id) => all.find((c) => c.id === id))
      .filter((c): c is Character => !!c);
    this.state.turnCount ??= { [PlayerSide.Left]: 0, [PlayerSide.Right]: 0 };
  }

  /** 当前生效的规则（表现层读 HUD：回合上限/击杀目标） */
  getRules(): Readonly<EngineBattleRules> | null {
    return this.rules;
  }

  /** 补充掉落色权重：风暴权重 × 规则基色权重。无规则权重时与 stormDropWeights 完全一致。 */
  private dropWeights(): Map<BaseColor, number> | undefined {
    const storm = this.stormDropWeights();
    const extra = this.rules?.colorWeights;
    if (!extra || Object.keys(extra).length === 0) return storm;
    const out = new Map<BaseColor, number>(storm ?? []);
    for (const [color, w] of Object.entries(extra) as [BaseColor, number][]) {
      out.set(color, (out.get(color) ?? 1) * Math.max(0, w));
    }
    return out;
  }

  /**
   * 规则回合开始项（补法力 / 创造宝石），对即将行动方结算。
   * @returns 是否改动过棋盘（调用方据此补胜负判定）
   */
  private applyRuleTurnStart(side: PlayerSide, turnNumber: number, events: GameEvent[]): boolean {
    const entries = this.rules?.turnStart;
    if (!entries || entries.length === 0) return false;
    let boardChanged = false;
    for (const entry of entries) {
      if (entry.side !== side || !turnStartDue(entry, turnNumber)) continue;
      if (entry.mana && entry.mana.amount !== 0) {
        const { amount, targets, colors } = entry.mana;
        for (const char of this.state.teams[side].characters) {
          if (char.defeated) continue;
          if (targets && !targets.includes(char.id)) continue;
          if (colors && !char.colors.some((c) => colors.includes(c))) continue;
          if (amount > 0 && !canGainMana(char)) continue;
          const actual = grantStat(char, 'mana', amount);
          if (actual !== 0) events.push({ type: 'buff', source: 'trait', targetId: char.id, stat: 'mana', amount: actual });
        }
      }
      for (const spec of entry.createGems ?? []) {
        if (spec.chance !== undefined && spec.chance < 1 && this.rng.next() >= spec.chance) continue;
        const made = this.spawnSpecialGems(spec.gem.kind, spec.gem.tier, spec.count, undefined, spec.gem.color);
        if (made.length > 0) { events.push(...made); boardChanged = true; }
      }
    }
    if (boardChanged) this.runCascades(events);
    return boardChanged;
  }

  /** 规则击杀目标是否全部阵亡（逃跑不算） */
  private ruleObjectiveMet(): boolean {
    return this.ruleTargets.length > 0 && this.ruleTargets.every((c) => c.defeated && !c.fled);
  }

  /** 判出胜负的统一收尾：首次判定时放大经济池、发 game-over */
  private declareWinner(winner: PlayerSide, events: GameEvent[], reason?: RuleEndReason): void {
    if (this.state.winner === null) {
      const { gold, souls } = this.economyGainRatios;
      if (gold > 0) this.state.economy.gold = Math.floor(this.state.economy.gold * (1 + gold));
      if (souls > 0) this.state.economy.souls = Math.floor(this.state.economy.souls * (1 + souls));
      // PvP 荣耀映射（职业天赋 bloodandglory「PvP 战斗中获得 1 点荣耀」）：本作无
      // 荣耀币种，设计值映射为黄金按持有者入账（官方单场荣耀个位数，量级一致）。
      if (this.pvpMode) {
        for (const char of this.state.teams[PlayerSide.Left].characters) {
          if (char.defeated) continue;
          const gain = passivesOf(char).pvpEconomyGain;
          if (gain && gain.amount > 0) this.creditEconomy(gain.currency, gain.amount);
        }
      }
    }
    this.state.state = MatchState.GameOver;
    this.state.winner = winner;
    events.push(reason ? { type: 'game-over', winner, reason } : { type: 'game-over', winner });
  }

  /** 取出构造阶段的开局事件；只消费一次。 */
  takeInitialEvents(): GameEvent[] {
    // 规则回合开始项的「我方第 1 回合」：开局没有换手，在首屏事件里结算一次
    if (this.rules && !this.ruleOpeningApplied) {
      this.ruleOpeningApplied = true;
      this.applyRuleTurnStart(this.state.activePlayer, 1, this.initialEvents);
    }
    if (this.pvpMode && !this.pvpApplied) {
      this.pvpApplied = true;
      // Left attacks; Right defends. Battle bonuses affect the holder on either
      // side; attack/defense bonuses affect that holder's own matching-role team.
      for (const side of [PlayerSide.Left, PlayerSide.Right]) {
        const team = this.state.teams[side].characters;
        for (const char of team) {
          if (char.defeated) continue;
          for (const bonus of passivesOf(char).pvpBonuses) {
            if (bonus.phase === 'attack' && side !== PlayerSide.Left) continue;
            if (bonus.phase === 'defense' && side !== PlayerSide.Right) continue;
            const targets = bonus.phase === 'battle' ? [char] : team;
            for (const target of targets) {
              if (target.defeated) continue;
              for (const stat of ['hp', 'armor', 'attack', 'magic'] as const) {
                const amount = bonus.gains[stat] ?? 0;
                if (amount > 0) grantStat(target, stat, amount);
              }
            }
          }
        }
      }
    }
    return this.initialEvents.splice(0, this.initialEvents.length);
  }

  /**
   * 开局爆破（omenof* 族「在战斗开始的时候爆破一颗X宝石/骷髅头」）。
   *
   * 双方存活队伍按序收集 battleStartDestroy（Left 全队 → Right 全队 → 队伍序 → 特质
   * 声明序，确定性），命中格从棋盘移除后走既有 resolveBoardChange 清除管线——法力/
   * 骷髅伤害结算、重力补充、连锁照常；直接结算经 side 显式传参归**持有者一方**
   * （与官方「该特质爆破的宝石为其队伍充能」一致），连锁归当前行动方（开局恒为 Left）。
   * 候选唯一时不掷骰；无候选安全跳过——无新键特质零事件、零随机消耗（既有对局
   * 与 rng 终态逐字节不变）。
   */
  private applyBattleStartDestroyTraits(): GameEvent[] {
    const events: GameEvent[] = [];
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      for (const char of this.state.teams[side].characters) {
        if (char.defeated) continue;
        for (const code of activeTraitIds(char)) {
          const spec = getTrait(code)?.battleStartDestroy;
          if (!spec) continue;
          const candidates: CellPos[] = [];
          for (let row = 0; row < BoardModel.ROWS; row++) {
            for (let col = 0; col < BoardModel.COLS; col++) {
              const gem = this.state.board.get({ row, col });
              if (!gem) continue;
              const hit = spec.kind === 'skull'
                ? gem.type.kind === 'skull'
                : gem.type.kind === 'color' && gem.type.color === spec.color;
              if (hit) candidates.push({ row, col });
            }
          }
          if (candidates.length === 0) continue;
          const pos = candidates.length === 1
            ? candidates[0]
            : candidates[this.rng.nextInt(candidates.length)];
          const gem = this.state.board.get(pos)!;
          events.push({ type: 'gem-explode', cells: [{ pos, gemId: gem.id, gemType: gem.type }] });
          this.state.board.set(pos, null);
          this.resolveBoardChange([{ gemType: gem.type, pos }], events, side, 'explode');
        }
      }
    }
    return events;
  }

  /**
   * 开局施加状态（职业天赋 battleStartStatus 族，定义直读同 omenof* 口径）：
   * 双方存活队伍按序收集（Left 全队 → Right 全队 → 队伍序 → 特质声明序，确定性）。
   * target=self 持有者自身 / randomAlly 同队随机存活 / randomEnemy 敌方随机存活 /
   * firstEnemy 敌方队伍序首个存活；randomPositive（serendipity）从正面状态池经 rng
   * 掷一条、忽略 statuses 列表。候选唯一不掷骰；施加经 applyStatus（免疫在施加口拦截）。
   * 双方都持有同类开局状态时按上述顺序结算（先 Left 后 Right）。
   */
  private applyBattleStartStatusTraits(): GameEvent[] {
    const events: GameEvent[] = [];
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      const own = this.state.teams[side].characters;
      const foes = this.state.teams[opponentOf(side)].characters;
      for (const char of own) {
        if (char.defeated) continue;
        for (const code of activeTraitIds(char)) {
          const spec = getTrait(code)?.battleStartStatus;
          if (!spec) continue;
          const statuses: readonly { id: string; magnitude?: number }[] = spec.randomPositive
            ? [{ id: RANDOM_POSITIVE_STATUS_POOL[this.rng.nextInt(RANDOM_POSITIVE_STATUS_POOL.length)]! }]
            : spec.statuses;
          let target: Character | undefined;
          if (spec.target === 'self') {
            target = char;
          } else if (spec.target === 'firstEnemy') {
            target = foes.find((c) => !c.defeated);
          } else {
            const pool = (spec.target === 'randomAlly' ? own : foes).filter((c) => !c.defeated);
            target = pool.length === 0 ? undefined : pool[this.rng.nextInt(pool.length)];
          }
          if (!target) continue;
          for (const st of statuses) {
            const status: StatusInstance = { id: st.id, turns: spec.turns };
            if (st.magnitude !== undefined) status.magnitude = st.magnitude;
            events.push(...applyStatus(target, status));
          }
        }
      }
    }
    return events;
  }

  /**
   * 开局按概率把 N 颗某色宝石转换为特殊宝石（特质收尾批 battleStartConvertGems：
   * wintercourtsboon 冬之宫廷恩赐 / summercourtsboon 夏之宫廷恩赐）。双方存活队伍按序
   * 收集（Left 全队 → Right 全队 → 队伍序 → 特质声明序，确定性）；目标格复用
   * randomCellOfColor（每颗各耗一次种子化 rng，与 turnStartColorToSpecial 同口径），
   * 转换完统一发 gem-transform 事件并立即 runCascades；无候选安全跳过——无此特质的
   * 对局零事件、零随机消耗（构造期 rng 消耗只在持有者掷中概率后发生）。
   */
  private applyBattleStartConvertTraits(): GameEvent[] {
    const events: GameEvent[] = [];
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      for (const char of this.state.teams[side].characters) {
        if (char.defeated) continue;
        for (const code of activeTraitIds(char)) {
          const spec = getTrait(code)?.battleStartConvertGems;
          if (!spec) continue;
          if (this.rng.next() >= spec.chance) continue;
          const changes: GemTransformEvent['changes'] = [];
          for (let i = 0; i < spec.count; i++) {
            const pos = this.randomCellOfColor(spec.color);
            const from = pos ? this.state.board.get(pos) : null;
            if (!pos || !from) continue;
            const to = specialGem(spec.gem, spec.tier);
            const gemId = from.id;
            this.state.board.set(pos, { id: gemId, type: to });
            changes.push({ pos, gemId, from: from.type, to });
          }
          if (changes.length === 0) continue;
          events.push({ type: 'gem-transform', changes });
          this.runCascades(events);
        }
      }
    }
    return events;
  }

  /**
   * kind 感知宝石爆破（特质收尾批：'random' 任意宝石 / 'skull' 普通骷髅头 / 特殊宝石
   * kind，tier 为善神石像鬼等分层宝石的层号）。落子口径与 explodeGemsOfColor 完全一致
   * （命中格移除后走 resolveBoardChange，side 归结算方；候选唯一不掷骰、多候选每颗耗
   * 一次 rng、无候选安全跳过）。
   */
  private explodeGemsBySpec(
    spec: { kind: 'random' | 'skull' | SpecialGemKind; tier?: number; color?: string; count: number },
    side: PlayerSide,
  ): GameEvent[] {
    const events: GameEvent[] = [];
    for (let i = 0; i < spec.count; i++) {
      const candidates: CellPos[] = [];
      for (let row = 0; row < BoardModel.ROWS; row++) {
        for (let col = 0; col < BoardModel.COLS; col++) {
          const gem = this.state.board.get({ row, col });
          if (!gem) continue;
          if (spec.kind === 'random') candidates.push({ row, col });
          else if (spec.kind === 'skull') {
            if (gem.type.kind === 'skull') candidates.push({ row, col });
          } else if (gem.type.kind === 'special' && gem.type.spec.kind === spec.kind) {
            if (spec.tier === undefined || gem.type.spec.tier === spec.tier) candidates.push({ row, col });
          }
        }
      }
      if (candidates.length === 0) break;
      const pos = candidates.length === 1 ? candidates[0] : candidates[this.rng.nextInt(candidates.length)];
      const gem = this.state.board.get(pos)!;
      events.push({ type: 'gem-explode', cells: [{ pos, gemId: gem.id, gemType: gem.type }] });
      this.state.board.set(pos, null);
      this.resolveBoardChange([{ gemType: gem.type, pos }], events, side, 'explode');
    }
    return events;
  }

  /**
   * 爆破关联色宝石（职业天赋 lightningstrike「配对时爆破一颗黄色宝石」，注入大匹配
   * ctx.explodeGem）：候选格从棋盘移除后走 resolveBoardChange——法力/骷髅结算归当前
   * 行动方（持有者一方）、重力连锁照常。候选唯一不掷骰、多候选每颗耗一次 rng、
   * 无候选安全跳过（与开局爆破 omenof* 同口径）。
   */
  private explodeGemsOfColor(color: string, count: number): GameEvent[] {
    const events: GameEvent[] = [];
    for (let i = 0; i < count; i++) {
      const candidates: CellPos[] = [];
      for (let row = 0; row < BoardModel.ROWS; row++) {
        for (let col = 0; col < BoardModel.COLS; col++) {
          const gem = this.state.board.get({ row, col });
          if (!gem) continue;
          if (gem.type.kind === 'color' && gem.type.color === color) candidates.push({ row, col });
        }
      }
      if (candidates.length === 0) break;
      const pos = candidates.length === 1 ? candidates[0] : candidates[this.rng.nextInt(candidates.length)];
      const gem = this.state.board.get(pos)!;
      events.push({ type: 'gem-explode', cells: [{ pos, gemId: gem.id, gemType: gem.type }] });
      this.state.board.set(pos, null);
      this.resolveBoardChange([{ gemType: gem.type, pos }], events, this.state.activePlayer, 'explode');
    }
    return events;
  }

  /**
   * 行动内召唤事件的后置触发（特质收尾批：callnature 召唤自然「当一名盟友召唤部队时，
   * 召唤一场叶风暴」/ summoningritual 召唤仪式「当一名盟友被召唤后，获得 8 点魔力值」）。
   * 扫描本次行动产出的 summon 事件，按事件 player 归属触发该方存活持有者（事件序 ×
   * 队伍序确定性）；风暴经 traitSetStorm 全局唯一顶替裁定（虚拟风暴号段由特质表提供）；
   * colors 为官方 BoostColors 惰性建模，引擎契约取 colors[0]（与 turnStartStorm 同口径）。
   * 定义直读；无新键特质零事件零随机消耗。
   */
  private applyActionSummonTriggers(events: GameEvent[]): void {
    const summonEvents = events.filter((e) => e.type === 'summon') as (GameEvent & { type: 'summon'; player: PlayerSide })[];
    if (summonEvents.length === 0) return;
    for (const ev of summonEvents) {
      for (const holder of this.state.teams[ev.player].characters) {
        if (holder.defeated) continue;
        for (const code of activeTraitIds(holder)) {
          const def = getTrait(code);
          if (!def) continue;
          if (def.onAllySummonStorm) {
            const spec = def.onAllySummonStorm;
            const storm: StormSummon = { color: spec.colors[0]!, turns: 8 };
            if (spec.dropKind) storm.dropKind = spec.dropKind;
            events.push(...this.traitSetStorm(storm, spec.troopId));
          }
          if (def.onAllySummonGain) {
            const actual = grantStat(holder, def.onAllySummonGain.stat, def.onAllySummonGain.amount);
            if (actual !== 0) events.push({ type: 'buff', source: 'trait', targetId: holder.id, stat: def.onAllySummonGain.stat, amount: actual });
          }
        }
      }
    }
  }

  /**
   * 承受骷髅伤害的召唤/经济钩子（职业天赋 golemprotector「当我受到伤害时有 20% 几率召唤」
   * + 缺口清扫批 pickpocket 惰性经济）：从骷髅结算事件取实际受击目标（skull-damage 事件
   * 只在实际扣血时产出——闪避/屏障落空天然不触发，与 gainOnDamaged 同口径），每次受击
   * 各自掷签。召唤物归受击者一方（非当前行动方，side 显式传入）。
   */
  private applyDamagedTriggersFromEvents(produced: GameEvent[]): GameEvent[] {
    const events: GameEvent[] = [];
    const damagedIds = [
      ...new Set(
        produced
          .filter((e): e is GameEvent & { type: 'skull-damage'; targetId: number } => e.type === 'skull-damage')
          .map((e) => e.targetId),
      ),
    ];
    // 造成骷髅伤害爆破（特质收尾批 cataclysm 天崩地裂「当自身造成骷髅头伤害时，爆破 2 颗
    // 随机宝石」）：从同一批 skull-damage 事件取攻击者（attackerId，实扣才产事件），每次
    // 造成伤害各自爆破、结算归攻击者一方（与受击侧的 side 取法对称）。
    const attackerIds = [
      ...new Set(
        produced
          .filter((e): e is GameEvent & { type: 'skull-damage'; attackerId: number } => e.type === 'skull-damage')
          .map((e) => e.attackerId),
      ),
    ];
    for (const id of attackerIds) {
      let holder: Character | undefined;
      let side: PlayerSide | null = null;
      for (const s of [PlayerSide.Left, PlayerSide.Right]) {
        const hit = this.state.teams[s].characters.find((c) => c.id === id && !c.defeated);
        if (hit) {
          holder = hit;
          side = s;
          break;
        }
      }
      if (!holder || side === null) continue;
      for (const code of activeTraitIds(holder)) {
        const spec = getTrait(code)?.onSkullHitExplodeGem;
        if (!spec) continue;
        // 处在组结算中途（skull-damage 结算口）：入队延迟到本轮组结算后（见队列注释）
        this.pendingTraitExplosions.push({ kind: 'spec', spec: { kind: 'random', count: spec.count }, side });
      }
    }
    for (const id of damagedIds) {
      let holder: Character | undefined;
      let side: PlayerSide | null = null;
      for (const s of [PlayerSide.Left, PlayerSide.Right]) {
        const hit = this.state.teams[s].characters.find((c) => c.id === id && !c.defeated);
        if (hit) {
          holder = hit;
          side = s;
          break;
        }
      }
      if (!holder || side === null) continue;
      const p = passivesOf(holder);
      const eco = p.damagedEconomyGains;
      if (eco) {
        for (const currency of ['gold', 'souls', 'gems'] as const) {
          if (eco[currency] > 0) events.push(...this.creditEconomy(currency, eco[currency]));
        }
      }
      const summon = p.summonOnDamaged;
      if (summon && (summon.chance >= 1 || this.rng.next() < summon.chance)) {
        events.push(...this.traitSummon(summon, side));
        events.push(...this.applySelfSummonStatus(holder));
      }
      // 承受骷髅伤害创造特殊宝石（接线批 onyxshard「创造 2 颗极度末日骷髅头」+ *shard
      // 巨人宝石/法力药水族）：随机现存格就地翻新（满盘创造的代理口径，与 onDeathCreateGem
      // 同源），发既有 gem-transform 事件。处在 runCascades 组结算内，不在此重入连锁——
      // 新造宝石若可匹配由外层连锁循环下一轮吸收（与大连创造同口径）。
      const create = p.onDamagedCreateGem;
      if (create) {
        events.push(...this.spawnSpecialGems(
          create.gem, create.tier, create.count, undefined, create.color as BaseColor | undefined,
        ));
      }
      // 承受骷髅伤害敌方全体受伤（接线批 manyheads「当敌人造成骷髅头伤害时，全体敌人受到
      // 3 点伤害」）：伤害经 traitDamage（damageOne 管线，妖火/法术减伤/屏障/护甲/阵亡同
      // 技能口径），目标=持有者对面阵营的存活全队（确定性逐个结算、零随机消耗）。
      const aoe = p.onSkullDamagedEnemyDamage;
      if (aoe) {
        const foes = this.state.teams[opponentOf(side)].characters.filter((c) => !c.defeated);
        for (const foe of foes) events.push(...this.traitDamage(foe, holder, aoe.amount));
      }
    }
    return events;
  }

  /**
   * 回合开始的经济入账与召唤（缺口清扫批 turnStartEconomy/turnStartSummon 惰性字段的
   * 结算口 + 职业天赋 lightfingers「每回合 5 黄金」/ soulcaller「每回合 1 灵魂」复用）：
   * 行动方存活持有者逐个结算（与 applyTurnStartPassives 同一触发点、同一次序）；
   * 召唤概率经同一条 rng（无概率字段 chance>=1 直接入队）。
   */
  private applyTurnStartEconomyAndSummons(): GameEvent[] {
    const events: GameEvent[] = [];
    const team = this.state.teams[this.state.activePlayer];
    for (const char of team.characters) {
      if (char.defeated) continue;
      const p = passivesOf(char);
      const eco = p.turnStartEconomyGains;
      if (eco) {
        for (const currency of ['gold', 'souls', 'gems'] as const) {
          if (eco[currency] > 0) events.push(...this.creditEconomy(currency, eco[currency]));
        }
      }
      const summon = p.turnStartSummon;
      if (summon && (summon.chance >= 1 || this.rng.next() < summon.chance)) {
        events.push(...this.traitSummon(summon));
        events.push(...this.applySelfSummonStatus(char));
      }
      // 回合开始按概率获得属性（职业天赋 darkchannel「每回合 50% 几率获得 1 点魔力值」）：
      // 定义直读键；概率经同一条 rng。
      for (const code of activeTraitIds(char)) {
        const gainSpec = getTrait(code)?.turnStartChanceGain;
        if (!gainSpec) continue;
        if (this.rng.next() >= gainSpec.chance) continue;
        const actual = grantStat(char, gainSpec.stat, gainSpec.amount);
        if (actual !== 0) events.push({ type: 'buff', source: 'trait', targetId: char.id, stat: gainSpec.stat, amount: actual });
      }
      // 回合开始削减首位敌人全部技能值 / 窃取生命 / 窃取法力（特质收尾批：
      // aspectoffamine 饥荒相「First enemy loses 3 Skill points」官方 "Skill points" =
      // 攻/甲/生命/魔法四项各减（powerof* 族同口径）；aspectofdeath 死亡相窃 2 生命经
      // traitDrainLife（伤害管线 + 按实际伤害等量治疗）；monkeymagic 猴王魔法窃 2 法力
      // 削减口径同 onSkullHitStealMana（目标夹零、manashield 免疫整体跳过、自己按
      // manaCost 夹取））。目标=持有者对面阵营队伍序首位存活（确定性、零随机消耗）。
      const foesOfHolder = this.state.teams[opponentOf(this.state.activePlayer)].characters;
      const firstFoe = foesOfHolder.find((c) => !c.defeated);
      if (firstFoe) {
        for (const code of activeTraitIds(char)) {
          const def = getTrait(code);
          if (!def) continue;
          if (def.turnStartEnemyDrain) {
            for (const stat of ['attack', 'armor', 'magic', 'hp'] as const) {
              const removed = Math.min(Math.max(0, firstFoe[stat]), def.turnStartEnemyDrain.amount);
              if (removed <= 0 || firstFoe.defeated) continue;
              firstFoe[stat] -= removed;
              events.push({ type: 'buff', source: 'trait', targetId: firstFoe.id, stat, amount: -removed });
            }
          }
          if (def.turnStartStealLife) {
            events.push(...this.traitDrainLife(firstFoe, char, def.turnStartStealLife.amount));
          }
          if (def.turnStartStealMana && !passivesOf(firstFoe).manaOpsImmunity) {
            const stolen = Math.min(def.turnStartStealMana.amount, firstFoe.mana);
            if (stolen > 0) {
              firstFoe.mana -= stolen;
              events.push({ type: 'buff', source: 'trait', targetId: firstFoe.id, stat: 'mana', amount: -stolen });
              const before = char.mana;
              char.mana = Math.min(char.manaCost, char.mana + stolen);
              if (char.mana > before) events.push({ type: 'buff', source: 'trait', targetId: char.id, stat: 'mana', amount: char.mana - before });
            }
          }
          if (def.turnStartExplodeGem) {
            events.push(...this.explodeGemsBySpec(
              { kind: def.turnStartExplodeGem.kind, tier: def.turnStartExplodeGem.tier, count: def.turnStartExplodeGem.count },
              this.state.activePlayer,
            ));
          }
        }
      }
      // 回合开始棋盘/状态惰性字段（缺口清扫批）+ 职业天赋（wrathofanu 击晕随机敌 /
      // getbehindme 屏障随机盟友 / ancientmysteries 随机正面 / stormsoul·heatwave 开风暴）：
      // 定义直读键（getTrait，同 turnStartTypeAura 口径），概率与随机目标经同一条 rng。
      for (const code of activeTraitIds(char)) {
        const def = getTrait(code);
        if (!def) continue;
        const statusSpec = def.turnStartStatus;
        if (statusSpec && statusSpec.chance !== undefined && this.rng.next() >= statusSpec.chance) {
          continue; // 概率未命中（无 chance 字段必发）
        }
        if (statusSpec) {
          // 目标解析（接线批扩 target）：self=持有者 / allAllies/allEnemies=双方全存活
          //（确定性、零随机消耗）；randomAlly/randomEnemy=随机一名（各耗一次 rng）。
          const allies = team.characters.filter((c) => !c.defeated);
          const foes = this.state.teams[opponentOf(this.state.activePlayer)].characters.filter((c) => !c.defeated);
          let targets: readonly Character[];
          if (statusSpec.target === 'self') {
            targets = [char];
          } else if (statusSpec.target === 'allAllies') {
            targets = allies;
          } else if (statusSpec.target === 'allEnemies') {
            targets = foes;
          } else {
            const pool = statusSpec.target === 'randomAlly' ? allies : foes;
            if (pool.length === 0) continue;
            targets = [pool[this.rng.nextInt(pool.length)]];
          }
          const statuses: readonly { id: string; magnitude?: number }[] = statusSpec.randomPositive
            ? [{ id: RANDOM_POSITIVE_STATUS_POOL[this.rng.nextInt(RANDOM_POSITIVE_STATUS_POOL.length)]! }]
            : statusSpec.statuses;
          for (const st of statuses) {
            // independentChance（sleepersbane「诅咒和/或恐怖」双独立概率）：每条各自掷一次
            // chance（各中各的），目标已先选出——与 onBigMatchStatus 的 independentChance 同口径
            if (statusSpec.independentChance && statusSpec.chance !== undefined
              && this.rng.next() >= statusSpec.chance) {
              continue;
            }
            for (const target of targets) {
              const status: StatusInstance = { id: st.id, turns: statusSpec.turns };
              if (st.magnitude !== undefined) status.magnitude = st.magnitude;
              events.push(...applyStatus(target, status));
            }
          }
        }
        const storm = def.turnStartStorm;
        if (storm && storm.colors.length > 0) {
          const stormSummon: StormSummon = { color: storm.colors[0]!, turns: 8 };
          if (storm.dropKind) stormSummon.dropKind = storm.dropKind;
          events.push(...this.setTraitStorm(stormSummon, 9009, this.state.activePlayer));
        }
      }
    }
    return events;
  }

  /**
   * 同队施法触发（职业天赋 childofsky「盟友施法时 25% 召唤苍鹭巨兽」+ 缺口清扫批
   * soulverdict 惰性经济）：与施法响应（applyCastTriggers）同一触发点，行动方全队存活
   * 持有者逐个结算（盟友口径含施法者本人）。召唤物归持有者一方（=行动方）。
   */
  private applyAllyCastTriggers(): GameEvent[] {
    const events: GameEvent[] = [];
    for (const holder of this.state.teams[this.state.activePlayer].characters) {
      if (holder.defeated) continue;
      const p = passivesOf(holder);
      const eco = p.allyCastEconomyGains;
      if (eco) {
        for (const currency of ['gold', 'souls', 'gems'] as const) {
          if (eco[currency] > 0) events.push(...this.creditEconomy(currency, eco[currency]));
        }
      }
      const summon = p.summonOnAllyCast;
      if (summon && (summon.chance >= 1 || this.rng.next() < summon.chance)) {
        events.push(...this.traitSummon(summon));
        events.push(...this.applySelfSummonStatus(holder));
      }
      // 盟友施法伤害/创造宝石（特质收尾批：serpentsfang 蝰蛇之牙「对一名随机敌人造成
      // 3 点伤害」/ artillerysupport 炮火支援「对所有敌人造成 5 点伤害」经 traitDamage
      // 管线；clairvoyance 天眼通「创造一颗善石像鬼宝石」经 spawnSpecialGems 随机现存格
      // 就地翻新）。定义直读；随机目标耗一次种子化 rng，无 rng 退化不适用（本处恒有 rng）。
      for (const code of activeTraitIds(holder)) {
        const def = getTrait(code);
        if (!def) continue;
        if (def.onAllyCastEnemyDamage) {
          const foes = this.state.teams[opponentOf(this.state.activePlayer)].characters.filter((c) => !c.defeated);
          if (foes.length === 0) continue;
          const spec = def.onAllyCastEnemyDamage;
          if (spec.scope === 'enemyAll') {
            for (const foe of foes) events.push(...this.traitDamage(foe, holder, spec.amount));
          } else {
            const foe = foes[this.rng.nextInt(foes.length)];
            events.push(...this.traitDamage(foe, holder, spec.amount));
          }
        }
        if (def.onAllyCastCreateGem) {
          const spec = def.onAllyCastCreateGem;
          events.push(...this.spawnSpecialGems(spec.gem, spec.tier, spec.count));
        }
      }
    }
    return events;
  }

  /**
   * 自己召唤部队后的触发（职业天赋 hauntedweave「当我召唤部队时，织网一名随机敌人」）：
   * 持有者无此被动时零开销返回。随机目标=持有者对方的存活队列（经同一条 rng）；
   * 施加经 applyStatus（免疫在施加口拦截）。
   */
  private applySelfSummonStatus(holder: Character): GameEvent[] {
    const spec = passivesOf(holder).onSelfSummonStatus;
    if (!spec || holder.defeated) return [];
    const holderSide = this.sideOfCharacter(holder.id);
    if (holderSide === null) return [];
    const foes = this.state.teams[opponentOf(holderSide)].characters.filter((c) => !c.defeated);
    if (foes.length === 0) return [];
    const target = foes[this.rng.nextInt(foes.length)];
    const events: GameEvent[] = [];
    for (const st of spec.statuses) {
      const status: StatusInstance = { id: st.id, turns: spec.turns };
      if (st.magnitude !== undefined) status.magnitude = st.magnitude;
      events.push(...applyStatus(target, status));
    }
    return events;
  }

  /**
   * 死亡召唤路径的 self-summon 触发（hauntedweave）：召唤事件确实发生后，对双方存活
   * 持有者各触发一次（持有者=召唤特质的持有者，官方口径「当我召唤部队时」）。
   */
  private appendSelfSummonStatusForDeathSummons(events: GameEvent[], candidates: readonly Character[]): GameEvent[] {
    if (!events.some((e) => e.type === 'summon')) return events;
    const out = [...events];
    for (const holder of candidates) {
      if (holder.defeated) continue;
      if (!passivesOf(holder).onSelfSummonStatus) continue;
      out.push(...this.applySelfSummonStatus(holder));
    }
    return out;
  }

  /** 注入选色器（玩家已选色时传 FixedColorChooser；AI 用默认） */
  setColorChooser(chooser: ColorChooser): void {
    this.colorChooser = chooser;
  }

  /** 注入目标选择器（玩家已点选时传 FixedTargetChooser；AI 用默认） */
  setTargetChooser(chooser: TargetChooser): void {
    this.targetChooser = chooser;
  }

  /** 注入选格器（玩家已点选宝石时传 FixedCellChooser；AI 用默认） */
  setBranchChooser(chooser: BranchChooser): void { this.branchChooser = chooser; }

  setCellChooser(chooser: CellChooser): void {
    this.cellChooser = chooser;
  }

  /** 注入召唤物解析器（装配层从 troops 数据提供） */
  setBeastPool(refs: readonly string[]): void {
    this.beastPool = [...refs];
  }

  setSummonResolver(resolver: (referenceName: string) => SummonTemplate | null): void {
    this.summonResolver = resolver;
  }

  /**
   * 王国 → 该王国兵种 referenceName 清单 的解析器（武器原语批 K-E，「召唤一名来自X王国的
   * 随机部队」randomOfKingdom 召唤来源的候选池）：由装配层从 troops.json kingdom 字段
   * 提供。缺省时该来源安全跳过（零随机消耗），既有对局不受影响。
   */
  private summonKingdomResolver: ((kingdom: import('./types').KingdomRef) => string[] | null) | null = null;

  setSummonKingdomResolver(resolver: (kingdom: import('./types').KingdomRef) => string[] | null): void {
    this.summonKingdomResolver = resolver;
  }

  /**
   * 恶魔传送门宝石的随机恶魔候选池（TroopType 含 Daemon 的 referenceName 列表）。
   * 由装配层从 troops 数据注入；缺省空池 → 传送门只爆炸不召唤（零随机消耗）。
   */
  private daemonPool: readonly string[] = [];

  setDaemonPool(refs: readonly string[]): void {
    this.daemonPool = refs;
  }

  getState(): GameState {
    return this.state;
  }

  /**
   * 统一执行一次交换或施法行动。旧的 resolveSwap/castSkill 保留为兼容薄包装，
   * 玩家与 AI 可逐步迁移到此入口而不复制回合生命周期。
   */
  /** End a match without fabricating casualties or resolving another action. */
  surrender(side: PlayerSide): GameEvent[] {
    if (this.state.winner !== null || this.state.state === MatchState.GameOver) return [];
    const winner = opponentOf(side);
    this.state.winner = winner;
    this.state.state = MatchState.GameOver;
    this.state.economy = { gold: 0, souls: 0, gems: 0, maps: 0 };
    return [{ type: 'game-over', winner, reason: 'surrender' }];
  }

  resolveAction(action: BattleAction): GameEvent[] {
    switch (action.type) {
      case 'swap':
        return this.resolveSwapAction(action.from, action.to);
      case 'cast':
        return this.castSkillAction(action.characterId);
    }
  }

  /** 处理一次交换请求，返回完整事件流（需求 4, 5）。 */
  resolveSwap(a: CellPos, b: CellPos): GameEvent[] {
    return this.resolveAction({ type: 'swap', from: a, to: b });
  }

  /**
   * 行动被受理、刚进入解析态时登记日志。被拒绝的行动不登记也不占号，
   * 因此 index 恒等于「本场第 n 次真实行动」。
   */
  private beginActionLog(action: BattleAction, skillId?: string): ActionLogEntry {
    // 行动受理的同一时刻记下编队归属与角色引用：阵亡者会在结算过程中被移出编队，
    // 到行动末尾结算阵亡响应特质/死亡召唤时只能靠这份快照拿到它属于哪一方、
    // 以及它身上编译过的被动（summonOnDeath 等随对象走）。
    this.rosterSideAtActionStart.clear();
    this.rosterCharAtActionStart.clear();
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      for (const ch of this.state.teams[side].characters) {
        this.rosterSideAtActionStart.set(ch.id, side);
        this.rosterCharAtActionStart.set(ch.id, ch);
      }
    }
    const entry: ActionLogEntry = {
      index: this.state.actionLog.length,
      side: this.state.activePlayer,
      // 拷贝一份，避免调用方复用同一个坐标对象导致日志被回写
      action: action.type === 'swap'
        ? { type: 'swap', from: { ...action.from }, to: { ...action.to } }
        : { type: 'cast', characterId: action.characterId },
      outcome: 'switched',
    };
    if (skillId !== undefined) entry.skillId = skillId;
    this.state.actionLog.push(entry);
    return entry;
  }

  /** Count actual defeats at action end, after revival and death-trigger resolution. */
  private recordBattleDeaths(events: GameEvent[], sideAtStart: ReadonlyMap<number, PlayerSide>): void {
    const counts = this.state.battleDeaths ??= { [PlayerSide.Left]: 0, [PlayerSide.Right]: 0 };
    const summonedSides = new Map<number, PlayerSide>();
    for (const event of events) {
      if (event.type === 'summon') summonedSides.set(event.characterId, event.player);
      if (event.type !== 'defeat') continue;
      const side = sideAtStart.get(event.characterId) ?? summonedSides.get(event.characterId)
        ?? this.sideOfCharacter(event.characterId);
      if (side !== null && side !== undefined) counts[side] += 1;
    }
  }

  /** 回合尾结算完成后回填回合归属。GameOver 优先于额外回合。 */
  private endActionLog(entry: ActionLogEntry, events: GameEvent[]): void {
    this.recordBattleDeaths(events, this.rosterSideAtActionStart);
    if (this.state.state === MatchState.GameOver) entry.outcome = 'game-over';
    else if (this.state.activePlayer === entry.side) entry.outcome = 'extra-turn';
    else entry.outcome = 'switched';
  }

  private resolveSwapAction(a: CellPos, b: CellPos): GameEvent[] {
    // 状态校验：仅等待输入时受理（需求 4.3, 9.4）
    if (this.state.state !== MatchState.AwaitingInput) return [];
    // 越界或非相邻：拒绝且不变更（需求 4.2）
    if (!BoardModel.inBounds(a) || !BoardModel.inBounds(b)) return [];
    if (!this.state.board.isAdjacent(a, b)) return [];

    // 读取交换前两格的宝石 id（供表现层按稳定 id 做动画）
    const gemA = this.state.board.get(a);
    const gemB = this.state.board.get(b);
    const gemIdA = gemA ? gemA.id : -1;
    const gemIdB = gemB ? gemB.id : -1;

    // 在真实棋盘上试交换，检测是否产生匹配
    this.state.board.swap(a, b);
    if (!this.resolver.hasAnyMatch(this.state.board)) {
      // 非法交换：还原并发出拒绝事件（需求 5.2）
      this.state.board.swap(a, b);
      return [{ type: 'swap-rejected', a, b, gemIdA, gemIdB }];
    }

    // 合法交换：提交，进入解析（需求 5.1）
    this.state.state = MatchState.Resolving;
    this.pendingExtraTurnSource = null;
    const logEntry = this.beginActionLog({ type: 'swap', from: a, to: b });
    const events: GameEvent[] = [{ type: 'swap', a, b, gemIdA, gemIdB }];
    // 位次条件光环（leader 族）：行动开始按当前编队位次补授（首位易主在此生效）
    events.push(...this.applyPositionAuraTriggers());
    this.runCascades(events);
    this.flushTraitExplosions(events); // 兜底：连锁外入队的爆破（正常应已在 3.5 清空）
    this.finishTurn(events);
    this.applyActionSummonTriggers(events);
    this.processDeathTriggers(events);
    this.endActionLog(logEntry, events);
    return events;
  }

  /** 连锁主循环（需求 8.5-8.9, 18.2, 18.3） */
  private runCascades(events: GameEvent[]): void {
    this.state.chainCount = 0;
    /** 冰冻吞掉额外回合的归因单位（整轮连锁结束后才发演出事件，不打断消除批次） */
    let frozenDeniedBy: number | undefined;

    for (;;) {
      const matches = this.resolver.findMatches(this.state.board);
      if (matches.length === 0) break;

      this.state.chainCount += 1;
      const chain = this.state.chainCount;

      // 1. 消除：发出 elimination 事件，并按组结算效果；登记特殊宝石"被匹配"触发
      const destroyTriggers: { gemType: GemType; pos: CellPos; viaMatch: boolean }[] = [];
      for (const group of matches) {
        const elimination = this.makeEliminationEvent(group, chain);
        events.push(elimination);
        if (grantsExtraTurn(group.shape)) {
          const frozenBy = this.matchExtraTurnFrozenBy(group);
          if (!frozenBy) {
            // 每轮连锁就地登记，后续重力/特质嵌套连锁不推迟或覆盖该行动的奖励。
            this.pendingExtraTurnSource ??= 'match';
            elimination.extraTurnPlayer = this.state.activePlayer;
          } else frozenDeniedBy ??= frozenBy.id;
        }

        // 4/5 连响应特质（庞然/巨型/修理…）：只给匹配方自己一队，按组结算。
        // ctx 只服务条件光环批新键（施加状态/5 连限定/净化/条件经济）与大连创造批
        // （createGem：wildtribe/wildmagic 族落子，避开本轮将被消除的匹配格）；
        // 旧特质路径零随机消耗、事件序不变。
        if (group.cells.length >= 4) {
          events.push(...this.creditEconomy('gold', group.cells.length >= 5 ? 5 : 4, this.state.activePlayer));
          events.push(...applyBigMatchTriggers(
            this.state.teams[this.state.activePlayer].characters,
            {
              size: group.cells.length,
              rng: this.rng,
              applyStatus: (char, status) => applyStatus(char, status),
              enemyTeam: this.state.teams[opponentOf(this.state.activePlayer)].characters,
              gainEconomy: this.creditEconomy,
              damage: this.traitDamage,
              drainLife: this.traitDrainLife,
              explodeGem: (color, count) => {
                this.pendingTraitExplosions.push({ kind: 'color', color, count, side: this.state.activePlayer });
                return [];
              },
              explodeSpec: (spec) => {
                this.pendingTraitExplosions.push({ kind: 'spec', spec, side: this.state.activePlayer });
                return [];
              },
              createPlainGem: (color, count) => this.spawnPlainGems(color as BaseColor, count),
              createGem: (kind, tier, count, color) =>
                this.spawnSpecialGems(kind, tier, count, matches.map((grp) => grp.cells), color as BaseColor | undefined),
              summon: (spec) => {
                const produced = this.traitSummon(spec);
                // 大连召唤完成后的 self-summon 触发（hauntedweave）：召唤事件发生后，
                // 对行动方存活持有者各触发一次。
                return [...produced, ...this.appendSelfSummonStatusForDeathSummons(
                  produced,
                  this.state.teams[this.state.activePlayer].characters,
                )];
              },
              setStorm: this.traitSetStorm,
              kill: this.traitKill,
            },
          ));
        }

        // 结算法力 / 骷髅伤害（颜色组含通配倍率；骷髅组含末日骷髅加伤）
        this.applyGroupEffects(group, events);

        // 特殊宝石"被匹配"触发：织网/沙漏即时结算；至尊末日骷髅/闪电的破坏登记到
        // destroyTriggers，统一在全部组移除后引爆（避免提前清掉同迭代其他组的宝石造成双重结算）
        this.collectMatchTriggers(group, destroyTriggers, events);
      }

      // 2. 从棋盘移除被消除的宝石
      for (const group of matches) {
        for (const cell of group.cells) {
          this.state.board.set(cell, null);
        }
      }

      // 3. 特殊宝石破坏链：至尊末日骷髅引爆相邻一圈 / 闪电清整行整列，
      //    以及连带的炸弹/闪电/许愿连锁；链上摧毁照常结算法力/骷髅
      const manaPotions: BaseColor[] = [];
      this.settleDestroyed(this.expandSpecialDestruction(destroyTriggers, events, manaPotions), events);

      // 3.5 特质爆破统一落地（收尾批延迟队列）：本轮组已全部遍历完，此处改盘安全——
      // 爆破自带重力+连锁吸收，内层连锁跑完后再做本轮胜负/重力。
      this.flushTraitExplosions(events);

      // 4. 胜负检查：某队全灭即结束（需求 15.3）
      if (this.checkVictory(events)) return;

      // 5. 重力 + 补充（需求 8.1-8.4）；风暴激活时对应色按 STORM_DROP_WEIGHT 加权
      const result = this.gravity.apply(this.state.board, this.skullChance, this.dropWeights(), this.stormSkullDrop(), this.comboBias, this.state.actionLog);
      events.push({ type: 'gravity', chainCount: chain, moves: result.moves });
      events.push({ type: 'refill', chainCount: chain, spawns: result.spawns });
      this.scatterManaPotionGems(manaPotions, events);
      // 循环：再次检测匹配（需求 8.5, 8.6）
    }

    // 只有额外回合确实丢了才提示（别的组/技能已给额外回合时不提示）
    if (frozenDeniedBy !== undefined && this.pendingExtraTurnSource === null) {
      events.push({ type: 'status-blocked', targetId: frozenDeniedBy, statusId: 'frozen', reason: 'extra-turn' });
    }
  }

  /** 冻结只抑制关联颜色的匹配额外回合；骷髅看当前第一名存活部队。 */
  /** 返回吞掉该组额外回合的冻结单位（演出归因用；无则 undefined）。 */
  private matchExtraTurnFrozenBy(group: MatchGroup): Character | undefined {
    const living = this.state.teams[this.state.activePlayer].characters.filter((c) => !c.defeated);
    const settle = group.settle;
    if (settle.kind === 'skull') return living[0] && hasStatus(living[0], 'frozen') ? living[0] : undefined;
    if (settle.kind === 'color') {
      return living.find((c) => hasStatus(c, 'frozen') && c.colors.includes(settle.color));
    }
    return undefined;
  }

  private pendingExtraTurnSource: 'match' | 'skill' | 'destroy' | null = null;

  /**
   * 特质爆破延迟队列（特质收尾批）：大连/配色/骷髅命中触发的爆破发生在 runCascades
   * 的组遍历中途——若就地 resolveBoardChange（重力+连锁）会改写本轮尚未遍历的 match
   * 组格位（makeEliminationEvent 读到空格崩溃 / 消除错位宝石，lightningstrike 时代
   * 即潜伏、收尾批把爆破特质送进烟雾池后引爆）。因此中途触发一律入队，每轮组结算
   * 完成后（步骤 3 之后、胜负/重力之前）按入队序统一执行——爆破的落地管线
   * （settleDestroyed + 重力 + 连锁吸收）与官方语义一致，只是结算点后移到轮边界。
   */
  private pendingTraitExplosions: (
    | { kind: 'color'; color: string; count: number; side: PlayerSide }
    | { kind: 'spec'; spec: { kind: 'random' | 'skull' | SpecialGemKind; tier?: number; color?: string; count: number }; side: PlayerSide }
  )[] = [];

  /** 按 FIFO 执行入队的特质爆破（空队列零开销）。 */
  private flushTraitExplosions(events: GameEvent[]): void {
    const queue = this.pendingTraitExplosions;
    if (queue.length === 0) return;
    this.pendingTraitExplosions = [];
    for (const entry of queue) {
      if (entry.kind === 'color') events.push(...this.explodeGemsOfColor(entry.color, entry.count));
      else events.push(...this.explodeGemsBySpec(entry.spec, entry.side));
    }
  }

  private makeEliminationEvent(group: MatchGroup, chain: number): EliminationEvent {
    return {
      type: 'elimination',
      chainCount: chain,
      shape: group.shape,
      cells: group.cells.map((pos) => {
        const gem = this.state.board.get(pos)!;
        return { pos, gemId: gem.id, gemType: gem.type };
      }),
    };
  }

  private masteryOf(side: PlayerSide, color: BaseColor): number {
    const map = side === PlayerSide.Left ? this.playerManaMastery : this.enemyManaMastery;
    const raw = Math.max(0, map?.[color] ?? 0);
    return raw * this.masterySuppress[side];
  }

  /**
   * 宝石法力结算口（战斗机制批 jinx「将敌人的宝石灵力减半」的抑制点）：宝石匹配/被摧毁
   * 产出的法力统一经此入账——归属方的敌方队伍持有 jinx 时产出按 masterySuppress 折减
   * （向下取整、保底 1：抑制不放大，与疾病减半的逐接收者 floor 同口径）。无抑制时
   * 数值原样透传（无新键特质逐字节等价旧路径）。法力灵链等「额外」量在分配器内按
   * 接收者追加，不乘倍率——Masteries 折减的是宝石本体产出，不折特质赠送。
   */
  private distributeGemMana(team: Team, side: PlayerSide, color: BaseColor, amount: number): GameEvent[] {
    const mult = this.masterySuppress[side];
    let effective = mult < 1 ? Math.max(1, Math.floor(amount * mult)) : amount;
    // 双方旗帜独立生效，按匹配事件平展 ±N、向下保底 0。
    // 加成并入「宝石本体产出」一起走分配管线，故吃 jinx/Mastery 抑制之后应用。
    const banner = side === PlayerSide.Left ? this.bannerBoosts : this.enemyBannerBoosts;
    if (banner) {
      const boost = banner[color];
      if (boost) effective = Math.max(0, effective + boost);
    }
    return this.mana.distribute(team, side, color, effective);
  }

  /**
   * 位次条件光环的行动开始结算（战斗机制批 leader 族「当军队位于首位时…」）：
   * 战斗开始的授予在构造期（静默），首位/末位易主（身前/身后角色离场、召唤追加）
   * 在下次行动开始于此补授。无持有者时零事件、零随机消耗。
   */
  private applyPositionAuraTriggers(): GameEvent[] {
    return applyPositionAuras(
      [this.state.teams[PlayerSide.Left].characters, this.state.teams[PlayerSide.Right].characters],
      this.positionAuraGranted,
    );
  }

  /**
   * 结算一个消除组的法力或骷髅伤害（需求 11, 12, 14）：
   *   - 颜色组：法力量 = 消除宝石数 × 组内通配倍率乘积
   *   - 骷髅族组：一次普攻，末日骷髅每颗 +5 加伤
   *   - 全通配组：无归属色，只消除不结算
   */
  private applyGroupEffects(group: MatchGroup, events: GameEvent[]): void {
    const settle = group.settle;
    const activeTeam = this.state.teams[this.state.activePlayer];
    if (settle.kind === 'color') {
      // 颜色 → 产生法力：3 消按基础几率涌动翻倍、4 消几率 ×2 且至少 35%、5+ 必翻倍，
      // 基础几率含连锁加成（见 manaSurge.ts），再乘通配倍率。
      // jinx 抑制在 distributeGemMana；旗帜 ±N 在抑制之后平展。
      const gemCount = group.cells.length;
      const mastery = this.masteryOf(this.state.activePlayer, settle.color);
      const chain = Math.max(1, this.state.chainCount);
      // 旧规则本来就掷的（精通 > 0 的 3 消）仍用主随机流；新规则新增的掷骰走 surgeRng
      const roll = gemCount === 3 && mastery > 0 ? this.rng.next()
        : surgeNeedsRoll(gemCount, mastery, chain) ? this.surgeRng.next() : 1;
      const { amount, surged } = matchManaWithSurge(gemCount, settle.manaMultiplier, mastery, roll, chain);
      const gained = this.distributeGemMana(activeTeam, this.state.activePlayer, settle.color, amount);
      if (surged) {
        for (const ev of gained) {
          if (ev.type === 'mana-gain') ev.surge = true;
        }
      }
      events.push(...gained);
      // 星族随组加发（元素星四色各 +1 / 暗影星两色各 +1，官方 "1 Mana for ALL of those
      // colors"）：组归属色按其余宝石的颜色计（settle.color），星色法力逐色另发
      if (settle.bonusColors) {
        for (const c of settle.bonusColors) {
          events.push(...this.distributeGemMana(activeTeam, this.state.activePlayer, c, 1));
        }
      }
      // 配色触发特质（食人魔之怒/阳光…）：匹配到关联色时给匹配方全队加值。
      // 每次结算算一次，与消除的宝石数无关——描述是「在配对X色宝石时」，不是「每颗」。
      // enemyTeam 供敌方配色触发（rancor「在敌人配对骷髅头时…」族，颜色键同理）；
      // rng/applyStatus 供配色施加状态（molten/sunfire 族「使随机一名敌人陷入Y状态」，
      // 无新键特质零随机消耗、事件序不变）；drainLife 供配色窃取生命（corruption 族）；
      // damage 供配色伤害（lumpofcoal/dawnslayer/sleetstorm 族）。
      events.push(...applyColorMatchTriggers(activeTeam.characters, settle.color, {
        enemyTeam: this.state.teams[opponentOf(this.state.activePlayer)].characters,
        rng: this.rng,
        applyStatus: (char, status) => applyStatus(char, status),
        drainLife: this.traitDrainLife,
        damage: this.traitDamage,
        explodeSpec: (spec) => {
          this.pendingTraitExplosions.push({ kind: 'spec', spec, side: this.state.activePlayer });
          return [];
        },
      }));
    } else if (settle.kind === 'starOnly') {
      // 纯星组（星与星互连、无基色依附）：只发星族各色 +1，宝石本体不产法力
      for (const c of settle.bonusColors) {
        events.push(...this.distributeGemMana(activeTeam, this.state.activePlayer, c, 1));
      }
    } else if (settle.kind === 'skull') {
      // 骷髅 → 物理伤害（需求 14），不产生法力（需求 11.2）
      const enemyTeam = this.state.teams[opponentOf(this.state.activePlayer)];
      // 传入 rng：闪避特质（敏捷/轻巧）需要随机判定，且必须走同一条确定性随机源
      // 骷髅附加护甲比（职业天赋 razorarmor「骷髅头伤害附加 20% 的护甲值」）：攻击方队首
      // 持有者按 自身护甲 × ratio 附加固定伤害（与末日骷髅加伤同一 bonus 通道）。
      const front = activeTeam.characters.find((c) => !c.defeated);
      const armorRatio = front ? passivesOf(front).skullDamageFromArmorRatio ?? 0 : 0;
      const armorBonus = front && armorRatio > 0 ? Math.floor(front.armor * armorRatio) : 0;
      const outcome = this.combat.resolveSkullDamage(
        activeTeam,
        enemyTeam,
        group.cells.length,
        this.rng,
        settle.bonusDamage + armorBonus,
      );
      events.push(...this.resolveDefeatWithRevive(outcome.events));
      // 承受骷髅伤害的召唤/经济钩子（职业天赋 golemprotector 召唤 + 缺口清扫批 pickpocket
      // 惰性经济）：从本次结算的 skull-damage 事件取实际受击目标——落空不产事件，天然与
      // gainOnDamaged「落空不触发」同口径；每次受击各自掷签（概率经同一条 rng）。
      events.push(...this.applyDamagedTriggersFromEvents(outcome.events));
      // 骷髅命中/受击的吞噬触发（R22 吞噬批 voracious 命中吞目标 / consumefuel 受击吞攻击者）：
      // 与受击钩子同一触发时机（主结算 skull-damage 事件之后），defeat 经出编队管线。
      events.push(...this.applySkullDevourTriggers(outcome.events));
      // 配对骷髅触发（diamondaura/powerofstars 配色光环、rancor 敌方触发、darkensouls
      // 条件经济）：在骷髅伤害结算之后触发，避免同一次命中被本次新增的护甲/生命减免——
      // 炸毁骷髅（settleExplodedSkulls）不算「配对」，不在此列。rng/applyStatus 同配色点
      //（onColorMatchStatus 定义允许 'skull' 色键，现无数据、注入零消耗）；drainLife/damage 同配色点。
      events.push(...applyColorMatchTriggers(activeTeam.characters, 'skull', {
        enemyTeam: enemyTeam.characters,
        gainEconomy: this.creditEconomy,
        rng: this.rng,
        applyStatus: (char, status) => applyStatus(char, status),
        drainLife: this.traitDrainLife,
        damage: this.traitDamage,
        explodeSpec: (spec) => {
          this.pendingTraitExplosions.push({ kind: 'spec', spec, side: this.state.activePlayer });
          return [];
        },
      }));
    }
    // 'wildOnly'：全通配组无归属色，只消除不结算
  }

  /**
   * 特殊宝石"被匹配"触发（宝石此刻仍在盘上，移除发生在组循环之后）：
   *   - 至尊末日骷髅 / 闪电：破坏型，登记到 destroyTriggers 统一引爆（见 runCascades 步骤 3）
   *   - 织网：随机一名存活敌人获得 web 状态
   *   - 沙漏：本方获得一次额外回合
   *   - 五种即时匹配状态宝石（燃烧/冻结/诅咒/毒/恐怖）：立即施加；摧毁同样触发
   *   - 其余可匹配状态宝石：登记到 destroyTriggers 统一施加；死亡标记不可匹配
   *   - 通配无匹配触发（倍率在组结算里）；炸弹/许愿/死亡标记不可匹配，不会出现在组里
   */
  private collectMatchTriggers(
    group: MatchGroup,
    destroyTriggers: { gemType: GemType; pos: CellPos; viaMatch: boolean }[],
    events: GameEvent[],
  ): void {
    for (const cell of group.cells) {
      const gem = this.state.board.get(cell);
      if (!gem || gem.type.kind !== 'special') continue;
      const kind = gem.type.spec.kind;
      if (kind === 'uberDoomSkull' || kind === 'lightningRow' || kind === 'lightningCol') {
        destroyTriggers.push({ gemType: gem.type, pos: cell, viaMatch: true });
      } else if (kind === 'web') {
        events.push(...this.applyWebGem(cell));
      } else if (kind === 'hourglass') {
        events.push({ type: 'special-gem-trigger', kind: 'hourglass', pos: cell });
        if (this.pendingExtraTurnSource === null) this.pendingExtraTurnSource = 'match';
      } else if (isStatusGemKind(kind)) {
        if (MATCH_STATUS_GEMS.has(kind)) {
          this.applyStatusGem(kind, cell, events);
        } else {
          // 「被摧毁」型被匹配同样视为被摧毁（GEMS-SEMANTICS-2 A 组共性）：登记进摧毁链统一施加
          destroyTriggers.push({ gemType: gem.type, pos: cell, viaMatch: true });
        }
      } else if (kind === 'dragonGem' || kind === 'giantGem' || kind === 'spiritGem'
        || kind === 'manaPotionGem' || kind === 'elementalStar' || kind === 'umbralStar'
        || kind === 'volcanoGem' || kind === 'lycanthropyGem') {
        // 波B「被匹配/被摧毁」双路径触发（官方 matched **or destroyed**；火山/狼化按其官方句式
        // 同样双路径——狼化=「Removing ... cast lycanthropy」）：登记到摧毁链统一结算
        //（匹配宝石不入摧毁队列，管线天然去重）。星族的多色法力加发在组结算（MatchSettle.bonusColors）。
        destroyTriggers.push({ gemType: gem.type, pos: cell, viaMatch: true });
      } else if (kind === 'candyGem') {
        // 糖果匹配入口：己方该色存活盟友各 +1 法力；摧毁入口共用 applyCandyGem。
        this.applyCandyGem(gem.type.spec, cell, events);
      } else if (kind === 'enchantedGem') {
        this.applyEnchantedGem(cell, events);
      }
      // decayGem/stoneBlock/mimicGem：无被移除时的独立效果。
    }
  }

  /**
   * 状态搬运宝石（GEMS-SEMANTICS-2 A/B 组波A）：按 STATUS_GEM_EFFECTS 的考证规格施加状态。
   * 织网宝石先例的推广：special-gem-trigger 事件在前、status-apply 在后（表现层触发环 +
   * 状态施加演出全套白得）；随机目标经本引擎同一条 rng，且仅宝石实际触发时消耗。
   */
  private applyStatusGem(kind: StatusGemKind, pos: CellPos, events: GameEvent[]): void {
    events.push({ type: 'special-gem-trigger', kind, pos });
    const spec = STATUS_GEM_EFFECTS[kind];
    const side = spec.side === 'enemy'
      ? opponentOf(this.state.activePlayer)
      : this.state.activePlayer;
    const pool = this.state.teams[side].characters.filter((c) => !c.defeated);
    if (pool.length === 0) return;
    const targets = spec.scope === 'all' ? pool : [pool[this.rng.nextInt(pool.length)]];
    for (const target of targets) {
      const status: StatusInstance = { id: spec.statusId, turns: spec.turns };
      if (spec.magnitude !== undefined) status.magnitude = spec.magnitude;
      events.push(...applyStatus(target, status));
    }
  }

  /** 织网宝石（被匹配时）：随机一名存活敌人获得 web 状态（魔力归零，见 status.ts） */
  private applyWebGem(pos: CellPos): GameEvent[] {
    const events: GameEvent[] = [{ type: 'special-gem-trigger', kind: 'web', pos }];
    const enemies = this.state.teams[opponentOf(this.state.activePlayer)].characters
      .filter((c) => !c.defeated);
    if (enemies.length === 0) return events;
    const target = enemies[this.rng.nextInt(enemies.length)];
    events.push(...applyStatus(target, { id: WEB_STATUS_ID, turns: WEB_GEM_TURNS }));
    return events;
  }

  /**
   * 特殊宝石"被摧毁"触发链（clear 管线路径 + 匹配路径共用的引爆引擎）。
   * 队列 FIFO：炸弹→引爆相邻一圈（gem-explode）、闪电→清空整行/列（gem-destroy）、
   * 许愿→5 选 1 随机回蓝；至尊末日骷髅匹配和直接摧毁均引爆相邻一圈；末日骷髅仅结算伤害。
   * 链上新摧毁的宝石继续入队（炸弹可连环引爆）。
   *
   * `initial` 里 viaMatch 的宝石视为匹配触发的登记（已被随组移除并结算，只触发其效果），
   * 其余视为已被调用方移除且已结算；返回链上新摧毁的宝石，由调用方统一结算法力/骷髅。
   * 确定性：处理顺序与格子遍历序固定，随机只走 this.rng（需求 17.3）。
   */
  private expandSpecialDestruction(
    initial: ReadonlyArray<{ gemType: GemType; pos?: CellPos; viaMatch?: boolean }>,
    events: GameEvent[],
    manaPotions: BaseColor[],
  ): DestroyedGem[] {
    const chain: DestroyedGem[] = [];
    const queue = initial.slice();
    while (queue.length > 0) {
      const d = queue.shift()!;
      if (d.gemType.kind !== 'special' || d.pos === undefined) continue;
      const kind = d.gemType.spec.kind;
      if (kind === 'bomb') {
        events.push({ type: 'special-gem-trigger', kind: 'bomb', pos: d.pos });
        this.clearCellsForSpecial(this.ringCells(d.pos), 'gem-explode', events, queue, chain);
      } else if (kind === 'uberDoomSkull') {
        // 匹配和直接摧毁都引爆；同一颗只经破坏链处理一次。
        events.push({ type: 'special-gem-trigger', kind, pos: d.pos });
        this.clearCellsForSpecial(this.ringCells(d.pos), 'gem-explode', events, queue, chain);
      } else if (kind === 'lightningRow' || kind === 'lightningCol') {
        // 项目统一裁定：匹配与摧毁均触发行／列清除。
        events.push({
          type: 'special-gem-trigger',
          kind,
          pos: d.pos,
          line: kind === 'lightningRow' ? d.pos.row : d.pos.col,
        });
        const cells = kind === 'lightningRow'
          ? this.cellsOfRow(d.pos.row)
          : this.cellsOfCol(d.pos.col);
        this.clearCellsForSpecial(cells, 'gem-destroy', events, queue, chain);
      } else if (kind === 'web') {
        // 织网双路径（官方 matched **or destroyed**，DECISIONS 四项拍板②）：
        // 匹配路径在 collectMatchTriggers 已结算（匹配宝石不入本队列），此处只接摧毁路径
        //（技能清除/爆破波及/炸弹圈/闪电行列链上摧毁）——同一次操作内两路互斥，不会重复施加。
        events.push(...this.applyWebGem(d.pos));
      } else if (kind === 'wish') {
        this.applyWish(d.pos, events);
      } else if (kind === 'bootyGem') {
        // 赃物宝石（官方 Booty Gem）：被摧毁时给摧毁方 +10 金币（战场经济池）。
        // 不可匹配（SPECIAL_MATCH_COLOR 无键），只能经清除管线/至尊末日骷髅爆炸圈抵达这里。
        events.push({ type: 'special-gem-trigger', kind: 'bootyGem', pos: d.pos });
        creditGoldForSide(this.state, this.state.activePlayer, BOOTY_GEM_GOLD);
        events.push({
          type: 'economy-gain', currency: 'gold', amount: BOOTY_GEM_GOLD, side: this.state.activePlayer,
        });
      } else if (kind === 'dragonGem') {
        // 龙宝石（官方 matched/destroyed）：爆炸其所在列**下方**全部宝石（{row..ROWS-1}×col，
        // 自身格已在组移除/调用方清除，clear 对空格天然幂等）
        events.push({ type: 'special-gem-trigger', kind, pos: d.pos, color: d.gemType.spec.color });
        const cells: CellPos[] = [];
        for (let row = d.pos.row; row < BoardModel.ROWS; row++) cells.push({ row, col: d.pos.col });
        this.clearCellsForSpecial(cells, 'gem-explode', events, queue, chain);
      } else if (kind === 'giantGem') {
        // 巨人宝石（官方 matched/destroyed）：+5 该色法力（distributeGemMana → ManaDistributor/
        // canGainMana 口径，沉默者跳过）+ 爆炸相邻一圈（末日骷髅同款 ringCells）
        const color = d.gemType.spec.color ?? BaseColor.Red;
        events.push({ type: 'special-gem-trigger', kind, pos: d.pos, color });
        events.push(...this.distributeGemMana(
          this.state.teams[this.state.activePlayer], this.state.activePlayer, color, MANA_BONUS_GIANT,
        ));
        this.clearCellsForSpecial(this.ringCells(d.pos), 'gem-explode', events, queue, chain);
      } else if (kind === 'spiritGem') {
        this.applySpiritGem(d.gemType.spec, d.pos, events);
      } else if (kind === 'manaPotionGem') {
        const color = d.gemType.spec.color ?? BaseColor.Red;
        events.push({ type: 'special-gem-trigger', kind, pos: d.pos, color });
        // 只登记本轮效果；等破坏链与补盘完成，再按普通造石规则全盘铺色。
        manaPotions.push(color);
      } else if (kind === 'elementalStar') {
        // 项目统一裁定：匹配与摧毁均触发。元素星：摧毁对角线四格 {±1,±1}（非 8 邻环）；
        // 四色各 +1 法力在组结算加发（MatchSettle.bonusColors）
        events.push({ type: 'special-gem-trigger', kind, pos: d.pos });
        this.clearCellsForSpecial(this.diagonalCells(d.pos), 'gem-destroy', events, queue, chain);
      } else if (kind === 'umbralStar') {
        // 项目统一裁定：匹配与摧毁均触发。暗影星：清整行+整列，
        // 行/列交叉点=自身、只登记一次；两色各 +1 法力在组结算加发
        events.push({ type: 'special-gem-trigger', kind, pos: d.pos, line: d.pos.row });
        this.clearCellsForSpecial(
          [...this.cellsOfRow(d.pos.row), ...this.cellsOfCol(d.pos.col)],
          'gem-destroy', events, queue, chain,
        );
      } else if (kind === 'volcanoGem') {
        // Heroic Gems guide: when destroyed, including matching and direct destruction.
        events.push({ type: 'special-gem-trigger', kind, pos: d.pos, color: BaseColor.Red });
        this.clearCellsForSpecial(this.upwardBlastCells(d.pos), 'gem-explode', events, queue, chain);
      } else if (kind === 'lycanthropyGem') {
        // 狼化宝石（官方 "Removing Lycanthropy gems cast lycanthropy"）：被摧毁（含被匹配）
        // 时对随机敌人施加狼化状态
        events.push({ type: 'special-gem-trigger', kind, pos: d.pos, color: BaseColor.Purple });
        const enemies = this.state.teams[opponentOf(this.state.activePlayer)].characters
          .filter((c) => !c.defeated);
        if (enemies.length > 0) {
          const target = enemies[this.rng.nextInt(enemies.length)];
          events.push(...applyStatus(target, { id: 'lycanthropy', turns: LYCANTHROPY_GEM_TURNS }));
        }
      } else if (kind === 'angelGem') {
        // 天使宝石（官方 "give a random Ally the Bless Status Effect"）：随机己方获得祝福
        //（blessed 施加即净化负面 + 存续期全免疫，status.ts 已实现口径）
        events.push({ type: 'special-gem-trigger', kind, pos: d.pos });
        const allies = this.state.teams[this.state.activePlayer].characters
          .filter((c) => !c.defeated);
        if (allies.length > 0) {
          const target = allies[this.rng.nextInt(allies.length)];
          events.push(...applyStatus(target, { id: 'blessed', turns: ANGEL_GEM_TURNS }));
        }
      } else if (kind === 'daemonicPortalGem') {
        // 恶魔传送门（官方 "explode all Gems around them and summon a random Daemon
        // to the team of the gem destroyer"）：爆炸相邻一圈 + 为摧毁者（行动方）召唤随机恶魔
        events.push({ type: 'special-gem-trigger', kind, pos: d.pos });
        this.clearCellsForSpecial(this.ringCells(d.pos), 'gem-explode', events, queue, chain);
        events.push(...this.summonRandomDaemon());
      } else if (kind === 'gargoyleGem') {
        this.applyGargoyleGem(d.gemType.spec, d.pos, events);
      } else if (kind === 'trapGem') {
        this.applyTrapGem(d.pos, events);
      } else if (kind === 'hourglass' && !d.viaMatch) {
        events.push({ type: 'special-gem-trigger', kind, pos: d.pos });
        if (this.pendingExtraTurnSource === null) this.pendingExtraTurnSource = 'destroy';
      } else if (kind === 'candyGem') {
        this.applyCandyGem(d.gemType.spec, d.pos, events);
      } else if (kind === 'enchantedGem') {
        this.applyEnchantedGem(d.pos, events);
      } else if (isStatusGemKind(kind) && DESTROY_STATUS_GEMS.has(kind)) {
        // 13 种状态宝石均可被摧毁触发；匹配时即时施加的 5 种不会重复进队列。
        this.applyStatusGem(kind, d.pos, events);
      }
      // ghost/wildcard/stoneBlock/mimicGem 未定义被移除时可复用的触发效果；
      // wildcard 的匹配倍率仍只在匹配组结算，幽魂/宝箱怪的原版效果另列缺口。
    }
    return chain;
  }

  /** 清除一批仍在盘上的格子并发一个清除事件；被清宝石入队继续触发、入链等待结算 */
  private clearCellsForSpecial(
    cells: CellPos[],
    eventType: 'gem-explode' | 'gem-destroy',
    events: GameEvent[],
    queue: { gemType: GemType; pos?: CellPos }[],
    chain: DestroyedGem[],
  ): void {
    const cleared: GemClearEvent['cells'] = [];
    for (const pos of cells) {
      const gem = this.state.board.get(pos);
      if (!gem) continue;
      this.state.board.set(pos, null);
      cleared.push({ pos, gemId: gem.id, gemType: gem.type });
      const d: DestroyedGem = { gemType: gem.type, pos };
      queue.push(d);
      chain.push(d);
    }
    if (cleared.length > 0) {
      events.push(
        eventType === 'gem-explode'
          ? { type: 'gem-explode', cells: cleared }
          : { type: 'gem-destroy', cells: cleared },
      );
    }
  }

  /**
   * 许愿宝石（被摧毁时）：5 选 1 随机回蓝，各 20%（官方）。
   * 0..2 = 随机 1/2/3 名己方，3 = 己方全员，4 = 双方全员（20% 的坑）。
   * 沉默者不可充能（与法力分配器同口径），阵亡不受益。
   */
  private applyWish(pos: CellPos, events: GameEvent[]): void {
    const option = Math.min(4, Math.floor(this.rng.next() * 5));
    const myTeam = this.state.teams[this.state.activePlayer].characters;
    const enemyTeam = this.state.teams[opponentOf(this.state.activePlayer)].characters;

    let targets: Character[];
    if (option <= 2) {
      const pool = myTeam.filter((c) => !c.defeated);
      targets = [];
      for (let i = 0; i <= option && pool.length > 0; i++) {
        targets.push(pool.splice(this.rng.nextInt(pool.length), 1)[0]);
      }
    } else if (option === 3) {
      targets = myTeam.filter((c) => !c.defeated);
    } else {
      targets = [...myTeam, ...enemyTeam].filter((c) => !c.defeated);
    }

    events.push({
      type: 'special-gem-trigger',
      kind: 'wish',
      pos,
      wish: { option, targetIds: targets.map((t) => t.id) },
    });
    for (const t of targets) {
      if (!canGainMana(t)) continue;
      const gain = t.manaCost - t.mana;
      if (gain <= 0) continue;
      t.mana += gain;
      events.push({ type: 'buff', source: 'trait', targetId: t.id, stat: 'mana', amount: gain });
    }
  }

  /** 8 邻格（行优先序，限界） */
  private ringCells(pos: CellPos): CellPos[] {
    const cells: CellPos[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const p = { row: pos.row + dr, col: pos.col + dc };
        if (BoardModel.inBounds(p)) cells.push(p);
      }
    }
    return cells;
  }

  /** 对角线四格 {±1,±1}（元素星，非 8 邻环；限界） */
  private diagonalCells(pos: CellPos): CellPos[] {
    const cells: CellPos[] = [];
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]] as const) {
      const p = { row: pos.row + dr, col: pos.col + dc };
      if (BoardModel.inBounds(p)) cells.push(p);
    }
    return cells;
  }

  /** 向上垂直列 + 对角延伸（火山，dragonGem「向下」的反向）：{row-1..0}×col 及 {row-k}×{col±k}，限界 */
  private upwardBlastCells(pos: CellPos): CellPos[] {
    const cells: CellPos[] = [];
    for (let row = pos.row - 1; row >= 0; row--) cells.push({ row, col: pos.col });
    for (let k = 1; ; k++) {
      const left = { row: pos.row - k, col: pos.col - k };
      const right = { row: pos.row - k, col: pos.col + k };
      const inL = BoardModel.inBounds(left);
      const inR = BoardModel.inBounds(right);
      if (inL) cells.push(left);
      if (inR) cells.push(right);
      if (!inL && !inR) break;
    }
    return cells;
  }

  /**
   * 灵力宝石（官方 "drain 2 Mana from Enemies"）：敌方每个存活角色 -2 法力（夹零、不转移，
   * 官方 "drain" 无转移语义）。沉默**不影响**被汲取方（法力汲取不是充能）；法力操作免疫
   *（manashield）按引擎削减口既有口径拦截（debuff.ts stat==='mana' 同款）。
   */
  private applySpiritGem(spec: SpecialGemSpec, pos: CellPos, events: GameEvent[]): void {
    events.push({ type: 'special-gem-trigger', kind: 'spiritGem', pos, color: spec.color });
    for (const foe of this.state.teams[opponentOf(this.state.activePlayer)].characters) {
      if (foe.defeated || passivesOf(foe).manaOpsImmunity) continue;
      const loss = Math.min(SPIRIT_GEM_DRAIN, foe.mana);
      if (loss <= 0) continue;
      foe.mana -= loss;
      events.push({ type: 'buff', source: 'trait', targetId: foe.id, stat: 'mana', amount: -loss });
    }
  }

  /**
   * 法力药水：本轮每颗被匹配/摧毁的药水独立创造 7-11 颗同色普通宝石。
   * 队列属于当前消除/破坏批次，避免特质爆破重入时提前消耗外层待结算的药水。
   * 在重力补盘后复用 gemEffect 的创造规则：全盘不放回抽取非同色匹配宝石，
   * 就地转换并发 gem-transform；特殊宝石的覆盖行为也与普通造石保持一致。
   * 不传 resolveBoardChange：避免递归重入，本批造石后的匹配由外层连锁循环吸收。
   */
  private scatterManaPotionGems(colors: readonly BaseColor[], events: GameEvent[]): void {
    for (const color of colors) {
      events.push(...gemEffect({
        op: 'create',
        gem: { kind: 'color', color },
        count: { base: 0, mult: 0 },
        countRange: MANA_POTION_GEM_RANGE,
      }).apply({
        state: this.state,
        casterId: -1, // 棋盘效果，无施法者；数量由固定区间决定。
        rng: this.rng,
        nextGemId: this.nextGemId,
      }));
    }
  }

  /**
   * 糖果宝石：匹配和直接摧毁共用该效果；每颗仅处理一次
   *（collectMatchTriggers 登记口）。己方全体该色存活盟友各 +1——直接授予不走分配器
   *（官方是"给每个该色盟友"而非产出到池），但保持 canGainMana 沉默拦截 + manaCost 夹取口径。
   */
  private applyEnchantedGem(pos: CellPos, events: GameEvent[]): void {
    events.push({ type: 'special-gem-trigger', kind: 'enchantedGem', pos, color: BaseColor.Purple });
    const allies = this.state.teams[this.state.activePlayer].characters.filter((c) => !c.defeated);
    if (allies.length > 0) {
      events.push(...applyStatus(allies[this.rng.nextInt(allies.length)], { id: 'enchanted', turns: 3 }));
    }
  }

  private applyCandyGem(spec: SpecialGemSpec, pos: CellPos, events: GameEvent[]): void {
    const color = spec.color ?? BaseColor.Red;
    events.push({ type: 'special-gem-trigger', kind: 'candyGem', pos, color });
    for (const ally of this.state.teams[this.state.activePlayer].characters) {
      if (ally.defeated || !ally.colors.includes(color) || !canGainMana(ally)) continue;
      const gain = Math.min(CANDY_GEM_MANA, ally.manaCost - ally.mana);
      if (gain <= 0) continue;
      ally.mana += gain;
      events.push({ type: 'buff', source: 'trait', targetId: ally.id, stat: 'mana', amount: gain });
    }
  }

  /**
   * 石像鬼宝石（官方 "Good Gargoyle Gems give all Allies a random Positive Status Effect;
   * Evil/Bad Gargoyle Gems inflict all Enemies a random Negative Status Effect"）：
   * tier 1=善（己方全体）/ 2=恶（敌方全体），每个存活角色独立掷一条随机状态
   *（池=引擎已实现状态集，见 GARGOYLE_*_STATUS_POOL；DoT 带标准 magnitude）。
   */
  private applyGargoyleGem(spec: SpecialGemSpec, pos: CellPos, events: GameEvent[]): void {
    const evil = spec.tier === 2;
    events.push({ type: 'special-gem-trigger', kind: 'gargoyleGem', pos });
    const side = evil ? opponentOf(this.state.activePlayer) : this.state.activePlayer;
    const pool = evil ? GARGOYLE_NEGATIVE_STATUS_POOL : GARGOYLE_POSITIVE_STATUS_POOL;
    for (const target of this.state.teams[side].characters) {
      if (target.defeated) continue;
      const statusId = pool[this.rng.nextInt(pool.length)];
      const status: StatusInstance = { id: statusId, turns: GARGOYLE_GEM_TURNS };
      // DoT 量级对齐状态搬运族口径（燃烧/中毒 3、出血 1）
      if (statusId === 'poison' || statusId === 'burning') status.magnitude = 3;
      else if (statusId === 'bleed') status.magnitude = 1;
      events.push(...applyStatus(target, status));
    }
  }

  /**
   * 陷阱宝石（官方 Underspire "1 of 5 effects: Stun/Freeze/Entangle/Faerie Fire all Player
   * Troops / Create 3 Doomskulls"）：oneOf 掷签五选一。负面**永远打玩家队**（Left），
   * 即使宝石由玩家自己摧毁（官方原文 "even if the player destroys the Gem"）。
   * 创造末日骷髅走满盘随机现存格就地转化的代理口径（T4 创造批同款），连锁由外层管线吸收。
   */
  private applyTrapGem(pos: CellPos, events: GameEvent[]): void {
    const option = this.rng.nextInt(TRAP_GEM_OPTIONS);
    events.push({ type: 'special-gem-trigger', kind: 'trapGem', pos });
    if (option < 4) {
      const statusIds = ['stun', 'frozen', 'entangle', 'faerie-fire'] as const;
      const turns = [1, 3, 3, 3] as const;
      for (const target of this.state.teams[PlayerSide.Left].characters) {
        if (target.defeated) continue;
        events.push(...applyStatus(target, { id: statusIds[option], turns: turns[option] }));
      }
    } else {
      events.push(...this.spawnSpecialGems('doomSkull', undefined, 3));
    }
  }

  /**
   * 恶魔传送门的随机恶魔召唤（官方 "summon a random Daemon to the team of the gem destroyer"）：
   * 候选池由装配层经 setDaemonPool 注入（troops.json TroopType 含 Daemon 的 referenceName），
   * 种子化掷选后走现有召唤先例（traitSummon → applyDeathSummons → 注入模板解析器装配 +
   * 容量/FIFO 入队），归摧毁者（行动方）一方。池为空时安全跳过、零随机消耗。
   */
  private summonRandomDaemon(): GameEvent[] {
    if (this.daemonPool.length === 0) return [];
    const referenceName = this.daemonPool[this.rng.nextInt(this.daemonPool.length)];
    return this.traitSummon({ chance: 1, troopId: -1, referenceName, displayName: referenceName });
  }

  /**
   * 腐朽宝石盘上光环（官方 "at the start of each turn, the team with the most troops will
   * suffer -1 Armor per Decay Gem for all its troops; if both teams have the same number of
   * troops, it will affect all troops"）：棋盘上每颗 decayGem，兵员更多的一队全员 -1 甲/颗，
   * 同数双方都扣；甲夹零、零随机消耗。挂回合开始的回合尾扫描（finishTurn，每回合至多一次）；
   * 无腐朽宝石时零事件——既有对局事件流与 rng 序列逐字节不变。
   */
  private applyDecayGemAura(): GameEvent[] {
    let gems = 0;
    let firstPos: CellPos | null = null;
    for (let row = 0; row < BoardModel.ROWS; row++) {
      for (let col = 0; col < BoardModel.COLS; col++) {
        const gem = this.state.board.get({ row, col });
        if (gem?.type.kind === 'special' && gem.type.spec.kind === 'decayGem') {
          gems += 1;
          if (!firstPos) firstPos = { row, col };
        }
      }
    }
    if (gems === 0 || firstPos === null) return [];
    const leftAlive = this.state.teams[PlayerSide.Left].characters.filter((c) => !c.defeated).length;
    const rightAlive = this.state.teams[PlayerSide.Right].characters.filter((c) => !c.defeated).length;
    const sides: PlayerSide[] = leftAlive === rightAlive
      ? [PlayerSide.Left, PlayerSide.Right]
      : leftAlive > rightAlive ? [PlayerSide.Left] : [PlayerSide.Right];
    const events: GameEvent[] = [
      { type: 'special-gem-trigger', kind: 'decayGem', pos: firstPos, color: BaseColor.Brown },
    ];
    for (const side of sides) {
      for (const char of this.state.teams[side].characters) {
        if (char.defeated || char.armor <= 0) continue;
        const loss = Math.min(gems, char.armor);
        char.armor -= loss;
        events.push({ type: 'buff', source: 'trait', targetId: char.id, stat: 'armor', amount: -loss });
      }
    }
    return events;
  }

  private cellsOfRow(row: number): CellPos[] {
    return Array.from({ length: BoardModel.COLS }, (_, col) => ({ row, col }));
  }

  private cellsOfCol(col: number): CellPos[] {
    return Array.from({ length: BoardModel.ROWS }, (_, row) => ({ row, col }));
  }

  /**
   * 被摧毁宝石的法力/骷髅结算：颜色按色归并；骷髅系宝石按官方"炸毁骷髅"规则合计
   * 一次法术伤害（见 settleExplodedSkulls）；其余特殊宝石自身不参与。
   */
  private settleDestroyed(
    destroyed: ReadonlyArray<{ gemType: GemType; pos?: CellPos }>,
    events: GameEvent[],
    side: PlayerSide = this.state.activePlayer,
    explosion = false,
    explosionChain: ReadonlyArray<{ gemType: GemType; pos?: CellPos }> = [],
  ): void {
    if (destroyed.length === 0 && explosionChain.length === 0) return;
    const colorCounts = new Map<string, { type: GemType; matched: number; exploded: number }>();
    let skullCount = 0;
    let doomCount = 0;
    let uberCount = 0;
    const skullCells: CellPos[] = [];
    for (const [d, isExplosion] of [
      ...destroyed.map(d => [d, explosion] as const),
      ...explosionChain.map(d => [d, true] as const),
    ]) {
      if (d.gemType.kind === 'color') {
        const key = d.gemType.color;
        const cur = colorCounts.get(key) ?? { type: d.gemType, matched: 0, exploded: 0 };
        if (isExplosion) cur.exploded += 1;
        else cur.matched += 1;
        colorCounts.set(key, cur);
      } else if (d.gemType.kind === 'skull') {
        skullCount += 1;
        if (d.pos) skullCells.push(d.pos);
      } else if (d.gemType.kind === 'special') {
        // Colored Heroic Gems yield their own color mana when directly destroyed;
        // explosion chains follow the same half-mana-per-color rule as ordinary gems.
        const color = d.gemType.spec.color ?? SPECIAL_MATCH_COLOR[d.gemType.spec.kind];
        if (color !== undefined) {
          const cur = colorCounts.get(color) ?? { type: colorGem(color), matched: 0, exploded: 0 };
          if (isExplosion) cur.exploded += 1;
          else cur.matched += 1;
          colorCounts.set(color, cur);
        }
        // 被摧毁的末日/至尊末日骷髅：仍结算 5/10 点；只有至尊末日会继续引爆。
        if (d.gemType.spec.kind === 'doomSkull') {
          doomCount += 1;
          if (d.pos) skullCells.push(d.pos);
        } else if (d.gemType.spec.kind === 'uberDoomSkull') {
          uberCount += 1;
          if (d.pos) skullCells.push(d.pos);
        }
      }
    }
    // GoW 4.0 patch: each colour from an explosion gives half Mana (floor),
    // while regular matches triggered by the ensuing cascade retain full Mana.
    for (const { type, matched, exploded } of colorCounts.values()) {
      const mana = matched + Math.floor(exploded / 2);
      if (mana > 0) this.settleGems(type, mana, events, side);
    }
    this.settleExplodedSkulls(skullCount, doomCount, uberCount, skullCells, events, side);
  }

  /**
   * 被炸毁骷髅的官方结算（区别于三消骷髅，查证结论见 DECISIONS「骷髅爆炸」）：
   * 不吃攻击力、不可被闪避，按**法术伤害**打敌方队首——普通骷髅 1 点/颗、
   * 末日骷髅 5 点/颗、至尊末日骷髅 10 点/颗（TrueTrophies 官方攻略 + Steam 社区复核）。
   * 走 damageOne（法术铠甲/屏障/护甲照常减免），施法者记为**结算归属方**队首（表现层
   * 定位用；缺省=行动方，开局爆破传持有者一方）。
   */
  private settleExplodedSkulls(
    normalCount: number,
    doomCount: number,
    uberCount: number,
    skullCells: ReadonlyArray<CellPos>,
    events: GameEvent[],
    side: PlayerSide = this.state.activePlayer,
  ): void {
    const total = normalCount * EXPLODED_SKULL_DAMAGE.normal
      + doomCount * EXPLODED_SKULL_DAMAGE.doom
      + uberCount * EXPLODED_SKULL_DAMAGE.uber;
    if (total <= 0) return;
    const enemyTeam = this.state.teams[opponentOf(side)];
    const target = CombatResolver.frontAlive(enemyTeam);
    if (!target || target.defeated) return;
    const source = CombatResolver.frontAlive(this.state.teams[side]);
    const sourceId = source?.id ?? 0;
    const produced = damageOne(target, sourceId, total, false, 'single', undefined, source ?? undefined);
    // 演出元数据：爆炸源 = 被炸骷髅的质心格（表现层从该点发射骷髅弹体）；无格位信息时退化为棋盘中心
    const origin: CellPos = skullCells.length > 0
      ? {
          row: Math.max(0, Math.min(BoardModel.ROWS - 1,
            Math.round(skullCells.reduce((s, c) => s + c.row, 0) / skullCells.length))),
          col: Math.max(0, Math.min(BoardModel.COLS - 1,
            Math.round(skullCells.reduce((s, c) => s + c.col, 0) / skullCells.length))),
        }
      : { row: Math.floor(BoardModel.ROWS / 2), col: Math.floor(BoardModel.COLS / 2) };
    for (const e of produced) {
      if (e.type === 'skill-damage') {
        e.originCell = origin;
        e.skullBurst = { normal: normalCount, doom: doomCount, uber: uberCount };
      }
    }
    events.push(...produced);
  }

  /**
   * 按宝石类型与数量结算法力/骷髅伤害（消除组与技能直接摧毁共用，需求 11, 12, 14）。
   * @param gemType 该批宝石的类型（同色或骷髅）
   * @param count   宝石数量
   * @param side    结算归属方（法力入账/骷髅出手）；缺省=当前行动方
   */
  private settleGems(
    gemType: GemType,
    count: number,
    events: GameEvent[],
    side: PlayerSide = this.state.activePlayer,
  ): void {
    const activeTeam = this.state.teams[side];
    if (gemType.kind === 'color') {
      // 颜色 → 产生法力，数量 = 宝石数（需求 11.1）；jinx 抑制在 distributeGemMana
      events.push(
        ...this.distributeGemMana(activeTeam, side, gemType.color, count),
      );
      // 配色触发特质（食人魔之怒/阳光…）：匹配到关联色时给结算归属方全队加值。
      // 每次结算算一次，与消除的宝石数无关——描述是「在配对X色宝石时」，不是「每颗」。
      // enemyTeam 供敌方配色触发（rancor 族）；rng/applyStatus 供配色施加状态（molten 族）；
      // drainLife 供配色窃取生命（corruption 族）；damage 供配色伤害（lumpofcoal 族）。
      events.push(...applyColorMatchTriggers(activeTeam.characters, gemType.color, {
        enemyTeam: this.state.teams[opponentOf(side)].characters,
        rng: this.rng,
        applyStatus: (char, status) => applyStatus(char, status),
        drainLife: this.traitDrainLife,
        damage: this.traitDamage,
        explodeSpec: (spec) => {
          this.pendingTraitExplosions.push({ kind: 'spec', spec, side: this.state.activePlayer });
          return [];
        },
      }));
    } else if (gemType.kind === 'skull') {
      // 骷髅 → 物理伤害（需求 14），不产生法力（需求 11.2）
      const enemyTeam = this.state.teams[opponentOf(side)];
      // 传入 rng：闪避特质（敏捷/轻巧）需要随机判定，且必须走同一条确定性随机源
      const outcome = this.combat.resolveSkullDamage(activeTeam, enemyTeam, count, this.rng);
      events.push(...this.resolveDefeatWithRevive(outcome.events));
      // 骷髅命中/受击的吞噬触发（R22 吞噬批）：与 applyGroupEffects 骷髅口同款（技能炸毁
      // 的骷髅也算「在造成骷髅头伤害时」，官方命中类特质同口径）。
      events.push(...this.applySkullDevourTriggers(outcome.events));
      // 配对骷髅触发（diamondaura/powerofstars/rancor/darkensouls 族），在伤害结算之后（同 applyGroupEffects 口径）
      events.push(...applyColorMatchTriggers(activeTeam.characters, 'skull', {
        enemyTeam: enemyTeam.characters,
        gainEconomy: this.creditEconomy,
        rng: this.rng,
        applyStatus: (char, status) => applyStatus(char, status),
        drainLife: this.traitDrainLife,
        damage: this.traitDamage,
        explodeSpec: (spec) => {
          this.pendingTraitExplosions.push({ kind: 'spec', spec, side: this.state.activePlayer });
          return [];
        },
      }));
    }
  }

  /**
   * 技能宝石操作后的棋盘结算（需求 7.3, 7.5），供效果原语经 EffectContext 调用：
   *   1. 结算被直接摧毁宝石的法力/骷髅（每类各按数量合并结算）
   *   2. 重力下落 + 顶部补充
   *   3. 解析由此产生的新匹配作为连锁（含其法力/骷髅结算）
   * 直接把事件追加进传入的 events。
   *
   * side 为**直接摧毁**的归属方（法力入账/骷髅伤害的出手方）；缺省=当前行动方
   *（技能路径），开局爆破（omenof*）显式传持有者一方。连锁结算仍按行动方口径。
   */
  resolveBoardChange(
    destroyed: DestroyedGem[],
    events: GameEvent[],
    side: PlayerSide = this.state.activePlayer,
    mode: 'destroy' | 'explode' | 'remove' = 'destroy',
  ): void {
    const manaPotions: BaseColor[] = [];
    // P-F1-remove-gems：原生 Remove 只把宝石拿走——不结算法力/骷髅/资源，也不触发特殊宝石
    // 摧毁链（proposal rulings/R010-remove-special-gems.md）；重力补充与连锁照常。
    if (mode !== 'remove') {
      // 1. 特殊宝石摧毁触发链（可匹配宝石匹配时亦触发，单颗只处理一次）
      const chain = this.expandSpecialDestruction(destroyed, events, manaPotions);

      // 2. 被直接摧毁宝石的法力/骷髅结算：按类型归并数量（含链上新摧毁的）
      this.settleDestroyed(destroyed, events, side, mode === 'explode', chain);
    }

    // 2. 重力 + 补充（风暴激活时对应色加权）
    const result = this.gravity.apply(this.state.board, this.skullChance, this.dropWeights(), this.stormSkullDrop(), this.comboBias, this.state.actionLog);
    if (result.moves.length > 0 || result.spawns.length > 0) {
      const chain = this.state.chainCount;
      events.push({ type: 'gravity', chainCount: chain, moves: result.moves });
      events.push({ type: 'refill', chainCount: chain, spawns: result.spawns });
    }

    this.scatterManaPotionGems(manaPotions, events);

    // 3. 解析由此产生的连锁
    this.runCascades(events);
  }

  /**
   * 回合开始的棋盘写入类特质：把随机一格变成指定颜色，或按概率把某色转成骷髅头，
   * 以及 T4 创造批——创造特殊宝石（spidersilk 织网/haunted 鬼魂/eyeofdestruction 末日骷髅…）
   * 与把某色/骷髅头转换成特殊宝石（redrage/embers/daemonsmark/temporal 族）。
   *
   * 改完棋盘后**立即** `runCascades()`：三连就该被消掉，不能把现成匹配滞留到下一次行动。
   * 连锁产出的法力与骷髅伤害都归即将行动的这一方，符合「我的回合开始」的语义。
   *
   * 特殊宝石落子走满盘转化的代理口径：随机现存格就地翻新（与技能 doCreate 的转化回退
   * 同源），发既有 gem-transform 事件。概率判定与 turnStartColorToSkull 同口径：
   * 每条特质掷一次，未命中也占掉这次随机数。
   *
   * @returns 是否改动过棋盘（调用方据此决定是否补一次胜负判定）
   */
  private applyTurnStartBoardTraits(events: GameEvent[]): boolean {
    const team = this.state.teams[this.state.activePlayer].characters;
    const changes: GemTransformEvent['changes'] = [];

    for (const char of team) {
      if (char.defeated) continue;
      for (const code of activeTraitIds(char)) {
        const trait = getTrait(code);
        if (trait?.turnStartCreateGem) {
          const count = trait.turnStartCreateGem.count ?? 1;
          for (const pos of this.randomGemSlots(count)) {
            const from = this.state.board.get(pos);
            if (from) {
              // color 'skull' = 普通骷髅头（接线批 bonefeast「创造 2 颗骷髅头」），其余为六基色
              const c = trait.turnStartCreateGem.color;
              const to: GemType = c === 'skull'
                ? { kind: 'skull', variant: 'normal' }
                : colorGem(c as BaseColor);
              const gemId = from.id;
              this.state.board.set(pos, { id: gemId, type: to });
              changes.push({ pos, gemId, from: from.type, to });
            }
          }
        }
        if (trait?.turnStartColorToSkull && this.rng.next() < trait.turnStartColorToSkull.chance) {
          const pos = this.randomCellOfColor(trait.turnStartColorToSkull.color as BaseColor);
          const from = pos ? this.state.board.get(pos) : null;
          if (pos && from) {
            const to: GemType = { kind: 'skull', variant: 'normal' };
            const gemId = from.id;
            this.state.board.set(pos, { id: gemId, type: to });
            changes.push({ pos, gemId, from: from.type, to });
          }
        }
        if (trait?.turnStartCreateSpecialGem) {
          const spec = trait.turnStartCreateSpecialGem;
          if (spec.chance === undefined || this.rng.next() < spec.chance) {
            for (const pos of this.randomGemSlots(spec.count)) {
              const from = this.state.board.get(pos);
              if (!from) continue;
              // color：六色族宝石（dragonGem/giantGem/spiritGem/manaPotionGem）归属基色
              const to = specialGem(spec.gem, spec.tier, spec.color as BaseColor | undefined);
              const gemId = from.id;
              this.state.board.set(pos, { id: gemId, type: to });
              changes.push({ pos, gemId, from: from.type, to });
            }
          }
        }
        if (trait?.turnStartColorToSpecial) {
          const spec = trait.turnStartColorToSpecial;
          if (spec.chance === undefined || this.rng.next() < spec.chance) {
            for (let i = 0; i < spec.count; i++) {
              // 转换后该格不再是来源类型（骷髅头→末日骷髅头 / 红→燃烧宝石），
              // 下一颗不会重复命中同一格，天然不重叠
              const pos = spec.color === 'skull'
                ? this.randomCellOfPlainSkull()
                : this.randomCellOfColor(spec.color as BaseColor);
              const from = pos ? this.state.board.get(pos) : null;
              if (!pos || !from) continue;
              // gemColor：六色族目标宝石的归属基色（kinof*「蓝色宝石→蓝龙宝石」族）
              const to = specialGem(spec.gem, spec.tier, spec.gemColor as BaseColor | undefined);
              const gemId = from.id;
              this.state.board.set(pos, { id: gemId, type: to });
              changes.push({ pos, gemId, from: from.type, to });
            }
          }
        }
      }
    }

    if (changes.length === 0) return false;
    events.push({ type: 'gem-transform', changes });
    this.runCascades(events);
    return true;
  }

  /** 棋盘上均匀随机一格 */
  private randomCell(): CellPos {
    return {
      row: this.rng.nextInt(BoardModel.ROWS),
      col: this.rng.nextInt(BoardModel.COLS),
    };
  }

  /** 随机一格指定颜色的宝石；没有该色返回 null */
  private randomCellOfColor(color: BaseColor): CellPos | null {
    const candidates: CellPos[] = [];
    for (let row = 0; row < BoardModel.ROWS; row++) {
      for (let col = 0; col < BoardModel.COLS; col++) {
        const gem = this.state.board.get({ row, col });
        if (gem?.type.kind === 'color' && gem.type.color === color) candidates.push({ row, col });
      }
    }
    if (candidates.length === 0) return null;
    return candidates[this.rng.nextInt(candidates.length)];
  }

  /** 随机一格普通骷髅头；没有返回 null（「将骷髅头转换成末日骷髅头」只翻新普通骷髅，末日族不算） */
  private randomCellOfPlainSkull(): CellPos | null {
    const candidates: CellPos[] = [];
    for (let row = 0; row < BoardModel.ROWS; row++) {
      for (let col = 0; col < BoardModel.COLS; col++) {
        const gem = this.state.board.get({ row, col });
        if (gem?.type.kind === 'skull' && gem.type.variant === 'normal') candidates.push({ row, col });
      }
    }
    if (candidates.length === 0) return null;
    return candidates[this.rng.nextInt(candidates.length)];
  }

  /**
   * 随机取至多 count 个互不相同的可写格位（多颗创造的落点，满盘棋盘上重掷已选格）。
   * avoid 为需要避开的格（大连创造时传本轮连锁将被消除的匹配格——落在其上会被随后
   * 的组移除吞掉）；有界重试，超过上限就少放一格，绝不重复盖写或死循环。
   */
  private randomGemSlots(count: number, avoid?: ReadonlyArray<readonly CellPos[]>): CellPos[] {
    const taken = new Set<string>();
    for (const cells of avoid ?? []) {
      for (const p of cells) taken.add(posKey(p));
    }
    const out: CellPos[] = [];
    for (let i = 0; i < count; i++) {
      let pos = this.randomCell();
      for (let tries = 0; taken.has(posKey(pos)) && tries < 16; tries++) pos = this.randomCell();
      if (taken.has(posKey(pos))) continue;
      taken.add(posKey(pos));
      out.push(pos);
    }
    return out;
  }

  /**
   * 特殊宝石创造原语（T4 创造批共用：回合开始 / 身亡 / 大连三个触发点 + 接线批受击创造）：
   * 随机格现存宝石就地翻新成特殊宝石（满盘创造的代理口径，与技能 doCreate 的
   * 转化回退同源），发既有 gem-transform 事件。不在此跑连锁——调用方决定：
   * 大连路径由外层 runCascades 下一轮自然吸收新匹配；回合开始/身亡路径显式跑。
   * color 为六色族宝石（dragonGem/giantGem/spiritGem/manaPotionGem）的归属基色。
   */
  private spawnSpecialGems(
    kind: SpecialGemKind,
    tier: number | undefined,
    count: number,
    avoid?: ReadonlyArray<readonly CellPos[]>,
    color?: BaseColor,
  ): GameEvent[] {
    const changes: GemTransformEvent['changes'] = [];
    for (const pos of this.randomGemSlots(count, avoid)) {
      const from = this.state.board.get(pos);
      if (!from) continue;
      const to = specialGem(kind, tier, color);
      const gemId = from.id;
      this.state.board.set(pos, { id: gemId, type: to });
      changes.push({ pos, gemId, from: from.type, to });
    }
    if (changes.length === 0) return [];
    return [{ type: 'gem-transform', changes }];
  }

  /**
   * 随机现存格就地翻新为普通色宝石（特质收尾批 lunarscales「有 50% 的几率创造 3 颗紫色
   * 宝石」注入大匹配 ctx.createPlainGem）：与 spawnSpecialGems 同一「满盘创造的代理口径」，
   * 改完棋盘发 gem-transform 事件，新造宝石参与的匹配由外层 runCascades 下一轮吸收；
   * 满盘安全跳过。
   */
  private spawnPlainGems(color: BaseColor, count: number): GameEvent[] {
    const changes: GemTransformEvent['changes'] = [];
    for (const pos of this.randomGemSlots(count)) {
      const from = this.state.board.get(pos);
      if (!from) continue;
      const to = colorGem(color);
      const gemId = from.id;
      this.state.board.set(pos, { id: gemId, type: to });
      changes.push({ pos, gemId, from: from.type, to });
    }
    if (changes.length === 0) return [];
    return [{ type: 'gem-transform', changes }];
  }

  /**
   * 找角色所在方。
   *
   * 先查在场编队，查不到再回落到行动开始时的编队快照——`resolveDefeatEvents()` 会把
   * 阵亡者从编队里移除（腾位给召唤物），所以行动末尾结算阵亡响应时原角色已经不在场上。
   */
  private sideOfCharacter(id: number): PlayerSide | null {
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      if (this.state.teams[side].characters.some((c) => c.id === id)) return side;
    }
    return this.rosterSideAtActionStart.get(id) ?? null;
  }

  /**
   * 结算本次行动产生的阵亡响应特质（吸收生命/复仇者/庆功…）。
   *
   * 在一次行动的末尾统一扫 defeat 事件，而不是在每个产出 defeat 的地方各挂一次——
   * 骷髅结算、技能伤害、DoT 三处都会产生阵亡，分散挂容易漏也容易重复计。
   * 代价是增益落在回合尾之后：本回合被 DoT 打死的角色不会因队友的吸血而复活，这是有意的。
   */
  private processDeathTriggers(events: GameEvent[]): void {
    const deadIds = [...new Set(events.filter((e) => e.type === 'defeat').map((e) => e.characterId))];
    for (const id of deadIds) {
      const side = this.sideOfCharacter(id);
      if (side === null) continue; // 已不在编队里，无法判定归属，跳过
      // 身亡经济（valuable「在自身身亡时获得 25 黄金」）：死者本人持有的战场经济入账。
      // 死者已移出编队，编译被动随对象走，从行动开始的引用快照取；入账复用 creditEconomy
      //（黄金归死者阵营，economy-gain 的 side 记其归属方），每名死者至多入账一次。
      const dead = this.rosterCharAtActionStart.get(id);
      if (dead) events.push(...applySelfDeathManaGift(dead, this.state.teams[side].characters, this.rng));
      const deathEco = dead ? passivesOf(dead).onDeathEconomy : undefined;
      if (deathEco) events.push(...this.creditEconomy(deathEco.currency, deathEco.amount, side));
      // 自身亡→敌方全体陷入状态（职业天赋 deathcurse「我身亡时，使所有敌人陷入死亡标记」）：
      // 死者被动随行动开始引用快照取（死者已移出编队），确定性逐个施加、零随机消耗。
      const selfDeathStatus = dead ? passivesOf(dead).onSelfDeathEnemyAllStatus : undefined;
      if (selfDeathStatus && side !== null) {
        for (const foe of this.state.teams[opponentOf(side)].characters) {
          if (foe.defeated) continue;
          for (const st of selfDeathStatus.statuses) {
            const status: StatusInstance = { id: st.id, turns: selfDeathStatus.turns };
            if (st.magnitude !== undefined) status.magnitude = st.magnitude;
            events.push(...applyStatus(foe, status));
          }
        }
      }
      // 身亡创造特殊宝石（T4 批 unstablecore「在我身亡时创造 3 颗炸弹宝石」）：死者本人
      // 持有，与身亡经济同一结算点、同一引用快照。随机格就地翻新（满盘转化代理口径），
      // 随后照常跑一次连锁并复判胜负——炸弹不可匹配，通常一次扫描即止（零随机消耗），
      // 但未来的可匹配宝石落子也走同一条正确路径。
      const deathGem = dead ? passivesOf(dead).onDeathCreateGem : undefined;
      if (deathGem) {
        const spawned = this.spawnSpecialGems(deathGem.gem, deathGem.tier, deathGem.count);
        if (spawned.length > 0) {
          events.push(...spawned);
          this.runCascades(events);
          this.checkVictory(events);
        }
      }
      events.push(...applyDeathTriggers(
        this.state.teams[side].characters,
        this.state.teams[opponentOf(side)].characters,
        { applyStatus, rng: this.rng },
      ));
      // 敌人身亡的状态/种族光环变体（bloodlust/lordofdeath/sharedfate + 职业天赋
      // chillofdeath 随机冻结 / risingshadows 阵亡猎杀）：与阵亡响应同一时机。
      // 事件顺序：stat 增益 → 状态/种族光环 → 死亡召唤，都落在引发阵亡的行动事件之后。
      events.push(...applyEnemyDeathTriggers(
        this.state.teams[opponentOf(side)].characters,
        this.state.teams[side].characters,
        { applyStatus, rng: this.rng, kill: this.traitKill },
      ));
      // 敌亡吞噬（R22 吞噬批 bloodyfeast「若敌人死亡，则有 20% 的几率吞噬该随机敌人」）：
      // 持有者=死者对方阵营的存活角色（与 applyEnemyDeathTriggers 同时机同持有者范围），
      // 目标=死者一方仍存活的随机一名（死者已出编队天然排除）。随机目标与吞噬概率各经
      // 同一条种子化 rng；吞噬免疫在原语口整体跳过。无新键特质不进此路径（零消耗）。
      for (const holder of this.state.teams[opponentOf(side)].characters) {
        if (holder.defeated) continue;
        const spec = passivesOf(holder).onEnemyDeathDevour;
        if (!spec) continue;
        const candidates = this.state.teams[side].characters.filter((c) => !c.defeated);
        if (candidates.length === 0) break;
        const target = candidates[Math.floor(this.rng.next() * candidates.length)];
        events.push(...this.traitDevour(holder, [target], spec.chance));
      }
      // 死亡召唤（daemonicpact/terrorpact/fromdark/darkdeath 族）：与阵亡响应同一时机。
      // 事件顺序：增益 buff → 召唤 summon，都落在引发阵亡的行动事件之后。
      events.push(...this.resolveDeathSummons(id, side));
    }
  }

  /**
   * 结算一次阵亡触发的召唤特质。
   *
   * 三个字段各有明确的持有者范围（在此预筛，applyDeathSummons 只管概率与入队）：
   *   - summonOnDeath 只由死者本人持有触发；
   *   - summonOnAllyDeath 由死者队伍的存活持有者触发（持有者自己阵亡不算）；
   *   - summonOnEnemyDeath 由死者的对方队伍存活持有者触发。
   * 顺序：死者本人 → 本队存活 → 对方存活，即召唤入队顺序（确定性）。
   * 概率判定走本引擎同一条种子化 rng；召唤物属性经模板解析器按兵种数据装配
   * （setSummonTemplateResolver，由装配层注入）；入队复用容量/FIFO 队列规则。
   */
  private resolveDeathSummons(deadId: number, deadSide: PlayerSide): GameEvent[] {
    const ownerTeam = this.state.teams[deadSide];
    const enemyTeam = this.state.teams[opponentOf(deadSide)];
    const specs: { spec: DeathSummonSpec; side: PlayerSide }[] = [];

    // 死者本人：summonOnDeath 唯一有效来源。resolveDefeatEvents 已把它移出编队，
    // 编译被动随对象走，从行动开始的引用快照取。召唤物归死者一方（本人持有）。
    const dead = this.rosterCharAtActionStart.get(deadId);
    if (dead) {
      const p = passivesOf(dead);
      if (p.summonOnDeath) specs.push({ spec: p.summonOnDeath, side: deadSide });
    }
    // 本队存活者：summonOnAllyDeath。召唤物归持有者一方（=死者一方）
    for (const c of ownerTeam.characters) {
      if (c.defeated || c.id === deadId) continue;
      const p = passivesOf(c);
      if (p.summonOnAllyDeath) specs.push({ spec: p.summonOnAllyDeath, side: deadSide });
    }
    // 对方存活者：summonOnEnemyDeath。召唤物归持有者一方（=死者对方）
    for (const c of enemyTeam.characters) {
      if (c.defeated) continue;
      const p = passivesOf(c);
      if (p.summonOnEnemyDeath) specs.push({ spec: p.summonOnEnemyDeath, side: opponentOf(deadSide) });
    }

    if (specs.length === 0) return [];

    // 死亡召唤完成后的 self-summon 触发（hauntedweave「当我召唤部队时，织网随机敌人」）：
    // 候选持有者=双方全队（持有者的"我召唤"指召唤源是自己的被动）。
    const produced = applyDeathSummons(specs, {
      deadId,
      nextCharId: () => this.nextCharId(),
      rng: this.rng,
      enqueue: (summoned, troopId, side) => this.enqueueSummon(summoned, troopId, side),
      setStorm: (spec, side) => this.setStormFromSummon(spec, side),
    });
    return this.appendSelfSummonStatusForDeathSummons(
      produced,
      [...ownerTeam.characters, ...enemyTeam.characters],
    );
  }

  /**
   * 风暴召唤结算（死亡召唤的风暴变体，darkdeath/fromdark 族）：不入队，改设持有者一方
   * `team.storm`。裁定本体已抽到 `skills/effects/storm.ts` 的 `applyStormToTeam`
   * （与开局风暴/技能 createStorm/debugSetStorm 共用同一份「全场唯一、后召顶替先召」
   * 实现与 storm-change 事件形态，避免两套规则）；此处只做 spec → 载荷的翻译。
   */
  private setStormFromSummon(spec: DeathSummonSpec, side: PlayerSide): GameEvent[] {
    const payload = spec.storm;
    if (!payload) return [];
    return this.setTraitStorm(payload, spec.troopId, side);
  }

  /**
   * 特质风暴共通落点（死亡召唤的风暴变体 / 配对风暴 deadlywaters / 开局风暴共用裁定）：
   * 走 applyStormToTeam 的全局唯一「后召顶替先召」实现，storm-change 事件形态与技能
   * createStorm 逐字节一致。
   */
  private setTraitStorm(storm: StormSummon, troopId: number, side: PlayerSide): GameEvent[] {
    return applyStormToTeam(this.state, side, {
      color: storm.color,
      turns: storm.turns,
      troopId,
      dropKind: storm.dropKind,
    });
  }

  /** Test-console entry point: set a real battle storm through the same rule path as traits. */
  debugSetStorm(color: BaseColor, side: PlayerSide, turns = 8, dropKind?: SkullStormDropKind): GameEvent[] {
    const safeTurns = Math.max(1, Math.floor(turns));
    return this.setStormFromSummon({
      chance: 1,
      troopId: 9900 + Object.values(BaseColor).indexOf(color as BaseColor),
      referenceName: dropKind ? `${dropKind}storm` : `${color}storm`,
      displayName: dropKind ? `${dropKind} storm` : `${color} storm`,
      storm: { color, turns: safeTurns, dropKind },
    }, side);
  }

  /**
   * 风暴持续回合递减（回合尾，DoT 结算之后）：双方各递减 1，归零清除并发
   * reason:'expired'（color=null，prevColor=被清除的颜色）。全场唯一风暴下
   * 每次循环至多产生一条事件；双方都扫是为将来放开"每方一个风暴"留兼容。
   */
  private tickStorms(): GameEvent[] {
    const events: GameEvent[] = [];
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      const team = this.state.teams[side];
      if (!team.storm) continue;
      team.storm.turns -= 1;
      if (team.storm.turns <= 0) {
        const prevColor = team.storm.color;
        team.storm = undefined;
        const ev: StormChangeEvent = { type: 'storm-change', player: side, color: null, reason: 'expired' };
        ev.prevColor = prevColor;
        events.push(ev);
      }
    }
    return events;
  }

  /**
   * 当前生效的**颜色风暴**掉落权重（供 GravitySystem.refill 加权）：全场唯一风暴，
   * 对应色权重 ×STORM_DROP_WEIGHT。无风暴或骷髅系风暴（dropKind，见 stormSkullDrop）
   * 返回 undefined——掉落路径与旧版逐字节一致（不进加权分支、随机数消耗序列不变）。
   */
  private stormDropWeights(): Map<BaseColor, number> | undefined {
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      const storm = this.state.teams[side].storm;
      if (storm && !storm.dropKind) {
        // P-R1-dual-storm: a two-colour storm weights both colours
        const weights = new Map([[storm.color, STORM_DROP_WEIGHT]]);
        if (storm.color2 !== undefined) weights.set(storm.color2, STORM_DROP_WEIGHT);
        return weights;
      }
    }
    return undefined;
  }

  /**
   * 当前生效的**骷髅系风暴**掉落修正（骸骨/末日/超级末日，DECISIONS 官方语义回填）：
   * - 骸骨风暴：骷髅判定阈值 ×STORM_DROP_WEIGHT（与颜色风暴同一倍率口径）；
   * - 末日/超级末日风暴：末日骷髅/至尊末日骷髅开始掉落（概率为设计值，官方未公开）。
   * 无骷髅系风暴返回 undefined——随机数消耗序列与旧版一致。
   */
  private stormSkullDrop(): SkullDropBoost | undefined {
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      const storm = this.state.teams[side].storm;
      if (!storm?.dropKind) continue;
      if (storm.dropKind === 'skull') {
        return { kind: 'skull', chance: this.skullChance * STORM_DROP_WEIGHT };
      }
      if (storm.dropKind === 'doomSkull') {
        return { kind: 'doomSkull', chance: STORM_DOOMSKULL_DROP };
      }
      return { kind: 'uberDoomSkull', chance: STORM_UBER_DOOMSKULL_DROP };
    }
    return undefined;
  }

  /** 下一角色 id（场上+队列最大值+1，与 summon 效果的 deriveCharId 同口径） */
  private nextCharId(): number {
    // P-R5-summon-id-reuse: monotonic allocator (a dead unit's id is never handed to a summon)
    return allocateCharId(this.state);
  }

  /** 已完成 id 分配的召唤物入场：有空位追加到队尾；满四人时召唤失效。 */
  private enqueueSummon(summoned: Character, troopId: number, side: PlayerSide): GameEvent[] {
    const team = this.state.teams[side];
    pruneDefeated(this.state, team);
    if (team.characters.length >= MAX_ACTIVE_TEAM_SIZE) return [];
    team.characters.push(summoned);
    return [{
      type: 'summon', player: side, slot: team.characters.length - 1,
      troopId, characterId: summoned.id, destination: 'field',
    }];
  }

  /** 检查胜负，若结束则发出 game-over 并置状态（需求 15.3, 15.4）。
   * 全队 fled 的判定由移出管线天然覆盖：逃跑者已 splice 出编队，全逃光的队伍
   * characters 为空 → isWipedOut 成立 → 按败北结算（DECISIONS 四项拍板③）。 */
  private checkVictory(events: GameEvent[]): boolean {
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      if (CombatResolver.isWipedOut(this.state.teams[side])) {
        // 战后经济钩子（merchant/necromancy 族）：只在本场首次判出胜负时放大一次（declareWinner）。
        this.declareWinner(opponentOf(side), events);
        return true;
      }
    }
    // 规则击杀目标（活动深化批）：指定敌人全部阵亡 → 我方立即获胜
    if (this.ruleObjectiveMet()) {
      this.declareWinner(PlayerSide.Left, events, 'objective');
      return true;
    }
    return false;
  }

  /** 结算回合归属（需求 9.1, 9.2, 9.3） */
  private finishTurn(events: GameEvent[]): void {
    if (this.state.state === MatchState.GameOver) return;

    const grantedExtraTurn = this.pendingExtraTurnSource !== null;
    if (this.pendingExtraTurnSource !== null) {
      // 技能额外回合的 source:'skill' 事件已由效果原语发出；匹配额外回合在这里发一次。
      if (this.pendingExtraTurnSource === 'match' || this.pendingExtraTurnSource === 'destroy') {
        events.push({ type: 'extra-turn', player: this.state.activePlayer, source: this.pendingExtraTurnSource });
      }
    } else {
      // 交给对手（需求 9.1）
      const ended = this.state.activePlayer;
      const next = opponentOf(ended);
      this.state.activePlayer = next;
      events.push({ type: 'turn-end', nextPlayer: next });
      // 规则回合计数（活动深化批）：只在有规则时维护，按「该方完成的回合数」计
      if (this.rules) {
        const counts = this.state.turnCount ??= { [PlayerSide.Left]: 0, [PlayerSide.Right]: 0 };
        counts[ended] += 1;
        const limit = this.rules.turnLimit;
        if (limit && counts[PlayerSide.Left] >= limit.turns) {
          // enemyWins：我方第 N 回合结束仍未获胜；playerWins：我方坚守 N 回合且敌方回合也打完
          if (limit.onExpire === 'enemyWins' && ended === PlayerSide.Left) {
            this.pendingExtraTurnSource = null;
            this.declareWinner(PlayerSide.Right, events, 'turn-limit');
            return;
          }
          if (limit.onExpire === 'playerWins' && ended === PlayerSide.Right) {
            this.pendingExtraTurnSource = null;
            this.declareWinner(PlayerSide.Left, events, 'turn-limit');
            return;
          }
        }
      }
    }
    this.pendingExtraTurnSource = null;
    // 额外回合触发特质（特质收尾批：bigteeth 大牙「当盟友获得额外回合时获得 1 点攻击力」/
    // essenceoftime 时间精华「当自身获得额外回合时使所有盟友陷入法印状态」）。匹配/技能
    // 两种来源统一在当前行动末尾结算（技能额外回合当次生效，不积存）；按持有者一方
    // 全员结算、定义直读、确定性顺序，无新键特质零事件零随机消耗。
    if (grantedExtraTurn) {
      for (const holder of this.state.teams[this.state.activePlayer].characters) {
        if (holder.defeated) continue;
        for (const code of activeTraitIds(holder)) {
          const def = getTrait(code);
          if (!def) continue;
          if (def.onExtraTurnGain) {
            const actual = grantStat(holder, def.onExtraTurnGain.stat, def.onExtraTurnGain.amount);
            if (actual !== 0) events.push({ type: 'buff', source: 'trait', targetId: holder.id, stat: def.onExtraTurnGain.stat, amount: actual });
          }
          if (def.onExtraTurnStatus) {
            const spec = def.onExtraTurnStatus;
            const targets = spec.scope === 'self'
              ? [holder]
              : this.state.teams[this.state.activePlayer].characters.filter((c) => !c.defeated);
            for (const target of targets) events.push(...applyStatus(target, { id: spec.id, turns: spec.turns }));
          }
        }
      }
    }

    // 「回合开始」结算块：只在真实换手时执行。额外回合（四连/技能）是同一回合的延续，
    // 不重复触发回合开始效果——否则四连会再次加护甲/回血/跳 DoT（用户裁定 2026-09-19）。
    if (!grantedExtraTurn) {
      // 回合开始的被动恢复（再生）：先于 DoT 结算，顺序固定以保证确定性
      events.push(...applyTurnStartPassives(this.state.teams[this.state.activePlayer].characters));
      // 回合开始经济/召唤（缺口清扫批惰性字段结算口 + 职业天赋 lightfingers/soulcaller）：
      // 与被动恢复同一触发点、同一持有者序。
      events.push(...this.applyTurnStartEconomyAndSummons());

      // 腐朽宝石盘上光环（官方 "at the start of each turn"）：回合尾一次扫描，兵多一方全员
      // -1 甲/颗（同数双方都扣）。零随机消耗；无腐朽宝石零事件，既有对局序列不变。
      events.push(...this.applyDecayGemAura());

      // 状态结算：对「即将行动方」的角色触发（DoT 扣血 / 织网挣脱 / 到期移除，需求 9.2, 9.4, 9.5）
      events.push(
        ...this.resolveDefeatWithRevive(
          tickTeamStatuses(this.state.teams[this.state.activePlayer].characters, this.rng, this.state.activePlayer,
            () => this.summonResolver && this.beastPool.length
              ? this.summonResolver(this.beastPool[this.rng.nextInt(this.beastPool.length)]) : null),
        ),
      );
      // DoT 可能致死，重新判定胜负（game-over 仍排在末尾）
      if (this.checkVictory(events)) return;

      // 风暴持续回合递减（回合尾，DoT 结算附近）：归零清除并发 expired（阶段 1.3）
      events.push(...this.tickStorms());

      // 回合开始的棋盘写入类特质（火生/水生/白骨堆…）。放在死局检测之前：
      // 新宝石可能正好造出一步合法交换，也可能自己就凑成三连——后者必须立刻结算，
      // 不能把现成匹配留在盘面上等下一次行动。
      if (this.applyTurnStartBoardTraits(events)) {
        if (this.checkVictory(events)) return;
      }

      // 规则回合开始项（活动深化批：自动补法力 / 创造宝石）
      if (this.rules?.turnStart) {
        const side = this.state.activePlayer;
        const turnNumber = (this.state.turnCount?.[side] ?? 0) + 1;
        if (this.applyRuleTurnStart(side, turnNumber, events) && this.checkVictory(events)) return;
      }
    }

    // 死局检测只适用于完整棋盘。部分逻辑单测和未来的加载/恢复阶段可能暂时持有非满盘，
    // 此时不能把缺失格当作 Gem 交给匹配器。
    if (this.state.board.isFull() && !hasLegalSwap(this.state.board)) {
      const moves = reshuffle(this.state.board, this.rng);
      events.push({ type: 'reshuffle', moves });
      // 重排可能正好摆出现成三连。同一条规则：三连就该被消掉，不能滞留到下一次行动，
      // 否则玩家会看到盘面上有能消的组合却不消。
      if (this.resolver.hasAnyMatch(this.state.board)) {
        this.runCascades(events);
        if (this.checkVictory(events)) return;
      }
    }

    this.state.state = MatchState.AwaitingInput;
  }

  /**
   * 空过当前回合（调试/测试用）：不做任何棋盘操作，直接走真实的回合结束流程
   * （切换行动方 + 对即将行动方结算状态 DoT/到期 + 死局检测）。复用 finishTurn，
   * 不另写结算逻辑。返回本次产生的事件流。
   */
  passTurn(): GameEvent[] {
    if (this.state.state !== MatchState.AwaitingInput) return [];
    const events: GameEvent[] = [];
    // Keep the same death snapshot as swaps/casts: turn-start DoT can kill a trait holder.
    this.rosterSideAtActionStart.clear();
    this.rosterCharAtActionStart.clear();
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      for (const char of this.state.teams[side].characters) {
        this.rosterSideAtActionStart.set(char.id, side);
        this.rosterCharAtActionStart.set(char.id, char);
      }
    }
    this.state.state = MatchState.Resolving;
    this.pendingExtraTurnSource = null;
    this.finishTurn(events);
    this.processDeathTriggers(events);
    this.recordBattleDeaths(events, this.rosterSideAtActionStart);
    return events;
  }

  /** 释放技能（需求 16）。兼容入口，内部走统一 BattleAction。 */
  castSkill(characterId: number): GameEvent[] {
    return this.resolveAction({ type: 'cast', characterId });
  }

  private castSkillAction(characterId: number): GameEvent[] {
    if (this.state.state !== MatchState.AwaitingInput) return [];

    const team = this.state.teams[this.state.activePlayer];
    const ch = team.characters.find((c) => c.id === characterId);
    if (!ch || ch.defeated) return [];

    if (!ManaDistributor.isSkillCastable(ch.mana, ch.manaCost)) {
      return []; // 法力不足，拒绝（需求 16.2）
    }

    // 沉默禁用技能释放；冰冻仅限制额外回合。
    if (!canCastSkill(ch)) return [];

    // once-per-battle（「此咒语只能使用一次」）：本场行动日志里已释放过同 id → 拒绝（不占号）
    // L3-009: native DisableMySpell targets Self — only this troop's own earlier cast disables it
    // (an enemy or another ally casting the same spell id does not).
    if (this.registry.prototypes.get(ch.skillId)?.oncePerBattle
      && this.state.actionLog.some((entry) => entry.skillId === ch.skillId
        && entry.side === this.state.activePlayer
        && entry.action.type === 'cast' && entry.action.characterId === ch.id)) {
      return [];
    }

    // Select the actual branch BEFORE mana, logs, triggers or RNG-consuming effects.
    // Legacy low-level effects retain precedence and do not ask unused prototype inputs.
    let selectedProto = this.registry.prototypes.get(ch.skillId);
    if (selectedProto && !this.registry.skills.has(ch.skillId)) {
      const choice = skillChoices(selectedProto);
      if (choice) {
        const selected = selectSkillBranch(selectedProto, this.branchChooser.choose(choice.labels, this.state, ch.id));
        if (!selected) return [];
        selectedProto = selected;
      }
    }

    // Resolve required target input before spending Mana or firing cast triggers.
    // A cancelled, stale, friendly or hidden selection is not a committed cast.
    let chosenTargetId: number | undefined;
    if (selectedProto && !this.registry.skills.has(ch.skillId)) {
      const mode = prototypeChosenTargetMode(selectedProto);
      if (mode) {
        const rngBeforeChoice = this.rng.getState();
        const selected = this.targetChooser.choose(mode, this.state, ch.id, this.rng);
        if (selected === null || !candidatesFor(mode, this.state, ch.id).some(c => c.id === selected)) {
          this.rng.setState(rngBeforeChoice);
          return [];
        }
        chosenTargetId = selected;
      }
    }

    // 所有前置校验通过后才进入解析态和消费法力。
    this.state.state = MatchState.Resolving;
    this.pendingExtraTurnSource = null;
    const logEntry = this.beginActionLog({ type: 'cast', characterId: ch.id }, ch.skillId);
    ch.mana = 0;

    // skill-cast 作为一次释放的首事件（需求 3.3）
    const events: GameEvent[] = [
      { type: 'skill-cast', characterId: ch.id, skillId: ch.skillId },
    ];
    // 附魔（GoW Enchanted）：施放法术即移除（官方「直到其施放法术」）。先于效果本体
    // 执行——法术若给自身重新附魔，新实例不被同一次施法消耗。
    // P-B-action-status-self-count: remember what was removed so the spell's own Count* steps still see it.
    const actionEndedStatusIds: string[] = [];
    if (hasStatus(ch, ENCHANTED_STATUS_ID)) {
      ch.statuses = ch.statuses.filter((s) => s.id !== ENCHANTED_STATUS_ID);
      events.push({ type: 'status-expire', targetId: ch.id, statusId: ENCHANTED_STATUS_ID, reason: 'cast' });
      actionEndedStatusIds.push(ENCHANTED_STATUS_ID);
    }
    // 潜水／祝福（R004）：持有者行动即移除；同样先于效果本体（自身重新施加的新实例保留）。
    const actionEnded = endActionStatuses(ch);
    for (const e of actionEnded) if (e.type === 'status-expire') actionEndedStatusIds.push(e.statusId);
    events.push(...actionEnded);
    // 位次条件光环（leader 族）：行动开始按当前编队位次补授（首位易主在此生效）
    events.push(...this.applyPositionAuraTriggers());
    // 施法响应特质（秘法/铭刻/怨恨…）：在技能效果之前结算，
    // 这样「敌人施法 +1 护甲」能挡下同一次施法的伤害，与官方手感一致。
    events.push(...applyCastTriggers(
      this.state.teams[this.state.activePlayer].characters,
      this.state.teams[opponentOf(this.state.activePlayer)].characters,
    ));
    // 施法随机状态（战斗机制批 goodtarot「使一名随机盟友陷入一个状态效果」/ badtarot）：
    // 与施法响应同一触发点；池按 scope 取阵营（盟友=正面池、敌人=负面池，同源 status.ts）。
    events.push(...applyCastRandomStatusTriggers(
      this.state.teams[this.state.activePlayer].characters,
      this.state.teams[opponentOf(this.state.activePlayer)].characters,
      {
        rng: this.rng,
        applyStatus: (char, status) => applyStatus(char, status),
        poolOf: (scope) => (scope === 'randomAlly' ? RANDOM_POSITIVE_STATUS_POOL : RANDOM_NEGATIVE_STATUS_POOL),
      },
    ));
    // 同队施法召唤/经济（职业天赋 childofsky「盟友施法时 25% 召唤」+ 惰性 soulverdict）：
    // 与施法响应同一触发点、行动方全队存活持有者逐个结算。
    events.push(...this.applyAllyCastTriggers());

    // 优先低层自定义 SkillEffect；否则查技能原型执行；都没有则仅产生空效果技能并照常回到等待输入。
    const effect = this.registry.skills.get(ch.skillId);
    if (effect) {
      events.push(...this.resolveDefeatWithRevive(effect.apply(this.state, ch.id)));
    } else {
      const proto = selectedProto;
      if (proto) {
        // 含选色段时先选色（需求 2）；无可选色 → chosenColor 为 undefined，相关段安全跳过
        // 原生 spell Target 限制（Not<X>OrSkullGems / ManaGemsOnly…）交给选择器（AI 遵守）
        const choiceRule = choiceRuleOf(proto);
        const chosenColor = prototypeNeedsColor(proto)
          ? this.colorChooser.choose(this.state, ch.id, choiceRule, proto) ?? undefined
          : undefined;
        // chosenTargetId was validated before committing this action.
        // 含"点选一枚宝石"的段时先选格（引爆某格 / 摧毁其所在行列共用此选择）
        const chosenCell = prototypeNeedsCell(proto)
          ? this.cellChooser.choose(this.state, ch.id, this.rng, choiceRule, proto, chosenColor) ?? undefined
          : undefined;
        // P-create-interleave: defer the settle of pure board rewrites to the end of the spell
        const settle = { pending: false };
        this.spellBoardSettle = settle;
        let produced: GameEvent[];
        try {
          // Append unlocked tempering effects after the selected branch without mutating the shared prototype.
          // The troop spellId and lower tempering levels retain their existing behavior.
          const wandAffixes = ch.skillId === 'gw_WandOfStars' ? [
            ...(Math.max(0, ch.temperingLevel ?? 0) >= 9 ? [armor('allySelf', 2, 0)] : []),
            ...(Math.max(0, ch.temperingLevel ?? 0) >= 10 ? [destroyRandomGems(1, 0, 'nonSkull')] : []),
          ] : [];
          produced = executePrototype(
            wandAffixes.length ? { ...proto, segments: [...proto.segments, ...wandAffixes] } : proto,
            this.makeEffectContext(ch.id, chosenColor, chosenTargetId, chosenCell, actionEndedStatusIds),
          );
        } finally {
          this.spellBoardSettle = null;
        }
        if (settle.pending) this.resolveBoardChange([], produced, this.state.activePlayer);
        events.push(...this.resolveDefeatWithRevive(produced));
        // 自己召唤部队后的触发（职业天赋 hauntedweave「当我召唤部队时，织网一名随机敌人」
        // 的施法路径）：法术含召唤段且实际产出了召唤 → 触发施法者自身的该被动。
        if (events.some((e) => e.type === 'summon')
          && proto.segments.some((seg) => (seg as { kind?: string }).kind === 'summon')) {
          events.push(...this.applySelfSummonStatus(ch));
        }
      }
    }

    // 合法施法消耗一次行动，复用交换的完整回合生命周期。额外回合在本次结算，
    // 不积存到后续行动；致胜先于换边，回合开始状态、风暴与日志均走统一入口。
    this.flushTraitExplosions(events);
    this.checkVictory(events);
    this.finishTurn(events);
    this.applyActionSummonTriggers(events);
    this.processDeathTriggers(events);
    this.endActionLog(logEntry, events);
    return events;
  }

  /**
   * 构建技能效果执行上下文，把引擎子系统经回调注入效果原语（需求 7.3, 10.2）：
   *   - resolveBoardChange：宝石操作后的法力/骷髅结算 + 重力 + 连锁
   *   - grantExtraTurn：额外回合信号（保留当前玩家回合）
   *   - nextGemId：创造宝石时分配稳定 id
   */
  private makeEffectContext(
    casterId: number,
    chosenColor?: BaseColor,
    chosenTargetId?: number,
    chosenCell?: CellPos,
    actionEndedStatusIds?: string[],
  ): EffectContext {
    const ctx: EffectContext = {
      state: this.state,
      casterId,
      rng: this.rng,
      nextGemId: this.nextGemId,
      resolveBoardChange: (destroyed, events, mode) => {
        // P-create-interleave (lane-L1 L1-6160): a pure board rewrite (create / transform / jumble,
        // nothing removed) does not settle mid-spell — native SpellSteps all run first, then the
        // board resolves. Removals (destroy / explode) still settle at once (mana, gravity, cascades).
        if (destroyed.length === 0 && this.spellBoardSettle) {
          this.spellBoardSettle.pending = true;
          return;
        }
        this.resolveBoardChange(destroyed, events, this.state.activePlayer, mode);
        if (this.spellBoardSettle) this.spellBoardSettle.pending = false;
      },
      grantExtraTurn: () => {
        this.pendingExtraTurnSource = 'skill';
      },
    };
    if (chosenColor !== undefined) ctx.chosenColor = chosenColor;
    if (chosenTargetId !== undefined) ctx.chosenTargetId = chosenTargetId;
    if (chosenCell !== undefined) ctx.chosenCell = chosenCell;
    if (actionEndedStatusIds && actionEndedStatusIds.length > 0) ctx.actionEndedStatusIds = actionEndedStatusIds;
    if (this.summonResolver) ctx.resolveSummonRef = this.summonResolver;
    if (this.summonKingdomResolver) ctx.resolveKingdomSummonRefs = this.summonKingdomResolver;
    return ctx;
  }
}
