import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface Repo {
  id: string;
  name: string; // nameWithOwner
}

interface RepositorySelectorProps {
  selectedRepo?: { id: string; nameWithOwner: string };
  onSelect: (repo: { id: string; nameWithOwner: string }) => void;
}

export function RepositorySelector({ selectedRepo, onSelect }: RepositorySelectorProps) {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    invoke<Repo[]>('get_all_repositories')
      .then(setRepos)
      .catch(console.error);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Note: when the dropdown is closed the input shows `selectedRepo.nameWithOwner`
  // directly (see `value` below), so no effect is needed to sync `query`.

  const filteredRepos = repos.filter(r =>
    r.name.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 50); // limit to 50

  return (
    <div className="repository-selector" ref={containerRef} style={{ position: 'relative', width: '300px' }}>
      <input
        type="text"
        placeholder="Select a repository..."
        value={isOpen ? query : (selectedRepo?.nameWithOwner || query)}
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
          padding: '8px 12px',
          borderRadius: '6px',
          border: '1px solid var(--border-color)',
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
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
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
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
