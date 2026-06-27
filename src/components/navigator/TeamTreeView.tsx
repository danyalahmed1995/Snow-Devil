import { openUrl } from '@tauri-apps/plugin-opener';
import {
  useTeamStore,
  type Organization,
  type OrgMember,
  type MemberPR,
  type MemberIssue,
  type Collaborator,
} from '../../stores/team-store';
import './TeamTreeView.css';

function Chevron({ expanded }: { expanded: boolean }) {
  return (
    <span className={`team-chevron ${expanded ? 'expanded' : ''}`} aria-hidden>
      ▶
    </span>
  );
}

function Spinner() {
  return <span className="team-spinner" aria-label="Loading" />;
}

function Avatar({ url, alt, size = 20 }: { url: string; alt: string; size?: number }) {
  return (
    <img
      className="team-avatar"
      src={url}
      alt={alt}
      style={{ width: size, height: size }}
    />
  );
}

function openExternal(url: string) {
  if (!url) return;
  openUrl(url).catch((e) => console.error('Failed to open url:', e));
}

// Unique co-collaborators (reviewers + assignees), excluding the member themselves.
function coCollaborators(pr: MemberPR, memberLogin: string): Collaborator[] {
  const seen = new Set<string>([memberLogin]);
  const result: Collaborator[] = [];
  for (const c of [...pr.reviewers, ...pr.assignees]) {
    if (!c.login || seen.has(c.login)) continue;
    seen.add(c.login);
    result.push(c);
  }
  return result;
}

function CollaboratorChips({ collaborators }: { collaborators: Collaborator[] }) {
  if (collaborators.length === 0) return null;
  return (
    <div className="team-collab-row" style={{ paddingLeft: 16 * 4 }}>
      <span className="team-collab-icon" aria-hidden>
        👥
      </span>
      <div className="team-collab-chips">
        {collaborators.map((c) => (
          <img
            key={c.login}
            className="team-collab-chip"
            src={c.avatarUrl}
            alt={c.login}
            title={c.login}
          />
        ))}
      </div>
    </div>
  );
}

function PrRow({ pr, memberLogin }: { pr: MemberPR; memberLogin: string }) {
  const collaborators = coCollaborators(pr, memberLogin);
  return (
    <>
      <div
        className="team-item team-leaf"
        style={{ paddingLeft: 16 * 3 }}
        onClick={() => openExternal(pr.url)}
        title={pr.title}
      >
        <span className="team-leaf-icon" aria-hidden>
          🔀
        </span>
        <span className="team-leaf-title">{pr.title}</span>
        <span className="team-leaf-meta">
          {pr.repo} #{pr.number}
        </span>
      </div>
      <CollaboratorChips collaborators={collaborators} />
    </>
  );
}

function IssueRow({ issue }: { issue: MemberIssue }) {
  return (
    <div
      className="team-item team-leaf"
      style={{ paddingLeft: 16 * 3 }}
      onClick={() => openExternal(issue.url)}
      title={issue.title}
    >
      <span className="team-leaf-icon" aria-hidden>
        🟢
      </span>
      <span className="team-leaf-title">{issue.title}</span>
      <span className="team-leaf-meta">
        {issue.repo} #{issue.number}
      </span>
    </div>
  );
}

function MemberNode({ member }: { member: OrgMember }) {
  const expandedMembers = useTeamStore((s) => s.expandedMembers);
  const loadingMembers = useTeamStore((s) => s.loadingMembers);
  const memberActivities = useTeamStore((s) => s.memberActivities);
  const toggleMemberExpanded = useTeamStore((s) => s.toggleMemberExpanded);

  const expanded = expandedMembers.has(member.login);
  const loading = loadingMembers.has(member.login);
  const activity = memberActivities[member.login];

  const prCount = activity?.openPrs.length ?? 0;
  const issueCount = activity?.assignedIssues.length ?? 0;

  let summary = '';
  if (activity) {
    const parts: string[] = [];
    if (prCount > 0) parts.push(`${prCount} PR${prCount === 1 ? '' : 's'}`);
    if (issueCount > 0) parts.push(`${issueCount} Issue${issueCount === 1 ? '' : 's'}`);
    summary = parts.length > 0 ? parts.join(', ') : '0 active';
  }

  return (
    <li className="team-node">
      <div
        className="team-item"
        style={{ paddingLeft: 16 * 2 }}
        onClick={() => toggleMemberExpanded(member.login)}
      >
        <Chevron expanded={expanded} />
        <Avatar url={member.avatarUrl} alt={member.login} />
        <span className="team-label">@{member.login}</span>
        {loading ? (
          <Spinner />
        ) : (
          summary && <span className="team-summary">{summary}</span>
        )}
      </div>

      {expanded && activity && (
        <div className="team-children">
          {prCount === 0 && issueCount === 0 && !loading && (
            <div className="team-empty" style={{ paddingLeft: 16 * 3 }}>
              No active work
            </div>
          )}
          {activity.openPrs.map((pr) => (
            <PrRow key={pr.id} pr={pr} memberLogin={member.login} />
          ))}
          {activity.assignedIssues.map((issue) => (
            <IssueRow key={issue.id} issue={issue} />
          ))}
        </div>
      )}
    </li>
  );
}

function OrgNode({ org }: { org: Organization }) {
  const expandedOrgs = useTeamStore((s) => s.expandedOrgs);
  const toggleOrgExpanded = useTeamStore((s) => s.toggleOrgExpanded);

  const expanded = expandedOrgs.has(org.id);

  return (
    <li className="team-node">
      <div
        className="team-item"
        style={{ paddingLeft: 16 * 1 }}
        onClick={() => toggleOrgExpanded(org.id)}
      >
        <Chevron expanded={expanded} />
        <Avatar url={org.avatarUrl} alt={org.login} />
        <span className="team-label">@{org.login}</span>
      </div>

      {expanded && (
        <ul className="team-children team-list">
          {org.members.map((member) => (
            <MemberNode key={member.id} member={member} />
          ))}
        </ul>
      )}
    </li>
  );
}

export function TeamTreeView() {
  const teamsExpanded = useTeamStore((s) => s.teamsExpanded);
  const isLoadingOrgs = useTeamStore((s) => s.isLoadingOrgs);
  const organizations = useTeamStore((s) => s.organizations);
  const toggleTeamsExpanded = useTeamStore((s) => s.toggleTeamsExpanded);

  return (
    <div className="team-tree">
      <div className="team-tree-header" onClick={toggleTeamsExpanded}>
        <Chevron expanded={teamsExpanded} />
        <span className="team-tree-title">Teams</span>
        {isLoadingOrgs && <Spinner />}
      </div>

      {teamsExpanded && (
        <ul className="team-list">
          {!isLoadingOrgs && organizations.length === 0 && (
            <li className="team-empty" style={{ paddingLeft: 16 }}>
              No organizations
            </li>
          )}
          {organizations.map((org) => (
            <OrgNode key={org.id} org={org} />
          ))}
        </ul>
      )}
    </div>
  );
}
