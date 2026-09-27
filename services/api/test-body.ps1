# services/api/test-body.ps1
# Usage: .\test-body.ps1 <url> <method> <json-body> [optional-token]

param(
    [Parameter(Mandatory=$true)][string]$Url,
    [Parameter(Mandatory=$true)][string]$Method,
    [Parameter(Mandatory=$true)][string]$Body,
    [Parameter(Mandatory=$false)][string]$Token = ""
)

# Write body to a temp file
$bodyFile = [System.IO.Path]::GetTempFileName()
[System.IO.File]::WriteAllText($bodyFile, $Body, [System.Text.UTF8Encoding]::new($false))

# Build curl args
$curlArgs = @('-i', '-X', $Method, $Url, '-H', 'Content-Type: application/json', '--data-binary', "@$bodyFile")
if ($Token) {
    $curlArgs += @('-H', "Authorization: Bearer $Token")
}

# Run
& curl.exe @curlArgs

# Cleanup
Remove-Item $bodyFile -ErrorAction SilentlyContinue