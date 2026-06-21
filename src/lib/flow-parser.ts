import type { FlowItem, ActorSummary, LabelSummary, ChecksSummary, ReviewSummary } from '../types/flow';
import { determineFlowStageAndStatus } from './flow-mapping';

function parseActor(actor: any): ActorSummary | undefined {
  if (!actor) return undefined;
  return {
    login: actor.login,
    avatarUrl: actor.avatarUrl,
    isBot: actor.__typename === 'Bot',
  };
}

function parseLabels(labelsNode: any): LabelSummary[] {
  if (!labelsNode?.nodes) return [];
  return labelsNode.nodes.map((l: any) => ({ name: l.name, color: l.color }));
}

function parseChecks(commitsNode: any): ChecksSummary | undefined {
  const commit = commitsNode?.nodes?.[0]?.commit;
  if (!commit) return undefined;
  
  const rollup = commit.statusCheckRollup;
  if (!rollup) return { state: 'MISSING', totalCount: 0, successCount: 0, failureCount: 0 };
  
  return {
    state: rollup.state,
    totalCount: 0,
    successCount: 0,
    failureCount: 0
  };
}

function parseReviews(pr: any): ReviewSummary | undefined {
  const decision = pr.reviewDecision;
  const requests = pr.reviewRequests?.nodes || [];
  const reviews = pr.reviews?.nodes || [];
  
  let state: ReviewSummary['state'] = 'NONE';
  if (decision === 'APPROVED') state = 'APPROVED';
  else if (decision === 'CHANGES_REQUESTED') state = 'CHANGES_REQUESTED';
  else if (decision === 'REVIEW_REQUIRED' || requests.length > 0) state = 'REVIEW_REQUIRED';
  else if (reviews.length > 0) state = 'PENDING';
  
  return {
    state,
    requestedReviewers: requests.map((r: any) => r.requestedReviewer?.login).filter(Boolean),
    reviews: reviews.map((r: any) => ({ author: r.author?.login, state: r.state }))
  };
}

export function parseGitHubIssueOrPR(node: any, type: 'issue' | 'pull_request'): FlowItem {
  const base: Partial<FlowItem> = {
    id: node.id,
    type,
    repositoryId: node.repository?.id || '',
    repositoryName: node.repository?.nameWithOwner || '',
    owner: node.repository?.owner?.login || '',
    number: node.number,
    title: node.title,
    url: node.url,
    author: parseActor(node.author),
    labels: parseLabels(node.labels),
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    mergedAt: node.mergedAt,
    closedAt: node.closedAt,
  };

  if (type === 'pull_request') {
    base.isDraft = node.isDraft;
    base.checksSummary = parseChecks(node.commits);
    base.reviewSummary = parseReviews(node);
    
    // Normalize status strings for mapping
    if (node.state === 'MERGED') {
      base.status = 'merged';
    } else if (node.state === 'CLOSED') {
      base.status = 'closed'; // Terminal state
    }
  } else {
    if (node.state === 'CLOSED') {
      base.status = 'closed'; // Terminal state
    }
  }

  const { stage, status } = determineFlowStageAndStatus(base);
  base.stage = stage;
  base.status = status;

  return base as FlowItem;
}

export interface HomeSummary {
  metrics: {
    needsAttention: number;
    waitingReview: number;
    failingChecks: number;
    recentlyMerged: number;
  };
  exactTotals: {
    merged: number;
  };
  previews: Record<string, FlowItem[]>;
}

export function parseHomeSummaryResponse(data: any): HomeSummary {
  if (!data) return { metrics: { needsAttention: 0, waitingReview: 0, failingChecks: 0, recentlyMerged: 0 }, exactTotals: { merged: 0 }, previews: {} };

  const authored = (data.authoredPrs?.nodes || []).filter(Boolean).map((n: any) => parseGitHubIssueOrPR(n, 'pull_request'));
  const reviewRequested = (data.reviewRequestedPrs?.nodes || []).filter(Boolean).map((n: any) => parseGitHubIssueOrPR(n, 'pull_request'));
  const assigned = (data.assignedIssues?.nodes || []).filter(Boolean).map((n: any) => parseGitHubIssueOrPR(n, 'issue'));
  const merged = (data.mergedPrs?.nodes || []).filter(Boolean).map((n: any) => parseGitHubIssueOrPR(n, 'pull_request'));

  const allItemsMap = new Map<string, FlowItem>();
  [...authored, ...reviewRequested, ...assigned, ...merged].forEach(item => {
     allItemsMap.set(item.id, item);
  });
  const allItems = Array.from(allItemsMap.values());

  const authoredIds = new Set(authored.map((i: any) => i.id));
  const reviewRequestedIds = new Set(reviewRequested.map((i: any) => i.id));

  const failingChecksIds = new Set(allItems.filter(i => i.stage === 'checks' && i.status === 'failing' && authoredIds.has(i.id)).map(i => i.id));
  const waitingReviewIds = new Set(allItems.filter(i => i.stage === 'review' && i.status !== 'changes_requested' && reviewRequestedIds.has(i.id)).map(i => i.id));
  const changesRequestedIds = new Set(allItems.filter(i => i.stage === 'review' && i.status === 'changes_requested' && authoredIds.has(i.id)).map(i => i.id));

  const needsAttentionSet = new Set([...failingChecksIds, ...waitingReviewIds, ...changesRequestedIds]);

  const previews: Record<string, FlowItem[]> = {};
  for (const item of allItems) {
    if (!previews[item.stage]) previews[item.stage] = [];
    if (previews[item.stage].length < 5) {
      previews[item.stage].push(item);
    }
  }

  const mergedExactTotal = data.mergedPrs?.issueCount || 0;

  return {
    metrics: {
      needsAttention: needsAttentionSet.size,
      waitingReview: waitingReviewIds.size,
      failingChecks: failingChecksIds.size,
      recentlyMerged: mergedExactTotal,
    },
    exactTotals: {
      merged: mergedExactTotal,
    },
    previews
  };
}

export function parseRepositoryFlowResponse(data: any): FlowItem[] {
  if (!data) return [];
  
  const itemsMap = new Map<string, FlowItem>();

  const processNodes = (nodes: any[], type: 'issue' | 'pull_request') => {
    if (!nodes) return;
    for (const node of nodes) {
      if (!node || !node.id) continue;
      if (!itemsMap.has(node.id)) {
        itemsMap.set(node.id, parseGitHubIssueOrPR(node, type));
      }
    }
  };

  processNodes(data.pullRequests?.nodes, 'pull_request');
  processNodes(data.mergedPrs?.nodes, 'pull_request');
  processNodes(data.issues?.nodes, 'issue');

  return Array.from(itemsMap.values());
}

export function parseRelease(node: any, repoId: string, repoName: string, repoOwner: string): FlowItem {
  const publishedAt = node.publishedAt;
  const isDraft = node.isDraft;
  const now = new Date().getTime();
  const publishedTime = publishedAt ? new Date(publishedAt).getTime() : 0;
  
  // Releases are coding until they are published, or if they are drafts
  let stage: FlowItem['stage'] = 'coding';
  if (!isDraft && publishedAt && publishedTime <= now) {
    stage = 'released';
  }

  return {
    id: node.id,
    type: 'release',
    repositoryId: repoId,
    repositoryName: repoName,
    owner: repoOwner,
    number: 0,
    title: node.name || node.tagName,
    url: node.url,
    author: {
      login: node.author?.login,
      avatarUrl: node.author?.avatarUrl,
    },
    labels: [],
    createdAt: node.createdAt || node.publishedAt,
    updatedAt: node.publishedAt,
    isDraft,
    isPrerelease: node.isPrerelease,
    tagName: node.tagName,
    publishedAt,
    stage,
    status: 'closed', // releases are inherently terminal once published
  } as unknown as FlowItem;
}
