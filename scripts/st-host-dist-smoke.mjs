import {createServer} from 'node:http';
import {readFile,access} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const buildRoot=resolve(process.argv[2]??'dist');
const mountPath=process.argv[3]??'/';
assert.ok(mountPath.startsWith('/')&&mountPath.endsWith('/'));
const blocks=(await readFile(resolve(buildRoot,'_headers'),'utf8')).trim().split(/\n(?=\/)/).map(block=>{
 const [pattern,...lines]=block.split('\n');
 return {pattern,headers:Object.fromEntries(lines.filter(line=>line.trim()).map(line=>{const index=line.indexOf(':');return [line.slice(0,index).trim(),line.slice(index+1).trim()];}))};
});
const mime={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml'};
const assets=createServer(async(req,res)=>{
 try{
   const pathname=new URL(req.url,'http://fixture').pathname;if(!pathname.startsWith(mountPath))throw new Error('outside mount');const file=resolve(buildRoot,decodeURIComponent(pathname.slice(mountPath.length)));
   if(!file.startsWith(buildRoot+sep))throw new Error('invalid path');
   for(const block of blocks){const prefix=block.pattern.endsWith('*')?block.pattern.slice(0,-1):undefined;if(prefix!==undefined?pathname.startsWith(prefix):pathname===block.pattern)for(const [key,value]of Object.entries(block.headers))res.setHeader(key,value);}
   res.setHeader('Content-Type',mime[extname(file)]??'application/octet-stream');res.end(await readFile(file));
 }catch{res.statusCode=404;res.end();}
});
const host=createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="zh-CN"><body>ST host fixture</body></html>');});
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`)));
const close=server=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve);});
let browser;
try{
 const [assetOrigin,hostOrigin]=await Promise.all([listen(assets),listen(host)]);
 browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(hostOrigin);
 const assetBase=assetOrigin+mountPath;
 const result=await page.evaluate(async(assetBase)=>{
   const module=await import(`${assetBase}sillytavern-host.js`);
   if(typeof module.installStHost!=='function')throw new Error('installStHost export missing');
   let variables={};const helpers={getContext:()=>({characterId:0,characters:[{avatar:'fixture.png'}],chat:[{}],getCurrentChatId:()=> 'production-smoke'}),getVariables:()=>variables,updateVariablesWith:fn=>variables=fn(variables),Mvu:{getMvuData:()=>({stat_data:{人物:{名称:'主角'}}}),replaceMvuData:async()=>{}}};
   const handle=await module.installStHost({hostWindow:window,helpers,hostId:'production-smoke',battleUrl:`${assetBase}sillytavern-battle.html`});
   await handle.service.create();await handle.open();const saved=(await handle.service.current()).save;
   const visible=document.querySelector('#st-match3-host-root').shadowRoot.textContent.includes('1 / 3 个槽位已使用');
   const hasReplayApi=typeof handle.playReplay==='function';const hasStoryApi=typeof handle.playStory==='function';handle.destroy();return {chatId:saved.chat.chatId,visible,hasReplayApi,hasStoryApi,variables};
 },assetBase);
 assert.equal(result.chatId,'production-smoke');assert.equal(result.visible,true);assert.equal(result.hasReplayApi,true);assert.equal(result.hasStoryApi,true);assert.equal(result.variables.match3.chat.chatId,'production-smoke');assert.deepEqual(errors,[]);
 assert.equal((await fetch(`${assetBase}sillytavern-host.js`)).headers.get('cache-control'),'no-cache');
 assert.equal((await fetch(`${assetBase}sillytavern-battle.html`)).status,200);
 if(await access(resolve(buildRoot,'sillytavern-playtest.html')).then(()=>true,()=>false)){
   await page.goto(`${assetBase}sillytavern-playtest.html`);
   await page.getByRole('button',{name:'创建当前聊天存档'}).click();
   await page.getByRole('button',{name:'开始示例遭遇',exact:true}).click();
   const dialog=page.getByRole('dialog',{name:'剧情战斗队伍准备'});
   await dialog.getByRole('button',{name:'确认队伍进入剧情战斗'}).waitFor();
   assert.equal(await dialog.getByRole('button',{name:'确认队伍进入剧情战斗'}).isEnabled(),true);
   await dialog.getByRole('button',{name:'取消',exact:true}).click();
   assert.deepEqual(errors,[]);
 }
 console.log('PASS: production ESM export, cross-origin dependency loading, host IndexedDB/chat binding, management UI, story/replay entries, default preparation UI and cache headers');
}finally{await browser?.close();await Promise.all([close(host),close(assets)]);}
