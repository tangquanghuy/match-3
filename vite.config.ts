import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Connect, type Plugin } from 'vite';

// `base` 通过环境变量可配置，适配 GitHub Pages 子路径部署（需求 21.3）。
// 例如部署到 https://user.github.io/gems/ 时，构建用 VITE_BASE=/gems/ npm run build
const base = process.env.VITE_BASE ?? '/';

// 部队立绘只提供自定义图。官方 GOW 部队立绘已移到「三消原图/待废弃」，不再兜底。
// 武器卡面仍在 public/gowhead-icons/，不经过这条路径。
// dev/preview 由中间件按 /meta/assets/portraits/<fileBase>.webp 提供；
// 没有对应文件时沿 onerror 兜底链回退（生成图 CDN → 通用类型图）。
const PORTRAIT_ROOT = fileURLToPath(new URL('./data/raw/gow-2026-09-18/portraits', import.meta.url));
const CUSTOM_PORTRAIT_ROOT = fileURLToPath(new URL('./data/raw/custom-portraits', import.meta.url));

function resolvePortrait(raw: string): string | null {
  const filename = `${decodeURIComponent(raw)}.webp`;
  for (const root of [CUSTOM_PORTRAIT_ROOT, PORTRAIT_ROOT]) {
    const file = normalize(join(root, filename));
    if (file.startsWith(root + sep) && existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

function serveGowPortraits(): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const raw = (req.url ?? '').split('?')[0]!.replace(/^\//, '').replace(/\.webp$/i, '');
    let file: string | null;
    try {
      file = resolvePortrait(raw);
    } catch {
      return next();
    }
    if (!file) return next();
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    createReadStream(file).pipe(res);
  };
  return {
    name: 'serve-gow-portraits',
    configureServer(server) {
      server.middlewares.use('/meta/assets/portraits', handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/meta/assets/portraits', handler);
    },
  };
}

export default defineConfig({
  base,
  plugins: [serveGowPortraits()],
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
      '@render': fileURLToPath(new URL('./src/render', import.meta.url)),
      '@session': fileURLToPath(new URL('./src/session', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    rollupOptions: {
      input: {
        // 主对局页 + 技能测试台页 + meta 外壳页
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        skillsTest: fileURLToPath(new URL('./skills-test.html', import.meta.url)),
        game: fileURLToPath(new URL('./game.html', import.meta.url)),
      },
    },
  },
});
