/**
 * 技能测试页（技能编写与演出 · 需求 9）——主游戏的薄配置外壳。
 *
 * 架构铁律：不重写引擎装配/释放流程/选择器/演出。本页只做配置：
 *   - 一排"技能标签"，可**拖到我方角色卡**上，把该角色技能换成该原型（复用 App.setDebugSkill）；
 *   - 「法力上限=3」「充满法力」按钮，便于快速攒满/立即释放（复用 App 辅助方法）；
 *   - 换好技能、法力满后，**短按角色卡**走主游戏真实释放流程（含选色/目标/宝石 UI）；
 *   - 「推进回合」观察状态结算；事件日志订阅主游戏事件。
 */
import { App } from './App';
import {
  skill, dmg, dmgAll, dmgSplash, trueDmg,
  createGems, createSkulls, transform,
  destroyChosenRow, destroyChosenCol, destroyColor, explodeColor,
  destroyRandomGems, explodeRandomRows, explodeAt,
  heal, armor, attack, magic, mana, inflict, cleanse, extraTurn, summonRef, CHOSEN, CELL,
} from '@engine/skills/builders';
import type { SkillPrototype, EffectSegment } from '@engine/skills/prototypes';
import { BaseColor, PlayerSide, specialGem } from '@engine/types';
import type { CellPos, GemType, SpecialGemKind, SkullStormDropKind } from '@engine/types';
import type { GameEvent } from '@engine/events';

interface PresetSkill {
  id: string;
  label: string;
  proto: SkillPrototype;
}
const PRESETS: PresetSkill[] = [
  { id: 'dmg-single', label: '单体伤害', proto: skill(dmg('enemyFront', 4)) },
  { id: 'dmg-all', label: '群体伤害', proto: skill(dmgAll(3)) },
  { id: 'dmg-splash', label: '溅射伤害', proto: skill(dmgSplash('enemyFront', 4)) },
  { id: 'dmg-true', label: '真实伤害', proto: skill(trueDmg('enemyFront', 5)) },
  { id: 'gem-create', label: '创造宝石(绿)', proto: skill(createGems(BaseColor.Green, 8)) },
  { id: 'gem-create-skull', label: '创造骷髅×6', proto: skill(createSkulls(6)) },
  { id: 'gem-transform', label: '转化(选定→蓝)', proto: skill(transform(CHOSEN, BaseColor.Blue)) },
  { id: 'gem-destroy-row', label: '★摧毁选定行', proto: skill(destroyChosenRow()) },
  { id: 'gem-destroy-col', label: '★摧毁选定列', proto: skill(destroyChosenCol()) },
  { id: 'gem-destroy-color', label: '摧毁指定色', proto: skill(destroyColor(CHOSEN)) },
  { id: 'gem-destroy-random', label: '随机摧毁6颗', proto: skill(destroyRandomGems(6)) },
  { id: 'gem-explode-color', label: '爆破指定色', proto: skill(explodeColor(CHOSEN)) },
  { id: 'gem-explode-rows', label: '随机爆破2行', proto: skill(explodeRandomRows(2)) },
  { id: 'gem-boom', label: '★选宝石引爆', proto: skill(explodeAt(CELL)) },
  { id: 'heal', label: '治疗自身', proto: skill(heal('allySelf', 6)) },
  { id: 'cleanse', label: '驱散演示(先自毒)', proto: skill(inflict('poison', 'allySelf'), cleanse('allySelf')) },
  { id: 'armor', label: '加护甲(全体)', proto: skill(armor('allyAll', 4)) },
  { id: 'attack', label: '加攻击(自身)', proto: skill(attack('allySelf', 3)) },
  { id: 'poison', label: '中毒(队首)', proto: skill(inflict('poison', 'enemyFront')) },
  { id: 'burning', label: '燃烧(全体)', proto: skill(inflict('burning', 'enemyAll')) },
  { id: 'silence', label: '沉默(队首)', proto: skill(inflict('silence', 'enemyFront')) },
  { id: 'frozen', label: '冰冻(队首)', proto: skill(inflict('frozen', 'enemyFront')) },
  { id: 'stun', label: '击晕(队首)', proto: skill(inflict('stun', 'enemyFront')) },
  { id: 'entangle', label: '缠绕(队首)', proto: skill(inflict('entangle', 'enemyFront')) },
  { id: 'extra-turn', label: '额外回合', proto: skill(dmg('enemyFront', 2), extraTurn()) },
  { id: 'summon', label: '召唤(食人魔)', proto: skill(summonRef('Ogre')) },
  { id: 'dmg-chosen', label: '★选敌造成伤害', proto: skill(dmg('enemyChosen', 5)) },
  { id: 'heal-chosen', label: '★选盟友治疗', proto: skill(heal('allyChosen', 8)) },
];

PRESETS.push(
  { id: 'disease', label: 'Disease', proto: skill(inflict('disease', 'enemyFront')) },
  { id: 'death-mark', label: 'Death Mark', proto: skill(inflict('death-mark', 'enemyFront')) },
  { id: 'curse', label: 'Curse', proto: skill(inflict('curse', 'enemyFront')) },
  { id: 'charm', label: 'Charm', proto: skill(inflict('charm', 'enemyFront')) },
  { id: 'rage', label: 'Enraged', proto: skill(inflict('rage', 'allySelf')) },
  { id: 'wolf', label: 'Lycanthropy', proto: skill(inflict('lycanthropy', 'enemyFront')) },
  { id: 'mana-burn', label: 'Mana Burn', proto: skill(inflict('mana-burn', 'enemyFront')) },
);

const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

// —— 多段技能组合器（ANIMATION_HANDOFF §19 P1-2）——
// 每个"段模板"用一个工厂把 UI 参数编译成 EffectSegment。组合器只组装 SkillPrototype，
// 经 App.setDebugSkill 走正式释放链路（禁止直接调 playFrameFX/audio.play）。

/** 组合器里一个已添加的效果段（含可读描述与编译后的段） */
interface ComposerEntry {
  label: string;
  seg: EffectSegment;
}

/** 段模板：点击后按当前默认参数产出一个 EffectSegment + 描述 */
interface SegmentTemplate {
  id: string;
  label: string;
  make: () => ComposerEntry;
}

/** 组合器可选段库（覆盖伤害/群体/溅射/真伤/状态/宝石/增益/额外回合/召唤） */
const SEGMENT_TEMPLATES: SegmentTemplate[] = [
  { id: 'dmg-front', label: '伤害·队首', make: () => ({ label: '伤害(队首 [魔+4])', seg: dmg('enemyFront', 4) }) },
  { id: 'dmg-chosen', label: '伤害·选敌', make: () => ({ label: '伤害(选定敌 [魔+5])', seg: dmg('enemyChosen', 5) }) },
  { id: 'dmg-all', label: '群体伤害', make: () => ({ label: '群体伤害([魔+3])', seg: dmgAll(3) }) },
  { id: 'dmg-splash', label: '溅射伤害', make: () => ({ label: '溅射伤害([魔+4])', seg: dmgSplash('enemyFront', 4) }) },
  { id: 'dmg-true', label: '真实伤害', make: () => ({ label: '真实伤害([魔+5])', seg: trueDmg('enemyFront', 5) }) },
  { id: 'st-poison', label: '中毒·队首', make: () => ({ label: '中毒(队首)', seg: inflict('poison', 'enemyFront') }) },
  { id: 'st-poison-all', label: '中毒·全体', make: () => ({ label: '中毒(全体)', seg: inflict('poison', 'enemyAll') }) },
  { id: 'st-burning', label: '燃烧·队首', make: () => ({ label: '燃烧(队首)', seg: inflict('burning', 'enemyFront') }) },
  { id: 'st-burning-all', label: '燃烧·全体', make: () => ({ label: '燃烧(全体)', seg: inflict('burning', 'enemyAll') }) },
  { id: 'st-frozen', label: '冰冻·队首', make: () => ({ label: '冰冻(队首)', seg: inflict('frozen', 'enemyFront') }) },
  { id: 'st-silence', label: '沉默·队首', make: () => ({ label: '沉默(队首)', seg: inflict('silence', 'enemyFront') }) },
  { id: 'st-stun', label: '击晕·队首', make: () => ({ label: '击晕(队首)', seg: inflict('stun', 'enemyFront') }) },
  { id: 'st-entangle', label: '缠绕·队首', make: () => ({ label: '缠绕(队首)', seg: inflict('entangle', 'enemyFront') }) },
  { id: 'st-curse', label: '诅咒·队首', make: () => ({ label: '诅咒(队首)', seg: inflict('curse', 'enemyFront') }) },
  { id: 'gem-explode-color', label: '爆破指定色', make: () => ({ label: '爆破指定色(选色)', seg: explodeColor(CHOSEN) }) },
  { id: 'gem-destroy-color', label: '摧毁指定色', make: () => ({ label: '摧毁指定色(选色)', seg: destroyColor(CHOSEN) }) },
  { id: 'gem-boom', label: '选宝石引爆', make: () => ({ label: '选宝石引爆(3x3)', seg: explodeAt(CELL) }) },
  { id: 'gem-destroy-row', label: '摧毁选定行', make: () => ({ label: '摧毁选定行', seg: destroyChosenRow() }) },
  { id: 'gem-destroy-col', label: '摧毁选定列', make: () => ({ label: '摧毁选定列', seg: destroyChosenCol() }) },
  { id: 'gem-random', label: '随机摧毁6颗', make: () => ({ label: '随机摧毁6颗', seg: destroyRandomGems(6) }) },
  { id: 'gem-rows', label: '随机爆破2行', make: () => ({ label: '随机爆破2行', seg: explodeRandomRows(2) }) },
  { id: 'gem-create', label: '创造宝石(绿)', make: () => ({ label: '创造绿宝石×8', seg: createGems(BaseColor.Green, 8) }) },
  { id: 'gem-skull', label: '创造骷髅×6', make: () => ({ label: '创造骷髅×6', seg: createSkulls(6) }) },
  { id: 'gem-transform', label: '转化(选定→蓝)', make: () => ({ label: '转化(选定色→蓝)', seg: transform(CHOSEN, BaseColor.Blue) }) },
  { id: 'buff-heal', label: '治疗自身', make: () => ({ label: '治疗自身([魔+6])', seg: heal('allySelf', 6) }) },
  { id: 'buff-heal-chosen', label: '治疗选定盟友', make: () => ({ label: '治疗选定盟友([魔+8])', seg: heal('allyChosen', 8) }) },
  { id: 'buff-armor', label: '加护甲(全体)', make: () => ({ label: '加护甲(全体 [魔+4])', seg: armor('allyAll', 4) }) },
  { id: 'buff-attack', label: '加攻击(自身)', make: () => ({ label: '加攻击(自身 [魔+3])', seg: attack('allySelf', 3) }) },
  { id: 'buff-magic', label: '加魔法(自身)', make: () => ({ label: '加魔法(自身 [魔+3])', seg: magic('allySelf', 3) }) },
  { id: 'buff-mana', label: '加法力(自身)', make: () => ({ label: '加法力(自身 [魔+3])', seg: mana('allySelf', 3) }) },
  { id: 'cleanse-self', label: '驱散自身', make: () => ({ label: '驱散自身', seg: cleanse('allySelf') }) },
  { id: 'extra-turn', label: '额外回合', make: () => ({ label: '额外回合', seg: extraTurn() }) },
  { id: 'summon', label: '召唤(食人魔)', make: () => ({ label: '召唤(食人魔)', seg: summonRef('Ogre') }) },
];

SEGMENT_TEMPLATES.push(
  { id: 'st-disease', label: 'Disease', make: () => ({ label: 'Disease', seg: inflict('disease', 'enemyFront') }) },
  { id: 'st-death-mark', label: 'Death Mark', make: () => ({ label: 'Death Mark', seg: inflict('death-mark', 'enemyFront') }) },
  { id: 'st-charm', label: 'Charm', make: () => ({ label: 'Charm', seg: inflict('charm', 'enemyFront') }) },
  { id: 'st-rage', label: 'Enraged', make: () => ({ label: 'Enraged', seg: inflict('rage', 'allySelf') }) },
  { id: 'st-wolf', label: 'Lycanthropy', make: () => ({ label: 'Lycanthropy', seg: inflict('lycanthropy', 'enemyFront') }) },
  { id: 'st-mana-burn', label: 'Mana Burn', make: () => ({ label: 'Mana Burn', seg: inflict('mana-burn', 'enemyFront') }) },
);

const SEGMENT_TEMPLATE_BY_ID = new Map(SEGMENT_TEMPLATES.map((t) => [t.id, t]));

/** 预设多段组合（点一下即填入组合器编辑区，可再改） */
interface ComboPreset {
  id: string;
  label: string;
  segIds: string[];
}
const COMBO_PRESETS: ComboPreset[] = [
  { id: 'blue-freeze', label: '蓝单体伤害+冰冻', segIds: ['dmg-chosen', 'st-frozen'] },
  { id: 'poison-hit', label: '单体伤害+中毒', segIds: ['dmg-front', 'st-poison'] },
  { id: 'red-burn', label: '红单体伤害+燃烧', segIds: ['dmg-front', 'st-burning'] },
  { id: 'all-burn', label: '群体伤害+全体燃烧', segIds: ['dmg-all', 'st-burning-all'] },
  { id: 'dmg-control', label: '伤害+缠绕', segIds: ['dmg-front', 'st-entangle'] },
  { id: 'dmg-boom', label: '伤害+宝石爆破', segIds: ['dmg-front', 'gem-explode-color'] },
  { id: 'dmg-extra', label: '伤害+额外回合', segIds: ['dmg-front', 'extra-turn'] },
];

const TEST_MANA_COLORS: ReadonlyArray<{ color: BaseColor; label: string; hex: string }> = [
  { color: BaseColor.Red, label: '红色', hex: '#d94a4a' },
  { color: BaseColor.Blue, label: '蓝色（水）', hex: '#3f8fe8' },
  { color: BaseColor.Green, label: '绿色', hex: '#43a85c' },
  { color: BaseColor.Yellow, label: '黄色', hex: '#d6ae39' },
  { color: BaseColor.Purple, label: '紫色', hex: '#8e5ad7' },
  { color: BaseColor.Brown, label: '棕色（土）', hex: '#8a6040' },
];

const TEST_STORMS: ReadonlyArray<{
  color: BaseColor;
  label: string;
  hex: string;
  /** 骷髅系风暴（骸骨/末日/超级末日）的掉落目标；颜色风暴缺省 */
  dropKind?: SkullStormDropKind;
}> = [
  { color: BaseColor.Red, label: '火风暴', hex: '#d94a4a' },
  { color: BaseColor.Blue, label: '冰风暴', hex: '#3f8fe8' },
  { color: BaseColor.Green, label: '叶风暴', hex: '#43a85c' },
  { color: BaseColor.Yellow, label: '光风暴', hex: '#d6ae39' },
  { color: BaseColor.Purple, label: '暗风暴', hex: '#8e5ad7' },
  { color: BaseColor.Brown, label: '尘风暴', hex: '#8a6040' },
  // 骷髅系风暴（官方 Bonestorm/Doomstorm/Uber Doomstorm）：color 仅作表现主色
  { color: BaseColor.Brown, label: '骸骨风暴', hex: '#e6ddc8', dropKind: 'skull' },
  { color: BaseColor.Purple, label: '末日风暴', hex: '#ff2f68', dropKind: 'doomSkull' },
  { color: BaseColor.Purple, label: '超级末日风暴', hex: '#ff8a2a', dropKind: 'uberDoomSkull' },
];

/** 特殊宝石测试投放清单（kind → 按钮文案；幽灵无行为仅看贴图） */
const SPECIAL_TEST_GEMS: ReadonlyArray<{ kind: SpecialGemKind; tier?: number; label: string }> = [
  { kind: 'doomSkull', label: '末日骷髅' },
  { kind: 'uberDoomSkull', label: '至尊末日' },
  { kind: 'bomb', label: '炸弹' },
  { kind: 'web', label: '织网' },
  { kind: 'ghost', label: '幽魂' },
  { kind: 'wildcard', tier: 2, label: '通配×2' },
  { kind: 'wildcard', tier: 4, label: '通配×4' },
  { kind: 'wish', label: '许愿' },
  { kind: 'lightningCol', label: '闪电·黄(清列)' },
  { kind: 'lightningRow', label: '闪电·蓝(清行)' },
  { kind: 'hourglass', label: '沙漏' },
];


const GEM_CHAIN_LEVELS = [
  { level: 1, label: '普通消除' },
  { level: 2, label: '2 连击' },
  { level: 3, label: '3 连击' },
  { level: 4, label: '4 连击' },
  { level: 5, label: '5 连击' },
] as const;



export class SkillTestPage {
  private app = new App();
  private logEl!: HTMLDivElement;
  /** 组合器当前编辑中的效果段序列 */
  private composerSegments: ComposerEntry[] = [];
  private composerListEl!: HTMLDivElement;

  async init(mount: HTMLElement): Promise<void> {
    mount.dataset.testReady = 'false';
    const layout = document.createElement('div');
    layout.style.cssText = 'display:flex;gap:16px;align-items:flex-start;padding:12px;font-family:"Oswald","PingFang SC",sans-serif';

    const gameMount = document.createElement('div');
    layout.appendChild(gameMount);
    layout.appendChild(this.buildControls());
    mount.appendChild(layout);

    // 启动主游戏（真实释放流程与演出全在这里）。
    // 大屏测试台：按视口自适应放大棋盘逻辑格基准（画布原生变大而非 transform 拉伸变糊）：
    //   高度向：dimH ≈ 52 + 8×cell ≤ 视口高 - 页边距；
    //   宽度向：dimW ≈ 28 + 2×CARD_W + 8×cell ≤ 视口宽 - 控制面板(300) - 间距/边距(~90)。
    const byH = Math.floor((window.innerHeight - 100) / 8);
    const byW = Math.floor((window.innerWidth - 90 - 300 - 2 * 142) / 8);
    this.app.baseCellSize = Math.max(48, Math.min(88, byH, byW));
    await this.app.init(gameMount);
    // 给足棋盘空间：宽度不小于基准宽（不足时页面横向滚动而不是缩小棋盘），
    // 高度与基准一致——refreshLayout 只在窗口比基准更小时才向下缩放。
    const base = this.app.getBaseSize();
    gameMount.style.flex = '0 0 auto';
    gameMount.style.minWidth = `${base.w}px`;
    gameMount.style.minHeight = `${base.h}px`;
    this.app.onEventsProduced = (events) => this.logEvents(events);

    // 默认把法力上限调到 3，方便快速攒满测试
    this.app.setAllManaCost(3);
    this.app.fillAllMana();
    this.wireDropTargets();
    this.log('— 测试页就绪：拖技能标签到我方角色卡换技能，短按角色卡释放 —');
    mount.dataset.testReady = 'true';
  }

  /** 把每张我方角色卡设为拖拽落点：接收技能标签 → 换该角色技能 */
  private wireDropTargets(): void {
    for (const id of this.app.getAllyIds()) {
      const el = this.app.getCardElement(id);
      if (!el) continue;
      el.addEventListener('dragover', (e) => {
        e.preventDefault();
        el.style.outline = '2px dashed #6ee0eb';
      });
      el.addEventListener('dragleave', () => {
        el.style.outline = '';
      });
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.style.outline = '';
        const presetId = e.dataTransfer?.getData('text/plain');
        const preset = presetId ? PRESET_BY_ID.get(presetId) : undefined;
        if (preset) {
          this.app.setDebugSkill(id, preset.proto);
          this.log(`◆ 角色${id} 技能 → ${preset.label}`);
        }
      });
    }
  }

  private buildControls(): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText = 'display:flex;flex-direction:column;gap:10px;width:300px;color:#f0e2bf';

    const title = document.createElement('div');
    title.textContent = '技能测试页（主游戏薄壳）';
    title.style.cssText = 'font-size:16px;font-weight:700;color:#f6efe0';
    panel.appendChild(title);

    const hint = document.createElement('div');
    hint.textContent = '先切换我方水晶颜色，再把技能标签拖到角色卡；短按卡释放技能';
    hint.style.cssText = 'font-size:11px;color:#a89974;line-height:1.5';
    panel.appendChild(hint);

    // 全局操作
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    const mkBtn = (label: string, testid: string, bg: string, on: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.dataset.testid = testid;
      b.style.cssText = `flex:1;padding:8px;border-radius:6px;border:1px solid rgba(216,194,144,.5);background:${bg};color:#f0e2bf;cursor:pointer;font-size:12px`;
      b.addEventListener('click', on);
      return b;
    };
    actions.appendChild(mkBtn('法力上限=3', 'mana-cost-3', '#2a2013', () => { this.app.setAllManaCost(3); this.log('法力上限=3'); }));
    actions.appendChild(mkBtn('充满法力', 'fill-mana', '#132a1f', () => { this.app.fillAllMana(); this.log('已充满全体法力'); }));
    actions.appendChild(mkBtn('推进回合', 'step-turn', '#1f2233', () => void this.stepTurn()));
    panel.appendChild(actions);

    const colorTool = document.createElement('div');
    colorTool.style.cssText = 'display:flex;flex-direction:column;gap:5px;padding:8px;border:1px solid rgba(216,194,144,.28);border-radius:6px;background:#100d09';
    const colorLabel = document.createElement('label');
    colorLabel.textContent = '我方水晶颜色（决定属性音效）';
    colorLabel.htmlFor = 'ally-mana-color';
    colorLabel.style.cssText = 'font-size:12px;color:#c9a35c';
    const colorSelect = document.createElement('select');
    colorSelect.id = 'ally-mana-color';
    colorSelect.dataset.testid = 'ally-mana-color';
    colorSelect.style.cssText = 'width:100%;padding:7px;border-radius:5px;border:1px solid rgba(216,194,144,.45);background:#171208;color:#f0e2bf;cursor:pointer';
    for (const item of TEST_MANA_COLORS) {
      const option = document.createElement('option');
      option.value = item.color;
      option.textContent = `● ${item.label}`;
      option.style.color = item.hex;
      colorSelect.appendChild(option);
    }
    colorSelect.addEventListener('change', () => {
      const item = TEST_MANA_COLORS.find((entry) => entry.color === colorSelect.value);
      if (!item) return;
      this.app.setAllyManaColor(item.color);
      this.app.fillAllMana();
      this.log(`◆ 我方水晶颜色 → ${item.label}`);
    });
    colorTool.append(colorLabel, colorSelect);
    panel.appendChild(colorTool);

    panel.appendChild(this.buildStormTool());

    // 特殊宝石测试区：随机换上指定宝石，走主游戏游玩流程触发其效果
    panel.appendChild(this.buildSpecialGemTool());

    const chainAudioTool = document.createElement('div');
    chainAudioTool.dataset.testid = 'gem-chain-audio-preview';
    chainAudioTool.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid rgba(216,194,144,.28);border-radius:6px;background:#100d09';
    const chainAudioTitle = document.createElement('div');
    chainAudioTitle.textContent = '\u5b9d\u77f3\u6d88\u9664 / \u8fde\u51fb \u00b7 \u65b0\u7248\u5b9a\u7a3f\u97f3\u6548';
    chainAudioTitle.style.cssText = 'font-size:12px;color:#c9a35c';
    const chainAudioHelp = document.createElement('div');
    chainAudioHelp.textContent = '\u6b63\u5f0f\u6218\u6597\u56fa\u5b9a\u4f7f\u7528\u65b0\u7248\u97f3\u6548\u3002\u53ef\u987a\u5e8f\u8bd5\u542c\u300c\u666e\u901a\u6d88\u9664 \u2192 2~5 \u8fde\u51fb\u300d\uff0c\u6216\u5355\u72ec\u8bd5\u542c\u6bcf\u4e00\u7ea7\u3002';
    chainAudioHelp.style.cssText = 'font-size:10px;line-height:1.45;color:#8f826b';
    const chainAudioGrid = document.createElement('div');
    chainAudioGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:5px';
    let selectedChainLevel = 0;
    const previewSetButton = document.createElement('button');
    previewSetButton.type = 'button';
    previewSetButton.textContent = '\u8bd5\u542c\u65b0\u7248\u6574\u5957';
    previewSetButton.dataset.testid = 'gem-chain-preview-set';
    previewSetButton.style.cssText = 'padding:7px 5px;border-radius:5px;border:1px solid #e4bc68;background:#49351a;color:#fff1c7;cursor:pointer;font-size:11px';
    previewSetButton.addEventListener('click', () => {
      selectedChainLevel = 0;
      refreshChainButtons();
      this.app.previewDebugGemChainSet();
      this.log('\u266b \u5b9d\u77f3\u6d88\u9664/\u8fde\u51fb \u2192 \u8bd5\u542c\u65b0\u7248\u6574\u5957');
    });
    const chainButtons = new Map<number, HTMLButtonElement>();
    const refreshChainButtons = () => {
      for (const [level, button] of chainButtons) {
        const selected = level === selectedChainLevel;
        button.style.borderColor = selected ? '#a7e37b' : 'rgba(216,194,144,.35)';
        button.style.background = selected ? '#233a1a' : '#171208';
        button.style.color = selected ? '#e5ffd2' : '#cfc1a0';
        button.setAttribute('aria-pressed', String(selected));
      }
    };
    for (const item of GEM_CHAIN_LEVELS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.label;
      button.dataset.testid = `gem-chain-sfx-${item.level}`;
      button.style.cssText = 'padding:6px 5px;border-radius:5px;border:1px solid rgba(216,194,144,.35);background:#171208;color:#cfc1a0;cursor:pointer;font-size:11px';
      button.addEventListener('click', () => {
        selectedChainLevel = item.level;
        refreshChainButtons();
        this.app.previewDebugGemChainLevel(item.level);
        this.log(`♫ 宝石消除/连击音效 → 等级 ${item.level}`);
      });
      chainButtons.set(item.level, button);
      chainAudioGrid.appendChild(button);
    }
    chainAudioTool.append(chainAudioTitle, chainAudioHelp, previewSetButton, chainAudioGrid);
    panel.appendChild(chainAudioTool);

    const tagTitle = document.createElement('div');
    tagTitle.textContent = '技能标签（拖到我方角色卡）';
    tagTitle.style.cssText = 'font-size:13px;color:#c9a35c;margin-top:4px';
    panel.appendChild(tagTitle);

    // 可拖拽技能标签
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px';
    for (const preset of PRESETS) {
      const tag = document.createElement('div');
      tag.textContent = preset.label;
      tag.dataset.testid = `skill-${preset.id}`;
      tag.draggable = true;
      tag.style.cssText = 'padding:7px 8px;border-radius:6px;border:1px solid rgba(216,194,144,.4);' +
        'background:#171208;color:#f0e2bf;cursor:grab;font-size:12px;user-select:none;text-align:center';
      tag.addEventListener('dragstart', (e) => {
        e.dataTransfer?.setData('text/plain', preset.id);
        tag.style.opacity = '0.5';
      });
      tag.addEventListener('dragend', () => { tag.style.opacity = '1'; });
      grid.appendChild(tag);
    }
    panel.appendChild(grid);

    panel.appendChild(this.buildComposer());

    const logTitle = document.createElement('div');
    logTitle.textContent = '事件流';
    logTitle.style.cssText = 'font-size:13px;color:#c9a35c;margin-top:4px';
    panel.appendChild(logTitle);

    this.logEl = document.createElement('div');
    this.logEl.dataset.testid = 'event-log';
    this.logEl.style.cssText = 'height:220px;overflow-y:auto;background:#0b0a09;border:1px solid rgba(216,194,144,.25);' +
      'border-radius:6px;padding:8px;font-family:monospace;font-size:11px;line-height:1.5;color:#b9ab84;white-space:pre-wrap';
    panel.appendChild(this.logEl);

    return panel;
  }

  /** 风暴测试区：通过 TurnEngine 的真实 storm-change 事件测试开局、替换、对手顶替与到期。 */
  private buildStormTool(): HTMLElement {
    const box = document.createElement('div');
    box.dataset.testid = 'storm-tool';
    box.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid rgba(216,194,144,.28);border-radius:6px;background:#100d09';
    const title = document.createElement('div');
    title.textContent = '风暴测试（真实掉落修正）';
    title.style.cssText = 'font-size:12px;color:#c9a35c';
    const help = document.createElement('div');
    help.textContent = '风暴是全场唯一效果；后设置的风暴会顶替先设置的。设置 1 回合后点“推进回合”可测到期。';
    help.style.cssText = 'font-size:10px;line-height:1.45;color:#8f826b';
    box.append(title, help);

    const sideRow = document.createElement('div');
    sideRow.style.cssText = 'display:flex;gap:5px';
    const sideSelect = document.createElement('select');
    sideSelect.dataset.testid = 'storm-side';
    sideSelect.style.cssText = 'flex:1;padding:6px;border-radius:5px;border:1px solid rgba(216,194,144,.45);background:#171208;color:#f0e2bf;font-size:11px';
    sideSelect.innerHTML = '<option value="Left">我方</option><option value="Right">敌方</option>';
    const turnsSelect = document.createElement('select');
    turnsSelect.dataset.testid = 'storm-turns';
    turnsSelect.style.cssText = 'flex:1;padding:6px;border-radius:5px;border:1px solid rgba(216,194,144,.45);background:#171208;color:#f0e2bf;font-size:11px';
    for (const turns of [1, 2, 4, 8]) {
      const option = document.createElement('option');
      option.value = String(turns);
      option.textContent = `${turns} 回合`;
      if (turns === 8) option.selected = true;
      turnsSelect.appendChild(option);
    }
    sideRow.append(sideSelect, turnsSelect);
    box.appendChild(sideRow);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px';
    for (const storm of TEST_STORMS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = storm.label;
      // 骷髅系风暴与对应色风暴共用 BaseColor（两个紫），testid 以 dropKind 区分
      button.dataset.testid = storm.dropKind ? `storm-${storm.dropKind}` : `storm-${storm.color}`;
      button.style.cssText = `padding:6px 4px;border-radius:5px;border:1px solid ${storm.hex};background:#171208;color:${storm.hex};cursor:pointer;font-size:11px`;
      button.addEventListener('click', () => {
        const side = sideSelect.value === 'Right' ? PlayerSide.Right : PlayerSide.Left;
        const turns = Number(turnsSelect.value) || 8;
        void this.app.debugSetStorm(storm.color, side, turns, storm.dropKind).then(() => {
          this.log(`风暴 ${storm.label} → ${side === PlayerSide.Left ? '我方' : '敌方'}，${turns} 回合`);
        });
      });
      grid.appendChild(button);
    }
    box.appendChild(grid);
    return box;
  }

  /**
   * 多段技能组合器（ANIMATION_HANDOFF §19 P1-2）：
   * 不改正式技能库，就地组装 SkillPrototype 并经 App.setDebugSkill 走正式释放链路。
   * 只负责"组装原型 + 换到当前施法者"，绝不直接调 playFrameFX/audio.play。
   */
  private buildComposer(): HTMLElement {
    const box = document.createElement('div');
    box.dataset.testid = 'skill-composer';
    box.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:8px;margin-top:4px;' +
      'border:1px solid rgba(216,194,144,.32);border-radius:6px;background:#100d09';

    const title = document.createElement('div');
    title.textContent = '多段技能组合器';
    title.style.cssText = 'font-size:13px;font-weight:700;color:#c9a35c';
    box.appendChild(title);

    const hint = document.createElement('div');
    hint.textContent = '选段加入 → 排序/删除 → 设为施法者技能；按效果段书写顺序演出。';
    hint.style.cssText = 'font-size:10px;color:#8f826b;line-height:1.45';
    box.appendChild(hint);

    // 预设组合
    const presetWrap = document.createElement('div');
    presetWrap.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px';
    for (const combo of COMBO_PRESETS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = combo.label;
      b.dataset.testid = `combo-preset-${combo.id}`;
      b.style.cssText = 'padding:5px 6px;border-radius:5px;border:1px solid rgba(216,194,144,.35);' +
        'background:#1a1409;color:#d9c79a;cursor:pointer;font-size:10px';
      b.addEventListener('click', () => this.loadComboPreset(combo));
      presetWrap.appendChild(b);
    }
    box.appendChild(presetWrap);

    // 段库下拉 + 加入按钮
    const addRow = document.createElement('div');
    addRow.style.cssText = 'display:flex;gap:5px';
    const select = document.createElement('select');
    select.dataset.testid = 'composer-seg-select';
    select.style.cssText = 'flex:1;padding:6px;border-radius:5px;border:1px solid rgba(216,194,144,.45);background:#171208;color:#f0e2bf;font-size:11px;cursor:pointer';
    for (const tpl of SEGMENT_TEMPLATES) {
      const opt = document.createElement('option');
      opt.value = tpl.id;
      opt.textContent = tpl.label;
      select.appendChild(opt);
    }
    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.textContent = '加入';
    addBtn.dataset.testid = 'composer-add';
    addBtn.style.cssText = 'padding:6px 10px;border-radius:5px;border:1px solid #a7e37b;background:#233a1a;color:#e5ffd2;cursor:pointer;font-size:11px';
    addBtn.addEventListener('click', () => {
      const tpl = SEGMENT_TEMPLATE_BY_ID.get(select.value);
      if (tpl) { this.composerSegments.push(tpl.make()); this.refreshComposerList(); }
    });
    addRow.append(select, addBtn);
    box.appendChild(addRow);

    // 已添加段列表
    this.composerListEl = document.createElement('div');
    this.composerListEl.dataset.testid = 'composer-list';
    this.composerListEl.style.cssText = 'display:flex;flex-direction:column;gap:4px;min-height:24px';
    box.appendChild(this.composerListEl);

    // 操作：设为技能 / 清空
    const opRow = document.createElement('div');
    opRow.style.cssText = 'display:flex;gap:6px';
    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.textContent = '设为施法者技能';
    applyBtn.dataset.testid = 'composer-apply';
    applyBtn.style.cssText = 'flex:1;padding:7px;border-radius:5px;border:1px solid #e4bc68;background:#49351a;color:#fff1c7;cursor:pointer;font-size:11px';
    applyBtn.addEventListener('click', () => this.applyComposer());
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = '清空';
    clearBtn.dataset.testid = 'composer-clear';
    clearBtn.style.cssText = 'padding:7px 10px;border-radius:5px;border:1px solid rgba(216,194,144,.4);background:#2a2013;color:#f0e2bf;cursor:pointer;font-size:11px';
    clearBtn.addEventListener('click', () => { this.composerSegments = []; this.refreshComposerList(); });
    opRow.append(applyBtn, clearBtn);
    box.appendChild(opRow);

    this.refreshComposerList();
    return box;
  }

  /** 载入一个预设组合到编辑区（可再改） */
  private loadComboPreset(combo: ComboPreset): void {
    this.composerSegments = combo.segIds
      .map((id) => SEGMENT_TEMPLATE_BY_ID.get(id))
      .filter((t): t is SegmentTemplate => !!t)
      .map((t) => t.make());
    this.refreshComposerList();
    this.log(`◆ 载入组合预设 → ${combo.label}`);
  }

  /** 重绘已添加段列表（含上移/下移/删除） */
  private refreshComposerList(): void {
    if (!this.composerListEl) return;
    this.composerListEl.textContent = '';
    if (this.composerSegments.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = '（空：从上方选段加入）';
      empty.style.cssText = 'font-size:10px;color:#6f6650;padding:3px';
      this.composerListEl.appendChild(empty);
      return;
    }
    this.composerSegments.forEach((entry, i) => {
      const row = document.createElement('div');
      row.dataset.testid = `composer-item-${i}`;
      row.style.cssText = 'display:flex;align-items:center;gap:4px;padding:4px 6px;border-radius:4px;' +
        'background:#171208;border:1px solid rgba(216,194,144,.22);font-size:11px;color:#e0d2ac';
      const idx = document.createElement('span');
      idx.textContent = `${i + 1}.`;
      idx.style.cssText = 'color:#8f826b;min-width:16px';
      const name = document.createElement('span');
      name.textContent = entry.label;
      name.style.cssText = 'flex:1';
      const mkMini = (txt: string, testid: string, on: () => void) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = txt;
        b.dataset.testid = testid;
        b.style.cssText = 'padding:2px 6px;border-radius:4px;border:1px solid rgba(216,194,144,.35);background:#221a0e;color:#d9c79a;cursor:pointer;font-size:11px';
        b.addEventListener('click', on);
        return b;
      };
      const up = mkMini('↑', `composer-up-${i}`, () => this.moveComposer(i, -1));
      const down = mkMini('↓', `composer-down-${i}`, () => this.moveComposer(i, 1));
      const del = mkMini('✕', `composer-del-${i}`, () => { this.composerSegments.splice(i, 1); this.refreshComposerList(); });
      row.append(idx, name, up, down, del);
      this.composerListEl.appendChild(row);
    });
  }

  /** 上移/下移一个段（dir=-1 上移，+1 下移） */
  private moveComposer(i: number, dir: number): void {
    const j = i + dir;
    if (j < 0 || j >= this.composerSegments.length) return;
    const arr = this.composerSegments;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    this.refreshComposerList();
  }

  /** 把组合器当前段序列组装成原型，设为当前（首个）施法者的技能 */
  private applyComposer(): void {
    if (this.composerSegments.length === 0) {
      this.log('⚠ 组合器为空，未设置');
      return;
    }
    const casterId = this.app.getAllyIds()[0];
    if (casterId === undefined) return;
    const proto = skill(...this.composerSegments.map((e) => e.seg));
    this.app.setDebugSkill(casterId, proto);
    const desc = this.composerSegments.map((e) => e.label).join(' → ');
    this.log(`◆ 角色${casterId} 技能 → 组合[${desc}]（短按该卡释放）`);
  }

  /**
   * 特殊宝石测试区：把随机格子替换为指定特殊宝石（走 gem-transform 演出管线）。
   * 投放后照常游玩——三消/技能清除触发对应效果（炸弹/许愿需被摧毁，末日骷髅需被匹配）。
   */
  private buildSpecialGemTool(): HTMLElement {
    const box = document.createElement('div');
    box.dataset.testid = 'special-gem-tool';
    box.style.cssText = 'display:flex;flex-direction:column;gap:6px;padding:8px;border:1px solid rgba(216,194,144,.28);border-radius:6px;background:#100d09';

    const title = document.createElement('div');
    title.textContent = '特殊宝石（点击随机换上一颗）';
    title.style.cssText = 'font-size:12px;color:#c9a35c';
    box.appendChild(title);

    const help = document.createElement('div');
    help.textContent = '末日骷髅被三消触发；炸弹/许愿/幽魂只能被爆破类效果引爆；闪电匹配或被摧毁皆触发；通配可凭空凑出三连，属正常现象。';
    help.style.cssText = 'font-size:10px;line-height:1.45;color:#8f826b';
    box.appendChild(help);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px';
    for (const item of SPECIAL_TEST_GEMS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = item.label;
      b.dataset.testid = `special-gem-${item.kind}${item.tier ? '-' + item.tier : ''}`;
      b.style.cssText = 'padding:6px 4px;border-radius:5px;border:1px solid rgba(216,194,144,.35);background:#171208;color:#e0d2ac;cursor:pointer;font-size:11px';
      b.addEventListener('click', () => void this.placeSpecialGems([item]));
      grid.appendChild(b);
    }
    box.appendChild(grid);

    const opRow = document.createElement('div');
    opRow.style.cssText = 'display:flex;gap:6px';
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.textContent = '全部种类各一颗';
    allBtn.dataset.testid = 'special-gem-all';
    allBtn.style.cssText = 'flex:1;padding:7px;border-radius:5px;border:1px solid #e4bc68;background:#49351a;color:#fff1c7;cursor:pointer;font-size:11px';
    allBtn.addEventListener('click', () => void this.placeSpecialGems([...SPECIAL_TEST_GEMS]));
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = '清除特殊宝石';
    clearBtn.dataset.testid = 'special-gem-clear';
    clearBtn.style.cssText = 'flex:1;padding:7px;border-radius:5px;border:1px solid rgba(216,194,144,.4);background:#2a2013;color:#f0e2bf;cursor:pointer;font-size:11px';
    clearBtn.addEventListener('click', () => void this.clearSpecialGems());
    opRow.append(allBtn, clearBtn);
    box.appendChild(opRow);

    return box;
  }

  /** 把若干特殊宝石投到随机互不重复的格子上（经 App 调试钩子走演出管线） */
  private async placeSpecialGems(specs: ReadonlyArray<{ kind: SpecialGemKind; tier?: number }>): Promise<void> {
    const cells: CellPos[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) cells.push({ row: r, col: c });
    }
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    const changes = specs.slice(0, cells.length).map((sp, i) => ({
      pos: cells[i],
      type: specialGem(sp.kind, sp.tier),
    }));
    const ok = await this.app.debugSetGems(changes);
    if (!ok) {
      this.log('⚠ 解析中，稍后再投放特殊宝石');
      return;
    }
    const names = specs.map((sp) => SPECIAL_TEST_GEMS.find((x) => x.kind === sp.kind && x.tier === sp.tier)?.label ?? sp.kind);
    this.log(`◆ 投放特殊宝石 ×${changes.length}：${names.join('、')}`);
  }

  /** 把棋盘上全部特殊宝石换回随机基础色 */
  private async clearSpecialGems(): Promise<void> {
    const board = this.app.getEngine().getState().board;
    const colors = Object.values(BaseColor);
    const changes: { pos: CellPos; type: GemType }[] = [];
    board.forEach((gem, pos) => {
      if (gem && gem.type.kind === 'special') {
        const color = colors[Math.floor(Math.random() * colors.length)];
        changes.push({ pos, type: { kind: 'color', color } });
      }
    });
    if (changes.length === 0) {
      this.log('盘面上没有特殊宝石');
      return;
    }
    const ok = await this.app.debugSetGems(changes);
    if (ok) this.log(`◆ 清除特殊宝石 ×${changes.length} → 随机基础色`);
  }

  /** 推进回合：走主游戏 App.passTurn（引擎真实回合流程，含状态结算），不另写逻辑 */
  private async stepTurn(): Promise<void> {
    this.log('⏭ 推进回合');
    await this.app.passTurn();
  }

  private log(line: string): void {
    if (!this.logEl) return;
    this.logEl.textContent += (this.logEl.textContent ? '\n' : '') + line;
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private logEvents(events: GameEvent[]): void {
    for (const ev of events) this.log(`  · ${this.describe(ev)}`);
  }

  private describe(ev: GameEvent): string {
    switch (ev.type) {
      case 'skill-cast': return `skill-cast (角色${ev.characterId})`;
      case 'skill-damage': return `skill-damage → 角色${ev.targetId} 伤害${ev.damage}`;
      case 'buff': return `buff → 角色${ev.targetId} ${ev.stat}+${ev.amount}`;
      case 'status-apply': return `status-apply → 角色${ev.targetId} ${ev.statusId} ${ev.turns}回合`;
      case 'status-tick': return `status-tick → 角色${ev.targetId} ${ev.statusId}${ev.damage ? ' 伤害' + ev.damage : ''}`;
      case 'status-expire': return `status-expire → 角色${ev.targetId} ${ev.statusId}`;
      case 'gem-create': return `gem-create × ${ev.spawns.length}`;
      case 'gem-transform': return `gem-transform × ${ev.changes.length}`;
      case 'gem-destroy': return `gem-destroy × ${ev.cells.length}`;
      case 'gem-explode': return `gem-explode × ${ev.cells.length}`;
      case 'special-gem-trigger': {
        const at = `@(${ev.pos.row},${ev.pos.col})`;
        const line = ev.line !== undefined ? ` 线${ev.line}` : '';
        const wish = ev.wish ? ` 选项${ev.wish.option}` : '';
        return `★特殊宝石触发 ${ev.kind} ${at}${line}${wish}`;
      }
      case 'summon': return `summon(${ev.destination}) -> character ${ev.characterId}`;
      case 'extra-turn': return `extra-turn (${ev.player})`;
      case 'game-over': return `game-over 胜者${ev.winner}`;
      default: return ev.type;
    }
  }
}
