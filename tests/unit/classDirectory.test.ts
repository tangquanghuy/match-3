import { describe, expect, it } from 'vitest';
import { classDirectory, CLASS_PAGE_SIZE, type ClassDirectoryState } from '../../src/meta/screens/classDirectory';
import { classDetailHtml } from '../../src/meta/screens/classesScreen';
import { CLASSES, classById } from '../../src/meta/data/classes';
import { newSave } from '../../src/meta/state/schema';
const state: ClassDirectoryState = { query: '', filter: 'all', tree: '', page: 0 };
function fixture() {
  const s = newSave({ now: 0 });
  s.hero.unlockedClasses = ['mechanist', 'warrior']; s.hero.classId = 'warrior';
  return s;
}
describe('职业目录和独立详情', () => {
  it('8 项分页，当前职业优先且完整覆盖图鉴', () => {
    const s = fixture(), result = classDirectory(s, state);
    expect(result.entries).toHaveLength(CLASS_PAGE_SIZE);
    expect(result.entries[0]!.id).toBe('warrior');
    expect(result.entries[1]!.id).toBe('mechanist');
    const all = Array.from({ length: result.pages }, (_, page) => classDirectory(s, { ...state, page }).entries).flat();
    expect(new Set(all.map(c => c.id)).size).toBe(CLASSES.length);
  });
  it.each(['机械师', 'MECHANIST', ' 阿达纳 ', '发条机构'])('名称、王国、特质检索：%s', query => {
    expect(classDirectory(fixture(), { ...state, query }).entries.map(c => c.id)).toContain('mechanist');
  });
  it('天赋系及解锁状态可组合筛选', () => {
    const tree = classById('mechanist')!.trees[0]!.name;
    expect(classDirectory(fixture(), { ...state, tree, filter: 'unlocked' }).entries.every(c =>
      ['warrior', 'mechanist'].includes(c.id) && c.trees.some(t => t.name === tree))).toBe(true);
    expect(classDirectory(fixture(), { ...state, filter: 'locked' }).total).toBe(CLASSES.length - 2);
  });
  it('页码越界钳制，空结果仍有有效页码', () => {
    expect(classDirectory(fixture(), { ...state, page: -2 }).page).toBe(0);
    const last = classDirectory(fixture(), { ...state, page: 999 });
    expect(last.page).toBe(last.pages - 1);
    expect(classDirectory(fixture(), { ...state, query: 'no-such-class-123', page: 2 })).toMatchObject({ entries: [], page: 0, pages: 1, total: 0 });
  });
  it('locked classes preview the existing tree grid without selecting talents', () => {
    const s = fixture(), before = structuredClone(s);
    const html = classDetailHtml({ save: () => s }, classById('elementalist')!);
    expect(html).toContain('class="talent-tree"');
    expect(html.match(/class="talent-cell /g)).toHaveLength(21);
    expect(html.match(/aria-disabled="true"/g)).toHaveLength(21);
    expect(html).not.toContain('class="hc-tier"');
    expect(html).toContain('role="tablist"');
    classDirectory(s, { ...state, query: 'mechanist' });
    expect(s).toEqual(before);
  });
});
