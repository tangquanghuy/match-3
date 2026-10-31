import type {SettlementReceipt,StSave} from './save';

/** One opponent group in the battle record list: a story battle and the replays of its opponents. */
export interface BattleRecordGroup {
 /** Story receipt; absent only for an orphaned replay group, which validateSave already rejects. */
 story?:SettlementReceipt;
 /** Replays in settlement order (oldest first). */
 replays:SettlementReceipt[];
 /** Story and replays in settlement order. */
 receipts:SettlementReceipt[];
}

/**
 * Group receipts by encounter, newest activity first. Receipts are stored in settlement order
 * (there is no timestamp), so array position is the only ordering. Display only.
 */
export function battleRecordGroups(save:Pick<StSave,'settlements'>):BattleRecordGroup[] {
 const groups=new Map<string,BattleRecordGroup&{last:number}>();
 save.settlements.forEach((receipt,index)=>{
   let group=groups.get(receipt.encounterId);
   if(!group){group={replays:[],receipts:[],last:index};groups.set(receipt.encounterId,group);}
   group.receipts.push(receipt);group.last=index;
   if(receipt.kind==='story')group.story=receipt;else group.replays.push(receipt);
 });
 return [...groups.values()].sort((a,b)=>b.last-a.last).map(({last:_last,...group})=>group);
}
