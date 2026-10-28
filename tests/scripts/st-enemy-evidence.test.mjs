import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  REQUIRED_OBLIGATIONS, stableJson, sha256, fingerprintEnemy, validateEnemyEvidence, evidenceTestFiles, fingerprintEnemies,
} from '../../scripts/lib/st-enemy-evidence.mjs';

const EXPECTED_OBLIGATIONS = [
  'portrait', 'active', 'traits', 'target', 'mana-cost', 'mana-colors',
  'scaling', 'context', 'description', 'role', 'refresh', 'determinism', 'invalid-action',
];
const REQUIRED_FILES = [
  'src/engine/deep/ability.ts', 'src/engine/rules.json',
  'src/session/deep/state.ts', 'src/session/defaults.json',
  'src/data/deep/troops.json', 'src/data/index.ts',
  ...[
    'enemyBlueprint', 'abilityDescription', 'traitDescription', 'battleRuntime',
    'derivedFormPreflight', 'economyAvailability', 'environmentScaling', 'portraits', 'json',
  ].map(name => `src/sillytavern/${name}.ts`),
  'src/meta/data/races.ts',
  'src/meta/data/roles.ts', 'src/sillytavern/data/portraits.json',
  'scripts/lib/st-enemy-evidence.mjs', 'scripts/st-enemy-acceptance.mjs',
];
const REQUIRED_CONFIG_FILES = [
  'vitest.config.ts', 'vite.config.ts', 'tsconfig.json', 'package.json', 'package-lock.json',
];
const SUPPORT_FILE = 'tests/support/expectations.ts';
const FIXTURE_FILE = 'tests/fixtures/enemy/red-team.json';
const TEST_FILE = 'tests/unit/enemy-behavior.test.ts';
const PORTRAIT_FILE = 'game-assets/public/static/portraits/Troop_6000.webp';
const DIGESTS = ['subjectDigest', 'testDigest', 'implementationDigest', 'portraitDigest'];

function fixture(t, reverse = false) {
  const temporaryParent = path.resolve(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temporaryParent, 'st-enemy-evidence-'));
  t.after(() => {
    // Only remove the exact temporary fixture directory created above.
    assert.equal(path.dirname(path.resolve(root)), temporaryParent);
    assert.ok(path.basename(root).startsWith('st-enemy-evidence-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const write = (relative, content) => {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  };
  const files = [...REQUIRED_FILES, ...REQUIRED_CONFIG_FILES, TEST_FILE, PORTRAIT_FILE,
    SUPPORT_FILE, FIXTURE_FILE, 'src/engine/notes.md'];
  for (const file of reverse ? files.reverse() : files) write(file, `fixture contents: ${file}\n`);
  const enemy = {
    id: 6000, name: 'Fixture enemy', skillId: 7131, traitIds: ['big'],
    portrait: { assetId: 'Troop_6000', indexed: true, url: '/static/portraits/Troop_6000.webp' },
    compilation: { state: 'compiled', issues: [], recipe: { abilityId: 'fixture-active', budget: { manaCost: 6 } } },
    applicable: true, assemblerVerified: false,
  };
  const fingerprint = () => fingerprintEnemy({ root, enemy, testFile: TEST_FILE });
  return { root, write, enemy, fingerprint };
}

function evidence(t) {
  const context = fixture(t);
  const current = context.fingerprint();
  const record = {
    enemyId: current.enemyId, testFile: current.testFile,
    obligations: EXPECTED_OBLIGATIONS.map(id => ({ id, assertions: [`enemy 6000 > ${id} behavior`] })),
  };
  const run = {
    version: 1, ...current, author: 'runner-agent', contractDigest: sha256(stableJson(record)),
    command: 'vitest run tests/unit/enemy-behavior.test.ts --reporter=json',
    assertions: record.obligations.map(item => ({ fullName: item.assertions[0], status: 'passed' })),
    totalTests: EXPECTED_OBLIGATIONS.length, passedTests: EXPECTED_OBLIGATIONS.length,
    failedTests: 0, pendingTests: 0, exitCode: 0,
  };
  const review = {
    version: 1, enemyId: current.enemyId, reviewer: 'independent-reviewer', decision: 'accepted',
    subjectDigest: current.subjectDigest, testDigest: current.testDigest, contractDigest: run.contractDigest,
    runDigest: sha256(stableJson(run)), obligations: [...EXPECTED_OBLIGATIONS], scope: 'enemy-behavior',
  };
  const artifacts = { record, current, run, review };
  const sign = () => { review.runDigest = sha256(stableJson(run)); };
  const bindContract = () => {
    run.contractDigest = sha256(stableJson(record));
    review.contractDigest = run.contractDigest;
    sign();
  };
  return { ...context, ...artifacts, artifacts, sign, bindContract };
}

function expectStatus(artifacts, status, issuePattern) {
  const result = validateEnemyEvidence(artifacts);
  assert.equal(result.status, status, JSON.stringify(result));
  if (status === 'passed') assert.deepEqual(result.issues, []);
  else {
    assert.ok(result.issues.length > 0);
    assert.ok(result.issues.every(issue => typeof issue === 'string' && issue.length > 0));
  }
  if (issuePattern) assert.match(result.issues.join('\n'), issuePattern);
  return result;
}

test('exports the exact required obligations', () => {
  assert.deepEqual(REQUIRED_OBLIGATIONS, EXPECTED_OBLIGATIONS);
  assert.ok(Object.isFrozen(REQUIRED_OBLIGATIONS));
});

test('stableJson canonicalizes nested objects, preserves arrays, and hashes UTF-8/bytes', () => {
  const value = { z: [{ b: 2, a: 1 }, null, true], a: '敌人' };
  assert.equal(stableJson(value), '{"a":"敌人","z":[{"a":1,"b":2},null,true]}');
  assert.equal(stableJson(value), stableJson({ a: '敌人', z: [{ a: 1, b: 2 }, null, true] }));
  assert.notEqual(stableJson([1, 2]), stableJson([2, 1]));
  assert.equal(stableJson(JSON.parse('{"__proto__":{"b":2,"a":1}}')), '{"__proto__":{"a":1,"b":2}}');
  const child = { a: 1 };
  assert.equal(stableJson([child, child]), '[{"a":1},{"a":1}]');
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256('敌人'), sha256(Buffer.from('敌人')));
  assert.notEqual(sha256(Buffer.from([0, 255])), sha256(Buffer.from([0, 254])));
  assert.throws(() => sha256(123), TypeError);
});

test('stableJson rejects lossy values and cycles', () => {
  for (const value of [undefined, NaN, Infinity, 1n, () => {}, Symbol('x'), new Date(), new Map(), { x: undefined }, Array(1)]) {
    assert.throws(() => stableJson(value), TypeError);
  }
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => stableJson(cyclic), /Circular/);
});

test('fingerprints are independent of root and filesystem creation order', t => {
  const first = fixture(t);
  const second = fixture(t, true);
  const current = first.fingerprint();
  assert.deepEqual(current, second.fingerprint());
  assert.equal(current.enemyId, first.enemy.id);
  assert.equal(current.testFile, TEST_FILE);
  for (const field of DIGESTS) assert.match(current[field], /^[a-f0-9]{64}$/);
  assert.deepEqual(fingerprintEnemy({ root: first.root, enemy: first.enemy, testFile: TEST_FILE.replaceAll('/', '\\') }), current);
});

test('subject fingerprint ignores only inventory acceptance fields and does not mutate enemy', t => {
  const context = fixture(t);
  const before = context.fingerprint();
  context.enemy.assemblerVerified = true;
  context.enemy.assemblyEvidence = { status: 'passed', digest: 'circular evidence' };
  context.enemy.assemblyEvidence.self = context.enemy.assemblyEvidence;
  assert.deepEqual(context.fingerprint(), before);
  assert.equal(context.enemy.assemblyEvidence.self, context.enemy.assemblyEvidence);
  const { assemblerVerified, assemblyEvidence, ...subject } = context.enemy;
  assert.equal(before.subjectDigest, sha256(stableJson(subject)));
  context.enemy.compilation.recipe.budget.manaCost++;
  const after = context.fingerprint();
  assert.notEqual(after.subjectDigest, before.subjectDigest);
  for (const field of DIGESTS.filter(key => key !== 'subjectDigest')) assert.equal(after[field], before[field]);
});

for (const file of REQUIRED_FILES) {
  test(`implementationDigest covers dependency ${file}`, t => {
    const context = fixture(t);
    const before = context.fingerprint();
    context.write(file, 'changed implementation bytes');
    const after = context.fingerprint();
    assert.notEqual(after.implementationDigest, before.implementationDigest);
    for (const field of DIGESTS.filter(key => key !== 'implementationDigest')) assert.equal(after[field], before[field]);
  });
}

test('dependency digest binds relative paths and discovers new nested dependencies', t => {
  const context = fixture(t);
  const before = context.fingerprint();
  context.write('src/engine/new/deep/extra.ts', 'identical bytes');
  const added = context.fingerprint();
  assert.notEqual(added.implementationDigest, before.implementationDigest);
  fs.renameSync(path.join(context.root, 'src/engine/new/deep/extra.ts'), path.join(context.root, 'src/engine/new/deep/renamed.ts'));
  assert.notEqual(context.fingerprint().implementationDigest, added.implementationDigest);
  const renamed = context.fingerprint();
  context.write('src/engine/notes.md', 'text is covered too');
  const changedNotes = context.fingerprint();
  assert.notEqual(changedNotes.implementationDigest, renamed.implementationDigest);
  context.write('src/session/extra.js', 'JavaScript is covered too');
  assert.notEqual(context.fingerprint().implementationDigest, changedNotes.implementationDigest);
});

test('test and portrait fingerprints bind raw file contents and test path', t => {
  const context = fixture(t);
  const before = context.fingerprint();
  context.write(TEST_FILE, 'changed actual test');
  const changedTest = context.fingerprint();
  assert.notEqual(changedTest.testDigest, before.testDigest);
  assert.equal(changedTest.implementationDigest, before.implementationDigest);
  context.write('tests/unit/renamed.test.ts', 'changed actual test');
  assert.notEqual(fingerprintEnemy({ root: context.root, enemy: context.enemy, testFile: 'tests/unit/renamed.test.ts' }).testDigest, changedTest.testDigest);
  const beforePortrait = context.fingerprint();
  context.write(PORTRAIT_FILE, Buffer.from([0, 255, 1, 128]));
  const changedPortrait = context.fingerprint();
  assert.notEqual(changedPortrait.portraitDigest, beforePortrait.portraitDigest);
  for (const field of DIGESTS.filter(key => key !== 'portraitDigest')) assert.equal(changedPortrait[field], beforePortrait[field]);
});

for (const file of [...REQUIRED_FILES.slice(6), ...REQUIRED_CONFIG_FILES, TEST_FILE, PORTRAIT_FILE]) {
  test(`fingerprint rejects missing required file ${file}`, t => {
    const context = fixture(t);
    fs.unlinkSync(path.join(context.root, file));
    assert.throws(context.fingerprint, /ENOENT/);
  });
}

test('deleting discovered dependencies changes the implementation digest and makes receipts stale', t => {
  for (const file of REQUIRED_FILES.slice(0, 6)) {
    const context = evidence(t);
    fs.unlinkSync(path.join(context.root, file));
    const after = context.fingerprint();
    assert.notEqual(after.implementationDigest, context.current.implementationDigest);
    expectStatus({ ...context.artifacts, current: after }, 'stale', /implementationDigest/);
  }
});

test('fingerprint rejects missing or empty dependency trees and file/directory substitutions', t => {
  const context = fixture(t);
  fs.renameSync(path.join(context.root, 'src/session'), path.join(context.root, 'src/session-away'));
  assert.throws(context.fingerprint, /ENOENT/);
  fs.mkdirSync(path.join(context.root, 'src/session'));
  assert.throws(context.fingerprint, /Missing.*src\/session/);
  fs.renameSync(path.join(context.root, 'src/session-away/defaults.json'), path.join(context.root, 'src/session/defaults.json'));
  fs.unlinkSync(path.join(context.root, TEST_FILE));
  fs.mkdirSync(path.join(context.root, TEST_FILE));
  assert.throws(context.fingerprint, /Expected file/);
});

test('fingerprint rejects path traversal, absolute paths and invalid asset identifiers', t => {
  const context = fixture(t);
  for (const testFile of ['../outside.ts', 'tests/../../outside.ts', '..\\outside.ts', '/outside.ts', 'C:\\outside.ts', 'C:outside.ts', '\\\\HOST\\share\\test.ts', 'tests//x.ts', 'tests/./x.ts', 'tests/x.ts:stream', 'tests/x.ts\0', '', ' tests/x.ts']) {
    assert.throws(() => fingerprintEnemy({ ...context, testFile }), /path|root|traversal/i, testFile);
  }
  for (const assetId of [null, undefined, '', '..', '../outside', '..\\outside', '/outside', 'C:outside', 'Troop_6000.webp']) {
    const enemy = { ...context.enemy, portrait: { assetId } };
    assert.throws(() => fingerprintEnemy({ root: context.root, enemy, testFile: TEST_FILE }), /assetId/);
  }
  assert.throws(() => fingerprintEnemy({ root: context.root, enemy: {}, testFile: TEST_FILE }), /enemy.id/);
});

function linkOrSkip(t, target, link, type) {
  try {
    fs.symlinkSync(target, link, type);
    return true;
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error;
    t.skip(`Symbolic links unavailable: ${error.code}`);
    return false;
  }
}

test('fingerprint rejects an existing test symlink outside root', t => {
  const context = fixture(t);
  const outside = fixture(t);
  const linked = path.join(context.root, 'tests/outside.test.ts');
  if (!linkOrSkip(t, path.join(outside.root, TEST_FILE), linked, 'file')) return;
  assert.throws(() => fingerprintEnemy({ root: context.root, enemy: context.enemy, testFile: 'tests/outside.test.ts' }), /escapes root/);
});

test('fingerprint rejects a dependency directory junction outside root', t => {
  const context = fixture(t);
  const outside = fixture(t);
  if (!linkOrSkip(t, path.join(outside.root, 'src/engine'), path.join(context.root, 'src/engine/external'), 'junction')) return;
  assert.throws(context.fingerprint, /escapes root/);
});

test('fingerprint rejects a portrait symlink outside root', t => {
  const context = fixture(t);
  const outside = fixture(t);
  fs.unlinkSync(path.join(context.root, PORTRAIT_FILE));
  if (!linkOrSkip(t, path.join(outside.root, PORTRAIT_FILE), path.join(context.root, PORTRAIT_FILE), 'file')) return;
  assert.throws(context.fingerprint, /escapes root/);
});

test('fingerprint rejects recursive dependency links', t => {
  const context = fixture(t);
  if (!linkOrSkip(t, path.join(context.root, 'src/engine'), path.join(context.root, 'src/engine/loop'), 'junction')) return;
  assert.throws(context.fingerprint, /link cycle/);
});

test('complete independently reviewed evidence passes without mutating artifacts', t => {
  const { artifacts, bindContract } = evidence(t);
  const before = stableJson(artifacts);
  expectStatus(artifacts, 'passed');
  assert.equal(stableJson(artifacts), before);
  artifacts.record.sourceRefs = [{ source: 'optional data' }];
  expectStatus(artifacts, 'stale', /contractDigest/);
  bindContract();
  expectStatus(artifacts, 'passed');
  artifacts.record.id = artifacts.record.enemyId;
  delete artifacts.record.enemyId;
  bindContract();
  expectStatus(artifacts, 'passed');
});

test('missing run/review remains pending and inventory booleans grant nothing', t => {
  const { artifacts } = evidence(t);
  for (const missing of [{ run: undefined }, { review: undefined }, { run: null, review: null }]) {
    expectStatus({ ...artifacts, ...missing }, 'pending', /missing/);
  }
  expectStatus({ ...artifacts, run: true, review: true }, 'failed', /must be an object/);
  expectStatus({ ...artifacts, run: { assemblerVerified: true }, review: { accepted: true } }, 'failed');
});

for (const field of DIGESTS) {
  test(`changed current ${field} makes existing evidence stale`, t => {
    const { artifacts } = evidence(t);
    artifacts.current[field] = sha256(`new ${field}`);
    expectStatus(artifacts, 'stale', new RegExp(field));
  });
}

test('real dependency/test/portrait/subject edits invalidate signed evidence', t => {
  const context = evidence(t);
  for (const edit of [
    () => { context.enemy.name += ' updated'; },
    () => context.write(TEST_FILE, 'updated test assertions'),
    () => context.write('scripts/st-enemy-acceptance.mjs', 'updated runner'),
    () => context.write('scripts/lib/st-enemy-evidence.mjs', 'updated verifier'),
    () => context.write(PORTRAIT_FILE, 'updated portrait'),
  ]) {
    edit();
    expectStatus({ ...context.artifacts, current: context.fingerprint() }, 'stale');
  }
});

test('review digests and entire run signature must match', t => {
  const { artifacts, sign } = evidence(t);
  for (const field of ['subjectDigest', 'testDigest', 'runDigest']) {
    const previous = artifacts.review[field];
    artifacts.review[field] = sha256(`wrong ${field}`);
    expectStatus(artifacts, 'stale', new RegExp(field));
    artifacts.review[field] = previous;
  }
  artifacts.run.command += ' --changed';
  expectStatus(artifacts, 'stale', /runDigest/);
  sign();
  expectStatus(artifacts, 'passed');
  artifacts.run.author = 'different-runner';
  expectStatus(artifacts, 'stale', /runDigest/);
});

test('failed, skipped, pending, todo and disabled cases fail even when counters agree', t => {
  for (const status of ['failed', 'skipped', 'pending', 'todo', 'disabled', 'unknown']) {
    const { artifacts, sign } = evidence(t);
    artifacts.run.assertions[0].status = status;
    artifacts.run.passedTests--;
    if (status === 'failed') artifacts.run.failedTests++;
    else artifacts.run.pendingTests++;
    sign();
    expectStatus(artifacts, 'failed', /did not pass|invalid status/);
  }
});

test('empty runs, inconsistent counts, non-integer counts and duplicate case names fail', t => {
  const mutations = [
    run => { run.assertions = []; run.totalTests = 0; run.passedTests = 0; },
    run => { run.totalTests++; }, run => { run.passedTests--; },
    run => { run.failedTests = 1; }, run => { run.pendingTests = 1; },
    run => { run.totalTests = '13'; }, run => { run.passedTests = 1.5; },
    run => { run.failedTests = -1; }, run => { delete run.pendingTests; },
    run => { run.assertions[1].fullName = run.assertions[0].fullName; },
    run => { run.assertions[0].fullName = ' '; },
    run => { run.assertions[0] = null; }, run => { run.assertions = true; },
    run => { run.exitCode = 1; }, run => { run.exitCode = null; },
    run => { run.exitCode = '0'; },
  ];
  for (const mutate of mutations) {
    const { artifacts, sign } = evidence(t);
    mutate(artifacts.run);
    sign();
    expectStatus(artifacts, 'failed');
  }
});

test('record obligations must be complete, unique, and backed by existing passed cases', t => {
  const mutations = [
    record => { record.obligations.pop(); },
    record => { record.obligations.push(record.obligations[0]); },
    record => { record.obligations[0].id = 'unrecognized'; },
    record => { record.obligations[0].assertions = []; },
    record => { record.obligations[0].assertions = true; },
    record => { record.obligations[0].assertions = ['not an executed case']; },
    record => { record.obligations[0].assertions.push(record.obligations[0].assertions[0]); },
    record => { record.obligations[0].assertions = [' ']; },
    record => { record.obligations[0] = 'portrait'; },
    record => { record.obligations[0].id = { toString: null }; },
    record => { record.obligations = true; },
  ];
  for (const mutate of mutations) {
    const { artifacts, bindContract } = evidence(t);
    mutate(artifacts.record);
    bindContract();
    expectStatus(artifacts, 'failed', /obligation|assertion/);
  }
});

test('multiple obligations may reference one real case with multiple behavior checks', t => {
  const { artifacts, bindContract } = evidence(t);
  for (const obligation of artifacts.record.obligations) obligation.assertions = [artifacts.run.assertions[0].fullName];
  bindContract();
  expectStatus(artifacts, 'passed');
});

test('review requires complete unique obligations, accepted scope, version and independent reviewer', t => {
  const mutations = [
    review => { review.obligations.pop(); },
    review => { review.obligations.push(review.obligations[0]); },
    review => { review.obligations[0] = 'unknown'; },
    review => { review.obligations = true; },
    review => { review.obligations[0] = { toString: null }; },
    review => { review.decision = 'rejected'; },
    review => { review.decision = true; },
    review => { review.scope = 'description-only'; },
    review => { review.version = '1'; },
    review => { review.reviewer = ''; },
    review => { review.reviewer = ' \n '; },
    review => { review.reviewer = ' runner-agent '; },
  ];
  for (const mutate of mutations) {
    const { artifacts } = evidence(t);
    mutate(artifacts.review);
    expectStatus(artifacts, 'failed', /review/);
  }
});

test('run requires version, author and execution command', t => {
  for (const [field, values] of Object.entries({ version: [2, '1'], author: ['', ' ', null], command: ['', ' ', true] })) {
    for (const value of values) {
      const { artifacts, sign } = evidence(t);
      artifacts.run[field] = value;
      sign();
      expectStatus(artifacts, 'failed', new RegExp(`run.${field}`));
    }
  }
});

test('enemy identities must agree across record/current/run/review without type coercion', t => {
  const mutations = [
    artifacts => { artifacts.record.enemyId++; },
    artifacts => { artifacts.record.id = 6001; },
    artifacts => { artifacts.current.enemyId++; },
    artifacts => { artifacts.run.enemyId++; },
    artifacts => { artifacts.review.enemyId++; },
    artifacts => { delete artifacts.current.enemyId; },
    artifacts => { delete artifacts.run.enemyId; },
    artifacts => { delete artifacts.review.enemyId; },
    artifacts => { artifacts.run.enemyId = '6000'; },
  ];
  for (const mutate of mutations) {
    const { artifacts, bindContract } = evidence(t);
    mutate(artifacts);
    bindContract();
    expectStatus(artifacts, 'failed', /enemyId|record.id/);
  }
});

test('testFile identity rejects mismatches and escapes in all artifacts', t => {
  for (const artifact of ['record', 'current', 'run']) {
    for (const testFile of ['tests/unit/other.test.ts', '../outside.ts', '..\\outside.ts', '/absolute.ts', 'C:\\outside.ts', 'C:outside.ts', '', null]) {
      const { artifacts, bindContract } = evidence(t);
      artifacts[artifact].testFile = testFile;
      bindContract();
      expectStatus(artifacts, 'failed', /testFile/);
    }
  }
  const { artifacts, bindContract } = evidence(t);
  artifacts.record.testFile = TEST_FILE.replaceAll('/', '\\');
  bindContract();
  expectStatus(artifacts, 'passed');
});

test('malformed digests and malformed artifact objects fail without throwing', t => {
  for (const artifact of ['current', 'run', 'review']) {
    const fields = artifact === 'review' ? ['subjectDigest', 'testDigest', 'runDigest'] : DIGESTS;
    for (const field of fields) {
      const { artifacts, sign } = evidence(t);
      artifacts[artifact][field] = true;
      if (artifact === 'run') sign();
      expectStatus(artifacts, 'failed', /SHA-256/);
    }
  }
  for (const artifact of ['record', 'current', 'run', 'review']) {
    for (const invalid of [true, [], 'accepted']) {
      const { artifacts } = evidence(t);
      artifacts[artifact] = invalid;
      expectStatus(artifacts, 'failed', /object/);
    }
  }
  expectStatus({}, 'failed');
  assert.equal(validateEnemyEvidence().status, 'failed');
});

test('non-JSON run metadata fails signature validation without throwing', t => {
  const { artifacts } = evidence(t);
  artifacts.run.extra = artifacts.run;
  expectStatus(artifacts, 'failed', /canonical JSON/);
});


test('contractDigest binds the complete canonical record without changing fingerprint fields', t => {
  const { artifacts } = evidence(t);
  const expected = sha256(stableJson(artifacts.record));
  assert.equal(artifacts.run.contractDigest, expected);
  assert.equal(artifacts.review.contractDigest, expected);
  assert.deepEqual(Object.keys(artifacts.current).sort(), ['enemyId', 'testFile', ...DIGESTS].sort());
  artifacts.record = {
    obligations: artifacts.record.obligations.map(({ id, assertions }) => ({ assertions, id })),
    testFile: artifacts.record.testFile, enemyId: artifacts.record.enemyId,
  };
  expectStatus(artifacts, 'passed');
});

test('changing only an obligation mapping to another passing case invalidates both receipts', t => {
  const { artifacts, bindContract } = evidence(t);
  const previousRun = stableJson(artifacts.run);
  const previousReview = stableJson(artifacts.review);
  artifacts.record.obligations[0].assertions = [artifacts.run.assertions[1].fullName];
  const result = expectStatus(artifacts, 'stale');
  assert.deepEqual(result.issues, [
    'run.contractDigest does not match current evidence',
    'review.contractDigest does not match current evidence',
  ]);
  assert.equal(stableJson(artifacts.run), previousRun);
  assert.equal(stableJson(artifacts.review), previousReview);
  bindContract();
  expectStatus(artifacts, 'passed');
});

for (const change of ['add', 'edit', 'remove']) {
  test(`sourceRefs ${change} invalidates old receipts`, t => {
    const { artifacts, bindContract } = evidence(t);
    if (change !== 'add') {
      artifacts.record.sourceRefs = [{ path: 'src/data/troops.json', enemyId: 6000 }];
      bindContract();
      expectStatus(artifacts, 'passed');
    }
    if (change === 'add') artifacts.record.sourceRefs = [{ path: 'src/data/troops.json' }];
    else if (change === 'edit') artifacts.record.sourceRefs[0].enemyId++;
    else delete artifacts.record.sourceRefs;
    expectStatus(artifacts, 'stale', /contractDigest/);
  });
}

test('changing only record.testFile invalidates the old contract and preserves identity diagnostics', t => {
  const { artifacts } = evidence(t);
  artifacts.record.testFile = 'tests/unit/another-enemy.test.ts';
  const result = expectStatus(artifacts, 'stale', /contractDigest/);
  assert.ok(result.issues.includes('current.testFile does not match record'));
  assert.ok(result.issues.includes('run.testFile does not match record/current'));
});

test('changing record path spelling invalidates the contract even when paths normalize equally', t => {
  const { artifacts } = evidence(t);
  artifacts.record.testFile = TEST_FILE.replaceAll('/', '\\');
  const result = expectStatus(artifacts, 'stale', /contractDigest/);
  assert.equal(result.issues.length, 2);
});

for (const receipt of ['run', 'review']) {
  test(`${receipt}.contractDigest is required and must be a SHA-256 string`, t => {
    for (const invalid of [undefined, null, true, '', 'not-a-digest', 'A'.repeat(64)]) {
      const { artifacts } = evidence(t);
      if (invalid === undefined) delete artifacts[receipt].contractDigest;
      else artifacts[receipt].contractDigest = invalid;
      // A missing run contract must fail even though its old runDigest also differs.
      expectStatus(artifacts, 'failed', new RegExp(`${receipt}.contractDigest must be a SHA-256 digest`));
    }
  });

  test(`${receipt}.contractDigest mismatch is stale even with otherwise valid evidence`, t => {
    const { artifacts, sign } = evidence(t);
    artifacts[receipt].contractDigest = sha256('unrelated contract');
    if (receipt === 'run') sign();
    expectStatus(artifacts, 'stale', new RegExp(`${receipt}.contractDigest`));
  });
}

test('updating only one contract receipt leaves evidence stale', t => {
  for (const receipt of ['run', 'review']) {
    const { artifacts, sign } = evidence(t);
    artifacts.record.obligations[0].assertions = [artifacts.run.assertions[1].fullName];
    artifacts[receipt].contractDigest = sha256(stableJson(artifacts.record));
    sign();
    const other = receipt === 'run' ? 'review' : 'run';
    expectStatus(artifacts, 'stale', new RegExp(`${other}.contractDigest`));
  }
});

test('changing the run contract also requires a fresh runDigest from review', t => {
  const { artifacts } = evidence(t);
  artifacts.record.sourceRefs = ['changed source reference'];
  artifacts.run.contractDigest = sha256(stableJson(artifacts.record));
  artifacts.review.contractDigest = artifacts.run.contractDigest;
  const result = expectStatus(artifacts, 'stale', /review.runDigest/);
  assert.deepEqual(result.issues, ['review.runDigest does not match current evidence']);
});

test('non-JSON record metadata fails contract validation without throwing', t => {
  const { artifacts } = evidence(t);
  artifacts.record.sourceRefs = artifacts.record;
  expectStatus(artifacts, 'failed', /record must be serializable as canonical JSON/);
});


for (const [file, field] of [
  [SUPPORT_FILE, 'testDigest'],
  [FIXTURE_FILE, 'testDigest'],
  ['src/sillytavern/data/portraits.json', 'implementationDigest'],
  ['src/meta/data/roles.ts', 'implementationDigest'],
  ['src/engine/notes.md', 'implementationDigest'],
  ['scripts/lib/st-enemy-evidence.mjs', 'implementationDigest'],
  ['scripts/st-enemy-acceptance.mjs', 'implementationDigest'],
]) {
  test(`editing ${file} invalidates accepted receipts through ${field}`, t => {
    const context = evidence(t);
    expectStatus(context.artifacts, 'passed');
    context.write(file, 'changed dependency bytes');
    const current = context.fingerprint();
    assert.notEqual(current[field], context.current[field]);
    const other = field === 'testDigest' ? 'implementationDigest' : 'testDigest';
    assert.equal(current[other], context.current[other]);
    expectStatus({ ...context.artifacts, current }, 'stale', new RegExp(field));
  });
}

test('changing a real support expectation from six to seven breaks its assertion and invalidates evidence', async t => {
  const context = evidence(t);
  context.write(SUPPORT_FILE, 'export const expectedManaCost = 6;');
  context.artifacts.current = context.fingerprint();
  Object.assign(context.run, context.artifacts.current);
  context.review.testDigest = context.artifacts.current.testDigest;
  context.sign();
  expectStatus(context.artifacts, 'passed');
  async function assertManaCost() {
    const source = fs.readFileSync(path.join(context.root, SUPPORT_FILE));
    // This TS helper is also valid JS; evaluate its exact bytes without a TS loader.
    const helper = await import(`data:text/javascript;base64,${source.toString('base64')}`);
    assert.equal(6, helper.expectedManaCost);
  }
  await assertManaCost();
  context.write(SUPPORT_FILE, 'export const expectedManaCost = 7;');
  await assert.rejects(assertManaCost, { code: 'ERR_ASSERTION' });
  expectStatus({ ...context.artifacts, current: context.fingerprint() }, 'stale', /testDigest/);
});

for (const file of REQUIRED_CONFIG_FILES) {
  test(`root configuration ${file} binds both implementation and tests and invalidates receipts`, t => {
    const context = evidence(t);
    context.write(file, 'changed root configuration');
    const current = context.fingerprint();
    assert.notEqual(current.testDigest, context.current.testDigest);
    assert.notEqual(current.implementationDigest, context.current.implementationDigest);
    assert.equal(current.subjectDigest, context.current.subjectDigest);
    assert.equal(current.portraitDigest, context.current.portraitDigest);
    const result = expectStatus({ ...context.artifacts, current }, 'stale');
    assert.ok(result.issues.some(issue => issue.startsWith('run.implementationDigest')));
    assert.ok(result.issues.some(issue => issue.startsWith('run.testDigest')));
  });
}

for (const [file, field] of [
  ['src/new/deep/no-extension', 'implementationDigest'],
  ['scripts/new/nested/helper.cjs', 'implementationDigest'],
  ['tests/support/nested/expectations.mjs', 'testDigest'],
  ['tests/fixtures/nested/input.bin', 'testDigest'],
]) {
  for (const operation of ['add', 'rename', 'delete']) {
    test(`${operation} discovered dependency ${file} invalidates accepted receipts`, t => {
      const context = evidence(t);
      if (operation !== 'add') context.write(file, Buffer.from([0, 255, 128]));
      const current = context.fingerprint();
      const run = { ...context.run, ...current };
      const review = { ...context.review, testDigest: current.testDigest, runDigest: sha256(stableJson(run)) };
      const artifacts = { ...context.artifacts, current, run, review };
      expectStatus(artifacts, 'passed');
      if (operation === 'add') context.write(file, Buffer.from([0, 255, 128]));
      else if (operation === 'rename') fs.renameSync(path.join(context.root, file), path.join(context.root, `${file}.renamed`));
      else fs.unlinkSync(path.join(context.root, file));
      const after = context.fingerprint();
      assert.notEqual(after[field], current[field]);
      expectStatus({ ...artifacts, current: after }, 'stale', new RegExp(field));
    });
  }
}

for (const file of ['vitest.workspace.ts', 'vite.config.mts', 'tsconfig.acceptance.json',
  'pnpm-lock.yaml', 'yarn.lock', 'bun.lockb', '.npmrc']) {
  test(`new root config ${file} is discovered and its edit/removal also invalidates receipts`, t => {
    const context = evidence(t);
    const baseline = context.current;
    context.write(file, 'new root configuration');
    const added = context.fingerprint();
    for (const field of ['testDigest', 'implementationDigest']) assert.notEqual(added[field], baseline[field]);
    expectStatus({ ...context.artifacts, current: added }, 'stale');
    const run = { ...context.run, ...added };
    const review = { ...context.review, testDigest: added.testDigest, runDigest: sha256(stableJson(run)) };
    const artifacts = { ...context.artifacts, current: added, run, review };
    expectStatus(artifacts, 'passed');
    context.write(file, 'edited root configuration');
    expectStatus({ ...artifacts, current: context.fingerprint() }, 'stale');
    fs.unlinkSync(path.join(context.root, file));
    expectStatus({ ...artifacts, current: context.fingerprint() }, 'stale');
    assert.deepEqual(context.fingerprint(), baseline);
  });
}

test('a test selector remains bound even when both selected files have identical bytes in the full tests snapshot', t => {
  const context = fixture(t);
  const other = 'tests/unit/other-enemy.test.ts';
  context.write(other, fs.readFileSync(path.join(context.root, TEST_FILE)));
  const first = context.fingerprint();
  const second = fingerprintEnemy({ root: context.root, enemy: context.enemy, testFile: other });
  assert.notEqual(first.testDigest, second.testDigest);
  assert.equal(first.implementationDigest, second.implementationDigest);
});

test('expanded scans reject escaping test helpers, script helpers and root config links', t => {
  const context = fixture(t);
  const outside = fixture(t);
  for (const file of ['tests/support/outside.mjs', 'scripts/outside.cjs', 'tsconfig.link.json']) {
    const link = path.join(context.root, file);
    if (!linkOrSkip(t, path.join(outside.root, TEST_FILE), link, 'file')) return;
    assert.throws(context.fingerprint, /escapes root/);
    fs.unlinkSync(link);
  }
});

for (const directory of ['src', 'scripts', 'tests']) {
  test(`expanded fingerprint rejects missing required ${directory} tree`, t => {
    const context = fixture(t);
    fs.renameSync(path.join(context.root, directory), path.join(context.root, `${directory}-away`));
    assert.throws(context.fingerprint, /ENOENT/);
  });
}

test('run exitCode is mandatory even if dropping it also makes the review signature stale', t => {
  const { artifacts } = evidence(t);
  delete artifacts.run.exitCode;
  const result = expectStatus(artifacts, 'failed', /run.exitCode must be 0/);
  assert.ok(result.issues.includes('review.runDigest does not match current evidence'));
});

test('only numeric zero exitCode passes independently re-signed receipts', t => {
  for (const exitCode of [undefined, null, false, true, '', '0', 1, -1, 0.5, [], {}]) {
    const { artifacts, sign } = evidence(t);
    if (exitCode === undefined) delete artifacts.run.exitCode;
    else artifacts.run.exitCode = exitCode;
    sign();
    expectStatus(artifacts, 'failed', /run.exitCode must be 0/);
  }
  const { artifacts } = evidence(t);
  assert.equal(artifacts.run.exitCode, 0);
  expectStatus(artifacts, 'passed');
});

test('selected test path rejects leaving the workspace and returning through another junction',t=>{
  const context=fixture(t),outside=fixture(t);
  const external=path.join(context.root,'data-link'),back=path.join(outside.root,'back-tests');
  try {
    if(!linkOrSkip(t,path.join(context.root,'tests'),back,'junction'))return;
    if(!linkOrSkip(t,outside.root,external,'junction'))return;
    const testFile='data-link/back-tests/unit/enemy-behavior.test.ts';
    assert.equal(fs.realpathSync(path.join(context.root,testFile)),fs.realpathSync(path.join(context.root,TEST_FILE)));
    assert.throws(()=>fingerprintEnemy({root:context.root,enemy:context.enemy,testFile}),/real workspace/);
  } finally {
    for(const link of [external,back])if(fs.lstatSync(link,{throwIfNoEntry:false})?.isSymbolicLink())fs.unlinkSync(link);
  }
});
test('selected portrait path rejects leaving the workspace and returning through another junction',t=>{
  const context=fixture(t),outside=fixture(t);
  const assets=path.join(context.root,'game-assets'),store=path.join(context.root,'portrait-store');
  const back=path.join(outside.root,'public');
  fs.renameSync(assets,store);
  try {
    if(!linkOrSkip(t,path.join(store,'public'),back,'junction'))return;
    if(!linkOrSkip(t,outside.root,assets,'junction'))return;
    assert.equal(fs.realpathSync(path.join(context.root,PORTRAIT_FILE)),fs.realpathSync(path.join(store,'public/static/portraits/Troop_6000.webp')));
    assert.throws(context.fingerprint,/real workspace/);
  } finally {
    for(const link of [assets,back])if(fs.lstatSync(link,{throwIfNoEntry:false})?.isSymbolicLink())fs.unlinkSync(link);
  }
});


// Native clauses and ST adapter/derived-family checks can share a source receipt.
const NATIVE_TEST_FILE = 'tests/unit/native-clauses.test.ts';
function multiFileEvidence(t) {
  const context = evidence(t);
  context.write(NATIVE_TEST_FILE, 'independent native source assertions');
  const { record, run, review } = context.artifacts;
  record.testFiles = [TEST_FILE, NATIVE_TEST_FILE];
  const current = fingerprintEnemy({ root: context.root, enemy: context.enemy,
    testFile: TEST_FILE, testFiles: record.testFiles });
  context.artifacts.current = current;
  Object.assign(run, current);
  run.assertions = run.assertions.map(assertion => ({ ...assertion, testFile: TEST_FILE }));
  run.assertions.push({ testFile: NATIVE_TEST_FILE, fullName: 'native source exact active clause', status: 'passed' });
  run.totalTests++; run.passedTests++;
  record.obligations[0].assertions.push({ testFile: NATIVE_TEST_FILE, fullName: 'native source exact active clause' });
  review.subjectDigest = current.subjectDigest; review.testDigest = current.testDigest;
  context.bindContract();
  return context;
}

test('multi-file evidence reuses native and ST assertions with explicit file ownership', t => {
  const context = multiFileEvidence(t);
  expectStatus(context.artifacts, 'passed');
});

test('multi-file file sets are canonical while legacy fingerprints keep their original shape', t => {
  const context = multiFileEvidence(t);
  const { current } = context.artifacts;
  const reordered = fingerprintEnemy({ root: context.root, enemy: context.enemy,
    testFile: TEST_FILE, testFiles: [...current.testFiles].reverse() });
  assert.deepEqual(current, reordered);
  assert.equal('testFiles' in context.fingerprint(), false);
  assert.notEqual(current.testDigest, context.fingerprint().testDigest);
});

for (const [label, files] of [
  ['empty', []], ['missing primary', [NATIVE_TEST_FILE]],
  ['duplicate', [TEST_FILE, TEST_FILE]], ['case duplicate', [TEST_FILE, TEST_FILE.toUpperCase()]],
  ['traversal', [TEST_FILE, '../native.test.ts']],
]) test(`multi-file selection rejects ${label}`, () => {
  assert.throws(() => evidenceTestFiles({ testFile: TEST_FILE, testFiles: files }));
});

test('multi-file fingerprint requires each selected file to actually exist', t => {
  const context = fixture(t);
  assert.throws(() => fingerprintEnemy({ root: context.root, enemy: context.enemy,
    testFile: TEST_FILE, testFiles: [TEST_FILE, NATIVE_TEST_FILE] }), /ENOENT/);
});

test('multi-file actual assertions require file identity and every registered file', t => {
  const context = multiFileEvidence(t);
  delete context.run.assertions.at(-1).testFile;
  context.sign();
  expectStatus(context.artifacts, 'failed', /testFile/);
});

test('multi-file receipts reject an unexecuted native suite despite passing ST assertions', t => {
  const context = multiFileEvidence(t);
  context.run.assertions.pop(); context.run.totalTests--; context.run.passedTests--;
  context.sign();
  expectStatus(context.artifacts, 'failed', /missing registered testFile/);
});

test('multi-file receipts reject passing assertions from an unregistered suite', t => {
  const context = multiFileEvidence(t);
  context.run.assertions.at(-1).testFile = 'tests/unit/unrelated.test.ts';
  context.sign();
  expectStatus(context.artifacts, 'failed', /unregistered testFile/);
});

test('duplicate fullNames across files require explicit file binding', t => {
  const context = multiFileEvidence(t);
  const shared = context.run.assertions[0].fullName;
  context.run.assertions.at(-1).fullName = shared;
  context.record.obligations[0].assertions = [shared];
  context.bindContract();
  expectStatus(context.artifacts, 'failed', /ambiguous test name/);
  context.record.obligations[0].assertions = [
    { testFile: TEST_FILE, fullName: shared },
    { testFile: NATIVE_TEST_FILE, fullName: shared },
  ];
  context.bindContract();
  expectStatus(context.artifacts, 'passed');
});

test('same fullName from a different file does not satisfy a native clause', t => {
  const context = multiFileEvidence(t);
  context.record.obligations[0].assertions = [{ testFile: TEST_FILE, fullName: 'native source exact active clause' }];
  context.bindContract();
  expectStatus(context.artifacts, 'failed', /nonexistent test/);
});

test('same-file duplicate assertions remain invalid with explicit file identities', t => {
  const context = multiFileEvidence(t);
  context.run.assertions.push({ ...context.run.assertions[0] });
  context.run.totalTests++; context.run.passedTests++; context.sign();
  expectStatus(context.artifacts, 'failed', /duplicate case/);
});

test('multi-file selection must match the current fingerprint and execution receipt', t => {
  const context = multiFileEvidence(t);
  delete context.run.testFiles; context.sign();
  expectStatus(context.artifacts, 'failed', /run.testFiles/);
});

test('editing a selected native test invalidates a multi-file receipt', t => {
  const context = multiFileEvidence(t);
  context.write(NATIVE_TEST_FILE, 'changed expected clause');
  context.artifacts.current = fingerprintEnemy({ root: context.root, enemy: context.enemy,
    testFile: TEST_FILE, testFiles: context.record.testFiles });
  expectStatus(context.artifacts, 'stale', /testDigest/);
});

test('malformed structured references return diagnostics instead of throwing', t => {
  const context = multiFileEvidence(t);
  context.record.obligations[0].assertions = [{ testFile: TEST_FILE, fullName: { malformed: true } }];
  context.bindContract();
  expectStatus(context.artifacts, 'failed', /invalid assertion fullName/);
});


test('batched conservative fingerprints equal every independent source fingerprint byte for byte', t => {
  const context = multiFileEvidence(t);
  const subjects = [
    { enemy: context.enemy, testFile: TEST_FILE },
    { enemy: { ...context.enemy, id: 6001, name: 'Second source' }, testFile: TEST_FILE },
    { enemy: context.enemy, testFile: TEST_FILE, testFiles: [TEST_FILE, NATIVE_TEST_FILE] },
  ];
  const batch = fingerprintEnemies({ root: context.root, subjects });
  assert.deepEqual(batch, subjects.map(subject => fingerprintEnemy({ root: context.root, ...subject })));
});

test('a fresh fingerprint batch discovers edits, additions and deletions after an earlier batch', t => {
  const context = fixture(t);
  const subjects = [{ enemy: context.enemy, testFile: TEST_FILE }];
  const batch = () => fingerprintEnemies({ root: context.root, subjects })[0];
  const original = batch();
  context.write('src/engine/new-rule.ts', 'new rule');
  assert.notEqual(batch().implementationDigest, original.implementationDigest);
  fs.unlinkSync(path.join(context.root, 'src/engine/new-rule.ts'));
  assert.deepEqual(batch(), original);
  context.write(SUPPORT_FILE, 'edited native expectation');
  assert.notEqual(batch().testDigest, original.testDigest);
});


test('explicit native source fixtures bind actual external bytes without changing legacy fingerprints', t => {
  const context = fixture(t), file = 'data/raw/native-source.json';
  context.write(file, '{"damage":7}');
  const input = { root: context.root, enemy: context.enemy, testFile: TEST_FILE, evidenceFiles: [file] };
  const before = fingerprintEnemy(input);
  assert.deepEqual(before.evidenceFiles, [file]);
  assert.notEqual(before.implementationDigest, context.fingerprint().implementationDigest);
  context.write(file, '{"damage":9}');
  assert.notEqual(fingerprintEnemy(input).implementationDigest, before.implementationDigest);
  fs.unlinkSync(path.join(context.root, file));
  assert.throws(() => fingerprintEnemy(input), /ENOENT/);
});

test('multi-file receipt cannot silently omit the declared external source fixture', t => {
  const context = multiFileEvidence(t);
  context.record.evidenceFiles = ['data/raw/native-source.json'];
  context.bindContract();
  expectStatus(context.artifacts, 'failed', /evidenceFiles does not match record/);
});

test('external evidence inputs reject traversal, duplicates and empty declarations', t => {
  const context = fixture(t);
  for (const evidenceFiles of [[], ['../source.json'], [TEST_FILE, TEST_FILE]]) {
    assert.throws(() => fingerprintEnemy({ root: context.root, enemy: context.enemy, testFile: TEST_FILE, evidenceFiles }));
  }
});
