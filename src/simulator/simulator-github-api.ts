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
import { canonicalEntityIdentity } from '../lib/canonical-identity';
import { normalizeSimulatorEventProvenance } from './canonical-event';

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

function reviewPolicyMetadata(node: any): Record<string, unknown> {
  const reviewDecision = typeof node.reviewDecision === 'string' ? node.reviewDecision : undefined;
  const approvalRequired = reviewDecision === 'REVIEW_REQUIRED';
  const approvalSatisfied = reviewDecision === 'APPROVED';
  const noApprovalRequired = node.reviewDecision == null && ['CLEAN', 'HAS_HOOKS', 'UNSTABLE'].includes(String(node.mergeStateStatus).toUpperCase());
  return {
    reviewDecision,
    mergeStateStatus: node.mergeStateStatus,
    mergeability: node.mergeable,
    headSha: node.headRefOid,
    requiredApprovalCount: approvalRequired || approvalSatisfied ? 1 : noApprovalRequired ? 0 : undefined,
    qualifyingApprovalCount: approvalRequired ? 0 : approvalSatisfied ? 1 : noApprovalRequired ? 0 : undefined,
    approvalRequirementConfidence: approvalRequired || approvalSatisfied || noApprovalRequired ? 'partial' : undefined,
  };
}

function currentAssertion(base: Omit<SimulatorEvent, 'id' | 'occurredAt' | 'eventType' | 'metadata'>, node: any, observedAt: string, id: string, eventType: SimulatorEventType, metadata: Record<string, unknown> = {}): SimulatorEvent {
  const sourceOccurredAt = typeof node.updatedAt === 'string' ? node.updatedAt : typeof node.createdAt === 'string' ? node.createdAt : observedAt;
  return { ...base, id, actor: undefined, occurredAt: sourceOccurredAt, sourceOccurredAt, observedAt, observationOnly: true, eventType, metadata: { nativeOrDerived: 'current_snapshot', currentSnapshot: true, observationOnly: true, sourceOccurredAt, observedAt, actualCreatedAt: node.createdAt, actualUpdatedAt: node.updatedAt, sourceAuthor: node.author?.login, ...reviewPolicyMetadata(node), ...metadata } };
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
                mergeStateStatus
                headRefOid
                reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }
                reviews(last: 20) { nodes { __typename id databaseId createdAt submittedAt updatedAt state author { login } } }
                comments(last: 20) { nodes { __typename id databaseId createdAt updatedAt author { login } } }
                assignees(first: 20) { nodes { login } }
                commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
                timelineItems(first: 80, since: "${since}") {
                  nodes {
                    __typename
                    ... on ReviewRequestedEvent { createdAt, actor { login }, requestedReviewer { ... on User { login } } }
                    ... on PullRequestReview { id, databaseId, createdAt, submittedAt, updatedAt, state, author { login } }
                    ... on ReadyForReviewEvent { createdAt, actor { login } }
                    ... on ConvertToDraftEvent { createdAt, actor { login } }
                    ... on IssueComment { id, databaseId, createdAt, updatedAt, author { login } }
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

        const subjectId = canonicalEntityIdentity('pull_request', repoId, pr.number);
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
          events.push(currentAssertion({ ...baseEvent, source: 'github-current-state' }, pr, currentAt, `${subjectId}:current-open`, 'opened', { url: pr.url, draft: pr.isDraft, baselineSourceAt: snapshotAt, baseRefName: pr.baseRefName, headRefName: pr.headRefName, baseRepository: repoId, headRepository: pr.headRepository?.nameWithOwner, headIsFork: pr.headRepository?.isFork, isCrossRepository: pr.isCrossRepository }));
        }

        if (pr.state === 'OPEN') {
          const currentBase = { ...baseEvent, source: 'github-current-state' };
          events.push(currentAssertion(currentBase, pr, currentAt, `${subjectId}:current-reopened`, 'reopened', { url: pr.url, baseRefName: pr.baseRefName, headRefName: pr.headRefName }));
          if (pr.isDraft) events.push(currentAssertion(currentBase, pr, currentAt, `${subjectId}:current-draft`, 'converted_to_draft'));
          else if (pr.reviewDecision === 'CHANGES_REQUESTED') events.push(currentAssertion(currentBase, pr, currentAt, `${subjectId}:current-changes`, 'changes_requested'));
          else if (pr.reviewDecision === 'APPROVED') events.push(currentAssertion(currentBase, pr, currentAt, `${subjectId}:current-approved`, 'approved'));
          else if (pr.reviewRequests?.nodes?.length) events.push(currentAssertion(currentBase, pr, currentAt, `${subjectId}:current-review-requested`, 'review_requested', { requestedReviewers: pr.reviewRequests.nodes.map((request: any) => request.requestedReviewer?.login).filter(Boolean) }));
          const checkState = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
          const checkEvent: SimulatorEventType | undefined = checkState === 'FAILURE' || checkState === 'ERROR' ? 'check_failed' : checkState === 'PENDING' || checkState === 'EXPECTED' ? 'check_started' : checkState === 'SUCCESS' ? 'check_succeeded' : undefined;
          if (checkEvent) events.push(currentAssertion(currentBase, pr, currentAt, `${subjectId}:current-${checkEvent}`, checkEvent, { checkState }));
          for (const assignee of pr.assignees?.nodes ?? []) if (assignee?.login) events.push(currentAssertion(currentBase, pr, currentAt, `${subjectId}:current-assigned:${assignee.login}`, 'assigned', { assignee: assignee.login }));
        }

        const prHistory = [...(pr.timelineItems?.nodes ?? []), ...(pr.reviews?.nodes ?? []), ...(pr.comments?.nodes ?? [])];
        const uniquePrHistory = [...new Map(prHistory.map((item: any) => [item.id ?? `${item.__typename}:${item.submittedAt ?? item.createdAt}`, item])).values()] as any[];
        if (uniquePrHistory.length) {
          for (const item of uniquePrHistory) {
            const sourceOccurredAt = item.submittedAt ?? item.createdAt;
            if (!sourceOccurredAt || sourceOccurredAt > until) continue;
            let evtType: SimulatorEventType | null = null;
            const metadata: any = { nativeOrDerived: "native" };
            if (item.__typename === "ReviewRequestedEvent") { evtType = "review_requested"; metadata.requestedReviewer = item.requestedReviewer?.login; }
            else if (item.__typename === "PullRequestReview") {
               if (item.state === "APPROVED") evtType = "approved";
               else if (item.state === "CHANGES_REQUESTED") evtType = "changes_requested";
               else if (item.state === "DISMISSED") evtType = "review_dismissed";
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
                id: item.id ? `${subjectId}:${item.__typename === 'PullRequestReview' ? 'review' : 'timeline'}:${item.id}` : `${subjectId}:${evtType}:${sourceOccurredAt}`,
                occurredAt: sourceOccurredAt,
                sourceOccurredAt,
                observedAt: currentAt,
                actor: item.actor || item.author,
                eventType: evtType,
                metadata: { ...metadata, sourceOccurredAt, observedAt: currentAt, sourceId: item.id, databaseId: item.databaseId, reviewUpdatedAt: item.updatedAt },
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

        const subjectId = canonicalEntityIdentity('issue', repoId, issue.number);
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

        const subjectId = canonicalEntityIdentity('release', repoId, release.id || release.tagName);
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

  return Array.from(uniqueEvents.values()).map(event => normalizeSimulatorEventProvenance(event)).sort((a, b) => {
    return new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
  });
}

/** Refresh one PR's risk evidence after CI or review changes without a full account sync. */
export async function fetchPullRequestRiskSnapshot(repositoryId: string, number: number, observedAt = new Date().toISOString()): Promise<SimulatorEvent[]> {
  const [owner, name] = repositoryId.split('/');
  if (!owner || !name) return [];
  const result = await fetchGraphQL(`query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){id number title url createdAt updatedAt state isDraft mergedAt closedAt baseRefName headRefName headRefOid mergeable mergeStateStatus reviewDecision author{login avatarUrl} reviewRequests(first:20){nodes{requestedReviewer{... on User{login}}}} commits(last:1){nodes{commit{oid statusCheckRollup{state}}}} timelineItems(last:100){nodes{__typename ... on PullRequestReview{id databaseId createdAt submittedAt updatedAt state author{login}} ... on ReviewRequestedEvent{id createdAt actor{login} requestedReviewer{... on User{login}}} ... on ReviewDismissedEvent{id createdAt actor{login} pullRequestReview{databaseId}} ... on IssueComment{id databaseId createdAt updatedAt author{login}} ... on PullRequestCommit{commit{oid committedDate author{user{login}} committer{user{login}}}} ... on ClosedEvent{id createdAt actor{login}} ... on MergedEvent{id createdAt actor{login}} ... on ReopenedEvent{id createdAt actor{login}}}}}}}`, { owner, name, number });
  const pr = result?.data?.repository?.pullRequest;
  if (!pr) return [];
  const subjectId = canonicalEntityIdentity('pull_request', repositoryId, number);
  const base = { source: 'github-graphql', repositoryId, repositoryName: name, repositoryOwner: owner, subjectId, subjectNodeId: pr.id, subjectType: 'pull_request' as const, subjectNumber: number, subjectTitle: pr.title, sourceCompleteness: 'complete' as const };
  const currentBase = { ...base, source: 'github-current-state' };
  const events: SimulatorEvent[] = [currentAssertion(currentBase, pr, observedAt, `${subjectId}:current-open`, pr.state === 'OPEN' ? 'reopened' : pr.mergedAt ? 'merged' : 'closed', { url: pr.url, draft: pr.isDraft, baseRefName: pr.baseRefName, headRefName: pr.headRefName, requestedReviewers: pr.reviewRequests?.nodes?.map((value: any) => value.requestedReviewer?.login).filter(Boolean) ?? [] })];
  const checkState = pr.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
  const checkEvent: SimulatorEventType | undefined = checkState === 'FAILURE' || checkState === 'ERROR' ? 'check_failed' : checkState === 'PENDING' || checkState === 'EXPECTED' ? 'check_started' : checkState === 'SUCCESS' ? 'check_succeeded' : undefined;
  if (checkEvent) events.push(currentAssertion(currentBase, pr, observedAt, `${subjectId}:current-${checkEvent}`, checkEvent, { checkState }));
  for (const item of pr.timelineItems?.nodes ?? []) {
    const sourceOccurredAt = item.submittedAt ?? item.createdAt ?? item.commit?.committedDate;
    if (!sourceOccurredAt) continue;
    let eventType: SimulatorEventType | undefined;
    let actor = item.actor ?? item.author;
    const metadata: Record<string, unknown> = { nativeOrDerived: 'native', sourceId: item.id, databaseId: item.databaseId, sourceOccurredAt, observedAt };
    if (item.__typename === 'PullRequestReview') eventType = item.state === 'APPROVED' ? 'approved' : item.state === 'CHANGES_REQUESTED' ? 'changes_requested' : item.state === 'DISMISSED' ? 'review_dismissed' : 'review_submitted';
    else if (item.__typename === 'ReviewRequestedEvent') { eventType = 'review_requested'; metadata.requestedReviewer = item.requestedReviewer?.login; }
    else if (item.__typename === 'ReviewDismissedEvent') { eventType = 'review_dismissed'; metadata.reviewDatabaseId = item.pullRequestReview?.databaseId; }
    else if (item.__typename === 'IssueComment') eventType = 'commented';
    else if (item.__typename === 'PullRequestCommit') { eventType = 'committed'; actor = item.commit?.author?.user ?? item.commit?.committer?.user; metadata.commitSha = item.commit?.oid; }
    else if (item.__typename === 'ClosedEvent') eventType = 'closed';
    else if (item.__typename === 'MergedEvent') eventType = 'merged';
    else if (item.__typename === 'ReopenedEvent') eventType = 'reopened';
    if (!eventType) continue;
    const sourceId = item.id ?? item.commit?.oid ?? `${eventType}:${sourceOccurredAt}`;
    events.push({ ...base, id: `${subjectId}:${item.__typename === 'PullRequestReview' ? 'review' : 'timeline'}:${sourceId}`, occurredAt: sourceOccurredAt, sourceOccurredAt, observedAt, actor, eventType, metadata });
  }
  return events.map(event => normalizeSimulatorEventProvenance(event));
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
          mergeStateStatus
          mergeable
          headRefOid
          author { login, avatarUrl }
          assignees(first: 20) { nodes { login } }
          reviewRequests(first: 20) { nodes { requestedReviewer { ... on User { login } } } }
          reviews(last: 20) { nodes { __typename id databaseId createdAt submittedAt updatedAt state author { login } } }
          comments(last: 20) { nodes { __typename id databaseId createdAt updatedAt author { login } } }
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
              ... on PullRequestReview { id, databaseId, createdAt, submittedAt, updatedAt, state, author { login } }
              ... on IssueComment { id, databaseId, createdAt, updatedAt, author { login } }
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
              ... on IssueComment { id, databaseId, createdAt, updatedAt, author { login } }
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
  const repoId = node.repository.nameWithOwner;
  const inclusionReason = node.author?.login === login ? "authored_by_you" : source.reason;
  return {
    source: "github-graphql",
    repositoryId: repoId,
    repositoryName: node.repository.name,
    repositoryOwner: node.repository.owner.login,
    subjectId: canonicalEntityIdentity(subjectType, repoId, node.number),
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
      id: `${base.subjectId}:opened`,
      occurredAt: node.createdAt,
      actor: node.author,
      eventType: "opened",
      metadata: base.baseMetadata,
      inclusionReason: base.inclusionReason,
    });
  }

  const existedAtReplayStart = node.createdAt < since && (!node.closedAt || node.closedAt >= since) && (!node.mergedAt || node.mergedAt >= since);
  if (existedAtReplayStart) {
    const sourceOccurredAt = node.updatedAt ?? node.createdAt;
    events.push({
      ...base,
      id: `${base.subjectId}:baseline`,
      occurredAt: sourceOccurredAt,
      sourceOccurredAt,
      observedAt: until,
      observationOnly: true,
      actor: undefined,
      eventType: 'opened',
      metadata: { ...base.baseMetadata, nativeOrDerived: 'current_snapshot', currentSnapshot: true, observationOnly: true, baseline: true, baselineLabel: 'Existing at replay start', actualCreatedAt: node.createdAt, actualUpdatedAt: node.updatedAt, sourceOccurredAt, observedAt: until, sourceAuthor: node.author?.login },
      inclusionReason: base.inclusionReason,
    });
  }

  const nodeHistory = [...(node.timelineItems?.nodes ?? []), ...(node.reviews?.nodes ?? []), ...(node.comments?.nodes ?? [])];
  const uniqueNodeHistory = [...new Map(nodeHistory.map((item: any) => [item.id ?? `${item.__typename}:${item.submittedAt ?? item.createdAt}`, item])).values()] as any[];
  for (const item of uniqueNodeHistory) {
    const sourceOccurredAt = item.submittedAt ?? item.createdAt;
    if (!sourceOccurredAt || sourceOccurredAt > until) continue;
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
      else if (item.state === "DISMISSED") evtType = "review_dismissed";
      else evtType = "review_submitted";
      if (item.author?.login === login) reason = "reviewed_by_you";
    }

    if (evtType) {
      events.push({
        ...base,
        id: item.id ? `${base.subjectId}:${item.__typename === 'PullRequestReview' ? 'review' : 'timeline'}:${item.id}` : `${base.subjectId}:${evtType}:${sourceOccurredAt}`,
        occurredAt: sourceOccurredAt,
        sourceOccurredAt,
        observedAt: until,
        actor: item.actor || item.author,
        eventType: evtType,
        metadata: { ...metadata, sourceOccurredAt, observedAt: until, sourceId: item.id, databaseId: item.databaseId, reviewUpdatedAt: item.updatedAt },
        inclusionReason: reason,
      });
    }
  }


  if (source.currentState && String(node.state).toUpperCase() === 'OPEN') {
    const currentBase = { ...base, source: 'github-current-state', inclusionReason: base.inclusionReason };
    events.push(currentAssertion(currentBase, node, until, `${base.subjectId}:current-open`, 'reopened', base.baseMetadata));
    if (base.subjectType === 'pull_request' && node.isDraft) events.push(currentAssertion(currentBase, node, until, `${base.repositoryId}:pull_request-${base.subjectNumber}:current-draft`, 'converted_to_draft', base.baseMetadata));
    if (base.subjectType === 'pull_request' && node.reviewDecision === 'CHANGES_REQUESTED') events.push(currentAssertion(currentBase, node, until, `${base.repositoryId}:pull_request-${base.subjectNumber}:current-changes`, 'changes_requested', base.baseMetadata));
    else if (base.subjectType === 'pull_request' && node.reviewDecision === 'APPROVED') events.push(currentAssertion(currentBase, node, until, `${base.repositoryId}:pull_request-${base.subjectNumber}:current-approved`, 'approved', base.baseMetadata));
    else if (base.subjectType === 'pull_request' && node.reviewRequests?.nodes?.length) events.push(currentAssertion(currentBase, node, until, `${base.repositoryId}:pull_request-${base.subjectNumber}:current-review-requested`, 'review_requested', { ...base.baseMetadata, requestedReviewers: node.reviewRequests.nodes.map((request: any) => request.requestedReviewer?.login).filter(Boolean) }));
    const checkState = node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state;
    const checkEvent: SimulatorEventType | undefined = checkState === 'FAILURE' || checkState === 'ERROR' ? 'check_failed' : checkState === 'PENDING' || checkState === 'EXPECTED' ? 'check_started' : checkState === 'SUCCESS' ? 'check_succeeded' : undefined;
    if (checkEvent) events.push(currentAssertion(currentBase, node, until, `${base.subjectId}:current-${checkEvent}`, checkEvent, { ...base.baseMetadata, checkState }));
    for (const assignee of node.assignees?.nodes ?? []) if (assignee?.login) events.push(currentAssertion({ ...currentBase, inclusionReason: assignee.login === login ? 'assigned_to_you' : base.inclusionReason }, node, until, `${base.subjectId}:current-assigned:${assignee.login}`, 'assigned', { ...base.baseMetadata, assignee: assignee.login }));
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

  return { events: (capped ? events.map(event => ({ ...event, sourceCompleteness: "partial" as const })) : events).map(event => normalizeSimulatorEventProvenance(event)), partial: capped };
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
    events: Array.from(uniqueEvents.values()).map(event => normalizeSimulatorEventProvenance(event)).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
    sourceFailures,
    loadedSources,
    totalSources: sources.length,
    sourceStatuses,
  };
}
