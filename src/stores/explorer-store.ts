import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PersistedExplorerState { expanded: string[]; selectedPath: string; search: string; scrollTop: number; imageMode: 'fit'|'actual'; zoom: number }
const initial = (): PersistedExplorerState => ({ expanded:[],selectedPath:'README.md',search:'',scrollTop:0,imageMode:'fit',zoom:1 });
interface ExplorerStore { states: Record<string,PersistedExplorerState>; update:(key:string,value:Partial<PersistedExplorerState>)=>void; clear:(key:string)=>void }

export const useExplorerStore=create<ExplorerStore>()(persist((set)=>({
  states:{},
  update:(key,value)=>set(state=>({states:{...state.states,[key]:{...initial(),...state.states[key],...value}}})),
  clear:key=>set(state=>{const states={...state.states};delete states[key];return{states};}),
}),{name:'snow-devil-explorer-state',version:1}));

export const explorerStateFor=(states:ExplorerStore['states'],key:string)=>states[key]??initial();
