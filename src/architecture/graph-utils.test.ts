import { describe, it, expect } from 'vitest';
import { calculateHiddenComponentCount, getShortestUniqueQualifier } from './graph-utils';
import type { ArchitectureComponent, PullRequestArchitectureImpact } from './types';

const component = (value: Pick<ArchitectureComponent, 'id' | 'name' | 'kind' | 'rootPaths' | 'manifestPaths'>): ArchitectureComponent => ({
  ...value,
  repositoryId: 'acme/repo',
  configured: false,
  owners: [],
  confidence: { level: 'high', score: 1 },
});

describe('graph-utils', () => {
  describe('calculateHiddenComponentCount', () => {
    it('calculates hidden count correctly, excluding unrelated components and duplicates', () => {
      const impact = {
        primaryComponentId: 'c1',
        affectedComponents: [
          { component: { id: 'c1' } },
          { component: { id: 'c2' } }
        ],
        directBlastRadius: ['c2', 'c3'],
        indirectBlastRadius: ['c4'],
        dependencyChanges: [
          { fromComponentId: 'c1', toComponentId: 'c5' }
        ],
        snapshot: {
          components: [
            { id: 'c1' }, { id: 'c2' }, { id: 'c3' }, { id: 'c4' }, { id: 'c5' }, { id: 'c6' } // c6 is unrelated
          ]
        }
      } as unknown as PullRequestArchitectureImpact;

      const visibleNodeIds = new Set(['c1', 'c2']);
      // Relevant ids: c1, c2, c3, c4, c5 (Total 5)
      // Visible: c1, c2
      // Hidden: c3, c4, c5 (Total 3)
      
      const hiddenCount = calculateHiddenComponentCount(impact, visibleNodeIds);
      expect(hiddenCount).toBe(3);
    });
  });

  describe('getShortestUniqueQualifier', () => {
    it('returns kind if no duplicate names exist', () => {
      const c1 = component({ id: '1', name: 'App', kind: 'application', rootPaths: ['src/app'], manifestPaths: [] });
      const all = [c1];
      expect(getShortestUniqueQualifier(c1, all)).toBe('application');
    });

    it('returns unique root path if duplicates exist', () => {
      const c1 = component({ id: '1', name: 'Test Suite', kind: 'tests', rootPaths: ['tests/a'], manifestPaths: [] });
      const c2 = component({ id: '2', name: 'Test Suite', kind: 'tests', rootPaths: ['tests/b'], manifestPaths: [] });
      const all = [c1, c2];
      expect(getShortestUniqueQualifier(c1, all)).toBe('tests/a');
      expect(getShortestUniqueQualifier(c2, all)).toBe('tests/b');
    });

    it('falls back to manifest path if root paths are not unique or missing', () => {
      const c1 = component({ id: '1', name: 'Test Suite', kind: 'tests', rootPaths: [], manifestPaths: ['pkg1/package.json'] });
      const c2 = component({ id: '2', name: 'Test Suite', kind: 'tests', rootPaths: [], manifestPaths: ['pkg2/package.json'] });
      const all = [c1, c2];
      expect(getShortestUniqueQualifier(c1, all)).toBe('pkg1/package.json');
    });
    
    it('falls back to id suffix if no unique paths', () => {
      const c1 = component({ id: 'abc123456789', name: 'Test Suite', kind: 'tests', rootPaths: ['shared'], manifestPaths: [] });
      const c2 = component({ id: 'def123456789', name: 'Test Suite', kind: 'tests', rootPaths: ['shared'], manifestPaths: [] });
      const all = [c1, c2];
      expect(getShortestUniqueQualifier(c1, all)).toBe('abc12345');
    });
  });
});
