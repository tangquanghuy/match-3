/** Persisted identity. Names come exclusively from the authenticated server environment. */
export type CharacterGender = 'male' | 'female' | 'unknown';
export interface CharacterProfile { name: string; gender: CharacterGender; portrait: string }
export interface CreateCharacterInput { gender: CharacterGender; portrait: string }
export const MAX_PORTRAIT_LENGTH = 48_000;
export const LEGACY_CHARACTER: CharacterProfile = { name: '影织者', gender: 'unknown', portrait: 'legacy' };
export const LOCAL_CHARACTER_NAME = '本地旅者';
export function isCharacterGender(value: unknown): value is CharacterGender {
  return value === 'male' || value === 'female' || value === 'unknown';
}
export function isCharacterPortrait(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (/^default:(male|female|unknown)$/.test(value)) return true;
  if (value.length > MAX_PORTRAIT_LENGTH) return false;
  if (/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    try {
      const bytes = atob(value.slice(value.indexOf(',') + 1));
      return bytes.length > 20 && bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
    } catch { return false; }
  }
  if (value.length > 2048 || /[<>"'`\s]/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}
/** Missing section = existing account; explicit null = new account waiting for creation. */
export function hydrateCharacter(raw: unknown): CharacterProfile | null {
  if (raw === null) return null;
  if (raw === undefined) return { ...LEGACY_CHARACTER };
  if (typeof raw !== 'object') return null;
  const p = raw as Partial<CharacterProfile>;
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > 128 || !isCharacterGender(p.gender)) return null;
  if (p.portrait !== 'legacy' && !isCharacterPortrait(p.portrait)) return null;
  return { name: p.name, gender: p.gender, portrait: p.portrait };
}

export const DEFAULT_CHARACTER_PORTRAITS: Record<CharacterGender, string> = {
  male: '/static/hero/character-male.webp', female: '/static/hero/character-female.webp', unknown: '/static/hero/character-unknown.webp',
};
export function characterPortrait(profile: CharacterProfile | null): string {
  if (!profile || profile.portrait === 'legacy') return '/static/hero/seiji.webp';
  if (profile.portrait.startsWith('default:')) return DEFAULT_CHARACTER_PORTRAITS[profile.portrait.slice(8) as CharacterGender] ?? DEFAULT_CHARACTER_PORTRAITS.unknown;
  return profile.portrait;
}
export function characterName(profile: CharacterProfile | null): string { return profile?.name ?? '影织者'; }
