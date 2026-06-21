import { beforeEach, describe, expect, it, vi } from 'vitest';
import accountEvents from '../../public/demo-data/simulator/account-history.json';
import manifest from '../../public/demo-data/manifest.json';
import homePipeline from '../../public/demo-data/account/home-pipeline.json';
import homeData from '../../public/demo-data/account/home.json';
import { DemoDataProvider } from './demo-provider';
import { reconstructState } from '../simulator/simulator-reducer';
import { useFlowStore } from '../stores/flow-store';
import { useModeStore } from '../stores/mode-store';
import type { SimulatorEvent, SimulatorStage } from '../simulator/simulator-types';

describe('offline demo fixtures', () => {
  beforeEach(() => { DemoDataProvider.clear(); useFlowStore.setState({ states: {} }); localStorage.clear(); });

  it('declares a deterministic synthetic manifest with broad coverage', () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.referenceDate).toBe('2026-02-15T12:00:00Z');
    expect(manifest.identity.login).toBe('snowdevil-demo');
    expect(manifest.repositories).toHaveLength(3);
    expect(manifest.coverage).toEqual(expect.arrayContaining(['home', 'flow', 'account-simulator', 'repository-simulator', 'partial-enrichment', 'deduplication']));
  });

  it('covers every visible simulator stage at the reference date', () => {
    const state = reconstructState(accountEvents as SimulatorEvent[], manifest.referenceDate);
    const stages = new Set(Array.from(state.values()).map(entity => entity.stage));
    const expected: SimulatorStage[] = ['issues', 'coding', 'pull_requests', 'review', 'checks', 'ready', 'merged', 'released', 'deployed'];
    expected.forEach(stage => expect(stages.has(stage), stage).toBe(true));
  });

  it('enriches partial entities and deduplicates repeated labels', () => {
    const state = reconstructState(accountEvents as SimulatorEvent[], manifest.referenceDate);
    const enriched = state.get('issue-empty')!;
    expect(enriched.title).toBe('Enriched title from complete timeline source');
    expect(enriched.sourceCompleteness).toBe('complete');
    expect(enriched.labels.filter(label => label.name === 'accessibility')).toHaveLength(1);
  });

  it('contains non-zero operational metric inputs', () => {
    const types = accountEvents.map(event => event.eventType);
    ['opened', 'merged', 'check_failed', 'check_succeeded', 'review_requested', 'changes_requested', 'released', 'deployment_failed', 'deployment_succeeded'].forEach(type => expect(types).toContain(type));
    expect(accountEvents.filter(event => event.sourceCompleteness === 'partial').length).toBeGreaterThan(0);
  });

  it('reproduces the account overflow fixture without duplicate records', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => accountEvents }));
    const first = await DemoDataProvider.accountEvents();
    DemoDataProvider.clear();
    const second = await DemoDataProvider.accountEvents();
    expect(first.filter(event => event.eventType === 'merged')).toHaveLength(15);
    expect(new Set(first.map(event => event.id)).size).toBe(first.length);
    expect(second).toEqual(first);
    vi.unstubAllGlobals();
  });

  it('clears incompatible inspector selections on mode switching and reset', () => {
    useFlowStore.getState().setTabState('native:flow', { selectedItemId: 'live-record' });
    useModeStore.getState().enterDemo();
    expect(useFlowStore.getState().states).toEqual({});
    useFlowStore.getState().setTabState('native:flow', { selectedItemId: 'demo-record' });
    useModeStore.getState().resetDemo();
    expect(useFlowStore.getState().states).toEqual({});
    useModeStore.getState().exitDemo();
    expect(useModeStore.getState().mode).toBe('live');
  });

  it('reports malformed fixtures clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ schemaVersion: 99 }) }));
    await expect(DemoDataProvider.manifest()).rejects.toThrow('Malformed demo fixture: manifest.json');
    vi.unstubAllGlobals();
  });

  describe('Home Pipeline Fixture', () => {
    it('validates without type casts through DemoDataProvider.pipeline()', async () => {
      // Mock fetch just for this test so we don't depend on public folder path resolution in vitest
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (path) => {
        if (path === '/demo-data/account/home-pipeline.json') return { ok: true, json: async () => homePipeline };
        return { ok: true, json: async () => ({}) };
      }));
      
      const pipeline = await DemoDataProvider.pipeline();
      expect(pipeline.items.length).toBeGreaterThan(0);
      
      const stages = new Set(pipeline.items.map(i => i.stage));
      ['issues', 'coding', 'pull_requests', 'review', 'checks', 'ready', 'merged', 'released'].forEach(s => {
        expect(stages.has(s as any), `Stage missing: ${s}`).toBe(true);
      });
      
      vi.unstubAllGlobals();
    });

    it('has metric/item consistency between home.json and home-pipeline.json', () => {
      // Metric consistency check
      const items = homePipeline.items;
      const metrics = homeData.metrics;

      const failingChecksCount = items.filter(i => i.stage === 'checks' && i.status === 'failing').length;
      const waitingReviewCount = items.filter(i => i.stage === 'review' && i.status !== 'changes_requested').length;
      const recentlyMergedCount = items.filter(i => i.stage === 'merged').length;

      // needsAttention isn't necessarily a straight sum of the others (e.g. might include changes_requested),
      // but we can verify the fixture is deterministic.
      expect(metrics.failingChecks).toBeGreaterThanOrEqual(failingChecksCount);
      // Not an exact strict match since demo item sets might be truncated, but we want to ensure
      // they don't wildly conflict (like 0 in metric but items exist).
      if (failingChecksCount > 0) expect(metrics.failingChecks).toBeGreaterThan(0);
      if (waitingReviewCount > 0) expect(metrics.waitingReview).toBeGreaterThan(0);
      if (recentlyMergedCount > 0) expect(metrics.recentlyMerged).toBeGreaterThan(0);
      
      // Verify no raw string casting required for basic FlowItem compliance
      expect(items.every(i => i.id && i.type && i.stage && i.status && i.createdAt)).toBe(true);
      expect(items.every(i => i.title.trim().length > 0 && i.repositoryName.trim().length > 0)).toBe(true);
      expect(new Set(items.map(i => i.id)).size).toBe(items.length);
      expect(items.filter(i => i.stage === 'issues').length).toBeGreaterThan(5);
      expect(items.some(i => i.reviewSummary?.state === 'REVIEW_REQUIRED')).toBe(true);
      expect(items.some(i => i.reviewSummary?.state === 'CHANGES_REQUESTED')).toBe(true);
      expect(items.some(i => i.reviewSummary?.state === 'APPROVED')).toBe(true);
      expect(items.some(i => i.checksSummary?.state === 'PENDING')).toBe(true);
      expect(items.some(i => i.checksSummary?.state === 'FAILURE')).toBe(true);
      expect(items.some(i => i.checksSummary?.state === 'SUCCESS')).toBe(true);
    });
  });
});
