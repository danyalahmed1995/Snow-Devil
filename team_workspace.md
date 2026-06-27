# Team Workspaces & Collaboration Awareness

Add organization-based team workspaces so every team member sees what others are **actively** working on — which PRs they own, which issues they're assigned to, and who is co-collaborating on the same PR.

## Inspiration: Mainline.dev

Mainline.dev's core philosophy that applies to us:

| Mainline Concept | Our Adaptation |
|---|---|
| **Nothing is hidden** — every member sees the same view | Every org member sees the same real-time picture of who is doing what |
| **Teamwork view** — pairing matrix, ensemble timeline | **Teamwork tab** — member activity card grid with co-collaborator visibility |
| **One active story per person** — WIP awareness | Show only **open/active** items per member (no closed/merged noise) |
| **Shared ownership** — see who else is on the same story | PR nodes show **co-collaborators** (reviewers, assignees, author) as avatar chips |

> [!IMPORTANT]
> **Scope boundaries**: No CI Monitor, no pairing heatmap, no DB schema changes, no tests. All team data is ephemeral (fetched live from GitHub GraphQL, cached in Zustand memory).

---

## Phase 1 — Backend: Rust GitHub API + Tauri Commands

> Goal: Wire up the data layer. After this phase, the frontend can call three Tauri commands to get org/member/activity data.

### [NEW] [team_api.rs](file:///d:/snow-devil/Snow-Devil/src-tauri/src/github/team_api.rs)

New module following the exact same pattern as [flow_api.rs](file:///d:/snow-devil/Snow-Devil/src-tauri/src/github/flow_api.rs) (uses `get_token()` from `crate::auth::secure_store`, builds `reqwest::Client`, posts to GraphQL endpoint, returns `serde_json::Value`).

Three functions:

**1. `fetch_viewer_organizations()`**
```graphql
query {
  viewer {
    organizations(first: 20) {
      nodes {
        id
        login
        name
        avatarUrl
        membersWithRole(first: 100) {
          nodes { id login name avatarUrl }
        }
      }
    }
  }
}
```
Returns: `Vec<Organization>` (or raw `serde_json::Value` to keep it simple like flow_api).

**2. `fetch_member_activity(login: &str)`**
```graphql
query($login: String!) {
  user(login: $login) {
    pullRequests(first: 20, states: [OPEN], orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        id number title url state isDraft
        repository { nameWithOwner }
        author { login avatarUrl }
        reviewRequests(first: 10) {
          nodes { requestedReviewer { ... on User { login avatarUrl } } }
        }
        reviews(last: 10) {
          nodes { author { login avatarUrl } state }
        }
        assignees(first: 5) { nodes { login avatarUrl } }
      }
    }
    issues(first: 20, states: [OPEN], filterBy: { assignee: $login }, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes {
        id number title url state
        repository { nameWithOwner }
        assignees(first: 5) { nodes { login avatarUrl } }
      }
    }
  }
}
```

**3. `fetch_org_activity(org_login: &str)`**
Uses GitHub search to batch-fetch all open PRs across an org:
```graphql
query($query: String!) {
  search(query: $query, type: ISSUE, first: 50) {
    nodes {
      ... on PullRequest {
        id number title url state isDraft
        repository { nameWithOwner }
        author { login avatarUrl }
        reviewRequests(first: 10) {
          nodes { requestedReviewer { ... on User { login avatarUrl } } }
        }
        reviews(last: 10) {
          nodes { author { login avatarUrl } state }
        }
        assignees(first: 5) { nodes { login avatarUrl } }
      }
    }
  }
  issues: search(query: $issueQuery, type: ISSUE, first: 50) {
    nodes {
      ... on Issue {
        id number title url state
        repository { nameWithOwner }
        assignees(first: 5) { nodes { login avatarUrl } }
      }
    }
  }
}
```
Where `$query` = `"is:open is:pr org:<org_login>"` and `$issueQuery` = `"is:open is:issue org:<org_login>"`.

---

### [NEW] [team.rs](file:///d:/snow-devil/Snow-Devil/src-tauri/src/commands/team.rs)

Three Tauri command handlers following the pattern in [flow.rs](file:///d:/snow-devil/Snow-Devil/src-tauri/src/commands/flow.rs):

```rust
#[tauri::command]
pub async fn get_viewer_organizations() -> Result<Value, String> { ... }

#[tauri::command]
pub async fn get_member_activity(login: String) -> Result<Value, String> { ... }

#[tauri::command]
pub async fn get_org_activity(org_login: String) -> Result<Value, String> { ... }
```

---

### [MODIFY] [mod.rs](file:///d:/snow-devil/Snow-Devil/src-tauri/src/github/mod.rs)

Add `pub mod team_api;`

### [MODIFY] [mod.rs](file:///d:/snow-devil/Snow-Devil/src-tauri/src/commands/mod.rs)

Add `pub mod team;`

### [MODIFY] [lib.rs](file:///d:/snow-devil/Snow-Devil/src-tauri/src/lib.rs)

Register the three new commands in `invoke_handler`:
```rust
commands::team::get_viewer_organizations,
commands::team::get_member_activity,
commands::team::get_org_activity,
```

---

### Phase 1 Verification
- `pnpm tauri dev` compiles without errors
- Frontend can call `invoke('get_viewer_organizations')` and get data back (manual console test)

---

## Phase 2 — Frontend: Zustand Store + Navigator TeamTreeView

> Goal: "Teams" collapsible section in the Navigator sidebar with lazy-loading org → member → activity tree.

### [NEW] [team-store.ts](file:///d:/snow-devil/Snow-Devil/src/stores/team-store.ts)

Zustand store following the pattern in [flow-store.ts](file:///d:/snow-devil/Snow-Devil/src/stores/flow-store.ts):

```typescript
interface TeamState {
  // Data
  organizations: Organization[];
  memberActivities: Record<string, MemberActivity>;  // keyed by login
  
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
```

Key types:
```typescript
interface OrgMember { id: string; login: string; name: string | null; avatarUrl: string; }
interface Organization { id: string; login: string; name: string | null; avatarUrl: string; members: OrgMember[]; }
interface Collaborator { login: string; avatarUrl: string; }
interface MemberPR { id: string; number: number; title: string; url: string; repo: string; isDraft: boolean; author: Collaborator; reviewers: Collaborator[]; assignees: Collaborator[]; }
interface MemberIssue { id: string; number: number; title: string; url: string; repo: string; assignees: Collaborator[]; }
interface MemberActivity { openPrs: MemberPR[]; reviewRequestedPrs: MemberPR[]; assignedIssues: MemberIssue[]; lastFetchedAt: number; }
```

---

### [NEW] [TeamTreeView.tsx](file:///d:/snow-devil/Snow-Devil/src/components/navigator/TeamTreeView.tsx)

Collapsible tree view rendered inside the Navigator below the existing nav list. Renders only when authenticated.

Visual structure:
```
▶ Teams                              ← top-level collapsible
  ▼ @martian-org  (avatar)            ← org node, click to expand
    ▼ @alice  (avatar) — 2 PRs, 1 Issue
      🔀 Fix auth flow  repo-name #42
          👥 bob, charlie             ← co-collaborator chips
      🔀 Update README  repo-name #38
          👥 dave
      🟢 Investigate login bug  repo-name #15
    ▶ @bob  (avatar) — 1 PR
    ▶ @charlie  (avatar) — 0 active
  ▶ @another-org  (avatar)
```

**Key behaviors:**
- Clicking "Teams" header fetches orgs (once) and toggles the section
- Clicking an org expands to show members (data already loaded with the org query)
- Clicking a member **lazy-fetches** their activity via `get_member_activity`
- Each PR shows co-collaborator avatar chips inline (other reviewers + assignees, excluding the member themselves)
- Clicking a PR/issue title opens the URL in the default browser via `@tauri-apps/plugin-opener`
- Loading spinners while member activity is being fetched
- 5-minute cache: re-fetch if `lastFetchedAt` is stale

---

### [NEW] [TeamTreeView.css](file:///d:/snow-devil/Snow-Devil/src/components/navigator/TeamTreeView.css)

Styles matching the existing Navigator theme:
- Indentation levels (16px per depth)
- Avatar sizing (20px round with `border-radius: 50%`)
- Collapsible chevron animation (`transform: rotate(90deg)`)
- Hover states using `var(--surface-hover)`
- Co-collaborator chips: 16px avatars in a flex row with negative margin overlap
- Active badge counts with `var(--accent)` background
- Smooth expand/collapse with `max-height` transition

---

### [MODIFY] [Navigator.tsx](file:///d:/snow-devil/Snow-Devil/src/components/navigator/Navigator.tsx)

Import and render `<TeamTreeView />` after the `<ul className="nav-list">`, gated on `session.status === 'connected'`:

```tsx
{session.status === 'connected' && <TeamTreeView />}
```

---

### Phase 2 Verification
- The "Teams" section appears in the Navigator when logged in
- Expanding an org shows members with avatars
- Expanding a member loads and shows their active PRs/issues
- Each PR shows co-collaborator chips
- Clicking a PR/issue opens it in the browser

---

## Phase 3 — Teamwork Dashboard Tab

> Goal: Full-page "Teamwork" native tab with a card grid of all org members and their active work.

### [MODIFY] [browser-tabs.ts](file:///d:/snow-devil/Snow-Devil/src/browser/browser-tabs.ts)

Add `'teamwork'` to `NativeTabKind`:
```typescript
export type NativeTabKind = "home" | "flow" | "teamwork" | "settings";
```

### [MODIFY] [browser-shortcuts.ts](file:///d:/snow-devil/Snow-Devil/src/browser/browser-shortcuts.ts)

Add new sidebar shortcut entry after `Flow`:
```typescript
{
  label: 'Teamwork',
  tabId: 'native:teamwork',
  family: 'native',
  nativeKind: 'teamwork',
  pinned: false,
  closable: true,
},
```

### [MODIFY] [WorkspaceContent.tsx](file:///d:/snow-devil/Snow-Devil/src/components/workspace/WorkspaceContent.tsx)

Add import and rendering case for the teamwork tab:
```tsx
import { TeamworkView } from './TeamworkView';
// ...
{activeTab.kind === 'teamwork' && <TeamworkView />}
```

---

### [NEW] [TeamworkView.tsx](file:///d:/snow-devil/Snow-Devil/src/components/workspace/TeamworkView.tsx)

Full-page dashboard. Layout:

```
┌─────────────────────────────────────────────────────────┐
│  Teamwork · @martian-org  [org selector dropdown]       │
│  [Refresh button]                                       │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ 🟢 @alice    │  │ 🟢 @bob      │  │ ⚪ @charlie  │  │
│  │              │  │              │  │              │  │
│  │ PRs Authored │  │ PRs Authored │  │ No active    │  │
│  │ 🔀 Fix auth  │  │ 🔀 API rate  │  │ work         │  │
│  │   #42 repo-a │  │   #88 repo-b │  │              │  │
│  │   👥 bob,carl│  │   👥 alice   │  │              │  │
│  │              │  │              │  │              │  │
│  │ Review Reqs  │  │ Assigned     │  │              │  │
│  │ 🔀 Update DB │  │ 🟢 DB issue  │  │              │  │
│  │   #55 repo-c │  │   #22 repo-c │  │              │  │
│  │              │  │              │  │              │  │
│  │ Assigned     │  │              │  │              │  │
│  │ 🟢 Login bug │  │              │  │              │  │
│  │   #15 repo-a │  │              │  │              │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- Org selector dropdown at the top (for users in multiple orgs)
- Fetches all member activities in parallel on mount
- Card grid layout with `CSS grid` (auto-fill, minmax 300px)
- Each member card shows:
  - Avatar (40px), login, name
  - Active status dot (green = has active work, grey = idle)
  - **PRs Authored** section: open PRs they wrote, with co-collaborator chips
  - **Review Requests** section: PRs where they're a requested reviewer
  - **Assigned Issues** section: open issues assigned to them
- Clicking any PR/issue opens it in a browser
- Refresh button to re-fetch all data
- Auto-refresh every 5 minutes

---

### [NEW] [TeamworkView.css](file:///d:/snow-devil/Snow-Devil/src/components/workspace/TeamworkView.css)

Premium glassmorphism styling:
- Card grid: `display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px;`
- Cards use `.glass-panel` base with hover elevation
- Avatar chips: 18px round with 2px border matching card background, negative margin overlap (-6px)
- Status dot: 8px circle with `box-shadow` glow on green
- Section headers: uppercase, 11px, `var(--text-muted)`
- PR/Issue rows: hover highlight, cursor pointer
- Empty state: centered grey text "No active work"
- Loading skeleton: shimmer animation on cards while fetching

---

### Phase 3 Verification
- "Teamwork" appears in Navigator sidebar shortcuts
- Clicking it opens a native tab with the full-page dashboard
- Org selector works (switches between orgs)
- All member cards render with correct data sections
- Co-collaborator chips show on each PR
- Clicking items opens them in the browser
- No closed/merged items appear — only active work

---

## File Summary

| Phase | Layer | File | Action | Purpose |
|-------|-------|------|--------|---------|
| 1 | Rust API | `github/team_api.rs` | NEW | GraphQL queries for orgs, members, activity |
| 1 | Rust Cmd | `commands/team.rs` | NEW | Tauri command handlers |
| 1 | Rust | `github/mod.rs` | MODIFY | Register `team_api` module |
| 1 | Rust | `commands/mod.rs` | MODIFY | Register `team` module |
| 1 | Rust | `lib.rs` | MODIFY | Register 3 new commands |
| 2 | Store | `stores/team-store.ts` | NEW | Zustand state for team data |
| 2 | UI | `navigator/TeamTreeView.tsx` | NEW | Tree view in sidebar |
| 2 | UI | `navigator/TeamTreeView.css` | NEW | Tree view styles |
| 2 | UI | `navigator/Navigator.tsx` | MODIFY | Mount TeamTreeView |
| 3 | Config | `browser-tabs.ts` | MODIFY | Add `'teamwork'` tab kind |
| 3 | Config | `browser-shortcuts.ts` | MODIFY | Add Teamwork nav item |
| 3 | UI | `workspace/TeamworkView.tsx` | NEW | Full-page teamwork dashboard |
| 3 | UI | `workspace/TeamworkView.css` | NEW | Dashboard styles |
| 3 | UI | `workspace/WorkspaceContent.tsx` | MODIFY | Render TeamworkView |

---

## What's NOT in Scope

- CI Monitor / branch lifetime tracking
- Pairing heatmap / ensemble timeline / solo log
- Database schema changes (all data is ephemeral, fetched live)
- Cumulative Flow Diagram / throughput / lead time
- Feature flag inventory
- WIP limit enforcement
- Tests

---

## Open Questions

> [!TIP]
> **GitHub Token Scopes**: ✅ Confirmed — the existing device flow in [device_flow.rs](file:///d:/snow-devil/Snow-Devil/src-tauri/src/auth/device_flow.rs) already requests `read:org` scope. No changes needed.

> [!NOTE]
> **Rate Limiting**: Fetching activity for all org members in parallel (Phase 3 dashboard) could hit GitHub API rate limits for large orgs (100+ members). We'll mitigate with:
> - Batching requests (max 5 concurrent)
> - 5-minute in-memory cache
> - Manual refresh button instead of aggressive polling
