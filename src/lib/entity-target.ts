import type { AnalyticsInspectable } from '../analytics/types';
import type { BrowserTabKind } from '../browser/browser-url';
import type { SimulatorEntityState } from '../simulator/simulator-types';
import type { AppMode } from '../stores/mode-store';
import type { FlowItem } from '../types/flow';

export interface EntityTabTarget {
  id: string;
  kind: BrowserTabKind;
  title: string;
  url: string;
}

export type InspectorTargetSource = FlowItem | SimulatorEntityState | AnalyticsInspectable;

function validGitHubUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || (url.hostname !== 'github.com' && !url.hostname.endsWith('.github.com'))) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function sourceType(source: InspectorTargetSource): string {
  if ('subjectType' in source) return source.subjectType;
  if ('type' in source) return source.type;
  return source.kind;
}

function sourceRepository(source: InspectorTargetSource): string | undefined {
  if ('repositoryName' in source) return source.repositoryName || source.repositoryId;
  return source.repositoryId;
}

function sourceTitle(source: InspectorTargetSource): string {
  return 'title' in source && source.title.trim() ? source.title : 'GitHub entity';
}

function sourceUrl(source: InspectorTargetSource): string | undefined {
  return 'url' in source ? source.url : undefined;
}

export function resolveEntityTabTarget(source: InspectorTargetSource | undefined, mode: AppMode): EntityTabTarget | undefined {
  if (!source || mode === 'demo') return undefined;
  const repository = sourceRepository(source);
  const type = sourceType(source);
  const number = 'number' in source ? source.number : undefined;
  const explicit = validGitHubUrl(sourceUrl(source));
  let url = explicit;
  let kind: BrowserTabKind = 'repository';

  if (type === 'issue') {
    kind = 'issues';
    if (!url && repository && number != null) url = validGitHubUrl(`https://github.com/${repository}/issues/${number}`);
  } else if (type === 'pull_request') {
    kind = 'pullRequests';
    if (!url && repository && number != null) url = validGitHubUrl(`https://github.com/${repository}/pull/${number}`);
  } else if (type === 'repository' || type === 'ci_health') {
    kind = 'repository';
    if (!url && repository) url = validGitHubUrl(`https://github.com/${repository}`);
  } else if (type === 'branch' && repository) {
    kind = 'repository';
    const branchName = sourceTitle(source);
    if (!url && branchName) url = validGitHubUrl(`https://github.com/${repository}/tree/${encodeURIComponent(branchName)}`);
  } else if (type === 'release' && repository) {
    kind = 'repository';
    if (!url) url = validGitHubUrl(`https://github.com/${repository}/releases`);
  } else if (type === 'commit' || type === 'deployment') {
    kind = 'repository';
  } else if (explicit) {
    if (/\/issues\/\d+/.test(explicit)) kind = 'issues';
    if (/\/pull\/\d+/.test(explicit)) kind = 'pullRequests';
  }

  if (!url) return undefined;
  return {
    id: `github:entity:${type}:${repository ?? 'unknown'}:${number ?? source.id}`,
    kind,
    title: number != null ? `${type === 'pull_request' ? 'PR' : type === 'issue' ? 'Issue' : sourceTitle(source)} #${number}` : sourceTitle(source),
    url,
  };
}
