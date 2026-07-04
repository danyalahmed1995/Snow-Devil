$c = Get-Content -Path src-tauri\src\commands\analytics.rs -Raw
$c = $c -replace '\.header\("Accept", "application/vnd\.github\+json"\)', '.header("Accept", "application/vnd.github+json")
        .timeout(std::time::Duration::from_secs(30))'
Set-Content -Path src-tauri\src\commands\analytics.rs -Value $c
