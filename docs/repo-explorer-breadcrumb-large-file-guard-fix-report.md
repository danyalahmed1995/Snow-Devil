# Repository Explorer Breadcrumb and Large-File Guard Fix Report

Date: 2026-06-26

## 1. Breadcrumb black-screen root cause

The breadcrumb bug came from using one string, `selectedPath`, as both “currently selected repository path” and “file path that should be fetched and rendered.”

Breadcrumb directory buttons called `setSelectedPath(directoryPath)`. The file-loading effect interpreted any non-empty path as a file and tried to fetch file contents for that directory. That could leave the explorer in an invalid mixed state: breadcrumb/header pointed at a directory, preview/file state expected a file, async file loading could fail, and tree expansion/focus did not necessarily match the new path.

The fix is not a tab reload. Repository Explorer now tracks the selected path kind explicitly as `root`, `tree`, or `blob`.

## 2. File-by-file summary

- `src/components/repository/RepositoryExplorer.tsx`
  - Added canonical repository path normalization.
  - Added explicit `SelectedKind` state.
  - Added safe directory and file selection paths.
  - Breadcrumb root/directory clicks now select directories and never fetch file contents.
  - Breadcrumb file clicks safely reselect the file.
  - Directory selection expands ancestor paths, focuses/reveals the tree node when practical, clears stale file preview state, and preserves repository/branch/tab state.
  - File loading now runs only when `selectedKind === "blob"`.
  - GitHub URLs encode path segments while internal tree identity remains unencoded.
  - Root tree row is selectable and reflects root state.

- `src/components/repository/RepositoryExplorer.css`
  - Added a stable `.file-preview__content` flex container for preview body layout.
  - Large-file guard now stretches inside the preview body and centers its title, text, and button relative to the right preview pane only.

- `src/components/repository/RepositoryExplorer.test.tsx`
  - Added focused regression tests for large-file guard layout, parent/root breadcrumb navigation, rapid breadcrumb clicks, and encoded/Unicode paths.

- `src/repository/demo-repository.ts`
  - Added benchmark-style demo fixture paths with spaces, punctuation, URL-sensitive characters, Unicode, and an oversized MDX file for deterministic tests/demo validation.

## 3. Corrected breadcrumb state model

Repository Explorer now separates:

- selected path: canonical unencoded repo path such as `Benchmark Files/heavy_mdx_5mb_examples`;
- selected kind: `root`, `tree`, or `blob`;
- loaded file: only populated for `blob` selections;
- expanded tree paths: ancestor chain for the selected directory/file;
- preview state: directory/root empty state, file preview, or inline error.

Directory and root selections clear `file`, `fileQuery`, and file-specific errors, then show:

```text
Directory selected
Choose a file from the tree to preview it.
```

or:

```text
Repository root selected
Choose a file from the tree to preview it.
```

## 4. Async cancellation and stale-response strategy

- Existing file fetch cancellation still uses `request.current`.
- Directory breadcrumb navigation now has its own `navigation.current` generation.
- Rapid breadcrumb clicks increment the navigation generation; older directory-loading responses return without applying stale focus/ready/error state.
- Repository/branch changes still increment the broader repository generation and request counters.
- Tree cache remains scoped by repository, branch, and path.

## 5. Large-file guard layout approach

The preview pane now has a dedicated body wrapper:

```text
file-preview
  header
  file-preview__content
    repo-state repo-state--guard
```

The guard uses flex centering inside `file-preview__content`, so centering is relative to the right preview content area only. It does not include the left tree pane, sidebar, tab strip, breadcrumb/header row, or app window.

## 6. Tests added

Added/strengthened tests for:

- large-file guard lives in the preview content body and remains in that centered container after resize;
- clicking a parent directory breadcrumb clears the large-file preview and selects the directory;
- clicking repository root breadcrumb returns to a safe root empty state;
- rapid breadcrumb clicks keep the latest directory selection;
- encoded spaces, punctuation, and Unicode paths normalize and render safely;
- existing tree label/root/icon/filter coverage remains intact.

## 7. Build, lint, and test results

- `pnpm exec tsc --noEmit`: passed.
- `pnpm vitest run src/components/repository/RepositoryExplorer.test.tsx`: passed, 7 tests.
- `pnpm test`: passed, 47 files / 239 tests.
- `pnpm build`: passed. Existing warnings remain for mixed static/dynamic import of `browser-commands.ts` and a bundle chunk larger than 500 kB.
- `pnpm lint`: passed with 0 errors and 40 warnings. Warnings are React hook advisory warnings already present in this code area/project style.

## 8. Manual validation performed

Manual browser validation was attempted against `http://127.0.0.1:1420/` in Demo Mode:

- Repository Explorer opened and remained interactive.
- The browser automation connection repeatedly timed out/reset during refresh/reload while trying to force the new demo fixture into the running HMR session.

Because of that harness issue, final interaction validation for the benchmark path was covered by automated UI regression tests rather than a completed manual click-through.

## 9. Remaining limitations

- The demo fixture is not the real EXT repository. It mirrors the important path shapes from the requested manual checklist: spaces, nested folders, punctuation/URL-sensitive characters, Unicode, and an oversized MDX file.
- Full visual centering under tree-pane resize/maximize is represented by structural CSS tests and build validation; the interrupted browser session prevented a completed visual resize pass.
- Directory navigation shows a safe empty state rather than a directory listing in the preview pane; tree browsing remains in the left pane, matching the existing architecture.
