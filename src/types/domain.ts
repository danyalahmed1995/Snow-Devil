export type NodeType = 
  | 'account' 
  | 'user' 
  | 'organization' 
  | 'repository' 
  | 'pull_request' 
  | 'issue' 
  | 'review' 
  | 'comment' 
  | 'commit' 
  | 'branch' 
  | 'workflow_run' 
  | 'check_run' 
  | 'notification' 
  | 'label';

export type EdgeType = 
  | 'MEMBER_OF'
  | 'OWNS'
  | 'CONTAINS'
  | 'AUTHORED'
  | 'OPENED'
  | 'COMMENTED_ON'
  | 'REVIEWED'
  | 'REQUESTED_REVIEW_FROM'
  | 'ASSIGNED_TO'
  | 'MENTIONED_IN'
  | 'MERGED_BY'
  | 'LINKED_TO'
  | 'TARGETS_BRANCH'
  | 'SOURCE_BRANCH'
  | 'TRIGGERED'
  | 'HAS_CHECK'
  | 'HAS_LABEL'
  | 'NOTIFIES'
  | 'PARTICIPATES_IN';

export interface GraphNode {
  id: string;
  githubNodeId?: string;
  type: NodeType;
  title: string;
  subtitle?: string;
  state?: string;
  url?: string;
  ownerLogin?: string;
  repositoryName?: string;
  number?: number;
  createdAt?: string;
  updatedAt?: string;
  metadata: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  type: EdgeType;
  metadata?: Record<string, unknown>;
}

export interface Notification {
  id: string;
  githubNotificationId: string;
  reason: string;
  subjectType: string;
  subjectTitle: string;
  subjectUrl?: string;
  repositoryFullName: string;
  isUnread: boolean;
  updatedAt: string;
  lastReadAt?: string;
  payload: Record<string, unknown>;
}
