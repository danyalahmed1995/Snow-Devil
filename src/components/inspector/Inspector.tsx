import React, { useMemo } from 'react';
import { useTabsStore, isNativeTab } from '../../stores/tabs-store';
import { useFlowStore } from '../../stores/flow-store';
import { useQueryClient } from '@tanstack/react-query';
import { parseGitHubIssueOrPR, parseRelease } from '../../lib/flow-parser';
import type { FlowItem } from '../../types/flow';
import './Inspector.css';

function useResolvedFlowItem(selectedItemId?: string): FlowItem | undefined {
  const queryClient = useQueryClient();
  
  return useMemo(() => {
    if (!selectedItemId) return undefined;

    const flowQueries = queryClient.getQueriesData<any>({ queryKey: ['flow'] });
    
    for (const [key, data] of flowQueries) {
      if (!data || !data.pages) continue;
      
      for (const page of data.pages) {
        const nodes = page?.search?.nodes || page?.releases?.nodes || page?.pullRequests?.nodes || page?.issues?.nodes || [];
        for (const node of nodes) {
          if (node && node.id === selectedItemId) {
            const isRelease = key.includes('releases');
            if (isRelease) {
               return parseRelease(node, '', '', '');
            } else {
               const type = node.__typename === 'Issue' ? 'issue' : 'pull_request';
               return parseGitHubIssueOrPR(node, type);
            }
          }
        }
      }
    }

    const homeQueries = queryClient.getQueriesData<any>({ queryKey: ['homeSummary'] });
    for (const [_, data] of homeQueries) {
      if (!data) continue;
      if (data.previews) {
        for (const stageId of Object.keys(data.previews)) {
          const items = data.previews[stageId];
          const found = items.find((i: FlowItem) => i.id === selectedItemId);
          if (found) return found;
        }
      }
    }

    return undefined;
  }, [selectedItemId, queryClient]);
}

export function Inspector() {
  const { tabs, activeTabId, openBrowserTab } = useTabsStore();
  const flowState = useFlowStore(s => s.getTabState(activeTabId));
  const activeTab = tabs.find(t => t.id === activeTabId);

  const selectedItem = useResolvedFlowItem(flowState.selectedItemId);

  let content: React.ReactNode;

  if (activeTab && isNativeTab(activeTab) && (activeTab.kind === 'flow' || activeTab.kind === 'home')) {
    if (!selectedItem) {
      content = <p className="inspector-empty">Select a card to view details</p>;
    } else {
      const isPR = selectedItem.type === 'pull_request';
      const isIssue = selectedItem.type === 'issue';
      const isRelease = selectedItem.type === 'release';

      content = (
        <div className="inspector-details">
          <section className="inspector-section inspector-header-section">
            <div className="inspector-entity-row">
              <span className="inspector-entity-badge" style={{ backgroundColor: isPR ? 'var(--success-color)' : isIssue ? 'var(--accent-primary)' : isRelease ? 'var(--warning-color)' : 'var(--bg-tertiary)' }}>
                {selectedItem.type === 'pull_request' ? 'Pull Request' : selectedItem.type === 'issue' ? 'Issue' : 'Release'}
              </span>
              <span className="inspector-stage-badge" style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}>
                {selectedItem.stage}
              </span>
              {selectedItem.isDraft && (
                <span className="inspector-stage-badge" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px dashed var(--text-muted)', color: 'var(--text-primary)' }}>Draft</span>
              )}
              {selectedItem.isPrerelease && (
                <span className="inspector-stage-badge" style={{ backgroundColor: 'var(--accent-secondary)' }}>Pre-release</span>
              )}
            </div>
            <h4 className="inspector-title">{selectedItem.title}</h4>
            <p className="inspector-repository">
              {selectedItem.repositoryName} {selectedItem.number ? `#${selectedItem.number}` : ''}
            </p>
          </section>

          <section className="inspector-section">
            <h5 className="section-title">Activity</h5>
            <div className="metadata">
              {selectedItem.author && (
                <div className="meta-row">
                  <span className="meta-key">Author:</span>
                  <span className="meta-val" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {selectedItem.author.avatarUrl && <img src={selectedItem.author.avatarUrl} alt="" style={{ width: '16px', height: '16px', borderRadius: '50%' }} />}
                    {selectedItem.author.login}
                  </span>
                </div>
              )}
              <div className="meta-row">
                <span className="meta-key">Status:</span>
                <span className="meta-val">{selectedItem.status}</span>
              </div>
              <div className="meta-row">
                <span className="meta-key">Created:</span>
                <span className="meta-val">{new Date(selectedItem.createdAt).toLocaleString()}</span>
              </div>
              {selectedItem.updatedAt && (
                <div className="meta-row">
                  <span className="meta-key">Updated:</span>
                  <span className="meta-val">{new Date(selectedItem.updatedAt).toLocaleString()}</span>
                </div>
              )}
              {selectedItem.mergedAt && (
                <div className="meta-row">
                  <span className="meta-key">Merged:</span>
                  <span className="meta-val">{new Date(selectedItem.mergedAt).toLocaleString()}</span>
                </div>
              )}
              {isRelease && selectedItem.publishedAt && (
                <div className="meta-row">
                  <span className="meta-key">Published:</span>
                  <span className="meta-val">{new Date(selectedItem.publishedAt).toLocaleString()}</span>
                </div>
              )}
              {isRelease && selectedItem.tagName && (
                <div className="meta-row">
                  <span className="meta-key">Tag:</span>
                  <span className="meta-val" style={{ fontFamily: 'monospace' }}>{selectedItem.tagName}</span>
                </div>
              )}
            </div>
          </section>

          {selectedItem.inclusionReason && (
            <section className="inspector-section">
              <h5 className="section-title">Why it's here</h5>
              <div className="meta-row">
                <span className="meta-val" style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{selectedItem.inclusionReason}</span>
              </div>
            </section>
          )}

          {isPR && selectedItem.reviewSummary && selectedItem.reviewSummary.state !== 'NONE' && (
            <section className="inspector-section">
              <h5 className="section-title">Reviews</h5>
              <div className="metadata">
                <div className="meta-row">
                  <span className="meta-key">State:</span>
                  <span className="meta-val">{selectedItem.reviewSummary.state.replace('_', ' ')}</span>
                </div>
                {selectedItem.reviewSummary.requestedReviewers && selectedItem.reviewSummary.requestedReviewers.length > 0 && (
                  <div className="meta-row" style={{ gridColumn: '1 / -1' }}>
                    <span className="meta-key">Requested:</span>
                    <span className="meta-val">{selectedItem.reviewSummary.requestedReviewers.join(', ')}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {isPR && selectedItem.checksSummary && selectedItem.checksSummary.state !== 'MISSING' && (
            <section className="inspector-section">
              <h5 className="section-title">Checks</h5>
              <div className="metadata">
                <div className="meta-row">
                  <span className="meta-key">State:</span>
                  <span className="meta-val">{selectedItem.checksSummary.state}</span>
                </div>
              </div>
            </section>
          )}

          {selectedItem.labels && selectedItem.labels.length > 0 && (
            <section className="inspector-section">
              <h5 className="section-title">Labels</h5>
              <div className="labels-container">
                {selectedItem.labels.map((lbl: any) => {
                  const hex = (lbl.color || '888888').replace(/^#/, '').padEnd(6, '0').substring(0, 6);
                  const r = parseInt(hex.substring(0, 2), 16) || 136;
                  const g = parseInt(hex.substring(2, 4), 16) || 136;
                  const b = parseInt(hex.substring(4, 6), 16) || 136;
                  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                  const isPale = luminance > 0.8;
                  const textColor = luminance > 0.5 ? '#111827' : '#ffffff';
                  
                  return (
                    <span 
                      key={lbl.name} 
                      className="label-badge" 
                      style={{ 
                        backgroundColor: `#${hex}`, 
                        color: textColor,
                        border: isPale ? '1px solid rgba(0,0,0,0.15)' : '1px solid transparent'
                      }}
                      title={lbl.name}
                    >
                      {lbl.name}
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          {selectedItem.url && (
            <button 
              className="open-link" 
              onClick={() => openBrowserTab(
                `github:${selectedItem.type}:${selectedItem.repositoryName}:${selectedItem.number || selectedItem.title}`,
                selectedItem.type === 'issue' ? 'issues' : selectedItem.type === 'pull_request' ? 'pullRequests' : 'repository',
                `${selectedItem.type === 'issue' ? 'Issue' : selectedItem.type === 'pull_request' ? 'PR' : 'Release'} ${selectedItem.number ? `#${selectedItem.number}` : ''}`,
                selectedItem.url!,
                false,
                true
              )}
              style={{
                marginTop: 'auto',
                padding: '8px 16px',
                background: 'var(--accent-primary, #58a6ff)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600,
                width: '100%'
              }}
            >
              Open in Tab
            </button>
          )}
        </div>
      );
    }
  } else {
    content = (
      <div className="inspector-details">
        <p className="inspector-empty">
          Inspector is inactive for {activeTab?.title || 'this view'}. Switch to Flow or Home to inspect items.
        </p>
      </div>
    );
  }

  return (
    <div className="inspector">
      <div className="inspector-header">
        <h3>Inspector</h3>
      </div>
      <div className="inspector-content">
        {content}
      </div>
    </div>
  );
}
