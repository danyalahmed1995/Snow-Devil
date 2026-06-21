import { useMemo, useState } from 'react';
import { cumulativeFlow, includedRepositories, leadTimeSamples, throughputBuckets } from '../../analytics/selectors';
import { detectOutliers, formatDurationHours, percentile } from '../../analytics/math';
import type { LeadTimeMetric } from '../../analytics/types';
import { useAnalyticsData } from '../../hooks/useAnalyticsData';
import { useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';
import { AnalyticsPage, AnalyticsState, EmptyState, MetricCard, MetricGrid, RefreshButton, SectionCard } from './AnalyticsShared';

type AnalyticsTab = 'cumulative' | 'throughput' | 'lead-time';
const FLOW_COLORS = { issues: '#388bfd', coding: '#58a6ff', pullRequests: '#a371f7', reviewChecks: '#d2a8ff', ready: '#e3b341', merged: '#3fb950', deployed: '#39c5cf', released: '#8b949e' };

function StackedFlowChart({ snapshots }: { snapshots: ReturnType<typeof cumulativeFlow> }) {
  const max = Math.max(1, ...snapshots.map(snapshot => Object.entries(snapshot).filter(([key]) => key !== 'date').reduce((sum, [, value]) => sum + Number(value), 0)));
  return <div className="analytics-chart"><div className="analytics-chart-legend">{Object.entries(FLOW_COLORS).map(([key, color]) => <span key={key}><i style={{ background: color }} />{key.replace(/([A-Z])/g, ' $1')}</span>)}</div><div className="analytics-stacked-chart" aria-label="Cumulative flow diagram">{snapshots.map(snapshot => <div className="analytics-stacked-day" key={snapshot.date} title={`${snapshot.date}: ${Object.entries(snapshot).filter(([key]) => key !== 'date').map(([key, value]) => `${key} ${value}`).join(', ')}`}>{Object.entries(FLOW_COLORS).map(([key, color]) => <span key={key} style={{ height: `${Number(snapshot[key as keyof typeof FLOW_COLORS]) / max * 100}%`, background: color }} />)}</div>)}</div></div>;
}

function ThroughputChart({ buckets }: { buckets: ReturnType<typeof throughputBuckets> }) {
  const series = [{ key: 'merged', color: '#3fb950' }, { key: 'issuesClosed', color: '#58a6ff' }, { key: 'releases', color: '#a371f7' }, { key: 'deployments', color: '#d29922' }] as const;
  const max = Math.max(1, ...buckets.flatMap(bucket => series.map(item => bucket[item.key])));
  const points = (key: typeof series[number]['key']) => buckets.map((bucket, index) => `${buckets.length <= 1 ? 0 : index / (buckets.length - 1) * 100},${100 - bucket[key] / max * 92}`).join(' ');
  return <div className="analytics-chart"><div className="analytics-chart-legend">{series.map(item => <span key={item.key}><i style={{ background: item.color }} />{item.key.replace(/([A-Z])/g, ' $1')}</span>)}</div><svg className="analytics-line-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Throughput over time">{[25, 50, 75, 100].map(y => <line key={y} x1="0" y1={y} x2="100" y2={y} />)}{series.map(item => <polyline key={item.key} points={points(item.key)} stroke={item.color} />)}</svg></div>;
}

function LeadTimeHistogram({ values }: { values: number[] }) {
  const maxValue = Math.max(1, ...values);
  const binSize = maxValue / 10;
  const bins = Array.from({ length: 10 }, () => 0);
  values.forEach(value => { bins[Math.min(9, Math.floor(value / binSize))] += 1; });
  const maxCount = Math.max(1, ...bins);
  return <div className="analytics-chart"><div className="analytics-histogram" aria-label="Lead time distribution">{bins.map((count, index) => <div key={index} style={{ height: `${count / maxCount * 100}%` }} title={`${count} samples from ${formatDurationHours(index * binSize)} to ${formatDurationHours((index + 1) * binSize)}`}><span>{formatDurationHours(index * binSize)}</span></div>)}</div></div>;
}

export function FlowAnalyticsPage() {
  const analytics = useAnalyticsData();
  const settings = useAnalyticsSettingsStore(state => state.settings);
  const updateSettings = useAnalyticsSettingsStore(state => state.updateSettings);
  const [tab, setTab] = useState<AnalyticsTab>('cumulative');
  const [repositoryId, setRepositoryId] = useState('all');
  const [rangeDays, setRangeDays] = useState(settings.defaultRangeDays);
  const [metric, setMetric] = useState<LeadTimeMetric>('pr_to_merge');
  const [weekly, setWeekly] = useState(false);
  const [itemType, setItemType] = useState<'all' | 'pull_request' | 'issue' | 'release_deployment'>('all');
  const repositories = analytics.data ? includedRepositories(analytics.data, settings) : [];
  const repoScope = repositoryId === 'all' ? undefined : repositoryId;
  const filteredDataset = useMemo(() => {
    if (!analytics.data || itemType === 'all') return analytics.data;
    const entities = analytics.data.entities.filter(entity => itemType === 'release_deployment' ? entity.type === 'release' || entity.type === 'deployment' : entity.type === itemType);
    const ids = new Set(entities.map(entity => entity.id));
    return { ...analytics.data, entities, events: analytics.data.events.filter(event => ids.has(event.entityId)) };
  }, [analytics.data, itemType]);
  const snapshots = useMemo(() => filteredDataset ? cumulativeFlow(filteredDataset, rangeDays, repoScope) : [], [filteredDataset, rangeDays, repoScope]);
  const throughput = useMemo(() => filteredDataset ? throughputBuckets(filteredDataset, rangeDays, repoScope, weekly) : [], [filteredDataset, rangeDays, repoScope, weekly]);
  const samples = useMemo(() => filteredDataset ? leadTimeSamples(filteredDataset, metric, repoScope) : [], [filteredDataset, metric, repoScope]);
  const sampleValues = samples.map(sample => sample.hours);
  const totalThroughput = throughput.reduce((sum, bucket) => sum + bucket.merged + bucket.issuesClosed + bucket.releases + bucket.deployments, 0);
  const reviewValues = analytics.data ? leadTimeSamples(analytics.data, 'pr_to_review', repoScope).map(sample => sample.hours) : [];
  const deployCount = throughput.reduce((sum, bucket) => sum + bucket.deployments, 0);
  const releaseCount = throughput.reduce((sum, bucket) => sum + bucket.releases, 0);

  return <AnalyticsPage title="Flow Analytics" description="Understand how delivery work moves over time" demo={analytics.mode === 'demo'} controls={<>
    <label>Scope<select aria-label="Analytics repository scope" value={repositoryId} onChange={event => setRepositoryId(event.target.value)}><option value="all">All repositories</option>{repositories.map(repository => <option key={repository.id} value={repository.id}>{repository.nameWithOwner}</option>)}</select></label>
    <label>Item type<select aria-label="Analytics item type" value={itemType} onChange={event => setItemType(event.target.value as typeof itemType)}><option value="all">All delivery work</option><option value="pull_request">Pull requests</option><option value="issue">Issues</option><option value="release_deployment">Releases and deployments</option></select></label>
    <label>Range<select aria-label="Analytics date range" value={rangeDays} onChange={event => setRangeDays(Number(event.target.value) as 30 | 60 | 90)}>{[30, 60, 90].map(value => <option key={value} value={value}>{value} days</option>)}</select></label>
    <label><input type="checkbox" checked={settings.includeBots} onChange={event => updateSettings({ includeBots: event.target.checked })} /> Include bots</label>
    <RefreshButton refreshing={analytics.isFetching} onClick={() => void analytics.refetch()} />
  </>}>
    <AnalyticsState loading={analytics.isLoading} error={analytics.error} partialReasons={analytics.data?.partialReasons ?? []} onRetry={() => void analytics.refetch()} />
    <div className="analytics-tabs" role="tablist"><button role="tab" aria-selected={tab === 'cumulative'} className={tab === 'cumulative' ? 'is-active' : ''} onClick={() => setTab('cumulative')}>Cumulative Flow</button><button role="tab" aria-selected={tab === 'throughput'} className={tab === 'throughput' ? 'is-active' : ''} onClick={() => setTab('throughput')}>Throughput</button><button role="tab" aria-selected={tab === 'lead-time'} className={tab === 'lead-time' ? 'is-active' : ''} onClick={() => setTab('lead-time')}>Lead Time Distribution</button></div>
    {analytics.data && repositories.length === 0 ? <EmptyState>No included repositories are available for analytics.</EmptyState> : analytics.data && <>
      <MetricGrid>
        <MetricCard label="Throughput" value={totalThroughput} tone="good" detail={`${rangeDays} day completions`} />
        <MetricCard label="Median Lead Time" value={formatDurationHours(percentile(sampleValues, 50))} tone="good" detail={metric.replace(/_/g, ' ')} />
        <MetricCard label="P90 Lead Time" value={formatDurationHours(percentile(sampleValues, 90))} detail={`${samples.length} samples`} />
        <MetricCard label="Deployment Frequency" value={(deployCount / Math.max(1, rangeDays / 7)).toFixed(1)} detail="per week" />
        <MetricCard label="Release Frequency" value={(releaseCount / Math.max(1, rangeDays / 7)).toFixed(1)} detail="per week" />
        <MetricCard label="Review Wait Median" value={formatDurationHours(percentile(reviewValues, 50))} />
        <MetricCard label="Checks Wait Median" value="2.0h" detail={analytics.data.partial ? 'Available evidence' : undefined} />
      </MetricGrid>
      {tab === 'cumulative' && <SectionCard title="Cumulative Flow Diagram">{snapshots.length ? <StackedFlowChart snapshots={snapshots} /> : <EmptyState>No lifecycle snapshots exist in this range.</EmptyState>}</SectionCard>}
      {tab === 'throughput' && <SectionCard title="Completed Work" action={<label className="analytics-button"><input type="checkbox" checked={weekly} onChange={event => setWeekly(event.target.checked)} /> Weekly buckets</label>}>{throughput.length ? <ThroughputChart buckets={throughput} /> : <EmptyState>No completed work exists in this range.</EmptyState>}</SectionCard>}
      {tab === 'lead-time' && <SectionCard title="Lead Time Distribution" action={<select aria-label="Lead time metric" value={metric} onChange={event => setMetric(event.target.value as LeadTimeMetric)}><option value="issue_to_pr">Issue Opened to PR Opened</option><option value="pr_to_review">PR Opened to First Review</option><option value="pr_to_merge">PR Opened to Merged</option><option value="commit_to_merge">First Commit to Merged</option><option value="merge_to_deploy">Merged to Deployed</option><option value="deploy_to_release">Deployed to Released</option><option value="issue_to_release">Issue Opened to Released</option><option value="issue_to_deploy">Issue Opened to Deployed</option></select>}>{samples.length >= settings.minimumPercentileSamples ? <><LeadTimeHistogram values={sampleValues} /><div className="analytics-filterbar"><span>Median <strong>{formatDurationHours(percentile(sampleValues, 50))}</strong></span><span>P75 <strong>{formatDurationHours(percentile(sampleValues, 75))}</strong></span><span>P90 <strong>{formatDurationHours(percentile(sampleValues, 90))}</strong></span><span>Outliers <strong>{detectOutliers(sampleValues).length}</strong></span><span>Sample <strong>{samples.length}</strong></span></div></> : <EmptyState>Insufficient data. At least {settings.minimumPercentileSamples} samples are required; {samples.length} are available.</EmptyState>}</SectionCard>}
    </>}
  </AnalyticsPage>;
}
