import {describe, expect, it} from 'vitest';
// @ts-expect-error Node-only fixture inspection; the app deliberately has no Node types.
import {existsSync} from 'node:fs';
import fixture from '../fixtures/stEnemySupportExpectations.json';
import troops from '../../src/data/troops.json';
import traits from '../../src/data/traits.json';
import progression from '../../src/data/troop-progression.json';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {SeededRNG} from '../../src/engine/rng';
import {firstCastableCharacter, chooseAiAction, evaluateSwaps} from '../../src/engine/aiPolicy';
import {BaseColor, PlayerSide, colorGem, skullGem} from '../../src/engine/types';
import type {Character, GemType} from '../../src/engine/types';
import type {GameEvent} from '../../src/engine/events';
import type {EffectSegment, SkillPrototype} from '../../src/engine/skills/prototypes';
import {FixedTargetChooser} from '../../src/engine/skills/targetChooser';
import {BATTLE_SCHEMA_VERSION, RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest, CombatantSnapshot} from '../../src/session/contract';
import {mapRequestToTeams} from '../../src/session/combatantMapping';
import {BattleSession} from '../../src/session/BattleSession';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {compileEnemyBlueprint, restoreEnemyBlueprint, adaptedTraitDescription} from '../../src/sillytavern/enemyBlueprint';
import {PORTRAITS, savePortrait} from '../../src/sillytavern/portraits';

// These frozen expectations were read from source, never from compileEnemyBlueprint,
// adaptedPrototype, getTrait, engine scaling helpers, or a previous test result.
// Test-only hostile probes replace the dummy weapon; the subject's active/traits
// always travel through the complete production compile -> prepare -> map -> engine -> session path.
type Row = typeof fixture.enemies[number];
type SourceTrait = {code:string; typeAura?:{troopType:string;stat:string;amount:number};
 teamAura?:{scope:string;stat:string;amount:number}; perAllyColor?:{color:string;stat:string;amount:number};
 positionAura?:{position:string;gains:Record<string,number>}; statusImmunities?:string[];
 regen?:{stat:string;amount:number}; manaLink?:{color:string;amount:number};
 skullMultVsTroopType?:{troopType:string;mult:number}; skullDamageReduction?:number;
 devourImmunity?:boolean; summonOnDeath?:{chance:number}; onAllyCastGain?:{stat:string;amount:number};
 onEnemyCastGain?:{stat:string;amount:number}};
const sideOther = (side:PlayerSide) => side===PlayerSide.Left ? PlayerSide.Right : PlayerSide.Left;
const affinities = fixture.affinities as Record<string,string>;
const a = (race:string) => affinities[race]!;
const sourceTraits = (row:Row) => row.sourceTraits as SourceTrait[];
const familyName = (row:Row) => `ST support ${row.enemyId} ${row.referenceName}: source-grounded behavior acceptance`;
// Native spell 7334 CountGems uses Amount=34; the displayed [3:1] is approximate.
// Keep this literal independent of the compiled prototype and engine helpers.
const nativeRedBoost = (count:number) => Math.floor(count*34/100);
const colors = [BaseColor.Blue,BaseColor.Green,BaseColor.Red,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
function dummy(externalId:string, overrides:Partial<CombatantSnapshot>={}):CombatantSnapshot {
 return {externalId,name:externalId,stats:{hp:100,armor:7,attack:10,magic:4},manaColors:[BaseColor.Purple],manaCost:13,skillId:'gw_KnightsSword',...overrides};
}
function blueprint(row:Row,level=20,difficulty=1) {
 const portrait=PORTRAITS.find(p=>p.troopId===row.enemyId)!;
 return compileEnemyBlueprint({portrait:savePortrait({manaColors:portrait.manaColors,rank:portrait.rank,form:portrait.form,role:portrait.role},portrait),externalId:'subject',level,difficulty});
}
function board(match:GemType=colorGem(BaseColor.Red)) {
 const b=new BoardModel();
 for(let row=0;row<8;row++)for(let col=0;col<8;col++)b.set({row,col},{id:row*8+col,type:colorGem(colors[(row*3+col*5)%6]!)});
 const other=match.kind==='color'&&match.color===BaseColor.Blue?BaseColor.Green:BaseColor.Blue;
 for(const [row,col,type] of [[0,0,match],[0,1,colorGem(other)],[0,2,match],[1,1,match]] as const)b.set({row,col},{id:row*8+col,type});
 b.set({row:0,col:3},{id:3,type:colorGem(other)});
 return b;
}
type Options={side?:PlayerSide;level?:number;difficulty?:number;allies?:CombatantSnapshot[];opponents?:CombatantSnapshot[];
 dead?:string[];subjectIndex?:number;match?:GemType;restore?:boolean;probe?:SkillPrototype;seed?:number;mode?:'pvp'};
function battle(row:Row, options:Options={}) {
 const side=options.side??PlayerSide.Right;
 const compiled=blueprint(row,options.level,options.difficulty);
 const bp=options.restore?restoreEnemyBlueprint(JSON.parse(JSON.stringify(compiled))):compiled;
 const own=[...options.allies??[dummy('chosen'),dummy('untouched')]];
 own.splice(options.subjectIndex??0,0,bp.snapshot);
 const opposing=options.opponents??[dummy('foe'),dummy('foe-other')];
 const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:`support-${row.enemyId}`,requestId:`support-${row.enemyId}`,
  seed:options.seed??fixture.openingRandomStatRolls.seed,...(options.mode?{mode:options.mode}:{}),playerTeam:side===PlayerSide.Left?own:opposing,enemyTeam:side===PlayerSide.Right?own:opposing};
 // Expected inputs never read mapped or compiled subject attributes.
 const subjectInput:CombatantSnapshot={externalId:'subject',name:row.referenceName,
  stats:{...(row.stats as Record<string,CombatantSnapshot['stats']>)[`${options.level??20}@${options.difficulty??1}`]!},
  manaColors:row.sourceTroop.manaColors as BaseColor[],manaCost:row.sourceTroop.manaCost,
  troopTypes:row.sourceTroop.troopTypes.map(a)};
 const ownInputs=structuredClone(options.allies??[dummy('chosen'),dummy('untouched')]);
 ownInputs.splice(options.subjectIndex??0,0,subjectInput);
 const openingInputs:Record<PlayerSide,CombatantSnapshot[]>={
  [PlayerSide.Left]:side===PlayerSide.Left?ownInputs:structuredClone(opposing),
  [PlayerSide.Right]:side===PlayerSide.Right?ownInputs:structuredClone(opposing)};
 const deadInputs=[...options.dead??[]];
 const setup=prepareStBattle(request);
 if(options.probe)setup.registry.prototypes.set('gw_KnightsSword',structuredClone(options.probe));
 const teams=mapRequestToTeams(request);
 const state=createGameState(board(options.match),teams.playerTeam,teams.enemyTeam);
 for(const externalId of options.dead??[]) {
  const char=state.teams[side].characters.find(c=>c.id===teams.idMap.internalIdOf(externalId))!;
  char.hp=0;char.defeated=true;
 }
 const rng=new SeededRNG(request.seed);let next=1000;
 const engine=new TurnEngine(state,rng,()=>next++,setup.registry,setup.configureEngine);
 // Same arena switch as App.startBattle; BattleSession consumes the opening events.
 if(request.mode==='pvp')engine.pvpMode=true;
 const session=new BattleSession({request,engine,idMap:teams.idMap});
 const caster=state.teams[side].characters.find(c=>c.id===teams.idMap.internalIdOf('subject'))!;
 const byName=(name:string)=>Object.values(state.teams).flatMap(t=>t.characters).find(c=>c.id===teams.idMap.internalIdOf(name))!;
 return {row,side,bp,request,state,rng,engine,session,setup,openingInputs,deadInputs,caster,byName};
}
type Run=ReturnType<typeof battle>;
function stats(c:Character) {return {hp:c.hp,maxHp:c.maxHp,armor:c.armor,attack:c.attack,magic:c.magic,mana:c.mana};}
function grid(run:Run) {return Array.from({length:64},(_,i)=>run.state.board.get({row:Math.floor(i/8),col:i%8}));}
function go(run:Run, side=run.side) {if(run.state.activePlayer!==side)run.session.passTurn();}
function cast(run:Run,target=run.byName('chosen'),caster=run.caster) {
 go(run,run.state.teams[run.side].characters.includes(caster)?run.side:sideOther(run.side));
 caster.mana=caster.manaCost;
 run.engine.setTargetChooser(new FixedTargetChooser(target.id));
 return run.session.resolve({type:'cast',characterId:caster.id});
}
function swap(run:Run) {return run.session.resolve({type:'swap',from:{row:0,col:1},to:{row:1,col:1}});}
function portExpected(value:unknown):unknown {
 if(typeof value==='string')return affinities[value]??value;
 if(Array.isArray(value))return value.map(portExpected);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,portExpected(v)]));
 return value;
}
// A small independent opening oracle uses frozen source declarations and frozen
// random-stat rolls, rather than inspecting any compiled stats/passive/segments.
function openingExpected(run:Run,side=run.side) {
 const own=run.openingInputs[side];
 const dead=(c:CombatantSnapshot)=>side===run.side&&run.deadInputs.includes(c.externalId);
 const expected=own.map(c=>({hp:dead(c)?0:c.stats.hp,maxHp:c.stats.hp,armor:c.stats.armor,attack:c.stats.attack,magic:c.stats.magic,mana:0}));
 if(side!==run.side)return expected;
 const add=(index:number,stat:string,n:number)=>{
  if(dead(own[index]!))return;
  const target=expected[index]!;
  target[stat as keyof typeof target]+=n;
  if(stat==='hp')target.maxHp+=n;
 };
 for(const tr of sourceTraits(run.row)) {
  if(tr.teamAura) {
   let roll=0;
   own.forEach((_,i)=>{for(let n=0;n<tr.teamAura!.amount;n++)add(i,fixture.openingRandomStatRolls.stats[roll++]!,1);});
  }
  if(tr.typeAura)own.forEach((c,i)=>{if(c.troopTypes?.includes(a(tr.typeAura!.troopType)))add(i,tr.typeAura!.stat,tr.typeAura!.amount);});
 }
 const holder=own.findIndex(c=>c.externalId==='subject');
 for(const tr of sourceTraits(run.row)) {
  if(tr.perAllyColor)add(holder,tr.perAllyColor.stat,own.filter(c=>!dead(c)&&c.manaColors.includes(tr.perAllyColor!.color as BaseColor)).length*tr.perAllyColor.amount);
  if(tr.positionAura&&holder===0)for(const [stat,n] of Object.entries(tr.positionAura.gains))add(holder,stat,n);
 }
 return expected;
}
function expectedMagic(run:Run) {return openingExpected(run)[run.openingInputs[run.side].findIndex(c=>c.externalId==='subject')]!.magic;}
function effectBuffs(events:GameEvent[]) {return events.filter(e=>e.type==='buff'&&e.source!=='trait').map(e=>e.type==='buff'?{targetId:e.targetId,stat:e.stat,amount:e.amount,...(e.maxHpGain===undefined?{}:{maxHpGain:e.maxHpGain})}:null);}
function probe(...segments:EffectSegment[]):SkillPrototype {return {segments};}
function inflict(statusId:string):Extract<EffectSegment,{kind:'status'}> {return {kind:'status',target:'enemyChosen',statusId,turns:3};}
function snapshot(run:Run) {return structuredClone({teams:run.state.teams,board:grid(run),rng:run.rng.getState(),actions:run.state.actionLog,side:run.state.activePlayer,events:run.session.recordedEvents()});}

for(const row of fixture.enemies)describe(familyName(row),()=>{
 it('binds frozen portrait, source role, exact mana, complete active and all ordinary traits',()=>{
  expect(troops.find(t=>t.id===row.enemyId)).toEqual(row.sourceTroop);
  for(const tr of row.sourceTraits)expect(traits.find(t=>t.code===tr.code)).toEqual(tr);
  const run=battle(row), t=row.sourceTroop;
  expect(PORTRAITS.find(p=>p.troopId===row.enemyId)).toEqual(row.portrait);
  expect(existsSync(`game-assets/public/static/portraits/${row.portrait.assetId}.webp`)).toBe(true);
  expect(run.bp.snapshot).toMatchObject({role:t.role,rarityIdx:t.rarityIdx,manaColors:t.manaColors,manaCost:t.manaCost,skillId:`st:${t.spell.id}`,traitIds:t.traits.map(tr=>`st:${tr.code}`),stats:row.stats['20@1']});
  expect(run.bp.snapshot.portraitUrl).toBe(`/static/portraits/${row.portrait.assetId}.webp`);
  expect(run.caster).toMatchObject({role:t.role,colors:t.manaColors,manaCost:t.manaCost,skillId:`st:${t.spell.id}`,troopTypes:t.troopTypes.map(a)});
  expect(run.setup.registry.prototypes.get(`st:${t.spell.id}`)?.segments).toEqual(portExpected(row.segments));
  expect(run.setup.registry.prototypes.get(`st:${t.spell.id}`)?.oncePerBattle??false).toBe('oncePerBattle' in row?row.oncePerBattle:false);
  expect(run.bp.budget).toMatchObject({activeCount:1,traitCount:t.traits.length,effectSegments:row.segments.length,manaCost:t.manaCost});
  expect(run.bp.omittedMechanisms).toEqual([]);
 });
 it('describes each source effect, chosen scope, scaling, race and ordinary trait without source names',()=>{
  const run=battle(row), description=run.bp.snapshot.spellDescription!;
  expect(run.bp.descriptionAudit).toEqual({support:'full',diagnostics:[]});
  const labels:Record<string,string>={attack:'攻击',armor:'护甲',hp:'生命',mana:'法力',magic:'魔力'};
  for(const seg of row.segments) {
   if('stat' in seg)expect(description).toContain(labels[seg.stat!]!);
   // Game-style wording (2026-10-29): 净化, "生命增加", hidden race as 特定族群.
   if(seg.kind==='cleanse')expect(description).toContain('净化');
   if('lifeMode' in seg)expect(description).toMatch(/生命.*增加|恢复.*生命|生命回满/);
   if('raceDouble' in seg){expect(description).toContain('若目标为特定族群则效果翻倍');expect(description).not.toMatch(/affinity:|族群#/);}
   if('halve' in seg)expect(description).toContain('50%');
  }
  for(const clause of fixture.activeDescriptionClauses[String(row.enemyId) as keyof typeof fixture.activeDescriptionClauses])expect(description).toContain(clause);
  expect(description).not.toContain(row.referenceName);
  expect(run.bp.traitDescriptionAudit.map(t=>t.code)).toEqual(row.sourceTroop.traits.map(t=>`st:${t.code}`));
  for(const tr of row.sourceTraits) {
   const description=adaptedTraitDescription(tr.code)!;
   expect(description).toMatchObject({support:'full',diagnostics:[]});
   for(const clause of (fixture.traitDescriptionClauses as Record<string,string[]>)[tr.code]!)expect(description.description).toContain(clause);
  }
  const chosen=row.segments.some(s=>s.target==='allyChosen');
  if(chosen)expect(description).toContain('一名盟友');
  if(row.enemyId===6081){expect(description).toContain('所有盟友');expect(description).toContain('第一位盟友');}
  if(row.enemyId===6258)expect(description).toContain('所有其他盟友');
  if(row.enemyId===6097){expect(description).toContain('棋盘上至少有13颗棕色宝石');expect(description).toContain('所有盟友');}
  if(row.enemyId===6091)expect(description).toContain('生命回满');
 });
 for(const [level,difficulty] of [[1,1],[20,1],[20,1.5],[40,1]])it(`scales source stats at level ${level} difficulty ${difficulty} and uses scaled magic in the actual cast`,()=>{
  const run=battle(row,{level,difficulty});
  expect(run.bp.snapshot.stats).toEqual((row.stats as Record<string,unknown>)[`${level}@${difficulty}`]);
  expect(run.state.teams[run.side].characters.map(stats)).toEqual(openingExpected(run));
  go(run);
  const target=run.byName('chosen'),before=stats(target),magic=expectedMagic(run);
  const ownBefore=run.state.teams[run.side].characters.map(stats);
  const events=cast(run);
  expect(events.filter(e=>e.type==='skill-cast').map(e=>e.type==='skill-cast'?e.skillId:null)).toEqual([`st:${row.sourceTroop.spell.id}`]);
  // Armor and life growth are checked against independent frozen formula constants.
  const expectedArmor:Record<number,number>={6028:magic+1,6082:magic+3,6142:magic+2,6193:magic+1+nativeRedBoost(grid(run).filter(g=>g?.type.kind==='color'&&g.type.color===BaseColor.Red).length),6351:Math.round(magic*.5+4)};
  if(row.enemyId in expectedArmor)expect(target.armor-before.armor).toBe(expectedArmor[row.enemyId]);
  const growth:Record<number,number>={6091:magic,6142:magic+2,6162:magic+2,6315:magic+1,6325:magic+2,6690:magic+1,6740:magic+1};
  if(row.enemyId in growth){expect(target.maxHp-before.maxHp).toBe(growth[row.enemyId]);expect(target.hp-before.hp).toBe(growth[row.enemyId]);}
  if(row.enemyId===6081)for(const [i,c] of run.state.teams[run.side].characters.entries())expect(c.attack-ownBefore[i]!.attack).toBe(magic+2);
  if(row.enemyId===6258)for(const [i,c] of run.state.teams[run.side].characters.entries()){
   expect(c.attack-ownBefore[i]!.attack).toBe(c===run.caster?0:magic+1);
   expect(c.magic-ownBefore[i]!.magic).toBe(c===run.caster?0:-1);
  }
  if(row.enemyId===6486){
   expect(run.caster.hp-ownBefore[0]!.hp).toBe(magic+20);
   expect(run.caster.maxHp-ownBefore[0]!.maxHp).toBe(magic+20);
   expect(run.caster.armor-ownBefore[0]!.armor).toBe(magic+20);
   expect(stats(target)).toEqual(before);
  }
  if(row.enemyId===6097){
   expect(grid(run).filter(g=>g?.type.kind==='color'&&g.type.color===BaseColor.Brown).length).toBeLessThan(13);
   for(const [i,c] of run.state.teams[run.side].characters.entries())expect(c.armor-ownBefore[i]!.armor).toBe(c===run.caster?magic+3:0);
  }
  expect(run.caster.mana).toBe(0);
 });
 it.each([PlayerSide.Left,PlayerSide.Right])('applies all source opening auras only to living same-side races and colors on side %s',(side)=>{
  const bond=sourceTraits(row).find(t=>t.typeAura)?.typeAura?.troopType??'Beast';
  const color=(sourceTraits(row).find(t=>t.perAllyColor)?.perAllyColor?.color??'Green') as BaseColor;
  const otherColor=colors.find(c=>c!==color)!;
  const run=battle(row,{side,dead:['dead'],allies:[dummy('matching',{troopTypes:[a(bond)],manaColors:[color,otherColor]}),dummy('dead',{troopTypes:[a(bond)],manaColors:[color]}),dummy('different',{troopTypes:[a('Daemon')],manaColors:[otherColor]})],opponents:[dummy('foe',{troopTypes:[a(bond)],manaColors:[color]}),dummy('foe-other',{troopTypes:[a(bond)],manaColors:[color]})]});
  expect(run.state.teams[side].characters.map(stats)).toEqual(openingExpected(run));
  expect(run.state.teams[sideOther(side)].characters.map(stats)).toEqual(openingExpected(run,sideOther(side)));
  expect(run.byName('dead')).toMatchObject({hp:0,maxHp:100,defeated:true,attack:10,armor:7,magic:4,mana:0});
 });
 it.each([PlayerSide.Left,PlayerSide.Right])(row.enemyId===6486?'executes every active segment on its source-defined living targets without changing other targets on side %s':'executes every active segment on the selected living ally without changing other targets on side %s',(side)=>{
  const run=battle(row,{side});
  go(run);
  const chosen=run.byName('chosen'),other=run.byName('untouched');
  chosen.hp-=15;
  if([6028,6091,6325,6690].includes(row.enemyId))chosen.statuses=[{id:'poison',turns:3},{id:'silence',turns:3},{id:'web',turns:3},{id:'submerged',turns:3}];
  const before=stats(chosen),otherBefore=stats(other),casterBefore=stats(run.caster),foes=run.state.teams[sideOther(side)].characters.map(stats),beforeGrid=structuredClone(grid(run));
  const magic=expectedMagic(run)+(row.enemyId===6325?1:0);
  const red=grid(run).filter(g=>g?.type.kind==='color'&&g.type.color===BaseColor.Red).length;
  const events=cast(run);
  const expected:{targetId:number;stat:string;amount:number;maxHpGain?:number}[]=[];
  const gain=(stat:string,n:number,target=chosen)=>expected.push({targetId:target.id,stat,amount:n,...(stat==='hp'?{maxHpGain:n}:{})});
  switch(row.enemyId) {
   case 6028:gain('armor',magic+1);break;
   case 6081:for(const c of run.state.teams[side].characters)gain('attack',magic+2,c);break;
   case 6091:gain('hp',magic);gain('attack',magic);expected.push({targetId:chosen.id,stat:'hp',amount:15});break;
   case 6097:gain('armor',magic+3,run.caster);break;
   case 6082:gain('attack',magic+3);gain('armor',magic+3);break;
   case 6142:gain('attack',magic+2);gain('armor',magic+2);gain('hp',magic+2);gain('mana',6);break;
   case 6162:gain('attack',magic+2);gain('hp',magic+2);break;
   case 6193:gain('attack',magic+1+nativeRedBoost(red));gain('armor',magic+1+nativeRedBoost(red));break;
   case 6258:gain('magic',-1,chosen);gain('magic',-1,other);gain('attack',magic+1,chosen);gain('attack',magic+1,other);break;
   case 6315:gain('hp',magic+1);gain('magic',2);break;
   case 6323:gain('mana',6);gain('magic',2);break;
   case 6325:gain('hp',magic+1);break;
   case 6351:gain('armor',Math.round(magic*.5+4));gain('magic',1);break;
   case 6486:gain('hp',magic+20,run.caster);gain('armor',magic+20,run.caster);break;
   case 6690:gain('hp',magic+1);break;
   case 6740:gain('hp',magic+1);gain('attack',5);break;
  }
  expect(effectBuffs(events)).toEqual(expected);
  if(![6081,6097,6258].includes(row.enemyId))expect(stats(other)).toEqual(otherBefore);
  if(row.enemyId===6486){expect(stats(chosen)).toEqual(before);expect(stats(run.caster)).toEqual({...casterBefore,hp:casterBefore.hp+magic+20,maxHp:casterBefore.maxHp+magic+20,armor:casterBefore.armor+magic+20,mana:0});}
  if(row.enemyId===6258){expect(chosen.magic).toBe(before.magic-1);expect(other.magic).toBe(otherBefore.magic-1);expect(stats(run.caster)).toEqual({...casterBefore,mana:0});}
  if([6028,6091,6325,6690].includes(row.enemyId)){
   expect(chosen.statuses.map(s=>s.id)).not.toEqual(expect.arrayContaining(['poison','silence','web']));
   expect(chosen.statuses.some(s=>s.id==='submerged')).toBe(true);
   for(const id of ['poison','silence','web'])expect(chosen.statuses.some(s=>s.id===id)).toBe(false);
  }
  const status:Record<number,string[]>={6028:['barrier'],6323:['enchanted'],6325:['enchanted'],6690:['blessed','enchanted']};
  for(const id of status[row.enemyId]??[])expect(chosen.statuses.some(s=>s.id===id)).toBe(true);
  if(row.enemyId===6081){expect(run.caster.statuses.some(s=>s.id==='barrier')).toBe(true);expect(other.statuses).toEqual([]);}
  expect(run.state.teams[sideOther(side)].characters.map(stats)).toEqual(foes);
  expect(grid(run)).toEqual(beforeGrid);
  expect(run.caster.mana).toBe(0);
  expect(run.state.activePlayer).toBe(sideOther(side));
 });
 for(const color of row.sourceTroop.manaColors)it(`charges from a real ${color} three-match with exact link bonus and no opponent credit`,()=>{
  const run=battle(row,{match:colorGem(color as BaseColor)});go(run);
  const events=swap(run),link=sourceTraits(row).filter(t=>t.manaLink?.color===color).reduce((n,t)=>n+t.manaLink!.amount,0);
  expect(events.filter(e=>e.type==='elimination').map(e=>e.type==='elimination'?e.cells.map(c=>c.pos):[])).toContainEqual([{row:0,col:0},{row:0,col:1},{row:0,col:2}]);
  expect(run.caster.mana).toBe(3+link);
  expect(events.filter(e=>e.type==='mana-gain'&&e.characterId===run.caster.id).map(e=>e.type==='mana-gain'?[e.color,e.amount,e.player]:[])).toEqual([[color,3+link,run.side]]);
  expect(run.state.teams[sideOther(run.side)].characters.every(c=>c.mana===0)).toBe(true);
 });
 it('does not charge from an off-color three-match and rejects underfilled and wrong-side casts atomically',()=>{
  const off=colors.find(c=>!row.sourceTroop.manaColors.includes(c))!;
  const run=battle(row,{match:colorGem(off)});go(run);
  expect(swap(run).some(e=>e.type==='elimination')).toBe(true);expect(run.caster.mana).toBe(0);
  go(run);run.caster.mana=run.caster.manaCost-1;
  let before=snapshot(run);expect(run.session.resolve({type:'cast',characterId:run.caster.id})).toEqual([]);expect(snapshot(run)).toEqual(before);
  run.caster.mana=run.caster.manaCost;go(run,sideOther(run.side));
  before=snapshot(run);expect(run.session.resolve({type:'cast',characterId:run.caster.id})).toEqual([]);expect(snapshot(run)).toEqual(before);
 });
 // Only allyChosen segments invoke the chooser; allySelf spells ignore it.
 if(row.segments.some(s=>s.target==='allyChosen'))for(const side of [PlayerSide.Left,PlayerSide.Right])it.each(['cancelled','opposing','stale','defeated'])(`rejects %s ally selection without spending mana, RNG, action, turn or events on side ${side}`,(kind)=>{
  const run=battle(row,{side});go(run);run.caster.mana=run.caster.manaCost;
  const chosen=run.byName('chosen');if(kind==='defeated'){chosen.hp=0;chosen.defeated=true;}
  const target=kind==='cancelled'?null:kind==='opposing'?run.byName('foe').id:kind==='stale'?999:chosen.id;
  let calls=0;run.engine.setTargetChooser({choose(mode){calls++;expect(mode).toBe('allyChosen');return target;}});
  const before=snapshot(run);expect(run.session.resolve({type:'cast',characterId:run.caster.id})).toEqual([]);expect(calls).toBe(1);expect(snapshot(run)).toEqual(before);
 });
 it('preserves frozen configuration through JSON reopen and replays identical actions, events, board and BattleResult',()=>{
  const play=(restore:boolean)=>{
   const run=battle(row,{restore,match:colorGem(row.sourceTroop.manaColors[0] as BaseColor)});
   go(run);swap(run);go(run);cast(run);run.session.surrender();
   expect(run.session.buildResult()).toBe(run.session.buildResult());
   return {bp:run.bp,events:run.session.recordedEvents(),board:grid(run),teams:run.state.teams,result:run.session.buildResult()};
  };
  expect(play(true)).toEqual(play(false));
  const changed=JSON.parse(JSON.stringify(blueprint(row)));changed.snapshot.manaCost++;
  expect(()=>restoreEnemyBlueprint(changed)).toThrow();
 });

 for(const tr of sourceTraits(row)) {
  for(const statusId of tr.statusImmunities?.includes('negative')?['poison','burning','bleed','silence','frozen','stun','entangle','web','disease','death-mark','marked','charm','mana-burn','faerie-fire','terror','wolf-form']:tr.statusImmunities??[])it(`ordinary trait ${tr.code} blocks ${statusId} through a hostile session cast and permits a positive status`,()=>{
   const run=battle(row,{probe:probe({...inflict(statusId),target:'enemyAll'})});
   const events=cast(run,run.caster,run.byName('foe'));
   expect(events.some(e=>e.type==='status-blocked'&&e.targetId===run.caster.id&&e.statusId===statusId)).toBe(true);
   expect(run.caster.statuses.some(s=>s.id===statusId)).toBe(false);
   expect(events.some(e=>e.type==='status-apply'&&e.targetId===run.byName('chosen').id&&e.statusId===statusId)).toBe(true);
   run.setup.registry.prototypes.set('gw_KnightsSword',probe(inflict('barrier')));
   const positive=cast(run,run.caster,run.byName('foe'));
   expect(positive.some(e=>e.type==='status-apply'&&e.targetId===run.caster.id&&e.statusId==='barrier')).toBe(true);
  });
  if(tr.devourImmunity)it(`ordinary trait ${tr.code} prevents a guaranteed hostile devour without consuming its chance roll`,()=>{
   const run=battle(row,{probe:probe({kind:'devour',target:'enemyChosen',chance:1})});
   const before=stats(run.caster),rng=run.rng.getState();
   const hostile=run.byName('foe');
   const events=cast(run,run.caster,hostile);
   const committed={type:'skill-cast',characterId:hostile.id,skillId:'gw_KnightsSword'};
   expect(events).toContainEqual(committed);expect(run.session.recordedEvents()).toContainEqual(committed);expect(hostile.mana).toBe(0);
   expect(stats(run.caster)).toEqual({...before,armor:before.armor+(row.enemyId===6097?1:0)});expect(run.caster.defeated).toBe(false);
   expect(events.some(e=>e.type==='defeat')).toBe(false);expect(run.rng.getState()).toBe(rng);
   const control=run.byName('chosen');expect(control.defeated).toBe(false);
   const consumed=cast(run,control,hostile);
   expect(consumed).toContainEqual(committed);expect(hostile.mana).toBe(0);
   expect(control.defeated).toBe(true);expect(control.hp).toBe(0);
   expect(consumed.some(e=>e.type==='skill-damage'&&e.casterId===hostile.id&&e.targetId===control.id&&e.devoured===true)).toBe(true);
   expect(consumed.some(e=>e.type==='defeat')).toBe(true);expect(run.rng.getState()).not.toBe(rng);
   expect(run.caster.defeated).toBe(false);
  });
  if(tr.regen)it(`ordinary trait ${tr.code} restores exactly one ${tr.regen.stat} on own turn start and never the opponent turn`,()=>{
   const run=battle(row);go(run);const stat=tr.regen!.stat as 'hp'|'armor';
   run.caster[stat]-=3;const before=run.caster[stat];
   run.session.passTurn();expect(run.caster[stat]).toBe(before);
   const events=run.session.passTurn();expect(run.caster[stat]).toBe(before+1);
   expect(events.some(e=>e.type==='buff'&&e.source==='trait'&&e.targetId===run.caster.id&&e.stat===stat&&e.amount===1)).toBe(true);
   if(stat==='hp'){run.caster.hp=run.caster.maxHp;run.session.passTurn();run.session.passTurn();expect(run.caster.hp).toBe(run.caster.maxHp);}
  });
  if(tr.skullMultVsTroopType)it(`ordinary trait ${tr.code} doubles actual skull damage only against its designated race`,()=>{
   const spec=tr.skullMultVsTroopType!;
   for(const match of [true,false]){
    const run=battle(row,{match:skullGem(),opponents:[dummy('foe',{troopTypes:[a(match?spec.troopType:'Human')],stats:{hp:1000,armor:100,attack:10,magic:4}})]});
    go(run);const attack=openingExpected(run)[0]!.attack,events=swap(run);
    expect(events.filter(e=>e.type==='skull-damage').map(e=>e.type==='skull-damage'?[e.attackerId,e.targetId,e.damage]:[])).toEqual([[run.caster.id,run.byName('foe').id,attack*(match?spec.mult:1)]]);
    expect(run.byName('foe').armor).toBe(100-attack*(match?spec.mult:1)-(row.enemyId===6091?3:0));
    if(row.enemyId===6091)expect(events.some(e=>e.type==='status-tick'&&e.statusId==='burning')).toBe(true);
   }
  });
  if(tr.skullDamageReduction!==undefined)it(`ordinary trait ${tr.code} reduces incoming skull damage with source rounding and preserves spell damage`,()=>{
   const run=battle(row,{match:skullGem(),probe:probe({kind:'damage',target:'enemyChosen',scaling:{base:12,mult:0}}),opponents:[dummy('foe',{stats:{hp:100,armor:7,attack:12,magic:0}})]});
   const before=stats(run.caster),events=swap(run),damage=Math.round(12*(1-tr.skullDamageReduction!));
   expect(events.filter(e=>e.type==='skull-damage').map(e=>e.type==='skull-damage'?e.damage:0)).toEqual([damage]);
   expect(run.caster.hp+run.caster.armor).toBe(before.hp+before.armor-damage);
   const spell=cast(run,run.caster,run.byName('foe'));
   expect(spell.filter(e=>e.type==='skill-damage').map(e=>e.type==='skill-damage'?e.damage:0)).toEqual([12]);
  });
  if(tr.onAllyCastGain||tr.onEnemyCastGain)it(`ordinary trait ${tr.code} reacts to its source cast side including self and excludes the other side`,()=>{
   const spec=tr.onAllyCastGain??tr.onEnemyCastGain!,stat=spec.stat as 'magic'|'armor';
   const run=battle(row,{probe:probe()});const before=run.caster[stat];
   cast(run,run.caster,run.byName(tr.onAllyCastGain?'chosen':'foe'));
   expect(run.caster[stat]).toBe(before+spec.amount);
   cast(run,run.caster,run.byName(tr.onAllyCastGain?'foe':'chosen'));
   expect(run.caster[stat]).toBe(before+spec.amount);
   if(tr.onAllyCastGain){cast(run);expect(run.caster[stat]).toBe(before+2*spec.amount);}
  });
 }
 if(row.enemyId===6162)it('ordinary trait leader grants all four skills once at front and waits for an actual front vacancy',()=>{
  const run=battle(row,{subjectIndex:1,probe:probe({kind:'damage',target:'enemyChosen',scaling:{base:1000,mult:0},trueDamage:true})});
  expect(run.state.teams[run.side].characters.map(stats)).toEqual(openingExpected(run));
  const before=stats(run.caster);cast(run,run.byName('chosen'),run.byName('foe'));
  expect(stats(run.caster)).toEqual(before);
  cast(run,run.byName('untouched'));
  expect(stats(run.caster)).toEqual({...before,hp:before.hp+3,maxHp:before.maxHp+3,armor:before.armor+3,attack:before.attack+3,magic:before.magic+3});
  const after=stats(run.caster);cast(run,run.byName('untouched'));expect(stats(run.caster)).toEqual(after);
 });
});

// Cross-family branches stay parameterized: matching vs nonmatching recipients,
// wounded vs full Life, and both teams. Arithmetic is source-only, never read
// from the runtime prototype or the compiler's returned values.
for(const row of fixture.enemies.filter(r=>r.segments.some(s=>'raceDouble' in s)))describe(familyName(row),()=>{
 const race=(row.segments.find(s=>'raceDouble' in s) as {raceDouble:string}).raceDouble;
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const matching of [true,false])for(const full of [true,false])it(`raceDouble ${race} matching=${matching} fullLife=${full} on side ${side} changes current and maximum Life independently of armor`,()=>{
  const run=battle(row,{side,allies:[dummy('chosen',{troopTypes:[a(matching?race:'Daemon')]}),dummy('untouched')]});go(run);
  const target=run.byName('chosen');if(!full)target.hp-=17;
  const before=stats(target),magic=expectedMagic(run),factor=matching?2:1;
  const events=cast(run);const delta:Record<string,number>={};
  switch(row.enemyId){
   case 6082:delta.attack=delta.armor=(magic+3)*factor;break;
   case 6162:delta.attack=delta.hp=(magic+2)*factor;break;
   case 6315:delta.hp=(magic+1)*factor;delta.magic=2*factor;break;
   case 6351:delta.armor=Math.round(magic*.5+4)*factor;delta.magic=factor;break;
   case 6740:delta.hp=(magic+1)*factor;delta.attack=5*factor;break;
  }
  for(const stat of ['hp','maxHp','armor','attack','magic','mana'] as const)expect(target[stat]-before[stat]).toBe(delta[stat==='maxHp'?'hp':stat]??0);
  expect(target.maxHp-target.hp).toBe(full?0:17);
  expect(effectBuffs(events)).toEqual(row.segments.filter(s=>s.kind==='buff').map(s=>{const stat=(s as {stat:string}).stat;return {targetId:target.id,stat,amount:delta[stat],...(stat==='hp'?{maxHpGain:delta.hp}:{})};}));
 });
});

for(const row of fixture.enemies.filter(r=>[6142,6323].includes(r.enemyId)))describe(familyName(row),()=>{
 it('caps granted mana at recipient cost and distinguishes silence from magic growth',()=>{
  const run=battle(row);go(run);const target=run.byName('chosen');target.mana=12;
  const before=stats(target);cast(run);expect(target.mana).toBe(13);
  if(row.enemyId===6323)expect(target.magic-before.magic).toBe(2);
  const silenced=battle(row);go(silenced);const ally=silenced.byName('chosen');ally.statuses=[{id:'silence',turns:3}];
  cast(silenced);expect(ally.mana).toBe(0);if(row.enemyId===6323)expect(ally.magic).toBe(openingExpected(silenced)[1]!.magic+2);
 });
});

for(const row of fixture.enemies.filter(r=>r.enemyId===6193))describe(familyName(row),()=>{
 it('reads red board count for both attack and armor across the three-to-one boundary',()=>{
  for(const count of [0,2,3,5,6,13,50,59,62]){
   const run=battle(row);go(run);
   for(let i=0;i<64;i++)run.state.board.set({row:Math.floor(i/8),col:i%8},{id:i,type:colorGem(i<count?BaseColor.Red:BaseColor.Blue)});
   const target=run.byName('chosen'),before=stats(target),magic=expectedMagic(run);cast(run);
   expect(target.attack-before.attack).toBe(magic+1+nativeRedBoost(count));expect(target.armor-before.armor).toBe(magic+1+nativeRedBoost(count));
  }
 });
});

// Preserve source promises as ordinary regressions for hostile effects and complete descriptions.
for(const row of fixture.enemies.filter(r=>[6082,6142,6193].includes(r.enemyId)))describe(familyName(row),()=>{
 for(const statusId of ['wolf','wolf-form','lycanthropy'])it(`honors source ${statusId} immunity through a hostile cast with a susceptible allied control`,()=>{
  const run=battle(row,{probe:probe({...inflict(statusId),target:'enemyAll'})});const events=cast(run,run.caster,run.byName('foe'));
  expect(events.some(e=>e.type==='status-apply'&&e.targetId===run.byName('chosen').id&&e.statusId===statusId)).toBe(true);
  expect(events.some(e=>e.type==='status-blocked'&&e.targetId===run.caster.id&&e.statusId===statusId)).toBe(true);
  expect(run.caster.statuses.some(s=>s.id===statusId)).toBe(false);
 });
});
for(const row of fixture.enemies.filter(r=>[6315,6323].includes(r.enemyId)))describe(familyName(row),()=>{
 it('honors source mana depletion immunity while an allied control drains to zero',()=>{
  const run=battle(row,{probe:probe({kind:'reduce',target:'enemyAll',stat:'mana',drainAll:true,scaling:{base:0,mult:0}})});
  run.caster.mana=7;run.byName('chosen').mana=7;cast(run,run.caster,run.byName('foe'));
  expect(run.byName('chosen').mana).toBe(0);expect(run.caster.mana).toBe(7);
 });
});


for(const row of fixture.enemies)describe(familyName(row),()=>{
 it('rejects unknown and defeated casters and actions after surrender atomically on both sides',()=>{
  for(const side of [PlayerSide.Left,PlayerSide.Right]){
   for(const kind of ['unknown','defeated','ended']){
    const run=battle(row,{side});go(run);run.caster.mana=run.caster.manaCost;
    if(kind==='defeated'){run.caster.hp=0;run.caster.defeated=true;}
    if(kind==='ended')run.session.surrender();
    const before=snapshot(run);
    expect(run.session.resolve({type:'cast',characterId:kind==='unknown'?999:run.caster.id})).toEqual([]);
    expect(snapshot(run)).toEqual(before);
   }
  }
 });
 if(row.segments.some(s=>s.target==='allyChosen'))it.each([PlayerSide.Left,PlayerSide.Right])('permits self selection for every chosen-ally segment on side %s',(side)=>{
  const run=battle(row,{side});go(run);run.caster.hp-=2;
  const others=run.state.teams[side].characters.filter(c=>c.id!==run.caster.id).map(stats);
  const foes=run.state.teams[sideOther(side)].characters.map(stats),beforeGrid=structuredClone(grid(run));
  const events=cast(run,run.caster);
  expect(events.some(e=>e.type==='skill-cast'&&e.skillId===`st:${row.sourceTroop.spell.id}`)).toBe(true);
  expect(effectBuffs(events).length).toBeGreaterThan(0);
  expect(effectBuffs(events).every(e=>e!.targetId===run.caster.id)).toBe(true);
  expect(run.state.teams[side].characters.filter(c=>c.id!==run.caster.id).map(stats)).toEqual(others);
  expect(run.state.teams[sideOther(side)].characters.map(stats)).toEqual(foes);
  expect(grid(run)).toEqual(beforeGrid);
 });
 for(const tr of row.sourceTraits){
  const gap=(fixture.sourceImmunityPromises as Record<string,{sourcePromise:string;requiredClause:string}>)[tr.code];
  if(gap)it(`describes the complete source immunity promise for ordinary trait ${tr.code}`,()=>{
   expect(tr.description).toBe(gap.sourcePromise);
   expect(adaptedTraitDescription(tr.code)!.description).toContain(gap.requiredClause);
  });
 }
});

for(const row of fixture.enemies.filter(r=>[6081,6258].includes(r.enemyId)))describe(familyName(row),()=>{
 it.each([PlayerSide.Left,PlayerSide.Right])('excludes dead slots from all-allies and other-allies support and finds the living front on side %s',(side)=>{
  const run=battle(row,{side,subjectIndex:1,dead:['chosen']});go(run);
  const dead=run.byName('chosen'),other=run.byName('untouched');
  const beforeDead=stats(dead),beforeOther=stats(other),beforeCaster=stats(run.caster),magic=expectedMagic(run);
  const events=cast(run,other);
  expect(stats(dead)).toEqual(beforeDead);
  expect(effectBuffs(events).some(e=>e!.targetId===dead.id)).toBe(false);
  expect(other.attack-beforeOther.attack).toBe(magic+(row.enemyId===6081?2:1));
  if(row.enemyId===6081){
   expect(run.caster.attack-beforeCaster.attack).toBe(magic+2);
   expect(run.caster.statuses.some(s=>s.id==='barrier')).toBe(true);
   expect(other.statuses.some(s=>s.id==='barrier')).toBe(false);
  }else{
   expect(other.magic-beforeOther.magic).toBe(-1);
   expect(stats(run.caster)).toEqual({...beforeCaster,mana:0});
  }
 });
});

for(const row of fixture.enemies.filter(r=>r.enemyId===6097))describe(familyName(row),()=>{
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const count of [0,12,13,14])it(`grants conditional five armor to every living ally including self at ${count} brown gems on side ${side}`,()=>{
  const run=battle(row,{side,dead:['dead'],allies:[dummy('chosen'),dummy('dead'),dummy('untouched')]});go(run);
  for(let i=0;i<64;i++)run.state.board.set({row:Math.floor(i/8),col:i%8},{id:i,type:colorGem(i<count?BaseColor.Brown:BaseColor.Blue)});
  const own=run.state.teams[side].characters,before=own.map(stats),beforeGrid=structuredClone(grid(run));
  const foes=run.state.teams[sideOther(side)].characters.map(stats),magic=expectedMagic(run);
  const events=cast(run),expected=[{targetId:run.caster.id,stat:'armor',amount:magic+3}];
  if(count>=13)for(const c of own.filter(c=>!c.defeated))expected.push({targetId:c.id,stat:'armor',amount:5});
  expect(effectBuffs(events)).toEqual(expected);
  own.forEach((c,i)=>expect(stats(c)).toEqual({...before[i],armor:before[i]!.armor+(c.defeated?0:(c===run.caster?magic+3:0)+(count>=13?5:0))}));
  expect(grid(run)).toEqual(beforeGrid);expect(run.caster.mana).toBe(0);
  expect(run.state.teams[sideOther(side)].characters.map(stats)).toEqual(foes);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const mode of [undefined,'pvp'] as const)it(`ordinary trait defender grants opening team armor exactly once only to living PvP defenders on side ${side} mode ${mode??'standard'}`,()=>{
  const run=battle(row,{side,mode,dead:['dead'],allies:[dummy('chosen'),dummy('dead'),dummy('untouched')]});
  const own=run.state.teams[side].characters,bonus=mode==='pvp'&&side===PlayerSide.Right?3:0;
  own.forEach((c,i)=>expect(c.armor).toBe(run.openingInputs[side][i]!.stats.armor+(c.defeated?0:bonus)));
  expect(run.state.teams[sideOther(side)].characters.map(stats)).toEqual(openingExpected(run,sideOther(side)));
  const before=own.map(stats);expect(run.engine.takeInitialEvents()).toEqual([]);expect(own.map(stats)).toEqual(before);
 });
});

for(const row of fixture.enemies.filter(r=>r.enemyId===6315))describe(familyName(row),()=>{
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const outcome of ['success','failure'] as const)for(const difficulty of [1,1.5])it(`ordinary trait naturepact summons the real scaled Dryad on owner death with ${outcome} roll on side ${side} difficulty ${difficulty}`,()=>{
  expect(troops.find(t=>t.id===6025)).toEqual(fixture.deathSummon.troop);
  const run=battle(row,{side,difficulty,seed:fixture.deathSummon.chanceRollSeeds[outcome],probe:probe({kind:'damage',target:'enemyChosen',scaling:{base:1000,mult:0},trueDamage:true})});
  const others=run.state.teams[side].characters.filter(c=>c.id!==run.caster.id).map(stats);
  const events=cast(run,run.caster,run.byName('foe'));
  expect(events.some(e=>e.type==='defeat'&&e.characterId===run.caster.id)).toBe(true);
  const summons=events.filter(e=>e.type==='summon');expect(summons).toHaveLength(outcome==='success'?1:0);
  expect(run.state.teams[side].characters.some(c=>c.id===run.caster.id)).toBe(false);
  expect(run.state.teams[sideOther(side)].characters.some(c=>c.mechanicalIdentity==='unit:6025')).toBe(false);
  expect(run.state.teams[side].characters.filter(c=>c.mechanicalIdentity!=='unit:6025').map(stats)).toEqual(others);
  if(outcome==='success'){
   const summoned=run.state.teams[side].characters.find(c=>c.mechanicalIdentity==='unit:6025')!;
   const expected=(fixture.deathSummon.stats as Record<string,{hp:number;armor:number;attack:number;magic:number}>)[`20@${difficulty}`]!;
   expect(summoned).toMatchObject({...expected,maxHp:expected.hp,role:'Generator',mana:0,manaCost:10,skillId:'st:7025',traitIds:['st:feybond','st:revered','st:naturelink'],troopTypes:[a('Fey'),a('Elemental')],colors:[BaseColor.Blue,BaseColor.Yellow],battleScaling:{level:20,difficulty}});
   expect(summons[0]).toMatchObject({player:side,troopId:6025,characterId:summoned.id,destination:'field'});
   expect(events.findIndex(e=>e.type==='defeat')).toBeLessThan(events.findIndex(e=>e.type==='summon'));
   expect(run.session.recordedEvents()).toEqual(expect.arrayContaining(summons));
  }
 });
 it.each([PlayerSide.Left,PlayerSide.Right])('ordinary trait naturepact ignores deaths of other allies and enemies on side %s',(side)=>{
  const run=battle(row,{side,seed:fixture.deathSummon.chanceRollSeeds.success,probe:probe({kind:'damage',target:'enemyChosen',scaling:{base:1000,mult:0},trueDamage:true})});
  const rng=run.rng.getState();
  const alliedDeath=cast(run,run.byName('chosen'),run.byName('foe'));
  expect(alliedDeath.some(e=>e.type==='defeat')).toBe(true);expect(alliedDeath.some(e=>e.type==='summon')).toBe(false);
  const enemyDeath=cast(run,run.byName('foe'),run.byName('untouched'));
  expect(enemyDeath.some(e=>e.type==='defeat')).toBe(true);expect(enemyDeath.some(e=>e.type==='summon')).toBe(false);
  expect(run.rng.getState()).toBe(rng);expect(run.caster.defeated).toBe(false);
 });
});

for(const row of fixture.enemies.filter(r=>r.enemyId===6091))describe(familyName(row),()=>{
 it.each([PlayerSide.Left,PlayerSide.Right])('ordinary trait aflame burns only the actual skull victim and never triggers from its support spell on side %s',(side)=>{
  const run=battle(row,{side,match:skullGem(),opponents:[dummy('foe',{stats:{hp:1000,armor:100,attack:10,magic:4}}),dummy('foe-other')]});go(run);
  const events=swap(run);
  expect(events.filter(e=>e.type==='status-apply'&&e.statusId==='burning').map(e=>e.type==='status-apply'?e.targetId:0)).toEqual([run.byName('foe').id]);
  expect(run.byName('foe').statuses.some(s=>s.id==='burning')).toBe(true);
  expect(run.byName('foe-other').statuses).toEqual([]);
  const spell=cast(run);expect(spell.some(e=>e.type==='status-apply'&&e.statusId==='burning')).toBe(false);
 });
});

// 6486 introduces allySelf + skillOnce into this family. Eligibility is owned by
// the individual, not by the shared spell ID, team, registry or restored recipe.
for(const row of fixture.enemies.filter(r=>r.enemyId===6486))describe(familyName(row),()=>{
 const numerics=fixture.sandScuttlerNumerics;
 it('freezes imported growth and independent literal gains from native skillOnce/IncreaseHealth rules',()=>{
  expect(progression['6486']).toEqual(numerics.sourceProgression);
  for(const [key,expected] of Object.entries(row.stats)){
   const [level,difficulty]=key.split('@').map(Number);
   const calculated:Record<string,number>={};
   for(const stat of ['health','armor','attack','magic'] as const){
    const gain=numerics.sourceProgression.growth[stat].slice(0,Math.min(level!,20)).reduce((sum,n)=>sum+n,0);
    const extension=numerics.extendedGrowth[stat];
    const value=row.sourceTroop.base[stat]+gain+Math.floor(Math.max(0,level!-20)*extension.points/extension.everyLevels);
    calculated[stat==='health'?'hp':stat]=Math.round(value*difficulty!);
   }
   expect(calculated).toEqual(expected);
   expect(calculated.magic!+20).toBe((numerics.castGain as Record<string,number>)[key]);
  }
  const run=battle(row);
  expect(run.bp.snapshot).toMatchObject({mechanicalIdentity:'unit:6486',troopTypes:[a('Monster')],battleScaling:{level:20,difficulty:1}});
  expect(run.caster.mechanicalIdentity).toBe('unit:6486');
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right]){
  for(const [level,difficulty] of [[1,1],[20,1],[20,1.5],[40,1]])for(const wounded of [false,true])it(`gains literal Magic+20 current/max Life and Armor only on self at ${level}@${difficulty} wounded=${wounded} side ${side}`,()=>{
   const run=battle(row,{side,level,difficulty});go(run);
   if(wounded)run.caster.hp--;
   const before=stats(run.caster),others=run.state.teams[side].characters.slice(1).map(stats);
   const foes=run.state.teams[sideOther(side)].characters.map(stats),beforeGrid=structuredClone(grid(run)),rng=run.rng.getState();
   const gain=(numerics.castGain as Record<string,number>)[`${level}@${difficulty}`]!;
   let calls=0;run.engine.setTargetChooser({choose(){calls++;return null;}});
   run.caster.mana=16;
   const events=run.session.resolve({type:'cast',characterId:run.caster.id});
   expect(calls).toBe(0);
   expect(events.filter(e=>e.type==='skill-cast')).toEqual([{type:'skill-cast',characterId:run.caster.id,skillId:'st:7673'}]);
   expect(effectBuffs(events)).toEqual([{targetId:run.caster.id,stat:'hp',amount:gain,maxHpGain:gain},{targetId:run.caster.id,stat:'armor',amount:gain}]);
   expect(stats(run.caster)).toEqual({...before,hp:before.hp+gain,maxHp:before.maxHp+gain,armor:before.armor+gain,mana:0});
   expect(run.caster.maxHp-run.caster.hp).toBe(wounded?1:0);
   expect(run.state.teams[side].characters.slice(1).map(stats)).toEqual(others);
   expect(run.state.teams[sideOther(side)].characters.map(stats)).toEqual(foes);
   expect(grid(run)).toEqual(beforeGrid);expect(run.rng.getState()).toBe(rng);
   expect(run.state.activePlayer).toBe(sideOther(side));
   expect(run.state.actionLog).toHaveLength(1);
   expect(run.session.recordedEvents()).toEqual(expect.arrayContaining(events));
  });
  it(`MonsterShield grants exactly two Armor once to living allied Monsters including self on side ${side}`,()=>{
   const run=battle(row,{side,dead:['dead'],allies:[dummy('matching',{troopTypes:[a('Monster'),a('Human')]}),dummy('dead',{troopTypes:[a('Monster')]}),dummy('different',{troopTypes:[a('Human')]})],opponents:[dummy('foe',{troopTypes:[a('Monster')]}),dummy('foe-other')]});
   expect(run.caster.armor).toBe(14);expect(run.byName('matching').armor).toBe(9);
   expect(run.byName('different').armor).toBe(7);expect(run.byName('dead').armor).toBe(7);
   expect(run.byName('foe').armor).toBe(7);expect(run.byName('foe-other').armor).toBe(7);
   const before=run.state.teams[side].characters.map(stats);
   expect(run.engine.takeInitialEvents()).toEqual([]);
   go(run);run.session.passTurn();run.session.passTurn();
   expect(run.state.teams[side].characters.map(stats)).toEqual(before);
  });
  it(`Regeneration heals one missing Life only on owner turn and keeps the maximum on side ${side}`,()=>{
   const run=battle(row,{side});go(run);run.caster.hp-=3;
   const maxHp=run.caster.maxHp,before=run.caster.hp;
   run.session.passTurn();expect(run.caster.hp).toBe(before);
   const events=run.session.passTurn();expect(run.caster.hp).toBe(before+1);expect(run.caster.maxHp).toBe(maxHp);
   expect(events).toContainEqual(expect.objectContaining({type:'buff',targetId:run.caster.id,stat:'hp',amount:1,source:'trait'}));
   run.caster.hp=maxHp;run.session.passTurn();
   const capped=run.session.passTurn();expect(run.caster.hp).toBe(maxHp);expect(run.caster.maxHp).toBe(maxHp);
   expect(capped.some(e=>e.type==='buff'&&e.targetId===run.caster.id&&e.stat==='hp')).toBe(false);
  });
  for(const [attack,damage] of [[1,1],[2,2],[10,8],[11,8],[12,9]])it(`Armored rounds incoming ${attack} skull damage to literal ${damage}, without reducing spells on side ${side}`,()=>{
   const run=battle(row,{side,match:skullGem(),probe:probe({kind:'damage',target:'enemyChosen',scaling:{base:12,mult:0}}),opponents:[dummy('foe',{stats:{hp:100,armor:7,attack:attack!,magic:0}})]});
   go(run,sideOther(side));const before=stats(run.caster),events=swap(run);
   expect(events.filter(e=>e.type==='skull-damage').map(e=>e.type==='skull-damage'?e.damage:0)).toEqual([damage]);
   expect(run.caster.hp).toBe(before.hp);expect(run.caster.armor).toBe(before.armor-damage!);
   const spell=cast(run,run.caster,run.byName('foe'));
   expect(spell.filter(e=>e.type==='skill-damage').map(e=>e.type==='skill-damage'?e.damage:0)).toEqual([12]);
  });
  for(const kind of ['underfilled','wrong-side','silenced'])it(`a rejected ${kind} attempt leaves the individual's one successful cast available on side ${side}`,()=>{
   const run=battle(row,{side});go(run);run.caster.mana=kind==='underfilled'?15:16;
   if(kind==='wrong-side')go(run,sideOther(side));
   if(kind==='silenced')run.caster.statuses=[{id:'silence',turns:3}];
   const before=snapshot(run),state=JSON.stringify(run.state);
   expect(run.session.resolve({type:'cast',characterId:run.caster.id})).toEqual([]);
   expect(snapshot(run)).toEqual(before);expect(JSON.stringify(run.state)).toBe(state);
   run.caster.statuses=[];
   expect(cast(run).filter(e=>e.type==='skill-cast')).toHaveLength(1);
   go(run);run.caster.mana=16;
   const used=snapshot(run),usedState=JSON.stringify(run.state);
   expect(run.session.resolve({type:'cast',characterId:run.caster.id})).toEqual([]);
   expect(snapshot(run)).toEqual(used);expect(JSON.stringify(run.state)).toBe(usedState);
  });
  it(`each duplicate on both teams casts once independently, excludes spent units from AI, and reproduces after JSON reopen on side ${side}`,()=>{
   const setup=(restore:boolean)=>{
    const compiled=blueprint(row),bp=restore?restoreEnemyBlueprint(JSON.parse(JSON.stringify(compiled))):compiled;
    const member=(externalId:string)=>({...structuredClone(bp.snapshot),externalId});
    const run=battle(row,{side,restore,allies:[member('duplicate')],opponents:[member('foe'),member('foe-other')]});
    // A real skull swap without big matches keeps AI's source cast priority observable
    // and prevents unrelated dead-board reshuffles from spending RNG on a self buff.
    const filler=[BaseColor.Blue,BaseColor.Green,BaseColor.Purple,BaseColor.Brown];
    for(let r=0;r<8;r++)for(let c=0;c<8;c++)run.state.board.set({row:r,col:c},{id:r*8+c,type:colorGem(filler[(r+2*c)%4]!)});
    for(const cell of [{row:0,col:0},{row:0,col:1},{row:1,col:2}])run.state.board.set(cell,{id:cell.row*8+cell.col,type:skullGem()});
    return run;
   };
   const play=(restore:boolean)=>{
    const run=setup(restore),duplicate=run.byName('duplicate'),foe=run.byName('foe'),foeOther=run.byName('foe-other');
    const ready=(owner:PlayerSide)=>{go(run,owner);for(const c of run.state.teams[owner].characters)c.mana=16;};
    const eligible=(owner:PlayerSide)=>firstCastableCharacter(run.state,owner,run.setup.registry)?.id??null;
    for(const owner of [side,sideOther(side)]){
     expect(run.state.teams[owner].characters.map(stats)).toEqual([0,1].map(()=>({hp:14,maxHp:14,armor:16,attack:14,magic:22,mana:0})));
     expect(run.state.teams[owner].characters.map(c=>c.skillId)).toEqual(['st:7673','st:7673']);
    }
    expect(evaluateSwaps(run.state,side).length).toBeGreaterThan(0);
    expect(evaluateSwaps(run.state,side).every(s=>s.bigTier===0)).toBe(true);
    for(const [index,caster] of [run.caster,duplicate,foe,foeOther].entries()){
     const owner=index<2?side:sideOther(side);ready(owner);
     expect(eligible(owner)).toBe(caster.id);
     expect(chooseAiAction({state:run.state,side:owner,rng:run.rng,registry:run.setup.registry})).toEqual({reason:'cast',action:{type:'cast',characterId:caster.id}});
     const before=stats(caster),others=Object.values(run.state.teams).flatMap(t=>t.characters).filter(c=>c!==caster).map(stats);
     const beforeGrid=structuredClone(grid(run)),rng=run.rng.getState();
     const events=run.session.resolve({type:'cast',characterId:caster.id});
     expect(events.filter(e=>e.type==='skill-cast')).toEqual([{type:'skill-cast',characterId:caster.id,skillId:'st:7673'}]);
     expect(effectBuffs(events)).toEqual([{targetId:caster.id,stat:'hp',amount:42,maxHpGain:42},{targetId:caster.id,stat:'armor',amount:42}]);
     expect(stats(caster)).toEqual({...before,hp:before.hp+42,maxHp:before.maxHp+42,armor:before.armor+42,mana:0});
     expect(Object.values(run.state.teams).flatMap(t=>t.characters).filter(c=>c!==caster).map(stats)).toEqual(others);
     expect(grid(run)).toEqual(beforeGrid);expect(run.rng.getState()).toBe(rng);
     ready(owner);
     const beforeRetry=snapshot(run),state=JSON.stringify(run.state);
     expect(run.session.resolve({type:'cast',characterId:caster.id})).toEqual([]);
     expect(snapshot(run)).toEqual(beforeRetry);expect(JSON.stringify(run.state)).toBe(state);
     expect(eligible(owner)).toBe(index%2===0?(index===0?duplicate.id:foeOther.id):null);
     if(index%2===1){
      const decision=chooseAiAction({state:run.state,side:owner,rng:run.rng,registry:run.setup.registry});
      expect(decision).not.toBeNull();
      if(!decision)throw new Error('Expected a real skull swap after all individual casts were spent');
      expect(decision.action.type).toBe('swap');expect(decision.reason).toBe('skull');
     }
    }
    for(const owner of [side,sideOther(side)]){
     ready(owner);const before=snapshot(run),state=JSON.stringify(run.state);
     for(const c of run.state.teams[owner].characters)expect(run.session.resolve({type:'cast',characterId:c.id})).toEqual([]);
     expect(snapshot(run)).toEqual(before);expect(JSON.stringify(run.state)).toBe(state);
     expect(eligible(owner)).toBeNull();
    }
    expect(run.state.actionLog.filter(e=>e.action.type==='cast').map(e=>({side:e.side,action:e.action,skillId:e.skillId})))
     .toEqual([run.caster,duplicate,foe,foeOther].map((c,i)=>({side:i<2?side:sideOther(side),action:{type:'cast',characterId:c.id},skillId:'st:7673'})));
    expect(run.session.recordedEvents().filter(e=>e.type==='skill-cast')).toHaveLength(4);
    run.session.surrender();
    return {teams:run.state.teams,board:grid(run),events:run.session.recordedEvents(),actions:run.state.actionLog,rng:run.rng.getState(),result:run.session.buildResult()};
   };
   expect(play(true)).toEqual(play(false));
   const fresh=setup(false);go(fresh);fresh.caster.mana=16;
   expect(fresh.session.resolve({type:'cast',characterId:fresh.caster.id}).filter(e=>e.type==='skill-cast')).toHaveLength(1);
  });
 }
});
