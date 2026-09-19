import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Connect, type Plugin } from 'vite';

// `base` 通过环境变量可配置，适配 GitHub Pages 子路径部署（需求 21.3）。
// 例如部署到 https://user.github.io/gems/ 时，构建用 VITE_BASE=/gems/ npm run build
const base = process.env.VITE_BASE ?? '/';

// 本地 GOW 官方立绘库（1827 张 · 164MB，459×675 官方卡面带背景版，
// /assets/troops/cards/ 端点；旧透明底 1024² 备份在 portraits-flat-1024/）。
// 体积原因不进 git、不进构建产物：dev/preview 由中间件按
// /meta/assets/portraits/<fileBase>.webp 提供；纯静态部署时该路径 404，
// 图鉴立绘会沿 onerror 兜底链回退（生成图 CDN → 通用类型图）。
const PORTRAIT_ROOT = fileURLToPath(new URL('./data/raw/gow-2026-09-18/portraits', import.meta.url));

function serveGowPortraits(): Plugin {
  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const raw = (req.url ?? '').split('?')[0]!.replace(/^\//, '').replace(/\.webp$/i, '');
    let file: string;
    try {
      file = normalize(join(PORTRAIT_ROOT, `${decodeURIComponent(raw)}.webp`));
    } catch {
      return next();
    }
    if (!file.startsWith(PORTRAIT_ROOT + sep) || !existsSync(file) || !statSync(file).isFile()) return next();
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
        // 主对局页 + 技能测试台页 + meta 外壳页 + 武器图鉴页（多页入口）
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        skillsTest: fileURLToPath(new URL('./skills-test.html', import.meta.url)),
        game: fileURLToPath(new URL('./game.html', import.meta.url)),
        weaponsCodex: fileURLToPath(new URL('./weapons-codex.html', import.meta.url)),
      },
    },
  },
});
