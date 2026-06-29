/* ESLint 配置：强制逻辑层（src/engine）纯净——禁止依赖渲染/动画/浏览器（需求 17.2） */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: { browser: true, es2022: true, node: true },
  rules: {
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      // 逻辑层纯净性：禁止 import pixi/gsap/howler 等表现层依赖
      files: ['src/engine/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              { name: 'pixi.js', message: '逻辑层（engine）禁止依赖 PixiJS（需求 17.2）' },
              { name: 'gsap', message: '逻辑层（engine）禁止依赖 GSAP（需求 17.2）' },
              { name: 'howler', message: '逻辑层（engine）禁止依赖 Howler（需求 17.2）' },
            ],
            patterns: [
              { group: ['@render/*'], message: '逻辑层（engine）禁止依赖表现层（需求 17.2）' },
            ],
          },
        ],
      },
    },
  ],
  ignorePatterns: ['dist', 'node_modules', '*.config.ts', '.eslintrc.cjs'],
};
