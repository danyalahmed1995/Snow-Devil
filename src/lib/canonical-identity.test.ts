import { describe, expect, it } from 'vitest';
import { canonicalEntityIdentity, canonicalPullRequestIdentity, canonicalSimulatorSubjectIdentity, canonicalWorkflowRunIdentity } from './canonical-identity';

describe('canonical entity identity', () => {
  it('keeps same-number pull requests in different repositories separate', () => {
    expect(canonicalPullRequestIdentity('danyalahmed1995/Snow-Devil', 2)).toBe('pull-request:danyalahmed1995/snow-devil:2');
    expect(canonicalPullRequestIdentity('danyalahmed1995/EXT', 2)).toBe('pull-request:danyalahmed1995/ext:2');
    expect(canonicalPullRequestIdentity('danyalahmed1995/Snow-Devil', 2)).not.toBe(canonicalPullRequestIdentity('danyalahmed1995/EXT', 2));
  });

  it('keeps issue and pull request number spaces separate', () => {
    expect(canonicalEntityIdentity('issue', 'octo/app', 2)).not.toBe(canonicalEntityIdentity('pull_request', 'octo/app', 2));
  });

  it('uses repository identity for workflow runs and migrates replay subjects safely', () => {
    expect(canonicalWorkflowRunIdentity('Octo/App', 99)).toBe('workflow-run:octo/app:99');
    expect(canonicalSimulatorSubjectIdentity({ repositoryId: 'Octo/App', subjectType: 'pull_request', subjectNumber: 7, subjectId: 'pull_request-7' })).toBe('pull-request:octo/app:7');
  });
});

