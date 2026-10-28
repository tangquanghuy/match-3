import {describe,expect,it} from 'vitest';
// @ts-expect-error Node-only acceptance fixture; the app has no Node type dependency.
import {existsSync,readFileSync} from 'node:fs';
import expectations from '../fixtures/stEnemyDirectDamageExpectations.json';
import {BoardModel} from '../../src/engine/BoardModel';
import {createGameState} from '../../src/engine/GameState';
import {TurnEngine} from '../../src/engine/TurnEngine';
import {SeededRNG} from '../../src/engine/rng';
import {BaseColor,PlayerSide,colorGem,skullGem} from '../../src/engine/types';
import type {GameEvent} from '../../src/engine/events';
import type {SkillPrototype} from '../../src/engine/skills/prototypes';
import {skill,dmg,trueDmg,inflict,drainMana,steal} from '../../src/engine/skills/builders';
import {FixedTargetChooser} from '../../src/engine/skills/targetChooser';
import {BATTLE_SCHEMA_VERSION,RULESET_VERSION} from '../../src/session/contract';
import type {BattleRequest,CombatantSnapshot} from '../../src/session/contract';
import {mapRequestToTeams} from '../../src/session/combatantMapping';
import {BattleSession} from '../../src/session/BattleSession';
import {prepareStBattle} from '../../src/sillytavern/battleRuntime';
import {compileEnemyBlueprint,restoreEnemyBlueprint,adaptedTraitDescription} from '../../src/sillytavern/enemyBlueprint';
import {getTroopById} from '../../src/data/troops';
import {PORTRAITS,savePortrait} from '../../src/sillytavern/portraits';

type Stats={hp:number;armor:number;attack:number;magic:number};
type Enemy={id:number;name:string;rarity:string;rarityIdx:number;role:string;portrait:{assetId:string;rank:string;form:string};spellId:number;colors:string[];cost:number;stats:Stats;scales:{level:number;difficulty:number;stats:Stats}[];context:{affinities:string[];region:string;regionId:number};traits:{code:string;source:Record<string,unknown>;description:string}[];kind:string;range:string;opening:{hp:number;magic:number;mana:number};damage?:number;bonusDamage?:number;damageMin?:number;damageMax?:number;spirit?:string;bond?:string;slayer?:string;skullFactor?:number;spellFactor?:number;immunities?:string[];drainImmune?:boolean;dodge?:boolean;pierce?:boolean;absorb?:boolean;turnAura?:boolean;link?:string;regen?:boolean;phrases:string[]};
const enemies=expectations.enemies as unknown as Enemy[];
type Recipe=Pick<Enemy,'id'|'colors'|'portrait'|'role'>;
type RawTroop={id:number;ReferenceName:string;RarityIdx:number;Attack:number;Armor:number;Health:number;Magic:number;data?:string;RawData?:string;stats:{spell:{desc:string};traits:{code:string;description:string}[]}};
const rawTroops=(JSON.parse(readFileSync('data/raw/troops.gow.en.json','utf8')) as {troops:RawTroop[]}).troops;
const rawSpells=(JSON.parse(readFileSync('data/raw/spells.gow.en.json','utf8')) as {spells:{Id:number;data?:string;RawData?:string}[]}).spells;
const rawTraits=(JSON.parse(readFileSync('data/raw/gow-2026-09-18/traits.en.json','utf8')) as {traits:{RawData:string}[]}).traits.map(t=>JSON.parse(t.RawData) as {Code:string});
// These literals were transcribed from raw source files, independently of ST compilation.
const sourceExpectations=expectations.enemies;
// Independent source aliases are fixed here, not read from the compiled subject.
const affinity:Record<string,string>={Beast:'affinity:1',Daemon:'affinity:6',Dragon:'affinity:9',Naga:'affinity:24',Undead:'affinity:31'};
const colors=Object.values(BaseColor);
const other=(side:PlayerSide)=>side===PlayerSide.Left?PlayerSide.Right:PlayerSide.Left;
function blueprint(e:Recipe,level=20,difficulty=1) {
 const p=PORTRAITS.find(p=>p.troopId===e.id)!;
 return compileEnemyBlueprint({portrait:savePortrait({manaColors:e.colors,rank:e.portrait.rank,form:e.portrait.form,role:e.role},p),externalId:'subject',level,difficulty});
}
function dummy(externalId:string,overrides:Partial<CombatantSnapshot>={}):CombatantSnapshot {
 return {externalId,name:externalId,stats:{hp:1000,armor:7,attack:8,magic:0},manaColors:[BaseColor.Blue],manaCost:12,skillId:'gw_KnightsSword',...overrides};
}
function board(match:BaseColor|'skull'=BaseColor.Red) {
 const b=new BoardModel(),palette=[BaseColor.Blue,BaseColor.Green,BaseColor.Red,BaseColor.Yellow,BaseColor.Purple,BaseColor.Brown];
 for(let row=0;row<8;row++)for(let col=0;col<8;col++)b.set({row,col},{id:row*8+col,type:colorGem(palette[(row*3+col*5)%6]!)});
 // Keep the fixture at exactly three: the background's fourth top cell is Yellow.
 if(match===BaseColor.Yellow)b.set({row:0,col:3},{id:3,type:colorGem(BaseColor.Blue)});
 const matchGem=match==='skull'?skullGem():colorGem(match);
 const different=match===BaseColor.Blue?BaseColor.Green:BaseColor.Blue;
 for(const [row,col,type] of [[0,0,matchGem],[0,1,colorGem(different)],[0,2,matchGem],[1,1,matchGem]] as const)b.set({row,col},{id:row*8+col,type});
 return b;
}
type Options={side?:PlayerSide;level?:number;difficulty?:number;allies?:CombatantSnapshot[];opponents?:CombatantSnapshot[];dead?:string[];match?:BaseColor|'skull';seed?:number;restore?:boolean;probe?:SkillPrototype};
function battle(e:Recipe,options:Options={}) {
 const compiled=blueprint(e,options.level,options.difficulty);
 const bp=options.restore?restoreEnemyBlueprint(JSON.parse(JSON.stringify(compiled))):compiled;
 const side=options.side??PlayerSide.Right;
 const foes=options.opponents??[dummy('foe-0'),dummy('foe-1',{stats:{hp:1200,armor:7,attack:8,magic:0}}),dummy('foe-2',{stats:{hp:1100,armor:7,attack:8,magic:0}})];
 const subjects=[bp.snapshot,...options.allies??[]];
 const request:BattleRequest={schemaVersion:BATTLE_SCHEMA_VERSION,rulesetVersion:RULESET_VERSION,battleId:`direct-${e.id}`,requestId:`direct-${e.id}-request`,seed:options.seed??6004,playerTeam:side===PlayerSide.Left?subjects:foes,enemyTeam:side===PlayerSide.Right?subjects:foes};
 const setup=prepareStBattle(request);
 // Stimulus spells only: the real subject retains its compiled skill and all ordinary traits.
 // This local registry entry makes immunity/damage controls traverse the full action pipeline.
 if(options.probe)setup.registry.prototypes.set('gw_KnightsSword',options.probe);
 const teams=mapRequestToTeams(request),state=createGameState(board(options.match),teams.playerTeam,teams.enemyTeam);
 for(const id of options.dead??[]) {const internal=teams.idMap.internalIdOf(id)!;const c=[...teams.playerTeam.characters,...teams.enemyTeam.characters].find(c=>c.id===internal)!;c.hp=0;c.defeated=true;}
 const beforeOpening=structuredClone(state.teams),rng=new SeededRNG(request.seed);let next=1000;
 const engine=new TurnEngine(state,rng,()=>next++,setup.registry,setup.configureEngine);
 const session=new BattleSession({request,engine,idMap:teams.idMap});
 return {bp,request,state,rng,engine,session,beforeOpening,side,caster:state.teams[side].characters[0]!,foes:state.teams[other(side)].characters};
}
type Run=ReturnType<typeof battle>;
function turn(run:Run,side=run.side) {if(run.state.activePlayer!==side)run.session.passTurn();expect(run.state.activePlayer).toBe(side);}
function snapshot(run:Run) {return structuredClone({state:run.state,rng:run.rng.getState(),events:run.session.recordedEvents()});}
function boardSnapshot(run:Run) {return Array.from({length:8},(_,row)=>Array.from({length:8},(_,col)=>run.state.board.get({row,col})));}
function cast(run:Run,target=1) {turn(run);run.caster.mana=run.caster.manaCost;run.engine.setTargetChooser(new FixedTargetChooser(run.foes[target]!.id));return run.session.resolve({type:'cast',characterId:run.caster.id});}
function damageEvents(events:GameEvent[]) {return events.filter(e=>e.type==='skill-damage');}
function assertActive(e:Enemy,run:Run,events:GameEvent[],bonus=false) {
 const damages=damageEvents(events),ids=run.foes.map(c=>c.id),d=e.damage!;
 expect(events.filter(x=>x.type==='skill-cast').map(x=>[x.characterId,x.skillId])).toEqual([[run.caster.id,`st:${e.spellId}`]]);
 let expected:[number,number,string][];
 switch(e.kind) {
  case 'splash': expected=[[ids[1]!,d,'splash'],[ids[0]!,Math.floor(d*.5),'splash'],[ids[2]!,Math.floor(d*.5),'splash']];break;
  case 'all':expected=ids.map(id=>[id,d,'all']);break;
  case 'weakest':expected=[ids[0]!,ids[2]!].map(id=>[id,bonus?e.bonusDamage!:d,'all']);break;
  case 'dragon':expected=[[ids[1]!,d,'single'],...(bonus?ids.map(id=>[id,6,'all'] as [number,number,string]):[])];break;
  case 'scatter':
   expect(damages.every(x=>ids.includes(x.targetId)&&x.range==='scatter')).toBe(true);
   expect(damages.reduce((sum,x)=>sum+x.damage,0)).toBe(4);return;
  case 'waves': {
   // Right enters its first allied turn before casting; Left starts without a turn-start tick.
   const [min,max]=run.side===PlayerSide.Left?[7,15]:[8,16];
   expect(damages).toHaveLength(6);
   expect(damages.every(x=>ids.includes(x.targetId)&&x.damage>=min&&x.damage<=max&&Number.isInteger(x.damage))).toBe(true);
   expect(damages.map(x=>x.range)).toEqual(['all','all','all','all','all','all']);return;
  }
  default:expected=[[ids[1]!,bonus?e.bonusDamage!:d,'single']];
 }
 expect(damages.map(x=>[x.targetId,x.damage,x.range])).toEqual(expected);
}

for(const e of enemies) describe(`ST direct damage ${e.id} ${e.name}: source behavior`,()=>{
 it('matches literal raw spell, original rarity, base stats and all three source trait clauses',()=>{
  const literal=sourceExpectations.find(t=>t.id===e.id)!,raw=rawTroops.find(t=>t.id===e.id)!;
  const troop=JSON.parse(raw.data??raw.RawData!);
  const spell=rawSpells.find(t=>t.Id===e.spellId)!;
  expect(raw.ReferenceName).toBe(e.name);expect(raw.RarityIdx).toBe(e.rarityIdx);expect(troop.TroopRarity).toBe(e.rarity);
  expect({hp:raw.Health,armor:raw.Armor,attack:raw.Attack,magic:raw.Magic}).toEqual(e.stats);
  expect({hp:troop.Health_Base,armor:troop.Armor_Base??0,attack:troop.Attack_Base,magic:troop.SpellPower_Base}).toEqual(e.scales[0]!.stats);
  expect(troop.Traits).toEqual(e.traits.map(t=>t.code));expect(raw.stats.spell.desc).toBe(literal.englishClause);
  expect(raw.stats.traits.map(t=>({code:t.code,description:t.description}))).toEqual(literal.englishTraits);
  expect(JSON.parse(spell.data??spell.RawData!)).toEqual(literal.nativeSpell);
  expect(e.traits.map(t=>rawTraits.find(raw=>raw.Code===t.code))).toEqual(literal.nativeTraits);
 });
 it('binds the source portrait, context, role, active description and all ordinary trait descriptions',()=>{
  const run=battle(e),bp=run.bp;
  expect(bp.portrait).toMatchObject({troopId:e.id,assetId:e.portrait.assetId,query:{manaColors:e.colors,rank:e.portrait.rank,form:e.portrait.form,role:e.role}});
  expect(bp.snapshot.portraitUrl).toContain(`static/portraits/${e.portrait.assetId}.webp`);
  expect(existsSync(`game-assets/public/static/portraits/${e.portrait.assetId}.webp`)).toBe(true);
  expect(bp.snapshot).toMatchObject({role:e.role,mechanicalIdentity:`unit:${e.id}`,skillId:`st:${e.spellId}`,manaColors:e.colors,manaCost:e.cost,rarityIdx:e.rarityIdx,stats:e.stats,traitIds:e.traits.map(t=>`st:${t.code}`),troopTypes:e.context.affinities,kingdom:e.context.region,kingdomId:e.context.regionId});
  expect(bp.context).toEqual(e.context);
  expect(bp.descriptionAudit).toEqual({support:'full',diagnostics:[]});
  expect(bp.traitDescriptionAudit).toEqual(e.traits.map(t=>({code:`st:${t.code}`,support:'full',diagnostics:[]})));
  expect(bp.omittedMechanisms).toEqual([]);
  for(const phrase of e.phrases)expect(bp.snapshot.spellDescription).toContain(phrase);
  for(const t of e.traits) {const desc=adaptedTraitDescription(t.code)!;expect(desc.support).toBe('full');expect(desc.description).toBe(t.description);expect(desc.diagnostics).toEqual([]);}
  expect(run.caster).toMatchObject({role:e.role,troopTypes:e.context.affinities,kingdom:e.context.region,kingdomId:e.context.regionId,colors:e.colors,manaCost:e.cost});
 });
 for(const s of e.scales)it(`scales source stats at level ${s.level} difficulty ${s.difficulty} and executes the scaled active`,()=>{
  const run=battle(e,{level:s.level,difficulty:s.difficulty});
  expect(run.bp.snapshot.stats).toEqual(s.stats);
  const bond=e.bond?2:0,spirit=e.spirit?1:0;
  expect(run.caster).toMatchObject({hp:s.stats.hp+bond,maxHp:s.stats.hp+bond,armor:s.stats.armor,attack:s.stats.attack,magic:s.stats.magic+spirit,mana:e.opening.mana});
  const events=cast(run),hits=damageEvents(events);
  // Arithmetic uses only literal source anchors, never a compiler/prototype/actual caster value.
  const magic=s.stats.magic+spirit+(e.turnAura?1:0);
  const sourceDamage:Record<number,number>={6001:magic+2,6030:magic+3,6057:magic+1,6085:magic+2,6117:magic+7,6257:magic+4,6306:magic+2,7164:Math.round(magic*.5+4),7386:Math.round(magic*.5+2)};
  if(e.kind==='scatter')expect(hits.reduce((n,h)=>n+h.damage,0)).toBe(sourceDamage[e.id]);
  else if(e.kind==='waves') {expect(hits).toHaveLength(6);expect(hits.every(h=>h.damage>=Math.round(magic*.625+1)&&h.damage<=Math.round(magic*1.25+2))).toBe(true);}
  else expect(hits[0]!.damage).toBe(sourceDamage[e.id]);
  expect(run.caster.mana).toBe(0);
 });
 it.each([PlayerSide.Left,PlayerSide.Right])('applies opening traits only to living allied source affinities and colors on side %s',(side)=>{
  const type=e.bond?affinity[e.bond]!:e.context.affinities[0]!,color=(e.spirit??e.colors[0]) as BaseColor;
  const run=battle(e,{side,allies:[dummy('matching',{troopTypes:[type],manaColors:[color,BaseColor.Purple]}),dummy('wrong',{troopTypes:['affinity:33'],manaColors:[BaseColor.Red===color?BaseColor.Green:BaseColor.Red]}),dummy('dead',{troopTypes:[type],manaColors:[color]})],dead:['dead'],opponents:[dummy('opposing',{troopTypes:[type],manaColors:[color]})]});
  const [subject,matching,wrong,dead]=run.state.teams[side].characters;
  // Constructor opening effects are distinct from subsequent allied turn-start effects.
  expect(subject!.mana).toBe(e.opening.mana);
  expect(subject!.hp).toBe(e.opening.hp);
  expect(subject!.magic).toBe(e.opening.magic+(e.spirit?1:0));
  expect(matching).toMatchObject({hp:1000+(e.bond?2:0),maxHp:1000+(e.bond?2:0),mana:0});
  expect(wrong).toMatchObject(run.beforeOpening[side].characters[2]);
  expect(matching).toMatchObject({...run.beforeOpening[side].characters[1],hp:1000+(e.bond?2:0),maxHp:1000+(e.bond?2:0)});
  expect(dead).toMatchObject(run.beforeOpening[side].characters[3]);
  expect(dead).toMatchObject({hp:0,maxHp:1000,magic:0,mana:0,defeated:true});
  expect(run.foes[0]).toMatchObject({hp:1000,maxHp:1000,magic:0,mana:0});
 });
 it.each([PlayerSide.Left,PlayerSide.Right])('executes complete damage, target and role behavior on side %s',(side)=>{
  const run=battle(e,{side,allies:[dummy('friendly-control',{manaColors:[BaseColor.Purple]})]});
  const initialBoard=boardSnapshot(run),friendly=run.state.teams[side].characters[1]!,friendlyBefore=structuredClone(friendly);
  const events=cast(run);assertActive(e,run,events);
  const hits=damageEvents(events);
  for(const [index,foe]of run.foes.entries()) {
   const raw=hits.filter(h=>h.targetId===foe.id).reduce((n,h)=>n+h.damage,0),initialHp=[1000,1200,1100][index]!;
   expect([foe.hp,foe.armor]).toEqual(e.kind==='true'?[initialHp-raw,7]:[initialHp-Math.max(0,raw-7),Math.max(0,7-raw)]);
  }
  expect(friendly).toEqual(friendlyBefore);
  expect(run.caster.mana).toBe(0);expect(run.state.activePlayer).toBe(other(side));
  expect(boardSnapshot(run)).toEqual(initialBoard);
  expect(run.state.economy.gold).toBe(0);expect(run.state.enemyGold).toBe(0);
 });
 for(const color of colors)it.each([PlayerSide.Left,PlayerSide.Right])(`routes a real ${color} three-match through source mana colors and links on side %s`,(side)=>{
  const run=battle(e,{match:color,side});turn(run);run.caster.mana=0;
  const events=run.session.resolve({type:'swap',from:{row:0,col:1},to:{row:1,col:1}});
  expect(events.some(x=>x.type==='elimination')).toBe(true);
  const gains=events.filter((x):x is Extract<GameEvent,{type:'mana-gain'}>=>x.type==='mana-gain'&&x.characterId===run.caster.id);
  const amount=e.colors.includes(color)?3+(e.link===color?1:0):0;
  expect(run.caster.mana).toBe(amount);
  expect(gains.reduce((n,x)=>n+x.amount,0)).toBe(amount);
  expect(gains.every(x=>x.color===color&&x.player===side)).toBe(true);
 });
 it.each([PlayerSide.Left,PlayerSide.Right])('charges naturally to the source cost, spends it once and rejects an empty recast on side %s',(side)=>{
  const color=e.colors[0] as BaseColor,run=battle(e,{side,match:color});
  const perMatch=3+(e.link===color?1:0),needed=Math.ceil((e.cost-e.opening.mana)/perMatch);
  expect(run.caster.mana).toBe(e.opening.mana);
  for(let i=0;i<needed;i++) {
   turn(run);run.state.board=board(color);const before=run.caster.mana;
   const events=run.session.resolve({type:'swap',from:{row:0,col:1},to:{row:1,col:1}});
   expect(events.some(x=>x.type==='elimination')).toBe(true);
   expect(run.caster.mana).toBe(Math.min(e.cost,before+perMatch));
  }
  turn(run);expect(run.caster.mana).toBe(e.cost);
  run.engine.setTargetChooser(new FixedTargetChooser(run.foes[1]!.id));
  const events=run.session.resolve({type:'cast',characterId:run.caster.id});
  expect(events).toContainEqual(expect.objectContaining({type:'skill-cast',characterId:run.caster.id,skillId: `st:${e.spellId}`}));
  expect(damageEvents(events).length).toBeGreaterThan(0);expect(run.caster.mana).toBe(0);
  turn(run);const before=snapshot(run);
  expect(run.session.resolve({type:'cast',characterId:run.caster.id})).toEqual([]);expect(snapshot(run)).toEqual(before);
 });
 it('rejects insufficient mana, wrong-side, unknown and defeated casters atomically',()=>{
  const run=battle(e);turn(run);run.caster.mana=e.cost-1;
  let before=snapshot(run);expect(run.session.resolve({type:'cast',characterId:run.caster.id})).toEqual([]);expect(snapshot(run)).toEqual(before);
  run.caster.mana=e.cost;run.foes[0]!.mana=12;
  for(const id of [run.foes[0]!.id,999]) {before=snapshot(run);expect(run.session.resolve({type:'cast',characterId:id})).toEqual([]);expect(snapshot(run)).toEqual(before);}
  run.caster.defeated=true;run.caster.hp=0;before=snapshot(run);
  expect(run.session.resolve({type:'cast',characterId:run.caster.id})).toEqual([]);expect(snapshot(run)).toEqual(before);
 });
 if(['splash','true','race','dragon'].includes(e.kind))it.each([PlayerSide.Left,PlayerSide.Right])('rejects cancelled, friendly, stale and dead selected targets with RNG rollback on side %s',(side)=>{
  for(const target of ['cancel','friendly','stale','dead']) {
   const run=battle(e,{side});turn(run);run.caster.mana=e.cost;
   if(target==='dead'){run.foes[1]!.hp=0;run.foes[1]!.defeated=true;}
   let choices=0;
   run.engine.setTargetChooser({choose:(_mode,state,casterId,rng)=>{choices++;expect(state).toBe(run.state);expect(casterId).toBe(run.caster.id);rng.next();rng.nextInt(8);return target==='cancel'?null:target==='friendly'?run.caster.id:target==='stale'?999:run.foes[1]!.id;}});
   const before=snapshot(run);expect(run.session.resolve({type:'cast',characterId:run.caster.id})).toEqual([]);expect(choices).toBe(1);expect(snapshot(run)).toEqual(before);
  }
 });
 if(['healthiest','weakest','true','race','dragon'].includes(e.kind))it.each([PlayerSide.Left,PlayerSide.Right])('executes every conditional active branch and excludes opposing context from allied traits on side %s',(side)=>{
  const run=battle(e,{side});
  if(e.kind==='healthiest'||e.kind==='weakest')run.caster.hp--;
  if(e.kind==='true')run.foes[1]!.hp--;
  if(e.kind==='race')run.foes[1]!.troopTypes=[affinity.Beast!];
  if(e.kind==='dragon')run.foes[0]!.troopTypes=[affinity.Dragon!];
  const before=run.foes.map(c=>({hp:c.hp,armor:c.armor}));
  const events=cast(run);assertActive(e,run,events,true);
  for(const [i,foe] of run.foes.entries()) {
   const raw=damageEvents(events).filter(h=>h.targetId===foe.id).reduce((n,h)=>n+h.damage,0);
   expect([foe.hp,foe.armor]).toEqual(e.kind==='true'?[before[i]!.hp-raw,before[i]!.armor]:[before[i]!.hp-Math.max(0,raw-before[i]!.armor),Math.max(0,before[i]!.armor-raw)]);
  }
 });
 if(e.skullFactor)it('reduces actual incoming skull hits but preserves ordinary spell damage',()=>{
  const run=battle(e,{match:'skull'});
  const before=run.caster.hp+run.caster.armor;
  const events=run.session.resolve({type:'swap',from:{row:0,col:1},to:{row:1,col:1}});
  const hit=events.find(x=>x.type==='skull-damage'&&x.targetId===run.caster.id);
  expect(hit).toMatchObject({damage:Math.round(8*e.skullFactor!)});
  expect(run.caster.hp+run.caster.armor).toBe(before-Math.round(8*e.skullFactor!));
  const spell=battle(e,{probe:skill(dmg('enemyChosen',8,0))});spell.engine.setTargetChooser(new FixedTargetChooser(spell.caster.id));spell.foes[0]!.mana=12;
  expect(damageEvents(spell.session.resolve({type:'cast',characterId:spell.foes[0]!.id}))[0]).toMatchObject({targetId:spell.caster.id,damage:8});
 });
 if(e.slayer)it('doubles outgoing skull damage only against the source affinity',()=>{
  for(const matching of [false,true]) {
   const run=battle(e,{match:'skull',opponents:[dummy('victim',{troopTypes:[matching?affinity[e.slayer!]!: 'affinity:33']})]});turn(run);
   const events=run.session.resolve({type:'swap',from:{row:0,col:1},to:{row:1,col:1}});
   expect(events.find(x=>x.type==='skull-damage'&&x.attackerId===run.caster.id)).toMatchObject({targetId:run.foes[0]!.id,damage:e.stats.attack*(matching?2:1)});
  }
 });
 if(e.spellFactor)it('reduces both ordinary and true spell damage while true damage bypasses armor',()=>{
  for(const trueDamage of [false,true]) {
   const run=battle(e,{probe:skill(trueDamage?trueDmg('enemyChosen',8,0):dmg('enemyChosen',8,0))});run.engine.setTargetChooser(new FixedTargetChooser(run.caster.id));run.foes[0]!.mana=12;
   const hits=damageEvents(run.session.resolve({type:'cast',characterId:run.foes[0]!.id}));
   expect(hits).toHaveLength(1);expect(hits[0]).toMatchObject({targetId:run.caster.id,damage:6});expect(hits[0]!.resultingArmor).toBe(e.stats.armor-(trueDamage?0:6));
  }
 });
 for(const status of e.immunities??[])it(`blocks ${status} from a committed enemy spell while a plain allied control receives it`,()=>{
  const run=battle(e,{allies:[dummy('control')],probe:skill(inflict(status,'enemyAll'))});run.foes[0]!.mana=12;
  const events=run.session.resolve({type:'cast',characterId:run.foes[0]!.id});
  expect(events.some(x=>x.type==='skill-cast')).toBe(true);
  expect(run.caster.statuses.some(x=>x.id===status)).toBe(false);
  expect(run.state.teams.Right.characters[1]!.statuses.some(x=>x.id===status)).toBe(true);
 });
 if(e.drainImmune)it('describes the source High Ancestry immunity to mana depletion',()=>{
  expect(adaptedTraitDescription('highancestry')!.description).toMatch(/法力.*(削减|耗尽)/);
 });
 if(e.drainImmune)it('retains mana when an actual enemy spell drains all mana under High Ancestry',()=>{
  const run=battle(e,{allies:[dummy('control')],probe:skill(drainMana('enemyAll'))});run.caster.mana=5;run.state.teams.Right.characters[1]!.mana=5;run.foes[0]!.mana=12;
  const events=run.session.resolve({type:'cast',characterId:run.foes[0]!.id});expect(events.some(x=>x.type==='skill-cast')).toBe(true);
  expect(run.caster.mana).toBe(5);expect(run.state.teams.Right.characters[1]!.mana).toBe(0);
 });
 if(e.absorb)it('gains exactly three magic per committed enemy cast and none for allied or rejected casts',()=>{
  const run=battle(e,{probe:skill(dmg('enemyChosen',1,0)),allies:[dummy('friendly')]});run.engine.setTargetChooser(new FixedTargetChooser(run.caster.id));run.foes[0]!.mana=11;
  expect(run.session.resolve({type:'cast',characterId:run.foes[0]!.id})).toEqual([]);expect(run.caster.magic).toBe(7);
  run.foes[0]!.mana=12;run.session.resolve({type:'cast',characterId:run.foes[0]!.id});expect(run.caster.magic).toBe(10);
  turn(run);const friend=run.state.teams.Right.characters[1]!;friend.mana=12;run.engine.setTargetChooser(new FixedTargetChooser(run.foes[0]!.id));run.session.resolve({type:'cast',characterId:friend.id});expect(run.caster.magic).toBe(10);
 });
 if(e.turnAura)it('grows every stat of living green allies once per allied turn with no enemy, dead or off-color benefit',()=>{
  const run=battle(e,{allies:[dummy('green',{manaColors:[BaseColor.Green,BaseColor.Purple]}),dummy('blue'),dummy('dead',{manaColors:[BaseColor.Green]})],dead:['dead'],opponents:[dummy('enemy-green',{manaColors:[BaseColor.Green]})]});
  const before=structuredClone(run.state.teams);run.session.passTurn();
  const team=run.state.teams.Right.characters;
  expect(team[0]).toMatchObject({hp:28,maxHp:28,armor:15,attack:24,magic:11,mana:0});
  expect(team[1]).toMatchObject({hp:1001,maxHp:1001,armor:8,attack:9,magic:1,mana:0});
  expect(team[2]).toEqual(before.Right.characters[2]);expect(team[3]).toEqual(before.Right.characters[3]);expect(run.foes).toEqual(before.Left.characters);
  run.session.passTurn();expect(team[0]!.magic).toBe(11);run.session.passTurn();expect(team[0]).toMatchObject({hp:29,maxHp:29,armor:16,attack:25,magic:12});
 });
 if(e.regen)it('heals one HP per allied turn and clamps regeneration at maximum HP',()=>{
  const run=battle(e);run.caster.hp=run.caster.maxHp-2;
  run.session.passTurn();expect(run.caster.hp).toBe(11);run.session.passTurn();expect(run.caster.hp).toBe(11);
  run.session.passTurn();expect(run.caster.hp).toBe(12);run.session.passTurn();run.session.passTurn();expect(run.caster.hp).toBe(12);expect(run.caster.maxHp).toBe(12);
 });
 if(e.dodge||e.pierce)it('executes both seeded probability branches of its skull trait',()=>{
  const outcomes=new Set<boolean>();
  for(const seed of [1,7,42,12345]) {
   const run=battle(e,{seed,match:'skull'});
   if(e.pierce)turn(run);
   const victim=e.pierce?run.foes[0]!:run.caster,before=structuredClone(victim);
   const events=run.session.resolve({type:'swap',from:{row:0,col:1},to:{row:1,col:1}});
   if(e.dodge) {
    const dodged=events.some(x=>x.type==='attack-struggle'&&x.reason==='dodge'&&x.targetId===victim.id);outcomes.add(dodged);expect(dodged).toBe(seed===7);
    expect(victim.hp+victim.armor).toBe(before.hp+before.armor-(dodged?0:8));
   }else {
    const first=events.find(x=>x.type==='skull-damage'&&x.attackerId===run.caster.id)!;expect(first).toMatchObject({damage:11});
    const pierced=victim.armor===7;outcomes.add(pierced);expect(pierced).toBe(seed===7);expect(victim.hp).toBe(pierced?989:996);
   }
  }
  expect([...outcomes].sort()).toEqual([false,true]);
 });

 it('excludes dead target slots and resolves the remaining source target rule',()=>{
  const run=battle(e,{dead:['foe-0']});const events=cast(run,2),hits=damageEvents(events);
  expect(hits.length).toBeGreaterThan(0);expect(hits.every(h=>h.targetId!==run.foes[0]!.id&&h.targetId!==run.caster.id)).toBe(true);
  if(['true','race'].includes(e.kind))expect(hits.map(h=>h.targetId)).toEqual([run.foes[2]!.id]);
  if(e.kind==='healthiest')expect(hits.map(h=>h.targetId)).toEqual([run.foes[1]!.id]);
  if(e.kind==='weakest')expect(hits.map(h=>h.targetId)).toEqual([run.foes[2]!.id,run.foes[1]!.id]);
  if(e.kind==='all')expect(hits.map(h=>h.targetId)).toEqual([run.foes[1]!.id,run.foes[2]!.id]);
  if(e.kind==='waves'){expect(hits).toHaveLength(6);for(let i=1;i<hits.length;i++)expect(hits[i]!.targetId).not.toBe(hits[i-1]!.targetId);}
  expect(run.foes[0]).toMatchObject({hp:0,defeated:true});
 });
 if(e.kind==='splash')it('uses native normal splash on adjacent slots without reaching a fourth enemy',()=>{
  for(const chosen of [0,1,3]) {
   const run=battle(e,{opponents:[dummy('slot-0'),dummy('slot-1'),dummy('slot-2'),dummy('slot-3')]});
   const events=cast(run,chosen),hits=damageEvents(events);
   const expected=[chosen,chosen-1,chosen+1].filter(i=>i>=0&&i<4).map(i=>[run.foes[i]!.id,i===chosen?11:5]);
   expect(hits.map(h=>[h.targetId,h.damage])).toEqual(expected);
   for(let i=0;i<4;i++)expect(run.foes[i]!.armor).toBe(i===chosen?0:Math.abs(i-chosen)===1?2:7);
  }
 });
 if(e.kind==='waves')it('obeys native six-wave no-previous-target preference and its literal damage interval',()=>{
  for(const side of [PlayerSide.Left,PlayerSide.Right]) {
   const run=battle(e,{side});const hits=damageEvents(cast(run));expect(hits).toHaveLength(6);
   const [min,max]=side===PlayerSide.Left?[7,15]:[8,16];
   expect(hits.every(h=>h.damage>=min&&h.damage<=max)).toBe(true);
   for(let i=1;i<6;i++)expect(hits[i]!.targetId).not.toBe(hits[i-1]!.targetId);
  }
  const solo=battle(e,{opponents:[dummy('only-living')]});const hits=damageEvents(cast(solo,0));
  expect(hits).toHaveLength(6);expect(hits.every(h=>h.targetId===solo.foes[0]!.id)).toBe(true);
 });
 it('restores canonical JSON and replays identical real actions, board, events and final result',()=>{
  const play=(restore:boolean)=>{
   const run=battle(e,{restore});const matches=(()=>{turn(run);return run.session.resolve({type:'swap',from:{row:0,col:1},to:{row:1,col:1}});})();expect(matches.some(x=>x.type==='elimination')).toBe(true);
   const events=cast(run);expect(damageEvents(events).length).toBeGreaterThan(0);expect(run.caster.mana).toBe(0);
   run.session.surrender();const result=run.session.buildResult();expect(run.session.buildResult()).toBe(result);
   return {blueprint:run.bp,state:structuredClone(run.state),board:boardSnapshot(run),events:run.session.recordedEvents(),rng:run.rng.getState(),result};
  };
  expect(play(true)).toEqual(play(false));
  const tampered=JSON.parse(JSON.stringify(blueprint(e)));tampered.snapshot.manaCost++;
  expect(()=>restoreEnemyBlueprint(tampered)).toThrow();
 });
});
// Shared High Ancestry regression: scope is this trait and its interactions only.
// The ten enemies above retain the separate complete active/ordinary-trait obligations.
describe('ST High Ancestry: original family inventory',()=>{
 it('accounts for every raw holder, including the source-only catalog gap',()=>{
  const sourceIds=rawTroops.filter(t=>JSON.parse(t.data??t.RawData!).Traits.includes('highancestry')).map(t=>t.id).sort((a,b)=>a-b);
  expect(sourceIds).toEqual(expectations.highAncestryFamily.map(t=>t.id));expect(sourceIds).toHaveLength(24);
  expect(expectations.highAncestryFamily.filter(t=>t.availability==='runtime')).toHaveLength(23);
  expect(expectations.highAncestryFamily.filter(t=>t.availability!=='runtime').map(t=>t.id)).toEqual([7915]);
 });
});
for(const e of expectations.highAncestryFamily)describe(`ST High Ancestry ${e.id} ${e.name}: shared trait regression`,()=>{
 it('binds original rarity and the complete source trait clauses',()=>{
  const raw=rawTroops.find(t=>t.id===e.id)!;
  expect(raw.ReferenceName).toBe(e.name);expect(JSON.parse(raw.data??raw.RawData!).TroopRarity).toBe(e.rarity);
  expect(raw.stats.traits.map(t=>({code:t.code,description:t.description}))).toEqual(e.englishTraits);
  expect(e.englishTraits.map(t=>t.code)).toEqual(e.sourceTraitCodes);
 });
 if(!e.portrait) {
  it('records 7915 as missing the current ST portrait entry without claiming runtime behavior',()=>{
   expect(e.availability).toBe('missing-runtime-catalog-and-portrait');expect(e.id).toBe(7915);
   expect(PORTRAITS.find(t=>t.troopId===e.id)).toBeUndefined();expect(getTroopById(e.id)).toBeUndefined();
  });
  return;
 }
 const recipe={...e,portrait:e.portrait};
 it('assembles the real recipe and describes drain and steal without adding burn immunity',()=>{
  expect(e.availability).toBe('runtime');
  const run=battle(recipe),description=adaptedTraitDescription('highancestry')!;
  expect(run.bp.snapshot.traitIds).toContain('st:highancestry');expect(run.caster.traitIds).toContain('st:highancestry');
  expect(run.bp.portrait).toMatchObject({troopId:e.id,assetId:e.portrait!.assetId});
  expect(description.support).toBe('full');expect(description.description).toContain('\u514d\u75ab\u6cd5\u529b\u524a\u51cf\u4e0e\u7a83\u53d6');expect(description.description).not.toMatch(/\u6cd5\u529b(\u71c3\u70e7|\u707c\u70e7)/);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const operation of ['drain','steal'] as const)for(const disabler of ['none','curse','stun'] as const)
 it(`${operation} with ${disabler} on side ${side} uses a committed enemy cast and a plain allied control`,()=>{
  const effect=operation==='drain'?drainMana('enemyAll'):steal('enemyAll','mana','attack',3,0);
  const probe=disabler==='none'?skill(effect):skill(inflict(disabler,'enemyAll',{turns:4}),effect);
  const run=battle(recipe,{side,allies:[dummy('plain-control')],probe});
  turn(run,other(side));const control=run.state.teams[side].characters[1]!,attacker=run.foes[0]!;
  run.caster.mana=5;control.mana=5;attacker.mana=12;const beforeAttack=attacker.attack;
  const events=run.session.resolve({type:'cast',characterId:attacker.id});
  expect(events).toContainEqual(expect.objectContaining({type:'skill-cast',characterId:attacker.id}));
  if(disabler!=='none')expect(events).toContainEqual(expect.objectContaining({type:'status-apply',targetId:run.caster.id,statusId:disabler}));
  const remaining=operation==='drain'?0:2;
  expect(run.caster.mana).toBe(disabler==='none'?5:remaining);expect(control.mana).toBe(remaining);
  expect(attacker.attack).toBe(beforeAttack+(operation==='steal'?(disabler==='none'?3:6):0));
  expect(attacker.mana).toBe(0);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right])for(const disabler of ['none','curse','stun'] as const)
 it(`mana burn damage with ${disabler} on side ${side} preserves mana and respects only the separate burn shield`,()=>{
  const effect=dmg('enemyAll',0,0,{manaBurn:true});
  const probe=disabler==='none'?skill(effect):skill(inflict(disabler,'enemyAll',{turns:4}),effect);
  const run=battle(recipe,{side,allies:[dummy('plain-control')],probe});turn(run,other(side));
  const control=run.state.teams[side].characters[1]!,attacker=run.foes[0]!;
  run.caster.mana=5;control.mana=5;attacker.mana=12;const before=run.caster.hp+run.caster.armor;
  const events=run.session.resolve({type:'cast',characterId:attacker.id}),hits=damageEvents(events);
  expect(events.some(x=>x.type==='skill-cast')).toBe(true);
  const shielded=e.burnImmune&&disabler==='none';
  const expected=shielded?0:Math.round(5*(disabler==='stun'?1:e.spellFactor));
  expect(hits.filter(x=>x.targetId===run.caster.id).map(x=>x.damage)).toEqual(shielded?[]:[expected]);
  expect(run.caster.hp+run.caster.armor).toBe(before-expected);
  expect(hits.filter(x=>x.targetId===control.id).map(x=>x.damage)).toEqual([5]);
  expect(run.caster.mana).toBe(5);expect(control.mana).toBe(5);
 });
 it.each([PlayerSide.Left,PlayerSide.Right])('mana burn status on side %s is distinct from drain and steal immunity',(side)=>{
  const run=battle(recipe,{side,allies:[dummy('plain-control')],probe:skill(inflict('mana-burn','enemyAll',{turns:4}))});turn(run,other(side));
  const control=run.state.teams[side].characters[1]!,attacker=run.foes[0]!;attacker.mana=12;
  const events=run.session.resolve({type:'cast',characterId:attacker.id});expect(events.some(x=>x.type==='skill-cast')).toBe(true);
  expect(run.caster.statuses.some(x=>x.id==='mana-burn')).toBe(!e.burnImmune);
  expect(control.statuses.some(x=>x.id==='mana-burn')).toBe(true);
 });
});
