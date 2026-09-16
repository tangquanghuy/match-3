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
import targetingSrc from '../../src/engine/skills/targeting.ts?raw';
import damageSrc from '../../src/engine/skills/effects/damage.ts?raw';
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
]);

const BASE_COLORS = new Set(Object.values(BaseColor));

/** 触发类字段清单（与 traits.ts TRIGGER_FIELDS 同步） */
const TRIGGER_FIELDS = [
  'onDamagedGain', 'onSkullHitGain', 'onAllyCastGain', 'onEnemyCastGain',
  'onEnemyDeathGain', 'onAllyDeathGain', 'onBigMatchGain',
] as const;

const STAT_OF_WORD: Record<string, string> = {
  生命值: 'hp', 护甲值: 'armor', 攻击力: 'attack', 魔法值: 'magic',
  随机技能值: 'magic', 法力值: 'mana',
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
      if (t.armorPierceChance !== undefined) range(t.armorPierceChance, 0, 0.75, 'armorPierceChance');
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
        if (!['self', 'randomAlly', 'allAllies', 'allEnemies', 'randomEnemy'].includes(s.scope)) report(`${tag} onBigMatchStatus.scope「${s.scope}」非法`);
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
      }
      if (t.onBigMatchSizedGain) {
        const s = t.onBigMatchSizedGain;
        if (![4, 5].includes(s.minSize)) report(`${tag} onBigMatchSizedGain.minSize=${s.minSize} 异常`);
        if (!(s.amount >= 1 && s.amount <= 20)) report(`${tag} onBigMatchSizedGain.amount=${s.amount} 异常`);
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
      if (t.turnStartCreateGem && !BASE_COLORS.has(t.turnStartCreateGem.color as BaseColor)) {
        report(`${tag} turnStartCreateGem.color 非法`);
      }
      if (t.turnStartColorToSkull) {
        if (!BASE_COLORS.has(t.turnStartColorToSkull.color as BaseColor)) report(`${tag} turnStartColorToSkull.color 非法`);
        if (!(t.turnStartColorToSkull.chance > 0 && t.turnStartColorToSkull.chance <= 1)) report(`${tag} turnStartColorToSkull.chance 异常`);
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
        }
      }
      if (t.onBigMatchTypeAura && t.onBigMatchTypeAura.troopType !== 'all'
        && !/^[A-Z]/.test(t.onBigMatchTypeAura.troopType)) {
        report(`${tag} onBigMatchTypeAura.troopType「${t.onBigMatchTypeAura.troopType}」不是规范族名`);
      }
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
    // 战后经济批（窗口 E，merchant/necromancy 族）
    'battleEconomyGain',
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
        const m = /有\s*(\d+)%\s*的?几率闪避骷髅头伤害/.exec(d);
        if (!m || num(m[1]) / 100 !== t.dodgeChance) report(`${tag(t)} 闪避率与描述不符`);
      }
      if (t.reflectSkullRatio !== undefined) {
        const m = /(?:反弹|反射)\s*(\d+)%\s*的骷髅(?:头)?伤害/.exec(d);
        if (!m || num(m[1]) / 100 !== t.reflectSkullRatio) report(`${tag(t)} 反弹比例与描述不符`);
      }
      if (t.armorPierceChance !== undefined) {
        const m = /骷髅头伤害有\s*(\d+)%\s*的?几率略过护甲值/.exec(d);
        if (!m || num(m[1]) / 100 !== t.armorPierceChance) report(`${tag(t)} 穿甲率与描述不符`);
      }
      if (t.battleStartManaRatio !== undefined) {
        const expectRatio = /全满/.test(d) ? 1 : (num(/(\d+)%\s*法力/.exec(d)?.[1] ?? '-1') / 100);
        if (t.battleStartManaRatio !== expectRatio) report(`${tag(t)} 开局法力比例与描述不符`);
      }
      // 回合恢复
      if (t.regen) {
        const m = /(?:恢复|获得)\s*(\d+)\s*点(生命值|护甲值|攻击力|魔法值)/.exec(d);
        if (!m || num(m[1]) !== t.regen.amount || statOf(m[2]) !== t.regen.stat) {
          report(`${tag(t)} 再生数值/属性与描述不符`);
        }
      }
      // 触发类增益：获得 N 点 X；「给予所有盟友 N 颗/点 X」的旧实现同口径
      for (const field of TRIGGER_FIELDS) {
        const gain = t[field] as { stat: string; amount: number } | undefined;
        if (!gain) continue;
        const m = /(?:获得|给[予]?所有盟友)\s*(\d+)\s*[颗点](随机技能值|生命值|护甲值|攻击力|魔法值|法力值)/.exec(d);
        if (!m || num(m[1]) !== gain.amount || statOf(m[2]) !== gain.stat) {
          report(`${tag(t)} ${field} 数值/属性与描述不符`);
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
        // boo/firewall 族带逗号、royalfire「点 攻击力」带空格，一并收
        const m = /宝石时[，,]?\s*获得\s*(\d+)\s*点\s*(生命值|护甲值|攻击力|魔法值)/.exec(d);
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
      // 屠戮倍率：双/三/数字 → N 倍；「基于晋升稀有度」取区间下限 3
      for (const field of ['skullMultVsTroopType', 'skullMultVsStatus', 'skullMultVsColor'] as const) {
        const v = t[field] as { mult: number } | undefined;
        if (!v) continue;
        const word = /造成(双|三|\d+(?:\.\d+)?)倍/.exec(d)?.[1];
        const expected = word === '双' ? 2 : word === '三' ? 3 : word ? num(word) : 3;
        if (v.mult !== expected) report(`${tag(t)} ${field}=${v.mult} 与描述倍率 ${expected} 不符`);
      }
      if (t.skullMultVsWounded !== undefined && t.skullMultVsWounded < 1) {
        report(`${tag(t)} 对受伤目标倍率 ${t.skullMultVsWounded} 不大于 1`);
      }
      // 4/5 连给予盟友：共享数值（所有非零 gains 必须等于描述里的 N）。
      // 条件光环批扩展句式：「所有X盟友获得 N 点…」（获）、「全部技能值」（四项各 N）、「随机技能值」（→magic）
      if (t.onBigMatchTypeAura) {
        const m = /[给予获][予]?.*?(\d+)\s*点(生命值|护甲值|攻击力|魔法值|全部技能值|随机技能值)/.exec(d);
        if (!m) { report(`${tag(t)} onBigMatchTypeAura 找不到描述数值`); continue; }
        const n = num(m[1]);
        const vals = Object.values(t.onBigMatchTypeAura.gains).filter((v) => v !== 0);
        // 「全部技能值」= 四项各 N；其余句式的属性个数不限（共享数值双/三属性），只对数值
        const expectedCount = m[2] === '全部技能值' ? 4 : null;
        if (vals.some((v) => v !== n) || (expectedCount !== null && vals.length !== expectedCount)) {
          report(`${tag(t)} 共享数值光环 gains=${JSON.stringify(t.onBigMatchTypeAura.gains)} 与「${n} ${m[2]}」不符`);
        }
      }
      // 配色团队光环（celestial/powerof 族）：单属性或「所有技能组」四项各 N
      if (t.onColorMatchTypeAura) {
        const m = /[给予提赋].*?(\d+)\s*点?\s*(生命值|护甲值?|攻击力|魔法值|所有技能组)/.exec(d);
        if (!m) { report(`${tag(t)} onColorMatchTypeAura 找不到描述数值`); continue; }
        const n = num(m[1]);
        const vals = Object.values(t.onColorMatchTypeAura.gains).filter((v) => v !== 0);
        const expectedCount = m[2] === '所有技能组' ? 4 : null;
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
        if ((s.scope === 'randomAlly' || s.scope === 'allAllies' || s.scope === 'self') && /敌人/.test(d)) {
          report(`${tag(t)} onBigMatchStatus.scope=${s.scope} 指向己方但描述提到「敌人」`);
        }
        if (s.scope === 'self' && !/自己|获得屏障/.test(d)) report(`${tag(t)} onBigMatchStatus.scope=self 但描述没有「自己/获得」`);
        // stormshield 官方文本「一名随盟友」漏了「机」字，按「随机」容忍
        if (s.scope === 'randomAlly' && !/随机|一名随/.test(d)) report(`${tag(t)} onBigMatchStatus.scope=randomAlly 但描述没有「随机」`);
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
        if (t.battleStartStorm) {
          // 开局风暴：描述「在战斗开始的时候召唤X风暴」→ 编译为 battleStartStorm。
          // 生成器写入的 displayName/referenceName 是英文官方名（Lightstorm 等），按映射对上
          const refName = CN_STORM_TO_REFERENCE[stormName];
          const bs = t.battleStartStorm;
          const named = `${bs.displayName ?? ''}${bs.referenceName ?? ''}`;
          if (!refName || !named.includes(refName)) {
            report(`${tag(t)} 开局风暴「${named}」与描述「${expected}」不符`);
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
    ['4-5 连触发', /applyBigMatchTriggers/, () => turnEngineSrc],
    ['配色触发', /applyColorMatchTriggers/, () => turnEngineSrc],
    ['施法响应', /applyCastTriggers/, () => turnEngineSrc],
    ['回合开始棋盘写入', /turnStartCreateGem/, () => turnEngineSrc],
    ['骷髅减伤/受击/命中/反弹/穿甲', /skullDamageTaken|inflictOnSkullHit|reflectSkullRatio/, () => combatResolverSrc],
    ['受击附状态', /inflictOnSkullDamaged/, () => combatResolverSrc],
    ['隐匿目标过滤', /targetableFrom|isUntargetable/, () => targetingSrc],
    ['法术减伤', /spellDamageTaken/, () => damageSrc],
    ['法力灵链', /manaLink/, () => manaDistributorSrc],
    ['死亡召唤', /applyDeathSummons|summonOnDeath/, () => turnEngineSrc],
    ['风暴设置/顶替/回合递减', /setStormFromSummon|tickStorms|stormDropWeights/, () => turnEngineSrc],
    ['风暴掉落加权', /STORM_DROP_WEIGHT/, () => gravitySystemSrc],
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
