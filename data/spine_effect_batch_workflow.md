# Spine 特效批量打标工作流

这套工具用于 0001–0500 的 Spine 特效目录。默认只读取每个编号目录内的 `effect*.png`，不会把角色或其他命名的 PNG 混入标签集。

## 1. 扫描图集并生成清单

```powershell
node scripts/spine_effect_scan.mjs `
  --input "D:\迅雷下载\特效500个【spine】\特效500个【spine】" `
  --out-dir data\spine-effect-scan `
  --overwrite
```

输出：

- `data/spine-effect-scan/manifest.json`：编号、文件名、尺寸、PNG 色彩类型、透明像素统计、异常报告。
- `data/spine-effect-scan/spine_effect_labels.csv`：按模板生成的 CSV 初始表，标签字段需要人工/视觉模型填写。

## 2. 生成可离线预览

建议先按 50 个编号分批生成，避免一次性 HTML 过大：

```powershell
node scripts/spine_effect_contact_sheet.mjs `
  --input "D:\迅雷下载\特效500个【spine】\特效500个【spine】" `
  --output "D:\迅雷下载\特效500个【spine】\特效500个【spine】\preview-0001-0050.html" `
  --columns 5 `
  --start 1 `
  --end 50 `
  --title "Spine 特效预览 0001–0050"
```

HTML 自包含图片，可直接双击打开；页面内支持文件名、编号和尺寸搜索。

## 3. 填写标签

以 `data/spine_effect_label_template.md` 的示例行为准，填写：

- 同一字段多个标签使用 `+`，不要使用逗号。
- `图集文件` 写实际发现的文件名；同一编号多个文件用 `+`。
- 不能仅凭 PNG 判断的运动位置/时间阶段，先写 `位置不明确` 或 `运动不明确`，不要把猜测当事实。
- 细节描述保持“主体 + 运动/方向 + 光色/材质 + 尾部/消散”的句式。

## 4. 校验 CSV

```powershell
node scripts/spine_effect_validate.mjs `
  --csv data\spine-effect-scan\spine_effect_labels.csv `
  --manifest data\spine-effect-scan\manifest.json
```

机器可读报告：

```powershell
node scripts/spine_effect_validate.mjs `
  --csv data\spine-effect-scan\spine_effect_labels.csv `
  --manifest data\spine-effect-scan\manifest.json `
  --json > data\spine-effect-scan\validation.json
```

校验器会检查 15 列表头、CSV 引号和列数、编号重复/越界、空字段、`+` 分隔符，以及 CSV 与 manifest 的文件差异。

## 本次素材扫描结果

- 编号目录：500/500
- 匹配到的 `effect*.png`：456
- 没有匹配 `effect*.png` 的目录：48（这些目录仍可能存在其他命名的 PNG，需要单独确认是否纳入）
- 同一编号内尺寸不一致：4 个（0268、0271、0367、0389）

这意味着当前可以先对 456 个匹配图集进行第一轮打标，再处理另外 48 个目录的命名例外和 4 个尺寸异常。
