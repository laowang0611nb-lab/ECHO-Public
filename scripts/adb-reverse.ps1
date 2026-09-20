param(
    [int]$ApiPort = 8000,
    [int]$HostApiPort = 0,
    [int]$MetroPort = 8081,
    [string]$AdbPath = "adb"
)

if ($HostApiPort -le 0) {
    $HostApiPort = $ApiPort
}

$adb = Get-Command $AdbPath -ErrorAction SilentlyContinue
if (-not $adb) {
    $fallback = "F:\RoleChat-Android\sdk\platform-tools\adb.exe"
    if (Test-Path -LiteralPath $fallback) {
        $adb = Get-Item -LiteralPath $fallback
    }
}

if (-not $adb) {
    throw "adb was not found. Install Android platform-tools or pass -AdbPath."
}

$adbExecutable = if ($adb.Source) { $adb.Source } else { $adb.FullName }

& $adbExecutable start-server
& $adbExecutable reverse "tcp:$ApiPort" "tcp:$HostApiPort"
& $adbExecutable reverse "tcp:$MetroPort" "tcp:$MetroPort"
& $adbExecutable reverse --list
