import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evidencePath, writeEvidenceFile } from './lib/st-evidence-paths.mjs';
import { evidenceTestFiles, fingerprintEnemies, sha256, stableJson, validateEnemyEvidence } from './lib/st-enemy-evidence.mjs';

const REGISTRY = 'data/audit/st-enemy-acceptance.json';
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const key = value => process.platform === 'win32' ? value.toLowerCase() : value;

export function parseArguments(argv) {
  let selection;
  let author = 'codex-main';
  const seen = new Set();
  const id = value => {
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) {
      throw new Error('Expected a positive safe integer enemy ID');
    }
    return Number(value);
  };
  for (let index = 0; index < argv.length; index++) {
    const option = argv[index];
    if (!['--enemy', '--enemies', '--all-registered', '--author'].includes(option) || seen.has(option)) {
      throw new Error('Unknown or repeated option: ' + option);
    }
    seen.add(option);
    if (option !== '--author' && selection) throw new Error('Choose exactly one enemy selection option');
    if (option === '--all-registered') {
      selection = { all: true };
      continue;
    }
    const value = argv[++index];
    if (!nonempty(value) || value.startsWith('--')) throw new Error('Missing value for ' + option);
    if (option === '--author') author = value.trim();
    else selection = { ids: [...new Set((option === '--enemy' ? [value] : value.split(',').map(v => v.trim())).map(id))] };
  }
  if (!selection) throw new Error('Use --enemy ID, --enemies ID,ID or --all-registered');
  return { ...selection, author, single: seen.has('--enemy') };
}

// Resolve missing outputs through their existing real parents as well as checking every link.
function fileIdentity(root, relative, allowMissing = false) {
  let absolute = evidencePath(root, relative, { allowMissing });
  const suffix = [];
  while (!fs.existsSync(absolute)) {
    suffix.unshift(path.basename(absolute));
    absolute = path.dirname(absolute);
  }
  return key(path.join(fs.realpathSync(absolute), ...suffix));
}

function allowedFiles(root, record) {
  const normalized = evidenceTestFiles(record);
  for (const file of normalized) evidencePath(root, file, { allowMissing: false });
  const identities = normalized.map(file => fileIdentity(root, file));
  if (new Set(identities).size !== identities.length) throw new Error('record.testFiles must contain unique files');
  return normalized;
}

async function loadSubjects(root, records, createServer) {
  const server = await createServer({ root, server: { middlewareMode: true }, appType: 'custom' });
  try {
    const { inventoryEntry } = await server.ssrLoadModule('/src/sillytavern/enemyInventory.ts');
    const { TROOPS } = await server.ssrLoadModule('/src/data/troops.ts');
    return records.map(record => {
      const troops = TROOPS.filter(troop => troop.id === record.enemyId);
      if (troops.length !== 1) throw new Error('Expected one enemy in full runtime catalog: ' + record.enemyId);
      const subject = inventoryEntry(troops[0]);
      if (subject.id !== record.enemyId || subject.compilation?.state !== 'compiled') {
        throw new Error('Enemy blueprint is blocked or has incorrect identity: ' + record.enemyId);
      }
      return subject;
    });
  } finally {
    await server.close();
  }
}

function validateArtifacts(validate, artifacts, missing) {
  const validation = validate(artifacts);
  if (validation.status !== 'pending' || !Array.isArray(validation.issues)
    || validation.issues.length !== missing.length || !missing.every(issue => validation.issues.includes(issue))) {
    throw new Error('Invalid acceptance evidence for ' + artifacts.record.enemyId + ': ' + stableJson(validation));
  }
}

/** Strictly check the entire shared report before projecting any source receipt. */
export function readAssertions(root, files, report) {
  if (!report || report.success !== true || !Array.isArray(report.testResults)) {
    throw new Error('Vitest report must be a successful report with testResults');
  }
  const selected = new Map(files.map(file => [fileIdentity(root, file), file]));
  const suites = new Map();
  for (const suite of report.testResults) {
    if (!suite || !nonempty(suite.name) || !path.isAbsolute(suite.name)
      || suite.name.replaceAll('\\', '/').split('/').some(part => part === '.' || part === '..')) {
      throw new Error('Vitest suite has an invalid absolute test path');
    }
    const relative = path.relative(root, suite.name).replaceAll('\\', '/');
    const identity = fileIdentity(root, relative);
    const testFile = selected.get(identity);
    if (!testFile || suites.has(testFile)) throw new Error('Vitest report contains an unexpected or duplicate test file: ' + suite.name);
    if (suite.status !== 'passed' || (suite.message !== undefined && suite.message !== '')
      || !Array.isArray(suite.assertionResults) || suite.assertionResults.length === 0) {
      throw new Error('Vitest suite failed, skipped or has no assertions: ' + testFile);
    }
    const names = new Set();
    const assertions = suite.assertionResults.map(assertion => {
      if (!assertion || !nonempty(assertion.fullName) || names.has(assertion.fullName)) {
        throw new Error('Vitest suite contains an invalid or duplicate assertion: ' + testFile);
      }
      names.add(assertion.fullName);
      if (assertion.status !== 'passed' || (assertion.failureMessages !== undefined
        && (!Array.isArray(assertion.failureMessages) || assertion.failureMessages.length))) {
        throw new Error('Vitest assertion did not pass: ' + testFile + ' :: ' + assertion.fullName);
      }
      return { testFile, fullName: assertion.fullName, status: assertion.status };
    });
    suites.set(testFile, assertions);
  }
  const missing = files.filter(file => !suites.has(file));
  if (missing.length) throw new Error('Vitest report is missing selected test files: ' + missing.join(', '));
  const count = [...suites.values()].reduce((sum, assertions) => sum + assertions.length, 0);
  for (const [field, expected] of Object.entries({
    numTotalTests: count, numPassedTests: count, numFailedTests: 0, numPendingTests: 0,
    numTodoTests: 0, numFailedTestSuites: 0, numPendingTestSuites: 0,
  })) {
    if (report[field] !== expected) throw new Error('Vitest report has inconsistent ' + field);
  }
  for (const field of ['numTotalTestSuites', 'numPassedTestSuites']) {
    // Vitest counts nested describe blocks too; this is not the number of files.
    if (!Number.isSafeInteger(report[field]) || report[field] < files.length) throw new Error('Invalid Vitest ' + field);
  }
  if (report.numTotalTestSuites !== report.numPassedTestSuites
    || (report.numRuntimeErrorTestSuites !== undefined && report.numRuntimeErrorTestSuites !== 0)
    || (report.unhandledErrors !== undefined && (!Array.isArray(report.unhandledErrors) || report.unhandledErrors.length))) {
    throw new Error('Vitest report contains suite or runtime errors');
  }
  return suites;
}

/** Dependencies are injectable for isolated script tests; CLI always uses the real modules/process. */
export async function runAcceptance({ root = process.cwd(), argv = process.argv.slice(2), dependencies = {} } = {}) {
  root = fs.realpathSync(path.resolve(root));
  const options = parseArguments(argv);
  const fingerprint = dependencies.fingerprintEnemies ?? fingerprintEnemies;
  const validate = dependencies.validateEnemyEvidence ?? validateEnemyEvidence;
  const spawn = dependencies.spawnSync ?? spawnSync;
  const registryBytes = fs.readFileSync(evidencePath(root, REGISTRY, { allowMissing: false }));
  const registryDigest = sha256(registryBytes);
  const registry = JSON.parse(registryBytes.toString('utf8'));
  if (registry.version !== 1 || !Array.isArray(registry.records) || !registry.records.length) {
    throw new Error('Invalid or empty acceptance registry');
  }
  const registered = new Map();
  for (const record of registry.records) {
    if (!record || !Number.isSafeInteger(record.enemyId) || record.enemyId <= 0 || registered.has(record.enemyId)) {
      throw new Error('Invalid or duplicate registered enemy ID');
    }
    registered.set(record.enemyId, record);
  }
  const records = (options.all ? [...registered.keys()] : options.ids).map(id => {
    if (!registered.has(id)) throw new Error('Enemy is not registered: ' + id);
    return registered.get(id);
  });
  const filesByEnemy = records.map(record => allowedFiles(root, record));
  const files = [...new Set(filesByEnemy.flat())];
  const inputIdentities = new Map();
  for (const file of files) {
    const identity = fileIdentity(root, file);
    if (inputIdentities.has(identity)) throw new Error('Ambiguous aliases for selected test file: ' + file);
    inputIdentities.set(identity, file);
  }
  // Output protection covers explicit inputs of every registered source, even when
  // only a subset is executed and fingerprinted below.
  for (const record of registered.values()) {
    if (record.evidenceFiles !== undefined) {
      if (!Array.isArray(record.evidenceFiles)) throw new Error('record.evidenceFiles must be an array');
      for (const file of record.evidenceFiles) inputIdentities.set(fileIdentity(root, file), file);
    }
  }
  const outputIdentities = new Map();
  const registryIdentity = fileIdentity(root, REGISTRY);
  const outputIdentity = record => {
    const destination = evidencePath(root, record.runFile);
    if (fs.existsSync(destination) && fs.statSync(destination).nlink > 1) {
      throw new Error('Hard-linked run output path: ' + record.runFile);
    }
    const identity = fileIdentity(root, record.runFile, true);
    const realRelative = path.relative(root, identity).replaceAll('\\', '/');
    if (inputIdentities.has(identity) || identity === registryIdentity || !realRelative.includes('/')
      || /^(src|scripts|tests|game-assets|node_modules)\//i.test(realRelative)) {
      throw new Error('Overlapping or protected run output path: ' + record.runFile);
    }
    return identity;
  };
  // A selected source must not overwrite another registered source's receipt.
  for (const record of registered.values()) {
    const identity = outputIdentity(record);
    if (outputIdentities.has(identity)) throw new Error('Duplicate registered run output path: ' + record.runFile);
    outputIdentities.set(identity, record.enemyId);
  }
  const selectedOutputs = records.map(outputIdentity);
  const createServer = dependencies.createServer ?? (await import('vite')).createServer;
  const subjects = await loadSubjects(root, records, createServer);
  const fingerprintBatch = () => fingerprint({ root, subjects: records.map((record, index) => ({
    enemy: subjects[index], testFile: record.testFile,
    ...(record.testFiles === undefined ? {} : { testFiles: record.testFiles }),
    ...(record.evidenceFiles === undefined ? {} : { evidenceFiles: record.evidenceFiles }),
  })) });
  const before = fingerprintBatch();
  records.forEach((record, index) => validateArtifacts(validate, { record, current: before[index] },
    ['run evidence is missing', 'review evidence is missing']));

  const reportFile = 'data/audit/st-enemy-runs/reports/batch-' + process.pid + '-' + randomUUID() + '.json';
  fs.mkdirSync(path.dirname(evidencePath(root, reportFile)), { recursive: true });
  const reportPath = evidencePath(root, reportFile);
  const vitest = evidencePath(root, 'node_modules/vitest/vitest.mjs', { allowMissing: false });
  // Prefix a dash-leading relative filename so it is never interpreted as a CLI option.
  const filters = files.map(file => file.startsWith('-') ? './' + file : file);
  const args = [vitest, 'run', ...filters, '--reporter=json', '--outputFile=' + reportPath];
  const result = spawn(process.execPath, args, { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 20 * 1024 * 1024 });

  // Check every source, not only the source whose assertions happen to fail first.
  const after = fingerprintBatch();
  if (sha256(fs.readFileSync(evidencePath(root, REGISTRY, { allowMissing: false }))) !== registryDigest) {
    throw new Error('Acceptance registry changed during execution');
  }
  for (let index = 0; index < records.length; index++) {
    if (stableJson(before[index]) !== stableJson(after[index])) {
      throw new Error('Acceptance dependencies changed during execution: ' + records[index].enemyId);
    }
    if (outputIdentity(records[index]) !== selectedOutputs[index]) {
      throw new Error('Run output path changed during execution');
    }
  }
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal) throw new Error('Vitest execution failed: ' + (result.signal ?? result.status) + '\n' + (result.stderr ?? '').slice(-4000));
  const reportBytes = fs.readFileSync(evidencePath(root, reportFile, { allowMissing: false }));
  const reportDigest = sha256(reportBytes);
  const suites = readAssertions(root, files, JSON.parse(reportBytes.toString('utf8')));
  const command = [process.execPath, ...args].map(arg => JSON.stringify(arg)).join(' ');
  const runs = records.map((record, index) => {
    const testFiles = filesByEnemy[index];
    const assertions = testFiles.flatMap(file => suites.get(file)).map(assertion => testFiles.length > 1
      ? { ...assertion } : { fullName: assertion.fullName, status: assertion.status });
    const run = {
      version: 1, ...before[index], enemyId: record.enemyId, testFile: record.testFile.replaceAll('\\', '/'),
      ...(record.testFiles === undefined ? {} : { testFiles }), author: options.author,
      contractDigest: sha256(stableJson(record)), registryDigest, reportFile, reportDigest, command,
      assertions, totalTests: assertions.length, passedTests: assertions.length, failedTests: 0, pendingTests: 0,
      exitCode: result.status,
    };
    validateArtifacts(validate, { record, current: before[index], run }, ['review evidence is missing']);
    return run;
  });
  // Every receipt binds exactly the same preserved, original JSON bytes.
  if (sha256(fs.readFileSync(evidencePath(root, reportFile, { allowMissing: false }))) !== reportDigest) {
    throw new Error('Shared Vitest report changed during validation');
  }
  records.forEach((record, index) => writeEvidenceFile(root, record.runFile, JSON.stringify(runs[index], null, 2) + '\n'));
  const summaries = runs.map((run, index) => ({
    enemyId: run.enemyId, runFile: records[index].runFile, runDigest: sha256(stableJson(run)),
    ...before[index], contractDigest: run.contractDigest, registryDigest, reportFile, reportDigest,
    totalTests: run.totalTests, passedTests: run.passedTests, failedTests: run.failedTests, pendingTests: run.pendingTests,
    review: 'Independent review receipt is required before coverage credit',
  }));
  return options.single ? summaries[0] : { enemyIds: records.map(record => record.enemyId), testFiles: files,
    reportFile, reportDigest, registryDigest, runs: summaries };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    console.log(JSON.stringify(await runAcceptance(), null, 2));
  } catch (error) {
    console.error(error.stack ?? error);
    process.exitCode = 1;
  }
}
