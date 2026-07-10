import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Folder, FolderOpen, AlertCircle, CheckCircle2, Settings, RefreshCw } from 'lucide-react';
import { useWorkspaceAssociationStore } from '../../worktrees/workspace-association-store';
import { useTabsStore } from '../../stores/tabs-store';
import { useWorktreeStore } from '../../worktrees/worktree-store';

export function RepositoryLocalMapping({ repositoryId }: { repositoryId: string }) {
  const mapping = useWorkspaceAssociationStore((s) => s.repositoryMappings[repositoryId]);
  const mapRepository = useWorkspaceAssociationStore((s) => s.mapRepository);
  const verifyMapping = useWorkspaceAssociationStore((s) => s.verifyMapping);
  const forgetMapping = useWorkspaceAssociationStore((s) => s.forgetMapping);
  
  const environments = useWorktreeStore((s) => s.environments);
  const activeWorktreeId = useWorktreeStore((s) => mapping ? s.activeWorktreeId[mapping.canonicalLocalPath] : undefined);
  
  const [inputPath, setInputPath] = useState('');
  const [isEditing, setIsEditing] = useState(!mapping);

  useEffect(() => {
    if (mapping) {
      void verifyMapping(repositoryId);
    }
  }, [mapping?.canonicalLocalPath, repositoryId, verifyMapping]);

  const handleConnect = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputPath.trim()) {
      mapRepository(repositoryId, inputPath.trim(), inputPath.trim());
      setIsEditing(false);
    }
  };

  const handleReveal = () => {
    if (mapping) {
      invoke('open_path_in_file_manager', { path: mapping.canonicalLocalPath }).catch(console.error);
    }
  };

  if (isEditing || !mapping) {
    return (
      <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <Folder size={16} />
          <h3 style={{ fontSize: '14px', margin: 0 }}>Connect Local Checkout</h3>
        </div>
        <form onSubmit={handleConnect} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            className="wt-form-input"
            style={{ flex: 1 }}
            placeholder="e.g. C:\Projects\MyRepo"
            value={inputPath}
            onChange={(e) => setInputPath(e.target.value)}
          />
          <button type="submit" className="wt-action-btn wt-action-btn--primary" disabled={!inputPath.trim()}>
            Connect
          </button>
          {mapping && (
            <button type="button" className="wt-action-btn" onClick={() => setIsEditing(false)}>
              Cancel
            </button>
          )}
        </form>
      </div>
    );
  }

  // Calculate workspace stats
  const workspacesForRepo = Object.values(environments).filter(e => e.repositoryRootPath === mapping.canonicalLocalPath);
  const total = workspacesForRepo.length;
  
  const statusIcon = {
    'mapped': <CheckCircle2 size={16} color="var(--success)" />,
    'missing': <AlertCircle size={16} color="var(--error)" />,
    'invalid': <AlertCircle size={16} color="var(--error)" />,
    'remote-mismatch': <AlertCircle size={16} color="var(--warning)" />,
    'unverified': <RefreshCw size={16} className="spin" color="var(--text-muted)" />,
  }[mapping.status];

  return (
    <div style={{ background: 'var(--surface)', padding: '16px', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <FolderOpen size={16} />
            <h3 style={{ fontSize: '14px', margin: 0 }}>Local Checkout Connected</h3>
            {statusIcon}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
            {mapping.displayPath}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
            Workspaces: {total} total {activeWorktreeId ? '· 1 active' : ''}
          </div>
          {mapping.status === 'remote-mismatch' && (
            <div style={{ fontSize: '12px', color: 'var(--warning)', marginTop: '8px' }}>
              Warning: Local git remote does not appear to match {repositoryId}
            </div>
          )}
          {mapping.status === 'invalid' && (
            <div style={{ fontSize: '12px', color: 'var(--error)', marginTop: '8px' }}>
              Error: Path is not a valid Git repository
            </div>
          )}
          {mapping.status === 'missing' && (
            <div style={{ fontSize: '12px', color: 'var(--error)', marginTop: '8px' }}>
              Error: Path does not exist
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
          <button 
            className="wt-action-btn"
            onClick={() => {
              useWorktreeStore.getState().openRepositorySession(mapping.canonicalLocalPath);
              useTabsStore.getState().openNativeTab('native:worktrees', 'worktreeEnvironments', 'Local Workspaces', false, true, { type: 'worktreeEnvironments', repositoryRootPath: mapping.canonicalLocalPath });
            }}
          >
            Open Local Workspaces
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="wt-action-btn" onClick={handleReveal} title="Reveal in OS">
              <FolderOpen size={14} />
            </button>
            <button className="wt-action-btn" onClick={() => setIsEditing(true)} title="Change local mapping">
              <Settings size={14} />
            </button>
            <button className="wt-action-btn" onClick={() => forgetMapping(repositoryId)} title="Forget mapping">
              Forget
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
