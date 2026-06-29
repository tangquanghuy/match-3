import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// `base` 通过环境变量可配置，适配 GitHub Pages 子路径部署（需求 21.3）。
// 例如部署到 https://user.github.io/gems/ 时，构建用 VITE_BASE=/gems/ npm run build
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  resolve: {
    alias: {
      '@engine': fileURLToPath(new URL('./src/engine', import.meta.url)),
      '@render': fileURLToPath(new URL('./src/render', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
});
