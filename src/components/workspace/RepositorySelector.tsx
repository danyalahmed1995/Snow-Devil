import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useModeStore } from '../../stores/mode-store';
import { DemoDataProvider } from '../../data/demo-provider';

interface Repo {
  id: string;
  name: string; // nameWithOwner
}

interface RepositorySelectorProps {
  selectedRepo?: { id: string; nameWithOwner: string };
  onSelect: (repo: { id: string; nameWithOwner: string }) => void;
  compact?: boolean;
}

export function RepositorySelector({ selectedRepo, onSelect, compact = false }: RepositorySelectorProps) {
  const mode = useModeStore(state => state.mode);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode === 'demo') {
      DemoDataProvider.manifest().then(manifest => setRepos(manifest.repositories.map(repo => ({ id: repo.id, name: repo.nameWithOwner }))));
      return;
    }
    invoke<any[]>('get_viewer_repositories')
      .then(repos => setRepos((repos || []).map(r => ({ id: r.id, name: r.nameWithOwner }))))
      .catch(console.error);
  }, [mode]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredRepos = repos.filter(r => 
    r.name.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 50); // limit to 50

  return (
    <div className={`repository-selector${compact ? ' repository-selector--compact' : ''}`} ref={containerRef} style={{ position: 'relative', width: compact ? '260px' : '300px' }}>
      <input
        type="text"
        placeholder="Select a repository..."
        value={isOpen ? query : (selectedRepo?.nameWithOwner || query)}
        title={selectedRepo?.nameWithOwner}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!isOpen) setIsOpen(true);
        }}
        onFocus={() => {
          setIsOpen(true);
          setQuery(''); // clear query on focus for easy search
        }}
        style={{
          width: '100%',
          height: compact ? '30px' : undefined,
          padding: compact ? '0 10px' : '8px 12px',
          borderRadius: '5px',
          border: '1px solid var(--border-subtle)',
          background: compact ? 'var(--surface-nested)' : 'var(--bg-primary)',
          color: 'var(--text-primary)',
          fontSize: compact ? '11px' : undefined,
          textOverflow: 'ellipsis',
        }}
      />
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '4px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '6px',
          maxHeight: '300px',
          overflowY: 'auto',
          zIndex: 10,
          boxShadow: 'var(--shadow-sm)'
        }}>
          {filteredRepos.length === 0 ? (
            <div style={{ padding: '8px 12px', color: 'var(--text-muted)' }}>No matches found</div>
          ) : (
            filteredRepos.map(repo => (
              <div
                key={repo.id}
                onClick={() => {
                  onSelect({ id: repo.id, nameWithOwner: repo.name });
                  setIsOpen(false);
                }}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border-color)'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                {repo.name}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
