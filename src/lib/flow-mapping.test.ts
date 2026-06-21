import { describe, it, expect } from 'vitest';
import { determineFlowStageAndStatus } from './flow-mapping';
import type { FlowItem } from '../types/flow';

describe('flow-mapping', () => {
  it('Approved PR with failing checks remains in Checks', () => {
    const item: Partial<FlowItem> = {
      type: 'pull_request',
      reviewSummary: { state: 'APPROVED', requestedReviewers: [], reviews: [] },
      checksSummary: { state: 'FAILURE', totalCount: 1, successCount: 0, failureCount: 1 }
    };
    const { stage, status } = determineFlowStageAndStatus(item);
    expect(stage).toBe('checks');
    expect(status).toBe('failing');
  });

  it('Draft PR with failing checks follows precedence (Checks > Coding)', () => {
    const item: Partial<FlowItem> = {
      type: 'pull_request',
      isDraft: true,
      checksSummary: { state: 'FAILURE', totalCount: 1, successCount: 0, failureCount: 1 }
    };
    const { stage, status } = determineFlowStageAndStatus(item);
    expect(stage).toBe('checks');
    expect(status).toBe('failing');
  });

  it('Changes requested after an earlier approval goes to Review', () => {
    const item: Partial<FlowItem> = {
      type: 'pull_request',
      // Assuming the aggregation logic correctly determines the latest state is CHANGES_REQUESTED
      reviewSummary: { state: 'CHANGES_REQUESTED', requestedReviewers: [], reviews: [] },
      checksSummary: { state: 'SUCCESS', totalCount: 1, successCount: 1, failureCount: 0 }
    };
    const { stage, status } = determineFlowStageAndStatus(item);
    expect(stage).toBe('review');
    expect(status).toBe('changes_requested');
  });

  it('Missing check data is not interpreted as passing (stays in review/coding if not approved)', () => {
    const item: Partial<FlowItem> = {
      type: 'pull_request',
      isDraft: false,
      reviewSummary: { state: 'REVIEW_REQUIRED', requestedReviewers: ['someone'], reviews: [] },
      checksSummary: { state: 'MISSING', totalCount: 0, successCount: 0, failureCount: 0 }
    };
    const { stage } = determineFlowStageAndStatus(item);
    // Since checks are missing and review is requested, it should be in Review, not Ready.
    expect(stage).toBe('review');
  });

  it('Approved with missing check data goes to Ready', () => {
    const item: Partial<FlowItem> = {
      type: 'pull_request',
      isDraft: false,
      reviewSummary: { state: 'APPROVED', requestedReviewers: [], reviews: [] },
      checksSummary: { state: 'MISSING', totalCount: 0, successCount: 0, failureCount: 0 }
    };
    const { stage } = determineFlowStageAndStatus(item);
    expect(stage).toBe('ready');
  });

  it('Merged PR goes to merged', () => {
    const item: Partial<FlowItem> = {
      type: 'pull_request',
      status: 'merged'
    };
    const { stage } = determineFlowStageAndStatus(item);
    expect(stage).toBe('merged');
  });

  it('Open PR with no reviews, no checks, no draft goes to pull_requests', () => {
    const item: Partial<FlowItem> = {
      type: 'pull_request',
      isDraft: false,
      reviewSummary: { state: 'NONE', requestedReviewers: [], reviews: [] },
      checksSummary: { state: 'MISSING', totalCount: 0, successCount: 0, failureCount: 0 }
    };
    const { stage } = determineFlowStageAndStatus(item);
    expect(stage).toBe('pull_requests');
  });
});
