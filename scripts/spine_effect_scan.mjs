#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT_DIR = path.join(REPO_ROOT, 'data', 'spine-effect-scan');
const MIN_ID = 1;
const MAX_ID = 500;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const COLOR_TYPE_NAMES = {
  0: 'grayscale',
  2: 'truecolor',
  3: 'indexed-color',
  4: 'grayscale-alpha',
  6: 'truecolor-alpha',
};

function printHelp() {
  console.log(`用法:
  node scripts/spine_effect_scan.mjs --input <目录> [选项]

选项:
  --input <目录>       输入根目录，扫描其中 0001–0500 的编号目录
  --out-dir <目录>     输出目录（默认: ${path.relative(process.cwd(), DEFAULT_OUT_DIR) || '.'})
  --start <编号>       起始编号，默认 1
  --end <编号>         结束编号，默认 500
  --overwrite           覆盖已有 manifest.json / spine_effect_labels.csv
  --help, -h            显示帮助

输出:
  manifest.json
  spine_effect_labels.csv

默认不会覆盖已有输出；CSV 使用现有 data/spine_effect_labels.csv 的表头，标签字段留空。`);
}

function fail(message) {
  console.error(`错误: ${message}`);
  process.exitCode = 1;
}

function parseInteger(value, optionName) {
  if (!/^\d+$/.test(String(value))) {
    throw new Error(`${optionName} 必须是整数，收到: ${value}`);
  }
  return Number(value);
}

function parseArgs(argv) {
  const args = {
    input: null,
    outDir: DEFAULT_OUT_DIR,
    start: MIN_ID,
    end: MAX_ID,
    overwrite: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }
    if (token === '--overwrite') {
      args.overwrite = true;
      continue;
    }

    const match = /^(--input|--out-dir|--start|--end)=(.*)$/.exec(token);
    const option = match?.[1] ?? token;
    let value = match?.[2];
    if (value === undefined && ['--input', '--out-dir', '--start', '--end'].includes(option)) {
      value = argv[++i];
    }
    if (!['--input', '--out-dir', '--start', '--end'].includes(option)) {
      throw new Error(`未知参数: ${token}`);
    }
    if (value === undefined || value === '') {
      throw new Error(`${option} 缺少值`);
    }

    if (option === '--input') args.input = value;
    if (option === '--out-dir') args.outDir = value;
    if (option === '--start') args.start = parseInteger(value, option);
    if (option === '--end') args.end = parseInteger(value, option);
  }

  if (args.help) return args;
  if (!args.input) throw new Error('必须提供 --input');
  if (args.start < MIN_ID || args.start > MAX_ID) throw new Error(`--start 必须在 ${MIN_ID}–${MAX_ID} 范围内`);
  if (args.end < MIN_ID || args.end > MAX_ID) throw new Error(`--end 必须在 ${MIN_ID}–${MAX_ID} 范围内`);
  if (args.start > args.end) throw new Error('--start 不能大于 --end');

  args.input = path.resolve(args.input);
  args.outDir = path.resolve(args.outDir);
  return args;
}

function readCsvHeader() {
  const source = path.join(REPO_ROOT, 'data', 'spine_effect_labels.csv');
  const content = fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '');
  const firstLine = content.split(/\r?\n/, 1)[0];
  if (!firstLine) throw new Error(`CSV header is empty: ${source}`);
  return firstLine;
}

function assertPngSignature(buffer, filePath) {
  if (buffer.length < PNG_SIGNATURE.length || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`不是有效 PNG: ${filePath}`);
  }
}

function readPngChunks(buffer, filePath) {
  assertPngSignature(buffer, filePath);
  let offset = 8;
  const chunks = [];
  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) throw new Error(`PNG chunk 截断: ${filePath}`);
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (dataEnd > buffer.length || crcEnd > buffer.length) {
      throw new Error(`PNG chunk 越界: ${filePath}`);
    }
    chunks.push({ type, data: buffer.subarray(dataStart, dataEnd) });
    offset = crcEnd;
    if (type === 'IEND') break;
  }
  return chunks;
}

function sampleAt(row, sampleIndex, bitDepth) {
  if (bitDepth === 8) return row[sampleIndex];
  if (bitDepth === 16) return row.readUInt16BE(sampleIndex * 2);
  const bitOffset = sampleIndex * bitDepth;
  const byte = row[bitOffset >> 3];
  const shift = 8 - bitDepth - (bitOffset & 7);
  return (byte >> shift) & ((1 << bitDepth) - 1);
}

function alphaTo8(alpha, bitDepth) {
  if (bitDepth === 16) return Math.round(alpha / 257);
  return alpha;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function unfilterRows(raw, offset, height, rowBytes, bytesPerPixel) {
  const rows = [];
  let cursor = offset;
  let previous = Buffer.alloc(rowBytes);

  for (let y = 0; y < height; y += 1) {
    if (cursor + rowBytes + 1 > raw.length) throw new Error('PNG image data is truncated');
    const filterType = raw[cursor++];
    const row = Buffer.from(raw.subarray(cursor, cursor + rowBytes));
    cursor += rowBytes;

    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previous[x];
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      if (filterType === 1) row[x] = (row[x] + left) & 0xff;
      else if (filterType === 2) row[x] = (row[x] + up) & 0xff;
      else if (filterType === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 0xff;
      else if (filterType === 4) row[x] = (row[x] + paeth(left, up, upLeft)) & 0xff;
      else if (filterType !== 0) throw new Error(`Unsupported PNG filter type: ${filterType}`);
    }

    rows.push(row);
    previous = row;
  }
  return { rows, offset: cursor };
}

function decodePng(buffer, filePath) {
  const chunks = readPngChunks(buffer, filePath);
  const ihdr = chunks.find((chunk) => chunk.type === 'IHDR')?.data;
  if (!ihdr || ihdr.length !== 13) throw new Error(`PNG 缺少有效 IHDR: ${filePath}`);

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const bitDepth = ihdr[8];
  const colorType = ihdr[9];
  const compressionMethod = ihdr[10];
  const filterMethod = ihdr[11];
  const interlaceMethod = ihdr[12];
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];

  if (!width || !height) throw new Error(`PNG 尺寸无效: ${filePath}`);
  if (!channels) throw new Error(`不支持的 PNG color type ${colorType}: ${filePath}`);
  if (compressionMethod !== 0 || filterMethod !== 0) throw new Error(`不支持的 PNG 压缩/过滤方法: ${filePath}`);
  if (![0, 1].includes(interlaceMethod)) throw new Error(`Unsupported PNG interlace method ${interlaceMethod}: ${filePath}`);
  const allowedDepths = colorType === 2 || colorType === 4 || colorType === 6 ? [8, 16] : [1, 2, 4, 8, 16];
  if (!allowedDepths.includes(bitDepth)) throw new Error(`不支持的 PNG bit depth ${bitDepth}: ${filePath}`);

  const palette = chunks.find((chunk) => chunk.type === 'PLTE')?.data ?? null;
  const transparency = chunks.find((chunk) => chunk.type === 'tRNS')?.data ?? null;
  if (colorType === 3 && (!palette || palette.length === 0 || palette.length % 3 !== 0)) {
    throw new Error(`索引 PNG 缺少有效 PLTE: ${filePath}`);
  }

  const idat = chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data);
  if (idat.length === 0) throw new Error(`PNG 缺少 IDAT: ${filePath}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bytesPerPixel = Math.max(1, Math.ceil((channels * bitDepth) / 8));
  const hasAlpha = colorType === 4 || colorType === 6 || Boolean(transparency);
  const transparentSample = colorType === 0 && transparency?.length >= 2 ? transparency.readUInt16BE(0) : null;
  const transparentRed = colorType === 2 && transparency?.length >= 6 ? transparency.readUInt16BE(0) : null;
  const transparentGreen = colorType === 2 && transparency?.length >= 6 ? transparency.readUInt16BE(2) : null;
  const transparentBlue = colorType === 2 && transparency?.length >= 6 ? transparency.readUInt16BE(4) : null;
  const paletteAlpha = colorType === 3 ? Array.from({ length: palette.length / 3 }, (_, index) => transparency?.[index] ?? 255) : null;

  let alphaMin = 255;
  let alphaMax = 0;
  let alphaSum = 0;
  let transparentPixelCount = 0;
  let partiallyTransparentPixelCount = 0;
  let opaquePixelCount = 0;

  const recordAlpha = (row, x) => {
    let alpha;
    if (colorType === 6) {
      alpha = alphaTo8(sampleAt(row, x * 4 + 3, bitDepth), bitDepth);
    } else if (colorType === 4) {
      alpha = alphaTo8(sampleAt(row, x * 2 + 1, bitDepth), bitDepth);
    } else if (colorType === 3) {
      const index = sampleAt(row, x, bitDepth);
      alpha = paletteAlpha[index] ?? 255;
    } else if (colorType === 0) {
      const sample = sampleAt(row, x, bitDepth);
      alpha = transparentSample !== null && sample === transparentSample ? 0 : 255;
    } else if (colorType === 2) {
      const red = sampleAt(row, x * 3, bitDepth);
      const green = sampleAt(row, x * 3 + 1, bitDepth);
      const blue = sampleAt(row, x * 3 + 2, bitDepth);
      alpha = transparentRed !== null && red === transparentRed && green === transparentGreen && blue === transparentBlue ? 0 : 255;
    } else {
      alpha = 255;
    }

    alphaMin = Math.min(alphaMin, alpha);
    alphaMax = Math.max(alphaMax, alpha);
    alphaSum += alpha;
    if (alpha === 0) transparentPixelCount += 1;
    else if (alpha < 255) partiallyTransparentPixelCount += 1;
    else opaquePixelCount += 1;
  };

  if (interlaceMethod === 0) {
    const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
    const { rows } = unfilterRows(raw, 0, height, rowBytes, bytesPerPixel);
    for (const row of rows) {
      for (let x = 0; x < width; x += 1) recordAlpha(row, x);
    }
  } else {
    const passes = [
      [0, 0, 8, 8],
      [4, 0, 8, 8],
      [0, 4, 4, 8],
      [2, 0, 4, 4],
      [0, 2, 2, 4],
      [1, 0, 2, 2],
      [0, 1, 1, 2],
    ];
    let rawOffset = 0;
    for (const [startX, startY, stepX, stepY] of passes) {
      const passWidth = startX < width ? Math.ceil((width - startX) / stepX) : 0;
      const passHeight = startY < height ? Math.ceil((height - startY) / stepY) : 0;
      if (!passWidth || !passHeight) continue;
      const passRowBytes = Math.ceil((passWidth * channels * bitDepth) / 8);
      const pass = unfilterRows(raw, rawOffset, passHeight, passRowBytes, bytesPerPixel);
      rawOffset = pass.offset;
      for (const row of pass.rows) {
        for (let x = 0; x < passWidth; x += 1) recordAlpha(row, x);
      }
    }
  }

  const pixelCount = width * height;
  return {
    width,
    height,
    bitDepth,
    colorType,
    colorTypeName: COLOR_TYPE_NAMES[colorType],
    compressionMethod,
    filterMethod,
    interlaceMethod,
    hasAlpha,
    alphaStatus: 'decoded',
    hasTransparentPixels: transparentPixelCount > 0,
    alphaMin,
    alphaMax,
    alphaMean: Number((alphaSum / pixelCount).toFixed(3)),
    transparentPixelCount,
    partiallyTransparentPixelCount,
    nonOpaquePixelCount: transparentPixelCount + partiallyTransparentPixelCount,
    opaquePixelCount,
    transparentRatio: Number((transparentPixelCount / pixelCount).toFixed(6)),
    nonOpaqueRatio: Number(((transparentPixelCount + partiallyTransparentPixelCount) / pixelCount).toFixed(6)),
  };
}

function readPngHeader(buffer, filePath) {
  const chunks = readPngChunks(buffer, filePath);
  const ihdr = chunks.find((chunk) => chunk.type === 'IHDR')?.data;
  if (!ihdr || ihdr.length !== 13) throw new Error(`PNG missing valid IHDR: ${filePath}`);
  const colorType = ihdr[9];
  return {
    width: ihdr.readUInt32BE(0),
    height: ihdr.readUInt32BE(4),
    bitDepth: ihdr[8],
    colorType,
    colorTypeName: COLOR_TYPE_NAMES[colorType] ?? 'unknown',
    compressionMethod: ihdr[10],
    filterMethod: ihdr[11],
    interlaceMethod: ihdr[12],
  };
}

function parsePng(buffer, filePath) {
  const header = readPngHeader(buffer, filePath);
  try {
    return decodePng(buffer, filePath);
  } catch (error) {
    return {
      ...header,
      hasAlpha: null,
      hasTransparentPixels: null,
      alphaStatus: 'unknown',
      alphaMin: null,
      alphaMax: null,
      alphaMean: null,
      transparentPixelCount: null,
      partiallyTransparentPixelCount: null,
      nonOpaquePixelCount: null,
      opaquePixelCount: null,
      transparentRatio: null,
      nonOpaqueRatio: null,
      pixelMetadataError: error instanceof Error ? error.message : String(error),
    };
  }
}

function walkFiles(root) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch (error) {
    throw new Error(`?????? ${root}: ${error.message}`);
  }
  return entries
    .filter((entry) => entry.isFile() && /\.png$/i.test(entry.name))
    .map((entry) => path.join(root, entry.name))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function formatId(number) {
  return String(number).padStart(4, '0');
}

function collectScan(inputRoot, start, end, csvHeader) {
  if (!fs.existsSync(inputRoot)) throw new Error(`输入目录不存在: ${inputRoot}`);
  if (!fs.statSync(inputRoot).isDirectory()) throw new Error(`输入路径不是目录: ${inputRoot}`);

  const directories = [];
  const missingDirectories = [];
  const noPngDirectories = [];
  const dimensionInconsistencies = [];
  const errors = [];
  const dimensionCounts = new Map();
  let pngCount = 0;

  for (let number = start; number <= end; number += 1) {
    const id = formatId(number);
    const directoryPath = path.join(inputRoot, id);
    let isDirectory = false;
    try {
      isDirectory = fs.existsSync(directoryPath) && fs.statSync(directoryPath).isDirectory();
    } catch (error) {
      errors.push({ id, directory: directoryPath, message: error.message });
    }

    if (!isDirectory) {
      missingDirectories.push(id);
      directories.push({ id, directory: directoryPath, status: 'missing-directory', pngs: [] });
      continue;
    }

    let pngFiles;
    try {
      pngFiles = walkFiles(directoryPath);
    } catch (error) {
      errors.push({ id, directory: directoryPath, message: error.message });
      directories.push({ id, directory: directoryPath, status: 'error', pngs: [], error: error.message });
      continue;
    }

    if (pngFiles.length === 0) noPngDirectories.push(id);
    const pngs = [];
    for (const filePath of pngFiles) {
      const relativePath = path.relative(directoryPath, filePath).split(path.sep).join('/');
      try {
        const metadata = parsePng(fs.readFileSync(filePath), filePath);
        const dimension = `${metadata.width}x${metadata.height}`;
        dimensionCounts.set(dimension, (dimensionCounts.get(dimension) ?? 0) + 1);
        pngs.push({
          fileName: path.basename(filePath),
          relativePath,
          byteLength: fs.statSync(filePath).size,
          ...metadata,
        });
        pngCount += 1;
      } catch (error) {
        const issue = { id, file: relativePath, message: error.message };
        errors.push(issue);
        pngs.push({ fileName: path.basename(filePath), relativePath, error: error.message });
      }
    }

    const validPngs = pngs.filter((png) => png.width && png.height);
    const sizes = [...new Set(validPngs.map((png) => `${png.width}x${png.height}`))].sort();
    if (sizes.length > 1) {
      const issue = {
        id,
        directory: directoryPath,
        dimensions: sizes,
        files: validPngs.map((png) => ({ file: png.relativePath, dimension: `${png.width}x${png.height}` })),
      };
      dimensionInconsistencies.push(issue);
    }

    directories.push({
      id,
      directory: directoryPath,
      status: pngFiles.length === 0 ? 'no-effect-png' : 'ok',
      pngs,
      dimensions: sizes,
      dimensionConsistent: sizes.length <= 1,
    });
  }

  const labels = [csvHeader];
  for (const directory of directories) {
    for (const png of directory.pngs) {
      if (png.error) continue;
      labels.push([directory.id, png.relativePath, ...Array(13).fill('')].map(csvEscape).join(','));
    }
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    inputRoot,
    range: { start, end },
    summary: {
      expectedDirectoryCount: end - start + 1,
      scannedDirectoryCount: directories.filter((directory) => directory.status !== 'missing-directory').length,
      missingDirectoryCount: missingDirectories.length,
      noPngDirectoryCount: noPngDirectories.length,
      pngCount,
      dimensionInconsistencyCount: dimensionInconsistencies.length,
      distinctDimensions: [...dimensionCounts.keys()].sort(),
      dimensionCounts: Object.fromEntries([...dimensionCounts.entries()].sort(([a], [b]) => a.localeCompare(b, 'en'))),
      parseErrorCount: errors.length,
    },
    reports: {
      missingDirectories,
      noPngDirectories,
      dimensionInconsistencies,
      errors,
    },
    directories,
    csvHeader,
    labelsCsv: labels.join('\n') + '\n',
  };
}

function writeOutputs(scan, outDir, overwrite) {
  const manifestPath = path.join(outDir, 'manifest.json');
  const labelsPath = path.join(outDir, 'spine_effect_labels.csv');
  if (!overwrite) {
    const existing = [manifestPath, labelsPath].filter((filePath) => fs.existsSync(filePath));
    if (existing.length > 0) {
      throw new Error(`输出已存在，为避免覆盖请指定 --overwrite: ${existing.join(', ')}`);
    }
  }

  fs.mkdirSync(outDir, { recursive: true });
  const manifest = { ...scan };
  delete manifest.labelsCsv;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(labelsPath, scan.labelsCsv, 'utf8');
  return { manifestPath, labelsPath };
}

function printReport(scan, outputs) {
  const { summary, reports } = scan;
  console.log(`扫描完成: ${scan.inputRoot}`);
  console.log(`范围: ${formatId(scan.range.start)}–${formatId(scan.range.end)}`);
  console.log(`编号目录: ${summary.scannedDirectoryCount}/${summary.expectedDirectoryCount}，PNG: ${summary.pngCount}`);
  console.log(`缺失目录 (${reports.missingDirectories.length}): ${reports.missingDirectories.join(', ') || '无'}`);
  console.log(`无 PNG (${reports.noPngDirectories.length}): ${reports.noPngDirectories.join(', ') || '无'}`);
  console.log(`尺寸不一致 (${reports.dimensionInconsistencies.length}): ${reports.dimensionInconsistencies.map((item) => `${item.id}[${item.dimensions.join(', ')}]`).join(', ') || '无'}`);
  if (reports.errors.length > 0) console.log(`解析错误 (${reports.errors.length}): ${reports.errors.map((item) => `${item.id}/${item.file ?? item.directory}`).join(', ')}`);
  console.log(`manifest: ${outputs.manifestPath}`);
  console.log(`labels:   ${outputs.labelsPath}`);
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
  } else {
    const csvHeader = readCsvHeader();
    const scan = collectScan(args.input, args.start, args.end, csvHeader);
    const outputs = writeOutputs(scan, args.outDir, args.overwrite);
    printReport(scan, outputs);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
  if (process.exitCode) {
    console.error('使用 --help 查看用法。');
  }
}
