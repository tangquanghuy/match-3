/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * 宿主 origin 白名单，逗号分隔。只有配置了它，嵌入 iframe 时才启用 postMessage 桥。
   * 例：VITE_HOST_ORIGINS=https://tavern.example,https://airp.example
   */
  readonly VITE_HOST_ORIGINS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
