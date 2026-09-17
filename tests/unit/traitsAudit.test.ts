/**
 * 特质全库审计（人工核对前的机器关卡）。
 *
 * 五道关卡，全部针对「代码层面能挑出来的毛病」：
 *   A. 数据完整性 —— traits.json 每条结构合法、数值范围合理、引用的状态/颜色真实存在
 *   B. 编译契约   —— 生成器产出的效果键全部被 resolvePassives 消费；每条特质编译后必须
 *                    与中性被动产生可观测差异（杜绝「生成了但编译器忽略」的死条目）
 *   C. 描述↔数值一致性 —— 从官方中文描述里重新抽数，与生成器写入的效果数值逐条对账
 *                        （专抓正则捕获错位、单位写错、拷贝粘贴错值）
 *   D. 接线完整性 —— 每个效果族的消费点真实存在于引擎源码（钩子存在但没人调用的死角）
 *   E. 兵种侧一致 —— 实现的特质 code 都真实存在于官方 dump（防幻觉数据），覆盖出场数不下滑
 *   F. 展示覆盖   —— 每个已实现特质都能产出卡面/详情图标与可读名称
 *
 * 人工核对只需复核本套件测不了的部分：语义方向是否与官方玩法一致、数值手感。
 */
import { describe, it, expect } from 'vitest';
import traitsJson from '../../src/data/traits.json';
import troopsJson from '../../src/data/troops.json';
import { resolvePassives, neutralPassives, implementedTraitIds, getTrait } from '@engine/traits';
import type { TraitDefinition } from '@engine/traits';
import { BaseColor } from '@engine/types';
import { traitBadgeSvg } from '../../src/render/traitBadges';
import turnEngineSrc from '../../src/engine/TurnEngine.ts?raw';
import combatResolverSrc from '../../src/engine/CombatResolver.ts?raw';
import traitsSrc from '../../src/engine/traits.ts?raw';
import targetingSrc from '../../src/engine/skills/targeting.ts?raw';
import damageSrc from '../../src/engine/skills/effects/damage.ts?raw';
import debuffSrc from '../../src/engine/skills/effects/debuff.ts?raw';
import manaDistributorSrc from '../../src/engine/ManaDistributor.ts?raw';
import gravitySystemSrc from '../../src/engine/GravitySystem.ts?raw';

const ALL = traitsJson as (TraitDefinition & { troops: number })[];
const META_KEYS = new Set(['code', 'name', 'description', 'troops']);

/** 官方 dump 中出现过的全部特质 code（防幻觉数据） */
const OFFICIAL_CODES = new Set<string>(
  (troopsJson as { traits?: { code: string }[] }[]).flatMap((t) => (t.traits ?? []).map((x) => x.code)),
);

/** 兵种中文名集合（死亡召唤 displayName 必须真实存在） */
const OFFICIAL_TROOP_NAMES = new Set<string>(
  (troopsJson as { name?: string }[]).map((t) => t.name ?? '').filter((n) => n !== ''),
);

/** 引擎认识的状态 id（免疫/命中附状态/大连施加状态只允许这些；与 build_traits.mjs STATUS_MAP + AURA_STATUS_MAP 对齐） */
const ENGINE_STATUS_IDS = new Set([
  'poison', 'burning', 'frozen', 'silence', 'entangle', 'web', 'stun',
  // 条件光环批可施加的状态本体（barrier/bleed 等已在引擎落地，见 skills/effects/status.ts）
  'barrier', 'bleed', 'rage', 'submerged', 'reflect', 'blessed', 'enchanted',
  'curse', 'charm', 'disease', 'death-mark',
  // 特质可救批（T1 免疫 + T3 骷髅命中）：marked/terror 本体已在 status.ts 落地
  // （MARK_STATUS_ID / TERROR_STATUS_ID），build_traits.mjs RESCUE_STATUS_MAP 开始产出
  'marked', 'terror',
  // O 桶判读批：mana-burn 状态 id 引擎已识别（status.ts MANA_BURN_STATUS_IDS，
  // 自动消退集合成员；技能施加端已存在），manashield 免疫句按此挂 statusImmunities
  'mana-burn',
  // 妖火拆分批：faerie-fire 是独立状态（status.ts FAERIE_FIRE_STATUS_ID，受法术伤害 ×1.5），
  // 不再与 DoT 的 burning 混映射
  'faerie-fire',
]);

const BASE_COLORS = new Set(Object.values(BaseColor));

/** 引擎认识的特殊宝石 kind（与 types.ts SpecialGemKind 全集对齐） */
const ENGINE_SPECIAL_GEMS = new Set([
  'doomSkull', 'uberDoomSkull', 'bomb', 'web', 'lightningRow', 'lightningCol',
  'wildcard', 'wish', 'hourglass', 'bootyGem', 'ghost',
  'burningGem', 'freezeGem', 'curseGem', 'bleedGem', 'poisonGem', 'deathMarkGem',
  'terrorGem', 'entangleGem', 'enrageGem', 'submergeGem', 'faerieFireGem',
  'stunGem', 'barrierGem',
]);

/** 特殊宝石 kind → 描述中的中文词（T4 创造批对账用；与 build_traits.mjs SPECIAL_GEM_MAP 同源） */
const GEM_WORD_OF: Record<string, RegExp> = {
  web: /织网|蛛网|网络/, bomb: /炸弹/, ghost: /鬼魂/, wish: /许愿|愿望/,
  burningGem: /燃烧/, freezeGem: /冻结/, curseGem: /诅咒/, poisonGem: /毒/,
  bleedGem: /流血/, terrorGem: /恐怖/, deathMarkGem: /死亡标记|死亡印记/,
  entangleGem: /纠缠|缠绕/, enrageGem: /激怒|愤怒|狂怒/, doomSkull: /末日骷髅头/,
  uberDoomSkull: /超级末日骷髅头/, bootyGem: /赃物/, faerieFireGem: /妖火|妖仙/,
  barrierGem: /屏障/, stunGem: /击晕|眩晕/, submergeGem: /沉没/, hourglass: /沙漏/,
  wildcard: /通配/,
};

/** 触发类字段清单（与 traits.ts TRIGGER_FIELDS 同步） */
const TRIGGER_FIELDS = [
  'onDamagedGain', 'onSkullHitGain', 'onAllyCastGain', 'onEnemyCastGain',
  'onEnemyDeathGain', 'onAllyDeathGain', 'onBigMatchGain',
] as const;

const STAT_OF_WORD: Record<string, string> = {
  生命值: 'hp', 护甲值: 'armor', 攻击力: 'attack', 魔法值: 'magic',
  随机技能值: 'magic', 法力值: 'mana',
};

/** 中文颜色词（可带「色」尾）→ 引擎 BaseColor 名（开局爆破对账用） */
const COLOR_OF_WORD: Record<string, string> = {
  红: 'Red', 绿: 'Green', 蓝: 'Blue', 黄: 'Yellow', 紫: 'Purple', 棕: 'Brown',
};

/** 收集器：把同族断言的全部违例攒起来一次性报告，避免逐条失败掩盖其余问题 */
function collect(run: (report: (msg: string) => void) => void): string[] {
  const problems: string[] = [];
  run((msg) => problems.push(msg));
  return problems;
}
function expectNoProblems(problems: string[], scope: string): void {
  expect(problems, `${scope}：前 ${Math.min(5, problems.length)} 条 → ${problems.slice(0, 5).join(' | ')}`).toEqual([]);
}

describe('A · 数据完整性', () => {
  const problems = collect((report) => {
    const seenCodes = new Set<string>();
    for (const t of ALL) {
      const tag = `${t.code}(${t.troops}次)`;
      if (!t.code || !t.name || !t.description) report(`${tag} 缺 code/name/description`);
      if (!(t.troops > 0)) report(`${tag} troops 计数异常`);
      if (seenCodes.has(t.code)) report(`${tag} code 重复`);
      seenCodes.add(t.code);

      const keys = Object.keys(t).filter((k) => !META_KEYS.has(k));
      if (keys.length === 0) { report(`${tag} 没有任何效果字段（死条目）`); continue; }

      // 数值范围
      const range = (v: number, lo: number, hi: number, field: string) => {
        if (!(v > lo && v <= hi)) report(`${tag} ${field}=${v} 超出 (${lo},${hi}]`);
      };
      if (t.skullDamageReduction !== undefined) range(t.skullDamageReduction, 0, 0.8, 'skullDamageReduction');
      if (t.spellDamageReduction !== undefined) range(t.spellDamageReduction, 0, 0.8, 'spellDamageReduction');
      if (t.dodgeChance !== undefined) range(t.dodgeChance, 0, 0.6, 'dodgeChance');
      if (t.reflectSkullRatio !== undefined) range(t.reflectSkullRatio, 0, 0.75, 'reflectSkullRatio');
      // 穿甲率上限 1：savagestrike「有 100% 的几率忽略护甲值」官方数值即 100%
      if (t.armorPierceChance !== undefined) range(t.armorPierceChance, 0, 1, 'armorPierceChance');
      if (t.battleStartManaRatio !== undefined) range(t.battleStartManaRatio, 0, 1, 'battleStartManaRatio');
      if (t.regen) {
        if (!['hp', 'armor', 'attack', 'magic'].includes(t.regen.stat)) report(`${tag} regen.stat 非法`);
        if (!(t.regen.amount >= 1 && t.regen.amount <= 20)) report(`${tag} regen.amount=${t.regen.amount} 异常`);
      }
      for (const mult of [
        t.skullMultVsTroopType?.mult, t.skullMultVsStatus?.mult, t.skullMultVsColor?.mult,
      ]) {
        if (mult !== undefined && !(mult > 1)) report(`${tag} 屠戮倍率 ${mult} 不大于 1（无意义）`);
      }
      const aura = t.teamAura ?? t.typeAura ?? t.perAllyColor;
      if (aura && !(aura.amount !== 0 && Math.abs(aura.amount) <= 20)) report(`${tag} 光环 amount=${aura.amount} 异常`);
      for (const field of TRIGGER_FIELDS) {
        const gain = t[field] as { stat: string; amount: number } | undefined;
        if (gain && !(gain.amount >= 1 && gain.amount <= 20)) report(`${tag} ${field}.amount=${gain.amount} 异常`);
      }
      if (t.onColorMatchGain && !(t.onColorMatchGain.amount >= 1 && t.onColorMatchGain.amount <= 20)) {
        report(`${tag} onColorMatchGain.amount 异常`);
      }
      if (t.onBigMatchTypeAura) {
        const vals = Object.values(t.onBigMatchTypeAura.gains).filter((v) => v !== 0);
        if (vals.length === 0 || vals.some((v) => v < 0 || Math.abs(v) > 20)) {
          report(`${tag} onBigMatchTypeAura.gains 异常`);
        }
      }
      // 条件光环批（窗口 E）：结构合法性
      if (t.onBigMatchStatus) {
        const s = t.onBigMatchStatus;
        if (!['self', 'randomAlly', 'allAllies', 'allEnemies', 'randomEnemy', 'firstEnemy'].includes(s.scope)) report(`${tag} onBigMatchStatus.scope「${s.scope}」非法`);
        if (!s.statuses || s.statuses.length === 0) report(`${tag} onBigMatchStatus 缺 statuses`);
        for (const st of s.statuses ?? []) {
          if (!ENGINE_STATUS_IDS.has(st.id)) report(`${tag} 大连施加状态「${st.id}」引擎未实现`);
          if (st.magnitude !== undefined && !['poison', 'burning', 'bleed'].includes(st.id)) {
            report(`${tag} 非 DoT 状态不应带 magnitude（${st.id}）`);
          }
        }
        if (!(s.turns >= 1 && s.turns <= 9)) report(`${tag} onBigMatchStatus.turns=${s.turns} 异常`);
        if (s.chance !== undefined && !(s.chance > 0 && s.chance <= 1)) report(`${tag} onBigMatchStatus.chance=${s.chance} 异常`);
        if (s.minSize !== undefined && ![4, 5].includes(s.minSize)) report(`${tag} onBigMatchStatus.minSize=${s.minSize} 异常`);
        if (s.randomPositive && (s.scope !== 'randomAlly' || (s.statuses?.length ?? 0) < 2)) {
          report(`${tag} randomPositive 必须 randomAlly + 多状态池`);
        }
        if (s.randomNegative && (s.scope !== 'randomEnemy' || (s.statuses?.length ?? 0) < 2)) {
          report(`${tag} randomNegative 必须 randomEnemy + 多状态池`);
        }
      }
      // T5 配色状态批：配色施加状态的结构合法性（「随机一名敌人」/「赋予自身」/ 缺口清扫批
      // 「随机一名盟友」句式族；independentChance 仅限带概率的多状态条目）
      if (t.onColorMatchStatus) {
        const s = t.onColorMatchStatus;
        if (s.color !== 'skull' && !BASE_COLORS.has(s.color as BaseColor)) report(`${tag} onColorMatchStatus.color「${s.color}」非法`);
        if (!['randomEnemy', 'randomAlly', 'self'].includes(s.scope)) report(`${tag} onColorMatchStatus.scope「${s.scope}」非法`);
        if (!s.statuses || s.statuses.length === 0) report(`${tag} onColorMatchStatus 缺 statuses`);
        for (const st of s.statuses ?? []) {
          if (!ENGINE_STATUS_IDS.has(st.id)) report(`${tag} 配色施加状态「${st.id}」引擎未实现`);
          if (st.magnitude !== undefined && !['poison', 'burning', 'bleed'].includes(st.id)) {
            report(`${tag} 非 DoT 状态不应带 magnitude（${st.id}）`);
          }
        }
        if (s.turns !== undefined && !(s.turns >= 1 && s.turns <= 9)) report(`${tag} onColorMatchStatus.turns=${s.turns} 异常`);
        if (s.chance !== undefined && !(s.chance > 0 && s.chance <= 1)) report(`${tag} onColorMatchStatus.chance=${s.chance} 异常`);
        if (s.independentChance !== undefined && s.independentChance !== true) report(`${tag} onColorMatchStatus.independentChance 只允许 true`);
        if (s.independentChance && s.chance === undefined) report(`${tag} independentChance 需要搭配 chance`);
      }
      if (t.onBigMatchSizedGain) {
        const s = t.onBigMatchSizedGain;
        if (![4, 5].includes(s.minSize)) report(`${tag} onBigMatchSizedGain.minSize=${s.minSize} 异常`);
        if (!(s.amount >= 1 && s.amount <= 20)) report(`${tag} onBigMatchSizedGain.amount=${s.amount} 异常`);
      }
      // T5 窃取批：配色窃取生命的结构合法性（「窃取第一/首位敌人 N 点生命值」句式族）
      if (t.onColorMatchDrain) {
        const s = t.onColorMatchDrain;
        if (s.color !== 'skull' && !BASE_COLORS.has(s.color as BaseColor)) report(`${tag} onColorMatchDrain.color「${s.color}」非法`);
        if (!(s.amount >= 1 && s.amount <= 20)) report(`${tag} onColorMatchDrain.amount=${s.amount} 异常`);
      }
      // T5 大连伤害批：4/5 连技能伤害的结构合法性（缺口清扫批 attackfrombelow 扩 scope lastEnemy）
      if (t.onBigMatchDamage) {
        const s = t.onBigMatchDamage;
        if (!['randomEnemy', 'enemyAll', 'lastEnemy'].includes(s.scope)) report(`${tag} onBigMatchDamage.scope「${s.scope}」非法`);
        if (!(s.amount >= 1 && s.amount <= 20)) report(`${tag} onBigMatchDamage.amount=${s.amount} 异常`);
        if (s.minSize !== undefined && ![4, 5].includes(s.minSize)) report(`${tag} onBigMatchDamage.minSize=${s.minSize} 异常`);
      }
      // T5 大连敌减批：4+ 连削减敌方属性的结构合法性（reduce 语义，无 hp——扣血走伤害管线）
      if (t.onBigMatchEnemyDrain) {
        const s = t.onBigMatchEnemyDrain;
        if (!['attack', 'armor', 'magic', 'mana'].includes(s.stat)) report(`${tag} onBigMatchEnemyDrain.stat「${s.stat}」非法`);
        if (!(s.amount >= 1 && s.amount <= 20)) report(`${tag} onBigMatchEnemyDrain.amount=${s.amount} 异常`);
        if (!['front', 'randomEnemy', 'allEnemies'].includes(s.scope)) report(`${tag} onBigMatchEnemyDrain.scope「${s.scope}」非法`);
        if (s.minSize !== undefined && ![4, 5].includes(s.minSize)) report(`${tag} onBigMatchEnemyDrain.minSize=${s.minSize} 异常`);
      }
      // 条件经济光环批（条件经济批）：结构合法性
      for (const [field, spec] of [['onBigMatchEconomy', t.onBigMatchEconomy], ['onSkullMatchEconomy', t.onSkullMatchEconomy]] as const) {
        if (!spec) continue;
        if (!['gold', 'souls', 'gems'].includes(spec.currency)) report(`${tag} ${field}.currency「${spec.currency}」非法`);
        if (!(spec.amount >= 1 && spec.amount <= 50)) report(`${tag} ${field}.amount=${spec.amount} 异常`);
        if (field === 'onBigMatchEconomy' && spec.minSize !== undefined && ![4, 5].includes(spec.minSize)) {
          report(`${tag} onBigMatchEconomy.minSize=${spec.minSize} 异常`);
        }
      }
      if (t.onColorMatchTypeAura) {
        const s = t.onColorMatchTypeAura;
        const colorOk = s.color === 'skull' || BASE_COLORS.has(s.color as BaseColor);
        if (!colorOk) report(`${tag} onColorMatchTypeAura.color「${s.color}」非法`);
        const scopeOk = s.scope === 'all' || /^[A-Z]/.test(s.scope) || BASE_COLORS.has(s.scope as BaseColor);
        if (!scopeOk) report(`${tag} onColorMatchTypeAura.scope「${s.scope}」不是全队/规范族名/颜色`);
        const vals = Object.values(s.gains).filter((v) => v !== 0);
        if (vals.length === 0 || vals.some((v) => v < 0 || Math.abs(v) > 20)) {
          report(`${tag} onColorMatchTypeAura.gains 异常`);
        }
      }
      if (t.onEnemyColorMatchGain) {
        const s = t.onEnemyColorMatchGain;
        if (s.color !== 'skull' && !BASE_COLORS.has(s.color as BaseColor)) report(`${tag} onEnemyColorMatchGain.color「${s.color}」非法`);
        if (!(s.amount >= 1 && s.amount <= 20)) report(`${tag} onEnemyColorMatchGain.amount=${s.amount} 异常`);
      }
      if (t.onColorMatchCleanse && !BASE_COLORS.has(t.onColorMatchCleanse.color as BaseColor)) {
        report(`${tag} onColorMatchCleanse.color「${t.onColorMatchCleanse.color}」非法`);
      }

      // 引用真实性
      for (const id of t.statusImmunities ?? []) {
        if (id !== '*' && !ENGINE_STATUS_IDS.has(id)) report(`${tag} 免疫了引擎不存在/未实现的状态「${id}」`);
      }
      for (const inf of [t.inflictOnSkullHit, t.inflictOnSkullDamaged]) {
        if (!inf) continue;
        if (!ENGINE_STATUS_IDS.has(inf.id)) report(`${tag} 命中附状态「${inf.id}」引擎未实现`);
        if (!(inf.turns >= 1 && inf.turns <= 9)) report(`${tag} 附状态 turns=${inf.turns} 异常`);
        if (inf.magnitude !== undefined && (inf.id === 'web' || !['poison', 'burning', 'bleed'].includes(inf.id))) {
          report(`${tag} 非DoT状态不应带 magnitude（web 的 magnitude 是挣脱几率，由引擎管理）`);
        }
      }
      // T2 死亡钩子批：多状态列表与敌人身亡变体的结构合法性
      if (t.inflictOnSkullDamagedList) {
        if (t.inflictOnSkullDamagedList.length < 2) report(`${tag} inflictOnSkullDamagedList 少于两条（双状态族专用，单状态应走 inflictOnSkullDamaged）`);
        for (const inf of t.inflictOnSkullDamagedList) {
          if (!ENGINE_STATUS_IDS.has(inf.id)) report(`${tag} 命中附状态「${inf.id}」引擎未实现`);
          if (!(inf.turns >= 1 && inf.turns <= 9)) report(`${tag} 附状态 turns=${inf.turns} 异常`);
          if (inf.magnitude !== undefined && (inf.id === 'web' || !['poison', 'burning', 'bleed'].includes(inf.id))) {
            report(`${tag} 非DoT状态不应带 magnitude（${inf.id}）`);
          }
        }
      }
      if (t.onEnemyDeathStatus) {
        if (!ENGINE_STATUS_IDS.has(t.onEnemyDeathStatus.id)) report(`${tag} onEnemyDeathStatus「${t.onEnemyDeathStatus.id}」引擎未实现`);
        if (!(t.onEnemyDeathStatus.turns >= 1 && t.onEnemyDeathStatus.turns <= 9)) report(`${tag} onEnemyDeathStatus.turns=${t.onEnemyDeathStatus.turns} 异常`);
      }
      if (t.onEnemyDeathEnemyStatus) {
        if (!ENGINE_STATUS_IDS.has(t.onEnemyDeathEnemyStatus.id)) report(`${tag} onEnemyDeathEnemyStatus「${t.onEnemyDeathEnemyStatus.id}」引擎未实现`);
        if (!(t.onEnemyDeathEnemyStatus.turns >= 1 && t.onEnemyDeathEnemyStatus.turns <= 9)) report(`${tag} onEnemyDeathEnemyStatus.turns=${t.onEnemyDeathEnemyStatus.turns} 异常`);
      }
      // O 桶判读批：受击下潜 / 身亡经济 / 法力操作免疫 / 开局爆破的结构合法性
      if (t.onDamagedStatus) {
        if (!ENGINE_STATUS_IDS.has(t.onDamagedStatus.statusId)) report(`${tag} onDamagedStatus「${t.onDamagedStatus.statusId}」引擎未实现`);
        if (!(t.onDamagedStatus.turns >= 1 && t.onDamagedStatus.turns <= 9)) report(`${tag} onDamagedStatus.turns=${t.onDamagedStatus.turns} 异常`);
      }
      if (t.onDeathEconomy) {
        if (!['gold', 'souls', 'gems'].includes(t.onDeathEconomy.currency)) report(`${tag} onDeathEconomy.currency「${t.onDeathEconomy.currency}」非法`);
        if (!(t.onDeathEconomy.amount >= 1 && t.onDeathEconomy.amount <= 50)) report(`${tag} onDeathEconomy.amount=${t.onDeathEconomy.amount} 异常`);
      }
      if (t.battleStartDestroy) {
        const s = t.battleStartDestroy;
        if (s.kind === 'skull') { /* 骷髅头无附加字段 */ } else if (s.kind === 'color') {
          if (!BASE_COLORS.has(s.color as BaseColor)) report(`${tag} battleStartDestroy.color「${s.color}」非法`);
        } else {
          report(`${tag} battleStartDestroy.kind「${(s as { kind: string }).kind}」非法`);
        }
      }
      if (t.onEnemyDeathTypeAura) {
        if (t.onEnemyDeathTypeAura.troopType !== 'all' && !/^[A-Z]/.test(t.onEnemyDeathTypeAura.troopType)) {
          report(`${tag} onEnemyDeathTypeAura.troopType「${t.onEnemyDeathTypeAura.troopType}」不是规范族名`);
        }
        const vals = Object.values(t.onEnemyDeathTypeAura.gains).filter((v) => v !== 0);
        if (vals.length === 0 || vals.some((v) => v < 0 || Math.abs(v) > 20)) {
          report(`${tag} onEnemyDeathTypeAura.gains 异常`);
        }
      }
      if (t.turnStartCreateGem && !BASE_COLORS.has(t.turnStartCreateGem.color as BaseColor)) {
        report(`${tag} turnStartCreateGem.color 非法`);
      }
      if (t.turnStartCreateGem?.count !== undefined && !(t.turnStartCreateGem.count >= 1 && t.turnStartCreateGem.count <= 9)) {
        report(`${tag} turnStartCreateGem.count=${t.turnStartCreateGem.count} 异常`);
      }
      if (t.turnStartColorToSkull) {
        if (!BASE_COLORS.has(t.turnStartColorToSkull.color as BaseColor)) report(`${tag} turnStartColorToSkull.color 非法`);
        if (!(t.turnStartColorToSkull.chance > 0 && t.turnStartColorToSkull.chance <= 1)) report(`${tag} turnStartColorToSkull.chance 异常`);
      }
      // T4 宝石创造批：创造/转换特殊宝石的结构合法性
      for (const [field, spec] of [
        ['turnStartCreateSpecialGem', t.turnStartCreateSpecialGem],
        ['onDeathCreateGem', t.onDeathCreateGem],
      ] as const) {
        if (!spec) continue;
        if (!ENGINE_SPECIAL_GEMS.has(spec.gem)) report(`${tag} ${field}.gem「${spec.gem}」引擎未实现`);
        if (!(spec.count >= 1 && spec.count <= 9)) report(`${tag} ${field}.count=${spec.count} 异常`);
      }
      if (t.turnStartCreateSpecialGem?.chance !== undefined
        && !(t.turnStartCreateSpecialGem.chance > 0 && t.turnStartCreateSpecialGem.chance <= 1)) {
        report(`${tag} turnStartCreateSpecialGem.chance=${t.turnStartCreateSpecialGem.chance} 异常`);
      }
      if (t.turnStartColorToSpecial) {
        const s = t.turnStartColorToSpecial;
        if (s.color !== 'skull' && !BASE_COLORS.has(s.color as BaseColor)) report(`${tag} turnStartColorToSpecial.color「${s.color}」非法`);
        if (!ENGINE_SPECIAL_GEMS.has(s.gem)) report(`${tag} turnStartColorToSpecial.gem「${s.gem}」引擎未实现`);
        if (!(s.count >= 1 && s.count <= 9)) report(`${tag} turnStartColorToSpecial.count=${s.count} 异常`);
        if (s.chance !== undefined && !(s.chance > 0 && s.chance <= 1)) report(`${tag} turnStartColorToSpecial.chance=${s.chance} 异常`);
      }
      if (t.onBigMatchCreateGem) {
        const s = t.onBigMatchCreateGem;
        if (!ENGINE_SPECIAL_GEMS.has(s.gem)) report(`${tag} onBigMatchCreateGem.gem「${s.gem}」引擎未实现`);
        if (!(s.count >= 1 && s.count <= 9)) report(`${tag} onBigMatchCreateGem.count=${s.count} 异常`);
        if (s.chance !== undefined && !(s.chance > 0 && s.chance <= 1)) report(`${tag} onBigMatchCreateGem.chance=${s.chance} 异常`);
        if (s.minSize !== undefined && ![4, 5].includes(s.minSize)) report(`${tag} onBigMatchCreateGem.minSize=${s.minSize} 异常`);
      }
      // T5 杂项机制批：转换/召唤/风暴/即杀/配色伤害的结构合法性
      if (t.onBigMatchConvert) {
        const s = t.onBigMatchConvert;
        if (s.from !== 'hp' || s.to !== 'magic') report(`${tag} onBigMatchConvert 只支持 生命值→魔法值`);
        if (!(s.amount >= 1 && s.amount <= 20)) report(`${tag} onBigMatchConvert.amount=${s.amount} 异常`);
        if (s.minSize !== undefined && ![4, 5].includes(s.minSize)) report(`${tag} onBigMatchConvert.minSize=${s.minSize} 异常`);
      }
      if (t.onBigMatchSummon) {
        const s = t.onBigMatchSummon;
        if (!(s.chance > 0 && s.chance <= 1)) report(`${tag} onBigMatchSummon.chance=${s.chance} 异常`);
        if (!s.troopId || !s.referenceName || !s.displayName) report(`${tag} onBigMatchSummon 缺 troopId/referenceName/displayName`);
        if (s.displayName && !OFFICIAL_TROOP_NAMES.has(s.displayName)) {
          report(`${tag} onBigMatchSummon.displayName「${s.displayName}」在兵种数据中不存在`);
        }
        if (s.minSize !== undefined && ![4, 5].includes(s.minSize)) report(`${tag} onBigMatchSummon.minSize=${s.minSize} 异常`);
      }
      if (t.onBigMatchStorm) {
        const s = t.onBigMatchStorm;
        if (!BASE_COLORS.has(s.color as BaseColor)) report(`${tag} onBigMatchStorm.color「${s.color}」非法`);
        if (!(s.turns >= 1 && s.turns <= 20)) report(`${tag} onBigMatchStorm.turns=${s.turns} 超出 [1,20]`);
        if (!(s.troopId >= 9001 && s.troopId <= 9009)) report(`${tag} onBigMatchStorm.troopId=${s.troopId} 不在风暴虚拟号段 9001~9009`);
        if (s.minSize !== undefined && ![4, 5].includes(s.minSize)) report(`${tag} onBigMatchStorm.minSize=${s.minSize} 异常`);
      }
      if (t.onBigMatchKill) {
        const s = t.onBigMatchKill;
        if (s.scope !== 'lastEnemy') report(`${tag} onBigMatchKill.scope「${s.scope}」非法`);
        if (!(s.chance > 0 && s.chance <= 1)) report(`${tag} onBigMatchKill.chance=${s.chance} 异常`);
        if (s.minSize !== undefined && ![4, 5].includes(s.minSize)) report(`${tag} onBigMatchKill.minSize=${s.minSize} 异常`);
      }
      if (t.onColorMatchDamage) {
        const s = t.onColorMatchDamage;
        if (s.color !== 'skull' && !BASE_COLORS.has(s.color as BaseColor)) report(`${tag} onColorMatchDamage.color「${s.color}」非法`);
        if (!(s.amount >= 1 && s.amount <= 20)) report(`${tag} onColorMatchDamage.amount=${s.amount} 异常`);
        if (s.scope !== undefined && !['randomEnemy', 'allEnemies'].includes(s.scope)) report(`${tag} onColorMatchDamage.scope「${s.scope}」非法`);
      }
      for (const field of ['summonOnDeath', 'summonOnAllyDeath', 'summonOnEnemyDeath'] as const) {
        const s = t[field];
        if (!s) continue;
        if (!(s.chance > 0 && s.chance <= 1)) report(`${tag} ${field}.chance=${s.chance} 异常`);
        if (s.storm) {
          // 风暴变体（阶段 1.3）：不产出兵种，color 合法 + turns ∈ [1,20] + 虚拟号段
          if (!BASE_COLORS.has(s.storm.color as BaseColor)) report(`${tag} ${field}.storm.color「${s.storm.color}」非法`);
          if (!(s.storm.turns >= 1 && s.storm.turns <= 20)) report(`${tag} ${field}.storm.turns=${s.storm.turns} 超出 [1,20]`);
          if (!(s.troopId >= 9001 && s.troopId <= 9009)) report(`${tag} ${field}.troopId=${s.troopId} 不在风暴虚拟号段 9001~9009`);
        } else {
          if (!s.troopId || !s.referenceName || !s.displayName) report(`${tag} ${field} 缺 troopId/referenceName/displayName`);
          if (s.displayName && !s.displayName.includes(s.referenceName) && !OFFICIAL_TROOP_NAMES.has(s.displayName)) {
            report(`${tag} ${field}.displayName「${s.displayName}」在兵种数据中不存在`);
          }
          if (s.fullMana !== undefined && s.fullMana !== true) report(`${tag} ${field}.fullMana 只允许 true`);
        }
      }
      if (t.onBigMatchTypeAura && t.onBigMatchTypeAura.troopType !== 'all'
        && !/^[A-Z]/.test(t.onBigMatchTypeAura.troopType)) {
        report(`${tag} onBigMatchTypeAura.troopType「${t.onBigMatchTypeAura.troopType}」不是规范族名`);
      }
      // 战斗机制批：宝石灵力减半 / 位次光环 / 施法随机状态 / 吞噬免疫的结构合法性
      if (t.enemyMasteryMult !== undefined && !(t.enemyMasteryMult > 0 && t.enemyMasteryMult < 1)) {
        report(`${tag} enemyMasteryMult=${t.enemyMasteryMult} 应为 (0,1) 开区间抑制倍率`);
      }
      if (t.devourImmunity !== undefined && t.devourImmunity !== true) {
        report(`${tag} devourImmunity 只允许 true`);
      }
      if (t.positionAura) {
        const s = t.positionAura;
        if (!['front', 'last'].includes(s.position)) report(`${tag} positionAura.position「${s.position}」非法`);
        const vals = Object.values(s.gains).filter((v) => v !== 0);
        if (vals.length === 0 || vals.some((v) => v < 1 || v > 20)) {
          report(`${tag} positionAura.gains 异常`);
        }
      }
      if (t.onAllyCastRandomStatus) {
        const s = t.onAllyCastRandomStatus;
        if (!['randomAlly', 'randomEnemy'].includes(s.scope)) report(`${tag} onAllyCastRandomStatus.scope「${s.scope}」非法`);
      }
      // —— 缺口清扫批：新字段结构合法性 ——
      if (t.allyStartMana) {
        const s = t.allyStartMana;
        if (s.troopType !== undefined && !/^[A-Z]/.test(s.troopType)) report(`${tag} allyStartMana.troopType「${s.troopType}」不是规范族名`);
        if (!(s.ratio > 0 && s.ratio <= 1)) report(`${tag} allyStartMana.ratio=${s.ratio} 超出 (0,1]`);
      }
      for (const [field, aura] of [['battleStartTypeAura', t.battleStartTypeAura], ['turnStartTypeAura', t.turnStartTypeAura]] as const) {
        if (!aura) continue;
        const scopeOk = aura.scope === 'all' || /^[A-Z]/.test(aura.scope) || BASE_COLORS.has(aura.scope as BaseColor);
        if (!scopeOk) report(`${tag} ${field}.scope「${aura.scope}」不是全队/规范族名/颜色`);
        const vals = Object.values(aura.gains).filter((v) => v !== 0);
        if (vals.length === 0 || vals.some((v) => v < 1 || v > 20)) report(`${tag} ${field}.gains 异常`);
      }
      if (t.perAllyTrait) {
        if (t.perAllyTrait.trait !== 'banding') report(`${tag} perAllyTrait.trait「${t.perAllyTrait.trait}」非法（束带家族）`);
        const vals = Object.values(t.perAllyTrait.gains).filter((v) => v !== 0);
        if (vals.length === 0 || vals.some((v) => v < 1 || v > 20)) report(`${tag} perAllyTrait.gains 异常`);
      }
      for (const [field, s] of [['onAllyCastStatus', t.onAllyCastStatus], ['onEnemyCastStatus', t.onEnemyCastStatus]] as const) {
        if (!s) continue;
        if (!['self', 'randomAlly', 'randomEnemy'].includes(s.scope)) report(`${tag} ${field}.scope「${s.scope}」非法`);
        if (!s.statuses || s.statuses.length === 0) report(`${tag} ${field} 缺 statuses`);
        for (const st of s.statuses ?? []) {
          if (!ENGINE_STATUS_IDS.has(st.id)) report(`${tag} ${field} 状态「${st.id}」引擎未实现`);
          if (st.magnitude !== undefined && !['poison', 'burning', 'bleed'].includes(st.id)) {
            report(`${tag} ${field} 非 DoT 状态不应带 magnitude（${st.id}）`);
          }
        }
        if (!(s.turns >= 1 && s.turns <= 9)) report(`${tag} ${field}.turns=${s.turns} 异常`);
        if (s.chance !== undefined && !(s.chance > 0 && s.chance <= 1)) report(`${tag} ${field}.chance=${s.chance} 异常`);
      }
      if (t.onAllyCastEnemyDrain) {
        const s = t.onAllyCastEnemyDrain;
        if (!['hp', 'attack', 'armor', 'magic', 'mana', 'random'].includes(s.stat)) report(`${tag} onAllyCastEnemyDrain.stat「${s.stat}」非法`);
        if (!(s.amount >= 1 && s.amount <= 20)) report(`${tag} onAllyCastEnemyDrain.amount=${s.amount} 异常`);
        if (s.scope !== 'allEnemies') report(`${tag} onAllyCastEnemyDrain.scope「${s.scope}」非法`);
      }
      for (const [field, s] of [['turnStartEconomy', t.turnStartEconomy], ['onAllyCastEconomy', t.onAllyCastEconomy], ['onDamagedEconomy', t.onDamagedEconomy]] as const) {
        if (!s) continue;
        if (!['gold', 'souls', 'gems'].includes(s.currency)) report(`${tag} ${field}.currency「${s.currency}」非法`);
        if (!(s.amount >= 1 && s.amount <= 50)) report(`${tag} ${field}.amount=${s.amount} 异常`);
      }
      if (t.turnStartSummon) {
        const s = t.turnStartSummon;
        if (!(s.chance > 0 && s.chance <= 1)) report(`${tag} turnStartSummon.chance=${s.chance} 异常`);
        if (!s.troopId || !s.referenceName || !s.displayName) report(`${tag} turnStartSummon 缺 troopId/referenceName/displayName`);
        if (s.displayName && !OFFICIAL_TROOP_NAMES.has(s.displayName)) {
          report(`${tag} turnStartSummon.displayName「${s.displayName}」在兵种数据中不存在`);
        }
      }
      if (t.turnStartStorm) {
        const s = t.turnStartStorm;
        if (!s.referenceName || !s.displayName) report(`${tag} turnStartStorm 缺 referenceName/displayName`);
        if (!s.colors || s.colors.length === 0 || s.colors.some((c) => !BASE_COLORS.has(c as BaseColor))) {
          report(`${tag} turnStartStorm.colors 非法`);
        }
        if (s.dropKind !== undefined && !['skull', 'doomSkull', 'uberDoomSkull'].includes(s.dropKind)) {
          report(`${tag} turnStartStorm.dropKind「${s.dropKind}」非法`);
        }
      }
      if (t.mode !== undefined && t.mode !== 'pvp') report(`${tag} mode 只允许 'pvp'`);
      if (t.pvpBonus) {
        const s = t.pvpBonus;
        if (!['attack', 'defense', 'battle'].includes(s.phase)) report(`${tag} pvpBonus.phase「${s.phase}」非法`);
        const vals = Object.values(s.gains).filter((v) => v !== 0);
        if (vals.length === 0 || vals.some((v) => v < 1 || v > 20)) report(`${tag} pvpBonus.gains 异常`);
      }
      if (t.mode === 'pvp' && !t.pvpBonus) report(`${tag} mode='pvp' 但缺 pvpBonus`);
    }
  });
  it('全部条目结构合法、数值在合理区间、引用真实存在', () => expectNoProblems(problems, '数据完整性'));
});

describe('B · 编译契约', () => {
  /** 编译器消费的全部效果键（resolvePassives 读取点；不含定义直读 6 键） */
  const COMPILED_KEYS = new Set([
    ...TRIGGER_FIELDS,
    'skullDamageReduction', 'spellDamageReduction', 'reflectSkullRatio', 'dodgeChance',
    'statusImmunities', 'regen', 'onColorMatchGain', 'manaLink',
    'skullMultVsTroopType', 'skullMultVsStatus', 'skullMultVsColor', 'skullMultVsWounded',
    'armorPierceChance', 'untargetable', 'inflictOnSkullHit', 'inflictOnSkullDamaged',
    'onBigMatchTypeAura',
    'summonOnDeath', 'summonOnAllyDeath', 'summonOnEnemyDeath',
    // 条件光环批（窗口 E）
    'onBigMatchStatus', 'onBigMatchSizedGain', 'onColorMatchTypeAura',
    'onBigMatchCleanse', 'onColorMatchCleanse', 'onEnemyColorMatchGain',
    // T5 配色状态批（molten/sunfire/foxfire…「配对X色→随机敌人施加状态」族）
    'onColorMatchStatus',
    // T5 三机制批：配色窃取生命（corruption 族）/ 大连技能伤害（shock 族）/ 大连敌减（suppression 族）
    'onColorMatchDrain', 'onBigMatchDamage', 'onBigMatchEnemyDrain',
    // 战后经济批（窗口 E，merchant/necromancy 族）
    'battleEconomyGain',
    // T2 死亡钩子批：双状态诅咒列表 + 敌人身亡状态/种族光环/另一名敌人施状态
    'inflictOnSkullDamagedList', 'onEnemyDeathStatus', 'onEnemyDeathTypeAura', 'onEnemyDeathEnemyStatus',
    // 条件经济光环批（greedy/extremegreed/pillageandplunder/darkensouls）
    'onBigMatchEconomy', 'onSkullMatchEconomy',
    // O 桶判读批：受击下潜 / 身亡经济 / 法力操作免疫（battleStartDestroy 为定义直读）
    'onDamagedStatus', 'onDeathEconomy', 'manaOpsImmunity',
    // T4 宝石创造批：身亡创造（unstablecore）/ 大连创造（wildtribe/wildmagic/twinfires/spectromancy）
    'onDeathCreateGem', 'onBigMatchCreateGem',
    // T5 杂项机制批：配对转换（trascend）/ 配对召唤（genieslamp）/ 配对风暴（deadlywaters）/
    // 配对即杀（deathbelow）/ 配色伤害（lumpofcoal/dawnslayer/sleetstorm）
    'onBigMatchConvert', 'onBigMatchSummon', 'onBigMatchStorm', 'onBigMatchKill', 'onColorMatchDamage',
    // 核对修正批：多状态屠戮（lethaltoxin）/ virtue 家族三种队伍光环变体
    'skullMultVsStatusList', 'onAllyDeathTypeAura', 'onAllyCastTypeAura', 'onDamagedTypeAura',
    // 模式专属特质批（淘宝/晋升/赏金语义）：deep* 族 onDelveGain、bountyhunter onDelveBounty、
    // pathfinder onDelveMiles、godslayer/siegebreaker vsAscendedMultiplier——编译进 passive
    // 但标准战斗结算路径**不消费**（惰性），traitModeSpecific.test.ts 专设断言
    'onDelveGain', 'onDelveBounty', 'onDelveMiles', 'vsAscendedMultiplier',
    // 战斗机制批：jinx 敌方宝石灵力减半 / indigestible 吞噬免疫（数据字段，吞噬落地时消费）/
    // goodtarot+badtarot 施法随机状态
    'enemyMasteryMult', 'devourImmunity', 'onAllyCastRandomStatus',
    // 缺口清扫批：施法显式状态（moonfestival 族）+ 施法敌方削减（psychicaffliction/succumb）+
    // 惰性经济/召唤/风暴（goldenhoard/harpyflock/snowstorm 族，钩子落地时消费）+
    // PVP 限定（defender/siege/virtueofhonor，mode:'pvp' 惰性建模）
    'onAllyCastStatus', 'onEnemyCastStatus', 'onAllyCastEnemyDrain',
    'turnStartEconomy', 'onAllyCastEconomy', 'onDamagedEconomy',
    'turnStartSummon', 'turnStartStorm',
    'mode', 'pvpBonus',
  ]);

  /**
   * 定义直读族：不走 resolvePassives，由钩子直接读 getTrait(code)
   * （applyBattleStartTraits 读 teamAura/typeAura/perAllyColor/battleStartManaRatio，
   *   TurnEngine.applyTurnStartBoardTraits 读 turnStart*）。
   * 它们不进 passive 是架构现状，由 D 段接线检查 + C 段文本对账覆盖。
   * 注：死亡召唤三字段经 resolvePassives 编译进 passive（TurnEngine 读 passivesOf），
   * 属编译族，不在此列。
   */
  const DEFINITION_READ_KEYS = new Set([
    'teamAura', 'typeAura', 'perAllyColor', 'battleStartManaRatio',
    'turnStartCreateGem', 'turnStartColorToSkull', 'battleStartStorm',
    // T4 宝石创造批：回合开始创造/转换特殊宝石（TurnEngine.applyTurnStartBoardTraits 直读）
    'turnStartCreateSpecialGem', 'turnStartColorToSpecial',
    // O 桶判读批：开局爆破（omenof* 族，TurnEngine 构造期读 getTrait）
    'battleStartDestroy',
    // 战斗机制批：位次条件光环（leader/general/goblord，applyPositionAuras 直读 getTrait）
    'positionAura',
    // 缺口清扫批：种族开局法力 / 开局范围光环 / 束带计数（applyBattleStartTraits 直读）/
    // 回合开始范围光环（applyTurnStartPassives 直读）
    'allyStartMana', 'battleStartTypeAura', 'perAllyTrait', 'turnStartTypeAura',
  ]);

  it('生成器产出的每个效果键都被引擎消费（编译器或定义直读，二者其一）', () => {
    const orphan = collect((report) => {
      for (const t of ALL) {
        for (const k of Object.keys(t)) {
          if (!META_KEYS.has(k) && !COMPILED_KEYS.has(k) && !DEFINITION_READ_KEYS.has(k)) {
            report(`${t.code} 的效果键「${k}」既不被编译也不被直读`);
          }
        }
      }
    });
    expectNoProblems(orphan, '孤立效果键');
  });

  it('编译族每条特质编译后都产生可观测差异；定义直读族不允许混入编译键', () => {
    const dead = collect((report) => {
      const neutral = JSON.stringify(neutralPassives());
      for (const t of ALL) {
        const keys = Object.keys(t).filter((k) => !META_KEYS.has(k));
        const hasCompiledKey = keys.some((k) => COMPILED_KEYS.has(k));
        const hasDirectKey = keys.some((k) => DEFINITION_READ_KEYS.has(k));
        const compiled = JSON.stringify(resolvePassives([t.code]));
        if (hasCompiledKey && compiled === neutral) report(`${t.code} 编译结果与无特质完全相同（效果丢失）`);
        if (!hasCompiledKey && !hasDirectKey) report(`${t.code} 既无编译键也无直读键`);
      }
    });
    expectNoProblems(dead, '编译无差异');
  });

  it('编译是纯函数：同一输入两次结果一致，且不改写入参', () => {
    const ids = implementedTraitIds();
    const a = JSON.stringify(resolvePassives(ids));
    const b = JSON.stringify(resolvePassives(ids));
    expect(a).toBe(b);
  });
});

describe('C · 描述↔数值一致性（从官方文本重新抽数对账）', () => {
  const num = (s: string) => Number(s);
  const problems = collect((report) => {
    const tag = (t: TraitDefinition) => `${t.code}(${t.troops}次)`;
    const statOf = (w: string) => STAT_OF_WORD[w] ?? `?${w}`;
    const pickColorOf = (w: string) => COLOR_OF_WORD[w.replace(/宝石$/, '').replace(/色$/, '')] ?? null;

    for (const t of ALL) {
      const d = t.description;
      // 减伤族：百分比必须与描述一致
      if (t.skullDamageReduction !== undefined) {
        const m = /降低来自骷髅头的伤害\s*(\d+)%/.exec(d) ?? /消除\s*(\d+)%\s*的骷髅头伤害/.exec(d);
        if (!m || num(m[1]) / 100 !== t.skullDamageReduction) {
          report(`${tag(t)} 骷髅减伤描述「${d.slice(0, 30)}」与 ${t.skullDamageReduction} 不符`);
        }
      }
      if (t.spellDamageReduction !== undefined) {
        const m = /降低来自法术的伤害\s*(\d+)%/.exec(d);
        if (!m || num(m[1]) / 100 !== t.spellDamageReduction) report(`${tag(t)} 法术减伤与描述不符`);
      }
      if (t.dodgeChance !== undefined) {
        // 闪避（agile）/ 躲避（dontblink）两种机翻动词都认
        const m = /有\s*(\d+)%\s*的?几率(?:闪避|躲避)骷髅头伤害/.exec(d);
        if (!m || num(m[1]) / 100 !== t.dodgeChance) report(`${tag(t)} 闪避率与描述不符`);
      }
      if (t.reflectSkullRatio !== undefined) {
        const m = /(?:反弹|反射)\s*(\d+)%\s*的骷髅(?:头)?伤害/.exec(d);
        if (!m || num(m[1]) / 100 !== t.reflectSkullRatio) report(`${tag(t)} 反弹比例与描述不符`);
      }
      if (t.armorPierceChance !== undefined) {
        // armorpiercing/trueshot「略过护甲值」/ savagestrike「忽略护甲值」两种译法都认
        const m = /骷髅头伤害有\s*(\d+)%\s*的?几率略过护甲值/.exec(d)
          ?? /有\s*(\d+)%\s*的?几率忽略护甲值/.exec(d);
        if (!m || num(m[1]) / 100 !== t.armorPierceChance) report(`${tag(t)} 穿甲率与描述不符`);
      }
      if (t.battleStartManaRatio !== undefined) {
        const expectRatio = /全满/.test(d) ? 1 : (num(/(\d+)%\s*法力/.exec(d)?.[1] ?? '-1') / 100);
        if (t.battleStartManaRatio !== expectRatio) report(`${tag(t)} 开局法力比例与描述不符`);
      }
      // 回合恢复。三种句式：恢复/获得 N 点X（aspectofwar）/ N 个随机技能值（heofmanyparts）/
      // 属性词前置共享数值（wildhorns「攻击力、生命值和护甲值获得2点提升」→ stat+alsoStats）。
      if (t.regen) {
        const statFirst = /((?:随机技能值|生命值|护甲值|攻击力|魔法值)(?:[、和](?:\s*\d+\s*点)?(?:随机技能值|生命值|护甲值|攻击力|魔法值))*)获得\s*(\d+)\s*点/.exec(d);
        const m = statFirst ? null
          : /(?:恢复|获得)\s*(\d+)\s*[点个](随机技能值|生命值|护甲值|攻击力|魔法值)/.exec(d);
        if (statFirst) {
          const words = statFirst[1].split(/[、和]/).map((s) => s.replace(/\s*\d+\s*点/g, '').trim()).filter(Boolean);
          const expected: string[] = words.map(statOf);
          const all: string[] = [t.regen.stat, ...(t.regen.alsoStats ?? [])];
          const ok = num(statFirst[2]) === t.regen.amount
            && expected.length === all.length && expected.every((s) => all.includes(s));
          if (!ok) report(`${tag(t)} 再生（共享数值多属性）与描述不符`);
        } else if (!m || num(m[1]) !== t.regen.amount || statOf(m[2]) !== t.regen.stat) {
          report(`${tag(t)} 再生数值/属性与描述不符`);
        }
      }
      // 触发类增益：获得 N 点 X；「给予所有盟友 N 颗/点 X」的旧实现同口径。
      // sacrifice「所有技能增加 N 点」（属性词在数词前）单独对账：官方「Gain N to all Skills」
      // = 四项各 N（stat 首属性 hp + alsoStats 其余三项）；
      // insanegrowth「随机一项技能获得 N 点」= 随机技能值（randomStat 口径 → magic）。
      if (t.onEnemyDeathGain && /所有技能增加/.test(d)) {
        const m = /所有技能增加\s*(\d+)\s*点/.exec(d);
        const g = t.onEnemyDeathGain;
        const four = ['hp', 'armor', 'attack', 'magic'] as const;
        const statsOk = g.stat === 'hp' && (g.alsoStats?.length ?? 0) === 3
          && four.every((s) => s === g.stat || g.alsoStats?.includes(s));
        if (!m || num(m[1]) !== g.amount || !statsOk) {
          report(`${tag(t)} onEnemyDeathGain（所有技能）数值/属性与描述不符`);
        }
      } else if (t.onBigMatchGain && /随机一项?技能获得/.test(d)) {
        const m = /随机一项?技能获得\s*(\d+)\s*点/.exec(d);
        if (!m || num(m[1]) !== t.onBigMatchGain.amount || t.onBigMatchGain.stat !== 'magic') {
          report(`${tag(t)} onBigMatchGain（随机一项技能）数值/属性与描述不符`);
        }
      } else for (const field of TRIGGER_FIELDS) {
        const gain = t[field] as { stat: string; amount: number } | undefined;
        if (!gain) continue;
        const m = /(?:获得|给[予]?所有盟友)\s*(\d+)\s*[颗点](随机技能值|生命值|护甲值|攻击力|魔法值|法力值)/.exec(d);
        if (!m || num(m[1]) !== gain.amount || statOf(m[2]) !== gain.stat) {
          report(`${tag(t)} ${field} 数值/属性与描述不符`);
        }
      }
      // T2 死亡钩子批：敌人身亡的状态/种族光环/另一名敌人施状态对账
      if (t.onEnemyDeathStatus) {
        if (!/敌人身亡/.test(d)) report(`${tag(t)} onEnemyDeathStatus 但描述没有「敌人身亡」`);
        const wordOf: Record<string, string> = { 狂怒: 'rage', 屏障: 'barrier', 反射: 'reflect', 赐福: 'blessed' };
        const m = /获得(狂怒|屏障|反射|赐福)效果/.exec(d);
        if (!m || wordOf[m[1]] !== t.onEnemyDeathStatus.id) {
          report(`${tag(t)} onEnemyDeathStatus 状态词与「${t.onEnemyDeathStatus.id}」不符`);
        }
      }
      if (t.onEnemyDeathTypeAura) {
        if (!/敌人身亡时/.test(d)) report(`${tag(t)} onEnemyDeathTypeAura 但描述没有「敌人身亡时」`);
        // lordofdeath「在一名敌人身亡时获得 N 点…」/ virtueofjustice「当敌人身亡时，所有盟友获得 N 点…」
        const m = /敌人身亡时[，,]?(?:所有盟友获得|获得)\s*(\d+)\s*点/.exec(d);
        const vals = Object.values(t.onEnemyDeathTypeAura.gains).filter((v) => v !== 0);
        if (!m || vals.length === 0 || vals.some((v) => v !== num(m[1]))) {
          report(`${tag(t)} onEnemyDeathTypeAura 数值与描述不符`);
        }
      }
      // virtue 家族队伍光环变体：盟友身亡 / 盟友施法 / 自身承伤（'all'=全队，数值与描述一致）
      if (t.onAllyDeathTypeAura) {
        if (!/盟友身亡时/.test(d)) report(`${tag(t)} onAllyDeathTypeAura 但描述没有「盟友身亡时」`);
        const m = /盟友身亡时[，,]?所有盟友获得\s*(\d+)\s*点/.exec(d);
        const vals = Object.values(t.onAllyDeathTypeAura.gains).filter((v) => v !== 0);
        if (!m || vals.length === 0 || vals.some((v) => v !== num(m[1]))) {
          report(`${tag(t)} onAllyDeathTypeAura 数值与描述不符`);
        }
      }
      if (t.onAllyCastTypeAura) {
        if (!/盟友施放法术时/.test(d)) report(`${tag(t)} onAllyCastTypeAura 但描述没有「盟友施放法术时」`);
        const m = /盟友施放法术时[，,]?所有盟友获得\s*(\d+)\s*点/.exec(d);
        const vals = Object.values(t.onAllyCastTypeAura.gains).filter((v) => v !== 0);
        if (!m || vals.length === 0 || vals.some((v) => v !== num(m[1]))) {
          report(`${tag(t)} onAllyCastTypeAura 数值与描述不符`);
        }
      }
      if (t.onDamagedTypeAura) {
        if (!/承受伤害时/.test(d)) report(`${tag(t)} onDamagedTypeAura 但描述没有「承受伤害时」`);
        const m = /承受伤害时[，,]?所有盟友获得\s*(\d+)\s*点/.exec(d);
        const vals = Object.values(t.onDamagedTypeAura.gains).filter((v) => v !== 0);
        if (!m || vals.length === 0 || vals.some((v) => v !== num(m[1]))) {
          report(`${tag(t)} onDamagedTypeAura 数值与描述不符`);
        }
      }
      if (t.onEnemyDeathEnemyStatus && !/敌人身亡/.test(d)) {
        report(`${tag(t)} onEnemyDeathEnemyStatus 但描述没有「敌人身亡」`);
      }
      // O 桶判读批：四新键描述↔数值对账（含受击获得正面状态变体：aquatic 下潜 /
      // reflectivesurface 反射 / raging 激怒自身）
      if (t.onDamagedStatus) {
        const wordOf: Record<string, string> = {
          下潜: 'submerged', 反射: 'reflect', 狂怒: 'rage', 屏障: 'barrier', 赐福: 'blessed',
        };
        const m = /受到伤害时[，,]?(?:使自身(下潜|反射|狂怒|屏障|赐福)|获得(下潜|反射|狂怒|屏障|赐福)|激怒自身)/.exec(d);
        const word = m ? (m[1] ?? m[2] ?? '狂怒') : null;
        if (!m || wordOf[word!] !== t.onDamagedStatus.statusId) {
          report(`${tag(t)} onDamagedStatus 与描述「${d}」不符`);
        }
      }
      if (t.onDeathEconomy) {
        const m = /在自身身亡时获得\s*(\d+)\s*(黄金|灵魂)。?$/.exec(d);
        const currency = m ? (m[2] === '黄金' ? 'gold' : 'souls') : null;
        if (!m || num(m[1]) !== t.onDeathEconomy.amount || currency !== t.onDeathEconomy.currency) {
          report(`${tag(t)} onDeathEconomy 与描述不符`);
        }
      }
      // T4 宝石创造批：身亡创造（编译族）的数量与宝石词对账
      if (t.onDeathCreateGem) {
        const m = /在?我(?:身亡时|死亡时|死[后亡])时?[，,]?创[建造成]出?\s*(一|\d+)\s*[颗个]/.exec(d);
        if (!m) report(`${tag(t)} onDeathCreateGem 但描述不是身亡创造句式`);
        else if (num(m[1]) !== t.onDeathCreateGem.count) {
          report(`${tag(t)} onDeathCreateGem.count=${t.onDeathCreateGem.count} 与描述「${m[1]}」不符`);
        }
        const word = GEM_WORD_OF[t.onDeathCreateGem.gem];
        if (!word || !word.test(d)) report(`${tag(t)} onDeathCreateGem.gem「${t.onDeathCreateGem.gem}」在描述中无对应宝石词`);
      }
      // T4 宝石创造批：大连创造（编译族）的句式/概率/数量/tier/宝石词对账
      if (t.onBigMatchCreateGem) {
        const s = t.onBigMatchCreateGem;
        if (!/(?:在?配对|匹配)\s*4\s*颗?\s*或\s*更?多/.test(d)) report(`${tag(t)} onBigMatchCreateGem 但描述不是 4+ 连句式`);
        const chanceM = /有\s*(\d+)\s*%\s*的?几[率会]/.exec(d);
        const expectChance = chanceM ? num(chanceM[1]) / 100 : undefined;
        if (s.chance !== expectChance) report(`${tag(t)} onBigMatchCreateGem.chance=${s.chance} 与描述不符`);
        const cm = /(?:创[建造成]|生成)出?\s*(?:(一|\d+)\s*[颗个])?/.exec(d);
        const expectCount = cm && cm[1] !== undefined ? (cm[1] === '一' ? 1 : num(cm[1])) : 1;
        if (s.count !== expectCount) report(`${tag(t)} onBigMatchCreateGem.count=${s.count} 与描述「${expectCount}」不符`);
        if (s.gem === 'wildcard') {
          const tm = /x(\d)\s*通配/.exec(d);
          if (!tm || num(tm[1]) !== s.tier) report(`${tag(t)} 通配 tier=${s.tier} 与描述不符`);
        }
        const word = GEM_WORD_OF[s.gem];
        if (!word || !word.test(d)) report(`${tag(t)} onBigMatchCreateGem.gem「${s.gem}」在描述中无对应宝石词`);
      }
      // T5 杂项机制批：新键描述↔数值对账
      if (t.onBigMatchConvert) {
        const m = /在配对\s*4\s*或\s*5\s*颗宝石时[，,]?将\s*(\d+)\s*点生命值替换成\s*(\d+)\s*点魔法值/.exec(d);
        if (!m || num(m[1]) !== num(m[2]) || num(m[1]) !== t.onBigMatchConvert.amount) {
          report(`${tag(t)} onBigMatchConvert 与描述「${d}」不符`);
        }
      }
      if (t.onBigMatchSummon) {
        const m = /有\s*(\d+)\s*%\s*的?几率召唤一?[名只个头]?(.+?)。?$/.exec(d);
        if (!m || num(m[1]) / 100 !== t.onBigMatchSummon.chance) {
          report(`${tag(t)} onBigMatchSummon.chance=${t.onBigMatchSummon.chance} 与描述不符`);
        } else if (m[2].trim() !== t.onBigMatchSummon.displayName) {
          report(`${tag(t)} onBigMatchSummon.displayName「${t.onBigMatchSummon.displayName}」与描述「${m[2]}」不符`);
        }
      }
      if (t.onBigMatchStorm) {
        const m = /宝石的?时[，,]?(?:创[建造成]|召唤)出?(.+?)。?$/.exec(d);
        if (!m || m[1] !== t.onBigMatchStorm.displayName || !/风暴$/.test(m[1])) {
          report(`${tag(t)} onBigMatchStorm.displayName「${t.onBigMatchStorm.displayName}」与描述「${d}」不符`);
        }
      }
      if (t.onBigMatchKill) {
        const m = /有\s*(\d+)\s*%\s*的?几率猎杀最后一名敌人/.exec(d);
        if (!m || num(m[1]) / 100 !== t.onBigMatchKill.chance) {
          report(`${tag(t)} onBigMatchKill.chance=${t.onBigMatchKill.chance} 与描述「${d}」不符`);
        }
      }
      // 配色伤害：randomEnemy=「对一名随机敌人」（lumpofcoal 族）/ allEnemies=「对所有敌人」
      //（缺口清扫批 spiny/spiky「在自身配对骷髅头时，对所有敌人造成 N 点伤害」）
      if (t.onColorMatchDamage) {
        const s = t.onColorMatchDamage;
        const allM = /在自身配对骷髅头(?:宝石)?时[，,]?对所有敌人造成\s*(\d+)\s*点伤害/.exec(d);
        const m = allM
          ?? /在?配对(.+?)宝石的?时[，,]?对一名随机敌人造成\s*(\d+)\s*点伤害/.exec(d);
        if (allM) {
          if (s.scope !== 'allEnemies' || s.color !== 'skull' || num(allM[1]) !== s.amount) {
            report(`${tag(t)} onColorMatchDamage（全体骷髅）与描述「${d}」不符`);
          }
        } else {
          const expectColor = m ? pickColorOf(m[1]) : null;
          if (!m || num(m[2]) !== s.amount || expectColor !== s.color || (s.scope ?? 'randomEnemy') !== 'randomEnemy') {
            report(`${tag(t)} onColorMatchDamage 与描述「${d}」不符`);
          }
        }
      }
      if (t.manaOpsImmunity && !/对法力灼烧、法力耗尽和法力窃取免疫/.test(d)) {
        report(`${tag(t)} manaOpsImmunity 但描述不是法力操作免疫句式`);
      }
      if (t.battleStartDestroy) {
        const m = /在战斗开始的时候爆破一颗(.+?)。?$/.exec(d);
        if (!m) {
          report(`${tag(t)} battleStartDestroy 但描述没有开局爆破句式`);
        } else if (t.battleStartDestroy.kind === 'skull') {
          if (m[1] !== '骷髅头') report(`${tag(t)} battleStartDestroy=skull 但描述是「${m[1]}」`);
        } else {
          const color = pickColorOf(m[1].replace(/宝石$/, ''));
          if (color === null || color !== t.battleStartDestroy.color) {
            report(`${tag(t)} battleStartDestroy.color「${t.battleStartDestroy.color}」与描述「${m[1]}」不符`);
          }
        }
      }
      // 双状态诅咒族：描述必须是「陷入X和Y状态」句式，条目数与描述段数一致
      if (t.inflictOnSkullDamagedList) {
        const m = /陷入(.+?)状态/.exec(d);
        const parts = m ? m[1].split('和').filter((s) => s.trim() !== '') : [];
        if (parts.length !== t.inflictOnSkullDamagedList.length) {
          report(`${tag(t)} 双状态条数 ${t.inflictOnSkullDamagedList.length} 与描述「${m?.[1] ?? d}」不符`);
        }
      }
      // 战斗机制批：描述↔数值对账
      if (t.enemyMasteryMult !== undefined) {
        const m = /将敌人的宝石灵力减半/.test(d);
        if (!m || t.enemyMasteryMult !== 0.5) {
          report(`${tag(t)} enemyMasteryMult=${t.enemyMasteryMult} 与描述「${d}」不符`);
        }
      }
      if (t.devourImmunity && !/对吞噬免疫/.test(d)) {
        report(`${tag(t)} devourImmunity 但描述不是吞噬免疫句式`);
      }
      if (t.positionAura) {
        const s = t.positionAura;
        const m = /(?:当|如果)军队位于(首位|末位)/.exec(d);
        const expectPos = m ? (m[1] === '首位' ? 'front' : 'last') : null;
        const allM = /全部技能值将增加\s*(\d+)\s*点/.exec(d);
        const oneM = /获得\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)/.exec(d);
        const expectGains = allM
          ? { hp: num(allM[1]), armor: num(allM[1]), attack: num(allM[1]), magic: num(allM[1]) }
          : oneM ? { [statOf(oneM[2])]: num(oneM[1]) } : null;
        if (!m || s.position !== expectPos || !expectGains
          || JSON.stringify(s.gains) !== JSON.stringify(expectGains)) {
          report(`${tag(t)} positionAura ${JSON.stringify(s)} 与描述「${d}」不符`);
        }
      }
      if (t.onAllyCastRandomStatus) {
        const m = /盟友施(?:放|法)法?术?时[，,]?使一名随机(盟友|敌人)陷入一个状态效果/.test(d);
        const expectScope = /使一名随机盟友/.test(d) ? 'randomAlly'
          : /使一名随机敌人/.test(d) ? 'randomEnemy' : null;
        if (!m || t.onAllyCastRandomStatus.scope !== expectScope) {
          report(`${tag(t)} onAllyCastRandomStatus.scope「${t.onAllyCastRandomStatus.scope}」与描述「${d}」不符`);
        }
      }
      // 光环族
      if (t.teamAura) {
        const m = /所有(盟友|敌人)(获得|损失)\s*(\d+)\s*点?(随机技能值|生命值|护甲值|攻击力|魔法值)/.exec(d);
        const expected = m ? (m[2] === '获得' ? num(m[3]) : -num(m[3])) : NaN;
        if (!m || expected !== t.teamAura.amount || statOf(m[4]) !== t.teamAura.stat) {
          report(`${tag(t)} teamAura 与描述不符`);
        }
      }
      if (t.typeAura) {
        const m = /盟友获得\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)/.exec(d);
        if (!m || num(m[1]) !== t.typeAura.amount || statOf(m[2]) !== t.typeAura.stat) {
          report(`${tag(t)} typeAura 与描述不符`);
        }
      }
      if (t.onColorMatchGain) {
        if (t.onColorMatchGain.color === 'skull') {
          // 骷髅键（T5 批 manifestation/hunger）：「配对骷髅头（宝石）时全部/所有技能值
          // （将）增加 N 点」= 持有者四项各 N；色键必须来自骷髅句式（配色光环同款防呆）
          const m = /配对骷髅头(?:宝石)?时[，,]?(?:全部|所有)技能值?(?:将)?增加\s*(\d+)\s*点/.exec(d);
          const g = t.onColorMatchGain;
          const four = ['hp', 'armor', 'attack', 'magic'] as const;
          const statsOk = (g.alsoStats?.length ?? 0) === 3
            && four.every((s) => s === g.stat || g.alsoStats?.includes(s));
          if (!m || num(m[1]) !== g.amount || !statsOk) {
            report(`${tag(t)} 骷髅配色触发与描述不符`);
          }
        } else {
          // boo/firewall 族带逗号、royalfire「点 攻击力」带空格；dwarvenfortress「获得3点」
          // 无空格；guardianshield 机翻动词「活动」与「的时候」一并认
          const m = /宝石(?:的?时候?|时)[，,]?\s*(?:获得|活动)\s*(\d+)\s*点\s*(生命值|护甲值|攻击力|魔法值)/.exec(d);
          const headOk = !!m && num(m[1]) === t.onColorMatchGain.amount && statOf(m[2]) === t.onColorMatchGain.stat;
          const also = t.onColorMatchGain.alsoStats ?? [];
          if (also.length === 0) {
            if (!headOk) report(`${tag(t)} 配色触发与描述不符`);
          } else {
            // ragingbull 共享数值多属性：附加属性必须逐个出现在同一句「、和」列表里
            const wordOf: Record<string, string> = { hp: '生命值', armor: '护甲值', attack: '攻击力', magic: '魔法值', mana: '法力值' };
            const listOk = !!m && also.every((s) => wordOf[s] !== undefined && new RegExp(`[、和]\\s*(?:\\d+\\s*点)?${wordOf[s]}`).test(d));
            if (!headOk || !listOk) report(`${tag(t)} 配色触发与描述不符（共享数值多属性）`);
          }
        }
      }
      // 屠戮倍率：双/三/数字 → N 倍；「5x」（nastyteeth）与「造成 3 倍」（空格排版）都认；
      // 「基于晋升稀有度」取区间下限 3；多状态屠戮（skullMultVsStatusList）逐条同表对账
      for (const field of ['skullMultVsTroopType', 'skullMultVsStatus', 'skullMultVsColor'] as const) {
        const v = t[field] as { mult: number } | undefined;
        if (!v) continue;
        const word = /造成\s*(双|三|\d+(?:\.\d+)?)\s*(?:倍|x)/.exec(d)?.[1];
        const expected = word === '双' ? 2 : word === '三' ? 3 : word ? num(word) : 3;
        if (v.mult !== expected) report(`${tag(t)} ${field}=${v.mult} 与描述倍率 ${expected} 不符`);
      }
      if (t.skullMultVsStatusList) {
        const word = /造成\s*(双|三|\d+(?:\.\d+)?)\s*(?:倍|x)/.exec(d)?.[1];
        const expected = word === '双' ? 2 : word === '三' ? 3 : word ? num(word) : 3;
        if (t.skullMultVsStatusList.length < 2) report(`${tag(t)} skullMultVsStatusList 少于两条（双状态族专用）`);
        for (const entry of t.skullMultVsStatusList) {
          if (!ENGINE_STATUS_IDS.has(entry.status)) report(`${tag(t)} 屠戮条件状态「${entry.status}」引擎未实现`);
          if (entry.mult !== expected) report(`${tag(t)} skullMultVsStatusList=${entry.mult} 与描述倍率 ${expected} 不符`);
        }
      }
      if (t.skullMultVsWounded !== undefined && t.skullMultVsWounded < 1) {
        report(`${tag(t)} 对受伤目标倍率 ${t.skullMultVsWounded} 不大于 1`);
      }
      // 4/5 连给予盟友：共享数值（所有非零 gains 必须等于描述里的 N）。
      // 条件光环批扩展句式：「所有X盟友获得 N 点…」（获）、「全部技能值」（四项各 N）、「随机技能值」（→magic）；
      // 收编批机翻省字：「4 点生命/护甲」（bountifulgrowth/oceanswell）、「提供」动词（strengthofthepride）
      if (t.onBigMatchTypeAura) {
        const m = /[给予获提][予]?.*?(\d+)\s*点(生命值?|护甲值?|盔甲|攻击力|魔法值|全部技能值|随机技能值)/.exec(d);
        if (!m) { report(`${tag(t)} onBigMatchTypeAura 找不到描述数值`); continue; }
        const n = num(m[1]);
        const vals = Object.values(t.onBigMatchTypeAura.gains).filter((v) => v !== 0);
        // 「全部技能值」= 四项各 N；其余句式的属性个数不限（共享数值双/三属性），只对数值
        const expectedCount = m[2] === '全部技能值' ? 4 : null;
        if (vals.some((v) => v !== n) || (expectedCount !== null && vals.length !== expectedCount)) {
          report(`${tag(t)} 共享数值光环 gains=${JSON.stringify(t.onBigMatchTypeAura.gains)} 与「${n} ${m[2]}」不符`);
        }
      }
      // 配色团队光环（celestial/powerof 族 + virtueofcourage + 收编批 lifetide 族）：
      // 单属性 /「所有技能组」四项各 N /「全部技能值各 N」（四项各 N，powerof* 修正译法）
      if (t.onColorMatchTypeAura) {
        const m = /[给予提赋恢获].*?(?:全部技能值各\s*(\d+)\s*点|(\d+)\s*点?\s*(生命值|护甲值?|攻击力|魔法值|所有技能组))/.exec(d);
        if (!m) { report(`${tag(t)} onColorMatchTypeAura 找不到描述数值`); continue; }
        const n = num(m[1] ?? m[2]);
        const vals = Object.values(t.onColorMatchTypeAura.gains).filter((v) => v !== 0);
        const expectedCount = (m[1] !== undefined || m[3] === '所有技能组') ? 4 : null;
        if (vals.some((v) => v !== n) || (expectedCount !== null && vals.length !== expectedCount)) {
          report(`${tag(t)} 配色光环 gains=${JSON.stringify(t.onColorMatchTypeAura.gains)} 与「${n} ${m[2]}」不符`);
        }
        // 骷髅键必须来自骷髅句式；颜色键必须真的在描述里
        if (t.onColorMatchTypeAura.color === 'skull' && !/配对骷髅头/.test(d)) {
          report(`${tag(t)} 配色光环色键 skull 但描述没有「配对骷髅头」`);
        }
      }
      // 5 连限定自身增益（insanegrowth「配对 5 或 5 颗」）
      if (t.onBigMatchSizedGain) {
        const m = /配对\s*(\d+)\s*或\s*(\d+)\s*颗宝石时[，,]?\s*获得\s*(\d+)\s*点(随机技能值|生命值|护甲值|攻击力|魔法值|法力值)/.exec(d);
        if (!m || num(m[1]) !== t.onBigMatchSizedGain.minSize || num(m[1]) !== num(m[2])
          || num(m[3]) !== t.onBigMatchSizedGain.amount || statOf(m[4]) !== t.onBigMatchSizedGain.stat) {
          report(`${tag(t)} onBigMatchSizedGain 与描述不符`);
        }
      }
      // 敌方配色触发（rancor）
      if (t.onEnemyColorMatchGain) {
        const m = /在敌人配对骷髅头(?:宝石)?时[，,]?获得\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)/.exec(d);
        if (!m || num(m[1]) !== t.onEnemyColorMatchGain.amount || statOf(m[2]) !== t.onEnemyColorMatchGain.stat) {
          report(`${tag(t)} onEnemyColorMatchGain 与描述不符`);
        }
      }
      // 大连施加状态：概率句对账 + scope 方向粗校验
      if (t.onBigMatchStatus) {
        const s = t.onBigMatchStatus;
        const chanceM = /有\s*(\d+)%\s*的?几率/.exec(d);
        const expectChance = chanceM ? num(chanceM[1]) / 100 : undefined;
        if (s.chance !== expectChance) report(`${tag(t)} onBigMatchStatus.chance=${s.chance} 与描述不符`);
        if (s.scope === 'allAllies' && !/所有盟友|获得屏障/.test(d)) report(`${tag(t)} onBigMatchStatus.scope=allAllies 但描述没有「所有盟友」`);
        if (s.scope === 'allEnemies' && !/所有敌人/.test(d)) report(`${tag(t)} onBigMatchStatus.scope=allEnemies 但描述没有「所有敌人」`);
        if (s.scope === 'randomEnemy' && !/敌人/.test(d)) report(`${tag(t)} onBigMatchStatus.scope=randomEnemy 但描述没有「敌人」`);
        if (s.scope === 'firstEnemy' && !/第一名敌人|第一位敌人|首位敌人/.test(d)) report(`${tag(t)} onBigMatchStatus.scope=firstEnemy 但描述没有指定序敌人`);
        if (s.randomNegative && !/一个随机的状态效果/.test(d)) report(`${tag(t)} randomNegative 但描述不是随机状态句式`);
        if ((s.scope === 'randomAlly' || s.scope === 'allAllies' || s.scope === 'self') && /敌人/.test(d)) {
          report(`${tag(t)} onBigMatchStatus.scope=${s.scope} 指向己方但描述提到「敌人」`);
        }
        if (s.scope === 'self' && !/自己|获得屏障/.test(d)) report(`${tag(t)} onBigMatchStatus.scope=self 但描述没有「自己/获得」`);
        // stormshield 官方文本「一名随盟友」漏了「机」字，按「随机」容忍
        if (s.scope === 'randomAlly' && !/随机|一名随/.test(d)) report(`${tag(t)} onBigMatchStatus.scope=randomAlly 但描述没有「随机」`);
      }
      // T5 配色状态批：概率句对账 + 句式方向/颜色键/状态词逐个反查
      //（angrybear「赋予自身狂怒状态」为 scope self：目标=持有者本人，方向校验相应放宽；
      // enchantinggaze「为随机盟友附魔」为 scope randomAlly；brambleheart 机翻动词「消除」）
      if (t.onColorMatchStatus) {
        const s = t.onColorMatchStatus;
        const chanceM = /有\s*(\d+)%\s*的?几率/.exec(d);
        const expectChance = chanceM ? num(chanceM[1]) / 100 : undefined;
        if (s.chance !== expectChance) report(`${tag(t)} onColorMatchStatus.chance=${s.chance} 与描述不符`);
        if (s.scope === 'self') {
          if (!/自身|自己/.test(d) || /敌人/.test(d)) {
            report(`${tag(t)} onColorMatchStatus.scope=self 但描述不是「自身」句式`);
          }
        } else if (s.scope === 'randomAlly') {
          if (!/随机/.test(d) || !/盟友/.test(d) || /敌人/.test(d)) {
            report(`${tag(t)} onColorMatchStatus.scope=randomAlly 但描述不是「随机…盟友」句式`);
          }
        } else if (!/随机/.test(d) || !/敌人/.test(d) || /所有敌人/.test(d)) {
          report(`${tag(t)} onColorMatchStatus 但描述不是「随机…敌人」句式`);
        }
        if (s.color !== 'skull') {
          // 颜色键必须与描述一致（「在配对红色宝石时」「匹配红宝石时」→ Red，色字可省）
          const cm = /(?:在?配对|匹配|消除)(.+?)宝石/.exec(d);
          const expectColor = cm ? pickColorOf(cm[1]) : null;
          if (expectColor === null || expectColor !== s.color) {
            report(`${tag(t)} onColorMatchStatus.color「${s.color}」与描述「${cm?.[1] ?? d}」不符`);
          }
        }
        // 状态条目必须逐个在描述里有对应中文词（双状态条目序由生成器保序，此处只查存在性）
        const wordOf: Record<string, RegExp> = {
          poison: /中毒|毒药/, burning: /燃烧|妖火/, faerie_fire: /妖火|妖仙|精灵之火/,
          frozen: /冻结|冰冻/, bleed: /出血|流血/, entangle: /缠绕|纠缠/, web: /织网/,
          stun: /击晕|眩晕/, curse: /诅咒/, disease: /疾病|患病/, marked: /猎人标记/,
          rage: /狂怒|激怒/, barrier: /屏障|阻挡/, blessed: /赐福|祝福/,
          // 缺口清扫批新增状态词（法印=enchanted、死亡标记=death-mark）
          enchanted: /法印|附魔/, 'death-mark': /死亡标记|死亡印记/,
        };
        for (const st of s.statuses ?? []) {
          const re = wordOf[st.id] ?? (st.id === 'faerie-fire' ? wordOf.faerie_fire : undefined);
          if (!re || !re.test(d)) report(`${tag(t)} 配色施加状态「${st.id}」在描述中无对应状态词`);
        }
      }
      // T5 窃取批：窃取 N 点生命值 + 色键与描述一致
      //（corruption 族「窃取第一名敌人 N 点生命值」/ roseaura 族「匹配X宝石时窃取 N 条生命」，
      // 后者省略目标=首位敌人，量词「条/点」，色字可省；骷髅键须来自骷髅句式）
      if (t.onColorMatchDrain) {
        const m = /在?配对(.+?)宝石的?时[，,]?窃取(?:第一名|第一位|首位)敌人\s*(\d+)\s*点生命值/.exec(d)
          ?? /在?匹配(.+?)宝石时窃取\s*(\d+)\s*[条点]生命/.exec(d);
        const expectColor = m ? (m[1].startsWith('骷髅') ? 'skull' : pickColorOf(m[1])) : null;
        if (!m || num(m[2]) !== t.onColorMatchDrain.amount || expectColor !== t.onColorMatchDrain.color) {
          report(`${tag(t)} onColorMatchDrain 与描述「${d}」不符`);
        }
      }
      // T5 大连伤害批：对（一名随机敌人|所有敌人|最后一个敌人）造成 N 点伤害
      //（huntersclaw 机翻变体「消除 4 个或更多宝石时，对随机敌人造成 N 点伤害」同口径；
      // 缺口清扫批 attackfrombelow「对最后一个敌人」= scope lastEnemy）
      if (t.onBigMatchDamage) {
        const s = t.onBigMatchDamage;
        const m = /在配对\s*4\s*或\s*5\s*颗宝石时[，,]?对(一名随机敌人|所有敌人)造成\s*(\d+)\s*点伤害/.exec(d)
          ?? /(?:在?配对|匹配|消除)\s*4\s*[颗个]?\s*或\s*(?:更?多|5|以上)\s*[颗个]?宝石的?时[，,]?对(?:一名)?(随机敌人)造成\s*(\d+)\s*点伤害/.exec(d)
          ?? /(?:在?配对|匹配)\s*4\s*[颗个]?\s*或\s*(?:更?多|5|以上)\s*[颗个]?的?宝石的?时[，,]?对(最后一个敌人)造成\s*(\d+)\s*点伤害/.exec(d);
        const expectScope = m ? (m[1].includes('所有敌人') ? 'enemyAll' : m[1].includes('最后') ? 'lastEnemy' : 'randomEnemy') : null;
        if (!m || num(m[2]) !== s.amount || expectScope !== s.scope) {
          report(`${tag(t)} onBigMatchDamage 与描述「${d}」不符`);
        }
      }
      // T5 大连敌减批：数额/属性对账（技能值/随机技能值→magic、法力值→mana）+ scope 方向
      // （消除动词 lossofsanity / 从第一个敌人身上窃取 darksight / 所有敌人 darkness）
      if (t.onBigMatchEnemyDrain) {
        const s = t.onBigMatchEnemyDrain;
        if (!/(?:配对|匹配|消除)\s*4/.test(d)) report(`${tag(t)} onBigMatchEnemyDrain 但描述不是 4 连句式`);
        const drainStatOf = (w: string) => STAT_OF_WORD[w] ?? (w === '技能值' ? 'magic' : null);
        const m = /(损失|耗掉|消除|窃取)(?:所有敌人|一名随机敌人|第一名敌人|首位敌人|敌人)?\s*(\d+)\s*点(魔法值|技能值|攻击力|护甲值|法力值)/.exec(d)
          ?? /(?:所有敌人|一名随机敌人|第一名敌人|首位敌人|敌人)(损失|耗掉|消除)\s*(\d+)\s*点(魔法值|技能值|攻击力|护甲值|法力值)/.exec(d)
          ?? /从(?:第一个|第一位|第一名|首位)敌人身上窃取\s*(\d+)\s*点(魔法值|技能值|攻击力|护甲值|法力值)/.exec(d);
        if (!m || num(m[2]) !== s.amount || drainStatOf(m[3]) !== s.stat) {
          report(`${tag(t)} onBigMatchEnemyDrain 数额/属性与描述「${d}」不符`);
        }
        const random = /一名随机敌人/.test(d);
        const all = /所有敌人/.test(d);
        if (all && s.scope !== 'allEnemies') report(`${tag(t)} onBigMatchEnemyDrain.scope=${s.scope} 但描述是全体句`);
        if (!all && random && s.scope !== 'randomEnemy') report(`${tag(t)} onBigMatchEnemyDrain.scope=${s.scope} 但描述是随机句`);
        if (!all && !random && s.scope !== 'front') report(`${tag(t)} onBigMatchEnemyDrain.scope=${s.scope} 但描述不是随机/全体句`);
      }
      // 净化族方向校验
      if (t.onBigMatchCleanse && !/净化所有盟友/.test(d)) report(`${tag(t)} onBigMatchCleanse 但描述没有「净化所有盟友」`);
      if (t.onColorMatchCleanse && !/净化所有盟友/.test(d)) report(`${tag(t)} onColorMatchCleanse 但描述没有「净化所有盟友」`);
      // 灵链固定 +1（对象含 color/amount，只查 amount）
      if (t.manaLink && t.manaLink.amount !== 1) {
        report(`${tag(t)} manaLink 增量应为 1`);
      }
      // 阵亡/施法响应的 stat 词与字段名方向（盟友/敌人）粗校验
      if (t.onEnemyDeathGain && !/敌人身亡/.test(d)) report(`${tag(t)} onEnemyDeathGain 但描述没有「敌人身亡」`);
      if (t.onAllyDeathGain && !/盟友身亡/.test(d)) report(`${tag(t)} onAllyDeathGain 但描述没有「盟友身亡」`);
      if (t.onAllyCastGain && !/盟友施/.test(d)) report(`${tag(t)} onAllyCastGain 但描述没有「盟友施法」`);
      if (t.onEnemyCastGain && !/敌人施/.test(d)) report(`${tag(t)} onEnemyCastGain 但描述没有「敌人施法」`);

      // —— 缺口清扫批：新族描述↔数值对账 ——
      // 种族开局法力：「获得/给予/拥有/都有 … N% 法力」「初始法力值为 N%」
      if (t.allyStartMana) {
        const m = /(?:获得|给予|拥有|都有)[^0-9。]*?(\d+)\s*%\s*(?:的)?\s*法力/.exec(d) ?? /初始法力值为\s*(\d+)\s*%/.exec(d);
        if (!m || num(m[1]) / 100 !== t.allyStartMana.ratio) report(`${tag(t)} allyStartMana.ratio=${t.allyStartMana.ratio} 与描述不符`);
        if (!/战斗开始|初始/.test(d)) report(`${tag(t)} allyStartMana 但描述不是开局法力句式`);
      }
      // 开局/回合开始范围光环：全部非零 gains = 描述里的 N
      for (const [field, aura] of [['battleStartTypeAura', t.battleStartTypeAura], ['turnStartTypeAura', t.turnStartTypeAura]] as const) {
        if (!aura) continue;
        const m = /(?:全部(?:状态值|技能值)(?:将)?增加|获得|增加|给予|拥有|都有|提供)[^0-9。]*?(\d+)\s*点/.exec(d);
        const vals = Object.values(aura.gains).filter((v) => v !== 0);
        if (!m || vals.length === 0 || vals.some((v) => v !== num(m[1]))) {
          report(`${tag(t)} ${field} 数值与描述「${m?.[1] ?? d}」不符`);
        }
        if (field === 'turnStartTypeAura' && !/回合开始/.test(d)) report(`${tag(t)} turnStartTypeAura 但描述没有「回合开始」`);
        if (field === 'turnStartTypeAura' && /敌人/.test(d)) report(`${tag(t)} turnStartTypeAura 指向己方但描述提到「敌人」`);
        if (field === 'battleStartTypeAura' && /敌人/.test(d)) report(`${tag(t)} battleStartTypeAura 指向己方但描述提到「敌人」`);
      }
      // 束带计数：「每有一名拥有束带特质的盟友，获得/全部技能值各获得 N 点」
      if (t.perAllyTrait) {
        const m = /束带特质的盟友，(?:全部技能值各获得|获得)\s*(\d+)\s*点/.exec(d);
        const vals = Object.values(t.perAllyTrait.gains).filter((v) => v !== 0);
        if (!m || vals.length === 0 || vals.some((v) => v !== num(m[1]))) {
          report(`${tag(t)} perAllyTrait 数值与描述「${m?.[1] ?? d}」不符`);
        }
      }
      // 施法显式状态：概率 + scope 方向
      for (const [field, s] of [['onAllyCastStatus', t.onAllyCastStatus], ['onEnemyCastStatus', t.onEnemyCastStatus]] as const) {
        if (!s) continue;
        if (!/施(?:放|法)法?术?时/.test(d)) report(`${tag(t)} ${field} 但描述没有施法句式`);
        const chanceM = /有\s*(\d+)\s*[％%]\s*的?几率/.exec(d);
        const expectChance = chanceM ? num(chanceM[1]) / 100 : undefined;
        if (s.chance !== expectChance) report(`${tag(t)} ${field}.chance=${s.chance} 与描述不符`);
        const targetAlly = s.scope === 'randomAlly' || (s.scope === 'self' && field === 'onEnemyCastStatus');
        if (s.scope === 'randomAlly' && !/随机盟友|随机一名盟友/.test(d)) report(`${tag(t)} ${field}.scope=randomAlly 但描述没有「随机盟友」`);
        if (s.scope === 'randomEnemy' && !/随机敌人|随机一名敌人|随机敌人/.test(d)) report(`${tag(t)} ${field}.scope=randomEnemy 但描述没有「随机敌人」`);
        if (targetAlly && s.scope === 'self' && field === 'onEnemyCastStatus' && !/获得/.test(d)) {
          report(`${tag(t)} ${field}.scope=self 但描述不是「获得」句式`);
        }
      }
      // 施法敌方削减：数额与「敌人」方向
      if (t.onAllyCastEnemyDrain) {
        const s = t.onAllyCastEnemyDrain;
        const m = /(?:消除|失去)(?:所有敌人|一名随机敌人)?\s*(\d+)\s*点(魔法值|随机技能值)/.exec(d);
        const statOk = m ? (s.stat === 'magic' || s.stat === 'random') && (m[2] === '魔法值' ? s.stat === 'magic' : true) : false;
        if (!m || num(m[1]) !== s.amount || !statOk) report(`${tag(t)} onAllyCastEnemyDrain 与描述「${d}」不符`);
        if (!/所有敌人/.test(d) && s.stat !== 'random') report(`${tag(t)} onAllyCastEnemyDrain 但描述不是全体句`);
      }
      // 经济三兄弟：数额/币种与描述一致
      for (const [field, s, re] of [
        ['turnStartEconomy', t.turnStartEconomy, /回合开始(?:的时候|时)?[，,]?获得\s*(\d+)\s*个?(金币|灵魂)/],
        ['onAllyCastEconomy', t.onAllyCastEconomy, /施放法术时[，,]?获得\s*(\d+)\s*个?(金币|灵魂)/],
        ['onDamagedEconomy', t.onDamagedEconomy, /受到伤害时获得\s*(\d+)\s*(黄金|灵魂)/],
      ] as const) {
        if (!s) continue;
        const m = re.exec(d);
        const currency = m ? ((m[2] === '金币' || m[2] === '黄金') ? 'gold' : 'souls') : null;
        if (!m || num(m[1]) !== s.amount || currency !== s.currency) report(`${tag(t)} ${field} 与描述不符`);
      }
      // 回合开始召唤：概率 + 兵种名
      if (t.turnStartSummon) {
        const m = /回合开始(?:的时候|时)?[，,]?有\s*(\d+)\s*[％%]\s*的?几率召唤一?[名只个头]?(.+?)。?$/.exec(d);
        if (!m || num(m[1]) / 100 !== t.turnStartSummon.chance) report(`${tag(t)} turnStartSummon.chance 与描述不符`);
        else if (m[2].trim() !== t.turnStartSummon.displayName) {
          report(`${tag(t)} turnStartSummon.displayName「${t.turnStartSummon.displayName}」与描述「${m[2]}」不符`);
        }
      }
      // PVP 限定：必须是 PVP 句式（「玩家对决战」机翻连写一并认）
      if (t.mode === 'pvp' && !/玩家对[战决]|PVP/.test(d)) report(`${tag(t)} mode='pvp' 但描述没有 PVP 句式`);

      /** 中文风暴名 → 生成器写入的英文 referenceName 词干（开局风暴对账用） */
const CN_STORM_TO_REFERENCE: Record<string, string> = {
  光: 'Light',
  暗: 'Dark',
  火: 'Fire',
  冰: 'Ice',
  叶: 'Leaf',
  尘: 'Dust',
  骸骨: 'Bone',
  末日: 'Doom',
  超级末日: 'UberDoom',
};
// 风暴变体对账（阶段 1.3）：描述「召唤一个暗风暴」→ 必须编译为带 storm 的召唤 spec，
      // 且 displayName 与描述中的风暴名逐字一致；反向：storm spec 的描述必须真的在召唤风暴
      const stormName = /召唤一?[名只个头]?((?:超级)?末日|暗|火|冰|光|叶|尘|骸骨)风暴/.exec(d)?.[1];
      if (stormName) {
        const expected = `${stormName}风暴`;
        if (t.onBigMatchStorm) {
          // 配对风暴（deadlywaters/eternaldoom「配对时创造/召唤X风暴」）
          if (t.onBigMatchStorm.displayName !== expected) {
            report(`${tag(t)} 配对风暴 displayName「${t.onBigMatchStorm.displayName}」与描述「${expected}」不符`);
          }
        } else if (t.battleStartStorm) {
          // 开局风暴：描述「在战斗开始的时候召唤X风暴」→ 编译为 battleStartStorm。
          // 生成器写入的 displayName/referenceName 是英文官方名（Lightstorm 等），按映射对上
          const refName = CN_STORM_TO_REFERENCE[stormName];
          const bs = t.battleStartStorm;
          const named = `${bs.displayName ?? ''}${bs.referenceName ?? ''}`;
          if (!refName || !named.includes(refName)) {
            report(`${tag(t)} 开局风暴「${named}」与描述「${expected}」不符`);
          }
        } else if (t.turnStartStorm) {
          // 缺口清扫批：回合开始创造风暴（snowstorm/endlessdawn/dustplume 族）——
          // 中文描述截获词 + 风暴 = 写入的 displayName（混合双色风暴随对象建模）
          if (!t.turnStartStorm.displayName.includes(expected)) {
            report(`${tag(t)} 回合开始风暴「${t.turnStartStorm.displayName}」与描述「${expected}」不符`);
          }
        } else {
          const spec = t.summonOnDeath ?? t.summonOnAllyDeath ?? t.summonOnEnemyDeath;
          if (!spec || !spec.storm) {
            report(`${tag(t)} 描述「召唤${expected}」但未编译为风暴变体`);
          } else if (spec.displayName !== expected) {
            report(`${tag(t)} 风暴 displayName「${spec.displayName}」与描述「${expected}」不符`);
          }
        }
      }
      for (const field of ['summonOnDeath', 'summonOnAllyDeath', 'summonOnEnemyDeath'] as const) {
        const s = t[field];
        if (s?.storm && !/召唤一?[名只个头]?(?:超级)?(?:末日|暗|火|冰|光|叶|尘|骸骨)风暴/.test(d)) {
          report(`${tag(t)} ${field} 是风暴变体但描述没有「召唤…风暴」句式`);
        }
      }
    }
  });
  it('生成器写入的数值与官方描述文本逐条对账', () => expectNoProblems(problems, '描述↔数值一致性'));
});

describe('D · 接线完整性（钩子存在但没人调用 = 死角）', () => {
  const cases: [string, RegExp, () => string][] = [
    ['battle-start storm', /collectBattleStartStorms|battleStartStorm/, () => turnEngineSrc],
    ['战斗开始光环', /applyBattleStartTraits/, () => turnEngineSrc],
    ['回合开始再生', /applyTurnStartPassives/, () => turnEngineSrc],
    ['阵亡响应', /applyDeathTriggers/, () => turnEngineSrc],
    ['敌人身亡状态/光环变体', /applyEnemyDeathTriggers/, () => turnEngineSrc],
    ['4-5 连触发', /applyBigMatchTriggers/, () => turnEngineSrc],
    ['配色触发', /applyColorMatchTriggers/, () => turnEngineSrc],
    ['大连伤害/窃取生命注入', /traitDamage|traitDrainLife/, () => turnEngineSrc],
    ['施法响应', /applyCastTriggers/, () => turnEngineSrc],
    ['施法随机状态（goodtarot/badtarot）', /applyCastRandomStatusTriggers/, () => turnEngineSrc],
    ['位次条件光环（leader 族）', /applyPositionAuras/, () => turnEngineSrc],
    ['宝石灵力减半（jinx）', /distributeGemMana|masterySuppress/, () => turnEngineSrc],
    ['吞噬免疫（数据字段，吞噬落地时消费）', /devourImmunity/, () => traitsSrc],
    ['回合开始棋盘写入', /turnStartCreateGem/, () => turnEngineSrc],
    ['回合开始创造/转换特殊宝石', /turnStartCreateSpecialGem|turnStartColorToSpecial/, () => turnEngineSrc],
    ['大连创造宝石落子注入', /createGem/, () => turnEngineSrc],
    ['身亡创造宝石', /onDeathCreateGem/, () => turnEngineSrc],
    ['配对召唤/风暴/即杀注入', /traitSummon|traitSetStorm|traitKill/, () => turnEngineSrc],
    ['骷髅减伤/受击/命中/反弹/穿甲', /skullDamageTaken|inflictOnSkullHit|reflectSkullRatio/, () => combatResolverSrc],
    ['受击附状态', /inflictOnSkullDamaged/, () => combatResolverSrc],
    ['受击下潜', /onDamagedStatus/, () => combatResolverSrc],
    ['承伤队伍光环/受击法力（virtueofhumility/zornsfury）', /onDamagedTypeAura|mana/, () => combatResolverSrc],
    ['身亡经济', /onDeathEconomy/, () => turnEngineSrc],
    ['开局爆破', /battleStartDestroy/, () => turnEngineSrc],
    ['法力操作免疫', /manaOpsImmunity/, () => debuffSrc],
    ['隐匿目标过滤', /targetableFrom|isUntargetable/, () => targetingSrc],
    ['法术减伤', /spellDamageTaken/, () => damageSrc],
    ['法力灵链', /manaLink/, () => manaDistributorSrc],
    ['死亡召唤', /applyDeathSummons|summonOnDeath/, () => turnEngineSrc],
    ['风暴设置/顶替/回合递减', /setStormFromSummon|tickStorms|stormDropWeights/, () => turnEngineSrc],
    ['风暴掉落加权', /STORM_DROP_WEIGHT/, () => gravitySystemSrc],
    // 缺口清扫批：新族消费点（traits.ts 内已由 TurnEngine 调用的 apply* 函数承接）
    ['种族开局法力/开局范围光环/束带计数', /allyStartMana|battleStartTypeAura|perAllyTrait/, () => traitsSrc],
    ['回合开始范围光环', /turnStartTypeAura/, () => traitsSrc],
    ['施法显式状态/施法敌方削减', /castStatus|castEnemyDrain|onAllyCastStatus/, () => traitsSrc],
    ['复活满法力（immortal/deepsoul 族）', /fullMana/, () => traitsSrc],
    ['配色全体伤害/大连末位伤害 scope', /allEnemies|lastEnemy/, () => traitsSrc],
  ];
  it.each(cases)('%s 有真实消费点', (_name, re, src) => {
    expect(re.test(src())).toBe(true);
  });
});

describe('E · 兵种侧一致性', () => {
  it('已实现的特质 code 全部真实存在于官方 dump（防幻觉数据）', () => {
    const fabricated = implementedTraitIds().filter((code) => !OFFICIAL_CODES.has(code));
    expect(fabricated, `幻觉 code: ${fabricated.slice(0, 5).join(',')}`).toEqual([]);
  });

  it('出场覆盖率不回退（重跑生成器的回归护栏）', () => {
    const covered = ALL.reduce((s, t) => s + t.troops, 0);
    expect(covered).toBeGreaterThanOrEqual(3657);
    expect(ALL.length).toBeGreaterThanOrEqual(233);
  });

  it('每个已实现 code 在官方 dump 中确实有兵种持有', () => {
    const orphan = implementedTraitIds().filter((code) => {
      const t = getTrait(code);
      return !t || t.troops === undefined;
    });
    expect(orphan).toEqual([]);
  });
});

describe('F · 展示覆盖', () => {
  it('每个已实现特质都能产出卡面图标与可读名称（展示层不欠账）', () => {
    const missing = implementedTraitIds().filter((code) => {
      const svg = traitBadgeSvg(code);
      const def = getTrait(code);
      return !svg || !def || !def.name || !def.description;
    });
    expect(missing, `无图标/无文本: ${missing.slice(0, 5).join(',')}`).toEqual([]);
  });
});
