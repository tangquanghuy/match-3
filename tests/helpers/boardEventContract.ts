/** Independent model of what event-driven gem sprites can know. No engine-state
 * resync is allowed to hide omitted clear events or changing transform IDs. */
import type { BoardModel } from '../../src/engine/BoardModel';
import type { GameEvent } from '../../src/engine/events';
import type { CellPos,GemType } from '../../src/engine/types';
export function inspectBoardEventContract(before:BoardModel,events:GameEvent[],after:BoardModel):string[]{
 const gems=new Map<number,{pos:CellPos;type:GemType}>(),errors:string[]=[];
 before.forEach((g,p)=>{if(g)gems.set(g.id,{pos:{...p},type:g.type});});
 const move=(id:number,pos:CellPos)=>{const g=gems.get(id);if(!g)errors.push(`move-unknown:${id}`);else g.pos={...pos};};
 for(const e of events){
  switch(e.type){
   case 'swap':move(e.gemIdA,e.b);move(e.gemIdB,e.a);break;
   case 'elimination':case 'gem-explode':case 'gem-destroy':for(const c of e.cells)gems.delete(c.gemId);break;
   case 'gravity':case 'reshuffle':for(const m of e.moves)move(m.gemId,m.to);break;
   case 'refill':for(const g of e.spawns){if(gems.has(g.gemId))errors.push(`duplicate-refill:${g.gemId}`);gems.set(g.gemId,{pos:{...g.to},type:g.gemType});}break;
   case 'gem-create':for(const g of e.spawns){if(gems.has(g.gemId))errors.push(`duplicate-create:${g.gemId}`);gems.set(g.gemId,{pos:{...g.pos},type:g.gemType});}break;
   case 'gem-transform':for(const g of e.changes){const previous=gems.get(g.gemId);if(!previous)errors.push(`transform-unknown:${g.gemId}`);else {previous.type=g.to;previous.pos={...g.pos};}}break;
  }
 }
 const finalIds=new Set<number>();
 after.forEach((g,p)=>{if(!g)return;finalIds.add(g.id);const shown=gems.get(g.id);
  if(!shown)errors.push(`missing-final:${g.id}`);
  else {if(shown.pos.row!==p.row||shown.pos.col!==p.col)errors.push(`position-final:${g.id}`);
   if(JSON.stringify(shown.type)!==JSON.stringify(g.type))errors.push(`type-final:${g.id}`);}
 });
 for(const id of gems.keys())if(!finalIds.has(id))errors.push(`stale-final:${id}`);
 return errors;
}
