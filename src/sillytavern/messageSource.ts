import type {TavernContext} from './hostAdapter';

export interface MessageEncounterSource {
 chatId:string;characterId:string;messageId:number;swipeId:number;messageIdentity:string;text:string;
}
function characterIdentity(context:TavernContext):string {
 if(context.groupId!==undefined&&context.groupId!==null&&String(context.groupId)!=='')throw new Error('当前正文战斗入口仅支持角色聊天');
 const character=context.characters[Number(context.characterId)];
 if(!character?.avatar)throw new Error('请先打开角色聊天');
 return character.avatar;
}
export function readMessageSource(context:TavernContext,messageId:number):MessageEncounterSource {
 const chatId=context.getCurrentChatId();
 if(!chatId)throw new Error('请先打开酒馆聊天');
 if(!Number.isSafeInteger(messageId)||messageId<0)throw new Error('正文消息编号无效');
 const message=context.chat[messageId];
 if(!message||message.is_user!==false||message.is_system||typeof message.mes!=='string')throw new Error('战斗入口需要来自 AI 正文消息');
 return {chatId,characterId:characterIdentity(context),messageId,swipeId:message.swipe_id??0,messageIdentity:JSON.stringify(message.send_date??null),text:message.mes};
}
/** Validate again after party preparation: editing or swiping never creates a new reward. */
export function assertMessageSource(context:TavernContext,source:MessageEncounterSource,latest=false):void {
 const current=readMessageSource(context,source.messageId);
 if(current.chatId!==source.chatId||current.characterId!==source.characterId)throw new Error('酒馆聊天已切换，请返回原消息');
 if(current.swipeId!==source.swipeId||current.messageIdentity!==source.messageIdentity||current.text!==source.text)throw new Error('战斗正文已编辑或切换，请重新读取原消息');
 if(latest&&source.messageId!==context.chat.length-1)throw new Error('新的剧情战斗请从最新一条 AI 消息开始；历史战果请查看原结算');
}
