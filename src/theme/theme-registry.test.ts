import { beforeEach, describe, expect, it } from 'vitest';
import { applyTheme, DEFAULT_THEME_ID, THEMES, THEME_TOKEN_KEYS, themeById } from './theme-registry';
import { useThemeStore } from '../stores/theme-store';
import { useTabsStore } from '../stores/tabs-store';
import { contrastRatio, parseHexColor } from '../lib/color-contrast';

const readablePairs = [
  ['statusSuccessFg', 'statusSuccessBg'],
  ['statusWarningFg', 'statusWarningBg'],
  ['statusDangerFg', 'statusDangerBg'],
  ['statusInfoFg', 'statusInfoBg'],
  ['statusNeutralFg', 'statusNeutralBg'],
  ['statusReviewFg', 'statusReviewBg'],
  ['statusDraftFg', 'statusDraftBg'],
  ['statusApprovedFg', 'statusApprovedBg'],
  ['statusChangesRequestedFg', 'statusChangesRequestedBg'],
  ['badgeFg', 'badgeBg'],
  ['labelFg', 'labelBg'],
  ['counterFg', 'counterBg'],
  ['selectionFg', 'selectionBg'],
  ['disabledFg', 'disabledBg'],
] as const;

describe('Snow Devil themes', () => {
  beforeEach(() => { localStorage.clear(); useThemeStore.setState({ themeId: DEFAULT_THEME_ID }); });
  it('contains exactly eight complete reference themes', () => {
    expect(THEMES).toHaveLength(8);
    expect(new Set(THEMES.map(theme => theme.id)).size).toBe(8);
    for (const theme of THEMES) for (const key of THEME_TOKEN_KEYS) expect(theme.tokens[key], `${theme.id}.${key}`).toBeTruthy();
  });
  it('applies every semantic token and root metadata', () => {
    for (const theme of THEMES) {
      const id = applyTheme(theme.id);
      expect(id).toBe(theme.id);
      expect(document.documentElement.dataset.theme).toBe(theme.id);
      expect(document.documentElement.style.getPropertyValue('--accent')).toBe(theme.tokens.accent);
    }
  });
  it('keeps small label, badge, counter, and status token pairs readable in every theme', () => {
    expect(readablePairs).toHaveLength(14);
    for (const theme of THEMES) {
      for (const [foregroundKey, backgroundKey] of readablePairs) {
        const foreground = parseHexColor(theme.tokens[foregroundKey]);
        const background = parseHexColor(theme.tokens[backgroundKey]);
        expect(foreground, `${theme.id}.${foregroundKey}`).toBeTruthy();
        expect(background, `${theme.id}.${backgroundKey}`).toBeTruthy();
        const contrast = contrastRatio(foreground!, background!);
        expect(contrast, `${theme.id}.${foregroundKey}/${backgroundKey} ${theme.tokens[foregroundKey]} on ${theme.tokens[backgroundKey]}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it('falls back safely for removed stored IDs', async () => {localStorage.setItem('snow-devil-theme',JSON.stringify({state:{themeId:'removed-theme'},version:1}));await useThemeStore.persist.rehydrate();expect(useThemeStore.getState().themeId).toBe(DEFAULT_THEME_ID);expect(themeById('removed-theme').id).toBe(DEFAULT_THEME_ID);});
  it('persists through the shared store abstraction', () => {
    useThemeStore.getState().setTheme('frosted-light');
    expect(JSON.parse(localStorage.getItem('snow-devil-theme')!).state.themeId).toBe('frosted-light');
  });
  it('keeps light theme surfaces distinct from the dark simulator palette', () => {
    for (const theme of THEMES.filter(theme => theme.colorScheme === 'light')) {
      expect(theme.tokens.surfacePanel).not.toMatch(/^#0|^#1/);
      expect(theme.tokens.surfaceNested).not.toMatch(/^#0|^#1/);
      expect(theme.tokens.bgPrimary).not.toMatch(/^#0|^#1/);
      expect(theme.tokens.textPrimary).not.toBe('#e6edf3');
    }
  });
  it('does not reset active tabs when themes change', () => {
    const now = Date.now();
    useTabsStore.setState({ tabs: [{ id: 'native:home', family: 'native', kind: 'home', title: 'Home', pinned: true, closable: false, createdAt: now, lastActivatedAt: now }, { id: 'native:account-simulator', family: 'native', kind: 'accountSimulator', title: 'Account Simulator', pinned: false, closable: true, createdAt: now, lastActivatedAt: now }], activeTabId: 'native:account-simulator' });
    useThemeStore.getState().setTheme('light-premium');
    applyTheme(useThemeStore.getState().themeId);
    expect(useTabsStore.getState().activeTabId).toBe('native:account-simulator');
    expect(useTabsStore.getState().tabs.map(tab => tab.id)).toEqual(['native:home', 'native:account-simulator']);
  });
});
