import { describe, expect, it, vi } from 'vitest';
import { reconciliationDiagnostic } from './reconciliation-diagnostics';

describe('reconciliation diagnostics', () => {
  it('prints stable canonical IDs and inclusion reasons for selector comparisons', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
    const result = reconciliationDiagnostic('Flow', { stage: 'issues' }, [{ id: 'b', included: false, reason: 'outside range' }, { id: 'a', included: true, reason: 'assigned to viewer' }]);
    expect(result).toMatchObject({ count: 1, records: [{ id: 'a' }, { id: 'b' }] });
    debug.mockRestore();
  });
});
