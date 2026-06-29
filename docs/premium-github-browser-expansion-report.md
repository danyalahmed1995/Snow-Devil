# Snow Devil Premium GitHub Browser Expansion Report

## 1. Executive summary

This implementation establishes Snow Devil's premium dark desktop design language and completes the first production slice of the native GitHub browsing loop. It adds a keyboard-first command palette, typed native repository and pull-request tabs, a lazy repository explorer, safe file previews, unified/split diff rendering, deterministic Demo parity, focused tests, responsive verification, and screenshot evidence.

The implementation builds on the current React/Tauri/Zustand architecture. It does not introduce a second router, tab system, backend service, graph canvas, team surface, or GitHub write action.

## 2. Architecture observed

- React 19 and Vite render a native workspace inside a Tauri 2 desktop shell.
- Zustand stores persist internal native/browser tabs, layout state, mode state, and Flow state.
- Tauri commands expose authenticated read-only GitHub GraphQL/REST calls and SQLite-backed workflow data.
- Demo fixtures already flowed through production Flow and Simulator types.
- Repository tree, blob, overview, and pull-request diff calls existed but the early `RepositoryView` was not integrated into workspace tab identity.
- The shell consists of a top bar, Navigator, internal tab strip, content region, and Inspector.

## 3. Design system

The supplied Dark Glass Premium board is the foundation, with Midnight Minimal density and Slate Monochrome clarity. Tokens now cover opaque and glass surfaces, three border levels, focus color, complete semantic colors, spacing, radii, elevation, blur, motion, and compatibility aliases used by older routes.

Glass remains limited to shell and overlay boundaries. Dense source, diff, workflow, and list surfaces are opaque. Global focus, selection, scrollbar, and reduced-motion rules are centralized. The app and window identity now read `Snow Devil`.

## 4. Home card clipping fix

The defect came from focus/selection decoration rendering outside the card border box while stage bodies clip overflow. The structural fix is:

- selected and focused card emphasis uses inset box shadows;
- Home stage card bodies have a stable six-pixel inner gutter;
- full Flow stage bodies have a thirteen-pixel inset;
- focus does not change card dimensions or board width;
- stage scrollbar gutters remain stable.

Manual 1920x1080 inspection confirms visible four-sided boundaries on the first, last, selected, and focused cards.

## 5. Command palette architecture

`CommandPalette` is a single global accessible dialog/listbox mounted beside the existing shell. It opens with `Ctrl/Cmd+K`, `Ctrl/Cmd+P`, and `Ctrl/Cmd+Shift+P`. Arrow keys and Enter operate results; Shift+Enter creates a distinct native tab and Ctrl/Cmd+Enter routes to the internal GitHub browser when a URL is meaningful.

The live adapter debounces and merges repositories, pull requests, and issues from existing read-only commands. The Demo adapter exposes deterministic repositories, files, issues, pull requests, commits, branches, releases, routes, and commands without native or GitHub requests.

## 6. Query syntax and ranking

Supported filters are `repo:`, `type:`, `author:`, and `is:`. Values can be repeated. Unknown `key:value` tokens remain fuzzy text. Ranking prefers exact title, prefix, substring, then subsequence matches. Duplicates use stable semantic IDs and prefer local over remote rows.

Unit tests cover parsing, unknown-token preservation, filtering, fuzzy ranking, and local/remote deduplication.

## 7. Repository explorer

Repository tabs store `{ repository, ref, path }` in the existing persisted native-tab model. The explorer contains a repository context header, branch/tag selector, breadcrumbs, lazy folder tree, filename filter, file pane, copy/refresh/GitHub actions, and honest Demo/live state labels.

Tree responses are normalized folders-first and alphabetically. Cache identity is `repository@ref:path`; branch changes reset tree and file state. Folder expansion fetches one directory, never one request per rendered row.

## 8. File and diff sources

Live repository content uses existing `get_repo_tree`, `get_repo_file`, and `execute_graphql` Tauri commands. Live pull-request details use `get_pr_details`, whose existing backend fetches the authenticated REST diff.

Text previews include line numbers and in-file match highlighting. Markdown uses the existing `react-markdown` and GFM stack. Demo SVG is previewed as a non-executable data image. Unsupported binary and files over 1 MB receive explicit fallback states. Diff normalization produces per-file line numbers and addition/deletion totals for unified and split layouts.

## 9. Cache and migrations

No SQLite schema change was required. Native entity context is persisted in the existing version-4 tab payload as an optional field, so older tabs remain valid. Repository tree state is bounded to the mounted explorer session in this slice.

## 10. Demo and no-network proof

Demo repository, branch, tree, file, issue, pull-request, commit, release, and diff data use the same production components and types. `e2e/native-browser.spec.ts` listens for `api.github.com` requests while opening the palette, repository, nested file, source search, and PR diff; the asserted count is zero.

Reset and Exit continue to use the existing mode store isolation. No parallel Demo UI was created.

## 11. Keyboard map

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd+K` | Global search |
| `Ctrl/Cmd+P` | File mode |
| `Ctrl/Cmd+Shift+P` | Command mode |
| `Escape` | Close palette |
| `Up/Down` | Move result selection |
| `Enter` | Open/reuse native context |
| `Shift+Enter` | Open a new native tab |
| `Ctrl/Cmd+Enter` | Open the GitHub target internally |

## 12. Accessibility

The palette uses dialog/listbox/option semantics with result counts and keyboard hints. The repository browser uses labelled tree/treeitem semantics, selected/expanded state, labelled searches, breadcrumbs, accessible icon actions, and visible focus. Diff layout uses a labelled control group. Reduced motion is honored globally and state is not represented by color alone.

## 13. Security

- All GitHub operations remain read-only.
- Binary content is not executed or decoded.
- Markdown continues through React's safe renderer; raw HTML is not enabled.
- Image preview is local deterministic Demo SVG only; authenticated live images fall back to GitHub.
- No token, credential, private payload, or connected screenshot was added.

## 14. Performance

The palette opens synchronously from local state and debounces live loading by 220 ms. Results are capped at 60. Trees load per expanded directory and are normalized once. File previews cap native rendering at 1 MB. Diff parsing is memoized by raw diff text. CSS avoids large scrolling blur layers.

At 1280x800 the measured repository explorer was 620x712 with identical client and scroll dimensions, proving no page-level overflow. The narrow pane remains usable with both Navigator and Inspector visible.

## 15. Modified files by subsystem

- Design system and shell: `src/styles/*`, `TopBar`, `AddressBar`, `FlowCard`, `FlowPipeline`, `Dashboard`, `index.html`.
- Native tab integration: `browser-tabs.ts`, `tabs-store.ts`, `WorkspaceContent.tsx`, `App.tsx`.
- Palette: `src/components/palette`, `src/palette`.
- Repository browser: `src/components/repository`, `src/repository`.
- Diff browser: `src/components/diff`, `src/diff`.
- Verification: `e2e/native-browser.spec.ts`, screenshots listed below.

## 16. Tests added

- Palette parsing, ranking, filtering, and deduplication.
- Repository ordering, cache keys, and file classification.
- Unified diff file/line normalization.
- E2E palette-to-repository-to-file-to-diff workflow.
- E2E Demo no-network assertion.
- E2E 1280x800 containment measurement.

## 17. Validation results

| Command | Result |
| --- | --- |
| `pnpm test` | 29 files, 159 tests passed |
| `pnpm build` | Passed; existing 500 kB chunk-size advisory remains |
| `pnpm lint` | Passed with 0 errors and 22 warnings |
| `pnpm test:e2e` | 7 passed |
| `cargo test` | 52 passed |
| `cargo check` | Passed |
| `git diff --check` | Passed |

Lint warnings are not hidden. Six warnings are in the new async palette/explorer/diff effects and sixteen are the same existing React effect/dependency class elsewhere. Plain-Vite manual testing logs expected missing-Tauri-bridge errors; production UI verification used Demo data only.

## 18. Screenshot inventory

- `screenshots/premium-demo-home-1920x1080.png`
- `screenshots/premium-command-palette-1920x1080.png`
- `screenshots/premium-command-mode-1600x900.png`
- `screenshots/demo-repository-explorer-1920x1080.png`
- `screenshots/demo-repository-explorer-1280x800.png`
- `screenshots/demo-pr-diff-unified-1280x800.png`
- `screenshots/demo-pr-diff-split-1280x800.png`

No authenticated connected screenshot was captured or implied.

## 19. Known limitations and follow-up

This is the first complete production slice, not every advanced item in the expansion brief. Remaining work includes remote filename/path search beyond previously loaded trees, native commit diffs, persistent bounded tree/file caching, syntax token coloring beyond safe monospace rendering, virtualized very-large diffs, richer file-to-workflow Inspector relationships, focus restoration after every remote refresh, more palette commands (sync/recalculate/reopen), and native explorer entry actions on every existing repository card. Connected GitHub behavior was validated by types/build/backend tests, not manually against an authenticated account.

## 20. Scope confirmation

No team feature, graph canvas, GitHub write action, external backend, repository clone, commit, or push was added or performed.

## 21. Final status

The worktree contains local source, test, documentation, and screenshot changes only. It remains uncommitted for review as requested.
