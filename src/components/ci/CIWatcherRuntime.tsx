import { invoke } from '@tauri-apps/api/core';
import { useEffect, useMemo } from 'react';
import { ciPollingInterval, isWorkflowRunsPage, normalizeWorkflowRuns, type CIWorkflowRun } from '../../ci/ci-watcher';
import { useAccountRepositories } from '../../hooks/useAccountContext';
import { useAuthStore } from '../../stores/auth-store';
import { useCIWatcherStore } from '../../stores/ci-watcher-store';
import { useModeStore } from '../../stores/mode-store';

interface AnalyticsApiResponse { status: number; body: unknown; rate_remaining?: number; rate_reset?: number }

const DEMO_RUNS: CIWorkflowRun[] = normalizeWorkflowRuns('nova-labs/snow-devil', { workflow_runs: [
  { id: 8001, name: 'Desktop CI', run_number: 241, status: 'in_progress', conclusion: null, head_branch: 'main', event: 'push', actor: { login: 'snowdevil-demo' }, created_at: '2026-02-15T16:55:00Z', run_started_at: '2026-02-15T16:56:00Z', updated_at: '2026-02-15T17:00:00Z', html_url: 'https://github.com/nova-labs/snow-devil/actions/runs/8001', run_attempt: 1 },
  { id: 8000, name: 'Release', run_number: 240, status: 'completed', conclusion: 'success', head_branch: 'main', event: 'push', actor: { login: 'snowdevil-demo' }, created_at: '2026-02-15T15:00:00Z', run_started_at: '2026-02-15T15:01:00Z', updated_at: '2026-02-15T15:08:00Z', html_url: 'https://github.com/nova-labs/snow-devil/actions/runs/8000', run_attempt: 1 },
] });

export function CIWatcherRuntime() {
  const session = useAuthStore(state => state.session);
  const mode = useModeStore(state => state.mode);
  const repositories = useAccountRepositories();
  const subscriptions = useCIWatcherStore(state => state.subscriptions);
  const account = mode === 'demo' ? 'demo' : session.status === 'connected' ? session.account.login : undefined;
  const recentRepositories = useMemo(() => repositories.data?.filter(repository => !repository.isArchived).slice(0, 8).map(repository => repository.nameWithOwner.toLowerCase()) ?? [], [repositories.data]);
  const repositoryKey = [...new Set([...recentRepositories, ...Object.keys(subscriptions)])].slice(0, 12).sort().join('|');

  useEffect(() => {
    const store = useCIWatcherStore.getState();
    if (!account) {
      if (session.status !== 'checking') store.setActiveAccount(undefined);
      return;
    }
    store.setActiveAccount(account);
    if (mode === 'demo') {
      store.setRuns('nova-labs/snow-devil', DEMO_RUNS);
      return;
    }
    const repositoryIds = repositoryKey ? repositoryKey.split('|') : [];
    if (!repositoryIds.length) return;
    let disposed = false;
    let timer: number | undefined;
    let inFlight = false;
    let failures = 0;
    const schedule = (delay: number) => { if (!disposed) { if (timer !== undefined) window.clearTimeout(timer); timer = window.setTimeout(() => void poll(), delay); } };
    const poll = async () => {
      if (disposed || inFlight) return;
      if (navigator.onLine === false) {
        repositoryIds.forEach(repository => store.setRepositoryStatus(repository, 'offline', 'Waiting for connectivity'));
        schedule(180_000);
        return;
      }
      inFlight = true;
      const allRuns: CIWorkflowRun[] = [];
      try {
        for (let index = 0; index < repositoryIds.length && !disposed; index += 4) {
          const batch = repositoryIds.slice(index, index + 4);
          const results = await Promise.all(batch.map(async repository => {
            store.setRepositoryStatus(repository, store.runsByRepository[repository]?.length ? 'ready' : 'loading');
            const [owner, name] = repository.split('/');
            const endpoint = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/actions/runs?per_page=20`;
            const response = await invoke<AnalyticsApiResponse>('analytics_fetch_rest', { endpoint });
            return { repository, response };
          }));
          for (const { repository, response } of results) {
            if (disposed) break;
            if (response.status >= 200 && response.status < 300) {
              const runs = normalizeWorkflowRuns(repository, response.body);
              if (!isWorkflowRunsPage(response.body) || (response.body.workflow_runs.length > 0 && runs.length === 0)) {
                store.setRepositoryStatus(repository, 'error', 'GitHub returned an invalid workflow snapshot; previous runs remain visible');
                continue;
              }
              allRuns.push(...runs);
              store.setRuns(repository, runs);
            } else if (response.status === 403) store.setRepositoryStatus(repository, 'permission_denied', 'Actions data is unavailable with the current authorization');
            else if (response.status === 404) store.setRepositoryStatus(repository, 'unavailable', 'Actions are disabled or unavailable');
            else if (response.status === 429 || response.rate_remaining === 0) store.setRepositoryStatus(repository, 'rate_limited', 'GitHub Actions polling is rate limited');
            else store.setRepositoryStatus(repository, 'error', 'Workflow runs could not be refreshed');
          }
        }
        failures = 0;
        schedule(ciPollingInterval(allRuns));
      } catch {
        failures += 1;
        repositoryIds.forEach(repository => store.setRepositoryStatus(repository, 'error', 'Workflow refresh failed; previous runs remain visible'));
        schedule(Math.min(15 * 60_000, 60_000 * 2 ** Math.min(4, failures)));
      } finally { inFlight = false; }
    };
    const refresh = () => { if (timer !== undefined) window.clearTimeout(timer); void poll(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    window.addEventListener('snow-devil:ci-refresh', refresh);
    schedule(0);
    return () => { disposed = true; if (timer !== undefined) window.clearTimeout(timer); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); window.removeEventListener('snow-devil:ci-refresh', refresh); };
  }, [account, mode, repositoryKey, session.status]);
  return null;
}
