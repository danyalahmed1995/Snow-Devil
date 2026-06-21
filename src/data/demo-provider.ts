import type { ConnectedAccount } from '../stores/auth-store';
import type { SimulatorEvent } from '../simulator/simulator-types';

export interface DemoRepository { id: string; nameWithOwner: string; description?: string | null; archived: boolean; fork: boolean; stars: number; language?: string | null }
export interface DemoManifest { schemaVersion: number; referenceDate: string; identity: ConnectedAccount; repositories: DemoRepository[]; coverage: string[]; fixtures: Record<string, string> }
export interface DemoHome { metrics: Record<string, number>; recentActivity: Array<{ id: string; title: string; type: string; occurredAt: string }>; notifications: Array<{ id: string; title: string; reason: string }>; featuredRepositoryIds: string[] }
export interface DemoFlow { nodes: Array<Record<string, unknown> & { id: string }>; edges: Array<Record<string, unknown> & { id: string; sourceId: string; targetId: string }>; filters: string[] }

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

export const DemoDataProvider = {
  manifest: () => fixture('manifest.json', manifest),
  home: () => fixture<DemoHome>('account/home.json', (v): v is DemoHome => object(v) && object(v.metrics) && Array.isArray(v.recentActivity) && Array.isArray(v.notifications) && Array.isArray(v.featuredRepositoryIds)),
  flow: () => fixture<DemoFlow>('flow/graph.json', (v): v is DemoFlow => object(v) && Array.isArray(v.nodes) && Array.isArray(v.edges) && Array.isArray(v.filters)),
  accountEvents: () => fixture('simulator/account-history.json', events),
  repositoryEvents: async (repositoryId: string) => (await fixture(`simulator/repositories/${repositoryId.replace('/', '--')}.json`, events)).filter(event => event.repositoryId === repositoryId),
  clear: () => cache.clear(),
};
