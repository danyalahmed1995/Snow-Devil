import { invoke } from '@tauri-apps/api/core';
import { describe, expect, it, vi } from 'vitest';
import { getSimulatorEventsFromDb, parseSimulatorCacheObject } from './simulator-cache';

describe('simulator cache validation', () => {
  it('contains malformed persisted JSON instead of breaking history hydration', () => {
    expect(parseSimulatorCacheObject('{broken')).toBeUndefined();
    expect(parseSimulatorCacheObject('["not", "an", "object"]')).toBeUndefined();
    expect(parseSimulatorCacheObject('{"login":"octo"}')).toEqual({ login: 'octo' });
  });

  it('repairs observation timestamps and actors when cached events reload', async () => {
    vi.mocked(invoke).mockResolvedValueOnce([{ id: 'current', repository_id: 'octo/app', repository_name: 'app', repository_owner: 'octo', subject_id: 'pull-request:octo/app:1', subject_type: 'pull_request', subject_number: 1, subject_title: 'One', event_type: 'changes_requested', timestamp: '2026-07-06T00:00:00Z', actor_json: JSON.stringify({ login: 'viewer' }), metadata_json: JSON.stringify({ nativeOrDerived: 'current_snapshot', actualUpdatedAt: '2026-05-28T23:37:29Z' }), source: 'github-current-state', completeness: 'complete', inclusion_reason: null }]);
    const values = await getSimulatorEventsFromDb();
    expect(values[0]).toMatchObject({ occurredAt: '2026-05-28T23:37:29.000Z', observedAt: '2026-07-06T00:00:00Z', observationOnly: true, actor: undefined });
  });
});
