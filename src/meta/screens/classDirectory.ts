import { CLASSES, type ClassDef } from '../data/classes';
import type { MetaSave } from '../state/schema';

export type ClassFilter = 'all' | 'unlocked' | 'locked';
export interface ClassDirectoryState { query: string; filter: ClassFilter; tree: string; page: number }
export const CLASS_PAGE_SIZE = 8;
export function classDirectory(save: MetaSave, state: ClassDirectoryState) {
  const query = state.query.trim().toLocaleLowerCase();
  const rank = (c: ClassDef) => c.id === save.hero.classId ? 0 : save.hero.unlockedClasses.includes(c.id) ? 1 : 2;
  const matches = CLASSES.filter(c => {
    const unlocked = save.hero.unlockedClasses.includes(c.id);
    if (state.filter === 'unlocked' && !unlocked || state.filter === 'locked' && unlocked) return false;
    if (state.tree && !c.trees.some(t => t.name === state.tree)) return false;
    const haystack = [c.name, c.nameEn, c.kingdom, ...c.trees.flatMap(t => [t.name, t.nameZh,
      ...t.talents.flatMap(a => [a.nameZh, a.name, a.descriptionZh])]), ...c.perks.flatMap(p => [p.nameZh, p.descriptionZh])].join(' ').toLocaleLowerCase();
    return !query || haystack.includes(query);
  }).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'zh-CN'));
  const pages = Math.max(1, Math.ceil(matches.length / CLASS_PAGE_SIZE));
  const page = Math.max(0, Math.min(pages - 1, Math.floor(state.page) || 0));
  return { page, pages, total: matches.length, entries: matches.slice(page * CLASS_PAGE_SIZE, (page + 1) * CLASS_PAGE_SIZE) };
}
