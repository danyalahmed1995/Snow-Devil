import { invoke } from "@tauri-apps/api/core";
import {
  SimulatorEvent,
  SimulatorEventType,
  SimulatorSubjectType,
  AccountInclusionReason,
  SimulatorSourceFailure,
  SimulatorFailureCategory,
  SimulatorSourceStatus,
} from "./simulator-types";
import { SimulatorSafeError, retryableSimulatorCategory, safeSimulatorExplanation, sanitizedDiagnostic, toSimulatorFailure } from "./simulator-errors";

async function fetchGraphQL(query: string, variables: any): Promise<any> {
  try {
    const result = await invoke<any>("execute_graphql", { query, variables });
    if (result.errors && result.errors.length > 0) {
      throw new SimulatorSafeError("invalid_response", "GitHub returned GraphQL errors while loading simulator history.", true);
    }
    return result;
  } catch (cause) {
    if (cause instanceof SimulatorSafeError) throw cause;
    throw cause;
  }
}

export async function fetchRepositoryActivity(
  owner: string,
  name: string,
  since: string,
  until: string
): Promise<SimulatorEvent[]> {
  const events: SimulatorEvent[] = [];
  const repoId = `${owner}/${name}`;

  try {
    // 1. Fetch Pull Requests updated in the time range
    let hasNextPage = true;
    let cursor: string | null = null;
    
    let pageCount = 0;
    while (hasNextPage && pageCount < 4) {
      pageCount++;
      const prQuery = `
        query($owner: String!, $name: String!, $cursor: String) {
          repository(owner: $owner, name: $name) {
            pullRequests(first: 30, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
              pageInfo { hasNextPage, endCursor }
              nodes {
                id
                number
                title
                url
                createdAt
                updatedAt
                state
                isDraft
                mergedAt
                closedAt
                author { __typename login, avatarUrl }
                baseRefName
                headRefName
                headRepository { nameWithOwner isFork owner { login } }
                isCrossRepository
                mergeable
                reviewDecision
                reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }
                assignees(first: 20) { nodes { login } }
                commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
                timelineItems(first: 80, since: "${since}") {
                  nodes {
                    __typename
                    ... on ReviewRequestedEvent { createdAt, actor { login }, requestedReviewer { ... on User { login } } }
                    ... on PullRequestReview { createdAt, state, author { login } }
                    ... on ReadyForReviewEvent { createdAt, actor { login } }
                    ... on ConvertToDraftEvent { createdAt, actor { login } }
                    ... on IssueComment { createdAt, author { login } }
                    ... on ClosedEvent { createdAt, actor { login } }
                    ... on MergedEvent { createdAt, actor { login } }
                    ... on ReopenedEvent { createdAt, actor { login } }
                  }
                }
              }
            }
          }
        }
      `;
      const result = await fetchGraphQL(prQuery, { owner, name, cursor });
      const prs = result?.data?.repository?.pullRequests;
      if (!prs) break;
      
      for (const pr of prs.nodes) {
        if (!pr || !pr.number || !pr.title) continue; // Reject malformed

        const subjectId = `pull_request-${pr.number}`;
        const snapshotAt = pr.createdAt >= since ? pr.createdAt : since;
        const currentAt = until;
        const baseEvent = {
          source: "github-graphql",
          repositoryId: repoId,
          repositoryName: name,
          repositoryOwner: owner,
          subjectId,
          subjectType: "pull_request" as SimulatorSubjectType,
          subjectNumber: pr.number,
          subjectTitle: pr.title,
          sourceCompleteness: (prs.pageInfo.hasNextPage && pageCount === 4 ? "partial" : "complete") as "partial" | "complete",
        };

        if (pr.state === 'OPEN' || pr.createdAt >= since && pr.createdAt <= until) {
          events.push({
            ...baseEvent,
            id: `${subjectId}:current-open`,
            source: 'github-current-state',
            occurredAt: snapshotAt,
            actor: pr.author,
            eventType: "opened",
            metadata: { nativeOrDerived: "current_snapshot", url: pr.url, draft: pr.isDraft, actualCreatedAt: pr.createdAt, actualUpdatedAt: pr.updatedAt, baseRefName: pr.baseRefName, headRefName: pr.headRefName, baseRepository: repoId, headRepository: pr.headRepository?.nameWithOwner, headIsFork: pr.headRepository?.isFork, isCrossRepository: pr.isCrossRepository, mergeable: pr.mergeable },
          });
        }

        if (pr.state === 'OPEN') {
          events.push({ ...baseEvent, id: `${subjectId}:current-reopened`, source: 'github-current-state', occurredAt: currentAt, actor: pr.author, eventType: 'reopened', metadata: { nativeOrDerived: 'current_snapshot', actualCreatedAt: pr.createdAt, actualUpdatedAt: pr.updatedAt, url: pr.url, baseRefName: pr.baseRefName, headRefName: pr.headRefName } });
          if (pr.isDraft) events.push({ ...baseEvent, id: `${subjectId}:current-draft`, source: 'github-current-state', occurredAt: currentAt, actor: pr.author, eventType: 'converted_to_draft', metadata: { nativeOrDerived: 'current_snapshot' } });
          else if (pr.reviewDecision === 'CHANGES_REQUESTED') events.push({ ...baseEvent, id: `${subjectId}:current-changes`, source: 'github-current-state', occurredAt: currentAt, actor: pr.author, eventType: 'changes_requested', metadata: { nativeOrDerived: 'current_snapshot' } });
          else if (pr.reviewDecision === 'APPROVED') events.push({ ...baseEvent, id: `${subjectId}:current-approved`, source: 'github-current-state', occurredAt: currentAt, actor: pr.author, eventType: 'approved', metadata: { nativeOrDerived: 'current_snapshot' } });
          else if (pr.reviewRequests?.nodes?.length) events.push({ ...baseEvent, id: `${subjectId}:current-review-requested`, source: 'github-current-state', occurredAt: currentAt, actor: pr.author, eventType: 'review_requested', metadata: { nativeOrDerived: 'current_snapshot', requestedReviewers: pr.reviewRequests.nodes.map((request: any) => request.requestedReviewer?.login).filter(Boolean) } });
          const checkState = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
          const checkEvent: SimulatorEventType | undefined = checkState === 'FAILURE' || checkState === 'ERROR' ? 'check_failed' : checkState === 'PENDING' || checkState === 'EXPECTED' ? 'check_started' : checkState === 'SUCCESS' ? 'check_succeeded' : undefined;
          if (checkEvent) events.push({ ...baseEvent, id: `${subjectId}:current-${checkEvent}`, source: 'github-current-state', occurredAt: currentAt, actor: pr.author, eventType: checkEvent, metadata: { nativeOrDerived: 'current_snapshot', checkState } });
          for (const assignee of pr.assignees?.nodes ?? []) if (assignee?.login) events.push({ ...baseEvent, id: `${subjectId}:current-assigned:${assignee.login}`, source: 'github-current-state', occurredAt: currentAt, actor: pr.author, eventType: 'assigned', metadata: { nativeOrDerived: 'current_snapshot', assignee: assignee.login } });
        }

        if (pr.timelineItems?.nodes) {
          for (const item of pr.timelineItems.nodes) {
            if (!item.createdAt || item.createdAt < since || item.createdAt > until) continue;
            let evtType: SimulatorEventType | null = null;
            const metadata: any = { nativeOrDerived: "native" };
            if (item.__typename === "ReviewRequestedEvent") { evtType = "review_requested"; metadata.requestedReviewer = item.requestedReviewer?.login; }
            else if (item.__typename === "PullRequestReview") {
               if (item.state === "APPROVED") evtType = "approved";
               else if (item.state === "CHANGES_REQUESTED") evtType = "changes_requested";
               else evtType = "review_submitted";
            }
            else if (item.__typename === "ReadyForReviewEvent") evtType = "ready_for_review";
            else if (item.__typename === "ConvertToDraftEvent") evtType = "converted_to_draft";
            else if (item.__typename === "IssueComment") evtType = "commented";
            else if (item.__typename === "MergedEvent") evtType = "merged";
            else if (item.__typename === "ClosedEvent") {
              // Only create closed if it wasn't merged at the exact same time
              if (pr.mergedAt && Math.abs(new Date(pr.mergedAt).getTime() - new Date(item.createdAt).getTime()) < 10000) {
                 continue; // Skip duplicate closed event if merged
              }
              evtType = "closed";
            }
            else if (item.__typename === "ReopenedEvent") evtType = "reopened";

            if (evtType) {
              events.push({
                ...baseEvent,
                id: `${subjectId}:${evtType}:${item.createdAt}`,
                occurredAt: item.createdAt,
                actor: item.actor || item.author,
                eventType: evtType,
                metadata,
              });
            }
          }
        }
      }
      hasNextPage = prs.pageInfo.hasNextPage;
      cursor = prs.pageInfo.endCursor;
    }

    // 2. Fetch Issues similarly
    hasNextPage = true;
    cursor = null;
    pageCount = 0;
    while (hasNextPage && pageCount < 4) {
      pageCount++;
      const issueQuery = `
        query($owner: String!, $name: String!, $cursor: String) {
          repository(owner: $owner, name: $name) {
            issues(first: 30, after: $cursor, orderBy: {field: UPDATED_AT, direction: DESC}) {
              pageInfo { hasNextPage, endCursor }
              nodes {
                id
                number
                title
                url
                createdAt
                updatedAt
                state
                closedAt
                author { __typename login, avatarUrl }
                assignees(first: 20) { nodes { login } }
                timelineItems(first: 80, since: "${since}") {
                  nodes {
                    __typename
                    ... on IssueComment { createdAt, author { login } }
                    ... on ClosedEvent { createdAt, actor { login }, stateReason }
                    ... on ReopenedEvent { createdAt, actor { login } }
                    ... on AssignedEvent { createdAt, actor { login }, assignee { ... on User { login } } }
                    ... on UnassignedEvent { createdAt, actor { login }, assignee { ... on User { login } } }
                    ... on LabeledEvent { createdAt, actor { login }, label { name } }
                    ... on UnlabeledEvent { createdAt, actor { login }, label { name } }
                  }
                }
              }
            }
          }
        }
      `;
      const result = await fetchGraphQL(issueQuery, { owner, name, cursor });
      const issues = result?.data?.repository?.issues;
      if (!issues) break;

      for (const issue of issues.nodes) {
        if (!issue || !issue.number || !issue.title) continue;

        const subjectId = `issue-${issue.number}`;
        const baseEvent = {
          source: "github-graphql",
          repositoryId: repoId,
          repositoryName: name,
          repositoryOwner: owner,
          subjectId,
          subjectType: "issue" as SimulatorSubjectType,
          subjectNumber: issue.number,
          subjectTitle: issue.title,
          sourceCompleteness: (issues.pageInfo.hasNextPage && pageCount === 4 ? "partial" : "complete") as "partial" | "complete",
        };

        if (issue.state === 'OPEN' || issue.createdAt >= since && issue.createdAt <= until) {
          events.push({
            ...baseEvent,
            id: `${subjectId}:current-open`,
            source: 'github-current-state',
            occurredAt: issue.createdAt >= since ? issue.createdAt : since,
            actor: issue.author,
            eventType: "opened",
            metadata: { nativeOrDerived: "current_snapshot", url: issue.url, actualCreatedAt: issue.createdAt, actualUpdatedAt: issue.updatedAt },
          });
        }
        if (issue.state === 'OPEN') {
          events.push({ ...baseEvent, id: `${subjectId}:current-reopened`, source: 'github-current-state', occurredAt: until, actor: issue.author, eventType: 'reopened', metadata: { nativeOrDerived: 'current_snapshot', url: issue.url, actualCreatedAt: issue.createdAt, actualUpdatedAt: issue.updatedAt } });
          for (const assignee of issue.assignees?.nodes ?? []) if (assignee?.login) events.push({ ...baseEvent, id: `${subjectId}:current-assigned:${assignee.login}`, source: 'github-current-state', occurredAt: until, actor: issue.author, eventType: 'assigned', metadata: { nativeOrDerived: 'current_snapshot', assignee: assignee.login } });
        }

        if (issue.timelineItems?.nodes) {
          for (const item of issue.timelineItems.nodes) {
            if (!item.createdAt || item.createdAt < since || item.createdAt > until) continue;
            let evtType: SimulatorEventType | null = null;
            const metadata: any = { nativeOrDerived: "native" };
            if (item.__typename === "IssueComment") evtType = "commented";
            else if (item.__typename === "ClosedEvent") evtType = "closed";
            else if (item.__typename === "ReopenedEvent") evtType = "reopened";
            else if (item.__typename === "AssignedEvent") { evtType = "assigned"; metadata.assignee = item.assignee?.login; }
            else if (item.__typename === "UnassignedEvent") { evtType = "unassigned"; metadata.assignee = item.assignee?.login; }
            else if (item.__typename === "LabeledEvent") { evtType = "labeled"; metadata.label = item.label?.name; }
            else if (item.__typename === "UnlabeledEvent") { evtType = "unlabeled"; metadata.label = item.label?.name; }

            if (evtType) {
              events.push({
                ...baseEvent,
                id: `${subjectId}:${evtType}:${item.createdAt}`,
                occurredAt: item.createdAt,
                actor: item.actor || item.author,
                eventType: evtType,
                metadata,
              });
            }
          }
        }
      }
      hasNextPage = issues.pageInfo.hasNextPage;
      cursor = issues.pageInfo.endCursor;
    }

    // 3. Fetch Releases
    hasNextPage = true;
    cursor = null;
    pageCount = 0;
    while (hasNextPage && pageCount < 2) {
      pageCount++;
      const releaseQuery = `
        query($owner: String!, $name: String!, $cursor: String) {
          repository(owner: $owner, name: $name) {
            releases(first: 30, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
              pageInfo { hasNextPage, endCursor }
              nodes {
                id
                name
                tagName
                createdAt
                publishedAt
                isDraft
                isPrerelease
                isLatest
                author { login, avatarUrl }
              }
            }
          }
        }
      `;
      const result = await fetchGraphQL(releaseQuery, { owner, name, cursor });
      const releases = result?.data?.repository?.releases;
      if (!releases) break;

      for (const release of releases.nodes) {
        if (!release || !release.tagName) continue;

        const subjectId = `release-${release.tagName}`;
        const baseEvent = {
          source: "github-graphql",
          repositoryId: repoId,
          repositoryName: name,
          repositoryOwner: owner,
          subjectId,
          subjectType: "release" as SimulatorSubjectType,
          subjectTitle: release.name || release.tagName,
          sourceCompleteness: (releases.pageInfo.hasNextPage && pageCount === 2 ? "partial" : "complete") as "partial" | "complete",
        };

        if (release.publishedAt && release.publishedAt >= since && release.publishedAt <= until) {
          events.push({
            ...baseEvent,
            id: `${subjectId}:released`,
            occurredAt: release.publishedAt,
            actor: release.author,
            eventType: "released",
            metadata: { 
              nativeOrDerived: "native",
              tagName: release.tagName,
              isDraft: release.isDraft,
              isPrerelease: release.isPrerelease,
            },
          });
        }
      }
      hasNextPage = releases.pageInfo.hasNextPage;
      cursor = releases.pageInfo.endCursor;
    }

  } catch {
    throw new Error("Repository simulator history could not be loaded.");
  }

  // Deduplicate by stable ID and sort
  const uniqueEvents = new Map<string, SimulatorEvent>();
  for (const ev of events) {
    if (!uniqueEvents.has(ev.id)) uniqueEvents.set(ev.id, ev);
  }

  return Array.from(uniqueEvents.values()).sort((a, b) => {
    return new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
  });
}

export async function fetchAccountActivity(
  login: string,
  since: string,
  until: string
): Promise<SimulatorEvent[]> {
  return (await fetchAccountActivityWithCoverage(login, since, until)).events;
}

export interface AccountActivityResult {
  events: SimulatorEvent[];
  sourceFailures: SimulatorSourceFailure[];
  loadedSources: number;
  totalSources: number;
  sourceStatuses?: SimulatorSourceStatus[];
}

export interface AccountActivitySource {
  id: string;
  label: string;
  reason: AccountInclusionReason;
  query: (login: string, sinceDate: string, untilDate: string) => string;
  fallbackQueries?: (login: string, sinceDate: string, untilDate: string) => string[];
  maxPages?: number;
  currentState?: boolean;
  purpose?: string;
  affectedData?: string;
}

const ACCOUNT_SOURCE_PAGE_LIMIT = 2;

export const ACCOUNT_ACTIVITY_SOURCES: AccountActivitySource[] = [
  { id: "authored", label: "Authored history", purpose: "PRs and issues authored by the viewer and updated inside the replay window.", affectedData: "Authored lifecycle events and cumulative authored totals", reason: "authored_by_you", query: (login, sinceDate, untilDate) => `author:${login} updated:${sinceDate}..${untilDate}`, fallbackQueries: (login, sinceDate, untilDate) => [`is:pr author:${login} updated:${sinceDate}..${untilDate}`, `is:issue author:${login} updated:${sinceDate}..${untilDate}`] },
  { id: "assigned", label: "Assigned history", purpose: "Issues and PRs assigned to the viewer across personal and organization repositories.", affectedData: "Assignment lifecycle events", reason: "assigned_to_you", query: (login, sinceDate, untilDate) => `assignee:${login} updated:${sinceDate}..${untilDate}` },
  { id: "review-requested", label: "Review request history", purpose: "Pull requests requesting review from the viewer.", affectedData: "Review-request lifecycle events", reason: "review_requested_from_you", query: (login, sinceDate, untilDate) => `review-requested:${login} type:pr updated:${sinceDate}..${untilDate}` },
  { id: "reviewed", label: "Reviewed pull requests", purpose: "Pull requests reviewed by the viewer.", affectedData: "Review submissions", reason: "reviewed_by_you", query: (login, sinceDate, untilDate) => `reviewed-by:${login} type:pr updated:${sinceDate}..${untilDate}` },
  { id: "commented", label: "Commented work", purpose: "Issues and pull requests with viewer participation evidence.", affectedData: "Lower-priority participation events and issue/PR involvement", reason: "commented_on_by_you", query: (login, sinceDate, untilDate) => `commenter:${login} updated:${sinceDate}..${untilDate}`, fallbackQueries: (login, sinceDate, untilDate) => [`is:pr commenter:${login} updated:${sinceDate}..${untilDate}`, `is:issue commenter:${login} updated:${sinceDate}..${untilDate}`] },
  { id: "current-authored", label: "Current authored work", purpose: "Authoritative current open PR and issue assertions, including work older than the replay range.", affectedData: "Today active authored work and existing-at-start baselines", reason: "authored_by_you", currentState: true, maxPages: 4, query: login => `is:open author:${login}`, fallbackQueries: login => [`is:open is:pr author:${login}`, `is:open is:issue author:${login}`] },
  { id: "current-assigned-issues", label: "Current assigned issues", purpose: "Authoritative open issues assigned to the viewer account-wide, including organization repositories.", affectedData: "Current assigned issues and baselines", reason: "assigned_to_you", currentState: true, maxPages: 4, query: login => `is:open is:issue assignee:${login}` },
  { id: "current-review-requests", label: "Current review requests", purpose: "Authoritative open pull requests currently requesting the viewer's review.", affectedData: "Current review responsibilities", reason: "review_requested_from_you", currentState: true, maxPages: 4, query: login => `is:open is:pr review-requested:${login}` },
];

const ACCOUNT_SEARCH_QUERY = `
  query($query: String!, $cursor: String, $since: DateTime!) {
    search(query: $query, type: ISSUE, first: 30, after: $cursor) {
      pageInfo { hasNextPage, endCursor }
      nodes {
        ... on PullRequest {
          id
          number
          title
          url
          createdAt
          updatedAt
          state
          isDraft
          mergedAt
          closedAt
          reviewDecision
          author { login, avatarUrl }
          assignees(first: 20) { nodes { login } }
          reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }
          commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
          repository { nameWithOwner, owner { login }, name }
          timelineItems(first: 80, since: $since) {
            nodes {
              __typename
              ... on ClosedEvent { createdAt, actor { login } }
              ... on MergedEvent { createdAt, actor { login } }
              ... on ReopenedEvent { createdAt, actor { login } }
              ... on ReadyForReviewEvent { createdAt, actor { login } }
              ... on ConvertToDraftEvent { createdAt, actor { login } }
              ... on ReviewRequestedEvent { createdAt, actor { login }, requestedReviewer { ... on User { login } } }
              ... on PullRequestReview { createdAt, state, author { login } }
              ... on IssueComment { createdAt, author { login } }
            }
          }
        }
        ... on Issue {
          id
          number
          title
          url
          createdAt
          updatedAt
          state
          closedAt
          author { login, avatarUrl }
          assignees(first: 20) { nodes { login } }
          repository { nameWithOwner, owner { login }, name }
          timelineItems(first: 80, since: $since) {
            nodes {
              __typename
              ... on ClosedEvent { createdAt, actor { login } }
              ... on ReopenedEvent { createdAt, actor { login } }
              ... on AssignedEvent { createdAt, actor { login }, assignee { ... on User { login } } }
              ... on UnassignedEvent { createdAt, actor { login }, assignee { ... on User { login } } }
              ... on IssueComment { createdAt, author { login } }
            }
          }
        }
      }
    }
  }
`;

function dateOnly(value: string): string {
  return value.split("T")[0] || value;
}

function assertSafeLogin(login: string): string {
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(login)) {
    throw new SimulatorSafeError("invalid_response", "Account login could not be used for simulator search.", false);
  }
  return login;
}

function sourceFailureCategory(failures: SimulatorSourceFailure[]): SimulatorFailureCategory {
  const priority: SimulatorFailureCategory[] = ["authentication", "rate_limit", "network", "invalid_response", "normalization_failed", "unknown"];
  return priority.find(category => failures.some(failure => failure.category === category)) ?? "unknown";
}

function accountBaseEvent(
  node: any,
  login: string,
  source: AccountActivitySource,
  sourceCompleteness: SimulatorEvent["sourceCompleteness"],
) {
  if (!node?.repository?.nameWithOwner || !node.repository?.name || !node.repository?.owner?.login || !node.number || !node.title) {
    throw new SimulatorSafeError("normalization_failed", "Account simulator source returned an unusable item.", false);
  }
  const subjectType = node.mergedAt !== undefined ? "pull_request" : "issue";
  const shortSubjectId = `${subjectType}-${node.number}`;
  const repoId = node.repository.nameWithOwner;
  const inclusionReason = node.author?.login === login ? "authored_by_you" : source.reason;
  return {
    source: "github-graphql",
    repositoryId: repoId,
    repositoryName: node.repository.name,
    repositoryOwner: node.repository.owner.login,
    subjectId: `${repoId}:${shortSubjectId}`,
    subjectType: subjectType as SimulatorSubjectType,
    subjectNumber: node.number,
    subjectTitle: node.title,
    sourceCompleteness,
    inclusionReason: inclusionReason as AccountInclusionReason,
    baseMetadata: {
      accountLogin: login,
      accountSource: source.id,
      nativeOrDerived: "derived",
      url: node.url,
    },
  };
}

function accountEventsForNode(
  node: any,
  login: string,
  source: AccountActivitySource,
  since: string,
  until: string,
  sourceCompleteness: SimulatorEvent["sourceCompleteness"],
): SimulatorEvent[] {
  if (!node) return [];
  const base = accountBaseEvent(node, login, source, sourceCompleteness);
  const events: SimulatorEvent[] = [];

  if (node.createdAt >= since && node.createdAt <= until) {
    events.push({
      ...base,
      id: `${base.repositoryId}:${base.subjectType}-${base.subjectNumber}:opened`,
      occurredAt: node.createdAt,
      actor: node.author,
      eventType: "opened",
      metadata: base.baseMetadata,
      inclusionReason: base.inclusionReason,
    });
  }

  const existedAtReplayStart = node.createdAt < since && (!node.closedAt || node.closedAt >= since) && (!node.mergedAt || node.mergedAt >= since);
  if (existedAtReplayStart) {
    events.push({
      ...base,
      id: `${base.repositoryId}:${base.subjectType}-${base.subjectNumber}:baseline`,
      occurredAt: since,
      actor: node.author,
      eventType: 'opened',
      metadata: { ...base.baseMetadata, baseline: true, baselineLabel: 'Existing at replay start', actualCreatedAt: node.createdAt, actualUpdatedAt: since },
      inclusionReason: base.inclusionReason,
    });
  }

  for (const item of node.timelineItems?.nodes ?? []) {
    if (!item.createdAt || item.createdAt < since || item.createdAt > until) continue;
    let evtType: SimulatorEventType | null = null;
    let reason = base.inclusionReason;
    const metadata: Record<string, unknown> = { ...base.baseMetadata, nativeOrDerived: "native" };

    if (item.__typename === "ClosedEvent") {
      if (base.subjectType === "pull_request" && node.mergedAt && Math.abs(new Date(node.mergedAt).getTime() - new Date(item.createdAt).getTime()) < 10000) continue;
      evtType = "closed";
    } else if (item.__typename === "MergedEvent") {
      evtType = "merged";
      if (item.actor?.login === login) reason = "merged_contribution";
    } else if (item.__typename === "ReopenedEvent") {
      evtType = "reopened";
    } else if (item.__typename === "ReadyForReviewEvent") {
      evtType = "ready_for_review";
    } else if (item.__typename === "ConvertToDraftEvent") {
      evtType = "converted_to_draft";
    } else if (item.__typename === "AssignedEvent") {
      evtType = "assigned";
      metadata.assignee = item.assignee?.login;
      if (item.assignee?.login === login) reason = "assigned_to_you";
    } else if (item.__typename === "UnassignedEvent") {
      evtType = "unassigned";
      metadata.assignee = item.assignee?.login;
    } else if (item.__typename === "IssueComment") {
      evtType = "commented";
      if (item.author?.login === login) reason = "commented_on_by_you";
    } else if (item.__typename === "ReviewRequestedEvent") {
      evtType = "review_requested";
      metadata.requestedReviewer = item.requestedReviewer?.login;
      if (item.requestedReviewer?.login === login) reason = "review_requested_from_you";
    } else if (item.__typename === "PullRequestReview") {
      if (item.state === "APPROVED") evtType = "approved";
      else if (item.state === "CHANGES_REQUESTED") evtType = "changes_requested";
      else evtType = "review_submitted";
      if (item.author?.login === login) reason = "reviewed_by_you";
    }

    if (evtType) {
      events.push({
        ...base,
        id: `${base.repositoryId}:${base.subjectType}-${base.subjectNumber}:${evtType}:${item.createdAt}`,
        occurredAt: item.createdAt,
        actor: item.actor || item.author,
        eventType: evtType,
        metadata,
        inclusionReason: reason,
      });
    }
  }


  if (source.currentState && String(node.state).toUpperCase() === 'OPEN') {
    const currentMetadata = { ...base.baseMetadata, currentSnapshot: true, actualCreatedAt: node.createdAt, actualUpdatedAt: node.updatedAt };
    events.push({ ...base, id: `${base.repositoryId}:${base.subjectType}-${base.subjectNumber}:current-open`, source: 'github-current-state', occurredAt: until, actor: node.author, eventType: 'reopened', metadata: currentMetadata, inclusionReason: base.inclusionReason });
    if (base.subjectType === 'pull_request' && node.isDraft) events.push({ ...base, id: `${base.repositoryId}:pull_request-${base.subjectNumber}:current-draft`, source: 'github-current-state', occurredAt: until, actor: node.author, eventType: 'converted_to_draft', metadata: currentMetadata, inclusionReason: base.inclusionReason });
    if (base.subjectType === 'pull_request' && node.reviewDecision === 'CHANGES_REQUESTED') events.push({ ...base, id: `${base.repositoryId}:pull_request-${base.subjectNumber}:current-changes`, source: 'github-current-state', occurredAt: until, actor: node.author, eventType: 'changes_requested', metadata: currentMetadata, inclusionReason: base.inclusionReason });
    else if (base.subjectType === 'pull_request' && node.reviewDecision === 'APPROVED') events.push({ ...base, id: `${base.repositoryId}:pull_request-${base.subjectNumber}:current-approved`, source: 'github-current-state', occurredAt: until, actor: node.author, eventType: 'approved', metadata: currentMetadata, inclusionReason: base.inclusionReason });
    else if (base.subjectType === 'pull_request' && node.reviewRequests?.nodes?.length) events.push({ ...base, id: `${base.repositoryId}:pull_request-${base.subjectNumber}:current-review-requested`, source: 'github-current-state', occurredAt: until, actor: node.author, eventType: 'review_requested', metadata: { ...currentMetadata, requestedReviewers: node.reviewRequests.nodes.map((request: any) => request.requestedReviewer?.login).filter(Boolean) }, inclusionReason: base.inclusionReason });
    const checkState = node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
    const checkEvent: SimulatorEventType | undefined = checkState === 'FAILURE' || checkState === 'ERROR' ? 'check_failed' : checkState === 'PENDING' || checkState === 'EXPECTED' ? 'check_started' : checkState === 'SUCCESS' ? 'check_succeeded' : undefined;
    if (checkEvent) events.push({ ...base, id: `${base.repositoryId}:${base.subjectType}-${base.subjectNumber}:current-${checkEvent}`, source: 'github-current-state', occurredAt: until, actor: node.author, eventType: checkEvent, metadata: { ...currentMetadata, checkState }, inclusionReason: base.inclusionReason });
    for (const assignee of node.assignees?.nodes ?? []) if (assignee?.login) events.push({ ...base, id: `${base.repositoryId}:${base.subjectType}-${base.subjectNumber}:current-assigned:${assignee.login}`, source: 'github-current-state', occurredAt: until, actor: node.author, eventType: 'assigned', metadata: { ...currentMetadata, assignee: assignee.login }, inclusionReason: assignee.login === login ? 'assigned_to_you' : base.inclusionReason });
  }

  return events;
}

async function fetchAccountQuery(login: string, source: AccountActivitySource, since: string, until: string, query: string): Promise<{ events: SimulatorEvent[]; partial: boolean }> {
  const events: SimulatorEvent[] = [];
  const maxPages = source.maxPages ?? ACCOUNT_SOURCE_PAGE_LIMIT;
  let hasNextPage = true;
  let cursor: string | null = null;
  let pageCount = 0;
  let capped = false;

  while (hasNextPage && pageCount < maxPages) {
    pageCount++;
    const result = await fetchGraphQL(ACCOUNT_SEARCH_QUERY, { query, cursor, since });
    const searchData = result?.data?.search;
    if (!searchData?.pageInfo || !Array.isArray(searchData.nodes)) {
      throw new SimulatorSafeError("invalid_response", "Account simulator search returned an invalid payload.", true);
    }
    capped = Boolean(searchData.pageInfo.hasNextPage && pageCount === maxPages);
    const completeness: SimulatorEvent["sourceCompleteness"] = capped ? "partial" : "complete";
    for (const node of searchData.nodes) {
      events.push(...accountEventsForNode(node, login, source, since, until, completeness));
    }
    hasNextPage = Boolean(searchData.pageInfo.hasNextPage);
    cursor = searchData.pageInfo.endCursor ?? null;
  }

  return { events: capped ? events.map(event => ({ ...event, sourceCompleteness: "partial" })) : events, partial: capped };
}

async function fetchAccountSource(login: string, source: AccountActivitySource, since: string, until: string): Promise<{ events: SimulatorEvent[]; partial: boolean; message?: string }> {
  const safeLogin = assertSafeLogin(login);
  const sinceDate = dateOnly(since);
  const untilDate = dateOnly(until);
  try {
    return await fetchAccountQuery(login, source, since, until, source.query(safeLogin, sinceDate, untilDate));
  } catch (cause) {
    const failure = toSimulatorFailure(cause, source.id, source.label, 'unknown');
    const fallbacks = source.fallbackQueries?.(safeLogin, sinceDate, untilDate) ?? [];
    if (failure.category !== 'invalid_response' || fallbacks.length === 0) throw cause;
    const settled = await Promise.allSettled(fallbacks.map(query => fetchAccountQuery(login, source, since, until, query)));
    const successful = settled.filter((result): result is PromiseFulfilledResult<{ events: SimulatorEvent[]; partial: boolean }> => result.status === 'fulfilled');
    if (successful.length === 0) throw settled.find(result => result.status === 'rejected')?.reason ?? cause;
    const events = new Map<string, SimulatorEvent>();
    successful.flatMap(result => result.value.events).forEach(event => events.set(event.id, event));
    const partial = successful.length !== settled.length || successful.some(result => result.value.partial);
    return {
      events: [...events.values()],
      partial,
      message: partial ? 'Loaded usable results through split queries; one or more fallback slices remain incomplete.' : 'Loaded through split issue and pull-request queries after the broad query was unsupported.',
    };
  }
}

export async function fetchAccountActivityWithCoverage(
  login: string,
  since: string,
  until: string,
  sources: AccountActivitySource[] = ACCOUNT_ACTIVITY_SOURCES,
): Promise<AccountActivityResult> {
  const settled = await Promise.allSettled(sources.map(async source => ({
    source,
    result: await fetchAccountSource(login, source, since, until),
  })));
  const events: SimulatorEvent[] = [];
  const sourceFailures: SimulatorSourceFailure[] = [];
  const sourceStatuses: SimulatorSourceStatus[] = [];
  let loadedSources = 0;
  const attemptedAt = new Date().toISOString();

  for (let index = 0; index < settled.length; index++) {
    const result = settled[index];
    const source = sources[index];
    if (result.status === "fulfilled") {
      loadedSources++;
      events.push(...result.value.result.events);
      sourceStatuses.push({ sourceId: source.id, label: source.label, purpose: source.purpose ?? source.label, affectedData: source.affectedData ?? 'Account history', status: result.value.result.partial ? 'partial' : 'loaded', message: result.value.result.message, retryable: result.value.result.partial, lastAttemptAt: attemptedAt });
    } else {
      const failure = toSimulatorFailure(result.reason, source.id, source.label, "partial_source");
      sourceFailures.push(failure);
      sourceStatuses.push({ sourceId: source.id, label: source.label, purpose: source.purpose ?? source.label, affectedData: source.affectedData ?? 'Account history', status: failure.retryable ? 'failed' : 'unsupported', category: failure.category, message: failure.message, retryable: failure.retryable, lastAttemptAt: attemptedAt });
      if (import.meta.env.DEV) {
        console.debug("[Simulator] Account source failed", { sourceId: source.id, ...sanitizedDiagnostic(result.reason) });
      }
    }
  }

  if (loadedSources === 0 && sourceFailures.length > 0) {
    const category = sourceFailureCategory(sourceFailures);
    throw new SimulatorSafeError(category, safeSimulatorExplanation(category), retryableSimulatorCategory(category));
  }

  const uniqueEvents = new Map<string, SimulatorEvent>();
  for (const event of events) {
    if (!uniqueEvents.has(event.id)) uniqueEvents.set(event.id, event);
  }

  return {
    events: Array.from(uniqueEvents.values()).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    sourceFailures,
    loadedSources,
    totalSources: sources.length,
    sourceStatuses,
  };
}
