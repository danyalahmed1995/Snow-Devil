import { useEffect, useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useTabsStore } from '../../stores/tabs-store';
import { useHomeSummary } from '../../hooks/useHomeSummary';
import { parseHomeSummaryResponse } from '../../lib/flow-parser';
import { FlowCard } from './FlowCard';
import type { FlowStage } from '../../types/flow';
import { useFlowStore } from '../../stores/flow-store';

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
  const [repos, setRepos] = useState<RepoCard[]>([]);
  const { openBrowserTab, openNativeTab, activeTabId } = useTabsStore();
  const setTabState = useFlowStore(s => s.setTabState);
  const flowState = useFlowStore(s => s.getTabState(activeTabId));

  const { data: rawSummaryData, isLoading } = useHomeSummary();

  const summary = useMemo(() => {
    return parseHomeSummaryResponse(rawSummaryData);
  }, [rawSummaryData]);

  useEffect(() => {
    invoke<RepoCard[]>('get_recent_repositories')
      .then((data) => {
        setRepos(data.slice(0, 5)); // Limit to 5
      })
      .catch(console.error);
  }, []);

  const handleOpenRepo = (repoName: string) => {
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
    setTabState('native:flow', { scope: 'account' }); // Optionally pre-select stage if supported later
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

      {/* Attention Metrics Strip */}
      <section style={{ display: 'flex', gap: '16px' }}>
        <MetricCard label="Needs Attention" value={summary.metrics.needsAttention} color="var(--danger-color, #da3633)" />
        <MetricCard label="Waiting Reviews" value={summary.metrics.waitingReview} color="var(--warning-color, #d29922)" />
        <MetricCard label="Failing Checks" value={summary.metrics.failingChecks} color="var(--danger-color, #da3633)" />
        <MetricCard label="Recently Merged" value={summary.metrics.recentlyMerged} color="var(--success-color, #238636)" />
      </section>

      {/* Flow Visualizer Preview */}
      <section style={{ flex: 1, minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ fontSize: '16px', color: 'var(--text-secondary)', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
          Active Pipeline
        </h2>
        <div style={{ flex: 1, overflowX: 'auto' }}>
          {isLoading ? (
             <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading flow data...</div>
          ) : (
            <div className="home-flow-preview">
              {STAGES.map((stage) => {
                const stageItems = summary.previews[stage.id] || [];
                // if empty, we might still want to show the column, but for compact preview, 
                // maybe we show it if there's any active item or just keep them all for consistent layout.
                const exactTotal = stage.id === 'merged' ? summary.exactTotals.merged : undefined;
                const countDisplay = exactTotal !== undefined ? exactTotal : (stageItems.length >= 5 ? '5+' : stageItems.length);

                return (
                  <div key={stage.id} className="home-flow-preview-lane">
                    <div className="flow-stage-header" style={{ cursor: 'pointer' }} onClick={() => handleOpenWorkbenchStage()}>
                      <h4>{stage.label}</h4>
                      <span className="flow-stage-count" title={exactTotal !== undefined ? 'Exact total' : 'Partial total'}>
                        {countDisplay}
                      </span>
                    </div>
                    <div className="home-flow-preview-content">
                      {stageItems.map((item) => (
                        <FlowCard
                          key={item.id}
                          item={item}
                          isSelected={item.id === flowState.selectedItemId}
                          onClick={() => setTabState(activeTabId, { selectedItemId: item.id })}
                          variant="preview"
                        />
                      ))}
                      {stageItems.length >= 5 && (
                        <button 
                          className="more-button"
                          onClick={() => handleOpenWorkbenchStage()}
                          style={{
                            width: '100%', padding: '8px', background: 'transparent',
                            border: '1px dashed var(--border)', borderRadius: '6px',
                            color: 'var(--text-secondary)', cursor: 'pointer', marginTop: '8px'
                          }}
                        >
                          + More
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Recent Repos */}
      <section>
        <h2 style={{ fontSize: '16px', color: 'var(--text-secondary)', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '8px' }}>
          Recently Active Repositories
        </h2>
        {repos.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No recent repositories.</p>
        ) : (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {repos.map((repo) => (
              <div 
                key={repo.id} 
                onClick={() => handleOpenRepo(repo.name)}
                style={{ 
                  padding: '12px 16px', 
                  border: '1px solid var(--border)', 
                  borderRadius: '6px', 
                  background: 'var(--bg-secondary)',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--accent-primary, #58a6ff)'
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
      border: '1px solid var(--border)', 
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
