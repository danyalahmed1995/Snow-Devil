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

  it('persists canonical mutes, mute timestamps, saved filters, and the default view', () => {
    useAnalyticsSettingsStore.getState().updateSettings({
      mutedDeliveryRiskItems: ['delivery-risk:42:pull_request:7'],
      deliveryRiskMuteMetadata: { 'delivery-risk:42:pull_request:7': { mutedAt: '2026-07-01T00:00:00Z' } },
      deliveryRiskSavedViews: [{ id: 'view:1', name: 'Human blocked work', category: 'blocked', scope: 'maintained', ownership: 'everyone', repositoryId: 'all', actor: 'human', entityType: 'issues_prs', age: 'active_180', archived: 'hide', forks: 'exclude', muted: 'hide', confidence: 'exact', backlog: 'active', sort: 'priority', search: '' }],
      defaultDeliveryRiskViewId: 'view:1',
    });
    const persisted = JSON.parse(localStorage.getItem('snow-devil-analytics-settings') ?? '{}');
    expect(persisted.state.settings.mutedDeliveryRiskItems).toContain('delivery-risk:42:pull_request:7');
    expect(persisted.state.settings.deliveryRiskSavedViews[0].sort).toBe('priority');
    expect(persisted.state.settings.defaultDeliveryRiskViewId).toBe('view:1');
  });
});
