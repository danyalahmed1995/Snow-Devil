export interface ArchitectureDecisionDiagnostics {
  scoringRuns: number;
  layoutRuns: number;
  inspectorRenders: number;
}

export const architectureDecisionDiagnostics: ArchitectureDecisionDiagnostics = {
  scoringRuns: 0,
  layoutRuns: 0,
  inspectorRenders: 0,
};

export function resetArchitectureDecisionDiagnostics() {
  architectureDecisionDiagnostics.scoringRuns = 0;
  architectureDecisionDiagnostics.layoutRuns = 0;
  architectureDecisionDiagnostics.inspectorRenders = 0;
}

export function incrementArchitectureDiagnostic(key: keyof ArchitectureDecisionDiagnostics) {
  architectureDecisionDiagnostics[key] += 1;
}
