import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TabFlowState } from './flow-store';

export interface SavedView {
  id: string;
  name: string;
  screen: 'flow';
  state: Partial<TabFlowState>;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  unavailableReason?: string;
}

interface SavedViewsStore {
  views: SavedView[];
  save: (name:string, state:TabFlowState) => SavedView;
  rename: (id:string, name:string) => void;
  duplicate: (id:string) => SavedView | undefined;
  remove: (id:string) => void;
  setPinned: (id:string, pinned:boolean) => void;
}

const serializableState = (state: TabFlowState): Partial<TabFlowState> => ({
  scope:state.scope, mode:state.mode, selectedRepository:state.selectedRepository,
  timeRange:state.timeRange, customRangeStart:state.customRangeStart, customRangeEnd:state.customRangeEnd,
  search:state.search, activeOnly:state.activeOnly, hideEmptyStages:state.hideEmptyStages,
  filterStage:state.filterStage, statusFilter:state.statusFilter, involvementFilter:state.involvementFilter,
  actorFilter:state.actorFilter, accountRepositoryFilter:state.accountRepositoryFilter,
  sortOrder:state.sortOrder, sourceContext:state.sourceContext,
});

const id = () => `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Isolates malformed records so one corrupt view never prevents hydration. */
export function sanitizeSavedViews(value: unknown): SavedView[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): SavedView[] => {
    if (!object(candidate) || typeof candidate.id !== 'string' || !candidate.id || typeof candidate.name !== 'string' || !object(candidate.state)) return [];
    const createdAt = typeof candidate.createdAt === 'number' && Number.isFinite(candidate.createdAt) ? candidate.createdAt : Date.now();
    const updatedAt = typeof candidate.updatedAt === 'number' && Number.isFinite(candidate.updatedAt) ? candidate.updatedAt : createdAt;
    const rawState = candidate.state as Partial<TabFlowState>;
    const selectedRepository = object(rawState.selectedRepository) && typeof rawState.selectedRepository.id === 'string' && typeof rawState.selectedRepository.nameWithOwner === 'string'
      ? { id: rawState.selectedRepository.id, nameWithOwner: rawState.selectedRepository.nameWithOwner }
      : undefined;
    const state = serializableState({ ...rawState, selectedRepository } as TabFlowState);
    const unavailableReason = rawState.scope === 'repository' && !selectedRepository ? 'The saved repository is unavailable. Choose a repository to recover this view.' : undefined;
    return [{ id:candidate.id,name:candidate.name.trim()||'Saved Flow',screen:'flow',state,pinned:candidate.pinned===true,createdAt,updatedAt,unavailableReason }];
  });
}

export const useSavedViewsStore = create<SavedViewsStore>()(persist((set,get)=>({
  views:[],
  save:(name,state)=>{const now=Date.now();const view:SavedView={id:id(),name:name.trim()||'Saved Flow',screen:'flow',state:serializableState(state),pinned:false,createdAt:now,updatedAt:now};set(current=>({views:[...current.views,view]}));return view;},
  rename:(viewId,name)=>set(current=>({views:current.views.map(view=>view.id===viewId?{...view,name:name.trim()||view.name,updatedAt:Date.now()}:view)})),
  duplicate:(viewId)=>{const source=get().views.find(view=>view.id===viewId);if(!source)return;const now=Date.now();const copy={...source,id:id(),name:`${source.name} copy`,pinned:false,createdAt:now,updatedAt:now};set(current=>({views:[...current.views,copy]}));return copy;},
  remove:(viewId)=>set(current=>({views:current.views.filter(view=>view.id!==viewId)})),
  setPinned:(viewId,pinned)=>set(current=>({views:current.views.map(view=>view.id===viewId?{...view,pinned,updatedAt:Date.now()}:view)})),
}),{
  name:'snow-devil-saved-views',version:2,partialize:state=>({views:state.views}),
  migrate:(persisted:unknown)=>object(persisted)?{...persisted,views:sanitizeSavedViews(persisted.views)}:{views:[]},
  merge:(persisted,current)=>object(persisted)?{...current,views:sanitizeSavedViews(persisted.views)}:current,
}));

export function openSavedView(view: SavedView) {
  const tabId=`native:saved-view:${view.id}`;
  void import('./flow-store').then(({useFlowStore})=>useFlowStore.getState().setTabState(tabId,{...view.state,isPlaying:false,selectedItemId:undefined,selectedFlowItem:undefined}));
  void import('./tabs-store').then(({useTabsStore})=>useTabsStore.getState().openNativeTab(tabId,'flow',view.name,false,true));
}
