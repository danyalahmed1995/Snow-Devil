import { useMemo, useState } from 'react';
import { ArrowUpDown } from 'lucide-react';
import { formatDurationHours, percentile } from '../../analytics/math';
import { integrationStreak, overallCiStatus, repositoryHealth } from '../../analytics/selectors';
import type { AnalyticsSettings, RepositoryHealth } from '../../analytics/types';
import { useAnalyticsData } from '../../hooks/useAnalyticsData';
import { useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';
import { useFlowStore } from '../../stores/flow-store';
import { useTabsStore } from '../../stores/tabs-store';
import { AnalyticsPage, AnalyticsState, EmptyState, MetricCard, MetricGrid, RefreshButton, SectionCard, StatusPill } from './AnalyticsShared';

type HealthSortKey = 'repository' | 'status' | 'openBranches' | 'branchesOverThreshold' | 'oldestActiveHours' | 'integrationsPerWeek' | 'directPushes' | 'p50BranchHours' | 'p90BranchHours';

const STATUS_RANK = { excellent: 0, good: 1, warning: 2, poor: 3 } as const;

function healthValue(row: RepositoryHealth, key: HealthSortKey): string | number {
  if (key === 'repository') return row.repository.nameWithOwner;
  if (key === 'status') return STATUS_RANK[row.status];
  return row[key] ?? -1;
}

export function CIHealthPage() {
  const analytics = useAnalyticsData();
  const settings = useAnalyticsSettingsStore(state => state.settings);
  const activeTabId = useTabsStore(state => state.activeTabId);
  const setTabState = useFlowStore(state => state.setTabState);
  const selectedId = useFlowStore(state => state.getTabState(activeTabId).selectedAnalyticsEntity?.id);
  const [repositoryId, setRepositoryId] = useState('all');
  const [rangeDays, setRangeDays] = useState(30);
  const [thresholdHours, setThresholdHours] = useState(settings.branchThresholdHours);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState<{ key: HealthSortKey; direction: 1 | -1 }>({ key: 'status', direction: -1 });

  const effectiveSettings = useMemo<AnalyticsSettings>(() => ({ ...settings, branchThresholdHours: thresholdHours }), [settings, thresholdHours]);
  const rows = useMemo(() => analytics.data ? repositoryHealth(analytics.data, effectiveSettings, rangeDays) : [], [analytics.data, effectiveSettings, rangeDays]);
  const visibleRows = useMemo(() => rows
    .filter(row => repositoryId === 'all' || row.repository.id === repositoryId)
    .filter(row => status === 'all' || row.status === status)
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

  return <AnalyticsPage title="CI Health Monitor" description="Track integration health and branch lifetime across your repositories" demo={analytics.mode === 'demo'} controls={<>
    <label>Repository<select aria-label="CI repository scope" value={repositoryId} onChange={event => setRepositoryId(event.target.value)}><option value="all">All included repositories</option>{rows.map(row => <option key={row.repository.id} value={row.repository.id}>{row.repository.nameWithOwner}</option>)}</select></label>
    <label>Threshold<select aria-label="Branch threshold" value={thresholdHours} onChange={event => setThresholdHours(Number(event.target.value))}>{[8, 16, 24, settings.branchThresholdHours].filter((value, index, all) => all.indexOf(value) === index).map(value => <option key={value} value={value}>{value} business hours</option>)}</select></label>
    <label>Range<select aria-label="CI date range" value={rangeDays} onChange={event => setRangeDays(Number(event.target.value))}>{[30, 60, 90].map(value => <option key={value} value={value}>{value} days</option>)}</select></label>
    <RefreshButton refreshing={analytics.isFetching} onClick={() => void analytics.refetch()} />
  </>}>
    <AnalyticsState loading={analytics.isLoading} error={analytics.error} partialReasons={dataset?.partialReasons ?? []} onRetry={() => void analytics.refetch()} />
    {dataset && rows.length === 0 ? <EmptyState>No repositories are included in analytics. Update repository settings to continue.</EmptyState> : dataset && <>
      <MetricGrid>
        <MetricCard label="Overall CI Status" value={overallCiStatus(rows)} tone={overallCiStatus(rows) === 'poor' ? 'danger' : overallCiStatus(rows) === 'warning' ? 'warning' : 'good'} detail="Worst included repository grade" />
        <MetricCard label="Repositories Monitored" value={rows.length} detail={`${rows.filter(row => row.status === 'excellent').length} excellent`} />
        <MetricCard label="Branches Over Threshold" value={rows.reduce((sum, row) => sum + row.branchesOverThreshold, 0)} tone="warning" detail={`>${thresholdHours} business hours`} />
        <MetricCard label="Long-Lived Active" value={activeHours.filter(hours => hours > thresholdHours * 2).length} tone={activeHours.some(hours => hours > thresholdHours * 3) ? 'danger' : 'neutral'} />
        <MetricCard label="Default-Branch Integrations" value={rows.reduce((sum, row) => sum + row.integrations, 0)} detail={`${rangeDays} day range`} />
        <MetricCard label="Direct Trunk Pushes" value={rows.reduce((sum, row) => sum + row.directPushes, 0)} tone="warning" />
        <MetricCard label="Current Integration Streak" value={`${integrationStreak(dataset, repositoryId === 'all' ? undefined : repositoryId)}d`} />
        <MetricCard label="Active Integration Days" value={activeIntegrationDays} detail={`${rangeDays} day range`} />
        <MetricCard label="P50 Branch Lifetime" value={formatDurationHours(percentile(completedP50, 50))} />
        <MetricCard label="P90 Branch Lifetime" value={formatDurationHours(percentile(completedP90, 90))} />
      </MetricGrid>
      <SectionCard title="Repository Health" action={<span className="analytics-status analytics-status--good">{visibleRows.length} shown</span>}>
        <div className="analytics-filterbar"><input aria-label="Search repositories" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search repositories..." /><select aria-label="CI status filter" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option value="excellent">Excellent</option><option value="good">Good</option><option value="warning">Warning</option><option value="poor">Poor</option></select></div>
        <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>{header('Repository', 'repository')}</th><th>{header('CI Status', 'status')}</th><th>{header('Open', 'openBranches')}</th><th>{header('Over threshold', 'branchesOverThreshold')}</th><th>{header('Oldest active', 'oldestActiveHours')}</th><th>Last trunk activity</th><th>{header('Integrations / week', 'integrationsPerWeek')}</th><th>{header('Direct pushes', 'directPushes')}</th><th>{header('P50', 'p50BranchHours')}</th><th>{header('P90', 'p90BranchHours')}</th></tr></thead><tbody>{visibleRows.map(row => <tr key={row.repository.id} className={selectedId === `ci:${row.repository.id}` ? 'is-selected' : ''} onClick={() => selectRow(row)}><td>{row.repository.nameWithOwner}</td><td><StatusPill status={row.status} /></td><td>{row.openBranches}</td><td>{row.branchesOverThreshold}</td><td>{formatDurationHours(row.oldestActiveHours)}</td><td>{row.lastDefaultBranchActivity ? new Date(row.lastDefaultBranchActivity).toLocaleDateString() : 'Unknown'}</td><td>{row.integrationsPerWeek.toFixed(1)}</td><td>{row.directPushes}</td><td>{formatDurationHours(row.p50BranchHours)}{row.estimated ? ' est.' : ''}</td><td>{formatDurationHours(row.p90BranchHours)}{row.estimated ? ' est.' : ''}</td></tr>)}</tbody></table></div>
      </SectionCard>
      <div className="analytics-grid-2">
        <SectionCard title="Integration Activity (12 weeks)"><div className="analytics-heatmap" aria-label="Integration activity heatmap">{heatmapDays.map(day => <i key={day.date} data-level={Math.min(4, day.count)} title={`${day.date}: ${day.count} integrations`} />)}</div></SectionCard>
        <SectionCard title="Branch Age Distribution"><div className="analytics-age-bar"><span className="in-flight" style={{ width: `${ageCounts.inFlight / totalAge * 100}%` }} /><span className="aging" style={{ width: `${ageCounts.aging / totalAge * 100}%` }} /><span className="stale" style={{ width: `${ageCounts.stale / totalAge * 100}%` }} /></div><div className="analytics-age-key"><span>In Flight<strong>{ageCounts.inFlight}</strong></span><span>Aging<strong>{ageCounts.aging}</strong></span><span>Stale<strong>{ageCounts.stale}</strong></span></div></SectionCard>
      </div>
    </>}
  </AnalyticsPage>;
}
