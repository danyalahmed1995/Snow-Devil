import { Plus, RefreshCw } from 'lucide-react';
import { WorktreeCard } from './WorktreeCard';
import { useWorktreeStore } from '../../worktrees/worktree-store';
import { useEffect } from 'react';

interface WorktreeListProps {
  repositoryRootPath: string;
  selectedWorktreeId: string | null;
  onSelect: (worktreeId: string) => void;
  onCreateNew: () => void;
}

export function WorktreeList({
  repositoryRootPath,
  selectedWorktreeId,
  onSelect,
  onCreateNew,
}: WorktreeListProps) {
  const discoveredWorktrees = useWorktreeStore((s) => s.discoveredWorktrees[repositoryRootPath]);
  const discoveryStatus = useWorktreeStore((s) => s.discoveryStatus[repositoryRootPath] || 'idle');
  const discoveryError = useWorktreeStore((s) => s.discoveryError[repositoryRootPath]);
  const activeWorktreeId = useWorktreeStore((s) => s.activeWorktreeId[repositoryRootPath]);
  const gitStatus = useWorktreeStore((s) => s.gitStatus);
  const discoverWorktrees = useWorktreeStore((s) => s.discoverWorktrees);

  // Auto-select active worktree on first render
  useEffect(() => {
    if (!selectedWorktreeId && activeWorktreeId && discoveredWorktrees?.length) {
      onSelect(activeWorktreeId);
    }
  }, [selectedWorktreeId, activeWorktreeId, discoveredWorktrees, onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!discoveredWorktrees || discoveredWorktrees.length === 0) return;
    
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const currentIndex = discoveredWorktrees.findIndex(w => w.worktreeId === selectedWorktreeId);
      let nextIndex = currentIndex;
      
      if (e.key === 'ArrowDown') {
        nextIndex = currentIndex < discoveredWorktrees.length - 1 ? currentIndex + 1 : 0;
      } else {
        nextIndex = currentIndex > 0 ? currentIndex - 1 : discoveredWorktrees.length - 1;
      }
      
      onSelect(discoveredWorktrees[nextIndex].worktreeId);
    }
  };

  const handleRefresh = () => {
    void discoverWorktrees(repositoryRootPath);
  };

  if (discoveryStatus === 'loading' && !discoveredWorktrees) {
    return (
      <div className="wt-list">
        <div className="wt-skeleton wt-skeleton--card" />
        <div className="wt-skeleton wt-skeleton--card" />
        <div className="wt-skeleton wt-skeleton--card" />
      </div>
    );
  }

  if (discoveryStatus === 'error' && !discoveredWorktrees) {
    return (
      <div className="wt-list wt-error-state">
        <div className="wt-error-state__icon">
          <RefreshCw size={24} />
        </div>
        <div>{discoveryError || 'Failed to load worktrees'}</div>
        <button className="wt-action-btn wt-action-btn--secondary" onClick={handleRefresh}>
          Retry
        </button>
      </div>
    );
  }

  if (!discoveredWorktrees || discoveredWorktrees.length === 0) {
    return (
      <div className="wt-list wt-empty-state">
        <div className="wt-empty-state__icon">
          <Plus size={24} />
        </div>
        <div>No worktrees found</div>
        <button className="wt-action-btn wt-action-btn--primary" onClick={onCreateNew}>
          Create first worktree
        </button>
      </div>
    );
  }

  // Sort: main first, then alphabetical by branch
  const sortedWorktrees = [...discoveredWorktrees].sort((a, b) => {
    if (a.isMain && !b.isMain) return -1;
    if (!a.isMain && b.isMain) return 1;
    const aName = a.branch || a.displayPath;
    const bName = b.branch || b.displayPath;
    return aName.localeCompare(bName);
  });

  return (
    <div className="wt-list" onKeyDown={handleKeyDown}>
      <button className="wt-action-btn wt-action-btn--secondary" onClick={onCreateNew} style={{ marginBottom: 'var(--space-2)' }}>
        <Plus size={16} /> New worktree
      </button>
      
      {sortedWorktrees.map((worktree) => (
        <WorktreeCard
          key={worktree.worktreeId}
          worktree={worktree}
          isSelected={worktree.worktreeId === selectedWorktreeId}
          isActive={worktree.worktreeId === activeWorktreeId}
          gitStatus={gitStatus[worktree.worktreeId] || null}
          onSelect={() => onSelect(worktree.worktreeId)}
        />
      ))}
    </div>
  );
}
