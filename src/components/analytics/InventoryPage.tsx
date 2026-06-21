import { useMemo, useState } from 'react';
import { ageBandCounts, includedRepositories, inventoryInspectable, inventoryItems } from '../../analytics/selectors';
import { median } from '../../analytics/math';
import type { AgeBand, InventoryType } from '../../analytics/types';
import { useAnalyticsData } from '../../hooks/useAnalyticsData';
import { useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';
import { useFlowStore } from '../../stores/flow-store';
import { useTabsStore } from '../../stores/tabs-store';
import { AnalyticsPage, AnalyticsState, EmptyState, MetricCard, MetricGrid, RefreshButton, SectionCard } from './AnalyticsShared';

function typeLabel(type: InventoryType): string { return type.replace(/_/g, ' '); }

export function InventoryPage() {
  const analytics = useAnalyticsData();
  const settings = useAnalyticsSettingsStore(state => state.settings);
  const updateSettings = useAnalyticsSettingsStore(state => state.updateSettings);
  const activeTabId = useTabsStore(state => state.activeTabId);
  const setTabState = useFlowStore(state => state.setTabState);
  const selectedId = useFlowStore(state => state.getTabState(activeTabId).selectedAnalyticsEntity?.id);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'all' | InventoryType>('all');
  const [stage, setStage] = useState('all');
  const [ageBand, setAgeBand] = useState<'all' | AgeBand>('all');
  const [repositoryId, setRepositoryId] = useState('all');
  const [sort, setSort] = useState<'age_desc' | 'age_asc' | 'activity_desc' | 'title'>('age_desc');
  const items = useMemo(() => analytics.data ? inventoryItems(analytics.data, settings) : [], [analytics.data, settings]);
  const repositories = analytics.data ? includedRepositories(analytics.data, settings) : [];
  const visible = items.filter(item => (type === 'all' || item.type === type) && (stage === 'all' || item.stage === stage) && (ageBand === 'all' || item.ageBand === ageBand) && (repositoryId === 'all' || item.repository.id === repositoryId) && `${item.entity.title} ${item.repository.nameWithOwner} ${item.blockingReason}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === 'age_desc' ? b.ageBusinessDays - a.ageBusinessDays : sort === 'age_asc' ? a.ageBusinessDays - b.ageBusinessDays : sort === 'activity_desc' ? b.lastActivityAt.localeCompare(a.lastActivityAt) : a.entity.title.localeCompare(b.entity.title));
  const counts = ageBandCounts(items);
  const ages = items.map(item => item.ageBusinessDays);

  return <AnalyticsPage title="Delivery Inventory" description="Completed or nearly completed work that is waiting, aging, stale, or disconnected" demo={analytics.mode === 'demo'} controls={<><label>View<select aria-label="Inventory type" value={type} onChange={event => setType(event.target.value as 'all' | InventoryType)}><option value="all">All inventory</option>{Array.from(new Set(items.map(item => item.type))).map(value => <option key={value} value={value}>{typeLabel(value)}</option>)}</select></label><label>Repository<select aria-label="Inventory repository" value={repositoryId} onChange={event => setRepositoryId(event.target.value)}><option value="all">All repositories</option>{repositories.map(repository => <option key={repository.id} value={repository.id}>{repository.nameWithOwner}</option>)}</select></label><label><input type="checkbox" checked={settings.includeBots} onChange={event => updateSettings({ includeBots: event.target.checked })} /> Include bots</label><RefreshButton refreshing={analytics.isFetching} onClick={() => void analytics.refetch()} /></>}>
    <AnalyticsState loading={analytics.isLoading} error={analytics.error} partialReasons={analytics.data?.partialReasons ?? []} onRetry={() => void analytics.refetch()} />
    {analytics.data && <>
      <MetricGrid>
        <MetricCard label="In Flight" value={counts.in_flight} tone="good" detail={`0-${settings.inventoryThresholds.agingDays - 1} business days`} />
        <MetricCard label="Aging" value={counts.aging} tone="warning" detail={`${settings.inventoryThresholds.agingDays}-${settings.inventoryThresholds.staleDays - 1} business days`} />
        <MetricCard label="Stale" value={counts.stale} tone="danger" detail={`${settings.inventoryThresholds.staleDays}+ business days`} />
        <MetricCard label="Total Inventory" value={items.length} />
        <MetricCard label="Oldest Item" value={ages.length ? `${Math.ceil(Math.max(...ages))}d` : 'Unknown'} />
        <MetricCard label="Median Age" value={median(ages) == null ? 'Unknown' : `${Math.ceil(median(ages)!)}d`} />
      </MetricGrid>
      <SectionCard title="Inventory Items" action={<span className="analytics-status analytics-status--good">{visible.length} shown</span>}>
        <div className="analytics-filterbar"><input aria-label="Search inventory" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search item, repository, or reason..." /><select aria-label="Inventory stage" value={stage} onChange={event => setStage(event.target.value)}><option value="all">All stages</option>{Array.from(new Set(items.map(item => item.stage))).map(value => <option key={value}>{value}</option>)}</select><select aria-label="Inventory age band" value={ageBand} onChange={event => setAgeBand(event.target.value as 'all' | AgeBand)}><option value="all">All ages</option><option value="in_flight">In Flight</option><option value="aging">Aging</option><option value="stale">Stale</option></select><select aria-label="Inventory sort" value={sort} onChange={event => setSort(event.target.value as typeof sort)}><option value="age_desc">Oldest first</option><option value="age_asc">Newest first</option><option value="activity_desc">Recent activity</option><option value="title">Item title</option></select></div>
        {visible.length === 0 ? <EmptyState>No inventory matches the current filters.</EmptyState> : <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Item</th><th>Repository</th><th>Type</th><th>Stage</th><th>Age</th><th>Last activity</th><th>Blocking reason</th><th>Related</th><th>Confidence</th></tr></thead><tbody>{visible.map(item => <tr key={item.id} className={selectedId === item.id ? 'is-selected' : ''} onClick={() => setTabState(activeTabId, { selectedAnalyticsEntity: inventoryInspectable(analytics.data!, item) })}><td>{item.entity.number ? `#${item.entity.number} ` : ''}{item.entity.title}</td><td>{item.repository.nameWithOwner}</td><td>{typeLabel(item.type)}</td><td>{item.stage}</td><td><span className={`analytics-age-badge analytics-age-badge--${item.ageBand}`}>{Math.ceil(item.ageBusinessDays)}d</span></td><td>{new Date(item.lastActivityAt).toLocaleDateString()}</td><td title={item.blockingReason}>{item.blockingReason}</td><td>{item.relatedEntityIds.length || 'None'}</td><td>{item.confidence}</td></tr>)}</tbody></table></div>}
      </SectionCard>
    </>}
  </AnalyticsPage>;
}
