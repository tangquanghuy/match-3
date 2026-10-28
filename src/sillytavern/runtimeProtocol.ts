import {
  DEFAULT_ENEMY_DESIGN_INPUT,
  ENEMY_DESIGN_VOCABULARY,
  parseEnemyDesignInput,
} from './enemyDesign';
import type {EnemyDesignInput} from './enemyDesign';

/** RegExp source only. Capture 1 is JSON; callers still need full-message validation. */
export const MATCH3_BLOCK_PATTERN = String.raw`(?:^|\r?\n)<match3>\r?\n([\s\S]*?)\r?\n</match3>(?=\r?\n|$)`;

const MAX_BLOCK_BYTES = 32 * 1024;
const ENCOUNTER_FIELDS = ['version', 'difficulty', 'enemyDesigns'];

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function insideCodeFence(prefix: string): boolean {
  let fence: {character: string; length: number} | undefined;
  for (const line of prefix.split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!marker) continue;
    const run = marker[1]!;
    if (!fence) fence = {character: run[0]!, length: run.length};
    else if (run[0] === fence.character && run.length >= fence.length && marker[2]!.trim() === '') fence = undefined;
  }
  return fence !== undefined;
}

/** Parse the original assistant message, never an extracted or first-matched fragment. */
export function parseRuntimeEncounter(text: string): {version: 1; difficulty: string; enemyDesigns: EnemyDesignInput[]} {
  if (typeof text !== 'string') throw new Error('运行时 AI 消息必须是字符串');

  let open = false;
  let count = 0;
  for (const marker of text.matchAll(/<\/?match3>/g)) {
    if (marker[0] === '<match3>') {
      if (open) throw new Error('协议块禁止嵌套 <match3> 标记');
      if (++count > 1) throw new Error('每条 assistant 消息最多一个 <match3> 协议块');
      open = true;
    } else {
      if (!open) throw new Error('协议块标记不配对：结束标记之前缺少 <match3>');
      open = false;
    }
  }
  if (open) throw new Error('协议块缺少结束标记 </match3>');
  if (count === 0) throw new Error('消息缺少 <match3> 协议块');

  const match = new RegExp(MATCH3_BLOCK_PATTERN).exec(text);
  if (!match) throw new Error('协议格式错误：<match3> 与 </match3> 必须各占独立一行，中间为 JSON');
  const protocolBlock = match[0].slice(match[0].indexOf('<match3>'));
  if (new TextEncoder().encode(protocolBlock).byteLength > MAX_BLOCK_BYTES) {
    throw new Error('运行时 AI 协议块超长：含标记与内部换行至多 32 KiB（UTF-8）');
  }
  if (insideCodeFence(text.slice(0, match.index))) {
    throw new Error('协议块须位于消息正文，禁止包在 Markdown 代码围栏内');
  }

  let value: unknown;
  try {
    value = JSON.parse(match[1]!);
  } catch {
    throw new Error('协议块 JSON 格式错误：请使用合法 JSON，去掉注释、尾随逗号与代码围栏');
  }
  if (!isObject(value)) throw new Error('协议块 JSON 必须是对象');
  const unknown = Object.keys(value).filter(key => !ENCOUNTER_FIELDS.includes(key));
  if (unknown.length) throw new Error(`协议块含未知字段：${unknown.join('、')}；仅允许 version、difficulty、enemyDesigns`);
  if (value.version !== undefined && value.version !== 1) throw new Error('协议 version 必须为数字 1');
  if (value.difficulty !== undefined && typeof value.difficulty !== 'string') throw new Error('协议 difficulty 必须为字符串难度标签');
  if (!Array.isArray(value.enemyDesigns) || value.enemyDesigns.length < 1 || value.enemyDesigns.length > 4) {
    throw new Error('协议 enemyDesigns 必须为 1 至 4 名敌人的数组');
  }

  const enemyDesigns = value.enemyDesigns.map((input: unknown, index: number) => {
    const path = `enemyDesigns[${index}]`;
    if (!isObject(input)) throw new Error(`${path} 必须是语义敌人对象`);
    if (input.assembly !== undefined && input.assembly !== 'classified') {
      throw new Error(`${path}.assembly 由程序固定为 classified`);
    }
    try {
      // Role guides automatic weighted assembly; omitted effects carry no extra intent.
      // Preserve explicit legacy fields so existing message request hashes still match.
      const effects = Array.isArray(input.effects)
        ? input.effects.map(effect => typeof effect === 'string' ? {effect, requirement: 'required'} : effect)
        : input.effects === undefined ? [] : input.effects;
      return parseEnemyDesignInput({...input, difficulty: input.difficulty === undefined ? 1 : input.difficulty, effects, assembly: 'classified'});
    } catch (error) {
      throw new Error(`${path} 校验失败：${error instanceof Error ? error.message : String(error)}`);
    }
  });
  // Temporary base configuration; independent difficulty and HP tuning are deferred.
  return {version: 1, difficulty: value.difficulty === undefined ? '基础' : value.difficulty as string, enemyDesigns};
}

/** Task-oriented runtime instructions; choices share the compiler vocabulary. */
export function runtimeAiPrompt(): string {
  const vocabulary = ENEMY_DESIGN_VOCABULARY;
  const {fields} = vocabulary;
  const choices = (entries: readonly {key: string; label: string}[]) => entries
    .map(entry => entry.key === entry.label ? entry.key : `${entry.key}（${entry.label}）`).join('、');
  const {manaColors, rank, form, role, level} = DEFAULT_ENEMY_DESIGN_INPUT;
  const example = {enemyDesigns: [{name: '遗迹守卫', race: '人类', manaColors, rank, form, role, level}]};
  return [
    '<%_;(() => {',
    "const __match3_stat_data = getMessageVar('stat_data', { defaults: {} }) || {};",
    "const __match3_enabled = _.get(__match3_stat_data, '系统配置.三消战斗模式', false) === true;",
    "const __match3_context_hidden = _.get(__match3_stat_data, '系统配置.屏蔽战斗上下文', false) === true;",
    'if (__match3_enabled && !__match3_context_hidden) {',
    '_%>',
    '<三消战斗规则>',
    '任务：判断剧情是否进入战斗，配置敌人并输出入口，等待玩家操作，再接收真实战报续写剧情。',
    '',
    '# 第一阶段：判断是否触发',
    '1. 玩家决定交战，或敌方已发动必须应对的攻击时，进入战前准备。',
    '2. 仅发现敌人、对峙、交涉或尚在潜行时，继续当前剧情，暂不生成战斗块。',
    '',
    '# 第二阶段：交代战况并配置敌人',
    '1. 简述交战原因、双方处境与战斗目的，停在交锋前。按 E1、E2…列出敌人的身份与可见外观；enemyDesigns 按相同顺序填写，战报 enemy-1、enemy-2…依次对应这些人物。',
    '2. 本场配置 1～4 名敌人；按剧情选定最高阶级并确定下方队形，再逐个填写参数。队形只确定一次，随从不按自身阶级重复添加随从。',
    '3. 姓名、种族同时填写到战斗块，与正文一致，供战斗页面显示；外观在正文交代；3 个及以上同类型敌人须混合不同兵种，禁止克隆人配置。',
    '4. 我方成员、顺序、武器和能力由玩家在战前页面调整；你只配置敌方。',
    '',
    '阶级定位与队形：',
    '  杂兵：普通怪物，成群出现（1d3 个）。',
    '  精锐：精英/绿名怪，1 个精锐带 1d3 个杂兵出现。',
    '  首领：普通副本关底 BOSS，通常单独出现，极少数与精锐一起。',
    '  领主：大区域守关 BOSS，单独出现。',
    '  传奇：剧情高潮节点/世界唯一。',
    '',
    '每名敌人只填以下七项：',
    '  - name：该敌人的姓名；无姓名时填正文使用的称呼，同名单位可用编号区分。',
    '  - race：该敌人在当前世界观中的种族名称。',
    `  - rank：${choices(vocabulary.ranks)}；表示该成员的个体阶级。`,
    `  - level：${fields.level.min}～${fields.level.max} 的整数；按当前区域等级和任务难度确定，不与玩家等级挂钩。`,
    `  - form：${choices(vocabulary.forms)}；按外形选，人脸人身归人形，非人脸的直立身体归类人。`,
    `  - role：${choices(vocabulary.roles)}；选最贴近作战方式的一项，技能由程序生成。`,
    '    输出侧重直接杀伤，战士侧重近战与自身攻防；法师侧重法术打击，术士侧重削弱控制；供魔侧重法力和棋盘资源，辅助侧重治疗与团队增益。',
    `  - manaColors：从 ${choices(vocabulary.manaColors)} 中选择互不重复的法力颜色；杂兵单色，精锐、首领、领主双色，传奇三色。`,
    '',
    '# 第三阶段：输出战斗入口并等待',
    '1. 战前正文后按示例输出一个战斗块，顶层只填 enemyDesigns。',
    '2. 两个标记各占一行，中间为合法 JSON；直接写入正文，不加 Markdown 代码围栏、注释或额外字段。每条回复最多一块。',
    '3. 输出结束标记后立即结束回复，等待玩家操作。后续准备、编队问答保持待战，沿用原入口，别重复生成本场战斗块。',
    '4. 战斗过程与结算交给战斗页面；收到真实战报前，不预演回合、自行扣 HP、判胜负或发奖。',
    '',
    '# 第四阶段：接收战报并续写剧情',
    '1. 接收程序提供的本场战报，根据战报续写战后剧情，承接战前的事件与人物关系。',
    '2. 将胜负、击败的敌人、队友倒下情况和生命损伤融入描写。战斗事实以战报为准，不补造回合过程、招式或奖励；可继续人物反应与后续事件。',
    '',
    '战斗块示例：',
    '<match3>',
    JSON.stringify(example, null, 2),
    '</match3>',
    '</三消战斗规则>',
    '',
    '<%_ }',
    '})(); _%>',
  ].join('\n');
}
