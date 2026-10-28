import {describe,it,expect,vi} from 'vitest';
import {StHostAdapter,companionColors} from '../../src/sillytavern/hostAdapter';
import type {TavernHelpers,MvuData,TavernContext,StHostAdapterOptions} from '../../src/sillytavern/hostAdapter';
import {createSave,emptyRoot} from '../../src/sillytavern/save';

function fixture(options:StHostAdapterOptions={}){
 let chatId='chat-a';let variables:Record<string,unknown>={other:'preserve'};
 let data:MvuData={stat_data:{人物:{名称:'主角',当前生命值:23,生命值上限:40,临时生命值:7},羁绊列表:{同伴甲:{同行誓约:true,当前生命值:15},同伴乙:{同行誓约:true,三消:{颜色:['Red','Blue']}}}},other:{preserve:true}};
 const ctx:TavernContext={characterId:0,characters:[{avatar:'stable.png'}],chat:[{swipe_id:0,send_date:'2026-10-24T01:00:00Z'}],getCurrentChatId:()=>chatId};
 const helpers:TavernHelpers={getContext:()=>ctx,getVariables:()=>structuredClone(variables),updateVariablesWith:updater=>{variables=updater(structuredClone(variables));return variables;},Mvu:{getMvuData:options=>{expect(options).toEqual({type:'message',message_id:ctx.chat.length-1});return structuredClone(data);},replaceMvuData:vi.fn(async(next,options)=>{expect(options).toEqual({type:'message',message_id:ctx.chat.length-1});data=structuredClone(next);})}};
 let accountSequence=0;
 const host={crypto:{randomUUID:()=>`account-${++accountSequence}`},navigator:{locks:{request:async(_name:string,work:()=>Promise<unknown>)=>work()}}} as unknown as Window;
 const adapter=new StHostAdapter(helpers,host,'host',options);
 return {adapter,helpers,ctx,host,get data(){return data;},get variables(){return variables;},setVariables:(v:Record<string,unknown>)=>{variables=v;},switchChat:(id:string)=>{chatId=id;}};
}
describe('ST actual-host boundary adapter',()=>{
 it('binds stable card/chat identity and ignores a copied chat reference',()=>{
   const f=fixture();const before=f.adapter.read();const save=createSave(emptyRoot(),before.chat,'save-a');
   f.adapter.bindSave(save);expect(f.adapter.read().saveId).toBe('save-a');expect(f.variables.other).toBe('preserve');
   f.switchChat('chat-copy');expect(f.adapter.read().saveId).toBeUndefined();
   expect(()=>f.adapter.bindSave(save)).toThrow('聊天已切换');
   f.switchChat('chat-a');expect(f.adapter.read().saveId).toBe('save-a');
   f.adapter.clearBinding(save);expect(f.adapter.read().saveId).toBeUndefined();
 });
 it('writes colors into acknowledged ST character variables once and preserves all HP and unrelated fields',async()=>{
   const f=fixture();const before=structuredClone(f.data);
   const next=await f.adapter.writeCompanionColors(f.adapter.read(),[{name:'同伴甲',colors:['Green']},{name:'同伴乙',colors:['Yellow']}]);
   expect(companionColors(next.statData)).toEqual({同伴甲:['Green'],同伴乙:['Red','Blue']});expect(f.helpers.Mvu.replaceMvuData).toHaveBeenCalledTimes(1);
   expect(f.data.stat_data['人物']).toEqual(before.stat_data['人物']);expect(f.data.other).toEqual(before.other);
   await f.adapter.writeCompanionColors(f.adapter.read(),[{name:'同伴甲',colors:['Purple']}]);
   expect(companionColors(f.adapter.read().statData)['同伴甲']).toEqual(['Green']);expect(f.helpers.Mvu.replaceMvuData).toHaveBeenCalledTimes(1);
 });
 it('rejects stale message, swipe, variables and switched chat before writing',async()=>{
   for(const mutate of [(f:ReturnType<typeof fixture>)=>{f.ctx.chat=[{},{}];},(f:ReturnType<typeof fixture>)=>{f.ctx.chat=[{swipe_id:1}];},(f:ReturnType<typeof fixture>)=>{(f.data.stat_data['人物'] as Record<string,unknown>)['当前生命值']=2;},(f:ReturnType<typeof fixture>)=>f.switchChat('other')]){
     const f=fixture();const snapshot=f.adapter.read();mutate(f);
     await expect(f.adapter.writeCompanionColors(snapshot,[{name:'同伴甲',colors:['Green']}])).rejects.toThrow('变化');expect(f.helpers.Mvu.replaceMvuData).not.toHaveBeenCalled();
   }
 });
 it('requires schema readback instead of accepting a silently stripped color field',async()=>{
   const f=fixture();f.helpers.Mvu.replaceMvuData=vi.fn(async()=>{});
   await expect(f.adapter.writeCompanionColors(f.adapter.read(),[{name:'同伴甲',colors:['Green']}])).rejects.toThrow('未持久化');
 });
 it('rejects damaged stored colors and invalid initialization without rerolling',async()=>{
   const f=fixture();const bonds=f.data.stat_data['羁绊列表'] as Record<string,Record<string,unknown>>;
   bonds['同伴乙']!['三消']={颜色:['Red','Red']};expect(()=>f.adapter.read()).toThrow('颜色');
   delete bonds['同伴乙']!['三消'];
   for(const colors of [[],['Green','Red','Blue'],['Skull'],['Red','Red']])await expect(f.adapter.writeCompanionColors(f.adapter.read(),[{name:'同伴甲',colors}])).rejects.toThrow('颜色');
   expect(f.helpers.Mvu.replaceMvuData).not.toHaveBeenCalled();
 });
 it('preserves literal prototype-like actor names and rejects inherited actors',async()=>{
   const f=fixture();const bonds=f.data.stat_data['羁绊列表'] as Record<string,unknown>;
   Object.defineProperty(bonds,'__proto__',{value:{三消:{颜色:['Purple']}},enumerable:true,writable:true,configurable:true});
   expect(Object.hasOwn(companionColors(f.adapter.read().statData),'__proto__')).toBe(true);
   expect(companionColors(f.adapter.read().statData)['__proto__']).toEqual(['Purple']);
   await expect(f.adapter.writeCompanionColors(f.adapter.read(),[{name:'constructor',colors:['Red']}])).rejects.toThrow('不存在');
 });

});

function accountStorage(){
 const state=new Map<string,string>();
 return {getItem:(key:string)=>state.get(key)??null,setItem:(key:string,value:string)=>{state.set(key,value);}};
}

describe('documented Tavern Helper API contracts',()=>{
 it('keeps the official synchronous-updater contract for chat variables',()=>{
   const f=fixture();const update=f.helpers.updateVariablesWith;
   f.helpers.updateVariablesWith=vi.fn((updater,options)=>{
     expect(options).toEqual({type:'chat'});
     return update(variables=>{const result=updater(variables);expect(result).not.toBeInstanceOf(Promise);return result;},options);
   });
   const save=createSave(emptyRoot(),f.adapter.read().chat,'save');
   f.adapter.bindSave(save);expect(f.adapter.read().saveId).toBe('save');
   f.adapter.clearBinding(save);expect(f.adapter.read().saveId).toBeUndefined();
 });
 it('reports the optional official version probes and enforces an explicit tested version',()=>{
   const f=fixture({expectedHelperVersion:'4.11.3'});
   expect(()=>f.adapter.read()).toThrow('版本');
   f.helpers.getTavernHelperVersion=()=> '4.11.3';f.helpers.getTavernVersion=()=> '1.13.4';
   expect(f.adapter.checkCompatibility()).toEqual({helperVersion:'4.11.3',tavernVersion:'1.13.4',mvuScope:'message'});
   const snapshot=f.adapter.read();f.helpers.getTavernHelperVersion=()=> '4.11.4';
   expect(()=>f.adapter.assertSnapshot(snapshot)).toThrow('版本');
   expect(f.helpers.Mvu.replaceMvuData).not.toHaveBeenCalled();
 });
 it('checks missing MVU capabilities and malformed version values before reading variables',()=>{
   const f=fixture();const get=vi.spyOn(f.helpers.Mvu,'getMvuData');
   f.helpers.getTavernHelperVersion=()=> '';
   expect(()=>f.adapter.read()).toThrow('版本');expect(get).not.toHaveBeenCalled();
   delete f.helpers.getTavernHelperVersion;
   f.helpers.Mvu.replaceMvuData=undefined as unknown as TavernHelpers['Mvu']['replaceMvuData'];
   expect(()=>f.adapter.read()).toThrow('API');expect(get).not.toHaveBeenCalled();
 });
 it('blocks chat scope before accepting work because story origins do not persist scope',()=>{
   expect(()=>fixture({mvuScope:'chat'} as unknown as StHostAdapterOptions)).toThrow('跨刷新恢复契约');
 });
 it('keeps the default message scope at a frozen numeric floor and never guesses another scope',()=>{
   const f=fixture();f.ctx.chat=[{swipe_id:0},{swipe_id:2}];const get=vi.spyOn(f.helpers.Mvu,'getMvuData');
   const snapshot=f.adapter.read();expect(snapshot.messageId).toBe(1);expect(snapshot.swipeId).toBe(2);
   expect(get).toHaveBeenCalledWith({type:'message',message_id:1});
   get.mockReturnValue({stat_data:{}});
   expect(()=>f.adapter.read()).toThrow('message scope');
   expect(get.mock.calls.every(([options])=>options.type==='message')).toBe(true);
 });
 it('rejects a preparation snapshot captured from another MVU scope',async()=>{
   const f=fixture();const snapshot=f.adapter.read();snapshot.mvuScope='chat';
   await expect(f.adapter.writeCompanionColors(snapshot,[{name:'同伴甲',colors:['Green']}])).rejects.toThrow('变化');
   expect(f.helpers.Mvu.replaceMvuData).not.toHaveBeenCalled();
 });
});

describe('host identity and confirmed mutations',()=>{
 it('uses accountStorage to isolate identical card and chat names and restores each account binding',()=>{
   const f=fixture();const first=accountStorage();const second=accountStorage();f.ctx.accountStorage=first;
   const snapshot=f.adapter.read();const save=createSave(emptyRoot(),snapshot.chat,'save');f.adapter.bindSave(save);
   expect(new StHostAdapter(f.helpers,f.host,'host').read().chat).toEqual(snapshot.chat);
   f.ctx.accountStorage=second;const other=f.adapter.read();
   expect(other.chat.hostId).not.toBe(snapshot.chat.hostId);expect(other.saveId).toBeUndefined();
   expect(()=>f.adapter.bindSave(save)).toThrow('切换');
   f.ctx.accountStorage=first;expect(f.adapter.read().saveId).toBe('save');
   expect(f.variables.other).toBe('preserve');
 });
 it('rejects account storage that drops or corrupts its identifier',()=>{
   const f=fixture();f.ctx.accountStorage={getItem:()=>null,setItem:()=>{}};
   expect(()=>f.adapter.read()).toThrow('账号');
   f.ctx.accountStorage={getItem:()=> ' ',setItem:()=>{}};
   expect(()=>f.adapter.read()).toThrow('账号');
 });
 it('blocks a stale account snapshot even when the current MVU data and filenames match',async()=>{
   const f=fixture();f.ctx.accountStorage=accountStorage();const snapshot=f.adapter.read();f.ctx.accountStorage=accountStorage();
   await expect(f.adapter.writeCompanionColors(snapshot,[{name:'同伴甲',colors:['Red']}])).rejects.toThrow('变化');
   expect(f.helpers.Mvu.replaceMvuData).not.toHaveBeenCalled();
 });
 it('accepts group chats without a selected character and rejects absent single-chat identity',()=>{
   const f=fixture();delete f.ctx.characterId;f.ctx.groupId='group-a';
   expect(f.adapter.binding().characterId).toBe('group:group-a');
   delete f.ctx.groupId;expect(()=>f.adapter.read()).toThrow('角色卡');
   f.ctx.characterId='';expect(()=>f.adapter.read()).toThrow('角色卡');
   f.ctx.characterId=0;f.helpers.getContext=()=>({...f.ctx,getCurrentChatId:()=>undefined});
   expect(()=>f.adapter.read()).toThrow('聊天');
 });
 it('rejects replacing a message at the same index with equal swipe and variables',async()=>{
   const f=fixture();f.ctx.chat=[{swipe_id:0,send_date:'2026-10-24T01:00:00Z'}];
   const snapshot=f.adapter.read();f.ctx.chat=[{swipe_id:0,send_date:'2026-10-24T02:00:00Z'}];
   await expect(f.adapter.writeCompanionColors(snapshot,[{name:'同伴甲',colors:['Green']}])).rejects.toThrow('变化');
   expect(f.helpers.Mvu.replaceMvuData).not.toHaveBeenCalled();
 });
 it('rejects a message or swipe switch during a synchronous variable read',()=>{
   for(const chat of [[{swipe_id:1}],[{swipe_id:0},{swipe_id:0}]]){
     const f=fixture();f.helpers.getVariables=()=>{f.ctx.chat=chat;return {};};
     expect(()=>f.adapter.read()).toThrow('变化');
   }
 });
 it('preserves factual mirrors when rebinding an unchanged save and drops them for a new save',()=>{
   const f=fixture();const save=createSave(emptyRoot(),f.adapter.read().chat,'save');f.adapter.bindSave(save);
   const reference=f.variables['match3'] as Record<string,unknown>;
   f.setVariables({...f.variables,match3:{...reference,storyResults:{battle:{result:'confirmed'}},extensionField:'keep'}});
   const before=structuredClone(f.variables);f.adapter.bindSave(save);expect(f.variables).toEqual(before);
   f.adapter.bindSave({...save,id:'replacement'});
   expect(f.variables['match3']).toEqual({version:1,saveId:'replacement',chat:save.chat});
 });
 it('confirms clearing the reference and preserves another save binding',()=>{
   const f=fixture();const save=createSave(emptyRoot(),f.adapter.read().chat,'save');f.adapter.bindSave(save);
   const update=f.helpers.updateVariablesWith;f.helpers.updateVariablesWith=()=>f.variables;
   expect(()=>f.adapter.clearBinding(save)).toThrow('解绑尚未确认');
   f.helpers.updateVariablesWith=update;f.adapter.clearBinding({...save,id:'another-save'});
   expect(f.adapter.read().saveId).toBe('save');f.adapter.clearBinding(save);expect(f.variables).toEqual({other:'preserve'});
 });
 it('detects schema side effects on HP even when the new colors survive',async()=>{
   const f=fixture();const replace=f.helpers.Mvu.replaceMvuData;
   f.helpers.Mvu.replaceMvuData=vi.fn(async(next,options)=>{
     const altered=structuredClone(next);delete (altered.stat_data['人物'] as Record<string,unknown>)['当前生命值'];
     await replace(altered,options);
   });
   await expect(f.adapter.writeCompanionColors(f.adapter.read(),[{name:'同伴甲',colors:['Green']}])).rejects.toThrow('未完整持久化');
   expect(companionColors(f.data.stat_data)['同伴甲']).toEqual(['Green']);
 });
 it('rejects a changed save reference while asynchronous color persistence is pending',async()=>{
   const f=fixture();const save=createSave(emptyRoot(),f.adapter.read().chat,'save');f.adapter.bindSave(save);
   const replace=f.helpers.Mvu.replaceMvuData;
   f.helpers.Mvu.replaceMvuData=vi.fn(async(next,options)=>{
     await replace(next,options);f.setVariables({match3:{version:1,saveId:'other',chat:save.chat}});
   });
   await expect(f.adapter.writeCompanionColors(f.adapter.read(),[{name:'同伴甲',colors:['Green']}])).rejects.toThrow('切换');
 });
});

describe('storage handoff and minimal production smoke data',()=>{
 it('accepts the production smoke MVU shape without a context chat_id field',()=>{
   const f=fixture();f.helpers.Mvu.getMvuData=options=>{
     expect(options).toEqual({type:'message',message_id:0});return {stat_data:{人物:{名称:'主角'}}};
   };
   const save=createSave(emptyRoot(),f.adapter.read().chat,'smoke-save');f.adapter.bindSave(save);
   expect(f.adapter.read().saveId).toBe('smoke-save');
 });
 it('exposes a stable account namespace independent of the active character and chat',()=>{
   const f=fixture();const first=accountStorage();f.ctx.accountStorage=first;
   const namespace=f.adapter.getStorageNamespace();expect(namespace).toBe(f.adapter.binding().hostId);
   f.switchChat('other-chat');f.ctx.characters=[{avatar:'other.png'}];
   expect(f.adapter.getStorageNamespace()).toBe(namespace);
   expect(new StHostAdapter(f.helpers,f.host,'host').getStorageNamespace()).toBe(namespace);
   f.ctx.accountStorage=accountStorage();expect(f.adapter.getStorageNamespace()).not.toBe(namespace);
   f.ctx.accountStorage=first;expect(f.adapter.getStorageNamespace()).toBe(namespace);
 });
 it('resolves storage ownership without requiring an open message or selected character',()=>{
   const f=fixture();f.ctx.chat=[];delete f.ctx.characterId;f.ctx.accountStorage=accountStorage();
   expect(f.adapter.getStorageNamespace()).toContain('account-1');expect(()=>f.adapter.read()).toThrow('聊天');
 });
});
