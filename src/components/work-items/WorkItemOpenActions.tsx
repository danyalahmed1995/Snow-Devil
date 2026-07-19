import { ArrowRightCircle, Copy, Globe } from 'lucide-react';
import { copyCanonicalLink, openInDefaultBrowser } from '../../lib/browser-actions';
import { resolveWorkItemOpenActions, type WorkItemOpenTarget, type WorkSurface } from '../../lib/work-item-open-actions';
import { useFlowStore } from '../../stores/flow-store';
import { useTabsStore } from '../../stores/tabs-store';
import type { FlowItem } from '../../types/flow';

interface Props {
  item: WorkItemOpenTarget;
  surface: WorkSurface;
  flowItem?: FlowItem;
  onStatus?: (status: string) => void;
  compact?: boolean;
}

export function openPrimaryWorkItem(item: WorkItemOpenTarget): boolean {
  const primary = resolveWorkItemOpenActions(item, 'other')[0];
  if (!primary?.enabled) return false;
  const tabs = useTabsStore.getState();
  if (primary.destination === 'native_pr') {
    tabs.openNativeTab(`native:pr:${item.repository!.toLowerCase()}:${item.number}`, 'pullRequestDiff', `PR #${item.number}`, false, true, { type: 'pullRequest', repository: item.repository!, number: item.number! });
    return true;
  }
  if (primary.destination === 'native_ci') {
    tabs.openNativeTab(`ciRun:${item.repository!.toLowerCase()}:${item.runId}`, 'ciRun', item.runNumber ? `CI · Run #${item.runNumber}` : 'CI Run', false, true, { type: 'ciRun', repository: item.repository!, runId: item.runId!, runNumber: item.runNumber });
    return true;
  }
  if (primary.destination === 'app_browser') {
    tabs.openBrowserTab(`github:work-item:${item.kind}:${item.id}`, 'issues', item.title, item.url!, false, true);
    return true;
  }
  return false;
}

function icon(destination: string) {
  if (destination === 'copy_link') return <Copy size={12} />;
  if (destination === 'external_browser' || destination === 'app_browser') return <Globe size={12} />;
  return <ArrowRightCircle size={12} />;
}

export function WorkItemOpenActions({ item, surface, flowItem, onStatus, compact = false }: Props) {
  const actions = resolveWorkItemOpenActions(item, surface);
  const displayActions = [...actions.filter(action => action.priority === 'secondary'), ...actions.filter(action => action.priority === 'primary')];
  const execute = async (destination: (typeof actions)[number]['destination']) => {
    const tabs = useTabsStore.getState();
    try {
      if (destination === 'native_pr') {
        openPrimaryWorkItem(item);
      } else if (destination === 'native_ci') {
        openPrimaryWorkItem(item);
      } else if (destination === 'app_browser') {
        if (item.kind === 'issue') openPrimaryWorkItem(item);
        else tabs.openBrowserTab(`github:work-item:${item.kind}:${item.id}`, 'pullRequests', item.title, item.url!, false, true);
      } else if (destination === 'external_browser') {
        await openInDefaultBrowser(item.url!);
        onStatus?.('Opened on GitHub');
      } else if (destination === 'copy_link') {
        await copyCanonicalLink(item.url!);
        onStatus?.('Link copied');
      } else if (destination === 'flow') {
        const stage = flowItem?.stage || item.stage;
        useFlowStore.getState().setTabState('native:flow', {
          scope: 'account', filterStage: stage as any, statusFilter: 'all',
          search: item.number ? `repo:${item.repository} #${item.number}` : '',
          selectedItemId: flowItem?.id ?? item.id, selectedFlowItem: flowItem,
          pendingScrollItemId: flowItem?.id ?? item.id,
          sourceContext: `Opened from Inspector: ${item.title}`,
          ...(!flowItem && { timeRange: 'all' })
        } as any);
        tabs.openNativeTab('native:flow', 'flow', 'Flow', false, true);
        if (!flowItem) onStatus?.('Flow opened and time range expanded to all history. Refresh or broaden filters if this item is still not in the current snapshot.');
      }
    } catch (error) {
      onStatus?.(error instanceof Error ? error.message : 'Action unavailable');
    }
  };

  return <div className={`inspector-actions work-item-open-actions work-item-open-actions--${item.kind}${compact ? ' work-item-open-actions--compact' : ''}`} role="group" aria-label="Open item actions">
    {displayActions.map(action => <button
      key={action.id}
      type="button"
      className={`${action.priority === 'primary' ? 'inspector-open-tab' : action.destination === 'flow' ? 'inspector-open-flow' : ''} work-item-open-action--${action.destination}`.trim()}
      disabled={!action.enabled}
      aria-label={action.label}
      title={!action.enabled ? action.reason : undefined}
      data-tooltip={`${action.label}\n${action.reason ?? `Open this item using ${action.label}.`}`}
      onClick={() => void execute(action.destination)}
    >{action.priority === 'secondary' && icon(action.destination)}{action.label}</button>)}
  </div>;
}
