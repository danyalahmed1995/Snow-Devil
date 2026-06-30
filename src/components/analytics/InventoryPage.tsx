import { useEffect, useMemo, useState } from 'react';
import { ageBandCounts, includedRepositories, inventoryInspectable, inventoryItems } from '../../analytics/selectors';
import { median } from '../../analytics/math';
import type { AgeBand } from '../../analytics/types';
import { matchesStructuredSearch } from '../../lib/structured-search';
import { classifyActor } from '../../lib/delivery-semantics';
import { isMaintainedRepository } from '../../lib/product-model';
import { useAnalyticsData } from '../../hooks/useAnalyticsData';
import { useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';
import { useFlowStore } from '../../stores/flow-store';
import { AnalyticsPage, AnalyticsState, EmptyState, MetricCard, MetricGrid, RefreshButton, SectionCard, useAnalyticsTabRefresh } from './AnalyticsShared';
import { Select } from '../ui/Select';
import { useCurrentTabId } from '../workspace/TabInstanceContext';

type InventoryView = 'all' | 'failing' | 'stale' | 'awaiting_release' | 'awaiting_deployment' | 'closed_unmerged' | 'unlinked';
type RepositoryScope = 'maintained' | 'selected' | 'accessible';
type SourceScope = 'human' | 'bot' | 'automation' | 'all';

function label(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
}

export function InventoryPage() {
  const analytics = useAnalyticsData();
  useAnalyticsTabRefresh(analytics.refetch);
  const settings = useAnalyticsSettingsStore(state => state.settings);
  const activeTabId = useCurrentTabId();
  const setTabState = useFlowStore(state => state.setTabState);
  const selectedId = useFlowStore(state => state.getTabState(activeTabId).selectedAnalyticsEntity?.id);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<InventoryView>('all');
  const [scope, setScope] = useState<RepositoryScope>('maintained');
  const [stage, setStage] = useState('all');
  const [ageBand, setAgeBand] = useState<'all' | AgeBand>('all');
  const [repositoryId, setRepositoryId] = useState('all');
  const [source, setSource] = useState<SourceScope>('all');
  const [sort, setSort] = useState<'age_desc' | 'age_asc' | 'activity_desc' | 'title'>('age_desc');
  const effectiveSettings = useMemo(() => ({ ...settings, includeBots: true, includeDependabot: true, includeRenovate: true, includeOtherBots: true }), [settings]);
  const items = useMemo(() => analytics.data ? inventoryItems(analytics.data, effectiveSettings) : [], [analytics.data, effectiveSettings]);
  const repositories = analytics.data ? includedRepositories(analytics.data, settings) : [];
  const visible = useMemo(() => items.filter(item => {
    const actorType = item.entity.actorClassification ?? classifyActor(item.entity.author, item.entity.isBot);
    const isBot = ['dependabot', 'renovate', 'other_bot'].includes(actorType);
    const isAutomation = ['workflow_run', 'check_run', 'check_suite'].includes(item.entityType);
    if (source === 'human' && (isBot || isAutomation) || source === 'bot' && !isBot || source === 'automation' && !isAutomation) return false;
    if (scope === 'maintained' && !isMaintainedRepository({ viewerPermission: item.repository.viewerPermission }) || scope === 'selected' && !settings.includedRepositories.includes(item.repository.id)) return false;
    if (view === 'failing' && item.type !== 'checks_failing') return false;
    if (view === 'stale' && item.ageBand !== 'stale') return false;
    if (view === 'awaiting_release' && !['merged_not_released', 'deployed_not_released'].includes(item.type)) return false;
    if (view === 'awaiting_deployment' && !['merged_not_deployed', 'released_not_deployed'].includes(item.type)) return false;
    if (view === 'closed_unmerged' && item.type !== 'closed_unmerged') return false;
    if (view === 'unlinked' && item.relatedEntityIds.length > 0) return false;
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
  }).sort((a, b) => sort === 'age_desc' ? b.ageBusinessDays - a.ageBusinessDays : sort === 'age_asc' ? a.ageBusinessDays - b.ageBusinessDays : sort === 'activity_desc' ? b.lastActivityAt.localeCompare(a.lastActivityAt) : a.entity.title.localeCompare(b.entity.title)), [ageBand, items, repositoryId, scope, search, settings.includedRepositories, sort, source, stage, view]);
  const counts = ageBandCounts(visible);
  const ages = visible.map(item => item.ageBusinessDays);

  useEffect(() => {
    if (selectedId?.startsWith('inventory:') && !visible.some(item => item.id === selectedId)) setTabState(activeTabId, { selectedAnalyticsEntity: undefined });
  }, [activeTabId, selectedId, setTabState, visible]);

  return <AnalyticsPage title="Delivery Inventory" description="Unique actionable work items with aggregated delivery evidence" demo={analytics.mode === 'demo'} controls={<>
    <label>Repository scope<Select ariaLabel="Inventory repository scope" value={scope} onChange={value => setScope(value as RepositoryScope)} options={[{ value: 'maintained', label: 'Repositories I maintain' }, { value: 'selected', label: 'Selected repositories' }, { value: 'accessible', label: 'All accessible repositories' }]} /></label>
    <label>Condition<Select ariaLabel="Inventory view" value={view} onChange={value => setView(value as InventoryView)} options={[
      { value: 'all', label: 'All unresolved conditions' },
      { value: 'failing', label: 'Failing workflows' },
      { value: 'stale', label: 'Stale work' },
      { value: 'awaiting_release', label: 'Awaiting release' },
      { value: 'awaiting_deployment', label: 'Awaiting deployment' },
      { value: 'closed_unmerged', label: 'Closed without merge' },
      { value: 'unlinked', label: 'Unlinked evidence' },
    ]} /></label>
    <label>Repository<Select ariaLabel="Inventory repository" searchable value={repositoryId} onChange={setRepositoryId} options={[{ value: 'all', label: 'All repositories' }, ...repositories.map(repository => ({ value: repository.id, label: repository.nameWithOwner }))]} /></label>
    <label>Source<Select ariaLabel="Inventory source" value={source} onChange={value => setSource(value as SourceScope)} options={[{ value: 'all', label: 'All sources' }, { value: 'human', label: 'Human-authored work' }, { value: 'bot', label: 'Bot-authored work' }, { value: 'automation', label: 'Automation evidence' }]} /></label>
    <RefreshButton refreshing={analytics.isFetching} onClick={() => void analytics.refetch()} />
  </>}>
    <AnalyticsState label="Inventory coverage" loading={analytics.isLoading} error={analytics.error} partialReasons={analytics.data?.partialReasons ?? []} onRetry={() => void analytics.refetch()} />
    {analytics.data && <>
      <MetricGrid>
        <MetricCard label="Recent" value={counts.in_flight} tone="good" detail={`0–${settings.inventoryThresholds.agingDays - 1} business days`} />
        <MetricCard label="Aging" value={counts.aging} tone="warning" detail={`${settings.inventoryThresholds.agingDays}–${settings.inventoryThresholds.staleDays - 1} business days`} />
        <MetricCard label="Stale" value={counts.stale} tone="danger" detail={`${settings.inventoryThresholds.staleDays}+ business days`} />
        <MetricCard label="Active delivery items" value={visible.length} detail="Filtered canonical items" />
        <MetricCard label="Failing workflow groups" value={visible.filter(item => item.type === 'checks_failing').length} detail="Repeated runs aggregated" />
        <MetricCard label="Merged awaiting release" value={visible.filter(item => ['merged_not_released', 'deployed_not_released'].includes(item.type)).length} detail="Only repositories expecting releases" />
        <MetricCard label="Oldest Item" value={ages.length ? `${Math.ceil(Math.max(...ages))}d` : 'No items'} />
        <MetricCard label="Median Age" value={median(ages) == null ? 'Unavailable' : `${Math.ceil(median(ages)!)}d`} />
      </MetricGrid>
      <SectionCard title="Inventory Items" action={<span className="analytics-status analytics-status--healthy">{visible.length} of {items.length}</span>}>
        <div className="analytics-filterbar">
          <input aria-label="Search inventory" value={search} onChange={event => setSearch(event.target.value)} placeholder={'Search or use repo:, type:, reason:, stage:, confidence:, age:>10d…'} />
          <Select ariaLabel="Inventory stage" value={stage} onChange={setStage} options={[{ value: 'all', label: 'All stages' }, ...Array.from(new Set(items.map(item => item.stage))).map(value => ({ value, label: label(value) }))]} />
          <Select ariaLabel="Inventory age band" value={ageBand} onChange={value => setAgeBand(value as 'all' | AgeBand)} options={[{ value: 'all', label: 'All ages' }, { value: 'in_flight', label: 'Recent' }, { value: 'aging', label: 'Aging' }, { value: 'stale', label: 'Stale' }]} />
          <Select ariaLabel="Inventory sort" value={sort} onChange={value => setSort(value as typeof sort)} options={[{ value: 'age_desc', label: 'Oldest first' }, { value: 'age_asc', label: 'Newest first' }, { value: 'activity_desc', label: 'Recent activity' }, { value: 'title', label: 'Item title' }]} />
        </div>
        {visible.length === 0 ? <EmptyState kind="zero">Zero unresolved delivery items match the current scope and filters.</EmptyState> : <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Item</th><th>Repository</th><th>Entity type</th><th>Current stage</th><th>Unresolved condition</th><th>Age</th><th>Last activity</th><th>Evidence</th><th>Confidence</th></tr></thead><tbody>{visible.map(item => <tr key={item.id} tabIndex={0} role="button" aria-label={`Inspect ${item.entity.title}`} className={selectedId === item.id ? 'is-selected' : ''} onClick={() => setTabState(activeTabId, { selectedAnalyticsEntity: inventoryInspectable(analytics.data!, item) })} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setTabState(activeTabId, { selectedAnalyticsEntity: inventoryInspectable(analytics.data!, item) }); } }}><td>{item.entity.number ? `#${item.entity.number} ` : ''}{item.entity.title || `Unlinked ${label(item.entityType)}`}</td><td>{item.repository.nameWithOwner}</td><td>{label(item.entityType)}</td><td>{label(item.stage)}</td><td data-tooltip={`${item.inventoryReason}\nSelect the row to inspect supporting evidence.`}>{item.inventoryReason}</td><td><span className={`analytics-age-badge analytics-age-badge--${item.ageBand}`}>{Math.ceil(item.ageBusinessDays)}d</span></td><td>{new Date(item.lastActivityAt).toLocaleDateString()}</td><td>{item.evidenceCount} record{item.evidenceCount === 1 ? '' : 's'}</td><td>{label(item.confidence)}</td></tr>)}</tbody></table></div>}
      </SectionCard>
    </>}
  </AnalyticsPage>;
}
