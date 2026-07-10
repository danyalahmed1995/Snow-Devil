use std::path::PathBuf;
use std::process::Command;

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub worktree_id: String,
    pub canonical_path: String,
    pub display_path: String,
    pub branch: Option<String>,
    pub branch_ref: Option<String>,
    pub head_sha: Option<String>,
    pub is_main: bool,
    pub is_detached: bool,
    pub is_bare: bool,
    pub is_locked: bool,
    pub locked_reason: Option<String>,
    pub is_prunable: bool,
    pub prunable_reason: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeGitStatus {
    pub modified_count: u32,
    pub untracked_count: u32,
    pub staged_count: u32,
    pub has_conflicts: bool,
    pub is_clean: bool,
    pub branch: Option<String>,
    pub head_sha: Option<String>,
    pub ahead: u32,
    pub behind: u32,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeFileDiff {
    pub file_path: String,
    pub old_path: Option<String>,
    pub status: String,
    pub diff_text: String,
    pub is_binary: bool,
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/// Strip the Windows extended-path prefix `\\?\` for display purposes only.
fn strip_unc_prefix(s: &str) -> String {
    if s.starts_with(r"\\?\") {
        s[4..].to_string()
    } else {
        s.to_string()
    }
}

/// Canonicalize a path; if it doesn't exist (missing/prunable worktree) fall
/// back to the raw string so we can still represent it.
#[tauri::command]
pub async fn is_git_repository(path: String) -> Result<bool, String> {
    let output = Command::new("git")
        .args(&["-C", &path, "rev-parse", "--is-inside-work-tree"])
        .output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;
    
    Ok(output.status.success())
}

#[tauri::command]
pub async fn worktree_get_remote_url(repo_path: String, remote_name: String) -> Result<String, String> {
    let output = Command::new("git")
        .args(&["-C", &repo_path, "remote", "get-url", &remote_name])
        .output()
        .map_err(|e| format!("Failed to execute git: {}", e))?;
    
    if output.status.success() {
        let url = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(url)
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

fn try_canonicalize(path: &str) -> (String, String) {
    match std::fs::canonicalize(path) {
        Ok(p) => {
            let canonical = p.to_string_lossy().to_string();
            let display = strip_unc_prefix(&canonical);
            (canonical, display)
        }
        Err(_) => (path.to_string(), path.to_string()),
    }
}

/// Map a `std::io::ErrorKind::NotFound` from spawning git into a friendly msg.
fn git_not_found_error(e: &std::io::Error) -> String {
    if e.kind() == std::io::ErrorKind::NotFound {
        "Git is not available in PATH. Please install Git.".to_string()
    } else {
        format!("Failed to run git: {}", e)
    }
}

// ---------------------------------------------------------------------------
// Porcelain parser
// ---------------------------------------------------------------------------

/// Parse the output of `git worktree list --porcelain` into a list of
/// [`WorktreeInfo`] values.
fn parse_worktree_porcelain(output: &str) -> Vec<WorktreeInfo> {
    let mut results = Vec::new();
    let mut is_first = true;

    // Blocks are separated by blank lines
    for block in output.split("\n\n") {
        let block = block.trim();
        if block.is_empty() {
            continue;
        }

        let mut worktree_path_raw = String::new();
        let mut head_sha: Option<String> = None;
        let mut branch_ref: Option<String> = None;
        let mut is_bare = false;
        let mut is_detached = false;
        let mut is_locked = false;
        let mut locked_reason: Option<String> = None;
        let mut is_prunable = false;
        let mut prunable_reason: Option<String> = None;

        for line in block.lines() {
            if let Some(rest) = line.strip_prefix("worktree ") {
                worktree_path_raw = rest.trim().to_string();
            } else if let Some(rest) = line.strip_prefix("HEAD ") {
                head_sha = Some(rest.trim().to_string());
            } else if let Some(rest) = line.strip_prefix("branch ") {
                branch_ref = Some(rest.trim().to_string());
            } else if line == "bare" {
                is_bare = true;
            } else if line == "detached" {
                is_detached = true;
            } else if line.starts_with("locked") {
                is_locked = true;
                let reason_part = line["locked".len()..].trim();
                if !reason_part.is_empty() {
                    locked_reason = Some(reason_part.to_string());
                }
            } else if line.starts_with("prunable") {
                is_prunable = true;
                let reason_part = line["prunable".len()..].trim();
                if !reason_part.is_empty() {
                    prunable_reason = Some(reason_part.to_string());
                }
            }
        }

        if worktree_path_raw.is_empty() {
            continue;
        }

        let (canonical_path, display_path) = try_canonicalize(&worktree_path_raw);

        // Extract short branch name from ref
        let branch = branch_ref.as_deref().map(|r| {
            r.strip_prefix("refs/heads/")
                .unwrap_or(r)
                .to_string()
        });

        let is_main = is_first;
        is_first = false;

        results.push(WorktreeInfo {
            worktree_id: canonical_path.clone(),
            canonical_path: canonical_path,
            display_path: display_path,
            head_sha,
            branch,
            branch_ref,
            is_bare,
            is_detached,
            is_locked,
            locked_reason,
            is_prunable,
            prunable_reason,
            is_main,
        });
    }

    results
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// List all git worktrees for the repository at `repo_path`.
#[tauri::command]
pub async fn worktree_list(repo_path: String) -> Result<Vec<WorktreeInfo>, String> {
    let output = Command::new("git")
        .args(["-C", &repo_path, "worktree", "list", "--porcelain"])
        .output()
        .map_err(|e| git_not_found_error(&e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree list failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(parse_worktree_porcelain(&stdout))
}

/// Add a new worktree.
#[tauri::command]
pub async fn worktree_add(
    repo_path: String,
    worktree_path: String,
    branch: String,
    new_branch: Option<String>,
    base_ref: Option<String>,
) -> Result<WorktreeInfo, String> {
    // Validate worktree_path doesn't already exist as a non-empty directory
    let dest = std::path::Path::new(&worktree_path);
    if dest.exists() {
        if dest.is_dir() {
            let entries: Vec<_> = std::fs::read_dir(dest)
                .map_err(|e| format!("Cannot read destination directory: {}", e))?
                .collect();
            if !entries.is_empty() {
                return Err(format!(
                    "Destination directory already exists and is not empty: {}",
                    worktree_path
                ));
            }
        } else {
            return Err(format!(
                "Destination path already exists as a file: {}",
                worktree_path
            ));
        }
    }

    let output = if let Some(ref nb) = new_branch {
        let base = base_ref.as_deref().unwrap_or("HEAD");
        Command::new("git")
            .args([
                "-C",
                &repo_path,
                "worktree",
                "add",
                "-b",
                nb,
                &worktree_path,
                base,
            ])
            .output()
            .map_err(|e| git_not_found_error(&e))?
    } else {
        Command::new("git")
            .args([
                "-C",
                &repo_path,
                "worktree",
                "add",
                &worktree_path,
                &branch,
            ])
            .output()
            .map_err(|e| git_not_found_error(&e))?
    };

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree add failed: {}", stderr.trim()));
    }

    // Find the newly created worktree by looking up the list
    let list = worktree_list(repo_path).await?;

    // Canonicalize the worktree_path so we can match it
    let target_canonical = std::fs::canonicalize(&worktree_path)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| worktree_path.clone());

    list.into_iter()
        .find(|w| w.canonical_path == target_canonical)
        .ok_or_else(|| "Worktree was created but could not be found in worktree list".to_string())
}

/// Remove a worktree.
#[tauri::command]
pub async fn worktree_remove(
    repo_path: String,
    worktree_path: String,
    force: bool,
) -> Result<(), String> {
    if !force {
        let status = worktree_status(worktree_path.clone()).await?;
        if status.modified_count > 0 || status.staged_count > 0 {
            return Err(
                "Worktree has uncommitted changes. Use force=true to override.".to_string(),
            );
        }
    }

    let mut args: Vec<String> = vec![
        "-C".to_string(),
        repo_path.clone(),
        "worktree".to_string(),
        "remove".to_string(),
    ];
    if force {
        args.push("--force".to_string());
    }
    args.push(worktree_path.clone());

    let output = Command::new("git")
        .args(&args)
        .output()
        .map_err(|e| git_not_found_error(&e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree remove failed: {}", stderr.trim()));
    }

    Ok(())
}

/// Prune stale worktree administrative files.
#[tauri::command]
pub async fn worktree_prune(repo_path: String) -> Result<Vec<String>, String> {
    let output = Command::new("git")
        .args(["-C", &repo_path, "worktree", "prune", "-v"])
        .output()
        .map_err(|e| git_not_found_error(&e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree prune failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let pruned: Vec<String> = stdout
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect();

    Ok(pruned)
}

/// Lock a worktree to prevent automatic pruning.
#[tauri::command]
pub async fn worktree_lock(
    repo_path: String,
    worktree_path: String,
    reason: Option<String>,
) -> Result<(), String> {
    let mut args: Vec<String> = vec![
        "-C".to_string(),
        repo_path.clone(),
        "worktree".to_string(),
        "lock".to_string(),
    ];

    if let Some(ref r) = reason {
        args.push("--reason".to_string());
        args.push(r.clone());
    }

    args.push(worktree_path.clone());

    let output = Command::new("git")
        .args(&args)
        .output()
        .map_err(|e| git_not_found_error(&e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree lock failed: {}", stderr.trim()));
    }

    Ok(())
}

/// Unlock a worktree.
#[tauri::command]
pub async fn worktree_unlock(repo_path: String, worktree_path: String) -> Result<(), String> {
    let output = Command::new("git")
        .args(["-C", &repo_path, "worktree", "unlock", &worktree_path])
        .output()
        .map_err(|e| git_not_found_error(&e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree unlock failed: {}", stderr.trim()));
    }

    Ok(())
}

/// Get the git status of a worktree.
#[tauri::command]
pub async fn worktree_status(worktree_path: String) -> Result<WorktreeGitStatus, String> {
    let output = Command::new("git")
        .args([
            "-C",
            &worktree_path,
            "status",
            "--porcelain=v2",
            "--branch",
        ])
        .output()
        .map_err(|e| git_not_found_error(&e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git status failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);

    let mut modified_count: u32 = 0;
    let mut untracked_count: u32 = 0;
    let mut staged_count: u32 = 0;
    let mut has_conflicts = false;
    let mut branch: Option<String> = None;
    let mut head_sha: Option<String> = None;
    let mut ahead: u32 = 0;
    let mut behind: u32 = 0;

    for line in stdout.lines() {
        if let Some(rest) = line.strip_prefix("# branch.oid ") {
            let sha = rest.trim();
            if sha != "(initial)" {
                head_sha = Some(sha.to_string());
            }
        } else if let Some(rest) = line.strip_prefix("# branch.head ") {
            let b = rest.trim();
            if b != "(detached)" {
                branch = Some(b.to_string());
            }
        } else if let Some(rest) = line.strip_prefix("# branch.ab ") {
            // Format: +<ahead> -<behind>
            for part in rest.split_whitespace() {
                if let Some(n) = part.strip_prefix('+') {
                    ahead = n.parse().unwrap_or(0);
                } else if let Some(n) = part.strip_prefix('-') {
                    behind = n.parse().unwrap_or(0);
                }
            }
        } else if line.starts_with("1 ") || line.starts_with("2 ") {
            // Ordinary and renamed/copied changed entries
            // Format: "1 XY ..."  where X = staged status, Y = unstaged status
            let parts: Vec<&str> = line.splitn(3, ' ').collect();
            if parts.len() >= 2 {
                let xy = parts[1];
                let x = xy.chars().next().unwrap_or('.');
                let y = xy.chars().nth(1).unwrap_or('.');
                // Staged: X is not '.' and not '?'
                if x != '.' && x != '?' {
                    staged_count += 1;
                }
                // Worktree modified: Y is not '.' and not '?'
                if y != '.' && y != '?' {
                    modified_count += 1;
                }
            }
        } else if line.starts_with("? ") || line.starts_with("?? ") {
            untracked_count += 1;
        } else if line.starts_with("u ") {
            has_conflicts = true;
        }
    }

    let is_clean =
        modified_count == 0 && staged_count == 0 && untracked_count == 0 && !has_conflicts;

    Ok(WorktreeGitStatus {
        modified_count,
        untracked_count,
        staged_count,
        has_conflicts,
        is_clean,
        branch,
        head_sha,
        ahead,
        behind,
    })
}

// ---------------------------------------------------------------------------
// Diff helpers
// ---------------------------------------------------------------------------

const DIFF_SIZE_LIMIT: usize = 512 * 1024; // 512 KB

/// Parse unified diff text produced by `git diff` into per-file structs.
fn parse_diff_output(diff_text: &str, status_hint: &str) -> Vec<WorktreeFileDiff> {
    let mut results: Vec<WorktreeFileDiff> = Vec::new();

    // Track current file context
    let mut current_file: Option<String> = None;
    let mut current_old: Option<String> = None;
    let mut current_buf: Vec<String> = Vec::new();
    let mut is_binary = false;

    let flush = |file: &mut Option<String>,
                 old: &mut Option<String>,
                 buf: &mut Vec<String>,
                 binary: bool,
                 results: &mut Vec<WorktreeFileDiff>,
                 status: &str| {
        if let Some(f) = file.take() {
            let raw = buf.join("\n");
            let diff_text = if raw.len() > DIFF_SIZE_LIMIT {
                format!("[diff truncated at 512 KB]\n{}", &raw[..DIFF_SIZE_LIMIT])
            } else {
                raw
            };
            results.push(WorktreeFileDiff {
                file_path: f,
                old_path: old.take(),
                status: status.to_string(),
                diff_text,
                is_binary: binary,
            });
        }
        buf.clear();
    };

    for line in diff_text.lines() {
        if line.starts_with("diff --git ") {
            flush(
                &mut current_file,
                &mut current_old,
                &mut current_buf,
                is_binary,
                &mut results,
                status_hint,
            );
            is_binary = false;
            current_buf.push(line.to_string());
        } else if line.starts_with("--- a/") {
            let old = &line["--- a/".len()..];
            if old != "/dev/null" {
                current_old = Some(old.to_string());
            }
            current_buf.push(line.to_string());
        } else if line.starts_with("+++ b/") {
            let new_name = &line["+++ b/".len()..];
            current_file = Some(new_name.to_string());
            current_buf.push(line.to_string());
        } else if line.starts_with("Binary files") {
            is_binary = true;
            // e.g. "Binary files a/foo.png and b/foo.png differ"
            if current_file.is_none() {
                if let Some(and_pos) = line.find(" and b/") {
                    let after = &line[and_pos + " and b/".len()..];
                    let name = after.trim_end_matches(" differ").to_string();
                    current_file = Some(name);
                }
            }
            current_buf.push(line.to_string());
        } else if line.starts_with("rename from ") {
            current_old = Some(line["rename from ".len()..].to_string());
            current_buf.push(line.to_string());
        } else if line.starts_with("rename to ") {
            current_file = Some(line["rename to ".len()..].to_string());
            current_buf.push(line.to_string());
        } else {
            current_buf.push(line.to_string());
        }
    }

    // Flush last entry
    flush(
        &mut current_file,
        &mut current_old,
        &mut current_buf,
        is_binary,
        &mut results,
        status_hint,
    );

    results
}

/// Get the diff for a worktree, optionally limited to a single file.
#[tauri::command]
pub async fn worktree_diff(
    worktree_path: String,
    file_path: Option<String>,
) -> Result<Vec<WorktreeFileDiff>, String> {
    // Validate file_path if provided - reject traversal attempts
    if let Some(ref fp) = file_path {
        if fp.contains("../") || fp.contains("..\\") || fp.starts_with("..") || fp == ".." {
            return Err(format!("Path traversal rejected: {}", fp));
        }
        // Canonicalize check - only if the file actually exists
        let full = std::path::Path::new(&worktree_path).join(fp);
        if full.exists() {
            let canon = std::fs::canonicalize(&full)
                .map_err(|e| format!("Cannot canonicalize file path: {}", e))?;
            let root_canon = std::fs::canonicalize(&worktree_path)
                .map_err(|e| format!("Cannot canonicalize worktree root: {}", e))?;
            if !canon.starts_with(&root_canon) {
                return Err(format!("Path escapes worktree root: {}", fp));
            }
        }
    }

    let mut all_diffs: Vec<WorktreeFileDiff> = Vec::new();

    // --- Unstaged diff (working tree vs HEAD) ---
    let mut unstaged_args: Vec<String> = vec![
        "-C".to_string(),
        worktree_path.clone(),
        "diff".to_string(),
        "HEAD".to_string(),
    ];
    if let Some(ref fp) = file_path {
        unstaged_args.push("--".to_string());
        unstaged_args.push(fp.clone());
    }

    let unstaged_out = Command::new("git")
        .args(&unstaged_args)
        .output()
        .map_err(|e| git_not_found_error(&e))?;

    if unstaged_out.status.success() {
        let text = String::from_utf8_lossy(&unstaged_out.stdout);
        let mut diffs = parse_diff_output(&text, "M");
        all_diffs.append(&mut diffs);
    }

    // --- Staged diff (index vs HEAD) ---
    let mut staged_args: Vec<String> = vec![
        "-C".to_string(),
        worktree_path.clone(),
        "diff".to_string(),
        "--cached".to_string(),
        "HEAD".to_string(),
    ];
    if let Some(ref fp) = file_path {
        staged_args.push("--".to_string());
        staged_args.push(fp.clone());
    }

    let staged_out = Command::new("git")
        .args(&staged_args)
        .output()
        .map_err(|e| git_not_found_error(&e))?;

    if staged_out.status.success() {
        let text = String::from_utf8_lossy(&staged_out.stdout);
        let staged_diffs = parse_diff_output(&text, "A");
        for d in staged_diffs {
            // Only add if not already present from unstaged
            if !all_diffs.iter().any(|e| e.file_path == d.file_path) {
                all_diffs.push(d);
            }
        }
    }

    Ok(all_diffs)
}

/// Canonicalize a filesystem path and return it (including `\\?\` prefix on
/// Windows). Returns an error if the path does not exist.
#[tauri::command]
pub fn canonicalize_path(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    let canonical = std::fs::canonicalize(&p)
        .map_err(|e| format!("Cannot canonicalize '{}': {}", path, e))?;
    Ok(canonical.to_string_lossy().to_string())
}
