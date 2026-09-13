#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const EXPECTED_HEADERS = [
  '\u7f16\u53f7', '\u56fe\u96c6\u6587\u4ef6', '\u53d1\u751f\u4f4d\u7f6e', '\u8fd0\u52a8\u5927\u7c7b', '\u5177\u4f53\u5f62\u6001',
  '\u4e3b\u4f53\u8f6e\u5ed3', '\u5143\u7d20\u4e3b\u7c7b', '\u8d28\u611f\u7ec6\u5206', '\u9636\u6bb5\u7ed3\u6784', '\u89c4\u6a21',
  '\u4e3b\u8272\u8c03', '\u8f85\u8272\u8c03', '\u89c6\u89c9\u7ec4\u4ef6', '\u7ec6\u8282\u63cf\u8ff0', '\u9002\u7528\u6280\u80fd\u5173\u952e\u8bcd',
];

const MULTI_LABEL_FIELDS = new Set(EXPECTED_HEADERS.slice(2, 13).filter((name) => name !== EXPECTED_HEADERS[8]));
const REQUIRED_FIELDS = EXPECTED_HEADERS;

function help() {
  return [
    'Usage: node scripts/spine_effect_validate.mjs [options]',
    '',
    'Options:',
    '  --csv <path>       CSV path (default: data/spine_effect_labels.csv)',
    '  --manifest <path>  JSON manifest or a directory containing discovered 4-digit folders/PNG files',
    '  --json             Print a machine-readable JSON report only',
    '  -h, --help         Show this help',
    '',
    'Checks: exact 15-column header, CSV quoting/column counts, id format/duplicates,',
    'non-empty atlas/key fields, + as the only multi-label separator, and manifest differences.',
  ].join('\n') + '\n';
}

function cliArgs(argv) {
  const options = { csv: 'data/spine_effect_labels.csv', manifest: null, json: false, help: false };
  const errors = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') options.help = true;
    else if (arg === '--json') options.json = true;
    else if (arg === '--csv' || arg === '--manifest') {
      const value = argv[++i];
      if (!value || value.startsWith('-')) errors.push({ code: 'missing_option_value', message: `${arg} requires a path` });
      else options[arg.slice(2)] = value;
    } else if (arg.startsWith('--csv=') || arg.startsWith('--manifest=')) {
      const split = arg.indexOf('=');
      const name = arg.slice(2, split);
      const value = arg.slice(split + 1);
      if (!value) errors.push({ code: 'missing_option_value', message: `--${name} requires a path` });
      else options[name] = value;
    } else errors.push({ code: 'unknown_option', message: `Unknown option: ${arg}` });
  }
  return { options, errors };
}

function makeError(code, message, extra = {}) {
  return { code, message, ...extra };
}

function trim(value) {
  return String(value ?? '').trim();
}

function splitLabels(value) {
  return trim(value).split('+').map((part) => part.trim());
}

function parseCsv(input) {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const records = [];
  let fields = [];
  let field = '';
  let inQuotes = false;
  let afterQuote = false;
  let atFieldStart = true;
  let line = 1;
  let column = 1;
  let recordLine = 1;
  let touched = false;

  const fail = (code, message) => {
    const cause = new Error(message);
    cause.code = code;
    cause.line = line;
    cause.column = column;
    throw cause;
  };
  const finishField = () => {
    fields.push(field);
    field = '';
    atFieldStart = true;
    afterQuote = false;
  };
  const finishRecord = () => {
    finishField();
    if (fields.length > 1 || fields[0] !== '') records.push({ fields, line: recordLine });
    fields = [];
    recordLine = line + 1;
    touched = false;
  };
  const consumeNewline = (index) => {
    if (text[index] === '\r' && text[index + 1] === '\n') index += 2;
    else index += 1;
    line += 1;
    column = 1;
    return index;
  };

  let index = 0;
  while (index < text.length) {
    const ch = text[index];
    if (inQuotes) {
      if (ch === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          column += 2;
        } else {
          inQuotes = false;
          afterQuote = true;
          index += 1;
          column += 1;
        }
      } else if (ch === '\r' || ch === '\n') {
        field += '\n';
        index = consumeNewline(index);
      } else {
        field += ch;
        index += 1;
        column += 1;
      }
      touched = true;
      continue;
    }
    if (afterQuote) {
      if (ch === ',') {
        finishField();
        index += 1;
        column += 1;
      } else if (ch === '\r' || ch === '\n') {
        finishRecord();
        index = consumeNewline(index);
      } else fail('csv_quote', 'Characters after a closing quote must be comma or newline');
      touched = true;
      continue;
    }
    if (atFieldStart && ch === '"') {
      inQuotes = true;
      atFieldStart = false;
      index += 1;
      column += 1;
      touched = true;
    } else if (ch === ',') {
      finishField();
      index += 1;
      column += 1;
      touched = true;
    } else if (ch === '\r' || ch === '\n') {
      finishRecord();
      index = consumeNewline(index);
    } else if (ch === '"') {
      fail('csv_quote', 'An unquoted field contains a double quote');
    } else {
      field += ch;
      atFieldStart = false;
      index += 1;
      column += 1;
      touched = true;
    }
  }
  if (inQuotes) fail('csv_quote', 'An opening quote has no closing quote');
  if (afterQuote || fields.length > 0 || field.length > 0 || touched) finishRecord();
  return records;
}

function validateCsv(csvPath) {
  const report = { path: csvPath, headers: null, rowCount: 0, rows: [] };
  const errors = [];
  let text;
  try {
    text = fs.readFileSync(csvPath, 'utf8');
  } catch (cause) {
    return { report, errors: [makeError('csv_read', `Cannot read CSV: ${cause.message}`, { path: csvPath })] };
  }

  let records;
  try {
    records = parseCsv(text);
  } catch (cause) {
    return { report, errors: [makeError(cause.code || 'csv_parse', cause.message, { path: csvPath, line: cause.line, column: cause.column })] };
  }
  if (records.length === 0) return { report, errors: [makeError('csv_empty', 'CSV has no header or data')] };

  report.headers = records[0].fields;
  if (report.headers.length !== EXPECTED_HEADERS.length || report.headers.some((value, i) => value !== EXPECTED_HEADERS[i])) {
    errors.push(makeError('header_mismatch', 'CSV header does not exactly match the existing 15-column header', {
      line: records[0].line, expected: EXPECTED_HEADERS, actual: report.headers,
    }));
  }

  const firstLines = new Map();
  for (const record of records.slice(1)) {
    if (record.fields.every((value) => trim(value) === '')) continue;
    report.rowCount += 1;
    if (record.fields.length !== EXPECTED_HEADERS.length) {
      errors.push(makeError('column_count', `Expected ${EXPECTED_HEADERS.length} columns, got ${record.fields.length}`, {
        line: record.line, expected: EXPECTED_HEADERS.length, actual: record.fields.length,
      }));
      continue;
    }
    const values = Object.fromEntries(EXPECTED_HEADERS.map((header, i) => [header, record.fields[i]]));
    report.rows.push({ line: record.line, values });

    const id = trim(values[EXPECTED_HEADERS[0]]);
    if (!/^\d{4}$/.test(id)) {
      errors.push(makeError('invalid_id_format', 'ID must be exactly four digits (0001-0500)', { line: record.line, field: EXPECTED_HEADERS[0], value: id }));
    } else if (Number(id) < 1 || Number(id) > 500) {
      errors.push(makeError('id_out_of_range', 'ID must be in range 0001-0500', { line: record.line, field: EXPECTED_HEADERS[0], value: id }));
    } else if (firstLines.has(id)) {
      errors.push(makeError('duplicate_id', `Duplicate ID: ${id}`, { line: record.line, field: EXPECTED_HEADERS[0], value: id, firstLine: firstLines.get(id) }));
    } else firstLines.set(id, record.line);

    for (const fieldName of REQUIRED_FIELDS) {
      if (trim(values[fieldName]) === '') errors.push(makeError('required_field_empty', 'Required label field is empty', { line: record.line, field: fieldName }));
    }
    for (const fieldName of MULTI_LABEL_FIELDS) {
      const value = values[fieldName];
      if (/[\uFF0C\u3001;\uFF1B]/u.test(value)) {
        errors.push(makeError('multi_label_separator', 'Multiple labels must use +, not comma or semicolon', { line: record.line, field: fieldName, value }));
      }
      if (trim(value) && splitLabels(value).some((part) => part === '')) {
        errors.push(makeError('empty_label_part', 'A + separated label part is empty', { line: record.line, field: fieldName, value }));
      }
    }
  }
  return { report, errors };
}

function addManifestPath(manifest, value, inheritedId = null) {
  if (typeof value !== 'string') return;
  const normalized = value.trim().replaceAll('\\', '/');
  if (!normalized) return;
  const match = normalized.match(/(?:^|\/)(\d{4})\/([^/]+\.png)$/i);
  if (match) {
    manifest.directories.add(match[1]);
    manifest.images.add(`${match[1]}/${match[2]}`);
  } else if (/^\d{4}$/.test(normalized)) {
    manifest.directories.add(normalized);
  } else if (/\.png$/i.test(normalized) && /^\d{4}$/.test(inheritedId || '')) {
    manifest.directories.add(inheritedId);
    manifest.images.add(`${inheritedId}/${path.posix.basename(normalized)}`);
  }
}

function addManifestEntry(manifest, value, inheritedId = null) {
  if (value == null) return;
  if (typeof value === 'string') return addManifestPath(manifest, value, inheritedId);
  if (Array.isArray(value)) return value.forEach((item) => addManifestEntry(manifest, item, inheritedId));
  if (typeof value !== 'object') return;

  let id = inheritedId;
  for (const key of ['id', 'number', 'code', 'directory', 'dir', 'folder', 'folderName']) {
    if (/^\d{4}$/.test(trim(value[key]))) {
      id = trim(value[key]);
      manifest.directories.add(id);
      break;
    }
  }
  for (const key of ['path', 'relativePath', 'file', 'filename', 'image', 'imagePath']) {
    if (typeof value[key] === 'string') addManifestPath(manifest, value[key], id);
  }
  for (const key of ['images', 'files', 'pngs', 'assets', 'pictures']) {
    if (value[key] != null) addManifestEntry(manifest, value[key], id);
  }
  for (const [key, item] of Object.entries(value)) {
    if (['id', 'number', 'code', 'directory', 'dir', 'folder', 'folderName', 'path', 'relativePath', 'file', 'filename', 'image', 'imagePath', 'images', 'files', 'pngs', 'assets', 'pictures'].includes(key)) continue;
    const keyId = /^\d{4}$/.test(key) ? key : id;
    if (/^\d{4}$/.test(key)) manifest.directories.add(key);
    addManifestEntry(manifest, item, keyId);
  }
}

function scanDirectory(rootPath) {
  const manifest = { directories: new Set(), images: new Set() };
  const root = path.resolve(rootPath);
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (/^\d{4}$/.test(entry.name)) manifest.directories.add(entry.name);
        visit(full);
      } else if (entry.isFile() && /\.png$/i.test(entry.name)) {
        addManifestPath(manifest, path.relative(root, full).replaceAll('\\', '/'));
      }
    }
  };
  visit(root);
  return manifest;
}

function readManifest(manifestPath) {
  const report = { path: manifestPath, directories: [], images: [], missingDirectories: [], extraDirectories: [], missingImages: [], extraImages: [] };
  const errors = [];
  const discovered = { directories: new Set(), images: new Set() };
  try {
    const absolute = path.resolve(manifestPath);
    if (fs.statSync(absolute).isDirectory()) Object.assign(discovered, scanDirectory(absolute));
    else {
      const input = fs.readFileSync(absolute, 'utf8');
      const jsonText = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
      addManifestEntry(discovered, JSON.parse(jsonText));
    }
  } catch (cause) {
    const code = cause.code === 'ENOENT' ? 'manifest_read' : (cause instanceof SyntaxError ? 'manifest_parse' : 'manifest_read');
    errors.push(makeError(code, `Cannot read manifest: ${cause.message}`, { path: manifestPath }));
    return { report, errors };
  }
  report.directories = [...discovered.directories].sort();
  report.images = [...discovered.images].sort();
  return { report, errors, discovered };
}

function compareManifest(csvReport, result) {
  if (!result.discovered) return;
  const csvDirectories = new Set();
  const csvImages = new Set();
  for (const row of csvReport.rows) {
    const id = trim(row.values[EXPECTED_HEADERS[0]]);
    if (!/^\d{4}$/.test(id)) continue;
    csvDirectories.add(id);
    for (const image of splitLabels(row.values[EXPECTED_HEADERS[1]])) {
      if (image) csvImages.add(`${id}/${path.posix.basename(image.replaceAll('\\', '/'))}`);
    }
  }
  const foundDirectories = result.discovered.directories;
  const foundImages = result.discovered.images;
  result.report.missingDirectories = [...foundDirectories].filter((id) => !csvDirectories.has(id)).sort();
  result.report.extraDirectories = [...csvDirectories].filter((id) => !foundDirectories.has(id)).sort();
  if (foundImages.size) {
    result.report.missingImages = [...foundImages].filter((image) => !csvImages.has(image)).sort();
    result.report.extraImages = [...csvImages].filter((image) => !foundImages.has(image)).sort();
  }
}

function human(report) {
  const lines = [report.ok ? 'OK: validation passed' : 'FAILED: validation failed', `CSV: ${report.csv?.path || '(unavailable)'}`, `Rows: ${report.csv?.rowCount || 0}`];
  if (report.errors.length) {
    lines.push(`Errors (${report.errors.length}):`);
    for (const item of report.errors) lines.push(`  - [${item.code}]${item.line ? ` line ${item.line}` : ''}${item.field ? ` / ${item.field}` : ''}: ${item.message}`);
  }
  if (report.manifest) {
    lines.push(`Manifest: ${report.manifest.path}`);
    lines.push(`  discovered directories=${report.manifest.directories.length}, images=${report.manifest.images.length}`);
    for (const [name, values] of [['missing directories', report.manifest.missingDirectories], ['extra directories', report.manifest.extraDirectories], ['missing images', report.manifest.missingImages], ['extra images', report.manifest.extraImages]]) {
      if (values.length) lines.push(`  ${name}: ${values.join(', ')}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const { options, errors: cliErrors } = cliArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(help());
    return 0;
  }
  const csvPath = path.resolve(process.cwd(), options.csv);
  const csvResult = validateCsv(csvPath);
  const report = { ok: false, csv: csvResult.report, manifest: null, errors: [...cliErrors, ...csvResult.errors], summary: { rows: csvResult.report.rowCount, errors: 0 } };
  if (options.manifest) {
    const manifestResult = readManifest(options.manifest);
    report.manifest = manifestResult.report;
    report.errors.push(...manifestResult.errors);
    compareManifest(csvResult.report, manifestResult);
    if (manifestResult.discovered) {
      const m = manifestResult.report;
      for (const id of m.missingDirectories) report.errors.push(makeError('manifest_missing_directory', `Manifest directory missing from CSV: ${id}`, { value: id }));
      for (const id of m.extraDirectories) report.errors.push(makeError('manifest_extra_directory', `CSV directory missing from manifest: ${id}`, { value: id }));
      for (const image of m.missingImages) report.errors.push(makeError('manifest_missing_image', `Manifest image missing from CSV: ${image}`, { value: image }));
      for (const image of m.extraImages) report.errors.push(makeError('manifest_extra_image', `CSV image missing from manifest: ${image}`, { value: image }));
    }
  }
  report.summary.errors = report.errors.length;
  report.ok = report.errors.length === 0;
  process.stdout.write(options.json ? `${JSON.stringify(report, null, 2)}\n` : human(report));
  return report.ok ? 0 : 1;
}

try {
  process.exitCode = main();
} catch (cause) {
  process.stdout.write(`${JSON.stringify({ ok: false, csv: null, manifest: null, errors: [makeError('internal_error', cause?.stack || String(cause))], summary: { rows: 0, errors: 1 } }, null, 2)}\n`);
  process.exitCode = 1;
}
