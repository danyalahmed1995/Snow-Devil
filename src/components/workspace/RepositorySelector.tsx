import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useModeStore } from '../../stores/mode-store';
import { DemoDataProvider } from '../../data/demo-provider';
import { Select } from '../ui/Select';

interface Repo {
  id: string;
  name: string;
}

interface RepositorySelectorProps {
  selectedRepo?: { id: string; nameWithOwner: string };
  onSelect: (repo: { id: string; nameWithOwner: string }) => void;
  compact?: boolean;
}

export function RepositorySelector({ selectedRepo, onSelect, compact = false }: RepositorySelectorProps) {
  const mode = useModeStore(state => state.mode);
  const [repos, setRepos] = useState<Repo[]>([]);

  useEffect(() => {
    if (mode === 'demo') {
      void DemoDataProvider.manifest().then(manifest => setRepos(manifest.repositories.map(repo => ({ id: repo.id, name: repo.nameWithOwner }))));
      return;
    }
    void invoke<Array<{ id: string; nameWithOwner: string }>>('get_viewer_repositories')
      .then(values => setRepos((values || []).map(repo => ({ id: repo.id, name: repo.nameWithOwner }))))
      .catch(console.error);
  }, [mode]);

  const options = [
    ...(!selectedRepo ? [{ value: '', label: 'Select a repository…', disabled: true, disabledReason: 'Choose a repository to continue' }] : []),
    ...repos.map(repo => ({ value: repo.id, label: repo.name })),
  ];
  return <div className={`repository-selector${compact ? ' repository-selector--compact' : ''}`} style={{ width: compact ? 260 : 300 }}>
    <Select value={selectedRepo?.id ?? ''} options={options} ariaLabel="Repository" searchable searchPlaceholder="Search repositories…" onChange={id => {
      const repo = repos.find(value => value.id === id);
      if (repo) onSelect({ id: repo.id, nameWithOwner: repo.name });
    }} />
  </div>;
}
