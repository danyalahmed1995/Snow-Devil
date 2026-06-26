import { invoke } from "@tauri-apps/api/core";
import {
  SimulatorEvent,
  SimulatorEventType,
  SimulatorSubjectType,
  AccountInclusionReason,
  SimulatorSourceFailure,
  SimulatorFailureCategory,
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
                createdAt
                mergedAt
                closedAt
                author { login, avatarUrl }
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

        if (pr.createdAt >= since && pr.createdAt <= until) {
          events.push({
            ...baseEvent,
            id: `${subjectId}:opened`,
            occurredAt: pr.createdAt,
            actor: pr.author,
            eventType: "opened",
            metadata: { nativeOrDerived: "derived" },
          });
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
                createdAt
                closedAt
                author { login, avatarUrl }
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

        if (issue.createdAt >= since && issue.createdAt <= until) {
          events.push({
            ...baseEvent,
            id: `${subjectId}:opened`,
            occurredAt: issue.createdAt,
            actor: issue.author,
            eventType: "opened",
            metadata: { nativeOrDerived: "derived" },
          });
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
}

export interface AccountActivitySource {
  id: string;
  label: string;
  reason: AccountInclusionReason;
  query: (login: string, sinceDate: string, untilDate: string) => string;
  maxPages?: number;
}

const ACCOUNT_SOURCE_PAGE_LIMIT = 2;

export const ACCOUNT_ACTIVITY_SOURCES: AccountActivitySource[] = [
  { id: "authored", label: "Authored issues and pull requests", reason: "authored_by_you", query: (login, sinceDate, untilDate) => `author:${login} updated:${sinceDate}..${untilDate}` },
  { id: "assigned", label: "Assigned issues and pull requests", reason: "assigned_to_you", query: (login, sinceDate, untilDate) => `assignee:${login} updated:${sinceDate}..${untilDate}` },
  { id: "review-requested", label: "Review requests", reason: "review_requested_from_you", query: (login, sinceDate, untilDate) => `review-requested:${login} type:pr updated:${sinceDate}..${untilDate}` },
  { id: "reviewed", label: "Reviewed pull requests", reason: "reviewed_by_you", query: (login, sinceDate, untilDate) => `reviewed-by:${login} type:pr updated:${sinceDate}..${untilDate}` },
  { id: "commented", label: "Commented issues and pull requests", reason: "commented_on_by_you", query: (login, sinceDate, untilDate) => `commenter:${login} updated:${sinceDate}..${untilDate}` },
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
          mergedAt
          closedAt
          author { login, avatarUrl }
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
          closedAt
          author { login, avatarUrl }
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

  return events;
}

async function fetchAccountSource(login: string, source: AccountActivitySource, since: string, until: string): Promise<SimulatorEvent[]> {
  const events: SimulatorEvent[] = [];
  const safeLogin = assertSafeLogin(login);
  const query = source.query(safeLogin, dateOnly(since), dateOnly(until));
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

  return capped ? events.map(event => ({ ...event, sourceCompleteness: "partial" })) : events;
}

export async function fetchAccountActivityWithCoverage(
  login: string,
  since: string,
  until: string,
  sources: AccountActivitySource[] = ACCOUNT_ACTIVITY_SOURCES,
): Promise<AccountActivityResult> {
  const settled = await Promise.allSettled(sources.map(async source => ({
    source,
    events: await fetchAccountSource(login, source, since, until),
  })));
  const events: SimulatorEvent[] = [];
  const sourceFailures: SimulatorSourceFailure[] = [];
  let loadedSources = 0;

  for (let index = 0; index < settled.length; index++) {
    const result = settled[index];
    const source = sources[index];
    if (result.status === "fulfilled") {
      loadedSources++;
      events.push(...result.value.events);
    } else {
      sourceFailures.push(toSimulatorFailure(result.reason, source.id, source.label, "partial_source"));
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
  };
}
