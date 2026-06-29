# Home and Flow Workbench Implementation Report

## Baseline and root cause

The branch already had separate production Home, Flow, Simulator, Inspector, Demo provider, cache, and sync paths. The main inconsistency was presentation logic: Home and Flow derived stages and summaries independently, Flow exposed only eight visible stages, and Inspector had no shared explanation/history contract. This made stage placement, preview counts, and details drift between otherwise related surfaces.

The implementation keeps the existing Zustand, Tauri, SQLite, analytics sync, browser tab, and simulator architecture. It adds a frontend presentation layer shared by Home, Account Flow, Repository Flow, cards, filters, and Inspector. The simulators and their state remain separate.

## Shared workflow model

`src/lib/workflow-presentation.ts` owns the canonical nine-stage order, normalization, classification, history deduplication, stage-entry selection, time-in-stage formatting, filters, Home preview limits, recent repository ordering, and recent merge ordering.

Classification uses this exclusive priority order:

1. Successful deployment evidence or a deployment entity -> Deployed.
2. Draft release -> Coding.
3. Published release/prerelease -> Released.
4. Merge evidence -> Merged.
5. Closed without merge evidence -> Closed, never Merged.
6. Open issue without implementation evidence -> Issues.
7. Failed/error checks -> Checks / failing.
8. Pending/expected checks -> Checks / active.
9. Changes requested -> Review / changes requested.
10. Approval on a non-draft PR -> Ready; missing checks are described, not treated as passed.
11. Requested/pending review -> Review.
12. Draft PR -> Coding.
13. Otherwise open PR -> Pull Requests.

Normalized records carry a stable entity identity, source mode/type, stage reason, stage history, explicit completeness, actor/bot/draft metadata, branch and review metadata, and a deterministic Demo reference time. History is sorted and deduplicated by stage, timestamp, and label. Missing history is explicitly inferred and marked partial.

## Home

Home is now a compact command center with one primary `Open Flow Workbench` action, four accessible health metrics, deterministic Demo deltas, and neutral live fallbacks. Metric, stage-header, and `+N more` actions open Account Flow with the corresponding filter.

The Active Pipeline uses the shared nine-stage model and shared `FlowCard`, capped at two cards per stage. It does not expand locally. Recent repositories and merges are sorted by meaningful timestamps, select into the shared Inspector, and route through existing internal tabs where trustworthy identities exist.

## Account and Repository Flow

Both scopes render the same `FlowWorkbench`, `FlowPipeline`, and `FlowCard` components. The toolbar includes scope, repository, range, active-only, hide-empty, search, stage/status filters, and Live/Replay controls. Search and filters compose through one selector; Escape clears only transient search/stage/status filters.

The board renders all nine canonical lanes at a stable 320-360px width with intentional horizontal scrolling. Every lane has a fixed header, bounded card viewport, stable scrollbar gutter, contained overscroll, and a fixed expansion footer. Demo's Issues lane now exceeds the five-card preview so `Show 1 more` and `Show fewer` exercise the production path. Measured at 1280x800, expansion kept the pipeline at 446px and lane body at 360px while its scroll height grew from 798px to 951px. At 1600x900 the pipeline remained 536px and the lane body 450px.

Expansion is component-local and the pipeline key/reset context includes app mode, tab, scope, repository, mode, and range. Repository scope filters by normalized repository ID and shows no account data before a repository is selected. Supporting Event Stream, summary metrics, Repository Simulator, and CI Health links remain compact and repository-aware.

## Inspector

The existing Inspector now consumes normalized workflow items from Home and Flow. It shows type, stage, title, repository/number, draft/bot state, deterministic `Why it's here` text, meaningful metadata, completeness, partial-history explanation, and deduplicated stage history with inferred labels.

Supported entities use the existing shared destination resolver for `Open in Tab`. Canonical URLs also expose `Open on GitHub` and `Copy link` with visible status feedback. Unsupported synthetic Demo identities remain disabled instead of receiving fabricated destinations. Simulator Inspector paths were not replaced.

## Demo coverage and isolation

The typed fixture validator now accepts the Deployed stage and deployment entities and clones the richer metadata/history arrays. Fixtures cover all nine stages, multiple repositories, long names/titles, draft and bot PRs, requested/changes-requested/approved reviews, pending/failed/passed checks, labels, review metadata, merge, release, deployment, stage history, missing optional metadata, and enough Issues to exercise expansion.

Demo continues through the existing local provider and the same production components. Tests assert that Flow in Demo Mode invokes neither live source pagination nor timeline commands. No Demo data is written to SQLite or connected caches.

## Backend and migrations

No migration, SQLite schema change, Tauri command, sync command, or cache rewrite was required. The only backend change extends existing GitHub GraphQL selections with proven presentation gaps: `baseRefName`, `headRefName`, assignees, comment count, and commit count. Existing pagination, authentication, caching, rate-limit handling, and normalized response paths are reused.

## Files changed

- Shared model: `src/types/flow.ts`, `src/lib/workflow-presentation.ts`, `src/lib/flow-mapping.ts`, `src/lib/flow-parser.ts`
- Home: `src/components/workspace/Dashboard.tsx`, `Dashboard.css`
- Flow: `FlowWorkbench.tsx`, `FlowWorkbench.css`, `FlowPipeline.tsx`, `FlowPipeline.css`, `FlowCard.tsx`, `FlowCard.css`, `src/stores/flow-store.ts`
- Inspector: `src/components/inspector/Inspector.tsx`, `Inspector.css`
- Demo: `src/data/demo-provider.ts`, `public/demo-data/account/home.json`, `home-pipeline.json`
- Backend: `src-tauri/src/github/flow_api.rs`
- Tests: Home, Flow pipeline/workbench, Inspector workflow, presentation-model unit tests, and `e2e/flow-layout.spec.ts`

## Validation

- `pnpm test`: 26 files, 153 tests passed.
- `pnpm build`: passed; Vite retained its existing mixed static/dynamic import advisory.
- `pnpm lint`: passed with 0 errors and 17 pre-existing warnings outside the touched workbench implementation.
- `pnpm test:e2e`: 5 tests passed.
- `cargo test`: 52 tests passed (45 library, 7 integration).
- `cargo check`: passed with no warnings.
- `git diff --check`: passed.

Manual Demo verification covered Home, Account Flow, Repository Flow, selection/Inspector, combined search and filters, repository scoping, expansion/collapse, internal scrolling, and responsive containment at 1920x1080, 1600x900, and 1280x800. Browser measurements showed no page-level overflow at 1280x800.

An authenticated connected-account desktop session was not available in this environment. Connected screenshots and live-account action verification are therefore not claimed; the live path was validated through shared-component tests, the existing mocked connected E2E path, TypeScript build, and Rust tests. Desktop authentication/external navigation remain the principal manual follow-up limitation.

## Screenshots

- `screenshots/home-flow-demo-home-1920x1080.png`
- `screenshots/home-flow-demo-home-inspector-1920x1080.png`
- `screenshots/home-flow-demo-account-flow-1920x1080.png`
- `screenshots/home-flow-demo-account-flow-inspector-1920x1080.png`
- `screenshots/home-flow-demo-repository-flow-inspector-1920x1080.png`
- `screenshots/home-flow-demo-home-1280x800.png`
- `screenshots/home-flow-demo-account-flow-1280x800.png`
- `screenshots/home-flow-demo-account-flow-expanded-1280x800.png`
- `screenshots/home-flow-demo-account-flow-expanded-scrolled-1280x800.png`
- `screenshots/home-flow-demo-account-flow-expanded-1600x900.png`

## Scope confirmation

No team, organization analytics, collaboration administration, permission, or enterprise features were added. No graph canvas, graph state, Sigma.js, Graphology, or graph dependency was added. The Account and Repository Simulators were not merged into Flow or otherwise rearchitected. No commit or push was performed.
