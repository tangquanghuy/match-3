import {test,expect} from '@playwright/test';
import {createRuntimeRegex} from '../../src/sillytavern/runtimeRegex';

test('runtime prompt download keeps mana independent of artwork and preserves the editable rules', async ({page}) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/sillytavern-install.html');
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#download-runtime-ai').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('runtime-ai.md');
  const stream = await download.createReadStream();
  const decoder = new TextDecoder();
  let prompt = '';
  for await (const chunk of stream) prompt += decoder.decode(chunk, {stream: true});
  prompt += decoder.decode();
  const editablePrompt=await page.request.get('/docs/sillytavern-runtime-ai-prompt.md');
  expect(editablePrompt.ok()).toBe(true);
  expect(prompt).toBe(await editablePrompt.text());
  expect(prompt).not.toMatch(/32\s*(KiB|KB)|battleId|requestId/);
  expect(prompt).toContain('互不重复的法力颜色');
  expect(prompt.endsWith('})(); _%>')).toBe(true);
  expect(prompt).not.toContain('<敌人可用组合>');
  expect(prompt).toContain('不与玩家等级挂钩');
  expect(prompt).toContain('禁止克隆人配置');
  expect(prompt).toContain('"enemyDesigns":');
  expect(prompt).toContain('<match3>\n');
  expect(prompt).toContain('\n</match3>');
  expect(prompt).not.toContain('[match3]');
  expect(errors).toEqual([]);
});


test('downloaded regex renders the angle-tag encounter block and preserves surrounding text', async ({page}) => {
  await page.goto('/sillytavern-install.html');
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#download-runtime-regex').click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe('runtime-regex.json');
  const stream = await download.createReadStream();
  let body = '';
  for await (const chunk of stream) body += chunk.toString('utf8');
  const script = JSON.parse(body);
  expect(script).toEqual(createRuntimeRegex(new URL('./', page.url()).href));
  const lastSlash = script.findRegex.lastIndexOf('/');
  const pattern = new RegExp(script.findRegex.slice(1, lastSlash), script.findRegex.slice(lastSlash + 1));
  expect('before\n<match3>\n{}\n</match3>\nafter'.replace(pattern, script.replaceString))
    .toBe(`before\n${script.replaceString}\nafter`);
});


test('replacement TXT is decoded HTML ready for the regex editor', async ({page}) => {
  await page.goto('/sillytavern-install.html');
  const pending = page.waitForEvent('download');
  await page.locator('#download-runtime-replacement').click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('runtime-regex-replacement.txt');
  let body = '';
  for await (const chunk of await download.createReadStream()) body += chunk.toString('utf8');
  expect(body).toBe(createRuntimeRegex(new URL('./', page.url()).href).replaceString);
  expect(body).not.toContain('"');
});

for (const scenario of ['loaded', 'module failure', 'helper failure'] as const) {
  test(`executes downloaded regex bootstrap: ${scenario}`, async ({page}) => {
    const errors:string[]=[];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('/sillytavern-install.html');
    const pending=page.waitForEvent('download');
    await page.locator('#download-runtime-regex').click();
    let body='';
    for await(const chunk of await (await pending).createReadStream()) body+=chunk.toString('utf8');
    const rule=JSON.parse(body);
    const moduleUrl=new URL('sillytavern-message.js',page.url()).href;
    await page.route(moduleUrl, async route => {
      if(scenario==='module failure') return route.abort('failed');
      await route.fulfill({contentType:'application/javascript',body:"export {mountMessageEncounter} from '/src/sillytavern/messageEntry.ts';"});
    });
    await page.evaluate(({replacement,scenario})=>{
      const message='<match3>\n'+JSON.stringify({enemyDesigns:[{name:'卡洛斯·灰刃',race:'半精灵',rank:'杂兵',level:20,form:'人形',role:'Striker',manaColors:['Red']}]})+'\n</match3>';
      Object.assign(window,{SillyTavern:{getContext:()=>({characterId:0,characters:[{avatar:'bootstrap.png'}],chat:[{is_user:false,mes:message,send_date:'2026-10-25',swipe_id:0}],getCurrentChatId:()=> 'bootstrap-test'})}});
      const frame=document.createElement('iframe');
      frame.id=frame.name='TH-message--0--0';
      // Tavern Helper binds this function to its iframe before running the HTML.
      const helper="<script>window.getCurrentMessageId=function(){"+(scenario==='helper failure'?"throw Error('helper fixture failed');":"return Number(window.frameElement.id.match(/^TH-message--(\\d+)--/)[1]);")+"};<"+"/script>";
      frame.srcdoc=helper+replacement.replace(/^```html\n|\n```$/g,'');
      document.body.append(frame);
    },{replacement:rule.replaceString,scenario});
    const wrapper=page.frameLocator('iframe[name="TH-message--0--0"]');
    if(scenario==='loaded') {
      // The native lineup carries identity in the unit label; names and race show in the native details.
      await expect(wrapper.frameLocator('iframe[title="剧情三消遭遇"]').getByRole('region',{name:'敌方阵容'}).getByLabel('卡洛斯·灰刃',{exact:true})).toBeVisible();
    } else {
      await expect(wrapper.locator('#match3-message')).toContainText('三消战斗入口加载失败：');
      if(scenario==='helper failure') await expect(wrapper.locator('#match3-message')).toContainText('helper fixture failed');
    }
    expect(errors).toEqual([]);
  });
}
