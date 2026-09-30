import { describe, expect, it, vi } from 'vitest';
import { TeamView } from '@render/TeamView';

describe('simultaneous team departure layout', () => {
  it('snapshots all original positions before deleting cards and reflows only once', () => {
    const animations: { onfinish?: () => void }[] = [];
    type FakeCard = { el: { offsetTop:number;offsetLeft:number;offsetWidth:number;offsetHeight:number;
      style:Record<string,string>;animate:ReturnType<typeof vi.fn>;remove:ReturnType<typeof vi.fn> };destroy:ReturnType<typeof vi.fn> };
    const cards = new Map<number, FakeCard>();
    for (const id of [4, 5, 6, 7]) {
      const el = { offsetTop: (id - 4) * 174, offsetLeft: 0, offsetWidth: 142, offsetHeight: 164,
        style: {} as Record<string, string>, animate: vi.fn(() => { const a = {}; animations.push(a); return a; }), remove: vi.fn() };
      cards.set(id, { el, destroy: vi.fn() });
    }
    const original = new Map(cards);
    const view = Object.create(TeamView.prototype) as Pick<TeamView, 'removeCharacterCards'> & {cards:typeof cards;applyLayout:ReturnType<typeof vi.fn>};
    view.cards = cards;
    view.applyLayout = vi.fn(() => {
      expect([...cards.keys()]).toEqual([7]);
      for (const id of [4, 5, 6]) expect(original.get(id)!.el.style.position).toBe('absolute');
    });
    expect(view.removeCharacterCards([4, 5, 6, 4, 999])).toBe(3);
    expect(view.applyLayout).toHaveBeenCalledTimes(1);
    expect([4, 5, 6].map(id => original.get(id)!.el.style.top)).toEqual(['0px', '174px', '348px']);
    for (const id of [4, 5, 6]) expect(original.get(id)!.destroy).toHaveBeenCalledTimes(1);
    expect(original.get(7)!.destroy).not.toHaveBeenCalled();
    animations.forEach(a => a.onfinish?.());
    for (const id of [4, 5, 6]) expect(original.get(id)!.el.remove).toHaveBeenCalledTimes(1);
    expect(view.removeCharacterCards([4, 5, 6])).toBe(0);
    expect(view.applyLayout).toHaveBeenCalledTimes(1);
  });
});
