import type { MetaSave, TeamMember } from '../state/schema';
import { getTroopById } from '../../data/troops';
import { BaseColor } from '../../engine/types';
import { traitUnlockCost } from '../data/economy';
import { stoneColorKeyOf } from '../data/materials';

/** One-time retirement preparation; intentionally not wired into ordinary logins or grants. */
export const RETIRING_TROOP_IDS = [7446, 7622] as const;
const retiring = new Set<number>(RETIRING_TROOP_IDS);
const keepMember = (member: TeamMember): boolean => member.kind !== 'troop' || !retiring.has(member.troopId);

export interface RetirementCompensation {
  troopId: number;
  /** A separate mythic choice per owned retired troop; never merge the mail entitlements. */
  mythicChoice: 1;
  traitstones: Record<string, number>;
  unlockedTraits: number;
}

/** Refund only slots actually unlocked in the original, authoritative player progression. */
export function retirementCompensations(original: MetaSave): RetirementCompensation[] {
  return RETIRING_TROOP_IDS.filter(id => !!(original.collectionTruth ?? original.collection)[String(id)])
    .map(troopId => {
      const troop = getTroopById(troopId);
      if (!troop || troop.traits.length !== 3) throw new Error(`Missing retirement trait recipe: ${troopId}`);
      const color = stoneColorKeyOf(troop.manaColors[0] ?? BaseColor.Brown);
      const traitstones: Record<string, number> = {};
      const progress = (original.collectionTruth ?? original.collection)[String(troopId)];
      if (!progress || !Array.isArray(progress.traits) || progress.traits.length !== 3 ||
          progress.traits.some(flag => typeof flag !== 'boolean')) throw new Error(`Invalid retirement traits: ${troopId}`);
      for (let slot = 1; slot <= 3; slot++) {
        if (!progress.traits[slot - 1]) continue;
        for (const [key, amount] of Object.entries(traitUnlockCost(slot, color, troopId).stones)) {
          traitstones[key] = (traitstones[key] ?? 0) + amount;
        }
      }
      return { troopId, mythicChoice: 1 as const, traitstones, unlockedTraits: progress.traits.filter(Boolean).length };
    });
}


export interface RetirementResult {
  save: MetaSave;
  removedCollection: number[];
  affectedTeams: number[];
  removedDefenseTeam: boolean;
  /** Presets still exist but must be rebuilt to the four-member requirement before battle. */
  incompleteTeams: number[];
}

/**
 * Produces a detached candidate save for review. A caller must back up the latest authoritative
 * revision and commit the entire candidate atomically on the player's serial host; never patch
 * stored record fragments independently. Compensation mail is attached by prepareTroopRetirementWithMail in the same atomic save write.
 */
export function prepareTroopRetirement(original: MetaSave): RetirementResult {
  if (original.pendingBattle) throw new Error('Pending battle: defer retirement until the ticket is settled');
  const save = structuredClone(original);
  const removedCollection = RETIRING_TROOP_IDS.filter(id => !!save.collection[String(id)] || !!save.collectionTruth?.[String(id)]);
  for (const id of RETIRING_TROOP_IDS) {
    delete save.collection[String(id)];
    if (save.collectionTruth) delete save.collectionTruth[String(id)];
  }
  save.favoriteTroopIds = save.favoriteTroopIds.filter(id => !retiring.has(id));
  const affectedTeams: number[] = [];
  save.teams.forEach((team, index) => {
    const remaining = team.members.filter(keepMember);
    if (remaining.length !== team.members.length) {
      team.members = remaining;
      affectedTeams.push(index);
    }
  });
  const removedDefenseTeam = !!save.invasion.defenseTeam?.members.some(member => !keepMember(member));
  if (removedDefenseTeam) {
    save.invasion.defenseTeam = null;
    save.invasion.defensePublishPending = false;
    save.invasion.lastDefensePublish = null;
  }
  save.gachaWishlist.troopIds = save.gachaWishlist.troopIds.filter(id => !retiring.has(id));
  if (retiring.has(save.gachaWishlist.pursuit.targetId ?? -1)) save.gachaWishlist.pursuit.targetId = null;
  // Cached opponents can hold a retired troop even if this player never owned one.
  save.invasion.roster = null;
  return { save, removedCollection, affectedTeams, removedDefenseTeam,
    incompleteTeams: affectedTeams.filter(index => save.teams[index]!.members.length !== 4) };
}

/** Retirement save and compensation mail must be committed in the SAME save transaction. */
export function prepareTroopRetirementWithMail(original: MetaSave, now: number): RetirementResult {
  const result = prepareTroopRetirement(original);
  for (const compensation of retirementCompensations(original)) {
    const id = `retirement-2026-10-09:${compensation.troopId}`;
    if (result.save.mailbox.items.some(mail => mail.id === id)) continue;
    result.save.mailbox.items.push({
      id,
      title: `部队暂时退役补偿：${getTroopById(compensation.troopId)!.name}`,
      body: retirementMailBody(compensation.troopId, compensation.unlockedTraits),
      sentAt: now,
      readAt: null,
      claimedAt: null,
      currencies: { gems: 2000 },
      materials: { traitstones: { ...compensation.traitstones } },
      mythicChoice: compensation.mythicChoice,
    });
  }
  return result;
}
/** One fixed pilot only: repair the existing unclaimed letter, never add a second letter or credit the wallet. */
export function correctGraydoveRetirementMail(original: MetaSave): MetaSave {
  const mailId = 'retirement-2026-10-09:7622';
  const matches = original.mailbox.items.filter(item => item.id === mailId);
  if (matches.length !== 1 || matches[0]!.claimedAt !== null || matches[0]!.mythicChoice !== 1 ||
      original.collection['7622'] || original.collectionTruth?.['7622'] ||
      JSON.stringify(matches[0]!.currencies) !== '{}' ||
      JSON.stringify(matches[0]!.materials?.traitstones) !== JSON.stringify({
        'minor:green': 90, 'major:green': 40, celestial: 18, 'runic:green': 12,
      }) || Object.keys(matches[0]!.materials ?? {}).some(key => key !== 'traitstones')) {
    throw new Error('Pilot mail precondition mismatch');
  }
  // Independently verified against the local, pre-retirement revision 7954 backup:
  // collection[7622].traits = [true, false, false]. Only the FIRST slot is refundable.
  const next = structuredClone(original);
  const mail = next.mailbox.items.find(item => item.id === mailId)!;
  mail.title = `部队暂时退役补偿：${getTroopById(7622)!.name}`;
  mail.body = retirementMailBody(7622, 1);
  mail.currencies = { gems: 2000 };
  mail.materials = { traitstones: { ...traitUnlockCost(1, 'green', 7622).stones } };
  return next;
}

function retirementMailBody(troopId: number, unlockedTraits: number): string {
  return `星星丽斯和菊药因强度过高暂时移除，未来将以可肝活动的形式回归。本封邮件对应你被移除的部队：${getTroopById(troopId)!.name}。补偿为其已解锁的 ${unlockedTraits} 项特质对应的特质石、1 次神话自选，以及 2000 钻石。特质石与钻石领取后不会重复发放；若自选中途取消或中断，资格仍保留至神话部队成功入藏。`;
}

/** Change a single phrase in Graydove's existing letter, including if its materials were already claimed. */
export function updateGraydoveRetirementWording(original: MetaSave): MetaSave {
  const matches = original.mailbox.items.filter(mail => mail.id === 'retirement-2026-10-09:7622');
  const oldPhrase = '星星丽思（游戏内名称：星星丽斯）和菊药';
  if (matches.length !== 1 || matches[0]!.title !== '部队暂时退役补偿：菊药' ||
      !matches[0]!.body.includes(oldPhrase) ||
      matches[0]!.body.split(oldPhrase).length !== 2) throw new Error('Pilot wording precondition mismatch');
  const next = structuredClone(original);
  next.mailbox.items.find(mail => mail.id === matches[0]!.id)!.body = matches[0]!.body.replace(oldPhrase, '星星丽斯和菊药');
  return next;
}
