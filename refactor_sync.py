import re

with open('src/analytics/sync.ts', 'r') as f:
    content = f.read()

header_additions = \"\"\"
let invalidationTimeout: ReturnType<typeof setTimeout> | null = null;
export function triggerAnalyticsInvalidation() {
  if (invalidationTimeout) clearTimeout(invalidationTimeout);
  invalidationTimeout = setTimeout(async () => {
    try {
      const { queryClient } = await import('../app/providers');
      void queryClient.invalidateQueries({ queryKey: ['delivery-analytics'] });
    } catch (e) {}
  }, 1500);
}

export function getCIFreshness(repository: string): string | null {
  return localStorage.getItem(\ci_freshness:\\);
}

export function setCIFreshness(repository: string, timestamp: string) {
  localStorage.setItem(\ci_freshness:\\, timestamp);
  notify();
}

const inFlightCIRefreshes = new Map<string, Promise<void>>();

export async function syncRepositoryCIRuns(account: string, repository: string, settings: AnalyticsSettings): Promise<void> {
  const key = \\:\\;
  if (inFlightCIRefreshes.has(key)) return inFlightCIRefreshes.get(key);
  
  const promise = (async () => {
    try {
      const now = new Date();
      const boundary = new Date(now.getTime() - settings.cacheRetentionDays * 86400000).toISOString();
      const [owner, name] = repository.split('/').map(encodeURIComponent);
      const endpoint = (p: number) => \/repos/\/\/actions/runs?per_page=100&page=\\;
      await paged(account, repository, 'workflow_run', endpoint, boundary, 10, true);
      setCIFreshness(repository, new Date().toISOString());
      triggerAnalyticsInvalidation();
    } finally {
      inFlightCIRefreshes.delete(key);
    }
  })();
  
  inFlightCIRefreshes.set(key, promise);
  return promise;
}
\"\"\"

content = content.replace("export interface AnalyticsSyncContinuation {", header_additions + "\\nexport interface AnalyticsSyncContinuation {")

content = content.replace(
    "let active: { account: string; cancelled: boolean } | null = null;",
    "let active: { account: string; cancelled: boolean; priorityQueue: string[] } | null = null;"
)

content = content.replace(
    "export async function startAnalyticsSync(account: string, settings: AnalyticsSettings): Promise<void> {",
    "export async function startAnalyticsSync(account: string, settings: AnalyticsSettings, options?: { priorityRepositories?: string[] }): Promise<void> {\\n  if (active?.account === account) {\\n    if (options?.priorityRepositories) {\\n       for (const r of options.priorityRepositories) {\\n          if (!active.priorityQueue.includes(r)) active.priorityQueue.push(r);\\n       }\\n    }\\n    return;\\n  }"
)
content = content.replace(
    "if (active?.account === account) return;",
    ""
)

content = content.replace(
    "active = { account, cancelled: false }; notify();",
    "active = { account, cancelled: false, priorityQueue: options?.priorityRepositories ? [...options.priorityRepositories] : [] }; notify();"
)

old_loop = \"\"\"    for (const repo of selected) {
      state.current_repository = repo.full_name;\"\"\"

new_loop = \"\"\"    const remaining = new Set(selected.map(r => r.full_name));
    const repoMap = new Map(selected.map(r => [r.full_name, r]));
    
    while (remaining.size > 0 && active && !active.cancelled) {
      let nextRepoName: string | undefined;
      while (active.priorityQueue.length > 0) {
        const candidate = active.priorityQueue.shift();
        if (candidate && remaining.has(candidate)) {
          nextRepoName = candidate;
          break;
        }
      }
      if (!nextRepoName) {
        nextRepoName = Array.from(remaining)[0];
      }
      if (!nextRepoName) break;
      
      remaining.delete(nextRepoName);
      const repo = repoMap.get(nextRepoName);
      if (!repo) continue;
      
      state.current_repository = repo.full_name;\"\"\"

content = content.replace(old_loop, new_loop)

old_invalidation = \"\"\"      try {
        const { queryClient } = await import('../app/providers');
        void queryClient.invalidateQueries({ queryKey: ['delivery-analytics'] });
      } catch (e) {
        // Ignore if queryClient is unavailable in this environment
      }\"\"\"

new_invalidation = \"\"\"      triggerAnalyticsInvalidation();\"\"\"
content = content.replace(old_invalidation, new_invalidation)

old_type_loop_end = \"\"\"          if (result.unsupported) counts[${type}_unsupported] = (counts[${type}_unsupported] ?? 0) + 1;
          state.rate_limit_json = result.rate ? JSON.stringify(result.rate) : state.rate_limit_json;
        }\"\"\"
new_type_loop_end = \"\"\"          if (result.unsupported) counts[${type}_unsupported] = (counts[${type}_unsupported] ?? 0) + 1;
          state.rate_limit_json = result.rate ? JSON.stringify(result.rate) : state.rate_limit_json;
          if (type === 'workflow_run') {
              setCIFreshness(repo.full_name, new Date().toISOString());
          }
        }\"\"\"
content = content.replace(old_type_loop_end, new_type_loop_end)

with open('src/analytics/sync.ts', 'w') as f:
    f.write(content)

print("Done")
