import { describe, expect, it } from 'vitest';
import { deriveViewerRelationship, isMaintainedRepository, mergeAuthoritativeCurrentState, repositoryContainsPullRequest, type CurrentStateRecord } from './product-model';

describe('shared product model', () => {
  it('keeps incoming fork pull requests in their base repository scope', () => {
    expect(repositoryContainsPullRequest('viewer/app', 'viewer/app')).toBe(true);
    expect(deriveViewerRelationship({ viewerLogin: 'viewer', authorLogin: 'contributor', baseRepository: { nameWithOwner: 'viewer/app', viewerPermission: 'ADMIN' }, headRepository: { nameWithOwner: 'contributor/app', isFork: true } })).toMatchObject({ primary: 'incoming_to_maintained_repository', directResponsibility: true });
  });

  it('distinguishes upstream authorship, participation, bots, and maintained access', () => {
    expect(deriveViewerRelationship({ viewerLogin: 'viewer', authorLogin: 'viewer', baseRepository: { nameWithOwner: 'upstream/app', viewerPermission: 'READ' }, headRepository: { nameWithOwner: 'viewer/app', isFork: true } }).primary).toBe('submitted_upstream_by_viewer');
    expect(deriveViewerRelationship({ viewerLogin: 'viewer', authorLogin: 'other', participants: ['viewer'], baseRepository: { nameWithOwner: 'other/app', viewerPermission: 'READ' } }).directResponsibility).toBe(false);
    expect(deriveViewerRelationship({ viewerLogin: 'viewer', authorLogin: 'dependabot[bot]', baseRepository: { nameWithOwner: 'viewer/app', viewerPermission: 'MAINTAIN' } })).toMatchObject({ primary: 'bot_authored', actorClassification: 'dependabot' });
    expect(isMaintainedRepository({ viewerPermission: 'WRITE' })).toBe(true);
    expect(isMaintainedRepository({ viewerPermission: 'TRIAGE' })).toBe(false);
  });

  it('lets authoritative current state survive partial historical replay', () => {
    const history: Array<CurrentStateRecord & { state: string }> = [{ id: 'old', repositoryId: 'viewer/app', type: 'pull_request', number: 2, updatedAt: '2026-01-01T00:00:00Z', state: 'unknown', sourceCompleteness: 'partial' }];
    const current: Array<CurrentStateRecord & { state: string }> = [{ id: 'node-2', repositoryId: 'viewer/app', type: 'pull_request', number: 2, updatedAt: '2026-06-27T00:00:00Z', state: 'open', sourceCompleteness: 'complete' }];
    expect(mergeAuthoritativeCurrentState(history, current)).toEqual([expect.objectContaining({ id: 'node-2', state: 'open', sourceCompleteness: 'complete' })]);
  });
});
