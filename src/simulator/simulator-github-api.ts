import { invoke } from "@tauri-apps/api/core";
import { SimulatorEvent, SimulatorEventType, SimulatorSubjectType, AccountInclusionReason } from "./simulator-types";

async function fetchGraphQL(query: string, variables: any): Promise<any> {
  const result = await invoke<any>("execute_graphql", { query, variables });
  if (result.errors && result.errors.length > 0) {
    console.error("GraphQL Errors:", result.errors);
    throw new Error(result.errors[0].message);
  }
  return result;
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

  } catch (e) {
    console.error("Error fetching repository activity", e);
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
  const events: SimulatorEvent[] = [];
  
  try {
    let hasNextPage = true;
    let cursor: string | null = null;
    let pageCount = 0;

    // Use involved search
    while (hasNextPage && pageCount < 4) {
      pageCount++;
      const searchPrQuery = `
        query($query: String!, $cursor: String) {
          search(query: $query, type: ISSUE, first: 30, after: $cursor) {
            pageInfo { hasNextPage, endCursor }
            nodes {
              ... on PullRequest {
                id
                number
                title
                createdAt
                mergedAt
                closedAt
                author { login, avatarUrl }
                repository { nameWithOwner, owner { login }, name }
                timelineItems(first: 80, since: "${since}") {
                  nodes {
                    __typename
                    ... on ClosedEvent { createdAt, actor { login } }
                    ... on MergedEvent { createdAt, actor { login } }
                    ... on ReviewRequestedEvent { createdAt, requestedReviewer { ... on User { login } } }
                    ... on PullRequestReview { createdAt, author { login } }
                  }
                }
              }
              ... on Issue {
                id
                number
                title
                createdAt
                closedAt
                author { login, avatarUrl }
                repository { nameWithOwner, owner { login }, name }
                timelineItems(first: 80, since: "${since}") {
                  nodes {
                    __typename
                    ... on ClosedEvent { createdAt, actor { login } }
                    ... on ReopenedEvent { createdAt, actor { login } }
                    ... on AssignedEvent { createdAt, assignee { ... on User { login } } }
                    ... on IssueComment { createdAt, author { login } }
                  }
                }
              }
            }
          }
        }
      `;
      const result = await fetchGraphQL(searchPrQuery, { query: `involves:${login} updated:>=${since.split('T')[0]}`, cursor });
      const searchData = result?.data?.search;
      if (!searchData) break;

      const nodes = searchData.nodes;
      for (const node of nodes) {
        if (!node || !node.repository || !node.number || !node.title) continue;
        
        let inclusionReason: AccountInclusionReason | undefined = undefined;
        if (node.author?.login === login) inclusionReason = "authored_by_you";
        
        const subjectType = node.mergedAt !== undefined ? "pull_request" : "issue";
        const subjectId = `${subjectType}-${node.number}`;
        const repoId = node.repository.nameWithOwner;
        const baseEvent = {
          source: "github-graphql",
          repositoryId: repoId,
          repositoryName: node.repository.name,
          repositoryOwner: node.repository.owner.login,
          subjectId,
          subjectType: subjectType as SimulatorSubjectType,
          subjectNumber: node.number,
          subjectTitle: node.title,
          sourceCompleteness: (searchData.pageInfo.hasNextPage && pageCount === 4 ? "partial" : "complete") as "partial" | "complete",
        };
        
        if (node.createdAt >= since && node.createdAt <= until) {
          events.push({
            ...baseEvent,
            id: `${repoId}:${subjectId}:opened`,
            occurredAt: node.createdAt,
            actor: node.author,
            eventType: "opened",
            metadata: { nativeOrDerived: "derived" },
            inclusionReason: inclusionReason || "authored_by_you", // Fallback
          });
        }
        
        if (node.timelineItems?.nodes) {
          for (const item of node.timelineItems.nodes) {
            if (!item.createdAt || item.createdAt < since || item.createdAt > until) continue;
            let evtType: SimulatorEventType | null = null;
            const metadata: any = { nativeOrDerived: "native" };
            
            if (item.__typename === "ClosedEvent") {
               if (subjectType === "pull_request" && node.mergedAt && Math.abs(new Date(node.mergedAt).getTime() - new Date(item.createdAt).getTime()) < 10000) {
                 continue;
               }
               evtType = "closed";
            }
            else if (item.__typename === "MergedEvent") { evtType = "merged"; if (item.actor?.login === login) inclusionReason = "merged_contribution"; }
            else if (item.__typename === "ReopenedEvent") evtType = "reopened";
            else if (item.__typename === "AssignedEvent") { evtType = "assigned"; if (item.assignee?.login === login) inclusionReason = "assigned_to_you"; }
            else if (item.__typename === "UnassignedEvent") evtType = "unassigned";
            else if (item.__typename === "IssueComment") { evtType = "commented"; if (item.author?.login === login) inclusionReason = "commented_on_by_you"; }
            else if (item.__typename === "ReviewRequestedEvent") { evtType = "review_requested"; if (item.requestedReviewer?.login === login) inclusionReason = "review_requested_from_you"; }
            else if (item.__typename === "PullRequestReview") { evtType = "review_submitted"; if (item.author?.login === login) inclusionReason = "reviewed_by_you"; }

            if (evtType) {
              events.push({
                ...baseEvent,
                id: `${repoId}:${subjectId}:${evtType}:${item.createdAt}`,
                occurredAt: item.createdAt,
                actor: item.actor || item.author,
                eventType: evtType,
                metadata,
                inclusionReason: inclusionReason || "authored_by_you",
              });
            }
          }
        }
      }
      hasNextPage = searchData.pageInfo.hasNextPage;
      cursor = searchData.pageInfo.endCursor;
    }
  } catch (e) {
    console.error("Error fetching account activity", e);
  }

  const uniqueEvents = new Map<string, SimulatorEvent>();
  for (const ev of events) {
    if (!uniqueEvents.has(ev.id)) uniqueEvents.set(ev.id, ev);
  }

  return Array.from(uniqueEvents.values()).sort((a, b) => {
    return new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
  });
}
