import { describe, expect, it, vi } from 'vitest';
import { CharacterCard } from '@render/TeamView';

describe('card mana during event playback', () => {
  it('keeps the played value through unrelated refreshes and syncs at action end', () => {
    const card = Object.create(CharacterCard.prototype) as CharacterCard;
    const internals = card as unknown as Record<string, unknown>;
    Object.assign(internals, {
      char: { mana: 8, manaCost: 10, attack: 1, magic: 1, armor: 0, hp: 10, statuses: [], defeated: false },
      displayedMana: 2,
      atkEl: { textContent: '', parentElement: null },
      magicEl: { textContent: '' },
      brEl: { innerHTML: '' },
      el: { classList: { toggle: vi.fn() } },
      renderMana: vi.fn(),
      renderStatuses: vi.fn(),
      recordShown: vi.fn(),
    });

    card.refresh();
    expect(card.displayedManaValue()).toBe(2);
    card.changeMana(3);
    card.refresh();
    expect(card.displayedManaValue()).toBe(5);
    card.changeMana(-2);
    expect(card.displayedManaValue()).toBe(3);
    card.refresh(true);
    expect(card.displayedManaValue()).toBe(8);
  });
});
