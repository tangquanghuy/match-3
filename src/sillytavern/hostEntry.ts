import { abilityDisplayText } from './abilityDisplay';
import type {HostSnapshot} from './hostAdapter';
import {StHostAdapter} from './hostAdapter';
import type {TavernHelpers,StHostAdapterOptions} from './hostAdapter';
import {StHostService} from './hostService';
import {StSaveRepository} from './saveRepository';
import {chatKey,LEARNING_WINS,canReplay,sourceIsLearned} from './save';
import type {StSave,EncounterRecord} from './save';
import type {SettlementReceipt} from './save';
import {renderStSettlement} from './settlementView';
import {sourceEnemy,soulFragmentName} from './fragmentRewards';
import {abilityDisplayName} from './abilityName';
import type {StSettlementView} from './settlementView';
import {openStReplay,openStReceipt,dismissMessageReceipt} from './replayLauncher';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../session/contract';
import type {BattleRequest,CombatantSnapshot} from '../session/contract';
import {preparePartyDialog} from './partyDialog';
import {prepareCurrentParty} from './partyPreparation';
import {restoreEnemyBlueprint} from './enemyBlueprint';
import type {EnemyBlueprint} from './enemyBlueprint';
import {RANKS} from './portraits';
import {compileEnemyEncounterPlan} from './enemyDesign';
import {assertEnemyBudget} from './enemyBudget';
import type {EnemyBudgetPolicy} from './enemyBudget';
import type {EnemyDesignInput} from './enemyDesign';
import {parseRuntimeEncounter} from './runtimeProtocol';
import {assertMessageSource} from './messageSource';
import type {MessageEncounterSource} from './messageSource';
import {stableJson} from './json';
import {managementPageCss,managementAsset} from './managementPage';
import {icon,gemSvg} from '../meta/shell/chrome';

function errorMessage(error:unknown,fallback:string):string {return error&&typeof error==='object'&&'message'in error&&typeof error.message==='string'&&error.message?error.message:fallback;}

export interface ReplayParty {party:readonly CombatantSnapshot[];source?:HostSnapshot;playerContext?:Pick<BattleRequest,'playerBanner'|'playerManaMastery'>}
export interface InstallStHostOptions extends StHostAdapterOptions {
 hostWindow:Window;helpers:TavernHelpers;hostId?:string;
 battleUrl?:string;signal?:AbortSignal;
 /** Show the floating save launcher (default true). */
 launcher?:boolean;
 /** Require the latest host mode flag for opening and starting new battles (default false). */
 requireModeEnabled?:boolean;
 /** Bind cleanup to the importing script window as well as the host (default true). */
 runtimeLifecycle?:boolean;
 prepareReplay?:(save:StSave,encounter:EncounterRecord)=>Promise<ReplayParty>;
}
export type StoryPlan={difficulty:string;seed?:number;rules?:BattleRequest['rules'];budgetPolicy?:EnemyBudgetPolicy} & (
 {enemyDesigns:readonly EnemyDesignInput[];enemies?:never}|
 {enemies:readonly EnemyBlueprint[];enemyDesigns?:never}
);
export type MessageStoryState='new'|'pending'|'settled';
export interface StHostHandle {readonly destroyed:boolean;assertActive():void;service:StHostService;open():Promise<void>;playStory(plan:StoryPlan):Promise<void>;messageStoryState(source:MessageEncounterSource,dismissReceipt?:boolean):Promise<MessageStoryState>;playMessageStory(source:MessageEncounterSource,receiptSignal?:AbortSignal):Promise<void>;playReplay(encounterId:string,party:ReplayParty):Promise<void>;destroy():void}
/** Import from a Tavern Helper script and pass the ST top window explicitly. */
export async function installStHost(options:InstallStHostOptions):Promise<StHostHandle> {
 options.signal?.throwIfAborted();
 const host=options.hostWindow;const doc=host.document;
 if(doc.getElementById('st-match3-host-root'))throw new Error('三消存档入口已经打开');
 let hostId=options.hostId??host.localStorage.getItem('match3.host-instance.v1');
 if(!hostId){hostId=`${host.location.origin}:${host.crypto.randomUUID()}`;host.localStorage.setItem('match3.host-instance.v1',hostId);}
 const adapter=new StHostAdapter(options.helpers,host,hostId,{mvuScope:options.mvuScope,expectedHelperVersion:options.expectedHelperVersion});
 adapter.checkCompatibility();
 function accountNamespace():string|undefined{
   const storage=options.helpers.getContext().accountStorage;if(!storage)return undefined;
   // Adapter owns ID initialization; the DB uses only the account ID, not the
   // composite host/chat binding returned by getStorageNamespace().
   adapter.getStorageNamespace();
   const key='match3.host-account.v1';const id=storage.getItem(key);
   if(typeof id!=='string'||!id.trim()||storage.getItem(key)!==id)throw new Error('酒馆账号标识尚未持久化，请等待账号初始化后重试');
   return id;
 }
 const account=accountNamespace();
 // Keep root slots and the outcome queue in the same account database. Legacy hosts
 // without accountStorage retain their existing database and need no migration.
 const repository=await StSaveRepository.open(host.indexedDB,account);
 if(accountNamespace()!==account){repository.close();throw new Error('酒馆账号已切换，请重新打开三消入口');}
 if(options.signal?.aborted||doc.getElementById('st-match3-host-root')){repository.close();options.signal?.throwIfAborted();throw new Error('三消存档入口已经打开');}
 const service=new StHostService(adapter,repository);
 const root=doc.createElement('div');root.id='st-match3-host-root';const shadow=root.attachShadow({mode:'open'});
 const style=doc.createElement('style');style.textContent=managementPageCss;shadow.append(style);
 function el<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string):HTMLElementTagNameMap[K]{const element=doc.createElement(tag);if(text!==undefined)element.textContent=text;return element;}
 function glyph(name:string):HTMLElement {const span=el('span');span.dataset.icon=name;span.innerHTML=icon(name);return span;}
 const launch=options.launcher===false?undefined:el('button','三消存档');if(launch)launch.className='launch';
 const panel=el('section');panel.className='panel management-page';panel.hidden=true;panel.setAttribute('aria-label','三消编队、图鉴与魂片');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','false');
 const top=el('header');top.className='topbar';const title=el('div');title.className='top-title';title.append(el('h2','编队与养成'));
 const chatLabel=el('span');chatLabel.className='chat-label';
 const close=el('button');close.className='close';close.setAttribute('aria-label','关闭');close.append(glyph('close'));close.onclick=()=>{panel.hidden=true;formationController?.abort();launch?.focus();};top.append(title,chatLabel,close);
 const notice=el('p');notice.className='notice';notice.setAttribute('role','status');
 const screen=el('div');screen.className='screen';const frame=el('div');frame.className='panel management-frame native-party';const content=el('div');content.className='panel-inner management-content';frame.append(content);screen.append(frame);
 type Page='party'|'collection'|'replay'|'history'|'saves';let activePage:Page='party';let formationController:AbortController|undefined;let partyMount:HTMLElement|undefined;
 const navigation=el('footer');navigation.className='bottom-bar';const tabs=el('nav');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','养成页面');navigation.append(tabs);
 const pageButtons=new Map<Page,HTMLButtonElement>();
 for(const [page,label,name,g] of [['party','编队','编队与能力装配','flag'],['collection','魂片收藏','魂片收藏','soul'],['replay','往昔再现','往昔再现','book'],['history','战斗记录','战斗记录','book'],['saves','存档','存档','gear']] as const){const tab=el('button');tab.setAttribute('role','tab');tab.setAttribute('aria-label',name);tab.append(glyph(g),el('span',label));tab.onclick=()=>showPage(page);pageButtons.set(page,tab);tabs.append(tab);}
 function pageContent(node:HTMLElement,page:Page):void {node.dataset.page=page;node.hidden=activePage!==page;content.append(node);}
 function showPage(page:Page):void {
  if(page!==activePage)formationController?.abort();activePage=page;frame.classList.toggle('native-party',page==='party');
  for(const [key,tab] of pageButtons){tab.classList.toggle('active',key===page);tab.setAttribute('aria-selected',String(key===page));tab.tabIndex=key===page?0:-1;}
  for(const node of content.children)(node as HTMLElement).hidden=(node as HTMLElement).dataset.page!==page;
  if(page==='party'&&partyMount&&!partyMount.childElementCount)openFormation();
 }
 tabs.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const pages=[...pageButtons.keys()];const index=pages.indexOf(activePage);const next=event.key==='Home'?0:event.key==='End'?pages.length-1:(index+(event.key==='ArrowRight'?1:-1)+pages.length)%pages.length;showPage(pages[next]!);pageButtons.get(pages[next]!)?.focus();});
 function openFormation():void {
  if(!partyMount||panel.hidden||deleted)return;formationController?.abort();const controller=new AbortController();formationController=controller;
  const abort=()=>controller.abort();lifecycle.signal.addEventListener('abort',abort,{once:true});
  void preparePartyDialog({hostWindow:host,service,mode:'management',mount:partyMount,signal:controller.signal}).then(()=>{if(!controller.signal.aborted&&!deleted&&activePage==='party')return refresh();}).catch(error=>{if(!controller.signal.aborted){notice.textContent=errorMessage(error,'读取编队失败');notice.className='notice error';}}).finally(()=>lifecycle.signal.removeEventListener('abort',abort));
 }
 panel.append(top,notice,screen,navigation);if(launch)shadow.append(launch);shadow.append(panel);doc.body.append(root);
 const lifecycle=new AbortController();
 let busy=false;let deleted=false;let displayedChat='';let storyStarting=false;
 const receiptViews=new Map<HTMLElement,StSettlementView>();
 function renderReceipt(mount:HTMLElement,receipt:SettlementReceipt,encounters?:readonly EncounterRecord[]):void{
   receiptViews.get(mount)?.dispose();receiptViews.set(mount,renderStSettlement(mount,receipt,{sources:encounters?.find(item=>item.id===receipt.encounterId)?.sources}));
 }
 function clearReceiptViews():void{for(const view of receiptViews.values())view.dispose();receiptViews.clear();}
 function assertAlive():void{if(deleted)throw new Error('三消入口已关闭，请重新打开');if(accountNamespace()!==account){destroy();throw new Error('酒馆账号已切换，请重新打开三消入口');}}
 function assertModeEnabled(force=false):void{
   if(!force&&!options.requireModeEnabled)return;
   const system=adapter.read().statData['系统配置'];
   if(!system||typeof system!=='object'||Array.isArray(system)||(system as Record<string,unknown>)['三消战斗模式']!==true)throw new Error('三消战斗模式已关闭，请在系统配置中开启后重试');
 }
 function readStoryPlan(value:unknown):StoryPlan{
   if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('当前聊天尚未设置有效的剧情遭遇（match3.encounter），请先配置遭遇');
   const plan=value as Record<string,unknown>;
   if(typeof plan.difficulty!=='string'||!plan.difficulty.trim())throw new Error('剧情遭遇缺少有效的难度名称（difficulty）');
   if(plan.seed!==undefined&&!Number.isSafeInteger(plan.seed))throw new Error('剧情遭遇种子（seed）需要整数');
   if(('enemies'in plan)===('enemyDesigns'in plan))throw new Error('剧情遭遇需要且只接受一种敌方配置（enemies 或 enemyDesigns）');
   const enemies=plan.enemies??plan.enemyDesigns;
   if(!Array.isArray(enemies)||enemies.length<1||enemies.length>4)throw new Error('剧情遭遇需要 1 至 4 名敌方成员');
   if(enemies.some(enemy=>!enemy||typeof enemy!=='object'||Array.isArray(enemy)))throw new Error('剧情遭遇的敌方成员配置格式有误');
   return structuredClone(plan) as StoryPlan;
 }
 async function playReplay(encounterId:string,prepared:ReplayParty):Promise<void>{
   assertAlive();
   if(!options.battleUrl)throw new Error('请在安装脚本中设置往昔战场地址');
   const {snapshot,save}=await service.current();assertAlive();if(!save)throw new Error('请先创建当前聊天存档');
   if(save.pendingReplay&&save.pendingReplay.encounterId!==encounterId)throw new Error('请先完成或手动放弃待完成的再现');
   if((await repository.listReplayOutcomes()).some(o=>o.saveId===save.id))throw new Error('已有待保存战果，请先保存结果');
   if(!save.pendingReplay)assertModeEnabled();
   const returnToManagement=!panel.hidden;panel.hidden=true;formationController?.abort();
   try{
    const ticket=save.pendingReplay??await service.beginReplay(encounterId,prepared.party,prepared.playerContext,prepared.source);
    assertAlive();adapter.assertChat(snapshot.chat);
    await openStReplay({hostWindow:host,service,saveId:save.id,chat:save.chat,ticket,battleUrl:options.battleUrl,signal:lifecycle.signal});
   }finally{if(returnToManagement&&!deleted){panel.hidden=false;showPage(activePage);}}

 }

 function assertStoryRestore(save:StSave):void{
   assertAlive();adapter.assertChat(save.chat);
   const origin=save.pendingStory?.origin;
   if(!origin)return;
   const current=adapter.read();
   if(current.saveId!==save.id||current.messageId!==origin.messageId||current.swipeId!==origin.swipeId||current.fingerprint!==origin.fingerprint)throw new Error('剧情原始消息、swipe、存档绑定或角色变量已变化，请先恢复原消息与变量，或手动放弃未结算剧情');
 }
 async function messageHash(value:string):Promise<string>{
   const digest=await host.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
   return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
 }
 function assertStorySource(source:MessageEncounterSource,snapshot:HostSnapshot,latest:boolean):void{
   assertAlive();adapter.assertChat(snapshot.chat);assertModeEnabled(true);
   assertMessageSource(options.helpers.getContext(),source,latest);
 }
 async function messageIds(save:StSave,source:MessageEncounterSource,plan:StoryPlan):Promise<{battleId:string;requestId:string}>{
   const identity=[save.id,source.chatId,source.characterId,source.messageId,source.messageIdentity,source.swipeId];
   return {battleId:await messageHash(stableJson(identity)),requestId:await messageHash(stableJson([identity,plan]))};
 }
 async function messageStoryState(source:MessageEncounterSource,dismissReceipt=false):Promise<MessageStoryState>{
   const original=structuredClone(source);assertAlive();assertModeEnabled(true);
   assertMessageSource(options.helpers.getContext(),original);
   const displayedReceipt=dismissReceipt?doc.getElementById('st-match3-story-root'):null;
   const previousReceipt=displayedReceipt?.dataset.resultState==='settled'?displayedReceipt:null;
   // Rendering inspects persisted records without rebinding MVU or updating a save.
   const snapshot=adapter.read();
   const save=(await repository.list()).find(item=>chatKey(item.chat)===chatKey(snapshot.chat));
   assertStorySource(original,snapshot,false);
   if(!save)return 'new';
   const ids=await messageIds(save,original,parseRuntimeEncounter(original.text));
   const current=(await repository.list()).find(item=>chatKey(item.chat)===chatKey(snapshot.chat));
   assertStorySource(original,snapshot,false);
   if(current?.id!==save.id)throw new Error('当前聊天存档已变化，请重新读取消息');
   if(current.settlements.some(item=>item.battleId===ids.battleId)){
    if(dismissReceipt)dismissMessageReceipt(host,ids.battleId,previousReceipt);
    return 'settled';
   }
   return current.pendingStory?.request.battleId===ids.battleId?'pending':'new';
 }
 async function showMessageReceipt(save:StSave,receipt:SettlementReceipt,source:MessageEncounterSource,snapshot:HostSnapshot,receiptSignal?:AbortSignal):Promise<void>{
   assertStorySource(source,snapshot,false);panel.hidden=true;
   await openStReceipt({hostWindow:host,receipt,sources:save.encounters.find(item=>item.id===receipt.encounterId)?.sources,signal:lifecycle.signal,receiptSignal});
 }
 async function existingMessageBattle(save:StSave,source:MessageEncounterSource,ids:{battleId:string;requestId:string},snapshot:HostSnapshot,receiptSignal?:AbortSignal):Promise<boolean>{
   const outcomes=await repository.listReplayOutcomes();assertStorySource(source,snapshot,false);
   if(outcomes.some(outcome=>outcome.saveId===save.id))throw new Error('已有待保存战果，请先在存档面板保存本场结果后再开始战斗');
   const receipt=save.settlements.find(item=>item.battleId===ids.battleId);
   if(receipt){
     if(receipt.kind!=='story'||receipt.requestId!==ids.requestId)throw new Error('本条消息已有结算，但遭遇内容已变化；请查看原结算');
     await showMessageReceipt(save,receipt,source,snapshot,receiptSignal);return true;
   }
   if(save.pendingStory?.request.battleId===ids.battleId){
     if(save.pendingReplay)throw new Error('请先完成或手动放弃其他待完成战斗');
     if(save.pendingStory.request.requestId!==ids.requestId)throw new Error('本条消息已有待完成战斗，但遭遇内容已变化；请恢复或放弃原战斗');
     assertStorySource(source,snapshot,true);assertStoryRestore(save);
     await openStReplay({hostWindow:host,service,saveId:save.id,chat:save.chat,ticket:save.pendingStory,battleUrl:options.battleUrl!,signal:lifecycle.signal,kind:'story'});
     if(!deleted)await refresh();return true;
   }
   if(save.pendingStory||save.pendingReplay)throw new Error('请先完成或手动放弃待完成战斗');
   return false;
 }
 async function playMessageStory(source:MessageEncounterSource,receiptSignal?:AbortSignal):Promise<void>{
   // Capture all caller-owned strings before the first asynchronous boundary.
   const original=structuredClone(source);
   assertAlive();assertModeEnabled(true);assertMessageSource(options.helpers.getContext(),original);
   await playStory(parseRuntimeEncounter(original.text),original,receiptSignal);
 }
 async function playStory(plan:StoryPlan,source?:MessageEncounterSource,receiptSignal?:AbortSignal):Promise<void>{
   assertAlive();
   if(storyStarting)throw new Error('已有剧情战斗正在准备或打开，请先完成当前操作');
   storyStarting=true;panel.hidden=true;formationController?.abort();
   try{
    assertModeEnabled(!!source);plan=source?parseRuntimeEncounter(source.text):readStoryPlan(plan);
    if(!options.battleUrl)throw new Error('请在安装脚本中设置战场地址');
    const {snapshot,save}=await service.current();assertAlive();if(!save)throw new Error('请先创建当前聊天存档');
    if(source)assertStorySource(source,snapshot,false);
    const ids=source?await messageIds(save,source,plan):undefined;
    if(source&&ids){
      const current=await service.current();assertStorySource(source,snapshot,false);
      if(current.save?.id!==save.id)throw new Error('当前聊天存档已变化，请重新读取消息');
      if(await existingMessageBattle(current.save,source,ids,snapshot,receiptSignal))return;
      assertStorySource(source,snapshot,true);
    }else{
      if((await repository.listReplayOutcomes()).some(outcome=>outcome.saveId===save.id))throw new Error('已有待保存战果，请先在存档面板保存本场结果后再开始战斗');
      adapter.assertChat(snapshot.chat);
      if(save.pendingStory||save.pendingReplay)throw new Error('请先完成或手动放弃待完成战斗');
    }
    if(('enemies'in plan)===('enemyDesigns'in plan))throw new Error('请选择一种敌人配置输入');
    const seed=ids?Number.parseInt(ids.battleId.slice(0,8),16):plan.seed??host.crypto.getRandomValues(new Uint32Array(1))[0]!;
    const enemies='enemyDesigns'in plan?compileEnemyEncounterPlan(plan.enemyDesigns,{seed,budgetPolicy:plan.budgetPolicy}).members.map(result=>result.blueprint):plan.enemies.map(restoreEnemyBlueprint);
    if(enemies.length<1||enemies.length>4)throw new Error('敌方阵容需要 1 至 4 名成员');
    if(new Set(enemies.map(e=>e.snapshot.externalId)).size!==enemies.length)throw new Error('敌方成员标识重复');
    assertEnemyBudget(enemies.map(enemy=>enemy.snapshot),plan.budgetPolicy);
    const prepared=await prepareSavedParty(save,'story');
    assertAlive();adapter.assertChat(snapshot.chat);assertModeEnabled(!!source);
    if(source&&ids){
      assertStorySource(source,snapshot,true);
      const current=await service.current();assertStorySource(source,snapshot,true);
      if(current.save?.id!==save.id)throw new Error('当前聊天存档已变化，请重新读取消息');
      if(await existingMessageBattle(current.save,source,ids,snapshot,receiptSignal))return;
      assertStorySource(source,snapshot,true);
    }
    const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:ids?.battleId??host.crypto.randomUUID(),requestId:ids?.requestId??host.crypto.randomUUID(),seed,playerTeam:structuredClone([...prepared.party]),enemyTeam:enemies.map(e=>e.snapshot),...(plan.rules?{rules:structuredClone(plan.rules)}:{})};
    const sources=enemies.map(e=>({sourceId:e.sourceId,abilityId:e.abilityId,abilityName:e.snapshot.spellName??'主动能力',rank:RANKS.indexOf(e.portrait.query.rank as typeof RANKS[number]),enemyExternalId:e.snapshot.externalId}));
    const ticket=await service.beginStory(request,sources,plan.difficulty,ids?.battleId??host.crypto.randomUUID(),prepared.source);
    assertAlive();adapter.assertChat(snapshot.chat);
    if(source)assertStorySource(source,snapshot,true);
    await openStReplay({hostWindow:host,service,saveId:save.id,chat:save.chat,ticket,battleUrl:options.battleUrl,signal:lifecycle.signal,kind:'story'});if(!deleted)await refresh();
   }finally{storyStarting=false;}
 }
 async function prepareSavedParty(save:StSave,mode:'story'|'replay'):Promise<ReplayParty>{
   const current=await service.current();assertAlive();adapter.assertChat(save.chat);
   if(current.save?.id!==save.id)throw new Error('当前聊天存档已变化，请重新打开战斗');
   const prepared=prepareCurrentParty(current.snapshot,{...current.save.partyPreparation,save:current.save,mode});
   if(!prepared.ready)throw new Error(prepared.issues[0]?.message??'请先在编队面板完成当前队伍配置');
   return {party:structuredClone(prepared.party),source:structuredClone(current.snapshot)};
 }
 async function prepareReplay(save:StSave,encounter:EncounterRecord):Promise<ReplayParty|undefined>{
   assertModeEnabled();
   return options.prepareReplay?options.prepareReplay(save,encounter):prepareSavedParty(save,'replay');
 }
 async function action(work:()=>Promise<void>):Promise<void>{if(busy||deleted)return;try{assertAlive();}catch{return;}busy=true;notice.className='notice';notice.textContent='正在读取存档…';try{await work();if(deleted)return;notice.textContent='';}catch(error){if(deleted)return;notice.textContent=errorMessage(error,'存档操作失败');notice.className='notice error';}finally{busy=false;}}
 function button(text:string,work:()=>Promise<void>):HTMLButtonElement{const b=el('button',text);b.onclick=()=>void action(work);return b;}
 function emptyState(parent:HTMLElement,message:string,g:string):void {const empty=el('div');empty.className='empty';empty.append(glyph(g),el('p',message));parent.append(empty);}
 function portraitCard(enemy:CombatantSnapshot|undefined,name:string,rank:number):HTMLElement {
  const card=el('div');card.className=`collection-card r-${rank}`;const image=el('img');image.alt=enemy?.name??name;image.loading='lazy';
  image.src=enemy?.portraitUrl?new URL(enemy.portraitUrl,options.battleUrl??managementAsset('/')).href:managementAsset('/static/ui/card-back-vault.webp');
  const edge=el('i');edge.className='rarity-edge';const info=el('div');info.className='collection-info';info.append(el('h2',name));const subtitle=el('span');subtitle.append(el('span',enemy?.name&&enemy.name!==name?enemy.name:RANKS[rank]??''));info.append(subtitle);card.append(edge,image,info);
  if(enemy?.manaColors.length){const mana=el('span');mana.className='collection-mana';mana.innerHTML=gemSvg(enemy.manaColors.map(color=>color.toLowerCase()));card.append(mana);}
  return card;
 }
 async function refresh():Promise<void>{
   if(deleted)return;formationController?.abort();partyMount=undefined;const {snapshot,save}=await service.current();if(deleted)return;const saves=await repository.list();if(deleted)return;adapter.assertChat(snapshot.chat);clearReceiptViews();content.replaceChildren();displayedChat=chatKey(snapshot.chat);
   chatLabel.textContent=snapshot.chat.chatId;
   const context=el('div');context.className='card';context.append(el('p',`当前聊天：${snapshot.chat.chatId}`),el('small',`${saves.length} / 3 个槽位已使用`));
   const actions=el('div');actions.className='actions';actions.append(button('刷新',refresh));
   if(!save)actions.append(button('创建当前聊天存档',async()=>{adapter.assertChat(snapshot.chat);await service.create();await refresh();}));
   const input=el('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','导入当前聊天备份');input.onchange=()=>{const file=input.files?.[0];if(file)void action(async()=>{const text=await file.text();adapter.assertChat(snapshot.chat);await service.import(text);await refresh();});};
   const outcomeInput=el('input');outcomeInput.type='file';outcomeInput.accept='.json,application/json';outcomeInput.setAttribute('aria-label','导入本场战果备份');outcomeInput.onchange=()=>{const file=outcomeInput.files?.[0];if(file)void action(async()=>{await service.importReplayOutcome(await file.text());await refresh();});};
   const backupLabel=el('label','导入存档：');backupLabel.append(input);const outcomeLabel=el('label','导入战果：');outcomeLabel.append(outcomeInput);
   actions.append(backupLabel,outcomeLabel);context.append(actions);pageContent(context,'saves');
   const slots=el('section');slots.setAttribute('aria-label','存档槽位');
   for(const slot of saves){
     const card=el('article');card.className='card';card.append(el('strong',`${slot.id===save?.id?'当前 · ':''}${slot.chat.chatId}`),el('p',`${slot.encounters.length} 场胜利记录 · ${slot.learnedAbilityIds.length} 项已学能力`));
     const row=el('div');row.className='actions';row.append(button('导出备份',async()=>{const text=await repository.export(slot.id);const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));try{const link=el('a');link.href=url;link.download=`match3-${slot.id}.json`;doc.body.append(link);link.click();link.remove();}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}}));
     const remove=el('button','删除此存档');let armed=false;remove.onclick=()=>{if(!armed){armed=true;remove.textContent='确认删除此存档';return;}void action(async()=>{await service.delete(slot.id);await refresh();});};row.append(remove);card.append(row);slots.append(card);
   }
   pageContent(slots,'saves');
   const outcomes=await repository.listReplayOutcomes();if(deleted)return;adapter.assertChat(snapshot.chat);
   if(outcomes.length){
     const queue=el('section');queue.setAttribute('aria-label','待保存战果');queue.append(el('h3','待保存战果'));
     for(const outcome of outcomes){
       const card=el('article');card.className='card';card.append(el('strong',`${outcome.chat.chatId} · ${outcome.result.winner==='player'?'胜利':'败北'}`),el('p','战果已暂存。保存后展示本场实际奖励；切换聊天后仍保存到原档。'));
       card.append(button('保存本场战果',async()=>{let receipt:SettlementReceipt|undefined;let failure:unknown;try{receipt=await service.retryReplayOutcome(outcome);}catch(error){failure=error;receipt=(await repository.list()).find(s=>s.id===outcome.saveId)?.settlements.find(r=>r.battleId===outcome.result.battleId);}await refresh();if(receipt){const detail=el('div');detail.className='card report';detail.dataset.page='saves';detail.hidden=activePage!=='saves';detail.setAttribute('role','region');detail.setAttribute('aria-label','刚保存的本场结算');renderReceipt(detail,receipt,(await repository.list()).find(item=>item.id===outcome.saveId)?.encounters);content.prepend(detail);}if(failure)throw failure;}));
       card.append(button('导出本场战果',async()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(outcome,null,2)],{type:'application/json'}));const link=el('a');link.href=url;link.download=`match3-outcome-${outcome.result.battleId}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));queue.append(card);
     }pageContent(queue,'saves');
   }
   if(!save){activePage='saves';showPage(activePage);return;}
   partyMount=el('section');partyMount.setAttribute('aria-label','编队');pageContent(partyMount,'party');
   if(save.pendingStory&&!outcomes.some(o=>o.saveId===save.id)){
     const pending=el('article');pending.className='card';pending.append(el('strong','待完成的剧情战斗'),el('p','本场尚未结算。继续使用原场开局配置；战果保存后再同步酒馆人物生命。'),el('p','旧版战斗配置可能暂受限制。可先导出备份保留本场，或手动放弃未结算剧情；放弃不发放奖励、不扣除生命，也会保留已学能力与历史记录。'));
     if(options.battleUrl)pending.append(button('重新开始剧情战斗',async()=>{assertStoryRestore(save);await openStReplay({hostWindow:host,service,saveId:save.id,chat:save.chat,ticket:save.pendingStory!,battleUrl:options.battleUrl!,signal:lifecycle.signal,kind:'story'});await refresh();}));
     const battleId=save.pendingStory.request.battleId;
     const abandon=el('button','放弃未结算剧情');let armed=false;
     abandon.onclick=()=>{if(!armed){armed=true;abandon.textContent='确认放弃未结算剧情';return;}void action(async()=>{await service.abandonStory(battleId,save.revision,save.chat);await refresh();});};
     pending.append(abandon);pageContent(pending,'saves');
   }
   if(save.pendingReplay&&!outcomes.some(o=>o.saveId===save.id)){
     const pending=el('article');pending.className='card';pending.append(el('strong','待完成的往昔再现'),el('p','本场尚未结算，可从开局重新挑战，或手动放弃。'));
     if(options.battleUrl)pending.append(button('重新开始本场',async()=>{adapter.assertChat(save.chat);await playReplay(save.pendingReplay!.encounterId,{party:[]});await refresh();}));
     const abandon=el('button','放弃本场');let armed=false;abandon.onclick=()=>{if(!armed){armed=true;abandon.textContent='确认放弃本场';return;}void action(async()=>{adapter.assertChat(save.chat);await service.abandonReplay(save.pendingReplay!.request.battleId);await refresh();});};pending.append(abandon);pageContent(pending,'saves');
   }
   const collection=el('section');collection.setAttribute('aria-label','魂片收藏');collection.append(el('h3','魂片收藏'));
   if(!save.sources.length)emptyState(collection,'尚未收集灵魂碎片','soul');
   const fragments=el('div');fragments.className='collection-cards';collection.append(fragments);
   for(const source of save.sources){
    const learned=sourceIsLearned(save,source);const threshold=LEARNING_WINS[source.rank]!;
    const encounter=save.encounters.find(item=>item.sources.some(itemSource=>itemSource.sourceId===source.sourceId));const enemy=encounter?sourceEnemy(encounter.enemyTeam,encounter.sources,source.sourceId):undefined;
    const card=el('article');card.className='fragment-card';card.append(portraitCard(enemy,enemy?soulFragmentName(enemy.name):'灵魂碎片',source.rank),el('p',abilityDisplayName(source.abilityName)),el('p',learned?'已学会':`${source.wins} / ${threshold} · 还需 ${threshold-source.wins} 场有效胜利`));
    const progress=el('progress');progress.max=threshold;progress.value=learned?threshold:source.wins;progress.setAttribute('aria-label',`${enemy?.name??'灵魂碎片'}学习进度`);card.append(progress);fragments.append(card);
   }
   pageContent(collection,'collection');
   const bestiary=el('section');bestiary.setAttribute('aria-label','往昔再现');bestiary.append(el('h3','往昔再现'));
   if(!save.encounters.length)emptyState(bestiary,'尚无战胜的敌方队伍','book');
   for(const encounter of save.encounters){const card=el('article');card.className='card';card.append(el('strong',encounter.enemyTeam.map(e=>e.name).join(' · ')),el('p',canReplay(save,encounter)?'尚有未学会能力':'本场能力已全部学会，挑战已结束'));
     const lineup=el('div');lineup.className='encounter-lineup';for(const enemy of encounter.enemyTeam){const source=encounter.sources.find(item=>item.enemyExternalId===enemy.externalId);lineup.append(portraitCard(enemy,enemy.name,source?.rank??0));}card.append(lineup);
     const preview=el('details');preview.append(el('summary','查看原场敌方配置'));
     for(const enemy of encounter.enemyTeam){const row=el('div');row.className='card enemy';
       if(enemy.portraitUrl){const image=el('img');image.alt=enemy.name;image.loading='lazy';image.src=new URL(enemy.portraitUrl,options.battleUrl??managementAsset('/')).href;row.append(image);}
       const info=el('div');info.append(el('strong',`${enemy.name}${enemy.levelLabel?` · 等级 ${enemy.levelLabel}`:''}`),...(enemy.race?[el('p',`种族：${enemy.race}`)]:[]),el('p',`生命 ${enemy.stats.hp} · 攻击 ${enemy.stats.attack} · 护甲 ${enemy.stats.armor} · 法强 ${enemy.stats.magic}`),el('p',`法力 ${enemy.manaColors.join(' / ')} · 消耗 ${enemy.manaCost}`),el('p',`${enemy.spellName??enemy.skillId??'主动能力'}${enemy.spellDescription?`：${abilityDisplayText(enemy.spellDescription,enemy.stats.magic)}`:''}`));
       for(const trait of enemy.traitIds??[])info.append(el('small',`${enemy.traitNames?.[trait]??trait} `));row.append(info);preview.append(row);
     }card.append(preview);
     if(canReplay(save,encounter)&&!save.pendingReplay&&!save.pendingStory&&options.battleUrl)card.append(button('重复挑战',async()=>{adapter.assertChat(save.chat);const prepared=await prepareReplay(save,encounter);if(!prepared)return;adapter.assertChat(save.chat);await playReplay(encounter.id,prepared);await refresh();}));bestiary.append(card);}
   pageContent(bestiary,'replay');
   const reports=el('section');reports.setAttribute('aria-label','战斗记录');reports.append(el('h3','战斗记录'));
   if(!save.settlements.length)emptyState(reports,'尚无战斗记录','book');
   for(const receipt of [...save.settlements].reverse()){const card=el('article');card.className='card report';const toggle=el('button',`${receipt.kind==='story'?'剧情':'再现'} · ${receipt.winner==='player'?'胜利':'败北'} · ${receipt.request.enemyTeam.map(enemy=>enemy.name).join('、')}`);const detail=el('div');detail.hidden=true;toggle.onclick=()=>{detail.hidden=!detail.hidden;if(!detail.hidden)renderReceipt(detail,receipt,save.encounters);};card.append(toggle,detail);reports.append(card);}
   pageContent(reports,'history');showPage(activePage);
 }
 async function open():Promise<void>{assertAlive();try{assertModeEnabled();}catch(error){host.alert(errorMessage(error,'读取三消模式失败'));return;}panel.hidden=false;await action(refresh);if(!deleted)close.focus();}
 if(launch)launch.onclick=()=>void open();
 const chatWatcher=host.setInterval(()=>{
   if(deleted)return;try{assertAlive();}catch{destroy();return;}if(panel.hidden)return;
   let currentChat='';try{currentChat=chatKey(adapter.binding());}catch{/* Show the host's current error on refresh. */}
   if(currentChat&&currentChat===displayedChat)return;
   clearReceiptViews();content.replaceChildren();displayedChat='';
   if(!busy)void action(refresh).then(()=>{if(!deleted&&!panel.hidden&&!notice.textContent){notice.className='notice';notice.textContent='当前聊天已切换，已载入当前聊天。';}});
 },400);
 function destroy():void{
   if(deleted)return;deleted=true;host.clearInterval(chatWatcher);lifecycle.abort();
   options.signal?.removeEventListener('abort',destroy);host.removeEventListener('pagehide',destroy);
   if(options.runtimeLifecycle!==false&&window!==host)window.removeEventListener('pagehide',destroy);
   formationController?.abort();clearReceiptViews();root.remove();repository.close();
 }
 options.signal?.addEventListener('abort',destroy,{once:true});host.addEventListener('pagehide',destroy);
 if(options.runtimeLifecycle!==false&&window!==host)window.addEventListener('pagehide',destroy);
 return {get destroyed(){return deleted;},assertActive:assertAlive,service,open,playStory,messageStoryState,playMessageStory,playReplay,destroy};
}
