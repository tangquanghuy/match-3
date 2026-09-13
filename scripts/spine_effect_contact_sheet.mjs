#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DEFAULT_TITLE = 'Spine Effects Contact Sheet';
const DEFAULT_OUTPUT = 'spine-effect-contact-sheet.html';

function usage() {
  return `Usage: node scripts/spine_effect_contact_sheet.mjs [options]

Generate a self-contained, offline HTML contact sheet for *.png files in
numbered directories.

Options:
  --input <dir>       Root directory containing numbered directories (default: .)
  --output <file>     HTML output path (default: ${DEFAULT_OUTPUT})
  --columns <n>       Number of thumbnail columns, 1-12 (default: 4)
  --start <n>         First numeric directory to include (inclusive)
  --end <n>           Last numeric directory to include (inclusive)
  --title <text>      HTML page title (default: ${DEFAULT_TITLE})
  --help              Show this help text

Examples:
  node scripts/spine_effect_contact_sheet.mjs --input ./effects --output ./out.html
  node scripts/spine_effect_contact_sheet.mjs --input "D:\\effects" --start 1 --end 10
`;
}

function fail(message) {
  console.error(`Error: ${message}\n\n${usage()}`);
  process.exitCode = 1;
}

function takeValue(argv, index, option) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function parseInteger(value, option, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (!/^-?\d+$/.test(value)) {
    throw new Error(`${option} must be an integer, got: ${value}`);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${option} must be between ${min} and ${max}, got: ${value}`);
  }
  return parsed;
}

function parseArgs(argv) {
  const options = {
    input: '.',
    output: DEFAULT_OUTPUT,
    columns: 4,
    start: undefined,
    end: undefined,
    title: DEFAULT_TITLE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const equalsIndex = argument.indexOf('=');
    const option = equalsIndex === -1 ? argument : argument.slice(0, equalsIndex);
    const inlineValue = equalsIndex === -1 ? undefined : argument.slice(equalsIndex + 1);

    if (option === '--help' || option === '-h') {
      options.help = true;
      continue;
    }

    const getValue = () => inlineValue ?? takeValue(argv, index++, option);

    switch (option) {
      case '--input':
        options.input = getValue();
        break;
      case '--output':
        options.output = getValue();
        break;
      case '--columns':
        options.columns = parseInteger(getValue(), '--columns', { min: 1, max: 12 });
        break;
      case '--start':
        options.start = parseInteger(getValue(), '--start');
        break;
      case '--end':
        options.end = parseInteger(getValue(), '--end');
        break;
      case '--title':
        options.title = getValue();
        break;
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }

  if (options.start !== undefined && options.end !== undefined && options.start > options.end) {
    throw new Error('--start cannot be greater than --end');
  }

  return options;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function readPngDimensions(buffer, filePath) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`not a valid PNG: ${filePath}`);
  }

  const chunkLength = buffer.readUInt32BE(8);
  const chunkType = buffer.toString('ascii', 12, 16);
  if (chunkLength < 13 || chunkType !== 'IHDR') {
    throw new Error(`PNG is missing a valid IHDR chunk: ${filePath}`);
  }

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (width === 0 || height === 0) {
    throw new Error(`PNG has invalid dimensions: ${filePath}`);
  }
  return { width, height };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

async function scanEffects(options) {
  const inputPath = path.resolve(options.input);
  const directoryEntries = await fs.readdir(inputPath, { withFileTypes: true });
  const numberedDirectories = directoryEntries
    .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      number: Number(entry.name),
      directoryPath: path.join(inputPath, entry.name),
    }))
    .filter(({ number }) => (
      (options.start === undefined || number >= options.start)
      && (options.end === undefined || number <= options.end)
    ))
    .sort((left, right) => left.number - right.number || left.name.localeCompare(right.name));

  const groups = [];
  const warnings = [];

  for (const directory of numberedDirectories) {
    const entries = await fs.readdir(directory.directoryPath, { withFileTypes: true });
    const effectFiles = entries
      .filter((entry) => entry.isFile() && /\.png$/i.test(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }));
    const items = [];

    for (const entry of effectFiles) {
      const filePath = path.join(directory.directoryPath, entry.name);
      try {
        const fileBuffer = await fs.readFile(filePath);
        const dimensions = readPngDimensions(fileBuffer, filePath);
        items.push({
          name: entry.name,
          dimensions,
          size: fileBuffer.length,
          dataUri: `data:image/png;base64,${fileBuffer.toString('base64')}`,
        });
      } catch (error) {
        warnings.push(error instanceof Error ? error.message : String(error));
      }
    }

    groups.push({
      name: directory.name,
      number: directory.number,
      items,
    });
  }

  return { inputPath, groups, warnings };
}

function renderItem(item, group) {
  const dimensions = `${item.dimensions.width} × ${item.dimensions.height}`;
  const searchText = `${group.name} ${item.name} ${dimensions}`.toLowerCase();
  return `
        <article class="asset-card" data-number="${escapeHtml(group.name)}" data-search="${escapeHtml(searchText)}">
          <div class="image-frame">
            <img src="${item.dataUri}" alt="${escapeHtml(`${group.name} / ${item.name}`)}" loading="lazy">
          </div>
          <div class="asset-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
          <div class="asset-meta">${escapeHtml(dimensions)} · ${escapeHtml(formatBytes(item.size))}</div>
        </article>`;
}

function renderGroup(group, columns) {
  const cards = group.items.map((item) => renderItem(item, group)).join('');
  const emptyState = group.items.length === 0
    ? '<p class="empty-group">未找到匹配的 *.png 文件。</p>'
    : '';
  return `
      <section class="number-group" data-group-number="${escapeHtml(group.name)}">
        <div class="group-heading">
          <h2>${escapeHtml(group.name)}</h2>
          <span>${group.items.length} 个文件</span>
        </div>
        <div class="asset-grid" style="--columns: ${columns}">${cards}</div>
        ${emptyState}
      </section>`;
}

function renderHtml({ title, inputPath, groups, columns }) {
  const totalItems = groups.reduce((sum, group) => sum + group.items.length, 0);
  const groupOptions = groups
    .map((group) => `<option value="${escapeHtml(group.name)}">${escapeHtml(group.name)}</option>`)
    .join('');
  const sections = groups.map((group) => renderGroup(group, columns)).join('');
  const generatedAt = new Date().toLocaleString('zh-CN');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #10131a;
      color: #e8ecf4;
    }
    * { box-sizing: border-box; }
    body { margin: 0; background: linear-gradient(135deg, #10131a 0%, #161b25 100%); }
    .page { max-width: 1800px; margin: 0 auto; padding: 28px; }
    header { display: flex; flex-wrap: wrap; gap: 18px; align-items: end; justify-content: space-between; margin-bottom: 28px; }
    h1 { margin: 0 0 8px; font-size: clamp(24px, 3vw, 38px); letter-spacing: -.02em; }
    .subtle { color: #9da7b8; font-size: 13px; word-break: break-all; }
    .toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
    input, select { min-height: 38px; border: 1px solid #374154; border-radius: 9px; background: #1b2230; color: #eef2f8; padding: 8px 11px; font: inherit; }
    input { min-width: min(360px, 80vw); }
    input:focus, select:focus { outline: 2px solid #70a8ff; outline-offset: 1px; }
    .result-count { color: #aeb9cb; font-size: 13px; min-width: 120px; }
    .number-group { margin: 0 0 30px; }
    .group-heading { display: flex; align-items: baseline; gap: 12px; border-bottom: 1px solid #2b3342; margin-bottom: 13px; padding-bottom: 8px; }
    .group-heading h2 { margin: 0; font-size: 22px; color: #fff; }
    .group-heading span { color: #8e9ab0; font-size: 13px; }
    .asset-grid { display: grid; grid-template-columns: repeat(var(--columns), minmax(0, 1fr)); gap: 14px; }
    .asset-card { min-width: 0; overflow: hidden; border: 1px solid #2c3545; border-radius: 12px; background: #1a202b; box-shadow: 0 8px 22px rgba(0,0,0,.16); }
    .image-frame { display: grid; place-items: center; min-height: 150px; padding: 12px; background-color: #11151d; background-image: linear-gradient(45deg, #1c2430 25%, transparent 25%), linear-gradient(-45deg, #1c2430 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #1c2430 75%), linear-gradient(-45deg, transparent 75%, #1c2430 75%); background-size: 20px 20px; background-position: 0 0, 0 10px, 10px -10px, -10px 0; }
    .image-frame img { display: block; max-width: 100%; max-height: 280px; object-fit: contain; }
    .asset-name { overflow: hidden; padding: 10px 12px 2px; color: #f3f6fb; font-size: 14px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .asset-meta { padding: 0 12px 11px; color: #94a0b4; font-size: 12px; }
    .empty-group { margin: 0; padding: 14px; border: 1px dashed #3a4558; border-radius: 10px; color: #9da7b8; }
    .no-results { display: none; padding: 38px 12px; color: #9da7b8; text-align: center; }
    [hidden] { display: none !important; }
    @media (max-width: 1000px) { .asset-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 680px) { .page { padding: 18px 12px; } .asset-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 420px) { .asset-grid { grid-template-columns: minmax(0, 1fr); } }
  </style>
</head>
<body>
  <main class="page">
    <header>
      <div>
        <h1>${escapeHtml(title)}</h1>
        <div class="subtle">${escapeHtml(inputPath)} · ${groups.length} 个编号 · ${totalItems} 个图片 · 生成于 ${escapeHtml(generatedAt)}</div>
      </div>
      <div class="toolbar" role="search">
        <label>
          <span class="subtle">搜索</span>
          <input id="search" type="search" placeholder="文件名、编号或尺寸…" autocomplete="off">
        </label>
        <label>
          <span class="subtle">编号过滤</span>
          <select id="number-filter">
            <option value="">全部编号</option>
            ${groupOptions}
          </select>
        </label>
        <span id="result-count" class="result-count" aria-live="polite"></span>
      </div>
    </header>
    <div id="groups">${sections}</div>
    <div id="no-results" class="no-results">没有符合条件的图片。</div>
  </main>
  <script>
    (() => {
      const searchInput = document.getElementById('search');
      const numberFilter = document.getElementById('number-filter');
      const resultCount = document.getElementById('result-count');
      const noResults = document.getElementById('no-results');
      const groups = [...document.querySelectorAll('.number-group')];
      const cards = [...document.querySelectorAll('.asset-card')];

      function updateResults() {
        const query = searchInput.value.trim().toLowerCase();
        const selectedNumber = numberFilter.value;
        let visible = 0;

        for (const card of cards) {
          const matchesSearch = !query || card.dataset.search.includes(query);
          const matchesNumber = !selectedNumber || card.dataset.number === selectedNumber;
          const isVisible = matchesSearch && matchesNumber;
          card.hidden = !isVisible;
          if (isVisible) visible += 1;
        }

        for (const group of groups) {
          const hasVisibleCard = group.querySelector('.asset-card:not([hidden])') !== null;
          group.hidden = !hasVisibleCard;
        }

        noResults.hidden = visible !== 0;
        resultCount.textContent = String(visible) + ' / ' + String(cards.length) + ' 个文件';
      }

      searchInput.addEventListener('input', updateResults);
      numberFilter.addEventListener('change', updateResults);
      updateResults();
    })();
  </script>
</body>
</html>
`;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return;
  }

  if (options.help) {
    console.log(usage());
    return;
  }

  let scan;
  try {
    scan = await scanEffects(options);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return;
  }

  const outputPath = path.resolve(options.output);
  const html = renderHtml({
    title: options.title,
    inputPath: scan.inputPath,
    groups: scan.groups,
    columns: options.columns,
  });

  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, html, 'utf8');
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    return;
  }

  const itemCount = scan.groups.reduce((sum, group) => sum + group.items.length, 0);
  console.log(`Generated ${outputPath}`);
  console.log(`Scanned ${scan.groups.length} numbered directories and embedded ${itemCount} PNG file(s).`);
  for (const warning of scan.warnings) console.warn(`Warning: ${warning}`);
}

await main();

