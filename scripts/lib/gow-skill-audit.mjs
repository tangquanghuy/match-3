import { nativeLifeModes } from './gow-life-oracle.mjs';
import { indexNativeSpells } from './gow-native-source.mjs';
/** Pure audit model. No execution smoke test or parser fidelity flag constitutes acceptance. */
export const AUDIT_DIMENSIONS = [
  'identity-cost-colors', 'target-count-range', 'base-formula-rounding',
  'boost-source-ratio-cap', 'conditions-probabilities-branches',
  'status-duration-immunity', 'gems-types-selection-resolution',
  'summon-transform-pools', 'order-death-retargeting',
  'mana-economy-extra-turn', 'display-description', 'battle-pipeline',
];
export const flattenSegments = (segments = []) => segments.flatMap(s =>
  ['oneOf', 'choose'].includes(s.kind) ? [s, ...s.options.flatMap(flattenSegments)] : [s]);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = a => [...a].sort();
const byId = rows => new Map(rows.map(r => [Number(r.id ?? r.Id), r]));

/** Manually inspected snapshot clauses. Re-evaluate the narrow discrepancy on each run.
 * A detector becoming false means NEEDS RE-REVIEW, not an automatic full pass.
 */
export function inspectKnownDiscrepancies(kind, spellId, original, prototype, native) {
  if (!original || !prototype) return [];
  const ss = flattenSegments(prototype.segments);
  const text = original.stats?.spell?.desc ?? '';
  const out = [];
  const check = (id, sourceGuard, differs, expected, actual, dimension) => {
    if (sourceGuard && differs) out.push({ id, status: 'snapshot-confirmed-difference', dimension,
      expected, actual, basis: 'Independent stored English/native snapshot versus final registered prototype. Not live official certification.' });
  };
  // Both English and native snapshots match official 9.4's explicit first-two/no-red-removal changes.
  if(kind==='weapon'&&[7074,7089].includes(spellId)){
    const base=spellId===7074?3:5;
    const expectedText=`Deal [Magic + ${base}] damage to the first 2 Enemies.`;
    const steps=native?.SpellSteps??[];
    const guard=text===expectedText&&steps.length===1&&steps[0].Type==='Damage'&&steps[0].Target==='FirstTwoEnemies'&&steps[0].Amount===base&&steps[0].SpellPowerMultiplier===1;
    check(`native-first-two-no-red-removal-${spellId}`,guard,
      ss.length!==1||ss[0].kind!=='damage'||ss[0].target!=='enemyFirstN'||ss[0].n!==2||ss[0].scaling?.base!==base||ss[0].scaling?.mult!==1,
      `Deal Magic+${base} normal damage to each of the first two living enemies; no gem removal or boost.`,
      JSON.stringify(prototype), 'target-count-range');
  }
  if (kind === 'troop' && spellId === 7004) check('musketeer-selected-target', /damage to an Enemy\./.test(text),
    ss.some(s => s.kind === 'damage' && s.target === 'enemyFront'),
    '选择一名敌人造成伤害。', '最高优先级手写覆盖固定攻击首位。', 'target-count-range');
  if (kind === 'troop' && spellId === 7062) check('valkyrie-souls', /Gain \[Magic \+ 1\] Soul/.test(text),
    !ss.some(s => s.kind === 'gainEconomy'),
    '颜色转换后获得［魔法＋1］灵魂。', '最终原型仅含颜色转换，没有资源获得段。', 'mana-economy-extra-turn');
  check('player-choice-flattened', native?.Randomize?.startsWith('Choose:'),
    !prototype.segments.some(s => s.kind === 'choose'),
    '按原版Choose规则由施法者选一个分支，只执行所选效果。',
    '最终注册原型没有玩家选择分支；现有段落按顺序执行。', 'conditions-probabilities-branches');
  // Independent snapshot text contradicts original machine steps. Keep these visible
  // after fixing player-choice behavior; neither side can be silently certified.
  if (spellId === 9185) check('lightning-extra-turn-source-conflict',
    /for each Blue Gem on the Board/.test(text),
    native?.SpellSteps?.filter(s => s.Type === 'CountGems').some(s => s.Color1 === 'Yellow'),
    'English source describes Blue Gems for both extra-turn branches.',
    'Both native CountGems steps specify Yellow; runtime currently follows native steps.',
    'conditions-probabilities-branches');
  if (spellId === 8859) check('steal-gold-enemy-pool-unimplemented',
    native?.SpellSteps?.some(s => s.Type === 'CountEnemyGold'),
    ss.some(s => s.kind === 'gainEconomy' && s.currency === 'gold') &&
      !ss.some(s => s.kind === 'stealGold'),
    'Native source counts and takes enemy Gold before awarding the caster Gold.',
    'Runtime grants Magic+1 Gold without reading or reducing enemy Gold.',
    'mana-economy-extra-turn');
  if (kind === 'weapon' && spellId === 8869) check('barrier-target-source-conflict',
    /Barrier all other Allies/.test(text),
    native?.SpellSteps?.some(s => s.Type === 'CauseBarrier' && s.Target === 'AllAllies'),
    'English source describes only other Allies.',
    'Native CauseBarrier targets AllAllies; runtime currently follows description.',
    'target-count-range');
  // A source IncreaseHealth may be folded into a drain's gainStat=hp, or be an explicit hp buff.
  // Neither an armor buff nor an omitted second half of a compound gem sentence qualifies.
  check('native-life-gain-absent-or-misdirected',
    native?.SpellSteps?.some(s => s.Type === 'IncreaseHealth'),
    !ss.some(s => (s.kind === 'buff' && s.stat === 'hp') || (s.kind === 'reduce' && s.gainStat === 'hp')),
    'Native IncreaseHealth grants Life to the stated recipient.',
    'No Life-gaining segment in the final registered prototype.',
    'base-formula-rounding');
  if (kind === 'weapon' && spellId === 9379) check('ossifer-attack-omitted',
    native?.SpellSteps?.some(s => s.Type === 'IncreaseAttack'),
    !ss.some(s => s.kind === 'buff' && s.stat === 'attack'),
    'After converting Skulls, grant [(Magic / 2) + 1] Attack.',
    'No Attack increase in final prototype.', 'base-formula-rounding');
  if (kind === 'weapon' && spellId === 9032) check('booty-explosion-omitted',
    native?.SpellSteps?.some(s => s.Type === 'ExplodeGems' && s.Amount === 5),
    !ss.some(s => s.kind === 'gem' && s.params?.mode === 'explode'),
    'After damage and creation, explode five random Gems.',
    'No explosion in final prototype.', 'gems-types-selection-resolution');
  if (kind === 'weapon' && spellId === 8808) {
    check('gargoyle-either-branch-omitted', native?.Randomize === 'A-B' && native?.SpellSteps?.some(s => s.Type === 'ExplodeGems'),
      !prototype.segments.some(s => s.kind === 'oneOf' && s.options?.length === 2),
      'One random branch: mixed Gargoyle gems OR Magic+1 random Gem explosions.',
      'Final prototype does not model both exclusive native branches.', 'conditions-probabilities-branches');
  }
  // Native five/six-step random damage must declare sequential waves: the
  // default enemyRandomN selector is capped by the number of survivors.
  const repeatCount = Number(/\b([56]) random enemies\b/i.exec(text)?.[1] ?? 0);
  const nativeRandomShots = native?.SpellSteps?.filter(s => /Damage|StealLife/.test(s.Type ?? '')
    && /Random.*Enemy/.test(s.Target ?? '')).length ?? 0;
  if (repeatCount >= 5) check(`random-repeat-${spellId}`,
    nativeRandomShots >= repeatCount,
    !ss.some(s => s.kind === 'damage' && s.target === 'enemyRandomN' && s.n >= repeatCount && s.randomWaves === repeatCount),
    `Native source executes ${repeatCount} random damage steps; check repeat hits when fewer targets remain.`,
    'No damage segment models all source steps with a sequential random wave count.',
    'target-count-range');
  // Cross-roster native SummoningType is an explicit troop summon (not a Storm).
  // Treat an absent final summon segment as a confirmed missing clause regardless
  // of English localization or compiler fidelity; never auto-accept on presence.
  // Native action steps that cannot be satisfied by an unrelated segment.
  // Flatten conditional options before checking so a valid branch counts as present;
  // presence alone is never full-rule acceptance (targets/order/branches still pending).
  for (const [nativeType, segmentKind, dimension] of [
    ['ExtraTurn', 'extraTurn', 'mana-economy-extra-turn'],
    ['Cleanse', 'cleanse', 'status-duration-immunity'],
    ['CauseBarrier', 'status', 'status-duration-immunity'],
  ]) {
    if (native?.SpellSteps?.some(step => step.Type === nativeType))
      check(`native-${nativeType.toLowerCase()}-absent-${spellId}`, true,
        !ss.some(segment => segment.kind === segmentKind && (nativeType !== 'CauseBarrier' || segment.statusId === 'barrier')),
        `Native ${nativeType} step requires a ${segmentKind} effect.`,
        `Final registered prototype has no ${segmentKind} segment.`, dimension);
  }
  if (native?.SpellSteps?.some(step => step.Type === 'SummoningType'))
    check(`native-summoning-type-${spellId}`, true,
      !ss.some(segment => segment.kind === 'summon'),
      'Native SummoningType creates a troop of the specified race.',
      'Final registered prototype has no troop-summon segment.',
      'summon-transform-pools');
  const lifeBuffs = ss.filter(s => s.kind === 'buff' && s.stat === 'hp');
  const lifeModes = nativeLifeModes(native, lifeBuffs.length, spellId);
  if (lifeModes?.length) check(`native-life-mode-${spellId}`, true,
    lifeBuffs.some((s, i) => s.lifeMode !== lifeModes[i]),
    `Direct Life modes in depth-first order: ${lifeModes.join(', ')}. IncreaseHealth/IncreaseAllStats grows current and maximum Life; Heal restores current Life only.`,
    `Runtime modes: ${lifeBuffs.map(s => s.lifeMode ?? 'legacy-capped-heal').join(', ')}.`,
    'base-formula-rounding');
  if (spellId === 7025) check('dryad-heal-selected-ally', native?.SpellSteps?.some(s => s.Type === 'Heal' && s.Target === 'FromTarget'),
    lifeBuffs[1]?.target !== 'allyChosen', 'Heal the same selected Ally as IncreaseHealth.', 'Heal targets self instead of the selected Ally.', 'target-count-range');
  if (kind === 'troop' && spellId === 8144) {
    const gains = ss.filter(s => s.kind === 'buff');
    check('treasure-king-gold-boost-ratio', /Gain 3 to all Skills, boosted by my Gold\. \[5:1\]/.test(text),
      gains.length !== 4 || gains.some(s => s.scaling?.base !== 3 || s.scaling?.mult !== 0 ||
        s.modifier?.source?.kind !== 'battleGold' || s.modifier?.mod?.kind !== 'ratio' || s.modifier.mod.a !== 5 || s.modifier.mod.b !== 1),
      'All four Skills gain 3 + floor(my Gold / 5), per English and Chinese [5:1].',
      `Runtime gains: ${JSON.stringify(gains.map(s => ({stat:s.stat,scaling:s.scaling,modifier:s.modifier})))}.`, 'boost-source-ratio-cap');
  }
  if (spellId === 9783) check('golden-thief-damage-formula',
    native?.SpellSteps?.some(s => s.Type === 'Damage' && s.Amount === 2 && s.SpellPowerMultiplier === 1),
    !ss.some(s => s.kind === 'damage' && s.target === 'enemyRandom' && s.scaling?.base === 2 && s.scaling?.mult === 1),
    'Deal Magic+2 damage to one random Enemy before stealing Gold.',
    `Runtime damage: ${JSON.stringify(ss.filter(s => s.kind === 'damage'))}.`, 'base-formula-rounding');
  if (spellId === 9783) check('golden-thief-gold-theft-absent', native?.SpellSteps?.some(s => s.Type === 'TakeEnemyGold'),
    !ss.some(s => s.kind === 'stealGold'), 'Take 5 enemy Gold then grant 5 Gold.',
    'Runtime grants 5 Gold without reducing the enemy pool.', 'mana-economy-extra-turn');
  if (kind === 'weapon' && spellId === 8073) check('golden-gun-enemy-gold-boost-absent',
    native?.SpellSteps?.some(s => s.Type === 'CountEnemyGold') && /my Gold and the Enemy.s Gold/.test(text),
    !ss.some(s => [s.modifier,...(s.modifiers ?? [])].some(m => ['enemyGold','bothGold'].includes(m?.source?.kind))),
    'Damage boosts include both caster Gold and enemy Gold at [2:1].',
    'Only one shared battleGold modifier exists; no enemy Gold source.', 'boost-source-ratio-cap');
  if (kind === 'troop' && spellId === 7493 && native?.Randomize === 'A-B-C-D-E-F') {
    const options = prototype.segments.find(s => s.kind === 'oneOf')?.options ?? [];
    const expectedTypes = ['Consume','TransformType','RandomStatusEffect','ExplodeGems','IncreaseAllStats','SplashHeavyDamage'];
    const guards = [
      o => o?.length === 1 && o[0].kind === 'devour' && o[0].target === 'enemyRandom' && o[0].chance === 1,
      o => o?.length === 1 && o[0].kind === 'transformTroop' && o[0].target === 'allySelf' && !!o[0].randomOf?.length,
      o => o?.length === 1 && o[0].kind === 'randomStatus' && o[0].target === 'enemyAll',
      o => o?.length === 1 && o[0].kind === 'gem' && o[0].params?.op === 'clear' && o[0].params?.mode === 'explode' && o[0].params?.target?.kind === 'randomGems' && o[0].params?.target?.count?.base === 10 && o[0].params?.target?.count?.mult === 0,
      o => o?.length === 4 && equal(o.map(s => s.stat),['attack','armor','hp','magic']) &&
        o.every((s,i) => s.kind === 'buff' && s.target === (i ? 'lastTarget':'allyRandom') && s.scaling?.base === 10 && s.scaling?.mult === 1),
      o => o?.length === 1 && o[0].kind === 'damage' && o[0].target === 'enemyRandom' && o[0].range === 'splash' &&
        o[0].splashRatio === 0.75 && o[0].scaling?.base === 2 && o[0].scaling?.mult === 1,
    ];
    check('mongo-random-branch-count', native.SpellSteps?.length === 6, options.length !== 6,
      'Six exclusive native random branches.', `${options.length} branches.`, 'conditions-probabilities-branches');
    guards.forEach((guard,i) => check(`mongo-native-branch-${i+1}`, native.SpellSteps?.[i]?.Type === expectedTypes[i],
      !guard(options[i]), `Native branch ${i+1}: ${expectedTypes[i]}.`, JSON.stringify(options[i] ?? null),
      i === 1 ? 'summon-transform-pools' : i === 3 ? 'gems-types-selection-resolution' : i === 4 || i === 5 ? 'base-formula-rounding' : 'conditions-probabilities-branches'));
  }
  // Source-guarded checks for seven previously lost gain formulae. Not full acceptance.
  const gainFormulaIds = [8498, 9837, 9911, 9914, 9976, 10046, 10050];
  if (gainFormulaIds.includes(spellId)) {
    const nativeGains = (native?.SpellSteps ?? []).filter(s => ['IncreaseAttack','IncreaseArmor','IncreaseHealth'].includes(s.Type));
    const statByType = {IncreaseAttack:'attack', IncreaseArmor:'armor', IncreaseHealth:'hp'};
    for (const step of nativeGains) {
      const stat = statByType[step.Type];
      const seg = ss.find(s => s.kind === 'buff' && s.stat === stat);
      check(`native-gain-formula-${spellId}-${stat}`, true,
        !seg || seg.scaling?.base !== step.Amount || seg.scaling?.mult !== step.SpellPowerMultiplier,
        `${step.Type}: ${step.SpellPowerMultiplier}*Magic+${step.Amount}.`,
        `Runtime ${stat}: ${JSON.stringify(seg?.scaling ?? null)}.`, 'base-formula-rounding');
    }
    if (spellId !== 8498) {
      const bless = ss.find(s => s.kind === 'status' && s.statusId === 'blessed');
      check(`native-gain-bless-${spellId}`, native?.SpellSteps?.some(s => s.Type === 'CauseBlessed'),
        !bless, 'Bless the same eligible Allies after both stat gains.', 'Bless segment missing.', 'status-duration-immunity');
      const race = {9837:'Undead',9976:'Mystic',10046:'Construct'}[spellId];
      if (race) for (const seg of ss.filter(s => s.kind === 'buff' || (s.kind === 'status' && s.statusId === 'blessed'))) {
        check(`native-gain-race-${spellId}-${seg.stat ?? 'blessed'}`,
          native?.SpellSteps?.some(s => s.Target === 'AllyType'),
          seg.target !== 'allyAll' || seg.targetRace !== race,
          `Only living ${race} Allies, including Bless.`,
          `Runtime target ${seg.target}, race ${seg.targetRace ?? '(unfiltered)'}.`, 'target-count-range');
      }
    }
    if ([9911,9914,10050].includes(spellId)) {
      const kingdom = {9911:'黑石',9914:'沃尔帕克',10050:'聚沙之地'}[spellId];
      for (const seg of ss.filter(s => s.kind === 'buff' || (s.kind === 'status' && s.statusId === 'blessed'))) {
        check(`native-gain-kingdom-${spellId}-${seg.stat ?? 'blessed'}`,
          native?.SpellSteps?.some(s => s.Target === 'AllyKingdom'),
          seg.target !== 'allyAll' || seg.targetKingdom !== kingdom,
          `Only living Allies of ${kingdom}, including Bless.`,
          `Runtime target ${seg.target}, kingdom ${seg.targetKingdom ?? '(unfiltered)'}.`, 'target-count-range');
      }
    }
    if (spellId === 8498) check('chosen-gods-native-stat-order', nativeGains.length === 3,
      !equal(ss.filter(s => s.kind === 'buff').map(s => s.stat), ['attack','armor','hp','mana']),
      'Native order: Attack, Armor, Life, full Mana, disable own spell.',
      `Runtime buff order: ${ss.filter(s => s.kind === 'buff').map(s => s.stat).join(',')}.`, 'order-death-retargeting');
  }
  if (kind !== 'weapon') return out;
  if (spellId === 7129) check('skull-of-nysha-skulls', /Create 6 Skulls/.test(text),
    !ss.some(s => s.kind === 'gem'), '创造6颗骷髅，再召唤亡魂。', '只有召唤段，缺少创造骷髅。', 'gems-types-selection-resolution');
  if (spellId === 7192) check('kingslayer-conditional-damage', /12 more damage/.test(text),
    ss.length === 1 && ss[0].kind === 'damage' && !ss[0].condBonus && !ss[0].condMult && !ss[0].modifier && !ss[0].ifCond,
    '敌方攻击力较高时额外造成12点伤害。', '只有无条件［魔法＋4］伤害。', 'conditions-probabilities-branches');
  if (spellId === 7285) check('burning-scythe-disease', /Disease another/.test(text),
    !ss.some(s => s.statusId === 'disease'), '使另一名敌人陷入疾病。', '只有群伤和随机燃烧段，缺疾病。', 'status-duration-immunity');
  if (spellId === 7492) check('sun-disk-storm', /summon a random Storm/i.test(text),
    !ss.some(s => s.kind === 'storm'), '最后召唤随机风暴。', '只有加攻击和伤害，缺风暴。', 'gems-types-selection-resolution');
  if (spellId === 7567) check('dragons-eye-transform', /Transform the last Enemy/.test(text),
    !ss.some(s => s.kind === 'transformTroop'), '将末位敌人转化成满法力幼龙。', '只有摧毁宝石段，缺转化。', 'summon-transform-pools');
  if (spellId === 7753) check('tricksters-shot-dispel', /Dispel all Enemies/.test(text),
    !ss.some(s => s.kind === 'dispel'), '先驱散所有敌人的正面效果。', '仅伤害和攻击力减半，缺驱散。', 'status-duration-immunity');
  if (spellId === 9204) {
    check('stormgard-hammer-damage', native?.SpellSteps?.some(s => s.Type === 'SplashHighDamage'),
      !ss.some(s => s.kind === 'damage'), '施放所选分支的［魔法＋3］普通溅射。', '最终原型没有伤害段。', 'base-formula-rounding');
    check('stormgard-hammer-lightning', native?.SpellSteps?.some(s => s.Color1 === 'LightningBlue'),
      ss.length === 2 && ss.every(s => s.kind === 'gem' && s.params?.gem?.kind === 'color'),
      '创造对应颜色的闪电宝石。', '创造普通蓝、黄宝石。', 'gems-types-selection-resolution');
    check('stormgard-hammer-choice', native?.Randomize === 'Choose:ABC-DEF',
      !prototype.segments.some(s => s.kind === 'choose'),
      '玩家从蓝色/黄色两个分支中选择一个。', '两个创造段依次执行。', 'conditions-probabilities-branches');
  }
  if ([8805, 8988].includes(spellId)) {
    check(`column-explode-${spellId}`, native?.SpellSteps?.some(s => s.Type === 'ExplodeGems' && s.BoardTarget === 'Column'),
      ss.some(s => s.kind === 'gem' && s.params?.mode === 'destroy' && s.params?.target?.kind === 'chosenLine'),
      '爆破所选列。', '使用摧毁列，而非爆破列。', 'gems-types-selection-resolution');
    check(`column-created-gems-${spellId}`, /Create .*Gem for each/.test(text),
      !ss.some(s => s.kind === 'gem' && s.params?.op === 'create'),
      spellId === 8805 ? '按所选列的红/棕宝石数创造石像鬼宝石。' : '按所选列的骷髅/紫宝石数创造死亡标记宝石。',
      '仅清除列，缺计数后的创造段。', 'gems-types-selection-resolution');
  }
  if (spellId === 9985) check('byblios-magic-coefficient', native?.SpellSteps?.some(s => s.Type === 'DecreaseAttack' && s.SpellPowerMultiplier === 1),
    ss.some(s => s.kind === 'reduce' && s.stat === 'attack' && s.scaling?.mult === 0),
    '攻击削减的基础公式包含［魔法＋1］。', '攻击削减的魔法系数为0。', 'base-formula-rounding');
  return out;
}

/** Heuristics only: absence or extra words may be encoded by other primitives/branches. */
export function scanCandidates(original, prototype, metadata, isOverride) {
  const text = original?.stats?.spell?.desc ?? '';
  const ss = flattenSegments(prototype?.segments);
  const candidates = [];
  if (metadata?.fidelity && metadata.fidelity !== 'full') candidates.push({ code: 'partial-metadata',
    note: '编译登记存在省略；需区分真实遗漏、过期登记和排除条款。', clauses: metadata.skippedClauses ?? [] });
  if (isOverride) candidates.push({ code: 'priority-override', note: '最高优先级手写覆盖；应检查最终原型，不只看批次。' });
  if (/Deal\b[^.]*damage/i.test(text) && !ss.some(s => ['damage', 'sacrifice', 'devour'].includes(s.kind)))
    candidates.push({ code: 'damage-segment-absent', note: '原文提到伤害，最终原型未见常见伤害段；需查专用实现。' });
  if (/extra turn/i.test(text) && !ss.some(s => s.kind === 'extraTurn'))
    candidates.push({ code: 'extra-turn-segment-absent', note: '原文提到额外回合，未见独立额外回合段。' });
  if (/\b(?:chance|random|if|boosted|another|instead|or)\b/i.test(text))
    candidates.push({ code: 'branch-boundary-review', note: '含随机/条件/增强/目标切换，需逐分支及边界用例。' });
  if (/(?:ascension|ascended)/i.test(text)) candidates.push({ code: 'exclusion-candidate-ascension', note: '逐条标记晋升相关子句；保留其余效果验收。' });
  if (/tempering/i.test(text)) candidates.push({ code: 'tempering-scope-review', note: '淬炼不自动视同晋升排除；基础效果照常验收。' });
  return candidates;
}

export function buildAuditRows({ troops, weapons, prototypes, communityIds, overrides = [],
  originalTroops, originalWeapons, nativeSpells, weaponMetadata }) {
  const sourceTroops = byId(originalTroops), sourceWeapons = byId(originalWeapons);
  const custom = new Set(communityIds), overrideSet = new Set(overrides.map(Number));
  const nativeMap = indexNativeSpells(nativeSpells);
  const rows = [];
  for (const [kind, entities, sources] of [['troop', troops, sourceTroops], ['weapon', weapons, sourceWeapons]]) {
    for (const entity of entities) {
      const isCustom = kind === 'troop' && custom.has(entity.id);
      const original = sources.get(entity.id) ?? null;
      const spellId = entity.spell.id;
      const bindingKey = kind === 'weapon' ? `gw_${entity.referenceName}` : String(spellId);
      const prototype = prototypes[bindingKey] ?? null;
      const nativeEntry = nativeMap.get(original?.stats?.spell?.id);
      const native = nativeEntry?.raw ?? null;
      const metadata = kind === 'weapon' ? weaponMetadata[spellId] ?? null : null;
      const issues = isCustom ? [] : inspectKnownDiscrepancies(kind, spellId, original, prototype, native);
      const sourceColors = original?._ManaColors_parsed ? sorted(Object.entries(original._ManaColors_parsed)
        .filter(([, v]) => v).map(([k]) => k.replace(/^Color/, ''))) : null;
      const checks = {
        binding: !!prototype,
        spellId: original ? original.stats?.spell?.id === spellId : null,
        manaCost: original ? (original.ManaCost ?? original.stats?.mana_cost) === entity.manaCost : null,
        manaColors: sourceColors ? equal(sourceColors, sorted(entity.manaColors)) : null,
        numericAndEquippedAlias: kind === 'weapon' ? equal(prototype, prototypes[String(spellId)] ?? null) && !!prototype : null,
      };
      const sourceEnglish = original?.stats?.spell?.desc ?? null;
      const candidates = isCustom ? [] : scanCandidates(original, prototype, metadata, overrideSet.has(spellId));
      // Official 9.4 patch lists Sword of Heroes at 5 mana; the extracted
      // September weapon snapshot and our installed runtime both say 6.
      // Treat this as version/source conflict, not an auto-approved cost repair.
      if (kind === 'weapon' && spellId === 7585 && entity.manaCost !== 5)
        candidates.push({ code: 'official-9-4-mana-cost-conflict',
          note: 'Official 9.4 patch: Sword of Heroes 4 -> 5 mana; stored extracted source/runtime: 6. Verify current original client before resolution. Source: artifacts/gow-skill-audit/gold-primary-sources/update-9-4-patch-notes.html' });
      if (Object.values(checks).some(v => v === false)) candidates.push({ code: 'identity-or-binding-mismatch', note: '身份/费用/颜色/注册路径检查有差异；复核版本和实际出战组装。' });
      const sourceStatus = isCustom ? 'custom' : !original || !sourceEnglish ? 'missing-source' : native ? 'native-and-english-snapshot' : 'english-snapshot-only';
      const status = isCustom ? 'custom-excluded' : issues.length ? 'differences-confirmed' : sourceStatus === 'missing-source' ? 'source-missing' : 'pending-review';
      const sourceClauses = sourceEnglish?.split(/\s*&&\s*|(?<=[.!?])\s+/).filter(Boolean).map((text, i) => ({
        id: `c${i + 1}`, text, review: 'pending', exclusion: null,
      })) ?? [];
      rows.push({ key: `${kind}:${entity.id}`, kind, entityId: entity.id, name: entity.name,
        referenceName: entity.referenceName, spellId, spellName: entity.spell.name, bindingKey,
        status, sourceStatus, source: { entityPath: kind === 'troop' ? 'data/raw/troops.gow.en.json' : 'artifacts/gowhead-weapons/weapons.json',
          englishName: original?.name_localized ?? null, englishDescription: sourceEnglish,
          nativePath: native ? 'data/raw/spells.gow.en.json' : null, nativeField: nativeEntry?.field ?? null, native, authority: isCustom ? 'project-original' : 'third-party-extracted-version-snapshot',
          liveOfficialVerification: 'pending' },
        runtime: { manaCost: entity.manaCost, manaColors: entity.manaColors, description: entity.spell.description, prototype },
        bindingChecks: checks, compilerMetadata: metadata, sourceClauses,
        dimensions: Object.fromEntries(AUDIT_DIMENSIONS.map(d => [d, isCustom ? 'out-of-original-scope' : 'pending'])),
        confirmedDifferences: issues, candidates,
        evidence: [], acceptance: { accepted: false, tests: [], reviewer: null },
      });
    }
  }
  const keys = rows.map(r => r.key);
  if (new Set(keys).size !== keys.length) throw new Error('Duplicate entity audit keys');
  return rows;
}

export function summarizeAudit(rows) {
  const original = rows.filter(r => r.status !== 'custom-excluded');
  const count = status => rows.filter(r => r.status === status).length;
  return {
    totalEntities: rows.length, originalEntities: original.length,
    originalTroops: original.filter(r => r.kind === 'troop').length,
    weapons: original.filter(r => r.kind === 'weapon').length, customExcluded: count('custom-excluded'),
    nativeSourceEntities: original.filter(r => r.sourceStatus === 'native-and-english-snapshot').length,
    englishOnlyEntities: original.filter(r => r.sourceStatus === 'english-snapshot-only').length,
    sourceMissing: count('source-missing'), confirmedDifferenceEntities: count('differences-confirmed'),
    confirmedDifferenceClauses: original.reduce((n, r) => n + r.confirmedDifferences.length, 0),
    pendingReview: count('pending-review'), metadataPartialWeapons: original.filter(r => r.compilerMetadata?.fidelity === 'partial').length,
    candidates: original.reduce((n, r) => n + r.candidates.length, 0),
    accepted: original.filter(r => r.acceptance.accepted).length,
    complete: original.length > 0 && original.every(r => r.acceptance.accepted),
  };
}
