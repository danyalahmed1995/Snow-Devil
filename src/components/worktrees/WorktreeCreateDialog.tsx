import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface WorktreeCreateDialogProps {
  repositoryRootPath: string;
  defaultBranchName?: string;
  defaultBranchBase?: string;
  onClose: () => void;
  onCreated: (worktreeId: string, branch: string) => void;
}

export function WorktreeCreateDialog({
  repositoryRootPath,
  defaultBranchName,
  defaultBranchBase,
  onClose,
  onCreated,
}: WorktreeCreateDialogProps) {
  const [mode, setMode] = useState<'existing' | 'new'>(defaultBranchName ? 'existing' : 'new');
  const [branchName, setBranchName] = useState(defaultBranchName || '');
  const [newBranchName, setNewBranchName] = useState(defaultBranchName || '');
  const [baseBranch, setBaseBranch] = useState(defaultBranchBase || 'main');
  const [destPath, setDestPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Auto-generate destPath suggestion
  useEffect(() => {
    const repoName = repositoryRootPath.split(/[/\\]/).filter(Boolean).pop() || 'repo';
    const targetBranch = mode === 'new' ? newBranchName : branchName;
    if (targetBranch) {
      // replace last segment of repo path
      const lastSlash = Math.max(repositoryRootPath.lastIndexOf('/'), repositoryRootPath.lastIndexOf('\\'));
      if (lastSlash >= 0) {
        const parentPath = repositoryRootPath.substring(0, lastSlash);
        // Use forward slashes for suggestion to be consistent
        setDestPath(`${parentPath}/${repoName}-worktrees/${targetBranch}`);
      }
    }
  }, [mode, branchName, newBranchName, repositoryRootPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!destPath) return;
    if (mode === 'new' && !newBranchName) return;
    if (mode === 'existing' && !branchName) return;

    setIsCreating(true);
    setError(null);
    try {
      const targetBranch = mode === 'new' ? newBranchName : branchName;
      const result = await invoke<any>('worktree_add', {
        repoPath: repositoryRootPath,
        worktreePath: destPath,
        branch: targetBranch,
        newBranch: mode === 'new' ? newBranchName : null,
        baseRef: mode === 'new' ? baseBranch : null,
      });
      onCreated(result.worktreeId, targetBranch);
      onClose();
    } catch (e) {
      setError(typeof e === 'string' ? e : String(e));
      setIsCreating(false);
    }
  };

  const isFormValid =
    destPath.length > 0 &&
    (mode === 'new' ? newBranchName.length > 0 && baseBranch.length > 0 : branchName.length > 0);

  return (
    <div className="wt-dialog-overlay" onClick={onClose}>
      <div className="wt-dialog" onClick={(e) => e.stopPropagation()}>
        <h2 className="wt-dialog__title">Create Worktree</h2>
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div className="wt-form-row" style={{ flexDirection: 'row', gap: 'var(--space-3)' }}>
            <label style={{ display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
              <input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} />
              <span>New branch</span>
            </label>
            <label style={{ display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer' }}>
              <input type="radio" checked={mode === 'existing'} onChange={() => setMode('existing')} />
              <span>Existing branch</span>
            </label>
          </div>

          {mode === 'new' ? (
            <>
              <div className="wt-form-row">
                <label className="wt-form-label">New branch name</label>
                <input
                  type="text"
                  className="wt-form-input"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="e.g. feat/new-feature"
                  autoFocus
                />
              </div>
              <div className="wt-form-row">
                <label className="wt-form-label">Base branch</label>
                <input
                  type="text"
                  className="wt-form-input"
                  value={baseBranch}
                  onChange={(e) => setBaseBranch(e.target.value)}
                  placeholder="e.g. main"
                />
              </div>
            </>
          ) : (
            <div className="wt-form-row">
              <label className="wt-form-label">Branch name</label>
              <input
                type="text"
                className="wt-form-input"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="e.g. existing-branch"
                autoFocus
              />
            </div>
          )}

          <div className="wt-form-row">
            <label className="wt-form-label">Destination path</label>
            <input
              type="text"
              className="wt-form-input"
              value={destPath}
              onChange={(e) => setDestPath(e.target.value)}
              placeholder="/path/to/worktree"
            />
            <div className="wt-form-hint">
              This directory will be created to store the worktree files.
            </div>
          </div>

          <div className="wt-form-row">
            <label className="wt-form-label">Command preview</label>
            <code className="wt-cmd-preview">
              {mode === 'new'
                ? `git worktree add -b "${newBranchName || '<new-branch>'}" "${destPath || '<path>'}" "${baseBranch || 'main'}"`
                : `git worktree add "${destPath || '<path>'}" "${branchName || '<branch>'}"`}
            </code>
          </div>

          {error && <div className="wt-form-error">{error}</div>}

          <div className="wt-dialog__footer">
            <button type="button" className="wt-action-btn wt-action-btn--secondary" onClick={onClose} disabled={isCreating}>
              Cancel
            </button>
            <button type="submit" className="wt-action-btn wt-action-btn--primary" disabled={!isFormValid || isCreating}>
              {isCreating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
