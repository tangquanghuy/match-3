/**
 * 目标选择器族（战斗技能系统 · 需求 5）。
 *
 * 技能描述里的「最弱的敌人」「所有敌人」「随机盟友」等措辞，映射为一组 TargetMode，
 * 由 selectTargets 依据当前对局状态解析为具体角色列表。
 *
 * 纯逻辑：无 pixi/gsap/dom 依赖；所有随机性经注入的 SeededRNG，保证确定性（需求 5.4, 12.1, 12.2）。
 *
 * 强弱口径（rulings/R005，取代需求 5.2 的 hp-only + 索引平局）：weakest/healthiest 按当前生命 + 护甲
 * 比较；同分决定入选者时用注入 RNG 在同分者中抽取；取 N 个时依次取极值，存活不足 N 全部命中。
 * 排除阵亡：任何模式都不会选中 defeated 角色（需求 5.3）。
 * 无目标：返回空数组，调用方据此安全跳过该段效果（需求 5.5）。
 */
import { PlayerSide, opponentOf } from '../types';
import type { Character, Team } from '../types';
import type { GameState } from '../GameState';
import type { SeededRNG } from '../rng';
import { isUntargetable } from './effects/status';

/**
 * 目标模式：enemy* 作用于敌方，ally* 作用于己方，allySelf 为施法者自身。
 * 覆盖需求 5.1 全部措辞及其己方对应模式。
 */
export type TargetMode =
  // —— 敌方 ——
  | 'enemyFront' // 敌方队首存活（默认普攻/多数指定技能）
  | 'enemyRandom' // 随机单体
  | 'enemyRandomOther' // 随机另一名敌人，排除前一段选中的主目标
  | 'enemyRandomPrefNotPrev' // Native RandomPrefNotPrevEnemy: prefer any living enemy other than the preceding centre; if alone, reuse it.
  | 'allyRandomPrefNotPrev' // Native RandomPrefNotPrevAlly (L3-012): prefer any living ally other than the preceding target; if alone, reuse it.
  | 'enemyRandomN' // 随机 N 名（不重复，「对 3 名随机敌人」）
  | 'enemyWeakest' // 最低生命
  | 'enemyWeakestN' // 最低生命 N 名（「两名最虚弱的敌人」，升序取）
  | 'enemyHealthiest' // 最高生命
  | 'enemyHealthiestN' // 最高生命 N 名（降序取）
  | 'enemyFirstN' // 前 N 名
  | 'enemyNth' // 第 N 位（1-based，n=3 → 队伍第 3 个）
  | 'enemyLast' // 最后一名
  | 'enemySecondLast' // second from the back; empty if fewer than two survivors
  | 'enemyLastN' // 最后 N 名（「最后两名敌人」）
  | 'enemyAllOther' // All surviving enemies except the previous selected target.
  | 'enemyAll' // 全体
  | 'enemyChosen' // 施法方（玩家/AI）手动选定的敌方单体
  | 'enemyChosenAndNextDown' // Chosen enemy and precisely the next surviving enemy below it.
  | 'enemyChosenAndBelow' // 指定敌人与其纵队「下方」（编队中更靠后）的全部存活敌人
  | 'enemyChosenAndAdjacent' // 选定敌人的编队前后各一位（「上方和下方的敌人」，不含选定者；R11 批）
  | 'enemyAboveTarget' // 选定目标编队位**上方**的全部存活敌人（官方 AboveTarget；R13 批）
  | 'enemyBelowTarget' // 选定目标编队位**下方**的全部存活敌人（官方 BelowTarget；R13 批）
  | 'enemyNextDown' // 选定目标编队位**正下方一名**（官方 NextDownFromTarget，单格；R22 批 8248）
  | 'lastTarget' // 跨段追踪目标（「对随机敌人造成伤害，再使他陷入X」的「他」；2026-09-17 回收批）
  | 'lastTargets' // 跨段追踪目标**全列表**（最近产目标段解析出的全部目标，R22 批 9812「吸取其 8 点法力值」）
  | 'lastTargetFirst' // 跨段追踪目标列表**第一个**（R22 批 8220「燃烧第一组敌人」）
  | 'lastTargetLast' // 跨段追踪目标列表**最后一个**（R22 批 8220「冻结第二组敌人」）
  | 'lastDamaged' // 最近一个伤害段**实际命中**的目标集（skill-damage 事件口径，R22 批 8220/8320「使所有被伤害的敌人…」）
  | 'lastAlly' // randomAllyStat 来源本施法掷中的盟友（batch-r28，7402「伤害值等同于一名盟友的攻击力……给予**其**…」——跨段绑定同一名泛指盟友）
  // —— 己方 ——
  | 'allySelf' // 施法者自身
  | 'allyFront'
  | 'allyRandom'
  | 'allyRandomN' // 随机 N 名盟友（不重复）
  | 'allyWeakest'
  | 'allyLowestManaOther' // Lowest current mana among living allies excluding the caster; ties follow team order.
  | 'allyWeakestN'
  | 'allyHealthiest'
  | 'allyHealthiestN'
  | 'allyFirstN'
  | 'allyNth' // 第 N 位盟友（1-based）
  | 'allyOthers' // 其他盟友（除施法者外全体存活）
  | 'allySelfAndBelow' // 施法者自身与其编队位下方的全部存活盟友（官方 SelfAndBelow；R13 批）
  | 'allyAboveSelf' // 施法者编队位上方的全部存活盟友（官方 AboveSelf；R13 批）
  | 'allyBelowSelf' // 施法者编队位下方的全部存活盟友（官方 BelowSelf；R13 批）
  | 'allyBelowTarget' // 选定盟友编队位下方的全部存活盟友（官方 BelowTarget；R13 批）
  | 'allyLastOther' // Last living ally, excluding the caster.
  | 'allyLast'
  | 'allyLastN'
  | 'allyAll'
  | 'allyChosen'; // 施法方手动选定的己方单体

/** 手动选定类模式（需运行时由 TargetChooser 解析出具体 id） */
export type ChosenTargetMode = 'enemyChosen' | 'allyChosen' | 'enemyChosenAndNextDown' | 'enemyChosenAndBelow' | 'enemyChosenAndAdjacent';

export function isChosenMode(mode: TargetMode): mode is 'enemyChosen' | 'allyChosen' {
  return mode === 'enemyChosen' || mode === 'allyChosen';
}

/** 列出某模式对应的候选存活角色（供玩家 UI 展示可点选项 / AI 决策）。
 * enemyChosenAndBelow / enemyChosenAndAdjacent 的候选集与 enemyChosen 相同
 * （「下方/相邻」集合由选定结果派生）。 */
export function candidatesFor(
  mode: ChosenTargetMode,
  state: GameState,
  casterId: number,
): Character[] {
  const casterSide = sideOf(state, casterId);
  if (casterSide === null) return [];
  const side = mode === 'allyChosen' ? casterSide : opponentOf(casterSide);
  const alive = aliveInOrder(state.teams[side]);
  // 手动选敌：隐匿的敌人不出现在可点列表里（与 selectTargets 同一口径）
  return mode === 'allyChosen' ? alive : targetableFrom(alive);
}

/** 该模式是否作用于己方 */
function isAllyMode(mode: TargetMode): boolean {
  return mode === 'allySelf' || mode.startsWith('ally');
}

/** 定位施法者所在方（在双方队伍中查找 id） */
export function sideOf(state: GameState, casterId: number): PlayerSide | null {
  for (const side of [PlayerSide.Left, PlayerSide.Right]) {
    if (state.teams[side].characters.some((c) => c.id === casterId)) return side;
  }
  return null;
}

/** 队伍中的存活角色，保持队伍索引顺序（0=顶） */
function aliveInOrder(team: Team): Character[] {
  return team.characters.filter((c) => !c.defeated);
}

/**
 * 滤掉不可被技能「指定」的角色（隐匿特质）。
 *
 * 官方描述：「无法成为法术指定攻击目标（除非场上已无任何其他目标）」——括号里的
 * 例外必须实现，否则一队全隐匿时所有指定技能都会空放。故全员不可指定时原样返回。
 */
export function targetableFrom(alive: readonly Character[]): Character[] {
  const targetable = alive.filter((c) => !isUntargetable(c));
  return targetable.length > 0 ? targetable : [...alive];
}

/**
 * 选出 hp 极值角色：cmp 为「a 是否优于当前最优」。平局不替换 → 天然取更小索引（需求 5.2）。
 */
function pickExtreme(
  alive: Character[],
  better: (candidate: Character, best: Character) => boolean,
): Character[] {
  if (alive.length === 0) return [];
  let best = alive[0];
  for (let i = 1; i < alive.length; i++) {
    if (better(alive[i], best)) best = alive[i];
  }
  return [best];
}

/** 强弱口径（rulings/R005）：当前生命 + 当前护甲（「有效生命」），不看攻击/魔法。 */
export function effectiveLife(c: Character): number {
  return c.hp + c.armor;
}

/**
 * 按有效生命取最弱（asc）/最强（desc）的 N 名存活角色（rulings/R005）。
 * 分数分组依次取；某组只需取其中一部分时（同分决定入选者），用注入的 RNG 在该组内抽取；
 * 整组都入选时按队伍顺序、不消耗随机数。存活数不足 N 时全部命中。
 */
function pickByEffectiveLife(alive: Character[], dir: 'asc' | 'desc', n: number, rng: SeededRNG): Character[] {
  const k = Math.max(1, n);
  const scores = [...new Set(alive.map(effectiveLife))].sort((a, b) => (dir === 'asc' ? a - b : b - a));
  const picked: Character[] = [];
  for (const score of scores) {
    if (picked.length >= k) break;
    const group = alive.filter((c) => effectiveLife(c) === score);
    const need = k - picked.length;
    if (group.length <= need) {
      picked.push(...group);
      continue;
    }
    for (let i = 0; i < need; i++) picked.push(group.splice(rng.nextInt(group.length), 1)[0]);
  }
  return picked;
}

/**
 * 编队纵向切片（R13 批 · 编队全列方位族）：以队伍索引 refIdx 为锚，取其上方
 * （更小索引）/下方（更大索引）的存活角色，保持队伍索引序；inclusive 时含锚位自身
 * （SelfAndBelow）。敌方切片跳过隐匿（与 R11 enemyChosenAndAdjacent 的邻居过滤
 * 同一口径——位置群体效果打不中不可指定者，且不做「全不可指定则回退」）；己方切片不受影响。
 */
function columnSlice(
  team: Team,
  refIdx: number,
  part: 'above' | 'below',
  inclusive: boolean,
  filterUntargetable: boolean,
): Character[] {
  const out: Character[] = [];
  team.characters.forEach((c, i) => {
    if (c.defeated) return;
    if (i === refIdx) {
      if (!inclusive) return; // 锚位仅在 SelfAndBelow 类（inclusive）时含自身
    } else if (part === 'above' ? i >= refIdx : i <= refIdx) {
      return;
    }
    if (filterUntargetable && isUntargetable(c)) return;
    out.push(c);
  });
  return out;
}

/**
 * 依据目标模式解析出目标角色列表（需求 5.1–5.5）。
 *
 * @param mode  目标模式
 * @param state 当前对局状态
 * @param casterId 施法者 id
 * @param rng   种子化 RNG（random 模式用；保证同种子同结果，需求 5.4）
 * @param n     enemyFirstN/allyFirstN 的 N（默认 1）
 * @returns 目标角色引用列表；无合法目标返回空数组
 */
export function selectTargets(
  mode: TargetMode,
  state: GameState,
  casterId: number,
  rng: SeededRNG,
  n = 1,
  chosenId?: number,
  excludedId?: number,
): Character[] {
  const casterSide = sideOf(state, casterId);
  if (casterSide === null) return [];

  // lastTarget 特例：由 prototypes.resolveTargetsTracked 基于跨段追踪解析（此处兜底为空）
  if (mode === 'lastTarget') return [];
  // R22 批跨段追踪族：同样由 resolveTargetsTracked 基于追踪解析（此处兜底为空）
  if (mode === 'lastTargets' || mode === 'lastTargetFirst' || mode === 'lastTargetLast' || mode === 'lastDamaged') {
    return [];
  }
  // 'lastAlly'（batch-r28）：由 resolveTargetsTracked 读 castTracking.randomAllyId 解析（此处兜底为空）
  if (mode === 'lastAlly') return [];

  // allySelf 特例：施法者存活才返回自身
  if (mode === 'allySelf') {
    const self = state.teams[casterSide].characters.find((c) => c.id === casterId);
    return self && !self.defeated ? [self] : [];
  }

  const targetSide = isAllyMode(mode) ? casterSide : opponentOf(casterSide);
  const aliveAll = aliveInOrder(state.teams[targetSide]);
  if (aliveAll.length === 0) return [];

  // 隐匿只挡「指定」：群体技能（enemyAll）照常命中全员，己方模式不受影响。
  const alive = isAllyMode(mode) || (mode === 'enemyAll' || mode === 'enemyAllOther') ? aliveAll : targetableFrom(aliveAll);

  switch (mode) {
    case 'enemyChosen':
    case 'allyChosen': {
      // 手动选定：取 chosenId 指向的存活角色；未提供或已阵亡/越界则安全返回空
      if (chosenId === undefined) return [];
      const picked = alive.find((c) => c.id === chosenId);
      return picked ? [picked] : [];
    }

    case 'enemyChosenAndNextDown': {
      if (chosenId === undefined) return [];
      const start = alive.findIndex(c => c.id === chosenId);
      return start < 0 ? [] : alive.slice(start, start + 2);
    }

    case 'enemyChosenAndBelow': {
      // 「对一名敌人和其下方的所有敌人」：选定者 + 编队中更靠后的全部存活敌人
      //（GoW 纵队 0=顶；「下方」= 更大的队伍索引）。未提供/越界 → 安全返回空。
      if (chosenId === undefined) return [];
      const start = alive.findIndex((c) => c.id === chosenId);
      return start < 0 ? [] : alive.slice(start);
    }

    case 'enemyChosenAndAdjacent': {
      // 「上方和下方的敌人」「上下相邻」（R11 批）：选定者在编队中的前后各一位
      //（不含选定者；贴边只取存在的一侧）。相邻按**编队伍索引**判定（aliveAll 全体存活，
      // 不受隐匿过滤影响），再对邻居套用不可指定过滤（隐匿不选中）。
      // 未提供选定 id / 选定者不在敌方存活列表 → 安全返回空。
      if (chosenId === undefined) return [];
      const idx = aliveAll.findIndex((c) => c.id === chosenId);
      if (idx < 0) return [];
      const neighbor = (i: number): Character[] => {
        const c = aliveAll[i];
        return c && !isUntargetable(c) ? [c] : [];
      };
      return [...neighbor(idx - 1), ...neighbor(idx + 1)];
    }

    case 'allyAboveSelf':
    case 'allyBelowSelf': {
      // 「所有位于我上方/下方的盟友」（R13 批，官方 AboveSelf/BelowSelf）：以施法者
      // 编队索引为锚的纵向切片（不含自身；施法者贴边时对应方向自然为空）。
      const meIdx = state.teams[casterSide].characters.findIndex((c) => c.id === casterId);
      if (meIdx < 0) return [];
      return columnSlice(state.teams[casterSide], meIdx, mode === 'allyAboveSelf' ? 'above' : 'below', false, false);
    }

    case 'allySelfAndBelow': {
      // 「自身和自身下方的所有盟友」（R13 批，官方 SelfAndBelow）：切片含自身。
      const meIdx = state.teams[casterSide].characters.findIndex((c) => c.id === casterId);
      if (meIdx < 0) return [];
      return columnSlice(state.teams[casterSide], meIdx, 'below', true, false);
    }

    case 'allyBelowTarget':
    case 'enemyAboveTarget':
    case 'enemyBelowTarget': {
      // 「其上方/下方的…」（R13 批，官方 AboveTarget/BelowTarget）：以**选定目标**的
      // 编队索引为锚取切片。锚 = 目标在其**自身**队伍中的索引（8894「使一名盟友…再对
      // 其下位所有敌人…」= 选定盟友的己方索引映射到敌方同位切片；9258 选定敌人 →
      // 敌方同队切片）。未提供选定 id / 找不到（含已阵亡被移出编队）→ 安全返回空。
      if (chosenId === undefined) return [];
      const refSide = sideOf(state, chosenId);
      if (refSide === null) return [];
      const refIdx = state.teams[refSide].characters.findIndex((c) => c.id === chosenId);
      if (refIdx < 0) return [];
      const enemySide = mode.startsWith('enemy');
      return columnSlice(
        state.teams[targetSide],
        refIdx,
        mode === 'enemyAboveTarget' ? 'above' : 'below',
        false,
        enemySide,
      );
    }

    case 'enemyNextDown': {
      // 选定目标正下方一名（R22 批，官方 NextDownFromTarget 单格）：选定者在存活编队中的
      // 下一位存活敌人（更靠后、索引更大）。未提供选定 id / 无下方存活者 → 安全返回空。
      if (chosenId === undefined) return [];
      const idx = alive.findIndex((c) => c.id === chosenId);
      if (idx < 0 || idx + 1 >= alive.length) return [];
      return [alive[idx + 1]];
    }

    case 'enemyFront':
    case 'allyFront':
      return [alive[0]];

    case 'enemyLast':
    case 'allyLast':
      return [alive[alive.length - 1]];

    case 'allyLastOther':
      return alive.filter(c => c.id !== casterId).slice(-1);

    case 'enemyAllOther':
      return alive.filter(c => c.id !== excludedId);
    case 'enemyAll':
    case 'allyAll':
      return alive;

    case 'enemyFirstN':
      // Fixed front ranks are positional, not manually chosen spell targets.
      // Stealthy cannot move a different enemy into the first two slots.
      return aliveAll.slice(0, Math.max(0, n));
    case 'allyFirstN':
      return alive.slice(0, Math.max(0, n));

    case 'enemyNth':
    case 'allyNth': {
      // 第 N 位（1-based）；越界返回空（该段安全跳过）
      const idx = Math.max(1, n) - 1;
      return idx < alive.length ? [alive[idx]] : [];
    }

    case 'enemyRandomPrefNotPrev':
    case 'allyRandomPrefNotPrev': {
      const preferred = alive.filter(c => c.id !== excludedId);
      const pool = preferred.length ? preferred : alive;
      return [pool[rng.nextInt(pool.length)]];
    }
    case 'enemyRandomOther': {
      const others = alive.filter(c => c.id !== excludedId);
      return others.length > 0 ? [others[rng.nextInt(others.length)]] : [];
    }
    case 'enemyRandom':
    case 'allyRandom':
      return [alive[rng.nextInt(alive.length)]];

    case 'enemyRandomN':
    case 'allyRandomN': {
      // 随机 N 名、不重复（「对 3 名随机敌人」）；候选不足时有多少取多少
      const pool = alive.slice();
      const picked: Character[] = [];
      const k = Math.max(1, n);
      for (let i = 0; i < k && pool.length > 0; i++) {
        picked.push(pool.splice(rng.nextInt(pool.length), 1)[0]);
      }
      return picked;
    }

    case 'allyOthers':
      // 其他盟友：己方全体存活、除施法者本人
      return aliveAll.filter((c) => c.id !== casterId);

    case 'allyLowestManaOther':
      return pickExtreme(aliveAll.filter((c) => c.id !== casterId), (c, best) => c.mana < best.mana);

    // R005：最弱/最强 = 当前生命 + 护甲；同分决定入选者时用 RNG 抽取。
    case 'enemyWeakest':
    case 'allyWeakest':
      return pickByEffectiveLife(alive, 'asc', 1, rng);

    case 'enemyWeakestN':
    case 'allyWeakestN':
      return pickByEffectiveLife(alive, 'asc', n, rng);

    case 'enemyHealthiest':
    case 'allyHealthiest':
      return pickByEffectiveLife(alive, 'desc', 1, rng);

    case 'enemyHealthiestN':
    case 'allyHealthiestN':
      return pickByEffectiveLife(alive, 'desc', n, rng);

    case 'enemySecondLast':
      return alive.length >= 2 ? [alive[alive.length - 2]] : [];

    case 'enemyLastN':
    case 'allyLastN':
      return alive.slice(-Math.max(1, n));

    default: {
      // 穷尽性检查：新增模式若未处理会在编译期报错
      const _exhaustive: never = mode;
      return _exhaustive;
    }
  }
}
