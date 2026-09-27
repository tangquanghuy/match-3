// Lane L1 round 1: compact sign-off specs -> fill.mjs input (lane-owned, not evidence).
// usage: node spec-r1.cjs <batch> > spec.json
const b=process.argv[2];
const G='artifacts/gow-skill-audit/gold-primary-sources/';
const STATUS={path:G+'official-status-effects.html',note:'Official status guide: Curse/Death Mark/Hunter\'s Mark/Web/Disease/Frozen/Poison semantics; Blessed immune to status effects, Devour and Mana Burn. Durations per rulings/R004 (convention:R006-C2 for Cause* Amount).'};
const MB={id:'manaburn',role:'official-shared-rule',path:G+'official-mana-burn-2-0.html',note:'Mana Burn deals damage based on the enemy\'s current mana and does not drain it.'};
const TS={id:'transform',role:'community-rule',path:G+'community-2026-09-28-transform-summon.json',note:'Transform restores Life/Armor and takes level + traits of the troop; summons arrive at level 20 (project roster is level 20).'};
const R001={id:'r001',role:'user-ruling',path:'tasks/active/gow-skill-shards/rulings/R001-native-step-order.md',note:'Native SpellSteps order is authoritative.'};
const R003={id:'r003',role:'user-ruling',path:'tasks/active/gow-skill-shards/rulings/R003-count-threshold-labels.md',note:'Count* Amount is a percentage: [3:1] = 34%.'};
const T=n=>`tests/unit/gowLaneL1B${n}.test.ts`;
function dims(o){
 const d={'identity-cost-colors':['v','entity id, SpellId, cost and colours match raw EN + native + src/data (binding test)'],
  'target-count-range':['v',o.target],'base-formula-rounding':o.formula??['na','no numeric formula'],
  'boost-source-ratio-cap':o.boost??['na','no boost source'],'conditions-probabilities-branches':o.cond??['na','single unconditional branch'],
  'status-duration-immunity':o.status??['na','no status'],'gems-types-selection-resolution':o.gems??['na','no gem effect'],
  'summon-transform-pools':o.pool??['na','no summon/transform'],'order-death-retargeting':o.order,
  'mana-economy-extra-turn':['v','cast spends mana, one action logged, turn passes (no extra turn); low-mana / Silence refused'],
  'display-description':['v',o.zh??'zh description matches English meaning (binding test)'],'battle-pipeline':['v','real TurnEngine.castSkill, both sides']};
 return d;
}
const S={};
if(b==='01'){
 S['troop:7494']={en:'troop 7494 SpellId 9239 cost 11 Red/Purple; English 2 clauses',native:'9239: CauseCursed RandomEnemy, CauseCursed RandomPrefNotPrevEnemy, SummoningType mystic',rule:STATUS,extra:[TS],
  dims:dims({target:'enemyRandomN n=2 distinct = RandomEnemy + RandomPrefNotPrevEnemy; one living enemy -> one Curse (equivalent to cursing twice, test)',status:['v','Curse applied to 2 enemies'],
   pool:['v','pool = all 228 raw Mystic (TroopType/TroopType2) troops in the project roster; raw-only Cultist 7888 not in roster (issue L1-roster-gap); level-20 template stats/traits, 0 mana; full team -> no summon; 3 active -> 4th slot'],
   order:['v','Curses before summon (event order test)']}),
  clauses:{c1:['v','2 distinct random enemies Cursed, both sides'],c2:['v','one Mystic from the roster-scoped raw Mystic pool, fixed seeds']},
  steps:{0:['v','RandomEnemy Curse'],1:['v','RandomPrefNotPrevEnemy Curse (distinct; lone enemy reuse is equivalent)'],2:['v','SummoningType mystic pool check vs data/raw']},branches:{main:['v','single branch']}};
 S['troop:7260']={en:'troop 7260 SpellId 8894 cost 22 Green/Red/Purple; English 3 clauses',native:'8894 Target Enemy: CauseCursed FromTarget, CauseDeathMark FromTarget, Damage BelowTarget x1.5+3, Summoning 6067 Abhorath',rule:STATUS,extra:[TS],
  dims:dims({target:'chosen enemy (fixed L1-7260-target, was allyChosen); damage to every living enemy below it; last enemy chosen -> none, first -> 3',formula:['v','round(Magic x 1.5) + 3 (magic 10 -> 18, 7 -> 14; convention:R006-C1)'],
   status:['v','Curse + Death Mark on the chosen enemy only'],pool:['v','Summoning 6067 = Abhorath template; full team -> no summon'],order:['v','statuses -> damage -> summon (native order)'],zh:'zh corrected to 一名敌人 via gowSnapshotOverrides.json (L1-7260-target)'}),
  clauses:{c1:['v','chosen enemy Cursed + Deathmarked'],c2:['v','enemies below take round(1.5M)+3'],c3:['v','Abhorath summoned']},
  steps:{0:['v','Curse FromTarget'],1:['v','DeathMark FromTarget'],2:['v','Damage BelowTarget'],3:['v','Summoning 6067']},branches:{main:['v','single branch']}};
 S['troop:6453']={en:'troop 6453 SpellId 7631 cost 16 Red/Purple; English 3 clauses',native:'7631: CauseDeathMark, CauseHuntersMark FirstTwoEnemies, Damage FirstTwoEnemies M+4, Transform Self 6451 Nosferatu',rule:STATUS,extra:[TS,R001],
  dims:dims({target:'first 2 living enemies; one living enemy -> only it',formula:['v','Magic + 4'],status:['v','Death Mark + Hunter\'s Mark on the first two'],
   pool:['v','caster transforms in place into Nosferatu (6451): id/slot kept, template stats/spell/traits, full Life; mana already spent by the cast'],order:['v','fixed L1-6453-order: marks before damage; lethal hit no longer re-selects the third enemy']}),
  clauses:{c1:['v','first two take Magic+4'],c2:['v','both marks on them'],c3:['v','transform into Nosferatu']},
  steps:{0:['v','DeathMark'],1:['v','HuntersMark'],2:['v','Damage'],3:['v','Transform Self 6451']},branches:{main:['v','single branch']}};
 S['troop:6892']={en:'troop 6892 SpellId 8318 cost 11 Red/Yellow; English 2 clauses',native:'8318: CauseDisease RandomEnemy, SummoningKingdomNoError 3061',rule:STATUS,extra:[TS],
  dims:dims({target:'one random living enemy',status:['v','Disease on one enemy'],pool:['v','pool = the 5 raw KingdomId 3061 troops, all reachable with fixed seeds; NoError on full team'],order:['v','Disease then summon']}),
  clauses:{c1:['v','one enemy Diseased'],c2:['v','one Fell Roost troop']},steps:{0:['v','CauseDisease RandomEnemy'],1:['v','SummoningKingdomNoError 3061']},branches:{main:['v','single branch']}};
 S['troop:6474']={en:'troop 6474 SpellId 7652 cost 20 Blue/Yellow/Purple; English 3 clauses',native:'7652: CauseFrozen FirstTwo, ManaBurn FirstTwo x1, TroopOrderBack SecondEnemy, Delay, TroopOrderBack FrontEnemy, SummoningNoError 6191',rule:STATUS,extra:[MB,TS],
  dims:dims({target:'first two enemies; second then first moved to the back -> [12,13,11,10]; two enemies -> [11,10]; one -> unchanged',formula:['v','Mana Burn = Magic + victim current mana, no drain (official 2.0)'],
   status:['v','Frozen on both; Blessed front enemy immune to Frozen and Mana Burn'],pool:['v','Summoning 6191 Queen Mab; NoError on full team'],
   order:['v','killed original troop keeps no slot to move; only surviving original targets move (consistent with tests/unit/gowManaBurnTowerAudit.test.ts)']}),
  clauses:{c1:['v','Frozen + Mana Burn first two'],c2:['v','both knocked to last'],c3:['v','Queen Mab summoned']},
  steps:{0:['v','CauseFrozen'],1:['v','ManaBurn'],2:['v','TroopOrderBack SecondEnemy'],3:['v','Delay 800: presentation pause only, no state change between the two knock-backs (order test)'],4:['v','TroopOrderBack FrontEnemy'],5:['v','SummoningNoError 6191']},branches:{main:['v','single branch']}};
}
if(b==='02'){
 S['troop:6385']={en:'troop 6385 SpellId 7540 cost 11 Green/Yellow; English 2 clauses',native:'7540 Target Enemy: CauseHuntersMark FromTarget, SummoningNoError 6386, Delay, CreateGems Red 7',rule:STATUS,extra:[TS],
  dims:dims({target:'chosen enemy (11 and 13 tested)',status:['v','Hunter\'s Mark on chosen; Blessed chosen immune'],gems:['v','exactly 7 Red created (full board -> converted cells)'],pool:['v','Summoning 6386 Warhawk template; NoError on full team'],order:['v','mark -> summon -> gems']}),
  clauses:{c1:['v','chosen enemy marked'],c2:['v','Warhawk + 7 Red']},steps:{0:['v','HuntersMark'],1:['v','Summoning 6386'],2:['v','Delay 800: presentation pause only; summon precedes gems (order test)'],3:['v','CreateGems Red 7']},branches:{main:['v','single branch']}};
 S['troop:6378']={en:'troop 6378 SpellId 7533 cost 8 Blue/Purple; English 2 clauses',native:'7533 Randomize A+(B-C-D-E-F): CauseWeb RandomEnemy + one of Summoning 6136/6110/6395/6512/6068',rule:STATUS,extra:[TS],
  dims:dims({target:'one random living enemy',status:['v','Web on one enemy'],cond:['v','Randomize A+(B-C-D-E-F): Web always, exactly one of 5 summons'],pool:['v','fixed L1-6378-pool: pool = the 5 native ids, all reachable with fixed seeds, never other spiders'],order:['v','Web then summon']}),
  clauses:{c1:['v','random enemy Webbed'],c2:['v','one of the 5 native spiders']},
  steps:{0:['v','CauseWeb'],1:['v','SpiderSwarm option'],2:['v','GiantSpider option'],3:['v','Spinnerette option'],4:['v','TombSpider option'],5:['v','Webspinner option']},branches:{'A+(B':['v','Web (A) + SpiderSwarm (B) branch reached'],'C':['v','GiantSpider branch reached'],'D':['v','Spinnerette branch reached'],'E':['v','TombSpider branch reached'],'F)':['v','Webspinner branch reached (fixed seeds: all 5)']}};
}
if(b==='04'){
 S['weapon:1351']={en:'weapon 1351 ChaliceOfEyes SpellId 8357 cost 14 Red/Purple (artifacts/gowhead-weapons + src/data/weapons.json)',native:'8357: Cleanse AllAllies, IncreaseHealth AllAllies M+1, SummoningKingdomNoError 3039',rule:STATUS,extra:[TS],
  dims:dims({target:'all living allies',formula:['v','Magic + 1 Life (magic 10 -> 11, 4 -> 5)'],status:['v','Cleanse removes negatives, keeps Barrier (R002)'],pool:['v','fixed L1-1351-pool: all 6 raw KingdomId 3039 troops reachable; summon after heal keeps template Life; NoError on full team'],order:['v','cleanse -> heal -> summon'],zh:'zh weapon description matches'}),
  clauses:{c1:['v','cleanse + Life to all allies'],c2:['v','one All-Seeing Eye troop']},steps:{0:['v','Cleanse'],1:['v','IncreaseHealth'],2:['v','SummoningKingdomNoError 3039']},branches:{main:['v','single branch']}};
 S['troop:6469']={en:'troop 6469 SpellId 7647 cost 11 Green/Purple; English 1 clause',native:'7647 Target Enemy: Consume 20% FromTarget, CauseWeb FromTarget, Damage FromTarget M+3',rule:STATUS,extra:[R001],
  dims:dims({target:'chosen enemy only',formula:['v','Magic + 3 (armor first)'],cond:['v','20% devour: 60 seeds give 4..24 devours (fixed L1-devour-double-roll)'],status:['v','Web unless devoured; Blessed immune to Devour and Web'],
   pool:['v','devour kills the target, caster gains its Attack/Armor/Life'],order:['v','fixed L1-6469-order: devour -> Web -> damage; devoured enemy never Webbed/hit']}),
  clauses:{c1:['v','damage + Web, 20% devour']},steps:{0:['v','Consume 20%'],1:['v','CauseWeb'],2:['v','Damage M+3']},branches:{main:['v','devour vs not both covered']}};
 S['troop:6700']={en:'troop 6700 SpellId 8056 cost 24 Blue/Green/Brown; English 3 clauses',native:'8056 Target Ally: Consume FromTarget, CountLife Self 34, TrueScatterDamage AllEnemies M+16 counter, SummoningTypeConditional daemon AddForAllyDeath',rule:STATUS,extra:[R003,R001,TS],
  dims:dims({target:'chosen ally devoured; scatter over all enemies',formula:['v','total = Magic + 16 + floor(Life x 34/100), true damage ignores armor'],boost:['v','Life after devour (1200 -> +408); no devour 1000 -> +340 (R003, not 333)'],
   cond:['v','Daemon only if the ally was devoured (Blessed / Barrier ally -> none)'],pool:['v','Daemon pool = all roster Daemons (raw minus 3 raw-only troops); devour gains Attack/Armor/Life'],
   order:['v','runtime summons before the scatter; R001 equivalence test: summon does not change enemies or caster Life, totals equal native']}),
  clauses:{c1:['v','devour ally, Daemon if devoured'],c2:['v','true scatter boosted by Life'],c3:['v','[3:1] = 34% (R003)']},
  steps:{0:['v','Consume ally'],1:['v','CountLife 34%'],2:['v','TrueScatterDamage'],3:['v','SummoningTypeConditional daemon']},branches:{main:['v','devoured / not devoured both covered']}};
}
if(b==='05'){
 const dv='devour kills the target and the caster gains its Attack/Armor/Life; Blessed immune (official); one roll per target (fixed L1-devour-double-roll)';
 S['troop:6118']={en:'troop 6118 SpellId 7210 cost 16 Purple/Brown; English 1 clause',native:'7210 Target Enemy: Consume 40% FromTarget, Damage FromTarget M+6',rule:STATUS,extra:[R001],
  dims:dims({target:'chosen enemy only',formula:['v','Magic + 6'],cond:['v','40%: 80 seeds give 20..46 devours'],status:['v','Blessed chosen enemy never devoured, still hit'],pool:['v',dv],order:['v','fixed L1-consume-first: devour roll before the hit; devoured enemy is not hit again']}),
  clauses:{c1:['v','hit M+6 or devour 40%']},steps:{0:['v','Consume 40%'],1:['v','Damage M+6']},branches:{main:['v','devour / no devour both covered']}};
 S['weapon:1129']={en:'weapon 1129 BlackManacles SpellId 7293 cost 15 Purple/Brown (artifacts/gowhead-weapons + src/data/weapons.json)',native:'7293: Consume 20% RandomEnemy, Damage AllEnemies x1',rule:STATUS,extra:[R001],
  dims:dims({target:'devour: one random living enemy; damage: every living enemy',formula:['v','Magic (10 and 3)'],cond:['v','20%: 80 seeds give 6..30 devours'],pool:['v',dv],order:['v','fixed L1-consume-first: devour first, the devoured enemy is not damaged'],zh:'zh weapon description matches'}),
  clauses:{c1:['v','Magic to all enemies'],c2:['v','20% devour a random enemy']},steps:{0:['v','Consume 20% RandomEnemy'],1:['v','Damage AllEnemies']},branches:{main:['v','devour / no devour both covered']}};
 S['troop:7272']={en:'troop 7272 SpellId 8891 cost 12 Blue/Red; English 2 clauses',native:'8891: Consume 20% LastEnemy, Damage LastEnemy M+3, CauseSubmerged Self',rule:STATUS,extra:[R001],
  dims:dims({target:'last living enemy (dead last slot skipped); damage stays on the same (English "them"; slot kept during the spell as in gowManaBurnTowerAudit)',formula:['v','Magic + 3'],cond:['v','20%: 80 seeds give 6..30 devours'],status:['v','caster Submerged either way'],pool:['v',dv+'; was a plain execute before L1-consume-first'],order:['v','devour -> hit -> Submerge (native)']}),
  clauses:{c1:['v','hit last enemy M+3, 20% devour'],c2:['v','Submerge self']},steps:{0:['v','Consume 20% LastEnemy'],1:['v','Damage LastEnemy'],2:['v','CauseSubmerged Self']},branches:{main:['v','devour / no devour both covered']}};
 S['troop:7271']={en:'troop 7271 SpellId 8890 cost 12 Red/Yellow; English 3 clauses',native:'8890 Target Enemy: Consume 20% FromTarget, Damage FromTarget M+3, CreateGems DragonRed 12 AddForKill',rule:STATUS,extra:[R001],
  dims:dims({target:'chosen enemy',formula:['v','Magic + 3'],cond:['v','20% devour; dragon gems only if the enemy died (devour or lethal hit), none when it survives'],gems:['v','12 Red Dragon Gems on death'],pool:['v',dv+'; was a plain execute before L1-consume-first'],order:['v','devour -> hit -> gems (native)']}),
  clauses:{c1:['v','hit M+3'],c2:['v','20% devour'],c3:['v','12 Red Dragon Gems if the enemy dies']},steps:{0:['v','Consume 20%'],1:['v','Damage M+3'],2:['v','CreateGems DragonRed AddForKill']},branches:{main:['v','devoured / lethal / survived covered']}};
}
for(const k of Object.keys(S)){S[k].decision='accept';S[k].test=T(b);S[k].testNote=`${k}: real TurnEngine.castSkill both sides, fixed RNG, boundaries`;}
require('fs').writeFileSync(process.argv[3],JSON.stringify(S,null,1));console.log('spec',b,Object.keys(S).join(','));
