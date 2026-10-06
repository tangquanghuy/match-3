/** Release-scoped URLs bypass browser-cached 404s from before an artwork deploy. */
export function portraitUrl(portrait: string | null): string {
  if (!portrait) return '';
  const revision = import.meta.env.VITE_PORTRAIT_REVISION || 'dev';
  return `/static/portraits/${portrait}.webp?v=${revision}`;
}
