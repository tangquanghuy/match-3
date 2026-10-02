import { describe, expect, it } from 'vitest';
import { createFreshSave, runCommand } from '../../src/meta/server/core';
import { defaultEnv } from '../../src/meta/server/env';
import { hydrateSave } from '../../src/meta/state/save';
import { recordsToSave, saveToRecords } from '../../src/meta/state/records';
import { CommandGateway, LocalTransport, memoryStorage } from '../../src/meta/gateway';
import { characterPortrait, hydrateCharacter, isCharacterPortrait, MAX_PORTRAIT_LENGTH, type CharacterGender } from '../../src/meta/state/character';
import type { MetaCommand } from '../../src/meta/server/protocol';

const now = 1_790_000_000_000;
const env = defaultEnv({ now: () => now, seed: () => 42, requireCharacter: true, accountName: () => 'Discord 旅者 <&>' });
const create = (gender: CharacterGender = 'unknown'): MetaCommand<'createCharacter'> => ({ type: 'createCharacter', args: { gender, portrait: 'default:' + gender } });

describe('character identity and authoritative creation', () => {
  it('marks only fresh new accounts as pending, preserving demo and old saves', () => {
    const fresh = createFreshSave('new', now);
    expect(fresh.character).toBeNull();
    expect(hydrateSave(fresh as unknown as Record<string, unknown>).character).toBeNull();
    const old = { ...fresh } as Record<string, unknown>;
    delete old.character;
    expect(hydrateSave(old).character?.portrait).toBe('legacy');
    expect(createFreshSave('demo', now).character?.portrait).toBe('legacy');
  });
  it.each(['male', 'female', 'unknown'] as const)('creates %s and persists through records hydration', gender => {
    const fresh = createFreshSave('new', now);
    const outcome = runCommand(fresh, create(gender), env);
    expect(outcome.result).toEqual({ ok: true });
    expect(outcome.commit).toBe(true);
    expect(outcome.save.character).toEqual({ name: 'Discord 旅者 <&>', gender, portrait: 'default:' + gender });
    expect(fresh.character).toBeNull();
    expect(outcome.save.revision).toBe(fresh.revision + 1);
    expect(recordsToSave(saveToRecords(outcome.save), now).character).toEqual(outcome.save.character);
    expect(outcome.save.onboarding.step).toBe('battle');
    expect(characterPortrait(outcome.save.character)).toBe(`/static/hero/character-${gender}.webp`);
  });
  it('ignores a client supplied name and rejects a second creation', () => {
    const command = { ...create(), args: { ...create().args, name: 'forged' } };
    const first = runCommand(createFreshSave('new', now), command, env);
    expect(first.save.character?.name).toBe('Discord 旅者 <&>');
    const second = runCommand(first.save, create('female'), defaultEnv({ accountName: () => 'Renamed' }));
    expect(second.result).toMatchObject({ ok: false, code: 'ALREADY_UNLOCKED' });
    expect(second.commit).toBe(false);
    expect(second.save).toBe(first.save);
  });
  it('rejects creation without trusted identity and rejects gameplay until creation', () => {
    const fresh = createFreshSave('new', now);
    expect(runCommand(fresh, create(), defaultEnv()).result).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    expect(runCommand(fresh, { type: 'planTutorialBattle', args: {} }, env).result).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
    const created = runCommand(fresh, create(), env).save;
    expect(runCommand(created, { type: 'planTutorialBattle', args: {} }, env).result).toMatchObject({ ok: true });
  });
  it.each([
    { gender: 'other', portrait: 'default:unknown' },
    { gender: 'male', portrait: 'javascript:alert(1)' },
    { gender: 'male', portrait: 'data:image/svg+xml;base64,AAAA' },
    { gender: 'male', portrait: 'https://x.test/' + 'a'.repeat(2048) },
    { gender: 'male', portrait: 'legacy' },
    { gender: 'male', portrait: null },
  ])('rejects malformed creation atomically: %j', args => {
    const fresh = createFreshSave('new', now);
    const outcome = runCommand(fresh, { type: 'createCharacter', args } as MetaCommand<'createCharacter'>, env);
    expect(outcome.result).toMatchObject({ ok: false, code: 'INVALID' });
    expect(outcome.save).toBe(fresh);
    expect(outcome.commit).toBe(false);
  });
  it('persists URL portraits, resets identity, and recreates with current authenticated name', async () => {
    const storage = memoryStorage();
    const make = (name: string) => new CommandGateway(new LocalTransport(storage, { fresh: 'new', requireCharacter: true, accountName: () => name }));
    const first = make('First');
    await first.load();
    expect((await first.createCharacter({ gender: 'female', portrait: 'https://images.example/portrait.webp?v=2' })).result.ok).toBe(true);
    const second = make('Next');
    expect((await second.load()).save.character?.name).toBe('First');
    expect(second.current().character?.portrait).toContain('https://images.example/');
    expect((await second.resetToNewGame()).save.character).toBeNull();
    const third = make('Next');
    expect((await third.load()).save.character).toBeNull();
    await third.createCharacter(create('male').args);
    expect(third.current().character?.name).toBe('Next');
  });
  it('changes only the portrait through an authoritative command', () => {
    const created = runCommand(createFreshSave('new', now), create('female'), env).save;
    const before = created.character!;
    const command: MetaCommand<'setCharacterPortrait'> = { type: 'setCharacterPortrait', args: { portrait: 'https://images.example/new.webp' } };
    const changed = runCommand(created, command, env);
    expect(changed.result).toEqual({ ok: true });
    expect(changed.save.character).toEqual({ ...before, portrait: command.args.portrait });
    expect(created.character).toEqual(before);
    expect(runCommand(changed.save, { ...command, args: { portrait: 'javascript:alert(1)' } }, env)).toMatchObject({ commit: false, result: { ok: false, code: 'INVALID' } });
    expect(runCommand(createFreshSave('new', now), command, env).result).toMatchObject({ ok: false, code: 'PREREQ_LOCKED' });
  });
});

describe('portrait validation and migration', () => {
  it.each(['https://images.example/a.webp?x=1&y=2', 'default:male', 'default:female', 'default:unknown'])('accepts %s', value => expect(isCharacterPortrait(value)).toBe(true));
  it.each(['http://example.com/a.png', '//example.com/a.png', 'file:///C:/a.png', 'https://u:p@example.com/a.png', 'https://example.com/"onerror="x', 'https://example.com/\nfoo', 'data:image/webp;base64,AAAA', 'https://example.com/' + 'a'.repeat(MAX_PORTRAIT_LENGTH)])('rejects dangerous/oversized portrait', value => expect(isCharacterPortrait(value)).toBe(false));
  it('preserves explicit pending state, migrates missing identity, and rejects malformed sections', () => {
    expect(hydrateCharacter(null)).toBeNull();
    expect(hydrateCharacter(undefined)?.name).toBe('影织者');
    expect(hydrateCharacter({ name: '', gender: 'male', portrait: 'default:male' })).toBeNull();
    expect(hydrateCharacter({ name: 'A', gender: 'invalid', portrait: 'default:male' })).toBeNull();
  });
});
