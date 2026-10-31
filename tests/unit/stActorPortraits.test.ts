import { describe, expect, it } from 'vitest';
import { localPartyPortraits, localPortrait, presetPortraitResolver, PRESET_PORTRAIT_HOOK, webPortraitUrl } from '../../src/sillytavern/actorPortraits';

function hostWith(storage: Record<string, string>, hook?: unknown): Window {
  const localStorage = { getItem: (key: string) => (Object.hasOwn(storage, key) ? storage[key]! : null) };
  return { localStorage, ...(hook !== undefined ? { [PRESET_PORTRAIT_HOOK]: hook } : {}) } as unknown as Window;
}
const image = 'data:image/webp;base64,UklGRg==';

describe('status bar portrait sources', () => {
  it('saves only absolute web addresses', () => {
    expect(webPortraitUrl('https://cdn.example/a b.webp')).toBe('https://cdn.example/a%20b.webp');
    for (const value of [image, 'javascript:alert(1)', '/static/x.webp', '', 42, undefined, 'https://x/' + 'a'.repeat(3000)]) expect(webPortraitUrl(value)).toBeUndefined();
  });
  it('wraps the status bar preset hook and treats errors or non-web results as none', () => {
    expect(presetPortraitResolver(hostWith({}))).toBeUndefined();
    const resolve = presetPortraitResolver(hostWith({}, (name: string) => (name === '夜斗' ? 'https://cdn.example/夜斗.webp' : name === '坏' ? image : '')))!;
    expect(resolve('夜斗')).toBe(new URL('https://cdn.example/夜斗.webp').href);
    expect(resolve('坏')).toBeUndefined(); expect(resolve('无')).toBeUndefined();
    expect(presetPortraitResolver(hostWith({}, () => { throw new Error('boom'); }))!('x')).toBeUndefined();
  });
  it('reads the status bar upload keys as display-only images', () => {
    const host = hostWith({ rpg_player_avatar: image, 'rpg_bond_avatar_甲': image, 'rpg_bond_avatar_乙': 'not an image' });
    expect(localPortrait(host, 'hero', '林')).toBe(image);
    expect(localPortrait(host, 'companion', '甲')).toBe(image);
    expect(localPortrait(host, 'companion', '乙')).toBeUndefined();
    expect(localPartyPortraits(host, [{ externalId: '/人物', name: '林' }, { externalId: '/羁绊列表/甲', name: '甲' }, { externalId: '/羁绊列表/丙', name: '丙' }]))
      .toEqual({ '/人物': image, '/羁绊列表/甲': image });
    const broken = { get localStorage(): Storage { throw new Error('denied'); } } as unknown as Window;
    expect(localPortrait(broken, 'hero', '林')).toBeUndefined();
  });
});
