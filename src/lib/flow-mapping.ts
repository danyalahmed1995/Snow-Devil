import type { FlowItem, FlowStage, FlowStatus } from '../types/flow';

/**
 * Maps a raw Pull Request or Issue state into a single primary FlowStage and FlowStatus.
 *
 * Stage Precedence (Highest to Lowest):
 * 1. Released (if associated with a release/deployment - via metadata)
 * 2. Merged
 * 3. Ready (approved + checks passing)
 * 4. Checks (running/queued/failing/cancelled/error)
 * 5. Review (requested reviewers, reviews submitted, or changes requested)
 * 6. Coding (draft PR)
 * 7. Pull Requests (open, ready for review, no checks blocking, no reviewers requested yet)
 *
 * Issues have a simpler mapping.
 */
export function determineFlowStageAndStatus(item: Partial<FlowItem>): { stage: FlowStage; status: FlowStatus } {
  if (item.type === 'issue') {
    // Basic issue mapping
    if (item.status === 'merged' || item.status === 'released' || item.status === 'closed') {
      // If someone passed merged/released explicitly
      return { stage: item.status as FlowStage, status: item.status };
    }
    return { stage: 'issues', status: item.status || 'idle' };
  }

  // PR Precedence
  // 1. Released
  if (item.status === 'released') {
    return { stage: 'released', status: 'released' };
  }

  // 2. Merged or Closed
  if (item.status === 'merged' || (item as any).merged) {
    return { stage: 'merged', status: 'merged' };
  }
  
  if (item.status === 'closed') {
    return { stage: 'closed', status: 'closed' };
  }

  const isDraft = !!item.isDraft;
  const reviewState = item.reviewSummary?.state || 'NONE';
  const checksState = item.checksSummary?.state || 'MISSING';
  
  const hasFailingChecks = ['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED'].includes(checksState);
  const hasPendingChecks =
    item.checksSummary?.state === 'PENDING';
  
  const isApproved = reviewState === 'APPROVED';
  const changesRequested = reviewState === 'CHANGES_REQUESTED';
  const reviewRequested = reviewState === 'REVIEW_REQUIRED' || reviewState === 'PENDING' || (item.reviewSummary?.requestedReviewers?.length || 0) > 0;

  // 3. Ready
  // Must be approved AND checks must be passing (or no checks but approved)
  // If checks are failing, it cannot be Ready.
  if (isApproved && !hasFailingChecks && !hasPendingChecks && !isDraft) {
    return { stage: 'ready', status: 'approved' };
  }

  // 4. Checks
  // If checks are failing or pending, it is in Checks, UNLESS changes are requested.
  // Wait, if changes are requested and checks are failing, where should it be?
  // Let's say Review takes precedence IF changes are requested?
  // The requirements say: "Approved PR with failing checks -> remains in Checks."
  // Precedence list:
  // 3. Ready
  // 4. Checks
  // 5. Review
  // So Checks > Review if checks are failing/pending.
  if (hasFailingChecks) {
    return { stage: 'checks', status: 'failing' };
  }
  if (hasPendingChecks) {
    return { stage: 'checks', status: 'active' };
  }

  // 5. Review
  if (changesRequested) {
    return { stage: 'review', status: 'changes_requested' };
  }
  if (reviewRequested || isApproved) { // isApproved but missing/no checks
    // If it's approved but missing checks, maybe we just put it in Ready or Review?
    // Let's put approved with missing checks in Ready if no checks are required, but here we only check if it has passing checks.
    // If approved and missing checks, put in Ready. Wait, above we did `!hasFailingChecks && !hasPendingChecks`.
    // So Approved + MISSING checks went to Ready.
    return { stage: 'review', status: reviewState === 'APPROVED' ? 'approved' : 'active' };
  }

  // 6. Coding
  if (isDraft) {
    return { stage: 'coding', status: 'idle' };
  }

  // 7. Pull Requests
  return { stage: 'pull_requests', status: 'idle' };
}
