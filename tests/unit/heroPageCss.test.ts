import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyPageCss } from '../../src/meta/shell/pageCss';

// Reproduce a BOM at the start of a raw fragment, which becomes a literal part
// of the dialog selector when concatenated after the classes stylesheet.
vi.mock('../../src/meta/screens/heroTraitDialog.css?raw', () => ({
  default: '\uFEFF.hero-trait-dialog{background:#101923;border:1px solid #a98d59}',
}));
afterEach(() => vi.unstubAllGlobals());
describe('职业页拼接样式', () => {
  it.each(['classes', 'hero'])('%s 页面消除隐藏 BOM，保留弹窗根选择器', page => {
    const style = { id: '', textContent: '' };
    const head = { appendChild: vi.fn(), insertBefore: vi.fn() };
    vi.stubGlobal('document', { getElementById: () => null, createElement: () => style, head });
    applyPageCss(page);
    expect(style.textContent).not.toContain('\uFEFF');
    expect(style.textContent).toMatch(/(?:^|\n)\.hero-trait-dialog\{/);
    expect(head.appendChild).toHaveBeenCalledWith(style);
  });
});
