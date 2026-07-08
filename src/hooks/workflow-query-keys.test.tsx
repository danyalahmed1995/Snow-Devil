import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkflowJobs } from './useWorkflowJobs';
import { useWorkflowJobLog } from './useWorkflowJobLog';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock('@tauri-apps/api/core', () => ({ invoke }));

function wrapperFor(client: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

describe('workflow query keys and log retention', () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it('uses one canonical jobs query per repository and run regardless of active-tab state', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = wrapperFor(client);

    renderHook(() => useWorkflowJobs('octo/widgets', '123', false, true), { wrapper });
    renderHook(() => useWorkflowJobs('octo/widgets', '123', false, false), { wrapper });

    const jobsQueries = client.getQueryCache().findAll({ queryKey: ['workflow_jobs', 'octo/widgets', '123'] });
    expect(jobsQueries).toHaveLength(1);
    expect(jobsQueries[0]?.queryKey).toEqual(['workflow_jobs', 'octo/widgets', '123']);
  });

  it('does not fetch selected job logs until the watcher explicitly requests them', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = wrapperFor(client);

    renderHook(() => useWorkflowJobLog('octo/widgets', '456', false, false), { wrapper });

    expect(invoke).not.toHaveBeenCalled();
    expect(client.getQueryCache().find({ queryKey: ['ciJobLog', 'octo/widgets', '456'] })).toBeDefined();
  });
});
