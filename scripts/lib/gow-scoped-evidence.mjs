import { nativeLifeModes } from './gow-life-oracle.mjs';
import { sourceMultiTargetSegments } from './gow-multi-target-oracle.mjs';
/** Persistent, narrowly scoped evidence; NEVER promotes a whole skill to accepted. */
import {perAllyMixSpec} from './gow-per-ally-oracle.mjs';
const suite=name=>`tests/unit/${name}.test.ts`;
const repairEntries=[
 ['weapon:8074',['Restore mandatory front-to-back reposition plus independent 50% second current-front reposition after damage and deaths; two-side real casts and survivors. Shared turn policy remains pending.','gowRepositionStoneAudit']],
 ['weapon:8400',['Restore Stone Block boost on Mana Drain and cap chosen-color destruction at Magic+1; two-side real casts, zero counts, insufficient Mana, dead targets and pre-destruction counts. Shared immunity and board-resolution rules remain pending.','gowRepositionStoneAudit']],
 ['weapon:7755',['Restored strict target-Life greater than caster-Life triple-damage condition after eliminating selected armor; both-side real casts, equal-Life boundary and equipped aliases','gowHopeCrescentThunderbirdAudit']],
 ['weapon:8153',['Restored RemoveStorm after selected true damage and any-Storm team true damage; both-side casts, Storm-owner variants and presentation hide','gowHopeCrescentThunderbirdAudit']],
 ...[7754,7815,9378].map(id=>['weapon:'+id,['Restored source-backed conditional status/gem clauses and original step order; targeted conditions and real weapon casts; shared rules remain pending','gowConditionalWeaponClausesAudit']]),
 ...[7328,7332,7652,8897,9745].map(id=>['troop:'+id,['Native ManaBurn now deals Magic plus target current Mana without draining; both-side real casts, zero/full Mana, ordinary immunity, Curse, Stun and armor. Preserved original targets/branches; summon pools, status recovery and turn policy remain pending','gowManaBurnTowerAudit']]),
 ['weapon:7412',['Native ManaBurn restored; Burn surviving selected target; lethal hit transforms CASTER, not defeated enemy; Dragon pool exclusions and levels pending','gowManaBurnTowerAudit']],
 ['weapon:7800',['Restored +8 per living enemy Castle-type Tower to all-enemy damage; names do not imply type, ally/dead Towers excluded; odd-Magic rounding pending','gowManaBurnTowerAudit']],
 ['troop:9783',['Restored native Magic+2 random damage (previously fixed 1), own-Gold 10:1 boost calculated before later Gold gain, and display formula; actual casts at Magic/Gold boundaries and two random target indices. Enemy-Gold transfer now has separate gowGoldOwnershipAudit evidence; zero-balance/native GiveGold interpretation is not complete original-rule certification.','gowGoldenThiefDamageAudit']],
 ['troop:8144',['Corrected all-four-stat Gold boost from erroneous 20:3 to English/Chinese 5:1; actual casts at M=0/1/11/20 and Gold boundaries, chosen damage target, direct Life growth and event order. Side-specific Gold model has separate gowGoldOwnershipAudit coverage; native percentage-counter rounding certification remains pending.','gowGoldStatBoostAudit']],
 ['troop:7493',['Restored native six random alternatives: Consume, Fey self-transform, random enemy statuses, explode 10 Gems, one Ally M+10 four-stat growth, M+2 heavy splash. Full casts cover each branch and buff binding; shared devour mechanics, status eligibility and transform levels/pool exclusions are not certified.','gowMongoBranchesAudit']],
 ['troop:8498',['Restored native 3M+3 selected-Ally Attack/Armor/Life gains in native order and full Mana; actual casts at M=0/1/11/20 and same-caster repeat blocking. Cross-unit one-shot, immunities and external-rule certification remain pending.','gowStatGainFormulaAudit']],
 ...[9837,9911,9914,9976,10046,10050].map(id=>[`weapon:${id}`,['Restored native M+1 Attack/Life and matched Ally-type/kingdom Bless filtering; equipped-alias casts at M=0/1/11/20 with live, dead and nonmatching targets. Bless status-rule equivalence remains pending.','gowStatGainFormulaAudit']]),
 ['troop:8957',['Restored missing FrontAlly barrier after eight random gem destructions; native steps and real cast', 'gowMissingNativeClausesAudit']],
 ...[7187,8254,8255,8256,8257,8258,8259,8517,8843,8947].map(id=>[`weapon:${id}`,['Restored missing native steps and branches; English/native snapshot and cast checks', 'gowMissingNativeClausesAudit']]),
 ['troop:8967',['二选一：随机属性削减仅执行一分支，按所选恶魔或亡灵加倍；随机属性池及比例取整仍待核实；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['troop:9401',['二选一：8法力与屏障或其他盟友四属性增益；生命增益上限及比例取整仍待核实；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['troop:9467',['二选一：2恶魔门户或随机爆破后召唤灵狐；满编召唤失效规则已核实；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['troop:9657',['二选一：所选颜色转附魔并祝福该色盟友或转纠缠并诅咒该色敌人；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['troop:9640',['二选一：选定减攻与诅咒或随机减属性与死亡标记；随机属性池仍待核实；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['troop:8863',['二选一：全敌真实伤害或指定狐族猎人召唤；修正随机狐族池和均匀1至3为保底1加两次独立50%；满编召唤规则仍待核实；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['troop:8300',['二选一：创造或摧毁9绿；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['troop:8855',['二选一：摧毁选定列或行；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['troop:8857',['二选一：全队生命或其他盟友半法力；生命增益上限及奇数法力取整仍待核实；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['troop:8858',['二选一：摧毁紫色并命中前两敌或创造12紫并命中后两敌；修复仅命中一敌；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['troop:8860',['二选一：全队加魔法或散射，分支互斥；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['troop:8862',['二选一：真实伤害或溅射，蓝色宝石每颗增强2；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['troop:8867',['二选一：选定伤害或消除护甲；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['troop:8868',['二选一：冰冻宝石与额外回合信号或随机窃甲；回合归属共享规则仍待修复；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['troop:8896',['二选一：伤害后召唤暗影狐狸或自身加5魔法；修复误加法力；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['troop:8898',['二选一：黄色转灵魂或骷髅；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['troop:9366',['二选一：两套转色配对互斥；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['troop:9818',['二选一：前两敌伤害与绿转末日骷髅或后两敌伤害与红转末日骷髅；修复仅命中一敌；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['weapon:8623',['二选一：元素之星与祝福或暗影之星与诅咒；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['weapon:8876',['二选一：绿色转选定色或爆破选定宝石再创造10绿；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['weapon:8951',['二选一：8灵魂宝石与额外回合信号或随机真实伤害；回合归属共享规则仍待修复；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['weapon:9204',['二选一：8蓝色或黄色闪电宝石，后接普通溅射；补齐宝石类型及伤害；含取消施法与独立分支测试','gowPlayerChoiceAudit']],
 ['troop:8856',['Native player choice: three random damage victims OR three random magic reductions; branch cancellation and cast checked','gowPlayerChoiceAudit']],
 ['troop:8859',['Native player choice: enemy-Gold transfer OR random stat theft; CountEnemyGold(1) versus the English amount remains pending','gowPlayerChoiceAudit']],
 ['troop:8897',['Native player choice: purple explosions OR mana burn on first two enemies; cast checked','gowPlayerChoiceAudit']],
 ['troop:9014',['Native player choice: seven blue/green Dragon Gems plus one random Dragon; summon pool pending','gowPlayerChoiceAudit']],
 ['troop:9185',['Native player choice: blue/yellow Lightning Gem and separate extra-turn check; English Blue vs native Yellow counting conflict','gowPlayerChoiceAudit']],
 ['troop:9745',['Native player choice: nine Spirit Gem conversions OR curse and mana burn; target colors and immunity pending','gowPlayerChoiceAudit']],
 ['weapon:8869',['Native player choice: all ally armor OR other ally barrier; native AllAllies vs description other allies conflict','gowPlayerChoiceAudit']],
 ['weapon:7756',['Native armor elimination amount now gains self Life rather than Armor; tested 0/19/150 armor, chosen enemy, current/max Life growth and team submerge','gowWeaponLifeAudit']],
 ['weapon:9386',['Native gem conversion and independent Magic+2 Life gain both cast; extra turn gated by Immortal Virago ally','gowWeaponLifeAudit']],
 ['weapon:9379',['Restored half-Magic+1 Attack after Skull conversion and conditional extra turn; odd-Magic rounding still pending','gowWeaponLifeAudit']],
 ['weapon:9032',['Restored five all-type Gem explosions after true damage and three Booty Gems','gowWeaponLifeAudit']],
 ['weapon:8808',['Native A-B exclusive random branch: create four mixed-tier Gargoyle Gems OR explode Magic+1 random Gems; both cast paths tested','gowWeaponLifeAudit']],
 ['weapon:8879',['Native player choice: last enemy magic OR mana theft followed by one damage hit; native order vs text pending','gowPlayerChoiceAudit']],
 ['troop:8288',['Native 6 sequential random damage steps; repeats after distinct survivors are exhausted','gowMultiTargetDamageAudit']],
 ['troop:8410',['Native 6 random-high-damage steps, including a separate damage roll each wave','gowMultiTargetDamageAudit']],
 ['troop:9377',['Native 5 sequential random true-damage steps; conditional region multiplier still pending','gowMultiTargetDamageAudit']],
 ['troop:9721',['Native 5 sequential random true-damage steps; X-area board effect remains a separate clause','gowMultiTargetDamageAudit']],
 ['troop:7025',['Native FromTarget Life gain, healing and Barrier now all use the same chosen Ally; direct Life modes and real TurnEngine cast checked','gowLifeSemanticsAudit']],
 ['troop:7004',['选择目标而非固定首位','gowSkillConfirmedRepairs']],
 ['troop:7062',['转换颜色后获得魔法＋1灵魂','gowSkillConfirmedRepairs']],
 ['weapon:7492',['StormRandom six-color branch, order of yellow-ally attack/purple-enemy damage/storm overwrite, real weapon cast','gowSunDiskStormAudit']],
 ['weapon:9033',['Goblin race summon restored; source steps, complete roster, field/full-team-no-op/death behavior tested','gowRockstabbaSummonAudit']],
 ['weapon:7129',['补齐创造6颗骷髅','gowSkillConfirmedRepairs']],
 ['weapon:7192',['目标攻击严格较高时，同次命中额外12伤害','gowSkillConfirmedRepairs']],
 ['weapon:9985',['补齐魔法参与减攻及诅咒计数，保持同一目标','gowSkillConfirmedRepairs']],
 ['weapon:7285',['燃烧后使另一名存活敌人疾病','gowMissingWeaponClauses']],
 ['weapon:7753',['伤害前驱散全敌正面状态','gowMissingWeaponClauses']],
 ['weapon:7567',['补齐末位敌人转化成满法力幼龙；转化等级/免疫尚待核实','gowMissingWeaponClauses']],
 ['weapon:8805',['爆破选定列，按爆破前红棕计数造石像鬼宝石','gowColumnSnapshotAudit']],
 ['weapon:8988',['爆破选定列，按爆破前骷髅紫色计数造死亡标记宝石','gowColumnSnapshotAudit']],
 ['weapon:7074',['官方9.4＋英文/native：前两名敌人各魔法＋3伤害；移除旧红宝石清除段，真实双向施法及费用/目标/护甲/死亡/屏障/织网已测；共享回合和其它状态规则仍待验','gowFirstTwoWeaponAudit']],
 ['weapon:7089',['官方9.4＋英文/native：前两名敌人各魔法＋5伤害；移除旧红宝石清除段，真实双向施法及费用/目标/护甲/死亡/屏障/织网已测；共享回合和其它状态规则仍待验','gowFirstTwoWeaponAudit']],
 ['weapon:7585',['英雄之剑改为随机敌人，同步显示文案','gowSimpleDamageAudit']],
 ['weapon:8450',['补齐攻击严格较高时20%处决原目标；免疫交互尚待核实','gowOmittedClausesAudit']],
 ['troop:9725',['恢复两次独立50%/25%追加爆破及首敌半魔法＋4伤害；奇数魔法取整尚待核实','gowOmittedClausesAudit']],
];
// Multiple independent repair scopes may share a spell ID. Keep every entry;
// a Map constructor previously discarded earlier Mana Burn evidence for choice spells.
const repairs=new Map();
for(const [key,entry] of repairEntries){const scopes=repairs.get(key)??[];scopes.push(entry);repairs.set(key,scopes);}
export function attachScopedEvidence(rows,receipt=null){
 const passing=new Set(receipt?.suites?.filter(s=>s.status==='passed').map(s=>s.path)??[]);
 for(const row of rows){
  row.repairHistory=[];row.scopedChecks=[];
  if(row.status==='custom-excluded')continue;
  function add(scope,test,repair=false){
   const testPath=suite(test);const evidence={scope,testPath,status:passing.has(testPath)?'tested-pass':'tests-not-attested-for-current-fingerprint',wholeSkillAccepted:false};
   row.scopedChecks.push(evidence);
   if(repair)row.repairHistory.push({date:'2026-09-26',...evidence});
  }
  add('原始技能ID和法力费用；不覆盖颜色、技能全文或隐藏规则','gowNativeSourceAudit');
  for(const repair of repairs.get(`${row.kind}:${row.spellId}`)??[])add(repair[0],repair[1],true);
  if ((row.kind === 'troop' && [7505,8087,8141,8568,8859,8904,9189,9783].includes(row.spellId)) || (row.kind === 'weapon' && row.spellId === 8073)) {
    add('Side-owned Gold gain/spend/counts and enemy-available transfer; both-side real casts, zero/insufficient balances, actual theft tracking, and Golden Gun combined ratio. Restored 8087 debit/damage/credit and 9189 damage/Bleed/theft order. Native CountEnemyGold(1), fixed GiveGold zero-balance interpretation, native fractional counters, caps, and unrelated clauses remain pending.', 'gowGoldOwnershipAudit', true);
    if (row.kind === 'weapon') add('Golden Gun bothGold boost survives regeneration and equipped alias matches', 'gowRegenerationAudit');
  }
  if(row.kind==='troop'&&[7334,7335,7725].includes(row.entityId))add('依据英文及原始步骤快照修复费用，并保留中文快照原始值','gowNativeSourceAudit',true);
  if(sourceMultiTargetSegments(row).length) add('Source-text multi-target count and damage events; repeats allowed only for native sequential random waves; remaining clauses pending','gowMultiTargetDamageAudit');
  if(row.spellId===8305) add('Last enemy hit guaranteed; penultimate enemy only on separate 50% roll; never duplicates a lone defender','gowMultiTargetDamageAudit',true);
  if(row.kind==='weapon'&&perAllyMixSpec(row.source.englishDescription??''))add('修复每盟友6颗误加固定6颗；验证0/1/4盟友及阵亡/敌方计数排除','gowPerAllyMixAudit',true);
  if(/^Deal \[Magic(?: \+ (\d+))?\] (true )?damage to (an? Enemy|the first Enemy|the last Enemy|a random Enemy|all Enemies)\.$/.test(row.source.englishDescription??''))add('完整简单伤害文本：M=0/1/11/20，护甲0/10；仅普通状态下的目标、伤害与护甲结算','gowSimpleDamageAudit');
  const flatLife = ss => ss.flatMap(s => ['choose','oneOf'].includes(s.kind) ? s.options.flatMap(flatLife) : [s]);
  const lifeBuffs = flatLife(row.runtime?.prototype?.segments ?? []).filter(s => s.kind === 'buff' && s.stat === 'hp');
  const lifeModes = nativeLifeModes(row.source.native, lifeBuffs.length, row.spellId);
  if (lifeModes?.length) add('Direct hp-buff source modes and isolated current/max Life behavior at full and injured Life. Only listed representative IDs have whole real casts; amounts, targets, boosts, branches and Heal status modifiers remain separate pending dimensions.', 'gowLifeSemanticsAudit', lifeModes.includes('gain'));
  if(row.repairHistory.length&&row.kind==='weapon'&&(!lifeModes?.length||repairs.has(`${row.kind}:${row.spellId}`)))add('生成器重建原型与最终注册原型一致','gowRegenerationAudit');
 }
 return {
  repairedEntities:rows.filter(r=>r.repairHistory.length).length,
  nativeIdentityCostTested:rows.filter(r=>r.scopedChecks.some(c=>c.testPath===suite('gowNativeSourceAudit')&&c.status==='tested-pass')).length,
  behavioralScopeTestedEntities:rows.filter(r=>r.scopedChecks.some(c=>!['gowNativeSourceAudit','gowRegenerationAudit'].some(n=>c.testPath===suite(n))&&c.status==='tested-pass')).length,
  testReceipt:receipt?{fingerprint:receipt.fingerprint,passed:receipt.passed,failed:receipt.failed,typecheckExitCode:receipt.typecheckExitCode}:null,
 };
}
