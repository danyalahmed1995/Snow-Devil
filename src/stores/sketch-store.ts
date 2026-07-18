import { create } from 'zustand';
import { loadSketchBoard, saveSketchBoard } from './sketch-persistence';

export type SketchTool = 'select' | 'pencil' | 'text' | 'eraser';
export type SketchPoint = { x: number; y: number };
export type SketchElement =
  | { id: string; type: 'image'; src: string; x: number; y: number; width: number; height: number }
  | { id: string; type: 'text'; text: string; x: number; y: number; color: string; fontSize: number }
  | { id: string; type: 'stroke'; points: SketchPoint[]; color: string; size: number };

type SketchState = {
  tool: SketchTool;
  color: string;
  size: number;
  selectedId?: string;
  elements: SketchElement[];
  past: SketchElement[][];
  future: SketchElement[][];
  hydrated: boolean;
  setTool: (tool: SketchTool) => void;
  setColor: (color: string) => void;
  setSize: (size: number) => void;
  select: (id?: string) => void;
  add: (element: SketchElement) => void;
  update: (id: string, patch: Partial<SketchElement>) => void;
  commitTransform: (before: SketchElement[]) => void;
  remove: (id: string) => void;
  clear: () => void;
  undo: () => void;
  redo: () => void;
};

const checkpoint = (state: SketchState) => ({ past: [...state.past.slice(-29), state.elements], future: [] as SketchElement[][] });

export const useSketchStore = create<SketchState>((set) => ({
  tool: 'select',
  color: '#55d7ff',
  size: 4,
  elements: [],
  past: [],
  future: [],
  hydrated: false,
  setTool: (tool) => set({ tool, selectedId: undefined }),
  setColor: (color) => set((state) => {
    const selected = state.elements.find((item) => item.id === state.selectedId);
    return selected?.type === 'text' && selected.color !== color
      ? { color, elements: state.elements.map((item) => item.id === selected.id ? { ...selected, color } : item) }
      : { color };
  }),
  setSize: (size) => set({ size }),
  select: (selectedId) => set((state) => {
    const selected = state.elements.find((item) => item.id === selectedId);
    return { selectedId, ...(selected?.type === 'text' ? { color: selected.color } : {}) };
  }),
  add: (element) => set((state) => ({ ...checkpoint(state), elements: [...state.elements, element], selectedId: element.id })),
  update: (id, patch) => set((state) => ({ elements: state.elements.map((item) => item.id === id ? { ...item, ...patch } as SketchElement : item) })),
  commitTransform: (before) => set((state) => before === state.elements ? state : ({ past: [...state.past.slice(-29), before], future: [] })),
  remove: (id) => set((state) => ({ ...checkpoint(state), elements: state.elements.filter((item) => item.id !== id), selectedId: state.selectedId === id ? undefined : state.selectedId })),
  clear: () => set((state) => state.elements.length ? ({ ...checkpoint(state), elements: [], selectedId: undefined }) : state),
  undo: () => set((state) => state.past.length ? ({ elements: state.past[state.past.length - 1], past: state.past.slice(0, -1), future: [state.elements, ...state.future].slice(0, 30), selectedId: undefined }) : state),
  redo: () => set((state) => state.future.length ? ({ elements: state.future[0], past: [...state.past, state.elements].slice(-30), future: state.future.slice(1), selectedId: undefined }) : state),
}));

let saveTimer: number | undefined;
let latestElements: SketchElement[] = [];
const flushBoard = () => {
  if (saveTimer !== undefined) window.clearTimeout(saveTimer);
  saveTimer = undefined;
  void saveSketchBoard(latestElements).catch(() => undefined);
};

if (typeof window !== 'undefined') {
  void loadSketchBoard().then((elements) => useSketchStore.setState({ elements, hydrated: true })).catch(() => useSketchStore.setState({ hydrated: true }));
  useSketchStore.subscribe((state, previous) => {
    if (!state.hydrated || state.elements === previous.elements) return;
    latestElements = state.elements;
    if (saveTimer !== undefined) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(flushBoard, 180);
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && useSketchStore.getState().hydrated) flushBoard(); });
}

export const sketchId = () => `sketch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
