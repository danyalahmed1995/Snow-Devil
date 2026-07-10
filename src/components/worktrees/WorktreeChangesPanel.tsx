import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RefreshCw, FileDiff, CheckCircle2 } from 'lucide-react';
import { useWorktreeStore } from '../../worktrees/worktree-store';
import type { WorktreeGitStatus, WorktreeFileDiff } from '../../worktrees/worktree-types';
import { MissingWorktreeView } from './MissingWorktreeView';

interface WorktreeChangesPanelProps {
  worktreeId: string;
  repositoryRootPath: string;
}

export function WorktreeChangesPanel({
  worktreeId,
  repositoryRootPath,
}: WorktreeChangesPanelProps) {
  const [statusData, setStatusData] = useState<WorktreeGitStatus | null>(null);
  const [diffs, setDiffs] = useState<WorktreeFileDiff[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const removeEnvironment = useWorktreeStore((s) => s.removeEnvironment);
  const refreshStatusStore = useWorktreeStore((s) => s.refreshStatus);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // 1. Get status for counts
      const status = await invoke<WorktreeGitStatus>('worktree_status', { worktreePath: worktreeId });
      setStatusData(status);
      
      // Update the global store too while we have it
      void refreshStatusStore(worktreeId);
      
      // 2. Get diffs
      if (!status.isClean) {
        const diffList = await invoke<WorktreeFileDiff[]>('worktree_diff', { worktreePath: worktreeId });
        setDiffs(diffList);
        if (diffList.length > 0 && !selectedFile) {
          setSelectedFile(diffList[0].filePath);
        }
      } else {
        setDiffs([]);
        setSelectedFile(null);
      }
    } catch (e) {
      setError(typeof e === 'string' ? e : String(e));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worktreeId]);

  if (error && error.includes('not found')) { // Assuming "not found" indicates a missing worktree
    return (
      <MissingWorktreeView
        worktreeId={worktreeId}
        repositoryRootPath={repositoryRootPath}
        onRefresh={loadData}
        onRemoveFromList={() => removeEnvironment(worktreeId)}
      />
    );
  }

  if (error) {
    return (
      <div className="wt-error-state">
        <RefreshCw size={32} />
        <h2 className="wt-page-title">Failed to Load Changes</h2>
        <div>{error}</div>
        <button className="wt-action-btn wt-action-btn--secondary" onClick={loadData}>
          Retry
        </button>
      </div>
    );
  }

  const selectedDiff = diffs.find(d => d.filePath === selectedFile);

  const renderDiffContent = (diff: WorktreeFileDiff) => {
    if (diff.isBinary) {
      return (
        <div className="wt-empty-state">
          <FileDiff size={48} style={{ opacity: 0.2 }} />
          <div>Binary file — diff not available</div>
        </div>
      );
    }

    if (!diff.diffText) {
      return (
        <div className="wt-empty-state" style={{ color: 'var(--text-muted)' }}>
          No diff content available (might be an untracked file or empty file)
        </div>
      );
    }

    const lines = diff.diffText.split('\n');
    let leftLineNum = 0;
    let rightLineNum = 0;

    return (
      <div style={{ padding: 'var(--space-2) 0' }}>
        {lines.map((line, idx) => {
          let className = 'wt-diff-line--context';
          let showLeftNum = true;
          let showRightNum = true;
          
          if (line.startsWith('@@')) {
            className = 'wt-diff-line--header';
            showLeftNum = false;
            showRightNum = false;
            
            // Parse line numbers from @@ -a,b +c,d @@
            const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
            if (match) {
              leftLineNum = parseInt(match[1], 10) - 1;
              rightLineNum = parseInt(match[2], 10) - 1;
            }
          } else if (line.startsWith('+') && !line.startsWith('+++')) {
            className = 'wt-diff-line--added';
            showLeftNum = false;
            rightLineNum++;
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            className = 'wt-diff-line--removed';
            leftLineNum++;
            showRightNum = false;
          } else if (!line.startsWith('---') && !line.startsWith('+++')) {
            leftLineNum++;
            rightLineNum++;
          }

          if (line.startsWith('---') || line.startsWith('+++')) {
            return null; // Skip git header lines as they are redundant
          }

          return (
            <div key={idx} className={`wt-diff-line ${className}`}>
              <div className="wt-diff-line__num">{showLeftNum && leftLineNum > 0 ? leftLineNum : ''}</div>
              <div className="wt-diff-line__num">{showRightNum && rightLineNum > 0 ? rightLineNum : ''}</div>
              <div className="wt-diff-line__content">{line}</div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="wt-changes">
      <div className="wt-changes__list">
        <div className="wt-explorer__header" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
            Changes
          </span>
          <button className="icon-button" onClick={loadData} title="Refresh changes">
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          </button>
        </div>
        
        <div style={{ padding: 'var(--space-2) 0' }}>
          {statusData?.isClean ? (
            <div className="wt-empty-state" style={{ padding: 'var(--space-4)' }}>
              <CheckCircle2 size={24} style={{ color: 'var(--success)' }} />
              <div>Working directory is clean</div>
            </div>
          ) : (
            diffs.map(diff => (
              <div
                key={diff.filePath}
                className={`wt-diff-file ${selectedFile === diff.filePath ? 'is-selected' : ''}`}
                onClick={() => setSelectedFile(diff.filePath)}
              >
                <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {diff.filePath}
                  </span>
                  <span className="wt-diff-file__status" style={{
                    color: diff.status === 'M' ? 'var(--warning)' : 
                           diff.status === 'A' || diff.status === '?' ? 'var(--success)' :
                           diff.status === 'D' ? 'var(--danger)' : 'var(--text-muted)'
                  }}>
                    {diff.status}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      
      <div className="wt-changes__diff">
        {selectedDiff ? (
          <>
            <div style={{ position: 'sticky', top: 0, background: 'var(--surface-shell)', padding: 'var(--space-2) var(--space-4)', borderBottom: '1px solid var(--border-subtle)', zIndex: 10, display: 'flex', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                {selectedDiff.filePath}
              </span>
            </div>
            {renderDiffContent(selectedDiff)}
          </>
        ) : (
          <div className="wt-empty-state">
            <FileDiff size={48} style={{ opacity: 0.2 }} />
            <div>Select a file to view changes</div>
          </div>
        )}
      </div>
    </div>
  );
}
