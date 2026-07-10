import { useEffect, useRef } from 'react';
import { useWorktreeStore } from '../../worktrees/worktree-store';
import { GitBranch, Lock } from 'lucide-react';

interface WorktreeSelectorProps {
  repositoryRootPath: string;
  onClose: () => void;
}

export function WorktreeSelector({ repositoryRootPath, onClose }: WorktreeSelectorProps) {
  const discoveredWorktrees = useWorktreeStore((s) => s.discoveredWorktrees[repositoryRootPath]);
  const activeWorktreeId = useWorktreeStore((s) => s.activeWorktreeId[repositoryRootPath]);
  const setActiveWorktree = useWorktreeStore((s) => s.setActiveWorktree);
  const gitStatusStore = useWorktreeStore((s) => s.gitStatus);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    // Use timeout to prevent immediate close if opened via click
    setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  if (!discoveredWorktrees || discoveredWorktrees.length === 0) return null;

  const sortedWorktrees = [...discoveredWorktrees].sort((a, b) => {
    if (a.isMain && !b.isMain) return -1;
    if (!a.isMain && b.isMain) return 1;
    const aName = a.branch || a.displayPath;
    const bName = b.branch || b.displayPath;
    return aName.localeCompare(bName);
  });

  return (
    <div className="wt-selector" ref={ref} style={{ top: '48px', left: 'auto', right: '12px' }}>
      <div style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--border-subtle)', fontWeight: 600, color: 'var(--text-primary)' }}>
        Switch Environment
      </div>
      
      {sortedWorktrees.map((worktree) => {
        const isActive = worktree.worktreeId === activeWorktreeId;
        const status = gitStatusStore[worktree.worktreeId];
        const isDirty = status && !status.isClean;
        const displayName = worktree.branch || worktree.displayPath.split(/[/\\]/).pop() || 'Unknown';
        
        return (
          <div
            key={worktree.worktreeId}
            className={`wt-selector__item ${isActive ? 'is-active' : ''}`}
            onClick={() => {
              setActiveWorktree(repositoryRootPath, worktree.worktreeId);
              onClose();
            }}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveWorktree(repositoryRootPath, worktree.worktreeId);
                onClose();
              }
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <GitBranch size={14} style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }} />
              <span style={{ fontWeight: isActive ? 600 : 500, color: isActive ? 'var(--accent)' : 'var(--text-primary)' }}>
                {displayName}
              </span>
              {worktree.isLocked && <Lock size={12} style={{ color: 'var(--text-muted)' }} />}
              {isDirty && <span style={{ marginLeft: 'auto', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--warning)' }} title="Uncommitted changes" />}
            </div>
            <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {worktree.displayPath}
            </div>
          </div>
        );
      })}
    </div>
  );
}
