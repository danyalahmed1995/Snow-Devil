import type { FlowItem, FlowStage, FlowStatus } from '../types/flow';
import { classifyWorkflowItem } from './workflow-presentation';

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
  const classified = classifyWorkflowItem(item);
  return { stage: classified.stage, status: classified.status };
}
