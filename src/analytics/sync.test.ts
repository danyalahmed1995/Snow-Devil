import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ANALYTICS_SETTINGS } from '../stores/analytics-settings-store';
import { analyticsSettingsFingerprint, cancelAnalyticsSync, coverageFor, shouldPublishAnalyticsBatch, startAnalyticsSync, type AnalyticsSyncState } from './sync';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

const repository = { id: 1, node_id: 'R_1', full_name: 'octo/app', archived: false, fork: false, private: false, default_branch: 'main', updated_at: '2026-06-20T00:00:00Z' };
const api = (body: unknown, extra = {}) => ({ status: 200, body, rate_remaining: 4000, rate_reset: 2_000_000_000, ...extra });

function state(status: AnalyticsSyncState['status'], update: Partial<AnalyticsSyncState> = {}): AnalyticsSyncState {
  const start = new Date(Date.now() - DEFAULT_ANALYTICS_SETTINGS.cacheRetentionDays * 86400000).toISOString();
  return { account_login: 'octo', status, current_stage: null, current_repository: null, completed_repositories_json: '[]', failed_repositories_json: '[]', continuation_json: null, last_attempted_at: null, last_successful_at: new Date().toISOString(), retention_start: start, coverage_start: start, coverage_end: new Date().toISOString(), counts_json: '{}', rate_limit_json: null, error: null, settings_fingerprint: analyticsSettingsFingerprint(DEFAULT_ANALYTICS_SETTINGS), ...update };
}

describe('connected analytics synchronization', () => {
  beforeEach(() => { invoke.mockReset(); });

  it('publishes large repository syncs in batches and always publishes the final batch', () => {
    expect(shouldPublishAnalyticsBatch(1, 94)).toBe(false);
    expect(shouldPublishAnalyticsBatch(5, 94)).toBe(true);
    expect(shouldPublishAnalyticsBatch(93, 94)).toBe(false);
    expect(shouldPublishAnalyticsBatch(94, 94)).toBe(true);
  });

  it('runs staged first sync, paginates, chunks records, and completes idempotently', async () => {
    const savedStates: AnalyticsSyncState[] = [];
    invoke.mockImplementation(async (command: string, args: Record<string, unknown>) => {
      if (command === 'get_analytics_sync_state') return null;
      if (command === 'save_analytics_sync_state') { savedStates.push(args.value as AnalyticsSyncState); return; }
      if (command === 'save_analytics_records') return;
      const endpoint = String(args.endpoint);
      if (endpoint.startsWith('/user/repos')) return api([repository]);
      if (endpoint.includes('/issues') && endpoint.includes('&page=1')) return api([{ id: 10, node_id: 'I_10', updated_at: '2026-06-20T00:00:00Z' }], { next_page: 2 });
      if (endpoint.includes('/issues') && endpoint.includes('&page=2')) return api([{ id: 11, node_id: 'I_11', updated_at: '2025-01-01T00:00:00Z' }]);
      return api([]);
    });
    await startAnalyticsSync('octo', DEFAULT_ANALYTICS_SETTINGS);
    expect(invoke.mock.calls.some(([, args]) => String(args.endpoint).includes('page=2'))).toBe(true);
    const finalState = savedStates[savedStates.length - 1];
    expect(finalState?.status).toBe('complete');
    expect(JSON.parse(finalState.counts_json)).toMatchObject({ repositories: 1, issue_or_pull_request: 2 });
    const written = invoke.mock.calls.filter(([command]) => command === 'save_analytics_records').flatMap(([, args]) => args.records as Array<{ source_type: string; source_id: string }>);
    expect(new Set(written.map(item => `${item.source_type}:${item.source_id}`)).size).toBe(written.length);
  });

  it('preserves successful repositories when another repository fails', async () => {
    const states: AnalyticsSyncState[] = [];
    invoke.mockImplementation(async (command: string, args: Record<string, unknown>) => {
      if (command === 'get_analytics_sync_state') return null;
      if (command === 'save_analytics_sync_state') { states.push(args.value as AnalyticsSyncState); return; }
      if (command === 'save_analytics_records') return;
      const endpoint = String(args.endpoint);
      if (endpoint.startsWith('/user/repos')) return api([repository, { ...repository, id: 2, node_id: 'R_2', full_name: 'octo/broken' }]);
      if (endpoint.includes('/octo/broken/issues')) return { status: 500, body: {} };
      return api([]);
    });
    await startAnalyticsSync('octo', DEFAULT_ANALYTICS_SETTINGS);
    const finalState = states[states.length - 1];
    expect(finalState?.status).toBe('partial');
    expect(JSON.parse(finalState.completed_repositories_json)).toContain('octo/app');
    expect(JSON.parse(finalState.failed_repositories_json)[0].repository).toBe('octo/broken');
  });

  it('persists cancellation, rate limits, and authentication expiry as resumable outcomes', async () => {
    for (const outcome of ['cancelled', 'rate_limited', 'authentication_expired'] as const) {
      const states: AnalyticsSyncState[] = [];
      invoke.mockReset().mockImplementation(async (command: string, args: Record<string, unknown>) => {
        if (command === 'get_analytics_sync_state') return null;
        if (command === 'save_analytics_sync_state') { states.push(args.value as AnalyticsSyncState); if (outcome === 'cancelled' && states.length === 1) cancelAnalyticsSync('octo'); return; }
        if (command === 'analytics_fetch_rest') return outcome === 'rate_limited' ? { status: 403, body: {}, rate_remaining: 0, rate_reset: 2_000_000_000 } : outcome === 'authentication_expired' ? { status: 401, body: {} } : api([repository]);
        return;
      });
      await startAnalyticsSync('octo', DEFAULT_ANALYTICS_SETTINGS);
      const finalState = states[states.length - 1];
      expect(finalState?.status).toBe(outcome === 'cancelled' ? 'cancelled' : outcome === 'rate_limited' ? 'partial' : 'failed');
      expect(finalState?.continuation_json ?? null).toBeDefined();
    }
  });

  it('distinguishes complete, stale, partial, unavailable, syncing, and failed coverage', () => {
    expect(coverageFor(null, DEFAULT_ANALYTICS_SETTINGS)).toBe('unavailable');
    expect(coverageFor(state('syncing'), DEFAULT_ANALYTICS_SETTINGS)).toBe('syncing');
    expect(coverageFor(state('failed'), DEFAULT_ANALYTICS_SETTINGS)).toBe('failed');
    expect(coverageFor(state('complete'), DEFAULT_ANALYTICS_SETTINGS)).toBe('complete');
    expect(coverageFor(state('complete', { settings_fingerprint: 'old' }), DEFAULT_ANALYTICS_SETTINGS)).toBe('stale');
    expect(coverageFor(state('complete', { last_successful_at: new Date(Date.now() - 60 * 60000).toISOString() }), DEFAULT_ANALYTICS_SETTINGS)).toBe('stale');
    expect(coverageFor(state('complete', { coverage_start: new Date().toISOString() }), DEFAULT_ANALYTICS_SETTINGS)).toBe('partial');
  });

  it('records unsupported release and deployment capabilities instead of zero activity', async () => {
    const states: AnalyticsSyncState[] = [];
    invoke.mockImplementation(async (command: string, args: Record<string, unknown>) => {
      if (command === 'get_analytics_sync_state') return null;
      if (command === 'save_analytics_sync_state') { states.push(args.value as AnalyticsSyncState); return; }
      if (command === 'save_analytics_records') return;
      const endpoint = String(args.endpoint);
      if (endpoint.startsWith('/user/repos')) return api([repository]);
      if (endpoint.includes('/releases') || endpoint.includes('/deployments')) return { status: 404, body: {} };
      return api([]);
    });
    await startAnalyticsSync('octo', DEFAULT_ANALYTICS_SETTINGS);
    expect(JSON.parse(states[states.length - 1].counts_json)).toMatchObject({ release_unsupported: 1, deployment_unsupported: 1 });
  });
});
