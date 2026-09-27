import { describe, expect, it, vi } from 'vitest';
import { TeamView, setTeamSize, CARD_W } from '@render/TeamView';
import { PlayerSide } from '@engine/types';
// @ts-expect-error Node fixture (project tsconfig does not include Node declarations)
import { readFileSync } from 'node:fs';
import { battleCardDimensions, battleCardOverlayMetrics } from '@render/battleCardLayout';

describe('battle portrait card layout', () => {
  it.each([364, 512, 748, 812])('keeps 3/4-person portraits upright at column height %i', board => {
    for (const slots of [3,4] as const) {
      const card = battleCardDimensions(slots, board);
      expect(card.width / card.height).toBeGreaterThan(.84);
      expect(card.width / card.height).toBeLessThan(.88);
      expect(card.height * slots + (slots - 1) * 10).toBeLessThanOrEqual(board);
      expect(card.width).toBeLessThanOrEqual(Math.round((slots === 4 ? 132 : 142) * board / 512));
      const m = battleCardOverlayMetrics(card.width, card.height);
      expect(m['trait-size'] * 3 + m['trait-gap'] * 2).toBeLessThan(card.height * .42);
      expect(m['stat-font']).toBeGreaterThanOrEqual(11);
    }
  });
  it('recomputes overlays as four-person cards expand to three-person cards', () => {
    const four = battleCardDimensions(4, 512), three = battleCardDimensions(3, 512);
    const a = battleCardOverlayMetrics(four.width, four.height), b = battleCardOverlayMetrics(three.width, three.height);
    expect(a['trait-size']).toBeLessThan(b['trait-size']);
    expect(a['stat-font']).toBeLessThan(b['stat-font']);
    expect(b['trait-size']).toBe(14);
  });
  it('keeps the board-facing edge anchored through four/three-person reflow', () => {
    setTeamSize(4, 512);
    try {
      for (const side of [PlayerSide.Left, PlayerSide.Right]) {
        const view: any = Object.create(TeamView.prototype);
        view.side = side; view.el = { style: {} }; view.mounted = false;
        view.cards = new Map([1,2,3,4].map(id => [id, { resize: vi.fn() }]));
        const parent = { appendChild: vi.fn() };
        view.mount(parent, 100, 20);
        const edge = () => Number.parseFloat(view.el.style.left)
          + (side === PlayerSide.Left ? Number.parseFloat(view.el.style.width) : 0);
        expect(edge()).toBe(side === PlayerSide.Left ? 100 + CARD_W : 100);
        view.cards.delete(4); view.applyLayout();
        expect(edge()).toBe(side === PlayerSide.Left ? 100 + CARD_W : 100);
        expect(parent.appendChild).toHaveBeenCalledOnce();
      }
    } finally { setTeamSize(3, 512); }
  });
  it('matches the actual troop-detail numeral and icon colors', () => {
    const battle = readFileSync('src/render/TeamView.ts', 'utf8');
    const detail = readFileSync('src/meta/shell/styles/troop.css', 'utf8');
    for (const kind of ['atk','armor','hp']) {
      const value = detail.match(new RegExp(`\\.card-stats \\.stat-${kind} b\\{color:(#[a-f0-9]+)`))![1];
      const icon = detail.match(new RegExp(`\\.card-stats \\.stat-${kind}\\{color:(#[a-f0-9]+)`))![1];
      expect(battle).toContain(`.stat-${kind} .v{color:${value}}`);
      expect(battle).toContain(`.stat-${kind}{color:${icon}}`);
    }
  });
});
