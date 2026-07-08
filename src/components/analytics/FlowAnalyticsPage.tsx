import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cumulativeFlow, includedRepositories, leadTimeSamples, throughputBuckets } from '../../analytics/selectors';
import { detectOutliers, formatDurationHours, percentile } from '../../analytics/math';
import type { AnalyticsInspectable, LeadTimeMetric } from '../../analytics/types';
import { useAnalyticsData } from '../../hooks/useAnalyticsData';
import { useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';
import { useCurrentTabId } from '../workspace/TabInstanceContext';
import { useFlowStore } from '../../stores/flow-store';
import { useTabsStore } from '../../stores/tabs-store';
import { AnalyticsPage, AnalyticsState, EmptyState, MetricCard, MetricGrid, RefreshButton, SectionCard, useAnalyticsTabRefresh } from './AnalyticsShared';
import { Select, type SelectOption } from '../ui/Select';
import { pairCheckTimings } from '../../analytics/check-timing';
import { isMaintainedRepository } from '../../lib/product-model';

type AnalyticsTab = 'cumulative' | 'throughput' | 'lead-time';
type Grouping = 'daily' | 'weekly' | 'monthly';
type RepositoryScope = 'maintained' | 'external' | 'selected' | 'single' | 'accessible';
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

const FLOW_KEYS = Object.keys(FLOW_COLORS) as Array<keyof typeof FLOW_COLORS>;
const FLOW_FALLBACK_WIDTH = 1000;
const FLOW_MIN_WIDTH = 320;
const FLOW_HEIGHT = 270;

export function responsiveFlowPlotWidth(containerWidth: number): number {
  return Number.isFinite(containerWidth) && containerWidth > 0 ? Math.max(FLOW_MIN_WIDTH, Math.floor(containerWidth)) : FLOW_FALLBACK_WIDTH;
}

function smoothLine(points: Array<{ x: number; y: number }>): string {
  if (points.length < 2) return points.length ? `M ${points[0].x} ${points[0].y}` : '';
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const before = points[index - 1] ?? current;
    const after = points[index + 2] ?? next;
    path += ` C ${current.x + (next.x - before.x) / 6} ${current.y + (next.y - before.y) / 6}, ${next.x - (after.x - current.x) / 6} ${next.y - (after.y - current.y) / 6}, ${next.x} ${next.y}`;
  }
  return path;
}

export function StackedFlowChart({ snapshots, partial, reducedMotion, onSelect }: { snapshots: ReturnType<typeof cumulativeFlow>; partial: boolean; reducedMotion: boolean; onSelect: (date: string, stage?: string) => void }) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(FLOW_FALLBACK_WIDTH);
  useLayoutEffect(() => {
    const element = plotRef.current;
    if (!element) return;
    const measure = () => setPlotWidth(current => {
      const next = responsiveFlowPlotWidth(element.getBoundingClientRect().width);
      return next === current ? current : next;
    });
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);
    void document.fonts?.ready.then(measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const visibleKeys = FLOW_KEYS.filter(key => !hidden.has(key));
  const totals = snapshots.map(snapshot => visibleKeys.reduce((sum, key) => sum + Number(snapshot[key]), 0));
  const max = Math.max(1, ...totals);
  const x = (index: number) => snapshots.length <= 1 ? 0 : index / (snapshots.length - 1) * plotWidth;
  const y = (value: number) => FLOW_HEIGHT - value / max * FLOW_HEIGHT;
  const layers = visibleKeys.map((key, keyIndex) => {
    const bottom = snapshots.map((snapshot, index) => ({ x: x(index), y: y(visibleKeys.slice(0, keyIndex).reduce((sum, previous) => sum + Number(snapshot[previous]), 0)) }));
    const top = snapshots.map((snapshot, index) => ({ x: x(index), y: y(visibleKeys.slice(0, keyIndex + 1).reduce((sum, previous) => sum + Number(snapshot[previous]), 0)) }));
    const topPath = smoothLine(top);
    const bottomPath = [...bottom].reverse().map(point => `L ${point.x} ${point.y}`).join(' ');
    return { key, path: `${topPath} ${bottomPath} Z` };
  });
  const active = activeIndex == null ? undefined : snapshots[activeIndex];
  const ticks = snapshots.filter((_, index) => index === 0 || index === snapshots.length - 1 || index % Math.max(1, Math.floor(snapshots.length / 4)) === 0);
  return <div className={`analytics-chart analytics-area-chart ${reducedMotion ? 'is-reduced-motion' : ''}`}>
    <div className="analytics-chart-legend" aria-label="Cumulative flow stage visibility">{FLOW_KEYS.map(key => <button key={key} type="button" aria-pressed={!hidden.has(key)} onClick={() => setHidden(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; })} onDoubleClick={() => onSelect(snapshots[snapshots.length - 1]?.date ?? '', key)}><i style={{ background: FLOW_COLORS[key] }} />{key.replace(/([A-Z])/g, ' $1')}</button>)}</div>
    <div className="analytics-area-plot" ref={plotRef} data-plot-width={plotWidth}><div className="analytics-axis-y"><span>{max}</span><span>Items</span><span>0</span></div><svg width={plotWidth} height={FLOW_HEIGHT} viewBox={`0 0 ${plotWidth} ${FLOW_HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={`Cumulative flow occupancy over ${snapshots.length} days. ${partial ? 'Coverage is partial.' : 'Coverage is complete.'}`} onPointerLeave={() => setActiveIndex(null)}>
      <defs>{FLOW_KEYS.map(key => <linearGradient id={`flow-${key}`} key={key} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={FLOW_COLORS[key]} stopOpacity=".88"/><stop offset="1" stopColor={FLOW_COLORS[key]} stopOpacity=".38"/></linearGradient>)}</defs>
      {[0, .25, .5, .75, 1].map(value => <line className="analytics-area-grid" key={value} x1="0" x2={plotWidth} y1={FLOW_HEIGHT * value} y2={FLOW_HEIGHT * value}/>) }
      {layers.map(layer => <path key={layer.key} className="analytics-area-layer" d={layer.path} fill={`url(#flow-${layer.key})`} stroke={FLOW_COLORS[layer.key]} />)}
      {snapshots.map((snapshot, index) => <rect key={snapshot.date} className="analytics-area-hit" x={Math.max(0, x(index) - plotWidth / snapshots.length / 2)} y="0" width={plotWidth / snapshots.length + 1} height={FLOW_HEIGHT} tabIndex={0} role="button" aria-label={`${snapshot.date}: ${visibleKeys.map(key => `${key} ${snapshot[key]}`).join(', ')}`} onPointerEnter={() => setActiveIndex(index)} onFocus={() => setActiveIndex(index)} onClick={() => onSelect(snapshot.date)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(snapshot.date); } }} />)}
      {activeIndex != null && <line className="analytics-area-crosshair" x1={x(activeIndex)} x2={x(activeIndex)} y1="0" y2={FLOW_HEIGHT}/>}
    </svg>{active && <div className="analytics-area-tooltip" style={{ left: `${Math.min(100 - Math.max(4, 82 / plotWidth * 100), Math.max(Math.max(4, 82 / plotWidth * 100), activeIndex! / Math.max(1, snapshots.length - 1) * 100))}%` }}><strong>{new Date(`${active.date}T00:00:00Z`).toLocaleDateString()}</strong>{visibleKeys.map(key => <span key={key}><i style={{ background: FLOW_COLORS[key] }}/>{key.replace(/([A-Z])/g, ' $1')} <b>{active[key]}</b></span>)}</div>}</div>
    <div className="analytics-axis-x">{ticks.map(snapshot => <span key={snapshot.date}>{snapshot.date.slice(5)}</span>)}</div><p className="analytics-chart-note">End-of-day unique work-item stage occupancy. Toggle stages with the keyboard; select a date to inspect its records.{partial ? ' Gaps and incomplete sources are disclosed in coverage.' : ''}</p>
  </div>;
}

function ThroughputChart({ buckets, onSelect }: { buckets: ReturnType<typeof throughputBuckets>; onSelect: (date: string, count: number) => void }) {
  const max = Math.max(1, ...buckets.map(bucket => bucket.merged + bucket.issuesClosed + bucket.releases + bucket.deployments));
  return <div className="analytics-chart"><div className="analytics-chart-legend"><span><i style={{ background: 'var(--success)' }} />Unique completion events</span></div><div className="analytics-throughput-bars" role="img" aria-label="Throughput over time">{buckets.map(bucket => { const total = bucket.merged + bucket.issuesClosed + bucket.releases + bucket.deployments; return <button type="button" key={bucket.date} style={{ height: `${Math.max(2, total / max * 100)}%` }} data-tooltip={`${bucket.date}: ${total} unique completion events\nSelect to inspect this throughput bucket.`} onClick={() => onSelect(bucket.date, total)}><span>{total}</span></button>; })}</div><div className="analytics-axis-x"><span>{buckets[0]?.date.slice(5)}</span><span>Completion count</span><span>{buckets[buckets.length - 1]?.date.slice(5)}</span></div></div>;
}

function LeadTimeHistogram({ values, onSelect }: { values: number[]; onSelect: (start: number, end: number, count: number) => void }) {
  const maxValue = Math.max(1, ...values);
  const binSize = maxValue / 10;
  const bins = Array.from({ length: 10 }, () => 0);
  values.forEach(value => { bins[Math.min(9, Math.floor(value / binSize))] += 1; });
  const maxCount = Math.max(1, ...bins);
  return <div className="analytics-chart"><div className="analytics-histogram" aria-label="Lead time distribution">{bins.map((count, index) => <button type="button" key={index} style={{ height: `${Math.max(2, count / maxCount * 100)}%` }} data-tooltip={`${count} samples from ${formatDurationHours(index * binSize)} to ${formatDurationHours((index + 1) * binSize)}\nSelect to inspect this lead-time bucket.`} onClick={() => onSelect(index * binSize, (index + 1) * binSize, count)}><span>{formatDurationHours(index * binSize)}</span></button>)}</div></div>;
}

export function FlowAnalyticsPage() {
  const activeTabId = useCurrentTabId();
  const isActive = useTabsStore(state => state.activeTabId === activeTabId);
  const analytics = useAnalyticsData({ enabled: isActive });
  useAnalyticsTabRefresh(analytics.refetch);
  const settings = useAnalyticsSettingsStore(state => state.settings);
  const updateSettings = useAnalyticsSettingsStore(state => state.updateSettings);
  const setTabState = useFlowStore(state => state.setTabState);
  const [tab, setTab] = useState<AnalyticsTab>('cumulative');
  const [repositoryId, setRepositoryId] = useState('all');
  const [scopeMode, setScopeMode] = useState<RepositoryScope>('maintained');
  const [rangeChoice, setRangeChoice] = useState(String(settings.defaultRangeDays));
  const [customStart, setCustomStart] = useState(() => new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const rangeDays = rangeChoice === 'custom' ? Math.max(1, Math.ceil((new Date(customEnd).getTime() - new Date(customStart).getTime()) / 86400000) + 1) : Number(rangeChoice);
  const [metric, setMetric] = useState<LeadTimeMetric>('pr_to_merge');
  const [grouping, setGrouping] = useState<Grouping>('daily');
  const [itemType, setItemType] = useState<'all' | 'pull_request' | 'issue' | 'release_deployment'>('all');
  const repositories = analytics.data ? includedRepositories(analytics.data, settings) : [];
  const maintainedRepositories = repositories.filter(repository => isMaintainedRepository({ viewerPermission: repository.viewerPermission }) && !repository.archived && !repository.template && !repository.empty);
  const selectedRepositoryIds = new Set(settings.includedRepositories);
  const selectedRepositories = scopeMode === 'single' ? repositories.filter(repository => repository.id === repositoryId)
    : scopeMode === 'selected' ? repositories.filter(repository => selectedRepositoryIds.has(repository.id))
    : scopeMode === 'accessible' ? repositories
    : scopeMode === 'external' ? repositories.filter(repository => !isMaintainedRepository({ viewerPermission: repository.viewerPermission }))
    : maintainedRepositories;
  const scopedRepositoryIds = new Set(selectedRepositories.map(repository => repository.id));
  const repoScope = scopeMode === 'single' && repositoryId !== 'all' ? repositoryId : undefined;
  const filteredDataset = (() => {
    if (!analytics.data) return undefined;
    let entities = analytics.data.entities.filter(entity => scopedRepositoryIds.has(entity.repositoryId) && (settings.analyticsIncludeBots || !entity.isBot));
    if (scopeMode === 'external') entities = entities.filter(entity => entity.viewerRelationship?.flags.includes('submitted_upstream_by_viewer'));
    if (itemType !== 'all') entities = entities.filter(entity => itemType === 'release_deployment' ? entity.type === 'release' || entity.type === 'deployment' : entity.type === itemType);
    const ids = new Set(entities.map(entity => entity.id));
    return { ...analytics.data, entities, events: analytics.data.events.filter(event => ids.has(event.entityId)) };
  })();
  const snapshots = useMemo(() => filteredDataset ? cumulativeFlow(filteredDataset, rangeDays, repoScope) : [], [filteredDataset, rangeDays, repoScope]);
  const groupingSpan = grouping === 'daily' ? 1 : grouping === 'weekly' ? 7 : 30;
  const throughput = useMemo(() => filteredDataset ? throughputBuckets(filteredDataset, rangeDays, repoScope, groupingSpan) : [], [filteredDataset, rangeDays, repoScope, groupingSpan]);
  const samples = useMemo(() => filteredDataset ? leadTimeSamples(filteredDataset, metric, repoScope) : [], [filteredDataset, metric, repoScope]);
  const sampleValues = samples.map(sample => sample.hours);
  const totalThroughput = throughput.reduce((sum, bucket) => sum + bucket.merged + bucket.issuesClosed + bucket.releases + bucket.deployments, 0);
  const reviewValues = filteredDataset ? leadTimeSamples(filteredDataset, 'pr_to_review', repoScope).map(sample => sample.hours) : [];
  const checkTiming = useMemo(() => pairCheckTimings((filteredDataset?.events ?? []).filter(event => !repoScope || event.repositoryId === repoScope)), [filteredDataset?.events, repoScope]);
  const checkValues = checkTiming.samples.map(sample => sample.durationHours);
  const deployCount = throughput.reduce((sum, bucket) => sum + bucket.deployments, 0);
  const releaseCount = throughput.reduce((sum, bucket) => sum + bucket.releases, 0);
  const deploymentAvailable = selectedRepositories.some(repository => repository.deploymentMatching);
  const releaseAvailable = selectedRepositories.some(repository => repository.releaseMatching);
  const inspect = (value: AnalyticsInspectable) => setTabState(activeTabId, { selectedAnalyticsEntity: value });
  const inspectMetric = (title: string, state: string, definition: string, sampleCount: number, excludedCount = 0) => inspect({ id: `analytics:${title}`, kind: 'flow_analytics', title, state, reason: definition, definition, sampleCount, excludedCount, coverage: filteredDataset?.partial ? 'partial' : 'complete', confidence: filteredDataset?.partial ? 'partial' : 'exact', lineage:{formula:definition,numerator:state,denominator:`${sampleCount} qualifying samples`,includedEntityTypes:itemType==='all'?['issue','pull request','release','deployment']:[itemType.replace('_',' / ')],excludedEntityTypes:['entities outside selected range','incomplete pairs','bot work when excluded'],repositoriesIncluded:selectedRepositories.map(repository=>repository.nameWithOwner),failedOrSkipped:filteredDataset?.partialReasons??[],coverageStart:new Date(new Date(filteredDataset?.referenceDate??0).getTime()-(rangeDays-1)*86400000).toISOString(),coverageEnd:filteredDataset?.referenceDate,sampleCount,excludedOrIncompleteCount:excludedCount,timeBasis:title.includes('Lead')||title.includes('Wait')?'business':'event timestamp',confidence:filteredDataset?.partial?'partial':'exact',evidenceSources:['normalized GitHub lifecycle events','explicit timestamps','configured lineage matching']} });
  const leadOptions = LEAD_OPTIONS.map(option => {
    const needsRelease = ['release_to_deploy', 'issue_to_release'].includes(option.value);
    const needsDeploy = ['merge_to_deploy', 'release_to_deploy', 'issue_to_deploy'].includes(option.value);
    const disabled = needsRelease && !releaseAvailable || needsDeploy && !deploymentAvailable;
    return { ...option, disabled, disabledReason: disabled ? 'The selected repository scope has no supporting release/deployment evidence.' : undefined };
  });

  return <AnalyticsPage title="Flow Analytics" description="Explainable unique work-item flow, completion, and lead-time evidence" demo={analytics.mode === 'demo'} controls={<>
    <label>Scope<Select ariaLabel="Analytics repository scope" value={scopeMode} onChange={value => setScopeMode(value as RepositoryScope)} options={[{ value: 'maintained', label: 'Repositories I maintain' }, { value: 'external', label: 'My external contributions' }, { value: 'selected', label: 'Selected repositories' }, { value: 'single', label: 'Single repository' }, { value: 'accessible', label: 'All accessible repositories', description: 'Advanced exploratory scope' }]} /></label>
    {scopeMode === 'single' && <label>Repository<Select ariaLabel="Analytics single repository" searchable value={repositoryId} onChange={setRepositoryId} options={repositories.map(repository => ({ value: repository.id, label: repository.nameWithOwner }))} /></label>}
    <label>Work type<Select ariaLabel="Analytics work type" value={itemType} onChange={value => setItemType(value as typeof itemType)} options={[{ value: 'all', label: 'All delivery work' }, { value: 'pull_request', label: 'Pull requests' }, { value: 'issue', label: 'Issues' }, { value: 'release_deployment', label: 'Releases and deployments' }]} /></label>
    <label>Range<Select ariaLabel="Analytics date range" value={rangeChoice} onChange={setRangeChoice} options={[30, 60, 90].map(value => ({ value: String(value), label: `${value} days` })).concat([{ value: 'custom', label: 'Custom range' }])} /></label>
    {rangeChoice === 'custom' && <><input aria-label="Analytics range start" type="date" max={customEnd} value={customStart} onChange={event => setCustomStart(event.target.value)} /><input aria-label="Analytics range end" type="date" min={customStart} value={customEnd} onChange={event => setCustomEnd(event.target.value)} /></>}
    <label><input type="checkbox" checked={settings.analyticsIncludeBots} onChange={event => updateSettings({ analyticsIncludeBots: event.target.checked })} /> Include bot-authored work</label>
    <RefreshButton refreshing={analytics.isFetching} onClick={() => void analytics.refetch()} />
  </>}>
    <AnalyticsState label="Analytics coverage" loading={analytics.isLoading} error={analytics.error} partialReasons={analytics.data?.partialReasons ?? []} onRetry={() => void analytics.refetch()} />
    {analytics.data && <p className="analytics-dataset-summary"><strong>{selectedRepositories.length} {scopeMode === 'maintained' ? 'maintained ' : ''}repositor{selectedRepositories.length === 1 ? 'y' : 'ies'}</strong> · {filteredDataset?.entities.length ?? 0} qualifying work items · {rangeDays}-day period <span>{[!settings.includeForks && 'fork repositories', !settings.includeArchived && 'archived repositories', !settings.analyticsIncludeBots && 'bot-authored work', filteredDataset?.partial && 'incomplete histories'].filter(Boolean).join(', ') || 'No configured exclusions'} excluded or disclosed</span></p>}
    <div className="analytics-tabs" role="tablist"><button role="tab" aria-selected={tab === 'cumulative'} className={tab === 'cumulative' ? 'is-active' : ''} onClick={() => setTab('cumulative')}>Cumulative Flow</button><button role="tab" aria-selected={tab === 'throughput'} className={tab === 'throughput' ? 'is-active' : ''} onClick={() => setTab('throughput')}>Throughput</button><button role="tab" aria-selected={tab === 'lead-time'} className={tab === 'lead-time' ? 'is-active' : ''} onClick={() => setTab('lead-time')}>Lead Time Distribution</button></div>
    {analytics.data && repositories.length === 0 ? <EmptyState kind="unavailable">No included repositories are available for analytics.</EmptyState> : analytics.data && <>
      <MetricGrid>
        <MetricCard label="Unique Completion Events" value={totalThroughput} tone="good" detail={`${rangeDays} day range`} title="Unique issue closures, PR merges, releases, and deployments. Types are shown separately and are not called delivered work." onClick={() => inspectMetric('Unique Completion Events', String(totalThroughput), 'Unique completion events by entity and event type. A PR, release, and deployment remain separate completion events.', totalThroughput)} />
        <MetricCard label="Median Lead Time" value={formatDurationHours(percentile(sampleValues, 50))} tone="good" detail={`${samples.length} qualifying samples`} onClick={() => inspectMetric('Median Lead Time', formatDurationHours(percentile(sampleValues, 50)), `Median ${LEAD_OPTIONS.find(option => option.value === metric)?.label}.`, samples.length)} />
        <MetricCard label="P90 Lead Time" value={formatDurationHours(percentile(sampleValues, 90))} detail={`${samples.length} qualifying samples`} onClick={() => inspectMetric('P90 Lead Time', formatDurationHours(percentile(sampleValues, 90)), `90th percentile ${LEAD_OPTIONS.find(option => option.value === metric)?.label}.`, samples.length)} />
        <MetricCard label="Deployment Frequency" value={deploymentAvailable ? `${(deployCount / Math.max(1, rangeDays / 7)).toFixed(1)}/wk` : 'Unavailable'} detail={deploymentAvailable ? `${deployCount} deployments` : 'Deployment evidence missing'} onClick={() => inspectMetric('Deployment Frequency', deploymentAvailable ? `${(deployCount / Math.max(1, rangeDays / 7)).toFixed(1)}/wk` : 'Unavailable', 'Successful deployment completion events per week. Unavailable when deployment evidence is unsupported.', deployCount)} />
        <MetricCard label="Release Frequency" value={releaseAvailable ? `${(releaseCount / Math.max(1, rangeDays / 7)).toFixed(1)}/wk` : 'Unavailable'} detail={releaseAvailable ? `${releaseCount} releases` : 'Release evidence missing'} onClick={() => inspectMetric('Release Frequency', releaseAvailable ? `${(releaseCount / Math.max(1, rangeDays / 7)).toFixed(1)}/wk` : 'Unavailable', 'Published release events per week.', releaseCount)} />
        <MetricCard label="First Review Wait" value={formatDurationHours(percentile(reviewValues, 50))} detail={`${reviewValues.length} PR-open → first-review samples`} onClick={() => inspectMetric('First Review Wait', formatDurationHours(percentile(reviewValues, 50)), 'Median elapsed time from PR opened to first observed review. Review-request timestamps are not complete enough to claim request-to-review.', reviewValues.length)} />
        <MetricCard label="Checks Wait Median" value={checkValues.length ? formatDurationHours(percentile(checkValues, 50)) : 'Unavailable'} detail={checkValues.length ? `${checkValues.length} exact run pairs · ${checkTiming.excludedCount} excluded` : `${checkTiming.excludedCount} incomplete runs excluded`} onClick={() => inspectMetric('Checks Wait Median', checkValues.length ? formatDurationHours(percentile(checkValues, 50)) : 'Unavailable', 'Median elapsed time from a check run start to its terminal event. Each sample requires the same check-run identity and valid ordered timestamps; reruns remain distinct.', checkValues.length, checkTiming.excludedCount)} />
        <MetricCard label="Checks Wait P90" value={checkValues.length >= settings.minimumPercentileSamples ? formatDurationHours(percentile(checkValues, 90)) : 'Unavailable'} detail={checkValues.length >= settings.minimumPercentileSamples ? `${checkValues.length} exact run pairs` : `${settings.minimumPercentileSamples} samples required`} onClick={() => inspectMetric('Checks Wait P90', checkValues.length >= settings.minimumPercentileSamples ? formatDurationHours(percentile(checkValues, 90)) : 'Unavailable', '90th percentile elapsed time for exact check-run start/completion pairs. Hidden below the configured minimum sample threshold.', checkValues.length, checkTiming.excludedCount)} />
      </MetricGrid>
      {tab === 'cumulative' && <SectionCard title="Cumulative Flow">{snapshots.length ? <StackedFlowChart snapshots={snapshots} partial={Boolean(filteredDataset?.partial)} reducedMotion={settings.reducedMotion} onSelect={(date, stage) => inspectMetric(`Flow snapshot · ${date}${stage ? ` · ${stage}` : ''}`, date, stage ? `End-of-day ${stage.replace(/([A-Z])/g, ' $1')} occupancy.` : 'End-of-day unique work-item lifecycle occupancy.', snapshots.reduce((sum, snapshot) => sum + Object.values(snapshot).filter(value => typeof value === 'number').reduce((subtotal, value) => subtotal + Number(value), 0), 0))} /> : <EmptyState kind="no-data">No lifecycle snapshots exist in this scope and range.</EmptyState>}</SectionCard>}
      {tab === 'throughput' && <SectionCard title="Completed Work" action={<Select ariaLabel="Throughput grouping" value={grouping} onChange={value => setGrouping(value as Grouping)} options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />}>{throughput.length ? <ThroughputChart buckets={throughput} onSelect={(date, count) => inspectMetric(`Completions · ${date}`, String(count), 'Unique completion events in the selected bucket.', count)} /> : <EmptyState kind="no-data">No completion events exist in this range.</EmptyState>}</SectionCard>}
      {tab === 'lead-time' && <SectionCard title="Lead Time Distribution" action={<Select ariaLabel="Lead time metric" value={metric} onChange={value => setMetric(value as LeadTimeMetric)} options={leadOptions} />}>{samples.length >= settings.minimumPercentileSamples ? <><LeadTimeHistogram values={sampleValues} onSelect={(start, end, count) => inspectMetric(`${formatDurationHours(start)} – ${formatDurationHours(end)}`, String(count), `Lead-time samples inside this histogram bucket for ${LEAD_OPTIONS.find(option => option.value === metric)?.label}.`, count)} /><div className="analytics-filterbar"><span>P50 <strong>{formatDurationHours(percentile(sampleValues, 50))}</strong></span><span>P75 <strong>{formatDurationHours(percentile(sampleValues, 75))}</strong></span><span>P90 <strong>{formatDurationHours(percentile(sampleValues, 90))}</strong></span><button type="button" className="analytics-button" onClick={() => inspectMetric('Lead-time outliers', String(detectOutliers(sampleValues).length), 'Samples beyond the Tukey upper fence.', detectOutliers(sampleValues).length)}>Outliers <strong>{detectOutliers(sampleValues).length}</strong></button><span>Samples <strong>{samples.length}</strong></span></div></> : <EmptyState kind="insufficient">Insufficient samples. {settings.minimumPercentileSamples} are required; {samples.length} are available.</EmptyState>}</SectionCard>}
    </>}
  </AnalyticsPage>;
}
