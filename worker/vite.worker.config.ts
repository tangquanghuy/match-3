/**
 * Worker 打包：把 worker/src/index.ts 连同 src/meta 权威核心打成单个 ESM 文件。
 * 用 Vite 而不是 wrangler 自带打包，是因为共享代码里有 `?url` 资源导入与路径别名，
 * 与客户端构建同一套解析规则，资源 URL（带 hash）两边一致。
 */
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

const root = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@engine': root('../src/engine'),
      '@render': root('../src/render'),
      '@session': root('../src/session'),
    },
  },
  // 静态资源归客户端构建（../dist），Worker 包里只要代码
  publicDir: false,
  ssr: { target: 'webworker', noExternal: true },
  build: {
    ssr: root('./src/index.ts'),
    outDir: root('./dist'),
    emptyOutDir: true,
    target: 'es2022',
    minify: true,
    rollupOptions: {
      // Workers 运行时内置模块，由 workerd 提供
      external: [/^cloudflare:/],
      output: { format: 'es', entryFileNames: 'index.js', inlineDynamicImports: true },
    },
  },
});
