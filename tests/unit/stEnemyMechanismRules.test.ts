import { describe, expect, it } from 'vitest';
import { BaseColor } from '../../src/engine/types';
import { createGems } from '../../src/engine/skills/builders';
import type { Condition, ModifierSpec } from '../../src/engine/skills/effects/secondary';
import type { GemParams } from '../../src/engine/skills/effects/gems';
import type { DamageSegment, EffectSegment, SkillPrototype } from '../../src/engine/skills/prototypes';
import type { TraitDefinition } from '../../src/engine/traits';
import { inspectEnemyMechanisms } from '../../src/sillytavern/enemyMechanismRules';
import type { EnemyMechanismInspection, EnemyMechanismUnknownDetail } from '../../src/sillytavern/enemyMechanismRules';

const scaling = { base: 3, mult: 0 };
const damage = (overrides: Partial<DamageSegment> = {}): DamageSegment => ({
  kind: 'damage', target: 'enemyFront', scaling, ...overrides,
});
const modifier = (kind: 'lastDamage' | 'lastReduce'): ModifierSpec => ({
  mod: { kind: 'multiplier', a: 1 }, source: { kind },
});
const trait = (fields: Partial<TraitDefinition>): TraitDefinition => ({
  code: 'fixture', name: 'Fixture', description: 'Presentation only', ...fields,
});

// Sort only the expectations: the public API must itself sort and deduplicate all four lists.
function expectClassification(actual: EnemyMechanismInspection, expected: Partial<EnemyMechanismInspection>) {
  const { unknownDetails, ...legacy } = actual;
  expect(legacy).toEqual({
    families: [...(expected.families ?? [])].sort(),
    targets: [...(expected.targets ?? [])].sort(),
    dependencies: [...(expected.dependencies ?? [])].sort(),
    unknown: [...(expected.unknown ?? [])].sort(),
  });
  expect(unknownDetails.map(item => item.detail)).toEqual(actual.unknown);
  if (expected.unknownDetails) expect(unknownDetails).toEqual([...expected.unknownDetails].sort((a, b) =>
    a.detail === b.detail ? 0 : a.detail < b.detail ? -1 : 1));
}

describe('inspectEnemyMechanisms representative classification rules', () => {
  it('does not derive mechanisms from trait identities or descriptions', () => {
    expectClassification(inspectEnemyMechanisms({ segments: [] }, [trait({
      code: 'summon', name: 'damage', description: 'choose gems and heal all allies', troops: 99,
    })]), {});
  });

  it('classifies ordered damage, healing and reduction with lastDamage/lastReduce consumers', () => {
    const prototype: SkillPrototype = { segments: [
      damage({ target: 'enemyChosen', scaling: { base: 3, mult: 1 } }),
      { kind: 'buff', target: 'allySelf', stat: 'hp', lifeMode: 'heal', scaling, modifier: modifier('lastDamage') },
      { kind: 'reduce', target: 'lastDamaged', stat: 'mana', scaling },
      { kind: 'buff', target: 'lastAlly', stat: 'attack', scaling, modifier: modifier('lastReduce') },
    ] };
    const before = structuredClone(prototype);
    expectClassification(inspectEnemyMechanisms(prototype, []), {
      families: ['active:damage', 'active:buff', 'active:heal', 'active:reduce', 'active:manaDrain'],
      targets: ['enemyChosen', 'allySelf', 'lastDamaged', 'lastAlly'],
      dependencies: [
        'order:segments', 'input:target', 'context:casterMagic', 'context:stat:hp',
        'context:stat:mana', 'context:stat:attack', 'source:lastDamage', 'order:lastDamage',
        'source:lastReduce', 'order:lastReduce', 'order:lastDamaged', 'order:lastAlly', 'effect:bothSides',
      ],
    });
    expect(prototype).toEqual(before);
  });

  it.each(['sources', 'sourceGroups'] as const)('uses %s precedence without classifying shadowed modifier sources', field => {
    const boost: ModifierSpec = {
      ...modifier('lastDamage'),
      sources: [{ kind: 'lastReduce' }],
      ...(field === 'sourceGroups' ? { sourceGroups: [[{ kind: 'boardGems', color: BaseColor.Blue }]] } : {}),
    };
    expectClassification(inspectEnemyMechanisms({ segments: [damage({ modifier: boost })] }, []), {
      families: ['active:damage'], targets: ['enemyFront'],
      dependencies: field === 'sourceGroups'
        ? ['source:boardGems', 'context:board', 'context:color:Blue']
        : ['source:lastReduce', 'order:lastReduce'],
    });
  });

  it('visits every nested choose/oneOf branch without selecting or reordering one', () => {
    const prototype: SkillPrototype = { segments: [{
      kind: 'choose', labels: ['Damage or poison', 'Heal'], options: [
        [{ kind: 'oneOf', options: [
          [damage({ target: 'enemyRandomPrefNotPrev' }), { kind: 'extraTurn' }],
          [{ kind: 'status', target: 'enemyChosen', statusId: 'poison', turns: 2 }],
        ] }],
        [{ kind: 'buff', target: 'allySelf', stat: 'hp', lifeMode: 'heal', scaling }],
      ],
    }] };
    const before = structuredClone(prototype);
    const actual = inspectEnemyMechanisms(prototype, []);
    expectClassification(actual, {
      families: ['active:choose', 'active:oneOf', 'active:branch', 'active:damage', 'active:status', 'active:extraTurn', 'active:buff', 'active:heal'],
      targets: ['enemyRandomPrefNotPrev', 'enemyChosen', 'allySelf'],
      dependencies: [
        'input:branch', 'random:branch', 'order:segments', 'random:target', 'order:lastTarget',
        'order:previousPick', 'input:target', 'context:stat:hp', 'effect:bothSides',
      ],
    });
    expect(prototype).toEqual(before);
    expect(inspectEnemyMechanisms(prototype, [])).toEqual(actual);
  });

  it('combines allOf, anyOf and not with cast-start, board, target and tracked-state gates', () => {
    const ifCond: Condition = { kind: 'allOf', of: [
      { kind: 'anyOf', of: [{ kind: 'targetRace', race: 'Dragon' }, { kind: 'targetStatus', statusId: 'poison' }] },
      { kind: 'not', cond: { kind: 'boardAtLeast', color: BaseColor.Red, n: 5 } },
      { kind: 'castStartBoardAtLeast', color: BaseColor.Blue, n: 4 },
      { kind: 'chosenTargetColor', color: BaseColor.Green },
      { kind: 'lastTargetSurvived' },
    ] };
    expectClassification(inspectEnemyMechanisms({ segments: [damage({
      ifCond, ifTargetDied: true, chance: 0.5,
      condMult: { times: 2, cond: { kind: 'selfHpDamaged' } },
    })] }, []), {
      families: ['active:damage'], targets: ['enemyFront'], dependencies: [
        'condition:allOf', 'condition:anyOf', 'condition:not', 'condition:targetRace', 'condition:targetStatus',
        'condition:boardAtLeast', 'condition:castStartBoardAtLeast', 'condition:chosenTargetColor',
        'condition:lastTargetSurvived', 'condition:selfHpDamaged', 'context:target', 'context:targetStatus',
        'context:board', 'context:castStart', 'context:casterHp', 'context:race:Dragon',
        'context:color:Red', 'context:color:Blue', 'context:color:Green', 'input:target',
        'order:lastTarget', 'order:targetDied', 'random:chance',
      ],
    });
  });

  it.each([
    { chance: 0, dependencies: ['condition:never'] },
    { chance: 1, dependencies: [] },
    { chance: 0.25, dependencies: ['random:chance'] },
  ])('distinguishes guaranteed, impossible and random chance ($chance)', ({ chance, dependencies }) => {
    expectClassification(inspectEnemyMechanisms({ segments: [damage({ chance })] }, []), {
      families: ['active:damage'], targets: ['enemyFront'], dependencies,
    });
  });

  it.each<{ name: string; params: GemParams; family: string; targets: string[]; dependencies: string[] }>([
    { name: 'chosen cell transform', params: { op: 'transform', from: 'CELL', to: 'CHOSEN' },
      family: 'gemTransform', targets: [], dependencies: ['input:cell', 'input:color', 'context:color:CHOSEN'] },
    { name: 'chosen row destruction', params: { op: 'clear', mode: 'destroy', target: { kind: 'chosenLine', orientation: 'row' } },
      family: 'gemDestroy', targets: ['board:chosenLine'], dependencies: ['input:row'] },
    { name: 'chosen area explosion', params: { op: 'clear', mode: 'explode', target: { kind: 'area', shape: 'square3', center: 'CELL' } },
      family: 'gemExplode', targets: ['board:area'], dependencies: ['input:cell'] },
    { name: 'random area removal', params: { op: 'clear', mode: 'remove', target: { kind: 'area', shape: 'square3', center: 'RANDOM' } },
      family: 'gemRemove', targets: ['board:area'], dependencies: ['random:board'] },
    { name: 'previously destroyed column', params: { op: 'clear', mode: 'destroy', target: { kind: 'lastDestroyedLine', orientation: 'col' } },
      family: 'gemDestroy', targets: ['board:lastDestroyedLine'], dependencies: ['order:lastDestroyed'] },
  ])('classifies board operations separately from unit targets: $name', ({ params, family, targets, dependencies }) => {
    expectClassification(inspectEnemyMechanisms({ segments: [{ kind: 'gem', params }] }, []), {
      families: ['active:gem', `active:${family}`], targets, dependencies: ['context:board', ...dependencies],
    });
  });

  it('tracks fixed/random summon references and kingdoms, excluding storm presentation names', () => {
    expectClassification(inspectEnemyMechanisms({ segments: [
      { kind: 'summon', params: { source: { ref: 'FixtureWolf' } } },
      { kind: 'summon', params: { source: { randomOf: ['FixtureWolf', 'FixtureImp'] }, countRange: { min: 1, max: 2 } } },
      { kind: 'summon', params: { source: { randomOfKingdom: 'FixtureKingdom' } } },
    ] }, [trait({
      turnStartSummon: { chance: 0.5, troopId: 1, referenceName: 'FixtureGolem', displayName: 'Golem' },
      turnStartStorm: { referenceName: 'PresentationStorm', displayName: 'Storm', colors: [BaseColor.Blue] },
    })]), {
      families: ['active:summon', 'trait:summon', 'trait:storm'], dependencies: [
        'context:ref:FixtureWolf', 'context:ref:FixtureImp', 'context:ref:FixtureGolem',
        'context:kingdom:FixtureKingdom', 'context:color:Blue', 'random:summon', 'random:range',
        'random:chance', 'order:segments', 'trigger:turnStart',
      ],
    });
  });

  it('combines active and trait targets while distinguishing triggers and relative combat roles', () => {
    expectClassification(inspectEnemyMechanisms({ inputTarget: 'enemyChosen', oncePerBattle: true, segments: [damage()] }, [trait({
      regen: { stat: 'hp', amount: 2 },
      onBigMatchDamage: { amount: 3, scope: 'enemyAll', minSize: 5 },
      onSkullDamagedEnemyDamage: { amount: 2 },
      inflictOnSkullHit: { id: 'poison', turns: 2 },
      battleStartManaAura: { scope: 'Dragon', ratio: 0.5 },
    })]), {
      families: ['active:damage', 'trait:regen', 'trait:damage', 'trait:status', 'trait:mana'],
      targets: ['enemyChosen', 'enemyFront', 'enemyAll', 'allySelf', 'attacker', 'victim'],
      dependencies: [
        'input:target', 'context:oncePerBattle', 'trigger:turnStart', 'trigger:bigMatch',
        'trigger:skullDamaged', 'trigger:skullHit', 'trigger:battleStart', 'context:matchSize:5',
        'context:teamFilter:ally', 'context:type:Dragon', 'effect:bothSides',
      ],
    });
  });

  it('ignores disabled trait values and empty arrays without creating families or triggers', () => {
    expectClassification(inspectEnemyMechanisms({ segments: [] }, [trait({
      skullDamageReduction: 0, untargetable: false, statusImmunities: [],
    })]), {});
  });

  it('reports unknown active/trait fields and invalid targets with precise structural paths', () => {
    // Intentionally malformed external data crosses the typed API only in validation tests.
    const prototype = {
      extraMetadata: true,
      segments: [
        { ...damage(), futureDamageFlag: true, target: 'enemyTypo' },
        { kind: 'status', target: 42, statusId: 'poison' },
      ],
    } as unknown as SkillPrototype;
    const traits = [trait({ futureTraitHook: true, regen: 7 } as unknown as Partial<TraitDefinition>)];
    expectClassification(inspectEnemyMechanisms(prototype, traits), {
      families: ['active:damage', 'active:status'], dependencies: ['order:segments'], unknown: [
        'prototype.extraMetadata:prototypeField', 'prototype.segments[0].futureDamageFlag:activeField',
        'prototype.segments[0].target:target:enemyTypo', 'prototype.segments[1].target:invalidTarget',
        'traits[0].futureTraitHook:traitField', 'traits[0].regen:invalidTraitValue',
      ],
      unknownDetails: [
        { key: 'prototype.extraMetadata:prototypeField', family: null, detail: 'prototype.extraMetadata:prototypeField' },
        { key: 'active:damage.futureDamageFlag:activeField', family: 'active:damage', detail: 'prototype.segments[0].futureDamageFlag:activeField' },
        { key: 'active:damage.target:target:enemyTypo', family: 'active:damage', detail: 'prototype.segments[0].target:target:enemyTypo' },
        { key: 'active:status.target:invalidTarget', family: 'active:status', detail: 'prototype.segments[1].target:invalidTarget' },
        { key: 'trait:futureTraitHook:traitField', family: null, detail: 'traits[0].futureTraitHook:traitField' },
        { key: 'trait:regen:invalidTraitValue', family: 'trait:regen', detail: 'traits[0].regen:invalidTraitValue' },
      ],
    });
  });

  it('keeps classifying known descendants of an unknown active wrapper', () => {
    const prototype = { segments: [{ kind: 'futureBranch', options: [[damage()]] }] } as unknown as SkillPrototype;
    expectClassification(inspectEnemyMechanisms(prototype, []), {
      families: ['active:damage'], targets: ['enemyFront'], unknown: ['prototype.segments[0]:activeKind:futureBranch'],
      unknownDetails: [{ key: 'active:activeKind:futureBranch', family: null, detail: 'prototype.segments[0]:activeKind:futureBranch' }],
    });
  });

  it('rejects an unknown trait scope without silently using its default target', () => {
    const malformed = trait({ onBigMatchDamage: { amount: 2, scope: 'enemyTypo' } } as unknown as Partial<TraitDefinition>);
    expectClassification(inspectEnemyMechanisms({ segments: [] }, [malformed]), {
      families: ['trait:damage'], dependencies: ['trigger:bigMatch'],
      unknown: ['traits[0].onBigMatchDamage.scope:scope:enemyTypo'],
      unknownDetails: [{ key: 'trait:onBigMatchDamage.scope:scope:enemyTypo', family: 'trait:damage', detail: 'traits[0].onBigMatchDamage.scope:scope:enemyTypo' }],
    });
  });

  it('reports a segment-object cycle and continues to classify a sibling', () => {
    const branch: Extract<EffectSegment, { kind: 'oneOf' }> = { kind: 'oneOf', options: [] };
    branch.options.push([branch, damage()]);
    expectClassification(inspectEnemyMechanisms({ segments: [branch] }, []), {
      families: ['active:oneOf', 'active:branch', 'active:damage'], targets: ['enemyFront'],
      dependencies: ['random:branch', 'order:segments'],
      unknown: ['prototype.segments[0].options[0][0]:cycle'],
      unknownDetails: [{ key: 'active:oneOf:cycle', family: 'active:oneOf', detail: 'prototype.segments[0].options[0][0]:cycle' }],
    });
  });

  it('reports a cycle back to an ancestor segment array', () => {
    const segments: EffectSegment[] = [];
    segments.push({ kind: 'choose', labels: ['Loop'], options: [segments] });
    expectClassification(inspectEnemyMechanisms({ segments }, []), {
      families: ['active:choose', 'active:branch'], dependencies: ['input:branch'],
      unknown: ['prototype.segments[0].options[0]:cycle'],
      unknownDetails: [{ key: 'active:choose.options[]:cycle', family: 'active:choose', detail: 'prototype.segments[0].options[0]:cycle' }],
    });
  });

  it('detects recursive conditions without losing the enclosing active classification', () => {
    const condition: Extract<Condition, { kind: 'not' }> = { kind: 'not', cond: { kind: 'selfHpDamaged' } };
    condition.cond = condition;
    expectClassification(inspectEnemyMechanisms({ segments: [damage({ ifCond: condition })] }, []), {
      families: ['active:damage'], targets: ['enemyFront'], dependencies: ['condition:not'],
      unknown: ['prototype.segments[0].ifCond.cond:cycle'],
      unknownDetails: [{ key: 'active:damage.ifCond.cond:cycle', family: 'active:damage', detail: 'prototype.segments[0].ifCond.cond:cycle' }],
    });
  });

  it('detects recursive trait storm data', () => {
    const storm: Record<string, unknown> = { colors: [BaseColor.Blue] };
    storm.storm = storm;
    const malformed = trait({ turnStartStorm: storm } as unknown as Partial<TraitDefinition>);
    expectClassification(inspectEnemyMechanisms({ segments: [] }, [malformed]), {
      families: ['trait:storm'], dependencies: ['trigger:turnStart', 'context:color:Blue'],
      unknown: ['traits[0].turnStartStorm.storm:cycle'],
      unknownDetails: [{ key: 'trait:turnStartStorm.storm:cycle', family: 'trait:storm', detail: 'traits[0].turnStartStorm.storm:cycle' }],
    });
  });

  it('accepts shared segments and conditions across branches without false cycles or duplicate tags', () => {
    const sharedCondition: Condition = { kind: 'targetRace', race: 'Dragon' };
    const sharedDamage = damage({ ifCond: { kind: 'anyOf', of: [sharedCondition, sharedCondition] } });
    const prototype: SkillPrototype = { segments: [{ kind: 'oneOf', options: [[sharedDamage], [sharedDamage]] }] };
    expectClassification(inspectEnemyMechanisms(prototype, []), {
      families: ['active:oneOf', 'active:branch', 'active:damage'], targets: ['enemyFront'],
      dependencies: ['random:branch', 'condition:anyOf', 'condition:targetRace', 'context:target', 'context:race:Dragon'],
    });
    expect(prototype.segments[0]).toMatchObject({ options: [[sharedDamage], [sharedDamage]] });
  });
});

describe('native gem builder modifier mirrors', () => {
  function nativeGem() {
    return createGems(BaseColor.Green, 4, 0, { modifier: modifier('lastDamage') });
  }

  it.each(['native mirror', 'equivalent reordered copy'] as const)('accepts %s from createGems opts.modifier', variant => {
    const segment = nativeGem();
    const root = segment as typeof segment & { modifier: ModifierSpec };
    expect(root.modifier).toEqual(modifier('lastDamage'));
    expect(segment.params).toMatchObject({ modifier: modifier('lastDamage') });
    if (variant === 'equivalent reordered copy') {
      root.modifier = { source: { kind: 'lastDamage' }, mod: { a: 1, kind: 'multiplier' } };
      expect(root.modifier).not.toBe((segment.params as { modifier?: ModifierSpec }).modifier);
    }
    expectClassification(inspectEnemyMechanisms({ segments: [segment] }, []), {
      families: ['active:gem', 'active:gemCreate'],
      dependencies: ['context:board', 'context:color:Green', 'source:lastDamage', 'order:lastDamage'],
    });
  });

  it.each(['different source', 'different multiplier', 'root only'] as const)('rejects a gem modifier mirror with %s', variant => {
    const segment = nativeGem();
    const root = segment as typeof segment & { modifier: ModifierSpec };
    if (variant === 'different source') root.modifier = modifier('lastReduce');
    if (variant === 'different multiplier') root.modifier = { ...modifier('lastDamage'), mod: { kind: 'multiplier', a: 2 } };
    if (variant === 'root only') delete (segment.params as { modifier?: ModifierSpec }).modifier;
    const actual = inspectEnemyMechanisms({ segments: [segment] }, []);
    expect(actual.unknown).toEqual(['prototype.segments[0].modifier:activeField']);
    expect(actual.unknownDetails).toEqual([{
      key: 'active:gem.modifier:activeField', family: 'active:gem', detail: 'prototype.segments[0].modifier:activeField',
    }]);
    expect(actual.families).toEqual(['active:gem', 'active:gemCreate']);
  });
});

describe('structured unknown diagnostic ownership and stable rule IDs', () => {
  function expectDetails(actual: EnemyMechanismInspection, expected: EnemyMechanismUnknownDetail[]) {
    expect(actual.unknownDetails).toEqual([...expected].sort((a, b) =>
      a.detail === b.detail ? 0 : a.detail < b.detail ? -1 : 1));
    expect(actual.unknownDetails.map(item => item.detail)).toEqual(actual.unknown);
    for (const item of actual.unknownDetails) expect(item.key).not.toMatch(/\[\d+\]/);
  }

  it('keeps the same rule ID when an active moves into a nested branch or a trait changes index', () => {
    const malformed = { ...damage(), ifCond: { kind: 'futureCondition' } };
    const malformedTrait = trait({ regen: 'bad' } as unknown as Partial<TraitDefinition>);
    const flat = inspectEnemyMechanisms({ segments: [malformed] } as unknown as SkillPrototype, [malformedTrait]);
    const nested = inspectEnemyMechanisms({ segments: [
      damage(), { kind: 'choose', labels: ['Extra turn', 'Damage'], options: [
        [{ kind: 'extraTurn' }], [{ kind: 'oneOf', options: [[damage()], [malformed]] }],
      ] },
    ] } as unknown as SkillPrototype, [trait({}), malformedTrait]);
    const stableRules = [
      { key: 'active:damage.ifCond:condition:futureCondition', family: 'active:damage' },
      { key: 'trait:regen:invalidTraitValue', family: 'trait:regen' },
    ];
    expect(flat.unknownDetails.map(({ key, family }) => ({ key, family }))).toEqual(stableRules);
    expect(nested.unknownDetails.map(({ key, family }) => ({ key, family }))).toEqual(stableRules);
    expect(flat.unknown).not.toEqual(nested.unknown);
    expectDetails(nested, [
      { ...stableRules[0], detail: 'prototype.segments[1].options[1][0].options[1][0].ifCond:condition:futureCondition' },
      { ...stableRules[1], detail: 'traits[1].regen:invalidTraitValue' },
    ]);
  });

  it('normalizes condition and modifier array indices while keeping every concrete occurrence', () => {
    const prototype = { segments: [damage({
      ifCond: { kind: 'anyOf', of: [{ kind: 'futureCondition' }, { kind: 'futureCondition' }] },
      modifiers: [
        { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'futureSource' } },
        { mod: { kind: 'multiplier', a: 1 }, source: { kind: 'futureSource' } },
      ],
    } as unknown as Partial<DamageSegment>)] };
    expectDetails(inspectEnemyMechanisms(prototype, []), [
      { key: 'active:damage.ifCond.of[]:condition:futureCondition', family: 'active:damage', detail: 'prototype.segments[0].ifCond.of[0]:condition:futureCondition' },
      { key: 'active:damage.ifCond.of[]:condition:futureCondition', family: 'active:damage', detail: 'prototype.segments[0].ifCond.of[1]:condition:futureCondition' },
      { key: 'active:damage.modifiers[].source:source:futureSource', family: 'active:damage', detail: 'prototype.segments[0].modifiers[0].source:source:futureSource' },
      { key: 'active:damage.modifiers[].source:source:futureSource', family: 'active:damage', detail: 'prototype.segments[0].modifiers[1].source:source:futureSource' },
    ]);
  });

  it('normalizes both trait and trait-list positions without losing root ownership or occurrences', () => {
    const invalidGain = { color: BaseColor.Red, stat: 'attack', amount: 1, chance: 2 };
    const actual = inspectEnemyMechanisms({ segments: [] }, [trait({}), trait({
      onColorMatchGains: [invalidGain, invalidGain], futureTrait: true,
    } as unknown as Partial<TraitDefinition>)]);
    expectDetails(actual, [
      { key: 'trait:onColorMatchGains[].chance:invalidChance', family: 'trait:buff', detail: 'traits[1].onColorMatchGains[0].chance:invalidChance' },
      { key: 'trait:onColorMatchGains[].chance:invalidChance', family: 'trait:buff', detail: 'traits[1].onColorMatchGains[1].chance:invalidChance' },
      { key: 'trait:futureTrait:traitField', family: null, detail: 'traits[1].futureTrait:traitField' },
    ]);
  });

  it('assigns diagnostics to active roots rather than their derived heal or trueDamage families', () => {
    const prototype = { segments: [
      { kind: 'buff', target: 'allySelf', stat: 'hp', lifeMode: 'heal', scaling, futureField: true },
      { ...damage({ trueDamage: true }), ifCond: { kind: 'futureCondition' } },
    ] } as unknown as SkillPrototype;
    const actual = inspectEnemyMechanisms(prototype, []);
    expect(actual.families).toEqual(['active:buff', 'active:damage', 'active:heal', 'active:trueDamage']);
    expectDetails(actual, [
      { key: 'active:buff.futureField:activeField', family: 'active:buff', detail: 'prototype.segments[0].futureField:activeField' },
      { key: 'active:damage.ifCond:condition:futureCondition', family: 'active:damage', detail: 'prototype.segments[1].ifCond:condition:futureCondition' },
    ]);
  });

  it('restores parent ownership after known and unknown nested segments, including early exits', () => {
    const prototype = { segments: [{ kind: 'choose', labels: [], options: [
      [{ kind: 'oneOf', options: [[{ ...damage(), ifCond: null }], null] }],
      null,
      [{ kind: 'futureActive', options: [[{ kind: 'status', target: 42, statusId: 'poison', turns: 2 }], null] }],
      [null],
    ] }, { kind: 'gem', params: { op: 'clear', mode: 'destroy', target: null } }] } as unknown as SkillPrototype;
    expectDetails(inspectEnemyMechanisms(prototype, []), [
      { key: 'active:damage.ifCond:invalidCondition', family: 'active:damage', detail: 'prototype.segments[0].options[0][0].options[0][0].ifCond:invalidCondition' },
      { key: 'active:oneOf.options[]:invalidSegments', family: 'active:oneOf', detail: 'prototype.segments[0].options[0][0].options[1]:invalidSegments' },
      { key: 'active:choose.options[]:invalidSegments', family: 'active:choose', detail: 'prototype.segments[0].options[1]:invalidSegments' },
      { key: 'active:activeKind:futureActive', family: null, detail: 'prototype.segments[0].options[2][0]:activeKind:futureActive' },
      { key: 'active:status.target:invalidTarget', family: 'active:status', detail: 'prototype.segments[0].options[2][0].options[0][0].target:invalidTarget' },
      { key: 'active.options[]:invalidSegments', family: null, detail: 'prototype.segments[0].options[2][0].options[1]:invalidSegments' },
      { key: 'active:invalidSegment', family: null, detail: 'prototype.segments[0].options[3][0]:invalidSegment' },
      { key: 'active:gem.params.target:invalidClearTarget', family: 'active:gem', detail: 'prototype.segments[1].params.target:invalidClearTarget' },
    ]);
  });

  it('uses the trait root family through nested storm parameters and restores it for other roots', () => {
    const malformed = trait({
      summonOnDeath: { chance: -1, troopId: 1, referenceName: 'FixtureWolf', displayName: 'Wolf', storm: { chance: 2 } },
      turnStartStorm: { chance: -1, colors: [BaseColor.Blue] },
      futureTrait: true,
      regen: 7,
    } as unknown as Partial<TraitDefinition>);
    expectDetails(inspectEnemyMechanisms({ segments: [] }, [malformed, trait({ dodgeChance: 2 })]), [
      { key: 'trait:summonOnDeath.chance:invalidChance', family: 'trait:summon', detail: 'traits[0].summonOnDeath.chance:invalidChance' },
      { key: 'trait:summonOnDeath.storm.chance:invalidChance', family: 'trait:summon', detail: 'traits[0].summonOnDeath.storm.chance:invalidChance' },
      { key: 'trait:turnStartStorm.chance:invalidChance', family: 'trait:storm', detail: 'traits[0].turnStartStorm.chance:invalidChance' },
      { key: 'trait:futureTrait:traitField', family: null, detail: 'traits[0].futureTrait:traitField' },
      { key: 'trait:regen:invalidTraitValue', family: 'trait:regen', detail: 'traits[0].regen:invalidTraitValue' },
      { key: 'trait:dodgeChance:invalidChance', family: 'trait:dodge', detail: 'traits[1].dodgeChance:invalidChance' },
    ]);
  });

  it('attributes a nested trait cycle to its summon root rather than the nested storm', () => {
    const storm: Record<string, unknown> = {};
    storm.storm = storm;
    const malformed = trait({ summonOnDeath: {
      chance: 1, troopId: 1, referenceName: 'FixtureWolf', displayName: 'Wolf', storm,
    } } as unknown as Partial<TraitDefinition>);
    expectDetails(inspectEnemyMechanisms({ segments: [] }, [malformed]), [{
      key: 'trait:summonOnDeath.storm.storm:cycle', family: 'trait:summon', detail: 'traits[0].summonOnDeath.storm.storm:cycle',
    }]);
  });

  it('keeps the cyclic segment family when re-entering it from a different branch family', () => {
    const branch: Extract<EffectSegment, { kind: 'oneOf' }> = { kind: 'oneOf', options: [] };
    branch.options.push([{ kind: 'choose', labels: ['Cycle'], options: [[branch]] }]);
    expectDetails(inspectEnemyMechanisms({ segments: [branch] }, []), [{
      key: 'active:oneOf:cycle', family: 'active:oneOf', detail: 'prototype.segments[0].options[0][0].options[0][0]:cycle',
    }]);
  });

  it('keeps prototype-level diagnostics unscoped and per-call contexts independent', () => {
    const malformed = { inputTarget: 42, segments: null } as unknown as SkillPrototype;
    const inspect = () => inspectEnemyMechanisms(malformed, []);
    const first = inspect();
    expectDetails(first, [
      { key: 'prototype.inputTarget:invalidTarget', family: null, detail: 'prototype.inputTarget:invalidTarget' },
      { key: 'prototype.segments:invalidSegments', family: null, detail: 'prototype.segments:invalidSegments' },
    ]);
    inspectEnemyMechanisms({ segments: [{ kind: 'gem', params: null }] } as unknown as SkillPrototype, []);
    expect(inspect()).toEqual(first);
  });
});
