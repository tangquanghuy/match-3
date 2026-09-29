# game-assets：游戏用到的全部图片 / 音频

所有游戏资源都在这一个目录下，按「怎么被使用」分三块：

| 目录 | 内容 | 怎么引用 | 进 git | 进 dist |
|---|---|---|---|---|
| `bundled/` | 代码 import 的资源：战斗特效条、宝石、音频、社区角色立绘、meta 界面图、活动图 | `import x from '@assets/fx/xxx.webp'`、`import.meta.glob('@assets/...')` | 是 | 是（文件名带 hash） |
| `public/static/` | 按 URL 原样发布的静态资源：部队立绘、王国纹章、武器卡面、地图、宝箱、入侵官阶等 | 字符串 URL `/static/...` | 否（体积大，只在本机） | 是（原样复制） |
| `source/` | 原图 / 源文件 / 生成提示词，以及没被代码引用的旧资源 | 不被代码引用 | 部分（见下） | 否 |

`public/static/` 下的分类：

- `portraits/` 部队立绘（1800 张，文件名 = troops.json 的 `portrait` 字段）
- `crests/` 王国纹章 · `kingdoms/` 王国场景图 · `map/` 世界地图
- `weapons/` 武器卡面 · `troops/` 编队兜底立绘 · `hero/` 主角头像
- `chests/` 宝箱场景 · `fx/` 抽卡/召唤特效 · `sfx/` 抽卡音效
- `invasion-ranks/` 入侵官阶徽章 · `ui/` 其它界面图

`source/` 下的分类：

- `portraits/`、`crests/`、`community/`：手工压缩前的原图（压缩版在 `public/static/`、`bundled/community/`）
- `static/`、`bundled/`：由 `scripts/assets/compress.py` 重新编码的那批资源的原图，目录结构与产物一一对应
- `_unused/`：代码已不再引用的旧资源（留档）
- 以上几个体积大，只在本机、不进 git；下面几个体积小，进 git：
- `audio/`：旁白落选录音（`narrator/archive/`）、状态音效的 AI 原始录音（`status-sfx-raw/`，由 `scripts/trim_status_sfx.mjs` 裁成 `bundled/audio/status/`）
- `prompts/`：立绘等美术的生成提示词 · `previews/`：特效序列帧预览 · `reference/`：示意图与参考图

GoW 官方抓取的原始资料不在这里，在 `data/raw/`（只作参考，游戏不直接使用）。

## 常用操作

- 重新生成压缩产物：`python scripts/assets/compress.py`（只处理比原图旧的；`--force` 全部重做）
- 检查代码引用的静态资源是否齐全：`node scripts/assets/check.mjs`
- 新增静态资源：原图放进 `source/static/<分类>/`，在 `compress.py` 的 `RULES` 里登记（若已有该分类则不用），运行脚本；代码里用 `/static/<分类>/<名字>.webp`
- 新增打包资源：直接放进 `bundled/`（大图先压成 webp），代码里用 `@assets/...` 引用
