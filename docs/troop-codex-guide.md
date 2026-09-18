# 军队图鉴使用指南（开发者文档）

> 图鉴数据：`data/raw/gow-2026-09-18/troop-codex.json`（1798 条全量）
> 生成命令：`node scripts/build_troop_codex.mjs`（每次技能/特质批次落地后重跑更新）
> 审计工具：`node scripts/troop_completeness.mjs`

## 当前覆盖

| 指标 | 数字 |
|---|---|
| 完整绑定兵种（技能+特质+立绘全齐） | **1740 / 1798（96.8%）** |
| 官方立绘 | 1827 / 1827（100%） |
| 技能库 | 1662 / 1793（92.7%） |
| 特质覆盖 | 759 code / 5372 次（97.1% 出场） |
| 特殊宝石类型 | 45 种全实现+贴图全量 |
| 状态效果 | 23 种全实现+图标全量 |

## 一、图鉴数据结构

```json
{
  "id": 6000,
  "code": "Ogre",
  "name": "食人魔",
  "kingdom": "破碎尖塔",
  "troopTypes": ["Giant"],
  "rarity": "Common",
  "description": "官方卡面描述…",
  "fileBase": "Troop_K00_00",
  "portrait": {
    "official": "https://gowhead.com/assets/troops/Troop_K00_00.webp",
    "local": "data/raw/gow-2026-09-18/portraits/Troop_K00_00.webp",
    "downloaded": true
  },
  "spell": {
    "id": 7131,
    "name": "泰山压顶",
    "desc": "随机爆破一颗的宝石…",
    "en": "Deal [Magic + 4] damage to a random Enemy…",
    "assembled": true
  },
  "traits": [
    { "code": "frenzy", "name": "狂暴", "implemented": true },
    { "code": "big", "name": "庞然", "implemented": true },
    { "code": "ogrefury", "name": "食人魔之怒", "implemented": true }
  ],
  "traitsImplemented": ["frenzy", "big", "ogrefury"],
  "binding": "full"
}
```

### 编码体系
- `id`：官方兵种 ID（gowhead.com 数据库主键，全局唯一）
- `code`：官方 ReferenceName（英文代码名，如 `Ogre`/`Troop_K00_00`）
- `fileBase`：立绘文件名（不含扩展名）
- `spell.id`：法术 ID（gowhead.com 数据库主键，与 curated 批 `id` 字段对应）
- `traits[].code`：特质代码（与 `src/data/traits.json` 的 `code` 字段对应）

### 绑定状态
- `full`：技能已组装 + 全部特质已实现 → **可直接投入战斗**
- `spellOnly`：技能已组装，特质有缺口
- `partial`：特质全实现，技能未组装
- `none`：技能和特质都缺

## 二、战斗中使用

### 加载技能原型

```typescript
import { getSkillPrototype } from '@engine/skills/library';

// 技能库按 spellId 查表
const proto = getSkillPrototype(7131); // 泰山压顶
// proto: SkillPrototype（含 segments 效果段数组）
```

### 施放技能

```typescript
// 通过 TurnEngine 施放（走正式释放流程，含选色/选目标/演出）
const events = engine.castSkillAction(characterId);
```

### 加载特质

```typescript
import { attachPassives, passivesOf } from '@engine/traits';

// 特质在创建角色时编译为被动修正
attachPassives(character); // character.traitIds → character.passive
// 战斗结算只读 character.passive（不查注册表）
```

### 立绘

```typescript
// 官方立绘 URL（1024×1024 WebP）
const url = `https://gowhead.com/assets/troops/${fileBase}.webp`;
// 本地已下载：data/raw/gow-2026-09-18/portraits/<fileBase>.webp
// 1827/1827 全量已下载（375MB）
```

## 三、自由组装自定义兵种

```typescript
import { Character } from '@engine/types';

const customTroop: Character = {
  id: nextId(),
  name: '自定义兵种',
  maxHp: 80, hp: 80,
  attack: 12, armor: 6, magic: 3,
  colors: [BaseColor.Red, BaseColor.Blue],
  manaCost: 8, mana: 0,
  skillId: '7004', // 或任意已组装的技能 id
  statuses: [], defeated: false,
  traitIds: ['frenzy', 'armored'],
  troopTypes: ['Giant'],
  kingdom: '破碎尖塔',
};
attachPassives(customTroop); // 编译特质 → passive
```

## 四、放映厅预览

```bash
# 技能全量放映（1662 条技能逐条演出 + 截图）
node scripts/skill_theater.mjs --mode skills

# 特质全量放映（759 code 逐条标准化刺激 + 截图）
node scripts/skill_theater.mjs --mode traits

# 画廊输出 → artifacts/theater/index.html
```

## 五、图鉴重跑

每次技能/特质批次落地后：

```bash
node scripts/build_troop_codex.mjs   # 重生成 codex JSON
node scripts/troop_completeness.mjs  # 重跑完整度审计
```

## 六、缺口清单

详见 `artifacts/recycle/troop-codex-report.md`（每次重跑自动更新）：
- 缺技能兵种 27（对应 E 池 30-40 未组装条目）
- 缺特质 code 26（全部带机制缺口原因，见 traits-rescue-plan.md）
- 缺口特质 code 按兵种出场排序 top 5：
  - jinx 24 兵种（敌方法术威力减半，已实现）
  - indigestible 18 兵种（吞噬免疫，数据字段已建模）
  - goodtarot 17 兵种（盟友施法→随机正面状态，已实现）
  - leader 15 兵种（位次条件光环，已实现）
  - badtarot 6 兵种（敌方施法→随机负面状态，已实现）
