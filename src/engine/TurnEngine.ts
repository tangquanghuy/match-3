import { BoardModel } from './BoardModel';
import { MatchResolver, grantsExtraTurn } from './MatchResolver';
import type { MatchGroup } from './MatchResolver';
import { GravitySystem } from './GravitySystem';
import { ManaDistributor } from './ManaDistributor';
import { CombatResolver } from './CombatResolver';
import { ExtensionRegistry } from './registry';
import { SeededRNG } from './rng';
import { reshuffle, hasLegalSwap } from './boardUtils';
import { tickTeamStatuses, canCastSkill } from './skills/effects/status';
import { executePrototype } from './skills/prototypes';
import type { EffectContext } from './skills/effects/context';
import type { SummonTemplate } from './skills/effects/summon';
import { AiColorChooser, prototypeNeedsColor } from './skills/colorChooser';
import type { ColorChooser } from './skills/colorChooser';
import { AiTargetChooser, prototypeChosenTargetMode } from './skills/targetChooser';
import type { TargetChooser } from './skills/targetChooser';
import { AiCellChooser, prototypeNeedsCell } from './skills/cellChooser';
import type { CellChooser } from './skills/cellChooser';
import { MatchState, PlayerSide, opponentOf, colorGem } from './types';
import type { ActionLogEntry, BattleAction, CellPos, GemType, BaseColor } from './types';
import type { GameState } from './GameState';
import { resolveDefeatEvents } from './teamRoster';
import {
  applyBattleStartTraits,
  applyBigMatchTriggers,
  applyCastTriggers,
  applyColorMatchTriggers,
  applyDeathTriggers,
  applyTurnStartPassives,
  attachPassives,
  getTrait,
} from './traits';
import type {
  GameEvent,
  EliminationEvent,
  SpecialGemHookEvent,
  GemTransformEvent,
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
    // 战斗开始的一次性特质（全体光环、按颜色计数光环、开局法力）。
    // 事件流此时还没开始，交由表现层首次刷新卡面时读取。
    applyBattleStartTraits(
      state.teams[PlayerSide.Left].characters,
      state.teams[PlayerSide.Right].characters,
    );
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
    // 行动受理的同一时刻记下编队归属：阵亡者会在结算过程中被移出编队，
    // 到行动末尾结算阵亡响应特质时只能靠这份快照判定它属于哪一方。
    this.rosterSideAtActionStart.clear();
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      for (const ch of this.state.teams[side].characters) {
        this.rosterSideAtActionStart.set(ch.id, side);
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
  private endActionLog(entry: ActionLogEntry): void {
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

      // 1. 消除：发出 elimination 事件，并按组结算效果
      for (const group of matches) {
        events.push(this.makeEliminationEvent(group, chain));
        if (grantsExtraTurn(group.shape)) grantedExtra = true;

        // 4/5 连响应特质（庞然/巨型/修理…）：只给匹配方自己一队，按组结算
        if (group.cells.length >= 4) {
          events.push(...applyBigMatchTriggers(
            this.state.teams[this.state.activePlayer].characters,
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

        // 结算法力 / 骷髅伤害
        this.applyGroupEffects(group, events);
      }

      // 2. 从棋盘移除被消除的宝石
      for (const group of matches) {
        for (const cell of group.cells) {
          this.state.board.set(cell, null);
        }
      }

      // 3. 胜负检查：某队全灭即结束（需求 15.3）
      if (this.checkVictory(events)) return;

      // 4. 重力 + 补充（需求 8.1-8.4）
      const result = this.gravity.apply(this.state.board, this.skullChance);
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

  /** 结算一个消除组的法力或骷髅伤害（需求 11, 12, 14） */
  private applyGroupEffects(group: MatchGroup, events: GameEvent[]): void {
    this.settleGems(group.gemType, group.cells.length, events);
  }

  /**
   * 按宝石类型与数量结算法力/骷髅伤害（消除组与技能直接摧毁共用，需求 11, 12, 14）。
   * @param gemType 该批宝石的类型（同色或骷髅）
   * @param count   宝石数量
   */
  private settleGems(gemType: GemType, count: number, events: GameEvent[]): void {
    const activeTeam = this.state.teams[this.state.activePlayer];
    if (gemType.kind === 'color') {
      // 颜色 → 产生法力，数量 = 宝石数（需求 11.1）
      events.push(
        ...this.mana.distribute(activeTeam, this.state.activePlayer, gemType.color, count),
      );
      // 配色触发特质（食人魔之怒/阳光…）：匹配到关联色时给匹配方全队加值。
      // 每次结算算一次，与消除的宝石数无关——描述是「在配对X色宝石时」，不是「每颗」。
      events.push(...applyColorMatchTriggers(activeTeam.characters, gemType.color));
    } else if (gemType.kind === 'skull') {
      // 骷髅 → 物理伤害（需求 14），不产生法力（需求 11.2）
      const enemyTeam = this.state.teams[opponentOf(this.state.activePlayer)];
      // 传入 rng：闪避特质（敏捷/轻巧）需要随机判定，且必须走同一条确定性随机源
      const outcome = this.combat.resolveSkullDamage(activeTeam, enemyTeam, count, this.rng);
      events.push(...resolveDefeatEvents(this.state, outcome.events));
    }
  }

  /**
   * 技能宝石操作后的棋盘结算（需求 7.3, 7.5），供效果原语经 EffectContext 调用：
   *   1. 结算被直接摧毁宝石的法力/骷髅（每类各按数量合并结算）
   *   2. 重力下落 + 顶部补充
   *   3. 解析由此产生的新匹配作为连锁（含其法力/骷髅结算）
   * 直接把事件追加进传入的 events。
   */
  resolveBoardChange(destroyed: { gemType: GemType }[], events: GameEvent[]): void {
    // 1. 被直接摧毁宝石的法力/骷髅结算：按类型归并数量
    if (destroyed.length > 0) {
      const colorCounts = new Map<string, { type: GemType; n: number }>();
      let skullCount = 0;
      for (const d of destroyed) {
        if (d.gemType.kind === 'color') {
          const key = d.gemType.color;
          const cur = colorCounts.get(key) ?? { type: d.gemType, n: 0 };
          cur.n += 1;
          colorCounts.set(key, cur);
        } else if (d.gemType.kind === 'skull') {
          skullCount += 1;
        }
      }
      for (const { type, n } of colorCounts.values()) this.settleGems(type, n, events);
      if (skullCount > 0) this.settleGems({ kind: 'skull', variant: 'normal' }, skullCount, events);
    }

    // 2. 重力 + 补充
    const result = this.gravity.apply(this.state.board, this.skullChance);
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
    const deadIds = events.filter((e) => e.type === 'defeat').map((e) => e.characterId);
    for (const id of deadIds) {
      const side = this.sideOfCharacter(id);
      if (side === null) continue; // 已不在编队里，无法判定归属，跳过
      events.push(...applyDeathTriggers(
        this.state.teams[side].characters,
        this.state.teams[opponentOf(side)].characters,
      ));
    }
  }

  /** 检查胜负，若结束则发出 game-over 并置状态（需求 15.3, 15.4） */
  private checkVictory(events: GameEvent[]): boolean {
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      if (CombatResolver.isWipedOut(this.state.teams[side])) {
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

    // 状态结算：对「即将行动方」的角色触发（DoT 扣血 / 到期移除，需求 9.2, 9.4, 9.5）
    events.push(
      ...resolveDefeatEvents(
        this.state,
        tickTeamStatuses(this.state.teams[this.state.activePlayer].characters),
      ),
    );
    // DoT 可能致死，重新判定胜负（game-over 仍排在末尾）
    if (this.checkVictory(events)) return;

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

    // 优先低层自定义 SkillEffect；否则查技能原型执行；都没有则仅产生空效果技能并正常结束回合。
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

    // 技能与交换共用唯一回合出口。致胜时 finishTurn 会安全跳过。
    this.checkVictory(events);
    this.finishTurn(events);
    this.processDeathTriggers(events);
    this.endActionLog(logEntry);
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
