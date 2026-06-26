import { describe, expect, it } from 'vitest';
import { classifyActivity, classifyActor, classifyAttention, classifyLifecycle, confidenceFromEvidence, isActorIncluded, uniqueWorkItemIdentity } from './delivery-semantics';

describe('shared delivery semantics', () => {
  it('uses one lifecycle precedence for draft, checks, review, ready, and terminal evidence', () => {
    expect(classifyLifecycle({ type: 'pull_request', isDraft: true, checkState: 'failure' }).stage).toBe('coding');
    expect(classifyLifecycle({ type: 'pull_request', reviewState: 'approved', checkState: 'failure' }).stage).toBe('checks');
    expect(classifyLifecycle({ type: 'pull_request', reviewState: 'changes_requested', checkState: 'success' }).stage).toBe('review');
    expect(classifyLifecycle({ type: 'pull_request', reviewState: 'approved', checkState: 'success' }).stage).toBe('ready');
    expect(classifyLifecycle({ type: 'pull_request', mergedAt: '2026-01-01T00:00:00Z', checkState: 'failure' }).stage).toBe('merged');
    expect(classifyLifecycle({ type: 'pull_request', mergedAt: '2026-01-01T00:00:00Z', releasedAt: '2026-01-02T00:00:00Z', deployedAt: '2026-01-03T00:00:00Z' }).stage).toBe('deployed');
  });

  it('does not turn missing release or deployment evidence into false certainty', () => {
    const merged = classifyLifecycle({ type: 'pull_request', mergedAt: '2026-01-01T00:00:00Z' });
    expect(merged.stage).toBe('merged');
    expect(merged.missingEvidence).toEqual(expect.arrayContaining(['No linked release evidence', 'No linked deployment evidence']));
    expect(confidenceFromEvidence({ available: false })).toBe('unavailable');
  });

  it('classifies attention, actors, active work, dormancy, and stable identity consistently', () => {
    expect(classifyAttention({ checkState: 'failure', reviewState: 'changes_requested', requestedReviewers: ['ada'] }, 'ada').reasons).toEqual(expect.arrayContaining(['failed_required_checks', 'changes_requested', 'review_requested_from_you']));
    expect(classifyActor('dependabot[bot]')).toBe('dependabot');
    expect(classifyActor('renovate[bot]')).toBe('renovate');
    expect(isActorIncluded('dependabot', { includeBots: false, includeDependabot: true })).toBe(false);
    expect(classifyActivity({ state: 'open', updatedAt: '2026-01-01T00:00:00Z' }, { referenceTime: '2026-06-01T00:00:00Z', activeWindowDays: 30, agingDays: 5, staleDays: 10 })).toBe('dormant');
    expect(uniqueWorkItemIdentity({ repositoryId: 'octo/app', type: 'pull_request', number: 42, id: 'node' })).toBe('octo/app:pull_request:42');
  });
});
