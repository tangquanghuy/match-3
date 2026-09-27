import manifest from '../assets/audio/narrator/manifest.json';

/** Only finalized takes are exposed to the browser; archived takes are never bundled. */
const urls = import.meta.glob('../assets/audio/narrator/*.mp3', {
  query: '?url', import: 'default', eager: true,
}) as Record<string, string>;

export interface NarrationClip {
  id: string;
  pool: string;
  url: string;
  duration: number;
}

export const NARRATION_CLIPS: readonly NarrationClip[] = manifest.filter((m) => m.enabled).map((m) => ({
  id: m.id, pool: m.pool, duration: m.duration,
  url: urls[`../assets/audio/narrator/${m.id}.mp3`],
}));
