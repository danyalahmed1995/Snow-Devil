import { Check, CircleAlert, GitCommitHorizontal, MessageSquare, Tag } from "lucide-react";
import type { SimulatorEntityState } from "../../../simulator/simulator-types";
import { formatEntityReference, formatEntityTitle, humanizeSimulatorValue } from "../../../simulator/simulator-presentation";

export function SimulatorCard({ entity, isSelected, onClick }: { entity: SimulatorEntityState; isSelected?: boolean; onClick?: () => void }) {
  return (
    <button type="button" className={`simulator-card${isSelected ? " is-selected" : ""}`} onClick={onClick} aria-pressed={isSelected}>
      <span className="simulator-card__edge" />
      <span className="simulator-card__topline">
        <span className="simulator-card__reference" title={formatEntityReference(entity)}>{formatEntityReference(entity)}</span>
        {entity.subjectType === "release" && <Tag size={11} />}
      </span>
      <span className="simulator-card__title" title={formatEntityTitle(entity)}>{formatEntityTitle(entity)}</span>
      <span className="simulator-card__repository" title={entity.repositoryId}>{entity.repositoryId}</span>
      <span className="simulator-card__date">{new Date(entity.updatedAt || entity.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
      {entity.baselineAtReplayStart && <span className="simulator-state simulator-state--review">{entity.baselineLabel ?? 'Existing at history start'}</span>}
      <span className="simulator-card__meta">
        {entity.author?.avatarUrl ? <img src={entity.author.avatarUrl} alt="" title={entity.author.login} /> : entity.author?.login ? <span className="simulator-avatar" title={entity.author.login}>{entity.author.login[0].toUpperCase()}</span> : null}
        {entity.commitCount > 0 && <span><GitCommitHorizontal size={12} />{entity.commitCount}</span>}
        {entity.commentCount > 0 && <span><MessageSquare size={11} />{entity.commentCount}</span>}
        {entity.checkState === "success" && <span className="simulator-state simulator-state--success"><Check size={10} /> Passed</span>}
        {entity.checkState === "failure" && <span className="simulator-state simulator-state--danger"><CircleAlert size={10} /> Failed</span>}
        {entity.reviewState !== "none" && <span className={`simulator-state simulator-state--${entity.reviewState === "approved" ? "success" : entity.reviewState === "changes_requested" ? "warning" : "review"}`}>{humanizeSimulatorValue(entity.reviewState)}</span>}
      </span>
    </button>
  );
}
