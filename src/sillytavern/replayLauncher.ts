import type {BattleResult} from '../session/contract';
import type {GameEvent} from '../engine/events';
import type {AbilitySource,PendingReplay,PendingStory,SettlementReceipt,ChatBinding} from './save';
import type {StHostService} from './hostService';
import {renderStSettlement} from './settlementView';
import type {StSettlementView} from './settlementView';
import {formatStoryReportMessage,sendTavernChatMessage} from './storyReportMessage';
import {localPartyPortraits} from './actorPortraits';

function errorMessage(error:unknown,fallback:string):string {return error&&typeof error==='object'&&'message'in error&&typeof error.message==='string'&&error.message?error.message:fallback;}

export interface OpenReplayOptions {hostWindow:Window;service:StHostService;saveId:string;chat:ChatBinding;ticket:PendingReplay|PendingStory;battleUrl:string;kind?:'story'|'replay';signal?:AbortSignal}
/** A rerender clears a displayed result, while an active battle keeps running. */
export function dismissMessageReceipt(host:Window,battleId:string,previousReceipt:HTMLElement|null):void {
 const root=host.document.getElementById('st-match3-story-root');
 if(root&&root===previousReceipt&&root.dataset.battleId===battleId)root.dispatchEvent(new Event('match3:message-rerender'));
}
/** Reopen an already committed message result without entering the collection page. */
export function openStReceipt(options:{hostWindow:Window;receipt:SettlementReceipt;sources?:readonly AbilitySource[];signal?:AbortSignal;receiptSignal?:AbortSignal;onContinue?:()=>void}):Promise<void> {
 const {hostWindow:host,receipt,signal,receiptSignal}=options;const doc=host.document;
 if(signal?.aborted||receiptSignal?.aborted)return Promise.resolve();
 if(doc.getElementById('st-match3-replay-root')||doc.getElementById('st-match3-story-root'))return Promise.reject(new Error('已有战斗页面打开'));
 return new Promise(resolve=>{
  const root=doc.createElement('div');root.id='st-match3-story-root';root.dataset.battleId=receipt.battleId;root.dataset.resultState='settled';
  root.style.cssText='position:fixed;inset:0;width:100vw;height:100dvh;z-index:10010;background:#0e0e16';
  const shadow=root.attachShadow({mode:'open'});const detail=doc.createElement('section');
  detail.style.cssText='position:relative;width:100%;height:100%';shadow.append(detail);
  let disposed=false;
  function dispose():void {
   if(disposed)return;disposed=true;root.removeEventListener('match3:message-rerender',dispose);signal?.removeEventListener('abort',dispose);receiptSignal?.removeEventListener('abort',dispose);
   host.removeEventListener('pagehide',dispose);view?.dispose();root.remove();resolve();
  }
  // A result that still has to hand off its report stays until the player continues.
  if(!options.onContinue)root.addEventListener('match3:message-rerender',dispose);
  const view=renderStSettlement(detail,receipt,{onContinue:()=>{options.onContinue?.();dispose();},sources:options.sources});
  signal?.addEventListener('abort',dispose,{once:true});receiptSignal?.addEventListener('abort',dispose,{once:true});host.addEventListener('pagehide',dispose,{once:true});doc.body.append(root);
 });
}
/** Each battle has its own iframe, including skill/trait globals and summon resolvers. */
export function openStReplay(options:OpenReplayOptions):Promise<void> {
 const {hostWindow:host,service,saveId,ticket}=options;const story=options.kind==='story';const rootId=story?'st-match3-story-root':'st-match3-replay-root';const doc=host.document;
 if(options.signal?.aborted)return Promise.resolve();
 if(doc.getElementById('st-match3-replay-root')||doc.getElementById('st-match3-story-root'))return Promise.reject(new Error('已有往昔战场打开'));
 const url=new URL(options.battleUrl,host.location.href);
 if(!['http:','https:'].includes(url.protocol))return Promise.reject(new Error('战场地址需要 HTTP 或 HTTPS'));
 // postMessage uses the calling realm as event.source. A helper script's realm
 // is its iframe even when it creates UI and subscribes on the top host window.
 const bridgePath:number[]=[];let bridgeWindow:Window=window;
 while(bridgeWindow!==host){
   const parent=bridgeWindow.parent;
   if(parent===bridgeWindow||bridgePath.length>=32)return Promise.reject(new Error('助手脚本窗口不属于当前酒馆页面'));
   let index=-1;for(let i=0;i<parent.length;i++){if(parent.frames[i]===bridgeWindow){index=i;break;}}
   if(index<0)return Promise.reject(new Error('助手脚本窗口已关闭，请重新打开三消入口'));
   bridgePath.unshift(index);bridgeWindow=parent;
 }
 const nonce=host.crypto.randomUUID();url.searchParams.set('parentOrigin',host.location.origin);url.searchParams.set('nonce',nonce);
 url.searchParams.set('bridgePath',JSON.stringify(bridgePath));
 return new Promise(resolve=>{
   const root=doc.createElement('div');root.id=rootId;root.dataset.battleId=ticket.request.battleId;const shadow=root.attachShadow({mode:'open'});
   const style=doc.createElement('style');style.textContent=`:host{display:flex;flex-direction:column;position:fixed;inset:0;width:100vw;height:100dvh;z-index:10010;background:#0e0e16;color:#edf0f7;font:15px/1.5 system-ui,sans-serif}*{box-sizing:border-box}.bar{display:flex;gap:12px;align-items:center;padding:8px 12px;min-height:52px;flex-wrap:wrap}button{padding:7px 12px;background:#28374d;color:inherit;border:1px solid #62728b;border-radius:6px;font:inherit;cursor:pointer}iframe{display:block;width:100%;flex:1;min-height:0;border:0}.settlement{position:relative;flex:1;min-height:0;overflow:hidden}[hidden]{display:none!important}`;
   const bar=doc.createElement('div');bar.className='bar';const close=doc.createElement('button');close.textContent='继续';bar.hidden=true;
   const status=doc.createElement('span');status.setAttribute('role','status');status.textContent='正在准备往昔战场…';
   const retry=doc.createElement('button');retry.textContent='重试保存战果';retry.hidden=true;
   const backup=doc.createElement('button');backup.textContent='导出本场战果';backup.hidden=true;
   const frame=doc.createElement('iframe');frame.title=story?'剧情三消战场':'往昔再现战场';frame.src=url.href;frame.setAttribute('allow','autoplay; fullscreen');frame.allowFullscreen=true;
   const detail=doc.createElement('section');detail.className='settlement';detail.hidden=true;
   bar.append(close,status,retry,backup);shadow.append(style,bar,frame,detail);
   let resultView:StSettlementView|undefined;
   let dismissRequested=false;
   let disposed=false;let saving=false;let staged=false;let reportSent=false;let receipt:SettlementReceipt|undefined;let outcome:{result:BattleResult;events:GameEvent[]}|undefined;
   const readyTimer=host.setTimeout(()=>{if(disposed)return;bar.hidden=false;close.textContent='返回';status.textContent='战场加载超时，请返回后重试';},30_000);
   const acknowledge=()=>frame.contentWindow?.postMessage({channel:'match3:st-replay:v1',nonce,type:'ack',battleId:ticket.request.battleId,requestId:ticket.request.requestId},url.origin);
   async function commit():Promise<void>{
     if(saving||disposed||!outcome)return;bar.hidden=true;close.textContent='继续';saving=true;close.disabled=true;resultView?.setContinueEnabled(false);retry.hidden=true;status.textContent='正在保存本场战果…';
     try{
       if(doc.fullscreenElement===root)await doc.exitFullscreen().catch(()=>{});
       if(disposed)return;
       if(!receipt){
         if(!staged){await service.stageReplayOutcome(saveId,ticket,outcome.result,outcome.events,options.chat,story?'story':'replay');staged=true;}
         if(disposed)return;
         receipt=await (story?service.completeStory(saveId,outcome.result,outcome.events):service.completeReplay(saveId,outcome.result,outcome.events));
       }
       if(disposed)return;
       acknowledge();detail.hidden=false;frame.hidden=true;root.dataset.resultState='settled';
       if(!resultView)resultView=renderStSettlement(detail,receipt,{onContinue:()=>{if(!saving)continueStory();},playMusic:true});
       resultView.setContinueEnabled(false);
       await service.finishOutcome(receipt);
       if(!disposed){status.textContent='本场战果已保存';bar.hidden=true;backup.hidden=true;}
     }catch(error){if(disposed)return;bar.hidden=false;backup.hidden=false;close.hidden=!!resultView;status.textContent=(receipt?'本场奖励已入账 · 待完成同步：':'')+(errorMessage(error,'战果尚未保存'));retry.hidden=false;if(staged)status.textContent+=' · 战果已暂存，可返回后重试';}
     finally{saving=false;if(!disposed){close.disabled=!receipt&&!!outcome&&!staged;resultView?.setContinueEnabled(!!receipt);if(receipt&&dismissRequested)dispose();}}
   }
   function receive(event:MessageEvent):void {
     if(disposed||event.source!==frame.contentWindow||event.origin!==url.origin)return;
     const data=event.data;if(!data||data.channel!=='match3:st-replay:v1'||data.nonce!==nonce)return;
     if(data.type==='ready'){host.clearTimeout(readyTimer);bar.hidden=true;
       // Locally uploaded status-bar portraits travel beside the request and are never part of it.
       frame.contentWindow!.postMessage({channel:'match3:st-replay:v1',nonce,type:'start',request:ticket.request,displayPortraits:localPartyPortraits(host,ticket.request.playerTeam)},url.origin);}
     else if(data.type==='cancel'&&!outcome){dispose();}
     else if(data.type==='error'){host.clearTimeout(readyTimer);bar.hidden=false;close.textContent='返回';status.textContent=typeof data.message==='string'?data.message:'战场加载失败';}
     else if(data.type==='result'){
       if(data.result?.battleId!==ticket.request.battleId||data.result?.requestId!==ticket.request.requestId||!Array.isArray(data.events))return;
       if(receipt){acknowledge();return;}if(outcome)return;
       outcome={result:data.result,events:data.events};backup.hidden=false;void commit();
     }
   }
   function dispose():void {
     if(disposed)return;disposed=true;host.clearTimeout(readyTimer);
     root.removeEventListener('match3:message-rerender',dismissResult);
     host.removeEventListener('message',receive);host.removeEventListener('beforeunload',beforeUnload);host.removeEventListener('pagehide',dispose);
     options.signal?.removeEventListener('abort',dispose);
     if(doc.fullscreenElement===root)void doc.exitFullscreen().catch(()=>{});
     resultView?.dispose();root.remove();resolve();
   }
   /** Story results hand their report to the AI as a chat message when the player continues. */
   function continueStory():void {
     if(story&&receipt&&!reportSent){
       reportSent=true;
       if(!sendTavernChatMessage(host,formatStoryReportMessage(receipt,(ticket as PendingStory).sources))){
         bar.hidden=false;close.hidden=true;status.textContent='未找到酒馆输入框，战报未发送；请手动告知 AI 本场结果后再点继续';return;
       }
     }
     dispose();
   }
   // HP writeback can re-render the source message; keep an unsent story report on screen.
   function dismissResult():void {if(receipt&&(!story||reportSent)){dismissRequested=true;if(!saving)dispose();}}
   root.addEventListener('match3:message-rerender',dismissResult);
   close.onclick=()=>{if(saving||(!receipt&&outcome&&!staged))return;dispose();};retry.onclick=()=>void commit();
   function beforeUnload(event:BeforeUnloadEvent):void {if(outcome&&!staged&&!receipt){event.preventDefault();event.returnValue='';}}
   backup.onclick=()=>{if(!outcome)return;const blob=new Blob([JSON.stringify({version:1,kind:story?'story':'replay',saveId,chat:options.chat,ticket,...outcome,createdAt:Date.now()},null,2)],{type:'application/json'});const link=doc.createElement('a');const href=URL.createObjectURL(blob);link.href=href;link.download=`match3-outcome-${ticket.request.battleId}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(href),1000);};
   host.addEventListener('beforeunload',beforeUnload);host.addEventListener('pagehide',dispose);
   options.signal?.addEventListener('abort',dispose,{once:true});
   host.addEventListener('message',receive);doc.body.append(root);
 });
}
