import { invoke } from '@tauri-apps/api/core';
import { Check, Scissors, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import './ScreenshotRuntime.css';

interface Point { x: number; y: number }
interface Selection { x: number; y: number; width: number; height: number }
type Toast = { kind: 'success' | 'error'; title: string; body: string };
export const SCREENSHOT_HOLD_DELAY_MS = 350;

export function selectionFromPoints(start: Point, end: Point): Selection {
  return {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

const afterPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

export function ScreenshotRuntime() {
  const start = useRef<Point | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    let toastTimer: number | undefined;
    let holdTimer: number | undefined;
    let contextTimer: number | undefined;
    let capturing = false;
    let gestureActive = false;
    let pressStart: Point | null = null;
    let latestPoint: Point | null = null;
    let suppressNextContextMenu = false;

    const clearHold = () => {
      if (holdTimer !== undefined) window.clearTimeout(holdTimer);
      holdTimer = undefined;
    };
    const resetGesture = () => {
      clearHold();
      gestureActive = false;
      pressStart = null;
      latestPoint = null;
      start.current = null;
      setSelection(null);
    };

    const dismissLater = () => {
      if (toastTimer !== undefined) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => setToast(null), 3800);
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 2 || capturing) return;
      resetGesture();
      pressStart = { x: event.clientX, y: event.clientY };
      latestPoint = pressStart;
      holdTimer = window.setTimeout(() => {
        if (!pressStart || !latestPoint) return;
        gestureActive = true;
        start.current = pressStart;
        setSelection(selectionFromPoints(pressStart, latestPoint));
      }, SCREENSHOT_HOLD_DELAY_MS);
    };
    const move = (event: PointerEvent) => {
      if (!pressStart || (event.buttons & 2) === 0) return;
      latestPoint = { x: event.clientX, y: event.clientY };
      if (!gestureActive || !start.current) return;
      event.preventDefault();
      setSelection(selectionFromPoints(start.current, latestPoint));
    };
    const finish = async (event: PointerEvent) => {
      if (event.button !== 2 || !pressStart || capturing) return;
      clearHold();
      if (!gestureActive || !start.current) {
        resetGesture();
        return;
      }
      event.preventDefault();
      const area = selectionFromPoints(start.current, { x: event.clientX, y: event.clientY });
      suppressNextContextMenu = true;
      if (contextTimer !== undefined) window.clearTimeout(contextTimer);
      contextTimer = window.setTimeout(() => { suppressNextContextMenu = false; }, 250);
      resetGesture();
      if (area.width < 4 || area.height < 4) return;

      capturing = true;
      try {
        // Let React remove the selection overlay before the native screen pixels are sampled.
        await afterPaint();
        const result = await invoke<{ width: number; height: number }>('capture_region_to_clipboard', { ...area });
        setToast({ kind: 'success', title: 'Section copied to clipboard', body: `${result.width} × ${result.height} pixels` });
      } catch (cause) {
        console.error('Failed to capture selected area:', cause);
        setToast({ kind: 'error', title: 'Could not copy section', body: 'Screen capture is unavailable right now.' });
      } finally {
        capturing = false;
        dismissLater();
      }
    };
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !pressStart) return;
      event.preventDefault();
      resetGesture();
    };
    const cancelLostPointer = () => {
      if (!pressStart) return;
      resetGesture();
    };
    const contextMenu = (event: MouseEvent) => {
      if (!gestureActive && !suppressNextContextMenu) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressNextContextMenu = false;
    };

    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', cancelLostPointer, true);
    window.addEventListener('blur', cancelLostPointer);
    window.addEventListener('keydown', cancel, true);
    window.addEventListener('contextmenu', contextMenu, true);
    return () => {
      if (toastTimer !== undefined) window.clearTimeout(toastTimer);
      clearHold();
      if (contextTimer !== undefined) window.clearTimeout(contextTimer);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', cancelLostPointer, true);
      window.removeEventListener('blur', cancelLostPointer);
      window.removeEventListener('keydown', cancel, true);
      window.removeEventListener('contextmenu', contextMenu, true);
    };
  }, []);

  return <>
    {selection && <div className="screenshot-selection-layer" aria-hidden="true">
      <div className="screenshot-selection" style={{ left: selection.x, top: selection.y, width: selection.width, height: selection.height }}>
        {selection.width >= 72 && selection.height >= 28 && <span>{Math.round(selection.width)} × {Math.round(selection.height)}</span>}
      </div>
    </div>}
    {toast && <aside className={`notification-arrival-toast screenshot-toast screenshot-toast--${toast.kind}`} role="status" aria-live="polite">
      <div className="notification-arrival-main">{toast.kind === 'success' ? <Check size={15}/> : <Scissors size={15}/>}<span><strong>{toast.title}</strong><small>{toast.body}</small></span></div>
      <button aria-label="Dismiss screenshot alert" onClick={() => setToast(null)}><X size={13}/></button>
    </aside>}
  </>;
}
