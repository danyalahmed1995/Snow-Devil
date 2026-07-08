import { invoke } from '@tauri-apps/api/core';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyticsSettingsFingerprint, type AnalyticsSyncState } from '../analytics/sync';
import { DEFAULT_ANALYTICS_SETTINGS, useAnalyticsSettingsStore } from '../stores/analytics-settings-store';
import { useAuthStore } from '../stores/auth-store';
import { useModeStore } from '../stores/mode-store';
import { clearAnalyticsSyncCacheForTests, useAnalyticsSync } from './useAnalyticsSync';

function syncState(update: Partial<AnalyticsSyncState> = {}): AnalyticsSyncState {
  const now = new Date().toISOString();
  return {
    account_login: 'octo',
    status: 'complete',
    current_stage: null,
    current_repository: null,
    completed_repositories_json: '[]',
    failed_repositories_json: '[]',
    continuation_json: null,
    last_attempted_at: now,
    last_successful_at: now,
    retention_start: now,
    coverage_start: now,
    coverage_end: now,
    counts_json: '{}',
    rate_limit_json: null,
    error: null,
    settings_fingerprint: analyticsSettingsFingerprint(DEFAULT_ANALYTICS_SETTINGS),
    ...update,
  };
}

describe('useAnalyticsSync', () => {
  beforeEach(() => {
    clearAnalyticsSyncCacheForTests();
    vi.mocked(invoke).mockReset();
    useModeStore.setState({ mode: 'live', demoRevision: 0 });
    useAuthStore.setState({
      session: { status: 'connected', account: { login: 'octo', name: 'Octo', avatarUrl: '' } },
      isAuthenticated: true,
    });
    useAnalyticsSettingsStore.setState({ settings: DEFAULT_ANALYTICS_SETTINGS });
  });

  it('coalesces simultaneous sync-state reads across mounted consumers', async () => {
    vi.mocked(invoke).mockImplementation(async command => command === 'get_analytics_sync_state' ? syncState() : null);

    const first = renderHook(() => useAnalyticsSync());
    const second = renderHook(() => useAnalyticsSync());

    await waitFor(() => expect(first.result.current.state?.status).toBe('complete'));
    await waitFor(() => expect(second.result.current.state?.status).toBe('complete'));

    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === 'get_analytics_sync_state')).toHaveLength(1);
  });

  it('does not subscribe or read sync state while disabled', async () => {
    vi.mocked(invoke).mockImplementation(async command => command === 'get_analytics_sync_state' ? syncState() : null);

    const hook = renderHook(({ enabled }) => useAnalyticsSync({ enabled }), { initialProps: { enabled: false } });

    await new Promise(resolve => setTimeout(resolve, 20));
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === 'get_analytics_sync_state')).toHaveLength(0);

    hook.rerender({ enabled: true });

    await waitFor(() => expect(hook.result.current.state?.status).toBe('complete'));
    expect(vi.mocked(invoke).mock.calls.filter(([command]) => command === 'get_analytics_sync_state')).toHaveLength(1);
  });
});
