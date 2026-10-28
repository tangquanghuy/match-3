import {test,expect} from '@playwright/test';
import type {Frame,Page} from '@playwright/test';
import type {StHostHandle} from '../../src/sillytavern/hostEntry';
import type {TavernContext} from '../../src/sillytavern/hostAdapter';

// These helper globals reproduce the official mirrored SillyTavern API for window
// selection regressions. They are not real ST/Helper/MVU integration acceptance;
// that evidence lives in .tmp/st-release-independent-20261024/.
type LoaderFixtureWindow=Window&{
 SillyTavern:{getContext():TavernContext};
 match3Host?:StHostHandle;
 loaderErrors:string[];
};

async function prepareLoader(page:Page):Promise<string>{
 await page.goto('/sillytavern-install.html');
 await page.evaluate(()=>{
  const context={characterId:0,characters:[{avatar:'loader-fixture.png'}],chat:[{swipe_id:0}],getCurrentChatId:()=> 'loader-window-regression'};
  Object.assign(window,{SillyTavern:{getContext:()=>context},loaderErrors:[]});
 });
 // Vite serves the real host implementation as TS; production exposes this ESM
 // entry at sillytavern-host.js. Only the entry URL is adapted for this test.
 await page.route('**/sillytavern-host.js',route=>route.fulfill({
  contentType:'text/javascript',body:'export {installStHost} from "/src/sillytavern/hostEntry.ts";',
 }));
 return page.evaluate(async()=>{
  const path='/src/sillytavern/installer.ts';
  const {createStLoaderArtifacts}=await import(/* @vite-ignore */path) as typeof import('../../src/sillytavern/installer');
  return createStLoaderArtifacts(new URL('./',location.href).href).source;
 });
}

async function mirroredHelper(page:Page,parent:Page|Frame,name:string):Promise<Frame>{
 await parent.evaluate(name=>{
  const iframe=document.createElement('iframe');iframe.id=name;iframe.name=name;
  iframe.hidden=true;iframe.srcdoc='<!doctype html><html><body></body></html>';
  document.body.append(iframe);
 },name);
 await expect.poll(()=>page.frame({name})?.url()).toBe('about:srcdoc');
 const frame=page.frame({name})!;
 await frame.evaluate(()=>{
  const host=window.top as LoaderFixtureWindow;
  // Official predefine.js gives even hidden helper frames this same API.
  Object.defineProperty(window,'SillyTavern',{get:()=>({getContext:()=>host.SillyTavern.getContext()})});
  let variables:Record<string,unknown>={};
  Object.assign(window,{
   waitGlobalInitialized:async()=>{},
   getVariables:()=>variables,
   updateVariablesWith:(updater:(value:Record<string,unknown>)=>Record<string,unknown>)=>{variables=updater(variables);},
   Mvu:{getMvuData:()=>({stat_data:{人物:{名称:'定位探针'}}}),replaceMvuData:async()=>{}},
   toastr:{error:(message:string)=>{host.loaderErrors.push(message);}},
  });
 });
 return frame;
}

async function runLoader(frame:Frame,source:string):Promise<void>{
 await frame.evaluate(source=>{
  const script=document.createElement('script');script.type='module';script.textContent=source;document.body.append(script);
 },source);
}

for(const depth of [1,2]){
 test(`loader selects the outer Tavern through ${depth} mirrored helper frame(s) and cleans up native unload`,async({page})=>{
  test.setTimeout(45000);
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const source=await prepareLoader(page);
  const outer=await mirroredHelper(page,page,'loader-outer');
  const helper=depth===1?outer:await mirroredHelper(page,outer,'loader-inner');
  await runLoader(helper,source);
  const root=page.locator('#st-match3-host-root');
  await expect(root).toHaveCount(1,{timeout:20000});
  await expect(root.getByRole('button',{name:'三消存档',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>typeof (window as unknown as LoaderFixtureWindow).match3Host?.open)).toBe('function');
  for(const frame of depth===1?[helper]:[outer,helper]){
   expect(await frame.locator('#st-match3-host-root').count()).toBe(0);
  }
  expect(await helper.evaluate(()=>{
   const host=window.top as LoaderFixtureWindow;
   // The loader keeps a local alias; the published handle must belong to top.
   return (window as unknown as LoaderFixtureWindow).match3Host===host.match3Host;
  })).toBe(true);
  if(depth===2)expect(await outer.evaluate(()=>!!(window as unknown as LoaderFixtureWindow).match3Host)).toBe(false);
  expect(await page.evaluate(()=>(window as unknown as LoaderFixtureWindow).loaderErrors)).toEqual([]);

  // Removing the actual iframe triggers native pagehide, rather than manually
  // dispatching the cleanup event that the test is meant to verify.
  await page.locator('#loader-outer').evaluate(iframe=>iframe.remove());
  await expect(root).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>!!(window as unknown as LoaderFixtureWindow).match3Host)).toBe(false);

  // A new script instance must install cleanly after the previous frame unloads.
  const replacement=await mirroredHelper(page,page,'loader-replacement');
  await runLoader(replacement,source);
  await expect(root).toHaveCount(1,{timeout:20000});
  await expect(root.getByRole('button',{name:'三消存档',exact:true})).toBeVisible();
  await page.locator('#loader-replacement').evaluate(iframe=>iframe.remove());
  await expect(root).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>!!(window as unknown as LoaderFixtureWindow).match3Host)).toBe(false);
  expect(await page.evaluate(()=>(window as unknown as LoaderFixtureWindow).loaderErrors)).toEqual([]);
  expect(errors).toEqual([]);
 });
}

test('copying without the Clipboard API expands and selects the current loader',async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 // Plain HTTP browsers omit this API; explicitly blocking it makes that browser
 // capability reproducible on the secure localhost used by the test runner.
 await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true}));
 await page.goto('/sillytavern-install.html');
 const textarea=page.locator('#loader-source');const source=await textarea.inputValue();
 await expect(page.locator('details')).not.toHaveAttribute('open','');
 await page.getByRole('button',{name:'复制加载器',exact:true}).click();
 await expect(page.locator('details')).toHaveAttribute('open','');
 await expect(page.getByRole('status')).toHaveText('已选中加载器，请复制。');
 await expect(textarea).toBeFocused();
 expect(await textarea.evaluate((element:HTMLTextAreaElement)=>({start:element.selectionStart,end:element.selectionEnd}))).toEqual({start:0,end:source.length});
 expect(source).toContain(new URL('./',page.url()).href);
 expect(source).not.toContain('YOUR_MATCH3_HOST');
 expect(errors).toEqual([]);
});

