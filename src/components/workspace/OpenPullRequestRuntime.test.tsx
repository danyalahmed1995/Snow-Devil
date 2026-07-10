import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTabsStore } from '../../stores/tabs-store';
import { OpenPullRequestRuntime } from './OpenPullRequestRuntime';
import type { NativeTab } from '../../browser/browser-tabs';

const { useAnalyticsData } = vi.hoisted(() => ({ useAnalyticsData: vi.fn() }));
vi.mock('../../hooks/useAnalyticsData', () => ({ useAnalyticsData }));

describe('open pull request synchronization', () => {
  beforeEach(() => {
    useAnalyticsData.mockReset();
    useTabsStore.setState({
      tabs: [{ id: 'native:pr:acme/repo:42', family: 'native', kind: 'pullRequestDiff', title: 'PR #42', pinned: false, closable: true, createdAt: 1, lastActivatedAt: 1, context: { type: 'pullRequest', repository: 'Acme/Repo', number: 42, headSha: 'old-head' } }],
      activeTabId: 'native:pr:acme/repo:42',
    });
  });

  it('updates the mounted tab identity and invalidates commit-sensitive details after sync', async () => {
    useAnalyticsData.mockReturnValue({ data: { entities: [{ type: 'pull_request', repositoryId: 'acme/repo', number: 42, headSha: 'new-head' }] } });
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(<QueryClientProvider client={client}><OpenPullRequestRuntime /></QueryClientProvider>);

    await waitFor(() => expect((useTabsStore.getState().tabs[0] as NativeTab).context).toMatchObject({ headSha: 'new-head' }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['pull-request-details', 'acme/repo', 42], refetchType: 'none' });
  });

  it('does not invalidate when synchronization reports the same head', async () => {
    useAnalyticsData.mockReturnValue({ data: { entities: [{ type: 'pull_request', repositoryId: 'Acme/Repo', number: 42, headSha: 'old-head' }] } });
    const client = new QueryClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    render(<QueryClientProvider client={client}><OpenPullRequestRuntime /></QueryClientProvider>);
    await waitFor(() => expect(useAnalyticsData).toHaveBeenCalled());
    expect(invalidate).not.toHaveBeenCalled();
  });
});
