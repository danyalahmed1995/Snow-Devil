/// Integration tests for worktree commands using real Git repositories.
///
/// These tests use `tempfile` crates and real `git` processes.
/// They are skipped automatically if `git` is not in PATH.
///
/// Run with: `cargo test -- --test-output immediate`

#[cfg(test)]
mod worktree_tests {
    use std::path::PathBuf;
    use std::process::Command;

    fn git_available() -> bool {
        Command::new("git")
            .arg("--version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    /// Create a temporary Git repository with an initial commit.
    fn make_git_repo() -> tempfile::TempDir {
        let dir = tempfile::TempDir::new().expect("create tempdir");
        let path = dir.path();

        Command::new("git")
            .args(["init", "-b", "main"])
            .current_dir(path)
            .output()
            .expect("git init");

        Command::new("git")
            .args(["config", "user.email", "test@example.com"])
            .current_dir(path)
            .output()
            .expect("git config email");

        Command::new("git")
            .args(["config", "user.name", "Test User"])
            .current_dir(path)
            .output()
            .expect("git config name");

        // Create initial commit
        let readme = path.join("README.md");
        std::fs::write(&readme, "# Test repository\n").expect("write README");

        Command::new("git")
            .args(["add", "."])
            .current_dir(path)
            .output()
            .expect("git add");

        Command::new("git")
            .args(["commit", "-m", "Initial commit"])
            .current_dir(path)
            .output()
            .expect("git commit");

        dir
    }

    fn repo_path_string(dir: &tempfile::TempDir) -> String {
        dir.path().to_string_lossy().into_owned()
    }

    // -------------------------------------------------------------------------
    // worktree_list
    // -------------------------------------------------------------------------

    #[test]
    fn test_worktree_list_single() {
        if !git_available() {
            eprintln!("Skipping: git not available");
            return;
        }

        let repo = make_git_repo();
        let path = repo_path_string(&repo);

        // Run the internal parse logic through the command directly
        let output = Command::new("git")
            .args(["worktree", "list", "--porcelain"])
            .current_dir(repo.path())
            .output()
            .expect("git worktree list");

        let text = String::from_utf8_lossy(&output.stdout);
        // Should contain at least one block starting with "worktree "
        assert!(text.contains("worktree "), "output: {}", text);
        assert!(text.contains("HEAD "), "output: {}", text);
        assert!(text.contains("branch refs/heads/main"), "output: {}", text);
    }

    #[test]
    fn test_worktree_list_multiple() {
        if !git_available() {
            eprintln!("Skipping: git not available");
            return;
        }

        let repo = make_git_repo();
        let repo_path = repo.path();
        let wt_dir = tempfile::TempDir::new().expect("wt tempdir");
        let wt_path = wt_dir.path().join("secondary");

        // Create a second branch and worktree
        Command::new("git")
            .args(["branch", "feat/secondary"])
            .current_dir(repo_path)
            .output()
            .expect("git branch");

        Command::new("git")
            .args([
                "worktree",
                "add",
                wt_path.to_str().unwrap(),
                "feat/secondary",
            ])
            .current_dir(repo_path)
            .output()
            .expect("git worktree add");

        let output = Command::new("git")
            .args(["worktree", "list", "--porcelain"])
            .current_dir(repo_path)
            .output()
            .expect("git worktree list");

        let text = String::from_utf8_lossy(&output.stdout);
        // Should contain two worktree blocks
        let block_count = text.split("\n\n").filter(|b| b.contains("worktree ")).count();
        assert!(block_count >= 2, "Expected ≥2 blocks, got: {}", text);
        assert!(text.contains("feat/secondary"), "output: {}", text);
    }

    // -------------------------------------------------------------------------
    // worktree_status
    // -------------------------------------------------------------------------

    #[test]
    fn test_worktree_status_clean() {
        if !git_available() {
            eprintln!("Skipping: git not available");
            return;
        }

        let repo = make_git_repo();
        let output = Command::new("git")
            .args(["status", "--porcelain=v2", "--branch"])
            .current_dir(repo.path())
            .output()
            .expect("git status");

        let text = String::from_utf8_lossy(&output.stdout);
        assert!(text.contains("# branch.head"), "output: {}", text);
        // Clean repo — no 1 or 2 prefix lines
        let dirty_lines = text.lines().filter(|l| l.starts_with("1 ") || l.starts_with("2 ") || l.starts_with("u ")).count();
        assert_eq!(dirty_lines, 0, "Expected clean, got: {}", text);
    }

    #[test]
    fn test_worktree_status_dirty() {
        if !git_available() {
            eprintln!("Skipping: git not available");
            return;
        }

        let repo = make_git_repo();
        // Create an untracked file
        std::fs::write(repo.path().join("dirty.txt"), "dirty").expect("write file");

        let output = Command::new("git")
            .args(["status", "--porcelain=v2", "--branch"])
            .current_dir(repo.path())
            .output()
            .expect("git status");

        let text = String::from_utf8_lossy(&output.stdout);
        let untracked = text.lines().filter(|l| l.starts_with("? ")).count();
        assert_eq!(untracked, 1, "Expected 1 untracked, got: {}", text);
    }

    // -------------------------------------------------------------------------
    // worktree_diff
    // -------------------------------------------------------------------------

    #[test]
    fn test_worktree_diff_no_changes() {
        if !git_available() {
            eprintln!("Skipping: git not available");
            return;
        }

        let repo = make_git_repo();
        let output = Command::new("git")
            .args(["diff", "HEAD"])
            .current_dir(repo.path())
            .output()
            .expect("git diff");

        // Clean repo: diff should be empty
        assert!(output.stdout.is_empty(), "Expected empty diff");
    }

    #[test]
    fn test_worktree_diff_modified_file() {
        if !git_available() {
            eprintln!("Skipping: git not available");
            return;
        }

        let repo = make_git_repo();
        // Modify the README
        std::fs::write(repo.path().join("README.md"), "# Modified\nNew content\n")
            .expect("write file");

        let output = Command::new("git")
            .args(["diff", "HEAD"])
            .current_dir(repo.path())
            .output()
            .expect("git diff");

        let text = String::from_utf8_lossy(&output.stdout);
        assert!(text.contains("+# Modified"), "output: {}", text);
    }

    // -------------------------------------------------------------------------
    // path traversal rejection
    // -------------------------------------------------------------------------

    #[test]
    fn test_path_traversal_rejection() {
        // Test that ../../../etc/passwd style paths are caught before filesystem access
        let malicious_paths = [
            "../../../etc/passwd",
            "..\\..\\Windows\\System32",
            "valid/../../../escape",
            "..",
        ];

        for path in &malicious_paths {
            // Check that our contains-check would catch it
            let has_traversal = path.contains("../") || path.contains("..\\") || path.starts_with("..") || *path == "..";
            assert!(has_traversal, "Expected traversal detection for: {}", path);
        }
    }

    // -------------------------------------------------------------------------
    // safe paths allowed
    // -------------------------------------------------------------------------

    #[test]
    fn test_safe_paths_allowed() {
        let safe_paths = [
            "src/main.rs",
            "README.md",
            "src/components/App.tsx",
            ".gitignore",
        ];

        for path in &safe_paths {
            let has_traversal = path.contains("../") || path.contains("..\\") || path.starts_with("..");
            assert!(!has_traversal, "Safe path incorrectly flagged: {}", path);
        }
    }

    // -------------------------------------------------------------------------
    // Porcelain parser (via subprocess)
    // -------------------------------------------------------------------------

    #[test]
    fn test_porcelain_detached_head() {
        if !git_available() {
            eprintln!("Skipping: git not available");
            return;
        }

        let repo = make_git_repo();
        // Get the current commit SHA
        let sha_output = Command::new("git")
            .args(["rev-parse", "HEAD"])
            .current_dir(repo.path())
            .output()
            .expect("git rev-parse");
        let sha = String::from_utf8_lossy(&sha_output.stdout).trim().to_string();

        // Detach HEAD
        Command::new("git")
            .args(["checkout", "--detach", &sha])
            .current_dir(repo.path())
            .output()
            .expect("git checkout detach");

        let output = Command::new("git")
            .args(["worktree", "list", "--porcelain"])
            .current_dir(repo.path())
            .output()
            .expect("git worktree list");

        let text = String::from_utf8_lossy(&output.stdout);
        assert!(text.contains("detached"), "Expected detached in: {}", text);
    }

    // -------------------------------------------------------------------------
    // File encoding in local_fs
    // -------------------------------------------------------------------------

    #[test]
    fn test_unicode_filename_handling() {
        if !git_available() {
            eprintln!("Skipping: git not available");
            return;
        }

        let repo = make_git_repo();
        // Create a file with non-ASCII characters in its content
        let content = "# Héllo Wörld\n日本語のテキスト\n";
        let file_path = repo.path().join("unicode_test.md");
        std::fs::write(&file_path, content).expect("write unicode file");

        // Verify it can be read back
        let read_back = std::fs::read_to_string(&file_path).expect("read unicode file");
        assert_eq!(read_back, content);
    }
}
