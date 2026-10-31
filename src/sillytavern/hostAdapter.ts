import {BaseColor} from '../engine/types';
import {applyStoryWritebackRecord,buildStoryWritebackRecord,revertStoryWriteback,storyWritebackAck,storyWritebackAckMatches,storyWritebackApplied} from './storyWriteback';
import type {StoryWritebackOrigin,StoryWritebackResult} from './storyWriteback';
import type {SettlementReceipt} from './save';
import {chatKey} from './save';
import type {ChatBinding,StSave} from './save';
import {stableJson} from './json';
import {applyWeaponPurchase,ownedWeapons} from './weaponShop';
import {currencyGuardActive,reconcileCurrencyInPlace,sealCurrencyInPlace,sealedCurrency} from './currencySeal';

export interface TavernContext {
 characterId?:string|number;groupId?:string|number|null;
 accountStorage?:Pick<Storage,'getItem'|'setItem'>;
 characters:readonly {avatar?:string}[];
 chat:readonly {swipe_id?:number;send_date?:string|number;mes?:string;is_user?:boolean;is_system?:boolean}[];
 getCurrentChatId():string|undefined;
}
export interface MvuData {stat_data:Record<string,unknown>;[key:string]:unknown}
export type MvuScope='message'|'chat';
export type MvuVariableOptions={type:'message';message_id:number}|{type:'chat'};
export interface StHostAdapterOptions {mvuScope?:'message';expectedHelperVersion?:string}
export interface TavernHelpers {
 getTavernHelperVersion?():string;
 getTavernVersion?():string;
 getContext():TavernContext;
 getVariables(options:{type:'chat'}):Record<string,unknown>;
 updateVariablesWith(updater:(variables:Record<string,unknown>)=>Record<string,unknown>,options:{type:'chat'}):unknown;
 Mvu:{getMvuData(options:MvuVariableOptions):MvuData;replaceMvuData(data:MvuData,options:MvuVariableOptions):Promise<void>};
}
export interface HostSnapshot {
 chat:ChatBinding;messageId:number;swipeId:number;fingerprint:string;
 mvuScope?:MvuScope;messageIdentity?:string;
 statData:Record<string,unknown>;saveId?:string;
}
export interface CompanionColorChoice {name:string;colors:readonly string[]}
const isObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function companionColors(statData:Record<string,unknown>):Record<string,string[]> {
 const bonds=statData['羁绊列表'];if(!isObject(bonds))return {};
 const result:Record<string,string[]>=Object.create(null);
 for(const [name,value]of Object.entries(bonds)){
   if(!isObject(value)||value['三消']===undefined)continue;
   const bridge=value['三消'];if(!isObject(bridge))throw new Error(`同伴 ${name} 的三消变量格式有误`);
   if(bridge['颜色']!==undefined)result[name]=checkedColors(bridge['颜色'],name);
 }
 return result;
}
function checkedColors(value:unknown,name:string):string[] {
 if(!Array.isArray(value)||value.length<1||value.length>3||new Set(value).size!==value.length||value.some(c=>!Object.values(BaseColor).includes(c as BaseColor)))throw new Error(`同伴 ${name} 需要一至三种有效且不同的颜色`);
 return [...value] as string[];
}
/** Instantiate in the host window; helpers may be supplied by a Tavern Helper script iframe. */
export class StHostAdapter {
 private readonly mvuScope='message' as const;
 private readonly expectedHelperVersion?:string;
 constructor(private readonly helpers:TavernHelpers,readonly hostWindow:Window,private readonly hostId:string,options:StHostAdapterOptions={}){
   if(typeof hostId!=='string'||!hostId.trim())throw new Error('宿主标识为空');
   this.expectedHelperVersion=options.expectedHelperVersion;
   // StoryWritebackOrigin persists a message floor, but has no scope migration contract.
   if(options.mvuScope!==undefined&&options.mvuScope!=='message')throw new Error('剧情同步仅支持 MVU message scope，chat scope 尚缺跨刷新恢复契约');
 }
 /** Version probes are synchronous helper APIs. Pin a tested version at installation when required. */
 checkCompatibility():{mvuScope:MvuScope;helperVersion?:string;tavernVersion?:string} {
   if(typeof this.helpers.getContext!=='function'||typeof this.helpers.getVariables!=='function'||typeof this.helpers.updateVariablesWith!=='function'||typeof this.helpers.Mvu?.getMvuData!=='function'||typeof this.helpers.Mvu?.replaceMvuData!=='function')throw new Error('酒馆助手或 MVU API 不完整，请检查加载顺序与版本');
   const helperVersion=this.helpers.getTavernHelperVersion?.();const tavernVersion=this.helpers.getTavernVersion?.();
   for(const version of [helperVersion,tavernVersion])if(version!==undefined&&(typeof version!=='string'||!version.trim()))throw new Error('酒馆助手版本 API 返回格式有误');
   if(this.expectedHelperVersion!==undefined&&helperVersion!==this.expectedHelperVersion)throw new Error('酒馆助手版本与安装契约不一致，请重新核对版本');
   return {mvuScope:this.mvuScope,...(helperVersion!==undefined?{helperVersion}:{}),...(tavernVersion!==undefined?{tavernVersion}:{})};
 }
 private mvuOptions(messageId:number):MvuVariableOptions {return {type:'message',message_id:messageId};}
 /** Pass this account namespace to the repository as well; binding isolation alone is insufficient. */
 getStorageNamespace():string {this.checkCompatibility();return this.storageNamespaceFrom(this.helpers.getContext());}
 private storageNamespaceFrom(ctx:TavernContext):string {
   const storage=ctx.accountStorage;if(!storage)return this.hostId;
   const key='match3.host-account.v1';let accountId=storage.getItem(key);
   if(accountId===null){accountId=this.hostWindow.crypto.randomUUID();storage.setItem(key,accountId);}
   if(typeof accountId!=='string'||!accountId.trim()||storage.getItem(key)!==accountId)throw new Error('酒馆账号标识尚未持久化，请等待账号初始化后重试');
   return JSON.stringify([this.hostId,'account',accountId]);
 }
 private bindingFrom(ctx:TavernContext):ChatBinding {
   const chatId=ctx.getCurrentChatId();
   if(typeof chatId!=='string'||!chatId.trim()||!ctx.chat.length)throw new Error('请先打开已有消息的酒馆聊天');
   const group=ctx.groupId!==undefined&&ctx.groupId!==null&&String(ctx.groupId)!=='';
   const index=typeof ctx.characterId==='number'?ctx.characterId:typeof ctx.characterId==='string'&&/^\d+$/.test(ctx.characterId)?Number(ctx.characterId):NaN;
   const avatar=Number.isSafeInteger(index)&&index>=0?ctx.characters[index]?.avatar:undefined;
   if(!group&&(typeof avatar!=='string'||!avatar.trim()))throw new Error('当前角色缺少稳定的角色卡引用');
   return {hostId:this.storageNamespaceFrom(ctx),characterId:group?`group:${ctx.groupId}`:`avatar:${avatar}`,chatId};
 }
 private location(ctx:TavernContext):{messageId:number;swipeId:number;messageIdentity:string} {
   const messageId=ctx.chat.length-1;const message=ctx.chat[messageId];
   return {messageId,swipeId:message?.swipe_id??0,messageIdentity:stableJson(message?.send_date??null)};
 }
 binding():ChatBinding {this.checkCompatibility();return this.bindingFrom(this.helpers.getContext());}
 read():HostSnapshot {
   this.checkCompatibility();const ctx=this.helpers.getContext();const chat=this.bindingFrom(ctx);const location=this.location(ctx);
   const data=this.helpers.Mvu.getMvuData(this.mvuOptions(location.messageId));
   if(!isObject(data)||!isObject(data.stat_data)||!isObject(data.stat_data['人物']))throw new Error(`当前 MVU ${this.mvuScope} scope 尚未初始化人物变量，请检查变量作用域`);
   const variables=this.helpers.getVariables({type:'chat'});const reference=variables['match3'];let saveId:string|undefined;
   if(reference!==undefined){if(!isObject(reference)||reference['version']!==1||typeof reference['saveId']!=='string'||!reference['saveId'].trim())throw new Error('聊天三消存档引用格式有误');
     // Copied chats inherit variables. Their old reference is ignored, never rebound.
     if(stableJson(reference['chat'])===stableJson(chat))saveId=reference['saveId'];
   }
   const statData=structuredClone(data.stat_data);companionColors(statData);
   const confirmed=this.helpers.getContext();
   if(chatKey(chat)!==chatKey(this.bindingFrom(confirmed))||stableJson(location)!==stableJson(this.location(confirmed)))throw new Error('酒馆消息或角色变量已变化，请重新读取后重试');
   return {chat,...location,mvuScope:this.mvuScope,fingerprint:stableJson(statData),statData,...(saveId?{saveId}:{})};
 }
 assertChat(chat:ChatBinding):void {if(chatKey(chat)!==chatKey(this.binding()))throw new Error('酒馆聊天已切换，请重新读取当前聊天');}
 assertSnapshot(snapshot:HostSnapshot):void {
   const current=this.read();
   if(chatKey(current.chat)!==chatKey(snapshot.chat)||current.messageId!==snapshot.messageId||current.swipeId!==snapshot.swipeId||current.fingerprint!==snapshot.fingerprint||current.saveId!==snapshot.saveId||(snapshot.mvuScope!==undefined&&current.mvuScope!==snapshot.mvuScope)||(snapshot.messageIdentity!==undefined&&current.messageIdentity!==snapshot.messageIdentity))throw new Error('酒馆消息或角色变量已变化，请重新读取后重试');
 }
 bindSave(save:StSave):void {
   this.assertChat(save.chat);
   this.helpers.updateVariablesWith(variables=>{
     this.assertChat(save.chat);const current=variables['match3'];
     // Reconciliation of an existing binding must retain its factual result mirror.
     if(isObject(current)&&current['version']===1&&current['saveId']===save.id&&stableJson(current['chat'])===stableJson(save.chat))return variables;
     return {...variables,match3:{version:1,saveId:save.id,chat:structuredClone(save.chat)}};
   },{type:'chat'});
   const confirmed=this.read();if(confirmed.saveId!==save.id)throw new Error('聊天存档绑定尚未确认，请刷新后重试');
 }
 clearBinding(save:StSave):void {
   this.assertChat(save.chat);this.helpers.updateVariablesWith(variables=>{
     this.assertChat(save.chat);const current=variables['match3'];
     if(isObject(current)&&current['saveId']===save.id&&stableJson(current['chat'])===stableJson(save.chat)){const next={...variables};delete next['match3'];return next;}return variables;
   },{type:'chat'});
   this.assertChat(save.chat);const reference=this.helpers.getVariables({type:'chat'})['match3'];
   if(isObject(reference)&&reference['saveId']===save.id&&stableJson(reference['chat'])===stableJson(save.chat))throw new Error('聊天存档解绑尚未确认，请刷新后重试');
 }
 async writeCompanionColors(snapshot:HostSnapshot,choices:readonly CompanionColorChoice[]):Promise<HostSnapshot> {
   const lock=this.hostWindow.navigator.locks;if(!lock)throw new Error('当前环境缺少聊天变量写入锁');
   return lock.request(`match3:colors:${chatKey(snapshot.chat)}`,async()=>{
     this.assertSnapshot(snapshot);
     const options=this.mvuOptions(snapshot.messageId);
     const data=structuredClone(this.helpers.Mvu.getMvuData(options));
     if(stableJson(data.stat_data)!==snapshot.fingerprint)throw new Error('角色变量已变化，请重新读取后重试');
     const bonds=data.stat_data['羁绊列表'];if(!isObject(bonds))throw new Error('当前聊天没有羁绊角色');
     const names=new Set<string>();const expected:Record<string,string[]>=Object.create(null);let changed=false;
     for(const choice of choices){
       if(names.has(choice.name))throw new Error('同伴颜色初始化对象重复');names.add(choice.name);
       const actor=Object.hasOwn(bonds,choice.name)?bonds[choice.name]:undefined;if(!isObject(actor))throw new Error(`同伴 ${choice.name} 已离队或不存在`);
       const colors=checkedColors(choice.colors,choice.name);const bridge=actor['三消'];
       if(bridge!==undefined&&!isObject(bridge))throw new Error(`同伴 ${choice.name} 的三消变量格式有误`);
       const existing=isObject(bridge)?bridge['颜色']:undefined;
       if(existing!==undefined){expected[choice.name]=checkedColors(existing,choice.name);continue;}
       actor['三消']={...(isObject(bridge)?bridge:{}),'颜色':colors};expected[choice.name]=colors;changed=true;
     }
     this.assertSnapshot(snapshot);
     const expectedFingerprint=stableJson(data.stat_data);
     if(changed)await this.helpers.Mvu.replaceMvuData(data,options);
     const confirmed=this.read();
     if(chatKey(confirmed.chat)!==chatKey(snapshot.chat)||confirmed.messageId!==snapshot.messageId||confirmed.swipeId!==snapshot.swipeId||confirmed.saveId!==snapshot.saveId||(snapshot.messageIdentity!==undefined&&confirmed.messageIdentity!==snapshot.messageIdentity))throw new Error('变量写入后聊天或消息已切换，请回原聊天确认');
     const actual=companionColors(confirmed.statData);
     for(const [name,colors]of Object.entries(expected))if(stableJson(actual[name])!==stableJson(colors))throw new Error(`同伴 ${name} 的颜色未持久化，请更新 MVU 三消变量结构后重试`);
     if(confirmed.fingerprint!==expectedFingerprint)throw new Error('颜色已写入但角色变量未完整持久化，请检查 HP 与 MVU schema');
     return confirmed;
   });
 }
 /**
  * Buy a weapon with 通用币 on the snapshot's floor: deduct and record ownership in one MVU write,
  * then read back. Shares the MVU mutation lock; a changed floor or variable rejects the purchase.
  */
 async purchaseWeapon(snapshot:HostSnapshot,weaponId:string):Promise<HostSnapshot> {
   const lock=this.hostWindow.navigator.locks;if(!lock)throw new Error('当前环境缺少聊天变量写入锁');
   return lock.request(`match3:colors:${chatKey(snapshot.chat)}`,async()=>{
     this.assertSnapshot(snapshot);
     const options=this.mvuOptions(snapshot.messageId);
     const data=structuredClone(this.helpers.Mvu.getMvuData(options));
     if(stableJson(data.stat_data)!==snapshot.fingerprint)throw new Error('角色变量已变化，请重新读取后重试');
     // With the card's 通用币 guard running, pay from the sealed balance (a hand-edited one is put
     // back silently in the same write) and seal the balance left after paying.
     const guarded=currencyGuardActive(this.hostWindow);
     if(guarded)reconcileCurrencyInPlace(data.stat_data,()=>{
       for(let id=snapshot.messageId-1;id>=0;id--){
         const earlier=this.helpers.Mvu.getMvuData(this.mvuOptions(id))?.stat_data;
         const value=isObject(earlier)?sealedCurrency(earlier):undefined;if(value!==undefined)return value;
       }
       return undefined;
     });
     data.stat_data=applyWeaponPurchase(data.stat_data,weaponId);
     if(guarded)sealCurrencyInPlace(data.stat_data);
     const expectedFingerprint=stableJson(data.stat_data);
     this.assertSnapshot(snapshot);
     await this.helpers.Mvu.replaceMvuData(data,options);
     const confirmed=this.read();
     if(chatKey(confirmed.chat)!==chatKey(snapshot.chat)||confirmed.messageId!==snapshot.messageId||confirmed.swipeId!==snapshot.swipeId||confirmed.saveId!==snapshot.saveId||(snapshot.messageIdentity!==undefined&&confirmed.messageIdentity!==snapshot.messageIdentity))throw new Error('变量写入后聊天或消息已切换，请回原聊天确认');
     if(!ownedWeapons(confirmed.statData).has(weaponId)||confirmed.fingerprint!==expectedFingerprint)throw new Error('购买记录未完整写入，请检查角色卡 MVU 结构是否包含“三消已购武器”');
     return confirmed;
   });
 }
 /** Commit story HP + its durable marker together, then confirm the chat-level factual mirror. */
 async writeStoryResult(origin:StoryWritebackOrigin,receipt:SettlementReceipt):Promise<StoryWritebackResult> {
   const record=buildStoryWritebackRecord(origin,receipt);const fingerprint=origin.fingerprint;
   const lock=this.hostWindow.navigator.locks;if(!lock)throw new Error('当前环境缺少聊天变量写入锁');
   // Share the existing MVU mutation lock with color initialization as well as other story callbacks.
   return lock.request(`match3:colors:${chatKey(record.chat)}`,async()=>{
     const assertLocation=():HostSnapshot=>{
       this.assertChat(record.chat);const current=this.read();
       if(current.messageId!==record.messageId||current.swipeId!==record.swipeId)throw new Error('剧情原始消息或 swipe 已变化，请回原消息重试');
       if(!current.saveId||(record.saveId!==undefined&&current.saveId!==record.saveId))throw new Error('剧情原始聊天存档绑定已变化');
       return current;
     };
     const current=assertLocation();const saveId=current.saveId!;
     const options=this.mvuOptions(record.messageId);
     const readAck=(variables:Record<string,unknown>):unknown=>{
       const reference=variables['match3'];
       if(!isObject(reference)||reference['version']!==1||reference['saveId']!==saveId||stableJson(reference['chat'])!==stableJson(record.chat))throw new Error('剧情原始聊天存档绑定已变化');
       const entries=reference['storyResults'];
       if(entries!==undefined&&!isObject(entries))throw new Error('聊天三消战果字段格式有误');
       return isObject(entries)&&Object.hasOwn(entries,record.battleId)?entries[record.battleId]:undefined;
     };
     const ack=readAck(this.helpers.getVariables({type:'chat'}));
     if(ack!==undefined&&!storyWritebackAckMatches(ack,record))throw new Error('本场剧情写回确认与战果冲突，请保留结果检查');
     // An acknowledged battle never writes HP again: a later script or battle may have changed it.
     let applied=false;
     if(ack===undefined){
       const data=structuredClone(this.helpers.Mvu.getMvuData(options));
       if(stableJson(data.stat_data)!==current.fingerprint)throw new Error('剧情角色变量已变化，请重试');
       if(current.fingerprint===fingerprint){
         const next=applyStoryWritebackRecord(data.stat_data,record);const expectedFingerprint=stableJson(next);data.stat_data=next;
         if(assertLocation().fingerprint!==fingerprint)throw new Error('剧情原始角色变量已变化');
         await this.helpers.Mvu.replaceMvuData(data,options);applied=true;
         if(assertLocation().fingerprint!==expectedFingerprint)throw new Error('剧情 HP 未持久化，请检查 MVU schema 后重试');
       }else if(!storyWritebackApplied(data.stat_data,record)){
         // Not the pre-battle state, and not this battle's result (e.g. a lost acknowledgement): keep the result.
         throw new Error('剧情原始角色变量指纹已变化，请保留结果处理冲突');
       }
       await this.helpers.updateVariablesWith(variables=>{
         assertLocation();const existing=readAck(variables);
         if(existing!==undefined&&!storyWritebackAckMatches(existing,record))throw new Error('聊天本场战果冲突');
         const reference=variables['match3'] as Record<string,unknown>;
         return {...variables,match3:{...reference,storyResults:{...(reference['storyResults'] as Record<string,unknown>|undefined),[record.battleId]:storyWritebackAck(record)}}};
       },{type:'chat'});
     }
     const confirmed=assertLocation();
     if(!storyWritebackAckMatches(readAck(this.helpers.getVariables({type:'chat'})),record))throw new Error('剧情战果回传尚未确认，请保留结果重试');
     return {status:applied?'applied':'already-applied',record:structuredClone(record),snapshot:confirmed};
   });
 }
 /**
  * Temporary test tool. The battle floor must be the latest floor, so later report and
  * reply messages are already deleted. While the chat acknowledgement exists, HP returns to the
  * receipt's frozen pre-battle values; then the acknowledgement is removed. A retry after a
  * partial failure is safe: without the acknowledgement HP is left alone.
  */
 async clearStoryResultForTesting(chat:ChatBinding,messageId:number,swipeId:number,battleId:string,actors:readonly {path:string;current:number}[]=[]):Promise<void> {
   const lock=this.hostWindow.navigator.locks;if(!lock)throw new Error('当前环境缺少聊天变量写入锁');
   await lock.request(`match3:colors:${chatKey(chat)}`,async()=>{
     const assertLocation=():HostSnapshot=>{
       this.assertChat(chat);const current=this.read();
       if(current.messageId!==messageId||current.swipeId!==swipeId)throw new Error('请先删除本场战斗之后的战报和回复消息，让战斗所在楼层成为最新一楼');
       return current;
     };
     assertLocation();
     const options=this.mvuOptions(messageId);
     const reference=this.helpers.getVariables({type:'chat'})['match3'];
     const acknowledged=isObject(reference)&&isObject(reference['storyResults'])&&Object.hasOwn(reference['storyResults'],battleId);
     if(acknowledged&&actors.length){
       const data=structuredClone(this.helpers.Mvu.getMvuData(options));
       const next=revertStoryWriteback(data.stat_data,battleId,actors);const expected=stableJson(next);
       if(expected!==stableJson(data.stat_data)){
         data.stat_data=next;assertLocation();
         await this.helpers.Mvu.replaceMvuData(data,options);
         if(assertLocation().fingerprint!==expected)throw new Error('战前生命未能恢复，请重试');
       }
     }
     await this.helpers.updateVariablesWith(variables=>{
       assertLocation();const reference=variables['match3'];
       if(!isObject(reference)||!isObject(reference['storyResults'])||!Object.hasOwn(reference['storyResults'],battleId))return variables;
       const storyResults={...reference['storyResults']};delete storyResults[battleId];
       return {...variables,match3:{...reference,storyResults}};
     },{type:'chat'});
   });
 }

}
