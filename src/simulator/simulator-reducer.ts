import { SimulatorEvent, SimulatorEntityState } from "./simulator-types";

const COMPLETENESS_RANK: Record<SimulatorEvent["sourceCompleteness"], number> = {
  unknown: 0,
  partial: 1,
  complete: 2,
};

export function reconstructState(
  events: SimulatorEvent[],
  cursor: string
): Map<string, SimulatorEntityState> {
  const state = new Map<string, SimulatorEntityState>();

  // Filter events up to cursor
  const appliedEvents = events.filter((e) => e.occurredAt <= cursor).sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());

  for (const event of appliedEvents) {
    let entity = state.get(event.subjectId);

    if (!entity) {
      entity = {
        id: event.subjectId,
        repositoryId: event.repositoryId,
        subjectType: event.subjectType,
        title: event.subjectTitle,
        number: event.subjectNumber,
        url: typeof event.metadata.url === 'string' ? event.metadata.url : undefined,
        stage: event.subjectType === "issue" ? "issues" : event.subjectType === "release" ? "released" : "coding",
        status: "open",
        assignees: [],
        reviewers: [],
        labels: [],
        commitCount: 0,
        commentCount: 0,
        reviewCommentCount: 0,
        reviewState: "none",
        checkState: "unknown",
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
        inclusionReason: (event as any).inclusionReason,
        sourceCompleteness: event.sourceCompleteness,
      } as SimulatorEntityState;
      
      // Attempt to extract author from the opening event
      if (event.eventType === "opened" && event.actor) {
        entity.author = { login: event.actor.login, avatarUrl: event.actor.avatarUrl };
      }
      
      state.set(event.subjectId, entity);
    }

    const ent = entity!;
    const eventIsStronger = COMPLETENESS_RANK[event.sourceCompleteness] > COMPLETENESS_RANK[ent.sourceCompleteness ?? "unknown"];
    if (!ent.title?.trim() || (event.subjectTitle?.trim() && eventIsStronger)) ent.title = event.subjectTitle;
    if (ent.number == null && event.subjectNumber != null) ent.number = event.subjectNumber;
    if (!ent.url && typeof event.metadata.url === 'string') ent.url = event.metadata.url;
    if (eventIsStronger) {
      ent.subjectType = event.subjectType;
      ent.repositoryId = event.repositoryId;
      ent.sourceCompleteness = event.sourceCompleteness;
    }
    if (!ent.inclusionReason && event.inclusionReason) ent.inclusionReason = event.inclusionReason;
    ent.updatedAt = event.occurredAt;
    ent.lastEventId = event.id;

    // Apply state changes based on eventType
    switch (event.eventType) {
      case "opened":
        if (!ent.author && event.actor) {
          ent.author = { login: event.actor.login, avatarUrl: event.actor.avatarUrl };
        }
        if (event.subjectType === "pull_request") {
          ent.stage = "pull_requests";
        }
        break;
      case "closed":
        if (ent.stage !== "merged" && ent.stage !== "released" && ent.stage !== "deployed") {
          ent.stage = "closed";
          ent.status = "closed";
        }
        break;
      case "reopened":
        ent.status = "open";
        if (event.subjectType === "issue") {
          ent.stage = "issues";
        } else {
          ent.stage = "pull_requests";
        }
        break;
      case "merged":
        ent.stage = "merged";
        ent.status = "merged";
        ent.mergedAt = event.occurredAt;
        break;
      case "review_requested":
        ent.reviewState = "requested";
        if (ent.stage === "pull_requests" || ent.stage === "coding") {
          ent.stage = "review";
        }
        break;
      case "approved":
        ent.reviewState = "approved";
        if (ent.stage === "review") {
          ent.stage = "ready";
        }
        break;
      case "changes_requested":
        ent.reviewState = "changes_requested";
        break;
      case "commented":
        ent.commentCount++;
        break;
      case "assigned":
        if (event.metadata?.assignee) {
           if (!ent.assignees.some(a => a.login === event.metadata.assignee)) {
              ent.assignees.push({ login: event.metadata.assignee as string });
           }
        }
        break;
      case "unassigned":
        if (event.metadata?.assignee) {
           ent.assignees = ent.assignees.filter(a => a.login !== event.metadata.assignee);
        }
        break;
      case "labeled":
        if (event.metadata?.label) {
           if (!ent.labels.some(l => l.name === event.metadata.label)) {
              ent.labels.push({ name: event.metadata.label as string, color: "gray" });
           }
        }
        break;
      case "unlabeled":
        if (event.metadata?.label) {
           ent.labels = ent.labels.filter(l => l.name !== event.metadata.label);
        }
        break;
      case "check_queued":
      case "check_started":
      case "workflow_queued":
      case "workflow_started":
         ent.checkState = "running";
         if (ent.stage === "review" || ent.stage === "ready") {
             if (ent.stage !== "ready") ent.stage = "checks";
         }
         break;
      case "check_succeeded":
      case "workflow_succeeded":
         ent.checkState = "success";
         if (ent.stage === "checks" && ent.reviewState === "approved") {
             ent.stage = "ready";
         }
         break;
      case "check_failed":
      case "workflow_failed":
         ent.checkState = "failure";
         break;
      case "released":
         ent.stage = "released";
         ent.releasedAt = event.occurredAt;
         break;
      case "deployment_succeeded":
         ent.stage = "deployed";
         ent.deployedAt = event.occurredAt;
         break;
    }
  }

  return state;
}
