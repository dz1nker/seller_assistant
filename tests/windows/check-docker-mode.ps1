$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

# Execute the actual check from the launcher against native Docker CLI fixtures.
# On Windows use Windows PowerShell 5.1, as the .cmd launcher does.
$launcher = Join-Path $PSScriptRoot '../../START_WINDOWS.cmd'
$prefix = 'powershell.exe -NoProfile -Command "'
$lines = @([IO.File]::ReadAllLines($launcher) | Where-Object { $_.StartsWith($prefix + '$modeOutput=') })
if ($lines.Count -ne 1) { throw 'Expected exactly one Docker mode check in START_WINDOWS.cmd' }
$check = $lines[0].Substring($prefix.Length, $lines[0].Length - $prefix.Length - 1)
$windowsHost = $env:OS -eq 'Windows_NT'
if ($windowsHost) {
    $engine = Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
} else {
    $engine = (Get-Process -Id $PID).Path
}

$cases = @(
    @{ Name = 'Linux with CRLF'; Output = "linux`r`n"; NativeExit = 0; Expected = 0 },
    @{ Name = 'Linux with LF'; Output = "linux`n"; NativeExit = 0; Expected = 0 },
    @{ Name = 'Linux without newline'; Output = 'linux'; NativeExit = 0; Expected = 0 },
    @{ Name = 'Linux with surrounding whitespace'; Output = "  linux `r`n"; NativeExit = 0; Expected = 0 },
    @{ Name = 'Case insensitive Linux'; Output = "LINUX`n"; NativeExit = 0; Expected = 0 },
    @{ Name = 'Actual Windows engine'; Output = "windows`r`n"; NativeExit = 0; Expected = 10 },
    @{ Name = 'Empty mode is not Windows'; Output = ''; NativeExit = 0; Expected = 30 },
    @{ Name = 'Unknown mode is not Windows'; Output = "unavailable`n"; NativeExit = 0; Expected = 30 },
    @{ Name = 'CLI failure is not Windows'; Output = ''; NativeExit = 1; Expected = 20 },
    @{ Name = 'CLI failure cannot approve stale Linux text'; Output = "linux`n"; NativeExit = 1; Expected = 20 }
)

$originalPath = $env:PATH
$temp = Join-Path ([IO.Path]::GetTempPath()) ('Sales launcher tests ' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $temp
$utf8 = New-Object Text.UTF8Encoding($false)
try {
    foreach ($case in $cases) {
        [IO.File]::WriteAllText((Join-Path $temp 'stdout.txt'), $case.Output, $utf8)
        if ($windowsHost) {
            $stub = "@echo off`r`ntype `"%~dp0stdout.txt`"`r`nexit /b " + $case.NativeExit + "`r`n"
            [IO.File]::WriteAllText((Join-Path $temp 'docker.cmd'), $stub, $utf8)
        } else {
            $stub = '#!/bin/sh' + "`n" + 'cat "$(dirname "$0")/stdout.txt"' + "`nexit " + $case.NativeExit + "`n"
            $stubPath = Join-Path $temp 'docker'
            [IO.File]::WriteAllText($stubPath, $stub, $utf8)
            & chmod +x $stubPath
            if ($LASTEXITCODE -ne 0) { throw 'Cannot prepare native CLI fixture' }
        }
        $env:PATH = $temp + [IO.Path]::PathSeparator + $originalPath
        $output = @(& $engine -NoProfile -NonInteractive -Command $check 2>&1)
        $actual = $LASTEXITCODE
        if ($actual -ne $case.Expected) {
            throw ($case.Name + ': expected exit ' + $case.Expected + ', received ' + $actual + '; ' + ($output -join ' '))
        }
        Write-Host ('PASS: ' + $case.Name)
    }
} finally {
    $env:PATH = $originalPath
    Remove-Item -LiteralPath $temp -Recurse -Force
}
Write-Host ('Passed ' + $cases.Count + ' Docker mode scenarios using ' + $engine)
