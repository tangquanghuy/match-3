/**
 * 编队规则（M1）——4 人、主角可选、普通部队按持有副本数重复编入。
 *
 * 校验**汇总全部问题**而不是见错即返：ASSETS-NEEDED.md §6.3 要求校验规则可见，
 * UI 层把 issues 全部列出来（人数、耗蓝、色覆盖、种族计数等可视化由屏层做，
 * 这里只出权威判定）。站位即数组顺序，队首吃骷髅伤害——是战术不是校验项。
 */
import { getTroopById } from '../../data/troops';
import { isImmortal, IMMORTAL_TEAM_LIMIT } from '../../data/immortals';
import { bannerEquipIssue } from './banners';
import { classById } from '../data/classes';
import { anyWeaponById } from '../data/weaponCatalog';
import { canUseWeapon } from './hero';
import type { MetaSave, TeamMember, TeamPreset } from '../state/schema';

export const MIN_TEAM_SIZE = 4;
export const MAX_TEAM_SIZE = 4;

export type TeamRuleCode =
  | 'TOO_FEW'
  | 'TOO_MANY'
  | 'DUPLICATE_TROOP'
  | 'HERO_DUPLICATE'
  | 'IMMORTAL_LIMIT'
  | 'BAD_MEMBER'
  | 'UNKNOWN_TROOP'
  | 'NOT_OWNED'
  | 'BAD_BANNER'
  | 'BAD_HERO_LOADOUT';

export interface TeamIssue {
  code: TeamRuleCode;
  message: string;
}

export interface TeamValidation {
  ok: boolean;
  issues: TeamIssue[];
}

const SIZE_NAMES: Record<string, string> = {
  hero: '主角',
  troop: '部队',
};

/** Also checked at battle start, so legacy presets cannot bypass the limit. */
export function immortalTeamIssue(members: readonly TeamMember[]): TeamIssue | null {
  const count = members.filter(m => m.kind === 'troop' && isImmortal(getTroopById(m.troopId))).length;
  return count > IMMORTAL_TEAM_LIMIT
    ? { code: 'IMMORTAL_LIMIT', message: '每支队伍最多编入一名不朽部队，请调整阵容' }
    : null;
}

export function validateTeam(
  save: MetaSave,
  team: Pick<TeamPreset, 'members'> & Partial<Pick<TeamPreset, 'bannerKingdomId' | 'heroClassId' | 'heroWeaponId'>>,
): TeamValidation {
  const issues: TeamIssue[] = [];
  const { members } = team;
  const immortalIssue = immortalTeamIssue(members);
  if (immortalIssue) issues.push(immortalIssue);

  if (members.length < MIN_TEAM_SIZE) {
    issues.push({ code: 'TOO_FEW', message: `至少 ${MIN_TEAM_SIZE} 人才能出战（当前 ${members.length} 人）` });
  }
  if (members.length > MAX_TEAM_SIZE) {
    issues.push({ code: 'TOO_MANY', message: `最多 ${MAX_TEAM_SIZE} 人（当前 ${members.length} 人）` });
  }

  const troopCounts = new Map<number, number>();
  let heroCount = 0;
  members.forEach((member, position) => {
    if (member.kind === 'hero') {
      heroCount += 1;
      return;
    }
    if (member.kind !== 'troop' || typeof member.troopId !== 'number') {
      issues.push({ code: 'BAD_MEMBER', message: `第 ${position + 1} 号位成员无效` });
      return;
    }
    const troop = getTroopById(member.troopId);
    if (!troop) {
      issues.push({ code: 'UNKNOWN_TROOP', message: `第 ${position + 1} 号位：部队 id ${member.troopId} 不存在` });
      return;
    }
    const record = save.collection[String(member.troopId)];
    if (!record) {
      issues.push({ code: 'NOT_OWNED', message: `第 ${position + 1} 号位：尚未拥有该部队` });
      return;
    }
    const count = (troopCounts.get(member.troopId) ?? 0) + 1;
    troopCounts.set(member.troopId, count);
    if (count > record.copies + 1) {
      issues.push({ code: 'DUPLICATE_TROOP', message: `第 ${position + 1} 号位：${troop.name}可用副本不足（持有 ${record.copies + 1} 张）` });
    }
  });
  if (heroCount > 1) {
    issues.push({ code: 'HERO_DUPLICATE', message: '主角最多编入一名' });
  }

  // 旗帜（M6）：null 合法（不挂），其余必须是已开放王国的旗帜（与任务进度无关）
  const bannerIssue = bannerEquipIssue(save, team.bannerKingdomId ?? null);
  if (bannerIssue) {
    issues.push({ code: 'BAD_BANNER', message: bannerIssue });
  }

  if (team.members.some(m => m.kind === 'hero')) {
    const problem = teamLoadoutIssue(save, team);
    if (problem) issues.push(problem);
  }
  return { ok: issues.length === 0, issues };
}

/** Old presets without loadout fields inherit the current hero; new presets freeze both fields. */
export function resolvedTeamLoadout(save: MetaSave, team: TeamPreset) {
  return {
    heroClassId: team.heroClassId === undefined ? save.hero.classId : team.heroClassId,
    heroWeaponId: team.heroWeaponId === undefined ? save.hero.equippedWeapon : team.heroWeaponId,
  };
}

export function teamLoadoutIssue(save: MetaSave, team: Partial<Pick<TeamPreset, 'heroClassId' | 'heroWeaponId'>>): TeamIssue | null {
  const { heroClassId, heroWeaponId } = team;
  if (heroClassId !== undefined && heroClassId !== null
    && (typeof heroClassId !== 'string' || !classById(heroClassId) || !save.hero.unlockedClasses.includes(heroClassId))) {
    return { code: 'BAD_HERO_LOADOUT', message: '队伍预设的主角职业尚未解锁' };
  }
  if (heroWeaponId !== undefined && heroWeaponId !== null) {
    const weapon = anyWeaponById(heroWeaponId);
    if (typeof heroWeaponId !== 'string' || !weapon || !canUseWeapon(save, weapon)) {
      return { code: 'BAD_HERO_LOADOUT', message: '队伍预设的主角武器尚未拥有或不可装备' };
    }
  }
  return null;
}

export function memberLabel(member: TeamMember): string {
  return SIZE_NAMES[member.kind] ?? '未知';
}

export function activeTeam(save: MetaSave): TeamPreset | null {
  return save.teams[save.activeTeamIndex] ?? save.teams[0] ?? null;
}

export type SetTeamResult = { ok: true; index: number } | { ok: false; issues: TeamIssue[] };

/**
 * 保存预设队（index 越过队尾 = 新增）。校验不过则整个存档不动，
 * issues 原样带回供界面可视化（「至少 3 人才能保存」拦截）。
 */
export function setTeamPreset(
  save: MetaSave,
  index: number,
  team: Pick<TeamPreset, 'name' | 'members' | 'bannerKingdomId'> & Partial<Pick<TeamPreset, 'heroClassId' | 'heroWeaponId'>>,
): SetTeamResult {
  if (!Number.isInteger(index) || index < 0) {
    return { ok: false, issues: [{ code: 'BAD_MEMBER', message: '预设队序号非法' }] };
  }
  const previous = save.teams[index];
  const fallback = previous ? resolvedTeamLoadout(save, previous)
    : { heroClassId: save.hero.classId, heroWeaponId: save.hero.equippedWeapon };
  const loadout = {
    heroClassId: team.heroClassId === undefined ? fallback.heroClassId : team.heroClassId,
    heroWeaponId: team.heroWeaponId === undefined ? fallback.heroWeaponId : team.heroWeaponId,
  };
  const validation = validateTeam(save, { ...team, ...loadout });
  if (!validation.ok) return { ok: false, issues: validation.issues };
  const preset: TeamPreset = {
    name: team.name,
    members: team.members.map((m) => (m.kind === 'hero' ? { kind: 'hero' } : { kind: 'troop', troopId: m.troopId })),
    bannerKingdomId: team.bannerKingdomId ?? null,
    ...loadout,
  };
  save.teams[index] = preset;
  return { ok: true, index };
}
