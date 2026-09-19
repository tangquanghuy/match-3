/**
 * 编队规则（M1）——裁定①的落地：3~4 人、主角可编入也可不编入、部队不重复且已拥有。
 *
 * 校验**汇总全部问题**而不是见错即返：ASSETS-NEEDED.md §6.3 要求校验规则可见，
 * UI 层把 issues 全部列出来（人数、耗蓝、色覆盖、种族计数等可视化由屏层做，
 * 这里只出权威判定）。站位即数组顺序，队首吃骷髅伤害——是战术不是校验项。
 */
import { getTroopById } from '../../data/troops';
import { bannerEquipIssue } from './banners';
import type { MetaSave, TeamMember, TeamPreset } from '../state/schema';

export const MIN_TEAM_SIZE = 3;
export const MAX_TEAM_SIZE = 4;

export type TeamRuleCode =
  | 'TOO_FEW'
  | 'TOO_MANY'
  | 'DUPLICATE_TROOP'
  | 'HERO_DUPLICATE'
  | 'BAD_MEMBER'
  | 'UNKNOWN_TROOP'
  | 'NOT_OWNED'
  | 'BAD_BANNER';

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

export function validateTeam(
  save: MetaSave,
  team: Pick<TeamPreset, 'members'> & Partial<Pick<TeamPreset, 'bannerKingdomId'>>,
): TeamValidation {
  const issues: TeamIssue[] = [];
  const { members } = team;

  if (members.length < MIN_TEAM_SIZE) {
    issues.push({ code: 'TOO_FEW', message: `至少 ${MIN_TEAM_SIZE} 人才能出战（当前 ${members.length} 人）` });
  }
  if (members.length > MAX_TEAM_SIZE) {
    issues.push({ code: 'TOO_MANY', message: `最多 ${MAX_TEAM_SIZE} 人（当前 ${members.length} 人）` });
  }

  const seenTroops = new Set<number>();
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
    if (seenTroops.has(member.troopId)) {
      issues.push({ code: 'DUPLICATE_TROOP', message: `第 ${position + 1} 号位：同名部队不能重复编入` });
      return;
    }
    seenTroops.add(member.troopId);
    if (!getTroopById(member.troopId)) {
      issues.push({ code: 'UNKNOWN_TROOP', message: `第 ${position + 1} 号位：部队 id ${member.troopId} 不存在` });
      return;
    }
    if (!save.collection[String(member.troopId)]) {
      issues.push({ code: 'NOT_OWNED', message: `第 ${position + 1} 号位：尚未拥有该部队` });
    }
  });
  if (heroCount > 1) {
    issues.push({ code: 'HERO_DUPLICATE', message: '主角最多编入一名' });
  }

  // 旗帜（M6）：null 合法（不挂），其余必须是已解锁王国的旗帜（任务链 8/8）
  const bannerIssue = bannerEquipIssue(save, team.bannerKingdomId ?? null);
  if (bannerIssue) {
    issues.push({ code: 'BAD_BANNER', message: bannerIssue });
  }

  return { ok: issues.length === 0, issues };
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
  team: Pick<TeamPreset, 'name' | 'members' | 'bannerKingdomId'>,
): SetTeamResult {
  if (!Number.isInteger(index) || index < 0) {
    return { ok: false, issues: [{ code: 'BAD_MEMBER', message: '预设队序号非法' }] };
  }
  const validation = validateTeam(save, team);
  if (!validation.ok) return { ok: false, issues: validation.issues };
  const preset: TeamPreset = {
    name: team.name,
    members: team.members.map((m) => (m.kind === 'hero' ? { kind: 'hero' } : { kind: 'troop', troopId: m.troopId })),
    bannerKingdomId: team.bannerKingdomId ?? null,
  };
  save.teams[index] = preset;
  return { ok: true, index };
}
