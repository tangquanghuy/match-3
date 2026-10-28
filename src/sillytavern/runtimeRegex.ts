/** Create an ST display regex; encounter data stays in the original message. */
export function createRuntimeRegex(baseUrl: string) {
  const base = new URL(baseUrl);
  if (
    !['http:', 'https:'].includes(base.protocol)
    || base.username || base.password
    || base.href.includes('?') || base.href.includes('#')
  ) {
    throw new Error('请使用不含用户名、密码、查询参数或片段的 HTTP 或 HTTPS 部署目录');
  }
  if (!base.pathname.endsWith('/')) base.pathname += '/';

  // ST also expands $0/$1 in replacements. Encode dollars before quoting the URL.
  const moduleUrl = "'" + new URL('sillytavern-message.js', base).href.replace(/\$/g, '%24')
    .replace(/'/g, '\\u0027').replace(/</g, '\\u003c') + "'";

  return {
    id: 'c73f89e4-0bca-4eb8-b51f-dd24b70c890a',
    scriptName: '三消·正文战斗入口 v1',
    findRegex: '/<match3>\\s*[\\s\\S]*?\\s*<\\/match3>/g',
    replaceString: [
      '```html',
      '<body>',
      "<div id='match3-message' style='min-height:64px;color:#e5e7eb;font:14px/1.5 system-ui,sans-serif'><p role='status'>正在加载三消战斗入口…</p></div>",
      "<script type='module'>",
      "const root=document.getElementById('match3-message');",
      'try{',
      `  const{mountMessageEncounter}=await import(${moduleUrl});`,
      '  await mountMessageEncounter({runtimeWindow:window,messageId:getCurrentMessageId(),root});',
      '}catch(error){',
      "  root.textContent='三消战斗入口加载失败：'+(error instanceof Error?error.message:String(error));",
      '}',
      '</script>',
      '</body>',
      '```',
    ].join('\n'),
    placement: [2],
    disabled: false,
    markdownOnly: true,
    promptOnly: false,
    runOnEdit: true,
    substituteRegex: 0,
    trimStrings: [],
    minDepth: null,
    maxDepth: null,
  };
}
