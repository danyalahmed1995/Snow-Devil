$c = Get-Content -Path src\hooks\useAnalyticsData.ts -Raw

$c = $c -replace '      const eventMap = new Map<string, SimulatorEvent>\(\);\s*const allEvents = \[\.\.\.rows\.map\(normalizeEvent\)\.filter\(\(event\): event is SimulatorEvent => event !== null\), \.\.\.syncedEvents\];[\s\S]*?      \}', "      const eventMap = new Map<string, SimulatorEvent>();
      const allEvents = [...rows.map(normalizeEvent).filter((event): event is SimulatorEvent => event !== null), ...syncedEvents];
      
      for (const event of allEvents) {
        let key = event.id;
        if (event.subjectType === 'workflow_run' && !key.startsWith('workflow_run:')) {
            const runId = (event.metadata as any)?.runId;
            if (runId) {
                const numericId = (event.metadata as any)?.repositoryNumericId;
                key = `workflow_run:${getCanonicalWorkflowRunId(numericId, event.repositoryName, runId)}`;
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
