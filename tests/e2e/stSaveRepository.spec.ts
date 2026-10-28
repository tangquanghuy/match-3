import {test,expect} from '@playwright/test';
import type {StSaveRepository} from '../../src/sillytavern/saveRepository';

test.beforeEach(async({page})=>{await page.goto('/sillytavern.html');});

test('ST IndexedDB enforces one chat per slot, three slots and manual deletion',async({page})=>{
 const actual=await page.evaluate(async()=>{
   const path='/src/sillytavern/saveRepository.ts';const {StSaveRepository}=await import(/* @vite-ignore */path) as {StSaveRepository:{open():Promise<StSaveRepository>}};
   const repository=await StSaveRepository.open();const chat={hostId:location.origin,characterId:'hero',chatId:'one'};
   const one=await repository.create(chat,'one');const reused=await repository.create(chat,'unused');
   await repository.create({...chat,chatId:'two'},'two');await repository.create({...chat,chatId:'three'},'three');
   let full='';try{await repository.create({...chat,chatId:'four'},'four');}catch(error){full=String(error);}
   const before=await repository.list();await repository.delete('two');await repository.create({...chat,chatId:'four'},'four');
   const after=await repository.list();repository.close();return {one:one.id,reused:reused.id,full,before:before.map(s=>s.chat.chatId),after:after.map(s=>s.chat.chatId)};
 });
 expect(actual).toMatchObject({one:'one',reused:'one',before:['one','two','three'],after:['one','three','four']});expect(actual.full).toContain('手动删除');
});

test('ST concurrent connections commit only one write at the same revision',async({page})=>{
 const actual=await page.evaluate(async()=>{
   const path='/src/sillytavern/saveRepository.ts';const {StSaveRepository}=await import(/* @vite-ignore */path) as {StSaveRepository:{open():Promise<StSaveRepository>}};
   const a=await StSaveRepository.open();const b=await StSaveRepository.open();await a.create({hostId:location.origin,characterId:'hero',chatId:'one'},'one');
   const writes=await Promise.allSettled([a.update('one',0,s=>{s.balances['currency:gems']=1;}),b.update('one',0,s=>{s.balances['currency:gems']=1;})]);
   const save=(await a.list())[0]!;a.close();b.close();return {statuses:writes.map(w=>w.status),reasons:writes.filter(w=>w.status==='rejected').map(w=>String(w.reason)),revision:save.revision,gems:save.balances['currency:gems']};
 });
 expect(actual.statuses.sort()).toEqual(['fulfilled','rejected']);expect(actual.reasons[0]).toContain('其他页面');expect(actual.revision).toBe(1);expect(actual.gems).toBe(1);
});

test('ST backup import preserves its chat, rejects damaged records, and rolls back failed mutations',async({page})=>{
 const actual=await page.evaluate(async()=>{
   const path='/src/sillytavern/saveRepository.ts';const {StSaveRepository}=await import(/* @vite-ignore */path) as {StSaveRepository:{open():Promise<StSaveRepository>}};
   const repository=await StSaveRepository.open();const chat={hostId:location.origin,characterId:'hero',chatId:'one'};await repository.create(chat,'one');
   await repository.update('one',0,s=>{s.companionColors.friend=['Blue','Red'];s.balances['material:iron']=2;});
   const backup=await repository.export('one');const failures:string[]=[];
   for(const action of [()=>repository.import(backup,{...chat,chatId:'other'}),()=>repository.import(backup,chat),()=>repository.update('one',1,s=>{s.chat.chatId='changed';}),()=>repository.update('one',1,s=>{s.balances['material:iron']=-1;})]){
     try{await action();}catch(error){failures.push(String(error));}
   }
   const unchanged=(await repository.list())[0]!;await repository.delete('one');
   const damaged=JSON.parse(backup);damaged.sources=[{sourceId:'bad',abilityId:'a',abilityName:'坏记录',rank:4,wins:99}];
   try{await repository.import(JSON.stringify(damaged),chat);}catch(error){failures.push(String(error));}
   const countAfterFailure=(await repository.list()).length;const restored=await repository.import(backup,chat);repository.close();return {failures,unchanged,countAfterFailure,restored,backup:JSON.parse(backup)};
 });
 expect(actual.failures).toHaveLength(5);expect(actual.failures[0]).toContain('其他聊天');expect(actual.failures[1]).toContain('手动删除');expect(actual.failures[2]).toContain('重新创建');expect(actual.failures[3]).toContain('余额');expect(actual.failures[4]).toContain('进度');
 expect(actual.unchanged).toEqual(actual.backup);expect(actual.countAfterFailure).toBe(0);expect(actual.restored).toEqual(actual.backup);
});


test('ST account namespaces keep slots and durable outcome queues separate after reopening',async({page})=>{
 const actual=await page.evaluate(async()=>{
   const path='/src/sillytavern/saveRepository.ts';const {StSaveRepository}=await import(/* @vite-ignore */path) as {StSaveRepository:{open(factory:IDBFactory,namespace?:string):Promise<StSaveRepository>}};
   const chat={hostId:location.origin,characterId:'hero',chatId:'same-chat'};
   const a=await StSaveRepository.open(indexedDB,'account/a');const b=await StSaveRepository.open(indexedDB,'account%2Fa');const legacy=await StSaveRepository.open(indexedDB);
   await a.create(chat,'a');await a.create({...chat,chatId:'two'},'a-two');await a.create({...chat,chatId:'three'},'a-three');
   await b.create(chat,'b');await legacy.create(chat,'legacy');await a.update('a',0,s=>{s.balances['material:iron']=4;});
   await new Promise<void>((resolve,reject)=>{const request=indexedDB.open('match3.sillytavern.v1.account.'+encodeURIComponent('account/a'));request.onsuccess=()=>{const db=request.result;const transaction=db.transaction('replayOutbox','readwrite');transaction.objectStore('replayOutbox').put({probe:'only-account-a'},'isolation-probe');transaction.oncomplete=()=>{db.close();resolve();};transaction.onerror=()=>reject(transaction.error);};request.onerror=()=>reject(request.error);});
   const counts={a:(await a.list()).length,b:(await b.list()).length,legacy:(await legacy.list()).length};
   const queues={a:await a.listReplayOutcomes(),b:await b.listReplayOutcomes(),legacy:await legacy.listReplayOutcomes()};
   a.close();b.close();legacy.close();const reopened=await StSaveRepository.open(indexedDB,'account/a');const saved=await reopened.list();reopened.close();
   let invalid='';try{await StSaveRepository.open(indexedDB,' ');}catch(error){invalid=String(error);}
   return {counts,queues,saved:saved.map(s=>({id:s.id,balances:s.balances})),invalid};
 });
 expect(actual.counts).toEqual({a:3,b:1,legacy:1});expect(actual.queues).toEqual({a:[{probe:'only-account-a'}],b:[],legacy:[]});
 expect(actual.saved).toEqual([{id:'a',balances:{'material:iron':4}},{id:'a-two',balances:{}},{id:'a-three',balances:{}}]);expect(actual.invalid).toContain('账号标识为空');
});
