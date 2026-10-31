import type {App} from '../render/App';
import {BattleLoadingScreen} from '../meta/shell/battleLoading';
import '../meta/shell/styles/battle-loading.css';
import type {BattleRequest,BattleResult} from '../session/contract';
import type {GameEvent} from '../engine/events';

const params=new URLSearchParams(location.search);
const parentOrigin=params.get('parentOrigin');const nonce=params.get('nonce');
let bridgeWindow:Window=window.parent;
const status=document.getElementById('status')!;const mount=document.getElementById('app')!;
let loading:BattleLoadingScreen|undefined;let app:App|undefined;let started=false;let disposed=false;let acknowledged=false;let timer:number|undefined;
let finished:{result:BattleResult;events:GameEvent[]}|undefined;
let runtimeReady=false;let runtimeReleased=false;
function releaseRuntime():void {
 if(!runtimeReady||runtimeReleased)return;
 runtimeReleased=true;loading?.dispose();app?.destroy();
}
function post(type:string,data:Record<string,unknown>={}):void {
 if(!disposed&&parentOrigin&&nonce)window.parent.postMessage({channel:'match3:st-replay:v1',nonce,type,...data},parentOrigin);
}
function submit():void {if(finished)post('result',finished);}
const DISPLAY_IMAGE=/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i;
function withDisplayPortraits(request:BattleRequest,overrides:unknown):BattleRequest {
 if(!overrides||typeof overrides!=='object'||Array.isArray(overrides))return request;
 const map=overrides as Record<string,unknown>;
 const shown=structuredClone(request);
 for(const unit of shown.playerTeam){
   const image=Object.hasOwn(map,unit.externalId)?map[unit.externalId]:undefined;
   if(typeof image==='string'&&image.length<=4*1024*1024&&DISPLAY_IMAGE.test(image))unit.portraitUrl=image;
 }
 return shown;
}
function fail(error:unknown):void {if(disposed)return;status.hidden=false;status.textContent=error instanceof Error?error.message:'战场加载失败';post('error',{message:status.textContent});}
function receive(event:MessageEvent):void {
 if(disposed||window.parent===window||!parentOrigin||!nonce)return;
 if(event.source!==bridgeWindow||event.origin!==parentOrigin)return;
 const data=event.data;if(!data||data.channel!=='match3:st-replay:v1'||data.nonce!==nonce)return;
 if(data.type==='ack'&&finished&&data.battleId===finished.result.battleId&&data.requestId===finished.result.requestId){acknowledged=true;window.clearInterval(timer);status.textContent='本场战果已保存';releaseRuntime();return;}
 if(data.type!=='start'||started)return;started=true;
 // Display-only portraits (locally uploaded status-bar images) replace player art for this page;
 // the request the host saved and validates the result against stays unchanged.
 const shown=withDisplayPortraits(data.request,data.displayPortraits);
 void(async()=>{
   loading=new BattleLoadingScreen(shown,{
     title:'',
     tips:[],
   });
   status.hidden=true;
   const modules=await loading.preload(async()=>{
     const [{App},{prepareStBattle}]=await Promise.all([import('../render/App'),import('./battleRuntime')]);
     return {App,runtime:prepareStBattle(data.request)};
   });
   if(disposed){loading.dispose();return;}
   if(!modules){loading.dispose();post('cancel');return;}
   const {App,runtime}=modules;app=new App();
   if(import.meta.env.DEV)Object.assign(window,{__stReplayApp:app});
   app.onBattleFinished=result=>{if(disposed||finished)return;finished={result,events:app!.exportEvents()};submit();if(!acknowledged)timer=window.setInterval(submit,2000);};
   app.onBattleDismissed=()=>{};
   await app.init(mount,shown,runtime.registry,runtime.configureEngine);
   if(disposed){runtimeReady=true;releaseRuntime();return;}
   await loading.finish();runtimeReady=true;
   if(disposed||acknowledged)releaseRuntime();
   status.hidden=true;
 })().catch(error=>{runtimeReady=true;releaseRuntime();fail(error);});
}
window.addEventListener('message',receive);
window.addEventListener('pagehide',()=>{disposed=true;window.clearInterval(timer);window.removeEventListener('message',receive);loading?.dispose();releaseRuntime();},{once:true});
if(window.parent===window||!parentOrigin||!nonce){status.textContent='请从酒馆图鉴打开往昔再现';}
else{try{
 if(new URL(parentOrigin).origin!==parentOrigin)throw new Error('酒馆来源格式有误');
 const path:unknown=JSON.parse(params.get('bridgePath')??'[]');
 if(!Array.isArray(path)||path.length>32||path.some(index=>!Number.isSafeInteger(index)||index<0))throw new Error('助手脚本窗口路径格式有误');
 // Numeric Window.frames access works across origins and identifies only the
 // installation's actual sender. Other sibling windows remain untrusted.
 for(const index of path){const next:Window|undefined=bridgeWindow.frames[index];if(!next)throw new Error('助手脚本窗口已关闭，请重新打开三消入口');bridgeWindow=next;}
 post('ready');
}catch(error){disposed=true;status.hidden=false;status.textContent=error instanceof Error?error.message:'战场加载失败';}}
