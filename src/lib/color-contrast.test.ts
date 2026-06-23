import { describe, expect, it } from 'vitest';
import { chooseReadableForeground, contrastRatio, githubLabelStyle, parseHexColor } from './color-contrast';

const ratio = (foreground: string, background: string) => contrastRatio(parseHexColor(foreground)!, parseHexColor(background)!);

describe('color contrast utilities', () => {
  it('chooses dark text for pale GitHub labels', () => {
    const style = githubLabelStyle('ffffff');
    expect(style.backgroundColor).toBe('#ffffff');
    expect(style.color).toBe('#000000');
    expect(ratio(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  });

  it('chooses light text for dark GitHub labels', () => {
    const style = githubLabelStyle('5319e7');
    expect(style.backgroundColor).toBe('#5319e7');
    expect(style.color).toBe('#ffffff');
    expect(ratio(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  });

  it('falls back safely for malformed label colors', () => {
    const style = githubLabelStyle('url(javascript:alert(1))');
    expect(style.backgroundColor).toBe('#555555');
    expect(ratio(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  });

  it('supports compact hex colors without accepting arbitrary CSS', () => {
    expect(githubLabelStyle('#fff').color).toBe('#000000');
    expect(parseHexColor('rgb(255,255,255)')).toBeNull();
  });

  it('returns the strongest readable foreground for middle colors', () => {
    const background = parseHexColor('#f9d0c4')!;
    const foreground = chooseReadableForeground(background);
    expect(foreground).toBe('#000000');
    expect(ratio(foreground, '#f9d0c4')).toBeGreaterThanOrEqual(4.5);
  });
});
