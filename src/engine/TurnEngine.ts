import { BoardModel } from './BoardModel';
import { MatchResolver, grantsExtraTurn } from './MatchResolver';
import type { MatchGroup } from './MatchResolver';
import { GravitySystem, STORM_DROP_WEIGHT, STORM_DOOMSKULL_DROP, STORM_UBER_DOOMSKULL_DROP } from './GravitySystem';
import type { SkullDropBoost } from './GravitySystem';
import { ManaDistributor } from './ManaDistributor';
import { CombatResolver } from './CombatResolver';
import { ExtensionRegistry } from './registry';
import { SeededRNG } from './rng';
import { reshuffle, hasLegalSwap } from './boardUtils';
import { tickTeamStatuses, canCastSkill, applyStatus, canGainMana, WEB_STATUS_ID } from './skills/effects/status';
import { executePrototype } from './skills/prototypes';
import { damageOne } from './skills/effects/damage';
import { applyStormToTeam } from './skills/effects/storm';
import type { EffectContext, DestroyedGem } from './skills/effects/context';
import type { SummonTemplate } from './skills/effects/summon';
import { AiColorChooser, prototypeNeedsColor } from './skills/colorChooser';
import type { ColorChooser } from './skills/colorChooser';
import { AiTargetChooser, prototypeChosenTargetMode } from './skills/targetChooser';
import type { TargetChooser } from './skills/targetChooser';
import { AiCellChooser, prototypeNeedsCell } from './skills/cellChooser';
import type { CellChooser } from './skills/cellChooser';
import { MatchState, PlayerSide, BaseColor, opponentOf, colorGem, WEB_GEM_TURNS,
  MATCH_STATUS_GEMS, DESTROY_STATUS_GEMS, STATUS_GEM_EFFECTS, isStatusGemKind, BOOTY_GEM_GOLD } from './types';
import type { SkullStormDropKind, StatusGemKind, StatusInstance, TraitEconomyGain } from './types';

/**
 * 被炸毁骷髅的法术伤害表（官方口径，区别于三消骷髅的攻击力结算）：
 * 普通骷髅 1 / 末日骷髅 5 / 至尊末日骷髅 10。
 * 查证来源：TrueTrophies 官方攻略（Heroic Gems 节）+ Steam 社区专家帖复核。
 */
const EXPLODED_SKULL_DAMAGE = { normal: 1, doom: 5, uber: 10 } as const;
import type { ActionLogEntry, BattleAction, CellPos, GemType, Character } from './types';
import type { GameState } from './GameState';
import { resolveDefeatEvents, summonQueueOf, MAX_ACTIVE_TEAM_SIZE } from './teamRoster';
import {
  applyBattleStartTraits,
  collectBattleStartStorms,
  applyBigMatchTriggers,
  applyCastTriggers,
  applyColorMatchTriggers,
  applyDeathSummons,
  applyDeathTriggers,
  applyEnemyDeathTriggers,
  applyTurnStartPassives,
  attachPassives,
  getTrait,
  passivesOf,
} from './traits';
import type { DeathSummonSpec } from './traits';
import type {
  GameEvent,
  EliminationEvent,
  SpecialGemHookEvent,
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

  private nextGemId: () => number;
  /** 选色器（需求 2）：技能含 'CHOSEN' 时用它选色；默认 AI 策略 */
  private colorChooser: ColorChooser = new AiColorChooser();
  /** 目标选择器：技能含手动选目标段时用它选目标；默认 AI 策略 */
  private targetChooser: TargetChooser = new AiTargetChooser();
  /** 选格器：技能含"点选一枚宝石"的段（引爆某格 / 摧毁其所在行列）时用它；默认 AI 策略 */
  private cellChooser: CellChooser = new AiCellChooser();
  /** 召唤物 referenceName → 属性模板 解析器（需求 7）；默认无（ref/randomOf 来源将安全跳过） */
  private summonResolver: ((referenceName: string) => SummonTemplate | null) | null = null;
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
   * 条件经济光环入账口（条件经济批，注入 traits 触发器 ctx/opts.gainEconomy）：
   * 灵魂/黄金/宝石直接入战场经济池（GameState.economy，全场共用），发既有
   * economy-gain 事件（不新增事件类型）；side 记录获得发生时的行动方。
   */
  private readonly creditEconomy = (currency: keyof TraitEconomyGain, amount: number): GameEvent[] => {
    this.state.economy[currency] += amount;
    return [{ type: 'economy-gain', currency, amount, side: this.state.activePlayer }];
  };

  constructor(
    private state: GameState,
    private rng: SeededRNG,
    nextGemId: () => number,
    private registry: ExtensionRegistry = new ExtensionRegistry(),
  ) {
    this.nextGemId = nextGemId;
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
    // 战斗开始的一次性特质（全体光环、按颜色计数光环、开局法力）。
    // 事件流此时还没开始，交由表现层首次刷新卡面时读取。
    applyBattleStartTraits(
      state.teams[PlayerSide.Left].characters,
      state.teams[PlayerSide.Right].characters,
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
  }

  /** 取出构造阶段的开局事件；只消费一次。 */
  takeInitialEvents(): GameEvent[] {
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
        for (const code of char.traitIds ?? []) {
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
          this.state.board.set(pos, null);
          this.resolveBoardChange([{ gemType: gem.type, pos }], events, side);
        }
      }
    }
    return events;
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
  setCellChooser(chooser: CellChooser): void {
    this.cellChooser = chooser;
  }

  /** 注入召唤物解析器（装配层从 troops 数据提供） */
  setSummonResolver(resolver: (referenceName: string) => SummonTemplate | null): void {
    this.summonResolver = resolver;
  }

  getState(): GameState {
    return this.state;
  }

  /**
   * 统一执行一次交换或施法行动。旧的 resolveSwap/castSkill 保留为兼容薄包装，
   * 玩家与 AI 可逐步迁移到此入口而不复制回合生命周期。
   */
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

  /** 回合尾结算完成后回填回合归属。GameOver 优先于额外回合。 */
  private endActionLog(entry: ActionLogEntry, freeAction = false): void {
    if (this.state.state === MatchState.GameOver) entry.outcome = 'game-over';
    else if (freeAction) entry.outcome = 'held'; // 释放技能不消耗回合：行动方未变，也不是额外回合
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
    this.runCascades(events);
    this.finishTurn(events);
    this.processDeathTriggers(events);
    this.endActionLog(logEntry);
    return events;
  }

  /** 连锁主循环（需求 8.5-8.9, 18.2, 18.3） */
  private runCascades(events: GameEvent[]): void {
    this.state.chainCount = 0;
    let grantedExtra = false;

    for (;;) {
      const matches = this.resolver.findMatches(this.state.board);
      if (matches.length === 0) break;

      this.state.chainCount += 1;
      const chain = this.state.chainCount;

      // 1. 消除：发出 elimination 事件，并按组结算效果；登记特殊宝石"被匹配"触发
      const destroyTriggers: { gemType: GemType; pos: CellPos; viaMatch: boolean }[] = [];
      for (const group of matches) {
        events.push(this.makeEliminationEvent(group, chain));
        if (grantsExtraTurn(group.shape)) grantedExtra = true;

        // 4/5 连响应特质（庞然/巨型/修理…）：只给匹配方自己一队，按组结算。
        // ctx 只服务条件光环批新键（施加状态/5 连限定/净化/条件经济）；旧特质路径零随机消耗、事件序不变。
        if (group.cells.length >= 4) {
          events.push(...applyBigMatchTriggers(
            this.state.teams[this.state.activePlayer].characters,
            {
              size: group.cells.length,
              rng: this.rng,
              applyStatus: (char, status) => applyStatus(char, status),
              enemyTeam: this.state.teams[opponentOf(this.state.activePlayer)].characters,
              gainEconomy: this.creditEconomy,
            },
          ));
        }

        // 特殊宝石钩子（需求 7.4, 7.5）—— 仅标记不生成
        if (group.shape === 'T' || group.shape === 'L' || group.cells.length >= 5) {
          const hook: SpecialGemHookEvent = {
            type: 'special-gem-hook',
            pos: group.cells[0],
            reason: group.cells.length >= 5 ? 'match5' : group.shape === 'L' ? 'L' : 'T',
          };
          events.push(hook);
        }

        // 结算法力 / 骷髅伤害（颜色组含通配倍率；骷髅组含末日骷髅加伤）
        this.applyGroupEffects(group, events);

        // 特殊宝石"被匹配"触发：织网/沙漏即时结算；末日骷髅/闪电的破坏登记到
        // destroyTriggers，统一在全部组移除后引爆（避免提前清掉同迭代其他组的宝石造成双重结算）
        this.collectMatchTriggers(group, destroyTriggers, events);
      }

      // 2. 从棋盘移除被消除的宝石
      for (const group of matches) {
        for (const cell of group.cells) {
          this.state.board.set(cell, null);
        }
      }

      // 3. 特殊宝石破坏链：末日骷髅引爆相邻一圈 / 闪电清整行整列，
      //    以及连带的炸弹/闪电/许愿连锁；链上摧毁照常结算法力/骷髅
      this.settleDestroyed(this.expandSpecialDestruction(destroyTriggers, events), events);

      // 4. 胜负检查：某队全灭即结束（需求 15.3）
      if (this.checkVictory(events)) return;

      // 5. 重力 + 补充（需求 8.1-8.4）；风暴激活时对应色按 STORM_DROP_WEIGHT 加权
      const result = this.gravity.apply(this.state.board, this.skullChance, this.stormDropWeights(), this.stormSkullDrop());
      events.push({ type: 'gravity', chainCount: chain, moves: result.moves });
      events.push({ type: 'refill', chainCount: chain, spawns: result.spawns });
      // 循环：再次检测匹配（需求 8.5, 8.6）
    }

    // 记录本回合是否由匹配获得额外回合。技能主动授予的优先保留 skill 来源，
    // 因为效果原语已经发出 source:'skill' 的展示事件。
    if (grantedExtra && this.pendingExtraTurnSource === null) {
      this.pendingExtraTurnSource = 'match';
    }
  }

  private pendingExtraTurnSource: 'match' | 'skill' | null = null;

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
      // 颜色 → 产生法力，数量 = 宝石数 × 通配倍率（需求 11.1）
      events.push(
        ...this.mana.distribute(activeTeam, this.state.activePlayer, settle.color, group.cells.length * settle.manaMultiplier),
      );
      // 配色触发特质（食人魔之怒/阳光…）：匹配到关联色时给匹配方全队加值。
      // 每次结算算一次，与消除的宝石数无关——描述是「在配对X色宝石时」，不是「每颗」。
      // enemyTeam 供敌方配色触发（rancor「在敌人配对骷髅头时…」族，颜色键同理）；
      // rng/applyStatus 供配色施加状态（molten/sunfire 族「使随机一名敌人陷入Y状态」，
      // 无新键特质零随机消耗、事件序不变）。
      events.push(...applyColorMatchTriggers(activeTeam.characters, settle.color, {
        enemyTeam: this.state.teams[opponentOf(this.state.activePlayer)].characters,
        rng: this.rng,
        applyStatus: (char, status) => applyStatus(char, status),
      }));
    } else if (settle.kind === 'skull') {
      // 骷髅 → 物理伤害（需求 14），不产生法力（需求 11.2）
      const enemyTeam = this.state.teams[opponentOf(this.state.activePlayer)];
      // 传入 rng：闪避特质（敏捷/轻巧）需要随机判定，且必须走同一条确定性随机源
      const outcome = this.combat.resolveSkullDamage(
        activeTeam,
        enemyTeam,
        group.cells.length,
        this.rng,
        settle.bonusDamage,
      );
      events.push(...resolveDefeatEvents(this.state, outcome.events));
      // 配对骷髅触发（diamondaura/powerofstars 配色光环、rancor 敌方触发、darkensouls
      // 条件经济）：在骷髅伤害结算之后触发，避免同一次命中被本次新增的护甲/生命减免——
      // 炸毁骷髅（settleExplodedSkulls）不算「配对」，不在此列。rng/applyStatus 同配色点
      // （onColorMatchStatus 定义允许 'skull' 色键，现无数据、注入零消耗）。
      events.push(...applyColorMatchTriggers(activeTeam.characters, 'skull', {
        enemyTeam: enemyTeam.characters,
        gainEconomy: this.creditEconomy,
        rng: this.rng,
        applyStatus: (char, status) => applyStatus(char, status),
      }));
    }
    // 'wildOnly'：全通配组无归属色，只消除不结算
  }

  /**
   * 特殊宝石"被匹配"触发（宝石此刻仍在盘上，移除发生在组循环之后）：
   *   - 末日骷髅 / 闪电：破坏型，登记到 destroyTriggers 统一引爆（见 runCascades 步骤 3）
   *   - 织网：随机一名存活敌人获得 web 状态
   *   - 沙漏：本方获得一次额外回合
   *   - 「被匹配」型状态宝石（燃烧/冻结/诅咒/毒/恐怖）：即时施加（GEMS-SEMANTICS-2 A 组）
   *   - 「被摧毁」型状态宝石（流血/缠绕/打昏/屏障/激怒/沉没/精灵火）：被匹配同样视为
   *     被摧毁（A 组共性），登记到 destroyTriggers 走摧毁链统一施加
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
      if (kind === 'doomSkull' || kind === 'uberDoomSkull' || kind === 'lightningRow' || kind === 'lightningCol') {
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
      }
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
   * 许愿→5 选 1 随机回蓝；末日骷髅仅在 viaMatch（匹配路径登记）时引爆相邻一圈。
   * 链上新摧毁的宝石继续入队（炸弹可连环引爆）。
   *
   * `initial` 里 viaMatch 的宝石视为匹配触发的登记（已被随组移除并结算，只触发其效果），
   * 其余视为已被调用方移除且已结算；返回链上新摧毁的宝石，由调用方统一结算法力/骷髅。
   * 确定性：处理顺序与格子遍历序固定，随机只走 this.rng（需求 17.3）。
   */
  private expandSpecialDestruction(
    initial: ReadonlyArray<{ gemType: GemType; pos?: CellPos; viaMatch?: boolean }>,
    events: GameEvent[],
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
      } else if (kind === 'doomSkull' || kind === 'uberDoomSkull') {
        // 末日骷髅/至尊末日骷髅只在"被匹配"时引爆；被摧毁（炸弹波及等）静默移除
        if (!d.viaMatch) continue;
        events.push({ type: 'special-gem-trigger', kind, pos: d.pos });
        this.clearCellsForSpecial(this.ringCells(d.pos), 'gem-explode', events, queue, chain);
      } else if (kind === 'lightningRow' || kind === 'lightningCol') {
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
        // 不可匹配（SPECIAL_MATCH_COLOR 无键），只能经清除管线/末日骷髅爆炸圈抵达这里。
        events.push({ type: 'special-gem-trigger', kind: 'bootyGem', pos: d.pos });
        this.state.economy.gold += BOOTY_GEM_GOLD;
        events.push({
          type: 'economy-gain', currency: 'gold', amount: BOOTY_GEM_GOLD, side: this.state.activePlayer,
        });
      } else if (isStatusGemKind(kind) && DESTROY_STATUS_GEMS.has(kind)) {
        // 「被摧毁」型状态宝石（流血/缠绕/打昏/屏障/激怒/沉没/精灵火/死亡标记）：
        // 被技能清除/爆破波及/匹配三路都汇到这里，按考证规格施加状态（不清相邻格）。
        // 「被匹配」型（燃烧/冻结/诅咒/毒/恐怖）被普通摧毁不触发——官方文本只写 When matched。
        this.applyStatusGem(kind, d.pos, events);
      }
      // ghost/wildcard：无"被摧毁"触发（wildcard 倍率在组结算里；ghost 语义待定无行为）
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
      events.push({ type: 'buff', targetId: t.id, stat: 'mana', amount: gain });
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
  ): void {
    if (destroyed.length === 0) return;
    const colorCounts = new Map<string, { type: GemType; n: number }>();
    let skullCount = 0;
    let doomCount = 0;
    let uberCount = 0;
    const skullCells: CellPos[] = [];
    for (const d of destroyed) {
      if (d.gemType.kind === 'color') {
        const key = d.gemType.color;
        const cur = colorCounts.get(key) ?? { type: d.gemType, n: 0 };
        cur.n += 1;
        colorCounts.set(key, cur);
      } else if (d.gemType.kind === 'skull') {
        skullCount += 1;
        if (d.pos) skullCells.push(d.pos);
      } else if (d.gemType.kind === 'special') {
        // 被炸毁的末日/至尊末日骷髅：不引爆（引爆环只在被匹配时触发），
        // 但按官方口径造成炸毁伤害（5/10 点，见 settleExplodedSkulls）
        if (d.gemType.spec.kind === 'doomSkull') {
          doomCount += 1;
          if (d.pos) skullCells.push(d.pos);
        } else if (d.gemType.spec.kind === 'uberDoomSkull') {
          uberCount += 1;
          if (d.pos) skullCells.push(d.pos);
        }
      }
    }
    for (const { type, n } of colorCounts.values()) this.settleGems(type, n, events, side);
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
    const sourceId = CombatResolver.frontAlive(this.state.teams[side])?.id ?? 0;
    const produced = damageOne(target, sourceId, total, false, 'single');
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
      // 颜色 → 产生法力，数量 = 宝石数（需求 11.1）
      events.push(
        ...this.mana.distribute(activeTeam, side, gemType.color, count),
      );
      // 配色触发特质（食人魔之怒/阳光…）：匹配到关联色时给结算归属方全队加值。
      // 每次结算算一次，与消除的宝石数无关——描述是「在配对X色宝石时」，不是「每颗」。
      // enemyTeam 供敌方配色触发（rancor 族）；rng/applyStatus 供配色施加状态（molten 族）。
      events.push(...applyColorMatchTriggers(activeTeam.characters, gemType.color, {
        enemyTeam: this.state.teams[opponentOf(side)].characters,
        rng: this.rng,
        applyStatus: (char, status) => applyStatus(char, status),
      }));
    } else if (gemType.kind === 'skull') {
      // 骷髅 → 物理伤害（需求 14），不产生法力（需求 11.2）
      const enemyTeam = this.state.teams[opponentOf(side)];
      // 传入 rng：闪避特质（敏捷/轻巧）需要随机判定，且必须走同一条确定性随机源
      const outcome = this.combat.resolveSkullDamage(activeTeam, enemyTeam, count, this.rng);
      events.push(...resolveDefeatEvents(this.state, outcome.events));
      // 配对骷髅触发（diamondaura/powerofstars/rancor/darkensouls 族），在伤害结算之后（同 applyGroupEffects 口径）
      events.push(...applyColorMatchTriggers(activeTeam.characters, 'skull', {
        enemyTeam: enemyTeam.characters,
        gainEconomy: this.creditEconomy,
        rng: this.rng,
        applyStatus: (char, status) => applyStatus(char, status),
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
  ): void {
    // 1. 特殊宝石"被摧毁"触发链（炸弹/闪电/许愿；末日骷髅只在被匹配时引爆）
    const chain = this.expandSpecialDestruction(destroyed, events);

    // 2. 被直接摧毁宝石的法力/骷髅结算：按类型归并数量（含链上新摧毁的）
    this.settleDestroyed([...destroyed, ...chain], events, side);

    // 2. 重力 + 补充（风暴激活时对应色加权）
    const result = this.gravity.apply(this.state.board, this.skullChance, this.stormDropWeights(), this.stormSkullDrop());
    if (result.moves.length > 0 || result.spawns.length > 0) {
      const chain = this.state.chainCount;
      events.push({ type: 'gravity', chainCount: chain, moves: result.moves });
      events.push({ type: 'refill', chainCount: chain, spawns: result.spawns });
    }

    // 3. 解析由此产生的连锁
    this.runCascades(events);
  }

  /**
   * 回合开始的棋盘写入类特质：把随机一格变成指定颜色，或按概率把某色转成骷髅头。
   *
   * 改完棋盘后**立即** `runCascades()`：三连就该被消掉，不能把现成匹配滞留到下一次行动。
   * 连锁产出的法力与骷髅伤害都归即将行动的这一方，符合「我的回合开始」的语义。
   *
   * 只支持颜色宝石与骷髅头——织网/幽魂/沙漏这类特殊宝石引擎还没有，相关特质在
   * 生成阶段就被排除，不会走到这里。
   *
   * @returns 是否改动过棋盘（调用方据此决定是否补一次胜负判定）
   */
  private applyTurnStartBoardTraits(events: GameEvent[]): boolean {
    const team = this.state.teams[this.state.activePlayer].characters;
    const changes: GemTransformEvent['changes'] = [];

    for (const char of team) {
      if (char.defeated) continue;
      for (const code of char.traitIds ?? []) {
        const trait = getTrait(code);
        if (trait?.turnStartCreateGem) {
          const pos = this.randomCell();
          const from = this.state.board.get(pos);
          if (from) {
            const to = colorGem(trait.turnStartCreateGem.color as BaseColor);
            const gemId = this.nextGemId();
            this.state.board.set(pos, { id: gemId, type: to });
            changes.push({ pos, gemId, from: from.type, to });
          }
        }
        if (trait?.turnStartColorToSkull && this.rng.next() < trait.turnStartColorToSkull.chance) {
          const pos = this.randomCellOfColor(trait.turnStartColorToSkull.color as BaseColor);
          const from = pos ? this.state.board.get(pos) : null;
          if (pos && from) {
            const to: GemType = { kind: 'skull', variant: 'normal' };
            const gemId = this.nextGemId();
            this.state.board.set(pos, { id: gemId, type: to });
            changes.push({ pos, gemId, from: from.type, to });
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
      //（战场经济池全场共用，economy-gain 的 side 记行动方），每名死者至多入账一次。
      const dead = this.rosterCharAtActionStart.get(id);
      const deathEco = dead ? passivesOf(dead).onDeathEconomy : undefined;
      if (deathEco) events.push(...this.creditEconomy(deathEco.currency, deathEco.amount));
      events.push(...applyDeathTriggers(
        this.state.teams[side].characters,
        this.state.teams[opponentOf(side)].characters,
      ));
      // 敌人身亡的状态/种族光环变体（bloodlust/lordofdeath/sharedfate）：与阵亡响应同一时机。
      // 事件顺序：stat 增益 → 状态/种族光环 → 死亡召唤，都落在引发阵亡的行动事件之后。
      events.push(...applyEnemyDeathTriggers(
        this.state.teams[opponentOf(side)].characters,
        this.state.teams[side].characters,
        { applyStatus },
      ));
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

    return applyDeathSummons(specs, {
      deadId,
      nextCharId: () => this.nextCharId(),
      rng: this.rng,
      enqueue: (summoned, troopId, side) => this.enqueueSummon(summoned, troopId, side),
      setStorm: (spec, side) => this.setStormFromSummon(spec, side),
    });
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
    return applyStormToTeam(this.state, side, {
      color: payload.color,
      turns: payload.turns,
      troopId: spec.troopId,
      dropKind: payload.dropKind,
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
      if (storm && !storm.dropKind) return new Map([[storm.color, STORM_DROP_WEIGHT]]);
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
    let max = 0;
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      for (const c of this.state.teams[side].characters) {
        if (c.id > max) max = c.id;
      }
      for (const q of this.state.teams[side].summonQueue ?? []) {
        if (q.character.id > max) max = q.character.id;
      }
    }
    return max + 1;
  }

  /** 已完成 id 分配的召唤物入队：有空位进场上，否则进 FIFO 队列（与 summon 技能效果同一语义） */
  private enqueueSummon(summoned: Character, troopId: number, side: PlayerSide): GameEvent[] {
    const team = this.state.teams[side];
    team.characters = team.characters.filter((c) => !c.defeated);
    if (team.characters.length < MAX_ACTIVE_TEAM_SIZE) {
      team.characters.push(summoned);
      return [{
        type: 'summon', player: side, slot: team.characters.length - 1,
        troopId, characterId: summoned.id, destination: 'field',
      }];
    }
    const queue = summonQueueOf(team);
    queue.push({ character: summoned, troopId });
    return [{
      type: 'summon', player: side, slot: queue.length - 1,
      troopId, characterId: summoned.id, destination: 'queue',
    }];
  }

  /** 检查胜负，若结束则发出 game-over 并置状态（需求 15.3, 15.4）。
   * 全队 fled 的判定由移出管线天然覆盖：逃跑者已 splice 出编队，全逃光的队伍
   * characters 为空 → isWipedOut 成立 → 按败北结算（DECISIONS 四项拍板③）。 */
  private checkVictory(events: GameEvent[]): boolean {
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      if (CombatResolver.isWipedOut(this.state.teams[side])) {
        // 战后经济钩子（merchant/necromancy 族）：只在本场首次判出胜负时放大一次。
        if (this.state.winner === null) {
          const { gold, souls } = this.economyGainRatios;
          if (gold > 0) this.state.economy.gold = Math.floor(this.state.economy.gold * (1 + gold));
          if (souls > 0) this.state.economy.souls = Math.floor(this.state.economy.souls * (1 + souls));
        }
        const winner = opponentOf(side);
        this.state.state = MatchState.GameOver;
        this.state.winner = winner;
        events.push({ type: 'game-over', winner });
        return true;
      }
    }
    return false;
  }

  /** 结算回合归属（需求 9.1, 9.2, 9.3） */
  private finishTurn(events: GameEvent[]): void {
    if (this.state.state === MatchState.GameOver) return;

    if (this.pendingExtraTurnSource !== null) {
      // 技能额外回合的 source:'skill' 事件已由效果原语发出；匹配额外回合在这里发一次。
      if (this.pendingExtraTurnSource === 'match') {
        events.push({ type: 'extra-turn', player: this.state.activePlayer, source: 'match' });
      }
    } else {
      // 交给对手（需求 9.1）
      const next = opponentOf(this.state.activePlayer);
      this.state.activePlayer = next;
      events.push({ type: 'turn-end', nextPlayer: next });
    }
    this.pendingExtraTurnSource = null;

    // 回合开始的被动恢复（再生）：先于 DoT 结算，顺序固定以保证确定性
    events.push(...applyTurnStartPassives(this.state.teams[this.state.activePlayer].characters));

    // 状态结算：对「即将行动方」的角色触发（DoT 扣血 / 织网挣脱 / 到期移除，需求 9.2, 9.4, 9.5）
    events.push(
      ...resolveDefeatEvents(
        this.state,
        tickTeamStatuses(this.state.teams[this.state.activePlayer].characters, this.rng),
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
    this.state.state = MatchState.Resolving;
    this.pendingExtraTurnSource = null;
    this.finishTurn(events);
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

    // 控制类状态：沉默/冰冻禁用技能释放。
    if (!canCastSkill(ch)) return [];

    // once-per-battle（「此咒语只能使用一次」）：本场行动日志里已释放过同 id → 拒绝（不占号）
    if (this.registry.prototypes.get(ch.skillId)?.oncePerBattle
      && this.state.actionLog.some((entry) => entry.skillId === ch.skillId)) {
      return [];
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
    // 施法响应特质（秘法/铭刻/怨恨…）：在技能效果之前结算，
    // 这样「敌人施法 +1 护甲」能挡下同一次施法的伤害，与官方手感一致。
    events.push(...applyCastTriggers(
      this.state.teams[this.state.activePlayer].characters,
      this.state.teams[opponentOf(this.state.activePlayer)].characters,
    ));

    // 优先低层自定义 SkillEffect；否则查技能原型执行；都没有则仅产生空效果技能并照常回到等待输入。
    const effect = this.registry.skills.get(ch.skillId);
    if (effect) {
      events.push(...resolveDefeatEvents(this.state, effect.apply(this.state, ch.id)));
    } else {
      const proto = this.registry.prototypes.get(ch.skillId);
      if (proto) {
        // 含选色段时先选色（需求 2）；无可选色 → chosenColor 为 undefined，相关段安全跳过
        const chosenColor = prototypeNeedsColor(proto)
          ? this.colorChooser.choose(this.state, ch.id) ?? undefined
          : undefined;
        // 含手动选目标段时先选目标；无候选 → undefined，相关段安全跳过
        const chosenMode = prototypeChosenTargetMode(proto);
        const chosenTargetId = chosenMode
          ? this.targetChooser.choose(chosenMode, this.state, ch.id, this.rng) ?? undefined
          : undefined;
        // 含"点选一枚宝石"的段时先选格（引爆某格 / 摧毁其所在行列共用此选择）
        const chosenCell = prototypeNeedsCell(proto)
          ? this.cellChooser.choose(this.state, ch.id, this.rng) ?? undefined
          : undefined;
        events.push(
          ...resolveDefeatEvents(
            this.state,
            executePrototype(
              proto,
              this.makeEffectContext(ch.id, chosenColor, chosenTargetId, chosenCell),
            ),
          ),
        );
      }
    }

    // 释放技能不消耗回合（用户裁定，对齐 GoW）：不切换行动方、不做回合尾结算
    // （回合开始被动 / DoT / 风暴递减均属换边后的回合尾流程）。致胜仍立即判定；
    // 技能可能改写盘面（创造/转化宝石），死局重排检测保留，随后直接回到等待输入。
    // 「额外回合」技能的 pendingExtraTurnSource 保留到下一次交换行动的回合尾生效——
    // 即施放免费、下一次行动后仍不换边（再行动一次）。
    const gameOver = this.checkVictory(events);
    if (!gameOver) {
      if (this.state.board.isFull() && !hasLegalSwap(this.state.board)) {
        const moves = reshuffle(this.state.board, this.rng);
        events.push({ type: 'reshuffle', moves });
        if (this.resolver.hasAnyMatch(this.state.board)) {
          this.runCascades(events);
          this.checkVictory(events);
        }
      }
      this.state.state = MatchState.AwaitingInput;
    }
    this.processDeathTriggers(events);
    this.endActionLog(logEntry, true);
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
  ): EffectContext {
    const ctx: EffectContext = {
      state: this.state,
      casterId,
      rng: this.rng,
      nextGemId: this.nextGemId,
      resolveBoardChange: (destroyed, events) => this.resolveBoardChange(destroyed, events),
      grantExtraTurn: () => {
        this.pendingExtraTurnSource = 'skill';
      },
    };
    if (chosenColor !== undefined) ctx.chosenColor = chosenColor;
    if (chosenTargetId !== undefined) ctx.chosenTargetId = chosenTargetId;
    if (chosenCell !== undefined) ctx.chosenCell = chosenCell;
    if (this.summonResolver) ctx.resolveSummonRef = this.summonResolver;
    return ctx;
  }
}
