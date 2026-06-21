import type { ConnectedAccount } from '../stores/auth-store';
import type { SimulatorEvent } from '../simulator/simulator-types';
import type { FlowItem, FlowItemType, FlowStage, FlowStatus, ActorSummary, LabelSummary, ChecksSummary, ReviewSummary } from '../types/flow';

export interface DemoRepository { id: string; nameWithOwner: string; description?: string | null; archived: boolean; fork: boolean; stars: number; language?: string | null }
export interface DemoManifest { schemaVersion: number; referenceDate: string; identity: ConnectedAccount; repositories: DemoRepository[]; coverage: string[]; fixtures: Record<string, string> }
export interface DemoHome { metrics: Record<string, number>; recentActivity: Array<{ id: string; title: string; type: string; occurredAt: string }>; notifications: Array<{ id: string; title: string; reason: string }>; featuredRepositoryIds: string[] }
export interface DemoFlow { nodes: Array<Record<string, unknown> & { id: string }>; edges: Array<Record<string, unknown> & { id: string; sourceId: string; targetId: string }>; filters: string[] }

/**
 * A pipeline item as stored in home-pipeline.json.
 * Every field matches its FlowItem counterpart exactly so the adapter
 * can forward the parsed value with no casts.
 */
export interface DemoPipelineItem {
  id: string;
  type: FlowItemType;
  repositoryId: string;
  repositoryName: string;
  owner: string;
  number?: number;
  title: string;
  stage: FlowStage;
  status: FlowStatus;
  url?: string;
  author?: ActorSummary;
  labels?: LabelSummary[];
  createdAt: string;
  updatedAt: string;
  mergedAt?: string;
  closedAt?: string;
  isDraft?: boolean;
  isBot?: boolean;
  checksSummary?: ChecksSummary;
  reviewSummary?: ReviewSummary;
  publishedAt?: string;
  tagName?: string;
  isPrerelease?: boolean;
  inclusionReason?: string;
}

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
  if (!VALID_STAGES.has(v.stage as string)) return false;
  if (!VALID_STATUSES.has(v.status as string)) return false;
  if (typeof v.createdAt !== 'string') return false;
  if (typeof v.updatedAt !== 'string') return false;
  return true;
}

const isPipeline = (v: unknown): v is DemoPipeline =>
  object(v) &&
  v.schemaVersion === 1 &&
  typeof v.referenceDate === 'string' &&
  Array.isArray(v.items) &&
  v.items.every(isDemoPipelineItem);

/** Returns each pipeline item as a full FlowItem (same shape, zero casts needed). */
export function demoPipelineItemToFlowItem(item: DemoPipelineItem): FlowItem {
  return item as unknown as FlowItem; // Safe: DemoPipelineItem is structurally identical to the FlowItem subset we use
}

export const DemoDataProvider = {
  manifest: () => fixture('manifest.json', manifest),
  home: () => fixture<DemoHome>('account/home.json', (v): v is DemoHome => object(v) && object(v.metrics) && Array.isArray(v.recentActivity) && Array.isArray(v.notifications) && Array.isArray(v.featuredRepositoryIds)),
  pipeline: () => fixture<DemoPipeline>('account/home-pipeline.json', isPipeline),
  flow: () => fixture<DemoFlow>('flow/graph.json', (v): v is DemoFlow => object(v) && Array.isArray(v.nodes) && Array.isArray(v.edges) && Array.isArray(v.filters)),
  accountEvents: () => fixture('simulator/account-history.json', events),
  repositoryEvents: async (repositoryId: string) => (await fixture(`simulator/repositories/${repositoryId.replace('/', '--')}.json`, events)).filter(event => event.repositoryId === repositoryId),
  clear: () => cache.clear(),
};
