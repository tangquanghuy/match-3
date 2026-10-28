import {describe,expect,it} from 'vitest';
// @ts-expect-error Node-only acceptance fixture; the app has no Node type dependency.
import {existsSync} from 'node:fs';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {SeededRNG} from '../../src/engine/rng';
import {BaseColor,PlayerSide,colorGem} from '../../src/engine/types';
import {FixedTargetChooser} from '../../src/engine/skills/targetChooser';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest,CombatantSnapshot} from '../../src/session/contract';
import {mapRequestToTeams} from '../../src/session/combatantMapping';
import {BattleSession} from '../../src/session/BattleSession';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {compileEnemyBlueprint,restoreEnemyBlueprint,adaptedTraitDescription} from '../../src/sillytavern/enemyBlueprint';
import {PORTRAITS,savePortrait} from '../../src/sillytavern/portraits';

// Independent source expectations: troops.json#6004, traits.json humanbond/fast/firespirit.
// These scenarios are behavior evidence, pending independent review before coverage credit.
function blueprint(level=20,difficulty=1) {
 const portrait=PORTRAITS.find(p=>p.troopId===6004)!;
 return compileEnemyBlueprint({portrait:savePortrait({manaColors:portrait.manaColors,rank:portrait.rank,form:portrait.form,role:portrait.role},portrait),externalId:'enemy-1',level,difficulty});
}
function dummy(externalId:string,overrides:Partial<CombatantSnapshot>={}):CombatantSnapshot {
 return {externalId,name:externalId,stats:{hp:100,armor:7,attack:0,magic:0},manaColors:[BaseColor.Blue],manaCost:12,skillId:'gw_KnightsSword',...overrides};
}
function board(matchColor=BaseColor.Red) {
 const b=new BoardModel();
 const colors=[BaseColor.Blue,BaseColor.Green,BaseColor.Red,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
 for(let row=0;row<8;row++)for(let col=0;col<8;col++)b.set({row,col},{id:row*8+col,type:colorGem(colors[(row*3+col*5)%6]!)});
 const other=matchColor===BaseColor.Blue?BaseColor.Green:BaseColor.Blue;
 for(const [row,col,color] of [[0,0,matchColor],[0,1,other],[0,2,matchColor],[1,1,matchColor]] as const)
  b.set({row,col},{id:row*8+col,type:colorGem(color)});
 return b;
}
function battle(options:{level?:number;difficulty?:number;allies?:CombatantSnapshot[];opponents?:CombatantSnapshot[];dead?:string[];matchColor?:BaseColor;seed?:number;restore?:boolean;side?:PlayerSide}={}) {
 const compiled=blueprint(options.level,options.difficulty);
 const bp=options.restore?restoreEnemyBlueprint(JSON.parse(JSON.stringify(compiled))):compiled;
 const enemySide=options.side!==PlayerSide.Left;
 const opponents=options.opponents??[dummy('hero-1'),dummy('hero-2')];
 const subjectTeam=[bp.snapshot,...options.allies??[]];
 const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:'musketeer-acceptance',requestId:'musketeer-request',seed:options.seed??6004,
  playerTeam:enemySide?opponents:subjectTeam,enemyTeam:enemySide?subjectTeam:opponents};
 const setup=prepareStBattle(request);
 const teams=mapRequestToTeams(request);
 const state=createGameState(board(options.matchColor),teams.playerTeam,teams.enemyTeam);
 // Mark fixture casualties before TurnEngine applies opening traits; this keeps
 // preparation, dynamic trait registration, and constructor ordering in the test.
 for(const externalId of options.dead??[]) {
  const id=teams.idMap.internalIdOf(externalId);
  const character=[...teams.playerTeam.characters,...teams.enemyTeam.characters].find(c=>c.id===id)!;
  character.hp=0;character.defeated=true;
 }
 const beforeOpening=structuredClone(state.teams);
 const rng=new SeededRNG(request.seed);let next=1000;
 const engine=new TurnEngine(state,rng,()=>next++,setup.registry,setup.configureEngine);
 const session=new BattleSession({request,engine,idMap:teams.idMap});
 return {bp,request,engine,state,session,rng,beforeOpening,caster:state.teams[enemySide?PlayerSide.Right:PlayerSide.Left].characters[0]!};
}


function assertRejectedTarget(side:PlayerSide,target:number|null) {
 const run=battle({side});
 if(side===PlayerSide.Right)run.session.passTurn();
 run.caster.mana=6;
 const selected=target===4?run.caster.id:target; // Friendly caster is id 0 on Left, id 4 on Right.
 let choices=0;
 let afterChoiceRng:number|undefined;
 run.engine.setTargetChooser({choose:(mode,state,casterId,rng)=>{
  choices++;
  expect(mode).toBe('enemyChosen');
  expect(state).toBe(run.state);
  expect(casterId).toBe(run.caster.id);
  expect(rng).toBe(run.rng);
  rng.next();rng.nextInt(8);
  afterChoiceRng=rng.getState();
  return selected;
 }});
 const snapshot=()=>structuredClone({state:run.state,rng:run.rng.getState(),events:run.session.recordedEvents()});
 const before=snapshot();
 expect(run.session.resolve({type:'cast',characterId:run.caster.id})).toEqual([]);
 expect(choices).toBe(1);
 expect(afterChoiceRng).toBeTypeOf('number');
 expect(afterChoiceRng).not.toBe(before.rng);
 // Includes board, every character/status, economy, winner, turns, action log,
 // death bookkeeping, RNG and the complete accumulated session event stream.
 expect(snapshot()).toEqual(before);
}

describe('ST enemy 6004 Musketeer: source-grounded behavior acceptance',()=>{
 it('binds its real portrait, role, six Red mana, complete active and three ordinary traits',()=>{
  const bp=blueprint();
  expect(bp.snapshot).toMatchObject({mechanicalIdentity:'unit:6004',role:'Striker',skillId:'st:7004',manaColors:[BaseColor.Red],manaCost:6,
   stats:{hp:15,armor:9,attack:12,magic:12},traitIds:['st:humanbond','st:fast','st:firespirit']});
  expect(bp.portrait.assetId).toBe('Troop_K01_00');
  expect(bp.snapshot.portraitUrl).toContain('static/portraits/Troop_K01_00.webp');
  expect(existsSync('game-assets/public/static/portraits/Troop_K01_00.webp')).toBe(true);
  expect(bp.descriptionAudit).toEqual({support:'full',diagnostics:[]});
  expect(bp.traitDescriptionAudit).toHaveLength(3);
  expect(bp.traitDescriptionAudit.every(t=>t.support==='full'&&t.diagnostics.length===0)).toBe(true);
  expect(bp.snapshot.spellDescription).toContain('2');
  expect(bp.snapshot.spellDescription).toContain('魔力');
  expect(bp.snapshot.spellDescription).toContain('选定的一名敌人');
  // Independent semantic oracle: Human is source affinity #17; these literal
  // sentences fix recipients, quantity and opening timing, not just parser support.
  expect(bp.context.affinities).toEqual(['affinity:17']);
  expect(adaptedTraitDescription('humanbond')?.description).toBe('战斗开始时，我方族群 #17 的存活角色的生命增加 2 点。');
  expect(adaptedTraitDescription('fast')?.description).toBe('战斗开始时，自身法力至少补至法力上限的 50%（向下取整）。');
  expect(adaptedTraitDescription('firespirit')?.description).toBe('战斗开始时，每名关联红色的我方存活角色（含自身）使自身魔力增加 1 点。');
  expect(bp.omittedMechanisms).toEqual([]);
 });
 it.each([
  [1,1,{hp:3,armor:0,attack:3,magic:1}],
  [20,1,{hp:15,armor:9,attack:12,magic:12}],
  [20,1.5,{hp:23,armor:14,attack:18,magic:18}],
 ] as const)('scales level %i and difficulty %s before unscaled opening traits',(level,difficulty,stats)=>{
  const run=battle({level,difficulty});
  expect(run.bp.snapshot.stats).toEqual(stats);
  expect(run.caster).toMatchObject({hp:stats.hp+2,maxHp:stats.hp+2,armor:stats.armor,attack:stats.attack,magic:stats.magic+1,mana:3,manaCost:6});
 });
 it('applies Human Bond only to same-team humans, Fire Spirit counts same-team red including self, and Fast grants exactly half mana',()=>{
  const human=blueprint().context.affinities[0]!;
  const run=battle({allies:[dummy('red-human',{troopTypes:[human],manaColors:[BaseColor.Red]}),dummy('blue-human',{troopTypes:[human]}),dummy('red-other',{manaColors:[BaseColor.Red]})]});
  const allies=run.state.teams.Right.characters;
  expect(allies.map(c=>[c.hp,c.maxHp])).toEqual([[17,17],[102,102],[102,102],[100,100]]);
  expect(run.caster.magic).toBe(15); // self + red-human + red-other, not blue-human or opposing team
  expect(allies.map(c=>c.mana)).toEqual([3,0,0,0]);
  expect(run.state.teams.Left.characters.map(c=>[c.hp,c.magic,c.mana])).toEqual([[100,0,0],[100,0,0]]);
  expect(adaptedTraitDescription('humanbond')?.support).toBe('full');
 });
 it('counts multi-color allies once and excludes dead and opposing characters from opening aura benefits',()=>{
  const human='affinity:17';
  for(const side of [PlayerSide.Left,PlayerSide.Right]) {
   const otherSide=side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
   const run=battle({side,dead:['dead'],allies:[
    dummy('multi',{troopTypes:[human],manaColors:[BaseColor.Red,BaseColor.Blue]}),
    dummy('dead',{troopTypes:[human],manaColors:[BaseColor.Red]}),
    dummy('other',{troopTypes:['affinity:1'],manaColors:[BaseColor.Red]}),
   ],opponents:[
    dummy('opposing-human-red',{troopTypes:[human],manaColors:[BaseColor.Red]}),
    dummy('opposing-other-red',{troopTypes:['affinity:1'],manaColors:[BaseColor.Red]}),
   ]});
   const [holder,multi,dead,other]=run.state.teams[side].characters;
   expect(run.beforeOpening[side].characters.map(c=>[c.hp,c.maxHp,c.magic,c.mana,c.defeated])).toEqual([
    [15,15,12,0,false],[100,100,0,0,false],[0,100,0,0,true],[100,100,0,0,false],
   ]);
   expect(holder).toMatchObject({hp:17,maxHp:17,magic:15,mana:3}); // Self + multi once + other, not dead/opponents.
   expect(multi).toMatchObject({hp:102,maxHp:102,magic:0,mana:0,colors:[BaseColor.Red,BaseColor.Blue]});
   expect(dead).toMatchObject({hp:0,maxHp:100,magic:0,mana:0,defeated:true});
   expect(other).toMatchObject({hp:100,maxHp:100,magic:0,mana:0,troopTypes:['affinity:1']});
   expect(run.state.teams[otherSide].characters.map(c=>[c.hp,c.maxHp,c.magic,c.mana])).toEqual([[100,100,0,0],[100,100,0,0]]);
  }
 });
 it.each([PlayerSide.Left,PlayerSide.Right])('preserves the combined source mechanics and selected target on side %s',(side)=>{
  const human=blueprint().context.affinities[0]!;
  const run=battle({side,allies:[dummy('red-human',{troopTypes:[human],manaColors:[BaseColor.Red]})]});
  if(side===PlayerSide.Right)run.session.passTurn();
  run.session.resolve({type:'swap',from:{row:0,col:1},to:{row:1,col:1}});
  expect(run.caster.mana).toBe(6);
  if(run.state.activePlayer!==side)run.session.passTurn();
  const opponents=run.state.teams[side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left].characters;
  run.engine.setTargetChooser(new FixedTargetChooser(opponents[1]!.id));
  const beforeBoard=Array.from({length:64},(_,i)=>run.state.board.get({row:Math.floor(i/8),col:i%8}));
  const events=run.session.resolve({type:'cast',characterId:run.caster.id});
  expect(run.caster.magic).toBe(14); // base 12 + self + actual Red ally
  expect(events.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage,e.range])).toEqual([[opponents[1]!.id,16,'single']]);
  expect(opponents.map(c=>[c.hp,c.armor])).toEqual([[100,7],[91,0]]);
  expect(run.caster.mana).toBe(0);
  expect(run.state.activePlayer).not.toBe(side);
  expect(run.state.economy.gold).toBe(0);expect(run.state.enemyGold).toBe(0);
  expect(Array.from({length:64},(_,i)=>run.state.board.get({row:Math.floor(i/8),col:i%8}))).toEqual(beforeBoard);
 });
 it('rejects a cast at opening half mana without consuming mana, RNG, an action, or a turn',()=>{
  const run=battle();run.session.passTurn();
  const before={mana:run.caster.mana,rng:run.rng.getState(),actions:run.state.actionLog.length,side:run.state.activePlayer};
  expect(run.session.resolve({type:'cast',characterId:run.caster.id})).toEqual([]);
  expect({mana:run.caster.mana,rng:run.rng.getState(),actions:run.state.actionLog.length,side:run.state.activePlayer}).toEqual(before);
 });
 it('charges from a real Red three-match to six mana and spends it on exactly the chosen enemy',()=>{
  const run=battle();run.session.passTurn();
  const matches=run.session.resolve({type:'swap',from:{row:0,col:1},to:{row:1,col:1}});
  expect(matches.some(e=>e.type==='elimination')).toBe(true);
  expect(run.caster.mana).toBe(6);
  if(run.state.activePlayer!==PlayerSide.Right)run.session.passTurn();
  const targets=run.state.teams.Left.characters;
  run.engine.setTargetChooser(new FixedTargetChooser(targets[1]!.id));
  const events=run.session.resolve({type:'cast',characterId:run.caster.id});
  expect(events.some(e=>e.type==='skill-cast'&&e.characterId===run.caster.id&&e.skillId==='st:7004')).toBe(true);
  expect(run.caster.mana).toBe(0);
  expect(targets.map(c=>[c.hp,c.armor])).toEqual([[100,7],[92,0]]); // magic 12 + self-red 1 + 2 = 15, absorbs 7 armor
 });
 it('leaves the Red caster at half mana after a real non-Red three-match',()=>{
  const run=battle({matchColor:BaseColor.Blue});run.session.passTurn();
  const events=run.session.resolve({type:'swap',from:{row:0,col:1},to:{row:1,col:1}});
  expect(events.some(e=>e.type==='elimination')).toBe(true);
  expect(run.caster.mana).toBe(3);
 });
 it.each([null,4,999])('rejects cancelled, friendly, and stale target %s before any committed cast',(target)=>{
  assertRejectedTarget(PlayerSide.Right,target);
 });
 it.each([null,4,999])('rejects cancelled, friendly, and stale target %s before any committed cast on side Left',(target)=>{
  assertRejectedTarget(PlayerSide.Left,target);
 });
 it('preserves configuration on JSON reopen and produces the same action events, board, and result under the same seed',()=>{
  const play=(restore:boolean)=>{
   const run=battle({restore});run.session.passTurn();
   expect(run.caster).toMatchObject({mana:3,manaCost:6,magic:13});
   const matches=run.session.resolve({type:'swap',from:{row:0,col:1},to:{row:1,col:1}});
   expect(matches.filter(e=>e.type==='elimination').map(e=>e.cells.map(c=>({pos:c.pos,gemType:c.gemType})))).toContainEqual([
    {pos:{row:0,col:0},gemType:colorGem(BaseColor.Red)},
    {pos:{row:0,col:1},gemType:colorGem(BaseColor.Red)},
    {pos:{row:0,col:2},gemType:colorGem(BaseColor.Red)},
   ]);
   expect(matches.filter(e=>e.type==='mana-gain').filter(e=>e.characterId===run.caster.id).map(e=>[e.color,e.amount,e.player])).toEqual([[BaseColor.Red,3,PlayerSide.Right]]);
   expect(run.caster.mana).toBe(6);
   if(run.state.activePlayer!==PlayerSide.Right)run.session.passTurn();
   const targets=run.state.teams.Left.characters;
   expect(targets.map(c=>[c.id,c.hp,c.armor])).toEqual([[0,100,7],[1,100,7]]);
   run.engine.setTargetChooser(new FixedTargetChooser(1));
   const cast=run.session.resolve({type:'cast',characterId:run.caster.id});
   expect(cast.filter(e=>e.type==='skill-cast').map(e=>[e.characterId,e.skillId])).toEqual([[run.caster.id,'st:7004']]);
   expect(cast.filter(e=>e.type==='skill-damage').map(e=>[e.targetId,e.damage,e.range])).toEqual([[1,15,'single']]);
   expect(targets.map(c=>[c.hp,c.armor])).toEqual([[100,7],[92,0]]);
   expect(run.caster.mana).toBe(0);
   run.session.surrender();
   return {bp:run.bp,events:run.session.recordedEvents(),board:Array.from({length:8},(_,row)=>Array.from({length:8},(_,col)=>run.state.board.get({row,col}))),result:run.session.buildResult()};
  };
  expect(play(true)).toEqual(play(false));
 });
});
