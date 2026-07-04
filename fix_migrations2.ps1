$c = Get-Content -Path src-tauri\src\db\migrations.rs -Raw
$c = $c -replace '        \)\?\;\n    if current_version < 7 \{', '        )?;
    }
    if current_version < 7 {'
Set-Content -Path src-tauri\src\db\migrations.rs -Value $c
