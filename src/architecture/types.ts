export type ArchitectureConfidenceLevel = 'high' | 'medium' | 'low' | 'unknown';

export type ArchitectureColorMode = 'architecture' | 'change-impact' | 'fix-strategy';
export type ImpactTier = 'contained' | 'elevated' | 'high' | 'critical' | 'unknown';
export type FixTier = 'recommended' | 'plausible' | 'broad-risk' | 'not-relevant' | 'unknown';

export interface DecisionReason {
  code: string;
  label: string;
  weight: number;
  direction: 'positive' | 'negative' | 'neutral';
  evidenceRefs: string[];
}

export interface ValidationTarget {
  label: string;
  componentId?: string;
  evidenceRefs: string[];
}

export interface ArchitectureDecisionContext {
  ci?: {
    workflow?: string;
    job?: string;
    failedStep?: string;
    testNames?: string[];
    filePaths?: string[];
    headSha?: string;
    linkedPullRequest?: number;
    componentIds?: string[];
  };
  issue?: {
    number?: number;
    title?: string;
    filePaths?: string[];
    stackTrace?: string;
    labels?: string[];
    linkedPullRequests?: number[];
    componentIds?: string[];
  };
}

export interface DecisionAlternative {
  componentId: string;
  rank: number;
  score: number;
  confidence: ArchitectureConfidenceLevel;
  reason: string;
  riskTradeoff: string;
  validationTarget?: ValidationTarget;
}

export interface ComponentDecisionAnalysis {
  componentId: string;
  impactScore: number;
  impactTier: ImpactTier;
  impactConfidence: ArchitectureConfidenceLevel;
  impactReasons: DecisionReason[];
  fixScore: number;
  fixTier: FixTier;
  fixConfidence: ArchitectureConfidenceLevel;
  fixReasons: DecisionReason[];
  validationTargets: ValidationTarget[];
  evidence: string[];
  alternatives?: DecisionAlternative[];
}

export interface ArchitectureConfidence {
  level: ArchitectureConfidenceLevel;
  score: number;
}

export type ArchitectureEvidenceType =
  | 'configured-path' | 'manifest-boundary' | 'workspace-member' | 'project-reference'
  | 'import' | 'include' | 'build-target' | 'directory' | 'codeowners' | 'co-change' | 'test-location';

export interface ArchitectureEvidence {
  type: ArchitectureEvidenceType;
  source: string;
  detail: string;
}

export type ArchitectureComponentKind =
  | 'application' | 'service' | 'package' | 'library' | 'runtime'
  | 'infrastructure' | 'shared' | 'tests' | 'documentation' | 'unknown';

export interface ArchitectureOwner { login: string; source: string }

export interface ArchitectureComponent {
  id: string;
  repositoryId: string;
  name: string;
  description?: string;
  kind: ArchitectureComponentKind;
  rootPaths: string[];
  manifestPaths: string[];
  configured: boolean;
  owners: ArchitectureOwner[];
  confidence: ArchitectureConfidence;
}

export interface ArchitectureFileMapping {
  path: string;
  componentId?: string;
  confidence: ArchitectureConfidence;
  reasons: ArchitectureEvidence[];
}

export interface ComponentDependency {
  fromComponentId: string;
  toComponentId: string;
  kind: 'manifest' | 'workspace' | 'import' | 'include' | 'build-target' | 'project-reference' | 'configured' | 'historical';
  confidence: ArchitectureConfidence;
  evidence: ArchitectureEvidence[];
}

export interface ArchitectureSnapshot {
  repositoryId: string;
  baseCommitSha: string;
  generatedAt: string;
  algorithmVersion: number;
  configHash?: string;
  status: 'ready' | 'partial' | 'stale' | 'failed';
  components: ArchitectureComponent[];
  dependencies: ComponentDependency[];
  files: ArchitectureFileMapping[];
  unmappedFiles: string[];
  excludedPaths: string[];
  evidenceSummary: ArchitectureEvidenceSummary;
  warnings: ArchitectureWarning[];
}

export interface ArchitectureEvidenceSummary {
  mappedFiles: number;
  totalFiles: number;
  configured: boolean;
  manifestCount: number;
  dependencyEvidenceCount: number;
  ownedFiles: number;
  requestCount: number;
  exclusions: string[];
}

export interface ArchitectureWarning {
  code: 'truncated-tree' | 'content-cap' | 'invalid-config' | 'inaccessible-content' | 'unsupported-layout' | 'analysis-cancelled';
  message: string;
}

export interface RepositoryArchitectureTreeFile { path: string; size?: number; sha?: string }

export interface RepositoryArchitectureInput {
  repositoryId: string;
  baseCommitSha: string;
  truncated: boolean;
  files: RepositoryArchitectureTreeFile[];
  contents: Record<string, string>;
  config?: unknown;
  configHash?: string;
  requestCount: number;
  excludedPaths: string[];
  warnings: string[];
  stages: string[];
}

export interface ChangedFileArchitectureMapping extends ArchitectureFileMapping {
  previousPath?: string;
  status: 'added' | 'modified' | 'removed' | 'renamed';
  additions: number;
  deletions: number;
}

export interface AffectedComponent {
  component: ArchitectureComponent;
  files: ChangedFileArchitectureMapping[];
  additions: number;
  deletions: number;
  role: 'primary' | 'secondary';
}

export interface ArchitectureDependencyChange extends ComponentDependency {
  change: 'new' | 'removed' | 'modified' | 'existing-touched';
}

export interface ArchitectureRiskReason {
  code: string;
  label: string;
  detail: string;
  weight: number;
}

export interface ArchitectureRisk {
  level: 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  score: number;
  reasons: ArchitectureRiskReason[];
}

export interface PullRequestArchitectureImpact {
  repositoryId: string;
  pullRequestNumber: number;
  baseSha: string;
  headSha: string;
  architectureSnapshotSha: string;
  primaryComponentId?: string;
  affectedComponents: AffectedComponent[];
  changedFileMappings: ChangedFileArchitectureMapping[];
  dependencyChanges: ArchitectureDependencyChange[];
  directBlastRadius: string[];
  indirectBlastRadius: string[];
  risk: ArchitectureRisk;
  confidence: ArchitectureConfidence;
  unmappedFiles: string[];
  generatedAt: string;
  snapshot: ArchitectureSnapshot;
  decisionAnalysis?: ComponentDecisionAnalysis[];
  decisionContext?: ArchitectureDecisionContext;
}

export interface ArchitectureDiffFile {
  oldPath: string;
  newPath: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  additions: number;
  deletions: number;
  lines: Array<{ type: 'add' | 'remove' | 'context' | 'meta'; text: string }>;
}
