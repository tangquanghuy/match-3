import type {StHostHandle,MessageStoryState} from './hostEntry';
import type {TavernHelpers} from './hostAdapter';
import {assertMessageSource} from './messageSource';
import type {MessageEncounterSource} from './messageSource';

export interface StPanelOptions {
 runtimeWindow?:Window;
 hostWindow?:Window;
 battleUrl?:string;
 /** Initialize without showing or auto-creating a save when checking pending battles. */
 show?:boolean;
}
export interface StPanelHandle {
 open():Promise<void>;
 messageStoryState(source:MessageEncounterSource,dismissReceipt?:boolean):Promise<MessageStoryState>;
 playMessageStory(source:MessageEncounterSource,receiptSignal?:AbortSignal):Promise<void>;
 hasPendingBattle():Promise<boolean>;
 destroy():void;
}
type RuntimeWindow=Window & {
 SillyTavern?:{getContext:TavernHelpers['getContext']};
 TavernHelper?:Partial<TavernHelpers>;
 Mvu?:TavernHelpers['Mvu'];
 getVariables?:TavernHelpers['getVariables'];
 updateVariablesWith?:TavernHelpers['updateVariablesWith'];
 getTavernHelperVersion?:()=>string;
 getTavernVersion?:()=>string;
 match3Panel?:StPanelHandle;
};
interface PanelState {
 host?:StHostHandle;
 installing?:Promise<StHostHandle>;
 opening?:Promise<void>;
 playing?:boolean;
 lifecycle:AbortController;
}

function tavernHost(start:Window):RuntimeWindow {
 let current=start;let host:RuntimeWindow|undefined;
 for(let depth=0;depth<64;depth++){
  try{
   if((current as RuntimeWindow).SillyTavern?.getContext)host=current as RuntimeWindow;
   if(current.parent===current)break;
   current=current.parent;
  }catch{break;}
 }
 if(!host)throw new Error('请从酒馆开局页或底部状态栏打开三消面板');
 return host;
}
function runtimeHelpers(host:RuntimeWindow,runtime:RuntimeWindow):TavernHelpers {
 const context=host.SillyTavern;
 if(!context)throw new Error('酒馆尚未初始化');
 const candidates=[host.TavernHelper,runtime.TavernHelper,host,runtime];
 const source=candidates.find(api=>typeof api?.getVariables==='function'&&typeof api?.updateVariablesWith==='function');
 const mvu=host.Mvu??runtime.Mvu;
 if(!source?.getVariables||!source.updateVariablesWith)throw new Error('请先启用酒馆助手，再打开三消面板');
 if(!mvu?.getMvuData||!mvu.replaceMvuData)throw new Error('请等待 MVU 初始化后再打开三消面板');
 const versionApi=candidates.find(api=>typeof api?.getTavernHelperVersion==='function');
 return {
  getContext:()=>context.getContext(),
  getVariables:options=>source.getVariables!(options),
  updateVariablesWith:(updater,options)=>source.updateVariablesWith!(updater,options),
  Mvu:mvu,
  ...(versionApi?.getTavernHelperVersion?{getTavernHelperVersion:()=>versionApi.getTavernHelperVersion!()}:{}),
 };
}
function assertEnabled(helpers:TavernHelpers):void {
 const context=helpers.getContext();
 if(!context.getCurrentChatId()||!context.chat.length)throw new Error('请先打开已有消息的酒馆聊天');
 const data=helpers.Mvu.getMvuData({type:'message',message_id:context.chat.length-1});
 const config=data?.stat_data?.['系统配置'];
 if(!config||typeof config!=='object'||Array.isArray(config)||(config as Record<string,unknown>)['三消战斗模式']!==true){
  throw new Error('当前聊天的三消战斗模式已关闭，请在开局配置或系统设置中启用');
 }
}
/** Execute persistent code in the Tavern realm: message iframe globals die on rerender. */
function openInHost(host:RuntimeWindow,battleUrl?:string,show=true):Promise<StPanelHandle> {
 const key=`__match3PanelLoad_${host.crypto.randomUUID().replaceAll('-','')}`;
 const bridge=host as unknown as Record<string,unknown>;
 return new Promise((resolve,reject)=>{
  const script=host.document.createElement('script');script.type='module';
  const cleanup=()=>{delete bridge[key];script.remove();};
  bridge[key]={resolve:(handle:StPanelHandle)=>{cleanup();resolve(handle);},reject:(error:unknown)=>{cleanup();reject(error);}};
  script.textContent=`import {openStPanel} from ${JSON.stringify(import.meta.url)}; const callback=window[${JSON.stringify(key)}]; try { callback.resolve(await openStPanel({hostWindow:window,runtimeWindow:window,battleUrl:${JSON.stringify(battleUrl)},show:${JSON.stringify(show)}})); } catch(error) { callback.reject(error); }`;
  script.onerror=()=>{cleanup();reject(new Error('三消面板模块加载失败，请检查网络后重试'));};
  host.document.head.append(script);
 });
}
/** Lazy, account-scoped panel used by the opening page and bottom status bar. */
export async function openStPanel(options:StPanelOptions={}):Promise<StPanelHandle> {
 const runtime=(options.runtimeWindow??window) as RuntimeWindow;
 const host=tavernHost(options.hostWindow??runtime);
 if(window!==host)return openInHost(host,options.battleUrl,options.show!==false);
 const helpers=runtimeHelpers(host,runtime);
 assertEnabled(helpers);
 // The public handle lives on the actual Tavern window, so separate message
 // iframes importing this module still share one installation and one queue.
 if(host.match3Panel){if(options.show!==false)await host.match3Panel.open();return host.match3Panel;}
 const state:PanelState={lifecycle:new AbortController()};
 const battleUrl=options.battleUrl??new URL(import.meta.env.DEV?'../../sillytavern-battle.html':'sillytavern-battle.html',import.meta.url).href;
 async function installed():Promise<StHostHandle>{
  state.lifecycle.signal.throwIfAborted();
  if(state.host){
   try{state.host.assertActive();}catch{state.host.destroy();state.host=undefined;state.installing=undefined;}
  }
  if(state.host)return state.host;
  if(!state.installing){
   state.installing=(async()=>{
    const {installStHost}=await import('./hostEntry');
    state.lifecycle.signal.throwIfAborted();
    assertEnabled(helpers);
    const handle=await installStHost({hostWindow:host,helpers,battleUrl,launcher:false,requireModeEnabled:true,runtimeLifecycle:false,signal:state.lifecycle.signal});
    if(state.lifecycle.signal.aborted){handle.destroy();state.lifecycle.signal.throwIfAborted();}
    state.host=handle;return handle;
   })();
  }
  const pending=state.installing;
  try{return await pending;}catch(error){if(state.installing===pending)state.installing=undefined;throw error;}
 }
 const handle:StPanelHandle={
  async open(){
   assertEnabled(helpers);
   if(state.opening)return state.opening;
   state.opening=(async()=>{
    const manager=await installed();
    try{
     const current=await manager.service.current();
     if(!current.save)await manager.service.create();
    }catch(error){
     // A full set of slots must remain reviewable so the player can choose
     // which old chat to delete. Never replace an existing binding silently.
     await manager.open();throw error;
    }
    await manager.open();
   })();
   try{await state.opening;}finally{state.opening=undefined;}
  },
  async messageStoryState(source,dismissReceipt){
   return (await installed()).messageStoryState(source,dismissReceipt);
  },
  async playMessageStory(source,receiptSignal){
   if(state.playing)throw new Error('已有剧情战斗正在准备或打开，请先完成当前操作');
   state.playing=true;
   try{
    const original=structuredClone(source);
    state.lifecycle.signal.throwIfAborted();assertEnabled(helpers);
    assertMessageSource(helpers.getContext(),original);
    const manager=await installed();
    const current=await manager.service.current();
    assertEnabled(helpers);assertMessageSource(helpers.getContext(),original);
    if(!current.save)await manager.service.create();
    state.lifecycle.signal.throwIfAborted();assertEnabled(helpers);
    assertMessageSource(helpers.getContext(),original);
    receiptSignal?.throwIfAborted();
    await manager.playMessageStory(original,receiptSignal);
   }finally{state.playing=false;}
  },
  async hasPendingBattle(){
   const manager=await installed();
   const current=await manager.service.current();
   const pending=current.save?.pendingStory??current.save?.pendingReplay;
   const outcomes=await manager.service.repository.listReplayOutcomes();
   return !!pending||outcomes.some(outcome=>outcome.saveId===current.save?.id);
  },
  destroy(){
   state.lifecycle.abort();state.host?.destroy();host.removeEventListener('pagehide',handle.destroy);
   if(host.match3Panel===handle)delete host.match3Panel;
  },
 };
 host.match3Panel=handle;
 host.addEventListener('pagehide',handle.destroy,{once:true});
 try{if(options.show!==false)await handle.open();return handle;}
 catch(error){
  // Preserve a valid manager when the fourth-chat check fails; its deletion
  // controls remain usable. Failed installations must not poison future opens.
  if(!state.host)handle.destroy();
  throw error;
 }
}

/** Inspect persisted work after a refresh without opening UI or allocating a chat slot. */
export async function hasPendingStBattle(options:StPanelOptions={}):Promise<boolean> {
 const handle=await openStPanel({...options,show:false});
 return handle.hasPendingBattle();
}
