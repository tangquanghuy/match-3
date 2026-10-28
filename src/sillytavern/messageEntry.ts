import {openStPanel} from './panelEntry';
import type {TavernContext} from './hostAdapter';
import {readMessageSource,assertMessageSource} from './messageSource';
import {parseRuntimeEncounter} from './runtimeProtocol';

interface MessageOptions {runtimeWindow?:Window;messageId:number;root:HTMLElement;encounterUrl?:string}
type TavernWindow=Window&{SillyTavern?:{getContext():TavernContext}};
function findHost(runtime:Window):TavernWindow {
 let current=runtime;let result:TavernWindow|undefined;
 for(let i=0;i<64;i++){
  try{if((current as TavernWindow).SillyTavern?.getContext)result=current as TavernWindow;if(current.parent===current)break;current=current.parent;}catch{break;}
 }
 if(!result)throw new Error('请从酒馆助手渲染的正文入口打开战斗');
 return result;
}
/** Called by the display regex. Read the original message, never replacement captures. */
export async function mountMessageEncounter(options:MessageOptions):Promise<{destroy():void}> {
 const runtime=options.runtimeWindow??window;const host=findHost(runtime);
 const context=()=>host.SillyTavern!.getContext();
 const source=readMessageSource(context(),options.messageId);
 const plan=parseRuntimeEncounter(source.text);
 const url=options.encounterUrl?new URL(options.encounterUrl,import.meta.url):new URL(import.meta.env.DEV?'../../sillytavern-encounter.html':'sillytavern-encounter.html',import.meta.url);
 if(!['http:','https:'].includes(url.protocol))throw new Error('战斗入口地址需要 HTTP 或 HTTPS');
 const nonce=host.crypto.randomUUID();url.hash=new URLSearchParams({channel:nonce}).toString();
 const doc=options.root.ownerDocument;const frame=doc.createElement('iframe');
 frame.title='剧情三消遭遇';frame.src=url.href;frame.style.cssText='display:block;width:100%;height:500px;border:0;border-radius:10px;color-scheme:dark';
 const status=doc.createElement('p');status.setAttribute('role','status');status.hidden=true;
 const retry=doc.createElement('button');retry.type='button';retry.textContent='重试加载战斗入口';retry.hidden=true;
 const receiptLifecycle=new AbortController();
 let disposed=false;let busy=false;let connected=false;let handshakeTimer:number|undefined;
 function setStatus(message=''):void{status.textContent=message;status.hidden=!message;}
 function clearHandshake():void{runtime.clearTimeout(handshakeTimer);handshakeTimer=undefined;}
 function loadFailed(message:string):void{
  if(disposed||connected)return;clearHandshake();setStatus(message);retry.hidden=false;
 }
 function waitForHandshake():void{
  clearHandshake();connected=false;retry.hidden=true;setStatus();
  handshakeTimer=runtime.setTimeout(()=>loadFailed('战斗入口加载超时，请检查网络后重试。'),10_000);
 }
 function frameError():void{loadFailed('战斗入口加载失败，请重试。');}
 retry.onclick=()=>{if(disposed||busy)return;waitForHandshake();frame.remove();frame.src=url.href;options.root.prepend(frame);};
 const send=(type:string,extra:Record<string,unknown>={})=>frame.contentWindow?.postMessage({channel:'match3:message:v1',nonce,type,...extra},url.origin);
 async function refreshState(dismissReceipt=false):Promise<void>{
  const panel=await openStPanel({runtimeWindow:runtime,hostWindow:host,show:false});
  if(disposed)return;
  const state=await panel.messageStoryState(source,dismissReceipt);
  if(!disposed)send('state',{state});
 }
 async function play():Promise<void>{
  if(busy||disposed||!connected)return;busy=true;send('busy');setStatus();
  try{
   assertMessageSource(context(),source);
   const panel=await openStPanel({runtimeWindow:runtime,hostWindow:host,show:false});
   if(disposed)return;
   await panel.playMessageStory(source,receiptLifecycle.signal);
   if(!disposed){await refreshState();setStatus();send('idle');}
  }catch(error){if(!disposed){setStatus(error instanceof Error?error.message:String(error));send('error',{message:status.textContent});}}
  finally{busy=false;}
 }
 function receive(event:MessageEvent):void {
  if(disposed||event.source!==frame.contentWindow||event.origin!==url.origin)return;
  const data=event.data;if(!data||data.channel!=='match3:message:v1'||data.nonce!==nonce)return;
  if(data.type==='ready'){
   connected=true;clearHandshake();retry.hidden=true;
   send('encounter',{busy,difficulty:plan.difficulty,enemies:plan.enemyDesigns.map(e=>({name:e.name,race:e.race,rank:e.rank,form:e.form,role:e.role,level:e.level,colors:e.manaColors}))});
   setStatus();
   void refreshState(!busy).catch(()=>{/* Starting still reports any host setup error on explicit click. */});
  }
  if(data.type==='resize'&&Number.isFinite(data.height)&&data.height>=240&&data.height<=2000)frame.style.height=`${Math.ceil(data.height)}px`;
  if(data.type==='play')void play();
 }
 function destroy():void{if(disposed)return;disposed=true;receiptLifecycle.abort();clearHandshake();retry.onclick=null;frame.removeEventListener('error',frameError);runtime.removeEventListener('message',receive);runtime.removeEventListener('pagehide',destroy);}
 runtime.addEventListener('message',receive);runtime.addEventListener('pagehide',destroy,{once:true});
 frame.addEventListener('error',frameError);waitForHandshake();options.root.replaceChildren(frame,status,retry);
 return {destroy};
}
