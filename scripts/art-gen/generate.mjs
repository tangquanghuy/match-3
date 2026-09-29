// 美术素材文生图（OpenAI 兼容 images/generations 接口）。
// 密钥只从环境变量读取：VSA_KEY（必填）、VSA_BASE、VSA_IMAGE_MODEL。不落盘、不打印。
// 用法：node scripts/art-gen/generate.mjs [id ...] [--force]
//   原图写到 artifacts/art-gen/raw/<id>.png（大体积原图不进版本库），已存在的默认跳过（断点续跑）；
//   再跑 python scripts/art-gen/process.py 裁边压缩成 webp，写入 src/assets/meta/**（进版本库）。
// ART_MANIFEST 可切换素材清单（默认 assets.mjs；活动玩法重做用 eventAssets.mjs）。
import { existsSync, mkdirSync, writeFileSync } from 'fs';
const { ASSETS } = await import(`./${process.env.ART_MANIFEST ?? 'assets.mjs'}`);

const base = process.env.VSA_BASE ?? 'https://verysadai.com/v1';
const key = process.env.VSA_KEY;
if (!key) throw new Error('缺少环境变量 VSA_KEY');
const model = process.env.VSA_IMAGE_MODEL ?? 'gpt-image-2.5-flare';
const rawDir = 'artifacts/art-gen/raw';
mkdirSync(rawDir, { recursive: true });

const args = process.argv.slice(2);
const force = args.includes('--force');
const ids = args.filter((a) => !a.startsWith('--'));
const todo = (ids.length ? ids : Object.keys(ASSETS)).filter((id) => {
  if (!ASSETS[id]) throw new Error(`未知素材：${id}`);
  return force || !existsSync(`${rawDir}/${id}.png`);
});

async function generate(id, spec) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const started = Date.now();
    let status = 0;
    let text = '';
    try {
      const res = await fetch(`${base}/images/generations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: spec.prompt,
          size: spec.size,
          n: 1,
          quality: 'high',
          background: spec.background ?? 'transparent',
          output_format: 'png',
        }),
        signal: AbortSignal.timeout(300000),
      });
      status = res.status;
      text = await res.text();
    } catch (e) {
      text = String(e);
    }
    const secs = ((Date.now() - started) / 1000).toFixed(0);
    if (status === 200) {
      const json = JSON.parse(text);
      const b64 = json?.data?.[0]?.b64_json;
      if (b64) {
        writeFileSync(`${rawDir}/${id}.png`, Buffer.from(b64, 'base64'));
        console.log(`${id}: OK ${secs}s`);
        return true;
      }
      console.log(`${id}: 200 without image ${text.slice(0, 300)}`);
      return false;
    }
    console.log(`${id}: attempt ${attempt} -> ${status} (${secs}s) ${text.slice(0, 200)}`);
    if (status !== 503 && status !== 429 && status !== 0 && status < 500) return false;
    await new Promise((r) => setTimeout(r, 8000 * attempt));
  }
  return false;
}

// 并发 3：生图较慢，避免串行等待，又不给中转压太大并发
const queue = [...todo];
const results = [];
await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
  while (queue.length) {
    const id = queue.shift();
    results.push([id, await generate(id, ASSETS[id])]);
  }
}));
console.log('done', JSON.stringify(Object.fromEntries(results)));
