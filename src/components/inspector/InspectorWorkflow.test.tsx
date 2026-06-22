import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowItem } from '../../types/flow';
import { useFlowStore } from '../../stores/flow-store';
import { useModeStore } from '../../stores/mode-store';
import { useTabsStore } from '../../stores/tabs-store';
import { Inspector } from './Inspector';

const selected: FlowItem = { id: 'pr:42', type: 'pull_request', repositoryId: 'repo', repositoryName: 'octo/app', owner: 'octo', number: 42, title: 'Ship shared workflow model', stage: 'review', status: 'active', url: 'https://github.com/octo/app/pull/42', author: { login: 'ada' }, createdAt: '2026-06-01T00:00:00Z', updatedAt: '2026-06-04T00:00:00Z', stageEnteredAt: '2026-06-03T00:00:00Z', baseBranch: 'main', headBranch: 'feature/workflow', commentCount: 3, commitCount: 5, completeness: 'complete', reviewSummary: { state: 'REVIEW_REQUIRED', requestedReviewers: ['lin'], reviews: [] }, checksSummary: { state: 'SUCCESS', totalCount: 2, successCount: 2, failureCount: 0 }, stageHistory: [{ id: 'opened', stage: 'pull_requests', label: 'Pull request opened', occurredAt: '2026-06-01T00:00:00Z' }, { id: 'review', stage: 'review', label: 'Review requested', occurredAt: '2026-06-03T00:00:00Z' }] };

describe('workflow Inspector', () => {
  beforeEach(() => {
    useModeStore.setState({ mode: 'live' });
    useTabsStore.setState({ activeTabId: 'native:flow', tabs: [{ id: 'native:flow', family: 'native', kind: 'flow', title: 'Flow', pinned: false, closable: true, createdAt: 1, lastActivatedAt: 1 }] });
    useFlowStore.setState({ states: {} });
    useFlowStore.getState().setTabState('native:flow', { selectedItemId: selected.id, selectedFlowItem: selected });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  it('explains classification and renders metadata plus stage history', () => {
    render(<QueryClientProvider client={new QueryClient()}><Inspector /></QueryClientProvider>);
    expect(screen.getByText('Why it\'s here')).toBeInTheDocument();
    expect(screen.getByText('Waiting for review from 1 requested reviewer.')).toBeInTheDocument();
    expect(screen.getByText('feature/workflow')).toBeInTheDocument();
    expect(screen.getByText('Review requested')).toBeInTheDocument();
    expect(screen.getByText('complete')).toBeInTheDocument();
  });

  it('provides internal, external, and copy actions with feedback', async () => {
    render(<QueryClientProvider client={new QueryClient()}><Inspector /></QueryClientProvider>);
    expect(screen.getByRole('button', { name: 'Open in Tab' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open on GitHub' }));
    expect(window.open).toHaveBeenCalledWith('https://github.com/octo/app/pull/42', '_blank', 'noopener,noreferrer');
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(screen.getByText('Link copied')).toBeInTheDocument());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://github.com/octo/app/pull/42');
  });
});
