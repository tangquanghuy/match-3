import {describe,expect,it} from 'vitest';
// @ts-expect-error Node-only acceptance evidence; application has no Node types.
import {readFileSync} from 'node:fs';
// @ts-expect-error Node-only portrait byte verification.
import {createHash} from 'node:crypto';
import {BaseColor,PlayerSide} from '../../src/engine/types';
import type {GameEvent} from '../../src/engine/events';
import {getTrait} from '../../src/engine/traits';
import {skill,dmg,inflict,drainMana,steal} from '../../src/engine/skills/builders';
import {getTroopById} from '../../src/data/troops';
import {TROOP_PROGRESSION} from '../../src/data/leveling';
import {adaptedTraitDescription,restoreEnemyBlueprint} from '../../src/sillytavern/enemyBlueprint';
import {PORTRAITS} from '../../src/sillytavern/portraits';
import {randomEnemies,battle,blueprint,board,dummy,other,turn,cast,probeCast,damageEvents,snapshot,boardSnapshot} from '../helpers/stRandomDamageHarness';

// Reuse native assertions at the real ST boundary, not another primitive engine harness:
// gowParallelSignoffTroops.test.ts: signoff troop:7160/spell:8735 and 7161/spell:8736
//   per-entity English, native steps, binding, cost/color, prototype and display;
//   real cast side=Left/Right magic=0/10 produces only the named effect, costs mana and a turn.
// gowRandomTroopCompletion.test.ts: troop:7161 random/target boundary
//   128 independent seeds on Left/Right keep one real hit, mana and turn;
//   Barrier blocks the selected victim only, spending exactly one action.
// Existing High Ancestry family regression already tests drain/steal/curse/stun interactions.
// Here only these two genuine assembled sources are exercised. No claim of rerunning native files.
const readJson=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const rawTroops=readJson('data/raw/troops.gow.en.json').troops as Record<string,any>[];
const rawSpells=readJson('data/raw/spells.gow.en.json').spells as Record<string,any>[];
const rawTraits=(readJson('data/raw/gow-2026-09-18/traits.en.json').traits as {RawData:string}[]).map(t=>JSON.parse(t.RawData));
const sides=[PlayerSide.Left,PlayerSide.Right];
const swap={type:'swap',from:{row:0,col:1},to:{row:1,col:1}} as const;

for(const e of randomEnemies)describe(`ST random damage ${e.id} ${e.name}: source behavior`,()=>{
 it('freezes independent raw troop, spell, traits, source stats and progression',()=>{
  const raw=rawTroops.find(t=>t.id===e.id)!;
  expect(JSON.parse(raw.data??raw.RawData)).toEqual(e.rawTroop);
  expect(JSON.parse(rawSpells.find(t=>t.Id===e.rawSpell.Id)!.data??rawSpells.find(t=>t.Id===e.rawSpell.Id)!.RawData)).toEqual(e.rawSpell);
  expect(raw.ReferenceName).toBe(e.name);expect(raw.RarityIdx).toBe(e.sourceTroop.rarityIdx);
  expect({hp:raw.Health,armor:raw.Armor,attack:raw.Attack,magic:raw.Magic}).toEqual(e.sourceStats);
  expect(raw.ManaCost).toBe(7);expect(raw.stats.spell.desc).toBe(e.englishClause);
  expect(raw.stats.traits.map((t:{code:string;description:string})=>({code:t.code,description:t.description}))).toEqual(e.englishTraits);
  expect(getTroopById(e.id)).toEqual(e.sourceTroop);
  expect(TROOP_PROGRESSION[e.id]).toEqual(e.progression);
  for(const tr of e.traits)expect(rawTraits.find(t=>t.Code===tr.code)).toEqual(tr.raw);
  // Independent cumulative growth oracle: no troopStatsAtLevel/compiler output in expected values.
  for(const scale of e.scales){
   const n=e.rawTroop,d=scale.difficulty,round=(v:number)=>Math.round(v*d);
   expect(scale.stats).toEqual({hp:Math.max(1,round(n.Health_Base+n.HealthIncrease.slice(0,scale.level).reduce((a,b)=>a+b,0))),armor:round(n.ArmorIncrease.slice(0,scale.level).reduce((a,b)=>a+b,0)),attack:round(n.Attack_Base+n.AttackIncrease.slice(0,scale.level).reduce((a,b)=>a+b,0)),magic:round(n.SpellPower_Base+n.SpellPowerIncrease.slice(0,scale.level).reduce((a,b)=>a+b,0))});
  }
 });
 for(const side of sides)it(`binds portrait bytes, context, role, native recipe and every description on side ${side}`,()=>{
  const run=battle(e,{side}),bp=run.bp;
  expect(PORTRAITS.find(p=>p.troopId===e.id)).toEqual(e.portrait);
  expect(createHash('sha256').update(readFileSync(`game-assets/public/static/portraits/${e.portrait.assetId}.webp`)).digest('hex')).toBe(e.portraitSha256);
  expect(bp.portrait).toMatchObject({troopId:e.id,assetId:e.portrait.assetId,contentHash:e.portraitSha256});
  expect(bp.snapshot.portraitUrl).toContain(`static/portraits/${e.portrait.assetId}.webp`);
  expect(bp.snapshot).toMatchObject({role:'Striker',rarityIdx:e.sourceTroop.rarityIdx,mechanicalIdentity:`unit:${e.id}`,manaCost:7,manaColors:e.sourceTroop.manaColors,skillId:`st:${e.rawSpell.Id}`,troopTypes:e.context.affinities,kingdom:e.context.region,kingdomId:e.context.regionId});
  expect(bp.context).toEqual(e.context);expect(bp.omittedMechanisms).toEqual([]);
  expect(bp.descriptionAudit).toEqual({support:'full',diagnostics:[]});
  expect(bp.traitDescriptionAudit).toEqual(e.traits.map(t=>({code:`st:${t.code}`,support:'full',diagnostics:[]})));
  expect(run.caster).toMatchObject({role:'Striker',portraitUrl:bp.snapshot.portraitUrl,mechanicalIdentity:`unit:${e.id}`,troopTypes:e.context.affinities,kingdom:e.context.region,kingdomId:e.context.regionId,traitIds:e.traits.map(t=>`st:${t.code}`),colors:e.sourceTroop.manaColors,manaCost:7,skillId:`st:${e.rawSpell.Id}`});
  expect(run.setup.registry.prototypes.get(`st:${e.rawSpell.Id}`)!.segments).toEqual([e.active]);
  for(const phrase of e.descriptionPhrases)expect(bp.snapshot.spellDescription).toContain(phrase);
  for(const tr of e.traits){
   expect(getTrait(`st:${tr.code}`)).toMatchObject(tr.mechanics);
   const text=adaptedTraitDescription(tr.code)!;expect(text.support).toBe('full');expect(text.diagnostics).toEqual([]);
   for(const phrase of tr.phrases)expect(text.description).toContain(phrase);
  }
 });
 for(const side of sides)for(const scale of e.scales)it(`executes seeded interval endpoints at level ${scale.level} difficulty ${scale.difficulty} on side ${side}`,()=>{
  const amounts=new Set<number>();
  for(const witness of scale.seedCases){
   const run=battle(e,{side,level:scale.level,difficulty:scale.difficulty,seed:witness.seed,allies:[dummy('ally')]}),ally=structuredClone(run.byName('ally'));
   expect(run.bp.snapshot.stats).toEqual(scale.stats);
   expect(run.caster).toMatchObject({...scale.stats,hp:scale.stats.hp+1,maxHp:scale.stats.hp+1,mana:0});
   const events=cast(run),hits=damageEvents(events),target=e.id===7160?0:1;
   expect(events.filter(x=>x.type==='skill-cast')).toEqual([{type:'skill-cast',characterId:run.caster.id,skillId:`st:${e.rawSpell.Id}`}]);
   expect(hits).toHaveLength(1);expect(hits[0]).toMatchObject({casterId:run.caster.id,targetId:run.foes[target]!.id,damage:witness.damage,range:'single'});
   expect(witness.damage).toBeGreaterThanOrEqual(scale.damageMin);expect(witness.damage).toBeLessThanOrEqual(scale.damageMax);amounts.add(hits[0]!.damage);
   run.foes.forEach((foe,i)=>expect([foe.hp,foe.armor]).toEqual(i===target?[1000-Math.max(0,witness.damage-7),Math.max(0,7-witness.damage)]:[1000,7]));
   expect(run.byName('ally')).toEqual(ally);expect(run.caster.mana).toBe(0);
   expect(run.state.activePlayer).toBe(other(side));expect(run.state.actionLog).toHaveLength(1);
   expect(run.caster.role).toBe('Striker');
  }
  expect(amounts.has(scale.damageMin)).toBe(true);expect(amounts.has(scale.damageMax)).toBe(true);
 });
 for(const side of sides)it(`counts only living allied heart colors including self once on side ${side}`,()=>{
  const color=e.heartColor as BaseColor;
  const run=battle(e,{side,allies:[dummy('matching',{manaColors:[color,BaseColor.Green]}),dummy('plain'),dummy('dead',{manaColors:[color]})],dead:['dead'],opponents:[dummy('enemy-match',{manaColors:[color],troopTypes:e.context.affinities,kingdom:e.context.region,kingdomId:e.context.regionId})]});
  expect(run.caster).toMatchObject({hp:e.sourceStats.hp+2,maxHp:e.sourceStats.hp+2,armor:e.sourceStats.armor,attack:e.sourceStats.attack,magic:e.sourceStats.magic,mana:0});
  for(const name of ['matching','plain'])expect(run.byName(name)).toMatchObject({hp:1000,maxHp:1000,armor:7,attack:8,magic:0,mana:0});
  expect(run.byName('dead')).toMatchObject({hp:0,maxHp:1000,defeated:true});
  expect(run.foes[0]).toMatchObject(run.beforeOpening[other(side)].characters[0]!);
  const before=structuredClone(run.state.teams);run.session.passTurn();run.session.passTurn();expect(run.state.teams).toEqual(before);
 });
 for(const side of sides)for(const color of Object.values(BaseColor))it(`routes a real ${color} three-match through source mana colors on side ${side}`,()=>{
  const run=battle(e,{side,match:color});expect(run.caster.mana).toBe(0);
  const events=run.session.resolve(swap),amount=e.sourceTroop.manaColors.includes(color)?3:0;
  expect(events.some(x=>x.type==='elimination')).toBe(true);expect(run.caster.mana).toBe(amount);
  const gains=events.filter((x):x is Extract<GameEvent,{type:'mana-gain'}>=>x.type==='mana-gain'&&x.characterId===run.caster.id);
  expect(gains.reduce((n,x)=>n+x.amount,0)).toBe(amount);expect(gains.every(x=>x.color===color&&x.player===side)).toBe(true);
 });
 for(const side of sides)it(`naturally charges to seven, spends once and atomically rejects an empty recast on side ${side}`,()=>{
  const color=e.sourceTroop.manaColors[0] as BaseColor,run=battle(e,{side,match:color});
  for(const amount of [3,6,7]){turn(run);run.state.board=board(color);const events=run.session.resolve(swap);expect(events.some(x=>x.type==='elimination')).toBe(true);expect(run.caster.mana).toBe(amount);}
  turn(run);run.engine.setTargetChooser({choose:()=>run.foes[1]!.id});
  const beforeLog=run.state.actionLog.length,events=run.session.resolve({type:'cast',characterId:run.caster.id});
  expect(damageEvents(events)).toHaveLength(1);expect(run.caster.mana).toBe(0);expect(run.state.actionLog).toHaveLength(beforeLog+1);expect(run.state.activePlayer).toBe(other(side));
  turn(run);const before=snapshot(run);expect(run.session.resolve({type:'cast',characterId:run.caster.id})).toEqual([]);expect(snapshot(run)).toEqual(before);
 });
 for(const side of sides)it(`rejects low mana, wrong-side, unknown, defeated and disabled casters atomically on side ${side}`,()=>{
  for(const invalid of ['low','wrong','unknown','dead','silence','stun-silence']){
   // Existing silence also disables a cast even when High Ancestry would block its application.
   const run=battle(e,{side});run.caster.mana=invalid==='low'?6:7;run.foes[0]!.mana=12;
   if(invalid==='dead'){run.caster.hp=0;run.caster.defeated=true;}
   if(invalid==='silence'||invalid==='stun-silence')run.caster.statuses=[{id:'silence',turns:3},...(invalid==='stun-silence'?[{id:'stun',turns:3}]:[])];
   let choices=0;run.engine.setTargetChooser({choose:()=>{choices++;return run.foes[1]!.id;}});
   const id=invalid==='wrong'?run.foes[0]!.id:invalid==='unknown'?999:run.caster.id,before=snapshot(run);
   expect(run.session.resolve({type:'cast',characterId:id})).toEqual([]);expect(snapshot(run)).toEqual(before);expect(choices).toBe(0);
  }
 });
 for(const side of sides)it(`excludes dead slots and preserves the source target rule on side ${side}`,()=>{
  const run=battle(e,{side,dead:['front']});let choices=0;
  run.caster.mana=7;run.engine.setTargetChooser({choose:()=>{choices++;return run.foes[2]!.id;}});
  const events=run.session.resolve({type:'cast',characterId:run.caster.id}),hits=damageEvents(events);
  expect(hits).toHaveLength(1);expect(hits[0]!.targetId).toBe(run.foes[e.id===7160?1:2]!.id);expect(choices).toBe(e.id===7160?0:1);
  expect(run.foes[0]).toMatchObject({hp:0,defeated:true});expect(run.caster.mana).toBe(0);
 });
 if(e.id===7161)for(const side of sides)it(`rolls back cancelled, friendly, stale and dead choices including consumed RNG on side ${side}`,()=>{
  for(const choice of ['cancel','friendly','stale','dead']){
   const run=battle(e,{side,dead:choice==='dead'?['chosen']:[]});run.caster.mana=7;let calls=0;
   run.engine.setTargetChooser({choose:(_mode,state,id,rng)=>{calls++;expect(state).toBe(run.state);expect(id).toBe(run.caster.id);rng.next();rng.nextInt(8);return choice==='cancel'?null:choice==='friendly'?run.caster.id:choice==='stale'?999:run.foes[1]!.id;}});
   const before=snapshot(run);expect(run.session.resolve({type:'cast',characterId:run.caster.id})).toEqual([]);expect(calls).toBe(1);expect(snapshot(run)).toEqual(before);
  }
 });
 if(e.id===7160)for(const side of sides)it(`ignores a cancelling manual chooser for its automatic front target on side ${side}`,()=>{
  const run=battle(e,{side});run.caster.mana=7;let calls=0;
  run.engine.setTargetChooser({choose:()=>{calls++;return null;}});
  expect(damageEvents(run.session.resolve({type:'cast',characterId:run.caster.id}))[0]!.targetId).toBe(run.foes[0]!.id);expect(calls).toBe(0);expect(run.caster.mana).toBe(0);
 });
 for(const side of sides)it(`barrier blocks only the real selected victim while consuming one cast on side ${side}`,()=>{
  const run=battle(e,{side});run.foes.forEach(c=>c.statuses=[{id:'barrier',turns:3}]);
  const events=cast(run),selected=e.id===7160?0:1;
  expect(damageEvents(events)).toEqual([]);run.foes.forEach((c,i)=>{expect([c.hp,c.armor]).toEqual([1000,7]);expect(c.statuses.some(s=>s.id==='barrier')).toBe(i!==selected);});
  expect(run.caster.mana).toBe(0);expect(run.state.actionLog).toHaveLength(1);expect(run.state.activePlayer).toBe(other(side));
 });
 for(const side of sides)it(`restores canonical JSON and replays identical board, RNG, events and cached result on side ${side}`,()=>{
  const play=(restore:boolean)=>{
   const run=battle(e,{side,restore,match:e.sourceTroop.manaColors[0] as BaseColor});
   expect(run.session.resolve(swap).some(x=>x.type==='elimination')).toBe(true);expect(damageEvents(cast(run))).toHaveLength(1);
   run.session.surrender();const result=run.session.buildResult();expect(run.session.buildResult()).toBe(result);
   return {bp:run.bp,request:run.request,state:snapshot(run),board:boardSnapshot(run),events:run.session.recordedEvents(),rng:run.rng.getState(),result};
  };
  expect(play(true)).toEqual(play(false));
  const tampered=JSON.parse(JSON.stringify(blueprint(e)));tampered.snapshot.manaCost++;
  expect(()=>restoreEnemyBlueprint(tampered)).toThrow();
  const portrait=JSON.parse(JSON.stringify(blueprint(e)));portrait.portrait.contentHash='0'.repeat(64);expect(()=>restoreEnemyBlueprint(portrait)).toThrow();
 });
 if(e.id===7160)for(const side of sides)it(`executes Frenzy from a real skull hit and records the raw spell-damage scope gap on side ${side}`,()=>{
  const run=battle(e,{side,startSide:other(side),match:'skull'}),before=run.caster.hp+run.caster.armor,attack=run.caster.attack;
  const events=run.session.resolve(swap);expect(events.find(x=>x.type==='skull-damage'&&x.targetId===run.caster.id)).toMatchObject({damage:8});
  expect(run.caster.hp+run.caster.armor).toBe(before-8);expect(run.caster.attack).toBe(attack+1);
  const spell=battle(e,{side,probe:skill(dmg('enemyChosen',2,0))}),spellAttack=spell.caster.attack;
  expect(damageEvents(probeCast(spell))[0]).toMatchObject({targetId:spell.caster.id,damage:2});expect(spell.caster.attack).toBe(spellAttack);
  expect(e.boundaries).toHaveLength(1);expect(e.boundaries[0]!.kind).toBe('raw-runtime-scope-gap');
 });
 if(e.id===7160)for(const side of sides)it(`Sturdy blocks real poison with a plain control and yields to stun on side ${side}`,()=>{
  for(const disabled of [false,true]){
   const probe=disabled?skill(inflict('stun','enemyAll',{turns:4}),inflict('poison','enemyAll',{turns:4})):skill(inflict('poison','enemyAll',{turns:4}));
   const run=battle(e,{side,allies:[dummy('control')],probe});const events=probeCast(run);
   expect(events.some(x=>x.type==='skill-cast')).toBe(true);expect(run.caster.statuses.some(x=>x.id==='poison')).toBe(disabled);expect(run.byName('control').statuses.some(x=>x.id==='poison')).toBe(true);
  }
 });
 if(e.id===7161)for(const side of sides)it(`High Ancestry blocks each named status while a plain control receives it on side ${side}`,()=>{
  for(const status of ['silence','faerie-fire','death-mark']){
   const run=battle(e,{side,allies:[dummy('control')],probe:skill(inflict(status,'enemyAll',{turns:4}))});
   expect(probeCast(run).some(x=>x.type==='skill-cast')).toBe(true);expect(run.caster.statuses.some(x=>x.id===status)).toBe(false);expect(run.byName('control').statuses.some(x=>x.id===status)).toBe(true);
  }
 });
 if(e.id===7161)for(const side of sides)it(`High Ancestry blocks actual mana drain and theft with a plain control on side ${side}`,()=>{
  for(const operation of ['drain','steal']){
   const effect=operation==='drain'?drainMana('enemyAll'):steal('enemyAll','mana','attack',3,0);
   const run=battle(e,{side,allies:[dummy('control')],probe:skill(effect)});run.caster.mana=5;run.byName('control').mana=5;
   const attack=run.foes[0]!.attack;expect(probeCast(run).some(x=>x.type==='skill-cast')).toBe(true);
   expect(run.caster.mana).toBe(5);expect(run.byName('control').mana).toBe(operation==='drain'?0:2);expect(run.foes[0]!.attack).toBe(attack+(operation==='steal'?3:0));
  }
 });
 if(e.id===7161)for(const side of sides)it(`Agile executes both seeded skull branches and leaves ordinary spell damage intact on side ${side}`,()=>{
  const outcomes=new Set<boolean>();
  for(const seed of [1,7,42,12345]){
   const run=battle(e,{side,startSide:other(side),seed,match:'skull'}),before=run.caster.hp+run.caster.armor;
   const events=run.session.resolve(swap),dodged=events.some(x=>x.type==='attack-struggle'&&x.reason==='dodge'&&x.targetId===run.caster.id);outcomes.add(dodged);
   expect(dodged).toBe(seed===7);expect(run.caster.hp+run.caster.armor).toBe(before-(dodged?0:8));
  }
  expect([...outcomes].sort()).toEqual([false,true]);
  const spell=battle(e,{side,seed:7,probe:skill(dmg('enemyChosen',2,0))});expect(damageEvents(probeCast(spell))[0]).toMatchObject({targetId:spell.caster.id,damage:2});
 });
});
