import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { evidencePath } from './st-evidence-paths.mjs';

export const REQUIRED_OBLIGATIONS = Object.freeze([
  'portrait', 'active', 'traits', 'target', 'mana-cost', 'mana-colors',
  'scaling', 'context', 'description', 'role', 'refresh', 'determinism', 'invalid-action',
]);

const DIGESTS = ['subjectDigest', 'testDigest', 'implementationDigest', 'portraitDigest'];
const IMPLEMENTATION_FILES = [
  'src/sillytavern/enemyBlueprint.ts',
  'src/sillytavern/abilityDescription.ts',
  'src/sillytavern/traitDescription.ts',
  'src/sillytavern/battleRuntime.ts',
  'src/sillytavern/derivedFormPreflight.ts',
  'src/sillytavern/economyAvailability.ts',
  'src/sillytavern/environmentScaling.ts',
  'src/sillytavern/portraits.ts',
  'src/sillytavern/json.ts',
  'src/meta/data/races.ts',
  'src/meta/data/roles.ts',
  'src/sillytavern/data/portraits.json',
  'scripts/lib/st-enemy-evidence.mjs',
  'scripts/st-enemy-acceptance.mjs',
];
const REQUIRED_CONFIG_FILES = [
  'vitest.config.ts', 'vite.config.ts', 'tsconfig.json', 'package.json', 'package-lock.json',
];
// Discover additional root config variants and package-manager inputs on every
// call. Required baseline configs above still fail loudly when removed.
const ROOT_CONFIG = /^(?:(?:vite|vitest)(?:[.-].*)?\.(?:[cm]?[jt]s|json)|tsconfig(?:[.-].*)?\.jsonc?|package(?:[.-].*)?\.(?:json|jsonc|yaml|yml)|npm-shrinkwrap\.json|pnpm-(?:lock|workspace)\.yaml|yarn\.lock|bun\.lockb?|\.npmrc|\.yarnrc(?:\.yml)?|\.pnp\.[cm]?js)$/;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const validId = value => (Number.isSafeInteger(value) && value >= 0)
  || (nonempty(value) && value === value.trim());
const validDigest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** Canonical JSON: sorted object keys, preserved array order, no lossy coercions. */
export function stableJson(value) {
  const ancestors = new Set();
  function encode(item) {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') {
      return JSON.stringify(item);
    }
    if (typeof item === 'number' && Number.isFinite(item)) return JSON.stringify(item);
    if (!Array.isArray(item) && !isObject(item)) throw new TypeError('Expected a JSON value');
    if (ancestors.has(item)) throw new TypeError('Circular JSON value');
    ancestors.add(item);
    try {
      if (Array.isArray(item)) {
        return `[${Array.from(item, child => encode(child)).join(',')}]`;
      }
      return `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${encode(item[key])}`).join(',')}}`;
    } finally {
      ancestors.delete(item);
    }
  }
  return encode(value);
}

export function sha256(value) {
  if (typeof value !== 'string' && !Buffer.isBuffer(value)) {
    throw new TypeError('sha256 expects a string or Buffer');
  }
  return createHash('sha256').update(value).digest('hex');
}

function relativeFile(value) {
  if (!nonempty(value) || value !== value.trim() || /[:\0]/.test(value)
    || path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw new Error('Expected a relative path inside root');
  }
  const normalized = value.replaceAll('\\', '/');
  if (normalized.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part))) {
    throw new Error('Path must stay inside root without traversal or ambiguous segments');
  }
  return normalized;
}

function insideRoot(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative));
}

/** Canonical per-source file set; the primary file remains required for old records. */
export function evidenceTestFiles({ testFile, testFiles }) {
  const primary = relativeFile(testFile);
  if (testFiles === undefined) return [primary];
  if (!Array.isArray(testFiles) || testFiles.length === 0) {
    throw new TypeError('testFiles must be a nonempty file list');
  }
  const files = testFiles.map(relativeFile);
  // The workspace may run on Windows: alternate casing is not a second file.
  if (new Set(files.map(file => file.toLowerCase())).size !== files.length) {
    throw new Error('testFiles must contain unique file paths');
  }
  if (!files.includes(primary)) throw new Error('testFiles must include testFile');
  return files.sort();
}

/** Explicit source fixtures outside the conservative src/scripts/tests trees. */
export function evidenceInputFiles(files) {
  if (files === undefined) return [];
  if (!Array.isArray(files) || files.length === 0) throw new TypeError('evidenceFiles must be a nonempty file list');
  const normalized = files.map(relativeFile);
  if (new Set(normalized.map(file => file.toLowerCase())).size !== normalized.length) {
    throw new Error('evidenceFiles must contain unique file paths');
  }
  return normalized.sort();
}

/** Synchronous so inventory/runner callers can fingerprint before executing tests. */
function fingerprintEnemyFromSnapshot({ root, enemy, testFile, testFiles, evidenceFiles }, cache) {
  if (!nonempty(root)) throw new TypeError('root must name a directory');
  if (!isObject(enemy) || !validId(enemy.id)) throw new TypeError('enemy.id is required');
  if (!isObject(enemy.portrait) || typeof enemy.portrait.assetId !== 'string'
    || !/^[A-Za-z0-9_-]+$/.test(enemy.portrait.assetId)) {
    throw new TypeError('enemy.portrait.assetId must identify a portrait inside root');
  }
  const canonicalRoot = fs.realpathSync(path.resolve(root));
  if (!fs.statSync(canonicalRoot).isDirectory()) throw new Error('root must be a directory');
  const normalizedTestFile = relativeFile(testFile);
  const selectedTestFiles = evidenceTestFiles({ testFile, testFiles });
  const selectedEvidenceFiles = evidenceInputFiles(evidenceFiles);
  function checked(relative, kind) {
    const absolute = path.resolve(canonicalRoot, relativeFile(relative));
    const real = fs.realpathSync(absolute); // Missing dependencies are errors, including broken links.
    if (!insideRoot(canonicalRoot, absolute) || !insideRoot(canonicalRoot, real)) {
      throw new Error(`Path escapes root: ${relative}`);
    }
    const stat = fs.statSync(real);
    if (kind === 'file' && !stat.isFile()) throw new Error(`Expected file: ${relative}`);
    if (kind === 'directory' && !stat.isDirectory()) throw new Error(`Expected directory: ${relative}`);
    return { real, stat };
  }
  function collect(directory, ancestors = new Set()) {
    const cacheKey = `${canonicalRoot}\0${directory}`;
    if (cache?.directories.has(cacheKey)) return cache.directories.get(cacheKey);
    const { real } = checked(directory, 'directory');
    if (ancestors.has(real)) throw new Error(`Directory link cycle: ${directory}`);
    const nextAncestors = new Set([...ancestors, real]);
    const files = [];
    for (const name of fs.readdirSync(real).sort()) {
      const relative = `${directory}/${name}`;
      const { stat } = checked(relative);
      if (stat.isDirectory()) files.push(...collect(relative, nextAncestors));
      else {
        checked(relative, 'file');
        files.push(relative);
      }
    }
    cache?.directories.set(cacheKey, files);
    return files;
  }
  function digestFiles(files) {
    const selected = [...new Set(files)].sort();
    const cacheKey = stableJson([canonicalRoot, selected]);
    if (cache?.digests.has(cacheKey)) return cache.digests.get(cacheKey);
    const hash = createHash('sha256');
    for (const relative of selected) {
      const { real } = checked(relative, 'file');
      const content = fs.readFileSync(real);
      // Length framing binds both path and raw bytes without delimiter collisions.
      hash.update(`${Buffer.byteLength(relative)}:`).update(relative);
      hash.update(`${content.length}:`).update(content);
    }
    const digest = hash.digest('hex');
    cache?.digests.set(cacheKey, digest);
    return digest;
  }
  // A conservative directory snapshot, not an import-graph resolver: bind all
  // file types under src/scripts/tests so newly introduced helpers and fixtures
  // invalidate old evidence too. Inputs outside these trees/root configs and the
  // selected portrait are not implicitly covered (e.g. external packages/env).
  for (const file of [...IMPLEMENTATION_FILES, ...REQUIRED_CONFIG_FILES]) checked(file, 'file');
  for (const directory of ['src/engine', 'src/session', 'src/data']) {
    if (!collect(directory).some(file => /\.(ts|json)$/.test(file))) {
      throw new Error(`Missing .ts/.json dependencies: ${directory}`);
    }
  }
  const configs = [...REQUIRED_CONFIG_FILES,
    ...fs.readdirSync(canonicalRoot).filter(name => ROOT_CONFIG.test(name))];
  const implementation = [...collect('src'), ...collect('scripts'), ...configs];
  const tests = collect('tests');
  for (const file of [...selectedTestFiles, ...selectedEvidenceFiles]) {
    checked(file, 'file');
    // A path must stay inside at every parent, even if a later link returns inside.
    evidencePath(canonicalRoot, file, {allowMissing:false});
  }
  const portraitFile = `game-assets/public/static/portraits/${enemy.portrait.assetId}.webp`;
  checked(portraitFile, 'file');
  evidencePath(canonicalRoot, portraitFile, {allowMissing:false});
  const { assemblerVerified, assemblyEvidence, ...subject } = enemy;
  return {
    enemyId: enemy.id,
    testFile: normalizedTestFile,
    ...(testFiles === undefined ? {} : { testFiles: selectedTestFiles }),
    ...(evidenceFiles === undefined ? {} : { evidenceFiles: selectedEvidenceFiles }),
    subjectDigest: sha256(stableJson(subject)),
    testDigest: sha256(stableJson({
      testFile: normalizedTestFile,
      ...(testFiles === undefined ? {} : { testFiles: selectedTestFiles }),
      filesDigest: digestFiles([...tests, ...selectedTestFiles, ...configs]),
    })),
    implementationDigest: digestFiles([...implementation, ...selectedEvidenceFiles]),
    portraitDigest: digestFiles([portraitFile]),
  };
}

/** Read a fresh conservative snapshot for a single source. */
export function fingerprintEnemy(input) {
  return fingerprintEnemyFromSnapshot(input);
}

/**
 * One synchronous batch shares identical directory/content reads only inside
 * this invocation. No cache survives the call, and no dependency is omitted.
 * Runners call it before AND after execution to reject a changing workspace.
 */
export function fingerprintEnemies({ root, subjects }) {
  if (!Array.isArray(subjects)) throw new TypeError('subjects must be an array');
  const cache = { directories: new Map(), digests: new Map() };
  return subjects.map(subject => fingerprintEnemyFromSnapshot({ ...subject, root }, cache));
}

/** Validate supplied artifacts, never infer acceptance from inventory flags. */
export function validateEnemyEvidence({ record, current, run, review } = {}) {
  const failures = [];
  const stale = [];
  const missing = [];
  let invalidContract = false;
  let invalidExecution = false;
  const fail = message => failures.push(message);
  const requireObject = (value, label) => {
    if (isObject(value)) return true;
    fail(`${label} must be an object`);
    return false;
  };
  const checkPath = (value, label) => {
    try {
      return relativeFile(value);
    } catch {
      fail(`${label} must be a relative file path inside root`);
      return undefined;
    }
  };
  const checkDigest = (value, expected, label) => {
    if (!validDigest(value)) fail(`${label} must be a SHA-256 digest`);
    else if (validDigest(expected) && value !== expected) stale.push(`${label} does not match current evidence`);
  };
  function obligations(value, label, withAssertions) {
    if (!Array.isArray(value)) {
      fail(`${label} must list every required obligation`);
      return [];
    }
    const seen = new Set();
    const references = [];
    for (const entry of value) {
      if (withAssertions && !isObject(entry)) {
        fail(`${label} entry must be an object`);
        continue;
      }
      const id = withAssertions ? entry.id : entry;
      if (typeof id !== 'string') {
        fail(`${label} obligation id must be a string`);
        continue;
      }
      if (!REQUIRED_OBLIGATIONS.includes(id)) fail(`${label} has unknown obligation: ${String(id)}`);
      if (seen.has(id)) fail(`${label} has duplicate obligation: ${String(id)}`);
      seen.add(id);
      if (withAssertions) {
        if (!Array.isArray(entry.assertions) || entry.assertions.length === 0) {
          fail(`${label}.${String(id)} must reference passing assertions`);
          continue;
        }
        const names = new Set();
        for (const reference of entry.assertions) {
          const fullName = typeof reference === 'string' ? reference : reference?.fullName;
          let file;
          if (typeof reference !== 'string') {
            if (!isObject(reference) || Object.keys(reference).some(key => !['testFile', 'fullName'].includes(key))) {
              fail(`${label}.${String(id)} has an invalid assertion reference`);
              continue;
            }
            file = checkPath(reference.testFile, `${label}.${String(id)}.testFile`);
            if (!testFiles.includes(file)) fail(`${label}.${String(id)} references an unregistered testFile`);
          }
          if (!nonempty(fullName)) {
            fail(`${label}.${String(id)} has an invalid assertion fullName`);
            continue;
          }
          const key = stableJson([file ?? null, fullName]);
          if (names.has(key)) fail(`${label}.${String(id)} has duplicate assertion: ${fullName}`);
          else references.push({ id, fullName, testFile: file });
          names.add(key);
        }
      }
    }
    for (const id of REQUIRED_OBLIGATIONS) {
      if (!seen.has(id)) fail(`${label} is missing obligation: ${id}`);
    }
    return references;
  }

  const recordOK = requireObject(record, 'record');
  const currentOK = requireObject(current, 'current');
  let enemyId;
  let testFile;
  let testFiles = [];
  const checkFiles = (value, label) => {
    try { return evidenceTestFiles(value); }
    catch (error) { fail(`${label}.testFiles: ${error.message}`); return []; }
  };
  const checkInputs = (value, label) => {
    try { return evidenceInputFiles(value.evidenceFiles); }
    catch (error) { fail(`${label}.evidenceFiles: ${error.message}`); return []; }
  };
  let inputFiles = [];
  let references = [];
  let recordDigest;
  if (recordOK) {
    try {
      recordDigest = sha256(stableJson(record));
    } catch {
      fail('record must be serializable as canonical JSON');
    }
    enemyId = record.enemyId ?? record.id;
    if (!validId(enemyId)) fail('record.enemyId (or record.id) is required');
    if (record.id !== undefined && record.id !== enemyId) fail('record.id does not match record.enemyId');
    testFile = checkPath(record.testFile, 'record.testFile');
    testFiles = checkFiles(record, 'record');
    inputFiles = checkInputs(record, 'record');
    references = obligations(record.obligations, 'record.obligations', true);
  }
  if (currentOK) {
    if (!validId(current.enemyId) || current.enemyId !== enemyId) fail('current.enemyId does not match record');
    const currentFile = checkPath(current.testFile, 'current.testFile');
    if (currentFile !== testFile) fail('current.testFile does not match record');
    if (stableJson(checkFiles(current, 'current')) !== stableJson(testFiles)) fail('current.testFiles does not match record');
    if (stableJson(checkInputs(current, 'current')) !== stableJson(inputFiles)) fail('current.evidenceFiles does not match record');
    for (const field of DIGESTS) {
      if (!validDigest(current[field])) fail(`current.${field} must be a SHA-256 digest`);
    }
  }
  function checkIdentity(value, label) {
    if (!validId(value.enemyId) || value.enemyId !== enemyId
      || (currentOK && value.enemyId !== current.enemyId)) fail(`${label}.enemyId does not match record/current`);
  }

  const runMissing = run === null || run === undefined;
  const reviewMissing = review === null || review === undefined;
  if (runMissing) missing.push('run evidence is missing');
  if (reviewMissing) missing.push('review evidence is missing');
  const runOK = !runMissing && requireObject(run, 'run');
  const reviewOK = !reviewMissing && requireObject(review, 'review');
  // Both receipts bind the full, unmodified record, including assertion mappings,
  // sourceRefs and path spelling. No record fields are excluded from this hash.
  for (const [label, receipt, present] of [['run', run, runOK], ['review', review, reviewOK]]) {
    if (!present) continue;
    if (!validDigest(receipt.contractDigest)) invalidContract = true;
    checkDigest(receipt.contractDigest, recordDigest, `${label}.contractDigest`);
  }
  if (runOK) {
    if (run.version !== 1) fail('run.version must be 1');
    checkIdentity(run, 'run');
    const runFile = checkPath(run.testFile, 'run.testFile');
    if (runFile !== testFile || (currentOK && runFile !== checkPath(current.testFile, 'current.testFile'))) {
      fail('run.testFile does not match record/current');
    }
    if (stableJson(checkFiles(run, 'run')) !== stableJson(testFiles)) fail('run.testFiles does not match record/current');
    if (stableJson(checkInputs(run, 'run')) !== stableJson(inputFiles)) fail('run.evidenceFiles does not match record/current');
    for (const field of DIGESTS) checkDigest(run[field], currentOK ? current[field] : undefined, `run.${field}`);
    if (!nonempty(run.author)) fail('run.author must be nonempty');
    if (!nonempty(run.command)) fail('run.command must be nonempty');
    if (run.exitCode !== 0) {
      invalidExecution = true;
      fail('run.exitCode must be 0');
    }
    const cases = new Map();
    const names = new Map();
    const representedFiles = new Set();
    let passed = 0;
    let failed = 0;
    let pending = 0;
    if (!Array.isArray(run.assertions) || run.assertions.length === 0) {
      fail('run.assertions must contain actual test cases');
    } else {
      for (const assertion of run.assertions) {
        if (!isObject(assertion) || !nonempty(assertion.fullName)) {
          fail('run.assertions contains an invalid case fullName');
          continue;
        }
        const { fullName, status } = assertion;
        const assertionFile = assertion.testFile === undefined && testFiles.length === 1
          ? testFiles[0] : checkPath(assertion.testFile, 'run.assertions.testFile');
        if (!testFiles.includes(assertionFile)) fail(`run.assertions references an unregistered testFile: ${assertionFile}`);
        representedFiles.add(assertionFile);
        const caseKey = stableJson([assertionFile ?? null, fullName]);
        if (cases.has(caseKey)) fail(`run.assertions has duplicate case fullName: ${fullName}`);
        cases.set(caseKey, status);
        names.set(fullName, [...(names.get(fullName) ?? []), caseKey]);
        if (status === 'passed') passed++;
        else if (status === 'failed') failed++;
        else if (['pending', 'skipped', 'todo', 'disabled'].includes(status)) pending++;
        else fail(`run assertion has invalid status: ${fullName}`);
        if (status !== 'passed') fail(`run assertion did not pass: ${fullName}`);
      }
    }
    const expectedCounts = {
      totalTests: Array.isArray(run.assertions) ? run.assertions.length : 0,
      passedTests: passed,
      failedTests: failed,
      pendingTests: pending,
    };
    for (const [field, expected] of Object.entries(expectedCounts)) {
      if (!Number.isSafeInteger(run[field]) || run[field] < 0 || run[field] !== expected) {
        fail(`run.${field} does not match actual assertions`);
      }
    }
    if (!(run.totalTests > 0) || run.failedTests !== 0 || run.pendingTests !== 0
      || run.passedTests !== run.totalTests) fail('run must contain only passing tests');
    for (const file of testFiles) {
      if (!representedFiles.has(file)) fail(`run.assertions is missing registered testFile: ${file}`);
    }
    for (const { id, fullName, testFile: referenceFile } of references) {
      const candidates = referenceFile === undefined ? names.get(fullName) ?? []
        : [stableJson([referenceFile, fullName])];
      if (candidates.length > 1) fail(`record.obligations.${id} has an ambiguous test name; bind testFile: ${fullName}`);
      else if (candidates.length === 0 || !cases.has(candidates[0])) fail(`record.obligations.${id} references nonexistent test: ${fullName}`);
      else if (cases.get(candidates[0]) !== 'passed') fail(`record.obligations.${id} references a test that did not pass: ${fullName}`);
    }
  }
  if (reviewOK) {
    if (review.version !== 1) fail('review.version must be 1');
    checkIdentity(review, 'review');
    if (review.decision !== 'accepted') fail('review.decision must be accepted');
    if (review.scope !== 'enemy-behavior') fail('review.scope must be enemy-behavior');
    if (!nonempty(review.reviewer)) fail('review.reviewer must be nonempty');
    if (runOK && nonempty(run.author) && nonempty(review.reviewer)
      && run.author.trim() === review.reviewer.trim()) fail('review.reviewer must differ from run.author');
    for (const field of ['subjectDigest', 'testDigest']) {
      checkDigest(review[field], currentOK ? current[field] : undefined, `review.${field}`);
    }
    obligations(review.obligations, 'review.obligations', false);
    let runDigest;
    if (runOK) {
      try {
        runDigest = sha256(stableJson(run));
      } catch {
        fail('run must be serializable as canonical JSON');
      }
    }
    checkDigest(review.runDigest, runDigest, 'review.runDigest');
  }
  // Invalid execution and missing/malformed contract digests fail even if editing the receipt also
  // broke its run signature. Valid digest mismatches require fresh evidence;
  // other invalid artifacts fail, and missing artifacts alone remain pending.
  return {
    status: invalidContract || invalidExecution ? 'failed' : stale.length ? 'stale' : failures.length ? 'failed' : missing.length ? 'pending' : 'passed',
    issues: [...stale, ...failures, ...missing],
  };
}
