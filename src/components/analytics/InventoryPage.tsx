import { useCallback, useDeferredValue, useMemo, useState, useEffect } from 'react';
import { Ban, Bot, Copy, GitFork, GitPullRequest, MessageSquareText, Pencil, Pin, RotateCcw, Save, Trash2, Volume2, VolumeX } from 'lucide-react';
import { compareDeliveryRiskPriority, inventoryInspectable } from '../../analytics/selectors';
import { getDeliveryRiskModel, useDeliveryRiskModel } from '../../analytics/delivery-risk-cache';
import { BUILT_IN_DELIVERY_RISK_VIEWS, DEFAULT_DELIVERY_RISK_VIEW, deliveryRiskViewById } from '../../analytics/delivery-risk-views';
import { DELIVERY_RISK_HIDDEN_REASON_LABELS, deliveryRiskHiddenBreakdown, deliveryRiskHiddenReason } from '../../analytics/delivery-risk-scope';
import type { DeliveryRiskCategory, DeliveryRiskSavedView, DeliveryRiskSort, DeliveryRiskViewState, InventoryItem } from '../../analytics/types';
import { useAnalyticsData } from '../../hooks/useAnalyticsData';
import { useAnalyticsSync } from '../../hooks/useAnalyticsSync';
import { useCIRepositoryWatch } from '../../hooks/useCIRepositoryWatch';
import { useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';
import { useFlowStore } from '../../stores/flow-store';
import { useTabsStore } from '../../stores/tabs-store';
import { AnalyticsPage, AnalyticsState, EmptyState, MetricCard, MetricGrid, RefreshButton, SectionCard, useAnalyticsTabRefresh } from './AnalyticsShared';
import { Select } from '../ui/Select';
import { useCurrentTabId } from '../workspace/TabInstanceContext';

const CATEGORY_META: Array<{ value: DeliveryRiskCategory; label: string; detail: string; tone: 'danger' | 'warning' | 'info' | 'good' | 'neutral'; tooltip: string }> = [
  { value: 'blocked', label: 'Blocked', detail: 'A known condition prevents progress.', tone: 'danger', tooltip: 'Exact merge conflict, requested changes, required-check failure, missing required approval, or policy blocker.' },
  { value: 'awaiting_review', label: 'Awaiting Review', detail: 'A requested or required review is overdue.', tone: 'warning', tooltip: 'Open non-draft pull request with an outstanding reviewer and a recorded request older than the configured threshold.' },
  { value: 'stale', label: 'Stale', detail: 'Active work has no recent meaningful activity.', tone: 'warning', tooltip: 'Active work with no commit, review, comment, check, assignment, or state event during the stale threshold.' },
  { value: 'ready_to_merge', label: 'Ready to Merge', detail: 'Known checks and approvals are satisfied.', tone: 'good', tooltip: 'Open non-draft pull request with known passing checks, approval, and known mergeable state.' },
  { value: 'delivery_status_unknown', label: 'Delivery Status Unknown', detail: 'Delivery evidence is unavailable or inconclusive.', tone: 'neutral', tooltip: 'Merged work inside retained history for a repository with observed delivery capability, without conclusive linkage.' },
  { value: 'delivery_blocked', label: 'Delivery Blocked', detail: 'Exact downstream evidence reports a blocker.', tone: 'danger', tooltip: 'An exact deployment failure is recorded.' },
];

const DELIVERY_RISK_VIEW_KEYS: Array<keyof DeliveryRiskViewState> = ['category', 'scope', 'ownership', 'repositoryId', 'actor', 'entityType', 'age', 'archived', 'forks', 'muted', 'confidence', 'backlog', 'sort', 'search'];

export function deliveryRiskViewIsModified(view: DeliveryRiskViewState, saved: DeliveryRiskSavedView | undefined): boolean {
  return Boolean(saved && DELIVERY_RISK_VIEW_KEYS.some(key => view[key] !== saved[key]));
}

function safeRelativeTime(value: string | undefined, reference: string): string {
  if (!value) return 'Unknown';
  const timestamp = Date.parse(value); const end = Date.parse(reference);
  if (!Number.isFinite(timestamp) || !Number.isFinite(end) || timestamp > end + 300_000) return 'Unknown';
  const days = Math.max(0, Math.floor((end - timestamp) / 86_400_000));
  return days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`;
}

function sortRisks(items: InventoryItem[], sort: DeliveryRiskSort): InventoryItem[] {
  return [...items].sort((a, b) => sort === 'priority' ? compareDeliveryRiskPriority(a, b)
    : sort === 'activity' ? (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '')
    : sort === 'oldest' || sort === 'age' ? (b.ageBusinessDays ?? -1) - (a.ageBusinessDays ?? -1)
    : sort === 'newest' ? (a.ageBusinessDays ?? Number.MAX_SAFE_INTEGER) - (b.ageBusinessDays ?? Number.MAX_SAFE_INTEGER)
    : sort === 'repository' ? a.repository.nameWithOwner.localeCompare(b.repository.nameWithOwner) || compareDeliveryRiskPriority(a, b)
    : a.actionableRank - b.actionableRank || compareDeliveryRiskPriority(a, b));
}

function repositoryMuteKey(item: InventoryItem): string { return String(item.repository.databaseId ?? item.repository.id).toLowerCase(); }

export function InventoryPage() {
  const activeTabId = useCurrentTabId();
  const isActive = useTabsStore(state => state.activeTabId === activeTabId);
  const analytics = useAnalyticsData({ enabled: isActive });
  const sync = useAnalyticsSync({ enabled: isActive });
  useAnalyticsTabRefresh(analytics.refetch);
  const settings = useAnalyticsSettingsStore(state => state.settings);
  const updateSettings = useAnalyticsSettingsStore(state => state.updateSettings);
  const setTabState = useFlowStore(state => state.setTabState);
  const selectedId = useFlowStore(state => state.getTabState(activeTabId).selectedAnalyticsEntity?.id);
  const initialSaved = deliveryRiskViewById(settings.defaultDeliveryRiskViewId ?? 'builtin:active', settings.deliveryRiskSavedViews);
  const [view, setViewState] = useState<DeliveryRiskViewState>(() => settings.deliveryRiskLastView ?? initialSaved ?? DEFAULT_DELIVERY_RISK_VIEW);
  const [savedViewId, setSavedViewId] = useState(initialSaved?.id ?? 'builtin:active');
  const [savedViewName, setSavedViewName] = useState('');
  const [limit, setLimit] = useState(100);
  const [refreshing, setRefreshing] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  useCIRepositoryWatch(view.repositoryId === 'all' ? undefined : view.repositoryId, isActive);
  const deferredSearch = useDeferredValue(view.search);
  const setView = (update: Partial<DeliveryRiskViewState>) => { setViewState(current => ({ ...current, ...update })); setLimit(100); };
  const selectedSavedView = deliveryRiskViewById(savedViewId, settings.deliveryRiskSavedViews);
  const viewIsModified = deliveryRiskViewIsModified(view, selectedSavedView);

  // Demo data is intentionally tiny and deterministic; live snapshots use the worker.
  const demoModel = analytics.mode === 'demo' && analytics.data ? getDeliveryRiskModel(analytics.data, settings) : undefined;
  const derivedWorker = useDeliveryRiskModel(analytics.mode === 'demo' ? undefined : analytics.data, settings);
  const derived = demoModel ? { data: demoModel, isLoading: false, error: undefined } : derivedWorker;
  const model = derived.data;
  const analysis = model?.analysis ?? { items: [], canonicalEntityCount: 0, classifiedRiskCount: 0, terminalEntityCount: 0, activeWithoutRiskCount: 0, policyExcludedCount: 0 };
  const items = analysis.items;
  const repositories = model?.repositories ?? [];
  const mutedItemKeys = useMemo(() => new Set(settings.mutedDeliveryRiskItems.map(value => value.toLowerCase())), [settings.mutedDeliveryRiskItems]);
  const mutedRepoKeys = useMemo(() => new Set(settings.mutedDeliveryRiskRepositories.map(value => value.toLowerCase())), [settings.mutedDeliveryRiskRepositories]);
  const mutedReasonKeys = useMemo(() => new Set(settings.mutedDeliveryRiskReasons.map(value => value.toLowerCase())), [settings.mutedDeliveryRiskReasons]);
  const reasonMuteKey = (item: InventoryItem) => `${repositoryMuteKey(item)}:${item.riskReasonCode}`.toLowerCase();
  const isMuted = useCallback((item: InventoryItem) => mutedItemKeys.has(item.id.toLowerCase()) || item.legacyMuteIds.some(id => mutedItemKeys.has(id.toLowerCase())) || mutedRepoKeys.has(repositoryMuteKey(item)) || mutedRepoKeys.has(item.repository.id.toLowerCase()) || mutedReasonKeys.has(`${repositoryMuteKey(item)}:${item.riskReasonCode}`.toLowerCase()), [mutedItemKeys, mutedReasonKeys, mutedRepoKeys]);

  const evaluatedView = useMemo(() => ({ ...view, search: deferredSearch }), [deferredSearch, view]);
  const scoped = useMemo(() => items.filter(item => !deliveryRiskHiddenReason(item, evaluatedView, settings, isMuted, { ignoreCategory: true })), [evaluatedView, isMuted, items, settings]);

  const counts = useMemo(() => Object.fromEntries(CATEGORY_META.map(meta => [meta.value, scoped.filter(item => item.riskCategory === meta.value).length])) as Record<DeliveryRiskCategory, number>, [scoped]);
  const visible = useMemo(() => sortRisks(scoped.filter(item => view.category === 'all' || item.riskCategory === view.category), view.sort), [scoped, view.category, view.sort]);
  const hiddenBreakdown = useMemo(() => deliveryRiskHiddenBreakdown(items, evaluatedView, settings, isMuted, { ignoreCategory: true }), [evaluatedView, isMuted, items, settings]);
  const defaultHidden = useMemo(() => Object.values(hiddenBreakdown).reduce((total, count) => total + (count ?? 0), 0), [hiddenBreakdown]);
  const activeBeforeViewFilters = useMemo(() => items.filter(item => item.backlog === 'active').length, [items]);

  useEffect(() => {
    const timer = window.setTimeout(() => updateSettings({ deliveryRiskLastView: view }), 120);
    return () => window.clearTimeout(timer);
  }, [updateSettings, view]);
  useEffect(() => {
    if (selectedId?.startsWith('delivery-risk:') && !visible.some(item => item.id === selectedId)) setTabState(activeTabId, { selectedAnalyticsEntity: undefined });
  }, [activeTabId, selectedId, setTabState, visible]);

  const applySavedView = (id: string) => { const saved = deliveryRiskViewById(id, settings.deliveryRiskSavedViews); if (!saved) return; setSavedViewId(id); setViewState(saved); setSavedViewName(saved.name); setLimit(100); };
  const [prevDefaultRiskViewId, setPrevDefaultRiskViewId] = useState(settings.defaultDeliveryRiskViewId);
  if (settings.defaultDeliveryRiskViewId !== prevDefaultRiskViewId) {
    setPrevDefaultRiskViewId(settings.defaultDeliveryRiskViewId);
    if (settings.defaultDeliveryRiskViewId && settings.defaultDeliveryRiskViewId !== savedViewId) {
      const saved = deliveryRiskViewById(settings.defaultDeliveryRiskViewId, settings.deliveryRiskSavedViews);
      if (saved) {
        setSavedViewId(saved.id); setViewState(saved); setSavedViewName(saved.name); setLimit(100);
      }
    }
  }
  const saveNewView = () => { const name = savedViewName.trim() || `Risk view ${settings.deliveryRiskSavedViews.length + 1}`; const next: DeliveryRiskSavedView = { ...view, id: `delivery-risk-view:${Date.now()}`, name }; updateSettings({ deliveryRiskSavedViews: [...settings.deliveryRiskSavedViews, next] }); setSavedViewId(next.id); setSavedViewName(name); };
  const updateCurrentView = () => { const current = settings.deliveryRiskSavedViews.find(saved => saved.id === savedViewId); if (!current) return; updateSettings({ deliveryRiskSavedViews: settings.deliveryRiskSavedViews.map(saved => saved.id === savedViewId ? { ...saved, ...view, name: savedViewName.trim() || saved.name } : saved) }); };
  const duplicateView = () => { const source = deliveryRiskViewById(savedViewId, settings.deliveryRiskSavedViews); if (!source) return; const copy: DeliveryRiskSavedView = { ...source, ...view, id: `delivery-risk-view:${Date.now()}`, name: `${source.name} copy`, builtIn: false }; updateSettings({ deliveryRiskSavedViews: [...settings.deliveryRiskSavedViews, copy] }); setSavedViewId(copy.id); setSavedViewName(copy.name); };
  const deleteView = () => { if (savedViewId.startsWith('builtin:')) return; updateSettings({ deliveryRiskSavedViews: settings.deliveryRiskSavedViews.filter(saved => saved.id !== savedViewId), defaultDeliveryRiskViewId: settings.defaultDeliveryRiskViewId === savedViewId ? 'builtin:active' : settings.defaultDeliveryRiskViewId }); applySavedView('builtin:active'); };
  const toggleItemMute = (item: InventoryItem) => { const keys = settings.mutedDeliveryRiskItems; const matched = [item.id, ...item.legacyMuteIds].find(id => keys.some(value => value.toLowerCase() === id.toLowerCase())); const next = matched ? keys.filter(value => value.toLowerCase() !== matched.toLowerCase()) : [...keys, item.id]; const metadata = { ...settings.deliveryRiskMuteMetadata }; if (matched) delete metadata[matched.toLowerCase()]; else metadata[item.id.toLowerCase()] = { mutedAt: new Date().toISOString() }; updateSettings({ mutedDeliveryRiskItems: next, deliveryRiskMuteMetadata: metadata }); setAnnouncement(matched ? 'Delivery risk restored.' : 'Delivery risk muted.'); };
  const toggleRepositoryMute = (item: InventoryItem) => { const key = repositoryMuteKey(item); const existing = settings.mutedDeliveryRiskRepositories.find(value => value.toLowerCase() === key || value.toLowerCase() === item.repository.id.toLowerCase()); const next = existing ? settings.mutedDeliveryRiskRepositories.filter(value => value !== existing) : [...settings.mutedDeliveryRiskRepositories, key]; const metadata = { ...settings.deliveryRiskMuteMetadata }; if (existing) delete metadata[`repository:${existing.toLowerCase()}`]; else metadata[`repository:${key}`] = { mutedAt: new Date().toISOString() }; updateSettings({ mutedDeliveryRiskRepositories: next, deliveryRiskMuteMetadata: metadata }); setAnnouncement(existing ? 'Repository restored.' : 'Repository muted.'); };
  const toggleReasonMute = (item: InventoryItem) => { const key = reasonMuteKey(item); const muted = settings.mutedDeliveryRiskReasons.some(value => value.toLowerCase() === key); updateSettings({ mutedDeliveryRiskReasons: muted ? settings.mutedDeliveryRiskReasons.filter(value => value.toLowerCase() !== key) : [...settings.mutedDeliveryRiskReasons, key] }); setAnnouncement(muted ? 'Risk condition restored.' : 'Risk condition muted for this repository.'); };
  const openAction = (item: InventoryItem) => { const tabs = useTabsStore.getState(); if (item.suggestedAction === 'Open CI' && item.entity.runId) tabs.openNativeTab(`ciRun:${item.repository.id}:${item.entity.runId}`, 'ciRun', `CI · ${item.repository.nameWithOwner.split('/').pop()}`, false, true, { type: 'ciRun', repository: item.repository.id, runId: item.entity.runId }); else if (item.suggestedAction === 'Open CI') tabs.openNativeTab('native:ci-health', 'ciHealth', 'CI Activity', false, true); else if (item.entityType === 'pull_request' && item.entity.number) tabs.openNativeTab(`native:pr:${item.repository.id}:${item.entity.number}`, 'pullRequestDiff', `PR #${item.entity.number}`, false, true, { type: 'pullRequest', repository: item.repository.id, number: item.entity.number }); else tabs.openNativeTab(`native:repo:${item.repository.id}`, 'repositoryExplorer', item.repository.nameWithOwner.split('/').pop() ?? item.repository.nameWithOwner, false, true, { type: 'repository', repository: item.repository.id }); };
  const refresh = async () => { setRefreshing(true); try { if (view.repositoryId !== 'all') await sync.sync({ singleRepository: view.repositoryId }); await analytics.refetch(); } finally { setRefreshing(false); } };
  const clearFilters = () => { setSavedViewId('builtin:active'); setViewState(DEFAULT_DELIVERY_RISK_VIEW); setLimit(100); };

  return <AnalyticsPage title="Delivery Risks" description="Work that is blocked, aging, awaiting action, or not yet delivered." demo={analytics.mode === 'demo'} compactSync controls={<>
    <label>Repository scope<Select ariaLabel="Delivery Risks repository scope" value={view.scope} onChange={scope => setView({ scope })} options={[{ value: 'maintained', label: 'Repositories I maintain' }, { value: 'selected', label: 'Selected repositories' }, { value: 'accessible', label: 'All accessible repositories' }]} /></label>
    <label>Risk<Select ariaLabel="Risk category" value={view.category} onChange={category => setView({ category: category as DeliveryRiskViewState['category'] })} options={[{ value: 'all', label: 'All active risks' }, ...CATEGORY_META.map(meta => ({ value: meta.value, label: meta.label }))]} /></label>
    <label>Repository<Select ariaLabel="Delivery Risks repository" searchable value={view.repositoryId} onChange={repositoryId => setView({ repositoryId })} options={[{ value: 'all', label: 'All repositories' }, ...repositories.map(repository => ({ value: repository.id, label: repository.nameWithOwner }))]} /></label>
    <RefreshButton refreshing={refreshing} onClick={() => void refresh()} />
  </>}>
    <AnalyticsState loading={analytics.isLoading || derived.isLoading} error={analytics.error ?? derived.error} partialReasons={[]} onRetry={() => void refresh()} />
    <span className="sr-only" aria-live="polite">{announcement}</span>
    {analytics.data && model && <>
      {analytics.data.partial && <div className="delivery-risk-notice">Some repositories have partial history. Risk results may be incomplete. <button type="button" onClick={() => useTabsStore.getState().openNativeTab('native:settings', 'settings', 'Settings', false, true)}>Source details</button></div>}
      <MetricGrid>{CATEGORY_META.filter(meta => meta.value !== 'delivery_blocked' || counts.delivery_blocked > 0).map(meta => <MetricCard key={meta.value} label={meta.label} value={counts[meta.value]} detail={<>{meta.detail} <span className="delivery-risk-filter-context">Current filters apply.</span></>} tone={meta.tone} title={`${meta.tooltip} Counts reflect the current view filters.`} active={view.category === meta.value} onClick={() => setView({ category: view.category === meta.value ? 'all' : meta.value })} />)}</MetricGrid>
      {defaultHidden > 0 && <div className="delivery-risk-disclosure">{defaultHidden} classified item{defaultHidden === 1 ? '' : 's'} hidden by the current view. <details><summary>Breakdown</summary>{Object.entries(hiddenBreakdown).filter(([, count]) => count).map(([reason, count]) => <span key={reason}>{DELIVERY_RISK_HIDDEN_REASON_LABELS[reason as keyof typeof DELIVERY_RISK_HIDDEN_REASON_LABELS]}: <strong>{count}</strong></span>)}</details><button onClick={clearFilters}>Reset filters</button>{view.backlog === 'active' && <><button onClick={() => applySavedView('builtin:legacy')}>Legacy Backlog</button><button onClick={() => applySavedView('builtin:bot-backlog')}>Bot Backlog</button></>}</div>}
      {(analytics.data.partial || repositories.some(repository => repository.releaseMatching || repository.deploymentMatching)) && <div className="delivery-risk-notice">Release and deployment status are unavailable for some repositories. <button type="button" onClick={() => useTabsStore.getState().openNativeTab('native:settings', 'settings', 'Settings', false, true)}>Source details</button></div>}
      <SectionCard title={view.muted === 'only' ? 'Muted delivery risks' : view.backlog === 'legacy' ? 'Legacy Backlog' : view.backlog === 'bot' ? 'Bot Backlog' : view.backlog === 'informational' ? 'Delivery Status Unknown' : 'Active Risks'} action={<span className="delivery-risk-card-actions"><span className="analytics-status analytics-status--healthy">{visible.length} visible · {activeBeforeViewFilters} active · {analysis.classifiedRiskCount} classified</span><span>Showing {Math.min(limit, visible.length)} of {visible.length}</span></span>}>
        <div className="delivery-risk-savedbar">
          <Select ariaLabel="Saved Delivery Risks views" value={savedViewId} onChange={applySavedView} options={[...BUILT_IN_DELIVERY_RISK_VIEWS, ...settings.deliveryRiskSavedViews].map(saved => ({ value: saved.id, label: saved.name }))} />
          {viewIsModified && <span className="delivery-risk-view-modified" role="status">Modified filters</span>}
          <input aria-label="Saved view name" value={savedViewName} onChange={event => setSavedViewName(event.target.value)} placeholder="Name this view" />
          <button onClick={saveNewView}><Save size={12} /> Save new</button><button onClick={updateCurrentView} disabled={savedViewId.startsWith('builtin:')}><Pencil size={12} /> Update</button><button onClick={duplicateView}><Copy size={12} /> Duplicate</button><button onClick={deleteView} disabled={savedViewId.startsWith('builtin:')}><Trash2 size={12} /> Delete</button><button onClick={() => updateSettings({ defaultDeliveryRiskViewId: savedViewId })}><Pin size={12} /> Set default</button>
        </div>
        <div className="analytics-filterbar delivery-risk-filterbar">
          <input aria-label="Search delivery risks" value={view.search} onChange={event => setView({ search: event.target.value })} placeholder="Search work items or repositories…" />
          <Select ariaLabel="Risk ownership" value={view.ownership} onChange={ownership => setView({ ownership })} options={[{ value: 'everyone', label: 'Everyone' }, { value: 'actionable', label: 'Actionable by me' }, { value: 'assigned', label: 'Assigned to me' }, { value: 'authored', label: 'Authored by me' }, { value: 'review_requested', label: 'Review requested from me' }, { value: 'maintained', label: 'Maintained by me' }]} />
          <Select ariaLabel="Risk age" value={view.age} onChange={age => setView({ age })} options={[{ value: 'all', label: 'All ages' }, { value: '0_7', label: '0–7 days' }, { value: '8_30', label: '8–30 days' }, { value: '31_90', label: '31–90 days' }, { value: '91_180', label: '91–180 days' }, { value: 'over_180', label: 'Over 180 days' }]} />
          <Select ariaLabel="Risk entity type" value={view.entityType} onChange={entityType => setView({ entityType })} options={[{ value: 'issues_prs', label: 'Issues and pull requests' }, { value: 'pull_request', label: 'Pull requests' }, { value: 'issue', label: 'Issues' }, { value: 'branch', label: 'Branches' }, { value: 'all', label: 'All supported entities' }]} />
          <Select ariaLabel="Delivery Risks backlog" value={view.backlog} onChange={backlog => setView({ backlog: backlog as DeliveryRiskViewState['backlog'] })} options={[{ value: 'active', label: 'Active backlog' }, { value: 'legacy', label: 'Legacy backlog' }, { value: 'bot', label: 'Bot backlog' }, { value: 'informational', label: 'Delivery information' }, { value: 'all', label: 'All backlogs' }]} />
          <Select ariaLabel="Bot or human" value={view.actor} onChange={actor => setView({ actor })} options={[{ value: 'all', label: 'Active humans + elevated bots' }, { value: 'human', label: 'Human-created' }, { value: 'bot', label: 'Bot-created' }]} />
          <Select ariaLabel="Archived repositories" value={view.archived} onChange={archived => setView({ archived })} options={[{ value: 'hide', label: 'Hide archived' }, { value: 'include', label: 'Include archived' }]} />
          <Select ariaLabel="Fork repositories" value={view.forks} onChange={forks => setView({ forks })} options={[{ value: 'exclude', label: 'Exclude forks' }, { value: 'include', label: 'Include forks' }]} />
          <Select ariaLabel="Muted status" value={view.muted} onChange={muted => setView({ muted })} options={[{ value: 'hide', label: 'Hide muted' }, { value: 'include', label: 'Include muted' }, { value: 'only', label: 'Muted only' }]} />
          <Select ariaLabel="Risk confidence" value={view.confidence} onChange={confidence => setView({ confidence })} options={[{ value: 'all', label: 'All confidence' }, { value: 'exact', label: 'Exact only' }, { value: 'partial', label: 'Partial or unknown' }, { value: 'unknown', label: 'Unknown only' }]} />
          <Select ariaLabel="Risk sort" value={view.sort} onChange={sort => setView({ sort: sort as DeliveryRiskSort })} options={[{ value: 'priority', label: 'Priority' }, { value: 'activity', label: 'Most recent activity' }, { value: 'oldest', label: 'Oldest risk' }, { value: 'newest', label: 'Newest risk' }, { value: 'repository', label: 'Repository' }, { value: 'actionable', label: 'Actionable by me' }, { value: 'age', label: 'Age' }]} />
          <button type="button" className="analytics-button" onClick={clearFilters}><RotateCcw size={12} /> Reset Active Risks</button>
        </div>
        {visible.length === 0 ? <EmptyState kind="zero">{view.ownership === 'actionable' ? 'No delivery risks currently require your action.' : view.backlog === 'active' && defaultHidden > 0 ? 'No active risks. Older or automated items are available in Legacy Backlog and Bot Backlog.' : 'No active delivery risks match the current filters.'}</EmptyState> : <div className="analytics-table-wrap"><table className="analytics-table delivery-risk-table"><thead><tr><th>Work item</th><th>Repository</th><th>Risk</th><th>Owner</th><th>Age</th><th>Last activity</th><th>Action</th><th aria-label="Noise controls" /></tr></thead><tbody>{visible.slice(0, limit).map(item => { const muted = isMuted(item); return <tr key={item.id} tabIndex={0} role="button" aria-label={`Inspect ${item.entity.title}`} className={selectedId === item.id ? 'is-selected' : ''} onClick={() => setTabState(activeTabId, { selectedAnalyticsEntity: inventoryInspectable(analytics.data!, item) })} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setTabState(activeTabId, { selectedAnalyticsEntity: inventoryInspectable(analytics.data!, item) }); } }}>
          <td><span className="risk-work-item">{item.entityType === 'pull_request' ? <GitPullRequest size={13} /> : <MessageSquareText size={13} />}<span>{item.entity.number ? `#${item.entity.number} ` : ''}{item.entity.title}{item.entity.isDraft && <small>Draft</small>}{item.isBotCreated && <small><Bot size={10} /> Bot</small>}{muted && <small><VolumeX size={10} /> Muted</small>}</span></span></td>
          <td>{item.repository.nameWithOwner}{item.repository.fork && <small><GitFork size={10} /> Fork</small>}{item.repository.archived && <small>Archived</small>}{mutedRepoKeys.has(repositoryMuteKey(item)) && <small>Repository muted</small>}</td>
          <td><span className={`delivery-risk-badge delivery-risk-badge--${item.riskCategory}`}>{item.riskLabel}</span></td>
          <td>{item.owner ?? 'Unassigned'}</td><td data-tooltip={item.riskSince ? 'Time since the current risk became active.' : 'Risk-start timestamp is unavailable.'}><span className={`analytics-age-badge analytics-age-badge--${item.ageBand}`}>{item.ageBusinessDays == null ? 'Unknown' : `${Math.ceil(item.ageBusinessDays)}d`}</span></td>
          <td><span className="risk-activity">{safeRelativeTime(item.lastActivityAt, analytics.data!.referenceDate)}<small>{item.lastActivityLabel} · {item.lastActivityActor ?? 'Unknown actor'}</small></span></td>
          <td><button type="button" className="risk-row-action" onClick={event => { event.stopPropagation(); openAction(item); }}>{item.suggestedAction}</button></td>
          <td><span className="risk-noise-actions"><button type="button" data-tooltip={muted ? 'Restore item' : 'Mute item'} aria-label={`${muted ? 'Restore' : 'Mute'} ${item.entity.title}`} onClick={event => { event.stopPropagation(); toggleItemMute(item); }}>{muted ? <Volume2 size={12} /> : <VolumeX size={12} />}</button><button type="button" data-tooltip={mutedRepoKeys.has(repositoryMuteKey(item)) ? 'Restore repository' : 'Mute repository'} aria-label={`${mutedRepoKeys.has(repositoryMuteKey(item)) ? 'Restore' : 'Mute'} repository ${item.repository.id}`} onClick={event => { event.stopPropagation(); toggleRepositoryMute(item); }}><GitFork size={12} /></button><button type="button" data-tooltip="Mute this condition for the repository" aria-label={`Mute ${item.riskLabel} condition for ${item.repository.id}`} onClick={event => { event.stopPropagation(); toggleReasonMute(item); }}><Ban size={12} /></button></span></td>
        </tr>; })}</tbody></table>{limit < visible.length && <button className="delivery-risk-load-more" type="button" onClick={() => setLimit(value => value + 100)}>Show 100 more</button>}</div>}
      </SectionCard>
      {import.meta.env.DEV && <details className="delivery-risk-diagnostics"><summary>Developer Diagnostics</summary><div><span>Canonical entities <strong>{analysis.canonicalEntityCount}</strong></span><span>Classified risks <strong>{analysis.classifiedRiskCount}</strong></span><span>Terminal / historical <strong>{analysis.terminalEntityCount}</strong></span><span>Active without a risk <strong>{analysis.activeWithoutRiskCount}</strong></span><span>Excluded by source policy <strong>{analysis.policyExcludedCount}</strong></span><span>Canonical reconciliation <strong>{analysis.classifiedRiskCount + analysis.terminalEntityCount + analysis.activeWithoutRiskCount + analysis.policyExcludedCount}</strong></span><span>Active before view filters <strong>{activeBeforeViewFilters}</strong></span><span>Hidden by bot policy <strong>{hiddenBreakdown.bot_policy ?? 0}</strong></span><span>Hidden by archive policy <strong>{hiddenBreakdown.archive_policy ?? 0}</strong></span><span>Hidden by fork policy <strong>{hiddenBreakdown.fork_policy ?? 0}</strong></span><span>Hidden by mute policy <strong>{hiddenBreakdown.mute_policy ?? 0}</strong></span><span>Hidden by age policy <strong>{hiddenBreakdown.age_policy ?? 0}</strong></span><span>Hidden by entity type <strong>{hiddenBreakdown.entity_type ?? 0}</strong></span><span>Hidden by repository scope <strong>{hiddenBreakdown.repository_scope ?? 0}</strong></span><span>Hidden by confidence <strong>{hiddenBreakdown.confidence ?? 0}</strong></span><span>Hidden by other saved-view rules <strong>{(hiddenBreakdown.saved_view_rule ?? 0) + (hiddenBreakdown.ownership ?? 0) + (hiddenBreakdown.search ?? 0)}</strong></span><span>Visible after all filters <strong>{visible.length}</strong></span><span>Legacy backlog <strong>{items.filter(item => item.backlog === 'legacy').length}</strong></span><span>Bot backlog <strong>{items.filter(item => item.backlog === 'bot').length}</strong></span><span>Delivery Status Unknown <strong>{items.filter(item => item.backlog === 'informational').length}</strong></span><span>Muted <strong>{items.filter(isMuted).length}</strong></span><span>Duplicate records suppressed <strong>{Math.max(0, analytics.data.entities.length - analysis.canonicalEntityCount)}</strong></span><span>Unknown timestamps <strong>{items.filter(item => !item.lastActivityAt || !item.riskSince).length}</strong></span><span>Partial confidence <strong>{items.filter(item => item.confidence !== 'exact').length}</strong></span><span>Classification errors <strong>{analysis.canonicalEntityCount === analysis.classifiedRiskCount + analysis.terminalEntityCount + analysis.activeWithoutRiskCount + analysis.policyExcludedCount ? 0 : 1}</strong></span><span>Current sort <strong>{view.sort}</strong></span><span>Default hidden <strong>{defaultHidden}</strong></span></div></details>}
    </>}
  </AnalyticsPage>;
}
