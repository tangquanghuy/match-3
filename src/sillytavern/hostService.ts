import {stableJson} from './json';
import {chatKey,beginReplay,completeReplay} from './save';
import type {BattleRequest,BattleResult,CombatantSnapshot} from '../session/contract';
import type {GameEvent} from '../engine/events';
import type {PendingReplay,SettlementReceipt} from './save';
import type {StSave,AbilitySource,PendingStory,ChatBinding} from './save';
import {beginStory,completeStory} from './storySession';
import {StSaveRepository,validateReplayOutcome} from './saveRepository';
import {captureStoryWritebackOrigin,writebackStory} from './storyWriteback';
import type {ReplayOutcome} from './saveRepository';
import {StHostAdapter,companionColors} from './hostAdapter';
import type {CompanionColorChoice,HostSnapshot} from './hostAdapter';

export class StHostService {
 constructor(readonly adapter:StHostAdapter,readonly repository:StSaveRepository){}
 async current():Promise<{snapshot:HostSnapshot;save?:StSave}> {
   const snapshot=this.adapter.read();const saves=await this.repository.list();this.adapter.assertChat(snapshot.chat);
   let save=saves.find(s=>chatKey(s.chat)===chatKey(snapshot.chat));
   if(save){
     if(snapshot.saveId!==save.id)this.adapter.bindSave(save);
     const colors=companionColors(snapshot.statData);
     if(stableJson(colors)!==stableJson(save.companionColors))save=await this.repository.update(save.id,save.revision,draft=>{draft.companionColors=colors;});
   }
   this.adapter.assertChat(snapshot.chat);return {snapshot:this.adapter.read(),...(save?{save}:{})};
 }
 async create():Promise<StSave> {
   const snapshot=this.adapter.read();const save=await this.repository.create(snapshot.chat);
   this.adapter.bindSave(save);const current=await this.current();return current.save!;
 }
 async delete(id:string):Promise<void> {
   const save=(await this.repository.list()).find(s=>s.id===id);if(!save)throw new Error('存档不存在');
   if((await this.repository.listReplayOutcomes()).some(o=>o.saveId===id))throw new Error('此存档还有待保存战果，请先保存本场结果再删除');
   await this.repository.delete(id);
   // Deleting another chat's slot never touches its variables or the active chat.
   try {if(chatKey(this.adapter.binding())===chatKey(save.chat))this.adapter.clearBinding(save);}catch { /* The durable deletion stands; a later open reconciles the chat reference. */ }
 }
 async import(text:string):Promise<StSave> {
   const snapshot=this.adapter.read();const save=await this.repository.import(text,snapshot.chat);
   this.adapter.bindSave(save);return (await this.current()).save!;
 }
 async initializeCompanions(choices:readonly CompanionColorChoice[]):Promise<StSave> {
   const {snapshot,save}=await this.current();if(!save)throw new Error('请先创建当前聊天存档');
   await this.adapter.writeCompanionColors(snapshot,choices);
   return (await this.current()).save!;
 }
 async beginReplay(encounterId:string,party:readonly CombatantSnapshot[],playerContext:Pick<BattleRequest,'playerBanner'|'playerManaMastery'>={},expectedSnapshot?:HostSnapshot):Promise<PendingReplay> {
   const {snapshot,save}=await this.current();if(!save)throw new Error('请先创建当前聊天存档');
   if((await this.repository.listReplayOutcomes()).some(o=>o.saveId===save.id))throw new Error('请先保存待处理战果');
   this.adapter.assertSnapshot(expectedSnapshot??snapshot);
   if(expectedSnapshot&&expectedSnapshot.saveId!==save.id)throw new Error('准备确认的存档已变化，请重新准备');
   const ids={battleId:this.adapter.hostWindow.crypto.randomUUID(),requestId:this.adapter.hostWindow.crypto.randomUUID()};
   let ticket:PendingReplay|undefined;
   await this.repository.update(save.id,save.revision,draft=>{this.adapter.assertSnapshot(expectedSnapshot??snapshot);ticket=beginReplay(draft,encounterId,party,ids,playerContext);},true);
   return ticket!;
 }
 async beginStory(request:BattleRequest,sources:readonly AbilitySource[],difficulty:string,encounterId:string,expectedSnapshot?:HostSnapshot):Promise<PendingStory>{
   const {snapshot,save}=await this.current();if(!save)throw new Error('请先创建当前聊天存档');let ticket:PendingStory|undefined;
   if((await this.repository.listReplayOutcomes()).some(o=>o.saveId===save.id))throw new Error('请先保存待处理战果');
   this.adapter.assertSnapshot(expectedSnapshot??snapshot);if(expectedSnapshot&&expectedSnapshot.saveId!==save.id)throw new Error('准备确认的存档已变化，请重新准备');
   await this.repository.update(save.id,save.revision,draft=>{this.adapter.assertSnapshot(expectedSnapshot??snapshot);ticket=beginStory(draft,request,sources,difficulty,encounterId,captureStoryWritebackOrigin(expectedSnapshot??snapshot,request.playerTeam));},true);return ticket!;
 }
 async completeStory(saveId:string,result:BattleResult,events:readonly GameEvent[]):Promise<SettlementReceipt>{
   const save=(await this.repository.list()).find(s=>s.id===saveId);if(!save)throw new Error('本场存档已删除，战果尚未入账');let receipt:SettlementReceipt|undefined;
   await this.repository.update(save.id,save.revision,draft=>{receipt=completeStory(draft,result,events);});return receipt!;
 }
 async completeReplay(saveId:string,result:BattleResult,events:readonly GameEvent[]):Promise<SettlementReceipt> {
   // The ticket selects the original chat's slot; completion does not write ST variables.
   const save=(await this.repository.list()).find(s=>s.id===saveId);if(!save)throw new Error('本场存档已删除，战果尚未入账');
   let receipt:SettlementReceipt|undefined;
   await this.repository.update(save.id,save.revision,draft=>{receipt=completeReplay(draft,result,events);});
   return receipt!;
 }
 async stageReplayOutcome(saveId:string,ticket:PendingReplay|PendingStory,result:BattleResult,events:readonly GameEvent[],chat:StSave['chat'],kind:'story'|'replay'='replay'):Promise<void> {
   await this.repository.stageReplayOutcome({version:1,kind,saveId,chat:structuredClone(chat),ticket:structuredClone(ticket),result:structuredClone(result),events:structuredClone([...events]),createdAt:Date.now()});
 }
 async importReplayOutcome(text:string):Promise<ReplayOutcome> {
   const outcome=JSON.parse(text) as ReplayOutcome;
   if(!outcome||outcome.version!==1||!outcome.result||!outcome.ticket||!Array.isArray(outcome.events))throw new Error('本场战果备份格式有误');
   const save=(await this.repository.list()).find(s=>s.id===outcome.saveId);
   if(!save||chatKey(save.chat)!==chatKey(outcome.chat))throw new Error('请先恢复本场原聊天的存档备份');
   validateReplayOutcome(outcome,save);
   await this.repository.stageReplayOutcome(outcome);return outcome;
 }
 async retryReplayOutcome(outcome:ReplayOutcome):Promise<SettlementReceipt> {
   const original=(await this.repository.list()).find(s=>s.id===outcome.saveId);
   if(!original||chatKey(original.chat)!==chatKey(outcome.chat))throw new Error('请先恢复本场原聊天的存档备份，再保存战果');
   validateReplayOutcome(outcome,original);
   const receipt=await (outcome.kind==='story'?this.completeStory(outcome.saveId,outcome.result,outcome.events):this.completeReplay(outcome.saveId,outcome.result,outcome.events));
   await this.finishOutcome(receipt);return receipt;
 }
 /** A story receipt remains queued until its original host snapshot acknowledges HP and facts. */
 async finishOutcome(receipt:SettlementReceipt):Promise<void>{
   const owners=(await this.repository.list()).flatMap(save=>save.settlements.filter(stored=>stored.battleId===receipt.battleId&&(receipt.kind!=='story'||save.id===receipt.storyOrigin?.saveId)).map(stored=>({save,stored})));
   if(owners.length!==1||stableJson(owners[0]!.stored)!==stableJson(receipt))throw new Error('本场回写缺少一致的已提交结算收据');
   receipt=owners[0]!.stored;
   const queued=(await this.repository.listReplayOutcomes()).find(o=>o.result.battleId===receipt.battleId);
   if(queued)validateReplayOutcome(queued,owners[0]!.save);
   if(receipt.kind==='story'){
     if(!receipt.storyOrigin)throw new Error('剧情结算缺少原聊天回写快照，请保留战果备份');
     await writebackStory(this.adapter,receipt.storyOrigin,receipt);
   }
   await this.repository.removeReplayOutcome(receipt.battleId);
 }
 /** Abandon only the displayed, unsettled story; queued battle facts take priority. */
 async abandonStory(battleId:string,expectedRevision:number,expectedChat:ChatBinding):Promise<void> {
   this.adapter.assertChat(expectedChat);
   const save=(await this.repository.list()).find(s=>chatKey(s.chat)===chatKey(expectedChat));
   this.adapter.assertChat(expectedChat);
   if(!save)throw new Error('请先创建当前聊天存档');
   await this.repository.update(save.id,expectedRevision,draft=>{
     this.adapter.assertChat(expectedChat);
     if(draft.pendingStory?.request.battleId!==battleId)throw new Error('待完成剧情已变化，请刷新后重试');
     delete draft.pendingStory;
   },true);
 }
 async abandonReplay(battleId:string):Promise<void> {
   if((await this.repository.listReplayOutcomes()).some(o=>o.result.battleId===battleId))throw new Error('本场已有实际战果，请先保存结果');
   const {snapshot,save}=await this.current();if(!save)throw new Error('请先创建当前聊天存档');
   await this.repository.update(save.id,save.revision,draft=>{
     this.adapter.assertChat(snapshot.chat);
     if(draft.pendingReplay?.request.battleId!==battleId)throw new Error('待完成再现已变化，请刷新后重试');
     delete draft.pendingReplay;
   },true);
 }

}
