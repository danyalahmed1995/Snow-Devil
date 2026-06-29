import { describe, expect, it } from 'vitest';
import { resolveEntityTabTarget } from './entity-target';
import type { FlowItem } from '../types/flow';
import type { SimulatorEntityState } from '../simulator/simulator-types';

function flow(overrides: Partial<FlowItem>): FlowItem {
  return { id: 'node', type: 'issue', repositoryId: 'repo-id', repositoryName: 'octo/repo', owner: 'octo', number: 42, title: 'Issue', stage: 'issues', status: 'active', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', ...overrides };
}

describe('Inspector entity tab resolution', () => {
  it('uses an explicit valid GitHub URL', () => {
    expect(resolveEntityTabTarget(flow({ type: 'pull_request', url: 'https://github.com/octo/repo/pull/7', number: 7 }), 'live')).toMatchObject({ kind: 'pullRequests', url: 'https://github.com/octo/repo/pull/7' });
  });

  it('derives issue and pull request URLs from repository identity and number', () => {
    expect(resolveEntityTabTarget(flow({ type: 'issue', number: 9 }), 'live')?.url).toBe('https://github.com/octo/repo/issues/9');
    expect(resolveEntityTabTarget(flow({ type: 'pull_request', number: 11 }), 'live')?.url).toBe('https://github.com/octo/repo/pull/11');
  });

  it('supports simulator entities without changing their source state', () => {
    const entity = { id: 'pr-3', repositoryId: 'octo/repo', subjectType: 'pull_request', number: 3, title: 'Replay PR' } as SimulatorEntityState;
    expect(resolveEntityTabTarget(entity, 'live')).toMatchObject({ kind: 'pullRequests', url: 'https://github.com/octo/repo/pull/3' });
    expect(entity).not.toHaveProperty('url');
  });

  it('rejects malformed targets and never exposes synthetic demo URLs', () => {
    expect(resolveEntityTabTarget(flow({ repositoryName: '', number: undefined, url: 'javascript:alert(1)' }), 'live')).toBeUndefined();
    expect(resolveEntityTabTarget(flow({ url: 'https://github.com/octo/repo/issues/42' }), 'demo')).toBeUndefined();
  });
});
