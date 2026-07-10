import { useState } from 'react';
import { GitBranch } from 'lucide-react';
import { useWorktreeStore } from '../../worktrees/worktree-store';
import { WorktreeSelector } from './WorktreeSelector';

interface ActiveWorktreeBadgeProps {
  repositoryRootPath: string;
}

export function ActiveWorktreeBadge({ repositoryRootPath }: ActiveWorktreeBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const activeWorktreeId = useWorktreeStore((s) => s.activeWorktreeId[repositoryRootPath]);
  const discoveredWorktrees = useWorktreeStore((s) => s.discoveredWorktrees[repositoryRootPath]);
  const gitStatusStore = useWorktreeStore((s) => s.gitStatus);

  if (!activeWorktreeId || !discoveredWorktrees) {
    return null;
  }

  const activeWorktree = discoveredWorktrees.find((w) => w.worktreeId === activeWorktreeId);
  if (!activeWorktree) {
    return null;
  }

  const gitStatus = gitStatusStore[activeWorktreeId];
  const isDirty = gitStatus && !gitStatus.isClean;
  const changesCount = isDirty ? gitStatus.modifiedCount + gitStatus.stagedCount + gitStatus.untrackedCount : 0;

  const displayName = activeWorktree.branch || activeWorktree.displayPath.split(/[/\\]/).pop() || 'Unknown';

  return (
    <>
      <div className="wt-active-badge" onClick={() => setIsOpen(!isOpen)} title={`Active Environment: ${activeWorktree.displayPath}`}>
        <GitBranch size={13} style={{ color: isDirty ? 'var(--warning)' : 'inherit' }} />
        <span className="wt-active-badge__branch">{displayName}</span>
        {isDirty && <span className="wt-active-badge__changes">{changesCount}</span>}
      </div>
      
      {isOpen && (
        <WorktreeSelector
          repositoryRootPath={repositoryRootPath}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
