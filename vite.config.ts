import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// `base` 通过环境变量可配置，适配子路径部署（例如 VITE_BASE=/gems/ npm run build）
const base = process.env.VITE_BASE ?? '/';
const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/**
 * 资源布局（详见 game-assets/README.md）：
 *  - game-assets/bundled  代码 import 的资源（@assets/...，构建时带 hash）
 *  - game-assets/public   原样发布的静态资源（URL /static/...）
 *  - game-assets/source   原图/源文件，不参与构建
 */
export default defineConfig(({ mode }) => ({
  base,
  publicDir: root('./game-assets/public'),
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
    rollupOptions: {
      // 线上（--mode remote）只发布游戏外壳；单机对局页与技能测试台只在开发时构建
      input: mode === 'remote'
        ? { game: root('./game.html') }
        : {
            main: root('./index.html'),
            skillsTest: root('./skills-test.html'),
            game: root('./game.html'),
          },
    },
  },
}));
