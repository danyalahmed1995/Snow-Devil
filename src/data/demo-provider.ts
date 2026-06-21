import type { ConnectedAccount } from '../stores/auth-store';
import type { SimulatorEvent } from '../simulator/simulator-types';
import type { FlowItem } from '../types/flow';

export interface DemoRepository { id: string; nameWithOwner: string; description?: string | null; archived: boolean; fork: boolean; stars: number; language?: string | null }
export interface DemoManifest { schemaVersion: number; referenceDate: string; identity: ConnectedAccount; repositories: DemoRepository[]; coverage: string[]; fixtures: Record<string, string> }
export interface DemoHome { metrics: Record<string, number>; recentActivity: Array<{ id: string; title: string; type: string; occurredAt: string }>; notifications: Array<{ id: string; title: string; reason: string }>; featuredRepositoryIds: string[] }
export type DemoPipelineItem = FlowItem;

export interface DemoPipeline { schemaVersion: number; referenceDate: string; items: DemoPipelineItem[] }

const cache = new Map<string, unknown>();

async function fixture<T>(path: string, validate: (value: unknown) => value is T): Promise<T> {
  if (cache.has(path)) return cache.get(path) as T;
  const response = await fetch(`/demo-data/${path}`);
  if (!response.ok) throw new Error(`Demo fixture ${path} could not be loaded (${response.status})`);
  const value: unknown = await response.json();
  if (!validate(value)) throw new Error(`Malformed demo fixture: ${path}`);
  cache.set(path, value);
  return value;
}

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';
const manifest = (value: unknown): value is DemoManifest => object(value) && value.schemaVersion === 1 && typeof value.referenceDate === 'string' && object(value.identity) && Array.isArray(value.repositories) && Array.isArray(value.coverage) && object(value.fixtures);
const events = (value: unknown): value is SimulatorEvent[] => Array.isArray(value) && value.length > 0 && value.every(item => object(item) && typeof item.id === 'string' && typeof item.occurredAt === 'string' && typeof item.eventType === 'string' && typeof item.subjectType === 'string');

const VALID_ITEM_TYPES = new Set(['issue', 'pull_request', 'release']);
const VALID_STAGES = new Set(['issues', 'coding', 'pull_requests', 'review', 'checks', 'ready', 'merged', 'released', 'closed', 'absent']);
const VALID_STATUSES = new Set(['idle', 'active', 'queued', 'blocked', 'failing', 'passing', 'changes_requested', 'approved', 'merged', 'released', 'closed']);

function isDemoPipelineItem(v: unknown): v is DemoPipelineItem {
  if (!object(v)) return false;
  if (typeof v.id !== 'string' || !v.id) return false;
  if (!VALID_ITEM_TYPES.has(v.type as string)) return false;
  if (typeof v.repositoryId !== 'string') return false;
  if (typeof v.repositoryName !== 'string') return false;
  if (typeof v.owner !== 'string') return false;
  if (typeof v.title !== 'string') return false;
  if (!v.title.trim()) return false;
  if (!VALID_STAGES.has(v.stage as string)) return false;
  if (!VALID_STATUSES.has(v.status as string)) return false;
  if (typeof v.createdAt !== 'string') return false;
  if (typeof v.updatedAt !== 'string') return false;
  if (v.author !== undefined && (!object(v.author) || typeof v.author.login !== 'string')) return false;
  if (v.labels !== undefined && (!Array.isArray(v.labels) || !v.labels.every(label => object(label) && typeof label.name === 'string' && typeof label.color === 'string'))) return false;
  if (v.checksSummary !== undefined && (!object(v.checksSummary) || typeof v.checksSummary.state !== 'string' || typeof v.checksSummary.totalCount !== 'number' || typeof v.checksSummary.successCount !== 'number' || typeof v.checksSummary.failureCount !== 'number')) return false;
  if (v.reviewSummary !== undefined && (!object(v.reviewSummary) || typeof v.reviewSummary.state !== 'string' || !Array.isArray(v.reviewSummary.requestedReviewers) || !Array.isArray(v.reviewSummary.reviews))) return false;
  return true;
}

const isPipeline = (v: unknown): v is DemoPipeline =>
  object(v) &&
  v.schemaVersion === 1 &&
  typeof v.referenceDate === 'string' &&
  Array.isArray(v.items) &&
  v.items.every(isDemoPipelineItem);

function accountOverflowEvents(): SimulatorEvent[] {
  return Array.from({ length: 14 }, (_, index) => {
    const number = 501 + index;
    const subjectId = `pr-overflow-${number}`;
    const shared = {
      source: 'demo-overflow',
      repositoryId: 'nova-labs/snow-devil',
      repositoryName: 'snow-devil',
      repositoryOwner: 'nova-labs',
      subjectId,
      subjectType: 'pull_request' as const,
      subjectNumber: number,
      subjectTitle: `Merged delivery increment ${number}`,
      actor: { login: 'snowdevil-demo' },
      inclusionReason: 'merged_contribution' as const,
      sourceCompleteness: 'complete' as const,
    };
    const openedAt = new Date(Date.UTC(2026, 0, 30, 12, index)).toISOString();
    const mergedAt = new Date(Date.UTC(2026, 1, 1, 12, index)).toISOString();
    return [
      { ...shared, id: `${subjectId}:opened`, occurredAt: openedAt, eventType: 'opened' as const, metadata: { nativeOrDerived: 'native' } },
      { ...shared, id: `${subjectId}:merged`, occurredAt: mergedAt, eventType: 'merged' as const, metadata: { nativeOrDerived: 'native', commits: 2 + index % 3 } },
    ];
  }).flat();
}

/** Returns an isolated production FlowItem without sharing mutable fixture state. */
export function demoPipelineItemToFlowItem(item: DemoPipelineItem): FlowItem {
  return {
    ...item,
    author: item.author ? { ...item.author } : undefined,
    reviewers: item.reviewers?.map(reviewer => ({ ...reviewer })),
    labels: item.labels?.map(label => ({ ...label })),
    checksSummary: item.checksSummary ? { ...item.checksSummary } : undefined,
    reviewSummary: item.reviewSummary ? {
      ...item.reviewSummary,
      requestedReviewers: [...item.reviewSummary.requestedReviewers],
      reviews: item.reviewSummary.reviews.map(review => ({ ...review })),
    } : undefined,
    linkedIssueIds: item.linkedIssueIds ? [...item.linkedIssueIds] : undefined,
  };
}

export const DemoDataProvider = {
  manifest: () => fixture('manifest.json', manifest),
  home: () => fixture<DemoHome>('account/home.json', (v): v is DemoHome => object(v) && object(v.metrics) && Array.isArray(v.recentActivity) && Array.isArray(v.notifications) && Array.isArray(v.featuredRepositoryIds)),
  pipeline: () => fixture<DemoPipeline>('account/home-pipeline.json', isPipeline),
  accountEvents: async () => [...await fixture('simulator/account-history.json', events), ...accountOverflowEvents()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
  repositoryEvents: async (repositoryId: string) => (await fixture(`simulator/repositories/${repositoryId.replace('/', '--')}.json`, events)).filter(event => event.repositoryId === repositoryId),
  clear: () => cache.clear(),
};
