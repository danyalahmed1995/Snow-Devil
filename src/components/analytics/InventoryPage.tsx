import { useEffect, useMemo, useState } from 'react';
import { ageBandCounts, includedRepositories, inventoryInspectable, inventoryItems } from '../../analytics/selectors';
import { median } from '../../analytics/math';
import type { AgeBand } from '../../analytics/types';
import { matchesStructuredSearch } from '../../lib/structured-search';
import { classifyActor } from '../../lib/delivery-semantics';
import { useAnalyticsData } from '../../hooks/useAnalyticsData';
import { useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';
import { useFlowStore } from '../../stores/flow-store';
import { useTabsStore } from '../../stores/tabs-store';
import { AnalyticsPage, AnalyticsState, EmptyState, MetricCard, MetricGrid, RefreshButton, SectionCard, useAnalyticsTabRefresh } from './AnalyticsShared';
import { Select } from '../ui/Select';

type InventoryView = 'all' | 'blocked' | 'failing' | 'waiting_review' | 'closed_unmerged' | 'disconnected';

function label(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export function InventoryPage() {
  const analytics = useAnalyticsData();
  useAnalyticsTabRefresh(analytics.refetch);
  const settings = useAnalyticsSettingsStore(state => state.settings);
  const activeTabId = useTabsStore(state => state.activeTabId);
  const setTabState = useFlowStore(state => state.setTabState);
  const selectedId = useFlowStore(state => state.getTabState(activeTabId).selectedAnalyticsEntity?.id);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<InventoryView>('all');
  const [stage, setStage] = useState('all');
  const [ageBand, setAgeBand] = useState<'all' | AgeBand>('all');
  const [repositoryId, setRepositoryId] = useState('all');
  const [actor, setActor] = useState<'humans' | 'include_bots' | 'bots'>('humans');
  const [sort, setSort] = useState<'age_desc' | 'age_asc' | 'activity_desc' | 'title'>('age_desc');
  const effectiveSettings = useMemo(() => ({ ...settings, includeBots: actor !== 'humans', includeDependabot: actor !== 'humans', includeRenovate: actor !== 'humans', includeOtherBots: actor !== 'humans' }), [actor, settings]);
  const items = useMemo(() => analytics.data ? inventoryItems(analytics.data, effectiveSettings) : [], [analytics.data, effectiveSettings]);
  const repositories = analytics.data ? includedRepositories(analytics.data, settings) : [];
  const visible = useMemo(() => items.filter(item => {
    const actorType = item.entity.actorClassification ?? classifyActor(item.entity.author, item.entity.isBot);
    if (actor === 'bots' && !['dependabot', 'renovate', 'other_bot'].includes(actorType)) return false;
    if (view === 'blocked' && !['checks_failing', 'checks_waiting', 'changes_requested', 'waiting_for_review'].includes(item.type)) return false;
    if (view === 'failing' && item.type !== 'checks_failing') return false;
    if (view === 'waiting_review' && item.type !== 'waiting_for_review') return false;
    if (view === 'closed_unmerged' && item.type !== 'closed_unmerged') return false;
    if (view === 'disconnected' && item.relatedEntityIds.length > 0) return false;
    return (stage === 'all' || item.stage === stage)
      && (ageBand === 'all' || item.ageBand === ageBand)
      && (repositoryId === 'all' || item.repository.id === repositoryId)
      && matchesStructuredSearch({
        title: item.entity.title,
        repository: item.repository.nameWithOwner,
        number: item.entity.number,
        author: item.entity.author,
        type: item.entityType,
        reason: item.inventoryReason,
        stage: item.stage,
        confidence: item.confidence,
        related: item.relatedEntityIds,
        ageDays: item.ageBusinessDays,
        checks: item.entity.checkState,
        review: item.entity.reviewState,
        branch: item.entity.branchName,
      }, search);
  }).sort((a, b) => sort === 'age_desc' ? b.ageBusinessDays - a.ageBusinessDays : sort === 'age_asc' ? a.ageBusinessDays - b.ageBusinessDays : sort === 'activity_desc' ? b.lastActivityAt.localeCompare(a.lastActivityAt) : a.entity.title.localeCompare(b.entity.title)), [actor, ageBand, items, repositoryId, search, sort, stage, view]);
  const counts = ageBandCounts(items);
  const ages = items.map(item => item.ageBusinessDays);

  useEffect(() => {
    if (selectedId?.startsWith('inventory:') && !visible.some(item => item.id === selectedId)) setTabState(activeTabId, { selectedAnalyticsEntity: undefined });
  }, [activeTabId, selectedId, setTabState, visible]);

  return <AnalyticsPage title="Delivery Inventory" description="Unique actionable work items with aggregated delivery evidence" demo={analytics.mode === 'demo'} controls={<>
    <label>View<Select ariaLabel="Inventory view" value={view} onChange={value => setView(value as InventoryView)} options={[
      { value: 'all', label: 'All inventory' },
      { value: 'blocked', label: 'Blocked' },
      { value: 'failing', label: 'Failing checks' },
      { value: 'waiting_review', label: 'Waiting for review' },
      { value: 'closed_unmerged', label: 'Closed without merge' },
      { value: 'disconnected', label: 'Disconnected work' },
    ]} /></label>
    <label>Repository<Select ariaLabel="Inventory repository" searchable value={repositoryId} onChange={setRepositoryId} options={[{ value: 'all', label: 'All repositories' }, ...repositories.map(repository => ({ value: repository.id, label: repository.nameWithOwner }))]} /></label>
    <label>Actor<Select ariaLabel="Inventory actor" value={actor} onChange={value => setActor(value as typeof actor)} options={[{ value: 'humans', label: 'Humans only' }, { value: 'include_bots', label: 'Include bots' }, { value: 'bots', label: 'Bots only' }]} /></label>
    <RefreshButton refreshing={analytics.isFetching} onClick={() => void analytics.refetch()} />
  </>}>
    <AnalyticsState label="Inventory coverage" loading={analytics.isLoading} error={analytics.error} partialReasons={analytics.data?.partialReasons ?? []} onRetry={() => void analytics.refetch()} />
    {analytics.data && <>
      <MetricGrid>
        <MetricCard label="In Flight" value={counts.in_flight} tone="good" detail={`0–${settings.inventoryThresholds.agingDays - 1} business days`} />
        <MetricCard label="Aging" value={counts.aging} tone="warning" detail={`${settings.inventoryThresholds.agingDays}–${settings.inventoryThresholds.staleDays - 1} business days`} />
        <MetricCard label="Stale" value={counts.stale} tone="danger" detail={`${settings.inventoryThresholds.staleDays}+ business days`} />
        <MetricCard label="Unique Inventory" value={items.length} detail="Repeated evidence is aggregated" />
        <MetricCard label="Oldest Item" value={ages.length ? `${Math.ceil(Math.max(...ages))}d` : 'No items'} />
        <MetricCard label="Median Age" value={median(ages) == null ? 'Unavailable' : `${Math.ceil(median(ages)!)}d`} />
      </MetricGrid>
      <SectionCard title="Inventory Items" action={<span className="analytics-status analytics-status--healthy">{visible.length} of {items.length}</span>}>
        <div className="analytics-filterbar">
          <input aria-label="Search inventory" value={search} onChange={event => setSearch(event.target.value)} placeholder={'Search or use repo:, type:, reason:, stage:, confidence:, age:>10d…'} />
          <Select ariaLabel="Inventory stage" value={stage} onChange={setStage} options={[{ value: 'all', label: 'All stages' }, ...Array.from(new Set(items.map(item => item.stage))).map(value => ({ value, label: label(value) }))]} />
          <Select ariaLabel="Inventory age band" value={ageBand} onChange={value => setAgeBand(value as 'all' | AgeBand)} options={[{ value: 'all', label: 'All ages' }, { value: 'in_flight', label: 'In flight' }, { value: 'aging', label: 'Aging' }, { value: 'stale', label: 'Stale' }]} />
          <Select ariaLabel="Inventory sort" value={sort} onChange={value => setSort(value as typeof sort)} options={[{ value: 'age_desc', label: 'Oldest first' }, { value: 'age_asc', label: 'Newest first' }, { value: 'activity_desc', label: 'Recent activity' }, { value: 'title', label: 'Item title' }]} />
        </div>
        {visible.length === 0 ? <EmptyState kind="zero">Zero inventory items match the current filters.</EmptyState> : <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Item</th><th>Repository</th><th>Entity type</th><th>Current stage</th><th>Inventory reason</th><th>Age</th><th>Last activity</th><th>Related entity</th><th>Confidence</th></tr></thead><tbody>{visible.map(item => <tr key={item.id} className={selectedId === item.id ? 'is-selected' : ''} onClick={() => setTabState(activeTabId, { selectedAnalyticsEntity: inventoryInspectable(analytics.data!, item) })}><td>{item.entity.number ? `#${item.entity.number} ` : ''}{item.entity.title || `Unlinked ${label(item.entityType)}`}</td><td>{item.repository.nameWithOwner}</td><td>{label(item.entityType)}</td><td>{label(item.stage)}</td><td title={item.inventoryReason}>{item.inventoryReason}</td><td><span className={`analytics-age-badge analytics-age-badge--${item.ageBand}`}>{Math.ceil(item.ageBusinessDays)}d</span></td><td>{new Date(item.lastActivityAt).toLocaleDateString()}</td><td>{item.relatedEntityIds.length ? `${item.relatedEntityIds.length} linked` : 'None'}</td><td>{label(item.confidence)}</td></tr>)}</tbody></table></div>}
      </SectionCard>
    </>}
  </AnalyticsPage>;
}
