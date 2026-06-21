import { useMemo, useState } from "react";
import { GitPullRequest, Search, Tag } from "lucide-react";
import type { SimulatorEntityState } from "../../../simulator/simulator-types";
import { formatEntityReference, formatEntityTitle, formatSubjectType, humanizeSimulatorValue } from "../../../simulator/simulator-presentation";

export function SimulatorEntityList({ entities, selectedId, onSelect }: { entities: SimulatorEntityState[]; selectedId?: string; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => entities.filter(entity => `${entity.title} ${entity.repositoryId} ${entity.number ?? ""}`.toLowerCase().includes(query.toLowerCase())), [entities, query]);

  return (
    <section className="simulator-panel simulator-entities">
      <header className="simulator-panel__header"><h3>Entities <span>({entities.length})</span></h3><label><Search size={12} /><input aria-label="Search entities" placeholder="Search entities..." value={query} onChange={event => setQuery(event.target.value)} /></label></header>
      <div className="simulator-panel__scroll">
        {filtered.length === 0 ? <div className="simulator-empty">No matching entities.</div> : filtered.map(entity => (
          <button type="button" key={entity.id} className={`simulator-entity-row${selectedId === entity.id ? " is-selected" : ""}`} onClick={() => onSelect(entity.id)} title={`${formatEntityReference(entity)} ${formatEntityTitle(entity)}`}>
            <span className={`simulator-entity-icon simulator-entity-icon--${entity.subjectType}`}>{entity.subjectType === "release" ? <Tag size={13} /> : entity.author?.avatarUrl ? <img src={entity.author.avatarUrl} alt="" /> : <GitPullRequest size={13} />}</span>
            <span className="simulator-entity-copy"><strong>{formatEntityReference(entity)} <span>{formatEntityTitle(entity)}</span></strong><small>{formatSubjectType(entity.subjectType)} · {entity.repositoryId}{entity.inclusionReason ? ` · ${humanizeSimulatorValue(entity.inclusionReason)}` : ""}</small></span>
            <span className={`simulator-entity-status simulator-entity-status--${entity.stage}`}>{humanizeSimulatorValue(entity.stage)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
