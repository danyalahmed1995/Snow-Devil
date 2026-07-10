import { GitBranch, Lock } from 'lucide-react';
import type { WorktreeInfo, WorktreeGitStatus } from '../../worktrees/worktree-types';

interface WorktreeCardProps {
  worktree: WorktreeInfo;
  isSelected: boolean;
  isActive: boolean;
  gitStatus: WorktreeGitStatus | null;
  onSelect: () => void;
}

function WorktreeStatusBadge({ worktree, gitStatus }: { worktree: WorktreeInfo; gitStatus: WorktreeGitStatus | null }) {
  if (worktree.isLocked) {
    return <span className="wt-badge wt-badge--locked">Locked</span>;
  }
  if (worktree.isPrunable) {
    return <span className="wt-badge wt-badge--prunable">Prunable</span>;
  }
  if (worktree.isDetached) {
    return <span className="wt-badge wt-badge--detached">Detached</span>;
  }
  if (gitStatus) {
    if (gitStatus.isClean) {
      return <span className="wt-badge wt-badge--clean">Clean</span>;
    } else {
      return <span className="wt-badge wt-badge--dirty">Dirty</span>;
    }
  }
  return null;
}

export function WorktreeCard({
  worktree,
  isSelected,
  isActive,
  gitStatus,
  onSelect,
}: WorktreeCardProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
  };

  const isDirty = gitStatus && !gitStatus.isClean;
  const changesText = isDirty
    ? `${gitStatus.modifiedCount} modified, ${gitStatus.untrackedCount} untracked`
    : '';

  return (
    <div
      className={`wt-card ${isSelected ? 'is-selected' : ''}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-pressed={isSelected}
    >
      <div className="wt-card__branch">
        <GitBranch size={14} />
        {worktree.isDetached ? (
          <span style={{ color: 'var(--text-muted)' }}>detached HEAD</span>
        ) : (
          <span>{worktree.branch || 'No branch'}</span>
        )}
        {worktree.isLocked && <Lock size={12} style={{ color: 'var(--text-muted)' }} />}
      </div>
      <div className="wt-card__path" title={worktree.canonicalPath}>
        {worktree.displayPath}
      </div>
      <div className="wt-card__meta">
        <WorktreeStatusBadge worktree={worktree as any} gitStatus={gitStatus} />
        {isActive && <span className="wt-badge wt-badge--active">Active</span>}
        {worktree.isMain && <span className="wt-badge wt-badge--main">Main</span>}
        {changesText && (
          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            {changesText}
          </span>
        )}
      </div>
    </div>
  );
}
