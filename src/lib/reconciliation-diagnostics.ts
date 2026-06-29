export interface ReconciliationRecord {
  id: string;
  included: boolean;
  reason: string;
}

export function reconciliationDiagnostic(screen: string, scope: Record<string, unknown>, records: ReconciliationRecord[]) {
  const diagnostic = { screen, scope, count: records.filter(record => record.included).length, records: [...records].sort((left, right) => left.id.localeCompare(right.id)) };
  if (import.meta.env.DEV) console.debug('[Reconciliation]', diagnostic);
  return diagnostic;
}
