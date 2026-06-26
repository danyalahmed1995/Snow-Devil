import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ArrowRight, GitMerge, ShieldAlert } from 'lucide-react';
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
import { homePreview, normalizeWorkflowItem, recentMerges, recentlyActiveRepositories, WORKFLOW_STAGES } from '../../lib/workflow-presentation';
import { resolveEntityTabTarget } from '../../lib/entity-target';
import './Dashboard.css';
import { useAnalyticsSync } from '../../hooks/useAnalyticsSync';
import { useTabRefresh } from '../../hooks/useTabRefresh';

interface RepoCard { id: string; name: string; description: string | null; updated_at: string; url: string }
type MetricFilter = 'attention' | 'waiting_review' | 'failing' | 'merged';

function relativeTime(timestamp: string, reference: number): string {
  if (!timestamp) return 'Activity unavailable';
  const hours = Math.max(0, Math.floor((reference - new Date(timestamp).getTime()) / 3600000));
  return hours < 1 ? 'Just now' : hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export function Dashboard() {
  const mode = useModeStore(state => state.mode);
  const enterDemo = useModeStore(state => state.enterDemo);
  const session = useAuthStore(state => state.session);
  const [showAuth, setShowAuth] = useState(false);
  const [liveReference] = useState(() => Date.now());
  const { data: demoHome } = useDemoHome();
  const { data: demoManifest } = useDemoManifest();
  const { data: demoPipeline, isLoading: demoLoading } = useDemoPipeline();
  const [repos, setRepos] = useState<RepoCard[]>([]);
  const { openBrowserTab, openNativeTab, activeTabId } = useTabsStore();
  const setTabState = useFlowStore(state => state.setTabState);
  const flowState = useFlowStore(state => state.getTabState(activeTabId));
  const { data: rawSummaryData, isLoading: liveLoading, refetch: refetchHomeSummary } = useHomeSummary({ enabled: mode === 'live' });
  const liveSummary = useMemo(() => mode === 'demo' ? null : parseHomeSummaryResponse(rawSummaryData), [rawSummaryData, mode]);
  const rawItems = useMemo(() => mode === 'demo'
    ? (demoPipeline?.items ?? []).map(demoPipelineItemToFlowItem)
    : Object.values(liveSummary?.previews ?? {}).flat(), [mode, demoPipeline, liveSummary]);
  const items = useMemo(() => rawItems.map(item => normalizeWorkflowItem(item, mode, mode === 'demo' ? demoPipeline?.referenceDate : undefined)), [rawItems, mode, demoPipeline?.referenceDate]);
  const previews = useMemo(() => homePreview(items, 2), [items]);
  const activeRepositories = useMemo(() => recentlyActiveRepositories(items, 4), [items]);
  const merges = useMemo(() => recentMerges(items, 4), [items]);
  const referenceTime = mode === 'demo' && demoPipeline?.referenceDate ? new Date(demoPipeline.referenceDate).getTime() : liveReference;
  const metrics = mode === 'demo' && demoHome ? demoHome.metrics : liveSummary?.metrics ?? { needsAttention: 0, waitingReview: 0, failingChecks: 0, recentlyMerged: 0 };
  const previousMetrics = mode === 'demo' ? demoHome?.previousMetrics : undefined;
  const sync = useAnalyticsSync();
  const currentUser = mode === 'demo' ? 'snowdevil-demo' : session.status === 'connected' ? session.account.login : '';
  const derivedMetrics = {
    needsAttention: items.filter(item => item.attentionReasons?.length).length,
    reviewsRequested: items.filter(item => item.reviewSummary?.requestedReviewers.includes(currentUser) || /review requested from you/i.test(item.inclusionReason ?? '')).length,
    failingChecks: items.filter(item => item.status === 'failing').length,
    recentlyMerged: items.filter(item => item.mergedAt && referenceTime - new Date(item.mergedAt).getTime() <= 7 * 86400000).length,
  };

  const loadRepositories = useCallback(async () => {
    if (mode === 'demo') return;
    const data = await invoke<RepoCard[]>('get_recent_repositories');
    setRepos([...data].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 5));
  }, [mode]);
  useEffect(() => { void loadRepositories().catch(console.error); }, [loadRepositories]);
  useTabRefresh(activeTabId, useMemo(() => ({ label: 'Refresh tab', refresh: async () => {
    await Promise.all([refetchHomeSummary(), loadRepositories(), sync.refresh()]);
  } }), [loadRepositories, refetchHomeSummary, sync.refresh]));

  if (mode === 'live' && session.status !== 'connected') return <div className="dashboard-view fresh-launch"><div className="fresh-launch__card"><span className="demo-mode-badge">Snow Devil</span><h1>{session.status==='error'&&session.kind==='expired'?'Reconnect your GitHub account.':'See how work moves through GitHub.'}</h1><p>{session.status==='checking'?'Checking your saved GitHub connection…':session.status==='error'?session.message:'Connect an account for live data, or explore a deterministic offline workspace. No account is required for the demo.'}</p><div><button className="auth-btn" disabled={session.status==='checking'} onClick={() => setShowAuth(true)}>{session.status==='error'?'Reconnect GitHub':'Sign in with GitHub'}</button><button className="btn-secondary" onClick={enterDemo}>Explore Demo</button></div></div>{showAuth && <AuthModal onClose={() => setShowAuth(false)} />}</div>;

  const openFlow = (stage?: FlowStage, statusFilter: MetricFilter | 'all' = 'all') => {
    setTabState('native:flow', { scope: 'account', filterStage: stage, statusFilter, search: '' });
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
    { label: 'Needs Attention', value: derivedMetrics.needsAttention || (metrics.needsAttention ?? 0), previous: previousMetrics?.needsAttention, filter: 'attention' as const, tone: 'danger', help: 'Distinct items with failed checks, changes requested, merge conflicts, or another evidence-backed attention reason.' },
    { label: 'Reviews Requested From You', value: derivedMetrics.reviewsRequested || (metrics.waitingReview ?? 0), previous: previousMetrics?.waitingReview, filter: 'waiting_review' as const, tone: 'warning', help: 'Pull requests with an explicit review request for the current account.' },
    { label: 'Failing Checks', value: derivedMetrics.failingChecks || (metrics.failingChecks ?? 0), previous: previousMetrics?.failingChecks, filter: 'failing' as const, tone: 'danger', help: 'Pull requests with reported failing required checks.' },
    { label: 'Recently Merged · 7d', value: derivedMetrics.recentlyMerged || (metrics.recentlyMerged ?? 0), previous: previousMetrics?.recentlyMerged, filter: 'merged' as const, tone: 'good', help: 'Pull requests merged during the last seven days of available history.' },
  ];
  const fallbackRepos = mode === 'demo' ? (demoManifest?.repositories ?? []).map(repo => ({ id: repo.id, nameWithOwner: repo.nameWithOwner, lastActivityAt: demoPipeline?.referenceDate ?? '' })) : repos.map(repo => ({ id: repo.id, nameWithOwner: repo.name, lastActivityAt: repo.updated_at }));
  const shownRepos: Array<{ id: string; nameWithOwner: string; lastActivityAt: string; activeItems?: number; status?: 'healthy' | 'attention'; reason?: string }> = activeRepositories.length ? activeRepositories : fallbackRepos;

  return <main className="dashboard-view home-command-center">
    <header className="home-header"><div><h1>Home</h1><p>What needs your attention right now</p></div><button className="home-primary" onClick={() => openFlow()}><span>Open Flow Workbench</span><ArrowRight size={14} /></button></header>
    <section className="home-metrics" aria-label="Workflow health summary">{metricCards.map(metric => <button key={metric.label} className={`home-metric home-metric--${metric.tone}`} title={metric.help} aria-label={`${metric.label}: ${metric.value}. ${metric.help}`} onClick={() => openFlow(undefined, metric.filter)}><span>{metric.label}</span><strong>{metric.value}</strong>{metric.previous != null && <small>{metric.value - metric.previous >= 0 ? '+' : ''}{metric.value - metric.previous} from prior period</small>}</button>)}</section>
    <section className="home-sync-context" aria-label="Home synchronization context"><span>Last synchronized: {mode === 'demo' ? new Date(demoPipeline?.referenceDate ?? liveReference).toLocaleString() : sync.state?.last_successful_at ? new Date(sync.state.last_successful_at).toLocaleString() : 'Unavailable'}</span>{mode !== 'demo' && sync.coverage !== 'complete' && <span>Partial coverage</span>}{sync.state && (() => { try { const failed = JSON.parse(sync.state.failed_repositories_json || '[]').length; return failed ? <span>{failed} failed source{failed === 1 ? '' : 's'}</span> : null; } catch { return null; } })()}</section>
    <section className="home-panel home-pipeline"><header><div><h2>Pipeline Preview</h2><p>Active work and completed evidence</p></div></header><div className="home-pipeline-groups"><div><h3>Active work</h3><div className="home-stage-grid">{WORKFLOW_STAGES.slice(0, 6).map(stage => stagePreview(stage.id, stage.label))}</div></div><div><h3>Completed work</h3><div className="home-stage-grid home-stage-grid--completed">{WORKFLOW_STAGES.slice(6).map(stage => stagePreview(stage.id, stage.label))}</div></div></div></section>
    <div className="home-lower"><section className="home-panel"><header><div><h2>Recently Active Repositories</h2><p>Status reflects the latest ranking reason</p></div>{session.status === 'connected' && <button onClick={() => openBrowserTab('github:repositories', 'repositories', 'Repositories', `https://github.com/${session.account.login}?tab=repositories`, false, true)}>View all</button>}</header><div className="home-list">{shownRepos.slice(0, 4).map(repo => <div className="home-list-row" key={repo.id}><button onClick={() => selectRepository(repo)} onDoubleClick={() => openRepositoryExplorer(repo)} title="Double-click to browse repository"><span><strong>{repo.nameWithOwner}</strong><small>{repo.reason ?? 'Recent meaningful activity'} · {relativeTime(repo.lastActivityAt, referenceTime)}{repo.activeItems != null ? ` · ${repo.activeItems} active` : ''}</small></span>{repo.status && <i className={`home-health home-health--${repo.status}`} title={repo.reason ?? repo.status} />}</button><button aria-label={`Open ${repo.nameWithOwner} in Repository Flow`} onClick={() => openRepositoryFlow(repo)}><ArrowRight size={13} /></button></div>)}</div></section>
      <section className="home-panel"><header><div><h2>Recent Merges</h2><p>Repository, merge time, checks, and downstream evidence</p></div><GitMerge size={15} /></header><div className="home-list">{merges.length ? merges.map(item => <div className="home-list-row" key={item.id}><button onClick={() => selectItem(item)} onDoubleClick={() => openItem(item)}><span><strong>{item.title}</strong><small>{item.repositoryName} #{item.number} · {relativeTime(item.mergedAt!, referenceTime)} · {item.checksSummary?.state === 'SUCCESS' ? 'Checks passed' : item.checksSummary?.state === 'FAILURE' ? 'Checks failed' : 'Check outcome unavailable'} · {item.deployedAt ? 'Deployed' : item.publishedAt ? 'Released' : item.missingEvidence?.join(', ') || 'Downstream evidence unavailable'}</small></span></button></div>) : <div className="home-list-empty"><ShieldAlert size={14} /> No synchronized merges in this preview.</div>}</div></section></div>
    {(mode === 'demo' ? demoLoading : liveLoading) && <div className="home-loading">Refreshing cached workflow summary...</div>}
  </main>;

  function stagePreview(stageId: FlowStage, stageLabel: string) {
    const stageItems = items.filter(item => item.stage === stageId);
    return <article className="home-stage" key={stageId}><button className="home-stage__header" onClick={() => openFlow(stageId)}><span>{stageLabel}</span><strong>{stageItems.length}</strong></button><div className="home-stage__cards">{previews[stageId].map(item => <FlowCard key={item.id} item={item} variant="preview" isSelected={flowState.selectedItemId === item.id} onClick={() => selectItem(item)} onOpen={() => openItem(item)} />)}{stageItems.length === 0 && <div className="home-stage__empty">No items</div>}</div>{stageItems.length > 2 && <button className="home-stage__more" aria-label={`Open ${stageLabel} in Account Flow`} onClick={() => openFlow(stageId)}>+{stageItems.length - 2} more</button>}</article>;
  }
}
