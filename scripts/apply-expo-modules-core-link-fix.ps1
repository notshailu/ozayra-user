$cmakePath = Join-Path $PSScriptRoot "..\\node_modules\\expo-modules-core\\android\\CMakeLists.txt"
$cmakePath = [System.IO.Path]::GetFullPath($cmakePath)

if (-not (Test-Path -LiteralPath $cmakePath)) {
  exit 0
}

$source = Get-Content -LiteralPath $cmakePath -Raw
$needle = "  CommonSettings`n"
$insertion = "  CommonSettings`n  c++_shared`n"

if ($source.Contains("  c++_shared`n")) {
  exit 0
}

if (-not $source.Contains($needle)) {
  Write-Error "Expected marker not found in $cmakePath"
  exit 1
}

$updated = $source.Replace($needle, $insertion)
Set-Content -LiteralPath $cmakePath -Value $updated -NoNewline
Write-Output "Applied expo-modules-core C++ shared runtime link fix."
