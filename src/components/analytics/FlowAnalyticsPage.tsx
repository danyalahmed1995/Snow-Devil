import { useMemo, useState } from 'react';
import { cumulativeFlow, includedRepositories, leadTimeSamples, throughputBuckets } from '../../analytics/selectors';
import { detectOutliers, formatDurationHours, percentile } from '../../analytics/math';
import type { AnalyticsInspectable, LeadTimeMetric } from '../../analytics/types';
import { useAnalyticsData } from '../../hooks/useAnalyticsData';
import { useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';
import { useFlowStore } from '../../stores/flow-store';
import { useTabsStore } from '../../stores/tabs-store';
import { AnalyticsPage, AnalyticsState, EmptyState, MetricCard, MetricGrid, RefreshButton, SectionCard, useAnalyticsTabRefresh } from './AnalyticsShared';
import { Select, type SelectOption } from '../ui/Select';

type AnalyticsTab = 'cumulative' | 'throughput' | 'lead-time';
type Grouping = 'daily' | 'weekly' | 'monthly';
const FLOW_COLORS = { issues: 'var(--pipeline-issue)', coding: 'var(--pipeline-coding)', pullRequests: 'var(--pipeline-review)', review: 'var(--pipeline-review)', checks: 'var(--pipeline-checks)', ready: 'var(--warning)', merged: 'var(--pipeline-delivery)', released: 'var(--text-muted)', deployed: 'var(--info)' };
const LEAD_OPTIONS: SelectOption<LeadTimeMetric>[] = [
  { value: 'issue_to_pr', label: 'Issue opened → PR opened' },
  { value: 'pr_to_review', label: 'PR opened → first review' },
  { value: 'pr_to_merge', label: 'PR opened → merged' },
  { value: 'commit_to_merge', label: 'First commit → merged' },
  { value: 'merge_to_deploy', label: 'Merged → deployed' },
  { value: 'release_to_deploy', label: 'Released → deployed' },
  { value: 'issue_to_release', label: 'Issue opened → released' },
  { value: 'issue_to_deploy', label: 'Issue opened → deployed' },
];

function StackedFlowChart({ snapshots, onSelect }: { snapshots: ReturnType<typeof cumulativeFlow>; onSelect: (date: string) => void }) {
  const max = Math.max(1, ...snapshots.map(snapshot => Object.entries(snapshot).filter(([key]) => key !== 'date').reduce((sum, [, value]) => sum + Number(value), 0)));
  const ticks = snapshots.filter((_, index) => index === 0 || index === snapshots.length - 1 || index % Math.max(1, Math.floor(snapshots.length / 4)) === 0);
  return <div className="analytics-chart"><div className="analytics-chart-legend">{Object.entries(FLOW_COLORS).map(([key, color]) => <span key={key}><i style={{ background: color }} />{key.replace(/([A-Z])/g, ' $1')}</span>)}</div><div className="analytics-axis-y"><span>{max}</span><span>Items</span><span>0</span></div><div className="analytics-stacked-chart" aria-label="Cumulative flow diagram">{snapshots.map(snapshot => <button type="button" className="analytics-stacked-day" key={snapshot.date} title={`${snapshot.date}: ${Object.entries(snapshot).filter(([key]) => key !== 'date').map(([key, value]) => `${key} ${value}`).join(', ')}`} onClick={() => onSelect(snapshot.date)}>{Object.entries(FLOW_COLORS).map(([key, color]) => <span key={key} style={{ height: `${Number(snapshot[key as keyof typeof FLOW_COLORS]) / max * 100}%`, background: color }} />)}</button>)}</div><div className="analytics-axis-x">{ticks.map(snapshot => <span key={snapshot.date}>{snapshot.date.slice(5)}</span>)}</div><p className="analytics-chart-note">End-of-day unique work-item snapshots. Select a date to inspect the underlying scope.</p></div>;
}

function ThroughputChart({ buckets, onSelect }: { buckets: ReturnType<typeof throughputBuckets>; onSelect: (date: string, count: number) => void }) {
  const max = Math.max(1, ...buckets.map(bucket => bucket.merged + bucket.issuesClosed + bucket.releases + bucket.deployments));
  return <div className="analytics-chart"><div className="analytics-chart-legend"><span><i style={{ background: 'var(--success)' }} />Unique completion events</span></div><div className="analytics-throughput-bars" role="img" aria-label="Throughput over time">{buckets.map(bucket => { const total = bucket.merged + bucket.issuesClosed + bucket.releases + bucket.deployments; return <button type="button" key={bucket.date} style={{ height: `${Math.max(2, total / max * 100)}%` }} title={`${bucket.date}: ${total} unique completion events`} onClick={() => onSelect(bucket.date, total)}><span>{total}</span></button>; })}</div><div className="analytics-axis-x"><span>{buckets[0]?.date.slice(5)}</span><span>Completion count</span><span>{buckets[buckets.length - 1]?.date.slice(5)}</span></div></div>;
}

function LeadTimeHistogram({ values, onSelect }: { values: number[]; onSelect: (start: number, end: number, count: number) => void }) {
  const maxValue = Math.max(1, ...values);
  const binSize = maxValue / 10;
  const bins = Array.from({ length: 10 }, () => 0);
  values.forEach(value => { bins[Math.min(9, Math.floor(value / binSize))] += 1; });
  const maxCount = Math.max(1, ...bins);
  return <div className="analytics-chart"><div className="analytics-histogram" aria-label="Lead time distribution">{bins.map((count, index) => <button type="button" key={index} style={{ height: `${Math.max(2, count / maxCount * 100)}%` }} title={`${count} samples from ${formatDurationHours(index * binSize)} to ${formatDurationHours((index + 1) * binSize)}`} onClick={() => onSelect(index * binSize, (index + 1) * binSize, count)}><span>{formatDurationHours(index * binSize)}</span></button>)}</div></div>;
}

export function FlowAnalyticsPage() {
  const analytics = useAnalyticsData();
  useAnalyticsTabRefresh(analytics.refetch);
  const settings = useAnalyticsSettingsStore(state => state.settings);
  const updateSettings = useAnalyticsSettingsStore(state => state.updateSettings);
  const activeTabId = useTabsStore(state => state.activeTabId);
  const setTabState = useFlowStore(state => state.setTabState);
  const [tab, setTab] = useState<AnalyticsTab>('cumulative');
  const [repositoryId, setRepositoryId] = useState('all');
  const [rangeChoice, setRangeChoice] = useState(String(settings.defaultRangeDays));
  const [customStart, setCustomStart] = useState(() => new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const rangeDays = rangeChoice === 'custom' ? Math.max(1, Math.ceil((new Date(customEnd).getTime() - new Date(customStart).getTime()) / 86400000) + 1) : Number(rangeChoice);
  const [metric, setMetric] = useState<LeadTimeMetric>('pr_to_merge');
  const [grouping, setGrouping] = useState<Grouping>('daily');
  const [itemType, setItemType] = useState<'all' | 'pull_request' | 'issue' | 'release_deployment'>('all');
  const repositories = analytics.data ? includedRepositories(analytics.data, settings) : [];
  const repoScope = repositoryId === 'all' ? undefined : repositoryId;
  const selectedRepositories = repositoryId === 'all' ? repositories : repositories.filter(repository => repository.id === repositoryId);
  const filteredDataset = useMemo(() => {
    if (!analytics.data) return undefined;
    let entities = analytics.data.entities.filter(entity => settings.includeBots || !entity.isBot);
    if (itemType !== 'all') entities = entities.filter(entity => itemType === 'release_deployment' ? entity.type === 'release' || entity.type === 'deployment' : entity.type === itemType);
    const ids = new Set(entities.map(entity => entity.id));
    return { ...analytics.data, entities, events: analytics.data.events.filter(event => ids.has(event.entityId)) };
  }, [analytics.data, itemType, settings.includeBots]);
  const snapshots = useMemo(() => filteredDataset ? cumulativeFlow(filteredDataset, rangeDays, repoScope) : [], [filteredDataset, rangeDays, repoScope]);
  const groupingSpan = grouping === 'daily' ? 1 : grouping === 'weekly' ? 7 : 30;
  const throughput = useMemo(() => filteredDataset ? throughputBuckets(filteredDataset, rangeDays, repoScope, groupingSpan) : [], [filteredDataset, rangeDays, repoScope, groupingSpan]);
  const samples = useMemo(() => filteredDataset ? leadTimeSamples(filteredDataset, metric, repoScope) : [], [filteredDataset, metric, repoScope]);
  const sampleValues = samples.map(sample => sample.hours);
  const totalThroughput = throughput.reduce((sum, bucket) => sum + bucket.merged + bucket.issuesClosed + bucket.releases + bucket.deployments, 0);
  const reviewValues = filteredDataset ? leadTimeSamples(filteredDataset, 'pr_to_review', repoScope).map(sample => sample.hours) : [];
  const deployCount = throughput.reduce((sum, bucket) => sum + bucket.deployments, 0);
  const releaseCount = throughput.reduce((sum, bucket) => sum + bucket.releases, 0);
  const deploymentAvailable = selectedRepositories.some(repository => repository.deploymentMatching);
  const releaseAvailable = selectedRepositories.some(repository => repository.releaseMatching);
  const inspect = (value: AnalyticsInspectable) => setTabState(activeTabId, { selectedAnalyticsEntity: value });
  const inspectMetric = (title: string, state: string, definition: string, sampleCount: number, excludedCount = 0) => inspect({ id: `analytics:${title}`, kind: 'flow_analytics', title, state, reason: definition, definition, sampleCount, excludedCount, coverage: filteredDataset?.partial ? 'partial' : 'complete', confidence: filteredDataset?.partial ? 'partial' : 'exact' });
  const leadOptions = LEAD_OPTIONS.map(option => {
    const needsRelease = ['release_to_deploy', 'issue_to_release'].includes(option.value);
    const needsDeploy = ['merge_to_deploy', 'release_to_deploy', 'issue_to_deploy'].includes(option.value);
    const disabled = needsRelease && !releaseAvailable || needsDeploy && !deploymentAvailable;
    return { ...option, disabled, disabledReason: disabled ? 'The selected repository scope has no supporting release/deployment evidence.' : undefined };
  });

  return <AnalyticsPage title="Flow Analytics" description="Explainable unique work-item flow, completion, and lead-time evidence" demo={analytics.mode === 'demo'} controls={<>
    <label>Scope<Select ariaLabel="Analytics repository scope" searchable value={repositoryId} onChange={setRepositoryId} options={[{ value: 'all', label: 'All repositories' }, ...repositories.map(repository => ({ value: repository.id, label: repository.nameWithOwner }))]} /></label>
    <label>Work type<Select ariaLabel="Analytics work type" value={itemType} onChange={value => setItemType(value as typeof itemType)} options={[{ value: 'all', label: 'All delivery work' }, { value: 'pull_request', label: 'Pull requests' }, { value: 'issue', label: 'Issues' }, { value: 'release_deployment', label: 'Releases and deployments' }]} /></label>
    <label>Range<Select ariaLabel="Analytics date range" value={rangeChoice} onChange={setRangeChoice} options={[30, 60, 90].map(value => ({ value: String(value), label: `${value} days` })).concat([{ value: 'custom', label: 'Custom range' }])} /></label>
    {rangeChoice === 'custom' && <><input aria-label="Analytics range start" type="date" max={customEnd} value={customStart} onChange={event => setCustomStart(event.target.value)} /><input aria-label="Analytics range end" type="date" min={customStart} value={customEnd} onChange={event => setCustomEnd(event.target.value)} /></>}
    <label><input type="checkbox" checked={settings.includeBots} onChange={event => updateSettings({ includeBots: event.target.checked })} /> Include bots</label>
    <RefreshButton refreshing={analytics.isFetching} onClick={() => void analytics.refetch()} />
  </>}>
    <AnalyticsState label="Analytics coverage" loading={analytics.isLoading} error={analytics.error} partialReasons={analytics.data?.partialReasons ?? []} onRetry={() => void analytics.refetch()} />
    <div className="analytics-tabs" role="tablist"><button role="tab" aria-selected={tab === 'cumulative'} className={tab === 'cumulative' ? 'is-active' : ''} onClick={() => setTab('cumulative')}>Cumulative Flow</button><button role="tab" aria-selected={tab === 'throughput'} className={tab === 'throughput' ? 'is-active' : ''} onClick={() => setTab('throughput')}>Throughput</button><button role="tab" aria-selected={tab === 'lead-time'} className={tab === 'lead-time' ? 'is-active' : ''} onClick={() => setTab('lead-time')}>Lead Time Distribution</button></div>
    {analytics.data && repositories.length === 0 ? <EmptyState kind="unavailable">No included repositories are available for analytics.</EmptyState> : analytics.data && <>
      <MetricGrid>
        <MetricCard label="Unique Completion Events" value={totalThroughput} tone="good" detail={`${rangeDays} day range`} title="Unique issue closures, PR merges, releases, and deployments. Types are shown separately and are not called delivered work." onClick={() => inspectMetric('Unique Completion Events', String(totalThroughput), 'Unique completion events by entity and event type. A PR, release, and deployment remain separate completion events.', totalThroughput)} />
        <MetricCard label="Median Lead Time" value={formatDurationHours(percentile(sampleValues, 50))} tone="good" detail={`${samples.length} qualifying samples`} onClick={() => inspectMetric('Median Lead Time', formatDurationHours(percentile(sampleValues, 50)), `Median ${LEAD_OPTIONS.find(option => option.value === metric)?.label}.`, samples.length)} />
        <MetricCard label="P90 Lead Time" value={formatDurationHours(percentile(sampleValues, 90))} detail={`${samples.length} qualifying samples`} onClick={() => inspectMetric('P90 Lead Time', formatDurationHours(percentile(sampleValues, 90)), `90th percentile ${LEAD_OPTIONS.find(option => option.value === metric)?.label}.`, samples.length)} />
        <MetricCard label="Deployment Frequency" value={deploymentAvailable ? `${(deployCount / Math.max(1, rangeDays / 7)).toFixed(1)}/wk` : 'Unavailable'} detail={deploymentAvailable ? `${deployCount} deployments` : 'Deployment evidence missing'} onClick={() => inspectMetric('Deployment Frequency', deploymentAvailable ? `${(deployCount / Math.max(1, rangeDays / 7)).toFixed(1)}/wk` : 'Unavailable', 'Successful deployment completion events per week. Unavailable when deployment evidence is unsupported.', deployCount)} />
        <MetricCard label="Release Frequency" value={releaseAvailable ? `${(releaseCount / Math.max(1, rangeDays / 7)).toFixed(1)}/wk` : 'Unavailable'} detail={releaseAvailable ? `${releaseCount} releases` : 'Release evidence missing'} onClick={() => inspectMetric('Release Frequency', releaseAvailable ? `${(releaseCount / Math.max(1, rangeDays / 7)).toFixed(1)}/wk` : 'Unavailable', 'Published release events per week.', releaseCount)} />
        <MetricCard label="Review Wait Median" value={formatDurationHours(percentile(reviewValues, 50))} detail={`${reviewValues.length} samples`} onClick={() => inspectMetric('Review Wait Median', formatDurationHours(percentile(reviewValues, 50)), 'Median elapsed time from PR open to first review.', reviewValues.length)} />
        <MetricCard label="Checks Wait Median" value="Unavailable" detail="Check start/end pairs not cached" onClick={() => inspectMetric('Checks Wait Median', 'Unavailable', 'Requires reliable check start and terminal timestamps for the same required-check set. Current cached history cannot prove this metric.', 0)} />
      </MetricGrid>
      {tab === 'cumulative' && <SectionCard title="Cumulative Flow Diagram">{snapshots.length ? <StackedFlowChart snapshots={snapshots} onSelect={date => inspectMetric(`Flow snapshot · ${date}`, date, 'End-of-day unique work-item lifecycle occupancy.', snapshots.reduce((sum, snapshot) => sum + Object.values(snapshot).filter(value => typeof value === 'number').reduce((subtotal, value) => subtotal + Number(value), 0), 0))} /> : <EmptyState kind="no-data">No lifecycle snapshots exist in this range.</EmptyState>}</SectionCard>}
      {tab === 'throughput' && <SectionCard title="Completed Work" action={<Select ariaLabel="Throughput grouping" value={grouping} onChange={value => setGrouping(value as Grouping)} options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />}>{throughput.length ? <ThroughputChart buckets={throughput} onSelect={(date, count) => inspectMetric(`Completions · ${date}`, String(count), 'Unique completion events in the selected bucket.', count)} /> : <EmptyState kind="no-data">No completion events exist in this range.</EmptyState>}</SectionCard>}
      {tab === 'lead-time' && <SectionCard title="Lead Time Distribution" action={<Select ariaLabel="Lead time metric" value={metric} onChange={value => setMetric(value as LeadTimeMetric)} options={leadOptions} />}>{samples.length >= settings.minimumPercentileSamples ? <><LeadTimeHistogram values={sampleValues} onSelect={(start, end, count) => inspectMetric(`${formatDurationHours(start)} – ${formatDurationHours(end)}`, String(count), `Lead-time samples inside this histogram bucket for ${LEAD_OPTIONS.find(option => option.value === metric)?.label}.`, count)} /><div className="analytics-filterbar"><span>P50 <strong>{formatDurationHours(percentile(sampleValues, 50))}</strong></span><span>P75 <strong>{formatDurationHours(percentile(sampleValues, 75))}</strong></span><span>P90 <strong>{formatDurationHours(percentile(sampleValues, 90))}</strong></span><button type="button" className="analytics-button" onClick={() => inspectMetric('Lead-time outliers', String(detectOutliers(sampleValues).length), 'Samples beyond the Tukey upper fence.', detectOutliers(sampleValues).length)}>Outliers <strong>{detectOutliers(sampleValues).length}</strong></button><span>Samples <strong>{samples.length}</strong></span></div></> : <EmptyState kind="insufficient">Insufficient samples. {settings.minimumPercentileSamples} are required; {samples.length} are available.</EmptyState>}</SectionCard>}
    </>}
  </AnalyticsPage>;
}
