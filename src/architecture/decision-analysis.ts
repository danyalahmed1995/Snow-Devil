import type { ArchitectureComponent, ArchitectureConfidenceLevel, ComponentDecisionAnalysis, DecisionReason, FixTier, ImpactTier, PullRequestArchitectureImpact, ValidationTarget } from './types';
import { incrementArchitectureDiagnostic } from './diagnostics';

/**
 * Deterministic decision support for the graph. Scores are deliberately bounded
 * and based only on the already-loaded PR impact and repository snapshot.
 * Impact: dependents (35), cross-subsystem reach (25), changed scope (25),
 * and component criticality (15). Fix: direct change evidence (40), mapping
 * confidence (20), low fan-out (20), and validation evidence (20).
 */
function confidence(score: number): ArchitectureConfidenceLevel { return score >= .78 ? 'high' : score >= .5 ? 'medium' : score > 0 ? 'low' : 'unknown'; }
function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }
function impactTier(score: number): ImpactTier { return score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 30 ? 'elevated' : score > 0 ? 'contained' : 'unknown'; }
function fixTier(score: number, directlyChanged: boolean, directDependents: number, cross: number): FixTier {
  if (!directlyChanged) return score >= 60 ? 'broad-risk' : 'not-relevant';
  if (score >= 72 && directDependents <= 1 && cross <= 1) return 'recommended';
  return score >= 45 ? 'plausible' : 'broad-risk';
}
function reason(code: string, label: string, weight: number, direction: DecisionReason['direction'], evidenceRefs: string[]): DecisionReason { return { code, label, weight, direction, evidenceRefs }; }

export function analyzeComponentDecisions(impact: PullRequestArchitectureImpact): ComponentDecisionAnalysis[] {
  if (import.meta.env.DEV) incrementArchitectureDiagnostic('scoringRuns');
  const components = impact.snapshot.components;
  const changed = new Map(impact.affectedComponents.map(item => [item.component.id, item]));
  const dependents = new Map<string, number>();
  const dependencies = new Map<string, number>();
  const crossSubsystem = new Map<string, number>();
  for (const edge of impact.snapshot.dependencies) {
    dependents.set(edge.toComponentId, (dependents.get(edge.toComponentId) ?? 0) + 1);
    dependencies.set(edge.fromComponentId, (dependencies.get(edge.fromComponentId) ?? 0) + 1);
    const from = components.find(item => item.id === edge.fromComponentId);
    const to = components.find(item => item.id === edge.toComponentId);
    if (from && to && (from.rootPaths[0]?.split('/')[0] !== to.rootPaths[0]?.split('/')[0])) {
      crossSubsystem.set(from.id, (crossSubsystem.get(from.id) ?? 0) + 1);
      crossSubsystem.set(to.id, (crossSubsystem.get(to.id) ?? 0) + 1);
    }
  }
  const decisions: ComponentDecisionAnalysis[] = components.map(component => {
    const item = changed.get(component.id);
    const directDependents = dependents.get(component.id) ?? 0;
    const fanOut = dependencies.get(component.id) ?? 0;
    const cross = crossSubsystem.get(component.id) ?? 0;
    const fileCount = item?.files.length ?? 0;
    const lineCount = (item?.additions ?? 0) + (item?.deletions ?? 0);
    const criticalKind = ['runtime', 'shared', 'infrastructure', 'library'].includes(component.kind) ? 15 : 0;
    const impactScore = clamp(Math.min(35, (directDependents + fanOut) * 7) + Math.min(25, cross * 8) + Math.min(25, fileCount * 5 + lineCount / 20) + criticalKind);
    const impactReasons: DecisionReason[] = [];
    if (directDependents + fanOut) impactReasons.push(reason('DIRECT_DEPENDENT_COUNT', `${directDependents + fanOut} direct relationship${directDependents + fanOut === 1 ? '' : 's'}`, Math.min(35, (directDependents + fanOut) * 7), 'positive', [`component:${component.id}`, 'snapshot:dependencies']));
    if (cross) impactReasons.push(reason('CROSS_SUBSYSTEM_REACH', `${cross} cross-subsystem relationship${cross === 1 ? '' : 's'}`, Math.min(25, cross * 8), 'positive', [`component:${component.id}`, 'snapshot:dependencies']));
    if (fileCount) impactReasons.push(reason('CHANGED_FILE_SCOPE', `${fileCount} changed file${fileCount === 1 ? '' : 's'} mapped here`, Math.min(25, fileCount * 5), 'positive', [`component:${component.id}`, ...((item?.files ?? []).map(file => `file:${file.path}`))]));
    if (criticalKind) impactReasons.push(reason('SHARED_COMPONENT_KIND', `${component.kind} components can affect broader runtime behavior`, criticalKind, 'positive', [`component:${component.id}`]));
    if (!impactReasons.length) impactReasons.push(reason('CONTEXT_ONLY', 'No direct impact evidence in the current patch', 0, 'neutral', [`component:${component.id}`]));
    const directEvidence = Boolean(item);
    const mapping = component.confidence.score;
    const validationTargets: ValidationTarget[] = directEvidence ? [{ label: `Validate ${component.name} changes`, componentId: component.id, evidenceRefs: [`component:${component.id}`, ...((item?.files ?? []).map(file => `file:${file.path}`))] }] : [];
    const contextEvidence = (impact.decisionContext?.ci?.componentIds?.includes(component.id) ? 25 : 0) + (impact.decisionContext?.issue?.componentIds?.includes(component.id) ? 20 : 0);
    const fixScore = clamp((directEvidence ? 40 : 0) + contextEvidence + mapping * 20 + Math.max(0, 20 - Math.min(20, (directDependents + fanOut) * 4)) + (validationTargets.length ? 20 : 0) - cross * 5 - (criticalKind ? 10 : 0));
    const fixReasons: DecisionReason[] = [];
    if (directEvidence) fixReasons.push(reason('DIRECT_PR_EVIDENCE', `${fileCount} changed file${fileCount === 1 ? '' : 's'} directly mapped to this component`, 40, 'positive', [`component:${component.id}`, ...((item?.files ?? []).map(file => `file:${file.path}`))]));
    if (directDependents + fanOut <= 1) fixReasons.push(reason('LOW_FAN_OUT', `${directDependents + fanOut} direct relationship${directDependents + fanOut === 1 ? '' : 's'}`, 20, 'positive', [`component:${component.id}`, 'snapshot:dependencies']));
    if (cross) fixReasons.push(reason('CROSS_SUBSYSTEM_IMPACT', 'Cross-subsystem edges require broader validation', cross * 5, 'negative', [`component:${component.id}`, 'snapshot:dependencies']));
    if (impact.decisionContext?.ci?.componentIds?.includes(component.id)) fixReasons.push(reason('CI_FAILURE_EVIDENCE', `Failing CI evidence is mapped to ${component.name}`, 25, 'positive', ['ci:workflow', 'ci:failed-step', `component:${component.id}`]));
    if (impact.decisionContext?.issue?.componentIds?.includes(component.id)) fixReasons.push(reason('ISSUE_EVIDENCE', `Issue evidence is mapped to ${component.name}`, 20, 'positive', ['issue:title', 'issue:file-reference', `component:${component.id}`]));
    if (impact.snapshot.status !== 'ready') fixReasons.push(reason('PARTIAL_SNAPSHOT', 'Repository snapshot is partial; recommendation confidence is limited', 15, 'negative', ['snapshot:status']));
    if (!directEvidence) fixReasons.push(reason('NO_DIRECT_CONTEXT', 'No direct PR evidence links this component to the current change', 0, 'neutral', [`component:${component.id}`]));
    return { componentId: component.id, impactScore, impactTier: impactTier(impactScore), impactConfidence: confidence(impact.confidence.score), impactReasons, fixScore, fixTier: fixTier(fixScore, directEvidence, directDependents + fanOut, cross), fixConfidence: confidence(Math.min(mapping, impact.confidence.score)), fixReasons, validationTargets, evidence: [...new Set([...impactReasons, ...fixReasons].flatMap(entry => entry.evidenceRefs))] };
  }).sort((a, b) => b.impactScore - a.impactScore || a.componentId.localeCompare(b.componentId));
  const candidates = [...decisions].sort((a, b) => b.fixScore - a.fixScore || a.componentId.localeCompare(b.componentId));
  for (const decision of decisions) {
    const alternatives = candidates.filter(candidate => candidate.componentId !== decision.componentId && (candidate.fixTier === 'recommended' || candidate.fixTier === 'plausible')).slice(0, 3);
    if (alternatives.length) decision.alternatives = alternatives.map((candidate, index) => ({ componentId: candidate.componentId, rank: index + 1, score: candidate.fixScore, confidence: candidate.fixConfidence, reason: candidate.fixScore < decision.fixScore ? 'Lower direct-evidence score than the primary candidate' : 'Comparable evidence with a broader validation tradeoff', riskTradeoff: candidate.impactTier === 'high' || candidate.impactTier === 'critical' ? 'Higher blast radius' : 'Requires validating an alternate component boundary', validationTarget: candidate.validationTargets[0] }));
  }
  return decisions;
}

export function decisionFor(impact: PullRequestArchitectureImpact, componentId: string) { return (impact.decisionAnalysis ?? analyzeComponentDecisions(impact)).find(item => item.componentId === componentId); }

export function decisionLabel(value: ImpactTier | FixTier) { return value === 'critical' ? 'Critical' : value === 'high' ? 'High impact' : value === 'elevated' ? 'Elevated' : value === 'contained' ? 'Contained impact' : value === 'recommended' ? 'Recommended candidate' : value === 'plausible' ? 'Plausible candidate' : value === 'broad-risk' ? 'Broad-risk component' : value === 'not-relevant' ? 'Not relevant' : 'Insufficient evidence'; }

export type { ArchitectureComponent };
