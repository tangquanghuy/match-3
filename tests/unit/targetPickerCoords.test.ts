/**
 * 选目标准星坐标换算（lane A 修复）：wrapper 被 CSS 放大时，屏幕差值必须除以缩放。
 */
import { describe, expect, it } from 'vitest';
import { clientToLayout, pickerCancelHint } from '../../src/render/TargetPicker';

describe('clientToLayout', () => {
  it('1440×900 舞台缩放 ≈1.098：屏幕点换算回布局像素，不再二次放大', () => {
    const layoutW = 1214;
    const scale = 1.09756;
    const rect = { left: 53.78, top: 0, width: layoutW * scale };
    // 布局坐标 (1060, 300) 处的卡心在屏幕上的位置
    const screen = { x: rect.left + 1060 * scale, y: 300 * scale };
    const p = clientToLayout(screen.x, screen.y, rect, layoutW);
    expect(p.x).toBeCloseTo(1060, 3);
    expect(p.y).toBeCloseTo(300, 3);
  });

  it('无缩放或尺寸未知时退化为平移', () => {
    expect(clientToLayout(110, 60, { left: 10, top: 10, width: 500 }, 500)).toEqual({ x: 100, y: 50 });
    expect(clientToLayout(110, 60, { left: 10, top: 10, width: 500 }, 0)).toEqual({ x: 100, y: 50 });
  });
});

describe('pickerCancelHint', () => {
  it('触屏提示点空白处取消，精细指针提示 Esc', () => {
    expect(pickerCancelHint(true)).toBe('点空白处取消');
    expect(pickerCancelHint(false)).toBe('Esc 取消');
  });
});
