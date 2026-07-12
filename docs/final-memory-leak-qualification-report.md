# Final packaged-app memory leak qualification

Date: 2026-07-12  
Branch: `fix/final-memory-leak-qualification`  
Package: `src-tauri/target/release/bundle/nsis/Snow Devil_0.1.0_x64-setup.exe`

## 1. Executive summary

Two instrumented NSIS/release builds were run as real Windows Tauri applications using WebView2. The main webview was driven through its WebView2 debugging endpoint; Windows process metrics covered the Rust host and its complete descendant process tree. JavaScript heap samples were taken after `HeapProfiler.collectGarbage`.

Two reproducible ownership defects were fixed:

1. Closing native tabs did not remove their Flow and History Zustand records. After a mixed 10-tab run and closing all tabs, three Flow and two History entries remained.
2. A built-in browser tab could close while `browser_create` was in flight. The close command could run before creation completed, after which the stale promise chain could activate or retain the late webview.

React Query had a 30-minute TTL but no maximum entry count. It is now capped at 100 inactive entries. Several module caches also gained explicit entry bounds. Restored heavy tabs now remain dormant because startup always activates Home.

The tested resource registries converged: workers and mounted heavy views returned to zero, query observers returned to the Home baseline, browser manager records returned to zero, tab-owned Zustand entries returned to zero after the fix, and no Git/child process, watcher, task, channel, statement, or transaction owner exists in the current backend paths. WebView2/private memory showed warm allocator retention and JS heap plateaus rather than returning to cold baseline.

Verdict: **Partially qualified: no unbounded leak was reproduced in the completed packaged scenarios, but several global browser resource classes cannot be counted precisely and live-network/offline/native-CI scenarios were not fully exercisable without a connected qualification account.**

## 2. Baseline

### Cold packaged idle

| Seconds | Rust host private MB | Host working set MB | Handles | Threads | Direct WebView2 children |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 3.73 | 18.53 | 284 | 10 | 1 |
| 10 | 8.43 | 40.01 | 544 | 29 | 1 |
| 20 | 7.17 | 39.14 | 523 | 25 | 1 |
| 30 | 7.55 | 39.06 | 522 | 25 | 1 |
| 40 | 7.51 | 39.05 | 520 | 24 | 1 |
| 50 | 7.51 | 39.05 | 520 | 24 | 1 |
| 60 | 7.42 | 39.00 | 517 | 21 | 1 |

At 60 seconds the complete seven-process host/WebView2 tree used 255.39 MB private bytes and 409.68 MB working set, with 4,381 handles and 176 threads. Frontend cold diagnostics reported 4.59 MB used JS heap, three query entries/observers, one Home tab, no workers/heavy views/browser tabs, one SQLite connection, and zero browser-manager records.

### Pre-fix Delivery Risks 50-cycle packaged baseline

| Cycle | Process-tree private MB | Working set MB | Handles | Threads |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 259.25 | 412.55 | 4,430 | 179 |
| 10 | 257.75 | 411.63 | 4,400 | 168 |
| 20 | 257.76 | 411.64 | 4,400 | 168 |
| 30 | 257.43 | 411.40 | 4,393 | 165 |
| 40 | 257.43 | 411.40 | 4,393 | 165 |
| 50 | 257.43 | 411.41 | 4,393 | 165 |

The Delivery Risks native process metrics were already stable before new remediation.

## 3. Reproduced leaks

### Tab-owned Zustand state retained after close

- Steps: open Flow, Delivery Risks, both History views, PR, repository, and browser tabs; switch for ten minutes; close all non-Home tabs; force GC and inspect registries.
- Before evidence: `flowTabEntries=3`, `historyTabEntries=2` with `tabs.total=1` and `mountedHeavyViews=0`.
- Root cause: `tabs-store.closeTab` cleared Architecture state but had no Flow or History disposal call.
- Severity: medium. Selected entities and view models could retain large event/inspection payloads after their owning tabs closed.
- Affected views: Flow, CI/Delivery Risks selection state, Account History, Repository History, native PR-related inspection state.

### Browser creation completed after owner disposal

- Steps: start native `browser_create`, remove the tab/unmount the viewport before the promise resolves, then resolve creation.
- Root cause: animation frames were cancelled, but the already-started promise chain had no ownership check before resize/activate/resident publication.
- Severity: high for repeated close-during-create because a native child webview can outlive its tab metadata.
- Affected views: built-in GitHub browser tabs.

### Unbounded entry counts in warm caches

- React Query had a 30-minute TTL but no maximum entry count.
- Repository tree/search, business-time, demo fixture, and analytics sync maps had no maximum entry count.
- These were bounded-time or naturally low-cardinality in normal use, but did not meet the explicit qualification rule that every cache have a hard bound.

## 4. Fixes

| Files | Ownership correction | Cleanup/test behavior |
| --- | --- | --- |
| `tabs-store.ts`, `flow-store.ts`, `tabs-close.test.ts` | Native tab close synchronously clears Flow and History records; Architecture cleanup remains scoped by the same tab id. | Regression test stores representative selected/search state, closes the tab, and verifies both entries are absent. Packaged after-fix result: Flow 2→0 and History 1→0 after close. |
| `BrowserViewport.tsx`, `BrowserViewport.overlay.test.tsx` | Every continuation checks canonical tab ownership/current activity. A webview created after its tab vanished is immediately closed and cannot be activated. | Deferred-create regression removes the tab before resolution and asserts `browserClose(id)` with no activation. |
| `providers.tsx`, `providers.test.ts` | Inactive query cache is capped at 100 entries; existing 30-minute `gcTime` remains the TTL. Active observed queries are never evicted by the cap. | Test inserts 125 inactive queries and verifies oldest eviction and 100 retained entries. |
| `bounded-cache.ts` and cache consumers | Adds deterministic oldest-entry eviction: demo fixtures 32, weekday buckets 400, repository search 100, repository trees 200, sync accounts 8. | Unit test covers eviction and replacement recency. |
| `tabs-store.ts`, migration test | Restored tab metadata remains available, but startup activates Home rather than mounting the previously active heavy tab. | Migration test now requires Home active after hydration. |
| frontend/Rust diagnostics | Diagnostics are enabled only for development or explicit qualification builds. Ordinary release builds do not expose verbose leak data. | Unsupported counters return `null`, not guessed zero. No repository names, payloads, tokens, cookies, or file content are emitted. |

## 5. Stress results

### Scenario matrix

| Scenario | Packaged result | Verdict |
| --- | --- | --- |
| Delivery Risks open/close 50 | Process tree stabilized by cycle 10; post-GC heap warmed 4.84→7.73 MB and converged to 8.04 MB at cycle 50. Workers/heavy views/tabs returned to zero; observers returned to Home baseline. | Pass for tested demo path. Live worker cancellation also has automated termination coverage. |
| Ten-tab switch, 10 minutes | 11 tabs, including native PR, CI, histories, Flow, Delivery Risks, repository and child GitHub webview. Query entries stayed 27, Flow entries 3, History entries 2, tab count 11. Post-GC heap ranged 13.33–14.93 MB after warm-up and dropped between peaks, disproving monotonic growth. | Pass for demo/package switching; retained tab-store entries after close were separately fixed. |
| Restore | Packaged tab metadata persistence was exercised. Code/test now forces Home active after hydration and leaves restored heavy tabs unmounted until activation. | Pass automated migration; final rebuilt-package restart was not repeated for 60 seconds after the last patch. |
| Delivery Risks refresh/close | 50 open/close cycles completed. Live refresh requires authentication and was not available. Worker termination and stale ownership are covered by unit tests. | Partial. |
| Architecture full-screen | 50 enter/exit cycles. Post-GC heap 12.57→13.07 MB, with only 0.11 MB growth from cycle 20 to 50. On close: heavy views 1→0, query observers 5→3, Architecture entries 1→0, heap 12.81 MB. | Pass for demo graph; snapshot contained zero large repository nodes. |
| Built-in browser | 100 total open/close cycles. Backend browser records were zero at every ten-cycle close sample and CDP showed only the main target afterward. Heap warmed 8.33→9.94 MB for cycles 0–50, then converged: 11.24, 11.28, 11.30, 11.33, 11.34 MB at cycles 60–100. | Pass with bounded WebView2 allocator retention. |
| Repository switching | Repository and PR identities were switched during the mixed-tab test; no filesystem watcher implementation exists and backend watcher count is zero. | Partial: only one demo repository had meaningful fixture data. |
| Offline/error cancellation | Browser close-during-create and frontend stale response suppression were tested. A live GitHub network disconnect/reconnect was not available without a connected account. | Partial/manual-only. |

After the fix, opening seven mixed tabs produced Flow=2 and History=1. Closing all non-Home tabs produced Flow=0, History=0, heavy views=0, workers=0, browser tabs=0, backend webviews=0, query observers=3, and one SQLite connection with no active statements/transactions.

## 6. Cache inventory

| Cache | Owner/key | Bound | TTL / eviction | Purpose / clear |
| --- | --- | ---: | --- | --- |
| React Query | global canonical query key | 100 inactive entries | 30-minute default GC; oldest inactive entry on overflow; explicit `queryClient.clear()` on reset | Warm return and request deduplication. |
| Browser webviews | Rust `BrowserWebviewManager`, tab id | 6 resident | LRU-style pool enforcement; close/suspend/tab disposal | Preserve warm child pages without unbounded native views. |
| Closed tabs | tabs store, canonical tab id | 20 | newest-first slice on close | Reopen recently closed metadata; contains no live component/worker owner. |
| Delivery Risks models | dataset/settings object identity | Weak keys | automatic GC with query/settings objects | Near-instant warm classification without retaining evicted datasets. |
| Architecture state | tab id | active/open architecture tabs | synchronous clear on native tab close | Selection/layout and snapshot ownership. |
| Flow/History state | tab id | active/open owners | synchronous clear on tab close | Lightweight warm view state; fixed leak in this pass. |
| Repository tree | repository/ref/path | 200 | oldest entry on overflow | Avoid repeat tree IPC. |
| Repository search | repository/ref/page/query | 100 | oldest entry on overflow | Avoid duplicate GitHub search. |
| Demo fixture | fixture path | 32 | oldest entry on overflow; explicit demo reset | Offline qualification fixtures. |
| Business weekday | timezone/hour | 20,000 | oldest hour bucket on overflow | Covers over two years of hourly analysis without eviction churn. |
| Analytics sync state | account login | 8 | oldest account on overflow; 2-second freshness | Deduplicate status IPC. |
| CI watcher | canonical run id | 20 displayed/normalized | source refresh replaces snapshot | Bounded recent CI presentation. |

Byte caps are not practical for JavaScript object graphs; entry limits, payload-level result limits, TTLs, and weak ownership provide deterministic bounds. SQLite tables are persistent storage rather than process caches and remain constrained by synchronization retention rules.

## 7. Remaining limitations

- Event listeners, timers, animation frames, Resize/Mutation/Intersection observers, object URLs, Zustand subscriber internals, graph instances, and Tauri listener totals cannot be enumerated precisely by the current frameworks. The qualification API reports these as `null`. Code audit and focused cleanup tests cover known owners, but no absolute global count is claimed.
- Tokio task/channel/child/Git/watcher counts are zero because no such spawn/owner implementation exists in the current Rust source. This is architecture evidence, not runtime executor introspection.
- WebView2 process private bytes retained a higher warm baseline after browser use. The browser manager and CDP targets returned to one main page, and heap/process counts converged, so this is classified as allocator/runtime retention rather than demonstrated Snow Devil ownership.
- The 10-minute mixed test used demo data and one real child GitHub webview. Live CI log downloads, authenticated GitHub retries, large SQLite histories, and private repositories were unavailable.
- Architecture full-screen used the demo PR whose repository snapshot contained no large node/edge payload. Listener/observer behavior passed component tests, but qualification-scale graph memory remains uncertain.
- The packaged app was executed directly from the release bundle output; the NSIS installer was built successfully but not installed over an existing user installation.
- Native allocator fragmentation and WebView2 internal caches are approximate and cannot be forced back to cold baseline.

## 8. Final verdict

**Partially qualified: known bounded warm growth remains and some live/native resource classes could not be measured precisely. No reproducible unbounded leak remains in the packaged scenarios actually tested.**

This report does not claim that all possible memory leaks are gone.

## Verification commands

| Command | Result |
| --- | --- |
| `pnpm exec tsc --noEmit` | Pass |
| `pnpm test` | 446 passed. Nine pre-existing Repository Explorer tests fail because they mount `useIsFetching` without a `QueryClientProvider`. Three Delivery Risks timeouts exposed an undersized weekday-cache cap; the cap was corrected and all 23 affected/changed-area tests pass on rerun. |
| `pnpm build` | Pass; existing mixed static/dynamic import and main chunk-size warnings remain. |
| `pnpm run lint` | Zero errors, 67 pre-existing warnings. |
| `pnpm test:e2e -- --reporter=list` | 46 passed, one skipped, four failed. Two failures require intentionally disabled Flow Analytics; Repository Explorer's existing demo Architecture state lacks Component Index; Delivery Risks warm timing missed under six-worker contention (168.5 ms) but passed alone at 89.7 ms. |
| `cargo check` | Pass |
| `cargo test` | 70 passed |
| `cargo fmt --check` | This pass's Rust file is formatted; command still fails on two pre-existing formatting lines in `commands/repo.rs` and `github/repo_api.rs`. |
| `git diff --check` | Pass |
| Instrumented NSIS package build | Pass, twice after baseline and remediation. |
