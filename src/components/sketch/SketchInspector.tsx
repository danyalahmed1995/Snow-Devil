import { Eraser, MousePointer2, Pencil, Redo2, RotateCcw, Trash2, Type, Undo2, X } from 'lucide-react';
import { useLayoutStore } from '../../stores/layout-store';
import { useSketchStore, type SketchTool } from '../../stores/sketch-store';
import './SketchInspector.css';

const TOOLS: { id: SketchTool; label: string; detail: string; icon: typeof MousePointer2 }[] = [
  { id: 'select', label: 'Select', detail: 'Move screenshots and labels', icon: MousePointer2 },
  { id: 'pencil', label: 'Pencil', detail: 'Draw a freehand line', icon: Pencil },
  { id: 'text', label: 'Text', detail: 'Place an editable label', icon: Type },
  { id: 'eraser', label: 'Eraser', detail: 'Click an item to remove it', icon: Eraser },
];
const COLORS = ['#f4f8ff', '#55d7ff', '#6ee7a8', '#ffd166', '#ff8b62', '#ff6685', '#bd91ff', '#152033'];

export function SketchInspector() {
  const setInspectorOpen = useLayoutStore((state) => state.setInspectorOpen);
  const tool = useSketchStore((state) => state.tool);
  const color = useSketchStore((state) => state.color);
  const size = useSketchStore((state) => state.size);
  const elements = useSketchStore((state) => state.elements);
  const selectedId = useSketchStore((state) => state.selectedId);
  const past = useSketchStore((state) => state.past);
  const future = useSketchStore((state) => state.future);
  const { setTool, setColor, setSize, remove, clear, undo, redo } = useSketchStore.getState();

  return <div className="inspector sketch-inspector">
    <header className="inspector-header">
      <h3 className="inspector-header-title">Sketch tools</h3>
      <button className="inspector-header-close" aria-label="Close Sketch tools" onClick={() => setInspectorOpen(false)}><X size={14}/></button>
    </header>
    <div className="sketch-inspector__tabs"><button className="is-active">Tools</button></div>
    <div className="inspector-content sketch-inspector__content">
      <section className="sketch-inspector__section">
        <div className="sketch-inspector__section-title"><strong>Tool</strong><span>{TOOLS.find((item) => item.id === tool)?.detail}</span></div>
        <div className="sketch-inspector__tool-grid" role="radiogroup" aria-label="Sketch tool">
          {TOOLS.map((item) => { const Icon = item.icon; return <button key={item.id} role="radio" aria-checked={tool === item.id} className={tool === item.id ? 'is-active' : ''} onClick={() => setTool(item.id)}><Icon size={17}/><span>{item.label}</span></button>; })}
        </div>
      </section>
      <section className="sketch-inspector__section">
        <div className="sketch-inspector__section-title"><strong>Color</strong><span>{color.toUpperCase()}</span></div>
        <div className="sketch-inspector__colors" role="radiogroup" aria-label="Drawing color">
          {COLORS.map((value) => <button key={value} role="radio" aria-label={value} aria-checked={color === value} className={color === value ? 'is-active' : ''} style={{ background: value }} onClick={() => setColor(value)}/>)}
          <label className="sketch-inspector__custom-color" title="Custom color"><input type="color" value={color} onChange={(event) => setColor(event.target.value)}/><span>+</span></label>
        </div>
      </section>
      <section className="sketch-inspector__section">
        <div className="sketch-inspector__section-title"><strong>Stroke size</strong><span>{size}px</span></div>
        <div className="sketch-inspector__size"><input type="range" min="2" max="18" step="1" value={size} onChange={(event) => setSize(Number(event.target.value))}/><i style={{ width: size, height: size, background: color }}/></div>
      </section>
      <section className="sketch-inspector__section">
        <div className="sketch-inspector__section-title"><strong>Board</strong><span>{elements.length} item{elements.length === 1 ? '' : 's'}</span></div>
        <div className="sketch-inspector__actions">
          <button disabled={!past.length} onClick={undo}><Undo2 size={14}/>Undo</button>
          <button disabled={!future.length} onClick={redo}><Redo2 size={14}/>Redo</button>
          <button disabled={!selectedId} onClick={() => selectedId && remove(selectedId)}><Trash2 size={14}/>Delete</button>
          <button className="is-danger" disabled={!elements.length} onClick={clear}><RotateCcw size={14}/>Clear board</button>
        </div>
      </section>
      <section className="sketch-inspector__tip"><strong>Clipboard only</strong><p>Copy any screenshot, return to this board, and press <kbd>Ctrl</kbd> + <kbd>V</kbd>. No upload step is needed.</p><p>Double-click a text label to edit it. Use <kbd>Delete</kbd> to remove the selected item.</p></section>
    </div>
  </div>;
}
