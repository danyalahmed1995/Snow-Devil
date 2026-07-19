import { useEffect, useState } from 'react';
import { useModeStore } from '../../stores/mode-store';
import { DemoDataProvider } from '../../data/demo-provider';
import { Select } from '../ui/Select';
import { useAccountRepositories } from '../../hooks/useAccountContext';

interface Repo {
  id: string;
  name: string;
}

interface RepositorySelectorProps {
  selectedRepo?: { id: string; nameWithOwner: string };
  onSelect: (repo: { id: string; nameWithOwner: string }) => void;
  compact?: boolean;
}

export function resolveRepositorySelectionId(repositories: Repo[], selectedRepo?: { id: string; nameWithOwner: string }): string {
  if (!selectedRepo) return '';
  return repositories.find(repo => repo.id === selectedRepo.id || repo.name.toLowerCase() === selectedRepo.nameWithOwner.toLowerCase())?.id ?? selectedRepo.id;
}

export function RepositorySelector({ selectedRepo, onSelect, compact = false }: RepositorySelectorProps) {
  const mode = useModeStore(state => state.mode);
  const [repos, setRepos] = useState<Repo[]>([]);
  const accountRepositories = useAccountRepositories();

  useEffect(() => {
    if (mode === 'demo') {
      void DemoDataProvider.manifest().then(manifest => setRepos(manifest.repositories.map(repo => ({ id: repo.id, name: repo.nameWithOwner }))));
      return;
    }
    Promise.resolve().then(() => setRepos((accountRepositories.data ?? []).map(repo => ({ id: repo.id, name: repo.nameWithOwner }))));
  }, [accountRepositories.data, mode]);

  const options = [
    ...(!selectedRepo ? [{ value: '', label: 'Select a repository…', disabled: true, disabledReason: 'Choose a repository to continue' }] : []),
    ...repos.map(repo => ({ value: repo.id, label: repo.name })),
  ];
  const selectedId = resolveRepositorySelectionId(repos, selectedRepo);
  return <div className={`repository-selector${compact ? ' repository-selector--compact' : ''}`} style={{ width: compact ? 260 : 300 }}>
    <Select value={selectedId} options={options} ariaLabel="Repository" searchable searchPlaceholder="Search repositories…" onChange={id => {
      const repo = repos.find(value => value.id === id);
      if (repo) onSelect({ id: repo.id, nameWithOwner: repo.name });
    }} />
  </div>;
}
