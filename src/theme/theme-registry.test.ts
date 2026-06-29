import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, DEFAULT_THEME_ID, THEMES, THEME_TOKEN_KEYS, themeById } from './theme-registry';
import { useThemeStore } from '../stores/theme-store';
import { contrastRatio, parseHexColor } from '../lib/color-contrast';

const readablePairs = [
  ['statusSuccessFg', 'statusSuccessBg'], ['statusWarningFg', 'statusWarningBg'],
  ['statusDangerFg', 'statusDangerBg'], ['statusInfoFg', 'statusInfoBg'],
  ['statusNeutralFg', 'statusNeutralBg'], ['statusReviewFg', 'statusReviewBg'],
  ['statusDraftFg', 'statusDraftBg'], ['statusApprovedFg', 'statusApprovedBg'],
  ['statusChangesRequestedFg', 'statusChangesRequestedBg'], ['badgeFg', 'badgeBg'],
  ['labelFg', 'labelBg'], ['counterFg', 'counterBg'], ['selectionFg', 'selectionBg'],
] as const;

describe('canonical Snow Devil theme', () => {
  beforeEach(() => { localStorage.clear(); useThemeStore.setState({ themeId: DEFAULT_THEME_ID }); });

  it('exposes exactly one complete canonical theme', () => {
    expect(THEMES).toHaveLength(1);
    expect(THEMES[0].id).toBe('snow-devil');
    for (const key of THEME_TOKEN_KEYS) expect(THEMES[0].tokens[key], key).toBeTruthy();
  });

  it('applies every semantic token and ignores legacy theme ids', () => {
    expect(applyTheme('frosted-light')).toBe(DEFAULT_THEME_ID);
    expect(document.documentElement.dataset.theme).toBe(DEFAULT_THEME_ID);
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(THEMES[0].tokens.accent);
    expect(themeById('deep-navy')).toBe(THEMES[0]);
  });

  it('keeps compact status and badge token pairs readable', () => {
    for (const [foregroundKey, backgroundKey] of readablePairs) {
      const foreground = parseHexColor(THEMES[0].tokens[foregroundKey]);
      const background = parseHexColor(THEMES[0].tokens[backgroundKey]);
      expect(foreground, foregroundKey).toBeTruthy();
      expect(background, backgroundKey).toBeTruthy();
      expect(contrastRatio(foreground!, background!), `${foregroundKey}/${backgroundKey}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('migrates a removed stored theme to the canonical id', async () => {
    localStorage.setItem('snow-devil-theme', JSON.stringify({ state: { themeId: 'amber-executive' }, version: 1 }));
    await useThemeStore.persist.rehydrate();
    expect(useThemeStore.getState().themeId).toBe(DEFAULT_THEME_ID);
  });
});
