import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { invoke } from '@tauri-apps/api/core';

export type RepositoryMappingStatus = 'mapped' | 'missing' | 'invalid' | 'remote-mismatch' | 'unverified';

export interface RepositoryMapping {
  repositoryId: string; // e.g. "octocat/Hello-World"
  canonicalLocalPath: string;
  displayPath: string;
  status: RepositoryMappingStatus;
  lastVerifiedAt: number;
}

export type WorkspaceSourceType = 'pr' | 'issue' | 'ci' | 'branch' | 'manual';

export interface WorkspaceAssociation {
  associationId: string; // e.g. "pr:octocat/Hello-World:42"
  repositoryId: string;
  itemType: WorkspaceSourceType;
  itemId: string; // e.g. "42", "run-123", "main"
  worktreeId: string;
  branch: string;
  canonicalPath: string;
  metadata?: Record<string, unknown>; // Extra context (e.g., CI jobs)
  createdAt: number;
  lastOpenedAt: number;
}

export interface WorkspaceAssociationState {
  repositoryMappings: Record<string, RepositoryMapping>;
  workspaceAssociations: Record<string, WorkspaceAssociation>;
}

export interface WorkspaceAssociationActions {
  // Repository mapping
  mapRepository: (repositoryId: string, localPath: string, displayPath: string) => void;
  verifyMapping: (repositoryId: string) => Promise<RepositoryMappingStatus>;
  forgetMapping: (repositoryId: string) => void;
  updateMappingStatus: (repositoryId: string, status: RepositoryMappingStatus) => void;

  // Workspace associations
  linkWorkspace: (association: Omit<WorkspaceAssociation, 'createdAt' | 'lastOpenedAt'>) => void;
  unlinkWorkspace: (associationId: string) => void;
  touchWorkspace: (associationId: string) => void;
  getAssociation: (repositoryId: string, itemType: WorkspaceSourceType, itemId: string) => WorkspaceAssociation | undefined;
}

export type WorkspaceAssociationStore = WorkspaceAssociationState & WorkspaceAssociationActions;

export const useWorkspaceAssociationStore = create<WorkspaceAssociationStore>()(
  persist(
    (set, get) => ({
      repositoryMappings: {},
      workspaceAssociations: {},

      mapRepository: (repositoryId, localPath, displayPath) => {
        set((s) => ({
          repositoryMappings: {
            ...s.repositoryMappings,
            [repositoryId]: {
              repositoryId,
              canonicalLocalPath: localPath,
              displayPath,
              status: 'unverified',
              lastVerifiedAt: Date.now(),
            },
          },
        }));
        void get().verifyMapping(repositoryId);
      },

      verifyMapping: async (repositoryId) => {
        const mapping = get().repositoryMappings[repositoryId];
        if (!mapping) return 'unverified';

        let newStatus: RepositoryMappingStatus = 'mapped';
        try {
          // Check if path exists and is a git repo
          const isRepo = await invoke<boolean>('is_git_repository', { path: mapping.canonicalLocalPath }).catch(() => false);
          if (!isRepo) {
            newStatus = 'invalid';
          } else {
            // Verify remote matches
            const remoteUrl = await invoke<string>('worktree_get_remote_url', { repoPath: mapping.canonicalLocalPath, remoteName: 'origin' }).catch(() => '');
            if (remoteUrl && !remoteUrl.toLowerCase().includes(repositoryId.split('/')[1].toLowerCase())) {
              newStatus = 'remote-mismatch';
            }
          }
        } catch (e) {
          newStatus = 'missing';
        }

        get().updateMappingStatus(repositoryId, newStatus);
        return newStatus;
      },

      forgetMapping: (repositoryId) => {
        set((s) => {
          const next = { ...s.repositoryMappings };
          delete next[repositoryId];
          return { repositoryMappings: next };
        });
      },

      updateMappingStatus: (repositoryId, status) => {
        set((s) => {
          const mapping = s.repositoryMappings[repositoryId];
          if (!mapping) return s;
          return {
            repositoryMappings: {
              ...s.repositoryMappings,
              [repositoryId]: { ...mapping, status, lastVerifiedAt: Date.now() },
            },
          };
        });
      },

      linkWorkspace: (payload) => {
        const now = Date.now();
        set((s) => ({
          workspaceAssociations: {
            ...s.workspaceAssociations,
            [payload.associationId]: {
              ...payload,
              createdAt: s.workspaceAssociations[payload.associationId]?.createdAt ?? now,
              lastOpenedAt: now,
            },
          },
        }));
      },

      unlinkWorkspace: (associationId) => {
        set((s) => {
          const next = { ...s.workspaceAssociations };
          delete next[associationId];
          return { workspaceAssociations: next };
        });
      },

      touchWorkspace: (associationId) => {
        set((s) => {
          const assoc = s.workspaceAssociations[associationId];
          if (!assoc) return s;
          return {
            workspaceAssociations: {
              ...s.workspaceAssociations,
              [associationId]: { ...assoc, lastOpenedAt: Date.now() },
            },
          };
        });
      },

      getAssociation: (repositoryId, itemType, itemId) => {
        const id = `${itemType}:${repositoryId}:${itemId}`;
        return get().workspaceAssociations[id];
      },
    }),
    {
      name: 'snow-devil-workspace-associations',
      version: 1,
    }
  )
);
