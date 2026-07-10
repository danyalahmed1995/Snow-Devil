import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useShallow } from 'zustand/react/shallow';
import { useTabsStore } from '../../stores/tabs-store';
import { useWorktreeStore } from '../../worktrees/worktree-store';
import { ChevronRight, ChevronDown, Folder, File, FileCode2, RefreshCw } from 'lucide-react';
import type { WorktreeLocalEntry } from '../../worktrees/worktree-types';

interface WorktreeLocalExplorerProps {
  worktreeId: string;
  repositoryRootPath: string;
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') {
    return <FileCode2 size={14} style={{ color: 'var(--info)' }} />;
  }
  return <File size={14} style={{ color: 'var(--text-muted)' }} />;
}

export function WorktreeLocalExplorer({
  worktreeId,
  repositoryRootPath,
}: WorktreeLocalExplorerProps) {
  const [entries, setEntries] = useState<Record<string, WorktreeLocalEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']));
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const openWorktreeLocalTab = useTabsStore((s) => s.openWorktreeLocalTab);
  const context = useWorktreeStore(useShallow((s) => s.getWorktreeContext(worktreeId)));

  const loadDirectory = useCallback(async (dirPath: string) => {
    setIsLoading(prev => ({ ...prev, [dirPath]: true }));
    setError(null);
    try {
      const result = await invoke<WorktreeLocalEntry[]>('list_local_directory', {
        worktreeRoot: worktreeId,
        relativePath: dirPath,
      });
      setEntries(prev => ({ ...prev, [dirPath]: result }));
      setExpanded(prev => new Set(prev).add(dirPath));
    } catch (e) {
      if (dirPath === '') {
        setError(typeof e === 'string' ? e : String(e));
      }
    } finally {
      setIsLoading(prev => ({ ...prev, [dirPath]: false }));
    }
  }, [worktreeId]);

  useEffect(() => {
    void loadDirectory('');
  }, [loadDirectory]);

  const toggleDir = (dirPath: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
        if (!entries[dirPath]) {
          void loadDirectory(dirPath);
        }
      }
      return next;
    });
  };

  const handleFileClick = (entry: WorktreeLocalEntry) => {
    setSelectedPath(entry.path);
    openWorktreeLocalTab(
      worktreeId,
      repositoryRootPath,
      'worktreeLocalFile',
      entry.name,
      entry.path
    );
  };

  const renderTree = (dirPath: string, depth: number) => {
    const dirEntries = entries[dirPath];
    if (!dirEntries) {
      if (isLoading[dirPath]) {
        return (
          <div className="wt-file-entry" style={{ paddingLeft: `${depth * 16 + 8}px` }}>
            <span style={{ color: 'var(--text-muted)' }}>Loading...</span>
          </div>
        );
      }
      return null;
    }

    return dirEntries.map(entry => {
      if (entry.isDir) {
        const isExpanded = expanded.has(entry.path);
        return (
          <div key={entry.path}>
            <div
              className={`wt-file-entry ${selectedPath === entry.path ? 'is-selected' : ''}`}
              style={{ paddingLeft: `${depth * 16 + 8}px` }}
              onClick={() => toggleDir(entry.path)}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Folder size={14} style={{ color: 'var(--accent)' }} />
              <span className="wt-file-entry__name">{entry.name}</span>
            </div>
            {isExpanded && renderTree(entry.path, depth + 1)}
          </div>
        );
      }

      return (
        <div
          key={entry.path}
          className={`wt-file-entry ${selectedPath === entry.path ? 'is-selected' : ''}`}
          style={{ paddingLeft: `${depth * 16 + 8 + 14}px` }} // +14 to align with chevron
          onClick={() => handleFileClick(entry)}
        >
          {getFileIcon(entry.name)}
          <span className="wt-file-entry__name">{entry.name}</span>
        </div>
      );
    });
  };

  return (
    <div className="wt-explorer">
      <div className="wt-explorer__sidebar">
        <div className="wt-explorer__header" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {context?.friendlyName || 'Explorer'}
          </span>
          <button className="icon-button" onClick={() => loadDirectory('')} title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
        
        <div style={{ padding: 'var(--space-2) 0' }}>
          {error ? (
            <div className="wt-error-state" style={{ padding: 'var(--space-4)' }}>
              <div>Failed to load directory</div>
              <button className="wt-action-btn wt-action-btn--secondary" onClick={() => loadDirectory('')}>
                Retry
              </button>
            </div>
          ) : (
            renderTree('', 0)
          )}
        </div>
      </div>
      
      <div className="wt-explorer__main">
        <div className="wt-empty-state">
          <File size={48} style={{ opacity: 0.2 }} />
          <div>Select a file to view</div>
        </div>
      </div>
    </div>
  );
}
