import { invoke } from '@tauri-apps/api/core';
import type { AnalyticsSettings } from './types';

export type AnalyticsCoverage = 'complete' | 'partial' | 'syncing' | 'stale' | 'unavailable' | 'failed';
export type AnalyticsSyncStage = 'repositories' | 'pull_requests_issues' | 'branches' | 'checks' | 'releases_deployments' | 'lineage';

export interface AnalyticsSyncState {
  account_login: string;
  status: AnalyticsCoverage | 'cancelled';
  current_stage: AnalyticsSyncStage | null;
  current_repository: string | null;
  completed_repositories_json: string;
  failed_repositories_json: string;
  continuation_json: string | null;
  last_attempted_at: string | null;
  last_successful_at: string | null;
  retention_start: string | null;
  coverage_start: string | null;
  coverage_end: string | null;
  counts_json: string;
  rate_limit_json: string | null;
  error: string | null;
  settings_fingerprint: string | null;
}

interface ApiResponse { status: number; body: unknown; next_page?: number; rate_remaining?: number; rate_reset?: number }
interface RecordInput { account_login: string; repository_id: string; source_type: string; source_id: string; updated_at: string; payload_json: string }
interface Repository { id: number; node_id?: string; full_name: string; archived: boolean; fork: boolean; private: boolean; default_branch: string; updated_at: string }

let active: { account: string; cancelled: boolean } | null = null;
const listeners = new Set<() => void>();
function notify() { listeners.forEach(listener => listener()); }
export function subscribeAnalyticsSync(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function isAnalyticsSyncActive(account: string) { return active?.account === account; }
export function cancelAnalyticsSync(account: string) { if (active?.account === account) active.cancelled = true; }

export function analyticsSettingsFingerprint(settings: AnalyticsSettings): string {
  return JSON.stringify({ includedRepositories: settings.includedRepositories, ignoredRepositories: settings.ignoredRepositories, includeArchived: settings.includeArchived, includeForks: settings.includeForks, includePrivate: settings.includePrivate, retention: settings.cacheRetentionDays, overrides: settings.repositoryOverrides, releaseMatching: settings.releaseMatchingStrategy ?? settings.releaseDeploymentStrategy, deploymentMatching: settings.deploymentMatchingStrategy ?? settings.releaseDeploymentStrategy });
}

export async function getAnalyticsSyncState(account: string): Promise<AnalyticsSyncState | null> {
  return invoke('get_analytics_sync_state', { accountLogin: account });
}

function included(repo: Repository, settings: AnalyticsSettings): boolean {
  const override = settings.repositoryOverrides[repo.full_name]?.included;
  if (override !== undefined) return override;
  if (settings.ignoredRepositories.includes(repo.full_name)) return false;
  if (settings.includedRepositories.length && !settings.includedRepositories.includes(repo.full_name)) return false;
  return (settings.includeArchived || !repo.archived) && (settings.includeForks || !repo.fork) && (settings.includePrivate || !repo.private);
}

async function fetchPage(endpoint: string): Promise<ApiResponse> {
  const response = await invoke<ApiResponse>('analytics_fetch_rest', { endpoint });
  if (response.status === 401) throw new Error('authentication_expired');
  if (response.status === 403 && response.rate_remaining === 0) throw new Error(`rate_limited:${response.rate_reset ?? 0}`);
  return response;
}

function array(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object') as Record<string, unknown>[];
  if (value && typeof value === 'object') {
    const nested = Object.values(value).find(item => Array.isArray(item));
    if (nested) return nested.filter(item => item && typeof item === 'object') as Record<string, unknown>[];
  }
  return [];
}
function record(account: string, repo: string, type: string, item: Record<string, unknown>): RecordInput {
  const id = String(item.node_id ?? item.id ?? item.sha ?? item.ref ?? `${repo}:${type}:${item.created_at ?? item.updated_at}`);
  return { account_login: account, repository_id: repo, source_type: type, source_id: id, updated_at: String(item.updated_at ?? item.created_at ?? new Date().toISOString()), payload_json: JSON.stringify(item) };
}

async function saveState(value: AnalyticsSyncState) { await invoke('save_analytics_sync_state', { value }); notify(); }
async function saveRecords(records: RecordInput[]) { for (let index = 0; index < records.length; index += 100) await invoke('save_analytics_records', { records: records.slice(index, index + 100) }); }

async function paged(account: string, repo: string, type: string, endpoint: (page: number) => string, boundary: string, maxPages = 10): Promise<{ count: number; unsupported: boolean; rate?: object }> {
  let page = 1; let pagesFetched = 0; let count = 0; let unsupported = false; let rate: object | undefined;
  const visited = new Set<number>();
  while (pagesFetched < maxPages && !visited.has(page)) {
    visited.add(page); pagesFetched += 1;
    if (active?.cancelled) throw new Error('cancelled');
    const response = await fetchPage(endpoint(page));
    rate = { remaining: response.rate_remaining, reset: response.rate_reset };
    if (response.status === 404 || response.status === 409) { unsupported = true; break; }
    if (response.status >= 400) throw new Error(`github_${response.status}`);
    const items = array(response.body);
    await saveRecords(items.map(item => record(account, repo, type, item)));
    count += items.length;
    const oldestItem = items[items.length - 1];
    const oldest = oldestItem?.updated_at ?? oldestItem?.created_at;
    if (!response.next_page || (typeof oldest === 'string' && oldest < boundary)) break;
    page = response.next_page;
  }
  return { count, unsupported, rate };
}

export async function startAnalyticsSync(account: string, settings: AnalyticsSettings): Promise<void> {
  if (active?.account === account) return;
  if (active) throw new Error('another_account_sync_active');
  active = { account, cancelled: false }; notify();
  const now = new Date();
  const boundary = new Date(now.getTime() - settings.cacheRetentionDays * 86400000).toISOString();
  const fingerprint = analyticsSettingsFingerprint(settings);
  const previous = await getAnalyticsSyncState(account);
  const completed = new Set<string>();
  const failed: Array<{ repository: string; stage: string; error: string }> = [];
  const counts: Record<string, number> = {};
  const state: AnalyticsSyncState = { account_login: account, status: 'syncing', current_stage: 'repositories', current_repository: null, completed_repositories_json: '[]', failed_repositories_json: '[]', continuation_json: previous?.continuation_json ?? null, last_attempted_at: now.toISOString(), last_successful_at: previous?.last_successful_at ?? null, retention_start: boundary, coverage_start: previous?.coverage_start ?? null, coverage_end: previous?.coverage_end ?? null, counts_json: '{}', rate_limit_json: null, error: null, settings_fingerprint: fingerprint };
  try {
    await saveState(state);
    const repositories: Repository[] = [];
    let page = 1; let repositoryPages = 0; const visitedRepositoryPages = new Set<number>();
    do {
      visitedRepositoryPages.add(page); repositoryPages += 1;
      const response = await fetchPage(`/user/repos?per_page=100&page=${page}&sort=updated&direction=desc`);
      if (response.status >= 400) throw new Error(`github_${response.status}`);
      repositories.push(...array(response.body) as unknown as Repository[]);
      page = response.next_page ?? 0;
    } while (page && repositoryPages < 10 && !visitedRepositoryPages.has(page) && !active.cancelled);
    const selected = repositories.filter(repo => included(repo, settings));
    await saveRecords(selected.map(repo => record(account, repo.full_name, 'repository', repo as unknown as Record<string, unknown>)));
    counts.repositories = selected.length;
    for (const repo of selected) {
      state.current_repository = repo.full_name;
      const [owner, name] = repo.full_name.split('/').map(encodeURIComponent);
      const sources: Array<[AnalyticsSyncStage, string, (page: number) => string]> = [
        ['pull_requests_issues', 'issue_or_pull_request', p => `/repos/${owner}/${name}/issues?state=all&since=${encodeURIComponent(boundary)}&per_page=100&page=${p}`],
        ['pull_requests_issues', 'pull_request', p => `/repos/${owner}/${name}/pulls?state=all&sort=updated&direction=desc&per_page=100&page=${p}`],
        ['branches', 'branch', p => `/repos/${owner}/${name}/branches?per_page=100&page=${p}`],
        ['checks', 'workflow_run', p => `/repos/${owner}/${name}/actions/runs?created=>=${boundary.slice(0, 10)}&per_page=100&page=${p}`],
        ['checks', 'check_run', p => `/repos/${owner}/${name}/commits/${encodeURIComponent(repo.default_branch)}/check-runs?per_page=100&page=${p}`],
        ['releases_deployments', 'release', p => `/repos/${owner}/${name}/releases?per_page=100&page=${p}`],
        ['releases_deployments', 'deployment', p => `/repos/${owner}/${name}/deployments?per_page=100&page=${p}`],
      ];
      try {
        for (const [stage, type, endpoint] of sources) {
          state.current_stage = stage; state.continuation_json = JSON.stringify({ repository: repo.full_name, stage }); await saveState(state);
          const result = await paged(account, repo.full_name, type, endpoint, boundary);
          counts[type] = (counts[type] ?? 0) + result.count;
          if (result.unsupported) counts[`${type}_unsupported`] = (counts[`${type}_unsupported`] ?? 0) + 1;
          state.rate_limit_json = result.rate ? JSON.stringify(result.rate) : state.rate_limit_json;
        }
        state.current_stage = 'lineage';
        completed.add(repo.full_name);
      } catch (error) {
        if (String(error).includes('cancelled') || String(error).includes('authentication_expired') || String(error).includes('rate_limited')) throw error;
        failed.push({ repository: repo.full_name, stage: state.current_stage ?? 'unknown', error: String(error) });
      }
      state.completed_repositories_json = JSON.stringify([...completed]); state.failed_repositories_json = JSON.stringify(failed); state.counts_json = JSON.stringify(counts); await saveState(state);
    }
    if (active.cancelled) throw new Error('cancelled');
    state.status = failed.length ? 'partial' : 'complete'; state.current_stage = null; state.current_repository = null; state.continuation_json = null; state.last_successful_at = new Date().toISOString(); state.coverage_start = boundary; state.coverage_end = new Date().toISOString();
    await saveState(state);
  } catch (error) {
    const message = String(error);
    state.status = message.includes('cancelled') ? 'cancelled' : message.includes('rate_limited') ? 'partial' : 'failed';
    state.error = message; await saveState(state);
  } finally { active = null; notify(); }
}

export function coverageFor(state: AnalyticsSyncState | null, settings: AnalyticsSettings): AnalyticsCoverage {
  if (!state) return 'unavailable';
  if (state.status === 'syncing') return 'syncing';
  if (state.status === 'failed') return 'failed';
  if (state.settings_fingerprint !== analyticsSettingsFingerprint(settings)) return 'stale';
  if (!state.last_successful_at || Date.now() - new Date(state.last_successful_at).getTime() > settings.refreshIntervalMinutes * 60000) return 'stale';
  if (!state.coverage_start || new Date(state.coverage_start) > new Date(Date.now() - settings.cacheRetentionDays * 86400000 + 86400000)) return 'partial';
  return state.status === 'complete' ? 'complete' : 'partial';
}
