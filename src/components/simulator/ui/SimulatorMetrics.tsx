import type { SimulatorEntityState, SimulatorEvent } from "../../../simulator/simulator-types";
import { deriveSimulatorMetrics } from '../../../simulator/simulator-metrics';

export function SimulatorMetrics({ entities, events, partialSourceCount = 0 }: { entities: SimulatorEntityState[]; events: SimulatorEvent[]; partialSourceCount?: number }) {
  const values = deriveSimulatorMetrics(entities, events, partialSourceCount);
  const metrics = [
    ["Open issues", values.openIssues],
    ["Active PRs", values.activePullRequests],
    ["Merged PRs", values.mergedPullRequests],
    ["Time to merge", values.averageMerge],
    ["Failed checks", values.failedChecks],
    ["Checks passed", values.checksPassed],
    ["Review requested", values.reviewRequested],
    ["Changes requested", values.changesRequested],
    ["Releases", values.releases],
    ["Deployments", values.deployments],
    ["Events", values.events],
    ["Partial sources", values.partialSources],
  ];
  return <section className="simulator-panel simulator-metrics"><header className="simulator-panel__header"><h3>Metrics <span>(selected date)</span></h3></header><div className="simulator-metrics__grid">{metrics.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>;
}
