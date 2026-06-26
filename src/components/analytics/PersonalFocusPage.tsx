import { useMemo, useState } from 'react';
import { AlertTriangle, Clock3, Star, X } from 'lucide-react';
import { businessDaysBetween, calendarFromSettings } from '../../analytics/business-time';
import { includedRepositories, normalWip, timelineForEntity } from '../../analytics/selectors';
import { classifyActivity, classifyActor, classifyAttention, confidenceFromEvidence } from '../../lib/delivery-semantics';
import { useAnalyticsData } from '../../hooks/useAnalyticsData';
import { useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';
import { useAuthStore } from '../../stores/auth-store';
import { useModeStore } from '../../stores/mode-store';
import { useFlowStore } from '../../stores/flow-store';
import { useTabsStore } from '../../stores/tabs-store';
import { AnalyticsPage, AnalyticsState, EmptyState, MetricCard, MetricGrid, RefreshButton, SectionCard, useAnalyticsTabRefresh } from './AnalyticsShared';
import { Select } from '../ui/Select';

type Involvement = 'all' | 'authored' | 'assigned' | 'review_requested' | 'mentioned' | 'participating';
type ActorFilter = 'humans' | 'include_bots' | 'bots';

export function PersonalFocusPage() {
  const analytics = useAnalyticsData();
  useAnalyticsTabRefresh(analytics.refetch);
  const settings = useAnalyticsSettingsStore(state => state.settings);
  const updateSettings = useAnalyticsSettingsStore(state => state.updateSettings);
  const session = useAuthStore(state => state.session);
  const mode = useModeStore(state => state.mode);
  const activeTabId = useTabsStore(state => state.activeTabId);
  const setTabState = useFlowStore(state => state.setTabState);
  const dataset = analytics.data;
  const currentUser = mode === 'demo' ? 'snowdevil-demo' : session.status === 'connected' ? session.account.login : '';
  const [repositoryId, setRepositoryId] = useState('all');
  const [involvement, setInvolvement] = useState<Involvement>('all');
  const [actor, setActor] = useState<ActorFilter>('humans');
  const [windowChoice, setWindowChoice] = useState('30');
  const [customDays, setCustomDays] = useState(30);
  const [includeDormant, setIncludeDormant] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const activityWindowDays = windowChoice === 'custom' ? customDays : Number(windowChoice);
  const repositories = useMemo(() => dataset ? includedRepositories(dataset, settings) : [], [dataset, settings]);
  const repositoryIds = useMemo(() => new Set(repositories.map(repository => repository.id)), [repositories]);
  const classified = useMemo(() => dataset ? dataset.entities.flatMap(entity => {
    if (!repositoryIds.has(entity.repositoryId) || repositoryId !== 'all' && entity.repositoryId !== repositoryId) return [];
    if (!['pull_request', 'issue', 'branch'].includes(entity.type) || !settings.includeDraftPullRequests && entity.isDraft) return [];
    const actorType = entity.actorClassification ?? classifyActor(entity.author, entity.isBot);
    const bot = ['dependabot', 'renovate', 'other_bot'].includes(actorType);
    if (actor === 'humans' && bot || actor === 'bots' && !bot) return [];
    const relationship = entity.author === currentUser ? 'authored' : entity.assignees?.includes(currentUser) ? 'assigned' : entity.requestedReviewers?.includes(currentUser) ? 'review_requested' : 'participating';
    if (involvement !== 'all' && involvement !== relationship && !(involvement === 'mentioned' && entity.evidence?.some(value => /mention/i.test(value)))) return [];
    const activity = classifyActivity(entity, { referenceTime: dataset.referenceDate, activeWindowDays: activityWindowDays, agingDays: settings.inventoryThresholds.agingDays, staleDays: settings.inventoryThresholds.staleDays });
    if (activity === 'historical' || !includeDormant && activity === 'dormant') return [];
    const attention = classifyAttention(entity, currentUser, activity);
    return [{ entity: { ...entity, actorClassification: actorType, activityClassification: activity, attentionReasons: attention.reasons }, activity, relationship, attention }];
  }) : [], [activityWindowDays, actor, currentUser, dataset, includeDormant, involvement, repositoryId, repositoryIds, settings.includeDraftPullRequests, settings.inventoryThresholds.agingDays, settings.inventoryThresholds.staleDays]);
  const calendar = calendarFromSettings(settings);
  const withAge = classified.map(item => ({ ...item, age: dataset ? businessDaysBetween(item.entity.updatedAt, dataset.referenceDate, calendar) : 0 })).sort((a, b) => b.age - a.age);
  const active = withAge.filter(item => item.activity !== 'dormant');
  const dormant = withAge.filter(item => item.activity === 'dormant');
  const actionRequired = active.filter(item => item.attention.needsAttention);
  const reviewsRequested = active.filter(item => item.entity.requestedReviewers?.includes(currentUser));
  const authoredAwaitingReview = active.filter(item => item.entity.author === currentUser && item.entity.reviewState === 'requested');
  const usualWip = dataset ? normalWip(dataset) : 0;
  const aboveNormal = active.length > Math.max(usualWip + 1, Math.ceil(usualWip * 1.35));
  const p90Threshold = settings.inventoryThresholds.staleDays;
  const recent = dataset?.events.filter(event => ['review_requested', 'commented', 'check_failed', 'workflow_failed', 'approved', 'changes_requested', 'merged', 'assigned', 'committed'].includes(event.type)).slice().reverse().slice(0, 8) ?? [];
  const tipItem = actionRequired.find(item => !dismissed.has(item.entity.id)) ?? active.find(item => !dismissed.has(item.entity.id) && item.relationship === 'authored');
  const selectEntity = (item: typeof withAge[number], reason?: string) => dataset && setTabState(activeTabId, { selectedAnalyticsEntity: { id: `focus:${item.entity.id}`, kind: 'personal_focus', title: item.entity.title, repositoryId: item.entity.repositoryId, number: item.entity.number, url: item.entity.url, state: item.activity, occurredAt: item.entity.updatedAt, reason: reason ?? `Included as ${item.relationship}; ${item.attention.reasons.join(', ') || 'recent meaningful activity'}.`, confidence: confidenceFromEvidence({ completeness: item.entity.sourceCompleteness }), evidence: [...(item.entity.evidence ?? []), `Relationship: ${item.relationship}`, `Activity: ${item.activity}`, `Checks: ${item.entity.checkState ?? 'unavailable'}`, `Review: ${item.entity.reviewState ?? 'unavailable'}`], timeline: timelineForEntity(dataset, item.entity.id), definition: 'Personal Focus includes recent, non-historical work with a current relationship to you.', coverage: dataset.partial ? 'partial' : 'complete' } });

  return <AnalyticsPage title="Personal Focus" description="Current personal work, actionable blockers, aging signals, and dormant items" demo={analytics.mode === 'demo'} controls={<>
    <label>Repository<Select ariaLabel="Focus repository" searchable value={repositoryId} onChange={setRepositoryId} options={[{ value: 'all', label: 'All repositories' }, ...repositories.map(repository => ({ value: repository.id, label: repository.nameWithOwner }))]} /></label>
    <label>Involvement<Select ariaLabel="Focus involvement" value={involvement} onChange={value => setInvolvement(value as Involvement)} options={[{ value: 'all', label: 'All my work' }, { value: 'authored', label: 'Authored by me' }, { value: 'assigned', label: 'Assigned to me' }, { value: 'review_requested', label: 'Review requested from me' }, { value: 'mentioned', label: 'Mentioned' }, { value: 'participating', label: 'Participating' }]} /></label>
    <label>Activity window<Select ariaLabel="Focus activity window" value={windowChoice} onChange={setWindowChoice} options={[7, 30, 90].map(value => ({ value: String(value), label: `${value} days` })).concat([{ value: 'custom', label: 'Custom' }])} /></label>
    {windowChoice === 'custom' && <input aria-label="Custom focus activity days" type="number" min={1} max={365} value={customDays} onChange={event => setCustomDays(Math.max(1, Number(event.target.value)))} />}
    <label>Actor<Select ariaLabel="Focus actor" value={actor} onChange={value => setActor(value as ActorFilter)} options={[{ value: 'humans', label: 'Humans only' }, { value: 'include_bots', label: 'Include bots' }, { value: 'bots', label: 'Bots only' }]} /></label>
    <label><input type="checkbox" checked={includeDormant} onChange={event => setIncludeDormant(event.target.checked)} /> Include dormant</label>
    <RefreshButton refreshing={analytics.isFetching} onClick={() => void analytics.refetch()} />
  </>}>
    <AnalyticsState label="Personal Focus coverage" loading={analytics.isLoading} error={analytics.error} partialReasons={dataset?.partialReasons ?? []} onRetry={() => void analytics.refetch()} />
    {dataset && <>
      <MetricGrid>
        <MetricCard label="Reviews requested from you" value={reviewsRequested.length} tone={reviewsRequested.length ? 'danger' : 'good'} detail="Current explicit review requests" />
        <MetricCard label="Your PRs awaiting review" value={authoredAwaitingReview.length} detail="Authored by you" />
        <MetricCard label="Oldest recently active item" value={active.length ? `${Math.ceil(active[0].age)}d` : 'None'} tone={active[0]?.age >= p90Threshold ? 'danger' : 'neutral'} detail={active[0]?.entity.title} />
        <MetricCard label="Oldest review request for you" value={reviewsRequested.length ? `${Math.ceil(reviewsRequested[0].age)}d` : 'None'} tone="warning" />
        <MetricCard label="Failed checks" value={active.filter(item => item.entity.checkState === 'failure').length} tone={active.some(item => item.entity.checkState === 'failure') ? 'danger' : 'good'} />
        <MetricCard label="Older than your usual P90" value={active.filter(item => item.age >= p90Threshold).length} detail={`Threshold: ${p90Threshold} business days`} tone="warning" />
        <MetricCard label="Current parallel WIP" value={active.length} detail={`Usual baseline: ${usualWip}`} tone={aboveNormal ? 'danger' : 'good'} />
      </MetricGrid>
      <div className="analytics-focus-grid">
        <SectionCard title="Action required">{actionRequired.length ? <div className="analytics-list">{actionRequired.slice(0, 7).map(item => <button key={item.entity.id} type="button" onClick={() => selectEntity(item)}><span><strong>{item.entity.title}</strong><small>{item.attention.reasons.join(' · ').replace(/_/g, ' ')}</small></span><time>{Math.ceil(item.age)}d</time></button>)}</div> : <EmptyState kind="zero">No current evidence-backed action is required.</EmptyState>}</SectionCard>
        <SectionCard title="Current workload"><div className="analytics-wip-meter"><p><span>Genuinely active items</span><strong>{active.length}</strong></p><div className="analytics-wip-track"><span style={{ width: `${Math.min(100, active.length / Math.max(1, usualWip * 2) * 100)}%`, background: aboveNormal ? undefined : 'var(--success)' }} /></div><p><span>Your usual concurrent baseline</span><strong>{usualWip}</strong></p>{aboveNormal && <p style={{ color: 'var(--danger)' }}><AlertTriangle size={11} /> Current WIP is meaningfully above your historical norm.</p>}</div><div className="analytics-list">{active.slice(0, 6).map(item => <button key={item.entity.id} type="button" onClick={() => selectEntity(item)}><span><strong>{item.entity.title}</strong><small>{item.entity.repositoryId} · {item.entity.stage} · {item.relationship}</small></span><time>{Math.ceil(item.age)}d</time></button>)}</div></SectionCard>
        <SectionCard title="Aging signals"><div className="analytics-list">{active.filter(item => ['aging', 'stale'].includes(item.activity)).slice(0, 7).map(item => <button key={item.entity.id} type="button" onClick={() => selectEntity(item, `${item.activity} after ${Math.ceil(item.age)} business days`)}><span><strong>{item.entity.title}</strong><small>{item.activity} · {item.entity.repositoryId}</small></span><time>{Math.ceil(item.age)}d</time></button>)}</div></SectionCard>
        {includeDormant && <SectionCard title="Dormant work"><div className="analytics-list">{dormant.slice(0, 7).map(item => <button key={item.entity.id} type="button" onClick={() => selectEntity(item, 'Open, but outside the selected meaningful-activity window.')}><span><strong>{item.entity.title}</strong><small>No meaningful activity in {activityWindowDays} days</small></span><Clock3 size={13} /></button>)}</div></SectionCard>}
        <SectionCard title="Recent meaningful activity"><div className="analytics-list">{recent.map(event => <div key={event.id} className="analytics-activity-row"><span><strong>{event.type.replace(/_/g, ' ')}</strong><small>{event.repositoryId}</small></span><time>{new Date(event.occurredAt).toLocaleDateString()}</time></div>)}</div></SectionCard>
      </div>
      <div className="analytics-focus-tip"><Star size={17} color="var(--warning)" />{tipItem ? <><span><strong>Focus Tip</strong>{tipItem.entity.checkState === 'failure' ? `Fix failing checks on ${tipItem.entity.title}.` : reviewsRequested.some(value => value.entity.id === tipItem.entity.id) ? `Review ${tipItem.entity.title}; GitHub explicitly requested you.` : `Finish ${tipItem.entity.title} to reduce current parallel WIP.`}</span><div className="analytics-tip-actions"><button onClick={() => selectEntity(tipItem)}>Open</button><button onClick={() => setDismissed(current => new Set(current).add(tipItem.entity.id))}><X size={11} /> Dismiss</button><button onClick={() => setDismissed(current => new Set(current).add(tipItem.entity.id))}><Clock3 size={11} /> Snooze</button><button onClick={() => setDismissed(current => new Set(current).add(tipItem.entity.id))}>Mark irrelevant</button><button onClick={() => updateSettings({ ignoredRepositories: [...new Set([...settings.ignoredRepositories, tipItem.entity.repositoryId])] })}>Exclude repository</button></div></> : <span><strong>Focus Tip</strong>No actionable current work is available.</span>}</div>
    </>}
  </AnalyticsPage>;
}
