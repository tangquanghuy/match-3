import editableRuntimePrompt from '../../docs/sillytavern-runtime-ai-prompt.md?raw';
import runtimeProtocolDocumentation from '../../docs/sillytavern-runtime-ai.md?raw';
import {describe, expect, it} from 'vitest';
import {compileEnemyEncounterPlan, DEFAULT_ENEMY_DESIGN_INPUT, ENEMY_DESIGN_VOCABULARY, restoreEnemyDesign} from '../../src/sillytavern/enemyDesign';
import {MATCH3_BLOCK_PATTERN, parseRuntimeEncounter, runtimeAiPrompt} from '../../src/sillytavern/runtimeProtocol';

const enemy = () => ({...structuredClone(DEFAULT_ENEMY_DESIGN_INPUT), assembly: 'classified'});
const plan = () => ({version: 1, difficulty: '普通', enemyDesigns: [enemy()]});
const block = (value: unknown = plan()) => `<match3>\n${JSON.stringify(value)}\n</match3>`;
const MAX_BYTES = 32 * 1024;

function paddedBlock(bytes: number, unicode = '普通'): string {
  const message = block({...plan(), difficulty: unicode});
  const padding = ' '.repeat(bytes - new TextEncoder().encode(message).byteLength);
  return message.replace('\n</match3>', padding + '\n</match3>');
}

describe('runtime assistant encounter protocol', () => {
  const simpleEnemy = () => ({manaColors: ['Red'], rank: '杂兵', form: '人形', role: 'Striker', level: 20});

  it('normalizes the minimal AI payload to the existing compiler contract', () => {
    const input = {enemyDesigns: [simpleEnemy()]};
    const parsed = parseRuntimeEncounter(block(input));
    expect(parsed).toEqual({version: 1, difficulty: '基础', enemyDesigns: [{
      ...simpleEnemy(), difficulty: 1, assembly: 'classified', effects: [],
    }]});
    expect(input).toEqual({enemyDesigns: [simpleEnemy()]});
  });

  it.each([1, 2, 3, 4])('normalizes %i minimal enemies without touching the input', count => {
    const inputs = Array.from({length: count}, simpleEnemy);
    const original = structuredClone(inputs);
    const parsed = parseRuntimeEncounter(block({enemyDesigns: inputs}));
    expect(parsed.enemyDesigns).toHaveLength(count);
    for (const design of parsed.enemyDesigns) {
      expect(design.difficulty).toBe(1);
      expect(design.assembly).toBe('classified');
      expect(design.effects).toEqual([]);
      expect(design).not.toHaveProperty('storyWeight');
    }
    expect(inputs).toEqual(original);
  });

  it.each([{effects: ['damage', 'damageReduction']}, {effects: ['damage', 'damageReduction', 'heal']}])('assembles every explicit legacy effect in $effects', ({effects}) => {
    const input = {enemyDesigns: [{...simpleEnemy(), effects}]};
    const original = structuredClone(input);
    const parsed = parseRuntimeEncounter(block(input));
    expect(parsed.enemyDesigns[0]!.effects).toEqual(effects.map(effect => ({effect, requirement: 'required'})));
    const encounter = compileEnemyEncounterPlan(parsed.enemyDesigns, {seed: 6004});
    const member = encounter.members[0]!;
    expect(member.signature.effects).toEqual(expect.arrayContaining(effects));
    expect(member.blueprint.assembly).toBeDefined();
    expect(restoreEnemyDesign(JSON.parse(JSON.stringify(member)))).toEqual(member);
    expect(input).toEqual(original);
  });

  it('accepts every distinct vocabulary entry without truncating the requested effects', () => {
    const effects = ENEMY_DESIGN_VOCABULARY.effects.map(entry => entry.key);
    const parsed = parseRuntimeEncounter(block({enemyDesigns: [{...simpleEnemy(), effects}]}));
    expect(parsed.enemyDesigns[0]!.effects.map(item => item.effect)).toEqual(effects);
  });

  it.each(ENEMY_DESIGN_VOCABULARY.roles)('keeps omitted or empty effects as empty intent for $key', ({key: role}) => {
    const input = {...simpleEnemy(), manaColors: ['Blue', 'Purple'], rank: '精锐', form: '类人', role, level: 37};
    for (const design of [input, {...input, effects: []}]) {
      const original = structuredClone(design);
      const parsed = parseRuntimeEncounter(block({enemyDesigns: [design]}));
      expect(parsed.enemyDesigns).toEqual([{...input, difficulty: 1, assembly: 'classified', effects: []}]);
      expect(design).toEqual(original);
    }
  });

  it.each([['madeUp'], ['damage', 'damage'], [1], [null], 'damage', null])('validates simplified effects: %j', effects => {
    expect(() => parseRuntimeEncounter(block({enemyDesigns: [{...simpleEnemy(), effects}]}))).toThrow('enemyDesigns[0] 校验失败');
  });

  it('preserves legacy plans exactly so pending and settled message identities do not change', () => {
    const legacy = plan();
    legacy.difficulty = '旧遭遇';
    legacy.enemyDesigns[0]!.difficulty = 2.5;
    legacy.enemyDesigns[0]!.storyWeight = 3;
    legacy.enemyDesigns[0]!.effects = [{effect: 'damage', requirement: 'preferred'}, {effect: 'barrier', requirement: 'required'}];
    expect(parseRuntimeEncounter(block(legacy))).toEqual(legacy);
  });

  it.each([1, 2, 3, 4])('accepts %i classified enemies from a complete message', count => {
    const value = {...plan(), enemyDesigns: Array.from({length: count}, enemy)};
    expect(parseRuntimeEncounter(`遭遇守卫。\n\n${block(value)}\n`)).toEqual(value);
  });

  it.each([1, 2, 3, 4])('supplies classified assembly for %i enemies when AI omits it', count => {
    const inputs = Array.from({length: count}, () => {
      const input = structuredClone(DEFAULT_ENEMY_DESIGN_INPUT);
      delete input.assembly;
      return input;
    });
    const value = {...plan(), enemyDesigns: inputs};
    expect(parseRuntimeEncounter(block(value))).toEqual({...plan(), enemyDesigns: Array.from({length: count}, enemy)});
    expect(inputs.every(input => input.assembly === undefined)).toBe(true);
  });

  it('accepts CRLF, pretty JSON, optional narrative weight and all six colors', () => {
    const value = plan();
    value.enemyDesigns[0]!.manaColors = ENEMY_DESIGN_VOCABULARY.manaColors.map(entry => entry.key);
    value.enemyDesigns[0]!.effects = [];
    value.enemyDesigns[0]!.storyWeight = 0;
    const text = `<match3>\n${JSON.stringify(value, null, 2)}\n</match3>`.replaceAll('\n', '\r\n');
    expect(parseRuntimeEncounter(text)).toEqual(value);
  });

  it('exports a source without delimiters or flags and captures only JSON', () => {
    const pattern = new RegExp(MATCH3_BLOCK_PATTERN);
    expect(pattern.flags).toBe('');
    expect(JSON.parse(pattern.exec(`前文\n${block()}\n后文`)![1]!)).toEqual(plan());
    expect(new RegExp(MATCH3_BLOCK_PATTERN).test(block())).toBe(true);
  });

  it.each(['', '只有普通正文', '[MATCH3]\n{}\n[/MATCH3]'])('reports a missing block: %s', text => {
    expect(() => parseRuntimeEncounter(text)).toThrow('缺少 <match3>');
  });

  it.each([
    '前文' + block(), block() + '后文', block().replace('<match3>\n', '<match3>'),
    block().replace('\n</match3>', '</match3>'), block().replace('<match3>', ' <match3>'),
  ])('requires exact standalone delimiter lines', text => {
    expect(() => parseRuntimeEncounter(text)).toThrow('独立一行');
  });

  it.each(['```json', '~~~json'])('rejects a block inside %s fences', fence => {
    const end = fence.startsWith('`') ? '```' : '~~~';
    expect(() => parseRuntimeEncounter(`${fence}\n${block()}\n${end}`)).toThrow('消息正文');
    expect(parseRuntimeEncounter(`${fence}\n示例文字\n${end}\n${block()}`)).toEqual(plan());
  });

  it('rejects a second block anywhere in the original message', () => {
    const text = `${block()}\n正文\n${block()}`;
    expect(new RegExp(MATCH3_BLOCK_PATTERN).test(text)).toBe(true);
    expect(() => parseRuntimeEncounter(text)).toThrow('最多一个');
    expect(() => parseRuntimeEncounter(`${block()}\n尾部 <match3>`)).toThrow('最多一个');
  });

  it.each([
    '<match3>\n<match3>\n{}\n</match3>\n</match3>',
    block({...plan(), difficulty: '<match3>'}),
  ])('rejects nested markers, including literal markers inside JSON strings', text => {
    expect(() => parseRuntimeEncounter(text)).toThrow('嵌套');
  });

  it.each([
    ['<match3>\n{}', '缺少结束标记'],
    ['</match3>', '标记不配对'],
    [`${block()}\n</match3>`, '标记不配对'],
  ])('reports unbalanced markers', (text, error) => {
    expect(() => parseRuntimeEncounter(text)).toThrow(error);
  });

  it.each(['', '{', '{"version":1,}', '// comment\n{}', '```json\n{}\n```'])('reports malformed JSON', json => {
    expect(() => parseRuntimeEncounter(`<match3>\n${json}\n</match3>`)).toThrow('JSON 格式错误');
  });

  it.each([null, [], 'value', 1, true])('requires an object, got %j', value => {
    expect(() => parseRuntimeEncounter(block(value))).toThrow('JSON 必须是对象');
  });

  it.each([null, '1', 0, 2])('validates an explicit legacy version', version => {
    expect(() => parseRuntimeEncounter(block({...plan(), version}))).toThrow('version 必须');
  });

  it.each([null, 1, {}, []])('validates an explicit legacy difficulty label', difficulty => {
    expect(() => parseRuntimeEncounter(block({...plan(), difficulty}))).toThrow('difficulty 必须为字符串');
  });

  it('preserves arbitrary string labels and separates the enemy numeric multiplier', () => {
    const value = {...plan(), difficulty: '剧情自定义难度 2 / 极难'};
    expect(parseRuntimeEncounter(block(value))).toEqual(value);
  });

  it.each([undefined, null, {}, [], Array.from({length: 5}, enemy)])('requires 1..4 designs', enemyDesigns => {
    expect(() => parseRuntimeEncounter(block({...plan(), enemyDesigns}))).toThrow('1 至 4');
  });

  it.each(['seed', 'rules', 'budgetPolicy', 'enemies', 'externalId', 'unknown', '__proto__'])('rejects unknown top-level %s', field => {
    expect(() => parseRuntimeEncounter(block({...plan(), [field]: 1}))).toThrow(`未知字段：${field}`);
  });

  it.each([null, [], 1])('requires each design to be an object', input => {
    expect(() => parseRuntimeEncounter(block({...plan(), enemyDesigns: [input]}))).toThrow('enemyDesigns[0] 必须');
  });

  it.each([null, 'native', 'CLASSIFIED'])('rejects a conflicting assembly value', assembly => {
    expect(() => parseRuntimeEncounter(block({...plan(), enemyDesigns: [{...enemy(), assembly}]}))).toThrow('enemyDesigns[0].assembly');
  });

  it.each(['seed', 'rules', 'budgetPolicy', 'enemies', 'troopId', 'portraitId', 'recipeId', 'traitIds', 'externalId', 'unknown'])('delegates enemy field rejection for %s', field => {
    expect(() => parseRuntimeEncounter(block({...plan(), enemyDesigns: [{...enemy(), [field]: 'injected'}]}))).toThrow(field);
  });

  it.each([
    {manaColors: []}, {manaColors: ['Red', 'Red']}, {manaColors: ['Fire']},
    {rank: '未知档位'}, {form: '未知形态'}, {role: 'UnknownRole'},
    {level: 0}, {level: 101}, {level: 1.5}, {difficulty: null}, {difficulty: 0.09}, {difficulty: 10.01}, {storyWeight: -1},
    {effects: [{effect: 'madeUp', requirement: 'required'}]},
    {effects: [{effect: 'damage', requirement: 'optional'}]},
    {effects: [{effect: 'damage', requirement: 'required', internalId: 1}]},
    {effects: [{effect: 'damage', requirement: 'required'}, {effect: 'damage', requirement: 'preferred'}]},
  ])('reuses semantic validation and identifies the failing member: %j', invalid => {
    expect(() => parseRuntimeEncounter(block({...plan(), enemyDesigns: [enemy(), {...enemy(), ...invalid}]}))).toThrow('enemyDesigns[1] 校验失败');
  });

  it('accepts an exact 32 KiB block and rejects one byte more', () => {
    expect(parseRuntimeEncounter(paddedBlock(MAX_BYTES))).toEqual(plan());
    expect(() => parseRuntimeEncounter(paddedBlock(MAX_BYTES + 1))).toThrow('32 KiB');
  });

  it('accepts long narrative before and after a block and does not charge separator newlines', () => {
    const narrative = '长正文😀'.repeat(20000);
    expect(parseRuntimeEncounter(`${narrative}\n${block()}\n${narrative}`)).toEqual(plan());
    expect(parseRuntimeEncounter(`${narrative}\r\n${paddedBlock(MAX_BYTES)}\r\n${narrative}`)).toEqual(plan());
  });
  it('counts UTF-8 bytes rather than UTF-16 length inside the block', () => {
    const exact = paddedBlock(MAX_BYTES, '守卫😀');
    expect(new TextEncoder().encode(exact).byteLength).toBe(MAX_BYTES);
    expect(parseRuntimeEncounter(exact).difficulty).toBe('守卫😀');
    expect(() => parseRuntimeEncounter(paddedBlock(MAX_BYTES + 1, '守卫😀'))).toThrow('超长');
    const oversized = block({...plan(), difficulty: '中'.repeat(11000)});
    expect(oversized.length).toBeLessThan(MAX_BYTES);
    expect(() => parseRuntimeEncounter(oversized)).toThrow('超长');
  });
});

describe.each([
  {source: 'generated prompt', readPrompt: runtimeAiPrompt},
  {source: 'editable EJS prompt', readPrompt: () => editableRuntimePrompt},
])('runtime AI instructions: $source', ({readPrompt}) => {
  it('contains the shared legal choices with their runtime labels', () => {
    const prompt = readPrompt();
    for (const entries of [ENEMY_DESIGN_VOCABULARY.manaColors, ENEMY_DESIGN_VOCABULARY.ranks,
      ENEMY_DESIGN_VOCABULARY.forms, ENEMY_DESIGN_VOCABULARY.roles]) {
      for (const entry of entries) expect(prompt).toContain(entry.key);
    }
    for (const entry of ENEMY_DESIGN_VOCABULARY.roles) {
      expect(prompt).toContain(`${entry.key}（${entry.label}）`);
    }
    expect(prompt).not.toMatch(/src[\\/]|game-assets[\\/]|D:[\\/]/);
    expect(prompt).not.toMatch(/待标定|未完成环节|整版链路|不承诺五档/);
    expect(prompt).not.toContain('get_message_variable::');
  });

  it('keeps only task instructions and the required output format', () => {
    const prompt = readPrompt();
    expect(prompt).not.toMatch(/32\s*KiB|32768|UTF-?8|字节|块大小|块.{0,4}上限/);
    expect(prompt).not.toMatch(/内置权重|随机种子|行动轴|DiceCombat|CombatSnapshot|立绘选择|Step[12]_/);
    expect(prompt).toContain('每名敌人只填以下七项');
    expect(prompt).toContain('顶层只填 enemyDesigns');
    expect(prompt).toContain('两个标记各占一行，中间为合法 JSON');
    expect(prompt).toContain('每条回复最多一块');
    expect(prompt).toContain('输出结束标记后立即结束回复，等待玩家操作');
    expect(prompt).toContain('别重复生成本场战斗块');
    expect(prompt).toContain('收到真实战报前，不预演回合');
    expect(prompt).toContain('战斗事实以战报为准，不补造回合过程、招式或奖励');
  });

  it('preserves regional levels, rank identities, color counts and mixed groups', () => {
    const prompt = readPrompt();
    expect(prompt).toContain('本场配置 1～4 名敌人');
    expect(prompt.indexOf('# 第一阶段：判断是否触发')).toBeLessThan(prompt.indexOf('阶级定位与队形'));
    expect(prompt).toContain('按剧情选定最高阶级并确定下方队形，再逐个填写参数');
    expect(prompt).toContain('队形只确定一次，随从不按自身阶级重复添加随从');
    expect(prompt).toContain('表示该成员的个体阶级');
    expect(prompt).toContain('按当前区域等级和任务难度确定，不与玩家等级挂钩');
    expect(prompt).toContain(`level：${ENEMY_DESIGN_VOCABULARY.fields.level.min}～${ENEMY_DESIGN_VOCABULARY.fields.level.max} 的整数`);
    expect(prompt).toContain('3 个及以上同类型敌人须混合不同兵种，禁止克隆人配置');
    for (const rule of ['杂兵：普通怪物，成群出现（1d3 个）',
      '精锐：精英/绿名怪，1 个精锐带 1d3 个杂兵出现',
      '首领：普通副本关底 BOSS，通常单独出现，极少数与精锐一起',
      '领主：大区域守关 BOSS，单独出现', '传奇：剧情高潮节点/世界唯一',
      '杂兵单色，精锐、首领、领主双色，传奇三色']) {
      expect(prompt).toContain(rule);
    }
    expect(prompt).not.toContain('<敌人可用组合>');
  });

  it.each([
    {statData: {}, enabled: false},
    {statData: {系统配置: {}}, enabled: false},
    {statData: {系统配置: {三消战斗模式: false}}, enabled: false},
    {statData: {系统配置: {三消战斗模式: 'true'}}, enabled: false},
    {statData: {系统配置: {三消战斗模式: 1}}, enabled: false},
    {statData: {系统配置: {三消战斗模式: true}}, enabled: true},
    {statData: {系统配置: {三消战斗模式: true, 屏蔽战斗上下文: false}}, enabled: true},
    {statData: {系统配置: {三消战斗模式: true, 屏蔽战斗上下文: true}}, enabled: false},
    {statData: {系统配置: {三消战斗模式: true, 屏蔽战斗上下文: 'true'}}, enabled: true},
  ])('gates rules before AI receives the EJS output: $statData', ({statData, enabled}) => {
    const prompt = readPrompt();
    const segments = /^<%_([\s\S]*?)_%>([\s\S]*?)<%_([\s\S]*?)_%>$/.exec(prompt)!;
    const render = new Function('getMessageVar', '_',
      `let output = ''; ${segments[1]} output += ${JSON.stringify(segments[2])}; ${segments[3]} return output;`);
    const rendered = render((name: string, options: {defaults: object}) => {
      expect(name).toBe('stat_data');
      expect(options).toEqual({defaults: {}});
      return statData;
    }, {get: (value: {系统配置?: Record<string, unknown>}, key: string, fallback: unknown) => {
      expect(key).toMatch(/^系统配置\.(三消战斗模式|屏蔽战斗上下文)$/);
      return value.系统配置?.[key.split('.')[1]!] ?? fallback;
    }}) as string;
    if (enabled) {
      expect(rendered).toContain('<三消战斗规则>');
      expect(rendered).not.toMatch(/getMessageVar|__match3_|系统配置|<%|%>/);
      expect(parseRuntimeEncounter(rendered)).toEqual(parseRuntimeEncounter(prompt));
    } else {
      expect(rendered).toBe('');
    }
  });

  it('includes a valid example and assigns AI report narration without host bookkeeping', () => {
    const prompt = readPrompt();
    const expected = {...enemy(), name: '遗迹守卫', race: '人类'};
    delete expected.storyWeight;
    expected.effects = [];
    expect(parseRuntimeEncounter(prompt)).toEqual({version: 1, difficulty: '基础', enemyDesigns: [expected]});
    expect(prompt).not.toMatch(/effects|version|difficulty|storyWeight|requirement|required|preferred/);
    expect(prompt).not.toMatch(/效果键|随机权重|机制数量|通常选 1～2/);
    expect(prompt).toContain('技能由程序生成');
    expect(prompt).toContain('互不重复的法力颜色');
    expect(prompt).toContain('可继续人物反应与后续事件');
    const payload = JSON.parse(new RegExp(MATCH3_BLOCK_PATTERN).exec(prompt)![1]!) as {enemyDesigns: Record<string, unknown>[]};
    expect(Object.keys(payload)).toEqual(['enemyDesigns']);
    expect(Object.keys(payload.enemyDesigns[0]!).sort()).toEqual(['form', 'level', 'manaColors', 'name', 'race', 'rank', 'role']);
    expect(prompt).not.toContain('assembly');
    expect(prompt).not.toContain('classified');
    expect(prompt).not.toMatch(/读取当前变量|上下文未给出当前值|玩家明确选择原生 AIRP/);
    expect(prompt).toContain("getMessageVar('stat_data', { defaults: {} })");
    expect(prompt).toContain('系统配置.三消战斗模式');
    expect(prompt).toContain('系统配置.屏蔽战斗上下文');
    expect(prompt).not.toMatch(/battleId|requestId|stat_data\.三消战果|match3\.storyResults|结算收据|往昔再现/);
    for (const instruction of ['玩家决定交战',
      '交锋前', 'E1、E2', 'enemy-1、enemy-2', '保持待战', '扣 HP', '判胜负',
      '接收程序提供的本场战报', '根据战报续写战后剧情', '承接战前的事件与人物关系']) {
      expect(prompt).toContain(instruction);
    }
  });
});

describe('runtime AI protocol documentation', () => {
  it('keeps the downloadable prompt identical to the editable prompt', () => {
    expect(runtimeAiPrompt()).toBe(editableRuntimePrompt);
    expect(runtimeAiPrompt()).toContain('不与玩家等级挂钩');
    expect(runtimeAiPrompt()).toContain('禁止克隆人配置');
    expect(runtimeAiPrompt()).not.toContain('<敌人可用组合>');
  });
  it('documents byte limits as parser behavior and records each prompt review decision', () => {
    expect(runtimeProtocolDocumentation).toContain('以下为程序解析器限制，不写入面向 AI 的提示词');
    expect(runtimeProtocolDocumentation).toContain('32768 个 UTF-8 字节');
    expect(runtimeProtocolDocumentation).toContain('| 原文 | 为何无用或冗余 | 处理 |');
    expect(runtimeProtocolDocumentation).toContain('`effects` 由组装器自动生成');
  });
  it('uses the same minimal encounter fields in the public example', () => {
    const documentation = runtimeProtocolDocumentation;
    const payload = JSON.parse(new RegExp(MATCH3_BLOCK_PATTERN).exec(documentation)![1]!) as {enemyDesigns: Record<string, unknown>[]};
    expect(Object.keys(payload)).toEqual(['enemyDesigns']);
    expect(Object.keys(payload.enemyDesigns[0]!).sort()).toEqual(['form', 'level', 'manaColors', 'name', 'race', 'rank', 'role']);
    expect(parseRuntimeEncounter(block(payload)).enemyDesigns[0]!.effects).toEqual([]);
  });
});
