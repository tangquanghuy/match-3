import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

// `base` 通过环境变量可配置，适配子路径部署（例如 VITE_BASE=/gems/ npm run build）
const base = process.env.VITE_BASE ?? '/';
const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * Cloudflare Workers 静态资源的缓存头（_headers 放在资源目录根，不会被当成文件发布）。
 * 默认是 `max-age=0, must-revalidate`：每张图每次使用都要回源校验一次，切屏/开战明显卡顿。
 *  - /assets/*  文件名带内容哈希，可永久缓存；
 *  - /static/*  文件名不带哈希：缓存 7 天，过期后先用旧的、后台再校验（换图最多延迟一周生效，
 *               需要立刻生效时改文件名）。
 *  - 页面与预载清单保持默认（每次校验），保证发版后立刻拿到新入口。
 */
const HEADERS = `/assets/*
  Cache-Control: public, max-age=31536000, immutable
/static/*
  Cache-Control: public, max-age=604800, stale-while-revalidate=2592000
`;

/** 进游戏前要预热的打包素材目录：界面/战斗图片 + 战斗音效与解说（BGM 流式播放、社区头像不在内） */
const WARM_DIRS = /game-assets\/bundled\/(gems|fx|chrome|status-icons|ui|meta|materials|audio\/(combat|gems|skills|status|narrator|result))\//;
/**
 * 各固定界面用到的不带哈希的静态素材（地图、王国纹章与底图、主角、宝箱、段位徽章、召唤特效与音效…）。
 * 部队立绘（static/portraits）与武器卡面（static/weapons）按条目数以千计，不预载，仍在真正显示时懒加载。
 */
const WARM_STATIC_DIRS = ['map', 'kingdoms', 'crests', 'hero', 'troops', 'ui', 'chests', 'invasion-ranks', 'fx', 'sfx'];

function listStatic(dirs: string[]): string[] {
  const files: string[] = [];
  const walk = (rel: string): void => {
    const abs = root(`./game-assets/public/${rel}`);
    if (!existsSync(abs)) return;
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const next = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(next);
      else if (/\.(webp|png|jpe?g|wav|mp3)$/i.test(entry.name)) files.push(next);
    }
  };
  for (const dir of dirs) walk(`static/${dir}`);
  return files;
}

/**
 * 构建期产出：
 *  - `_headers`               缓存策略（见上）；
 *  - `preload-manifest.json`  game 入口依赖的全部 JS/CSS + 首屏/战斗常用图，封面页据此在进游戏前预热 HTTP 缓存。
 */
function deployManifest(): Plugin {
  return {
    name: 'deploy-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      this.emitFile({ type: 'asset', fileName: '_headers', source: HEADERS });
      const entry = Object.values(bundle).find((c) => c.type === 'chunk' && c.isEntry && c.name === 'game');
      if (!entry) return;
      const code = new Set<string>();
      const assets = new Set<string>();
      const visit = (file: string): void => {
        const chunk = bundle[file];
        if (!chunk || chunk.type !== 'chunk' || code.has(file)) return;
        code.add(file);
        chunk.viteMetadata?.importedCss.forEach((css) => code.add(css));
        chunk.viteMetadata?.importedAssets.forEach((asset) => assets.add(asset));
        [...chunk.imports, ...chunk.dynamicImports].forEach(visit);
      };
      visit(entry.fileName);
      const images = [...assets].filter((file) => {
        const asset = bundle[file];
        if (!asset || asset.type !== 'asset' || !/\.(png|webp|wav|mp3|flac)$/i.test(file)) return false;
        return asset.originalFileNames.some((src) => WARM_DIRS.test(src.replace(/\\/g, '/')));
      });
      const manifest = {
        code: [...code].map((f) => base + f),
        images: [...listStatic(WARM_STATIC_DIRS), ...images].map((f) => base + f),
      };
      this.emitFile({ type: 'asset', fileName: 'preload-manifest.json', source: JSON.stringify(manifest) });
    },
  };
}

/**
 * 资源布局（详见 game-assets/README.md）：
 *  - game-assets/bundled  代码 import 的资源（@assets/...，构建时带 hash）
 *  - game-assets/public   原样发布的静态资源（URL /static/...）
 *  - game-assets/source   原图/源文件，不参与构建
 */
export default defineConfig(({ mode }) => ({
  base,
  publicDir: root('./game-assets/public'),
  plugins: [deployManifest()],
  resolve: {
    alias: {
      '@engine': root('./src/engine'),
      '@render': root('./src/render'),
      '@session': root('./src/session'),
      '@assets': root('./game-assets/bundled'),
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    // game 主包里约 5 MB 是静态数据 JSON（部队/武器/成长表…）；单独成块并行下载，
    // 且只改代码的版本不会让玩家重新下载数据（反之亦然）
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      // 线上（--mode remote）只发布游戏外壳；单机对局页与技能测试台只在开发时构建
      input: mode === 'remote'
        ? { cover: root('./cover.html'), game: root('./game.html') }
        : {
            main: root('./index.html'),
            skillsTest: root('./skills-test.html'),
            cover: root('./cover.html'),
            game: root('./game.html'),
          },
      output: {
        manualChunks(id) {
          if (/[\\/]src[\\/].+\.json$/.test(id.split('?')[0]!)) return 'data';
          return undefined;
        },
      },
    },
  },
}));
