import { useEffect, useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTabsStore } from '../../stores/tabs-store';
import { useHomeSummary } from '../../hooks/useHomeSummary';
import { parseHomeSummaryResponse } from '../../lib/flow-parser';
import { FlowCard } from './FlowCard';
import type { FlowStage, FlowItem } from '../../types/flow';
import { useFlowStore } from '../../stores/flow-store';
import { useAuthStore } from '../../stores/auth-store';
import { useModeStore } from '../../stores/mode-store';
import { useDemoHome, useDemoManifest, useDemoPipeline } from '../../hooks/useDemoData';
import { demoPipelineItemToFlowItem } from '../../data/demo-provider';
import { AuthModal } from '../auth/AuthModal';

interface RepoCard {
  id: string;
  name: string;
  description: string | null;
  updated_at: string;
  url: string;
}

const STAGES: { id: FlowStage; label: string }[] = [
  { id: 'issues', label: 'Issues' },
  { id: 'coding', label: 'Coding' },
  { id: 'pull_requests', label: 'Pull Requests' },
  { id: 'review', label: 'Review' },
  { id: 'checks', label: 'Checks' },
  { id: 'ready', label: 'Ready' },
  { id: 'merged', label: 'Merged' },
  { id: 'released', label: 'Released' },
];

export function Dashboard() {
  const mode = useModeStore(state => state.mode);
  const enterDemo = useModeStore(state => state.enterDemo);
  const demoRevision = useModeStore(state => state.demoRevision);
  const session = useAuthStore(state => state.session);
  const [showAuth, setShowAuth] = useState(false);
  const [expansion, setExpansion] = useState<{ context: string; stages: Set<FlowStage> }>({ context: '', stages: new Set() });
  
  const { data: demoHome } = useDemoHome();
  const { data: demoManifest } = useDemoManifest();
  const { data: demoPipeline, isLoading: demoLoading } = useDemoPipeline();
  
  const [repos, setRepos] = useState<RepoCard[]>([]);
  const { openBrowserTab, openNativeTab, activeTabId } = useTabsStore();
  const setTabState = useFlowStore(s => s.setTabState);
  const flowState = useFlowStore(s => s.getTabState(activeTabId));

  // Live data — only enabled in live mode
  const { data: rawSummaryData, isLoading: liveLoading } = useHomeSummary({ enabled: mode === 'live' });

  const liveSummary = useMemo(() => {
    if (mode === 'demo') return null;
    return parseHomeSummaryResponse(rawSummaryData);
  }, [rawSummaryData, mode]);

  // Build a HomeSummary-compatible object from the demo fixtures
  const demoSummary = useMemo(() => {
    if (mode !== 'demo' || !demoHome) return null;
    const m = demoHome.metrics;

    const previews: Record<string, FlowItem[]> = {};
    if (demoPipeline) {
      demoPipeline.items.forEach(item => {
        const flowItem = demoPipelineItemToFlowItem(item);
        if (!previews[flowItem.stage]) {
          previews[flowItem.stage] = [];
        }
        previews[flowItem.stage].push(flowItem);
      });
    }

    return {
      metrics: {
        needsAttention: m.needsAttention ?? 0,
        waitingReview: m.waitingReview ?? 0,
        failingChecks: m.failingChecks ?? 0,
        recentlyMerged: m.recentlyMerged ?? 0,
      },
      exactTotals: { merged: m.recentlyMerged ?? 0 },
      previews,
    };
  }, [demoHome, demoPipeline, mode]);

  const summary = (mode === 'demo' ? demoSummary : liveSummary) ?? {
    metrics: { needsAttention: 0, waitingReview: 0, failingChecks: 0, recentlyMerged: 0 },
    exactTotals: { merged: 0 },
    previews: {},
  };

  const isLoading = mode === 'demo' ? demoLoading : liveLoading;
  const expansionContext = `${mode}:${demoRevision}`;
  const expandedStages = expansion.context === expansionContext ? expansion.stages : new Set<FlowStage>();

  // Live repos fetch — skipped in demo mode
  useEffect(() => {
    if (mode === 'demo') return;
    invoke<RepoCard[]>('get_recent_repositories')
      .then((data) => {
        setRepos(data.slice(0, 5));
      })
      .catch(console.error);
  }, [mode]);

  // Demo repos — synthesised from the manifest
  const demoRepos: RepoCard[] = useMemo(() => {
    if (mode !== 'demo' || !demoManifest) return [];
    return demoManifest.repositories.map(r => ({
      id: r.id,
      name: r.nameWithOwner,
      description: r.description ?? null,
      updated_at: '',
      url: `demo://repo/${r.nameWithOwner}`,
    }));
  }, [demoManifest, mode]);

  const displayRepos = mode === 'demo' ? demoRepos : repos;

  if (mode === 'live' && session.status !== 'connected') {
    return <div className="dashboard-view fresh-launch"><div className="fresh-launch__card"><span className="demo-mode-badge">Snow Devil</span><h1>See how work moves through GitHub.</h1><p>Connect an account for live data, or explore a deterministic offline workspace. No account is required for the demo.</p><div><button className="auth-btn" onClick={() => setShowAuth(true)}>Sign in with GitHub</button><button className="btn-secondary" onClick={enterDemo}>Explore Demo</button></div></div>{showAuth && <AuthModal onClose={() => setShowAuth(false)} />}</div>;
  }

  const handleOpenRepo = (repoName: string) => {
    if (mode === 'demo') {
      // In demo mode open the repo simulator pre-scoped to that repo
      const repoMeta = demoManifest?.repositories.find(r => r.nameWithOwner === repoName);
      if (repoMeta) {
        useFlowStore.getState().setTabState('native:repository-simulator', {
          selectedRepository: { id: repoMeta.id, nameWithOwner: repoMeta.nameWithOwner }
        });
      }
      openNativeTab('native:repository-simulator', 'repositorySimulator', 'Repository Simulator', false, true);
      return;
    }
    openBrowserTab(
      `github:repo:${repoName}`,
      'repository',
      repoName.split('/').pop() || repoName,
      `https://github.com/${repoName}`,
      false,
      true,
    );
  };

  const handleOpenWorkbenchStage = () => {
    setTabState('native:flow', { scope: 'account' });
    openNativeTab('native:flow', 'flow', 'Flow', false, true);
  };

  return (
    <div className="dashboard-view" style={{ padding: '32px', overflowY: 'auto', overflowX: 'hidden', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: '32px' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: '24px', margin: 0, color: 'var(--text-primary)' }}>Account Flow</h1>
        <button
          onClick={() => openNativeTab('native:flow', 'flow', 'Flow', false, true)}
          style={{ padding: '8px 16px', background: 'var(--accent-primary, #58a6ff)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
        >
          Open Flow Workbench
        </button>
      </div>

      {/* Attention Metrics Strip — shared by both modes */}
      <section style={{ display: 'flex', gap: '16px' }}>
        <MetricCard label="Needs Attention" value={summary.metrics.needsAttention} color="var(--danger-color, #da3633)" />
        <MetricCard label="Waiting Reviews" value={summary.metrics.waitingReview} color="var(--warning-color, #d29922)" />
        <MetricCard label="Failing Checks" value={summary.metrics.failingChecks} color="var(--danger-color, #da3633)" />
        <MetricCard label="Recently Merged" value={summary.metrics.recentlyMerged} color="var(--success-color, #238636)" />
      </section>

      {/* Flow Visualizer Preview — shared by both modes */}
      <section style={{ flex: 1, minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ fontSize: '16px', color: 'var(--text-secondary)', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
          Active Pipeline
        </h2>
        <div style={{ flex: 1, overflowX: 'auto' }}>
          {isLoading ? (
             <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading flow data...</div>
          ) : (
            <div className="home-flow-preview">
              {STAGES.map((stage) => {
                const stageItems = summary.previews[stage.id] || [];
                const exactTotal = stage.id === 'merged' ? summary.exactTotals.merged : undefined;
                const expanded = expandedStages.has(stage.id);
                const visibleItems = expanded ? stageItems : stageItems.slice(0, 5);
                const hiddenLocalCount = stageItems.length - visibleItems.length;
                const hiddenRemoteCount = Math.max(0, (exactTotal ?? stageItems.length) - stageItems.length);
                const countDisplay = exactTotal !== undefined ? exactTotal : (!expanded && hiddenLocalCount > 0 ? '5+' : stageItems.length);

                return (
                  <div key={stage.id} className="home-flow-preview-lane">
                    <div className="flow-stage-header" style={{ cursor: 'pointer' }} onClick={handleOpenWorkbenchStage}>
                      <h4>{stage.label}</h4>
                      <span className="flow-stage-count" title={exactTotal !== undefined ? 'Exact total' : 'Partial total'}>
                        {countDisplay}
                      </span>
                    </div>
                    <div className="home-flow-preview-content">
                      {visibleItems.map((item) => (
                        <FlowCard
                          key={item.id}
                          item={item}
                          isSelected={item.id === flowState.selectedItemId}
                          onClick={() => setTabState(activeTabId, { selectedItemId: item.id, selectedFlowItem: item })}
                          variant="preview"
                        />
                      ))}
                      {hiddenLocalCount > 0 && (
                        <button
                          className="more-button"
                          type="button"
                          aria-label={`Show ${hiddenLocalCount} more ${stage.label.toLowerCase()}`}
                          onClick={() => setExpansion(current => {
                            const stages = current.context === expansionContext ? new Set(current.stages) : new Set<FlowStage>();
                            stages.add(stage.id);
                            return { context: expansionContext, stages };
                          })}
                          style={{
                            width: '100%', padding: '8px', background: 'transparent',
                            border: '1px dashed var(--border-color)', borderRadius: '6px',
                            color: 'var(--text-secondary)', cursor: 'pointer', marginTop: '8px'
                          }}
                        >
                          +{hiddenLocalCount} more
                        </button>
                      )}
                      {mode === 'live' && hiddenLocalCount === 0 && (hiddenRemoteCount > 0 || (exactTotal === undefined && stageItems.length >= 5)) && <button type="button" className="more-button" aria-label={`Open Flow to load more ${stage.label.toLowerCase()}`} onClick={handleOpenWorkbenchStage} style={{ width: '100%', padding: '8px', background: 'transparent', border: '1px dashed var(--border-color)', borderRadius: '6px', color: 'var(--text-secondary)', cursor: 'pointer', marginTop: '8px' }}>Open Flow for more</button>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Repositories section — shared by both modes */}
      <section>
        <h2 style={{ fontSize: '16px', color: 'var(--text-secondary)', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
          Recently Active Repositories
        </h2>
        {displayRepos.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No recent repositories.</p>
        ) : (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {displayRepos.map((repo) => (
              <div
                key={repo.id}
                onClick={() => handleOpenRepo(repo.name)}
                style={{
                  padding: '12px 16px',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  background: 'var(--bg-secondary)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--accent-primary, #58a6ff)',
                }}
              >
                {repo.name}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function MetricCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      flex: 1,
      padding: '20px',
      border: '1px solid var(--border-color)',
      borderRadius: '8px',
      background: 'var(--bg-secondary)',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }}>
      <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '32px', fontWeight: 'bold', color: value > 0 ? color : 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}
