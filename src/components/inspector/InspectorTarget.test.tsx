import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { NativeTab } from '../../browser/browser-tabs';
import type { SimulatorEntityState } from '../../simulator/simulator-types';
import { useFlowStore } from '../../stores/flow-store';
import { useModeStore } from '../../stores/mode-store';
import { useTabsStore } from '../../stores/tabs-store';
import { Inspector } from './Inspector';

function simulatorEntity(subjectType: 'issue' | 'pull_request', number: number): SimulatorEntityState {
  return { id: `${subjectType}-${number}`, repositoryId: 'octo/repo', subjectType, title: `Historical ${subjectType}`, number, stage: subjectType === 'issue' ? 'issues' : 'merged', status: subjectType === 'issue' ? 'open' : 'merged', assignees: [], reviewers: [], labels: [], commitCount: 1, commentCount: 0, reviewCommentCount: 0, reviewState: 'approved', checkState: 'success', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z', sourceCompleteness: 'complete' };
}

function nativeTab(kind: 'accountSimulator' | 'repositorySimulator'): NativeTab {
  return { id: `native:${kind}`, family: 'native', kind, title: kind === 'accountSimulator' ? 'Account Simulator' : 'Repository Simulator', pinned: false, closable: true, createdAt: 1, lastActivatedAt: 1 };
}

describe.each([
  ['accountSimulator', 'pull_request', 7],
  ['accountSimulator', 'issue', 8],
  ['repositorySimulator', 'pull_request', 9],
  ['repositorySimulator', 'issue', 10],
] as const)('Inspector context-aware open actions', (kind, subjectType, number) => {
  beforeEach(() => {
    useModeStore.setState({ mode: 'live' });
    useFlowStore.setState({ states: {} });
  });

  it(`${kind} resolves ${subjectType} and preserves replay state`, () => {
    const tab = nativeTab(kind);
    useTabsStore.setState({ tabs: [tab], activeTabId: tab.id, navigationGeneration: 1 });
    useFlowStore.getState().setTabState(tab.id, { selectedSimulatorEntity: simulatorEntity(subjectType, number), cursorTime: 123456, isPlaying: true });
    const client = new QueryClient();
    render(<QueryClientProvider client={client}><Inspector /></QueryClientProvider>);
    fireEvent.click(screen.getByRole('button', { name: subjectType === 'issue' ? 'Open in App Browser' : 'Open PR' }));
    const preserved = useFlowStore.getState().states[tab.id];
    expect(preserved.cursorTime).toBe(123456);
    expect(preserved.isPlaying).toBe(true);
    expect(preserved.selectedSimulatorEntity?.id).toBe(`${subjectType}-${number}`);
    if (subjectType === 'issue') {
      expect(useTabsStore.getState().tabs.some(item => item.family === 'browser' && item.currentUrl.includes(`/issues/${number}`))).toBe(true);
    } else {
      expect(useTabsStore.getState().tabs.some(item => item.family === 'native' && item.kind === 'pullRequestDiff' && item.context?.type === 'pullRequest' && item.context.number === number)).toBe(true);
    }
  });
});
