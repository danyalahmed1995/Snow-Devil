import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzePullRequestArchitecture } from '../../architecture/analyze';
import type { ArchitectureComponent } from '../../architecture/types';
import { useArchitectureStore } from '../../architecture/architecture-store';
import { useTabsStore } from '../../stores/tabs-store';
import { FullComponentMap } from './FullComponentMap';
import { useArchitectureRefreshStore } from '../../architecture/refresh-state';
import { architectureDecisionDiagnostics, resetArchitectureDecisionDiagnostics } from '../../architecture/diagnostics';

const component = (id: string, name: string): ArchitectureComponent => ({
  id, name, repositoryId: 'acme/repo', kind: 'package', rootPaths: [id], manifestPaths: [], owners: [], configured: false,
  confidence: { level: 'high', score: 1 },
});

function impactAt(headSha: string) {
  const impact = analyzePullRequestArchitecture({ repositoryId: 'acme/repo', pullRequestNumber: 42, headSha, files: [] });
  const app = component('app', 'App');
  const api = component('api', 'API');
  const worker = component('worker', 'Worker');
  impact.headSha = headSha;
  impact.snapshot.components = [app, api, worker];
  impact.snapshot.dependencies = [
    { fromComponentId: 'app', toComponentId: 'api', kind: 'import', evidence: [], confidence: { level: 'high', score: 1 } },
    { fromComponentId: 'api', toComponentId: 'worker', kind: 'import', evidence: [], confidence: { level: 'high', score: 1 } },
  ];
  impact.primaryComponentId = 'app';
  impact.affectedComponents = [{ component: app, files: [], additions: 0, deletions: 0, role: 'primary' }];
  impact.directBlastRadius = ['api'];
  impact.indirectBlastRadius = ['worker'];
  return impact;
}

describe('full component map commit refresh notifier', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetArchitectureDecisionDiagnostics();
    useArchitectureStore.setState({ states: { 'native:pr:42': { section: 'map', mapState: { groupingMode: 'none', filters: { dependencies: true, dependents: true, indirect: true, external: true }, expandedGroups: [], zoom: 1, panX: 0, panY: 0 } } } });
    useTabsStore.setState({ tabs: [{ id: 'native:pr:42', family: 'native', kind: 'pullRequestDiff', title: 'PR #42', pinned: false, closable: true, createdAt: 1, lastActivatedAt: 1, context: { type: 'pullRequest', repository: 'acme/repo', number: 42, headSha: 'newhead123' } }], activeTabId: 'native:pr:42' });
    useArchitectureRefreshStore.setState({ values: { 'native:pr:42': { status: 'syncing', headSha: 'newhead123' } } });
  });

  afterEach(() => vi.useRealTimers());

  it('pulses amber while syncing, reports the new SHA, and settles after the update', () => {
    const { container, rerender } = render(<FullComponentMap impact={impactAt('oldhead123')} onSelect={vi.fn()} />);
    expect(screen.getByRole('status')).toHaveTextContent('newhead');
    expect(screen.getByRole('status')).toHaveTextContent('Syncing');
    expect(container.querySelector('.full-component-map')).toHaveClass('is-commit-refreshing');
    const edges = container.querySelectorAll('.full-component-map__edge');
    expect(edges).toHaveLength(2);
    expect(container.querySelectorAll('.full-component-map__edge.is-refresh-affected')).toHaveLength(1);
    expect(edges[0]).toHaveAttribute('marker-end', 'url(#arrow-default)');
    expect(edges[1]).not.toHaveAttribute('marker-end', 'url(#arrow-sync)');

    rerender(<FullComponentMap impact={impactAt('newhead123')} onSelect={vi.fn()} />);
    const layoutRunsAfterImpactChange = architectureDecisionDiagnostics.layoutRuns;
    act(() => {
      useArchitectureRefreshStore.getState().set('native:pr:42', { status: 'updated', headSha: 'newhead123' });
      window.setTimeout(() => useArchitectureRefreshStore.getState().set('native:pr:42', { status: 'current', headSha: 'newhead123' }), 4000);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Updated');
    expect(container.querySelector('.full-component-map')).toHaveClass('is-commit-updated');
    expect(architectureDecisionDiagnostics.layoutRuns).toBe(layoutRunsAfterImpactChange);

    act(() => vi.advanceTimersByTime(4000));
    expect(screen.getByRole('status')).toHaveTextContent('Current');
    expect(container.querySelector('.full-component-map')).not.toHaveClass('is-commit-updated');
    expect(architectureDecisionDiagnostics.layoutRuns).toBe(layoutRunsAfterImpactChange);
  });

  it('does not rebuild the graph when only the synchronized tab head changes', () => {
    const impact = impactAt('newhead123');
    const onSelect = vi.fn();
    const { rerender } = render(<FullComponentMap impact={impact} onSelect={onSelect} />);
    const layoutRuns = architectureDecisionDiagnostics.layoutRuns;

    act(() => {
      useTabsStore.getState().updateNativeTabContext('native:pr:42', { type: 'pullRequest', repository: 'acme/repo', number: 42, headSha: 'newhead456' });
    });
    rerender(<FullComponentMap impact={impact} onSelect={onSelect} />);

    expect(screen.getByRole('status')).toHaveTextContent('newhead');
    expect(architectureDecisionDiagnostics.layoutRuns).toBe(layoutRuns);
  });
});
