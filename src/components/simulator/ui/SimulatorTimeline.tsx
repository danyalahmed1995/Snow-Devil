import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export function clampTooltipPosition(cursorX: number, tooltipWidth: number, trackWidth: number, inset = 4): number {
  if (!Number.isFinite(cursorX) || !Number.isFinite(tooltipWidth) || !Number.isFinite(trackWidth)) return inset;
  const maxLeft = Math.max(inset, trackWidth - tooltipWidth - inset);
  return Math.max(inset, Math.min(maxLeft, cursorX - tooltipWidth / 2));
}

export function SimulatorTimeline({ since, until, cursor, onCursorChange, isPlaying }: { since: string; until: string; cursor: string; onCursorChange: (cursor: string) => void; isPlaying: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState(false);
  const [tooltipLeft, setTooltipLeft] = useState(4);
  const start = new Date(since).getTime();
  const end = new Date(until).getTime();
  const duration = Math.max(1, end - start);
  const percent = Math.max(0, Math.min(100, ((new Date(cursor).getTime() - start) / duration) * 100));
  const labels = Array.from({ length: 7 }, (_, index) => new Date(start + duration * index / 6));
  const label = `${new Date(cursor).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${new Date(cursor).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  const measureTooltip = useCallback(() => {
    const track = trackRef.current;
    const tooltip = tooltipRef.current;
    if (!track || !tooltip) return;
    setTooltipLeft(clampTooltipPosition(track.clientWidth * percent / 100, tooltip.offsetWidth, track.clientWidth));
  }, [percent]);
  useLayoutEffect(measureTooltip, [measureTooltip, label]);
  useEffect(() => {
    const track = trackRef.current;
    const tooltip = tooltipRef.current;
    if (!track || !tooltip || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measureTooltip);
    observer.observe(track);
    observer.observe(tooltip);
    return () => observer.disconnect();
  }, [measureTooltip]);
  const update = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    onCursorChange(new Date(start + duration * ratio).toISOString());
  };
  return <div className="simulator-timeline" onPointerMove={event => dragging && update(event)} onPointerUp={event => { setDragging(false); event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => setDragging(false)}>
    <div ref={trackRef} className="simulator-timeline__track" onPointerDown={event => { setDragging(true); update(event); event.currentTarget.setPointerCapture(event.pointerId); }}>
      <span className="simulator-timeline__progress" style={{ width: `${percent}%` }} />
      {labels.map((_, index) => <i key={index} style={{ left: `${index / 6 * 100}%` }} />)}
      <span className="simulator-timeline__cursor" style={{ left: `${percent}%`, transition: isPlaying || dragging ? "none" : undefined }} />
      <b ref={tooltipRef} className="simulator-timeline__tooltip" style={{ left: tooltipLeft }}>{label}</b>
    </div>
    <div className="simulator-timeline__labels">{labels.map((label, index) => <span key={index}>{label.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>)}</div>
  </div>;
}
