import type {BattleRequest,CombatantSnapshot} from '../session/contract';

export type EnvironmentScaling={level:number;difficulty:number};
export const ST_ENVIRONMENT_SCALING_RULE='传送门召唤采用开战时该方初始队伍的平均等级（向上取整）和平均难度，全场固定；换位、阵亡、召唤和复制均不改变基准。旧快照缺少等级信息时按等级 20、难度 ×1 计入。';

/** Derive from the persisted initial roster, so replay and refresh use the same baseline. */
export function stEnvironmentScaling(request:Pick<BattleRequest,'playerTeam'|'enemyTeam'>):Record<'player'|'enemy',EnvironmentScaling>{
 const mean=(team:readonly CombatantSnapshot[]):EnvironmentScaling=>{
   if(!team.length)return {level:20,difficulty:1};
   const values=team.map(unit=>unit.battleScaling??{level:20,difficulty:1});
   // Stable summation order prevents reordering fractional difficulties changing the baseline.
   const levels=values.map(s=>s.level).sort((a,b)=>a-b);
   const difficulties=values.map(s=>s.difficulty).sort((a,b)=>a-b);
   return {level:Math.ceil(levels.reduce((sum,value)=>sum+value,0)/values.length),difficulty:difficulties.reduce((sum,value)=>sum+value,0)/values.length};
 };
 return {player:mean(request.playerTeam),enemy:mean(request.enemyTeam)};
}
