import { afterEach, describe, expect, it, vi } from 'vitest';
import { guestTermsAccepted, isLocalGuest, localGuestStorage, LOCAL_GUEST_SESSION_KEY, loginLocalGuest, logoutLocalGuest } from '../../src/auth/localGuest';
import { defaultMetaGateway, HttpTransport, memoryStorage } from '../../src/meta/gateway';
import { TERMS_VERSION } from '../../src/legal/terms';

function storageFixture() {
  const storage = { ...memoryStorage(), removeItem: vi.fn((key: string) => { values.delete(key); }) };
  const values = new Map<string, string>();
  storage.getItem = key => values.get(key) ?? null;
  storage.setItem = (key, value) => { values.set(key, value); };
  vi.stubGlobal('localStorage', storage);
  return storage;
}

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('local guest login', () => {
  it('uses a new local game without developer commands even in a remote build', async () => {
    storageFixture();
    vi.stubEnv('VITE_META_API', '/api/meta');
    loginLocalGuest();
    const gateway = defaultMetaGateway();
    expect(gateway.backend).toBe('local');
    expect(gateway.dev).toBeNull();
    const { save } = await gateway.load();
    expect(save.character).toBeNull();
    expect(save.onboarding.step).toBe('battle');
    const reply = await gateway.createCharacter({ gender: 'female', portrait: 'default:female' });
    expect(reply.result.ok).toBe(true);
    expect(gateway.current().character?.name).toBe('本地旅者');
  });

  it('retains progress across logout and login without modifying existing local saves', async () => {
    const storage = storageFixture();
    storage.setItem('gems.meta.save', 'existing development save');
    loginLocalGuest();
    const gateway = defaultMetaGateway();
    await gateway.load();
    await gateway.createCharacter({ gender: 'female', portrait: 'default:female' });
    const saved = storage.getItem('guest.gems.meta.save');
    expect(saved).toBeTruthy();
    logoutLocalGuest();
    expect(isLocalGuest()).toBe(false);
    expect(storage.getItem('guest.gems.meta.save')).toBe(saved);
    loginLocalGuest();
    const reloaded = defaultMetaGateway();
    await reloaded.load();
    expect(reloaded.current().character).toEqual(gateway.current().character);
    expect(storage.getItem('gems.meta.save')).toBe('existing development save');
  });

  it('returns to the remote backend on logout', () => {
    storageFixture();
    vi.stubEnv('VITE_META_API', '/api/meta');
    loginLocalGuest();
    logoutLocalGuest();
    expect(defaultMetaGateway().backend).toBe('remote');
    expect(new HttpTransport().allowDev).toBe(false);
  });

  it('keeps the main save and its backup inside the guest namespace', () => {
    const storage = storageFixture();
    const guest = localGuestStorage(storage);
    guest.setItem('gems.meta.save', 'main');
    guest.setItem('gems.meta.save.bak', 'backup');
    expect(guest.getItem('gems.meta.save')).toBe('main');
    expect(storage.getItem('guest.gems.meta.save.bak')).toBe('backup');
    expect(storage.getItem('gems.meta.save')).toBeNull();
  });

  it('requires renewed consent when terms change while retaining the guest selection', () => {
    const storage = storageFixture();
    storage.setItem(LOCAL_GUEST_SESSION_KEY, String(TERMS_VERSION - 1));
    expect(isLocalGuest()).toBe(true);
    expect(guestTermsAccepted()).toBe(false);
    loginLocalGuest();
    expect(guestTermsAccepted()).toBe(true);
  });

  it('reports storage failure instead of establishing an ephemeral guest session', () => {
    vi.stubGlobal('localStorage', {
      getItem() { throw new Error('storage denied'); },
      setItem() { throw new Error('storage denied'); },
    });
    expect(isLocalGuest()).toBe(false);
    expect(guestTermsAccepted()).toBe(false);
    expect(loginLocalGuest).toThrow('storage denied');
  });
});
