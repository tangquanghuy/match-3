# 产品化路线设计 · AIRP 三消战斗

## 1. 当前基线

当前项目已具备三消、连锁、法力、骷髅伤害、生命/护甲、技能效果原语、状态、召唤、胜负和表现事件流。产品化的主要缺口是：

- 正式入口仍使用固定占位队伍。
- 技能释放未进入统一回合结束流程。
- 被动特质实现未接入 Character 和主战斗链路。
- AI 只交换，不释放技能。
- AIRP 角色输入和战斗结果回传不存在。
- 手机使用固定桌面画面 CSS 缩放；竖屏不可用，横屏控件偏小。
- 首屏等待全部技能特效解码，移动端性能风险高。
- E2E 在资源压力下不稳定，缺少触控与移动视口覆盖。

## 2. 总体架构

```text
AIRP / Tavern Host
  ├─ 永久角色、等级、经验、装备、剧情
  ├─ 生成 BattleRequest
  └─ 接收 BattleResult 并进行养成结算
             │ postMessage / standalone adapter
             ▼
HostBridge
  ├─ schema / origin / version 校验
  ├─ battleId 幂等
  └─ ready/start/result/ack/error
             ▼
BattleSession
  ├─ request → GameState
  ├─ action log / turn count
  ├─ GameState → BattleResult
  └─ session lifecycle
             ▼
TurnEngine（纯逻辑）
  ├─ BattleAction: swap | cast
  ├─ skills / statuses / traits
  ├─ AI action policy
  └─ deterministic RNG
             ▼
App / Render
  ├─ desktop-landscape
  ├─ mobile-landscape-compact
  ├─ portrait orientation gate
  └─ lazy assets / lifecycle
```

核心约束保持不变：`src/engine` 不依赖 DOM、Pixi、GSAP 或浏览器 API；宿主通信、视口和资源生命周期属于应用层。

## 3. 战斗行动与回合

统一行动结构：

```ts
type BattleAction =
  | { type: 'swap'; from: CellPos; to: CellPos }
  | { type: 'cast'; characterId: number; selections?: SkillSelections };
```

统一执行生命周期：

```text
AwaitingInput
  → validate action
  → Resolving
  → execute action
  → board cascades / effects
  → defeat and summon promotion
  → victory check
  → consume extra-turn signal or switch side
  → tick incoming side statuses/traits
  → dead-board reshuffle
  → AwaitingInput or GameOver
```

交换和技能不得各自维护一套不同的回合尾逻辑。`finishTurn()` 或其后继统一函数应成为唯一出口。

## 4. 外部角色与结果模型

建议新增应用层 DTO，不直接把引擎 `Character` 暴露给 AIRP：

```ts
interface BattleRequest {
  schemaVersion: 1;
  battleId: string;
  requestId: string;
  rulesetVersion: string;
  seed: number;
  playerTeam: CombatantSnapshot[];
  enemyTeam: CombatantSnapshot[];
}

interface CombatantSnapshot {
  externalId: string;
  templateId?: string;
  name: string;
  portraitUrl?: string;
  levelLabel?: string;
  stats: { hp: number; attack: number; armor: number; magic: number };
  manaColors: BaseColor[];
  manaCost: number;
  skillId: string;
  traitIds: string[];
}

interface BattleResult {
  schemaVersion: 1;
  battleId: string;
  requestId: string;
  rulesetVersion: string;
  seed: number;
  winner: 'player' | 'enemy';
  turns: number;
  combatants: CombatantResult[];
  defeatedExternalIds: string[];
  actionLogDigest: string;
  eventSummary: BattleEventSummary[];
}
```

转换层负责：

- 分配本场内部 numeric id。
- 保留 internal id ↔ externalId 映射。
- 校验数值上限、法力颜色、技能、特质和队伍人数。
- 从结果移除不应暴露的内部字段。
- 用 `rulesetVersion` 固定一场战斗的规则解释。

## 5. AIRP HostBridge

HostBridge 暴露统一接口，使 iframe 和独立调试模式共用 BattleSession：

```ts
interface HostBridge {
  waitForBattle(): Promise<BattleRequest>;
  notifyStarted(meta: BattleStarted): Promise<void>;
  submitResult(result: BattleResult): Promise<void>;
  reportError(error: BattleError): void;
}
```

实现：

- `PostMessageHostBridge`：生产 iframe/WebView。
- `StandaloneHostBridge`：本地 fixture、开发和展示。

postMessage 规则：

- 只接受 allowlist origin。
- 每条消息校验 `schemaVersion`、`type`、`battleId`、`requestId`。
- `battle:start` 对同一 `battleId` 只创建一次 session。
- `battle:result` 重试直到收到 `battle:result-ack` 或进入可恢复错误状态。
- 页面关闭前未确认结果时显示等待/重试提示。

## 6. 横屏移动设计

### 6.1 支持策略

产品只支持手机横屏，不实现手机竖屏战场：

- 手机竖屏：显示 OrientationGate，暂停战斗输入和非必要动画。
- 手机横屏：使用专用紧凑横屏布局。
- 平板横屏和桌面：使用标准横屏布局。
- 不依赖 `screen.orientation.lock()` 才能工作；可尝试请求，但拒绝时仍通过引导完成旋转。

### 6.2 布局模式

```ts
type LayoutMode = 'desktop-landscape' | 'mobile-landscape-compact';

interface BattleLayoutMetrics {
  mode: LayoutMode;
  viewport: Rect;
  safeInsets: Insets;
  boardRect: Rect;
  allyTeamRect: Rect;
  enemyTeamRect: Rect;
  hudRect: Rect;
  controlsRect: Rect;
  renderScale: number;
}
```

标准横屏保留“我方竖列 | 棋盘 | 敌方竖列”。紧凑横屏仍保持同一构图，但：

- 减少上下 margin 和棋盘顶部 inset。
- 缩短卡片高度、隐藏非关键文字，仅保留头像、攻击、生命/护甲、法力和状态。
- 棋盘优先占满可用高度。
- 全屏、退出、设置等控制放在不随战场缩放的独立 HTML 层，触控区至少 44px。
- 逻辑坐标与渲染坐标由 layout metrics 统一转换，不从 CSS transform 字符串反推。

目标视口：

- 必测：844×390、852×393、915×412。
- 最低支持：667×375；若安全区扣除后不足以达到最小触控尺寸，显示设备尺寸不支持提示。
- 桌面与平板继续覆盖 1024×768、1280×720、1920×1080。

### 6.3 方向门禁

OrientationGate 位于战斗层之上：

```text
portrait detected
  → disable InputController / card presses
  → pause idle/hint animations
  → show rotate icon + “请横屏继续战斗”
landscape restored
  → recompute visualViewport/layout
  → restore input if session state allows
```

使用 `matchMedia('(orientation: portrait)')`、`visualViewport.resize` 和容器 `ResizeObserver` 组合判断；不只依赖 `window.innerWidth`。

### 6.4 安全区和 iframe

- viewport 增加 `viewport-fit=cover`。
- 根层使用 `env(safe-area-inset-top/right/bottom/left)`。
- iframe 尺寸以 mount 容器和 `visualViewport` 的可用交集计算。
- `requestFullscreen()` 必须捕获拒绝；没有 `allowfullscreen` 时按钮显示可理解的不可用状态。
- localStorage 访问使用安全包装；禁用存储时使用默认值。

## 7. 触控输入设计

### 7.1 棋盘

InputController 增加：

- `activePointerId`。
- pointer capture/release。
- `pointercancel`、失焦和方向切换清理。
- 第二根手指忽略策略。
- 单次手势单次 action 保证。

### 7.2 角色卡

短按/长按状态：

```text
idle → pressed(pointerId, origin)
pressed → moved（超过阈值，禁止 short/long）
pressed → long-fired（达到阈值，只触发一次）
pressed → short-fired（抬起且未移动/未长按）
任意状态 → cancelled → idle
```

法力宝石必须在 pointer 阶段隔离卡片手势，而不是只阻止 click 冒泡。

## 8. 资源与性能

### 8.1 分级加载

- Critical：基础 CSS、宝石、棋盘、角色卡、HUD、当前队伍头像占位。
- Battle-required：本场角色技能和状态可能使用的特效/音频。
- Deferred：未参战技能、调试素材、其他状态资源。

`App.init()` 只等待 Critical；Battle-required 可并行加载并提供降级；Deferred 在 idle 时预取。

### 8.2 渲染预算

- DPR 默认封顶 2；低端模式可降至 1～1.5。
- 页面隐藏时暂停 idle tween、hint、非必要状态循环和 Pixi ticker。
- 大型 strip 不永久全部常驻；按引用和最近使用释放或限制缓存。
- 首屏单项资源加载设置超时，失败使用占位或程序化效果。

## 9. 交付阶段

1. **第 1 周：核心规则与移动横屏基础**——技能回合、触控误操作、方向门禁、紧凑布局骨架、首屏资源拆分、回归基线。
2. **第 2 周：真实队伍与结果模型**——BattleRequest、转换、移除 makeTeam、BattleResult、fixture。
3. **第 3 周：AIRP 闭环**——HostBridge、postMessage、校验、幂等、ack/retry。
4. **第 4 周：RPG 主链**——traits 接入、AI 施法、状态/技能规则补齐。
5. **第 5～6 周：内容纵切面**——20～30 技能、5～8 队伍、技能描述一致性。
6. **第 7～8 周：移动性能与发布**——真机、WebView、资源预算、E2E 稳定、发布候选。

## 10. 发布门槛

Alpha：

- 手机横屏可稳定操作，竖屏只显示旋转引导。
- AIRP 能传入真实角色并收到结果。
- 玩家和 AI 都能交换、施法并结束战斗。
- 至少一套完整玩家队和敌人队可玩。

Beta：

- traits 接通，20～30 个技能和 5～8 套队伍可用。
- 横屏真机矩阵、iframe/WebView 和性能预算通过。
- build、lint、unit/property 与关键 E2E 全部达到发布标准。
