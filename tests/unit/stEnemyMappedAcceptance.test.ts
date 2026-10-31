import {describe,expect,it} from 'vitest';
// @ts-expect-error Node fixture I/O is outside the browser build.
import {readFileSync} from 'node:fs';
// @ts-expect-error Node fixture hashing is outside the browser build.
import {createHash} from 'node:crypto';
import {MAPPED_SOURCES} from '../fixtures/stEnemyMappedSources';
import troops from '../../src/data/troops.json';
import {SOURCE_TROOPS} from '../../src/data/troops';
import traits from '../../src/data/traits.json';
import progression from '../../src/data/troop-progression.json';
import {PORTRAITS} from '../../src/sillytavern/portraits';
import {adaptedTraitDescription,restoreEnemyBlueprint,abilityIdentity} from '../../src/sillytavern/enemyBlueprint';
import {findLegalSwaps} from '../../src/engine/boardUtils';
import {BaseColor,PlayerSide,colorGem} from '../../src/engine/types';
import {FixedCellChooser} from '../../src/engine/skills/cellChooser';
import {FixedColorChooser} from '../../src/engine/skills/colorChooser';
import {applyGowChoiceRule,choiceRuleOf} from '../../src/engine/skills/gowChoiceRules';
import type {EffectSegment} from '../../src/engine/skills/prototypes';
import {battle,blueprint,cast,colors,dummy,frame,grid,openingExpected,stats,swap,alias} from '../helpers/stMappedHarness';
import type {MappedRow,Run} from '../helpers/stMappedHarness';

// Native whole-skill suites remain the source-semantic evidence. These cases
// exercise the actual ST mapping, frozen source declarations, input, scaling,
// ordinary traits, and serialized continuation, without recreating the engine.
const family=(row:MappedRow)=>`ST mapped source ${row.enemyId}: production assembly with reused native semantics`;
const descriptionClauses:Record<number,RegExp[]>={
 6016:[/行/,/敌方|敌人/,/魔力|魔法/],6026:[/敌方|敌人/,/攻击/,/2/],6027:[/攻击/,/护甲/,/棕色/,/每4颗\+1/],
 6029:[/敌方|敌人/,/自身.*护甲|施法者.*护甲/],6074:[/选定.*颜色|指定颜色/,/骷髅/],6098:[/选定.*宝石|选定.*格/,/两侧|横向|左右/],6105:[/爆破/,/选定.*颜色|指定颜色/,/魔力|魔法/],
};
function scarceBlue(run:Run){
 const options=colors.filter(c=>c!==BaseColor.Blue);
 for(let row=0;row<8;row++)for(let col=0;col<8;col++)run.state.board.set({row,col},{id:row*8+col,type:colorGem(options[(row*2+col*3)%5]!)});
 for(const [row,col]of [[2,2],[6,6]]as const)run.state.board.set({row,col},{id:row*8+col,type:colorGem(BaseColor.Blue)});
}
function assertActive(run:Run){
 if(run.row.enemyId===6105)scarceBlue(run);
 const before={caster:stats(run.caster),foes:run.foes.map(stats),board:structuredClone(grid(run))};
 const blue=before.board.flatMap((g,i)=>g?.type.kind==='color'&&g.type.color===BaseColor.Blue?[{row:Math.floor(i/8),col:i%8,id:g.id}]:[]);
 const brown=before.board.filter(g=>g?.type.kind==='color'&&g.type.color===BaseColor.Brown).length;
 const events=cast(run),id=run.row.enemyId;
 expect(events.filter(e=>e.type==='skill-cast').map(e=>e.type==='skill-cast'?e.skillId:null)).toEqual([`st:${run.row.sourceTroop.spell.id}`]);
 if([6016,6026,6029].includes(id)){
  const target=id===6016?run.foes[0]!:run.byName('chosen');
  const damage=before.caster.magic+(id===6016?1:id===6026?3:before.caster.armor);
  expect(events.filter(e=>e.type==='skill-damage').map(e=>e.type==='skill-damage'?{targetId:e.targetId,damage:e.damage}:null)).toEqual([{targetId:target.id,damage}]);
  for(const [i,foe]of run.foes.entries()){
   expect(foe.hp+foe.armor).toBe(before.foes[i]!.hp+before.foes[i]!.armor-(foe===target?damage:0));
   expect(foe.attack).toBe(before.foes[i]!.attack-(id===6026&&foe===target?2:0));
  }
 }
 if(id===6027){
  const gain=before.caster.magic+Math.floor(brown/4);
  expect(run.caster.attack-before.caster.attack).toBe(gain);expect(run.caster.armor-before.caster.armor).toBe(gain);
  const removed=events.filter(e=>e.type==='gem-destroy'&&e.removed).flatMap(e=>e.type==='gem-destroy'?e.cells:[]);
  expect(removed.map(g=>g.gemId).sort((a,b)=>a-b)).toEqual(before.board.filter(g=>g?.type.kind==='color'&&g.type.color===BaseColor.Brown).map(g=>g!.id).sort((a,b)=>a-b));
  expect(run.foes.map(stats)).toEqual(before.foes);
 }
 if(id===6016||id===6098){
  const destroyed=events.filter(e=>e.type==='gem-destroy'&&!e.removed).flatMap(e=>e.type==='gem-destroy'?e.cells:[]);
  const expected=(id===6016?Array.from({length:8},(_,col)=>({row:3,col})):[{row:3,col:2},{row:3,col:3},{row:3,col:4}]);
  expect(destroyed.map(g=>g.pos)).toEqual(expected);
  expect(destroyed.map(g=>g.gemId)).toEqual(expected.map(p=>before.board[p.row*8+p.col]!.id));
 }
 if(id===6074){
  const transformed=events.filter(e=>e.type==='gem-transform').flatMap(e=>e.type==='gem-transform'?e.changes:[]);
  expect(transformed.map(g=>({row:g.pos.row,col:g.pos.col,id:g.gemId}))).toEqual(blue);
  expect(transformed.every(g=>g.from.kind==='color'&&g.from.color===BaseColor.Blue&&g.to.kind==='skull')).toBe(true);
 }
 if(id===6105){
  const footprint=new Set<number>();
  for(const center of blue)for(let dr=-1;dr<=1;dr++)for(let dc=-1;dc<=1;dc++){const row=center.row+dr,col=center.col+dc;if(row>=0&&row<8&&col>=0&&col<8)footprint.add(row*8+col);}
  const explosions=events.filter(e=>e.type==='gem-explode');expect(explosions).toHaveLength(1);
  const cleared=explosions.flatMap(e=>e.type==='gem-explode'?e.cells:[]);
  expect(cleared.map(c=>c.pos.row*8+c.pos.col).sort((a,b)=>a-b)).toEqual([...footprint].sort((a,b)=>a-b));
  expect(cleared.every(g=>before.board[g.pos.row*8+g.pos.col]?.id===g.gemId)).toBe(true);
 }
 return events;
}
for(const row of MAPPED_SOURCES)describe(family(row),()=>{
 it('binds frozen source, actual portrait bytes, original rarity, mana, context and every ordinary trait',()=>{
  expect(troops.find(t=>t.id===row.enemyId)).toEqual(row.sourceTroop);
  expect((progression as Record<string,unknown>)[String(row.enemyId)]).toEqual(row.progression);
  for(const tr of row.sourceTraits)expect(traits.find(t=>t.code===tr.code)).toEqual(tr);
  const run=battle(row),p=PORTRAITS.find(p=>p.troopId===row.enemyId)!;
  expect(run.registry.prototypes.get(run.caster.skillId)).toEqual({segments:row.segments});
  expect(p).toEqual(row.portrait);
  expect(createHash('sha256').update(readFileSync(`game-assets/public/static/portraits/${p.assetId}.webp`)).digest('hex')).toBe(row.portraitSha256);
  expect(run.bp.snapshot).toMatchObject({portraitUrl:`/static/portraits/${p.assetId}.webp`,rarityIdx:row.sourceTroop.rarityIdx,role:p.role,manaColors:row.sourceTroop.manaColors,manaCost:row.sourceTroop.manaCost,traitIds:row.sourceTroop.traits.map(t=>`st:${t.code}`),skillId:`st:${row.sourceTroop.spell.id}`,battleScaling:{level:20,difficulty:1},stats:row.stats['20@1']});
  expect(run.caster.troopTypes).toEqual(row.sourceTroop.troopTypes.map(alias));
  expect(run.caster.mechanicalIdentity).toBe(`unit:${Math.min(...troops.filter(t=>t.name===row.sourceTroop.name).map(t=>t.id))}`);
  const regions=[...new Set(SOURCE_TROOPS.map(t=>t.kingdom).filter(Boolean))].sort();
  expect(run.bp.context.region).toBe(`region:${regions.indexOf(row.sourceTroop.kingdom)+1}`);
  expect(run.bp.snapshot.kingdom).toBe(run.bp.context.region);
  expect(run.bp.context.affinities).toEqual(row.sourceTroop.troopTypes.map(alias));
  expect(run.bp.omittedMechanisms).toEqual([]);expect(run.bp.budget.traitCount).toBe(3);
 });
 it('keeps frozen source and learning identities independent of level, difficulty and JSON reopening',()=>{
  const recipe=applyGowChoiceRule(row.sourceTroop.spell.id,{segments:structuredClone(row.segments) as unknown as EffectSegment[]});
  const expected=abilityIdentity(recipe,row.sourceTroop.manaColors,row.sourceTroop.manaCost);
  for(const [level,difficulty]of [[1,1],[20,1],[20,1.5],[7,1.3]]as const){
   const bp=blueprint(row,level,difficulty);
   for(const saved of [bp,restoreEnemyBlueprint(JSON.parse(JSON.stringify(bp)))])expect(saved).toMatchObject({recipeId:`enemy:${row.enemyId}`,sourceId:`enemy:${row.enemyId}`,abilityId:expected});
  }
 });
 if([6074,6105].includes(row.enemyId))for(const restore of [false,true])it(`registers the native mana-only input restriction on the live ST prototype after reopen=${restore}`,()=>{
  const run=battle(row,{restore});expect(choiceRuleOf(run.registry.prototypes.get(run.caster.skillId))).toEqual({manaGemsOnly:true});
 });
 it('describes the source effects, input scope and all ordinary traits in player terms',()=>{
  const bp=blueprint(row);expect(bp.descriptionAudit).toEqual({support:'full',diagnostics:[]});
  for(const clause of descriptionClauses[row.enemyId]!)expect(bp.snapshot.spellDescription).toMatch(clause);
  expect(bp.snapshot.spellDescription).not.toContain(row.referenceName);
  expect(bp.traitDescriptionAudit.map(t=>t.code)).toEqual(row.sourceTroop.traits.map(t=>`st:${t.code}`));
  for(const tr of row.sourceTraits){const text=adaptedTraitDescription(tr.code)!;expect(text).toMatchObject({support:'full',diagnostics:[]});expect(text.description.length).toBeGreaterThan(3);}
 });
 for(const [level,difficulty]of [[1,1],[20,1],[20,1.5],[7,1.3]]as const)it(`preserves frozen panels and executes the scaled full active at ${level}@${difficulty}`,()=>{
  const run=battle(row,{level,difficulty});expect(run.bp.snapshot.stats).toEqual((row.stats as Record<string,unknown>)[`${level}@${difficulty}`]);
  expect(run.state.teams[run.side].characters.map(stats)).toEqual(openingExpected(run));assertActive(run);
 });
 for(const side of [PlayerSide.Left,PlayerSide.Right]){
  it(`executes the complete active through the prepared session on ${side}`,()=>{assertActive(battle(row,{side}));});
  it(`applies opening traits only to living same-side source affinities on ${side}`,()=>{
   const source=row.sourceTroop,color=source.manaColors[0]! as BaseColor;
   const run=battle(row,{side,dead:['dead'],allies:[dummy('matching',{manaColors:[color],troopTypes:[alias(source.troopTypes[0]!)]}),dummy('plain',{manaColors:[colors.find(c=>!source.manaColors.includes(c as never))!],troopTypes:[alias('Daemon')]}),dummy('dead',{manaColors:[color],troopTypes:[alias(source.troopTypes[0]!)]})],opponents:[dummy('chosen',{manaColors:[color],troopTypes:[alias(source.troopTypes[0]!)]})]});
   expect(run.state.teams[side].characters.map(stats)).toEqual(openingExpected(run));
   expect(run.byName('chosen')).toMatchObject({hp:1000,maxHp:1000,armor:40,attack:12,magic:0,mana:0});
   expect(run.byName('dead')).toMatchObject({hp:0,maxHp:1000,armor:40,attack:12,magic:0,mana:0,defeated:true});
  });
  for(const color of colors)it(`routes actual ${color} three-match charging through source colors on ${side}`,()=>{
   const run=battle(row,{side,match:colorGem(color),allies:[]});run.caster.mana=0;
   const events=swap(run),gravity=events.findIndex(e=>e.type==='gravity');
   const firstWave=gravity<0?events:events.slice(0,gravity);
   const gains=firstWave.filter(e=>e.type==='mana-gain'&&e.characterId===run.caster.id);
   const accepts=row.sourceTroop.manaColors.includes(color as never);
   expect(events.some(e=>e.type==='elimination')).toBe(true);
   if(accepts){expect(gains.length).toBeGreaterThan(0);expect(run.caster.mana).toBeGreaterThan(0);}else expect(gains).toHaveLength(0);
  });
  it(`charges by legal swaps and replays casts and follow-up turns identically after JSON reopen on ${side}`,()=>{
   const a=battle(row,{side,allies:[]}),b=battle(row,{side,allies:[],restore:true});
   const same=()=>expect(frame(b)).toEqual(frame(a));same();let charged=0;
   for(let i=0;i<180&&a.caster.mana<a.caster.manaCost;i++){
    if(a.state.activePlayer!==side){a.session.passTurn();b.session.passTurn();same();}
    const move=findLegalSwaps(a.state.board)[0];expect(move).toBeDefined();
    const action={type:'swap' as const,from:move!.a,to:move!.b};const events=a.session.resolve(action);expect(events.length).toBeGreaterThan(0);expect(b.session.resolve(action)).toEqual(events);same();charged++;
   }
   expect(charged).toBeGreaterThan(0);expect(a.caster.mana).toBe(a.caster.manaCost);
   if(a.state.activePlayer!==side){a.session.passTurn();b.session.passTurn();same();}
   const action={type:'cast' as const,characterId:a.caster.id};const events=a.session.resolve(action);
   expect(events.some(e=>e.type==='skill-cast')).toBe(true);expect(b.session.resolve(action)).toEqual(events);same();
   for(let i=0;i<2;i++){expect(b.session.passTurn()).toEqual(a.session.passTurn());same();}
  });
  it(`rejects insufficient mana, wrong turn, unknown and defeated casters atomically on ${side}`,()=>{
   for(const reason of ['low-mana','wrong-turn','unknown','defeated','silence']as const){
    const run=battle(row,{side});run.caster.mana=reason==='low-mana'?0:run.caster.manaCost;
    if(reason==='wrong-turn')run.session.passTurn();if(reason==='silence')run.caster.statuses=[{id:'silence',turns:3}];if(reason==='defeated'){run.caster.hp=0;run.caster.defeated=true;}
    const before=frame(run);expect(run.session.resolve({type:'cast',characterId:reason==='unknown'?9999:run.caster.id})).toEqual([]);expect(frame(run)).toEqual(before);
   }
  });
 }
 it('restores the entire blueprint and rejects modified active, traits, mana and context',()=>{
  const bp=blueprint(row,7,1.3);expect(restoreEnemyBlueprint(JSON.parse(JSON.stringify(bp)))).toEqual(bp);
  for(const change of [(b:typeof bp)=>{b.snapshot.skillId=b.snapshot.skillId==='st:7000'?'st:7004':'st:7000';},(b:typeof bp)=>{b.recipeSignature='tampered';},(b:typeof bp)=>{b.snapshot.traitIds=[];},(b:typeof bp)=>{b.snapshot.manaCost++;},(b:typeof bp)=>{b.snapshot.troopTypes=[];},(b:typeof bp)=>{b.snapshot.stats.magic++;}]){
   const altered=structuredClone(bp);change(altered);expect(()=>restoreEnemyBlueprint(altered)).toThrow();
  }
 });
 if([6026,6029].includes(row.enemyId))it('preserves native atomic cancellation of a required character target',()=>{
  const run=battle(row);run.caster.mana=run.caster.manaCost;run.engine.setTargetChooser({choose:()=>null});
  const before=frame(run);expect(run.session.resolve({type:'cast',characterId:run.caster.id})).toEqual([]);expect(frame(run)).toEqual(before);
 });
 if([6016,6098,6074,6105].includes(row.enemyId))it('preserves native paid cancellation of board input and identical JSON continuation',()=>{
  // Native cell/color input happens after cast commit. Preserve the existing
  // payment and input contract through assembly and serialized reopening.
  const results=[battle(row),battle(row,{restore:true})].map(run=>{
   run.caster.mana=run.caster.manaCost;
   if([6016,6098].includes(row.enemyId))run.engine.setCellChooser({choose:()=>null});
   else run.engine.setColorChooser({choose:()=>null});
   const before=structuredClone(grid(run)),events=run.session.resolve({type:'cast',characterId:run.caster.id});
   expect(events.filter(e=>e.type==='skill-cast')).toHaveLength(1);expect(run.caster.mana).toBe(0);
   expect(events.some(e=>e.type==='gem-destroy'||e.type==='gem-transform'||e.type==='gem-explode')).toBe(false);
   expect(grid(run)).toEqual(before);
   if(row.enemyId===6016)expect(events.filter(e=>e.type==='skill-damage')).toHaveLength(1);
   return {events,frame:frame(run)};
  });
  expect(results[1]).toEqual(results[0]);
 });
});
for(const id of [6016,6098])describe(family(MAPPED_SOURCES.find(r=>r.enemyId===id)!),()=>{
 for(const [row,col]of [[0,0],[0,7],[7,0],[7,7],[3,3]]as const)it(`keeps board input geometry and original gem ids at edge ${row},${col}`,()=>{
  const run=battle(MAPPED_SOURCES.find(r=>r.enemyId===id)!);run.engine.setCellChooser(new FixedCellChooser({row,col}));
  const before=grid(run),events=cast(run),hits=events.filter(e=>e.type==='gem-destroy').flatMap(e=>e.type==='gem-destroy'?e.cells:[]);
  const expected=(id===6016?Array.from({length:8},(_,i)=>i):[col-1,col,col+1].filter(c=>c>=0&&c<8)).map(col=>({row,col}));
  expect(hits.map(g=>g.pos)).toEqual(expected);expect(hits.map(g=>g.gemId)).toEqual(expected.map(p=>before[p.row*8+p.col]!.id));
 });
});
for(const id of [6074,6105])describe(family(MAPPED_SOURCES.find(r=>r.enemyId===id)!),()=>{
 it('accepts an absent selected color as a paid empty board effect',()=>{
  const run=battle(MAPPED_SOURCES.find(r=>r.enemyId===id)!);scarceBlue(run);
  run.state.board.forEach((gem,pos)=>{if(gem?.type.kind==='color'&&gem.type.color===BaseColor.Blue)run.state.board.set(pos,{...gem,type:colorGem(BaseColor.Red)});});
  run.engine.setColorChooser(new FixedColorChooser(BaseColor.Blue));const before=grid(run);const events=cast(run);
  expect(events.some(e=>e.type==='skill-cast')).toBe(true);expect(events.some(e=>e.type==='gem-transform'||e.type==='gem-explode')).toBe(false);
  expect(grid(run)).toEqual(before);expect(run.caster.mana).toBe(0);
 });
});

describe(family(MAPPED_SOURCES.find(r=>r.enemyId===6027)!),()=>{
 for(const restore of [false,true])it(`keeps remove distinct from mana-producing destroy after reopen=${restore}`,()=>{
  const run=battle(MAPPED_SOURCES.find(r=>r.enemyId===6027)!,{restore,allies:[dummy('brown-receiver',{manaColors:[BaseColor.Brown]})]});
  const events=cast(run),gravity=events.findIndex(e=>e.type==='gravity'),beforeFall=gravity<0?events:events.slice(0,gravity);
  expect(beforeFall.some(e=>e.type==='gem-destroy'&&e.removed)).toBe(true);
  expect(beforeFall.filter(e=>e.type==='mana-gain')).toEqual([]);
 });
});
