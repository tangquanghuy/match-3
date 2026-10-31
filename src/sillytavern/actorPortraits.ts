/**
 * Party portraits follow the card's status bar (底部状态栏), which shows, in order:
 * a locally uploaded image, the MVU `头像` field, then the card's preset avatar table.
 *
 * - Web addresses (MVU `头像`, preset table) go into the battle snapshot and are saved.
 * - Locally uploaded images are large data URLs kept in this browser's localStorage. They are
 *   display-only: shown in the party dialog, the message lineup and the battle, never saved
 *   into requests, receipts or reports. Another browser falls back to the saved portrait.
 */
const MAX_URL_LENGTH = 2048;
const MAX_LOCAL_IMAGE_LENGTH = 4 * 1024 * 1024;
/** Name of the function the status bar registers on the tavern window: (name) => preset URL. */
export const PRESET_PORTRAIT_HOOK = '__match3PresetPortrait';
export type PresetPortraitResolver = (name: string) => string | undefined;

/** Only absolute http(s) addresses are saved as portraits. */
export function webPortraitUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_URL_LENGTH) return undefined;
  try { const url = new URL(value.trim()); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined; }
  catch { return undefined; }
}
/** Preset lookup registered by the status bar, when present. Errors and non-web results count as none. */
export function presetPortraitResolver(host: Window | undefined): PresetPortraitResolver | undefined {
  let hook: unknown;
  try { hook = host ? (host as unknown as Record<string, unknown>)[PRESET_PORTRAIT_HOOK] : undefined; } catch { return undefined; }
  if (typeof hook !== 'function') return undefined;
  return name => { try { return webPortraitUrl((hook as (name: string) => unknown)(name)); } catch { return undefined; } };
}
/** The status bar's localStorage keys: `rpg_player_avatar` for the protagonist, `rpg_bond_avatar_<名字>` for bonds. */
export function localPortrait(host: Window | undefined, kind: 'hero' | 'companion', name: string): string | undefined {
  let value: string | null = null;
  try { value = host?.localStorage.getItem(kind === 'hero' ? 'rpg_player_avatar' : `rpg_bond_avatar_${name}`) ?? null; } catch { return undefined; }
  if (!value || value.length > MAX_LOCAL_IMAGE_LENGTH) return undefined;
  return /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=\s]+$/i.test(value) ? value : webPortraitUrl(value);
}
/** Display overrides for a party: externalId (member ref) -> locally uploaded image. */
export function localPartyPortraits(host: Window | undefined, party: readonly { externalId: string; name: string }[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const unit of party) {
    const kind = unit.externalId === '/人物' ? 'hero' : 'companion';
    const image = localPortrait(host, kind, unit.name);
    if (image) result[unit.externalId] = image;
  }
  return result;
}
