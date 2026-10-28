import type {CombatantSnapshot} from '../session/contract';
import type {AbilitySource} from './save';

/** Resolve through the recorded source, never through the skill label or current party. */
export function sourceEnemy(enemies:readonly CombatantSnapshot[],sources:readonly AbilitySource[],sourceId:string):CombatantSnapshot|undefined {
 const source=sources.find(item=>item.sourceId===sourceId);
 return source?enemies.find(enemy=>enemy.externalId===source.enemyExternalId):undefined;
}
export function soulFragmentName(enemyName:string):string {
 return `${enemyName}的灵魂碎片`;
}
export function sourceFragmentName(enemies:readonly CombatantSnapshot[],sources:readonly AbilitySource[],sourceId:string):string|undefined {
 const enemy=sourceEnemy(enemies,sources,sourceId);
 return enemy?soulFragmentName(enemy.name):undefined;
}
