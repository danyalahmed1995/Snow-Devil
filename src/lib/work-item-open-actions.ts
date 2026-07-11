export type WorkItemKind = 'pull_request' | 'issue' | 'ci_run';

export type WorkSurface =
  | 'home'
  | 'flow'
  | 'repository'
  | 'pull_requests'
  | 'ci_activity'
  | 'delivery_risks'
  | 'notifications'
  | 'search'
  | 'other';

export type OpenDestination =
  | 'native_pr'
  | 'native_ci'
  | 'app_browser'
  | 'external_browser'
  | 'flow'
  | 'copy_link';

export interface WorkItemOpenTarget {
  id: string;
  kind: WorkItemKind;
  title: string;
  repository?: string;
  number?: number;
  runId?: string;
  runNumber?: number;
  url?: string;
}

export interface WorkItemOpenAction {
  id: OpenDestination;
  label: string;
  destination: OpenDestination;
  priority: 'primary' | 'secondary';
  enabled: boolean;
  reason?: string;
}

const labels: Record<OpenDestination, string> = {
  native_pr: 'Open PR',
  native_ci: 'Open CI Run',
  app_browser: 'Open in App Browser',
  external_browser: 'Open on GitHub',
  flow: 'Open in Flow',
  copy_link: 'Copy Link',
};

function action(destination: OpenDestination, priority: WorkItemOpenAction['priority'], enabled = true, reason?: string): WorkItemOpenAction {
  return { id: destination, label: labels[destination], destination, priority, enabled, reason };
}

/** Pure, deterministic policy for every work-item opening surface. */
export function resolveWorkItemOpenActions(item: WorkItemOpenTarget, surface: WorkSurface): WorkItemOpenAction[] {
  const hasRepository = Boolean(item.repository?.trim());
  const hasUrl = Boolean(item.url);
  let primary: WorkItemOpenAction;

  if (item.kind === 'pull_request') {
    const enabled = hasRepository && Number.isInteger(item.number) && (item.number ?? 0) > 0;
    primary = action('native_pr', 'primary', enabled, enabled ? undefined : 'Repository and pull request number are required.');
  } else if (item.kind === 'ci_run') {
    const enabled = hasRepository && Boolean(item.runId?.trim());
    primary = action('native_ci', 'primary', enabled, enabled ? undefined : 'Repository and workflow run ID are required.');
  } else if (item.kind === 'issue') {
    primary = action('app_browser', 'primary', hasUrl, hasUrl ? undefined : 'A canonical GitHub issue URL is required.');
  } else {
    return [];
  }

  const result = [primary];
  if (surface !== 'flow') result.push(action('flow', 'secondary'));
  if (item.kind !== 'issue') result.push(action('app_browser', 'secondary', hasUrl, hasUrl ? undefined : 'A canonical GitHub URL is required.'));
  result.push(action('external_browser', 'secondary', hasUrl, hasUrl ? undefined : 'A canonical GitHub URL is required.'));
  result.push(action('copy_link', 'secondary', hasUrl, hasUrl ? undefined : 'A canonical GitHub URL is required.'));
  return result;
}

