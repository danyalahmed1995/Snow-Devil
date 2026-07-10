import { GitBranch, FolderOpen } from 'lucide-react';
import { useWorktreeStore } from '../../worktrees/worktree-store';
import { useTabsStore } from '../../stores/tabs-store';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';
import { MissingWorktreeView } from './MissingWorktreeView';
import { WorktreeRemoveDialog } from './WorktreeRemoveDialog';

interface WorktreeInspectorProps {
  worktreeId: string | null;
  repositoryRootPath: string;
  onOpenEnvironment: (worktreeId: string) => void;
  onRemoved: () => void;
}

export function WorktreeInspector({
  worktreeId,
  repositoryRootPath,
  onOpenEnvironment,
  onRemoved,
}: WorktreeInspectorProps) {
  const discoveredWorktrees = useWorktreeStore((s) => s.discoveredWorktrees[repositoryRootPath]);
  const gitStatus = useWorktreeStore((s) => s.gitStatus);
  const environments = useWorktreeStore((s) => s.environments);
  const setActiveWorktree = useWorktreeStore((s) => s.setActiveWorktree);
  const removeEnvironment = useWorktreeStore((s) => s.removeEnvironment);
  const openWorktreeLocalTab = useTabsStore((s) => s.openWorktreeLocalTab);

  const [showRemoveDialog, setShowRemoveDialog] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);

  if (!worktreeId) {
    return (
      <div className="wt-inspector__empty">
        <GitBranch size={48} style={{ opacity: 0.2 }} />
        <div>Select a worktree to view details</div>
      </div>
    );
  }

  const worktree = discoveredWorktrees?.find((w) => w.worktreeId === worktreeId);
  const env = environments[worktreeId];
  const status = gitStatus[worktreeId];

  if (!worktree) {
    return (
      <MissingWorktreeView
        worktreeId={worktreeId}
        repositoryRootPath={repositoryRootPath}
        onRefresh={() => useWorktreeStore.getState().discoverWorktrees(repositoryRootPath)}
        onRemoveFromList={() => {
          removeEnvironment(worktreeId);
          onRemoved();
        }}
      />
    );
  }

  const friendlyName = env?.friendlyName || worktree.branch || 'Unknown';

  const runAction = async (actionId: string, action: () => Promise<void>) => {
    setActiveAction(actionId);
    try {
      await action();
    } finally {
      setActiveAction(null);
    }
  };

  const handleOpenEnv = () => {
    setActiveWorktree(repositoryRootPath, worktreeId);
    onOpenEnvironment(worktreeId);
  };

  const handleBrowseFiles = () => {
    openWorktreeLocalTab(worktreeId, repositoryRootPath, 'worktreeLocalExplorer', `Files: ${friendlyName}`);
  };

  const handleViewChanges = () => {
    openWorktreeLocalTab(worktreeId, repositoryRootPath, 'worktreeChanges', `Changes: ${friendlyName}`);
  };

  const handleReveal = () => runAction('reveal', async () => {
    await invoke('open_path_in_file_manager', { path: worktree.canonicalPath });
  });

  const handleOpenEditor = () => runAction('editor', async () => {
    await invoke('open_in_external_editor', { path: worktree.canonicalPath });
  });

  const handleCopyPath = () => {
    navigator.clipboard.writeText(worktree.displayPath);
  };

  const handleLockUnlock = () => runAction('lock', async () => {
    if (worktree.isLocked) {
      await invoke('worktree_unlock', { repoPath: repositoryRootPath, worktreePath: worktree.canonicalPath });
    } else {
      await invoke('worktree_lock', { repoPath: repositoryRootPath, worktreePath: worktree.canonicalPath, reason: 'Locked by Snow Devil' });
    }
    await useWorktreeStore.getState().discoverWorktrees(repositoryRootPath);
  });

  return (
    <div className="wt-inspector">
      <div className="wt-inspector__header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <h3 style={{ fontSize: 'var(--type-section-title)', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            {friendlyName}
          </h3>
          {worktree.branch && <span className="wt-badge wt-badge--main">{worktree.branch}</span>}
        </div>
      </div>

      <div className="wt-inspector__body">
        <div className="wt-inspector__section">
          <div className="wt-inspector__section-label">Details</div>
          <div className="wt-inspector__row">
            <span className="wt-inspector__row-label">Path</span>
            <span className="wt-inspector__row-value" title={worktree.displayPath}>{worktree.displayPath}</span>
          </div>
          <div className="wt-inspector__row">
            <span className="wt-inspector__row-label">HEAD</span>
            <span className="wt-inspector__row-value">{worktree.headSha?.substring(0, 8) || 'Unknown'}</span>
          </div>
          {worktree.isLocked && (
            <div className="wt-inspector__row">
              <span className="wt-inspector__row-label">Locked</span>
              <span className="wt-inspector__row-value" style={{ color: 'var(--info)' }}>{worktree.lockedReason || 'Yes'}</span>
            </div>
          )}
        </div>

        {status && (
          <div className="wt-inspector__section">
            <div className="wt-inspector__section-label">Git Status</div>
            <div className="wt-inspector__row">
              <span className="wt-inspector__row-label">State</span>
              <span className={`wt-badge ${status.isClean ? 'wt-badge--clean' : 'wt-badge--dirty'}`}>
                {status.isClean ? 'Clean' : 'Uncommitted Changes'}
              </span>
            </div>
            {!status.isClean && (
              <>
                <div className="wt-inspector__row">
                  <span className="wt-inspector__row-label">Modified</span>
                  <span className="wt-inspector__row-value">{status.modifiedCount} files</span>
                </div>
                <div className="wt-inspector__row">
                  <span className="wt-inspector__row-label">Staged</span>
                  <span className="wt-inspector__row-value">{status.stagedCount} files</span>
                </div>
                <div className="wt-inspector__row">
                  <span className="wt-inspector__row-label">Untracked</span>
                  <span className="wt-inspector__row-value">{status.untrackedCount} files</span>
                </div>
              </>
            )}
          </div>
        )}

        <div className="wt-inspector__section" style={{ marginTop: 'auto' }}>
          <div className="wt-inspector__actions">
            <button className="wt-action-btn wt-action-btn--primary" onClick={handleOpenEnv}>
              <FolderOpen size={16} /> Open Environment
            </button>
            <div className="wt-action-row">
              <button className="wt-action-btn wt-action-btn--secondary" onClick={handleBrowseFiles}>
                Browse Files
              </button>
              <button className="wt-action-btn wt-action-btn--secondary" onClick={handleViewChanges}>
                View Changes
              </button>
            </div>
            <div className="wt-action-row">
              <button className="wt-action-btn wt-action-btn--secondary" onClick={handleReveal} disabled={activeAction === 'reveal'}>
                Reveal in OS
              </button>
              <button className="wt-action-btn wt-action-btn--secondary" onClick={handleOpenEditor} disabled={activeAction === 'editor'}>
                Open in Editor
              </button>
            </div>
            <div className="wt-action-row">
              <button className="wt-action-btn wt-action-btn--secondary" onClick={handleCopyPath}>
                Copy Path
              </button>
              <button className="wt-action-btn wt-action-btn--secondary" onClick={handleLockUnlock} disabled={activeAction === 'lock'}>
                {worktree.isLocked ? 'Unlock' : 'Lock'}
              </button>
            </div>
            <button
              className="wt-action-btn wt-action-btn--danger"
              onClick={() => setShowRemoveDialog(true)}
              disabled={worktree.isMain}
              title={worktree.isMain ? 'Cannot remove the main worktree' : ''}
              style={{ marginTop: 'var(--space-2)' }}
            >
              Remove Worktree
            </button>
          </div>
        </div>
      </div>

      {showRemoveDialog && (
        <WorktreeRemoveDialog
          worktree={worktree}
          gitStatus={status || null}
          repositoryRootPath={repositoryRootPath}
          onClose={() => setShowRemoveDialog(false)}
          onRemoved={() => {
            setShowRemoveDialog(false);
            onRemoved();
          }}
        />
      )}
    </div>
  );
}
