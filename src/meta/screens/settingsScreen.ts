import { audioControlsHtml, bindAudioControls } from '../../preferences/audioControls';
/**
 * 设置屏（游戏设置 + 账号与存档 + 重置；本地后端额外显示开发者工具：修改器、导出/导入、演示档）。
 * 线上（remote）只保留玩家有意义的项：没有导出/导入、没有界面语言（只做了简体中文）。
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
import { setSkipCastConfirm, skipCastConfirm, autoBattleEnabled, setAutoBattleEnabled, backgroundRunEnabled, setBackgroundRunEnabled } from '../../render/battlePrefs';
import { allKingdoms } from '../data/kingdoms';
import { COMMUNITY_KINGDOM } from '../../data/communityTroops';
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
  /* ---------- 页面骨架 ---------- */
  .settings-screen {
    --s-edge: rgba(196, 166, 105, .5);
    --s-rule: rgba(196, 166, 105, .14);
    --s-text: #c9beac;
    --s-strong: #f0e4cb;
    --s-muted: #938b7e;
    --s-gold: #e6cf98;
    padding: 14px 36px 24px;
    overflow-x: hidden;
    overflow-y: auto;
    scrollbar-gutter: stable;
    background:
      radial-gradient(circle at 18% 8%, rgba(109, 86, 51, .12), transparent 32%),
      radial-gradient(circle at 82% 72%, rgba(60, 76, 91, .12), transparent 35%),
      #0b0c13;
  }
  .settings-screen .settings-shell { width: min(1120px, 100%); margin: 0 auto; }
  .settings-screen .settings-page-head {
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 4px 2px 12px;
    border-bottom: 1px solid var(--s-rule);
  }
  .settings-screen .settings-page-head h1 { margin: 0; color: #f0d9a4; font: 28px var(--display); letter-spacing: 3px; }

  .settings-screen .settings-layout {
    display: grid;
    grid-template-columns: minmax(0, 1.08fr) minmax(0, .92fr);
    align-items: start;
    gap: 18px;
    margin-top: 16px;
  }
  .settings-screen .settings-side { display: flex; flex-direction: column; gap: 18px; min-width: 0; }

  /* ---------- 面板 ---------- */
  .settings-screen .panel {
    height: auto;
    display: flex; flex-direction: column;
    overflow: hidden;
    border-radius: 6px;
    background: linear-gradient(155deg, rgba(22, 22, 31, .98), rgba(11, 12, 19, .98));
    box-shadow: 0 0 0 1px #161319, 0 0 0 2px var(--s-edge), 0 14px 32px #0007;
  }
  .settings-screen .panel:after { inset: 6px; border-radius: 3px; opacity: .32; }
  .settings-screen .panel > .panel-head {
    min-height: 52px;
    display: flex; align-items: center; justify-content: space-between; gap: 10px;
    margin: 0;
    padding: 12px 20px;
    border-bottom: 1px solid var(--s-rule);
    background: linear-gradient(90deg, rgba(216, 194, 144, .06), transparent 70%);
  }
  .settings-screen .panel-head h2 { margin: 0; color: #ead5a5; font: 20px var(--display); letter-spacing: 2px; }
  .settings-screen .panel-inner { height: auto; flex: 1 1 auto; min-height: 0; overflow: visible; }
  .settings-screen .settings-body { display: flex; flex-direction: column; gap: 14px; padding: 16px 20px 20px; }
  .settings-screen .settings-note { margin: 0; color: var(--s-muted); font: 12px/1.65 var(--body); }
  .settings-screen .settings-note b { color: var(--s-strong); }

  /* 设置分组：小标题 + 行列表 */
  .settings-screen .settings-preferences-panel .settings-body { gap: 0; padding: 4px 20px 12px; }
  .settings-screen .settings-group { display: flex; flex-direction: column; }
  .settings-screen .settings-group + .settings-group { margin-top: 6px; }
  .settings-screen .settings-group > h3 {
    margin: 0;
    padding: 14px 0 6px;
    color: var(--s-muted);
    font: 600 11px var(--body);
    letter-spacing: 3px;
  }
  .settings-screen .settings-group > :not(h3) { border-top: 1px solid var(--s-rule); }

  /* ---------- 行：文字左、控件右 ---------- */
  .settings-screen .check-row {
    min-height: 52px;
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 8px 0;
    color: var(--s-text);
    font: 13px var(--body);
    cursor: pointer;
  }
  .settings-screen .setting-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .settings-screen .setting-copy b { color: var(--s-strong); font-size: 14px; font-weight: 600; }
  .settings-screen .setting-copy small { color: var(--s-muted); font: 11px/1.5 var(--body); letter-spacing: 0; }

  /* 音量行：名称 | 滑条 | 数值 | 开关——开关与下方开关行对齐在同一列 */
  .settings-screen .settings-group .audio-channel {
    display: grid;
    grid-template-columns: 84px minmax(0, 1fr) 42px 42px;
    align-items: center;
    column-gap: 14px;
    row-gap: 2px;
    padding: 10px 0;
    border-bottom: 0;
  }
  .settings-screen .settings-group .audio-channel .audio-label { display: contents; }
  .settings-screen .settings-group .audio-channel .setting-copy { grid-column: 1; grid-row: 1; }
  .settings-screen .settings-group .audio-channel input[type=range] { grid-column: 2; grid-row: 1; }
  .settings-screen .settings-group .audio-channel output { grid-column: 3; grid-row: 1; }
  .settings-screen .settings-group .audio-channel .audio-label input[type=checkbox] { grid-column: 4; grid-row: 1; width: 42px !important; flex: none !important; }
  .settings-screen .settings-group .audio-channel small { grid-column: 1 / -1; grid-row: 2; opacity: 1; color: var(--s-muted); font: 11px/1.5 var(--body); }
  .settings-screen .settings-group .audio-channel output { color: var(--s-gold); font: 600 12px var(--body); text-align: right; font-variant-numeric: tabular-nums; }

  /* 开关 */
  .settings-screen input[type="checkbox"] {
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
  .settings-screen input[type="checkbox"]:after {
    content: "";
    position: absolute; top: 3px; left: 3px;
    width: 16px; height: 16px;
    border-radius: 50%;
    background: #8d887e;
    box-shadow: 0 1px 3px #0009;
    transition: transform .16s, background .16s;
  }
  .settings-screen input[type="checkbox"]:checked { border-color: #77a981; background: #254432; }
  .settings-screen input[type="checkbox"]:checked:after,
  .settings-screen .settings-group .audio-channel .audio-label input[type=checkbox]:checked:after { background: #d6ebda; transform: translateX(18px); }
  .settings-screen input[type="checkbox"]:focus-visible { outline: 2px solid #a6dff9; outline-offset: 3px; }

  /* 滑条 */
  .settings-screen input[type="range"] { appearance: none; width: 100%; min-width: 0; height: 24px; margin: 0; background: transparent; cursor: pointer; }
  .settings-screen input[type="range"]::-webkit-slider-runnable-track { height: 5px; border: 1px solid #5e574d; border-radius: 3px; background: linear-gradient(90deg, #8e7544, #c8ad70); }
  .settings-screen input[type="range"]::-webkit-slider-thumb {
    appearance: none; width: 17px; height: 17px; margin-top: -7px;
    border: 2px solid #e8d5a5; border-radius: 50%; background: #342c2d; box-shadow: 0 2px 5px #000a;
  }
  .settings-screen input[type="range"]::-moz-range-track { height: 5px; border: 1px solid #5e574d; border-radius: 3px; background: #a58b55; }
  .settings-screen input[type="range"]::-moz-range-thumb { width: 15px; height: 15px; border: 2px solid #e8d5a5; border-radius: 50%; background: #342c2d; }
  .settings-screen input[type="range"]:focus-visible { outline: 2px solid #a6dff9; outline-offset: 3px; }
  .settings-screen input[type="range"]:disabled { cursor: not-allowed; filter: grayscale(1); opacity: .4; }

  /* ---------- 按钮：一套尺寸，三种语气 ---------- */
  .settings-screen .s-btn {
    min-height: 40px;
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    padding: 0 16px;
    color: #ecdcb6;
    background: linear-gradient(180deg, #2a2420, #1b171b);
    border: 1px solid #7d6743;
    border-radius: 4px;
    font: 600 13px var(--body);
    letter-spacing: 1px;
    white-space: nowrap;
    cursor: pointer;
    transition: border-color .14s, color .14s, background .14s;
  }
  .settings-screen .s-btn:hover:not(:disabled) { color: #fff3d6; border-color: #c9a864; background: linear-gradient(180deg, #342b24, #211b1f); }
  .settings-screen .s-btn:focus-visible { outline: 2px solid #a6dff9; outline-offset: 2px; }
  .settings-screen .s-btn [data-icon] { width: 16px; height: 16px; color: currentColor; opacity: .85; }
  .settings-screen .s-btn.ghost { color: var(--s-text); background: transparent; border-color: rgba(196, 166, 105, .32); }
  .settings-screen .s-btn.ghost:hover:not(:disabled) { color: var(--s-strong); border-color: #b99a5e; background: rgba(196, 166, 105, .06); }
  .settings-screen .s-btn.danger-btn { color: #f4d0ca; background: linear-gradient(180deg, #321d1e, #211316); border-color: #9e4845; }
  .settings-screen .s-btn.danger-btn:hover:not(:disabled) { color: #fff; border-color: #dc716a; background: linear-gradient(180deg, #452422, #2b171a); }
  .settings-screen .s-btn.danger-btn.armed { color: #fff; border-color: #ef8a82; background: linear-gradient(180deg, #6a2a26, #3b181c); box-shadow: 0 0 0 2px rgba(239, 138, 130, .22); }
  .settings-screen .settings-row { display: flex; flex-wrap: wrap; gap: 10px; }

  /* ---------- 账号与存档 ---------- */
  .settings-screen .account-card {
    display: grid; grid-template-columns: 38px minmax(0, 1fr) auto; align-items: center; gap: 12px;
    padding: 12px 14px;
    border: 1px solid rgba(90, 130, 104, .4);
    border-radius: 5px;
    background: rgba(38, 72, 52, .16);
  }
  .settings-screen .account-card.local { border-color: rgba(196, 166, 105, .3); background: rgba(196, 166, 105, .05); }
  .settings-screen .account-card > [data-icon] { width: 30px; height: 30px; color: #82bf91; justify-self: center; }
  .settings-screen .account-card.local > [data-icon] { color: #c8ad70; }
  .settings-screen .account-card b { display: block; color: var(--s-strong); font: 600 14px var(--body); }
  .settings-screen .account-card small { display: block; margin-top: 2px; color: var(--s-muted); font: 11px/1.5 var(--body); }
  .settings-screen .save-stats { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin: 0; }
  .settings-screen .save-stats > div {
    min-width: 0;
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    padding: 9px 4px 8px;
    border: 1px solid var(--s-rule);
    border-radius: 4px;
    background: rgba(8, 8, 14, .5);
  }
  .settings-screen .save-stats dt { color: var(--s-muted); font: 11px var(--body); letter-spacing: 1px; }
  .settings-screen .save-stats dd { margin: 0; color: var(--s-gold); font: 600 15px var(--body); font-variant-numeric: tabular-nums; }

  /* ---------- 危险操作 ---------- */
  .settings-screen .panel.danger-zone {
    background: linear-gradient(155deg, rgba(32, 19, 22, .98), rgba(15, 11, 16, .98));
    box-shadow: 0 0 0 1px rgba(71, 27, 27, .96), 0 0 0 2px rgba(170, 72, 66, .55), 0 14px 32px #0008;
  }
  .settings-screen .panel.danger-zone > .panel-head { border-bottom-color: rgba(196, 84, 84, .2); background: rgba(122, 58, 52, .08); }
  .settings-screen .panel.danger-zone .panel-head h2 { color: #f1c6be; }
  .settings-screen .warn-line {
    display: flex; align-items: flex-start; gap: 9px;
    padding: 10px 12px;
    color: #e5c2bc;
    background: rgba(122, 58, 52, .16);
    border-left: 3px solid #c45454;
    border-radius: 2px;
    font: 12px/1.6 var(--body);
  }
  .settings-screen .warn-line [data-icon] { flex: none; width: 16px; height: 16px; margin-top: 2px; color: #d99086; }

  /* ---------- 开发者工具（仅本地） ---------- */
  .settings-screen .settings-dev {
    margin-top: 26px;
    padding-top: 14px;
    border-top: 1px dashed rgba(196, 166, 105, .24);
  }
  .settings-screen .settings-dev-head { display: flex; align-items: center; gap: 10px; margin: 0 2px 14px; }
  .settings-screen .settings-dev-head h2 { margin: 0; color: #b8ab92; font: 18px var(--display); letter-spacing: 2px; }
  .settings-screen .settings-dev-head .settings-note { margin-left: auto; }
  .settings-screen .dev-tag {
    display: inline-flex; align-items: center;
    padding: 2px 8px;
    color: #a39b8d;
    border: 1px solid #67563e;
    border-radius: 999px;
    font: 10px var(--body);
    letter-spacing: 1px;
  }
  .settings-screen .settings-dev-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 18px; }
  .settings-screen .settings-dev .panel { box-shadow: 0 0 0 1px #161319, 0 0 0 2px rgba(150, 140, 120, .32), 0 10px 24px #0006; }
  .settings-screen .settings-dev .panel-head h2 { font-size: 17px; color: #d6c7a6; }
  .settings-screen .settings-dev-options { border-top: 1px solid var(--s-rule); }
  .settings-screen .settings-dev-options summary {
    min-height: 40px; display: flex; align-items: center;
    color: var(--s-muted); font: 12px var(--body); letter-spacing: 1px; cursor: pointer;
  }
  .settings-screen .settings-dev-options summary:hover { color: #e6d3a9; }
  .settings-screen .settings-dev-options summary:focus-visible { outline: 2px solid #a6dff9; outline-offset: -2px; }
  .settings-screen .modifier-kingdom {
    min-width: 0; flex: 1 1 180px;
    height: 40px;
    padding: 0 28px 0 10px;
    color: #d8cdb9;
    border: 1px solid #665b4c;
    border-radius: 4px;
    background: #171721;
    font: 13px var(--body);
  }
  .settings-screen .settings-subhead { margin: 4px 0 0; padding-top: 14px; border-top: 1px solid var(--s-rule); color: #d6c7a6; font: 15px var(--display); letter-spacing: 2px; }
  .settings-screen textarea#saveText {
    width: 100%; min-height: 110px;
    padding: 10px 12px;
    resize: vertical;
    color: #c9c3b8;
    background: rgba(5, 6, 10, .8);
    border: 1px solid #4f4535;
    border-radius: 4px;
    font: 11px/1.55 ui-monospace, Consolas, monospace;
    outline: none;
  }
  .settings-screen textarea#saveText:focus { border-color: #c1a46a; box-shadow: 0 0 0 2px rgba(193, 164, 106, .16); }
  .settings-screen textarea#saveText::placeholder { color: #6f6a60; }

  /* 结果卡与导入预览 */
  .settings-screen .import-preview,
  .settings-screen .settings-result {
    display: flex; flex-direction: column; gap: 10px;
    padding: 12px 14px;
    color: var(--s-text);
    background: #12131b;
    border: 1px solid rgba(186, 164, 139, .24);
    border-radius: 4px;
    font: 12px/1.55 var(--body);
  }
  .settings-screen .import-preview .cmp { display: grid; grid-template-columns: 1fr 1fr; }
  .settings-screen .import-preview .cmp > div { min-width: 0; display: flex; flex-direction: column; gap: 5px; padding: 3px 14px 3px 0; }
  .settings-screen .import-preview .cmp > div + div { padding: 3px 0 3px 14px; border-left: 1px solid var(--s-rule); }
  .settings-screen .import-preview .cmp small { color: var(--s-muted); font-size: 10px; letter-spacing: 1px; }
  .settings-screen .import-preview .cmp b { color: var(--s-strong); font: 12px/1.55 var(--body); overflow-wrap: anywhere; }
  .settings-screen .import-preview .acts { display: flex; justify-content: flex-end; gap: 10px; }
  .settings-screen .settings-result.ok { border-color: #4f7d5f; color: #bfe3cd; background: rgba(36, 72, 48, .2); }
  .settings-screen .settings-result.bad { border-color: #b9504e; color: #f0c9c2; background: rgba(90, 35, 37, .2); }
  .settings-screen .settings-result b { color: #f2ead8; }

  /* ---------- 响应式 ---------- */
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
    #stage.settings-responsive .settings-screen { inset: 72px 0 62px; padding: 14px 18px 28px; }
  }

  @media (max-width: 900px) {
    #stage.settings-responsive .settings-layout,
    #stage.settings-responsive .settings-dev-grid { grid-template-columns: minmax(0, 1fr); }
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
    #stage.settings-responsive .settings-page-head h1 { font-size: 24px; letter-spacing: 2px; }
    #stage.settings-responsive .settings-layout { gap: 12px; margin-top: 12px; }
    #stage.settings-responsive .settings-side { gap: 12px; }
    #stage.settings-responsive .panel > .panel-head { min-height: 46px; padding: 10px 15px; }
    #stage.settings-responsive .panel-head h2 { font-size: 18px; }
    #stage.settings-responsive .settings-body { padding: 14px 15px 16px; }
    #stage.settings-responsive .settings-preferences-panel .settings-body { padding: 2px 15px 10px; }
    #stage.settings-responsive .settings-group .audio-channel { grid-template-columns: 64px minmax(0, 1fr) 38px 42px; column-gap: 10px; }
    #stage.settings-responsive .setting-copy b { font-size: 13px; }
    #stage.settings-responsive .account-card { grid-template-columns: 32px minmax(0, 1fr); }
    #stage.settings-responsive .account-card > .s-btn { grid-column: 1 / -1; }
    #stage.settings-responsive .save-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    #stage.settings-responsive .settings-row { display: grid; grid-template-columns: minmax(0, 1fr); }
    #stage.settings-responsive .settings-row .s-btn { width: 100%; white-space: normal; }
    #stage.settings-responsive .settings-dev-head { flex-wrap: wrap; }
    #stage.settings-responsive .settings-dev-head .settings-note { margin-left: 0; }
    #stage.settings-responsive .import-preview .cmp { grid-template-columns: minmax(0, 1fr); gap: 9px; }
    #stage.settings-responsive .import-preview .cmp > div,
    #stage.settings-responsive .import-preview .cmp > div + div { padding: 0; border-left: 0; }
    #stage.settings-responsive .import-preview .cmp > div + div { padding-top: 9px; border-top: 1px solid var(--s-rule); }
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
const escapeAttr = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');
const digestLine = (d: SaveDigest): string =>
  `Lv.${d.level} · 收藏 ${fmt(d.collection)} 张 · 黄金 ${fmt(d.gold)} · 宝石 ${fmt(d.gems)} · 王国 ${d.kingdoms} 个`;

export class SettingsScreen implements Screen {
  private ctx!: ShellCtx;
  private listeners: Array<[EventTarget, string, EventListenerOrEventListenerObject]> = [];
  /** 跨 refresh 存活的结果卡（S-3：成功反馈不能靠被整屏重建冲掉的 toast） */
  private notice: { kind: 'ok' | 'bad'; text: string } | null = null;
  /** 待导入的已校验文本 + 摘要（S-2：确认前先看清覆盖成什么） */
  private pending: { text: string; digest: SaveDigest } | null = null;
  private armed: 'demo' | 'new' | null = null;
  /** 修改器王国选择，刷新后还停在刚才那个王国 */
  private modifierKingdom: string | null = null;

  html(ctx: ShellCtx): string {
    const cur = digestOf(ctx.save());
    const preferences = getPlayerPreferences();
    const notice = this.notice
      ? `<div class="settings-result ${this.notice.kind}" id="settingsResult">${this.notice.text}</div>`
      : '';
    const save = ctx.save();
    const kingdoms = [...allKingdoms(), COMMUNITY_KINGDOM];
    const selected = this.modifierKingdom && kingdoms.includes(this.modifierKingdom) ? this.modifierKingdom : kingdoms[0] ?? '';
    const owned = Object.keys(save.collection).length;
    const realOwned = Object.keys(save.collectionTruth ?? save.collection).length;
    const modifierStatus = save.collectionTruth
      ? `当前显示的是修改后的收集，共 ${fmt(owned)} 张。真实收集 ${fmt(realOwned)} 张另外保存着，解锁和还原初始都不会覆盖它。`
      : `当前就是真实收集，共 ${fmt(owned)} 张。点解锁或还原初始之前，会先把这份进度另存。`;
    const kingdomOptions = kingdoms.map((name) => `<option value="${escapeAttr(name)}"${name === selected ? ' selected' : ''}>${escapeAttr(name)}</option>`).join('');
    // 开发者工具（导入/演示档/修改器/调试）只有本地后端提供；远端后端整块不渲染
    const dev = ctx.gateway.dev !== null;
    const remote = ctx.gateway.backend === 'remote';
    const stats = `<dl class="save-stats" aria-label="当前进度">
      <div><dt>等级</dt><dd>${cur.level}</dd></div>
      <div><dt>收藏</dt><dd>${fmt(cur.collection)}</dd></div>
      <div><dt>黄金</dt><dd>${fmt(cur.gold)}</dd></div>
      <div><dt>宝石</dt><dd>${fmt(cur.gems)}</dd></div>
      <div><dt>王国</dt><dd>${cur.kingdoms}</dd></div>
    </dl>`;
    const account = remote
      ? `<div class="account-card">
          <span data-icon="check"></span>
          <div><b>云端存档 · 已绑定 Discord</b><small>进度自动保存在服务器，换设备登录同一账号即可继续。</small></div>
          <button class="s-btn ghost" id="logoutBtn" type="button"><span data-icon="lock"></span>退出登录</button>
        </div>`
      : `<div class="account-card local">
          <span data-icon="chest"></span>
          <div><b>本机存档 · 自动保存</b><small>进度保存在这台设备的浏览器里，清理浏览器数据会一并清掉。</small></div>
        </div>`;
    return `
      <style id="settingsScreenCss">${SETTINGS_CSS}</style>
      ${topbarHtml()}
      <main class="screen settings-screen">
        <div class="settings-shell">
          <header class="settings-page-head">
            <h1>设置</h1>
            <button class="s-btn ghost" id="settingsBack" type="button"><span data-icon="arrow"></span>返回地图</button>
          </header>

          <div class="settings-layout">
            <section class="panel settings-preferences-panel">
              <div class="panel-head"><h2>游戏设置</h2></div>
              <div class="panel-inner settings-body">
                <div class="settings-group">
                  <h3>声音</h3>
                  ${audioControlsHtml()}
                </div>
                <div class="settings-group">
                  <h3>战斗与显示</h3>
                  <label class="check-row">
                    <span class="setting-copy"><b>自动战斗</b><small>进入战斗后自动操作</small></span>
                    <input type="checkbox" role="switch" id="autoBattle" aria-label="自动战斗"${autoBattleEnabled() ? ' checked' : ''}>
                  </label>
                  <label class="check-row">
                    <span class="setting-copy"><b>后台运行</b><small>切换标签页后继续战斗（自动战斗需单独开启）；默认暂停，后台静音</small></span>
                    <input type="checkbox" role="switch" id="backgroundRun" aria-label="后台运行"${backgroundRunEnabled() ? ' checked' : ''}>
                  </label>
                  <label class="check-row">
                    <span class="setting-copy"><b>快速释放</b><small>点击法力值已满的角色直接释放技能；长按查看详情</small></span>
                    <input type="checkbox" id="skipCastConfirm" aria-label="快速释放"${skipCastConfirm() ? ' checked' : ''}>
                  </label>
                  <label class="check-row">
                    <span class="setting-copy"><b>减弱动效</b><small>减少翻牌、转场与循环动画</small></span>
                    <input type="checkbox" id="reducedMotion" aria-label="减弱动效"${preferences.reducedMotion ? ' checked' : ''}>
                  </label>
                  ${dev ? `<details class="settings-dev-options">
                    <summary>开发者选项</summary>
                    <label class="check-row">
                      <span class="setting-copy"><b>战斗调试钩子</b><small>只记录调试输出，不改变玩法数值</small></span>
                      <input type="checkbox" id="battleDebug" aria-label="战斗调试钩子">
                    </label>
                  </details>` : ''}
                </div>
              </div>
            </section>

            <div class="settings-side">
              <section class="panel settings-save-panel">
                <div class="panel-head"><h2>账号与存档</h2></div>
                <div class="panel-inner settings-body">
                  ${account}
                  ${stats}
                  ${notice}
                </div>
              </section>

              <section class="panel danger-zone">
                <div class="panel-head"><h2>危险操作</h2></div>
                <div class="panel-inner settings-body">
                  <div class="warn-line">
                    <span data-icon="lock"></span>
                    <span>${remote
                      ? '重置会<b>清空服务器上的全部进度</b>，从新手引导重新开始，不可撤销。'
                      : '重置会<b>立刻删除当前全部进度</b>，不可撤销。需要留档，请先在下方开发者工具里导出。'}</span>
                  </div>
                  <div class="settings-row">
                    <button class="s-btn danger-btn" id="resetNew" type="button"><span data-icon="skull"></span><span id="resetNewLabel">重置为全新档</span></button>
                    ${dev ? '<button class="s-btn danger-btn" id="resetDemo" type="button"><span data-icon="skull"></span><span id="resetDemoLabel">重置为演示档</span></button>' : ''}
                  </div>
                  <p class="settings-note">首次点击只会进入待确认状态，5 秒内再点一次才会执行。</p>
                </div>
              </section>
            </div>
          </div>

          ${dev ? `<section class="settings-dev" aria-label="开发者工具">
            <div class="settings-dev-head">
              <h2>开发者工具</h2><span class="dev-tag">仅本地</span>
              <p class="settings-note">线上版本不显示这一区。</p>
            </div>
            <div class="settings-dev-grid">
              <section class="panel settings-modifier-panel">
                <div class="panel-head"><h2>收集修改器</h2></div>
                <div class="panel-inner settings-body">
                  <p class="settings-note modifier-status">${modifierStatus}</p>
                  <div class="settings-row">
                    <select id="collectionKingdom" class="modifier-kingdom" aria-label="要解锁的王国">${kingdomOptions}</select>
                    <button class="s-btn" id="unlockKingdomBtn" type="button">解锁该王国全部部队</button>
                  </div>
                  <div class="settings-row">
                    <button class="s-btn ghost" id="restoreRealBtn" type="button">还原真实收集</button>
                    <button class="s-btn ghost" id="restoreInitialBtn" type="button">还原初始收集</button>
                  </div>
                  <p class="settings-note">初始收集是新档的三张破碎尖塔普通卡。修改期间新开出来的卡会记进真实收集；在修改状态下升级的等级，还原后回到打开修改器之前。</p>
                </div>
              </section>

              <section class="panel settings-transfer-panel">
                <div class="panel-head"><h2>导出 / 导入存档</h2></div>
                <div class="panel-inner settings-body">
                  <div class="settings-row">
                    <button class="s-btn" id="downloadBtn" type="button"><span data-icon="chevrons"></span>导出文件（.json）</button>
                    <button class="s-btn ghost" id="copyBtn" type="button"><span data-icon="book"></span>复制文本</button>
                    <button class="s-btn ghost" id="exportBtn" type="button">显示在文本框</button>
                  </div>
                  <textarea id="saveText" spellcheck="false" placeholder="导出的存档 JSON 会显示在这里；也可粘贴存档文本，再读取并校验。"></textarea>
                  <h3 class="settings-subhead">导入</h3>
                  <div class="warn-line"><span data-icon="lock"></span><span>导入会<b>覆盖现在的进度</b>且不可撤销。先读取并校验，确认预览无误再覆盖。</span></div>
                  <div class="settings-row">
                    <button class="s-btn" id="pickFileBtn" type="button"><span data-icon="chest"></span>选择存档文件…</button>
                    <button class="s-btn ghost" id="validateBtn" type="button">校验文本框内容</button>
                    <input type="file" id="saveFile" accept="application/json,.json" hidden>
                  </div>
                  <div id="importPreview"></div>
                </div>
              </section>
            </div>
          </section>` : ''}
        </div>
      </main>
      ${bottomNavHtml('', remote ? '进度已保存到云端' : '进度保存在本机浏览器')}
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
    ($('#autoBattle') as HTMLInputElement).checked = autoBattleEnabled();
    const debugToggle = $('#battleDebug') as HTMLInputElement | null;
    if (debugToggle) debugToggle.checked = ctx.save().settings.battleDebug;

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
    bindAudioControls(document, undefined, ['master', 'music', 'narration']);
    this.bind('#soundEffectsEnabled', 'change', () => this.toggleSoundEffects());
    this.bind('#soundEffectsVolume', 'input', () => this.updateSoundEffectsVolume(false));
    this.bind('#soundEffectsVolume', 'change', () => this.updateSoundEffectsVolume(true));
    this.bind('#reducedMotion', 'change', () => this.toggleReducedMotion());
    this.bind('#skipCastConfirm', 'change', () => this.toggleCastConfirm());
    this.bind('#autoBattle', 'change', () => {
      setAutoBattleEnabled(($('#autoBattle') as HTMLInputElement).checked);
    });
    this.bind('#backgroundRun', 'change', () => {
      setBackgroundRunEnabled(($('#backgroundRun') as HTMLInputElement).checked);
    });
    this.bind('#battleDebug', 'change', () => void this.toggleDebug());
    this.bind('#collectionKingdom', 'change', () => {
      this.modifierKingdom = ($('#collectionKingdom') as HTMLSelectElement).value;
    });
    this.bind('#unlockKingdomBtn', 'click', () => void this.unlockKingdom());
    this.bind('#restoreRealBtn', 'click', () => void this.restoreCollection('restore-real'));
    this.bind('#restoreInitialBtn', 'click', () => void this.restoreCollection('restore-initial'));
    this.bind('#resetNew', 'click', () => void this.reset(false));
    this.bind('#resetDemo', 'click', () => void this.reset(true));
    this.bind('#settingsBack', 'click', () => ctx.navigate('#map'));
    this.bind('#logoutBtn', 'click', () => {
      void fetch('/auth/logout', { method: 'POST', credentials: 'include' })
        .then(response => { if (!response.ok) throw new Error('退出失败'); location.replace('/'); })
        .catch(() => toast('退出失败，请重试'));
    });
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
    const dev = this.ctx.gateway.dev;
    if (!dev) return;
    try {
      await dev.importSaveJson(text);
      // S-3：反馈放在 refresh **之后**（改前 toast 被整屏重建冲掉，成功比失败更让人困惑）
      this.notice = { kind: 'ok', text: `<b>导入成功</b>：当前进度已是 ${digestLine(digest)}。` };
      this.pending = null;
      this.ctx.refresh();
    } catch (error: unknown) {
      this.showResult('bad', '导入失败：' + (error instanceof Error ? error.message : String(error)));
    }
  }

  private async unlockKingdom(): Promise<void> {
    const kingdom = ($('#collectionKingdom') as HTMLSelectElement).value;
    this.modifierKingdom = kingdom;
    const dev = this.ctx.gateway.dev;
    if (!dev) return;
    const { result } = await dev.applyCollectionModifier({ kind: 'unlock-kingdom', kingdom });
    if (!result.ok) {
      this.showResult('bad', result.message);
      return;
    }
    const extra = result.added > 0 ? `新解锁 ${fmt(result.added)} 张。` : '这些部队本来就在当前收集里。';
    this.notice = {
      kind: 'ok',
      text: `<b>${escapeAttr(kingdom)}</b> 已解锁到当前收集。${extra}真实收集仍是 ${fmt(result.realOwned)} 张。`,
    };
    this.ctx.refresh();
  }

  private async restoreCollection(kind: 'restore-real' | 'restore-initial'): Promise<void> {
    const dev = this.ctx.gateway.dev;
    if (!dev) return;
    const { result } = await dev.applyCollectionModifier({ kind });
    if (!result.ok) return;
    this.notice = {
      kind: 'ok',
      text: kind === 'restore-real'
        ? `<b>已还原真实收集</b>，当前 ${fmt(result.owned)} 张。`
        : `<b>已还原初始收集</b>，当前 ${fmt(result.owned)} 张。真实收集 ${fmt(result.realOwned)} 张还在。`,
    };
    this.ctx.refresh();
  }

  private async toggleDebug(): Promise<void> {
    const on = ($('#battleDebug') as HTMLInputElement).checked;
    const dev = this.ctx.gateway.dev;
    if (!dev) return;
    await dev.setBattleDebug(on);
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
      ? '已开启快速释放：点击法力值已满的角色直接释放技能。'
      : '已关闭快速释放：点击角色先打开详情，再从详情里释放。');
  }

  /** S-5：页内两段式确认，取代跳出舞台的原生 confirm()（两条文案只差两字、默认焦点在"确定"） */
  private resetting = false;

  private async reset(demo: boolean): Promise<void> {
    if (this.resetting) return;
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
    const dev = this.ctx.gateway.dev;
    if (demo && !dev) return;
    this.resetting = true;
    (btn as HTMLButtonElement).disabled = true;
    try {
      const snapshot = demo && dev ? await dev.resetToDemo() : await this.ctx.gateway.resetToNewGame();
      if (!demo) {
        // Remote reset clears its session cookie in the same successful API response.
        location.replace(this.ctx.gateway.backend === 'remote' ? '/' : '/cover.html');
        return;
      }
      toast(snapshot.warning ? `已重置：${snapshot.warning}` : `已重置为${label}。`);
      this.ctx.navigate('#map');
    } catch (error) {
      toast('重置失败，请重试：' + (error instanceof Error ? error.message : String(error)));
    } finally {
      this.resetting = false;
      (btn as HTMLButtonElement).disabled = false;
      labelEl.textContent = demo ? '重置为演示档' : '重置为全新档';
      btn.classList.remove('armed');
    }
  }

  private showResult(kind: 'ok' | 'bad', html: string): void {
    const el = $('#settingsResult');
    if (el) {
      el.className = `settings-result ${kind}`;
      el.innerHTML = html;
      return;
    }
    // 结果卡还没渲染过 → 放进导出/导入面板（本地）或账号与存档面板末尾
    const body = $('.settings-transfer-panel .settings-body') ?? $('.settings-save-panel .settings-body');
    if (!body) {
      toast(html.replace(/<[^>]+>/g, ''));
      return;
    }
    const div = document.createElement('div');
    div.id = 'settingsResult';
    div.className = `settings-result ${kind}`;
    div.innerHTML = html;
    body.appendChild(div);
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
