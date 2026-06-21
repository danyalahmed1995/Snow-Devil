import { useMemo, useState } from "react";
import { Activity, Box, CheckCircle2, GitMerge, GitPullRequest, Rocket, Search, Tag } from "lucide-react";
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

export function SimulatorEventStream({ events, cursor, selectedEventId, onSelectEvent }: { events: SimulatorEvent[]; cursor: string; selectedEventId?: string; onSelectEvent: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const visible = useMemo(() => events.filter(event => event.occurredAt <= cursor && `${event.eventType} ${event.subjectTitle} ${event.actor?.login ?? ""}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)), [events, cursor, query]);
  return (
    <section className="simulator-panel simulator-events">
      <header className="simulator-panel__header"><h3>Event Stream</h3><label><Search size={12} /><input aria-label="Filter events" placeholder="Filter..." value={query} onChange={event => setQuery(event.target.value)} /></label><span className="simulator-live"><Activity size={10} /> Live</span></header>
      <div className="simulator-panel__scroll">
        {visible.length === 0 ? <div className="simulator-empty">No events before cursor.</div> : visible.slice(0, 100).map(event => (
          <button type="button" key={event.id} className={`simulator-event-row${selectedEventId === event.id ? " is-selected" : ""}`} onClick={() => onSelectEvent(event.id)} title={`${humanizeSimulatorValue(event.eventType)}: ${formatEventTitle(event)}`}>
            <span className={`simulator-event-icon simulator-event-icon--${event.eventType}`}><EventIcon type={event.eventType} /></span>
            <time>{new Date(event.occurredAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })}</time>
            <span className="simulator-event-copy"><strong>{humanizeSimulatorValue(event.eventType)}: {formatEventReference(event)}</strong><small>{formatEventTitle(event)} · by {event.actor?.login || "unknown"}{event.metadata?.nativeOrDerived === "derived" ? " · Derived" : ""}{event.inclusionReason ? ` · ${humanizeSimulatorValue(event.inclusionReason)}` : ""}</small></span>
            {event.sourceCompleteness === "partial" && <span className="simulator-partial">Partial</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
