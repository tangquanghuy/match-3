# 技能组装器 · 人工核对组装 SOP（spell-assembler.md）

> **给核对组装者（人工/子 agent）的完整作业契约。** 语义依据是
> [`scripts/spell-rules.md`](./spell-rules.md)（多义句式的标准答案），本文只讲
> 「怎么把一条已读懂的技能落成组装器调用」。
>
> 背景：GoW 数据库的技能文本写法不规范、句式多变，**禁止用正则/脚本批量猜语义**。
> 每条技能必须逐条人工读懂 → 手工拼装。拼装结果必须与组装器"对号入座"：
> 类型系统 + 校验测试双重把关。

## 1. 工作流（每批 = `scripts/curated-pools/pool-XX.json`）

1. 读池文件。每条含：`spellId / troop / spellName / desc / scalings / modifier`。
2. 逐条读懂 `desc`。对照 `spell-rules.md` 定目标措辞、数值口径、多义句式。
3. 用 `src/engine/skills/builders.ts` 的构造函数拼装 `SkillPrototype`，写入批文件。
4. **拿不准 = SKIP**：把 id 和原因写进批文件顶部的 `SKIPPED` 数组，绝不猜。
   优雅退出好过错误数据——错误数据会进战斗引擎。
5. 自查（见 §5）。

## 2. 批文件模板（`src/engine/skills/curated/batch-XX.ts`）

```ts
/**
 * 人工核对组装 · 批次 XX（池：scripts/curated-pools/pool-XX.json）
 * 核对者：窗口 B（或子 agent 编号）
 */
import { skill, dmg, dmgAll, dmgSplash, trueDmg, heal, armor, attack, magic, mana,
  cleanse, reduce, drainMana, steal, randomStat, createGems, createSkulls, createMix,
  transform, destroyChosenCol, destroyChosenRow, explodeAt, destroyColor, destroySkulls,
  explodeSkulls, explodeColor, destroyRandomGems, explodeRandomGems, destroyRandomCols,
  explodeRandomCols, inflict, summonRef, summonRandom, extraTurn, flat, CHOSEN, CASTER } from '../builders';
import { BaseColor } from '../../types';
import type { CuratedBatch } from './index';

const SKIPPED: { id: number; reason: string }[] = [
  // { id: 7123, reason: '句子式不明（见 pool 原文）' },
];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7004,
    desc: '对 1 名敌人造成 [魔法 + 2] 点伤害。',
    build: skill(dmg('enemyChosen', 2)),
  },
];

export const BATCH_XX: CuratedBatch = { batch: 'XX', spells: SPELLS, skipped: SKIPPED };
```

规则：
- **`desc` 必须逐字抄录池文件原文**（含空格标点）——校验器与 `troops.json` 精确比对，错一字即构建失败。这是"对号入座"的锚。
- **`id` = 池里的 `spellId`**（不是 troopId）。
- imports 按需精简（eslint 禁未用导入）；只 import 用到的名字。
- 批内条目按 `id` 升序，方便 diff 与复核。
- 常数数值用第三参 0：`dmg('enemyChosen', 8, 0)` = 固定 8 点。

## 3. 构造函数速查（组装器词汇表 = 全部合法表达）

### 目标措辞 → TargetMode（详见 spell-rules.md §0）

| 措辞 | 值 |
|---|---|
| 1/一名(个)敌人、指定的敌人 | `'enemyChosen'` |
| 随机敌人 | `'enemyRandom'`；「N 名随机敌人」→ `'enemyRandomN'` + `n`（不重复） |
| 第一个/首名敌人 | `'enemyFront'`；「前 2 名」→ `'enemyFirstN'` + `opts.n = 2` |
| 最后一名敌人 | `'enemyLast'`；「最后两名」→ `'enemyLastN'` + `n` |
| 最虚弱的敌人 | `'enemyWeakest'`；「两名最虚弱的敌人」→ `'enemyWeakestN'` + `n` |
| 最健康的敌人 | `'enemyHealthiest'`；「N 名最健康」→ `'enemyHealthiestN'` + `n` |
| 所有敌人 | `'enemyAll'`（伤害段要 `range:'all'`，或直接 `dmgAll`） |
| 「1 名/一名敌人和其下方的所有敌人」 | `'enemyChosenAndBelow'`（指定者 + 编队更靠后的全部存活敌人；spell-rules §9.10） |
| 盟友同理（`allyChosen/allyRandom/allyRandomN/allyFront/allyFirstN/allyLast/allyLastN/allyAll/allyWeakest(N)/allyHealthiest(N)`）；自身 `'allySelf'`；「其他盟友」`'allyOthers'` | |

### 措辞裁定（本仓库引擎词汇的固定口径）
- **「魔法值」= magic 属性**（法术强度）；**「法力值 / 魔力」= mana**。窃取/给予/减除同口径。
- **「对所有敌人…散射伤害」**：散射只是伤害类型词，目标是全体 → `dmg('enemyAll', …, { range: 'all' })`；
  **「对 1 名敌人…散射/溅射」**才是溅射链 → `dmgSplash('enemyChosen', …)`。
- 「摧毁/消灭该敌人」（即杀）→ `dmg(target, 0, 0, { execute: true })`。
- **裸伤害句式（2026-09-17 用户裁定）**：「造成…点(真实/散射)伤害」无目标词 = 对 1 名敌人
  （`enemyChosen`；散射类型词走溅射链 `dmgSplash`/`dmg range:'splash'`）。此前「句子式不明」SKIP 的该族照此回收。
- 「减除(全部)生命值」「减血」→ `reduce(target, 'hp', …)`（直接扣血夹零，击杀会走 defeat）；
  「减除全部护甲值」→ `reduce(target, 'armor', 0, 0, { drainAll: true })`。
- 「恢复所有生命值」（全额治疗）→ `heal(target, 0, 0, { full: true })`。
- 「所有恶魔/兽人/X族(盟友|敌人)」种族限定目标 → 目标模式照常 + `opts.targetRace: 'Daemon'`（英文种族）。
- transform 两端可为 `'SKULL'`：`transform('Brown', 'SKULL')`（棕色宝石转骷髅头）、`transform('SKULL', 'Green')`。
- destroy/transform/explode 系构造函数没有 opts 参 → 需要挂公共选项（chance/ifTargetDied 等）时用展开：
  `{ ...destroyColor('Purple'), ifTargetDied: true }`（GemSegment 继承 SegmentOptions，合法）。
- 「将指定的法力颜色转换为X」= transform(CHOSEN, X)（『指定的法力颜色』即选色器语义，7062 先例）。
- **暂不支持 → SKIP（原因「语义拿不准」）**：跨段随机目标绑定（「对其…」指回前段随机目标）、
  条件倍率/条件触发（「如果对方使用红色法力/已陷入沉默/生命受损，则 N 倍/额外伤害」）、
  「X 名中最 Y 的」以外的复合目标、兵种转化（「转化为怨灵」）、即死概率以外的不明条件。

### 来源归属与族员自动目标（第五遍裁定）

1. **「因敌人(的)X而增强」的来源归属**（此前 8543/9596/9660/9668 卡点）：
   - 修饰段目标为**单体**（enemyChosen/enemyFront/enemyLast/enemyRandom/enemyWeakest/enemyHealthiest/enemyNth）
     → `{ kind: 'targetStat', stat }`（受击目标自己的 X）；
   - 修饰段目标为**群体**（enemyAll/enemyFirstN/enemyRandomN/enemyLastN）
     → `{ kind: 'enemyStatSum', stat }`（敌方全体 X 之和）；
   - 「因**所有**敌人的X」恒为 enemyStatSum（既有口径不变）。
2. **「若有一名X族盟友，则给予其N点」**（8688 卡点）：「其」= 该族盟友本人，属**自动指定**而非玩家点选
   → N 段挂 `allyWeakest`（最危族员，与 AI 指定目标策略一致）+ `opts.targetRace: '<种族>'`；
   无该族存活盟友时段自动跳过（=「若有一名」语义）。文本明示「最虚弱的X族盟友」同理。
   ⚠️ 不要用 `allyChosen + targetRace`（选定后过滤，选择器不感知种族，会选到非族员）。
3. **仍 SKIP**：「再给予**其**」指回前段**随机**目标（跨段随机绑定）、
   「若**其中一个**使用X法力」聚合存在判定（逐目标过滤 ≠ 存在语义，8418）、
   「其中一名/另一名」死亡绑定（7747）、比例法力、晋升度条件。

### 伤害
```ts
dmg(target, base, mult?, opts?)          // [魔法×mult + base]；opts: { range:'splash'|'all', trueDamage, n, chance, ifTargetDied, modifier, raceDouble, rangeSpec }
dmgAll(base, mult?, trueDamage?)         // = dmg('enemyAll', …, {range:'all'})，无 opts（要 opts 用 dmg）
dmgSplash(target, base, mult?)           // 溅射（轻微溅射也是它）
trueDmg(target, base, mult?, opts?)      // 真实/穿透伤害（跳护甲）
```

### 增益（含治疗/加法力）
```ts
heal(target, base, mult?, opts?)   // 「获得 X 点生命」= heal('allySelf', …)；「给予盟友」= heal('allyChosen'|'allyAll', …)
armor / attack / magic / mana(target, base, mult?, opts?)
randomStat(target, base, mult, opts)  // 「获得 [魔法] 点随机技能值」
cleanse(target, n?, opts?)            // 净化全部状态
```

### 敌方削弱（stat: 'attack'|'armor'|'magic'|'mana'）
```ts
reduce(target, stat, base, mult?, opts?)  // 减攻/减甲/减魔；stat='mana' 即耗蓝
// opts.halve = true：「将敌方攻击力减半」（按当前值 50% 下取整，原语批 §9.6）
drainMana(target, opts?)                  // 「耗尽法力值」
steal(target, stat, gainStat, base, mult, opts)  // 窃取；「窃取 2 护甲转为魔法」= steal(t,'armor','magic',2,0)
// opts 额外: { drainAll?, halve?, gainRatio? (「获得其中半数」=0.5), n?, nRange?, chance, ifTargetDied, modifier, raceDouble }
```

### 增益侧比例法力（原语批 §9.6）
```ts
// 「获得半数法力值」= 获得 floor(manaCost / 2)（半条法力，逐目标按各自 manaCost 现算）
mana('allySelf', 0, 0, { halve: true, ifCond?: … })
```

### 宝石
```ts
createGems(color, base, mult=0, opts?)   // color 可 'Red'…/'CHOSEN'（指定色）/'CASTER'（该军队法力颜色）
//   opts.countRange: { min, max }（「创造 8-12 颗紫色宝石」，rng 掷选，spell-rules §9.8）
createSkulls(base, mult=0, opts?)        // 创造骷髅头；opts.modifier 支持「每摧毁一颗X宝石 [xN]」
createMix([color, 'CHOSEN'], base, mult, opts)  // 「混合绿色和一种选定类型」
transform(from, to, opts?)               // 「将所有黄色宝石转换成紫色」= transform('Yellow','Purple')
//   opts.count = N（定量随机转换：「将 2 颗紫色宝石转换成X」，spell-rules §9.4）
destroyChosenCol() / destroyChosenRow()  // 摧毁一列/一行（chosen）
explodeAt('CELL')                        // 爆破选定宝石（含周围一圈）
destroyColor(color) / explodeColor(color)   // 移除/爆破所有某色（color 可 'CHOSEN'）
destroySkulls() / explodeSkulls()        // 摧毁/爆破所有骷髅
destroyRandomGems(base, mult, include?, color?) / explodeRandomGems(…)  // 随机 N 颗（可限定色）
destroyRandomCols(base, mult) / destroyRandomRows(base, mult)  // 随机 N 列/行
```

### 状态（引擎已实现的可组装词表，2026-09-16 特殊状态批后扩容；规范拼写如下）
```ts
// poison 中毒 / burning 燃烧 / bleed 出血(每层1点) / silence 沉默 / frozen 冰冻冻结 / stun 眩晕击晕 /
// entangle 纠缠缠绕 / web 织网 / barrier 屏障 / submerged 下潜 / marked 猎人标记(纯标记态) /
// disease 疾病 / curse 诅咒 / death-mark 死亡标记 / rage 狂怒 / charm 魅惑（后五者 2026-09-16 落地）
inflict(statusId, target, opts?)  // opts: { turns?（默认3）, magnitude?（DoT 每回合伤害，默认3；bleed 默认1）, stacks?, n?, nRange?, chance, ifTargetDied }
// 「获得屏障」= inflict('barrier','allySelf')；「陷入 2 层流血」= inflict('bleed', t, { stacks: 2 })
// 「使 1 到 4 名敌人中毒」= inflict('poison', 'enemyRandomN', { nRange: { min: 1, max: 4 } })
dispelStatus(statusId, target, opts?)   // 定向驱散单一状态（原语批 §9.5）：
// 「驱散其流血效果」= dispelStatus('bleed', 'enemyChosen')——只移除该 id，发 status-expire
// 波A 新增状态本体（引擎已实现）：恐怖 terror / 妖火 faerie-fire——技能侧 inflict 待
// spellData STATUS_WHITELIST 扩容后开放（随用随扩）。
// 仍 SKIP（缺失状态）：狼化（缺变形机制）、法力燃烧（非持续状态，耗蓝句式走 reduce 族）、
// 石化/附魔/ 下潮技能句式 等。
// 白名单以 tests/unit/spellData.test.ts STATUS_WHITELIST 为准，扩容随回收批同步。
```

### 其它
```ts
summonRef(referenceName, troopId?)   // 召唤指定兵种（referenceName 是英文名，用 §6 的命令查）
summonRandom(refs, troopId?)         // 「召唤一名随机哥布林」→ 同族兵种 referenceName 列表
extraTurn(opts?)                     // 「获得一个额外回合」；可挂 { ifTargetDied: true }
```

### 风暴 / 打乱板面 / 随机多选一（引擎原语批，spell-rules §9）

```ts
createStorm(color, opts?)            // 「召唤冰风暴」= createStorm(BaseColor.Blue)（持续缺省 8 回合）
// 骷髅系风暴：骸骨 = createStorm(BaseColor.Brown, { dropKind: 'skull' })；
// 末日/超级末日 = dropKind 'doomSkull' / 'uberDoomSkull'。文本明示回合数 → { turns: N }
shuffleBoard(opts?)                  // 「打乱板面」（满盘重排，发 reshuffle 事件）
oneOf(分支…)                         // 「X 或 Y」随机多选一：掷选一支，未选支零执行零事件
// 每支可为一至多个段：「造成真实伤害，再陷入燃烧。或摧毁所有炸弹宝石」
//   = oneOf([trueDmg('enemyChosen',1,1), inflict('burning','enemyChosen')], destroySpecialGems('bomb'))
// 裁定（spell-rules §9.3）：「或」= 掷签二/三选一；多色池（「绿色或紫色宝石」随机取）不是二选一 → SKIP
```

### 逃跑 / 战场经济（四项拍板①③，spell-rules §10，批次 39 起可组装）

```ts
sacrifice('allyOthers')              // 「献祭一名盟友」= 随机其他盟友（不含施法者）；即杀走 execute 管线
inflictRandom(target, opts?)         // 「造成随机状态效果」：按目标阵营分池（盟友=正面 barrier/rage/submerged，
                                     //  敌方=负面 12 种）；opts { turns?, times? }（times=「陷入 N 个随机状态」）
createGems('ENEMY', N)               // 「创造 N 颗指定敌人的法力颜色的宝石」（敌方颜色动态占位符）
transformToSpecial('LAST_TARGET', X) // 「将该敌人的一种法力颜色的所有宝石转化为X」（跨段该敌人）
transformTroop(target, ref, opts?)   // 「将一名随机敌人转化为怨灵」= transformTroop('enemyRandom','Banshee')
gainMaps(1, 0, { chance: 0.2 })      // 「有 20% 的几率获得一张藏宝图」；modifier 来源 battleMaps
// 条件：{ ifCond: { kind: 'troopPresent', side: 'ally', name: '梁帝' } }（中文名匹配存活者）
// sacrifice 的二次缩放：「因献祭军队的攻击力而增强 [1:1]」→ source: { kind: 'sacrificedStat', stat: 'attack' }
// 详见 spell-rules §11。

```ts
escape(0.3)                          // 「有 30% 的几率跑掉」：恒作用于施法者（判定成功=fled+移出编队，
                                     //  不算阵亡、不触发死亡召唤/阵亡响应；全队逃光判负）
gainGold(10) / gainSouls(5) / gainGems(2)
                                     // 「获得 10 金币 / 5 灵魂 / 2 颗宝石」：数值走 [魔法×mult+base] 照常
// 二次缩放新来源（不再因「黄金/灵魂」来源 SKIP）：
//   「伤害值由我的金币加成 [10:1]」= modifier: { mod: { kind:'ratio', a:10, b:1 }, source: { kind:'battleGold' } }
//   battleSouls / battleGems 同理（读战场经济池当前总额）
createSpecialGems({ kind: 'bootyGem' }, 3)  // 「创造 N 颗赃物/战利品宝石」：不可匹配，被摧毁 +10 金币
// 「窃取 N 枚金币」= gainGold(N)（不减敌方，官方为元经济句式，落战场经济入账）
```

### 风暴在场 / 聚合存在判定条件（原语批，条件域新增叶子）

```ts
// 「若存在/正在进行(一种/任何)风暴」
{ ifCond: { kind: 'stormPresent' } }
// 「若存在冰风暴」= { kind: 'stormPresent', color: BaseColor.Blue }
// 「如果现有骸骨风暴」= { kind: 'stormPresent', dropKind: 'skull' }（末日系同理）
// 「若风暴生效，效果加倍」= condMult: { times: 2, cond: { kind: 'stormPresent' } }
// 「若有(一名)敌人陷入诅咒状态」= { kind: 'anyEnemyStatus', statusId: 'curse' }（全局存在判定）
// 「若有盟友陷入下潜状态」= { kind: 'anyAllyStatus', statusId: 'submerged' }
// 与 targetStatus 区分：target* 是逐目标过滤；any* 是「存在即整段生效」
```

### 二次缩放（`meta.modifier` 非空时，来源必须人工判读后显式挂到对应段）
```ts
// [xN] = 每 1 个来源 +N；[N:M] = 每 N 个来源 +M（叠加在基础值上）
modifier: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'destroyedGems', color: 'Yellow' } }
modifier: { mod: { kind: 'ratio', a: 2, b: 1 }, source: { kind: 'destroyedGems' } }
// source 可选 kind：
//   destroyedGems{color?}      「因被摧毁的X色宝石而增强」「移除所有X宝石以增强」
//   transformedGems            「因转换的宝石数而增强」
//   boardSkulls / boardGems{color}   「因骷髅头数」「因蓝色宝石数量」
//   selfStat{stat}             「因自身的护甲值/攻击力/生命值(hp)/损失的生命值(missingHp)/魔法值」
//   teamSize{side}             「因存活的敌军数量」「因盟友数」
//   alliesOfRace{race}         「因野兽盟友数」（race 是英文种族，见 §6）
//   alliesOfColor{color}       「因蓝色盟友数」
//   enemyStatusCount{statusId} / allyStatusCount{statusId}   「因被冻结的敌人数」「因下潜的盟友数」
//   enemyStatSum{stat} / allyStatSum{stat}   「因所有敌人的护甲值」
//   targetStat{stat}           「因敌人现有生命值」
//   drainedMana                「因所耗尽的法力值」
// 多来源句式（「因蓝色宝石和盟友数而增强」）用 sources（计数相加，与 source 二选一）：
//   modifier: { mod: { kind: 'multiplier', a: 2 }, sources: [{ kind: 'boardGems', color: 'Blue' }, { kind: 'teamSize', side: 'ally' }] }
// 伤害值等同于自身攻击力 → dmg(target, 0, 0, { modifier: { mod:{kind:'multiplier',a:1}, source:{kind:'selfStat',stat:'attack'} } })
// 来源「我的金币/本战斗灵魂/宝石」→ battleGold / battleSouls / battleGems（四项拍板①已落地，见上节）
// 来源属于藏宝图/献祭/被减除的护甲值 → SKIP（原因：二次缩放来源不支持）
// 「几率因X而增强」→ 用 chanceBoost（见下文「条件倍率 / 概率增强」节），不再 SKIP
// buff 族 opts 支持 n：「给予前 2 位盟友 [M+3] 攻击力」= attack('allyFirstN', 3, 1, { n: 2 })
```

### 特殊宝石（窗口 C 十种 + 状态宝石批波A 13 颗已落地，回收用）

已实现 23 种特殊宝石（`SpecialGemKind`，见 `types.ts`；窗口 C 台账 09-14 + 状态宝石批·波A
GEMS-SEMANTICS-2 A/B 组 13 颗 2026-09-16）。组装词汇：

```ts
// 创造：「创造 2 颗炸弹宝石」「创造一颗织网宝石」
createSpecialGems({ kind: 'bomb' }, 2)             // bomb/doomSkull/uberDoomSkull/web/wish/hourglass/ghost…
createSpecialGems({ kind: 'wildcard', tier: 4 }, 1) // 「x4 通配宝石」带 tier；未写倍率 → SKIP（数值不明）
// 全量清除/爆破：「摧毁所有末日骷髅头」
destroySpecialGems('doomSkull') / explodeSpecialGems('doomSkull')
// 定量随机：「摧毁 3 颗末日骷髅头」「引爆 3 个末日骷髅」（countRange 区间见 spell-rules §9.8）
destroyRandomSpecialGems('doomSkull', 3, 0) / explodeRandomSpecialGems('doomSkull', 3, 0, { chance?… })
// 转化端点：「将所有骷髅头转换成末日骷髅头」「转换成极度末日骷髅头」；可定量（opts.count）
transformToSpecial('SKULL', 'doomSkull') / transformToSpecial('Red', 'uberDoomSkull')
// 来源计数：「因炸弹宝石数而增强」「因织网宝石数而增强」
modifier: { mod: …, source: { kind: 'boardSpecial', gem: 'bomb' } }
// 「因骷髅头数而增强」→ boardSkulls（末日族经 isSameMatchType 同族计入，含普通骷髅）
// 「因(每个)末日/厄运骷髅(头)而增强」→ boardSpecial { gem: 'doomSkull' }（文本点名末日族 → 精确计数）
```

**词表对照**：炸弹宝石=bomb、末日/厄运骷髅头=doomSkull、极度/超级/至尊末日骷髅头=uberDoomSkull、
织网宝石=web、闪电宝石=lightningRow/lightningCol（文本须区分行列，未区分 → SKIP）、
通配/万能牌宝石=wildcard、许愿宝石=wish、沙漏宝石=hourglass、幽魂宝石=ghost（无行为，创造可、
涉灵魂的子句仍 blocked）、厄运头骨=doomSkull（同物异名）、赃物/战利品宝石=bootyGem（**不可匹配**，被摧毁 +10 金币——四项拍板①落地）；
**波A 状态宝石 13 颗**：燃烧宝石=burningGem（红）、冻结/冰冻宝石=freezeGem（蓝）、诅咒宝石=curseGem（棕）、
流血宝石=bleedGem（紫）、毒宝石=poisonGem（绿）、死亡标记宝石=deathMarkGem（**无色不可匹配**）、
恐怖宝石=terrorGem（紫）、缠绕宝石=entangleGem（绿）、激怒/愤怒宝石=enrageGem（红）、
沉没宝石=submergeGem（蓝）、精灵火/妖火/妖精之火/**妖仙宝石**=faerieFireGem（绿；妖仙=官方 SpellSteps
Color1 "FaerieFire" 实锤，spell 9221）、打昏宝石=stunGem（棕）、屏障宝石=barrierGem（黄）。

**仍 SKIP**：石像鬼/龙/巨人/天使/元素星/暗影之星/灵力/法力药水/恶魔传送门/腐朽/狼人宝石等
（GEMS-SEMANTICS-2 后续波）；「随机的特殊宝石」；幽灵宝石涉灵魂收益的句子；
「创造 N 颗混合X宝石和Y宝石」当 X/Y 为**特殊宝石**时仍 SKIP（createMix 仅支持颜色混合，
batch-36 9312 口径）。

### 条件组合 / 己方种族在场 / 状态叠层（第四遍回收用）

```ts
// 「如果敌人是兽人或恶魔，则窃取…」——析取
{ ifCond: { kind: 'anyOf', of: [{ kind: 'targetRace', race: 'Orc' }, { kind: 'targetRace', race: 'Daemon' }] } }
// 合取（全部成立才执行）
{ ifCond: { kind: 'allOf', of: [{ kind: 'targetStatus', statusId: 'poison' }, { kind: 'targetHpDamaged' }] } }
// 「如果己方有龙族军队，则…」（己方侧种族在场，与 enemyRacePresent 对称）
armor('allySelf', 8, 0, { ifCond: { kind: 'allyRacePresent', race: 'Dragon' } })
// 「陷入 2 层流血」/「3 次叠加中毒」
inflict('bleed', target, { stacks: 2 })   // 最终 magnitude = 每层值 × 层数
inflict('poison', target, { stacks: 3 })  // 中毒默认每层 3 → magnitude 9
```

**裁定**：
- 组合条件（anyOf/allOf）里任一叶子是目标相对 → 整体按目标相对处理（逐目标过滤）。
- `allyRacePresent` 与 `enemyRacePresent` 对称（己方/敌方侧存活者含该族）。
- **叠层**：`stacks: N`（N≥2 才写）→ 最终 magnitude = 每层值 × N；同 id 已存在时**累加**合并
  （2 层+3 层=5）、回合取 max。非 stacks 施加维持 max 合并（web 挣脱几率语义不变）。
- **bleed（出血）默认每层 1 点/回合**（官方语义，此前 0 伤为保真缺口）；poison/burning 默认每层 3 不变。
- 「若队伍里有<具体兵种>」仍 SKIP（特定兵种在场 ≠ 种族在场）。

### 通用条件触发 / 条件加成（ifCond / condBonus，第三遍回收用）

```ts
// 「如果敌人已被冻结，则窃取 5 点法力值」——条件成立才执行该段，不成立静默跳过
//（「窃取」族动词照常走 steal：目标削减 + 自身等量获得，见 §3 敌方削弱）
steal('enemyChosen', 'mana', 'mana', 5, 0, { ifCond: { kind: 'targetStatus', statusId: 'frozen' } })
// 「若敌人是怪兽，则缠绕他」
inflict('entangle', 'enemyChosen', { ifCond: { kind: 'targetRace', race: 'Monster' } })
// 「如果板面上有 13 颗或更多红色宝石，则获得一个额外回合」
extraTurn({ ifCond: { kind: 'boardAtLeast', color: 'Red', n: 13 } })
// 「如果敌方有龙族军队，则获得 8 点护甲」
armor('allySelf', 8, 0, { ifCond: { kind: 'enemyRacePresent', race: 'Dragon' } })
// 「若敌人已受伤，则伤害增加 8 点」（加算，不是倍率）
dmg('enemyChosen', 2, 1, { condBonus: { n: 8, cond: { kind: 'targetHpDamaged' } } })
// 「若自身的生命值受损，则可多造成 8 点伤害」
dmg('enemyChosen', 4, 1, { condBonus: { n: 8, cond: { kind: 'selfHpDamaged' } } })
```

**裁定**：
- 条件域（condMult/ifCond/condBonus 通用）：`targetRace / targetColor / targetStatus / targetHpDamaged /
  selfHpDamaged / boardAtLeast / enemyRacePresent / allyRacePresent / anyEnemyStatus / anyAllyStatus /
  stormPresent`（后三者为 2026-09-16 原语批新增，见「风暴在场 / 聚合存在判定条件」节）+ 组合器 anyOf/allOf。
- **目标相对条件**（target* 四种）按**该段自己的目标**逐个判定过滤；**全局条件**（selfHpDamaged/boardAtLeast/enemyRacePresent）整段判定。
- 不成立 → 静默跳过（不发事件，与 chance 同语义）。
- 目标相对条件挂在**无目标段**（gem/extraTurn/summon）→ 整段跳过（无从判定）。
- 叠加顺序：**（基础值 + 条件加成）× 种族倍率 × 条件倍率**。
- **仍 SKIP**：「任意状态」（「陷入某状态效果」指代不明）、属性比较、法力满值/幸存、
  王国条件、打错敌人/弹射、随机状态、「若敌人未下潜」等否定条件。

### 概率子句 / 死亡条件 / 种族翻倍（挂在对应段 opts 上）
```ts
{ chance: 0.2 }          // 「有 20% 几率…」只辖该段
{ ifTargetDied: true }   // 「如果该敌人身亡，…」（判定规则见 spell-rules.md §4）
{ raceDouble: 'Mech' }   // 「如果盟友是一名机械军队，则效果翻倍」（race 是英文种族）
// 「若敌人是个魔头/基于晋升稀有度 N 倍」→ SKIP（晋升度条件，不做）
```

### 条件倍率 / 概率增强（condMult / chanceBoost，第二遍回收用）

```ts
// 「如果敌人是恶魔/怪兽（族），则造成 3 倍伤害」
{ condMult: { times: 3, cond: { kind: 'targetRace', race: 'Daemon' } } }
// 「如果对方使用红色法力，则造成三倍伤害」——按目标关联法力色判定
{ condMult: { times: 3, cond: { kind: 'targetColor', color: 'Red' } } }
// 「如果敌人已陷入沉默/冻结/中毒…，则造成双倍伤害」
{ condMult: { times: 2, cond: { kind: 'targetStatus', statusId: 'silence' } } }
// 「如果板面上有 13 颗或更多红色宝石，则…」
{ condMult: { times: 3, cond: { kind: 'boardAtLeast', color: 'Red', n: 13 } } }
// 「如果敌方有龙族军队，则…」
{ condMult: { times: 2, cond: { kind: 'enemyRacePresent', race: 'Dragon' } } }
// 「每有一颗绿色宝石，就有 7% 的几率获得一个额外回合 [x7]」
extraTurn({ chanceBoost: { mod: { kind: 'multiplier', a: 7 }, source: { kind: 'boardGems', color: 'Green' } } })
// 概率 = chance（缺省 0）+ 加成百分点 / 100，夹在 [0,1]
```

条件域白名单：`targetRace / targetColor / targetStatus / targetHpDamaged / selfHpDamaged /
boardAtLeast / enemyRacePresent / allyRacePresent / anyEnemyStatus / anyAllyStatus / stormPresent`。
**只有「倍率」句式（N 倍/双倍/翻倍）用 condMult**；「+N 点」条件加成、属性比较、法力满值/幸存、
王国条件、打错敌人/弹射、随机状态 → 仍 SKIP。

## 4. SKIP 标准原因（写进 SKIPPED，报告聚合用）

`句子式不明` `缺失状态` `元经济` `晋升度条件` `特殊宝石` `二次缩放来源不支持`
`召唤物无法解析` `伤害区间` `数值不明` `语义拿不准` `隐匿/位置操作` `驱散敌方增益` `比例法力`

## 5. 自查清单（提交批文件前逐条过）

1. `desc` 与池文件逐字一致（复制粘贴，不要手打）。
2. desc 里每个 `[魔法…]` 方括号都被用掉了（`= meta.scalings` 条数），常数不多不少。
3. `meta.modifier` 非空 → 一定有显式 `modifier` 挂段；为空 → 一定没挂。
4. 目标措辞按 §0 表；「所有敌人」的伤害段带 `range:'all'`。
5. 状态 id / 种族 / 召唤 referenceName 拼写正确（§6 白名单）。
6. 段顺序 = 描述子句顺序；概率/死亡条件辖段范围正确。
7. imports 无未用项；批内按 id 升序。

## 6. 查询命令（召唤物 / 种族英文名）

```bash
# 召唤物 zh 名 → referenceName + id
node -e "const t=require('./src/data/troops.json');console.log(t.filter(x=>x.name.includes('瓦格')).map(x=>[x.name,x.referenceName,x.id]))"
# 全部种族（troopTypes）取值域
node -e "const t=require('./src/data/troops.json');console.log([...new Set(t.flatMap(x=>x.troopTypes))].join(' '))"
# 种族下兵种列表（summonRandom 用）
node -e "const t=require('./src/data/troops.json');console.log(t.filter(x=>x.troopTypes.includes('Goblin')).map(x=>x.referenceName).join(','))"
```

## 7. 校验（组装器对号入座的硬约束，全部自动化）

`tests/unit/spellData.test.ts`（随 `npm test` 跑）：
- desc 与 `troops.json` **逐字相等**；id 唯一且存在；批间无重复；
- 状态 id / 种族 / 召唤引用白名单校验；护栏（伤害/治疗/数量上限）；
- 全量原型在固定种子棋盘上烟雾执行不抛错。
任何一条不过 = 构建失败，不会带病进引擎。
