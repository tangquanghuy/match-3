import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {chromium} from 'playwright';

const base=new URL(process.argv[2]??'');
assert.ok(['http:','https:'].includes(base.protocol),'Pass the published deployment directory');
if(!base.pathname.endsWith('/'))base.pathname+='/';
const host=createServer((_request,response)=>{response.setHeader('Content-Type','text/html');response.end('<!doctype html><title>Published module probe</title>');});
await new Promise(resolve=>host.listen(0,'127.0.0.1',resolve));
let browser;
try {
 const responses=[];
 for(const path of ['sillytavern-install.html','sillytavern-host.js','sillytavern-panel.js','sillytavern-message.js','sillytavern-encounter.html','sillytavern-loader.js','sillytavern-battle.html','sillytavern.html','mvuzod.js']) {
  const response=await fetch(new URL(path,base));assert.equal(response.status,200,path);
  const headers={path,status:response.status,type:response.headers.get('content-type'),cors:response.headers.get('access-control-allow-origin'),cache:response.headers.get('cache-control')};
  if(path.endsWith('.js')&&path!=='mvuzod.js'){assert.equal(headers.cors,'*',path+' CORS');assert.match(headers.cache??'',/no-cache|max-age=0/,path+' cache');}
  responses.push(headers);
 }
 browser=await chromium.launch({headless:true,...(process.env.PROBE_PROXY?{proxy:{server:process.env.PROBE_PROXY,bypass:'localhost,127.0.0.1'}}:{})});const page=await browser.newPage();const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(new URL('sillytavern-install.html',base).href,{waitUntil:'networkidle',timeout:90000});
 await page.getByRole('button',{name:'下载酒馆助手脚本 JSON'}).waitFor();
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'下载酒馆助手脚本 JSON'}).click();
 const download=await pending;const stream=await download.createReadStream();let body='';for await(const chunk of stream)body+=String(chunk);
 const script=JSON.parse(body);assert.equal(script.type,'script');assert.equal(script.enabled,true);assert.ok(script.content.includes(JSON.stringify(base.href)));assert.ok(!script.content.includes('YOUR_MATCH3_HOST'));
 const regexPending=page.waitForEvent('download');await page.getByRole('button',{name:'下载正文正则 JSON',exact:true}).click();
 const regexDownload=await regexPending;let regexBody='';for await(const chunk of await regexDownload.createReadStream())regexBody+=String(chunk);
 const regex=JSON.parse(regexBody);assert.equal(regex.markdownOnly,true);assert.equal(regex.promptOnly,false);assert.ok(regex.replaceString.includes('sillytavern-message.js'));assert.ok(regex.replaceString.includes(base.href));
 const promptPending=page.waitForEvent('download');await page.getByRole('button',{name:'下载运行时 AI 协议',exact:true}).click();
 const promptDownload=await promptPending;let promptBody='';for await(const chunk of await promptDownload.createReadStream())promptBody+=String(chunk);assert.ok(promptBody.includes('[match3]'));assert.ok(promptBody.includes('classified'));
 await page.goto(`http://127.0.0.1:${host.address().port}`);
 const exported=await page.evaluate(async url=>{const module=await import(url);return typeof module.installStHost;},new URL('sillytavern-host.js',base).href);
 const panelExport=await page.evaluate(async url=>{const module=await import(url);return typeof module.openStPanel;},new URL('sillytavern-panel.js',base).href);
 const messageExport=await page.evaluate(async url=>{const module=await import(url);return typeof module.mountMessageEncounter;},new URL('sillytavern-message.js',base).href);
 assert.equal(messageExport,'function');assert.equal(panelExport,'function');assert.equal(exported,'function');assert.deepEqual(errors,[]);
 console.log(JSON.stringify({passed:true,base:base.href,responses,scriptDownload:download.suggestedFilename(),crossOriginExport:exported,panelExport,messageExport,regexDownload:regexDownload.suggestedFilename(),promptDownload:promptDownload.suggestedFilename(),browserErrors:errors,scope:'Published assets, installer and cross-origin ESM only; actual Tavern integration is recorded separately.'},null,2));
} finally {await browser?.close();host.closeAllConnections();await new Promise(resolve=>host.close(resolve));}
