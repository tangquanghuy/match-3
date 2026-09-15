#!/usr/bin/env node
/**
 * 截图视觉自审（窗口 G · TASK-THEATER 阶段 3）。
 *
 * 输入 artifacts/theater 下的截图 → 逐图调 OpenAI 兼容视觉接口（prompt 见
 * prompts/visual-review-v1.md）→ 产出 artifacts/theater/review.json。
 * 画廊（scripts/theater/gallery.mjs）会把审查结论并进卡片角标；待修清单聚合视觉未过项。
 *
 * 环境变量：
 *   VISUAL_REVIEW_API_KEY / OPENAI_API_KEY   必填其一，缺失时降级为跳过并警告（任务书约定）
 *   VISUAL_REVIEW_BASE_URL / OPENAI_BASE_URL  默认 https://api.openai.com/v1
 *   VISUAL_REVIEW_MODEL                      默认 gpt-4o-mini
 *   VISUAL_REVIEW_CONCURRENCY                默认 4
 *
 * 用法：node scripts/visual_review.mjs [--dir artifacts/theater] [--only skills|traits|enemies] [--limit N] [--force]
 * 断点续跑：默认跳过 review.json 里已审查且 pass 的图；--force 全量重审。
 */
import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const argv = process.argv.slice(2);
const argValue = (name, fb) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : fb;
};
const DIR = path.resolve(ROOT, argValue('dir', 'artifacts/theater'));
const ONLY = argValue('only', '');
const LIMIT = Number(argValue('limit', Infinity)) || Infinity;
const FORCE = argv.includes('--force');

const API_KEY = process.env.VISUAL_REVIEW_API_KEY || process.env.OPENAI_API_KEY;
const BASE_URL = (process.env.VISUAL_REVIEW_BASE_URL || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const MODEL = process.env.VISUAL_REVIEW_MODEL || 'gpt-4o-mini';
const CONCURRENCY = Number(process.env.VISUAL_REVIEW_CONCURRENCY || 4);
const PROMPT_FILE = 'visual-review-v1.md';

async function main() {
  const promptPath = path.join(ROOT, 'prompts', PROMPT_FILE);
  if (!existsSync(promptPath)) throw new Error(`审查 prompt 不存在：${promptPath}`);
  const systemPrompt = await readFile(promptPath, 'utf8');

  const reviewFile = path.join(DIR, 'review.json');
  const previous = existsSync(reviewFile)
    ? JSON.parse(await readFile(reviewFile, 'utf8')).results || []
    : [];
  const prevByFile = new Map(previous.map((r) => [r.file, r]));

  // 收集截图（相对 DIR 的 posix 风格路径，供画廊匹配）
  const subdirs = ONLY ? [ONLY] : ['skills', 'traits', 'enemies'];
  const files = [];
  for (const sub of subdirs) {
    const dir = path.join(DIR, sub);
    if (!existsSync(dir)) continue;
    for (const f of await readdir(dir)) {
      if (!/\.(png|jpe?g)$/.test(f)) continue;
      const rel = `${sub}/${f}`;
      const prev = prevByFile.get(rel);
      if (!FORCE && prev && prev.pass) continue; // 断点续跑：已过的不再烧钱
      files.push(rel);
    }
  }
  const slice = files.slice(0, LIMIT);

  if (!API_KEY) {
    console.warn('[visual-review] 未配置 VISUAL_REVIEW_API_KEY / OPENAI_API_KEY —— 按任务书降级为跳过并警告。');
    console.warn(`[visual-review] 待审 ${slice.length} 张（总 ${files.length} 张）。配置 key 后重跑即可。`);
    return;
  }
  if (slice.length === 0) {
    console.log('[visual-review] 没有需要审查的新截图。');
    return;
  }

  console.log(`[visual-review] 模型 ${MODEL} · 并发 ${CONCURRENCY} · 本轮 ${slice.length} 张`);
  const results = new Map(prevByFile); // 保留旧结果
  let idx = 0;
  let fails = 0;

  async function worker() {
    for (;;) {
      const i = idx++;
      if (i >= slice.length) return;
      const rel = slice[i];
      const abs = path.join(DIR, rel);
      try {
        const b64 = (await readFile(abs)).toString('base64');
        const verdict = await reviewOne(systemPrompt, b64, path.extname(rel).slice(1));
        results.set(rel, { file: rel, ...verdict });
        if (!verdict.pass) {
          fails += 1;
          console.log(`  ✗ ${rel} → ${(verdict.issues || []).join('；')}`);
        }
      } catch (e) {
        results.set(rel, { file: rel, pass: false, issues: [`审查调用失败：${String(e.message || e).slice(0, 80)}`], severity: 'unknown', model: MODEL });
        fails += 1;
      }
      if ((i + 1) % 20 === 0) await persist(reviewFile, results, slice.length, fails);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await persist(reviewFile, results, slice.length, fails);
  console.log(`[visual-review] 完成：本轮 ${slice.length} 张，未过 ${fails} → artifacts/theater/review.json`);
}

async function reviewOne(systemPrompt, b64, ext) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: [
            { type: 'text', text: '审查这张战斗截图，按约定输出 JSON。' },
            { type: 'image_url', image_url: { url: `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${b64}` } },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  const parsed = JSON.parse(json);
  return {
    pass: !!parsed.pass,
    issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 5) : [],
    severity: parsed.severity || (parsed.pass ? 'ok' : 'major'),
    model: MODEL,
    promptVersion: PROMPT_FILE,
  };
}

async function persist(reviewFile, results, thisRound, fails) {
  const payload = {
    model: MODEL,
    promptVersion: PROMPT_FILE,
    generatedAt: new Date().toISOString(),
    thisRound: thisRound,
    failCount: fails,
    results: [...results.values()],
  };
  await writeFile(reviewFile, JSON.stringify(payload, null, 1), 'utf8');
}

main().catch((e) => {
  console.error('[visual-review] 失败：', e);
  process.exitCode = 1;
});
