import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_ANALYTICS_SETTINGS, useAnalyticsSettingsStore } from './analytics-settings-store';

describe('analytics bot preference', () => {
  beforeEach(() => useAnalyticsSettingsStore.getState().resetSettings());

  it('excludes bot-authored work for a fresh analytics preference and remembers explicit enablement', () => {
    expect(useAnalyticsSettingsStore.getState().settings.analyticsIncludeBots).toBe(false);
    useAnalyticsSettingsStore.getState().updateSettings({ analyticsIncludeBots: true });
    expect(useAnalyticsSettingsStore.getState().settings.analyticsIncludeBots).toBe(true);
    expect(DEFAULT_ANALYTICS_SETTINGS.includeBots).toBe(false);
  });
});
