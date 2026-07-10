import { useState, useEffect } from 'react';
import { useTabsStore } from '../../stores/tabs-store';
import { useWorktreeStore } from '../../worktrees/worktree-store';
import { useWorkspaceAssociationStore } from '../../worktrees/workspace-association-store';
import { WorktreeList } from './WorktreeList';
import { WorktreeInspector } from './WorktreeInspector';
import { WorktreeCreateDialog } from './WorktreeCreateDialog';
import { GitBranch, FolderOpen } from 'lucide-react';
import './WorktreeEnvironmentsPage.css';

export function WorktreeEnvironmentsPage() {
  const repositorySession = useWorktreeStore((s) => s.repositorySession);
  const repoPath = repositorySession?.repositoryRootPath || null;
  const setRepoPath = (path: string | null) => {
    if (path) {
      useWorktreeStore.getState().openRepositorySession(path);
    } else {
      useWorktreeStore.getState().closeRepositorySession();
    }
  };

  const selectedWorktreeId = repositorySession?.selectedWorktreeId || null;
  const setSelectedWorktreeId = (id: string | null) => {
    useWorktreeStore.getState().setSelectedWorktreeId(id);
  };

  const [inputPath, setInputPath] = useState('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const discoverWorktrees = useWorktreeStore((s) => s.discoverWorktrees);
  const discoveredWorktrees = useWorktreeStore((s) => repoPath ? s.discoveredWorktrees[repoPath] : undefined);

  // Read context to see if we arrived with a pre-filled branch and should auto-open the create dialog
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const activeTab = useTabsStore((s) => s.tabs.find(t => t.id === activeTabId));
  const context = activeTab && activeTab.kind === 'worktreeEnvironments' && activeTab.family === 'native' && activeTab.context?.type === 'worktreeEnvironments' 
    ? activeTab.context 
    : undefined;
  const defaultBranchName = context?.defaultBranchName;
  const defaultBranchBase = context?.defaultBranchBase;
  const linkSourceItemType = context?.linkSourceItemType;
  const linkSourceItemId = context?.linkSourceItemId;
  const linkSourceRepositoryId = context?.linkSourceRepositoryId;

  // Auto-show dialog on first mount if we have a default branch seeded
  useEffect(() => {
    if (defaultBranchName && repoPath) {
      setShowCreateDialog(true);
    }
  }, [defaultBranchName, repoPath]);

  useEffect(() => {
    if (repoPath) {
      void discoverWorktrees(repoPath);
    }
  }, [repoPath, discoverWorktrees]);

  const handleOpenRepo = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputPath.trim()) {
      // In a real implementation we might validate this is a git repo first
      setRepoPath(inputPath.trim());
    }
  };

  if (!repoPath) {
    return (
      <div className="wt-page">
        <div className="wt-page-header">
          <GitBranch size={20} className="text-muted" />
          <h1 className="wt-page-title">Worktree Environments</h1>
        </div>
        <div className="wt-repo-input">
          <div className="wt-empty-state__icon">
            <FolderOpen size={48} />
          </div>
          <h2 className="wt-repo-input__title">Open a Repository</h2>
          <p className="wt-repo-input__hint" style={{ maxWidth: '400px', margin: '0 auto' }}>
            Enter the path to a Git repository to manage its worktree environments.
          </p>
          <form onSubmit={handleOpenRepo} className="wt-repo-input__form" style={{ marginTop: 'var(--space-4)' }}>
            <input
              type="text"
              className="wt-form-input wt-repo-input__input"
              placeholder="e.g. C:\Projects\MyRepo"
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              autoFocus
            />
            <button type="submit" className="wt-action-btn wt-action-btn--primary" style={{ width: 'auto' }} disabled={!inputPath.trim()}>
              Open
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="wt-page">
      <div className="wt-page-header">
        <GitBranch size={20} className="text-muted" />
        <h1 className="wt-page-title">Worktree Environments</h1>
        <div style={{ marginLeft: 'auto', fontSize: 'var(--type-meta)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {repoPath}
        </div>
        <button
          className="icon-button"
          onClick={() => setRepoPath(null)}
          title="Change repository"
          style={{ marginLeft: 'var(--space-2)' }}
        >
          <FolderOpen size={16} />
        </button>
      </div>

      <div className="wt-page-body">
        <WorktreeList
          repositoryRootPath={repoPath}
          selectedWorktreeId={selectedWorktreeId}
          onSelect={setSelectedWorktreeId}
          onCreateNew={() => setShowCreateDialog(true)}
        />
        <WorktreeInspector
          worktreeId={selectedWorktreeId}
          repositoryRootPath={repoPath}
          onOpenEnvironment={() => {
            if (!selectedWorktreeId) return;
            const friendlyName = discoveredWorktrees?.find(w => w.worktreeId === selectedWorktreeId)?.branch 
              || selectedWorktreeId.split(/[/\\]/).pop() || 'Environment';
            useTabsStore.getState().openWorktreeLocalTab(selectedWorktreeId, repoPath, 'worktreeLocalExplorer', `Files: ${friendlyName}`);
          }}
          onRemoved={() => {
            setSelectedWorktreeId(null);
            void discoverWorktrees(repoPath);
          }}
        />
      </div>

      {showCreateDialog && (
        <WorktreeCreateDialog
          repositoryRootPath={repoPath}
          defaultBranchName={defaultBranchName}
          defaultBranchBase={defaultBranchBase}
          onClose={() => setShowCreateDialog(false)}
          onCreated={(newId, createdBranch) => {
            setSelectedWorktreeId(newId);
            void discoverWorktrees(repoPath);

            if (linkSourceItemType && linkSourceItemId && linkSourceRepositoryId) {
              const associationId = `${linkSourceItemType}:${linkSourceRepositoryId}:${linkSourceItemId}`;
              useWorkspaceAssociationStore.getState().linkWorkspace({
                associationId,
                repositoryId: linkSourceRepositoryId,
                itemType: linkSourceItemType,
                itemId: linkSourceItemId,
                worktreeId: newId,
                branch: createdBranch,
                canonicalPath: repoPath
              });
            }
          }}
        />
      )}
    </div>
  );
}
