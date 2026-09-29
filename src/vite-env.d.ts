/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * 宿主 origin 白名单，逗号分隔。只有配置了它，嵌入 iframe 时才启用 postMessage 桥。
   * 例：VITE_HOST_ORIGINS=https://tavern.example,https://airp.example
   */
  readonly VITE_HOST_ORIGINS?: string;
  /** 远端存档 API（如 /api/meta）；设了就走 Worker + Durable Object，否则本地存档 */
  readonly VITE_META_API?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
