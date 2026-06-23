import { useMemo } from 'react';
import { AlertTriangle, Star } from 'lucide-react';
import { businessDaysBetween, calendarFromSettings } from '../../analytics/business-time';
import { includedRepositories, normalWip, timelineForEntity } from '../../analytics/selectors';
import type { DeliveryEntity } from '../../analytics/types';
import { useAnalyticsData } from '../../hooks/useAnalyticsData';
import { useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';
import { useFlowStore } from '../../stores/flow-store';
import { useTabsStore } from '../../stores/tabs-store';
import { AnalyticsPage, AnalyticsState, MetricCard, MetricGrid, RefreshButton, SectionCard } from './AnalyticsShared';

function isActive(entity: DeliveryEntity): boolean { return ['pull_request', 'issue', 'branch'].includes(entity.type) && !['merged', 'released', 'deployed', 'closed'].includes(entity.stage); }

export function PersonalFocusPage() {
  const analytics = useAnalyticsData();
  const settings = useAnalyticsSettingsStore(state => state.settings);
  const activeTabId = useTabsStore(state => state.activeTabId);
  const setTabState = useFlowStore(state => state.setTabState);
  const dataset = analytics.data;
  const repositoryIds = useMemo(() => new Set(dataset ? includedRepositories(dataset, settings).map(repository => repository.id) : []), [dataset, settings]);
  const active = useMemo(() => dataset ? dataset.entities.filter(entity => repositoryIds.has(entity.repositoryId) && isActive(entity) && (settings.includeDraftPullRequests || !entity.isDraft) && (settings.includeBots || !entity.isBot)) : [], [dataset, repositoryIds, settings.includeDraftPullRequests, settings.includeBots]);
  const calendar = calendarFromSettings(settings);
  const withAge = active.map(entity => ({ entity, age: dataset ? businessDaysBetween(entity.updatedAt, dataset.referenceDate, calendar) : 0 })).sort((a, b) => b.age - a.age);
  const awaitingYou = active.filter(entity => entity.reviewState === 'changes_requested' || entity.checkState === 'failure' || (entity.isDraft && businessDaysBetween(entity.updatedAt, dataset!.referenceDate, calendar) >= settings.inventoryThresholds.staleDays));
  const awaitingOthers = active.filter(entity => entity.reviewState === 'requested' || entity.checkState === 'running' || entity.checkState === 'queued');
  const usualWip = dataset ? normalWip(dataset) : 0;
  const aboveNormal = active.length > Math.max(usualWip + 1, Math.ceil(usualWip * 1.35));
  const failed = active.filter(entity => entity.checkState === 'failure');
  const drafts = withAge.filter(item => item.entity.isDraft);
  const requested = withAge.filter(item => item.entity.reviewState === 'requested');
  const recent = dataset?.events.slice().reverse().slice(0, 8) ?? [];
  const tip = failed.length ? `Address failed checks on ${failed[0].title}.` : awaitingYou.length ? `Finish ${awaitingYou[0].title}, the oldest action waiting on you.` : aboveNormal ? `Reduce parallel WIP by finishing ${withAge[0]?.entity.title ?? 'the oldest active item'}.` : withAge.length ? `Finish ${withAge[0].entity.title}, your oldest active item.` : 'No action is currently required.';
  const selectEntity = (entity: DeliveryEntity, reason: string) => dataset && setTabState(activeTabId, { selectedAnalyticsEntity: { id: `focus:${entity.id}`, kind: entity.type, title: entity.title, repositoryId: entity.repositoryId, number: entity.number, url: entity.url, state: entity.state, occurredAt: entity.updatedAt, reason, confidence: entity.sourceCompleteness === 'complete' ? 'exact' : 'inferred', evidence: entity.evidence, timeline: timelineForEntity(dataset, entity.id) } });

  return <AnalyticsPage title="Personal Focus" description="Your current work, aging signals, and evidence-backed actions" demo={analytics.mode === 'demo'} controls={<RefreshButton refreshing={analytics.isFetching} onClick={() => void analytics.refetch()} />}>
    <AnalyticsState loading={analytics.isLoading} error={analytics.error} partialReasons={dataset?.partialReasons ?? []} onRetry={() => void analytics.refetch()} />
    {dataset && <>
      <MetricGrid>
        <MetricCard label="Active Coding Items" value={active.filter(entity => entity.stage === 'coding').length} tone="good" detail={`${active.length} total active`} />
        <MetricCard label="PRs Awaiting You" value={awaitingYou.length} tone={awaitingYou.length ? 'danger' : 'neutral'} />
        <MetricCard label="PRs Awaiting Others" value={awaitingOthers.length} />
        <MetricCard label="Oldest Active Item" value={withAge.length ? `${Math.ceil(withAge[0].age)}d` : 'None'} tone={withAge[0]?.age >= settings.inventoryThresholds.staleDays ? 'danger' : 'neutral'} detail={withAge[0]?.entity.number ? `#${withAge[0].entity.number}` : undefined} />
        <MetricCard label="Oldest Draft PR" value={drafts.length ? `${Math.ceil(drafts[0].age)}d` : 'None'} tone={drafts[0]?.age >= settings.inventoryThresholds.staleDays ? 'danger' : 'neutral'} />
        <MetricCard label="Oldest Review Request" value={requested.length ? `${Math.ceil(requested[0].age)}d` : 'None'} tone="warning" />
        <MetricCard label="Failed Checks" value={failed.length} tone={failed.length ? 'danger' : 'good'} />
        <MetricCard label="Items Beyond Personal P90" value={withAge.filter(item => item.age >= settings.inventoryThresholds.staleDays).length} tone="warning" />
        <MetricCard label="Current Parallel WIP" value={active.length} detail={`Usual: ${usualWip}`} tone={aboveNormal ? 'danger' : 'good'} />
      </MetricGrid>
      <div className="analytics-focus-grid">
        <SectionCard title="Work in Progress"><div className="analytics-wip-meter"><p><span>Current active items</span><strong>{active.length}</strong></p><div className="analytics-wip-track"><span style={{ width: `${Math.min(100, active.length / Math.max(1, usualWip * 2) * 100)}%`, background: aboveNormal ? undefined : 'var(--success)' }} /></div><p><span>Your usual concurrent workload</span><strong>{usualWip}</strong></p>{aboveNormal && <p style={{ color: 'var(--danger)' }}><AlertTriangle size={11} /> Current WIP is meaningfully above your historical norm.</p>}</div><div className="analytics-list">{withAge.slice(0, 6).map(item => <button key={item.entity.id} type="button" onClick={() => selectEntity(item.entity, `${Math.ceil(item.age)} business days in ${item.entity.stage}`)}><span><strong>{item.entity.title}</strong><small>{item.entity.repositoryId} | {item.entity.stage}</small></span><time>{Math.ceil(item.age)}d</time></button>)}</div></SectionCard>
        <SectionCard title="Aging Items"><div className="analytics-list">{withAge.filter(item => item.age >= settings.inventoryThresholds.agingDays).slice(0, 7).map(item => <button key={item.entity.id} type="button" onClick={() => selectEntity(item.entity, item.age >= settings.inventoryThresholds.staleDays ? 'Beyond personal P90 age threshold' : 'Beyond fixed aging threshold')}><span><strong>{item.entity.title}</strong><small>{item.age >= settings.inventoryThresholds.staleDays ? 'Beyond personal P90' : 'Above normal stage age'} | {item.entity.repositoryId}</small></span><time style={{ color: item.age >= settings.inventoryThresholds.staleDays ? 'var(--danger)' : 'var(--warning)' }}>{Math.ceil(item.age)}d</time></button>)}</div></SectionCard>
        <SectionCard title="Recent Activity"><div className="analytics-list">{recent.map(event => <div key={event.id} className="analytics-activity-row"><span><strong>{event.type.replace(/_/g, ' ')}</strong><small>{event.repositoryId}</small></span><time>{new Date(event.occurredAt).toLocaleDateString()}</time></div>)}</div></SectionCard>
      </div>
      <div className="analytics-focus-tip"><Star size={17} color="var(--warning)" /><span><strong>Focus Tip</strong>{tip}</span></div>
    </>}
  </AnalyticsPage>;
}
