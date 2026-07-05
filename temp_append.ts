
const inFlightCIRefreshes = new Map<string, Promise<void>>();
export function isCIRefreshInFlight(repoName: string) { return inFlightCIRefreshes.has(repoName); }
export function getCIFreshness(repoName: string) { return localStorage.getItem(`ci-freshness-${repoName}`); }

export async function syncRepositoryCIRuns(account: string, repo: string, invalidate: () => void) {
  if (inFlightCIRefreshes.has(repo)) return inFlightCIRefreshes.get(repo);
  const promise = (async () => {
    try {
      const boundary = new Date(Date.now() - 30 * 86400000).toISOString();
      const endpoint = (p: number) => `/repos/${repo}/actions/runs?per_page=100&page=${p}`;
      await paged(account, repo, "workflow_run", endpoint, boundary, 5, false);
      localStorage.setItem(`ci-freshness-${repo}`, new Date().toISOString());
      invalidate();
    } finally {
      inFlightCIRefreshes.delete(repo);
    }
  })();
  inFlightCIRefreshes.set(repo, promise);
  return promise;
}

