import { useEffect } from 'react';
import { GitBranch, Play, FolderOpen, AlertCircle } from 'lucide-react';
import { useWorkspaceAssociationStore, WorkspaceSourceType } from '../../worktrees/workspace-association-store';
import { useWorktreeStore } from '../../worktrees/worktree-store';
import { useTabsStore } from '../../stores/tabs-store';

export interface LocalWorkspaceStatusProps {
  repositoryId: string;
  itemType: WorkspaceSourceType;
  itemId: string;
  defaultBranchName?: string;
  defaultBranchBase?: string;
  onAction?: () => void;
  showCreateButton?: boolean;
  variant?: 'full' | 'compact';
}

export function LocalWorkspaceStatus({
  repositoryId,
  itemType,
  itemId,
  defaultBranchName,
  defaultBranchBase,
  showCreateButton = true,
  variant = 'full',
}: LocalWorkspaceStatusProps) {
  const mapping = useWorkspaceAssociationStore((s) => s.repositoryMappings[repositoryId]);
  const association = useWorkspaceAssociationStore((s) => s.getAssociation(repositoryId, itemType, itemId));
  const verifyMapping = useWorkspaceAssociationStore((s) => s.verifyMapping);

  const environments = useWorktreeStore((s) => s.environments);
  const activeWorktreeId = useWorktreeStore((s) => mapping ? s.activeWorktreeId[mapping.canonicalLocalPath] : undefined);
  const getWorktreeContext = useWorktreeStore((s) => s.getWorktreeContext);

  useEffect(() => {
    if (mapping && mapping.status === 'unverified') {
      void verifyMapping(repositoryId);
    }
  }, [mapping?.status, repositoryId, verifyMapping]);

  if (!mapping || mapping.status === 'missing' || mapping.status === 'invalid') {
    if (variant === 'compact') {
      return (
        <button className="wt-action-btn" title="No local checkout connected" onClick={() => {
          useTabsStore.getState().openNativeTab('native:repositoryExplorer', 'repositoryExplorer', 'Repository', false, true, { type: 'repository', repository: repositoryId });
        }}>
          <AlertCircle size={14} color="var(--text-muted)" />
        </button>
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'var(--surface-sunken)', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px' }}>
        <AlertCircle size={14} color="var(--text-muted)" />
        <span style={{ color: 'var(--text-secondary)' }}>No local checkout connected</span>
        <button 
          className="wt-action-btn"
          style={{ marginLeft: 'auto', fontSize: '12px', padding: '4px 8px' }}
          onClick={() => {
            useTabsStore.getState().openNativeTab('native:repositoryExplorer', 'repositoryExplorer', 'Repository', false, true, { type: 'repository', repository: repositoryId });
          }}
        >
          Connect
        </button>
      </div>
    );
  }

  // Find the exact environment object if it exists
  const env = association ? environments[association.worktreeId] : undefined;
  const isMissing = association && !env; // The association points to a worktree that no longer exists

  const handleOpenWorkspace = () => {
    if (!association) return;
    const ctx = getWorktreeContext(association.worktreeId);
    useWorktreeStore.getState().openRepositorySession(mapping.canonicalLocalPath);
    useTabsStore.getState().openWorktreeLocalTab(
      association.worktreeId,
      mapping.canonicalLocalPath,
      'worktreeLocalExplorer',
      `Files: ${ctx?.friendlyName || association.branch}`
    );
  };

  const handleCreateWorkspace = () => {
    // For now we navigate to Local Workspaces and open the create dialog
    // A fully integrated version would open a dedicated dialog here
    useWorktreeStore.getState().openRepositorySession(mapping.canonicalLocalPath);
    useTabsStore.getState().openNativeTab('native:worktrees', 'worktreeEnvironments', 'Local Workspaces', false, true, { 
      type: 'worktreeEnvironments', 
      repositoryRootPath: mapping.canonicalLocalPath,
      defaultBranchName,
      defaultBranchBase,
      linkSourceItemType: itemType,
      linkSourceItemId: itemId,
      linkSourceRepositoryId: repositoryId
    });
  };

  if (!association) {
    if (!showCreateButton) return null;
    if (variant === 'compact') {
      return (
        <button className="wt-action-btn" title="Create local workspace" onClick={handleCreateWorkspace}>
          <GitBranch size={14} color="var(--text-secondary)" />
        </button>
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'var(--surface-sunken)', borderRadius: '6px', border: '1px solid var(--border)', fontSize: '13px' }}>
        <GitBranch size={14} color="var(--text-secondary)" />
        <span>Local Workspace available</span>
        <button 
          className="wt-action-btn wt-action-btn--primary"
          style={{ marginLeft: 'auto', fontSize: '12px', padding: '4px 12px' }}
          onClick={handleCreateWorkspace}
        >
          <Play size={12} style={{ marginRight: '4px' }} />
          Create workspace
        </button>
      </div>
    );
  }

  if (isMissing) {
    if (variant === 'compact') {
      return (
        <button className="wt-action-btn" title="Workspace missing. Click to remove link." onClick={() => useWorkspaceAssociationStore.getState().unlinkWorkspace(association.associationId)}>
          <AlertCircle size={14} color="var(--error)" />
        </button>
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'var(--surface-sunken)', borderRadius: '6px', border: '1px solid var(--error-bg)', fontSize: '13px' }}>
        <AlertCircle size={14} color="var(--error)" />
        <span style={{ color: 'var(--error)' }}>Workspace missing</span>
        <button 
          className="wt-action-btn"
          style={{ marginLeft: 'auto', fontSize: '12px', padding: '4px 8px' }}
          onClick={() => useWorkspaceAssociationStore.getState().unlinkWorkspace(association.associationId)}
        >
          Remove link
        </button>
      </div>
    );
  }

  const isActive = activeWorktreeId === association.worktreeId;
  const status = useWorktreeStore((s) => s.gitStatus[association.worktreeId]);
  const isDirty = status ? !status.isClean : false;

  if (variant === 'compact') {
    return (
      <button 
        className="wt-action-btn" 
        style={isActive ? { background: 'var(--accent)', color: '#fff' } : {}}
        title={isActive ? 'Workspace active' : 'Open workspace' + (isDirty ? ' (has local changes)' : '')}
        onClick={handleOpenWorkspace}
      >
        <FolderOpen size={14} color={isActive ? '#fff' : (isDirty ? 'var(--warning)' : 'var(--text-secondary)')} />
      </button>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'var(--surface)', borderRadius: '6px', border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)', fontSize: '13px' }}>
      <FolderOpen size={14} color={isActive ? 'var(--accent)' : 'var(--text-secondary)'} />
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ fontWeight: isActive ? 500 : 400, color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
          {isActive ? 'Workspace active' : 'Workspace available'}
        </span>
        {isDirty && (
          <span style={{ fontSize: '11px', color: 'var(--warning)' }}>
            Has local changes
          </span>
        )}
      </div>

      <button 
        className="wt-action-btn"
        style={{ marginLeft: 'auto', fontSize: '12px', padding: '4px 12px', background: isActive ? 'var(--accent)' : undefined, color: isActive ? '#fff' : undefined }}
        onClick={handleOpenWorkspace}
      >
        Open workspace
      </button>
    </div>
  );
}
