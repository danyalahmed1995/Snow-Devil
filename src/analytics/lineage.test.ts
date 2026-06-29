import { describe, expect, it } from 'vitest';
import type { DeliveryEntity } from './types';
import { buildDeliveryLineage, relationshipsForEntity } from './lineage';

const base = { repositoryId: 'octo/repo', stage: 'issues' as const, state: 'open', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', sourceCompleteness: 'complete' as const };

describe('delivery lineage', () => {
  it('prefers explicit issue links and records evidence', () => {
    const entities: DeliveryEntity[] = [
      { ...base, id: 'issue', type: 'issue', number: 12, title: 'Issue', evidence: ['Explicitly linked pull request'] },
      { ...base, id: 'pr', type: 'pull_request', number: 12, title: 'PR', stage: 'merged', state: 'merged', mergedAt: '2026-01-03T00:00:00Z' },
    ];
    const relationships = buildDeliveryLineage(entities);
    expect(relationships).toContainEqual(expect.objectContaining({ sourceId: 'issue', targetId: 'pr', confidence: 'exact', kind: 'implemented_by' }));
    expect(relationshipsForEntity(relationships, 'issue')).toHaveLength(1);
  });

  it('marks number-only matches as inferred instead of exact', () => {
    const entities: DeliveryEntity[] = [
      { ...base, id: 'issue', type: 'issue', number: 9, title: 'Issue' },
      { ...base, id: 'pr', type: 'pull_request', number: 9, title: 'PR', stage: 'pull_requests' },
    ];
    expect(buildDeliveryLineage(entities)[0]).toMatchObject({ confidence: 'inferred', evidence: 'Matching repository and issue number' });
  });
});
