import manifest from '@assets/audio/narrator/manifest.json';
import subtitles from '@assets/audio/narrator/subtitles.zh-CN.json';

/**
 * Only finalized takes are exposed to the browser; archived takes are never bundled.
 * 文件名（不含扩展名）→ URL：别名 glob 的键形式随环境不同，只按文件名对表。
 */
const urls: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('@assets/audio/narrator/*.mp3', {
    query: '?url', import: 'default', eager: true,
  }) as Record<string, string>).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -'.mp3'.length), url]),
);

export interface NarrationClip {
  id: string;
  pool: string;
  url: string;
  duration: number;
  /** Translated from the selected recording, never from the event alone. */
  subtitleZh?: string;
  transcriptEn?: string;
}

export const NARRATION_CLIPS: readonly NarrationClip[] = manifest.filter((m) => m.enabled).map((m) => ({
  id: m.id, pool: m.pool, duration: m.duration,
  subtitleZh: (subtitles as Record<string, { zh: string; en: string }>)[m.id]?.zh,
  transcriptEn: (subtitles as Record<string, { zh: string; en: string }>)[m.id]?.en,
  url: urls[m.id]!,
}));
