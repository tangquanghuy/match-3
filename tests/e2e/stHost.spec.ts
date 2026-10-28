import {test,expect} from '@playwright/test';

test('ST host entry manages real IndexedDB slots and acknowledged character colors in the host origin',async({page})=>{
 await page.goto('/sillytavern.html');
 await page.evaluate(async()=>{
   const entryPath='/src/sillytavern/hostEntry.ts';const {installStHost}=await import(/* @vite-ignore */entryPath) as typeof import('../../src/sillytavern/hostEntry');
   let chatId='chat-one';const chatVariables:Record<string,Record<string,unknown>>={};
   const state={stat_data:{人物:{名称:'主角',当前生命值:23,生命值上限:40,临时生命值:7},羁绊列表:{同伴甲:{同行誓约:true,当前生命值:15}}}};
   const helpers={getContext:()=>({characterId:0,characters:[{avatar:'stable.png'}],chat:[{swipe_id:0}],getCurrentChatId:()=>chatId}),getVariables:()=>structuredClone(chatVariables[chatId]??{}),updateVariablesWith:(update:(v:Record<string,unknown>)=>Record<string,unknown>)=>{chatVariables[chatId]=update(structuredClone(chatVariables[chatId]??{}));return chatVariables[chatId];},Mvu:{getMvuData:()=>structuredClone(state),replaceMvuData:async(next:typeof state)=>{Object.assign(state,structuredClone(next));}}};
   const handle=await installStHost({hostWindow:window,helpers,hostId:'test-host'});
   Object.assign(window,{stHost:handle,switchStChat:(id:string)=>{chatId=id;},readStState:()=>structuredClone({state,chatVariables})});await handle.open();
 });
 const host=page.locator('#st-match3-host-root');
 await expect(host.getByText('0 / 3 个槽位已使用')).toBeVisible();
 await host.getByRole('button',{name:'创建当前聊天存档'}).click();
 await expect(host.getByText('1 / 3 个槽位已使用')).toBeVisible();
 const first=await page.evaluate(async()=>{
   const h=(window as any).stHost;await h.service.initializeCompanions([{name:'同伴甲',colors:['Blue','Green']}]);return (await h.service.current()).save;
 });
 expect(first.companionColors).toEqual({同伴甲:['Blue','Green']});
 await page.reload();
 // The module may execute in a script iframe, but all durable data belongs to the passed host window.
 const stored=await page.evaluate(async()=>{const repositoryPath='/src/sillytavern/saveRepository.ts';const {StSaveRepository}=await import(/* @vite-ignore */repositoryPath) as typeof import('../../src/sillytavern/saveRepository');const repo=await StSaveRepository.open(window.indexedDB);try{return await repo.list();}finally{repo.close();}});
 expect(stored).toHaveLength(1);expect(stored[0].id).toBe(first.id);expect(stored[0].companionColors).toEqual(first.companionColors);
});

test('ST host slot UI requires manual deletion for a fourth chat and opens old bindings',async({page})=>{
 await page.goto('/sillytavern.html');
 await page.evaluate(async()=>{
   const entryPath='/src/sillytavern/hostEntry.ts';const {installStHost}=await import(/* @vite-ignore */entryPath) as typeof import('../../src/sillytavern/hostEntry');let chatId='one';const vars:Record<string,Record<string,unknown>>={};
   const helpers={getContext:()=>({characterId:0,characters:[{avatar:'card.png'}],chat:[{}],getCurrentChatId:()=>chatId}),getVariables:()=>vars[chatId]??{},updateVariablesWith:(fn:(v:Record<string,unknown>)=>Record<string,unknown>)=>vars[chatId]=fn(vars[chatId]??{}),Mvu:{getMvuData:()=>({stat_data:{人物:{名称:'主角'}}}),replaceMvuData:async()=>{}}};
   const handle=await installStHost({hostWindow:window,helpers,hostId:'test-host'});Object.assign(window,{stHost:handle,switchStChat:(id:string)=>{chatId=id;}});
   for(const id of ['one','two','three']){chatId=id;await handle.service.create();}chatId='four';await handle.open();
 });
 const host=page.locator('#st-match3-host-root');await host.getByRole('button',{name:'创建当前聊天存档'}).click();
 await expect(host.getByRole('status')).toContainText('手动删除');await expect(host.getByText('3 / 3 个槽位已使用')).toBeVisible();
 await host.getByRole('button',{name:'删除此存档',exact:true}).nth(1).click();await host.getByRole('button',{name:'确认删除此存档'}).click();
 await expect(host.getByText('2 / 3 个槽位已使用')).toBeVisible();await host.getByRole('button',{name:'创建当前聊天存档'}).click();
 await expect(host.getByText('当前 · four')).toBeVisible();
 await page.evaluate(async()=>{(window as any).switchStChat('one');await (window as any).stHost.open();});
 await expect(host.getByText('当前 · one')).toBeVisible();await expect(host.getByRole('button',{name:'创建当前聊天存档'})).toHaveCount(0);
 const chats=await page.evaluate(async()=>{const saves=await (window as any).stHost.service.repository.list();return saves.map((s:any)=>s.chat.chatId);});expect(chats).toEqual(['one','three','four']);
});


test('open slot panel follows chat changes and rejects a stale create action',async({page})=>{
 await page.goto('/sillytavern.html');
 await page.evaluate(async()=>{
   const path='/src/sillytavern/hostEntry.ts';const {installStHost}=await import(/* @vite-ignore */path);let chatId='A';const vars:Record<string,Record<string,unknown>>={};
   const helpers={getContext:()=>({characterId:0,characters:[{avatar:'card.png'}],chat:[{}],getCurrentChatId:()=>chatId}),getVariables:()=>vars[chatId]??{},updateVariablesWith:(fn:(v:Record<string,unknown>)=>Record<string,unknown>)=>vars[chatId]=fn(vars[chatId]??{}),Mvu:{getMvuData:()=>({stat_data:{人物:{名称:'主角'}}}),replaceMvuData:async()=>{}}};
   const handle=await installStHost({hostWindow:window,helpers,hostId:'test-host'});Object.assign(window,{stHost:handle,switchStChat:(id:string)=>{chatId=id;}});await handle.open();
   chatId='B';const shadow=document.querySelector('#st-match3-host-root')!.shadowRoot!;const create=[...shadow.querySelectorAll('button')].find(b=>b.textContent==='创建当前聊天存档')!;create.click();
 });
 const host=page.locator('#st-match3-host-root');await expect(host.getByText('当前聊天：B',{exact:true})).toBeVisible();
 expect(await page.evaluate(async()=>(await (window as any).stHost.service.repository.list()).length)).toBe(0);
 await host.getByRole('button',{name:'创建当前聊天存档'}).click();await expect(host.getByText('当前 · B',{exact:true})).toBeVisible();
 await page.evaluate(()=>(window as any).switchStChat('A'));await expect(host.getByText('当前聊天：A',{exact:true})).toBeVisible();
 await host.getByRole('button',{name:'创建当前聊天存档'}).click();await expect(host.getByText('当前 · A',{exact:true})).toBeVisible();
 await page.evaluate(()=>(window as any).switchStChat('B'));await expect(host.getByText('当前 · B',{exact:true})).toBeVisible();
 expect(await page.evaluate(async()=>(await (window as any).stHost.service.repository.list()).map((s:any)=>s.chat.chatId))).toEqual(['B','A']);
});
