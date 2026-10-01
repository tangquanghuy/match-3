# 秘法属性石实图与王国探索美术升级（2026-10-01）

## 范围

本轮只落地秘法属性石美术、背包辨识与探索页面视觉，保留既有12档难度、4场遭遇战＋首领＋最终Boss流程、奖励数值、存档及锁定规则。未提交、未部署。

## 生图及压缩

使用项目既有 `scripts/art-gen/generate.mjs`，清单为 `scripts/art-gen/exploreAssets.mjs`。配置来自用户指定的桌面配置文件；密钥仅经进程环境传入，未写入代码或本文。

- `stone-arcane-master`：透明灰晶母版，按已有低阶宝石的暗部、折射、高光风格设计，使用更高阶双尖晶体轮廓。
- `explore-relic-landscape`：遗迹圆门、山谷与石阶场景。
- `explore-difficulty-sigil`：透明镂空难度罗盘环；数字由页面绘制。

21种秘法石来自同一生成母版的程序化配色，并非分别调用21次生图。`scripts/art-gen/processExplore.py` 保留透明通道、暗部及高光，生成6种单色和15种双色，统一256×256。原图保留在被忽略的 `artifacts/art-gen/raw/`，游戏只使用WebP。

| 素材 | 数量 | 尺寸 | 总字节 |
| --- | ---: | --- | ---: |
| 秘法属性石 | 21 | 256×256 | 265,218 |
| 探索场景 | 1 | 1254×1254 | 249,368 |
| 难度罗盘 | 1 | 320×318 | 20,816 |
| 合计 | 23 | — | 535,402（约523 KiB） |

场景请求1536×1024，接口实际返回1254×1254。页面使用 `object-fit: cover` 响应式裁切，没有拉伸。

已有原图时重新处理：

```powershell
$env:ART_MANIFEST='exploreAssets.mjs'
python scripts/art-gen/process.py explore-relic-landscape explore-difficulty-sigil
python scripts/art-gen/processExplore.py
```

## 接线与界面

- `src/meta/shell/materialArt.ts` 统一读取真实WebP，替代秘法石简易SVG；双色反序映射至同一资源，单色别名仍有效。背包、商店、部队特质和奖励共用此入口。
- 背包保留秘法分区，21种分两页显示；未持有秘法石保留属性颜色，以透明度、虚线框和“未获得”标识库存状态。
- 探索采用遗迹主场景、前景难度徽章、滑杆和前后切换、六场路线、秘法奖励预览、敌方四人阵容及出战区。
- 桌面双栏，平板和手机自适应；320px窄屏及844×390横屏验证，控件可达，无横向溢出，出战按钮避开底栏。
- 生产构建后的 `dist/preload-manifest.json` 已逐一核验23张新图，全部指向存在的有效WebP文件，总体积与源资源一致，沿用登录前预加载流程。

## 验证

- 相关单测：5文件、81项通过（materialArtwork / exploreRun / exploreStoneDrops / arcaneSupply / materialShop）。
- 相关E2E：28项通过（questVisual / materialArtwork / bagVisual / materialShop），含空库存秘法保色检查。
- 本轮TypeScript文件定向ESLint通过。
- remote前端＋Worker构建通过。
- `git diff --check` 通过；工作区有换行转换提示。
- 全仓 `tsc --noEmit` 仍报告另一在途文件 `tests/unit/termGlossary.test.ts:11` 的未使用导入 `TERM_PATTERN`（TS6133）。本轮未改该文件；未将本轮报告为全仓类型检查通过。
- 本轮未重跑全量单测或全量E2E。

日志及预加载审计：`artifacts/explore-art-{unit,e2e,lint,tsc,build}.log`、`artifacts/explore-art-preload-audit.json`。

截图：
- 桌面探索：`artifacts/quest-redesign/explore-desktop-top.png`
- 手机探索：`artifacts/quest-redesign/explore-mobile-top.png`
- 窄屏出战：`artifacts/quest-redesign/explore-small-mobile-fight.png`
- 背包秘法：`artifacts/explore-art/bag-arcane-1600.png`
- 配色总览：`artifacts/art-gen/arcane-colorways-preview.jpg`
