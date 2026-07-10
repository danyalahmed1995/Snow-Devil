import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useWorktreeStore } from '../../worktrees/worktree-store';
import type { WorktreeInfo, WorktreeGitStatus } from '../../worktrees/worktree-types';

interface WorktreeRemoveDialogProps {
  worktree: WorktreeInfo;
  gitStatus: WorktreeGitStatus | null;
  repositoryRootPath: string;
  onClose: () => void;
  onRemoved: () => void;
}

export function WorktreeRemoveDialog({
  worktree,
  gitStatus,
  repositoryRootPath,
  onClose,
  onRemoved,
}: WorktreeRemoveDialogProps) {
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const removeEnvironment = useWorktreeStore((s) => s.removeEnvironment);

  const isDirty = gitStatus && (gitStatus.modifiedCount > 0 || gitStatus.stagedCount > 0);
  const branchName = worktree.branch || '';

  const handleRemove = async () => {
    if (confirmText !== branchName && !worktree.isDetached) return;
    setIsRemoving(true);
    setError(null);
    try {
      await invoke('worktree_remove', {
        repoPath: repositoryRootPath,
        worktreePath: worktree.canonicalPath,
        force: false,
      });
      removeEnvironment(worktree.worktreeId);
      onRemoved();
    } catch (e) {
      setError(typeof e === 'string' ? e : String(e));
      setIsRemoving(false);
    }
  };

  return (
    <div className="wt-dialog-overlay" onClick={onClose}>
      <div className="wt-dialog" onClick={(e) => e.stopPropagation()}>
        <h2 className="wt-dialog__title">Remove Worktree</h2>
        
        {isDirty ? (
          <div className="wt-form-row">
            <div className="wt-form-label" style={{ color: 'var(--warning)' }}>
              Cannot remove — uncommitted changes
            </div>
            <div className="wt-form-hint">
              This worktree has {gitStatus.modifiedCount} modified and {gitStatus.stagedCount} staged files.
              Please commit, stash, or discard these changes before removing the worktree.
            </div>
            <div className="wt-dialog__footer" style={{ marginTop: 'var(--space-4)' }}>
              <button className="wt-action-btn wt-action-btn--secondary" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="wt-form-row">
              <div className="wt-form-hint">
                The local directory will be deleted, but the branch will remain in the repository.
              </div>
              <code className="wt-cmd-preview" style={{ marginTop: 'var(--space-2)' }}>
                {worktree.displayPath}
              </code>
            </div>

            {!worktree.isDetached && (
              <div className="wt-form-row" style={{ marginTop: 'var(--space-2)' }}>
                <label className="wt-form-label">Type branch name to confirm:</label>
                <input
                  type="text"
                  className="wt-form-input"
                  placeholder={branchName}
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoFocus
                />
              </div>
            )}

            {error && <div className="wt-form-error">{error}</div>}

            <div className="wt-dialog__footer" style={{ marginTop: 'var(--space-4)' }}>
              <button
                className="wt-action-btn wt-action-btn--secondary"
                onClick={onClose}
                disabled={isRemoving}
              >
                Cancel
              </button>
              <button
                className="wt-action-btn wt-action-btn--danger"
                onClick={handleRemove}
                disabled={isRemoving || (!worktree.isDetached && confirmText !== branchName)}
              >
                {isRemoving ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
