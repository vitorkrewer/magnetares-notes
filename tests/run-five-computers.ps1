$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $repositoryRoot "tests")

go test -v -count=1 -timeout=2m .
