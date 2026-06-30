import { useMemo, useState } from 'react';
import { AlertTriangle, Clock3, Star, X } from 'lucide-react';
import { businessDaysBetween, calendarFromSettings } from '../../analytics/business-time';
import { includedRepositories, normalWip, timelineForEntity } from '../../analytics/selectors';
import { classifyActivity, classifyActor, classifyAttention, confidenceFromEvidence } from '../../lib/delivery-semantics';
import { deriveViewerRelationship, type ViewerRelationship } from '../../lib/product-model';
import { useAnalyticsData } from '../../hooks/useAnalyticsData';
import { useAnalyticsSettingsStore } from '../../stores/analytics-settings-store';
import { useAuthStore } from '../../stores/auth-store';
import { useModeStore } from '../../stores/mode-store';
import { useFlowStore } from '../../stores/flow-store';
import { useFocusPreferencesStore } from '../../stores/focus-preferences-store';
import { AnalyticsPage, AnalyticsState, EmptyState, MetricCard, MetricGrid, RefreshButton, SectionCard, useAnalyticsTabRefresh } from './AnalyticsShared';
import { Select } from '../ui/Select';
import { useCurrentTabId } from '../workspace/TabInstanceContext';
import { distinctReason, partitionCanonicalResponsibilities } from '../../analytics/personal-focus';

type Involvement = 'direct' | 'authored' | 'assigned' | 'review_requested' | 'mentioned' | 'participating';
type ActorFilter = 'humans' | 'include_bots' | 'bots';

const reasonLabel: Record<string, string> = {
  failed_required_checks: 'Failed checks · Latest required run failed',
  review_requested_from_you: 'Review requested · No review submitted',
  changes_requested: 'Changes requested · Your response is needed',
  merge_conflict: 'Merge conflict · Update the branch',
  stale_blocker: 'Blocked · No meaningful response recently',
  assigned_to_you: 'Assigned to you · Current response required',
  mention_requiring_response: 'Mentioned · A response may be required',
};

export function PersonalFocusPage() {
  const analytics = useAnalyticsData();
  useAnalyticsTabRefresh(analytics.refetch);
  const settings = useAnalyticsSettingsStore(state => state.settings);
  const updateSettings = useAnalyticsSettingsStore(state => state.updateSettings);
  const session = useAuthStore(state => state.session);
  const mode = useModeStore(state => state.mode);
  const activeTabId = useCurrentTabId();
  const setTabState = useFlowStore(state => state.setTabState);
  const preferences = useFocusPreferencesStore();
  const dataset = analytics.data;
  const currentUser = mode === 'demo' ? 'snowdevil-demo' : session.status === 'connected' ? session.account.login : '';
  const [repositoryId, setRepositoryId] = useState('all');
  const [involvement, setInvolvement] = useState<Involvement>('direct');
  const [actor, setActor] = useState<ActorFilter>('humans');
  const [windowChoice, setWindowChoice] = useState('30');
  const [customDays, setCustomDays] = useState(30);
  const [includeDormant, setIncludeDormant] = useState(false);
  const [showRemembered, setShowRemembered] = useState(false);
  const [preferenceNow] = useState(() => Date.now());
  const activityWindowDays = windowChoice === 'custom' ? customDays : Number(windowChoice);
  const repositories = useMemo(() => dataset ? includedRepositories(dataset, settings) : [], [dataset, settings]);
  const repositoryMap = useMemo(() => new Map(repositories.map(repository => [repository.id, repository])), [repositories]);
  const classified = useMemo(() => dataset ? dataset.entities.flatMap(entity => {
    const repository = repositoryMap.get(entity.repositoryId);
    if (!repository || repositoryId !== 'all' && entity.repositoryId !== repositoryId) return [];
    if (!['pull_request', 'issue', 'branch'].includes(entity.type) || !settings.includeDraftPullRequests && entity.isDraft) return [];
    const relationship: ViewerRelationship = entity.viewerRelationship ?? deriveViewerRelationship({
      viewerLogin: currentUser,
      authorLogin: entity.author,
      authorIsBot: entity.isBot,
      assignees: entity.assignees,
      requestedReviewers: entity.requestedReviewers,
      mentions: entity.evidence?.filter(value => /mention/i.test(value)).map(() => currentUser),
      baseRepository: { nameWithOwner: repository.nameWithOwner, ownerLogin: repository.ownerLogin, viewerPermission: repository.viewerPermission },
    });
    const actorType = entity.actorClassification ?? classifyActor(entity.author, entity.isBot);
    const bot = ['dependabot', 'renovate', 'other_bot'].includes(actorType);
    if (actor === 'humans' && bot || actor === 'bots' && !bot) return [];
    const involvementMatches = involvement === 'direct' ? relationship.directResponsibility
      : involvement === 'authored' ? relationship.flags.includes('authored_by_viewer')
      : involvement === 'assigned' ? relationship.flags.includes('assigned_to_viewer')
      : involvement === 'review_requested' ? relationship.flags.includes('review_requested_from_viewer')
      : involvement === 'mentioned' ? relationship.flags.includes('mentioned_viewer')
      : relationship.flags.includes('viewer_participated');
    if (!involvementMatches) return [];
    const activity = classifyActivity(entity, { referenceTime: dataset.referenceDate, activeWindowDays: activityWindowDays, agingDays: settings.inventoryThresholds.agingDays, staleDays: settings.inventoryThresholds.staleDays });
    if (activity === 'historical' || !includeDormant && activity === 'dormant') return [];
    const attention = classifyAttention(entity, currentUser, activity);
    return [{ entity: { ...entity, actorClassification: actorType, activityClassification: activity, attentionReasons: attention.reasons, viewerRelationship: relationship }, activity, relationship, attention }];
  }) : [], [activityWindowDays, actor, currentUser, dataset, includeDormant, involvement, repositoryId, repositoryMap, settings.includeDraftPullRequests, settings.inventoryThresholds.agingDays, settings.inventoryThresholds.staleDays]);

  const calendar = calendarFromSettings(settings);
  const withAge = classified.map(item => ({ ...item, age: dataset ? businessDaysBetween(item.entity.updatedAt, dataset.referenceDate, calendar) : 0 })).sort((a, b) => b.age - a.age);
  const remembered = withAge.filter(item => preferences.dismissed.includes(item.entity.id) || preferences.irrelevant.includes(item.entity.id) || (preferences.snoozedUntil[item.entity.id] ?? 0) > preferenceNow);
  const visible = withAge.filter(item => !remembered.some(value => value.entity.id === item.entity.id));
  const { doNow, waiting, gettingStale, dormant, canonical: responsibilities } = partitionCanonicalResponsibilities(visible, currentUser, includeDormant);
  const reviewsRequested = responsibilities.filter(item => item.relationship.flags.includes('review_requested_from_viewer'));
  const authoredAwaitingReview = waiting.filter(item => item.relationship.flags.includes('authored_by_viewer'));
  const usualWip = dataset ? normalWip(dataset) : 0;
  const aboveNormal = responsibilities.length > Math.max(usualWip + 1, Math.ceil(usualWip * 1.35));
  const p90Threshold = settings.inventoryThresholds.staleDays;
  const oldestResponsibility = [...responsibilities].sort((left, right) => right.age - left.age)[0];
  const recent = useMemo(() => {
    const aggregate = new Map<string, { type: string; repositoryId: string; date: string; count: number }>();
    for (const event of dataset?.events ?? []) {
      if (!['review_requested', 'commented', 'check_failed', 'workflow_failed', 'approved', 'changes_requested', 'merged', 'assigned', 'committed'].includes(event.type)) continue;
      const date = event.occurredAt.slice(0, 10);
      const key = `${event.repositoryId}:${event.type}:${date}`;
      const current = aggregate.get(key);
      aggregate.set(key, { type: event.type, repositoryId: event.repositoryId, date, count: (current?.count ?? 0) + 1 });
    }
    return [...aggregate.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  }, [dataset?.events]);
  const tipItem = doNow[0] ?? responsibilities[0];

  const selectEntity = (item: typeof withAge[number], reason?: string) => dataset && setTabState(activeTabId, { selectedAnalyticsEntity: { id: `focus:${item.entity.id}`, kind: 'personal_focus', title: item.entity.title, repositoryId: item.entity.repositoryId, number: item.entity.number, url: item.entity.url, state: item.activity, occurredAt: item.entity.updatedAt, reason: reason ?? distinctReason([item.relationship.label, ...item.attention.reasons.map(value => reasonLabel[value] ?? value), item.attention.reasons.length ? undefined : item.relationship.explanation]), confidence: confidenceFromEvidence({ completeness: item.entity.sourceCompleteness }), evidence: [...(item.entity.evidence ?? []), `Relationship: ${item.relationship.label}`, `Activity: ${item.activity}`, `Checks: ${item.entity.checkState ?? 'unavailable'}`, `Review: ${item.entity.reviewState ?? 'unavailable'}`], timeline: timelineForEntity(dataset, item.entity.id), definition: 'Personal Focus defaults to current direct responsibility. Participation-only work appears only when explicitly selected.', coverage: dataset.partial ? 'partial' : 'complete' } });
  const list = (items: typeof withAge, empty: string) => items.length ? <div className="analytics-list">{items.map(item => <button key={item.entity.id} type="button" data-tooltip={`${item.entity.title}\n${item.entity.repositoryId} · ${item.relationship.label}. Select to inspect responsibility and evidence.`} onClick={() => selectEntity(item)}><span><strong>{item.entity.title}</strong><small>{distinctReason([item.attention.reasons.map(value => reasonLabel[value] ?? value.replace(/_/g, ' '))[0], item.relationship.label, item.entity.repositoryId])}</small></span><time>{Math.ceil(item.age)}d</time></button>)}</div> : <EmptyState kind="zero">{empty}</EmptyState>;

  return <AnalyticsPage title="Personal Focus" description="What to do now, what is waiting on others, and what is becoming stale" demo={analytics.mode === 'demo'} controls={<>
    <label>Repository<Select ariaLabel="Focus repository" searchable value={repositoryId} onChange={setRepositoryId} options={[{ value: 'all', label: 'All repositories' }, ...repositories.map(repository => ({ value: repository.id, label: repository.nameWithOwner }))]} /></label>
    <label>Responsibility<Select ariaLabel="Focus involvement" value={involvement} onChange={value => setInvolvement(value as Involvement)} options={[{ value: 'direct', label: 'Direct responsibility' }, { value: 'authored', label: 'Authored by me' }, { value: 'assigned', label: 'Assigned to me' }, { value: 'review_requested', label: 'Review requested from me' }, { value: 'mentioned', label: 'Mentioned' }, { value: 'participating', label: 'Participation only' }]} /></label>
    <label>Activity window<Select ariaLabel="Focus activity window" value={windowChoice} onChange={setWindowChoice} options={[7, 30, 90].map(value => ({ value: String(value), label: `${value} days` })).concat([{ value: 'custom', label: 'Custom' }])} /></label>
    {windowChoice === 'custom' && <input aria-label="Custom focus activity days" type="number" min={1} max={365} value={customDays} onChange={event => setCustomDays(Math.max(1, Number(event.target.value)))} />}
    <label>Author<Select ariaLabel="Focus actor" value={actor} onChange={value => setActor(value as ActorFilter)} options={[{ value: 'humans', label: 'Humans only' }, { value: 'include_bots', label: 'Include bots' }, { value: 'bots', label: 'Bots only' }]} /></label>
    <label><input type="checkbox" checked={includeDormant} onChange={event => setIncludeDormant(event.target.checked)} /> Include dormant</label>
    <RefreshButton refreshing={analytics.isFetching} onClick={() => void analytics.refetch()} />
  </>}>
    <AnalyticsState label="Personal Focus coverage" loading={analytics.isLoading} error={analytics.error} partialReasons={dataset?.partialReasons ?? []} onRetry={() => void analytics.refetch()} />
    {dataset && <>
      <MetricGrid>
        <MetricCard label="Active responsibilities" value={responsibilities.length} detail={`Your usual workload: ${usualWip}`} tone={aboveNormal ? 'danger' : 'good'} title="Active responsibilities\nCurrent evidence-backed work for which you have direct responsibility." />
        <MetricCard label="Reviews requested from you" value={reviewsRequested.length} tone={reviewsRequested.length ? 'danger' : 'good'} detail="Current explicit requests" title="Reviews requested from you\nPull requests with an explicit current GitHub review request for your account." />
        <MetricCard label="Your PRs awaiting review" value={authoredAwaitingReview.length} detail="Waiting on others" title="Your PRs awaiting review\nAuthored pull requests waiting for another reviewer rather than an action from you." />
        <MetricCard label="Oldest active responsibility" value={oldestResponsibility ? `${Math.ceil(oldestResponsibility.age)}d` : 'None'} tone={oldestResponsibility?.age >= p90Threshold ? 'danger' : 'neutral'} detail={oldestResponsibility?.entity.title} title="Oldest active responsibility\nBusiness-day age of your oldest current direct responsibility." />
        <MetricCard label="Failed checks" value={doNow.filter(item => item.entity.checkState === 'failure').length} tone={doNow.some(item => item.entity.checkState === 'failure') ? 'danger' : 'good'} title="Failed checks\nCurrent direct responsibilities whose latest reported required checks failed." />
        <MetricCard label="Unusually old" value={responsibilities.filter(item => item.age >= p90Threshold).length} detail={`Your current threshold: ${p90Threshold} business days`} tone="warning" title="Unusually old\nResponsibilities at or beyond the configured business-day stale threshold." />
      </MetricGrid>
      <div className="analytics-focus-grid">
        <SectionCard title="Do now">{list(doNow, 'No current evidence-backed action is required.')}</SectionCard>
        <SectionCard title="Waiting on others">{list(waiting, 'No direct responsibility is currently waiting on another party.')}</SectionCard>
        <SectionCard title="Getting stale">{list(gettingStale, 'No current responsibility is unusually old.')}</SectionCard>
        {includeDormant && <SectionCard title="Dormant work">{list(dormant, `No direct responsibility is outside the ${activityWindowDays}-day activity window.`)}</SectionCard>}
        <SectionCard title="Recent meaningful activity"><div className="analytics-list">{recent.map(event => <div key={`${event.repositoryId}:${event.type}:${event.date}`} className="analytics-activity-row"><span><strong>{event.count > 1 ? `${event.count} ${event.type.replace(/_/g, ' ')} events` : event.type.replace(/_/g, ' ')}</strong><small>{event.repositoryId}</small></span><time>{new Date(`${event.date}T00:00:00Z`).toLocaleDateString()}</time></div>)}</div></SectionCard>
        {remembered.length > 0 && <SectionCard title="Snoozed or dismissed" action={<button className="analytics-button" onClick={() => setShowRemembered(value => !value)}>{showRemembered ? 'Hide' : `Show ${remembered.length}`}</button>}>{showRemembered && <div className="analytics-list">{remembered.map(item => <div className="analytics-activity-row" key={item.entity.id}><span><strong>{item.entity.title}</strong><small>Remembered on this device</small></span><button className="analytics-button" onClick={() => preferences.undo(item.entity.id)}>Undo</button></div>)}</div>}</SectionCard>}
      </div>
      <div className="analytics-focus-tip"><Star size={17} color="var(--warning)" />{tipItem ? <><span><strong>Next action</strong>{tipItem.entity.checkState === 'failure' ? `Fix the latest failing checks on ${tipItem.entity.title}.` : reviewsRequested.some(value => value.entity.id === tipItem.entity.id) ? `Review ${tipItem.entity.title}; GitHub explicitly requested you.` : `Continue ${tipItem.entity.title}; ${tipItem.relationship.explanation}`}</span><div className="analytics-tip-actions"><button onClick={() => selectEntity(tipItem)}>Open</button><button onClick={() => preferences.dismiss(tipItem.entity.id)}><X size={11} /> Dismiss</button><button onClick={() => preferences.snooze(tipItem.entity.id)}><Clock3 size={11} /> Snooze</button><button onClick={() => preferences.markIrrelevant(tipItem.entity.id)}>Mark irrelevant</button><button onClick={() => updateSettings({ ignoredRepositories: [...new Set([...settings.ignoredRepositories, tipItem.entity.repositoryId])] })}>Exclude repository</button></div></> : <span><strong>Next action</strong>No actionable current responsibility is available.</span>}</div>
      {aboveNormal && <p className="analytics-focus-warning"><AlertTriangle size={12}/> Active responsibilities are above your usual workload.</p>}
    </>}
  </AnalyticsPage>;
}
