import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ArrowRight, CircleAlert, GitMerge, MessageSquareText, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useTabsStore } from '../../stores/tabs-store';
import { useHomeSummary } from '../../hooks/useHomeSummary';
import { parseHomeSummaryResponse } from '../../lib/flow-parser';
import { FlowCard } from './FlowCard';
import type { FlowItem, FlowStage } from '../../types/flow';
import { useFlowStore } from '../../stores/flow-store';
import { useAuthStore } from '../../stores/auth-store';
import { useModeStore } from '../../stores/mode-store';
import { useDemoHome, useDemoManifest, useDemoPipeline } from '../../hooks/useDemoData';
import { demoPipelineItemToFlowItem } from '../../data/demo-provider';
import { AuthModal } from '../auth/AuthModal';
import { canonicalAttentionItems, homePreview, normalizeWorkflowItem, recentMerges, recentlyActiveRepositories, WORKFLOW_STAGES } from '../../lib/workflow-presentation';
import { resolveEntityTabTarget } from '../../lib/entity-target';
import './Dashboard.css';
import { useAnalyticsSync } from '../../hooks/useAnalyticsSync';
import { useTabRefresh } from '../../hooks/useTabRefresh';
import { useCurrentTabId } from './TabInstanceContext';
import { resolveDataViewState } from '../../lib/data-state';

interface RepoCard { id: string; name: string; description: string | null; updated_at: string; url: string }
type MetricFilter = 'attention' | 'waiting_review' | 'failing' | 'merged';
let homeScrollTop = 0;

function relativeTime(timestamp: string, reference: number): string {
  if (!timestamp) return 'Activity unavailable';
  const hours = Math.max(0, Math.floor((reference - new Date(timestamp).getTime()) / 3600000));
  return hours < 1 ? 'Just now' : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

function greeting(hour = new Date().getHours()): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function Dashboard() {
  const homeRef = useRef<HTMLElement>(null);
  const mode = useModeStore(state => state.mode);
  const enterDemo = useModeStore(state => state.enterDemo);
  const session = useAuthStore(state => state.session);
  const [showAuth, setShowAuth] = useState(false);
  const currentUser = mode === 'demo' ? 'snowdevil-demo' : session.status === 'connected' ? session.account.login : '';
  const [liveReference] = useState(() => Date.now());
  const { data: demoHome, isLoading: demoHomeLoading, error: demoHomeError } = useDemoHome();
  const { data: demoManifest } = useDemoManifest();
  const { data: demoPipeline, isLoading: demoLoading, error: demoError } = useDemoPipeline();
  const [repos, setRepos] = useState<RepoCard[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposLoaded, setReposLoaded] = useState(false);
  const { openBrowserTab, openNativeTab } = useTabsStore();
  const activeTabId = useCurrentTabId();
  const isActiveTab = useTabsStore(state => state.activeTabId === activeTabId);
  const setTabState = useFlowStore(state => state.setTabState);
  const flowState = useFlowStore(state => state.getTabState(activeTabId));
  const { data: rawSummaryData, isLoading: liveLoading, isFetching: liveFetching, error: liveError, refetch: refetchHomeSummary } = useHomeSummary({ enabled: mode === 'live' });
  const liveSummary = useMemo(() => mode === 'demo' ? null : parseHomeSummaryResponse(rawSummaryData, currentUser), [rawSummaryData, mode, currentUser]);
  const rawItems = useMemo(() => mode === 'demo'
    ? (demoPipeline?.items ?? []).map(demoPipelineItemToFlowItem)
    : Object.values(liveSummary?.previews ?? {}).flat(), [mode, demoPipeline, liveSummary]);
  const items = useMemo(() => rawItems.map(item => normalizeWorkflowItem(item, mode, mode === 'demo' ? demoPipeline?.referenceDate : undefined, currentUser)), [rawItems, mode, demoPipeline?.referenceDate, currentUser]);
  const previews = useMemo(() => homePreview(items, 2), [items]);
  const activeRepositories = useMemo(() => recentlyActiveRepositories(items, 4), [items]);
  const merges = useMemo(() => recentMerges(items, 4), [items]);
  const referenceTime = mode === 'demo' && demoPipeline?.referenceDate ? new Date(demoPipeline.referenceDate).getTime() : liveReference;
  const metrics = mode === 'demo' && demoHome ? demoHome.metrics : liveSummary?.metrics ?? { needsAttention: 0, waitingReview: 0, failingChecks: 0, recentlyMerged: 0 };
  const previousMetrics = mode === 'demo' ? demoHome?.previousMetrics : undefined;
  const sync = useAnalyticsSync();
  const derivedMetrics = {
    needsAttention: canonicalAttentionItems(items).length,
    reviewsRequested: items.filter(item => item.reviewSummary?.requestedReviewers.includes(currentUser) || /review requested from you/i.test(item.inclusionReason ?? '')).length,
    failingChecks: items.filter(item => item.status === 'failing').length,
    recentlyMerged: items.filter(item => item.mergedAt && referenceTime - new Date(item.mergedAt).getTime() <= 7 * 86400000).length,
  };

  const loadRepositories = useCallback(async () => {
    if (mode === 'demo') { setReposLoaded(true); return; }
    setReposLoading(true);
    try {
      const data = await invoke<RepoCard[]>('get_recent_repositories');
      setRepos([...data].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5));
      setReposLoaded(true);
    } finally {
      setReposLoading(false);
    }
  }, [mode]);
  useEffect(() => { void loadRepositories().catch(console.error); }, [loadRepositories]);
  useTabRefresh(activeTabId, useMemo(() => ({ label: 'Refresh tab', refresh: async () => {
    await Promise.all([refetchHomeSummary(), loadRepositories(), sync.refresh()]);
  } }), [loadRepositories, refetchHomeSummary, sync.refresh]));
  useLayoutEffect(() => {
    if (!isActiveTab || !homeRef.current) return;
    homeRef.current.scrollTop = homeScrollTop;
    const frame = requestAnimationFrame(() => { if (homeRef.current) homeRef.current.scrollTop = homeScrollTop; });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [isActiveTab, mode, session.status]);

  if (mode === 'live' && session.status !== 'connected') return <div className="dashboard-view fresh-launch"><div className="fresh-launch__card"><span className="demo-mode-badge">Snow Devil</span><h1>{session.status==='error'&&session.kind==='expired'?'Reconnect your GitHub account.':'See how work moves through GitHub.'}</h1><p>{session.status==='checking'?'Checking your saved GitHub connection…':session.status==='error'?session.message:'Connect an account for live data, or explore a deterministic offline workspace. No account is required for the demo.'}</p><div><button className="auth-btn" disabled={session.status==='checking'} onClick={() => setShowAuth(true)}>{session.status==='error'?'Reconnect GitHub':'Sign in with GitHub'}</button><button className="btn-secondary" onClick={enterDemo}>Explore Demo</button></div></div>{showAuth && <AuthModal onClose={() => setShowAuth(false)} />}</div>;

  const hasSnapshot = mode === 'demo' ? Boolean(demoHome && demoPipeline) : rawSummaryData !== undefined;
  const homeState = resolveDataViewState({
    loading: mode === 'demo' ? demoLoading || demoHomeLoading : liveLoading,
    fetching: mode === 'live' && liveFetching,
    hasSnapshot,
    empty: hasSnapshot && items.length === 0,
    partial: mode === 'live' && sync.coverage !== 'complete',
    error: Boolean(mode === 'demo' ? demoError || demoHomeError : liveError),
  });
  if (homeState === 'initial-loading') return <HomeLoadingSkeleton />;
  if (homeState === 'failed') return <main className="dashboard-view home-load-failure" role="alert"><ShieldAlert size={24}/><h1>GitHub workspace unavailable</h1><p>Snow Devil could not load a usable Home snapshot. Reconnect if needed, then retry.</p><button className="home-primary" onClick={() => void refetchHomeSummary()}>Retry</button></main>;

  const openFlow = (stage?: FlowStage, statusFilter: MetricFilter | 'all' = 'all') => {
    const stageLabel = stage ? WORKFLOW_STAGES.find(value => value.id === stage)?.label : undefined;
    const statusLabel = statusFilter === 'attention' ? 'Needs attention' : statusFilter === 'waiting_review' ? 'Reviews requested' : statusFilter === 'failing' ? 'Failing checks' : statusFilter === 'merged' ? 'Recently merged' : undefined;
    setTabState('native:flow', { scope: 'account', filterStage: stage, statusFilter, search: '', sourceContext: stageLabel ?? statusLabel ? `Opened from Home: ${stageLabel ?? statusLabel}` : undefined });
    openNativeTab('native:flow', 'flow', 'Flow', false, true);
  };
  const selectItem = (item: FlowItem) => setTabState(activeTabId, { selectedItemId: item.id, selectedFlowItem: item, selectedAnalyticsEntity: undefined });
  const openItem = (item: FlowItem) => { const target = resolveEntityTabTarget(item, mode); if (target) openBrowserTab(target.id, target.kind, target.title, target.url, false, true); };
  const selectRepository = (repo: { id: string; nameWithOwner: string; lastActivityAt?: string }) => setTabState(activeTabId, { selectedItemId: undefined, selectedFlowItem: undefined, selectedAnalyticsEntity: { id: `home-repo:${repo.id}`, kind: 'repository', title: repo.nameWithOwner, repositoryId: repo.nameWithOwner, state: 'recently active', occurredAt: repo.lastActivityAt, reason: 'Recently active based on the latest synchronized workflow item.' } });
  const openRepositoryFlow = (repo: { id: string; nameWithOwner: string }) => {
    setTabState('native:flow', { scope: 'repository', selectedRepository: { id: repo.id, nameWithOwner: repo.nameWithOwner }, filterStage: undefined, statusFilter: 'all', search: '' });
    openNativeTab('native:flow', 'flow', 'Flow', false, true);
  };
  const openRepositoryExplorer = (repo: { nameWithOwner: string }) => openNativeTab(`native:repo:${repo.nameWithOwner}`, 'repositoryExplorer', repo.nameWithOwner.split('/').pop() ?? repo.nameWithOwner, false, true, { type: 'repository', repository: repo.nameWithOwner });
  const metricCards = [
    { label: 'Needs Attention', icon: <CircleAlert size={17}/>, value: derivedMetrics.needsAttention || (metrics.needsAttention ?? 0), previous: previousMetrics?.needsAttention, filter: 'attention' as const, tone: 'danger', help: 'Distinct items with failed checks, changes requested, merge conflicts, or another evidence-backed attention reason.' },
    { label: 'Reviews Requested', icon: <MessageSquareText size={17}/>, value: derivedMetrics.reviewsRequested || (metrics.waitingReview ?? 0), previous: previousMetrics?.waitingReview, filter: 'waiting_review' as const, tone: 'warning', help: 'Pull requests with an explicit review request for the current account.' },
    { label: 'Failing Checks', icon: <ShieldAlert size={17}/>, value: derivedMetrics.failingChecks || (metrics.failingChecks ?? 0), previous: previousMetrics?.failingChecks, filter: 'failing' as const, tone: 'danger', help: 'Pull requests with reported failing required checks.' },
    { label: 'Recently Merged · 7d', icon: <ShieldCheck size={17}/>, value: derivedMetrics.recentlyMerged || (metrics.recentlyMerged ?? 0), previous: previousMetrics?.recentlyMerged, filter: 'merged' as const, tone: 'good', help: 'Pull requests merged during the last seven days of available history.' },
  ];
  const fallbackRepos = mode === 'demo' ? (demoManifest?.repositories ?? []).map(repo => ({ id: repo.id, nameWithOwner: repo.nameWithOwner, lastActivityAt: demoPipeline?.referenceDate ?? '' })) : repos.map(repo => ({ id: repo.id, nameWithOwner: repo.name, lastActivityAt: repo.updated_at }));
  const shownRepos: Array<{ id: string; nameWithOwner: string; lastActivityAt: string; activeItems?: number; status?: 'healthy' | 'attention'; reason?: string }> = activeRepositories.length ? activeRepositories : fallbackRepos;
  const attentionItems = canonicalAttentionItems(items).slice(0, 4);
  const failingRepositories = new Set(items.filter(item => item.status === 'failing').map(item => item.repositoryId)).size;
  return <main ref={homeRef} onScroll={event => { if (isActiveTab) homeScrollTop = event.currentTarget.scrollTop; }} className="dashboard-view home-command-center">
    <header className="home-header"><div><h1 aria-label="Home">{greeting()}{currentUser ? `, ${session.status === 'connected' ? session.account.name || session.account.login : currentUser}` : ''}</h1><p>Here is what needs your attention across your GitHub work.</p></div><button className="home-primary" data-tooltip="Open Flow Workbench\nOpen or activate the singleton Flow page with the full account workflow." onClick={() => openFlow()}><span>Open Flow Workbench</span><ArrowRight size={14} /></button></header>
    <section className="home-metrics" aria-label="Workflow health summary">{metricCards.map(metric => { const comparison = metric.previous != null ? ` Compared with ${metric.previous} in the prior period.` : ''; const context = metric.filter === 'attention' ? `${metric.value} item${metric.value === 1 ? '' : 's'} require action` : metric.filter === 'waiting_review' ? `${metric.value} outstanding review request${metric.value === 1 ? '' : 's'}` : metric.filter === 'failing' ? `${metric.value} failing check${metric.value === 1 ? '' : 's'} across ${failingRepositories} repositor${failingRepositories === 1 ? 'y' : 'ies'}` : `${metric.value} PR${metric.value === 1 ? '' : 's'} merged in the last 7 days`; return <button key={metric.label} className={`home-metric home-metric--${metric.tone}`} data-tooltip={`${metric.label}\n${metric.help}${comparison} Activate to open the matching Flow view.`} aria-label={`${metric.label}: ${metric.value}. ${context}. ${metric.help}${comparison}`} onClick={() => openFlow(undefined, metric.filter)}><i className="home-metric__icon">{metric.icon}</i><span>{metric.label}</span><strong>{metric.value}</strong><small>{context}</small><em>View in Flow <ArrowRight size={10}/></em></button>; })}</section>
    <section className="home-sync-context" aria-label="Home synchronization context"><span>Last synchronized: {mode === 'demo' ? new Date(demoPipeline?.referenceDate ?? liveReference).toLocaleString() : sync.state?.last_successful_at ? new Date(sync.state.last_successful_at).toLocaleString() : 'Unavailable'}</span><span className="home-scope-note">Active items are current. Completed activity covers the last 7 days.</span>{mode !== 'demo' && sync.coverage !== 'complete' && <span>Partial coverage</span>}{sync.state && (() => { try { const failed = JSON.parse(sync.state.failed_repositories_json || '[]').length; return failed ? <span>{failed} failed source{failed === 1 ? '' : 's'}</span> : null; } catch { return null; } })()}</section>
    <section className="home-panel home-pipeline"><header><div><h2>Pipeline Preview</h2><p>Active work and completed evidence</p></div></header><div className="home-pipeline-groups"><div><h3 data-tooltip="Active work\nCurrent issues and pull requests grouped by their evidence-backed workflow stage.">Active work</h3><div className="home-stage-grid">{WORKFLOW_STAGES.slice(0, 6).map(stage => stagePreview(stage.id, stage.label))}</div></div><div><h3 data-tooltip="Completed work\nRecent merge, release, and deployment evidence grouped without collapsing distinct entity types.">Completed work</h3><div className="home-stage-grid home-stage-grid--completed">{WORKFLOW_STAGES.slice(6).map(stage => stagePreview(stage.id, stage.label))}</div></div></div></section>
    <div className="home-lower"><section className="home-panel"><header><div><h2>Recently Active Repositories</h2><p>Status reflects the latest ranking reason</p></div>{session.status === 'connected' && <button onClick={() => openBrowserTab('github:repositories', 'repositories', 'Repositories', `https://github.com/${session.account.login}?tab=repositories`, false, true)}>View all</button>}</header><div className="home-list">{reposLoading && !reposLoaded && shownRepos.length === 0 ? <><div className="home-skeleton-row home-skeleton"/><div className="home-skeleton-row home-skeleton"/></> : shownRepos.length ? shownRepos.slice(0, 4).map(repo => <div className="home-list-row" key={repo.id}><button onClick={() => selectRepository(repo)} onDoubleClick={() => openRepositoryExplorer(repo)} data-tooltip="Repository activity\nSelect to inspect; double-click to browse the repository."><span><strong>{repo.nameWithOwner}</strong><small>{repo.reason ?? 'Recent meaningful activity'} · {relativeTime(repo.lastActivityAt, referenceTime)}{repo.activeItems != null ? ` · ${repo.activeItems} active` : ''}</small></span>{repo.status && <i className={`home-health home-health--${repo.status}`} data-tooltip={repo.reason ?? repo.status} />}</button><button aria-label={`Open ${repo.nameWithOwner} in Repository Flow`} onClick={() => openRepositoryFlow(repo)}><ArrowRight size={13} /></button></div>) : <div className="home-list-empty">No repositories matched the current account scope.</div>}</div></section>
      <section className="home-panel"><header><div><h2>Recent Merges</h2><p>Repository, merge time, checks, and downstream evidence</p></div><GitMerge size={15} /></header><div className="home-list">{merges.length ? merges.map(item => <div className="home-list-row" key={item.id}><button onClick={() => selectItem(item)} onDoubleClick={() => openItem(item)}><span><strong>{item.title}</strong><small>{item.inclusionReason ?? 'Relationship unavailable'} · {item.repositoryName} #{item.number} · Merged {relativeTime(item.mergedAt!, referenceTime)} · {item.checksSummary?.state === 'SUCCESS' ? 'Checks passed' : item.checksSummary?.state === 'FAILURE' ? 'Checks failed' : 'Check outcome unavailable'}</small></span></button></div>) : <div className="home-list-empty"><ShieldAlert size={14} /> No synchronized merges in this preview.</div>}</div></section><section className="home-panel"><header><div><h2>Needs Your Attention</h2><p>Evidence-backed actions, not editable tasks</p></div><CircleAlert size={15}/></header><div className="home-list">{attentionItems.length?attentionItems.map(item=><div className="home-list-row" key={item.id}><button onClick={()=>selectItem(item)} onDoubleClick={()=>openItem(item)}><span><strong>{item.title}</strong><small>{item.inclusionReason ?? 'Direct responsibility'} · {(item.attentionReasons?.[0]??item.status).replace(/_/g,' ')} · Updated {relativeTime(item.updatedAt, referenceTime)}</small></span></button><button aria-label={`Inspect ${item.title}`} onClick={()=>selectItem(item)}><ArrowRight size={13}/></button></div>):<div className="home-list-empty"><ShieldCheck size={14}/>No synchronized item needs action.</div>}</div></section></div>
    {homeState === 'refreshing-with-snapshot' && <div className="home-loading" role="status">Refreshing GitHub data · Displaying previous snapshot</div>}
  </main>;

  function stagePreview(stageId: FlowStage, stageLabel: string) {
    const stageItems = items.filter(item => item.stage === stageId);
    return <article className="home-stage" key={stageId}><button className="home-stage__header" data-tooltip={`${stageLabel}\n${stageItems.length} item${stageItems.length === 1 ? '' : 's'} in this stage. Open the matching Flow column.`} onClick={() => openFlow(stageId)}><span>{stageLabel}</span><strong>{stageItems.length}</strong></button><div className="home-stage__cards">{previews[stageId].map(item => <FlowCard key={item.id} item={item} variant="preview" isSelected={flowState.selectedItemId === item.id} onClick={() => selectItem(item)} onOpen={() => openItem(item)} />)}{stageItems.length === 0 && <div className="home-stage__empty">No items</div>}</div>{stageItems.length > 2 && <button className="home-stage__more" data-tooltip={`${stageItems.length - 2} additional ${stageLabel} items\nOpen the complete stage in Flow.`} aria-label={`Open ${stageLabel} in Account Flow`} onClick={() => openFlow(stageId)}>+{stageItems.length - 2} more</button>}</article>;
  }
}

function HomeLoadingSkeleton() {
  return <main className="dashboard-view home-command-center home-loading-state" role="status" aria-live="polite" aria-label="Loading your GitHub workspace">
    <header className="home-header"><div><h1>Loading your GitHub workspace…</h1><p>Fetching issues, pull requests, reviews, CI, and repository activity.</p></div><button className="home-primary" disabled>Open Flow Workbench</button></header>
    <section className="home-metrics" aria-label="Loading workflow health summary">{Array.from({ length: 4 }, (_, index) => <article className="home-metric home-skeleton" key={index}><i/><span/><strong>—</strong><small/></article>)}</section>
    <section className="home-panel home-pipeline"><header><div><h2>Building your overview…</h2><p>Pipeline results will appear when the first snapshot is ready.</p></div></header><div className="home-skeleton-pipeline">{Array.from({ length: 4 }, (_, index) => <div className="home-skeleton-card home-skeleton" key={index}/>)}</div></section>
    <div className="home-lower">{Array.from({ length: 3 }, (_, index) => <section className="home-panel home-skeleton-panel" key={index}><header><h2>{index === 0 ? 'Loading repositories…' : index === 1 ? 'Loading recent merges…' : 'Checking attention items…'}</h2></header><div className="home-skeleton-row home-skeleton"/><div className="home-skeleton-row home-skeleton"/></section>)}</div>
  </main>;
}
