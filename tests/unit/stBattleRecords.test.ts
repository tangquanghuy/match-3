import {describe,expect,it} from 'vitest';
import {battleRecordGroups} from '../../src/sillytavern/battleRecords';
import type {SettlementReceipt} from '../../src/sillytavern/save';

const receipt=(battleId:string,kind:'story'|'replay',encounterId:string,learned=0):SettlementReceipt=>({
 battleId,requestId:battleId,kind,encounterId,winner:'player',resultDigest:battleId,grants:[],
 learnedAbilityIds:Array.from({length:learned},(_,i)=>`${battleId}-a${i}`),learnedAbilityNames:{},
} as unknown as SettlementReceipt);

describe('battle record groups',()=>{
 it('folds replays under their story battle, newest activity first, without dropping receipts',()=>{
  const settlements=[receipt('s1','story','e1'),receipt('s2','story','e2'),receipt('r1','replay','e1'),receipt('r2','replay','e1',1),receipt('s3','story','e3')];
  const groups=battleRecordGroups({settlements});
  expect(groups.map(g=>g.story?.battleId)).toEqual(['s3','s1','s2']);
  expect(groups[1]!.replays.map(r=>r.battleId)).toEqual(['r1','r2']);
  expect(groups[1]!.receipts.map(r=>r.battleId)).toEqual(['s1','r1','r2']);
  expect(groups.flatMap(g=>g.receipts)).toHaveLength(settlements.length);
 });
 it('keeps a lost story battle (no encounter) as its own group',()=>{
  const groups=battleRecordGroups({settlements:[receipt('lost','story','lost-encounter')]});
  expect(groups).toHaveLength(1);expect(groups[0]!.replays).toEqual([]);
 });
});
