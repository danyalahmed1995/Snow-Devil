import type { SimulatorEntityState, SimulatorEvent } from "../../../simulator/simulator-types";

export function SimulatorMetrics({ entities, events }: { entities: SimulatorEntityState[]; events: SimulatorEvent[] }) {
  const prs = entities.filter(entity => entity.subjectType === "pull_request");
  const issues = entities.filter(entity => entity.subjectType === "issue");
  const merged = prs.filter(entity => entity.mergedAt);
  const mergeDurations = merged.filter(entity => entity.createdAt && entity.mergedAt).map(entity => new Date(entity.mergedAt!).getTime() - new Date(entity.createdAt).getTime());
  const avgMerge = mergeDurations.length ? `${(mergeDurations.reduce((sum, duration) => sum + duration, 0) / mergeDurations.length / 86400000).toFixed(1)}d` : "-";
  const metrics = [
    ["Open issues", issues.filter(entity => entity.status === "open").length],
    ["Active PRs", prs.filter(entity => entity.status === "open").length],
    ["Merged PRs", merged.length],
    ["Time to merge", avgMerge],
    ["Failed checks", prs.filter(entity => entity.checkState === "failure").length],
    ["Checks passed", prs.filter(entity => entity.checkState === "success").length],
    ["Review requested", prs.filter(entity => entity.reviewState === "requested").length],
    ["Changes requested", prs.filter(entity => entity.reviewState === "changes_requested").length],
    ["Releases", entities.filter(entity => entity.subjectType === "release").length],
    ["Deployments", entities.filter(entity => entity.stage === "deployed").length],
    ["Events", events.length],
    ["Partial sources", events.filter(event => event.sourceCompleteness === "partial").length],
  ];
  return <section className="simulator-panel simulator-metrics"><header className="simulator-panel__header"><h3>Metrics <span>(current cursor)</span></h3></header><div className="simulator-metrics__grid">{metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>;
}
