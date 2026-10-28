import bundledRegex from '../../docs/sillytavern-runtime-regex.json?raw';
import { describe, expect, it } from 'vitest';
import { createRuntimeRegex } from '../../src/sillytavern/runtimeRegex';

function replaceMessage(message: string, script: ReturnType<typeof createRuntimeRegex>): string {
  const lastSlash = script.findRegex.lastIndexOf('/');
  const regex = new RegExp(script.findRegex.slice(1, lastSlash), script.findRegex.slice(lastSlash + 1));
  return message.replace(regex, script.replaceString);
}

function importedModule(script: ReturnType<typeof createRuntimeRegex>): string {
  const match = script.replaceString.match(/\bimport\(('(?:\\.|[^'\\])*')\)/);
  expect(match, 'replacement dynamically imports a quoted module URL').not.toBeNull();
  return JSON.parse('"' + match![1]!.slice(1, -1) + '"');
}

describe('SillyTavern runtime encounter regex', () => {
  it('keeps the manually importable regex identical to the generated deployed configuration', () => {
    const bundled = JSON.parse(bundledRegex);
    expect(bundled).toEqual(createRuntimeRegex('https://match3-tavern-playtest.linjiang-workshop.workers.dev/'));
  });

  it('is recognized as frontend HTML by the official Tavern Helper isFrontend predicate', () => {
    // Matches JS-Slash-Runner/src/util/is_frontend.ts; no local checkout is required in CI.
    const isFrontend = (content: string): boolean => ['html>', '<head>', '<body'].some(tag => content.includes(tag));
    const script = createRuntimeRegex('https://example.org/game/');
    const rendered = replaceMessage('Before\n<match3>\n{}\n</match3>\nAfter', script);
    const html = rendered.match(/```html\n([\s\S]*?)\n```/)?.[1];
    expect(html).toBeDefined();
    expect(isFrontend(html!)).toBe(true);
    expect(html).toMatch(/^<body>\n[\s\S]*\n<\/body>$/);
    expect(isFrontend("<div id='match3-message'></div><script type='module'></script>")).toBe(false);
  });

  it('exports JSON with a stable UUID and the actual ST display-only configuration', () => {
    const script = createRuntimeRegex('https://example.org/game/');
    expect(JSON.parse(JSON.stringify(script))).toEqual({
      id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
      scriptName: '三消·正文战斗入口 v1',
      findRegex: '/<match3>\\s*[\\s\\S]*?\\s*<\\/match3>/g',
      replaceString: expect.any(String),
      placement: [2],
      disabled: false,
      markdownOnly: true,
      promptOnly: false,
      runOnEdit: true,
      substituteRegex: 0,
      trimStrings: [],
      minDepth: null,
      maxDepth: null,
    });
    expect(createRuntimeRegex('http://localhost:8000/other').id).toBe(script.id);
    expect(script.replaceString).toMatch(/^```html\n[\s\S]*\n```$/);
    expect(script.replaceString).toContain("<div id='match3-message'");
    expect(script.replaceString).toContain('正在加载三消战斗入口…');
    expect(script.replaceString).toContain('三消战斗入口加载失败：');
    expect(script.replaceString).not.toContain('"');
    expect(script.replaceString).toContain("<script type='module'>");
    expect(script.replaceString).toContain('await mountMessageEncounter({runtimeWindow:window,messageId:getCurrentMessageId(),root})');
  });

  it('replaces multiline JSON blocks independently while preserving all surrounding prose', () => {
    const script = createRuntimeRegex('https://example.org/');
    const first = '<match3>\n  {\n    "enemy": "史莱姆",\n    "count": 2\n  }\n</match3>';
    const second = '<match3>\r\n{\r\n"enemy":"巨龙"\r\n}\r\n</match3>';
    const message = `战斗前的正文。\n${first}\n两场之间的正文。\n${second}\n战斗后的正文。`;
    expect(replaceMessage(message, script)).toBe(
      `战斗前的正文。\n${script.replaceString}\n两场之间的正文。\n${script.replaceString}\n战斗后的正文。`,
    );
  });

  it.each([
    '普通正文和 {"enemy":"史莱姆"} 保持原样。',
    '未结束的区块：<match3>\n{"enemy":"史莱姆"}',
    '只有闭合标签：</match3>',
  ])('preserves text without a complete encounter block: %s', message => {
    expect(replaceMessage(message, createRuntimeRegex('https://example.org/'))).toBe(message);
  });

  it('never interpolates JSON or malicious script closures into replacement HTML', () => {
    const script = createRuntimeRegex('https://example.org/');
    const payload = '</script><script>globalThis.MESSAGE_PAYLOAD=1</script><img src=x onerror=alert(1)>';
    const body = JSON.stringify({ enemy: payload, tokens: ['$&', '$0', '$1', '$<enemy>', '{{match}}'] }, null, 2);
    const message = `正文前\n<match3>\n${body}\n</match3>\n正文后`;
    const rendered = replaceMessage(message, script);
    expect(rendered).toBe(`正文前\n${script.replaceString}\n正文后`);
    expect(rendered).not.toContain(payload);
    expect(script.replaceString).not.toContain('MESSAGE_PAYLOAD');
    expect(script.replaceString).not.toMatch(/\$(?:\d+|&|<)|\{\{match\}\}/i);
    expect(script.replaceString).not.toContain('innerHTML');
  });

  it.each([
    ['https://example.org', 'https://example.org/sillytavern-message.js'],
    ['https://example.org/game', 'https://example.org/game/sillytavern-message.js'],
    ['https://example.org/game/', 'https://example.org/game/sillytavern-message.js'],
    ['http://127.0.0.1:8000/game', 'http://127.0.0.1:8000/game/sillytavern-message.js'],
    ['https://example.org/a\'b', 'https://example.org/a\'b/sillytavern-message.js'],
    ['https://example.org/"quoted"', 'https://example.org/%22quoted%22/sillytavern-message.js'],
    ['https://example.org/</script>', 'https://example.org/%3C/script%3E/sillytavern-message.js'],
  ])('imports the module from the deployment directory: %s', (base, expected) => {
    expect(importedModule(createRuntimeRegex(base))).toBe(expected);
  });

  it('keeps replacement metacharacters in deployment paths from injecting the original body', () => {
    const script = createRuntimeRegex('https://example.org/$0/$1/$&/$`/$\'/{{match}}/');
    const message = '前<match3>{"secret":"PRIVATE_MESSAGE"}</match3>后';
    expect(replaceMessage(message, script)).toBe(`前${script.replaceString}后`);
    expect(script.replaceString).not.toMatch(/\$(?:\d+|&|`|')|\{\{match\}\}/i);
    expect(decodeURIComponent(new URL(importedModule(script)).pathname))
      .toBe('/$0/$1/$&/$`/$\'/{{match}}/sillytavern-message.js');
  });

  it.each([
    '', '/relative/path', 'example.org/game',
    'file:///tmp/', 'javascript:alert(1)', 'data:text/html,hello', 'ftp://example.org/',
    'https://user:pass@example.org/', 'https://user@example.org/', 'https://:pass@example.org/',
    'https://example.org/?token=x', 'https://example.org/#section',
    'https://example.org/?', 'https://example.org/#',
  ])('rejects a URL outside the deployment directory contract: %s', base => {
    expect(() => createRuntimeRegex(base)).toThrow();
  });
});
