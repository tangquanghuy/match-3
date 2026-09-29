/** Reflect is special damage: bypass trait reduction, not the recipient's Barrier.
 * Official 4.5 supplies the floor/minimum; the official status page supplies
 * Barrier's one-instance damage protection. No recursive Reflect processing.
 */
import type { Character } from '../../types';
import type { GameEvent } from '../../events';
import { consumeBarrier, consumeReflect, reflectDamageAmount } from './status';

export function reflectHit(reflector: Character, source: Character, incoming: number, kind: 'skill' | 'skull'): GameEvent[] {
  if (incoming <= 0) return [];
  const events: GameEvent[] = [];
  if (!source.defeated) {
    const barrier = consumeBarrier(source);
    if (barrier.consumed) {
      // 演出元数据：反弹的一发被来源的屏障挡下（表现层从反射方打回一发并在来源身上播格挡）
      for (const e of barrier.events) if (e.type === 'status-expire') e.absorbedFrom = { casterId: reflector.id, range: 'single' };
      events.push(...barrier.events);
    } else {
      const amount = reflectDamageAmount(incoming);
      const absorbed = Math.min(source.armor, amount);
      source.armor -= absorbed;
      source.hp = Math.max(0, source.hp - (amount - absorbed));
      if (kind === 'skill') events.push({ type: 'skill-damage', casterId: reflector.id,
        targetId: source.id, range: 'single', damage: amount, resultingHp: source.hp, resultingArmor: source.armor, reflected: true });
      else events.push({ type: 'skull-damage', attackerId: reflector.id, targetId: source.id,
        damage: amount, resultingHp: source.hp, resultingArmor: source.armor, reflected: true });
    }
  }
  events.push(...consumeReflect(reflector));
  if (source.hp <= 0 && !source.defeated) {
    source.defeated = true; events.push({ type: 'defeat', characterId: source.id });
  }
  return events;
}
