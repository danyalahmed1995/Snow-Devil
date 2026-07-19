import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './Tooltip.css';

const TOOLTIP_ID = 'snow-devil-contextual-tooltip';
const OPEN_DELAY_MS = 500;
const VIEWPORT_GAP = 8;
const TARGET_GAP = 8;
const MAX_CONTENT_LENGTH = 600;

interface TooltipState {
  target: HTMLElement;
  content: string;
}

function tooltipTarget(value: EventTarget | null): HTMLElement | null {
  return value instanceof Element ? value.closest<HTMLElement>('[data-tooltip]') : null;
}

function contentFor(target: HTMLElement): string | null {
  const content = target.dataset.tooltip?.trim().slice(0, MAX_CONTENT_LENGTH);
  return content || null;
}

export function calculateTooltipPosition(target: DOMRect, tooltip: { width: number; height: number }, viewport = { width: window.innerWidth, height: window.innerHeight }) {
  const roomBelow = viewport.height - target.bottom;
  const placeBelow = roomBelow >= tooltip.height + TARGET_GAP || target.top < tooltip.height + TARGET_GAP;
  const top = placeBelow ? target.bottom + TARGET_GAP : target.top - tooltip.height - TARGET_GAP;
  const centered = target.left + target.width / 2 - tooltip.width / 2;
  return {
    left: Math.max(VIEWPORT_GAP, Math.min(centered, viewport.width - tooltip.width - VIEWPORT_GAP)),
    top: Math.max(VIEWPORT_GAP, Math.min(top, viewport.height - tooltip.height - VIEWPORT_GAP)),
    placement: placeBelow ? 'bottom' : 'top',
  } as const;
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<TooltipState | null>(null);
  const [closing, setClosing] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0, placement: 'bottom' as 'top' | 'bottom' });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const closingTimerRef = useRef<number | undefined>(undefined);
  const describedTargetRef = useRef<{ target: HTMLElement; previous: string | null } | undefined>(undefined);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    timerRef.current = undefined;
  }, []);

  const close = useCallback(() => {
    clearTimer();
    setClosing(true);
    if (closingTimerRef.current !== undefined) window.clearTimeout(closingTimerRef.current);
    closingTimerRef.current = window.setTimeout(() => {
      setActive(null);
      setClosing(false);
    }, 110);
  }, [clearTimer]);

  const schedule = useCallback((target: HTMLElement) => {
    const content = contentFor(target);
    if (!content) return;
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      if (target.isConnected) {
        if (closingTimerRef.current !== undefined) window.clearTimeout(closingTimerRef.current);
        setClosing(false);
        setActive({ target, content });
      }
    }, OPEN_DELAY_MS);
  }, [clearTimer]);

  useEffect(() => {
    const pointerOver = (event: PointerEvent) => {
      const target = tooltipTarget(event.target);
      if (target && !target.contains(event.relatedTarget as Node | null)) schedule(target);
    };
    const pointerOut = (event: PointerEvent) => {
      const target = tooltipTarget(event.target);
      if (target && !target.contains(event.relatedTarget as Node | null)) close();
    };
    const focusIn = (event: FocusEvent) => {
      const target = tooltipTarget(event.target);
      if (target) schedule(target);
    };
    const focusOut = (event: FocusEvent) => {
      const target = tooltipTarget(event.target);
      if (target && !target.contains(event.relatedTarget as Node | null)) close();
    };
    const keyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('pointerover', pointerOver);
    document.addEventListener('pointerout', pointerOut);
    document.addEventListener('focusin', focusIn);
    document.addEventListener('focusout', focusOut);
    document.addEventListener('keydown', keyDown);
    return () => {
      document.removeEventListener('pointerover', pointerOver);
      document.removeEventListener('pointerout', pointerOut);
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', focusOut);
      document.removeEventListener('keydown', keyDown);
      clearTimer();
    };
  }, [clearTimer, close, schedule]);

  useEffect(() => {
    const previous = describedTargetRef.current;
    if (previous && previous.target !== active?.target) {
      if (previous.previous) previous.target.setAttribute('aria-describedby', previous.previous);
      else previous.target.removeAttribute('aria-describedby');
      describedTargetRef.current = undefined;
    }
    if (!active) return;
    const existing = active.target.getAttribute('aria-describedby');
    describedTargetRef.current = { target: active.target, previous: existing };
    active.target.setAttribute('aria-describedby', [existing, TOOLTIP_ID].filter(Boolean).join(' '));
    return () => {
      const described = describedTargetRef.current;
      if (described?.target !== active.target) return;
      if (described.previous) described.target.setAttribute('aria-describedby', described.previous);
      else described.target.removeAttribute('aria-describedby');
      describedTargetRef.current = undefined;
    };
  }, [active]);

  const reposition = useCallback(() => {
    if (!active?.target.isConnected || !tooltipRef.current) {
      if (active && !active.target.isConnected) close();
      return;
    }
    const rect = active.target.getBoundingClientRect();
    const tip = tooltipRef.current.getBoundingClientRect();
    setPosition(calculateTooltipPosition(rect, { width: tip.width, height: tip.height }));
  }, [active, close]);

  useLayoutEffect(() => {
    if (!active) return;
    const initialFrame = window.requestAnimationFrame(reposition);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reposition);
    observer?.observe(active.target);
    const mutation = new MutationObserver(() => { if (!active.target.isConnected) close(); });
    mutation.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', reposition);
    document.addEventListener('scroll', close, true);
    return () => {
      window.cancelAnimationFrame(initialFrame);
      observer?.disconnect();
      mutation.disconnect();
      window.removeEventListener('resize', reposition);
      document.removeEventListener('scroll', close, true);
    };
  }, [active, close, reposition]);

  return <>{children}{active && createPortal(<div ref={tooltipRef} id={TOOLTIP_ID} role="tooltip" data-placement={position.placement} className={`contextual-tooltip${closing ? ' is-closing' : ''}`} style={{ left: position.left, top: position.top }}>{active.content}</div>, document.body)}</>;
}
