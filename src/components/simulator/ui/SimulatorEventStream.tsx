import { useEffect, useMemo, useRef, useState } from "react";
import { Box, CheckCircle2, GitMerge, GitPullRequest, Rocket, Search, Tag } from "lucide-react";
import type { SimulatorEvent } from "../../../simulator/simulator-types";
import { formatEventReference, formatEventTitle, humanizeSimulatorValue } from "../../../simulator/simulator-presentation";

function EventIcon({ type }: { type: string }) {
  if (type.includes("deployment")) return <Rocket size={14} />;
  if (type.includes("release")) return <Tag size={14} />;
  if (type === "merged") return <GitMerge size={14} />;
  if (type.includes("check") || type.includes("workflow")) return <CheckCircle2 size={14} />;
  if (type === "committed") return <Box size={14} />;
  return <GitPullRequest size={14} />;
}

export function SimulatorEventStream({ events, cursor, selectedEventId, onSelectEvent, timeZone, initialScrollTop = 0, onScrollTop }: { events: SimulatorEvent[]; cursor: string; selectedEventId?: string; onSelectEvent: (id: string) => void; timeZone: string; initialScrollTop?: number; onScrollTop?: (value: number) => void }) {
  const [query, setQuery] = useState("");
  const [type, setType] = useState('all');
  const [limit, setLimit] = useState(100);
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = initialScrollTop; }, [initialScrollTop]);
  const group = (event: SimulatorEvent) => event.eventType.includes('review') || ['approved', 'changes_requested'].includes(event.eventType) ? 'reviews' : event.eventType === 'commented' ? 'comments' : event.eventType.includes('assign') ? 'assignments' : event.eventType.includes('check') || event.eventType.includes('workflow') ? 'checks' : event.subjectType === 'release' ? 'releases' : event.subjectType === 'deployment' ? 'deployments' : event.subjectType === 'pull_request' ? 'pull_requests' : event.subjectType === 'issue' ? 'issues' : 'other';
  const visible = useMemo(() => events.filter(event => event.occurredAt <= cursor && (type === 'all' || group(event) === type) && `${event.eventType} ${event.subjectTitle} ${event.repositoryId} ${event.actor?.login ?? ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), [events, cursor, query, type]);
  return (
    <section className="simulator-panel simulator-events">
      <header className="simulator-panel__header"><h3>Activity up to selected date <span>({visible.length} records)</span></h3><select aria-label="Filter activity type" value={type} onChange={event => { setType(event.target.value); setLimit(100); }}>{['all', 'pull_requests', 'issues', 'reviews', 'comments', 'assignments', 'checks', 'releases', 'deployments'].map(value => <option key={value} value={value}>{humanizeSimulatorValue(value)}</option>)}</select><label><Search size={12} /><input aria-label="Filter events" placeholder="Filter..." value={query} onChange={event => { setQuery(event.target.value); setLimit(100); }} /></label></header>
      <div ref={scrollRef} className="simulator-panel__scroll" onScroll={event => onScrollTop?.(event.currentTarget.scrollTop)}>
        {visible.length === 0 ? <div className="simulator-empty">No activity is supported on or before this date.</div> : visible.slice(0, limit).map(event => (
          <button type="button" key={event.id} className={`simulator-event-row${selectedEventId === event.id ? " is-selected" : ""}`} onClick={() => onSelectEvent(event.id)} title={`${humanizeSimulatorValue(event.eventType)}: ${formatEventTitle(event)}`}>
            <span className={`simulator-event-icon simulator-event-icon--${event.eventType}`}><EventIcon type={event.eventType} /></span>
            <time>{new Date(event.occurredAt).toLocaleDateString(undefined, { timeZone, month: 'short', day: 'numeric' })}</time>
            <span className="simulator-event-copy"><strong>{humanizeSimulatorValue(event.eventType)}: {formatEventReference(event)}</strong><small>{formatEventTitle(event)} · by {event.actor?.login || "unknown"}{event.metadata?.nativeOrDerived === "derived" ? " · Derived" : ""}{event.inclusionReason ? ` · ${humanizeSimulatorValue(event.inclusionReason)}` : ""}</small></span>
            {event.sourceCompleteness === "partial" && <span className="simulator-partial">Partial</span>}
          </button>
        ))}
        {limit < visible.length && <button type="button" className="simulator-list-more" onClick={() => setLimit(value => value + 100)}>Show {Math.min(100, visible.length - limit)} more events</button>}
      </div>
    </section>
  );
}
