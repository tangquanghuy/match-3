/** Exhaustive trait fixture catalogue. Uses natural TurnEngine entry points for
 * active hooks. Primitive-only immunity checks are explicitly labelled separately.
 * A differential observation is evidence of activity, NOT semantic sign-off.
 */
import { TROOPS, troopToCharacter, troopToSummonTemplate, knownTroopTypes } from '../../src/data/troops';
import { getTrait, setSummonTemplateResolver } from '../../src/engine/traits';
import { BoardModel } from '../../src/engine/BoardModel';
import { createGameState } from '../../src/engine/GameState';
import { TurnEngine } from '../../src/engine/TurnEngine';
import { ExtensionRegistry } from '../../src/engine/registry';
import { registerSkillLibrary } from '../../src/engine/skills/library';
import { skill, dmg, inflict, devour, drainMana, summonRef } from '../../src/engine/skills/builders';
import { FixedTargetChooser } from '../../src/engine/skills/targetChooser';
import { SeededRNG } from '../../src/engine/rng';
import { BaseColor, PlayerSide, colorGem, skullGem, specialGem, type Character, type GemType } from '../../src/engine/types';
import type { GameEvent } from '../../src/engine/events';

const registry = new ExtensionRegistry(); registerSkillLibrary(registry.prototypes);
registry.prototypes.set('audit-hit', skill(dmg('enemyChosen', 12, 0)));
registry.prototypes.set('audit-devour', skill(devour('enemyChosen', {chance: 1})));
registry.prototypes.set('audit-drain', skill(drainMana('enemyChosen')));
registry.prototypes.set('audit-summon', skill(summonRef('Skeleton')));
const colors = Object.values(BaseColor), allTypes = [...knownTroopTypes()];
const metaKeys = new Set(['code','name','description','troops']);
const startup = new Set(['teamAura','typeAura','perAllyColor','perAllyTrait','positionAura','allyStartMana','battleStartManaRatio','pvpBonus','mode']);
const skullDefense = new Set(['skullDamageReduction','reflectSkullRatio','dodgeChance']);
const skullAttack = new Set(['armorPierceChance','skullDamageFromArmorRatio','vsAscendedMultiplier']);
export type TraitCase = { key: string; code: string; field: string; scenario: string; troopId: number; seed?: number };
export function scenarioFor(field: string): string {
  if (field.startsWith('onDelve')) return 'mode-unwired';
  if (startup.has(field) || field.startsWith('battleStart')) return 'startup';
  if (field === 'battleEconomyGain') return 'victory';
  if (field === 'statusImmunities') return 'status-immunity';
  if (field === 'devourImmunity') return 'devour-immunity';
  if (field === 'manaOpsImmunity') return 'mana-immunity';
  if (field === 'untargetable') return 'targeting';
  if (field === 'enemyMasteryMult') return 'enemy-color';
  if (field === 'regen' || field.startsWith('turnStart')) return 'turn-start';
  if (field.startsWith('onAllyCast')) return 'ally-cast';
  if (field.startsWith('onEnemyCast')) return 'enemy-cast';
  if (field.startsWith('onAllySummon')) return 'ally-summon';
  if (field.startsWith('onEnemyDeath') || field === 'summonOnEnemyDeath') return 'enemy-death';
  if (field.startsWith('onAllyDeath') || field === 'summonOnAllyDeath') return 'ally-death';
  if (field.startsWith('onSelfDeath') || field.startsWith('onDeath') || field === 'summonOnDeath') return 'self-death';
  if (field.startsWith('onBigMatch') || field.startsWith('onExtraTurn')) return 'big-match';
  if (field.startsWith('onEnemyColor')) return 'enemy-color';
  if (field.startsWith('onColorMatch') || field === 'manaLink') return 'color-match';
  if (field.startsWith('onDamaged') || skullDefense.has(field) || field.startsWith('inflictOnSkullDamaged') || field.startsWith('onSkullDamaged')) return 'skull-defense';
  if (skullAttack.has(field) || field.startsWith('skullMult') || field.startsWith('onSkull') || field.startsWith('inflictOnSkullHit')) return 'skull-attack';
  if (field === 'spellDamageReduction') return 'spell-defense';
  return 'unmapped';
}
export const TRAIT_CASES: TraitCase[] = [...new Set(TROOPS.flatMap(t => t.traits.map(x => x.code)))].flatMap(code => {
  const def = getTrait(code)!;
  return Object.keys(def).filter(k => !metaKeys.has(k)).map(field => ({
    key: `trait-${code}-${field}`, code, field, scenario: scenarioFor(field),
    troopId: TROOPS.find(t => t.traits.some(x => x.code === code))!.id,
  }));
});

/** Every holder is a separate visual case, even when the underlying trait code is shared. */
export const TRAIT_HOLDER_CASES = TRAIT_CASES.flatMap(c =>
  TROOPS.filter(t => t.traits.some(x => x.code === c.code)).map(t => ({
    ...c, key: `${c.key}-troop-${t.id}`, mechanismKey: c.key, troopId: t.id, troopName: t.name,
  })));

export function snapshot(state: ReturnType<typeof createGameState>) {
  return { teams: Object.fromEntries(Object.entries(state.teams).map(([side,t]) => [side,
    t.characters.map(c => ({id:c.id,hp:c.hp,maxHp:c.maxHp,armor:c.armor,attack:c.attack,magic:c.magic,mana:c.mana,
      statuses:c.statuses,defeated:c.defeated,name:c.name}))])),
    queues: Object.fromEntries(Object.entries(state.teams).map(([side,t]) => [side, t.summonQueue?.map(x => ({name:x.character.name,hp:x.character.hp})) ?? []])),
    economy: {...state.economy}, winner:state.winner,
    board: Array.from({length:8},(_,row) => Array.from({length:8},(_,col) => state.board.get({row,col}))) };
}
export function traitFixture(c: TraitCase, seed = 42, control = false) {
  const troop = TROOPS.find(t => t.id === c.troopId)!;
  const def = getTrait(c.code)! as unknown as Record<string, any>;
  const spec = def[c.field];
  let gid = 1;
  const board = new BoardModel();
  const palette: GemType[] = [...colors.map(colorGem), skullGem()];
  for(let row=0;row<8;row++) for(let col=0;col<8;col++) board.set({row,col},{id:gid++,type:palette[(row*3+col)%7]});
  const ch = (id: number): Character => ({...troopToCharacter(troop,id), name:id===0?troop.name:`fixture-${id}`,
    hp:180,maxHp:240,armor:30,attack:20,magic:10,mana:0,manaCost:20,skillId:'audit-hit',
    traitIds:id===0 && !control?[c.code]:[],troopTypes:allTypes,colors:[...colors],statuses:[],defeated:false});
  const left=[0,1,2,3].map(ch),right=[4,5,6,7].map(ch);
  if (c.field==='positionAura' && spec.position==='last') left.push(left.shift()!);
  if (/Cleanse/.test(c.field)) left.forEach(x=>x.statuses=[{id:'poison',turns:10,magnitude:1}]);
  if (c.field==='skullMultVsStatus') right[0].statuses=[{id:spec.status,turns:10,magnitude:1}];
  if (c.field==='skullMultVsStatusList') right[0].statuses=spec.map((s:any)=>({id:s.status,turns:10,magnitude:1}));
  if (c.field==='vsAscendedMultiplier') { right[0].eventTarget=spec.target; left[0].eventRarity=5; }
  if (c.field==='perAllyTrait') left[1].traitIds=['bandinglife'];
  if(c.code==='defender'){left[0].traitIds=[];right[0].traitIds=control?[]:[c.code];}
  // 敌方阵亡不会为持有者一方腾位；为召唤特质预留一个真实空位。
  if(c.field==='summonOnEnemyDeath') left.pop();
  const startupBoard=board.clone();
  const state=createGameState(board,{player:PlayerSide.Left,characters:left},{player:PlayerSide.Right,characters:right});
  state.economy={gold:100,souls:100,gems:0,maps:0};
  const engine=new TurnEngine(state,new SeededRNG(seed),()=>gid++,registry);
  engine.setSummonResolver(troopToSummonTemplate);
  engine.setSummonKingdomResolver(k=>TROOPS.filter(t=>t.kingdom===k).map(t=>t.referenceName));
  engine.setDaemonPool(TROOPS.filter(t=>t.troopTypes.includes('Daemon')).map(t=>t.referenceName));
  setSummonTemplateResolver(s=>troopToSummonTemplate(s.referenceName));
  engine.pvpMode = c.field === 'pvpBonus' || c.field==='mode';
  const initialEvents=engine.takeInitialEvents();
  engine.playerManaMastery=Object.fromEntries(colors.map(x=>[x,100]));
  engine.enemyManaMastery=Object.fromEntries(colors.map(x=>[x,100]));
  const holder=c.code==='defender'?right[0]:state.teams.Left.characters.find(x=>x.id===0)!;
  if(c.scenario==='spell-defense') holder.armor=0;
  if(c.scenario==='mana-immunity' || c.field==='turnStartStealMana' || c.field==='onSkullHitStealMana') [...left,...right].forEach(x=>x.mana=8);
  const cast=(side:PlayerSide,caster:Character,target:Character,spell='audit-hit')=>{
    state.activePlayer=side; caster.mana=caster.manaCost; caster.skillId=spell;
    engine.setTargetChooser(new FixedTargetChooser(target.id));
    return engine.castSkill(caster.id);
  };
  let matchColor: string = spec?.color ?? spec?.[0]?.color ?? 'Red';
  if (matchColor==='any') matchColor='Red';
  if (c.scenario.startsWith('skull') || c.field==='onSkullMatchEconomy') matchColor='skull';
  const matchType = matchColor === 'skull' ? skullGem() : colorGem(matchColor as BaseColor);
  if (['color-match','enemy-color','big-match','skull-attack','skull-defense'].includes(c.scenario)) {
    // Prepare a legal swap, not an already matched board. Real resolver owns ALL downstream cascades.
    const width = c.scenario==='big-match'?5:3;
    for(let col=1;col<=width;col++)board.set({row:3,col},{id:gid++,type:matchType});
    const other=colors.find(x=>x!==matchColor)!;
    board.set({row:3,col:2},{id:gid++,type:colorGem(other)});
    board.set({row:2,col:2},{id:gid++,type:matchType});
    state.activePlayer=['enemy-color','skull-defense'].includes(c.scenario)?PlayerSide.Right:PlayerSide.Left;
  }
  // A specific-gem trigger needs the affected species available on the board.
  if (c.field==='onBigMatchExplodeGem' && spec.kind==='gargoyleGem')
    for(let col=0;col<4;col++)board.set({row:7,col},{id:gid++,type:specialGem('gargoyleGem',spec.tier)});
  if(c.field==='turnStartExplodeGem' && spec.kind==='angelGem') board.set({row:7,col:5},{id:gid++,type:specialGem('angelGem')});
  // Scene preconditions belong before rendering/timing, never silent mutations mid-action.
  if(c.scenario==='self-death'){holder.hp=1;holder.armor=0;}
  if(c.scenario==='ally-death'){left[1].hp=1;left[1].armor=0;}
  if(c.scenario==='enemy-death'){right[0].hp=1;right[0].armor=0;}
  if(c.scenario==='ally-summon')state.teams.Left.characters.pop();
  if(c.scenario==='victory'){state.teams.Right.characters=right.slice(0,1);right[0].hp=1;right[0].armor=0;}
  const before=snapshot(state);
  const run=():GameEvent[]=>{
    switch(c.scenario){
      case 'startup': return initialEvents;
      case 'mode-unwired': case 'unmapped': return [];
      case 'turn-start': state.activePlayer=PlayerSide.Right; return engine.passTurn();
      case 'ally-cast': return cast(PlayerSide.Left,left[1],right[0]);
      case 'enemy-cast': case 'spell-defense': return cast(PlayerSide.Right,right[1],holder);
      case 'self-death': return cast(PlayerSide.Right,right[1],holder);
      case 'ally-death': return cast(PlayerSide.Right,right[1],left[1]);
      case 'enemy-death': return cast(PlayerSide.Left,left[1],right[0]);
      case 'ally-summon': {
        return cast(PlayerSide.Left,left[1],right[0],'audit-summon');
      }
      case 'victory': return cast(PlayerSide.Left,left[1],right[0]);
      case 'targeting': {
        registry.prototypes.set('audit-target',skill(dmg('enemyRandom',12,0)));
        return cast(PlayerSide.Right,right[1],holder,'audit-target');
      }
      case 'devour-immunity': return cast(PlayerSide.Right,right[1],holder,'audit-devour');
      case 'mana-immunity': return cast(PlayerSide.Right,right[1],holder,'audit-drain');
      case 'status-immunity': {
        const status=spec.includes('*')?'poison':spec[0];
        registry.prototypes.set('audit-status',skill(inflict(status,'enemyChosen')));
        return cast(PlayerSide.Right,right[1],holder,'audit-status');
      }
      default:return engine.resolveSwap({row:2,col:2},{row:3,col:2});
    }
  };
  return {state,engine,registry,before,initialEvents,run,holder,startupBoard};
}

