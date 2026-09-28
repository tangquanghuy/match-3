/**
 * 放弃桶回收批 R17（2026-09-18）：长尾三族判读收口批。
 *
 * 池：tmp/r15_still_remaining.json 真剩余（对照全部既有批次去重后 162 条）中
 * 「语义拿不准 + exotic 二次缩放来源 + 特殊宝石相关」三族逐条判读——判读依据 =
 * 官方英文原句（data/raw/gow-2026-09-18 troops.en.json stats.spell.desc）与
 * 官方 SpellSteps（data/raw/spells.gow.en.json RawData.SpellSteps），原句优先于机翻 ZH。
 *
 * 本批口径：
 * - 原语 Wave4 批新词消费：inflict opts.perDestroyed（「每摧毁一颗X宝石则施加状态」族，
 *   尾缀 [1:1] 即该 1:1 驱动比率的序列化，r15 特例口径——不再另挂 modifier）、
 *   convertSpecial（特殊↔特殊转换 + tiers 善恶掷签）、transformToSpecial('CELL'/'LAST_TARGET')、
 *   来源 lastReduce（「减除额转移为另一属性」跨段数值绑定，spell-rules §12.7 同族口径）、
 *   reduce stat 'hp'/'random'、来源 countEnemyDeaths/countAllyDeaths。
 * - 机翻噪声按 EN 原句纠正：7652 Mana Burn 按 native 魔法倍率加目标当前法力造成伤害（不耗蓝）、7507/8375 转移端点按 EN/ST（8375 ZH「攻击力」实为 Armor）、9614 机翻「2 个」实为倍率 x2
 *   （WildCard2，引擎 wildcard tier 缺省 ?? 2 恰好等价）、9638 按 ST 拆
 *   「选定转换 + 创造 2 颗」。
 * - 王国/晋升度条件族条目本轮不碰（等并行批落地），见批尾复核注记。
 */
import type { CuratedBatch } from './index';
import { targetedSkill, chooseSkill, skill, dmg, trueDmg, heal, armor, attack, mana, reduce, drainMana, cleanse, inflict, inflictRandom, createGems, createSkulls, createSpecialGems, createSpecialGems2, transformToSpecial, destroyRandomRows, destroyChosenRow, destroyArea, explodeRandomGems, reposition, summonRef, extraTurn, oneOf, sacrifice, CELL, explodeAt } from '../builders';
import { BaseColor } from '../../types';

const SKIPPED: { id: number; reason: string }[] = [];

const SPELLS: CuratedBatch['spells'] = [
  {
    id: 7156,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害。如果该敌人身亡，则可拿回大部分法力值，并获得一个额外回合。',
    // EN「gain 9 Mana back and an extra turn」：ZH「大部分法力值」机翻，官方固定 9 点；两段同挂 ifTargetDied
    build: skill(
      // sa-F1: native order ExtraTurnConditional (s2) then GenerateMana (s3); the self mana step re-points lastTarget
      // to the caster, so with mana first the extra turn never fired.
      dmg('enemyChosen', 3, 1),
      extraTurn({ ifTargetDied: true }),
      mana('allySelf', 9, 0, { ifCond: { kind: 'castEnemyDied' } }),
    ),
  },
  {
    id: 7430,
    desc: '爆破一颗宝石。每摧毁一颗蓝色宝石，则冻结一名随机敌人。获得 [魔法 + 2] 点生命值。 [1:1]',
    // 尾缀 [1:1] = perDestroyed 驱动比率的序列化（r15 特例口径）；目标池 = 存活敌方逐次随机
    build: skill(
      explodeAt(CELL),
      inflict('frozen', 'enemyAll', { perDestroyed: { color: BaseColor.Blue } }),
      heal('allySelf', 2, 1),
    ),
  },
  {
    id: 7433,
    desc: '摧毁 1 行。每摧毁一个骷髅头，便使一名随机敌人陷入中毒状态。 [1:1]',
    // 原生 BoardTarget Row（spell Target Board）= 玩家选定的那一行（sa-R6 L2-board-chosen；原为随机一行）；
    // perDestroyed 'skull' 筛骷髅族（含同行被摧毁的末日骷髅）
    build: skill(
      destroyChosenRow(),
      inflict('poison', 'enemyAll', { perDestroyed: { color: 'skull' } }),
    ),
  },
  {
    id: 7463,
    desc: '以 X 形状摧毁宝石。每摧毁一颗黄色宝石，便赋予一名随机盟友屏障效果。 [1:1]',
    // 官方 BoardTarget=Diagonals（spell Target Board）→ 过玩家选定格的两条对角线（sa-R6 L2-board-chosen；
    // 原为固定棋盘中心）；屏障族 perDestroyed（Wave4 builders 注记先例）
    build: skill(
      destroyArea('x', 'destroy', CELL),
      inflict('barrier', 'allyAll', { perDestroyed: { color: BaseColor.Yellow } }),
    ),
  },
  {
    id: 7507,
    desc: '净化一名盟友，减除其 [魔法 + 2] 点生命值并将之转化为攻击力，赋予其屏障效果。创造 8 颗骷髅头。',
    // 「减除额转化为攻击力」= 来源 lastReduce（Wave4，前序 reduce 段实际削减额；§12.7 跨段绑定同族）
    build: skill(
      // sa-F2 fix round A (R001): native order Cleanse ; CreateGems 8 Skull ; IncreaseAttack 2+M ; Damage 1 ;
      // TrueDamage 2+M ; CauseBarrier — all @FromTarget (the chosen ally)
      cleanse('allyChosen'),
      createSkulls(8),
      attack('allyChosen', 2, 1),
      dmg('allyChosen', 1, 0),
      trueDmg('allyChosen', 2, 1),
      inflict('barrier', 'allyChosen'),
    ),
  },
  {
    id: 7636,
    desc: '爆破一颗宝石。每摧毁一颗绿色宝石则随机使一名盟友下潜。获得 [魔法] 点生命值和护甲值。 [1:1]',
    // 下潜 = submerged（正面池，目标池 = 存活己方逐次随机）；单方括号 [魔法] 管两段同值
    build: skill(
      explodeAt(CELL),
      inflict('submerged', 'allyAll', { perDestroyed: { color: BaseColor.Green } }),
      heal('allySelf', 0, 1),
      armor('allySelf', 0, 1),
    ),
  },
  {
    id: 7650,
    desc: '对 1 名敌人造成 [魔法 + 13] 点伤害，伤害值因被杀掉盟友和敌人数量而增强。 [x15]',
    // 官方 CountEnemyDeaths/CountAllyDeaths 双计数（Wave3 来源落地）；[x15] 按锚定文本，双来源各 ×15（r16 9875 双计数口径）
    build: skill(
      dmg('enemyChosen', 13, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 15 },
          sources: [{ kind: 'countEnemyDeaths' }, { kind: 'countAllyDeaths' }],
        },
      }),
    ),
  },
  {
    id: 7652,
    desc: '冻结前两名敌人，并对其施放法力灼烧，伤害值因自身魔力值而增强。再把这两名敌人推到后方。召唤梅冰女王。',
    // Native ManaBurn is Magic + current target Mana (no drain); then move original second/first targets.
    build: skill(
      inflict('frozen', 'enemyFirstN', { n: 2 }),
      dmg('enemyFirstN', 0, 1, { n: 2, manaBurn: true }),
      reposition('lastTargets', 'back'),
      summonRef('QueenMab', 6191),
    ),
  },
  {
    id: 7939,
    desc: '爆破一颗宝石。每摧毁一颗黄色宝石则击晕一名随机敌人。获得 [魔法 + 1] 点攻击力。 [1:1]',
    build: skill(
      explodeAt(CELL),
      inflict('stun', 'enemyAll', { perDestroyed: { color: BaseColor.Yellow } }),
      attack('allySelf', 1, 1),
    ),
  },
  {
    id: 7988,
    desc: '爆破一颗宝石。每爆破一颗绿色宝石则缠绕一名随机敌人。获得  [魔法 + 1]  点生命值。 [1:1]',
    build: skill(
      explodeAt(CELL),
      inflict('entangle', 'enemyAll', { perDestroyed: { color: BaseColor.Green } }),
      heal('allySelf', 1, 1),
    ),
  },
  {
    id: 8070,
    desc: '爆破一颗宝石。每摧毁一颗骷髅头则使一名随机敌人陷入死亡标记状态。获得 [魔法 + 1] 点攻击力和护甲值。 [1:1]',
    // P-R6-chosen-cell-counts: native 0:CountGems Skull Block3x3 (chosen cell, before the explode) ->
    // InflictEffectOnRandomTroops@AllEnemies deathmark x counter -> ExplodeGems SingleGem -> IncreaseArmor -> IncreaseAttack
    // (was explode first + perDestroyed skulls: enemies killed by the skull damage / cascade left the pool)
    build: skill(
      inflict('death-mark', 'enemyAll', {
        perCount: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'chosenCellBlockGems', skulls: true } },
      }),
      explodeAt(CELL),
      armor('allySelf', 1, 1),
      attack('allySelf', 1, 1),
    ),
  },
  {
    id: 8172,
    desc: '对一名敌人造成 [魔法 + 4] 点伤害，伤害值因敌我双方死亡数而增强。然后杀死第一位敌人或第一位盟友。 [x5]',
    // 官方 CountEnemyDeaths/CountAllyDeaths 双计数 ×5；「或」= oneOf 掷签二选一（§9.3）；
    // 杀己方目标唯一原语 = sacrifice（batch-p39 7408 口径），杀敌 = execute
    build: skill(
      dmg('enemyChosen', 4, 1, {
        modifier: {
          mod: { kind: 'multiplier', a: 5 },
          sources: [{ kind: 'countEnemyDeaths' }, { kind: 'countAllyDeaths' }],
        },
      }),
      oneOf(
        [dmg('enemyFront', 0, 0, { execute: true })],
        [sacrifice('allyFront')],
      ),
    ),
  },
  {
    id: 8228,
    desc: '对 1 名敌人造成 [魔法 + 3] 点伤害，伤害值因其所有技能值而增强。若敌人身亡，则获得 10 点攻击力并创建 12 颗骷髅头。 [2:1]',
    // 「所有技能值」= 官方 CountAttackArmorLife 50 + CountMagic 50 → 两个原生计数步骤各自取整
    //（sa-P P-counter-per-step：sourceGroups [攻击+护甲+生命] 与 [魔法]，R007-1）；
    // AddForKill = ifTargetDied（单一伤害主目标精确判定）
    build: skill(
      dmg('enemyChosen', 3, 1, {
        modifier: {
          mod: { kind: 'ratio', a: 2, b: 1 },
          sourceGroups: [
            [
              { kind: 'targetStat', stat: 'attack' },
              { kind: 'targetStat', stat: 'armor' },
              { kind: 'targetStat', stat: 'hp' },
            ],
            [{ kind: 'targetStat', stat: 'magic' }],
          ],
        },
      }),
      attack('allySelf', 10, 0, { ifTargetDied: true }),
      // sa-F2 fix round A: after the self-buff segment ifTargetDied looked at the caster -> skulls never created
      createSkulls(12, 0, { ifCond: { kind: 'castEnemyDied' } }),
    ),
  },
  {
    id: 8368,
    desc: '将最强的敌人的魔力值减半，再爆破等值于敌人失去的魔力值的紫色宝石。 [2:1]',
    // 减半 = reduce halve（原语批 §9.6，此前误记「暂无原语」）；「等值于失去的魔力值」= lastReduce
    // 驱动爆破数量；尾缀 [2:1] = 减半机制的序列化标记（r15 特例口径，不另挂 modifier）
    build: skill(
      reduce('enemyHealthiest', 'magic', 0, 0, { halve: true }),
      explodeRandomGems(0, 0, 'color', BaseColor.Purple, {
        modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'lastReduce' } },
      }),
    ),
  },
  {
    id: 8375,
    desc: '窃取敌人 [魔法 + 1] 点魔力值，并将之转换成生命值和护甲值。 [100:1]',
    // [100:1] = CountMagic → ratio 100:1 targetStat magic（r16 9223 同族）；
    // 转移端点按 EN/ST = Life+Armor（sa-G：ZH「攻击力」改为「护甲值」）；两段同挂 lastReduce 驱动
    build: skill(
      reduce('enemyChosen', 'magic', 1, 1, {
        modifier: { mod: { kind: 'ratio', a: 100, b: 1 }, source: { kind: 'targetStat', stat: 'magic' } },
      }),
      // sa-G (R001): native IncreaseArmor@Self before IncreaseHealth@Self
      armor('allySelf', 0, 0, { modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'lastReduce' } } }),
      heal('allySelf', 0, 0, { modifier: { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'lastReduce' } } }),
    ),
  },
  {
    id: 8475,
    desc: '爆破一颗宝石。每爆破一颗红色宝石则燃烧一名随机敌人。获得 [魔法 + 1] 点生命值和护甲值。 [1:1]',
    build: skill(
      explodeAt(CELL),
      inflict('burning', 'enemyAll', { perDestroyed: { color: BaseColor.Red } }),
      // sa-R6：原生 IncreaseArmor 在 IncreaseHealth 之前（R001；原为先生命后护甲）
      armor('allySelf', 1, 1),
      heal('allySelf', 1, 1),
    ),
  },
  {
    id: 8493,
    desc: '炸毁一个宝石。可保护一位同盟不受伤害。获得 [魔法 + 1] 点生命值。 [1:1]',
    // ZH「可保护一位同盟不受伤害」机翻噪声，EN/ST =「Barrier an Ally for each Skull destroyed」
    // → perDestroyed 'skull' 屏障族
    build: skill(
      explodeAt(CELL),
      inflict('barrier', 'allyAll', { perDestroyed: { color: 'skull' } }),
      heal('allySelf', 1, 1),
    ),
  },
  {
    id: 8532,
    desc: '对一名敌人造成 [魔法 + 1] 点伤害。若敌人法力值满值，则耗尽他的法力值。',
    // manaFull 目标相对条件（Wave3 落地，官方 AddForFullMana）挂在 lastTarget 耗蓝段
    build: skill(
      dmg('enemyChosen', 1, 1),
      drainMana('lastTarget', { ifCond: { kind: 'manaFull' } }),
    ),
  },
  {
    id: 8663,
    desc: '爆破 [(魔法 / 2) + 1] 颗宝石。获得 [(魔法 / 2) + 1] 点攻击力、生命值和护甲值，数值因身亡的地人数而增强。 [x10]',
    // 「身亡的地人」机翻噪声，EN =「boosted by all Enemies previously killed」→ countEnemyDeaths ×10；
    // [M/2+1] = mult 0.5 base 1，两处方括号各辖所在子句（第二括号管三段增益）
    build: skill(
      // native CountEnemyDeaths is step 0 (before the explosion): buffs first so explosion kills do not count (sa-R1)
      attack('allySelf', 1, 0.5, { modifier: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'countEnemyDeaths' } } }),
      heal('allySelf', 1, 0.5, { modifier: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'countEnemyDeaths' } } }),
      armor('allySelf', 1, 0.5, { modifier: { mod: { kind: 'multiplier', a: 10 }, source: { kind: 'countEnemyDeaths' } } }),
      explodeRandomGems(1, 0.5),
    ),
  },
  {
    id: 8791,
    desc: '爆破一颗宝石。每爆破一颗棕色宝石则赋予一名随机盟友屏障效果。 [1:1]',
    build: skill(
      explodeAt(CELL),
      inflict('barrier', 'allyAll', { perDestroyed: { color: BaseColor.Brown } }),
    ),
  },
  {
    id: 8885,
    desc: '爆破一颗宝石。每摧毁一颗黄色宝石，则使一名随机敌人陷入沉默状态。 [1:1]',
    build: skill(
      explodeAt(CELL),
      inflict('silence', 'enemyAll', { perDestroyed: { color: BaseColor.Yellow } }),
    ),
  },
  {
    id: 8942,
    desc: '创建 9 颗黄色宝石，数量因被击败的敌人而增强。 [x4]',
    // 官方 CountEnemyDeaths 400 → ×4（Wave3 来源落地）
    build: skill(
      createGems(BaseColor.Yellow, 9, 0, {
        modifier: { mod: { kind: 'multiplier', a: 4 }, source: { kind: 'countEnemyDeaths' } },
      }),
    ),
  },
  {
    id: 9121,
    desc: '随机摧毁一行。对一名敌人造成 [魔法 + 3] 点伤害，并使其陷入 1-3 个随机负面状态效果。',
    // 「1-3 个」= 官方三步 RandomStatusEffect（100%+50%+50%）逐次独立掷签；
    // 敌方目标 → 负面池（默认）；「使其」= lastTarget 跨段绑定
    build: skill(
      destroyRandomRows(1),
      dmg('enemyChosen', 3, 1),
      inflictRandom('lastTarget'),
      inflictRandom('lastTarget', { chance: 0.5 }),
      inflictRandom('lastTarget', { chance: 0.5 }),
    ),
  },
  {
    id: 9193,
    desc: '将所有紫色宝石转换成了蓝色闪电宝石。若队伍有龙族指挥官，则爆破一颗宝石。 [1:1]',
    // 蓝色闪电宝石 = lightningRow（types.ts：闪电·蓝清行）；「队伍有龙族指挥官」= troopPresent
    // 中文名（7477 龙族指挥官，官方 CountArmyTroop Data:7477）；尾缀 [1:1] = 爆破数 1:1 计数序列化
    build: skill(
      transformToSpecial(BaseColor.Purple, 'lightningRow'),
      // native ExplodeGems x CountArmyTroop (Dragon Commander): a random gem, not the chosen cell (sa-R1)
      explodeRandomGems(1, 0, 'all', undefined, {
        ifCond: { kind: 'troopPresent', side: 'ally', name: '龙族指挥官' },
      }),
    ),
  },
  {
    id: 9312,
    desc: '对所有敌人造成 [(魔法 x 1.25) + 2] 点伤害。创造 16 颗混合诅咒和冻结宝石。',
    // 官方 CreateGems2Colors Freeze/Cursed → createSpecialGems2 双特殊端点（Wave3 落地）
    build: skill(
      dmg('enemyAll', 2, 1.25, { range: 'all' }),
      createSpecialGems2([{ kind: 'curseGem' }, { kind: 'freezeGem' }], 16),
    ),
  },
  {
    id: 9614,
    desc: '对所有敌人造成 [魔法 + 6] 点伤害，伤害值因精灵射击敌人而增强。然后将 3 个骷髅转换为 x2 通配宝石。 [x6]',
    // 精灵射击 = 妖火 faerie-fire（状态宝石波A 落地）；「x2 通配宝石」机翻噪声，EN/ST = x2 Wildcard
    // （transformToSpecial 无 tier 通道，引擎 wildcard tier 缺省 ?? 2 恰好等价官方 WildCard2）
    build: skill(
      dmg('enemyAll', 6, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 6 }, source: { kind: 'enemyStatusCount', statusId: 'faerie-fire' } },
      }),
      transformToSpecial('SKULL', 'wildcard', { count: 3 }),
    ),
  },
  {
    id: 9638,
    desc: '选择一颗宝石。将其和另外两颗随机宝石转换为暗影之星。',
    // 官方两步：ConvertGems SingleGem FromTarget（选定单格那颗 → transformToSpecial 'CELL'，Wave4）
    // + CreateGems LightDarkStar 2（ST 明示为创造两颗，非转换）
    build: skill(
      transformToSpecial('CELL', 'umbralStar'),
      createSpecialGems({ kind: 'umbralStar' }, 2),
    ),
  },
  {
    id: 9640,
    desc: '&& 消除一名敌人 [魔法 + 2] 点攻击力，并诅咒该敌人。 && 消除一名敌人一项随机技能 [魔法 + 2] 点，并对其施加死亡标记。',
    // '&&' 为合法子句切分符（§13.1）；EN 原句 = Eliminate [M+2] Attack / from a random Skill Point
    // （sa-H：旧 ZH「[魔法 + 2] 个敌人」误读为敌人数，已改并加 gowSnapshotOverrides 7737）；随机技能点 = reduce stat 'random'（DecreaseRandom，R12 原语）
    build: skill(chooseSkill(["削减一名敌人［魔法＋2］攻击并诅咒","削减一名敌人［魔法＋2］随机属性并施加死亡标记"], [reduce('enemyChosen', 'attack', 2, 1), inflict('curse', 'lastTarget')], [reduce('enemyChosen', 'random', 2, 1), inflict('death-mark', 'lastTarget')])),
  },
  {
    id: 9658,
    desc: '对最弱的两名敌人造成[魔法 + 4]点伤害，伤害值因冰冻宝石和骷髅头数量而增强。然后合成18颗冰冻宝石和末日骷髅头。 [x2]',
    // 双来源各 ×2（boardSpecial freezeGem + boardSkulls，r16 9875 口径）；
    // 官方 CreateGems2Colors Freeze/Doomskull → createSpecialGems2
    build: skill(
      dmg('enemyWeakestN', 4, 1, {
        n: 2,
        modifier: {
          mod: { kind: 'multiplier', a: 2 },
          sources: [{ kind: 'boardSpecial', gem: 'freezeGem' }, { kind: 'boardSkulls' }],
        },
      }),
      createSpecialGems2([{ kind: 'freezeGem' }, { kind: 'doomSkull' }], 18),
    ),
  },
  {
    id: 9675,
    desc: '创造 10 颗诅咒宝石和末日骷髅头（随机混合）。获得额外回合。',
    build: skill(
      createSpecialGems2([{ kind: 'curseGem' }, { kind: 'doomSkull' }], 10),
      extraTurn(),
    ),
  },
  {
    id: 9717,
    desc: '造成[魔法 + 6]点散射伤害，伤害值因暗影星辰而增强。赋予所有盟友1-3个随机增益效果。 [x12]',
    // 裸散射 = 全体散射（2026-09-18 官方口径）；暗影之星 = boardSpecial umbralStar ×12；
    // 「1-3 个随机增益」= 官方三步 RandomPositiveStatusEffect（100%+50%+50%）→ pool:'positive'
    build: skill(
      dmg('enemyAll', 6, 1, {
        range: 'all',
        modifier: { mod: { kind: 'multiplier', a: 12 }, source: { kind: 'boardSpecial', gem: 'umbralStar' } },
      }),
      inflictRandom('allyAll', { pool: 'positive' }),
      inflictRandom('allyAll', { pool: 'positive', chance: 0.5 }),
      inflictRandom('allyAll', { pool: 'positive', chance: 0.5 }),
    ),
  },
  {
    id: 9731,
    desc: '对一名敌人造成[魔法 + 1]真实伤害。若该敌人死亡，则对所有其他敌人造成1-3个负面状态效果。',
    // 官方三步 RandomStatusEffectConditional（100%+50%+50%）全挂 AddForKill → ifTargetDied；
    // 目标身亡后 enemyAll 天然排除死者（=「所有其他敌人」）
    // sa-H：ifTargetDied 看「最近产目标段」的主目标——第 1 个随机状态段解析 enemyAll 后，第 2/3 段看的是存活敌人，
    // 永不触发；改用本次施放击杀计数 castEnemyDied（唯一伤害段就是对所选敌人的这一击）
    build: skill(
      trueDmg('enemyChosen', 1, 1),
      inflictRandom('enemyAll', { ifCond: { kind: 'castEnemyDied' } }),
      inflictRandom('enemyAll', { ifCond: { kind: 'castEnemyDied' }, chance: 0.5 }),
      inflictRandom('enemyAll', { ifCond: { kind: 'castEnemyDied' }, chance: 0.5 }),
    ),
  },
  {
    id: 9745,
    desc: '&& 将 9 颗选定敌人法力颜色的宝石转换为精神宝石。&& 对敌人施加诅咒和法力燃烧。',
    // Choice: convert target-color Gems OR Curse then ManaBurn the same enemy; no drain.
    build: targetedSkill('enemyChosen', chooseSkill(['转化九颗精神宝石', '诅咒并燃烧敌人法力'], [transformToSpecial('LAST_TARGET', 'spiritGem', { count: 9 })], [inflict('curse', 'enemyChosen'), dmg('lastTarget', 0, 1, { manaBurn: true })])),
  },
  {
    id: 9908,
    desc: '对一名敌人造成[魔法 + 3]点伤害。然后生成4-10颗闪电宝石。',
    // 官方 CreateGems2ColorsRange LightningBlue/LightningYellow 4-10 → 双 kind + countRange
    //（蓝闪电 = lightningRow 清行、黄闪电 = lightningCol 清列，逐颗掷选）
    build: skill(
      dmg('enemyChosen', 3, 1),
      createSpecialGems2([{ kind: 'lightningRow' }, { kind: 'lightningCol' }], 0, 0, { countRange: { min: 4, max: 10 } }),
    ),
  },
  {
    id: 10011,
    desc: '造成[(魔法 x 2.5) + 12]点散射伤害。然后生成13颗闪电宝石。',
    // 裸散射 = 全体散射；官方 CreateGems2Colors LightningBlue/LightningYellow 13 → 双 kind 逐颗掷选
    build: skill(
      dmg('enemyAll', 12, 2.5, { range: 'all' }),
      createSpecialGems2([{ kind: 'lightningRow' }, { kind: 'lightningCol' }], 13),
    ),
  },
];

/**
 * 本批复核仍留弃条目（SKIP 记录保留在原批次文件；此处记 R17 复核结论，按新卡点分组）：
 *
 * 【逐来源重复施加状态——status 段无计数驱动】
 * - 8427：「每有一名受诅咒的敌人→屏障」为状态计数驱动（非被摧毁宝石计数），perDestroyed 不辖。
 *
 * 【敌方侧种族计数 / 双侧种族计数来源缺失（等引擎扩 enemiesOfRace 族）】
 * - 7459/7546/7547/7598/7698/7797/7798/7981/8272/8362/8838/8915/9237/9462（敌建/龙/妖仙/不死/恶魔/
 *   神祗/兽人侧计数）；8653（元素敌人数→摧毁行数）。
 *
 * 【按王国计/王国条件——等并行王国条件批落地】
 * - 7391（白盔国盟友+天使宝石双来源）、8723、8985、9245、9249、9588、9593、8607、8556（神堂+附魔）。
 *
 * 【二次缩放来源不支持（exotic）】
 * - 7231/9815（被减除护甲值）、7274（造成的伤害）、7388/7977/8812（被摧毁骷髅细分——destroyedGems
 *   无 skull 筛）、7464（targetStat 缺 missingHp）、7472（缺 manaCost）、7478/8060/8464（选定色计数/
 *   除外色）、7402（盟友攻击力来源）、7808（满血满蓝敌军数）、8220 之外的 8367（红敌法力总和）、
 *   8581（任意状态计数 CountStatusEffects）。
 *
 * 【数值区间（3-8/1-3/3-10 法力等，非数量区间）】
 * - 7469/8356/8931/9055（GenerateRandomMana 区间——8356 首句「紫色敌人」已可 targetColor 表达）、
 *   8114（2-4 层叠层区间）。
 *
 * 【目标偏移/弹射（「50% 打错敌人」无对应机制）】
 * - 7254/7314/7386/8108/8307。
 *
 * 【复合/位置目标、跨段绑定】
 * - 7000/9052（Block3x1 一行三格无此形状）、7253（限色选定行列）、7690（上下相邻冻结）、
 *   8220/8320（FromPrevious/受溅射集合）、8248（NextDown 单格+否则分支）、8659（上位敌人）、
 *   8534/8276（目标相对条件辖无目标宝石段）、8374（幸存条件=ifTargetDied 反向，无原语）、
 *   8101（两轮动态击退——Wave4 reposition n 已落但 ZH 压缩单次无法对号）、10061（几率上限）。
 *
 * 【动态颜色/兵种复制】
 * - 7182/7476/8737/8188/8216/8355/8273（指定盟友法力色无 'ALLY' 占位；复制召唤无原语）、
 *   7672（R16 已收）/8356 紫敌（固定色已可表，见上）。
 *
 * 【属性随机转移/比较】
 * - 7987/8377（随机技能值转移给他人——IncreaseRandom 全额入单围，randomStat 逐点分摊口径不合）、
 *   7812（逐围比较计数）、7960（反向属性比较，仅支持施法者>目标正向）、8374 幸存。
 *
 * 【其他】
 * - 7136（随机 N 颗普通骷髅爆破无原语，randomGems.special 仅特殊宝石）、7156 外的 7161（治疗量
 *   原文未给）、7207（随机分配伤害≠引擎均分 split）、7263/7935（「任意状态」条件不在条件域）、
 *   7328/7332（Mana Burn 增强量原文无数值）、7539（「受本法术伤害的敌人」过滤）、7542（凤凰涅槃）、
 *   7645（生命+护甲双池伤害）、7713（骷髅+绿宝石混合创造——createMix 不收 SKULL 端点）、
 *   7747（「其中一名/另一名」死亡绑定）、8467（[x5] 无来源）、8694（几率带 [魔法+1] 缩放）、
 *   8804（宝石周边位置计数）、9237 外的 9284（鬼魂+不死敌双来源）、9287（板面鬼魂计数驱动状态）、
 *   8927/8871（描述截断）、9546/9780（颜色+特殊宝石混合创造无原语——createMix 仅颜色、
 *   createSpecialGems2 仅双特殊）、9571（伤害值作他人治疗量绑定）、9640 外 9614 已收、
 *   8801 外 9638 已收、9476（死者法力色转换——阵亡移出编队后颜色不可解析）、9614 外 9717 已收。
 */

export const BATCH_R17: CuratedBatch = { batch: 'R17', spells: SPELLS, skipped: SKIPPED };
