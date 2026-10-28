import {prepareStBattle} from './battleRuntime';
import type {StoryWritebackOrigin} from './storyWriteback';
import type {GameEvent} from '../engine/events';
import type {BattleRequest,BattleResult} from '../session/contract';
import {recordEncounter,settleSave,validatePendingStory} from './save';
import type {AbilitySource,PendingStory,SettlementReceipt,StSave} from './save';

export type {PendingStory} from './save';

/** Persist the full request before opening the battle frame. Story HP is kept as supplied. */
export function beginStory(save:StSave,request:BattleRequest,sources:readonly AbilitySource[],difficulty:string,encounterId:string,origin?:StoryWritebackOrigin):PendingStory {
 if(save.pendingStory!==undefined)throw new Error('已有待完成的剧情战斗，请继续或手动放弃本场');
 const ticket:PendingStory=structuredClone({encounterId,request,sources:[...sources],difficulty,...(origin?{origin}:{})});
 validatePendingStory(save,ticket);
 prepareStBattle(ticket.request);
 save.pendingStory=ticket;
 return structuredClone(ticket);
}

/** Settle only against the durable original request, with fragment grants from actual defeats. */
export function completeStory(save:StSave,result:BattleResult,events:readonly GameEvent[]):SettlementReceipt {
 const old=save.settlements.find(r=>r.battleId===result.battleId);
 if(old&&old.kind!=='story')throw new Error('战果标识已属于往昔再现');
 if(old){
   // settleSave checks the entire result for conflicts and returns the original complete receipt.
   // A defeated story has no encounter, so rebuild only the identity needed for that check.
   return settleSave(save,{kind:'story',encounter:recordEncounter(old.request,[],'settled',old.encounterId),request:old.request,result,events});
 }
 const ticket=save.pendingStory;
 if(!ticket||ticket.request.battleId!==result.battleId||ticket.request.requestId!==result.requestId)throw new Error('战果没有对应的待完成剧情');
 validatePendingStory(save,ticket);
 const encounter=recordEncounter(ticket.request,ticket.sources,ticket.difficulty,ticket.encounterId);
 const receipt=settleSave(save,{kind:'story',encounter,request:ticket.request,result,events});
 if(ticket.origin){receipt.storyOrigin=structuredClone(ticket.origin);save.settlements.find(r=>r.battleId===receipt.battleId)!.storyOrigin=structuredClone(ticket.origin);}
 delete save.pendingStory;
 return receipt;
}
