import {describe,it,expect} from 'vitest';
import {readMessageSource,assertMessageSource} from '../../src/sillytavern/messageSource';
import type {TavernContext} from '../../src/sillytavern/hostAdapter';
function context():TavernContext{return {characterId:0,characters:[{avatar:'role.png'}],getCurrentChatId:()=> 'chat-a',chat:[{is_user:false,mes:'正文',send_date:'2026-10-24',swipe_id:0}]};}
describe('原消息战斗来源',()=>{
 it('保留角色、聊天、楼层、swipe 与原始正文',()=>{const source=readMessageSource(context(),0);expect(source).toMatchObject({chatId:'chat-a',characterId:'role.png',messageId:0,swipeId:0,text:'正文'});expect(()=>assertMessageSource(context(),source,true)).not.toThrow();});
 it('拒绝用户、系统和不存在的消息',()=>{for(const change of [{is_user:true},{is_system:true},{mes:undefined}]){const ctx=context();Object.assign(ctx.chat[0]!,change);expect(()=>readMessageSource(ctx,0)).toThrow();}expect(()=>readMessageSource(context(),-1)).toThrow();expect(()=>readMessageSource(context(),2)).toThrow();});
 it('拒绝聊天、角色、编辑、swipe 和楼层身份变化',()=>{const source=readMessageSource(context(),0);for(const mutation of [(ctx:TavernContext)=>{ctx.getCurrentChatId=()=> 'chat-b';},(ctx:TavernContext)=>{ctx.characters=[{avatar:'other.png'}];},(ctx:TavernContext)=>{Object.assign(ctx.chat[0]!,{mes:'编辑后'});},(ctx:TavernContext)=>{Object.assign(ctx.chat[0]!,{swipe_id:1});},(ctx:TavernContext)=>{Object.assign(ctx.chat[0]!,{send_date:'later'});}]){const ctx=context();mutation(ctx);expect(()=>assertMessageSource(ctx,source)).toThrow();}});
 it('历史消息可读，新开战斗须在最新消息',()=>{const ctx=context();const source=readMessageSource(ctx,0);ctx.chat=[...ctx.chat,{is_user:false,mes:'后续正文'}];expect(()=>assertMessageSource(ctx,source)).not.toThrow();expect(()=>assertMessageSource(ctx,source,true)).toThrow('最新');});
 it('拒绝群聊及角色身份缺失',()=>{const ctx=context();ctx.groupId='group';expect(()=>readMessageSource(ctx,0)).toThrow();ctx.groupId=null;ctx.characters=[];expect(()=>readMessageSource(ctx,0)).toThrow();});
});
