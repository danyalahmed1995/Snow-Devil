import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useModeStore } from '../stores/mode-store';
import { pullRequestDetailsQueryKey, usePullRequestDetails } from './usePullRequestDetails';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

describe('commit-sensitive pull request details', () => {
  beforeEach(() => {
    invoke.mockReset();
    useModeStore.setState({ mode: 'live' });
  });

  it('keys details by the synchronized head SHA and retains the prior result while refreshing', async () => {
    let resolveLatest!: (value: { title: string; diff: string; headRefOid: string }) => void;
    invoke
      .mockResolvedValueOnce({ title: 'Before push', diff: 'old diff', headRefOid: 'old-head' })
      .mockImplementationOnce(() => new Promise(resolve => { resolveLatest = resolve; }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, rerender } = renderHook(
      ({ headSha }) => usePullRequestDetails('Acme/Repo', 42, headSha),
      { initialProps: { headSha: 'old-head' }, wrapper },
    );

    await waitFor(() => expect(result.current.data?.headRefOid).toBe('old-head'));
    rerender({ headSha: 'new-head' });
    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(2));
    expect(result.current.data?.headRefOid).toBe('old-head');

    resolveLatest({ title: 'After push', diff: 'new diff', headRefOid: 'new-head' });
    await waitFor(() => expect(result.current.data?.headRefOid).toBe('new-head'));
    expect(client.getQueryData(pullRequestDetailsQueryKey('Acme/Repo', 42, 'new-head'))).toMatchObject({ diff: 'new diff' });
  });
});
