import type { FlowEvent, FlowItem } from '../types/flow';
import { determineFlowStageAndStatus } from './flow-mapping';

/**
 * Parses raw GitHub timeline nodes into FlowEvents.
 */
export function parseTimelineEvents(itemId: string, repositoryId: string, nodes: any[]): FlowEvent[] {
  const events: FlowEvent[] = [];
  
  for (const node of nodes) {
    if (!node) continue;
    
    // Check suites from commits
    if (node.__typename === 'PullRequestCommit' && node.commit?.checkSuites?.nodes) {
      for (const suite of node.commit.checkSuites.nodes) {
        if (!suite) continue;
        events.push({
          id: `${node.commit.committedDate}-${suite.app?.name || 'check'}-${suite.status}`,
          itemId,
          repositoryId,
          type: 'CheckSuiteEvent',
          occurredAt: suite.updatedAt || node.commit.committedDate,
          status: suite.conclusion === 'SUCCESS' ? 'passing' : 
                  (suite.conclusion === 'FAILURE' || suite.conclusion === 'TIMED_OUT' ? 'failing' : 'active')
        });
      }
      // Also push the commit itself
      events.push({
        id: node.id || `commit-${node.commit.committedDate}`,
        itemId,
        repositoryId,
        type: 'CommitEvent',
        occurredAt: node.commit.committedDate,
        actor: node.commit.author?.user ? {
          login: node.commit.author.user.login,
          avatarUrl: node.commit.author.user.avatarUrl,
        } : undefined
      });
      continue;
    }
    
    events.push({
      id: node.id || `${node.__typename}-${node.createdAt || node.submittedAt || new Date().toISOString()}`,
      itemId,
      repositoryId,
      type: node.__typename,
      occurredAt: node.createdAt || node.submittedAt || new Date().toISOString(),
      actor: node.actor ? {
        login: node.actor.login,
        avatarUrl: node.actor.avatarUrl,
      } : node.author ? {
        login: node.author.login,
        avatarUrl: node.author.avatarUrl,
      } : undefined,
      status: node.state === 'APPROVED' ? 'approved' :
              node.state === 'CHANGES_REQUESTED' ? 'changes_requested' : undefined
    });
  }
  
  return events.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
}

export function createHistoricalSeed(liveItem: FlowItem): FlowItem {
  const seed: FlowItem = JSON.parse(JSON.stringify(liveItem));
  
  if (seed.type === 'pull_request') {
    seed.status = 'idle';
    seed.isDraft = false; // Timeline events will set draft if needed
    if (seed.reviewSummary) {
      seed.reviewSummary.state = 'NONE';
      seed.reviewSummary.requestedReviewers = [];
      seed.reviewSummary.reviews = [];
    }
    if (seed.checksSummary) {
      seed.checksSummary.state = 'MISSING';
    }
  } else if (seed.type === 'issue') {
    seed.status = 'idle';
  } else if (seed.type === 'release') {
    seed.status = 'idle';
    seed.stage = 'absent';
    return seed; // early return so determineFlowStageAndStatus doesn't override it
  }

  const { stage, status } = determineFlowStageAndStatus(seed);
  seed.stage = stage;
  seed.status = status;
  
  return seed;
}

function applyEvent(item: FlowItem, event: FlowEvent) {
  switch (event.type) {
    case 'ClosedEvent':
      item.status = 'closed';
      break;
    case 'MergedEvent':
      item.status = 'merged';
      break;
    case 'ReopenedEvent':
      item.status = 'active';
      break;
    case 'ConvertedToDraftEvent':
      item.isDraft = true;
      break;
    case 'ReadyForReviewEvent':
      item.isDraft = false;
      break;
    case 'ReviewRequestedEvent':
      if (item.reviewSummary) {
        item.reviewSummary.state = 'REVIEW_REQUIRED';
      }
      break;
    case 'PullRequestReview':
      if (item.reviewSummary) {
        if (event.status === 'approved') {
          item.reviewSummary.state = 'APPROVED';
        } else if (event.status === 'changes_requested') {
          item.reviewSummary.state = 'CHANGES_REQUESTED';
        }
      }
      break;
    case 'CheckSuiteEvent':
      if (item.checksSummary) {
        item.checksSummary.state = event.status === 'passing' ? 'SUCCESS' :
                                   event.status === 'failing' ? 'FAILURE' : 'PENDING';
      }
      break;
    case 'AssignedEvent':
      if (item.status === 'idle') item.status = 'active';
      break;
    case 'UnassignedEvent':
      break;
    case 'LabeledEvent':
    case 'UnlabeledEvent':
    case 'CrossReferencedEvent':
    case 'CommitEvent':
      if (item.status === 'idle') item.status = 'active';
      break;
  }
  
  const { stage, status } = determineFlowStageAndStatus(item);
  item.stage = stage;
  item.status = status;
}

function applyTerminalSafeguards(item: FlowItem, until: number) {
  if (item.type === 'release') {
    if (item.publishedAt && new Date(item.publishedAt).getTime() <= until) {
      item.status = 'released';
      item.stage = 'released';
    } else {
      item.status = 'idle';
      item.stage = 'absent';
    }
    return;
  }

  if (item.mergedAt && new Date(item.mergedAt).getTime() <= until) {
    item.status = 'merged';
    item.stage = 'merged';
  } else if (item.closedAt && new Date(item.closedAt).getTime() <= until) {
    if (item.status !== 'merged') {
      item.status = 'closed';
      item.stage = 'closed';
    }
  }
}

/**
 * Reconstructs a FlowItem's baseline state by applying events from creation up to rangeStart.
 */
export function buildBaselineState(initialItem: FlowItem, events: FlowEvent[], rangeStart: number): FlowItem {
  const item = createHistoricalSeed(initialItem);
  
  for (const event of events) {
    if (new Date(event.occurredAt).getTime() > rangeStart) {
      break;
    }
    applyEvent(item, event);
  }
  
  applyTerminalSafeguards(item, rangeStart);
  return item;
}

/**
 * Advances a baseline FlowItem's state to a given time by applying playback events.
 */
export function advanceItemState(baselineItem: FlowItem, events: FlowEvent[], rangeStart: number, cursorTime: number): FlowItem {
  const item: FlowItem = JSON.parse(JSON.stringify(baselineItem));
  
  for (const event of events) {
    const t = new Date(event.occurredAt).getTime();
    if (t <= rangeStart) continue;
    if (t > cursorTime) break;
    
    applyEvent(item, event);
  }
  
  applyTerminalSafeguards(item, cursorTime);
  return item;
}

/**
 * Legacy wrapper for tests that didn't use baseline caching.
 */
export function reconstructItemState(initialItem: FlowItem, events: FlowEvent[], until: number): FlowItem {
  const baseline = buildBaselineState(initialItem, events, 0); // No baseline, just seed
  return advanceItemState(baseline, events, 0, until);
}
