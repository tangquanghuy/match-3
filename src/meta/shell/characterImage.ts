import { characterPortrait, DEFAULT_CHARACTER_PORTRAITS, type CharacterProfile } from '../state/character';
/** Use DOM properties for user-controlled URLs and a one-shot default fallback. */
export function setCharacterImage(image: HTMLImageElement, profile: CharacterProfile | null): void {
  image.referrerPolicy = 'no-referrer';
  image.alt = profile?.name ?? '主角';
  image.onerror = () => { image.onerror = null; image.src = DEFAULT_CHARACTER_PORTRAITS[profile?.gender ?? 'unknown']; };
  image.src = characterPortrait(profile);
}
