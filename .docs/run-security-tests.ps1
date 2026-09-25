# =====================================================================
# SentinelPH Security Testing Script — PS 5.1 Compatible
# Run from: C:\Users\Kimmy\Project\sentinelph
# =====================================================================

$API     = "https://sentinelph-api.onrender.com"
$AI      = "https://sentinelph-ai.onrender.com"
$WEB     = "https://sentinelph-web-gamma.vercel.app"
$API_KEY = "1Bpb6PzVHnyFdlxjWNa2MCEigmoJOSDI"
$OUT     = "docs\evidence\security-tests"

New-Item -ItemType Directory -Force -Path $OUT | Out-Null

# Helper: HTTP call that never throws on 4xx/5xx
function Invoke-Api {
    param(
        [Parameter(Mandatory=$true)][string]$Uri,
        [string]$Method = "GET",
        [hashtable]$Headers = @{},
        [string]$Body = $null,
        [string]$ContentType = "application/json"
    )
    try {
        $params = @{
            Uri = $Uri
            Method = $Method
            Headers = $Headers
            ContentType = $ContentType
            UseBasicParsing = $true
        }
        if ($Body) { $params.Body = $Body }
        $r = Invoke-WebRequest @params
        return [pscustomobject]@{ StatusCode = [int]$r.StatusCode; Body = $r.Content }
    } catch [System.Net.WebException] {
        $resp = $_.Exception.Response
        if ($resp) {
            $stream = $resp.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            return [pscustomobject]@{
                StatusCode = [int]$resp.StatusCode
                Body = $reader.ReadToEnd()
            }
        }
        return [pscustomobject]@{ StatusCode = 0; Body = $_.Exception.Message }
    } catch {
        return [pscustomobject]@{ StatusCode = 0; Body = $_.Exception.Message }
    }
}

# =====================================================================
# ROW 1 — Input Validation
# =====================================================================
Write-Host "[1] Input validation" -ForegroundColor Cyan
$body = '{"token":"short","newPassword":"weak"}'
$resp = Invoke-Api -Uri "$API/api/v1/auth/confirm-password-reset" `
    -Method Post -Body $body

$report = @"
=== Row 1 — Input Validation ===
Request: POST $API/api/v1/auth/confirm-password-reset
Body: $body

Expected: 400 VALIDATION_ERROR with field "token"
Actual Status: $($resp.StatusCode)
Actual Body:
$($resp.Body)
"@
$report | Tee-Object "$OUT\01-invalid-registration.txt"

# =====================================================================
# ROW 2 — NoSQL Injection
# =====================================================================
Write-Host "[2] NoSQL injection" -ForegroundColor Cyan
$body = '{"email":{"$gt":""},"password":"anything"}'
$resp = Invoke-Api -Uri "$API/api/v1/auth/request-password-otp" `
    -Method Post -Body $body

$report = @"
=== Row 2 — NoSQL Injection ===
Request: POST $API/api/v1/auth/request-password-otp
Body: $body

Expected: 400 (or non-bypass response). Never a login success.
Actual Status: $($resp.StatusCode)
Actual Body:
$($resp.Body)
"@
$report | Tee-Object "$OUT\09-nosql-injection.txt"

# =====================================================================
# ROW 4 — Authentication
# =====================================================================
Write-Host "[4a] Auth — no token" -ForegroundColor Cyan
$resp = Invoke-Api -Uri "$API/api/v1/reports" -Method Get
$report = @"
=== Row 4a — No JWT ===
Request: GET $API/api/v1/reports (no Authorization header)

Expected: 401 UNAUTHORIZED
Actual Status: $($resp.StatusCode)
Actual Body:
$($resp.Body)
"@
$report | Tee-Object "$OUT\04-missing-jwt.txt"

Write-Host "[4b] Auth — invalid token" -ForegroundColor Cyan
$h = @{ "Authorization" = "Bearer not-a-real-jwt" }
$resp = Invoke-Api -Uri "$API/api/v1/reports" -Method Get -Headers $h
$report = @"
=== Row 4b — Invalid JWT ===
Request: GET $API/api/v1/reports with Authorization: Bearer not-a-real-jwt

Expected: 401 UNAUTHORIZED
Actual Status: $($resp.StatusCode)
Actual Body:
$($resp.Body)
"@
$report | Tee-Object "$OUT\05-invalid-jwt.txt"

# =====================================================================
# ROW 7 — Secure Error Handling
# =====================================================================
Write-Host "[7] Error handling" -ForegroundColor Cyan
$body = '{"email":"not-an-email"}'
$resp = Invoke-Api -Uri "$API/api/v1/auth/request-password-otp" `
    -Method Post -Body $body

$report = @"
=== Row 7 — Secure Error Handling ===
Request: POST $API/api/v1/auth/request-password-otp
Body: $body

Expected: 400 VALIDATION_ERROR, no stack trace
Actual Status: $($resp.StatusCode)
Actual Body:
$($resp.Body)
"@
$report | Tee-Object "$OUT\02-invalid-login.txt"

# =====================================================================
# ROW 8 — Security Headers
# =====================================================================
Write-Host "[8] Security headers" -ForegroundColor Cyan
$headersReport = "=== Row 8 — Security Headers ===`n"
foreach ($svc in @($WEB, $API, $AI)) {
    $headersReport += "`n--- $svc ---`n"
    try {
        $r = Invoke-WebRequest -Uri $svc -Method Head -UseBasicParsing
        foreach ($k in $r.Headers.Keys) {
            if ($k -match "strict-transport|x-content-type|x-frame|content-security|referrer-policy") {
                $headersReport += "$k : $($r.Headers[$k])`n"
            }
        }
    } catch {
        $headersReport += "ERROR: $($_.Exception.Message)`n"
    }
}
$headersReport | Tee-Object "$OUT\12-headers.txt"

# =====================================================================
# ROW 9 — Rate Limiting (AI endpoint)
# =====================================================================
Write-Host "[9] Rate limiting (AI endpoint)" -ForegroundColor Cyan
$h = @{ "X-API-KEY" = $API_KEY }
$body = '{"text":"test"}'
$results = @()
foreach ($i in 1..15) {
    $resp = Invoke-Api -Uri "$AI/predict" -Method Post -Headers $h -Body $body
    $results += "Request $i -> $($resp.StatusCode)"
}
$results | Tee-Object "$OUT\08-rate-limit.txt"

# =====================================================================
# ROW 10 — Environment Variables
# =====================================================================
Write-Host "[10] Env hygiene" -ForegroundColor Cyan
$envReport = "=== Row 10 — Environment Variables ===`n`n"
$envReport += "--- .env files MUST be ignored (should print path) ---`n"
$envReport += (git check-ignore services/api/.env) + "`n"
$envReport += (git check-ignore apps/web/.env) + "`n"
$envReport += (git check-ignore apps/mobile/.env) + "`n"
$envReport += (git check-ignore services/ai/.env) + "`n"
$envReport += "`n--- .env.example MUST be tracked (should print nothing) ---`n"
$envReport += (git check-ignore services/api/.env.example) + "`n"
$envReport += "`n--- Templates present ---`n"
$envReport += (Get-ChildItem -Recurse -Filter ".env.example" | Select-Object -ExpandProperty FullName) -join "`n"
$envReport | Tee-Object "$OUT\13-env-hygiene.txt"

# =====================================================================
# ROW 11 — HTTPS / TLS
# =====================================================================
Write-Host "[11] HTTPS / TLS" -ForegroundColor Cyan
$httpsReport = "=== Row 11 — HTTPS / TLS ===`n"
foreach ($svc in @($WEB, $API, $AI)) {
    $httpsReport += "`n--- $svc ---`n"
    $httpsReport += (curl.exe -I $svc 2>$null | Select-String "HTTP/|strict-transport")
}
$httpsReport += "`n--- HTTP -> HTTPS redirect ---`n"
$httpsReport += (curl.exe -I "http://sentinelph-api.onrender.com" 2>$null | Select-String "HTTP/|location:")
$httpsReport | Tee-Object "$OUT\14-https-headers.txt"

# =====================================================================
# ROW 12 — MongoDB URI scheme
# =====================================================================
Write-Host "[12] MongoDB URI scheme" -ForegroundColor Cyan
$mongoLine = (Select-String -Path "services\api\.env" -Pattern "MONGO_URI").Line
# Mask the password for the evidence file
$maskedLine = $mongoLine -replace '://[^:]+:[^@]+@', '://USER:PASSWORD@'
$mongoReport = @"
=== Row 12 — MongoDB Security ===
MONGO_URI (password masked): $maskedLine

Expected: scheme must be 'mongodb+srv://' (TLS-enforced)
"@
$mongoReport | Tee-Object "$OUT\15-mongodb-uri.txt"

# =====================================================================
# ROW 13 — AI Microservice API Key
# =====================================================================
Write-Host "[13] AI API key" -ForegroundColor Cyan
$body = '{"text":"test message"}'

# Test A — no key
$respA = Invoke-Api -Uri "$AI/predict" -Method Post -Body $body
$reportA = @"
=== Row 13a — AI no API key ===
Request: POST $AI/predict (no X-API-KEY header)

Expected: 401 Unauthorized
Actual Status: $($respA.StatusCode)
Actual Body:
$($respA.Body)
"@
$reportA | Tee-Object "$OUT\16-ai-apikey-missing.txt"

# Test B — wrong key
$hBad = @{ "X-API-KEY" = "wrong-key-abc123" }
$respB = Invoke-Api -Uri "$AI/predict" -Method Post -Headers $hBad -Body $body
$reportB = @"
=== Row 13b — AI wrong API key ===
Request: POST $AI/predict with X-API-KEY: wrong-key-abc123

Expected: 401 Unauthorized
Actual Status: $($respB.StatusCode)
Actual Body:
$($respB.Body)
"@
$reportB | Tee-Object "$OUT\16-ai-apikey-wrong.txt"

# Test C — correct key
$hGood = @{ "X-API-KEY" = $API_KEY }
$respC = Invoke-Api -Uri "$AI/predict" -Method Post -Headers $hGood -Body $body
$reportC = @"
=== Row 13c — AI correct API key ===
Request: POST $AI/predict with valid X-API-KEY

Expected: 200 with 3-class label
Actual Status: $($respC.StatusCode)
Actual Body:
$($respC.Body)
"@
$reportC | Tee-Object "$OUT\16-ai-apikey-valid.txt"

# =====================================================================
# Summary
# =====================================================================
Write-Host "`n=== Evidence files produced ===" -ForegroundColor Green
Get-ChildItem $OUT | Select-Object Name, Length | Format-Table -AutoSize