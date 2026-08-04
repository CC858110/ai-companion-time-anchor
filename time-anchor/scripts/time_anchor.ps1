$ErrorActionPreference = "Stop"

$statePath = Join-Path $env:USERPROFILE "Documents\Codex\.time-anchor\last_seen.json"
$stateDir = Split-Path -Parent $statePath
$now = [DateTimeOffset]::Now
$previous = $null

if (Test-Path -LiteralPath $statePath) {
    try {
        $raw = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8
        if ($raw) {
            $state = $raw | ConvertFrom-Json
            if ($state.now_local) {
                $previous = [DateTimeOffset]::Parse([string]$state.now_local)
            }
        }
    } catch {
        $previous = $null
    }
}

$elapsedSeconds = $null
$elapsedHuman = $null
if ($null -ne $previous) {
    $elapsedSeconds = [Math]::Round(($now - $previous).TotalSeconds, 3)
    $total = [Math]::Max(0, [int][Math]::Round($elapsedSeconds))
    $days = [Math]::Floor($total / 86400)
    $rem = $total % 86400
    $hours = [Math]::Floor($rem / 3600)
    $rem = $rem % 3600
    $minutes = [Math]::Floor($rem / 60)
    $seconds = $rem % 60
    $parts = @()
    if ($days -gt 0) { $parts += "${days}d" }
    if ($hours -gt 0) { $parts += "${hours}h" }
    if ($minutes -gt 0) { $parts += "${minutes}m" }
    if (($seconds -gt 0) -or ($parts.Count -eq 0)) { $parts += "${seconds}s" }
    $elapsedHuman = ($parts -join " ")
}

$payload = [ordered]@{
    now_local = $now.ToString("yyyy-MM-ddTHH:mm:sszzz")
    timezone = [System.TimeZoneInfo]::Local.Id
    utc_offset = $now.ToString("zzz")
    previous_local = if ($null -ne $previous) { $previous.ToString("yyyy-MM-ddTHH:mm:sszzz") } else { $null }
    elapsed_seconds = $elapsedSeconds
    elapsed_human = $elapsedHuman
    state_path = $statePath
}

$json = $payload | ConvertTo-Json -Compress
try {
    New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
    Set-Content -LiteralPath $statePath -Value $json -Encoding UTF8
} catch {
    # Time sensing must never block the response path.
}
Write-Output $json
