import type { GameEvent } from '../engine/events';
import type { GameState } from '../engine/GameState';
import { PlayerSide, opponentOf } from '../engine/types';
import type { Character } from '../engine/types';
import { NARRATION_CLIPS } from './NarrationCatalog';
import type { NarrationClip } from './NarrationCatalog';

export interface NarrationSink {
  playNarration(clip: NarrationClip, interrupt?: boolean): boolean;
  preloadNarration(clip: NarrationClip): void;
  isNarrationBusy(): boolean;
  stopNarration(): void;
}
export interface NarrationPlan { eventIndex: number; play: () => void; }
interface Rule { chance: number; cooldown: number; priority: number; }
const rule = (chance: number, cooldown: number, priority: number): Rule => ({ chance, cooldown, priority });
/** Wall-clock milliseconds, independent of battle speed. No battle RNG is consumed. */
export const NARRATION_RULES: Readonly<Record<string, Rule>> = {
  match4: rule(.18, 35000, 30), match5: rule(.65, 28000, 60),
  mana_surge: rule(.16, 40000, 25), extra_turn: rule(.16, 40000, 28),
  cascade: rule(.25, 40000, 40), grand_cascade: rule(.75, 30000, 70),
  skull: rule(.08, 45000, 10), armor_break: rule(.35, 35000, 45),
  heavy: rule(.65, 22000, 65), spell_heavy: rule(.70, 22000, 67), aoe_heavy: rule(.85, 25000, 75),
  mana_drain: rule(.25, 40000, 38), healing: rule(.18, 45000, 20),
  barrier: rule(.15, 45000, 20), summon: rule(.30, 40000, 35),
  poison: rule(.15, 45000, 32), burning: rule(.15, 45000, 32),
  silence: rule(.35, 40000, 48), frozen: rule(.35, 40000, 48),
  stun: rule(.25, 40000, 42), entangle: rule(.25, 40000, 42), web: rule(.25, 40000, 42),
  curse: rule(.30, 40000, 44), death_mark: rule(.60, 35000, 65),
  transform: rule(.75, 30000, 80), transform_self: rule(.75, 30000, 80),
  devour: rule(.85, 30000, 85), treasure: rule(1, 0, 95),
  victory: rule(1, 0, 100), defeat: rule(1, 0, 100), retreat: rule(1, 0, 100),
};
export const NARRATION_GLOBAL_COOLDOWN = 14000;
export const NARRATION_CLIP_COOLDOWN = 75000;
const sideKey = (side: PlayerSide) => side === PlayerSide.Left ? 'ally' : 'enemy';
const canonical = (s: string) => s.toLowerCase().replace(/[-_]/g, '');
const STATUS_POOLS: Record<string, string> = {
  poison: 'poison', burning: 'burning', silence: 'silence', frozen: 'frozen', stun: 'stun',
  entangle: 'entangle', web: 'web', curse: 'curse', deathmark: 'death_mark', barrier: 'barrier',
};
// Match exactly the game's Treasure Gnome, not the Goblin race or other gnome variants.
export function isTreasureGnome(ch: Pick<Character, 'skillId' | 'name'>): boolean {
  return /^(?:skill_)?7684$/.test(ch.skillId) || ch.name === '宝藏地精' || ch.name === '藏宝地精';
}
interface Snapshot {
  id: number; side: PlayerSide; hp: number; maxHp: number; armor: number; mana: number;
  statuses: Set<string>; treasure: boolean; departed: boolean;
}
interface Candidate { pool: string; index: number; targetId?: number; }

/** Presentation-only director: one lottery per action, not per target/status/gem. */
export class BattleNarrator {
  private characters = new Map<number, Snapshot>();
  private initialAllies = new Set<number>();
  private seenTreasure = new Set<number>();
  private announcedTreasure = new Set<number>();
  private active = PlayerSide.Left;
  private lastAt = -Infinity;
  private categoryAt = new Map<string, number>();
  private clipAt = new Map<string, number>();
  private lastClip: string | null = null;
  private finished = false;
  private alive = true;
  private generation = 0;

  constructor(
    private sink: NarrationSink,
    private random: () => number = Math.random,
    private now: () => number = () => performance.now(),
    private clips: readonly NarrationClip[] = NARRATION_CLIPS,
  ) {}

  start(state: Pick<GameState, 'teams' | 'activePlayer'>): void {
    this.generation++;
    this.sink.stopNarration();
    this.characters.clear(); this.initialAllies.clear(); this.seenTreasure.clear(); this.announcedTreasure.clear();
    this.categoryAt.clear(); this.clipAt.clear(); this.lastAt = -Infinity; this.lastClip = null;
    this.finished = false; this.alive = true; this.active = state.activePlayer;
    for (const ch of state.teams[PlayerSide.Left].characters) this.initialAllies.add(ch.id);
    this.sync(state);
  }

  private sync(state: Pick<GameState, 'teams'>): void {
    for (const side of [PlayerSide.Left, PlayerSide.Right]) {
      for (const ch of state.teams[side].characters) {
        this.characters.set(ch.id, {
          id: ch.id, side, hp: ch.hp, maxHp: ch.maxHp, armor: ch.armor, mana: ch.mana,
          statuses: new Set(ch.statuses.map((s) => canonical(s.id))),
          treasure: isTreasureGnome(ch), departed: ch.defeated || !!ch.fled,
        });
        if (side === PlayerSide.Right && isTreasureGnome(ch) && !ch.defeated && !ch.fled) this.seenTreasure.add(ch.id);
      }
    }
  }

  /** Called after audio unlock. Initial treasure announcements survive startup without autoplay. */
  announceEncounter(): void {
    if (!this.alive || this.finished) return;
    const pending = [...this.seenTreasure].find((id) => !this.announcedTreasure.has(id)
      && !this.characters.get(id)?.departed && (this.characters.get(id)?.hp ?? 0) > 0);
    if (pending === undefined) return;
    const clip = this.clips.find((c) => c.pool === 'treasure.appear');
    if (clip && this.sink.playNarration(clip, true)) {
      for (const id of this.seenTreasure) this.announcedTreasure.add(id);
      this.remember(clip);
    }
  }

  /** Plan before animation; play the chosen cue only when its corresponding event is presented. */
  prepare(events: readonly GameEvent[], finalState?: Pick<GameState, 'teams'>): NarrationPlan | null {
    if (!this.alive || this.finished) return null;
    const candidates: Candidate[] = [];
    const add = (pool: string, index: number, targetId?: number) => candidates.push({ pool, index, targetId });
    let caster: number | undefined;
    let chainMax = 0;
    // Aggregate repeated hits on the same victim within a cast, but never double-count targets.
    let castSerial = 0;
    const spellTotals = new Map<string, { side: PlayerSide; last: number; targets: Map<number, { damage: number; maxHp: number }> }>();
    events.forEach((ev, index) => {
      switch (ev.type) {
        case 'skill-cast':
          caster = ev.characterId; castSerial++;
          // Spending one's own spell mana is not hostile mana drain.
          if (this.characters.has(caster)) this.characters.get(caster)!.mana = 0;
          break;
        case 'turn-end': this.active = ev.nextPlayer; break;
        case 'elimination': {
          const count = ev.cells.length;
          if (count >= 5) add(`match5.${sideKey(this.active)}`, index);
          else if (count === 4) add(`match4.${sideKey(this.active)}`, index);
          if (ev.chainCount > chainMax) {
            chainMax = ev.chainCount;
            if (chainMax >= 5) add(`grand_cascade.${sideKey(this.active)}`, index);
            else if (chainMax >= 3) add(`cascade.${sideKey(this.active)}`, index);
          }
          break;
        }
        case 'mana-gain': {
          const ch = this.characters.get(ev.characterId);
          if (ch) ch.mana += ev.amount;
          if (ev.surge && ev.amount > 0) add(`mana_surge.${sideKey(ev.player)}`, index);
          break;
        }
        case 'extra-turn':
          // Natural 4/5 matches already have their own cue. Skill/hourglass-only action gets this pool.
          if (ev.source === 'skill' || !events.some((e) => e.type === 'elimination' && e.cells.length >= 4))
            add(`extra_turn.${sideKey(ev.player)}`, index);
          break;
        case 'skill-damage':
        case 'skull-damage': {
          const target = this.characters.get(ev.targetId);
          if (!target) break;
          const sourceId = ev.type === 'skill-damage' ? ev.casterId : ev.attackerId;
          const side = this.characters.get(sourceId)?.side ?? opponentOf(target.side);
          // Cap at actual available durability: overkill numbers must not create fake heavy hits.
          const actual = Math.max(0, Math.min(ev.damage, target.hp + target.armor,
            target.hp + target.armor - ev.resultingHp - ev.resultingArmor));
          const heavy = actual >= Math.max(10, target.maxHp * .35);
          if (side !== target.side && target.armor > 0 && ev.resultingArmor === 0 && ev.resultingHp > 0 && actual > 0)
            add(`armor_break.${sideKey(opponentOf(target.side))}`, index);
          target.hp = ev.resultingHp; target.armor = ev.resultingArmor;
          if (side === target.side) break; // Self harm is not praise for striking the enemy.
          if (ev.type === 'skill-damage' && ev.devoured) {
            add(`devour.${sideKey(side)}`, index); break;
          }
          if (ev.type === 'skill-damage' && !ev.skullBurst) {
            const key = `${castSerial}:${ev.casterId}:${side}`;
            let total = spellTotals.get(key);
            if (!total) {
              total = { side, last: index, targets: new Map() };
              spellTotals.set(key, total);
            }
            total.last = index;
            const hit = total.targets.get(target.id) ?? { damage: 0, maxHp: target.maxHp };
            hit.damage += actual; total.targets.set(target.id, hit);
            if (heavy) add(`spell_heavy.${sideKey(side)}`, index);
          } else if (heavy) add(`heavy.${sideKey(side)}`, index, target.id);
          else if (ev.type === 'skull-damage' && actual >= 5) add(`skull.${sideKey(side)}`, index);
          break;
        }
        case 'buff': {
          const target = this.characters.get(ev.targetId);
          if (!target) break;
          const beforeHp = target.hp, beforeMana = target.mana;
          if (ev.stat === 'hp') {
            target.maxHp += ev.maxHpGain ?? 0;
            target.hp = Math.max(0, Math.min(target.maxHp, target.hp + ev.amount));
          }
          if (ev.stat === 'mana') target.mana = Math.max(0, target.mana + ev.amount);
          if (ev.stat === 'armor') target.armor = Math.max(0, target.armor + ev.amount);
          if (ev.source === 'trait') break;
          if (ev.stat === 'hp' && target.hp - beforeHp >= Math.max(5, target.maxHp * .2))
            add(`healing.${sideKey(target.side)}`, index);
          if (ev.stat === 'mana' && Math.min(beforeMana, -ev.amount) >= 5)
            add(`mana_drain.${sideKey(opponentOf(target.side))}`, index);
          break;
        }
        case 'status-apply': {
          const target = this.characters.get(ev.targetId);
          if (!target) break;
          const status = canonical(ev.statusId), fresh = !target.statuses.has(status);
          target.statuses.add(status);
          const pool = STATUS_POOLS[status];
          if (fresh && pool && ev.turns > 0)
            add(`${pool}.${sideKey(pool === 'barrier' ? target.side : opponentOf(target.side))}`, index);
          break;
        }
        case 'status-tick': {
          const target = this.characters.get(ev.targetId);
          if (target && ev.damage) target.hp = Math.max(0, target.hp - ev.damage);
          if (target && ev.armorDamage) target.armor = Math.max(0, target.armor - ev.armorDamage);
          break; // Never narrate periodic damage or refreshes.
        }
        case 'status-expire': this.characters.get(ev.targetId)?.statuses.delete(canonical(ev.statusId)); break;
        case 'status-cleanse':
          ev.statusIds.forEach((id) => this.characters.get(ev.targetId)?.statuses.delete(canonical(id))); break;
        case 'summon': {
          if (ev.destination !== 'field') break;
          const live = finalState?.teams[ev.player].characters.find((c) => c.id === ev.characterId);
          this.characters.set(ev.characterId, { id: ev.characterId, side: ev.player, hp: live?.hp ?? 1,
            maxHp: live?.maxHp ?? 1, armor: live?.armor ?? 0, mana: live?.mana ?? 0,
            statuses: new Set(), treasure: ev.troopId === 6497, departed: false });
          if (ev.player === PlayerSide.Right && ev.troopId === 6497) {
            if (!this.seenTreasure.has(ev.characterId)) {
              this.seenTreasure.add(ev.characterId); add('treasure.appear', index);
            }
          } else if (!ev.fromQueue) add(`summon.${sideKey(ev.player)}`, index);
          break;
        }
        case 'troop-transform': {
          const target = this.characters.get(ev.targetId);
          if (!target) break;
          // Source side is explicit for real transformations; actor is a compatibility fallback.
          const sourceSide = ev.sourceSide ?? (caster === undefined ? this.active : this.characters.get(caster)?.side);
          if (target.side === sourceSide) {
            if (target.side === PlayerSide.Left) add('transform_self.ally', index);
          } else add(`transform.${sideKey(opponentOf(target.side))}`, index);
          target.treasure = ev.troopId === 6497 || isTreasureGnome({skillId: '', name: ev.name});
          if (target.treasure && target.side === PlayerSide.Right && !this.seenTreasure.has(target.id)) {
            this.seenTreasure.add(target.id); add('treasure.appear', index);
          }
          break;
        }
        case 'defeat':
        case 'flee': {
          const target = this.characters.get(ev.characterId);
          if (!target) break;
          target.departed = true;
          if (ev.type === 'defeat') target.hp = 0;
          if (target.side === PlayerSide.Right && target.treasure)
            add(ev.type === 'flee' ? 'treasure.fled' : 'treasure.defeated', index);
          break;
        }
        case 'game-over': {
          if (finalState) this.sync(finalState);
          const allies = [...this.initialAllies].map((id) => this.characters.get(id)!).filter(Boolean);
          const lost = allies.filter((ch) => ch.hp <= 0 || ch.departed).length;
          const hpRatio = allies.reduce((sum, ch) => sum + (ch.departed ? 0 : ch.hp), 0)
            / Math.max(1, allies.reduce((sum, ch) => sum + ch.maxHp, 0));
          if (ev.winner === PlayerSide.Left) {
            const pool = lost > 0 ? 'costly' : hpRatio >= .85 ? 'overwhelming' : 'normal';
            add(`victory.${pool}`, index);
          } else {
            // "No witnesses" only when all initial allies are truly dead, not merely fled.
            const total = allies.length > 0 && allies.every((ch) => ch.hp <= 0);
            const enemies = [...this.characters.values()].filter((ch) => ch.side === PlayerSide.Right && !ch.departed);
            const enemyRatio = enemies.reduce((sum, ch) => sum + ch.hp, 0)
              / Math.max(1, enemies.reduce((sum, ch) => sum + ch.maxHp, 0));
            add(`defeat.${total ? 'total' : enemyRatio >= .8 ? 'crushing' : 'normal'}`, index);
          }
          this.finished = true;
          break;
        }
        default: break;
      }
    });
    for (const total of spellTotals.values()) {
      const hits = [...total.targets.values()];
      const heavyTargets = hits.filter((h) => h.damage >= Math.max(8, h.maxHp * .25));
      if (heavyTargets.length >= 2) add(`aoe_heavy.${sideKey(total.side)}`, total.last);
      else if (hits.some((h) => h.damage >= Math.max(10, h.maxHp * .35)))
        add(`spell_heavy.${sideKey(total.side)}`, total.last);
    }
    if (finalState) this.sync(finalState);
    // Stable ordering, highest chain stage rather than first weak cascade; one lottery only.
    candidates.sort((a, b) => this.ruleFor(b.pool).priority - this.ruleFor(a.pool).priority || a.index - b.index);
    const chosen = candidates.find((c) => this.clips.some((clip) => clip.pool === c.pool));
    return chosen ? this.plan(chosen) : null;
  }

  private ruleFor(pool: string): Rule { return NARRATION_RULES[pool.split('.')[0]]; }
  private family(pool: string): string {
    const category = pool.split('.')[0];
    return ['heavy', 'spell_heavy', 'aoe_heavy'].includes(category) ? 'heavy' : category;
  }
  private remember(clip: NarrationClip): void {
    const at = this.now();
    this.lastAt = at; this.categoryAt.set(this.family(clip.pool), at); this.clipAt.set(clip.id, at); this.lastClip = clip.id;
  }
  private plan(candidate: Candidate): NarrationPlan | null {
    const rule = this.ruleFor(candidate.pool), at = this.now();
    const important = rule.priority >= 95;
    if (!important && (at - this.lastAt < NARRATION_GLOBAL_COOLDOWN || this.sink.isNarrationBusy()
      || at - (this.categoryAt.get(this.family(candidate.pool)) ?? -Infinity) < rule.cooldown)) return null;
    if (!important && this.random() >= rule.chance) return null;
    const pool = this.clips.filter((c) => c.pool === candidate.pool
      // Splendid / strike again is not appropriate after this target has died.
      && (!c.id.includes('202609260007') || (candidate.targetId !== undefined
        && (this.characters.get(candidate.targetId)?.hp ?? 0) > 0
        && !this.characters.get(candidate.targetId)?.departed)));
    const fresh = important ? pool : pool.filter((c) => at - (this.clipAt.get(c.id) ?? -Infinity) >= NARRATION_CLIP_COOLDOWN);
    const noRepeat = fresh.filter((c) => c.id !== this.lastClip);
    const choices = noRepeat.length ? noRepeat : fresh;
    if (!choices.length) return null;
    const clip = choices[Math.min(choices.length - 1, Math.floor(this.random() * choices.length))];
    this.sink.preloadNarration(clip);
    let played = false;
    const ticket = this.generation;
    return { eventIndex: candidate.index, play: () => {
      if (played || !this.alive || ticket !== this.generation || (!important && this.finished)) return;
      played = true;
      if (!important && (this.sink.isNarrationBusy() || this.now() - this.lastAt < NARRATION_GLOBAL_COOLDOWN)) return;
      if (this.sink.playNarration(clip, important)) {
        this.remember(clip);
        if (candidate.pool === 'treasure.appear') for (const id of this.seenTreasure) this.announcedTreasure.add(id);
      }
    } };
  }

  /** Host-facing hook, only for a confirmed whole-party retreat, never a unit's flee event. */
  retreat(): void {
    if (!this.alive || this.finished) return;
    const lost = [...this.initialAllies].some((id) => {
      const ch = this.characters.get(id); return !ch || ch.hp <= 0 || ch.departed;
    });
    this.finished = true;
    this.generation++;
    this.plan({ pool: `retreat.${lost ? 'costly' : 'normal'}`, index: 0 })?.play();
  }

  dispose(preserveVoice = false): void { this.alive = false; if (!preserveVoice) this.sink.stopNarration(); }
}
