import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTabsStore } from '../../stores/tabs-store';
import { OpenPullRequestRuntime } from './OpenPullRequestRuntime';
import type { NativeTab } from '../../browser/browser-tabs';
import { useArchitectureRefreshStore } from '../../architecture/refresh-state';
import { useAuthStore } from '../../stores/auth-store';

const { fetchPullRequestRiskSnapshot, saveAnalyticsRiskEventsToDb } = vi.hoisted(() => ({ fetchPullRequestRiskSnapshot: vi.fn(), saveAnalyticsRiskEventsToDb: vi.fn() }));
vi.mock('../../simulator/simulator-github-api', () => ({ fetchPullRequestRiskSnapshot }));
vi.mock('../../simulator/simulator-cache', () => ({ saveAnalyticsRiskEventsToDb }));

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

describe('open pull request synchronization', () => {
  beforeEach(() => {
    invoke.mockReset();
    fetchPullRequestRiskSnapshot.mockReset().mockResolvedValue([]);
    saveAnalyticsRiskEventsToDb.mockReset().mockResolvedValue(undefined);
    useAuthStore.setState({ session: { status: 'connected', account: { login: 'viewer', name: 'Viewer', avatarUrl: '' } }, isAuthenticated: true });
    useArchitectureRefreshStore.setState({ values: {} });
    useTabsStore.setState({
      tabs: [{ id: 'native:pr:acme/repo:42', family: 'native', kind: 'pullRequestDiff', title: 'PR #42', pinned: false, closable: true, createdAt: 1, lastActivatedAt: 1, context: { type: 'pullRequest', repository: 'Acme/Repo', number: 42, headSha: 'old-head' } }],
      activeTabId: 'native:pr:acme/repo:42',
    });
  });

  it('updates the mounted tab identity and invalidates commit-sensitive details after sync', async () => {
    invoke.mockResolvedValue({ headRefOid: 'new-head', diff: 'new diff' });
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(<QueryClientProvider client={client}><OpenPullRequestRuntime /></QueryClientProvider>);

    await waitFor(() => expect((useTabsStore.getState().tabs[0] as NativeTab).context).toMatchObject({ headSha: 'new-head' }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pull-request-details', 'acme/repo', 42], refetchType: 'none' });
    expect(useArchitectureRefreshStore.getState().values['native:pr:acme/repo:42']).toMatchObject({ status: 'updated', headSha: 'new-head' });
  });

  it('does not invalidate when synchronization reports the same head', async () => {
    invoke.mockResolvedValue({ headRefOid: 'old-head', diff: 'old diff' });
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(<QueryClientProvider client={client}><OpenPullRequestRuntime /></QueryClientProvider>);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith('get_pr_details', { owner: 'Acme', name: 'Repo', number: 42 }));
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('publishes current risk evidence even when the PR head is unchanged', async () => {
    const riskEvent = { id: 'risk:42', repositoryId: 'Acme/Repo', subjectId: 'pull-request:acme/repo:42', subjectType: 'pull_request', subjectTitle: 'PR #42', occurredAt: '2026-07-19T00:00:00Z', eventType: 'reopened', source: 'github-current-state', sourceCompleteness: 'complete', metadata: { reviewDecision: 'REVIEW_REQUIRED' } };
    invoke.mockResolvedValue({ headRefOid: 'old-head', diff: 'old diff' });
    fetchPullRequestRiskSnapshot.mockResolvedValue([riskEvent]);
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(<QueryClientProvider client={client}><OpenPullRequestRuntime /></QueryClientProvider>);

    await waitFor(() => expect(saveAnalyticsRiskEventsToDb).toHaveBeenCalledWith('viewer', [riskEvent]));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['delivery-analytics', 'cached-history', 'viewer'] });
    expect((useTabsStore.getState().tabs[0] as NativeTab).context).toMatchObject({ headSha: 'old-head' });
  });

  it('drops an in-flight response after its runtime owner unmounts', async () => {
    let resolveRequest: (value: { headRefOid: string; diff: string }) => void = () => undefined;
    invoke.mockReturnValue(new Promise(resolve => { resolveRequest = resolve; }));
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const view = render(<QueryClientProvider client={client}><OpenPullRequestRuntime /></QueryClientProvider>);
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    view.unmount();
    await act(async () => { resolveRequest({ headRefOid: 'late-head', diff: 'late diff' }); });
    expect(invalidate).not.toHaveBeenCalled();
    expect((useTabsStore.getState().tabs[0] as NativeTab).context).toMatchObject({ headSha: 'old-head' });
    expect(useArchitectureRefreshStore.getState().values).toEqual({});
  });
});
