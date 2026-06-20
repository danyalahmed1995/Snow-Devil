import { GraphNode, GraphEdge } from '../types/domain';

export const demoNodes: GraphNode[] = [
  {
    id: 'user_1',
    type: 'user',
    title: 'octocat',
    subtitle: 'The GitHub Mascot',
    url: 'https://github.com/octocat',
    metadata: {
      avatarUrl: 'https://avatars.githubusercontent.com/u/583231?v=4',
      bio: 'I am the octocat',
    }
  },
  {
    id: 'org_1',
    type: 'organization',
    title: 'github',
    subtitle: 'GitHub Organization',
    url: 'https://github.com/github',
    metadata: {}
  },
  {
    id: 'repo_1',
    type: 'repository',
    title: 'github/hub',
    subtitle: 'A command-line tool that makes git easier to use with GitHub.',
    state: 'public',
    url: 'https://github.com/github/hub',
    ownerLogin: 'github',
    repositoryName: 'hub',
    metadata: {
      stars: 22000,
      language: 'Go'
    }
  },
  {
    id: 'pr_1',
    type: 'pull_request',
    title: 'Add new feature',
    state: 'open',
    url: 'https://github.com/github/hub/pull/1',
    ownerLogin: 'github',
    repositoryName: 'hub',
    number: 1,
    metadata: {}
  },
  {
    id: 'issue_1',
    type: 'issue',
    title: 'Bug in parsing',
    state: 'open',
    url: 'https://github.com/github/hub/issues/2',
    ownerLogin: 'github',
    repositoryName: 'hub',
    number: 2,
    metadata: {}
  }
];

export const demoEdges: GraphEdge[] = [
  {
    id: 'e1',
    sourceId: 'user_1',
    targetId: 'org_1',
    type: 'MEMBER_OF'
  },
  {
    id: 'e2',
    sourceId: 'org_1',
    targetId: 'repo_1',
    type: 'OWNS'
  },
  {
    id: 'e3',
    sourceId: 'repo_1',
    targetId: 'pr_1',
    type: 'CONTAINS'
  },
  {
    id: 'e4',
    sourceId: 'repo_1',
    targetId: 'issue_1',
    type: 'CONTAINS'
  },
  {
    id: 'e5',
    sourceId: 'user_1',
    targetId: 'pr_1',
    type: 'AUTHORED'
  }
];
