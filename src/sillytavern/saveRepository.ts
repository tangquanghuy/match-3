import {completeStory} from './storySession';
import { chatKey,createSave,deleteSave,emptyRoot,validateSave,completeReplay } from './save';
import type {ChatBinding,SaveRoot,StSave,PendingReplay,PendingStory} from './save';
import type {BattleResult} from '../session/contract';
import type {GameEvent} from '../engine/events';
import {buildStBattleReport} from './battleReport';
import {stableJson} from './json';

export interface ReplayOutcome {version:1;kind?:'story'|'replay';saveId:string;chat:ChatBinding;ticket:PendingReplay|PendingStory;result:BattleResult;events:GameEvent[];createdAt:number}
/** Check against the original ticket or committed receipt, including its frozen host origin. */
export function validateReplayOutcome(outcome:ReplayOutcome,save:StSave):void {
 if(!outcome||outcome.version!==1||!['story','replay'].includes(outcome.kind??'replay')||!Number.isSafeInteger(outcome.createdAt)||outcome.createdAt<0||!outcome.ticket||!outcome.result||!Array.isArray(outcome.events)||outcome.saveId!==save.id||chatKey(outcome.chat)!==chatKey(save.chat))throw new Error('待保存战果与原存档不一致');
 const kind=outcome.kind??'replay';
 const pending=kind==='story'?save.pendingStory:save.pendingReplay;
 const old=save.settlements.find(r=>r.battleId===outcome.result.battleId);
 if(old){
   if(old.kind!==kind||old.encounterId!==outcome.ticket.encounterId||stableJson(old.request)!==stableJson(outcome.ticket.request)||stableJson(old.storyOrigin)!==stableJson((outcome.ticket as PendingStory).origin))throw new Error('待保存战果与原结算配置不一致');
 }else if(!pending||pending.request.battleId!==outcome.result.battleId||stableJson(pending)!==stableJson(outcome.ticket))throw new Error('待保存战果与原始战斗配置不一致');
 (kind==='story'?completeStory:completeReplay)(structuredClone(save),outcome.result,outcome.events);
}
const OUTBOX='replayOutbox';

const DB_NAME='match3.sillytavern.v1';
const STORE='root';
function rootOf(value:unknown):SaveRoot {
 if(value===undefined)return emptyRoot();
 const r=value as SaveRoot;
 if(r.version!==1||!Array.isArray(r.saves)||r.saves.length>3)throw new Error('存档仓库格式有误');
 const saves=r.saves.map(validateSave);
 if(new Set(saves.map(s=>s.id)).size!==saves.length||new Set(saves.map(s=>chatKey(s.chat))).size!==saves.length)throw new Error('存在重复存档或聊天绑定');
 return {version:1,saves};
}
/** Run in the ST host window: IndexedDB ownership follows the executing window's origin. */
export class StSaveRepository {
 private constructor(private readonly db:IDBDatabase){}
 static open(factory:IDBFactory=indexedDB,namespace?:string):Promise<StSaveRepository>{
   if(namespace!==undefined&&(typeof namespace!=='string'||!namespace.trim()))return Promise.reject(new Error('存档仓库账号标识为空'));
   const databaseName=namespace===undefined?DB_NAME:`${DB_NAME}.account.${encodeURIComponent(namespace)}`;
   return new Promise((resolve,reject)=>{
     const request=factory.open(databaseName,2);
     request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);if(!db.objectStoreNames.contains(OUTBOX))db.createObjectStore(OUTBOX);};
     request.onerror=()=>reject(request.error);
     request.onblocked=()=>reject(new Error('请关闭旧页面后重新打开存档仓库'));
     request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(new StSaveRepository(db));};
   });
 }
 close():void{this.db.close();}
 private transaction<T>(write:boolean,action:(root:SaveRoot)=>T,emptyQueueSaveId?:string):Promise<T>{
   return new Promise((resolve,reject)=>{
     const tx=this.db.transaction(emptyQueueSaveId?[STORE,OUTBOX]:STORE,write?'readwrite':'readonly');const store=tx.objectStore(STORE);
     let output:T;let failure:unknown;
     if(emptyQueueSaveId){const queue=tx.objectStore(OUTBOX).getAll();queue.onsuccess=()=>{if((queue.result as ReplayOutcome[]).some(o=>o.saveId===emptyQueueSaveId)){failure=new Error('本场已有待保存战果，请先保存结果');tx.abort();}};}
     const request=store.get('state');
     request.onsuccess=()=>{try{const root=rootOf(request.result);output=action(root);if(write){rootOf(root);store.put(root,'state');}}catch(error){failure=error;tx.abort();}};
     tx.oncomplete=()=>resolve(structuredClone(output));
     tx.onabort=()=>reject(failure??tx.error??new Error('存档事务中止'));
     tx.onerror=()=>{failure??=tx.error;};
   });
 }
 list():Promise<StSave[]>{return this.transaction(false,r=>r.saves);}
 create(chat:ChatBinding,id:string=crypto.randomUUID()):Promise<StSave>{return this.transaction(true,r=>createSave(r,chat,id));}
 delete(id:string):Promise<void>{
   return new Promise((resolve,reject)=>{
     const tx=this.db.transaction([STORE,OUTBOX],'readwrite');const state=tx.objectStore(STORE);let failure:unknown;
     const root=state.get('state');const queue=tx.objectStore(OUTBOX).getAll();
     queue.onsuccess=()=>{try{
       if((queue.result as ReplayOutcome[]).some(o=>o.saveId===id))throw new Error('此存档还有待保存战果，请先保存本场结果再删除');
       const checked=rootOf(root.result);deleteSave(checked,id);rootOf(checked);state.put(checked,'state');
     }catch(error){failure=error;tx.abort();}};
     tx.oncomplete=()=>resolve();tx.onabort=()=>reject(failure??tx.error);tx.onerror=()=>{failure??=tx.error;};
   });
 }
 update(id:string,expectedRevision:number,action:(save:StSave)=>void,requireEmptyQueue=false):Promise<StSave>{
   return this.transaction(true,r=>{
     const save=r.saves.find(s=>s.id===id);if(!save)throw new Error('存档不存在');
     if(save.revision!==expectedRevision)throw new Error('存档已由其他页面更新，请重新读取后重试');
     const binding=chatKey(save.chat);action(save);
     if(chatKey(save.chat)!==binding||save.id!==id)throw new Error('更换聊天需要重新创建存档');
     save.revision=expectedRevision+1;save.updatedAt=Date.now();validateSave(save);return save;
   },requireEmptyQueue?id:undefined);
 }
 /** An independent durable queue: failed settlement never removes its original battle facts. */
 listReplayOutcomes():Promise<ReplayOutcome[]>{
   return new Promise((resolve,reject)=>{
     const tx=this.db.transaction(OUTBOX,'readonly');const request=tx.objectStore(OUTBOX).getAll();
     tx.oncomplete=()=>resolve(structuredClone(request.result));tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);
   });
 }
 async stageReplayOutcome(outcome:ReplayOutcome):Promise<void>{
   if(!outcome||outcome.version!==1||!outcome.saveId||!Number.isSafeInteger(outcome.createdAt)||!['story','replay'].includes(outcome.kind??'replay'))throw new Error('待保存战果格式有误');
   chatKey(outcome.chat);buildStBattleReport(outcome.ticket.request,outcome.result,outcome.events);
   return new Promise((resolve,reject)=>{
     const tx=this.db.transaction([STORE,OUTBOX],'readwrite');const store=tx.objectStore(OUTBOX);let failure:unknown;
     const rootRequest=tx.objectStore(STORE).get('state');
     rootRequest.onsuccess=()=>{try{const save=rootOf(rootRequest.result).saves.find(s=>s.id===outcome.saveId);if(!save)throw new Error('本场原存档已删除，请保留战果备份');validateReplayOutcome(outcome,save);}catch(error){failure=error;tx.abort();}};
     const request=store.get(outcome.result.battleId);
     request.onsuccess=()=>{try{
       const old=request.result as ReplayOutcome|undefined;
       if(old){
         const facts=(o:ReplayOutcome)=>({kind:o.kind??'replay',saveId:o.saveId,chat:o.chat,ticket:o.ticket,result:o.result,events:o.events});
         if(stableJson(facts(old))!==stableJson(facts(outcome)))throw new Error('同一场待保存战果发生冲突');
       }else store.put(structuredClone(outcome),outcome.result.battleId);
     }catch(error){failure=error;tx.abort();}};
     tx.oncomplete=()=>resolve();tx.onabort=()=>reject(failure??tx.error);tx.onerror=()=>{failure??=tx.error;};
   });
 }
 /** Called only after a committed receipt; a crash between these steps is safely idempotent. */
 removeReplayOutcome(battleId:string):Promise<void>{
   return new Promise((resolve,reject)=>{
     const tx=this.db.transaction(OUTBOX,'readwrite');tx.objectStore(OUTBOX).delete(battleId);
     tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);tx.onerror=()=>reject(tx.error);
   });
 }
 async export(id:string):Promise<string>{const save=(await this.list()).find(s=>s.id===id);if(!save)throw new Error('存档不存在');return JSON.stringify(save,null,2);}
 async import(text:string,currentChat:ChatBinding):Promise<StSave>{
   const imported=validateSave(JSON.parse(text));if(chatKey(imported.chat)!==chatKey(currentChat))return Promise.reject(new Error('备份绑定其他聊天，请切回原聊天导入'));
   return this.transaction(true,r=>{
     if(r.saves.some(s=>chatKey(s.chat)===chatKey(currentChat)))throw new Error('当前聊天已有存档，请手动删除旧档后导入');
     if(r.saves.length>=3)throw new Error('三个存档槽位已满，请手动删除一个旧档后导入');
     if(r.saves.some(s=>s.id===imported.id))throw new Error('备份存档标识已存在');
     r.saves.push(imported);return imported;
   });
 }
}
