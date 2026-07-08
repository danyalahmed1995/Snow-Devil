import { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { formatDurationHours, percentile } from '../../analytics/math';
import { integrationStreak, overallCiStatus, repositoryHealth } from '../../analytics/selectors';
import type { AnalyticsSettings, RepositoryHealth } from '../../analytics/types';
import { useAnalyticsData } from '../../hooks/useAnalyticsData';
import { useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';
import { useFlowStore } from '../../stores/flow-store';
import { AnalyticsPage, AnalyticsState, EmptyState, MetricCard, MetricGrid, RefreshButton, SectionCard, StatusPill, useAnalyticsTabRefresh } from './AnalyticsShared';
import { Select } from '../ui/Select';
import { useCurrentTabId } from '../workspace/TabInstanceContext';
import { useTabsStore } from '../../stores/tabs-store';

type HealthSortKey = 'repository' | 'status' | 'openBranches' | 'branchesOverThreshold' | 'oldestActiveHours' | 'integrationsPerWeek' | 'directPushes' | 'p50BranchHours' | 'p90BranchHours';

const STATUS_RANK = { excellent: 0, healthy: 1, unknown: 2, unsupported: 2, warning: 3, poor: 4, sync_failed: 5 } as const;

function healthValue(row: RepositoryHealth, key: HealthSortKey): string | number {
  if (key === 'repository') return row.repository.nameWithOwner;
  if (key === 'status') return STATUS_RANK[row.status];
  return row[key] ?? -1;
}

export function CIHealthPage() {
  const activeTabId = useCurrentTabId();
  const isActive = useTabsStore(state => state.activeTabId === activeTabId);
  const analytics = useAnalyticsData({ enabled: isActive });
  useAnalyticsTabRefresh(analytics.refetch);
  const settings = useAnalyticsSettingsStore(state => state.settings);
  const setTabState = useFlowStore(state => state.setTabState);
  const selectedId = useFlowStore(state => state.getTabState(activeTabId).selectedAnalyticsEntity?.id);
  const [repositoryId, setRepositoryId] = useState('all');
  const [rangeChoice, setRangeChoice] = useState('30');
  const [customStart, setCustomStart] = useState(() => new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const rangeDays = rangeChoice === 'custom' ? Math.max(1, Math.ceil((new Date(customEnd).getTime() - new Date(customStart).getTime()) / 86400000) + 1) : Number(rangeChoice);
  const [thresholdHours, setThresholdHours] = useState(settings.branchThresholdHours);
  const [thresholdChoice, setThresholdChoice] = useState(String(settings.branchThresholdHours));
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState<{ key: HealthSortKey; direction: 1 | -1 }>({ key: 'status', direction: -1 });

  const effectiveSettings = useMemo<AnalyticsSettings>(() => ({ ...settings, branchThresholdHours: thresholdHours }), [settings, thresholdHours]);
  const rows = useMemo(() => analytics.data ? repositoryHealth(analytics.data, effectiveSettings, rangeDays) : [], [analytics.data, effectiveSettings, rangeDays]);
  const visibleRows = useMemo(() => rows
    .filter(row => repositoryId === 'all' || row.repository.id === repositoryId)
    .filter(row => status === 'all' || status === 'actionable' && ['warning', 'poor', 'sync_failed'].includes(row.status) || row.status === status)
    .filter(row => row.repository.nameWithOwner.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const av = healthValue(a, sort.key);
      const bv = healthValue(b, sort.key);
      return (typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))) * sort.direction;
    }), [rows, repositoryId, status, search, sort]);
  const dataset = analytics.data;
  const integrations = useMemo(() => dataset?.events.filter(event => (repositoryId === 'all' || event.repositoryId === repositoryId) && (event.type === 'merged' || event.directPush)) ?? [], [dataset, repositoryId]);
  const heatmapDays = useMemo(() => {
    if (!dataset) return [];
    const counts = new Map<string, number>();
    integrations.forEach(event => counts.set(event.occurredAt.slice(0, 10), (counts.get(event.occurredAt.slice(0, 10)) ?? 0) + 1));
    const end = new Date(dataset.referenceDate).getTime();
    return Array.from({ length: 84 }, (_, index) => {
      const date = new Date(end - (83 - index) * 86400000).toISOString().slice(0, 10);
      return { date, count: counts.get(date) ?? 0 };
    });
  }, [dataset, integrations]);
  const activeHours = rows.flatMap(row => row.oldestActiveHours == null ? [] : [row.oldestActiveHours]);
  const completedP50 = rows.flatMap(row => row.p50BranchHours == null ? [] : [row.p50BranchHours]);
  const completedP90 = rows.flatMap(row => row.p90BranchHours == null ? [] : [row.p90BranchHours]);
  const ageCounts = { inFlight: rows.reduce((sum, row) => sum + Math.max(0, row.openBranches - row.branchesOverThreshold), 0), aging: rows.reduce((sum, row) => sum + row.branchesOverThreshold - (row.status === 'poor' ? 1 : 0), 0), stale: rows.filter(row => row.status === 'poor').length };
  const totalAge = Math.max(1, ageCounts.inFlight + ageCounts.aging + ageCounts.stale);
  const rangeStart = new Date(new Date(dataset?.referenceDate ?? 0).getTime() - (rangeDays - 1) * 86400000).toISOString();
  const activeIntegrationDays = new Set(integrations.filter(event => event.occurredAt >= rangeStart).map(event => event.occurredAt.slice(0, 10))).size;

  const selectRow = (row: RepositoryHealth) => setTabState(activeTabId, { selectedAnalyticsEntity: {
    id: `ci:${row.repository.id}`,
    kind: 'ci_health',
    title: row.repository.nameWithOwner,
    repositoryId: row.repository.id,
    url: row.repository.url,
    state: row.status,
    occurredAt: row.lastDefaultBranchActivity,
    reason: row.reasons.join('. '),
    confidence: row.estimated ? 'inferred' : 'exact',
    evidence: row.reasons,
  } });

  const sortBy = (key: HealthSortKey) => setSort(current => current.key === key ? { key, direction: current.direction === 1 ? -1 : 1 } : { key, direction: 1 });
  const header = (label: string, key: HealthSortKey) => <button type="button" onClick={() => sortBy(key)}>{label}<ArrowUpDown size={9} /></button>;
  useEffect(() => {
    if (selectedId?.startsWith('ci:') && !visibleRows.some(row => `ci:${row.repository.id}` === selectedId)) setTabState(activeTabId, { selectedAnalyticsEntity: undefined });
  }, [activeTabId, selectedId, setTabState, visibleRows]);
  const inspectMetric = (title: string, value: string | number, definition: string, sampleCount = rows.length) => setTabState(activeTabId, { selectedAnalyticsEntity: { id: `ci:metric:${title}`, kind: 'ci_health', title, state: String(value), reason: definition, definition, sampleCount, coverage: dataset?.partial ? 'partial' : 'complete', confidence: dataset?.partial ? 'partial' : 'exact', lineage:{formula:definition,numerator:String(value),denominator:`${sampleCount} qualifying samples`,includedEntityTypes:['branch','default-branch integration'],excludedEntityTypes:['unsupported repositories','bot-only evidence excluded by settings'],repositoriesIncluded:rows.map(row=>row.repository.nameWithOwner),failedOrSkipped:dataset?.partialReasons??[],coverageStart:rangeStart,coverageEnd:dataset?.referenceDate,sampleCount,excludedOrIncompleteCount:rows.filter(row=>row.coverage!=='complete').length,timeBasis:title.includes('Lifetime')||title.includes('Threshold')?'business':'event timestamp',confidence:dataset?.partial?'partial':'exact',evidenceSources:['GitHub branch refs','pull-request merges','default-branch push observations']} } });

  return <AnalyticsPage title="CI Health Monitor" description="Track integration health and branch lifetime across your repositories" demo={analytics.mode === 'demo'} controls={<>
    <label>Repository<Select ariaLabel="CI repository scope" searchable value={repositoryId} onChange={setRepositoryId} options={[{ value: 'all', label: 'All included repositories' }, ...rows.map(row => ({ value: row.repository.id, label: row.repository.nameWithOwner }))]} /></label>
    <label>Branch age threshold<Select ariaLabel="Branch age threshold" value={thresholdChoice} onChange={value => { setThresholdChoice(value); if (value !== 'custom') setThresholdHours(Number(value)); }} options={[8, 16, 24].map(value => ({ value: String(value), label: `${value} business hours` })).concat([{ value: 'custom', label: 'Custom threshold' }])} /></label>
    {thresholdChoice === 'custom' && <label>Hours<input aria-label="Custom branch age threshold" type="number" min={1} max={720} value={thresholdHours} onChange={event => setThresholdHours(Math.max(1, Number(event.target.value)))} /></label>}
    <label>Range<Select ariaLabel="CI date range" value={rangeChoice} onChange={setRangeChoice} options={[30, 60, 90].map(value => ({ value: String(value), label: `${value} days` })).concat([{ value: 'custom', label: 'Custom range' }])} /></label>
    {rangeChoice === 'custom' && <><input aria-label="CI range start" type="date" max={customEnd} value={customStart} onChange={event => setCustomStart(event.target.value)} /><input aria-label="CI range end" type="date" min={customStart} value={customEnd} onChange={event => setCustomEnd(event.target.value)} /></>}
    <RefreshButton refreshing={analytics.isFetching} onClick={() => void analytics.refetch()} />
  </>}>
    <AnalyticsState label="CI coverage" loading={analytics.isLoading} error={analytics.error} partialReasons={dataset?.partialReasons ?? []} onRetry={() => void analytics.refetch()} />
    {dataset && rows.length === 0 ? <EmptyState>No repositories are included in analytics. Update repository settings to continue.</EmptyState> : dataset && <>
      <MetricGrid>
        <MetricCard label="Overall CI Status" value={overallCiStatus(rows)} tone={overallCiStatus(rows) === 'poor' ? 'danger' : overallCiStatus(rows) === 'warning' ? 'warning' : 'good'} detail="Worst evidence-backed repository state" title="Worst supported repository status; unknown evidence is not graded as warning." onClick={() => inspectMetric('Overall CI Status', overallCiStatus(rows), 'Worst evidence-backed status across the selected repositories. Unknown repositories remain unknown.')} />
        <MetricCard label="Repositories Monitored" value={rows.filter(row => row.coverage !== 'unavailable').length} detail={`${rows.filter(row => row.status === 'unknown').length} unknown`} title="Repositories with qualifying branch or integration evidence." onClick={() => inspectMetric('Repositories Monitored', rows.filter(row => row.coverage !== 'unavailable').length, 'Included repositories with qualifying branch or default-branch integration evidence.')} />
        <MetricCard label="Branches Over Threshold" value={rows.reduce((sum, row) => sum + row.branchesOverThreshold, 0)} tone="warning" detail={`>${thresholdHours} business hours`} onClick={() => inspectMetric('Branches Over Threshold', rows.reduce((sum, row) => sum + row.branchesOverThreshold, 0), 'Open, non-default branches whose business-hour lifetime exceeds the selected threshold.')} />
        <MetricCard label="Long-Lived Active" value={activeHours.filter(hours => hours > thresholdHours * 2).length} tone={activeHours.some(hours => hours > thresholdHours * 3) ? 'danger' : 'neutral'} />
        <MetricCard label="Default-Branch Integrations" value={rows.reduce((sum, row) => sum + row.integrations, 0)} detail={`${rangeDays} day range`} />
        <MetricCard label="Direct Trunk Pushes" value={rows.reduce((sum, row) => sum + row.directPushes, 0)} tone="warning" />
        <MetricCard label="Current Integration Streak" value={`${integrationStreak(dataset, repositoryId === 'all' ? undefined : repositoryId)}d`} />
        <MetricCard label="Active Integration Days" value={activeIntegrationDays} detail={`${rangeDays} day range`} />
        <MetricCard label="P50 Branch Lifetime" value={completedP50.length ? formatDurationHours(percentile(completedP50, 50)) : 'Unavailable'} detail={`${rows.reduce((sum, row) => sum + row.sampleCount, 0)} samples`} onClick={() => inspectMetric('P50 Branch Lifetime', completedP50.length ? formatDurationHours(percentile(completedP50, 50)) : 'Unavailable', 'Median business-hour lifetime of completed non-default branches.', rows.reduce((sum, row) => sum + row.sampleCount, 0))} />
        <MetricCard label="P90 Branch Lifetime" value={completedP90.length ? formatDurationHours(percentile(completedP90, 90)) : 'Unavailable'} detail={`${rows.reduce((sum, row) => sum + row.sampleCount, 0)} samples`} onClick={() => inspectMetric('P90 Branch Lifetime', completedP90.length ? formatDurationHours(percentile(completedP90, 90)) : 'Unavailable', '90th percentile business-hour lifetime of completed non-default branches.', rows.reduce((sum, row) => sum + row.sampleCount, 0))} />
      </MetricGrid>
      <SectionCard title="Repository Health" action={<span className="analytics-status analytics-status--good">{visibleRows.length} shown</span>}>
        <div className="analytics-filterbar"><input aria-label="Search repositories" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search repositories..." /><Select ariaLabel="CI status filter" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, { value: 'actionable', label: 'Actionable only' }, { value: 'excellent', label: 'Excellent' }, { value: 'healthy', label: 'Healthy' }, { value: 'warning', label: 'Warning' }, { value: 'poor', label: 'Poor' }, { value: 'unknown', label: 'Unknown / insufficient data' }, { value: 'sync_failed', label: 'Sync failed' }, { value: 'unsupported', label: 'Unsupported' }]} /></div>
        <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>{header('Repository', 'repository')}</th><th>{header('CI Status', 'status')}</th><th>{header('Open', 'openBranches')}</th><th>{header('Over threshold', 'branchesOverThreshold')}</th><th>{header('Oldest active', 'oldestActiveHours')}</th><th>Last trunk activity</th><th>{header('Integrations / week', 'integrationsPerWeek')}</th><th>{header('Direct pushes', 'directPushes')}</th><th>{header('P50', 'p50BranchHours')}</th><th>{header('P90', 'p90BranchHours')}</th></tr></thead><tbody>{visibleRows.map(row => <tr key={row.repository.id} className={selectedId === `ci:${row.repository.id}` ? 'is-selected' : ''} onClick={() => selectRow(row)}><td>{row.repository.nameWithOwner}</td><td><StatusPill status={row.status} /></td><td>{row.coverage === 'unavailable' ? 'Unknown' : row.openBranches}</td><td>{row.coverage === 'unavailable' ? 'Unknown' : row.branchesOverThreshold}</td><td>{row.oldestActiveHours == null ? 'Unavailable' : formatDurationHours(row.oldestActiveHours)}</td><td>{row.lastDefaultBranchActivity ? new Date(row.lastDefaultBranchActivity).toLocaleDateString() : 'Unavailable'}</td><td>{row.coverage === 'unavailable' ? 'Unavailable' : row.integrationsPerWeek.toFixed(1)}</td><td>{row.coverage === 'unavailable' ? 'Unknown' : row.directPushes}</td><td>{row.p50BranchHours == null ? `Unavailable (${row.sampleCount} samples)` : `${formatDurationHours(row.p50BranchHours)}${row.estimated ? ' est.' : ''}`}</td><td>{row.p90BranchHours == null ? `Unavailable (${row.sampleCount} samples)` : `${formatDurationHours(row.p90BranchHours)}${row.estimated ? ' est.' : ''}`}</td></tr>)}</tbody></table></div>
      </SectionCard>
      <div className="analytics-grid-2">
        <SectionCard title="Integration Activity (12 weeks)"><div className="analytics-heatmap" aria-label="Integration activity heatmap">{heatmapDays.map(day => <i key={day.date} data-level={Math.min(4, day.count)} data-tooltip={`${day.date}: ${day.count} integrations`} />)}</div></SectionCard>
        <SectionCard title="Branch Age Distribution"><div className="analytics-age-bar"><span className="in-flight" style={{ width: `${ageCounts.inFlight / totalAge * 100}%` }} /><span className="aging" style={{ width: `${ageCounts.aging / totalAge * 100}%` }} /><span className="stale" style={{ width: `${ageCounts.stale / totalAge * 100}%` }} /></div><div className="analytics-age-key"><span>In Flight<strong>{ageCounts.inFlight}</strong></span><span>Aging<strong>{ageCounts.aging}</strong></span><span>Stale<strong>{ageCounts.stale}</strong></span></div></SectionCard>
      </div>
    </>}
  </AnalyticsPage>;
}
