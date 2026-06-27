import { create } from 'zustand';
import { invoke } from '@tauri-apps/api/core';

// 5 minutes in ms — activity is re-fetched if the cache is older than this.
const ACTIVITY_CACHE_MS = 5 * 60 * 1000;

export interface OrgMember {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string;
}

export interface Organization {
  id: string;
  login: string;
  name: string | null;
  avatarUrl: string;
  members: OrgMember[];
}

export interface Collaborator {
  login: string;
  avatarUrl: string;
}

export interface MemberPR {
  id: string;
  number: number;
  title: string;
  url: string;
  repo: string;
  isDraft: boolean;
  author: Collaborator;
  reviewers: Collaborator[];
  assignees: Collaborator[];
}

export interface MemberIssue {
  id: string;
  number: number;
  title: string;
  url: string;
  repo: string;
  assignees: Collaborator[];
}

export interface MemberActivity {
  openPrs: MemberPR[];
  reviewRequestedPrs: MemberPR[];
  assignedIssues: MemberIssue[];
  lastFetchedAt: number;
}

interface TeamState {
  // Data
  organizations: Organization[];
  memberActivities: Record<string, MemberActivity>; // keyed by login

  // UI state
  isLoadingOrgs: boolean;
  loadingMembers: Set<string>;
  expandedOrgs: Set<string>;
  expandedMembers: Set<string>;
  teamsExpanded: boolean;

  // Actions
  fetchOrganizations: () => Promise<void>;
  fetchMemberActivity: (login: string) => Promise<void>;
  toggleOrgExpanded: (orgId: string) => void;
  toggleMemberExpanded: (login: string) => void;
  toggleTeamsExpanded: () => void;
}

// --- Normalization helpers -------------------------------------------------

function mapCollaborators(nodes: any[] | undefined): Collaborator[] {
  if (!Array.isArray(nodes)) return [];
  return nodes
    .map((n) => n?.requestedReviewer ?? n?.author ?? n)
    .filter((u): u is any => u && typeof u.login === 'string')
    .map((u) => ({ login: u.login, avatarUrl: u.avatarUrl ?? '' }));
}

function mapAuthor(author: any): Collaborator {
  return {
    login: author?.login ?? 'unknown',
    avatarUrl: author?.avatarUrl ?? '',
  };
}

function mapPR(node: any): MemberPR {
  return {
    id: node?.id ?? '',
    number: node?.number ?? 0,
    title: node?.title ?? '',
    url: node?.url ?? '',
    repo: node?.repository?.nameWithOwner ?? '',
    isDraft: Boolean(node?.isDraft),
    author: mapAuthor(node?.author),
    reviewers: mapCollaborators(node?.reviewRequests?.nodes),
    assignees: mapCollaborators(node?.assignees?.nodes),
  };
}

function mapIssue(node: any): MemberIssue {
  return {
    id: node?.id ?? '',
    number: node?.number ?? 0,
    title: node?.title ?? '',
    url: node?.url ?? '',
    repo: node?.repository?.nameWithOwner ?? '',
    assignees: mapCollaborators(node?.assignees?.nodes),
  };
}

// --- Store -----------------------------------------------------------------

export const useTeamStore = create<TeamState>((set, get) => ({
  organizations: [],
  memberActivities: {},

  isLoadingOrgs: false,
  loadingMembers: new Set<string>(),
  expandedOrgs: new Set<string>(),
  expandedMembers: new Set<string>(),
  teamsExpanded: false,

  fetchOrganizations: async () => {
    const { isLoadingOrgs, organizations } = get();
    // Skip if already loaded or a fetch is in flight.
    if (isLoadingOrgs || organizations.length > 0) return;

    set({ isLoadingOrgs: true });
    try {
      const data = await invoke<any>('get_viewer_organizations');
      const nodes: any[] = data?.viewer?.organizations?.nodes ?? [];
      const orgs: Organization[] = nodes.map((org) => ({
        id: org?.id ?? '',
        login: org?.login ?? '',
        name: org?.name ?? null,
        avatarUrl: org?.avatarUrl ?? '',
        members: (org?.membersWithRole?.nodes ?? []).map((m: any) => ({
          id: m?.id ?? '',
          login: m?.login ?? '',
          name: m?.name ?? null,
          avatarUrl: m?.avatarUrl ?? '',
        })),
      }));
      set({ organizations: orgs, isLoadingOrgs: false });
    } catch (e) {
      console.error('Failed to fetch organizations:', e);
      set({ isLoadingOrgs: false });
    }
  },

  fetchMemberActivity: async (login: string) => {
    const { memberActivities, loadingMembers } = get();

    // 5-minute cache: skip refetch if data is still fresh.
    const cached = memberActivities[login];
    if (cached && Date.now() - cached.lastFetchedAt < ACTIVITY_CACHE_MS) return;
    if (loadingMembers.has(login)) return;

    set((prev) => ({ loadingMembers: new Set(prev.loadingMembers).add(login) }));
    try {
      const data = await invoke<any>('get_member_activity', { login });
      const prNodes: any[] = data?.user?.pullRequests?.nodes ?? [];
      const issueNodes: any[] = data?.user?.issues?.nodes ?? [];

      const activity: MemberActivity = {
        openPrs: prNodes.map(mapPR),
        // get_member_activity does not return review-requested PRs (Phase 3).
        reviewRequestedPrs: [],
        assignedIssues: issueNodes.map(mapIssue),
        lastFetchedAt: Date.now(),
      };

      set((prev) => {
        const nextLoading = new Set(prev.loadingMembers);
        nextLoading.delete(login);
        return {
          memberActivities: { ...prev.memberActivities, [login]: activity },
          loadingMembers: nextLoading,
        };
      });
    } catch (e) {
      console.error(`Failed to fetch activity for ${login}:`, e);
      set((prev) => {
        const nextLoading = new Set(prev.loadingMembers);
        nextLoading.delete(login);
        return { loadingMembers: nextLoading };
      });
    }
  },

  toggleOrgExpanded: (orgId: string) => {
    set((prev) => {
      const next = new Set(prev.expandedOrgs);
      if (next.has(orgId)) next.delete(orgId);
      else next.add(orgId);
      return { expandedOrgs: next };
    });
  },

  toggleMemberExpanded: (login: string) => {
    const wasExpanded = get().expandedMembers.has(login);
    set((prev) => {
      const next = new Set(prev.expandedMembers);
      if (next.has(login)) next.delete(login);
      else next.add(login);
      return { expandedMembers: next };
    });
    // Lazy-fetch activity the first time a member is expanded.
    if (!wasExpanded) {
      void get().fetchMemberActivity(login);
    }
  },

  toggleTeamsExpanded: () => {
    const willExpand = !get().teamsExpanded;
    set((prev) => ({ teamsExpanded: !prev.teamsExpanded }));
    // Fetch orgs the first time the section is opened.
    if (willExpand) {
      void get().fetchOrganizations();
    }
  },
}));
