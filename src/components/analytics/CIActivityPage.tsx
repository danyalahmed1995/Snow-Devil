import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAnalyticsData } from '../../hooks/useAnalyticsData';
import { useAnalyticsSync } from '../../hooks/useAnalyticsSync';
import { useFlowStore } from '../../stores/flow-store';
import { useCurrentTabId } from '../workspace/TabInstanceContext';
import { AnalyticsPage, AnalyticsState, EmptyState, MetricCard, MetricGrid, RefreshButton } from './AnalyticsShared';
import { Select } from '../ui/Select';
import { CIRunRow, formatDurationCompact } from './CIRunRow';
import type { SimulatorEvent } from '../../simulator/simulator-types';

export function CIActivityPage() {
  const analytics = useAnalyticsData();
  const activeTabId = useCurrentTabId();
  const setTabState = useFlowStore(state => state.setTabState);
  const selectedId = useFlowStore(state => state.getTabState(activeTabId).selectedAnalyticsEntity?.id);

  const [repositoryId, setRepositoryId] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [workflowFilter, setWorkflowFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [eventFilter, setEventFilter] = useState('all');
  const [rangeChoice, setRangeChoice] = useState('30');
  const [limit, setLimit] = useState(50);

  const dataset = analytics.data;

  // Filter out workflow runs and sort them correctly
  const allRuns = useMemo(() => {
    if (!dataset) return [];
    return dataset.rawWorkflowRuns.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }, [dataset]);

  // Extract unique filter options based on repository (if selected)
  const reposForFilter = useMemo(() => {
    if (!dataset) return [];
    const set = new Set(allRuns.map(r => r.repositoryId));
    return dataset.repositories.filter(r => set.has(r.id)).sort((a, b) => a.nameWithOwner.localeCompare(b.nameWithOwner));
  }, [dataset, allRuns]);

  const workflows = useMemo(() => {
    const runs = repositoryId === 'all' ? allRuns : allRuns.filter(r => r.repositoryId === repositoryId);
    return Array.from(new Set(runs.map(r => r.subjectTitle))).sort();
  }, [allRuns, repositoryId]);

  const branches = useMemo(() => {
    const runs = repositoryId === 'all' ? allRuns : allRuns.filter(r => r.repositoryId === repositoryId);
    return Array.from(new Set(runs.map(r => (r.metadata as any)?.headBranch).filter(Boolean))).sort();
  }, [allRuns, repositoryId]);

  // Apply filters
  const visibleRuns = useMemo(() => {
    const rangeDays = Number(rangeChoice);
    const cutoff = new Date(Date.now() - rangeDays * 86400000).toISOString();
    return allRuns.filter(run => {
      if (repositoryId !== 'all' && run.repositoryId !== repositoryId) return false;
      const meta = run.metadata as any;
      
      const runStatus = meta?.status;
      const runConclusion = meta?.conclusion;
      
      if (statusFilter !== 'all') {
        if (statusFilter === 'running' && runStatus !== 'in_progress') return false;
        if (statusFilter === 'queued' && (runStatus !== 'queued' && runStatus !== 'waiting' && runStatus !== 'pending')) return false;
        if (statusFilter === 'failed' && (runConclusion !== 'failure' && runConclusion !== 'timed_out' && runConclusion !== 'startup_failure')) return false;
        if (statusFilter === 'passed' && runConclusion !== 'success') return false;
        if (statusFilter === 'cancelled' && runConclusion !== 'cancelled') return false;
      }
      
      if (workflowFilter !== 'all' && run.subjectTitle !== workflowFilter) return false;
      if (branchFilter !== 'all' && meta?.headBranch !== branchFilter) return false;
      if (eventFilter !== 'all' && meta?.event !== eventFilter) return false;
      if (run.occurredAt < cutoff) return false;
      
      return true;
    });
  }, [allRuns, repositoryId, statusFilter, workflowFilter, branchFilter, eventFilter, rangeChoice]);

  // Calculate stats for summary cards
  const stats = useMemo(() => {
    let running = 0, queued = 0, failed = 0, passed = 0, cancelled = 0;
    let totalDurationMs = 0, durationCount = 0;

    for (const run of visibleRuns) {
      const meta = run.metadata as any;
      const status = meta?.status;
      const conclusion = meta?.conclusion;

      if (status === 'in_progress') running++;
      else if (status === 'queued' || status === 'waiting' || status === 'pending') queued++;
      
      if (conclusion === 'failure' || conclusion === 'timed_out' || conclusion === 'startup_failure') failed++;
      else if (conclusion === 'success') passed++;
      else if (conclusion === 'cancelled') cancelled++;

      if (meta?.durationMs && Number.isFinite(meta.durationMs) && meta.durationMs > 0 && conclusion) {
        totalDurationMs += meta.durationMs;
        durationCount++;
      }
    }
    return {
      running, queued, failed, passed, cancelled,
      avgDuration: durationCount > 0 ? totalDurationMs / durationCount : undefined
    };
  }, [visibleRuns]);

  // Auto-reset dependent filters when repository changes
  useEffect(() => {
    setWorkflowFilter('all');
    setBranchFilter('all');
  }, [repositoryId]);

  const selectRow = (id: string) => {
    const run = allRuns.find(r => r.id === id);
    if (!run) return;
    setTabState(activeTabId, {
      selectedAnalyticsEntity: {
        id: run.id,
        kind: 'ci_health', // Reusing existing inspector handling or updating it later
        title: run.subjectTitle,
        repositoryId: run.repositoryId,
        url: (run.metadata as any)?.htmlUrl,
        state: (run.metadata as any)?.conclusion ?? (run.metadata as any)?.status,
        occurredAt: run.occurredAt,
        evidence: [JSON.stringify(run.metadata)]
      }
    });
  };

  const sync = useAnalyticsSync();
  const syncCounts = sync.state ? JSON.parse(sync.state.counts_json || '{}') : {};
  const includedCount = syncCounts.included_repositories ?? 0;
  const unsupportedCount = syncCounts.workflow_run_unsupported ?? 0;
  const lastSync = sync.state?.last_successful_at ? new Date(sync.state.last_successful_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'never';
  
  // DIAGNOSTICS
  const cachedWorkflowRunsCount = dataset?.rawWorkflowRuns?.length ?? 0;
  const filteredWorkflowRunsCount = visibleRuns.length;
  const allWorkflowRunsCountRaw = dataset?.events?.filter(e => e.type?.startsWith('workflow'))?.length ?? 0;
  
  return (
    <AnalyticsPage title="CI Activity" description="Monitor workflow runs across your GitHub repositories." demo={analytics.mode === 'demo'} controls={<>
      <label>Repository<Select ariaLabel="Repository" searchable value={repositoryId} onChange={setRepositoryId} options={[{ value: 'all', label: 'All included repositories' }, ...reposForFilter.map(r => ({ value: r.id, label: r.nameWithOwner }))]}/></label>
      <label>Status<Select ariaLabel="Status filter" value={statusFilter} onChange={setStatusFilter} options={[{ value: 'all', label: 'All statuses' }, { value: 'running', label: 'Running' }, { value: 'queued', label: 'Queued' }, { value: 'passed', label: 'Passed' }, { value: 'failed', label: 'Failed' }, { value: 'cancelled', label: 'Cancelled' }]}/></label>
      <label>Workflow<Select ariaLabel="Workflow filter" searchable value={workflowFilter} onChange={setWorkflowFilter} options={[{ value: 'all', label: 'All workflows' }, ...workflows.map(w => ({ value: w, label: w }))]}/></label>
      <label>Branch<Select ariaLabel="Branch filter" searchable value={branchFilter} onChange={setBranchFilter} options={[{ value: 'all', label: 'All branches' }, ...branches.map(b => ({ value: b, label: b }))]}/></label>
      <label>Event<Select ariaLabel="Event filter" value={eventFilter} onChange={setEventFilter} options={[{ value: 'all', label: 'All events' }, { value: 'push', label: 'Push' }, { value: 'pull_request', label: 'Pull Request' }, { value: 'workflow_dispatch', label: 'Manual (Dispatch)' }, { value: 'schedule', label: 'Scheduled' }]}/></label>
      <label>Range<Select ariaLabel="Time range" value={rangeChoice} onChange={setRangeChoice} options={[{ value: '1', label: '24 hours' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]}/></label>
      <RefreshButton refreshing={analytics.isFetching} onClick={() => void analytics.refetch()} />
    </>}>
      {import.meta.env.DEV && (
        <details style={{ margin: '10px 0' }}>
          <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px', padding: '5px' }}>Developer Diagnostics</summary>
          <div className="ci-diagnostics-panel">
            <div className="ci-diag-item"><div className="ci-diag-indicator ci-diag-indicator--neutral"></div><span className="ci-diag-lbl">Normalized Events:</span><span className="ci-diag-val">{dataset?.events.length ?? 0}</span></div>
            <div className="ci-diag-item"><div className="ci-diag-indicator ci-diag-indicator--neutral"></div><span className="ci-diag-lbl">Cached Runs:</span><span className="ci-diag-val">{cachedWorkflowRunsCount}</span></div>
            <div className="ci-diag-item"><div className="ci-diag-indicator ci-diag-indicator--neutral"></div><span className="ci-diag-lbl">Cached Events:</span><span className="ci-diag-val">{allWorkflowRunsCountRaw}</span></div>
            <div className="ci-diag-item"><div className="ci-diag-indicator ci-diag-indicator--success"></div><span className="ci-diag-lbl">Visible Runs:</span><span className="ci-diag-val">{filteredWorkflowRunsCount}</span></div>
            <div className="ci-diag-item"><div className="ci-diag-indicator ci-diag-indicator--warning" style={{background: '#d29922'}}></div><span className="ci-diag-lbl">Range:</span><span className="ci-diag-val">{rangeChoice}d</span></div>
            <div className="ci-diag-item"><div className={`ci-diag-indicator ci-diag-indicator--${analytics.isLoading ? 'warning' : 'neutral'}`}></div><span className="ci-diag-lbl">Loading:</span><span className="ci-diag-val">{analytics.isLoading ? 'Yes' : 'No'}</span></div>
            <div className="ci-diag-item"><div className={`ci-diag-indicator ci-diag-indicator--${analytics.isFetching ? 'warning' : 'neutral'}`}></div><span className="ci-diag-lbl">Fetching:</span><span className="ci-diag-val">{analytics.isFetching ? 'Yes' : 'No'}</span></div>
          </div>
        </details>
      )}
      {analytics.isLoading ? (
        <AnalyticsState label="CI coverage" loading={true} error={null} partialReasons={[]} onRetry={() => void analytics.refetch()} />
      ) : analytics.error ? (
        <AnalyticsState label="CI coverage" loading={false} error={analytics.error} partialReasons={[]} onRetry={() => void analytics.refetch()} />
      ) : null}
      {dataset && allRuns.length === 0 ? (
        <EmptyState>No cached GitHub Actions runs are available yet.</EmptyState>
      ) : dataset && (
        <div className="analytics-layout-split">
          <MetricGrid>
            <MetricCard label="Running" value={stats.running} tone={stats.running > 0 ? 'info' : 'neutral'} onClick={() => setStatusFilter('running')} />
            <MetricCard label="Queued" value={stats.queued} tone={stats.queued > 0 ? 'warning' : 'neutral'} onClick={() => setStatusFilter('queued')} />
            <MetricCard label="Failed" value={stats.failed} tone={stats.failed > 0 ? 'danger' : 'neutral'} onClick={() => setStatusFilter('failed')} />
            <MetricCard label="Passed" value={stats.passed} tone={stats.passed > 0 ? 'good' : 'neutral'} onClick={() => setStatusFilter('passed')} />
            <MetricCard label="Cancelled" value={stats.cancelled} tone="neutral" onClick={() => setStatusFilter('cancelled')} />
            <MetricCard label="Avg Duration" value={stats.avgDuration ? formatDurationCompact(stats.avgDuration) : 'N/A'} tone="neutral" />
          </MetricGrid>
          
          <div className="ci-activity-list">
             {visibleRuns.length === 0 && (
               <EmptyState>
                 No workflow runs match the current filters.
                 {rangeChoice === '1' && <div style={{ marginTop: '1rem' }}><button className="analytics-button" onClick={() => setRangeChoice('7')}>View last 7 days</button></div>}
               </EmptyState>
             )}
             {visibleRuns.slice(0, limit).map(run => {
               const meta = run.metadata as any;
               const workflowId = meta?.workflowId;
               let sparklineRuns: number[] = [];
               
               if (workflowId) {
                 sparklineRuns = allRuns
                   .filter(r => r.repositoryId === run.repositoryId && (r.metadata as any)?.workflowId === workflowId && (r.metadata as any)?.durationMs > 0 && r.occurredAt <= run.occurredAt)
                   .slice(0, 10)
                   .map(r => (r.metadata as any).durationMs as number)
                   .reverse(); // Reverse so it displays oldest to newest
               }

               return (
                 <CIRunRow key={run.id} run={run} isSelected={selectedId === run.id} sparklineRuns={sparklineRuns} onSelect={selectRow} />
               );
             })}
             {visibleRuns.length > limit && (
               <div className="ci-load-more">
                 <button className="analytics-button" onClick={() => setLimit(l => l + 50)}>Load more runs ({visibleRuns.length - limit} remaining)</button>
               </div>
             )}
          </div>
        </div>
      )}
    </AnalyticsPage>
  );
}
