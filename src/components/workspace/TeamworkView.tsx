import { useEffect, useMemo, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  useTeamStore,
  type Organization,
  type OrgMember,
  type MemberActivity,
  type MemberPR,
  type MemberIssue,
  type Collaborator,
} from '../../stores/team-store';
import './TeamworkView.css';

// 5 minutes — matches the store cache; the dashboard force-refreshes on this interval.
const AUTO_REFRESH_MS = 5 * 60 * 1000;

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
    <div className="tw-chips" aria-label="Co-collaborators">
      {collaborators.map((c) => (
        <img
          key={c.login}
          className="tw-chip"
          src={c.avatarUrl}
          alt={c.login}
          title={c.login}
        />
      ))}
    </div>
  );
}

function PrRow({ pr, memberLogin }: { pr: MemberPR; memberLogin: string }) {
  const collaborators = coCollaborators(pr, memberLogin);
  return (
    <div className="tw-row" onClick={() => openExternal(pr.url)} title={pr.title}>
      <div className="tw-row-main">
        <span className="tw-row-icon" aria-hidden>
          🔀
        </span>
        <span className="tw-row-title">{pr.title}</span>
        {pr.isDraft && <span className="tw-draft">Draft</span>}
      </div>
      <div className="tw-row-meta">
        <span className="tw-row-repo">
          {pr.repo} #{pr.number}
        </span>
        <CollaboratorChips collaborators={collaborators} />
      </div>
    </div>
  );
}

function IssueRow({ issue }: { issue: MemberIssue }) {
  return (
    <div className="tw-row" onClick={() => openExternal(issue.url)} title={issue.title}>
      <div className="tw-row-main">
        <span className="tw-row-icon" aria-hidden>
          🟢
        </span>
        <span className="tw-row-title">{issue.title}</span>
      </div>
      <div className="tw-row-meta">
        <span className="tw-row-repo">
          {issue.repo} #{issue.number}
        </span>
      </div>
    </div>
  );
}

function MemberCard({ member, activity }: { member: OrgMember; activity?: MemberActivity }) {
  const openPrs = activity?.openPrs ?? [];
  const reviewPrs = activity?.reviewRequestedPrs ?? [];
  const issues = activity?.assignedIssues ?? [];
  const hasWork = openPrs.length > 0 || reviewPrs.length > 0 || issues.length > 0;

  return (
    <div className="tw-card glass-panel">
      <div className="tw-card-header">
        <img className="tw-avatar" src={member.avatarUrl} alt={member.login} />
        <div className="tw-card-identity">
          <span className="tw-card-login">@{member.login}</span>
          {member.name && <span className="tw-card-name">{member.name}</span>}
        </div>
        <span
          className={`tw-status-dot ${hasWork ? 'active' : 'idle'}`}
          title={hasWork ? 'Active' : 'Idle'}
          aria-hidden
        />
      </div>

      {!hasWork ? (
        <div className="tw-card-empty">No active work</div>
      ) : (
        <div className="tw-card-body">
          {openPrs.length > 0 && (
            <section className="tw-section">
              <h4 className="tw-section-title">PRs Authored</h4>
              {openPrs.map((pr) => (
                <PrRow key={pr.id} pr={pr} memberLogin={member.login} />
              ))}
            </section>
          )}
          {reviewPrs.length > 0 && (
            <section className="tw-section">
              <h4 className="tw-section-title">Review Requests</h4>
              {reviewPrs.map((pr) => (
                <PrRow key={pr.id} pr={pr} memberLogin={member.login} />
              ))}
            </section>
          )}
          {issues.length > 0 && (
            <section className="tw-section">
              <h4 className="tw-section-title">Assigned Issues</h4>
              {issues.map((issue) => (
                <IssueRow key={issue.id} issue={issue} />
              ))}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="tw-card glass-panel tw-skeleton">
      <div className="tw-card-header">
        <span className="tw-avatar tw-shimmer" />
        <div className="tw-card-identity">
          <span className="tw-shimmer tw-shimmer-line" style={{ width: 90 }} />
          <span className="tw-shimmer tw-shimmer-line" style={{ width: 60 }} />
        </div>
      </div>
      <div className="tw-card-body">
        <span className="tw-shimmer tw-shimmer-line" style={{ width: '80%' }} />
        <span className="tw-shimmer tw-shimmer-line" style={{ width: '60%' }} />
      </div>
    </div>
  );
}

export function TeamworkView() {
  const organizations = useTeamStore((s) => s.organizations);
  const isLoadingOrgs = useTeamStore((s) => s.isLoadingOrgs);
  const orgActivities = useTeamStore((s) => s.orgActivities);
  const loadingOrgActivity = useTeamStore((s) => s.loadingOrgActivity);
  const fetchOrganizations = useTeamStore((s) => s.fetchOrganizations);
  const fetchOrgActivity = useTeamStore((s) => s.fetchOrgActivity);

  // User's explicit pick; falls back to the first org until they choose.
  const [pickedOrgLogin, setPickedOrgLogin] = useState<string | null>(null);
  const selectedOrgLogin =
    pickedOrgLogin ?? (organizations.length > 0 ? organizations[0].login : null);

  // Load organizations once on mount.
  useEffect(() => {
    void fetchOrganizations();
  }, [fetchOrganizations]);

  // Fetch (and auto-refresh) activity for the selected org.
  useEffect(() => {
    if (!selectedOrgLogin) return;
    void fetchOrgActivity(selectedOrgLogin);
    const id = window.setInterval(() => {
      void fetchOrgActivity(selectedOrgLogin, true);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [selectedOrgLogin, fetchOrgActivity]);

  const selectedOrg: Organization | undefined = useMemo(
    () => organizations.find((o) => o.login === selectedOrgLogin),
    [organizations, selectedOrgLogin],
  );

  const activityMap = selectedOrgLogin ? orgActivities[selectedOrgLogin] : undefined;
  const isLoadingActivity = selectedOrgLogin
    ? loadingOrgActivity.has(selectedOrgLogin)
    : false;
  const showSkeletons = isLoadingActivity && !activityMap;

  // Empty / loading states for the whole page.
  if (isLoadingOrgs && organizations.length === 0) {
    return (
      <div className="teamwork-view tw-centered">
        <p className="tw-muted">Loading organizations…</p>
      </div>
    );
  }

  if (!isLoadingOrgs && organizations.length === 0) {
    return (
      <div className="teamwork-view tw-centered">
        <h2>No organizations</h2>
        <p className="tw-muted">
          You are not a member of any GitHub organizations, or they are not visible with
          your current token scopes.
        </p>
      </div>
    );
  }

  return (
    <div className="teamwork-view">
      <header className="tw-header">
        <div className="tw-header-title">
          <h2>Teamwork</h2>
          {selectedOrg && <span className="tw-header-org">@{selectedOrg.login}</span>}
        </div>
        <div className="tw-header-controls">
          {organizations.length > 1 && (
            <select
              className="tw-org-select"
              value={selectedOrgLogin ?? ''}
              onChange={(e) => setPickedOrgLogin(e.target.value)}
            >
              {organizations.map((org) => (
                <option key={org.id} value={org.login}>
                  {org.name ? `${org.name} (@${org.login})` : `@${org.login}`}
                </option>
              ))}
            </select>
          )}
          <button
            className="tw-refresh"
            onClick={() => selectedOrgLogin && fetchOrgActivity(selectedOrgLogin, true)}
            disabled={isLoadingActivity}
          >
            {isLoadingActivity ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      <div className="tw-grid">
        {showSkeletons
          ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
          : selectedOrg?.members.map((member) => (
              <MemberCard
                key={member.id}
                member={member}
                activity={activityMap?.[member.login]}
              />
            ))}
      </div>
    </div>
  );
}
