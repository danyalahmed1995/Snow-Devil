import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { ClipboardPaste, Image as ImageIcon } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { sketchId, useSketchStore, type SketchElement, type SketchPoint } from '../../stores/sketch-store';
import './SketchBoard.css';

const BOARD_WIDTH = 1800;
const BOARD_HEIGHT = 1200;
type ImageElement = Extract<SketchElement, { type: 'image' }>;
type TextElement = Extract<SketchElement, { type: 'text' }>;
type StrokeElement = Extract<SketchElement, { type: 'stroke' }>;
type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

function boardPoint(event: Pick<PointerEvent, 'clientX' | 'clientY'> | ReactPointerEvent, stage: HTMLElement): SketchPoint {
  const rect = stage.getBoundingClientRect();
  return { x: Math.max(0, Math.min(BOARD_WIDTH, event.clientX - rect.left)), y: Math.max(0, Math.min(BOARD_HEIGHT, event.clientY - rect.top)) };
}

function imageFromFile(file: File): Promise<{ src: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        const scale = Math.min(1, 620 / image.naturalWidth, 460 / image.naturalHeight);
        resolve({ src: String(reader.result), width: Math.round(image.naturalWidth * scale), height: Math.round(image.naturalHeight * scale) });
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

const strokePoints = (points: SketchPoint[]) => points.map((point) => `${point.x},${point.y}`).join(' ');

const InkLayer = memo(function InkLayer({ tool, onRemove, onSelect, draftRef }: { tool: string; onRemove: (id: string) => void; onSelect: (id: string) => void; draftRef: RefObject<SVGPolylineElement | null> }) {
  const strokes = useSketchStore(useShallow((state) => state.elements.filter((element): element is StrokeElement => element.type === 'stroke')));
  return <svg className="sketch-board__ink" width={BOARD_WIDTH} height={BOARD_HEIGHT} aria-hidden="true">
    {strokes.map((stroke) => <polyline key={stroke.id} points={strokePoints(stroke.points)} fill="none" stroke={stroke.color} strokeWidth={stroke.size} strokeLinecap="round" strokeLinejoin="round" className={tool === 'eraser' ? 'is-erasable' : ''} onPointerDown={(event) => { if (tool === 'eraser') { event.stopPropagation(); onRemove(stroke.id); } else if (tool === 'select') onSelect(stroke.id); }}/>) }
    <polyline ref={draftRef} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
});

const SketchImageItem = memo(function SketchImageItem({ element, selected, tool, onPointerDown, onResize }: { element: ImageElement; selected: boolean; tool: string; onPointerDown: (event: ReactPointerEvent, element: SketchElement) => void; onResize: (event: ReactPointerEvent, element: ImageElement, corner: ResizeCorner) => void }) {
  return <div className={`sketch-board__image${selected ? ' is-selected' : ''}`} style={{ left: element.x, top: element.y, width: element.width, height: element.height }} onPointerDown={(event) => onPointerDown(event, element)}>
    <img src={element.src} alt="Pasted screenshot" draggable={false}/>
    {selected && <><span className="sketch-board__selection-label">Screenshot</span>{tool === 'select' && (['nw', 'ne', 'sw', 'se'] as ResizeCorner[]).map((corner) => <button key={corner} type="button" aria-label={`Resize screenshot from ${corner.toUpperCase()} corner`} className={`sketch-board__resize-handle sketch-board__resize-handle--${corner}`} onPointerDown={(event) => onResize(event, element, corner)}/>)}</>}
  </div>;
});

const SketchTextItem = memo(function SketchTextItem({ element, selected, tool, onPointerDown, onSelect, onUpdate }: { element: TextElement; selected: boolean; tool: string; onPointerDown: (event: ReactPointerEvent, element: SketchElement) => void; onSelect: (id: string) => void; onUpdate: (id: string, patch: Partial<SketchElement>) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (node && document.activeElement !== node && node.textContent !== element.text) node.textContent = element.text;
  }, [element.text]);
  return <div ref={ref} data-sketch-text={element.id} data-placeholder="Type something" className={`sketch-board__text${selected ? ' is-selected' : ''}`} style={{ left: element.x, top: element.y, color: element.color, fontSize: element.fontSize }} contentEditable={tool === 'text' || selected} suppressContentEditableWarning spellCheck onPointerDown={(event) => onPointerDown(event, element)} onDoubleClick={(event) => { onSelect(element.id); event.currentTarget.focus(); }} onBlur={(event) => onUpdate(element.id, { text: event.currentTarget.textContent || '' })}/>;
});

export function SketchBoard() {
  const stageRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const elements = useSketchStore((state) => state.elements);
  const tool = useSketchStore((state) => state.tool);
  const color = useSketchStore((state) => state.color);
  const size = useSketchStore((state) => state.size);
  const selectedId = useSketchStore((state) => state.selectedId);
  const hydrated = useSketchStore((state) => state.hydrated);
  const { add, update, commitTransform, remove, select, undo, redo } = useSketchStore.getState();
  const [pasteNotice, setPasteNotice] = useState('');
  const drawingRef = useRef<SketchPoint[] | undefined>(undefined);
  const draftLineRef = useRef<SVGPolylineElement>(null);
  const draftFrameRef = useRef<number | undefined>(undefined);
  const pasteOffset = useRef(0);

  useEffect(() => {
    const onPaste = async (event: ClipboardEvent) => {
      const images = [...(event.clipboardData?.items ?? [])].filter((item) => item.kind === 'file' && item.type.startsWith('image/')).map((item) => item.getAsFile()).filter((file): file is File => Boolean(file));
      if (!images.length) { setPasteNotice('Clipboard does not contain an image'); return; }
      event.preventDefault();
      for (const file of images) {
        try {
          const image = await imageFromFile(file);
          const viewport = viewportRef.current;
          const offset = pasteOffset.current++ % 8 * 22;
          add({ id: sketchId(), type: 'image', ...image, x: Math.max(36, (viewport?.scrollLeft ?? 0) + 90 + offset), y: Math.max(36, (viewport?.scrollTop ?? 0) + 70 + offset) });
          setPasteNotice(images.length > 1 ? `${images.length} screenshots pasted` : 'Screenshot pasted');
        } catch { setPasteNotice('Could not read that clipboard image'); }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [add]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const editing = (event.target as HTMLElement | null)?.isContentEditable;
      if (!editing && (event.key === 'Delete' || event.key === 'Backspace') && useSketchStore.getState().selectedId) { event.preventDefault(); remove(useSketchStore.getState().selectedId!); }
      if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [redo, remove, undo]);

  const startDrag = useCallback((event: ReactPointerEvent, element: SketchElement) => {
    if (tool === 'eraser') { event.stopPropagation(); remove(element.id); return; }
    if (tool === 'text' && element.type === 'text') { event.stopPropagation(); select(element.id); return; }
    if (tool !== 'select' || element.type === 'stroke') return;
    event.stopPropagation();
    event.preventDefault();
    select(element.id);
    const before = useSketchStore.getState().elements;
    const origin = boardPoint(event, stageRef.current!);
    const start = { x: element.x, y: element.y };
    let pending: { x: number; y: number } | undefined;
    let frame: number | undefined;
    let moved = false;
    const flush = () => { frame = undefined; if (pending) update(element.id, pending); };
    const move = (moveEvent: PointerEvent) => {
      const point = boardPoint(moveEvent, stageRef.current!);
      const width = element.type === 'image' ? element.width : 0;
      const height = element.type === 'image' ? element.height : 0;
      pending = { x: Math.max(0, Math.min(BOARD_WIDTH - width, start.x + point.x - origin.x)), y: Math.max(0, Math.min(BOARD_HEIGHT - height, start.y + point.y - origin.y)) };
      moved = true;
      if (frame === undefined) frame = requestAnimationFrame(flush);
    };
    const up = () => { if (frame !== undefined) cancelAnimationFrame(frame); flush(); if (moved) commitTransform(before); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', up, { once: true });
  }, [commitTransform, remove, select, tool, update]);

  const startResize = useCallback((event: ReactPointerEvent, element: ImageElement, corner: ResizeCorner) => {
    event.stopPropagation();
    event.preventDefault();
    const before = useSketchStore.getState().elements;
    const origin = boardPoint(event, stageRef.current!);
    const start = { x: element.x, y: element.y, width: element.width, height: element.height };
    const aspect = start.width / start.height;
    const east = corner.endsWith('e');
    const south = corner.startsWith('s');
    const maxWidthX = east ? BOARD_WIDTH - start.x : start.x + start.width;
    const maxHeight = south ? BOARD_HEIGHT - start.y : start.y + start.height;
    const maxWidth = Math.min(maxWidthX, maxHeight * aspect);
    let pending: Partial<SketchElement> | undefined;
    let frame: number | undefined;
    let moved = false;
    const flush = () => { frame = undefined; if (pending) update(element.id, pending); };
    const move = (moveEvent: PointerEvent) => {
      const point = boardPoint(moveEvent, stageRef.current!);
      const dx = point.x - origin.x;
      const dy = point.y - origin.y;
      const directionX = east ? 1 : -1;
      const directionY = south ? 1 : -1;
      const deltaWidth = (directionX * dx + directionY * dy / aspect) / (1 + 1 / (aspect * aspect));
      const width = Math.max(80, Math.min(maxWidth, start.width + deltaWidth));
      const height = width / aspect;
      pending = { width, height, x: east ? start.x : start.x + start.width - width, y: south ? start.y : start.y + start.height - height };
      moved = true;
      if (frame === undefined) frame = requestAnimationFrame(flush);
    };
    const up = () => { if (frame !== undefined) cancelAnimationFrame(frame); flush(); if (moved) commitTransform(before); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
    window.addEventListener('pointercancel', up, { once: true });
  }, [commitTransform, update]);

  const stagePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const point = boardPoint(event, event.currentTarget);
    if (tool === 'select') { select(); return; }
    if (tool === 'text') {
      const id = sketchId();
      add({ id, type: 'text', text: '', x: point.x, y: point.y, color, fontSize: Math.max(16, size * 4) });
      requestAnimationFrame(() => (document.querySelector(`[data-sketch-text="${id}"]`) as HTMLElement | null)?.focus());
      return;
    }
    if (tool === 'pencil') {
      event.currentTarget.setPointerCapture(event.pointerId);
      drawingRef.current = [point];
      if (draftLineRef.current) { draftLineRef.current.setAttribute('stroke', color); draftLineRef.current.setAttribute('stroke-width', String(size)); draftLineRef.current.setAttribute('points', `${point.x},${point.y}`); }
    }
  };

  const stagePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current || tool !== 'pencil') return;
    const point = boardPoint(event, event.currentTarget);
    const previous = drawingRef.current[drawingRef.current.length - 1];
    if (Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y) < 1.5) return;
    drawingRef.current.push(point);
    if (draftFrameRef.current === undefined) draftFrameRef.current = requestAnimationFrame(() => { draftFrameRef.current = undefined; draftLineRef.current?.setAttribute('points', strokePoints(drawingRef.current ?? [])); });
  };

  const finishStroke = () => {
    const points = drawingRef.current;
    drawingRef.current = undefined;
    if (draftFrameRef.current !== undefined) cancelAnimationFrame(draftFrameRef.current);
    draftFrameRef.current = undefined;
    draftLineRef.current?.setAttribute('points', '');
    if (points && points.length > 1) add({ id: sketchId(), type: 'stroke', points, color, size });
  };

  const visualElements = useMemo(() => elements.filter((element): element is ImageElement | TextElement => element.type !== 'stroke'), [elements]);

  return <section className={`sketch-board sketch-board--${tool}`} aria-label="Sketch Board">
    <header className="sketch-board__header">
      <div><h1>Sketch Board</h1><p>Paste screenshots, mark them up, and arrange quick visual notes.</p></div>
      <div className={`sketch-board__paste-status${pasteNotice ? ' has-message' : ''}`}><ClipboardPaste size={15}/><span>{pasteNotice || 'Press Ctrl+V to paste a screenshot'}</span></div>
    </header>
    {!hydrated && <div className="sketch-board__empty" aria-live="polite"><strong>Restoring board…</strong></div>}
    {hydrated && !elements.length && <div className="sketch-board__empty" aria-hidden="true"><span><ImageIcon size={27}/></span><strong>Paste your first screenshot</strong><small>Copy an image to your clipboard, then press Ctrl+V</small></div>}
    <div className="sketch-board__viewport" ref={viewportRef}>
      <div className="sketch-board__stage sketch-board__paper-grid" ref={stageRef} onPointerDown={stagePointerDown} onPointerMove={stagePointerMove} onPointerUp={finishStroke} onPointerCancel={finishStroke}>
        <InkLayer tool={tool} onRemove={remove} onSelect={select} draftRef={draftLineRef}/>
        {visualElements.map((element) => element.type === 'image'
          ? <SketchImageItem key={element.id} element={element} selected={selectedId === element.id} tool={tool} onPointerDown={startDrag} onResize={startResize}/>
          : <SketchTextItem key={element.id} element={element} selected={selectedId === element.id} tool={tool} onPointerDown={startDrag} onSelect={select} onUpdate={update}/>) }
      </div>
    </div>
  </section>;
}
