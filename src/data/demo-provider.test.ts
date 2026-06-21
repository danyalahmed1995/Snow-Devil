import { beforeEach, describe, expect, it, vi } from 'vitest';
import accountEvents from '../../public/demo-data/simulator/account-history.json';
import manifest from '../../public/demo-data/manifest.json';
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
});
