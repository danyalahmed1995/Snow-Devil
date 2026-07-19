export type CommitCiState = 'passing' | 'failing' | 'pending' | 'cancelled' | 'skipped' | 'unknown';

export interface CommitIdentity {
  name: string;
  login?: string;
  avatarUrl?: string;
  email?: string;
  date: string;
}

export interface CommitGraphNode {
  sha: string;
  shortSha: string;
  message: string;
  author: CommitIdentity;
  committer?: CommitIdentity;
  parentShas: string[];
  branchRefs: string[];
  tagRefs: string[];
  ciState: CommitCiState;
  pullRequest?: CommitGraphPullRequest;
}

export interface CommitGraphFile {
  filename: string;
  previousFilename?: string;
  status: 'added' | 'modified' | 'removed' | 'renamed' | 'copied' | 'changed' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
}

export interface CommitGraphPullRequest {
  number: number;
  title: string;
  state: string;
  mergedAt?: string;
  headRef: string;
  baseRef: string;
}

export interface CommitCheckSummary {
  state: CommitCiState;
  total: number;
  passed: number;
  failed: number;
  pending: number;
  names: string[];
  states: CommitCiState[];
  latestRunId?: string;
}

export interface CommitGraphDetails {
  node: CommitGraphNode;
  fullMessage: string;
  stats: { additions: number; deletions: number; total: number };
  files: CommitGraphFile[];
  verification?: { verified: boolean; reason: string };
  pullRequest?: CommitGraphPullRequest;
  checks: CommitCheckSummary;
  partialErrors: string[];
}

export interface CommitComparison {
  baseSha: string;
  targetSha: string;
  status: string;
  aheadBy: number;
  behindBy: number;
  totalCommits: number;
  additions: number;
  deletions: number;
  files: CommitGraphFile[];
  commits: CommitGraphNode[];
}
