import type {GameEvent} from '../engine/events';
import type {BattleRequest,BattleResult,BattleSideName} from '../session/contract';
import {internalIdFor} from '../session/combatantMapping';

export interface UnitBattleFact {
 externalId:string;name:string;side:BattleSideName;
 initialHp:number;initialMaxHp:number;finalHp:number;finalMaxHp:number;
 initialHpPercent:number;finalHpPercent:number;hpLostPercentagePoints:number;
 fellCount:number;revivedCount:number;finallyDefeated:boolean;fled:boolean;
 hpDamage:number;hpHealing:number;hpGrowth:number;
}
export interface StBattleReport {
 version:1;battleId:string;winner:BattleResult['winner'];turns:number;
 units:UnitBattleFact[];defeatedEnemyIds:string[];fallenAllyIds:string[];revivedAllyIds:string[];
}
/** HP totals are derived from actual event deltas; net HP percentage is a separate fact. */
export function buildStBattleReport(request:BattleRequest,result:BattleResult,events:readonly GameEvent[]):StBattleReport {
 if(request.battleId!==result.battleId||request.requestId!==result.requestId)throw new Error('战报与本场战斗标识不一致');
 const units:UnitBattleFact[]=[];
 for(const side of ['player','enemy'] as const){
   const snapshots=side==='player'?request.playerTeam:request.enemyTeam;
   for(const [index,snapshot]of snapshots.entries()){
     const final=result.combatants.find(c=>c.side===side&&c.externalId===snapshot.externalId);if(!final)throw new Error('战报缺少角色终局状态 '+snapshot.externalId);
     const id=internalIdFor(side,index);const initialHp=snapshot.initialHp??snapshot.stats.hp;
     let hp=initialHp;let maxHp=snapshot.stats.hp;let fellCount=0;let revivedCount=0;let hpDamage=0;let hpHealing=0;let hpGrowth=0;let fallen=false;
     const fall=()=>{if(!fallen){fellCount++;fallen=true;}};
     for(const event of events){
       if((event.type==='skill-damage'||event.type==='skull-damage')&&event.targetId===id){
         hpDamage+=event.hpLoss??Math.max(0,hp-event.resultingHp);hp=event.resultingHp;if(hp<=0)fall();
       }else if(event.type==='status-tick'&&event.targetId===id){
         const loss=Math.min(hp,Math.max(0,event.damage??0));hpDamage+=loss;hp-=loss;if(hp<=0)fall();
       }else if(event.type==='defeat'&&event.characterId===id){fall();hp=0;
       }else if(event.type==='buff'&&event.targetId===id&&event.stat==='hp'){
         if(event.revived){fall();revivedCount++;fallen=false;hp=0;}
         else if(hp<=0&&event.amount>0){revivedCount++;fallen=false;}
         const growth=event.maxHpGain??0;hpGrowth+=growth;maxHp+=growth;
         const next=Math.max(0,Math.min(maxHp,hp+event.amount));
         hpHealing+=Math.max(0,event.amount-Math.max(0,growth));hpDamage+=Math.max(0,hp-next);hp=next;
       }else if(event.type==='troop-transform'&&event.targetId===id){
         if(event.hp===undefined||event.maxHp===undefined)throw new Error('变身事件缺少当刻生命快照');hp=event.hp;maxHp=event.maxHp;
       }
     }
     if(final.defeated)fall();
     const initialHpPercent=initialHp/snapshot.stats.hp*100;const finalHpPercent=final.hp/final.maxHp*100;
     units.push({externalId:snapshot.externalId,name:snapshot.name,side,initialHp,initialMaxHp:snapshot.stats.hp,finalHp:final.hp,finalMaxHp:final.maxHp,initialHpPercent,finalHpPercent,hpLostPercentagePoints:initialHpPercent-finalHpPercent,fellCount,revivedCount,finallyDefeated:final.defeated,fled:final.fled===true,hpDamage,hpHealing,hpGrowth});
   }
 }
 return {version:1,battleId:result.battleId,winner:result.winner,turns:result.turns,units,defeatedEnemyIds:units.filter(u=>u.side==='enemy'&&u.finallyDefeated&&!u.fled).map(u=>u.externalId),fallenAllyIds:units.filter(u=>u.side==='player'&&u.fellCount>0).map(u=>u.externalId),revivedAllyIds:units.filter(u=>u.side==='player'&&u.revivedCount>0).map(u=>u.externalId)};
}
