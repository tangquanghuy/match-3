import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { parseArguments, runAcceptance } from '../../scripts/st-enemy-acceptance.mjs';
import {
  REQUIRED_OBLIGATIONS, fingerprintEnemies, sha256, stableJson, validateEnemyEvidence,
} from '../../scripts/lib/st-enemy-evidence.mjs';

const REGISTRY = 'data/audit/st-enemy-acceptance.json';
const A = 'tests/unit/a.test.ts';
const B = 'tests/unit/b.test.ts';
const C = 'tests/unit/c.test.ts';
const COMMON = 'shared suite 共享行为';
const REQUIRED_FILES = [
  'src/engine/ability.ts', 'src/session/state.ts', 'src/data/troops.ts',
  ...['enemyBlueprint', 'abilityDescription', 'traitDescription', 'battleRuntime',
    'derivedFormPreflight', 'economyAvailability', 'environmentScaling', 'portraits', 'json']
    .map(name => `src/sillytavern/${name}.ts`),
  'src/meta/data/races.ts', 'src/meta/data/roles.ts', 'src/sillytavern/data/portraits.json',
  'scripts/lib/st-enemy-evidence.mjs', 'scripts/st-enemy-acceptance.mjs',
  'vitest.config.ts', 'vite.config.ts', 'tsconfig.json', 'package.json', 'package-lock.json',
  'tests/helpers/shared.ts', 'tests/fixtures/expectations.json', A, B, C,
  'node_modules/vitest/vitest.mjs',
];

function fixture(t) {
  const temporaryParent = fs.realpathSync(os.tmpdir());
  const root = fs.mkdtempSync(path.join(temporaryParent, 'st-enemy-runner-'));
  t.after(() => {
    const target = path.resolve(root);
    assert.equal(path.dirname(target), temporaryParent);
    assert.ok(path.basename(target).startsWith('st-enemy-runner-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  const write = (file, content = `fixture: ${file}\n`) => {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  };
  REQUIRED_FILES.forEach(file => write(file));
  const records = [[6001, A], [6004, A], [6028, B]].map(([enemyId, testFile]) => ({
    enemyId, testFile, runFile: `data/audit/st-enemy-runs/${enemyId}.json`,
    obligations: REQUIRED_OBLIGATIONS.map(id => ({ id, assertions: [COMMON] })),
  }));
  const subjects = records.map(({ enemyId }) => ({
    id: enemyId, name: `Fixture ${enemyId}`, portrait: { assetId: `Troop_${enemyId}` },
    compilation: { state: 'compiled' },
  }));
  subjects.forEach(enemy => write(`game-assets/public/static/portraits/${enemy.portrait.assetId}.webp`));
  const registry = { version: 1, records };
  const saveRegistry = () => write(REGISTRY, JSON.stringify(registry, null, 2) + '\n');
  saveRegistry();
  const calls = { spawn: [], fingerprints: [], validation: [], createServer: [], modules: [], close: 0 };
  let reportTransform = report => report;
  let duringRun = () => {};
  let serverTransform = server => server;
  let processResult = { status: 0, signal: null, stdout: '', stderr: '' };
  let rawReport;
  let reportFile;
  const dependencies = {
    createServer: async options => {
      calls.createServer.push(options);
      return serverTransform({
        ssrLoadModule: async name => {
          calls.modules.push(name);
          if (name === '/src/sillytavern/enemyInventory.ts') return { inventoryEntry: troop => subjects.find(enemy => enemy.id === troop.id) };
          if (name === '/src/data/troops.ts') return { TROOPS: subjects.map(enemy => ({ id: enemy.id })) };
          throw new Error('Unexpected runtime module: ' + name);
        },
        close: async () => { calls.close++; },
      });
    },
    fingerprintEnemies: input => {
      calls.fingerprints.push(input);
      return fingerprintEnemies(input);
    },
    validateEnemyEvidence: artifacts => {
      calls.validation.push(artifacts);
      return validateEnemyEvidence(artifacts);
    },
    spawnSync: (executable, args, options) => {
      calls.spawn.push({ executable, args, options });
      const files = args.slice(2, args.indexOf('--reporter=json')).map(file => file.replace(/^\.\//, ''));
      const testResults = files.map(file => ({
        name: path.join(root, file), status: 'passed', message: '',
        assertionResults: [COMMON, `unique behavior ${file}`].map(fullName => ({ fullName, status: 'passed', failureMessages: [] })),
      }));
      const report = reportTransform({
        success: true, numTotalTests: testResults.length * 2, numPassedTests: testResults.length * 2,
        numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
        numTotalTestSuites: testResults.length * 2, numPassedTestSuites: testResults.length * 2,
        numFailedTestSuites: 0, numPendingTestSuites: 0, testResults,
      });
      const output = args.find(arg => arg.startsWith('--outputFile=')).slice('--outputFile='.length);
      reportFile = path.relative(root, output).replaceAll('\\', '/');
      if (report !== undefined) {
        rawReport = typeof report === 'string' ? report : ' \n' + JSON.stringify(report, null, 1) + '\n';
        write(reportFile, rawReport);
      }
      duringRun();
      return processResult;
    },
  };
  const execute = (argv = ['--all-registered']) => runAcceptance({ root, argv, dependencies });
  const readRun = index => JSON.parse(fs.readFileSync(path.join(root, records[index].runFile), 'utf8'));
  const assertNoRuns = () => records.forEach(record => assert.equal(fs.existsSync(path.join(root, record.runFile)), false, record.runFile));
  return { root, write, records, subjects, registry, saveRegistry, dependencies, calls, execute, readRun, assertNoRuns,
    transformReport: transform => { reportTransform = transform; },
    mutateDuringRun: mutate => { duringRun = mutate; },
    transformServer: transform => { serverTransform = transform; },
    result: value => { processResult = value; },
    get rawReport() { return rawReport; }, get reportFile() { return reportFile; },
  };
}

function useMultipleFiles(context) {
  context.records[1].testFiles = [B, A];
  context.records[1].obligations = REQUIRED_OBLIGATIONS.map((id, index) => ({
    id, assertions: [{ testFile: index % 2 ? B : A, fullName: COMMON }],
  }));
  context.saveRegistry();
}

test('arguments select one mode, deduplicate IDs, and preserve author support', () => {
  assert.deepEqual(parseArguments(['--enemy', '6001']), { ids: [6001], author: 'codex-main', single: true });
  assert.deepEqual(parseArguments(['--enemies', '6001, 6004,6001', '--author', ' reviewer ']),
    { ids: [6001, 6004], author: 'reviewer', single: false });
  assert.deepEqual(parseArguments(['--all-registered']), { all: true, author: 'codex-main', single: false });
});

for (const argv of [[], ['--enemy'], ['--enemies', '6001,'], ['--enemies', ',6001'], ['--enemy', '0'],
  ['--enemy', '-1'], ['--enemy', '6e3'], ['--enemy', '6001.0'], ['--enemy', '9007199254740992'],
  ['--enemy', '6001', '--all-registered'], ['--all-registered', '--enemies', '6004'],
  ['--enemy', '6001', '--enemy', '6004'], ['--author', ''], ['--all-registered', '6001'],
  ['--all-registered', '--author', 'x', '--author', 'y'], ['--unknown']]) {
  test('rejects malformed CLI: ' + JSON.stringify(argv), () => assert.throws(() => parseArguments(argv)));
}

test('--enemies runs shared files once and gives each source its real assertion slice and shared raw report hash', async t => {
  const context = fixture(t);
  const summary = await context.execute(['--enemies', '6001,6004,6028,6001', '--author', 'runner-agent']);
  assert.deepEqual(summary.enemyIds, [6001, 6004, 6028]);
  assert.deepEqual(summary.testFiles, [A, B]);
  assert.equal(context.calls.spawn.length, 1);
  assert.equal(context.calls.createServer.length, 1);
  assert.equal(context.calls.modules.length, 2);
  assert.equal(context.calls.close, 1);
  assert.equal(context.calls.fingerprints.length, 2);
  assert.ok(context.calls.fingerprints.every(input => input.subjects.length === 3));
  assert.deepEqual(context.calls.spawn[0].args.slice(1, 5), ['run', A, B, '--reporter=json']);
  assert.equal(context.calls.spawn[0].executable, process.execPath);
  assert.equal(context.calls.spawn[0].options.windowsHide, true);
  assert.equal(context.calls.spawn[0].options.cwd, context.root);
  const bytes = fs.readFileSync(path.join(context.root, summary.reportFile));
  assert.equal(bytes.toString('utf8'), context.rawReport);
  assert.equal(summary.reportDigest, sha256(bytes));
  assert.equal(summary.registryDigest, sha256(fs.readFileSync(path.join(context.root, REGISTRY))));
  for (let index = 0; index < context.records.length; index++) {
    const run = context.readRun(index);
    assert.equal(run.enemyId, context.records[index].enemyId);
    assert.equal(run.author, 'runner-agent');
    assert.equal(run.reportFile, summary.reportFile);
    assert.equal(run.reportDigest, summary.reportDigest);
    assert.equal(run.registryDigest, summary.registryDigest);
    assert.equal(run.contractDigest, sha256(stableJson(context.records[index])));
    assert.equal(run.totalTests, 2);
    assert.equal(run.passedTests, 2);
    assert.equal(run.exitCode, 0);
    assert.equal(run.testFiles, undefined);
    assert.equal(run.assertions[0].testFile, undefined);
    assert.deepEqual(run.assertions.map(assertion => assertion.fullName), [COMMON, `unique behavior ${run.testFile}`]);
    assert.equal(summary.runs[index].runDigest, sha256(stableJson(run)));
    assert.ok(run.command.includes('--outputFile='));
  }
  assert.equal(context.calls.validation.length, 6);
});

test('--enemy preserves the single-file run and summary shape while retaining the original report', async t => {
  const context = fixture(t);
  const summary = await context.execute(['--enemy', '6001']);
  assert.equal(summary.enemyId, 6001);
  assert.equal(summary.runs, undefined);
  assert.equal(context.readRun(0).testFiles, undefined);
  assert.equal(context.calls.spawn.length, 1);
  assert.equal(context.calls.spawn[0].args.includes(B), false);
  assert.equal(fs.existsSync(path.join(context.root, context.records[1].runFile)), false);
  assert.ok(fs.existsSync(path.join(context.root, summary.reportFile)));
});

test('--all-registered deduplicates the entire batch and includes all registered sources', async t => {
  const context = fixture(t);
  const summary = await context.execute();
  assert.deepEqual(summary.enemyIds, context.records.map(record => record.enemyId));
  assert.equal(context.calls.spawn.length, 1);
  assert.deepEqual(summary.testFiles, [A, B]);
});

test('multi-file sources carry path+fullName identities and forward optional testFiles in BOTH batch fingerprints', async t => {
  const context = fixture(t);
  useMultipleFiles(context);
  const summary = await context.execute();
  const run = context.readRun(1);
  assert.deepEqual(run.testFiles, [A, B]);
  assert.equal(run.testFile, A);
  assert.equal(run.totalTests, 4);
  assert.deepEqual(run.assertions.filter(assertion => assertion.fullName === COMMON).map(assertion => assertion.testFile), [A, B]);
  assert.ok(run.assertions.every(assertion => [A, B].includes(assertion.testFile)));
  assert.equal(context.readRun(0).totalTests, 2);
  assert.equal(context.readRun(2).totalTests, 2);
  for (const input of context.calls.fingerprints) {
    assert.deepEqual(input.subjects[1].testFiles, [B, A]);
    assert.equal(Object.hasOwn(input.subjects[0], 'testFiles'), false);
  }
  assert.deepEqual(summary.testFiles, [A, B]);
});

test('a unique string obligation in a multi-file report is resolved by the real lib', async t => {
  const context = fixture(t);
  useMultipleFiles(context);
  context.records[1].obligations[0].assertions = [`unique behavior ${B}`];
  context.saveRegistry();
  await context.execute();
  assert.equal(context.readRun(1).totalTests, 4);
});

test('ambiguous strings are rejected by lib before ANY source run is written', async t => {
  const context = fixture(t);
  useMultipleFiles(context);
  context.records[1].obligations[0].assertions = [COMMON];
  context.saveRegistry();
  await assert.rejects(context.execute(), /ambiguous/);
  context.assertNoRuns();
  assert.equal(context.calls.spawn.length, 1);
});

test('lib rejects an obligation bound to the wrong file even when that name passed elsewhere', async t => {
  const context = fixture(t);
  useMultipleFiles(context);
  context.records[1].obligations[0].assertions = [{ testFile: A, fullName: `unique behavior ${B}` }];
  context.saveRegistry();
  await assert.rejects(context.execute(), /nonexistent/);
  context.assertNoRuns();
});

test('shared raw reports are unique across invocations and both originals remain present', async t => {
  const context = fixture(t);
  const first = await context.execute(['--enemy', '6001']);
  const second = await context.execute(['--enemy', '6001']);
  assert.notEqual(first.reportFile, second.reportFile);
  for (const summary of [first, second]) assert.equal(sha256(fs.readFileSync(path.join(context.root, summary.reportFile))), summary.reportDigest);
});

const invalidReports = [
  ['overall failure', report => { report.success = false; }],
  ['failed suite', report => { report.testResults[0].status = 'failed'; }],
  ['suite setup error', report => { report.testResults[0].message = 'beforeAll error'; }],
  ['failed assertion', report => { report.testResults[0].assertionResults[0].status = 'failed'; }],
  ...['pending', 'skipped', 'todo', 'disabled', 'unknown'].map(status => [status + ' assertion', report => { report.testResults[0].assertionResults[0].status = status; }]),
  ['failure messages on passed case', report => { report.testResults[0].assertionResults[0].failureMessages = ['error']; }],
  ['empty suite', report => { report.testResults[0].assertionResults = []; }],
  ['missing assertion results', report => { delete report.testResults[0].assertionResults; }],
  ['duplicate path+name', report => { report.testResults[0].assertionResults[1] = report.testResults[0].assertionResults[0]; }],
  ['empty fullName', report => { report.testResults[0].assertionResults[0].fullName = ''; }],
  ['duplicate suite', report => { report.testResults.push(report.testResults[0]); }],
  ['omitted suite', report => { report.testResults.pop(); }],
  ['no suites', report => { report.testResults = []; }],
  ['relative suite path', report => { report.testResults[0].name = A; }],
  ['escaping suite path', report => { report.testResults[0].name = path.resolve(os.tmpdir(), 'outside.test.ts'); }],
  ['unexpected suite', (report, context) => { report.testResults[0].name = path.join(context.root, C); }],
  ['traversal suite path', (report, context) => { report.testResults[0].name = context.root + '/tests/unit/../unit/a.test.ts'; }],
  ['runtime errors', report => { report.numRuntimeErrorTestSuites = 1; }],
  ['unhandled errors', report => { report.unhandledErrors = ['error']; }],
  ...['numTotalTests', 'numPassedTests', 'numFailedTests', 'numPendingTests', 'numTodoTests',
    'numFailedTestSuites', 'numPendingTestSuites', 'numPassedTestSuites', 'numTotalTestSuites']
    .map(field => ['inconsistent ' + field, report => { report[field]++; }]),
];
for (const [label, corrupt] of invalidReports) {
  test('rejects ' + label + ' without replacing existing receipts', async t => {
    const context = fixture(t);
    context.records.forEach(record => context.write(record.runFile, 'existing receipt\n'));
    context.transformReport(report => { corrupt(report, context); return report; });
    await assert.rejects(context.execute());
    context.records.forEach(record => assert.equal(fs.readFileSync(path.join(context.root, record.runFile), 'utf8'), 'existing receipt\n'));
    assert.equal(context.calls.spawn.length, 1);
    assert.equal(fs.readFileSync(path.join(context.root, context.reportFile), 'utf8'), context.rawReport);
  });
}

test('reports ALL missing files from a shared multi-file report', async t => {
  const context = fixture(t);
  useMultipleFiles(context);
  context.records[2].testFile = C;
  context.saveRegistry();
  context.transformReport(report => { report.testResults = []; return report; });
  await assert.rejects(context.execute(), error => [A, B, C].every(file => error.message.includes(file)));
  context.assertNoRuns();
});

for (const [label, result] of [
  ['exit failure', { status: 1, stderr: 'test failure' }],
  ['signal', { status: null, signal: 'SIGTERM' }],
  ['signal with zero status', { status: 0, signal: 'SIGTERM' }],
  ['spawn error', { status: null, error: new Error('spawn fixture error') }],
]) {
  test('rejects ' + label + ' even if a passing JSON report exists', async t => {
    const context = fixture(t);
    context.result(result);
    await assert.rejects(context.execute());
    context.assertNoRuns();
    assert.equal(context.calls.fingerprints.length, 2);
    assert.ok(fs.existsSync(path.join(context.root, context.reportFile)));
  });
}

for (const [label, transform] of [['missing report', () => undefined], ['malformed report', () => '{bad json']]) {
  test('rejects ' + label, async t => {
    const context = fixture(t);
    context.transformReport(transform);
    await assert.rejects(context.execute());
    context.assertNoRuns();
  });
}

for (const file of ['src/engine/ability.ts', 'scripts/lib/st-enemy-evidence.mjs', A, B,
  'tests/helpers/shared.ts', 'tests/fixtures/expectations.json', 'vitest.config.ts',
  'package-lock.json', 'game-assets/public/static/portraits/Troop_6028.webp']) {
  test('binds before/after bytes of ' + file + ' for the whole batch', async t => {
    const context = fixture(t);
    context.mutateDuringRun(() => context.write(file, 'changed during execution\n'));
    await assert.rejects(context.execute(), /dependencies changed/);
    context.assertNoRuns();
    assert.equal(context.calls.fingerprints.length, 2);
  });
}

for (const file of ['src/engine/new-helper.ts', 'scripts/new-helper.mjs', 'tests/fixtures/new.json', 'vitest.workspace.ts', '.npmrc']) {
  test('binds newly added dependency ' + file, async t => {
    const context = fixture(t);
    context.mutateDuringRun(() => context.write(file));
    await assert.rejects(context.execute(), /dependencies changed/);
    context.assertNoRuns();
  });
}

test('rejects deleted dependencies', async t => {
  const context = fixture(t);
  context.mutateDuringRun(() => fs.unlinkSync(path.join(context.root, 'vite.config.ts')));
  await assert.rejects(context.execute());
  context.assertNoRuns();
});

test('binds unselected registry records and exact registry bytes, including whitespace', async t => {
  const context = fixture(t);
  context.mutateDuringRun(() => context.write(REGISTRY, JSON.stringify(context.registry) + '\n\n'));
  await assert.rejects(context.execute(['--enemy', '6001']), /registry changed/);
  context.assertNoRuns();
});

for (const testFiles of [[], [A, A], [A, A.replaceAll('/', '\\')], [B], [A, '../outside.ts'], [A, '/outside.ts'],
  [A, 'tests/../unit/a.test.ts'], [A, 'tests/unit/missing.test.ts'], [A, 'tests/unit'], 'not-an-array']) {
  test('rejects invalid registered testFiles: ' + JSON.stringify(testFiles), async t => {
    const context = fixture(t);
    context.records[0].testFiles = testFiles;
    context.saveRegistry();
    await assert.rejects(context.execute());
    assert.equal(context.calls.spawn.length, 0);
    context.assertNoRuns();
  });
}

for (const badPath of ['../outside.json', 'C:\\outside.json', 'data/./run.json', 'data//run.json', 'data/run.json ',
  REGISTRY, A, 'src/engine/overwrite.json', 'scripts/new.json', 'package.json']) {
  test('rejects unsafe or protected output path: ' + badPath, async t => {
    const context = fixture(t);
    context.records[0].runFile = badPath;
    context.saveRegistry();
    await assert.rejects(context.execute());
    assert.equal(context.calls.spawn.length, 0);
    assert.equal(fs.readFileSync(path.join(context.root, A), 'utf8'), `fixture: ${A}\n`);
  });
}

test('rejects run destinations shared by different enemies', async t => {
  const context = fixture(t);
  context.records[1].runFile = context.records[0].runFile;
  context.saveRegistry();
  await assert.rejects(context.execute(), /output path/);
  assert.equal(context.calls.spawn.length, 0);
  context.assertNoRuns();
});

test('rejects output symlinks escaping the real workspace', async t => {
  const context = fixture(t);
  const outside = fixture(t);
  fs.mkdirSync(path.join(context.root, 'data/audit/st-enemy-runs'), { recursive: true });
  fs.symlinkSync(outside.root, path.join(context.root, 'data/audit/st-enemy-runs/outside'), process.platform === 'win32' ? 'junction' : 'dir');
  context.records[0].runFile = 'data/audit/st-enemy-runs/outside/run.json';
  context.saveRegistry();
  await assert.rejects(context.execute(), /leaves real workspace/);
  assert.equal(context.calls.spawn.length, 0);
  assert.equal(fs.existsSync(path.join(outside.root, 'run.json')), false);
});

test('rejects selected tests reached through a parent link outside the workspace', async t => {
  const context = fixture(t);
  const outside = fixture(t);
  fs.symlinkSync(path.join(outside.root, 'tests'), path.join(context.root, 'tests/outside'), process.platform === 'win32' ? 'junction' : 'dir');
  context.records[0].testFile = 'tests/outside/unit/a.test.ts';
  context.saveRegistry();
  await assert.rejects(context.execute(), /leaves real workspace/);
  assert.equal(context.calls.spawn.length, 0);
  context.assertNoRuns();
});

test('rejects redirected run paths introduced during Vitest execution', async t => {
  const context = fixture(t);
  context.records[0].runFile = 'data/audit/st-enemy-runs/redirected/6001.json';
  context.saveRegistry();
  context.mutateDuringRun(() => {
    fs.mkdirSync(path.join(context.root, 'data/other-runs'), { recursive: true });
    fs.symlinkSync(path.join(context.root, 'data/other-runs'), path.join(context.root, 'data/audit/st-enemy-runs/redirected'), process.platform === 'win32' ? 'junction' : 'dir');
  });
  await assert.rejects(context.execute(), /output path changed/);
  context.assertNoRuns();
});

for (const [label, mutate] of [
  ['empty registry', context => { context.registry.records = []; }],
  ['registry version', context => { context.registry.version = 2; }],
  ['duplicate enemy', context => { context.records.push({ ...context.records[0] }); }],
  ['invalid enemy', context => { context.records[0].enemyId = '6001'; }],
  ['missing primary', context => { delete context.records[0].testFile; }],
  ['missing obligation', context => { context.records[0].obligations.pop(); }],
]) {
  test('rejects ' + label + ' before starting Vitest', async t => {
    const context = fixture(t);
    mutate(context);
    context.saveRegistry();
    await assert.rejects(context.execute());
    assert.equal(context.calls.spawn.length, 0);
    context.assertNoRuns();
  });
}

test('rejects an unregistered selected ID', async t => {
  const context = fixture(t);
  await assert.rejects(context.execute(['--enemies', '6001,9999']), /not registered/);
  assert.equal(context.calls.spawn.length, 0);
  context.assertNoRuns();
});

for (const failure of ['blocked', 'absent', 'module error']) {
  test('closes the runtime server and starts no tests on ' + failure, async t => {
    const context = fixture(t);
    if (failure === 'blocked') context.subjects[0].compilation.state = 'blocked';
    if (failure === 'absent') context.subjects.splice(0, 1);
    if (failure === 'module error') context.transformServer(server => ({ ...server, ssrLoadModule: async () => { throw new Error('fixture module error'); } }));
    await assert.rejects(context.execute());
    assert.equal(context.calls.close, 1);
    assert.equal(context.calls.spawn.length, 0);
    context.assertNoRuns();
  });
}

test('real child-process execution accepts a fake Vitest executable and preserves its exact raw report', async t => {
  const context = fixture(t);
  const testResults = [A, B].map(file => ({ name: path.join(context.root, file), status: 'passed', message: '',
    assertionResults: [{ fullName: COMMON, status: 'passed', failureMessages: [] }] }));
  const report = { success: true, numTotalTests: 2, numPassedTests: 2, numFailedTests: 0, numPendingTests: 0,
    numTodoTests: 0, numTotalTestSuites: 2, numPassedTestSuites: 2, numFailedTestSuites: 0, numPendingTestSuites: 0, testResults };
  const original = '\n' + JSON.stringify(report, null, 2) + '\n';
  context.write('node_modules/vitest/vitest.mjs', `import fs from 'node:fs';
    const expected = ${JSON.stringify([A, B])};
    if (JSON.stringify(process.argv.slice(3, 5)) !== JSON.stringify(expected)) throw new Error('Wrong CLI filters');
    const output = process.argv.find(arg => arg.startsWith('--outputFile=')).slice('--outputFile='.length);
    fs.writeFileSync(output, ${JSON.stringify(original)});
  `);
  context.dependencies.spawnSync = (...args) => {
    context.calls.spawn.push(args);
    return spawnSync(...args);
  };
  const summary = await context.execute();
  assert.equal(context.calls.spawn.length, 1);
  assert.equal(fs.readFileSync(path.join(context.root, summary.reportFile), 'utf8'), original);
  assert.equal(summary.reportDigest, sha256(original));
  assert.deepEqual(context.readRun(0).assertions, [{ fullName: COMMON, status: 'passed' }]);
});

test('single selection also rejects a destination shared with an unselected registered source', async t => {
  const context = fixture(t);
  context.records[1].runFile = context.records[0].runFile;
  context.saveRegistry();
  await assert.rejects(context.execute(['--enemy', '6001']), /output path/);
  assert.equal(context.calls.spawn.length, 0);
  context.assertNoRuns();
});

for (const when of ['before', 'during']) {
  test('rejects a run output hard-linked to an input ' + when + ' execution', async t => {
    const context = fixture(t);
    const link = () => {
      fs.mkdirSync(path.dirname(path.join(context.root, context.records[0].runFile)), { recursive: true });
      fs.linkSync(path.join(context.root, REGISTRY), path.join(context.root, context.records[0].runFile));
    };
    if (when === 'before') link();
    else context.mutateDuringRun(link);
    const original = fs.readFileSync(path.join(context.root, REGISTRY));
    await assert.rejects(context.execute(), /Hard-linked/);
    assert.deepEqual(fs.readFileSync(path.join(context.root, REGISTRY)), original);
    assert.equal(fs.existsSync(path.join(context.root, context.records[1].runFile)), false);
  });
}

const EXTERNAL = ['data/raw/native-whole-skill.json', 'artifacts/gow-source-fixtures/skill-6001.json'];
function declareExternal(context) {
  EXTERNAL.forEach(file => context.write(file, JSON.stringify({ file, damage: 10 }) + '\n'));
  context.records[1].evidenceFiles = [...EXTERNAL].reverse();
  context.saveRegistry();
}

test('optional external evidenceFiles are forwarded in both snapshots and emitted from current on the source run', async t => {
  const context = fixture(t);
  declareExternal(context);
  await context.execute();
  assert.deepEqual(context.readRun(1).evidenceFiles, [...EXTERNAL].sort());
  assert.equal(Object.hasOwn(context.readRun(0), 'evidenceFiles'), false);
  assert.equal(context.calls.fingerprints.length, 2);
  for (const input of context.calls.fingerprints) {
    assert.deepEqual(input.subjects[1].evidenceFiles, [...EXTERNAL].reverse());
    assert.equal(Object.hasOwn(input.subjects[0], 'evidenceFiles'), false);
  }
});

for (const file of EXTERNAL) {
  test('rejects shared results when declared external fixture changes: ' + file, async t => {
    const context = fixture(t);
    declareExternal(context);
    context.mutateDuringRun(() => context.write(file, '{"damage":999}\n'));
    await assert.rejects(context.execute(), /dependencies changed/);
    context.assertNoRuns();
    assert.equal(context.calls.spawn.length, 1);
    assert.equal(context.calls.fingerprints.length, 2);
    assert.ok(fs.existsSync(path.join(context.root, context.reportFile)));
  });
}

test('rejects deleted declared external fixture', async t => {
  const context = fixture(t);
  declareExternal(context);
  context.mutateDuringRun(() => fs.unlinkSync(path.join(context.root, EXTERNAL[0])));
  await assert.rejects(context.execute());
  context.assertNoRuns();
});

for (const evidenceFiles of [[], [EXTERNAL[0], EXTERNAL[0]], ['../outside.json'], ['data/raw/missing.json'],
  ['artifacts/gow-source-fixtures'], null, 'not-an-array']) {
  test('rejects invalid external evidenceFiles: ' + JSON.stringify(evidenceFiles), async t => {
    const context = fixture(t);
    declareExternal(context);
    context.records[1].evidenceFiles = evidenceFiles;
    context.saveRegistry();
    await assert.rejects(context.execute());
    assert.equal(context.calls.spawn.length, 0);
    context.assertNoRuns();
  });
}

test('external evidence files are protected from being used as run outputs', async t => {
  const context = fixture(t);
  declareExternal(context);
  context.records[0].runFile = EXTERNAL[0];
  context.saveRegistry();
  const original = fs.readFileSync(path.join(context.root, EXTERNAL[0]));
  await assert.rejects(context.execute(), /output path/);
  assert.equal(context.calls.spawn.length, 0);
  assert.deepEqual(fs.readFileSync(path.join(context.root, EXTERNAL[0])), original);
});

for (const [mode, argv, enemyIds] of [
  ['single', ['--enemy', '6001'], [6001]],
  ['subset', ['--enemies', '6001,6028'], [6001, 6028]],
]) {
  for (const file of EXTERNAL) {
    test(`${mode} selection protects unselected external input: ${file}`, async t => {
      const context = fixture(t);
      declareExternal(context); // Only unselected enemy 6004 declares these inputs.
      context.records[0].runFile = file;
      context.saveRegistry();
      const originals = EXTERNAL.map(input => fs.readFileSync(path.join(context.root, input)));
      await assert.rejects(context.execute(argv), /output path/);
      EXTERNAL.forEach((input, index) => assert.deepEqual(fs.readFileSync(path.join(context.root, input)), originals[index]));
      context.records.slice(1).forEach(record => assert.equal(fs.existsSync(path.join(context.root, record.runFile)), false));
      assert.equal(context.calls.createServer.length, 0);
      assert.equal(context.calls.fingerprints.length, 0);
      assert.equal(context.calls.spawn.length, 0);
    });
  }

  test(`${mode} selection protects unselected external inputs without expanding tests or fingerprints`, async t => {
    const context = fixture(t);
    declareExternal(context);
    context.records[1].testFile = C;
    context.subjects[1].compilation.state = 'blocked';
    context.saveRegistry();
    const originals = EXTERNAL.map(input => fs.readFileSync(path.join(context.root, input)));
    await context.execute(argv);
    assert.equal(context.calls.spawn.length, 1);
    assert.equal(context.calls.spawn[0].args.includes(C), false);
    assert.equal(context.calls.fingerprints.length, 2);
    for (const input of context.calls.fingerprints) {
      assert.deepEqual(input.subjects.map(subject => subject.enemy.id), enemyIds);
      assert.ok(input.subjects.every(subject => !Object.hasOwn(subject, 'evidenceFiles')));
    }
    EXTERNAL.forEach((input, index) => assert.deepEqual(fs.readFileSync(path.join(context.root, input)), originals[index]));
    assert.equal(fs.existsSync(path.join(context.root, context.records[1].runFile)), false);
  });
}
