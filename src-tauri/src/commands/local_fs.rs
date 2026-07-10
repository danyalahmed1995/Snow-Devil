use std::path::{Path, PathBuf};
use std::process::Command;

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LocalEntry {
    pub name: String,
    /// Relative path from the worktree root (forward slashes)
    pub path: String,
    /// Absolute display path — `\\?\` stripped, forward slashes
    pub full_path: String,
    pub is_dir: bool,
    pub size_bytes: u64,
    pub is_symlink: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LocalFile {
    pub path: String,
    pub full_path: String,
    pub text: Option<String>,
    pub byte_size: u64,
    pub is_binary: bool,
    pub mime_hint: Option<String>,
    pub content_base64: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PathMeta {
    pub exists: bool,
    pub is_dir: bool,
    pub is_file: bool,
    pub is_symlink: bool,
    pub size_bytes: u64,
    pub canonical_path: String,
    pub display_path: String,
}

// ---------------------------------------------------------------------------
// Security helpers
// ---------------------------------------------------------------------------

/// Strip the Windows extended-path prefix `\\?\` and normalise to forward
/// slashes for display in the frontend.
pub fn strip_extended_prefix(path: &Path) -> String {
    let s = path.to_string_lossy();
    if s.starts_with(r"\\?\") {
        s[4..].replace('\\', "/")
    } else {
        s.replace('\\', "/")
    }
}

/// Safely join `rel` onto `root`, performing a canonicalization check to
/// prevent path traversal.
///
/// Returns the **canonical** (OS-level) absolute path on success.
fn safe_join(root: &Path, rel: &str) -> Result<PathBuf, String> {
    // 1. Reject obvious traversal patterns before touching the filesystem
    if rel.contains("../") || rel.contains("..\\") || rel.starts_with("..") || rel == ".." {
        return Err(format!("Path traversal rejected: {}", rel));
    }

    // 2. Join
    let joined = root.join(rel);

    // 3. Canonicalize (resolves symlinks and normalises the path)
    let canonical = std::fs::canonicalize(&joined)
        .map_err(|e| format!("Path not accessible: {}", e))?;

    // 4. Ensure the result is still inside root
    let canonical_root = std::fs::canonicalize(root)
        .map_err(|e| format!("Root path error: {}", e))?;

    if !canonical.starts_with(&canonical_root) {
        return Err(format!("Path escapes worktree root: {}", rel));
    }

    Ok(canonical)
}

// ---------------------------------------------------------------------------
// MIME hint helper
// ---------------------------------------------------------------------------

fn mime_hint_for_extension(ext: &str) -> Option<String> {
    match ext.to_ascii_lowercase().as_str() {
        "png" => Some("image/png".to_string()),
        "jpg" | "jpeg" => Some("image/jpeg".to_string()),
        "gif" => Some("image/gif".to_string()),
        "svg" => Some("image/svg+xml".to_string()),
        "webp" => Some("image/webp".to_string()),
        "ico" => Some("image/x-icon".to_string()),
        "bmp" => Some("image/bmp".to_string()),
        "avif" => Some("image/avif".to_string()),
        "pdf" => Some("application/pdf".to_string()),
        "zip" => Some("application/zip".to_string()),
        "gz" | "tar" => Some("application/octet-stream".to_string()),
        "wasm" => Some("application/wasm".to_string()),
        _ => None,
    }
}

/// Detect whether a byte slice is binary by looking for null bytes in the
/// first 8 KB.
fn is_binary_content(data: &[u8]) -> bool {
    let sample = &data[..data.len().min(8192)];
    sample.contains(&0u8)
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/// List the contents of a directory inside a worktree. Returns up to 2 000
/// entries (directories first, then files, both sorted alphabetically).
#[tauri::command]
pub fn list_local_directory(
    worktree_root: String,
    relative_path: String,
) -> Result<Vec<LocalEntry>, String> {
    let root = Path::new(&worktree_root);

    let canonical_dir = if relative_path.is_empty() || relative_path == "." || relative_path == "/" {
        std::fs::canonicalize(root).map_err(|e| format!("Root path error: {}", e))?
    } else {
        safe_join(root, &relative_path)?
    };

    let read = std::fs::read_dir(&canonical_dir)
        .map_err(|e| format!("Cannot read directory: {}", e))?;

    let canonical_root =
        std::fs::canonicalize(root).map_err(|e| format!("Root path error: {}", e))?;

    const MAX_ENTRIES: usize = 2000;
    let mut dirs: Vec<LocalEntry> = Vec::new();
    let mut files: Vec<LocalEntry> = Vec::new();
    let mut total = 0usize;

    for entry_result in read {
        let entry = match entry_result {
            Ok(e) => e,
            Err(e) => {
                // Represent the error as a sentinel entry rather than crashing
                files.push(LocalEntry {
                    name: format!("<error: {}>", e),
                    path: relative_path.clone(),
                    full_path: String::new(),
                    is_dir: false,
                    size_bytes: 0,
                    is_symlink: false,
                });
                continue;
            }
        };

        total += 1;
        if total > MAX_ENTRIES {
            // We'll add a truncation notice after the loop
            break;
        }

        let file_name = entry.file_name();
        let name = file_name.to_string_lossy().to_string();

        let meta = match entry.metadata() {
            Ok(m) => m,
            Err(e) => {
                files.push(LocalEntry {
                    name: format!("{} <stat error: {}>", name, e),
                    path: relative_path.clone(),
                    full_path: String::new(),
                    is_dir: false,
                    size_bytes: 0,
                    is_symlink: false,
                });
                continue;
            }
        };

        let is_symlink = meta.file_type().is_symlink();
        let is_dir = meta.is_dir();
        let size_bytes = if is_dir { 0 } else { meta.len() };

        // Build a relative path from the worktree root
        let abs_entry = entry.path();
        let rel_from_root = abs_entry
            .strip_prefix(&canonical_root)
            .map(|p| p.to_string_lossy().replace('\\', "/"))
            .unwrap_or_else(|_| name.clone());

        let display_full = strip_extended_prefix(&abs_entry);

        let local_entry = LocalEntry {
            name: name.clone(),
            path: rel_from_root,
            full_path: display_full,
            is_dir,
            size_bytes,
            is_symlink,
        };

        if is_dir {
            dirs.push(local_entry);
        } else {
            files.push(local_entry);
        }
    }

    dirs.sort_by(|a, b| a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()));
    files.sort_by(|a, b| a.name.to_ascii_lowercase().cmp(&b.name.to_ascii_lowercase()));

    let mut result = dirs;
    result.append(&mut files);

    if total > MAX_ENTRIES {
        result.push(LocalEntry {
            name: format!("<truncated: showing {} of {} entries>", MAX_ENTRIES, total),
            path: relative_path,
            full_path: String::new(),
            is_dir: false,
            size_bytes: 0,
            is_symlink: false,
        });
    }

    Ok(result)
}

/// Read a file inside a worktree. Text files are returned as UTF-8 strings;
/// binary/image files are base64-encoded.
#[tauri::command]
pub fn read_local_file(
    worktree_root: String,
    relative_path: String,
) -> Result<LocalFile, String> {
    let root = Path::new(&worktree_root);
    let canonical = safe_join(root, &relative_path)?;

    if canonical.is_dir() {
        return Err(format!("Path is a directory, not a file: {}", relative_path));
    }

    let byte_size = std::fs::metadata(&canonical)
        .map(|m| m.len())
        .unwrap_or(0);

    let ext = canonical
        .extension()
        .map(|e| e.to_string_lossy().to_string())
        .unwrap_or_default();

    let mime_hint = mime_hint_for_extension(&ext);
    let display_full = strip_extended_prefix(&canonical);
    let rel_display = relative_path.replace('\\', "/");

    // Read first 8 KB to probe for binary content
    let probe_limit = 8192usize;
    let mut f = std::fs::File::open(&canonical)
        .map_err(|e| format!("Cannot open file: {}", e))?;

    use std::io::Read;
    let mut probe_buf = vec![0u8; probe_limit.min(byte_size as usize)];
    let probe_len = probe_buf.len().min(byte_size as usize);
    f.read_exact(&mut probe_buf[..probe_len])
        .map_err(|e| format!("Cannot read file: {}", e))?;

    let is_binary = is_binary_content(&probe_buf);

    if is_binary || mime_hint.as_deref().map_or(false, |m| m.starts_with("image/") || m == "application/pdf") {
        // Binary path: read up to 10 MB and base64-encode
        const BINARY_LIMIT: u64 = 10 * 1024 * 1024;
        let read_len = byte_size.min(BINARY_LIMIT) as usize;

        // Re-open to read from start
        let raw = std::fs::read(&canonical)
            .map_err(|e| format!("Cannot read binary file: {}", e))?;
        let truncated = &raw[..raw.len().min(read_len)];

        use base64::Engine as _;
        let encoded = base64::engine::general_purpose::STANDARD.encode(truncated);

        Ok(LocalFile {
            path: rel_display,
            full_path: display_full,
            text: None,
            byte_size,
            is_binary: true,
            mime_hint,
            content_base64: Some(encoded),
        })
    } else {
        // Text path: read up to 2 MB
        const TEXT_LIMIT: u64 = 2 * 1024 * 1024;
        let read_len = byte_size.min(TEXT_LIMIT) as usize;
        let raw = std::fs::read(&canonical)
            .map_err(|e| format!("Cannot read text file: {}", e))?;
        let truncated = &raw[..raw.len().min(read_len)];
        let text = String::from_utf8_lossy(truncated).into_owned();

        Ok(LocalFile {
            path: rel_display,
            full_path: display_full,
            text: Some(text),
            byte_size,
            is_binary: false,
            mime_hint,
            content_base64: None,
        })
    }
}

/// Stat a path inside a worktree. Returns `exists=false` rather than an error
/// if the path simply doesn't exist.
#[tauri::command]
pub fn stat_local_path(
    worktree_root: String,
    relative_path: String,
) -> Result<PathMeta, String> {
    let root = Path::new(&worktree_root);

    // Reject obvious traversal before even touching the filesystem
    if relative_path.contains("../")
        || relative_path.contains("..\\")
        || relative_path.starts_with("..")
        || relative_path == ".."
    {
        return Err(format!("Path traversal rejected: {}", relative_path));
    }

    let joined = root.join(&relative_path);

    // Check existence first; return PathMeta{exists:false} rather than error
    if !joined.exists() {
        let canonical_root = std::fs::canonicalize(root)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| worktree_root.clone());
        let display_root = {
            let p = PathBuf::from(&canonical_root);
            strip_extended_prefix(&p)
        };
        return Ok(PathMeta {
            exists: false,
            is_dir: false,
            is_file: false,
            is_symlink: false,
            size_bytes: 0,
            canonical_path: canonical_root,
            display_path: display_root,
        });
    }

    // Full canonicalization + containment check
    let canonical = std::fs::canonicalize(&joined)
        .map_err(|e| format!("Cannot canonicalize path: {}", e))?;
    let canonical_root = std::fs::canonicalize(root)
        .map_err(|e| format!("Root path error: {}", e))?;

    if !canonical.starts_with(&canonical_root) {
        return Err(format!("Path escapes worktree root: {}", relative_path));
    }

    let meta = std::fs::symlink_metadata(&canonical)
        .map_err(|e| format!("Cannot stat path: {}", e))?;

    let is_symlink = meta.file_type().is_symlink();
    let is_dir = meta.is_dir();
    let is_file = meta.is_file();
    let size_bytes = if is_file { meta.len() } else { 0 };

    let canonical_str = canonical.to_string_lossy().to_string();
    let display = strip_extended_prefix(&canonical);

    Ok(PathMeta {
        exists: true,
        is_dir,
        is_file,
        is_symlink,
        size_bytes,
        canonical_path: canonical_str,
        display_path: display,
    })
}

/// Open a path in the OS file manager. On Windows this uses `explorer.exe`,
/// on macOS `open -R`, on Linux `xdg-open`.
#[tauri::command]
pub fn open_path_in_file_manager(path: String) -> Result<(), String> {
    if path.is_empty() {
        return Err("Path must not be empty".to_string());
    }

    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("explorer.exe")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }

    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }

    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
    }

    Ok(())
}

/// Open a file or directory in an external editor.
///
/// If `editor_command` is `Some`, that command is used directly. Otherwise
/// common editors are tried in order: code, cursor, windsurf, zed, subl, atom.
#[tauri::command]
pub fn open_in_external_editor(path: String, editor_command: Option<String>) -> Result<(), String> {
    if path.is_empty() {
        return Err("Path must not be empty".to_string());
    }

    if let Some(cmd) = editor_command {
        Command::new(&cmd)
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to launch editor '{}': {}", cmd, e))?;
        return Ok(());
    }

    // Try known editors in preference order
    #[cfg(target_os = "windows")]
    let candidates = [
        "code.cmd",
        "code",
        "cursor.cmd",
        "cursor",
        "windsurf.cmd",
        "windsurf",
        "zed",
        "subl",
        "atom",
    ];

    #[cfg(not(target_os = "windows"))]
    let candidates = ["code", "cursor", "windsurf", "zed", "subl", "atom"];

    for editor in candidates {
        let result = Command::new(editor).arg(&path).spawn();
        if result.is_ok() {
            return Ok(());
        }
    }

    Err("No editor found. Configure an editor in settings.".to_string())
}
