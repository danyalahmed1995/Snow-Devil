import { describe, expect, it } from 'vitest';
import { selectionFromPoints } from './ScreenshotRuntime';

describe('screenshot selection geometry', () => {
  it('normalizes a drag in any direction', () => {
    expect(selectionFromPoints({ x: 90, y: 75 }, { x: 20, y: 30 })).toEqual({ x: 20, y: 30, width: 70, height: 45 });
    expect(selectionFromPoints({ x: 20, y: 30 }, { x: 90, y: 75 })).toEqual({ x: 20, y: 30, width: 70, height: 45 });
  });
});
