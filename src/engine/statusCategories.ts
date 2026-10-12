/** Status categories shared by trait immunity and status application. */
export const POSITIVE_STATUS_IDS: ReadonlySet<string> = new Set([
  'barrier', 'blessed', 'enchanted', 'enraged', 'rage', 'reflect', 'submerged',
]);

export const NEGATIVE_STATUS_IDS: ReadonlySet<string> = new Set([
  'poison', 'burning', 'bleed', 'silence', 'frozen', 'stun', 'entangle', 'web', 'disease',
  'curse', 'cursed', 'death-mark', 'death_mark', 'marked', 'charm', 'charmed',
  'mana-burn', 'mana_burn', 'faerie-fire', 'terror', 'wolf', 'wolf-form', 'lycanthropy',
]);
