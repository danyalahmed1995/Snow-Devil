$c = Get-Content -Path src\hooks\useAnalyticsData.ts -Raw
$c = $c -replace "import \{ useAuthStore \} from '../stores/auth-store';", "import { useAuthStore } from '../stores/auth-store';
import { getCanonicalWorkflowRunId, getWorkflowRunTimestamp, normalizeRepositoryName } from '../analytics/identity';"

$c = $c -replace "    if \(row\.source_type === 'workflow_run'\) \{[\s\S]*?      \}\n    \}\];\n  \}", "    if (row.source_type === 'workflow_run') {
      const startMs = Date.parse(typeof data.run_started_at === 'string' ? data.run_started_at : String(data.created_at ?? row.updated_at));
      const endMs = Date.parse(typeof data.updated_at === 'string' ? data.updated_at : row.updated_at);
      const durationMs = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs ? endMs - startMs : undefined;
      const author = data.actor ?? data.triggering_actor;
      const commit = data.head_commit as Record<string, unknown> | undefined;
      const pullRequests = Array.isArray(data.pull_requests) ? data.pull_requests : [];
      const repoNumericId = (data.repository as any)?.id;
      const canonicalId = getCanonicalWorkflowRunId(repoNumericId, row.repository_id, data.id as string | number ?? row.source_id);
      return [{
        ...common,
        id: \workflow_run:\\\`,
        subjectType: 'workflow_run',
        subjectTitle: String(data.name ?? data.display_title ?? 'Workflow run'),
        eventType: data.status !== 'completed' ? 'workflow_started' : data.conclusion === 'success' ? 'workflow_succeeded' : data.conclusion === 'cancelled' ? 'workflow_cancelled' : 'workflow_failed',
        occurredAt: getWorkflowRunTimestamp(data),
        actor: author && typeof author === 'object' ? author as SimulatorEvent['actor'] : common.actor,
        metadata: {
          repositoryNumericId: repoNumericId,
          checkState: data.conclusion ?? data.status,
          status: data.status,
          conclusion: data.conclusion,
          headBranch: data.head_branch,
          headSha: data.head_sha,
          commitMessage: typeof commit?.message === 'string' ? commit.message : undefined,
          workflowId: data.workflow_id == null ? undefined : String(data.workflow_id),
          workflowPath: data.path,
          runId: String(data.id ?? row.source_id),
          runNumber: data.run_number,
          runAttempt: data.run_attempt,
          event: data.event,
          htmlUrl: data.html_url,
          startedAt: data.run_started_at,
          completedAt: data.status === 'completed' ? data.updated_at : undefined,
          durationMs,
          pullRequestNumber: pullRequests.length > 0 && pullRequests[0] && typeof (pullRequests[0] as any).number === 'number' ? (pullRequests[0] as any).number : undefined,
        }
      }];
    }"

$c = $c -replace "      const eventMap = new Map\(\[\.\.\.rows\.map\(normalizeEvent\)\.filter\(\(event\): event is SimulatorEvent => event !== null\), \.\.\.syncedEvents\]\.map\(event => \[event\.id, event\]\)\);", "      const eventMap = new Map<string, SimulatorEvent>();
      const allEvents = [...rows.map(normalizeEvent).filter((event): event is SimulatorEvent => event !== null), ...syncedEvents];
      
      for (const event of allEvents) {
        let key = event.id;
        if (event.subjectType === 'workflow_run' && !key.startsWith('workflow_run:')) {
            const runId = (event.metadata as any)?.runId;
            if (runId) {
                const numericId = (event.metadata as any)?.repositoryNumericId;
                key = \workflow_run:\\\;
                event.id = key;
            }
        }
        
        if (eventMap.has(key)) {
            const existing = eventMap.get(key)!;
            if (new Date(event.occurredAt).getTime() >= new Date(existing.occurredAt).getTime()) {
                eventMap.set(key, { ...existing, ...event, metadata: { ...existing.metadata, ...event.metadata } });
            } else {
                eventMap.set(key, { ...event, ...existing, metadata: { ...event.metadata, ...existing.metadata } });
            }
        } else {
            eventMap.set(key, event);
        }
      }"

Set-Content -Path src\hooks\useAnalyticsData.ts -Value $c
