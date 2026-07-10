import { AlertTriangle } from 'lucide-react';

interface MissingWorktreeViewProps {
  worktreeId: string;
  repositoryRootPath: string;
  onRefresh: () => void;
  onRemoveFromList: () => void;
}

export function MissingWorktreeView({
  worktreeId,
  onRefresh,
  onRemoveFromList,
}: MissingWorktreeViewProps) {
  return (
    <div className="wt-missing-view">
      <AlertTriangle size={32} color="var(--warning)" />
      <h2 className="wt-page-title">Worktree Not Found</h2>
      <p style={{ color: 'var(--text-muted)' }}>
        The local path no longer exists.
      </p>
      <code className="wt-cmd-preview" style={{ alignSelf: 'stretch' }}>
        {worktreeId}
      </code>
      <div className="wt-action-row" style={{ marginTop: 'var(--space-4)', width: '100%', maxWidth: '300px' }}>
        <button className="wt-action-btn wt-action-btn--secondary" onClick={onRefresh}>
          Refresh
        </button>
        <button className="wt-action-btn wt-action-btn--danger" onClick={onRemoveFromList}>
          Remove from List
        </button>
      </div>
    </div>
  );
}
