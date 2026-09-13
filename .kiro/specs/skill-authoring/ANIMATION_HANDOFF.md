# 交接文档 · 如何给技能添加动画

> 适用项目：`D:\Code\match-3`  
> 目标读者：第一次接手本项目技能表现层的开发者或后续 Codex 对话。  
> 核心原则：**引擎只产生事件，表现层消费事件；测试台只负责配置与调试，不复制正式演出逻辑。**

---

## 1. 先理解完整链路

本项目给技能加动画，不是直接在技能配置里调用 GSAP。正确链路是：

```text
技能配置 / EffectPrimitive
        ↓
修改 GameState，并产出 GameEvent[]
        ↓
TurnEngine.castSkill()
        ↓
EventStreamPlayer.play(events)
        ↓
按事件类型构造 GSAP Timeline
        ↓
EventStreamPlayer 自己操作棋盘精灵
        或调用 App.onBattleEvent()
        ↓
App 操作角色卡、DOM 覆盖层、序列帧、弹道、音效
```

对应文件：

| 层级 | 文件 | 职责 |
|---|---|---|
| 技能配置 | `src/engine/skills/library.ts`、`builders.ts` | 描述技能由哪些效果段组成 |
| 效果执行 | `src/engine/skills/effects/*.ts` | 修改状态并返回事件 |
| 事件契约 | `src/engine/events.ts` | 定义逻辑层和表现层之间的数据结构 |
| 时间线 | `src/render/EventStreamPlayer.ts` | 决定每个事件什么时候开始、等待多久、棋盘精灵怎么动 |
| 主表现层 | `src/render/App.ts` | 角色卡、覆盖层、弹道、命中点、序列帧、音效 |
| 动画参数 | `src/render/AnimationConfig.ts` | 时长、尺寸、速度、帧数等统一配置 |
| 程序化粒子 | `src/render/FXLayer.ts` | Pixi 粒子、冲击波、连击文本等 |
| 角色卡动画 | `src/render/TeamView.ts` | 飘字、受击、后退、冲撞、状态显示 |
| 测试台 | `src/render/SkillTestPage.ts` | 换技能、改颜色、试听音效；不得重写正式演出 |

---

## 2. 先判断应该改哪一层

### 情况 A：逻辑事件已经存在，只想换动画

例如：

- `skill-damage` 想换命中序列帧
- `gem-explode` 想换爆炸动画
- `buff` 想增加一圈光
- 蓝色角色想播放水系命中特效

一般只改：

```text
src/render/App.ts
src/render/EventStreamPlayer.ts
src/render/AnimationConfig.ts
src/assets/fx/
```

不要新增引擎效果原语，也不要修改伤害计算。

### 情况 B：动画对，但发生时间不对

例如：

- 声音比命中画面晚
- 下一段事件在弹道到达前已经开始
- 多段技能挤在同一帧

优先改：

```text
src/render/EventStreamPlayer.ts
src/render/AnimationConfig.ts
```

重点检查 Timeline 有没有为外部动画预留时长。

### 情况 C：技能产生了全新的逻辑结果

例如新增：

- 击退事件
- 护盾破裂事件
- 复活事件
- 持续引导事件
- 独立于普通伤害的斩杀事件

需要完整走一遍：

```text
events.ts 定义事件
→ effects/*.ts 产生事件
→ EventStreamPlayer 识别事件
→ App / BoardView 播放表现
→ 单元测试 + E2E
```

---

## 3. 现有技能事件的演出位置

### `skill-cast`

事件内容：

```ts
{
  type: 'skill-cast';
  characterId: number;
  skillId: string;
}
```

当前流程：

```text
EventStreamPlayer
  → 在事件时间点调用 App.onBattleEvent
App
  → 根据施法者主颜色选择施法音效
```

如果要增加角色脚下法阵、蓄力光、立绘闪光，建议在 `App.onBattleEvent` 的 `skill-cast` 分支调用新方法：

```ts
case 'skill-cast': {
  const card = this.cardOfChar(ev.characterId);
  if (card) this.playCastAura(card, ev.skillId);
  break;
}
```

如果蓄力动画必须阻塞后续事件，还要在 `EventStreamPlayer` 的 `skill-cast` 分支增加等待时间：

```ts
tl.add(() => this.onBattleEvent?.(ev));
tl.to({}, { duration: 0.25 });
```

注意：GSAP 的 `duration` 单位是**秒**。

### `skill-damage`

当前流程：

```text
EventStreamPlayer.appendSkillDamage
  → 派发事件
  → 预留 0.42 秒
App.onBattleEvent
  → 找施法者卡片与目标卡片坐标
  → playProjectile(from, to, color, impact)
  → 弹道到达后执行 impact()
  → playFrameFX(hitFx)
  → playHitBurst()
  → 播放命中音
  → 飘伤害字、白闪、刷新卡片
```

这条链路已经适合绝大多数“发射物命中单体”的技能。新增普通伤害技能通常不需要再写动画代码。

### `buff`

当前由 `App.onBattleEvent` 处理：

```text
按属性选择飘字颜色
→ floatText(+N)
→ refresh()
```

如果要增加治疗光柱、护盾环等，可以按 `ev.stat` 分流：

```ts
case 'buff': {
  const card = this.cardOfChar(ev.targetId);
  if (!card) break;
  if (ev.stat === 'hp') this.playHealFX(card);
  if (ev.stat === 'armor') this.playShieldFX(card);
  // 原有飘字与刷新继续保留
  break;
}
```

### `gem-create` / `gem-transform` / `gem-destroy`

这些事件主要由 `EventStreamPlayer` 直接操作 `BoardView` 中的 Pixi 宝石精灵：

- `appendGemCreate`
- `appendGemTransform`
- `appendGemDestroy`

棋盘精灵动画应优先留在这里，不要搬到 `App` 的 DOM 覆盖层。

### `gem-explode`

当前是两层协作：

```text
EventStreamPlayer.appendGemExplode
  → 播放宝石爆炸音效
  → 缩小并淡出各宝石精灵
  → 派发事件给 App

App.onBattleEvent('gem-explode')
  → 计算每个格子的覆盖层坐标
  → 播放 energy_burst 序列帧
  → 按距离错峰约 0–120ms
```

因此：

- 修改宝石消失方式：改 `appendGemExplode`
- 修改覆盖层爆点：改 `App.onBattleEvent` 的 `gem-explode`
- 修改爆炸音效：改 `AudioManager` / 测试台 A/B 选择

---

## 4. 添加一套新的序列帧特效

本项目序列帧使用“横向 strip + CSS `steps()`”播放。

### 4.1 准备逐帧 PNG

推荐目录格式：

```text
<特效源目录>/0234/
├── 0234_000.png
├── 0234_001.png
├── 0234_002.png
└── ...
```

所有帧应：

- 使用透明背景
- 同一套特效保持一致画布尺寸
- 文件名可以正确排序
- 不要在不同帧里手动改变中心基准

### 4.2 生成 strip

使用：

```powershell
powershell -File scripts/build_fx_strip.ps1 `
  -SrcRoot "D:\path\to\effects" `
  -Id 0234 `
  -Name ice_burst `
  -FrameH 240 `
  -MaxFrames 24
```

脚本会：

1. 读取逐帧 PNG
2. 帧数过多时均匀抽帧
3. 计算所有帧非透明像素的联合包围盒
4. 使用统一裁剪框，避免动画抖动
5. 缩放到统一高度
6. 横向拼接
7. 输出：

```text
src/assets/fx/ice_burst_strip.png
```

脚本最后会打印：

```text
META frames=24 frameW=180 frameH=240 stripW=4320
```

把这些数值记下来。

### 4.3 在 `App.ts` 导入图片

```ts
import iceBurstStripUrl from '../assets/fx/ice_burst_strip.png';
```

加入 `FRAME_FX_URL`：

```ts
private static readonly FRAME_FX_URL: Record<string, string> = {
  // ...
  ice_burst: iceBurstStripUrl,
};
```

名称必须与后面 `AnimConfig.frameFX` 的键完全一致。

### 4.4 在 `AnimationConfig.ts` 登记参数

```ts
frameFX: {
  // ...
  ice_burst: {
    frames: 24,
    frameW: 180,
    frameH: 240,
    displayH: 300,
    duration: 520,
  },
}
```

字段含义：

| 字段 | 含义 |
|---|---|
| `frames` | strip 帧数 |
| `frameW` | strip 中单帧宽度，不是最终显示宽度 |
| `frameH` | strip 中单帧高度 |
| `displayH` | 页面实际显示高度 |
| `duration` | 整条动画播放时间，单位毫秒 |

### 4.5 播放

在 `App` 内：

```ts
this.playFrameFX('ice_burst', x, y);
```

带参数：

```ts
this.playFrameFX('ice_burst', x, y, {
  scale: 0.8,
  rotateDeg: 25,
  delay: 80,
  filter: 'filter:hue-rotate(20deg) brightness(1.15)',
});
```

`playFrameFX` 会自动：

- 按帧数注入一次专属 `@keyframes`
- 使用 `steps(frames)` 推进背景位置
- 居中定位
- 播放结束后删除 DOM

不要在各个技能里复制一套 CSS 动画代码。

---

## 5. 给现有伤害技能换专属命中动画

### 方案一：按施法者主颜色映射

当前 `App.skillHitFx(casterId)` 按角色主颜色映射：

```ts
const map: Record<BaseColor, string> = {
  [BaseColor.Red]: 'hit_red',
  [BaseColor.Blue]: 'hit_blue',
  [BaseColor.Green]: 'hit_green',
  [BaseColor.Yellow]: 'hit_gold',
  [BaseColor.Purple]: 'hit_purple',
  [BaseColor.Brown]: 'hit_brown',
};
```

新增某个元素动画时，按第 4 节导入并改映射即可。

适合：

- 同颜色技能共用一套动画
- 火、水、毒、土等元素表现
- 不需要区分具体 `skillId`

### 方案二：按具体技能区分

`skill-cast` 自带 `skillId`，但当前 `skill-damage` 事件没有 `skillId`。

如果命中动画必须区分具体技能，**不要依赖 App 里“记住上一次 skill-cast”**。多目标、多段伤害或事件交错后容易错配。

推荐扩展事件契约：

```ts
export interface SkillDamageEvent {
  type: 'skill-damage';
  casterId: number;
  targetId: number;
  skillId: string;
  damage: number;
  resultingHp: number;
  resultingArmor: number;
}
```

然后由伤害原语或执行上下文填入 `skillId`，表现层映射：

```ts
private skillHitFxBySkill(skillId: string, casterId: number): string {
  const map: Record<string, string> = {
    fireball: 'fire_burst',
    iceSpear: 'ice_burst',
  };
  return map[skillId] ?? this.skillHitFx(casterId);
}
```

更推荐事件携带**语义字段**而不是资源路径，例如：

```ts
fxKey: 'fireball' | 'iceSpear' | 'earthPunch'
```

引擎只描述语义，`App` 再把 `fxKey` 映射到具体 strip。

禁止让 `src/engine/**` import PNG、Pixi、DOM 或 GSAP。

---

## 6. 新增一种全新的动画事件

假设要新增“技能护盾破裂”事件。

### 6.1 在 `events.ts` 定义

```ts
export interface ShieldBreakEvent {
  type: 'shield-break';
  casterId: number;
  targetId: number;
  absorbed: number;
}
```

加入 `GameEvent` 联合类型：

```ts
export type GameEvent =
  | ...
  | ShieldBreakEvent;
```

事件应携带动画需要的稳定数据，不要要求表现层回查已经变化的旧状态。

### 6.2 在效果原语中产生事件

```ts
const ev: ShieldBreakEvent = {
  type: 'shield-break',
  casterId: ctx.casterId,
  targetId: target.id,
  absorbed,
};
return [ev];
```

### 6.3 在 `EventStreamPlayer.appendSegment` 接入

简单事件：

```ts
case 'shield-break':
  tl.add(() => this.onBattleEvent?.(ev));
  tl.to({}, { duration: 0.28 });
  break;
```

复杂事件建议单独方法：

```ts
case 'shield-break':
  this.appendShieldBreak(tl, ev);
  break;
```

```ts
private appendShieldBreak(
  tl: gsap.core.Timeline,
  ev: Extract<GameEvent, { type: 'shield-break' }>,
): void {
  tl.add(() => this.onBattleEvent?.(ev));
  tl.to({}, { duration: 0.28 });
}
```

### 6.4 在 `App.onBattleEvent` 播放

```ts
case 'shield-break': {
  const card = this.cardOfChar(ev.targetId);
  if (!card) break;
  const point = this.cardCenterInOverlay(card);
  if (point) this.playFrameFX('shield_break', point.x, point.y);
  card.hitFlash();
  break;
}
```

---

## 7. 时间线与同步规则

这是最容易出问题的部分。

### 7.1 构造 Timeline 时不要立即播放

错误：

```ts
this.audio.play('skill');
this.onBattleEvent?.(ev);
```

这会在构造时间线时直接执行。

正确：

```ts
tl.add(() => {
  this.audio.play('skill');
  this.onBattleEvent?.(ev);
});
```

### 7.2 GSAP 秒与配置毫秒不要混用

```ts
// GSAP：秒
tl.to({}, { duration: 0.42 });

// AnimConfig / Web Animations：毫秒
{ duration: 420 }
```

### 7.3 DOM 动画不在 GSAP Timeline 内时，必须手动占位

`App.playProjectile()` 使用独立动画，`EventStreamPlayer` 不会自动知道它何时结束，所以当前 `appendSkillDamage` 手动：

```ts
tl.to({}, { duration: 0.42 });
```

如果修改弹道最大时长，必须同步检查这里。

### 7.4 音效要绑定到真实视觉帧

- 施法音：绑定 `skill-cast`
- 弹道起飞音：绑定弹道创建
- 命中音：放在 `playProjectile` 的 `onArrive` / `impact` 回调
- 冲撞音：放在 `CharacterCard.lunge` 的 `onHit`

不要因为逻辑事件是“伤害”就立刻播放命中音，否则声音会比弹道早到。

### 7.5 多目标技能不要重复播放大音效

群体伤害可能产生多个 `skill-damage` 事件。大型声音或全屏动画应考虑：

- 按时间做 cooldown
- 在一个聚合事件中只触发一次
- 后续目标只播放小命中
- 播放新长音效前停止旧实例

当前宝石爆炸音效 A/B 已使用“新候选播放前停止上一个长候选”的方式避免重叠。

### 7.6 宝石消除 / 连击音效已定稿为新版整套

正式运行时只使用采样版音效：

- 等级 1：普通消除
- 等级 2~5：2~5 连击
- 超过 5 级：复用 5 级采样并小幅提高 `playbackRate`
- 4 连击：单独提高增益到 `1.45`
- 额外回合 HUD 脉冲：继续同一条连击音高阶梯

资源：

```text
src/assets/audio/gems/chains/gem_chain_1.wav
src/assets/audio/gems/chains/gem_chain_2.wav
src/assets/audio/gems/chains/gem_chain_3.wav
src/assets/audio/gems/chains/gem_chain_4.wav
src/assets/audio/gems/chains/gem_chain_5.wav
```

旧版 Web Audio 方波合成已从运行时和测试台移除，源码参数备份保留在：

```text
src/assets/audio/archive/legacy_gem_chain_synth.ts.txt
```

正式战斗统一调用：

```ts
AudioManager.playChain(chainLevel)
```

`EventStreamPlayer.appendElimination()` 对同一连锁等级只在 `isLead` 消除组播放一次，避免同级多组消除重叠。`extra-turn` 事件调用 `playChain(extraTurnComboLevel)`。

测试台 `/skills-test.html` 仅保留：

- 「试听新版整套」：顺序播放普通消除到 5 连击
- 单级按钮：分别试听普通消除和 2~5 连击

---

## 8. 坐标系统

本项目同时存在 Pixi 棋盘坐标、DOM 屏幕坐标和缩放后的覆盖层坐标。

常用方法：

| 方法 | 用途 |
|---|---|
| `EventStreamPlayer.center(pos)` | 棋盘格中心，BoardView/Pixi 坐标 |
| `board.toGlobal(point)` | Pixi 局部坐标转全局坐标 |
| `App.cardCenterInOverlay(card)` | 角色卡中心转覆盖层布局坐标 |
| `App.cellsCenterInOverlay(cells)` | 一组棋盘格中心转覆盖层坐标 |
| `App.currentScale()` | 取得 wrapper 当前缩放，修正 `getBoundingClientRect()` |

不要直接把 `getBoundingClientRect()` 的屏幕像素传给覆盖层动画。项目会自适应缩放，必须除回 `currentScale()` 并减去 overlay 的 rect。

覆盖层动画基本要求：

```css
position: absolute;
pointer-events: none;
transform: translate(-50%, -50%);
```

并在结束后删除节点，避免长局内 DOM 不断累积。

---

## 9. 程序化特效放在哪里

### 棋盘粒子 / Pixi

放在：

```text
src/render/FXLayer.ts
```

适合：

- 宝石消除粒子
- 冲击环
- 连击数字
- 与 BoardView 坐标完全一致的特效

### 角色卡 / 覆盖层 DOM

放在：

```text
src/render/App.ts
src/render/TeamView.ts
```

适合：

- 角色之间的弹道
- 卡片上方光效
- 全屏/跨棋盘命中效果
- 飘字、闪白、后退、冲撞

### 通用动画参数

放在：

```text
src/render/AnimationConfig.ts
```

不要把持续时间、粒子数量、显示高度散落在多个事件分支里。

---

## 10. 测试台接入方式

测试页地址：

```text
/skills-test.html
```

新增技能动画时：

1. 如果已有对应技能标签，直接拖到我方角色卡测试。
2. 如果没有，在 `SkillTestPage.ts` 的 `PRESETS` 中加一个最小原型。
3. 使用“法力上限=3”和“充满法力”。
4. 短按角色卡走真实 `App.castPlayerSkill` 流程。
5. 观察事件日志，确认逻辑事件与动画顺序一致。

只允许测试台做：

- 换技能
- 改颜色
- 改测试数值
- 切换 A/B 素材
- 记录日志

不允许测试台自己实现：

- 技能目标选择
- 技能伤害计算
- 弹道
- 命中动画
- 宝石清除动画

否则测试页表现正常，不代表正式游戏正常。

当前测试台保留了可扩展的音效 A/B 区域。以后增加新的动画或音效比较组时，可以沿用“变体表 + 运行时 setter + 点击即试听”的方式；选定最终版本后应移除未使用资源的 import，避免全部候选进入正式构建。

---

## 11. 推荐测试

### 逻辑测试

如果新增事件或效果：

```powershell
npm test
```

断言：

- 事件类型正确
- 事件字段完整
- 状态修改正确
- 相同状态与随机种子结果稳定

### 类型和构建

```powershell
npm run build
npm run lint
```

`npm run build` 包含 `tsc --noEmit`，可以发现：

- `GameEvent` 联合遗漏
- switch 未穷尽
- 资源 import 错误
- `AnimConfig.frameFX` 名称不一致

### 技能 E2E

```powershell
npx playwright test tests/e2e/skills.spec.ts
```

至少验证：

```text
拖入技能
→ 释放
→ 日志出现 skill-cast
→ 出现目标效果事件
```

像素级动画通常不做脆弱截图断言，但应断言：

- 页面无异常
- 事件流完成
- 选择器可结束
- 新测试按钮可见且可切换

### 音频 / 图片资源

音频解码测试：

```powershell
npx playwright test tests/e2e/audioAssets.spec.ts
```

新增序列帧时至少运行正式构建，确认 Vite 能找到资源。

---

## 12. 常见坑

### 坑 1：只在 App 里看状态猜技能

多段技能、群体技能、连锁事件可能让“上一个技能”状态失效。需要区分技能时，让事件携带稳定语义字段。

### 坑 2：引擎 import 表现层

以下内容禁止出现在 `src/engine/**`：

```text
pixi.js
gsap
document / window
PNG / WAV import
AudioContext
```

### 坑 3：事件没有带够动画数据

事件发生后状态可能已经改变。需要旧宝石类型、旧位置、目标 ID 时，应直接写入事件。

### 坑 4：序列帧尺寸登记错误

`frameW` / `frameH` 必须是 strip 内单帧尺寸。写成 strip 总宽度会导致背景位移完全错误。

### 坑 5：每帧单独裁剪导致抖动

必须使用所有帧的联合包围盒统一裁剪。`build_fx_strip.ps1` 已处理，不要手工逐帧 trim。

### 坑 6：只改视觉时长，没有改 Timeline 等待

结果是下一段技能提前开始。修改 `projectile.maxDuration`、帧动画时长或卡片动画后，检查 `EventStreamPlayer` 的占位时间。

### 坑 7：资源候选全部进入正式包

只要在共享模块中静态 import，Vite 就会把资源打包。A/B 完成后：

- 保留备份文件可以
- 删除未选候选的 import
- 运行 build 检查 dist

### 坑 8：忘记清理 DOM

程序化覆盖层动画必须在结束后 `remove()`。循环战斗中不清理会持续增加节点。

---

### 坑 9：序列帧贴图未解码就开始 CSS 动画

`playFrameFX` 的动画计时不会等待 `background-image` 下载。如果首次播放时才开始加载 strip，常见结果是“第一次不可见，第二次正常”。

当前通用层保证：

- `App.init()` 会 `await App.preloadAllFrameFX()`，对 `FRAME_FX_URL` 中的所有唯一 URL 加载并 `decode()`
- `playFrameFX()` 再次检查 URL 是否 ready；未 ready 时延后起播，不让 CSS 动画空跑
- 新增正式 strip 只要登记进 `FRAME_FX_URL`，就会自动进入预加载屏障

不要绕过 `playFrameFX()` 自己创建带 `background-image` 的即时 CSS 动画。


## 13. 最短操作清单

### 给现有伤害技能换动画

```text
[ ] 准备逐帧 PNG
[ ] build_fx_strip.ps1 生成 strip
[ ] App.ts import strip
[ ] App.FRAME_FX_URL 登记
[ ] AnimationConfig.frameFX 登记 frames/frameW/frameH/displayH/duration
[ ] skillHitFx 或 skillId 映射到新 key
[ ] npm run build
[ ] skills-test.html 实际释放
```

### 新增全新技能事件动画

```text
[ ] events.ts 定义事件并加入 GameEvent
[ ] effects/*.ts 返回事件
[ ] 添加单元测试验证事件和状态
[ ] EventStreamPlayer.appendSegment 接入
[ ] 必要时新增 appendXxx 并预留 Timeline 时长
[ ] App.onBattleEvent / BoardView 播放动画
[ ] 音效绑定视觉帧
[ ] npm test
[ ] npm run build
[ ] npm run lint
[ ] npx playwright test tests/e2e/skills.spec.ts
```

---

## 14. 当前可直接复用的表现能力

优先复用，不要重复造轮子：

```ts
// 横向序列帧 strip
this.playFrameFX(name, x, y, opts);

// 角色到角色的直线弹道，抵达后回调
this.playProjectile(from, to, color, onArrive);

// 命中点亮核 + 放射线 + 细环
this.playHitBurst(x, y, color);

// 角色卡中心
this.cardCenterInOverlay(card);

// 一组宝石格中心
this.cellsCenterInOverlay(cells);

// 角色颜色
this.casterColor(casterId);
this.skillFxColor(casterId);
this.skillHitFx(casterId);

// 卡片反馈
card.floatText(text, color);
card.hitFlash();
card.recoil(direction);
card.refresh();
```

接手开发时，应先确认这些能力是否已经满足需求，再决定是否增加新 helper。

---

## 15. 交付前检查

```text
[ ] 动画走真实 GameEvent，不是测试页私有流程
[ ] 引擎没有 import 表现层依赖
[ ] 动画坐标经过正确转换
[ ] 音效与真实起飞/命中帧同步
[ ] Timeline 为外部动画预留足够时间
[ ] 多目标技能不会重复叠加大型音效
[ ] 序列帧节点会自动清理
[ ] 原始素材未被删除
[ ] ATTRIBUTION.md 已登记第三方素材
[ ] A/B 未选资源不会进入最终构建
[ ] npm test 通过
[ ] npm run build 通过
[ ] npm run lint 通过
[ ] 对应 Playwright E2E 通过
```

如果只记住一句话：

> **先让引擎发出稳定、完整的事件，再让 EventStreamPlayer 安排时间，让 App/BoardView 负责画面；不要从技能配置直接调用动画。**

---

## 16. 当前标准流程：给技能加动画和技能音效

这一节按当前项目的真实实现写，后续新增技能表现优先照这里操作。

### 16.1 素材来源与确认规则

当前主要本地素材目录：

```text
逐帧 PNG：D:\迅雷下载\特效500个【png】\特效500个【png】\<编号>
Spine 原件：D:\迅雷下载\特效500个【spine】\特效500个【spine】\<编号>
用户音频：D:\BaiduNetdiskDownload
```

规则：

1. 用户只给素材名时，先在用户明确给出的本地目录查找。
2. 不确定文件位置、裁剪区间或素材版本时，先询问用户。
3. 未经用户明确要求，不要自行联网搜索、下载或替换素材。
4. 原始音频、原始逐帧目录不得删除；项目内只放运行时成品和必要备份。

### 16.2 添加序列帧动画

#### 第一步：检查素材阶段

至少查看：

```text
第一帧
前段关键帧
中段关键帧
末段关键帧
```

先判断素材中是否混有多个阶段，例如：

```text
飞行 → 命中 → 插地 → 残留
```

如果技能只需要“飞行”，必须在打 strip 前截断后面的命中/插地帧，不要运行时播放完整素材再强行遮挡。

#### 第二步：生成 strip

通用脚本：

```powershell
powershell -File scripts/build_fx_strip.ps1 `
  -SrcRoot "D:\迅雷下载\特效500个【png】\特效500个【png】" `
  -Id 0450 `
  -Name burning_apply `
  -FrameH 240 `
  -MaxFrames 30
```

只取部分帧：

```powershell
powershell -File scripts/build_fx_strip.ps1 `
  -SrcRoot "D:\迅雷下载\特效500个【png】\特效500个【png】" `
  -Id 0002 `
  -Name splash_chain_sword `
  -StartFrame 0 `
  -EndFrame 1 `
  -FrameH 360 `
  -MaxFrames 2
```

脚本会：

- 按文件名排序；
- 支持 `StartFrame` / `EndFrame`（闭区间）；
- 对选定帧计算统一 Alpha 联合包围盒；
- 统一裁剪和缩放，避免逐帧抖动；
- 输出到 `src/assets/fx/<name>_strip.png`；
- 打印最终 `frames / frameW / frameH`。

#### 第三步：登记资源

在 `src/render/App.ts`：

```ts
import burningApplyStripUrl from '../assets/fx/burning_apply_strip.png';
```

并加入：

```ts
private static readonly FRAME_FX_URL: Record<string, string> = {
  burning_apply: burningApplyStripUrl,
};
```

只要进入 `FRAME_FX_URL`，`App.init()` 的 `preloadAllFrameFX()` 就会提前加载并解码，避免首次播放空白。

#### 第四步：登记动画参数

在 `src/render/AnimationConfig.ts`：

```ts
burning_apply: {
  frames: 30,
  frameW: 195,
  frameH: 240,
  displayH: 255,
  duration: 900,
},
```

含义：

- `frames`：strip 帧数；
- `frameW` / `frameH`：单帧尺寸，不是 strip 总尺寸；
- `displayH`：实际显示高度；
- `duration`：播放总时长，单位毫秒。

放大动画优先调整 `displayH`；单次特殊放大才传 `playFrameFX(..., { scale })`。

#### 第五步：在事件分支播放

普通目标卡特效：

```ts
const card = this.cardOfChar(ev.targetId);
const center = card ? this.cardCenterInOverlay(card) : null;
if (center) this.playFrameFX('burning_apply', center.x, center.y);
```

棋盘居中特效：

```ts
const center = this.boardCenterInOverlay();
if (center) this.playFrameFX('effect_name', center.x, center.y);
```

如果素材主体偏离透明画布中心，不要盲目旋转；先分析主体重心，再调整锚点，例如冰冻 0058 当前需要向左补偿。

#### 第六步：给 Timeline 留时间

动画由 `App.onBattleEvent()` 启动时，它不在 GSAP 主 Timeline 内，必须在 `EventStreamPlayer` 占位：

```ts
tl.add(() => this.onBattleEvent?.(ev));
tl.to({}, { duration: AnimConfig.frameFX.burning_apply.duration / 1000 });
```

注意配置是毫秒，GSAP 是秒。

### 16.3 添加或裁剪技能音效

#### 音频处理原则

1. 先检查源音频总时长和有效波形区间。
2. 音效明显长于动画时，截取最有辨识度的攻击段，不要只拿源文件开头。
3. 切点加短淡入/淡出，防止爆音。
4. 运行时成品统一放在 `src/assets/audio/` 对应分类目录。
5. 完整源文件保留，并在 `README.md` / `ATTRIBUTION.md` 记录裁剪范围。

当前示例：

```text
中毒：poison_spell.flac 0.72-1.48s
      → poison_spell_short.wav，0.76s

燃烧：树木燃烧.wav 0.58-1.48s
      → burning_tree.wav，0.90s
```

音效时长应大致贴合动画：

```text
短命中：约 0.3-0.8s
状态施加：约 0.7-1.5s
大招释放：可更长，但 Timeline 必须等待关键段
```

#### 在 AudioManager 中接入

需要完整修改以下位置：

1. 顶部静态 import：

```ts
import burningTreeUrl from '../assets/audio/skills/burning_tree.wav?url';
```

2. `SfxName` 联合类型：

```ts
| 'burning'
```

3. Buffer 字段：

```ts
private burningTreeBuffer: AudioBuffer | null = null;
```

4. 预取 Promise：

```ts
private readonly burningTreeBytePromise = this.fetchAudioBytes(burningTreeUrl);
```

5. `init()` 中加载：

```ts
void this.loadBurningTree();
```

6. `play()` 分流：

```ts
case 'burning':
  this.burningTree();
  break;
```

7. 实际播放方法：

```ts
private async loadBurningTree(): Promise<void> {
  this.burningTreeBuffer = await this.decodePrefetched(this.burningTreeBytePromise);
}

private burningTree(): void {
  if (!this.ctx || !this.sfxBus || !this.burningTreeBuffer) return;
  const source = this.ctx.createBufferSource();
  const gain = this.ctx.createGain();
  source.buffer = this.burningTreeBuffer;
  gain.gain.value = 0.62;
  source.connect(gain);
  gain.connect(this.sfxBus);
  source.start(this.ctx.currentTime);
}
```

群体技能或全体状态要加节流，避免同一采样在同一瞬间叠三到四层。

#### 音画同步位置

- 施法音：绑定 `skill-cast` 或正式释放动画起帧；
- 弹道音：绑定弹体起飞；
- 受击音：绑定弹体抵达/受击动画出现；
- 状态音：绑定 `status-apply` 动画出现；
- 多目标同时受击的大音效通常只播一次。

不要因为事件已经进入 Timeline 就提前播放受击音；声音必须跟实际画面命中点同步。

### 16.4 资源说明和测试

新增序列帧后更新：

```text
src/assets/fx/README.md
```

新增/裁剪音频后更新：

```text
src/assets/audio/README.md
src/assets/audio/ATTRIBUTION.md
```

至少运行：

```powershell
npm run build
npx playwright test tests/e2e/audioAssets.spec.ts
npx playwright test tests/e2e/skills.spec.ts
```

E2E 至少断言：

- strip 已预加载；
- 对应 `data-fx` 节点出现；
- 音频能被 Chromium Web Audio 解码；
- 裁剪后时长符合配置；
- 播放结束后 `casting` 能恢复。

---

## 17. 当前已经完成的技能表现映射

| 类型 | 当前表现 |
|---|---|
| 单体伤害 | 通用弹道飞向指定目标；按施法者主颜色选择受击动画和音效 |
| 溅射伤害 | 选定敌人；棋盘中央播放 0083；首目标及后续目标保留原 0406 受击；目标间使用 0002 的 00-01 飞剑帧弹射 |
| 中毒 | 0340，显示高度 150；音效裁成 0.76s |
| 冰冻 | 0058，显示高度 300；校正透明画布主体偏右问题 |
| 燃烧 | 0450，显示高度 255；音效使用裁剪后的“树木燃烧”0.90s |
| 治疗/净化 | 0287 + 治疗音效 |
| 加护甲 | 0306 + 铁器命中音效 |
| 召唤 | 0011 + 召唤音效 |
| 阵亡 | 0353 |
| 额外回合 | 当前仍沿用连击/HUD反馈；待改成 0082 棋盘居中动画 |

---

## 18. 多段技能的动画与音效组合规则

多段技能不是选一套动画覆盖全部效果，而是按效果段依次组合。

例如蓝色技能：

```text
造成伤害 + 冰冻
```

正确演出：

```text
skill-cast
→ 蓝色伤害弹道/受击动画
→ 蓝色单体受击音效
→ frozen status-apply
→ 0058 冰冻动画
→ 冰冻音效
```

中毒、燃烧同理：

```text
伤害
→ 对应颜色受击动画和音效
→ 中毒 0340 + 中毒音效
```

```text
伤害
→ 对应颜色受击动画和音效
→ 燃烧 0450 + 树木燃烧音效
```

实现原则：

1. `skill-cast` 一次技能只播放一次。
2. `skill-damage` 负责伤害段自己的颜色表现。
3. `status-apply` 是独立附加段，必须在伤害受击之后播放自己的动画和音效。
4. 不要把冰冻、中毒、燃烧直接塞进伤害命中回调，否则其他纯状态技能无法复用。
5. 技能原型中效果段的书写顺序，就是事件和演出顺序。
6. 多目标伤害段可以同时命中，但后续附加状态仍应作为下一阶段出现。
7. 如果同一技能包含多个状态，按原型段顺序依次播放，不做状态动画互相覆盖的特殊猜测。

原型示例：

```ts
skill(
  dmg('enemyChosen', 6),
  inflict('frozen', 'enemyChosen'),
)
```

表现层不需要识别“这是一招冰伤技能”的文案，只需要依次消费：

```text
skill-damage
status-apply(frozen)
```

---

## 19. 后续动画与音效任务清单

### P0-1：群体攻击重做

要求：

1. 群体攻击不播放通用弹道。
2. 先播放 0241 号动画，作为群攻释放阶段。
3. 0241 建议作为棋盘中央或战场中部的大范围释放动画，具体锚点试听/预览后确定。
4. 释放动画结束或进入命中帧后，所有存活敌人同时出现受击动画。
5. 受击动画范围要大，不能只覆盖头像中心的一小块。
6. 按施法者主颜色选择群体受击素材：

| 主颜色 | 群体受击动画编号 |
|---|---:|
| 紫色 | 0475 |
| 红色 | 0449 |
| 蓝色 | 0344 |
| 黄色 | 0318 |
| 棕色 | 0334 |
| 绿色 | 0349 |

7. 音效沿用各自颜色现有的单体受击音效通道。
8. 同一批敌人同时受击时，颜色受击音效只播放一次，避免 3/4 份采样叠加削波。
9. 逻辑伤害仍以每个 `skill-damage` 事件为准；表现层需要识别同一群攻批次，将连续 `range='all'` 的伤害事件聚合成一次释放 + 同时命中。
10. 如现有事件不足以稳定聚合，给事件增加 `batchId` / `batchIndex` / `batchCount`，不要依赖时间差猜测。

建议流程：

```text
skill-cast
→ 0241 群攻释放
→ 所有目标同时播放颜色对应大范围受击动画
→ 颜色单体受击音效播放一次
→ 同时飘伤害数字并刷新卡片
→ 再进入后续状态/宝石/增益效果段
```

### P0-2：额外回合动画

要求：

- 使用 0082 号动画；
- 棋盘中央播放；
- 与 `extra-turn` 事件绑定；
- 动画只播放一次；
- Timeline 必须等待关键表现结束；
- 不要替换或破坏现有回合归属、HUD、连击音效逻辑，0082 是新增视觉层。

### P1-1：基础技能组件动画/音效缺口检查

需要按 `EffectSegment` / `GameEvent` 全量审计，不按测试页按钮猜。

重点检查：

```text
skill-cast
skill-damage(single/all/splash/true damage)
buff(hp/armor/attack/magic/mana)
status-apply(poison/burning/frozen/silence/stun/curse/...)
status-cleanse
status-tick
status-expire
gem-create
gem-transform
gem-destroy
gem-explode
extra-turn
summon
defeat
```

输出一张表：

```text
组件/事件 | 逻辑已完成 | 动画已完成 | 音效已完成 | 是否专属 | 缺口 | 优先级
```

尤其确认：

- 群体伤害目前尚未做专属释放/同时命中；
- 真实伤害是否应与普通单体伤害区分；
- 加攻击、加魔法、加法力是否仍只有飘字；
- 沉默、眩晕、诅咒等状态是否只有徽标；
- `status-tick` 是否需要毒/火持续伤害动画和音效；
- 宝石创建/转化/摧毁是否需要按类型补音效；
- 额外回合 0082 尚未接入。

### P1-2：测试控制台增加“多段技能组合器”

目标：在 `SkillTestPage` 或独立调试控制台中，不改正式技能库就能组合并试听多段技能。

建议字段：

```text
施法者主颜色
目标模式
效果段列表（可增删、拖动排序）
伤害数值/倍率
附加状态与持续回合
是否群体/溅射/真实伤害
是否追加宝石操作、增益、额外回合、召唤
```

至少提供预设：

```text
蓝色单体伤害 + 冰冻
绿色/任意色单体伤害 + 中毒
红色单体伤害 + 燃烧
群体伤害 + 全体燃烧
伤害 + 降益/控制
伤害 + 宝石爆破
伤害 + 额外回合
```

控制台只负责组装 `SkillPrototype` 并调用正式释放链路：

```text
builders / skill(...segments)
→ App.castPlayerSkill / TurnEngine.castSkill
→ GameEvent[]
→ EventStreamPlayer
→ App / AudioManager
```

禁止控制台自己直接调用 `playFrameFX()` 或 `audio.play()`，否则多段技能在测试台正常、正式战斗失效。

验收重点：

- 事件日志顺序与效果段顺序一致；
- 伤害动画结束后才播放冰冻/中毒/燃烧；
- 每一段音效绑定自己的视觉帧；
- 群体段同时命中，附加状态作为后续独立阶段；
- 取消选目标时整条组合技能不消耗法力；
- AI 使用同一原型时不依赖玩家选择 UI。
