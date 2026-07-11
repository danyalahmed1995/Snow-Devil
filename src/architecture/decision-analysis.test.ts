import { describe, expect, it } from 'vitest';
import { analyzeComponentDecisions } from './decision-analysis';
import type { ArchitectureComponent, PullRequestArchitectureImpact } from './types';

const component = (id: string, kind: ArchitectureComponent['kind'] = 'package'): ArchitectureComponent => ({ id, repositoryId: 'acme/repo', name: id, kind, rootPaths: [`src/${id}`], manifestPaths: [], configured: false, owners: [], confidence: { level: 'high', score: .9 } });
const impact = (): PullRequestArchitectureImpact => {
  const a = component('shared', 'shared'); const b = component('leaf'); const c = component('consumer');
  return { repositoryId: 'acme/repo', pullRequestNumber: 1, baseSha: 'base', headSha: 'head', architectureSnapshotSha: 'base', primaryComponentId: 'shared', affectedComponents: [{ component: a, files: [{ path: 'src/shared/index.ts', componentId: 'shared', confidence: a.confidence, reasons: [], status: 'modified', additions: 4, deletions: 1 }], additions: 4, deletions: 1, role: 'primary' }], changedFileMappings: [], dependencyChanges: [], directBlastRadius: ['consumer'], indirectBlastRadius: [], risk: { level: 'medium', score: 45, reasons: [] }, confidence: { level: 'high', score: .9 }, unmappedFiles: [], generatedAt: '2026-01-01', snapshot: { repositoryId: 'acme/repo', baseCommitSha: 'base', generatedAt: '2026-01-01', algorithmVersion: 1, status: 'ready', components: [a, b, c], dependencies: [{ fromComponentId: 'shared', toComponentId: 'consumer', kind: 'import', confidence: a.confidence, evidence: [] }, { fromComponentId: 'leaf', toComponentId: 'consumer', kind: 'import', confidence: a.confidence, evidence: [] }], files: [], unmappedFiles: [], excludedPaths: [], evidenceSummary: { mappedFiles: 1, totalFiles: 1, configured: false, manifestCount: 0, dependencyEvidenceCount: 2, ownedFiles: 0, requestCount: 1, exclusions: [] }, warnings: [] } };
};

describe('decision analysis', () => {
  it('is deterministic and distinguishes changed shared components', () => {
    const first = analyzeComponentDecisions(impact());
    const second = analyzeComponentDecisions(impact());
    expect(first).toEqual(second);
    expect(first.find(item => item.componentId === 'shared')?.impactScore).toBeGreaterThan(first.find(item => item.componentId === 'leaf')?.impactScore ?? 0);
    expect(first.find(item => item.componentId === 'shared')?.fixTier).toBe('recommended');
  });

  it('does not describe recommendations as safe', () => {
    const result = analyzeComponentDecisions(impact()).flatMap(item => [...item.impactReasons, ...item.fixReasons]).map(item => item.label.toLowerCase());
    expect(result.some(label => label.includes('safe'))).toBe(false);
  });

  it('downgrades high-fan-out changes and records CI/issue evidence', () => {
    const value = impact();
    value.snapshot.components.push(component('consumer-2'), component('consumer-3'));
    value.snapshot.dependencies.push(
      { fromComponentId: 'shared', toComponentId: 'consumer-2', kind: 'import', confidence: component('shared').confidence, evidence: [] },
      { fromComponentId: 'shared', toComponentId: 'consumer-3', kind: 'import', confidence: component('shared').confidence, evidence: [] },
    );
    value.decisionContext = { ci: { workflow: 'quality.yml', job: 'tests', failedStep: 'unit tests', componentIds: ['shared'] }, issue: { number: 7, title: 'Failure in shared path', componentIds: ['shared'] } };
    const shared = analyzeComponentDecisions(value).find(item => item.componentId === 'shared');
    expect(shared?.fixTier).not.toBe('recommended');
    expect(shared?.fixReasons.map(item => item.code)).toEqual(expect.arrayContaining(['CI_FAILURE_EVIDENCE', 'ISSUE_EVIDENCE']));
  });
});
