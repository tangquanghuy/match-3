import {test,expect} from '@playwright/test';
import type {Page,Frame} from '@playwright/test';
import type {StHostHandle,StoryPlan} from '../../src/sillytavern/hostEntry';
import type {MvuData,TavernHelpers} from '../../src/sillytavern/hostAdapter';
import type {ChatBinding} from '../../src/sillytavern/save';
import type {App} from '../../src/render/App';

interface FixtureChatVariables extends Record<string,unknown> {
 match3?:{chat?:ChatBinding;encounter?:unknown;[key:string]:unknown};
}
interface EmbeddingSnapshot {
 state:MvuData;
 variables:Record<string,FixtureChatVariables>;
 writes:number;
}
interface EmbeddingFixture {
 helpers:TavernHelpers;
 setAccount(id:string):void;
 accountId():string|null;
 setChat(id:string):void;
 setPlan(plan:unknown):void;
 read():EmbeddingSnapshot;
}
interface EmbeddingMessage {type:string;origin:string;fromParent:boolean}
type EmbeddingFixtureWindow=Window & {
 embeddingFixture:EmbeddingFixture;
 embeddedHost:StHostHandle;
 oldEmbeddedHost:StHostHandle;
 embeddedPlan:StoryPlan;
 embeddedStory:Promise<void>;
 embeddedStoryError?:string;
 abortEmbeddedHost():void;
 reinstallEmbeddedHost():Promise<StHostHandle>;
 embeddingMessages:EmbeddingMessage[];
 heldEmbeddingReady:{data:unknown;origin:string;source:MessageEventSource|null};
 __stReplayApp?:App;
};

// Modules execute inside a helper iframe; UI, API and storage belong to the other host origin.
async function installEmbedded(page:Page,assetOrigin:string,accounts=false):Promise<Frame>{
 const hostOrigin=new URL(assetOrigin);const deployment=new URL(assetOrigin);deployment.hostname=hostOrigin.hostname==='localhost'?'127.0.0.1':'localhost';assetOrigin=deployment.origin;
 // Reuse Vite under two hostnames: actual loopback requests exercise CORS and origin storage.
 // ST06 still blocks story preparation with temporary HP; use zero here to test
 // the embedding chain independently. This fixture does not resolve that gap.
 await page.addInitScript(()=>{(window as unknown as EmbeddingFixtureWindow).embeddingMessages=[];window.addEventListener('message',event=>{if(event.data?.channel==='match3:st-replay:v1')(window as unknown as EmbeddingFixtureWindow).embeddingMessages.push({type:event.data.type,origin:event.origin,fromParent:event.source===window.parent});});});
 await page.goto(new URL('/sillytavern-battle.html',hostOrigin).href);
 await page.evaluate((accounts)=>{
  let account="account-A";const accountStores:Record<string,Record<string,string>>={};
  const accountStorage={getItem:(key:string)=>accountStores[account]?.[key]??null,setItem:(key:string,value:string)=>{(accountStores[account]??={})[key]=value;}};
  let chatId='chat-A';const variables:Record<string,FixtureChatVariables>={};let writes=0;
  const state={stat_data:{人物:{名称:'旅人',等级:20,当前生命值:200,生命值上限:200,临时生命值:0,AC:14,
   属性:{力量:16,敏捷:12,体质:14,智力:18,感知:12,魅力:10},战斗属性:{武器面板:{伤害骰:'2d6',等级系数:3,固定伤害:100},物理减伤:20,魔法减伤:0,每回合动作资源:{攻击次数:2}},装备列表:{}},系统配置:{战斗数值模式:'classic'}}};
  const helpers:TavernHelpers={getContext:()=>({...(accounts?{accountStorage}:{}),characterId:0,characters:[{avatar:'embedded.png'}],chat:[{swipe_id:0}],getCurrentChatId:()=>chatId}),
   getVariables:()=>structuredClone(variables[chatId]??{}),
   updateVariablesWith:(fn:(v:Record<string,unknown>)=>Record<string,unknown>)=>variables[chatId]=fn(structuredClone(variables[chatId]??{})),
   Mvu:{getMvuData:()=>structuredClone(state),replaceMvuData:async(next:MvuData)=>{writes++;Object.assign(state,structuredClone(next));}}};
  Object.assign(window,{embeddingFixture:{helpers,setAccount:(id:string)=>{account=id;},accountId:()=>accountStorage.getItem("match3.host-account.v1"),setChat:(id:string)=>{chatId=id;},setPlan:(plan:unknown)=>{const current=variables[chatId]??{};variables[chatId]={...current,match3:{...(current.match3 as object??{}),encounter:plan}};},read:()=>structuredClone({state,variables,writes})}});
  const frame=document.createElement('iframe');frame.name='tavern-helper';frame.title='助手脚本';frame.srcdoc='<!doctype html><body>助手脚本夹具</body>';document.body.append(frame);
 },accounts);
 await expect.poll(()=>page.frame({name:'tavern-helper'})?.url()).toBe('about:srcdoc');
 const helper=page.frame({name:'tavern-helper'})!;
 await helper.evaluate(async(assetOrigin)=>{
  const path=assetOrigin+'/src/sillytavern/hostEntry.ts';const {installStHost}=await import(/* @vite-ignore */path) as typeof import('../../src/sillytavern/hostEntry');
  const host=window.parent;const fixture=(host as unknown as EmbeddingFixtureWindow).embeddingFixture;const lifecycle=new AbortController();
  const install=async()=>{
   const handle=await installStHost({hostWindow:host,helpers:fixture.helpers,hostId:'embedding-host',battleUrl:assetOrigin+'/sillytavern-battle.html',signal:lifecycle.signal});
   Object.assign(host,{embeddedHost:handle,abortEmbeddedHost:()=>lifecycle.abort()});return handle;
  };
  Object.assign(host,{reinstallEmbeddedHost:install});const handle=await install();
  const portraitPath=assetOrigin+'/src/sillytavern/portraits.ts';const blueprintPath=assetOrigin+'/src/sillytavern/enemyBlueprint.ts';
  const [{PORTRAITS,savePortrait},{compileEnemyBlueprint}]=await Promise.all([import(/* @vite-ignore */portraitPath) as Promise<typeof import('../../src/sillytavern/portraits')>,import(/* @vite-ignore */blueprintPath) as Promise<typeof import('../../src/sillytavern/enemyBlueprint')>]);
  const portrait=PORTRAITS[0];const query={manaColors:[...portrait.manaColors],rank:portrait.rank,form:portrait.form,role:portrait.role};
  const enemy=compileEnemyBlueprint({portrait:savePortrait(query,portrait),externalId:'embedded-enemy',level:1,difficulty:1});
  Object.assign(host,{embeddedPlan:{enemies:[enemy],difficulty:'嵌入联调',seed:20261024}});
  await handle.service.create();await handle.open();
 },assetOrigin);
 return helper;
}
async function configurePlan(page:Page):Promise<void>{await page.evaluate(()=>(window as unknown as EmbeddingFixtureWindow).embeddingFixture.setPlan((window as unknown as EmbeddingFixtureWindow).embeddedPlan));}
async function startStory(page:Page):Promise<void>{
 await page.evaluate(()=>{
  const w=window as unknown as EmbeddingFixtureWindow;delete w.embeddedStoryError;
  // playStory stays pending until the real battle closes; retain its completion
  // separately so browser interactions can exercise the iframe and fullscreen.
  w.embeddedStory=w.embeddedHost.playStory(w.embeddedPlan).catch(error=>{w.embeddedStoryError=String(error);});
 });
 await expect.poll(()=>page.evaluate(()=>({open:!!document.querySelector('#st-match3-story-root'),error:(window as unknown as EmbeddingFixtureWindow).embeddedStoryError??null}))).toEqual({open:true,error:null});
 await expect(page.locator('#st-match3-host-root section.panel.management-page')).toBeHidden();
 await expect(page.getByRole('dialog',{name:'剧情战斗队伍准备'})).toHaveCount(0);
}
async function launchStory(page:Page):Promise<Frame>{
 await configurePlan(page);await startStory(page);
 await expect(page.frameLocator('iframe[title="剧情三消战场"]').locator('.gcard.ally')).toHaveCount(1,{timeout:30_000});
 return page.frames().find(frame=>frame.parentFrame()!==null&&frame.url().includes('sillytavern-battle.html'))!;
}

test('management has no story action and the story API rejects missing and invalid encounters without battles or rewards',async({page,baseURL})=>{
 await installEmbedded(page,baseURL!);const host=page.locator('#st-match3-host-root');
 await expect(host.getByRole('heading',{name:'编队与养成',exact:true})).toBeVisible();
 await expect(host.getByRole('tab',{name:'编队与能力装配',exact:true})).toHaveAttribute('aria-selected','true');
 for(const name of ['编队与能力装配','魂片收藏','往昔再现','战斗记录','存档']){
  await host.getByRole('tab',{name,exact:true}).click();
  await expect(host.getByRole('button',{name:/剧情挑战/,includeHidden:true})).toHaveCount(0);
  await expect(host.getByRole('region',{name:'确认剧情挑战',includeHidden:true})).toHaveCount(0);
 }
 const before=await page.evaluate(()=>(window as unknown as EmbeddingFixtureWindow).embeddingFixture.read());
 const failures=await page.evaluate(async()=>{
  const w=window as unknown as EmbeddingFixtureWindow;const errors:string[]=[];
  for(const plan of [undefined,{difficulty:'坏配置',enemies:[]},{difficulty:'坏配置',enemies:[{}]}]){
   try{await w.embeddedHost.playStory(plan as unknown as StoryPlan);errors.push('unexpected success');}catch(error){errors.push(String(error));}
  }
  return errors;
 });
 expect(failures).toHaveLength(3);expect(failures[0]).toContain('match3.encounter');expect(failures[1]).toContain('1 至 4');expect(failures[2]).not.toBe('unexpected success');
 expect(await page.evaluate(()=>(window as unknown as EmbeddingFixtureWindow).embeddingFixture.read())).toEqual(before);
 const save=await page.evaluate(async()=>(await (window as unknown as EmbeddingFixtureWindow).embeddedHost.service.current()).save!);
 expect(save.pendingStory).toBeUndefined();expect(save.settlements).toEqual([]);expect(save.balances).toEqual({});expect(save.encounters).toEqual([]);
 await expect(page.locator('#st-match3-story-root')).toHaveCount(0);
});

test('story API opens a real cross-origin battle and browser fullscreen, then cleans up',async({page,baseURL})=>{
 await page.setViewportSize({width:390,height:844});
 await installEmbedded(page,baseURL!);
 // Tavern extensions can transform a zero-height root: fixed overlays must size
 // themselves from the viewport rather than that containing block's height.
 await page.addStyleTag({content:'html{height:0;transform:translateZ(0)}body{position:fixed;inset:0;height:100dvh}'});
 const panel=page.locator('#st-match3-host-root section.panel.management-page');
 await expect(panel).toHaveAttribute('aria-label','三消编队、图鉴与魂片');
 await expect.poll(()=>panel.boundingBox()).toEqual({x:0,y:0,width:390,height:844});
 const frame=await launchStory(page);const battle=page.locator('#st-match3-story-root');
 expect(new URL(frame.url()).origin).not.toBe(new URL(page.url()).origin);
 await expect.poll(async()=>(await battle.boundingBox())?.height).toBe(844);
 await expect(battle.locator('.bar')).toBeHidden();
 await expect(battle.getByRole('button',{name:'全屏',exact:true})).toHaveCount(0);
 await frame.getByRole('button',{name:'全屏',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.id)).toBe('st-match3-story-root');
 await expect(frame.getByRole('button',{name:'全屏',exact:true})).toHaveCount(1);
 expect(await battle.locator('iframe').getAttribute('allow')).toContain('fullscreen');
 expect(await frame.evaluate(async()=>(await indexedDB.databases()).map(db=>db.name))).not.toContain('match3.sillytavern.v1');
 const before=await page.evaluate(async()=>({save:(await (window as unknown as EmbeddingFixtureWindow).embeddedHost.service.current()).save!,fixture:(window as unknown as EmbeddingFixtureWindow).embeddingFixture.read()}));
 expect(before.save.pendingStory).toBeTruthy();expect(before.save.settlements).toEqual([]);expect(before.fixture.writes).toBe(0);
 expect(before.fixture.variables['chat-A'].match3!.chat!.chatId).toBe('chat-A');
 await page.evaluate(()=>(window as unknown as EmbeddingFixtureWindow).abortEmbeddedHost());
 await expect(battle).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>document.fullscreenElement)).toBeNull();
 await page.evaluate(()=>(window as unknown as EmbeddingFixtureWindow).abortEmbeddedHost());await expect(page.locator('#st-match3-host-root')).toHaveCount(0);

});

test('story API stays bound to its chat during async preparation and helper destruction preserves the pending battle',async({page,baseURL})=>{
 const helper=await installEmbedded(page,baseURL!);await configurePlan(page);const host=page.locator('#st-match3-host-root');
 const failure=await page.evaluate(async()=>{
  const w=window as unknown as EmbeddingFixtureWindow;const service=w.embeddedHost.service;const current=service.current.bind(service);
  // Change the chat after reading its snapshot, before preparation resumes.
  service.current=async()=>{const result=await current();w.embeddingFixture.setChat('chat-B');return result;};
  try{await w.embeddedHost.playStory(w.embeddedPlan);return 'unexpected success';}catch(error){return String(error);}finally{service.current=current;}
 });
 expect(failure).toContain('聊天已切换');
 await expect(page.locator('#st-match3-story-root')).toHaveCount(0);
 await expect(page.getByRole('dialog',{name:'剧情战斗队伍准备'})).toHaveCount(0);
 const untouched=await page.evaluate(async()=>(await (window as unknown as EmbeddingFixtureWindow).embeddedHost.service.repository.list()).find(save=>save.chat.chatId==='chat-A')!);
 expect(untouched.pendingStory).toBeUndefined();expect(untouched.settlements).toEqual([]);expect(untouched.balances).toEqual({});
 await page.evaluate(async()=>{(window as unknown as EmbeddingFixtureWindow).embeddingFixture.setChat('chat-A');await (window as unknown as EmbeddingFixtureWindow).embeddedHost.open();});
 await startStory(page);
 await expect(page.locator('#st-match3-story-root iframe')).toBeVisible();
 const pending=await page.evaluate(async()=>(await (window as unknown as EmbeddingFixtureWindow).embeddedHost.service.current()).save!.pendingStory);
 expect(pending).toBeTruthy();
 await helper.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
 await expect(page.getByRole('dialog',{name:'剧情战斗队伍准备'})).toHaveCount(0);await expect(host).toHaveCount(0);
 await expect(page.locator('#st-match3-story-root')).toHaveCount(0);
 const saves=await page.evaluate(async()=>{
  const Repository=(window as unknown as EmbeddingFixtureWindow).embeddedHost.service.repository.constructor as typeof import('../../src/sillytavern/saveRepository').StSaveRepository;
  const repo=await Repository.open(window.indexedDB);
  try{return await repo.list();}finally{repo.close();}
 });
 expect(saves.find(save=>save.chat.chatId==='chat-A')!.pendingStory).toEqual(pending);
 expect(saves.every(save=>save.settlements.length===0)).toBe(true);
 const snapshot=await page.evaluate(()=>(window as unknown as EmbeddingFixtureWindow).embeddingFixture.read());expect(snapshot.writes).toBe(0);
});

test('cross-origin bridge rejects foreign windows, origins and nonces while preserving the original chat ticket',async({page,baseURL})=>{
 await installEmbedded(page,baseURL!);const frame=await launchStory(page);const battle=page.locator('#st-match3-story-root');
 const nonce=new URL(frame.url()).searchParams.get('nonce')!;
 await frame.evaluate(nonce=>window.parent.postMessage({channel:'match3:st-replay:v1',nonce:'wrong-'+nonce,type:'error',message:'FORGED NONCE'},'*'),nonce);
 await page.evaluate(({nonce,assetOrigin})=>{
  window.postMessage({channel:'match3:st-replay:v1',nonce,type:'error',message:'FOREIGN WINDOW'},location.origin);
  const source=document.querySelector('#st-match3-story-root')!.shadowRoot!.querySelector('iframe')!.contentWindow;
  window.dispatchEvent(new MessageEvent('message',{origin:assetOrigin+'-wrong',source,data:{channel:'match3:st-replay:v1',nonce,type:'error',message:'FOREIGN ORIGIN'}}));
 },{nonce,assetOrigin:baseURL!});
 await page.evaluate(async()=>{(window as unknown as EmbeddingFixtureWindow).embeddingFixture.setChat('chat-B');await (window as unknown as EmbeddingFixtureWindow).embeddedHost.service.create();});
 await expect(battle.locator('.bar')).toBeHidden();
 await expect(battle).not.toContainText(/FORGED NONCE|FOREIGN WINDOW|FOREIGN ORIGIN/);
 const saves=await page.evaluate(async()=>(await (window as unknown as EmbeddingFixtureWindow).embeddedHost.service.repository.list()));
 expect(saves.find((s)=>s.chat.chatId==='chat-A')!.pendingStory).toBeTruthy();expect(saves.find((s)=>s.chat.chatId==='chat-B')!.pendingStory).toBeUndefined();
 await page.evaluate(()=>(window as unknown as EmbeddingFixtureWindow).embeddedHost.destroy());await expect(battle).toHaveCount(0);
});

test('a denied native fullscreen request keeps the embedded battle usable',async({page,baseURL})=>{
 const warnings:string[]=[];page.on('console',message=>{if(message.type()==='warning')warnings.push(message.text());});
 await installEmbedded(page,baseURL!);const frame=await launchStory(page);const battle=page.locator('#st-match3-story-root');
 await frame.evaluate(()=>{HTMLElement.prototype.requestFullscreen=()=>Promise.reject(new Error('fixture permission denied'));});
 await frame.getByRole('button',{name:'全屏',exact:true}).click();
 await expect.poll(()=>warnings.some(message=>message.includes('fixture permission denied'))).toBe(true);
 await expect(battle.locator('.bar')).toBeHidden();
 await expect(battle.getByRole('button',{name:'全屏',exact:true})).toHaveCount(0);
 await expect(frame.locator('.gcard.ally')).toHaveCount(1);
 await page.evaluate(()=>(window as unknown as EmbeddingFixtureWindow).embeddedHost.destroy());await expect(battle).toHaveCount(0);
});


test('account databases isolate visible slots and pending battles while chat changes keep their account namespace',async({page,baseURL})=>{
 await installEmbedded(page,baseURL!,true);await launchStory(page);
 const accountA=(await page.evaluate(()=>(window as unknown as EmbeddingFixtureWindow).embeddingFixture.accountId()))!;expect(accountA).toBeTruthy();
 await page.evaluate(async()=>{const w=window as unknown as EmbeddingFixtureWindow;for(const id of ['chat-B','chat-C']){w.embeddingFixture.setChat(id);await w.embeddedHost.service.create();}w.embeddingFixture.setChat('chat-D');});
 const capacityA=await page.evaluate(async()=>{try{await (window as unknown as EmbeddingFixtureWindow).embeddedHost.service.create();return '';}catch(error){return String(error);}});expect(capacityA).toContain('三个存档槽位已满');
 const databasesA=await page.evaluate(async()=>(await indexedDB.databases()).map(db=>db.name).filter(name=>name?.startsWith('match3.sillytavern.v1')));
 expect(databasesA).toEqual(['match3.sillytavern.v1.account.'+encodeURIComponent(accountA)]);
 // An account switch invalidates an already open battle, panel and repository.
 const blocked=await page.evaluate(async()=>{const w=window as unknown as EmbeddingFixtureWindow;w.oldEmbeddedHost=w.embeddedHost;w.embeddingFixture.setAccount('account-B');try{await w.oldEmbeddedHost.open();return '';}catch(error){return String(error);}});
 expect(blocked).toContain('账号已切换');await expect(page.locator('#st-match3-host-root')).toHaveCount(0);await expect(page.locator('#st-match3-story-root')).toHaveCount(0);
 expect(await page.evaluate(async()=>{try{await (window as unknown as EmbeddingFixtureWindow).oldEmbeddedHost.service.repository.list();return false;}catch{return true;}})).toBe(true);
 await page.evaluate(async()=>{const w=window as unknown as EmbeddingFixtureWindow;w.embeddingFixture.setChat('chat-A');await w.reinstallEmbeddedHost();await w.embeddedHost.open();});
 await expect(page.locator('#st-match3-host-root').getByRole('button',{name:'创建当前聊天存档',exact:true})).toBeVisible();
 const accountB=await page.evaluate(()=>(window as unknown as EmbeddingFixtureWindow).embeddingFixture.accountId());expect(accountB).not.toBe(accountA);
 const emptyB=await page.evaluate(async()=>{const repo=(window as unknown as EmbeddingFixtureWindow).embeddedHost.service.repository;return {slots:await repo.list(),outcomes:await repo.listReplayOutcomes()};});expect(emptyB).toEqual({slots:[],outcomes:[]});
 await page.evaluate(async()=>{const w=window as unknown as EmbeddingFixtureWindow;for(const id of ['chat-A','chat-B','chat-C']){w.embeddingFixture.setChat(id);await w.embeddedHost.service.create();}});
 expect(await page.evaluate(async()=>(await (window as unknown as EmbeddingFixtureWindow).embeddedHost.service.repository.list()).every((s)=>!s.pendingStory))).toBe(true);
 // Return to A: its three slots and original pending battle survive, without B's data.
 await page.evaluate(async()=>{const w=window as unknown as EmbeddingFixtureWindow;w.embeddedHost.destroy();w.embeddingFixture.setAccount('account-A');w.embeddingFixture.setChat('chat-A');await w.reinstallEmbeddedHost();await w.embeddedHost.open();});
 const restored=await page.evaluate(async()=>(await (window as unknown as EmbeddingFixtureWindow).embeddedHost.service.repository.list()));expect(restored).toHaveLength(3);expect(restored.find((s)=>s.chat.chatId==='chat-A')!.pendingStory).toBeTruthy();
 await page.locator('#st-match3-host-root').getByRole('tab',{name:'存档',exact:true}).click();
 await expect(page.locator('#st-match3-host-root').getByText('待完成的剧情战斗',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as unknown as EmbeddingFixtureWindow).embeddingFixture.accountId())).toBe(accountA);
 await page.evaluate(()=>(window as unknown as EmbeddingFixtureWindow).embeddedHost.destroy());
});


test('battle accepts startup only from the pinned helper window even for another sender on the host origin',async({page,baseURL})=>{
 await installEmbedded(page,baseURL!);await configurePlan(page);
 // Hold the real ready notification so forged start messages arrive before any
 // App exists. Replaying it later invokes the normal launcher and real helper.
 await page.evaluate(()=>{const hold=(event:MessageEvent)=>{if(event.data?.channel!=='match3:st-replay:v1'||event.data.type!=='ready')return;event.stopImmediatePropagation();(window as unknown as EmbeddingFixtureWindow).heldEmbeddingReady={data:event.data,origin:event.origin,source:event.source};window.removeEventListener('message',hold);};window.addEventListener('message',hold);});
 await startStory(page);
 await page.waitForFunction(()=>(window as unknown as EmbeddingFixtureWindow).heldEmbeddingReady);
 const frame=page.frames().find(f=>f.parentFrame()!==null&&f.url().includes('sillytavern-battle.html'))!;
 const send=async(from:Page|Frame)=>from.evaluate(async()=>{const w=window.parent===window?window:window.parent;const root=w.document.querySelector('#st-match3-story-root')!;const frame=root.shadowRoot!.querySelector('iframe')!;const params=new URL(frame.src).searchParams;const request=(await (w as unknown as EmbeddingFixtureWindow).embeddedHost.service.current()).save!.pendingStory!.request;frame.contentWindow!.postMessage({channel:'match3:st-replay:v1',nonce:params.get('nonce'),type:'start',request},new URL(frame.src).origin);});
 await send(page);
 await page.evaluate(()=>{const sibling=document.createElement('iframe');sibling.name='untrusted-helper';sibling.srcdoc='<!doctype html><body>other script</body>';document.body.append(sibling);});
 await expect.poll(()=>page.frame({name:'untrusted-helper'})?.url()).toBe('about:srcdoc');await send(page.frame({name:'untrusted-helper'})!);
 await expect.poll(()=>frame.evaluate(()=>(window as unknown as EmbeddingFixtureWindow).embeddingMessages.filter((m)=>m.type==='start').length)).toBe(2);
 expect(await frame.evaluate(()=>(window as unknown as EmbeddingFixtureWindow).__stReplayApp===undefined)).toBe(true);
 await page.evaluate(()=>{const event=(window as unknown as EmbeddingFixtureWindow).heldEmbeddingReady;window.dispatchEvent(new MessageEvent('message',event));});
 await expect(page.frameLocator('iframe[title="剧情三消战场"]').locator('.gcard.ally')).toHaveCount(1);
 expect(new URL(frame.url()).origin).not.toBe(new URL(page.url()).origin);
 await page.evaluate(()=>(window as unknown as EmbeddingFixtureWindow).embeddedHost.destroy());
});


test('battle startup timeout exposes the existing return action and preserves the ticket',async({page,baseURL})=>{
 await installEmbedded(page,baseURL!);await configurePlan(page);
 await page.route('**/sillytavern-battle.html?**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><body></body>'}));
 await page.clock.install();
 await startStory(page);
 const battle=page.locator('#st-match3-story-root');await expect(battle).toBeVisible();
 await expect(battle.locator('.bar')).toBeHidden();await page.clock.fastForward(30_001);
 await expect(battle.getByRole('status')).toContainText('战场加载超时');
 await battle.getByRole('button',{name:'返回',exact:true}).click();await expect(battle).toHaveCount(0);
 expect(await page.evaluate(async()=>!!(await (window as unknown as EmbeddingFixtureWindow).embeddedHost.service.current()).save!.pendingStory)).toBe(true);
});

test('failed outcome staging exits native fullscreen and exposes retry and export',async({page,baseURL})=>{
 await installEmbedded(page,baseURL!);const frame=await launchStory(page);const battle=page.locator('#st-match3-story-root');
 await frame.getByRole('button',{name:'全屏',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.id)).toBe('st-match3-story-root');
 const ids=await page.evaluate(async()=>{
  const service=(window as unknown as EmbeddingFixtureWindow).embeddedHost.service;
  const request=(await service.current()).save!.pendingStory!.request;
  service.stageReplayOutcome=async()=>{throw new Error('fixture staging failure');};
  return {battleId:request.battleId,requestId:request.requestId};
 });
 await frame.evaluate(result=>{const params=new URLSearchParams(location.search);window.parent.postMessage({channel:'match3:st-replay:v1',nonce:params.get('nonce'),type:'result',result,events:[]},params.get('parentOrigin')!);},ids);
 await expect(battle.getByRole('status')).toContainText('fixture staging failure');
 await expect.poll(()=>page.evaluate(()=>document.fullscreenElement)).toBeNull();
 await expect(battle.getByRole('button',{name:'继续',exact:true})).toBeDisabled();
 await battle.getByRole('button',{name:'重试保存战果',exact:true}).click({trial:true});
 await battle.getByRole('button',{name:'导出本场战果',exact:true}).click({trial:true});
 await page.evaluate(()=>(window as unknown as EmbeddingFixtureWindow).embeddedHost.destroy());
});
