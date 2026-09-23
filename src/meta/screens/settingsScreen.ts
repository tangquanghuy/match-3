/**
 * 设置屏（存档导出/导入/重置 + 开发者选项）。
 *
 * UX 阶段 A 在这一屏记了 4 条 P0（`16-settings.md`），根因是「破坏性操作比只读操作更显眼、
 * 而唯一的风险警告被面板裁掉」。本轮重做的三条原则：
 *   1. **只读操作显眼，破坏性操作费力**（导出/复制是亮金次级按钮；导入与重置一律暗红危险态 + 二次确认）；
 *   2. **覆盖前先看清要覆盖成什么**（导入先校验 + 并排预览「已读取 / 将覆盖」，不合法的 JSON 直接拒绝）；
 *   3. **反馈留在页面上**（成功卡片，不用一闪而过又被整屏重建冲掉的 toast）。
 */
import { bottomNavHtml, mountIcons, toast, toastHtml, topbarHtml, $ } from '../shell/chrome';
import type { MetaSave } from '../state/schema';
import type { Screen, ShellCtx } from '../shell/screen';
import { setSkipCastConfirm, skipCastConfirm } from '../../render/battlePrefs';
import {
  getPlayerPreferences,
  setPlayerPreferences,
} from '../../preferences/playerPreferences';

/**
 * 本屏样式段（窗口 Q）。`shell/styles/**` 归 L 独占，故写在屏内。
 * L 交付后迁移：暗红危险态 → `.btn--danger` + `--ds-edge-danger`，面板 → `--ds-l1`，卡片 → `--ds-l2`。
 *
 * 其中 `.panel` 的高度模型覆盖是 **S-1 的本屏兜底**：全局 `.panel{height:100%;overflow:hidden}`
 * 假设「面板里只有 panel-inner」，而本屏把 `.panel-head` 放进 `.panel` → inner 溢出正好一个 head
 * 的高度（实测 63px）被裁掉，导入按钮只露 4px、唯一的风险警告 0% 可见。
 * 全局修法（`.panel` 改 flex 列）属 L 的组件基类工作，已在台账登记为需求。
 */
const SETTINGS_CSS = `
  .settings-screen { padding: 20px 40px 96px; overflow-y: auto; }
  .settings-screen .settings-layout { display: flex; flex-direction: column; gap: 14px; }
  /* S-1 兜底：面板改 flex 列，head 与 inner 共享高度，内容不再被裁 */
  .settings-screen .panel { height: auto; display: flex; flex-direction: column; overflow: visible; }
  .settings-screen .panel-inner { height: auto; flex: 1 1 auto; min-height: 0; overflow: visible; }
  .settings-screen .settings-body { display: flex; flex-direction: column; gap: 12px; padding-bottom: 6px; }
  .settings-screen .settings-note { font: 12px var(--body); line-height: 1.7; color: #c4b6a3; }
  .settings-screen .settings-row { display: flex; gap: 10px; flex-wrap: wrap; }
  .settings-screen textarea#saveText {
    width: 100%; min-height: 120px;
    background: rgba(8, 8, 14, .82);
    border: 1px solid #67563e;
    border-radius: 4px;
    color: #c4b6a3;
    font: 12px ui-monospace, monospace;
    padding: 10px;
    resize: vertical;
  }

  /* S-4：危险区与危险按钮必须一眼可辨（改前两个「重置」与「导出」逐像素相同） */
  .panel.danger-zone { box-shadow: 0 0 0 1px rgba(122, 58, 52, .96), 0 0 0 2px rgba(196, 84, 84, .38), 0 18px 40px #0008; }
  .danger-btn {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 10px 18px;
    background: linear-gradient(180deg, #2b1a1a, #1a1012);
    border: 1px solid #c45454;
    border-radius: 4px;
    color: #ffd9d2;
    font: 600 13px var(--body);
  }
  .danger-btn:hover:not(:disabled) { background: linear-gradient(180deg, #3a2020, #221416); border-color: #e07070; }
  .danger-btn [data-icon] { width: 16px; height: 16px; color: #e7a79c; }
  .danger-btn.armed { border-width: 2px; color: #fff; background: linear-gradient(180deg, #5a2422, #33161a); }
  .warn-line {
    display: flex; gap: 8px; align-items: flex-start;
    padding: 9px 12px;
    background: rgba(122, 58, 52, .18);
    border-left: 3px solid #c45454;
    border-radius: 3px;
    font: 12px var(--body); line-height: 1.6; color: #e7c3bc;
  }

  /* S-2/S-3：导入前预览 + 留在页面上的结果卡 */
  .import-preview, .settings-result {
    display: flex; flex-direction: column; gap: 8px;
    padding: 12px 14px;
    background: linear-gradient(#20202c, #16161f);
    border: 1px solid rgba(186, 164, 139, .18);
    border-radius: 6px;
    font: 12px var(--body); color: #c4b6a3;
  }
  .import-preview .cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .import-preview .cmp > div { display: flex; flex-direction: column; gap: 4px; }
  .import-preview .cmp small { letter-spacing: 2px; color: #91887a; font-size: 10px; }
  .import-preview .cmp b { font: 13px var(--body); color: #f2ead8; }
  .import-preview .acts { display: flex; gap: 10px; justify-content: flex-end; }
  .settings-result.ok { border-color: #4f7d5f; color: #bfe3cd; }
  .settings-result.bad { border-color: #c45454; color: #f0c9c2; }
  .settings-result b { color: #f2ead8; }

  .settings-screen .check-row { display: flex; align-items: center; gap: 10px; font: 13px var(--body); color: #c4b6a3; }
  /* 原生白色方块不属于暗金体系（S-6）：换成暗底金框自绘勾选 */
  .settings-screen .check-row input[type="checkbox"] {
    appearance: none;
    width: 18px; height: 18px;
    background: rgba(8, 8, 14, .82);
    border: 1px solid #67563e;
    border-radius: 3px;
    display: grid; place-items: center;
    cursor: pointer;
  }
  .settings-screen .check-row input[type="checkbox"]:checked { border-color: #e1c891; }
  .settings-screen .check-row input[type="checkbox"]:checked:after {
    content: "";
    width: 9px; height: 5px;
    border-left: 2px solid #f4e2b4;
    border-bottom: 2px solid #f4e2b4;
    transform: rotate(-45deg) translateY(-1px);
  }
  .settings-screen .check-row input[type="checkbox"]:focus-visible { outline: none; box-shadow: 0 0 0 2px #e8cc86; }
  .settings-screen .dev-tag {
    padding: 1px 7px 2px; border: 1px solid #67563e; border-radius: 999px;
    font: 10px var(--body); letter-spacing: 1px; color: #91887a;
  }

  /* UX phase B: commercial layout and native responsive stage. */
  .settings-screen {
    --settings-edge: rgba(196, 166, 105, .54);
    --settings-rule: rgba(196, 166, 105, .18);
    padding: 12px 36px 16px;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-gutter: stable;
    background:
      radial-gradient(circle at 18% 8%, rgba(109, 86, 51, .12), transparent 32%),
      radial-gradient(circle at 82% 72%, rgba(60, 76, 91, .12), transparent 35%),
      #0b0c13;
  }
  .settings-screen .settings-shell { width: min(1180px, 100%); margin: 0 auto; }
  .settings-screen .settings-page-head {
    min-height: 54px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
    padding: 3px 3px 10px;
    border-bottom: 1px solid var(--settings-rule);
  }
  .settings-screen .settings-page-head h1 {
    margin: 0;
    color: #f0d9a4;
    font: 29px var(--display);
    letter-spacing: 2px;
  }
  .settings-screen .settings-head-actions { display: flex; align-items: center; gap: 12px; }
  .settings-screen .settings-local-state {
    min-height: 42px;
    display: grid;
    grid-template-columns: 28px auto;
    align-items: center;
    gap: 9px;
    padding: 5px 12px 5px 9px;
    color: #aeb8af;
    border: 1px solid rgba(90, 130, 104, .42);
    background: rgba(38, 72, 52, .18);
  }
  .settings-screen .settings-local-state [data-icon] { grid-row: 1 / 3; width: 28px; height: 28px; color: #82bf91; }
  .settings-screen .settings-local-state b { font-size: 12px; color: #d7e6d9; }
  .settings-screen .settings-local-state small { color: #829087; font: 9px var(--body); letter-spacing: 0; }
  .settings-screen #settingsBack { min-height: 42px; white-space: nowrap; }
  .settings-screen .settings-layout {
    display: grid;
    grid-template-columns: minmax(420px, .9fr) minmax(0, 1.2fr);
    grid-template-areas:
      "preferences save"
      "danger save";
    align-items: start;
    gap: 16px;
    margin-top: 12px;
  }
  .settings-screen .settings-save-panel { grid-area: save; align-self: start; }
  .settings-screen .settings-preferences-panel { grid-area: preferences; }
  .settings-screen .danger-zone { grid-area: danger; }
  .settings-screen .settings-side { display: grid; gap: 14px; }
  .settings-screen .panel {
    height: auto;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: 6px;
    background: linear-gradient(155deg, rgba(22, 22, 31, .98), rgba(11, 12, 19, .98));
    box-shadow: 0 0 0 1px #161319, 0 0 0 2px var(--settings-edge), 0 14px 32px #0007;
  }
  .settings-screen .panel:after { inset: 6px; border-radius: 3px; opacity: .38; }
  .settings-screen .panel > .panel-head {
    min-height: 54px;
    align-items: center;
    margin: 0;
    padding: 15px 20px 13px;
    border-bottom: 1px solid var(--settings-rule);
    background: linear-gradient(90deg, rgba(216, 194, 144, .055), transparent 68%);
  }
  .settings-screen .panel-head h2,
  .settings-screen .settings-subhead h2 {
    margin: 0;
    color: #ead5a5;
    font: 21px var(--display);
    letter-spacing: 1px;
  }
  .settings-screen .panel-inner { height: auto; flex: 1 1 auto; min-height: 0; overflow: visible; }
  .settings-screen .settings-body { display: flex; flex-direction: column; gap: 13px; padding: 16px 20px 20px; }
  .settings-screen .settings-note { color: #bdb4a7; font: 13px var(--body); line-height: 1.65; }
  .settings-screen .settings-note b { color: #eee0c1; }
  .settings-screen .settings-row { display: flex; gap: 9px; flex-wrap: wrap; }
  .settings-screen .settings-row button,
  .settings-screen .import-preview button {
    min-height: 41px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 8px 14px;
    border-radius: 3px;
    letter-spacing: 0;
  }
  .settings-screen #downloadBtn {
    color: #f1dfb4;
    border-color: #9d8150;
    background: linear-gradient(180deg, #332a27, #201b22);
  }
  .settings-screen .settings-subhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 4px;
    padding: 15px 0 0;
    border-top: 1px solid var(--settings-rule);
  }
  .settings-screen textarea#saveText {
    width: 100%; min-height: 132px;
    padding: 12px 13px;
    resize: vertical;
    color: #c9c3b8;
    background: rgba(5, 6, 10, .8);
    border: 1px solid #5f513c;
    border-radius: 3px;
    font: 11px/1.55 ui-monospace, Consolas, monospace;
    outline: none;
  }
  .settings-screen textarea#saveText:focus { border-color: #c1a46a; box-shadow: 0 0 0 2px rgba(193, 164, 106, .16); }
  .settings-screen textarea#saveText::placeholder { color: #777268; }

  .settings-screen .settings-side .panel > .panel-head { min-height: 50px; padding-block: 11px; }
  .settings-screen .settings-side .settings-body { padding-block: 15px 17px; }
  .settings-screen .check-row {
    min-height: 54px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    color: #c4b9aa;
    font: 13px var(--body);
    cursor: pointer;
  }
  .settings-screen .setting-copy { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .settings-screen .setting-copy b { color: #eee2ca; font-size: 14px; font-weight: 600; }
  .settings-screen .setting-copy small { color: #9b958c; font: 11px/1.5 var(--body); letter-spacing: 0; }
  .settings-screen .setting-title-row { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; }

  .settings-screen .check-row input[type="checkbox"] {
    appearance: none;
    position: relative;
    flex: 0 0 42px;
    width: 42px; height: 24px;
    margin: 0;
    border: 1px solid #665b4c;
    border-radius: 999px;
    background: #171721;
    cursor: pointer;
    transition: border-color .16s, background .16s;
  }
  .settings-screen .check-row input[type="checkbox"]:after {
    content: "";
    position: absolute;
    top: 3px; left: 3px;
    width: 16px; height: 16px;
    border: 0;
    border-radius: 50%;
    background: #8d887e;
    box-shadow: 0 1px 3px #0009;
    transform: none;
    transition: transform .16s, background .16s;
  }
  .settings-screen .check-row input[type="checkbox"]:checked { border-color: #77a981; background: #254432; }
  .settings-screen .check-row input[type="checkbox"]:checked:after {
    width: 16px; height: 16px;
    border: 0;
    background: #d6ebda;
    transform: translateX(18px);
  }
  .settings-screen .check-row input[type="checkbox"]:focus-visible { outline: 2px solid #a6dff9; outline-offset: 3px; box-shadow: none; }
  .settings-screen .dev-tag {
    min-height: 20px;
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    color: #a39b8d;
    border: 1px solid #67563e;
    border-radius: 999px;
    font: 10px var(--body);
    letter-spacing: 0;
  }

  .settings-screen .settings-preferences-panel .settings-body {
    gap: 0;
    padding: 7px 20px 9px;
  }
  .settings-screen .settings-preferences-panel .check-row,
  .settings-screen .preference-row {
    min-height: 47px;
    border-bottom: 1px solid rgba(196, 166, 105, .12);
  }
  .settings-screen .settings-preferences-panel > .settings-body > .check-row:last-child,
  .settings-screen .preference-row:last-child { border-bottom: 0; }
  .settings-screen .preference-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    color: #c4b9aa;
    font: 13px var(--body);
  }
  .settings-screen .volume-row {
    min-height: 60px;
    display: grid;
    grid-template-columns: minmax(110px, .8fr) minmax(130px, 1fr) 45px;
    gap: 10px;
  }
  .settings-screen .volume-row output {
    color: #ebd49f;
    font: 600 12px var(--body);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .settings-screen input[type="range"] {
    appearance: none;
    width: 100%;
    height: 24px;
    margin: 0;
    background: transparent;
    cursor: pointer;
  }
  .settings-screen input[type="range"]::-webkit-slider-runnable-track {
    height: 5px;
    border: 1px solid #5e574d;
    border-radius: 2px;
    background: linear-gradient(90deg, #8e7544, #c8ad70);
  }
  .settings-screen input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    width: 17px;
    height: 17px;
    margin-top: -7px;
    border: 2px solid #e8d5a5;
    border-radius: 50%;
    background: #342c2d;
    box-shadow: 0 2px 5px #000a;
  }
  .settings-screen input[type="range"]::-moz-range-track {
    height: 5px;
    border: 1px solid #5e574d;
    border-radius: 2px;
    background: #a58b55;
  }
  .settings-screen input[type="range"]::-moz-range-thumb {
    width: 15px;
    height: 15px;
    border: 2px solid #e8d5a5;
    border-radius: 50%;
    background: #342c2d;
  }
  .settings-screen input[type="range"]:focus-visible { outline: 2px solid #a6dff9; outline-offset: 3px; }
  .settings-screen input[type="range"]:disabled { cursor: not-allowed; filter: grayscale(1); opacity: .42; }
  .settings-screen .language-select {
    min-width: 138px;
    height: 34px;
    padding: 0 28px 0 10px;
    color: #d8cdb9;
    border: 1px solid #665b4c;
    border-radius: 3px;
    background: #171721;
    font: 12px var(--body);
  }
  .settings-screen .language-select:disabled { opacity: 1; cursor: default; }
  .settings-screen .settings-dev-options { border-top: 1px solid rgba(196, 166, 105, .12); }
  .settings-screen .settings-dev-options summary {
    min-height: 39px;
    display: flex;
    align-items: center;
    color: #a99c86;
    font: 12px var(--body);
    cursor: pointer;
  }
  .settings-screen .settings-dev-options summary:hover { color: #e6d3a9; }
  .settings-screen .settings-dev-options summary:focus-visible { outline: 2px solid #a6dff9; outline-offset: -2px; }
  .settings-screen .settings-dev-options .check-row { min-height: 50px; }
  .settings-screen .settings-dev-options .check-row:last-child { border-bottom: 0; }

  .settings-screen .panel.danger-zone {
    background: linear-gradient(155deg, rgba(34, 20, 23, .98), rgba(15, 11, 16, .98));
    box-shadow: 0 0 0 1px rgba(71, 27, 27, .96), 0 0 0 2px rgba(190, 79, 72, .58), 0 16px 36px #0008;
  }
  .settings-screen .panel.danger-zone > .panel-head { border-bottom-color: rgba(196, 84, 84, .22); background: rgba(122, 58, 52, .08); }
  .settings-screen .panel.danger-zone .panel-head h2 { color: #f1c6be; }
  .settings-screen .danger-btn {
    min-height: 41px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 9px 14px;
    color: #f4d0ca;
    background: linear-gradient(180deg, #321d1e, #211316);
    border: 1px solid #b65350;
    border-radius: 3px;
    font: 600 12px var(--body);
    line-height: 1.35;
    text-align: center;
  }
  .settings-screen .danger-btn:hover:not(:disabled) { background: linear-gradient(180deg, #452422, #2b171a); border-color: #dc716a; }
  .settings-screen .danger-btn [data-icon] { width: 16px; height: 16px; color: #e7a79c; }
  .settings-screen .danger-btn.armed { border-width: 2px; color: #fff; background: linear-gradient(180deg, #682a26, #3b181c); }
  .settings-screen .danger-zone .settings-row { display: grid; grid-template-columns: 1fr; }
  .settings-screen .danger-zone .settings-body { gap: 9px; padding: 12px 20px 14px; }
  .settings-screen .danger-zone .settings-row { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .settings-screen .danger-zone .settings-note { font-size: 12px; line-height: 1.5; }
  .settings-screen .warn-line {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 10px 12px;
    color: #e5c2bc;
    background: rgba(122, 58, 52, .17);
    border-left: 3px solid #c45454;
    border-radius: 2px;
    font: 11px/1.6 var(--body);
  }
  .settings-screen .danger-zone .warn-line { padding: 9px 10px; font-size: 12px; line-height: 1.55; }
  .settings-screen .warn-line [data-icon] { width: 17px; height: 17px; margin-top: 1px; color: #d99086; }

  .settings-screen .import-preview,
  .settings-screen .settings-result {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 13px 14px;
    color: #c4b6a3;
    background: #12131b;
    border: 1px solid rgba(186, 164, 139, .24);
    border-radius: 4px;
    font: 11px/1.55 var(--body);
  }
  .settings-screen .import-preview .cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
  .settings-screen .import-preview .cmp > div { min-width: 0; display: flex; flex-direction: column; gap: 5px; padding: 3px 14px 3px 0; }
  .settings-screen .import-preview .cmp > div + div { padding: 3px 0 3px 14px; border-left: 1px solid var(--settings-rule); }
  .settings-screen .import-preview .cmp small { color: #938878; font-size: 9px; letter-spacing: 1px; }
  .settings-screen .import-preview .cmp b { color: #f0e4ce; font: 12px/1.55 var(--body); overflow-wrap: anywhere; }
  .settings-screen .import-preview .acts { display: flex; justify-content: flex-end; gap: 9px; }
  .settings-screen .settings-result.ok { border-color: #4f7d5f; color: #bfe3cd; background: rgba(36, 72, 48, .2); }
  .settings-screen .settings-result.bad { border-color: #b9504e; color: #f0c9c2; background: rgba(90, 35, 37, .2); }
  .settings-screen .settings-result b { color: #f2ead8; }

  @media (max-width: 1399px) {
    #stage.settings-responsive { width: 100vw !important; height: 100dvh !important; transform: none !important; }
    #stage.settings-responsive .topbar { height: 72px; gap: 12px; padding: 0 16px; }
    #stage.settings-responsive .player { width: 190px; gap: 10px; }
    #stage.settings-responsive .player > img { width: 44px; height: 44px; }
    #stage.settings-responsive .player strong { margin-bottom: 2px; font-size: 16px; }
    #stage.settings-responsive .player span { font-size: 9px; }
    #stage.settings-responsive .player span i { margin-left: 8px; }
    #stage.settings-responsive .player .xp { width: 118px; margin-top: 4px; }
    #stage.settings-responsive .top-title { display: none; }
    #stage.settings-responsive .wallet { gap: 7px; }
    #stage.settings-responsive .money { gap: 4px; padding: 2px; }
    #stage.settings-responsive .money > [data-icon] { width: 21px; height: 21px; }
    #stage.settings-responsive .money small { font-size: 8px; }
    #stage.settings-responsive .money b { font-size: 12px; }
    #stage.settings-responsive .orb { width: 32px; height: 32px; margin-left: 0; }
    #stage.settings-responsive .orb [data-icon] { width: 16px; height: 16px; }
    #stage.settings-responsive .bottom-bar { height: 62px; padding: 0 8px; }
    #stage.settings-responsive .world-mark,
    #stage.settings-responsive .bottom-hint { display: none; }
    #stage.settings-responsive .bottom-bar nav { position: static; width: 100%; transform: none; gap: 0; }
    #stage.settings-responsive .bottom-bar nav button { flex: 1; width: auto; min-width: 0; gap: 6px; font-size: 13px; letter-spacing: 0; }
    #stage.settings-responsive .bottom-bar nav button > [data-icon] { width: 21px; height: 21px; }
    #stage.settings-responsive .settings-screen { inset: 72px 0 62px; padding: 15px 18px 28px; }
    #stage.settings-responsive .settings-layout {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: "preferences" "save" "danger";
    }
    #stage.settings-responsive .settings-side { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    #stage.settings-responsive .danger-zone { grid-column: 1 / -1; }
  }

  @media (max-width: 640px) {
    #stage.settings-responsive .topbar { height: 59px; padding: 0 9px; gap: 6px; }
    #stage.settings-responsive .player { flex: 1 1 0; min-width: 0; width: auto; gap: 7px; }
    #stage.settings-responsive .player > img { width: 34px; height: 34px; }
    #stage.settings-responsive .player strong { overflow: hidden; max-width: 92px; margin: 0; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
    #stage.settings-responsive .player span,
    #stage.settings-responsive .player .xp { display: none; }
    #stage.settings-responsive .wallet { flex: none; gap: 1px; }
    #stage.settings-responsive .money:not([data-currency="gold"]) { display: none; }
    #stage.settings-responsive .money small { display: none; }
    #stage.settings-responsive .money b { font-size: 10px; }
    #stage.settings-responsive .money > [data-icon] { width: 17px; height: 17px; }
    #stage.settings-responsive .orb { width: 29px; height: 29px; margin-left: 3px; }
    #stage.settings-responsive .bottom-bar { height: 57px; padding: 0 3px; }
    #stage.settings-responsive .bottom-bar nav button { flex-direction: column; gap: 1px; font-size: 10px; }
    #stage.settings-responsive .bottom-bar nav button > [data-icon] { width: 19px; height: 19px; }
    #stage.settings-responsive .settings-screen { inset: 59px 0 57px; padding: 10px 10px 24px; scrollbar-gutter: auto; }
    #stage.settings-responsive .settings-page-head { min-height: 54px; gap: 10px; padding: 2px 1px 10px; }
    #stage.settings-responsive .settings-page-head h1 { font-size: 24px; letter-spacing: 1px; }
    #stage.settings-responsive .settings-local-state { display: none; }
    #stage.settings-responsive #settingsBack { min-height: 38px; padding: 7px 10px; font-size: 11px; }
    #stage.settings-responsive .settings-layout { gap: 12px; margin-top: 12px; }
    #stage.settings-responsive .settings-side { grid-template-columns: minmax(0, 1fr); gap: 12px; }
    #stage.settings-responsive .danger-zone { grid-column: auto; }
    #stage.settings-responsive .panel > .panel-head { min-height: 50px; padding: 11px 15px; }
    #stage.settings-responsive .panel-head h2,
    #stage.settings-responsive .settings-subhead h2 { font-size: 19px; }
    #stage.settings-responsive .settings-body { gap: 12px; padding: 14px 15px 16px; }
    #stage.settings-responsive .settings-note { font-size: 12px; line-height: 1.65; }
    #stage.settings-responsive .settings-row { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
    #stage.settings-responsive .settings-row button { width: 100%; min-width: 0; min-height: 43px; padding: 7px 9px; font-size: 11px; white-space: normal; }
    #stage.settings-responsive #downloadBtn,
    #stage.settings-responsive #pickFileBtn,
    #stage.settings-responsive #validateBtn { grid-column: 1 / -1; }
    #stage.settings-responsive textarea#saveText { min-height: 126px; font-size: 10px; }
    #stage.settings-responsive .settings-subhead { padding-top: 13px; }
    #stage.settings-responsive .warn-line { padding: 9px 10px; font-size: 10px; }
    #stage.settings-responsive .check-row { min-height: 51px; gap: 12px; }
    #stage.settings-responsive .settings-preferences-panel .settings-body { padding-inline: 15px; }
    #stage.settings-responsive .volume-row {
      min-height: 66px;
      grid-template-columns: minmax(94px, .8fr) minmax(92px, 1fr) 41px;
      gap: 8px;
    }
    #stage.settings-responsive .setting-copy b { font-size: 13px; }
    #stage.settings-responsive .setting-copy small { font-size: 11px; }
    #stage.settings-responsive .import-preview,
    #stage.settings-responsive .settings-result { padding: 11px; }
    #stage.settings-responsive .import-preview .cmp { grid-template-columns: minmax(0, 1fr); gap: 9px; }
    #stage.settings-responsive .import-preview .cmp > div,
    #stage.settings-responsive .import-preview .cmp > div + div { padding: 0; border-left: 0; }
    #stage.settings-responsive .import-preview .cmp > div + div { padding-top: 9px; border-top: 1px solid var(--settings-rule); }
    #stage.settings-responsive .import-preview .acts { display: grid; grid-template-columns: 82px minmax(0, 1fr); }
    #stage.settings-responsive .import-preview .acts button { width: 100%; min-width: 0; white-space: normal; }
    #stage.settings-responsive .danger-zone .settings-row { grid-template-columns: minmax(0, 1fr); }
    #stage.settings-responsive .toast { bottom: 68px; max-width: calc(100% - 24px); }
  }
`;

/** 存档必需节：少任何一节都不是本游戏的存档（S-2 的判据） */
const REQUIRED_SECTIONS = ['currencies', 'hero', 'collection', 'kingdoms', 'teams'] as const;

interface SaveDigest {
  level: number;
  gold: number;
  gems: number;
  collection: number;
  kingdoms: number;
  version: number | null;
}

function digestOf(save: MetaSave): SaveDigest {
  return {
    level: save.hero?.level ?? 0,
    gold: save.currencies?.gold ?? 0,
    gems: save.currencies?.gems ?? 0,
    collection: Object.keys(save.collection ?? {}).length,
    kingdoms: Object.keys(save.kingdoms ?? {}).length,
    version: typeof save.version === 'number' ? save.version : null,
  };
}

const fmt = (n: number): string => n.toLocaleString('en-US');
const digestLine = (d: SaveDigest): string =>
  `Lv.${d.level} · 收藏 ${fmt(d.collection)} 张 · 黄金 ${fmt(d.gold)} · 宝石 ${fmt(d.gems)} · 王国 ${d.kingdoms} 个`;

export class SettingsScreen implements Screen {
  private ctx!: ShellCtx;
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
  /** 跨 refresh 存活的结果卡（S-3：成功反馈不能靠被整屏重建冲掉的 toast） */
  private notice: { kind: 'ok' | 'bad'; text: string } | null = null;
  /** 待导入的已校验文本 + 摘要（S-2：确认前先看清覆盖成什么） */
  private pending: { text: string; digest: SaveDigest } | null = null;
  /** 重置按钮的"再点一次确认"状态（S-5：破坏性操作要费力） */
  private armed: 'demo' | 'new' | null = null;

  html(ctx: ShellCtx): string {
    const cur = digestOf(ctx.save());
    const preferences = getPlayerPreferences();
    const soundVolume = Math.round(preferences.soundEffectsVolume * 100);
    const notice = this.notice
      ? `<div class="settings-result ${this.notice.kind}" id="settingsResult">${this.notice.text}</div>`
      : '';
    return `
      <style id="settingsScreenCss">${SETTINGS_CSS}</style>
      ${topbarHtml()}
      <main class="screen settings-screen">
        <div class="settings-shell">
          <header class="settings-page-head">
            <div><h1>偏好与存档</h1></div>
            <div class="settings-head-actions">
              <span class="settings-local-state"><span data-icon="check"></span><b>本机自动保存</b><small>当前进度已启用</small></span>
              <button class="secondary" id="settingsBack" type="button"><span data-icon="arrow"></span>返回地图</button>
            </div>
          </header>

          <div class="settings-layout">
            <section class="panel settings-preferences-panel">
              <div class="panel-head"><div><h2>游戏设置</h2></div></div>
              <div class="panel-inner settings-body">
                <label class="check-row">
                  <span class="setting-copy"><b>音效</b></span>
                  <input type="checkbox" id="soundEffectsEnabled" aria-label="启用音效"${preferences.soundEffectsEnabled ? ' checked' : ''}>
                </label>
                <div class="preference-row volume-row">
                  <label class="setting-copy" for="soundEffectsVolume"><b>音效音量</b></label>
                  <input id="soundEffectsVolume" type="range" min="0" max="100" step="5" value="${soundVolume}" aria-label="音效音量"${preferences.soundEffectsEnabled ? '' : ' disabled'}>
                  <output id="soundEffectsVolumeValue" for="soundEffectsVolume">${soundVolume}%</output>
                </div>
                <label class="check-row">
                  <span class="setting-copy"><b>减弱动效</b></span>
                  <input type="checkbox" id="reducedMotion" aria-label="减弱动效"${preferences.reducedMotion ? ' checked' : ''}>
                </label>
                <div class="preference-row">
                  <span class="setting-copy"><b>界面语言</b></span>
                  <select class="language-select" aria-label="界面语言" disabled><option>简体中文</option></select>
                </div>
                <label class="check-row">
                  <span class="setting-copy"><b>跳过技能释放确认</b><small>满法力角色将直接选色、选目标或施放</small></span>
                  <input type="checkbox" id="skipCastConfirm" aria-label="跳过技能释放确认"${skipCastConfirm() ? ' checked' : ''}>
                </label>
                <details class="settings-dev-options">
                  <summary>开发者选项</summary>
                  <label class="check-row">
                    <span class="setting-copy"><span class="setting-title-row"><b>战斗调试钩子</b><span class="dev-tag">开发者选项</span></span><small>只记录调试输出，不改变玩法数值</small></span>
                    <input type="checkbox" id="battleDebug" aria-label="战斗调试钩子">
                  </label>
                </details>
              </div>
            </section>

            <section class="panel settings-save-panel">
              <div class="panel-head"><div><h2>存档管理</h2></div></div>
              <div class="panel-inner settings-body">
                <p class="settings-note">
                  进度保存在这台设备的浏览器里（当前：<b>${digestLine(cur)}</b>）。<br>
                  清理浏览器数据会一并清掉存档；换设备或重装前，请先导出一份。
                </p>
                ${notice}
                <div class="settings-row">
                  <button class="secondary" id="downloadBtn" type="button"><span data-icon="chevrons"></span>导出存档文件（.json）</button>
                  <button class="secondary" id="copyBtn" type="button"><span data-icon="book"></span>复制存档文本</button>
                  <button class="secondary" id="exportBtn" type="button">显示在文本框</button>
                </div>
                <textarea id="saveText" spellcheck="false" placeholder="导出的存档 JSON 会显示在这里；也可粘贴存档文本，再读取并校验。"></textarea>

                <div class="settings-subhead"><div><h2>导入存档</h2></div></div>
                <div class="warn-line"><span data-icon="lock"></span><span>导入会<b>覆盖现在的进度</b>且不可撤销。先读取并校验，确认预览无误再覆盖。</span></div>
                <div class="settings-row">
                  <button class="secondary" id="pickFileBtn" type="button"><span data-icon="chest"></span>选择存档文件…</button>
                  <button class="secondary" id="validateBtn" type="button">读取并校验文本框内容</button>
                  <input type="file" id="saveFile" accept="application/json,.json" hidden>
                </div>
                <div id="importPreview"></div>
              </div>
            </section>

            <section class="panel danger-zone">
              <div class="panel-head"><div><h2>危险操作</h2></div></div>
              <div class="panel-inner settings-body">
                <div class="warn-line">
                  <span data-icon="lock"></span>
                  <span>重置会<b>立刻删除当前全部进度</b>，不可撤销。需要留档，请先导出。</span>
                </div>
                <div class="settings-row">
                  <button class="danger-btn" id="resetNew" type="button"><span data-icon="skull"></span><span id="resetNewLabel">重置为全新档</span></button>
                  <button class="danger-btn" id="resetDemo" type="button"><span data-icon="skull"></span><span id="resetDemoLabel">重置为演示档</span></button>
                </div>
                <p class="settings-note">首次点击只会进入待确认状态，5 秒后自动取消。</p>
              </div>
            </section>
          </div>
        </div>
      </main>
      ${bottomNavHtml('', '进度保存在本机浏览器')}
      ${toastHtml()}`;
  }

  mount(ctx: ShellCtx, root: HTMLElement): void {
    this.ctx = ctx;
    root.classList.add('settings-responsive');
    this.notice = null; // 结果卡只展示一轮（已渲染进 html）
    this.pending = null;
    this.armed = null;
    mountIcons(document);
    this.syncPlayerPreferenceControls();
    ($('#skipCastConfirm') as HTMLInputElement).checked = skipCastConfirm();
    ($('#battleDebug') as HTMLInputElement).checked = ctx.save().settings.battleDebug;

    this.bind('#exportBtn', 'click', () => {
      ($('#saveText') as HTMLTextAreaElement).value = this.prettyJson();
      toast('存档已显示在文本框（缩进格式，便于核对）。');
    });
    this.bind('#downloadBtn', 'click', () => this.download());
    this.bind('#copyBtn', 'click', () => {
      const text = ctx.gateway.exportSaveJson();
      void navigator.clipboard
        ?.writeText(text)
        .then(() => toast('已复制到剪贴板。'))
        .catch(() => {
          ($('#saveText') as HTMLTextAreaElement).value = this.prettyJson();
          toast('剪贴板不可用，已把存档显示在文本框，请手动复制。');
        });
    });
    this.bind('#validateBtn', 'click', () => this.validate(($('#saveText') as HTMLTextAreaElement).value));
    this.bind('#pickFileBtn', 'click', () => ($('#saveFile') as HTMLInputElement).click());
    this.bind('#saveFile', 'change', (e) => void this.readFile(e));
    this.bind('#soundEffectsEnabled', 'change', () => this.toggleSoundEffects());
    this.bind('#soundEffectsVolume', 'input', () => this.updateSoundEffectsVolume(false));
    this.bind('#soundEffectsVolume', 'change', () => this.updateSoundEffectsVolume(true));
    this.bind('#reducedMotion', 'change', () => this.toggleReducedMotion());
    this.bind('#skipCastConfirm', 'change', () => this.toggleCastConfirm());
    this.bind('#battleDebug', 'change', () => void this.toggleDebug());
    this.bind('#resetNew', 'click', () => void this.reset(false));
    this.bind('#resetDemo', 'click', () => void this.reset(true));
    this.bind('#settingsBack', 'click', () => ctx.navigate('#map'));
  }

  private prettyJson(): string {
    const raw = this.ctx.gateway.exportSaveJson();
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  }

  /** S-9：导出成文件（改前 9,261 字符压成一行塞进 196px 文本框，既看不全也存不下来） */
  private download(): void {
    const text = this.prettyJson();
    const stamp = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    const name = `chronicles-save-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}.json`;
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    this.showResult('ok', `已导出存档文件 <b>${name}</b>。把它保存好，导入时选这个文件即可。`);
  }

  private async readFile(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const text = await file.text();
    ($('#saveText') as HTMLTextAreaElement).value = text.length > 200_000 ? '（文件过大，已省略预览）' : text;
    this.validate(text);
    input.value = '';
  }

  /**
   * S-2：导入前校验 + 预览。
   *
   * 改前的行为：粘 `{"hello":"world"}` 点导入 → 整档被替换成全新档并立即写盘，
   * 无确认、无备份、无提示、无报错（根因是 `save.ts` 把"没有 version 字段"当成 -1
   * 从而绕过版本校验，随后 migrateSave 把每一节补成默认值 = 一份崭新存档）。
   * 这里在屏层先做必需节校验，把"合法 JSON 但不是存档"挡在覆盖之前。
   */
  private validate(raw: string): void {
    const text = raw.trim();
    const preview = $('#importPreview');
    this.pending = null;
    if (!text) {
      preview.innerHTML = '';
      toast('先选择存档文件，或把存档 JSON 粘进文本框。');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      preview.innerHTML = '';
      this.showResult('bad', '这不是合法的 JSON，没有任何改动发生。');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      preview.innerHTML = '';
      this.showResult('bad', '这不是一份存档（顶层不是对象），没有任何改动发生。');
      return;
    }
    const obj = parsed as Record<string, unknown>;
    const missing = REQUIRED_SECTIONS.filter((k) => !obj[k] || typeof obj[k] !== 'object');
    if (missing.length) {
      preview.innerHTML = '';
      this.showResult(
        'bad',
        `这是合法 JSON，但不是本游戏的存档：缺少 <b>${missing.join(' / ')}</b> 等必需内容。<b>当前进度未被改动。</b>`,
      );
      return;
    }
    const incoming = digestOf(obj as unknown as MetaSave);
    const current = digestOf(this.ctx.save());
    this.pending = { text, digest: incoming };
    preview.innerHTML = `
      <div class="import-preview">
        <div class="cmp">
          <div><small>已读取（将导入）</small><b>${digestLine(incoming)}</b><span>存档结构版本 ${incoming.version ?? '未标注'}</span></div>
          <div><small>将被覆盖（现在的进度）</small><b>${digestLine(current)}</b><span>覆盖后无法找回</span></div>
        </div>
        <div class="warn-line"><span data-icon="lock"></span><span>确认前建议先「导出存档文件」留一份当前进度。</span></div>
        <div class="acts">
          <button class="cancel" id="importCancel" type="button">取消</button>
          <button class="danger-btn" id="importConfirm" type="button"><span data-icon="chevrons"></span><span id="importConfirmLabel">确认覆盖当前进度</span></button>
        </div>
      </div>`;
    mountIcons(preview);
    this.bind('#importCancel', 'click', () => {
      this.pending = null;
      preview.innerHTML = '';
      toast('已取消导入，当前进度未改动。');
    });
    let armedImport = false;
    this.bind('#importConfirm', 'click', () => {
      if (!armedImport) {
        armedImport = true;
        $('#importConfirm').classList.add('armed');
        $('#importConfirmLabel').textContent = '再点一次以覆盖';
        setTimeout(() => {
          armedImport = false;
          const btn = $('#importConfirm');
          if (btn) {
            btn.classList.remove('armed');
            $('#importConfirmLabel').textContent = '确认覆盖当前进度';
          }
        }, 5000);
        return;
      }
      void this.doImport();
    });
  }

  private async doImport(): Promise<void> {
    if (!this.pending) return;
    const { text, digest } = this.pending;
    try {
      await this.ctx.gateway.importSaveJson(text);
      // S-3：反馈放在 refresh **之后**（改前 toast 被整屏重建冲掉，成功比失败更让人困惑）
      this.notice = { kind: 'ok', text: `<b>导入成功</b>：当前进度已是 ${digestLine(digest)}。` };
      this.pending = null;
      this.ctx.refresh();
    } catch (error: unknown) {
      this.showResult('bad', '导入失败：' + (error instanceof Error ? error.message : String(error)));
    }
  }

  private async toggleDebug(): Promise<void> {
    const on = ($('#battleDebug') as HTMLInputElement).checked;
    await this.ctx.gateway.setBattleDebug(on);
    toast(on ? '战斗调试已开启（开发者选项）。' : '战斗调试已关闭。');
  }

  private syncPlayerPreferenceControls(): void {
    const preferences = getPlayerPreferences();
    const enabled = $('#soundEffectsEnabled') as HTMLInputElement | null;
    const volume = $('#soundEffectsVolume') as HTMLInputElement | null;
    const volumeValue = $('#soundEffectsVolumeValue') as HTMLOutputElement | null;
    const motion = $('#reducedMotion') as HTMLInputElement | null;
    const percent = Math.round(preferences.soundEffectsVolume * 100);
    if (enabled) enabled.checked = preferences.soundEffectsEnabled;
    if (volume) {
      volume.value = String(percent);
      volume.disabled = !preferences.soundEffectsEnabled;
    }
    if (volumeValue) volumeValue.value = `${percent}%`;
    if (motion) motion.checked = preferences.reducedMotion;
  }

  private toggleSoundEffects(): void {
    const enabled = ($('#soundEffectsEnabled') as HTMLInputElement).checked;
    setPlayerPreferences({ soundEffectsEnabled: enabled });
    this.syncPlayerPreferenceControls();
    toast(enabled ? '音效已开启。' : '音效已关闭。');
  }

  private updateSoundEffectsVolume(announce: boolean): void {
    const input = $('#soundEffectsVolume') as HTMLInputElement;
    const percent = Math.min(100, Math.max(0, Number(input.value) || 0));
    setPlayerPreferences({ soundEffectsVolume: percent / 100 });
    const output = $('#soundEffectsVolumeValue') as HTMLOutputElement | null;
    if (output) output.value = `${percent}%`;
    if (announce) toast(`音效音量已设为 ${percent}%。`);
  }

  private toggleReducedMotion(): void {
    const reduced = ($('#reducedMotion') as HTMLInputElement).checked;
    setPlayerPreferences({ reducedMotion: reduced });
    toast(reduced ? '已减弱翻牌、转场与循环动画。' : '已恢复完整动效。');
  }

  private toggleCastConfirm(): void {
    const skip = ($('#skipCastConfirm') as HTMLInputElement).checked;
    setSkipCastConfirm(skip);
    toast(skip
      ? '之后所有战斗将跳过技能释放确认。'
      : '已恢复技能释放确认，之后所有战斗都会先询问。');
  }

  /** S-5：页内两段式确认，取代跳出舞台的原生 confirm()（两条文案只差两字、默认焦点在"确定"） */
  private async reset(demo: boolean): Promise<void> {
    const which: 'demo' | 'new' = demo ? 'demo' : 'new';
    const label = demo ? '演示档' : '全新档';
    const btn = $(demo ? '#resetDemo' : '#resetNew');
    const labelEl = $(demo ? '#resetDemoLabel' : '#resetNewLabel');
    if (this.armed !== which) {
      this.armed = which;
      // 另一个按钮的待确认状态一并清掉，避免两个都亮着
      for (const [id, text] of [['#resetDemoLabel', '重置为演示档'], ['#resetNewLabel', '重置为全新档']] as const) {
        const other = $(id);
        if (other && other !== labelEl) {
          other.textContent = text;
          other.parentElement?.classList.remove('armed');
        }
      }
      btn.classList.add('armed');
      labelEl.textContent = `再点一次：删除当前进度并重置为${label}`;
      setTimeout(() => {
        if (this.armed !== which) return;
        this.armed = null;
        const still = $(demo ? '#resetDemoLabel' : '#resetNewLabel');
        if (still) {
          still.textContent = demo ? '重置为演示档' : '重置为全新档';
          still.parentElement?.classList.remove('armed');
        }
      }, 5000);
      return;
    }
    this.armed = null;
    const snapshot = demo ? await this.ctx.gateway.resetToDemo() : await this.ctx.gateway.resetToNewGame();
    toast(snapshot.warning ? `已重置：${snapshot.warning}` : `已重置为${label}。`);
    this.ctx.navigate('#map');
  }

  private showResult(kind: 'ok' | 'bad', html: string): void {
    const el = $('#settingsResult');
    if (el) {
      el.className = `settings-result ${kind}`;
      el.innerHTML = html;
      return;
    }
    // 结果卡还没渲染过 → 插到存档面板正文开头
    const body = $('.settings-screen .settings-body');
    if (!body) {
      toast(html.replace(/<[^>]+>/g, ''));
      return;
    }
    const div = document.createElement('div');
    div.id = 'settingsResult';
    div.className = `settings-result ${kind}`;
    div.innerHTML = html;
    body.insertBefore(div, body.children[1] ?? null);
  }

  private on(target: EventTarget, type: string, fn: EventListenerOrEventListenerObject): void {
    target.addEventListener(type, fn);
    this.listeners.push([target, type, fn]);
  }

  private bind(selector: string, type: string, fn: EventListenerOrEventListenerObject): void {
    const el = $(selector);
    if (el) this.on(el, type, fn);
  }

  dispose(): void {
    document.getElementById('stage')?.classList.remove('settings-responsive');
    for (const [target, type, fn] of this.listeners.splice(0)) {
      target.removeEventListener(type, fn);
    }
  }
}
