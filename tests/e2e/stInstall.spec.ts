import {test,expect} from '@playwright/test';

test('deployment installation page produces an importable script using its own URL',async({page})=>{
 await page.goto('/sillytavern-install.html');
 await expect(page.getByRole('heading',{name:'在酒馆里开启三消战斗'})).toBeVisible();
 const directory=new URL('./',page.url()).href;
 await expect(page.locator('#deployment-address')).toHaveText(directory);
 const downloadEvent=page.waitForEvent('download');
 await page.getByRole('button',{name:'下载酒馆助手脚本 JSON'}).click();
 const download=await downloadEvent;
 const stream=await download.createReadStream();let body='';for await(const chunk of stream)body+=String(chunk);
 const script=JSON.parse(body);
 expect(script.type).toBe('script');expect(script.enabled).toBe(true);
 expect(script.content).toContain(JSON.stringify(directory));
 expect(script.content).not.toContain('YOUR_MATCH3_HOST');
 await expect(page.getByRole('link',{name:'敌人组装预览'})).toHaveAttribute('href','./sillytavern.html');
});
